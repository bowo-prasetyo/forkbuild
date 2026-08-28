import { IpfsPublicationRecord } from './IpfsPublicationRecord.js';
import { appendIpfsPublicationRecordHistoryEntry } from './IpfsPublicationRecordHistory.js';
import { appendIpfsPublicationContentVerificationHistoryEntry } from './IpfsPublicationContentVerificationHistory.js';
import { appendBitcoinAnchorConfirmationObservationHistoryEntry } from './BitcoinAnchorConfirmationObservationHistory.js';
import { BitcoinAnchorPublicationRecord } from './BitcoinAnchorPublicationRecord.js';
import { appendBitcoinAnchorPublicationRecordHistoryEntry } from './BitcoinAnchorPublicationRecordHistory.js';

const SCHEMA_VERSION = 2;

// 0.8.75 — Durable Publication Observation Records.
//
// Every history file since 0.8.56 (application/
// BitcoinAnchorConfirmationObservationHistory.js) through 0.8.74
// (application/PublicationObservationTimelineView.js) has held the exact
// same "append-only, never persisted" restraint, each one's own header
// saying so almost verbatim: "This history lives only in whatever
// ephemeral component state a caller keeps for the lifetime of the page —
// reset to empty the moment the Publication Center is reopened." That
// restraint was deliberate, not an oversight — see docs/Roadmap.md,
// 0.8.71's own header, and every history file's own repetition of it. This
// milestone is the first to relax it, and ONLY for these already-existing,
// already-honest facts — never for anything new.
//
//   application/IpfsPublicationRecordHistory.js                (0.8.71)
//   application/IpfsPublicationContentVerificationHistory.js   (0.8.72)
//   application/BitcoinAnchorConfirmationObservationHistory.js (0.8.56)
//   application/BitcoinAnchorBroadcastView.js's own outcome     (0.8.64)
//   application/BitcoinAnchorContentProofView.js's own outcome  (0.8.57)
//        │
//        │  appendXxx() — reusing each domain's own, UNCHANGED append
//        │  function wherever one already exists
//        ▼
//   PublicationObservationArchive          (THIS FILE — new)
//        │
//        │  toJSON() / fromJSON()
//        ▼
//   storage/LocalStoragePublicationObservationArchive.js  (THIS
//   MILESTONE'S OWN new persistence adapter, a separate file)
//
// A COMPOSITION OF EXISTING HISTORIES, NOT A NEW SOURCE OF TRUTH. This
// class invents no new fact of its own. `appendIpfsPublicationRecord()`
// below calls application/IpfsPublicationRecordHistory.js's own
// `appendIpfsPublicationRecordHistoryEntry()` UNCHANGED;
// `appendIpfsContentVerificationObservation()` calls application/
// IpfsPublicationContentVerificationHistory.js's own
// `appendIpfsPublicationContentVerificationHistoryEntry()` UNCHANGED;
// `appendBitcoinConfirmationObservation()` calls application/
// BitcoinAnchorConfirmationObservationHistory.js's own
// `appendBitcoinAnchorConfirmationObservationHistoryEntry()` UNCHANGED.
// Only the two Bitcoin facts with no existing append function of their own
// — a broadcast attempt (one-shot, per application/
// BitcoinAnchorBroadcastCoordinator.js's own header) and a content-proof
// observation (never historized anywhere else, per application/
// PublicationObservationTimelineView.js's own header, "NO HISTORY IS
// INVENTED FOR CONTENT PROOF") — get this file's own small, equally
// unscored append helpers, held to the identical "append, never mutate,
// never deduplicate" discipline as every function this file reuses.
//
// PRESERVES THE DISTINCTION BETWEEN PUBLICATION FACTS, VERIFICATION FACTS,
// BROADCAST FACTS, AND CONFIRMATION FACTS — see docs/Principles.md, "The
// UI Displays Observations; It Does Not Turn Them Into A Verdict
// (0.8.57)," and "Unify The Timeline, Not The Meanings (0.8.74)," both
// held here once more. Each of the five collections below is its own,
// separately keyed structure; none is ever merged into another, and this
// class computes no combined `status`, `confidence`, `health`, `trusted`,
// `valid`, `canonical`, or `reliable` field over them, individually or
// together. See application/PublicationObservationArchiveView.js for the
// one place a caller reads them back out — and that file carries the
// identical exclusion.
//
// SHAPED TO FEED application/PublicationObservationTimelineView.js's OWN
// `describePublicationObservationTimeline()` DIRECTLY. `ipfsPublicationRecords`
// / `ipfsContentVerificationObservationsByRecordIndex` are exactly the
// `ipfs.publicationRecords` / `ipfs.verificationHistoriesByRecordIndex`
// shape that function already accepts; `bitcoinBroadcastRecords` (once
// mapped through `toBitcoinAnchors()` below) / `bitcoinConfirmationObservationsByAnchorId`
// / `bitcoinContentProofObservationsByAnchorId` are exactly its
// `bitcoin.anchors` / `bitcoin.confirmationHistoriesByAnchorId` /
// `bitcoin.proofObservationsByAnchorId`. application/
// PublicationObservationArchiveView.js calls that unchanged function
// directly over this shape — this milestone adds no second, competing
// timeline projection of its own.
//
// `recordIndex` ON AN IPFS RECORD IS THIS ARCHIVE'S OWN POSITION FOR IT —
// never the position a caller's own, separate, page-local
// `entry.ipfsPublicationRecordHistory` happens to use for the same
// record. A caller that keeps its own per-entry history AND archives
// records into this shared, page-level archive must track, on its own
// side, which archive position a given local record landed at — this
// class has no way to know, and does not try to guess, whether two
// records it holds came from the same caller-side entry.
//
// ANCHOR IDENTITY IS EXPLICIT AND CALLER-SUPPLIED, THE IDENTICAL
// RESTRAINT application/PublicationObservationTimelineView.js's own
// header already holds for `anchorId`/`recordIndex`. Nothing in this
// class infers which anchor a confirmation or content-proof observation
// belongs to from a shared `txid` or `contentHash` — every
// `appendBitcoinConfirmationObservation()`/
// `appendBitcoinContentProofObservation()` call names its own `anchorId`
// explicitly.
//
// IMMUTABLE AND APPEND-ONLY. Every `appendXxx()` method returns a BRAND
// NEW `PublicationObservationArchive` instance; the receiver is never
// mutated, and every array/object it held is still exactly what it held
// before the call — the same discipline every history file this class
// composes already holds, one level up, over the archive as a whole.
// `PublicationObservationArchive` instances are frozen immediately after
// construction.
//
// NO CAPABILITIES, NO CREDENTIALS, NO WALLET STATE OF ANY KIND. This is
// the one boundary this entire milestone exists to hold, restated here at
// its most concrete: nothing on this class ever accepts or stores a
// wallet reference, a `signPsbt` function, a private key, a seed phrase,
// a pinning-provider credential, or any other capability. Every field
// this class holds is a plain, already-observed, JSON-serializable fact —
// a string, a number, a Date, or `null` — never a function, a class
// instance with behavior, or anything else a `JSON.stringify()` could not
// already describe honestly on its own. See storage/
// LocalStoragePublicationObservationArchive.js's own header for why that
// property is exactly what makes this class safe to persist verbatim.
//
// 0.8.80 — Explicit Bitcoin Anchor Publication Lifecycle Record. Adds a
// SIXTH, independent collection: `bitcoinAnchorPublicationRecords`, an
// append-only sequence of application/BitcoinAnchorPublicationRecord.js
// instances — durable IDENTITY (`anchorId`, `contentHash`, `txid`,
// `network`, `createdAt`), never an observation and never a verdict. It is
// never merged into, keyed by, or cross-referenced against any of the five
// collections above — a publication record establishes identity;
// `bitcoinBroadcastRecords`/`bitcoinConfirmationObservationsByAnchorId`/
// `bitcoinContentProofObservationsByAnchorId` establish what was
// subsequently observed about that identity, exactly as they already did
// before this milestone. See application/BitcoinAnchorPublicationRecord.js's
// own header for the full rationale. THIS MILESTONE BUMPS SCHEMA_VERSION
// TO 2 — a payload persisted by 0.8.75 through 0.8.79 (schemaVersion 1)
// degrades to `PublicationObservationArchive.empty()` on load, the
// identical, already-tested "wrong schemaVersion" behavior this class's
// own `fromJSON()` has held since 0.8.75; no migration path is added,
// because none of this class's own prior principles ever promised one.
export class PublicationObservationArchive {
    constructor({
        ipfsPublicationRecords = [],
        ipfsContentVerificationObservationsByRecordIndex = {},
        bitcoinBroadcastRecords = [],
        bitcoinConfirmationObservationsByAnchorId = {},
        bitcoinContentProofObservationsByAnchorId = {},
        bitcoinAnchorPublicationRecords = []
    } = {}) {
        this._ipfsPublicationRecords = Object.freeze([...ipfsPublicationRecords]);
        this._ipfsContentVerificationObservationsByRecordIndex = Object.freeze(
            Object.fromEntries(Object.entries(ipfsContentVerificationObservationsByRecordIndex)
                .map(([index, observations]) => [index, Object.freeze([...observations])]))
        );
        this._bitcoinBroadcastRecords = Object.freeze([...bitcoinBroadcastRecords]);
        this._bitcoinConfirmationObservationsByAnchorId = Object.freeze(
            Object.fromEntries(Object.entries(bitcoinConfirmationObservationsByAnchorId)
                .map(([anchorId, observations]) => [anchorId, Object.freeze([...observations])]))
        );
        this._bitcoinContentProofObservationsByAnchorId = Object.freeze(
            Object.fromEntries(Object.entries(bitcoinContentProofObservationsByAnchorId)
                .map(([anchorId, observations]) => [anchorId, Object.freeze([...observations])]))
        );
        this._bitcoinAnchorPublicationRecords = Object.freeze([...bitcoinAnchorPublicationRecords]);
        Object.freeze(this);
    }

