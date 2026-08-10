import { SpatialEditingContext } from './spatial-state/SpatialEditingContext.js';
import { Position } from '../core/Position.js';
import { MoveBrickCommand } from './commands/MoveBrickCommand.js';
import { RotateBrickCommand } from './commands/RotateBrickCommand.js';
import { DeleteBrickCommand } from './commands/DeleteBrickCommand.js';
import { CompositeCommand } from './commands/CompositeCommand.js';
import { TransformSelectionCommand } from './commands/TransformSelectionCommand.js';
import { SelectionBoundsService } from './SelectionBoundsService.js';
import { TransformGizmoState } from './spatial-state/TransformGizmoState.js';

// Translates spatial editing intent into domain mutations via CommandHistory.
// The UI calls this; it never touches Brick directly.
export class SpatialEditingService {
    constructor(session, commandHistories, brickRegistry = null) {
        this._session = session;
        this._commandHistories = commandHistories;
        this._boundsService = new SelectionBoundsService(brickRegistry);
        this._gizmoState = TransformGizmoState.idle();
    }

    get transformGizmoState() { return this._gizmoState; }

    getSelectionBounds(selection) {
        const document = selection ? this._session.getDocument(selection.documentId) : null;
        return this._boundsService.calculate(selection, document);
    }

    getGroupPivot(selection) {
        const bounds = this.getSelectionBounds(selection);
        return bounds ? { ...bounds.center } : null;
    }

    getEditingContext(selection) {
        if (!selection || selection.isEmpty) {
            return SpatialEditingContext.empty();
        }

        const document = this._session.getDocument(selection.documentId);
        if (!document) {
            return SpatialEditingContext.empty();
        }

        if (selection.type === 'brick' || selection.type === 'bricks') {
            return new SpatialEditingContext({
                type: selection.isSingle ? 'brick' : 'bricks',
                documentId: selection.documentId,
                buildingId: selection.buildingId,
                brickId: selection.brickId,
                items: selection.items,
                capabilities: { move: true, rotate: true, delete: true }
            });
        }

        if (selection.type === 'ground') {
            return new SpatialEditingContext({
                type: 'ground',
                documentId: selection.documentId,
                capabilities: { place: true }
            });
        }

        return SpatialEditingContext.empty();
    }

    moveBrick(documentId, buildingId, brickId, delta) {
        const document = this._session.getDocument(documentId);
        if (!document) {
            return false;
        }

        const world = document.world;
        const history = this._commandHistories.get(world.id);
        if (!history) {
            return false;
        }

        const building = world.getBuilding(buildingId);
        const brick = building ? building.findBrick(brickId) : null;
        if (!brick) {
            return false;
        }

        const command = new MoveBrickCommand({
            worldId: world.id,
            buildingId,
            brickId,
            delta
        });
        history.execute(command);
        return true;
    }

    rotateBrick(documentId, buildingId, brickId, deltaRotation) {
        const document = this._session.getDocument(documentId);
        if (!document) {
            return false;
        }

        const world = document.world;
        const history = this._commandHistories.get(world.id);
        if (!history) {
            return false;
        }

        const building = world.getBuilding(buildingId);
        const brick = building ? building.findBrick(brickId) : null;
        if (!brick) {
            return false;
        }

        const command = new RotateBrickCommand({
            worldId: world.id,
            buildingId,
            brickId,
            deltaRotation
        });
        history.execute(command);
        return true;
    }

    deleteBrick(documentId, buildingId, brickId) {
        const document = this._session.getDocument(documentId);
        if (!document) {
            return false;
        }

        const world = document.world;
        const history = this._commandHistories.get(world.id);
        if (!history) {
            return false;
        }

        const command = new DeleteBrickCommand({
            worldId: world.id,
            buildingId,
            brickId
        });
        history.execute(command);
        return true;
    }

    moveSelection(selection, delta) {
        return this._executeForSelection(selection, (world, item) => new MoveBrickCommand({
            worldId: world.id, buildingId: item.buildingId, brickId: item.brickId, delta
        }), `Move ${selection.items.length} Bricks`);
    }

    rotateSelection(selection, deltaRotation) {
        return this._executeForSelection(selection, (world, item) => new RotateBrickCommand({
            worldId: world.id, buildingId: item.buildingId, brickId: item.brickId, deltaRotation
        }), `Rotate ${selection.items.length} Bricks`);
    }

    deleteSelection(selection) {
        return this._executeForSelection(selection, (world, item) => new DeleteBrickCommand({
            worldId: world.id, buildingId: item.buildingId, brickId: item.brickId
        }), `Delete ${selection.items.length} Bricks`);
    }

