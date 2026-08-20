import { Tool } from './Tool.js';
import { DeleteBrickCommand } from '../commands/DeleteBrickCommand.js';
import { CompositeCommand } from '../commands/CompositeCommand.js';
import { RemoveStructurePlacementCommand } from '../commands/RemoveStructurePlacementCommand.js';
import { MoveStructurePlacementCommand } from '../commands/MoveStructurePlacementCommand.js';
import { RotateStructurePlacementCommand } from '../commands/RotateStructurePlacementCommand.js';
import { StructurePlacementValidator } from '../StructurePlacementValidator.js';
import { PlacementPositionService } from '../PlacementPositionService.js';
import { SpatialBounds } from '../../core/SpatialBounds.js';
import { Position } from '../../core/Position.js';

const DELETE_KEYS = new Set(['Delete', 'Backspace']);

// Pointer down -> select the hit brick (pointerEvent.pickedBrick, already
// computed by InputDispatcher), or clear on a miss. As of 0.1.18 this
// tool no longer calls PickingService itself — the event already carries
// the answer. Escape-to-clear and Delete/Backspace-to-remove both live
// here rather than in EditorView — input handling belongs with the tool
// it belongs to, not the UI shell.
//
// As of 0.1.45 the click-selection contract is explicit and matches
// World View exactly:
//   click            -> replace selection
//   Ctrl/Cmd + click -> toggle brick
//   Shift  + click   -> add brick (union)
// All three are session state changes — zero history entries. Marquee
// (Shift+drag) is handled by EditorView/EditorSession because the
// gesture and its rectangle overlay live at the view level; the tool
// never sees it.
//
// 0.2.91 — World Instance Editing & Placement Management. A hit on
// pointerEvent.pickedPlacement (InputDispatcher's own second, separate
// raycast) selects the WHOLE StructurePlacement instance — never a
// constituent brick, per SelectionState's own header — and, clicking
// the ALREADY-selected instance a second time, begins a terrain-aware
// drag: pointer move recomputes a ground-snapped candidate position
// (application/PlacementPositionService.js#calculateStructureGround(),
// the exact ground-snap math StructurePlacementTool already uses),
// validates it (application/StructurePlacementValidator.js, excluding
// the placement from consideration against itself), and drives the SAME
// StructurePreviewState/StructurePreviewUseCase/StructurePreviewRenderer
// 0.2.90 built for placing a NEW structure — "reuse the existing
// preview infrastructure wherever possible." Releasing the pointer over
// a valid position commits ONE MoveStructurePlacementCommand for the
// whole drag (one undo step, not one per frame); releasing over an
// invalid position or off any ground simply cancels, exactly like
// StructurePlacementTool refusing to commit a blocked preview.
export class SelectionTool extends Tool {
    constructor(context) {
        super(context);
        this._validator = new StructurePlacementValidator();
        this._positionService = new PlacementPositionService(context.registry);
        this._dragPlacementId = null;
        this._dragOriginalPosition = null;
        this._dragCandidate = null;
        this._dragValid = true;
    }

    deactivate() {
        this._cancelDrag();
    }

    onPointerDown(pointerEvent) {
        if (pointerEvent.pickedBrick) {
            this._cancelDrag();
            const toggle = pointerEvent.modifiers.ctrl || pointerEvent.modifiers.meta;
            const additive = pointerEvent.modifiers.shift;
            if (additive) {
                this.context.selectionUseCase.add(
                    pointerEvent.pickedBrick.brickId,
                    pointerEvent.pickedBrick.buildingId
                );
            } else if (toggle) {
                this.context.selectionUseCase.toggle(
                    pointerEvent.pickedBrick.brickId,
                    pointerEvent.pickedBrick.buildingId
                );
            } else {
                this.context.selectionUseCase.select(
                    pointerEvent.pickedBrick.brickId,
                    pointerEvent.pickedBrick.buildingId
                );
            }
            return;
        }
        if (pointerEvent.pickedPlacement) {
            const { placementId } = pointerEvent.pickedPlacement;
            const selection = this.context.editorContext.selection;
            const alreadySelected = selection.isStructurePlacementSelection
                && selection.selectedPlacementId === placementId;
            this.context.selectionUseCase.selectPlacement(placementId);
            if (alreadySelected) {
                this._beginDrag(placementId);
            }
            return;
        }
        this._cancelDrag();
        this.context.selectionUseCase.clear();
    }

