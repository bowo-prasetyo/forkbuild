// 0.9.150 — Snapshot Candidate Discovery Command.
//
// 0.9.149's own audit proved a fact this codebase had never once
// exercised: `application/NostrSnapshotDiscoveryQueryService.js#search()`
// (0.9.133, unmodified) already answers a completely different question
// than `application/DecentralizedSnapshotResolver.js#resolve()` (0.9.134)
// does — "what has been announced under this discoveryTag, at all?"
// (browsing-oriented discovery) rather than "can THIS ONE, already-known
// contentHash be retrieved and verified?" (attribution-oriented
// resolution) — and that `search()` is already safe to expose directly:
// unranked, unfiltered by contentHash, untouched by retrieval or
// verification. This file is the identical "application command
// boundary" seam `application/DiscoverSnapshotCommand.js` (0.9.142)
// already established for RESOLUTION, built here for CANDIDATE DISCOVERY
// instead, and nothing more — see 0.9.149's own "Recommendation," which
// named this file by its intended shape before it existed.
//
//   World View
//        │  { discoveryTag }
//        ▼
//   application/DiscoverSnapshotCandidatesCommand.js   ★ (THIS)
//        executeDiscoverSnapshotCandidatesCommand({ discoveryTag, discoveryQueryService })
//        │
//        ▼
//   discoveryQueryService.search(discoveryTag)
//        (application/NostrSnapshotDiscoveryQueryService.js, 0.9.133, unmodified)
//        │
//        ▼
//   [ { contentHash, locator, storage }, ... ]
//        (0.9.133's own result, passed through verbatim)
//
// THIS IS A DIFFERENT OPERATION THAN `application/DiscoverSnapshotCommand.js`,
// NOT A SECOND WAY TO SPELL THE SAME ONE. That file answers "can THIS ONE
// contentHash be resolved" and returns one resolution outcome; this file
// answers "what candidates exist under this discoveryTag" and returns a
// list, unfiltered by any contentHash. The two stay two legitimate,
// permanently separate application operations — see 0.9.149's own
// ATTRIBUTION-ORIENTED-RESOLUTION-vs-BROWSING-ORIENTED-DISCOVERY diagram.
// This file never imports, calls, or wraps
// `executeDiscoverSnapshotCommand()`, and never imports
// `DecentralizedSnapshotResolver`.
//
// AN ASSEMBLY BOUNDARY, NEVER A SECOND DISCOVERY ALGORITHM. This file
// contains no filtering, no ranking, no deduplication, no retrieval, and
// no verification logic of its own. It calls
// `discoveryQueryService.search()` exactly once per invocation,
// forwarding `discoveryTag` verbatim. Every behavior a caller observes
// through this file is entirely `discoveryQueryService`'s own (which is
// itself entirely `application/NostrSnapshotDiscoveryQueryService.js`'s
// own, unmodified — see that file's own header, "never throws... every
// failure degrades to `[]`").
//
// THE RETURNED RESULT IS `discoveryQueryService`'S OWN RESULT, PASSED
// THROUGH, NEVER RE-DESCRIBED. `executeDiscoverSnapshotCandidatesCommand()`
// resolves to exactly what `discoveryQueryService.search()` itself
// resolved to — the same candidate-array reference, in the same order.
// This file wraps it in no additional envelope, invents no `{ candidates:
// [...] }` shape, sorts nothing, deduplicates nothing, and adds no status
// field of its own. Relay arrival order is an observed fact, not a
// ranking decision this file is entitled to make — the identical
// restraint `application/NostrSnapshotDiscoveryQueryService.js`'s own
// header already holds ("multiple discovery records do not automatically
// become ranking").
//
// `discoveryQueryService` IS THE ONE NEW COLLABORATOR THIS FILE ITSELF
// INTRODUCES, AND THE ONLY ONE IT VALIDATES ITSELF. `discoveryTag` is
// forwarded to `discoveryQueryService.search()` verbatim, unread by this
// file. `discoveryQueryService` is the one argument no earlier boundary
// in this call chain already validates, so this file checks it, once,
// before doing anything else: a non-null value exposing a `search`
// function, duck-typed exactly like every other collaborator in this
// family — never an `instanceof NostrSnapshotDiscoveryQueryService`
// check.
//
// SYNCHRONOUS VALIDATION, SYNCHRONOUS THROW. `executeDiscoverSnapshotCandidatesCommand()`
// is a plain (non-`async`) function. It validates `discoveryQueryService`
// and calls `discoveryQueryService.search()` synchronously, on the
// caller's own call stack, before ever returning a `Promise` — a missing
// or malformed `discoveryQueryService` throws synchronously, exactly
// where it already would calling `discoveryQueryService.search()`
// directly on a bad reference. A genuine rejection from the query
// service's own call would propagate through the returned promise
// unchanged — though `application/NostrSnapshotDiscoveryQueryService.js`'s
// own `search()` never itself rejects (see that file's own header,
// "never throws from search()").
//
// NO CONTENT STORE, NO RESOLVER, NO ATTRIBUTION, AND NO NOSTR CLASS IS
// EVER CONSTRUCTED HERE. Composing `discoveryQueryService` itself stays
// entirely its own caller's concern (`ui/main.js`, or a future
// composition-root sibling file) — this file receives the
// already-composed discovery service and reuses it verbatim, the same
// "one relay client, two independent application seams on top of it"
// posture 0.9.149's own recommendation described.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A UI candidate browser of any kind.** This file has no idea `ui/`
//   exists. See 0.9.149's own "Recommendation" — a later, unscheduled UI
//   milestone.
// - **Ranking, deduplication, filtering by contentHash, or provider
//   preference among returned candidates.** All of that stays entirely
//   inside `discoveryQueryService.search()` — see "an assembly boundary,
//   never a second discovery algorithm" — and today that file performs
//   none of it either.
// - **Retrieval of any candidate's own bytes, hash verification, or
//   Snapshot–Publication attribution.** Those stay
//   `application/DiscoverSnapshotCommand.js`'s (resolution),
//   `content/ContentStore.js#get()`'s (retrieval), and
//   `application/SnapshotPublicationAttribution.js`'s (attribution) own,
//   entirely separate, later concerns — a caller who wants to resolve one
//   specific discovered candidate calls
//   `executeDiscoverSnapshotCommand()` itself, with that candidate's own
//   `contentHash`, after this file has already returned.
// - **A new outcome/status vocabulary of any kind.** A bare candidate
//   array either exists (possibly empty) or this call throws for a
//   caller-contract violation — no `MATCH`/`NO_MATCH`/`RESOLVED` reading
//   is introduced here.
// - **Composition-root Nostr relay configuration, or a second relay
//   client/composition path.** A caller supplies an already-composed
//   `discoveryQueryService` — see "no content store... is ever
//   constructed here," above.
// - **Caching, retries, or automatic/background discovery of any kind.**
//   This file is called once per invocation, by a caller who decides
//   entirely for itself when to call it.

// executeDiscoverSnapshotCandidatesCommand({ discoveryTag,
//   discoveryQueryService }) -> Promise<[{ contentHash, locator, storage }, ...]>.
//
// The application-level command boundary for browsing-oriented Snapshot
// candidate discovery — see this file's own header for the full
// contract. Calls `discoveryQueryService.search()`
// (application/NostrSnapshotDiscoveryQueryService.js, 0.9.133, unmodified)
// with `discoveryTag` forwarded verbatim. Resolves to exactly the
// candidate array the query service itself resolved to — never
// re-described, never re-wrapped, never reordered. Throws synchronously,
// before the query service is ever called, when `discoveryQueryService`
// is missing or does not expose a `search` function.
export function executeDiscoverSnapshotCandidatesCommand({
    discoveryTag,
    discoveryQueryService
} = {}) {
    if (!discoveryQueryService || typeof discoveryQueryService.search !== 'function') {
        throw new Error('executeDiscoverSnapshotCandidatesCommand: a discoveryQueryService with search() is required');
    }

    return discoveryQueryService.search(discoveryTag);
}
