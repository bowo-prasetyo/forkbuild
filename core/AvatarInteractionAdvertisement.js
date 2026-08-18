import { SignatureType } from './Signature.js';
import { createId } from './createId.js';
import { AvatarInteractionKind, isValidInteractionKind } from './AvatarInteractionKind.js';

// 0.2.45 — Ephemeral Avatar Interaction Synchronization. The wire shape
// for ONE performed GREET/WAVE/POINT, the networked counterpart to
// core/AvatarInteractionKind.js's LOCAL-only vocabulary (0.2.44).
// Deliberately its OWN advertisement, never folded into
// AvatarPresenceAdvertisement or AvatarProfileAdvertisement — see
// docs/Principles.md, "Presence Describes An Avatar's Current State;
// Interaction Describes An Event That Happened (0.2.45)":
// position/rotation/animation and templateId/appearance/displayName
// both describe ongoing STATE a receiver keeps the LATEST value of. A
// GREET/WAVE/POINT describes something that HAPPENED once, is rendered
// briefly, and is then genuinely forgotten — see
// application/AvatarInteractionSyncService.js's own header for why
// nothing here is ever retained as "current" the way a presence/
// profile record is.
//
// Fields, and why each one is here:
//
//   avatarId       — who performed the interaction. Same identity
//                     vocabulary as presence/profile.
//   ownerIdentity  — carried for exactly the reason presence/profile
//                     advertisements carry it: the unsigned-claim
//                     fallback identity check
//                     core/PresenceAuthority.js's PresenceAuthorityRegistry
//                     already performs, reused as-is for interactions
//                     (see application/AvatarInteractionTrustBoundary.js).
//   interactionId  — a fresh UUID per performed gesture. The anchor
//                     for duplicate suppression
//                     (core/AvatarInteractionReplayWindow.js),
//                     independent of `sequence`'s own ordering role —
//                     "useful for duplicate suppression independently
//                     from avatar movement," per the design doc.
//   kind           — GREET/WAVE/POINT only. NEVER "none": the absence
//                     of an interaction is not an event and is never
//                     broadcast — see core/AvatarInteractionKind.js.
//   targetAvatarId — WHO the sender claims to be gesturing at. A
//                     receiver reads this as "the sender claims to
//                     have performed this gesture directed at this
//                     avatarId," NEVER as an instruction the target
//                     must obey — there is no reach into another
//                     avatar's own state here, the exact same posture
//                     0.2.44 already established for the local-only
//                     gesture this extends. A bystander who is neither
//                     the sender nor the named target may still
//                     legitimately observe and render the event ("Bob
//                     waved toward Alice," visible to Charlie too);
//                     whether to actually show it is a LOCAL
//                     presentation decision, never gated by this
//                     field.
//   sequence       — a flat, per-avatar-session monotonic counter,
//                     playing the same "is this newer than what I've
//                     already accepted" role AvatarPresence.sequence/
//                     AvatarProfile.revision already play one layer
//                     down — but its OWN counter, scoped to
//                     INTERACTION events specifically. "Presence
//                     sequence means newer STATE of Bob; interaction
//                     sequence means newer EVENT from Bob" — different
//                     semantics, per the design doc, hence never
//                     reused from AvatarPresence.sequence.
//   timestamp      — the sender's own clock, carried as EVENT
//                     metadata a receiver may use for display/
//                     ordering-within-a-burst purposes, never as an
//                     authority/freshness mechanism — see
//                     core/PresenceFreshness.js's own reasoning for why
//                     presence never trusts a sender's claimed clock
//                     either; the same caution applies here.
//   signature      — optional, exactly like presence/profile. A
//                     receiver's trust policy
//                     (core/AvatarInteractionTrustPolicy.js) decides
//                     whether an advertisement missing one is
//                     tolerated at all.
export function toAvatarInteractionAdvertisement({ avatarId, ownerIdentity, kind, targetAvatarId, sequence, timestamp = Date.now() }) {
    return {
        avatarId,
        ownerIdentity,
        interactionId: createId(),
        kind,
        targetAvatarId,
        sequence,
        timestamp
    };
}

// A defensive shape check applied at the ingestion boundary — see
// application/AvatarInteractionTrustBoundary.js. Nothing arriving over
// a broadcast transport is trusted structurally, let alone
// authoritatively; a malformed message is simply discarded, the same
// failure-isolation posture core/AvatarPresenceAdvertisement.js's own
// isValidAvatarPresenceAdvertisement() already applies.
export function isValidAvatarInteractionAdvertisement(value) {
    return Boolean(value)
        && typeof value.avatarId === 'string' && value.avatarId.length > 0
        && typeof value.interactionId === 'string' && value.interactionId.length > 0
        && isValidInteractionKind(value.kind) && value.kind !== AvatarInteractionKind.NONE
        && typeof value.targetAvatarId === 'string' && value.targetAvatarId.length > 0
        && Number.isFinite(value.sequence)
        && Number.isFinite(value.timestamp);
}

// 0.2.45 — the canonical signing envelope for an OPTIONAL signature
// over an interaction advertisement, the same shape/reasoning
// core/AvatarPresenceAdvertisement.js's own
// getAvatarPresenceSigningDescriptor() established: covers EVERY
// field, never a narrower subset such as just avatarId+sequence —
// signing only those two would let an attacker keep a valid signature
// while swapping in a different kind/targetAvatarId, recreating 0.2.18's
// causal-history signing bug one level up.
export function getAvatarInteractionSigningDescriptor(advertisement) {
    return {
        type: SignatureType.AVATAR_INTERACTION,
        id: advertisement.avatarId,
        revision: advertisement.sequence,
        payload: {
            avatarId: advertisement.avatarId,
            ownerIdentity: advertisement.ownerIdentity,
            interactionId: advertisement.interactionId,
            kind: advertisement.kind,
            targetAvatarId: advertisement.targetAvatarId,
            sequence: advertisement.sequence,
            timestamp: advertisement.timestamp
        }
    };
}
