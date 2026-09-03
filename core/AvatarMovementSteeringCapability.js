// 0.9.93 — Vehicle Steering Capability.
//
// 0.9.86-0.9.92 gave a movement capability an opinion about HOW FAST it
// moves (`movementSpeed`), HOW MUCH SPACE it occupies (`collisionRadius`),
// WHICH DIRECTIONS it permits (`movementDirections`), and HOW QUICKLY it
// approaches a HIGHER (`acceleration`) or, when explicitly requested, a
// LOWER (`braking`) target speed. Every one of those is a LONGITUDINAL
// question — how a capability moves along the single axis it is already
// facing. This milestone asks the first LATERAL one:
//
//   Given a capability's current heading and a requested one, how
//   quickly can it actually turn?
//
// THE DIRECT STRUCTURAL TWIN OF core/AvatarMovementAccelerationCapability.js
// AND core/AvatarMovementBrakingCapability.js — same posture, same shape,
// same invariant, one milestone-scoped concern later: immutable,
// getter-only, frozen, deterministic, a small, closed `kind`/rate pair,
// never a shape or state. `kind` (`AvatarMovementSteeringKind.INSTANT` or
// `.RATE_LIMITED`) and `steeringRate` (radians/second) are both required,
// and the identical coupling invariant applies: INSTANT requires
// `steeringRate === 0` exactly; RATE_LIMITED forbids `steeringRate === 0`
// (a rate-limited capability that never actually turns is a
// contradiction, not a valid third state — see
// core/AvatarMovementAccelerationCapability.js's own header for the full
// argument, unchanged here). A THIRD, textually similar enum/class rather
// than reusing `AvatarMovementAccelerationKind`/`AvatarMovementBrakingKind`
// directly is a deliberate decoupling, not an oversight — acceleration,
// braking, and steering are three independent capability dimensions (see
// this file's own consumer, core/AvatarVehicleMovementCapability.js, for
// why CAR's own steering rate is derived from none of its other fields),
// and coupling their vocabularies would make that independence harder to
// see, not easier.
//
// RADIANS/SECOND, DELIBERATELY, NOT DEGREES. Every OTHER quantity in this
// codebase's existing turning code
// (core/AvatarMovementSimulation.js's own `TURN_RATE_DEGREES_PER_SECOND`
// and the `rotationY` it advances) is expressed in degrees. This file's
// own `steeringRate` deliberately uses radians instead — the unit its own
// consumer, core/AvatarMovementSteeringSimulation.js, actually performs
// angular arithmetic in (matching `Math.sin`/`Math.cos`/`Math.atan2`'s own
// native unit, exactly as `core/AvatarMovementSimulation.js` itself
// already converts `rotationY` to radians before ever calling `Math.sin`/
// `Math.cos` — see that file's own `radians = nextRotationY * (Math.PI /
// 180)` line). This is a genuinely NEW, independent quantity for a NEW
// pure heading simulation, not a value fed into the EXISTING
// degrees-based `rotationY` advance — so there is no unit this file could
// reuse from that code without implying a coupling that does not exist.
// Reconciling the two representations (if ever needed) is explicitly a
// future integration's concern — see "THIS FILE STILL RESOLVES NO
// CAPABILITY DESCRIPTOR..." below.
//
//   AvatarMovementSteeringKind.INSTANT      — heading reaches its
//       requested value immediately; `steeringRate` carries no rate to
//       apply and is REQUIRED to be exactly `0` — never a placeholder for
//       "very fast," a genuinely different meaning from RATE_LIMITED's
//       own `0`, which is why RATE_LIMITED forbids `0` outright (see
//       below).
//   AvatarMovementSteeringKind.RATE_LIMITED — heading approaches its
//       requested value over time, at the radians/second rate
//       `steeringRate` names. Always a genuine, strictly positive number.
//
// WALK IS `INSTANT`, NEVER A LARGE `RATE_LIMITED` NUMBER STANDING IN FOR
// IT — AND, CRUCIALLY, WALK'S OWN EXISTING TURN BEHAVIOR IS COMPLETELY
// UNCHANGED BY THIS MILESTONE. The avatar's own on-foot turning
// (`core/AvatarMovementSimulation.js`'s own `TURN_RATE_DEGREES_PER_SECOND`,
// unchanged since long before this milestone) already turns the avatar in
// place, keyboard-driven, every tick — this file gives that EXISTING
// behavior a name (`AvatarMovementSteeringKind.INSTANT`) in the NEW
// vocabulary this milestone introduces, exactly as `AvatarMovementAccelerationKind
// .INSTANT` already named WALK's own existing "reaches movementSpeed in
// one tick" behavior (0.9.90) without changing a single line of how it
// actually moves. Nothing about WALK's `rotationY`/`TURN_RATE_DEGREES_PER_SECOND`
// advance is read, called, or altered by this file, or by this milestone
// at all — see core/AvatarMovementSteeringSimulation.js's own header for
// the pure math this INSTANT/RATE_LIMITED distinction eventually feeds,
// and why WALK has no reason to ever reach it.
//
// STEERING IS AN INDEPENDENT DIMENSION FROM `movementSpeed`,
// `acceleration`, AND `braking` — A FASTER VEHICLE, OR ONE THAT
// ACCELERATES OR BRAKES QUICKLY, DOES NOT AUTOMATICALLY STEER FASTER, OR
// SLOWER. Unlike `movementSpeed`/`collisionRadius` (0.9.87/0.9.88), which
// both satisfy the strict `WALK < BICYCLE < MOTORCYCLE < CAR` ordering,
// this milestone deliberately asserts NO analogous ordering for
// `steeringRate`, and deliberately does not derive it from `acceleration`/
// `braking`/`movementSpeed` by any formula — each is its own,
// independently chosen constant. `tests/AvatarVehicleMovementCapability.test.js`
// asserts each defined capability's own `steering` is well-formed, never
// that it follows any sibling field's own ordering.
//
// STEERING RATE IS NOT PROPORTIONAL TO SPEED. A real vehicle's actual
// turning circle typically narrows as it slows and widens as it
// accelerates — this file takes no position on that relationship at all.
// `steeringRate` is a single, constant-per-capability number, never a
// function of a transient current/target speed. That relationship, if
// ever modeled, is explicit future scope — see this file's own "Deliberately
// excluded" list below.
//
// AERIAL_VEHICLE/DRONE's own `steering` is `AvatarMovementSteeringKind.INSTANT`
// with rate `0` — the SAME shared value WALK uses, reused rather than
// duplicated because both genuinely mean "no rate applies," even though
// for different reasons: WALK because on-foot turning has always been
// instantaneous key-driven rotation; DRONE only inertly, because
// `supported: false` already blocks movement, steering included, before
// this field is ever consulted (see
// `application/AvatarMovementController.js`'s own 0.9.85 `tick()` guard) —
// the identical reason its own `movementSpeed`/`collisionRadius`/
// `movementDirections`/`acceleration`/`braking` are already inert.
//
// THIS FILE STILL RESOLVES NO CAPABILITY DESCRIPTOR ON ITS OWN, AND NEVER
// SIMULATES A SINGLE TICK OF TURNING. Exactly like
// core/AvatarMovementAccelerationCapability.js/
// core/AvatarMovementBrakingCapability.js, this is a pure, immutable,
// getter-only, frozen value vocabulary — deciding WHICH vehicle
// relationship implies WHICH `AvatarMovementSteeringCapability` is
// core/AvatarVehicleMovementCapability.js's own job (see that file's own
// 0.9.93 header); deciding what a "current heading" or "requested
// heading" even IS — and simulating a tick of turning between them — is
// core/AvatarMovementSteeringSimulation.js's own job (see that file's own
// header). This file only ever answers "how quickly can THIS capability
// turn, when asked to."
//
// Deliberately excluded, matching this milestone's own brief: vehicle
// orientation state of any kind (a current heading is transient
// CONTROLLER state, never capability data — the direct structural twin of
// `acceleration`'s own "no current/transient speed" exclusion, see
// core/AvatarMovementAccelerationCapability.js's own header), turning
// radius, Ackermann steering geometry, bicycle/motorcycle lean, tire
// friction, lateral acceleration, drift/skid behavior, speed-proportional
// steering, terrain-dependent steering, camera rotation, animation, wheel
// rotation, drone flight steering, keyboard/input binding of any kind, and
// a second per-vehicle capability-kind vocabulary. See docs/Roadmap.md,
// 0.9.93.
export const AvatarMovementSteeringKind = Object.freeze({
    INSTANT: 'instant',
    RATE_LIMITED: 'rate_limited'
});

