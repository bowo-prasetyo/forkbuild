// Runtime-only state: what is currently selected in the spatial world?
// Not part of the ForkBuild Protocol; never serialized. Immutable:
// factories return new instances rather than mutating.
//
// As of 0.1.45 the selection contract is explicit:
//   brick(hit)          -> replace selection
//   toggleBrick(hit)    -> toggle brick (Ctrl/Cmd-click)
//   addBrick(hit)       -> union-add brick (Shift-click, additive marquee)
// Selection gestures produce ZERO history entries — selection is session
// state, never a document mutation.
//
// 0.2.93 — World View Instance Inspection adds a FOURTH kind, `placement`
// (static placement() below), mirroring application/editor-state/
// SelectionState.js's own `structure-placement` item — "selecting an
// instance selects its spatial reference, not its constituent content."
// Deliberately kept OUT of the `items` array machinery above (which is
// brick-shaped: dedup keys off buildingId:brickId, every item forced to
// `type: 'brick'`) — a placement selection is always exactly one
// reference, never mixed with a brick selection, so it gets its own
// ctor field, the same way `position` already does for a ground
// selection. The empty `items` array this produces is not an oversight:
// it is what makes SelectionBoundsService#calculate() return null for a
// placement selection, which is what keeps the transform gizmo and every
// SpatialEditingService mutation (move/rotate/delete) a no-op for it
// with no special-casing needed anywhere in that pipeline — see
// docs/Principles.md, "Selection In World View Does Not Imply Editing
// Authority."
export class SpatialSelectionState {
    constructor({
        type = null,
        documentId = null,
        buildingId = null,
        brickId = null,
        placementId = null,
        position = null,
        items = null
    } = {}) {
        this._type = type;
        this._documentId = documentId;
        this._buildingId = buildingId;
        this._brickId = brickId;
        this._placementId = placementId;
        this._position = position;
        if (items) {
            const seen = new Set();
            const deduped = [];
            for (const item of items) {
                const key = `${item.buildingId}:${item.brickId}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    // FIX: Force the type property to match SelectionState behavior
                    deduped.push({ type: 'brick', ...item }); 
                }
            }
            this._items = deduped;
        } else {
            this._items = this._itemsFromLegacy({ type, buildingId, brickId });
        }
    }

    get type() {
        if (this._type) return this._type;
        if (this._items.length === 1) return this._items[0].type;
        return this._items.length > 1 ? 'bricks' : null;
    }
    get documentId() { return this._documentId; }
    get buildingId() { return this.primary ? this.primary.buildingId : this._buildingId; }
    get brickId() { return this.primary ? this.primary.brickId : this._brickId; }
    get position() { return this._position; }
    get items() { return this._items.map((item) => ({ ...item })); }
    get primary() { return this._items.length > 0 ? { ...this._items[this._items.length - 1] } : null; }
    get isEmpty() { return this.type === null; }
    get isSingle() { return this._items.length === 1; }
    get brickIds() { return this._items.filter((item) => item.type === 'brick').map((item) => item.brickId); }

    // 0.2.93 — mirrors application/editor-state/SelectionState.js's own
    // isStructurePlacementSelection/selectedPlacementId exactly, one
    // rung up: World View picking (WorldNavigationSession#pick()) reads
    // these two to know whether to route a hit through the read-only
    // inspection path instead of the brick/ground one.
    get isStructurePlacementSelection() { return this.type === 'placement'; }
    get placementId() { return this._placementId; }

    includesBrick(buildingId, brickId) {
        return this._items.some((item) => item.type === 'brick' && item.buildingId === buildingId && item.brickId === brickId);
    }

    toggleBrick({ documentId, buildingId, brickId }) {
        const targetDocId = documentId || this._documentId;
        
        if (this._documentId && targetDocId && this._documentId !== targetDocId) {
            return SpatialSelectionState.brick({ documentId: targetDocId, buildingId, brickId });
        }
        
        const exists = this.includesBrick(buildingId, brickId);
        const items = exists
            ? this._items.filter((item) => !(item.type === 'brick' && item.buildingId === buildingId && item.brickId === brickId))
            : [...this._items, { type: 'brick', buildingId, brickId }];
            
        return SpatialSelectionState.bricks({ documentId: targetDocId, items });
    }

    // Union-add (0.1.45): Shift-click and additive marquee. Adding a
    // brick that is already selected changes nothing; crossing documents
    // restarts the selection in the new document (single-document rule).
    // Union-add (0.1.45): Shift-click and additive marquee.
    // Update the addBrick method similarly
    addBrick({ documentId, buildingId, brickId }) {
        // If documentId is omitted, fall back to the current selection's documentId
        const targetDocId = documentId || this._documentId;
        
        if (this._documentId && targetDocId && this._documentId !== targetDocId) {
            return SpatialSelectionState.brick({ documentId: targetDocId, buildingId, brickId });
        }
        
        if (this.includesBrick(buildingId, brickId)) {
            return this; // Return same instance, do not grow
        }
        
        return SpatialSelectionState.bricks({
            documentId: targetDocId,
            items: [...this._items, { type: 'brick', buildingId, brickId }]
        });
    }
    
    static empty() { return new SpatialSelectionState(); }

    static brick({ documentId, buildingId, brickId, point }) {
        return new SpatialSelectionState({
            type: 'brick', documentId, buildingId, brickId, position: point,
            items: [{ type: 'brick', buildingId, brickId }]
        });
    }

    static bricks({ documentId, items }) {
        // FIX: Force type instead of filtering, to match SelectionState behavior
        const normalized = (items || []).filter(item => item).map(item => ({ type: 'brick', ...item }));
        
        // Marquee/select-all/select-group paths can propose duplicates;
        // membership is a set, so dedupe here (keep first occurrence,
        // last item stays primary).
        const seen = new Set();
        const deduped = [];
        for (const item of normalized) {
            const key = `${item.buildingId}:${item.brickId}`;
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            deduped.push(item);
        }
        if (deduped.length === 0) return SpatialSelectionState.empty();
        return new SpatialSelectionState({
            type: deduped.length === 1 ? 'brick' : 'bricks',
            documentId,
            buildingId: deduped[deduped.length - 1].buildingId,
            brickId: deduped[deduped.length - 1].brickId,
            items: deduped
        });
    }

    static ground(position) {
        return new SpatialSelectionState({ type: 'ground', position });
    }

    // 0.2.93 — a single StructurePlacement instance, picked whole (see
    // this class's own header). `documentId` is the HOST document — the
    // World that CONTAINS the placement — never the placement's own
    // `documentId` (the Document it references); that distinction
    // matters because World View can have many documents streamed in at
    // once, each with its own StructurePlacements.
    static placement({ documentId, placementId }) {
        return new SpatialSelectionState({ type: 'placement', documentId, placementId });
    }

    _itemsFromLegacy({ type, buildingId, brickId }) {
        if (type === 'brick' && buildingId && brickId) {
            return [{ type: 'brick', buildingId, brickId }];
        }
        return [];
    }
}
