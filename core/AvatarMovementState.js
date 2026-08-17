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
export class AvatarMovementState {
    constructor({ forwardAxis = 0, turnAxis = 0, running = false, jumpRequested = false } = {}) {
        this.forwardAxis = clampAxis(forwardAxis);
        this.turnAxis = clampAxis(turnAxis);
        this.running = Boolean(running);
        this.jumpRequested = Boolean(jumpRequested);
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
