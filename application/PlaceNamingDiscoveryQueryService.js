import { parsePlaceNamingDiscoveryEnvelope } from '../core/PlaceNamingDiscoveryEnvelope.js';

// 0.9.253 — Place Naming Discovery Boundary.
//
// core/PlaceNamingDiscoveryEnvelope.js (0.9.253, sibling) named the wire
// shape a source hands back; this file is the SOURCE-INDEPENDENT
// aggregator the recommendation that opened this milestone asked for by
// name — "if the existing import/peer paths already expose the claim
// cleanly, the new discovery layer should compose them rather than
// replace them." Nothing about this class knows whether a `source` is a
// Nostr relay, a peer connection, a rendezvous server, or the file-import
// path re-exposed as a source — it only knows every source exposes one
// method, and combines whatever they each hand back.
//
//   source.search(discoveryTag) -> Promise<Array<rawPayload>>
//        (any transport: application/NostrSnapshotDiscoveryQueryService.js's
//        own 0.9.133 shape, a future peer adapter, a future Arweave
//        GraphQL adapter — duck-typed, never an `instanceof` check)
//                    │
//                    ▼
//   application/PlaceNamingDiscoveryQueryService.js   ★ (THIS)
//        search(discoveryTag) — calls every source, in order, isolates a
//        failing source from the others, parses each raw payload through
//        core/PlaceNamingDiscoveryEnvelope.js#parsePlaceNamingDiscoveryEnvelope(),
//        discards whatever fails to parse, deduplicates by claim.id
//                    │
//                    ▼
//   [ { protocol, version, worldId, regionId, claim }, ... ]
//        (0.9.253's own envelope shape, passed through verbatim — never
//        re-described a second time)
//
// AN ASSEMBLY BOUNDARY, NEVER A SECOND DISCOVERY ALGORITHM — the
// identical restraint `application/DiscoverSnapshotCandidatesCommand.js`'s
// own header already holds for its own, single, already-composed query
// service. This file contains no ranking, no proximity/radius filtering,
// and no ordering beyond "sources searched in the order given, each
// source's own results kept in the order it returned them." A caller
// wanting relevance-to-a-position filtering applies it AFTER `search()`
// returns — see this milestone's own docs/Roadmap.md entry, "discovery vs.
// proximity," a separate and deliberately later concern.
//
// EVERY SOURCE IS ISOLATED — ONE FAILING OR REJECTING SOURCE NEVER
// DISCARDS ANOTHER SOURCE'S OWN RESULTS, AND NEVER FAILS THE WHOLE CALL.
// `search()` awaits every source via `Promise.allSettled()`; a source
// whose own `search()` rejects, throws synchronously, or resolves to
// something that isn't an array contributes nothing and is otherwise
// silently ignored — the identical "never throws... every failure
// degrades to `[]`" restraint `application/
// NostrSnapshotDiscoveryQueryService.js`'s own header already holds,
// generalized here across N independent sources instead of one relay.
//
// DEDUPLICATION IS BY `claim.id` ONLY, AND KEEPS THE FIRST OCCURRENCE —
// mirrors `application/LocalPlaceNamingClaimStore.js#has()`'s and
// `application/PlaceNamingClaimExchange.js#importClaim()`'s own already-
// established rule that a claim's own `id` (bound into its signed
// payload) is sufficient identity for "is this the same claim," with no
// need for a second, separately-derived content hash. The SAME claim
// echoed back by two different sources (an author who published both to
// Nostr and handed a file to a peer) collapses to one entry, in whichever
// source's own results reached it first — sources are consulted in
// constructor order, never re-ordered by this file.
//
// NEVER VERIFIES A SIGNATURE, NEVER RANKS, NEVER TRUSTS. Every returned
// envelope is exactly what
// `core/PlaceNamingDiscoveryEnvelope.js#parsePlaceNamingDiscoveryEnvelope()`
// already validated — shape only. This file never imports `identity/
// LocalAuthorizationVerifier.js`, `application/LocalPlaceNamingClaimStore.js`,
// or `core/PlaceNamingView.js` — whether a returned envelope's own claim
// is authentic, and whether/how it should ever become visible in World
// View, are entirely later, separate questions (see this milestone's own
// docs/Roadmap.md entry, "discovery vs. selection vs. presentation").
//
// CONSTRUCTION VALIDATES SHAPE, NOT REACHABILITY. The constructor throws
// synchronously for a non-array `sources`, or for any entry that is not a
// non-null value exposing a `search` function — a genuinely malformed
// collaborator, not merely an absent one, the same "still throws"
// restraint `application/DiscoverSnapshotCandidatesCommand.js`'s own
// header already holds for a malformed `discoveryQueryService`. An EMPTY
// `sources` array is explicitly valid — see
// `application/PlaceNamingDiscoveryRuntimeComposition.js`'s own header
// for why zero sources is this milestone's own honest starting state,
// not an error condition.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any concrete source** (Nostr, Arweave, WebRTC peer exchange, or a
//   file-import adapter). This file receives already-constructed sources;
//   composing or implementing one is a separate, later milestone's own
//   concern — see docs/Roadmap.md, "0.9.253 — Place Naming Discovery
//   Boundary," "what comes after."
// - **Automatic/background polling of any kind.** `search()` is called
//   once per invocation, by a caller who decides entirely for itself when
//   to call it — the identical restraint every sibling in the Snapshot
//   discovery family already holds for itself.
// - **Ranking, trust scoring, or proximity/radius filtering.** See "an
//   assembly boundary," above.
// - **Caching a previous `search()` result, or retrying a failed
//   source.** Every call is independent; a source that failed on one call
//   is retried, unmodified, on the very next call.

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSearchableSource(source) {
    return Boolean(source) && typeof source === 'object' && typeof source.search === 'function';
}

export class PlaceNamingDiscoveryQueryService {
    constructor(sources = []) {
        if (!Array.isArray(sources)) {
            throw new Error('PlaceNamingDiscoveryQueryService: sources must be an array');
        }
        sources.forEach((source, index) => {
            if (!isSearchableSource(source)) {
                throw new Error(`PlaceNamingDiscoveryQueryService: source at index ${index} does not expose search()`);
            }
        });
        this._sources = sources.slice();
    }

    // search(discoveryTag) -> Promise<Array<envelope>>. Calls every
    // source's own `search(discoveryTag)`, isolates each source's own
    // failure, parses every raw payload each source hands back through
    // `parsePlaceNamingDiscoveryEnvelope()`, discards whatever fails to
    // parse, and deduplicates by `claim.id` — see this file's own header
    // for the full contract. Never throws; resolves to `[]` when there
    // are no sources, no source returns anything, or nothing any source
    // returned parses.
    async search(discoveryTag) {
        const settled = await Promise.allSettled(
            this._sources.map((source) => source.search(discoveryTag))
        );

        const seen = new Set();
        const results = [];

        for (const outcome of settled) {
            if (outcome.status !== 'fulfilled') {
                continue;
            }
            const rawPayloads = outcome.value;
            if (!Array.isArray(rawPayloads)) {
                continue;
            }
            for (const rawPayload of rawPayloads) {
                const envelope = isPlainObject(rawPayload) || typeof rawPayload === 'string'
                    ? parsePlaceNamingDiscoveryEnvelope(rawPayload)
                    : null;
                if (!envelope) {
                    continue;
                }
                if (seen.has(envelope.claim.id)) {
                    continue;
                }
                seen.add(envelope.claim.id);
                results.push(envelope);
            }
        }

        return results;
    }
}
