import { readFile } from 'node:fs/promises';
import { deriveAvatarContinuousMovementInputEvent } from '../core/AvatarContinuousMovementInputAdapter.js';
import {
    AvatarContinuousMovementIntent,
    deriveAvatarContinuousMovementIntent
} from '../core/AvatarContinuousMovementIntent.js';
import {
    AvatarContinuousMovementMode,
    deriveAvatarContinuousMovementMode
} from '../core/AvatarContinuousMovementMode.js';

// 0.9.65 / 0.9.68 — Avatar Continuous Movement Input Adapter,
// core/AvatarContinuousMovementInputAdapter.js.
//
//   Section A: modifier state — Caps Lock and Shift down/up tracking
//   Section B: CapsLock + W/S (Shift NOT held) — walking activation
//   Section C: CapsLock + Shift + W/S — running activation
//   Section D: ordinary W/S keydown, with and without Shift — never an
//              activation request, regardless of Shift
//   Section E: key-up never produces a transition; releasing Caps Lock
//              or Shift alone produces no transition either
//   Section F: modifier-order independence — Shift-then-CapsLock and
//              CapsLock-then-Shift produce identical transitions
//   Section G: full-pipeline cancellation, including the "running, then
//              an ordinary opposite key" cancellation the design brief
//              calls out explicitly
//   Section H: full-pipeline direction switch and mode upgrade/downgrade
//   Section I: unrelated keys never produce a transition
//   Section J: key-repeat is idempotent, for both dimensions at once
//   Section K: defensive / malformed input
//   Section L: FLAGSHIP — a scripted CapsLock(+Shift)+W/S scenario run
//              through the adapter and BOTH 0.9.64/0.9.67 transition
//              functions together
//   Section M/N: architectural regression — no avatar mutation, no
//                controller/timer/animation-loop/physics/persistence,
//                no combined direction+mode vocabulary
//
// Central architectural claim under test throughout: this milestone only
// TRANSLATES a keyboard event into the shapes 0.9.64 and 0.9.67 already
// know how to interpret — it never calls either transition function
// itself, never decides what a transition MEANS, and never moves
// anything. See docs/Roadmap.md, 0.9.65 and 0.9.68.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function runTests() {
    const { NONE, FORWARD, BACKWARD } = AvatarContinuousMovementIntent;
    const { NONE: NONE_MODE, WALK, RUN } = AvatarContinuousMovementMode;

    // -------------------------------------------------------------
    // Section A — modifier state
    // -------------------------------------------------------------
    {
        const result = deriveAvatarContinuousMovementInputEvent({ capsLockDown: false, shiftDown: false, key: 'CapsLock', type: 'keydown' });
        assert(result.capsLockDown === true, '1. Caps Lock keydown sets capsLockDown true');
        assert(result.shiftDown === false, '2. Caps Lock keydown never touches shiftDown');
        assert(result.transition === null, '3. Caps Lock keydown alone produces no transition');
    }
    {
        const result = deriveAvatarContinuousMovementInputEvent({ capsLockDown: true, shiftDown: false, key: 'CapsLock', type: 'keyup' });
        assert(result.capsLockDown === false, '4. Caps Lock keyup clears capsLockDown');
        assert(result.transition === null, '5. Caps Lock keyup produces no transition');
    }
    {
        const result = deriveAvatarContinuousMovementInputEvent({ capsLockDown: false, shiftDown: false, key: 'Shift', type: 'keydown' });
        assert(result.shiftDown === true, '6. Shift keydown sets shiftDown true');
        assert(result.capsLockDown === false, '7. Shift keydown never touches capsLockDown');
        assert(result.transition === null, '8. Shift keydown alone produces no transition');
    }
    {
        const result = deriveAvatarContinuousMovementInputEvent({ capsLockDown: false, shiftDown: true, key: 'Shift', type: 'keyup' });
        assert(result.shiftDown === false, '9. Shift keyup clears shiftDown');
        assert(result.transition === null, '10. Shift keyup produces no transition');
    }
    {
        const capsDown = deriveAvatarContinuousMovementInputEvent({ capsLockDown: false, shiftDown: false, key: 'CapsLock', type: 'keydown' });
        const bothDown = deriveAvatarContinuousMovementInputEvent({ capsLockDown: capsDown.capsLockDown, shiftDown: false, key: 'Shift', type: 'keydown' });
        assert(bothDown.capsLockDown === true && bothDown.shiftDown === true, '11. Caps Lock and Shift can both be tracked held at once');
    }
    {
        const result = deriveAvatarContinuousMovementInputEvent({ capsLockDown: true, shiftDown: true, key: 'ArrowUp', type: 'keydown' });
        assert(result.capsLockDown === true && result.shiftDown === true, '12. an unrelated key never mutates either tracked modifier state');
    }
    {
        const result = deriveAvatarContinuousMovementInputEvent({ capsLockDown: false, shiftDown: false, key: 'shift', type: 'keydown' });
        assert(result.shiftDown === true, '13. Shift key comparison is case-insensitive, matching Caps Lock\'s own');
    }

    // -------------------------------------------------------------
    // Section B — CapsLock + W/S, Shift NOT held: walking activation
    // -------------------------------------------------------------
    {
        const result = deriveAvatarContinuousMovementInputEvent({ capsLockDown: true, shiftDown: false, key: 'w', type: 'keydown' });
        assert(result.transition.direction === 'forward' && result.transition.activationRequested === true && result.transition.runRequested === false,
            '14. CapsLock+W (no Shift) produces an activating FORWARD transition with runRequested false');
    }
    {
        const result = deriveAvatarContinuousMovementInputEvent({ capsLockDown: true, shiftDown: false, key: 's', type: 'keydown' });
        assert(result.transition.direction === 'backward' && result.transition.activationRequested === true && result.transition.runRequested === false,
            '15. CapsLock+S (no Shift) produces an activating BACKWARD transition with runRequested false');
    }

    // -------------------------------------------------------------
    // Section C — CapsLock + Shift + W/S: running activation
    // -------------------------------------------------------------
    {
        const result = deriveAvatarContinuousMovementInputEvent({ capsLockDown: true, shiftDown: true, key: 'w', type: 'keydown' });
        assert(result.transition.direction === 'forward' && result.transition.activationRequested === true && result.transition.runRequested === true,
            '16. CapsLock+Shift+W produces an activating FORWARD transition with runRequested true');
    }
    {
        const result = deriveAvatarContinuousMovementInputEvent({ capsLockDown: true, shiftDown: true, key: 's', type: 'keydown' });
        assert(result.transition.direction === 'backward' && result.transition.activationRequested === true && result.transition.runRequested === true,
            '17. CapsLock+Shift+S produces an activating BACKWARD transition with runRequested true');
    }

    // -------------------------------------------------------------
    // Section D — ordinary W/S keydown never activates, with or
    // without Shift: "Shift determines requested mode only when Caps
    // Lock is physically held"
    // -------------------------------------------------------------
    {
        const result = deriveAvatarContinuousMovementInputEvent({ capsLockDown: false, shiftDown: false, key: 'w', type: 'keydown' });
        assert(result.transition.direction === 'forward' && result.transition.activationRequested === false,
            '18. ordinary W (no Caps Lock, no Shift) is a non-activating forward press');
    }
    {
        const result = deriveAvatarContinuousMovementInputEvent({ capsLockDown: false, shiftDown: true, key: 'w', type: 'keydown' });
        assert(result.transition.direction === 'forward' && result.transition.activationRequested === false,
            '19. Shift+W WITHOUT Caps Lock remains a non-activating forward press — Shift alone never activates persistent running');
    }
    {
        const result = deriveAvatarContinuousMovementInputEvent({ capsLockDown: false, shiftDown: false, key: 's', type: 'keydown' });
        assert(result.transition.direction === 'backward' && result.transition.activationRequested === false,
            '20. ordinary S (no Caps Lock, no Shift) is a non-activating backward press');
    }
    {
        const result = deriveAvatarContinuousMovementInputEvent({ capsLockDown: false, shiftDown: true, key: 's', type: 'keydown' });
        assert(result.transition.direction === 'backward' && result.transition.activationRequested === false,
            '21. Shift+S WITHOUT Caps Lock remains a non-activating backward press');
    }

    // -------------------------------------------------------------
    // Section E — key-up never produces a transition
    // -------------------------------------------------------------
    {
        const wUp = deriveAvatarContinuousMovementInputEvent({ capsLockDown: true, shiftDown: true, key: 'w', type: 'keyup' });
        assert(wUp.transition === null, '22. W key-up produces no transition even while Caps Lock and Shift are held');
        assert(wUp.capsLockDown === true && wUp.shiftDown === true, '23. releasing W does not itself release either tracked modifier hold');
    }
    {
        const sUp = deriveAvatarContinuousMovementInputEvent({ capsLockDown: false, shiftDown: false, key: 's', type: 'keyup' });
        assert(sUp.transition === null, '24. ordinary S key-up produces no transition');
    }

    // -------------------------------------------------------------
    // Section F — modifier-order independence
    // -------------------------------------------------------------
    {
        // Shift down, then Caps Lock down, then W.
        let state = { capsLockDown: false, shiftDown: false };
        state = deriveAvatarContinuousMovementInputEvent({ ...state, key: 'Shift', type: 'keydown' });
        state = deriveAvatarContinuousMovementInputEvent({ ...state, key: 'CapsLock', type: 'keydown' });
        const shiftFirst = deriveAvatarContinuousMovementInputEvent({ ...state, key: 'w', type: 'keydown' });

        // Caps Lock down, then Shift down, then W.
        let other = { capsLockDown: false, shiftDown: false };
        other = deriveAvatarContinuousMovementInputEvent({ ...other, key: 'CapsLock', type: 'keydown' });
        other = deriveAvatarContinuousMovementInputEvent({ ...other, key: 'Shift', type: 'keydown' });
        const capsFirst = deriveAvatarContinuousMovementInputEvent({ ...other, key: 'w', type: 'keydown' });

        assert(JSON.stringify(shiftFirst.transition) === JSON.stringify(capsFirst.transition),
            '25. Shift-then-CapsLock and CapsLock-then-Shift produce byte-identical transitions — this adapter reads current facts, never press order');
    }

    // -------------------------------------------------------------
    // Section G — full pipeline: cancellation, including the design
    // brief's own "running, then an ordinary opposite key" scenario
    // -------------------------------------------------------------
    {
        const { transition } = deriveAvatarContinuousMovementInputEvent({ capsLockDown: false, shiftDown: false, key: 'w', type: 'keydown' });
        const nextIntent = deriveAvatarContinuousMovementIntent({ currentIntent: FORWARD, ...transition });
        const nextMode = deriveAvatarContinuousMovementMode({ currentMode: RUN, ...transition });
        assert(nextIntent === NONE, '26. an ordinary W keydown cancels an active continuous FORWARD');
        assert(nextMode === NONE_MODE, '27. the SAME ordinary W keydown also cancels an active continuous RUN — both dimensions clear together');
    }
    {
        // CapsLock + Shift + W -> FORWARD + RUN, then an ordinary S
        // (no Caps Lock) must clear BOTH dimensions to NONE/NONE,
        // never silently produce BACKWARD + RUN.
        const { transition } = deriveAvatarContinuousMovementInputEvent({ capsLockDown: false, shiftDown: false, key: 's', type: 'keydown' });
        const nextIntent = deriveAvatarContinuousMovementIntent({ currentIntent: FORWARD, ...transition });
        const nextMode = deriveAvatarContinuousMovementMode({ currentMode: RUN, ...transition });
        assert(nextIntent === NONE, '28. an ordinary opposite-direction S cancels continuous FORWARD rather than creating BACKWARD');
        assert(nextMode === NONE_MODE, '29. the same ordinary S also cancels continuous RUN — no BACKWARD+RUN ever silently appears');
    }

    // -------------------------------------------------------------
    // Section H — full pipeline: direction switch and mode
    // upgrade/downgrade from a single chorded keydown
    // -------------------------------------------------------------
    {
        const { transition } = deriveAvatarContinuousMovementInputEvent({ capsLockDown: true, shiftDown: true, key: 's', type: 'keydown' });
        const nextIntent = deriveAvatarContinuousMovementIntent({ currentIntent: FORWARD, ...transition });
        const nextMode = deriveAvatarContinuousMovementMode({ currentMode: WALK, ...transition });
        assert(nextIntent === BACKWARD, '30. CapsLock+Shift+S switches continuous FORWARD directly to BACKWARD');
        assert(nextMode === RUN, '31. the same chord upgrades continuous WALK directly to RUN, in the same keydown');
    }
    {
        // Releasing Shift, then re-pressing CapsLock+W: downgrades
        // RUN back to WALK while direction (already FORWARD) is
        // idempotent.
        const { transition } = deriveAvatarContinuousMovementInputEvent({ capsLockDown: true, shiftDown: false, key: 'w', type: 'keydown' });
        const nextIntent = deriveAvatarContinuousMovementIntent({ currentIntent: FORWARD, ...transition });
        const nextMode = deriveAvatarContinuousMovementMode({ currentMode: RUN, ...transition });
        assert(nextIntent === FORWARD, '32. re-activating CapsLock+W while already continuously FORWARD is idempotent for direction');
        assert(nextMode === WALK, '33. and downgrades RUN to WALK now that Shift is no longer held');
    }

    // -------------------------------------------------------------
    // Section I — unrelated keys never produce a transition
    // -------------------------------------------------------------
    {
        const unrelatedKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Control', 'Alt', ' ', 'Spacebar', 'a', 'd', 'Enter', 'Escape'];
        for (const key of unrelatedKeys) {
            const down = deriveAvatarContinuousMovementInputEvent({ capsLockDown: false, shiftDown: false, key, type: 'keydown' });
            assert(down.transition === null, `34. "${key}" keydown never produces a continuous-movement transition`);
            const downWhileHeld = deriveAvatarContinuousMovementInputEvent({ capsLockDown: true, shiftDown: true, key, type: 'keydown' });
            assert(downWhileHeld.transition === null, `35. "${key}" keydown never produces a transition even while Caps Lock and Shift are both held`);
        }
    }

    // -------------------------------------------------------------
    // Section J — key-repeat is idempotent for both dimensions
    // -------------------------------------------------------------
    {
        let intent = FORWARD;
        let mode = RUN;
        for (let i = 0; i < 5; i += 1) {
            const { transition } = deriveAvatarContinuousMovementInputEvent({ capsLockDown: false, shiftDown: false, key: 'w', type: 'keydown' });
            intent = deriveAvatarContinuousMovementIntent({ currentIntent: intent, ...transition });
            mode = deriveAvatarContinuousMovementMode({ currentMode: mode, ...transition });
        }
        assert(intent === NONE && mode === NONE_MODE, '36. repeated ordinary W keydowns (key-repeat) stay cancelled for both direction and mode');
    }
    {
        let intent = NONE;
        let mode = NONE_MODE;
        for (let i = 0; i < 5; i += 1) {
            const { transition } = deriveAvatarContinuousMovementInputEvent({ capsLockDown: true, shiftDown: true, key: 'w', type: 'keydown' });
            intent = deriveAvatarContinuousMovementIntent({ currentIntent: intent, ...transition });
            mode = deriveAvatarContinuousMovementMode({ currentMode: mode, ...transition });
        }
        assert(intent === FORWARD && mode === RUN, '37. repeated CapsLock+Shift+W keydowns (key-repeat) stay FORWARD+RUN, never toggle off');
    }

    // -------------------------------------------------------------
    // Section K — defensive / malformed input
    // -------------------------------------------------------------
    {
        const result = deriveAvatarContinuousMovementInputEvent();
        assert(result.transition === null && result.capsLockDown === false && result.shiftDown === false,
            '38. calling with no arguments at all is safe and inert');
    }
    {
        const result = deriveAvatarContinuousMovementInputEvent({ capsLockDown: true, shiftDown: true, key: undefined, type: 'keydown' });
        assert(result.transition === null && result.capsLockDown === true && result.shiftDown === true,
            '39. a missing key is inert and never disturbs either tracked modifier hold');
    }
    {
        const result = deriveAvatarContinuousMovementInputEvent({ capsLockDown: false, shiftDown: false, key: 'w' });
        assert(result.transition && result.transition.direction === 'forward',
            '40. an omitted type defaults to keydown behavior, matching this codebase\'s "degrade gracefully" posture');
    }
    {
        const result = deriveAvatarContinuousMovementInputEvent({ capsLockDown: 'yes', shiftDown: 1, key: 'w', type: 'keydown' });
        assert(result.transition.activationRequested === true && result.transition.runRequested === true,
            '41. truthy non-boolean capsLockDown/shiftDown are coerced like every other boolean flag in this codebase');
    }
    {
        const options = { capsLockDown: true, shiftDown: true, key: 'w', type: 'keydown' };
        const snapshot = JSON.stringify(options);
        const first = deriveAvatarContinuousMovementInputEvent(options);
        const second = deriveAvatarContinuousMovementInputEvent(options);
        assert(JSON.stringify(first) === JSON.stringify(second), '42. deriveAvatarContinuousMovementInputEvent is deterministic');
        assert(JSON.stringify(options) === snapshot, '43. deriveAvatarContinuousMovementInputEvent never mutates the options object it was given');
    }

    // -------------------------------------------------------------
    // FLAGSHIP — the design doc's own scripted scenario, run through
    // the adapter and BOTH 0.9.64/0.9.67 together, exactly as a real
    // caller (0.9.69) will eventually wire them
    // -------------------------------------------------------------
    {
        let capsLockDown = false;
        let shiftDown = false;
        let intent = NONE;
        let mode = NONE_MODE;

        function feed(key, type) {
            const result = deriveAvatarContinuousMovementInputEvent({ capsLockDown, shiftDown, key, type });
            capsLockDown = result.capsLockDown;
            shiftDown = result.shiftDown;
            if (result.transition) {
                intent = deriveAvatarContinuousMovementIntent({ currentIntent: intent, ...result.transition });
                mode = deriveAvatarContinuousMovementMode({ currentMode: mode, ...result.transition });
            }
        }

        feed('CapsLock', 'keydown');
        feed('Shift', 'keydown');
        feed('w', 'keydown');
        assert(intent === FORWARD && mode === RUN, '44. FLAGSHIP: CapsLock+Shift+W activates continuous FORWARD running');

        feed('w', 'keyup');
        feed('Shift', 'keyup');
        feed('CapsLock', 'keyup');
        assert(intent === FORWARD && mode === RUN, '45. FLAGSHIP: releasing every key leaves continuous FORWARD+RUN untouched');

        feed('w', 'keydown');
        assert(intent === NONE && mode === NONE_MODE, '46. FLAGSHIP: a later plain W keydown (no modifiers held) cancels both continuous FORWARD and RUN');

        feed('CapsLock', 'keydown');
        feed('s', 'keydown');
        assert(intent === BACKWARD && mode === WALK, '47. FLAGSHIP: CapsLock+S from rest activates continuous BACKWARD walking (no Shift held)');

        feed('Shift', 'keydown');
        feed('s', 'keydown');
        assert(intent === BACKWARD && mode === RUN, '48. FLAGSHIP: adding Shift and re-pressing S upgrades continuous BACKWARD to running, direction unchanged');

        feed('CapsLock', 'keyup');
        feed('w', 'keydown');
        assert(intent === NONE && mode === NONE_MODE, '49. FLAGSHIP: the opposite ordinary key (plain W, Shift still physically down) cancels continuous BACKWARD+RUN entirely — the escape hatch works for both dimensions at once');
    }

    // -------------------------------------------------------------
    // Section M/N — architectural regression: no avatar mutation, no
    // movement controller, timer, animation loop, physics engine,
    // persistence, or combined direction+mode vocabulary
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../core/AvatarContinuousMovementInputAdapter.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        const forbidden = [
            'AvatarMovementController', 'AvatarMovementState', 'simulateAvatarMovement', 'deriveAvatarContinuousMovementIntent', 'deriveAvatarContinuousMovementMode',
            'AvatarMovementConstraint', 'AvatarTerrainConstraint', 'AvatarStepConstraint', 'AvatarTreeConstraint',
            'AvatarPresence', 'WorldNavigationSession',
            'FORWARD_WALK', 'FORWARD_RUN', 'BACKWARD_WALK', 'BACKWARD_RUN',
            'setTimeout', 'setInterval', 'requestAnimationFrame', 'performance.now', 'Date.now',
            'addEventListener', 'removeEventListener', 'getModifierState',
            'THREE', 'from \'three\'', 'Renderer',
            'Math.random', 'localStorage', 'StorageProvider', 'fetch(', 'WebSocket',
            'velocity', 'acceleration', 'speed', 'position', 'rotation', 'camera'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `50. core/AvatarContinuousMovementInputAdapter.js's own code never references "${term}" — pure keyboard-event translation only, never movement, never DOM wiring, never either 0.9.64/0.9.67 transition function itself, never a combined direction+mode vocabulary`);
        }
    }
    {
        const exportsModule = await import('../core/AvatarContinuousMovementInputAdapter.js');
        const exportedNames = Object.keys(exportsModule).sort();
        assert(JSON.stringify(exportedNames) === JSON.stringify(['deriveAvatarContinuousMovementInputEvent']),
            '51. core/AvatarContinuousMovementInputAdapter.js exports exactly the one translation function — nothing else');
    }

    console.log('✅ All Avatar Continuous Movement Input Adapter tests passed.');
}

await runTests();
