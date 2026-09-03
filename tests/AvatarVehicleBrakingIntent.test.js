import { readFile } from 'node:fs/promises';
import {
    AvatarVehicleBrakingIntent,
    isValidAvatarVehicleBrakingIntent,
    deriveAvatarVehicleBrakingIntent
} from '../core/AvatarVehicleBrakingIntent.js';

// 0.9.95 — Vehicle Braking Intent, core/AvatarVehicleBrakingIntent.js.
//
//   Section A: the vocabulary itself — NONE/BRAKE, isValid()
//   Section B: activation — a brake request produces BRAKE
//   Section C: level-driven hold semantics — BRAKE keeps being reported
//              for as long as brakeRequested keeps arriving true (never
//              a one-shot consumption, unlike MOUNT/DISMOUNT), and
//              releasing reports NONE on the very next call
//   Section D: defensive/malformed input — degrades gracefully
//   Section E: FLAGSHIP — a full request/hold/release/request cycle,
//              plus purity/determinism
//   Section F: architectural regression — no vehicle, no capability/rate
//              awareness, no movement, no keyboard, no rendering; a pure
//              vocabulary and mapping only
//
// Central architectural claim under test throughout: this milestone
// never mentions a vehicle, a capability, or a braking RATE. Every
// assertion below concerns only what braking was just requested, never
// how fast anything actually slows down — see docs/Roadmap.md, 0.9.95.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function runTests() {
    const { NONE, BRAKE } = AvatarVehicleBrakingIntent;

    // -------------------------------------------------------------
    // Section A — the vocabulary itself
    // -------------------------------------------------------------
    {
        assert(NONE === 'none' && BRAKE === 'brake',
            '1. AvatarVehicleBrakingIntent has exactly the two expected values');
        assert(Object.isFrozen(AvatarVehicleBrakingIntent),
            '2. AvatarVehicleBrakingIntent is frozen, like every other closed vocabulary in this codebase');
        assert(Object.keys(AvatarVehicleBrakingIntent).length === 2,
            '3. AvatarVehicleBrakingIntent has no third value');
    }
    {
        assert(isValidAvatarVehicleBrakingIntent(NONE), '4. NONE is valid');
        assert(isValidAvatarVehicleBrakingIntent(BRAKE), '5. BRAKE is valid');
        assert(!isValidAvatarVehicleBrakingIntent('dismount'), '6. an unrelated string is not valid');
        assert(!isValidAvatarVehicleBrakingIntent(undefined), '7. undefined is not valid');
        assert(!isValidAvatarVehicleBrakingIntent(null), '8. null is not valid');
    }

    // -------------------------------------------------------------
    // Section B — activation: a brake request produces BRAKE
    // -------------------------------------------------------------
    {
        const next = deriveAvatarVehicleBrakingIntent({ brakeRequested: true });
        assert(next === BRAKE, '9. a brake request produces BRAKE');
    }
    {
        const next = deriveAvatarVehicleBrakingIntent({ brakeRequested: false });
        assert(next === NONE, '10. no request at all stays NONE');
    }
    {
        const next = deriveAvatarVehicleBrakingIntent();
        assert(next === NONE, '11. calling with no arguments at all is safe and returns NONE');
    }
    {
        const next = deriveAvatarVehicleBrakingIntent({});
        assert(next === NONE, '12. an empty options object defaults to no request');
    }

    // -------------------------------------------------------------
    // Section C — level-driven hold semantics: BRAKE is reported for as
    // long as brakeRequested keeps arriving true, never a one-shot
    // consumption (the direct architectural DIFFERENCE from
    // core/AvatarVehicleDismountIntent.js's own DISMOUNT)
    // -------------------------------------------------------------
    {
        // Repeating brakeRequested: true any number of times keeps
        // reporting BRAKE every single time — a continuous hold never
        // collapses back to NONE on its own the way a one-shot MOUNT/
        // DISMOUNT would once "consumed."
        let intent = deriveAvatarVehicleBrakingIntent({ brakeRequested: true });
        assert(intent === BRAKE, '13. first tick of a hold: BRAKE');
        intent = deriveAvatarVehicleBrakingIntent({ brakeRequested: true });
        assert(intent === BRAKE, '14. second consecutive tick of the SAME hold: still BRAKE, not consumed');
        intent = deriveAvatarVehicleBrakingIntent({ brakeRequested: true });
        assert(intent === BRAKE, '15. a third consecutive tick: still BRAKE — an arbitrarily long hold never runs out');
    }
    {
        // Releasing reports NONE on the very next call — immediate, no
        // decay, no delay.
        const next = deriveAvatarVehicleBrakingIntent({ brakeRequested: false });
        assert(next === NONE, '16. releasing the request reports NONE on the very next call');
    }
    {
        // A `currentIntent` a caller might still pass (matching the
        // shared-options-shape convenience
        // core/AvatarVehicleInteractionIntent.js/core/AvatarVehicleDismountIntent.js
        // already established for their own one-shot vocabularies) is
        // simply irrelevant here — this function has no state to fold
        // it into at all.
        const withGarbageCurrent = deriveAvatarVehicleBrakingIntent({ currentIntent: 'garbage', brakeRequested: true });
        assert(withGarbageCurrent === BRAKE, '17. an unrelated currentIntent field alongside a real request still produces BRAKE — nothing here reads it');
        const withGarbageCurrentReleased = deriveAvatarVehicleBrakingIntent({ currentIntent: BRAKE, brakeRequested: false });
        assert(withGarbageCurrentReleased === NONE, '18. and a currentIntent of BRAKE alongside no request still produces NONE — the past has no bearing on this level-driven fact');
    }

    // -------------------------------------------------------------
    // Section D — defensive / malformed input
    // -------------------------------------------------------------
    {
        const next = deriveAvatarVehicleBrakingIntent({ brakeRequested: 1 });
        assert(next === BRAKE, '19. a truthy non-boolean brakeRequested (e.g. 1) is treated as a request, coerced like every other boolean flag in this codebase');
    }
    {
        const next = deriveAvatarVehicleBrakingIntent({ brakeRequested: 0 });
        assert(next === NONE, '20. a falsy non-boolean brakeRequested (e.g. 0) is treated as no request');
    }
    {
        const next = deriveAvatarVehicleBrakingIntent({ brakeRequested: 'yes' });
        assert(next === BRAKE, '21. a truthy string is coerced to a request, matching the codebase-wide Boolean() coercion convention');
    }
    {
        const next = deriveAvatarVehicleBrakingIntent({ brakeRequested: null });
        assert(next === NONE, '22. a nullish brakeRequested is treated as no request');
    }
    {
        const next = deriveAvatarVehicleBrakingIntent({ brakeRequested: undefined });
        assert(next === NONE, '23. an explicit undefined brakeRequested falls through to the default, no request');
    }

    // -------------------------------------------------------------
    // Section E — FLAGSHIP: a full request/hold/release/request cycle,
    // plus purity/determinism
    // -------------------------------------------------------------
    {
        let intent = deriveAvatarVehicleBrakingIntent({ brakeRequested: true });
        assert(intent === BRAKE, '24. FLAGSHIP step 1: pressing the brake control produces BRAKE');

        intent = deriveAvatarVehicleBrakingIntent({ brakeRequested: true });
        assert(intent === BRAKE, '25. FLAGSHIP step 2: holding it keeps reporting BRAKE, tick after tick');

        intent = deriveAvatarVehicleBrakingIntent({ brakeRequested: true });
        assert(intent === BRAKE, '26. FLAGSHIP step 3: and again — an arbitrarily long hold is simply BRAKE, repeated');

        intent = deriveAvatarVehicleBrakingIntent({ brakeRequested: false });
        assert(intent === NONE, '27. FLAGSHIP step 4: releasing reports NONE immediately, on the very next call');

        intent = deriveAvatarVehicleBrakingIntent({ brakeRequested: true });
        assert(intent === BRAKE, '28. FLAGSHIP step 5: a later, independent brake request produces BRAKE again, exactly like the first');
    }
    {
        const options = { brakeRequested: true };
        const snapshot = JSON.stringify(options);
        const first = deriveAvatarVehicleBrakingIntent(options);
        const second = deriveAvatarVehicleBrakingIntent(options);
        assert(first === second, '29. deriveAvatarVehicleBrakingIntent is deterministic — identical input always produces identical output');
        assert(JSON.stringify(options) === snapshot, '30. deriveAvatarVehicleBrakingIntent never mutates the options object it was given');
    }

    // -------------------------------------------------------------
    // Section F — architectural regression: no vehicle, no capability/
    // rate awareness, no movement, no keyboard, no rendering — a pure
    // vocabulary and mapping only
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../core/AvatarVehicleBrakingIntent.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        const forbidden = [
            'VehiclePresence', 'VehicleIdentity', 'VehicleType', 'VehiclePlacement', 'vehicleId', 'vehicleType',
            'AvatarVehicleProximity', 'withinRange', 'proximity',
            'AvatarVehicleMount', 'AvatarVehicleMountTransition', 'currentMount', 'mounted', 'occupied',
            'AvatarVehicleInteractionIntent', 'AvatarVehicleDismountIntent',
            'AvatarMovementBrakingCapability', 'AvatarMovementBrakingKind', 'INSTANT', 'RATE_LIMITED',
            'AvatarVehicleMovementCapability', 'movementSpeed', 'acceleration', 'braking.', '.kind', 'capability',
            'AvatarVehicleBrakingInputAdapter', 'brakedown', 'brakeup',
            'AvatarMovementController', 'AvatarMovementState', 'simulateAvatarMovement', 'resolveMovementSpeed',
            'setTimeout', 'setInterval', 'requestAnimationFrame', 'performance.now', 'Date.now',
            'addEventListener', 'keydown', 'keyup', 'KeyboardEvent', 'getModifierState',
            'THREE', 'from \'three\'', 'Renderer', 'WorldNavigationSession',
            'Math.random', 'localStorage', 'StorageProvider', 'fetch(', 'WebSocket',
            'velocity', 'speed', 'position', 'rotation', 'collision', 'physics'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `31. core/AvatarVehicleBrakingIntent.js's own code never references "${term}" — a pure vocabulary and mapping only, never vehicle-aware, never capability/rate-aware, never movement, never raw input handling`);
        }
    }
    {
        // The strongest architectural regression: this file must not
        // even IMPORT anything — the intent must not need to know a
        // capability, a vehicle, or an input adapter exists.
        const sourceUrl = new URL('../core/AvatarVehicleBrakingIntent.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        assert(!/^\s*import\b/m.test(source),
            '32. core/AvatarVehicleBrakingIntent.js has no import statements at all — it does not depend on AvatarMovementBrakingCapability, AvatarVehicleBrakingInputAdapter, or anything else in this codebase');
    }
    {
        const exportsModule = await import('../core/AvatarVehicleBrakingIntent.js');
        const exportedNames = Object.keys(exportsModule).sort();
        assert(JSON.stringify(exportedNames) === JSON.stringify(['AvatarVehicleBrakingIntent', 'deriveAvatarVehicleBrakingIntent', 'isValidAvatarVehicleBrakingIntent']),
            '33. core/AvatarVehicleBrakingIntent.js exports exactly the vocabulary, its validator, and the one transition function — nothing else');
    }

    console.log('✅ All Vehicle Braking Intent tests passed.');
}

await runTests();
