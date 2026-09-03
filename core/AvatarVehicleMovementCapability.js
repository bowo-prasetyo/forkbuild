import { VehicleType, isValidVehicleType } from './VehicleType.js';
import { AvatarMovementDirectionCapability, isValidAvatarMovementDirectionCapability } from './AvatarMovementDirectionCapability.js';
import { AvatarMovementAccelerationCapability, AvatarMovementAccelerationKind, isValidAvatarMovementAccelerationCapability } from './AvatarMovementAccelerationCapability.js';
import { AvatarMovementBrakingCapability, AvatarMovementBrakingKind, isValidAvatarMovementBrakingCapability } from './AvatarMovementBrakingCapability.js';

// 0.9.84 — Avatar-Vehicle Movement Capability Resolution.
//
// 0.9.83 connected the complete mount/dismount semantic chain to a real
// `WorldNavigationSession`, and stopped there — its own closing paragraph
// is explicit that "vehicle movement remains completely untouched," and
// names the next question without answering it: "how should mounted
// movement modify the avatar's existing movement capability without
// creating a second movement system." This file is that answer, and
// nothing more than that answer:
//
//   Given the avatar's current vehicle relationship, what movement
//   capability should the existing avatar movement system have?
//
//   resolveAvatarVehicleMovementCapability(vehicleType) -> AvatarVehicleMovementCapability
//
// VEHICLES MODIFY MOVEMENT CAPABILITY; THEY DO NOT CREATE A SECOND AVATAR
// MOVEMENT SYSTEM. `application/AvatarMovementController.js` already owns
// one complete, tested movement pipeline (walk/run, turning, jumping,
// terrain, tree collision). The temptation this milestone deliberately
// refuses is to answer "how fast does a bicycle go" by building a parallel
// `BicycleMovementController`/`CarMovementController` per vehicle type —
// that would duplicate the entire existing pipeline once per vehicle,
// forever. Instead, this file draws the seam 0.9.83 left open: a pure
// function that turns "which vehicle, if any, is the avatar on" into a
// small, closed description of HOW that changes movement — for a future
// 0.9.85 to feed into the ONE existing movement system, never a new one.
//
// TAKES A VehicleType, NEVER AN AvatarVehicleMount OR A VehiclePresence.
// core/AvatarVehicleMount.js's own header already establishes the
// discipline this file continues: "a vehicle's type is already available
// from its own VehiclePresence; duplicating it here would let a mount
// relationship and its vehicle's own presence disagree about what the
// vehicle IS." A mount only ever carries a `vehicleId` — resolving that id
// to an actual `VehicleType` is a lookup this file has no business doing
// (it would require a vehicle registry/query this module has no reason to
// depend on). The caller — whatever future integration reads the current
// mount, looks up the mounted vehicle's own `VehiclePresence`, and already
// holds its `.type` — passes that `VehicleType` straight in.
// `VehicleType.NONE` is passed for "not currently mounted," reusing the
// exact value `core/VehicleType.js`'s own header already reserved for
// this — "the avatar is not currently riding any vehicle" — rather than
// inventing a second not-mounted spelling alongside `AvatarVehicleMount`'s
// own `null`.
//
// A NEW VOCABULARY, BUT NOT A DUPLICATE ONE. It would be easy to mistake
// "don't duplicate VehicleType" for "return VehicleType values verbatim,"
// but that throws away the one distinction this milestone exists to make:
// `VehicleType` names WHAT a vehicle IS (five sibling values with no
// relationship to each other); movement capability groups vehicles by HOW
// they move. `AvatarMovementCapabilityKind` has only three values —
// BICYCLE, MOTORCYCLE, and CAR all resolve to the SAME `GROUND_VEHICLE`
// kind, because (per this milestone's own brief) all three are
// "vehicle-powered ground movement," a distinction a future 0.9.85 needs
// to reuse the SAME existing ground movement pipeline for all three
// without querying `VehicleType` a second time. This is a many-to-one
// grouping, not a second five-value enum standing in for the first — the
// "don't duplicate VehicleType" rule this milestone was given is about
// never re-listing BICYCLE/MOTORCYCLE/CAR/DRONE side by side as if they
// were a second, independent vocabulary; grouping three of them under one
// shared movement semantic is the opposite of that mistake.
//
//   AvatarMovementCapabilityKind.WALK           — the avatar's own,
//       existing on-foot movement. Resolved from VehicleType.NONE.
//   AvatarMovementCapabilityKind.GROUND_VEHICLE — vehicle-powered ground
//       movement. Resolved from BICYCLE, MOTORCYCLE, or CAR alike: all
//       three are ground vehicles (see core/VehicleType.js's own header),
//       and this milestone takes no position on how their eventual
//       ground-movement numbers differ from one another or from WALK —
//       see "no speed values yet" below.
//   AvatarMovementCapabilityKind.AERIAL_VEHICLE — flight. Resolved only
//       from DRONE. Deliberately its own kind, never folded into
//       GROUND_VEHICLE merely because both are "vehicles" — an aerial
//       movement model is a categorically different thing from a ground
//       one, and this codebase has no aerial movement concept of any kind
//       yet (no altitude, no lift, nothing beyond `AvatarVerticalState`'s
//       own jump/fall). Silently routing DRONE through ground-vehicle
//       movement would be actively wrong, not merely premature.
//
// `supported` NAMES WHETHER A MOVEMENT PIPELINE CONCEPT EXISTS FOR THIS
// KIND YET, NOT WHETHER THIS MILESTONE IMPLEMENTED ITS PHYSICS. Nothing
// in this file, or in 0.9.84 at all, makes any vehicle actually move —
// that is explicitly 0.9.85's job, for every kind including WALK's own
// existing pipeline. `supported` instead distinguishes "an existing or
// planned movement pipeline this capability is meant to eventually drive"
// (WALK — already real; GROUND_VEHICLE — the express plan for 0.9.85 is
// reusing the SAME existing ground pipeline, per this milestone's own
// brief) from "no such pipeline exists in this codebase in any form"
// (AERIAL_VEHICLE — there is no flight/altitude system to eventually
// drive at all). A resolved DRONE capability is still a fully-formed,
// valid `AvatarVehicleMovementCapability` — never `null`, never an
// exception — it simply reports `supported: false` rather than silently
// pretending a car's ground movement also serves a drone.
//
// NO SPEED VALUES, NO PHYSICS, AS OF 0.9.84 — DELIBERATELY, AT THE TIME.
// An earlier draft of this milestone's own brief proposed a `maxSpeed`
// field (or even bare per-vehicle multipliers) as the first concrete
// capability. This file deliberately did neither: BICYCLE/MOTORCYCLE/
// CAR's actual numeric ground-movement characteristics — and DRONE's
// eventual flight numbers — were a then-unmade decision this vocabulary
// must NOT prejudge by shipping a "reserved but zero" or guessed
// placeholder number. Settling that a bicycle is "faster" than walking
// was left to whichever future milestone actually wired a numeric value
// into the existing movement pipeline. `movementKind` and `supported`
// were deliberately the entire descriptor — until 0.9.86 below.
//
// 0.9.86 — Ground Vehicle Movement Speed Capability. The decision 0.9.84
// deliberately deferred is made here, minimally: `movementSpeed` (world
// units/second — the SAME unit `core/AvatarMovementSimulation.js`'s own
// WALK_SPEED/RUN_SPEED already use, and the requested HORIZONTAL
// movement magnitude, never an acceleration or a physics quantity) joins
// `movementKind`/`supported` as the descriptor's third, and still only
// other, field. WALK's own `movementSpeed` is the avatar's existing
// on-foot speed — an avatar nobody has ever mounted on anything gets the
// numerically IDENTICAL speed it always has, never a "close enough"
// approximation (see "GROUND_VEHICLE_MOVEMENT_SPEED IS A DELIBERATE,
// DOCUMENTED DUPLICATE..." below for why that number is a deliberately
// duplicated constant, not an import).
// GROUND_VEHICLE's own `movementSpeed`, as of 0.9.86, was ONE shared,
// conservative constant, strictly greater than WALK's — BICYCLE,
// MOTORCYCLE, and CAR all resolved to the exact same number.
// Differentiating them numerically was named as explicit future scope;
// 0.9.87 (below) is that future milestone — see its own header for the
// per-vehicle values that replaced this shared constant.
// AERIAL_VEHICLE's own `movementSpeed` is `0` — inert, never actually
// read by anything: `supported: false` already blocks movement outright
// at `application/AvatarMovementController.js#tick()` before any speed
// value is ever consulted (see that file's own 0.9.85 header) — `0`
// merely keeps this a fully-formed, always-numeric field rather than a
// conditionally-absent one, so no caller ever needs an
// `if ('movementSpeed' in capability)` check.
//
// GROUND_VEHICLE_MOVEMENT_SPEED IS A DELIBERATE, DOCUMENTED DUPLICATE OF
// NO EXISTING NUMBER — AND WALK'S OWN movementSpeed IS A DELIBERATE,
// DOCUMENTED DUPLICATE OF core/AvatarMovementSimulation.js's OWN
// WALK_SPEED. This file's own architectural regression test
// (tests/AvatarVehicleMovementCapability.test.js, Section K) forbids
// importing `AvatarMovementSimulation.js` from here — this stays a pure
// capability vocabulary with zero coupling to the simulation module's
// own internals, exactly as 0.9.84 established. That means WALK's own
// `movementSpeed` cannot be *imported* from the one true WALK_SPEED
// constant; it is instead an independently-declared local constant
// documented, right where it is declared below, as required to always
// equal it. `application/WorldNavigationSession.js` resolves and applies
// a capability EVERY animation frame, WALK included (see that file's own
// 0.9.85 header) — so this is not a cosmetic parity, it is the one
// number standing between "ordinary walking" and "ordinary walking, at
// a slightly different speed nobody asked for."
//
// IMMUTABLE, GETTER-ONLY, FROZEN, DETERMINISTIC — the same discipline
// core/AvatarVehicleMount.js and core/VehiclePresence.js already enforce.
// `resolveAvatarVehicleMovementCapability()` performs no randomness, no
// clock read, and no I/O; the same `vehicleType` input always resolves to
// the identical (frozen, shared) capability instance.
//
// 0.9.87 — Per-Vehicle Ground Movement Speed Resolution. 0.9.86's own
// closing paragraph named exactly this as the deferred next step:
// differentiating BICYCLE/MOTORCYCLE/CAR numerically "only once there
// is an actual design reason to." The original intended progression
// (`docs/Roadmap.md`, 0.9.70) — WALK < BICYCLE < MOTORCYCLE < CAR — is
// now that reason. The change is confined entirely to THIS FILE'S OWN
// resolution data: three constants replace the one shared
// `GROUND_VEHICLE_MOVEMENT_SPEED`, and `CAPABILITY_BY_VEHICLE_TYPE`
// below hands each `VehicleType` its own value. `AvatarMovementKind`
// still has only three values — BICYCLE, MOTORCYCLE, and CAR still all
// resolve to the SAME `AvatarMovementCapabilityKind.GROUND_VEHICLE` —
// this milestone deliberately does NOT add a second, per-vehicle
// capability kind vocabulary alongside it. `movementKind` names WHICH
// movement algorithm applies (still exactly one, for all ground
// vehicles); `movementSpeed` names a PARAMETER that algorithm is fed —
// these are two independent dimensions, and only the second one changes
// here. `application/AvatarMovementController.js` reads
// `capability.movementSpeed` as a plain number and has no idea a
// bicycle, motorcycle, or car exists — 0.9.86 already built that seam;
// this milestone merely feeds it three different numbers instead of
// one, with zero corresponding change to that file or to
// `core/AvatarMovementSimulation.js` (see this file's own
// architectural regression test, Section K, and
// `tests/AvatarVehicleMovementSpeedIntegration.test.js`'s own Section H
// for both files' zero-diff proof).
//
// 0.9.88 — Ground Vehicle Collision Footprint Capability. A car moving
// at CAR_MOVEMENT_SPEED's own 12 units/second was still, until this
// milestone, being collision-tested against a tree as though it were
// the avatar's own 0.35-radius body — a physical inconsistency more
// fundamental than acceleration or steering (neither of which exists
// yet either). `collisionRadius` (world units — the SAME horizontal
// radius `core/AvatarCollision.js`'s own AVATAR_COLLISION_RADIUS and
// `core/AvatarTreeCollision.js`'s own avatarCollisionCircleAt() already
// use for the walking avatar) joins `movementKind`/`supported`/
// `movementSpeed` as this descriptor's fourth, and still only other,
// field — a PHYSICAL OCCUPANCY parameter, exactly as `movementSpeed`
// (0.9.86) is a speed parameter: the SAME `AvatarMovementCapabilityKind
// .GROUND_VEHICLE` movement kind, fed a different number, never a
// second collision system or a second per-vehicle kind vocabulary.
// WALK's own `collisionRadius` is the avatar's existing, unchanged
// hitbox — an avatar nobody has ever mounted on anything occupies
// EXACTLY the space it always has, never a "close enough"
// approximation (see "WALK_COLLISION_RADIUS IS A DELIBERATE,
// DOCUMENTED DUPLICATE..." below for why that number is a deliberately
// duplicated constant, not an import, mirroring WALK_MOVEMENT_SPEED's
// own 0.9.86 precedent exactly). BICYCLE/MOTORCYCLE/CAR's own
// `collisionRadius` values satisfy this milestone's one semantic
// requirement — `WALK < BICYCLE < MOTORCYCLE < CAR`, the identical
// ordering shape 0.9.87 already established for `movementSpeed`,
// verified directly by tests/AvatarVehicleMovementCapability.test.js's
// own ordering section — never tuned "game balance" numbers.
// AERIAL_VEHICLE's own `collisionRadius` is `0` — inert, for the exact
// same reason its own `movementSpeed` already is (see that field's own
// 0.9.86 header above): `supported: false` already blocks movement
// outright before any capability field, radius included, is ever
// consulted.
//
// THIS FILE STILL RESOLVES A CAPABILITY DESCRIPTOR; IT NEVER TOUCHES A
// SINGLE LINE OF COLLISION GEOMETRY OR RESOLUTION. Precisely which
// existing collision seam consumes `collisionRadius` — the swept
// candidate-query margin in `core/AvatarTreeCollisionQuery.js`, the
// resolution radius in `core/AvatarTreeMovement.js`, both reached
// through `application/AvatarTreeConstraint.js`'s own
// `apply(position, desiredPosition, { avatarRadius })` — is entirely
// those files' own 0.9.88 concern (see each one's own header). This
// file's only job, exactly as for `movementSpeed` before it, is to
// decide WHICH NUMBER a given vehicle relationship implies; it commits
// no opinion about circles, AABBs, trees, or bricks. `TreeCollisionGeometry
// .js` — what physical space a TREE occupies — is completely
// untouched: only the MOVING body's own radius changes.
//
// WALK_COLLISION_RADIUS IS A DELIBERATE, DOCUMENTED DUPLICATE OF
// core/AvatarCollision.js's OWN AVATAR_COLLISION_RADIUS — the identical
// "pure capability vocabulary, zero coupling to sibling modules' own
// internals" discipline `WALK_MOVEMENT_SPEED` already established
// relative to `core/AvatarMovementSimulation.js#WALK_SPEED` (see this
// file's own 0.9.86 header, "GROUND_VEHICLE_MOVEMENT_SPEED IS A
// DELIBERATE, DOCUMENTED DUPLICATE..."). This file's own architectural
// regression test (tests/AvatarVehicleMovementCapability.test.js,
// Section K) forbids importing `core/AvatarCollision.js` from here for
// exactly that reason — WALK's own `collisionRadius` cannot be
// *imported* from the one true AVATAR_COLLISION_RADIUS constant; it is
// instead an independently-declared local constant, documented, right
// where it is declared below, as required to always equal it.
//
// 0.9.89 — Vehicle Movement Direction Semantics. 0.9.86/0.9.87 decided
// HOW FAST a capability moves; 0.9.88 decided HOW MUCH SPACE it
// occupies. Neither ever asked WHICH DIRECTIONS the avatar's existing
// forward/backward input is currently allowed to produce — every
// capability, WALK included, has silently permitted both the entire
// time, because nothing has ever said otherwise. `movementDirections`
// (an `AvatarMovementDirectionCapability` — see that file's own header
// for why it is a small, closed, two-boolean value and not a mode or a
// state machine) joins `movementKind`/`supported`/`movementSpeed`/
// `collisionRadius` as this descriptor's fifth, and still only other,
// field.
//
// EVERY DEFINED CAPABILITY, AS OF 0.9.89, PERMITS BOTH DIRECTIONS. WALK
// always has (S has always walked the avatar backward); BICYCLE/
// MOTORCYCLE/CAR are given the identical `forward: true, backward: true`
// value this milestone's own brief asks for — real-world reversing
// differs wildly across those three, and this milestone takes no
// position on that difference, exactly as 0.9.84 took no position on
// their relative speed before 0.9.87 existed. This milestone's entire
// job is the SEAM — a capability can now say no to a direction — not
// yet using it to say no to any REAL vehicle's own direction.
// AERIAL_VEHICLE/DRONE's own `movementDirections` is `forward: false,
// backward: false` — inert, for the identical reason its own
// `movementSpeed`/`collisionRadius` already are `0`: `supported: false`
// already blocks movement, direction included, before this field is
// ever consulted (see `application/AvatarMovementController.js`'s own
// 0.9.85 `tick()` guard).
//
// THIS FILE STILL RESOLVES A CAPABILITY DESCRIPTOR; IT NEVER DECIDES
// WHAT HAPPENS WHEN A DIRECTION ISN'T PERMITTED. Precisely how a
// disallowed direction is withheld from `AvatarMovementState.forwardAxis`
// — for both ordinary W/S input and the persistent continuous-movement
// intent (core/AvatarContinuousMovementIntent.js) that can drive the
// exact same axis — is entirely
// `application/AvatarMovementController.js`'s own 0.9.89 concern (see
// that file's own header). This file's only job, exactly as for
// `movementSpeed` and `collisionRadius` before it, is to decide WHICH
// TWO BOOLEANS a given vehicle relationship implies.
//
// 0.9.90 — Vehicle Acceleration Capability. 0.9.86-0.9.89 gave a
// movement capability an opinion about HOW FAST it moves, HOW MUCH SPACE
// it occupies, and WHICH DIRECTIONS it permits — all three STATELESS:
// capability -> value, with no notion of time. This milestone adds the
// first field that is not: `acceleration` (an
// `AvatarMovementAccelerationCapability` — see that file's own header
// for why it is a small, closed, two-field kind/rate value, and
// core/AvatarMovementAccelerationSimulation.js for the pure math that
// actually consumes a rate) joins `movementKind`/`supported`/
// `movementSpeed`/`collisionRadius`/`movementDirections` as this
// descriptor's sixth, and still only other, field.
//
// STATELESS DESCRIPTOR, STATEFUL CONSUMER — AND THIS FILE STAYS
// STATELESS. `acceleration` names a RATE (or the INSTANT "no rate
// applies" case); it never carries a current or transient speed of its
// own. Whatever future integration actually simulates movement
// approaching `movementSpeed` at this rate owns the transient
// "current speed" bookkeeping itself — the direct structural twin of how
// `application/AvatarMovementController.js` already owns
// `_verticalVelocity`/`_grounded` rather than pushing them into
// `AvatarPresence` (see that file's own header). This file resolves a
// capability; it has never once, since 0.9.84, held any state that
// changes tick to tick, and this milestone does not start.
//
// WALK IS `INSTANT`, NEVER A LARGE `RATE_LIMITED` NUMBER STANDING IN FOR
// IT. The avatar's own existing on-foot movement has always reached
// `movementSpeed` in a single simulation tick — see
// core/AvatarMovementSimulation.js, which has never integrated speed
// toward a target at any rate. `AvatarMovementAccelerationKind.INSTANT`
// names that existing behavior explicitly, rather than picking an
// arbitrarily large `RATE_LIMITED` number to approximate "immediately" —
// see core/AvatarMovementAccelerationCapability.js's own header,
// "NO ARBITRARY '999' VALUE FOR WALK," for the full argument.
// BICYCLE/MOTORCYCLE/CAR are each `RATE_LIMITED`, with their own
// strictly positive per-vehicle rates.
//
// ACCELERATION IS AN INDEPENDENT DIMENSION FROM `movementSpeed` — A
// FASTER VEHICLE DOES NOT AUTOMATICALLY ACCELERATE FASTER. Unlike
// `movementSpeed`/`collisionRadius` (0.9.87/0.9.88), which both satisfy
// the strict `WALK < BICYCLE < MOTORCYCLE < CAR` ordering, this
// milestone deliberately asserts NO analogous ordering for
// `acceleration` — CAR's own top speed is the highest of the three
// ground vehicles, but nothing about that requires its own acceleration
// to be. `tests/AvatarMovementAccelerationCapability.test.js` covers the
// vocabulary directly; `tests/AvatarVehicleMovementCapability.test.js`
// asserts each defined capability's own `acceleration` is well-formed,
// never that it follows `movementSpeed`'s own ordering.
//
// AERIAL_VEHICLE/DRONE's own `acceleration` is `AvatarMovementAccelerationKind.INSTANT`
// with rate `0` — the SAME shared value WALK uses, reused rather than
// duplicated because both genuinely mean "no rate applies," even though
// for different reasons: WALK because on-foot movement has always been
// instantaneous; DRONE only inertly, because `supported: false` already
// blocks movement, acceleration included, before this field is ever
// consulted (see `application/AvatarMovementController.js`'s own 0.9.85
// `tick()` guard) — the identical reason its own `movementSpeed`/
// `collisionRadius`/`movementDirections` are already inert.
//
// THIS FILE STILL RESOLVES A CAPABILITY DESCRIPTOR; IT NEVER SIMULATES
// A SINGLE TICK OF ACCELERATION. Precisely how a resolved `acceleration`
// field is consumed — whether `kind` is even consulted before calling
// `resolveMovementSpeed()`, where the transient "current speed" is
// tracked, how it reaches `application/AvatarMovementController.js`'s
// own `tick()` — is deliberately left to a future milestone. This file's
// own architectural regression test (Section K) forbids importing
// `core/AvatarMovementAccelerationSimulation.js` for the identical reason
// it already forbids `core/AvatarMovementSimulation.js`: this stays a
// pure capability vocabulary, zero coupling to the math that consumes
// it. EXISTING INSTANTANEOUS MOVEMENT BEHAVIOR REMAINS COMPLETELY
// UNCHANGED, AS OF 0.9.90 — `application/AvatarMovementController.js`
// and `core/AvatarMovementSimulation.js` are BOTH untouched by this
// milestone; nothing anywhere in this codebase yet reads a resolved
// capability's own `acceleration` field.
//
// 0.9.92 — Vehicle Braking and Coasting Semantics. 0.9.90's own closing
// paragraph named this explicitly as future scope: "there is
// deliberately no separate braking/deceleration RATE anywhere ... until
// a future milestone gives braking its own, independently-tunable
// number." This milestone is that number: `braking` (an
// `AvatarMovementBrakingCapability` — see that file's own header for why
// it is a small, closed, two-field kind/rate value, the direct
// structural twin of `acceleration`) joins `movementKind`/`supported`/
// `movementSpeed`/`collisionRadius`/`movementDirections`/`acceleration`
// as this descriptor's seventh, and still only other, field.
//
//   0.9.90 answered how quickly a capability reaches a HIGHER target
//   speed. 0.9.92 answers how quickly it reaches a LOWER one, WHEN
//   EXPLICITLY ASKED TO — braking is never merely "acceleration, run
//   backward": it is its own, independently-tunable rate.
//
// BRAKING IS A GENUINELY INDEPENDENT DIMENSION FROM `acceleration` —
// AND IT DOES NOT ALTER `movementSpeed`. Every ground vehicle's own
// braking rate here is strictly GREATER than that same vehicle's own
// acceleration rate — "brakes stop a vehicle faster than its engine
// gets it moving" is the one semantic requirement this milestone
// establishes (verified directly by
// tests/AvatarVehicleMovementCapability.test.js's own ordering
// section) — but braking is never DERIVED from acceleration by
// multiplying or doubling it: each is its own, independently chosen
// constant, exactly like `acceleration`'s own relationship to
// `movementSpeed` (0.9.90's own "a faster vehicle does not
// automatically accelerate faster" — here, "a vehicle that accelerates
// quickly does not automatically brake proportionally").
// `movementSpeed` itself is completely untouched by this field: braking
// changes how fast a vehicle SLOWS, never how fast it can eventually
// GO.
//
// WALK IS `INSTANT`, REUSING THE EXACT SAME SHARED VALUE ITS OWN
// `acceleration` ALREADY DOES. The avatar's own existing on-foot
// movement has never had any notion of "braking" — releasing forward
// input has always stopped it instantly (see
// core/AvatarMovementSimulation.js, unchanged since 0.2.36) — so WALK's
// own braking is `AvatarMovementBrakingKind.INSTANT`/`0`, the identical
// inert value AERIAL_VEHICLE/DRONE reuses for the identical
// `supported: false` reason its own `acceleration`/`movementSpeed`/
// `collisionRadius`/`movementDirections` already are inert.
//
// THIS FILE STILL RESOLVES A CAPABILITY DESCRIPTOR; IT NEVER DECIDES
// WHETHER A GIVEN TICK IS ACTUALLY BRAKING. That is an explicit,
// per-tick FACT (`brakingRequested`), never something this file infers
// from a vehicle's identity — see core/AvatarMovementState.js's own
// 0.9.92 header for where that fact lives, and
// core/AvatarMovementSimulation.js's own 0.9.92 header for where it is
// actually consulted. This file's own architectural regression test
// (Section K) forbids importing `core/AvatarMovementAccelerationSimulation.js`
// for exactly this reason, unchanged since 0.9.90 — this stays a pure
// capability vocabulary, zero coupling to the math that consumes it.
//
// Deliberately excluded, matching this milestone's own brief: coasting
// as anything beyond "target speed 0, resolved by the SAME mechanism as
// any rising target" (no rolling resistance, aerodynamic drag, engine
// braking, tire friction, or slope effects), a `brakingRequested` fact
// of any kind (transient per-tick input, never capability data),
// binding braking to any keyboard key, steering, vehicle orientation,
// and a second per-vehicle capability-kind vocabulary. See
// docs/Roadmap.md, 0.9.92.
//
// Deliberately excluded, matching 0.9.84's own original brief (0.9.85
// later made the one exception this list itself anticipated — feeding a
// resolved capability into `application/AvatarMovementController.js` —
// 0.9.86 made the further exception described above — a base
// `movementSpeed` — 0.9.87 made the per-vehicle numeric differentiation
// of that field, 0.9.88 made the further exception described above — a
// per-vehicle `collisionRadius` — 0.9.89 made the further exception
// described above — `movementDirections` — and 0.9.90 made the further
// exception described above — `acceleration`): W/S input, continuous
// movement, braking, coasting, friction, momentum, turning, left/right
// movement direction, vehicle orientation, a rectangular or oriented
// (non-circular) vehicle footprint, vehicle-vs-vehicle collision,
// vehicle-specific terrain handling, vehicle animation, camera behavior,
// mounting/dismounting, persistence, networking, transient/current-speed
// state of any kind, and a second, per-vehicle `AvatarMovementCapabilityKind`
// vocabulary. This file still answers only "what movement capability —
// kind, support, base speed, (0.9.88) collision radius, (0.9.89)
// permitted directions, and (0.9.90) acceleration rate — does this
// vehicle relationship imply," never how a caller actually applies it to
// move, accelerate, or collide anything.
export const AvatarMovementCapabilityKind = Object.freeze({
    WALK: 'walk',
    GROUND_VEHICLE: 'ground_vehicle',
    AERIAL_VEHICLE: 'aerial_vehicle'
});

