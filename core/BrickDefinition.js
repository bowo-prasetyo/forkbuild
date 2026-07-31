export class BrickDefinition {
    constructor({ id, name, category = 'uncategorized', thumbnail = null, defaultRotation = 0 }) {
        this._id = id;
        this._name = name;
        this._category = category;
        this._thumbnail = thumbnail;
        this._defaultRotation = defaultRotation;
    }

    get id() {
        return this._id;
    }

    get name() {
        return this._name;
    }

    get category() {
        return this._category;
    }

    get thumbnail() {
        return this._thumbnail;
    }

    get defaultRotation() {
        return this._defaultRotation;
    }
}
