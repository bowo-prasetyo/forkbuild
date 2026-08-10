// Pure data: which brick (if any) is currently selected, and which
// building it belongs to. Deliberately mirrors PickingService's return
// shape ({ brickId, buildingId }) — Selection (0.1.11) is built directly
// on top of Picking, not a separate concept with its own shape.
// SelectionState (0.1.36): Now supports multiple items. 
// items: [{ brickId, buildingId }, ...]
export class SelectionState {
    constructor(items = []) {
        this._items = items;
    }

    get items() { return this._items; }

    get isEmpty() { return this._items.length === 0; }
    get isSingle() { return this._items.length === 1; }
    get count() { return this._items.length; }

    // Helper for single-item legacy code
    get primary() { return this._items.length > 0 ? this._items[0] : null; }
    get brickId() { return this.primary?.brickId || null; }
    get buildingId() { return this.primary?.buildingId || null; }

    contains(brickId) {
        return this._items.some(item => item.brickId === brickId);
    }

    equals(other) {
        if (!(other instanceof SelectionState) || this.count !== other.count) return false;
        return this._items.every((item, i) => 
            item.brickId === other.items[i].brickId && 
            item.buildingId === other.items[i].buildingId
        );
    }

    static empty() { return new SelectionState([]); }
    
    static single(brickId, buildingId) {
        return new SelectionState([{ brickId, buildingId }]);
    }
}
