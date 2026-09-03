import { Position } from './Position.js';
import { VehiclePresence } from './VehiclePresence.js';
import { VehicleInstance } from './VehicleInstance.js';
import { VehicleType } from './VehicleType.js';

// 0.9.80 — Vehicle Dismount Position Resolution.
// Extended by 0.9.117 — Vehicle-Aware Dismount.
//
// 0.9.79 (core/AvatarVehicleDismountIntent.js) answered "did the avatar
// just ask to leave," and deliberately stopped there — by its own
// header, "this milestone does not decide where the avatar ends up... a
// future dismount transition, mirroring 0.9.78's own
// deriveAvatarVehicleMount(), decides whether a dismount request is
// meaningful given the avatar's actual mount state." That future
// transition cannot simply clear the mount and leave `position`
// untouched — an unmounted avatar still standing wherever the vehicle's
// own position happens to be is not a real answer. This milestone closes
// that one missing seam, and only that one:
//
//   Given a vehicle the avatar is mounted on, where can the avatar
//   safely stand after dismounting?
//
//   resolveAvatarVehicleDismountPosition(vehicle) -> Position | null
//
// resolveAvatarVehicleDismountPosition() is a PURE function of exactly
// its own argument — no Math.random, no Date.now, no persisted state,
// no memory of a previous call. The same VehiclePresence always produces
// the same result.
//
// BEFORE THE TRANSITION, NOT AFTER. Clearing `AvatarVehicleMount`
// (0.9.77) first and figuring out a position second would let
// `unmounted avatar + invalid/occupied position` exist as an
// intermediate, observable state, even for a single tick. This file
// exists so a future dismount transition can compute the destination
// FIRST, and only ever perform the mount-clearing + position-change
// together once a destination is actually in hand.
//
// TAKES THE ACTUAL VehiclePresence, NEVER A VEHICLE ID. Exactly the
// discipline this codebase already insists on everywhere a vehicle is
// consumed rather than merely named (core/AvatarVehicleMount.js's own
// `vehicleId`-only descriptor; core/AvatarVehicleMountTransition.js's own
// "target id, never a vehicle object"): an `AvatarVehicleMount` carries
// only `vehicleId`, and `vehicleIdFor()`/`vehiclePresenceInRegion()`
// reconstruct a FRESH `VehiclePresence` object on every query
// (core/VehicleIdentity.js's own header — "the same conceptual bicycle
// is a different object on every query"). Resolving a position from a
// bare id would mean this file quietly growing a vehicle
// lookup/registry of its own, just to turn that id back into a position
// — machinery nothing has asked for and this milestone explicitly
// declines to invent. Instead, the caller (an application/integration
// layer, already responsible for holding "the currently available
// VehiclePresence for this mount's vehicleId") hands this file the
// VehiclePresence it already has. This file never imports
// core/VehiclePlacement.js, core/VehicleIdentity.js, or
// core/AvatarVehicleMount.js for exactly this reason.
//
// DELIBERATELY NOT MOUNT-STATE-AWARE, THE SAME REFUSAL 0.9.79 ALREADY
// MADE FOR INTENT. This function has no `currentMount` parameter and
// never reads an `AvatarVehicleMount` value. Whether the avatar is
// ACTUALLY mounted on the given vehicle right now is a question for
// whatever future transition calls this file, exactly as
// core/AvatarVehicleDismountIntent.js's own header insists a dismount
// REQUEST needs no opinion on mount state — this file only ever answers
// "if an avatar dismounted THIS vehicle, where would it stand," nothing
// about whether that avatar is really on it.
//
// KEPT BICYCLE-SPECIFIC, ON PURPOSE. core/VehiclePlacement.js has only
// ever produced `VehicleType.BICYCLE`, and core/VehiclePresence.js
// deliberately carries no dimensions, heading, wheelbase, or seat
// position (see that file's own header) — there is no generic vehicle
// geometry to resolve a destination FROM yet. Rather than invent one
// (guessing at a MOTORCYCLE/CAR/DRONE dismount rule with no real vehicle
// of any of those types ever placeable), this file answers the question
// for the one vehicle type this codebase can actually produce, and
// returns `null` — "no dismount destination is known for this vehicle" —
// for anything else. That `null` is not an error: it is this file's
// honest answer for a vehicle type it has no rule for yet, exactly the
// same shape `VehiclePresence` itself already uses ("no vehicle here" is
// the absence of a value, never a placeholder). A future MOTORCYCLE/CAR/
// DRONE dismount rule is this file's (or a sibling's) job to ADD, not to
// guess at now.
//
// A FIXED WORLD-SPACE OFFSET, BECAUSE BICYCLES HAVE NO HEADING YET. A
// dismount position is inherently relative to the vehicle, which
// eventually means a heading — but core/VehicleType.js/
// core/VehiclePresence.js/core/VehiclePlacement.js have never given a
// bicycle an orientation, and manufacturing one solely so this file can
// have a "dismount side" would be inventing vehicle-orientation
// machinery nobody asked for, just to answer a smaller question. So the
// dismount side is a fixed, arbitrary, always-the-same-direction offset
// in world space (+X) — not relative to the avatar's own facing, not
// relative to any vehicle heading. `BICYCLE_DISMOUNT_OFFSET_X` (below)
// is the one constant this rule is built around: large enough that the
// avatar's own collision circle (AVATAR_COLLISION_RADIUS === 0.35,
// core/AvatarCollision.js) cannot land back centered on the vehicle's
// own point even if a future collision check is added, and comfortably
// inside VEHICLE_INTERACTION_RADIUS (1.5, core/AvatarVehicleProximity.js)
// so a just-dismounted avatar stays within interaction range of the
// vehicle it just left — able to immediately remount if that turns out
// to be the desired behavior, a policy question this file leaves to
// whatever future remounting milestone actually decides it. When
// vehicles eventually acquire a real orientation, THAT is the seam that
// should replace this fixed offset with a heading-relative one — this
// file's own job stays "here is a candidate position," not "here is how
// a vehicle points."
//
// Y IS NEVER COPIED FROM THE VEHICLE. `VehiclePresence.position.y`
// (core/VehiclePlacement.js) is a raw `terrainHeightAt()` sample — real
// world elevation baked directly into a vehicle's own domain position.
// An avatar's position has never meant that: `core/AvatarPresence.js`'s
// own position defaults to `y = 0`, and docs/Principles.md's own
// "Terrain Elevation Is A Rendering-Time Offset, Never A Presence Or
// Placement Fact" (0.2.76) is explicit that ground level for an avatar
// is `y = 0` plus whatever the domain layer itself adds — terrain
// elevation is added later, only at render time, and never written back
// into a domain position. core/AvatarVehicleProximity.js's own header
// already flags exactly this gap ("a bicycle's Y coordinate is terrain
// elevation, not a meaningful interaction boundary") to justify ignoring
// Y for interaction range; this file is the first one where blindly
// reusing the vehicle's Y would have been an actual, visible bug — a
// dismounted avatar teleported to whatever raw elevation sample the
// vehicle's own placement formula happened to produce, rather than the
// flat domain ground level every other avatar position already assumes.
// So the resolved Y is always `0`, the same avatar-domain convention
// `AvatarPresence`'s own default already uses, never `vehicle.position.y`.
//
// NO OCCUPANCY OR TERRAIN VALIDATION YET. A resolved candidate could, in
// principle, land in water or overlap something else — but this
// codebase's only existing collision detector, core/AvatarTreeCollision.js,
// answers exactly one narrow question ("does the avatar's circle overlap
// THIS tree's circle"), not the generic "is this position free" query a
// real destination-validity check would need. Building that generic
// query now, merely to give this milestone something to call, would
// invent collision infrastructure this codebase does not otherwise need
// yet — see docs/Roadmap.md, 0.9.80, "Deliberately postponed." So this
// milestone establishes ONLY deterministic candidate-position
// calculation; occupancy/terrain validity is a later seam, once a real
// consumer needs it, at which point THIS function may start returning
// `null` for a candidate it once would have returned a real Position
// for — a change entirely internal to this file, never a signature
// change, since `Position | null` is already this file's contract.
//
// NO DISMOUNT TRANSITION HERE. This file never imports
// core/AvatarVehicleMount.js or core/AvatarVehicleMountTransition.js,
// never clears a mount, and never decides WHETHER a dismount should
// happen — only WHERE one would land if it did. A future 0.9.81 reads
// this file's own output alongside 0.9.79's intent and 0.9.77's mount
// state to perform the actual `mounted -> unmounted` transition.
//
// 0.9.117 UPDATE — ALSO ACCEPTS A VehicleInstance, THE ONE CHANGE THIS
// MILESTONE MAKES HERE. Through 0.9.116, every caller of this function
// (in practice, only `application/AvatarVehicleInteractionController.js`)
// could only ever hand it a freshly-requeried `VehiclePresence` — whose
// `position` is, by that type's own contract, always the vehicle's FIXED
// deterministic spawn point (see core/VehiclePresence.js's own header).
// That was honest through 0.9.113, but became a live bug the moment
// core/VehicleInstance.js (0.9.114) gave a vehicle a `position` that can
// actually differ from `spawnPosition`, and application/AvatarVehicleMovementController.js
// (0.9.116) started actually moving it: a mounted, ridden vehicle's own
// dismount destination kept resolving from where it STARTED, never from
// where it now IS. This function's own core promise — "the same shape of
// input in, the same deterministic offset applied" — does not care WHICH
// object shape carries `type` and `position`, so the fix is the smallest
// one that could possibly work: `vehicle instanceof VehiclePresence ||
// vehicle instanceof VehicleInstance` is now accepted, and the SAME
// offset math below reads `vehicle.type`/`vehicle.position` off of
// whichever one it was actually handed. A `VehiclePresence` still means
// exactly what it always has (a deterministic descriptor, whose
// `position` is its own spawn point); a `VehicleInstance` means "the
// avatar's actual mounted vehicle, right now" (see
// core/VehicleInstance.js's own header) — this file has no opinion on
// which one is "more correct" to pass in, only that BOTH already expose
// the two fields this function has only ever needed. Crucially,
// `VehicleInstance.spawnPosition` is never read anywhere in this file,
// even now — only `.position`, exactly as before this update — so a
// caller handing in a `VehicleInstance` automatically gets the CURRENT
// runtime position resolved from, never the frozen spawn one, with zero
// new code path or special case here. See
// application/AvatarVehicleInteractionController.js's own 0.9.117
// header for the call-site half of this fix — the actual switch from
// "always hand this function a spawn-anchored VehiclePresence" to
// "prefer handing it the mounted vehicle's own current VehicleInstance."
// Still no vehicleId lookup, still no mount-state awareness, still no
// orientation/collision/occupancy validation added — this update is
// purely a widened, backward-compatible INPUT TYPE, not a new rule.

