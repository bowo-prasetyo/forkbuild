import { deriveAvatarAnimalReleaseTransition } from '../core/AvatarAnimalReleaseTransition.js';
import { AvatarAnimalReleaseIntent } from '../core/AvatarAnimalReleaseIntent.js';
import { emptyAvatarInventory, withEntryAdded, createAvatarInventoryEntry, InventoryEntryKind } from '../core/AvatarInventory.js';
import { ANIMAL_SPECIES } from '../core/WildlifeField.js';
import { VehicleType } from '../core/VehicleType.js';

// 0.9.700 — Avatar Animal Release Transition, core/AvatarAnimalReleaseTransition.js.
//
//   Section A: the one rule — RELEASE + at least one carried animal
//              releases the resolved one
//   Section B: unchanged branches
//   Section C: defensive/malformed input
//   Section D: FLAGSHIP — carrying a vehicle AND an animal, releasing
//              never touches the vehicle, whatever the mount state would
//              have been (this file takes no currentMount at all)

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function runTests() {
    const { NONE, RELEASE } = AvatarAnimalReleaseIntent;

    // -------------------------------------------------------------
    // Section A
    // -------------------------------------------------------------
    {
        const rabbit = createAvatarInventoryEntry({ id: 'animal:1:0,0', kind: InventoryEntryKind.ANIMAL, type: ANIMAL_SPECIES.RABBIT });
        const inventory = withEntryAdded(emptyAvatarInventory(), rabbit);
        const result = deriveAvatarAnimalReleaseTransition({ currentInventory: inventory, releaseIntent: RELEASE });
        assert(result.entry === rabbit, '1. a release request while carrying one animal releases exactly that entry');
        assert(result.inventory !== inventory, '2. a new inventory is returned');
        assert(result.inventory.size === 0, '3. the entry is removed from the returned inventory');
        assert(inventory.size === 1, '4. the original inventory passed in is never mutated');
    }

    // -------------------------------------------------------------
    // Section B
    // -------------------------------------------------------------
    {
        const rabbit = createAvatarInventoryEntry({ id: 'a', kind: InventoryEntryKind.ANIMAL, type: ANIMAL_SPECIES.RABBIT });
        const inventory = withEntryAdded(emptyAvatarInventory(), rabbit);
        const result = deriveAvatarAnimalReleaseTransition({ currentInventory: inventory, releaseIntent: NONE });
        assert(result.entry === null && result.inventory === inventory, '5. no RELEASE intent -> unchanged');
    }
    {
        const inventory = emptyAvatarInventory();
        const result = deriveAvatarAnimalReleaseTransition({ currentInventory: inventory, releaseIntent: RELEASE });
        assert(result.entry === null && result.inventory === inventory, '6. nothing carried -> unchanged, even with RELEASE');
    }
    {
        // Carrying a VEHICLE only (no animal) — release must find nothing
        // to release, never mistakenly pop the vehicle.
        const bike = createAvatarInventoryEntry({ id: 'v', kind: InventoryEntryKind.VEHICLE, type: VehicleType.BICYCLE });
        const inventory = withEntryAdded(emptyAvatarInventory(), bike);
        const result = deriveAvatarAnimalReleaseTransition({ currentInventory: inventory, releaseIntent: RELEASE });
        assert(result.entry === null && result.inventory === inventory, '7. carrying only a vehicle (no animal) -> unchanged, the vehicle is never released as if it were an animal');
    }

    // -------------------------------------------------------------
    // Section C
    // -------------------------------------------------------------
    {
        let threw = false;
        try { deriveAvatarAnimalReleaseTransition({ currentInventory: [], releaseIntent: NONE }); } catch (e) { threw = true; }
        assert(threw, '8. a currentInventory that is not a real AvatarInventory throws');
    }
    {
        let threw = false;
        try { deriveAvatarAnimalReleaseTransition({ currentInventory: emptyAvatarInventory(), releaseIntent: 'garbage' }); } catch (e) { threw = true; }
        assert(threw, '9. an invalid releaseIntent throws');
    }

    // -------------------------------------------------------------
    // Section D — FLAGSHIP
    // -------------------------------------------------------------
    {
        const bike = createAvatarInventoryEntry({ id: 'v', kind: InventoryEntryKind.VEHICLE, type: VehicleType.CAR });
        const deer = createAvatarInventoryEntry({ id: 'a', kind: InventoryEntryKind.ANIMAL, type: ANIMAL_SPECIES.DEER });
        const inventory = withEntryAdded(withEntryAdded(emptyAvatarInventory(), bike), deer);

        const result = deriveAvatarAnimalReleaseTransition({ currentInventory: inventory, releaseIntent: RELEASE });
        assert(result.entry === deer, '10. FLAGSHIP: the carried animal releases, never the carried vehicle');
        assert(result.inventory.size === 1 && result.inventory.has('v'), '11. FLAGSHIP: the vehicle remains fully untouched');
        assert(!result.inventory.has('a'), '12. FLAGSHIP: only the animal is gone');
    }

    console.log('✅ All Avatar Animal Release Transition tests passed.');
}

runTests();
