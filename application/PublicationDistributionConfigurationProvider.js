// 0.9.105 — Publication Distribution Configuration Boundary.
//
// 0.9.103 built `executePublicationDistributionCommand()` and 0.9.104 wired
// a real World View click straight through to it, but both stopped
// deliberately short of the one thing still missing: deciding WHERE
// `arweaveUploaderOptions`/`nostrPublisherOptions` — the real signer and
// the real relay-publish capability `orchestratePublicationDistribution()`
// (0.9.58) already accepts — actually come from. Every caller up to and
// including `ui/main.js` itself has left both `undefined`, which is exactly
// why a real click still ends in "Distribution could not be completed."
// This file is that missing decision, made in exactly one place, and
// nothing more:
//
//   whatever this browser/runtime happens to expose today
//        │  (nothing, currently — see this file's own header,
//        │   "Nothing real to resolve yet, and that is the honest answer")
//        ▼
//   application/PublicationDistributionConfigurationProvider.js   ★ (THIS)
//        resolveArweaveUploaderOptions({ signer, gatewayUrl, fetchImpl })
//        resolveNostrPublisherOptions({ publishImpl, relayUrl, discoveryTag, tagName, kind })
//        │
//        ▼
//   a valid options object (forwarded verbatim to 0.9.47's own composed
//   constructors) | `undefined` (0.9.58's own existing, honest "not
//   currently configured" outcome — unchanged)
//        │
//        ▼
//   application/PublicationDistributionCommandComposition.js   (0.9.105,
//        NEW, sibling file — the seam that actually threads this file's
//        own result into a caller-ready `publicationDistributionCommand`)
//
// TWO INDEPENDENT RESOLVERS, NEVER ONE COMBINED "CREDENTIALS" SHAPE.
// Arweave and Nostr have different operational requirements — a signer
// versus a relay-publish capability, a gateway URL versus a relay URL plus
// a discovery tag — and nothing about `orchestratePublicationDistribution()`'s
// own contract ever asks them to share a vocabulary; it already takes
// `arweaveUploaderOptions` and `nostrPublisherOptions` as two entirely
// separate parameters. This file keeps that separation: no
// `PublicationDistributionCredentials`, no shared "provider" class, no
// field either resolver reads off the other's own input. A caller wanting
// only one substrate configured (e.g. Arweave available, Nostr not) calls
// only that one resolver; the other simply returns `undefined`, exactly
// as if this file did not exist for it at all.
//
// EACH RESOLVER DECIDES EXACTLY ONE QUESTION — "IS THERE ENOUGH HERE TO
// EVEN ATTEMPT THIS SUBSTRATE?" — AND DECIDES IT THE SAME DUCK-TYPED WAY
// EVERY COLLABORATOR IN THIS WHOLE FAMILY ALREADY IS. `resolveArweaveUploaderOptions()`
// requires a `signer` exposing a `sign()` function — the one field `new
// ArweavePublicationMaterialUploader()` (0.9.45) itself already refuses to
// be constructed without. `resolveNostrPublisherOptions()` requires a
// `publishImpl` function and a non-empty `discoveryTag` — the two fields
// `new NostrPublicationDiscoveryPublisher()` (0.9.46) itself already
// refuses to be constructed without. Neither resolver duplicates any OTHER
// validation either constructor already performs (a malformed `gatewayUrl`,
// an empty `relayUrl`) — see "Everything else is forwarded verbatim, never
// reinterpreted," below.
//
// EVERYTHING ELSE IS FORWARDED VERBATIM, NEVER REINTERPRETED, NEVER
// DEFAULTED A SECOND TIME. `gatewayUrl`/`fetchImpl` and `relayUrl`/
// `tagName`/`kind` are passed straight through into the returned options
// object exactly as supplied — including `undefined`, when a caller
// doesn't supply one — so that 0.9.45's and 0.9.46's own constructor
// defaults (`DEFAULT_GATEWAY_URL`, `DEFAULT_RELAY_URL`, `DEFAULT_TAG_NAME`,
// `DEFAULT_KIND`) remain the one place those defaults are decided. This
// file adds no default of its own for any of them.
//
// `undefined`, NEVER `null`, IS WHAT AN UNRESOLVABLE SUBSTRATE RETURNS —
// THE ONE DETAIL THAT KEEPS TODAY'S EXISTING FAILURE MESSAGE INTACT.
// `orchestratePublicationDistribution()` destructures `arweaveUploaderOptions`/
// `nostrPublisherOptions` straight into `composePublicationDistributionRuntime({
// arweaveUploaderOptions = {}, nostrPublisherOptions = {} })` — a default
// parameter that only ever applies for `undefined`, never for `null`.
// Returning `null` here instead would replace 0.9.45's own friendly "a
// signer with a sign() method is required" with a much less useful
// "Cannot destructure property 'signer' of 'null'" — a regression this
// file exists to avoid, not introduce.
//
// NOTHING REAL TO RESOLVE YET, AND THAT IS THE HONEST ANSWER — NOT AN
// OVERSIGHT THIS FILE PAPERS OVER. `application/ArweavePublicationMaterialUploader.js`'s
// own header still names "a concrete `signer` implementation" as later,
// unscheduled work; `application/NostrPublicationDiscoveryPublisher.js`'s
// own header still names "a concrete `publishImpl` implementation" the
// identical way. `ui/main.js` (0.9.105) calls both resolvers with an empty
// options object, so both presently resolve `undefined`, and a real World
// View click reaches EXACTLY today's existing synchronous throw — this
// milestone changes no observable behavior in the running app. Its entire
// value is making the DECISION POINT explicit, named, and independently
// testable (see `tests/PublicationDistributionConfigurationProvider.test.js`),
// so that supplying a real signer or `publishImpl` later — a browser
// wallet-extension adapter, mirroring `base/BaseInjectedProviderWalletAdapter.js`'s
// own already-established pattern one substrate over, or any other source
// — touches only the one call site in `ui/main.js` that calls these two
// functions, never `WorldView.js`, never `WorldEncounterCanvas.js`, never
// the command, orchestrator, or executor.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A concrete `signer` or `publishImpl` implementation, or any wallet-
//   extension adapter of either.** See "Nothing real to resolve yet,"
//   above — this file's own contract is unchanged whether its caller
//   supplies a real collaborator or none at all.
// - **Wallet management, key management, or credential persistence of any
//   kind.** Neither resolver generates, stores, reads, or discards
//   anything — each is a pure function of its own single argument, called
//   fresh every time a caller wants an answer.
// - **Environment-variable or config-file parsing.** Both resolvers take
//   already-resolved values as plain fields on their own options object;
//   deciding where those values themselves originate (a browser global, a
//   build-time constant, anything else) is entirely their caller's own
//   concern — this file reads no `process.env`, no `import.meta.env`, and
//   no on-disk file of any kind.
// - **A UI of any kind** — no relay picker, no gateway picker, no
//   "configure distribution" form. Both resolvers are plain functions with
//   no relationship to `ui/` beyond being called from it.
// - **Combining Arweave and Nostr configuration into one shape.** See "Two
//   independent resolvers," above.

