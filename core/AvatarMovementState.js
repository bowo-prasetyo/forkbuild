// 0.2.36 — a pure snapshot of a player's CURRENT movement INTENT,
// built once per simulation tick from whatever input device is in
// use (keyboard today — see application/AvatarMovementController.js
// — a gamepad or touch stick later would produce the exact same
// shape). This is deliberately NOT keyboard state: nothing here knows
// what a "key" is, and nothing here is a `sequence`-bearing fact
// about where the avatar actually is. See docs/Principles.md,
// "AvatarPresence Is The Result Of Simulation, Not The Simulation
// Itself" — AvatarMovementState is the INPUT to that simulation
// (core/AvatarMovementSimulation.js), never written to
// AvatarPresence, never persisted, never sent anywhere.
//
// forwardAxis/turnAxis are the two independent inputs W/S and A/D
// produce — kept as two separate numbers, not combined into one
// vector, because the simulation needs to turn-then-move (rotate
// facing first, then step along the NEW facing) to read as an
// ordinary third-person walk rather than strafing.
//
// 0.9.92 — Vehicle Braking and Coasting Semantics. `brakingRequested`
// (a boolean, default `false`) is the ONE new fact this milestone adds:
// the direct structural twin of `jumpRequested` — a snapshot of INTENT
// ("is the player asking to brake, right now"), never itself a speed, a
// rate, or a vehicle. See core/AvatarMovementSimulation.js's own 0.9.92
// header for where this fact is actually consulted, and
// core/AvatarMovementAccelerationSimulation.js's own 0.9.92 header for
// what it changes about how speed is resolved.
//
// DELIBERATELY NOT BOUND TO ANY KEY, AS OF 0.9.92. Unlike `jumpRequested`
// (Space, wired since 0.2.36), nothing in application/AvatarMovementController.js
// ever sets `brakingRequested` true — see that file's own header for why
// deciding WHICH user action produces this fact is deliberately left to
// a future input milestone. Constructing an `AvatarMovementState` with
// `brakingRequested: true` directly (as this milestone's own tests do)
// is, for now, the only way this fact is ever true.
export class AvatarMovementState {
    constructor({ forwardAxis = 0, turnAxis = 0, running = false, jumpRequested = false, brakingRequested = false } = {}) {
        this.forwardAxis = clampAxis(forwardAxis);
        this.turnAxis = clampAxis(turnAxis);
        this.running = Boolean(running);
        this.jumpRequested = Boolean(jumpRequested);
        this.brakingRequested = Boolean(brakingRequested);
    }

    // Whether this snapshot represents any player-driven locomotion
    // intent at all — turning alone counts, matching the design doc's
    // "moving" concept. core/AvatarMovementSimulation.js still
    // resolves WALKING/RUNNING specifically from forwardAxis: turning
    // in place, alone, is not a walk cycle.
    get moving() {
        return this.forwardAxis !== 0 || this.turnAxis !== 0;
    }

    // A one-word summary of intended speed, mirroring the design
    // doc's own vocabulary. The actual numeric speed (world units per
    // second) is a simulation constant, not input state, so it lives
    // in core/AvatarMovementSimulation.js rather than being
    // duplicated here.
    get speedMode() {
        if (this.forwardAxis === 0) return 'idle';
        return this.running ? 'run' : 'walk';
    }

    static idle() {
        return new AvatarMovementState();
    }
}

function clampAxis(value) {
    if (value > 0) return 1;
    if (value < 0) return -1;
    return 0;
}
