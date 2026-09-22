import { deriveAvatarAnimalCatchTransition } from '../core/AvatarAnimalCatchTransition.js';
import { AvatarAnimalCatchIntent } from '../core/AvatarAnimalCatchIntent.js';
import { emptyAvatarInventory, withEntryAdded, createAvatarInventoryEntry, InventoryEntryKind } from '../core/AvatarInventory.js';
import { ANIMAL_SPECIES } from '../core/WildlifeField.js';
import { VehicleType } from '../core/VehicleType.js';

// 0.9.700 — Avatar Animal Catch Transition, core/AvatarAnimalCatchTransition.js.
//
//   Section A: the one rule — CATCH + a resolved animal catches it
//   Section B: every "nothing happens" branch returns caught:false and
//              the exact unchanged inventory reference
//   Section C: defensive/malformed input
//   Section D: FLAGSHIP — an inventory already carrying a vehicle gains
//              the animal alongside it, untouched

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function runTests() {
    const { NONE, CATCH } = AvatarAnimalCatchIntent;

    // -------------------------------------------------------------
    // Section A
    // -------------------------------------------------------------
    {
        const inventory = emptyAvatarInventory();
        const result = deriveAvatarAnimalCatchTransition({
            currentInventory: inventory,
            catchIntent: CATCH,
            animalId: 'animal:1:0,0',
            animalSpecies: ANIMAL_SPECIES.RABBIT
        });
        assert(result.caught === true, '1. CATCH + a resolved animal catches it');
        assert(result.inventory !== inventory, '2. a new inventory is returned, never the same reference');
        assert(result.inventory.size === 1, '3. exactly one entry was added');
        const entry = result.inventory.mostRecent();
        assert(entry.id === 'animal:1:0,0' && entry.kind === InventoryEntryKind.ANIMAL && entry.type === ANIMAL_SPECIES.RABBIT,
            '4. the entry carries the animal\'s own id/kind/species');
    }

    // -------------------------------------------------------------
    // Section B
    // -------------------------------------------------------------
    {
        const inventory = emptyAvatarInventory();
        const result = deriveAvatarAnimalCatchTransition({
            currentInventory: inventory,
            catchIntent: NONE,
            animalId: 'a',
            animalSpecies: ANIMAL_SPECIES.DEER
        });
        assert(result.caught === false && result.inventory === inventory, '5. no CATCH intent -> unchanged, even with a resolved animal');
    }
    {
        const inventory = emptyAvatarInventory();
        const result = deriveAvatarAnimalCatchTransition({
            currentInventory: inventory,
            catchIntent: CATCH,
            animalId: null,
            animalSpecies: null
        });
        assert(result.caught === false && result.inventory === inventory, '6. no animal resolved (nothing in range) -> unchanged');
    }
    {
        const inventory = emptyAvatarInventory();
        const result = deriveAvatarAnimalCatchTransition({
            currentInventory: inventory,
            catchIntent: CATCH
        });
        assert(result.caught === false && result.inventory === inventory, '7. omitting animalId/animalSpecies entirely defaults to unchanged, never a throw');
    }

    // -------------------------------------------------------------
    // Section C
    // -------------------------------------------------------------
    {
        let threw = false;
        try { deriveAvatarAnimalCatchTransition({ currentInventory: { entries: [] }, catchIntent: NONE }); } catch (e) { threw = true; }
        assert(threw, '8. a currentInventory that is not a real AvatarInventory throws');
    }
    {
        let threw = false;
        try { deriveAvatarAnimalCatchTransition({ currentInventory: emptyAvatarInventory(), catchIntent: 'garbage' }); } catch (e) { threw = true; }
        assert(threw, '9. an invalid catchIntent throws');
    }
    {
        let threw = false;
        try {
            deriveAvatarAnimalCatchTransition({
                currentInventory: emptyAvatarInventory(), catchIntent: CATCH,
                animalId: 'a', animalSpecies: 'SHEEP'
            });
        } catch (e) { threw = true; }
        assert(threw, '10. an invalid animalSpecies throws');
    }

    // -------------------------------------------------------------
    // Section D — FLAGSHIP
    // -------------------------------------------------------------
    {
        const already = withEntryAdded(emptyAvatarInventory(), createAvatarInventoryEntry({
            id: 'vehicle:1:0,0', kind: InventoryEntryKind.VEHICLE, type: VehicleType.BICYCLE
        }));
        const result = deriveAvatarAnimalCatchTransition({
            currentInventory: already,
            catchIntent: CATCH,
            animalId: 'animal:1:5,5',
            animalSpecies: ANIMAL_SPECIES.DEER
        });
        assert(result.caught === true, '11. FLAGSHIP: catching still succeeds alongside an already-carried vehicle');
        assert(result.inventory.size === 2, '12. FLAGSHIP: both entries now present');
        assert(result.inventory.has('vehicle:1:0,0') && result.inventory.has('animal:1:5,5'), '13. FLAGSHIP: both ids present');
        assert(result.inventory.entriesOf(InventoryEntryKind.VEHICLE).length === 1
            && result.inventory.entriesOf(InventoryEntryKind.ANIMAL).length === 1,
            '14. FLAGSHIP: one of each kind, correctly scoped');
        assert(already.size === 1, '15. FLAGSHIP: the original inventory passed in is never mutated');
    }

    console.log('✅ All Avatar Animal Catch Transition tests passed.');
}

runTests();
