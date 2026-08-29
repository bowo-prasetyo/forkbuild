import { PublicationObservationArchive } from './PublicationObservationArchive.js';
import { reconstructAchievementEvidenceFingerprint } from './AchievementEvidenceFingerprint.js';
import { describePublisherLeaderboard, reconstructPublisherLeaderboard } from './PublisherLeaderboardView.js';

// 0.8.119 — Reproducible Leaderboard Snapshot.
//
// 0.8.116 through 0.8.118 gave two replicas a way to learn THAT their
// evidence differs (fingerprint), EXACTLY what differs (difference), and a
// portable way to CLOSE that gap (exchange). None of them ever asked the
// question a decentralized network needs answered once evidence itself has
// converged: can the CONCLUSION — a leaderboard — be identified and
// reproduced independently, the same way the evidence underneath it
// already can be? This file is that question, answered as a projection,
// never a second ranking engine:
//
//   Evidence fingerprint   (0.8.116, UNCHANGED)
//           +
//   Ranking policy          (0.8.112, UNCHANGED, echoed verbatim by 0.8.113)
//           +
//   Leaderboard              (0.8.113, UNCHANGED)
//           │
//           │  describePublisherLeaderboardSnapshot()   (THIS MILESTONE)
//           ▼
//   Publisher Leaderboard Snapshot
//     { evidenceFingerprint, policy, leaderboard }
//
// Two replicas holding byte-identical evidence and applying the identical
// ranking policy produce a byte-identical snapshot. That is the entire
// reproducibility claim this file exists to state explicitly — nothing
// about it is new arithmetic; every one of its three fields is an
// already-computed value from a milestone this codebase already shipped,
// echoed here, together, for the first time.
//
// A SNAPSHOT CARRIES EXACTLY THREE FIELDS — THE TWO INPUTS THAT MAKE A
// LEADERBOARD REPRODUCIBLE, AND THE LEADERBOARD ITSELF. `evidenceFingerprint`
// is 0.8.116's own whole-evidence-set fingerprint (a 64-char lowercase hex
// string — the identical field name and shape 0.8.118's own exchange
// request already carries, reused rather than reinvented). `policy` is
// 0.8.112's own ranking policy object, echoed by reference — the EXACT SAME
// instance `leaderboard.policy` already carries (0.8.113 already preserves
// it verbatim; see below). `leaderboard` is 0.8.113's own complete
// leaderboard result, unchanged. Nothing else lives on this result — no
// publisher count, no entry count duplicated at the top level, no "as of"
// timestamp, no snapshot-scoped identifier of any kind beyond the two
// fields that already answer "what would make this reproducible."
//
// SNAPSHOT IDENTITY IS THE PAIR (evidenceFingerprint, policy.version) —
// NEVER A TIMESTAMP, NEVER A PUBLISHER COUNT, NEVER A HASH OF THE
// LEADERBOARD ITSELF. Two snapshots describe the identical computation
// exactly when their `evidenceFingerprint` strings match AND their
// `policy.version` numbers match — nothing else needs to agree, and
// nothing else is consulted. A timestamp is deliberately absent from this
// notion of identity: recomputing a snapshot from the identical evidence,
// under the identical policy, a minute later or a year later produces the
// IDENTICAL snapshot — see this file's own "Determinism" test. If a caller
// ever wants a human-readable "as of" moment to display alongside a
// snapshot, that is presentation metadata layered on top by that caller,
// never a field this file introduces or reads back as part of what makes
// two snapshots the same computation. This file does not export a
// dedicated `snapshotIdentity` field or comparison function — a caller
// already has everything needed to compare two snapshots for identity with
// nothing more than `a.evidenceFingerprint === b.evidenceFingerprint &&
// a.policy.version === b.policy.version`, the identical restraint 0.8.116's
// own header already held for comparing two fingerprints ("a caller already
// has everything needed to compare two of this file's own results with
// `===`").
//
// NO SNAPSHOT HASH — DELIBERATELY DECLINED, NOT MERELY OMITTED. This file
// never computes a SHA-256 (or any other digest) over the leaderboard
// itself. `evidenceFingerprint` already identifies the evidence; `policy`
// is already explicit, structured data a caller can compare field by
// field; and the leaderboard is a deterministic function of those two
// inputs alone (see "Leaderboard projection purity," below) — a second,
// leaderboard-scoped hash would add no information a caller does not
// already have, while inventing a second, competing notion of "the
// snapshot's true identity" alongside the pair that already serves that
// purpose. If a genuinely new need for one ever arises, that is real,
// separately sized, later work this milestone deliberately does not
// pre-build.
//
// POLICY PROVENANCE — THE EXACT POLICY OBJECT, NEVER A BARE VERSION
// NUMBER. `snapshot.policy` is not `{ version: 1 }`; it is 0.8.112's own
// complete `describePublisherRankingPolicy()` result — `version`,
// `criteria`, and `tieBreak`, all three, exactly as 0.8.113 already
// preserves it on `leaderboard.policy`. `describePublisherLeaderboardSnapshot()`
// below never re-describes it, never summarizes it down to a number, and
// never reads it from anywhere other than the leaderboard it was handed —
// `snapshot.policy` and `snapshot.leaderboard.policy` are the SAME object
// instance, by reference, not two independently-produced copies that could
// silently drift apart. This makes the reproducibility statement a snapshot
// carries strictly stronger than "policy version 1" alone: a future policy
// implementation could someday reinterpret what version 1 means in the
// abstract, but it can never reinterpret the exact `criteria` and
// `tieBreak` array this snapshot already carries, frozen, alongside it.
//
// COMPOSES TWO EXISTING RECONSTRUCTIONS — NO PARALLEL FINGERPRINT ENGINE,
// NO PARALLEL RANKING ENGINE, NO PARALLEL LEADERBOARD PROJECTION.
// `reconstructPublisherLeaderboardSnapshot()` below calls
// `reconstructAchievementEvidenceFingerprint()` (0.8.116, UNCHANGED) and
// `reconstructPublisherLeaderboard()` (0.8.113, UNCHANGED) exactly once
// each, and hands their results, unchanged, to the pure function above. It
// never reads an evidence collection off the archive directly, never
// recomputes a SHA-256 of anything, never re-derives a ranking, and never
// implements a second comparator — grep this file and there is no `sort()`
// call, no hashing primitive, and no criteria array anywhere in it. A
// leaderboard snapshot answers "can the CONCLUSION be reproduced," and it
// answers that question exclusively by echoing two already-reproducible
// conclusions together — never by computing a third one of its own.
//
// DO NOT PERSIST A SNAPSHOT — IT IS COMPUTED FRESH, EVERY TIME, EXACTLY
// LIKE THE FINGERPRINT AND THE LEADERBOARD IT COMPOSES. There is no
// `PublisherLeaderboardSnapshotRecord`, no new collection on
// `application/PublicationObservationArchive.js`, and no `SCHEMA_VERSION`
// bump. The durable facts remain exactly what they already were; a
// snapshot is a derived artifact, reconstructable from an archive at any
// moment, never a fact ABOUT an archive that could go stale the instant
// the archive changes underneath it. Changing one achievement-driving
// evidence fact changes the reconstructed fingerprint, which changes the
// reconstructed snapshot — by construction, never by a migration or a
// stale cache invalidation this file would need to manage.
//
// LEADERBOARD PROJECTION PURITY — NO RE-RANKING, NO SECOND COMPARATOR,
// EVER, INSIDE THIS LAYER. `describePublisherLeaderboardSnapshot()`
// receives an already-computed leaderboard and echoes it verbatim, by
// reference, on the result — it does not read `leaderboard.entries`, does
// not iterate them, does not re-derive `rank`, and does not touch
// `leaderboard.policy.criteria` for any purpose other than copying the
// reference onto `snapshot.policy`. Exactly like `application/
// PublisherLeaderboardView.js`'s own relationship to 0.8.112's ranking, one
// layer down, this file composes one existing computation; it does not
// perform a second, competing one, and it does not even inspect the one it
// composes closely enough to have an opinion about it.
//
// ARCHIVE ISOLATION — A SNAPSHOT READS ONLY WHAT THE FINGERPRINT AND THE
// LEADERBOARD ALREADY READ, AND NOTHING ELSE. `reconstructPublisherLeaderboardSnapshot()`
// touches an archive exactly twice — once through
// `reconstructAchievementEvidenceFingerprint()`, once through
// `reconstructPublisherLeaderboard()` — and both of those, transitively,
// read only the four evidence collections 0.8.114 already named "the
// achievement evidence" (`bitcoinAnchorPublicationRecords`,
// `baseAnchorPublicationRecords`, `publicationReferenceRecords`,
// `publisherPublicationAssociationRecords`). `PublicationObservationArchive.js`'s
// other six collections — IPFS records, every observation-by-key
// collection, broadcast records, import events — are invisible here,
// exactly as they are invisible to every file this one composes. Recording
// a new confirmation observation, a new content-proof observation, or a
// new IPFS publication never changes a single field on a reconstructed
// snapshot — see this file's own "Archive isolation" test for the concrete
// proof.
//
// MALFORMED/ABSENT INPUT IS TOLERATED, NEVER THROWN ON — THE IDENTICAL
// RESTRAINT EVERY `describeXxx()` IN THIS FAMILY ALREADY HOLDS. A
// non-string, or non-genuine-hex, `evidenceFingerprint` degrades to the
// canonical empty-evidence fingerprint (0.8.116's own fingerprint over four
// empty collections) rather than being echoed as-is or thrown on. A
// leaderboard that is not genuinely shaped like 0.8.113's own result (a
// `policy` object and an `entries` array) degrades to
// `describePublisherLeaderboard(undefined)` — 0.8.113's own well-defined
// empty leaderboard. Neither fallback is a guess at what the caller meant;
// both are the identical "well-defined empty" values every other file at
// this layer already falls back to when handed something malformed.
//
// SYNCHRONOUS, PURE, DETERMINISTIC, SELF-CONTAINED: NO NEW HASHING, NO NEW
// COMPARISON, NO CLOCK. `describePublisherLeaderboardSnapshot()` reads no
// clock, no storage, no network, and mutates no input. Calling it twice
// with equivalent arguments — even reached by two entirely independent
// code paths, even on two entirely independent replicas — returns a
// byte-identical result. `reconstructPublisherLeaderboardSnapshot()` below
// is the ONE, thin, archive-reading entry point, mirroring every other
// `reconstructXxx()` in this family exactly.
//
// NO SCORE, NO POINTS, NO LEVEL, NO TIER, NO XP, NO REPUTATION, NO WEIGHT,
// NO RATING, NO PERCENTILE, NO TRUST, NO VERIFICATION — THE IDENTICAL
// VOCABULARY BOUNDARY EVERY FILE IN THIS FAMILY ALREADY HOLDS, HELD HERE
// ONCE MORE, ONE LAYER UP. A snapshot names nothing beyond what the
// fingerprint, the policy, and the leaderboard already name.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No snapshot persistence, no
// `leaderboardSnapshots` collection, no server-generated leaderboard state
// — see "Do not persist a snapshot," above. No snapshot hash — see "No
// snapshot hash," above. No comparison function, no
// `compareLeaderboardSnapshots()`, no `MATCH`/`DIFFERENT` outcome — a
// caller already has everything needed with plain field access and `===`.
// No "as of" timestamp, no display formatting, no UI of any kind — this
// file returns plain, frozen, JSON-safe data, exactly like every
// `describeXxx()`/`reconstructXxx()` pair below it. No verification of an
// externally supplied candidate snapshot against this replica's own
// independent reconstruction — that is 0.8.120's own, separately sized
// question, "Reproducible Leaderboard Snapshot Verification." No portable
// bundle combining a publisher's own evidence with derived views — that is
// 0.8.121's own, separately sized question. No peer, transport, or
// synchronization mechanism of any kind — 0.8.118, UNCHANGED, already
// carries that responsibility; this file is never involved in moving a
// single byte between two replicas.
export function describePublisherLeaderboardSnapshot(evidenceFingerprint, leaderboard) {
    const safeFingerprint = isGenuineFingerprintHex(evidenceFingerprint)
        ? evidenceFingerprint
        : reconstructAchievementEvidenceFingerprint(PublicationObservationArchive.empty()).fingerprint;
    const safeLeaderboard = isGenuineLeaderboard(leaderboard)
        ? leaderboard
        : describePublisherLeaderboard(undefined);

    return Object.freeze({
        evidenceFingerprint: safeFingerprint,
        policy: safeLeaderboard.policy,
        leaderboard: safeLeaderboard
    });
}

