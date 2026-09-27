import { deriveTouchJoystickKeys } from '../../core/TouchJoystickKeys.js';

// Turns the World View touch pad (a joystick and held buttons) into the same
// key presses a keyboard sends, through `keyDown(key)`/`keyUp(key)` (the
// session's avatarKeyDown/avatarKeyUp). It sends a key only when its held state
// changes, so the session sees one keydown per press, as from a real key.
//
// Each key records which sources (the joystick, each button) hold it, so one
// source letting go never releases a key another still holds.
//
// The session samples Jump, Mount ('e'), Store ('q') and Catch ('f') once per
// frame, so a button stays down for at least BUTTON_MIN_HOLD_MS: a quick tap
// released within one frame would otherwise never be seen.

export const BUTTON_MIN_HOLD_MS = 120;

const JOYSTICK_KEYS = Object.freeze({ forward: 'w', backward: 's', left: 'a', right: 'd', running: 'Shift' });

const JOYSTICK_SOURCE = 'joystick';

const defaultClock = {
    now: () => Date.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id)
};

function buttonSource(key) {
    return `button:${key}`;
}

export class TouchMovementInput {
    constructor({ keyDown, keyUp, clock = defaultClock }) {
        this._keyDown = keyDown;
        this._keyUp = keyUp;
        this._clock = clock;
        // key -> Set of sources holding it
        this._holders = new Map();
        // key -> { heldAt, releaseTimer } for buttons
        this._buttons = new Map();
    }

    // `dx`/`dy` are the finger's offset from the joystick's centre in pixels.
    setJoystick({ dx, dy, radius }) {
        const keys = deriveTouchJoystickKeys({ dx, dy, radius });
        for (const [direction, key] of Object.entries(JOYSTICK_KEYS)) {
            if (keys[direction]) {
                this._hold(key, JOYSTICK_SOURCE);
            } else {
                this._release(key, JOYSTICK_SOURCE);
            }
        }
    }

    releaseJoystick() {
        for (const key of Object.values(JOYSTICK_KEYS)) {
            this._release(key, JOYSTICK_SOURCE);
        }
    }

    // A button held down, like Jump or Brake.
    holdButton(key) {
        const button = this._buttons.get(key);
        if (button && button.releaseTimer !== null) {
            this._clock.clearTimeout(button.releaseTimer);
        }
        this._buttons.set(key, { heldAt: this._clock.now(), releaseTimer: null });
        this._hold(key, buttonSource(key));
    }

    releaseButton(key) {
        const button = this._buttons.get(key);
        if (!button || button.releaseTimer !== null) {
            return;
        }
        const remaining = BUTTON_MIN_HOLD_MS - (this._clock.now() - button.heldAt);
        if (remaining <= 0) {
            this._buttons.delete(key);
            this._release(key, buttonSource(key));
            return;
        }
        button.releaseTimer = this._clock.setTimeout(() => {
            this._buttons.delete(key);
            this._release(key, buttonSource(key));
        }, remaining);
    }

    // A single press, like Mount or Catch.
    tapButton(key) {
        this.holdButton(key);
        this.releaseButton(key);
    }

    // Lets go of everything at once, e.g. when the pad closes mid-press, so no
    // key stays stuck down in the session.
    releaseAll() {
        for (const button of this._buttons.values()) {
            if (button.releaseTimer !== null) {
                this._clock.clearTimeout(button.releaseTimer);
            }
        }
        this._buttons.clear();
        for (const key of [...this._holders.keys()]) {
            this._holders.delete(key);
            this._keyUp(key);
        }
    }

    heldKeys() {
        return [...this._holders.keys()];
    }

    _hold(key, source) {
        const holders = this._holders.get(key);
        if (holders) {
            holders.add(source);
            return;
        }
        this._holders.set(key, new Set([source]));
        this._keyDown(key);
    }

    _release(key, source) {
        const holders = this._holders.get(key);
        if (!holders || !holders.delete(source)) {
            return;
        }
        if (holders.size === 0) {
            this._holders.delete(key);
            this._keyUp(key);
        }
    }
}
