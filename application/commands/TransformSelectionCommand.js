import { Command } from './Command.js';
import { Position } from '../../core/Position.js';

// Applies absolute post-gesture transforms for a selection as one atomic
// history entry. Unlike incremental move/rotate commands, this preserves
// exact pre/post transforms for group-pivot operations and command replay.
export class TransformSelectionCommand extends Command {
    constructor({ worldId, transforms = [], description = 'Transform Selection', id, timestamp } = {}) {
        super({ id, timestamp });
        this._worldId = worldId;
        this._transforms = transforms.map(TransformSelectionCommand._cloneTransform);
        this._description = description;
        this._before = null;
    }

    get type() { return 'transform-selection'; }
    get worldId() { return this._worldId; }
    get transforms() { return this._transforms.map(TransformSelectionCommand._cloneTransform); }

    execute(context) {
        this._assertWorldMatches(context);
        this._before = this._transforms.map((transform) => {
            const brick = this._findBrick(context, transform);
            return { buildingId: transform.buildingId, brickId: transform.brickId, position: brick.position.clone(), rotation: brick.rotation };
        });
        for (const transform of this._transforms) {
            context.world.updateBrick(transform.buildingId, transform.brickId, {
                position: Position.fromJSON(transform.position),
                rotation: transform.rotation
            });
        }
    }

    undo(context) {
        this._assertWorldMatches(context);
        if (!this._before) throw new Error('TransformSelectionCommand: cannot undo before execute() has run');
        for (const transform of this._before) {
            context.world.updateBrick(transform.buildingId, transform.brickId, {
                position: transform.position.clone(),
                rotation: transform.rotation
            });
        }
    }

    canUndo() { return this._before !== null; }
    describe() { return this._description; }

    toJSON() {
        return {
            type: this.type,
            id: this._id,
            timestamp: this._timestamp.toISOString(),
            worldId: this._worldId,
            description: this._description,
            transforms: this._transforms,
            before: this._before ? this._before.map(TransformSelectionCommand._cloneTransform) : null
        };
    }

    static fromJSON(json) {
        const cmd = new TransformSelectionCommand({
            worldId: json.worldId,
            transforms: json.transforms || [],
            description: json.description || 'Transform Selection',
            id: json.id,
            timestamp: new Date(json.timestamp)
        });
        cmd._before = json.before ? json.before.map((transform) => ({
            ...transform,
            position: Position.fromJSON(transform.position)
        })) : null;
        return cmd;
    }

    _findBrick(context, transform) {
        const building = context.world.getBuilding(transform.buildingId);
        const brick = building ? building.findBrick(transform.brickId) : null;
        if (!brick) throw new Error(`TransformSelectionCommand: brick ${transform.brickId} not found in building ${transform.buildingId}`);
        return brick;
    }

    _assertWorldMatches(context) {
        if (context.world.id !== this._worldId) throw new Error(`TransformSelectionCommand: worldId mismatch (command targets ${this._worldId}, context has ${context.world.id})`);
    }

    static _cloneTransform(transform) {
        let pos = transform.position;
        if (pos && typeof pos.toJSON === 'function') {
            pos = pos.toJSON();
        } else if (pos) {
            pos = { x: pos.x, y: pos.y, z: pos.z };
        }
        return { ...transform, position: pos };
    }
}