    beginTransformGesture(selection, { mode, axis = null } = {}) {
        if (!selection || selection.isEmpty || selection.type === 'ground') return null;
        const document = this._session.getDocument(selection.documentId);
        if (!document) return null;
        const bounds = this._boundsService.calculate(selection, document);
        if (!bounds) return null;
        const initialTransforms = this._captureTransforms(document.world, selection.items);
        if (!initialTransforms) return null;
        this._gizmoState = TransformGizmoState.active({
            mode,
            axis,
            pivot: bounds.center,
            selectionBounds: bounds,
            initialTransforms
        });
        return this._gizmoState;
    }

    previewTransformGesture(selection, transform) {
        if (!this._gizmoState.active || !selection) return false;
        const document = this._session.getDocument(selection.documentId);
        if (!document) return false;
        const nextTransforms = this._calculatePreviewTransforms(this._gizmoState.initialTransforms, this._gizmoState.pivot, transform);
        this._applyTransforms(document.world, nextTransforms);
        return true;
    }

    commitTransformGesture(selection, transform) {
        if (!this._gizmoState.active || !selection) return false;
        const document = this._session.getDocument(selection.documentId);
        if (!document) return false;
        const world = document.world;
        const history = this._commandHistories.get(world.id);
        if (!history) return false;
        const before = this._gizmoState.initialTransforms;
        const after = this._calculatePreviewTransforms(before, this._gizmoState.pivot, transform);
        this._applyTransforms(world, before);
        this._gizmoState = TransformGizmoState.idle({
            selectionBounds: this._boundsService.calculate(selection, document),
            pivot: this.getGroupPivot(selection)
        });
        if (this._transformsEqual(before, after)) return false;
        history.execute(new TransformSelectionCommand({
            worldId: world.id,
            transforms: after,
            description: `${transform.rotation !== undefined ? 'Rotate' : 'Move'} ${after.length} ${after.length === 1 ? 'Brick' : 'Bricks'}`
        }));
        return true;
    }

    cancelTransformGesture(selection) {
        if (!this._gizmoState.active) return false;
        const document = selection ? this._session.getDocument(selection.documentId) : null;
        if (document) this._applyTransforms(document.world, this._gizmoState.initialTransforms);
        this._gizmoState = TransformGizmoState.idle();
        return true;
    }

    _captureTransforms(world, items) {
        const transforms = [];
        for (const item of items) {
            const building = world.getBuilding(item.buildingId);
            const brick = building ? building.findBrick(item.brickId) : null;
            if (!brick) return null;
            transforms.push({
                buildingId: item.buildingId,
                brickId: item.brickId,
                position: brick.position.toJSON(),
                rotation: brick.rotation
            });
        }
        return transforms;
    }

    _calculatePreviewTransforms(initialTransforms, pivot, { translation = null, rotation = undefined } = {}) {
        const radians = ((rotation || 0) * Math.PI) / 180;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        return initialTransforms.map((transform) => {
            let x = transform.position.x;
            let y = transform.position.y;
            let z = transform.position.z;
            if (rotation !== undefined) {
                const dx = x - pivot.x;
                const dz = z - pivot.z;
                x = pivot.x + (cos * dx) - (sin * dz);
                z = pivot.z + (sin * dx) + (cos * dz);
            }
            if (translation) {
                x += translation.x || 0;
                y += translation.y || 0;
                z += translation.z || 0;
            }
            return { ...transform, position: { x, y, z }, rotation: transform.rotation + (rotation || 0) };
        });
    }

    _applyTransforms(world, transforms) {
        for (const transform of transforms) {
            world.updateBrick(transform.buildingId, transform.brickId, {
                position: Position.fromJSON(transform.position),
                rotation: transform.rotation
            });
        }
    }

    _transformsEqual(a, b) {
        return JSON.stringify(a) === JSON.stringify(b);
    }

    _executeForSelection(selection, createCommand, description) {
        if (!selection || selection.isEmpty || selection.type === 'ground') return false;
        const document = this._session.getDocument(selection.documentId);
        if (!document) return false;
        const world = document.world;
        const history = this._commandHistories.get(world.id);
        if (!history) return false;
        const commands = [];
        for (const item of selection.items) {
            const building = world.getBuilding(item.buildingId);
            if (!building || !building.findBrick(item.brickId)) return false;
            commands.push(createCommand(world, item));
        }
        if (commands.length === 0) return false;
        const command = commands.length === 1 ? commands[0] : commands.reduce((composite, child) => composite.add(child), new CompositeCommand({ description }));
        history.execute(command);
        return true;
    }

}
