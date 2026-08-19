// 0.2.61 — Direct Peer Messaging & Live Chat. "Have I already accepted
// this exact chat message, and is it at least as new as the last one I
// accepted from this sender, in this conversation?" — the chat
// counterpart to core/AvatarInteractionReplayWindow.js, same bounded,
// per-key double-duty structure, keyed by `${conversationId}:${senderIdentity}`
// rather than by avatarId:
//
//   ids            — a bounded, insertion-ordered set of recently
//                     accepted `messageId`s, for exact-duplicate
//                     suppression INDEPENDENT of ordering — replaying a
//                     captured, genuinely-valid message is rejected
//                     here regardless of its (unchanged) sequence.
//   highestSequence — the highest `sequence` accepted so far from this
//                     sender in this conversation, consulted by
//                     core/ChatMessageIngestion.js's
//                     resolveIncomingChatMessage() to reject a
//                     genuinely OLD message even under a fresh
//                     messageId.
//
// Keyed per (conversationId, senderIdentity) rather than merely per
// conversationId — a direct chat is 1:1 today, so the two keyings
// coincide in practice, but scoping to the sender explicitly is what
// keeps this structure honest about what it is actually tracking
// ("newer message FROM THIS SENDER"), never silently assuming a
// conversation only ever has one possible sender because that happens
// to be true right now.
//
// Bounded for the exact same reason core/AvatarInteractionReplayWindow.js
// is bounded rather than reusing replication/ReplayGuard.js's unbounded
// set — see that file's own header. A live chat session only ever needs
// to catch RECENT redelivery.
const WINDOW_SIZE = 256;

export class ChatReplayWindow {
    constructor(windowSize = WINDOW_SIZE) {
        this._windowSize = windowSize;
        this._seen = new Map(); // key -> { ids: Set(messageId), highestSequence: number|null }
    }

    hasAccepted(key, messageId) {
        const entry = this._seen.get(key);
        return !!entry && entry.ids.has(messageId);
    }

    // The highest `sequence` accepted so far for this key, or null if
    // none has ever been accepted — the exact shape
    // core/ChatMessageIngestion.js's resolveIncomingChatMessage()
    // expects for its "nothing accepted yet" branch.
    highestSequence(key) {
        const entry = this._seen.get(key);
        return entry ? entry.highestSequence : null;
    }

    // Idempotent for messageId — recording the same id twice never
    // disturbs eviction order. `sequence` always advances
    // highestSequence forward (never backward), independent of whether
    // messageId itself was new.
    recordAccepted(key, messageId, sequence) {
        let entry = this._seen.get(key);
        if (!entry) {
            entry = { ids: new Set(), highestSequence: null };
            this._seen.set(key, entry);
        }
        if (!entry.ids.has(messageId)) {
            entry.ids.add(messageId);
            if (entry.ids.size > this._windowSize) {
                const oldest = entry.ids.values().next().value;
                entry.ids.delete(oldest);
            }
        }
        if (!Number.isFinite(entry.highestSequence) || sequence > entry.highestSequence) {
            entry.highestSequence = sequence;
        }
    }

    clear() {
        this._seen.clear();
    }
}
