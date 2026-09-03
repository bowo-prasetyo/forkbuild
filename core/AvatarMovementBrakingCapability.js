// 0.9.92 — Vehicle Braking Capability: the direct structural twin of
// core/AvatarMovementAccelerationCapability.js, one milestone later,
// for the SECOND rate this milestone introduces. That file's own
// closing paragraph already named this as explicit future scope:
// "braking, coasting, ... deliberately excluded ... until a future
// milestone gives braking its own, independently-tunable number." This
// is that future milestone, and this file is that number's own small,
// closed vocabulary — nothing more.
//
//   Acceleration determines how quickly speed approaches a HIGHER
//   requested speed. Braking determines how quickly speed approaches a
//   LOWER requested speed WHEN BRAKING IS EXPLICITLY REQUESTED. Neither
//   is coasting — coasting is simply the accelerating case applied to a
//   target of 0 (see core/AvatarMovementAccelerationSimulation.js's own
//   0.9.92 header), never a third rate.
//
// SAME SHAPE, SAME INVARIANT, AS AvatarMovementAccelerationCapability —
// DELIBERATELY. `kind` (`AvatarMovementBrakingKind.INSTANT` or
// `.RATE_LIMITED`) and `braking` (world units/second^2) are both
// required, and the identical coupling invariant applies: INSTANT
// requires `braking === 0` exactly; RATE_LIMITED forbids `braking === 0`
// (a rate-limited capability that never actually changes speed is a
// contradiction, not a valid third state — see
// core/AvatarMovementAccelerationCapability.js's own header for the
// full argument, unchanged here). A SECOND, textually similar
// enum/class rather than reusing `AvatarMovementAccelerationKind`/
// `AvatarMovementAccelerationCapability` directly is a deliberate
// decoupling, not an oversight — the exact same "independently
// declared, documented as required to parallel its sibling" discipline
// core/AvatarVehicleMovementCapability.js's own WALK_MOVEMENT_SPEED/
// WALK_COLLISION_RADIUS already established: acceleration and braking
// are two independent capability dimensions (see this file's own
// consumer, core/AvatarVehicleMovementCapability.js, for why CAR's own
// braking rate is not derived from its acceleration rate, or vice
// versa), and coupling their vocabularies would make that independence
// harder to see, not easier.
//
// BRAKING DOES NOT ALTER MAXIMUM SPEED. This class carries no notion of
// `movementSpeed` at all — braking only ever changes HOW QUICKLY a
// resolved target speed is approached from above, never WHAT that
// target speed is. `core/AvatarVehicleMovementCapability.js`'s own
// `movementSpeed` field is completely untouched by this milestone.
//
// INERT BRAKING VALUE, MATCHING ACCELERATION'S OWN. WALK's own braking
// is `INSTANT`/`0` — on-foot movement has always stopped the instant
// forward input is released (there has never been any notion of a
// pedestrian "braking"), so this is simply WALK's own existing INSTANT
// behavior, named explicitly, exactly like WALK's own acceleration
// already is. AERIAL_VEHICLE/DRONE reuses the identical `INSTANT`/`0`
// value for the identical reason its own acceleration already does:
// `supported: false` blocks movement, braking included, before this
// field is ever consulted.
//
// THIS FILE STILL RESOLVES NO CAPABILITY DESCRIPTOR ON ITS OWN, AND
// NEVER SIMULATES A SINGLE TICK. Exactly like
// core/AvatarMovementAccelerationCapability.js, this is a pure,
// immutable, getter-only, frozen value vocabulary — deciding WHICH
// vehicle relationship implies WHICH `AvatarMovementBrakingCapability`
// is core/AvatarVehicleMovementCapability.js's own job (see that file's
// own 0.9.92 header); deciding WHETHER a tick is actually braking at all
// (an explicit `brakingRequested` fact) is
// core/AvatarMovementState.js's/core/AvatarMovementSimulation.js's own
// job (see each file's own 0.9.92 header). This file only ever answers
// "how quickly does THIS capability slow down, when asked to."
//
// Deliberately excluded, as of 0.9.92: coasting, friction, drag,
// momentum, a `brakingRequested` fact of any kind (that is transient,
// per-tick INPUT, never capability data — see
// core/AvatarMovementState.js's own header), a target speed (still
// `movementSpeed`, resolved elsewhere), turning, steering, vehicle
// orientation, animation, camera, persistence, networking, and a second
// per-vehicle capability-kind vocabulary. See docs/Roadmap.md, 0.9.92.
export const AvatarMovementBrakingKind = Object.freeze({
    INSTANT: 'instant',
    RATE_LIMITED: 'rate_limited'
});

export function isValidAvatarMovementBrakingKind(value) {
    return Object.values(AvatarMovementBrakingKind).includes(value);
}

export class AvatarMovementBrakingCapability {
    constructor(kind, braking) {
        if (!isValidAvatarMovementBrakingKind(kind)) {
            throw new Error(`AvatarMovementBrakingCapability requires a valid AvatarMovementBrakingKind, got ${JSON.stringify(kind)}`);
        }
        if (typeof braking !== 'number' || !Number.isFinite(braking) || braking < 0) {
            throw new Error(`AvatarMovementBrakingCapability requires a finite, non-negative braking, got ${JSON.stringify(braking)}`);
        }
        if (kind === AvatarMovementBrakingKind.INSTANT && braking !== 0) {
            throw new Error(`AvatarMovementBrakingCapability of kind INSTANT requires braking to be exactly 0 (see this file's own "INERT BRAKING VALUE" header), got ${JSON.stringify(braking)}`);
        }
        if (kind === AvatarMovementBrakingKind.RATE_LIMITED && braking === 0) {
            throw new Error('AvatarMovementBrakingCapability of kind RATE_LIMITED requires a strictly positive braking — 0 is reserved for INSTANT (see this file\'s own "INERT BRAKING VALUE" header)');
        }
        this._kind = kind;
        this._braking = braking;
        Object.freeze(this);
    }

    // Which of the two strategies this capability's braking follows —
    // see this file's own header. Never re-derived from `braking` by a
    // caller; always read directly, so the ONE place that distinction is
    // made is this field.
    get kind() { return this._kind; }
    // The rate (world units/second^2) RATE_LIMITED braking approaches a
    // lower target speed at when explicitly requested, or the inert `0`
    // INSTANT is required to carry — see "INERT BRAKING VALUE" above.
    // Always a finite number >= 0, never undefined/NaN.
    get braking() { return this._braking; }

    toJSON() {
        return { kind: this._kind, braking: this._braking };
    }

    static fromJSON(json) {
        return new AvatarMovementBrakingCapability(json.kind, json.braking);
    }
}

export function isValidAvatarMovementBrakingCapability(value) {
    return value instanceof AvatarMovementBrakingCapability
        && isValidAvatarMovementBrakingKind(value.kind)
        && typeof value.braking === 'number'
        && Number.isFinite(value.braking)
        && value.braking >= 0;
}
