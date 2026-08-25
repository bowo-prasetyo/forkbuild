import { AnchorAcquisitionKind } from './AnchorAcquisitionKind.js';

// 0.8.17 — Evidence Provenance & Observation Boundary.
//
// application/PublicationAnchorDetailView.js's own restraint, applied to
// an AnchorKnowledgeRecord instead of a PublicationAnchor: pure,
// synchronous, side-effect-free, and it never imports application/
// LocalAnchorKnowledgeStore.js. Turns a record (or its absence) into the
// exact, deliberately understated wording this milestone's own
// docs/Roadmap.md entry calls for — "Learned via peer exchange," never
// "Source: Alice ✓." See that file's own design note on why naming a
// peer here would misread as an authority claim.
const ACQUISITION_LABELS = Object.freeze({
    [AnchorAcquisitionKind.LOCAL]: 'Learned locally',
    [AnchorAcquisitionKind.PACKAGE]: 'Learned via package import',
    [AnchorAcquisitionKind.PEER]: 'Learned via peer exchange'
});

// `record`: an application/AnchorKnowledgeRecord.js instance, or null —
// null is an entirely ordinary result (see application/
// LocalAnchorKnowledgeStore.js#get()'s own header on why an anchor can
// be cataloged with no corresponding knowledge record), never treated as
// an error here. Returns a flat, UI-ready shape; never throws.
export function describeAnchorKnowledge(record) {
    if (!record) {
        return {
            known: false,
            acquisitionKind: null,
            acquisitionLabel: 'Local knowledge unavailable',
            firstSeenAt: null,
            firstSeenAtLabel: null
        };
    }
    return {
        known: true,
        acquisitionKind: record.acquisition.kind,
        acquisitionLabel: ACQUISITION_LABELS[record.acquisition.kind] || 'Learned by an unrecognized means',
        firstSeenAt: record.firstSeenAt.toISOString(),
        firstSeenAtLabel: 'First seen by this replica'
    };
}
