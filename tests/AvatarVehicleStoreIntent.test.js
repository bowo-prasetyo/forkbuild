import {
    AvatarVehicleStoreIntent,
    isValidAvatarVehicleStoreIntent,
    deriveAvatarVehicleStoreIntent
} from '../core/AvatarVehicleStoreIntent.js';
import { assert } from './support/Assert.js';

// 0.9.670 — Avatar Vehicle Store Intent, core/AvatarVehicleStoreIntent.js.
// Mirrors tests/AvatarVehicleDismountIntent.test.js's own shape: vocabulary,
// activation, one-shot consumption, defensive input, purity.

function runTests() {
    const { NONE, STORE } = AvatarVehicleStoreIntent;

    assert(NONE === 'none' && STORE === 'store', '1. exactly the two expected values');
    assert(Object.isFrozen(AvatarVehicleStoreIntent), '2. frozen');
    assert(Object.keys(AvatarVehicleStoreIntent).length === 2, '3. no third value');
    assert(isValidAvatarVehicleStoreIntent(NONE) && isValidAvatarVehicleStoreIntent(STORE), '4. both values are valid');
    assert(!isValidAvatarVehicleStoreIntent('mount') && !isValidAvatarVehicleStoreIntent(undefined), '5. unrelated values are not valid');

    assert(deriveAvatarVehicleStoreIntent({ storeRequested: true }) === STORE, '6. a request produces STORE');
    assert(deriveAvatarVehicleStoreIntent({ storeRequested: false }) === NONE, '7. no request stays NONE');
    assert(deriveAvatarVehicleStoreIntent() === NONE, '8. no arguments at all is safe and returns NONE');

    assert(deriveAvatarVehicleStoreIntent({ currentIntent: STORE, storeRequested: false }) === NONE,
        '9. STORE is consumed back to NONE the instant the request stops being asserted');
    assert(deriveAvatarVehicleStoreIntent({ currentIntent: STORE, storeRequested: true }) === STORE,
        '10. holding the key (key-repeat) stays idempotent');
    assert(deriveAvatarVehicleStoreIntent({ currentIntent: 'garbage', storeRequested: true }) === STORE,
        '11. currentIntent is ignored entirely — outcome depends only on storeRequested');

    assert(deriveAvatarVehicleStoreIntent({ storeRequested: 1 }) === STORE, '12. a truthy non-boolean is coerced to a request');
    assert(deriveAvatarVehicleStoreIntent({ storeRequested: 0 }) === NONE, '13. a falsy non-boolean is coerced to no request');

    {
        // Press, release, press again — nothing lingers between cycles.
        let intent = deriveAvatarVehicleStoreIntent({ storeRequested: true });
        assert(intent === STORE, '14. FLAGSHIP step 1');
        intent = deriveAvatarVehicleStoreIntent({ currentIntent: intent, storeRequested: false });
        assert(intent === NONE, '15. FLAGSHIP step 2');
        intent = deriveAvatarVehicleStoreIntent({ currentIntent: intent, storeRequested: true });
        assert(intent === STORE, '16. FLAGSHIP step 3');
    }
    {
        const options = { storeRequested: true };
        const first = deriveAvatarVehicleStoreIntent(options);
        const second = deriveAvatarVehicleStoreIntent(options);
        assert(first === second, '17. deterministic — identical input, identical output');
    }

    console.log('✅ All Avatar Vehicle Store Intent tests passed.');
}

runTests();
