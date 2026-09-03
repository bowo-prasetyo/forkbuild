import { executePublicationDistributionCommand } from './PublicationDistributionCommand.js';

// 0.9.105 — Publication Distribution Configuration Boundary.
//
// 0.9.103's own header already pointed straight at this file: "if the
// existing command can be configured through a closure, the composition
// root could pre-bind it." `ui/main.js` already pre-binds one collaborator
// this way — `publicationDistributionLifecycleStore` — as a hand-rolled
// arrow function. This file generalizes that one-off closure into a named,
// independently testable seam that pre-binds ALL THREE of
// `executePublicationDistributionCommand()`'s own composition-root
// collaborators together: the lifecycle store (0.9.103, unchanged) and the
// two distribution configurations `application/PublicationDistributionConfigurationProvider.js`
// (0.9.105, sibling file) resolves.
//
//   ui/main.js
//        │
//        │  { lifecycleStore, arweaveUploaderOptions, nostrPublisherOptions }
//        ▼
//   application/PublicationDistributionCommandComposition.js   ★ (THIS)
//        composePublicationDistributionCommand({ ... })
//        │
//        ▼
//   (publication, serializedMaterial, ...) -> Promise<PublicationDistributionResult | null>
//        │                                     ★ what World View actually calls
//        ▼
//   executePublicationDistributionCommand({ ...request,             (0.9.103, unmodified)
//       arweaveUploaderOptions, nostrPublisherOptions, lifecycleStore })
//
// A COMPOSITION, NEVER A SECOND COMMAND. This file contains no upload
// logic, no orchestration logic, and no lifecycle logic of its own — it
// calls `executePublicationDistributionCommand()` exactly once per
// returned-function call, forwarding every field of `request` (a caller's
// own `{ publication, serializedMaterial, materialStorage }`, exactly the
// shape `ui/views/WorldView.js`'s own `distributeWorldEncounterPublication()`
// already supplies, unmodified by this milestone) plus the three
// composition-root collaborators bound at composition time. Every behavior
// a caller of the returned function observes is entirely 0.9.103's own.
//
// THE THREE COMPOSITION-ROOT COLLABORATORS ALWAYS WIN OVER ANYTHING A
// CALLER'S OWN `request` HAPPENS TO CARRY — THE SAME RESTRAINT `ui/main.js`'s
// OWN PRE-0.9.105 CLOSURE ALREADY HELD FOR `lifecycleStore` ALONE, EXTENDED
// HERE TO ALL THREE. `request`'s own fields are spread first; `arweaveUploaderOptions`,
// `nostrPublisherOptions`, and `lifecycleStore` are then set explicitly,
// so a caller can never accidentally (or otherwise) override what the
// composition root itself decided — the whole point of pre-binding them
// here in the first place. This is also why `WorldView.js` needs no change
// at all: it already forwards nothing but `{ publication, serializedMaterial
// }`, and would have nothing to gain from supplying more.
//
// WORLD VIEW STILL KNOWS NOTHING ABOUT ANY OF THIS. This file is called
// exactly once, at composition time, in `ui/main.js` — never in `ui/views/`
// or `ui/components/`. `WorldEncounterCanvas.js` and `WorldView.js` remain
// exactly as 0.9.104 left them: both call the one function they were
// handed, `distributionCommand`/`publicationDistributionCommand`, and
// neither imports this file, `application/PublicationDistributionConfigurationProvider.js`,
// or either concrete Arweave/Nostr class.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Resolving `arweaveUploaderOptions`/`nostrPublisherOptions` itself.**
//   That is entirely `application/PublicationDistributionConfigurationProvider.js`'s
//   own job (0.9.105, sibling file) — this file only accepts whatever its
//   caller already resolved and binds it into a closure.
// - **Validating `lifecycleStore`, `arweaveUploaderOptions`, or
//   `nostrPublisherOptions`.** `executePublicationDistributionCommand()`
//   already validates `lifecycleStore`, and `orchestratePublicationDistribution()`'s
//   own composed constructors already validate the other two — duplicating
//   either check here would only give this codebase two places that could
//   quietly disagree about the same rule.
// - **A UI trigger, a class, or a singleton.** A plain function returning a
//   plain function, called once in `ui/main.js`, exactly the way the
//   closure it replaces already was.

// composePublicationDistributionCommand({ lifecycleStore,
//   arweaveUploaderOptions, nostrPublisherOptions }) -> (request) ->
//   Promise<PublicationDistributionResult | null>. See this file's own
//   header for the full contract — the returned function forwards `request`
//   verbatim to `executePublicationDistributionCommand()` (0.9.103,
//   unmodified), with `arweaveUploaderOptions`/`nostrPublisherOptions`/
//   `lifecycleStore` always taken from THIS call's own arguments, never
//   from `request`.
export function composePublicationDistributionCommand({ lifecycleStore, arweaveUploaderOptions, nostrPublisherOptions } = {}) {
    return (request) => executePublicationDistributionCommand({
        ...request,
        arweaveUploaderOptions,
        nostrPublisherOptions,
        lifecycleStore
    });
}
