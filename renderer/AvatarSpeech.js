import { createSpeechBubble } from './ResidentSpeechBubble.js';

// What players say aloud (core/avatar/AvatarSay.js), as bubbles over their
// avatars: the residents' bubble (renderer/ResidentSpeechBubble.js), one per
// avatar, a new line replacing the last, each fading after its seconds.
// Keyed by avatar id; the caller passes the avatar's root to hang it on.
export class AvatarSpeech {
    constructor({ speechBubbleFor = createSpeechBubble } = {}) {
        this._speechBubbleFor = speechBubbleFor;
        this._speaking = new Map(); // key -> { root, bubble, secondsLeft }
    }

    show(key, root, text, seconds) {
        this.clear(key);
        if (!root) return;
        const bubble = this._speechBubbleFor([text]);
        if (!bubble) return;
        root.add(bubble.object);
        this._speaking.set(key, { root, bubble, secondsLeft: seconds });
    }

    // The bubble over `key` now, or null.
    bubbleOf(key) {
        const entry = this._speaking.get(key);
        return entry ? entry.bubble.object : null;
    }

    tick(deltaSeconds) {
        const dt = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 0;
        for (const [key, entry] of [...this._speaking]) {
            entry.secondsLeft -= dt;
            if (entry.secondsLeft <= 0) this.clear(key);
        }
    }

    clear(key) {
        const entry = this._speaking.get(key);
        if (!entry) return;
        entry.root.remove(entry.bubble.object);
        entry.bubble.dispose();
        this._speaking.delete(key);
    }

    dispose() {
        for (const key of [...this._speaking.keys()]) this.clear(key);
    }
}
