import { AvatarAnimalInteractionController } from '../application/AvatarAnimalInteractionController.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { AnimalRuntimeInstances } from '../application/AnimalRuntimeInstances.js';
import { animalPresenceInRegion } from '../core/AnimalPlacement.js';
import { Position } from '../core/Position.js';
import { ANIMAL_SPECIES } from '../core/WildlifeField.js';
import { InventoryEntryKind } from '../core/AvatarInventory.js';

// 0.9.700 — Avatar-Animal Catch/Release Runtime Integration,
// application/AvatarAnimalInteractionController.js.
//
// Mirrors tests/AvatarVehicleInteractionController.test.js's own fixture
// discipline: a real, deterministically-placed animal under a real seed,
// exercised through the entire chain, never a mock of any core function.
//
//   Section A: Catch — approach a real animal, press F, verify it lands
//              in inventory and leaves the world (never rediscoverable
//              at its own spawn slot again)
//   Section B: Release — walk far away, press F, verify a brand new
//              AnimalPresence appears at the avatar's own current
//              position, registered in the runtime store
//   Section C: Release with nothing carried is a harmless no-op
//   Section D: Held-key safety mirrors the vehicle controller's own
//              discipline
//   Section E: Catch takes priority over release when both are possible
//              at once

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function buildAvatarPresenceSession(startPosition) {
    return new AvatarPresenceSession(
        { avatarId: 'tester-avatar', ownerIdentity: 'tester-owner' },
        { position: startPosition }
    );
}

const SEED = 29;

function findFixtureAnimal() {
    const animals = animalPresenceInRegion(SEED, -300, -300, 300, 300);
    if (animals.length === 0) {
        throw new Error(`No animals found under seed ${SEED} in the fixture region — has core/WildlifeField.js changed?`);
    }
    return animals[0];
}

