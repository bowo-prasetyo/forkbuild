import { WorldDiscoverySourceRegistry } from './WorldDiscoverySourceRegistry.js';
import { describeLocalWorldDiscoverySource } from './WorldEncounterIntegration.js';
import { registerPeerWorldSource, unregisterPeerWorldSource } from '../peer/PeerWorldDiscoveryLifecycleBridge.js';

// 0.9.14 — World Discovery Runtime Bootstrap.
//
// 0.9.9 through 0.9.13 built every piece of a live, multi-source World —
// a registry that tracks which sources currently exist (0.9.9), a bridge
// that turns a peer's own connect/disconnect into a call on that registry
// (0.9.11), a way to notify a subscriber when membership changes (0.9.12),
// and a UI component that already knows how to subscribe and re-render
// (0.9.13) — and every one of those milestones' own header stopped short
// of the same last step. 0.9.13's own epilogue named it exactly: "nothing
// yet constructs a real `WorldDiscoverySourceRegistry` inside the running
// application and populates it from local storage and live peer
// lifecycle." This file is that construction, and only that
// construction — it adds no new World-discovery behavior of its own,
// only the composition-root wiring that turns five already-finished,
// already-tested files into one running thing.
//
//   Application startup
//          │
//          ├── new WorldDiscoverySourceRegistry()                (0.9.9)
//          │
//          ├── describeLocalWorldDiscoverySource(records)        (0.9.8)
//          │        registry.setSource(...)
//          │
//          └── connectedPeerRegistry / peerMessageBus
//                       │
//                       ├── peerMessageBus.subscribe(protocol, …) ──▶ registerPeerWorldSource()     (0.9.11)
//                       └── connectedPeerRegistry.onChange(…)     ──▶ unregisterPeerWorldSource()   (0.9.11)
//                                                                          │
//                                                                          ▼
//                                                            registry.setSource()/removeSource()   (0.9.9)
//                                                                          │
//                                                                          ▼  notification           (0.9.12)
//                                                            (a mounted WorldEncounterCanvas
//                                                             reacts automatically — 0.9.13,
//                                                             already built, unmodified)
//
// `bootstrapWorldDiscoveryRuntime(dependencies)` IS THE ONE ENTRY POINT.
// It takes plain, already-existing collaborators — a records object for
// the local source, and, optionally, this app's own already-existing
// `application/ConnectedPeerRegistry.js` instance and `peer/
// PeerMessageBus.js` instance (`peerSessionManager.registry`/
// `peerMessageBus` in `ui/main.js`, unmodified) — and returns
// `{ registry, dispose }`. `registry` is handed to whatever renders the
// World (e.g. `app.provide('worldDiscoverySourceRegistry', registry)`,
// for a future page to `inject()` and pass straight to
// `WorldEncounterCanvas`'s own `registry` prop); `dispose()` unwinds both
// subscriptions this file creates, for tests and for symmetry with every
// other disposable collaborator in this codebase
// (`ConnectedPeerRegistry.dispose()`, `PeerMessageBus.dispose()`).
//
// LOCAL REGISTRATION IS A ONE-TIME STARTUP CALL, NOT A LIVE SUBSCRIPTION.
// `describeLocalWorldDiscoverySource()` (0.9.8) is called exactly once,
// with whatever `localWorldDiscoveryRecords` the caller already has in
// hand at startup — the same "caller already holds its own local
// publications/placements/anchors/snapshotPlacements/avatarProfiles/
// avatarPresences" precondition every milestone from 0.9.5 onward has
// always assumed. This file does not read a `StorageProvider`, does not
// invent a query across this app's several, independent publication/
// placement/anchor/avatar stores, and does not watch local storage for
// future changes — reading real local records into that shape, and
// keeping the local source current as they change, is separate,
// unscheduled work; an absent or empty `localWorldDiscoveryRecords`
// degrades to a genuine, honest, currently-empty `'local'` source (0.9.8's
// own `describeLocalWorldDiscoverySource({})` contract), never a missing
// one.
//
// PEER REGISTRATION RIDES THE EXISTING `PeerMessageBus` MULTIPLEXER —
// ONE NEW TOPIC NAME, NO NEW WIRE FORMAT. `WORLD_DISCOVERY_PEER_PROTOCOL`
// is a plain namespaced string, exactly like every other protocol this
// app's own `ui/main.js` already registers on the SAME `peerMessageBus`
// (`'forkbuild:avatar-profile'`, `'forkbuild:snapshot-content-transfer'`,
// …) — see `peer/PeerMessageBus.js`'s own header, "a protocol subscribes
// here ONCE, by a namespaced `protocol` string." This file only ever
// calls `peerMessageBus.subscribe()`; it never calls `peerMessageBus.send()`
// and adds no code anywhere that broadcasts this replica's own local
// World data to a connected peer. Until some later, unscheduled milestone
// adds that sender, this subscription is a real but currently-inert
// receiver — exactly as honest a state as `publicationAnchorPeerExchange`
// or any other `ui/main.js` collaborator was the moment IT was first
// wired, before its own first real message ever arrived. See "Deliberately
// excluded," below — this is what "no peer protocol changes" means here:
// no new envelope shape, no new handshake data, nothing a peer's own
// remote application needs to change to keep working.
//
// `registerPeerWorldSource()` FIRES ON MESSAGE RECEIPT, NEVER ON A BARE
// LIFECYCLE EVENT. A peer reaching AUTHENTICATED, by itself, registers
// nothing — only an actual message arriving under
// `WORLD_DISCOVERY_PEER_PROTOCOL`, via `meta.connectedPeer` exactly as
// `peer/PeerMessageBus.js`'s own `subscribe()` contract already delivers
// it, calls 0.9.11's own `registerPeerWorldSource(registry, connectedPeer,
// payload)`, unmodified. This deliberately avoids the one real hazard a
// lifecycle-only registration would create: re-registering an EMPTY
// placeholder source every time `connectedPeerRegistry.onChange()` fires
// for an unrelated reason (0.9.9's own "replacement, not accumulation"
// rule means every `setSource()` call replaces whatever that peer already
// contributed) would silently erase real data with nothing, on every
// unrelated peer's connect/disconnect. Tying registration to the message
// that actually carries the data sidesteps that hazard entirely — see
// 0.9.9's and 0.9.11's own headers, "replacement, not accumulation."
//
// UNREGISTRATION READS AN IDENTITY SNAPSHOT, NEVER THE LIVE
// `connectedPeer` — SEE `application/ConnectedPeer.js`'s OWN "CLOSING
// DISCARDS remoteIdentity." By the time `connectedPeerRegistry.onChange()`
// notifies this file that a connection is gone,
// `application/ConnectedPeerRegistry.js` has already called that peer's
// own `dispose()`, and its underlying authentication session has already
// discarded `remoteIdentity` — reading `connectedPeer.remoteIdentity`
// AT THAT POINT would already be `null`, making
// `unregisterPeerWorldSource()` a no-op and leaving a stale `peer:<id>`
// source in the registry forever. This file avoids that race by
// remembering a plain, frozen `{ remoteIdentity: { identityId } }`
// snapshot — exactly the shape `peer/PeerWorldDataIngress.js#derivePeerWorldOrigin()`
// already duck-types — the moment a message under
// `WORLD_DISCOVERY_PEER_PROTOCOL` first proves that connection's identity,
// and hands THAT snapshot, never the live `connectedPeer`, to
// `unregisterPeerWorldSource()` once `connectedPeerRegistry.onChange()`
// reports the connection gone.
//
// A CONNECTION THIS FILE NEVER SAW A MESSAGE FROM IS NEVER UNREGISTERED,
// BECAUSE IT WAS NEVER REGISTERED. Exactly like `registry.removeSource()`
// itself (0.9.9's own "no-op removal of an absent origin"), a peer that
// disconnects having never sent a `WORLD_DISCOVERY_PEER_PROTOCOL` message
// (today, every peer — see "Peer registration," above) is simply absent
// from this file's own identity map; `connectedPeerRegistry.onChange()`
// finds nothing to unregister for it and calls `unregisterPeerWorldSource()`
// not at all.
//
// NO DEDUPLICATION, NO TRUST DECISIONS, NO RANKING, NO PERSISTENCE, NO
// SIGNATURE VERIFICATION, NO SPATIAL/PROXIMITY LOGIC — INHERITED
// UNCHANGED FROM EVERY FILE THIS ONE WIRES TOGETHER. This file adds no
// vocabulary 0.9.0 through 0.9.13 didn't already establish; it never
// reads a source's own six record arrays, never compares one source to
// another, and never writes anything to a `StorageProvider`.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Broadcasting this replica's own local World data to a connected
//   peer.** See "Peer registration," above — this file only ever
//   subscribes; sending is separate, later, unscheduled work.
// - **Reading real local publications/placements/anchors/snapshotPlacements/
//   avatarProfiles/avatarPresences out of this app's several storage
//   layers.** See "Local registration," above — this file is handed
//   `localWorldDiscoveryRecords` already assembled.
// - **Mounting `ui/components/WorldEncounterCanvas.js` into a route, or
//   any other UI surface.** This file returns `registry`; handing it to a
//   rendered `WorldEncounterCanvas` (via `app.provide()`/`inject()`, or
//   any other means) is a separate, later, unscheduled UI concern —
//   0.9.3's own header already drew this exact line ("wiring this surface
//   into a router... is separate, later, unscheduled work") and this
//   milestone does not cross it.
// - **Deduplication, reconciliation, trust decisions, ranking,
//   persistence, signature verification, or proximity/spatial discovery
//   of any kind.** Inherited unchanged from every file this one composes.
export const WORLD_DISCOVERY_PEER_PROTOCOL = 'forkbuild:world-discovery';

