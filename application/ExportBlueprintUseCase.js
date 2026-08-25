import { Structure } from '../core/Structure.js';
import { buildBlueprintPackage } from './BlueprintPackage.js';

// 0.4.6 — Blueprint Sharing & Exchange. The smallest possible use case
// wrapping application/BlueprintPackage.js's own buildBlueprintPackage(),
// mirroring the "one execute(), one job" shape every other Structure use
// case here already follows (application/ForkStructureUseCase.js,
// application/CreateStructureFromSelectionUseCase.js). Pure observation —
// no persistence, no file I/O, no UI. What the caller does with the
// returned package (write it to a file, copy it to a clipboard, hand it
// to a test) is deliberately none of this class's business, the same
// restraint CreateStructureFromSelectionUseCase's own header applies to
// where its Structure ends up.
//
// 0.6.6 — Decentralized Blueprint Exchange. `attributions` is an
// OPTIONAL, additive second argument — a straight passthrough to
// buildBlueprintPackage()'s own new parameter (see that function's own
// header for the exact, deliberately-not-a-new-object shape). Every
// existing caller that only ever passed a Structure keeps working
// unchanged, producing exactly the package it always did.
//
// 0.6.8 — Blueprint Lineage & Revision Discovery. `lineageClaims` is the
// identical additive passthrough, one concept over.
//
// 0.8.7 — External Evidence Import & Publication Package Integration.
// `anchors` is the identical additive passthrough, one concept further —
// see application/BlueprintPackage.js's own header for why this stays a
// signed core/PublicationAnchor.js array, never a verification result.
//
// 0.8.22 — Snapshot Placement Package Integration. `placements` is the
// identical additive passthrough, one locator layer further — a signed
// core/PublicationSnapshotPlacement.js array, never a resolution result.
export class ExportBlueprintUseCase {
    execute(structure, { attributions = [], lineageClaims = [], anchors = [], placements = [] } = {}) {
        if (!structure || !(structure instanceof Structure)) {
            throw new Error('ExportBlueprintUseCase: a valid Structure is required');
        }
        return buildBlueprintPackage(structure, { attributions, lineageClaims, anchors, placements });
    }
}
