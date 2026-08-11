import { SpatialEditingContext } from './spatial-state/SpatialEditingContext.js';
import { Position } from '../core/Position.js';
import { MoveBrickCommand } from './commands/MoveBrickCommand.js';
import { RotateBrickCommand } from './commands/RotateBrickCommand.js';
import { DeleteBrickCommand } from './commands/DeleteBrickCommand.js';
import { CompositeCommand } from './commands/CompositeCommand.js';
import { TransformSelectionCommand } from './commands/TransformSelectionCommand.js';
import { SelectionBoundsService } from './SelectionBoundsService.js';
import { TransformGizmoState } from './spatial-state/TransformGizmoState.js';
import { TransformMath } from './TransformMath.js';
import { TransformSnap } from './TransformSnap.js';
import { TransformSettings } from './TransformSettings.js';

// Translates spatial editing intent into domain mutations via CommandHistory.
// The UI calls this; it never touches Brick directly.
//
// Since 0.1.38 this class is the gesture transaction every transform
// gesture runs through: beginTransformGesture / previewTransformGesture /
// commitTransformGesture / cancelTransformGesture. Since 0.1.46 the
// interactive pointer gizmo drives it alongside the keyboard paths.
//
// As of 0.1.47 this transaction is also the single home of transform
// SNAPPING:
//
//   raw gesture (keyboard nudge or pointer drag)
//       -> axis constraint (already resolved by the caller)
//       -> TransformSnap (delta snapping, precision mode)
//       -> TransformMath.calculateTransforms
//       -> exactly ONE TransformSelectionCommand on commit
//
// Snapping lives here — not in the gizmo controller, not in the views —
// because this is the one place every transform input converges. The
// controller reports raw gesture values and forwards modifier state;
// this service decides how the gesture is interpreted, using
// TransformSettings (session preferences, never document state).
// Keyboard selection transforms (moveSelection/rotateSelection) are now
// routed through the very same transaction as instantaneous gestures,
// so a keyboard nudge and an equivalently-snapped gizmo drag produce
// byte-identical TransformSelectionCommand payloads.
export class SpatialEditingService {
    constructor(session, commandHistories, brickRegistry = null, transformSettings = new TransformSettings()) {
        this._session = session;
        this._commandHistories = commandHistories;
        this._boundsService = new SelectionBoundsService(brickRegistry);
        this._transformSettings = transformSettings;
        this._gizmoState = TransformGizmoState.idle();
        this._gestureFeedback = null;
    }

    get transformGizmoState() { return this._gizmoState; }

    get transformSettings() { return this._transformSettings; }

    // Transient feedback about the gesture frame that was just applied:
    // the SNAPPED transform plus the effective snap increments and the
    // precision flag. Read by the gizmo controller after preview/commit
    // and passed up to the views' transient overlay. Session state only —
    // never serialized, never part of any command. Null while idle.
    getGestureFeedback() { return this._gestureFeedback; }

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

    // Keyboard selection translation, routed through the gesture
    // transaction as an instantaneous gesture (begin + commit, no
    // preview). Snapping, precision handling, no-op detection, pivot
    // semantics, and the emitted command type are therefore IDENTICAL to
    // an equivalently-snapped gizmo drag — that parity is the flagship
    // acceptance criterion of 0.1.47. gestureOptions: { modifiers }.
    moveSelection(selection, delta, gestureOptions = {}) {
        if (!selection || selection.isEmpty || selection.type === 'ground') {
            return false;
        }
        if (!this.beginTransformGesture(selection, { mode: 'translate', axis: null })) {
            return false;
        }
        return this.commitTransformGesture(selection, { translation: delta }, gestureOptions);
    }

    // Keyboard selection rotation around the selection pivot — same
    // instantaneous-gesture routing, same snapping, same 0.1.44 pivot
    // semantics as the gizmo's rotation ring.
    rotateSelection(selection, deltaRotation, gestureOptions = {}) {
        if (!selection || selection.isEmpty || selection.type === 'ground') {
            return false;
        }
        if (!this.beginTransformGesture(selection, { mode: 'rotate', axis: 'y' })) {
            return false;
        }
        return this.commitTransformGesture(selection, { rotation: deltaRotation }, gestureOptions);
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
        this._gestureFeedback = null;
        return this._gizmoState;
    }

