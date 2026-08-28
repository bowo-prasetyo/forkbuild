import { PublicationObservationArchive } from './PublicationObservationArchive.js';
import { describePublicationObservationArchive } from './PublicationObservationArchiveView.js';
import { describePublicationObservationArchiveProvenance } from './PublicationObservationArchiveProvenanceView.js';
import { describePublicationObservationArchiveFingerprint } from './PublicationObservationArchiveFingerprintView.js';

// 0.8.86 — Non-Replacing External Publication Archive Inspection.
//
// 0.8.82 taught this codebase to carry a `PublicationObservationArchive`
// out of one browser and into another, as a file. 0.8.84/0.8.85 taught it
// to name, and compare, that archive's own deterministic identity. Neither
// ever answered the question a person actually has the moment a
// fingerprint comparison reports `DIFFERENT`: what, in plain terms, does
// that OTHER archive actually contain? Today the only way to find out is
// application/PublicationObservationArchiveExport.js's own
// `importPublicationObservationArchive()` — which REPLACES the current
// archive to find out. This file is the missing, safer step in between:
//
//   external JSON (a file, a paste — never yet imported)
//        │
//        │  THIS FILE — validate, reconstruct, project
//        ▼
//   inspectPublicationObservationArchive()
//        │
//        ▼
//   { outcome, inspection }             ── an EPHEMERAL, read-only result
//                                            never written to storage,
//                                            never assigned over the
//                                            current archive
//
// INSPECT ≠ IMPORT — THE ONE DISTINCTION THIS MILESTONE EXISTS TO DRAW.
// `inspectPublicationObservationArchive()` never touches, reads, or
// returns the CURRENT `PublicationObservationArchive` a caller already
// holds — it is a pure function of the EXTERNAL payload alone, exactly
// mirroring `exportPublicationObservationArchive()`/
// `importPublicationObservationArchive()`'s own "never touches storage
// itself" restraint one file over. Unlike `importPublicationObservationArchive()`,
// nothing here ever becomes the active archive: there is no
// `confirmXxxInspection()` counterpart to
// `confirmPublicationArchiveImport()`, because inspecting never has
// anything left to confirm — see ui/views/DecentralizedPublicationsView.js
// for the one place this codebase wires the two functions to two entirely
// separate cards, neither calling the other.
//
// PROVENANCE IS READ AS RECORDED, NEVER RELABELED. `importPublicationObservationArchive()`
// deliberately stamps every fact `IMPORTED` via `withUniformProvenance()`
// (0.8.83) — correct for an archive about to become THIS replica's own.
// Inspection reconstructs the external archive with plain `fromJSON()`
// instead, the identical faithful round trip storage/
// LocalStoragePublicationObservationArchive.js already relies on — so the
// LOCAL/IMPORTED counts an inspection reports are the external archive's
// OWN recorded provenance, from ITS OWN replica's perspective, exactly as
// its own export produced it. Relabeling those counts to `IMPORTED` here
// would answer a different, wrong question — "what would this look like
// after I imported it?" — when the question this milestone exists to
// answer is "what does this archive already say about itself?"
//
// A PURE COMPOSITION OF ALREADY-EXISTING PROJECTIONS — NO NEW COUNTING
// LOGIC, NO SEMANTIC DIFFERENCE OF ANY KIND. Every number in an inspection
// result comes from calling application/PublicationObservationArchiveView.js's
// own `describePublicationObservationArchive()`, application/
// PublicationObservationArchiveProvenanceView.js's own
// `describePublicationObservationArchiveProvenance()`, and application/
// PublicationObservationArchiveFingerprintView.js's own
// `describePublicationObservationArchiveFingerprint()` — UNCHANGED, over
// the externally supplied archive instead of the current one. This file
// invents no second summary algorithm, and computes nothing that requires
// a SECOND archive — no diff, no "only in this archive," no "newer,"
// no merge preview. Comparing two archives' own facts is explicitly left
// for a later, separately sized milestone — see docs/Roadmap.md, 0.8.86,
// "Deliberately excluded."
//
// `bitcoinAnchorIds`/`ipfsPublicationRecordIndexes`/`baseTransactionHashes`
// ARE IDENTITY LISTS, NOT EVIDENCE. They name which `anchorId`s, which
// IPFS record positions, and (0.8.97/0.8.99) which Base `txid`s this
// archive holds ANY fact for — the same explicit-identity discipline
// application/BitcoinAnchorObservationArchiveView.js's own header already
// holds (anchorId, never contentHash or txid) — extended here to also
// include application/BitcoinAnchorPublicationRecord.js's own identity
// records (which that 0.8.79 file predates), Base's own
// `baseTransactionInclusionObservationsByTransactionHash` keys (0.8.97),
// and application/BaseAnchorPublicationRecord.js's own identity records
// (0.8.99). None of the three lists carries a confirmation count, a
// chain-placement comparison, or a consistency finding; an inspection is a
// structural index, not a derived evidence bundle.
//
// THE RESULT IS A PLAIN, FROZEN, ONE-LEVEL DATA SHAPE — NEVER A NEW
// DOMAIN OBJECT, NEVER ANOTHER DURABLE ARCHIVE HISTORY. Deliberately NOT a
// `PublicationObservationArchiveInspectionRecord` class, and never held
// anywhere a caller's own state could accidentally persist it across a
// reload — see ui/views/DecentralizedPublicationsView.js's own "Inspect
// External Archive" card, which keeps its inspection result in the exact
// same kind of page-local, non-persisted `ref()` its own "Exported
// Archive" preview already uses, and clears it on every new file choice.
//
// MALFORMED INPUT IS `INVALID_ARCHIVE`, NEVER A SILENT EMPTY INSPECTION —
// mirrors `importPublicationObservationArchive()`'s own identical
// restraint, for the identical reason: silently treating an unreadable
// file as "an archive with nothing in it" would be misleading, not
// graceful.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO CAPABILITY OF
// ANY KIND. `inspectPublicationObservationArchive()` reads no clock,
// writes nothing to storage, and performs no network operation — calling
// it twice on byte-identical input produces a byte-identical result. It
// never mutates the payload it is given, and — being a pure function of
// that payload alone — has no way to reach, let alone mutate, whatever
// archive a caller currently has active.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No automatic comparison
// against the current archive (0.8.85's own explicit "Compare" click is
// the one place that already happens, on demand, over a fingerprint —
// never wired to this card). No archive diffing, merging, synchronization,
// conflict resolution, or record-level reconciliation. No automatic
// import, replacement, or "Replace Current Archive" button on this card —
// that stays exactly where 0.8.82 already put it, behind its own explicit
// confirmation. No "newer," "better," "more complete," or any other
// classification of one archive relative to another. No network retrieval
// of any kind — the external archive is always a file already chosen, or
// text already pasted, never fetched. See docs/Roadmap.md, 0.8.86,
// "Deliberately excluded," for the complete list.
export const PublicationObservationArchiveInspectionOutcome = Object.freeze({
    INSPECTED: 'inspected',
    INVALID_ARCHIVE: 'invalid-archive'
});

