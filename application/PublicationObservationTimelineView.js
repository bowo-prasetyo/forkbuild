import {
    IpfsPublicationObservationTimelineEntryKind,
    describeIpfsPublicationObservationTimeline
} from './IpfsPublicationObservationTimelineView.js';
import { describeBitcoinAnchorBroadcast } from './BitcoinAnchorBroadcastView.js';
import { describeBitcoinAnchorConfirmationObservationHistory } from './BitcoinAnchorConfirmationObservationHistoryView.js';
import { describeBitcoinAnchorContentProof } from './BitcoinAnchorContentProofView.js';
import { describeBaseTransactionInclusionObservationHistory } from './BaseTransactionInclusionObservationView.js';

// 0.8.74 — Cross-Domain Publication Observation Timeline.
//
// application/IpfsPublicationObservationTimelineView.js (0.8.73) already
// merges TWO IPFS-only histories onto one chronological view. Bitcoin's own
// facts — application/BitcoinAnchorBroadcastView.js (0.8.64), application/
// BitcoinAnchorConfirmationObservationHistory.js (0.8.56), and application/
// BitcoinAnchorContentProofView.js (0.8.57) — have never appeared on the
// same view as IPFS's own facts at all. This file is that one level up:
//
//   IPFS timeline (0.8.73)              Bitcoin facts (0.8.56/0.8.57/0.8.64)
//     Publication #0 (T1)                 Broadcast          (T2)
//     Content verification #0 (T5)        Confirmation       (T6)
//                                          Content proof      (T7)
//                    │
//                    ▼ describePublicationObservationTimeline()
//   Cross-Domain Timeline
//     T1  IPFS      Publication #0
//     T2  Bitcoin   Broadcast
//     T5  IPFS      Content verification #0
//     T6  Bitcoin   Confirmation
//     T7  Bitcoin   Content proof
//
// UNIFY THE TIMELINE, NOT THE MEANINGS. This file merges WHEN facts were
// observed across the two domains onto one chronological read. It never
// merges WHAT the facts mean. There is no `status`, `confidence`, `health`,
// `trusted`, `valid`, `canonical`, or "publication health" field anywhere in
// this file's output — an IPFS `HASH_MATCH` and a Bitcoin `CONFIRMED` sit
// next to each other on the same list, each carrying its own domain's own
// vocabulary, unchanged, exactly as application/
// BitcoinAnchorProofReconciliationView.js's own header already holds for
// composing confirmation and content-proof observations side by side
// without scoring them (0.8.55), extended here one layer up, across two
// entirely different systems. See docs/Principles.md, "The UI Displays
// Observations; It Does Not Turn Them Into A Verdict (0.8.57)."
//
// A COMPOSITION OF EXISTING PROJECTIONS, NOT A NEW SOURCE OF TRUTH. Every
// IPFS entry is produced by calling application/
// IpfsPublicationObservationTimelineView.js's own
// describeIpfsPublicationObservationTimeline() unchanged — this file adds
// no IPFS-domain logic of its own, and no IPFS entry's own fields differ
// from what that function already returns except for one new `domain` tag.
// Every Bitcoin entry is produced by calling application/
// BitcoinAnchorBroadcastView.js#describeBitcoinAnchorBroadcast(),
// application/BitcoinAnchorConfirmationObservationHistoryView.js#
// describeBitcoinAnchorConfirmationObservationHistory(), and application/
// BitcoinAnchorContentProofView.js#describeBitcoinAnchorContentProof()
// unchanged, the identical restraint one domain over. This file's own new
// work is exactly two things: (1) tagging every entry with which domain it
// came from, and (2) placing the two domains' own already-described entries
// on one, stably sorted, chronological array.
//
// NO NEW GLOBAL IDENTITY SCHEME. application/
// IpfsPublicationRecord.js is deliberately narrow — no `id` of any kind —
// and identifies a publication record only by its own position
// (`recordIndex`) in a caller's own history array (see that file's own
// header). core/PublicationAnchor.js identifies a Bitcoin anchor by its own
// `id`/`anchorId` and `publicationId` — a completely separate identity
// scheme, native to a different domain. This file invents no third,
// unifying identity, and — the single most important restraint this
// milestone exists to hold — NEVER INFERS that an IPFS record and a
// Bitcoin anchor belong to the same publication because they happen to
// share an identical `contentHash`. Two different publications can easily
// carry byte-identical content (the flagship test proves exactly this),
// so a content-hash match is never evidence of shared identity on its own.
//
// Instead, EVERY Bitcoin anchor the caller passes in must carry its own
// EXPLICIT `recordIndex` — the exact index into `ipfs.publicationRecords`
// the caller itself already knows that anchor belongs to, or `null` when
// the caller has no such association to report. This file only ever reads
// and carries that field through unchanged; it is never computed, guessed,
// or derived from any other field on the anchor or the record. A caller
// with no real cross-domain association to report (most of this codebase's
// own UI, today — see ui/views/DecentralizedPublicationsView.js's own
// comment on this file) simply passes `recordIndex: null` for every
// anchor, honestly reporting "this fact belongs to this publication's own
// Bitcoin history, but is not further linked to one specific IPFS
// publication record within it."
//
// `anchorId` is a Bitcoin anchor's own domain identity (mirroring
// `recordIndex`'s role for an IPFS record) and is the caller-supplied key
// into `bitcoin.confirmationHistoriesByAnchorId` and `bitcoin.
// proofObservationsByAnchorId` — never re-derived, and never assumed equal
// across two different anchors.
//
// `broadcastedAt` IS THE ONE FIELD THIS FILE ACCEPTS THAT NO EXISTING
// BITCOIN DOMAIN OBJECT CARRIES. application/BitcoinAnchorBroadcastCoordinator
// .js's own outcome — `{ state, broadcasted, txid, reason }` — has no
// timestamp of its own (see that file's own header); a broadcast is a
// one-time action a caller observes once, not a durable, timestamped
// domain fact. A caller that wants a Bitcoin broadcast entry on this
// timeline supplies the moment it observed that outcome itself, mirroring
// exactly how ui/views/DecentralizedPublicationsView.js already captures
// `finalizedAt: Date.now()` at the moment a PSBT finalization completes,
// one stage earlier in the identical pipeline. An anchor with no
// `broadcastedAt` simply contributes no broadcast entry — never a
// fabricated one.
//
// NO HISTORY IS INVENTED FOR CONTENT PROOF. docs/Principles.md, "Confirmation
// And Content-Proof Histories Stay Separate, Never Unified, Because They
// Are Independent Observations (0.8.57)," already explains why this
// codebase keeps no append-only history of content-proof observations —
// only the CURRENT reconciliation's own `contentProof` is ever kept.
// `bitcoin.proofObservationsByAnchorId[anchorId]` therefore typically holds
// zero or one entries in this codebase's own real UI, today — but this
// file accepts an array, and projects every entry it is given, because
// nothing about the projection itself depends on there being exactly one.
//
// EACH ENTRY RETAINS ITS OWN DOMAIN. Every entry this file returns carries
// `domain: 'ipfs'` or `domain: 'bitcoin'`, alongside its own `kind` —
// never converted into the other domain's vocabulary, and never collapsed
// into a shared, domain-agnostic state. `PublicationObservationTimelineEntryKind`
// below simply re-exports application/IpfsPublicationObservationTimelineView
// .js's own two IPFS kinds unchanged, and adds three new Bitcoin-only kinds
// — it is a presentation tag for grouping entries on one screen, never a
// new domain state either domain's own vocabulary did not already have.
//
// THE FIXED PRE-SORT ORDER, restated one layer up from application/
// IpfsPublicationObservationTimelineView.js's own header: every entry is
// first built into one flat array in a fixed, reproducible order — every
// IPFS entry (in the exact order describeIpfsPublicationObservationTimeline()
// itself already returns them), THEN every Bitcoin anchor's own entries (in
// `bitcoin.anchors` order, and within one anchor: its own broadcast entry,
// then its own confirmation history in that history's own order, then its
// own content-proof observations in that array's own order) — and only
// THAT fixed-order array is ever sorted, with a stable sort keeping that
// same relative order for anything tied on `observedAt`. Neither
// `ipfs.publicationRecords`/`ipfs.verificationHistoriesByRecordIndex` nor
// `bitcoin.anchors`/`bitcoin.confirmationHistoriesByAnchorId`/`bitcoin.
// proofObservationsByAnchorId` is ever sorted, mutated, or reordered by
// this function — every value returned is a brand-new array, never a
// source array or one of its own elements handed back unchanged. Calling
// this function twice on byte-identical input always returns a
// byte-identical result.
//
// Pure and stateless: no constructor, no network access, no history of its
// own — this file performs ZERO network operations. Opening a timeline
// built from this projection reads only whatever the caller's own
// already-in-memory histories currently hold.
//
// 0.8.98 — Base Transaction Inclusion Observation Timeline. Adds a THIRD
// domain, `BASE`, and a THIRD source of already-described entries —
// `base/BaseTransactionInclusionObserver.js` (0.8.96) observations, via
// application/BaseTransactionInclusionObservationView.js's own, UNCHANGED
// `describeBaseTransactionInclusionObservationHistory()` — mirroring
// exactly how every Bitcoin confirmation entry above already reuses
// `describeBitcoinAnchorConfirmationObservationHistory()` unchanged. This
// milestone is PRESENTATION OF ALREADY-EXISTING OBSERVATIONS, not a fourth
// observation mechanism: application/PublicationObservationArchive.js
// (0.8.97) already durably holds `baseTransactionInclusionObservationsByTransactionHash`
// — this file adds no new durable collection, and requires no archive
// schema change (see application/PublicationObservationArchive.js's own
// SCHEMA_VERSION, unchanged at 4 by this milestone).
//
// BASE'S OWN IDENTITY IS `transactionHash` — NEVER `contentHash`, THE
// IDENTICAL RESTRAINT THIS FILE ALREADY HOLDS FOR `recordIndex`/`anchorId`.
// Every Base entry below carries the EXACT key its own
// `base.observationsByTransactionHash` object was found under — never
// re-derived from any field on the observation itself, and never
// associated with an IPFS record or a Bitcoin anchor by a shared
// `contentHash`. Two Base transactions that commit byte-identical content
// under two different transaction hashes project as two entirely
// independent sequences of entries here, exactly like two Bitcoin anchors
// sharing a `contentHash` already do — see docs/Principles.md, "Correlate
// Evidence By Explicit Identity, Never By Resemblance (0.8.78)."
//
// ONE ENTRY PER OBSERVATION, NEVER A SYNTHETIC ONE. An observation naming
// `confirmationCount: 7` projects as exactly ONE `BASE_TRANSACTION_INCLUSION`
// entry carrying `confirmationCount: 7` — never seven separate entries.
// This file computes no confirmation count of its own and generates no
// entry this caller's own history does not already, separately, hold.
//
// EVERY OBSERVED STATE PROJECTS — INCLUDED, NOT_INCLUDED, AND UNAVAILABLE
// ALIKE. `describeBaseTransactionInclusionObservationHistory()` already
// narrates all three without filtering; this file carries that unchanged —
// an UNAVAILABLE observation is a real timeline entry, not a gap. See
// docs/Principles.md, "An Observation Remains A Dated Fact; A Later
// Reading Never Erases An Earlier One (0.8.72)."
//
// NO GENERIC `BLOCKCHAIN_PLACEMENT` ABSTRACTION, AND NO CONFIRMATION/
// PLACEMENT DERIVED FROM A BASE OBSERVATION. Bitcoin's own
// `BITCOIN_CHAIN_PLACEMENT`/`BITCOIN_CONSISTENCY` machinery (application/
// BitcoinAnchorObservationConsistency.js) stays exactly Bitcoin's own —
// this file mints no Base counterpart, and no shared abstraction merging
// the two. `BASE_TRANSACTION_INCLUSION` is Base's own, single entry kind,
// carrying Base's own vocabulary (`INCLUDED`/`NOT_INCLUDED`/`UNAVAILABLE`),
// never translated into Bitcoin's.
//
// THE FIXED PRE-SORT ORDER GAINS ONE MORE STAGE, APPENDED LAST: every IPFS
// entry, then every Bitcoin anchor's own entries (unchanged from 0.8.74),
// THEN every Base transaction hash's own entries — in
// `base.observationsByTransactionHash`'s own key order (a plain object's
// own insertion order, exactly as durably maintained by application/
// PublicationObservationArchive.js's own `appendBaseTransactionInclusionObservation()`),
// and within one transaction hash: its own observation history in that
// history's own append order. Only the resulting, fixed-order array is
// ever sorted, by the SAME stable `observedAt`-then-source-position sort
// this file already used before this milestone — no second, competing
// sorting policy is introduced. Calling this function twice on
// byte-identical input still always returns a byte-identical result.
export const PublicationObservationTimelineDomain = Object.freeze({
    IPFS: 'ipfs',
    BITCOIN: 'bitcoin',
    BASE: 'base'
});