export function isValidAvatarMovementCapabilityKind(value) {
    return Object.values(AvatarMovementCapabilityKind).includes(value);
}

export class AvatarVehicleMovementCapability {
    constructor(movementKind, vehicleType, supported, movementSpeed, collisionRadius, movementDirections, acceleration, braking) {
        if (!isValidAvatarMovementCapabilityKind(movementKind)) {
            throw new Error(`AvatarVehicleMovementCapability requires a valid AvatarMovementCapabilityKind, got ${JSON.stringify(movementKind)}`);
        }
        if (!isValidVehicleType(vehicleType)) {
            throw new Error(`AvatarVehicleMovementCapability requires a valid VehicleType, got ${JSON.stringify(vehicleType)}`);
        }
        if (typeof supported !== 'boolean') {
            throw new Error(`AvatarVehicleMovementCapability requires a boolean supported, got ${JSON.stringify(supported)}`);
        }
        if (typeof movementSpeed !== 'number' || !Number.isFinite(movementSpeed) || movementSpeed < 0) {
            throw new Error(`AvatarVehicleMovementCapability requires a finite, non-negative movementSpeed, got ${JSON.stringify(movementSpeed)}`);
        }
        if (typeof collisionRadius !== 'number' || !Number.isFinite(collisionRadius) || collisionRadius < 0) {
            throw new Error(`AvatarVehicleMovementCapability requires a finite, non-negative collisionRadius, got ${JSON.stringify(collisionRadius)}`);
        }
        if (!isValidAvatarMovementDirectionCapability(movementDirections)) {
            throw new Error(`AvatarVehicleMovementCapability requires a valid AvatarMovementDirectionCapability, got ${JSON.stringify(movementDirections)}`);
        }
        if (!isValidAvatarMovementAccelerationCapability(acceleration)) {
            throw new Error(`AvatarVehicleMovementCapability requires a valid AvatarMovementAccelerationCapability, got ${JSON.stringify(acceleration)}`);
        }
        if (!isValidAvatarMovementBrakingCapability(braking)) {
            throw new Error(`AvatarVehicleMovementCapability requires a valid AvatarMovementBrakingCapability, got ${JSON.stringify(braking)}`);
        }
        this._movementKind = movementKind;
        this._vehicleType = vehicleType;
        this._supported = supported;
        this._movementSpeed = movementSpeed;
        this._collisionRadius = collisionRadius;
        this._movementDirections = movementDirections;
        this._acceleration = acceleration;
        this._braking = braking;
        Object.freeze(this);
    }

