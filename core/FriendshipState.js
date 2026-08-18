// 0.2.57 — Decentralized Friend Relationships & Mutual Consent. A
// single, UI-facing vocabulary for "where does THIS device's
// relationship with one other identity currently stand," derived the
// same "computed, never stored" way `peer/PeerLifecycleState.js#derivePeerLifecycleState()`
// already derives a peer's lifecycle from its two real, independently
// tracked state machines — see that file's own header for why storing
// a third, redundant value alongside the two real ones it summarizes
// is a mistake this codebase keeps deliberately avoiding.
//
//   NONE       -> no signed REQUEST exists in either direction yet.
//   REQUESTED  -> exactly one side has sent a signed REQUEST; the
//                 other side has not yet answered with a signed
//                 ACCEPT. Could be THIS device's own outgoing request,
//                 or a pending incoming one waiting on a decision.
//   FRIEND     -> mutual consent is PROVEN: this device holds a signed
//                 REQUEST from one identity and a signed ACCEPT from
//                 the OTHER, regardless of which side initiated. See
//                 deriveFriendshipState() below and docs/Principles.md,
//                 "Friendship Is Mutual Consent, Never A Unilateral
//                 Claim" (0.2.57).
export const FriendshipState = Object.freeze({
    NONE: 'NONE',
    REQUESTED: 'REQUESTED',
    FRIEND: 'FRIEND'
});

// `outgoing`/`incoming` are each either `null` or a plain
// `{ action }`-shaped object — deliberately duck-typed rather than
// requiring a real core/FriendshipAdvertisement.js instance, so
// core/FriendshipRecord.js (this function's only caller) can pass its
// own stored, already-verified JSON straight through without an
// extra reconstruction step.
//
// `outgoing` is whatever action THIS device authored and signed (a
// REQUEST it sent, or an ACCEPT it sent in answer to someone else's
// REQUEST). `incoming` is whatever action the OTHER identity authored
// and signed, ALREADY VERIFIED against their own key before ever
// reaching this function — deriveFriendshipState() itself performs no
// cryptography and trusts both inputs completely, exactly the same
// division of responsibility derivePeerLifecycleState() draws against
// its own two, separately-verified state machines.
//
// FRIEND requires the two actions to be COMPLEMENTARY, not merely
// both present: one side's REQUEST answered by the other side's
// ACCEPT. Two REQUESTs with no ACCEPT yet (both identities asked
// simultaneously) is still REQUESTED, on purpose — see docs/
// Principles.md, "Friendship Is Mutual Consent, Never A Unilateral
// Claim": asking is not agreeing, even when both sides happen to ask
// at once, and an ACCEPT is the only signed evidence this codebase
// treats as agreement.
export function deriveFriendshipState({ outgoing = null, incoming = null } = {}) {
    if (!outgoing && !incoming) {
        return FriendshipState.NONE;
    }
    const outgoingAction = outgoing ? outgoing.action : null;
    const incomingAction = incoming ? incoming.action : null;
    const isFriend =
        (outgoingAction === 'REQUEST' && incomingAction === 'ACCEPT') ||
        (outgoingAction === 'ACCEPT' && incomingAction === 'REQUEST');
    return isFriend ? FriendshipState.FRIEND : FriendshipState.REQUESTED;
}