// See this file's own header, "A fixed world-space offset," for the
// full reasoning behind both the direction (+X, arbitrary but fixed
// forever) and the magnitude.
export const BICYCLE_DISMOUNT_OFFSET_X = 1;

function isFiniteCoordinate(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

function isFiniteXZPosition(position) {
    return position !== null
        && typeof position === 'object'
        && isFiniteCoordinate(position.x)
        && isFiniteCoordinate(position.z);
}

// The one entry point. See this file's own header for the exact
// reasoning behind every deliberate choice below.
export function resolveAvatarVehicleDismountPosition(vehicle) {
    if (!(vehicle instanceof VehiclePresence) && !(vehicle instanceof VehicleInstance)) {
        throw new Error('resolveAvatarVehicleDismountPosition requires a VehiclePresence or VehicleInstance instance');
    }
    if (!isFiniteXZPosition(vehicle.position)) {
        throw new Error('resolveAvatarVehicleDismountPosition requires a vehicle with a finite numeric x and z position');
    }

    // Bicycle-specific, on purpose — see this file's own header, "Kept
    // bicycle-specific." `null` here is a genuine, honest answer ("no
    // dismount destination is known for this vehicle type"), never an
    // error.
    if (vehicle.type !== VehicleType.BICYCLE) {
        return null;
    }

    return new Position(
        vehicle.position.x + BICYCLE_DISMOUNT_OFFSET_X,
        0,
        vehicle.position.z
    );
}

// Deliberately not yet: any vocabulary or dependency for the actual
// dismount TRANSITION (clearing AvatarVehicleMount, changing an
// avatar's stored position — a future 0.9.81's job); mount-state
// awareness of any kind (a `currentMount` parameter, importing
// core/AvatarVehicleMount.js/core/AvatarVehicleMountTransition.js); a
// vehicle id / vehicle registry lookup (this file takes the actual
// VehiclePresence or VehicleInstance it needs — see this file's own
// header, "Takes the actual VehiclePresence" and its own 0.9.117
// update); vehicle orientation or heading of any kind (see "A fixed
// world-space offset"); generic or per-type vehicle geometry
// (dimensions, wheelbase, seat position); occupancy or terrain validity
// checking, or any expansion of core/AvatarTreeCollision.js's existing
// avatar-vs-tree-only collision machinery (see "No occupancy or terrain
// validation yet"); nearest-vehicle selection; remounting;
// keyboard/controller input of any kind; avatar or vehicle movement;
// vehicle collision; animation; camera changes; rendering; networking;
// persistence; randomness; the clock. See docs/Roadmap.md, 0.9.80 and
// 0.9.117, for the full list.