    get ipfsPublicationRecords() { return this._ipfsPublicationRecords; }
    get ipfsContentVerificationObservationsByRecordIndex() { return this._ipfsContentVerificationObservationsByRecordIndex; }
    get bitcoinBroadcastRecords() { return this._bitcoinBroadcastRecords; }
    get bitcoinConfirmationObservationsByAnchorId() { return this._bitcoinConfirmationObservationsByAnchorId; }
    get bitcoinContentProofObservationsByAnchorId() { return this._bitcoinContentProofObservationsByAnchorId; }
    get bitcoinAnchorPublicationRecords() { return this._bitcoinAnchorPublicationRecords; }

    // The count of PUBLICATION-shaped facts this archive holds — an IPFS
    // publish and a Bitcoin broadcast attempt each name "the underlying
    // thing was published," one domain apiece. Never combined with
    // `observationCount` into one number.
    //
    // DELIBERATELY UNCHANGED BY 0.8.80. `bitcoinAnchorPublicationRecords`
    // is a durable IDENTITY record, not a repeatable "this got published"
    // observation the way an IPFS publish or a Bitcoin broadcast attempt
    // is — folding it into this count would blur exactly the distinction
    // this milestone exists to draw. See
    // `bitcoinAnchorPublicationRecordCount` below for its own, entirely
    // separate count.
    get publicationCount() {
        return this._ipfsPublicationRecords.length + this._bitcoinBroadcastRecords.length;
    }

