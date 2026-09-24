import { World } from '../core/World.js';
import { AnimalDecoration } from '../core/AnimalDecoration.js';
import { Position } from '../core/Position.js';
import { ANIMAL_SPECIES } from '../core/WildlifeField.js';
import { EventBus } from '../core/events/EventBus.js';
import { DomainEvent } from '../core/events/Event.js';
import { assert } from './support/Assert.js';

// 0.9.702 — World Animal Decorations, core/AnimalDecoration.js +
// core/World.js's own animalDecorations wiring.
//
//   Section A: AnimalDecoration's own construction/validation
//   Section B: World add/get/remove
//   Section C: World.toJSON()/fromJSON() round trip
//   Section D: backward compatibility — old World JSON has no
//              animalDecorations field at all
//   Section E: domain events

function runTests() {
    // -------------------------------------------------------------
    // Section A
    // -------------------------------------------------------------
    {
        let threw = false;
        try { new AnimalDecoration({ worldId: 'w', authorIdentityId: 'a', species: ANIMAL_SPECIES.RABBIT, position: new Position() }); }
        catch (e) { threw = true; }
        assert(threw, '1. AnimalDecoration requires an id');
    }
    {
        let threw = false;
        try { new AnimalDecoration({ id: 'd', authorIdentityId: 'a', species: ANIMAL_SPECIES.RABBIT, position: new Position() }); }
        catch (e) { threw = true; }
        assert(threw, '2. AnimalDecoration requires a worldId');
    }
    {
        let threw = false;
        try { new AnimalDecoration({ id: 'd', worldId: 'w', species: ANIMAL_SPECIES.RABBIT, position: new Position() }); }
        catch (e) { threw = true; }
        assert(threw, '3. AnimalDecoration requires an authorIdentityId');
    }
    {
        let threw = false;
        try { new AnimalDecoration({ id: 'd', worldId: 'w', authorIdentityId: 'a', species: 'NOT_A_SPECIES', position: new Position() }); }
        catch (e) { threw = true; }
        assert(threw, '4. AnimalDecoration rejects an invalid species');
    }
    {
        let threw = false;
        try { new AnimalDecoration({ id: 'd', worldId: 'w', authorIdentityId: 'a', species: ANIMAL_SPECIES.RABBIT }); }
        catch (e) { threw = true; }
        assert(threw, '5. AnimalDecoration requires a position');
    }
    {
        // Unlike WorldLandmark, Y is authoritative — a real, meaningful
        // value, never discarded on construction.
        const decoration = new AnimalDecoration({
            id: 'd', worldId: 'w', authorIdentityId: 'a', species: ANIMAL_SPECIES.RABBIT,
            position: { x: 1, y: 4.5, z: -2 }
        });
        assert(decoration.position.y === 4.5, '6. position.y is stored verbatim, never zeroed or discarded — the whole point of a decoration perched on top of a structure');
    }

    // -------------------------------------------------------------
    // Section B
    // -------------------------------------------------------------
    {
        const world = new World({ id: 'w1' });
        assert(world.getAnimalDecorations().length === 0, '7. a fresh World has no decorations');
        const decoration = new AnimalDecoration({
            id: 'd1', worldId: 'w1', authorIdentityId: 'author', species: ANIMAL_SPECIES.RABBIT, position: new Position(1, 2, 3)
        });
        world.addAnimalDecoration(decoration);
        assert(world.getAnimalDecoration('d1') === decoration, '8. addAnimalDecoration() + getAnimalDecoration() round trip the same instance');
        assert(world.getAnimalDecorations().length === 1, '9. getAnimalDecorations() lists it');
        world.removeAnimalDecoration('d1');
        assert(world.getAnimalDecoration('d1') === null, '10. removeAnimalDecoration() removes it');
        assert(world.getAnimalDecorations().length === 0, '11. ...and it no longer appears in the list');
        // Removing an id that was never added is a harmless no-op.
        world.removeAnimalDecoration('never-added');
    }

    // -------------------------------------------------------------
    // Section C
    // -------------------------------------------------------------
    {
        const world = new World({ id: 'w2' });
        world.addAnimalDecoration(new AnimalDecoration({
            id: 'd2', worldId: 'w2', authorIdentityId: 'author', species: ANIMAL_SPECIES.DEER, position: new Position(10, 1.5, -4)
        }));
        const json = world.toJSON();
        assert(Array.isArray(json.animalDecorations) && json.animalDecorations.length === 1, '12. World.toJSON() includes animalDecorations');
        assert(json.animalDecorations[0].species === 'DEER', '13. the serialized species is correct');
        assert(json.animalDecorations[0].position.y === 1.5, '14. the serialized position.y survives, unaltered');

        const restored = World.fromJSON(json);
        const restoredDecoration = restored.getAnimalDecoration('d2');
        assert(restoredDecoration !== null, '15. World.fromJSON() reconstructs the decoration');
        assert(restoredDecoration.species === ANIMAL_SPECIES.DEER, '16. ...with the right species');
        assert(restoredDecoration.position.x === 10 && restoredDecoration.position.y === 1.5 && restoredDecoration.position.z === -4,
            '17. ...and the exact same position');
    }

    // -------------------------------------------------------------
    // Section D
    // -------------------------------------------------------------
    {
        const preExistingWorldJson = { id: 'w-old', metadata: {}, buildings: [] };
        const world = World.fromJSON(preExistingWorldJson);
        assert(world.getAnimalDecorations().length === 0, '18. a World serialized before 0.9.702 (no animalDecorations field at all) loads fine, with zero decorations');
    }

    // -------------------------------------------------------------
    // Section E
    // -------------------------------------------------------------
    {
        const eventBus = new EventBus();
        const world = new World({ id: 'w3', eventBus });
        const events = [];
        eventBus.subscribe(DomainEvent.ANIMAL_DECORATION_ADDED, (payload) => events.push(['added', payload.decoration]));
        eventBus.subscribe(DomainEvent.ANIMAL_DECORATION_REMOVED, (payload) => events.push(['removed', payload.decoration]));

        const decoration = new AnimalDecoration({
            id: 'd3', worldId: 'w3', authorIdentityId: 'author', species: ANIMAL_SPECIES.RABBIT, position: new Position()
        });
        world.addAnimalDecoration(decoration);
        world.removeAnimalDecoration('d3');

        assert(events.length === 2, '19. exactly two events fired');
        assert(events[0][0] === 'added' && events[0][1] === decoration, '20. ANIMAL_DECORATION_ADDED carries the exact decoration instance');
        assert(events[1][0] === 'removed' && events[1][1] === decoration, '21. ANIMAL_DECORATION_REMOVED carries the exact decoration instance');
    }
    {
        // A World built with no eventBus publishes nothing — the same
        // graceful-absence posture every other World mutation already has.
        const world = new World({ id: 'w4' });
        world.addAnimalDecoration(new AnimalDecoration({
            id: 'd4', worldId: 'w4', authorIdentityId: 'author', species: ANIMAL_SPECIES.RABBIT, position: new Position()
        }));
        console.log('✅ All Animal Decoration tests passed.');
    }
}

runTests();
