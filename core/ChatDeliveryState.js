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
//                outbox, never an infinite-retry one. A fact about
//                TIME, never about a relationship — see CANCELLED,
//                below, for the other reason a QUEUED message can
//                stop waiting.
//   CANCELLED  — 0.2.72. This device's OWN local authorization for
//                the recipient was proactively withdrawn — Alice
//                blocked Bob, or unfriended him — while the message
//                still sat QUEUED, never SENT. See
//                application/ChatOutbox.js#cancel()'s own header:
//                never lazy, never waiting for a reconnect attempt
//                that a peer who never comes back online would make
//                impossible to ever reach. A fact about a
//                RELATIONSHIP, never about time — never confuse this
//                with EXPIRED, above: an EXPIRED message might well
//                have reached its recipient if only this device had
//                stayed online a little longer; a CANCELLED one was
//                never going to, regardless of timing, because the
//                sender's own local policy said so. Deliberately
//                scoped to QUEUED mail only — a SENT entry already
//                left this device's own outbox and reached the wire;
//                there is nothing left here to cancel, only an
//                acknowledgement to wait for or not.
//
// Never confuse SENT with DELIVERED, and never confuse EXPIRED (this
// device gave up on TIME) or CANCELLED (this device gave up on
// AUTHORIZATION) with a peer-side rejection (the wrong identity on
// reconnect — see application/ChatUseCase.js#_attemptFlush()) — that
// case never produces an outbox entry in the first place; there is
// nothing here to expire or cancel.
export const ChatDeliveryState = Object.freeze({
    QUEUED: 'QUEUED',
    SENT: 'SENT',
    DELIVERED: 'DELIVERED',
    EXPIRED: 'EXPIRED',
    CANCELLED: 'CANCELLED'
});

export function isValidChatDeliveryState(value) {
    return Object.values(ChatDeliveryState).includes(value);
}

// 0.2.83 — Multi-Device Conversation & Read-State Synchronization.
//
// A synced copy of an outgoing message (application/
// DeviceConversationSyncUseCase.js) can arrive carrying a delivery state
// this device's own copy of the same message has already moved past —
// two devices independently tracking the SAME message's own journey
// (QUEUED -> SENT -> DELIVERED) will observe it at different points in
// time, and sync must never let an older observation overwrite a newer
// one. A total order over the four states a message can actually still
// be found in when synced (never CANCELLED — see this file's own header
// on why a cancellation is scoped to QUEUED mail that never left THIS
// device's own outbox, so it has nothing to say about a sibling's copy):
// QUEUED < SENT < DELIVERED, and EXPIRED is treated as terminal, exactly
// like DELIVERED — both mean "nothing more will happen to this message,"
// even though only one of them is the happy path.
const ADVANCEMENT_RANK = Object.freeze({
    [ChatDeliveryState.QUEUED]: 1,
    [ChatDeliveryState.SENT]: 2,
    [ChatDeliveryState.DELIVERED]: 3,
    [ChatDeliveryState.EXPIRED]: 3,
    [ChatDeliveryState.CANCELLED]: 3
});

export function isDeliveryStateAdvancement(from, to) {
    if (to === null || !isValidChatDeliveryState(to)) {
        return false;
    }
    if (from === null) {
        return true;
    }
    if (!isValidChatDeliveryState(from)) {
        return true;
    }
    return ADVANCEMENT_RANK[to] > ADVANCEMENT_RANK[from];
}
