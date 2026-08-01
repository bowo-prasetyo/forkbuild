import { Position } from './Position.js';
import { createId } from './createId.js';

// A Brick is a placement: which definition, where, and how rotated. It
// never carries geometry — that lives behind BrickRegistry, looked up by
// definitionId. This keeps World serializable as plain data and keeps the
// renderer free to change how a "core:cube" looks without touching World.
export class Brick {
    constructor({ id = createId(), definitionId, position = new Position(), rotation = 0 }) {
        this._id = id;
        this._definitionId = definitionId;
        this._position = position;
        this._rotation = rotation;
    }

    get id() {
        return this._id;
    }

    get definitionId() {
        return this._definitionId;
    }

    get position() {
        return this._position;
    }

    set position(position) {
        this._position = position;
    }

    get rotation() {
        return this._rotation;
    }

    set rotation(rotation) {
        this._rotation = rotation;
    }

    clone() {
        return new Brick({
            id: this._id,
            definitionId: this._definitionId,
            position: this._position.clone(),
            rotation: this._rotation
        });
    }

    toJSON() {
        return {
            id: this._id,
            definitionId: this._definitionId,
            position: this._position.toJSON(),
            rotation: this._rotation
        };
    }

    static fromJSON(json) {
        return new Brick({
            id: json.id,
            definitionId: json.definitionId,
            position: Position.fromJSON(json.position),
            rotation: json.rotation
        });
    }
}
