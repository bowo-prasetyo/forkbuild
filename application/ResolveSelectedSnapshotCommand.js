// 0.9.152 — Selected Snapshot Candidate Resolution.
//
// `application/DiscoverSnapshotCommand.js` (0.9.142) is the application
// command boundary over `resolver.resolve(discoveryTag, contentHash)` —
// "discover, then resolve WHATEVER matches first." World View's own
// candidate browser (0.9.151) surfaced a genuinely different operation:
// the user already looked at several discovered candidates and explicitly
// picked ONE — resolving that operation needs `resolver.resolveCandidate(candidate)`
// (0.9.152, `application/DecentralizedSnapshotResolver.js`) instead. This
// file is the identical "application command boundary" seam that file
// already established, built here for SELECTED-CANDIDATE resolution.
//
//   World View
//        │  { candidate }   (selectedSnapshotCandidate — the user's own,
//        │                    explicit choice, never re-derived)
//        ▼
//   application/ResolveSelectedSnapshotCommand.js   ★ (THIS)
//        executeResolveSelectedSnapshotCommand({ candidate, resolver, ... })
//        │
//        ▼
//   resolver.resolveCandidate(candidate, { contentStore, storeRegistry })
//        (application/DecentralizedSnapshotResolver.js, 0.9.152, unmodified)
//        │
//        ▼
//   { outcome, bytes, candidates, locator, storage, reason }
//        (0.9.152's own result, passed through verbatim)
//
// AN ASSEMBLY BOUNDARY, NEVER A SECOND RESOLUTION ALGORITHM — THE SAME
// DISTINCTION `application/DiscoverSnapshotCommand.js`'s OWN HEADER
// ALREADY PROTECTS, ONE OPERATION OVER. This file contains no location,
// retrieval, or verification logic of its own. It calls
// `resolver.resolveCandidate()` exactly once per invocation, forwarding
// `candidate`/`contentStore`/`storeRegistry` verbatim. Every behavior a
// caller observes through this file is entirely `resolver`'s own.
//
// THE RETURNED RESULT IS THE RESOLVER'S OWN RESULT, PASSED THROUGH, NEVER
// RE-DESCRIBED — identical restraint, one operation over.
//
// `candidate` IS ALWAYS AN EXPLICIT, CALLER-SUPPLIED INPUT, NEVER
// RE-DERIVED FROM A contentHash. This file never calls
// `executeDiscoverSnapshotCandidatesCommand()`, never searches for a
// candidate itself, and never accepts a bare `contentHash` in its place —
// see `application/DecentralizedSnapshotResolver.js`'s own header, "0.9.152
// — Selected Snapshot Candidate Resolution," for why
// `resolve(candidate.contentHash)` cannot substitute for this operation:
// more than one candidate can share a contentHash, and only the caller's
// own selection identifies which ONE to resolve.
//
// `resolver` IS THE ONE NEW COLLABORATOR THIS FILE ITSELF INTRODUCES, AND
// THE ONLY ONE IT VALIDATES ITSELF — identical restraint, one operation
// over: a non-null value exposing a `resolveCandidate` function, duck-typed
// exactly like every other collaborator in this family.
//
// SYNCHRONOUS VALIDATION, SYNCHRONOUS THROW — identical restraint, one
// operation over. `executeResolveSelectedSnapshotCommand()` is a plain
// (non-`async`) function; a missing or malformed `resolver` throws
// synchronously, before `resolver.resolveCandidate()` is ever called.
//
// NO NOSTR CLASS, NO CONTENT STORE, AND NO REGISTRY IS EVER CONSTRUCTED
// HERE. Composing `resolver` remains entirely its own caller's concern
// (`ui/main.js` — the SAME `resolver` instance `discoverSnapshotCommand`
// already wraps, never a second one).
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A UI trigger of any kind.** This file has no idea `ui/` exists.
// - **Composition-root Nostr relay/content-store configuration, or any
//   concrete queryImpl/store choice.**
// - **Snapshot–Publication attribution of any kind.** Resolving a
//   selected candidate answers "were these bytes retrieved and verified,"
//   never "does this correspond to the current Publication" — a separate,
//   later, unscheduled seam (see `application/SnapshotPublicationAttribution.js`).
// - **Ranking, ordering, or automatic selection of a candidate.** A
//   caller already decided which candidate to resolve before calling this
//   file; this file never looks at any candidate other than the one
//   handed in.
// - **Caching, or background/automatic resolution of any kind.**

// executeResolveSelectedSnapshotCommand({ candidate, resolver,
//   contentStore, storeRegistry }) -> Promise<{ outcome, bytes,
//   candidates, locator, storage, reason }>.
//
// The application-level command boundary for resolving a user-selected
// Snapshot candidate — see this file's own header for the full contract.
// Calls `resolver.resolveCandidate()` (0.9.152, unmodified) with
// `candidate`/`contentStore`/`storeRegistry` forwarded verbatim. Resolves
// to exactly the result the resolver itself resolved to — never
// re-described, never re-wrapped. Throws synchronously, before the
// resolver is ever called, when `resolver` is missing or does not expose
// a `resolveCandidate` function.
export function executeResolveSelectedSnapshotCommand({
    candidate,
    resolver,
    contentStore = null,
    storeRegistry = null
} = {}) {
    if (!resolver || typeof resolver.resolveCandidate !== 'function') {
        throw new Error('executeResolveSelectedSnapshotCommand: a resolver with resolveCandidate() is required');
    }

    return resolver.resolveCandidate(candidate, { contentStore, storeRegistry });
}
