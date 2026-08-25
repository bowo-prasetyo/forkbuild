import { PublicationSnapshotPlacement } from '../core/PublicationSnapshotPlacement.js';
import { validatePublicationSnapshotPlacement } from './PublicationSnapshotPlacementValidator.js';

// 0.8.18 — Decentralized Snapshot Placement Foundation.
//
// The one place this codebase turns a placement record into a cataloged
// PublicationSnapshotPlacement, mirroring application/
// AddPublicationAnchorUseCase.js (0.8.2). Deliberately a TWO-step
// discipline:
//
//   1. validate  — application/PublicationSnapshotPlacementValidator.js
//                   (is this even a well-formed
//                   PublicationSnapshotPlacement envelope?)
//   2. construct — a real core/PublicationSnapshotPlacement.js instance
//
//   → catalog    — application/
//                   LocalPublicationSnapshotPlacementCatalog.js#add()
//
// No signature check and no call to application/
// SnapshotPlacementResolver.js anywhere in this class. That mirrors
// application/AddPublicationAnchorUseCase.js's own restraint exactly:
// this foundation milestone builds no peer transport for placements yet
// (see docs/Roadmap.md) — a future exchange that DOES verify a signature
// at its own import boundary is explicitly sized as its own future
// milestone. Until that transport exists, this use case only ever
// answers "is this envelope well-formed enough to keep a record of" —
// never "is this genuinely signed" and never "does the locator actually
// work."
export class AddPublicationSnapshotPlacementUseCase {
    constructor(catalog) {
        if (!catalog) {
            throw new Error('AddPublicationSnapshotPlacementUseCase: a placement catalog is required');
        }
        this._catalog = catalog;
    }

    // Runs the two-step discipline described in this class's own header
    // and, on success, catalogs the resulting PublicationSnapshotPlacement.
    // Returns `{ placement, isNew }` — see application/
    // LocalPublicationSnapshotPlacementCatalog.js#add()'s own header for
    // what `isNew` means. Throws a PublicationSnapshotPlacementError for
    // a structurally malformed envelope; never throws for one that is
    // well-formed but unsigned, forged, or otherwise unverifiable — that
    // judgment belongs entirely to application/
    // SnapshotPlacementResolver.js, never to this class.
    execute(placementJson) {
        validatePublicationSnapshotPlacement(placementJson);
        const placement = PublicationSnapshotPlacement.fromJSON(placementJson);
        return this._catalog.add(placement);
    }
}
