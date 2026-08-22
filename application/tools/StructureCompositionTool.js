import { Tool } from './Tool.js';
import { SpatialBounds } from '../../core/SpatialBounds.js';
import { StructurePlacementValidator } from '../StructurePlacementValidator.js';
import { PlacementPositionService } from '../PlacementPositionService.js';
import { ToolId } from '../editor-state/ToolId.js';

// 0.4.1 — Interactive Structure Composition UX: the "Copy Into
// Document" counterpart to application/tools/StructurePlacementTool.js,
// reusing that tool's exact shape (pointer move -> snap -> preview;
// pointer down -> validate -> commit; 'R'/'Shift+R' -> rotate) for a
// deliberately different operation — see docs/Roadmap.md, 0.4.1,
// "Interactive Structure Copy Preview": placing a StructurePlacement
// creates a live REFERENCE to another Document; composing a Structure
// flattens its bricks into the CURRENT document's own bricks, via
// exactly the ONE PasteBricksCommand
// application/CopyStructureIntoDocumentUseCase.js already produces
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
// application/StructureCompositionTransform.js#transformStructureBricks()
// (transitively, via CopyStructureIntoDocumentUseCase#execute()) — the
// preview is a visualization of the exact command that will run, never
// an approximation of it.
//
// Collision reuses application/StructurePlacementValidator.js exactly —
// the Structure's own AABB (SpatialBounds.fromBricks(structure.bricks,
// registry)) checked against the World's existing bricks and
// StructurePlacements, the same conservative "not rotated" posture that
// validator already applies to a StructurePlacement preview. Composing
// a Structure never creates a StructurePlacement, but colliding with
// one that's already there is still a real collision.
//
// A one-shot tool, unlike StructurePlacementTool: composing House once
// is "paste it," not "keep pasting Houses" — commit or Escape both
// return to Select, exactly like exiting a paste gesture, never leaving
// the editor camped in a placement mode after one composition lands.
export class StructureCompositionTool extends Tool {
    constructor(context) {
        super(context);
        this._validator = new StructurePlacementValidator();
        this._positionService = new PlacementPositionService(context.registry);
        this._rotation = 0;
        this._lastPosition = null;
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
    }

    onPointerMove(pointerEvent) {
        const structure = this.context.editorContext.activeComposition.structure;
        if (!structure || !pointerEvent.worldPosition) {
            return;
        }
        const position = this._positionService.calculateStructureGround(
            pointerEvent.worldPosition,
            this.context.editorContext.settings
        );
        this._lastPosition = position;
        this._showPreview(structure, position);
    }

    onPointerDown() {
        const preview = this.context.editorContext.compositionPreview;
        if (!preview.visible || !preview.structure || !preview.valid) {
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
        if (!structure || !this._lastPosition) {
            return;
        }
        const delta = keyEvent.modifiers?.shift ? -90 : 90;
        this._rotation = ((this._rotation + delta) % 360 + 360) % 360;
        this._showPreview(structure, this._lastPosition);
    }

    _showPreview(structure, position) {
        const world = this.context.world;
        const registry = this.context.registry;
        const resolver = this.context.structureResolver;
        const localBounds = SpatialBounds.fromBricks(structure.bricks, registry);
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
        this._finish();
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
