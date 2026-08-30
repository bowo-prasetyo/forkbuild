import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { describePublisherLeaderboardSnapshot } from '../application/PublisherLeaderboardSnapshot.js';
import { describePublisherLeaderboardSnapshotFingerprint } from '../application/PublisherLeaderboardSnapshotFingerprint.js';
import { describePublisherLeaderboardSnapshotDifference } from '../application/PublisherLeaderboardSnapshotDifference.js';
import * as PublisherLeaderboardSnapshotTimelineViewModule from '../application/PublisherLeaderboardSnapshotTimelineView.js';
import { describePublisherLeaderboardSnapshotTimeline } from '../application/PublisherLeaderboardSnapshotTimelineView.js';

// 0.8.136 — Historical Leaderboard Snapshot Timeline Projection.
//
// Section A: an empty list produces an empty, zero-count timeline
// Section B: a single snapshot produces one summary and zero transitions
// Section C: FLAGSHIP — S1 -> S2 -> S3, each transition's four independent
//            change facts read exactly as 0.8.134 already computes them
// Section D: an all-false transition (two identical snapshots) is
//            preserved, never dropped
// Section E: transitions[i].difference is byte-identical to an
//            independently computed describePublisherLeaderboardSnapshotDifference()
//            call — this file never re-derives or summarizes it
// Section F: ordering follows the caller-supplied sequence only, never
//            sorted or reordered
// Section G: each snapshot summary's own identity fields match
//            describePublisherLeaderboardSnapshot()/
//            describePublisherLeaderboardSnapshotFingerprint() directly
// Section H: fromSnapshotFingerprint/toSnapshotFingerprint match the
//            adjacent snapshots' own snapshotFingerprint values
// Section I: malformed entries within the list degrade to the canonical
//            empty snapshot, in position, never thrown on, never skipped
// Section J: non-array/malformed top-level input tolerated, never throws
// Section K: no mutation of the input array or any snapshot within it;
//            every result is frozen
// Section L: determinism — repeated calls over identical inputs agree
// Section M: vocabulary boundary — no verification/trust/evaluative terms,
//            no reconstructXxx() entry point
// Section N: never a second comparison engine — no diff logic duplicated
//            in this file's own source

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

function fingerprintOf(snapshot) {
    return describePublisherLeaderboardSnapshotFingerprint(snapshot).fingerprint;
}

const E1 = '1'.repeat(64);
const E2 = '2'.repeat(64);
const EMPTY_EVIDENCE_FINGERPRINT = snapshotOf(undefined, undefined).evidenceFingerprint;

