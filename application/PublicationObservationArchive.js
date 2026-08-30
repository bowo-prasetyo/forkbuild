import { IpfsPublicationRecord } from './IpfsPublicationRecord.js';
import { appendIpfsPublicationRecordHistoryEntry } from './IpfsPublicationRecordHistory.js';
import { appendIpfsPublicationContentVerificationHistoryEntry } from './IpfsPublicationContentVerificationHistory.js';
import { appendBitcoinAnchorConfirmationObservationHistoryEntry } from './BitcoinAnchorConfirmationObservationHistory.js';
import { BitcoinAnchorPublicationRecord } from './BitcoinAnchorPublicationRecord.js';
import { appendBitcoinAnchorPublicationRecordHistoryEntry } from './BitcoinAnchorPublicationRecordHistory.js';
import { appendBaseTransactionInclusionObservationHistoryEntry } from './BaseTransactionInclusionObservationHistory.js';
import { BaseAnchorPublicationRecord } from './BaseAnchorPublicationRecord.js';
import { appendBaseAnchorPublicationRecordHistoryEntry } from './BaseAnchorPublicationRecordHistory.js';
import { isValidBlockchainKind } from './BlockchainKind.js';
import { PublicationReferenceRecord } from './PublicationReferenceRecord.js';
import { appendPublicationReferenceRecordHistoryEntry } from './PublicationReferenceRecordHistory.js';
import { PublisherPublicationAssociationRecord } from './PublisherPublicationAssociationRecord.js';
import { appendPublisherPublicationAssociationRecordHistoryEntry } from './PublisherPublicationAssociationRecordHistory.js';
import { LeaderboardClaimRecord } from './LeaderboardClaimRecord.js';
import { appendLeaderboardClaimHistoryEntry } from './LeaderboardClaimHistory.js';
import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry } from './PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js';
import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry } from './PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js';
import {
    PublicationObservationArchiveProvenanceOrigin,
    isValidPublicationObservationArchiveProvenanceOrigin
} from './PublicationObservationArchiveProvenance.js';

