import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Position } from '../core/Position.js';
import { CommandHistory } from '../application/editor/CommandHistory.js';
import { CreateCommandRegistryUseCase } from '../application/editor/CreateCommandRegistryUseCase.js';
import { ReplayDocumentUseCase } from '../application/document/ReplayDocumentUseCase.js';
import { PlaceBrickCommand } from '../application/commands/PlaceBrickCommand.js';
import { DeleteBrickCommand } from '../application/commands/DeleteBrickCommand.js';
import { UndoOperationCommand, RedoOperationCommand, isSharedStepCommand } from '../application/commands/SharedUndoCommands.js';
import { editorSoundCueFor, EDITOR_ACTIVITY, EDITOR_SOUND_CUE } from '../core/EditorSoundCues.js';
import { assert } from './support/Assert.js';

// Undo and Redo while building together, as operations
// (application/commands/SharedUndoCommands.js): each takes back (or puts
// back) one earlier step by its id, only its own author's, skipped when it
// would change nothing; and a history holding them replays the same.
// Across real co-builders' Editors: BuildWithMe.

const WORLD = 'w';
const BUILDING = 'b';

function setup() {
    const world = new World({ id: WORLD });
    world.addBuilding(new Building({ id: BUILDING }));
    const authors = new Map();
    const history = new CommandHistory({
        world,
        findOperation: (id) => history.getExecutedCommands().findLast((command) => command.id === id) || null,
        operationAuthor: (id) => authors.get(id)
    });
    const bricks = () => world.getBuilding(BUILDING).getBricks().length;
    return { world, history, authors, bricks };
}
const place = (x) => new PlaceBrickCommand({ worldId: WORLD, buildingId: BUILDING, definitionId: 'core:cube', position: new Position(x, 0.5, 0) });

// Undo takes the step back, Redo puts it back; undoing either reverses it.
{
    const { history, bricks } = setup();
    const placed = place(1);
    history.execute(placed);
    const undo = new UndoOperationCommand({ worldId: WORLD, targetId: placed.id });
    history.execute(undo);
    assert(undo.applied && bricks() === 0, 'Undo takes the brick back');
    assert(isSharedStepCommand(undo) && !isSharedStepCommand(placed), 'a shared step is told apart');
    const redo = new RedoOperationCommand({ worldId: WORLD, targetId: placed.id });
    history.execute(redo);
    assert(redo.applied && bricks() === 1, 'Redo puts it back');
    history.undo();
    assert(bricks() === 0, 'undoing the Redo takes it back again');
    history.undo();
    assert(bricks() === 1, 'and undoing the Undo puts it back');
    assert(typeof undo.describe().key === 'string' || typeof undo.describe() === 'string', 'it describes itself');
    console.log('✓ Undo and Redo take back and put back one step by its id');
}

// Only the step's own author may take it back.
{
    const { history, authors, bricks } = setup();
    const placed = place(1);
    history.execute(placed);
    authors.set(placed.id, 'ana');
    const forged = new UndoOperationCommand({ worldId: WORLD, targetId: placed.id });
    authors.set(forged.id, 'ben');
    history.execute(forged);
    assert(!forged.applied && bricks() === 1, 'Ben can\'t take back Ana\'s step');
    history.undo();
    assert(bricks() === 1, 'and undoing that changes nothing either');
    const own = new UndoOperationCommand({ worldId: WORLD, targetId: placed.id });
    authors.set(own.id, 'ana');
    history.execute(own);
    assert(own.applied && bricks() === 0, 'Ana can');
    const unknown = new UndoOperationCommand({ worldId: WORLD, targetId: 'no-such-step' });
    history.execute(unknown);
    assert(!unknown.applied, 'a step this replica never had is skipped');
    console.log('✓ only a step\'s own author can take it back');
}

// A step someone changed since, so undoing it would change nothing, is skipped.
{
    const { world, history, bricks } = setup();
    const placed = place(1);
    history.execute(placed);
    const brickId = world.getBuilding(BUILDING).getBricks()[0].id;
    history.execute(new DeleteBrickCommand({ worldId: WORLD, buildingId: BUILDING, brickId }));
    const undo = new UndoOperationCommand({ worldId: WORLD, targetId: placed.id });
    history.execute(undo);
    assert(!undo.applied && bricks() === 0, 'skipped');
    assert(undo.toJSON().skipped === true, 'and recorded as skipped');
    console.log('✓ a step that can\'t be undone any more is skipped');
}

// The wire form, and a history replayed with its shared steps.
{
    const { world, history } = setup();
    const registry = new CreateCommandRegistryUseCase().execute();
    const first = place(1);
    const second = place(2);
    history.execute(first);
    history.execute(second);
    history.execute(new UndoOperationCommand({ worldId: WORLD, targetId: first.id }));
    const brickId = world.getBuilding(BUILDING).getBricks()[0].id;
    history.execute(new DeleteBrickCommand({ worldId: WORLD, buildingId: BUILDING, brickId }));
    history.execute(new UndoOperationCommand({ worldId: WORLD, targetId: second.id }));
    const json = history.getExecutedCommands()[2].toJSON();
    assert(json.type === 'undo-operation' && json.targetId === first.id && !('skipped' in json), `the wire form (${JSON.stringify(json)})`);
    const copy = registry.fromJSON(json);
    assert(copy instanceof UndoOperationCommand && copy.targetId === first.id && copy.id === json.id, 'round-trips through the registry');
    assert(registry.fromJSON({ ...json, type: 'redo-operation' }) instanceof RedoOperationCommand, 'Redo too');
    const replayed = new ReplayDocumentUseCase(registry).execute(history);
    assert(JSON.stringify(replayed.toJSON()) === JSON.stringify(world.toJSON()), 'a replay of the history ends where the build did');
    let refused = false;
    try {
        new UndoOperationCommand({ worldId: WORLD });
    } catch {
        refused = true;
    }
    assert(refused, 'a shared step names the step it takes back');
    console.log('✓ shared steps travel by id, and replay the same');
}

// They sound like Undo and Redo.
{
    assert(editorSoundCueFor(EDITOR_ACTIVITY.EXECUTED, { type: 'undo-operation' }) === EDITOR_SOUND_CUE.UNDO
        && editorSoundCueFor(EDITOR_ACTIVITY.EXECUTED, { type: 'redo-operation' }) === EDITOR_SOUND_CUE.REDO, 'Undo and Redo sounds');
    console.log('✓ a co-builder\'s Undo sounds like Undo');
}
