import { SpatialSelectionState } from '../spatial-state/SpatialSelectionState.js';
import { SpatialHoverState } from '../spatial-state/SpatialHoverState.js';
import { SpatialInspectionState } from '../spatial-state/SpatialInspectionState.js';
import { SpatialEditingContext } from '../spatial-state/SpatialEditingContext.js';
import { AvatarInteractionState } from '../spatial-state/AvatarInteractionState.js';

// WorldNavigationSession picking, hover and selection. These drive focus and
// inspection, never mutation (see docs/Principles.md, "World View Observes
// and Navigates; Editor Mutates and Builds"). Placement mode, gizmo interaction and
// selection transforms (move/delete/rotate/align/distribute/snap/numeric) live
// in EditorSession.
export const selectionMethods = {
    // Avatar, placement and brick picks are separate raycasts; the nearest hit
    // wins, so an avatar in front of a wall is selectable. At most one of
    // {avatar target, brick/ground selection} is set at a time (see
    // docs/Principles.md, "Avatars Are Never Document Selection").
    // `toggle`/`additive` don't apply to avatars.
    pick(screenX, screenY, { toggle = false, additive = false } = {}) {
        if (!this._session) {
            return null;
        }
        const brickHit = this._session.pick(screenX, screenY);
        const avatarHit = typeof this._session.pickAvatar === 'function'
            ? this._session.pickAvatar(screenX, screenY)
            : null;
        // StructurePlacement meshes live in their own registry, so a placement hit
        // needs its own raycast, folded into the same nearest-wins comparison. A
        // facade without pickPlacement() never resolves one.
        const placementHit = typeof this._session.pickPlacement === 'function'
            ? this._session.pickPlacement(screenX, screenY)
            : null;

        if (avatarHit
            && (!brickHit || avatarHit.distance < brickHit.distance)
            && (!placementHit || avatarHit.distance < placementHit.distance)) {
            this._setAvatarInteraction(AvatarInteractionState.avatar(avatarHit.avatarId));
            this._setSpatialSelection(SpatialSelectionState.empty());
            this._session.clearSelection();
            this._session.clearHover();
            this._refreshGizmo();
            return this._avatarInteraction;
        }

        // A StructurePlacement is selected, never edited (see docs/Principles.md,
        // "Selection In World View Does Not Imply Editing Authority"). A `placement`
        // selection has no items, so no gizmo shows. `toggle`/`additive` are
        // ignored.
        if (placementHit && (!brickHit || placementHit.distance < brickHit.distance)) {
            const hostDocumentId = this._resolvePlacementHostDocumentId(placementHit.placementId);
            if (hostDocumentId) {
                this._setAvatarInteraction(AvatarInteractionState.empty());
                this._setSpatialSelection(SpatialSelectionState.placement({
                    documentId: hostDocumentId,
                    placementId: placementHit.placementId
                }));
                this._session.clearSelection();
                if (typeof this._session.selectPlacement === 'function') {
                    this._session.selectPlacement(placementHit.placementId);
                }
                this._session.clearHover();
                this._refreshInspection();
                this._refreshEditingContext();
                this._refreshGizmo();
                return this._spatialSelection;
            }
        }

        if (brickHit) {
            let nextSelection;
            if (additive) {
                nextSelection = this._spatialSelection.addBrick(brickHit);
            } else if (toggle) {
                nextSelection = this._spatialSelection.toggleBrick(brickHit);
            } else {
                nextSelection = SpatialSelectionState.brick(brickHit);
            }
            this._setAvatarInteraction(AvatarInteractionState.empty());
            this._setSpatialSelection(nextSelection);
            this._session.selectBricks(nextSelection.brickIds, nextSelection.brickId);
            this._session.clearHover();
            this._refreshInspection();
            this._refreshEditingContext();
            this._refreshGizmo();
            return this._spatialSelection;
        }
        const groundHit = this._session.pickGround(screenX, screenY);
        if (groundHit) {
            this._setAvatarInteraction(AvatarInteractionState.empty());
            this._setSpatialSelection(SpatialSelectionState.ground(groundHit.position));
            this._session.clearSelection();
            this._session.clearHover();
            this._refreshInspection();
            this._refreshEditingContext();
            this._refreshGizmo();
            return this._spatialSelection;
        }
        this._setAvatarInteraction(AvatarInteractionState.empty());
        this._setSpatialSelection(SpatialSelectionState.empty());
        this._session.clearSelection();
        this._session.clearHover();
        this._refreshInspection();
        this._refreshEditingContext();
        this._refreshGizmo();
        return null;
    },

    hover(screenX, screenY) {
        if (!this._session) {
            this._setSpatialHover(SpatialHoverState.empty());
            return null;
        }
        const brickHit = this._session.pick(screenX, screenY);
        if (brickHit) {
            const hover = SpatialHoverState.brick(brickHit);
            this._setSpatialHover(hover);
            this._session.hoverBrick(brickHit.brickId);
            return hover;
        }
        const groundHit = this._session.pickGround(screenX, screenY);
        if (groundHit) {
            const hover = SpatialHoverState.ground(groundHit.position);
            this._setSpatialHover(hover);
            this._session.clearHover();
            return hover;
        }
        this._setSpatialHover(SpatialHoverState.empty());
        this._session.clearHover();
        return null;
    },

    clearSelection() {
        this._setAvatarInteraction(AvatarInteractionState.empty());
        this._setSpatialSelection(SpatialSelectionState.empty());
        this._spatialInspection = SpatialInspectionState.empty();
        this._spatialEditingContext = SpatialEditingContext.empty();
        if (this._session) {
            this._session.clearSelection();
        }
        this._refreshGizmo();
        return true;
    },

    // Selects every brick in the selection's document, or the active document
    // (never the camera-focused one) when nothing is selected. A spatial
    // selection references exactly one document.
    selectAll() {
        const documentId = (!this._spatialSelection.isEmpty && this._spatialSelection.documentId)
            || this._activeDocumentId;
        const document = documentId ? this._loadedDocuments.get(documentId) : null;
        if (!document || !this._session) {
            return false;
        }
        const items = [];
        for (const building of document.world.getBuildings()) {
            for (const brick of building.getBricks()) {
                items.push({ type: 'brick', buildingId: building.id, brickId: brick.id });
            }
        }
        if (items.length === 0) {
            return false;
        }
        this._setSpatialSelection(SpatialSelectionState.bricks({ documentId, items }));
        this._session.selectBricks(items.map((item) => item.brickId), items[items.length - 1].brickId);
        this._refreshInspection();
        this._refreshEditingContext();
        this._refreshGizmo();
        return true;
    },

    marqueeSelect({ x0, y0, x1, y1 } = {}, { additive = false } = {}) {
        if (!this._session || typeof this._session.pickRectangle !== 'function') {
            return false;
        }
        const hits = this._session.pickRectangle(x0, y0, x1, y1) || [];
        const documentId = this._resolveMarqueeDocumentId(hits);
        if (!documentId) {
            if (!additive) {
                this.clearSelection();
            }
            return true;
        }

        let nextSelection = additive && this._spatialSelection.documentId === documentId
            ? this._spatialSelection
            : SpatialSelectionState.empty();
        for (const hit of hits) {
            if (!hit || hit.documentId !== documentId || !hit.buildingId || !hit.brickId) {
                continue;
            }
            nextSelection = nextSelection.addBrick(hit);
        }

        this._setSpatialSelection(nextSelection);
        this._session.selectBricks(nextSelection.brickIds, nextSelection.brickId);
        this._session.clearHover();
        this._refreshInspection();
        this._refreshEditingContext();
        this._refreshGizmo();
        return true;
    },

    getSelectionCount() {
        return this._spatialSelection.isEmpty ? 0 : this._spatialSelection.items.length;
    },

    setControlsEnabled(enabled) {
        if (!this._session || typeof this._session.setControlsEnabled !== 'function') {
            return false;
        }
        this._session.setControlsEnabled(enabled);
        return true;
    },

    // A real (non-ground, non-empty) selection makes its document active (see
    // docs/Principles.md, "Camera Focus, Active Document, and Selection Are
    // Three Different Things"). Every selection path funnels through this
    // setter, so the sync happens in one place.
    _setSpatialSelection(selection) {
        this._spatialSelection = selection;
        if (selection && !selection.isEmpty && selection.documentId) {
            this._activeDocumentId = selection.documentId;
        }
        this._refreshEditingContext();
        this._refreshInspection();
    },

    // PlacementMeshRegistry is keyed by placementId alone, so a pick returns
    // no document. With many documents streamed in, the hit is resolved back to
    // whichever World contains it. placementIds are unique per instance, so the
    // first match is the only one. Null if the document streamed out in
    // between.
    _resolvePlacementHostDocumentId(placementId) {
        for (const [documentId, document] of this._loadedDocuments) {
            if (document.world.getStructurePlacement(placementId)) {
                return documentId;
            }
        }
        return null;
    },

    _resolveMarqueeDocumentId(hits) {
        const firstHit = (hits || []).find((hit) => hit && hit.documentId);
        if (firstHit) {
            return firstHit.documentId;
        }
        if (!this._spatialSelection.isEmpty && this._spatialSelection.documentId) {
            return this._spatialSelection.documentId;
        }
        return this._activeDocumentId;
    },

    _setSpatialHover(hover) {
        this._spatialHover = hover;
    },

    // Minimal, unlike _setSpatialSelection: an avatar target is just an id
    // that getAvatarInfo() resolves on demand.
    _setAvatarInteraction(avatarInteraction) {
        this._avatarInteraction = avatarInteraction;
    },

    _refreshInspection() {
        if (!this._inspectionService) {
            this._spatialInspection = SpatialInspectionState.empty();
            return;
        }
        this._spatialInspection = this._inspectionService.inspect(this._spatialSelection);
    },

    // Permanently inert: World View has no editing kernel or gizmo (see
    // docs/Principles.md, "World View Observes and Navigates; Editor Mutates and
    // Builds"). Keeping these as no-ops is less invasive than removing their
    // many call sites; `_spatialEditingContext` stays empty, which is the
    // correct answer ("nothing is editable").
    _refreshEditingContext() {
        this._spatialEditingContext = SpatialEditingContext.empty();
    },

    _refreshGizmo() {}
};
