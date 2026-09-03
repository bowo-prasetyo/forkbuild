import { nearbyVehicleInstances, VEHICLE_RENDER_RADIUS } from './NearbyVehicleInstances.js';
import { withinRadiusXZ } from '../core/AvatarVehicleProximity.js';

// 0.9.116 — Mounted Vehicle Movement. The runtime vehicle-instance
// ownership boundary this milestone's own brief asked for.
//
// 0.9.115 built application/NearbyVehicleInstances.js as a PURE,
// stateless bridge — every call rebuilds a fresh VehicleInstance for
// every currently-placed VehiclePresence, with `position` always equal
// to `spawnPosition` (see that file's own header). That was exactly
// right for a WORLD OF STATIONARY VEHICLES: a requery every frame is
// indistinguishable from a cache when nothing ever moves. It stops being
// right the moment ANYTHING can call `VehicleInstance#withPosition()`
// and expect the result to still be there next frame — a fresh call to
// `nearbyVehicleInstances()` would recompute the exact same deterministic
// spawn position all over again, silently discarding whatever runtime
// position this milestone's own movement simulation just produced. See
// docs/Roadmap.md, 0.9.116, "One subtle issue to resolve."
//
// THIS FILE IS THE ONE PLACE "WHERE IS THIS VEHICLE RIGHT NOW" IS
// ANSWERED, ONCE MOVEMENT EXISTS. core/VehiclePlacement.js (via
// application/NearbyVehicleInstances.js) keeps answering a narrower,
// still-true question — "which vehicles exist initially, and where do
// they start" — and this file is that answer's ONLY consumer for
// discovering a vehicle for the first time. Once a vehicle has been
// discovered, this store becomes the sole authority on its current
// `position`; the deterministic query is never consulted again for that
// vehicle's own whereabouts.
//
//   VehiclePlacement (deterministic, unchanged)
//           |
//           | nearbyVehicleInstances() — "which vehicles exist, where
//           |   did each one START" — this file's ONLY discovery path
//           v
//   VehicleRuntimeInstances.sync()
//           |
//           +-- already tracked -> kept EXACTLY as this store already
//           |                      holds it; the freshly re-derived
//           |                      spawn-equal candidate is discarded
//           +-- not yet tracked  -> added, position === spawnPosition,
//           |                      same as 0.9.115's own bridge always
//           |                      produced
//           v
//   the current, authoritative VehicleInstance set — read by the
//   renderer (application/WorldNavigationSession.js's own
//   _setupVehicleRendering()) and written by vehicle movement
//   (application/AvatarVehicleMovementController.js)
//
// REMOVAL IS KEYED TO THE STORE'S OWN RUNTIME POSITION, NEVER TO WHETHER
// THE DETERMINISTIC QUERY STILL RETURNS THE VEHICLE. This is the actual
// bug 0.9.116 exists to close, not merely a cache-invalidation nicety:
// `vehiclePresenceInRegion()` only ever returns a vehicle whose FIXED,
// deterministic spawn point falls inside the queried region — once a
// mounted bicycle has been ridden more than `radius` away from where it
// SPAWNED, the deterministic query stops mentioning it at all, spawn
// point included, regardless of where the bicycle actually is now. A
// naive "drop anything the deterministic query didn't just return" sync
// would delete the very vehicle a player is currently riding out from
// under them the moment they pedaled far enough — silently erasing
// 0.9.115's own visible bicycle and destroying this milestone's own
// runtime position along with it. `sync()` instead measures each
// ALREADY-TRACKED entry's own CURRENT `position` (never its
// spawnPosition, never whether the deterministic query still mentions
// it) against `centerPosition`, using `radius` — the identical guard a
// merely-stationary, never-ridden vehicle still degrades to plain
// distance-based visibility, no behavior change for the case 0.9.115
// alone ever exercised.
//
// withinRadiusXZ() IS core/AvatarVehicleProximity.js's OWN PRIMITIVE,
// REUSED, NEVER REIMPLEMENTED. That file's own header already names
// exactly this: "a future proximity check against some other object
// kind ... should be able to reuse this primitive without this file
// growing a second, near-identical distance check." A visibility radius
// and an interaction radius are different POLICY numbers
// (VEHICLE_RENDER_RADIUS vs. VEHICLE_INTERACTION_RADIUS) answering the
// same geometric question, so only the primitive is shared, never either
// constant.
//
// A NEWLY-DISCOVERED VEHICLE, NOT A NEWLY-INVENTED ONE. `sync()`'s own
// "not yet tracked" branch always takes the CANDIDATE
// `nearbyVehicleInstances()` itself produced, verbatim — this file never
// constructs a VehicleInstance of its own, never calls
// `vehicleInstanceFromPresence()` itself, and has no opinion on
// placement, identity, or spawn position. It only ever decides WHICH of
// two already-real VehicleInstance objects — a freshly re-derived
// candidate, or this store's own previously-committed one — a caller
// should see for a given id.
//
// setPosition(id, nextPosition) IS THE ONLY WAY A TRACKED VEHICLE'S
// `position` EVER CHANGES HERE, AND IT REUSES
// `VehicleInstance#withPosition()` — THE EXACT MECHANISM 0.9.114 BUILT
// AND DOCUMENTED AS THE ONE WAY `position` EVER CHANGES. This file never
// mutates a VehicleInstance, never assigns `.position` directly, and
// never invents a second position-replacement path — see
// core/VehicleInstance.js's own header. Returns `null` (never throws,
// never invents an entry) for an id this store has not itself
// discovered via `sync()` — mirroring
// application/AvatarVehicleInteractionController.js's own
// `_findMountedVehicle()`, "no destination is known from here" honesty,
// rather than a crash or a silently-fabricated vehicle.
//
// SESSION-LOCAL, IN-MEMORY, NEVER PERSISTED OR NETWORKED. Exactly as
// ephemeral as `core/VehiclePresence.js`'s own position always was
// before this milestone — every replica keeps its own independent copy
// of "where is this vehicle right now," and nothing here broadcasts,
// signs, or stores a runtime position anywhere. Reconciling two
// replicas' own divergent runtime positions for the SAME vehicle is
// explicitly out of scope, exactly like every other "no networking, no
// persistence" boundary this vehicle line has drawn since 0.9.72's own
// header.
export class VehicleRuntimeInstances {
    constructor() {
        this._instances = new Map(); // vehicle id -> current runtime VehicleInstance
    }