    // The count of durable Bitcoin anchor PUBLICATION IDENTITY records this
    // archive holds — never combined with `publicationCount` or
    // `observationCount`, and never treated as a measure of how many of
    // them were ever confirmed, broadcast successfully, or observed at
    // all. See application/BitcoinAnchorPublicationRecord.js's own header.
    get bitcoinAnchorPublicationRecordCount() {
        return this._bitcoinAnchorPublicationRecords.length;
    }

    // The count of OBSERVATION-shaped facts this archive holds — every
    // IPFS content-verification attempt, every Bitcoin confirmation
    // check, and every Bitcoin content-proof reconciliation, summed. Never
    // combined with `publicationCount`, and never reduced to "the latest
    // observation" — every historized attempt counts, exactly as each of
    // this archive's own source histories already counts them.
    get observationCount() {
        return countValues(this._ipfsContentVerificationObservationsByRecordIndex)
            + countValues(this._bitcoinConfirmationObservationsByAnchorId)
            + countValues(this._bitcoinContentProofObservationsByAnchorId);
    }

    _fields() {
        return {
            ipfsPublicationRecords: this._ipfsPublicationRecords,
            ipfsContentVerificationObservationsByRecordIndex: this._ipfsContentVerificationObservationsByRecordIndex,
            bitcoinBroadcastRecords: this._bitcoinBroadcastRecords,
            bitcoinConfirmationObservationsByAnchorId: this._bitcoinConfirmationObservationsByAnchorId,
            bitcoinContentProofObservationsByAnchorId: this._bitcoinContentProofObservationsByAnchorId,
            bitcoinAnchorPublicationRecords: this._bitcoinAnchorPublicationRecords
        };
    }

