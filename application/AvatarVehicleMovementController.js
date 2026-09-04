import { VehicleType } from '../core/VehicleType.js';
import { AvatarMovementState } from '../core/AvatarMovementState.js';
import { simulateAvatarMovement } from '../core/AvatarMovementSimulation.js';
import { terrainHeightAt } from '../core/TerrainHeightField.js';
import { resolveVehicleHeadingFromMovement } from '../core/VehicleMovementHeading.js';

// 0.9.116 — Mounted Vehicle Movement.
//
//   Movement Intent -> Mounted Vehicle -> vehicle movement simulation
//   -> VehicleInstance.withPosition() -> VehicleRenderer / avatar follows
//
// 0.9.119 — Vehicle–World Collision Constraint. 0.9.116 through 0.9.118
// gave a mounted, movable vehicle its own runtime position and made
// every consumer of it agree on that position — but `tick()` below fed
// `simulateAvatarMovement()`'s own pure kinematics result STRAIGHT into
// `VehicleRuntimeInstances#setPosition()`, with nothing standing between
// them. A bicycle could ride straight through a tree, a brick, or an
// entire building, because no world-collision constraint was ever
// consulted for vehicle movement at all — 0.9.88's own
// `collisionRadius` (core/AvatarVehicleMovementCapability.js) had a
// physically-correct footprint sitting ready and unused, since the ONLY
// pipeline that ever consumed it was the on-foot
// AvatarMovementController, never this class.
//
//   Movement Intent -> Mounted Vehicle -> vehicle movement simulation
//   -> candidate position -> world collision constraint (building/brick,
//   then tree) -> allowed position -> VehicleInstance.withPosition()
//   -> VehicleRenderer / avatar follows
//
// THE FIX REUSES THE EXISTING COLLISION INFRASTRUCTURE, NEVER A SECOND
// ONE. `tick()` below now optionally applies the SAME
// application/AvatarMovementConstraint.js (buildings/bricks) and
// application/AvatarTreeConstraint.js (trees) instances the on-foot
// avatar already uses — see application/WorldNavigationSession.js's own
// 0.9.119 wiring, which shares one pair of instances between both
// controllers, and this file's own constructor/tick() comments below for
// exactly how. No `VehicleCollision*` class, no rectangular/oriented
// footprint, no vehicle-specific spatial index — see
// core/AvatarCollision.js's own 0.9.119 header for the one change that
// made building/brick collision reusable here at all: its existing
// `resolveHorizontalMovement()` now accepts an optional `radius`,
// mirroring the identical `avatarRadius` seam
// core/AvatarTreeCollisionQuery.js already established for trees in
// 0.9.88.
//
// 0.9.85 through 0.9.95 built a complete movement CAPABILITY/simulation
// layer (speed, collision radius, permitted directions, acceleration,
// braking, steering) and wired it into
// application/AvatarMovementController.js — but every one of those
// milestones fed a mounted vehicle's own numbers into the AVATAR's own
// position. Riding a bicycle has, until now, meant "the avatar moves
// faster," never "the bicycle moves." This file is the seam that
// changes that: given a mounted vehicle's id, its resolved movement
// capability (core/AvatarVehicleMovementCapability.js, entirely
// unchanged), and the current movement intent
// (application/AvatarMovementController.js#movementState(), reused
// verbatim), it advances the VEHICLE's own runtime position by one
// simulation tick and commits the result to
// application/VehicleRuntimeInstances.js via
// `VehicleInstance#withPosition()` — the exact mechanism 0.9.114 built
// for exactly this.
//
// NO SECOND MOVEMENT SYSTEM. The actual kinematics — turning, then
// stepping along the new facing; a rate-limited approach to a target
// speed; braking as an independently-tunable rate; a rate-limited
// approach to a target heading — are core/AvatarMovementSimulation.js's
// own `simulateAvatarMovement()`, called here VERBATIM, the identical
// pure function application/AvatarMovementController.js already calls
// for on-foot movement. This file duplicates none of that math; it only
// supplies a DIFFERENT subject (a VehicleInstance's own position,
// instead of an AvatarPresence's own position) and a DIFFERENT
// destination for the result (VehicleRuntimeInstances#setPosition(),
// instead of AvatarPresenceSession#update()). See docs/Roadmap.md,
// 0.9.116, "Reuse the existing movement capabilities" — "the new
// milestone should connect the existing capability/simulation layer to
// the new runtime position," never reinvent it.
//
// THE VEHICLE MOVES; THE AVATAR FOLLOWS — NEVER THE REVERSE. This
// class's own `tick()` never reads or writes an AvatarPresence at all;
// it has no idea one exists. application/WorldNavigationSession.js is
// the one place that both calls this class's own `tick()` AND, with
// its result, updates the avatar's own position/rotation to match — see
// that file's own 0.9.116 header for exactly where. Ownership flows
// vehicle -> avatar, never avatar -> vehicle, matching this milestone's
// own brief precisely: "do not simply keep moving the avatar and then
// copy its position into the bicycle."
//
// ONLY A VEHICLE TYPE THIS CODEBASE CAN ACTUALLY SHOW MOVES — NEVER
// EVERY GROUND_VEHICLE THE GENERIC CAPABILITY LAYER "SUPPORTS".
// core/AvatarVehicleMovementCapability.js's own `supported` field
// answers "does a movement pipeline concept exist for this KIND"
// (WALK/GROUND_VEHICLE both `true`; only AERIAL_VEHICLE/DRONE is
// `false`) — MOTORCYCLE and CAR both resolve `supported: true` under
// that vocabulary, purely because they share BICYCLE's own
// GROUND_VEHICLE kind. But renderer/VehicleRenderer.js has no visual
// for either of them (only VehicleType.BICYCLE has a builder — see
// that file's own 0.9.115 header), and core/VehiclePlacement.js never
// places one in the first place (BICYCLE is the sole vehicle type this
// codebase can ever procedurally spawn — see that file's own 0.9.72
// header). `canMove()` below gates on THAT fact — the currently
// implemented visual vocabulary — never on the capability layer's own,
// broader `supported` flag. Mounting a hypothetical future MOTORCYCLE/
// CAR/DRONE must never silently start moving it merely because the
// generic runtime now knows how to hold a VehicleInstance; see
// docs/Roadmap.md, 0.9.116, "What should happen to the avatar?"/
// Section H.
const MOVABLE_VEHICLE_TYPES = new Set([VehicleType.BICYCLE]);

