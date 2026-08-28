import { PublicationObservationArchive } from './PublicationObservationArchive.js';
import { describePublicationObservationTimeline } from './PublicationObservationTimelineView.js';

// 0.8.75 — Durable Publication Observation Records.
//
// application/PublicationObservationArchive.js (this milestone) holds the
// durable facts; this file is the read-only projection over it a UI
// actually renders — mirroring exactly how every `*HistoryView.js` file
// since 0.8.56 has separated a history's own storage shape from its own
// narration. `describePublicationObservationArchive()` never mutates the
// archive it is given, never appends to it, and performs zero network or
// storage operations of its own.
//
// A COMPOSITION OF THE EXISTING CROSS-DOMAIN PROJECTION, NOT A SECOND ONE.
// The `entries` this function returns are produced by calling application/
// PublicationObservationTimelineView.js's own
// `describePublicationObservationTimeline()` UNCHANGED, over
// `archive.toBitcoinAnchors()` (also unchanged from the archive's own
// method) and the archive's own IPFS collections — this file adds no
// second, competing chronological-merge algorithm. Restoring an archive
// from storage and opening its timeline uses the EXACT SAME projection
// code a live, never-persisted, in-memory session already used at 0.8.74
// — persistence changes where the facts came from, never how they are
// read back.
//
// EXACTLY TWO COUNTS, NEVER A THIRD, COMBINED ONE. `publicationCount` and
// `observationCount` are application/PublicationObservationArchive.js's
// own identically named getters, read through unchanged — see that
// file's own header for why a publication fact and an observation fact
// are never added into one number. This view adds per-domain breakdowns
// of each (`ipfsPublicationCount`, `bitcoinBroadcastCount`,
// `ipfsVerificationCount`, `bitcoinConfirmationCount`,
// `bitcoinContentProofCount`, and — 0.8.97 — `baseTransactionInclusionCount`)
// for a caller that wants more detail than the page-level "Publications: N
// / Observations: N" summary, but still never a `status`, `confidence`,
// `health`, `trusted`, `valid`, `canonical`, or `reliable` field of any
// kind, over any of them, individually or combined. See docs/Principles.md,
// "The UI Displays Observations; It Does Not Turn Them Into A Verdict
// (0.8.57)," held here once more for an archive's own summary counts.
//
// 0.8.97 — `baseTransactionInclusionCount` IS A SUMMARY COUNT ONLY; THE
// `entries` TIMELINE BELOW STAYS UNTOUCHED. Base transaction inclusion
// observations are NOT folded into `timeline`/`entries` below — this
// milestone deliberately answers only "can a Base observation survive
// restart and export/import," never "does it participate in the unified
// chronological timeline." See application/PublicationObservationArchive.js's
// own 0.8.97 header, and docs/Roadmap.md, 0.8.97, "Deliberately excluded,"
// for why `application/PublicationObservationTimelineView.js`'s own
// `describePublicationObservationTimeline()` is called with the identical
// IPFS/Bitcoin arguments it already took before this milestone — a Base
// collection intentionally never reaches it.
//
// A NON-ARCHIVE INPUT NEVER THROWS. `describePublicationObservationArchive()`
// treats anything that is not a genuine `PublicationObservationArchive`
// instance — `null`, `undefined`, a plain object — as
// `PublicationObservationArchive.empty()`, the identical "malformed input
// degrades to empty, never throws" restraint application/
// PublicationObservationArchive.js's own `fromJSON()` already holds one
// layer down.
//
// Pure and stateless: no constructor, no network access, no storage
// access, no history of its own. Calling this twice with the
// byte-identical archive returns a byte-identical result.
export function describePublicationObservationArchive(archive) {
    const safeArchive = archive instanceof PublicationObservationArchive ? archive : PublicationObservationArchive.empty();

    const ipfsPublicationCount = safeArchive.ipfsPublicationRecords.length;
    const bitcoinBroadcastCount = safeArchive.bitcoinBroadcastRecords.length;
    const ipfsVerificationCount = sumHistoryLengths(safeArchive.ipfsContentVerificationObservationsByRecordIndex);
    const bitcoinConfirmationCount = sumHistoryLengths(safeArchive.bitcoinConfirmationObservationsByAnchorId);
    const bitcoinContentProofCount = sumHistoryLengths(safeArchive.bitcoinContentProofObservationsByAnchorId);
    const baseTransactionInclusionCount = sumHistoryLengths(safeArchive.baseTransactionInclusionObservationsByTransactionHash);

    const timeline = describePublicationObservationTimeline({
        ipfs: {
            publicationRecords: safeArchive.ipfsPublicationRecords,
            verificationHistoriesByRecordIndex: safeArchive.ipfsContentVerificationObservationsByRecordIndex
        },
        bitcoin: {
            anchors: safeArchive.toBitcoinAnchors(),
            confirmationHistoriesByAnchorId: safeArchive.bitcoinConfirmationObservationsByAnchorId,
            proofObservationsByAnchorId: safeArchive.bitcoinContentProofObservationsByAnchorId
        }
    });

    return Object.freeze({
        publicationCount: safeArchive.publicationCount,
        observationCount: safeArchive.observationCount,
        ipfsPublicationCount,
        bitcoinBroadcastCount,
        ipfsVerificationCount,
        bitcoinConfirmationCount,
        bitcoinContentProofCount,
        baseTransactionInclusionCount,
        entryCount: timeline.count,
        entries: timeline.entries
    });
}

function sumHistoryLengths(byKey) {
    return Object.values(byKey).reduce((total, observations) => total + observations.length, 0);
}
