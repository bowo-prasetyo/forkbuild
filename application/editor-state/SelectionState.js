// Pure data: which brick(s), if any, are currently selected, and which
// building they belong to. The state stores application-level references,
// never Brick objects, so it can grow toward collaboration/persistence.
//
// As of 0.1.45: toggle() implements Ctrl/Cmd-click, add() implements
// Shift-click and additive marquee (union — adding an already-selected
// brick changes nothing). Both are session state changes; neither is
// ever a history entry.
export class SelectionState {
    constructor({ brickId = null, buildingId = null, items = null } = {}) {
        const rawItems = items
            ? items.map((item) => ({ ...item }))
            : (brickId && buildingId ? [{ type: 'brick', brickId, buildingId }] : []);
        const seen = new Set();
        this._items = [];
        for (const item of rawItems) {
            const key = `${item.buildingId}:${item.brickId}`;
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            this._items.push(item);
        }
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

    add(brickId, buildingId) {
        const exists = this._items.some((item) => item.brickId === brickId && item.buildingId === buildingId);
        if (exists) {
            return this;
        }
        return new SelectionState({
            items: [...this._items, { type: 'brick', brickId, buildingId }]
        });
    }

    equals(other) {
        return other instanceof SelectionState
            && JSON.stringify(this._items) === JSON.stringify(other.items);
    }

    static empty() { return new SelectionState(); }
}