    get movementKind() { return this._movementKind; }
    get vehicleType() { return this._vehicleType; }
    get supported() { return this._supported; }
    // 0.9.86 — the BASE horizontal movement speed (world units/second)
    // this capability implies, before the existing running modifier is
    // ever applied — see this file's own 0.9.86 header. Always a finite
    // number >= 0, never undefined/NaN: AERIAL_VEHICLE's own `0` is
    // inert (see that header) rather than a conditionally-missing field.
    get movementSpeed() { return this._movementSpeed; }
    // 0.9.88 — the horizontal collision radius (world units) this
    // capability's moving body occupies — see this file's own 0.9.88
    // header. Always a finite number >= 0, never undefined/NaN:
    // AERIAL_VEHICLE's own `0` is inert for the identical reason
    // `movementSpeed`'s own `0` already is.
    get collisionRadius() { return this._collisionRadius; }
    // 0.9.89 — which of forward/backward this capability currently
    // permits the avatar's existing movement input to produce — see
    // this file's own 0.9.89 header and
    // core/AvatarMovementDirectionCapability.js. Always a fully-formed
    // `AvatarMovementDirectionCapability` instance, never undefined/null:
    // AERIAL_VEHICLE's own `forward: false, backward: false` is inert
    // for the identical reason `movementSpeed`'s/`collisionRadius`'s own
    // `0` already is.
    get movementDirections() { return this._movementDirections; }
    // 0.9.90 — the rate (or lack thereof) at which this capability's
    // movement approaches `movementSpeed` — see this file's own 0.9.90
    // header and core/AvatarMovementAccelerationCapability.js. Always a
    // fully-formed `AvatarMovementAccelerationCapability` instance,
    // never undefined/null: AERIAL_VEHICLE's own `INSTANT`/`0` is inert
    // for the identical reason `movementSpeed`'s/`collisionRadius`'s/
    // `movementDirections`'s own inert values already are.
    get acceleration() { return this._acceleration; }
    // 0.9.92 — the rate (or lack thereof) at which this capability's
    // movement approaches a LOWER target speed WHEN BRAKING IS
    // EXPLICITLY REQUESTED — see this file's own 0.9.92 header and
    // core/AvatarMovementBrakingCapability.js. Always a fully-formed
    // `AvatarMovementBrakingCapability` instance, never undefined/null:
    // AERIAL_VEHICLE's own `INSTANT`/`0` is inert for the identical
    // reason `movementSpeed`'s/`collisionRadius`'s/`movementDirections`'s/
    // `acceleration`'s own inert values already are.
    get braking() { return this._braking; }

