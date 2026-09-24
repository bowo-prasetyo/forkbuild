import { IpfsPublicationRecord } from '../../ipfs/IpfsPublicationRecord.js';
import { appendIpfsPublicationRecordHistoryEntry } from '../../ipfs/IpfsPublicationRecordHistory.js';
import { appendIpfsPublicationContentVerificationHistoryEntry } from '../../ipfs/IpfsPublicationContentVerificationHistory.js';
import { appendBitcoinAnchorConfirmationObservationHistoryEntry } from '../../anchoring/bitcoin/BitcoinAnchorConfirmationObservationHistory.js';
import { BitcoinAnchorPublicationRecord } from '../../anchoring/bitcoin/BitcoinAnchorPublicationRecord.js';
import { appendBitcoinAnchorPublicationRecordHistoryEntry } from '../../anchoring/bitcoin/BitcoinAnchorPublicationRecordHistory.js';
import { appendBaseTransactionInclusionObservationHistoryEntry } from '../../anchoring/base/BaseTransactionInclusionObservationHistory.js';
import { BaseAnchorPublicationRecord } from '../../anchoring/base/BaseAnchorPublicationRecord.js';
import { appendBaseAnchorPublicationRecordHistoryEntry } from '../../anchoring/base/BaseAnchorPublicationRecordHistory.js';
import { isValidBlockchainKind } from '../../anchoring/BlockchainKind.js';
import { PublicationReferenceRecord } from '../PublicationReferenceRecord.js';
import { appendPublicationReferenceRecordHistoryEntry } from '../PublicationReferenceRecordHistory.js';
import { PublisherPublicationAssociationRecord } from '../../publisher/PublisherPublicationAssociationRecord.js';
import { appendPublisherPublicationAssociationRecordHistoryEntry } from '../../publisher/PublisherPublicationAssociationRecordHistory.js';
import { LeaderboardClaimRecord } from '../../leaderboard/claim/Record.js';
import { appendLeaderboardClaimHistoryEntry } from '../../leaderboard/claim/History.js';
import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry } from '../../claimSnapshotReconciliation/decision/History.js';
import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry } from '../../claimSnapshotReconciliation/revalidationObservation/History.js';
import {
    PublicationObservationArchiveProvenanceOrigin,
    isValidPublicationObservationArchiveProvenanceOrigin
} from './PublicationObservationArchiveProvenance.js';
import { isPlainObject } from '../../../utils/typeGuards.js';
import { hasOnlyKeys } from '../../../utils/typeGuards.js';

const SCHEMA_VERSION = 10;

// The durable, immutable archive of publication facts this replica has
// recorded, persisted verbatim by storage/LocalStoragePublicationObservationArchive.js.
//
// A composition of existing histories, not a new source of truth: each
// appendXxx() reuses its domain's own append function where one exists, and
// every append returns a new frozen archive (append-only, never mutated, never
// deduplicated, never reordered).
//
// Each collection stays separate and is never merged with another, and nothing
// here computes a combined status, trust, validity or "current" field (see
// docs/Principles.md, "The UI Displays Observations; It Does Not Turn Them
// Into A Verdict" and "Unify The Timeline, Not The Meanings"):
//
//   ipfsPublicationRecords, ipfsContentVerificationObservationsByRecordIndex
//   bitcoinBroadcastRecords, bitcoinConfirmationObservationsByAnchorId,
//   bitcoinContentProofObservationsByAnchorId, bitcoinAnchorPublicationRecords
//   baseTransactionInclusionObservationsByTransactionHash, baseAnchorPublicationRecords
//   publicationReferenceRecords, publisherPublicationAssociationRecords
//   leaderboardClaimRecords, reconciliationDecisionRecords,
//   revalidationObservationRecords
//
// The IPFS and Bitcoin collections are shaped to feed
// PublicationObservationTimelineView directly (Base is not in the timeline).
// Identity is always explicit and caller-supplied: an IPFS observation names
// this archive's own recordIndex, a Bitcoin fact its anchorId, a Base
// observation its txid; nothing is inferred from a shared contentHash.
// Identity records, observations, relationships, claim receipts, decisions and
// revalidation observations each have their own count; none is folded into
// another.
//
// No capabilities or credentials, ever: every field is plain, already-observed,
// JSON-serializable data, which is what makes persisting it verbatim safe.
//
// Each fact has a parallel LOCAL/IMPORTED provenance tag (docs/Principles.md,
// "Provenance Describes Where A Fact Entered This Archive; It Does Not
// Establish Whether The Fact Is True"). Appends default to LOCAL; only
// importing rewrites provenance, via withUniformProvenance(), which never
// touches a fact's own timestamps. Provenance feeds no evidence or timeline.
// archiveImportEvents records the act of importing itself.
//
// Schema changes are CONSERVATIVE: a payload with any other schemaVersion loads
// as an empty archive, with no migration path. Record-level validation is
// structural only; this file never re-derives decisions or plans.

export class PublicationObservationArchive {
    constructor({
        ipfsPublicationRecords = [],
        ipfsPublicationRecordProvenance = [],
        ipfsContentVerificationObservationsByRecordIndex = {},
        ipfsContentVerificationObservationProvenanceByRecordIndex = {},
        bitcoinBroadcastRecords = [],
        bitcoinBroadcastRecordProvenance = [],
        bitcoinConfirmationObservationsByAnchorId = {},
        bitcoinConfirmationObservationProvenanceByAnchorId = {},
        bitcoinContentProofObservationsByAnchorId = {},
        bitcoinContentProofObservationProvenanceByAnchorId = {},
        bitcoinAnchorPublicationRecords = [],
        bitcoinAnchorPublicationRecordProvenance = [],
        baseTransactionInclusionObservationsByTransactionHash = {},
        baseTransactionInclusionObservationProvenanceByTransactionHash = {},
        baseAnchorPublicationRecords = [],
        baseAnchorPublicationRecordProvenance = [],
        publicationReferenceRecords = [],
        publicationReferenceRecordProvenance = [],
        publisherPublicationAssociationRecords = [],
        publisherPublicationAssociationRecordProvenance = [],
        leaderboardClaimRecords = [],
        leaderboardClaimRecordProvenance = [],
        reconciliationDecisionRecords = [],
        reconciliationDecisionRecordProvenance = [],
        revalidationObservationRecords = [],
        revalidationObservationRecordProvenance = [],
        archiveImportEvents = []
    } = {}) {
        this._ipfsPublicationRecords = Object.freeze([...ipfsPublicationRecords]);
        this._ipfsPublicationRecordProvenance = Object.freeze([...ipfsPublicationRecordProvenance]);
        this._ipfsContentVerificationObservationsByRecordIndex = Object.freeze(
            Object.fromEntries(Object.entries(ipfsContentVerificationObservationsByRecordIndex)
                .map(([index, observations]) => [index, Object.freeze([...observations])]))
        );
        this._ipfsContentVerificationObservationProvenanceByRecordIndex = Object.freeze(
            Object.fromEntries(Object.entries(ipfsContentVerificationObservationProvenanceByRecordIndex)
                .map(([index, origins]) => [index, Object.freeze([...origins])]))
        );
        this._bitcoinBroadcastRecords = Object.freeze([...bitcoinBroadcastRecords]);
        this._bitcoinBroadcastRecordProvenance = Object.freeze([...bitcoinBroadcastRecordProvenance]);
        this._bitcoinConfirmationObservationsByAnchorId = Object.freeze(
            Object.fromEntries(Object.entries(bitcoinConfirmationObservationsByAnchorId)
                .map(([anchorId, observations]) => [anchorId, Object.freeze([...observations])]))
        );
        this._bitcoinConfirmationObservationProvenanceByAnchorId = Object.freeze(
            Object.fromEntries(Object.entries(bitcoinConfirmationObservationProvenanceByAnchorId)
                .map(([anchorId, origins]) => [anchorId, Object.freeze([...origins])]))
        );
        this._bitcoinContentProofObservationsByAnchorId = Object.freeze(
            Object.fromEntries(Object.entries(bitcoinContentProofObservationsByAnchorId)
                .map(([anchorId, observations]) => [anchorId, Object.freeze([...observations])]))
        );
        this._bitcoinContentProofObservationProvenanceByAnchorId = Object.freeze(
            Object.fromEntries(Object.entries(bitcoinContentProofObservationProvenanceByAnchorId)
                .map(([anchorId, origins]) => [anchorId, Object.freeze([...origins])]))
        );
        this._bitcoinAnchorPublicationRecords = Object.freeze([...bitcoinAnchorPublicationRecords]);
        this._bitcoinAnchorPublicationRecordProvenance = Object.freeze([...bitcoinAnchorPublicationRecordProvenance]);
        this._baseTransactionInclusionObservationsByTransactionHash = Object.freeze(
            Object.fromEntries(Object.entries(baseTransactionInclusionObservationsByTransactionHash)
                .map(([transactionHash, observations]) => [transactionHash, Object.freeze([...observations])]))
        );
        this._baseTransactionInclusionObservationProvenanceByTransactionHash = Object.freeze(
            Object.fromEntries(Object.entries(baseTransactionInclusionObservationProvenanceByTransactionHash)
                .map(([transactionHash, origins]) => [transactionHash, Object.freeze([...origins])]))
        );
        this._baseAnchorPublicationRecords = Object.freeze([...baseAnchorPublicationRecords]);
        this._baseAnchorPublicationRecordProvenance = Object.freeze([...baseAnchorPublicationRecordProvenance]);
        this._publicationReferenceRecords = Object.freeze([...publicationReferenceRecords]);
        this._publicationReferenceRecordProvenance = Object.freeze([...publicationReferenceRecordProvenance]);
        this._publisherPublicationAssociationRecords = Object.freeze([...publisherPublicationAssociationRecords]);
        this._publisherPublicationAssociationRecordProvenance = Object.freeze([...publisherPublicationAssociationRecordProvenance]);
        this._leaderboardClaimRecords = Object.freeze([...leaderboardClaimRecords]);
        this._leaderboardClaimRecordProvenance = Object.freeze([...leaderboardClaimRecordProvenance]);
        this._reconciliationDecisionRecords = Object.freeze([...reconciliationDecisionRecords]);
        this._reconciliationDecisionRecordProvenance = Object.freeze([...reconciliationDecisionRecordProvenance]);
        this._revalidationObservationRecords = Object.freeze([...revalidationObservationRecords]);
        this._revalidationObservationRecordProvenance = Object.freeze([...revalidationObservationRecordProvenance]);
        this._archiveImportEvents = Object.freeze([...archiveImportEvents]);
        Object.freeze(this);
    }

