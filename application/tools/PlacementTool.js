import { Tool } from './Tool.js';
import { PlacementValidator } from '../../core/PlacementValidator.js';
import { PlaceBrickCommand } from '../commands/PlaceBrickCommand.js';
import { PlacementPositionService } from '../PlacementPositionService.js';

// Pointer move -> read pointerEvent.pickedBrick/worldPosition (already
// computed by InputDispatcher) -> snap -> PreviewUseCase.show(). Pointer
// down -> PlacementValidator -> PlaceBrickCommand -> CommandHistory.
// execute(). Renderer-ignorant throughout: this tool never touches
// Three.js, only World (via the command, routed through CommandHistory)
// and EditorContext (via the use cases). As of 0.1.18 it also never
// calls PickingService directly — InputDispatcher already did the
// picking before this tool ever sees the event.
//
// PlacementValidator is constructed here rather than threaded through
// ToolContext from ui/: application/tools/ -> core/ is an allowed
// dependency, but ui/ -> core/ isn't (see the AboutView exception noted
// in Architecture.md — deliberately not repeating that mistake here just
// because EditorView happens to assemble ToolContext).
//
// V0.1 simplification: assumes exactly one building exists in the world
// (true for the demo world) and places into it. Choosing which building
// to build into is future work — not yet part of any roadmap milestone.
//
// PlacementTool now supports stacking on existing bricks using face-normal
// detection from PickingService. It reuses PlacementPositionService so
// the same dimension-aware logic applies in both Editor and Spatial views.
//
// 0.2.87 — World Building Interaction & Placement UX adds two things,
// both purely at this tool's own boundary, nothing upstream or
// downstream needed to change:
//   1. onPointerMove() now also asks PlacementValidator whether the
//      computed position is collision-clear and passes that through to
//      the preview, so the ghost can be tinted red/valid BEFORE the
//      user commits — see renderer/PreviewRenderer.js. onPointerDown()
//      still re-checks independently rather than trusting the cached
//      flag; cheap and stateless, and it keeps this tool correct even
//      if a caller ever calls onPointerDown() without a prior move.
//   2. onKeyDown() answers 'R' (rotate the pending placement 90° per
//      press, Shift+R the other way) — the exact "R rotates the brick
//      before you place it" gap the design conversation named. Rotation
//      is owned entirely by this tool instance (never CommandHistory,
//      never a domain mutation — it only ever changes what the NEXT
//      PlaceBrickCommand will carry) and, like RotateBrickCommand
//      itself, is never normalized mod 360 — accumulating is harmless,
//      Three.js normalizes for rendering, and PlaceBrickCommand stores
//      whatever value it's handed either way. It resets to 0 whenever
//      placement mode is left (deactivate()), not on every brick
//      switch, so rotating once and then picking a different brick from
//      the Build Library keeps the same orientation — see
//      docs/Roadmap.md, 0.2.87.
export class PlacementTool extends Tool {
    constructor(context) {
        super(context);
        this._placementValidator = new PlacementValidator();
        this._positionService = new PlacementPositionService(context.registry);
        this._rotation = 0;
        this._lastPosition = null;
    }

    deactivate() {
        this.context.previewUseCase.hide();
        this._rotation = 0;
        this._lastPosition = null;
    }

    onPointerMove(pointerEvent) {
        const definitionId = this.context.editorContext.activeBrick.definitionId;
        if (!definitionId) {
            this.context.previewUseCase.hide();
            this._lastPosition = null;
            return;
        }

        if (!pointerEvent.worldPosition) {
            this.context.previewUseCase.hide();
            this._lastPosition = null;
            return;
        }

        let position = null;

        if (pointerEvent.pickedBrick && pointerEvent.pickedBrick.normal) {
            const world = this.context.world;
            const building = world.getBuilding(pointerEvent.pickedBrick.buildingId);
            const existingBrick = building?.findBrick(pointerEvent.pickedBrick.brickId);
            if (existingBrick) {
                position = this._positionService.calculateStack(
                    existingBrick,
                    pointerEvent.pickedBrick.normal,
                    definitionId,
                    this.context.editorContext.settings
                );
            }
        }

        if (!position) {
            position = this._positionService.calculateGround(
                pointerEvent.worldPosition,
                definitionId,
                this.context.editorContext.settings
            );
        }

        this._lastPosition = position;
        this._showPreview(definitionId, position);
    }

    onPointerDown(pointerEvent) {
        const preview = this.context.editorContext.preview;
        if (!preview.visible || !preview.definitionId) {
            return;
        }

        const world = this.context.world;
        const buildings = world.getBuildings();
        if (buildings.length === 0) {
            return;
        }
        const buildingId = buildings[0].id;

        if (!this._placementValidator.canPlace(world, buildingId, preview.position)) {
            return;
        }

        const command = new PlaceBrickCommand({
            worldId: world.id,
            buildingId,
            definitionId: preview.definitionId,
            position: preview.position,
            rotation: preview.rotation
        });
        this.context.commandHistory.execute(command);
        this.context.previewUseCase.hide();
        this._lastPosition = null;
    }

    onKeyDown(keyEvent) {
        if (!keyEvent || typeof keyEvent.key !== 'string' || keyEvent.key.toLowerCase() !== 'r') {
            return;
        }
        const definitionId = this.context.editorContext.activeBrick.definitionId;
        if (!definitionId || !this._lastPosition) {
            return;
        }
        const delta = keyEvent.modifiers?.shift ? -90 : 90;
        this._rotation += delta;
        this._showPreview(definitionId, this._lastPosition);
    }

    // Shared by onPointerMove() (a fresh position) and onKeyDown() (the
    // same cached position, a new rotation) — one place computes
    // validity and calls PreviewUseCase, so the two can never disagree
    // about what "valid" means for a given position.
    _showPreview(definitionId, position) {
        const world = this.context.world;
        const buildings = world.getBuildings();
        const valid = buildings.length === 0
            ? true
            : this._placementValidator.canPlace(world, buildings[0].id, position);
        this.context.previewUseCase.show(definitionId, position, this._rotation, valid);
    }
}
