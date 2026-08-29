import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { describePublisherLeaderboardSnapshot } from '../application/PublisherLeaderboardSnapshot.js';
import * as PublisherLeaderboardSnapshotDifferenceModule from '../application/PublisherLeaderboardSnapshotDifference.js';
import { describePublisherLeaderboardSnapshotDifference } from '../application/PublisherLeaderboardSnapshotDifference.js';

// 0.8.134 — Historical Snapshot Difference Projection.
//
// Section A: two empty snapshots report every change fact false and no
//            membership entries
// Section B: semantic vs. cryptographic identity — same evidence,
//            genuinely different policy: evidenceFingerprintChanged false,
//            policyVersionChanged/policyChanged/leaderboardChanged true
// Section C: policy-only change — the identical evidence, a different
//            policy AND leaderboard: evidenceFingerprintChanged false,
//            everything else true
// Section D: FLAGSHIP — different evidence, identical policy: Alice's rank
//            is unchanged, Bob's rank changed, Carol is newly present
// Section E: each of the four top-level facts is independently computed —
//            never derived from another by shortcut
// Section F: per-entry field changes are independent of each other and of
//            rankChanged
// Section G: membership — publisherSourceOnly / publisherTargetOnly /
//            publisherPresentInBoth, with counts
// Section H: entry identity is publisherId, never leaderboard position —
//            a publisher appearing at a different array index/rank is
//            still matched, never treated as departed + arrived
// Section I: ordering — presentInBoth/sourceOnly follow source order,
//            targetOnly follows target order; never sorted
// Section J: sourceEntry/targetEntry are the ORIGINAL leaderboard entry
//            objects, echoed by reference, never reconstructed copies
// Section K: never a second ranking engine — rank/counts are read, never
//            recomputed; no sort() anywhere in this file's own source
// Section L: normalization tolerance — malformed/absent snapshots on
//            either or both sides never throw
// Section M: malformed leaderboard entries are silently excluded, never
//            thrown on, never coincidentally matched
// Section N: no mutation of either input snapshot; every result is frozen
// Section O: determinism — repeated calls over identical inputs agree
// Section P: source/target are positional labels only
// Section Q: no reconstruction entry point, and no `snapshotFingerprint`
//            vocabulary anywhere in this file
// Section R: vocabulary boundary — no verification/trust/evaluative terms

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
}

function identity(publisherId) {
    return new PublisherIdentityRecord({ publisherId });
}

function makePolicy(version, tieBreakOrder = 'ASCENDING') {
    return Object.freeze({
        version,
        criteria: Object.freeze([Object.freeze({ field: 'achievementCount', order: 'DESCENDING' })]),
        tieBreak: Object.freeze({ field: 'publisherIdentity.publisherId', order: tieBreakOrder })
    });
}

function makeEntry(rank, publisherIdentity, achievementCount, distinctAchievementKindCount, publicationIdentityCount) {
    return Object.freeze({ rank, publisherIdentity, achievementCount, distinctAchievementKindCount, publicationIdentityCount });
}

function makeLeaderboard(policy, entries) {
    return Object.freeze({ policy, entryCount: entries.length, entries: Object.freeze(entries) });
}

function snapshotOf(fingerprint, leaderboard) {
    return describePublisherLeaderboardSnapshot(fingerprint, leaderboard);
}

const E1 = '1'.repeat(64);
const E2 = '2'.repeat(64);

function entryFor(difference, bucket, publisherId) {
    return difference[bucket].find((e) => {
        const identityRecord = e.publisherIdentity || e;
        return identityRecord && identityRecord.publisherId === publisherId;
    });
}

