export class BrickDefinition {
    constructor({
        id,
        name,
        category = 'uncategorized',
        thumbnail = null,
        defaultRotation = 0,
        tags = [],
        description = '',
        width = 1,
        height = 1,
        depth = 1
    }) {
        this._id = id;
        this._name = name;
        this._category = category;
        this._thumbnail = thumbnail;
        this._defaultRotation = defaultRotation;
        this._tags = tags;
        this._description = description;
        this._width = width;
        this._height = height;
        this._depth = depth;
    }

    get id() { return this._id; }
    get name() { return this._name; }
    get category() { return this._category; }
    get thumbnail() { return this._thumbnail; }
    get defaultRotation() { return this._defaultRotation; }
    get tags() { return this._tags; }
    get description() { return this._description; }
    get width() { return this._width; }
    get height() { return this._height; }
    get depth() { return this._depth; }
}
