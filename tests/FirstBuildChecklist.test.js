import {
    FIRST_BUILD_STEPS, FirstBuildStep, firstBuildStepsForEdit, isFirstBuildComplete, nextFirstBuildStep,
    normalizeFirstBuildProgress, shouldShowFirstBuildGuide
} from '../core/FirstBuildChecklist.js';
import { FirstBuildChecklistStore } from '../application/onboarding/FirstBuildChecklistStore.js';
import { FirstBuildChecklistTracker } from '../application/onboarding/FirstBuildChecklistTracker.js';
import { describeCommand } from '../application/commands/describeCommand.js';
import { PlaceBrickCommand } from '../application/commands/PlaceBrickCommand.js';
import { PlaceStructureCommand } from '../application/commands/PlaceStructureCommand.js';
import { PasteBricksCommand } from '../application/commands/PasteBricksCommand.js';
import { CompositeCommand } from '../application/commands/CompositeCommand.js';
import { MoveBrickCommand } from '../application/commands/MoveBrickCommand.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { EDITOR_ACTIVITY } from '../core/EditorSoundCues.js';
import { Position } from '../core/Position.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// The guided first build: five steps ticked off by doing them in the Editor
// (place a brick, stack one, drop in a structure, save, share a link), kept on
// this device, and hidden for someone who already knows the Editor.

const registry = new CreateBrickRegistryUseCase().execute();
const brickHeight = (id) => registry.get(id)?.height ?? 1;
const CUBE = 'core:cube';
const cubeHeight = brickHeight(CUBE);

// An edit as the Editor reports it (EditorSession#onCommandActivity hands
// listeners describeCommand() of the real command).
function placed(y, definitionId = CUBE) {
    return describeCommand(new PlaceBrickCommand({ worldId: 'w', buildingId: 'b', definitionId, position: new Position(2, y, 3) }));
}

// Which edits complete which steps.
{
    assert(JSON.stringify(firstBuildStepsForEdit(placed(cubeHeight / 2), brickHeight)) === JSON.stringify([FirstBuildStep.PLACE_BRICK]), 'a brick on the ground is placing a brick');
    assert(JSON.stringify(firstBuildStepsForEdit(placed(cubeHeight * 1.5), brickHeight)) === JSON.stringify([FirstBuildStep.PLACE_BRICK, FirstBuildStep.STACK]), 'a brick resting on another is stacking too');
    const plate = [...registry.getAll()].find((definition) => definition.height < cubeHeight);
    assert(plate && firstBuildStepsForEdit(placed(plate.height / 2, plate.id), brickHeight).length === 1, `a thin ${plate?.id} on the ground is not stacking`);
    assert(firstBuildStepsForEdit(describeCommand(new PlaceStructureCommand({ worldId: 'w', documentId: 'd', position: new Position(0, 0, 0) })), brickHeight)[0] === FirstBuildStep.STRUCTURE, 'placing a structure drops one in');
    assert(firstBuildStepsForEdit(describeCommand(new PasteBricksCommand({ worldId: 'w', buildingId: 'b' })), brickHeight)[0] === FirstBuildStep.STRUCTURE, 'composing one from the Build Library (a paste of its bricks) does too');
    const composite = new CompositeCommand();
    composite.add(new PlaceBrickCommand({ worldId: 'w', buildingId: 'b', definitionId: CUBE, position: new Position(0, cubeHeight * 2.5, 0) }));
    assert(firstBuildStepsForEdit(describeCommand(composite), brickHeight).includes(FirstBuildStep.STACK), 'a composite counts its children');
    assert(firstBuildStepsForEdit(describeCommand(new MoveBrickCommand({ worldId: 'w', buildingId: 'b', brickId: 'x', delta: { x: 1, y: 0, z: 0 } })), brickHeight).length === 0, 'moving a brick completes nothing');
    assert(firstBuildStepsForEdit(null).length === 0 && firstBuildStepsForEdit({ type: 'place-brick' }).join() === FirstBuildStep.PLACE_BRICK, 'read leniently');
    console.log('✓ which edits complete which steps');
}

