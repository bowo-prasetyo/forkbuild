// 0.9.158 — Selected Snapshot Materialization.
//
// application/ResolveSelectedSnapshotCommand.js (0.9.152) is the
// application-command boundary over `resolver.resolveCandidate(candidate)`
// — a UI holds no `resolver` collaborator itself, only the thin function
// this file's own sibling exposes. This file is the IDENTICAL boundary,
// one operation over, for `materializer.execute(resolution)`:
//
//   World View
//        │  { resolution }   (selectedSnapshotResolutionResult — the
//        │                     ALREADY-COMPUTED result of a prior
//        │                     resolveSelectedSnapshotCommand() call,
//        │                     never re-resolved here)
//        ▼
//   application/MaterializeSelectedSnapshotCommand.js   ★ (THIS)
//        executeMaterializeSelectedSnapshotCommand({ resolution, materializer })
//        │
//        ▼
//   materializer.execute(resolution)
//        (application/MaterializeSnapshotFromSelectedCandidateUseCase.js,
//        0.9.158, unmodified)
//        │
//        ▼
//   { outcome, contentHash, contentReference, reason, source }
//        (0.9.158's own result, passed through verbatim)
//
// AN ASSEMBLY BOUNDARY, NEVER A SECOND MATERIALIZATION ALGORITHM — THE
// SAME DISTINCTION application/ResolveSelectedSnapshotCommand.js's OWN
// HEADER ALREADY PROTECTS, ONE OPERATION OVER. This file contains no
// storage, hashing, or verification logic of its own. It calls
// `materializer.execute()` exactly once per invocation, forwarding
// `resolution` verbatim. Every behavior a caller observes through this
// file is entirely `materializer`'s own.
//
// `resolution` IS ALWAYS AN EXPLICIT, CALLER-SUPPLIED INPUT — THE OUTPUT
// OF A PRIOR, SEPARATE `resolveSelectedSnapshotCommand()` CALL, NEVER
// RE-DERIVED FROM A CANDIDATE. This file never calls
// `executeResolveSelectedSnapshotCommand()`, never accepts a bare
// candidate/contentHash in its place, and never re-resolves anything —
// see `application/MaterializeSnapshotFromSelectedCandidateUseCase.js`'s
// own header, "consumes the resolution result, never the candidate," for
// why a candidate cannot substitute for this operation's own input.
//
// `materializer` IS THE ONE NEW COLLABORATOR THIS FILE ITSELF INTRODUCES,
// AND THE ONLY ONE IT VALIDATES ITSELF — identical restraint, one
// operation over: a non-null value exposing an `execute` function,
// duck-typed exactly like every other collaborator in this family.
//
// SYNCHRONOUS VALIDATION, SYNCHRONOUS THROW — identical restraint, one
// operation over. `executeMaterializeSelectedSnapshotCommand()` is a plain
// (non-`async`) function; a missing or malformed `materializer` throws
// synchronously, before `materializer.execute()` is ever called.
//
// NO USE CASE, NO STORE, AND NO REGISTRY IS EVER CONSTRUCTED HERE.
// Composing `materializer` remains entirely its own caller's concern
// (`ui/main.js` — the SAME `storeSnapshotContentUseCase` instance every
// other explicit materialization action already shares, never a second
// one).
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A UI trigger of any kind.** This file has no idea `ui/` exists.
// - **Composition-root wiring of any kind.**
// - **Snapshot–Publication attribution, or any World placement/rendering
//   decision.** Materializing a selected candidate answers "were these
//   already-verified bytes turned into local possession," never "does
//   this correspond to the current Publication" or "where does it belong
//   in the World" — see application/
//   MaterializeSnapshotFromSelectedCandidateUseCase.js's own header.
// - **Ranking, ordering, or automatic materialization of any kind.** A
//   caller already resolved the one candidate to materialize before
//   calling this file.
// - **Caching, or background/automatic materialization of any kind.**

// executeMaterializeSelectedSnapshotCommand({ resolution, materializer })
//   -> Promise<{ outcome, contentHash, contentReference, reason, source }>.
//
// The application-level command boundary for materializing an
// already-resolved, user-selected Snapshot candidate — see this file's
// own header for the full contract. Calls `materializer.execute()`
// (0.9.158, unmodified) with `resolution` forwarded verbatim. Resolves to
// exactly the result the materializer itself resolved to — never
// re-described, never re-wrapped. Throws synchronously, before the
// materializer is ever called, when `materializer` is missing or does not
// expose an `execute` function.
export function executeMaterializeSelectedSnapshotCommand({ resolution, materializer } = {}) {
    if (!materializer || typeof materializer.execute !== 'function') {
        throw new Error('executeMaterializeSelectedSnapshotCommand: a materializer with execute() is required');
    }

    return materializer.execute(resolution);
}
