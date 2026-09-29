import { vehiclePresenceInRegion } from '../../core/VehiclePlacement.js';
import { wildlifeInRegionAt } from '../../core/WildlifeMotion.js';
import { directionLabelBetween } from '../../core/GeographicPlaceNavigation.js';
import { RESIDENT_FACT_KIND } from '../../core/ResidentTalk.js';

// How far around itself a resident knows about each kind of thing. Nearby
// things are what you could walk to; builds are what you might have heard
// of.
export const RESIDENT_KNOWLEDGE_RADIUS = Object.freeze({
    VEHICLE: 150,
    ANIMAL: 100,
    LANDMARK: 1000,
    STRUCTURE: 300,
    PERSON: 500,
    BUILD: 5000
});

// What a World Resident standing at `position` ({ x, z }, shared space) knows
// about its surroundings: an array of facts for core/ResidentTalk.js, each
// { kind, key, distance, direction, position, ... } with distance and
// compass direction seen from the resident, and the thing's own position
// ({ x, z }, shared space) so the viewer can be offered a look at it.
//
// Every source is this replica's own view of the world, handed in by the
// caller (application/worldNavigation/residentMethods.js), so what a
// resident says is the viewer's knowledge, spoken from where it stands
// (see docs/principles/vehicles.md, "A Resident Tells You What's Around,
// Never What To Do"):
//
//   seed, timeSeconds        — deterministic vehicles and wildlife, and where
//                              wild animals are right now
//   vehicleRuntime           — VehicleRuntimeInstances: vehicles stored by
//                              this session are left out, moved ones are
//                              where they are now, deployed ones included
//   mountedVehicleId         — the vehicle the viewer is riding, left out
//   riddenVehicleIds         — vehicles other players ride now, left out:
//                              they are drawn under the rider, not here
//   animalRuntime            — AnimalRuntimeInstances: caught animals are
//                              left out, released ones included
//   landmarks                — [{ id, title, position }] in shared space
//   structures               — [{ id, title, author, position }]: structures
//                              placed in loaded Worlds, named by the document
//                              they place (unnamed ones are left out by the
//                              caller)
//   people                   — [{ identityId, displayName, position }]
//   builds                   — [{ documentId, title, author, position }]
//                              (World View's own location search)
//   excludedDocumentIds      — the resident's own World (and what it was
//                              forked from): not "another build"
//   placeName                — the name of the place it stands in, or null
export function gatherResidentFacts({
    position,
    seed,
    timeSeconds = null,
    vehicleRuntime = null,
    mountedVehicleId = null,
    riddenVehicleIds = [],
    animalRuntime = null,
    landmarks = [],
    structures = [],
    people = [],
    builds = [],
    excludedDocumentIds = [],
    placeName = null
} = {}) {
    const facts = [];
    const at = (target) => ({
        distance: Math.hypot(target.x - position.x, target.z - position.z),
        direction: directionLabelBetween(position, target),
        position: { x: target.x, z: target.z }
    });
    const within = (target, radius) => Math.hypot(target.x - position.x, target.z - position.z) <= radius;

    // Vehicles: the deterministic spawns around, with this session's own
    // runtime state layered on top — stored ones gone, moved or deployed ones
    // where they are now.
    const vehicles = new Map();
    const r = RESIDENT_KNOWLEDGE_RADIUS.VEHICLE;
    for (const presence of vehiclePresenceInRegion(seed, position.x - r, position.z - r, position.x + r, position.z + r)) {
        if (vehicleRuntime && vehicleRuntime.isExcluded(presence.id)) continue;
        vehicles.set(presence.id, { type: presence.type, position: presence.position });
    }
    if (vehicleRuntime) {
        for (const instance of vehicleRuntime.instances) {
            vehicles.set(instance.id, { type: instance.type, position: instance.position });
        }
    }
    for (const [id, vehicle] of vehicles) {
        if (id === mountedVehicleId || riddenVehicleIds.includes(id) || !within(vehicle.position, r)) continue;
        facts.push({ kind: RESIDENT_FACT_KIND.VEHICLE, key: id, vehicleType: vehicle.type, ...at(vehicle.position) });
    }

    // Animals: wild ones where they are right now, minus any caught; plus
    // released ones.
    const a = RESIDENT_KNOWLEDGE_RADIUS.ANIMAL;
    for (const animal of wildlifeInRegionAt(seed, position.x - a, position.z - a, position.x + a, position.z + a, timeSeconds)) {
        if (animalRuntime && animalRuntime.isExcluded(animal.id)) continue;
        if (!within(animal, a)) continue;
        facts.push({ kind: RESIDENT_FACT_KIND.ANIMAL, key: animal.id, species: animal.species, ...at(animal) });
    }
    if (animalRuntime) {
        for (const animal of animalRuntime.releasedNearby(position, a)) {
            facts.push({ kind: RESIDENT_FACT_KIND.ANIMAL, key: animal.id, species: animal.species, ...at(animal.position) });
        }
    }

    for (const landmark of landmarks) {
        if (!landmark.position || !within(landmark.position, RESIDENT_KNOWLEDGE_RADIUS.LANDMARK)) continue;
        facts.push({ kind: RESIDENT_FACT_KIND.LANDMARK, key: landmark.id, title: landmark.title, ...at(landmark.position) });
    }

    for (const structure of structures) {
        if (!structure.position || !within(structure.position, RESIDENT_KNOWLEDGE_RADIUS.STRUCTURE)) continue;
        facts.push({ kind: RESIDENT_FACT_KIND.STRUCTURE, key: structure.id, title: structure.title, author: structure.author, ...at(structure.position) });
    }

    for (const person of people) {
        if (!person.position || !within(person.position, RESIDENT_KNOWLEDGE_RADIUS.PERSON)) continue;
        facts.push({ kind: RESIDENT_FACT_KIND.PERSON, key: person.identityId, displayName: person.displayName, ...at(person.position) });
    }

    const excluded = new Set(excludedDocumentIds.filter(Boolean));
    const seenBuilds = new Set();
    for (const build of builds) {
        if (!build.position || excluded.has(build.documentId) || seenBuilds.has(build.documentId)) continue;
        if (!within(build.position, RESIDENT_KNOWLEDGE_RADIUS.BUILD)) continue;
        seenBuilds.add(build.documentId);
        facts.push({ kind: RESIDENT_FACT_KIND.BUILD, key: build.documentId, title: build.title, author: build.author, ...at(build.position) });
    }

    if (placeName) {
        facts.push({ kind: RESIDENT_FACT_KIND.PLACE, key: 'place', name: placeName, distance: 0, direction: null });
    }
    return facts;
}
