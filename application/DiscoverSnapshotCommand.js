// 0.9.142 — World View Snapshot Discovery Command.
//
// application/DecentralizedSnapshotResolver.js (0.9.134) already answers
// "can a Snapshot for this contentHash be discovered, retrieved, and
// verified" end to end — Nostr discovery, locator resolution, content
// retrieval, and hash verification, all in one resolve() call. Nothing
// has ever called it outside its own test suite (that file's own header,
// "no composition wiring... nothing outside this milestone's own test
// references DecentralizedSnapshotResolver"). This file is the identical
// "application command boundary" seam application/
// DiscoverWorldEncounterPublicationCommand.js (0.9.111) already
// established for Publication discovery, built here for Snapshot
// discovery instead, and nothing more.
//
//   World View
//        │  { discoveryTag, contentHash }   (contentHash is always an
//        │                                    explicit input — see this
//        │                                    file's own header, below)
//        ▼
//   application/DiscoverSnapshotCommand.js   ★ (THIS)
//        executeDiscoverSnapshotCommand({ discoveryTag, contentHash, resolver, ... })
//        │
//        ▼
//   resolver.resolve(discoveryTag, contentHash, { contentStore, storeRegistry })
//        (application/DecentralizedSnapshotResolver.js, 0.9.134, unmodified)
//        │
//        ▼
//   { outcome, bytes, candidates, locator, storage, reason }
//        (0.9.134's own result, passed through verbatim)
//
// AN ASSEMBLY BOUNDARY, NEVER A SECOND RESOLUTION ALGORITHM — THE SAME
// DISTINCTION application/DiscoverWorldEncounterPublicationCommand.js'S
// OWN HEADER ALREADY PROTECTED ONE STORY OVER. This file contains no
// discovery logic, no locator-resolution logic, no retrieval logic, and
// no verification logic of its own. It calls `resolver.resolve()` exactly
// once per invocation, forwarding `discoveryTag`/`contentHash`/
// `contentStore`/`storeRegistry` verbatim. Every behavior a caller
// observes through this file is entirely `resolver`'s own (which is
// itself entirely application/DecentralizedSnapshotResolver.js's own,
// unmodified).
//
// THE RETURNED RESULT IS THE RESOLVER'S OWN RESULT, PASSED THROUGH, NEVER
// RE-DESCRIBED. `executeDiscoverSnapshotCommand()` resolves to exactly
// what `resolver.resolve()` itself resolved to — the same `{ outcome,
// bytes, candidates, locator, storage, reason }` reference. This file
// wraps it in no additional envelope, invents no `{ discovered: true }`
// shape, and adds no status field of its own — the resolver's own
// `DecentralizedSnapshotResolutionOutcome` vocabulary (RESOLVED,
// NOT_DISCOVERED, STORE_UNAVAILABLE, CONTENT_UNAVAILABLE,
// CONTENT_HASH_MISMATCH) is the only vocabulary a caller of this file
// ever sees.
//
// `contentHash` IS ALWAYS AN EXPLICIT, CALLER-SUPPLIED INPUT, NEVER
// DERIVED OR GUESSED BY THIS FILE. This file never imports `publisher/
// Publication.js`, never reads a `Publication`'s own `contentReference`,
// and never searches Nostr for "whatever looks relevant" and picks a
// candidate itself. A caller who wants to discover the Snapshot for a
// specific Publication resolves that Publication's own
// `contentReference.hash` BEFORE calling this file, exactly the same
// "targeted request, never an open-ended search" restraint every
// resolve() caller in application/DecentralizedSnapshotResolver.js's own
// test suite already holds. This keeps discovery, verification, and
// attribution as three separate questions — see docs/Roadmap.md's own
// 0.9.142 entry, "Discovery must still not imply attribution" — never
// collapsed into one "trusted snapshot" state by this file deciding, on
// its own, which discovered candidate a Publication "belongs to."
//
// `resolver` IS THE ONE NEW COLLABORATOR THIS FILE ITSELF INTRODUCES, AND
// THE ONLY ONE IT VALIDATES ITSELF. `discoveryTag`, `contentHash`,
// `contentStore`, and `storeRegistry` are forwarded to `resolver.resolve()`
// verbatim, unread by this file — validating any of them here would
// duplicate a check application/DecentralizedSnapshotResolver.js's own
// resolve() already owns (it already throws synchronously for a missing
// `discoveryTag`/`contentHash`). `resolver` is the one argument no
// earlier boundary in this call chain already validates, so this file
// checks it, once, before doing anything else: a non-null value exposing
// a `resolve` function, duck-typed exactly like every other collaborator
// in this family — never an `instanceof DecentralizedSnapshotResolver`
// check.
//
// SYNCHRONOUS VALIDATION, SYNCHRONOUS THROW. `executeDiscoverSnapshotCommand()`
// is a plain (non-`async`) function. It validates `resolver` and calls
// `resolver.resolve()` synchronously, on the caller's own call stack,
// before ever returning a `Promise` — a missing or malformed `resolver`
// throws synchronously, exactly where it already would calling
// `resolver.resolve()` directly on a bad reference. A genuine rejection
// from the resolver's own call would propagate through the returned
// promise unchanged — though application/DecentralizedSnapshotResolver.js's
// own resolve() never itself rejects for a discovery/store/network
// failure (see that file's own header, "resolve() never throws for
// anything about discovery, the store, or the network"), only for the
// identical caller-contract violations already excluded above.
//
// NO NOSTR CLASS, NO CONTENT STORE, AND NO REGISTRY IS EVER CONSTRUCTED
// HERE, AND application/DecentralizedSnapshotResolver.js'S OWN
// CONSTRUCTOR IS NEVER CALLED. Composing `resolver` itself — which
// concrete Nostr query service backs it — stays entirely its own
// caller's concern (application/DiscoverSnapshotRuntimeComposition.js,
// sibling file, or ui/main.js directly), exactly the same restraint
// application/DiscoverWorldEncounterPublicationCommand.js already holds
// for its own discovery infrastructure.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A UI trigger of any kind.** This file has no idea `ui/` exists.
// - **Composition-root Nostr relay/content-store configuration, or any
//   concrete queryImpl/store choice.** Composing `resolver` remains
//   entirely this file's own caller's job — see "no Nostr class... is
//   ever constructed here," above.
// - **A second lifecycle state, status, or trust vocabulary.** This file
//   introduces none; the RESOLVED/NOT_DISCOVERED/STORE_UNAVAILABLE/
//   CONTENT_UNAVAILABLE/CONTENT_HASH_MISMATCH vocabulary a caller
//   observes is entirely 0.9.134's own, unmodified.
// - **Snapshot–Publication attribution of any kind** — comparing a
//   resolved Snapshot's content identity against a Publication's own
//   `contentReference.hash` is a separate, later, unscheduled seam (see
//   docs/Roadmap.md's own 0.9.142 entry, "0.9.143 — Snapshot Attribution").
//   This file never imports `publisher/Publication.js` and never performs
//   that comparison.
// - **Ranking discovered candidates, retry, or automatic failover across
//   candidates.** All of that stays entirely inside `resolver.resolve()`
//   — see "an assembly boundary, never a second resolution algorithm."
// - **Caching, or background/automatic discovery of any kind.** This
//   file is called once per invocation, by a caller who decides entirely
//   for itself when to call it.

// executeDiscoverSnapshotCommand({ discoveryTag, contentHash, resolver,
//   contentStore, storeRegistry }) -> Promise<{ outcome, bytes,
//   candidates, locator, storage, reason }>.
//
// The application-level command boundary for initiating a decentralized
// Snapshot discovery/retrieval/verification — see this file's own header
// for the full contract. Calls `resolver.resolve()` (0.9.134, unmodified)
// with `discoveryTag`/`contentHash`/`contentStore`/`storeRegistry`
// forwarded verbatim. Resolves to exactly the `{ outcome, bytes,
// candidates, locator, storage, reason }` result the resolver itself
// resolved to — never re-described, never re-wrapped. Throws
// synchronously, before the resolver is ever called, when `resolver` is
// missing or does not expose a `resolve` function.
export function executeDiscoverSnapshotCommand({
    discoveryTag,
    contentHash,
    resolver,
    contentStore = null,
    storeRegistry = null
} = {}) {
    if (!resolver || typeof resolver.resolve !== 'function') {
        throw new Error('executeDiscoverSnapshotCommand: a resolver with resolve() is required');
    }

    return resolver.resolve(discoveryTag, contentHash, { contentStore, storeRegistry });
}