export const PublicationObservationTimelineEntryKind = Object.freeze({
    IPFS_PUBLICATION: IpfsPublicationObservationTimelineEntryKind.PUBLICATION,
    IPFS_CONTENT_VERIFICATION: IpfsPublicationObservationTimelineEntryKind.CONTENT_VERIFICATION,
    BITCOIN_BROADCAST: 'bitcoin-broadcast',
    BITCOIN_CONFIRMATION: 'bitcoin-confirmation',
    BITCOIN_CONTENT_PROOF: 'bitcoin-content-proof',
    BASE_TRANSACTION_INCLUSION: 'base-transaction-inclusion'
});

function normalizedRecordIndex(recordIndex) {
    return Number.isInteger(recordIndex) ? recordIndex : null;
}

function bitcoinLabel(base, recordIndex) {
    return Number.isInteger(recordIndex) ? `${base} — Publication #${recordIndex}` : base;
}

function bitcoinBroadcastEntry(anchor) {
    const described = describeBitcoinAnchorBroadcast(anchor.broadcast);
    const recordIndex = normalizedRecordIndex(anchor.recordIndex);
    return Object.freeze({
        observedAt: anchor.broadcastedAt,
        domain: PublicationObservationTimelineDomain.BITCOIN,
        kind: PublicationObservationTimelineEntryKind.BITCOIN_BROADCAST,
        recordIndex,
        label: bitcoinLabel('Bitcoin broadcast', recordIndex),
        anchorId: anchor.anchorId != null ? anchor.anchorId : null,
        txid: described.txid,
        state: described.state,
        stateLabel: described.stateLabel,
        reason: described.reason
    });
}

