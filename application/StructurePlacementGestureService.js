import { Position } from '../core/Position.js';
import { SpatialBounds } from '../core/SpatialBounds.js';
import { TransformGizmoState } from './spatial-state/TransformGizmoState.js';
import { TransformSnap } from './TransformSnap.js';
import { TransformMath } from './TransformMath.js';
import { StructurePlacementValidator } from './StructurePlacementValidator.js';
import { MoveStructurePlacementCommand } from './commands/MoveStructurePlacementCommand.js';
import { RotateStructurePlacementCommand } from './commands/RotateStructurePlacementCommand.js';

// 0.2.92 — World Instance Transform UX. The StructurePlacement
// counterpart to SpatialEditingService, one rung up — NOT a widening of
// that class. `application/EditorSession.js`'s own 0.2.91 header already
// settled this: "a placement selection gets its OWN small commands...
// the gesture kernel is not one of them." This class exists so a
// placement selection can ALSO drive the interactive pointer gizmo
// (`renderer/TransformGizmoController.js`) — which expects exactly one
// gesture-contract object per drag (begin/preview/commit/cancel +
// getGestureFeedback) — without SpatialEditingService or its per-brick
// `TransformSelectionCommand` ever having to understand a whole placed
// structure. See `application/GizmoGestureRouter.js` for how the
// controller ends up pointed at this service in the first place.
//
// The critical difference from SpatialEditingService's own gesture
// transaction, worth stating once: SpatialEditingService PREVIEWS by
// mutating brick positions directly (then reverting on cancel).
// StructurePlacementGestureService never touches `World` at all until
// commit — mid-gesture it only drives `StructurePreviewUseCase`'s ghost,
// exactly the way `application/tools/SelectionTool.js`'s own 0.2.91
// click-and-drag already does. That is deliberate, not an oversight: it
// means BOTH interaction paths — the click-drag SelectionTool shipped in
// 0.2.91, and the axis/rotation gizmo this milestone adds — leave the
// real StructurePlacement completely untouched until the pointer is
// released, and both validate the SAME candidate position with the SAME
// `StructurePlacementValidator` before ever calling
// `MoveStructurePlacementCommand`/`RotateStructurePlacementCommand`. The
// UI never becomes a second authority over what a valid placement is.
//
// Y is deliberately never a drag or gesture target — see
// docs/Principles.md, "A Placement's Elevation Is Never A Gizmo Or
// Numeric Target (0.2.92)". A candidate position's Y always stays
// exactly what the placement's Y already was; the gizmo's own Y-axis
// handle (drawn by the shared `TransformGizmoRenderer`, which has no
// idea a placement is selected rather than a brick) is therefore inert
// for a placement selection by construction, not by special-casing the
// renderer.
export class StructurePlacementGestureService {
    constructor({
        getWorld,
        getCommandHistory,
        registry = null,
        structureResolver = null,
        structurePreviewUseCase = null,
        transformSettings
    } = {}) {
        this._getWorld = typeof getWorld === 'function' ? getWorld : () => null;
        this._getCommandHistory = typeof getCommandHistory === 'function' ? getCommandHistory : () => null;
        this._registry = registry;
        this._structureResolver = structureResolver;
        this._structurePreviewUseCase = structurePreviewUseCase;
        this._transformSettings = transformSettings;

        this._gizmoState = TransformGizmoState.idle();
        this._gestureFeedback = null;
        this._placementId = null;
        this._originalPosition = null;
        this._originalRotation = null;
        this._candidatePosition = null;
        this._candidateRotation = null;
        this._valid = true;
    }

    get transformGizmoState() { return this._gizmoState; }

    getGestureFeedback() { return this._gestureFeedback; }

