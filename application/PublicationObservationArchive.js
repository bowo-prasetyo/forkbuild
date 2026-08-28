import { IpfsPublicationRecord } from './IpfsPublicationRecord.js';
import { appendIpfsPublicationRecordHistoryEntry } from './IpfsPublicationRecordHistory.js';
import { appendIpfsPublicationContentVerificationHistoryEntry } from './IpfsPublicationContentVerificationHistory.js';
import { appendBitcoinAnchorConfirmationObservationHistoryEntry } from './BitcoinAnchorConfirmationObservationHistory.js';
import { BitcoinAnchorPublicationRecord } from './BitcoinAnchorPublicationRecord.js';
import { appendBitcoinAnchorPublicationRecordHistoryEntry } from './BitcoinAnchorPublicationRecordHistory.js';
import { appendBaseTransactionInclusionObservationHistoryEntry } from './BaseTransactionInclusionObservationHistory.js';
import {
    PublicationObservationArchiveProvenanceOrigin,
    isValidPublicationObservationArchiveProvenanceOrigin
} from './PublicationObservationArchiveProvenance.js';

const SCHEMA_VERSION = 4;

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
//
// 0.8.83 — Publication Archive Provenance & Imported-Fact Boundary. Adds
// SIX parallel PROVENANCE collections, one per factual collection above —
// `ipfsPublicationRecordProvenance`, `ipfsContentVerificationObservationProvenanceByRecordIndex`,
// `bitcoinBroadcastRecordProvenance`, `bitcoinConfirmationObservationProvenanceByAnchorId`,
// `bitcoinContentProofObservationProvenanceByAnchorId`,
// `bitcoinAnchorPublicationRecordProvenance` — each holding exactly one
// application/PublicationObservationArchiveProvenance.js `LOCAL`/`IMPORTED`
// tag per fact, at the identical array position (or, for a keyed
// collection, the identical position within that key's own array) as the
// fact it describes. These are INDEPENDENT of the six factual collections
// — never merged into them, never read by anything that derives evidence
// or a timeline from this archive (see application/
// PublicationObservationArchiveView.js and application/
// PublicationObservationTimelineView.js, both UNCHANGED by this
// milestone) — see docs/Principles.md, "Provenance Describes Where A Fact
// Entered This Archive; It Does Not Establish Whether The Fact Is True
// (0.8.83)."
//
// EVERY `appendXxx()` METHOD BELOW GAINS ONE NEW, OPTIONAL TRAILING
// `origin` ARGUMENT, DEFAULTING TO `LOCAL`. Every existing call site in
// this codebase — every one predates this milestone — calls these methods
// without it, and gets `LOCAL` automatically, which is exactly correct:
// a live call from application code recording a fact THIS replica just
// observed, broadcast, or finalized is a `LOCAL` fact by definition. Only
// application/PublicationObservationArchiveExport.js's own
// `importPublicationObservationArchive()` ever needs `IMPORTED` — and it
// reaches it not by passing `origin` to any `appendXxx()` call, but
// through `withUniformProvenance()` below, applied once to an entire
// freshly reconstructed archive.
//
// A SEVENTH, SEPARATE COLLECTION — `archiveImportEvents` — records THE
// ACT OF IMPORTING ITSELF, never a verification or a trust judgment about
// what was imported. Each entry is `{ importedAt, importedArchiveSchemaVersion,
// importedEntryCount }` — when this replica ingested an archive, which
// schema version it validated against, and how many facts it held at that
// moment. `importedAt` is never confused with any fact's own `observedAt`/
// `publishedAt`/`createdAt` — see `appendArchiveImportEvent()` below.
//
// `withUniformProvenance(origin)` IS THE ONE PLACE PROVENANCE CAN BE
// REWRITTEN WHOLESALE, AND IT NEVER TOUCHES A FACT'S OWN TIMESTAMP.
// application/PublicationObservationArchiveExport.js's own
// `importPublicationObservationArchive()` calls this exactly once, with
// `IMPORTED`, over a freshly `fromJSON()`-reconstructed archive — never
// per-entry, never conditionally. Whatever provenance the exported JSON
// itself claimed (e.g. an archive that was already `IMPORTED` once,
// re-exported, and imported again) is discarded and replaced uniformly:
// provenance describes how a fact entered THIS archive, not the fact's
// own history one replica removed. See that method's own header for why
// this is deliberately NOT the same as `fromJSON()`'s own generic,
// faithful round trip (used by storage/
// LocalStoragePublicationObservationArchive.js, where "restoring my own
// prior state" must NOT relabel anything).
//
// THIS MILESTONE BUMPS SCHEMA_VERSION TO 3 — a payload persisted by
// 0.8.75 through 0.8.82 (schemaVersion 2) degrades to
// `PublicationObservationArchive.empty()` on load, the identical,
// already-tested "wrong schemaVersion" behavior held since 0.8.75.
//
// PROVENANCE FEEDS NOTHING. No `appendXxx()` method's factual behavior
// changes; no derived count, evidence bundle, consistency finding, or
// lifecycle timeline this codebase already computes reads a provenance
// field. `localFactCount`/`importedFactCount`/`totalFactCount` below are
// the only new READS of provenance this class itself exposes, and they
// are never combined with `publicationCount`/`observationCount` into any
// single "health" number.
//
// 0.8.97 — Durable Base Transaction Inclusion Observation Archive. Adds a
// SEVENTH, independent collection: `baseTransactionInclusionObservationsByTransactionHash`
// — every `base/BaseTransactionInclusionObserver.js#observeInclusion()`
// (0.8.96, unchanged) outcome a caller chooses to archive, keyed by the
// EXACT `txid` a real BROADCASTED outcome named — the identical "explicit
// transaction identity, never content hash" restraint 0.8.78 already
// established for Bitcoin, extended one chain over. Two Base transactions
// that happen to commit the identical `contentHash` under two different
// `txid`s remain two entirely independent observation histories here,
// exactly like two `bitcoinConfirmationObservationsByAnchorId` entries
// sharing a `contentHash` already do. This is Base's own counterpart to
// `bitcoinConfirmationObservationsByAnchorId` — NOT a merge into it, and
// NOT a new, generic `blockchainTransactionObservations` collection: this
// codebase has repeatedly kept Bitcoin's and Base's own observation
// mechanics explicit and separate (see docs/Roadmap.md, 0.8.89, "Multi-
// Blockchain Publication Domain Boundary"), and this milestone holds that
// restraint once more rather than relaxing it the first time a second
// chain needed durability.
//
// EVERY OBSERVATION SHAPE `base/BaseTransactionInclusionObserver.js`
// ALREADY PRODUCES IS PRESERVED, UNCHANGED — `{ state, txid, blockHash,
// blockNumber, transactionIndex, confirmationCount, reason, observedAt }`
// — for INCLUDED, NOT_INCLUDED, AND UNAVAILABLE alike. This class invents
// no filtered or narrower shape for any one state: exactly like
// `bitcoinConfirmationObservationsByAnchorId` already archives NOT_CONFIRMED
// observations carrying `null` block fields, an UNAVAILABLE Base
// observation is archived with its own `reason` and every inapplicable
// field `null` — never silently dropped. The archive represents what was
// observed, including an inability to obtain the requested observation,
// never only successful ones. No new "observation failure" abstraction is
// introduced for this — UNAVAILABLE already IS this class's existing
// observation vocabulary, reused exactly as every other collection here
// already reuses it.
//
// `appendBaseTransactionInclusionObservation()` REUSES `application/
// BaseTransactionInclusionObservationHistory.js`'s OWN, UNCHANGED
// `appendBaseTransactionInclusionObservationHistoryEntry()` — mirroring
// exactly how `appendBitcoinConfirmationObservation()` above already
// reuses `appendBitcoinAnchorConfirmationObservationHistoryEntry()`
// UNCHANGED. This class invents no new observation behavior of its own;
// 0.8.96's own observer and history files are not touched by this
// milestone at all.
//
// THIS MILESTONE BUMPS SCHEMA_VERSION TO 4 — a payload persisted by
// 0.8.75 through 0.8.96 (schemaVersion 3) degrades to
// `PublicationObservationArchive.empty()` on load, the identical,
// already-tested "wrong schemaVersion" behavior this class's own
// `fromJSON()` has held since 0.8.75; no migration path is added, because
// none of this class's own prior principles ever promised one.
//
// `observationCount` NOW ALSO COUNTS BASE INCLUSION OBSERVATIONS — the
// identical OBSERVATION shape a Bitcoin confirmation check or an IPFS
// verification attempt already contributes to that count, extended to a
// third domain. `publicationCount` and `bitcoinAnchorPublicationRecordCount`
// are UNCHANGED: a Base transaction inclusion observation is exactly that,
// an observation, never a publication-shaped fact. This milestone mints no
// Base counterpart to `BitcoinAnchorPublicationRecord` — Base names no
// durable publication-identity record of its own yet; see this milestone's
// own "Deliberately excluded" list in docs/Roadmap.md.
//
// PROVENANCE EXTENDS IDENTICALLY — a SEVENTH parallel provenance
// collection, `baseTransactionInclusionObservationProvenanceByTransactionHash`,
// holds one `LOCAL`/`IMPORTED` tag per Base observation at the identical
// position within its own `txid`'s own array, exactly like every other
// keyed collection's own provenance array. `withUniformProvenance()` now
// also restamps this seventh collection uniformly; nothing else about that
// method changes.
//
// THE CROSS-DOMAIN TIMELINE IS DELIBERATELY UNTOUCHED. `application/
// PublicationObservationTimelineView.js` and `toBitcoinAnchors()`/the
// `entries` this class's own consumers derive from it are NOT extended to
// include Base facts by this milestone — see application/
// PublicationObservationArchiveView.js's own header for why. This
// milestone answers exactly one question: can a Base inclusion observation
// survive application restart and archive export/import? Whether Base
// observations participate in the unified chronological timeline is real,
// separately sized future work.
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
    get archiveImportEvents() { return this._archiveImportEvents; }

    // The static schema version this class currently serializes to and
    // requires on import — exposed so application/
    // PublicationObservationArchiveExport.js's own
    // `recordPublicationObservationArchiveImport()` can name it in an
    // `archiveImportEvents` entry without duplicating the number.
    static get SCHEMA_VERSION() { return SCHEMA_VERSION; }

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
    // check, every Bitcoin content-proof reconciliation, and (0.8.97)
    // every Base transaction inclusion observation, summed. Never combined
    // with `publicationCount`, and never reduced to "the latest
    // observation" — every historized attempt counts, exactly as each of
    // this archive's own source histories already counts them.
    get observationCount() {
        return countValues(this._ipfsContentVerificationObservationsByRecordIndex)
            + countValues(this._bitcoinConfirmationObservationsByAnchorId)
            + countValues(this._bitcoinContentProofObservationsByAnchorId)
            + countValues(this._baseTransactionInclusionObservationsByTransactionHash);
    }

    // The count of every fact in this archive whose provenance is `LOCAL`
    // — summed across all seven factual collections, by way of their own
    // parallel provenance collections. Never combined with
    // `publicationCount`/`observationCount`/`bitcoinAnchorPublicationRecordCount`
    // (which partition the SAME facts by SHAPE, not by provenance), and
    // never presented as a "health" or "trust" number — see
    // application/PublicationObservationArchiveProvenance.js's own header.
    get localFactCount() {
        return this._countProvenance(PublicationObservationArchiveProvenanceOrigin.LOCAL);
    }

    // The count of every fact in this archive whose provenance is
    // `IMPORTED`. See `localFactCount` above for the identical restraints.
    get importedFactCount() {
        return this._countProvenance(PublicationObservationArchiveProvenanceOrigin.IMPORTED);
    }

    // `localFactCount + importedFactCount`, always — every fact this
    // archive holds carries exactly one provenance tag. Equal to
    // `publicationCount + observationCount + bitcoinAnchorPublicationRecordCount`
    // for any archive this class itself produced.
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
            + countOriginMatchesByKey(this._baseTransactionInclusionObservationProvenanceByTransactionHash, origin);
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
            archiveImportEvents: this._archiveImportEvents
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
    //
    // 0.8.83 — every `appendXxx()` in this file gained this identical,
    // optional trailing `origin` argument, defaulting to `LOCAL`. See this
    // file's own header.
    appendIpfsPublicationRecord(record, origin = PublicationObservationArchiveProvenanceOrigin.LOCAL) {
        if (!record || !isValidPublicationObservationArchiveProvenanceOrigin(origin)) return this;
        return new PublicationObservationArchive({
            ...this._fields(),
            ipfsPublicationRecords: appendIpfsPublicationRecordHistoryEntry(this._ipfsPublicationRecords, record),
            ipfsPublicationRecordProvenance: Object.freeze([...this._ipfsPublicationRecordProvenance, origin])
        });
    }

    // Appends `observation` under `recordIndex` — the EXACT index this
    // archive's own `appendIpfsPublicationRecord()` returned for the
    // record this observation is about, never re-derived or guessed from
    // `observation`'s own fields. A non-integer `recordIndex` or a
    // missing/falsy `observation` is a no-op.
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

    // Appends `observation` (an anchoring/BitcoinAnchorConfirmationObserver.js
    // -shaped `{ state, txid, blockHash, blockHeight, confirmationCount,
    // reason, observedAt }`) under `anchorId`. A missing `anchorId` or
    // `observation` is a no-op.
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
    appendBitcoinAnchorPublicationRecord(record, origin = PublicationObservationArchiveProvenanceOrigin.LOCAL) {
        if (!record || !isValidPublicationObservationArchiveProvenanceOrigin(origin)) return this;
        return new PublicationObservationArchive({
            ...this._fields(),
            bitcoinAnchorPublicationRecords: appendBitcoinAnchorPublicationRecordHistoryEntry(this._bitcoinAnchorPublicationRecords, record),
            bitcoinAnchorPublicationRecordProvenance: Object.freeze([...this._bitcoinAnchorPublicationRecordProvenance, origin])
        });
    }

    // 0.8.97 — Appends `observation` (a `base/BaseTransactionInclusionObserver.js`
    // -shaped `{ state, txid, blockHash, blockNumber, transactionIndex,
    // confirmationCount, reason, observedAt }`, exactly as `application/
    // BaseTransactionInclusionObservationCoordinator.js#observeInclusion()`
    // — 0.8.96, unchanged — resolves it) under `transactionHash` — the
    // EXACT `txid` a real BROADCASTED outcome named, never re-derived or
    // guessed from `observation`'s own fields, never `contentHash`. Reuses
    // `application/BaseTransactionInclusionObservationHistory.js`'s own,
    // UNCHANGED `appendBaseTransactionInclusionObservationHistoryEntry()` —
    // the identical "reuse the domain's own existing append function"
    // discipline `appendBitcoinConfirmationObservation()` above already
    // holds. Every state — INCLUDED, NOT_INCLUDED, and UNAVAILABLE alike —
    // is archived exactly as observed, including a `null` block metadata /
    // `confirmationCount` on an inapplicable state and a `reason` on
    // UNAVAILABLE — never filtered, never a narrower shape for any one
    // state. A missing `transactionHash` or `observation` is a no-op,
    // mirroring every other appendXxx() method's identical tolerance.
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

    // Replaces EVERY provenance entry this archive holds — across all
    // seven factual collections — with `origin`, uniformly.
    // `archiveImportEvents` and every factual collection are untouched;
    // only the seven PARALLEL provenance collections change. An invalid
    // `origin` is a no-op. See this file's own header for why application/
    // PublicationObservationArchiveExport.js's own
    // `importPublicationObservationArchive()` is the one caller expected
    // to use this — and why `PublicationObservationArchive.fromJSON()`
    // itself never calls it.
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
            )
        });
    }

    // Appends ONE `archiveImportEvent` — a durable fact describing THE ACT
    // OF IMPORTING an archive into this replica, never a verification or
    // trust judgment about what was imported. `importedAt` is when this
    // replica performed the import; it is never confused with, and never
    // overwrites, any fact's own `observedAt`/`publishedAt`/`createdAt`.
    // `importedArchiveSchemaVersion` and `importedEntryCount` are plain
    // numbers describing what was imported, at that moment — never
    // recomputed later, exactly like every other durable fact in this
    // file. Invalid input (a non-Date `importedAt`, a non-integer or
    // negative `importedArchiveSchemaVersion`/`importedEntryCount`) is a
    // no-op, mirroring every other appendXxx() method's identical
    // tolerance.
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
            archiveImportEvents: this._archiveImportEvents.map(serializeArchiveImportEvent)
        };
    }

    // A fresh, empty archive — the starting point for a page session with
    // no restored history, and this class's own answer to "malformed
    // persisted data" (see `fromJSON()` below): never a thrown error,
    // never a partially reconstructed guess, always exactly this.
    static empty() {
        return new PublicationObservationArchive();
    }

    // True iff `json` satisfies `fromJSON()`'s own strict contract exactly
    // — the SAME `validateArchiveJSON()` that method already calls,
    // exposed as a predicate. `fromJSON()` itself deliberately erases the
    // difference between "malformed input" and "a validly empty archive,"
    // both becoming `PublicationObservationArchive.empty()` — the right
    // call for storage a browser silently corrupted (see storage/
    // LocalStoragePublicationObservationArchive.js's own header), but the
    // wrong one for application/PublicationObservationArchiveExport.js's
    // own `importPublicationObservationArchive()`, which must tell a
    // person "that file is not a publication archive export" rather than
    // silently treating it as an empty one. This method is that seam —
    // added by 0.8.82 without changing `fromJSON()`'s own existing
    // behavior at all.
    static isValidJSON(json) {
        return validateArchiveJSON(json) !== null;
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

// 0.8.83 — provenance validators. A provenance ARRAY is valid only when it
// is EXACTLY as long as the factual array it describes — one origin tag
// per fact, never more, never fewer, and every tag must itself be a
// genuine `LOCAL`/`IMPORTED` value. A provenance BY-KEY object is valid
// only when its own keys match the factual by-key object's own keys
// exactly (same set, same count) and each key's own array satisfies the
// identical length-and-origin check. Mismatched length or an extra/missing
// key means the payload was hand-edited or corrupted — `null`, exactly
// like every other strict check in this section.
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
        archiveImportEvents
    };
}
