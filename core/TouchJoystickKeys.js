// Maps an on-screen joystick's thumb offset to the avatar's movement keys, so
// touch input drives the same W/A/S/D/Shift path as a keyboard and never a
// second movement model. Screen y grows downward: pushing up means forward.

// Below this fraction of the radius the thumb is resting, so nothing is held.
export const TOUCH_JOYSTICK_DEAD_ZONE = 0.25;

// At or beyond this fraction the avatar runs, as if Shift were held.
export const TOUCH_JOYSTICK_RUN_THRESHOLD = 0.9;

// sin(22.5°): an axis counts once the push is within 67.5° of it, which splits
// the circle into eight equal sectors (four straight, four diagonal).
const AXIS_THRESHOLD = Math.sin(Math.PI / 8);

const NONE = Object.freeze({ forward: false, backward: false, left: false, right: false, running: false });

export function deriveTouchJoystickKeys({ dx, dy, radius }) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(radius) || radius <= 0) {
        return NONE;
    }
    const distance = Math.hypot(dx, dy);
    const magnitude = Math.min(1, distance / radius);
    if (magnitude < TOUCH_JOYSTICK_DEAD_ZONE) {
        return NONE;
    }
    const nx = dx / distance;
    const ny = dy / distance;
    return Object.freeze({
        forward: -ny > AXIS_THRESHOLD,
        backward: ny > AXIS_THRESHOLD,
        left: -nx > AXIS_THRESHOLD,
        right: nx > AXIS_THRESHOLD,
        running: magnitude >= TOUCH_JOYSTICK_RUN_THRESHOLD
    });
}

// The thumb's drawn offset: the finger's offset, kept inside the base.
export function clampTouchJoystickOffset({ dx, dy, radius }) {
    const distance = Math.hypot(dx, dy);
    if (!Number.isFinite(distance) || distance <= radius || distance === 0) {
        return { dx: Number.isFinite(dx) ? dx : 0, dy: Number.isFinite(dy) ? dy : 0 };
    }
    const scale = radius / distance;
    return { dx: dx * scale, dy: dy * scale };
}
