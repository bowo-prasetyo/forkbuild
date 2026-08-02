import { Tool } from './Tool.js';
import { Position } from '../../core/Position.js';

const BRICK_REST_HEIGHT = 0.5;

// Pointer move -> pick -> (ground plane -> snap) -> PreviewUseCase.show().
// Pointer down -> PlaceBrickCommand -> World is deliberately NOT wired
// yet: PlaceBrickCommand doesn't exist until 0.1.14. onPointerDown is a
// documented no-op until then, not an oversight.
//
// Known limitation: only snaps to the ground plane. Hovering an existing
// brick hides the preview rather than attempting to stack on top of it —
// face-relative placement needs face-normal detection from the raycast
// hit, real added complexity deliberately deferred to when
// PlaceBrickCommand needs to decide exact placement rules anyway.
export class PlacementTool extends Tool {
    deactivate() {
        this.context.previewUseCase.hide();
    }

    onPointerMove(pointerEvent) {
        const hit = this.context.pick(pointerEvent.screenX, pointerEvent.screenY);
        if (hit) {
            this.context.previewUseCase.hide();
            return;
        }

        const definitionId = this.context.editorContext.activeBrick.definitionId;
        if (!definitionId) {
            this.context.previewUseCase.hide();
            return;
        }

        const groundPosition = this.context.pickGround(pointerEvent.screenX, pointerEvent.screenY);
        if (!groundPosition) {
            this.context.previewUseCase.hide();
            return;
        }

        const snapped = this._snapToGrid(groundPosition);
        this.context.previewUseCase.show(definitionId, snapped, 0);
    }

    onPointerDown(pointerEvent) {
        // Placement itself arrives in 0.1.14 (PlaceBrickCommand). Until
        // then, this tool only previews where a brick would go.
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
