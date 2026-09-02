import { isValidAvatarVehicleMount } from './AvatarVehicleMount.js';
import { AvatarVehicleDismountIntent, isValidAvatarVehicleDismountIntent } from './AvatarVehicleDismountIntent.js';
import { Position } from './Position.js';

// 0.9.82 — Avatar-Vehicle Dismount Transition.
//
// 0.9.79 answered "did the avatar just ask to leave" without knowing
// whether anything was mounted. 0.9.80 answered "where would the
// avatar land" without knowing whether a dismount was even requested.
// 0.9.81 answered "is that landing spot safe" without knowing about
// intent, mount state, or vehicles at all. Three independently correct
// facts, still not a decision. This milestone is that decision:
//
//   Given the current mount state and a validated dismount result,
//   what should the avatar's new mount/position state be?
//
//   deriveAvatarVehicleDismountTransition({
//       currentMount, currentPosition, dismountIntent,
//       dismountPosition, destinationClearance
//   }) -> { mount, position }
//
// deriveAvatarVehicleDismountTransition() is a PURE function of exactly
// its own five arguments — no Math.random, no Date.now, no persisted
// state, no memory of a previous call. The same five inputs always
// produce the same result.
//
// THE ONE RULE THIS MILESTONE ADDS:
//
//   currentMount != null
//   AND dismountIntent == DISMOUNT
//   AND dismountPosition is a valid Position
//   AND destinationClearance.clear == true
//       -> mount: null, position: dismountPosition
//
// Every other combination leaves both fields exactly as they were:
//
//   not currently mounted          -> unchanged (nothing to dismount)
//   NONE intent                    -> unchanged (nothing was requested)
//   no/invalid dismountPosition    -> unchanged (0.9.80 had no answer)
//   destinationClearance not clear -> unchanged (0.9.81 said no)
//   destinationClearance missing   -> unchanged (never assume clear)
//
// `currentPosition` is an addition beyond the milestone brief's own
// suggested four-argument signature, and deliberately so. 0.9.78's
// `deriveAvatarVehicleMount()` never needed a `currentPosition`
// argument because mounting never changes position — only `mount`
// itself was ever in flight, so `currentMount` was the only "current"
// fact worth taking. Dismounting is different: on failure this
// function must say something about BOTH fields, and "unchanged"
// only means something if there is a current value to return
// unchanged. Taking `currentPosition` in means a real call site gets
// back a complete `{ mount, position }` pair either way — mirroring
// `AvatarPresence#next()`'s own "hand back everything, changed or
// not" shape — rather than a partial result that leaves the caller to
// re-derive "did anything change" itself from whether `mount` came
// back `null`.
//
// DO NOT RECALCULATE CLEARANCE. This is the one rule this milestone
// insists on above all others. `destinationClearance` is trusted
// exactly as given — an already-computed `{ clear: boolean }` verdict,
// ordinarily `isAvatarVehicleDismountPositionClear()`'s own output.
// This file never imports core/AvatarVehicleDismountClearance.js,
// never imports core/AvatarTreeCollision.js, never looks at a tree, a
// seed, or any geometry of any kind. Recomputing clearance here would
// duplicate 0.9.81's own layer inside what is supposed to be a small
// state transition reading its OUTPUT — the identical discipline
// 0.9.78's own header already established for proximity/targeting.
//
// DO NOT RECALCULATE THE DESTINATION, EITHER. `dismountPosition` is
// trusted exactly as given — ordinarily
// `resolveAvatarVehicleDismountPosition()`'s own output. This file
// never imports core/AvatarVehicleDismountPosition.js, never imports
// VehiclePresence or VehicleType, and has no opinion on how a
// candidate position was produced, or on the vehicle it came from.
// In particular, this function never asks "is this actually the
// bicycle I'm mounted on?" — `currentMount.vehicleId` is never
// compared against anything, because nothing here has a second
// vehicle-identifying value to compare it TO. That question belongs
// upstream, to whatever call site chose which vehicle's dismount
// position and clearance to hand this function in the first place.
//
// A VALID DESTINATION IS A REQUIRED INGREDIENT, NOT AN ERROR TO
// THROW ON WHEN ABSENT. Exactly like 0.9.78 treats "MOUNT intent, no
// target" as a normal, silent no-op rather than a malformed call,
// `dismountPosition: null` (0.9.80's own honest "no destination known
// for this vehicle type") and a missing/absent `destinationClearance`
// (a caller that has not computed one yet) are both ordinary "no
// transition happens" inputs, never thrown errors. What IS thrown is
// a value that is neither a valid absence nor a valid presence — a
// `dismountPosition` that is some other malformed shape, or a
// `destinationClearance` that is present but not `{ clear: boolean }`
// — the same "reject wrong shapes, don't silently coerce them"
// discipline `isValidAvatarVehicleMount()` already enforces for
// `currentMount`.
//
// A `{ mount, position }` PAIR, NEVER A NEW STATUS VOCABULARY. The
// milestone's own recommendation is followed literally: no
// `Dismounted` status, no `FAILED_DISMOUNT` state. `mount: null`
// already means "not mounted" (0.9.77's own "absence is null, never a
// sentinel"), so that is all a caller ever needs to see the dismount
// took effect. A blocked destination is not a distinct failure value —
// it is simply the transition not occurring, spelled out as
// `{ mount: currentMount, position: currentPosition }`, the exact
// unchanged pair.
//
// RETURNS THE SAME REFERENCES WHEN NOTHING CHANGES, THE SAME
// DISCIPLINE 0.9.78 ALREADY ESTABLISHED. The unchanged branch returns
// exactly the `currentMount` and `currentPosition` values it was
// given — never newly constructed, merely equal-looking stand-ins.
// The changed branch returns exactly the `dismountPosition` reference
// it was given — never a clone — so identity checks on either path
// are meaningful, and neither `currentMount` nor `dismountPosition`
// is ever mutated by this function.
//
// ONE-SHOT SAFETY FALLS OUT OF THE RULE FOR FREE, NO SPECIAL CASE
// NEEDED. Calling this function twice in a row with the second call's
// `currentMount`/`currentPosition` set to the first call's own result
// cannot produce a second dismount: the rule's own first condition,
// `currentMount != null`, is already false once a dismount has
// happened, so the second call falls straight into "unchanged"
// regardless of what `dismountIntent` still says. This mirrors
// 0.9.78's own "already mounted is a no-op" protection, just for the
// opposite direction.

