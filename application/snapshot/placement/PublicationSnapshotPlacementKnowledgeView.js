import { PlacementAcquisitionKind } from '../../placement/PlacementAcquisitionKind.js';
import { message } from '../../../core/Message.js';

// 0.8.24 — Snapshot Placement Provenance & Observation Boundary.
//
// application/anchoring/PublicationAnchorKnowledgeView.js's own restraint (0.8.17),
// applied to a SnapshotPlacementKnowledgeRecord instead of an
// AnchorKnowledgeRecord: pure, synchronous, side-effect-free, and it
// never imports application/placement/LocalPlacementKnowledgeStore.js. Turns a
// record (or its absence) into the exact, deliberately understated
// wording this milestone calls for — "Learned via peer exchange," never
// "Source: Alice ✓," and never a word resembling "trust," "reliability,"
// "confidence," or "rank." See that file's own design note on why naming
// a peer here would misread as an authority claim.
const ACQUISITION_LABELS = Object.freeze({
    [PlacementAcquisitionKind.LOCAL]: message('publicationSnapshotPlacementKnowledge.learnedLocally'),
    [PlacementAcquisitionKind.PACKAGE]: message('publicationSnapshotPlacementKnowledge.learnedViaPackageImport'),
    [PlacementAcquisitionKind.PEER]: message('publicationSnapshotPlacementKnowledge.learnedViaPeerExchange')
});

// `record`: an application/snapshot/placement/SnapshotPlacementKnowledgeRecord.js instance,
// or null — null is an entirely ordinary result (see application/
// LocalPlacementKnowledgeStore.js#get()'s own header on why a placement
// can be cataloged with no corresponding knowledge record), never
// treated as an error here. Returns a flat, UI-ready shape; never throws.
export function describePlacementKnowledge(record) {
    if (!record) {
        return {
            known: false,
            acquisitionKind: null,
            acquisitionLabel: message('publicationSnapshotPlacementKnowledge.localKnowledgeUnavailable'),
            firstSeenAt: null,
            firstSeenAtLabel: null
        };
    }
    return {
        known: true,
        acquisitionKind: record.acquisition.kind,
        acquisitionLabel: ACQUISITION_LABELS[record.acquisition.kind] || message('publicationSnapshotPlacementKnowledge.learnedUnrecognized'),
        firstSeenAt: record.firstSeenAt.toISOString(),
        firstSeenAtLabel: message('publicationSnapshotPlacementKnowledge.firstSeenByThisReplica')
    };
}
