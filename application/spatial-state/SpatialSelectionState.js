import { Position } from '../../core/Position.js';

// Runtime-only state: what is currently selected in the spatial world?
// Not part of the ForkBuild Protocol; never serialized. Immutable:
// factories return new instances rather than mutating.
export class SpatialSelectionState {
    constructor({ type = null, documentId = null, items = [], position = null } = {}) {
        this._type = type;
        this._documentId = documentId;
        this._items = items; // [{ buildingId, brickId }]
        this._position = position; // World-space point of the primary click
    }

    get type() { return this._type; }
    get documentId() { return this._documentId; }
    get items() { return this._items; }
    get position() { return this._position; }

    get isEmpty() { return this._items.length === 0; }
    get isSingle() { return this._items.length === 1; }
    get count() { return this._items.length; }
    
    get primary() { return this._items.length > 0 ? this._items[0] : null; }
    get brickId() { return this.primary?.brickId || null; }
    get buildingId() { return this.primary?.buildingId || null; }

    contains(brickId) {
        return this._items.some(item => item.brickId === brickId);
    }

    static empty() {
        return new SpatialSelectionState();
    }

    static fromHit(hit, currentSelection = null, toggle = false) {
        if (hit.type === 'ground') {
            return new SpatialSelectionState({
                type: 'ground',
                documentId: hit.documentId,
                position: hit.point
            });
        }

        const newItem = { brickId: hit.brickId, buildingId: hit.buildingId };

        if (toggle && currentSelection && currentSelection.documentId === hit.documentId) {
            const isSelected = currentSelection.contains(hit.brickId);
            const newItems = isSelected
                ? currentSelection.items.filter(i => i.brickId !== hit.brickId)
                : [...currentSelection.items, newItem];
            
            return new SpatialSelectionState({
                type: newItems.length > 0 ? 'brick' : null,
                documentId: hit.documentId,
                items: newItems,
                position: hit.point
            });
        }

        return new SpatialSelectionState({
            type: 'brick',
            documentId: hit.documentId,
            items: [newItem],
            position: hit.point
        });
    }
}
