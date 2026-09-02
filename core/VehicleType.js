// 0.9.70 — Vehicle Type Vocabulary.
//
// World View has never had a concept of a vehicle. Every existing
// movement seam (core/AvatarMovementState.js, core/AvatarContinuousMovementIntent.js,
// core/AvatarContinuousMovementMode.js) describes the SAME participant —
// an avatar, on foot — walking or running. This milestone opens a new
// line, Vehicles, by answering the first and smallest question that
// line needs answered: what IS a vehicle, as a closed set of choices,
// before anything decides what a vehicle DOES.
//
// Deliberately just a closed vocabulary plus one validator, the exact
// shape core/WorldLocationKind.js and core/AvatarInteractionKind.js
// already use for "a small set of named things with no behavior of
// their own yet" — NOT the shape of core/AvatarContinuousMovementIntent.js
// or core/AvatarContinuousMovementMode.js, both of which also ship a
// transition function. There is no transition function here because
// there is no state yet for anything to transition: this milestone
// does not say whether an avatar currently has a vehicle, only what
// values that (future) field could ever legally hold.
//
//   VehicleType.NONE       — the avatar is not currently riding any
//                             vehicle. Kept as an explicit value for
//                             the same reason AvatarContinuousMovementIntent's
//                             own NONE and AvatarVerticalState's
//                             SUPPORTED are explicit rather than
//                             representing "nothing" as `null`/
//                             `undefined` — see those files' own
//                             headers.
//   VehicleType.BICYCLE    — a ground vehicle.
//   VehicleType.MOTORCYCLE — a ground vehicle.
//   VehicleType.CAR        — a ground vehicle.
//   VehicleType.DRONE      — an aerial vehicle.
//
// This vocabulary deliberately says nothing about "ground" vs.
// "aerial" itself, or about speed, capacity, or any other property —
// see docs/Roadmap.md, 0.9.70, for why a movement-capability
// vocabulary (GROUND/AERIAL, or a numeric speed) is explicitly
// NOT introduced yet. Introducing it here, before any consumer exists
// to need it, would be guessing at a shape from first principles
// rather than discovering it from an actual seam — the same mistake
// this codebase's own roadmap has repeatedly called out and avoided
// (see e.g. core/AvatarContinuousMovementMode.js's own header on why
// direction and mode are two vocabularies, not one guessed-at
// combination). VehicleType names WHAT a vehicle is; nothing about
// HOW it moves is decided here.
//
// Deliberately excluded, matching this milestone's own brief: vehicle
// movement, speed, acceleration, physics; vehicle objects, spawning,
// or placement in the World; vehicle rendering; mounting/dismounting
// an avatar to/from a vehicle, or any "does this avatar have a
// vehicle" field anywhere; keyboard input; collision; terrain;
// persistence; ownership; fuel/battery/inventory; damage. This file
// answers only "what is a legal vehicle type," nothing else.
export const VehicleType = Object.freeze({
    NONE: 'none',
    BICYCLE: 'bicycle',
    MOTORCYCLE: 'motorcycle',
    CAR: 'car',
    DRONE: 'drone'
});

export function isValidVehicleType(value) {
    return Object.values(VehicleType).includes(value);
}