const SCHEMA_VERSION = 10;

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
//
// 0.8.99 — Durable Base Publication Identity Record. Adds an EIGHTH,
// independent collection: `baseAnchorPublicationRecords` — an append-only
// sequence of application/BaseAnchorPublicationRecord.js instances,
// mirroring `bitcoinAnchorPublicationRecords` (0.8.80) exactly, one chain
// over: durable IDENTITY (`contentHash`, `txid`, `network`, `createdAt`),
// never an observation and never a verdict. It is never merged into, keyed
// by, or cross-referenced against `baseTransactionInclusionObservationsByTransactionHash`
// (0.8.97) — a publication record establishes identity; that collection
// establishes what was subsequently observed about it, exactly the
// separation `bitcoinAnchorPublicationRecords` already holds toward
// `bitcoinConfirmationObservationsByAnchorId`. See application/
// BaseAnchorPublicationRecord.js's own header for the full rationale, and
// for why this record carries `txid` alone as its own identity key —
// never a second, Bitcoin-style `anchorId` Base's own observation
// vocabulary never introduced.
//
// `appendBaseAnchorPublicationRecord()` REUSES `application/
// BaseAnchorPublicationRecordHistory.js`'s OWN, UNCHANGED
// `appendBaseAnchorPublicationRecordHistoryEntry()` — mirroring exactly
// how `appendBitcoinAnchorPublicationRecord()` above already reuses
// `appendBitcoinAnchorPublicationRecordHistoryEntry()`. This class invents
// no new identity-construction behavior of its own.
//
// THIS MILESTONE BUMPS SCHEMA_VERSION TO 5 — a payload persisted by 0.8.75
// through 0.8.98 (schemaVersion 4) degrades to
// `PublicationObservationArchive.empty()` on load, the identical,
// already-tested "wrong schemaVersion" behavior this class's own
// `fromJSON()` has held since 0.8.75; no migration path is added, because
// none of this class's own prior principles ever promised one.
//
// `publicationCount`/`observationCount` STAY UNCHANGED — `bitcoinAnchorPublicationRecordCount`'s
// OWN 0.8.80 RESTRAINT, HELD HERE ONCE MORE. A `baseAnchorPublicationRecords`
// entry is a durable IDENTITY record, exactly like a
// `bitcoinAnchorPublicationRecords` entry, never a repeatable "this got
// published" or "this got observed" fact — folding it into either count
// would blur exactly the distinction 0.8.80 already drew. See
// `baseAnchorPublicationRecordCount` below for its own, entirely separate
// count.
//
// PROVENANCE EXTENDS IDENTICALLY — an EIGHTH parallel provenance
// collection, `baseAnchorPublicationRecordProvenance`, holds one
// `LOCAL`/`IMPORTED` tag per record at the identical array position,
// exactly like `bitcoinAnchorPublicationRecordProvenance` already does.
// `withUniformProvenance()` now also restamps this eighth collection
// uniformly; nothing else about that method changes.
//
// 0.8.104 — Explicit Publication Reference Relationship. Adds a NINTH,
// independent collection: `publicationReferenceRecords` — an append-only
// sequence of application/PublicationReferenceRecord.js instances, each
// naming one publication's own EXPLICIT `sourcePublicationIdentity ->
// referencedPublicationIdentity` relationship, both sides application/
// BlockchainPublicationIdentity.js (0.8.89) instances. Unlike every prior
// collection, this one describes a relationship BETWEEN TWO publications
// rather than a fact about one — but it is held to the identical
// discipline: never merged into, keyed by, or cross-referenced against any
// other collection; never deduplicated; never inferred from a shared
// `contentHash`, matching content, or any other resemblance — see that
// class's own header for the full rationale.
//
// `appendPublicationReferenceRecord()` REUSES `application/
// PublicationReferenceRecordHistory.js`'s OWN, UNCHANGED
// `appendPublicationReferenceRecordHistoryEntry()` — mirroring exactly how
// `appendBaseAnchorPublicationRecord()` above already reuses
// `appendBaseAnchorPublicationRecordHistoryEntry()`. This class invents no
// new relationship-construction behavior of its own.
//
// THIS MILESTONE BUMPS SCHEMA_VERSION TO 6 — a payload persisted by 0.8.75
// through 0.8.103 (schemaVersion 5) degrades to
// `PublicationObservationArchive.empty()` on load, the identical,
// already-tested "wrong schemaVersion" behavior this class's own
// `fromJSON()` has held since 0.8.75; no migration path is added, because
// none of this class's own prior principles ever promised one.
//
// `publicationCount`/`observationCount`/`bitcoinAnchorPublicationRecordCount`/
// `baseAnchorPublicationRecordCount` STAY UNCHANGED — a publication
// reference record is neither a publication-shaped fact, an
// observation-shaped fact, nor a durable IDENTITY of a single publication;
// it is a relationship between two identities this archive may or may not
// separately hold records for. See `publicationReferenceRecordCount` below
// for its own, entirely separate count.
//
// PROVENANCE EXTENDS IDENTICALLY — a NINTH parallel provenance collection,
// `publicationReferenceRecordProvenance`, holds one `LOCAL`/`IMPORTED` tag
// per record at the identical array position, exactly like
// `baseAnchorPublicationRecordProvenance` already does. `withUniformProvenance()`
// now also restamps this ninth collection uniformly; nothing else about
// that method changes.
//
// 0.8.108 — Explicit Publisher Identity Association. Adds a TENTH,
// independent collection: `publisherPublicationAssociationRecords` — an
// append-only sequence of application/PublisherPublicationAssociationRecord.js
// instances, each naming one EXPLICIT `publisherIdentity ->
// publicationIdentity` relationship — a `PublisherIdentityRecord` (0.8.108,
// a bare, user-supplied label, never a cryptographic identity) on one side,
// a `BlockchainPublicationIdentity` (0.8.89) on the other. Like
// `publicationReferenceRecords` before it, this collection describes a
// relationship rather than a fact about one publication — held to the
// identical discipline: never merged into, keyed by, or cross-referenced
// against any other collection; never deduplicated; never inferred from a
// shared `contentHash`, a shared wallet, or any other resemblance — see
// that class's own header for the full rationale.
//
// `appendPublisherPublicationAssociationRecord()` REUSES `application/
// PublisherPublicationAssociationRecordHistory.js`'s OWN, UNCHANGED
// `appendPublisherPublicationAssociationRecordHistoryEntry()` — mirroring
// exactly how `appendPublicationReferenceRecord()` above already reuses
// `appendPublicationReferenceRecordHistoryEntry()`. This class invents no
// new relationship-construction behavior of its own.
//
// THIS MILESTONE BUMPS SCHEMA_VERSION TO 7 — a payload persisted by 0.8.75
// through 0.8.107 (schemaVersion 6) degrades to
// `PublicationObservationArchive.empty()` on load, the identical,
// already-tested "wrong schemaVersion" behavior this class's own
// `fromJSON()` has held since 0.8.75; no migration path is added, because
// none of this class's own prior principles ever promised one.
//
// `publicationCount`/`observationCount`/`bitcoinAnchorPublicationRecordCount`/
// `baseAnchorPublicationRecordCount`/`publicationReferenceRecordCount` STAY
// UNCHANGED — a publisher association is neither a publication-shaped
// fact, an observation-shaped fact, nor a relationship BETWEEN TWO
// publications; it is a relationship between a publisher and a
// publication. See `publisherPublicationAssociationRecordCount` below for
// its own, entirely separate count.
//
// PROVENANCE EXTENDS IDENTICALLY — a TENTH parallel provenance collection,
// `publisherPublicationAssociationRecordProvenance`, holds one
// `LOCAL`/`IMPORTED` tag per record at the identical array position, exactly
// like `publicationReferenceRecordProvenance` already does.
// `withUniformProvenance()` now also restamps this tenth collection
// uniformly; nothing else about that method changes.
//
// 0.8.130 — Durable Signed Leaderboard Claim History Archive Integration.
// Adds an ELEVENTH, independent collection: `leaderboardClaimRecords` — an
// append-only sequence of application/LeaderboardClaimRecord.js (0.8.123)
// instances, i.e. the RECEIPTS a replica has ever recorded for a received,
// signed `PublisherLeaderboardSnapshotClaim` — never the claim's own
// evidence, never a verification result, never a ranking. This is
// `application/LeaderboardClaimHistory.js`'s own plain, in-memory array
// (0.8.121-0.8.129's "LeaderboardClaimHistory"), finally given the same
// durable home every other observed/recorded fact in this archive already
// has — see application/PublisherLeaderboardClaimHistoryView.js's own new
// `reconstructPublisherLeaderboardClaimHistory()` for the ONE place that
// array is now read back out of an archive.
//
//   PublicationObservationArchive
//   ├── Bitcoin anchor publications
//   ├── Base anchor publications
//   ├── publication references
//   ├── publisher-publication associations
//   └── leaderboard claim records            ← NEW (0.8.130)
//
// A RECEIPT, STILL NEVER A VERDICT — HELD HERE ONCE MORE, ONE LAYER UP.
// This archive computes no `trusted`/`valid`/`current`/`authoritative`
// field over `leaderboardClaimRecords`, exactly as it computes none over
// any of its other ten collections — see application/
// LeaderboardClaimRecord.js's own header, "A Receipt, Never A Verdict." A
// claim's CURRENT relationship to this replica's own evidence remains
// exactly and only application/PublisherLeaderboardClaimVerificationHistoryView.js's
// own job (0.8.125, UNCHANGED), computed fresh, on demand, by reconstructing
// this replica's own current snapshot from this SAME archive's other
// collections and comparing it against a stored claim — never cached,
// never stored, never derived here.
//
// `appendLeaderboardClaimRecord()` REUSES `application/
// LeaderboardClaimHistory.js`'s OWN, UNCHANGED `appendLeaderboardClaimHistoryEntry()`
// — mirroring exactly how every other `appendXxx()` above reuses its own
// domain's existing append function. This class invents no new
// receipt-construction behavior of its own; multiplicity (the SAME signed
// claim received twice, directly and relayed, is TWO independent entries)
// is preserved exactly as 0.8.123 already established — never deduplicated,
// never merged, never reordered.
//
// THIS MILESTONE BUMPS SCHEMA_VERSION TO 8 — THE SAME CONSERVATIVE
// MIGRATION PHILOSOPHY HELD SINCE 0.8.75, WITHOUT EXCEPTION. A payload
// persisted by 0.8.75 through 0.8.129 (schemaVersion 7) degrades to
// `PublicationObservationArchive.empty()` on load — never a partial
// reconstruction, never an attempt to infer historical claims that were
// never durably recorded in the first place. `PublicationObservationArchive.empty()`
// trivially satisfies "a pre-0.8.130 archive loads with `leaderboardClaimRecords: []`"
// — it is not a special case this milestone adds, it is the SAME "wrong
// schemaVersion, whole archive degrades" rule every prior schema bump
// already established, restated here once more. No migration path is
// added, because none of this class's own prior principles ever promised
// one.
//
// `publicationCount`/`observationCount`/`bitcoinAnchorPublicationRecordCount`/
// `baseAnchorPublicationRecordCount`/`publicationReferenceRecordCount`/
// `publisherPublicationAssociationRecordCount` STAY UNCHANGED — a
// leaderboard claim record is neither a publication-shaped fact, an
// observation-shaped fact, a durable IDENTITY of a single publication, nor
// a relationship between two publications or a publisher and a
// publication; it is a durable receipt of a signed, externally authored
// statement. See `leaderboardClaimRecordCount` below for its own, entirely
// separate count.
//
// PROVENANCE EXTENDS IDENTICALLY — an ELEVENTH parallel provenance
// collection, `leaderboardClaimRecordProvenance`, holds one `LOCAL`/
// `IMPORTED` tag per record at the identical array position, exactly like
// `publisherPublicationAssociationRecordProvenance` already does. Note this
// is DELIBERATELY REDUNDANT with `LeaderboardClaimRecord`'s own `origin`
// field (0.8.123, which already reuses this exact vocabulary one layer
// down) — the archive's own parallel provenance array describes how the
// RECORD entered THIS ARCHIVE (import vs. local append), while the record's
// own `origin` getter is a fixed field of the receipt itself, never
// rewritten by `withUniformProvenance()`. The two can, and often will,
// agree; `withUniformProvenance()` restamping the archive's own parallel
// array to `IMPORTED` on a whole-archive import never reaches into, or
// rewrites, any individual `LeaderboardClaimRecord`'s own frozen `origin`
// — exactly as it already never rewrites any other record's own fields.
// `withUniformProvenance()` now also restamps this eleventh collection
// uniformly; nothing else about that method changes.
//
// FINGERPRINTING: THE WHOLE-ARCHIVE FINGERPRINT NATURALLY EXTENDS; THE
// NARROWER ACHIEVEMENT-EVIDENCE FINGERPRINT DELIBERATELY DOES NOT. application/
// PublicationObservationArchiveFingerprint.js's own `fingerprintPublicationObservationArchive()`
// hashes every field `toJSON()` produces except `archiveImportEvents` — so
// it picks up `leaderboardClaimRecords`/`leaderboardClaimRecordProvenance`
// automatically, unmodified by this milestone, because a whole-archive
// fingerprint answers "what exact durable archive state does this replica
// represent?" and a claim receipt is now part of that durable state.
// application/AchievementEvidenceFingerprint.js's own narrower
// `reconstructAchievementEvidenceFingerprint()` reads exactly four
// collections by name (`bitcoinAnchorPublicationRecords`,
// `baseAnchorPublicationRecords`, `publicationReferenceRecords`,
// `publisherPublicationAssociationRecords`) and is UNTOUCHED by this
// milestone — a received signed claim is not achievement evidence, and
// folding it into that fingerprint would break the boundary 0.8.116's own
// header exists to hold. See that file's own header, "Evidence Only —
// Never A Conclusion, Never Provenance, Never A Clock."
//
// 0.8.150 — Durable Reconciliation Decision History Archive Integration.
// Adds a TWELFTH, independent collection: `reconciliationDecisionRecords`
// — an append-only sequence of application/
// PublisherLeaderboardClaimSnapshotReconciliationDecision.js's own 0.8.145
// decision records (`{ decided: true, candidate, decision, decidedAt }`),
// i.e. every genuine, explicit OBSERVE/DEFER decision this replica has ever
// recorded against a genuinely-existing reconciliation candidate — never a
// verification result, never a state machine, never an executed action.
// This is application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js's
// own plain, in-memory array (0.8.146's own "decision history"), finally
// given the same durable home every other observed/recorded fact in this
// archive already has — mirroring 0.8.130's own integration of
// `leaderboardClaimRecords`, one subsystem over. See application/
// PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryView.js's own
// new `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory()`
// for the ONE place that array is now read back out of an archive.
//
//   PublicationObservationArchive
//   ├── Bitcoin anchor publications
//   ├── Base anchor publications
//   ├── publication references
//   ├── publisher-publication associations
//   ├── leaderboard claim records                       (0.8.130)
//   └── reconciliation decision records                 ← NEW (0.8.150)
//
// RECORDING A DECISION DOES NOT EXECUTE, VALIDATE, OR INTERPRET IT — HELD
// HERE ONCE MORE, ONE LAYER UP. This archive computes no `resolved`,
// `pending`, `current`, `superseded`, or `authoritative` field over
// `reconciliationDecisionRecords`, exactly as it computes none over
// `leaderboardClaimRecords` — see application/
// PublisherLeaderboardClaimSnapshotReconciliationDecision.js's own header,
// "A Reconciliation Decision Records An Explicit Choice." Four decisions
// `OBSERVE, DEFER, OBSERVE, DEFER` against the same candidate remain FOUR
// historical entries here, never collapsed into a "current" one — see
// application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js's
// own header, "Appended To, Never Overwritten."
//
// `appendReconciliationDecisionRecord()` REUSES `application/
// PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js`'s OWN,
// UNCHANGED `appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry()`
// — mirroring exactly how `appendLeaderboardClaimRecord()` above reuses its
// own domain's existing append function, and holding the IDENTICAL
// tolerance that function already has: only a genuine `{ decided: true,
// ... }` object is ever appended; anything else (including a
// `{ decided: false, ... }` outcome) is a no-op. This class invents no new
// decision-construction behavior of its own; multiplicity (the SAME
// decision recorded twice is TWO independent entries) is preserved exactly
// as 0.8.146 already established — never deduplicated, never merged, never
// reordered.
//
// THIS MILESTONE BUMPS SCHEMA_VERSION TO 9 — THE SAME CONSERVATIVE
// MIGRATION PHILOSOPHY HELD SINCE 0.8.75, WITHOUT EXCEPTION. A payload
// persisted by 0.8.75 through 0.8.149 (schemaVersion 8) degrades to
// `PublicationObservationArchive.empty()` on load — never a partial
// reconstruction, never an attempt to infer historical decisions that were
// never durably recorded in the first place. No migration path is added,
// because none of this class's own prior principles ever promised one.
//
// `publicationCount`/`observationCount`/every other existing count STAYS
// UNCHANGED — a reconciliation decision record is neither a
// publication-shaped fact, an observation-shaped fact, a durable IDENTITY,
// a relationship between two identities, nor a claim receipt; it is a
// durable record of an explicit choice about a reconciliation candidate.
// See `reconciliationDecisionRecordCount` below for its own, entirely
// separate count.
//
// PROVENANCE EXTENDS IDENTICALLY — a TWELFTH parallel provenance
// collection, `reconciliationDecisionRecordProvenance`, holds one `LOCAL`/
// `IMPORTED` tag per record at the identical array position, exactly like
// `leaderboardClaimRecordProvenance` already does. `withUniformProvenance()`
// now also restamps this twelfth collection uniformly; nothing else about
// that method changes.
//
// VALIDATION IS STRUCTURAL, NOT A SECOND SEMANTIC CHECK. Unlike
// `leaderboardClaimRecords` (which delegates deep validation to
// `LeaderboardClaimRecord.fromJSON()`, a class with its own constructor
// invariants), a decision record is, and remains, a PLAIN frozen object —
// there is no class to delegate to. `validateReconciliationDecisionRecord()`
// below checks exactly the shape 0.8.144/0.8.145 already define (`decided
// === true`, `decision` is `'OBSERVE'`/`'DEFER'`, `decidedAt` is a valid
// timestamp, `candidate` is one of 0.8.144's own three discriminated
// shapes) — the identical strictness every other plain-object collection in
// this file already holds (see `validateBitcoinBroadcastRecord()`), never a
// second, independently-maintained copy of 0.8.144/0.8.145's own semantic
// rules (this file never calls either).
//
// FINGERPRINTING: THE WHOLE-ARCHIVE FINGERPRINT NATURALLY EXTENDS; THE
// NARROWER ACHIEVEMENT-EVIDENCE FINGERPRINT DELIBERATELY DOES NOT — THE
// IDENTICAL REASONING 0.8.130 ALREADY HELD FOR `leaderboardClaimRecords`,
// restated here once more: a recorded reconciliation decision is not
// achievement evidence.
//
// 0.8.167 — Durable Revalidation Observation History Archive Integration.
// Adds a THIRTEENTH, independent collection: `revalidationObservationRecords`
// — an append-only sequence of 0.8.162's own observation records
// (`{ observed: true, decision, planIdentity, candidatePresent, candidateType,
// candidateMatchesPlan, observedAt }`), i.e. every genuine, explicit
// "was this historical decision's own candidate checked against this exact
// plan, and what did that check find" fact this replica has ever recorded.
// This is `application/
// PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js`'s
// own plain, in-memory array (0.8.163's own "observation history"), finally
// given the same durable home every other observed/recorded fact in this
// archive already has — mirroring 0.8.150's own integration of
// `reconciliationDecisionRecords`, one layer over. See application/
// PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryView.js's
// own new
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory()`
// for the ONE place that array is now read back out of an archive.
//
//   PublicationObservationArchive
//   ├── Bitcoin anchor publications
//   ├── Base anchor publications
//   ├── publication references
//   ├── publisher-publication associations
//   ├── leaderboard claim records                       (0.8.130)
//   ├── reconciliation decision records                  (0.8.150)
//   └── revalidation observation records                 ← NEW (0.8.167)
//
// RECORDING AN OBSERVATION DOES NOT REVALIDATE, RECOMPUTE, OR INTERPRET IT
// — HELD HERE ONCE MORE, ONE LAYER UP. This archive computes no `resolved`,
// `current`, `stale`, or `authoritative` field over `revalidationObservationRecords`,
// exactly as it computes none over `reconciliationDecisionRecords` — see
// application/
// PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js's
// own header, "A Record Of What Was Explicitly Observed, Never A New
// Decision." Two observations of the identical decision, checked against
// the identical plan, at the identical `observedAt`, remain TWO historical
// entries here, never collapsed into one — see application/
// PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js's
// own header, "Appended To, Never Overwritten, Never Mutated, Never
// Reordered Or Deduplicated."
//
// `appendRevalidationObservationRecord()` REUSES `application/
// PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js`'s
// OWN, UNCHANGED
// `appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry()`
// — mirroring exactly how `appendReconciliationDecisionRecord()` above
// reuses its own domain's existing append function, and holding the
// IDENTICAL tolerance that function already has: only a genuine
// `{ observed: true, ... }` object is ever appended; anything else
// (including a `{ observed: false, outcome: 'INVALID_OBSERVATION' }`
// outcome) is a no-op. This class invents no new observation-construction
// behavior of its own; multiplicity is preserved exactly as 0.8.163 already
// established — never deduplicated, never merged, never reordered.
//
// THIS MILESTONE BUMPS SCHEMA_VERSION TO 10 — THE SAME CONSERVATIVE
// MIGRATION PHILOSOPHY HELD SINCE 0.8.75, WITHOUT EXCEPTION. A payload
// persisted by 0.8.75 through 0.8.166 (schemaVersion 9) degrades to
// `PublicationObservationArchive.empty()` on load — never a partial
// reconstruction, never an attempt to infer historical observations that
// were never durably recorded in the first place. No migration path is
// added, because none of this class's own prior principles ever promised
// one.
//
// `publicationCount`/`observationCount`/every other existing count STAYS
// UNCHANGED — a revalidation observation record is neither a
// publication-shaped fact, an observation-shaped fact in `observationCount`'s
// own sense (an IPFS/Bitcoin/Base observation of a PUBLICATION), a durable
// IDENTITY, a relationship between two identities, a claim receipt, nor a
// reconciliation decision; it is a durable record of an explicit check
// against a candidate's own historical decision. See
// `revalidationObservationRecordCount` below for its own, entirely separate
// count.
//
// PROVENANCE EXTENDS IDENTICALLY — a THIRTEENTH parallel provenance
// collection, `revalidationObservationRecordProvenance`, holds one `LOCAL`/
// `IMPORTED` tag per record at the identical array position, exactly like
// `reconciliationDecisionRecordProvenance` already does. `withUniformProvenance()`
// now also restamps this thirteenth collection uniformly; nothing else
// about that method changes.
//
// VALIDATION IS STRUCTURAL, NOT A SECOND SEMANTIC CHECK — THE IDENTICAL
// RESTRAINT 0.8.150 ALREADY HOLDS FOR `reconciliationDecisionRecords`, ONE
// LAYER OVER. A revalidation observation record is, and remains, a PLAIN
// frozen object — there is no class to delegate to.
// `validateRevalidationObservationRecord()` below checks exactly the shape
// 0.8.162 already defines (`observed === true`, `decision` a genuine 0.8.145
// decision-record shape — reusing `validateReconciliationDecisionRecord()`
// above, itself already a pure SHAPE check, never a semantic one —
// `planIdentity` a genuine 0.8.160 plan-identity shape, `candidatePresent`
// a boolean, `candidateType` one of 0.8.144's own three candidate types,
// `candidateMatchesPlan` a boolean, `observedAt` a valid timestamp) — the
// identical strictness every other plain-object collection in this file
// already holds. It never revalidates the decision, reconstructs the plan,
// recomputes the plan fingerprint, verifies a signature, calls
// 0.8.157-0.8.161, or compares against this replica's current state — this
// file is storage, not a second observation engine.
//
// FINGERPRINTING: THE WHOLE-ARCHIVE FINGERPRINT NATURALLY EXTENDS; THE
// NARROWER ACHIEVEMENT-EVIDENCE FINGERPRINT DELIBERATELY DOES NOT — THE
// IDENTICAL REASONING 0.8.130/0.8.150 ALREADY HOLD, restated here once
// more: a recorded revalidation observation is a durable fact ABOUT a
// historical decision, never achievement evidence itself.
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

    // The count of durable Base PUBLICATION IDENTITY records this archive
    // holds — the identical, entirely separate count application/
    // BitcoinAnchorPublicationRecord.js's own `bitcoinAnchorPublicationRecordCount`
    // already holds, one chain over. Never combined with `publicationCount`,
    // `observationCount`, or `bitcoinAnchorPublicationRecordCount`, and
    // never treated as a measure of how many of them were ever included in
    // a block, broadcast successfully, or observed at all. See application/
    // BaseAnchorPublicationRecord.js's own header.
    get baseAnchorPublicationRecordCount() {
        return this._baseAnchorPublicationRecords.length;
    }

    // The count of durable publication REFERENCE records this archive
    // holds — a relationship between two publication identities, never a
    // fact about one. Never combined with `publicationCount`,
    // `observationCount`, `bitcoinAnchorPublicationRecordCount`, or
    // `baseAnchorPublicationRecordCount`, and never reduced to "distinct
    // referencing publishers" — see application/PublicationReferenceRecord.js's
    // own header, "One Further Rule," for why reference count and distinct
    // referencer count stay two separate, unmerged facts.
    get publicationReferenceRecordCount() {
        return this._publicationReferenceRecords.length;
    }

    // The count of durable publisher-publication ASSOCIATION records this
    // archive holds — a relationship between an explicit publisher
    // identity and a publication identity, never a fact about one
    // publication and never a relationship between two publications. Never
    // combined with `publicationCount`, `observationCount`,
    // `bitcoinAnchorPublicationRecordCount`, `baseAnchorPublicationRecordCount`,
    // or `publicationReferenceRecordCount` — see application/
    // PublisherPublicationAssociationRecord.js's own header.
    get publisherPublicationAssociationRecordCount() {
        return this._publisherPublicationAssociationRecords.length;
    }

    // The count of durable leaderboard CLAIM RECEIPTS this archive holds —
    // a signed, externally authored statement this replica has recorded
    // receiving, never a fact about a publication or a relationship
    // between two publications. Never combined with `publicationCount`,
    // `observationCount`, `bitcoinAnchorPublicationRecordCount`,
    // `baseAnchorPublicationRecordCount`, `publicationReferenceRecordCount`,
    // or `publisherPublicationAssociationRecordCount` — see
    // application/LeaderboardClaimRecord.js's own header. Counts RECEIPTS,
    // not distinct claims: the identical claim received twice counts
    // twice, exactly as `application/LeaderboardClaimHistory.js`'s own
    // multiplicity rule already requires.
    get leaderboardClaimRecordCount() {
        return this._leaderboardClaimRecords.length;
    }

    // The count of durable RECONCILIATION DECISION records this archive
    // holds — an explicit, caller-recorded OBSERVE/DEFER choice about one
    // reconciliation candidate, never a fact about a publication, a claim
    // receipt, or a relationship between two identities. Never combined
    // with `publicationCount`, `observationCount`,
    // `bitcoinAnchorPublicationRecordCount`, `baseAnchorPublicationRecordCount`,
    // `publicationReferenceRecordCount`, `publisherPublicationAssociationRecordCount`,
    // or `leaderboardClaimRecordCount` — see application/
    // PublisherLeaderboardClaimSnapshotReconciliationDecision.js's own
    // header. Counts RECORDED DECISIONS, not distinct candidates: the
    // identical decision recorded twice counts twice, exactly as
    // `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js`'s
    // own multiplicity rule already requires.
    get reconciliationDecisionRecordCount() {
        return this._reconciliationDecisionRecords.length;
    }

    // The count of durable REVALIDATION OBSERVATION records this archive
    // holds — an explicit, caller-recorded check of whether a historical
    // decision's own candidate occurs in an explicitly supplied plan, never
    // a fact about a publication, a claim receipt, a reconciliation
    // decision, or a relationship between two identities. Never combined
    // with `publicationCount`, `observationCount`,
    // `bitcoinAnchorPublicationRecordCount`, `baseAnchorPublicationRecordCount`,
    // `publicationReferenceRecordCount`, `publisherPublicationAssociationRecordCount`,
    // `leaderboardClaimRecordCount`, or `reconciliationDecisionRecordCount` —
    // see application/
    // PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js's
    // own header. Counts RECORDED OBSERVATIONS, not distinct checks: the
    // identical observation recorded twice counts twice, exactly as
    // `application/
    // PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js`'s
    // own multiplicity rule already requires.
    get revalidationObservationRecordCount() {
        return this._revalidationObservationRecords.length;
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

    // 0.8.99 — Appends `record` (an application/BaseAnchorPublicationRecord.js
    // instance) and returns a NEW archive. This is the ONE durable write
    // path for Base publication IDENTITY — mirroring
    // `appendBitcoinAnchorPublicationRecord()` above exactly, one chain
    // over. See application/CreateBaseAnchorPublicationRecordUseCase.js for
    // the one place this codebase constructs a record before appending it
    // here. A missing/falsy `record` is a no-op, mirroring every other
    // appendXxx() method's identical tolerance. Never deduplicates, never
    // merges by `contentHash` or `txid`, never replaces a previous record
    // for the same `txid` — see application/
    // BaseAnchorPublicationRecordHistory.js's own header.
    appendBaseAnchorPublicationRecord(record, origin = PublicationObservationArchiveProvenanceOrigin.LOCAL) {
        if (!record || !isValidPublicationObservationArchiveProvenanceOrigin(origin)) return this;
        return new PublicationObservationArchive({
            ...this._fields(),
            baseAnchorPublicationRecords: appendBaseAnchorPublicationRecordHistoryEntry(this._baseAnchorPublicationRecords, record),
            baseAnchorPublicationRecordProvenance: Object.freeze([...this._baseAnchorPublicationRecordProvenance, origin])
        });
    }

    // 0.8.104 — Appends `record` (an application/PublicationReferenceRecord.js
    // instance) and returns a NEW archive. This is the ONE durable write
    // path for an explicit publication reference relationship — see
    // application/CreatePublicationReferenceRecordUseCase.js for the one
    // place this codebase constructs one before appending it here. A
    // missing/falsy `record` is a no-op, mirroring every other appendXxx()
    // method's identical tolerance. Never deduplicates, never merges two
    // references naming the same source/referenced pair, never infers a
    // reference from anything this archive already holds — see application/
    // PublicationReferenceRecord.js's own header.
    appendPublicationReferenceRecord(record, origin = PublicationObservationArchiveProvenanceOrigin.LOCAL) {
        if (!record || !isValidPublicationObservationArchiveProvenanceOrigin(origin)) return this;
        return new PublicationObservationArchive({
            ...this._fields(),
            publicationReferenceRecords: appendPublicationReferenceRecordHistoryEntry(this._publicationReferenceRecords, record),
            publicationReferenceRecordProvenance: Object.freeze([...this._publicationReferenceRecordProvenance, origin])
        });
    }

    // 0.8.108 — Appends `record` (an application/
    // PublisherPublicationAssociationRecord.js instance) and returns a NEW
    // archive. This is the ONE durable write path for an explicit
    // publisher-publication association — see application/
    // CreatePublisherPublicationAssociationRecordUseCase.js for the one
    // place this codebase constructs one before appending it here. A
    // missing/falsy `record` is a no-op, mirroring every other appendXxx()
    // method's identical tolerance. Never deduplicates, never merges two
    // associations naming the same publisher/publication pair, never
    // infers an association from anything this archive already holds —
    // see application/PublisherPublicationAssociationRecord.js's own
    // header.
    appendPublisherPublicationAssociationRecord(record, origin = PublicationObservationArchiveProvenanceOrigin.LOCAL) {
        if (!record || !isValidPublicationObservationArchiveProvenanceOrigin(origin)) return this;
        return new PublicationObservationArchive({
            ...this._fields(),
            publisherPublicationAssociationRecords: appendPublisherPublicationAssociationRecordHistoryEntry(this._publisherPublicationAssociationRecords, record),
            publisherPublicationAssociationRecordProvenance: Object.freeze([...this._publisherPublicationAssociationRecordProvenance, origin])
        });
    }

    // 0.8.130 — Appends `record` (an application/LeaderboardClaimRecord.js
    // instance) and returns a NEW archive. This is the ONE durable write
    // path for a received, signed leaderboard claim receipt — see
    // application/ReceivePublisherLeaderboardSnapshotClaimIntoArchiveUseCase.js
    // for the one place this codebase constructs one before appending it
    // here. Reuses `application/LeaderboardClaimHistory.js`'s own,
    // UNCHANGED `appendLeaderboardClaimHistoryEntry()` — mirroring exactly
    // how every other `appendXxx()` above reuses its own domain's existing
    // append function. A missing/falsy `record`, or one that is not a
    // genuine `LeaderboardClaimRecord` instance, is a no-op, mirroring
    // every other appendXxx() method's identical tolerance. Never
    // deduplicates, never merges two receipts naming the same claim, never
    // infers a receipt from anything this archive already holds — the
    // identical multiplicity 0.8.123 already established for
    // `LeaderboardClaimHistory` itself.
    appendLeaderboardClaimRecord(record, origin = PublicationObservationArchiveProvenanceOrigin.LOCAL) {
        if (!(record instanceof LeaderboardClaimRecord) || !isValidPublicationObservationArchiveProvenanceOrigin(origin)) return this;
        return new PublicationObservationArchive({
            ...this._fields(),
            leaderboardClaimRecords: appendLeaderboardClaimHistoryEntry(this._leaderboardClaimRecords, record),
            leaderboardClaimRecordProvenance: Object.freeze([...this._leaderboardClaimRecordProvenance, origin])
        });
    }

    // 0.8.150 — Appends `record` (a genuine 0.8.145 decision record —
    // `{ decided: true, candidate, decision, decidedAt }`) and returns a NEW
    // archive. This is the ONE durable write path for a recorded
    // reconciliation decision — see application/
    // RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionIntoArchiveUseCase.js
    // for the one place this codebase constructs the archive-persistence
    // call around it. Reuses `application/
    // PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js`'s
    // own, UNCHANGED `appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry()`
    // — mirroring exactly how `appendLeaderboardClaimRecord()` above reuses
    // its own domain's existing append function. The pre-check below is the
    // IDENTICAL `!decision || typeof !== 'object' || decided !== true`
    // tolerance that function already applies internally — repeated here
    // only so a genuinely no-op call returns `this` (no new instance)
    // rather than an equal-but-freshly-allocated archive, the identical
    // discipline every other `appendXxx()` above already holds. Never
    // deduplicates, never merges two decisions naming the same candidate,
    // never infers a decision from anything this archive already holds —
    // the identical multiplicity 0.8.146 already established for
    // `PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory`
    // itself.
    appendReconciliationDecisionRecord(record, origin = PublicationObservationArchiveProvenanceOrigin.LOCAL) {
        if (!record || typeof record !== 'object' || record.decided !== true || !isValidPublicationObservationArchiveProvenanceOrigin(origin)) return this;
        return new PublicationObservationArchive({
            ...this._fields(),
            reconciliationDecisionRecords: appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry(this._reconciliationDecisionRecords, record),
            reconciliationDecisionRecordProvenance: Object.freeze([...this._reconciliationDecisionRecordProvenance, origin])
        });
    }

    // 0.8.167 — Appends `observation` (a genuine 0.8.162 observation record
    // — `{ observed: true, decision, planIdentity, candidatePresent,
    // candidateType, candidateMatchesPlan, observedAt }`) and returns a NEW
    // archive. This is the ONE durable write path for a recorded
    // revalidation observation — see application/
    // RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationIntoArchiveUseCase.js
    // for the one place this codebase constructs the archive-persistence
    // call around it. Reuses `application/
    // PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js`'s
    // own, UNCHANGED
    // `appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry()`
    // — mirroring exactly how `appendReconciliationDecisionRecord()` above
    // reuses its own domain's existing append function. The pre-check below
    // is the IDENTICAL `!observation || typeof !== 'object' || observed !==
    // true` tolerance that function already applies internally — repeated
    // here only so a genuinely no-op call returns `this` (no new instance)
    // rather than an equal-but-freshly-allocated archive, the identical
    // discipline every other `appendXxx()` above already holds. Never
    // deduplicates, never merges two observations naming the same decision
    // or plan, never infers an observation from anything this archive
    // already holds — the identical multiplicity 0.8.163 already
    // established for
    // `PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory`
    // itself.
    appendRevalidationObservationRecord(observation, origin = PublicationObservationArchiveProvenanceOrigin.LOCAL) {
        if (!observation || typeof observation !== 'object' || observation.observed !== true || !isValidPublicationObservationArchiveProvenanceOrigin(origin)) return this;
        return new PublicationObservationArchive({
            ...this._fields(),
            revalidationObservationRecords: appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(this._revalidationObservationRecords, observation),
            revalidationObservationRecordProvenance: Object.freeze([...this._revalidationObservationRecordProvenance, origin])
        });
    }

    // Replaces EVERY provenance entry this archive holds — across all
    // THIRTEEN factual collections — with `origin`, uniformly.
    // `archiveImportEvents` and every factual collection are untouched;
    // only the thirteen PARALLEL provenance collections change. An invalid
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
            ),
            baseAnchorPublicationRecordProvenance: Object.freeze(this._baseAnchorPublicationRecordProvenance.map(() => origin)),
            publicationReferenceRecordProvenance: Object.freeze(this._publicationReferenceRecordProvenance.map(() => origin)),
            publisherPublicationAssociationRecordProvenance: Object.freeze(this._publisherPublicationAssociationRecordProvenance.map(() => origin)),
            leaderboardClaimRecordProvenance: Object.freeze(this._leaderboardClaimRecordProvenance.map(() => origin)),
            reconciliationDecisionRecordProvenance: Object.freeze(this._reconciliationDecisionRecordProvenance.map(() => origin)),
            revalidationObservationRecordProvenance: Object.freeze(this._revalidationObservationRecordProvenance.map(() => origin))
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

