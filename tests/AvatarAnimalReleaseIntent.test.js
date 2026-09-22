import {
    AvatarAnimalReleaseIntent,
    isValidAvatarAnimalReleaseIntent,
    deriveAvatarAnimalReleaseIntent
} from '../core/AvatarAnimalReleaseIntent.js';

// 0.9.700 — Avatar Animal Release Intent, core/AvatarAnimalReleaseIntent.js.
// Mirrors tests/AvatarAnimalCatchIntent.test.js's own shape exactly, for
// the mirror-image vocabulary.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function runTests() {
    const { NONE, RELEASE } = AvatarAnimalReleaseIntent;

    assert(NONE === 'none' && RELEASE === 'release', '1. exactly the two expected values');
    assert(Object.isFrozen(AvatarAnimalReleaseIntent), '2. frozen');
    assert(Object.keys(AvatarAnimalReleaseIntent).length === 2, '3. no third value');
    assert(isValidAvatarAnimalReleaseIntent(NONE) && isValidAvatarAnimalReleaseIntent(RELEASE), '4. both values are valid');
    assert(!isValidAvatarAnimalReleaseIntent('catch') && !isValidAvatarAnimalReleaseIntent(null), '5. unrelated values are not valid');

    assert(deriveAvatarAnimalReleaseIntent({ releaseRequested: true }) === RELEASE, '6. a request produces RELEASE');
    assert(deriveAvatarAnimalReleaseIntent({ releaseRequested: false }) === NONE, '7. no request stays NONE');
    assert(deriveAvatarAnimalReleaseIntent() === NONE, '8. no arguments at all is safe and returns NONE');

    assert(deriveAvatarAnimalReleaseIntent({ currentIntent: RELEASE, releaseRequested: false }) === NONE,
        '9. RELEASE is consumed back to NONE the instant the request stops being asserted');
    assert(deriveAvatarAnimalReleaseIntent({ currentIntent: RELEASE, releaseRequested: true }) === RELEASE,
        '10. holding the key (key-repeat) stays idempotent');

    assert(deriveAvatarAnimalReleaseIntent({ releaseRequested: 'yes' }) === RELEASE, '11. a truthy string is coerced to a request');
    assert(deriveAvatarAnimalReleaseIntent({ releaseRequested: null }) === NONE, '12. a nullish value is coerced to no request');

    {
        const options = { releaseRequested: true };
        const first = deriveAvatarAnimalReleaseIntent(options);
        const second = deriveAvatarAnimalReleaseIntent(options);
        assert(first === second, '13. deterministic — identical input, identical output');
    }

    console.log('✅ All Avatar Animal Release Intent tests passed.');
}

runTests();
