// 0.2.61 — Direct Peer Messaging & Live Chat.
//
// Deliberately named `LiveConversation`, never `ChatHistory` — see
// application/ChatUseCase.js's own header, "0.2.61 Ships Live Chat, Not
// A Message Database" (docs/Principles.md): this is in-memory-only
// session state, exactly as durable as the application/ChatUseCase.js
// instance that owns it, and gone the moment this device reloads. Later
// milestones may deliberately decide what persistent "message history"
// actually means in a decentralized system (durable storage, custody,
// multi-device sync) — this class makes no attempt to anticipate that
// decision, and carries no toJSON/fromJSON on purpose: there is nothing
// here meant to survive being written down.
//
// One instance per remote identity this device has exchanged at least
// one chat message with THIS SESSION — see application/ChatUseCase.js's
// own `_conversations` Map. `conversationId` is carried for display/
// debugging only; every actual trust decision is made one layer up, in
// application/ChatUseCase.js, before a message is ever appended here.
export class LiveConversation {
    constructor({ conversationId, peerIdentityId }) {
        if (!conversationId || typeof conversationId !== 'string') {
            throw new Error('LiveConversation: conversationId is required');
        }
        if (!peerIdentityId || typeof peerIdentityId !== 'string') {
            throw new Error('LiveConversation: peerIdentityId is required');
        }
        this._conversationId = conversationId;
        this._peerIdentityId = peerIdentityId;
        this._messages = [];
    }

    get conversationId() { return this._conversationId; }
    get peerIdentityId() { return this._peerIdentityId; }

    // A snapshot array, never the live internal one — a caller mutating
    // the result never corrupts this conversation's own record.
    get messages() { return this._messages.slice(); }

    // `direction` is 'outgoing' (this device sent it) or 'incoming'
    // (this device received and already-trusted it) — appended in
    // acceptance order, which for a live, ordered transport is also
    // display order. `message` is a plain core/ChatMessage.js shape;
    // this class never re-validates it — see application/ChatUseCase.js,
    // the only caller, for where that already happened.
    append(message, direction) {
        this._messages.push({ ...message, direction });
    }
}
