import {
    deriveTouchJoystickKeys, clampTouchJoystickOffset, TOUCH_JOYSTICK_DEAD_ZONE, TOUCH_JOYSTICK_RUN_THRESHOLD
} from '../core/TouchJoystickKeys.js';
import { TouchMovementInput, BUTTON_MIN_HOLD_MS } from '../application/avatar/TouchMovementInput.js';
import { assert } from './support/Assert.js';

function pressed(keys) {
    return ['forward', 'backward', 'left', 'right', 'running'].filter((k) => keys[k]).join(',');
}

// 1. Joystick directions: eight sectors, screen y down is backward.
{
    const r = 50;
    assert(pressed(deriveTouchJoystickKeys({ dx: 0, dy: -30, radius: r })) === 'forward', 'up is forward');
    assert(pressed(deriveTouchJoystickKeys({ dx: 0, dy: 30, radius: r })) === 'backward', 'down is backward');
    assert(pressed(deriveTouchJoystickKeys({ dx: -30, dy: 0, radius: r })) === 'left', 'left is left');
    assert(pressed(deriveTouchJoystickKeys({ dx: 30, dy: 0, radius: r })) === 'right', 'right is right');
    assert(pressed(deriveTouchJoystickKeys({ dx: 21, dy: -21, radius: r })) === 'forward,right', 'up-right diagonal');
    assert(pressed(deriveTouchJoystickKeys({ dx: -21, dy: 21, radius: r })) === 'backward,left', 'down-left diagonal');
    // 10° off straight up stays a single key.
    const a = (10 * Math.PI) / 180;
    assert(pressed(deriveTouchJoystickKeys({ dx: 30 * Math.sin(a), dy: -30 * Math.cos(a), radius: r })) === 'forward',
        'slightly off-axis stays straight');
    console.log('✓ joystick directions');
}

// 2. Dead zone, run threshold and bad input.
{
    const r = 100;
    assert(pressed(deriveTouchJoystickKeys({ dx: 0, dy: -(TOUCH_JOYSTICK_DEAD_ZONE * r - 1), radius: r })) === '',
        'inside the dead zone nothing is held');
    assert(pressed(deriveTouchJoystickKeys({ dx: 0, dy: -(TOUCH_JOYSTICK_RUN_THRESHOLD * r - 1), radius: r })) === 'forward',
        'below the run threshold it walks');
    assert(pressed(deriveTouchJoystickKeys({ dx: 0, dy: -(TOUCH_JOYSTICK_RUN_THRESHOLD * r), radius: r })) === 'forward,running',
        'at the run threshold it runs');
    assert(pressed(deriveTouchJoystickKeys({ dx: 0, dy: -500, radius: r })) === 'forward,running', 'beyond the rim still runs');
    assert(pressed(deriveTouchJoystickKeys({ dx: NaN, dy: 0, radius: r })) === '', 'NaN holds nothing');
    assert(pressed(deriveTouchJoystickKeys({ dx: 10, dy: 0, radius: 0 })) === '', 'zero radius holds nothing');
    console.log('✓ dead zone and run threshold');
}

// 3. The drawn thumb stays inside the base.
{
    const inside = clampTouchJoystickOffset({ dx: 3, dy: 4, radius: 10 });
    assert(inside.dx === 3 && inside.dy === 4, 'inside offsets are unchanged');
    const outside = clampTouchJoystickOffset({ dx: 30, dy: 40, radius: 10 });
    assert(Math.abs(outside.dx - 6) < 1e-9 && Math.abs(outside.dy - 8) < 1e-9, 'outside offsets are pulled to the rim');
    console.log('✓ thumb clamp');
}

function fakeClock() {
    let time = 0;
    let nextId = 1;
    const timers = new Map();
    return {
        now: () => time,
        setTimeout: (fn, ms) => { const id = nextId++; timers.set(id, { fn, at: time + ms }); return id; },
        clearTimeout: (id) => { timers.delete(id); },
        advance(ms) {
            time += ms;
            for (const [id, timer] of [...timers]) {
                if (timer.at <= time) {
                    timers.delete(id);
                    timer.fn();
                }
            }
        }
    };
}

function recorder() {
    const events = [];
    return { events, keyDown: (key) => events.push(`+${key}`), keyUp: (key) => events.push(`-${key}`) };
}

// 4. The joystick sends a key only when its held state changes.
{
    const rec = recorder();
    const input = new TouchMovementInput({ ...rec, clock: fakeClock() });
    input.setJoystick({ dx: 0, dy: -30, radius: 50 });
    input.setJoystick({ dx: 0, dy: -35, radius: 50 });
    assert(rec.events.join(' ') === '+w', `one keydown for a held direction, got ${rec.events.join(' ')}`);
    input.setJoystick({ dx: 21, dy: -21, radius: 50 });
    assert(rec.events.join(' ') === '+w +d', 'turning to the diagonal adds only D');
    input.setJoystick({ dx: 0, dy: -50, radius: 50 });
    assert(rec.events.join(' ') === '+w +d -d +Shift', 'pushing to the rim releases D and runs');
    input.releaseJoystick();
    assert(rec.events.join(' ') === '+w +d -d +Shift -w -Shift', 'letting go releases every joystick key');
    assert(input.heldKeys().length === 0, 'nothing is left held');
    console.log('✓ joystick keys change only on transitions');
}

// 5. Buttons stay down for the minimum hold, so a per-frame sampler sees a tap.
{
    const rec = recorder();
    const clock = fakeClock();
    const input = new TouchMovementInput({ ...rec, clock });
    input.tapButton('e');
    assert(rec.events.join(' ') === '+e', 'a tap presses at once');
    clock.advance(BUTTON_MIN_HOLD_MS - 1);
    assert(rec.events.join(' ') === '+e', 'and is still held just before the minimum hold');
    clock.advance(1);
    assert(rec.events.join(' ') === '+e -e', 'then released');

    rec.events.length = 0;
    input.holdButton(' ');
    clock.advance(BUTTON_MIN_HOLD_MS + 50);
    input.releaseButton(' ');
    assert(rec.events.join(' ') === '+  - ', 'a long hold releases as soon as the finger lifts');

    rec.events.length = 0;
    input.releaseButton('Control');
    assert(rec.events.length === 0, 'releasing a button never pressed sends nothing');
    console.log('✓ button minimum hold');
}

// 6. releaseAll lets go of everything, including a pending tap.
{
    const rec = recorder();
    const clock = fakeClock();
    const input = new TouchMovementInput({ ...rec, clock });
    input.setJoystick({ dx: 0, dy: 40, radius: 50 });
    input.holdButton('Control');
    input.tapButton('f');
    input.releaseAll();
    assert(rec.events.join(' ') === '+s +Control +f -s -Control -f', `releaseAll releases each key once, got ${rec.events.join(' ')}`);
    clock.advance(BUTTON_MIN_HOLD_MS * 2);
    assert(rec.events.length === 6, 'the cancelled tap timer sends nothing later');
    console.log('✓ releaseAll');
}
