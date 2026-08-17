// 0.2.36: `onFrame` now receives `deltaSeconds` — real ELAPSED TIME
// since the previous frame, computed from the timestamp
// requestAnimationFrame already hands its callback, not a frame
// count. See docs/Principles.md, "Animation Is Driven By Elapsed
// Time, Never By Frame Count" — a 30fps machine and a 144fps machine
// must simulate the same avatar walk speed, which is only possible if
// every consumer of this loop is handed real seconds, never "1 unit
// per frame."
const MAX_DELTA_SECONDS = 0.25; // clamps a resumed-from-background tab's first frame

export class AnimationLoop {
    constructor(onFrame) {
        this._onFrame = onFrame;
        this._frameId = null;
        this._running = false;
        this._lastTimestamp = null;
        this._tick = this._tick.bind(this);
    }

    start() {
        if (this._running) {
            return;
        }
        this._running = true;
        this._lastTimestamp = null;
        this._frameId = requestAnimationFrame(this._tick);
    }

    stop() {
        this._running = false;
        this._lastTimestamp = null;
        if (this._frameId !== null) {
            cancelAnimationFrame(this._frameId);
            this._frameId = null;
        }
    }

    _tick(timestamp) {
        if (!this._running) {
            return;
        }
        let deltaSeconds = 0;
        if (this._lastTimestamp !== null) {
            deltaSeconds = Math.min((timestamp - this._lastTimestamp) / 1000, MAX_DELTA_SECONDS);
        }
        this._lastTimestamp = timestamp;
        this._onFrame(deltaSeconds);
        this._frameId = requestAnimationFrame(this._tick);
    }
}
