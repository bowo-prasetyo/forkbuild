import { deriveAvatarVehicleDeployTransition } from '../core/AvatarVehicleDeployTransition.js';
import { AvatarVehicleDeployIntent } from '../core/AvatarVehicleDeployIntent.js';
import { createAvatarVehicleMount } from '../core/AvatarVehicleMount.js';
import { emptyAvatarInventory, withEntryAdded, createAvatarInventoryEntry, InventoryEntryKind } from '../core/AvatarInventory.js';
import { VehicleType } from '../core/VehicleType.js';

// 0.9.670 — Avatar Vehicle Deploy Transition, core/AvatarVehicleDeployTransition.js.
//
//   Section A: the one rule — not mounted + DEPLOY + a carried entry pops it
//   Section B: every "nothing happens" branch returns the exact unchanged pair
//   Section C: defensive/malformed input
//   Section D: FLAGSHIP — carry two, deploy twice, LIFO order preserved
//   Section E: 0.9.671 — selectedEntryId deploys a specific carried
//              entry, with the same resolve()-driven fallback for a
//              stale/absent selection

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function runTests() {
    const { NONE, DEPLOY } = AvatarVehicleDeployIntent;

    // -------------------------------------------------------------
    // Section A — the one rule
    // -------------------------------------------------------------
    {
        const bike = createAvatarInventoryEntry({ id: 'vehicle:1:0,0', kind: InventoryEntryKind.VEHICLE, type: VehicleType.BICYCLE });
        const inventory = withEntryAdded(emptyAvatarInventory(), bike);
        const result = deriveAvatarVehicleDeployTransition({
            currentMount: null,
            currentInventory: inventory,
            deployIntent: DEPLOY
        });
        assert(result.entry === bike, '1. a deploy request while not mounted, carrying one entry, pops exactly that entry');
        assert(result.inventory !== inventory, '2. a new inventory is returned');
        assert(result.inventory.size === 0, '3. the entry is removed from the returned inventory');
        assert(inventory.size === 1, '4. the original inventory passed in is never mutated');
    }

    // -------------------------------------------------------------
    // Section B — unchanged branches
    // -------------------------------------------------------------
    {
        const bike = createAvatarInventoryEntry({ id: 'a', kind: InventoryEntryKind.VEHICLE, type: VehicleType.BICYCLE });
        const inventory = withEntryAdded(emptyAvatarInventory(), bike);
        const mount = createAvatarVehicleMount('vehicle:1:5,5');
        const result = deriveAvatarVehicleDeployTransition({
            currentMount: mount,
            currentInventory: inventory,
            deployIntent: DEPLOY
        });
        assert(result.entry === null && result.inventory === inventory, '5. already mounted -> unchanged, even with a carried entry and DEPLOY');
    }
    {
        const bike = createAvatarInventoryEntry({ id: 'a', kind: InventoryEntryKind.VEHICLE, type: VehicleType.BICYCLE });
        const inventory = withEntryAdded(emptyAvatarInventory(), bike);
        const result = deriveAvatarVehicleDeployTransition({
            currentMount: null,
            currentInventory: inventory,
            deployIntent: NONE
        });
        assert(result.entry === null && result.inventory === inventory, '6. no DEPLOY intent -> unchanged');
    }
    {
        const inventory = emptyAvatarInventory();
        const result = deriveAvatarVehicleDeployTransition({
            currentMount: null,
            currentInventory: inventory,
            deployIntent: DEPLOY
        });
        assert(result.entry === null && result.inventory === inventory, '7. nothing carried -> unchanged, even with DEPLOY and not mounted');
    }

    // -------------------------------------------------------------
    // Section C — defensive/malformed input
    // -------------------------------------------------------------
    {
        let threw = false;
        try {
            deriveAvatarVehicleDeployTransition({ currentMount: 'garbage', currentInventory: emptyAvatarInventory(), deployIntent: NONE });
        } catch (e) { threw = true; }
        assert(threw, '8. an invalid currentMount throws');
    }
    {
        let threw = false;
        try {
            deriveAvatarVehicleDeployTransition({ currentMount: null, currentInventory: [], deployIntent: NONE });
        } catch (e) { threw = true; }
        assert(threw, '9. a currentInventory that is not a real AvatarInventory throws');
    }
    {
        let threw = false;
        try {
            deriveAvatarVehicleDeployTransition({ currentMount: null, currentInventory: emptyAvatarInventory(), deployIntent: 'garbage' });
        } catch (e) { threw = true; }
        assert(threw, '10. an invalid deployIntent throws');
    }

    // -------------------------------------------------------------
    // Section D — FLAGSHIP: carry two, deploy in LIFO order
    // -------------------------------------------------------------
    {
        const bike = createAvatarInventoryEntry({ id: 'bike', kind: InventoryEntryKind.VEHICLE, type: VehicleType.BICYCLE });
        const car = createAvatarInventoryEntry({ id: 'car', kind: InventoryEntryKind.VEHICLE, type: VehicleType.CAR });
        let inventory = withEntryAdded(withEntryAdded(emptyAvatarInventory(), bike), car);

        let result = deriveAvatarVehicleDeployTransition({ currentMount: null, currentInventory: inventory, deployIntent: DEPLOY });
        assert(result.entry === car, '11. FLAGSHIP step 1: the most recently stored vehicle (car) deploys first');
        inventory = result.inventory;
        assert(inventory.size === 1 && inventory.has('bike'), '12. FLAGSHIP step 1b: only the bike remains');

        result = deriveAvatarVehicleDeployTransition({ currentMount: null, currentInventory: inventory, deployIntent: DEPLOY });
        assert(result.entry === bike, '13. FLAGSHIP step 2: the bike deploys next');
        inventory = result.inventory;
        assert(inventory.size === 0, '14. FLAGSHIP step 2b: inventory now empty');

        result = deriveAvatarVehicleDeployTransition({ currentMount: null, currentInventory: inventory, deployIntent: DEPLOY });
        assert(result.entry === null && result.inventory === inventory, '15. FLAGSHIP step 3: a third deploy with nothing left is a harmless no-op');
    }

    // -------------------------------------------------------------
    // Section E — 0.9.671: selectedEntryId
    // -------------------------------------------------------------
    {
        const bike = createAvatarInventoryEntry({ id: 'bike', kind: InventoryEntryKind.VEHICLE, type: VehicleType.BICYCLE });
        const car = createAvatarInventoryEntry({ id: 'car', kind: InventoryEntryKind.VEHICLE, type: VehicleType.CAR });
        const inventory = withEntryAdded(withEntryAdded(emptyAvatarInventory(), bike), car); // car is mostRecent()

        const result = deriveAvatarVehicleDeployTransition({
            currentMount: null,
            currentInventory: inventory,
            deployIntent: DEPLOY,
            selectedEntryId: 'bike'
        });
        assert(result.entry === bike, '16. a real selectedEntryId deploys THAT entry, not mostRecent()');
        assert(result.inventory.has('car') && !result.inventory.has('bike'), '17. only the selected entry is removed');
    }
    {
        const bike = createAvatarInventoryEntry({ id: 'bike', kind: InventoryEntryKind.VEHICLE, type: VehicleType.BICYCLE });
        const car = createAvatarInventoryEntry({ id: 'car', kind: InventoryEntryKind.VEHICLE, type: VehicleType.CAR });
        const inventory = withEntryAdded(withEntryAdded(emptyAvatarInventory(), bike), car);

        const result = deriveAvatarVehicleDeployTransition({
            currentMount: null,
            currentInventory: inventory,
            deployIntent: DEPLOY,
            selectedEntryId: 'no-longer-carried'
        });
        assert(result.entry === car, '18. a stale selectedEntryId (already deployed by other means) falls back to mostRecent(), never a throw or a no-op');
    }
    {
        const bike = createAvatarInventoryEntry({ id: 'bike', kind: InventoryEntryKind.VEHICLE, type: VehicleType.BICYCLE });
        const inventory = withEntryAdded(emptyAvatarInventory(), bike);
        const result = deriveAvatarVehicleDeployTransition({
            currentMount: null,
            currentInventory: inventory,
            deployIntent: DEPLOY
            // selectedEntryId omitted entirely
        });
        assert(result.entry === bike, '19. omitting selectedEntryId defaults to null, and behaves exactly as 0.9.670 always did (mostRecent())');
    }
    {
        let threw = false;
        try {
            deriveAvatarVehicleDeployTransition({
                currentMount: null,
                currentInventory: emptyAvatarInventory(),
                deployIntent: NONE,
                selectedEntryId: ''
            });
        } catch (e) { threw = true; }
        assert(threw, '20. an empty-string selectedEntryId throws — must be null or a real, non-empty id');
    }

    console.log('✅ All Avatar Vehicle Deploy Transition tests passed.');
}

runTests();