// 0.8.150 — a `PublisherLeaderboardClaimSnapshotReconciliationDecision.js`
// (0.8.145) decision record is, and remains, a PLAIN frozen object — there
// is no class to call `.toJSON()`/`.fromJSON()` on, so this file's own
// `bitcoinBroadcastRecords` precedent (a plain object, serialized/
// deserialized inline) is the one to follow here, not `LeaderboardClaimRecord`'s.
// `decidedAt` is ALREADY an ISO 8601 string on every genuine record (0.8.145
// never stores a live `Date`), so no timestamp conversion happens on
// either side of this round trip — see that file's own header, "`decidedAt`
// is an explicit, caller-supplied fact."
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

// 0.8.167 — a `PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js`
// (0.8.162) observation record is, and remains, a PLAIN frozen object —
// there is no class to call `.toJSON()`/`.fromJSON()` on, so this file's
// own `serializeReconciliationDecisionRecord()` precedent, immediately
// above, is the one to follow here too. The embedded `decision` field is
// itself a genuine 0.8.145 decision record, so it is serialized/deserialized
// by reusing `serializeReconciliationDecisionRecord()`/
// `deserializeReconciliationDecisionRecord()` UNCHANGED — never a second,
// independently-maintained copy of that shape. `observedAt` is ALREADY an
// ISO 8601 string on every genuine record (0.8.162 never stores a live
// `Date`), so no timestamp conversion happens on either side of this round
// trip — see that file's own header, "`observedAt` is an explicit,
// caller-supplied fact."
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

