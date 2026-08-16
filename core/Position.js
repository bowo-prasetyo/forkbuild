export class Position {
    constructor(x = 0, y = 0, z = 0) {
        this._x = x;
        this._y = y;
        this._z = z;
    }

    get x() {
        return this._x;
    }

    get y() {
        return this._y;
    }

    get z() {
        return this._z;
    }

    equals(other) {
        return other instanceof Position
            && this._x === other.x
            && this._y === other.y
            && this._z === other.z;
    }

    clone() {
        return new Position(this._x, this._y, this._z);
    }

    // 0.2.24: componentwise addition — the primitive behind "document-
    // local position + WorldPlacement position = effective world
    // position" (see core/WorldPlacement.js#effectiveWorldPosition).
    // Accepts any {x,y,z}-shaped value, not just a Position instance,
    // so it composes with WorldPosition/plain JSON without a
    // conversion step at every call site.
    add(other) {
        return new Position(this._x + other.x, this._y + other.y, this._z + other.z);
    }

    toJSON() {
        return { x: this._x, y: this._y, z: this._z };
    }

    static fromJSON(json) {
        return new Position(json.x, json.y, json.z);
    }
}
