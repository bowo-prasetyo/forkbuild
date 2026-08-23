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
import { TransformAlignment } from './TransformAlignment.js';
import { SelectionTransformValidator } from '../core/SelectionTransformValidator.js';
import { SnapMath } from '../core/SnapMath.js';

// Translates spatial editing intent into domain mutations via CommandHistory.
// The UI calls this; it never touches Brick directly.
//
// Since 0.1.38 this class is the gesture transaction every transform
// gesture runs through: beginTransformGesture / previewTransformGesture /
// commitTransformGesture / cancelTransformGesture. Since 0.1.46 the
// interactive pointer gizmo drives it alongside the keyboard paths, and
// since 0.1.47 snapping is applied inside the transaction so keyboard
// and pointer stay byte-identical.
//
// As of 0.1.48 this transaction is also the home of ALIGNMENT and
// DISTRIBUTION (alignSelection/distributeSelection): transform-generation
// algorithms that compute exact absolute targets and submit them through
// the SAME TransformSelectionCommand, bypassing gesture snapping because
// they produce geometric relationships, not user-authored deltas.
//
// As of 0.1.49 this transaction is also the home of NUMERIC TRANSFORM
// INPUT (applyNumericTransform): exact user-entered translation/rotation
// intent, translated into the same gesture-shaped transform every other
// input produces and committed with snapping disabled. Five fundamentally
// different input sources — keyboard, gizmo, alignment, distribution,
// numeric — now all terminate in one command type:
//
//   keyboard ──┐
//   gizmo ─────┤
//   alignment ─┼──► TransformSelectionCommand
//   distribute ┤
//   numeric ───┘
//
// Snapping policy, stated once for the whole class:
//   keyboard/gizmo          → snapping applies (0.1.47)
//   numeric input           → exact requested value, never snapped
//   alignment/distribution  → exact geometric result, never snapped
// Snapping interprets imprecise gestures; explicit intent is respected
// literally. No-op operations (already at target, zero delta, empty
// input) create zero history entries — the transformsEqual discipline,
// unchanged since 0.1.38.
//
// 0.4.8 — Collision-Aware Multi-Brick Transform. previewTransformGesture
// and commitTransformGesture are now the ONE chokepoint (named as
// exactly that, and deliberately left alone, by 0.4.7's own "Deliberately
// excluded" section) that also decides whether a transform is legal:
// every preview frame stamps its gesture feedback with `valid` — whether
// the candidate positions collide with any brick outside the moving
// selection, per core/SelectionTransformValidator.js — and commit
// refuses to turn an invalid candidate into a TransformSelectionCommand,
// reverting to the pre-gesture positions instead. This is the SAME
// "release over an invalid position cancels the whole gesture" posture
// application/StructurePlacementGestureService.js already established
// for structure placements; brick selections get it here for the first
// time. Keyboard nudge, gizmo drag, and numeric input all route through
// commitTransformGesture already, so all three inherit the gate for
// free. Alignment/distribution (_executeLayoutOperation) deliberately do
// NOT — they compute exact geometric relationships between the
// selection's OWN members, not a free-form move into arbitrary space,
// and were out of this milestone's own scope.
//
// 0.4.9 — Alignment, Snapping & Repetition adds ONE new operation here,
// snapSelectionToGrid(): "move this selection's pivot onto the nearest
// world-space grid intersection" (core/SnapMath.js), routed through the
// SAME beginTransformGesture/commitTransformGesture chokepoint with
// snap:false — exact intent, like applyNumericTransform — so it
// inherits 0.4.8's collision gate for free rather than needing a new
// one. Gesture-delta snapping itself (_snapGestureTransform, every
// keyboard/gizmo frame) and alignSelection/distributeSelection both
// already existed before this milestone (0.1.47/0.1.48) and are
// unchanged; repetition (application/RepeatSelectionUseCase.js) is new
// but lives outside this class entirely — it creates bricks, which is
// application/CopySelectionUseCase.js/PasteClipboardUseCase.js territory,
// not a transform of an existing selection.
export class SpatialEditingService {
    // 0.2.95 — World Editing Authorization Foundation. `canEditDocument`
    // is the ONE clean seam docs/Principles.md, "Selection In World
    // View Does Not Imply Editing Authority (0.2.93)" already named as
    // where this question would attach: `(documentId) => boolean`,
    // consulted at every real mutation chokepoint below
    // (beginTransformGesture, _executeLayoutOperation,
    // _executeForSelection, moveBrick/rotateBrick/deleteBrick) — never
    // re-derived per method, and never trusted from a cached selection
    // state, so a caller that bypasses getEditingContext() entirely and
    // invokes a mutation method directly gets the same answer a UI
    // click would have. Defaults to `() => true`, the exact pre-0.2.95
    // "always editable" behavior — every existing positional call site
    // (application/EditorSession.js's own construction, and every test
    // that builds this class with 3 or 4 arguments) is therefore
    // completely unaffected; only a caller that explicitly wires a
    // REAL predicate (application/WorldNavigationSession.js, backed by
    // application/WorldAuthorizationService.js) gets a gate that can
    // ever say no.
    constructor(session, commandHistories, brickRegistry = null, transformSettings = new TransformSettings(), canEditDocument = () => true, collisionValidator = new SelectionTransformValidator()) {
        this._session = session;
        this._commandHistories = commandHistories;
        this._boundsService = new SelectionBoundsService(brickRegistry);
        this._transformSettings = transformSettings;
        this._gizmoState = TransformGizmoState.idle();
        this._gestureFeedback = null;
        this._canEditDocument = typeof canEditDocument === 'function' ? canEditDocument : () => true;
        this._collisionValidator = collisionValidator;
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
        // 0.2.95 — authorization gate. A selection in a document this
        // viewer cannot edit simply looks, from here on, like a
        // selection with nothing to operate on — the exact same
        // load-bearing technique 0.2.93 used for a placement selection's
        // always-empty `items` array (see that milestone's own header):
        // nothing downstream (SelectionBoundsService, TransformGizmoUseCase,
        // WorldNavigationSession's own move/rotate/delete) had to be
        // taught a new "unauthorized" concept, because there is nothing
        // here for it to see.
        if (!this._canEditDocument(selection.documentId)) {
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
        // 0.2.95 — see beginTransformGesture's own comment above.
        if (!this._canEditDocument(documentId)) {
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
        // 0.2.95 — see beginTransformGesture's own comment above.
        if (!this._canEditDocument(documentId)) {
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
        // 0.2.95 — see beginTransformGesture's own comment above.
        if (!this._canEditDocument(documentId)) {
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
    // preview). Snapping, precision handling, pivot semantics, no-op
    // detection, and the emitted command type are therefore IDENTICAL to
    // an equivalently-snapped gizmo drag — the 0.1.47 parity property.
    // gestureOptions: { modifiers }.
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

    // ----------------------------------------- alignment & distribution

    // Aligns the resolved selection along one world axis, referencing
    // the WHOLE selection bounds (never the first brick, so selection
    // order is irrelevant). mode: 'x-min' | 'x-center' | 'x-max' |
    // 'y-min' | ... | 'z-max'. Requires >= 2 bricks to do anything
    // useful; fewer collapses to a no-op through the transformsEqual
    // check. Bypasses gesture snapping by design — alignment targets are
    // exact geometric relationships, not user-authored deltas.
    alignSelection(selection, mode) {
        return this._executeLayoutOperation(
            selection,
            (entries, selectionBounds) =>
                TransformAlignment.calculateAlignmentTransforms(entries, selectionBounds, mode),
            'Align'
        );
    }

    // Distributes the resolved selection's centers evenly along one
    // world axis. Requires >= 3 bricks and a non-zero span; anything
    // less is a defensive no-op (null from the math, zero history).
    // Endpoints never move; only interior members do.
    distributeSelection(selection, axis) {
        return this._executeLayoutOperation(
            selection,
            (entries) =>
                TransformAlignment.calculateDistributionTransforms(entries, axis),
            'Distribute'
        );
    }

    // ---------------------------------------- snap to grid (0.4.9)

    // "Align this selection to the existing construction grid" — the
    // design conversation's own section 2, distinct from
    // alignSelection()/distributeSelection() above (which reference the
    // selection's OWN bounds) and distinct from the PER-GESTURE delta
    // snapping _snapGestureTransform() already applies to every keyboard/
    // gizmo frame (0.1.47): this snaps the selection's absolute pivot
    // onto the nearest world-space grid intersection, moving every
    // member by that SAME x/z delta so the selection's own internal
    // geometry is preserved exactly, the same rule numeric absolute
    // translation (applyNumericTransform) already follows. Y is left
    // untouched — see core/SnapMath.js's own header on why grid
    // snapping is a ground-plane (X/Z) operation here.
    //
    // Deliberately routed through beginTransformGesture/
    // commitTransformGesture with snap:false (exact intent, like
    // applyNumericTransform) rather than the alignment/distribution
    // shortcut (_executeLayoutOperation): unlike alignment, this is a
    // real move into arbitrary world space, not a reshape relative to
    // the selection's own bounds — so it inherits 0.4.8's collision gate
    // through the SAME commit path every other free-form move already
    // uses, for free. An already-grid-aligned selection, or one with
    // gridSize <= 0, is a no-op through the usual transformsEqual
    // discipline; a colliding target leaves the World completely
    // unmutated, the same "reject the whole operation" posture this
    // milestone's repetition (RepeatSelectionUseCase) also follows.
    snapSelectionToGrid(selection, gridSize) {
        if (!selection || selection.isEmpty || selection.type === 'ground') return false;
        if (this._gizmoState.active) return false;
        const pivot = this.getGroupPivot(selection);
        if (!pivot) return false;
        const snapped = SnapMath.snapPosition(pivot.x, pivot.z, gridSize);
        const delta = { x: snapped.x - pivot.x, y: 0, z: snapped.z - pivot.z };
        if (!this.beginTransformGesture(selection, { mode: 'translate', axis: null })) return false;
        return this.commitTransformGesture(selection, { translation: delta }, { snap: false });
    }

    // Shared transaction for alignment and distribution:
    //   resolve selection -> capture transforms -> generate exact
    //   absolute targets -> compare before/after -> exactly one
    //   TransformSelectionCommand (or zero history entries on no-op).
    _executeLayoutOperation(selection, calculate, verb) {
        if (!selection || selection.isEmpty || selection.type === 'ground') return false;
        if (this._gizmoState.active) return false;
        const document = this._session.getDocument(selection.documentId);
        if (!document) return false;
        // 0.2.95 — the alignSelection/distributeSelection chokepoint.
        // See beginTransformGesture's own comment above.
        if (!this._canEditDocument(selection.documentId)) return false;
        const world = document.world;
        const history = this._commandHistories.get(world.id);
        if (!history) return false;
        const before = this._captureTransforms(world, selection.items);
        if (!before) return false;
        const entries = this._captureEntries(world, selection.items);
        if (!entries) return false;
        const selectionBounds = this._boundsService.calculate(selection, document);
        if (!selectionBounds) return false;
        const after = calculate(entries, selectionBounds);
        if (!after || this._transformsEqual(before, after)) return false;
        history.execute(new TransformSelectionCommand({
            worldId: world.id,
            transforms: after,
            description: `${verb} ${after.length} ${after.length === 1 ? 'Brick' : 'Bricks'}`
        }));
        return true;
    }

    // ------------------------------------ numeric transform input (0.1.49)

    // Numeric input is an input surface, not a transform system. This
    // method translates exact user intent into the same gesture-shaped
    // transform every other input produces and submits it through the
    // existing transaction with snapping DISABLED — numeric entry is
    // explicit intent, so it must never be reinterpreted by gesture
    // snapping.
    //
    // intent: { translation: { x, y, z } | null, rotation: number | null }
    //   null translation/rotation (and null components) mean "unchanged"
    //   — never silently zero.
    // options.absolute:
    //   translation — values are TARGETS for the selection PIVOT; every
    //     member receives the same delta (target − pivot), preserving the
    //     selection's internal geometry. Single brick, multi-selection,
    //     and resolved group all share this one rule.
    //   rotation — the value is a TARGET for the PRIMARY brick's
    //     orientation; every member receives the same delta, preserving
    //     relative orientations. (Offset mode applies the value as a
    //     delta directly.)
    //
    // One Apply == one commit == at most one TransformSelectionCommand,
    // even when translation and rotation are combined. No-op input
    // (already at target, zero delta, nothing entered) commits nothing.
    // Returns true only when a command was actually committed.
    applyNumericTransform(selection, intent, { absolute = false } = {}) {
        if (!selection || selection.isEmpty || selection.type === 'ground') return false;
        if (this._gizmoState.active) return false;
        if (!intent || (intent.translation === null && (intent.rotation === null || intent.rotation === undefined))) {
            return false;
        }
        const document = this._session.getDocument(selection.documentId);
        if (!document) return false;
        const gesture = {};
        if (intent.translation) {
            let pivot = null;
            if (absolute) {
                pivot = this.getGroupPivot(selection);
                if (!pivot) return false;
            }
            gesture.translation = {
                x: this._numericAxisDelta(intent.translation.x, absolute ? pivot.x : 0, absolute),
                y: this._numericAxisDelta(intent.translation.y, absolute ? pivot.y : 0, absolute),
                z: this._numericAxisDelta(intent.translation.z, absolute ? pivot.z : 0, absolute)
            };
        }
        if (intent.rotation !== null && intent.rotation !== undefined) {
            if (absolute) {
                const primaryRotation = this._capturePrimaryRotation(document.world, selection);
                if (primaryRotation === null) return false;
                gesture.rotation = TransformMath.normalizeDegrees(intent.rotation - primaryRotation);
            } else {
                gesture.rotation = intent.rotation;
            }
        }
        if (gesture.translation === undefined && gesture.rotation === undefined) return false;
        if (!this.beginTransformGesture(selection, {
            mode: gesture.translation ? 'translate' : 'rotate',
            axis: null
        })) {
            return false;
        }
        return this.commitTransformGesture(selection, gesture, { snap: false });
    }

    _numericAxisDelta(value, reference, absolute) {
        if (value === null || value === undefined) {
            return 0;
        }
        return absolute ? value - reference : value;
    }

    _capturePrimaryRotation(world, selection) {
        const primary = selection.primary;
        if (!primary) return null;
        const building = world.getBuilding(primary.buildingId);
        const brick = building ? building.findBrick(primary.brickId) : null;
        return brick ? brick.rotation : null;
    }

    // -------------------------------------------------- gesture contract

    beginTransformGesture(selection, { mode, axis = null } = {}) {
        if (!selection || selection.isEmpty || selection.type === 'ground') return null;
        const document = this._session.getDocument(selection.documentId);
        if (!document) return null;
        // 0.2.95 — the real mutation chokepoint for moveSelection/
        // rotateSelection/applyNumericTransform AND the interactive
        // gizmo drag (gizmoPointerDown routes here too) — see this
        // class's own constructor comment. getEditingContext() already
        // refuses to hand out a non-empty context for a document this
        // predicate rejects, but this check does not trust that a
        // caller went through getEditingContext() at all.
        if (!this._canEditDocument(selection.documentId)) return null;
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
        const valid = this._collisionValidator.canApply(document.world, nextTransforms);
        this._gestureFeedback = applied.feedback ? { ...applied.feedback, valid } : null;
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
        // 0.4.8 — release over an invalid (colliding) candidate cancels
        // the whole gesture rather than partially committing; the real
        // bricks are already back at `before`, above, so there is
        // nothing further to undo.
        if (!this._collisionValidator.canApply(world, after)) return false;
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
    //
    // Bypasses (transform passes through untouched):
    //   - snapping disabled in TransformSettings
    //   - gestureOptions.snap === false — explicit-intent inputs:
    //     numeric transform input (0.1.49) sets this; alignment and
    //     distribution never enter this path at all.
    _snapGestureTransform(transform, gestureOptions = {}) {
        const settings = this._transformSettings;
        const precise = !!(gestureOptions.modifiers && gestureOptions.modifiers.shift);
        if (gestureOptions.snap === false || !settings.snappingEnabled) {
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

    // Alignment/distribution need each member's OWN bounds (edges and
    // center) in addition to its transform — captured in one pass so the
    // pure math module receives plain data only.
    _captureEntries(world, items) {
        const entries = [];
        for (const item of items) {
            const building = world.getBuilding(item.buildingId);
            const brick = building ? building.findBrick(item.brickId) : null;
            if (!brick) return null;
            entries.push({
                buildingId: item.buildingId,
                brickId: item.brickId,
                position: brick.position.toJSON(),
                rotation: brick.rotation,
                bounds: this._boundsService.calculateBrickBounds(brick)
            });
        }
        return entries;
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
        // 0.2.95 — the deleteSelection chokepoint. See
        // beginTransformGesture's own comment above.
        if (!this._canEditDocument(selection.documentId)) return false;
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