    // Mirrors TransformGizmoUseCase#resolvePresentation()'s own return
    // shape ({ min, max, center, size }) exactly, so
    // `application/EditorSession.js#_refreshGizmo()` can anchor the SAME
    // shared gizmo visuals (renderer/TransformGizmoRenderer.js) to
    // either a brick/group selection or a whole placement.
    getSelectionBounds(selection) {
        if (!selection || !selection.isStructurePlacementSelection) {
            return null;
        }
        const world = this._getWorld();
        if (!world) {
            return null;
        }
        const placement = world.getStructurePlacement(selection.selectedPlacementId);
        if (!placement) {
            return null;
        }
        return this._boundsForPlacement(placement);
    }

    // ----------------------------------------------- gesture contract
    // (the exact 5-method interface renderer/TransformGizmoController.js
    // calls; see this file's own header)

    beginTransformGesture(selection, { mode, axis = null } = {}) {
        if (!selection || !selection.isStructurePlacementSelection) {
            return null;
        }
        const world = this._getWorld();
        if (!world) {
            return null;
        }
        const placement = world.getStructurePlacement(selection.selectedPlacementId);
        if (!placement) {
            return null;
        }
        const bounds = this._boundsForPlacement(placement);
        this._placementId = placement.id;
        this._originalPosition = placement.position.clone();
        this._originalRotation = placement.rotation;
        this._candidatePosition = this._originalPosition;
        this._candidateRotation = this._originalRotation;
        this._valid = true;
        this._gizmoState = TransformGizmoState.active({
            mode,
            axis,
            pivot: bounds.center,
            selectionBounds: bounds,
            initialTransforms: []
        });
        this._gestureFeedback = null;
        return this._gizmoState;
    }

    previewTransformGesture(selection, transform, gestureOptions = {}) {
        if (!this._gizmoState.active || !selection) {
            return false;
        }
        const world = this._getWorld();
        const placement = world ? world.getStructurePlacement(this._placementId) : null;
        if (!world || !placement) {
            return false;
        }

        const precise = !!(gestureOptions.modifiers && gestureOptions.modifiers.shift);
        // Same bypass SpatialEditingService's own _snapGestureTransform()
        // honors: snapping OFF (a future settings surface) means the raw
        // gesture value is used exactly. Defaults to snapping ON, the
        // same as every other pointer gesture in this engine.
        const snappingEnabled = !!(this._transformSettings && this._transformSettings.snappingEnabled);
        let candidatePosition = this._originalPosition;
        let candidateRotation = this._originalRotation;

        if (transform && transform.translation) {
            const rawX = transform.translation.x || 0;
            const rawZ = transform.translation.z || 0;
            const increment = snappingEnabled ? this._transformSettings.translationIncrement(precise) : null;
            const dx = TransformSnap.snapValue(rawX, increment);
            const dz = TransformSnap.snapValue(rawZ, increment);
            // transform.translation.y is deliberately discarded — see
            // this file's own header on why the Y handle is inert here.
            candidatePosition = new Position(
                this._originalPosition.x + dx,
                this._originalPosition.y,
                this._originalPosition.z + dz
            );
        }
        if (transform && transform.rotation !== undefined && transform.rotation !== null) {
            const increment = snappingEnabled ? this._transformSettings.rotationIncrement(precise) : null;
            const snapped = TransformMath.normalizeDegrees(TransformSnap.snapRotation(transform.rotation, increment));
            candidateRotation = this._originalRotation + snapped;
        }

        this._candidatePosition = candidatePosition;
        this._candidateRotation = candidateRotation;
        this._valid = this._fits(world, placement, candidatePosition);
        this._gestureFeedback = {
            mode: this._gizmoState.mode,
            axis: this._gizmoState.axis,
            translation: transform && transform.translation
                ? { x: candidatePosition.x - this._originalPosition.x, y: 0, z: candidatePosition.z - this._originalPosition.z }
                : null,
            rotation: transform && transform.rotation !== undefined ? candidateRotation - this._originalRotation : null,
            precise,
            valid: this._valid
        };

        if (this._structurePreviewUseCase) {
            this._structurePreviewUseCase.show(
                placement.documentId, null, candidatePosition, candidateRotation, this._valid
            );
        }
        return true;
    }

