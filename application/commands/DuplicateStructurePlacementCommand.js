import { StructurePlacement } from '../../core/StructurePlacement.js';
import { Position } from '../../core/Position.js';
import { Command } from './Command.js';

// 0.2.91 — World Instance Editing & Placement Management. "Duplicate"
// for a StructurePlacement creates a new StructurePlacement referencing
// the exact SAME documentId — never a new Document, never a fork. This
// is the one distinction the design conversation asked to be explicitly
// tested: House A duplicated into House C keeps
// documentId(A) === documentId(C) while placementId(A) !== placementId(C)
// — content identity and spatial instance identity are different
// questions, and duplicating only ever answers the second one. Compare
// application/ForkStructureUseCase.js, which is the (Editor-only, content-
// level) operation for when a NEW independent Document is actually
// wanted — duplicating an instance is deliberately not that.
//
// Mirrors PlaceStructureCommand's execute()/undo() shape (create-with-
// remembered-id, so redo recreates the identical placement) and
// DuplicateGroupCommand's offset convention (default +2/+0/+2, so the
// duplicate is visibly distinct from its source rather than sitting
// exactly on top of it). Rotation is copied unchanged — duplicating
// preserves orientation; the user rotates the copy afterward if they
// want it different, exactly like DuplicateGroupCommand copies each
// brick's rotation unchanged.
export class DuplicateStructurePlacementCommand extends Command {
    constructor({ worldId, placementId, offset = { x: 2, y: 0, z: 2 }, id, timestamp } = {}) {
        super({ id, timestamp });
        this._worldId = worldId;
        this._placementId = placementId;
        this._offset = { ...offset };
        this._executedPlacementId = null;
        // Snapshot of the SOURCE placement's documentId/rotation at the
        // moment execute() first ran — needed so undo()/redo() (and a
        // replayed command on another client) can recreate the
        // duplicate without re-reading the source placement, which may
        // itself have moved or been deleted by then.
        this._sourceDocumentId = null;
        this._sourceRotation = null;
        this._sourcePosition = null;
    }

    get worldId() { return this._worldId; }
    get placementId() { return this._placementId; }
    get offset() { return { ...this._offset }; }
    get executedPlacementId() { return this._executedPlacementId; }
    get type() { return 'duplicate-structure-placement'; }

    execute(context) {
        this._assertWorldMatches(context);
        if (this._sourceDocumentId === null) {
            const source = context.world.getStructurePlacement(this._placementId);
            if (!source) {
                throw new Error(`DuplicateStructurePlacementCommand: placement ${this._placementId} not found`);
            }
            this._sourceDocumentId = source.documentId;
            this._sourceRotation = source.rotation;
            this._sourcePosition = source.position;
        }

        const placement = new StructurePlacement({
            id: this._executedPlacementId || undefined,
            documentId: this._sourceDocumentId,
            position: new Position(
                this._sourcePosition.x + this._offset.x,
                this._sourcePosition.y + this._offset.y,
                this._sourcePosition.z + this._offset.z
            ),
            rotation: this._sourceRotation
        });
        context.world.addStructurePlacement(placement);
        this._executedPlacementId = placement.id;
        return placement;
    }

    undo(context) {
        this._assertWorldMatches(context);
        if (!this._executedPlacementId) {
            throw new Error('DuplicateStructurePlacementCommand: cannot undo before execute() has run');
        }
        context.world.removeStructurePlacement(this._executedPlacementId);
    }

    canUndo() {
        return this._executedPlacementId !== null;
    }

    describe() {
        return 'Duplicate Structure Placement';
    }

    toJSON() {
        return {
            type: this.type,
            id: this._id,
            timestamp: this._timestamp.toISOString(),
            worldId: this._worldId,
            placementId: this._placementId,
            offset: { ...this._offset },
            executedPlacementId: this._executedPlacementId,
            sourceDocumentId: this._sourceDocumentId,
            sourceRotation: this._sourceRotation,
            sourcePosition: this._sourcePosition ? this._sourcePosition.toJSON() : null
        };
    }

    static fromJSON(json) {
        const cmd = new DuplicateStructurePlacementCommand({
            worldId: json.worldId,
            placementId: json.placementId,
            offset: json.offset || { x: 2, y: 0, z: 2 },
            id: json.id,
            timestamp: new Date(json.timestamp)
        });
        cmd._executedPlacementId = json.executedPlacementId || null;
        cmd._sourceDocumentId = json.sourceDocumentId || null;
        cmd._sourceRotation = json.sourceRotation !== undefined ? json.sourceRotation : null;
        cmd._sourcePosition = json.sourcePosition ? Position.fromJSON(json.sourcePosition) : null;
        return cmd;
    }

    _assertWorldMatches(context) {
        if (context.world.id !== this._worldId) {
            throw new Error(
                `DuplicateStructurePlacementCommand: worldId mismatch (command targets ${this._worldId}, context has ${context.world.id})`
            );
        }
    }
}
