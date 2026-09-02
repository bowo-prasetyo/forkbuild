// 0.9.90 — Vehicle Acceleration Capability.
//
// core/AvatarVehicleMovementCapability.js already answers "how fast" a
// mounted vehicle relationship implies (0.9.86/0.9.87 — `movementSpeed`,
// a single number), "how much space" it occupies (0.9.88 —
// `collisionRadius`), and "which directions" it permits (0.9.89 —
// `movementDirections`). All three are STATELESS: capability -> value,
// resolved once, with no notion of time or of "where movement currently
// is on its way to `movementSpeed`." This milestone answers a fourth,
// genuinely different question that descriptor has never carried an
// opinion on: HOW QUICKLY movement reaches that speed, rather than
// simply being AT it or not.
//
//   0.9.87 defined how fast a vehicle can move. 0.9.90 defines how
//   quickly it can reach that speed.
//
// A SMALL, CLOSED, TWO-FIELD VALUE — THE DIRECT STRUCTURAL TWIN OF
// core/AvatarMovementDirectionCapability.js. Same posture: immutable,
// getter-only, frozen, deterministic, a fully-formed value never
// conditionally absent. `kind` and `acceleration` are BOTH required
// because both are genuinely needed by the next consumer (see
// core/AvatarMovementAccelerationSimulation.js's own header) — this file's
// own design brief explicitly warns against introducing a `kind`
// alongside a numeric value "unless the distinction is actually needed,"
// and here it is: a future integration must be able to tell "this
// capability moves instantaneously, ignore the number" apart from "this
// capability is rate-limited, USE the number" without ever inspecting
// which vehicle produced it.
//
// NO ARBITRARY "999" VALUE FOR WALK. An earlier shape for this milestone
// considered a single `acceleration` number alone, with WALK given some
// very large placeholder (999, Infinity, ...) to fake "reaches full
// speed immediately." That would have been exactly the kind of invented,
// undocumented magic number this codebase's own roadmap repeatedly
// avoids (see core/AvatarVehicleMovementCapability.js's own header on
// WALK_MOVEMENT_SPEED/WALK_COLLISION_RADIUS being deliberately-documented
// duplicates, never guesses). `AvatarMovementAccelerationKind.INSTANT`
// says outright, in the vocabulary itself, "this capability's movement
// is not rate-limited at all" — WALK's own existing behavior, completely
// unchanged since long before this milestone — rather than asking a
// numeric field to imply it by being implausibly huge.
//
//   AvatarMovementAccelerationKind.INSTANT      — movement reaches its
//       target speed immediately; `acceleration` carries no rate to
//       apply and is REQUIRED to be exactly `0` (see "INERT ACCELERATION
//       VALUE" below) — never a placeholder for "very fast," a genuinely
//       different meaning from RATE_LIMITED's own `0`, which is why
//       RATE_LIMITED forbids `0` outright (see below).
//   AvatarMovementAccelerationKind.RATE_LIMITED — movement approaches
//       its target speed over time, at the world-units/second^2 rate
//       `acceleration` names. Always a genuine, strictly positive
//       number: a RATE_LIMITED capability that never actually changes
//       speed is a contradiction in terms, not a valid third state.
//
// INERT ACCELERATION VALUE, MATCHING EVERY SIBLING FIELD'S OWN INERT-0
// DISCIPLINE. `movementSpeed`/`collisionRadius` (0.9.86/0.9.88) each use
// `0` as AERIAL_VEHICLE/DRONE's own inert filler — never actually read,
// because `supported: false` already blocks movement first (see that
// file's own headers). This file's `acceleration` reuses the identical
// `0`, but ONLY paired with `kind: INSTANT` — enforced by the
// constructor itself, not left to convention — because an unpaired bare
// `0` is genuinely ambiguous for THIS field in a way it never was for
// the others: "0 units/second^2" would otherwise read as "this vehicle
// literally never changes speed," the opposite of "changes speed
// immediately." Tying the inert value to the one kind that actually
// means "the number does not apply" removes that ambiguity at
// construction time, for every caller, forever.
//
// Deliberately excluded, matching this milestone's own brief: braking,
// coasting, friction, drag, momentum, reverse-acceleration asymmetry,
// current/transient speed of any kind (that is transient CONTROLLER
// state, never capability data — see
// core/AvatarMovementAccelerationSimulation.js's own header), a target
// speed (that is `movementSpeed`, already resolved elsewhere), turning,
// steering, vehicle orientation, animation, camera, persistence,
// networking, and a second per-vehicle capability-kind vocabulary. See
// docs/Roadmap.md, 0.9.90.
export const AvatarMovementAccelerationKind = Object.freeze({
    INSTANT: 'instant',
    RATE_LIMITED: 'rate_limited'
});

export function isValidAvatarMovementAccelerationKind(value) {
    return Object.values(AvatarMovementAccelerationKind).includes(value);
}

export class AvatarMovementAccelerationCapability {
    constructor(kind, acceleration) {
        if (!isValidAvatarMovementAccelerationKind(kind)) {
            throw new Error(`AvatarMovementAccelerationCapability requires a valid AvatarMovementAccelerationKind, got ${JSON.stringify(kind)}`);
        }
        if (typeof acceleration !== 'number' || !Number.isFinite(acceleration) || acceleration < 0) {
            throw new Error(`AvatarMovementAccelerationCapability requires a finite, non-negative acceleration, got ${JSON.stringify(acceleration)}`);
        }
        if (kind === AvatarMovementAccelerationKind.INSTANT && acceleration !== 0) {
            throw new Error(`AvatarMovementAccelerationCapability of kind INSTANT requires acceleration to be exactly 0 (see this file's own "INERT ACCELERATION VALUE" header), got ${JSON.stringify(acceleration)}`);
        }
        if (kind === AvatarMovementAccelerationKind.RATE_LIMITED && acceleration === 0) {
            throw new Error('AvatarMovementAccelerationCapability of kind RATE_LIMITED requires a strictly positive acceleration — 0 is reserved for INSTANT (see this file\'s own "INERT ACCELERATION VALUE" header)');
        }
        this._kind = kind;
        this._acceleration = acceleration;
        Object.freeze(this);
    }

    // Which of the two strategies this capability's movement follows —
    // see this file's own header. Never re-derived from `acceleration`
    // by a caller (e.g. "acceleration === 0 means instant"); always read
    // directly, so the ONE place that distinction is made is this field.
    get kind() { return this._kind; }
    // The rate (world units/second^2) RATE_LIMITED movement approaches
    // its target speed at, or the inert `0` INSTANT is required to carry
    // — see "INERT ACCELERATION VALUE" above. Always a finite number
    // >= 0, never undefined/NaN.
    get acceleration() { return this._acceleration; }

    toJSON() {
        return { kind: this._kind, acceleration: this._acceleration };
    }

    static fromJSON(json) {
        return new AvatarMovementAccelerationCapability(json.kind, json.acceleration);
    }
}

export function isValidAvatarMovementAccelerationCapability(value) {
    return value instanceof AvatarMovementAccelerationCapability
        && isValidAvatarMovementAccelerationKind(value.kind)
        && typeof value.acceleration === 'number'
        && Number.isFinite(value.acceleration)
        && value.acceleration >= 0;
}
