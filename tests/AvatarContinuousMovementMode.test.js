import { readFile } from 'node:fs/promises';
import {
    AvatarContinuousMovementMode,
    isValidAvatarContinuousMovementMode,
    deriveAvatarContinuousMovementMode
} from '../core/AvatarContinuousMovementMode.js';

// 0.9.67 — Continuous Movement Mode Vocabulary, core/AvatarContinuousMovementMode.js.
//
//   Section A: the vocabulary itself — NONE/WALK/RUN, isValid()
//   Section B: activation — an activating press sets/switches the mode
//               (WALK vs RUN driven purely by runRequested)
//   Section C: cancellation — an ordinary press always clears it
//   Section D: defensive/malformed input — degrades gracefully
//   Section E: FLAGSHIP — a scripted Caps Lock (+ Shift) + W/S scenario,
//              replayed as a sequence of derive() calls, plus
//              purity/determinism
//   Section F: architectural regression — no movement, no controller, no
//              timers, no raw keyboard handling; a pure vocabulary and
//              transition rule only
//
// Central architectural claim under test throughout, mirroring
// tests/AvatarContinuousMovementIntent.test.js: this milestone moves
// nothing and knows no speed values. Every assertion below concerns only
// what MODE should exist, never an avatar position or a numeric speed —
// see docs/Roadmap.md, 0.9.67.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function runTests() {
    const { NONE, WALK, RUN } = AvatarContinuousMovementMode;

    // -------------------------------------------------------------
    // Section A — the vocabulary itself
    // -------------------------------------------------------------
    {
        assert(NONE === 'none' && WALK === 'walk' && RUN === 'run',
            '1. AvatarContinuousMovementMode has exactly the three expected values');
        assert(Object.isFrozen(AvatarContinuousMovementMode),
            '2. AvatarContinuousMovementMode is frozen, like every other closed vocabulary in this codebase');
        assert(Object.keys(AvatarContinuousMovementMode).length === 3,
            '3. AvatarContinuousMovementMode has no fourth value');
    }
    {
        assert(isValidAvatarContinuousMovementMode(NONE), '4. NONE is valid');
        assert(isValidAvatarContinuousMovementMode(WALK), '5. WALK is valid');
        assert(isValidAvatarContinuousMovementMode(RUN), '6. RUN is valid');
        assert(!isValidAvatarContinuousMovementMode('sprint'), '7. an unrelated string is not valid');
        assert(!isValidAvatarContinuousMovementMode(undefined), '8. undefined is not valid');
        assert(!isValidAvatarContinuousMovementMode(null), '9. null is not valid');
    }

    // -------------------------------------------------------------
    // Section B — activation: only an activating press sets/switches,
    // WALK vs RUN chosen purely by runRequested
    // -------------------------------------------------------------
    {
        const next = deriveAvatarContinuousMovementMode({ currentMode: NONE, activationRequested: true, runRequested: false });
        assert(next === WALK, '10. CapsLock+W from no mode activates persistent WALK');
    }
    {
        const next = deriveAvatarContinuousMovementMode({ currentMode: NONE, activationRequested: true, runRequested: true });
        assert(next === RUN, '11. CapsLock+Shift+W from no mode activates persistent RUN');
    }
    {
        const next = deriveAvatarContinuousMovementMode({ currentMode: WALK, activationRequested: true, runRequested: false });
        assert(next === WALK, '12. re-activating WALK while already WALK is idempotent, not a toggle-off');
    }
    {
        const next = deriveAvatarContinuousMovementMode({ currentMode: RUN, activationRequested: true, runRequested: true });
        assert(next === RUN, '13. same idempotence holds for RUN');
    }
    {
        const next = deriveAvatarContinuousMovementMode({ currentMode: WALK, activationRequested: true, runRequested: true });
        assert(next === RUN, '14. re-activating with Shift now held switches WALK -> RUN directly, in one call');
    }
    {
        const next = deriveAvatarContinuousMovementMode({ currentMode: RUN, activationRequested: true, runRequested: false });
        assert(next === WALK, '15. and switches back the other way too, RUN -> WALK (Shift released, re-activated)');
    }

    // -------------------------------------------------------------
    // Section C — cancellation: an ordinary press always clears it,
    // regardless of runRequested
    // -------------------------------------------------------------
    {
        const next = deriveAvatarContinuousMovementMode({ currentMode: WALK, activationRequested: false, runRequested: false });
        assert(next === NONE, '16. an ordinary W tap cancels continuous WALK');
    }
    {
        const next = deriveAvatarContinuousMovementMode({ currentMode: RUN, activationRequested: false, runRequested: false });
        assert(next === NONE, '17. an ordinary W tap cancels continuous RUN just as readily');
    }
    {
        const next = deriveAvatarContinuousMovementMode({ currentMode: RUN, activationRequested: false, runRequested: true });
        assert(next === NONE, '18. an ordinary press with Shift ALSO physically held still cancels — activationRequested, not runRequested, gates activation at all');
    }
    {
        const next = deriveAvatarContinuousMovementMode({ currentMode: NONE, activationRequested: false, runRequested: false });
        assert(next === NONE, '19. ordinary W with no continuous mode active stays NONE — plain WASD/Shift walking is never touched by this file');
    }
    {
        const next = deriveAvatarContinuousMovementMode({ currentMode: WALK, activationRequested: false });
        assert(next === NONE, '20. omitting activationRequested entirely defaults to an ordinary (cancelling) press, never an activation');
    }

    // -------------------------------------------------------------
    // Section D — defensive / malformed input
    // -------------------------------------------------------------
    {
        const next = deriveAvatarContinuousMovementMode({ currentMode: 'sprinting', activationRequested: true, runRequested: false });
        assert(next === WALK, '21. a garbage currentMode never leaks into the result — activation still resolves purely from runRequested');
    }
    {
        const next = deriveAvatarContinuousMovementMode({ currentMode: 'sprinting', activationRequested: false });
        assert(next === NONE, '22. a garbage currentMode combined with an ordinary press still resolves to the sane NONE, not the garbage value');
    }
    {
        const next = deriveAvatarContinuousMovementMode();
        assert(next === NONE, '23. calling with no arguments at all is safe and returns NONE');
    }
    {
        const next = deriveAvatarContinuousMovementMode({ activationRequested: true, runRequested: true });
        assert(next === RUN, '24. omitting currentMode entirely still activates correctly — this function never needs to read it');
    }
    {
        const next = deriveAvatarContinuousMovementMode({ currentMode: NONE, activationRequested: 1, runRequested: 0 });
        assert(next === WALK, '25. truthy/falsy non-boolean activationRequested/runRequested (e.g. 1/0) are coerced like every other boolean flag in this codebase');
    }
    {
        const next = deriveAvatarContinuousMovementMode({ currentMode: NONE, activationRequested: 0, runRequested: 1 });
        assert(next === NONE, '26. a falsy activationRequested cancels regardless of a truthy runRequested');
    }

    // -------------------------------------------------------------
    // Section E — FLAGSHIP: a scripted scenario, plus purity/determinism
    // -------------------------------------------------------------
    {
        // "CapsLock + W activates persistent WALK; W up; CapsLock up;
        // avatar keeps walking" — key-UP is never modeled here at all,
        // so between derive() calls below, mode simply persists on its
        // own with no call needed to keep it alive.
        let mode = NONE;
        mode = deriveAvatarContinuousMovementMode({ currentMode: mode, activationRequested: true, runRequested: false });
        assert(mode === WALK, '27. FLAGSHIP step 1: CapsLock+W activates continuous WALK');

        // Releasing W and Caps Lock is not a call into this function at
        // all (see this file's own header) — `mode` above already IS
        // "what should exist after release": WALK, unchanged.

        // Now the player adds Shift and re-activates: CapsLock+Shift+W.
        mode = deriveAvatarContinuousMovementMode({ currentMode: mode, activationRequested: true, runRequested: true });
        assert(mode === RUN, '28. FLAGSHIP step 2: re-activating with Shift held upgrades continuous WALK to continuous RUN, in one call');

        // A later, ordinary W tap is the player's own explicit "stop" —
        // exactly as it cancels continuous direction.
        mode = deriveAvatarContinuousMovementMode({ currentMode: mode, activationRequested: false, runRequested: false });
        assert(mode === NONE, '29. FLAGSHIP step 3: a later plain W tap cancels continuous RUN entirely');

        // From scratch again, straight to RUN.
        mode = deriveAvatarContinuousMovementMode({ currentMode: mode, activationRequested: true, runRequested: true });
        assert(mode === RUN, '30. FLAGSHIP step 4: CapsLock+Shift+S activates continuous RUN directly, no WALK stop-over needed');

        // And downgrading directly from RUN to WALK, no NONE in between.
        mode = deriveAvatarContinuousMovementMode({ currentMode: mode, activationRequested: true, runRequested: false });
        assert(mode === WALK, '31. FLAGSHIP step 5: re-activating without Shift downgrades continuous RUN straight to continuous WALK');
    }
    {
        const options = { currentMode: RUN, activationRequested: false, runRequested: true };
        const snapshot = JSON.stringify(options);
        const first = deriveAvatarContinuousMovementMode(options);
        const second = deriveAvatarContinuousMovementMode(options);
        assert(first === second, '32. deriveAvatarContinuousMovementMode is deterministic — identical input always produces identical output');
        assert(JSON.stringify(options) === snapshot, '33. deriveAvatarContinuousMovementMode never mutates the options object it was given');
    }

    // -------------------------------------------------------------
    // Section F — architectural regression: no movement, no
    // controller, no timers, no raw keyboard handling, no speed values
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../core/AvatarContinuousMovementMode.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        const forbidden = [
            'AvatarMovementController', 'AvatarMovementState', 'simulateAvatarMovement',
            'AvatarMovementConstraint', 'AvatarTerrainConstraint', 'AvatarStepConstraint', 'AvatarTreeConstraint',
            'AvatarContinuousMovementIntent', 'AvatarContinuousMovementInputAdapter',
            'setTimeout', 'setInterval', 'requestAnimationFrame', 'performance.now', 'Date.now',
            'addEventListener', 'keydown', 'keyup', 'KeyboardEvent', 'getModifierState', 'CapsLock', 'capslock',
            'THREE', 'from \'three\'', 'Renderer', 'WorldNavigationSession',
            'Math.random', 'localStorage', 'StorageProvider', 'fetch(', 'WebSocket',
            'velocity', 'acceleration', 'speed', 'position', 'rotation'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `34. core/AvatarContinuousMovementMode.js's own code never references "${term}" — a pure vocabulary and transition rule only, never movement, never raw input handling, never a speed number`);
        }
    }
    {
        const exportsModule = await import('../core/AvatarContinuousMovementMode.js');
        const exportedNames = Object.keys(exportsModule).sort();
        assert(JSON.stringify(exportedNames) === JSON.stringify(['AvatarContinuousMovementMode', 'deriveAvatarContinuousMovementMode', 'isValidAvatarContinuousMovementMode']),
            '35. core/AvatarContinuousMovementMode.js exports exactly the vocabulary, its validator, and the one transition function — nothing else');
    }

    console.log('✅ All Avatar Continuous Movement Mode tests passed.');
}

await runTests();
