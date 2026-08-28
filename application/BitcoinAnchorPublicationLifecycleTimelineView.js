import { composeBitcoinAnchorObservationEvidence } from './BitcoinAnchorObservationEvidence.js';
import { describeBitcoinAnchorObservationEvidence } from './BitcoinAnchorObservationEvidenceView.js';
import { observeBitcoinAnchorChainPlacementChanges } from './BitcoinAnchorChainPlacementObserver.js';
import { analyzeBitcoinAnchorObservationConsistency } from './BitcoinAnchorObservationConsistencyAnalyzer.js';
import { PublicationObservationArchive } from './PublicationObservationArchive.js';
import { findBitcoinAnchorPublicationRecordByAnchorId } from './BitcoinAnchorPublicationRecordHistory.js';

// 0.8.81 — Bitcoin Anchor Publication Lifecycle Timeline.
//
// application/BitcoinAnchorPublicationRecord.js (0.8.80) gives this replica
// a durable IDENTITY for one Bitcoin anchor publication attempt.
// application/BitcoinAnchorObservationEvidenceView.js (0.8.78) already puts
// that identity's five independent facts SIDE BY SIDE, under their own
// section headings. Neither one answers the plain question a person asking
// "what happened to THIS publication, and in what order?" actually has.
// This file is that one, single, chronological read — scoped to exactly
// ONE publication record, from its own creation onward:
//
//   BitcoinAnchorPublicationRecord (0.8.80, identity)
//        │
//        │  createdAt
//        ▼
//   Publication record created
//        │
//        ├──► broadcastObservations       (application/BitcoinAnchorBroadcastView.js)
//        ├──► confirmationObservations    (application/BitcoinAnchorConfirmationObservationHistoryView.js)
//        ├──► contentProofObservations    (application/BitcoinAnchorContentProofView.js)
//        ├──► chainPlacementObservations  (application/BitcoinAnchorChainPlacementObserver.js, 0.8.76)
//        └──► consistencyFindings         (application/BitcoinAnchorObservationConsistencyAnalyzer.js, 0.8.77)
//                    │
//                    ▼ describeBitcoinAnchorPublicationLifecycleTimeline()
//        one, chronologically sorted array of timeline entries
//
// A LIFECYCLE TIMELINE PRESENTS RECORDED FACTS IN TEMPORAL ORDER; IT DOES
// NOT INFER MISSING STAGES OR INTERPRET THEM. This is the one restraint
// this whole milestone exists to hold. A publication with no broadcast
// observation contributes no broadcast entry — never a fabricated
// "Broadcast missing" or "Broadcast failed" entry standing in for the
// absence. A publication whose UI session happened to pass through a
// "reviewed" or "signed" stage on its way to finalization contributes no
// entry for either — this file knows nothing about
// application/BitcoinAnchorReviewedSigningState.js or application/
// BitcoinAnchorSignedPsbtFinalizationState.js at all, because neither one
// is a durable, archived fact this replica keeps once a page reloads (see
// application/PublicationObservationArchive.js's own header on exactly
// which facts this codebase chose to make durable, and which it did not).
// Absence is simply absence of a recorded observation, exactly as
// application/PublicationObservationTimelineView.js's own header already
// held for a Bitcoin anchor with no `broadcastedAt` (0.8.74), extended
// here to every one of a publication's own five fact categories.
//
// A COMPOSITION OF ALREADY-ESTABLISHED PROJECTIONS, NEVER A NEW SOURCE OF
// TRUTH. `describeBitcoinAnchorPublicationLifecycleTimeline()` invents no
// new observation, state, or label of its own. It calls application/
// BitcoinAnchorChainPlacementObserver.js#observeBitcoinAnchorChainPlacementChanges()
// (0.8.76) and application/BitcoinAnchorObservationConsistencyAnalyzer.js#
// analyzeBitcoinAnchorObservationConsistency() (0.8.77) over the caller's
// own `confirmationObservations` — the identical two calls application/
// BitcoinAnchorDurableEvidenceView.js#reconstructBitcoinAnchorDurableEvidence()
// (0.8.79) already makes — then hands everything to application/
// BitcoinAnchorObservationEvidence.js#composeBitcoinAnchorObservationEvidence()
// (0.8.78) and application/BitcoinAnchorObservationEvidenceView.js#
// describeBitcoinAnchorObservationEvidence() (0.8.78), UNCHANGED. This
// file's own new work is exactly two things: (1) flattening those five
// already-described sections into one array of timeline entries, each
// carrying its own explicit `kind`, and (2) sorting that one array
// chronologically. No entry's own fields differ from what the composed,
// already-described evidence bundle already stated, except for the
// `kind`/`label`/`observedAt` this file adds to place it on a timeline.
//
// A STRONG IDENTITY CONSTRAINT: EVERY ENTRY CARRIES THE SAME anchorId,
// NEVER INFERRED FROM contentHash OR txid. `publicationRecord` is
// required and explicit; every entry this function returns is stamped
// with `publicationRecord.anchorId`, and every observation this function
// is handed is trusted to ALREADY belong to that one anchorId — this file
// performs no cross-checking of its own beyond that trust, exactly as
// application/BitcoinAnchorObservationEvidence.js's own header already
// requires of its own caller (0.8.78). A caller scoping observations by
// anything other than an explicit `anchorId` — a shared `contentHash`, a
// shared `txid` — is the one mistake this entire Bitcoin-domain lineage,
// since 0.8.78, exists to make impossible. See this file's own flagship
// test for the concrete two-publications-one-contentHash proof, one layer
// up from 0.8.78's and 0.8.80's own.
//
// TIMELINE ENTRY IDENTITY NEVER RELIES ON A TIMESTAMP ALONE. Every
// confirmation, broadcast, and content-proof entry carries the same
// 1-based `index` application/BitcoinAnchorObservationEvidence.js's own
// `composeBitcoinAnchorObservationEvidence()` already assigns it — its own
// position within THIS anchor's own array, never re-derived here. Two
// observations sharing an identical `observedAt` (down to the same
// millisecond) are never confused with each other because of it.
//
// DETERMINISTIC ORDERING, THE SAME PHILOSOPHY AS 0.8.73/0.8.74. Every
// entry is first built into one flat array in a fixed, reproducible
// source order — the publication record, then every broadcast
// observation (in its own array order), then every confirmation
// observation, then every content-proof observation, then every
// chain-placement comparison, then every consistency finding — and only
// THAT fixed-order array is ever sorted, with a stable sort that keeps
// that same relative order for anything tied on `observedAt`. None of
// `broadcastObservations`, `confirmationObservations`, or
// `contentProofObservations` is ever sorted, mutated, or reordered by
// this function — every value returned is a brand-new array. Calling this
// function twice on byte-identical input always returns a byte-identical
// result.
//
// A CHAIN-PLACEMENT COMPARISON OR CONSISTENCY FINDING HAS NO TIMESTAMP OF
// ITS OWN — application/BitcoinAnchorChainPlacementObserver.js's own
// `comparisons` and application/BitcoinAnchorObservationConsistencyAnalyzer.js's
// own `findings` compare a PAIR of confirmation observations, and carry
// no `observedAt` field. Each entry this file builds for one of those
// borrows the LATER of its two compared observations' own `observedAt` —
// the moment this replica held enough information to make that
// comparison at all — falling back to the single, earlier observation's
// own `observedAt` for the one, single-observation "not enough
// observations yet" comparison every confirmation history of length one
// already produces (0.8.76/0.8.77, unchanged). This is a PLACEMENT choice
// for this timeline alone; it never rewrites, backfills, or invents an
// `observedAt` field on the comparison or finding itself.
//
// PURE AND STATELESS: NO ARCHIVE ACCESS, NO NETWORK ACCESS, NO OBSERVER,
// NO VERIFIER, NO BROADCASTER, NO WALLET. `describeBitcoinAnchorPublicationLifecycleTimeline()`
// receives facts and projects them — it does not import
// storage/PublicationObservationArchive.js's own persistence adapter,
// does not import anything from anchoring/, and returns a brand-new,
// frozen result every call. `reconstructBitcoinAnchorPublicationLifecycleTimeline()`
// below is the ONE, thin, separate function in this file that reads an
// archive — mirroring application/BitcoinAnchorDurableEvidenceView.js's
// own "restoring a fact is not observing it again" restraint (0.8.79)
// exactly, one presentation layer up: it only ever reads whatever
// `archive` it is handed, and performs zero network operations.
//
// NO NEW DURABLE STATE. This milestone adds nothing to application/
// PublicationObservationArchive.js. A timeline is computed fresh, every
// time, from whatever the archive's own five pre-existing collections
// plus its 0.8.80 publication records already hold — destroying and
// restoring the archive can never change a timeline this file produces
// from the identical underlying facts.
//
// NO VERDICT VOCABULARY OF ANY KIND. There is no `status`, `confidence`,
// `health`, `trusted`, `valid`, `canonical`, `reliable`, `completed`,
// `successful`, `safe`, or `final` field anywhere in this file's output —
// every label an entry carries is exactly the same factual sentence
// application/BitcoinAnchorBroadcastView.js, application/
// BitcoinAnchorConfirmationObservationHistoryView.js, application/
// BitcoinAnchorContentProofView.js, application/
// BitcoinAnchorChainPlacementObservationView.js, and application/
// BitcoinAnchorObservationConsistencyView.js already produce, unchanged.
export const BitcoinAnchorPublicationLifecycleTimelineEntryKind = Object.freeze({
    PUBLICATION: 'publication',
    BROADCAST: 'broadcast',
    CONFIRMATION: 'confirmation',
    CONTENT_PROOF: 'content-proof',
    CHAIN_PLACEMENT: 'chain-placement',
    CONSISTENCY: 'consistency'
});

