import {
    AvatarAnimalCatchIntent,
    isValidAvatarAnimalCatchIntent,
    deriveAvatarAnimalCatchIntent
} from '../core/AvatarAnimalCatchIntent.js';

// 0.9.700 — Avatar Animal Catch Intent, core/AvatarAnimalCatchIntent.js.
// Mirrors tests/AvatarVehicleStoreIntent.test.js's own shape.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function runTests() {
    const { NONE, CATCH } = AvatarAnimalCatchIntent;

    assert(NONE === 'none' && CATCH === 'catch', '1. exactly the two expected values');
    assert(Object.isFrozen(AvatarAnimalCatchIntent), '2. frozen');
    assert(Object.keys(AvatarAnimalCatchIntent).length === 2, '3. no third value');
    assert(isValidAvatarAnimalCatchIntent(NONE) && isValidAvatarAnimalCatchIntent(CATCH), '4. both values are valid');
    assert(!isValidAvatarAnimalCatchIntent('mount') && !isValidAvatarAnimalCatchIntent(undefined), '5. unrelated values are not valid');

    assert(deriveAvatarAnimalCatchIntent({ catchRequested: true }) === CATCH, '6. a request produces CATCH');
    assert(deriveAvatarAnimalCatchIntent({ catchRequested: false }) === NONE, '7. no request stays NONE');
    assert(deriveAvatarAnimalCatchIntent() === NONE, '8. no arguments at all is safe and returns NONE');

    assert(deriveAvatarAnimalCatchIntent({ currentIntent: CATCH, catchRequested: false }) === NONE,
        '9. CATCH is consumed back to NONE the instant the request stops being asserted');
    assert(deriveAvatarAnimalCatchIntent({ currentIntent: CATCH, catchRequested: true }) === CATCH,
        '10. holding the key (key-repeat) stays idempotent');

    assert(deriveAvatarAnimalCatchIntent({ catchRequested: 1 }) === CATCH, '11. a truthy non-boolean is coerced to a request');
    assert(deriveAvatarAnimalCatchIntent({ catchRequested: 0 }) === NONE, '12. a falsy non-boolean is coerced to no request');

    {
        const options = { catchRequested: true };
        const first = deriveAvatarAnimalCatchIntent(options);
        const second = deriveAvatarAnimalCatchIntent(options);
        assert(first === second, '13. deterministic — identical input, identical output');
    }

    console.log('✅ All Avatar Animal Catch Intent tests passed.');
}

runTests();
