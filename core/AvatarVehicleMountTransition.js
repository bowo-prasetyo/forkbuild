import {
    AvatarVehicleMount,
    createAvatarVehicleMount,
    isValidAvatarVehicleMount
} from './AvatarVehicleMount.js';
import {
    AvatarVehicleInteractionIntent,
    isValidAvatarVehicleInteractionIntent
} from './AvatarVehicleInteractionIntent.js';

// 0.9.78 — Avatar-Vehicle Mount Transition.
//
// Four independent facts existed before this milestone, none of them a
// TRANSITION: proximity (0.9.73), identity (0.9.74), intent (0.9.75), and
// target resolution (0.9.76) — culminating in 0.9.77's own
// AvatarVehicleMount, a small immutable descriptor for "avatar X is
// mounted on vehicle Y" that, by its own header, "establishes state, it
// does not perform mounting." Nothing before this milestone ever DECIDES
// whether that state should change. This is that decision:
//
//   deriveAvatarVehicleMount({
//       currentMount, interactionIntent, targetVehicleId
//   }) -> AvatarVehicleMount | null
//
// deriveAvatarVehicleMount() is a PURE function of exactly its own three
// arguments — no Math.random, no Date.now, no persisted state, no memory
// of a previous call. The same currentMount, the same interactionIntent,
// and the same targetVehicleId always produce the same result.
//
// THE ONE RULE THIS MILESTONE ADDS:
//
//   not currently mounted + MOUNT intent + a resolved target
//       -> AvatarVehicleMount(targetVehicleId)
//
// Every other combination leaves `currentMount` exactly as it was:
//
//   no MOUNT intent                    -> currentMount unchanged
//   MOUNT intent, no target             -> currentMount unchanged
//   already mounted, MOUNT intent       -> currentMount unchanged,
//                                           REGARDLESS of targetVehicleId
//
// THIS FUNCTION DOES NOT RE-CHECK PROXIMITY. Proximity was already
// established by 0.9.73 and already consumed by 0.9.76 to PRODUCE
// `targetVehicleId` in the first place. Recomputing it here — an avatar
// position, a vehicle list, a radius — would duplicate 0.9.76's own
// targeting layer inside what is supposed to be a small state transition
// reading its OUTPUT. If `targetVehicleId` is non-null, this function
// trusts that whatever produced it (ordinarily
// `resolveAvatarVehicleInteractionTarget()`) already did that work.
//
// ALREADY MOUNTED IS A NO-OP HERE, ON PURPOSE — both for the SAME target
// (idempotence: holding the interaction key down while already mounted on
// vehicle A, with A still resolving as the target, must not do anything
// strange) and for a DIFFERENT target (protection: standing next to
// vehicle B while already mounted on vehicle A must never silently swap
// the avatar onto B). Vehicle switching is a separate interaction policy
// this milestone deliberately declines to invent — see this file's own
// "Deliberately not yet" list below.
//
// MOUNTING ONLY, NO DISMOUNTING. Mounting needs exactly two ingredients —
// an intent and a target. Dismounting will eventually need an entirely
// different set of questions this file has no way to answer: where does
// the avatar reappear, is there room, is the destination terrain valid,
// is it occupied, does the vehicle stay put, what happens to vehicle
// control. So this milestone establishes only the one transition:
//
//   unmounted -> mounted
//
// There is no `interactionIntent` value or combination of arguments that
// this function will ever read as "dismount" — the vocabulary for that
// simply does not exist yet.
//
// TARGET ID, NEVER A VEHICLE OBJECT. Exactly like 0.9.77's own
// `createAvatarVehicleMount()`, this file takes `targetVehicleId` as a
// plain 0.9.74 vehicle id string — the same string
// `resolveAvatarVehicleInteractionTarget()` already returns — never a
// `VehiclePresence` instance. See core/AvatarVehicleMount.js's own header
// for why: a fresh `vehiclePresenceInRegion()` call reconstructs
// `VehiclePresence` instances from nothing on every invocation, so only
// the id stays meaningful across that reconstruction.
//
// `currentMount` MAY BE OMITTED, BUT NEVER SILENTLY COERCED IF INVALID.
// Treating a missing `currentMount` as `null` ("not currently mounted")
// keeps this function convenient to call at avatar initialization, before
// any mount has ever been established. But an explicitly-passed value
// that is neither `null` nor a real `AvatarVehicleMount` instance — a
// plain object, a bare vehicle id string, a number — is never quietly
// treated as "unmounted": it is rejected outright, via
// `isValidAvatarVehicleMount()`, the same strictness
// core/AvatarVehicleMount.js's own validator already enforces. A caller
// that passes a corrupted or malformed mount value gets a thrown error,
// not a silent, wrong transition.
//
// NO MOVEMENT CHANGES. This file has no dependency on, and no opinion
// about, `AvatarMovementController` or any other movement code. A mounted
// avatar moves exactly as it did before this milestone — see this file's
// own "Deliberately not yet" list. `AvatarVehicleMount` existing is not
// yet synonymous with movement changing; that composition is a distinct,
// future milestone's job.
//
// RETURNS THE SAME REFERENCE WHEN NOTHING CHANGES. Every "unchanged"
// branch above returns the exact `currentMount` value it was given —
// never a newly constructed, merely equal-looking `AvatarVehicleMount`.
// This keeps the function's own purity externally verifiable (same
// object in, same object out) and matches 0.9.77's own discipline that a
// new relationship means constructing a genuinely new value, never
// producing a look-alike copy of one that did not change.

function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

// The one entry point. See this file's own header for the exact,
// ordered rule this function implements.
export function deriveAvatarVehicleMount({ currentMount = null, interactionIntent, targetVehicleId = null } = {}) {
    if (!isValidAvatarVehicleMount(currentMount)) {
        throw new Error(`deriveAvatarVehicleMount requires currentMount to be null or a valid AvatarVehicleMount, got ${JSON.stringify(currentMount)}`);
    }
    if (!isValidAvatarVehicleInteractionIntent(interactionIntent)) {
        throw new Error(`deriveAvatarVehicleMount requires a valid interactionIntent, got ${JSON.stringify(interactionIntent)}`);
    }
    if (targetVehicleId !== null && !isNonEmptyString(targetVehicleId)) {
        throw new Error(`deriveAvatarVehicleMount requires targetVehicleId to be null or a non-empty string, got ${JSON.stringify(targetVehicleId)}`);
    }

    if (interactionIntent !== AvatarVehicleInteractionIntent.MOUNT) {
        return currentMount;
    }
    if (targetVehicleId === null) {
        return currentMount;
    }
    if (currentMount !== null) {
        return currentMount;
    }

    return createAvatarVehicleMount(targetVehicleId);
}

// Deliberately not yet: dismounting, or any vocabulary for it (see this
// file's own header, "Mounting only, no dismounting"); vehicle switching
// while already mounted (see "Already mounted is a no-op here, on
// purpose"); re-checking proximity or recomputing a target (0.9.73/0.9.76
// already answer those; see "This function does not re-check proximity");
// avatar movement or `AvatarMovementController` changes of any kind (see
// "No movement changes"); vehicle occupancy limits; vehicle movement or
// speed; animation; camera changes; collision or physics; keyboard or
// controller input; rendering; where the resulting `AvatarVehicleMount`
// is actually held on a running avatar; persistence; networking;
// randomness; the clock. See docs/Roadmap.md, 0.9.78, for the full list.
