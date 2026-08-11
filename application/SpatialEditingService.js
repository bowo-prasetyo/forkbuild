import { SpatialEditingContext } from './spatial-state/SpatialEditingContext.js';
import { Position } from '../core/Position.js';
import { DeleteBrickCommand } from './commands/DeleteBrickCommand.js';
import { CompositeCommand } from './commands/CompositeCommand.js';
import { SelectionBoundsService } from './SelectionBoundsService.js';
import { TransformGizmoState } from './spatial-state/TransformGizmoState.js';
import { TransformSelectionUseCase } from './TransformSelectionUseCase.js';
import { calculateTransforms } from './TransformMath.js';
import { SpatialSelectionState } from './spatial-state/SpatialSelectionState.js';

// Translates spatial editing intent into domain mutations via CommandHistory.
// The UI calls this; it never touches Brick directly.
//
// As of 0.1.44 every TRANSFORM routes through one path:
// TransformSelectionUseCase -> exactly one TransformSelectionCommand,
// whether the selection is a single brick, a multi-selection, or a
// resolved group. moveSelection/rotateSelection (keyboard), single-brick
// moveBrick/rotateBrick, and gizmo commit all produce the same command
// type with the same pivot semantics — rotation orbits the selection
// bounds center; for a single brick that's its own center, identical to
// the pre-0.1.44 per-brick behavior. Deletion is not a transform:
// deleteSelection/deleteBrick stay composites of DeleteBrickCommand.
//
// The gizmo's live preview still mutates the world directly (no command)
// between begin/commit, exactly as since 0.1.38 — but commit now
// restores the pre-gesture state and commits through the SAME use case
// every other transform uses, so no-op suppression and command shape
// can never drift between paths.
export class SpatialEditingService {
    constructor(session, commandHistories, brickRegistry = null) {
        this._session = session;
        this._commandHistories = commandHistories;
        this._boundsService = new SelectionBoundsService(brickRegistry);
        this._transformSelectionUseCase = new TransformSelectionUseCase(brickRegistry);
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

    // -----------------------------------------------------------------
    // Transforms — all through TransformSelectionUseCase (0.1.44)
    // -----------------------------------------------------------------

    moveBrick(documentId, buildingId, brickId, delta) {
        const selection = SpatialSelectionState.brick({ documentId, buildingId, brickId });
        return this._transformForSelection(selection, { translation: delta }, 'Move Brick');
    }

    rotateBrick(documentId, buildingId, brickId, deltaRotation) {
        const selection = SpatialSelectionState.brick({ documentId, buildingId, brickId });
        return this._transformForSelection(selection, { rotation: deltaRotation }, 'Rotate Brick');
    }

    moveSelection(selection, delta) {
        return this._transformForSelection(selection, { translation: delta }, 'Move');
    }

    rotateSelection(selection, deltaRotation) {
        return this._transformForSelection(selection, { rotation: deltaRotation }, 'Rotate');
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

    deleteSelection(selection) {
        return this._executeForSelection(selection, (world, item) => new DeleteBrickCommand({
            worldId: world.id, buildingId: item.buildingId, brickId: item.brickId
        }), `Delete ${selection.items.length} Bricks`);
    }

    // -----------------------------------------------------------------
    // Transform gizmo gesture lifecycle (0.1.38, unified in 0.1.44)
    // -----------------------------------------------------------------

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
        const nextTransforms = calculateTransforms(this._gizmoState.initialTransforms, this._gizmoState.pivot, transform);
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
        const after = calculateTransforms(before, this._gizmoState.pivot, transform);
        // Restore the pre-gesture state first, then commit through the
        // unified path — the gesture produces the exact same single
        // TransformSelectionCommand every other transform produces.
        this._applyTransforms(world, before);
        this._gizmoState = TransformGizmoState.idle({
            selectionBounds: this._boundsService.calculate(selection, document),
            pivot: this.getGroupPivot(selection)
        });
        if (transformsEqualLocal(before, after)) return false;
        const count = selection.items.length;
        const command = this._transformSelectionUseCase.execute(
            history,
            document,
            selection,
            transform,
            `${transform.rotation !== undefined ? 'Rotate' : 'Move'} ${count} ${count === 1 ? 'Brick' : 'Bricks'}`
        );
        return command !== null;
    }

    cancelTransformGesture(selection) {
        if (!this._gizmoState.active) return false;
        const document = selection ? this._session.getDocument(selection.documentId) : null;
        if (document) this._applyTransforms(document.world, this._gizmoState.initialTransforms);
        this._gizmoState = TransformGizmoState.idle();
        return true;
    }

    // -----------------------------------------------------------------
    // Internal
    // -----------------------------------------------------------------

    _transformForSelection(selection, transform, verb) {
        if (!selection || selection.isEmpty || selection.type === 'ground') {
            return false;
        }
        const document = this._session.getDocument(selection.documentId);
        if (!document) {
            return false;
        }
        const history = this._commandHistories.get(document.world.id);
        if (!history) {
            return false;
        }
        const count = selection.items.length;
        const description = verb.includes('Brick')
            ? verb
            : `${verb} ${count} ${count === 1 ? 'Brick' : 'Bricks'}`;
        const command = this._transformSelectionUseCase.execute(history, document, selection, transform, description);
        return command !== null;
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

    _applyTransforms(world, transforms) {
        for (const transform of transforms) {
            world.updateBrick(transform.buildingId, transform.brickId, {
                position: Position.fromJSON(transform.position),
                rotation: transform.rotation
            });
        }
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

// Local alias so the gesture commit reads exactly like the shared math.
import { transformsEqual as transformsEqualLocal } from './TransformMath.js';
