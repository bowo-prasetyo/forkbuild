export class WorldPosition {
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
        return other instanceof WorldPosition
            && this._x === other.x
            && this._y === other.y
            && this._z === other.z;
    }

    clone() {
        return new WorldPosition(this._x, this._y, this._z);
    }

    toJSON() {
        return { x: this._x, y: this._y, z: this._z };
    }

    static fromJSON(json) {
        return new WorldPosition(json.x, json.y, json.z);
    }
}