    toJSON() {
        return {
            movementKind: this._movementKind,
            vehicleType: this._vehicleType,
            supported: this._supported,
            movementSpeed: this._movementSpeed,
            collisionRadius: this._collisionRadius,
            movementDirections: this._movementDirections.toJSON(),
            acceleration: this._acceleration.toJSON(),
            braking: this._braking.toJSON()
        };
    }

    static fromJSON(json) {
        return new AvatarVehicleMovementCapability(
            json.movementKind,
            json.vehicleType,
            json.supported,
            json.movementSpeed,
            json.collisionRadius,
            AvatarMovementDirectionCapability.fromJSON(json.movementDirections),
            AvatarMovementAccelerationCapability.fromJSON(json.acceleration),
            AvatarMovementBrakingCapability.fromJSON(json.braking)
        );
    }
}

export function isValidAvatarVehicleMovementCapability(value) {
    return value instanceof AvatarVehicleMovementCapability
        && isValidAvatarMovementCapabilityKind(value.movementKind)
        && isValidVehicleType(value.vehicleType)
        && typeof value.supported === 'boolean'
        && typeof value.movementSpeed === 'number'
        && Number.isFinite(value.movementSpeed)
        && value.movementSpeed >= 0
        && typeof value.collisionRadius === 'number'
        && Number.isFinite(value.collisionRadius)
        && value.collisionRadius >= 0
        && isValidAvatarMovementDirectionCapability(value.movementDirections)
        && isValidAvatarMovementAccelerationCapability(value.acceleration)
        && isValidAvatarMovementBrakingCapability(value.braking);
}