export function isMovableVehicleType(type) {
    return MOVABLE_VEHICLE_TYPES.has(type);
}

export class AvatarVehicleMovementController {
    // `vehicleRuntimeInstances` is the ONE VehicleRuntimeInstances store
    // this controller reads a vehicle's current position from and
    // commits its next one to — see that file's own header for why the
    // deterministic placement query itself is never consulted here at
    // all. This class never constructs its own store, exactly like
    // application/AvatarMovementController.js never constructs its own
    // AvatarPresenceSession.
    //
    // 0.9.119 — Vehicle–World Collision Constraint. `movementConstraint`/
    // `treeConstraint` (both optional, same "enforce/offer only when
    // wired" posture every constraint in application/AvatarMovementController.js
    // already follows) are the exact SAME constraint INSTANCES a real
    // caller already builds for the on-foot avatar
    // (application/AvatarMovementConstraint.js for bricks/buildings,
    // application/AvatarTreeConstraint.js for trees) — see
    // application/WorldNavigationSession.js's own 0.9.119 wiring, which
    // shares one pair of instances between both controllers. This class
    // never constructs either constraint itself, and never duplicates
    // the collision geometry/query they already wrap — see this file's
    // own tick(), below, for where they are applied.
    constructor(vehicleRuntimeInstances, movementConstraint = null, treeConstraint = null) {
        this._vehicleRuntimeInstances = vehicleRuntimeInstances;
        this._movementConstraint = movementConstraint;
        this._treeConstraint = treeConstraint;
        // 0.9.119 — transient, debug-only outcome of the MOST RECENT
        // tick()'s own constraint pipeline, the direct structural twin
        // of application/AvatarMovementController.js's own `_collided`/
        // `_collidedWithTree` fields. Never part of VehicleInstance,
        // never read by any other logic in this class.
        this._collided = false;
        this._collidedWithTree = false;
        // The vehicle id this controller most recently simulated a tick
        // for, or `null` — used only to detect "this is a genuinely NEW
        // ride" (a fresh mount, possibly of a different bicycle) so the
        // transient bookkeeping below can be reset. Never read for any
        // other purpose, and never itself the source of truth for
        // "which vehicle is mounted" — that stays
        // application/AvatarVehicleInteractionController.js's own
        // `mount()`.
        this._activeVehicleId = null;
        // The direct structural twins of
        // application/AvatarMovementController.js's own
        // `_verticalVelocity`/`_grounded`/`_currentMovementSpeed` —
        // this controller's own small bit of physics bookkeeping between
        // ticks, deliberately kept OUTSIDE VehicleInstance for the exact
        // reason that file's own header already gives for the avatar's
        // identical fields: a future replica receiving a VehicleInstance
        // has no reason to know or care about the rider's mid-ride
        // transient speed. Reset only on a genuinely new ride — see
        // `tick()` below.
        this._verticalVelocity = 0;
        this._grounded = true;
        this._currentMovementSpeed = 0;
    }

