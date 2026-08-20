import { EditorEvent } from '../core/events/EditorEvent.js';

const HIGHLIGHT_COLOR = 0x4488ff;
const NO_HIGHLIGHT_COLOR = 0x000000;

// The renderer's first overlay layer. WorldRenderer's job is World ->
// Meshes; this is Selection -> Visual Highlight, kept deliberately
// separate — selection isn't part of rendering the world, it's an editor
// overlay on top of it. Later overlays (hover, placement preview,
// measurement) follow this same shape: subscribe to an editor event,
// touch only rendering state, never touch the World.
//
// Version 0.1 approach: emissive color on the selected mesh's own
// material. No OutlinePass, no post-processing, no EffectComposer —
// unnecessary complexity for this milestone. Trade-off worth knowing:
// this mutates a mesh owned/created by BrickRenderer rather than adding a
// separate overlay object, so it's not a "true" overlay layer yet in the
// sense of a visually independent object — just the simplest thing that
// looks right. A future pass could replace this with an actual outline
// mesh layered on top, without SelectionRenderer's public shape changing.
//
// 0.2.91 — World Instance Editing & Placement Management. A structure-
// placement selection highlights EVERY mesh belonging to that instance
// (renderer/PlacementMeshRegistry.js, optional constructor param), the
// same emissive technique applied to a whole set of meshes instead of
// one brick's — "selecting an instance selects its spatial reference,"
// visually: the WHOLE house glows, never one brick of it. Tracking
// switched from a Set<brickId> to a Set<mesh> so clear() can unhighlight
// both categories uniformly without needing two parallel bookkeeping
// structures.
export class SelectionRenderer {
    constructor(meshRegistry, placementMeshRegistry = null) {
        this._meshRegistry = meshRegistry;
        this._placementMeshRegistry = placementMeshRegistry;
        this._highlightedMeshes = new Set();
        this._subscription = null;
    }

    subscribe(editorEventBus) {
        this._subscription = editorEventBus.subscribe(
            EditorEvent.SELECTION_CHANGED,
            ({ selection }) => this._onSelectionChanged(selection)
        );
    }

    unsubscribe() {
        if (this._subscription) {
            this._subscription.unsubscribe();
            this._subscription = null;
        }
    }

    highlight(brickId) {
        this._highlightMesh(this._meshRegistry.getMesh(brickId));
    }

    // 0.2.91 — highlights every mesh belonging to one StructurePlacement.
    highlightPlacement(placementId) {
        if (!this._placementMeshRegistry) {
            return;
        }
        for (const mesh of this._placementMeshRegistry.getMeshes(placementId)) {
            this._highlightMesh(mesh);
        }
    }

    clear() {
        for (const mesh of this._highlightedMeshes) {
            if (mesh && mesh.material && mesh.material.emissive) {
                mesh.material.emissive.setHex(NO_HIGHLIGHT_COLOR);
            }
        }
        this._highlightedMeshes.clear();
    }

    _highlightMesh(mesh) {
        if (!mesh || !mesh.material || !mesh.material.emissive) {
            return;
        }
        mesh.material.emissive.setHex(HIGHLIGHT_COLOR);
        this._highlightedMeshes.add(mesh);
    }

    _onSelectionChanged(selection) {
        this.clear();
        if (selection.isEmpty) {
            return;
        }
        if (selection.isStructurePlacementSelection) {
            this.highlightPlacement(selection.selectedPlacementId);
            return;
        }
        for (const brickId of selection.brickIds) {
            this.highlight(brickId);
        }
    }
}
