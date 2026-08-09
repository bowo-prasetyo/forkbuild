import { SpatialCameraState } from './spatial-state/SpatialCameraState.js';
import { CameraState } from '../renderer/CameraState.js';
import { WorldPosition } from '../core/WorldPosition.js';
import { Position } from '../core/Position.js';

// Translates spatial navigation commands into renderer CameraState
// changes. Always reads the renderer's current state before modifying
// it, so user-driven orbit/pan/zoom stays synchronized.
export class SpatialCameraController {
    constructor(renderSession) {
        this._renderSession = renderSession;
    }

    focusDocument(documentId, layoutPosition) {
        const offset = 35;
        const pos = new WorldPosition(
            layoutPosition.x + offset,
            layoutPosition.y + offset,
            layoutPosition.z + offset
        );
        const target = new WorldPosition(layoutPosition.x, layoutPosition.y, layoutPosition.z);
        this._applyToRenderer(new SpatialCameraState({ position: pos, target, mode: 'orbit' }));
    }

    focusTarget(target, offset = { x: 15, y: 15, z: 15 }) {
        const pos = new WorldPosition(
            target.x + offset.x,
            target.y + offset.y,
            target.z + offset.z
        );
        this._applyToRenderer(new SpatialCameraState({
            position: pos,
            target: new WorldPosition(target.x, target.y, target.z),
            mode: 'orbit'
        }));
    }

    moveCamera(delta) {
        const current = this.getSpatialCameraState();
        const newPos = new WorldPosition(
            current.position.x + delta.x,
            current.position.y + delta.y,
            current.position.z + delta.z
        );
        const newTarget = new WorldPosition(
            current.target.x + delta.x,
            current.target.y + delta.y,
            current.target.z + delta.z
        );
        this._applyToRenderer(new SpatialCameraState({
            position: newPos,
            target: newTarget,
            mode: current.mode
        }));
    }

    getSpatialCameraState() {
        const cs = this._renderSession.getCameraState();
        return new SpatialCameraState({
            position: new WorldPosition(cs.position.x, cs.position.y, cs.position.z),
            target: new WorldPosition(cs.target.x, cs.target.y, cs.target.z),
            mode: 'orbit'
        });
    }

    _applyToRenderer(spatialState) {
        const current = this._renderSession.getCameraState();
        this._renderSession.setCameraState(new CameraState({
            position: new Position(spatialState.position.x, spatialState.position.y, spatialState.position.z),
            target: new Position(spatialState.target.x, spatialState.target.y, spatialState.target.z),
            zoom: current.zoom
        }));
    }
}
