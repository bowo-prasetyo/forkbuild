import { Tool } from './Tool.js';
import { Position } from '../../core/Position.js';
import { PlacementValidator } from '../../core/PlacementValidator.js';
import { PlaceBrickCommand } from '../commands/PlaceBrickCommand.js';

const BRICK_REST_HEIGHT = 0.5;

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
// Known limitation carried over from Placement Preview: only supports
// placing on the ground plane. Hovering an existing brick hides the
// preview rather than stacking on top of it — face-relative placement
// needs face-normal detection from the raycast hit, deferred until it's
// actually needed.
//
// V0.1 simplification: assumes exactly one building exists in the world
// (true for the demo world) and places into it. Choosing which building
// to build into is future work — not yet part of any roadmap milestone.
export class PlacementTool extends Tool {
    constructor(context) {
        super(context);
        this._placementValidator = new PlacementValidator();
    }

    deactivate() {
        this.context.previewUseCase.hide();
    }

    onPointerMove(pointerEvent) {
        if (pointerEvent.pickedBrick) {
            this.context.previewUseCase.hide();
            return;
        }

        const definitionId = this.context.editorContext.activeBrick.definitionId;
        if (!definitionId) {
            this.context.previewUseCase.hide();
            return;
        }

        if (!pointerEvent.worldPosition) {
            this.context.previewUseCase.hide();
            return;
        }

        const snapped = this._snapToGrid(pointerEvent.worldPosition);
        this.context.previewUseCase.show(definitionId, snapped, 0);
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

        // The previewed brick now exists for real — hide the ghost until
        // the next pointer move recalculates it, so it doesn't sit
        // visually overlapping the brick WorldRenderer just created.
        this.context.previewUseCase.hide();
    }

    _snapToGrid(position) {
        const settings = this.context.editorContext.settings;
        if (!settings.gridSnapEnabled) {
            return new Position(position.x, BRICK_REST_HEIGHT, position.z);
        }

        const size = settings.gridSnapSize;
        const snappedX = Math.round(position.x / size) * size;
        const snappedZ = Math.round(position.z / size) * size;
        return new Position(snappedX, BRICK_REST_HEIGHT, snappedZ);
    }
}
