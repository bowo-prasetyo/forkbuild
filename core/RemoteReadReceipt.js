// 0.2.71 — Explicit Read Acknowledgement.
//
// "What has THE PEER told me they have seen of MY OWN messages?" — the
// mirror image of core/ConversationReadMarker.js (0.2.70), and
// deliberately never the same class or the same store as that one, even
// though the two are structurally identical (a peerIdentityId plus a
// monotonic high-water-mark sequence). They answer opposite-direction
// questions:
//
//   core/ConversationReadMarker.js   — what have I (this device) seen
//                                       of the PEER's messages. LOCAL,
//                                       unsigned, never transmitted.
//   core/RemoteReadReceipt.js        — what has the PEER told me they
//                                       have seen of MY OWN messages.
//                                       A received, trusted NETWORK
//                                       claim — see
//                                       application/ChatUseCase.js#_handleIncomingRead(),
//                                       which only ever writes this
//                                       AFTER the exact same
//                                       "connection-proven sender,
//                                       correct conversationId" trust
//                                       gates every other incoming
//                                       chat payload in this codebase
//                                       already passes through.
//
// Collapsing these two into one class was considered and rejected —
// the same reasoning docs/Principles.md, "A Read Marker Answers A
// Third Question; It Is Never Folded Into The Outbox Or The History
// Store" (0.2.70), already gives for keeping structurally-similar
// stores separate: one is a purely local fact this device asserts about
// itself, the other is a claim ABOUT this device that arrived over the
// wire from someone else. Confusing which one a piece of code is
// reading would be exactly the kind of local-fact-vs-network-fact
// conflation this milestone's own design explicitly refuses to allow.
//
// Immutable and monotonic, like `core/ConversationReadMarker.js` itself
// — `withReadThroughSequence()` always returns a NEW record and always
// takes the MAX of the old and new value, so an out-of-order or
// duplicate READ receipt (see core/ChatReadReceipt.js's own header) is
// harmless by construction, never something a receiver needs a replay
// window to detect and reject.
export class RemoteReadReceipt {
    constructor({ peerIdentityId, readThroughSequence = 0, updatedAt = new Date() } = {}) {
        if (!peerIdentityId || typeof peerIdentityId !== 'string') {
            throw new Error('RemoteReadReceipt: peerIdentityId is required');
        }
        if (!Number.isInteger(readThroughSequence) || readThroughSequence < 0) {
            throw new Error('RemoteReadReceipt: readThroughSequence must be a non-negative integer');
        }
        this._peerIdentityId = peerIdentityId;
        this._readThroughSequence = readThroughSequence;
        this._updatedAt = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
    }

    get peerIdentityId() { return this._peerIdentityId; }
    get readThroughSequence() { return this._readThroughSequence; }
    get updatedAt() { return this._updatedAt; }

    withReadThroughSequence(readThroughSequence, updatedAt = new Date()) {
        return new RemoteReadReceipt({
            peerIdentityId: this._peerIdentityId,
            readThroughSequence: Math.max(this._readThroughSequence, readThroughSequence),
            updatedAt
        });
    }

    toJSON() {
        return {
            peerIdentityId: this._peerIdentityId,
            readThroughSequence: this._readThroughSequence,
            updatedAt: this._updatedAt.toISOString()
        };
    }

    static fromJSON(json) {
        if (!json || typeof json !== 'object') {
            return null;
        }
        try {
            return new RemoteReadReceipt(json);
        } catch {
            return null;
        }
    }
}
