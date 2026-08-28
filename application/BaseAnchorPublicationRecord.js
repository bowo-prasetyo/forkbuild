import { BlockchainKind } from './BlockchainKind.js';
import { BlockchainPublicationIdentity } from './BlockchainPublicationIdentity.js';

// 0.8.99 — Durable Base Publication Identity Record.
//
// Every Base milestone since 0.8.90 (application/BaseNetworkObserver.js)
// through 0.8.98 (application/BaseTransactionInclusionObservationTimelineView.js)
// has connected its own stage to the next only by whatever ephemeral UI
// state a page keeps, and by a `txid` string a caller happens to pass
// consistently between them. Nothing durable has ever said, in one place:
// "this particular Base publication attempt is THIS thing." This class is
// that one thing — the Base counterpart application/
// BitcoinAnchorPublicationRecord.js's own header (0.8.80) already
// established one chain over:
//
//   { contentHash, txid, network, createdAt }
//
// IDENTITY, NOT A VERDICT — the identical restraint application/
// BitcoinAnchorPublicationRecord.js's own header holds, held here again.
// This class names WHAT was published (`contentHash`), AS WHICH Base
// transaction (`txid`), on WHICH network (`network`), and WHEN this
// replica minted that identity (`createdAt`) — and nothing else. It never
// carries `included`, `confirmed`, `valid`, `trusted`, `safe`, `healthy`,
// `canonical`, or `status` — and never any DERIVED, mutable inclusion
// state of any kind. Whether this publication was later included in a
// block, whether that placement stayed stable — every one of those
// questions belongs entirely to application/PublicationObservationArchive.js's
// own, separately kept `baseTransactionInclusionObservationsByTransactionHash`
// collection (0.8.96/0.8.97) — never to this class. See docs/Principles.md,
// "The UI Displays Observations; It Does Not Turn Them Into A Verdict
// (0.8.57)," held here once more, one layer higher: a publication record
// establishes identity; observations establish what was subsequently
// observed about that identity.
//
// NO `anchorId` FIELD — A DELIBERATE DIFFERENCE FROM BITCOIN, NOT AN
// OVERSIGHT. application/BitcoinAnchorPublicationRecord.js carries both an
// `anchorId` (an arbitrary, caller-supplied correlation key) AND a `txid`,
// because Bitcoin's own observation vocabulary — application/
// BitcoinAnchorObservationEvidence.js (0.8.78) onward — already correlates
// every observation by `anchorId` alone, never by `txid` or `contentHash`.
// Base's own observation vocabulary never introduced an equivalent second
// key: `application/BaseTransactionInclusionObserver.js`#`observeInclusion()`
// (0.8.96) and `PublicationObservationArchive.js`'s own
// `baseTransactionInclusionObservationsByTransactionHash` (0.8.97) are both
// keyed by `txid` alone — see that observer's own header, "`txid` is a
// trusted internal artifact... This class still names its own field `txid`,
// not `transactionHash`, purely to stay the SAME field name application/
// BaseTransactionBroadcastView.js already exposes." This class holds that
// identical, already-established Base convention rather than importing
// Bitcoin's own two-key shape where Base has never needed one: `txid` IS
// this record's own correlation key, for identity and for every future
// lookup alike.
//
// `blockchain` AND `toBlockchainPublicationIdentity()` — THE SAME
// MULTI-BLOCKCHAIN PROJECTION application/BitcoinAnchorPublicationRecord.js
// ALREADY GAINED IN 0.8.89. `blockchain` is a computed constant
// (`BlockchainKind.BASE`), never a stored field, so `toJSON()`'s own shape
// needs no extra field. `toBlockchainPublicationIdentity()` projects this
// record's own `contentHash`/`txid`/`createdAt` onto application/
// BlockchainPublicationIdentity.js's chain-independent shape — the
// identical `chainReference` slot `BitcoinAnchorPublicationRecord`'s own
// `txid` already fills, one chain over. See that class's own header for
// why `blockchain` + `chainReference` together, and never `contentHash`
// alone, is the only identity two publications are ever compared by — the
// reason a Base publication and a same-`contentHash` Bitcoin publication
// can never be mistaken for one another, and the reason two Base
// publications that happen to commit the identical `contentHash` under two
// different `txid`s are never merged either.
//
// IMMUTABLE, AND NEVER GIVEN A SECOND CONSTRUCTOR PATH — the identical
// discipline application/BitcoinAnchorPublicationRecord.js's own header
// already holds. Every field is validated once, at construction, and
// frozen; there is no setter, no `withXxx()` wither, and no way to produce
// a "corrected" record other than minting an entirely new one. See
// application/CreateBaseAnchorPublicationRecordUseCase.js for the one
// place this codebase is expected to construct one.
export class BaseAnchorPublicationRecord {
    constructor({ contentHash, txid, network, createdAt } = {}) {
        if (typeof contentHash !== 'string' || !contentHash.trim()) {
            throw new Error('BaseAnchorPublicationRecord requires a non-empty contentHash');
        }
        if (typeof txid !== 'string' || !txid.trim()) {
            throw new Error('BaseAnchorPublicationRecord requires a non-empty txid');
        }
        if (typeof network !== 'string' || !network.trim()) {
            throw new Error('BaseAnchorPublicationRecord requires a non-empty network');
        }
        const createdAtDate = createdAt instanceof Date ? createdAt : new Date(createdAt);
        if (Number.isNaN(createdAtDate.getTime())) {
            throw new Error('BaseAnchorPublicationRecord: createdAt must be a valid date');
        }
        this._contentHash = contentHash;
        this._txid = txid;
        this._network = network;
        this._createdAt = createdAtDate;
        Object.freeze(this);
    }

    get contentHash() { return this._contentHash; }
    get txid() { return this._txid; }
    get network() { return this._network; }
    get createdAt() { return this._createdAt; }

    // Always `BlockchainKind.BASE` — computed, never stored. See this
    // file's own header note above.
    get blockchain() { return BlockchainKind.BASE; }

    // Projects this record onto application/BlockchainPublicationIdentity.js's
    // chain-independent shape — `txid` fills that shape's `chainReference`
    // slot, the identical projection application/
    // BitcoinAnchorPublicationRecord.js's own `toBlockchainPublicationIdentity()`
    // already performs, one chain over.
    toBlockchainPublicationIdentity() {
        return new BlockchainPublicationIdentity({
            blockchain: this.blockchain,
            contentHash: this._contentHash,
            chainReference: this._txid,
            createdAt: this._createdAt
        });
    }

    toJSON() {
        return {
            contentHash: this._contentHash,
            txid: this._txid,
            network: this._network,
            createdAt: this._createdAt.toISOString()
        };
    }

    static fromJSON(json) {
        if (!json) return null;
        return new BaseAnchorPublicationRecord({
            contentHash: json.contentHash,
            txid: json.txid,
            network: json.network,
            createdAt: json.createdAt
        });
    }
}