// 0.9.86 — WALK's own base movement speed. MUST always equal
// core/AvatarMovementSimulation.js's own WALK_SPEED — see this file's
// own 0.9.86 header ("GROUND_VEHICLE_MOVEMENT_SPEED IS A DELIBERATE,
// DOCUMENTED DUPLICATE...") for why that is an independently-declared
// constant here rather than an import.
const WALK_MOVEMENT_SPEED = 3; // world units / second

// 0.9.87 — per-vehicle GROUND_VEHICLE base movement speeds, replacing
// 0.9.86's own single shared `GROUND_VEHICLE_MOVEMENT_SPEED` constant.
// `BICYCLE_MOVEMENT_SPEED` deliberately keeps 0.9.86's own value
// unchanged (it was already `WALK_MOVEMENT_SPEED`'s own existing
// RUN_SPEED-equal baseline — see the now-superseded comment this
// replaces), so nothing that previously mounted a bicycle changes
// speed. MOTORCYCLE and CAR are new, deliberately conservative choices
// satisfying this milestone's one semantic requirement —
// `WALK < BICYCLE < MOTORCYCLE < CAR`, verified directly by
// tests/AvatarVehicleMovementCapability.test.js's own ordering section —
// never a tuned "game balance" number. These three constants are owned
// by this file, the vehicle capability layer, exactly as this file's
// own 0.9.87 header describes: the movement simulation
// (core/AvatarMovementSimulation.js) owns HOW a speed is applied; this
// file owns WHICH speed each vehicle capability carries.
const BICYCLE_MOVEMENT_SPEED = 6; // world units / second
const MOTORCYCLE_MOVEMENT_SPEED = 9; // world units / second
const CAR_MOVEMENT_SPEED = 12; // world units / second

