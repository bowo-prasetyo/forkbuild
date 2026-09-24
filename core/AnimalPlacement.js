import { wildlifeInRegion, WILDLIFE_FEATURE_TYPE } from './WildlifeField.js';
import { AnimalPresence } from './AnimalPresence.js';
import { Position } from './Position.js';

// 0.9.700 — Animal Placement Adapter.
//
// core/VehiclePlacement.js is a SIBLING of core/NaturalFeatureField.js —
// it reimplements its own independent hash lattice rather than depending
// on the tree field, because a vehicle's placement RULES (density,
// ground gate, type roll) are genuinely different from a tree's. An
// animal's placement rules are not a new set core/WildlifeField.js
// hasn't already written: that file's own header already establishes
// the complete deterministic lattice (zone, density, river gate,
// species-by-zone). This file is therefore a THIN ADAPTER, not a
// sibling reimplementation — its only job is turning
// wildlifeInRegion()'s own plain records into the AnimalPresence
// objects a catch mechanic needs, the same wrapping role
// core/VehiclePresence.js's own `presenceForCell()` plays inside
// core/VehiclePlacement.js, just split into its own file here since
// core/WildlifeField.js already owns the placement math itself.
//
// animalPresenceInRegion(seed, minX, minZ, maxX, maxZ) is a PURE
// function of exactly its own arguments — inherits wildlifeInRegion()'s
// own determinism, ordering, and half-open-interval bounds contract
// completely unchanged; this file adds no filtering or sorting of its
// own.
export function animalPresenceInRegion(seed, minX, minZ, maxX, maxZ) {
    return wildlifeInRegion(seed, minX, minZ, maxX, maxZ)
        .filter((animal) => animal.type === WILDLIFE_FEATURE_TYPE.ANIMAL)
        .map((animal) => new AnimalPresence({
            id: animal.id,
            species: animal.species,
            position: new Position(animal.x, animal.y, animal.z)
        }));
}

// Deliberately not yet: any placement rule of its own (see this file's
// own header — every rule lives in core/WildlifeField.js); catching,
// carrying, or releasing an animal; rendering; input; collision;
// persistence; a runtime/current position distinct from the
// deterministic one (application/world/AnimalRuntimeInstances.js's own job,
// mirroring application/world/VehicleRuntimeInstances.js).
