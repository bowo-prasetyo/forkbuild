// 0.9.485 — Walking-Triggered Snapshot Candidate Query Service.
//
// application/PlaceNamingDiscoveryQueryService.js (0.9.253) already proved
// the shape this milestone needs, one vocabulary family over: an
// assembly boundary composing N independently-failing `search(tag) ->
// Promise<Array>` sources into one deduplicated result, with no ranking,
// no retrieval, and no verification of its own. This file is that
// identical shape, built for Snapshot candidates instead of Place Naming
// claims — the composite `application/DiscoverSnapshotCandidatesCommand.js`
// (0.9.150) has been able to accept ever since it was written (it already
// validates only `{ search(tag) }`, never `instanceof
// NostrSnapshotDiscoveryQueryService`), but which no caller has ever
// constructed.
//
//   application/NostrSnapshotDiscoveryQueryService.js   application/
//        (0.9.133, UNMODIFIED — already                  LocalSnapshotCandidateDiscoveryQueryService.js
//        matches `search(tag) ->                          (0.9.485, sibling — wraps
//        Promise<candidate[]>` as-is,                      LocalPublicationSnapshotPlacementCatalog.js,
//        so no separate "Nostr adapter"                    UNMODIFIED, 0.8.18/0.8.21)
//        class exists or is needed)
//                    │                                              │
//                    └──────────────────┬───────────────────────────┘
//                                       ▼
//                  SnapshotCandidateDiscoveryQueryService   ★ (THIS)
//                       .search(discoveryTag)
//                                       │
//                                       ▼
//                  [ { contentHash, locator, storage, publicationId? }, ... ]
//
// PEER IS NOT A THIRD SOURCE HERE, ON PURPOSE.
// tests/PassivePeerSnapshotDiscoveryEndToEndIntegrationAudit.test.js
// (0.9.484) already proved, live, that a peer-announced placement reaches
// this replica's real `LocalPublicationSnapshotPlacementCatalog` and is
// indistinguishable there from a locally-created one (that catalog carries
// no origin field at all — see its own header, and
// application/PlacementAcquisitionKind.js's own separate, optional
// provenance ledger). Peer's own contribution to Snapshot candidate
// discovery is therefore entirely `application/
// PublicationSnapshotPlacementPeerExchange.js`'s own, already-production,
// passive ANNOUNCE path feeding the SAME catalog `LocalSnapshotCandidate
// DiscoveryQueryService` (sibling) already wraps — never a second,
// active peer-browse protocol. This file imports no peer module of any
// kind, and constructs no third source for one.
//
// AN ASSEMBLY BOUNDARY, NEVER A SECOND DISCOVERY ALGORITHM — the identical
// restraint `application/PlaceNamingDiscoveryQueryService.js`'s own header
// already draws. This file contains no ranking, no proximity/radius
// filtering, no ordering beyond "sources searched in the order given, each
// source's own results kept in the order it returned them," and no
// resolution/retrieval/verification of any candidate's own bytes.
//
// EVERY SOURCE IS ISOLATED — ONE FAILING OR REJECTING SOURCE NEVER
// DISCARDS ANOTHER SOURCE'S OWN RESULTS, AND NEVER FAILS THE WHOLE CALL.
// `search()` awaits every source via `Promise.allSettled()`; a source
// whose own `search()` rejects, throws synchronously, or resolves to
// something that isn't an array contributes nothing and is otherwise
// silently ignored — identical to
// `application/PlaceNamingDiscoveryQueryService.js`'s own contract, one
// candidate vocabulary over.
//
// EVERY CANDIDATE IS VALIDATED BY SHAPE, NOT BY SOURCE. Unlike Place
// Naming's own `core/PlaceNamingDiscoveryEnvelope.js`, no single
// `parseSnapshotCandidate()` function already exists for this vocabulary —
// `core/SnapshotDiscoveryEnvelope.js#parseSnapshotDiscoveryEnvelope()`
// additionally requires a `protocol`/`version` pair that only a Nostr wire
// event ever carries, and a Local candidate (see
// `application/LocalSnapshotCandidateDiscoveryQueryService.js`'s own
// header) never has one — reusing it here would silently discard every
// Local candidate this service is expressly built to surface. This file
// therefore validates only the THREE fields
// `application/DiscoverSnapshotCandidatesCommand.js`'s own header already
// documents as the whole candidate contract: a non-empty string
// `contentHash`, `locator`, and `storage`. A raw item missing any of the
// three, or that is not a plain object at all, is silently discarded —
// never a reason to fail the whole call. `publicationId` (and, when
// present, `claimedPosition`) rides along verbatim, unread and
// unvalidated by this file, exactly as `application/
// NostrSnapshotDiscoveryQueryService.js`'s own header already holds for
// its own `search()`.
//
// DEDUPLICATION KEY — `storage` + `contentHash` + `locator`, TOGETHER,
// NEVER `contentHash` ALONE. This is the one architectural decision this
// milestone's own brief asked to be settled by the EXISTING candidate/
// placement identity semantics, not by intuition — and
// `core/PublicationSnapshotPlacement.js`'s own header already settles it:
// "Multiple independent placements — different placing identities,
// different storage backends, different locators, even different
// placement ids naming the SAME publicationId/contentHash — all coexist
// here... this catalog never collapses them into one." Two candidates
// sharing a `contentHash` but naming different locators or storage
// backends are, by this codebase's own already-established rule, TWO
// genuinely different retrieval claims — collapsing them would silently
// discard a second, independently useful way to retrieve the identical
// bytes. Two candidates agreeing on all three of `storage`/`contentHash`/
// `locator` are, conversely, the exact same retrieval claim, however many
// independent sources reported it (the flagship case this milestone's own
// brief names: a Local catalog entry and a Nostr announcement both
// describing the identical locator). `publicationId` is deliberately NOT
// part of this key: it travels as supplementary, optional metadata on a
// candidate (see `core/SnapshotDiscoveryEnvelope.js`'s own 0.9.171 header,
// "preserved, never consumed... optional"), never as part of what makes a
// LOCATOR CLAIM the same claim — the identical reasoning
// `application/PublicationSnapshotPlacementConvergence.js`'s own header
// already applies one layer up ("grouped by contentHash alone... never by
// storage, locator, or anything else" — for STRUCTURAL AGREEMENT between
// placements naming one publicationId, a narrower question than this
// file's own "is this the same candidate").
//
// FIRST-SEEN-WINS, SOURCES CONSULTED IN CONSTRUCTOR ORDER — identical to
// `application/PlaceNamingDiscoveryQueryService.js`'s own rule. A
// duplicate candidate's OWN `publicationId`/`claimedPosition` (should two
// sources disagree on them for the identical `storage`/`contentHash`/
// `locator` triple) is never merged or reconciled — whichever source's
// result reached this file's own dedup pass first is kept, verbatim.
//
// CONSTRUCTION VALIDATES SHAPE, NOT REACHABILITY — identical to
// `application/PlaceNamingDiscoveryQueryService.js`'s own constructor. An
// EMPTY `sources` array is explicitly valid, never an error.
//
// NEVER RESOLVES BYTES, NEVER TOUCHES `application/
// SnapshotPlacementResolver.js`. A returned candidate stays a locator
// claim, exactly as every source it was assembled from already reports —
// see this milestone's own diagram: "Candidate Query -> locator claims ->
// selected candidate -> SnapshotPlacementResolver -> bytes" is entirely a
// CALLER's own, later, separate sequence.
//
// NEVER KNOWS WALKING EXISTS. No player position, movement threshold,
// polling, request id, stale-result protection, World View, rendering, or
// material loading concept appears anywhere in this file — those stay
// `application/WorldSnapshotDiscoveryMonitor.js`'s own, entirely separate,
// unmodified responsibility. This class is fully usable, and fully
// testable, with no monitor anywhere nearby.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any concrete source construction.** This file receives
//   already-constructed sources (see `application/
//   SnapshotCandidateDiscoveryRuntimeComposition.js`, sibling, for where
//   the two concrete sources this milestone ships are actually built).
// - **Wiring this service into `application/
//   DiscoverSnapshotCandidatesCommand.js`, `application/
//   WorldSnapshotDiscoveryMonitor.js`, or `ui/main.js`'s own
//   `discoverSnapshotCandidatesCommand`.** A separate, later, unscheduled
//   step (0.9.486) — this milestone composes and provides the service, and
//   stops there.
// - **A third, peer-specific source.** See "Peer is not a third source
//   here," above.
// - **Ranking, trust scoring, or proximity/radius filtering.**
// - **Caching a previous `search()` result, or retrying a failed source.**
//   Every call is independent.

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

