import { WorldPosition } from '../../core/WorldPosition.js';

// Runtime-only state: where the spatial camera is and how it behaves.
// Not part of the ForkBuild Protocol; never serialized. Navigation
// semantics only — no Three.js.
export class SpatialCameraState {
    constructor({
        position = new WorldPosition(),
        target = new WorldPosition(),
        mode = 'orbit'
    } = {}) {
        this._position = position;
        this._target = target;
        this._mode = mode;
    }

    get position() {
        return this._position;
    }

    get target() {
        return this._target;
    }

    get mode() {
        return this._mode;
    }

    clone() {
        return new SpatialCameraState({
            position: this._position.clone(),
            target: this._target.clone(),
            mode: this._mode
        });
    }
}