    // Appends `record` (an application/IpfsPublicationRecord.js instance)
    // and returns a NEW archive. `record`'s own position in the returned
    // archive's own `ipfsPublicationRecords` — never any caller-side
    // index — is what `appendIpfsContentVerificationObservation()` below
    // must be given back to bind an observation to exactly this record.
    // A missing/falsy `record` is a no-op, mirroring
    // `appendIpfsPublicationRecordHistoryEntry()`'s own identical
    // tolerance.
    appendIpfsPublicationRecord(record) {
        if (!record) return this;
        return new PublicationObservationArchive({
            ...this._fields(),
            ipfsPublicationRecords: appendIpfsPublicationRecordHistoryEntry(this._ipfsPublicationRecords, record)
        });
    }

    // Appends `observation` under `recordIndex` — the EXACT index this
    // archive's own `appendIpfsPublicationRecord()` returned for the
    // record this observation is about, never re-derived or guessed from
    // `observation`'s own fields. A non-integer `recordIndex` or a
    // missing/falsy `observation` is a no-op.
    appendIpfsContentVerificationObservation(recordIndex, observation) {
        if (!Number.isInteger(recordIndex) || !observation) return this;
        const existing = this._ipfsContentVerificationObservationsByRecordIndex[recordIndex] || [];
        return new PublicationObservationArchive({
            ...this._fields(),
            ipfsContentVerificationObservationsByRecordIndex: {
                ...this._ipfsContentVerificationObservationsByRecordIndex,
                [recordIndex]: appendIpfsPublicationContentVerificationHistoryEntry(existing, observation)
            }
        });
    }

