// 0.9.485 — Local Snapshot Candidate Discovery Query Service.
//
// tests/LocalSnapshotCandidateDiscoveryCapabilityAudit.test.js (0.9.480)
// proved, live, that `application/LocalPublicationSnapshotPlacementCatalog.js`
// (0.8.18/0.8.21) already exposes everything a search()-shaped candidate
// source needs — `list()` already returns real `PublicationSnapshotPlacement`
// instances whose own `contentHash`/`locator`/`storage`/`publicationId`
// fields already ARE the candidate shape `application/
// NostrSnapshotDiscoveryQueryService.js#search()` independently established
// — via a small, test-only prototype class it never promoted to
// production. tests/PassivePeerSnapshotDiscoveryEndToEndIntegrationAudit
// .test.js (0.9.484) then proved the identical prototype, unmodified,
// already surfaces a PEER-delivered placement exactly as uniformly as a
// LOCAL one, because the catalog itself carries no origin field at all
// (see that catalog's own header, and application/PlacementAcquisitionKind
// .js's own separate, optional provenance ledger). This file is that
// prototype, promoted: the one piece 0.9.485's own composite query service
// (application/SnapshotCandidateDiscoveryQueryService.js, sibling) needs to
// treat "the Local catalog" as just another `search(discoveryTag)` source.
//
//   LocalPublicationSnapshotPlacementCatalog#list()   (0.8.18/0.8.21,
//        │                                              UNMODIFIED — this
//        │                                              file adds no
//        │                                              method to it)
//        ▼
//   LocalSnapshotCandidateDiscoveryQueryService   ★ (THIS)
//        .search(discoveryTag)
//        │
//        ▼
//   [ { contentHash, locator, storage, publicationId }, ... ]
//        (the identical four-key shape
//        tests/LocalSnapshotCandidateDiscoveryCapabilityAudit.test.js's own
//        Section H prototype already produced)
//
// `discoveryTag` IS ACCEPTED, AND IGNORED — NOT A BUG, A REPORTED FACT.
// `application/LocalPublicationSnapshotPlacementCatalog.js` has no
// `discoveryTag` concept anywhere in its own source (reconfirmed live by
// tests/PeerSnapshotCandidateDiscoveryCapabilityAudit.test.js's own Section
// C, grepping that exact absence across every sibling family in this
// codebase) — a locally cataloged placement was never filed under a
// campaign tag the way a Nostr announcement is. `search()` therefore
// returns EVERY cataloged placement, every call, regardless of which
// `discoveryTag` a caller passed — the identical "this source answers a
// different, narrower question than the campaign filter implies" honesty
// `application/NostrSnapshotDiscoveryQueryService.js`'s own `search()`
// already holds for ITS OWN, different, narrower question ("what was
// announced," never "is this locator still reachable"). A caller wanting
// to scope Local candidates by anything narrower than "every placement
// this replica currently catalogs" filters the returned array itself,
// exactly as `application/DiscoverSnapshotCandidatesCommand.js`'s own
// header already establishes callers do for whatever THEIR OWN source
// returns.
//
// A CANDIDATE, NEVER A LEAD, NEVER VERIFICATION — the identical restraint
// `application/NostrSnapshotDiscoveryQueryService.js`'s own header already
// holds, extended here from "someone announced this locator on Nostr" to
// "this replica has cataloged this locator, locally or via a peer." This
// file never verifies a placement's signature (that stays
// `application/SnapshotPlacementResolver.js`'s own, separate, later
// concern), never retrieves a placement's bytes, and never checks whether
// its locator still actually serves them.
//
// NO PROVENANCE FIELD, EVER — reported, never invented. A candidate this
// service returns never carries a `source`/`origin`/`acquisition` key of
// any kind, because `LocalPublicationSnapshotPlacementCatalog#list()`
// itself carries none — see that catalog's own header, and
// `application/PlacementAcquisitionKind.js`'s own header for exactly where
// that fact DOES live (a separate, optional `LocalPlacementKnowledgeStore`
// entry, keyed by placement id, never by this file). A caller who actually
// needs to know LOCAL vs. PEER for a specific placement id asks that store
// directly — this file was never handed one, and never will be.
//
// NEVER THROWS FROM `search()` — the identical restraint every sibling in
// this family already holds. `placementCatalog.list()` is a synchronous,
// local, in-memory read (`application/
// LocalPublicationSnapshotPlacementCatalog.js`'s own contract) with no
// network/timeout failure mode to guard against; this file still wraps the
// call in `Promise.resolve().then()` so a genuinely malformed catalog
// instance (one whose `list()` throws) surfaces as a REJECTED promise, not
// a synchronous throw on the caller's own call stack — exactly the shape
// `application/SnapshotCandidateDiscoveryQueryService.js`'s own
// `Promise.allSettled()` isolation already expects of every source it
// composes.
//
// NO RANKING, NO DEDUPLICATION, NO FILTERING BEYOND WHAT `list()` ITSELF
// ALREADY RETURNS. Two cataloged placements sharing a `contentHash` but
// naming different locators/storage backends — explicitly NOT collapsed by
// `core/PublicationSnapshotPlacement.js`'s own header — are reported as two
// separate candidates here too; deduplication across sources is entirely
// `application/SnapshotCandidateDiscoveryQueryService.js`'s own, separate
// concern.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A `discoveryTag` concept added to the catalog itself, or to
//   placement creation.** See "discoveryTag is accepted, and ignored,"
//   above — this file reports the absence, it does not invent a fix for
//   it.
// - **Provenance/acquisition filtering of any kind.** See "no provenance
//   field, ever," above.
// - **Resolution, retrieval, or verification of any candidate's bytes.**
//   Stays `application/SnapshotPlacementResolver.js`'s own job.
// - **Composing more than one Local catalog instance, or constructing the
//   catalog itself.** This class receives an already-constructed
//   `placementCatalog` — the SAME single instance `ui/main.js` already
//   threads through the whole placement-catalog/peer-exchange family — and
//   never builds or owns a second one.
function isSearchableCatalog(catalog) {
    return Boolean(catalog) && typeof catalog === 'object' && typeof catalog.list === 'function';
}

export class LocalSnapshotCandidateDiscoveryQueryService {
    // placementCatalog: an already-constructed
    //   `application/LocalPublicationSnapshotPlacementCatalog.js` instance
    //   (or anything exposing an equivalent `list()`) — required, never
    //   constructed here. See this file's own header, "deliberately
    //   excluded."
    constructor(placementCatalog) {
        if (!isSearchableCatalog(placementCatalog)) {
            throw new Error('LocalSnapshotCandidateDiscoveryQueryService: a placement catalog exposing list() is required');
        }
        this._catalog = placementCatalog;
    }

    // search(discoveryTag) -> Promise<[{ contentHash, locator, storage,
    //   publicationId }, ...]>. `discoveryTag` is accepted for contract
    //   compatibility with every sibling source and otherwise unread — see
    //   this file's own header. Resolves to one candidate per placement
    //   `this._catalog.list()` currently reports, in that same order;
    //   rejects (never throws synchronously) only if `list()` itself
    //   throws.
    search(_discoveryTag) {
        return Promise.resolve().then(() => this._catalog.list().map((placement) => ({
            contentHash: placement.contentHash,
            locator: placement.locator,
            storage: placement.storage,
            publicationId: placement.publicationId
        })));
    }
}
