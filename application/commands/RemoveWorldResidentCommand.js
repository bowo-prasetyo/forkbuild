import { WorldResident } from '../../core/WorldResident.js';
import { Command } from './Command.js';
import { message } from '../../core/Message.js';

// World Residents: removes a resident from its World. Undo restores the
// exact resident (same id, same home), so it walks exactly as it did.
export class RemoveWorldResidentCommand extends Command {
    constructor({ worldId, residentId, id, timestamp } = {}) {
        super({ id, timestamp });
        this._worldId = worldId;
        this._residentId = residentId;
        this._removedResidentJson = null;
    }

    get worldId() { return this._worldId; }
    get residentId() { return this._residentId; }
    get type() { return 'remove-world-resident'; }

    execute(context) {
        this._assertWorldMatches(context);
        const resident = context.world.getResident(this._residentId);
        if (!resident) {
            throw new Error(`RemoveWorldResidentCommand: resident ${this._residentId} not found`);
        }
        this._removedResidentJson = resident.toJSON();
        context.world.removeResident(this._residentId);
        return resident;
    }

    undo(context) {
        this._assertWorldMatches(context);
        if (!this._removedResidentJson) {
            throw new Error('RemoveWorldResidentCommand: cannot undo before execute() has run');
        }
        context.world.addResident(WorldResident.fromJSON(this._removedResidentJson));
    }

    canUndo() {
        return this._removedResidentJson !== null;
    }

    describe() {
        return message('history.removeResident');
    }

    toJSON() {
        return {
            type: this.type,
            id: this._id,
            timestamp: this._timestamp.toISOString(),
            worldId: this._worldId,
            residentId: this._residentId,
            removedResidentJson: this._removedResidentJson
        };
    }

    static fromJSON(json) {
        const cmd = new RemoveWorldResidentCommand({
            worldId: json.worldId,
            residentId: json.residentId,
            id: json.id,
            timestamp: new Date(json.timestamp)
        });
        cmd._removedResidentJson = json.removedResidentJson || null;
        return cmd;
    }

    _assertWorldMatches(context) {
        if (context.world.id !== this._worldId) {
            throw new Error(
                `RemoveWorldResidentCommand: worldId mismatch (command targets ${this._worldId}, context has ${context.world.id})`
            );
        }
    }
}
