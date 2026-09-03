import { resolveArweaveUploaderOptions, resolveNostrPublisherOptions } from './PublicationDistributionConfigurationProvider.js';

// 0.9.106 — Publication Distribution Runtime Configuration.
//
// 0.9.105's own "Recommendation" named the gap this closes precisely:
// "can the application composition root supply valid collaborators to the
// already-existing distribution infrastructure has a mechanical, tested
// answer: yes, through exactly two named seams" —
// `resolveArweaveUploaderOptions()`/`resolveNostrPublisherOptions()` — but
// `ui/main.js` still called each with its own separate, hand-written `{}`
// literal. Two independent call sites is a fine place to land WHEN both
// truly resolve nothing, exactly as they do today, but it gives a future
// runtime capability (a browser wallet extension, an application-provided
// signer, an externally injected adapter, a development/test signer, or
// any other host-provided source — see this file's own header, "Candidate
// sources," below) no single place to plug into. This file is that one
// place, and nothing more.
//
//   Runtime configuration source (a plain object this environment
//   currently exposes — nothing, today; see "Nothing real to resolve yet")
//        │
//        │  { arweave: { signer, gatewayUrl, fetchImpl }?,
//        │    nostr: { publishImpl, relayUrl, discoveryTag, tagName, kind }? }
//        ▼
//   application/PublicationDistributionRuntimeConfiguration.js   ★ (THIS)
//        resolvePublicationDistributionRuntimeConfiguration({ arweave, nostr })
//        │
//        ├──► resolveArweaveUploaderOptions(arweave || {})   (0.9.105, unmodified)
//        └──► resolveNostrPublisherOptions(nostr || {})      (0.9.105, unmodified)
//        │
//        ▼
//   { arweaveUploaderOptions, nostrPublisherOptions }   (each a valid options object | undefined)
//        │
//        ▼
//   composePublicationDistributionCommand({ lifecycleStore, ... })   (0.9.105, unmodified)
//
// A SHAPE, NEVER A NEW SUFFICIENCY CHECK. This file performs no validation
// of its own — `arweave`/`nostr` are forwarded to the 0.9.105 resolvers
// exactly as given (defaulted only to `{}` when absent, so a caller
// supplying only one substrate's configuration doesn't have to write out
// the other's empty object by hand), and the resolvers alone still decide
// whether a `signer`/`publishImpl` is actually usable. Duplicating that
// check here would only give this codebase two places that could quietly
// disagree about the same rule — exactly what 0.9.105's own header already
// refused for `lifecycleStore`/`arweaveUploaderOptions`/`nostrPublisherOptions`
// validation.
//
// ONE RUNTIME CONFIGURATION SHAPE, NEVER A COMBINED "CREDENTIALS" OBJECT.
// `{ arweave, nostr }` is a grouping of TWO INDEPENDENT sections, not a
// merged vocabulary — this file reads `arweave` and `nostr` as two
// separate fields and never lets one influence the other's resolution,
// preserving the exact operational independence 0.9.105's own header
// already established between the two substrates.
//
// CANDIDATE SOURCES — ALL DELIBERATELY UNIMPLEMENTED HERE. What supplies
// the `{ arweave, nostr }` shape this file consumes is entirely its
// caller's own decision, and stays that way after this milestone: a
// browser wallet extension (mirroring `base/BaseInjectedProviderWalletAdapter.js`'s
// own already-established `window.ethereum`-detection pattern, one
// substrate over), an application-provided signer, an externally injected
// runtime adapter, a development/test signer, or any other host-provided
// capability. This file has no opinion about which — it accepts whatever
// shape it is handed and does nothing else.
//
// `undefined`, NEVER `null`, FLOWS THROUGH UNCHANGED. This file invents no
// default of its own beyond `{}` for an absent `arweave`/`nostr` section —
// see 0.9.105's own header, "`undefined`, never `null`, is what an
// unresolvable substrate returns," for why that distinction matters all
// the way up through `composePublicationDistributionRuntime()`'s own
// default parameters.
//
// NOTHING REAL TO RESOLVE YET, AND THAT IS THE HONEST ANSWER — NOT AN
// OVERSIGHT THIS FILE PAPERS OVER. `ui/main.js` (0.9.106) calls this
// function with a runtime configuration source that is currently just
// `{}` — no browser wallet extension, application-provided signer, or any
// other concrete source is wired up anywhere in this codebase yet (see
// 0.9.105's own header, "Nothing real to resolve yet," which still holds).
// Both resolvers therefore still resolve `undefined`, and a real World
// View click still reaches exactly today's existing synchronous throw —
// **this milestone changes no observable behavior in the currently
// running app.** Its entire value is the one named seam: wiring a real
// runtime configuration source later touches only how `ui/main.js` defines
// the object it passes to this function, never `WorldView.js`, never
// `WorldEncounterCanvas.js`, never the command, orchestrator, or executor
// — and, as of this milestone, not even the two resolver call sites
// themselves.
//
// NO WALLET UI, NO CREDENTIAL PERSISTENCE, NO RELAY-MANAGEMENT UI. This
// file is a plain, side-effect-free function with no relationship to `ui/`
// beyond being called from it, no `localStorage`, no `window` read, no
// form, no environment-variable or config-file parsing — the identical
// restraint `application/PublicationDistributionConfigurationProvider.js`'s
// own header already holds, one layer up.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A concrete `signer` or `publishImpl` implementation, or any wallet-
//   extension adapter of either.** See "Nothing real to resolve yet,"
//   above — later, unscheduled work.
// - **Wallet management, key management, or credential persistence of any
//   kind.** This function generates, stores, reads, and discards nothing —
//   it is a pure function of its own single argument, called fresh every
//   time a caller wants an answer.
// - **Async detection of any runtime source** (connecting to a browser
//   wallet extension, for instance). This function and both resolvers it
//   calls are synchronous — a future source needing asynchronous discovery
//   resolves that entirely before ever calling this function, exactly the
//   way `base/BaseWalletConnection.js`'s own `connect()` already resolves
//   before anything downstream of it runs.
// - **A UI of any kind.**
// - **Combining Arweave and Nostr configuration into one shape beyond the
//   two-field grouping this file itself introduces.** See "One runtime
//   configuration shape, never a combined 'credentials' object," above.

// resolvePublicationDistributionRuntimeConfiguration({ arweave, nostr }) ->
//   { arweaveUploaderOptions, nostrPublisherOptions }. See this file's own
//   header for the full contract: `arweave`/`nostr` (each optional,
//   defaulted to `{}`) are forwarded verbatim to `resolveArweaveUploaderOptions()`/
//   `resolveNostrPublisherOptions()` (0.9.105, unmodified) — this function
//   performs no sufficiency check of its own.
export function resolvePublicationDistributionRuntimeConfiguration({ arweave, nostr } = {}) {
    return Object.freeze({
        arweaveUploaderOptions: resolveArweaveUploaderOptions(arweave || {}),
        nostrPublisherOptions: resolveNostrPublisherOptions(nostr || {})
    });
}
