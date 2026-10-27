import { Tool } from './Tool.js';
import { SpatialBounds } from '../../core/world/SpatialBounds.js';
import { StructurePlacementValidator } from '../editor/StructurePlacementValidator.js';
import { PlacementPositionService } from '../editor/PlacementPositionService.js';
import { ToolId } from '../editor-state/ToolId.js';
import { Position } from '../../core/document/Position.js';
import { boxOfBricks, restingLift } from '../../core/building/BrickResting.js';
import { transformStructureBricks } from '../editor/StructureCompositionTransform.js';

// 0.4.1 — Interactive Structure Composition UX: the "Copy Into
// Document" counterpart to application/tools/StructurePlacementTool.js,
// reusing that tool's exact shape (pointer move -> snap -> preview;
// pointer down -> validate -> commit; 'R'/'Shift+R' -> rotate) for a
// deliberately different operation — see docs/Roadmap.md, 0.4.1,
// "Interactive Structure Copy Preview": placing a StructurePlacement
// creates a live REFERENCE to another Document; composing a Structure
// flattens its bricks into the CURRENT document's own bricks, via
// exactly the ONE PasteBricksCommand
// application/editor/CopyStructureIntoDocumentUseCase.js already produces
// non-interactively (0.4.0) — this tool only changes HOW the transform
// passed to that use case is chosen (interactively, instead of always
// the deterministic auto-offset), never what gets committed. See
// docs/Principles.md, "Copying Composes A Blueprint; Forking Creates
// One (0.4.0)" — this tool is still Copy, never a third mechanism.
//
// Preview and commit share ONE geometry pipeline by construction: both
// this tool's live preview (via context.compositionPreviewUseCase ->
// renderer/CompositionPreviewRenderer.js) and its eventual commit read
// the SAME { position, rotation } transform and resolve it through
// application/editor/StructureCompositionTransform.js#transformStructureBricks()
// (transitively, via CopyStructureIntoDocumentUseCase#execute()) — the
// preview is a visualization of the exact command that will run, never
// an approximation of it.
//
// Collision reuses application/editor/StructurePlacementValidator.js exactly —
// the Structure's own AABB (SpatialBounds.fromBricks(structure.bricks,
// registry)) checked against the World's existing bricks and
// StructurePlacements, the same conservative "not rotated" posture that
// validator already applies to a StructurePlacement preview. Composing
// a Structure never creates a StructurePlacement, but colliding with
// one that's already there is still a real collision.
//
// Stays active after a placement, like PlacementTool and
// StructurePlacementTool: placing four trees is four clicks, not four trips
// to the Build Library. The structure and its turn stay in hand and its
// ghost hides until the pointer moves (or, by touch, the next tap shows it).
// Escape, Select or the touch bar's Cancel return to Select.
//
// Pointed at the top of a brick, the structure goes where the pointer is on
// it and rests on the tallest brick under its footprint, by the same rule as
// a wide brick (core/building/BrickResting.js): a shed on a deck, a chimney
// on a roof. Pointed at the ground (or a brick's side) it stands on the
// ground. Its footprint, for resting and for the collision check alike, is
// the turned footprint of its turned bricks.
export class StructureCompositionTool extends Tool {
    constructor(context) {
        super(context);
        this._validator = new StructurePlacementValidator();
        this._positionService = new PlacementPositionService(context.registry);
        this._rotation = 0;
        this._lastPosition = null;
        this._lastPointer = null;
    }

    // Seeds the preview at the deterministic AUTOMATIC composition
    // position (CopyStructureIntoDocumentUseCase#defaultTransform()) —
    // "click Copy Into Document" always previews exactly where the
    // non-interactive 0.4.0 path would have placed it, before the user
    // moves anything (docs/Roadmap.md, 0.4.1, "Add 'Place Here'
    // Semantics").
    activate() {
        const structure = this.context.editorContext.activeComposition.structure;
        const useCase = this.context.copyStructureIntoDocumentUseCase;
        if (!structure || !useCase) {
            return;
        }
        const transform = useCase.defaultTransform(structure, this.context.world, this.context.registry);
        this._rotation = transform.rotation;
        this._lastPosition = transform.position;
        this._showPreview(structure, this._lastPosition);
    }

    deactivate() {
        if (this.context.compositionPreviewUseCase) {
            this.context.compositionPreviewUseCase.hide();
        }
        this._rotation = 0;
        this._lastPosition = null;
        this._lastPointer = null;
    }

