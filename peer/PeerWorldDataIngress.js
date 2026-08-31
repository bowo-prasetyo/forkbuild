import { describeWorldDiscoverySource } from '../core/WorldDiscoverySource.js';

// 0.9.6 — Peer World Data Ingress.
//
// 0.9.5 named the seam — `describeWorldDiscoverySource({ origin, ...six
// arrays })` — but nothing yet crosses it. This milestone is that one
// small step, and only that step: turning an already-received peer
// message into exactly the bundle 0.9.5 already knows how to describe.
//
//   peer/PeerMessageBus.js
//   subscribe(protocol, (payload, meta) => { ... })
//              │
//              ▼
//   peer/PeerWorldDataIngress.js   ★ (THIS milestone)
//      describePeerWorldDiscoverySource(payload, connectedPeer)
//              │
//              ▼
//   core/WorldDiscoverySource.js
//      describeWorldDiscoverySource()
//              │
//              ▼
//   (future, unscheduled: World Data Assembly)
//              │
//              ▼
//   core/WorldEncounter.js
//      deriveWorldEncounters()
//
// THE TRANSFORMATION IS EXACTLY THREE STEPS, NO MORE. (1) Validate that
// `payload` is a structurally usable envelope — an object, or absent —
// never a string, number, or anything else that would throw on property
// access. (2) Read `payload`'s own copies of 0.9.5's six named record
// arrays, by exactly `WorldDiscoveryInputKeys`' own field names, never a
// seventh field of this file's own invention. (3) Read the origin from
// `connectedPeer.remoteIdentity.identityId` — a fact peer/
// PeerAuthenticationSession.js already proved before this function is
// ever reachable — and hand both to `describeWorldDiscoverySource()`
// completely unmodified. This file adds no field, drops no field, and
// makes no decision `describeWorldDiscoverySource()` doesn't already make
// on its own.
//
// `origin` IS ALWAYS `"peer:<identityId>"` — NEVER A BARE IDENTITY, NEVER
// SILENTLY "local". This is the one piece of vocabulary this file owns:
// the `"peer:"` prefix is what lets a future World Data Assembly step
// (0.9.7, unscheduled) tell a peer-sourced batch apart from
// `describeWorldDiscoverySource({ origin: 'local', ... })`'s own
// local-storage batch without either side having to know the other
// exists. `connectedPeer.remoteIdentity` is read here exactly as a
// plain, already-established fact — application/ConnectedPeer.js's own
// `remoteIdentity` getter is null until peer/
// PeerAuthenticationSession.js's handshake reaches AUTHENTICATED, and
// this file trusts nothing beyond reading that already-completed result.
// It does not re-verify a signature, does not re-run the handshake, and
// does not import identity/Ed25519.js or peer/PeerAuthenticationSession.js
// at all.
//
// THIS FILE DOES NOT DECIDE WHETHER A MESSAGE IS LEGITIMATE — ONLY
// WHETHER IT IS STRUCTURALLY USABLE. "Malformed" here means exactly what
// it means one layer down in `describeWorldDiscoverySource()`: a field
// that is not itself an array degrades to an empty array for that field
// alone; a payload that is not itself an object degrades to "no fields
// supplied," i.e. all six empty. Nothing here inspects a record's own
// `signature` field, decides whether one exists, or decides whether one
// verifies — a signed record inside `payload.publications` travels
// through this file exactly as opaque as it arrived. See
// core/WorldDiscoverySource.js's own header, "No trust vocabulary of any
// kind," which this file inherits without adding a single exception to
// it.
//
// A MISSING `connectedPeer` IDENTITY RETURNS `null`, NEVER THROWS,
// EXACTLY LIKE 0.9.5's OWN MISSING-`origin` CONTRACT. There is no
// identity to name a source after, so there is no describable source —
// this mirrors `describeWorldDiscoverySource({})` returning `null` for
// the exact same reason, one layer up. A missing or malformed `payload`,
// by contrast, is never fatal on its own: with a real identity to name
// it after, this file still produces a valid, frozen, entirely empty
// source — the peer contributed nothing usable this time, not nothing at
// all.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Deciding whether a message is legitimate, or attaching any trust,
//   verification, or authority judgment to it.** No `trusted`,
//   `verified`, `authority`, `score`, or `weight` field or vocabulary
//   exists here or ever will at this layer — see this file's own header,
//   above.
// - **Signature verification of any record inside the six arrays.** A
//   signed publication travels through as an opaque record; whether it
//   verifies is a separate, later, unscheduled projection's job.
// - **Combining this source with any other.** One peer message produces
//   one `WorldDiscoverySource`; there is no plural counterpart here, the
//   same restraint `core/WorldDiscoverySource.js` itself already applies
//   to describing more than one origin. See "One source per call" in
//   that file's own header.
// - **Persistence of any kind.** This file never imports a
//   `StorageProvider`, and nothing it touches is ever written down.
// - **Rebroadcast, forwarding, or any outbound peer traffic.** This file
//   never imports `peer/PeerMessageBus.js` and has no way to send
//   anything — receiving a peer's World data can never, by construction,
//   cause this device to send a message of its own.
// - **Calling `deriveWorldEncounters()`, or importing
//   `core/WorldEncounter.js` in any way.** Wiring a described peer source
//   into the running World View is 0.9.7 (World Data Assembly) and 0.9.8
//   (Remote Encounter Integration) — separate, later, unscheduled work.
// - **Establishing, authenticating, or managing a peer connection.** This
//   file is handed an already-authenticated `connectedPeer` and an
//   already-received `payload`; it never reaches into `peer/
//   PeerConnection.js`, `peer/WebRtcPeerConnection.js`, or any
//   `PeerConnectionProvider` to obtain either.

// Pure. Derives the exact `"peer:<identityId>"` origin
// `describePeerWorldDiscoverySource()` itself names a source after, from
// `connectedPeer`'s own already-proven `remoteIdentity` alone — no
// payload involved. Returns `null` under exactly the same condition
// `describePeerWorldDiscoverySource()` returns `null` for: no established
// identity to name an origin after. Exported so 0.9.11's own
// `peer/PeerWorldDiscoveryLifecycleBridge.js` can derive the SAME origin
// on peer disconnect — to call `registry.removeSource()` — from this one
// place, rather than reimplementing this identity check a second time.
export function derivePeerWorldOrigin(connectedPeer) {
    const identityId = connectedPeer && connectedPeer.remoteIdentity
        ? connectedPeer.remoteIdentity.identityId
        : null;
    if (typeof identityId !== 'string' || identityId.length === 0) {
        return null;
    }
    return `peer:${identityId}`;
}

// Pure. Turns one already-received peer message into one
// `WorldDiscoverySource` bundle, attributed to `connectedPeer`'s own
// already-proven remote identity. Returns `null`, never throws, when
// `connectedPeer` carries no established identity to name a source
// after; `payload` missing, or not itself a plain object, degrades to a
// valid source with all six record arrays empty, exactly like
// `describeWorldDiscoverySource()`'s own defaults already do for any one
// missing field.
export function describePeerWorldDiscoverySource(payload, connectedPeer) {
    const origin = derivePeerWorldOrigin(connectedPeer);
    if (origin === null) {
        return null;
    }

    const envelope = payload && typeof payload === 'object' ? payload : {};
    return describeWorldDiscoverySource({
        origin,
        publications: envelope.publications,
        placements: envelope.placements,
        anchors: envelope.anchors,
        snapshotPlacements: envelope.snapshotPlacements,
        avatarProfiles: envelope.avatarProfiles,
        avatarPresences: envelope.avatarPresences
    });
}
