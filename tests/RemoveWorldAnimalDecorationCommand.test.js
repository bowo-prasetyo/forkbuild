import { World } from '../core/World.js';
import { Position } from '../core/Position.js';
import { ANIMAL_SPECIES } from '../core/WildlifeField.js';
import { AnimalDecoration } from '../core/AnimalDecoration.js';
import { CreateWorldAnimalDecorationCommand } from '../application/commands/CreateWorldAnimalDecorationCommand.js';
import { RemoveWorldAnimalDecorationCommand } from '../application/commands/RemoveWorldAnimalDecorationCommand.js';
import { CreateCommandRegistryUseCase } from '../application/editor/CreateCommandRegistryUseCase.js';
import { assert } from './support/Assert.js';

// 0.9.703 — World Animal Decorations: Removal, application/commands/
// RemoveWorldAnimalDecorationCommand.js. The direct structural twin of
// RemoveWorldLandmarkCommand's own test coverage shape.
//
//   Section A: execute() removes an existing decoration
//   Section B: execute() against an unknown decorationId throws
//   Section C: undo() restores the exact same decoration
//   Section D: worldId mismatch guard
//   Section E: toJSON()/fromJSON() serialization
//   Section F: registered in CreateCommandRegistryUseCase's registry

function runTests() {
    // -------------------------------------------------------------
    // Section A
    // -------------------------------------------------------------
    {
        const world = new World({ id: 'w1' });
        const decoration = new AnimalDecoration({
            id: 'd1', worldId: 'w1', authorIdentityId: 'author', species: ANIMAL_SPECIES.RABBIT, position: new Position(1, 2, 3)
        });
        world.addAnimalDecoration(decoration);

        const cmd = new RemoveWorldAnimalDecorationCommand({ worldId: 'w1', decorationId: 'd1' });
        assert(cmd.type === 'remove-world-animal-decoration', '1. type is remove-world-animal-decoration');
        const removed = cmd.execute({ world });
        assert(removed === decoration, '2. execute() returns the removed decoration');
        assert(world.getAnimalDecoration('d1') === null, '3. the decoration is actually gone from the World');
        assert(cmd.canUndo() === true, '4. canUndo() is true once executed');
    }

    // -------------------------------------------------------------
    // Section B
    // -------------------------------------------------------------
    {
        const world = new World({ id: 'w2' });
        const cmd = new RemoveWorldAnimalDecorationCommand({ worldId: 'w2', decorationId: 'never-existed' });
        let threw = false;
        try { cmd.execute({ world }); } catch (e) { threw = true; }
        assert(threw, '5. execute() against an unknown decorationId throws');
        assert(cmd.canUndo() === false, '6. canUndo() stays false after a failed execute()');
    }

    // -------------------------------------------------------------
    // Section C
    // -------------------------------------------------------------
    {
        const world = new World({ id: 'w3' });
        world.addAnimalDecoration(new AnimalDecoration({
            id: 'd3', worldId: 'w3', authorIdentityId: 'author', species: ANIMAL_SPECIES.DEER, position: new Position(5, 1.2, -3)
        }));
        const cmd = new RemoveWorldAnimalDecorationCommand({ worldId: 'w3', decorationId: 'd3' });
        let threwBeforeExecute = false;
        try { cmd.undo({ world }); } catch (e) { threwBeforeExecute = true; }
        assert(threwBeforeExecute, '7. undo() before execute() throws');

        cmd.execute({ world });
        cmd.undo({ world });
        const restored = world.getAnimalDecoration('d3');
        assert(restored !== null, '8. undo() restores the decoration');
        assert(restored.species === ANIMAL_SPECIES.DEER, '9. ...with the same species');
        assert(restored.position.x === 5 && restored.position.y === 1.2 && restored.position.z === -3, '10. ...and the exact same position');
        assert(restored.authorIdentityId === 'author', '11. ...and the same authorIdentityId');
    }

    // -------------------------------------------------------------
    // Section D
    // -------------------------------------------------------------
    {
        const world = new World({ id: 'w4' });
        const otherWorld = new World({ id: 'w4-other' });
        world.addAnimalDecoration(new AnimalDecoration({
            id: 'd4', worldId: 'w4', authorIdentityId: 'author', species: ANIMAL_SPECIES.RABBIT, position: new Position()
        }));
        const cmd = new RemoveWorldAnimalDecorationCommand({ worldId: 'w4', decorationId: 'd4' });
        let threw = false;
        try { cmd.execute({ world: otherWorld }); } catch (e) { threw = true; }
        assert(threw, '12. execute() against the wrong World throws a worldId mismatch error');
    }

    // -------------------------------------------------------------
    // Section E
    // -------------------------------------------------------------
    {
        const world = new World({ id: 'w5' });
        world.addAnimalDecoration(new AnimalDecoration({
            id: 'd5', worldId: 'w5', authorIdentityId: 'author', species: ANIMAL_SPECIES.RABBIT, position: new Position(7, 2, 9)
        }));
        const cmd = new RemoveWorldAnimalDecorationCommand({ worldId: 'w5', decorationId: 'd5' });
        cmd.execute({ world });
        const json = cmd.toJSON();
        assert(json.type === 'remove-world-animal-decoration', '13. toJSON() carries the type');
        assert(json.decorationId === 'd5', '14. toJSON() carries decorationId');
        assert(json.removedDecorationJson.species === 'RABBIT', '15. toJSON() carries a snapshot of the removed decoration');

        const restoredCmd = RemoveWorldAnimalDecorationCommand.fromJSON(json);
        assert(restoredCmd.worldId === 'w5', '16. fromJSON() restores worldId');
        assert(restoredCmd.decorationId === 'd5', '17. fromJSON() restores decorationId');
        assert(restoredCmd.canUndo() === true, '18. fromJSON() restores enough state to allow undo()');

        const freshWorld = new World({ id: 'w5' });
        restoredCmd.undo({ world: freshWorld });
        assert(freshWorld.getAnimalDecoration('d5') !== null, '19. undo() via a restored command re-creates the decoration in a fresh World');
    }

    // -------------------------------------------------------------
    // Section F
    // -------------------------------------------------------------
    {
        const registry = new CreateCommandRegistryUseCase().execute();
        const world = new World({ id: 'w6' });
        const createCmd = new CreateWorldAnimalDecorationCommand({
            worldId: 'w6', authorIdentityId: 'author', species: ANIMAL_SPECIES.RABBIT, position: new Position()
        });
        createCmd.execute({ world });
        const removeCmd = new RemoveWorldAnimalDecorationCommand({ worldId: 'w6', decorationId: createCmd.executedDecorationId });
        removeCmd.execute({ world });
        const rehydrated = registry.fromJSON(removeCmd.toJSON());
        assert(rehydrated instanceof RemoveWorldAnimalDecorationCommand, '20. the command registry reconstructs a real RemoveWorldAnimalDecorationCommand from its own type string');
        assert(rehydrated.decorationId === createCmd.executedDecorationId, '21. ...targeting the same decoration id');
    }

    console.log('✅ All RemoveWorldAnimalDecorationCommand tests passed.');
}

runTests();
