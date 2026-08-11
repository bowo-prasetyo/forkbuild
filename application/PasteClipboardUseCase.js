import { PasteBricksCommand } from './commands/PasteBricksCommand.js';

// Successive pastes cascade by this offset (× paste count) so repeated
// pastes don't stack exactly on top of each other. Defined once here and
// shared by every paste surface (World View and Editor, 0.1.43).
export const PASTE_OFFSET = { x: 2, y: 0, z: 2 };

// Paste is mutation (0.1.42): turns clipboard intent into exactly ONE
// PasteBricksCommand, ready for CommandHistory.execute() — undoable,
// redoable, serializable, replayable, restorable. Positions are the
// clipboard's pivot-relative geometry re-anchored at the requested
// paste position; identities are created by the command at execution
// time — never carried by the clipboard.
//
// As of 0.1.43 the clipboard's group intent ({ name, memberIndices })
// is passed straight through: PasteBricksCommand creates the carried
// groups over the newly pasted brick ids.
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
            groups: clipboard.groups,
            description: `Paste ${items.length} ${items.length === 1 ? 'Brick' : 'Bricks'}`
        });
    }
}
