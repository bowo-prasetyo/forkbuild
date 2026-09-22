import { animalIdFor } from '../core/AnimalIdentity.js';

// 0.9.700 — Deterministic Animal Identity, core/AnimalIdentity.js.
// Mirrors tests/VehicleIdentity.test.js's own shape.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function runTests() {
    assert(animalIdFor(1, 0, 0) === 'animal:1:0,0', '1. exact format: animal:<seed>:<cellX>,<cellZ>');
    assert(animalIdFor(29, -30, -27) === 'animal:29:-30,-27', '2. negative cell coordinates format correctly');

    assert(animalIdFor(1, 5, 5) === animalIdFor(1, 5, 5), '3. deterministic — same input, same output, every call');

    assert(animalIdFor(1, 5, 5) !== animalIdFor(2, 5, 5), '4. a different seed produces a different id');
    assert(animalIdFor(1, 5, 5) !== animalIdFor(1, 6, 5), '5. a different cellX produces a different id');
    assert(animalIdFor(1, 5, 5) !== animalIdFor(1, 5, 6), '6. a different cellZ produces a different id');

    assert(!animalIdFor(1, 0, 0).startsWith('vehicle:'), '7. an animal id can never be mistaken for a vehicle id');

    for (const bad of [1.5, NaN, Infinity, '1', null, undefined]) {
        let threw = false;
        try { animalIdFor(bad, 0, 0); } catch (e) { threw = true; }
        assert(threw, `8. a non-integer seed (${bad}) throws`);
    }
    for (const bad of [1.5, NaN, '0']) {
        let threw = false;
        try { animalIdFor(1, bad, 0); } catch (e) { threw = true; }
        assert(threw, `9. a non-integer cellX (${bad}) throws`);
        threw = false;
        try { animalIdFor(1, 0, bad); } catch (e) { threw = true; }
        assert(threw, `10. a non-integer cellZ (${bad}) throws`);
    }

    console.log('✅ All Animal Identity tests passed.');
}

runTests();
