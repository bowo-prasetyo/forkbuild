import { describePublisherLeaderboardSnapshot } from './PublisherLeaderboardSnapshot.js';

// 0.8.134 — Historical Snapshot Difference Projection.
//
// 0.8.119 proved a leaderboard CONCLUSION could be identified and
// reproduced. 0.8.120 proved a CANDIDATE conclusion could be compared
// against this replica's own current one. 0.8.133 proved one SIGNER's own
// successive claims could be sequenced. None of them ever answered the
// question that sequence naturally raises the moment two claims — or two
// snapshots from anywhere at all, signed or not — sit side by side:
//
//   Snapshot A                                Snapshot B
//     { evidenceFingerprint, policy, leaderboard }
//              │                                       │
//              │   describePublisherLeaderboardSnapshotDifference()
//              ▼                                       ▼
//   { evidenceFingerprintChanged, policyVersionChanged, policyChanged,
//     leaderboardChanged, publisherPresentInBoth, publisherSourceOnly,
//     publisherTargetOnly, ... }
//
// This file is that comparison — the historical counterpart to 0.8.120's
// CURRENT-state verification. 0.8.120 asks "does a candidate match what
// THIS REPLICA computes RIGHT NOW?" This file asks a narrower, purely
// descriptive question about two ARTIFACTS, neither of which is
// privileged as "this replica's own": "which observable parts of these
// two already-computed snapshots are equal or different?"
//
// FOUR INDEPENDENT DIMENSIONS, NEVER COLLAPSED INTO ONE EXPLANATION — THE
// ARCHITECTURAL PRINCIPLE THIS FILE EXISTS TO HOLD. A result names FOUR
// change facts, each independently computed from its own slice of the two
// snapshots, exactly mirroring 0.8.120's own four independent MATCH
// facts, negated into CHANGE facts:
//
//   evidenceFingerprintChanged   — source.evidenceFingerprint !== target's
//   policyVersionChanged         — source.policy.version !== target's
//   policyChanged                — the two COMPLETE policy objects differ
//   leaderboardChanged           — the two COMPLETE leaderboards differ
//
// None of the four is derived from another. `leaderboardChanged` is never
// computed as "policy changed, so assume the leaderboard did too," and
// `policyChanged` is never inferred from `policyVersionChanged` alone — a
// policy could in principle share a version number while `criteria` or
// `tieBreak` genuinely differs, and this field is computed independently
// so that mistake would show up here rather than being masked. A result
// carrying `evidenceFingerprintChanged: false` and `leaderboardChanged:
// true` is not a contradiction this file resolves — it is the honest
// observation that the leaderboard changed for a reason OTHER than the
// evidence, and only `policyVersionChanged`/`policyChanged` sitting beside
// it can say why. This file never guesses; it reports all four, always.
//
// SEMANTIC IDENTITY, NEVER CRYPTOGRAPHIC IDENTITY — THIS FILE NEVER READS
// OR COMPUTES A `snapshotFingerprint`. 0.8.121's own
// `PublisherLeaderboardSnapshotFingerprint.js` answers a genuinely
// different question — "what EXACT BYTES did a signer attest to?" — a
// single composite digest deliberately opaque to WHICH of a snapshot's
// three fields changed. This file answers the opposite kind of question —
// WHICH of a snapshot's own already-named parts changed — and it answers
// that exclusively over 0.8.119's own three semantic fields
// (`evidenceFingerprint`, `policy`, `leaderboard`), never by comparing, or
// even importing, a composite snapshot fingerprint. Two snapshots can
// differ in `snapshotFingerprint` while this file reports every one of its
// four change facts `false` (a re-serialization carrying byte-identical
// semantic content), and this file is silent about that — it was never
// asked the cryptographic-identity question in the first place.
//
// A DIFFERENT LEADERBOARD NEVER IMPLIES DIFFERENT EVIDENCE — THE ONE
// ASSUMPTION THIS FILE MUST NEVER MAKE, NOW THAT POLICY IS PART OF A
// SNAPSHOT. Two snapshots sharing the identical `evidenceFingerprint` can
// still report `leaderboardChanged: true`, whenever `policy` differs
// between them — a different ranking policy applied to IDENTICAL evidence
// genuinely produces a different leaderboard (0.8.113's own "Leaderboard
// projection purity," one layer up: a leaderboard is a deterministic
// function of evidence AND policy, never evidence alone). See this file's
// own test, "Policy-only change" — `evidenceFingerprintChanged: false`,
// `policyVersionChanged: true`, `policyChanged: true`,
// `leaderboardChanged: true`, all four reported independently, with
// nothing in this file's own logic ever short-circuiting on the first
// `false` it sees.
//
// ENTRY IDENTITY IS PUBLISHER IDENTITY, NEVER LEADERBOARD POSITION — A
// PUBLISHER CHANGING RANK IS NOT A DIFFERENT PUBLISHER. `publisherPresentInBoth`/
// `publisherSourceOnly`/`publisherTargetOnly` match entries by
// `publisherIdentity.publisherId` (0.8.108's own exact, case-sensitive
// equality — the identical rule `PublisherIdentityRecord.sameAs()` already
// holds), never by array index, never by `rank`, and never by the full
// entry's own serialized content. A publisher present in both leaderboards
// under a different `rank` is one matched entry reporting `rankChanged:
// true`, never one departed publisher and one newly-arrived stranger who
// happen to share a name.
//
// EACH MATCHED ENTRY NAMES EXACTLY WHICH FIELDS CHANGED — NEVER A SINGLE
// COLLAPSED "ENTRY DIFFERS" BOOLEAN. A `publisherPresentInBoth` element
// carries `{ publisherIdentity, sourceEntry, targetEntry, rankChanged,
// achievementCountChanged, distinctAchievementKindCountChanged,
// publicationIdentityCountChanged }` — four independent booleans, one per
// field 0.8.113's own leaderboard entry carries beyond `publisherIdentity`
// itself, each compared with `!==` against its own counterpart alone.
// `sourceEntry`/`targetEntry` are 0.8.113's own ORIGINAL leaderboard entry
// objects, echoed by reference — never a reconstructed copy, never a
// partial projection — mirroring 0.8.127's own "each result element is the
// original... instance" restraint, one layer up. A caller who wants the
// raw before/after values for a changed field already has them, on the two
// entries themselves, without this file inventing a fifth, redundant pair
// of "old value"/"new value" fields for each one.
//
// NEVER A SECOND RANKING ENGINE — THIS FILE COMPARES THE SUPPLIED
// LEADERBOARDS; IT NEVER RECOMPUTES ONE. Grep this file and there is no
// `sort()` call, no comparator, no criteria array, and no tie-break logic
// anywhere in it. `rankChanged` is a plain `!==` over two already-assigned
// `rank` values 0.8.112/0.8.113 already computed — this file never asks
// WHETHER a rank change was "correct" under either snapshot's own policy,
// and never re-derives what a merged or reconciled ranking would look
// like. There is no such thing as a "combined" leaderboard here — only two
// separate, already-computed leaderboards, observed side by side.
//
// SOURCE/TARGET ARE POSITIONAL LABELS, NEVER A JUDGMENT OF WHICH IS
// CORRECT, NEWER, OR AUTHORITATIVE. Exactly like 0.8.117's own
// `sourceOnly`/`targetOnly` and 0.8.127's own claim-history difference,
// "source" and "target" name which argument a caller passed first and
// second — nothing about ordering, recency, or trust. This file never
// reads a clock, never compares `createdAt` values, and never assumes
// `targetSnapshot` is "newer" than `sourceSnapshot` merely because it was
// passed second.
//
// NORMALIZATION REUSES 0.8.119'S OWN TOLERANCE — NEVER A SECOND, PARALLEL
// SET OF FALLBACK RULES. Exactly like 0.8.120's own `normalizeSnapshot()`,
// both `sourceSnapshot` and `targetSnapshot` are routed through
// `describePublisherLeaderboardSnapshot()` (0.8.119, UNCHANGED) before
// comparison — the EXACT SAME function, and therefore the EXACT SAME
// fallback, that already degrades a non-genuine `evidenceFingerprint` to
// the canonical empty-evidence fingerprint and a non-genuine leaderboard to
// `describePublisherLeaderboard(undefined)`. A well-formed snapshot passes
// through unchanged; anything missing, `null`, or shaped like garbage
// normalizes to the identical well-defined empty snapshot 0.8.119 already
// defines — never a thrown error, never a second definition of "empty."
//
// NO RECONSTRUCTION ENTRY POINT — DELIBERATELY, NOT AN OVERSIGHT. Every
// other file in this family pairs a pure `describeXxx()` with a thin,
// archive-reading `reconstructXxx()` that pulls THIS replica's own CURRENT
// state. This file has no such counterpart, for the identical reason
// 0.8.121's own `PublisherLeaderboardSnapshotFingerprint.js` has none: both
// of this file's inputs are already-computed, historical ARTIFACTS — two
// specific snapshots a caller already holds, from wherever they came
// (a stored claim, an export, an earlier reconstruction kept on purpose) —
// never something this file should silently replace with "whatever this
// replica's archive currently produces." A `reconstructPublisherLeaderboardSnapshotDifference(archive,
// sourceSnapshot)` that quietly substituted the archive's own CURRENT
// snapshot for `targetSnapshot` would blur this file into 0.8.120's own,
// already-built job — "compare a candidate against what this replica
// currently computes" — under a different name, while silently discarding
// the caller's own historical `targetSnapshot` the moment one was supplied.
// A caller who genuinely wants that comparison already has it, unchanged,
// at `verifyPublisherLeaderboardSnapshot()` (0.8.120). This file stays a
// comparison between two artifacts NAMED by the caller, full stop; a
// convenience wrapper that reconstructs one side from an archive, if one is
// ever genuinely needed, is separate, later work that would say so
// explicitly rather than being folded into this pure function's own name.
//
// SYNCHRONOUS, PURE, DETERMINISTIC, SELF-CONTAINED: NO CLOCK, NO STORAGE,
// NO NETWORK, NO MUTATION. `describePublisherLeaderboardSnapshotDifference()`
// reads no clock and mutates neither snapshot handed to it. Calling it
// twice with equivalent arguments — even reached by two entirely
// independent code paths — returns a byte-identical result.
//
// ARCHITECTURAL BOUNDARY: OBSERVABLE FACTS ABOUT TWO ARTIFACTS, NEVER A
// VERIFICATION, TRUST, OR RANKING DETERMINATION OF ANY KIND. This file
// imports nothing from `application/PublisherLeaderboardSnapshotVerification.js`,
// `application/PublisherLeaderboardSnapshotClaimVerification.js`,
// `application/PublisherLeaderboardClaimVerificationView.js`, or
// `application/PublisherLeaderboardClaimVerificationHistoryView.js`
// (0.8.120/0.8.124/0.8.125) — grep it and none of that vocabulary appears.
// It never determines which snapshot is correct, never verifies a
// signature, never compares claims, never determines whether a signer was
// truthful, never says a publisher "improved" or "regressed," never
// assigns a delta as positive or negative, never recomputes a rank, and
// never persists or modifies anything. It answers exactly one question:
// which observable parts of two snapshot artifacts are equal or different.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **No `reconstructXxx()` archive-reading entry point.** See "No
//   reconstruction entry point," above.
// - **No improvement/regression/quality judgment of any kind, and no
//   `improved`/`regressed`/`better`/`worse` field anywhere.** A `rankChanged:
//   true` is reported and nothing is concluded from it — see "Never a
//   second ranking engine," above.
// - **No verification, trust, or "which snapshot is currently valid"
//   determination of any kind.** See "Architectural boundary," above.
// - **No merge, reconciliation, or "combined leaderboard" of any kind.**
//   Two snapshots are compared, side by side; neither is ever folded into
//   the other.
// - **A historical claim-to-snapshot relationship projection** — "which
//   signers claimed the same snapshot," "what snapshot sequence did each
//   signer claim" — composing 0.8.132's/0.8.133's own claim-relationship
//   vocabulary with this file's own snapshot comparison. Genuinely
//   separate, later work (0.8.135).
// - **Automatic, periodic, or background computation of any kind.** This
//   function runs only when a caller explicitly calls it.
export function describePublisherLeaderboardSnapshotDifference(sourceSnapshot, targetSnapshot) {
    const source = normalizeSnapshot(sourceSnapshot);
    const target = normalizeSnapshot(targetSnapshot);

    const evidenceFingerprintChanged = source.evidenceFingerprint !== target.evidenceFingerprint;
    const policyVersionChanged = source.policy.version !== target.policy.version;
    const policyChanged = JSON.stringify(source.policy) !== JSON.stringify(target.policy);
    const leaderboardChanged = JSON.stringify(source.leaderboard) !== JSON.stringify(target.leaderboard);

    const { publisherPresentInBoth, publisherSourceOnly, publisherTargetOnly } =
        diffLeaderboardEntries(source.leaderboard.entries, target.leaderboard.entries);

    return Object.freeze({
        evidenceFingerprintChanged,
        policyVersionChanged,
        policyChanged,
        leaderboardChanged,

        sourceEvidenceFingerprint: source.evidenceFingerprint,
        targetEvidenceFingerprint: target.evidenceFingerprint,

        sourcePolicyVersion: source.policy.version,
        targetPolicyVersion: target.policy.version,

        sourceLeaderboardEntryCount: source.leaderboard.entryCount,
        targetLeaderboardEntryCount: target.leaderboard.entryCount,

        sourceLeaderboard: source.leaderboard,
        targetLeaderboard: target.leaderboard,

        publisherPresentInBothCount: publisherPresentInBoth.length,
        publisherSourceOnlyCount: publisherSourceOnly.length,
        publisherTargetOnlyCount: publisherTargetOnly.length,

        publisherPresentInBoth: Object.freeze(publisherPresentInBoth),
        publisherSourceOnly: Object.freeze(publisherSourceOnly),
        publisherTargetOnly: Object.freeze(publisherTargetOnly)
    });
}

