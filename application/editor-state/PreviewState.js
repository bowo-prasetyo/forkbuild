import { Position } from '../../core/Position.js';

// Pure data: is a placement ghost currently visible, and if so which
// brick definition, where, and at what rotation. Editor State, not Domain
// State — never becomes a real Brick until PlaceBrickCommand (0.1.14)
// commits it to World.
export class PreviewState {
    constructor({ visible = false, definitionId = null, position = new Position(), rotation = 0 } = {}) {
        this._visible = visible;
        this._definitionId = definitionId;
        this._position = position;
        this._rotation = rotation;
    }

    get visible() {
        return this._visible;
    }

    get definitionId() {
        return this._definitionId;
    }

    get position() {
        return this._position;
    }

    get rotation() {
        return this._rotation;
    }

    static hidden() {
        return new PreviewState();
    }
}
