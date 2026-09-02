import { readFile } from 'node:fs/promises';
import { deriveAvatarContinuousMovementInputEvent } from '../core/AvatarContinuousMovementInputAdapter.js';
import {
    AvatarContinuousMovementIntent,
    deriveAvatarContinuousMovementIntent
} from '../core/AvatarContinuousMovementIntent.js';

// 0.9.65 — Avatar Continuous Movement Input Adapter, core/AvatarContinuousMovementInputAdapter.js.
//
//   Section A: ordinary W/S keydown — non-activating transitions
//   Section B/C: Caps-Lock-held W/S keydown — activating transitions
//   Section D: key-up never produces a transition
//   Section E: releasing Caps Lock produces no transition either
//   Section F: full-pipeline cancellation (adapter + 0.9.64 together)
//   Section G/H: full-pipeline opposite/same re-activation
//   Section I: unrelated keys never produce a transition
//   Section J: key-repeat is idempotent
//   Section K/L: architectural regression — no avatar mutation, no
//                controller/timer/animation-loop/physics/persistence
//
// Central architectural claim under test throughout: this milestone only
// TRANSLATES a keyboard event into the shape 0.9.64 already knows how to
// interpret — it never calls deriveAvatarContinuousMovementIntent()
// itself, never decides what a transition MEANS, and never moves
// anything. See docs/Roadmap.md, 0.9.65.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function runTests() {
    const { NONE, FORWARD, BACKWARD } = AvatarContinuousMovementIntent;

    // -------------------------------------------------------------
    // Section A — ordinary W/S keydown
    // -------------------------------------------------------------
    {
        const result = deriveAvatarContinuousMovementInputEvent({ capsLockDown: false, key: 'w', type: 'keydown' });
        assert(result.transition && result.transition.direction === 'forward' && result.transition.activationRequested === false,
            '1. ordinary W keydown produces a non-activating forward transition');
        assert(result.capsLockDown === false, '2. ordinary W keydown never changes capsLockDown');
    }
    {
        const result = deriveAvatarContinuousMovementInputEvent({ capsLockDown: false, key: 's', type: 'keydown' });
        assert(result.transition && result.transition.direction === 'backward' && result.transition.activationRequested === false,
            '3. ordinary S keydown produces a non-activating backward transition');
    }
    {
        const result = deriveAvatarContinuousMovementInputEvent({ capsLockDown: false, key: 'W', type: 'keydown' });
        assert(result.transition && result.transition.direction === 'forward',
            '4. key comparison is case-insensitive, matching every other raw-key comparison in this codebase');
    }

    // -------------------------------------------------------------
    // Section B — CapsLock + W activates FORWARD
    // -------------------------------------------------------------
    {
        const capsDown = deriveAvatarContinuousMovementInputEvent({ capsLockDown: false, key: 'CapsLock', type: 'keydown' });
        assert(capsDown.capsLockDown === true, '5. Caps Lock keydown sets capsLockDown true');
        assert(capsDown.transition === null, '6. Caps Lock keydown alone produces no transition — pressing it is not itself a movement key');

        const wDown = deriveAvatarContinuousMovementInputEvent({ capsLockDown: capsDown.capsLockDown, key: 'w', type: 'keydown' });
        assert(wDown.transition && wDown.transition.direction === 'forward' && wDown.transition.activationRequested === true,
            '7. W keydown while Caps Lock is held produces an ACTIVATING forward transition');
    }

    // -------------------------------------------------------------
    // Section C — CapsLock + S activates BACKWARD
    // -------------------------------------------------------------
    {
        const sDown = deriveAvatarContinuousMovementInputEvent({ capsLockDown: true, key: 's', type: 'keydown' });
        assert(sDown.transition && sDown.transition.direction === 'backward' && sDown.transition.activationRequested === true,
            '8. S keydown while Caps Lock is held produces an ACTIVATING backward transition');
    }

    // -------------------------------------------------------------
    // Section D — key-up never produces a transition
    // -------------------------------------------------------------
    {
        const wUp = deriveAvatarContinuousMovementInputEvent({ capsLockDown: false, key: 'w', type: 'keyup' });
        assert(wUp.transition === null, '9. ordinary W key-up produces no transition at all');
    }
    {
        const wUp = deriveAvatarContinuousMovementInputEvent({ capsLockDown: true, key: 'w', type: 'keyup' });
        assert(wUp.transition === null, '10. W key-up produces no transition even while Caps Lock is held — release is never a signal');
        assert(wUp.capsLockDown === true, '11. releasing W does not itself release the tracked Caps Lock hold');
    }
    {
        const sUp = deriveAvatarContinuousMovementInputEvent({ capsLockDown: false, key: 's', type: 'keyup' });
        assert(sUp.transition === null, '12. ordinary S key-up produces no transition');
    }

    // -------------------------------------------------------------
    // Section E — releasing Caps Lock itself produces no transition
    // -------------------------------------------------------------
    {
        const capsUp = deriveAvatarContinuousMovementInputEvent({ capsLockDown: true, key: 'CapsLock', type: 'keyup' });
        assert(capsUp.capsLockDown === false, '13. Caps Lock keyup clears the tracked physical hold');
        assert(capsUp.transition === null, '14. Caps Lock keyup produces no transition — a persistent intent this adapter never even sees is untouched');
    }
    {
        const capsUp = deriveAvatarContinuousMovementInputEvent({ capsLockDown: true, key: 'capslock', type: 'keyup' });
        assert(capsUp.capsLockDown === false, '15. Caps Lock key comparison is also case-insensitive');
    }

    // -------------------------------------------------------------
    // Section F — full pipeline: ordinary press cancels an active
    // continuous intent (adapter output fed straight into 0.9.64)
    // -------------------------------------------------------------
    {
        const { transition } = deriveAvatarContinuousMovementInputEvent({ capsLockDown: false, key: 'w', type: 'keydown' });
        const nextIntent = deriveAvatarContinuousMovementIntent({ currentIntent: FORWARD, ...transition });
        assert(nextIntent === NONE, '16. an ordinary W keydown, translated then interpreted, cancels an active continuous FORWARD');
    }

    // -------------------------------------------------------------
    // Section G — full pipeline: CapsLock+S while continuously moving
    // forward directly produces BACKWARD
    // -------------------------------------------------------------
    {
        const { transition } = deriveAvatarContinuousMovementInputEvent({ capsLockDown: true, key: 's', type: 'keydown' });
        const nextIntent = deriveAvatarContinuousMovementIntent({ currentIntent: FORWARD, ...transition });
        assert(nextIntent === BACKWARD, '17. CapsLock+S, translated then interpreted, switches directly from continuous FORWARD to BACKWARD');
    }

    // -------------------------------------------------------------
    // Section H — full pipeline: CapsLock+W while already FORWARD
    // remains FORWARD (no accidental toggle-off)
    // -------------------------------------------------------------
    {
        const { transition } = deriveAvatarContinuousMovementInputEvent({ capsLockDown: true, key: 'w', type: 'keydown' });
        const nextIntent = deriveAvatarContinuousMovementIntent({ currentIntent: FORWARD, ...transition });
        assert(nextIntent === FORWARD, '18. CapsLock+W while already continuously FORWARD is idempotent, never a toggle-off');
    }

    // -------------------------------------------------------------
    // Section I — unrelated keys never produce a transition
    // -------------------------------------------------------------
    {
        const unrelatedKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Shift', 'Control', 'Alt', ' ', 'Spacebar', 'a', 'd', 'Enter', 'Escape'];
        for (const key of unrelatedKeys) {
            const down = deriveAvatarContinuousMovementInputEvent({ capsLockDown: false, key, type: 'keydown' });
            assert(down.transition === null, `19. "${key}" keydown never produces a continuous-movement transition`);
            const downWhileCapsHeld = deriveAvatarContinuousMovementInputEvent({ capsLockDown: true, key, type: 'keydown' });
            assert(downWhileCapsHeld.transition === null, `20. "${key}" keydown never produces a transition even while Caps Lock is held`);
        }
    }
    {
        // Caps Lock being physically down is carried through untouched
        // by an unrelated key — it never accidentally clears or sets it.
        const result = deriveAvatarContinuousMovementInputEvent({ capsLockDown: true, key: 'Shift', type: 'keydown' });
        assert(result.capsLockDown === true, '21. an unrelated key never changes the tracked Caps Lock hold state');
    }

    // -------------------------------------------------------------
    // Section J — key-repeat is idempotent
    // -------------------------------------------------------------
    {
        // Holding W (no Caps Lock) fires repeated ordinary keydowns.
        // Feeding each one through the full pipeline must never toggle
        // intent back on.
        let intent = FORWARD;
        for (let i = 0; i < 5; i += 1) {
            const { transition } = deriveAvatarContinuousMovementInputEvent({ capsLockDown: false, key: 'w', type: 'keydown' });
            intent = deriveAvatarContinuousMovementIntent({ currentIntent: intent, ...transition });
        }
        assert(intent === NONE, '22. repeated ordinary W keydowns (key-repeat) stay cancelled, never toggle back on');
    }
    {
        // Holding CapsLock+W fires repeated activating keydowns (browser
        // key-repeat on the W key while Caps Lock stays physically down).
        let intent = NONE;
        for (let i = 0; i < 5; i += 1) {
            const { transition } = deriveAvatarContinuousMovementInputEvent({ capsLockDown: true, key: 'w', type: 'keydown' });
            intent = deriveAvatarContinuousMovementIntent({ currentIntent: intent, ...transition });
        }
        assert(intent === FORWARD, '23. repeated activating W keydowns (key-repeat) stay FORWARD, never toggle off');
    }

    // -------------------------------------------------------------
    // Defensive / malformed input
    // -------------------------------------------------------------
    {
        const result = deriveAvatarContinuousMovementInputEvent();
        assert(result.transition === null && result.capsLockDown === false, '24. calling with no arguments at all is safe and inert');
    }
    {
        const result = deriveAvatarContinuousMovementInputEvent({ capsLockDown: true, key: undefined, type: 'keydown' });
        assert(result.transition === null && result.capsLockDown === true, '25. a missing key is inert and never disturbs the tracked Caps Lock hold');
    }
    {
        const result = deriveAvatarContinuousMovementInputEvent({ capsLockDown: false, key: 'w' });
        assert(result.transition && result.transition.direction === 'forward',
            '26. an omitted type defaults to keydown behavior, matching this codebase\'s "degrade gracefully" posture');
    }
    {
        const options = { capsLockDown: false, key: 'w', type: 'keydown' };
        const snapshot = JSON.stringify(options);
        const first = deriveAvatarContinuousMovementInputEvent(options);
        const second = deriveAvatarContinuousMovementInputEvent(options);
        assert(JSON.stringify(first) === JSON.stringify(second), '27. deriveAvatarContinuousMovementInputEvent is deterministic');
        assert(JSON.stringify(options) === snapshot, '28. deriveAvatarContinuousMovementInputEvent never mutates the options object it was given');
    }

    // -------------------------------------------------------------
    // FLAGSHIP — the design doc's own scripted scenario, run through
    // BOTH the adapter and 0.9.64 together, exactly as a real caller
    // (0.9.66) will eventually wire them
    // -------------------------------------------------------------
    {
        let capsLockDown = false;
        let intent = NONE;

        function feed(key, type) {
            const result = deriveAvatarContinuousMovementInputEvent({ capsLockDown, key, type });
            capsLockDown = result.capsLockDown;
            if (result.transition) {
                intent = deriveAvatarContinuousMovementIntent({ currentIntent: intent, ...result.transition });
            }
        }

        feed('CapsLock', 'keydown');
        feed('w', 'keydown');
        assert(intent === FORWARD, '29. FLAGSHIP: CapsLock down then W down activates continuous FORWARD');

        feed('w', 'keyup');
        feed('CapsLock', 'keyup');
        assert(intent === FORWARD, '30. FLAGSHIP: releasing W and then Caps Lock leaves continuous FORWARD untouched');

        feed('w', 'keydown');
        assert(intent === NONE, '31. FLAGSHIP: a later plain W keydown (Caps Lock no longer held) cancels continuous FORWARD');

        feed('CapsLock', 'keydown');
        feed('s', 'keydown');
        assert(intent === BACKWARD, '32. FLAGSHIP: CapsLock+S from rest activates continuous BACKWARD');

        feed('CapsLock', 'keyup');
        feed('w', 'keydown');
        assert(intent === NONE, '33. FLAGSHIP: the opposite ordinary key (plain W) cancels continuous BACKWARD, the escape hatch');
    }

    // -------------------------------------------------------------
    // Section K/L — architectural regression: no avatar mutation, no
    // movement controller, timer, animation loop, physics engine, or
    // persistence
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../core/AvatarContinuousMovementInputAdapter.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        const forbidden = [
            'AvatarMovementController', 'AvatarMovementState', 'simulateAvatarMovement', 'deriveAvatarContinuousMovementIntent',
            'AvatarMovementConstraint', 'AvatarTerrainConstraint', 'AvatarStepConstraint', 'AvatarTreeConstraint',
            'AvatarPresence', 'WorldNavigationSession',
            'setTimeout', 'setInterval', 'requestAnimationFrame', 'performance.now', 'Date.now',
            'addEventListener', 'removeEventListener', 'getModifierState',
            'THREE', 'from \'three\'', 'Renderer',
            'Math.random', 'localStorage', 'StorageProvider', 'fetch(', 'WebSocket',
            'velocity', 'acceleration', 'speed', 'position', 'rotation', 'camera'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `34. core/AvatarContinuousMovementInputAdapter.js's own code never references "${term}" — pure keyboard-event translation only, never movement, never DOM wiring, never the 0.9.64 intent function itself`);
        }
    }
    {
        const exportsModule = await import('../core/AvatarContinuousMovementInputAdapter.js');
        const exportedNames = Object.keys(exportsModule).sort();
        assert(JSON.stringify(exportedNames) === JSON.stringify(['deriveAvatarContinuousMovementInputEvent']),
            '35. core/AvatarContinuousMovementInputAdapter.js exports exactly the one translation function — nothing else');
    }

    console.log('✅ All Avatar Continuous Movement Input Adapter tests passed.');
}

await runTests();
