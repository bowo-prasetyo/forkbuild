import { Tool } from './Tool.js';
import { SpatialBounds } from '../../core/SpatialBounds.js';
import { StructurePlacementValidator } from '../StructurePlacementValidator.js';
import { PlaceStructureCommand } from '../commands/PlaceStructureCommand.js';
import { PlacementPositionService } from '../PlacementPositionService.js';

// The structure-placement counterpart to application/tools/PlacementTool.js
// — 0.2.90's "put this already-created structure here in the World."
// Pointer move -> read pointerEvent.worldPosition (already computed by
// InputDispatcher) -> snap -> StructurePreviewUseCase.show(). Pointer
// down -> StructurePlacementValidator -> PlaceStructureCommand ->
// CommandHistory.execute(). Renderer-ignorant throughout, exactly like
// PlacementTool.
//
// Deliberately a SEPARATE Tool class rather than a mode flag on
// PlacementTool: the two operations diverge at almost every step — what
// is being placed (a BrickDefinition lookup vs. a Document reference),
// what decides validity (exact-cell PlacementValidator vs. AABB
// StructurePlacementValidator), and what gets committed (PlaceBrickCommand
// vs. PlaceStructureCommand). Sharing PlacementPositionService's ground-
// snap math is the one thing that IS common, so that's what's shared —
// see PlacementPositionService#calculateStructureGround().
//
// context.structureResolver (application/StructureDocumentResolver.js)
// is required to resolve the active Document's bounds for the collision
// check and preview validity; a context built without one (an older
// ToolContext, or a test harness that doesn't need collision) degrades
// to "always valid" rather than throwing — the same graceful-absence
// posture renderer/WorldRenderer.js's own terrainHeightAt duck-typing
// already established elsewhere in this codebase.
//
// Stays active after a successful placement, exactly like PlacementTool
// stays in Place mode after committing a brick — "place House at A,
// place House at B" is the same repeated-click workflow as placing a
// row of the same brick, not a one-shot action that returns to Select.
export class StructurePlacementTool extends Tool {
    constructor(context) {
        super(context);
        this._validator = new StructurePlacementValidator();
        this._positionService = new PlacementPositionService(context.registry);
        this._rotation = 0;
        this._lastPosition = null;
    }

    deactivate() {
        if (this.context.structurePreviewUseCase) {
            this.context.structurePreviewUseCase.hide();
        }
        this._rotation = 0;
        this._lastPosition = null;
    }

    onPointerMove(pointerEvent) {
        const active = this.context.editorContext.activeStructure;
        if (!active.documentId || !pointerEvent.worldPosition) {
            this._hide();
            return;
        }

        const position = this._positionService.calculateStructureGround(
            pointerEvent.worldPosition,
            this.context.editorContext.settings
        );

        this._lastPosition = position;
        this._showPreview(active, position);
    }

    onPointerDown() {
        const preview = this.context.editorContext.structurePreview;
        if (!preview.visible || !preview.documentId) {
            return;
        }
        if (!preview.valid) {
            return;
        }

        const world = this.context.world;
        const command = new PlaceStructureCommand({
            worldId: world.id,
            documentId: preview.documentId,
            position: preview.position,
            rotation: preview.rotation
        });
        this.context.commandHistory.execute(command);
        this._hide();
        this._lastPosition = null;
    }

    onKeyDown(keyEvent) {
        if (!keyEvent || typeof keyEvent.key !== 'string' || keyEvent.key.toLowerCase() !== 'r') {
            return;
        }
        const active = this.context.editorContext.activeStructure;
        if (!active.documentId || !this._lastPosition) {
            return;
        }
        const delta = keyEvent.modifiers?.shift ? -90 : 90;
        this._rotation += delta;
        this._showPreview(active, this._lastPosition);
    }

    // Shared by onPointerMove() (a fresh position) and onKeyDown() (the
    // same cached position, a new rotation) — one place computes
    // validity and calls StructurePreviewUseCase, matching
    // PlacementTool#_showPreview()'s own reasoning exactly.
    _showPreview(active, position) {
        const world = this.context.world;
        const registry = this.context.registry;
        const resolver = this.context.structureResolver;
        const placedWorld = resolver ? resolver.resolve(active.documentId) : null;
        const valid = placedWorld
            ? this._validator.canPlace(world, registry, resolver, {
                localBounds: SpatialBounds.fromWorld(placedWorld, registry),
                position
            })
            : true;
        if (this.context.structurePreviewUseCase) {
            this.context.structurePreviewUseCase.show(
                active.documentId, active.title, position, this._rotation, valid
            );
        }
    }

    _hide() {
        if (this.context.structurePreviewUseCase) {
            this.context.structurePreviewUseCase.hide();
        }
        this._lastPosition = null;
    }
}
