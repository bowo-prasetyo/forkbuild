// 0.2.45 — "Have I already accepted this exact interaction event, and
// is it at least as new as the last one I accepted from this avatar?"
// scoped per avatarId. The interaction counterpart to
// core/PresenceReplayWindow.js, but deliberately doing double duty in
// ONE bounded structure — "a bounded replay window specifically
// designed for interaction IDs/sequences," per the design doc — rather
// than two separate pieces of state:
//
//   ids            — a bounded, insertion-ordered set of recently
//                     accepted `interactionId`s, for exact-duplicate
//                     suppression INDEPENDENT of ordering (see
//                     core/AvatarInteractionAdvertisement.js's own
//                     header — this is exactly the property
//                     `interactionId` exists to provide).
//   highestSequence — the highest `sequence` accepted so far from this
//                     avatarId, consulted by
//                     core/AvatarInteractionIngestion.js's
//                     resolveIncomingInteraction() to reject a
//                     genuinely OLD event even under a NEW
//                     interactionId — "newer event from Bob," not
//                     merely "an event from Bob I haven't seen the
//                     exact id of before."
//
// Bounded for the same reason core/PresenceReplayWindow.js is bounded
// rather than reusing replication/ReplayGuard.js's unbounded set: a
// live avatar's interaction stream, while much lower-frequency than
// its presence stream (gated by core/AvatarInteractionCooldown.js),
// is still an always-on feature for as long as a session/tab stays
// open. Real replay detection at this rate only ever needs to catch
// RECENT redelivery — the same bounded-recency posture a TLS/TCP
// anti-replay window uses.
const WINDOW_SIZE = 32;

export class AvatarInteractionReplayWindow {
    constructor(windowSize = WINDOW_SIZE) {
        this._windowSize = windowSize;
        this._seen = new Map(); // avatarId -> { ids: Set(interactionId), highestSequence: number|null }
    }

    hasAccepted(avatarId, interactionId) {
        const entry = this._seen.get(avatarId);
        return !!entry && entry.ids.has(interactionId);
    }

    // The highest `sequence` accepted so far for avatarId, or null if
    // none has ever been accepted — the exact shape
    // core/AvatarInteractionIngestion.js's resolveIncomingInteraction()
    // expects for its "nothing accepted yet" branch.
    highestSequence(avatarId) {
        const entry = this._seen.get(avatarId);
        return entry ? entry.highestSequence : null;
    }

    // Idempotent for interactionId — recording the same id twice never
    // disturbs eviction order. `sequence` always advances
    // highestSequence forward (never backward), independent of
    // whether interactionId itself was new.
    recordAccepted(avatarId, interactionId, sequence) {
        let entry = this._seen.get(avatarId);
        if (!entry) {
            entry = { ids: new Set(), highestSequence: null };
            this._seen.set(avatarId, entry);
        }
        if (!entry.ids.has(interactionId)) {
            entry.ids.add(interactionId);
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