// 0.9.88 — WALK's own collision radius. MUST always equal
// core/AvatarCollision.js's own AVATAR_COLLISION_RADIUS — see this
// file's own 0.9.88 header ("WALK_COLLISION_RADIUS IS A DELIBERATE,
// DOCUMENTED DUPLICATE...") for why that is an independently-declared
// constant here rather than an import.
const WALK_COLLISION_RADIUS = 0.35; // world units

// 0.9.88 — per-vehicle GROUND_VEHICLE collision radii, satisfying this
// milestone's one semantic requirement,
// `WALK < BICYCLE < MOTORCYCLE < CAR`, verified directly by
// tests/AvatarVehicleMovementCapability.test.js's own ordering section
// — deliberately simple, deliberately not final game-balance values,
// exactly like BICYCLE_MOVEMENT_SPEED/MOTORCYCLE_MOVEMENT_SPEED/
// CAR_MOVEMENT_SPEED above.
const BICYCLE_COLLISION_RADIUS = 0.45; // world units
const MOTORCYCLE_COLLISION_RADIUS = 0.55; // world units
const CAR_COLLISION_RADIUS = 0.80; // world units

// 0.9.89 — the two `AvatarMovementDirectionCapability` values every
// resolved capability currently draws from. `PERMITS_BOTH_DIRECTIONS` is
// shared by WALK, BICYCLE, MOTORCYCLE, and CAR alike — see this file's
// own 0.9.89 header for why none of them is yet differentiated, matching
// how ONE shared `GROUND_VEHICLE_MOVEMENT_SPEED` constant briefly served
// BICYCLE/MOTORCYCLE/CAR alike before 0.9.87 split it apart.
// `NO_DIRECTIONS_PERMITTED` is AERIAL_VEHICLE/DRONE's own inert value,
// the direct structural twin of `movementSpeed`'s/`collisionRadius`'s
// own `0` for that same capability.
const PERMITS_BOTH_DIRECTIONS = new AvatarMovementDirectionCapability(true, true);
const NO_DIRECTIONS_PERMITTED = new AvatarMovementDirectionCapability(false, false);

