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
//   Section A: modifier state — Alt and Shift down/up tracking
//   Section B: Alt + W/S (Shift NOT held) — walking activation
//   Section C: Alt + Shift + W/S — running activation
//   Section D: ordinary W/S keydown, with and without Shift — never an
//              activation request, regardless of Shift
//   Section E: key-up never produces a transition; releasing Alt
//              or Shift alone produces no transition either
//   Section F: modifier-order independence — Shift-then-Alt and
//              Alt-then-Shift produce identical transitions
//   Section G: full-pipeline cancellation, including the "running, then
//              an ordinary opposite key" cancellation the design brief
//              calls out explicitly
//   Section H: full-pipeline direction switch and mode upgrade/downgrade
//   Section I: unrelated keys never produce a transition
//   Section J: key-repeat is idempotent, for both dimensions at once
//   Section K: defensive / malformed input
//   Section L: FLAGSHIP — a scripted Alt(+Shift)+W/S scenario run
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
        const result = deriveAvatarContinuousMovementInputEvent({ altDown: false, shiftDown: false, key: 'Alt', type: 'keydown' });
        assert(result.altDown === true, '1. Alt keydown sets altDown true');
        assert(result.shiftDown === false, '2. Alt keydown never touches shiftDown');
        assert(result.transition === null, '3. Alt keydown alone produces no transition');
    }
    {
        const result = deriveAvatarContinuousMovementInputEvent({ altDown: true, shiftDown: false, key: 'Alt', type: 'keyup' });
        assert(result.altDown === false, '4. Alt keyup clears altDown');
        assert(result.transition === null, '5. Alt keyup produces no transition');
    }
    {
        const result = deriveAvatarContinuousMovementInputEvent({ altDown: false, shiftDown: false, key: 'Shift', type: 'keydown' });
        assert(result.shiftDown === true, '6. Shift keydown sets shiftDown true');
        assert(result.altDown === false, '7. Shift keydown never touches altDown');
        assert(result.transition === null, '8. Shift keydown alone produces no transition');
    }
    {
        const result = deriveAvatarContinuousMovementInputEvent({ altDown: false, shiftDown: true, key: 'Shift', type: 'keyup' });
        assert(result.shiftDown === false, '9. Shift keyup clears shiftDown');
        assert(result.transition === null, '10. Shift keyup produces no transition');
    }
    {
        const altDownResult = deriveAvatarContinuousMovementInputEvent({ altDown: false, shiftDown: false, key: 'Alt', type: 'keydown' });
        const bothDown = deriveAvatarContinuousMovementInputEvent({ altDown: altDownResult.altDown, shiftDown: false, key: 'Shift', type: 'keydown' });
        assert(bothDown.altDown === true && bothDown.shiftDown === true, '11. Alt and Shift can both be tracked held at once');
    }
    {
        const result = deriveAvatarContinuousMovementInputEvent({ altDown: true, shiftDown: true, key: 'ArrowUp', type: 'keydown' });
        assert(result.altDown === true && result.shiftDown === true, '12. an unrelated key never mutates either tracked modifier state');
    }
    {
        const result = deriveAvatarContinuousMovementInputEvent({ altDown: false, shiftDown: false, key: 'shift', type: 'keydown' });
        assert(result.shiftDown === true, '13. Shift key comparison is case-insensitive, matching Alt\'s own');
    }

    // -------------------------------------------------------------
    // Section B — Alt + W/S, Shift NOT held: walking activation
    // -------------------------------------------------------------
    {
        const result = deriveAvatarContinuousMovementInputEvent({ altDown: true, shiftDown: false, key: 'w', type: 'keydown' });
        assert(result.transition.direction === 'forward' && result.transition.activationRequested === true && result.transition.runRequested === false,
            '14. Alt+W (no Shift) produces an activating FORWARD transition with runRequested false');
    }
    {
        const result = deriveAvatarContinuousMovementInputEvent({ altDown: true, shiftDown: false, key: 's', type: 'keydown' });
        assert(result.transition.direction === 'backward' && result.transition.activationRequested === true && result.transition.runRequested === false,
            '15. Alt+S (no Shift) produces an activating BACKWARD transition with runRequested false');
    }

    // -------------------------------------------------------------
    // Section C — Alt + Shift + W/S: running activation
    // -------------------------------------------------------------
    {
        const result = deriveAvatarContinuousMovementInputEvent({ altDown: true, shiftDown: true, key: 'w', type: 'keydown' });
        assert(result.transition.direction === 'forward' && result.transition.activationRequested === true && result.transition.runRequested === true,
            '16. Alt+Shift+W produces an activating FORWARD transition with runRequested true');
    }
    {
        const result = deriveAvatarContinuousMovementInputEvent({ altDown: true, shiftDown: true, key: 's', type: 'keydown' });
        assert(result.transition.direction === 'backward' && result.transition.activationRequested === true && result.transition.runRequested === true,
            '17. Alt+Shift+S produces an activating BACKWARD transition with runRequested true');
    }

    // -------------------------------------------------------------
    // Section D — ordinary W/S keydown never activates, with or
    // without Shift: "Shift determines requested mode only when Alt
    // is physically held"
    // -------------------------------------------------------------
    {
        const result = deriveAvatarContinuousMovementInputEvent({ altDown: false, shiftDown: false, key: 'w', type: 'keydown' });
        assert(result.transition.direction === 'forward' && result.transition.activationRequested === false,
            '18. ordinary W (no Alt, no Shift) is a non-activating forward press');
    }
    {
        const result = deriveAvatarContinuousMovementInputEvent({ altDown: false, shiftDown: true, key: 'w', type: 'keydown' });
        assert(result.transition.direction === 'forward' && result.transition.activationRequested === false,
            '19. Shift+W WITHOUT Alt remains a non-activating forward press — Shift alone never activates persistent running');
    }
    {
        const result = deriveAvatarContinuousMovementInputEvent({ altDown: false, shiftDown: false, key: 's', type: 'keydown' });
        assert(result.transition.direction === 'backward' && result.transition.activationRequested === false,
            '20. ordinary S (no Alt, no Shift) is a non-activating backward press');
    }
    {
        const result = deriveAvatarContinuousMovementInputEvent({ altDown: false, shiftDown: true, key: 's', type: 'keydown' });
        assert(result.transition.direction === 'backward' && result.transition.activationRequested === false,
            '21. Shift+S WITHOUT Alt remains a non-activating backward press');
    }

    // -------------------------------------------------------------
    // Section E — key-up never produces a transition
    // -------------------------------------------------------------
    {
        const wUp = deriveAvatarContinuousMovementInputEvent({ altDown: true, shiftDown: true, key: 'w', type: 'keyup' });
        assert(wUp.transition === null, '22. W key-up produces no transition even while Alt and Shift are held');
        assert(wUp.altDown === true && wUp.shiftDown === true, '23. releasing W does not itself release either tracked modifier hold');
    }
    {
        const sUp = deriveAvatarContinuousMovementInputEvent({ altDown: false, shiftDown: false, key: 's', type: 'keyup' });
        assert(sUp.transition === null, '24. ordinary S key-up produces no transition');
    }

    // -------------------------------------------------------------
    // Section F — modifier-order independence
    // -------------------------------------------------------------
    {
        // Shift down, then Alt down, then W.
        let state = { altDown: false, shiftDown: false };
        state = deriveAvatarContinuousMovementInputEvent({ ...state, key: 'Shift', type: 'keydown' });
        state = deriveAvatarContinuousMovementInputEvent({ ...state, key: 'Alt', type: 'keydown' });
        const shiftFirst = deriveAvatarContinuousMovementInputEvent({ ...state, key: 'w', type: 'keydown' });

        // Alt down, then Shift down, then W.
        let other = { altDown: false, shiftDown: false };
        other = deriveAvatarContinuousMovementInputEvent({ ...other, key: 'Alt', type: 'keydown' });
        other = deriveAvatarContinuousMovementInputEvent({ ...other, key: 'Shift', type: 'keydown' });
        const altFirst = deriveAvatarContinuousMovementInputEvent({ ...other, key: 'w', type: 'keydown' });

        assert(JSON.stringify(shiftFirst.transition) === JSON.stringify(altFirst.transition),
            '25. Shift-then-Alt and Alt-then-Shift produce byte-identical transitions — this adapter reads current facts, never press order');
    }

    // -------------------------------------------------------------
    // Section G — full pipeline: cancellation, including the design
    // brief's own "running, then an ordinary opposite key" scenario
    // -------------------------------------------------------------
    {
        const { transition } = deriveAvatarContinuousMovementInputEvent({ altDown: false, shiftDown: false, key: 'w', type: 'keydown' });
        const nextIntent = deriveAvatarContinuousMovementIntent({ currentIntent: FORWARD, ...transition });
        const nextMode = deriveAvatarContinuousMovementMode({ currentMode: RUN, ...transition });
        assert(nextIntent === NONE, '26. an ordinary W keydown cancels an active continuous FORWARD');
        assert(nextMode === NONE_MODE, '27. the SAME ordinary W keydown also cancels an active continuous RUN — both dimensions clear together');
    }
    {
        // Alt + Shift + W -> FORWARD + RUN, then an ordinary S
        // (no Alt) must clear BOTH dimensions to NONE/NONE,
        // never silently produce BACKWARD + RUN.
        const { transition } = deriveAvatarContinuousMovementInputEvent({ altDown: false, shiftDown: false, key: 's', type: 'keydown' });
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
        const { transition } = deriveAvatarContinuousMovementInputEvent({ altDown: true, shiftDown: true, key: 's', type: 'keydown' });
        const nextIntent = deriveAvatarContinuousMovementIntent({ currentIntent: FORWARD, ...transition });
        const nextMode = deriveAvatarContinuousMovementMode({ currentMode: WALK, ...transition });
        assert(nextIntent === BACKWARD, '30. Alt+Shift+S switches continuous FORWARD directly to BACKWARD');
        assert(nextMode === RUN, '31. the same chord upgrades continuous WALK directly to RUN, in the same keydown');
    }
    {
        // Releasing Shift, then re-pressing Alt+W: downgrades
        // RUN back to WALK while direction (already FORWARD) is
        // idempotent.
        const { transition } = deriveAvatarContinuousMovementInputEvent({ altDown: true, shiftDown: false, key: 'w', type: 'keydown' });
        const nextIntent = deriveAvatarContinuousMovementIntent({ currentIntent: FORWARD, ...transition });
        const nextMode = deriveAvatarContinuousMovementMode({ currentMode: RUN, ...transition });
        assert(nextIntent === FORWARD, '32. re-activating Alt+W while already continuously FORWARD is idempotent for direction');
        assert(nextMode === WALK, '33. and downgrades RUN to WALK now that Shift is no longer held');
    }

    // -------------------------------------------------------------
    // Section I — unrelated keys never produce a transition
    // -------------------------------------------------------------
    {
        // 'Alt' is deliberately NOT in this list — it's the activation
        // key now, and has its own dedicated Section A/B/C coverage
        // above. 'CapsLock' takes its place here instead: now that Alt
        // is the activation key, Caps Lock is genuinely just another
        // unrelated key, the same as Control.
        const unrelatedKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Control', 'CapsLock', ' ', 'Spacebar', 'a', 'd', 'Enter', 'Escape'];
        for (const key of unrelatedKeys) {
            const down = deriveAvatarContinuousMovementInputEvent({ altDown: false, shiftDown: false, key, type: 'keydown' });
            assert(down.transition === null, `34. "${key}" keydown never produces a continuous-movement transition`);
            const downWhileHeld = deriveAvatarContinuousMovementInputEvent({ altDown: true, shiftDown: true, key, type: 'keydown' });
            assert(downWhileHeld.transition === null, `35. "${key}" keydown never produces a transition even while Alt and Shift are both held`);
        }
    }

    // -------------------------------------------------------------
    // Section J — key-repeat is idempotent for both dimensions
    // -------------------------------------------------------------
    {
        let intent = FORWARD;
        let mode = RUN;
        for (let i = 0; i < 5; i += 1) {
            const { transition } = deriveAvatarContinuousMovementInputEvent({ altDown: false, shiftDown: false, key: 'w', type: 'keydown' });
            intent = deriveAvatarContinuousMovementIntent({ currentIntent: intent, ...transition });
            mode = deriveAvatarContinuousMovementMode({ currentMode: mode, ...transition });
        }
        assert(intent === NONE && mode === NONE_MODE, '36. repeated ordinary W keydowns (key-repeat) stay cancelled for both direction and mode');
    }
    {
        let intent = NONE;
        let mode = NONE_MODE;
        for (let i = 0; i < 5; i += 1) {
            const { transition } = deriveAvatarContinuousMovementInputEvent({ altDown: true, shiftDown: true, key: 'w', type: 'keydown' });
            intent = deriveAvatarContinuousMovementIntent({ currentIntent: intent, ...transition });
            mode = deriveAvatarContinuousMovementMode({ currentMode: mode, ...transition });
        }
        assert(intent === FORWARD && mode === RUN, '37. repeated Alt+Shift+W keydowns (key-repeat) stay FORWARD+RUN, never toggle off');
    }

    // -------------------------------------------------------------
    // Section K — defensive / malformed input
    // -------------------------------------------------------------
    {
        const result = deriveAvatarContinuousMovementInputEvent();
        assert(result.transition === null && result.altDown === false && result.shiftDown === false,
            '38. calling with no arguments at all is safe and inert');
    }
    {
        const result = deriveAvatarContinuousMovementInputEvent({ altDown: true, shiftDown: true, key: undefined, type: 'keydown' });
        assert(result.transition === null && result.altDown === true && result.shiftDown === true,
            '39. a missing key is inert and never disturbs either tracked modifier hold');
    }
    {
        const result = deriveAvatarContinuousMovementInputEvent({ altDown: false, shiftDown: false, key: 'w' });
        assert(result.transition && result.transition.direction === 'forward',
            '40. an omitted type defaults to keydown behavior, matching this codebase\'s "degrade gracefully" posture');
    }
    {
        const result = deriveAvatarContinuousMovementInputEvent({ altDown: 'yes', shiftDown: 1, key: 'w', type: 'keydown' });
        assert(result.transition.activationRequested === true && result.transition.runRequested === true,
            '41. truthy non-boolean altDown/shiftDown are coerced like every other boolean flag in this codebase');
    }
    {
        const options = { altDown: true, shiftDown: true, key: 'w', type: 'keydown' };
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
        let altDown = false;
        let shiftDown = false;
        let intent = NONE;
        let mode = NONE_MODE;

        function feed(key, type) {
            const result = deriveAvatarContinuousMovementInputEvent({ altDown, shiftDown, key, type });
            altDown = result.altDown;
            shiftDown = result.shiftDown;
            if (result.transition) {
                intent = deriveAvatarContinuousMovementIntent({ currentIntent: intent, ...result.transition });
                mode = deriveAvatarContinuousMovementMode({ currentMode: mode, ...result.transition });
            }
        }

        feed('Alt', 'keydown');
        feed('Shift', 'keydown');
        feed('w', 'keydown');
        assert(intent === FORWARD && mode === RUN, '44. FLAGSHIP: Alt+Shift+W activates continuous FORWARD running');

        feed('w', 'keyup');
        feed('Shift', 'keyup');
        feed('Alt', 'keyup');
        assert(intent === FORWARD && mode === RUN, '45. FLAGSHIP: releasing every key leaves continuous FORWARD+RUN untouched');

        feed('w', 'keydown');
        assert(intent === NONE && mode === NONE_MODE, '46. FLAGSHIP: a later plain W keydown (no modifiers held) cancels both continuous FORWARD and RUN');

        feed('Alt', 'keydown');
        feed('s', 'keydown');
        assert(intent === BACKWARD && mode === WALK, '47. FLAGSHIP: Alt+S from rest activates continuous BACKWARD walking (no Shift held)');

        feed('Shift', 'keydown');
        feed('s', 'keydown');
        assert(intent === BACKWARD && mode === RUN, '48. FLAGSHIP: adding Shift and re-pressing S upgrades continuous BACKWARD to running, direction unchanged');

        feed('Alt', 'keyup');
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
