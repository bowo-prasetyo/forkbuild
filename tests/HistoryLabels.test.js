// Undo/redo and history timeline labels are messages (docs/Translating.md):
// each command names itself with one, a composite adds up children of one
// kind, and a label a command carries travels as a message while one saved
// by an older version is kept as the English it was written in.
import { isMessage, message } from '../core/Message.js';
import { CreateCommandRegistryUseCase } from '../application/editor/CreateCommandRegistryUseCase.js';
import { CommandHistory } from '../application/editor/CommandHistory.js';
import { CompositeCommand } from '../application/commands/CompositeCommand.js';
import { PlaceBrickCommand } from '../application/commands/PlaceBrickCommand.js';
import { DeleteBrickCommand } from '../application/commands/DeleteBrickCommand.js';
import { PasteBricksCommand } from '../application/commands/PasteBricksCommand.js';
import { TransformSelectionCommand } from '../application/commands/TransformSelectionCommand.js';
import { CreateWorldLandmarkCommand } from '../application/commands/CreateWorldLandmarkCommand.js';
import { CreateWorldAnimalDecorationCommand } from '../application/commands/CreateWorldAnimalDecorationCommand.js';
import { descriptionFromJSON, descriptionToJSON } from '../application/commands/HistoryDescription.js';
import { World } from '../core/World.js';
import { displayText } from '../ui/i18n/i18n.js';
import { Translator } from '../ui/i18n/Translator.js';
import en from '../ui/i18n/messages/en.js';
import { assert } from './support/Assert.js';

// A command that can be undone without a World, named like three placed bricks.
const done = (description) => ({ canUndo: () => true, describe: () => description });

const place = () => new PlaceBrickCommand({ worldId: 'w', buildingId: 'b', definitionId: 'core:cube', position: { x: 0, y: 0, z: 0 } });

{
    // A. Each command names itself with a message.
    assert(isMessage(place().describe()) && displayText(place().describe()) === 'Place Brick', '1. A command names itself with a message');
    const landmark = new CreateWorldLandmarkCommand({ worldId: 'w', title: 'Old Well', position: { x: 0, y: 0, z: 0 } });
    assert(displayText(landmark.describe()) === 'Create Landmark “Old Well”' && landmark.describe().params.title === 'Old Well',
        '2. Someone\'s own title is a parameter, shown as written');
    const decoration = new CreateWorldAnimalDecorationCommand({ worldId: 'w', species: 'DEER', position: { x: 0, y: 0, z: 0 } });
    assert(displayText(decoration.describe()) === 'Decorate World with Deer', '3. An animal is named, not shown as its code');

    // B. A composite adds up children of one kind.
    const three = new CompositeCommand().add(place()).add(place()).add(place());
    assert(displayText(three.describe()) === 'Place 3 Bricks', '4. Three placed bricks are "Place 3 Bricks"');
    const mixed = new CompositeCommand().add(place()).add(new DeleteBrickCommand({ worldId: 'w', buildingId: 'b', brickId: 'x' }));
    assert(displayText(mixed.describe()) === '2 actions', '5. A mix is counted as actions');
    assert(displayText(new CompositeCommand().describe()) === 'Empty Action', '6. An empty composite says so');

    // C. Undo and redo wrap the command's own message.
    const history = new CommandHistory({ world: new World({ id: 'w' }) });
    history._undoStack.push(done(three.describe()));
    const undo = history.getUndoLabel();
    assert(isMessage(undo) && undo.key === 'history.undo' && isMessage(undo.params.action) && undo.params.action.key === 'history.placeBricks',
        '7. The undo label wraps the command\'s own message');
    assert(displayText(undo) === 'Undo Place 3 Bricks', '8. ...and reads "Undo Place 3 Bricks"');
}

{
    // D. A carried label travels as a message; an older one stays English.
    const registry = new CreateCommandRegistryUseCase().execute();
    const align = new TransformSelectionCommand({ worldId: 'w', transforms: [], description: message('history.alignBricks', { count: 3 }) });
    const json = align.toJSON();
    assert(json.description === undefined && json.descriptionMessage.key === 'history.alignBricks' && json.descriptionMessage.params.count === 3,
        '9. A carried label is written as descriptionMessage, with no English description');
    const restored = registry.fromJSON(JSON.parse(JSON.stringify(json)));
    assert(displayText(restored.describe()) === 'Align 3 Bricks', '10. ...and read back as the same message');

    const legacy = registry.fromJSON({ ...json, descriptionMessage: undefined, description: 'Snap Layout' });
    assert(legacy.describe() === 'Snap Layout' && displayText(legacy.describe()) === 'Snap Layout',
        '11. A label an older version saved in English is shown as written');
    const bare = registry.fromJSON({ ...json, descriptionMessage: undefined });
    assert(displayText(bare.describe()) === 'Transform Selection', '12. With neither, the command\'s own label');

    // What an older peer reads: `json.description || default`, which is its own label, never a key.
    assert((json.description || 'Transform Selection') === 'Transform Selection',
        '13. An older peer, finding no description, falls back to its own label');

    const paste = new PasteBricksCommand({ worldId: 'w', buildingId: 'b', items: [{ definitionId: 'core:cube', position: { x: 0, y: 0, z: 0 } }, { definitionId: 'core:cube', position: { x: 1, y: 0, z: 0 } }] });
    assert(displayText(registry.fromJSON(JSON.parse(JSON.stringify(paste.toJSON()))).describe()) === 'Paste 2 Bricks',
        '14. A command without a carried label names itself after a round trip');

    assert(descriptionFromJSON({ descriptionMessage: { key: '' } }) === null && descriptionFromJSON(null) === null,
        '15. A malformed descriptionMessage is ignored');
    assert(JSON.stringify(descriptionToJSON(null)) === JSON.stringify({ description: null }), '16. No label writes description: null, as before');
}

{
    // E. In another language, with its own plural forms and word order.
    const german = new Translator({
        locale: 'de',
        fallbackMessages: en,
        messages: {
            'history.undo': '{action} rückgängig machen',
            'history.placeBricks': { one: 'Stein platzieren', other: '{count} Steine platzieren' }
        }
    });
    const history = new CommandHistory({ world: new World({ id: 'w' }) });
    history._undoStack.push(done(new CompositeCommand().add(place()).add(place()).describe()));
    const undo = history.getUndoLabel();
    assert(german.translate(undo.key, undo.params) === '2 Steine platzieren rückgängig machen',
        '17. The whole label is translated, the action inside it too');
}

console.log('✅ All History Labels tests passed.');