    // See this file's own header, "Only a vehicle type this codebase
    // can actually show moves."
    canMove(vehicleType) {
        return isMovableVehicleType(vehicleType);
    }

    // Runs one simulation tick for the vehicle `vehicleId` — which MUST
    // already be tracked by this controller's own VehicleRuntimeInstances
    // (added there by that store's own sync(), ordinarily well before
    // any avatar could ever mount it) — and returns
    // `{ vehicleInstance, rotationY }`: the vehicle's own new,
    // ALREADY-COMMITTED-TO-THE-STORE VehicleInstance, and its new
    // heading (degrees, the SAME representation
    // core/AvatarMovementSimulation.js's own `rotationY` already uses).
    // Returns `null` — no simulation, no store write — when `vehicleId`
    // is not currently tracked: the identical honest "no destination is
    // known from here" the mount/dismount controller itself already
    // settles for (see
    // application/AvatarVehicleInteractionController.js's own
    // `_findMountedVehicle()`), never a crash or a silently-fabricated
    // vehicle.
    //
    // `capability` is a real, resolved AvatarVehicleMovementCapability
    // (ordinarily core/AvatarVehicleMovementCapability.js's own
    // `resolveAvatarVehicleMovementCapability(vehicleType)`, called by
    // the caller — this class never resolves one itself, matching
    // application/AvatarMovementController.js's own "never imports
    // VehicleType to look up a capability" restraint, one layer
    // removed). `movementIntent` is a plain
    // `{direction, turnAxis, running, brakingRequested}` snapshot —
    // ordinarily application/AvatarMovementController.js's own
    // `movementState()` output, reused VERBATIM: this controller never
    // re-derives forward/turn/running/braking intent from a raw key
    // itself, and never reads `movementIntent.jumpRequested` even if a
    // caller's own snapshot happens to carry one — a mounted vehicle
    // cannot jump (see docs/Roadmap.md, 0.9.116's own exclusion list),
    // so this method always simulates with `jumpRequested: false`,
    // regardless of whether Space is currently held.
    tick({ seed, vehicleId, capability, movementIntent, currentRotationY, deltaSeconds }) {
        const vehicleInstance = this._vehicleRuntimeInstances.get(vehicleId);
        if (!vehicleInstance) {
            return null;
        }
        // Defense in depth, not merely a caller-side convention: even a
        // caller that forgot to check `canMove()` first can never move a
        // MOTORCYCLE/CAR/DRONE through this method — see this file's own
        // header, "Only a vehicle type this codebase can actually show
        // moves."
        if (!isMovableVehicleType(vehicleInstance.type)) {
            return null;
        }

        if (vehicleId !== this._activeVehicleId) {
            // A genuinely new ride (a fresh mount, or a different
            // vehicle than the one this controller was last ticking) —
            // this controller's own transient bookkeeping starts
            // completely fresh, the identical "capability change resets
            // transient speed" discipline
            // application/AvatarMovementController.js's own
            // `setMovementCapability()` already applies to
            // `_currentMovementSpeed` on an actual capability change.
            this._activeVehicleId = vehicleId;
            this._verticalVelocity = 0;
            this._grounded = true;
            this._currentMovementSpeed = 0;
        }

        const currentPosition = vehicleInstance.position;
        // A ground vehicle's own Y follows raw terrain height, exactly
        // as core/VehiclePlacement.js already computed it at spawn
        // (`presenceForCell()`'s own `terrainHeightAt(seed, x, z)`) —
        // never application/AvatarStepConstraint.js's own building-aware
        // support height, which answers a question ("what is the AVATAR
        // currently standing on, bricks included") this vehicle was
        // never subject to in the first place; see docs/Roadmap.md,
        // 0.9.116's own exclusion list, "vehicle collision redesign."
        // Sampled at the vehicle's CURRENT position, before this tick's
        // own step — the identical "read support height before
        // simulating" ordering
        // application/AvatarMovementController.js#tick() already uses
        // for the avatar (0.3.2's own precedent).
        const groundHeight = terrainHeightAt(seed, currentPosition.x, currentPosition.z);

        const movementState = new AvatarMovementState({
            forwardAxis: movementIntent.direction,
            turnAxis: movementIntent.turnAxis,
            running: movementIntent.running,
            jumpRequested: false,
            brakingRequested: movementIntent.brakingRequested
        });

        const result = simulateAvatarMovement({
            position: currentPosition,
            rotationY: currentRotationY,
            verticalVelocity: this._verticalVelocity,
            grounded: this._grounded,
            movementState,
            deltaSeconds,
            groundHeight,
            movementSpeed: capability.movementSpeed,
            acceleration: capability.acceleration.acceleration,
            braking: capability.braking.braking,
            currentMovementSpeed: this._currentMovementSpeed,
            steeringRate: capability.steering.steeringRate
        });

        this._verticalVelocity = result.verticalVelocity;
        this._grounded = result.grounded;
        this._currentMovementSpeed = result.currentMovementSpeed;

        // 0.9.119 — Vehicle–World Collision Constraint. The pure
        // kinematics result above is only ever a PROPOSED position —
        // exactly the same "simulation proposes, a constraint disposes"
        // split application/AvatarMovementController.js's own tick()
        // already applies for the on-foot avatar (see that class's own
        // 0.2.42/0.9.63 headers). Building/brick collision is applied
        // FIRST, tree collision LAST — the identical ordering that
        // pipeline already establishes — and BOTH are handed
        // `capability.collisionRadius`, never a hardcoded avatar-sized
        // radius, so a bicycle is tested against world geometry at its
        // own, larger footprint (see core/AvatarVehicleMovementCapability.js's
        // own 0.9.88 header). Y is untouched by either constraint — both
        // are purely horizontal (X/Z) — so `result.position.y` (already
        // the vehicle's own raw-terrain-height Y, per this class's own
        // 0.9.116 header) survives the pipeline unchanged.
        let finalPosition = result.position;
        this._collided = false;
        if (this._movementConstraint) {
            const constrained = this._movementConstraint.apply(currentPosition, finalPosition, {
                avatarRadius: capability.collisionRadius
            });
            finalPosition = constrained.position;
            this._collided = constrained.collided;
        }
        this._collidedWithTree = false;
        if (this._treeConstraint) {
            const treeResult = this._treeConstraint.apply(currentPosition, finalPosition, {
                avatarRadius: capability.collisionRadius
            });
            finalPosition = treeResult.position;
            this._collidedWithTree = treeResult.collided;
        }

        // The ONE line this whole class exists to reach: the vehicle's
        // own runtime position actually changes, through the exact
        // mechanism 0.9.114 built for it —
        // VehicleRuntimeInstances#setPosition(), itself a thin wrapper
        // over VehicleInstance#withPosition(). Never a direct field
        // assignment, never a second position-replacement path. Commits
        // `finalPosition` — the ALREADY-CONSTRAINED position — so the
        // avatar (which follows this store's own committed position,
        // never a pre-constraint one — see
        // application/WorldNavigationSession.js's own 0.9.116 "the
        // vehicle moves, the avatar follows" wiring) can never end up
        // standing inside an obstacle the vehicle itself was just
        // stopped short of.
        let nextVehicleInstance = this._vehicleRuntimeInstances.setPosition(vehicleId, finalPosition);

        // 0.9.123 — Vehicle Orientation. Only a GENUINE horizontal
        // position change (never a raw request/intent, and never the
        // pre-collision simulated one) ever produces a new heading — see
        // this file's own 0.9.123 header. `currentPosition` is this
        // tick's OWN starting position (captured above, before
        // simulation ran), so a fully-blocked tick (finalPosition ===
        // currentPosition in X/Z) is indistinguishable here from a tick
        // with no movement intent at all — both correctly leave heading
        // untouched.
        if (finalPosition.x !== currentPosition.x || finalPosition.z !== currentPosition.z) {
            const nextHeading = resolveVehicleHeadingFromMovement({
                dx: finalPosition.x - currentPosition.x,
                dz: finalPosition.z - currentPosition.z,
                previousHeading: vehicleInstance.heading
            });
            nextVehicleInstance = this._vehicleRuntimeInstances.setHeading(vehicleId, nextHeading) || nextVehicleInstance;
        }

        return { vehicleInstance: nextVehicleInstance, rotationY: result.rotationY };
    }

