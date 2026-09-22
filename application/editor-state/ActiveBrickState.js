// Pure data: which brick definition is currently "loaded" for placement —
// what the Brick Palette (0.1.12) will set and the Placement Tool (0.1.13)
// will read. null means nothing is selected to place yet.
//
// color: Choose Your Brick Color — an optional 0xRRGGBB override chosen
// in the palette for the NEXT bricks placed of this type; null means "use
// this definition's own default color" (BrickDefinition#color). Reset to
// null whenever a different brick type is selected (see
// EditorContext.setActiveBrick()) — a color choice belongs to "what I'm
// about to place," not a standing per-type preference that would follow
// you to an unrelated brick.
export class ActiveBrickState {
    constructor(definitionId = null, color = null) {
        this._definitionId = definitionId;
        this._color = color;
    }

    get definitionId() {
        return this._definitionId;
    }

    get color() {
        return this._color;
    }
}
