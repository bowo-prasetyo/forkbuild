import { SnapshotPlacementCreationOutcome } from './SnapshotPlacementCreationOutcome.js';

// 0.8.18 — Decentralized Snapshot Placement Foundation.
//
// The placement-side counterpart of application/
// CreateExternalPublicationAnchorUseCase.js (0.8.10), mirrored
// deliberately — connective tissue between a locally published
// snapshot's own bytes and a real, pluggable content/ContentStore.js
// backend, and nothing more:
//
//   publicationId, storage
//         │
//         ▼
//   CreateExternalSnapshotPlacementUseCase.execute()   (THIS FILE)
//         │
//         ├── publication lookup      — discoveryProvider
//         ├── local integrity check   — contentResolver.verify()
//         ├── store selection         — SnapshotPlacementStoreRegistry
//         ├── local bytes retrieval   — contentResolver.resolve()
//         ├── store.put(bytes)
//         └── CreatePublicationSnapshotPlacementUseCase.execute(...)
//                   │
//                   ▼
//            signed, cataloged PublicationSnapshotPlacement
//
// REUSES; NEVER RE-IMPLEMENTS. This class never constructs a core/
// PublicationSnapshotPlacement.js itself, never signs anything, and
// never touches a placement catalog directly — every one of those
// responsibilities stays exactly where application/
// CreatePublicationSnapshotPlacementUseCase.js already puts them. It
// also never re-serializes or re-validates the snapshot itself —
// `contentResolver` (the same collaborator application/
// ResolvePublicationUseCase.js already depends on) is the one and only
// place this codebase reads a published snapshot's own bytes back.
//
// STORE FAILURE PREVENTS PLACEMENT CREATION. A store that cannot
// presently place the bytes never reaches application/
// CreatePublicationSnapshotPlacementUseCase.js at all — see application/
// SnapshotPlacementCreationOutcome.js's own header. ForkBuild is
// deliberately claiming that a real placement operation it just
// requested succeeded; if that operation never happened, creating a
// corresponding claim would misrepresent it.
//
// NO AUTOMATIC RETRY. `store.put()` is called exactly once per
// `execute()` call. A caller that gets back PLACEMENT_UNAVAILABLE decides
// for itself whether and when to call `execute()` again.
//
// NO DEDUPLICATION, NO "ALREADY PLACED" CHECK. Placing the same
// publication on the same storage backend twice produces two
// independent, equally valid PublicationSnapshotPlacement records — two
// separate placement operations really did happen (perhaps at two
// different locators, if the backend does not itself deduplicate
// identical content). This class never inspects the placement catalog
// for an existing placement before placing, and never refuses to create
// a second one.
//
// NO "PREFERRED" STORAGE BACKEND. `storage` is always supplied by the
// caller, explicitly. This class never falls back from one storage
// backend to another, never ranks registered stores, and never picks one
// on the caller's behalf.
export class CreateExternalSnapshotPlacementUseCase {
    constructor(discoveryProvider, contentResolver, storeRegistry, createPublicationSnapshotPlacementUseCase) {
        if (!discoveryProvider) {
            throw new Error('CreateExternalSnapshotPlacementUseCase: a publication discovery provider is required');
        }
        if (!contentResolver) {
            throw new Error('CreateExternalSnapshotPlacementUseCase: a content resolver is required');
        }
        if (!storeRegistry || typeof storeRegistry.get !== 'function') {
            throw new Error('CreateExternalSnapshotPlacementUseCase: a snapshot placement store registry is required');
        }
        if (!createPublicationSnapshotPlacementUseCase || typeof createPublicationSnapshotPlacementUseCase.execute !== 'function') {
            throw new Error('CreateExternalSnapshotPlacementUseCase: a CreatePublicationSnapshotPlacementUseCase is required');
        }
        this._discoveryProvider = discoveryProvider;
        this._contentResolver = contentResolver;
        this._storeRegistry = storeRegistry;
        this._createPublicationSnapshotPlacementUseCase = createPublicationSnapshotPlacementUseCase;
    }

    // Resolves to `{ outcome, placement, reason }` — `outcome` always one
    // of application/SnapshotPlacementCreationOutcome.js's own values,
    // `placement` the cataloged PublicationSnapshotPlacement on CREATED
    // and null otherwise, `reason` a human-readable string on any outcome
    // other than CREATED.
    //
    // Throws (never returns an outcome) for a contract violation by the
    // caller: an unknown `publicationId`, a publication with no
    // contentReference yet, a `storage` with no registered store, or a
    // local integrity check that fails (this replica's own stored bytes
    // no longer hash to what the publication claims — mirroring
    // application/ResolvePublicationUseCase.js's own identical refusal).
    // None of those has a degraded-but-honest outcome to report.
    // Everything downstream of a real store actually being consulted —
    // unavailability, or a failure inside
    // `createPublicationSnapshotPlacementUseCase` itself (e.g. nobody
    // signed in) — is never caught or reinterpreted here.
    async execute(publicationId, storage) {
        if (typeof storage !== 'string' || !storage.trim()) {
            throw new Error('CreateExternalSnapshotPlacementUseCase: storage is required');
        }

        const publication = this._discoveryProvider.findById(publicationId);
        if (!publication) {
            throw new Error(`CreateExternalSnapshotPlacementUseCase: publication ${publicationId} not found`);
        }
        if (!publication.contentReference) {
            throw new Error(`CreateExternalSnapshotPlacementUseCase: publication ${publicationId} has no content reference to place`);
        }
        const contentHash = publication.contentReference.hash;

        const contentStore = this._storeRegistry.get(storage);
        if (!contentStore) {
            throw new Error(`CreateExternalSnapshotPlacementUseCase: no content store registered for storage '${storage}'`);
        }

        // This replica's own stored bytes must still hash to what the
        // publication itself claims before they are ever placed
        // anywhere else — the identical integrity check application/
        // ResolvePublicationUseCase.js already runs before resolving a
        // snapshot locally.
        const isValid = this._contentResolver.verify(publicationId, contentHash);
        if (!isValid) {
            throw new Error(
                `CreateExternalSnapshotPlacementUseCase: local snapshot integrity check failed `
                + `for publication ${publicationId} (hash mismatch) — refusing to place it externally`
            );
        }

        const snapshotJson = this._contentResolver.resolve(publicationId);
        const bytes = JSON.stringify(snapshotJson);

        let reference;
        try {
            reference = await contentStore.put(bytes);
        } catch (error) {
            return this._failure(SnapshotPlacementCreationOutcome.PLACEMENT_UNAVAILABLE, error.message);
        }

        // Defensive invariant, not a normal runtime outcome: the bytes
        // just placed are exactly the bytes the integrity check above
        // already confirmed hash to `contentHash`, using the identical
        // hash function every content/ContentStore.js implementation in
        // this codebase shares (see serializer/contentHash.js). A
        // mismatch here would mean a store computed a hash some other
        // way, never something a caller of this class did wrong.
        if (reference.hash !== contentHash) {
            throw new Error(
                `CreateExternalSnapshotPlacementUseCase: content store produced hash ${reference.hash}, `
                + `expected ${contentHash} — refusing to catalog a mismatched placement`
            );
        }

        const placement = this._createPublicationSnapshotPlacementUseCase.execute(publicationId, {
            storage: contentStore.storage,
            locator: reference.uri
        });

        return { outcome: SnapshotPlacementCreationOutcome.CREATED, placement, reason: null };
    }

    _failure(outcome, reason) {
        return { outcome, placement: null, reason };
    }
}