// 0.8.114 — this record-level validator, and
// `validateBaseAnchorPublicationRecord()`/`validatePublicationReferenceRecord()`/
// `validatePublisherPublicationAssociationRecord()`/`validateArray()` below,
// are EXPORTED (unchanged) so application/AchievementEvidenceExport.js's
// own, deliberately NARROWER `importAchievementEvidence()` can validate
// exactly these four record shapes with the identical strictness this
// file already holds for a full archive import — never a second,
// independently-maintained copy of "what a genuine BitcoinAnchorPublicationRecord
// JSON shape looks like." See that file's own header for why it exports
// only these four durable, identity-shaped collections and none of this
// archive's other seven.
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

// 0.8.104 — a nested `BlockchainPublicationIdentity` (0.8.89) JSON shape,
// validated to the identical strictness every other nested fact in this
// file already holds: exactly its own four fields, a known
// `BlockchainKind`, non-empty `contentHash`/`chainReference`, and a valid
// `createdAt` timestamp.
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

// 0.8.108 — a nested `PublisherIdentityRecord` (0.8.108) JSON shape,
// validated to the identical strictness every other nested fact in this
// file already holds: exactly its own one field, a non-empty
// `publisherId`.
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

// 0.8.130 — a `LeaderboardClaimRecord` (0.8.123) JSON shape. Top-level
// shape (exactly `claim`/`receivedAt`/`origin`, nothing more) is checked
// here, to the identical strictness every other record in this file
// already holds; the DEEP validation — is `claim` a genuine, structurally
// verifiable `PublisherLeaderboardSnapshotClaim`? is it signed? is
// `receivedAt` a real date? is `origin` a real provenance value? — is
// delegated entirely to `LeaderboardClaimRecord.fromJSON()` itself
// (0.8.123, UNCHANGED) rather than reimplemented here a second time. See
// this file's own 0.8.130 header, "Do Not Create A Second Archive-Specific
// Claim Parser."
function validateLeaderboardClaimRecord(record) {
    if (!isPlainObject(record) || !hasOnlyKeys(record, LEADERBOARD_CLAIM_RECORD_FIELDS)) return null;
    if (!LEADERBOARD_CLAIM_RECORD_FIELDS.every((key) => key in record)) return null;
    if (!LeaderboardClaimRecord.fromJSON(record)) return null;
    return record;
}

