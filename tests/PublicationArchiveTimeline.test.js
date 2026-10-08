// A card's History reads the durable Publication Observation Archive, so it
// survives a reload: only the facts the archive binds to this publication
// (IPFS records by content hash with their verifications, Bitcoin by anchor
// id, Base by the transactions of this content hash), oldest first, each
// broadcast once and no confirmation repeated.
import { describePublicationArchiveTimeline } from '../application/publication/observationArchive/PublicationArchiveTimeline.js';
import { PublicationObservationTimelineEntryKind } from '../application/publication/observationArchive/PublicationObservationTimelineView.js';
import { PublicationObservationArchive } from '../application/publication/observationArchive/PublicationObservationArchive.js';
import { LocalStoragePublicationObservationArchive } from '../storage/LocalStoragePublicationObservationArchive.js';
import { IpfsPublicationRecord, IpfsPublicationMethod } from '../application/ipfs/IpfsPublicationRecord.js';
import { IpfsPublicationContentVerificationState } from '../application/ipfs/IpfsPublicationContentVerificationState.js';
import { BitcoinAnchorConfirmationState } from '../application/anchoring/bitcoin/BitcoinAnchorConfirmationState.js';
import { BaseTransactionInclusionObservationState } from '../application/anchoring/base/BaseTransactionInclusionObservationState.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/anchoring/bitcoin/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { CreateBaseAnchorPublicationRecordUseCase } from '../application/anchoring/base/CreateBaseAnchorPublicationRecordUseCase.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

const MINE = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);
const TX_MINE = '1'.repeat(64);
const TX_OTHER = '2'.repeat(64);
const TX_BASE = '0x' + '3'.repeat(64);
const at = (minute) => new Date(`2026-10-08T00:${String(minute).padStart(2, '0')}:00Z`);
const kinds = (timeline) => timeline.entries.map((entry) => entry.kind);

let archive = PublicationObservationArchive.empty();
archive = archive.appendIpfsPublicationRecord(new IpfsPublicationRecord({
    contentHash: OTHER, locator: 'ipfs://bafy-other', publishedAt: at(1), publicationMethod: IpfsPublicationMethod.REMOTE_PINNING
}));
archive = archive.appendIpfsPublicationRecord(new IpfsPublicationRecord({
    contentHash: MINE, locator: 'ipfs://bafy-mine', publishedAt: at(2), publicationMethod: IpfsPublicationMethod.REMOTE_PINNING
}));
// The archive keeps verifications by its own record index: 1 is MINE's.
archive = archive.appendIpfsContentVerificationObservation(1, {
    state: IpfsPublicationContentVerificationState.HASH_MATCH, contentHash: MINE, locator: 'ipfs://bafy-mine', reason: null, observedAt: at(3)
});
archive = archive.appendIpfsContentVerificationObservation(0, {
    state: IpfsPublicationContentVerificationState.HASH_MATCH, contentHash: OTHER, locator: 'ipfs://bafy-other', reason: null, observedAt: at(3)
});
const btc = new CreateBitcoinAnchorPublicationRecordUseCase();
archive = btc.execute(archive, { anchorId: TX_MINE, contentHash: MINE, txid: TX_MINE, network: 'mainnet', createdAt: at(4) });
archive = btc.execute(archive, { anchorId: TX_OTHER, contentHash: OTHER, txid: TX_OTHER, network: 'mainnet', createdAt: at(4) });
// Broadcast twice ("Broadcast Again"), then confirmed once.
archive = archive.appendBitcoinBroadcastRecord({ anchorId: TX_MINE, txid: TX_MINE, state: 'broadcasted', broadcastedAt: at(5) });
archive = archive.appendBitcoinBroadcastRecord({ anchorId: TX_MINE, txid: TX_MINE, state: 'broadcasted', broadcastedAt: at(6) });
archive = archive.appendBitcoinBroadcastRecord({ anchorId: TX_OTHER, txid: TX_OTHER, state: 'broadcasted', broadcastedAt: at(6) });
archive = archive.appendBitcoinConfirmationObservation(TX_MINE, {
    state: BitcoinAnchorConfirmationState.CONFIRMED, txid: TX_MINE, blockHash: 'c'.repeat(64),
    blockHeight: 900000, confirmationCount: 1, reason: null, observedAt: at(7)
});
// A discovered anchor's own confirmation, under its anchor id.
archive = archive.appendBitcoinConfirmationObservation('discovered-anchor', {
    state: BitcoinAnchorConfirmationState.CONFIRMED, txid: '4'.repeat(64), blockHash: 'd'.repeat(64),
    blockHeight: 900001, confirmationCount: 2, reason: null, observedAt: at(9)
});
archive = new CreateBaseAnchorPublicationRecordUseCase().execute(archive, { contentHash: MINE, txid: TX_BASE, network: 'base', createdAt: at(4) });
archive = archive.appendBaseTransactionInclusionObservation(TX_BASE, {
    state: BaseTransactionInclusionObservationState.INCLUDED, txid: TX_BASE, blockHash: 'e'.repeat(64), blockNumber: 25000000,
    transactionIndex: 0, confirmationCount: 1, reason: null, observedAt: at(8)
});

const timeline = describePublicationArchiveTimeline(archive, { contentHash: MINE });
assert(kinds(timeline).join() === [
    PublicationObservationTimelineEntryKind.IPFS_PUBLICATION,
    PublicationObservationTimelineEntryKind.IPFS_CONTENT_VERIFICATION,
    PublicationObservationTimelineEntryKind.BITCOIN_BROADCAST,
    PublicationObservationTimelineEntryKind.BITCOIN_BROADCAST,
    PublicationObservationTimelineEntryKind.BITCOIN_CONFIRMATION,
    PublicationObservationTimelineEntryKind.BASE_TRANSACTION_INCLUSION
].join(), `only this publication's facts, oldest first, each broadcast once and one confirmation (got ${kinds(timeline).join()})`);
assert(timeline.entries[0].locator === 'ipfs://bafy-mine' && timeline.entries.every((entry) => entry.txid !== TX_OTHER),
    "another publication's IPFS record and Bitcoin anchor are left out");
console.log('✓ the History picks this publication out of the archive');

const withDiscovered = describePublicationArchiveTimeline(archive, { contentHash: MINE, bitcoinAnchorIds: ['discovered-anchor'] });
assert(withDiscovered.count === timeline.count + 1 && withDiscovered.entries.at(-1).anchorId === 'discovered-anchor',
    'a Bitcoin anchor from the evidence list adds its own observations');
console.log('✓ anchors from the evidence list join by their anchor id');

// What a reload sees: the archive saved and loaded again.
const storage = new LocalStoragePublicationObservationArchive(new InMemoryStorageProvider());
storage.save(archive);
const reloaded = describePublicationArchiveTimeline(storage.load(), { contentHash: MINE });
assert(JSON.stringify(kinds(reloaded)) === JSON.stringify(kinds(timeline)), 'the same History after a reload');
console.log('✓ the History survives a reload');

assert(describePublicationArchiveTimeline(archive, { contentHash: 'f'.repeat(64) }).count === 0, 'nothing recorded is an empty History');
assert(describePublicationArchiveTimeline(null, { contentHash: MINE }).count === 0, 'and so is no archive');
console.log('✓ nothing recorded is an empty History');
