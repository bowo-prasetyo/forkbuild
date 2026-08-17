import { SignatureType } from './Signature.js';

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
//   - no signature, no envelope, as of 0.2.37. AvatarPresence ITSELF
//     stays exactly what 0.2.33 established — never signed, never
//     persisted — and 0.2.38 does not change that either; see
//     core/AvatarPresence.js's own header. What 0.2.38 DOES add is an
//     OPTIONAL `signature` field on the ADVERTISEMENT specifically
//     (this wire shape, produced fresh from an AvatarPresence every
//     time, never AvatarPresence itself): see
//     getAvatarPresenceSigningDescriptor() below and
//     application/PresenceSigning.js. A receiver's trust policy
//     (core/PresenceTrustPolicy.js) decides whether an advertisement
//     missing that field is tolerated at all.
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

// 0.2.38 — the canonical signing envelope for an OPTIONAL signature
// over an advertisement, in the exact shape core/Signature.js's
// canonicalBytes()/canonicalEnvelope() expect (see
// identity/LocalIdentityProvider.js's signCanonical()). Covers
// EVERYTHING that matters — avatarId, ownerIdentity, position,
// rotation, animation, AND sequence — deliberately never a narrower
// subset. Signing only avatarId+sequence, for example, would let an
// attacker take a legitimate signature and swap in a different
// position/rotation/animation while keeping it verifying — exactly
// the causal-history signing bug 0.2.18 fixed, recreated one level up
// if this shape ever shrank. `type`/`id`/`revision` follow the same
// convention Publication/PlacementRecord/SpatialIndexRoot already use
// (see core/Signature.js's own header): `id` is the object this
// signature is about (the avatarId), `revision` is which version of
// it (the sequence — the presence analogue of a PlacementRecord's
// `revision`).
export function getAvatarPresenceSigningDescriptor(advertisement) {
    return {
        type: SignatureType.AVATAR_PRESENCE,
        id: advertisement.avatarId,
        revision: advertisement.sequence,
        payload: {
            avatarId: advertisement.avatarId,
            ownerIdentity: advertisement.ownerIdentity,
            position: advertisement.position,
            rotation: advertisement.rotation,
            animation: advertisement.animation,
            sequence: advertisement.sequence
        }
    };
}
