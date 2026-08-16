import { Position } from '../core/Position.js';

const GRID_SPACING = 40;

// 0.2.23: where does a freshly published world land, before anyone
// has chosen to move it? Before this milestone that question had an
// implicit answer buried inside WorldLayoutProvider's fallback-only
// grid math, recomputed fresh (and non-authoritatively) every time a
// position was needed. Making it an explicit strategy, called once at
// publish time to produce a REAL PlacementRecord, does two things:
// it stops "where is this world" from ever being answered by a
// silent recomputation (see docs/Principles.md, "Status is computed,
// not stored" — the same reasoning in reverse: a *position*, once
// assigned, is a fact that gets recorded, not a projection that gets
// re-derived), and it gives a future author-chosen or negotiated
// initial position somewhere to slot in without touching
// PlacementRecord itself.
//
// Only Grid is implemented — it reproduces WorldLayoutProvider's
// pre-existing fallback math exactly (same spacing, same 4-column
// wrap), so publications placed under this strategy land where the
// old fallback would already have shown them, and are now backed by a
// real, explicit, ownable PlacementRecord instead of a value
// recomputed from scratch on every lookup. NextAvailable/Origin/
// UserSpecified are deliberately NOT built speculatively — an
// interface any of them could implement (computePosition(context)),
// added only when a real requirement asks for one.
export class GridPlacementStrategy {
    constructor(discoveryProvider) {
        this._discoveryProvider = discoveryProvider;
    }

    // `context.publicationId` is the just-created publication the
    // position is being chosen FOR — included in the count so the
    // very first publication lands at the grid origin (index 0), not
    // one slot late.
    computePosition(context = {}) {
        const count = this._discoveryProvider ? this._discoveryProvider.list().length : 1;
        const index = Math.max(0, count - 1);
        const row = Math.floor(index / 4);
        const col = index % 4;
        return new Position(col * GRID_SPACING, 0, row * GRID_SPACING);
    }
}