function observedAtMillis(entry) {
    return entry.observedAt instanceof Date ? entry.observedAt.getTime() : 0;
}

function publicationEntry(publicationRecord) {
    return Object.freeze({
        kind: BitcoinAnchorPublicationLifecycleTimelineEntryKind.PUBLICATION,
        observedAt: publicationRecord.createdAt,
        anchorId: publicationRecord.anchorId,
        index: null,
        label: 'Publication record created',
        contentHash: publicationRecord.contentHash,
        txid: publicationRecord.txid,
        network: publicationRecord.network
    });
}

function broadcastEntries(anchorId, section) {
    return section.observations
        .filter((entry) => entry.broadcastedAt instanceof Date)
        .map((entry) => Object.freeze({
            kind: BitcoinAnchorPublicationLifecycleTimelineEntryKind.BROADCAST,
            observedAt: entry.broadcastedAt,
            anchorId,
            index: entry.index,
            label: `Broadcast observation #${entry.index}`,
            state: entry.state,
            stateLabel: entry.stateLabel,
            txid: entry.txid,
            reason: entry.reason
        }));
}

function confirmationEntries(anchorId, section) {
    return section.observations
        .filter((entry) => entry.observedAt instanceof Date)
        .map((entry) => Object.freeze({
            kind: BitcoinAnchorPublicationLifecycleTimelineEntryKind.CONFIRMATION,
            observedAt: entry.observedAt,
            anchorId,
            index: entry.index,
            label: `Confirmation observation #${entry.index}`,
            state: entry.state,
            stateLabel: entry.stateLabel,
            txid: entry.txid,
            blockHash: entry.blockHash,
            blockHeight: entry.blockHeight,
            confirmationCount: entry.confirmationCount,
            reason: entry.reason
        }));
}

