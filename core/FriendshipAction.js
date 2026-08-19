// 0.2.57 — Decentralized Friend Relationships & Mutual Consent. The
// small, closed vocabulary of signed actions a `core/
// FriendshipAdvertisement.js` can carry, following the exact same
// "own file, own closed vocabulary" convention `core/
// AvatarInteractionKind.js` established for GREET/WAVE/POINT (0.2.44).
//
// 0.2.57 shipped a vocabulary of exactly two, DELIBERATELY — see docs/
// Principles.md, "Friendship Can Be Established, But Not Yet Revoked"
// (0.2.57). REQUEST and ACCEPT alone are enough to prove mutual
// consent (see core/FriendshipState.js#deriveFriendshipState); adding
// revocation meant answering "what does it mean when one replica's
// local record disagrees with the other side's?", which that
// milestone declined to ship half-answered.
//
// 0.2.60 — Friendship Revocation, Blocking & Privacy Withdrawal answers
// it: REJECT (decline a pending incoming REQUEST), CANCEL (withdraw
// your own pending outgoing REQUEST before it's answered), and UNFRIEND
// (end a currently-FRIEND relationship, from either side). Each is a
// TERMINAL action — see isTerminalFriendshipAction() below and core/
// FriendshipRecord.js#reset(): recording one collapses BOTH directions
// of the record back to a clean NONE, never leaving a stale REQUEST/
// ACCEPT sitting alongside it that a later, fresh REQUEST cycle could
// accidentally (or maliciously — see core/FriendshipAdvertisement.js's
// own header on `inResponseTo`) satisfy.
//
// BLOCK is deliberately NOT part of this vocabulary. See docs/
// Principles.md, "Friendship Is Mutual Relationship State; Blocking Is
// A Unilateral Local Decision" (0.2.60): a friendship action is signed
// evidence exchanged between two identities because mutual consent is
// exactly the kind of fact that needs proving to someone else. Blocking
// proves nothing to anyone — it is one device's own local refusal to
// keep talking to an identity — so it lives entirely outside this wire
// protocol, in core/PeerBlockRecord.js/application/PeerBlockUseCase.js,
// which never send anything over the network at all.
export const FriendshipAction = Object.freeze({
    REQUEST: 'REQUEST',
    ACCEPT: 'ACCEPT',
    REJECT: 'REJECT',
    CANCEL: 'CANCEL',
    UNFRIEND: 'UNFRIEND'
});

export function isValidFriendshipAction(value) {
    return Object.values(FriendshipAction).includes(value);
}

// The three actions that END whatever this direction's evidence was
// claiming, rather than building toward FRIEND — see core/
// FriendshipRecord.js#reset(), the only caller that needs to ask this
// question. REQUEST/ACCEPT are the only two NON-terminal actions.
const TERMINAL_FRIENDSHIP_ACTIONS = new Set([
    FriendshipAction.REJECT,
    FriendshipAction.CANCEL,
    FriendshipAction.UNFRIEND
]);

export function isTerminalFriendshipAction(action) {
    return TERMINAL_FRIENDSHIP_ACTIONS.has(action);
}

// A fixed, per-action integer — never a per-relationship counter that
// would need durable state of its own just to hand out the next
// number. 0.2.57's own comment here promised this vocabulary could
// only ever grow additively; it has, and the same flat mapping still
// works unchanged, because `revision` was never asked to be monotonic
// across a relationship's whole lifetime (unlike `AvatarProfile.revision`/
// `AvatarPresence.sequence`) — its only job is to make a REQUEST's
// signed payload provably distinct from an ACCEPT's, or a REJECT's, or
// any other action's, satisfying core/Signature.js's own domain
// separation. A relationship that cycles REQUEST -> ACCEPT -> UNFRIEND
// -> REQUEST again perfectly validly reuses sequence 1 for the second
// REQUEST — replay resistance ACROSS that cycle boundary is
// `inResponseTo`'s job (core/FriendshipAdvertisement.js), never this
// field's.
export const FRIENDSHIP_ACTION_SEQUENCE = Object.freeze({
    [FriendshipAction.REQUEST]: 1,
    [FriendshipAction.ACCEPT]: 2,
    [FriendshipAction.REJECT]: 3,
    [FriendshipAction.CANCEL]: 4,
    [FriendshipAction.UNFRIEND]: 5
});