    onPointerMove(pointerEvent) {
        const structure = this.context.editorContext.activeComposition.structure;
        if (!structure || !pointerEvent.worldPosition) {
            return;
        }
        const top = pointerEvent.pickedBrick && pointerEvent.pickedBrick.normal
            && pointerEvent.pickedBrick.normal.y > 0.5 && pointerEvent.pickedBrick.point
            ? pointerEvent.pickedBrick.point
            : null;
        let position = this._positionService.calculateStructureGround(
            top || pointerEvent.worldPosition,
            this.context.editorContext.settings
        );
        if (top) {
            position = this._restOnTop(structure, position);
        }
        // Kept so a turn can work out where it rests again.
        this._lastPointer = pointerEvent;
        this._lastPosition = position;
        this._showPreview(structure, position);
    }

    onPointerDown() {
        const preview = this.context.editorContext.compositionPreview;
        if (!preview.visible || !preview.structure) {
            return;
        }
        if (!preview.valid) {
            // See PlacementTool#onPointerDown: a blocked click is said and heard.
            this.context.editorContext.notePlacementBlocked?.('structure');
            return;
        }
        this._commit(preview.structure, preview.position, preview.rotation);
    }

    onKeyDown(keyEvent) {
        if (!keyEvent || typeof keyEvent.key !== 'string') {
            return;
        }
        const key = keyEvent.key.toLowerCase();
        if (key === 'escape') {
            this._cancel();
            return;
        }
        if (key !== 'r') {
            return;
        }
        const structure = this.context.editorContext.activeComposition.structure;
        if (!structure) {
            return;
        }
        const delta = keyEvent.modifiers?.shift ? -90 : 90;
        this._rotation = ((this._rotation + delta) % 360 + 360) % 360;
        // A turn changes the footprint, so where it rests is worked out again.
        if (this._lastPointer) {
            this.onPointerMove(this._lastPointer);
            return;
        }
        // See PlacementTool#onKeyDown: the turn applies even with nothing hovered.
        if (this._lastPosition) {
            this._showPreview(structure, this._lastPosition);
        }
    }

    // The structure's box with its current turn, in its own space (its
    // position at the origin).
    _localBox(structure) {
        const registry = this.context.registry;
        return boxOfBricks(transformStructureBricks(structure, { rotation: this._rotation }), (id) => (registry ? registry.get(id) : null));
    }

    // Raised onto the tallest brick under its footprint.
    _restOnTop(structure, position) {
        const registry = this.context.registry;
        const box = this._localBox(structure);
        if (!box || !registry) return position;
        const placed = {
            minX: box.minX + position.x, maxX: box.maxX + position.x,
            minY: box.minY + position.y, maxY: box.maxY + position.y,
            minZ: box.minZ + position.z, maxZ: box.maxZ + position.z
        };
        const bricks = this.context.world.getBuildings().flatMap((building) => building.getBricks());
        const lift = restingLift(placed, bricks, (id) => registry.get(id));
        return lift > 0 ? new Position(position.x, position.y + lift, position.z) : position;
    }

    _showPreview(structure, position) {
        const world = this.context.world;
        const registry = this.context.registry;
        const resolver = this.context.structureResolver;
        const box = this._localBox(structure);
        const localBounds = box
            ? new SpatialBounds({ min: { x: box.minX, y: box.minY, z: box.minZ }, max: { x: box.maxX, y: box.maxY, z: box.maxZ } })
            : SpatialBounds.fromBricks(structure.bricks, registry);
        const valid = this._validator.canPlace(world, registry, resolver, { localBounds, position });
        if (this.context.compositionPreviewUseCase) {
            this.context.compositionPreviewUseCase.show(structure, position, this._rotation, valid);
        }
    }

    _commit(structure, position, rotation) {
        const world = this.context.world;
        const buildings = world.getBuildings();
        const useCase = this.context.copyStructureIntoDocumentUseCase;
        if (buildings.length === 0 || !useCase || !this.context.commandHistory) {
            this._cancel();
            return;
        }
        const command = useCase.execute(structure, {
            worldId: world.id,
            buildingId: buildings[0].id,
            world,
            registry: this.context.registry,
            transform: { position, rotation }
        });
        if (command) {
            this.context.commandHistory.execute(command);
        }
        if (this.context.compositionPreviewUseCase) {
            this.context.compositionPreviewUseCase.hide();
        }
        this._lastPosition = null;
        this._lastPointer = null;
    }

    _cancel() {
        this._finish();
    }

    _finish() {
        if (this.context.compositionPreviewUseCase) {
            this.context.compositionPreviewUseCase.hide();
        }
        this.context.editorContext.setActiveComposition(null);
        this.context.editorContext.setActiveTool(ToolId.SELECT);
        this._rotation = 0;
        this._lastPosition = null;
    }
}