    // 0.9.119 — whether the MOST RECENT tick()'s desired movement was
    // altered by building/brick collision geometry. Same transient,
    // debug/UI-only posture as application/AvatarMovementController.js's
    // own isCollided() — recomputed fresh every tick, never persisted,
    // never part of VehicleInstance.
    isCollided() {
        return this._collided;
    }

    // 0.9.119 — the direct structural twin of isCollided() above, for
    // tree collision — mirroring application/AvatarMovementController.js's
    // own isCollidedWithTree().
    isCollidedWithTree() {
        return this._collidedWithTree;
    }

    // Clears this controller's own transient per-ride bookkeeping —
    // called whenever the avatar is NOT currently having its movement
    // intent resolved into vehicle movement (unmounted, or mounted on a
    // vehicle `canMove()` reports false for), so that a LATER ride —
    // even of the exact same bicycle, even a re-mount within the same
    // session — always starts from rest, never carrying over a stale
    // mid-ride speed or vertical velocity from a previous, unrelated
    // ride. The direct structural twin of
    // application/AvatarMovementController.js's own capability-change
    // reset, invoked here by the CALLER (application/WorldNavigationSession.js)
    // rather than inferred internally, because only the caller knows
    // whether this frame's movement intent was actually routed here at
    // all.
    reset() {
        this._activeVehicleId = null;
        this._verticalVelocity = 0;
        this._grounded = true;
        this._currentMovementSpeed = 0;
        this._collided = false;
        this._collidedWithTree = false;
    }
}

