// 0.2.37 — the WIRE representation of a local AvatarPresence: what
// actually gets handed to a broadcast transport. Deliberately a
// separate, narrower shape from AvatarPresence.toJSON() itself — see
// docs/Principles.md, "A Presence Advertisement Is A Transport Shape,
// Not A Second Presence Model." Two differences from AvatarPresence's
// own toJSON(), both deliberate:
//
//   - no `timestamp`. A sender's claimed clock is not something a
//     receiver in a decentralized, no-trust environment should lean
//     on for freshness — see core/PresenceFreshness.js, which derives
//     PRESENT/STALE/ABSENT from the RECEIVER's own clock at the
//     moment an advertisement actually arrived, never from anything
//     the sender claims.
//   - no signature, no envelope. AvatarPresence stays exactly what
//     0.2.33 established: never signed, never persisted. 0.2.37 does
//     not change that — see the design doc's own "explicitly NOT in
//     0.2.37" list.
//
// Plain, JSON-shaped objects on purpose (not a class instance) — the
// same reason every other wire-shape in this codebase (Publication.
// toJSON(), PlacementRecord.toJSON()) stays plain data: a
// BroadcastChannel message is structured-cloned to a completely
// different JS realm, where a custom class's prototype means nothing
// anyway.
export function toAvatarPresenceAdvertisement(presence) {
    return {
        avatarId: presence.avatarId,
        ownerIdentity: presence.ownerIdentity,
        position: { x: presence.position.x, y: presence.position.y, z: presence.position.z },
        rotation: {
            x: (presence.rotation && presence.rotation.x) || 0,
            y: (presence.rotation && presence.rotation.y) || 0,
            z: (presence.rotation && presence.rotation.z) || 0
        },
        animation: presence.animation,
        sequence: presence.sequence
    };
}

// A defensive shape check applied at the ingestion boundary — see
// application/LocalPresenceStore.js. Nothing arriving over a
// broadcast transport is trusted structurally, let alone
// authoritatively; a malformed message is simply discarded, the same
// failure-isolation posture the rest of this codebase already applies
// to untrusted input.
export function isValidAvatarPresenceAdvertisement(value) {
    return Boolean(value)
        && typeof value.avatarId === 'string' && value.avatarId.length > 0
        && Boolean(value.position)
        && Number.isFinite(value.position.x)
        && Number.isFinite(value.position.y)
        && Number.isFinite(value.position.z)
        && Number.isFinite(value.sequence);
}