    get ipfsPublicationRecords() { return this._ipfsPublicationRecords; }
    get ipfsPublicationRecordProvenance() { return this._ipfsPublicationRecordProvenance; }
    get ipfsContentVerificationObservationsByRecordIndex() { return this._ipfsContentVerificationObservationsByRecordIndex; }
    get ipfsContentVerificationObservationProvenanceByRecordIndex() { return this._ipfsContentVerificationObservationProvenanceByRecordIndex; }
    get bitcoinBroadcastRecords() { return this._bitcoinBroadcastRecords; }
    get bitcoinBroadcastRecordProvenance() { return this._bitcoinBroadcastRecordProvenance; }
    get bitcoinConfirmationObservationsByAnchorId() { return this._bitcoinConfirmationObservationsByAnchorId; }
    get bitcoinConfirmationObservationProvenanceByAnchorId() { return this._bitcoinConfirmationObservationProvenanceByAnchorId; }
    get bitcoinContentProofObservationsByAnchorId() { return this._bitcoinContentProofObservationsByAnchorId; }
    get bitcoinContentProofObservationProvenanceByAnchorId() { return this._bitcoinContentProofObservationProvenanceByAnchorId; }
    get bitcoinAnchorPublicationRecords() { return this._bitcoinAnchorPublicationRecords; }
    get bitcoinAnchorPublicationRecordProvenance() { return this._bitcoinAnchorPublicationRecordProvenance; }
    get baseTransactionInclusionObservationsByTransactionHash() { return this._baseTransactionInclusionObservationsByTransactionHash; }
    get baseTransactionInclusionObservationProvenanceByTransactionHash() { return this._baseTransactionInclusionObservationProvenanceByTransactionHash; }
    get baseAnchorPublicationRecords() { return this._baseAnchorPublicationRecords; }
    get baseAnchorPublicationRecordProvenance() { return this._baseAnchorPublicationRecordProvenance; }
    get publicationReferenceRecords() { return this._publicationReferenceRecords; }
    get publicationReferenceRecordProvenance() { return this._publicationReferenceRecordProvenance; }
    get publisherPublicationAssociationRecords() { return this._publisherPublicationAssociationRecords; }
    get publisherPublicationAssociationRecordProvenance() { return this._publisherPublicationAssociationRecordProvenance; }
    get leaderboardClaimRecords() { return this._leaderboardClaimRecords; }
    get leaderboardClaimRecordProvenance() { return this._leaderboardClaimRecordProvenance; }
    get reconciliationDecisionRecords() { return this._reconciliationDecisionRecords; }
    get reconciliationDecisionRecordProvenance() { return this._reconciliationDecisionRecordProvenance; }
    get revalidationObservationRecords() { return this._revalidationObservationRecords; }
    get revalidationObservationRecordProvenance() { return this._revalidationObservationRecordProvenance; }
    get archiveImportEvents() { return this._archiveImportEvents; }

    // Exposed so the export module can record it without duplicating the number.
    static get SCHEMA_VERSION() { return SCHEMA_VERSION; }

    // IPFS publishes plus Bitcoin broadcast attempts. Identity records have their
    // own counts.
    get publicationCount() {
        return this._ipfsPublicationRecords.length + this._bitcoinBroadcastRecords.length;
    }

    get bitcoinAnchorPublicationRecordCount() {
        return this._bitcoinAnchorPublicationRecords.length;
    }

    get baseAnchorPublicationRecordCount() {
        return this._baseAnchorPublicationRecords.length;
    }

    get publicationReferenceRecordCount() {
        return this._publicationReferenceRecords.length;
    }

    get publisherPublicationAssociationRecordCount() {
        return this._publisherPublicationAssociationRecords.length;
    }

    // Counts receipts: the same claim received twice counts twice.
    get leaderboardClaimRecordCount() {
        return this._leaderboardClaimRecords.length;
    }

    // Counts recorded decisions: the same decision recorded twice counts twice.
    get reconciliationDecisionRecordCount() {
        return this._reconciliationDecisionRecords.length;
    }

    // Counts recorded observations, duplicates included.
    get revalidationObservationRecordCount() {
        return this._revalidationObservationRecords.length;
    }

    // Every IPFS verification, Bitcoin confirmation and content-proof check, and
    // Base inclusion observation, never reduced to the latest one.
    get observationCount() {
        return countValues(this._ipfsContentVerificationObservationsByRecordIndex)
            + countValues(this._bitcoinConfirmationObservationsByAnchorId)
            + countValues(this._bitcoinContentProofObservationsByAnchorId)
            + countValues(this._baseTransactionInclusionObservationsByTransactionHash);
    }

    // Partitions facts by provenance, not shape; never a health or trust number.
    get localFactCount() {
        return this._countProvenance(PublicationObservationArchiveProvenanceOrigin.LOCAL);
    }

    get importedFactCount() {
        return this._countProvenance(PublicationObservationArchiveProvenanceOrigin.IMPORTED);
    }

    // Always localFactCount + importedFactCount.
    get totalFactCount() {
        return this.localFactCount + this.importedFactCount;
    }

    _countProvenance(origin) {
        return countOriginMatches(this._ipfsPublicationRecordProvenance, origin)
            + countOriginMatchesByKey(this._ipfsContentVerificationObservationProvenanceByRecordIndex, origin)
            + countOriginMatches(this._bitcoinBroadcastRecordProvenance, origin)
            + countOriginMatchesByKey(this._bitcoinConfirmationObservationProvenanceByAnchorId, origin)
            + countOriginMatchesByKey(this._bitcoinContentProofObservationProvenanceByAnchorId, origin)
            + countOriginMatches(this._bitcoinAnchorPublicationRecordProvenance, origin)
            + countOriginMatchesByKey(this._baseTransactionInclusionObservationProvenanceByTransactionHash, origin)
            + countOriginMatches(this._baseAnchorPublicationRecordProvenance, origin)
            + countOriginMatches(this._publicationReferenceRecordProvenance, origin)
            + countOriginMatches(this._publisherPublicationAssociationRecordProvenance, origin)
            + countOriginMatches(this._leaderboardClaimRecordProvenance, origin)
            + countOriginMatches(this._reconciliationDecisionRecordProvenance, origin)
            + countOriginMatches(this._revalidationObservationRecordProvenance, origin);
    }

