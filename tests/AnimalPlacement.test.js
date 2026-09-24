import { animalPresenceInRegion } from '../core/AnimalPlacement.js';
import { wildlifeInRegion, WILDLIFE_FEATURE_TYPE } from '../core/WildlifeField.js';
import { AnimalPresence } from '../core/AnimalPresence.js';
import { assert } from './support/Assert.js';

// 0.9.700 — Animal Placement Adapter, core/AnimalPlacement.js.
//
//   Section A: wraps wildlifeInRegion() into real AnimalPresence objects
//   Section B: deterministic — same call, same result
//   Section C: agrees with wildlifeInRegion() exactly (id, species, position)

const SEED = 29;

function runTests() {
    // -------------------------------------------------------------
    // Section A
    // -------------------------------------------------------------
    {
        const animals = animalPresenceInRegion(SEED, -300, -300, 300, 300);
        assert(animals.length > 0, '1. a wide region under a real seed produces real animals');
        assert(animals.every((a) => a instanceof AnimalPresence), '2. every result is a real AnimalPresence instance');
    }

    // -------------------------------------------------------------
    // Section B
    // -------------------------------------------------------------
    {
        const first = animalPresenceInRegion(SEED, -100, -100, 100, 100);
        const second = animalPresenceInRegion(SEED, -100, -100, 100, 100);
        assert(first.length === second.length, '3. deterministic — the same region always produces the same count');
        assert(first.every((a, i) => a.id === second[i].id), '4. deterministic — and the same ids, in the same order');
    }

    // -------------------------------------------------------------
    // Section C — agrees with wildlifeInRegion() exactly
    // -------------------------------------------------------------
    {
        const raw = wildlifeInRegion(SEED, -100, -100, 100, 100).filter((a) => a.type === WILDLIFE_FEATURE_TYPE.ANIMAL);
        const wrapped = animalPresenceInRegion(SEED, -100, -100, 100, 100);
        assert(raw.length === wrapped.length, '5. exactly as many results as the underlying deterministic field produces');
        for (let i = 0; i < raw.length; i++) {
            assert(wrapped[i].id === raw[i].id, '6. same id, same order');
            assert(wrapped[i].species === raw[i].species, '7. same species');
            assert(wrapped[i].position.x === raw[i].x && wrapped[i].position.y === raw[i].y && wrapped[i].position.z === raw[i].z,
                '8. same position, coordinate for coordinate');
        }
    }

    console.log('✅ All Animal Placement tests passed.');
}

runTests();
