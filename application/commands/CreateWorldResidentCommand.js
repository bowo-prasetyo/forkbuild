import { WorldResident } from '../../core/WorldResident.js';
import { Position } from '../../core/Position.js';
import { createSecureId } from '../../core/createId.js';
import { Command } from './Command.js';
import { message } from '../../core/Message.js';

// World Residents: adds an ambient resident whose home is `position`
// (World-local). The resident counterpart of
// CreateWorldAnimalDecorationCommand.js: execute() mints the resident's id,
// and redo() recreates the SAME id, which toJSON() carries, so replay and
// redo keep naming the same resident — and, since where a resident walks is
// hashed from its id (core/ResidentMotion.js), keep it walking the same way.
export class CreateWorldResidentCommand extends Command {
    // `residentId` (optional) is the id the new resident gets; left out, one
    // is minted. The World View picks one so the resident starts out right
    // where it was added (see residentMethods.js#addResidentHere()).
    constructor({ worldId, authorIdentityId, position, residentId = null, id, timestamp } = {}) {
        super({ id, timestamp });
        this._worldId = worldId;
        this._authorIdentityId = authorIdentityId;
        this._position = position;
        this._executedResidentId = residentId;
        this._executed = false;
    }

    get worldId() { return this._worldId; }
    get authorIdentityId() { return this._authorIdentityId; }
    get position() { return this._position; }
    get type() { return 'create-world-resident'; }
    // The id of the resident this command creates (or created); null until
    // execute() when none was given.
    get executedResidentId() { return this._executedResidentId; }

    // context: { world } — the live World this command applies to.
    execute(context) {
        this._assertWorldMatches(context);
        const resident = new WorldResident({
            id: this._executedResidentId || createSecureId(),
            worldId: this._worldId,
            authorIdentityId: this._authorIdentityId,
            position: this._position
        });
        context.world.addResident(resident);
        this._executedResidentId = resident.id;
        this._executed = true;
        return resident;
    }

    undo(context) {
        this._assertWorldMatches(context);
        if (!this._executed) {
            throw new Error('CreateWorldResidentCommand: cannot undo before execute() has run');
        }
        context.world.removeResident(this._executedResidentId);
    }

    canUndo() {
        return this._executed;
    }

    describe() {
        return message('history.addResident');
    }

    toJSON() {
        return {
            type: this.type,
            id: this._id,
            timestamp: this._timestamp.toISOString(),
            worldId: this._worldId,
            authorIdentityId: this._authorIdentityId,
            position: this._position.toJSON(),
            executedResidentId: this._executedResidentId
        };
    }

    static fromJSON(json) {
        const cmd = new CreateWorldResidentCommand({
            worldId: json.worldId,
            authorIdentityId: json.authorIdentityId,
            position: Position.fromJSON(json.position),
            id: json.id,
            timestamp: new Date(json.timestamp)
        });
        cmd._executedResidentId = json.executedResidentId || null;
        cmd._executed = Boolean(json.executedResidentId);
        return cmd;
    }

    _assertWorldMatches(context) {
        if (context.world.id !== this._worldId) {
            throw new Error(
                `CreateWorldResidentCommand: worldId mismatch (command targets ${this._worldId}, context has ${context.world.id})`
            );
        }
    }
}
