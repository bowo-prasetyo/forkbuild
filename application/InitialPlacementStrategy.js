import { computeDeterministicGridPosition } from '../core/DeterministicGridPlacement.js';

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
// 0.2.24: computePosition is now a PURE function of
// context.publicationId — see core/DeterministicGridPlacement.js for
// why. It no longer takes a discoveryProvider (nothing it does
// depends on what else this node has published or discovered), which
// is itself the point: the previous, count-based version was exactly
// the kind of locally-observed state a decentralized placement
// algorithm cannot depend on and still guarantee the same publication
// lands at the same coordinate on every replica.
//
// Only Grid is implemented. NextAvailable/Origin/UserSpecified are
// deliberately NOT built speculatively — an interface any of them
// could implement (computePosition(context)), added only when a real
// requirement asks for one.
export class GridPlacementStrategy {
    // `context.publicationId` is the just-created publication the
    // position is being chosen FOR.
    computePosition(context = {}) {
        return computeDeterministicGridPosition(context.publicationId);
    }
}
