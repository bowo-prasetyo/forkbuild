// 0.9.89 — Vehicle Movement Direction Semantics.
//
// core/AvatarVehicleMovementCapability.js already answers "how fast" (0.9.86/
// 0.9.87) and "how much space" (0.9.88) a mounted vehicle relationship
// implies. Both are single numbers. This milestone answers a third,
// smaller question that same descriptor has never carried an opinion on
// at all: which of the two directions the avatar's own existing
// forward/backward input (W/S, and their continuous-movement equivalent —
// see core/AvatarContinuousMovementIntent.js) is currently allowed to
// produce.
//
// A SMALL, CLOSED, TWO-FIELD VALUE — NOT A MODE, NOT A STATE MACHINE. This
// is deliberately not named `VehicleMovementMode`, and deliberately not
// shaped like core/AvatarContinuousMovementMode.js (a vocabulary with a
// transition function). There is nothing here for anything to transition
// between: `forward`/`backward` are each just "is this direction
// currently a legal output of this capability," decided once, at
// resolution time, by core/AvatarVehicleMovementCapability.js — never
// something that changes tick-to-tick the way a continuous-movement mode
// does. See that file's own header for the exact distinction this
// milestone exists to draw: "movement MODE describes how the user
// requests movement; movement CAPABILITY describes what the current
// physical capability permits." This file is the capability half.
//
// LEFT/RIGHT ARE DELIBERATELY NOT HERE. The existing movement system
// already resolves turning (A/D — `AvatarMovementState.turnAxis`)
// completely independently of forward/backward — see
// core/AvatarMovementState.js's own header on why turn-then-step is kept
// as two separate axes, never one combined vector. Nothing about a
// vehicle relationship has ever needed to constrain turning, and this
// milestone introduces no reason to start; inventing a `left`/`right`
// pair nothing yet reads would be exactly the kind of speculative shape
// this codebase's own roadmap repeatedly warns against (see e.g.
// core/VehicleType.js's own header on not guessing a vocabulary's shape
// before a real consumer needs it).
//
// A FULLY-FORMED VALUE, NEVER A CONDITIONALLY-ABSENT ONE — matching
// `movementSpeed`/`collisionRadius`'s own discipline
// (core/AvatarVehicleMovementCapability.js). Both fields are required,
// always booleans, never `undefined`/`null`; there is no "direction
// capability not yet decided" state for a resolved
// AvatarVehicleMovementCapability to be in.
//
// Deliberately excluded: acceleration, braking, momentum, turning,
// steering radius, vehicle orientation, strafing, a third "sideways"
// axis, animation, camera, persistence, networking. See
// docs/Roadmap.md, 0.9.89.
export class AvatarMovementDirectionCapability {
    constructor(forward, backward) {
        if (typeof forward !== 'boolean') {
            throw new Error(`AvatarMovementDirectionCapability requires a boolean forward, got ${JSON.stringify(forward)}`);
        }
        if (typeof backward !== 'boolean') {
            throw new Error(`AvatarMovementDirectionCapability requires a boolean backward, got ${JSON.stringify(backward)}`);
        }
        this._forward = forward;
        this._backward = backward;
        Object.freeze(this);
    }

    // Whether ordinary forward input (W, or a persistent continuous
    // FORWARD intent) is currently a legal output of this capability.
    get forward() { return this._forward; }
    // The direct structural twin of `forward` above, for backward
    // input (S, or a persistent continuous BACKWARD intent).
    get backward() { return this._backward; }

    toJSON() {
        return { forward: this._forward, backward: this._backward };
    }

    static fromJSON(json) {
        return new AvatarMovementDirectionCapability(json.forward, json.backward);
    }
}

export function isValidAvatarMovementDirectionCapability(value) {
    return value instanceof AvatarMovementDirectionCapability
        && typeof value.forward === 'boolean'
        && typeof value.backward === 'boolean';
}
