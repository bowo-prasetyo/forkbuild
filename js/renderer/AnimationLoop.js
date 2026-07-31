export class AnimationLoop {
    constructor(onFrame) {
        this._onFrame = onFrame;
        this._frameId = null;
        this._running = false;
        this._tick = this._tick.bind(this);
    }

    start() {
        if (this._running) {
            return;
        }
        this._running = true;
        this._frameId = requestAnimationFrame(this._tick);
    }

    stop() {
        this._running = false;
        if (this._frameId !== null) {
            cancelAnimationFrame(this._frameId);
            this._frameId = null;
        }
    }

    _tick() {
        if (!this._running) {
            return;
        }
        this._onFrame();
        this._frameId = requestAnimationFrame(this._tick);
    }
}
