import { Position } from '../../core/Position.js';

// Pure data: is a placement ghost currently visible, and if so which
// brick definition, where, and at what rotation. Editor State, not Domain
// State — never becomes a real Brick until PlaceBrickCommand (0.1.14)
// commits it to World.
//
// 0.2.87 — `valid` is new: whenever `visible` is true, PlacementTool has
// already resolved a real ground/stack position (it calls hide() rather
// than show() when it hasn't), so `valid` here means specifically
// "PlacementValidator.canPlace() at this position" — collision-clear,
// not merely target-resolved. The renderer (renderer/PreviewRenderer.js)
// reads it to tint the ghost, never to decide whether to draw it at all.
export class PreviewState {
    constructor({ visible = false, definitionId = null, position = new Position(), rotation = 0, valid = true } = {}) {
        this._visible = visible;
        this._definitionId = definitionId;
        this._position = position;
        this._rotation = rotation;
        this._valid = valid;
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

    get valid() {
        return this._valid;
    }

    static hidden() {
        return new PreviewState();
    }
}
