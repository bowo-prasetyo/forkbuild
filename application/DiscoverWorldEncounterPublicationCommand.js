// 0.9.111 — World View Decentralized Publication Retrieval.
//
// 0.9.110's own composition root (`DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js`)
// already produces one application-facing capability —
// `discoverWorldEncounterPublication({ objectId, discoveryTag, publications })`
// — but `ui/main.js` called it from a bare, unnamed, untested closure. This
// file is that closure's own named, independently testable home — the same
// "application command boundary" seam `application/PublicationDistributionCommand.js`
// (0.9.103) already established one story over, for the OTHER World View
// publication capability (distribution instead of discovery).
//
//   ui/views/WorldView.js
//        │
//        │  { objectId, discoveryTag }
//        ▼
//   application/DiscoverWorldEncounterPublicationCommand.js   ★ (THIS)
//        executeDiscoverWorldEncounterPublicationCommand({ ... })
//        │
//        ▼
//   runtime.discoverWorldEncounterPublication({ objectId, discoveryTag, publications })
//        (0.9.110's own composed runtime, unmodified)
//        │
//        ▼
//   { discovery, resolution, inspection }   (0.9.110's own result, passed through verbatim)
//
// AN ASSEMBLY BOUNDARY, NEVER A SECOND DISCOVERY ALGORITHM — THE SAME
// DISTINCTION `PublicationDistributionCommand.js`'s OWN HEADER ALREADY
// PROTECTED ONE LAYER EARLIER, ONE STORY OVER. This file contains no
// discovery logic, no lead-resolution logic, no material-loading logic, and
// no verification logic of its own. It calls `runtime.discoverWorldEncounterPublication()`
// exactly once per invocation, forwarding `objectId`/`discoveryTag`/
// `publications` verbatim. Every behavior a caller observes through this
// file is entirely 0.9.110's own (which is itself entirely the unmodified
// 0.9.24-through-0.9.43 chain's own).
//
// THE RETURNED RESULT IS 0.9.110's OWN RESULT, PASSED THROUGH, NEVER
// RE-DESCRIBED. `executeDiscoverWorldEncounterPublicationCommand()` resolves
// to exactly what `runtime.discoverWorldEncounterPublication()` itself
// resolved to — the same `{ discovery, resolution, inspection }` reference.
// This file wraps it in no additional envelope, invents no `{ commanded:
// true }` shape, and adds no status field of its own.
//
// `runtime` IS THE ONE NEW COLLABORATOR THIS FILE ITSELF INTRODUCES, AND THE
// ONLY ONE IT VALIDATES ITSELF. `objectId`, `discoveryTag`, and
// `publications` are forwarded to `runtime.discoverWorldEncounterPublication()`
// verbatim, unread by this file — validating any of them here would
// duplicate a check 0.9.110's own chain already owns at whichever layer
// actually needs it. `runtime` is the one argument no earlier boundary in
// this call chain already validates, so this file checks it, once, before
// doing anything else: a non-null value exposing a `discoverWorldEncounterPublication`
// function, duck-typed exactly like every other collaborator in this
// family — never an `instanceof` check against a concrete composition
// return shape.
//
// SYNCHRONOUS VALIDATION, SYNCHRONOUS THROW. `executeDiscoverWorldEncounterPublicationCommand()`
// is a plain (non-`async`) function. It validates `runtime` and calls
// `runtime.discoverWorldEncounterPublication()` synchronously, on the
// caller's own call stack, before ever returning a `Promise` — a missing or
// malformed `runtime` throws synchronously, exactly where it already would
// calling `runtime.discoverWorldEncounterPublication()` directly on a bad
// reference. A genuine rejection from the runtime's own call (e.g. a
// configured discovery service's own query genuinely failing) propagates
// through the returned promise unchanged; this file never wraps that call
// in a `try`/`catch`.
//
// NO ARWEAVE/NOSTR CLASS, NO REGISTRY, AND NO VERIFIER IS EVER CONSTRUCTED
// HERE, AND `DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js`
// IS NEVER IMPORTED. Composing `runtime` itself — which concrete discovery
// services exist, which lead registry backs it, which material sources and
// verifier it loads/verifies through — stays entirely its own caller's
// concern (`application/DiscoverWorldEncounterPublicationCommandComposition.js`,
// sibling file, or `ui/main.js` directly), exactly the same restraint
// `PublicationDistributionCommand.js` already holds for distribution
// infrastructure.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A UI trigger of any kind.** This file has no idea `ui/` exists.
// - **Composition-root discovery-service configuration, or any concrete
//   Arweave/Nostr choice.** Composing `runtime` remains entirely this
//   file's own caller's job — see "no Arweave/Nostr class... is ever
//   constructed here," above.
// - **A second lifecycle state, status, or trust vocabulary.** This file
//   introduces none; the resolution/loading/verification vocabulary a
//   caller observes is entirely 0.9.28's/0.9.21's/0.9.37's own, unmodified.
// - **Ranking discovered publications, evidence derivation, or lead
//   resolution.** All of that stays entirely inside `runtime.discoverWorldEncounterPublication()`
//   — see "an assembly boundary, never a second discovery algorithm."
// - **Retries, caching, or background/automatic discovery of any kind.**
//   This file is called once per invocation, by a caller who decides
//   entirely for itself when to call it.

// executeDiscoverWorldEncounterPublicationCommand({ objectId, discoveryTag,
//   publications, runtime }) -> Promise<{ discovery, resolution, inspection }>.
//
// The application-level command boundary for initiating a decentralized
// Publication discovery/retrieval — see this file's own header for the
// full contract. Calls `runtime.discoverWorldEncounterPublication()`
// (0.9.110, unmodified) with `objectId`/`discoveryTag`/`publications`
// forwarded verbatim. Resolves to exactly the `{ discovery, resolution,
// inspection }` result the runtime itself resolved to — never re-described,
// never re-wrapped. Throws synchronously, before the runtime is ever
// called, when `runtime` is missing or does not expose a
// `discoverWorldEncounterPublication` function.
export function executeDiscoverWorldEncounterPublicationCommand({
    objectId,
    discoveryTag,
    publications,
    runtime
} = {}) {
    if (!runtime || typeof runtime.discoverWorldEncounterPublication !== 'function') {
        throw new Error('executeDiscoverWorldEncounterPublicationCommand: a runtime with discoverWorldEncounterPublication() is required');
    }

    return runtime.discoverWorldEncounterPublication({ objectId, discoveryTag, publications });
}
