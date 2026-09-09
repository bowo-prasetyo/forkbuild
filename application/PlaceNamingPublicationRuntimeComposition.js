import { NostrPlaceNamingDiscoveryPublisher } from './NostrPlaceNamingDiscoveryPublisher.js';

// 0.9.320 — Explicit Place Naming Publication Action.
//
// 0.9.316 built `application/NostrPlaceNamingDiscoveryPublisher.js` and,
// by its own header's own words, deliberately excluded "wiring this class
// into `ui/main.js`... or any UI surface" — 0.9.318/0.9.319 then confirmed,
// live, that nothing since had done so either. This file is the
// composition-root seam that closes exactly that gap, mirroring
// `application/SnapshotDistributionRuntimeComposition.js`'s own
// `canAttemptNostrDiscovery()`/graceful-degradation shape (0.9.137) one
// substrate over:
//
//   nostrPlaceNamingDiscoveryPublisherOptions{ publishImpl, relayUrl, ... }
//        │  (a caller already resolved `publishImpl` from SOMEWHERE — most
//        │   naturally `nostr/NostrInjectedProviderPublisher.js`'s own
//        │   `createNostrInjectedProviderPublisher({ injectedProvider:
//        │   window.nostr })`, unimported here — see "no browser API of
//        │   any kind," below)
//        ▼
//   application/PlaceNamingPublicationRuntimeComposition.js   ★ (THIS)
//        composePlaceNamingPublicationRuntime({ nostrPlaceNamingDiscoveryPublisherOptions })
//        │
//        └──► new NostrPlaceNamingDiscoveryPublisher(                    (application/
//                 nostrPlaceNamingDiscoveryPublisherOptions)               NostrPlaceNamingDiscoveryPublisher.js,
//                 — only when `publishImpl` is usable; `null` otherwise,    0.9.316, unmodified)
//                 never a throw — see "graceful degradation," below
//        │
//        ▼
//   { discoveryPublisher }
//        │
//        │   a caller's own sequence — never this file's own:
//        ▼
//   discoveryPublisher.publish(claim)   (application/
//                                         NostrPlaceNamingDiscoveryPublisher.js,
//                                         0.9.316, unmodified — and NOT
//                                         imported or called by this file;
//                                         see "composition, never
//                                         orchestration," below)
//
// A SINGLE COLLABORATOR, NOT A PAIR — THE ONE DELIBERATE DEPARTURE FROM
// `composeSnapshotDistributionRuntime()`'S OWN SHAPE, AND WHY. A Snapshot's
// own distribution needs TWO substrates in sequence — Arweave placement,
// then Nostr announcement of the resulting locator (see `application/
// SnapshotDistributionCommand.js`'s own header, "placement failure prevents
// discovery"). A `PlaceNamingClaim` has no companion content-placement step
// at all: it is already fully formed and already locally persisted by
// `application/PlaceNamingClaimUseCase.js#publish()` before this file's own
// `discoveryPublisher` ever sees it — publishing it to Nostr is the ONLY
// substrate this domain's own claim distribution ever needed. This file
// therefore composes exactly one collaborator, never a `{ contentStore,
// discoveryPublisher }` pair with an always-null first half.
//
// COMPOSITION, NEVER A SECOND COLLABORATOR AND NEVER A NEW ORCHESTRATION
// ENTRY POINT. This file contains no Nostr event construction, no relay
// I/O of its own, and never calls `discoveryPublisher.publish()` itself —
// its only job is object construction: decide whether there is enough here
// to even ATTEMPT it, build the one collaborator that decision allows, and
// hand it back. Every behavior a caller ever observes through the returned
// collaborator is entirely `application/NostrPlaceNamingDiscoveryPublisher.js`'s
// own, unmodified.
//
// GRACEFUL DEGRADATION, NEVER A THROW, FOR AN ABSENT CAPABILITY — THE SAME
// restraint `application/SnapshotDistributionRuntimeComposition.js`'s own
// header already holds one substrate over, for the identical reason: a
// composition root, called unconditionally at application startup
// regardless of whether a host Nostr extension happens to be installed
// today, must never let "no NIP-07 extension is installed" — an ordinary,
// expected, first-class outcome — crash construction of everything else.
// `canAttemptNostrPlaceNamingPublication()`, below, asks the exact same
// duck-typed question `application/NostrPlaceNamingDiscoveryPublisher.js`'s
// own constructor already asks internally (`publishImpl` a function) —
// never re-validating `relayUrl`/`tagName`/`kind`/`timeoutMs`, all of which
// remain entirely that constructor's own concern, unchanged.
//
// A GENUINELY MALFORMED — NOT MERELY ABSENT — CAPABILITY STILL THROWS,
// UNCHANGED. A caller who supplies a real `publishImpl` alongside an
// empty-string `relayUrl` still gets `application/
// NostrPlaceNamingDiscoveryPublisher.js`'s own synchronous throw, exactly
// as calling that constructor directly already would — this file adds no
// forgiveness beyond "no publishImpl at all is not an error."
//
// COLLABORATORS ARE HANDED A VERBATIM OPTIONS BAG, NEVER A RAW HOST
// CAPABILITY OR `window`. `nostrPlaceNamingDiscoveryPublisherOptions`
// (`{ publishImpl, relayUrl, tagName, kind, timeoutMs }`) goes straight to
// `new NostrPlaceNamingDiscoveryPublisher(nostrPlaceNamingDiscoveryPublisherOptions)`,
// unread beyond the one `publishImpl` field
// `canAttemptNostrPlaceNamingPublication()` inspects. `publishImpl` is
// never produced by this file — a caller (most naturally `ui/main.js`, via
// `nostr/NostrInjectedProviderPublisher.js`'s own
// `createNostrInjectedProviderPublisher()`, unmodified and unimported here)
// already resolved it from whatever host capability it found.
//
// NO BROWSER API OF ANY KIND — THIS FILE NEVER TOUCHES `window`,
// `window.nostr`, `fetch`, OR `WebSocket`. Reading an actual host
// capability off `window` stays entirely a caller's own job.
//
// NO I/O OF ANY KIND — CONSTRUCTION ONLY. Calling
// `composePlaceNamingPublicationRuntime()` never opens a connection to a
// Nostr relay and never signs anything. `new
// NostrPlaceNamingDiscoveryPublisher(...)` is itself a synchronous
// constructor that performs no network activity on construction — this
// file adds no I/O of its own on top of that.
//
// EVERY CALL BUILDS A FRESH, INDEPENDENT COLLABORATOR — NO MODULE-LEVEL
// STATE, NO SINGLETON, NO CACHING OF A PREVIOUSLY-COMPOSED RUNTIME.
//
// NO COUPLING TO SNAPSHOT OR SIGNED CLAIM DISTRIBUTION. This file never
// imports `application/SnapshotDistributionRuntimeComposition.js`,
// `content/ArweaveContentStore.js`, `application/
// NostrSnapshotDiscoveryPublisher.js`, `application/
// PublicationDistribution*.js`, or `arweave/ArweaveInjectedProviderSigner.js`
// — composing the Place Naming family's own runtime is never itself a
// Snapshot or Signed Claim composition.
//
// NO UI OF ANY KIND, AND NO NEW ORCHESTRATION ENTRY POINT. This file has no
// idea `ui/` exists, and it never calls `discoveryPublisher.publish()`
// itself — a caller (`ui/views/WorldView.js`) sequences that call against
// an already-signed `PlaceNamingClaim` on its own, explicit terms.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Reading `window.nostr`, or calling
//   `createNostrInjectedProviderPublisher()` itself.** See "no browser API
//   of any kind," above — a caller supplies an already-resolved
//   `publishImpl` value.
// - **Calling `discoveryPublisher.publish()` itself, or any other new
//   orchestration entry point.** See "no UI of any kind," above.
// - **A `publicationAvailable`/`available`-style summary boolean.** A
//   single collaborator needs no such flag at all — a caller reads
//   `discoveryPublisher === null` directly.
// - **Retries, caching, relay-selection policy, or fallback between
//   multiple relays.** Exactly one `discoveryPublisher` per call.
// - **Validating `nostrPlaceNamingDiscoveryPublisherOptions` beyond the one
//   presence check `canAttemptNostrPlaceNamingPublication()` performs.**
//   Everything else stays entirely `application/
//   NostrPlaceNamingDiscoveryPublisher.js`'s own constructor's job.

