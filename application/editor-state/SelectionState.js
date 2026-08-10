// Pure data: which brick(s), if any, are currently selected, and which
// building they belong to. The state stores application-level references,
// never Brick objects, so it can grow toward collaboration/persistence.
export class SelectionState {
    constructor({ brickId = null, buildingId = null, items = null } = {}) {
        this._items = items
            ? items.map((item) => ({ ...item }))
            : (brickId && buildingId ? [{ type: 'brick', brickId, buildingId }] : []);
    }

    get brickId() { return this.primary ? this.primary.brickId : null; }
    get buildingId() { return this.primary ? this.primary.buildingId : null; }
    get items() { return this._items.map((item) => ({ ...item })); }
    get primary() { return this._items.length > 0 ? { ...this._items[this._items.length - 1] } : null; }
    get isEmpty() { return this._items.length === 0; }
    get isSingle() { return this._items.length === 1; }
    get brickIds() { return this._items.filter((item) => item.type === 'brick').map((item) => item.brickId); }

    toggle(brickId, buildingId) {
        const exists = this._items.some((item) => item.brickId === brickId && item.buildingId === buildingId);
        return new SelectionState({
            items: exists
                ? this._items.filter((item) => !(item.brickId === brickId && item.buildingId === buildingId))
                : [...this._items, { type: 'brick', brickId, buildingId }]
        });
    }

    equals(other) {
        return other instanceof SelectionState
            && JSON.stringify(this._items) === JSON.stringify(other.items);
    }

    static empty() { return new SelectionState(); }
}