    _fields() {
        return {
            ipfsPublicationRecords: this._ipfsPublicationRecords,
            ipfsPublicationRecordProvenance: this._ipfsPublicationRecordProvenance,
            ipfsContentVerificationObservationsByRecordIndex: this._ipfsContentVerificationObservationsByRecordIndex,
            ipfsContentVerificationObservationProvenanceByRecordIndex: this._ipfsContentVerificationObservationProvenanceByRecordIndex,
            bitcoinBroadcastRecords: this._bitcoinBroadcastRecords,
            bitcoinBroadcastRecordProvenance: this._bitcoinBroadcastRecordProvenance,
            bitcoinConfirmationObservationsByAnchorId: this._bitcoinConfirmationObservationsByAnchorId,
            bitcoinConfirmationObservationProvenanceByAnchorId: this._bitcoinConfirmationObservationProvenanceByAnchorId,
            bitcoinContentProofObservationsByAnchorId: this._bitcoinContentProofObservationsByAnchorId,
            bitcoinContentProofObservationProvenanceByAnchorId: this._bitcoinContentProofObservationProvenanceByAnchorId,
            bitcoinAnchorPublicationRecords: this._bitcoinAnchorPublicationRecords,
            bitcoinAnchorPublicationRecordProvenance: this._bitcoinAnchorPublicationRecordProvenance,
            baseTransactionInclusionObservationsByTransactionHash: this._baseTransactionInclusionObservationsByTransactionHash,
            baseTransactionInclusionObservationProvenanceByTransactionHash: this._baseTransactionInclusionObservationProvenanceByTransactionHash,
            baseAnchorPublicationRecords: this._baseAnchorPublicationRecords,
            baseAnchorPublicationRecordProvenance: this._baseAnchorPublicationRecordProvenance,
            publicationReferenceRecords: this._publicationReferenceRecords,
            publicationReferenceRecordProvenance: this._publicationReferenceRecordProvenance,
            publisherPublicationAssociationRecords: this._publisherPublicationAssociationRecords,
            publisherPublicationAssociationRecordProvenance: this._publisherPublicationAssociationRecordProvenance,
            leaderboardClaimRecords: this._leaderboardClaimRecords,
            leaderboardClaimRecordProvenance: this._leaderboardClaimRecordProvenance,
            reconciliationDecisionRecords: this._reconciliationDecisionRecords,
            reconciliationDecisionRecordProvenance: this._reconciliationDecisionRecordProvenance,
            revalidationObservationRecords: this._revalidationObservationRecords,
            revalidationObservationRecordProvenance: this._revalidationObservationRecordProvenance,
            archiveImportEvents: this._archiveImportEvents
        };
    }

    // `record`'s position in the returned archive is what
    // appendIpfsContentVerificationObservation() must be given; a falsy record
    // is a no-op. Every appendXxx() takes an optional trailing `origin` (LOCAL by
    // default).
    appendIpfsPublicationRecord(record, origin = PublicationObservationArchiveProvenanceOrigin.LOCAL) {
        if (!record || !isValidPublicationObservationArchiveProvenanceOrigin(origin)) return this;
        return new PublicationObservationArchive({
            ...this._fields(),
            ipfsPublicationRecords: appendIpfsPublicationRecordHistoryEntry(this._ipfsPublicationRecords, record),
            ipfsPublicationRecordProvenance: Object.freeze([...this._ipfsPublicationRecordProvenance, origin])
        });
    }

    appendIpfsContentVerificationObservation(recordIndex, observation, origin = PublicationObservationArchiveProvenanceOrigin.LOCAL) {
        if (!Number.isInteger(recordIndex) || !observation || !isValidPublicationObservationArchiveProvenanceOrigin(origin)) return this;
        const existing = this._ipfsContentVerificationObservationsByRecordIndex[recordIndex] || [];
        const existingProvenance = this._ipfsContentVerificationObservationProvenanceByRecordIndex[recordIndex] || [];
        return new PublicationObservationArchive({
            ...this._fields(),
            ipfsContentVerificationObservationsByRecordIndex: {
                ...this._ipfsContentVerificationObservationsByRecordIndex,
                [recordIndex]: appendIpfsPublicationContentVerificationHistoryEntry(existing, observation)
            },
            ipfsContentVerificationObservationProvenanceByRecordIndex: {
                ...this._ipfsContentVerificationObservationProvenanceByRecordIndex,
                [recordIndex]: Object.freeze([...existingProvenance, origin])
            }
        });
    }

    // `broadcastedAt` comes from the caller: broadcasting carries no timestamp of
    // its own. Missing `anchorId` or `broadcastedAt` is a no-op.
    appendBitcoinBroadcastRecord({ recordIndex = null, anchorId, txid = null, state = null, reason = null, broadcastedAt, origin = PublicationObservationArchiveProvenanceOrigin.LOCAL } = {}) {
        if (!anchorId || !(broadcastedAt instanceof Date) || Number.isNaN(broadcastedAt.getTime()) || !isValidPublicationObservationArchiveProvenanceOrigin(origin)) return this;
        const record = Object.freeze({
            recordIndex: Number.isInteger(recordIndex) ? recordIndex : null,
            anchorId,
            txid: txid != null ? txid : null,
            state,
            reason: reason != null ? reason : null,
            broadcastedAt
        });
        return new PublicationObservationArchive({
            ...this._fields(),
            bitcoinBroadcastRecords: Object.freeze([...this._bitcoinBroadcastRecords, record]),
            bitcoinBroadcastRecordProvenance: Object.freeze([...this._bitcoinBroadcastRecordProvenance, origin])
        });
    }

    appendBitcoinConfirmationObservation(anchorId, observation, origin = PublicationObservationArchiveProvenanceOrigin.LOCAL) {
        if (!anchorId || !observation || !isValidPublicationObservationArchiveProvenanceOrigin(origin)) return this;
        const existing = this._bitcoinConfirmationObservationsByAnchorId[anchorId] || [];
        const existingProvenance = this._bitcoinConfirmationObservationProvenanceByAnchorId[anchorId] || [];
        return new PublicationObservationArchive({
            ...this._fields(),
            bitcoinConfirmationObservationsByAnchorId: {
                ...this._bitcoinConfirmationObservationsByAnchorId,
                [anchorId]: appendBitcoinAnchorConfirmationObservationHistoryEntry(existing, observation)
            },
            bitcoinConfirmationObservationProvenanceByAnchorId: {
                ...this._bitcoinConfirmationObservationProvenanceByAnchorId,
                [anchorId]: Object.freeze([...existingProvenance, origin])
            }
        });
    }

    // Nothing else historizes content-proof observations; here every one is
    // appended, never replacing the previous.
    appendBitcoinContentProofObservation(anchorId, observation, origin = PublicationObservationArchiveProvenanceOrigin.LOCAL) {
        if (!anchorId || !observation || !isValidPublicationObservationArchiveProvenanceOrigin(origin)) return this;
        const existing = this._bitcoinContentProofObservationsByAnchorId[anchorId] || [];
        const existingProvenance = this._bitcoinContentProofObservationProvenanceByAnchorId[anchorId] || [];
        return new PublicationObservationArchive({
            ...this._fields(),
            bitcoinContentProofObservationsByAnchorId: {
                ...this._bitcoinContentProofObservationsByAnchorId,
                [anchorId]: Object.freeze([...existing, observation])
            },
            bitcoinContentProofObservationProvenanceByAnchorId: {
                ...this._bitcoinContentProofObservationProvenanceByAnchorId,
                [anchorId]: Object.freeze([...existingProvenance, origin])
            }
        });
    }

    appendBitcoinAnchorPublicationRecord(record, origin = PublicationObservationArchiveProvenanceOrigin.LOCAL) {
        if (!record || !isValidPublicationObservationArchiveProvenanceOrigin(origin)) return this;
        return new PublicationObservationArchive({
            ...this._fields(),
            bitcoinAnchorPublicationRecords: appendBitcoinAnchorPublicationRecordHistoryEntry(this._bitcoinAnchorPublicationRecords, record),
            bitcoinAnchorPublicationRecordProvenance: Object.freeze([...this._bitcoinAnchorPublicationRecordProvenance, origin])
        });
    }

    // Archived exactly as observed in every state, UNAVAILABLE included.
    appendBaseTransactionInclusionObservation(transactionHash, observation, origin = PublicationObservationArchiveProvenanceOrigin.LOCAL) {
        if (!transactionHash || !observation || !isValidPublicationObservationArchiveProvenanceOrigin(origin)) return this;
        const existing = this._baseTransactionInclusionObservationsByTransactionHash[transactionHash] || [];
        const existingProvenance = this._baseTransactionInclusionObservationProvenanceByTransactionHash[transactionHash] || [];
        return new PublicationObservationArchive({
            ...this._fields(),
            baseTransactionInclusionObservationsByTransactionHash: {
                ...this._baseTransactionInclusionObservationsByTransactionHash,
                [transactionHash]: appendBaseTransactionInclusionObservationHistoryEntry(existing, observation)
            },
            baseTransactionInclusionObservationProvenanceByTransactionHash: {
                ...this._baseTransactionInclusionObservationProvenanceByTransactionHash,
                [transactionHash]: Object.freeze([...existingProvenance, origin])
            }
        });
    }

