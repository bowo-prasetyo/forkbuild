// 0.2.38 — "Have I already accepted this exact presence claim?",
// scoped per avatarId. Answers the same question
// `replication/ReplayGuard.js` answers for `PlacementRecord`s and
// `Delegation`s, but DELIBERATELY does not reuse that class: ReplayGuard
// remembers every hash it has ever seen, forever, in an unbounded Set —
// entirely appropriate for the rare, deliberate events it was built
// for, and a genuine memory leak for this one. A live avatar's
// presence stream is the opposite of rare: every accepted WASD step
// advances `sequence` and would add one more permanent entry for as
// long as a session/tab stays open, in exactly the always-on feature
// this milestone must not make worse.
//
// Real replay detection at this update rate only ever needs to catch
// RECENT redelivery or duplication — the design doc's own example
// (sequence 100 replayed after 101 is already current) never needs
// more than the last couple of accepted claims remembered. So this
// keeps only the most recent WINDOW_SIZE accepted hashes per avatarId,
// evicting the oldest once that fills — the same bounded-recency
// posture a TLS/TCP anti-replay window uses, rather than an
// unbounded "remember forever" set.
const WINDOW_SIZE = 64;

export class PresenceReplayWindow {
    constructor(windowSize = WINDOW_SIZE) {
        this._windowSize = windowSize;
        this._seen = new Map(); // avatarId -> Set(hash), insertion-ordered
    }

    hasAccepted(avatarId, hash) {
        const set = this._seen.get(avatarId);
        return !!set && set.has(hash);
    }

    // Idempotent — recording the same hash twice is a no-op that does
    // not disturb eviction order.
    recordAccepted(avatarId, hash) {
        let set = this._seen.get(avatarId);
        if (!set) {
            set = new Set();
            this._seen.set(avatarId, set);
        }
        if (set.has(hash)) {
            return;
        }
        set.add(hash);
        if (set.size > this._windowSize) {
            const oldest = set.values().next().value;
            set.delete(oldest);
        }
    }

    clear() {
        this._seen.clear();
    }
}