// `payload` may be either the parsed JSON value itself, or the raw text of
// a file/clipboard paste a caller has not yet parsed — mirroring
// application/PublicationObservationArchiveExport.js's own
// `importPublicationObservationArchive()` contract exactly. Returns a
// frozen `{ outcome, inspection }`:
//
//   INSPECTED       — `inspection` is a plain, frozen structural summary
//                      of the external archive (see this file's own
//                      header for its exact shape and provenance).
//   INVALID_ARCHIVE — `inspection` is `null`. The payload was not valid
//                      JSON, or did not satisfy
//                      `PublicationObservationArchive`'s own strict
//                      `fromJSON()` contract — the identical check
//                      `importPublicationObservationArchive()` already
//                      performs, unchanged.
//
// Never throws. Touches no storage, network, wallet, or credential of any
// kind, and never reads or returns whatever archive a caller currently has
// active — a pure, synchronous function of `payload` alone.
export function inspectPublicationObservationArchive(payload) {
    const json = typeof payload === 'string' ? parseJSONOrNull(payload) : payload;
    if (!PublicationObservationArchive.isValidJSON(json)) {
        return Object.freeze({ outcome: PublicationObservationArchiveInspectionOutcome.INVALID_ARCHIVE, inspection: null });
    }
    const externalArchive = PublicationObservationArchive.fromJSON(json);
    return Object.freeze({
        outcome: PublicationObservationArchiveInspectionOutcome.INSPECTED,
        inspection: describeExternalArchiveInspection(externalArchive)
    });
}

