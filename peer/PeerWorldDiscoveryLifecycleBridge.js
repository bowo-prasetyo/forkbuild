import { describePeerWorldDiscoverySource, derivePeerWorldOrigin } from './PeerWorldDataIngress.js';

// 0.9.11 — Peer Lifecycle → World Source Registry Bridge.
//
// 0.9.6 turned one already-received peer message into one
// `WorldDiscoverySource`. 0.9.9 turned "a source currently exists" into
// mutable state — `registry.setSource()`/`removeSource()` — but its own
// header named exactly the gap it left: "Deciding WHEN a peer has
// appeared or disappeared... this file is told; it never finds out on its
// own." This file is what tells it. It answers one narrow question —
// "when a peer becomes available or unavailable, which World discovery
// source should be added or removed?" — and nothing else.
//
//   Peer connected                          Peer disconnected
//          │                                        │
//          ▼                                        ▼
//   peer/PeerWorldDataIngress.js            derivePeerWorldOrigin()
//      describePeerWorldDiscoverySource()          │
//          │                                        │
//          ▼                                        ▼
//   peer/PeerWorldDiscoveryLifecycleBridge.js   ★ (THIS)
//      registerPeerWorldSource()               unregisterPeerWorldSource()
//          │                                        │
//          ▼                                        ▼
//   application/WorldDiscoverySourceRegistry.js   (0.9.9, unchanged)
//      registry.setSource()                     registry.removeSource()
//
// TWO FUNCTIONS, ONE JOB EACH, BOTH PLAIN TRANSLATION.
// `registerPeerWorldSource(registry, connectedPeer, payload)` hands
// `payload` and `connectedPeer` to 0.9.6's own
// `describePeerWorldDiscoverySource()`, unmodified, and — only if that
// call produces a real source — hands the result to `registry.setSource()`,
// unmodified. `unregisterPeerWorldSource(registry, connectedPeer)` derives
// `connectedPeer`'s own origin via 0.9.6's own `derivePeerWorldOrigin()`
// and hands it to `registry.removeSource()`. Neither function adds a
// field, renames one, or makes a decision either 0.9.6 or 0.9.9 doesn't
// already make on its own — this file is the wire between them, nothing
// more.
//
// THE SAME IDENTITY-DERIVED ORIGIN, BOTH DIRECTIONS — REUSED, NEVER
// REDERIVED. `registerPeerWorldSource()` names its source
// `"peer:<identityId>"` by way of 0.9.6's own
// `describePeerWorldDiscoverySource()`; `unregisterPeerWorldSource()`
// names the very same origin by way of 0.9.6's own, newly-exported
// `derivePeerWorldOrigin()` — the exact same identity check, called a
// second time on the exact same `connectedPeer.remoteIdentity.identityId`,
// never a second, independently-invented identity algorithm. This is
// what guarantees a peer's disconnect always removes precisely the
// source its own connect (or reconnect) calls added — never a
// near-miss, differently-derived key that leaves a stale entry behind or
// deletes the wrong one.
//
// AN UNESTABLISHED IDENTITY CREATES NO ENTRY AND REMOVES NONE. If
// `connectedPeer` carries no established `remoteIdentity` (not yet
// authenticated, or missing entirely), both `describePeerWorldDiscoverySource()`
// and `derivePeerWorldOrigin()` already return `null` — 0.9.6's own
// contract, inherited here unchanged. `registerPeerWorldSource()` then
// calls `registry.setSource()` not at all, and `unregisterPeerWorldSource()`
// calls `registry.removeSource()` not at all. Neither function invents a
// fallback origin, a placeholder, or an "unknown peer" slot.
//
// REPLACEMENT, NOT ACCUMULATION — INHERITED FROM 0.9.9, NEVER
// REIMPLEMENTED HERE. A second `registerPeerWorldSource()` call for the
// same `connectedPeer` produces a source with the same `origin`, and
// `registry.setSource()` already replaces whatever previously occupied
// that slot — see 0.9.9's own header, "Replacement, not accumulation."
// This file holds no memory of a peer's previous contribution and
// performs no diffing of its own; it hands 0.9.9's registry one fresh
// source every time and lets the registry's own, already-proven rule
// decide what happens to the slot.
//
// DISCONNECT IS PLAIN REMOVAL, NEVER A TOMBSTONE — INHERITED FROM 0.9.9.
// `unregisterPeerWorldSource()` calls `registry.removeSource(origin)` and
// nothing else. It never calls `registry.setSource()` with an empty
// source to "clear" a peer's contribution — that would leave a lingering
// registry entry 0.9.9's own header explicitly rules out. A disconnect
// for a peer whose source is already absent (never registered, or
// already removed) is harmless: `registry.removeSource()` already treats
// removing an absent origin as a no-op, and this file adds no additional
// existence check of its own before calling it.
//
// EVENT/LIFECYCLE-ORIENTED, BUT STILL SYNCHRONOUS — NO PERSISTENT
// SERVICE OF ANY KIND. Both functions run to completion and return; there
// is no class here, no constructor, no instance holding a connection, a
// socket, a WebRTC peer, a timer, a retry loop, a subscription, or a
// cache. A caller invokes `registerPeerWorldSource()` from inside its own
// `onPeerConnected`/`onPeerWorldDataReceived`-style handler and
// `unregisterPeerWorldSource()` from inside its own
// `onPeerDisconnected`-style handler — this file supplies the two pure
// translations those handlers call, not the handlers, the subscription
// that invokes them, or any peer transport machinery underneath.
//
// NO WORLD ENCOUNTER DERIVATION OF ANY KIND. This file never imports
// `core/WorldEncounter.js`, `core/WorldDiscoverySourceAssembly.js`,
// `application/WorldEncounterIntegration.js`, or
// `application/WorldDiscoveryRegistryProjection.js`, and never calls
// `deriveWorldEncounters()`, `assembleWorldDiscoveryInputs()`,
// `describeWorldFromDiscoverySources()`, or
// `describeWorldFromDiscoveryRegistry()`. Its job ends the moment
// `registry.setSource()`/`removeSource()` returns — turning the
// registry's new membership into a World View remains 0.9.10's own,
// separate, unchanged concern.
//
// NO UI, NO STORAGE, NO CRYPTOGRAPHIC VERIFICATION. This file never
// imports a Vue component, a `StorageProvider`, `localStorage`, or any
// signature-verification module. A signed record inside `payload` travels
// through 0.9.6's own ingress exactly as opaque as it always has — this
// file never looks inside it.
//
// NO PEER TRANSPORT, NO CONNECTION MANAGEMENT. This file never imports
// `peer/PeerMessageBus.js`, `peer/PeerConnection.js`,
// `peer/PeerConnectionProvider.js`, `peer/WebRtcPeerConnection.js`, or any
// `PeerDiscoveryProvider`. It is handed an already-authenticated
// `connectedPeer` and (for registration) an already-received `payload`;
// it never establishes, authenticates, or closes a connection itself, and
// never decides on its own when a peer has connected or disconnected —
// that decision, and the call into this file that follows it, remains the
// existing peer lifecycle layer's own job.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Calling `deriveWorldEncounters()`, `assembleWorldDiscoveryInputs()`,
//   `describeWorldFromDiscoverySources()`, or
//   `describeWorldFromDiscoveryRegistry()`.** See "No World encounter
//   derivation," above.
// - **A persistent World discovery service, subscription, or automatic
//   reaction to peer lifecycle events.** This file supplies two functions
//   a caller invokes explicitly, once per event; wiring an actual
//   `onPeerConnected`/`onPeerDisconnected` subscription that calls them
//   automatically is separate, later, unscheduled work.
// - **Reactive World View updates whenever the registry changes.** See
//   0.9.10's own epilogue — that remains 0.9.12, unscheduled here.
// - **Deduplication, reconciliation, trust, priority, or any judgment
//   about a peer's contribution.** Inherited, unchanged, from 0.9.6 and
//   0.9.9 — see their own headers.
// - **Persistence of any kind, or peer transport/connection
//   establishment.** See "No UI, no storage..." and "No peer transport..."
//   above.

