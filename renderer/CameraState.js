import { Position } from '../core/Position.js';

// A pure data snapshot of where the camera is: position, the point it's
// looking at, and zoom. No Three.js — this is what getState()/setState()
// exchange, and later (0.1.8) what gets saved/restored, without
// CameraController itself needing to be serializable. Reuses core/Position
// rather than reinventing an {x,y,z} shape.
const DEFAULT_POSITION = new Position(10, 10, 10);
const DEFAULT_TARGET = new Position(0, 0, 0);
const DEFAULT_ZOOM = 1;

export class CameraState {
    constructor({
        position = DEFAULT_POSITION,
        target = DEFAULT_TARGET,
        zoom = DEFAULT_ZOOM
    } = {}) {
        this._position = position;
        this._target = target;
        this._zoom = zoom;
    }

    get position() {
        return this._position;
    }

    get target() {
        return this._target;
    }

    get zoom() {
        return this._zoom;
    }

    clone() {
        return new CameraState({
            position: this._position.clone(),
            target: this._target.clone(),
            zoom: this._zoom
        });
    }
}