    // gestureOptions: { modifiers } — modifiers.shift selects precision
    // increments for this frame. The raw transform arrives from the
    // caller (controller or keyboard); snapping is applied here, once,
    // against the gesture origin, before anything touches the World.
    previewTransformGesture(selection, transform, gestureOptions = {}) {
        if (!this._gizmoState.active || !selection) return false;
        const document = this._session.getDocument(selection.documentId);
        if (!document) return false;
        const applied = this._snapGestureTransform(transform, gestureOptions);
        const nextTransforms = this._calculatePreviewTransforms(this._gizmoState.initialTransforms, this._gizmoState.pivot, applied.transform);
        this._applyTransforms(document.world, nextTransforms);
        this._gestureFeedback = applied.feedback;
        return true;
    }

    commitTransformGesture(selection, transform, gestureOptions = {}) {
        if (!this._gizmoState.active || !selection) return false;
        const document = this._session.getDocument(selection.documentId);
        if (!document) return false;
        const world = document.world;
        const history = this._commandHistories.get(world.id);
        if (!history) return false;
        const applied = this._snapGestureTransform(transform, gestureOptions);
        const before = this._gizmoState.initialTransforms;
        const after = this._calculatePreviewTransforms(before, this._gizmoState.pivot, applied.transform);
        this._applyTransforms(world, before);
        this._gizmoState = TransformGizmoState.idle({
            selectionBounds: this._boundsService.calculate(selection, document),
            pivot: this.getGroupPivot(selection)
        });
        this._gestureFeedback = null;
        if (this._transformsEqual(before, after)) return false;
        history.execute(new TransformSelectionCommand({
            worldId: world.id,
            transforms: after,
            description: `${applied.transform.rotation !== undefined ? 'Rotate' : 'Move'} ${after.length} ${after.length === 1 ? 'Brick' : 'Bricks'}`
        }));
        return true;
    }

    cancelTransformGesture(selection) {
        if (!this._gizmoState.active) return false;
        const document = selection ? this._session.getDocument(selection.documentId) : null;
        if (document) this._applyTransforms(document.world, this._gizmoState.initialTransforms);
        this._gizmoState = TransformGizmoState.idle();
        this._gestureFeedback = null;
        return true;
    }

    // ------------------------------------------------------------ snapping

    // The 0.1.47 interpretation step. Pure with respect to the gesture:
    // given the same raw transform, settings, and modifier state, this
    // always returns the same snapped transform and feedback — which is
    // what makes repeated previews stable and pointer motion reversible.
    // With snapping disabled the raw transform passes through untouched.
    _snapGestureTransform(transform, gestureOptions = {}) {
        const settings = this._transformSettings;
        const precise = !!(gestureOptions.modifiers && gestureOptions.modifiers.shift);
        if (!settings.snappingEnabled) {
            return {
                transform,
                feedback: this._buildFeedback(transform, null, null, precise)
            };
        }
        let snapped = transform;
        let translationIncrement = null;
        let rotationIncrement = null;
        if (transform && transform.translation) {
            translationIncrement = settings.translationIncrement(precise);
            snapped = {
                ...snapped,
                translation: TransformSnap.snapTranslation(transform.translation, translationIncrement)
            };
        }
        if (transform && transform.rotation !== undefined) {
            rotationIncrement = settings.rotationIncrement(precise);
            snapped = {
                ...snapped,
                rotation: TransformMath.normalizeDegrees(
                    TransformSnap.snapRotation(transform.rotation, rotationIncrement)
                )
            };
        }
        return {
            transform: snapped,
            feedback: this._buildFeedback(snapped, translationIncrement, rotationIncrement, precise)
        };
    }

    _buildFeedback(transform, translationIncrement, rotationIncrement, precise) {
        if (!transform) {
            return null;
        }
        return {
            mode: transform.rotation !== undefined ? 'rotate' : 'translate',
            axis: this._gizmoState.axis,
            translation: transform.translation ? { ...transform.translation } : null,
            rotation: transform.rotation !== undefined ? transform.rotation : null,
            translationSnap: translationIncrement,
            rotationSnap: rotationIncrement,
            precise
        };
    }

    // ----------------------------------------------------------- internal

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

    // Delegates to TransformMath — the single math definition shared by
    // keyboard transforms, the gizmo's live drag preview, and the
    // committed command. Snapping wraps this; it never replaces it.
    _calculatePreviewTransforms(initialTransforms, pivot, gesture) {
        return TransformMath.calculateTransforms(initialTransforms, pivot, gesture);
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
        return TransformMath.transformsEqual(a, b);
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