    appendBaseAnchorPublicationRecord(record, origin = PublicationObservationArchiveProvenanceOrigin.LOCAL) {
        if (!record || !isValidPublicationObservationArchiveProvenanceOrigin(origin)) return this;
        return new PublicationObservationArchive({
            ...this._fields(),
            baseAnchorPublicationRecords: appendBaseAnchorPublicationRecordHistoryEntry(this._baseAnchorPublicationRecords, record),
            baseAnchorPublicationRecordProvenance: Object.freeze([...this._baseAnchorPublicationRecordProvenance, origin])
        });
    }

    appendPublicationReferenceRecord(record, origin = PublicationObservationArchiveProvenanceOrigin.LOCAL) {
        if (!record || !isValidPublicationObservationArchiveProvenanceOrigin(origin)) return this;
        return new PublicationObservationArchive({
            ...this._fields(),
            publicationReferenceRecords: appendPublicationReferenceRecordHistoryEntry(this._publicationReferenceRecords, record),
            publicationReferenceRecordProvenance: Object.freeze([...this._publicationReferenceRecordProvenance, origin])
        });
    }

    appendPublisherPublicationAssociationRecord(record, origin = PublicationObservationArchiveProvenanceOrigin.LOCAL) {
        if (!record || !isValidPublicationObservationArchiveProvenanceOrigin(origin)) return this;
        return new PublicationObservationArchive({
            ...this._fields(),
            publisherPublicationAssociationRecords: appendPublisherPublicationAssociationRecordHistoryEntry(this._publisherPublicationAssociationRecords, record),
            publisherPublicationAssociationRecordProvenance: Object.freeze([...this._publisherPublicationAssociationRecordProvenance, origin])
        });
    }

    appendLeaderboardClaimRecord(record, origin = PublicationObservationArchiveProvenanceOrigin.LOCAL) {
        if (!(record instanceof LeaderboardClaimRecord) || !isValidPublicationObservationArchiveProvenanceOrigin(origin)) return this;
        return new PublicationObservationArchive({
            ...this._fields(),
            leaderboardClaimRecords: appendLeaderboardClaimHistoryEntry(this._leaderboardClaimRecords, record),
            leaderboardClaimRecordProvenance: Object.freeze([...this._leaderboardClaimRecordProvenance, origin])
        });
    }

    // The pre-check repeats the history function's own tolerance so a no-op
    // returns `this` rather than a new instance.
    appendReconciliationDecisionRecord(record, origin = PublicationObservationArchiveProvenanceOrigin.LOCAL) {
        if (!record || typeof record !== 'object' || record.decided !== true || !isValidPublicationObservationArchiveProvenanceOrigin(origin)) return this;
        return new PublicationObservationArchive({
            ...this._fields(),
            reconciliationDecisionRecords: appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry(this._reconciliationDecisionRecords, record),
            reconciliationDecisionRecordProvenance: Object.freeze([...this._reconciliationDecisionRecordProvenance, origin])
        });
    }

    // Same pre-check reasoning as appendReconciliationDecisionRecord().
    appendRevalidationObservationRecord(observation, origin = PublicationObservationArchiveProvenanceOrigin.LOCAL) {
        if (!observation || typeof observation !== 'object' || observation.observed !== true || !isValidPublicationObservationArchiveProvenanceOrigin(origin)) return this;
        return new PublicationObservationArchive({
            ...this._fields(),
            revalidationObservationRecords: appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(this._revalidationObservationRecords, observation),
            revalidationObservationRecordProvenance: Object.freeze([...this._revalidationObservationRecordProvenance, origin])
        });
    }

    // Replaces every provenance tag with `origin`; facts and import events are
    // untouched. Only importing uses this, never fromJSON().
    withUniformProvenance(origin) {
        if (!isValidPublicationObservationArchiveProvenanceOrigin(origin)) return this;
        return new PublicationObservationArchive({
            ...this._fields(),
            ipfsPublicationRecordProvenance: Object.freeze(this._ipfsPublicationRecordProvenance.map(() => origin)),
            ipfsContentVerificationObservationProvenanceByRecordIndex: mapValues(
                this._ipfsContentVerificationObservationProvenanceByRecordIndex,
                (origins) => Object.freeze(origins.map(() => origin))
            ),
            bitcoinBroadcastRecordProvenance: Object.freeze(this._bitcoinBroadcastRecordProvenance.map(() => origin)),
            bitcoinConfirmationObservationProvenanceByAnchorId: mapValues(
                this._bitcoinConfirmationObservationProvenanceByAnchorId,
                (origins) => Object.freeze(origins.map(() => origin))
            ),
            bitcoinContentProofObservationProvenanceByAnchorId: mapValues(
                this._bitcoinContentProofObservationProvenanceByAnchorId,
                (origins) => Object.freeze(origins.map(() => origin))
            ),
            bitcoinAnchorPublicationRecordProvenance: Object.freeze(this._bitcoinAnchorPublicationRecordProvenance.map(() => origin)),
            baseTransactionInclusionObservationProvenanceByTransactionHash: mapValues(
                this._baseTransactionInclusionObservationProvenanceByTransactionHash,
                (origins) => Object.freeze(origins.map(() => origin))
            ),
            baseAnchorPublicationRecordProvenance: Object.freeze(this._baseAnchorPublicationRecordProvenance.map(() => origin)),
            publicationReferenceRecordProvenance: Object.freeze(this._publicationReferenceRecordProvenance.map(() => origin)),
            publisherPublicationAssociationRecordProvenance: Object.freeze(this._publisherPublicationAssociationRecordProvenance.map(() => origin)),
            leaderboardClaimRecordProvenance: Object.freeze(this._leaderboardClaimRecordProvenance.map(() => origin)),
            reconciliationDecisionRecordProvenance: Object.freeze(this._reconciliationDecisionRecordProvenance.map(() => origin)),
            revalidationObservationRecordProvenance: Object.freeze(this._revalidationObservationRecordProvenance.map(() => origin))
        });
    }

    // `importedAt` is when this replica imported, never a fact's own timestamp.
    // Invalid input is a no-op.
    appendArchiveImportEvent({ importedAt, importedArchiveSchemaVersion, importedEntryCount } = {}) {
        if (!(importedAt instanceof Date) || Number.isNaN(importedAt.getTime())) return this;
        if (!Number.isInteger(importedArchiveSchemaVersion) || importedArchiveSchemaVersion < 1) return this;
        if (!Number.isInteger(importedEntryCount) || importedEntryCount < 0) return this;
        const event = Object.freeze({ importedAt, importedArchiveSchemaVersion, importedEntryCount });
        return new PublicationObservationArchive({
            ...this._fields(),
            archiveImportEvents: Object.freeze([...this._archiveImportEvents, event])
        });
    }

    // Re-shapes broadcast records into the timeline view's `bitcoin.anchors`
    // entries.
    toBitcoinAnchors() {
        return this._bitcoinBroadcastRecords.map((record) => Object.freeze({
            recordIndex: record.recordIndex,
            anchorId: record.anchorId,
            txid: record.txid,
            broadcastedAt: record.broadcastedAt,
            broadcast: Object.freeze({ state: record.state, txid: record.txid, reason: record.reason })
        }));
    }