// Progress: read leniently, in checklist order, shown until hidden or finished and seen.
{
    const fresh = normalizeFirstBuildProgress(null);
    assert(fresh.completed.length === 0 && !fresh.dismissed && !fresh.celebrated && shouldShowFirstBuildGuide(fresh), 'a new device shows the guide');
    assert(nextFirstBuildStep(fresh) === FirstBuildStep.PLACE_BRICK, 'starting with placing a brick');
    const odd = normalizeFirstBuildProgress({ completed: ['save', 'nonsense', 'place-brick', 'save'], dismissed: 'yes' });
    assert(odd.completed.join() === 'place-brick,save' && odd.dismissed === false, `unknown steps and values are dropped, order is the checklist's (${odd.completed})`);
    assert(nextFirstBuildStep(odd) === FirstBuildStep.STACK, 'the next step is the first not done, whatever order they were done in');
    const all = normalizeFirstBuildProgress({ completed: FIRST_BUILD_STEPS });
    assert(isFirstBuildComplete(all) && nextFirstBuildStep(all) === null && shouldShowFirstBuildGuide(all), 'finished, it shows its finish');
    assert(!shouldShowFirstBuildGuide({ ...all, celebrated: true }), 'and goes once the finish was seen');
    assert(!shouldShowFirstBuildGuide({ dismissed: true }), 'hidden is hidden');
    console.log('✓ progress');
}

// The tracker: real edits, a save and a share, kept on the device.
{
    const storage = new InMemoryStorageProvider();
    const listeners = new Set();
    const session = {
        onCommandActivity(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        }
    };
    const edit = (activity, command) => { for (const listener of listeners) listener(activity, describeCommand(command)); };
    const tracker = new FirstBuildChecklistTracker({ store: new FirstBuildChecklistStore({ storageProvider: storage }), brickHeight });
    assert(tracker.start({ experienced: false }).dismissed === false, 'a newcomer sees the guide');
    const seen = [];
    tracker.subscribe((progress) => seen.push(progress.completed.length));
    const stop = tracker.observe(session);

    const stacked = new PlaceBrickCommand({ worldId: 'w', buildingId: 'b', definitionId: CUBE, position: new Position(0, cubeHeight * 1.5, 0) });
    edit(EDITOR_ACTIVITY.UNDONE, stacked);
    edit(EDITOR_ACTIVITY.REDONE, stacked);
    assert(tracker.progress().completed.length === 0, 'undo and redo complete nothing');
    edit(EDITOR_ACTIVITY.EXECUTED, new PlaceBrickCommand({ worldId: 'w', buildingId: 'b', definitionId: CUBE, position: new Position(0, cubeHeight / 2, 0) }));
    edit(EDITOR_ACTIVITY.EXECUTED, new PlaceBrickCommand({ worldId: 'w', buildingId: 'b', definitionId: CUBE, position: new Position(1, cubeHeight / 2, 0) }));
    assert(seen.join() === '1', `placing again changes nothing more (${seen})`);
    edit(EDITOR_ACTIVITY.EXECUTED, stacked);
    edit(EDITOR_ACTIVITY.EXECUTED, new PlaceStructureCommand({ worldId: 'w', documentId: 'd', position: new Position(0, 0, 0) }));
    tracker.saved();
    assert(nextFirstBuildStep(tracker.progress()) === FirstBuildStep.SHARE, 'four done, sharing is next');
    const again = new FirstBuildChecklistTracker({ store: new FirstBuildChecklistStore({ storageProvider: storage }), brickHeight });
    assert(again.progress().completed.length === 4, 'progress is kept on the device');
    tracker.shared();
    assert(isFirstBuildComplete(tracker.progress()) && shouldShowFirstBuildGuide(tracker.progress()), 'shared: finished, and its finish shows');
    tracker.celebrated();
    assert(!shouldShowFirstBuildGuide(tracker.progress()), 'once seen, the guide goes');
    tracker.show();
    assert(shouldShowFirstBuildGuide(tracker.progress()), 'the palette command brings it back');
    stop();
    assert(listeners.size === 0, 'it stops following edits');
    console.log('✓ the tracker follows edits, a save and a share, and remembers them');
}

// Someone who already knows the Editor starts with it hidden, once.
{
    const storage = new InMemoryStorageProvider();
    const tracker = new FirstBuildChecklistTracker({ store: new FirstBuildChecklistStore({ storageProvider: storage }) });
    assert(tracker.start({ experienced: true }).dismissed === true, 'saved work already: hidden');
    tracker.show();
    const later = new FirstBuildChecklistTracker({ store: new FirstBuildChecklistStore({ storageProvider: storage }) });
    assert(later.start({ experienced: true }).dismissed === false, 'shown again on request, it stays shown');
    const broken = new FirstBuildChecklistTracker({ store: new FirstBuildChecklistStore({ storageProvider: new InMemoryStorageProvider() }) });
    broken.subscribe(() => { throw new Error('listener'); });
    broken.saved();
    assert(broken.progress().completed.join() === FirstBuildStep.SAVE, 'a failing listener never stops the tracker');
    console.log('✓ experienced devices start with the guide hidden');
}