function bitcoinConfirmationEntry(observation, { recordIndex, anchorId }) {
    return Object.freeze({
        observedAt: observation.observedAt,
        domain: PublicationObservationTimelineDomain.BITCOIN,
        kind: PublicationObservationTimelineEntryKind.BITCOIN_CONFIRMATION,
        recordIndex,
        label: bitcoinLabel('Bitcoin confirmation', recordIndex),
        anchorId: anchorId != null ? anchorId : null,
        txid: observation.txid,
        state: observation.state,
        stateLabel: observation.stateLabel,
        blockHash: observation.blockHash,
        blockHeight: observation.blockHeight,
        confirmationCount: observation.confirmationCount,
        reason: observation.reason
    });
}

function bitcoinContentProofEntry(described, { recordIndex, anchorId, txid }) {
    return Object.freeze({
        observedAt: described.observedAt,
        domain: PublicationObservationTimelineDomain.BITCOIN,
        kind: PublicationObservationTimelineEntryKind.BITCOIN_CONTENT_PROOF,
        recordIndex,
        label: bitcoinLabel('Bitcoin content proof', recordIndex),
        anchorId: anchorId != null ? anchorId : null,
        txid: txid != null ? txid : null,
        state: described.state,
        stateLabel: described.stateLabel,
        contentHash: described.contentHash,
        reason: described.reason
    });
}

