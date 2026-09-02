import { readFile } from 'node:fs/promises';
import {
    AvatarVehicleDismountIntent,
    isValidAvatarVehicleDismountIntent,
    deriveAvatarVehicleDismountIntent
} from '../core/AvatarVehicleDismountIntent.js';

// 0.9.79 — Avatar-Vehicle Dismount Intent, core/AvatarVehicleDismountIntent.js.
//
//   Section A: the vocabulary itself — NONE/DISMOUNT, isValid()
//   Section B: activation — a dismount request produces DISMOUNT
//   Section C: one-shot consumption — DISMOUNT clears back to NONE the
//              moment the request stops being asserted, and holding the
//              request (key-repeat) stays idempotent
//   Section D: defensive/malformed input — degrades gracefully
//   Section E: FLAGSHIP — a full request/release/request cycle, plus
//              purity/determinism
//   Section F: architectural regression — no vehicle, no mount-state
//              awareness, no dismount transition, no position/terrain/
//              collision, no keyboard, no rendering, no movement; a pure
//              vocabulary and transition rule only
//
// Central architectural claim under test throughout: this milestone
// never mentions a vehicle or a mount. Every assertion below concerns
// only what DISMOUNT INTENT was just requested, never whether the
// avatar is actually mounted on anything — see docs/Roadmap.md, 0.9.79.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function runTests() {
    const { NONE, DISMOUNT } = AvatarVehicleDismountIntent;

    // -------------------------------------------------------------
    // Section A — the vocabulary itself
    // -------------------------------------------------------------
    {
        assert(NONE === 'none' && DISMOUNT === 'dismount',
            '1. AvatarVehicleDismountIntent has exactly the two expected values');
        assert(Object.isFrozen(AvatarVehicleDismountIntent),
            '2. AvatarVehicleDismountIntent is frozen, like every other closed vocabulary in this codebase');
        assert(Object.keys(AvatarVehicleDismountIntent).length === 2,
            '3. AvatarVehicleDismountIntent has no third value');
    }
    {
        assert(isValidAvatarVehicleDismountIntent(NONE), '4. NONE is valid');
        assert(isValidAvatarVehicleDismountIntent(DISMOUNT), '5. DISMOUNT is valid');
        assert(!isValidAvatarVehicleDismountIntent('mount'), '6. an unrelated string is not valid');
        assert(!isValidAvatarVehicleDismountIntent(undefined), '7. undefined is not valid');
        assert(!isValidAvatarVehicleDismountIntent(null), '8. null is not valid');
    }

    // -------------------------------------------------------------
    // Section B — activation: a dismount request produces DISMOUNT
    // -------------------------------------------------------------
    {
        const next = deriveAvatarVehicleDismountIntent({ dismountRequested: true });
        assert(next === DISMOUNT, '9. a dismount request from nothing produces DISMOUNT');
    }
    {
        const next = deriveAvatarVehicleDismountIntent({ currentIntent: NONE, dismountRequested: true });
        assert(next === DISMOUNT, '10. an explicit currentIntent of NONE alongside a dismount request still produces DISMOUNT');
    }
    {
        const next = deriveAvatarVehicleDismountIntent({ dismountRequested: false });
        assert(next === NONE, '11. no request at all stays NONE');
    }
    {
        const next = deriveAvatarVehicleDismountIntent();
        assert(next === NONE, '12. calling with no arguments at all is safe and returns NONE');
    }

    // -------------------------------------------------------------
    // Section C — one-shot consumption and key-repeat idempotence
    // -------------------------------------------------------------
    {
        // DISMOUNT + no request -> NONE: the request is consumed the
        // moment the caller stops asserting it, regardless of what the
        // caller claims the "current" intent still is.
        const next = deriveAvatarVehicleDismountIntent({ currentIntent: DISMOUNT, dismountRequested: false });
        assert(next === NONE, '13. DISMOUNT is consumed back to NONE the instant the request is no longer asserted');
    }
    {
        // DISMOUNT + dismount request -> DISMOUNT: holding the dismount
        // key down (key-repeat) never compounds into a "second" request
        // — it is simply the same DISMOUNT, again.
        const next = deriveAvatarVehicleDismountIntent({ currentIntent: DISMOUNT, dismountRequested: true });
        assert(next === DISMOUNT, '14. a repeated dismount request (key-repeat) is idempotent, not a second distinct action');
    }
    {
        // currentIntent is irrelevant to the outcome — a garbage value
        // alongside a real request still produces the correct result,
        // proving the past has no bearing on this one-shot fact.
        const next = deriveAvatarVehicleDismountIntent({ currentIntent: 'garbage', dismountRequested: true });
        assert(next === DISMOUNT, '15. currentIntent is ignored entirely — the outcome depends only on dismountRequested');
    }
    {
        const next = deriveAvatarVehicleDismountIntent({ currentIntent: 'garbage', dismountRequested: false });
        assert(next === NONE, '16. and stays ignored when there is no request either, sanitizing to NONE rather than propagating garbage');
    }

    // -------------------------------------------------------------
    // Section D — defensive / malformed input
    // -------------------------------------------------------------
    {
        const next = deriveAvatarVehicleDismountIntent({ dismountRequested: 1 });
        assert(next === DISMOUNT, '17. a truthy non-boolean dismountRequested (e.g. 1) is treated as a request, coerced like every other boolean flag in this codebase');
    }
    {
        const next = deriveAvatarVehicleDismountIntent({ dismountRequested: 0 });
        assert(next === NONE, '18. a falsy non-boolean dismountRequested (e.g. 0) is treated as no request');
    }
    {
        const next = deriveAvatarVehicleDismountIntent({ dismountRequested: 'yes' });
        assert(next === DISMOUNT, '19. a truthy string is coerced to a request, matching the codebase-wide Boolean() coercion convention');
    }
    {
        const next = deriveAvatarVehicleDismountIntent({ dismountRequested: null });
        assert(next === NONE, '20. a nullish dismountRequested is treated as no request');
    }
    {
        const next = deriveAvatarVehicleDismountIntent({});
        assert(next === NONE, '21. an empty options object defaults to no request');
    }

    // -------------------------------------------------------------
    // Section E — FLAGSHIP: a full request/release/request cycle,
    // plus purity/determinism
    // -------------------------------------------------------------
    {
        // Press the dismount key: a dismount is requested.
        let intent = deriveAvatarVehicleDismountIntent({ currentIntent: NONE, dismountRequested: true });
        assert(intent === DISMOUNT, '22. FLAGSHIP step 1: a dismount request produces DISMOUNT');

        // A future dismount transition reads DISMOUNT here and decides
        // whether it is meaningful (e.g. whether the avatar is actually
        // mounted) — this file has no idea. Either way, the request is
        // now consumed: the very next call with no request clears it.
        intent = deriveAvatarVehicleDismountIntent({ currentIntent: intent, dismountRequested: false });
        assert(intent === NONE, '23. FLAGSHIP step 2: the request is consumed back to NONE once it is no longer asserted');

        // A second, independent press later on works exactly the same
        // way — nothing about the first cycle lingers.
        intent = deriveAvatarVehicleDismountIntent({ currentIntent: intent, dismountRequested: true });
        assert(intent === DISMOUNT, '24. FLAGSHIP step 3: a later, independent dismount request produces DISMOUNT again');

        intent = deriveAvatarVehicleDismountIntent({ currentIntent: intent, dismountRequested: false });
        assert(intent === NONE, '25. FLAGSHIP step 4: and is consumed again, identically');
    }
    {
        const options = { currentIntent: DISMOUNT, dismountRequested: true };
        const snapshot = JSON.stringify(options);
        const first = deriveAvatarVehicleDismountIntent(options);
        const second = deriveAvatarVehicleDismountIntent(options);
        assert(first === second, '26. deriveAvatarVehicleDismountIntent is deterministic — identical input always produces identical output');
        assert(JSON.stringify(options) === snapshot, '27. deriveAvatarVehicleDismountIntent never mutates the options object it was given');
    }

    // -------------------------------------------------------------
    // Section F — architectural regression: no vehicle, no mount-state
    // awareness, no dismount transition, no position/terrain/collision,
    // no keyboard, no rendering, no movement
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../core/AvatarVehicleDismountIntent.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        const forbidden = [
            'VehiclePresence', 'VehicleIdentity', 'VehicleType', 'VehiclePlacement', 'vehicleId', 'vehicleType',
            'AvatarVehicleProximity', 'withinRange', 'proximity', 'nearestVehicle',
            'AvatarVehicleMount', 'AvatarVehicleMountTransition', 'currentMount', 'isValidAvatarVehicleMount',
            'createAvatarVehicleMount', 'deriveAvatarVehicleMount', 'mounted', 'occupied',
            'AvatarVehicleInteractionIntent', 'AvatarVehicleInteractionTarget', "'mount'",
            'terrain', 'clearance', 'orientation', 'geometry',
            'AvatarMovementController', 'AvatarMovementState', 'simulateAvatarMovement',
            'setTimeout', 'setInterval', 'requestAnimationFrame', 'performance.now', 'Date.now',
            'addEventListener', 'keydown', 'keyup', 'KeyboardEvent', 'getModifierState',
            'THREE', 'from \'three\'', 'Renderer', 'WorldNavigationSession',
            'Math.random', 'localStorage', 'StorageProvider', 'fetch(', 'WebSocket',
            'velocity', 'acceleration', 'speed', 'position', 'rotation', 'collision', 'physics'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `28. core/AvatarVehicleDismountIntent.js's own code never references "${term}" — a pure vocabulary and transition rule only, never vehicle-aware, never mount-state-aware, never movement, never raw input handling`);
        }
    }
    {
        // The strongest architectural regression: this file must not
        // even IMPORT AvatarVehicleMount — the intent must not need to
        // know whether the avatar is actually mounted.
        const sourceUrl = new URL('../core/AvatarVehicleDismountIntent.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        assert(!/^\s*import\b/m.test(source),
            '29. core/AvatarVehicleDismountIntent.js has no import statements at all — it does not depend on AvatarVehicleMount, AvatarVehicleInteractionIntent, or anything else in this codebase');
    }
    {
        const exportsModule = await import('../core/AvatarVehicleDismountIntent.js');
        const exportedNames = Object.keys(exportsModule).sort();
        assert(JSON.stringify(exportedNames) === JSON.stringify(['AvatarVehicleDismountIntent', 'deriveAvatarVehicleDismountIntent', 'isValidAvatarVehicleDismountIntent']),
            '30. core/AvatarVehicleDismountIntent.js exports exactly the vocabulary, its validator, and the one transition function — nothing else');
    }

    console.log('✅ All Avatar Vehicle Dismount Intent tests passed.');
}

await runTests();
