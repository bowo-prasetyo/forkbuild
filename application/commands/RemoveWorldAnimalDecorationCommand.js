import { AnimalDecoration } from '../../core/AnimalDecoration.js';
import { Command } from './Command.js';

// 0.9.703 — World Animal Decorations: Removal. The direct structural
// twin of RemoveWorldLandmarkCommand.js — removes an existing
// AnimalDecoration from the World. The decorationId is stored at
// construction and never reassigned; _removedDecorationJson tracks what
// was removed for undo() correctness, the same pattern every Remove*
// command in this directory already follows.
//
// THE ONE REAL COUNTERPART: application/world/WorldNavigationSession.js#
// undecorateNearestAnimalDecorationHere() is the only real caller, and
// it does more than just run this command — after this command commits,
// it hands the removed animal BACK to application/world/AnimalRuntimeInstances.js
// as a live, session-local, catchable AnimalPresence again (a fresh id —
// see that method's own header for why). This command itself has no
// opinion about that; it only ever removes World content, exactly the
// same "decide, never perform a second, unrelated effect" restraint
// CreateWorldAnimalDecorationCommand.js's own header already keeps
// toward AnimalRuntimeInstances#discard().
export class RemoveWorldAnimalDecorationCommand extends Command {
    constructor({ worldId, decorationId, id, timestamp } = {}) {
        super({ id, timestamp });
        this._worldId = worldId;
        this._decorationId = decorationId;
        this._removedDecorationJson = null;
    }

    get worldId() { return this._worldId; }
    get decorationId() { return this._decorationId; }
    get type() { return 'remove-world-animal-decoration'; }

    // context: { world } — the live World this command applies to.
    // Returns the removed AnimalDecoration.
    execute(context) {
        this._assertWorldMatches(context);
        const decoration = context.world.getAnimalDecoration(this._decorationId);
        if (!decoration) {
            throw new Error(
                `RemoveWorldAnimalDecorationCommand: decoration ${this._decorationId} not found`
            );
        }

        this._removedDecorationJson = decoration.toJSON();
        context.world.removeAnimalDecoration(this._decorationId);
        return decoration;
    }

    undo(context) {
        this._assertWorldMatches(context);
        if (!this._removedDecorationJson) {
            throw new Error('RemoveWorldAnimalDecorationCommand: cannot undo before execute() has run');
        }

        const snapshot = this._removedDecorationJson;
        const restoredDecoration = AnimalDecoration.fromJSON(snapshot);
        context.world.addAnimalDecoration(restoredDecoration);
    }

    canUndo() {
        return this._removedDecorationJson !== null;
    }

    describe() {
        return `Remove Animal Decoration "${this._decorationId}"`;
    }

    toJSON() {
        return {
            type: this.type,
            id: this._id,
            timestamp: this._timestamp.toISOString(),
            worldId: this._worldId,
            decorationId: this._decorationId,
            removedDecorationJson: this._removedDecorationJson
        };
    }

    static fromJSON(json) {
        const cmd = new RemoveWorldAnimalDecorationCommand({
            worldId: json.worldId,
            decorationId: json.decorationId,
            id: json.id,
            timestamp: new Date(json.timestamp)
        });
        cmd._removedDecorationJson = json.removedDecorationJson || null;
        return cmd;
    }

    _assertWorldMatches(context) {
        if (context.world.id !== this._worldId) {
            throw new Error(
                `RemoveWorldAnimalDecorationCommand: worldId mismatch (command targets ${this._worldId}, context has ${context.world.id})`
            );
        }
    }
}
