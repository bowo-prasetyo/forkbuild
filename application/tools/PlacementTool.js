import { Tool } from './Tool.js';
import { PlacementValidator } from '../../core/PlacementValidator.js';
import { PlaceBrickCommand } from '../commands/PlaceBrickCommand.js';
import { PlacementPositionService } from '../PlacementPositionService.js';

// Pointer move -> read pointerEvent.pickedBrick/worldPosition (already
// computed by InputDispatcher) -> snap -> PreviewUseCase.show().
// Pointer down -> PlacementValidator -> PlaceBrickCommand ->
// CommandHistory.execute(). Renderer-ignorant throughout: this tool never
// touches Three.js, only World (via the command, routed through
// CommandHistory) and EditorContext (via the use cases). As of 0.1.18 it
// also never calls PickingService directly — InputDispatcher already did
// the picking before this tool ever sees the event.
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
export class PlacementTool extends Tool {
    constructor(context) {
        super(context);
        this._placementValidator = new PlacementValidator();
        this._positionService = new PlacementPositionService(context.registry);
    }

    deactivate() {
        this.context.previewUseCase.hide();
    }

    onPointerMove(pointerEvent) {
        const definitionId = this.context.editorContext.activeBrick.definitionId;
        if (!definitionId) {
            this.context.previewUseCase.hide();
            return;
        }

        if (!pointerEvent.worldPosition) {
            this.context.previewUseCase.hide();
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

        this.context.previewUseCase.show(definitionId, position, 0);
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
    }
}
