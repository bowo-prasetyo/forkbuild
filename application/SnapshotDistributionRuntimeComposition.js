import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { NostrSnapshotDiscoveryPublisher } from './NostrSnapshotDiscoveryPublisher.js';

// 0.9.137 — Snapshot Distribution Runtime Composition.
//
// 0.9.136's own header named the exact gap this file closes:
// `application/SnapshotDistributionCommand.js` takes an already-constructed
// `contentStore`/`discoveryPublisher` pair and is, in its own words,
// "composable, not composed" — nothing in this codebase turns a host's own
// Arweave/Nostr capability into that pair. `application/
// PublicationDistributionRuntimeComposition.js` (0.9.47) already closed the
// identical gap for the Signed Claim family; this file is that same seam,
// built for the Snapshot family instead, and nothing more.
//
//   arweaveContentStoreOptions{ signer, gatewayUrl, fetchImpl, ... }
//        │  (a caller already resolved `signer` from SOMEWHERE — most
//        │   naturally `arweave/ArweaveInjectedProviderSigner.js`'s own
//        │   `createArweaveInjectedProviderSigner({ injectedProvider:
//        │   window.arweaveWallet })`, unimported here — see "no browser
//        │   API of any kind," below)
//        ▼
//   application/SnapshotDistributionRuntimeComposition.js   ★ (THIS)
//        composeSnapshotDistributionRuntime({
//            arweaveContentStoreOptions,
//            nostrSnapshotDiscoveryPublisherOptions
//        })
//        │
//        ├──► new ArweaveContentStore(arweaveContentStoreOptions)              (content/ArweaveContentStore.js,
//        │        — only when `arweaveContentStoreOptions.signer` is usable;    0.9.132, unmodified)
//        │        `null` otherwise, never a throw — see "graceful
//        │        degradation," below
//        │
//        └──► new NostrSnapshotDiscoveryPublisher(                            (application/
//                 nostrSnapshotDiscoveryPublisherOptions)                       NostrSnapshotDiscoveryPublisher.js,
//                 — only when `publishImpl`/`discoveryTag` are both usable;     0.9.133, unmodified)
//                 `null` otherwise, never a throw
//        │
//        ▼
//   { contentStore, discoveryPublisher }
//        │
//        │   a caller's own sequence — never this file's own:
//        ▼
//   executeSnapshotDistributionCommand({ bytes, contentStore, discoveryPublisher })   (application/
//                                                                                       SnapshotDistributionCommand.js,
//                                                                                       0.9.136, unmodified — and NOT
//                                                                                       imported or called by this file;
//                                                                                       see "composition, never
//                                                                                       orchestration," below)
//
// COMPOSITION, NEVER A FOURTH COLLABORATOR AND NEVER A NEW ORCHESTRATION
// ENTRY POINT. This file contains no Arweave transaction construction, no
// Nostr event construction, no gateway/relay I/O of its own, and no
// sequencing of `put()`/`publish()` of any kind — it does not even import
// `application/SnapshotDistributionCommand.js`. Its only job is object
// construction: decide, per substrate, whether there is enough here to even
// ATTEMPT it, build the one collaborator that decision allows, and hand
// both back together. Every behavior a caller ever observes through either
// returned collaborator is entirely `content/ArweaveContentStore.js`'s or
// `application/NostrSnapshotDiscoveryPublisher.js`'s own, unmodified.
//
// GRACEFUL DEGRADATION, NEVER A THROW, FOR AN ABSENT CAPABILITY — THE SAME
// "undefined/null, never a throw" RESTRAINT `arweave/
// ArweaveInjectedProviderSigner.js` AND `nostr/
// NostrInjectedProviderPublisher.js` (0.9.121) ALREADY HOLD ONE LAYER
// EARLIER, HELD HERE FOR THE COLLABORATOR THIS FILE BUILDS FROM THEIR
// OUTPUT. `content/ArweaveContentStore.js`'s own constructor already throws
// synchronously when handed no usable `signer` — the honest behavior for a
// CALLER who explicitly chose to construct one anyway. But a composition
// root, called unconditionally at application/test startup regardless of
// which host capabilities happen to be present today, is a different
// caller with a different obligation: it must never let "no Arweave wallet
// is installed" — an ordinary, expected, first-class outcome — crash
// construction of everything else. So this file checks, PER SUBSTRATE,
// whether its own options object carries a usable capability BEFORE ever
// calling either constructor, and produces `null` instead of constructing
// anything when it does not — never a partially-built object, never a
// stub, never a "not configured" sentinel with its own new vocabulary.
// `canAttemptArweavePlacement()`/`canAttemptNostrDiscovery()`, below, ask
// the exact same duck-typed question `content/ArweaveContentStore.js`'s and
// `application/NostrSnapshotDiscoveryPublisher.js`'s own constructors
// already ask internally (`signer.sign` a function; `publishImpl` a
// function and `discoveryTag` a non-empty string) — the same narrow
// "decide exactly one question, the same duck-typed way the constructor
// itself already decides it" restraint `application/
// PublicationDistributionConfigurationProvider.js`'s own header (0.9.105)
// already holds for the identical decision, one substrate over.
//
// A GENUINELY MALFORMED — NOT MERELY ABSENT — CAPABILITY STILL THROWS,
// UNCHANGED. `canAttemptArweavePlacement()` only ever asks "is there a
// signer here at all;" it never re-validates `gatewayUrl`, `fetchImpl`, or
// anything else `content/ArweaveContentStore.js`'s own constructor already
// validates on its own. A caller who supplies a real `signer` alongside an
// empty-string `gatewayUrl` still gets `content/ArweaveContentStore.js`'s
// own synchronous throw, exactly as calling that constructor directly
// already would — this file adds no forgiveness beyond "no signer at all is
// not an error." The identical restraint holds for
// `canAttemptNostrDiscovery()` and `application/
// NostrSnapshotDiscoveryPublisher.js`'s own constructor.
//
// ASYMMETRIC AVAILABILITY IS NEVER COLLAPSED INTO ONE MISLEADING FLAG.
// `content/ArweaveContentStore.js`'s own placement is the prerequisite step
// `application/SnapshotDistributionCommand.js` (0.9.136) already sequences
// before Nostr announcement is ever attempted — see that file's own header,
// "Placement failure prevents discovery." This file does not invent an
// `available`/`distributionAvailable`-style summary boolean at all — doing
// so would force a policy choice this milestone has no product answer for:
// does "Arweave present, Nostr absent" count as "available" (a caller could
// still place, per 0.9.136's own legitimate `{ contentReference,
// announcement: null }` partial-success shape) or not (the FULL command
// 0.9.136 built requires both collaborators and throws without either — see
// its own "Collaborator contract violations are caught at the start")? A
// single boolean can only ever encode one of those two true, useful facts
// and would misrepresent the other — "Nostr available, therefore Snapshot
// distribution available" is exactly the misleading shape this restraint
// exists to prevent, in either direction. `contentStore`/`discoveryPublisher`
// stay two independently truthful facts instead — `null` means exactly
// "this substrate is not currently usable," nothing more, nothing less —
// and a future caller (a UI, a test, this file's own test) decides for
// itself which of the two true facts its own situation cares about.
//
// COLLABORATORS ARE HANDED VERBATIM OPTIONS BAGS, NEVER A RAW HOST
// CAPABILITY OR `window` — THE SAME LAYERING `application/
// PublicationDistributionRuntimeComposition.js`'s OWN HEADER ALREADY HOLDS.
// `arweaveContentStoreOptions` (`{ signer, gatewayUrl, fetchImpl, timeoutMs,
// maxResponseBytes }`) goes straight to `new
// ArweaveContentStore(arweaveContentStoreOptions)`, unread beyond the one
// `signer` field `canAttemptArweavePlacement()` inspects;
// `nostrSnapshotDiscoveryPublisherOptions` (`{ publishImpl, relayUrl,
// discoveryTag, tagName, kind, timeoutMs }`) goes straight to `new
// NostrSnapshotDiscoveryPublisher(nostrSnapshotDiscoveryPublisherOptions)`,
// unread beyond the `publishImpl`/`discoveryTag` fields
// `canAttemptNostrDiscovery()` inspects. Neither `signer` nor `publishImpl`
// is ever produced by this file — a caller (most naturally `ui/main.js`,
// via `arweave/ArweaveInjectedProviderSigner.js`'s own
// `createArweaveInjectedProviderSigner()` and `nostr/
// NostrInjectedProviderPublisher.js`'s own
// `createNostrInjectedProviderPublisher()`, both 0.9.121, unmodified and
// unimported here) already resolved each from whatever host capability it
// found, exactly as `application/
// PublicationDistributionConfigurationProvider.js`'s own
// `resolveArweaveUploaderOptions()`/`resolveNostrPublisherOptions()`
// already do for the Signed Claim family, one layer earlier.
//
// NO BROWSER API OF ANY KIND — THIS FILE NEVER TOUCHES `window`,
// `window.arweaveWallet`, `window.nostr`, `fetch`, OR `WebSocket`. Reading
// an actual host capability off `window` stays entirely a caller's own job
// — the "host adapters/composition boundary" this milestone's own brief
// draws, held here by simply never importing anything that reads `window`.
// Wiring a real `ui/main.js` call site that reads `window.arweaveWallet`/
// `window.nostr` and calls this file remains a separate, later, unscheduled
// step — see "Deliberately excluded," below.
//
// NO I/O OF ANY KIND — CONSTRUCTION ONLY. Calling
// `composeSnapshotDistributionRuntime()` never contacts an Arweave gateway,
// never opens a connection to a Nostr relay, and never signs anything.
// `new ArweaveContentStore(...)` and `new NostrSnapshotDiscoveryPublisher(...)`
// are both themselves synchronous constructors that perform no network
// activity on construction — this file adds no I/O of its own on top of
// that.
//
// EVERY CALL BUILDS A FRESH, INDEPENDENT PAIR — NO MODULE-LEVEL STATE, NO
// SINGLETON, NO CACHING OF A PREVIOUSLY-COMPOSED RUNTIME. Calling
// `composeSnapshotDistributionRuntime()` twice constructs two entirely
// independent `contentStore` instances (when Arweave is usable at all) and
// two entirely independent `discoveryPublisher` instances (when Nostr is
// usable at all); neither call reads or writes anything outside its own
// arguments and return value.
//
// NO COUPLING TO SIGNED CLAIM DISTRIBUTION. This file never imports
// `application/PublicationDistribution*.js`,
// `application/ArweavePublicationMaterialUploader.js`,
// `application/NostrPublicationDiscoveryPublisher.js`, or
// `arweave/ArweaveInjectedProviderSigner.js`/`nostr/
// NostrInjectedProviderPublisher.js` themselves — composing the Snapshot
// family's own runtime is never itself a Signed Claim composition, the
// same boundary `content/ArweaveContentStore.js` and `application/
// NostrSnapshotDiscoveryPublisher.js` already hold for themselves, extended
// here to their own new composition root.
//
// NO UI OF ANY KIND, AND NO NEW ORCHESTRATION ENTRY POINT. This file has no
// idea `ui/` exists, and it never calls `executeSnapshotDistributionCommand()`
// itself — a caller (a future World View action, a test) sequences
// `contentStore.put()`/`discoveryPublisher.publish()` itself, most
// naturally by handing both to 0.9.136's own unmodified command, exactly as
// 0.9.136's own header already required of ITS caller. Wiring a real UI
// trigger, or wiring `ui/main.js` itself to call this file, remains a
// separate, later, unscheduled step — see "Deliberately excluded," below.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Reading `window.arweaveWallet`/`window.nostr`, or calling
//   `createArweaveInjectedProviderSigner()`/`createNostrInjectedProviderPublisher()`
//   itself.** See "No browser API of any kind," above — a caller supplies
//   already-resolved `signer`/`publishImpl` values.
// - **Wiring `ui/main.js` to call this file.** This file is now composable
//   by any caller who chooses to; it is not yet composed into the running
//   application anywhere — the identical "composable, not composed"
//   posture 0.9.136's own header already held for the command itself, one
//   milestone earlier. `tests/SnapshotDistributionRuntimeComposition.test.js`'s
//   own structural section proves `ui/main.js` still never references
//   `ArweaveContentStore`, `NostrSnapshotDiscoveryPublisher`, or this file.
// - **A `distributionAvailable`/`available`-style summary boolean.** See
//   "Asymmetric availability is never collapsed into one misleading flag,"
//   above.
// - **A `[E] Distribute Snapshot` UI action, or any World View control.**
//   A separate, later, unscheduled step (docs/Roadmap.md names it
//   "0.9.138 — World View Snapshot Distribution Action").
// - **Calling `executeSnapshotDistributionCommand()` itself, or any other
//   new orchestration entry point that sequences placement and discovery.**
//   See "No UI of any kind, and no new orchestration entry point," above.
// - **Retries, caching, or fallback between multiple signers/relays.**
//   Exactly one `contentStore` and one `discoveryPublisher` per call — a
//   caller wanting a second gateway or relay calls this function again.
// - **Validating `arweaveContentStoreOptions`/
//   `nostrSnapshotDiscoveryPublisherOptions` beyond the one presence check
//   each resolver helper performs.** Everything else stays entirely
//   `content/ArweaveContentStore.js`'s and `application/
//   NostrSnapshotDiscoveryPublisher.js`'s own constructors' job — see "A
//   genuinely malformed — not merely absent — capability still throws,"
//   above.

