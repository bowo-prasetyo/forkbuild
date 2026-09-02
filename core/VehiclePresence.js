import { Position } from './Position.js';
import { VehicleType, isValidVehicleType } from './VehicleType.js';

// 0.9.71 — Vehicle Presence Descriptor.
// Extended by 0.9.74 — Deterministic Vehicle Identity.
//
// 0.9.70 named what a vehicle IS (core/VehicleType.js). This milestone
// answers the next-smallest question — "there is a particular vehicle at
// a particular place" — without yet saying anything about how it got
// there, who it belongs to, or whether an avatar can do anything with it.
// core/NaturalFeatureField.js answers the equivalent question for trees
// (deterministically, by sampling — never stored) and
// core/StructurePlacement.js answers it for placed structures (owned,
// mutable, positioned document state); VehiclePresence deliberately
// borrows neither's answer to "how does this come to exist" — that is
// still undecided (procedural? explicitly placed? player-created?
// discovered over the network?) — and answers only what both of those
// already agree on regardless of origin: an ID, a TYPE, and a POSITION.
//
// `id` was deliberately absent at 0.9.71: inventing one then would have
// meant guessing at a lifecycle (can two VehiclePresence instances
// describe the same vehicle? does an id survive a position change?) that
// no seam had asked for yet. 0.9.73's proximity check gave an avatar a
// way to know a vehicle is close enough to interact with; the next
// question — mounting — cannot be answered without first being able to
// say WHICH vehicle, and neither `type` nor `position` answers that
// reliably (two vehicles can share a type, and this file has never
// guaranteed a position stays fixed). 0.9.74 answers that one question —
// see core/VehicleIdentity.js for how the id itself is derived — and this
// file's own job stays exactly what it was: CARRY the id a caller hands
// it, never derive one. `id` is validated only as a non-empty string;
// this file has no opinion on, and never inspects, its format —
// core/VehicleIdentity.js's own deterministic `vehicle:<seed>:<cellX>,
// <cellZ>` shape is that module's business alone, not a contract
// VehiclePresence enforces or depends on. `vehicleId`/`ownerId`/
// `createdAt` remain unadded: none is added until an actual caller needs
// to know who placed a vehicle, or when.
//
// VehicleType.NONE is rejected, not merely another valid member.
// core/VehicleType.js's own header explains NONE exists for a FUTURE
// avatar-vehicle relationship field ("what vehicle does this avatar
// currently have" — none yet). That is a STATE a value can hold. A
// VehiclePresence is not a state field; it is asserted only when a
// vehicle actually exists in the world. "No vehicle here" is represented
// by there being no VehiclePresence at all — the same way
// core/NaturalFeatureField.js represents "no tree in this cell" by
// returning nothing for that cell, never a TREE_TYPE.NONE placeholder
// object.
//
// Immutable and getter-only, like core/AvatarPresence.js and unlike
// core/StructurePlacement.js's settable position/rotation — a
// StructurePlacement is edited in place because it is document state
// backing an editable placement UI; a VehiclePresence has no such editor
// yet, and "move this vehicle" is future work this milestone explicitly
// does not build (see docs/Roadmap.md, 0.9.71). Until then, a new
// position means constructing a new VehiclePresence, never mutating one
// a caller may already be holding.
//
// Unlike its siblings, immutability is enforced with Object.freeze(this)
// at the end of the constructor rather than left as a "there happens to
// be no setter" convention — every field access below goes through
// `this._type`/`this._position`, and without a freeze a caller could
// still reach in and reassign those directly. This milestone is opening
// the contract, not leaning on an established one, so it enforces the
// property it promises rather than merely suggesting it: in this
// module's strict-mode (ESM) context, assigning to a frozen instance's
// property throws instead of silently no-oping.
//
// Validation is deliberately stricter than core/WorldPlacement.js or
// core/StructurePlacement.js, both of which silently coerce a malformed
// position field (`position.x || 0`) because they already have a real
// caller relying on that leniency for a document field known to be
// roughly well-formed. VehiclePresence has no such caller yet — this
// milestone is establishing the contract itself, not patching an
// existing one — so a malformed position is rejected outright rather
// than silently laundered into (0, 0, 0), which would hide a bug at the
// one seam whose entire job is "where is this vehicle."
//
// Deliberately excluded, matching this milestone's own brief: an
// avatar-vehicle relationship, mounting/dismounting, riding, a rider or
// occupant field; vehicle movement, speed, acceleration, heading, or any
// physics; battery/fuel, health, or inventory; persistence to a
// StorageProvider; networking, advertisement, or discovery; rendering;
// input; collision; terrain interaction; deterministic/procedural
// placement (naming how vehicles come to exist in the world at all is
// explicitly future work — see docs/Roadmap.md, 0.9.71); deriving,
// parsing, or validating the FORMAT of an id — that is
// core/VehicleIdentity.js's own job (see docs/Roadmap.md, 0.9.74). This
// file answers only "what vehicle is present, and where — and by what
// name," nothing else.
function isFiniteCoordinate(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

function toPosition(position) {
    if (position instanceof Position) {
        return position;
    }
    if (
        position !== null
        && typeof position === 'object'
        && !Array.isArray(position)
        && isFiniteCoordinate(position.x)
        && isFiniteCoordinate(position.y)
        && isFiniteCoordinate(position.z)
    ) {
        return new Position(position.x, position.y, position.z);
    }
    throw new Error('VehiclePresence requires a position with finite numeric x, y, and z');
}

export class VehiclePresence {
    constructor({ id, type, position } = {}) {
        if (typeof id !== 'string' || id.length === 0) {
            throw new Error(`VehiclePresence requires a non-empty string id, got ${JSON.stringify(id)}`);
        }
        if (!isValidVehicleType(type)) {
            throw new Error(`VehiclePresence requires a valid VehicleType, got ${JSON.stringify(type)}`);
        }
        if (type === VehicleType.NONE) {
            throw new Error('VehiclePresence cannot represent VehicleType.NONE — "no vehicle" is the absence of a VehiclePresence, not a presence of type NONE');
        }
        this._id = id;
        this._type = type;
        this._position = toPosition(position);
        Object.freeze(this);
    }

    get id() { return this._id; }
    get type() { return this._type; }
    get position() { return this._position; }

    toJSON() {
        return {
            id: this._id,
            type: this._type,
            position: this._position.toJSON()
        };
    }

    static fromJSON(json) {
        return new VehiclePresence({
            id: json.id,
            type: json.type,
            position: Position.fromJSON(json.position)
        });
    }
}