    // Reconciles this store against `nearbyVehicleInstances(seed,
    // centerPosition, radius)` — see this file's own header for exactly
    // what "reconcile" means — and returns the resulting full set of
    // currently-visible VehicleInstance objects (in no particular
    // order). Called once per render frame, from the SAME place
    // 0.9.115's own `_setupVehicleRendering()` used to call
    // `nearbyVehicleInstances()` directly.
    sync(seed, centerPosition, radius = VEHICLE_RENDER_RADIUS) {
        const candidates = nearbyVehicleInstances(seed, centerPosition, radius);
        for (const candidate of candidates) {
            if (!this._instances.has(candidate.id)) {
                this._instances.set(candidate.id, candidate);
            }
            // Already tracked: the freshly re-derived, spawn-equal
            // candidate is discarded — this store's own current
            // position, whatever movement has already made of it, wins.
        }
        for (const [id, instance] of this._instances) {
            if (!withinRadiusXZ(instance.position, centerPosition, radius)) {
                this._instances.delete(id);
            }
        }
        return Array.from(this._instances.values());
    }

    // The current runtime VehicleInstance for `id`, or `null` when this
    // store has never discovered (via sync()) or has since dropped
    // (walked out of range) a vehicle with that id.
    get(id) {
        return this._instances.get(id) || null;
    }

    // 0.9.118 — Vehicle Runtime Authority Audit. Every ALREADY-TRACKED
    // VehicleInstance within `radius` of `centerPosition`, measured
    // against each entry's own CURRENT `position` — never a spawn-
    // anchored one. Added for exactly one caller:
    // application/AvatarVehicleInteractionController.js's own
    // `_nearbyVehicles()`, which needs "which vehicles this store already
    // knows about are near here right now" to fix the audit's own
    // central finding — mount TARGET resolution could only ever find a
    // vehicle by its deterministic spawn point, so a vehicle ridden away
    // from its spawn and left there could never be mounted again from
    // where it now actually sits. See that controller's own 0.9.118
    // header for the full story.
    //
    // A READ, NEVER A sync(). This deliberately never calls
    // `nearbyVehicleInstances()` and never touches `this._instances` —
    // no discovery, no eviction, no mutation of any kind. That distinction
    // matters: sync()'s own removal step drops any tracked entry outside
    // ITS OWN `radius` of ITS OWN `centerPosition` — calling sync() a
    // second time, from a second call site, with a DIFFERENT (smaller)
    // interaction radius centered on the avatar, would evict a vehicle
    // still within the render loop's own larger render radius, out from
    // under application/WorldNavigationSession.js's own
    // `_setupVehicleRendering()`. nearby() carries none of that hazard —
    // it only ever narrows what this store already, independently knows,
    // exactly like get() does for a single id.
    nearby(centerPosition, radius) {
        return Array.from(this._instances.values())
            .filter((instance) => withinRadiusXZ(instance.position, centerPosition, radius));
    }

    // The one way a tracked vehicle's own `position` ever changes here.
    // See this file's own header, "setPosition() is the only way...".
    setPosition(id, nextPosition) {
        const current = this._instances.get(id);
        if (!current) {
            return null;
        }
        const next = current.withPosition(nextPosition);
        this._instances.set(id, next);
        return next;
    }

    clear() {
        this._instances.clear();
    }
}

// Deliberately not yet: persistence, networking, or cross-replica
// reconciliation of any kind (see this file's own header,
// "session-local"); a capacity or eviction policy beyond plain
// distance-from-center (a vehicle a player is NOT currently riding still
// simply falls out of the store once far enough away, exactly as
// 0.9.115 already rendered it); vehicle removal for any reason other
// than distance (no despawning, no lifetime, no ownership); resolving
// WHICH vehicle an avatar is mounted on (that stays
// application/AvatarVehicleInteractionController.js's own job, entirely
// untouched by this file); and any movement math of its own — see
// application/AvatarVehicleMovementController.js for where
// setPosition()'s own `nextPosition` argument actually comes from. See
// docs/Roadmap.md, 0.9.116.
