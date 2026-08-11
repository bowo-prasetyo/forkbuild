import { PasteBricksCommand } from './commands/PasteBricksCommand.js';

// Paste is mutation (0.1.42): turns clipboard intent into exactly ONE
// PasteBricksCommand, ready for CommandHistory.execute() — so paste is
// undoable, redoable, serializable, replayable, and restorable like
// every other operation, and the Operation Timeline shows a single
// "Paste N Bricks" entry.
//
// Positions are the clipboard's pivot-relative geometry re-anchored at
// the requested paste position. Identities are created by the command
// at execution time — never carried by the clipboard, never passed in
// here.
export class PasteClipboardUseCase {
    execute(clipboard, { worldId, buildingId, position }) {
        if (!clipboard || clipboard.isEmpty) {
            return null;
        }
        const items = clipboard.items.map((item) => ({
            definitionId: item.definitionId,
            position: {
                x: item.position.x + position.x,
                y: item.position.y + position.y,
                z: item.position.z + position.z
            },
            rotation: item.rotation
        }));
        return new PasteBricksCommand({
            worldId,
            buildingId,
            items,
            description: `Paste ${items.length} ${items.length === 1 ? 'Brick' : 'Bricks'}`
        });
    }
}