function isValidDismountPosition(value) {
    if (value === null) {
        return true;
    }
    return value instanceof Position
        && typeof value.x === 'number' && Number.isFinite(value.x)
        && typeof value.y === 'number' && Number.isFinite(value.y)
        && typeof value.z === 'number' && Number.isFinite(value.z);
}

function isValidDestinationClearance(value) {
    if (value === null || value === undefined) {
        return true;
    }
    return typeof value === 'object' && typeof value.clear === 'boolean';
}

function isDestinationClear(value) {
    return value !== null && value !== undefined && value.clear === true;
}

// The one entry point. See this file's own header for the exact,
// ordered rule this function implements.
export function deriveAvatarVehicleDismountTransition({
    currentMount = null,
    currentPosition = null,
    dismountIntent,
    dismountPosition = null,
    destinationClearance = null
} = {}) {
    if (!isValidAvatarVehicleMount(currentMount)) {
        throw new Error(`deriveAvatarVehicleDismountTransition requires currentMount to be null or a valid AvatarVehicleMount, got ${JSON.stringify(currentMount)}`);
    }
    if (currentPosition !== null && !(currentPosition instanceof Position)) {
        throw new Error('deriveAvatarVehicleDismountTransition requires currentPosition to be null or a Position instance');
    }
    if (!isValidAvatarVehicleDismountIntent(dismountIntent)) {
        throw new Error(`deriveAvatarVehicleDismountTransition requires a valid dismountIntent, got ${JSON.stringify(dismountIntent)}`);
    }
    if (!isValidDismountPosition(dismountPosition)) {
        throw new Error('deriveAvatarVehicleDismountTransition requires dismountPosition to be null or a Position instance with finite x/y/z');
    }
    if (!isValidDestinationClearance(destinationClearance)) {
        throw new Error('deriveAvatarVehicleDismountTransition requires destinationClearance to be null/undefined or a { clear: boolean } object');
    }

    const unchanged = { mount: currentMount, position: currentPosition };

    if (currentMount === null) {
        return unchanged;
    }
    if (dismountIntent !== AvatarVehicleDismountIntent.DISMOUNT) {
        return unchanged;
    }
    if (dismountPosition === null) {
        return unchanged;
    }
    if (!isDestinationClear(destinationClearance)) {
        return unchanged;
    }

    return { mount: null, position: dismountPosition };
}

// Deliberately not yet: recalculating clearance or the dismount
// destination itself (see this file's own header, "Do not
// recalculate..."); comparing `currentMount.vehicleId` against
// anything (see "Do not recalculate the destination, either");
// vehicle switching or any vehicle awareness at all (VehiclePresence,
// VehicleType, vehicle placement, vehicle identity generation,
// proximity, target resolution); a new `Dismounted`/`FAILED_DISMOUNT`
// status vocabulary (see "A { mount, position } pair, never a new
// status vocabulary"); avatar movement or `AvatarMovementController`
// changes of any kind; tree geometry or any other collision/physics;
// terrain; keyboard/controller input; rendering; animation; camera;
// persistence; networking; randomness; the clock. See docs/Roadmap.md,
// 0.9.82, for the full list.