function contentProofEntries(anchorId, section) {
    return section.observations
        .filter((entry) => entry.observedAt instanceof Date)
        .map((entry) => Object.freeze({
            kind: BitcoinAnchorPublicationLifecycleTimelineEntryKind.CONTENT_PROOF,
            observedAt: entry.observedAt,
            anchorId,
            index: entry.index,
            label: `Content-proof observation #${entry.index}`,
            state: entry.state,
            stateLabel: entry.stateLabel,
            contentHash: entry.contentHash,
            reason: entry.reason
        }));
}

function laterOrOnlyObservedAt(previousBlock, laterBlock) {
    if (laterBlock && laterBlock.observedAt instanceof Date) return laterBlock.observedAt;
    if (previousBlock && previousBlock.observedAt instanceof Date) return previousBlock.observedAt;
    return null;
}

function chainPlacementEntries(anchorId, section) {
    return section.comparisons.map((comparison, i) => Object.freeze({
        kind: BitcoinAnchorPublicationLifecycleTimelineEntryKind.CHAIN_PLACEMENT,
        observedAt: laterOrOnlyObservedAt(comparison.previousBlock, comparison.laterBlock),
        anchorId,
        index: i + 1,
        label: `Chain-placement comparison #${i + 1}`,
        outcome: comparison.outcome,
        outcomeLabel: comparison.outcomeLabel,
        previousObservationIndex: comparison.previousObservationIndex,
        laterObservationIndex: comparison.laterObservationIndex,
        previousBlock: comparison.previousBlock,
        laterBlock: comparison.laterBlock
    }));
}

