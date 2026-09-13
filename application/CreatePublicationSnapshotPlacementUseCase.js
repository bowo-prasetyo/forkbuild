import { PublicationSnapshotPlacement } from '../core/PublicationSnapshotPlacement.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { PlacementAcquisitionKind } from './PlacementAcquisitionKind.js';

// 0.8.18 — Decentralized Snapshot Placement Foundation.
//
// The placement-side counterpart of application/
// CreatePublicationAnchorUseCase.js (0.8.8), mirrored deliberately: it
// orchestrates core/PublicationSnapshotPlacement.js, an identityProvider,
// identity/LocalAuthorizationVerifier.js, and application/
// LocalPublicationSnapshotPlacementCatalog.js exactly the way that class
// orchestrates core/PublicationAnchor.js — no new domain model beyond
// core/PublicationSnapshotPlacement.js itself, and no change to it here.
//
// CREATING A PLACEMENT CLAIM IS NOT PLACING CONTENT. This class produces
// a signed assertion — "the current identity attests this publicationId/
// contentHash pair can be retrieved from this locator, on this storage
// backend" — and nothing else. It never talks to IPFS, Arweave, or any
// other storage backend; the caller supplies whatever locator it already
// obtained from one (a CID it just pinned, a transaction id it just
// wrote), exactly as application/CreatePublicationAnchorUseCase.js's own
// header already insists evidence parameters are always supplied BY the
// caller, never obtained here. See application/
// CreateExternalSnapshotPlacementUseCase.js for the orchestration that
// actually talks to a real storage backend before calling this class.
//
// PUBLICATION BINDING, NOT ADJUDICATION. This use case deliberately does
// NOT accept a caller-supplied contentHash at all. It looks the
// publication up (via a `discoveryProvider` — the same collaborator
// application/ResolvePublicationUseCase.js and application/
// PlacePublicationUseCase.js already depend on) and derives contentHash
// from the publication's OWN `contentReference.hash` — the one thing
// this class can actually verify locally. That is not evidence
// adjudication; it is simply ensuring a locally created placement cannot
// accidentally misname the publication it is about.
//
// NO CONTENT-STORE ACCESS. execute() never constructs, calls, or even
// imports a content/ContentStore.js implementation — whether the named
// locator can actually serve those bytes right now is a completely
// separate, later action (application/SnapshotPlacementResolver.js),
// exactly like whether an anchor's proof holds up is separate from
// creating the anchor claim itself.
//
// EXPLICIT IDENTITY, NEVER INFERRED. The signing identity comes from the
// `identityProvider` this class was constructed with — never a hidden
// "currentUser" global, and never defaulted to anything if nobody is
// signed in.
//
// 0.8.24 — Snapshot Placement Provenance & Observation Boundary. Also
// records an application/PlacementAcquisitionKind.js#LOCAL knowledge
// entry (see the optional `knowledgeStore` constructor parameter) —
// never a change to what this class creates or catalogs, purely
// additional, local-only bookkeeping about HOW this replica came to know
// about its own freshly signed claim. Mirrors application/
// CreatePublicationAnchorUseCase.js's own 0.8.17 addition exactly.
//
// 0.9.483 — Activate Production Snapshot Placement Peer Announcement.
//
// Also announces a successfully created placement to peers (see the
// optional `peerExchange` constructor parameter) — THE authoritative
// production moment a PublicationSnapshotPlacement becomes locally known
// at all, and therefore the one place this codebase attaches peer
// propagation to, rather than to World Encounter, walking discovery,
// Repository, catalog reads, material resolution, or any periodic
// monitor pass (none of those ever creates a placement, so none of them
// would ever announce more than once — or at all). Mirrors this file's
// own `knowledgeStore` pattern exactly: additive, optional, and never a
// precondition for — or a way to invalidate — creating a placement. See
// `execute()` below for the failure-isolation discipline this addition
// holds to.
export class CreatePublicationSnapshotPlacementUseCase {
    // knowledgeStore: OPTIONAL, an application/LocalPlacementKnowledgeStore.js
    // instance (0.8.24). When supplied, a successfully created placement
    // also records a PlacementAcquisitionKind.LOCAL knowledge entry for
    // itself — "this replica learned this claim by creating it," the one
    // acquisition kind no other entry point can ever record. Omitted
    // entirely (as every caller before 0.8.24 already does), this class
    // behaves exactly as it always did: knowledge tracking is additive,
    // local-only bookkeeping, never a precondition for creating a
    // placement.
    //
    // peerExchange: OPTIONAL, an application/
    // PublicationSnapshotPlacementPeerExchange.js instance (0.9.483). When
    // supplied, a successfully created placement is also announce()d to
    // every currently AUTHENTICATED peer on the SAME ConnectedPeerRegistry
    // that instance was constructed with — this replica's already-existing
    // gossip mechanism, never a new one (see that class's own header).
    // Omitted entirely (as every caller before 0.9.483 does), this class
    // behaves exactly as it always did: peer propagation is additive,
    // best-effort bookkeeping, never a precondition for creating a
    // placement.
    constructor(discoveryProvider, identityProvider, verifier, placementCatalog, knowledgeStore = null, peerExchange = null) {
        if (!discoveryProvider) {
            throw new Error('CreatePublicationSnapshotPlacementUseCase: a publication discovery provider is required');
        }
        if (!identityProvider) {
            throw new Error('CreatePublicationSnapshotPlacementUseCase: identityProvider is required');
        }
        if (!verifier) {
            throw new Error('CreatePublicationSnapshotPlacementUseCase: an authorization verifier is required');
        }
        if (!placementCatalog) {
            throw new Error('CreatePublicationSnapshotPlacementUseCase: a placement catalog is required');
        }
        this._discoveryProvider = discoveryProvider;
        this._identityProvider = identityProvider;
        this._verifier = verifier;
        this._placementCatalog = placementCatalog;
        this._knowledgeStore = knowledgeStore;
        this._peerExchange = peerExchange;
    }