    // Plain JSON only; round-trips through fromJSON() unchanged.
    toJSON() {
        return {
            schemaVersion: SCHEMA_VERSION,
            ipfsPublicationRecords: this._ipfsPublicationRecords.map((record) => record.toJSON()),
            ipfsPublicationRecordProvenance: [...this._ipfsPublicationRecordProvenance],
            ipfsContentVerificationObservationsByRecordIndex: mapValues(
                this._ipfsContentVerificationObservationsByRecordIndex,
                (observations) => observations.map(serializeObservation)
            ),
            ipfsContentVerificationObservationProvenanceByRecordIndex: mapValues(
                this._ipfsContentVerificationObservationProvenanceByRecordIndex,
                (origins) => [...origins]
            ),
            bitcoinBroadcastRecords: this._bitcoinBroadcastRecords.map((record) => ({
                recordIndex: record.recordIndex,
                anchorId: record.anchorId,
                txid: record.txid,
                state: record.state,
                reason: record.reason,
                broadcastedAt: record.broadcastedAt.toISOString()
            })),
            bitcoinBroadcastRecordProvenance: [...this._bitcoinBroadcastRecordProvenance],
            bitcoinConfirmationObservationsByAnchorId: mapValues(
                this._bitcoinConfirmationObservationsByAnchorId,
                (observations) => observations.map(serializeObservation)
            ),
            bitcoinConfirmationObservationProvenanceByAnchorId: mapValues(
                this._bitcoinConfirmationObservationProvenanceByAnchorId,
                (origins) => [...origins]
            ),
            bitcoinContentProofObservationsByAnchorId: mapValues(
                this._bitcoinContentProofObservationsByAnchorId,
                (observations) => observations.map(serializeObservation)
            ),
            bitcoinContentProofObservationProvenanceByAnchorId: mapValues(
                this._bitcoinContentProofObservationProvenanceByAnchorId,
                (origins) => [...origins]
            ),
            bitcoinAnchorPublicationRecords: this._bitcoinAnchorPublicationRecords.map((record) => record.toJSON()),
            bitcoinAnchorPublicationRecordProvenance: [...this._bitcoinAnchorPublicationRecordProvenance],
            baseTransactionInclusionObservationsByTransactionHash: mapValues(
                this._baseTransactionInclusionObservationsByTransactionHash,
                (observations) => observations.map(serializeObservation)
            ),
            baseTransactionInclusionObservationProvenanceByTransactionHash: mapValues(
                this._baseTransactionInclusionObservationProvenanceByTransactionHash,
                (origins) => [...origins]
            ),
            baseAnchorPublicationRecords: this._baseAnchorPublicationRecords.map((record) => record.toJSON()),
            baseAnchorPublicationRecordProvenance: [...this._baseAnchorPublicationRecordProvenance],
            publicationReferenceRecords: this._publicationReferenceRecords.map((record) => record.toJSON()),
            publicationReferenceRecordProvenance: [...this._publicationReferenceRecordProvenance],
            publisherPublicationAssociationRecords: this._publisherPublicationAssociationRecords.map((record) => record.toJSON()),
            publisherPublicationAssociationRecordProvenance: [...this._publisherPublicationAssociationRecordProvenance],
            leaderboardClaimRecords: this._leaderboardClaimRecords.map((record) => record.toJSON()),
            leaderboardClaimRecordProvenance: [...this._leaderboardClaimRecordProvenance],
            reconciliationDecisionRecords: this._reconciliationDecisionRecords.map(serializeReconciliationDecisionRecord),
            reconciliationDecisionRecordProvenance: [...this._reconciliationDecisionRecordProvenance],
            revalidationObservationRecords: this._revalidationObservationRecords.map(serializeRevalidationObservationRecord),
            revalidationObservationRecordProvenance: [...this._revalidationObservationRecordProvenance],
            archiveImportEvents: this._archiveImportEvents.map(serializeArchiveImportEvent)
        };
    }

    // Also fromJSON()'s answer to malformed persisted data.
    static empty() {
        return new PublicationObservationArchive();
    }

    // Tells "not an archive export" apart from a valid empty archive, which
    // fromJSON() deliberately treats the same.
    static isValidJSON(json) {
        return validateArchiveJSON(json) !== null;
    }

    // Strict: any wrong schemaVersion, missing collection, missing or extra field,
    // or bad timestamp yields an empty archive, never a partial one. Appends
    // tolerate a bad argument because in-memory callers are trusted; persisted
    // data is not (docs/Principles.md, "Persistence Restores Historical Facts; It
    // Never Resurrects Invented Ones").
    static fromJSON(json) {
        const validated = validateArchiveJSON(json);
        if (!validated) return PublicationObservationArchive.empty();

        return new PublicationObservationArchive({
            ipfsPublicationRecords: validated.ipfsPublicationRecords.map((record) => IpfsPublicationRecord.fromJSON(record)),
            ipfsPublicationRecordProvenance: validated.ipfsPublicationRecordProvenance,
            ipfsContentVerificationObservationsByRecordIndex: mapValues(
                validated.ipfsContentVerificationObservationsByRecordIndex,
                (observations) => observations.map(deserializeObservation)
            ),
            ipfsContentVerificationObservationProvenanceByRecordIndex: validated.ipfsContentVerificationObservationProvenanceByRecordIndex,
            bitcoinBroadcastRecords: validated.bitcoinBroadcastRecords.map((record) => ({
                recordIndex: record.recordIndex,
                anchorId: record.anchorId,
                txid: record.txid,
                state: record.state,
                reason: record.reason,
                broadcastedAt: new Date(record.broadcastedAt)
            })),
            bitcoinBroadcastRecordProvenance: validated.bitcoinBroadcastRecordProvenance,
            bitcoinConfirmationObservationsByAnchorId: mapValues(
                validated.bitcoinConfirmationObservationsByAnchorId,
                (observations) => observations.map(deserializeObservation)
            ),
            bitcoinConfirmationObservationProvenanceByAnchorId: validated.bitcoinConfirmationObservationProvenanceByAnchorId,
            bitcoinContentProofObservationsByAnchorId: mapValues(
                validated.bitcoinContentProofObservationsByAnchorId,
                (observations) => observations.map(deserializeObservation)
            ),
            bitcoinContentProofObservationProvenanceByAnchorId: validated.bitcoinContentProofObservationProvenanceByAnchorId,
            bitcoinAnchorPublicationRecords: validated.bitcoinAnchorPublicationRecords.map((record) => BitcoinAnchorPublicationRecord.fromJSON(record)),
            bitcoinAnchorPublicationRecordProvenance: validated.bitcoinAnchorPublicationRecordProvenance,
            baseTransactionInclusionObservationsByTransactionHash: mapValues(
                validated.baseTransactionInclusionObservationsByTransactionHash,
                (observations) => observations.map(deserializeObservation)
            ),
            baseTransactionInclusionObservationProvenanceByTransactionHash: validated.baseTransactionInclusionObservationProvenanceByTransactionHash,
            baseAnchorPublicationRecords: validated.baseAnchorPublicationRecords.map((record) => BaseAnchorPublicationRecord.fromJSON(record)),
            baseAnchorPublicationRecordProvenance: validated.baseAnchorPublicationRecordProvenance,
            publicationReferenceRecords: validated.publicationReferenceRecords.map((record) => PublicationReferenceRecord.fromJSON(record)),
            publicationReferenceRecordProvenance: validated.publicationReferenceRecordProvenance,
            publisherPublicationAssociationRecords: validated.publisherPublicationAssociationRecords.map((record) => PublisherPublicationAssociationRecord.fromJSON(record)),
            publisherPublicationAssociationRecordProvenance: validated.publisherPublicationAssociationRecordProvenance,
            leaderboardClaimRecords: validated.leaderboardClaimRecords.map((record) => LeaderboardClaimRecord.fromJSON(record)),
            leaderboardClaimRecordProvenance: validated.leaderboardClaimRecordProvenance,
            reconciliationDecisionRecords: validated.reconciliationDecisionRecords.map(deserializeReconciliationDecisionRecord),
            reconciliationDecisionRecordProvenance: validated.reconciliationDecisionRecordProvenance,
            revalidationObservationRecords: validated.revalidationObservationRecords.map(deserializeRevalidationObservationRecord),
            revalidationObservationRecordProvenance: validated.revalidationObservationRecordProvenance,
            archiveImportEvents: validated.archiveImportEvents.map(deserializeArchiveImportEvent)
        });
    }
}

function countValues(byKey) {
    return Object.values(byKey).reduce((total, observations) => total + observations.length, 0);
}

function countOriginMatches(origins, origin) {
    return origins.reduce((total, entry) => total + (entry === origin ? 1 : 0), 0);
}

function countOriginMatchesByKey(originsByKey, origin) {
    return Object.values(originsByKey).reduce((total, origins) => total + countOriginMatches(origins, origin), 0);
}

function mapValues(byKey, fn) {
    return Object.fromEntries(Object.entries(byKey).map(([key, value]) => [key, fn(value)]));
}

function serializeObservation(observation) {
    return {
        ...observation,
        observedAt: observation.observedAt instanceof Date ? observation.observedAt.toISOString() : observation.observedAt
    };
}

function deserializeObservation(observation) {
    return {
        ...observation,
        observedAt: new Date(observation.observedAt)
    };
}

// Decision records are plain frozen objects with ISO string timestamps, so they
// round-trip inline.
function serializeReconciliationDecisionRecord(record) {
    return {
        decided: true,
        candidate: { ...record.candidate },
        decision: record.decision,
        decidedAt: record.decidedAt
    };
}

function deserializeReconciliationDecisionRecord(record) {
    return Object.freeze({
        decided: true,
        candidate: Object.freeze({ ...record.candidate }),
        decision: record.decision,
        decidedAt: record.decidedAt
    });
}

function serializeRevalidationObservationRecord(record) {
    return {
        observed: true,
        decision: serializeReconciliationDecisionRecord(record.decision),
        planIdentity: { ...record.planIdentity },
        candidatePresent: record.candidatePresent,
        candidateType: record.candidateType,
        candidateMatchesPlan: record.candidateMatchesPlan,
        observedAt: record.observedAt
    };
}

