// 0.9.108 — Nostr Publication Discovery Runtime Adapter.
//
// 0.9.107 finished the provider/factory chain: `createPublicationDistributionRuntimeProvider()`
// accepts a flat host-capability vocabulary (`signer`, `gatewayUrl`,
// `fetchImpl`, `publishImpl`, `relayUrl`, `discoveryTag`, `tagName`, `kind`)
// and regroups it into the shape 0.9.106's own seam already consumes — but
// nothing in this codebase actually PRODUCES a `publishImpl` from a real
// host Nostr capability. `ui/main.js` still calls
// `createPublicationDistributionRuntimeProvider({})`. This file is the
// first thing that closes that gap for Nostr specifically — Arweave's own
// signer capability stays exactly as unaddressed as 0.9.107 left it (see
// this file's own header, "Arweave is deliberately untouched," below).
//
//   host Nostr publishing capability
//   (nothing, today — see "Nothing real to adapt yet, and that is the
//    honest answer")
//        │
//        │  { publish, relayUrl }
//        ▼
//   application/NostrPublicationDistributionRuntimeAdapter.js   ★ (THIS)
//        createNostrPublicationDistributionRuntimeAdapter({ publish, relayUrl })
//        │
//        ▼
//   { publishImpl, relayUrl }
//        │
//        ▼
//   createPublicationDistributionRuntimeProvider({ ...adapted, discoveryTag, tagName, kind })   (0.9.107, unmodified)
//        │
//        ▼
//   resolvePublicationDistributionRuntimeConfiguration({ arweave, nostr })   (0.9.106, unmodified)
//        │
//        ▼
//   composePublicationDistributionCommand({ lifecycleStore, ... })   (0.9.105, unmodified)
//
// A BRIDGE, NEVER A NOSTR ABSTRACTION LAYER INSIDE THE DOMAIN. This file
// has no envelope-shape knowledge, no NIP-01 vocabulary, no relay-selection
// policy, and no opinion about `discoveryTag`/`tagName`/`kind` — those
// remain exactly `application/NostrPublicationDiscoveryPublisher.js`'s own
// (event construction) and its caller's own (which campaign tag, which
// event kind), unrevisited here. `createNostrPublicationDistributionRuntimeAdapter()`
// does exactly one thing: rename a host's own `publish` capability onto the
// `publishImpl` field 0.9.107's own factory already accepts, and forward
// `relayUrl` alongside it, unread and undefaulted. `NostrDiscoveryQueryService.js`
// and `NostrPublicationDiscoveryPublisher.js` remain responsible for every
// existing semantic they already own — this file imports neither.
//
// `publish` AND `relayUrl` ARE WHAT A HOST PROVIDES; `discoveryTag`/
// `tagName`/`kind` ARE FORKBUILD'S OWN CAMPAIGN CONFIGURATION, NEVER A HOST
// CONCERN — THE ONE DESIGN DECISION THIS FILE ITSELF ADDS. A host Nostr
// capability (a browser extension, a NIP-46 signer/broadcast bunker, a
// development/test fixture) can plausibly expose "sign and broadcast this
// event" and "which relay" — that is transport. Which free-form tag names
// ForkBuild's own discovery campaign, which Nostr tag name carries it, and
// which event kind a publication announcement declares are ForkBuild's own
// domain decisions, not something any host capability would know about —
// exactly why `application/NostrPublicationDiscoveryPublisher.js`'s own
// header already leaves `discoveryTag` required, with no ambient default,
// for "a caller" to decide. This file stays a caller of that decision,
// never a second place that makes it: `discoveryTag`/`tagName`/`kind`
// aren't parameters of this function at all — a caller merges them
// alongside this function's own `{ publishImpl, relayUrl }` result directly
// into `createPublicationDistributionRuntimeProvider({ ... })`, exactly as
// `ui/main.js` (0.9.108) does.
//
// `publishImpl` IS A RENAME, NEVER A RE-IMPLEMENTATION OF THE CONTRACT IT
// SATISFIES. `application/NostrPublicationDiscoveryPublisher.js`'s own
// header already documents the exact shape a `publishImpl` must have:
// `(relayUrl, eventTemplate) -> Promise<{ published: true, id } | {
// published: false, reason }>`. A host's own `publish` capability is
// expected to already satisfy that same contract — this file performs no
// signature check, no shape validation, and no wrapping of `publish` in a
// second function. `publishImpl: publish` is the entire transformation;
// whatever `publish` is (a real function, `undefined`, `null`, anything
// else a caller hands this file) flows straight through, exactly as 0.9.107's
// own header already holds for its own flat vocabulary one layer up:
// "A REGROUPING, NEVER A NEW SUFFICIENCY CHECK." Whether the resulting
// `publishImpl` is actually usable remains entirely
// `resolveNostrPublisherOptions()`'s own decision (0.9.105, unmodified) —
// duplicating that check here would only give this codebase two places
// that could quietly disagree about the same rule.
//
// `undefined`, NEVER A THROWN ERROR, IS WHAT AN ABSENT HOST CAPABILITY
// PRODUCES — THE SAME GRACEFUL DEGRADATION EVERY SEAM BELOW THIS ONE
// ALREADY HOLDS. Calling `createNostrPublicationDistributionRuntimeAdapter()`
// with no `publish` (or no argument at all) returns `{ publishImpl:
// undefined, relayUrl: undefined }` — never throws, never logs, never
// probes `window` or any other ambient global for a fallback. A caller
// downstream (0.9.107's own factory, then 0.9.106's own
// `resolveNostrPublisherOptions()`) already treats an `undefined`
// `publishImpl` as "Nostr is not currently configured," exactly today's
// existing, honest outcome.
//
// SYNCHRONOUS — DELIBERATELY, LIKE EVERY SEAM BELOW IT. No `connect()`,
// `await connect()`, `login()`, or `authenticate()` inside this file. If a
// host Nostr capability needs asynchronous setup (a NIP-46 bunker
// handshake, a browser extension permission prompt), that setup resolves
// entirely BEFORE its result — the already-connected `publish` function —
// is ever handed to `createNostrPublicationDistributionRuntimeAdapter()`,
// exactly the restraint `application/PublicationDistributionRuntimeProvider.js`'s
// own header already holds one layer up, and the same place
// `base/BaseWalletConnection.js`'s own `connect()` already resolves before
// anything downstream of it runs.
//
// ARWEAVE IS DELIBERATELY UNTOUCHED. This file imports nothing from
// `application/ArweavePublicationMaterialUploader.js`, reads no `signer`/
// `gatewayUrl`/`fetchImpl` field, and produces no `arweave` section of any
// kind. Arweave's own signing-authority capability is a materially
// different, later, unscheduled milestone — see this file's own roadmap
// entry, "What about Arweave?" — never folded into this one merely because
// both eventually feed the same runtime provider.
//
// NOTHING REAL TO ADAPT YET, AND THAT IS THE HONEST ANSWER — NOT AN
// OVERSIGHT THIS FILE PAPERS OVER. `ui/main.js` (0.9.108) calls
// `createNostrPublicationDistributionRuntimeAdapter({})` — no NIP-46
// bunker, browser extension, or other concrete host Nostr publishing
// capability is wired up anywhere in this codebase yet. `nostrPublisherOptions`
// therefore still resolves `undefined`, and a real World View click still
// reaches exactly today's existing synchronous throw — **this milestone
// changes no observable behavior in the currently running app.** Its
// entire value is proving that a REAL, INJECTABLE, independently tested
// bridge — not a field ui/main.js shapes by hand inside
// `createPublicationDistributionRuntimeProvider({})`'s own argument — is
// the thing standing between a host Nostr capability and this codebase's
// existing `publishImpl` vocabulary, so wiring a real capability later
// touches only the one object `ui/main.js` passes to this function.
//
// NO WALLET UI, NO NOSTR LOGIN, NO KEY MANAGEMENT, NO RELAY-MANAGEMENT UI,
// NO NEW LIFECYCLE STATE. This file is a plain, side-effect-free function
// with no relationship to `ui/` beyond being called from it — no
// `localStorage`, no `window` read, no form, no relay picker, no account
// list. `PublicationDistributionLifecycle.js`, `WorldEncounterCanvas.js`,
// and the Distribution panel are all unimported and unmodified; World View
// remains entirely unaware this file exists.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A concrete host Nostr publishing capability, a NIP-46/NIP-07
//   integration, key management, or any actual signing/broadcast
//   implementation.** See "Nothing real to adapt yet," above — later,
//   unscheduled work, exactly as `application/NostrPublicationDiscoveryPublisher.js`'s
//   own header already leaves `publishImpl` itself.
// - **Nostr account management, identity UI, relay-management UI, private-
//   key storage, key generation, automatic relay discovery, or Nostr
//   login.**
// - **Any new lifecycle state, or any change to
//   `PublicationDistributionLifecycle.js`, `WorldEncounterCanvas.js`, the
//   Distribution panel, the orchestrator, or the executor.**
// - **Asynchronous discovery or connection of any kind.** See
//   "Synchronous — deliberately," above.
// - **An Arweave signing-authority adapter, or any wallet-integration
//   decision for Arweave.** See "Arweave is deliberately untouched,"
//   above — a separate, later, unscheduled milestone.
// - **`discoveryTag`, `tagName`, or `kind` resolution of any kind.** See
//   "`publish` and `relayUrl` are what a host provides," above.

// createNostrPublicationDistributionRuntimeAdapter({ publish, relayUrl }) ->
//   { publishImpl, relayUrl }. See this file's own header for the full
//   contract: `publish` is forwarded verbatim onto the `publishImpl` field
//   `createPublicationDistributionRuntimeProvider()` (0.9.107) already
//   accepts; `relayUrl` is forwarded verbatim alongside it. Neither field is
//   read, validated, or defaulted by this function — an absent `publish`
//   degrades to `publishImpl: undefined`, never a throw.
export function createNostrPublicationDistributionRuntimeAdapter({ publish, relayUrl } = {}) {
    return Object.freeze({
        publishImpl: publish,
        relayUrl
    });
}
