import { describePublicationObservationTimeline } from './PublicationObservationTimelineView.js';

// One publication's History, read from the durable Publication Observation
// Archive, so it survives a reload: every IPFS publish and verification,
// Bitcoin broadcast, confirmation and content proof, and Base inclusion this
// device recorded for it.
//
// Which facts belong to the publication is decided only by what the archive
// itself binds them to, never guessed:
// - IPFS records by their own contentHash, with each record's verifications;
// - Bitcoin by anchorId: the anchors in this device's Bitcoin Anchor
//   Publication records for the contentHash, and the Bitcoin anchors the
//   caller knows for the publication (its evidence list);
// - Base by transaction hash: the transactions in this device's Base Anchor
//   Publication records for the contentHash.
// Pure: reads the archive and returns the timeline view, writing nothing.
export function describePublicationArchiveTimeline(archive, { contentHash, bitcoinAnchorIds = [] } = {}) {
    if (!archive || typeof contentHash !== 'string' || !contentHash) {
        return describePublicationObservationTimeline({});
    }

    const publicationRecords = [];
    const verificationHistoriesByRecordIndex = {};
    const verifications = archive.ipfsContentVerificationObservationsByRecordIndex || {};
    (archive.ipfsPublicationRecords || []).forEach((record, archiveIndex) => {
        if (!record || record.contentHash !== contentHash) return;
        verificationHistoriesByRecordIndex[publicationRecords.length] = verifications[archiveIndex] || [];
        publicationRecords.push(record);
    });

    const anchorIds = new Set((Array.isArray(bitcoinAnchorIds) ? bitcoinAnchorIds : []).filter(Boolean));
    (archive.bitcoinAnchorPublicationRecords || []).forEach((record) => {
        if (record && record.contentHash === contentHash && record.anchorId) anchorIds.add(record.anchorId);
    });
    const anchors = [...anchorIds].map((anchorId) => ({ recordIndex: null, anchorId, txid: null, broadcastedAt: null, broadcast: null }));
    const broadcasts = (archive.bitcoinBroadcastRecords || [])
        .filter((record) => record && anchorIds.has(record.anchorId))
        .map((record) => ({
            recordIndex: null,
            anchorId: record.anchorId,
            txid: record.txid,
            broadcastedAt: record.broadcastedAt,
            broadcast: { state: record.state, txid: record.txid, reason: record.reason }
        }));
    const pick = (byAnchorId) => Object.fromEntries([...anchorIds].map((anchorId) => [anchorId, (byAnchorId || {})[anchorId] || []]));

    const inclusions = archive.baseTransactionInclusionObservationsByTransactionHash || {};
    const observationsByTransactionHash = {};
    (archive.baseAnchorPublicationRecords || []).forEach((record) => {
        if (record && record.contentHash === contentHash && record.txid && inclusions[record.txid]) {
            observationsByTransactionHash[record.txid] = inclusions[record.txid];
        }
    });

    return describePublicationObservationTimeline({
        ipfs: { publicationRecords, verificationHistoriesByRecordIndex },
        bitcoin: {
            anchors,
            broadcasts,
            confirmationHistoriesByAnchorId: pick(archive.bitcoinConfirmationObservationsByAnchorId),
            proofObservationsByAnchorId: pick(archive.bitcoinContentProofObservationsByAnchorId)
        },
        base: { observationsByTransactionHash }
    });
}
