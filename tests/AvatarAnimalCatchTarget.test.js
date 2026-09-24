import { resolveAvatarAnimalCatchTarget, ANIMAL_INTERACTION_RADIUS } from '../core/AvatarAnimalCatchTarget.js';
import { AvatarAnimalCatchIntent } from '../core/AvatarAnimalCatchIntent.js';
import { AnimalPresence } from '../core/AnimalPresence.js';
import { Position } from '../core/Position.js';
import { ANIMAL_SPECIES } from '../core/WildlifeField.js';
import { assert } from './support/Assert.js';

// 0.9.700 — Avatar Animal Catch Target Resolution, core/AvatarAnimalCatchTarget.js.
// Mirrors tests/AvatarVehicleInteractionTarget.test.js's own shape.

function animal(id, x, z, species = ANIMAL_SPECIES.RABBIT) {
    return new AnimalPresence({ id, species, position: new Position(x, 0, z) });
}

function runTests() {
    const { NONE, CATCH } = AvatarAnimalCatchIntent;

    // -------------------------------------------------------------
    // No CATCH intent -> no target, regardless of candidates
    // -------------------------------------------------------------
    {
        const result = resolveAvatarAnimalCatchTarget({
            avatarPosition: new Position(0, 0, 0),
            animals: [animal('a', 0.1, 0.1)],
            catchIntent: NONE
        });
        assert(result.targetAnimalId === null, '1. no CATCH intent -> no target');
    }

    // -------------------------------------------------------------
    // No candidates -> no target
    // -------------------------------------------------------------
    {
        const result = resolveAvatarAnimalCatchTarget({ avatarPosition: new Position(0, 0, 0), animals: [], catchIntent: CATCH });
        assert(result.targetAnimalId === null, '2. no candidates -> no target');
    }

    // -------------------------------------------------------------
    // Out of range excluded entirely
    // -------------------------------------------------------------
    {
        const far = animal('far', ANIMAL_INTERACTION_RADIUS + 1, 0);
        const result = resolveAvatarAnimalCatchTarget({ avatarPosition: new Position(0, 0, 0), animals: [far], catchIntent: CATCH });
        assert(result.targetAnimalId === null, '3. a candidate outside ANIMAL_INTERACTION_RADIUS is never targeted');
    }

    // -------------------------------------------------------------
    // Nearest of several in-range candidates wins
    // -------------------------------------------------------------
    {
        const near = animal('near', 0.2, 0);
        const mid = animal('mid', 0.6, 0);
        const result = resolveAvatarAnimalCatchTarget({
            avatarPosition: new Position(0, 0, 0),
            animals: [mid, near],
            catchIntent: CATCH
        });
        assert(result.targetAnimalId === 'near', '4. the nearest in-range candidate wins, regardless of array order');
    }

    // -------------------------------------------------------------
    // Exact-distance tie breaks on ascending lexical id
    // -------------------------------------------------------------
    {
        const b = animal('b', 0.5, 0);
        const a = animal('a', -0.5, 0);
        const result = resolveAvatarAnimalCatchTarget({
            avatarPosition: new Position(0, 0, 0),
            animals: [b, a],
            catchIntent: CATCH
        });
        assert(result.targetAnimalId === 'a', '5. an exact distance tie breaks on ascending lexical id, never on array order');
    }

    // -------------------------------------------------------------
    // Y is ignored
    // -------------------------------------------------------------
    {
        const skyHigh = new AnimalPresence({ id: 'high', species: ANIMAL_SPECIES.DEER, position: new Position(0.1, 500, 0.1) });
        const result = resolveAvatarAnimalCatchTarget({ avatarPosition: new Position(0, 0, 0), animals: [skyHigh], catchIntent: CATCH });
        assert(result.targetAnimalId === 'high', '6. a large Y difference never excludes an otherwise in-range candidate');
    }

    // -------------------------------------------------------------
    // Defensive/malformed input
    // -------------------------------------------------------------
    {
        let threw = false;
        try { resolveAvatarAnimalCatchTarget({ avatarPosition: { x: NaN, z: 0 }, animals: [], catchIntent: NONE }); } catch (e) { threw = true; }
        assert(threw, '7. a non-finite avatarPosition throws');
    }
    {
        let threw = false;
        try { resolveAvatarAnimalCatchTarget({ avatarPosition: new Position(0, 0, 0), animals: 'not-an-array', catchIntent: NONE }); } catch (e) { threw = true; }
        assert(threw, '8. a non-array animals throws');
    }
    {
        let threw = false;
        try {
            resolveAvatarAnimalCatchTarget({ avatarPosition: new Position(0, 0, 0), animals: [{ id: 'x', position: { x: 0, z: 0 } }], catchIntent: CATCH });
        } catch (e) { threw = true; }
        assert(threw, '9. a plain object masquerading as an AnimalPresence throws');
    }

    console.log('✅ All Avatar Animal Catch Target tests passed.');
}

runTests();