function deserializeRevalidationObservationRecord(record) {
    return Object.freeze({
        observed: true,
        decision: deserializeReconciliationDecisionRecord(record.decision),
        planIdentity: Object.freeze({ ...record.planIdentity }),
        candidatePresent: record.candidatePresent,
        candidateType: record.candidateType,
        candidateMatchesPlan: record.candidateMatchesPlan,
        observedAt: record.observedAt
    });
}

function serializeArchiveImportEvent(event) {
    return {
        importedAt: event.importedAt.toISOString(),
        importedArchiveSchemaVersion: event.importedArchiveSchemaVersion,
        importedEntryCount: event.importedEntryCount
    };
}

function deserializeArchiveImportEvent(event) {
    return Object.freeze({
        importedAt: new Date(event.importedAt),
        importedArchiveSchemaVersion: event.importedArchiveSchemaVersion,
        importedEntryCount: event.importedEntryCount
    });
}

// ---------------------------------------------------------------------
// Strict validation. Every function below either returns the validated
// value or `null` — never throws, and never returns a value with fields
// silently dropped or coerced. `validateArchiveJSON()` returns `null` the
// moment ANY part of the payload fails, so `fromJSON()` above can hold its
// own "whole-archive, never partial" contract exactly.
// ---------------------------------------------------------------------