// reconstructPublisherLeaderboardSnapshot() — the ONE, thin,
// archive-reading entry point. It pulls this replica's own current
// evidence fingerprint straight out of `reconstructAchievementEvidenceFingerprint()`
// (0.8.116, UNCHANGED) and its own current leaderboard straight out of
// `reconstructPublisherLeaderboard()` (0.8.113, UNCHANGED), and hands both,
// unchanged, to the pure function above. An invalid/missing archive is
// treated exactly like every other `reconstructXxx()` in this family — both
// composed reconstructions already reduce it to
// `PublicationObservationArchive.empty()`, and this file performs no
// separate `instanceof` check or fallback of its own; there is nothing left
// for a second copy of that same tolerance to protect against here.
export function reconstructPublisherLeaderboardSnapshot(archive) {
    const safeArchive = archive instanceof PublicationObservationArchive ? archive : PublicationObservationArchive.empty();
    const { fingerprint } = reconstructAchievementEvidenceFingerprint(safeArchive);
    const leaderboard = reconstructPublisherLeaderboard(safeArchive);
    return describePublisherLeaderboardSnapshot(fingerprint, leaderboard);
}

function isGenuineFingerprintHex(value) {
    return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

function isGenuineLeaderboard(value) {
    return Boolean(value)
        && typeof value === 'object'
        && Boolean(value.policy)
        && typeof value.policy === 'object'
        && Array.isArray(value.entries);
}
