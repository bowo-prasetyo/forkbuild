import { describePublisherLeaderboardSnapshot } from './Snapshot.js';
import { sha256Hex } from '../../../core/Sha256.js';

// 0.8.121 — Leaderboard Snapshot Fingerprint (the cryptographic claim
// digest, NOT a replacement for 0.8.119's own semantic snapshot identity).
//
//   PublisherLeaderboardSnapshot                (0.8.119, UNCHANGED)
//     { evidenceFingerprint, policy, leaderboard }
//              │
//              │  describePublisherLeaderboardSnapshotFingerprint()
//              ▼
//   { algorithm: 'SHA-256', fingerprint: <64-char lowercase hex> }
//
// 0.8.119's own header DECLINED a snapshot hash, deliberately — its own
// words: "a second, leaderboard-scoped hash would add no information a
// caller does not already have, while inventing a second, competing
// notion of 'the snapshot's true identity' alongside the pair that
// already serves that purpose." That restraint is UNCHANGED and this file
// does not undo it — `application/leaderboard/snapshot/Snapshot.js` itself
// is not touched by this milestone, gains no new field, and no new
// export. This file exists BESIDE it, for a narrower purpose 0.8.119
// never needed to serve: giving a SIGNATURE (see
// core/PublisherLeaderboardSnapshotClaim.js) something to authenticate
// that is exact BYTES, not a semantic equivalence class.
//
// WHY A SIGNATURE NEEDS A DIFFERENT KIND OF FINGERPRINT THAN "IDENTITY"
// DOES. 0.8.119's `(evidenceFingerprint, policy.version)` pair answers
// "would two replicas compute the same leaderboard?" — and under correct,
// unmodified computation, the answer is always consistent with the full
// snapshot content, because a snapshot is a pure, deterministic function
// of exactly those two inputs (see 0.8.119's own "Leaderboard projection
// purity"). A signature's job is different: it authorizes EXACT bytes a
// signer looked at and attested to, the same posture `core/Signature.js`'s
// own canonical-envelope discipline already takes for every other signed
// object in this codebase ("ForkBuild NEVER signs arbitrary serialized
// JSON"). `snapshotFingerprint` is that exact-bytes digest — computed over
// the COMPLETE snapshot (evidence fingerprint, full policy, full
// leaderboard, every entry, every rank), never merely the two-field
// semantic pair — so a claim's signature is never weaker than what it
// visibly appears to authenticate.
//
// TWO FINGERPRINTS, NEVER CONFUSED FOR ONE ANOTHER.
//
//   application/achievement/AchievementEvidenceFingerprint.js  (0.8.116)
//     — fingerprints EVIDENCE. Two replicas' RAW FACTS.
//
//   THIS FILE (0.8.121)
//     — fingerprints a SNAPSHOT — evidence fingerprint, policy, AND the
//       computed leaderboard, together. Two replicas' CONCLUSION.
//
// A caller who wants to know "do two replicas hold the same facts?" reads
// 0.8.116's own fingerprint; a caller who wants to know "does this exact
// signed conclusion match byte-for-byte?" reads this one. Neither is ever
// substituted for the other anywhere in this codebase.
//
// REUSES 0.8.119's OWN NORMALIZATION — NO SECOND TOLERANCE SCHEME. Before
// hashing, the input is routed through `describePublisherLeaderboardSnapshot()`
// (0.8.119, UNCHANGED) exactly the way `application/
// leaderboard/snapshot/Verification.js`'s own `normalizeSnapshot()`
// already does (0.8.120) — a genuine `{ evidenceFingerprint, leaderboard }`
// shape passes through unchanged, and anything malformed or absent
// degrades to the identical well-defined empty snapshot 0.8.119 already
// defines. This file invents no new fallback rule.
//
// CANONICALIZATION IS PLAIN `JSON.stringify()` OVER THE NORMALIZED
// SNAPSHOT — NO SORTING, NO FIELD-BY-FIELD RECURSION. Unlike 0.8.116's own
// multi-collection, order-independent canonicalization (built for
// collections that can legitimately arrive in different ingestion order
// on different replicas), a `PublisherLeaderboardSnapshot` has exactly one
// well-defined shape and field order — `describePublisherLeaderboardSnapshot()`
// itself always produces `{ evidenceFingerprint, policy, leaderboard }` in
// that fixed order, and every nested object beneath it (a ranking policy,
// a leaderboard entry) is likewise always built in one fixed field order
// by the single `describeXxx()` that produces it. `JSON.stringify()`
// over that already-canonical shape is therefore already deterministic —
// reusing it here is not a shortcut, it is the correct amount of work.
//
// SYNCHRONOUS, PURE, DETERMINISTIC. SHA-256 comes from core/Sha256.js
// rather than `crypto.subtle.digest()`, which is Promise-only and has no
// honest use where a fingerprint is computed synchronously alongside every
// other `describeXxx()` projection.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No comparison of two
// fingerprints — a caller already has everything needed with `===`. No
// signing, no public/private keys — see core/PublisherLeaderboardSnapshotClaim.js
// for where signing actually happens, one layer up. No persistence — this
// file computes fresh, every time, exactly like every fingerprint it sits
// beside.
export const PublisherLeaderboardSnapshotFingerprintAlgorithm = 'SHA-256';

// The pure computation. Accepts anything shaped like — or claiming to be
// — a 0.8.119 PublisherLeaderboardSnapshot and returns a frozen
// `{ algorithm, fingerprint }`. Never throws, never mutates its input,
// reads no clock, no storage, no network.
export function describePublisherLeaderboardSnapshotFingerprint(snapshot) {
    const source = (snapshot && typeof snapshot === 'object') ? snapshot : {};
    const normalized = describePublisherLeaderboardSnapshot(source.evidenceFingerprint, source.leaderboard);
    return Object.freeze({
        algorithm: PublisherLeaderboardSnapshotFingerprintAlgorithm,
        fingerprint: sha256Hex(JSON.stringify(normalized))
    });
}