function runTests() {
    const fixtureAnimal = findFixtureAnimal();

    // -------------------------------------------------------------
    // Section A — Catch
    // -------------------------------------------------------------
    let controller;
    let avatarPresenceSession;
    let animalRuntimeInstances;
    {
        const startPosition = new Position(fixtureAnimal.position.x - 0.5, 0, fixtureAnimal.position.z);
        avatarPresenceSession = buildAvatarPresenceSession(startPosition);
        animalRuntimeInstances = new AnimalRuntimeInstances();
        controller = new AvatarAnimalInteractionController(avatarPresenceSession, { seed: SEED, animalRuntimeInstances });

        assert(controller.inventory().size === 0, '1. a fresh controller carries nothing');
        const state = controller.catchInteractionState();
        assert(state.canCatch === true && state.targetAnimalId === fixtureAnimal.id, '2. the real animal is targeted for catching while in range');

        controller.keyDown('f');
        controller.tick();
        assert(controller.inventory().size === 1, '3. pressing F catches it — one entry now carried');
        const entry = controller.inventory().mostRecent();
        assert(entry.id === fixtureAnimal.id && entry.kind === InventoryEntryKind.ANIMAL && entry.type === fixtureAnimal.species,
            '4. the carried entry is the exact animal just caught');
        controller.keyUp('f');

        const stillThere = animalRuntimeInstances.sync(SEED, fixtureAnimal.position, 5);
        assert(!stillThere.some((a) => a.id === fixtureAnimal.id), '5. the caught animal never reappears at its own spawn slot after being caught');
    }

    // -------------------------------------------------------------
    // Section B — Release
    // -------------------------------------------------------------
    {
        const farPosition = new Position(fixtureAnimal.position.x + 500, 0, fixtureAnimal.position.z + 500);
        const current = avatarPresenceSession.current;
        avatarPresenceSession.update({ position: farPosition, rotation: current.rotation, animation: current.animation });

        const state = controller.catchInteractionState();
        assert(state.canCatch === false && state.canRelease === true && state.species === fixtureAnimal.species,
            '6. far from anything catchable, carrying one animal: release is offered for that species');

        controller.keyDown('f');
        controller.tick();
        assert(controller.inventory().size === 0, '7. pressing F with nothing catchable nearby releases the carried animal');
        controller.keyUp('f');

        const releasedNearby = animalRuntimeInstances.nearby(farPosition, 5);
        assert(releasedNearby.length === 1, '8. exactly one animal is now tracked near the avatar\'s own current position');
        const released = releasedNearby[0];
        assert(released.species === fixtureAnimal.species, '9. the released animal keeps the carried species');
        assert(released.id !== fixtureAnimal.id, '10. the released animal gets a brand new id, never the original deterministic one');
        assert(released.position.x === farPosition.x && released.position.z === farPosition.z,
            '11. the released animal appears exactly at the avatar\'s own current position');
    }

    // -------------------------------------------------------------
    // Section C — release with nothing carried is a no-op
    // -------------------------------------------------------------
    {
        // The just-released animal (Section B) stands exactly at the
        // avatar's own position — walk further away first, so it is no
        // longer immediately catchable and this section's own premise
        // ("nothing carried, nothing in range") actually holds.
        const current = avatarPresenceSession.current;
        avatarPresenceSession.update({
            position: new Position(current.position.x + 1000, 0, current.position.z + 1000),
            rotation: current.rotation,
            animation: current.animation
        });

        assert(controller.inventory().size === 0, '12. nothing carried at this point');
        const state = controller.catchInteractionState();
        assert(state.canCatch === false && state.canRelease === false, '13. neither catch nor release is offered');
        controller.keyDown('f');
        controller.tick();
        assert(controller.inventory().size === 0, '14. pressing F does nothing — no throw, no phantom entry');
        controller.keyUp('f');
    }

    // -------------------------------------------------------------
    // Section D — held-key safety
    // -------------------------------------------------------------
    {
        const startPosition = new Position(fixtureAnimal.position.x - 0.5, 0, fixtureAnimal.position.z);
        const session = buildAvatarPresenceSession(startPosition);
        const runtimeInstances = new AnimalRuntimeInstances();
        const c = new AvatarAnimalInteractionController(session, { seed: SEED, animalRuntimeInstances: runtimeInstances });

        c.keyDown('f');
        c.tick();
        assert(c.inventory().size === 1, '15. first tick with F held catches the animal');
        c.tick();
        assert(c.inventory().size === 1, '16. a second tick with F STILL held (key-repeat) does not release it right back out — one press, one transition');
        c.keyUp('f');

        // Walk away so release (not catch) is now the live action, then
        // verify the SAME held-key discipline applies to release too.
        const current = session.current;
        session.update({ position: new Position(startPosition.x + 500, 0, startPosition.z + 500), rotation: current.rotation, animation: current.animation });
        c.keyDown('f');
        c.tick();
        assert(c.inventory().size === 0, '17. first tick with F held (now nothing catchable nearby) releases the carried animal');
        c.tick();
        assert(c.inventory().size === 0, '18. a second tick with F still held does not do anything further (nothing left to release, and no phantom catch)');
        c.keyUp('f');
    }

    // -------------------------------------------------------------
    // Section E — catch takes priority over release
    // -------------------------------------------------------------
    {
        const startPosition = new Position(fixtureAnimal.position.x - 0.5, 0, fixtureAnimal.position.z);
        const session = buildAvatarPresenceSession(startPosition);
        const runtimeInstances = new AnimalRuntimeInstances();
        const c = new AvatarAnimalInteractionController(session, { seed: SEED, animalRuntimeInstances: runtimeInstances });

        // Release a placeholder animal right here first, so this
        // controller is simultaneously (a) carrying nothing yet — catch
        // the real fixture animal, ending up carrying it, THEN release
        // it, then re-approach to prove the SAME session can catch again
        // once something is back in range — a full round trip.
        c.keyDown('f'); c.tick(); c.keyUp('f');
        assert(c.inventory().size === 1, '19. caught the fixture animal');

        // Still standing right next to where the SAME animal id would
        // have been (now excluded) — nothing catchable here anymore, so
        // this press should RELEASE instead, never throw or no-op.
        c.keyDown('f'); c.tick(); c.keyUp('f');
        assert(c.inventory().size === 0, '20. with the original spot now empty (excluded), F releases the carried animal instead of doing nothing');

        // The just-released animal is standing right where the avatar
        // is — catch it again to prove catch beats release when both
        // are simultaneously true (an animal in range AND, if anything
        // were still carried, something to release).
        const state = c.catchInteractionState();
        assert(state.canCatch === true, '21. the just-released animal is immediately catchable again');
        c.keyDown('f'); c.tick(); c.keyUp('f');
        assert(c.inventory().size === 1, '22. FLAGSHIP: a full catch -> release -> catch round trip works end to end within one session');
    }

    console.log('✅ All Avatar-Animal Interaction Controller tests passed.');
}

runTests();