    commitTransformGesture(selection, transform, gestureOptions = {}) {
        if (!this._gizmoState.active || !selection) {
            return false;
        }
        this.previewTransformGesture(selection, transform, gestureOptions);

        const world = this._getWorld();
        const history = this._getCommandHistory();
        const placementId = this._placementId;
        const originalPosition = this._originalPosition;
        const originalRotation = this._originalRotation;
        const candidatePosition = this._candidatePosition;
        const candidateRotation = this._candidateRotation;
        const valid = this._valid;
        this._endGesture();

        if (!world || !history || !placementId) {
            return false;
        }
        // Releasing over an invalid (colliding) position cancels the
        // whole gesture, never a partial commit — the exact posture
        // SelectionTool's own click-drag already takes.
        if (!valid) {
            return false;
        }

        let committed = false;
        const deltaX = candidatePosition.x - originalPosition.x;
        const deltaZ = candidatePosition.z - originalPosition.z;
        if (deltaX !== 0 || deltaZ !== 0) {
            history.execute(new MoveStructurePlacementCommand({
                worldId: world.id,
                placementId,
                delta: { x: deltaX, y: 0, z: deltaZ }
            }));
            committed = true;
        }
        const deltaRotation = candidateRotation - originalRotation;
        if (deltaRotation !== 0) {
            history.execute(new RotateStructurePlacementCommand({
                worldId: world.id,
                placementId,
                deltaRotation
            }));
            committed = true;
        }
        return committed;
    }

    cancelTransformGesture(selection) {
        if (!this._gizmoState.active) {
            return false;
        }
        this._endGesture();
        return true;
    }

    // ----------------------------------------------------------- internal

    _endGesture() {
        if (this._structurePreviewUseCase) {
            this._structurePreviewUseCase.hide();
        }
        this._gizmoState = TransformGizmoState.idle();
        this._gestureFeedback = null;
        this._placementId = null;
        this._originalPosition = null;
        this._originalRotation = null;
        this._candidatePosition = null;
        this._candidateRotation = null;
        this._valid = true;
    }

    // Mirrors application/EditorSession.js#_structurePlacementFits() and
    // application/tools/SelectionTool.js#_canPlaceAt() exactly — same
    // validator, same excludePlacementId reasoning, duplicated at this
    // third independent entry point rather than shared, the precedent
    // SelectionTool's own header already established for the first two.
    _fits(world, placement, candidatePosition) {
        if (!this._structureResolver) {
            return true;
        }
        const placedWorld = this._structureResolver.resolve(placement.documentId);
        if (!placedWorld) {
            return true;
        }
        const validator = new StructurePlacementValidator();
        return validator.canPlace(world, this._registry, this._structureResolver, {
            localBounds: SpatialBounds.fromWorld(placedWorld, this._registry),
            position: candidatePosition,
            excludePlacementId: placement.id
        });
    }

    _boundsForPlacement(placement) {
        if (this._structureResolver) {
            const placedWorld = this._structureResolver.resolve(placement.documentId);
            if (placedWorld) {
                const global = SpatialBounds.fromWorld(placedWorld, this._registry).getGlobalBounds(placement.position);
                return { min: global.min, max: global.max, center: global.center, size: global.size };
            }
        }
        // No resolver, or an unresolvable Document (see
        // application/StructureDocumentResolver.js's own header on what
        // that means) — the gizmo still needs somewhere to anchor. A
        // small box centered on the placement's own position degrades
        // gracefully, the same posture StructurePlacementValidator
        // already takes toward an unresolvable placement (nothing to
        // collide with).
        const p = placement.position;
        return {
            min: { x: p.x - 0.5, y: p.y, z: p.z - 0.5 },
            max: { x: p.x + 0.5, y: p.y + 1, z: p.z + 0.5 },
            center: { x: p.x, y: p.y + 0.5, z: p.z },
            size: { x: 1, y: 1, z: 1 }
        };
    }
}
