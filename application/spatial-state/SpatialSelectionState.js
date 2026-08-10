// Runtime-only state: what is currently selected in the spatial world?
// Not part of the ForkBuild Protocol; never serialized. Immutable:
// factories return new instances rather than mutating.
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
        this._items = items ? items.map((item) => ({ ...item })) : this._itemsFromLegacy({ type, buildingId, brickId });
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
        if (this._documentId && this._documentId !== documentId) {
            return SpatialSelectionState.brick({ documentId, buildingId, brickId });
        }
        const exists = this.includesBrick(buildingId, brickId);
        const items = exists
            ? this._items.filter((item) => !(item.type === 'brick' && item.buildingId === buildingId && item.brickId === brickId))
            : [...this._items, { type: 'brick', buildingId, brickId }];
        return SpatialSelectionState.bricks({ documentId, items });
     }
 
    static empty() { return new SpatialSelectionState(); }
 
    static brick({ documentId, buildingId, brickId, point }) {
        return new SpatialSelectionState({
            type: 'brick', documentId, buildingId, brickId, position: point,
            items: [{ type: 'brick', buildingId, brickId }]
        });
    }

    static bricks({ documentId, items }) {
        const normalized = (items || []).filter((item) => item && item.type === 'brick');
        if (normalized.length === 0) return SpatialSelectionState.empty();
        return new SpatialSelectionState({
            type: normalized.length === 1 ? 'brick' : 'bricks',
            documentId,
            buildingId: normalized[normalized.length - 1].buildingId,
            brickId: normalized[normalized.length - 1].brickId,
            items: normalized
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
