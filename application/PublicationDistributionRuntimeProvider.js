// 0.9.107 — Publication Distribution Runtime Provider.
//
// 0.9.106 closed the last plumbing gap: `ui/main.js` had exactly one seam,
// `resolvePublicationDistributionRuntimeConfiguration({ arweave, nostr })`,
// for a runtime capability to enter this codebase — but the object it fed
// that seam was still a hand-written `{}` literal, because nothing in this
// codebase actually PRODUCED an `{ arweave, nostr }` shape from a host's
// own capability vocabulary. This file is the first thing that does:
//
//   host-provided capabilities (a browser wallet extension's already-
//   connected signer, an application-provided signer, an externally
//   injected adapter, a development/test signer, or any other source —
//   see "Candidate sources," below)
//        │
//        │  { signer?, gatewayUrl?, fetchImpl?,
//        │    publishImpl?, relayUrl?, discoveryTag?, tagName?, kind? }
//        ▼
//   application/PublicationDistributionRuntimeProvider.js   ★ (THIS)
//        createPublicationDistributionRuntimeProvider({ ... })
//        │
//        ▼
//   { resolveRuntimeCapabilities() }
//        │
//        │  .resolveRuntimeCapabilities()
//        ▼
//   { arweave: { signer, gatewayUrl, fetchImpl },
//     nostr: { publishImpl, relayUrl, discoveryTag, tagName, kind } }
//        │
//        ▼
//   resolvePublicationDistributionRuntimeConfiguration({ arweave, nostr })   (0.9.106, unmodified)
//        │
//        ▼
//   composePublicationDistributionCommand({ lifecycleStore, ... })   (0.9.105, unmodified)
//
// A REGROUPING, NEVER A NEW SUFFICIENCY CHECK. This file validates nothing.
// `createPublicationDistributionRuntimeProvider()` takes a flat vocabulary
// of individually optional fields — the union of what
// `resolveArweaveUploaderOptions()`'s and `resolveNostrPublisherOptions()`'s
// own options objects already accept — and regroups them into the two-
// section `{ arweave, nostr }` shape 0.9.106's own seam already consumes.
// Whether any of it is actually enough to attempt a substrate remains
// entirely 0.9.105's own two resolvers' decision, exactly as 0.9.106's own
// header already refused to duplicate that check one layer up. This file
// refuses it one layer up again.
//
// A PROVIDER, NEVER A WALLET. A signer is a capability; a wallet is one
// possible mechanism for obtaining one. This file has no opinion about
// where `signer`/`publishImpl` came from — a browser extension, an
// application service, a development fixture, anything else — it only
// accepts whatever a caller already obtained and regroups it. Nothing here
// is named "Wallet," constructs one, or assumes one exists.
//
// TWO INDEPENDENT SECTIONS, STILL NEVER A COMBINED "CREDENTIALS" SHAPE.
// `resolveRuntimeCapabilities()` always returns both an `arweave` section
// and a `nostr` section, built from disjoint fields of this function's own
// single argument — `signer`/`gatewayUrl`/`fetchImpl` never influence the
// `nostr` section, and `publishImpl`/`relayUrl`/`discoveryTag`/`tagName`/
// `kind` never influence the `arweave` section. Supplying only one
// substrate's fields leaves the other section's fields `undefined`, which
// 0.9.106's own seam already forwards to a resolver that treats an absent
// field as "not currently configured" — never a thrown error, never an
// inferred value borrowed from the other substrate. See
// `tests/PublicationDistributionRuntimeProvider.test.js`, Section C.
//
// A CLOSURE, NEVER A RECOMPUTED SHAPE. `createPublicationDistributionRuntimeProvider()`
// captures its own argument once; `resolveRuntimeCapabilities()` regroups
// that SAME captured argument every time it is called, so a caller can
// call it more than once (as `ui/main.js` and this milestone's own
// flagship test both do exactly once) without needing to keep the original
// capability object around itself.
//
// SYNCHRONOUS — DELIBERATELY, LIKE EVERY SEAM BELOW IT. Neither this file
// nor 0.9.106's own `resolvePublicationDistributionRuntimeConfiguration()`
// introduces `CONNECTING`/`CONNECTED`/`DISCONNECTED` or any asynchronous
// discovery lifecycle. A host capability needing asynchronous connection
// (a browser wallet extension, for instance) resolves that entirely BEFORE
// it is ever handed to `createPublicationDistributionRuntimeProvider()` —
// the identical restraint 0.9.106's own header already held, and the same
// place `base/BaseWalletConnection.js`'s own `connect()` already resolves
// before anything downstream of it runs.
//
// CANDIDATE SOURCES — ALL DELIBERATELY UNIMPLEMENTED HERE. What calls
// `createPublicationDistributionRuntimeProvider()`, and with what, is
// entirely its caller's own decision: `ui/main.js` (0.9.107) calls it with
// an empty object — see "Nothing real to supply yet," below — but a future
// browser wallet-extension adapter (mirroring `base/BaseInjectedProviderWalletAdapter.js`'s
// own already-established `window.ethereum`-detection pattern, one
// substrate over), an application-provided signer, an externally injected
// runtime adapter, or a development/test signer could all call it with
// real fields instead. This file has no opinion about which.
//
// NOTHING REAL TO SUPPLY YET, AND THAT IS THE HONEST ANSWER — NOT AN
// OVERSIGHT THIS FILE PAPERS OVER. `ui/main.js` (0.9.107) calls
// `createPublicationDistributionRuntimeProvider({})` — no browser wallet
// extension, application-provided signer, or any other concrete source is
// wired up anywhere in this codebase yet (see
// `application/ArweavePublicationMaterialUploader.js`'s and
// `application/NostrPublicationDiscoveryPublisher.js`'s own headers, both
// still naming a concrete implementation as later, unscheduled work). Both
// 0.9.105 resolvers therefore still resolve `undefined`, and a real World
// View click still reaches exactly today's existing synchronous throw —
// **this milestone changes no observable behavior in the currently
// running app.** Its entire value is proving that a REAL, INJECTABLE
// factory function — not a hand-shaped object literal — is the thing
// `ui/main.js` calls, so that wiring a real source later touches only the
// one object `ui/main.js` passes to this function, never `WorldView.js`,
// never `WorldEncounterCanvas.js`, never the command, orchestrator,
// executor, or either 0.9.105/0.9.106 seam.
//
// NO WALLET UI, NO CREDENTIAL PERSISTENCE, NO RELAY-MANAGEMENT UI. This
// file is a plain, side-effect-free factory with no relationship to `ui/`
// beyond being called from it, no `localStorage`, no `window` read, no
// form — the identical restraint `application/PublicationDistributionRuntimeConfiguration.js`'s
// own header already holds, one layer down.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A concrete `signer` or `publishImpl` implementation, or any wallet-
//   extension adapter of either.** See "Nothing real to supply yet,"
//   above — later, unscheduled work.
// - **Wallet connection UI, wallet-selection UI, private-key entry or
//   storage, credential persistence of any kind.**
// - **Automatic wallet discovery, Nostr relay-management UI, relay
//   discovery, distribution preferences, retry management, or progress
//   tracking.**
// - **Any new lifecycle state, or any change to
//   `PublicationDistributionLifecycle.js`, `WorldEncounterCanvas.js`, or
//   the Distribution panel.** World View remains entirely unaware this
//   file exists.
// - **Asynchronous discovery of any runtime source.** See "Synchronous —
//   deliberately, like every seam below it," above.
// - **A rule that both substrates must be configured before distribution
//   can be attempted.** See "Two independent sections," above — the
//   existing orchestrator alone decides what supplied capabilities mean.

// createPublicationDistributionRuntimeProvider({ signer, gatewayUrl,
//   fetchImpl, publishImpl, relayUrl, discoveryTag, tagName, kind }) ->
//   { resolveRuntimeCapabilities() -> { arweave, nostr } }. See this file's
//   own header for the full contract: every field is forwarded verbatim
//   into whichever of the two sections it belongs to — no field is read,
//   validated, or defaulted by this function.
export function createPublicationDistributionRuntimeProvider({
    signer,
    gatewayUrl,
    fetchImpl,
    publishImpl,
    relayUrl,
    discoveryTag,
    tagName,
    kind
} = {}) {
    return Object.freeze({
        resolveRuntimeCapabilities: () => Object.freeze({
            arweave: { signer, gatewayUrl, fetchImpl },
            nostr: { publishImpl, relayUrl, discoveryTag, tagName, kind }
        })
    });
}