// 0.8.150 — a `PublisherLeaderboardClaimSnapshotReconciliationDecision.js`
// (0.8.145) candidate JSON shape — one of 0.8.144's own three discriminated
// shapes, checked to the identical strictness every other nested fact in
// this file already holds (exactly its own fields, nothing more, nothing
// missing). There is no class to delegate to (see `serializeReconciliationDecisionRecord()`'s
// own header, above) so this validator inlines the shape 0.8.144's own
// `describePublisherLeaderboardClaimSnapshotReconciliationCandidate()`
// already defines, rather than importing that function to re-derive
// anything — this file never calls 0.8.144 or 0.8.145.
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

// A genuine 0.8.145 decision record JSON shape — exactly `decided`/
// `candidate`/`decision`/`decidedAt`, `decided` strictly `true`, `decision`
// one of 0.8.145's own two-value vocabulary, `decidedAt` a valid timestamp,
// and `candidate` a genuine 0.8.144 candidate shape per
// `validateReconciliationDecisionCandidate()` above.
function validateReconciliationDecisionRecord(record) {
    if (!isPlainObject(record) || !hasOnlyKeys(record, RECONCILIATION_DECISION_RECORD_FIELDS)) return null;
    if (!RECONCILIATION_DECISION_RECORD_FIELDS.every((key) => key in record)) return null;
    if (record.decided !== true) return null;
    if (record.decision !== 'OBSERVE' && record.decision !== 'DEFER') return null;
    if (!isValidTimestamp(record.decidedAt)) return null;
    if (!validateReconciliationDecisionCandidate(record.candidate)) return null;
    return record;
}

