import { createId } from './createId.js';

// A Group is a named, persistent relationship between bricks — document
// state, not session state (0.1.43). It owns no geometry and no
// transforms: bricks remain in their Buildings exactly as before; the
// group simply references them by id. Group identity is independent from
// brick identity (its own UUID), and membership is an unordered set —
// duplicates are ignored.
//
// Flat only in 0.1.43: a group references bricks, never other groups.
//
// Membership is referential: if a brick is deleted, its id may remain
// referenced until explicitly removed. Every group consumer resolves
// membership against the live world (World.getGroupBricks) and skips ids
// that no longer exist — this keeps DeleteBrickCommand group-agnostic
// and deterministic.
//
// Mutation discipline mirrors Building/Brick: setName/addMember/
// removeMember are plain mutations; World mediates event publishing
// (addGroup/removeGroup/renameGroup/addMemberToGroup/...).
export class Group {
    constructor({ id = createId(), name = null, brickIds = [] } = {}) {
        this._id = id;
        this._name = name;
        this._brickIds = [];
        for (const brickId of brickIds) {
            this.addMember(brickId);
        }
    }

    get id() {
        return this._id;
    }

    get name() {
        return this._name;
    }

    get brickIds() {
        return [...this._brickIds];
    }

    get memberCount() {
        return this._brickIds.length;
    }

    setName(name) {
        this._name = name;
    }

    // Returns true if the brick was actually added (not already a member).
    addMember(brickId) {
        if (this._brickIds.includes(brickId)) {
            return false;
        }
        this._brickIds.push(brickId);
        return true;
    }

    // Returns true if the brick was actually a member.
    removeMember(brickId) {
        const index = this._brickIds.indexOf(brickId);
        if (index === -1) {
            return false;
        }
        this._brickIds.splice(index, 1);
        return true;
    }

    hasMember(brickId) {
        return this._brickIds.includes(brickId);
    }

    toJSON() {
        return {
            id: this._id,
            name: this._name,
            brickIds: [...this._brickIds]
        };
    }

    static fromJSON(json) {
        return new Group({
            id: json.id,
            name: json.name || null,
            brickIds: json.brickIds || []
        });
    }
}
