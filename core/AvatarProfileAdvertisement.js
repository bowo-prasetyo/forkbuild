import { SignatureType } from './Signature.js';

// 0.2.41 — the WIRE representation of a local AvatarProfile, exactly
// mirroring core/AvatarPresenceAdvertisement.js's own shape/reasoning
// one level up the stack: "Presence says where the avatar is; the
// avatar profile says what the avatar looks like" (the design doc's
// own framing). Deliberately a SEPARATE advertisement from presence's,
// never folded into it — see docs/Principles.md, "Appearance And
// Position Are Different Lifecycles, Never One Message": position/
// rotation/animation are high-frequency and ephemeral; templateId/
// appearance/displayName are low-frequency and persistent. Mixing
// them into one message would force every single movement update to
// also carry the full appearance payload, multiplying traffic for no
// reason — the same "advertisement is a STRICT SUBSET, produced fresh
// every time, never a second model" discipline
// core/AvatarPresenceAdvertisement.js already established, applied to
// a completely different field set with a completely different
// publish cadence.
//
// `profileRevision` (not `sequence` — see core/AvatarProfile.js's own
// `revision` field) plays exactly the role `AvatarPresence.sequence`
// plays for presence: a flat, always-increasing integer a receiver
// uses to detect "this claim is older than one I already have,"
// tolerant of exactly the same reordering/duplication/gaps a real
// network produces. `id`/`revision` (not `sequence`) also matches the
// vocabulary core/PlacementRecord.js already uses for its own
// low-frequency, deliberately-changed content — a profile update is
// much closer in spirit to a placement revision than to a presence
// tick.
export function toAvatarProfileAdvertisement(profile) {
    return {
        avatarId: profile.avatarId,
        ownerIdentity: profile.ownerIdentity,
        profileRevision: profile.revision,
        templateId: profile.templateId,
        appearance: profile.appearance,
        displayName: profile.displayName
    };
}

// A defensive shape check applied at the ingestion boundary — see
// application/LocalAvatarProfileStore.js. Nothing arriving over a
// broadcast transport is trusted structurally, let alone
// authoritatively; a malformed message is simply discarded, the same
// failure-isolation posture core/AvatarPresenceAdvertisement.js's own
// isValidAvatarPresenceAdvertisement() already applies.
export function isValidAvatarProfileAdvertisement(value) {
    return Boolean(value)
        && typeof value.avatarId === 'string' && value.avatarId.length > 0
        && typeof value.templateId === 'string' && value.templateId.length > 0
        && Boolean(value.appearance) && typeof value.appearance === 'object' && !Array.isArray(value.appearance)
        && Number.isFinite(value.profileRevision);
}

// 0.2.41 — the canonical signing envelope for an OPTIONAL signature
// over a profile advertisement, same shape
// core/AvatarPresenceAdvertisement.js's own
// getAvatarPresenceSigningDescriptor() establishes and for the exact
// same reason: covers EVERY field, never a narrower subset such as
// just avatarId+profileRevision — signing only those two would let an
// attacker keep a valid signature while swapping in a different
// templateId/appearance, recreating 0.2.18's causal-history signing
// bug one level up.
export function getAvatarProfileSigningDescriptor(advertisement) {
    return {
        type: SignatureType.AVATAR_PROFILE,
        id: advertisement.avatarId,
        revision: advertisement.profileRevision,
        payload: {
            avatarId: advertisement.avatarId,
            ownerIdentity: advertisement.ownerIdentity,
            profileRevision: advertisement.profileRevision,
            templateId: advertisement.templateId,
            appearance: advertisement.appearance,
            displayName: advertisement.displayName
        }
    };
}
