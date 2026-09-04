import { ContentReference } from '../core/ContentReference.js';
import { DecentralizedSnapshotResolutionOutcome } from './DecentralizedSnapshotResolutionOutcome.js';

// 0.9.134 — Snapshot Retrieval from Decentralized Discovery.
//
// 0.9.132 (content/ArweaveContentStore.js) and 0.9.133 (application/
// NostrSnapshotDiscoveryQueryService.js) each closed one independent half
// of decentralized Snapshot distribution — placement, and discovery — but
// nothing yet connected them. This file is that connection, and nothing
// more: a caller who holds only a `discoveryTag` and a `contentHash` can
// ask this class for the bytes, and gets back either a verified Snapshot
// or a specific, structural reason it could not be produced.
//
//   Nostr discovery
//         │
//         │   contentHash + locator (application/
//         │   NostrSnapshotDiscoveryQueryService.js#search())
//         ▼
//   Snapshot locator
//         │
//         ▼
//   Snapshot ContentStore (application/
//   SnapshotPlacementStoreRegistry.js -> content/ContentStore.js#get())
//         │
//         ▼
//   Snapshot bytes
//         │
//         ▼
//   content hash verification (core/ContentReference.js#verify())
//         │
//         ▼
//   usable Snapshot
//
// FOUR LAYERS, NEVER COLLAPSED INTO ONE STATUS — the centerpiece
// invariant this milestone names in docs/Roadmap.md:
//
//   DISCOVERY     "A locator was announced."       -> NOT_DISCOVERED
//   LOCATION      "The locator can be queried."     -> STORE_UNAVAILABLE
//   RETRIEVAL     "Bytes were obtained."             -> CONTENT_UNAVAILABLE
//   VERIFICATION  "Those bytes are the expected
//                  Snapshot."                        -> CONTENT_HASH_MISMATCH
//
// Only when all four layers succeed does resolve() report RESOLVED — see
// application/DecentralizedSnapshotResolutionOutcome.js for the complete,
// ordered list this pipeline can end on. Discovery succeeding is never
// treated as retrieval succeeding, and retrieval succeeding is never
// treated as verification succeeding — the identical discipline
// application/SnapshotPlacementResolver.js (0.8.18) already holds for a
// SIGNED placement, applied here to an UNSIGNED, Nostr-discovered
// candidate instead (see this file's own header, "no signature," below).
//
// REUSES application/SnapshotPlacementStoreRegistry.js AS THE CONTENT
// STORE REGISTRY — NO NEW REGISTRY IS BUILT. That registry already maps a
// bare `storage` string ('ar', 'ipfs', ...) to a registered content/
// ContentStore.js instance; it doesn't care, and has never cared, whether
// the caller resolving a `storage` name got there via a signed
// PublicationSnapshotPlacement or via a Nostr-discovered candidate. Two
// registries mapping the identical `storage -> ContentStore` relationship
// would drift out of sync by hand; this class takes a `storeRegistry`
// exactly as application/SnapshotPlacementResolver.js already does, and
// never constructs, registers into, or reads from a second one.
//
// NO SIGNATURE, NO ENVELOPE VALIDATION OF ITS OWN. A discovered candidate
// (`{ contentHash, locator, storage }`) already passed through
// core/SnapshotDiscoveryEnvelope.js's own shape validation inside
// application/NostrSnapshotDiscoveryQueryService.js#search() — this class
// trusts that shape and performs no second parse of it. What it never
// trusts is the CLAIM the shape carries: that the locator actually serves
// the announced contentHash. That is exactly what steps 3-4 (retrieve,
// verify) below exist to check, and are the only steps this class treats
// as evidence rather than assertion.
//
// A DETERMINISTIC FIRST-MATCH SELECTION, NEVER RANKING OR PROVIDER
// SELECTION. When more than one discovered candidate names the same
// contentHash under one discoveryTag, this class resolves against the
// FIRST one search() reported — the identical selection rule application/
// NostrSnapshotDiscoveryQueryService.js#resolveLocator() already
// documents and implements ("no ranking, no 'best' provider, no
// preference among several candidates"), extended here only far enough to
// also carry that candidate's own `storage` (resolveLocator() reports a
// bare locator string, which is not enough to pick a ContentStore). Every
// resolve() result also carries the FULL set of matching candidates as
// `candidates` — so a caller who wants to try a different one after a
// CONTENT_UNAVAILABLE or CONTENT_HASH_MISMATCH can do so explicitly, by
// calling resolve() again with an explicit `contentStore` — this class
// never performs that retry automatically. Automatic failover across
// candidates IS a form of provider selection, and stays deliberately
// unbuilt this milestone (see "deliberately excluded," below).
//
// resolve() NEVER THROWS FOR ANYTHING ABOUT DISCOVERY, THE STORE, OR THE
// NETWORK — only for a contract violation by the CALLER (a missing
// discoveryTag/contentHash, or a constructor argument that doesn't look
// like a NostrSnapshotDiscoveryQueryService). Every other failure is
// reported as a specific outcome, exactly the restraint application/
// SnapshotPlacementResolver.js's own resolve() already holds.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Automatic retry or failover across multiple discovered candidates.**
//   See "a deterministic first-match selection," above.
// - **Any trust scoring, reputation, or "preferred provider" logic.**
// - **Composition wiring into World View, publisher/Publication.js's own
//   autosave/publish flow, or any UI.** This class is a plain,
//   constructible application-layer collaborator — nothing in this
//   milestone wires it into a real composition root (ui/main.js or a
//   sibling) or decides WHEN a resolution should be attempted.
// - **A new ContentStoreRegistry.** See "reuses
//   SnapshotPlacementStoreRegistry," above.
// - **Any change to core/SnapshotDiscoveryEnvelope.js, application/
//   NostrSnapshotDiscoveryQueryService.js, application/
//   NostrSnapshotDiscoveryPublisher.js, application/
//   SnapshotPlacementResolver.js, or application/
//   SnapshotPlacementStoreRegistry.js.** All are read only, by this
//   milestone's own test suite, never edited.
export class DecentralizedSnapshotResolver {
    // queryService: an application/NostrSnapshotDiscoveryQueryService.js
    // instance (or anything duck-type compatible with it) — required,
    // never defaulted. This class performs no Nostr access of its own; it
    // only ever calls queryService.search().
    constructor(queryService) {
        if (!queryService || typeof queryService.search !== 'function') {
            throw new Error('DecentralizedSnapshotResolver: a NostrSnapshotDiscoveryQueryService is required');
        }
        this._queryService = queryService;
    }

