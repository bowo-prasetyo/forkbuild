import { SelectionState } from '../editor-state/SelectionState.js';
import { CreateGroupCommand } from '../commands/CreateGroupCommand.js';
import { DeleteGroupCommand } from '../commands/DeleteGroupCommand.js';
import { RenameGroupCommand } from '../commands/RenameGroupCommand.js';
import { AddToGroupCommand } from '../commands/AddToGroupCommand.js';
import { RemoveFromGroupCommand } from '../commands/RemoveFromGroupCommand.js';
import { DuplicateGroupCommand } from '../commands/DuplicateGroupCommand.js';

// EditorSession clipboard and group operations, delegating to the shared
// clipboard use cases and the group commands.
export const clipboardAndGroupMethods = {
    copySelection() {
        if (!this._copySelectionUseCase || !this._documentManager.document) return null;
        const result = this._copySelectionUseCase.execute(this._editorContext.selection, this._documentManager.document);
        this._clipboardState = result;
        this._pasteCount = 0; // Reset cascade counter
        return result;
    },

    paste() {
        if (!this._pasteClipboardUseCase || !this._clipboardState || this._clipboardState.isEmpty || !this._documentManager.document || !this._commandHistory) return false;
        const document = this._documentManager.document;
        const world = document.world;
        const buildings = world.getBuildings();
        if (buildings.length === 0) return false;
        const buildingId = buildings[0].id;

        this._pasteCount = (this._pasteCount || 0) + 1;
        const offset = { x: 2 * this._pasteCount, y: 0, z: 2 * this._pasteCount };

        const command = this._pasteClipboardUseCase.execute(this._clipboardState, {
            worldId: world.id, buildingId, position: offset
        });
        if (!command) return false;
        this._commandHistory.execute(command);
        return true;
    },

    createGroupFromSelection(name = null) {
        const selection = this._editorContext.selection;
        const document = this._documentManager.document;
        if (selection.isEmpty || !document || !this._commandHistory) {
            return null;
        }
        const worldId = document.world.id;
        const brickIds = selection.brickIds;
        if (brickIds.length === 0) {
            return null;
        }
        const command = new CreateGroupCommand({ worldId, brickIds, name });
        this._commandHistory.execute(command);
        return command.executedGroupId;
    },

    renameSelectedGroup(name) {
        const groupId = this._selectedGroupId;
        const document = this._documentManager.document;
        if (!groupId || !document || !this._commandHistory) {
            return false;
        }
        this._commandHistory.execute(new RenameGroupCommand({
            worldId: document.world.id,
            groupId,
            name
        }));
        return true;
    },

    renameGroup(groupId, name) {
        if (!groupId) {
            return false;
        }
        this._selectedGroupId = groupId;
        return this.renameSelectedGroup(name);
    },

    duplicateSelectedGroup() {
        const groupId = this._selectedGroupId;
        const document = this._documentManager.document;
        if (!groupId || !document || !this._commandHistory) {
            return null;
        }
        const command = new DuplicateGroupCommand({
            worldId: document.world.id,
            groupId
        });
        this._commandHistory.execute(command);
        return command.executedGroupId;
    },

    duplicateGroup(groupId) {
        if (!groupId) {
            return null;
        }
        this._selectedGroupId = groupId;
        return this.duplicateSelectedGroup();
    },

    deleteSelectedGroup() {
        const groupId = this._selectedGroupId;
        const document = this._documentManager.document;
        if (!groupId || !document || !this._commandHistory) {
            return false;
        }
        this._commandHistory.execute(new DeleteGroupCommand({
            worldId: document.world.id,
            groupId
        }));
        this._selectedGroupId = null;
        return true;
    },

    deleteGroup(groupId) {
        if (!groupId) {
            return false;
        }
        this._selectedGroupId = groupId;
        return this.deleteSelectedGroup();
    },

    addSelectionToSelectedGroup(groupId = null) {
        groupId = groupId || this._selectedGroupId;
        const selection = this._editorContext.selection;
        const document = this._documentManager.document;
        if (!groupId || selection.isEmpty || !document || !this._commandHistory) {
            return false;
        }
        this._commandHistory.execute(new AddToGroupCommand({
            worldId: document.world.id,
            groupId,
            brickIds: selection.brickIds
        }));
        return true;
    },

    removeSelectionFromSelectedGroup(groupId = null) {
        groupId = groupId || this._selectedGroupId;
        const selection = this._editorContext.selection;
        const document = this._documentManager.document;
        if (!groupId || selection.isEmpty || !document || !this._commandHistory) {
            return false;
        }
        this._commandHistory.execute(new RemoveFromGroupCommand({
            worldId: document.world.id,
            groupId,
            brickIds: selection.brickIds
        }));
        return true;
    },

    selectGroup(groupId) {
        const document = this._documentManager.document;
        if (!document) {
            return false;
        }
        const group = document.world.getGroup(groupId);
        if (!group) {
            return false;
        }
        this._selectedGroupId = groupId;
        const items = [];
        for (const brickId of group.brickIds) {
            for (const building of document.world.getBuildings()) {
                if (building.findBrick(brickId)) {
                    items.push({ type: 'brick', buildingId: building.id, brickId });
                    break;
                }
            }
        }
        if (items.length > 0) {
            this._editorContext.setSelection(new SelectionState({ items }));
        }
        return true;
    },

    // Bridge between callers that pass a groupId and the action registry, which
    // works on the current selection.
    addToGroupWithSelection(groupId) {
        this._selectedGroupId = groupId;
        return this.addSelectionToSelectedGroup(groupId);
    },

    removeFromGroupWithSelection(groupId) {
        this._selectedGroupId = groupId;
        return this.removeSelectionFromSelectedGroup(groupId);
    }
};