function run() {
    // ---------------------------------------------------------------
    // Section A — an empty list.
    // ---------------------------------------------------------------
    {
        const timeline = describePublisherLeaderboardSnapshotTimeline([]);
        assert(timeline.snapshotCount === 0, '1. an empty list produces snapshotCount 0');
        assert(timeline.snapshots.length === 0, '2. an empty list produces no snapshot summaries');
        assert(timeline.transitionCount === 0, '3. an empty list produces transitionCount 0');
        assert(timeline.transitions.length === 0, '4. an empty list produces no transitions');
    }
    console.log('✓ Section A: an empty list produces an empty, zero-count timeline');

    // ---------------------------------------------------------------
    // Section B — a single snapshot.
    // ---------------------------------------------------------------
    {
        const alice = identity('Alice');
        const policy = makePolicy(1);
        const leaderboard = makeLeaderboard(policy, [makeEntry(1, alice, 5, 2, 1)]);
        const snapshot = snapshotOf(E1, leaderboard);

        const timeline = describePublisherLeaderboardSnapshotTimeline([snapshot]);
        assert(timeline.snapshotCount === 1, '5. a single-element list produces snapshotCount 1');
        assert(timeline.snapshots[0].evidenceFingerprint === E1, '6. the one summary reports the correct evidenceFingerprint');
        assert(timeline.snapshots[0].policyVersion === 1, '7. the one summary reports the correct policyVersion');
        assert(timeline.snapshots[0].snapshotFingerprint === fingerprintOf(snapshot), '8. the one summary reports the correct snapshotFingerprint');
        assert(timeline.transitionCount === 0, '9. a single-element list produces zero transitions — there is no adjacent pair');
        assert(timeline.transitions.length === 0, '10. transitions array is empty for a single-element list');
    }
    console.log('✓ Section B: a single snapshot produces one summary and zero transitions');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP: S1 -> S2 -> S3.
    // ---------------------------------------------------------------
    {
        const alice = identity('Alice');
        const policy1 = makePolicy(1, 'ASCENDING');
        const policy2 = makePolicy(2, 'DESCENDING');

        // S1: evidence E1, policy P1, leaderboard L1.
        const l1 = makeLeaderboard(policy1, [makeEntry(1, alice, 5, 2, 1)]);
        const s1 = snapshotOf(E1, l1);

        // S2: evidence E1 (unchanged), policy P2 (changed), leaderboard L2.
        const l2 = makeLeaderboard(policy2, [makeEntry(1, alice, 5, 2, 1)]);
        const s2 = snapshotOf(E1, l2);

        // S3: evidence E2 (changed), policy P2 (unchanged), leaderboard L3.
        const l3 = makeLeaderboard(policy2, [makeEntry(1, alice, 9, 2, 1)]);
        const s3 = snapshotOf(E2, l3);

        const timeline = describePublisherLeaderboardSnapshotTimeline([s1, s2, s3]);

        assert(timeline.snapshotCount === 3, '11. FLAGSHIP — three snapshots produce snapshotCount 3');
        assert(timeline.transitionCount === 2, '12. FLAGSHIP — three snapshots produce exactly two transitions');
        assert(timeline.transitions.length === 2, '13. FLAGSHIP — the transitions array holds exactly two elements');

        const s1ToS2 = timeline.transitions[0];
        assert(s1ToS2.difference.evidenceFingerprintChanged === false, '14. FLAGSHIP S1->S2 — evidenceFingerprintChanged is false');
        assert(s1ToS2.difference.policyVersionChanged === true, '15. FLAGSHIP S1->S2 — policyVersionChanged is true');
        assert(s1ToS2.difference.policyChanged === true, '16. FLAGSHIP S1->S2 — policyChanged is true');
        assert(s1ToS2.difference.leaderboardChanged === true, '17. FLAGSHIP S1->S2 — leaderboardChanged is true');

        const s2ToS3 = timeline.transitions[1];
        assert(s2ToS3.difference.evidenceFingerprintChanged === true, '18. FLAGSHIP S2->S3 — evidenceFingerprintChanged is true');
        assert(s2ToS3.difference.policyVersionChanged === false, '19. FLAGSHIP S2->S3 — policyVersionChanged is false');
        assert(s2ToS3.difference.policyChanged === false, '20. FLAGSHIP S2->S3 — policyChanged is false');
        assert(s2ToS3.difference.leaderboardChanged === true, '21. FLAGSHIP S2->S3 — leaderboardChanged is true');

        // A changed leaderboard alone never tells the reader WHY — the
        // separate dimensions remain independently observable across the
        // whole sequence, not just one pair.
        assert(s1ToS2.difference.leaderboardChanged && !s1ToS2.difference.evidenceFingerprintChanged, '22. FLAGSHIP — S1->S2 changed the leaderboard via policy alone');
        assert(s2ToS3.difference.leaderboardChanged && !s2ToS3.difference.policyChanged, '23. FLAGSHIP — S2->S3 changed the leaderboard via evidence alone');
    }
    console.log('✓ Section C: FLAGSHIP — a three-snapshot sequence reveals, independently at each step, whether evidence, policy version, policy, or the leaderboard itself changed');

    // ---------------------------------------------------------------
    // Section D — an all-false transition is preserved.
    // ---------------------------------------------------------------
    {
        const alice = identity('Alice');
        const policy = makePolicy(1);
        const leaderboard = makeLeaderboard(policy, [makeEntry(1, alice, 5, 2, 1)]);
        const snapshot = snapshotOf(E1, leaderboard);

        // Two genuinely distinct snapshot instances, semantically identical.
        const snapshotCopy = snapshotOf(E1, leaderboard);

        const timeline = describePublisherLeaderboardSnapshotTimeline([snapshot, snapshotCopy]);
        assert(timeline.snapshotCount === 2, '24. two identical snapshots still count as two entries');
        assert(timeline.transitionCount === 1, '25. two identical snapshots still produce one transition — never dropped');
        const transition = timeline.transitions[0];
        assert(transition.difference.evidenceFingerprintChanged === false, '26. the identical-pair transition reports evidenceFingerprintChanged false');
        assert(transition.difference.policyVersionChanged === false, '27. the identical-pair transition reports policyVersionChanged false');
        assert(transition.difference.policyChanged === false, '28. the identical-pair transition reports policyChanged false');
        assert(transition.difference.leaderboardChanged === false, '29. the identical-pair transition reports leaderboardChanged false');
        assert(transition.fromSnapshotFingerprint === transition.toSnapshotFingerprint, '30. the identical-pair transition names the same snapshotFingerprint on both ends');
    }
    console.log('✓ Section D: two consecutive, semantically identical snapshots still produce one legitimate all-false transition, never silently dropped');

    // ---------------------------------------------------------------
    // Section E — transitions[i].difference is 0.8.134's own, unmodified
    // result.
    // ---------------------------------------------------------------
    {
        const alice = identity('Alice');
        const bob = identity('Bob');
        const policy = makePolicy(1);
        const l1 = makeLeaderboard(policy, [makeEntry(1, alice, 5, 2, 1)]);
        const l2 = makeLeaderboard(policy, [makeEntry(1, alice, 5, 2, 1), makeEntry(2, bob, 3, 1, 1)]);
        const s1 = snapshotOf(E1, l1);
        const s2 = snapshotOf(E1, l2);

        const timeline = describePublisherLeaderboardSnapshotTimeline([s1, s2]);
        const independentlyComputedDifference = describePublisherLeaderboardSnapshotDifference(s1, s2);

        assert(serialize(timeline.transitions[0].difference) === serialize(independentlyComputedDifference), '31. the embedded difference is byte-identical to an independently computed 0.8.134 call — never re-derived or summarized');
    }
    console.log('✓ Section E: each transition\'s own difference is exactly 0.8.134\'s own projection, reused byte for byte, never a newly invented interpretation');

    // ---------------------------------------------------------------
    // Section F — ordering follows the caller-supplied sequence only.
    // ---------------------------------------------------------------
    {
        const alice = identity('Alice');
        const policy = makePolicy(1);
        const sA = snapshotOf(E1, makeLeaderboard(policy, [makeEntry(1, alice, 1, 1, 1)]));
        const sB = snapshotOf(E1, makeLeaderboard(policy, [makeEntry(1, alice, 2, 1, 1)]));
        const sC = snapshotOf(E1, makeLeaderboard(policy, [makeEntry(1, alice, 3, 1, 1)]));

        // Deliberately non-monotonic order: C, A, B — this file must never
        // reorder by any inferred chronology.
        const timeline = describePublisherLeaderboardSnapshotTimeline([sC, sA, sB]);
        assert(timeline.snapshots[0].snapshotFingerprint === fingerprintOf(sC), '32. snapshots[0] is exactly the first-supplied snapshot (C)');
        assert(timeline.snapshots[1].snapshotFingerprint === fingerprintOf(sA), '33. snapshots[1] is exactly the second-supplied snapshot (A)');
        assert(timeline.snapshots[2].snapshotFingerprint === fingerprintOf(sB), '34. snapshots[2] is exactly the third-supplied snapshot (B)');
        assert(timeline.transitions[0].fromSnapshotFingerprint === fingerprintOf(sC), '35. transitions[0] runs from C');
        assert(timeline.transitions[0].toSnapshotFingerprint === fingerprintOf(sA), '36. transitions[0] runs to A — the caller\'s own order, never sorted');
        assert(timeline.transitions[1].fromSnapshotFingerprint === fingerprintOf(sA), '37. transitions[1] runs from A');
        assert(timeline.transitions[1].toSnapshotFingerprint === fingerprintOf(sB), '38. transitions[1] runs to B');
    }
    console.log('✓ Section F: the timeline follows exactly the caller-supplied sequence — never sorted, never reordered by an inferred chronology');

    // ---------------------------------------------------------------
    // Section G — snapshot summary identity fields match 0.8.119/0.8.121
    // directly.
    // ---------------------------------------------------------------
    {
        const alice = identity('Alice');
        const policy = makePolicy(3);
        const leaderboard = makeLeaderboard(policy, [makeEntry(1, alice, 5, 2, 1)]);
        const snapshot = snapshotOf(E2, leaderboard);

        const timeline = describePublisherLeaderboardSnapshotTimeline([snapshot]);
        const normalized = describePublisherLeaderboardSnapshot(snapshot.evidenceFingerprint, snapshot.leaderboard);
        const expectedFingerprint = describePublisherLeaderboardSnapshotFingerprint(normalized).fingerprint;

        assert(timeline.snapshots[0].evidenceFingerprint === normalized.evidenceFingerprint, '39. evidenceFingerprint matches 0.8.119\'s own normalized result');
        assert(timeline.snapshots[0].policyVersion === normalized.policy.version, '40. policyVersion matches 0.8.119\'s own normalized result');
        assert(timeline.snapshots[0].snapshotFingerprint === expectedFingerprint, '41. snapshotFingerprint matches 0.8.121\'s own fingerprint over the identical normalized snapshot');
    }
    console.log('✓ Section G: each snapshot summary\'s identity fields are read straight from 0.8.119/0.8.121, never re-derived by a parallel computation');

    // ---------------------------------------------------------------
    // Section H — from/toSnapshotFingerprint match the adjacent summaries.
    // ---------------------------------------------------------------
    {
        const alice = identity('Alice');
        const policy = makePolicy(1);
        const s1 = snapshotOf(E1, makeLeaderboard(policy, [makeEntry(1, alice, 1, 1, 1)]));
        const s2 = snapshotOf(E2, makeLeaderboard(policy, [makeEntry(1, alice, 2, 1, 1)]));

        const timeline = describePublisherLeaderboardSnapshotTimeline([s1, s2]);
        assert(timeline.transitions[0].fromSnapshotFingerprint === timeline.snapshots[0].snapshotFingerprint, '42. fromSnapshotFingerprint matches snapshots[0]\'s own snapshotFingerprint');
        assert(timeline.transitions[0].toSnapshotFingerprint === timeline.snapshots[1].snapshotFingerprint, '43. toSnapshotFingerprint matches snapshots[1]\'s own snapshotFingerprint');
    }
    console.log('✓ Section H: fromSnapshotFingerprint/toSnapshotFingerprint always match the two adjacent snapshots\' own reported snapshotFingerprint values');

    // ---------------------------------------------------------------
    // Section I — malformed entries within the list degrade in position.
    // ---------------------------------------------------------------
    {
        const alice = identity('Alice');
        const policy = makePolicy(1);
        const genuineSnapshot = snapshotOf(E1, makeLeaderboard(policy, [makeEntry(1, alice, 5, 2, 1)]));

        const timeline = describePublisherLeaderboardSnapshotTimeline([null, genuineSnapshot, 'garbage']);
        assert(timeline.snapshotCount === 3, '44. a malformed entry is never skipped — the sequence keeps its full length');
        assert(timeline.snapshots[0].evidenceFingerprint === EMPTY_EVIDENCE_FINGERPRINT, '45. a null entry degrades to the canonical empty snapshot, in position');
        assert(timeline.snapshots[1].evidenceFingerprint === E1, '46. the genuine entry in the middle is read correctly, unaffected by its malformed neighbors');
        assert(timeline.snapshots[2].evidenceFingerprint === EMPTY_EVIDENCE_FINGERPRINT, '47. a garbage entry degrades to the canonical empty snapshot, in position');
        assert(timeline.transitionCount === 2, '48. transitions are still computed across the full, positionally-preserved sequence');
    }
    console.log('✓ Section I: malformed entries within the supplied list degrade to 0.8.119\'s own well-defined empty snapshot, in their own position — never skipped, never thrown on');

    // ---------------------------------------------------------------
    // Section J — non-array/malformed top-level input.
    // ---------------------------------------------------------------
    {
        assert(describePublisherLeaderboardSnapshotTimeline().snapshotCount === 0, '49. calling with no arguments never throws, produces an empty timeline');
        assert(describePublisherLeaderboardSnapshotTimeline(null).snapshotCount === 0, '50. null never throws, produces an empty timeline');
        assert(describePublisherLeaderboardSnapshotTimeline('garbage').snapshotCount === 0, '51. a non-array string never throws, produces an empty timeline');
        assert(describePublisherLeaderboardSnapshotTimeline(42).transitions.length === 0, '52. a non-array number never throws, produces no transitions');
    }
    console.log('✓ Section J: non-array or malformed top-level input is tolerated, never thrown on, and degrades to an empty timeline');

    // ---------------------------------------------------------------
    // Section K — no mutation; every result is frozen.
    // ---------------------------------------------------------------
    {
        const alice = identity('Alice');
        const policy = makePolicy(1);
        const s1 = snapshotOf(E1, makeLeaderboard(policy, [makeEntry(1, alice, 5, 2, 1)]));
        const s2 = snapshotOf(E2, makeLeaderboard(policy, [makeEntry(1, alice, 9, 2, 1)]));
        const inputList = [s1, s2];
        const s1Before = serialize(s1);
        const s2Before = serialize(s2);

        const timeline = describePublisherLeaderboardSnapshotTimeline(inputList);

        assert(serialize(s1) === s1Before, '53. the first input snapshot is never mutated');
        assert(serialize(s2) === s2Before, '54. the second input snapshot is never mutated');
        assert(inputList.length === 2, '55. the input array itself is never mutated');
        assert(Object.isFrozen(timeline), '56. the result itself is frozen');
        assert(Object.isFrozen(timeline.snapshots), '57. the snapshots array is frozen');
        assert(Object.isFrozen(timeline.snapshots[0]), '58. each snapshot summary is frozen');
        assert(Object.isFrozen(timeline.transitions), '59. the transitions array is frozen');
        assert(Object.isFrozen(timeline.transitions[0]), '60. each transition is frozen');
    }
    console.log('✓ Section K: neither the input array nor any snapshot within it is ever mutated, and every returned object/array is frozen');

    // ---------------------------------------------------------------
    // Section L — determinism.
    // ---------------------------------------------------------------
    {
        const alice = identity('Alice');
        const policy = makePolicy(1);
        const s1 = snapshotOf(E1, makeLeaderboard(policy, [makeEntry(1, alice, 5, 2, 1)]));
        const s2 = snapshotOf(E2, makeLeaderboard(policy, [makeEntry(1, alice, 9, 2, 1)]));

        const timelineOnce = describePublisherLeaderboardSnapshotTimeline([s1, s2]);
        const timelineTwice = describePublisherLeaderboardSnapshotTimeline([s1, s2]);
        assert(serialize(timelineOnce) === serialize(timelineTwice), '61. repeated calls over identical inputs are byte-identical');
    }
    console.log('✓ Section L: repeated calls over identical inputs produce byte-identical results');

    // ---------------------------------------------------------------
    // Section M — vocabulary boundary.
    // ---------------------------------------------------------------
    {
        const exportedNames = Object.keys(PublisherLeaderboardSnapshotTimelineViewModule).sort();
        assert(serialize(exportedNames) === serialize(['describePublisherLeaderboardSnapshotTimeline']), '62. this module exports exactly one function — no reconstructXxx() archive-reading entry point');

        const alice = identity('Alice');
        const policy = makePolicy(1);
        const s1 = snapshotOf(E1, makeLeaderboard(policy, [makeEntry(1, alice, 5, 2, 1)]));
        const s2 = snapshotOf(E2, makeLeaderboard(policy, [makeEntry(1, alice, 9, 2, 1)]));
        const timeline = describePublisherLeaderboardSnapshotTimeline([s1, s2]);

        const topLevelKeys = Object.keys(timeline).sort();
        assert(serialize(topLevelKeys) === serialize(['snapshotCount', 'snapshots', 'transitionCount', 'transitions'].sort()), '63. the top-level result carries exactly the documented, factual fields');

        const summaryKeys = Object.keys(timeline.snapshots[0]).sort();
        assert(serialize(summaryKeys) === serialize(['evidenceFingerprint', 'policyVersion', 'snapshotFingerprint'].sort()), '64. each snapshot summary carries exactly the documented, factual fields');

        const transitionKeys = Object.keys(timeline.transitions[0]).sort();
        assert(serialize(transitionKeys) === serialize(['fromSnapshotFingerprint', 'toSnapshotFingerprint', 'difference'].sort()), '65. each transition carries exactly the documented, factual fields');

        const forbidden = [
            'matches', 'valid', 'verified', 'trusted', 'trust', 'confidence', 'score', 'reputation',
            'signatureValid', 'improved', 'regressed', 'upgraded', 'downgraded', 'trend', 'direction',
            'progress', 'maturity', 'quality', 'correct', 'authoritative', 'winner', 'better', 'worse'
        ];
        const allKeys = [...topLevelKeys, ...summaryKeys, ...transitionKeys];
        for (const term of forbidden) {
            assert(!allKeys.includes(term), `66. the result never carries verification/trust/evaluative vocabulary ('${term}')`);
        }

        const moduleSource = describePublisherLeaderboardSnapshotTimeline.toString();
        for (const term of ['verif', 'trust', 'confidence', 'score', 'reputation', 'improv', 'regress', 'upgrad', 'downgrad', 'quality', 'maturity', 'winner', 'authoritative', 'trend']) {
            assert(!moduleSource.toLowerCase().includes(term), `67. the pure function's own source mentions no forbidden vocabulary ('${term}')`);
        }
    }
    console.log('✓ Section M: the result carries no verification, trust, or improvement/regression vocabulary, exports no reconstructXxx() entry point, and the function computes none of it');

    // ---------------------------------------------------------------
    // Section N — never a second comparison engine.
    // ---------------------------------------------------------------
    {
        const moduleSource = describePublisherLeaderboardSnapshotTimeline.toString();
        assert(!moduleSource.includes('.sort('), '68. the pure function\'s own source performs no sort() call');
        assert(!moduleSource.includes('JSON.stringify'), '69. the pure function\'s own source performs no field-by-field JSON comparison of its own — every change fact is 0.8.134\'s own, embedded whole');
        assert(!/evidenceFingerprintChanged|policyChanged|leaderboardChanged/.test(moduleSource), '70. this file\'s own source never names a change fact directly — those live exclusively inside the embedded, reused difference');
    }
    console.log('✓ Section N: this file never reimplements 0.8.134\'s own comparison — it composes one existing function pairwise, never a second, competing algorithm');

    console.log('\nAll PublisherLeaderboardSnapshotTimelineView tests passed.');
}

run();
