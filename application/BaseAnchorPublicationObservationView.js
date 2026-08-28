import { describeBaseAnchorPublicationRecordHistoryEntry } from './BaseAnchorPublicationRecordHistoryView.js';
import { describeBaseTransactionInclusionObservationHistory } from './BaseTransactionInclusionObservationView.js';

// 0.8.100 — Publication Identity–Scoped Observation Correlation.
//
// The presentation layer for application/
// BaseAnchorPublicationObservation.js's own `describeBaseAnchorPublicationObservations()`
// — mirroring application/BitcoinAnchorObservationEvidenceView.js's own
// "compose existing describe functions, invent no new vocabulary" shape,
// one chain over:
//
//   describeBaseAnchorPublicationObservationProjection(projection)
//     -> { publication: { contentHash, txid, network, createdAt },
//          observations: { count, observations: [...] } }
//
// A COMPOSITION OF EXISTING VIEWS, NOT A NEW VOCABULARY. `publication` is
// exactly what application/BaseAnchorPublicationRecordHistoryView.js's own,
// already-independently-tested `describeBaseAnchorPublicationRecordHistoryEntry()`
// already produces (0.8.99); `observations` is exactly what application/
// BaseTransactionInclusionObservationView.js's own
// `describeBaseTransactionInclusionObservationHistory()` already produces
// (0.8.96). This file adds no label, no count, and no field beyond
// placing those two, already-established projections next to each other
// under one publication.
//
// NO AGGREGATE STATUS. There is no `status`, `confirmed`, `included`,
// `health`, `confidence`, or verdict field anywhere in this file's own
// output — see docs/Principles.md, "The UI Displays Observations; It Does
// Not Turn Them Into A Verdict (0.8.57)," held here once more, one layer
// up from application/BaseAnchorPublicationObservation.js's own identical
// restraint.
//
// PURE AND STATELESS. No constructor, no injected collaborator, no
// network access, no caching. Calling this function twice with
// byte-identical arguments returns a byte-identical result.
export function describeBaseAnchorPublicationObservationProjection(projection) {
    if (!projection) return null;

    return Object.freeze({
        publication: describeBaseAnchorPublicationRecordHistoryEntry(projection.publication),
        observations: describeBaseTransactionInclusionObservationHistory(projection.observations)
    });
}