// canAttemptArweavePlacement({ signer }) -> boolean. Asks exactly the one
// question `content/ArweaveContentStore.js`'s own constructor already asks
// of `signer` — see this file's own header, "graceful degradation."
function canAttemptArweavePlacement({ signer } = {}) {
    return Boolean(signer) && typeof signer.sign === 'function';
}

// canAttemptNostrDiscovery({ publishImpl, discoveryTag }) -> boolean. Asks
// exactly the two questions `application/NostrSnapshotDiscoveryPublisher.js`'s
// own constructor already asks of `publishImpl`/`discoveryTag` — see this
// file's own header, "graceful degradation."
function canAttemptNostrDiscovery({ publishImpl, discoveryTag } = {}) {
    return typeof publishImpl === 'function'
        && typeof discoveryTag === 'string'
        && discoveryTag.length > 0;
}

// composeSnapshotDistributionRuntime({ arweaveContentStoreOptions,
//   nostrSnapshotDiscoveryPublisherOptions }) -> { contentStore,
//   discoveryPublisher }. See this file's own header for the full
//   contract: each field is either a real, working collaborator or `null`
//   — never a throw for an absent capability, never a fabricated stand-in,
//   and never a summary boolean over the two. A genuinely malformed
//   PRESENT capability (a real `signer` alongside an invalid
//   `gatewayUrl`, for instance) still throws, exactly as calling the
//   underlying constructor directly already would.
export function composeSnapshotDistributionRuntime({
    arweaveContentStoreOptions = {},
    nostrSnapshotDiscoveryPublisherOptions = {}
} = {}) {
    const contentStore = canAttemptArweavePlacement(arweaveContentStoreOptions)
        ? new ArweaveContentStore(arweaveContentStoreOptions)
        : null;

    const discoveryPublisher = canAttemptNostrDiscovery(nostrSnapshotDiscoveryPublisherOptions)
        ? new NostrSnapshotDiscoveryPublisher(nostrSnapshotDiscoveryPublisherOptions)
        : null;

    return Object.freeze({ contentStore, discoveryPublisher });
}