    // Creates, signs, and catalogs a new PublicationSnapshotPlacement for
    // `publicationId`, using an externally supplied locator — never
    // anything this class fetches or constructs itself (see this class's
    // own header). `options`:
    //
    //   storage    (required) — e.g. 'ipfs'
    //   locator    (required) — where the content can be retrieved, e.g.
    //                            'ipfs://Qm...'
    //   placedAt   (optional) — this replica's own reported placement
    //                            time; defaults to now, exactly as core/
    //                            PublicationSnapshotPlacement.js itself
    //                            defaults it
    //
    // `contentHash` is deliberately NOT an option — it is always derived
    // from the looked-up publication's own `contentReference.hash`, per
    // this class's own header. Throws if `publicationId` names no
    // publication this replica knows about, if that publication has no
    // contentReference yet, if nobody is signed in, or if the
    // identityProvider lacks the 0.2.16 cryptographic surface. Returns
    // the cataloged PublicationSnapshotPlacement.
    execute(publicationId, { storage, locator, placedAt = new Date() } = {}) {
        const publication = this._discoveryProvider.findById(publicationId);
        if (!publication) {
            throw new Error(`CreatePublicationSnapshotPlacementUseCase: publication ${publicationId} not found`);
        }
        if (!publication.contentReference) {
            throw new Error(`CreatePublicationSnapshotPlacementUseCase: publication ${publicationId} has no content reference to place`);
        }
        const contentHash = publication.contentReference.hash;

        const authorIdentityId = resolveSigningIdentityId(this._identityProvider);
        if (!authorIdentityId) {
            throw new Error('CreatePublicationSnapshotPlacementUseCase: sign in to create a publication snapshot placement');
        }
        if (typeof this._identityProvider.signCanonical !== 'function') {
            throw new Error('CreatePublicationSnapshotPlacementUseCase: this identity provider cannot sign a publication snapshot placement');
        }

        let placement = new PublicationSnapshotPlacement({
            publicationId,
            contentHash,
            storage,
            locator,
            placedAt,
            placerIdentity: this._identityProvider.getSigningIdentity().toJSON()
        });
        placement = placement.withSignature(this._identityProvider.signCanonical(placement.getSigningDescriptor()));

        // Verify our own output before it ever reaches the catalog — the
        // same "never persist what wouldn't survive verification"
        // discipline application/CreatePublicationAnchorUseCase.js
        // already applies.
        const result = this._verifier.verifyPublicationSnapshotPlacement(placement.toJSON());
        if (!result.valid) {
            throw new Error(`CreatePublicationSnapshotPlacementUseCase: refusing to create an unverifiable placement — ${result.reason}`);
        }

        const { placement: cataloged } = this._placementCatalog.add(placement);
        if (this._knowledgeStore) {
            this._knowledgeStore.record(cataloged.id, PlacementAcquisitionKind.LOCAL);
        }
        // 0.9.483 — FAILURE ISOLATION, the identical discipline application/
        // PublicationPeerConnectionSync.js's own header already states one
        // domain over: announce() runs AFTER the placement is already
        // cataloged, and is never allowed to undo that success. A peer
        // network that is unreachable, has zero connected peers, or fails
        // to send for any other reason still leaves `cataloged` exactly as
        // valid as it already was — peer propagation is an enhancement to
        // placement distribution, never the authority for whether the
        // local placement exists.
        if (this._peerExchange) {
            try {
                this._peerExchange.announce(cataloged);
            } catch {
                // Best-effort only — see this class's own 0.9.483 header.
            }
        }
        return cataloged;
    }
}
