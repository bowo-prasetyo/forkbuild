// Pure data: which brick definition is currently "loaded" for placement —
// what the Brick Palette (0.1.12) will set and the Placement Tool (0.1.13)
// will read. null means nothing is selected to place yet.
export class ActiveBrickState {
    constructor(definitionId = null) {
        this._definitionId = definitionId;
    }

    get definitionId() {
        return this._definitionId;
    }
}
