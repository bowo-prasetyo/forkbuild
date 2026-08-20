// Pure data: which brick(s), if any, are currently selected, and which
// building they belong to. The state stores application-level references,
// never Brick objects, so it can grow toward collaboration/persistence.
//
// As of 0.1.45: toggle() implements Ctrl/Cmd-click, add() implements
// Shift-click and additive marquee (union — adding an already-selected
// brick changes nothing). Both are session state changes; neither is
// ever a history entry.
//
// 0.2.91 — World Instance Editing & Placement Management extends the
// item shape with a second kind: { type: 'structure-placement',
// placementId }, alongside the existing { type: 'brick', brickId,
// buildingId }. This is deliberately the SAME selection abstraction, not
// a parallel "structure selection system" — per the design conversation:
// "Selecting an instance selects its spatial reference, not its
// constituent content." A placement selection is always exactly one
// item: selecting a placement never mixes with a brick selection, the
// same way a placed structure's individual bricks are never individually
// pickable (renderer/WorldRenderer.js's own 0.2.90 header) — see
// isStructurePlacementSelection/selectedPlacementId below.
export class SelectionState {
    constructor({ brickId = null, buildingId = null, items = null } = {}) {
        const rawItems = items
            ? items.map((item) => ({ type: 'brick', ...item })) // Force type
            : (brickId && buildingId ? [{ type: 'brick', brickId, buildingId }] : []);
        const seen = new Set();
        this._items = [];
        for (const item of rawItems) {
            const key = item.type === 'structure-placement'
                ? `structure-placement:${item.placementId}`
                : `${item.buildingId}:${item.brickId}`;
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

    // 0.2.91 — true only for a single, whole-instance selection. A
    // placement selection is deliberately never part of a mixed or
    // multi-item selection (see the class header above), so checking
    // isSingle here is the whole rule, not a simplification of a richer
    // one.
    get isStructurePlacementSelection() {
        return this.isSingle && this._items[0].type === 'structure-placement';
    }

    get selectedPlacementId() {
        return this.isStructurePlacementSelection ? this._items[0].placementId : null;
    }

    toggle(brickIdOrObj, buildingId) {
        let bId, bldId;
        if (typeof brickIdOrObj === 'object' && brickIdOrObj !== null) {
            bId = brickIdOrObj.brickId;
            bldId = brickIdOrObj.buildingId;
        } else {
            bId = brickIdOrObj;
            bldId = buildingId;
        }
        const exists = this._items.some((item) => item.brickId === bId && item.buildingId === bldId);
        return new SelectionState({
            items: exists
                ? this._items.filter((item) => !(item.brickId === bId && item.buildingId === bldId))
                : [...this._items, { type: 'brick', brickId: bId, buildingId: bldId }]
        });
    }    
    
    add(brickId, buildingId) {
        const exists = this._items.some((item) => item.brickId === brickId && item.buildingId === buildingId);
        if (exists) {
            return this; // Return same instance, do not grow
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