// Routes any value through 0.8.119's own `describePublisherLeaderboardSnapshot()`
// tolerance — see this file's own header, "Normalization reuses 0.8.119's
// own tolerance."
function normalizeSnapshot(snapshot) {
    const source = (snapshot && typeof snapshot === 'object') ? snapshot : {};
    return describePublisherLeaderboardSnapshot(source.evidenceFingerprint, source.leaderboard);
}

// The one entry-level comparison this file performs — keyed by
// `publisherIdentity.publisherId` (0.8.108's own exact, case-sensitive
// equality), never by array index or rank. See this file's own header,
// "Entry identity is publisher identity, never leaderboard position," and
// "Each matched entry names exactly which fields changed." Returns entries
// in each side's own original leaderboard order — `publisherPresentInBoth`/
// `publisherSourceOnly` in `sourceEntries`' own order, `publisherTargetOnly`
// in `targetEntries`' own order — never sorted or renumbered.
function diffLeaderboardEntries(sourceEntries, targetEntries) {
    const genuineSourceEntries = sourceEntries.filter(hasGenuinePublisherId);
    const genuineTargetEntries = targetEntries.filter(hasGenuinePublisherId);

    const targetByPublisherId = new Map();
    for (const entry of genuineTargetEntries) {
        targetByPublisherId.set(entry.publisherIdentity.publisherId, entry);
    }

    const matchedPublisherIds = new Set();
    const publisherPresentInBoth = [];
    const publisherSourceOnly = [];

    for (const sourceEntry of genuineSourceEntries) {
        const publisherId = sourceEntry.publisherIdentity.publisherId;
        const targetEntry = targetByPublisherId.get(publisherId);
        if (targetEntry) {
            matchedPublisherIds.add(publisherId);
            publisherPresentInBoth.push(Object.freeze({
                publisherIdentity: sourceEntry.publisherIdentity,
                sourceEntry,
                targetEntry,
                rankChanged: sourceEntry.rank !== targetEntry.rank,
                achievementCountChanged: sourceEntry.achievementCount !== targetEntry.achievementCount,
                distinctAchievementKindCountChanged: sourceEntry.distinctAchievementKindCount !== targetEntry.distinctAchievementKindCount,
                publicationIdentityCountChanged: sourceEntry.publicationIdentityCount !== targetEntry.publicationIdentityCount
            }));
        } else {
            publisherSourceOnly.push(sourceEntry);
        }
    }

    const publisherTargetOnly = genuineTargetEntries.filter(
        (entry) => !matchedPublisherIds.has(entry.publisherIdentity.publisherId)
    );

    return { publisherPresentInBoth, publisherSourceOnly, publisherTargetOnly };
}

// A malformed leaderboard entry — one whose `publisherIdentity` is not a
// genuine, non-empty-`publisherId`-carrying object — is silently excluded
// from every one of this file's three membership buckets, never thrown
// on and never matched by coincidence (e.g. two malformed entries both
// missing a `publisherId` are never treated as "the same publisher").
// Mirrors `PublisherLeaderboardView.js`'s own "a malformed... entry is
// silently excluded, never reordered, never renumbered, never thrown on."
function hasGenuinePublisherId(entry) {
    return Boolean(entry)
        && typeof entry === 'object'
        && Boolean(entry.publisherIdentity)
        && typeof entry.publisherIdentity === 'object'
        && typeof entry.publisherIdentity.publisherId === 'string'
        && entry.publisherIdentity.publisherId.length > 0;
}