// canAttemptNostrPlaceNamingPublication({ publishImpl }) -> boolean. Asks
// exactly the one question `application/NostrPlaceNamingDiscoveryPublisher.js`'s
// own constructor already asks of `publishImpl` — see this file's own
// header, "graceful degradation."
function canAttemptNostrPlaceNamingPublication({ publishImpl } = {}) {
    return typeof publishImpl === 'function';
}

// composePlaceNamingPublicationRuntime({ nostrPlaceNamingDiscoveryPublisherOptions })
//   -> { discoveryPublisher }. See this file's own header for the full
//   contract: `discoveryPublisher` is either a real, working
//   `NostrPlaceNamingDiscoveryPublisher` or `null` — never a throw for an
//   absent capability, never a fabricated stand-in. A genuinely malformed
//   PRESENT capability (a real `publishImpl` alongside an invalid
//   `relayUrl`, for instance) still throws, exactly as calling the
//   underlying constructor directly already would.
export function composePlaceNamingPublicationRuntime({
    nostrPlaceNamingDiscoveryPublisherOptions = {}
} = {}) {
    const discoveryPublisher = canAttemptNostrPlaceNamingPublication(nostrPlaceNamingDiscoveryPublisherOptions)
        ? new NostrPlaceNamingDiscoveryPublisher(nostrPlaceNamingDiscoveryPublisherOptions)
        : null;

    return Object.freeze({ discoveryPublisher });
}
