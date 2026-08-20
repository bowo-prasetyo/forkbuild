// 0.2.83 — Multi-Device Conversation & Read-State Synchronization.
//
// "What is the highest local read position ANY of my own sibling devices
// has told me about, for one peer?" — deliberately its own value object,
// structurally identical to core/RemoteReadReceipt.js (0.2.71) but never
// reused as, or by, it: that class answers "what has the PEER told me
// about MY OWN messages"; this one answers "what has one of MY OWN OTHER
// DEVICES told me about ITS OWN read position in a conversation with a
// peer." Same shape, same monotonic discipline, completely different
// question — see application/SiblingReadStateStore.js's own header, and
// docs/Principles.md, "Per-Device Local Read State And Identity-Observed
// Read State Are Never The Same Fact" (0.2.83).
//
// A monotonic high-water mark, exactly like core/RemoteReadReceipt.js —
// `withLastReadSequence()` never regresses.
export class SiblingReadMarker {
    constructor({ peerIdentityId, lastReadSequence = 0 } = {}) {
        if (!peerIdentityId || typeof peerIdentityId !== 'string') {
            throw new Error('SiblingReadMarker: peerIdentityId is required');
        }
        if (!Number.isInteger(lastReadSequence) || lastReadSequence < 0) {
            throw new Error('SiblingReadMarker: lastReadSequence must be a non-negative integer');
        }
        this._peerIdentityId = peerIdentityId;
        this._lastReadSequence = lastReadSequence;
    }

    get peerIdentityId() { return this._peerIdentityId; }
    get lastReadSequence() { return this._lastReadSequence; }

    withLastReadSequence(sequence) {
        if (!Number.isInteger(sequence) || sequence <= this._lastReadSequence) {
            return this;
        }
        return new SiblingReadMarker({ peerIdentityId: this._peerIdentityId, lastReadSequence: sequence });
    }

    toJSON() {
        return { peerIdentityId: this._peerIdentityId, lastReadSequence: this._lastReadSequence };
    }

    static fromJSON(json) {
        if (!json || typeof json !== 'object') {
            return null;
        }
        try {
            return new SiblingReadMarker(json);
        } catch {
            return null;
        }
    }
}
