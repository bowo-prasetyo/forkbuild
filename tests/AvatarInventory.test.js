import {
    AvatarInventory,
    AvatarInventoryEntry,
    InventoryEntryKind,
    createAvatarInventoryEntry,
    isValidAvatarInventoryEntry,
    isValidInventoryEntryKind,
    emptyAvatarInventory,
    isValidAvatarInventory,
    withEntryAdded,
    withEntryRemoved
} from '../core/AvatarInventory.js';
import { VehicleType } from '../core/VehicleType.js';
import { ANIMAL_SPECIES } from '../core/WildlifeField.js';
import { assert } from './support/Assert.js';

// 0.9.670 — Avatar Inventory, core/AvatarInventory.js.
//
//   Section A: InventoryEntryKind vocabulary
//   Section B: AvatarInventoryEntry construction/validation
//   Section C: AvatarInventory construction, has()/mostRecent()
//   Section D: withEntryAdded()/withEntryRemoved() — immutability,
//              unchanged-reference discipline
//   Section E: FLAGSHIP — store two vehicles, deploy them back out in
//              LIFO order
//   Section F: 0.9.671 — get()/resolve()/next()/previous() cycle
//              selection primitives
//   Section G: 0.9.700 — ANIMAL entries + entriesOf()/kind-scoped
//              mostRecent()/resolve()/next()/previous() — a shared
//              inventory that never lets one kind bleed into another

