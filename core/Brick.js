import { Position } from './Position.js';

export class Brick {
    constructor({ id, type, position = new Position(), rotation = 0 }) {
        this._id = id;
        this._type = type;
        this._position = position;
        this._rotation = rotation;
    }

    get id() {
        return this._id;
    }

    get type() {
        return this._type;
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
            type: this._type,
            position: this._position.clone(),
            rotation: this._rotation
        });
    }

    toJSON() {
        return {
            id: this._id,
            type: this._type,
            position: this._position.toJSON(),
            rotation: this._rotation
        };
    }

    static fromJSON(json) {
        return new Brick({
            id: json.id,
            type: json.type,
            position: Position.fromJSON(json.position),
            rotation: json.rotation
        });
    }
}