// 0.8.98 — one Base timeline entry, built from an ALREADY-DESCRIBED
// observation (`describeBaseTransactionInclusionObservationHistory()`'s own
// output — `stateLabel` already resolved, exactly like `bitcoinConfirmationEntry()`
// above consumes an already-described confirmation observation). Every
// field but `domain`/`kind`/`label`/`transactionHash` is carried through
// UNCHANGED from that projection — no field is recomputed here.
function baseTransactionInclusionEntry(observation, transactionHash) {
    return Object.freeze({
        observedAt: observation.observedAt,
        domain: PublicationObservationTimelineDomain.BASE,
        kind: PublicationObservationTimelineEntryKind.BASE_TRANSACTION_INCLUSION,
        transactionHash,
        label: 'Base transaction inclusion',
        txid: observation.txid,
        state: observation.state,
        stateLabel: observation.stateLabel,
        blockHash: observation.blockHash,
        blockNumber: observation.blockNumber,
        transactionIndex: observation.transactionIndex,
        confirmationCount: observation.confirmationCount,
        reason: observation.reason
    });
}

function baseEntriesForTransactionHash(transactionHash, observations) {
    if (!transactionHash) return [];
    return describeBaseTransactionInclusionObservationHistory(observations).observations
        .map((observation) => baseTransactionInclusionEntry(observation, transactionHash));
}

