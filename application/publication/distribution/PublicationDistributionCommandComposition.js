import { executePublicationDistributionCommand, executeMultiRelayNostrPublicationDistributionCommand } from './PublicationDistributionCommand.js';

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
// two distribution configurations `application/publication/distribution/PublicationDistributionConfigurationProvider.js`
// (0.9.105, sibling file) resolves.
//
//   ui/main.js
//        │
//        │  { lifecycleStore, arweaveUploaderOptions, nostrPublisherOptions }
//        ▼
//   application/publication/distribution/PublicationDistributionCommandComposition.js   ★ (THIS)
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
// neither imports this file, `application/publication/distribution/PublicationDistributionConfigurationProvider.js`,
// or either concrete Arweave/Nostr class.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Resolving `arweaveUploaderOptions`/`nostrPublisherOptions` itself.**
//   That is entirely `application/publication/distribution/PublicationDistributionConfigurationProvider.js`'s
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
//
// AMENDED BY 0.9.430 — Announcement/Discovery Provider Selection
// Reachability. `arweaveAnnouncementPublisherOptions` (0.9.428) joins
// `arweaveUploaderOptions`/`nostrPublisherOptions` as a THIRD
// composition-root collaborator, pre-bound here exactly the same way —
// always taken from this call's own arguments, never from `request`, per
// "the three composition-root collaborators always win," above, now
// extended to a third. `discoveryProvider` is deliberately NOT added to
// that pre-bound set: it is the one field this whole milestone exists to
// let a CALLER choose per request — see `application/
// PublicationDistributionRuntimeComposition.js`'s own header, "discoveryProvider
// itself is the one new option... a caller states its choice explicitly."
// It therefore reaches `executePublicationDistributionCommand()` purely
// through `...request`'s own existing, unmodified spread, exactly like
// `publication`/`serializedMaterial`/`materialStorage` already do — this
// file adds no new field, no new default, and no new validation for it.

// composePublicationDistributionCommand({ lifecycleStore,
//   arweaveUploaderOptions, nostrPublisherOptions,
//   arweaveAnnouncementPublisherOptions }) -> (request) ->
//   Promise<PublicationDistributionResult | null>. See this file's own
//   header for the full contract — the returned function forwards `request`
//   verbatim to `executePublicationDistributionCommand()` (0.9.103,
//   amended by 0.9.430), with `arweaveUploaderOptions`/`nostrPublisherOptions`/
//   `arweaveAnnouncementPublisherOptions`/`lifecycleStore` always taken from
//   THIS call's own arguments, never from `request` — `request`'s own
//   `discoveryProvider` (0.9.430), when supplied, passes through unchanged.
// AMENDED BY 0.9.670 — Publication Material Storage Selection.
// `ipfsNodeOptions` (a device-level capability — this device's own
// local Kubo API url, exactly like `arweaveUploaderOptions` names this
// device's own signer) joins the pre-bound collaborator set. `materialStorage`
// and `remotePinningProviderOptions` are deliberately NOT pre-bound here —
// `materialStorage` is the one field this whole milestone exists to let a
// CALLER choose per request, the identical restraint this file's own header
// already holds for `discoveryProvider`; `remotePinningProviderOptions`
// carries per-click, ephemeral, never-persisted credentials (mirroring
// `ui/views/WorldView.js`'s own pre-existing Snapshot Remote Pinning path),
// so it can only ever come from a caller's own `request`, never from this
// composition root. Both therefore reach `executePublicationDistributionCommand()`
// purely through `...request`'s own existing, unmodified spread.
export function composePublicationDistributionCommand({ lifecycleStore, arweaveUploaderOptions, ipfsNodeOptions, nostrPublisherOptions, arweaveAnnouncementPublisherOptions, steemPublicationDiscoveryPublisher = null } = {}) {
    return (request) => executePublicationDistributionCommand({
        ...request,
        arweaveUploaderOptions,
        ipfsNodeOptions,
        nostrPublisherOptions,
        arweaveAnnouncementPublisherOptions,
        steemPublicationDiscoveryPublisher,
        lifecycleStore
    });
}

// AMENDED BY 0.9.447 — Nostr Publication Relay Set Configuration. This file
// gains one new, entirely additive export,
// `composeMultiRelayNostrPublicationDistributionCommand()` — the direct
// structural mirror of `composePublicationDistributionCommand()`, above,
// one collaborator over. 0.9.446's own Section F5 named this exact file,
// by name, as "the concrete missing seam" once a real, persisted Nostr
// publication relay set existed to pre-bind: this composition root already
// pre-binds `arweaveUploaderOptions`/`nostrPublisherOptions`/
// `arweaveAnnouncementPublisherOptions`/`lifecycleStore` for the single-
// relay command; `nostrRelayUrls` (ui/main.js's own
// `resolvedNostrRelayUrls`, read once from the unified
// `nostrRelayConfigurationStore`) joins that same pre-bound set here, for the multi-relay
// command specifically.
//
// THE FOUR COMPOSITION-ROOT COLLABORATORS ALWAYS WIN OVER ANYTHING A
// CALLER'S OWN `request` HAPPENS TO CARRY — the identical restraint
// `composePublicationDistributionCommand()`'s own header already holds for
// its own three. `request`'s own fields are spread first;
// `arweaveUploaderOptions`, `nostrRelayUrls`, `nostrPublisherOptions`, and
// `lifecycleStore` are then set explicitly, so a caller can never
// accidentally override what the composition root itself decided.
//
// A COMPOSITION, NEVER A SECOND COMMAND, NEVER A CONFIGURATION RESOLVER OF
// ITS OWN. This function performs no persistence, no validation, and no
// relay-set resolution of any kind — `nostrRelayUrls` arrives already
// resolved, exactly as `arweaveUploaderOptions`/`nostrPublisherOptions`
// already do for the single-relay composer above. Resolving it is entirely
// this function's own caller's job (`ui/main.js`'s `resolvedNostrRelayUrls`,
// read once from `nostrRelayConfigurationStore` at startup), before this
// function is ever invoked.
//
// composeMultiRelayNostrPublicationDistributionCommand({ lifecycleStore,
//   arweaveUploaderOptions, nostrRelayUrls, nostrPublisherOptions }) ->
//   (request) -> Promise<Array<PublicationDistributionResult>>. Forwards
//   `request` verbatim to
//   `executeMultiRelayNostrPublicationDistributionCommand()` (0.9.444), with
//   `arweaveUploaderOptions`/`nostrRelayUrls`/`nostrPublisherOptions`/
//   `lifecycleStore` always taken from THIS call's own arguments, never from
//   `request`.
// AMENDED BY 0.9.670 — Publication Material Storage Selection. `ipfsNodeOptions`
// joins this composer's own pre-bound set the identical way it joins
// `composePublicationDistributionCommand()`'s own, above; `materialStorage`/
// `remotePinningProviderOptions` are, for the identical reasons documented
// there, left to reach `executeMultiRelayNostrPublicationDistributionCommand()`
// purely through `...request`.
export function composeMultiRelayNostrPublicationDistributionCommand({ lifecycleStore, arweaveUploaderOptions, ipfsNodeOptions, nostrRelayUrls, nostrPublisherOptions } = {}) {
    return (request) => executeMultiRelayNostrPublicationDistributionCommand({
        ...request,
        arweaveUploaderOptions,
        ipfsNodeOptions,
        nostrRelayUrls,
        nostrPublisherOptions,
        lifecycleStore
    });
}
