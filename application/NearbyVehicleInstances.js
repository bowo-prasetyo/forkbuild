import { vehiclePresenceInRegion } from '../core/VehiclePlacement.js';
import { vehicleInstanceFromPresence } from '../core/VehicleInstance.js';

// 0.9.115 — Vehicle Rendering.
//
// The ONE bridge between "which vehicles currently exist near a point"
// and the rendering path: a pure function of (seed, centerPosition,
// radius) that reuses core/VehiclePlacement.js's own deterministic
// `vehiclePresenceInRegion()` query — the exact SAME query
// application/AvatarVehicleInteractionController.js#_nearbyVehicles()
// already runs for mount/dismount, just over a larger radius suited to
// "can the player SEE this," not "can the player interact with this" —
// and maps every result through core/VehicleInstance.js's own
// `vehicleInstanceFromPresence()` bridge, exactly as that file's own
// header names as the one intended way to turn a VehiclePresence into
// runtime state. This file invents no second placement algorithm and no
// second observation model — see docs/Roadmap.md, 0.9.115, "Don't create
// a second observation model just for this milestone."
//
// A REQUERY, NEVER A REGISTRY — the same discipline
// AvatarVehicleInteractionController.js's own header already established
// for its own, smaller-radius lookup: vehicles are a pure function of
// (seed, x, z), so there is nothing to cache and nothing to keep in sync.
// Every VehicleInstance this function returns is freshly built; nothing
// it returns is ever the same object across two calls, even for the
// identical conceptual vehicle (see core/VehicleIdentity.js's own header)
// — a caller that needs to recognize "the same vehicle as last time"
// compares `id`, never object identity.
//
// EVERY RETURNED INSTANCE HAS `position === spawnPosition` (by reference
// equality of VALUE, not necessarily the same Position object) —
// vehicleInstanceFromPresence() always initializes runtime position equal
// to spawn position, and nothing in this file ever calls withPosition().
// This function is not itself proof of the "renders position, not
// spawnPosition" invariant this milestone establishes — see
// tests/VehicleRendering.test.js, which constructs VehicleInstance
// objects with deliberately different spawnPosition/position values
// directly, bypassing this function entirely, for that proof.
//
// VEHICLE_RENDER_RADIUS is deliberately larger than
// core/AvatarVehicleProximity.js#VEHICLE_INTERACTION_RADIUS (1.5) — a
// vehicle the player could not possibly interact with from here yet
// should still be visible well before they walk into range, which is the
// entire UX problem this milestone exists to solve (see docs/Roadmap.md,
// 0.9.115's own opening paragraph). 50 is one TERRAIN_TILE_SIZE (40,
// core/TerrainTiling.js) plus a margin — enough to reliably cover the
// current lattice cell and its immediate neighbors even after jitter,
// without querying so wide an area that a single rare bicycle's own
// region scan starts touching many tiles' worth of lattice cells.
export const VEHICLE_RENDER_RADIUS = 50;

// `centerPosition` is a plain `{x, z}`-bearing point (a VehicleInstance's
// own `position`, an AvatarPresence's own `position`, or a camera
// position — this function has no opinion on which; that choice belongs
// to its caller, see application/WorldNavigationSession.js's own
// `_setupVehicleRendering()`).
export function nearbyVehicleInstances(seed, centerPosition, radius = VEHICLE_RENDER_RADIUS) {
    const presences = vehiclePresenceInRegion(
        seed,
        centerPosition.x - radius,
        centerPosition.z - radius,
        centerPosition.x + radius,
        centerPosition.z + radius
    );
    return presences.map(vehicleInstanceFromPresence);
}
