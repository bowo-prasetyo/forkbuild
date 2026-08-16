import { Position } from './Position.js';
import { computeContentHash } from '../serializer/contentHash.js';

// 0.2.24: a pure, replica-agnostic mapping from a stable id (a
// Publication's own id) to an absolute grid position in shared world
// space.
//
// Before this milestone, GridPlacementStrategy computed a position from
// `discoveryProvider.list().length` — how many publications THIS LOCAL
// NODE happened to already know about. That is locally-observed state,
// not a fact about the publication itself, and two replicas that
// haven't converged yet (the normal, ongoing condition in a
// decentralized system, not an edge case) can each see a different
// count when independently placing two different publications for the
// first time — or the same count when placing two DIFFERENT
// publications, landing both at the same slot. Either way, "same
// publication -> same placement algorithm -> same absolute coordinate
// on every replica" — the property a shared world coordinate system
// actually requires — did not hold.
//
// This function restores that property the only way it can be
// restored without a consensus protocol: by depending on nothing but
// the id itself. computeContentHash (serializer/contentHash.js,
// already used for document/publication integrity) is reused here
// purely as a stable string->integer function — no cryptographic
// property is needed, only that the same string always produces the
// same output everywhere, which it already guarantees.
//
// GRID_EXTENT bounds the spread so placements land within an
// explorable region near the origin rather than scattered across the
// entire hash range. Two different ids CAN still land on the same
// cell — this function makes no attempt to detect or avoid that.
// Resolving collisions between independently-chosen positions is a
// deliberate non-goal here (see docs/Roadmap.md, "spatial allocation
// / collision policy") — determinism is the only property this
// milestone establishes.
const GRID_SPACING = 40;
const GRID_EXTENT = 64;

export function computeDeterministicGridPosition(id) {
    if (!id) {
        return new Position(0, 0, 0);
    }
    const hash = parseInt(computeContentHash(String(id)), 16);
    const col = hash % GRID_EXTENT;
    const row = Math.floor(hash / GRID_EXTENT) % GRID_EXTENT;
    return new Position(col * GRID_SPACING, 0, row * GRID_SPACING);
}
