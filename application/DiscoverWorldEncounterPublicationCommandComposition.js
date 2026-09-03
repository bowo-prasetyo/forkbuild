import { executeDiscoverWorldEncounterPublicationCommand } from './DiscoverWorldEncounterPublicationCommand.js';

// 0.9.111 — World View Decentralized Publication Retrieval.
//
// `executeDiscoverWorldEncounterPublicationCommand()`'s own `runtime` is a
// composition-root collaborator (0.9.110's own composed discovery runtime);
// `publications` is caller-owned local evidence a real composition root
// reads fresh on every call (see 0.9.110's own header, "`publications` is
// the caller's own evidence source, never fetched here"). This file
// generalizes both into one pre-bound closure, exactly mirroring
// `application/PublicationDistributionCommandComposition.js`'s own shape,
// one story over.
//
//   ui/main.js
//        │
//        │  { runtime, discoveryProvider }
//        ▼
//   application/DiscoverWorldEncounterPublicationCommandComposition.js   ★ (THIS)
//        composeDiscoverWorldEncounterPublicationCommand({ ... })
//        │
//        ▼
//   ({ objectId, discoveryTag }) -> Promise<{ discovery, resolution, inspection }>
//        │                                     ★ what World View actually calls
//        ▼
//   executeDiscoverWorldEncounterPublicationCommand({ objectId,          (0.9.111, unmodified)
//       discoveryTag, publications: discoveryProvider.list(), runtime })
//
// A COMPOSITION, NEVER A SECOND COMMAND. This file contains no discovery
// logic, no resolution logic, and no material logic of its own — it calls
// `executeDiscoverWorldEncounterPublicationCommand()` exactly once per
// returned-function call. Every behavior a caller of the returned function
// observes is entirely 0.9.111's own (which is itself entirely 0.9.110's
// own, unmodified).
//
// `publications` IS READ FRESH ON EVERY CALL, NEVER CACHED AT COMPOSITION
// TIME. `discoveryProvider` (typically a fresh `LocalDiscoveryProvider`
// reading the SAME `forkbuild-publications` storage key
// `LocalWorldEncounterMaterialSource` itself already reads) is bound once,
// at composition time — but its own `.list()` is called inside the returned
// closure, once per invocation, so every discovery call sees this replica's
// CURRENT local publications, never a stale snapshot taken when `ui/main.js`
// first started.
//
// `runtime` ALWAYS WINS OVER ANYTHING A CALLER'S OWN REQUEST HAPPENS TO
// CARRY — THE SAME RESTRAINT `PublicationDistributionCommandComposition.js`
// ALREADY HOLDS FOR ITS OWN THREE COMPOSITION-ROOT COLLABORATORS. A caller
// of the returned function supplies only `{ objectId, discoveryTag }`;
// `runtime` and `publications` are always taken from this file's own
// composition-time arguments, never overridable by a caller.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Composing `runtime` itself.** That remains `application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js`'s
//   own job (0.9.110, unmodified) — this file only accepts whatever its
//   caller already composed and binds it into a closure.
// - **Validating `runtime` or `discoveryProvider`.**
//   `executeDiscoverWorldEncounterPublicationCommand()` already validates
//   `runtime`; a malformed `discoveryProvider` simply throws wherever its
//   own `.list()` call already would.
// - **A UI trigger, a class, or a singleton.** A plain function returning a
//   plain function, called once in `ui/main.js`.

// composeDiscoverWorldEncounterPublicationCommand({ runtime, discoveryProvider })
//   -> ({ objectId, discoveryTag }) -> Promise<{ discovery, resolution, inspection }>.
// See this file's own header for the full contract — the returned function
// reads `discoveryProvider.list()` fresh on every call and forwards it,
// alongside `objectId`/`discoveryTag`, to
// `executeDiscoverWorldEncounterPublicationCommand()` (0.9.111, unmodified),
// with `runtime` always taken from THIS call's own arguments.
// `discoveryProvider` is optional — when absent, `publications` is simply
// an empty array, exactly like a discovery call with no local evidence to
// offer.
export function composeDiscoverWorldEncounterPublicationCommand({ runtime, discoveryProvider } = {}) {
    return ({ objectId, discoveryTag } = {}) => executeDiscoverWorldEncounterPublicationCommand({
        objectId,
        discoveryTag,
        publications: discoveryProvider ? discoveryProvider.list() : [],
        runtime
    });
}