    // Appends one Bitcoin broadcast fact and returns a NEW archive.
    // Mirrors application/BitcoinAnchorBroadcastCoordinator.js's own
    // outcome shape (`state`, `txid`, `reason`) plus the caller-supplied
    // `broadcastedAt` application/PublicationObservationTimelineView.js's
    // own header already requires (broadcasting carries no timestamp of
    // its own — see that file's header, "A fact with no domain field gets
    // its timestamp from the caller"). `anchorId` is this Bitcoin fact's
    // own domain identity, exactly as application/
    // PublicationObservationTimelineView.js already requires it — a
    // missing `anchorId` or `broadcastedAt` (not a valid Date) is a
    // no-op; a broadcast attempt this replica never actually observed
    // settling has no timestamp to honestly record.
    appendBitcoinBroadcastRecord({ recordIndex = null, anchorId, txid = null, state = null, reason = null, broadcastedAt } = {}) {
        if (!anchorId || !(broadcastedAt instanceof Date) || Number.isNaN(broadcastedAt.getTime())) return this;
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
            bitcoinBroadcastRecords: Object.freeze([...this._bitcoinBroadcastRecords, record])
        });
    }

    // Appends `observation` (an anchoring/BitcoinAnchorConfirmationObserver.js
    // -shaped `{ state, txid, blockHash, blockHeight, confirmationCount,
    // reason, observedAt }`) under `anchorId`. A missing `anchorId` or
    // `observation` is a no-op.
    appendBitcoinConfirmationObservation(anchorId, observation) {
        if (!anchorId || !observation) return this;
        const existing = this._bitcoinConfirmationObservationsByAnchorId[anchorId] || [];
        return new PublicationObservationArchive({
            ...this._fields(),
            bitcoinConfirmationObservationsByAnchorId: {
                ...this._bitcoinConfirmationObservationsByAnchorId,
                [anchorId]: appendBitcoinAnchorConfirmationObservationHistoryEntry(existing, observation)
            }
        });
    }

    // Appends `observation` (an application/BitcoinAnchorContentProofView
    // .js -shaped `{ state, contentHash, reason, observedAt }`) under
    // `anchorId`. UNLIKE confirmation observations, no other file in this
    // codebase historizes content-proof observations at all — application/
    // PublicationObservationTimelineView.js's own header explains why:
    // "this codebase keeps no append-only history of content-proof
    // observations — only the CURRENT reconciliation's own `contentProof`
    // is ever kept," by application design (docs/Principles.md,
    // "Confirmation And Content-Proof Histories Stay Separate... (0.8.57)").
    // This archive is a durable RECORD of every content-proof observation
    // a caller chooses to archive, not a live "current reconciliation"
    // slot — appending a second observation for the same `anchorId` here
    // adds a second entry, it never replaces the first, exactly like
    // every other append in this file. A missing `anchorId` or
    // `observation` is a no-op.
    appendBitcoinContentProofObservation(anchorId, observation) {
        if (!anchorId || !observation) return this;
        const existing = this._bitcoinContentProofObservationsByAnchorId[anchorId] || [];
        return new PublicationObservationArchive({
            ...this._fields(),
            bitcoinContentProofObservationsByAnchorId: {
                ...this._bitcoinContentProofObservationsByAnchorId,
                [anchorId]: Object.freeze([...existing, observation])
            }
        });
    }

    // Appends `record` (an application/BitcoinAnchorPublicationRecord.js
    // instance) and returns a NEW archive. This is the ONE durable write
    // path for Bitcoin anchor publication IDENTITY — see application/
    // CreateBitcoinAnchorPublicationRecordUseCase.js for the one place
    // this codebase constructs a record before appending it here. A
    // missing/falsy `record` is a no-op, mirroring every other appendXxx()
    // method's identical tolerance. Never deduplicates, never merges by
    // `contentHash` or `txid`, never replaces a previous record for the
    // same `anchorId` — see application/
    // BitcoinAnchorPublicationRecordHistory.js's own header.
    appendBitcoinAnchorPublicationRecord(record) {
        if (!record) return this;
        return new PublicationObservationArchive({
            ...this._fields(),
            bitcoinAnchorPublicationRecords: appendBitcoinAnchorPublicationRecordHistoryEntry(this._bitcoinAnchorPublicationRecords, record)
        });
    }

    // Maps `bitcoinBroadcastRecords` into the `{ recordIndex, anchorId,
    // broadcastedAt, txid, broadcast: { state, txid, reason } }` shape
    // application/PublicationObservationTimelineView.js's own
    // `describePublicationObservationTimeline()` expects as one of
    // `bitcoin.anchors`'s own entries — a pure re-shaping, carrying every
    // field through unchanged, computing nothing new.
    toBitcoinAnchors() {
        return this._bitcoinBroadcastRecords.map((record) => Object.freeze({
            recordIndex: record.recordIndex,
            anchorId: record.anchorId,
            txid: record.txid,
            broadcastedAt: record.broadcastedAt,
            broadcast: Object.freeze({ state: record.state, txid: record.txid, reason: record.reason })
        }));
    }

    // Only ever plain, JSON-safe data — every `IpfsPublicationRecord`
    // instance through its own `toJSON()` (0.8.69, unchanged), every Date
    // through `toISOString()`. NO CAPABILITY OR CREDENTIAL FIELD EXISTS ON
    // ANY OBJECT THIS CLASS HOLDS FOR THIS METHOD TO ACCIDENTALLY SERIALIZE
    // — see this file's own header, "No capabilities, no credentials, no
    // wallet state of any kind." Round-tripping through `fromJSON()` below
    // reconstructs a byte-identical archive (module `Object.freeze`
    // identity aside).
    toJSON() {
        return {
            schemaVersion: SCHEMA_VERSION,
            ipfsPublicationRecords: this._ipfsPublicationRecords.map((record) => record.toJSON()),
            ipfsContentVerificationObservationsByRecordIndex: mapValues(
                this._ipfsContentVerificationObservationsByRecordIndex,
                (observations) => observations.map(serializeObservation)
            ),
            bitcoinBroadcastRecords: this._bitcoinBroadcastRecords.map((record) => ({
                recordIndex: record.recordIndex,
                anchorId: record.anchorId,
                txid: record.txid,
                state: record.state,
                reason: record.reason,
                broadcastedAt: record.broadcastedAt.toISOString()
            })),
            bitcoinConfirmationObservationsByAnchorId: mapValues(
                this._bitcoinConfirmationObservationsByAnchorId,
                (observations) => observations.map(serializeObservation)
            ),
            bitcoinContentProofObservationsByAnchorId: mapValues(
                this._bitcoinContentProofObservationsByAnchorId,
                (observations) => observations.map(serializeObservation)
            ),
            bitcoinAnchorPublicationRecords: this._bitcoinAnchorPublicationRecords.map((record) => record.toJSON())
        };
    }

    // A fresh, empty archive — the starting point for a page session with
    // no restored history, and this class's own answer to "malformed
    // persisted data" (see `fromJSON()` below): never a thrown error,
    // never a partially reconstructed guess, always exactly this.
    static empty() {
        return new PublicationObservationArchive();
    }

    // Reconstructs an archive from `toJSON()`'s own output — STRICTLY.
    // Malformed persisted data (invalid JSON already failed before this
    // method is ever called — see storage/
    // LocalStoragePublicationObservationArchive.js — but also: the wrong
    // `schemaVersion`, a missing collection, a record missing a required
    // field, an unexpected extra field on a record, or a timestamp that
    // does not parse to a real date) NEVER resurrects a partial archive
    // holding only the entries that happened to validate — the entire
    // result is `PublicationObservationArchive.empty()`. This is a
    // deliberately stricter contract than every append method above: an
    // append call ignores one bad argument and keeps every fact the
    // archive already held, because a caller mid-session is trusted
    // in-memory state; a `fromJSON()` payload is data that arrived from
    // outside this process's own memory (a browser's localStorage,
    // editable by hand or corrupted by a browser bug) and gets no such
    // benefit of the doubt. See docs/Principles.md, "Persistence Restores
    // Historical Facts; It Never Resurrects Invented Ones (0.8.75)."
    static fromJSON(json) {
        const validated = validateArchiveJSON(json);
        if (!validated) return PublicationObservationArchive.empty();

        return new PublicationObservationArchive({
            ipfsPublicationRecords: validated.ipfsPublicationRecords.map((record) => IpfsPublicationRecord.fromJSON(record)),
            ipfsContentVerificationObservationsByRecordIndex: mapValues(
                validated.ipfsContentVerificationObservationsByRecordIndex,
                (observations) => observations.map(deserializeObservation)
            ),
            bitcoinBroadcastRecords: validated.bitcoinBroadcastRecords.map((record) => ({
                recordIndex: record.recordIndex,
                anchorId: record.anchorId,
                txid: record.txid,
                state: record.state,
                reason: record.reason,
                broadcastedAt: new Date(record.broadcastedAt)
            })),
            bitcoinConfirmationObservationsByAnchorId: mapValues(
                validated.bitcoinConfirmationObservationsByAnchorId,
                (observations) => observations.map(deserializeObservation)
            ),
            bitcoinContentProofObservationsByAnchorId: mapValues(
                validated.bitcoinContentProofObservationsByAnchorId,
                (observations) => observations.map(deserializeObservation)
            ),
            bitcoinAnchorPublicationRecords: validated.bitcoinAnchorPublicationRecords.map((record) => BitcoinAnchorPublicationRecord.fromJSON(record))
        });
    }
}

