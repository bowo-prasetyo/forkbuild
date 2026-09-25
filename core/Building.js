import { Brick } from './Brick.js';
import { createId } from './createId.js';
import { encodeBrickTable, decodeBrickTable } from './BrickTable.js';

// Building owns its bricks. Its addBrick()/removeBrick() are plain
// mutations with no event publishing — World.addBrickToBuilding() /
// removeBrickFromBuilding() are the versions that also publish
// BrickAdded/BrickRemoved. Call these directly only when you deliberately
// don't want the rest of the engine notified (e.g. while constructing a
// building before it's added to a World).
export class Building {
    constructor({ id = createId(), creator = null, library = 'core' } = {}) {
        this._id = id;
        this._creator = creator;
        this._library = library;
        this._bricks = new Map();
    }

    get id() {
        return this._id;
    }

    get creator() {
        return this._creator;
    }

    get library() {
        return this._library;
    }

    addBrick(brick) {
        this._bricks.set(brick.id, brick);
    }

    removeBrick(id) {
        this._bricks.delete(id);
    }

    findBrick(id) {
        return this._bricks.get(id) || null;
    }

    getBricks() {
        return Array.from(this._bricks.values());
    }

    // compactBricks: write the bricks as one table (core/BrickTable.js),
    // the form stored and published documents use (schema 2), rather
    // than one object per brick.
    toJSON({ compactBricks = false } = {}) {
        const json = {
            id: this._id,
            creator: this._creator,
            library: this._library
        };
        if (compactBricks) {
            json.brickTable = encodeBrickTable(this.getBricks());
        } else {
            json.bricks = this.getBricks().map((brick) => brick.toJSON());
        }
        return json;
    }

    // Reads either form of the bricks: a `brickTable` or a `bricks` array.
    static fromJSON(json) {
        const building = new Building({
            id: json.id,
            creator: json.creator,
            library: json.library
        });

        const bricks = json.brickTable ? decodeBrickTable(json.brickTable) : json.bricks;
        for (const brickJson of bricks) {
            building.addBrick(Brick.fromJSON(brickJson));
        }

        return building;
    }
}