// resolveArweaveUploaderOptions({ signer, gatewayUrl, fetchImpl }) ->
//   options object | undefined. See this file's own header for the full
//   contract: `undefined` unless `signer` exposes a `sign()` function;
//   otherwise every field forwarded verbatim, unread, undefaulted.
export function resolveArweaveUploaderOptions({ signer = null, gatewayUrl, fetchImpl } = {}) {
    if (!signer || typeof signer.sign !== 'function') {
        return undefined;
    }
    return Object.freeze({ signer, gatewayUrl, fetchImpl });
}

// resolveNostrPublisherOptions({ publishImpl, relayUrl, discoveryTag,
//   tagName, kind }) -> options object | undefined. See this file's own
//   header for the full contract: `undefined` unless `publishImpl` is a
//   function AND `discoveryTag` is a non-empty string; otherwise every
//   field forwarded verbatim, unread, undefaulted.
export function resolveNostrPublisherOptions({ publishImpl = null, relayUrl, discoveryTag, tagName, kind } = {}) {
    if (typeof publishImpl !== 'function') {
        return undefined;
    }
    if (typeof discoveryTag !== 'string' || discoveryTag.trim().length === 0) {
        return undefined;
    }
    return Object.freeze({ publishImpl, relayUrl, discoveryTag, tagName, kind });
}