// 0.9.90 — WALK's own acceleration: `INSTANT`, rate `0` — the avatar's
// existing on-foot movement has always reached `movementSpeed` in a
// single tick, and this milestone does not change that (see this file's
// own 0.9.90 header, "WALK IS INSTANT, NEVER A LARGE RATE_LIMITED NUMBER
// STANDING IN FOR IT"). AERIAL_VEHICLE/DRONE reuses this exact same
// value — see that header's own "AERIAL_VEHICLE/DRONE's own
// `acceleration`" paragraph for why sharing it (rather than declaring a
// second, textually-identical inert constant) is correct here.
const INSTANT_ACCELERATION = new AvatarMovementAccelerationCapability(AvatarMovementAccelerationKind.INSTANT, 0);

// 0.9.90 — per-vehicle GROUND_VEHICLE acceleration rates (world
// units/second^2). Deliberately NOT ordered `BICYCLE < MOTORCYCLE < CAR`
// to match `movementSpeed`'s/`collisionRadius`'s own strict ordering —
// see this file's own 0.9.90 header, "ACCELERATION IS AN INDEPENDENT
// DIMENSION FROM movementSpeed": CAR's own top speed is the highest of
// the three, but its own acceleration here is deliberately given a
// LOWER rate than MOTORCYCLE's, precisely so nothing anywhere in this
// codebase can quietly assume the two dimensions must move together.
// Simple, deliberately not final game-balance values, exactly like
// BICYCLE_MOVEMENT_SPEED/BICYCLE_COLLISION_RADIUS and their own siblings
// above.
const BICYCLE_ACCELERATION = new AvatarMovementAccelerationCapability(AvatarMovementAccelerationKind.RATE_LIMITED, 3);
const MOTORCYCLE_ACCELERATION = new AvatarMovementAccelerationCapability(AvatarMovementAccelerationKind.RATE_LIMITED, 5);
const CAR_ACCELERATION = new AvatarMovementAccelerationCapability(AvatarMovementAccelerationKind.RATE_LIMITED, 4);