    // Resolves to `{ outcome, bytes, candidates, locator, storage, reason }`:
    //   outcome    — always one of DecentralizedSnapshotResolutionOutcome's
    //                own values.
    //   bytes      — set only when `outcome === RESOLVED`.
    //   candidates — every discovered candidate whose own contentHash
    //                matched the one requested (possibly more than one —
    //                see "a deterministic first-match selection," above),
    //                in the exact order search() reported them. `[]` when
    //                outcome is NOT_DISCOVERED.
    //   locator    — the locator of the ONE candidate this call actually
    //                attempted (`candidates[0]`), or `null` when
    //                outcome is NOT_DISCOVERED.
    //   storage    — that same candidate's own `storage`, or `null`.
    //   reason     — a human-readable string on any outcome other than
    //                RESOLVED, else `null`.
    //
    // `contentStore` (explicit) always wins over a lookup in
    // `storeRegistry` — a caller that passed both meant the explicit one.
    // Mirrors application/SnapshotPlacementResolver.js#resolve()'s own
    // `{ contentStore, storeRegistry }` option shape exactly.
    async resolve(discoveryTag, contentHash, { contentStore = null, storeRegistry = null } = {}) {
        if (!discoveryTag || typeof discoveryTag !== 'string') {
            throw new Error('DecentralizedSnapshotResolver: resolve() requires a discoveryTag');
        }
        if (!contentHash || typeof contentHash !== 'string') {
            throw new Error('DecentralizedSnapshotResolver: resolve() requires a contentHash');
        }

        // 1. DISCOVERY — "a locator was announced." Never invented,
        // never cached across calls; a fresh search() every time, the
        // identical restraint application/
        // NostrSnapshotDiscoveryQueryService.js#search() itself already
        // holds one layer down.
        const discovered = await this._queryService.search(discoveryTag);
        const candidates = (Array.isArray(discovered) ? discovered : [])
            .filter((candidate) => candidate && candidate.contentHash === contentHash);
        if (candidates.length === 0) {
            return this._failure(
                DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED,
                `no discovery candidate found for contentHash '${contentHash}' under discoveryTag '${discoveryTag}'`,
                []
            );
        }

        // Deterministic first-match selection — see this file's own
        // header, "a deterministic first-match selection, never ranking."
        const selected = candidates[0];

        // 2. LOCATION — "the locator can be queried." An explicit
        // contentStore always wins over a storeRegistry lookup.
        const resolvedStore = contentStore || (storeRegistry ? storeRegistry.get(selected.storage) : null);
        if (!resolvedStore) {
            return this._failure(
                DecentralizedSnapshotResolutionOutcome.STORE_UNAVAILABLE,
                `no content store available for storage '${selected.storage}'`,
                candidates,
                selected
            );
        }

        // 3. RETRIEVAL — "bytes were obtained." Addressed by an AD-HOC
        // ContentReference this class builds from the REQUESTED
        // contentHash and the SELECTED candidate's own locator/storage —
        // never a reference this class invents from the candidate's own
        // (unverified) contentHash alone, so that a mismatched candidate
        // is caught at verification, not silently trusted at this step.
        const reference = new ContentReference({ hash: contentHash, uri: selected.locator, storage: selected.storage });
        let bytes;
        try {
            bytes = await resolvedStore.get(reference);
        } catch (error) {
            return this._failure(
                DecentralizedSnapshotResolutionOutcome.CONTENT_UNAVAILABLE,
                error.message,
                candidates,
                selected
            );
        }
        if (bytes === null || bytes === undefined) {
            return this._failure(
                DecentralizedSnapshotResolutionOutcome.CONTENT_UNAVAILABLE,
                'the referenced content is not available from this content store',
                candidates,
                selected
            );
        }

        // 4. VERIFICATION — "those bytes are the expected Snapshot."
        // Discovery is not verification: a discovered locator resolving
        // and genuinely retrieving bytes is never, by itself, treated as
        // proof those bytes are the right ones.
        if (!reference.verify(bytes)) {
            return this._failure(
                DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH,
                'retrieved content does not match the requested contentHash — discovery is not verification',
                candidates,
                selected
            );
        }

        return {
            outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED,
            bytes,
            candidates,
            locator: selected.locator,
            storage: selected.storage,
            reason: null
        };
    }

    _failure(outcome, reason, candidates, selected = null) {
        return {
            outcome,
            bytes: null,
            candidates,
            locator: selected ? selected.locator : null,
            storage: selected ? selected.storage : null,
            reason
        };
    }
}
