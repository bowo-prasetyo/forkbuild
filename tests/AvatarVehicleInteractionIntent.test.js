import { readFile } from 'node:fs/promises';
import {
    AvatarVehicleInteractionIntent,
    isValidAvatarVehicleInteractionIntent,
    deriveAvatarVehicleInteractionIntent
} from '../core/AvatarVehicleInteractionIntent.js';

// 0.9.75 — Avatar-Vehicle Interaction Intent, core/AvatarVehicleInteractionIntent.js.
//
//   Section A: the vocabulary itself — NONE/MOUNT, isValid()
//   Section B: activation — a mount request produces MOUNT
//   Section C: one-shot consumption — MOUNT clears back to NONE the
//              moment the request stops being asserted, and holding the
//              request (key-repeat) stays idempotent
//   Section D: defensive/malformed input — degrades gracefully
//   Section E: FLAGSHIP — a full request/consume/request cycle, plus
//              purity/determinism
//   Section F: architectural regression — no vehicle, no proximity, no
//              mounting-as-effect, no keyboard, no rendering, no
//              movement; a pure vocabulary and transition rule only
//
// Central architectural claim under test throughout: this milestone
// never mentions a vehicle. Every assertion below concerns only what
// INTERACTION INTENT was just requested, never which vehicle (if any)
// should receive it — see docs/Roadmap.md, 0.9.75.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function runTests() {
    const { NONE, MOUNT } = AvatarVehicleInteractionIntent;

    // -------------------------------------------------------------
    // Section A — the vocabulary itself
    // -------------------------------------------------------------
    {
        assert(NONE === 'none' && MOUNT === 'mount',
            '1. AvatarVehicleInteractionIntent has exactly the two expected values');
        assert(Object.isFrozen(AvatarVehicleInteractionIntent),
            '2. AvatarVehicleInteractionIntent is frozen, like every other closed vocabulary in this codebase');
        assert(Object.keys(AvatarVehicleInteractionIntent).length === 2,
            '3. AvatarVehicleInteractionIntent has no third value');
    }
    {
        assert(isValidAvatarVehicleInteractionIntent(NONE), '4. NONE is valid');
        assert(isValidAvatarVehicleInteractionIntent(MOUNT), '5. MOUNT is valid');
        assert(!isValidAvatarVehicleInteractionIntent('dismount'), '6. an unrelated string is not valid');
        assert(!isValidAvatarVehicleInteractionIntent(undefined), '7. undefined is not valid');
        assert(!isValidAvatarVehicleInteractionIntent(null), '8. null is not valid');
    }

    // -------------------------------------------------------------
    // Section B — activation: a mount request produces MOUNT
    // -------------------------------------------------------------
    {
        const next = deriveAvatarVehicleInteractionIntent({ mountRequested: true });
        assert(next === MOUNT, '9. a mount request from nothing produces MOUNT');
    }
    {
        const next = deriveAvatarVehicleInteractionIntent({ currentIntent: NONE, mountRequested: true });
        assert(next === MOUNT, '10. an explicit currentIntent of NONE alongside a mount request still produces MOUNT');
    }
    {
        const next = deriveAvatarVehicleInteractionIntent({ mountRequested: false });
        assert(next === NONE, '11. no request at all stays NONE');
    }
    {
        const next = deriveAvatarVehicleInteractionIntent();
        assert(next === NONE, '12. calling with no arguments at all is safe and returns NONE');
    }

    // -------------------------------------------------------------
    // Section C — one-shot consumption and key-repeat idempotence
    // -------------------------------------------------------------
    {
        // MOUNT + no request -> NONE: the request is consumed the moment
        // the caller stops asserting it, regardless of what the caller
        // claims the "current" intent still is.
        const next = deriveAvatarVehicleInteractionIntent({ currentIntent: MOUNT, mountRequested: false });
        assert(next === NONE, '13. MOUNT is consumed back to NONE the instant the request is no longer asserted');
    }
    {
        // MOUNT + mount request -> MOUNT: holding the interaction key
        // down (key-repeat) never compounds into a "second" request —
        // it is simply the same MOUNT, again.
        const next = deriveAvatarVehicleInteractionIntent({ currentIntent: MOUNT, mountRequested: true });
        assert(next === MOUNT, '14. a repeated mount request (key-repeat) is idempotent, not a second distinct action');
    }
    {
        // currentIntent is irrelevant to the outcome — a garbage value
        // alongside a real request still produces the correct result,
        // proving the past has no bearing on this one-shot fact.
        const next = deriveAvatarVehicleInteractionIntent({ currentIntent: 'garbage', mountRequested: true });
        assert(next === MOUNT, '15. currentIntent is ignored entirely — the outcome depends only on mountRequested');
    }
    {
        const next = deriveAvatarVehicleInteractionIntent({ currentIntent: 'garbage', mountRequested: false });
        assert(next === NONE, '16. and stays ignored when there is no request either, sanitizing to NONE rather than propagating garbage');
    }

    // -------------------------------------------------------------
    // Section D — defensive / malformed input
    // -------------------------------------------------------------
    {
        const next = deriveAvatarVehicleInteractionIntent({ mountRequested: 1 });
        assert(next === MOUNT, '17. a truthy non-boolean mountRequested (e.g. 1) is treated as a request, coerced like every other boolean flag in this codebase');
    }
    {
        const next = deriveAvatarVehicleInteractionIntent({ mountRequested: 0 });
        assert(next === NONE, '18. a falsy non-boolean mountRequested (e.g. 0) is treated as no request');
    }
    {
        const next = deriveAvatarVehicleInteractionIntent({ mountRequested: 'yes' });
        assert(next === MOUNT, '19. a truthy string is coerced to a request, matching the codebase-wide Boolean() coercion convention');
    }
    {
        const next = deriveAvatarVehicleInteractionIntent({ mountRequested: null });
        assert(next === NONE, '20. a nullish mountRequested is treated as no request');
    }
    {
        const next = deriveAvatarVehicleInteractionIntent({});
        assert(next === NONE, '21. an empty options object defaults to no request');
    }

    // -------------------------------------------------------------
    // Section E — FLAGSHIP: a full request/consume/request cycle,
    // plus purity/determinism
    // -------------------------------------------------------------
    {
        // Press the interaction key: a mount is requested.
        let intent = deriveAvatarVehicleInteractionIntent({ currentIntent: NONE, mountRequested: true });
        assert(intent === MOUNT, '22. FLAGSHIP step 1: an interaction request produces MOUNT');

        // A future mounting transition reads MOUNT here and acts on it —
        // this file has no idea whether it succeeded, failed, or found
        // no vehicle in range at all. Either way, the request is now
        // consumed: the very next call with no request clears it.
        intent = deriveAvatarVehicleInteractionIntent({ currentIntent: intent, mountRequested: false });
        assert(intent === NONE, '23. FLAGSHIP step 2: the request is consumed back to NONE once it is no longer asserted');

        // A second, independent press later on works exactly the same
        // way — nothing about the first cycle lingers.
        intent = deriveAvatarVehicleInteractionIntent({ currentIntent: intent, mountRequested: true });
        assert(intent === MOUNT, '24. FLAGSHIP step 3: a later, independent interaction request produces MOUNT again');

        intent = deriveAvatarVehicleInteractionIntent({ currentIntent: intent, mountRequested: false });
        assert(intent === NONE, '25. FLAGSHIP step 4: and is consumed again, identically');
    }
    {
        const options = { currentIntent: MOUNT, mountRequested: true };
        const snapshot = JSON.stringify(options);
        const first = deriveAvatarVehicleInteractionIntent(options);
        const second = deriveAvatarVehicleInteractionIntent(options);
        assert(first === second, '26. deriveAvatarVehicleInteractionIntent is deterministic — identical input always produces identical output');
        assert(JSON.stringify(options) === snapshot, '27. deriveAvatarVehicleInteractionIntent never mutates the options object it was given');
    }

    // -------------------------------------------------------------
    // Section F — architectural regression: no vehicle, no proximity,
    // no mounting-as-effect, no keyboard, no rendering, no movement
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../core/AvatarVehicleInteractionIntent.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        const forbidden = [
            'VehiclePresence', 'VehicleIdentity', 'VehicleType', 'VehiclePlacement', 'vehicleId', 'vehicleType',
            'AvatarVehicleProximity', 'withinRange', 'proximity', 'nearestVehicle',
            'dismount', 'currentVehicle', 'occupied',
            'AvatarMovementController', 'AvatarMovementState', 'simulateAvatarMovement',
            'setTimeout', 'setInterval', 'requestAnimationFrame', 'performance.now', 'Date.now',
            'addEventListener', 'keydown', 'keyup', 'KeyboardEvent', 'getModifierState',
            'THREE', 'from \'three\'', 'Renderer', 'WorldNavigationSession',
            'Math.random', 'localStorage', 'StorageProvider', 'fetch(', 'WebSocket',
            'velocity', 'acceleration', 'speed', 'position', 'rotation', 'collision', 'physics'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `28. core/AvatarVehicleInteractionIntent.js's own code never references "${term}" — a pure vocabulary and transition rule only, never vehicle-aware, never movement, never raw input handling`);
        }
    }
    {
        const exportsModule = await import('../core/AvatarVehicleInteractionIntent.js');
        const exportedNames = Object.keys(exportsModule).sort();
        assert(JSON.stringify(exportedNames) === JSON.stringify(['AvatarVehicleInteractionIntent', 'deriveAvatarVehicleInteractionIntent', 'isValidAvatarVehicleInteractionIntent']),
            '29. core/AvatarVehicleInteractionIntent.js exports exactly the vocabulary, its validator, and the one transition function — nothing else');
    }

    console.log('✅ All Avatar Vehicle Interaction Intent tests passed.');
}

await runTests();