function describeExternalArchiveInspection(archive) {
    const summary = describePublicationObservationArchive(archive);
    const provenance = describePublicationObservationArchiveProvenance(archive);
    const fingerprint = describePublicationObservationArchiveFingerprint(archive);

    return Object.freeze({
        schemaVersion: PublicationObservationArchive.SCHEMA_VERSION,

        publicationCount: summary.publicationCount,
        observationCount: summary.observationCount,
        ipfsPublicationCount: summary.ipfsPublicationCount,
        ipfsVerificationCount: summary.ipfsVerificationCount,
        bitcoinBroadcastCount: summary.bitcoinBroadcastCount,
        bitcoinConfirmationCount: summary.bitcoinConfirmationCount,
        bitcoinContentProofCount: summary.bitcoinContentProofCount,
        bitcoinAnchorPublicationRecordCount: archive.bitcoinAnchorPublicationRecordCount,
        baseTransactionInclusionObservationCount: summary.baseTransactionInclusionCount,
        baseAnchorPublicationRecordCount: archive.baseAnchorPublicationRecordCount,

        localFactCount: provenance.localFactCount,
        importedFactCount: provenance.importedFactCount,
        totalFactCount: provenance.totalFactCount,

        archiveImportCount: provenance.archiveImportCount,

        fingerprint: fingerprint.fingerprint,
        fingerprintAlgorithm: fingerprint.algorithm,

        bitcoinAnchorIds: Object.freeze(collectBitcoinAnchorIds(archive)),
        ipfsPublicationRecordIndexes: Object.freeze(archive.ipfsPublicationRecords.map((record, index) => index)),
        baseTransactionHashes: Object.freeze(collectBaseTransactionHashes(archive))
    });
}

// Every distinct `anchorId` the archive holds ANY Bitcoin fact for — a
// broadcast, a confirmation observation, a content-proof observation, or a
// durable publication-identity record — in first-seen order across those
// four collections, never re-sorted. Mirrors application/
// BitcoinAnchorObservationArchiveView.js's own `collectAnchorIds()`
// exactly, extended to also include `bitcoinAnchorPublicationRecords`
// (0.8.80), which that 0.8.79 file predates. Deliberately duplicated
// rather than imported: importing that file's own
// `describeBitcoinAnchorObservationArchive()` would pull in chain-placement
// comparisons and consistency findings for every anchor — derived
// EVIDENCE this structural inspection deliberately never computes.
function collectBitcoinAnchorIds(archive) {
    const seen = new Set();
    const anchorIds = [];
    function collect(ids) {
        for (const anchorId of ids) {
            if (!seen.has(anchorId)) {
                seen.add(anchorId);
                anchorIds.push(anchorId);
            }
        }
    }
    collect(archive.bitcoinBroadcastRecords.map((record) => record.anchorId));
    collect(Object.keys(archive.bitcoinConfirmationObservationsByAnchorId));
    collect(Object.keys(archive.bitcoinContentProofObservationsByAnchorId));
    collect(archive.bitcoinAnchorPublicationRecords.map((record) => record.anchorId));
    return anchorIds;
}

// 0.8.99 — every distinct `txid` the archive holds ANY Base fact for — an
// inclusion observation history (0.8.97) or a durable publication-identity
// record — in first-seen order across those two collections, never
// re-sorted. Mirrors `collectBitcoinAnchorIds()` above exactly, one chain
// over Base's own already-established `txid`-only correlation key (see
// application/BaseAnchorPublicationRecord.js's own header, "No `anchorId`
// field").
function collectBaseTransactionHashes(archive) {
    const seen = new Set();
    const txids = [];
    function collect(ids) {
        for (const txid of ids) {
            if (!seen.has(txid)) {
                seen.add(txid);
                txids.push(txid);
            }
        }
    }
    collect(Object.keys(archive.baseTransactionInclusionObservationsByTransactionHash));
    collect(archive.baseAnchorPublicationRecords.map((record) => record.txid));
    return txids;
}

function parseJSONOrNull(text) {
    try {
        return JSON.parse(text);
    } catch (error) {
        return null;
    }
}