function isSearchableSource(source) {
    return Boolean(source) && typeof source === 'object' && typeof source.search === 'function';
}

// Pure. `true` only when `candidate` carries the three fields
// `application/DiscoverSnapshotCandidatesCommand.js`'s own header already
// documents as the whole candidate contract — see this file's own header,
// "every candidate is validated by shape, not by source."
function isWellFormedCandidate(candidate) {
    return isPlainObject(candidate)
        && isNonEmptyString(candidate.contentHash)
        && isNonEmptyString(candidate.locator)
        && isNonEmptyString(candidate.storage);
}

// Pure. The dedup identity this file's own header settles on — see
// "deduplication key," above.
function candidateIdentity(candidate) {
    return `${candidate.storage} ${candidate.contentHash} ${candidate.locator}`;
}

export class SnapshotCandidateDiscoveryQueryService {
    constructor(sources = []) {
        if (!Array.isArray(sources)) {
            throw new Error('SnapshotCandidateDiscoveryQueryService: sources must be an array');
        }
        sources.forEach((source, index) => {
            if (!isSearchableSource(source)) {
                throw new Error(`SnapshotCandidateDiscoveryQueryService: source at index ${index} does not expose search()`);
            }
        });
        this._sources = sources.slice();
    }

    // search(discoveryTag) -> Promise<Array<candidate>>. Calls every
    // source's own `search(discoveryTag)`, isolates each source's own
    // failure, discards whatever fails to validate, and deduplicates by
    // `storage`+`contentHash`+`locator` — see this file's own header for
    // the full contract. Never throws; resolves to `[]` when there are no
    // sources, no source returns anything, or nothing any source returned
    // validates.
    async search(discoveryTag) {
        // Each source is invoked inside its own try/catch, never bare
        // inside `.map()` — a source whose own `search()` throws
        // SYNCHRONOUSLY (never awaited a microtask) would otherwise abort
        // `.map()` itself before `Promise.allSettled()` ever got a chance
        // to isolate it, taking every other source's own call down with
        // it. Wrapping each call converts a synchronous throw into a
        // per-source rejected promise instead, preserving the isolation
        // this file's own header guarantees.
        const settled = await Promise.allSettled(
            this._sources.map((source) => {
                try {
                    return Promise.resolve(source.search(discoveryTag));
                } catch (error) {
                    return Promise.reject(error);
                }
            })
        );

        const seen = new Set();
        const results = [];

        for (const outcome of settled) {
            if (outcome.status !== 'fulfilled') {
                continue;
            }
            const rawCandidates = outcome.value;
            if (!Array.isArray(rawCandidates)) {
                continue;
            }
            for (const rawCandidate of rawCandidates) {
                if (!isWellFormedCandidate(rawCandidate)) {
                    continue;
                }
                const identity = candidateIdentity(rawCandidate);
                if (seen.has(identity)) {
                    continue;
                }
                seen.add(identity);
                results.push(rawCandidate);
            }
        }

        return results;
    }
}