// 0.8.167 — a `PublisherLeaderboardClaimSnapshotReconciliationPlanIdentity.js`
// (0.8.160) plan-identity JSON shape, validated to the identical strictness
// every other nested fact in this file already holds: exactly its own three
// fields, the one known algorithm, a genuine 64-character lowercase hex
// `planFingerprint`, and a non-negative integer `candidateCount`. This
// checks SHAPE only — it never recomputes a fingerprint from a plan (there
// is no plan to recompute one from here) and never compares it against
// anything.
function validateRevalidationPlanIdentity(value) {
    if (!isPlainObject(value) || !hasOnlyKeys(value, RECONCILIATION_PLAN_IDENTITY_FIELDS)) return null;
    if (!RECONCILIATION_PLAN_IDENTITY_FIELDS.every((key) => key in value)) return null;
    if (value.algorithm !== 'SHA-256') return null;
    if (typeof value.planFingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(value.planFingerprint)) return null;
    if (!Number.isInteger(value.candidateCount) || value.candidateCount < 0) return null;
    return value;
}

// 0.8.167 — a genuine 0.8.162 revalidation observation record JSON shape —
// exactly `observed`/`decision`/`planIdentity`/`candidatePresent`/
// `candidateType`/`candidateMatchesPlan`/`observedAt`, `observed` strictly
// `true`, `decision` a genuine 0.8.145 decision-record shape (reusing
// `validateReconciliationDecisionRecord()` above UNCHANGED — a pure SHAPE
// check, never a re-derivation of whether that decision was itself
// correct), `planIdentity` a genuine 0.8.160 plan-identity shape per
// `validateRevalidationPlanIdentity()` above, `candidatePresent`/
// `candidateMatchesPlan` genuine booleans, `candidateType` one of 0.8.144's
// own three candidate types, and `observedAt` a valid timestamp. THIS
// VALIDATOR CHECKS SHAPE ONLY — see this file's own 0.8.167 header,
// "Validation is structural, not a second semantic check": it never
// revalidates the decision, reconstructs the plan, recomputes the plan
// fingerprint, verifies a signature, calls 0.8.157-0.8.161, or compares
// against this replica's current state.
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