// Registers (or replaces) `connectedPeer`'s current World discovery
// source, derived from `payload` by 0.9.6's own
// `describePeerWorldDiscoverySource()`. A no-op — `registry.setSource()`
// is never called — when `connectedPeer` carries no established identity,
// or when `registry` itself does not expose a `setSource()` function.
export function registerPeerWorldSource(registry, connectedPeer, payload) {
    if (!registry || typeof registry.setSource !== 'function') {
        return;
    }
    const source = describePeerWorldDiscoverySource(payload, connectedPeer);
    if (source === null) {
        return;
    }
    registry.setSource(source);
}

// Removes `connectedPeer`'s current World discovery source, if any,
// using the SAME `"peer:<identityId>"` origin `registerPeerWorldSource()`
// registered it under — derived here by 0.9.6's own, shared
// `derivePeerWorldOrigin()`. A no-op — `registry.removeSource()` is never
// called — when `connectedPeer` carries no established identity, or when
// `registry` itself does not expose a `removeSource()` function. Harmless
// when `connectedPeer`'s source is already absent: `registry.removeSource()`
// already treats removing an absent origin as a no-op.
export function unregisterPeerWorldSource(registry, connectedPeer) {
    if (!registry || typeof registry.removeSource !== 'function') {
        return;
    }
    const origin = derivePeerWorldOrigin(connectedPeer);
    if (origin === null) {
        return;
    }
    registry.removeSource(origin);
}
