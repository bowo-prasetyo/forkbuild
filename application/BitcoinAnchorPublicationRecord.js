// 0.8.80 — Explicit Bitcoin Anchor Publication Lifecycle Record.
//
// Every stage from application/BitcoinAnchorFundingObservationState.js
// through application/BitcoinAnchorObservationEvidence.js (0.8.78) is
// connected only by whatever ephemeral UI state a page keeps and by a
// shared `anchorId` string a caller happens to pass consistently between
// them. Nothing durable has ever said, in one place: "this particular
// Bitcoin anchor publication attempt is THIS thing." This class is that
// one thing — the identity object this milestone exists to introduce.
//
//   { anchorId, contentHash, txid, network, createdAt }
//
// IDENTITY, NOT A VERDICT. This is the single restraint this whole class
// exists to hold. It names WHAT was published (`contentHash`), AS WHICH
// Bitcoin transaction (`txid`), on WHICH network (`network`), under WHICH
// explicit correlation key (`anchorId`), and WHEN this replica minted that
// identity (`createdAt`) — and nothing else. It never carries `confirmed`,
// `valid`, `trusted`, `safe`, `healthy`, `canonical`, or `status` — and
// never any DERIVED, mutable confirmation state of any kind. Whether this
// publication was later confirmed, whether its placement stayed stable,
// whether its observations stay consistent — every one of those questions
// belongs entirely to application/PublicationObservationArchive.js's own,
// separately kept observation collections and to application/
// BitcoinAnchorDurableEvidenceView.js's own reconstruction over them
// (0.8.79, unchanged) — never to this class. See docs/Principles.md, "The
// UI Displays Observations; It Does Not Turn Them Into A Verdict (0.8.57),"
// held here once more, one layer higher: a publication record establishes
// identity; observations establish what was subsequently observed about
// that identity.
//
// WHY `txid` BELONGS HERE, UNLIKE 0.8.78's OWN anchorId-ONLY RESTRAINT.
// application/BitcoinAnchorObservationEvidence.js's own header (0.8.78)
// deliberately correlates observations by `anchorId` ALONE, never by
// `contentHash` or `txid`, because two anchors sharing a `contentHash` are
// never assumed to be the same anchor. This class does not relax that —
// it is a different kind of fact. `anchorId` is still this replica's own
// arbitrary correlation key; `contentHash`, `txid`, and `network` are the
// three concrete facts THIS publication attempt actually recorded about
// itself at the moment it came to exist. Naming all four here, together,
// once, lets a caller state plainly "anchorId A is publication A, and
// publication A used txid TX-A for content X" — without ever implying
// that a SECOND publication (anchorId B) sharing that same `contentHash`
// or `txid` is somehow the same publication, or should be merged,
// reconciled, or deduplicated with it. See this class's own flagship test
// in tests/BitcoinAnchorPublicationRecord.test.js for the concrete
// two-publications-one-contentHash proof.
//
// IMMUTABLE, AND NEVER GIVEN A SECOND CONSTRUCTOR PATH. Every field is
// validated once, at construction, and frozen; there is no setter, no
// `withXxx()` wither, and no way to produce a "corrected" record other
// than minting an entirely new one. See application/
// CreateBitcoinAnchorPublicationRecordUseCase.js for the one place this
// codebase is expected to construct one.
export class BitcoinAnchorPublicationRecord {
    constructor({ anchorId, contentHash, txid, network, createdAt } = {}) {
        if (typeof anchorId !== 'string' || !anchorId.trim()) {
            throw new Error('BitcoinAnchorPublicationRecord requires a non-empty anchorId');
        }
        if (typeof contentHash !== 'string' || !contentHash.trim()) {
            throw new Error('BitcoinAnchorPublicationRecord requires a non-empty contentHash');
        }
        if (typeof txid !== 'string' || !txid.trim()) {
            throw new Error('BitcoinAnchorPublicationRecord requires a non-empty txid');
        }
        if (typeof network !== 'string' || !network.trim()) {
            throw new Error('BitcoinAnchorPublicationRecord requires a non-empty network');
        }
        const createdAtDate = createdAt instanceof Date ? createdAt : new Date(createdAt);
        if (Number.isNaN(createdAtDate.getTime())) {
            throw new Error('BitcoinAnchorPublicationRecord: createdAt must be a valid date');
        }
        this._anchorId = anchorId;
        this._contentHash = contentHash;
        this._txid = txid;
        this._network = network;
        this._createdAt = createdAtDate;
        Object.freeze(this);
    }

    get anchorId() { return this._anchorId; }
    get contentHash() { return this._contentHash; }
    get txid() { return this._txid; }
    get network() { return this._network; }
    get createdAt() { return this._createdAt; }

    toJSON() {
        return {
            anchorId: this._anchorId,
            contentHash: this._contentHash,
            txid: this._txid,
            network: this._network,
            createdAt: this._createdAt.toISOString()
        };
    }

    static fromJSON(json) {
        if (!json) return null;
        return new BitcoinAnchorPublicationRecord({
            anchorId: json.anchorId,
            contentHash: json.contentHash,
            txid: json.txid,
            network: json.network,
            createdAt: json.createdAt
        });
    }
}
