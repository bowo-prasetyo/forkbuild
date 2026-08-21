import { Position } from './Position.js';
import { WorldLocationKind, isValidWorldLocationKind } from './WorldLocationKind.js';

// 0.2.94 — World View Location & Navigation.
//
// A read-only, navigable point in the world — "somewhere a camera can
// be sent," never "something that can be edited." A WorldLocation is
// deliberately NOT a new persisted entity: every instance is DERIVED,
// on demand, from identity that already exists elsewhere (a
// StructurePlacement's own id/position, or the world's fixed origin) —
// see application/WorldLocationDirectory.js, the one place instances of
// this class are ever constructed. There is no WorldLocation.save(),
// no WorldLocation store, and no WorldLocation id that outlives the
// thing it was derived from — deleting the StructurePlacement a
// STRUCTURE location was built from simply means the next
// WorldLocationDirectory#list() no longer produces it, exactly like a
// stale search result, never a dangling reference to clean up.
//
// See docs/Principles.md, "A World Location Is Read From Existing
// Identity, Never A New Store (0.2.94)."
export class WorldLocation {
    constructor({ id, title, kind, position = new Position() } = {}) {
        if (!id) {
            throw new Error('WorldLocation requires an id');
        }
        if (!isValidWorldLocationKind(kind)) {
            throw new Error(`WorldLocation: invalid kind "${kind}"`);
        }
        this._id = id;
        this._title = title || 'Untitled Location';
        this._kind = kind;
        this._position = position instanceof Position
            ? position
            : new Position(position.x || 0, position.y || 0, position.z || 0);
    }

    get id() { return this._id; }
    get title() { return this._title; }
    get kind() { return this._kind; }
    get position() { return this._position; }

    get isOrigin() { return this._kind === WorldLocationKind.ORIGIN; }
    get isStructure() { return this._kind === WorldLocationKind.STRUCTURE; }

    toJSON() {
        return {
            id: this._id,
            title: this._title,
            kind: this._kind,
            position: this._position.toJSON()
        };
    }
}