    onPointerMove(pointerEvent) {
        if (!this._dragPlacementId || !pointerEvent.worldPosition) {
            return;
        }
        const world = this.context.world;
        const placement = world.getStructurePlacement(this._dragPlacementId);
        if (!placement) {
            this._cancelDrag();
            return;
        }
        const ground = this._positionService.calculateStructureGround(
            pointerEvent.worldPosition, this.context.editorContext.settings
        );
        // The rigid-unit rule (0.2.76): Y always stays whatever it
        // already was for this placement (0 for a ground-placed
        // instance) — dragging only ever moves X/Z, terrain is applied
        // at render time, never baked into the placement's own Y.
        const candidate = new Position(ground.x, this._dragOriginalPosition.y, ground.z);
        this._dragCandidate = candidate;
        this._dragValid = this._canPlaceAt(world, placement, candidate);

        if (this.context.structurePreviewUseCase) {
            this.context.structurePreviewUseCase.show(
                placement.documentId, null, candidate, placement.rotation, this._dragValid
            );
        }
    }

    onPointerUp() {
        if (!this._dragPlacementId) {
            return;
        }
        const placementId = this._dragPlacementId;
        const valid = this._dragValid;
        const candidate = this._dragCandidate;
        const original = this._dragOriginalPosition;
        this._dragPlacementId = null;
        this._dragOriginalPosition = null;
        this._dragCandidate = null;
        if (this.context.structurePreviewUseCase) {
            this.context.structurePreviewUseCase.hide();
        }
        if (!valid || !candidate || !original) {
            return;
        }
        const delta = {
            x: candidate.x - original.x,
            y: candidate.y - original.y,
            z: candidate.z - original.z
        };
        if (delta.x === 0 && delta.y === 0 && delta.z === 0) {
            return;
        }
        this.context.commandHistory.execute(new MoveStructurePlacementCommand({
            worldId: this.context.world.id,
            placementId,
            delta
        }));
    }

    onKeyDown(keyEvent) {
        if (keyEvent.key === 'Escape') {
            this._cancelDrag();
            this.context.selectionUseCase.clear();
            return;
        }
        if (DELETE_KEYS.has(keyEvent.key)) {
            this._deleteSelected();
            return;
        }
        if (!this._dragPlacementId && typeof keyEvent.key === 'string' && keyEvent.key.toLowerCase() === 'r') {
            this._rotateSelectedPlacement(keyEvent.modifiers && keyEvent.modifiers.shift ? -90 : 90);
        }
    }

    _rotateSelectedPlacement(deltaRotation) {
        const selection = this.context.editorContext.selection;
        if (!selection.isStructurePlacementSelection) {
            return;
        }
        this.context.commandHistory.execute(new RotateStructurePlacementCommand({
            worldId: this.context.world.id,
            placementId: selection.selectedPlacementId,
            deltaRotation
        }));
    }

    _deleteSelected() {
        const selection = this.context.editorContext.selection;
        if (selection.isEmpty) {
            return;
        }
        if (selection.isStructurePlacementSelection) {
            this._cancelDrag();
            this.context.commandHistory.execute(new RemoveStructurePlacementCommand({
                worldId: this.context.world.id,
                placementId: selection.selectedPlacementId
            }));
            this.context.selectionUseCase.clear();
            return;
        }
        const commands = selection.items.map((item) => new DeleteBrickCommand({
            worldId: this.context.world.id,
            buildingId: item.buildingId,
            brickId: item.brickId
        }));
        const command = commands.length === 1
            ? commands[0]
            : commands.reduce((composite, child) => composite.add(child), new CompositeCommand({ description: `Delete ${commands.length} Bricks` }));
        this.context.commandHistory.execute(command);
        this.context.selectionUseCase.clear();
    }

    _beginDrag(placementId) {
        const placement = this.context.world.getStructurePlacement(placementId);
        if (!placement) {
            return;
        }
        this._dragPlacementId = placementId;
        this._dragOriginalPosition = placement.position;
        this._dragCandidate = placement.position;
        this._dragValid = true;
    }

    _cancelDrag() {
        if (this._dragPlacementId && this.context.structurePreviewUseCase) {
            this.context.structurePreviewUseCase.hide();
        }
        this._dragPlacementId = null;
        this._dragOriginalPosition = null;
        this._dragCandidate = null;
        this._dragValid = true;
    }

    // Mirrors application/EditorSession.js#_structurePlacementFits()
    // exactly (same validator, same excludePlacementId reasoning) —
    // duplicated at the Tool layer rather than shared because Tool and
    // Session are two independent entry points into the same commands,
    // the precedent this codebase already established for brick
    // deletion (SelectionTool#_deleteSelected() vs.
    // EditorSession#deleteSelection()).
    _canPlaceAt(world, placement, candidatePosition) {
        const resolver = this.context.structureResolver;
        if (!resolver) {
            return true;
        }
        const placedWorld = resolver.resolve(placement.documentId);
        if (!placedWorld) {
            return true;
        }
        return this._validator.canPlace(world, this.context.registry, resolver, {
            localBounds: SpatialBounds.fromWorld(placedWorld, this.context.registry),
            position: candidatePosition,
            excludePlacementId: placement.id
        });
    }
}
