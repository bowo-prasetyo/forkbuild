import { PublicationObservationArchive } from './PublicationObservationArchive.js';
import { describePublisherLeaderboardSnapshot, reconstructPublisherLeaderboardSnapshot } from './PublisherLeaderboardSnapshot.js';

// 0.8.120 — Reproducible Leaderboard Snapshot Verification.
//
// 0.8.119 proved that a leaderboard CONCLUSION can be identified and
// reproduced independently, exactly like the evidence underneath it — two
// replicas holding byte-identical evidence and applying the identical
// ranking policy compute a byte-identical snapshot. It never asked what a
// decentralized network needs asked the moment a snapshot arrives from
// SOMEWHERE ELSE: a peer, an export, a message passed hand to hand. This
// file is that question, answered as a comparison, never a second
// leaderboard engine, never a trust decision:
//
//   Remote Snapshot
//         │
//         ▼
//     Verification
//         ▲
//         │
//   Local Evidence ──► Local Snapshot   (0.8.119, UNCHANGED)
//
// A REPLICA NEVER TRUSTS A SUPPLIED SNAPSHOT; IT RECOMPUTES ITS OWN AND
// COMPARES. `verifyPublisherLeaderboardSnapshot()` below never reads a
// single field off the candidate snapshot as if it were true — it
// independently reconstructs THIS replica's own current snapshot straight
// from its own archive (0.8.119's own `reconstructPublisherLeaderboardSnapshot()`,
// UNCHANGED) and hands both snapshots, local and candidate, to a pure
// comparison. The candidate is data to compare against, never an oracle.
//
// VERIFICATION DESCRIBES COMPARISON FACTS; IT NEVER ASSIGNS TRUST OR
// REPUTATION — THE IDENTICAL RESTRAINT `application/AchievementEvidenceFingerprint.js`'s
// own header already holds ("never described as verified, authentic,
// trusted, or in sync"), held here once more, one layer up, for the word
// "verification" itself. This file's own result names FOUR independent
// comparison facts and one summary of them — `matches`,
// `evidenceFingerprintMatches`, `policyVersionMatches`, `policyMatches`,
// `leaderboardMatches` — and nothing beyond that vocabulary. It never
// returns a score, a confidence percentage, a "trusted"/"untrusted" label,
// or a "verified publisher" status. See `docs/Principles.md`, "The UI
// Displays Observations; It Does Not Turn Them Into A Verdict (0.8.57)" —
// a boolean comparison result is an observation about two snapshots, not a
// verdict about either replica that produced them.
//
// A RESULT NAMES EXACTLY FOUR COMPARISON FACTS, EACH INDEPENDENTLY
// COMPUTED — NEVER DERIVED FROM ONE ANOTHER BY ASSUMPTION.
//
//   { matches, evidenceFingerprintMatches, policyVersionMatches,
//     policyMatches, leaderboardMatches }
//
// `evidenceFingerprintMatches` compares 0.8.116's own fingerprint strings
// with `===`. `policyVersionMatches` compares 0.8.112's own `policy.version`
// numbers with `===`. `policyMatches` compares the two COMPLETE policy
// objects — `version`, `criteria`, and `tieBreak`, all three — field by
// field, never summarized to the version number alone; a policy could in
// principle share a version number while some future implementation
// mistake left `criteria` or `tieBreak` different, and this field is
// computed independently so that mistake would show up here rather than
// being masked by `policyVersionMatches` alone. `leaderboardMatches`
// compares the two COMPLETE leaderboard results — every entry, every rank,
// in order — never merely their entry counts. None of the four is derived
// from another by shortcut: `leaderboardMatches` is not computed as
// "`policyMatches` AND the entries look equal," and `policyMatches` is not
// computed as "`policyVersionMatches` is true, so assume the rest agrees."
// Each is its own independent equality check over its own slice of the two
// snapshots. (In practice a genuine mismatch in `leaderboardMatches` often
// co-occurs with one further up — the leaderboard embeds its own `policy`
// verbatim, see 0.8.119's own "Policy provenance" — but this file never
// relies on that co-occurrence; it always checks all four.)
// `matches` is `true` exactly when all four of the others are `true`, and
// `false` the moment any one of them is `false` — the single field a
// caller reads when only the yes/no answer matters, with the other four
// available for exactly why not.
//
// THE COMPARISON ITSELF IS PLAIN STRUCTURAL EQUALITY — NO NEW HASHING, NO
// NEW COMPARATOR, REUSING THE IDENTICAL `JSON.stringify()` EQUALITY THIS
// FAMILY'S OWN TESTS ALREADY RELY ON. `evidenceFingerprintMatches` and
// `policyVersionMatches` compare primitives with `===`; `policyMatches` and
// `leaderboardMatches` compare `JSON.stringify()` of the two respective
// values. This is deliberately the SAME notion of equality 0.8.119's own
// test file already used throughout (`serializeSnapshot()`,
// `JSON.stringify(snapshot)`) to decide "these two snapshots are the same
// computation" — never a fifth, competing equality scheme invented here.
// Exactly like 0.8.119's own "No snapshot hash" restraint, this file never
// computes a digest over anything; every comparison reads structured data
// a caller could already read and compare by hand.
//
// NORMALIZATION REUSES 0.8.119's OWN TOLERANCE — NEVER A SECOND, PARALLEL
// SET OF FALLBACK RULES. A `candidateSnapshot` arriving from outside this
// replica (a peer, an export, plain JSON off the wire) is never assumed to
// be genuinely shaped like a snapshot. Rather than inventing a new
// tolerance rule for "what does a malformed candidate degrade to," this
// file routes both the local snapshot and the candidate through
// `describePublisherLeaderboardSnapshot()` (0.8.119, UNCHANGED) before
// comparing — the EXACT SAME function, and therefore the EXACT SAME
// fallback, that already degrades a non-genuine `evidenceFingerprint` to
// the canonical empty-evidence fingerprint and a non-genuine leaderboard to
// `describePublisherLeaderboard(undefined)`. A candidate that is
// well-formed passes through unchanged (0.8.119's own tolerance is a
// pass-through in the genuine case); a candidate that is missing, `null`,
// or shaped like garbage normalizes to the identical well-defined empty
// snapshot 0.8.119 already defines — never a thrown error, never a second
// definition of "empty" living in this file.
//
// COMPOSES ONE EXISTING RECONSTRUCTION — NO PARALLEL FINGERPRINT ENGINE, NO
// PARALLEL RANKING ENGINE, NO PARALLEL LEADERBOARD PROJECTION, NO PARALLEL
// SNAPSHOT PROJECTION. `verifyPublisherLeaderboardSnapshot()` calls
// `reconstructPublisherLeaderboardSnapshot()` (0.8.119, UNCHANGED) exactly
// once, for the LOCAL side only, and hands its result — together with the
// externally supplied candidate, untouched — to the pure function below.
// It never reads an evidence collection off an archive directly, never
// recomputes a fingerprint or a ranking, and never reconstructs a second
// snapshot for the candidate side — a candidate is compared AS SUPPLIED,
// never re-derived from some archive of its own (there is no such archive
// available here in the first place; a candidate arrived as plain data).
//
// NAMING: "VERIFY," NOT "RECONSTRUCT," FOR THE ARCHIVE-READING ENTRY
// POINT — A DELIBERATE, NARROW DEPARTURE FROM THIS FAMILY'S OWN
// `reconstructXxx()` CONVENTION, NOT AN OVERSIGHT. Every other archive-reading
// entry point in this family (`reconstructAchievementEvidenceFingerprint()`,
// `reconstructPublisherLeaderboard()`, `reconstructPublisherLeaderboardSnapshot()`)
// reconstructs ONE replica's own state from ITS OWN archive alone — nothing
// external is ever involved. `verifyPublisherLeaderboardSnapshot()` is the
// first entry point in this family that takes a SECOND input from OUTSIDE
// the archive and produces a COMPARISON, never a reconstruction of this
// replica's own state in isolation — so it is named for what it does. Its
// own pure counterpart still follows the family's established
// `describeXxx()` naming exactly (`describePublisherLeaderboardSnapshotVerification()`),
// because that half genuinely is a plain, archive-free description of two
// already-computed values, precisely like every other `describeXxx()` in
// this codebase.
//
// MALFORMED/ABSENT ARCHIVE IS TOLERATED, NEVER THROWN ON — THE IDENTICAL
// RESTRAINT EVERY `reconstructXxx()` IN THIS FAMILY ALREADY HOLDS. An
// invalid/missing `archive` degrades to `PublicationObservationArchive.empty()`
// exactly as `reconstructPublisherLeaderboardSnapshot()` already degrades
// it one layer down — this file performs no separate `instanceof` check or
// fallback of its own; there is nothing left for a second copy of that same
// tolerance to protect against here.
//
// SYNCHRONOUS, PURE, DETERMINISTIC, SELF-CONTAINED: NO CLOCK, NO NETWORK,
// NO MUTATION. `describePublisherLeaderboardSnapshotVerification()` reads
// no clock, no storage, and no network, and mutates neither snapshot handed
// to it. Calling it twice with equivalent arguments — even reached by two
// entirely independent code paths, even on two entirely independent
// replicas — returns a byte-identical result.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No signature, no public/
// private key, no cryptographic attribution of any kind — a signed claim
// naming WHO produced or endorses a reproducible snapshot is a genuinely
// different, separately sized later question (see `docs/Roadmap.md`).
// This file answers only whether a candidate CORRESPONDS to what this
// replica independently derives — never who is vouching for it. No
// "trusted"/"untrusted" vocabulary, no confidence score, no percentage
// match, no partial-credit notion of "mostly matches" — every one of the
// five result fields is a plain boolean, exactly true or exactly false. No
// automatic verification, publication, or synchronization of any kind, no
// peer discovery, no transport mechanism — a candidate snapshot arrives
// here already, by whatever means; this file never fetches, requests, or
// moves one. No persistence of a verification result — it is computed
// fresh, every time, from whatever archive and candidate are handed to it,
// exactly like every snapshot and fingerprint it composes.
export function describePublisherLeaderboardSnapshotVerification(localSnapshot, candidateSnapshot) {
    const normalizedLocal = normalizeSnapshot(localSnapshot);
    const normalizedCandidate = normalizeSnapshot(candidateSnapshot);

    const evidenceFingerprintMatches = normalizedLocal.evidenceFingerprint === normalizedCandidate.evidenceFingerprint;
    const policyVersionMatches = normalizedLocal.policy.version === normalizedCandidate.policy.version;
    const policyMatches = JSON.stringify(normalizedLocal.policy) === JSON.stringify(normalizedCandidate.policy);
    const leaderboardMatches = JSON.stringify(normalizedLocal.leaderboard) === JSON.stringify(normalizedCandidate.leaderboard);

    return Object.freeze({
        matches: evidenceFingerprintMatches && policyVersionMatches && policyMatches && leaderboardMatches,
        evidenceFingerprintMatches,
        policyVersionMatches,
        policyMatches,
        leaderboardMatches
    });
}