const IPFS_PUBLICATION_RECORD_FIELDS = ['contentHash', 'locator', 'publishedAt', 'publicationMethod'];
const BITCOIN_BROADCAST_RECORD_FIELDS = ['recordIndex', 'anchorId', 'txid', 'state', 'reason', 'broadcastedAt'];
const IPFS_VERIFICATION_OBSERVATION_FIELDS = ['state', 'contentHash', 'locator', 'reason', 'observedAt'];
const BITCOIN_CONFIRMATION_OBSERVATION_FIELDS = ['state', 'txid', 'blockHash', 'blockHeight', 'confirmationCount', 'reason', 'observedAt'];
const BITCOIN_CONTENT_PROOF_OBSERVATION_FIELDS = ['state', 'contentHash', 'reason', 'observedAt'];
const BITCOIN_ANCHOR_PUBLICATION_RECORD_FIELDS = ['anchorId', 'contentHash', 'txid', 'network', 'createdAt'];
const BASE_TRANSACTION_INCLUSION_OBSERVATION_FIELDS = ['state', 'txid', 'blockHash', 'blockNumber', 'transactionIndex', 'confirmationCount', 'reason', 'observedAt'];
const BASE_ANCHOR_PUBLICATION_RECORD_FIELDS = ['contentHash', 'txid', 'network', 'createdAt'];
const BLOCKCHAIN_PUBLICATION_IDENTITY_FIELDS = ['blockchain', 'contentHash', 'chainReference', 'createdAt'];
const PUBLICATION_REFERENCE_RECORD_FIELDS = ['sourcePublicationIdentity', 'referencedPublicationIdentity', 'createdAt'];
const PUBLISHER_IDENTITY_FIELDS = ['publisherId'];
const PUBLISHER_PUBLICATION_ASSOCIATION_RECORD_FIELDS = ['publisherIdentity', 'publicationIdentity', 'createdAt'];
const LEADERBOARD_CLAIM_RECORD_FIELDS = ['claim', 'receivedAt', 'origin'];
const RECONCILIATION_DECISION_RECORD_FIELDS = ['decided', 'candidate', 'decision', 'decidedAt'];
const RECONCILIATION_DECISION_CANDIDATE_DIVERGENT_CORRESPONDENCE_FIELDS = [
    'selected', 'type', 'claimId', 'snapshotIndex', 'evidenceFingerprintDiffers', 'policyVersionDiffers', 'snapshotFingerprintDiffers'
];
const RECONCILIATION_DECISION_CANDIDATE_CLAIM_WITHOUT_SNAPSHOT_FIELDS = ['selected', 'type', 'claimId'];
const RECONCILIATION_DECISION_CANDIDATE_SNAPSHOT_WITHOUT_CLAIM_FIELDS = ['selected', 'type', 'snapshotIndex'];
const RECONCILIATION_PLAN_IDENTITY_FIELDS = ['algorithm', 'planFingerprint', 'candidateCount'];
const REVALIDATION_OBSERVATION_RECORD_FIELDS = [
    'observed', 'decision', 'planIdentity', 'candidatePresent', 'candidateType', 'candidateMatchesPlan', 'observedAt'
];
const REVALIDATION_OBSERVATION_CANDIDATE_TYPES = ['DIVERGENT_CORRESPONDENCE', 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM'];

function isValidTimestamp(value) {
    if (typeof value !== 'string') return false;
    const parsed = new Date(value);
    return !Number.isNaN(parsed.getTime());
}

function validateIpfsPublicationRecord(record) {
    if (!isPlainObject(record) || !hasOnlyKeys(record, IPFS_PUBLICATION_RECORD_FIELDS)) return null;
    if (typeof record.contentHash !== 'string' || !record.contentHash) return null;
    if (typeof record.locator !== 'string' || !record.locator.startsWith('ipfs://')) return null;
    if (!isValidTimestamp(record.publishedAt)) return null;
    if (record.publicationMethod !== null && typeof record.publicationMethod !== 'string') return null;
    return record;
}

function validateObservation(observation, allowedFields) {
    if (!isPlainObject(observation) || !hasOnlyKeys(observation, allowedFields)) return null;
    if (!allowedFields.every((key) => key in observation)) return null;
    if (!isValidTimestamp(observation.observedAt)) return null;
    return observation;
}

function validateBitcoinBroadcastRecord(record) {
    if (!isPlainObject(record) || !hasOnlyKeys(record, BITCOIN_BROADCAST_RECORD_FIELDS)) return null;
    if (!BITCOIN_BROADCAST_RECORD_FIELDS.every((key) => key in record)) return null;
    if (record.recordIndex !== null && !Number.isInteger(record.recordIndex)) return null;
    if (typeof record.anchorId !== 'string' || !record.anchorId) return null;
    if (!isValidTimestamp(record.broadcastedAt)) return null;
    return record;
}

// Exported so AchievementEvidenceExport validates these four record shapes with
// the same strictness.
export function validateBitcoinAnchorPublicationRecord(record) {
    if (!isPlainObject(record) || !hasOnlyKeys(record, BITCOIN_ANCHOR_PUBLICATION_RECORD_FIELDS)) return null;
    if (!BITCOIN_ANCHOR_PUBLICATION_RECORD_FIELDS.every((key) => key in record)) return null;
    if (typeof record.anchorId !== 'string' || !record.anchorId) return null;
    if (typeof record.contentHash !== 'string' || !record.contentHash) return null;
    if (typeof record.txid !== 'string' || !record.txid) return null;
    if (typeof record.network !== 'string' || !record.network) return null;
    if (!isValidTimestamp(record.createdAt)) return null;
    return record;
}

export function validateBaseAnchorPublicationRecord(record) {
    if (!isPlainObject(record) || !hasOnlyKeys(record, BASE_ANCHOR_PUBLICATION_RECORD_FIELDS)) return null;
    if (!BASE_ANCHOR_PUBLICATION_RECORD_FIELDS.every((key) => key in record)) return null;
    if (typeof record.contentHash !== 'string' || !record.contentHash) return null;
    if (typeof record.txid !== 'string' || !record.txid) return null;
    if (typeof record.network !== 'string' || !record.network) return null;
    if (!isValidTimestamp(record.createdAt)) return null;
    return record;
}

function validateBlockchainPublicationIdentityJSON(value) {
    if (!isPlainObject(value) || !hasOnlyKeys(value, BLOCKCHAIN_PUBLICATION_IDENTITY_FIELDS)) return null;
    if (!BLOCKCHAIN_PUBLICATION_IDENTITY_FIELDS.every((key) => key in value)) return null;
    if (!isValidBlockchainKind(value.blockchain)) return null;
    if (typeof value.contentHash !== 'string' || !value.contentHash) return null;
    if (typeof value.chainReference !== 'string' || !value.chainReference) return null;
    if (!isValidTimestamp(value.createdAt)) return null;
    return value;
}

export function validatePublicationReferenceRecord(record) {
    if (!isPlainObject(record) || !hasOnlyKeys(record, PUBLICATION_REFERENCE_RECORD_FIELDS)) return null;
    if (!PUBLICATION_REFERENCE_RECORD_FIELDS.every((key) => key in record)) return null;
    if (!validateBlockchainPublicationIdentityJSON(record.sourcePublicationIdentity)) return null;
    if (!validateBlockchainPublicationIdentityJSON(record.referencedPublicationIdentity)) return null;
    if (!isValidTimestamp(record.createdAt)) return null;
    return record;
}

function validatePublisherIdentityJSON(value) {
    if (!isPlainObject(value) || !hasOnlyKeys(value, PUBLISHER_IDENTITY_FIELDS)) return null;
    if (!PUBLISHER_IDENTITY_FIELDS.every((key) => key in value)) return null;
    if (typeof value.publisherId !== 'string' || !value.publisherId) return null;
    return value;
}

export function validatePublisherPublicationAssociationRecord(record) {
    if (!isPlainObject(record) || !hasOnlyKeys(record, PUBLISHER_PUBLICATION_ASSOCIATION_RECORD_FIELDS)) return null;
    if (!PUBLISHER_PUBLICATION_ASSOCIATION_RECORD_FIELDS.every((key) => key in record)) return null;
    if (!validatePublisherIdentityJSON(record.publisherIdentity)) return null;
    if (!validateBlockchainPublicationIdentityJSON(record.publicationIdentity)) return null;
    if (!isValidTimestamp(record.createdAt)) return null;
    return record;
}

// Deep validation is delegated to LeaderboardClaimRecord.fromJSON().
function validateLeaderboardClaimRecord(record) {
    if (!isPlainObject(record) || !hasOnlyKeys(record, LEADERBOARD_CLAIM_RECORD_FIELDS)) return null;
    if (!LEADERBOARD_CLAIM_RECORD_FIELDS.every((key) => key in record)) return null;
    if (!LeaderboardClaimRecord.fromJSON(record)) return null;
    return record;
}

// One of the three candidate shapes, checked inline (this file never calls the
// reconciliation modules).
function validateReconciliationDecisionCandidate(candidate) {
    if (!isPlainObject(candidate) || candidate.selected !== true) return null;

    if (candidate.type === 'DIVERGENT_CORRESPONDENCE') {
        if (!hasOnlyKeys(candidate, RECONCILIATION_DECISION_CANDIDATE_DIVERGENT_CORRESPONDENCE_FIELDS)) return null;
        if (!RECONCILIATION_DECISION_CANDIDATE_DIVERGENT_CORRESPONDENCE_FIELDS.every((key) => key in candidate)) return null;
        if (typeof candidate.claimId !== 'string' || !candidate.claimId) return null;
        if (!Number.isInteger(candidate.snapshotIndex)) return null;
        if (typeof candidate.evidenceFingerprintDiffers !== 'boolean') return null;
        if (typeof candidate.policyVersionDiffers !== 'boolean') return null;
        if (typeof candidate.snapshotFingerprintDiffers !== 'boolean') return null;
        return candidate;
    }

    if (candidate.type === 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT') {
        if (!hasOnlyKeys(candidate, RECONCILIATION_DECISION_CANDIDATE_CLAIM_WITHOUT_SNAPSHOT_FIELDS)) return null;
        if (!RECONCILIATION_DECISION_CANDIDATE_CLAIM_WITHOUT_SNAPSHOT_FIELDS.every((key) => key in candidate)) return null;
        if (typeof candidate.claimId !== 'string' || !candidate.claimId) return null;
        return candidate;
    }

    if (candidate.type === 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM') {
        if (!hasOnlyKeys(candidate, RECONCILIATION_DECISION_CANDIDATE_SNAPSHOT_WITHOUT_CLAIM_FIELDS)) return null;
        if (!RECONCILIATION_DECISION_CANDIDATE_SNAPSHOT_WITHOUT_CLAIM_FIELDS.every((key) => key in candidate)) return null;
        if (!Number.isInteger(candidate.snapshotIndex)) return null;
        return candidate;
    }

    return null;
}

function validateReconciliationDecisionRecord(record) {
    if (!isPlainObject(record) || !hasOnlyKeys(record, RECONCILIATION_DECISION_RECORD_FIELDS)) return null;
    if (!RECONCILIATION_DECISION_RECORD_FIELDS.every((key) => key in record)) return null;
    if (record.decided !== true) return null;
    if (record.decision !== 'OBSERVE' && record.decision !== 'DEFER') return null;
    if (!isValidTimestamp(record.decidedAt)) return null;
    if (!validateReconciliationDecisionCandidate(record.candidate)) return null;
    return record;
}

// Shape only; no fingerprint is recomputed.
function validateRevalidationPlanIdentity(value) {
    if (!isPlainObject(value) || !hasOnlyKeys(value, RECONCILIATION_PLAN_IDENTITY_FIELDS)) return null;
    if (!RECONCILIATION_PLAN_IDENTITY_FIELDS.every((key) => key in value)) return null;
    if (value.algorithm !== 'SHA-256') return null;
    if (typeof value.planFingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(value.planFingerprint)) return null;
    if (!Number.isInteger(value.candidateCount) || value.candidateCount < 0) return null;
    return value;
}

// Shape only.
function validateRevalidationObservationRecord(record) {
    if (!isPlainObject(record) || !hasOnlyKeys(record, REVALIDATION_OBSERVATION_RECORD_FIELDS)) return null;
    if (!REVALIDATION_OBSERVATION_RECORD_FIELDS.every((key) => key in record)) return null;
    if (record.observed !== true) return null;
    if (!validateReconciliationDecisionRecord(record.decision)) return null;
    if (!validateRevalidationPlanIdentity(record.planIdentity)) return null;
    if (typeof record.candidatePresent !== 'boolean') return null;
    if (!REVALIDATION_OBSERVATION_CANDIDATE_TYPES.includes(record.candidateType)) return null;
    if (typeof record.candidateMatchesPlan !== 'boolean') return null;
    if (!isValidTimestamp(record.observedAt)) return null;
    return record;
}

export function validateArray(value, itemValidator) {
    if (!Array.isArray(value)) return null;
    const validated = [];
    for (const item of value) {
        const result = itemValidator(item);
        if (!result) return null;
        validated.push(result);
    }
    return validated;
}

function validateObservationsByKey(value, allowedFields) {
    if (!isPlainObject(value)) return null;
    const validated = {};
    for (const [key, observations] of Object.entries(value)) {
        const result = validateArray(observations, (observation) => validateObservation(observation, allowedFields));
        if (!result) return null;
        validated[key] = result;
    }
    return validated;
}

// A provenance array must match its factual array's length exactly, and a
// by-key object must have exactly the same keys; anything else means corrupted
// or hand-edited data.
function validateProvenanceArray(value, expectedLength) {
    if (!Array.isArray(value) || value.length !== expectedLength) return null;
    if (!value.every(isValidPublicationObservationArchiveProvenanceOrigin)) return null;
    return value;
}

function validateProvenanceByKey(value, expectedLengthsByKey) {
    if (!isPlainObject(value)) return null;
    const expectedKeys = Object.keys(expectedLengthsByKey);
    const actualKeys = Object.keys(value);
    if (expectedKeys.length !== actualKeys.length) return null;
    if (!expectedKeys.every((key) => key in value)) return null;
    const validated = {};
    for (const key of expectedKeys) {
        const result = validateProvenanceArray(value[key], expectedLengthsByKey[key]);
        if (!result) return null;
        validated[key] = result;
    }
    return validated;
}

function lengthsByKey(observationsByKey) {
    return Object.fromEntries(Object.entries(observationsByKey).map(([key, observations]) => [key, observations.length]));
}

const ARCHIVE_IMPORT_EVENT_FIELDS = ['importedAt', 'importedArchiveSchemaVersion', 'importedEntryCount'];

function validateArchiveImportEvent(event) {
    if (!isPlainObject(event) || !hasOnlyKeys(event, ARCHIVE_IMPORT_EVENT_FIELDS)) return null;
    if (!ARCHIVE_IMPORT_EVENT_FIELDS.every((key) => key in event)) return null;
    if (!isValidTimestamp(event.importedAt)) return null;
    if (!Number.isInteger(event.importedArchiveSchemaVersion) || event.importedArchiveSchemaVersion < 1) return null;
    if (!Number.isInteger(event.importedEntryCount) || event.importedEntryCount < 0) return null;
    return event;
}

const TOP_LEVEL_FIELDS = [
    'schemaVersion',
    'ipfsPublicationRecords',
    'ipfsPublicationRecordProvenance',
    'ipfsContentVerificationObservationsByRecordIndex',
    'ipfsContentVerificationObservationProvenanceByRecordIndex',
    'bitcoinBroadcastRecords',
    'bitcoinBroadcastRecordProvenance',
    'bitcoinConfirmationObservationsByAnchorId',
    'bitcoinConfirmationObservationProvenanceByAnchorId',
    'bitcoinContentProofObservationsByAnchorId',
    'bitcoinContentProofObservationProvenanceByAnchorId',
    'bitcoinAnchorPublicationRecords',
    'bitcoinAnchorPublicationRecordProvenance',
    'baseTransactionInclusionObservationsByTransactionHash',
    'baseTransactionInclusionObservationProvenanceByTransactionHash',
    'baseAnchorPublicationRecords',
    'baseAnchorPublicationRecordProvenance',
    'publicationReferenceRecords',
    'publicationReferenceRecordProvenance',
    'publisherPublicationAssociationRecords',
    'publisherPublicationAssociationRecordProvenance',
    'leaderboardClaimRecords',
    'leaderboardClaimRecordProvenance',
    'reconciliationDecisionRecords',
    'reconciliationDecisionRecordProvenance',
    'revalidationObservationRecords',
    'revalidationObservationRecordProvenance',
    'archiveImportEvents'
];

function validateArchiveJSON(json) {
    if (!isPlainObject(json) || !hasOnlyKeys(json, TOP_LEVEL_FIELDS)) return null;
    if (!TOP_LEVEL_FIELDS.every((key) => key in json)) return null;
    if (json.schemaVersion !== SCHEMA_VERSION) return null;

    const ipfsPublicationRecords = validateArray(json.ipfsPublicationRecords, validateIpfsPublicationRecord);
    if (!ipfsPublicationRecords) return null;
    const ipfsPublicationRecordProvenance = validateProvenanceArray(json.ipfsPublicationRecordProvenance, ipfsPublicationRecords.length);
    if (!ipfsPublicationRecordProvenance) return null;

    const ipfsContentVerificationObservationsByRecordIndex = validateObservationsByKey(
        json.ipfsContentVerificationObservationsByRecordIndex, IPFS_VERIFICATION_OBSERVATION_FIELDS
    );
    if (!ipfsContentVerificationObservationsByRecordIndex) return null;
    const ipfsContentVerificationObservationProvenanceByRecordIndex = validateProvenanceByKey(
        json.ipfsContentVerificationObservationProvenanceByRecordIndex, lengthsByKey(ipfsContentVerificationObservationsByRecordIndex)
    );
    if (!ipfsContentVerificationObservationProvenanceByRecordIndex) return null;

    const bitcoinBroadcastRecords = validateArray(json.bitcoinBroadcastRecords, validateBitcoinBroadcastRecord);
    if (!bitcoinBroadcastRecords) return null;
    const bitcoinBroadcastRecordProvenance = validateProvenanceArray(json.bitcoinBroadcastRecordProvenance, bitcoinBroadcastRecords.length);
    if (!bitcoinBroadcastRecordProvenance) return null;

    const bitcoinConfirmationObservationsByAnchorId = validateObservationsByKey(
        json.bitcoinConfirmationObservationsByAnchorId, BITCOIN_CONFIRMATION_OBSERVATION_FIELDS
    );
    if (!bitcoinConfirmationObservationsByAnchorId) return null;
    const bitcoinConfirmationObservationProvenanceByAnchorId = validateProvenanceByKey(
        json.bitcoinConfirmationObservationProvenanceByAnchorId, lengthsByKey(bitcoinConfirmationObservationsByAnchorId)
    );
    if (!bitcoinConfirmationObservationProvenanceByAnchorId) return null;

    const bitcoinContentProofObservationsByAnchorId = validateObservationsByKey(
        json.bitcoinContentProofObservationsByAnchorId, BITCOIN_CONTENT_PROOF_OBSERVATION_FIELDS
    );
    if (!bitcoinContentProofObservationsByAnchorId) return null;
    const bitcoinContentProofObservationProvenanceByAnchorId = validateProvenanceByKey(
        json.bitcoinContentProofObservationProvenanceByAnchorId, lengthsByKey(bitcoinContentProofObservationsByAnchorId)
    );
    if (!bitcoinContentProofObservationProvenanceByAnchorId) return null;

    const bitcoinAnchorPublicationRecords = validateArray(json.bitcoinAnchorPublicationRecords, validateBitcoinAnchorPublicationRecord);
    if (!bitcoinAnchorPublicationRecords) return null;
    const bitcoinAnchorPublicationRecordProvenance = validateProvenanceArray(json.bitcoinAnchorPublicationRecordProvenance, bitcoinAnchorPublicationRecords.length);
    if (!bitcoinAnchorPublicationRecordProvenance) return null;

    const baseTransactionInclusionObservationsByTransactionHash = validateObservationsByKey(
        json.baseTransactionInclusionObservationsByTransactionHash, BASE_TRANSACTION_INCLUSION_OBSERVATION_FIELDS
    );
    if (!baseTransactionInclusionObservationsByTransactionHash) return null;
    const baseTransactionInclusionObservationProvenanceByTransactionHash = validateProvenanceByKey(
        json.baseTransactionInclusionObservationProvenanceByTransactionHash, lengthsByKey(baseTransactionInclusionObservationsByTransactionHash)
    );
    if (!baseTransactionInclusionObservationProvenanceByTransactionHash) return null;

    const baseAnchorPublicationRecords = validateArray(json.baseAnchorPublicationRecords, validateBaseAnchorPublicationRecord);
    if (!baseAnchorPublicationRecords) return null;
    const baseAnchorPublicationRecordProvenance = validateProvenanceArray(json.baseAnchorPublicationRecordProvenance, baseAnchorPublicationRecords.length);
    if (!baseAnchorPublicationRecordProvenance) return null;

    const publicationReferenceRecords = validateArray(json.publicationReferenceRecords, validatePublicationReferenceRecord);
    if (!publicationReferenceRecords) return null;
    const publicationReferenceRecordProvenance = validateProvenanceArray(json.publicationReferenceRecordProvenance, publicationReferenceRecords.length);
    if (!publicationReferenceRecordProvenance) return null;

    const publisherPublicationAssociationRecords = validateArray(json.publisherPublicationAssociationRecords, validatePublisherPublicationAssociationRecord);
    if (!publisherPublicationAssociationRecords) return null;
    const publisherPublicationAssociationRecordProvenance = validateProvenanceArray(json.publisherPublicationAssociationRecordProvenance, publisherPublicationAssociationRecords.length);
    if (!publisherPublicationAssociationRecordProvenance) return null;

    const leaderboardClaimRecords = validateArray(json.leaderboardClaimRecords, validateLeaderboardClaimRecord);
    if (!leaderboardClaimRecords) return null;
    const leaderboardClaimRecordProvenance = validateProvenanceArray(json.leaderboardClaimRecordProvenance, leaderboardClaimRecords.length);
    if (!leaderboardClaimRecordProvenance) return null;

    const reconciliationDecisionRecords = validateArray(json.reconciliationDecisionRecords, validateReconciliationDecisionRecord);
    if (!reconciliationDecisionRecords) return null;
    const reconciliationDecisionRecordProvenance = validateProvenanceArray(json.reconciliationDecisionRecordProvenance, reconciliationDecisionRecords.length);
    if (!reconciliationDecisionRecordProvenance) return null;

    const revalidationObservationRecords = validateArray(json.revalidationObservationRecords, validateRevalidationObservationRecord);
    if (!revalidationObservationRecords) return null;
    const revalidationObservationRecordProvenance = validateProvenanceArray(json.revalidationObservationRecordProvenance, revalidationObservationRecords.length);
    if (!revalidationObservationRecordProvenance) return null;

    const archiveImportEvents = validateArray(json.archiveImportEvents, validateArchiveImportEvent);
    if (!archiveImportEvents) return null;

    return {
        ipfsPublicationRecords,
        ipfsPublicationRecordProvenance,
        ipfsContentVerificationObservationsByRecordIndex,
        ipfsContentVerificationObservationProvenanceByRecordIndex,
        bitcoinBroadcastRecords,
        bitcoinBroadcastRecordProvenance,
        bitcoinConfirmationObservationsByAnchorId,
        bitcoinConfirmationObservationProvenanceByAnchorId,
        bitcoinContentProofObservationsByAnchorId,
        bitcoinContentProofObservationProvenanceByAnchorId,
        bitcoinAnchorPublicationRecords,
        bitcoinAnchorPublicationRecordProvenance,
        baseTransactionInclusionObservationsByTransactionHash,
        baseTransactionInclusionObservationProvenanceByTransactionHash,
        baseAnchorPublicationRecords,
        baseAnchorPublicationRecordProvenance,
        publicationReferenceRecords,
        publicationReferenceRecordProvenance,
        publisherPublicationAssociationRecords,
        publisherPublicationAssociationRecordProvenance,
        leaderboardClaimRecords,
        leaderboardClaimRecordProvenance,
        reconciliationDecisionRecords,
        reconciliationDecisionRecordProvenance,
        revalidationObservationRecords,
        revalidationObservationRecordProvenance,
        archiveImportEvents
    };
}
