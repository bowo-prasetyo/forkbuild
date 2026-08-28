import { PublicationObservationArchive } from './PublicationObservationArchive.js';
import { describePublicationObservationArchive } from './PublicationObservationArchiveView.js';
import { describePublicationObservationArchiveProvenance } from './PublicationObservationArchiveProvenanceView.js';
import { describePublicationObservationArchiveDifference } from './PublicationObservationArchiveDifference.js';

// 0.8.88 — Explicit Publication Archive Replacement Review.
//
// 0.8.82 gave this codebase an explicit, confirmation-gated way to REPLACE
// the current archive. 0.8.84 through 0.8.87 gave it, separately, a way to
// NAME an archive's identity, COMPARE that identity to another, INSPECT an
// external archive without touching the current one, and DESCRIBE exactly
// which durable facts and provenance tags the two disagree about. Nothing
// so far connected those two halves: a person could inspect and diff an
// external archive all day, but "Replace Current Archive" itself still
// knew nothing about any of it. This file is that connective layer, and
// only that:
//
//   currentArchive              externalArchive
//   (already held)               (0.8.86's own reconstruction —
//        │                        never touched by this file directly)
//        └─────────────┬──────────────┘
//                      ▼
//   describePublicationObservationArchiveReplacementReview()
//                      │
//                      ▼
//   { currentFingerprint, externalFingerprint, same,
//     difference,                    (0.8.87, reused whole)
//     current: { facts, provenance },   (both sides' own already-existing
//     external: { facts, provenance } }  projections, unchanged)
//
// A REVIEW, NEVER A RECONCILIATION. This file composes existing
// information; it creates no new interpretation of it. "Review" is the
// deliberate word, not "reconciliation": this codebase has no authority to
// decide which of two differing archives should win, and this function
// computes nothing that would let it. It answers "what would explicit
// replacement change?" — never "should replacement happen?" See
// docs/Principles.md, "An Archive Fingerprint Identifies Durable Contents;
// It Does Not Establish Their Truth Or Origin (0.8.84)," "A Fingerprint
// Comparison Establishes Equality Of Digests, Not Which Archive Is Correct
// (0.8.85)," "Inspecting An External Archive Never Touches The Current One
// (0.8.86)," and "Archive Differences Describe Durable State Differences
// Without Selecting A Correct State (0.8.87)" — all four held here once
// more, one layer over the specific moment a person is deciding whether to
// click "Replace Current Archive."
//
// A PURE COMPOSITION OF ALREADY-EXISTING PROJECTIONS — NO NEW COUNTING
// LOGIC, NO NEW DIFFING LOGIC, NO NEW FINGERPRINTING. `difference` is
// exactly application/PublicationObservationArchiveDifference.js's own
// `describePublicationObservationArchiveDifference()` result, embedded
// whole — `currentFingerprint`/`externalFingerprint`/`same` at this file's
// own top level are read directly off THAT result, never recomputed a
// second time. `current`/`external` are each a plain composition of
// application/PublicationObservationArchiveView.js's own
// `describePublicationObservationArchive()` and application/
// PublicationObservationArchiveProvenanceView.js's own
// `describePublicationObservationArchiveProvenance()`, over their own
// respective archive — the identical two functions application/
// PublicationObservationArchiveInspection.js's own
// `describeExternalArchiveInspection()` already calls for the external
// side alone; this file calls the SAME two functions for BOTH sides,
// invents nothing further.
//
// NO VOCABULARY THAT TURNS A COUNT INTO A VERDICT. This file's own result
// never says "better," "newer," "more complete," "correct," "stale,"
// "recommended," "safe," "trusted," or "verified" — not as a field, not as
// a computed flag. "External archive: 9 observations; current archive: 7
// observations" is a fact this file reports; "external archive contains
// more observations" is already an interpretation this file refuses to
// phrase, let alone compute a boolean for. A caller (a UI, a person) is
// free to read the numbers and judge for itself — this file supplies no
// judgment of its own to read instead.
//
// BOTH ARGUMENTS MUST BE ACTUAL `PublicationObservationArchive` INSTANCES
// — NO DUCK TYPING, NO JSON PARSING. Mirrors application/
// PublicationObservationArchiveDifference.js's own strict, throwing
// contract exactly, for the identical reason: a caller here already holds
// two real archive instances (the current archive, always; the external
// one, already reconstructed by 0.8.86's own inspection flow) — there is
// nothing honest this function could do with anything else. This file
// performs no reconstruction of its own.
//
// THE RESULT IS A PLAIN, FROZEN, EPHEMERAL PROJECTION — NEVER A NEW
// DURABLE DOMAIN OBJECT, NEVER PERSISTED. A review is derived from two
// archives that already exist; if either changes, the review is simply
// recomputed. This file introduces no
// `PublicationObservationArchiveReplacementReviewHistory`, writes nothing
// to storage, and holds no field in `PublicationObservationArchive.js`'s
// own schema.
//
// A REVIEW NEVER REPLACES ANYTHING. This function has no side effect on
// either archive it is given, and no path — direct or indirect — to
// `publicationObservationArchive.value` or any other durable store.
// Replacement stays exactly where 0.8.82 already put it: behind
// `importPublicationObservationArchive()`/`recordPublicationObservationArchiveImport()`,
// fired only by a person's own explicit "Replace Current Archive" click.
// This milestone adds no second replacement implementation — no
// `reviewAndReplaceArchive()` that secretly parses, validates, restamps
// provenance, persists, and replaces in one call. Reviewing, and
// replacing, remain two separate actions, exactly as inspecting and
// importing already are (0.8.86's own "INSPECT != IMPORT").
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO CAPABILITY OF
// ANY KIND. `describePublicationObservationArchiveReplacementReview()`
// reads no clock, performs no import, and never mutates either archive it
// is given. Calling it twice with byte-identical arguments returns a
// byte-identical result.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No archive merging,
// synchronization, or automatic replacement of any kind — "Replace Current
// Archive" stays an explicit, separate, person-initiated action this file
// never calls. No recommendation, confidence score, or "safe to replace"
// classification. No ephemeral-until-confirmed bookkeeping of its own —
// the external archive a caller passes here was never assigned anywhere
// durable by 0.8.86's own inspection, and this file introduces no place
// where it would start being. No network-based archive retrieval, peer
// exchange, signed archives, or blockchain notarization. See
// docs/Roadmap.md, 0.8.88, "Deliberately excluded," for the complete list.
export function describePublicationObservationArchiveReplacementReview(currentArchive, externalArchive) {
    if (!(currentArchive instanceof PublicationObservationArchive)) {
        throw new Error('describePublicationObservationArchiveReplacementReview() requires a PublicationObservationArchive as currentArchive');
    }
    if (!(externalArchive instanceof PublicationObservationArchive)) {
        throw new Error('describePublicationObservationArchiveReplacementReview() requires a PublicationObservationArchive as externalArchive');
    }

    const difference = describePublicationObservationArchiveDifference(currentArchive, externalArchive);

    return Object.freeze({
        currentFingerprint: difference.currentFingerprint,
        externalFingerprint: difference.externalFingerprint,
        same: difference.same,

        difference,

        current: describeReplacementReviewSide(currentArchive),
        external: describeReplacementReviewSide(externalArchive)
    });
}

// One archive's own factual and provenance counts, read entirely from
// this codebase's own two existing projections — never a third counting
// pass over `archive`'s own collections. Mirrors application/
// PublicationObservationArchiveInspection.js's own field selection for
// the external side; applied here identically to both sides.
function describeReplacementReviewSide(archive) {
    const summary = describePublicationObservationArchive(archive);
    const provenance = describePublicationObservationArchiveProvenance(archive);

    return Object.freeze({
        publicationCount: summary.publicationCount,
        observationCount: summary.observationCount,
        ipfsPublicationCount: summary.ipfsPublicationCount,
        ipfsVerificationCount: summary.ipfsVerificationCount,
        bitcoinBroadcastCount: summary.bitcoinBroadcastCount,
        bitcoinConfirmationCount: summary.bitcoinConfirmationCount,
        bitcoinContentProofCount: summary.bitcoinContentProofCount,
        bitcoinAnchorPublicationRecordCount: archive.bitcoinAnchorPublicationRecordCount,

        localFactCount: provenance.localFactCount,
        importedFactCount: provenance.importedFactCount,
        totalFactCount: provenance.totalFactCount,
        archiveImportCount: provenance.archiveImportCount
    });
}