// 0.9.123 — Vehicle Orientation. `tick()` now also commits a new
// VehicleInstance.heading — see core/VehicleInstance.js's own 0.9.123
// header — WHENEVER the vehicle's own final, ALREADY-CONSTRAINED
// position genuinely differs (in X/Z) from where it started this tick.
// The heading itself comes from core/VehicleMovementHeading.js's own
// pure `resolveVehicleHeadingFromMovement()`, fed the REALIZED
// displacement (finalPosition minus currentPosition, after collision) —
// never from `result.rotationY`, which tracks requested STEERING, not
// realized movement (see that file's own header for exactly why those
// two can differ). A tick that produced no real horizontal movement —
// no movement intent, or a movement fully absorbed by
// `_movementConstraint`/`_treeConstraint` — never calls
// `setHeading()` at all, so a stationary or fully-blocked vehicle's own
// heading is simply left exactly as this store already holds it; see
// this class's own `tick()` below for where that check happens.
//
// Deliberately not yet, matching this milestone's own brief: a vehicle
// physics engine, vehicle-vs-vehicle collision (0.9.119 added only
// vehicle-vs-WORLD collision — trees, bricks, buildings — never
// vehicle-vs-vehicle), steering input, steering angle, turning radius, or
// vehicle angular velocity of any kind (heading SNAPS to the realized
// movement direction each tick — see core/VehicleMovementHeading.js's own
// header — it is never smoothed/rate-limited the way `rotationY` itself
// still is), wheel or rider animation, road/path following, gears,
// reverse, or turning-radius physics beyond
// core/AvatarMovementSteeringSimulation.js's own existing math (which
// still governs `result.rotationY`, the avatar's own facing while
// mounted — entirely unchanged by this milestone, see
// application/WorldNavigationSession.js's own 0.9.116 header), an
// oriented/rectangular collision footprint (the vehicle's own
// `collisionRadius` stays circular — see core/VehicleInstance.js's own
// 0.9.123 header, "keep the bicycle a circular collision body"),
// collision response beyond the existing "stop at the combined radius"
// resolution (no sliding response redesign, no bounce, no
// damage/sound/animation), multiplayer synchronization, persistence, or
// a redesign of mounting/dismounting/spawning of any kind. This file
// answers only "given a movement intent and a mounted, movable vehicle,
// what is its next, WORLD-COLLISION-CONSTRAINED runtime position AND
// facing" — never any of those. See docs/Roadmap.md, 0.9.116, 0.9.119,
// and 0.9.123.