function runTests() {
    // -------------------------------------------------------------
    // Section A — InventoryEntryKind vocabulary
    // -------------------------------------------------------------
    {
        assert(InventoryEntryKind.VEHICLE === 'vehicle', '1. InventoryEntryKind.VEHICLE is "vehicle"');
        assert(InventoryEntryKind.ANIMAL === 'animal', '1b. InventoryEntryKind.ANIMAL is "animal" (0.9.700)');
        assert(Object.isFrozen(InventoryEntryKind), '2. InventoryEntryKind is frozen');
        assert(Object.keys(InventoryEntryKind).length === 2, '3. InventoryEntryKind has exactly two values — VEHICLE and ANIMAL');
        assert(isValidInventoryEntryKind(InventoryEntryKind.VEHICLE), '4. VEHICLE is valid');
        assert(isValidInventoryEntryKind(InventoryEntryKind.ANIMAL), '4b. ANIMAL is valid');
        assert(!isValidInventoryEntryKind('reptile'), '5. an unrelated string is not valid');
        assert(!isValidInventoryEntryKind(undefined), '6. undefined is not valid');
    }

    // -------------------------------------------------------------
    // Section B — AvatarInventoryEntry construction/validation
    // -------------------------------------------------------------
    {
        const entry = createAvatarInventoryEntry({ id: 'vehicle:1:0,0', kind: InventoryEntryKind.VEHICLE, type: VehicleType.BICYCLE });
        assert(entry instanceof AvatarInventoryEntry, '7. createAvatarInventoryEntry returns an AvatarInventoryEntry');
        assert(entry.id === 'vehicle:1:0,0' && entry.kind === InventoryEntryKind.VEHICLE && entry.type === VehicleType.BICYCLE,
            '8. fields round-trip exactly');
        assert(Object.isFrozen(entry), '9. an entry is frozen');
        assert(isValidAvatarInventoryEntry(entry), '10. isValidAvatarInventoryEntry accepts a real entry');
        assert(!isValidAvatarInventoryEntry({ id: 'x', kind: InventoryEntryKind.VEHICLE, type: VehicleType.BICYCLE }),
            '11. a plain object, even shaped correctly, is not valid — must be a real instance');
    }
    {
        let threw = false;
        try { createAvatarInventoryEntry({ id: '', kind: InventoryEntryKind.VEHICLE, type: VehicleType.BICYCLE }); } catch (e) { threw = true; }
        assert(threw, '12. an empty string id throws');
    }
    {
        let threw = false;
        try { createAvatarInventoryEntry({ id: 'x', kind: 'garbage', type: VehicleType.BICYCLE }); } catch (e) { threw = true; }
        assert(threw, '13. an invalid kind throws');
    }
    {
        let threw = false;
        try { createAvatarInventoryEntry({ id: 'x', kind: InventoryEntryKind.VEHICLE, type: VehicleType.NONE }); } catch (e) { threw = true; }
        assert(threw, '14. a VEHICLE entry of type NONE throws — "no vehicle" is never a carried item');
    }
    {
        let threw = false;
        try { createAvatarInventoryEntry({ id: 'x', kind: InventoryEntryKind.VEHICLE, type: 'garbage' }); } catch (e) { threw = true; }
        assert(threw, '15. a VEHICLE entry with an invalid type throws');
    }
    {
        const entry = createAvatarInventoryEntry({ id: 'animal:1:0,0', kind: InventoryEntryKind.ANIMAL, type: ANIMAL_SPECIES.RABBIT });
        assert(entry.kind === InventoryEntryKind.ANIMAL && entry.type === ANIMAL_SPECIES.RABBIT,
            '15b. an ANIMAL entry carries a real ANIMAL_SPECIES as its type');
        let threw = false;
        try { createAvatarInventoryEntry({ id: 'x', kind: InventoryEntryKind.ANIMAL, type: VehicleType.BICYCLE }); } catch (e) { threw = true; }
        assert(threw, '15c. an ANIMAL entry with a VehicleType (not an ANIMAL_SPECIES) throws — the two vocabularies are never interchangeable');
    }
    {
        const entry = createAvatarInventoryEntry({ id: 'vehicle:1:0,0', kind: InventoryEntryKind.VEHICLE, type: VehicleType.CAR });
        const json = entry.toJSON();
        const restored = AvatarInventoryEntry.fromJSON(json);
        assert(restored.id === entry.id && restored.kind === entry.kind && restored.type === entry.type,
            '16. toJSON()/fromJSON() round-trip an entry exactly');
    }

    // -------------------------------------------------------------
    // Section C — AvatarInventory construction, has()/mostRecent()
    // -------------------------------------------------------------
    {
        const inventory = emptyAvatarInventory();
        assert(inventory instanceof AvatarInventory, '17. emptyAvatarInventory() returns an AvatarInventory');
        assert(inventory.size === 0, '18. an empty inventory has size 0');
        assert(inventory.mostRecent() === null, '19. an empty inventory has no most-recent entry');
        assert(!inventory.has('anything'), '20. an empty inventory has() nothing');
        assert(isValidAvatarInventory(inventory), '21. isValidAvatarInventory accepts a real instance');
        assert(!isValidAvatarInventory({ entries: [] }), '22. a plain object is not a valid AvatarInventory');
        assert(Object.isFrozen(inventory), '23. an AvatarInventory is frozen');
    }
    {
        const bike = createAvatarInventoryEntry({ id: 'a', kind: InventoryEntryKind.VEHICLE, type: VehicleType.BICYCLE });
        const moto = createAvatarInventoryEntry({ id: 'b', kind: InventoryEntryKind.VEHICLE, type: VehicleType.MOTORCYCLE });
        const inventory = new AvatarInventory([bike, moto]);
        assert(inventory.size === 2, '24. a two-entry inventory has size 2');
        assert(inventory.has('a') && inventory.has('b'), '25. has() finds both entries by id');
        assert(inventory.mostRecent() === moto, '26. mostRecent() returns the LAST entry, not the first');
    }
    {
        const bike = createAvatarInventoryEntry({ id: 'a', kind: InventoryEntryKind.VEHICLE, type: VehicleType.BICYCLE });
        const dupe = createAvatarInventoryEntry({ id: 'a', kind: InventoryEntryKind.VEHICLE, type: VehicleType.CAR });
        let threw = false;
        try { new AvatarInventory([bike, dupe]); } catch (e) { threw = true; }
        assert(threw, '27. two entries sharing one id throws — ids must be unique within an inventory');
    }

    // -------------------------------------------------------------
    // Section D — withEntryAdded()/withEntryRemoved()
    // -------------------------------------------------------------
    {
        const inventory = emptyAvatarInventory();
        const entry = createAvatarInventoryEntry({ id: 'a', kind: InventoryEntryKind.VEHICLE, type: VehicleType.BICYCLE });
        const next = withEntryAdded(inventory, entry);
        assert(next !== inventory, '28. withEntryAdded() returns a brand new instance');
        assert(inventory.size === 0, '29. the original inventory is never mutated');
        assert(next.size === 1 && next.has('a'), '30. the new inventory carries the added entry');
    }
    {
        const inventory = withEntryAdded(emptyAvatarInventory(), createAvatarInventoryEntry({ id: 'a', kind: InventoryEntryKind.VEHICLE, type: VehicleType.BICYCLE }));
        let threw = false;
        try {
            withEntryAdded(inventory, createAvatarInventoryEntry({ id: 'a', kind: InventoryEntryKind.VEHICLE, type: VehicleType.CAR }));
        } catch (e) { threw = true; }
        assert(threw, '31. adding a duplicate id throws rather than silently overwriting');
    }
    {
        const inventory = withEntryAdded(emptyAvatarInventory(), createAvatarInventoryEntry({ id: 'a', kind: InventoryEntryKind.VEHICLE, type: VehicleType.BICYCLE }));
        const same = withEntryRemoved(inventory, 'not-present');
        assert(same === inventory, '32. removing an id that is not present returns the exact same reference — unchanged, not a look-alike copy');
    }
    {
        const entry = createAvatarInventoryEntry({ id: 'a', kind: InventoryEntryKind.VEHICLE, type: VehicleType.BICYCLE });
        const inventory = withEntryAdded(emptyAvatarInventory(), entry);
        const next = withEntryRemoved(inventory, 'a');
        assert(next !== inventory, '33. removing a present id returns a new instance');
        assert(next.size === 0 && !next.has('a'), '34. the entry is actually gone from the new instance');
        assert(inventory.size === 1, '35. the original inventory is never mutated by removal either');
    }

    // -------------------------------------------------------------
    // Section E — FLAGSHIP: store two vehicles, deploy in LIFO order
    // -------------------------------------------------------------
    {
        let inventory = emptyAvatarInventory();
        const bike = createAvatarInventoryEntry({ id: 'vehicle:1:0,0', kind: InventoryEntryKind.VEHICLE, type: VehicleType.BICYCLE });
        const car = createAvatarInventoryEntry({ id: 'vehicle:1:5,5', kind: InventoryEntryKind.VEHICLE, type: VehicleType.CAR });

        inventory = withEntryAdded(inventory, bike);
        assert(inventory.mostRecent() === bike, '36. FLAGSHIP step 1: storing one vehicle makes it the most recent');

        inventory = withEntryAdded(inventory, car);
        assert(inventory.mostRecent() === car, '37. FLAGSHIP step 2: storing a second makes IT the most recent');
        assert(inventory.size === 2, '38. FLAGSHIP step 2b: both are carried');

        inventory = withEntryRemoved(inventory, car.id);
        assert(inventory.mostRecent() === bike, '39. FLAGSHIP step 3: deploying the car falls back to the bike as most recent');
        assert(inventory.size === 1, '40. FLAGSHIP step 3b: only the bike remains carried');

        inventory = withEntryRemoved(inventory, bike.id);
        assert(inventory.mostRecent() === null && inventory.size === 0, '41. FLAGSHIP step 4: deploying the bike empties the inventory');
    }

    // -------------------------------------------------------------
    // Section F — 0.9.671: get()/resolve()/next()/previous()
    // -------------------------------------------------------------
    {
        const inventory = emptyAvatarInventory();
        assert(inventory.get('anything') === null, '42. get() on an empty inventory is null');
        assert(inventory.resolve(null) === null, '43. resolve(null) on an empty inventory is null');
        assert(inventory.resolve('stale-id') === null, '44. resolve() of any id on an empty inventory is null');
        assert(inventory.next(null) === null && inventory.previous(null) === null,
            '45. next()/previous() on an empty inventory are both null, never a throw');
    }
    {
        const a = createAvatarInventoryEntry({ id: 'a', kind: InventoryEntryKind.VEHICLE, type: VehicleType.BICYCLE });
        const b = createAvatarInventoryEntry({ id: 'b', kind: InventoryEntryKind.VEHICLE, type: VehicleType.MOTORCYCLE });
        const c = createAvatarInventoryEntry({ id: 'c', kind: InventoryEntryKind.VEHICLE, type: VehicleType.CAR });
        const inventory = new AvatarInventory([a, b, c]); // oldest -> newest: a, b, c

        assert(inventory.get('b') === b, '46. get() finds an entry by id');
        assert(inventory.get('missing') === null, '47. get() of an unknown id is null');

        assert(inventory.resolve(null) === c, '48. resolve(null) defaults to mostRecent()');
        assert(inventory.resolve('b') === b, '49. resolve() of a real, carried id returns that exact entry');
        assert(inventory.resolve('gone') === c, '50. resolve() of an id no longer carried falls back to mostRecent(), never null or a throw');

        // next()/previous() walk the array in order, wrapping around —
        // starting position for `null` is the same implicit "most
        // recent" resolve(null) already uses.
        assert(inventory.next(null) === a, '51. next(null) wraps from the implicit most-recent (c) around to the oldest (a)');
        assert(inventory.previous(null) === b, '52. previous(null) steps one older than the implicit most-recent (c), landing on b');

        assert(inventory.next('a') === b, '53. next(a) steps to b');
        assert(inventory.next('c') === a, '54. next(c) wraps around to a');
        assert(inventory.previous('a') === c, '55. previous(a) wraps around to c');
        assert(inventory.previous('c') === b, '56. previous(c) steps to b');

        assert(inventory.next('missing') === inventory.next(null), '57. next() of a stale/unknown id starts from the same implicit most-recent position as next(null)');
        assert(inventory.previous('missing') === inventory.previous(null), '58. previous() of a stale/unknown id likewise matches previous(null)');
    }
    {
        // Cycling with exactly one entry always lands back on that same
        // entry — there is nothing else to select.
        const only = createAvatarInventoryEntry({ id: 'solo', kind: InventoryEntryKind.VEHICLE, type: VehicleType.DRONE });
        const inventory = new AvatarInventory([only]);
        assert(inventory.next('solo') === only && inventory.previous('solo') === only,
            '59. cycling a single-entry inventory in either direction returns that same entry');
        assert(inventory.next(null) === only && inventory.previous(null) === only,
            '60. and the same holds starting from no explicit selection');
    }
    {
        // FLAGSHIP: a full cycle backward through three entries returns
        // to the start; a full cycle forward does too.
        const a = createAvatarInventoryEntry({ id: 'a', kind: InventoryEntryKind.VEHICLE, type: VehicleType.BICYCLE });
        const b = createAvatarInventoryEntry({ id: 'b', kind: InventoryEntryKind.VEHICLE, type: VehicleType.MOTORCYCLE });
        const c = createAvatarInventoryEntry({ id: 'c', kind: InventoryEntryKind.VEHICLE, type: VehicleType.CAR });
        const inventory = new AvatarInventory([a, b, c]);

        let id = null;
        let entry = inventory.previous(id); id = entry.id; // c -> b
        entry = inventory.previous(id); id = entry.id;      // b -> a
        entry = inventory.previous(id); id = entry.id;      // a -> c (wrap)
        assert(id === 'c', '61. FLAGSHIP: three previous() calls from the default return exactly to the most-recent entry (c)');

        id = null;
        entry = inventory.next(id); id = entry.id; // c -> a (wrap)
        entry = inventory.next(id); id = entry.id;  // a -> b
        entry = inventory.next(id); id = entry.id;  // b -> c
        assert(id === 'c', '62. FLAGSHIP: three next() calls from the default likewise return exactly to c');
    }

    // -------------------------------------------------------------
    // Section G — 0.9.700: a shared inventory, kind-scoped queries
    // -------------------------------------------------------------
    {
        const bike = createAvatarInventoryEntry({ id: 'bike', kind: InventoryEntryKind.VEHICLE, type: VehicleType.BICYCLE });
        const rabbit = createAvatarInventoryEntry({ id: 'rabbit', kind: InventoryEntryKind.ANIMAL, type: ANIMAL_SPECIES.RABBIT });
        const car = createAvatarInventoryEntry({ id: 'car', kind: InventoryEntryKind.VEHICLE, type: VehicleType.CAR });
        const deer = createAvatarInventoryEntry({ id: 'deer', kind: InventoryEntryKind.ANIMAL, type: ANIMAL_SPECIES.DEER });
        // Stored in mixed order: bike, rabbit, car, deer.
        let inventory = withEntryAdded(withEntryAdded(withEntryAdded(withEntryAdded(
            emptyAvatarInventory(), bike), rabbit), car), deer);

        assert(inventory.size === 4, '63. all four entries are carried, regardless of kind');
        assert(inventory.entriesOf(InventoryEntryKind.VEHICLE).length === 2, '64. entriesOf(VEHICLE) finds only the two vehicles');
        assert(inventory.entriesOf(InventoryEntryKind.ANIMAL).length === 2, '65. entriesOf(ANIMAL) finds only the two animals');
        assert(inventory.entriesOf(InventoryEntryKind.VEHICLE).every((e) => e.kind === InventoryEntryKind.VEHICLE),
            '66. entriesOf(VEHICLE) never includes an ANIMAL entry');

        // The most recently added entry overall is `deer` (an animal) —
        // an unscoped mostRecent()/resolve() would return it, exactly
        // the bug this milestone's own header warns about.
        assert(inventory.mostRecent() === deer, '67. unscoped mostRecent() still reflects true LIFO order across kinds');
        assert(inventory.mostRecent(InventoryEntryKind.VEHICLE) === car, '68. mostRecent(VEHICLE) skips the animal entries and returns the most recent VEHICLE (car), never deer');
        assert(inventory.mostRecent(InventoryEntryKind.ANIMAL) === deer, '69. mostRecent(ANIMAL) returns the most recent ANIMAL');

        assert(inventory.resolve(null, InventoryEntryKind.VEHICLE) === car, '70. resolve(null, VEHICLE) defaults to the most recent VEHICLE');
        assert(inventory.resolve('deer', InventoryEntryKind.VEHICLE) === car,
            '71. resolve() of a real id belonging to the WRONG kind is treated as stale — falls back to mostRecent(VEHICLE), never returns the animal');
        assert(inventory.resolve('bike', InventoryEntryKind.VEHICLE) === bike, '72. resolve() of a real id of the RIGHT kind returns it');

        // Cycling VEHICLE-only must never land on an ANIMAL entry.
        assert(inventory.next('car', InventoryEntryKind.VEHICLE) === bike, '73. next(car, VEHICLE) wraps to bike, skipping over the animal entries entirely');
        assert(inventory.previous('bike', InventoryEntryKind.VEHICLE) === car, '74. previous(bike, VEHICLE) wraps to car, likewise skipping animals');
        // And the mirror image: cycling ANIMAL-only must never land on a
        // VEHICLE entry.
        assert(inventory.next('deer', InventoryEntryKind.ANIMAL) === rabbit, '75. next(deer, ANIMAL) wraps to rabbit, skipping over the vehicle entries entirely');
        assert(inventory.previous('rabbit', InventoryEntryKind.ANIMAL) === deer, '76. previous(rabbit, ANIMAL) wraps to deer, likewise skipping vehicles');

        // FLAGSHIP: removing every VEHICLE entry never disturbs ANIMAL
        // queries, and vice versa.
        inventory = withEntryRemoved(withEntryRemoved(inventory, 'bike'), 'car');
        assert(inventory.size === 2, '77. FLAGSHIP: only the two animals remain');
        assert(inventory.entriesOf(InventoryEntryKind.VEHICLE).length === 0, '78. FLAGSHIP: no vehicles remain');
        assert(inventory.mostRecent(InventoryEntryKind.VEHICLE) === null, '79. FLAGSHIP: mostRecent(VEHICLE) is honestly null, never falling back to an animal');
        assert(inventory.resolve(null, InventoryEntryKind.VEHICLE) === null, '80. FLAGSHIP: resolve(null, VEHICLE) is likewise null');
        assert(inventory.next(null, InventoryEntryKind.VEHICLE) === null, '81. FLAGSHIP: next(null, VEHICLE) is likewise null — cycling an empty kind-pool never wraps into a different kind');
        assert(inventory.mostRecent(InventoryEntryKind.ANIMAL) === deer, '82. FLAGSHIP: ANIMAL queries are completely unaffected by removing every VEHICLE');
    }

    console.log('✅ All Avatar Inventory tests passed.');
}

runTests();
