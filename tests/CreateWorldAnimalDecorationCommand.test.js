import { World } from '../core/World.js';
import { Position } from '../core/Position.js';
import { ANIMAL_SPECIES } from '../core/WildlifeField.js';
import { CreateWorldAnimalDecorationCommand } from '../application/commands/CreateWorldAnimalDecorationCommand.js';
import { CreateCommandRegistryUseCase } from '../application/editor/CreateCommandRegistryUseCase.js';
import { assert } from './support/Assert.js';

// 0.9.702 — World Animal Decorations, application/commands/
// CreateWorldAnimalDecorationCommand.js. The direct structural twin of
// CreateWorldLandmarkCommand — this file mirrors that command's own test
// coverage shape.
//
//   Section A: execute() creates and mints an id
//   Section B: undo()/redo() — the SAME identity survives a redo
//   Section C: worldId mismatch guard
//   Section D: toJSON()/fromJSON() serialization
//   Section E: registered in CreateCommandRegistryUseCase's registry

function runTests() {
    // -------------------------------------------------------------
    // Section A
    // -------------------------------------------------------------
    {
        const world = new World({ id: 'w1' });
        const cmd = new CreateWorldAnimalDecorationCommand({
            worldId: 'w1',
            authorIdentityId: 'author1',
            species: ANIMAL_SPECIES.RABBIT,
            position: new Position(3, 1, -2)
        });
        assert(cmd.type === 'create-world-animal-decoration', '1. type is create-world-animal-decoration');
        assert(cmd.executedDecorationId === null, '2. executedDecorationId is null before execute()');
        const decoration = cmd.execute({ world });
        assert(decoration.species === ANIMAL_SPECIES.RABBIT, '3. execute() returns the created AnimalDecoration');
        assert(cmd.executedDecorationId === decoration.id, '4. executedDecorationId is populated after execute()');
        assert(world.getAnimalDecoration(decoration.id) === decoration, '5. the decoration is actually added to the World');
        assert(cmd.canUndo() === true, '6. canUndo() is true once executed');
    }

    // -------------------------------------------------------------
    // Section B
    // -------------------------------------------------------------
    {
        const world = new World({ id: 'w2' });
        const cmd = new CreateWorldAnimalDecorationCommand({
            worldId: 'w2', authorIdentityId: 'author1', species: ANIMAL_SPECIES.DEER, position: new Position()
        });
        assert(cmd.canUndo() === false, '7. canUndo() is false before execute()');
        let threwBeforeExecute = false;
        try { cmd.undo({ world }); } catch (e) { threwBeforeExecute = true; }
        assert(threwBeforeExecute, '8. undo() before execute() throws');

        cmd.execute({ world });
        const firstId = cmd.executedDecorationId;
        cmd.undo({ world });
        assert(world.getAnimalDecoration(firstId) === null, '9. undo() removes the decoration');

        // redo — execute() again recreates the SAME identity.
        cmd.execute({ world });
        assert(cmd.executedDecorationId === firstId, '10. redo (a second execute()) recreates the exact same id, never a fresh one');
        assert(world.getAnimalDecoration(firstId) !== null, '11. ...and it is present again');
    }

    // -------------------------------------------------------------
    // Section C
    // -------------------------------------------------------------
    {
        const world = new World({ id: 'w3' });
        const otherWorld = new World({ id: 'w3-other' });
        const cmd = new CreateWorldAnimalDecorationCommand({
            worldId: 'w3', authorIdentityId: 'author1', species: ANIMAL_SPECIES.RABBIT, position: new Position()
        });
        let threw = false;
        try { cmd.execute({ world: otherWorld }); } catch (e) { threw = true; }
        assert(threw, '12. execute() against the wrong World throws a worldId mismatch error');

        cmd.execute({ world });
        let threwOnUndo = false;
        try { cmd.undo({ world: otherWorld }); } catch (e) { threwOnUndo = true; }
        assert(threwOnUndo, '13. undo() against the wrong World also throws');
    }

    // -------------------------------------------------------------
    // Section D
    // -------------------------------------------------------------
    {
        const world = new World({ id: 'w4' });
        const cmd = new CreateWorldAnimalDecorationCommand({
            worldId: 'w4', authorIdentityId: 'author1', species: ANIMAL_SPECIES.RABBIT, position: new Position(7, 2, 9)
        });
        cmd.execute({ world });
        const json = cmd.toJSON();
        assert(json.type === 'create-world-animal-decoration', '14. toJSON() carries the type');
        assert(json.executedDecorationId === cmd.executedDecorationId, '15. toJSON() carries executedDecorationId');
        assert(json.position.x === 7 && json.position.y === 2 && json.position.z === 9, '16. toJSON() carries the exact position');

        const restored = CreateWorldAnimalDecorationCommand.fromJSON(json);
        assert(restored.worldId === 'w4', '17. fromJSON() restores worldId');
        assert(restored.authorIdentityId === 'author1', '18. fromJSON() restores authorIdentityId');
        assert(restored.species === ANIMAL_SPECIES.RABBIT, '19. fromJSON() restores species');
        assert(restored.executedDecorationId === cmd.executedDecorationId, '20. fromJSON() restores executedDecorationId — redo() on the restored command targets the SAME identity');

        // A restored command, redone, recreates the same identity even
        // against a freshly-loaded World that doesn't have it yet.
        const freshWorld = new World({ id: 'w4' });
        restored.execute({ world: freshWorld });
        assert(restored.executedDecorationId === cmd.executedDecorationId, '21. redo via a restored command keeps the original id');
        assert(freshWorld.getAnimalDecoration(cmd.executedDecorationId) !== null, '22. ...and the decoration is present in the fresh World');
    }

    // -------------------------------------------------------------
    // Section E
    // -------------------------------------------------------------
    {
        const registry = new CreateCommandRegistryUseCase().execute();
        const world = new World({ id: 'w5' });
        const cmd = new CreateWorldAnimalDecorationCommand({
            worldId: 'w5', authorIdentityId: 'author1', species: ANIMAL_SPECIES.RABBIT, position: new Position()
        });
        cmd.execute({ world });
        const rehydrated = registry.fromJSON(cmd.toJSON());
        assert(rehydrated instanceof CreateWorldAnimalDecorationCommand, '23. the command registry reconstructs a real CreateWorldAnimalDecorationCommand from its own type string');
        assert(rehydrated.executedDecorationId === cmd.executedDecorationId, '24. ...with the same executed identity');
    }

    console.log('✅ All CreateWorldAnimalDecorationCommand tests passed.');
}

runTests();
