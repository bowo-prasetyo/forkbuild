// 0.9.109 — Arweave Publication Distribution Runtime Adapter.
//
// 0.9.108 closed this gap for Nostr specifically, and named Arweave's own
// signing-authority capability as the one thing it deliberately left
// untouched — "a separate, later, unscheduled milestone." This file is
// that milestone, the symmetric counterpart to 0.9.108's own shape:
//
//   host signing capability
//   (nothing, today — see "Nothing real to adapt yet, and that is the
//    honest answer")
//        │
//        │  { signer, gatewayUrl, fetchImpl }
//        ▼
//   application/ArweavePublicationDistributionRuntimeAdapter.js   ★ (THIS)
//        createArweavePublicationDistributionRuntimeAdapter({ signer, gatewayUrl, fetchImpl })
//        │
//        ▼
//   { signer, gatewayUrl, fetchImpl }
//        │
//        ▼
//   createPublicationDistributionRuntimeProvider({ ...adapted, publishImpl, relayUrl, discoveryTag, tagName, kind })   (0.9.107, unmodified)
//        │
//        ▼
//   resolvePublicationDistributionRuntimeConfiguration({ arweave, nostr })   (0.9.106, unmodified)
//        │
//        ▼
//   composePublicationDistributionCommand({ lifecycleStore, ... })   (0.9.105, unmodified)
//
// A SEAM, NEVER A RENAME — THE ONE DIFFERENCE FROM 0.9.108's OWN SHAPE.
// Nostr's own adapter had actual translation work to do: a host capability
// named `publish` from its own vantage point had to be renamed onto the
// `publishImpl` field the runtime provider already expects. Arweave's own
// runtime provider already expects a field named exactly `signer` — the
// SAME name `application/ArweavePublicationMaterialUploader.js`'s own
// constructor (0.9.45) established first, and the same name a host signing
// capability is expected to already carry. `createArweavePublicationDistributionRuntimeAdapter()`
// therefore performs no renaming — `signer`/`gatewayUrl`/`fetchImpl` pass
// through completely unchanged. It exists anyway, as a named, independently
// testable function rather than an inline object literal a caller shapes by
// hand, for the exact reason 0.9.107's own header already gave for itself:
// a future host signer source (a browser wallet extension, an
// application-provided signer, a development/test fixture) plugs into ONE
// function this codebase already calls, rather than into a `{}` literal
// `ui/main.js` shapes inline. The seam is the value, not a transformation.
//
// `SIGNER`, NEVER A CREDENTIAL — THE ONE DISTINCTION THIS FILE IS
// PARTICULARLY STRICT ABOUT. This adapter accepts an already-usable
// capability: something exposing `signer.sign(material) -> Promise<{ id,
// transaction }>`, exactly the contract `application/ArweavePublicationMaterialUploader.js`'s
// own header already documents. It does NOT accept a `privateKey`, a
// `mnemonic`, a `seed`, or a `walletPassword`, and it performs no
// transformation of any such thing into a signer — doing so would cross
// this file from a runtime adapter into credential management, a
// materially different and explicitly unwanted responsibility. The
// intended chain is:
//
//   wallet / host / external provider
//                │
//                ▼
//           signer capability
//                │
//                ▼
//   createArweavePublicationDistributionRuntimeAdapter()   (THIS)
//                │
//                ▼
//           existing uploader
//
// Whatever turns a key, a mnemonic, or a wallet connection into something
// exposing `sign()` happens entirely upstream of this file, and stays there
// — this file never reads a `privateKey`/`mnemonic`/`seed`/`walletPassword`
// field, never imports a signing library, and never constructs a signer
// itself. It only accepts one, already made.
//
// A REGROUPING, NEVER A NEW SUFFICIENCY CHECK. Whether the `signer` this
// file is handed is actually usable — whether it exposes a `sign()`
// function at all — remains entirely `resolveArweaveUploaderOptions()`'s
// own decision (0.9.105, unmodified). This file performs no shape
// validation of its own; duplicating that check here would only give this
// codebase two places that could quietly disagree about the same rule,
// exactly the restraint 0.9.108's own header already held for `publishImpl`.
//
// `undefined`, NEVER A THROWN ERROR, IS WHAT AN ABSENT HOST CAPABILITY
// PRODUCES — THE SAME GRACEFUL DEGRADATION EVERY SEAM BELOW THIS ONE
// ALREADY HOLDS. Calling `createArweavePublicationDistributionRuntimeAdapter()`
// with no `signer` (or no argument at all) returns `{ signer: undefined,
// gatewayUrl: undefined, fetchImpl: undefined }` — never throws, never
// logs, never probes `window` or any other ambient global for a fallback.
// A caller downstream (0.9.107's own factory, then 0.9.105's own
// `resolveArweaveUploaderOptions()`) already treats an absent `signer` as
// "Arweave is not currently configured," exactly today's existing, honest
// outcome.
//
// SYNCHRONOUS — DELIBERATELY, LIKE EVERY SEAM BELOW IT. No `connect()`,
// `await connect()`, `login()`, or `unlock()` inside this file. If a host
// signing capability needs asynchronous setup (a wallet-extension
// permission prompt, a hardware-wallet handshake), that setup resolves
// entirely BEFORE its result — the already-usable `signer` — is ever
// handed to `createArweavePublicationDistributionRuntimeAdapter()`, exactly
// the restraint `application/PublicationDistributionRuntimeProvider.js`'s
// own header already holds one layer up, and the same place
// `base/BaseWalletConnection.js`'s own `connect()` already resolves before
// anything downstream of it runs.
//
// NOSTR IS DELIBERATELY UNTOUCHED — THE REVERSE OF 0.9.108's OWN
// RESTRAINT. This file imports nothing from
// `application/NostrPublicationDiscoveryPublisher.js` or
// `application/NostrPublicationDistributionRuntimeAdapter.js`, reads no
// `publishImpl`/`relayUrl`/`discoveryTag`/`tagName`/`kind` field, and
// produces no `nostr` section of any kind. 0.9.108's own adapter remains
// the one place a host Nostr capability is translated; this file is never
// folded into it merely because both eventually feed the same runtime
// provider — the identical line 0.9.108's own header already drew, held
// here in the opposite direction.
//
// NOTHING REAL TO ADAPT YET, AND THAT IS THE HONEST ANSWER — NOT AN
// OVERSIGHT THIS FILE PAPERS OVER. `ui/main.js` (0.9.109) calls
// `createArweavePublicationDistributionRuntimeAdapter({})` — no wallet
// extension, hardware signer, or other concrete host Arweave signing
// capability is wired up anywhere in this codebase yet. `arweaveUploaderOptions`
// therefore still resolves `undefined`, and a real World View click still
// reaches exactly today's existing synchronous throw — **this milestone
// changes no observable behavior in the currently running app.** Its
// entire value is proving that a REAL, INJECTABLE, independently tested
// bridge — not a field `ui/main.js` shapes by hand inside
// `createPublicationDistributionRuntimeProvider({})`'s own argument — is
// the thing standing between a host signing capability and this codebase's
// existing `signer` vocabulary, so wiring a real capability later touches
// only the one object `ui/main.js` passes to this function.
//
// NO WALLET SYSTEM. This file is deliberately NOT "ForkBuild Wallet
// Integration" — it introduces no wallet identity, no connection flow, no
// account list, no permission model, no disconnect handling, no
// persistence, and no UI of any kind. A wallet remains merely one possible
// PROVIDER of a `signer`; this file has no opinion about where its `signer`
// argument came from, the identical restraint
// `application/PublicationDistributionRuntimeProvider.js`'s own header
// already holds ("a provider, never a wallet").
//
// NO KEY MANAGEMENT, NO ACCOUNT MANAGEMENT, NO GATEWAY SELECTION POLICY,
// NO NEW LIFECYCLE STATE. This file is a plain, side-effect-free function
// with no relationship to `ui/` beyond being called from it — no
// `localStorage`, no `window` read, no form, no gateway picker, no account
// list. `PublicationDistributionLifecycle.js`, `WorldEncounterCanvas.js`,
// and the Distribution panel are all unimported and unmodified; World View
// remains entirely unaware this file exists.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A concrete host Arweave signing capability, a wallet-extension
//   integration, key generation, or any actual signing implementation.**
//   See "Nothing real to adapt yet," above — later, unscheduled work,
//   exactly as `application/ArweavePublicationMaterialUploader.js`'s own
//   header already leaves `signer` itself.
// - **Turning a `privateKey`/`mnemonic`/`seed`/`walletPassword` into a
//   signer.** See "`signer`, never a credential," above — that is
//   credential management, not a runtime adapter's job.
// - **Wallet account management, identity UI, key storage, key generation,
//   or wallet login/connection UI of any kind.**
// - **Any new lifecycle state, or any change to
//   `PublicationDistributionLifecycle.js`, `WorldEncounterCanvas.js`, the
//   Distribution panel, the orchestrator, or the executor.**
// - **Asynchronous discovery or connection of any kind.** See
//   "Synchronous — deliberately," above.
// - **Any change to Nostr's own runtime adapter, or any Nostr-side
//   decision.** See "Nostr is deliberately untouched," above.
// - **Gateway selection, gateway-URL validation, or any Arweave transaction
//   knowledge of any kind.** See this file's own contract, below — every
//   field is forwarded verbatim, unread.

// createArweavePublicationDistributionRuntimeAdapter({ signer, gatewayUrl,
//   fetchImpl }) -> { signer, gatewayUrl, fetchImpl }. See this file's own
// header for the full contract: every field is forwarded verbatim onto the
// identically-named field `createPublicationDistributionRuntimeProvider()`
// (0.9.107) already accepts — no field is read, validated, renamed, or
// defaulted by this function. An absent `signer` degrades to `signer:
// undefined`, never a throw.
export function createArweavePublicationDistributionRuntimeAdapter({ signer, gatewayUrl, fetchImpl } = {}) {
    return Object.freeze({
        signer,
        gatewayUrl,
        fetchImpl
    });
}
