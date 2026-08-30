import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js';
import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimeline,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimeline
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimelineView.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';

// 0.8.165 — Revalidation Observation History Timeline Projection.
//
// Section A: empty history — observationCount 0, timeline []
// Section B: a single observation — one entry, correctly shaped
// Section C: FLAGSHIP — the milestone's own worked example: D1@T3, D2@T1,
//            D3@T3, D4@T2, appended in that order, timelines as D2, D4, D1, D3
// Section D: equal-observedAt tie-breaking — preserved by insertion order
// Section E: duplicate observations remain duplicates — never collapsed
// Section F: different observedAt values remain distinct historical events
// Section G: all three candidate types are preserved through the timeline
// Section H: plan identity is preserved exactly, with no assertion of
//            newness/authority/preference
// Section I: malformed input tolerance
// Section J: input immutability, frozen results
// Section K: determinism, and reconstruct()'s thin, deliberately-empty
//            archive boundary
// Section L: architectural regression — forbidden vocabulary, zero imports

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
}

function planNaming({ divergent = [], claims = [], snapshots = [] } = {}) {
    return Object.freeze({
        divergentCorrespondences: Object.freeze(divergent.map((entry) => Object.freeze({
            ...entry,
            divergence: Object.freeze({ evidenceFingerprintDiffers: true, policyVersionDiffers: false, snapshotFingerprintDiffers: false })
        }))),
        claimsWithoutCorrespondence: Object.freeze(claims.map((claimId) => Object.freeze({ claimId }))),
        snapshotsWithoutCorrespondence: Object.freeze(snapshots.map((snapshotIndex) => Object.freeze({ snapshotIndex })))
    });
}

function genuineDecisionRecord(candidate, decision, decidedAt) {
    return Object.freeze({ decided: true, candidate: Object.freeze(candidate), decision, decidedAt: decidedAt.toISOString() });
}

function observe(decisionRecord, plan, observedAt) {
    const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation(decisionRecord, plan, observedAt);
    assert(result.observed === true, 'test setup — observe() must always produce a genuine observation');
    return result;
}

function appendAll(observations) {
    let history = [];
    for (const observation of observations) {
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(history, observation);
    }
    return history;
}

const T1 = new Date('2026-08-30T10:00:00Z');
const T2 = new Date('2026-08-30T10:03:00Z');
const T3 = new Date('2026-08-30T10:07:00Z');

const OBS_T1 = new Date('2026-08-30T12:00:00Z');
const OBS_T2 = new Date('2026-08-30T12:05:00Z');
const OBS_T3 = new Date('2026-08-30T12:10:00Z');
const OBS_T4 = new Date('2026-08-30T12:15:00Z');