export function isValidAvatarMovementSteeringKind(value) {
    return Object.values(AvatarMovementSteeringKind).includes(value);
}

export class AvatarMovementSteeringCapability {
    constructor(kind, steeringRate) {
        if (!isValidAvatarMovementSteeringKind(kind)) {
            throw new Error(`AvatarMovementSteeringCapability requires a valid AvatarMovementSteeringKind, got ${JSON.stringify(kind)}`);
        }
        if (typeof steeringRate !== 'number' || !Number.isFinite(steeringRate) || steeringRate < 0) {
            throw new Error(`AvatarMovementSteeringCapability requires a finite, non-negative steeringRate, got ${JSON.stringify(steeringRate)}`);
        }
        if (kind === AvatarMovementSteeringKind.INSTANT && steeringRate !== 0) {
            throw new Error(`AvatarMovementSteeringCapability of kind INSTANT requires steeringRate to be exactly 0 (see this file's own header), got ${JSON.stringify(steeringRate)}`);
        }
        if (kind === AvatarMovementSteeringKind.RATE_LIMITED && steeringRate === 0) {
            throw new Error('AvatarMovementSteeringCapability of kind RATE_LIMITED requires a strictly positive steeringRate — 0 is reserved for INSTANT (see this file\'s own header)');
        }
        this._kind = kind;
        this._steeringRate = steeringRate;
        Object.freeze(this);
    }

    // Which of the two strategies this capability's turning follows — see
    // this file's own header. Never re-derived from `steeringRate` by a
    // caller; always read directly, so the ONE place that distinction is
    // made is this field.
    get kind() { return this._kind; }
    // The rate (radians/second) RATE_LIMITED turning approaches a
    // requested heading at, or the inert `0` INSTANT is required to
    // carry — see this file's own header. Always a finite number >= 0,
    // never undefined/NaN.
    get steeringRate() { return this._steeringRate; }

    toJSON() {
        return { kind: this._kind, steeringRate: this._steeringRate };
    }

    static fromJSON(json) {
        return new AvatarMovementSteeringCapability(json.kind, json.steeringRate);
    }
}

export function isValidAvatarMovementSteeringCapability(value) {
    return value instanceof AvatarMovementSteeringCapability
        && isValidAvatarMovementSteeringKind(value.kind)
        && typeof value.steeringRate === 'number'
        && Number.isFinite(value.steeringRate)
        && value.steeringRate >= 0;
}
