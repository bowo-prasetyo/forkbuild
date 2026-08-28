import { BaseAnchorPublicationRecord } from './BaseAnchorPublicationRecord.js';

// 0.8.100 — Publication Identity–Scoped Observation Correlation.
//
// 0.8.99 gave a Base publication its own durable IDENTITY
// (`BaseAnchorPublicationRecord`), and 0.8.96/0.8.97 already gave Base
// inclusion observations their own durable HISTORY
// (`baseTransactionInclusionObservationsByTransactionHash`, keyed by
// `txid`). Nothing in this codebase has ever connected the two — a caller
// holding one particular publication record has never had a direct way to
// ask "what observations exist FOR THIS ONE PUBLICATION," only "what
// observations exist in the archive, for this txid string I happen to be
// carrying separately." This file is that one, narrow connection:
//
//   BaseAnchorPublicationRecord
//               +
//   observationsByTransactionHash (baseTransactionInclusionObservationsByTransactionHash)
//               ↓
//   describeBaseAnchorPublicationObservations()
//               ↓
//   { publication, observations }   — THIS publication's own history, and
//                                      no other publication's
//
// THE CORRELATION KEY IS `publicationRecord.txid` — NEVER `contentHash`,
// AND NEVER TEMPORAL PROXIMITY. This is the one rule this file exists to
// enforce, extending docs/Principles.md, "Correlate Evidence By Explicit
// Identity, Never By Resemblance (0.8.78)," to the new publication-record
// layer 0.8.99 introduced. Two Base publication records can share an
// identical `contentHash` (the same content published twice, under two
// different transactions) — this file never groups, merges, or leaks
// observations between them on that basis. See tests/
// BaseAnchorPublicationObservation.test.js's own flagship section, which
// constructs exactly that scenario and proves neither publication's own
// observations ever appear under the other's projection.
//
// A PURE PROJECTION OF ALREADY-RECORDED OBSERVATIONS, NEVER A NEW SOURCE
// OF TRUTH. `describeBaseAnchorPublicationObservations()` invents nothing:
// every observation it returns is exactly the object
// `observationsByTransactionHash` already held under `publicationRecord.txid`
// — the same objects `application/
// BaseTransactionInclusionObservationHistory.js` already produced,
// reused unchanged, never recreated, relabeled, or given an altered
// meaning. It performs no network access, appends nothing to any archive,
// and returns a brand-new, frozen result every call — calling it twice
// with byte-identical arguments returns a byte-identical result.
//
// A MISSING HISTORY IS AN HONEST EMPTY LIST, NEVER AN ERROR OR A
// FABRICATED ENTRY. A publication whose own `txid` has no entry at all in
// `observationsByTransactionHash` — no "Observe Transaction" click has
// ever resolved for it — simply projects to `{ publication, observations:
// [] }`. This function never throws for that case; it throws only when
// `publicationRecord` itself is not a genuine `BaseAnchorPublicationRecord`,
// because a caller passing anything else has no publication identity to
// scope observations to in the first place.
//
// NO NEW VOCABULARY, NO AGGREGATE STATE, NO PERSISTENCE. This file adds no
// `status`, `confirmed`, `included`, `health`, `confidence`, or verdict
// field of any kind — see docs/Principles.md, "The UI Displays
// Observations; It Does Not Turn Them Into A Verdict (0.8.57)," held here
// once more. `observations` remains exactly what
// `BaseTransactionInclusionObservationHistory.js` already produced: a
// plain, chronological list of historical facts, never collapsed into one
// combined publication status. This function also never writes to
// `application/PublicationObservationArchive.js` — it only ever reads the
// two things it is handed.
export function describeBaseAnchorPublicationObservations(publicationRecord, observationsByTransactionHash) {
    if (!(publicationRecord instanceof BaseAnchorPublicationRecord)) {
        throw new Error(
            'describeBaseAnchorPublicationObservations: publicationRecord must be an actual '
            + 'BaseAnchorPublicationRecord — observations are never scoped to a bare txid string, '
            + 'a contentHash, or any other stand-in for an explicit publication identity'
        );
    }

    const byTxid = (observationsByTransactionHash && typeof observationsByTransactionHash === 'object')
        ? observationsByTransactionHash
        : {};
    const history = Array.isArray(byTxid[publicationRecord.txid]) ? byTxid[publicationRecord.txid] : [];

    return Object.freeze({
        publication: publicationRecord,
        observations: Object.freeze(history.slice())
    });
}