function consistencyEntries(anchorId, section) {
    return section.findings.map((finding, i) => Object.freeze({
        kind: BitcoinAnchorPublicationLifecycleTimelineEntryKind.CONSISTENCY,
        observedAt: laterOrOnlyObservedAt(finding.previousBlock, finding.laterBlock),
        anchorId,
        index: i + 1,
        label: `Consistency finding #${i + 1}`,
        state: finding.state,
        stateLabel: finding.stateLabel,
        finding: finding.finding,
        previousObservationIndex: finding.previousObservationIndex,
        laterObservationIndex: finding.laterObservationIndex,
        previousBlock: finding.previousBlock,
        laterBlock: finding.laterBlock
    }));
}

export function describeBitcoinAnchorPublicationLifecycleTimeline(
    publicationRecord,
    broadcastObservations = [],
    confirmationObservations = [],
    contentProofObservations = []
) {
    if (!publicationRecord || typeof publicationRecord.anchorId !== 'string' || !publicationRecord.anchorId) {
        return null;
    }
    const anchorId = publicationRecord.anchorId;
    const safeConfirmations = Array.isArray(confirmationObservations) ? confirmationObservations : [];

    const evidence = composeBitcoinAnchorObservationEvidence({
        anchorId,
        broadcastObservations: Array.isArray(broadcastObservations) ? broadcastObservations : [],
        confirmationObservations: safeConfirmations,
        contentProofObservations: Array.isArray(contentProofObservations) ? contentProofObservations : [],
        chainPlacementObservations: observeBitcoinAnchorChainPlacementChanges(safeConfirmations),
        consistencyFindings: analyzeBitcoinAnchorObservationConsistency(safeConfirmations)
    });
    const described = describeBitcoinAnchorObservationEvidence(evidence);

    const insertionOrder = [
        publicationEntry(publicationRecord),
        ...broadcastEntries(anchorId, described.broadcastObservations),
        ...confirmationEntries(anchorId, described.confirmationObservations),
        ...contentProofEntries(anchorId, described.contentProofObservations),
        ...chainPlacementEntries(anchorId, described.chainPlacementObservations),
        ...consistencyEntries(anchorId, described.consistencyFindings)
    ];

    const entries = insertionOrder
        .map((entry, sourceIndex) => ({ entry, sourceIndex }))
        .sort((a, b) => {
            const delta = observedAtMillis(a.entry) - observedAtMillis(b.entry);
            return delta !== 0 ? delta : a.sourceIndex - b.sourceIndex;
        })
        .map(({ entry }) => entry);

    return Object.freeze({ anchorId, count: entries.length, entries: Object.freeze(entries) });
}

// reconstructBitcoinAnchorPublicationLifecycleTimeline() — the ONE, thin
// archive-reading entry point, mirroring application/
// BitcoinAnchorDurableEvidenceView.js#reconstructBitcoinAnchorDurableEvidence()
// (0.8.79) exactly, one presentation layer up. It pulls one anchor's own
// publication record and its own three raw observation collections back
// out of `archive` and hands them, unchanged, to the pure function above.
// Returns `null` when no publication record exists for `anchorId` — a
// lifecycle timeline is scoped to an explicit, durable identity, never to
// an anchorId this replica merely happens to hold Bitcoin facts for (the
// identical "no record, no inspection" restraint application/
// BitcoinAnchorPublicationInspectionView.js's own header already holds,
// 0.8.80).
export function reconstructBitcoinAnchorPublicationLifecycleTimeline(archive, anchorId) {
    if (typeof anchorId !== 'string' || !anchorId) return null;
    const safeArchive = archive instanceof PublicationObservationArchive ? archive : PublicationObservationArchive.empty();

    const record = findBitcoinAnchorPublicationRecordByAnchorId(safeArchive.bitcoinAnchorPublicationRecords, anchorId);
    if (!record) return null;

    const broadcastObservations = safeArchive.bitcoinBroadcastRecords
        .filter((entry) => entry.anchorId === anchorId);
    const confirmationObservations = safeArchive.bitcoinConfirmationObservationsByAnchorId[anchorId] || [];
    const contentProofObservations = safeArchive.bitcoinContentProofObservationsByAnchorId[anchorId] || [];

    return describeBitcoinAnchorPublicationLifecycleTimeline(
        record, broadcastObservations, confirmationObservations, contentProofObservations
    );
}