function countValues(byKey) {
    return Object.values(byKey).reduce((total, observations) => total + observations.length, 0);
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

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value, allowedKeys) {
    return Object.keys(value).every((key) => allowedKeys.includes(key));
}

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

function validateBitcoinAnchorPublicationRecord(record) {
    if (!isPlainObject(record) || !hasOnlyKeys(record, BITCOIN_ANCHOR_PUBLICATION_RECORD_FIELDS)) return null;
    if (!BITCOIN_ANCHOR_PUBLICATION_RECORD_FIELDS.every((key) => key in record)) return null;
    if (typeof record.anchorId !== 'string' || !record.anchorId) return null;
    if (typeof record.contentHash !== 'string' || !record.contentHash) return null;
    if (typeof record.txid !== 'string' || !record.txid) return null;
    if (typeof record.network !== 'string' || !record.network) return null;
    if (!isValidTimestamp(record.createdAt)) return null;
    return record;
}

function validateArray(value, itemValidator) {
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

const TOP_LEVEL_FIELDS = [
    'schemaVersion',
    'ipfsPublicationRecords',
    'ipfsContentVerificationObservationsByRecordIndex',
    'bitcoinBroadcastRecords',
    'bitcoinConfirmationObservationsByAnchorId',
    'bitcoinContentProofObservationsByAnchorId',
    'bitcoinAnchorPublicationRecords'
];

function validateArchiveJSON(json) {
    if (!isPlainObject(json) || !hasOnlyKeys(json, TOP_LEVEL_FIELDS)) return null;
    if (!TOP_LEVEL_FIELDS.every((key) => key in json)) return null;
    if (json.schemaVersion !== SCHEMA_VERSION) return null;

    const ipfsPublicationRecords = validateArray(json.ipfsPublicationRecords, validateIpfsPublicationRecord);
    if (!ipfsPublicationRecords) return null;

    const ipfsContentVerificationObservationsByRecordIndex = validateObservationsByKey(
        json.ipfsContentVerificationObservationsByRecordIndex, IPFS_VERIFICATION_OBSERVATION_FIELDS
    );
    if (!ipfsContentVerificationObservationsByRecordIndex) return null;

    const bitcoinBroadcastRecords = validateArray(json.bitcoinBroadcastRecords, validateBitcoinBroadcastRecord);
    if (!bitcoinBroadcastRecords) return null;

    const bitcoinConfirmationObservationsByAnchorId = validateObservationsByKey(
        json.bitcoinConfirmationObservationsByAnchorId, BITCOIN_CONFIRMATION_OBSERVATION_FIELDS
    );
    if (!bitcoinConfirmationObservationsByAnchorId) return null;

    const bitcoinContentProofObservationsByAnchorId = validateObservationsByKey(
        json.bitcoinContentProofObservationsByAnchorId, BITCOIN_CONTENT_PROOF_OBSERVATION_FIELDS
    );
    if (!bitcoinContentProofObservationsByAnchorId) return null;

    const bitcoinAnchorPublicationRecords = validateArray(json.bitcoinAnchorPublicationRecords, validateBitcoinAnchorPublicationRecord);
    if (!bitcoinAnchorPublicationRecords) return null;

    return {
        ipfsPublicationRecords,
        ipfsContentVerificationObservationsByRecordIndex,
        bitcoinBroadcastRecords,
        bitcoinConfirmationObservationsByAnchorId,
        bitcoinContentProofObservationsByAnchorId,
        bitcoinAnchorPublicationRecords
    };
}
