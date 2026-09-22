import { Position } from './Position.js';
import { createId } from './createId.js';

// A Brick is a placement: which definition, where, and how rotated. It
// never carries geometry — that lives behind BrickRegistry, looked up by
// definitionId. This keeps World serializable as plain data and keeps the
// renderer free to change how a "core:cube" looks without touching World.
export class Brick {
    // color: optional 0xRRGGBB override — null means "use this brick's
    // BrickDefinition color" (see renderer/BrickRenderer.js). Choose Your
    // Brick Color: set at placement time (PlaceBrickCommand) or later via
    // the undoable SetBrickColorCommand; never required, so an existing
    // World with no colors set renders exactly as it always has.
    constructor({ id = createId(), definitionId, position = new Position(), rotation = 0, color = null }) {
        this._id = id;
        this._definitionId = definitionId;
        this._position = position;
        this._rotation = rotation;
        this._color = color;
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

    get color() {
        return this._color;
    }

    set color(color) {
        this._color = color;
    }

    clone() {
        return new Brick({
            id: this._id,
            definitionId: this._definitionId,
            position: this._position.clone(),
            rotation: this._rotation,
            color: this._color
        });
    }

    toJSON() {
        return {
            id: this._id,
            definitionId: this._definitionId,
            position: this._position.toJSON(),
            rotation: this._rotation,
            color: this._color
        };
    }

    static fromJSON(json) {
        return new Brick({
            id: json.id,
            definitionId: json.definitionId,
            position: Position.fromJSON(json.position),
            rotation: json.rotation,
            color: json.color !== undefined ? json.color : null
        });
    }
}
