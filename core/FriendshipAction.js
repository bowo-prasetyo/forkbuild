// 0.2.57 — Decentralized Friend Relationships & Mutual Consent. The
// small, closed vocabulary of signed actions a `core/
// FriendshipAdvertisement.js` can carry, following the exact same
// "own file, own closed vocabulary" convention `core/
// AvatarInteractionKind.js` established for GREET/WAVE/POINT (0.2.44).
//
// Deliberately a vocabulary of exactly two, on purpose — see docs/
// Principles.md, "Friendship Can Be Established, But Not Yet Revoked"
// (0.2.57). REQUEST and ACCEPT are enough to prove mutual consent (see
// core/FriendshipState.js#deriveFriendshipState); REJECT, CANCEL,
// BLOCK, and UNFRIEND all introduce revocation semantics — "what does
// it mean when one replica's local record disagrees with the other
// side's?" — that this milestone deliberately leaves to a later one
// rather than shipping half-answered. Extending this vocabulary later
// is additive (a new advertisement type Signature.js's own domain
// separation already isolates from REQUEST/ACCEPT), never a breaking
// change to what ships here.
export const FriendshipAction = Object.freeze({
    REQUEST: 'REQUEST',
    ACCEPT: 'ACCEPT'
});

export function isValidFriendshipAction(value) {
    return Object.values(FriendshipAction).includes(value);
}

// A fixed, per-action integer — never a per-relationship counter that
// would need durable state of its own just to hand out the next
// number. Because REQUEST/ACCEPT is a closed, one-shot vocabulary (no
// re-request, no re-accept — see this file's own header above), a
// flat mapping is all `core/FriendshipAdvertisement.js#getFriendshipSigningDescriptor`
// needs to give every honestly-produced advertisement a `revision` a
// receiver can tell apart from any other action, matching the
// "always-increasing integer used as a signature revision" role
// `AvatarProfile.revision`/`AvatarPresence.sequence` already play, at
// the smallest scale this vocabulary actually requires.
export const FRIENDSHIP_ACTION_SEQUENCE = Object.freeze({
    [FriendshipAction.REQUEST]: 1,
    [FriendshipAction.ACCEPT]: 2
});