function identitySnapshotOf(connectedPeer) {
    const identityId = connectedPeer && connectedPeer.remoteIdentity ? connectedPeer.remoteIdentity.identityId : null;
    if (typeof identityId !== 'string' || identityId.length === 0) {
        return null;
    }
    return Object.freeze({ remoteIdentity: Object.freeze({ identityId }) });
}

// Constructs (or reuses, when `registry` is supplied) one
// `WorldDiscoverySourceRegistry`, registers the local source once, wires
// live peer registration/unregistration onto it when
// `connectedPeerRegistry`/`peerMessageBus` are supplied, and returns
// `{ registry, dispose }`. Every dependency is optional and duck-typed —
// exactly like every collaborator this file composes, malformed or
// missing input degrades to "that piece of wiring simply does nothing,"
// never a thrown error.
export function bootstrapWorldDiscoveryRuntime({
    registry = new WorldDiscoverySourceRegistry(),
    localWorldDiscoveryRecords = {},
    connectedPeerRegistry = null,
    peerMessageBus = null,
    protocol = WORLD_DISCOVERY_PEER_PROTOCOL
} = {}) {
    registry.setSource(describeLocalWorldDiscoverySource(localWorldDiscoveryRecords || {}));

    // connectionId -> frozen identity snapshot, recorded the moment a
    // WORLD_DISCOVERY_PEER_PROTOCOL message first proves that connection's
    // identity — see this file's own header, "Unregistration reads an
    // identity snapshot."
    const knownPeerIdentityByConnectionId = new Map();

    let unsubscribeMessages = () => {};
    if (peerMessageBus && typeof peerMessageBus.subscribe === 'function') {
        unsubscribeMessages = peerMessageBus.subscribe(protocol, (payload, meta) => {
            const connectedPeer = meta && meta.connectedPeer;
            if (!connectedPeer || typeof connectedPeer.connectionId !== 'string') {
                return;
            }
            registerPeerWorldSource(registry, connectedPeer, payload);
            const snapshot = identitySnapshotOf(connectedPeer);
            if (snapshot) {
                knownPeerIdentityByConnectionId.set(connectedPeer.connectionId, snapshot);
            }
        });
    }

    let unsubscribeLifecycle = () => {};
    if (connectedPeerRegistry && typeof connectedPeerRegistry.onChange === 'function') {
        unsubscribeLifecycle = connectedPeerRegistry.onChange((peers) => {
            const liveConnectionIds = new Set(
                (Array.isArray(peers) ? peers : [])
                    .filter((peer) => peer && typeof peer.connectionId === 'string')
                    .map((peer) => peer.connectionId)
            );
            for (const [connectionId, identitySnapshot] of Array.from(knownPeerIdentityByConnectionId.entries())) {
                if (liveConnectionIds.has(connectionId)) {
                    continue;
                }
                unregisterPeerWorldSource(registry, identitySnapshot);
                knownPeerIdentityByConnectionId.delete(connectionId);
            }
        });
    }

    return {
        registry,
        dispose() {
            unsubscribeMessages();
            unsubscribeLifecycle();
            knownPeerIdentityByConnectionId.clear();
        }
    };
}
