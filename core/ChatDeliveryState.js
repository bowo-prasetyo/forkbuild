// 0.2.63 — Reliable Offline Messaging & Delivery State.
//
// A closed, four-value vocabulary for "what happened to a message I
// deliberately sent," deliberately narrower than the fuller state
// machine a first sketch of this milestone considered (LOCAL_ONLY,
// FAILED). Every value below is actually reachable and actually
// asserted somewhere in tests/OfflineMessagingDeliveryState.test.js —
// see docs/Principles.md, "The Outbox Prunes Itself; It Is Not A
// Message Database" (0.2.63), on why a state nothing in this codebase
// ever transitions to has no business existing here just because a
// richer design doc imagined it.
//
//   QUEUED     — application/ChatOutbox.js holds this message,
//                addressed to a peer identity, not yet handed to
//                peer/PeerMessageBus.js#send(). The peer may be
//                offline, or may simply not have been checked yet —
//                see application/ChatUseCase.js#sendOrQueue().
//   SENT       — handed to the wire over a live, AUTHENTICATED
//                connection. Deliberately NOT "delivered" — see
//                core/ChatDeliveryAck.js's own header on why "the
//                bus accepted this for transmission" and "the
//                recipient's own ChatUseCase actually accepted it"
//                are kept two genuinely different facts, the same
//                split core/ChatMessage.js's own header already drew
//                between a message's identity, its sequence, and its
//                delivery order (0.2.61).
//   DELIVERED  — a core/ChatDeliveryAck.js came back from the
//                recipient's own, already-trusted ingestion. The
//                outbox's job for this one message is over the
//                instant this is reached — see
//                application/ChatOutbox.js#acknowledge().
//   EXPIRED    — this device gave up: the message's TTL elapsed
//                while it was still QUEUED (or still SENT, waiting on
//                an ack that never came) — see
//                core/ChatOutboxEntry.js#isExpired(). A best-effort
//                outbox, never an infinite-retry one.
//
// Never confuse SENT with DELIVERED, and never confuse EXPIRED (this
// device gave up) with a peer-side rejection (unfriended, blocked, or
// simply the wrong identity on reconnect — see
// application/ChatUseCase.js#_attemptFlush()) — those never produce an
// outbox entry in the first place; there is nothing here to expire.
export const ChatDeliveryState = Object.freeze({
    QUEUED: 'QUEUED',
    SENT: 'SENT',
    DELIVERED: 'DELIVERED',
    EXPIRED: 'EXPIRED'
});

export function isValidChatDeliveryState(value) {
    return Object.values(ChatDeliveryState).includes(value);
}