async function run() {
    // ---------------------------------------------------------------
    // Section A — empty history.
    // ---------------------------------------------------------------
    {
        const timeline = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimeline([]);
        assert(timeline.observationCount === 0, '1. empty history reports observationCount 0');
        assert(timeline.timeline.length === 0, '2. empty history reports an empty timeline array');
    }
    console.log('✓ Section A: an empty history produces an empty timeline');

    // ---------------------------------------------------------------
    // Section B — a single observation.
    // ---------------------------------------------------------------
    {
        const candidate = { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' };
        const decision = genuineDecisionRecord(candidate, 'OBSERVE', T1);
        const plan = planNaming({ claims: ['C1'] });
        const O1 = observe(decision, plan, OBS_T1);
        const history = appendAll([O1]);

        const timeline = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimeline(history);
        assert(timeline.observationCount === 1, '3. one observation reports observationCount 1');
        const [entry] = timeline.timeline;
        assert(entry.observationIndex === 0, '4. entry carries observationIndex 0');
        assert(entry.observedAt === O1.observedAt, '5. entry carries the exact observedAt ISO string');
        assert(serialize(entry.decision) === serialize(O1.decision), '6. entry carries decision unchanged');
        assert(serialize(entry.planIdentity) === serialize(O1.planIdentity), '7. entry carries planIdentity unchanged');
        assert(entry.candidatePresent === O1.candidatePresent, '8. entry carries candidatePresent');
        assert(entry.candidateType === O1.candidateType, '9. entry carries candidateType');
        assert(entry.candidateMatchesPlan === O1.candidateMatchesPlan, '10. entry carries candidateMatchesPlan');
    }
    console.log('✓ Section B: a single observation produces one correctly shaped entry');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP: the milestone's own worked example.
    //   D1 observed at T3, D2 observed at T1, D3 observed at T3,
    //   D4 observed at T2 — appended in that order (D1, D2, D3, D4)
    //   timelines as D2, D4, D1, D3.
    // ---------------------------------------------------------------
    let flagshipHistory, D1, D2, D3, D4;
    {
        const plan = planNaming({ claims: ['A', 'B', 'C', 'D'] });
        const decisionOf = (claimId) => genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId }, 'OBSERVE', T1);

        D1 = observe(decisionOf('A'), plan, OBS_T3);
        D2 = observe(decisionOf('B'), plan, OBS_T1);
        D3 = observe(decisionOf('C'), plan, OBS_T3);
        D4 = observe(decisionOf('D'), plan, OBS_T2);

        flagshipHistory = appendAll([D1, D2, D3, D4]);
        assert(flagshipHistory[0] === D1, '11. FLAGSHIP setup — history stores D1 first, in append order');

        const timeline = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimeline(flagshipHistory);
        assert(timeline.observationCount === 4, '12. FLAGSHIP — four observations produce four entries');

        const [e1, e2, e3, e4] = timeline.timeline;
        assert(e1.decision.candidate.claimId === 'B', '13. FLAGSHIP — D2 (observed T1) is first');
        assert(e2.decision.candidate.claimId === 'D', '14. FLAGSHIP — D4 (observed T2) is second');
        assert(e3.decision.candidate.claimId === 'A', '15. FLAGSHIP — D1 (observed T3, appended first among the T3 pair) is third');
        assert(e4.decision.candidate.claimId === 'C', '16. FLAGSHIP — D3 (observed T3, appended second among the T3 pair) is fourth');
        assert(e1.observedAt === OBS_T1.toISOString() && e2.observedAt === OBS_T2.toISOString() && e3.observedAt === OBS_T3.toISOString() && e4.observedAt === OBS_T3.toISOString(), '17. FLAGSHIP — observedAt values are ascending, with the T3 pair equal');
    }
    console.log('✓ Section C: FLAGSHIP — chronological reordering by observedAt with a T3 tie broken by insertion order, exactly as the milestone specifies (D2, D4, D1, D3)');

    // ---------------------------------------------------------------
    // Section D — equal-observedAt tie-breaking, isolated case.
    // ---------------------------------------------------------------
    {
        const plan = planNaming({ claims: ['X', 'Y'] });
        const decisionX = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'X' }, 'OBSERVE', T1);
        const decisionY = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'Y' }, 'OBSERVE', T2);
        const first = observe(decisionX, plan, OBS_T1);
        const second = observe(decisionY, plan, OBS_T1);
        assert(first.observedAt === second.observedAt, '18. setup — both observations share the identical observedAt');

        const history = appendAll([first, second]);
        const timeline = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimeline(history);
        assert(timeline.timeline[0].decision.candidate.claimId === 'X', '19. equal observedAt — the first-appended entry (X) sorts first');
        assert(timeline.timeline[1].decision.candidate.claimId === 'Y', '20. equal observedAt — the second-appended entry (Y) sorts second');

        // Reversed insertion order must reverse the tie-break, proving this
        // is genuine insertion-order tie-breaking, not an accident of field
        // values.
        const reversedHistory = appendAll([second, first]);
        const reversedTimeline = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimeline(reversedHistory);
        assert(reversedTimeline.timeline[0].decision.candidate.claimId === 'Y', '21. reversed insertion — Y (appended first this time) now sorts first');
        assert(reversedTimeline.timeline[1].decision.candidate.claimId === 'X', '22. reversed insertion — X now sorts second');
    }
    console.log('✓ Section D: equal observedAt values are broken by insertion order, never by any field value');

    // ---------------------------------------------------------------
    // Section E — duplicate observations remain duplicates.
    // ---------------------------------------------------------------
    {
        const candidate = { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'DUP' };
        const decision = genuineDecisionRecord(candidate, 'OBSERVE', T1);
        const plan = planNaming({ claims: ['DUP'] });
        const O1 = observe(decision, plan, OBS_T1);
        const O2 = observe(decision, plan, OBS_T1);
        assert(serialize(O1) === serialize(O2), '23. setup — O1 and O2 are byte-identical observations');

        const history = appendAll([O1, O2]);
        const timeline = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimeline(history);
        assert(timeline.observationCount === 2, '24. two byte-identical observations produce two timeline entries, never collapsed');
        assert(timeline.timeline[0].observationIndex === 0 && timeline.timeline[1].observationIndex === 1, '25. each duplicate keeps its own distinct observationIndex');
        const stripIndex = (entry) => { const { observationIndex, ...rest } = entry; return rest; };
        assert(serialize(stripIndex(timeline.timeline[0])) === serialize(stripIndex(timeline.timeline[1])), '26. aside from observationIndex, the two duplicate entries are byte-identical narrations');
    }
    console.log('✓ Section E: the same observation recorded twice remains two entries — duplicates are never deduplicated here');

    // ---------------------------------------------------------------
    // Section F — different observedAt values remain distinct historical
    // events, even when every other field is identical.
    // ---------------------------------------------------------------
    {
        const candidate = { type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 3 };
        const decision = genuineDecisionRecord(candidate, 'DEFER', T2);
        const plan = planNaming({ snapshots: [3] });
        const first = observe(decision, plan, OBS_T1);
        const second = observe(decision, plan, OBS_T2);
        assert(first.observedAt !== second.observedAt, '27. setup — the two observations genuinely differ only in observedAt');

        const history = appendAll([first, second]);
        const timeline = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimeline(history);
        assert(timeline.observationCount === 2, '28. differing only in observedAt still produces two distinct entries');
        assert(timeline.timeline[0].observedAt === OBS_T1.toISOString(), '29. the earlier observedAt sorts first');
        assert(timeline.timeline[1].observedAt === OBS_T2.toISOString(), '30. the later observedAt sorts second');
    }
    console.log('✓ Section F: two observations differing only in observedAt remain two separate historical events');

    // ---------------------------------------------------------------
    // Section G — all three candidate types are preserved through the
    // timeline.
    // ---------------------------------------------------------------
    {
        const divergentDecision = genuineDecisionRecord({ type: 'DIVERGENT_CORRESPONDENCE', claimId: 'CD', snapshotIndex: 5 }, 'OBSERVE', T1);
        const claimDecision = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'CC' }, 'OBSERVE', T1);
        const snapshotDecision = genuineDecisionRecord({ type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 9 }, 'DEFER', T1);
        const plan = planNaming({ divergent: [{ claimId: 'CD', snapshotIndex: 5 }], claims: ['CC'], snapshots: [9] });

        const oDivergent = observe(divergentDecision, plan, OBS_T1);
        const oClaim = observe(claimDecision, plan, OBS_T2);
        const oSnapshot = observe(snapshotDecision, plan, OBS_T3);
        assert(oDivergent.candidateType === 'DIVERGENT_CORRESPONDENCE' && oDivergent.candidatePresent === true, '31. setup — the divergent-correspondence observation genuinely matches its plan');
        assert(oClaim.candidateType === 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT' && oClaim.candidatePresent === true, '32. setup — the claim-without-snapshot observation genuinely matches its plan');
        assert(oSnapshot.candidateType === 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM' && oSnapshot.candidatePresent === true, '33. setup — the snapshot-without-claim observation genuinely matches its plan');

        const history = appendAll([oDivergent, oClaim, oSnapshot]);
        const timeline = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimeline(history);
        assert(timeline.observationCount === 3, '34. all three candidate-type observations are present');

        const byType = Object.fromEntries(timeline.timeline.map((entry) => [entry.candidateType, entry]));
        assert(byType.DIVERGENT_CORRESPONDENCE.decision.candidate.claimId === 'CD' && byType.DIVERGENT_CORRESPONDENCE.decision.candidate.snapshotIndex === 5, '35. DIVERGENT_CORRESPONDENCE entry preserves its own claimId and snapshotIndex');
        assert(byType.CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT.decision.candidate.claimId === 'CC', '36. CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT entry preserves its own claimId');
        assert(byType.SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM.decision.candidate.snapshotIndex === 9, '37. SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM entry preserves its own snapshotIndex');
        for (const type of ['DIVERGENT_CORRESPONDENCE', 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM']) {
            assert(byType[type].candidatePresent === true && byType[type].candidateMatchesPlan === true, `38. the ${type} entry preserves its own candidatePresent/candidateMatchesPlan facts`);
        }
    }
    console.log('✓ Section G: all three of 0.8.144\'s own candidate types survive the timeline projection with their own fields intact');

    // ---------------------------------------------------------------
    // Section H — plan identity is preserved exactly, with no assertion of
    // newness, authority, or preference between two differing plans.
    // ---------------------------------------------------------------
    {
        const candidate = { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'P1' };
        const decision = genuineDecisionRecord(candidate, 'OBSERVE', T1);
        const planA = planNaming({ claims: ['P1', 'P2'] });
        const planB = planNaming({ claims: ['P1'] });

        const oPlanA = observe(decision, planA, OBS_T1);
        const oPlanB = observe(decision, planB, OBS_T2);
        assert(oPlanA.planIdentity.planFingerprint !== oPlanB.planIdentity.planFingerprint, '39. setup — planA and planB genuinely carry different fingerprints');

        const history = appendAll([oPlanA, oPlanB]);
        const timeline = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimeline(history);
        assert(timeline.timeline[0].planIdentity.planFingerprint === oPlanA.planIdentity.planFingerprint, '40. the first entry carries planA\'s own fingerprint, unchanged');
        assert(timeline.timeline[1].planIdentity.planFingerprint === oPlanB.planIdentity.planFingerprint, '41. the second entry carries planB\'s own fingerprint, unchanged');
        assert(serialize(timeline.timeline[0].planIdentity) === serialize(oPlanA.planIdentity), '42. the first entry\'s planIdentity is byte-identical to the original observation\'s own planIdentity');
        assert(serialize(timeline.timeline[1].planIdentity) === serialize(oPlanB.planIdentity), '43. the second entry\'s planIdentity is byte-identical to the original observation\'s own planIdentity');
    }
    console.log('✓ Section H: differing planIdentity fingerprints are each preserved exactly as their own recorded fact, with no ordering asserting one plan is newer or preferable');

    // ---------------------------------------------------------------
    // Section I — malformed input tolerance.
    // ---------------------------------------------------------------
    {
        for (const malformed of [undefined, null, 'not a history', 42, {}]) {
            const timeline = malformed === undefined
                ? describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimeline()
                : describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimeline(malformed);
            assert(timeline.observationCount === 0, `44. malformed input (${JSON.stringify(malformed)}) degrades to observationCount 0, never throws`);
            assert(timeline.timeline.length === 0, '45. malformed input degrades to an empty timeline array');
        }

        const candidate = { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'G1' };
        const decision = genuineDecisionRecord(candidate, 'OBSERVE', T1);
        const plan = planNaming({ claims: ['G1'] });
        const genuine = observe(decision, plan, OBS_T1);
        const mixed = [null, undefined, 42, 'not an observation', {}, { observed: false, outcome: 'INVALID_OBSERVATION' }, { observed: 'true' }, { observed: true, observedAt: 'not a date' }, genuine];
        const timeline = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimeline(mixed);
        assert(timeline.observationCount === 1, '46. non-genuine entries, including one with an unparseable observedAt, are silently excluded, leaving only the one genuine observation');
        assert(timeline.timeline[0].observedAt === genuine.observedAt, '47. the surviving entry is the genuine observation');
    }
    console.log('✓ Section I: malformed/absent input degrades to a valid, empty timeline rather than throwing, and non-genuine entries are silently excluded');

    // ---------------------------------------------------------------
    // Section J — input immutability, frozen results.
    // ---------------------------------------------------------------
    {
        const candidate = { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'IM' };
        const decision = genuineDecisionRecord(candidate, 'OBSERVE', T1);
        const plan = planNaming({ claims: ['IM'] });
        const observation = observe(decision, plan, OBS_T1);
        const history = appendAll([observation]);
        const historyJsonBefore = serialize(history);

        const timeline = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimeline(history);

        assert(serialize(history) === historyJsonBefore, '48. the input history is never mutated');
        assert(Object.isFrozen(timeline), '49. the result is frozen');
        assert(Object.isFrozen(timeline.timeline), '50. timeline is frozen');
        assert(Object.isFrozen(timeline.timeline[0]), '51. each entry within timeline is itself frozen');
    }
    console.log('✓ Section J: the input history is never mutated, and every returned object/array is frozen');

    // ---------------------------------------------------------------
    // Section K — determinism, and reconstruct()'s thin, deliberately-empty
    // archive boundary.
    // ---------------------------------------------------------------
    {
        const timelineOnce = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimeline(flagshipHistory);
        const timelineTwice = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimeline(flagshipHistory);
        assert(serialize(timelineOnce) === serialize(timelineTwice), '52. repeated calls on an identical history are byte-identical');

        const emptyTimeline = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimeline([]);

        // 0.8.167 has not yet given the observation history a durable home
        // on PublicationObservationArchive, so reconstruct() always returns
        // the empty timeline — regardless of what archive it is handed,
        // genuine, populated-with-unrelated-collections, or invalid alike.
        const genuineArchive = PublicationObservationArchive.empty();
        const reconstructedFromGenuine = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimeline(genuineArchive);
        assert(serialize(reconstructedFromGenuine) === serialize(emptyTimeline), '53. reconstruct() over a genuine, empty archive returns the empty timeline');

        const invalidArchiveReconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimeline(null);
        assert(serialize(invalidArchiveReconstructed) === serialize(emptyTimeline), '54. reconstruct() over an invalid/missing archive also returns the empty timeline, never a throw');

        let populatedArchive = PublicationObservationArchive.empty();
        populatedArchive = populatedArchive.appendReconciliationDecisionRecord(genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'ARCHIVE' }, 'OBSERVE', T1));
        const reconstructedFromPopulated = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimeline(populatedArchive);
        assert(serialize(reconstructedFromPopulated) === serialize(emptyTimeline), '55. reconstruct() over an archive holding unrelated collections still returns the empty timeline — no observation-history collection exists yet');
    }
    console.log('✓ Section K: repeated computation over the same history is byte-identical, and reconstruct() remains a thin, deliberately-empty archive boundary until 0.8.167');

    // ---------------------------------------------------------------
    // Section L — architectural regression: forbidden vocabulary, zero
    // imports.
    // ---------------------------------------------------------------
    {
        const candidate = { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'VOCAB' };
        const decision = genuineDecisionRecord(candidate, 'OBSERVE', T1);
        const plan = planNaming({ claims: ['VOCAB'] });
        const observation = observe(decision, plan, OBS_T1);
        const timeline = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimeline(appendAll([observation]));

        const topKeys = Object.keys(timeline).sort();
        assert(serialize(topKeys) === serialize(['observationCount', 'timeline'].sort()), '56. the result carries exactly the documented, factual top-level fields');

        const entryKeys = Object.keys(timeline.timeline[0]).sort();
        assert(serialize(entryKeys) === serialize(['observationIndex', 'observedAt', 'decision', 'planIdentity', 'candidatePresent', 'candidateType', 'candidateMatchesPlan'].sort()), '57. an entry carries exactly the documented, factual fields — no manufactured "observed" field');
        assert(!('observed' in timeline.timeline[0]), '58. an entry never carries its own "observed" field — every genuine timeline entry is, by construction, already a genuine observation');

        const moduleSource = await (await import('node:fs/promises')).readFile(new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimelineView.js', import.meta.url), 'utf8');
        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.length === 0, '59. this file imports nothing at all');

        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();
        // "valid"/"invalid" are deliberately excluded from this list: this
        // family's own name and every function inside it carry
        // "Revalidation," which itself contains the substring "valid" —
        // exactly the same reason 0.8.163's/0.8.164's own architecture
        // tests already exclude it.
        const forbidden = ['current', 'latest', 'stale', 'superseded', 'resolved', 'pending', 'reverted', 'corrected', 'authoritative', 'preferred', 'trust', 'confidence'];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `60. this file's own code never carries "${term}"`);
        }
        // The result's own top-level and entry-level keys carry no
        // state-machine vocabulary either.
        const forbiddenKeys = ['current', 'latest', 'stale', 'superseded', 'resolved', 'pending', 'reverted', 'corrected', 'valid', 'invalid'];
        for (const term of forbiddenKeys) {
            assert(!topKeys.includes(term) && !entryKeys.includes(term), `61. the result never carries a state-machine field named "${term}"`);
        }
    }
    console.log('✓ Section L: zero imports, no state-machine vocabulary anywhere in code or result shape, and no manufactured "observed" field');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimelineView tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimelineView.test.js FAILED:', error);
    process.exitCode = 1;
});
