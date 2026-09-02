import { readFile } from 'node:fs/promises';
import {
    AvatarContinuousMovementIntent,
    isValidAvatarContinuousMovementIntent,
    deriveAvatarContinuousMovementIntent
} from '../core/AvatarContinuousMovementIntent.js';

// 0.9.64 — Avatar Continuous Movement Intent, core/AvatarContinuousMovementIntent.js.
//
//   Section A: the vocabulary itself — NONE/FORWARD/BACKWARD, isValid()
//   Section B: activation — an activating press sets/switches the intent
//   Section C: cancellation — an ordinary press always clears it
//   Section D: defensive/malformed input — degrades gracefully
//   Section E: FLAGSHIP — the design doc's own scripted Alt + W/S
//              scenario, replayed as a sequence of derive() calls, plus
//              purity/determinism
//   Section F: architectural regression — no movement, no controller, no
//              timers, no raw keyboard handling; a pure vocabulary and
//              transition rule only
//
// Central architectural claim under test throughout: this milestone
// moves nothing. Every assertion below concerns only what INTENT should
// exist, never an avatar position — see docs/Roadmap.md, 0.9.64.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function runTests() {
    const { NONE, FORWARD, BACKWARD } = AvatarContinuousMovementIntent;

    // -------------------------------------------------------------
    // Section A — the vocabulary itself
    // -------------------------------------------------------------
    {
        assert(NONE === 'none' && FORWARD === 'forward' && BACKWARD === 'backward',
            '1. AvatarContinuousMovementIntent has exactly the three expected values');
        assert(Object.isFrozen(AvatarContinuousMovementIntent),
            '2. AvatarContinuousMovementIntent is frozen, like every other closed vocabulary in this codebase');
        assert(Object.keys(AvatarContinuousMovementIntent).length === 3,
            '3. AvatarContinuousMovementIntent has no fourth value');
    }
    {
        assert(isValidAvatarContinuousMovementIntent(NONE), '4. NONE is valid');
        assert(isValidAvatarContinuousMovementIntent(FORWARD), '5. FORWARD is valid');
        assert(isValidAvatarContinuousMovementIntent(BACKWARD), '6. BACKWARD is valid');
        assert(!isValidAvatarContinuousMovementIntent('sideways'), '7. an unrelated string is not valid');
        assert(!isValidAvatarContinuousMovementIntent(undefined), '8. undefined is not valid');
        assert(!isValidAvatarContinuousMovementIntent(null), '9. null is not valid');
    }

    // -------------------------------------------------------------
    // Section B — activation: only an activating press sets/switches
    // -------------------------------------------------------------
    {
        const next = deriveAvatarContinuousMovementIntent({ currentIntent: NONE, direction: 'forward', activationRequested: true });
        assert(next === FORWARD, '10. Alt+W from no intent activates FORWARD');
    }
    {
        const next = deriveAvatarContinuousMovementIntent({ currentIntent: NONE, direction: 'backward', activationRequested: true });
        assert(next === BACKWARD, '11. Alt+S from no intent activates BACKWARD');
    }
    {
        const next = deriveAvatarContinuousMovementIntent({ currentIntent: FORWARD, direction: 'forward', activationRequested: true });
        assert(next === FORWARD, '12. re-activating the SAME direction while already active is idempotent, not a toggle-off');
    }
    {
        const next = deriveAvatarContinuousMovementIntent({ currentIntent: BACKWARD, direction: 'backward', activationRequested: true });
        assert(next === BACKWARD, '13. same idempotence holds for BACKWARD');
    }
    {
        const next = deriveAvatarContinuousMovementIntent({ currentIntent: FORWARD, direction: 'backward', activationRequested: true });
        assert(next === BACKWARD, '14. activating the OPPOSITE direction switches directly, FORWARD -> BACKWARD, in one call');
    }
    {
        const next = deriveAvatarContinuousMovementIntent({ currentIntent: BACKWARD, direction: 'forward', activationRequested: true });
        assert(next === FORWARD, '15. and switches the other way too, BACKWARD -> FORWARD');
    }

    // -------------------------------------------------------------
    // Section C — cancellation: an ordinary press always clears it
    // -------------------------------------------------------------
    {
        const next = deriveAvatarContinuousMovementIntent({ currentIntent: FORWARD, direction: 'forward', activationRequested: false });
        assert(next === NONE, '16. an ordinary W tap cancels continuous FORWARD (same-direction cancel)');
    }
    {
        const next = deriveAvatarContinuousMovementIntent({ currentIntent: FORWARD, direction: 'backward', activationRequested: false });
        assert(next === NONE, '17. an ordinary S tap cancels continuous FORWARD (opposite-direction cancel — the escape hatch)');
    }
    {
        const next = deriveAvatarContinuousMovementIntent({ currentIntent: BACKWARD, direction: 'backward', activationRequested: false });
        assert(next === NONE, '18. an ordinary S tap cancels continuous BACKWARD (same-direction cancel)');
    }
    {
        const next = deriveAvatarContinuousMovementIntent({ currentIntent: BACKWARD, direction: 'forward', activationRequested: false });
        assert(next === NONE, '19. an ordinary W tap cancels continuous BACKWARD (opposite-direction cancel)');
    }
    {
        const next = deriveAvatarContinuousMovementIntent({ currentIntent: NONE, direction: 'forward', activationRequested: false });
        assert(next === NONE, '20. ordinary W with no continuous intent active stays NONE — plain WASD walking is never touched by this file');
    }
    {
        const next = deriveAvatarContinuousMovementIntent({ currentIntent: NONE, direction: 'backward', activationRequested: false });
        assert(next === NONE, '21. same for ordinary S — no continuous intent to cancel, none created either');
    }
    {
        const next = deriveAvatarContinuousMovementIntent({ currentIntent: FORWARD, direction: 'forward' });
        assert(next === NONE, '22. omitting activationRequested entirely defaults to an ordinary (cancelling) press, never an activation');
    }

    // -------------------------------------------------------------
    // Section D — defensive / malformed input
    // -------------------------------------------------------------
    {
        const next = deriveAvatarContinuousMovementIntent({ currentIntent: FORWARD, direction: undefined, activationRequested: true });
        assert(next === FORWARD, '23. no direction at all means no movement key-down happened — intent is left exactly as it was');
    }
    {
        const next = deriveAvatarContinuousMovementIntent({ currentIntent: BACKWARD, direction: 'left', activationRequested: true });
        assert(next === BACKWARD, '24. an unrecognized direction string is ignored, matching this codebase\'s "degrade gracefully" posture');
    }
    {
        const next = deriveAvatarContinuousMovementIntent({ currentIntent: 'sideways', direction: 'nonsense' });
        assert(next === NONE, '25. a garbage currentIntent, when no real direction is present either, sanitizes to NONE rather than propagating garbage');
    }
    {
        const next = deriveAvatarContinuousMovementIntent();
        assert(next === NONE, '26. calling with no arguments at all is safe and returns NONE');
    }
    {
        const next = deriveAvatarContinuousMovementIntent({ direction: 'forward' });
        assert(next === NONE, '27. omitting currentIntent defaults to NONE, and an ordinary press from there stays NONE');
    }
    {
        const next = deriveAvatarContinuousMovementIntent({ currentIntent: NONE, direction: 'forward', activationRequested: 1 });
        assert(next === FORWARD, '28. a truthy non-boolean activationRequested (e.g. 1) is treated as an activation, coerced like every other boolean flag in this codebase');
    }
    {
        const next = deriveAvatarContinuousMovementIntent({ currentIntent: FORWARD, direction: 'forward', activationRequested: 0 });
        assert(next === NONE, '29. a falsy non-boolean activationRequested (e.g. 0) is treated as an ordinary, cancelling press');
    }

    // -------------------------------------------------------------
    // Section E — FLAGSHIP: the design doc's own scripted scenario,
    // plus purity/determinism
    // -------------------------------------------------------------
    {
        // "Alt + W activates forward mode; W up; Alt up;
        // avatar keeps moving forward" — key-UP is never modeled here
        // at all, so between derive() calls below, intent simply
        // persists on its own with no call needed to keep it alive.
        let intent = NONE;
        intent = deriveAvatarContinuousMovementIntent({ currentIntent: intent, direction: 'forward', activationRequested: true });
        assert(intent === FORWARD, '30. FLAGSHIP step 1: Alt+W activates continuous FORWARD');

        // Releasing W and Alt is not a call into this function at
        // all (see this file's own header) — `intent` above already IS
        // "what should exist after release": FORWARD, unchanged.

        // A later, ordinary W tap is the player's own explicit "stop."
        intent = deriveAvatarContinuousMovementIntent({ currentIntent: intent, direction: 'forward', activationRequested: false });
        assert(intent === NONE, '31. FLAGSHIP step 2: a later plain W tap cancels continuous FORWARD');

        // Now the backward equivalent, from scratch.
        intent = deriveAvatarContinuousMovementIntent({ currentIntent: intent, direction: 'backward', activationRequested: true });
        assert(intent === BACKWARD, '32. FLAGSHIP step 3: Alt+S activates continuous BACKWARD');

        // This time, the escape hatch: the OPPOSITE ordinary key cancels it.
        intent = deriveAvatarContinuousMovementIntent({ currentIntent: intent, direction: 'forward', activationRequested: false });
        assert(intent === NONE, '33. FLAGSHIP step 4: a plain W tap cancels continuous BACKWARD just as readily as a plain S tap would');

        // And a direct switch mid-flight, with no cancelling step at all.
        intent = deriveAvatarContinuousMovementIntent({ currentIntent: intent, direction: 'forward', activationRequested: true });
        intent = deriveAvatarContinuousMovementIntent({ currentIntent: intent, direction: 'backward', activationRequested: true });
        assert(intent === BACKWARD, '34. FLAGSHIP step 5: Alt+W then Alt+S switches straight from FORWARD to BACKWARD, no NONE in between');
    }
    {
        const options = { currentIntent: FORWARD, direction: 'backward', activationRequested: false };
        const snapshot = JSON.stringify(options);
        const first = deriveAvatarContinuousMovementIntent(options);
        const second = deriveAvatarContinuousMovementIntent(options);
        assert(first === second, '35. deriveAvatarContinuousMovementIntent is deterministic — identical input always produces identical output');
        assert(JSON.stringify(options) === snapshot, '36. deriveAvatarContinuousMovementIntent never mutates the options object it was given');
    }

    // -------------------------------------------------------------
    // Section F — architectural regression: no movement, no
    // controller, no timers, no raw keyboard handling
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../core/AvatarContinuousMovementIntent.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        const forbidden = [
            'AvatarMovementController', 'AvatarMovementState', 'simulateAvatarMovement',
            'AvatarMovementConstraint', 'AvatarTerrainConstraint', 'AvatarStepConstraint', 'AvatarTreeConstraint',
            'setTimeout', 'setInterval', 'requestAnimationFrame', 'performance.now', 'Date.now',
            'addEventListener', 'keydown', 'keyup', 'KeyboardEvent', 'getModifierState', 'Alt', 'alt',
            'THREE', 'from \'three\'', 'Renderer', 'WorldNavigationSession',
            'Math.random', 'localStorage', 'StorageProvider', 'fetch(', 'WebSocket',
            'velocity', 'acceleration', 'speed', 'position', 'rotation'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `37. core/AvatarContinuousMovementIntent.js's own code never references "${term}" — a pure vocabulary and transition rule only, never movement, never raw input handling`);
        }
    }
    {
        const exportsModule = await import('../core/AvatarContinuousMovementIntent.js');
        const exportedNames = Object.keys(exportsModule).sort();
        assert(JSON.stringify(exportedNames) === JSON.stringify(['AvatarContinuousMovementIntent', 'deriveAvatarContinuousMovementIntent', 'isValidAvatarContinuousMovementIntent']),
            '38. core/AvatarContinuousMovementIntent.js exports exactly the vocabulary, its validator, and the one transition function — nothing else');
    }

    console.log('✅ All Avatar Continuous Movement Intent tests passed.');
}

await runTests();
