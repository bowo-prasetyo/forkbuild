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
export class SpatialSelectionState {
    constructor({
        type = null,
        documentId = null,
        buildingId = null,
        brickId = null,
        position = null,
        items = null
    } = {}) {
        this._type = type;
        this._documentId = documentId;
        this._buildingId = buildingId;
        this._brickId = brickId;
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

    _itemsFromLegacy({ type, buildingId, brickId }) {
        if (type === 'brick' && buildingId && brickId) {
            return [{ type: 'brick', buildingId, brickId }];
        }
        return [];
    }
}
