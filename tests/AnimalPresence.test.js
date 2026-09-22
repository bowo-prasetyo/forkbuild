import { AnimalPresence, isValidAnimalSpecies } from '../core/AnimalPresence.js';
import { ANIMAL_SPECIES } from '../core/WildlifeField.js';
import { Position } from '../core/Position.js';

// 0.9.700 — Animal Presence Descriptor, core/AnimalPresence.js.
// Mirrors tests/VehiclePresence.test.js's own shape.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function runTests() {
    assert(isValidAnimalSpecies(ANIMAL_SPECIES.DEER) && isValidAnimalSpecies(ANIMAL_SPECIES.RABBIT), '1. both real species are valid');
    assert(!isValidAnimalSpecies('SHEEP') && !isValidAnimalSpecies(undefined), '2. an unrelated string/undefined is not valid');

    {
        const presence = new AnimalPresence({ id: 'animal:1:0,0', species: ANIMAL_SPECIES.RABBIT, position: new Position(1, 0, 2) });
        assert(presence.id === 'animal:1:0,0' && presence.species === ANIMAL_SPECIES.RABBIT, '3. fields round-trip exactly');
        assert(presence.position instanceof Position && presence.position.x === 1 && presence.position.z === 2, '4. position is a real Position instance');
        assert(Object.isFrozen(presence), '5. an AnimalPresence is frozen');
    }
    {
        // Plain {x,y,z} object accepted too, mirroring VehiclePresence.
        const presence = new AnimalPresence({ id: 'a', species: ANIMAL_SPECIES.DEER, position: { x: 1, y: 2, z: 3 } });
        assert(presence.position instanceof Position, '6. a plain {x,y,z} object is normalized into a real Position');
    }
    {
        let threw = false;
        try { new AnimalPresence({ id: '', species: ANIMAL_SPECIES.DEER, position: new Position(0, 0, 0) }); } catch (e) { threw = true; }
        assert(threw, '7. an empty string id throws');
    }
    {
        let threw = false;
        try { new AnimalPresence({ id: 'a', species: 'SHEEP', position: new Position(0, 0, 0) }); } catch (e) { threw = true; }
        assert(threw, '8. an invalid species throws');
    }
    {
        let threw = false;
        try { new AnimalPresence({ id: 'a', species: ANIMAL_SPECIES.DEER, position: null }); } catch (e) { threw = true; }
        assert(threw, '9. a missing position throws');
    }
    {
        const presence = new AnimalPresence({ id: 'animal:1:0,0', species: ANIMAL_SPECIES.RABBIT, position: new Position(1, 0, 2) });
        const json = presence.toJSON();
        const restored = AnimalPresence.fromJSON(json);
        assert(restored.id === presence.id && restored.species === presence.species && restored.position.equals(presence.position),
            '10. toJSON()/fromJSON() round-trip exactly');
    }

    console.log('✅ All Animal Presence tests passed.');
}

runTests();