function run() {
    // ---------------------------------------------------------------
    // Section A — two empty snapshots.
    // ---------------------------------------------------------------
    {
        const difference = describePublisherLeaderboardSnapshotDifference(undefined, undefined);
        assert(difference.evidenceFingerprintChanged === false, '1. two empty snapshots share the identical canonical empty-evidence fingerprint');
        assert(difference.policyVersionChanged === false, '2. two empty snapshots share the identical default policy version');
        assert(difference.policyChanged === false, '3. two empty snapshots share the identical default policy definition');
        assert(difference.leaderboardChanged === false, '4. two empty snapshots share the identical empty leaderboard');
        assert(difference.publisherPresentInBothCount === 0, '5. no entries to match');
        assert(difference.publisherSourceOnlyCount === 0, '6. no source-only entries');
        assert(difference.publisherTargetOnlyCount === 0, '7. no target-only entries');
        assert(difference.sourceLeaderboardEntryCount === 0, '8. sourceLeaderboardEntryCount is zero');
        assert(difference.targetLeaderboardEntryCount === 0, '9. targetLeaderboardEntryCount is zero');
    }
    console.log('✓ Section A: two empty snapshots report every change fact false and no membership entries');

    // ---------------------------------------------------------------
    // Section B — semantic vs. cryptographic identity: same evidence,
    // genuinely different policy.
    // ---------------------------------------------------------------
    {
        const alice = identity('Alice');
        const policy1 = makePolicy(1, 'ASCENDING');
        const policy2 = makePolicy(2, 'DESCENDING');

        const leaderboardL1 = makeLeaderboard(policy1, [makeEntry(1, alice, 5, 2, 1)]);
        const leaderboardL2 = makeLeaderboard(policy2, [makeEntry(1, alice, 5, 2, 1)]);

        const snapshotA = snapshotOf(E1, leaderboardL1);
        const snapshotB = snapshotOf(E1, leaderboardL2);

        const difference = describePublisherLeaderboardSnapshotDifference(snapshotA, snapshotB);
        assert(difference.evidenceFingerprintChanged === false, '10. the identical evidence fingerprint compares unchanged');
        assert(difference.policyVersionChanged === true, '11. two different policy versions report changed');
        assert(difference.policyChanged === true, '12. two different policy definitions report changed');
        assert(difference.leaderboardChanged === true, '13. the leaderboard reports changed — it embeds the changed policy, even with byte-identical entries');
        assert(difference.sourceEvidenceFingerprint === E1 && difference.targetEvidenceFingerprint === E1, '14. both evidence fingerprints are reported, and are equal');
        assert(difference.sourcePolicyVersion === 1 && difference.targetPolicyVersion === 2, '15. both policy versions are reported distinctly');

        // "Different leaderboard" never implies "different evidence" — the
        // one assumption this file must never make.
        assert(!(difference.leaderboardChanged && difference.evidenceFingerprintChanged), '16. a changed leaderboard never implies changed evidence — this file draws no such inference');
    }
    console.log('✓ Section B: same evidence, genuinely different policy — evidenceFingerprintChanged stays false while policyVersionChanged/policyChanged/leaderboardChanged all report true');

    // ---------------------------------------------------------------
    // Section C — policy-only change: the identical evidence, a
    // different policy AND a different leaderboard.
    // ---------------------------------------------------------------
    {
        const alice = identity('Alice');
        const bob = identity('Bob');
        const policy1 = makePolicy(1);
        const policy2 = makePolicy(2);

        const leaderboardL1 = makeLeaderboard(policy1, [makeEntry(1, alice, 5, 2, 1), makeEntry(2, bob, 3, 1, 1)]);
        const leaderboardL2 = makeLeaderboard(policy2, [makeEntry(1, bob, 3, 1, 1), makeEntry(2, alice, 5, 2, 1)]);

        const snapshotA = snapshotOf(E1, leaderboardL1);
        const snapshotB = snapshotOf(E1, leaderboardL2);

        const difference = describePublisherLeaderboardSnapshotDifference(snapshotA, snapshotB);
        assert(difference.evidenceFingerprintChanged === false, '17. the underlying evidence never changed');
        assert(difference.policyVersionChanged === true, '18. the policy version changed');
        assert(difference.policyChanged === true, '19. the policy definition changed');
        assert(difference.leaderboardChanged === true, '20. the leaderboard changed — a leaderboard can change even when evidence does not, once policy is applied differently');
    }
    console.log('✓ Section C: a leaderboard can genuinely change even when the underlying evidence does not — a policy-only change is sufficient');

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP: different evidence, identical policy. Alice
    // keeps her rank, Bob's rank changes, Carol is newly present.
    // ---------------------------------------------------------------
    {
        const alice = identity('Alice');
        const bob = identity('Bob');
        const carol = identity('Carol');
        const policy = makePolicy(1);

        const sourceLeaderboard = makeLeaderboard(policy, [
            makeEntry(1, alice, 5, 2, 1),
            makeEntry(2, bob, 3, 1, 1)
        ]);
        const targetLeaderboard = makeLeaderboard(policy, [
            makeEntry(1, alice, 5, 2, 1),
            makeEntry(2, carol, 4, 2, 1),
            makeEntry(3, bob, 3, 1, 1)
        ]);

        const sourceSnapshot = snapshotOf(E1, sourceLeaderboard);
        const targetSnapshot = snapshotOf(E2, targetLeaderboard);

        const difference = describePublisherLeaderboardSnapshotDifference(sourceSnapshot, targetSnapshot);

        assert(difference.evidenceFingerprintChanged === true, '21. FLAGSHIP — evidence genuinely changed');
        assert(difference.policyVersionChanged === false, '22. FLAGSHIP — the policy version is unchanged');
        assert(difference.policyChanged === false, '23. FLAGSHIP — the policy definition is unchanged');
        assert(difference.leaderboardChanged === true, '24. FLAGSHIP — the leaderboard genuinely changed');

        assert(difference.publisherPresentInBothCount === 2, '25. FLAGSHIP — Alice and Bob are present in both leaderboards');
        assert(difference.publisherSourceOnlyCount === 0, '26. FLAGSHIP — nobody departed');
        assert(difference.publisherTargetOnlyCount === 1, '27. FLAGSHIP — exactly Carol is newly present');
        assert(difference.publisherTargetOnly[0].publisherIdentity.publisherId === 'Carol', '28. FLAGSHIP — Carol is named as the newly-present publisher');

        const aliceDiff = entryFor(difference, 'publisherPresentInBoth', 'Alice');
        assert(aliceDiff.rankChanged === false, '29. FLAGSHIP — Alice\'s rank is unchanged');
        assert(aliceDiff.achievementCountChanged === false, '30. FLAGSHIP — Alice\'s achievementCount is unchanged');
        assert(aliceDiff.distinctAchievementKindCountChanged === false, '31. FLAGSHIP — Alice\'s distinctAchievementKindCount is unchanged');
        assert(aliceDiff.publicationIdentityCountChanged === false, '32. FLAGSHIP — Alice\'s publicationIdentityCount is unchanged');

        const bobDiff = entryFor(difference, 'publisherPresentInBoth', 'Bob');
        assert(bobDiff.rankChanged === true, '33. FLAGSHIP — Bob\'s rank changed (2 -> 3)');
        assert(bobDiff.achievementCountChanged === false, '34. FLAGSHIP — Bob\'s achievementCount is otherwise unchanged');
        assert(bobDiff.sourceEntry.rank === 2 && bobDiff.targetEntry.rank === 3, '35. FLAGSHIP — Bob\'s before/after rank values are both readable, unsummarized');

        // No conclusion is drawn about WHY Bob's rank changed — no such
        // field exists on the result.
        assert(!('reason' in bobDiff) && !('cause' in bobDiff), '36. FLAGSHIP — no explanation field exists for why a rank changed');
    }
    console.log('✓ Section D: FLAGSHIP — different evidence, identical policy: Alice\'s rank is unchanged, Bob\'s rank changed, and Carol is reported as newly present, with no conclusion drawn about why');

    // ---------------------------------------------------------------
    // Section E — the four top-level facts are independently computed.
    // ---------------------------------------------------------------
    {
        // Identical evidence and policy, but a leaderboard entry's own
        // achievementCount differs — leaderboardChanged is true while
        // evidenceFingerprintChanged/policyVersionChanged/policyChanged
        // all stay false.
        const alice = identity('Alice');
        const policy = makePolicy(1);
        const sourceLeaderboard = makeLeaderboard(policy, [makeEntry(1, alice, 5, 2, 1)]);
        const targetLeaderboard = makeLeaderboard(policy, [makeEntry(1, alice, 9, 2, 1)]);

        const difference = describePublisherLeaderboardSnapshotDifference(
            snapshotOf(E1, sourceLeaderboard),
            snapshotOf(E1, targetLeaderboard)
        );
        assert(difference.evidenceFingerprintChanged === false, '37. evidence unchanged');
        assert(difference.policyVersionChanged === false, '38. policy version unchanged');
        assert(difference.policyChanged === false, '39. policy definition unchanged');
        assert(difference.leaderboardChanged === true, '40. the leaderboard itself changed — computed independently, not inferred from the other three');
    }
    console.log('✓ Section E: leaderboardChanged is computed independently — true even when evidence, policy version, and policy definition all report unchanged');

    // ---------------------------------------------------------------
    // Section F — per-entry field changes are independent.
    // ---------------------------------------------------------------
    {
        const alice = identity('Alice');
        const policy = makePolicy(1);
        const sourceLeaderboard = makeLeaderboard(policy, [makeEntry(1, alice, 5, 2, 1)]);
        const targetLeaderboard = makeLeaderboard(policy, [makeEntry(1, alice, 5, 3, 4)]);

        const difference = describePublisherLeaderboardSnapshotDifference(
            snapshotOf(E1, sourceLeaderboard),
            snapshotOf(E1, targetLeaderboard)
        );
        const aliceDiff = entryFor(difference, 'publisherPresentInBoth', 'Alice');
        assert(aliceDiff.rankChanged === false, '41. rank alone unchanged');
        assert(aliceDiff.achievementCountChanged === false, '42. achievementCount alone unchanged');
        assert(aliceDiff.distinctAchievementKindCountChanged === true, '43. distinctAchievementKindCount changed');
        assert(aliceDiff.publicationIdentityCountChanged === true, '44. publicationIdentityCount changed, independently of distinctAchievementKindCount');
    }
    console.log('✓ Section F: each of the four per-entry field-change facts is computed independently of the other three');

    // ---------------------------------------------------------------
    // Section G — membership counts.
    // ---------------------------------------------------------------
    {
        const alice = identity('Alice');
        const bob = identity('Bob');
        const carol = identity('Carol');
        const policy = makePolicy(1);

        const sourceLeaderboard = makeLeaderboard(policy, [makeEntry(1, alice, 5, 2, 1), makeEntry(2, bob, 3, 1, 1)]);
        const targetLeaderboard = makeLeaderboard(policy, [makeEntry(1, alice, 5, 2, 1), makeEntry(2, carol, 2, 1, 1)]);

        const difference = describePublisherLeaderboardSnapshotDifference(
            snapshotOf(E1, sourceLeaderboard),
            snapshotOf(E1, targetLeaderboard)
        );
        assert(difference.publisherPresentInBothCount === 1, '45. Alice alone is present in both');
        assert(difference.publisherSourceOnlyCount === 1, '46. Bob departed — source-only');
        assert(difference.publisherTargetOnlyCount === 1, '47. Carol arrived — target-only');
        assert(difference.publisherSourceOnly[0].publisherIdentity.publisherId === 'Bob', '48. Bob is named on publisherSourceOnly');
        assert(difference.publisherTargetOnly[0].publisherIdentity.publisherId === 'Carol', '49. Carol is named on publisherTargetOnly');
        assert(difference.publisherSourceOnly.length === difference.publisherSourceOnlyCount, '50. publisherSourceOnlyCount matches the array length');
        assert(difference.publisherTargetOnly.length === difference.publisherTargetOnlyCount, '51. publisherTargetOnlyCount matches the array length');
        assert(difference.publisherPresentInBoth.length === difference.publisherPresentInBothCount, '52. publisherPresentInBothCount matches the array length');
    }
    console.log('✓ Section G: publisherSourceOnly/publisherTargetOnly/publisherPresentInBoth report exactly who departed, who arrived, and who remained, with matching counts');

    // ---------------------------------------------------------------
    // Section H — entry identity is publisherId, never leaderboard
    // position.
    // ---------------------------------------------------------------
    {
        const alice = identity('Alice');
        const bob = identity('Bob');
        const policy = makePolicy(1);

        // Bob is rank 1 in the source and rank 2 in the target — a
        // completely different array position AND rank — yet remains one
        // matched publisher, never a departed-Bob-plus-arrived-stranger.
        const sourceLeaderboard = makeLeaderboard(policy, [makeEntry(1, bob, 5, 2, 1), makeEntry(2, alice, 3, 1, 1)]);
        const targetLeaderboard = makeLeaderboard(policy, [makeEntry(1, alice, 3, 1, 1), makeEntry(2, bob, 5, 2, 1)]);

        const difference = describePublisherLeaderboardSnapshotDifference(
            snapshotOf(E1, sourceLeaderboard),
            snapshotOf(E1, targetLeaderboard)
        );
        assert(difference.publisherPresentInBothCount === 2, '53. both publishers are matched despite moving position');
        assert(difference.publisherSourceOnlyCount === 0 && difference.publisherTargetOnlyCount === 0, '54. neither publisher is ever reported as departed or arrived');
        const bobDiff = entryFor(difference, 'publisherPresentInBoth', 'Bob');
        assert(bobDiff.rankChanged === true, '55. Bob\'s own rank change is reported precisely, on the matched entry');
    }
    console.log('✓ Section H: a publisher who moves rank and array position is matched by identity, never mistaken for a departed publisher plus an unrelated arrival');

    // ---------------------------------------------------------------
    // Section I — ordering.
    // ---------------------------------------------------------------
    {
        const alice = identity('Alice');
        const bob = identity('Bob');
        const carol = identity('Carol');
        const dave = identity('Dave');
        const policy = makePolicy(1);

        // Deliberately non-alphabetical, non-rank-monotonic construction
        // order, to prove this file performs no sort of its own.
        const sourceLeaderboard = makeLeaderboard(policy, [
            makeEntry(3, carol, 1, 1, 1),
            makeEntry(1, alice, 5, 2, 1),
            makeEntry(2, bob, 3, 1, 1)
        ]);
        const targetLeaderboard = makeLeaderboard(policy, [
            makeEntry(2, bob, 3, 1, 1),
            makeEntry(1, dave, 9, 3, 2),
            makeEntry(3, alice, 5, 2, 1)
        ]);

        const difference = describePublisherLeaderboardSnapshotDifference(
            snapshotOf(E1, sourceLeaderboard),
            snapshotOf(E1, targetLeaderboard)
        );

        // publisherPresentInBoth/publisherSourceOnly follow SOURCE order:
        // Carol (source-only, first), Alice (matched, second), Bob
        // (matched, third).
        assert(serialize(difference.publisherSourceOnly.map((e) => e.publisherIdentity.publisherId)) === serialize(['Carol']), '56. publisherSourceOnly holds exactly Carol');
        assert(serialize(difference.publisherPresentInBoth.map((e) => e.publisherIdentity.publisherId)) === serialize(['Alice', 'Bob']), '57. publisherPresentInBoth follows source order (Alice before Bob), never sorted');

        // publisherTargetOnly follows TARGET order: Dave.
        assert(serialize(difference.publisherTargetOnly.map((e) => e.publisherIdentity.publisherId)) === serialize(['Dave']), '58. publisherTargetOnly holds exactly Dave, in target order');
    }
    console.log('✓ Section I: publisherPresentInBoth/publisherSourceOnly follow the source leaderboard\'s own order and publisherTargetOnly follows the target\'s own order — never sorted');

    // ---------------------------------------------------------------
    // Section J — sourceEntry/targetEntry are original references.
    // ---------------------------------------------------------------
    {
        const alice = identity('Alice');
        const policy = makePolicy(1);
        const sourceEntryOriginal = makeEntry(1, alice, 5, 2, 1);
        const targetEntryOriginal = makeEntry(1, alice, 9, 2, 1);
        const sourceLeaderboard = makeLeaderboard(policy, [sourceEntryOriginal]);
        const targetLeaderboard = makeLeaderboard(policy, [targetEntryOriginal]);

        const difference = describePublisherLeaderboardSnapshotDifference(
            snapshotOf(E1, sourceLeaderboard),
            snapshotOf(E1, targetLeaderboard)
        );
        const aliceDiff = entryFor(difference, 'publisherPresentInBoth', 'Alice');
        assert(aliceDiff.sourceEntry === sourceEntryOriginal, '59. sourceEntry is the ORIGINAL entry instance, by reference');
        assert(aliceDiff.targetEntry === targetEntryOriginal, '60. targetEntry is the ORIGINAL entry instance, by reference');
        assert(aliceDiff.publisherIdentity === sourceEntryOriginal.publisherIdentity, '61. publisherIdentity is the ORIGINAL PublisherIdentityRecord, by reference');
    }
    console.log('✓ Section J: sourceEntry/targetEntry/publisherIdentity are the original leaderboard entry objects, echoed by reference, never reconstructed copies');

    // ---------------------------------------------------------------
    // Section K — never a second ranking engine.
    // ---------------------------------------------------------------
    {
        const moduleSource = describePublisherLeaderboardSnapshotDifference.toString();
        assert(!moduleSource.includes('.sort('), '62. the pure function\'s own source performs no sort() call');
        assert(!/\bcompar(e|ator)\b/i.test(moduleSource), '63. the pure function\'s own source defines no comparator');
    }
    console.log('✓ Section K: this file never sorts, compares, or recomputes a rank — it reads and reports the ranks the two supplied leaderboards already carry');

    // ---------------------------------------------------------------
    // Section L — normalization tolerance.
    // ---------------------------------------------------------------
    {
        assert(describePublisherLeaderboardSnapshotDifference().leaderboardChanged === false, '64. calling with no arguments compares two empty snapshots, never throws');
        assert(describePublisherLeaderboardSnapshotDifference(null, null).leaderboardChanged === false, '65. null on both sides degrades to empty, never throws');
        assert(describePublisherLeaderboardSnapshotDifference('garbage', 42).leaderboardChanged === false, '66. non-object garbage on both sides degrades to empty, never throws');

        const alice = identity('Alice');
        const policy = makePolicy(1);
        const genuineLeaderboard = makeLeaderboard(policy, [makeEntry(1, alice, 5, 2, 1)]);
        const genuineSnapshot = snapshotOf(E1, genuineLeaderboard);

        const differenceOneSideMalformed = describePublisherLeaderboardSnapshotDifference(genuineSnapshot, { not: 'a snapshot' });
        assert(differenceOneSideMalformed.evidenceFingerprintChanged === true, '67. a malformed target degrades to the canonical empty snapshot, genuinely differing from the genuine source');
        assert(differenceOneSideMalformed.publisherSourceOnlyCount === 1, '68. the genuine source\'s own entry is reported source-only against the degraded-empty target');
    }
    console.log('✓ Section L: malformed/absent snapshots on either or both sides degrade to 0.8.119\'s own well-defined empty snapshot, never throwing');

    // ---------------------------------------------------------------
    // Section M — malformed leaderboard entries are silently excluded.
    // ---------------------------------------------------------------
    {
        const alice = identity('Alice');
        const policy = makePolicy(1);
        const malformedEntries = Object.freeze([
            null,
            undefined,
            Object.freeze({ rank: 1 }),
            Object.freeze({ rank: 2, publisherIdentity: {} }),
            makeEntry(3, alice, 5, 2, 1)
        ]);
        const leaderboardWithGarbage = Object.freeze({ policy, entryCount: malformedEntries.length, entries: malformedEntries });

        const difference = describePublisherLeaderboardSnapshotDifference(
            snapshotOf(E1, leaderboardWithGarbage),
            snapshotOf(E1, leaderboardWithGarbage)
        );
        assert(difference.publisherPresentInBothCount === 1, '69. only the one genuine entry (Alice) is matched — malformed entries never throw and never coincidentally match each other');
        assert(difference.publisherSourceOnlyCount === 0 && difference.publisherTargetOnlyCount === 0, '70. malformed entries are excluded from every bucket, not dumped into source/target-only');
    }
    console.log('✓ Section M: malformed leaderboard entries are silently excluded from every membership bucket, never thrown on, never coincidentally matched');

    // ---------------------------------------------------------------
    // Section N — no mutation; every result is frozen.
    // ---------------------------------------------------------------
    {
        const alice = identity('Alice');
        const bob = identity('Bob');
        const policy = makePolicy(1);
        const sourceLeaderboard = makeLeaderboard(policy, [makeEntry(1, alice, 5, 2, 1)]);
        const targetLeaderboard = makeLeaderboard(policy, [makeEntry(1, alice, 5, 2, 1), makeEntry(2, bob, 1, 1, 1)]);
        const sourceSnapshot = snapshotOf(E1, sourceLeaderboard);
        const targetSnapshot = snapshotOf(E1, targetLeaderboard);
        const sourceSnapshotBefore = serialize(sourceSnapshot);
        const targetSnapshotBefore = serialize(targetSnapshot);

        const difference = describePublisherLeaderboardSnapshotDifference(sourceSnapshot, targetSnapshot);

        assert(serialize(sourceSnapshot) === sourceSnapshotBefore, '71. the source snapshot is never mutated');
        assert(serialize(targetSnapshot) === targetSnapshotBefore, '72. the target snapshot is never mutated');
        assert(Object.isFrozen(difference), '73. the result itself is frozen');
        assert(Object.isFrozen(difference.publisherPresentInBoth), '74. publisherPresentInBoth is frozen');
        assert(Object.isFrozen(difference.publisherSourceOnly), '75. publisherSourceOnly is frozen');
        assert(Object.isFrozen(difference.publisherTargetOnly), '76. publisherTargetOnly is frozen');
        assert(Object.isFrozen(difference.publisherTargetOnly[0]), '77. each publisherTargetOnly element is itself frozen');
    }
    console.log('✓ Section N: neither input snapshot is ever mutated, and every returned object/array is frozen');

    // ---------------------------------------------------------------
    // Section O — determinism.
    // ---------------------------------------------------------------
    {
        const alice = identity('Alice');
        const policy = makePolicy(1);
        const sourceSnapshot = snapshotOf(E1, makeLeaderboard(policy, [makeEntry(1, alice, 5, 2, 1)]));
        const targetSnapshot = snapshotOf(E2, makeLeaderboard(policy, [makeEntry(1, alice, 9, 2, 1)]));

        const differenceOnce = describePublisherLeaderboardSnapshotDifference(sourceSnapshot, targetSnapshot);
        const differenceTwice = describePublisherLeaderboardSnapshotDifference(sourceSnapshot, targetSnapshot);
        assert(serialize(differenceOnce) === serialize(differenceTwice), '78. repeated calls over identical inputs are byte-identical');
    }
    console.log('✓ Section O: repeated calls over identical inputs produce byte-identical results');

    // ---------------------------------------------------------------
    // Section P — source/target are positional labels only.
    // ---------------------------------------------------------------
    {
        const alice = identity('Alice');
        const policy = makePolicy(1);
        const snapshotEarlier = snapshotOf(E1, makeLeaderboard(policy, [makeEntry(1, alice, 5, 2, 1)]));
        const snapshotLater = snapshotOf(E2, makeLeaderboard(policy, [makeEntry(1, alice, 9, 2, 1)]));

        // Passing the "later" snapshot first and the "earlier" one second
        // is a completely legitimate call — this file assigns no meaning
        // to which side is which beyond argument position.
        const forward = describePublisherLeaderboardSnapshotDifference(snapshotEarlier, snapshotLater);
        const reversed = describePublisherLeaderboardSnapshotDifference(snapshotLater, snapshotEarlier);
        assert(forward.sourceEvidenceFingerprint === E1 && forward.targetEvidenceFingerprint === E2, '79. forward call names E1 as source, E2 as target');
        assert(reversed.sourceEvidenceFingerprint === E2 && reversed.targetEvidenceFingerprint === E1, '80. reversed call names E2 as source, E1 as target — this file never assumes an ordering of its own');
        assert(forward.evidenceFingerprintChanged === true && reversed.evidenceFingerprintChanged === true, '81. the CHANGE fact itself is symmetric — true regardless of call order');
    }
    console.log('✓ Section P: source/target name argument position only — this file assigns no notion of "newer," "correct," or "authoritative" to either side');

    // ---------------------------------------------------------------
    // Section Q — no reconstruction entry point; no snapshotFingerprint
    // vocabulary.
    // ---------------------------------------------------------------
    {
        const exportedNames = Object.keys(PublisherLeaderboardSnapshotDifferenceModule).sort();
        assert(serialize(exportedNames) === serialize(['describePublisherLeaderboardSnapshotDifference']), '82. this module exports exactly one function — no reconstructXxx() archive-reading entry point');
        assert(typeof PublisherLeaderboardSnapshotDifferenceModule.reconstructPublisherLeaderboardSnapshotDifference === 'undefined', '83. no reconstructPublisherLeaderboardSnapshotDifference is exported');

        const moduleSource = describePublisherLeaderboardSnapshotDifference.toString();
        assert(!moduleSource.toLowerCase().includes('snapshotfingerprint'), '84. the pure function\'s own source never mentions snapshotFingerprint — semantic identity only, never cryptographic identity');
    }
    console.log('✓ Section Q: no reconstructXxx() archive-reading entry point exists, and the pure function never reads or computes a snapshotFingerprint');

    // ---------------------------------------------------------------
    // Section R — vocabulary boundary.
    // ---------------------------------------------------------------
    {
        const alice = identity('Alice');
        const bob = identity('Bob');
        const policy = makePolicy(1);
        const sourceLeaderboard = makeLeaderboard(policy, [makeEntry(1, alice, 5, 2, 1)]);
        const targetLeaderboard = makeLeaderboard(policy, [makeEntry(1, alice, 5, 2, 1), makeEntry(2, bob, 1, 1, 1)]);
        const difference = describePublisherLeaderboardSnapshotDifference(
            snapshotOf(E1, sourceLeaderboard),
            snapshotOf(E2, targetLeaderboard)
        );

        const topLevelKeys = Object.keys(difference).sort();
        assert(serialize(topLevelKeys) === serialize([
            'evidenceFingerprintChanged', 'policyVersionChanged', 'policyChanged', 'leaderboardChanged',
            'sourceEvidenceFingerprint', 'targetEvidenceFingerprint',
            'sourcePolicyVersion', 'targetPolicyVersion',
            'sourceLeaderboardEntryCount', 'targetLeaderboardEntryCount',
            'sourceLeaderboard', 'targetLeaderboard',
            'publisherPresentInBothCount', 'publisherSourceOnlyCount', 'publisherTargetOnlyCount',
            'publisherPresentInBoth', 'publisherSourceOnly', 'publisherTargetOnly'
        ].sort()), '85. the top-level result carries exactly the documented, factual fields');

        const entryDiffKeys = Object.keys(difference.publisherPresentInBoth[0]).sort();
        assert(serialize(entryDiffKeys) === serialize([
            'publisherIdentity', 'sourceEntry', 'targetEntry',
            'rankChanged', 'achievementCountChanged', 'distinctAchievementKindCountChanged', 'publicationIdentityCountChanged'
        ].sort()), '86. each publisherPresentInBoth entry carries exactly the documented, factual fields');

        const forbidden = [
            'matches', 'valid', 'verified', 'trusted', 'trust', 'confidence', 'score', 'rank_', 'reputation',
            'signatureValid', 'improved', 'regressed', 'upgraded', 'downgraded',
            'progress', 'maturity', 'quality', 'correct', 'authoritative', 'winner', 'better', 'worse',
            'delta', 'positive', 'negative'
        ];
        const allKeys = [...topLevelKeys, ...entryDiffKeys];
        for (const term of forbidden) {
            assert(!allKeys.includes(term), `87. the result never carries verification/trust/evaluative vocabulary ('${term}')`);
        }

        const moduleSource = describePublisherLeaderboardSnapshotDifference.toString();
        for (const term of ['verif', 'trust', 'confidence', 'score', 'reputation', 'improv', 'regress', 'upgrad', 'downgrad', 'quality', 'maturity', 'winner', 'authoritative']) {
            assert(!moduleSource.toLowerCase().includes(term), `88. the pure function's own source mentions no forbidden vocabulary ('${term}')`);
        }
    }
    console.log('✓ Section R: the result carries no verification, trust, or improvement/regression vocabulary, and the function computes none');

    console.log('\nAll PublisherLeaderboardSnapshotDifference tests passed.');
}

run();