// 0.9.92 — WALK's own braking: `INSTANT`, rate `0` — the avatar's
// on-foot movement has never had any notion of "braking" (releasing
// forward input has always stopped it instantly — see this file's own
// 0.9.92 header). AERIAL_VEHICLE/DRONE reuses this exact same value,
// for the identical `supported: false` reason it already reuses
// `INSTANT_ACCELERATION`.
const INSTANT_BRAKING = new AvatarMovementBrakingCapability(AvatarMovementBrakingKind.INSTANT, 0);

// 0.9.92 — per-vehicle GROUND_VEHICLE braking rates (world
// units/second^2). The one semantic requirement this milestone
// establishes: each ground vehicle's own braking rate is strictly
// GREATER than that same vehicle's own acceleration rate above — a
// vehicle always sheds speed faster than it builds it up — but braking
// is never DERIVED from acceleration (doubled, or otherwise computed);
// each is its own, independently chosen constant, exactly like
// `acceleration`'s own deliberately non-monotonic relationship to
// `movementSpeed` (see this file's own 0.9.92 header, "BRAKING IS A
// GENUINELY INDEPENDENT DIMENSION FROM acceleration"). Simple,
// deliberately not final game-balance values, exactly like every prior
// per-vehicle constant above.
const BICYCLE_BRAKING = new AvatarMovementBrakingCapability(AvatarMovementBrakingKind.RATE_LIMITED, 6);
const MOTORCYCLE_BRAKING = new AvatarMovementBrakingCapability(AvatarMovementBrakingKind.RATE_LIMITED, 9);
const CAR_BRAKING = new AvatarMovementBrakingCapability(AvatarMovementBrakingKind.RATE_LIMITED, 8);

// One frozen instance per VehicleType, built once at module load — never
// reconstructed per call — so `resolveAvatarVehicleMovementCapability()`
// returns the literal same object for the same input, matching
// core/VehicleType.js's own `Object.freeze` closed-vocabulary discipline.
const CAPABILITY_BY_VEHICLE_TYPE = Object.freeze({
    [VehicleType.NONE]: new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.WALK, VehicleType.NONE, true, WALK_MOVEMENT_SPEED, WALK_COLLISION_RADIUS, PERMITS_BOTH_DIRECTIONS, INSTANT_ACCELERATION, INSTANT_BRAKING),
    [VehicleType.BICYCLE]: new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.GROUND_VEHICLE, VehicleType.BICYCLE, true, BICYCLE_MOVEMENT_SPEED, BICYCLE_COLLISION_RADIUS, PERMITS_BOTH_DIRECTIONS, BICYCLE_ACCELERATION, BICYCLE_BRAKING),
    [VehicleType.MOTORCYCLE]: new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.GROUND_VEHICLE, VehicleType.MOTORCYCLE, true, MOTORCYCLE_MOVEMENT_SPEED, MOTORCYCLE_COLLISION_RADIUS, PERMITS_BOTH_DIRECTIONS, MOTORCYCLE_ACCELERATION, MOTORCYCLE_BRAKING),
    [VehicleType.CAR]: new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.GROUND_VEHICLE, VehicleType.CAR, true, CAR_MOVEMENT_SPEED, CAR_COLLISION_RADIUS, PERMITS_BOTH_DIRECTIONS, CAR_ACCELERATION, CAR_BRAKING),
    [VehicleType.DRONE]: new AvatarVehicleMovementCapability(AvatarMovementCapabilityKind.AERIAL_VEHICLE, VehicleType.DRONE, false, 0, 0, NO_DIRECTIONS_PERMITTED, INSTANT_ACCELERATION, INSTANT_BRAKING)
});

// The one resolution entry point. See this file's own header for exactly
// what `vehicleType` must be (a VehicleType value, `VehicleType.NONE` for
// "not currently mounted" — never an AvatarVehicleMount or VehiclePresence).
export function resolveAvatarVehicleMovementCapability(vehicleType) {
    if (!isValidVehicleType(vehicleType)) {
        throw new Error(`resolveAvatarVehicleMovementCapability requires a valid VehicleType, got ${JSON.stringify(vehicleType)}`);
    }
    return CAPABILITY_BY_VEHICLE_TYPE[vehicleType];
}

// Deliberately not yet (0.9.92, still): coasting as anything beyond
// "target speed 0, resolved the same way as any other target," a
// `brakingRequested` fact (that is transient per-tick input, never
// capability data — see core/AvatarMovementState.js's own 0.9.92
// header), or any transient current-speed state (that stays the
// controller's own job — see application/AvatarMovementController.js's
// own 0.9.91 header); a second, per-vehicle `AvatarMovementCapabilityKind`
// vocabulary (see this file's own 0.9.87 header for why BICYCLE/
// MOTORCYCLE/CAR still share the one GROUND_VEHICLE kind); per-vehicle
// direction differentiation (every defined capability currently permits
// both — see this file's own 0.9.89 header); left/right movement
// direction; reading an `AvatarVehicleMount` or looking up a
// `VehicleType` from a vehicle id or `VehiclePresence` (the caller's job,
// not this file's); vehicle orientation, a rectangular or oriented
// (non-circular) collision footprint, vehicle-vs-vehicle collision,
// terrain response, steering, or animation; camera behavior;
// mounting/dismounting; persistence; networking. See docs/Roadmap.md,
// 0.9.84 for the original list, 0.9.86 for the base speed field, 0.9.87
// for the per-vehicle speed differentiation, 0.9.88 for the collision
// radius field, 0.9.89 for the movement direction field, 0.9.90 for the
// acceleration field, and 0.9.92 for the braking field.
