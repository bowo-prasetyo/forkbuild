import { interpolatePresence } from '../core/PresenceInterpolation.js';

// 0.2.37 — ONE remote avatar's interpolation state: where we were
// last rendering it (`from`), the latest AUTHORITATIVE presence we've
// actually received (`to`), and when that target last changed. See
// core/PresenceInterpolation.js's own header for why `to` — never the
// interpolated output — is the authoritative value; this class is the
// only thing that ever reads `to` as ground truth, and it never
// writes it anywhere else.
//
// `retarget()` is called only when a NEW advertisement is accepted
// (its sequence differs from what `to` already holds) — repeatedly
// retargeting to the SAME advertisement would restart the
// interpolation clock for no reason and make the avatar visibly
// stutter. Snapshotting the CURRENT interpolated position as the new
// `from` (rather than jumping `from` back to the old `to`) is what
// keeps a rapid string of updates smooth instead of jerky — each new
// target blends from wherever the avatar visually already is.
const DEFAULT_INTERPOLATION_DURATION_MS = 150;

export class RemoteAvatarInterpolator {
    constructor(initialAdvertisement, now = Date.now(), { durationMs = DEFAULT_INTERPOLATION_DURATION_MS } = {}) {
        this._durationMs = durationMs;
        this._from = initialAdvertisement;
        this._to = initialAdvertisement;
        this._startedAt = now;
    }

    get sequence() {
        return this._to.sequence;
    }

    retarget(advertisement, now = Date.now()) {
        if (advertisement.sequence === this._to.sequence) {
            return;
        }
        this._from = this.currentPresence(now);
        this._to = advertisement;
        this._startedAt = now;
    }

    currentPresence(now = Date.now()) {
        const elapsed = now - this._startedAt;
        const t = this._durationMs > 0 ? elapsed / this._durationMs : 1;
        return interpolatePresence(this._from, this._to, t);
    }
}