// verifyPublisherLeaderboardSnapshot() — the ONE, thin, archive-reading
// entry point. It pulls THIS replica's own current snapshot straight out of
// `reconstructPublisherLeaderboardSnapshot()` (0.8.119, UNCHANGED) and hands
// it, together with the externally supplied `candidateSnapshot` untouched,
// to the pure function above. See this file's own header, "Naming," for
// why this entry point is named `verifyXxx()` rather than `reconstructXxx()`.
export function verifyPublisherLeaderboardSnapshot(archive, candidateSnapshot) {
    const safeArchive = archive instanceof PublicationObservationArchive ? archive : PublicationObservationArchive.empty();
    const localSnapshot = reconstructPublisherLeaderboardSnapshot(safeArchive);
    return describePublisherLeaderboardSnapshotVerification(localSnapshot, candidateSnapshot);
}

// Routes any value through 0.8.119's own `describePublisherLeaderboardSnapshot()`
// tolerance — see this file's own header, "Normalization reuses 0.8.119's
// own tolerance." A genuine snapshot's own two meaningful fields pass
// through unchanged; anything malformed or absent degrades to the exact
// same well-defined empty snapshot 0.8.119 already defines.
function normalizeSnapshot(snapshot) {
    const source = (snapshot && typeof snapshot === 'object') ? snapshot : {};
    return describePublisherLeaderboardSnapshot(source.evidenceFingerprint, source.leaderboard);
}
