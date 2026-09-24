import {
    AvatarVehicleDeployIntent,
    isValidAvatarVehicleDeployIntent,
    deriveAvatarVehicleDeployIntent
} from '../core/AvatarVehicleDeployIntent.js';
import { assert } from './support/Assert.js';

// 0.9.670 — Avatar Vehicle Deploy Intent, core/AvatarVehicleDeployIntent.js.
// Mirrors tests/AvatarVehicleStoreIntent.test.js's own shape exactly, for
// the mirror-image vocabulary.

function runTests() {
    const { NONE, DEPLOY } = AvatarVehicleDeployIntent;

    assert(NONE === 'none' && DEPLOY === 'deploy', '1. exactly the two expected values');
    assert(Object.isFrozen(AvatarVehicleDeployIntent), '2. frozen');
    assert(Object.keys(AvatarVehicleDeployIntent).length === 2, '3. no third value');
    assert(isValidAvatarVehicleDeployIntent(NONE) && isValidAvatarVehicleDeployIntent(DEPLOY), '4. both values are valid');
    assert(!isValidAvatarVehicleDeployIntent('store') && !isValidAvatarVehicleDeployIntent(null), '5. unrelated values are not valid');

    assert(deriveAvatarVehicleDeployIntent({ deployRequested: true }) === DEPLOY, '6. a request produces DEPLOY');
    assert(deriveAvatarVehicleDeployIntent({ deployRequested: false }) === NONE, '7. no request stays NONE');
    assert(deriveAvatarVehicleDeployIntent() === NONE, '8. no arguments at all is safe and returns NONE');

    assert(deriveAvatarVehicleDeployIntent({ currentIntent: DEPLOY, deployRequested: false }) === NONE,
        '9. DEPLOY is consumed back to NONE the instant the request stops being asserted');
    assert(deriveAvatarVehicleDeployIntent({ currentIntent: DEPLOY, deployRequested: true }) === DEPLOY,
        '10. holding the key (key-repeat) stays idempotent');

    assert(deriveAvatarVehicleDeployIntent({ deployRequested: 'yes' }) === DEPLOY, '11. a truthy string is coerced to a request');
    assert(deriveAvatarVehicleDeployIntent({ deployRequested: null }) === NONE, '12. a nullish value is coerced to no request');

    {
        const options = { deployRequested: true };
        const first = deriveAvatarVehicleDeployIntent(options);
        const second = deriveAvatarVehicleDeployIntent(options);
        assert(first === second, '13. deterministic — identical input, identical output');
    }

    console.log('✅ All Avatar Vehicle Deploy Intent tests passed.');
}

runTests();
