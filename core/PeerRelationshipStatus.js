// 0.2.56 — the closed vocabulary for a persisted application/
// PeerRelationship.js, following the same `Object.freeze` + `isValid*`
// pattern core/PresenceVisibility.js and core/PeerLifecycleState.js
// already established.
//
// Deliberately a vocabulary of ONE. The design doc considered ONLINE/
// OFFLINE and rejected them: whether a known peer is currently
// reachable is already, and only ever, answered by
// application/ConnectedPeerRegistry.js — a live, ephemeral fact about
// a CONNECTION, never a property of the durable RELATIONSHIP record
// itself. Storing it a second time here would immediately raise the
// question every duplicated-state field in this codebase eventually
// has to answer: what happens when the stored copy disagrees with the
// registry it was copied from? KNOWN never needs to answer that,
// because it is the only value that exists — a relationship you can
// look up at all IS a relationship in the KNOWN state, by definition.
//
// This is intentionally NOT the same vocabulary as a future "Friend"
// concept (0.2.57, proposed, unscheduled) — see docs/Principles.md,
// "Knowing Is Not Befriending" (0.2.56). KNOWN answers "have I met
// this identity and chosen to keep a local record of it," nothing
// more.
export const PeerRelationshipStatus = Object.freeze({
    KNOWN: 'KNOWN'
});

export function isValidPeerRelationshipStatus(value) {
    return Object.values(PeerRelationshipStatus).includes(value);
}
