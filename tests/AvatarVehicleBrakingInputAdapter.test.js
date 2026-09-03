import { readFile } from 'node:fs/promises';
import { deriveAvatarVehicleBrakingInputFact } from '../core/AvatarVehicleBrakingInputAdapter.js';
import {
    AvatarVehicleBrakingIntent,
    deriveAvatarVehicleBrakingIntent
} from '../core/AvatarVehicleBrakingIntent.js';

// 0.9.95 — Vehicle Braking Input Adapter,
// core/AvatarVehicleBrakingInputAdapter.js.
//
//   Section A: brake control pressed ('brakedown') -> requested
//   Section B: brake control released ('brakeup') -> not requested
//   Section C: unrecognized/malformed input degrades to not requested
//   Section D: no keyboard dependency — no `key` parameter changes the
//              outcome, because none exists
//   Section E: statelessness/idempotence — repeated identical facts
//              produce the identical result, with no caller-owned state
//              threaded between calls
//   Section F: FLAGSHIP — a full press/hold/release/press scenario run
//              through the adapter and straight into
//              deriveAvatarVehicleBrakingIntent()
//   Section G: architectural regression — no vehicle, no key/keyboard
//              vocabulary, no intent derivation, no movement
//
// Central architectural claim under test throughout: this file only
// TRANSLATES an already-abstract "brake control" event into the shape
// core/AvatarVehicleBrakingIntent.js already knows how to interpret — it
// never calls that function itself, never decides what a request MEANS,
// and — the one property this milestone insists on above every other —
// never once mentions a specific key, mouse button, or gamepad control.
// See docs/Roadmap.md, 0.9.95.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function runTests() {
    // -------------------------------------------------------------
    // Section A — brake control pressed
    // -------------------------------------------------------------
    {
        const fact = deriveAvatarVehicleBrakingInputFact({ type: 'brakedown' });
        assert(fact.brakeRequested === true, '1. a brakedown fact reports brakeRequested: true');
    }
    {
        // Case-insensitive, matching this codebase's own raw-string
        // comparison convention (e.g.
        // application/AvatarMovementController.js#_setKey).
        const fact = deriveAvatarVehicleBrakingInputFact({ type: 'BrakeDown' });
        assert(fact.brakeRequested === true, '2. type comparison is case-insensitive');
    }

    // -------------------------------------------------------------
    // Section B — brake control released
    // -------------------------------------------------------------
    {
        const fact = deriveAvatarVehicleBrakingInputFact({ type: 'brakeup' });
        assert(fact.brakeRequested === false, '3. a brakeup fact reports brakeRequested: false');
    }
    {
        const fact = deriveAvatarVehicleBrakingInputFact({ type: 'BRAKEUP' });
        assert(fact.brakeRequested === false, '4. type comparison is case-insensitive for release too');
    }

    // -------------------------------------------------------------
    // Section C — unrecognized/malformed input degrades to not requested
    // -------------------------------------------------------------
    {
        assert(deriveAvatarVehicleBrakingInputFact({ type: 'keydown' }).brakeRequested === false,
            '5. an unrelated event type (e.g. a raw keyboard "keydown") never reports a request');
        assert(deriveAvatarVehicleBrakingInputFact({ type: 'jumpdown' }).brakeRequested === false,
            '6. a plausible-but-different control name never reports a request');
        assert(deriveAvatarVehicleBrakingInputFact({}).brakeRequested === false,
            '7. an empty options object defaults to not requested');
        assert(deriveAvatarVehicleBrakingInputFact().brakeRequested === false,
            '8. calling with no arguments at all is safe and defaults to not requested');
        assert(deriveAvatarVehicleBrakingInputFact({ type: undefined }).brakeRequested === false,
            '9. an explicit undefined type defaults to not requested');
        assert(deriveAvatarVehicleBrakingInputFact({ type: null }).brakeRequested === false,
            '10. a null type defaults to not requested, never throws');
        assert(deriveAvatarVehicleBrakingInputFact({ type: 123 }).brakeRequested === false,
            '11. a non-string type degrades gracefully to not requested, never throws');
    }

    // -------------------------------------------------------------
    // Section D — no keyboard dependency: this adapter has no `key`
    // parameter at all, and an unrelated `key` field alongside `type`
    // has no effect on the outcome
    // -------------------------------------------------------------
    {
        const withKey = deriveAvatarVehicleBrakingInputFact({ type: 'brakedown', key: 'Space' });
        const withoutKey = deriveAvatarVehicleBrakingInputFact({ type: 'brakedown' });
        assert(withKey.brakeRequested === withoutKey.brakeRequested,
            '12. an unrelated `key` field is simply ignored — this file carries no key/keyboard vocabulary of its own');

        const differentKey = deriveAvatarVehicleBrakingInputFact({ type: 'brakedown', key: 's' });
        assert(differentKey.brakeRequested === true,
            '13. no particular key name (Space, S, or anything else) changes the outcome — only `type` does');
    }

    // -------------------------------------------------------------
    // Section E — statelessness / idempotence: repeated identical facts
    // produce the identical result; this file threads no caller-owned
    // state between calls, unlike core/AvatarContinuousMovementInputAdapter.js's
    // own altDown/shiftDown
    // -------------------------------------------------------------
    {
        const first = deriveAvatarVehicleBrakingInputFact({ type: 'brakedown' });
        const second = deriveAvatarVehicleBrakingInputFact({ type: 'brakedown' });
        const third = deriveAvatarVehicleBrakingInputFact({ type: 'brakedown' });
        assert(first.brakeRequested === true && second.brakeRequested === true && third.brakeRequested === true,
            '14. repeating an identical brakedown fact (key-repeat) is idempotent — always brakeRequested: true, never a compounding or decaying effect');
    }
    {
        const options = { type: 'brakedown' };
        const snapshot = JSON.stringify(options);
        deriveAvatarVehicleBrakingInputFact(options);
        assert(JSON.stringify(options) === snapshot, '15. deriveAvatarVehicleBrakingInputFact never mutates the options object it was given');
    }
    {
        // The function's own return shape carries no state of its own to
        // thread back into a next call — unlike
        // deriveAvatarContinuousMovementInputEvent()'s own returned
        // altDown/shiftDown.
        const fact = deriveAvatarVehicleBrakingInputFact({ type: 'brakedown' });
        assert(Object.keys(fact).sort().join(',') === 'brakeRequested',
            '16. the returned fact carries exactly one field, brakeRequested — no altDown/shiftDown-style carried state');
    }

    // -------------------------------------------------------------
    // Section F — FLAGSHIP: a full press/hold/release/press scenario,
    // fed straight through this adapter and into
    // deriveAvatarVehicleBrakingIntent()
    // -------------------------------------------------------------
    {
        const { NONE, BRAKE } = AvatarVehicleBrakingIntent;
        let intent = NONE;

        function feed(type) {
            const fact = deriveAvatarVehicleBrakingInputFact({ type });
            intent = deriveAvatarVehicleBrakingIntent(fact);
        }

        feed('brakedown');
        assert(intent === BRAKE, '17. FLAGSHIP: a brakedown fact resolves all the way to BRAKE');

        feed('brakedown');
        assert(intent === BRAKE, '18. FLAGSHIP: a repeated brakedown fact (a continuous hold) keeps resolving to BRAKE');

        feed('brakeup');
        assert(intent === NONE, '19. FLAGSHIP: a brakeup fact resolves all the way back to NONE');

        feed('brakedown');
        assert(intent === BRAKE, '20. FLAGSHIP: a later, independent brakedown fact resolves to BRAKE again, exactly like the first');
    }

    // -------------------------------------------------------------
    // Section G — architectural regression: no vehicle, no specific key/
    // mouse/gamepad vocabulary, no intent derivation, no movement
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../core/AvatarVehicleBrakingInputAdapter.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        const forbidden = [
            'VehiclePresence', 'VehicleIdentity', 'VehicleType', 'vehicleId', 'vehicleType',
            'AvatarVehicleMount', 'mounted', 'occupied',
            'deriveAvatarVehicleBrakingIntent', 'AvatarVehicleBrakingIntent',
            'AvatarMovementBrakingCapability', 'AvatarMovementController', 'AvatarMovementState',
            'simulateAvatarMovement', 'resolveMovementSpeed',
            '\'w\'', '\'s\'', '\'a\'', '\'d\'', '\'Space\'', '\'space\'', '\' \'',
            'Space', 'Spacebar', 'KeyboardEvent', 'getModifierState', 'addEventListener', 'removeEventListener',
            'keydown', 'keyup',
            'THREE', 'from \'three\'', 'Renderer', 'WorldNavigationSession',
            'setTimeout', 'setInterval', 'requestAnimationFrame', 'performance.now', 'Date.now',
            'Math.random', 'localStorage', 'StorageProvider', 'fetch(', 'WebSocket',
            'velocity', 'acceleration', 'speed', 'position', 'rotation', 'collision', 'physics', 'camera'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `21. core/AvatarVehicleBrakingInputAdapter.js's own code never references "${term}" — pure control-event translation only, never a specific key/mouse/gamepad, never the intent function itself, never movement`);
        }
    }
    {
        // This file must not even IMPORT anything — the adapter must not
        // need to know a vehicle, an intent vocabulary, or a controller
        // exists.
        const sourceUrl = new URL('../core/AvatarVehicleBrakingInputAdapter.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        assert(!/^\s*import\b/m.test(source),
            '22. core/AvatarVehicleBrakingInputAdapter.js has no import statements at all');
    }
    {
        const exportsModule = await import('../core/AvatarVehicleBrakingInputAdapter.js');
        const exportedNames = Object.keys(exportsModule).sort();
        assert(JSON.stringify(exportedNames) === JSON.stringify(['deriveAvatarVehicleBrakingInputFact']),
            '23. core/AvatarVehicleBrakingInputAdapter.js exports exactly the one translation function — nothing else');
    }

    console.log('✅ All Avatar Vehicle Braking Input Adapter tests passed.');
}

await runTests();
