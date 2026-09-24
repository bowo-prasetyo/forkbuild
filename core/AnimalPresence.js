import { Position } from './Position.js';
import { ANIMAL_SPECIES } from './WildlifeField.js';
import { isFiniteCoordinate } from './FiniteCoordinates.js';

// 0.9.700 — Animal Presence Descriptor.
//
// The direct structural twin of core/VehiclePresence.js: "there is a
// particular animal at a particular place," an id/species/position
// triple, without saying anything about how it got there or whether an
// avatar can catch it. `species` reuses core/WildlifeField.js's own
// ANIMAL_SPECIES vocabulary directly — never a duplicate AnimalType
// file — the identical "one vocabulary, not two" discipline
// core/AvatarInventory.js's own header now documents for entry `type`.
//
// Immutable and getter-only, Object.freeze()-enforced, same as
// VehiclePresence — a new position/species would mean constructing a
// new AnimalPresence, never mutating one a caller already holds (moot
// today, since every AnimalPresence this codebase produces is built
// once, from a single wildlifeInRegion() record, and never replaced in
// place — see core/AnimalPlacement.js).
//
// Deliberately excluded, matching core/VehiclePresence.js's own
// identical list: catching, carrying, or releasing an animal; rendering;
// input; collision; terrain interaction; deterministic placement itself
// (core/AnimalPlacement.js's own job); deriving or validating an id's
// FORMAT (core/AnimalIdentity.js's own job).

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
    throw new Error('AnimalPresence requires a position with finite numeric x, y, and z');
}

export function isValidAnimalSpecies(value) {
    return Object.values(ANIMAL_SPECIES).includes(value);
}

export class AnimalPresence {
    constructor({ id, species, position } = {}) {
        if (typeof id !== 'string' || id.length === 0) {
            throw new Error(`AnimalPresence requires a non-empty string id, got ${JSON.stringify(id)}`);
        }
        if (!isValidAnimalSpecies(species)) {
            throw new Error(`AnimalPresence requires a valid ANIMAL_SPECIES, got ${JSON.stringify(species)}`);
        }
        this._id = id;
        this._species = species;
        this._position = toPosition(position);
        Object.freeze(this);
    }

    get id() { return this._id; }
    get species() { return this._species; }
    get position() { return this._position; }

    toJSON() {
        return {
            id: this._id,
            species: this._species,
            position: this._position.toJSON()
        };
    }

    static fromJSON(json) {
        return new AnimalPresence({
            id: json.id,
            species: json.species,
            position: Position.fromJSON(json.position)
        });
    }
}