function observedAtMillis(entry) {
    return entry.observedAt instanceof Date ? entry.observedAt.getTime() : 0;
}

function bitcoinEntriesForAnchor(anchor, { confirmationHistoriesByAnchorId, proofObservationsByAnchorId }) {
    if (!anchor) return [];

    const recordIndex = normalizedRecordIndex(anchor.recordIndex);
    const anchorId = anchor.anchorId != null ? anchor.anchorId : null;
    const entries = [];

    if (anchor.broadcastedAt instanceof Date) {
        entries.push(bitcoinBroadcastEntry(anchor));
    }

    const confirmationHistory = describeBitcoinAnchorConfirmationObservationHistory(
        confirmationHistoriesByAnchorId[anchorId] || []
    ).observations;
    confirmationHistory.forEach((observation) => {
        if (!observation) return;
        entries.push(bitcoinConfirmationEntry(observation, { recordIndex, anchorId }));
    });

    const proofObservations = Array.isArray(proofObservationsByAnchorId[anchorId]) ? proofObservationsByAnchorId[anchorId] : [];
    proofObservations.forEach((observation) => {
        if (!observation) return;
        const described = describeBitcoinAnchorContentProof(observation);
        if (!described) return;
        entries.push(bitcoinContentProofEntry(described, { recordIndex, anchorId, txid: anchor.txid }));
    });

    return entries;
}

export function describePublicationObservationTimeline({ ipfs, bitcoin, base } = {}) {
    const ipfsInput = ipfs && typeof ipfs === 'object' ? ipfs : {};
    const bitcoinInput = bitcoin && typeof bitcoin === 'object' ? bitcoin : {};
    const baseInput = base && typeof base === 'object' ? base : {};

    const ipfsTimeline = describeIpfsPublicationObservationTimeline(
        ipfsInput.publicationRecords,
        ipfsInput.verificationHistoriesByRecordIndex
    );
    const ipfsEntries = ipfsTimeline.entries.map((entry) => Object.freeze({
        ...entry,
        domain: PublicationObservationTimelineDomain.IPFS
    }));

    const anchors = Array.isArray(bitcoinInput.anchors) ? bitcoinInput.anchors : [];
    const confirmationHistoriesByAnchorId = (bitcoinInput.confirmationHistoriesByAnchorId && typeof bitcoinInput.confirmationHistoriesByAnchorId === 'object')
        ? bitcoinInput.confirmationHistoriesByAnchorId
        : {};
    const proofObservationsByAnchorId = (bitcoinInput.proofObservationsByAnchorId && typeof bitcoinInput.proofObservationsByAnchorId === 'object')
        ? bitcoinInput.proofObservationsByAnchorId
        : {};

    const bitcoinEntries = anchors.flatMap((anchor) => bitcoinEntriesForAnchor(anchor, {
        confirmationHistoriesByAnchorId,
        proofObservationsByAnchorId
    }));

    const baseObservationsByTransactionHash = (baseInput.observationsByTransactionHash && typeof baseInput.observationsByTransactionHash === 'object')
        ? baseInput.observationsByTransactionHash
        : {};
    const baseEntries = Object.entries(baseObservationsByTransactionHash)
        .flatMap(([transactionHash, observations]) => baseEntriesForTransactionHash(transactionHash, observations));

    const insertionOrder = [...ipfsEntries, ...bitcoinEntries, ...baseEntries];
    const entries = insertionOrder
        .map((entry, sourceIndex) => ({ entry, sourceIndex }))
        .sort((a, b) => {
            const delta = observedAtMillis(a.entry) - observedAtMillis(b.entry);
            return delta !== 0 ? delta : a.sourceIndex - b.sourceIndex;
        })
        .map(({ entry }) => entry);

    return Object.freeze({ count: entries.length, entries: Object.freeze(entries) });
}
