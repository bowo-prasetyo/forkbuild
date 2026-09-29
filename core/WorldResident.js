import { Position } from './Position.js';

// World Residents — ambient people who live in a World.
//
// Authored World content, the humanoid counterpart of
// core/AnimalDecoration.js: a World's author stands somewhere in World
// View and adds a resident there, and from then on the resident is part
// of the World itself, so it is saved, published and forked with it.
// Everyone who opens the World sees the same resident strolling around
// the same home at the same moment, because where it is comes from
// core/ResidentMotion.js — a pure function of its id, its home, the clock
// and the World's own geometry — never from anything sent over a network.
//
// `position` is the resident's HOME, relative to this World's own origin,
// like a landmark's or a decoration's. A resident lives on the ground:
// `y` is stored as the flat domain ground level (0) and never used to lift
// it, since the terrain under wherever it has walked to is sampled at
// render time, exactly as an avatar's is.
//
// NOT A PERSON. A resident has no identity, no profile, no presence and
// no voice: it never becomes an AvatarPresence, never reaches the wire,
// is never listed among People and can't be picked as an avatar. Nor is
// it a guide: it gives no directions, quests or missions (see
// docs/principles/navigation.md, "Exploration Guides Attention, Never
// Ownership or Mutation"). It walks around its home, and it notices you.
export class WorldResident {
    constructor({ id, worldId, authorIdentityId, position } = {}) {
        if (!id) {
            throw new Error('WorldResident requires an id');
        }
        if (!worldId) {
            throw new Error('WorldResident requires a worldId');
        }
        if (!authorIdentityId) {
            throw new Error('WorldResident requires an authorIdentityId');
        }
        if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) {
            throw new Error('WorldResident requires a position with finite x and z');
        }

        this._id = id;
        this._worldId = worldId;
        this._authorIdentityId = authorIdentityId;
        this._position = new Position(position.x, 0, position.z);
    }

    get id() { return this._id; }
    get worldId() { return this._worldId; }
    get authorIdentityId() { return this._authorIdentityId; }
    // The resident's home, World-local.
    get position() { return this._position; }

    toJSON() {
        return {
            id: this._id,
            worldId: this._worldId,
            authorIdentityId: this._authorIdentityId,
            position: this._position.toJSON()
        };
    }

    static fromJSON(json) {
        return new WorldResident({
            id: json.id,
            worldId: json.worldId,
            authorIdentityId: json.authorIdentityId,
            position: Position.fromJSON(json.position)
        });
    }
}
