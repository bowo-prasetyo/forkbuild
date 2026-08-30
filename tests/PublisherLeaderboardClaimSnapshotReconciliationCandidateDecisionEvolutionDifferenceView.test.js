import { describePublisherLeaderboardSnapshot } from '../application/PublisherLeaderboardSnapshot.js';
import { describePublisherLeaderboardSnapshotFingerprint } from '../application/PublisherLeaderboardSnapshotFingerprint.js';
import { LeaderboardClaimRecord } from '../application/LeaderboardClaimRecord.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationPlan } from '../application/PublisherLeaderboardClaimSnapshotReconciliationPlanView.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationDecision } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecision.js';
import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionDifference,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionDifference
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionDifferenceView.js';
import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { PublisherLeaderboardSnapshotClaim } from '../core/PublisherLeaderboardSnapshotClaim.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.8.155 — Reconciliation Candidate Decision Evolution Difference
// Projection.
//
// Section A: empty vs empty — no difference
// Section B: converged histories — structurally identical decisions on
//            both sides report zero exclusive decisions/candidates
// Section C: FLAGSHIP — the milestone's own worked Alice/Bob example
// Section D: multiplicity — [D1, D1, D2] vs [D1, D2] reports exactly one
//            exclusive D1, grouped under one candidate evolution
// Section E: same candidate, different decisions remain two distinct
//            decision events, each attributed to the correct side
// Section F: same candidate, same decision, different timestamp remain
//            distinct decision events
// Section G: different candidate types never collide merely because they
//            happen to share a numeric/string field
// Section H: local duplicates are never normalized or removed
// Section I: no mutation, frozen results, determinism
// Section J: reconstruct()'s archive-reading boundary, calling 0.8.149
//            exactly once
// Section K: malformed input tolerance
// Section L: vocabulary/import boundary — no reconciliation action, no
//            conflict/superseded vocabulary, imports only 0.8.149/0.8.154

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

function makePolicy(version) {
    return Object.freeze({
        version,
        criteria: Object.freeze([Object.freeze({ field: 'achievementCount', order: 'DESCENDING' })]),
        tieBreak: Object.freeze({ field: 'publisherIdentity.publisherId', order: 'ASCENDING' })
    });
}

function makeEntry(rank, publisherIdentity, achievementCount) {
    return Object.freeze({ rank, publisherIdentity, achievementCount, distinctAchievementKindCount: 1, publicationIdentityCount: 1 });
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

const E2 = '2'.repeat(64);
const E3 = '3'.repeat(64);
const E4 = '4'.repeat(64);
const E_WRONG = '9'.repeat(64);
const BOB = new PublisherIdentityRecord({ publisherId: 'Bob' });
const DIANA = new PublisherIdentityRecord({ publisherId: 'Diana' });

function signedClaim(identityProvider, { evidenceFingerprint, policyVersion, snapshotFingerprint, createdAt = new Date('2026-08-30T00:00:00Z') }) {
    const signerIdentityId = resolveSigningIdentityId(identityProvider);
    let claim = new PublisherLeaderboardSnapshotClaim({ evidenceFingerprint, policyVersion, snapshotFingerprint, signerIdentityId, createdAt });
    const signature = identityProvider.signCanonical(claim.getSigningDescriptor());
    return claim.withSignature(signature);
}

function recordFor(claim, receivedAt = new Date('2026-08-30T04:00:00Z')) {
    return new LeaderboardClaimRecord({ claim, receivedAt });
}

// The identical four-scenario world 0.8.144/0.8.149/0.8.153/0.8.154's own
// tests already use: Claim B genuinely diverges against both S2 and S3,
// Claim C has no corresponding snapshot, Snapshot S4 (index 2) has no
// corresponding claim. Both replicas reconcile against this SAME plan —
// this file is about comparing two replicas' own DECISION histories, never
// about two different plans.
function buildWorld() {
    const bob = makeIdentity('Bob');
    const carl = makeIdentity('Carl');

    const s2 = snapshotOf(E2, makeLeaderboard(makePolicy(2), [makeEntry(1, BOB, 5)]));
    const s3 = snapshotOf(E2, makeLeaderboard(makePolicy(2), [makeEntry(1, BOB, 5)]));
    const s4 = snapshotOf(E4, makeLeaderboard(makePolicy(4), [makeEntry(1, DIANA, 9)]));
    const snapshots = [s2, s3, s4];

    const claimB = signedClaim(bob, { evidenceFingerprint: E_WRONG, policyVersion: 2, snapshotFingerprint: fingerprintOf(s2) });
    const claimC = signedClaim(carl, { evidenceFingerprint: E3, policyVersion: 1, snapshotFingerprint: 'f'.repeat(64) });

    const claimHistory = [recordFor(claimB), recordFor(claimC)];
    const verifier = new LocalAuthorizationVerifier();
    const plan = describePublisherLeaderboardClaimSnapshotReconciliationPlan(claimHistory, snapshots, verifier);

    return { plan, claimB, claimC };
}

function decide(plan, selection, disposition, decidedAt) {
    return describePublisherLeaderboardClaimSnapshotReconciliationDecision(plan, selection, disposition, decidedAt);
}

function historyOf(...decisions) {
    let history = [];
    for (const decision of decisions) {
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry(history, decision);
    }
    return history;
}

const T1 = new Date('2026-08-30T06:00:00Z');
const T2 = new Date('2026-08-30T06:03:00Z');
const T3 = new Date('2026-08-30T06:07:00Z');
const T4 = new Date('2026-08-30T06:09:00Z');
const T5 = new Date('2026-08-30T06:11:00Z');

async function run() {
    // ---------------------------------------------------------------
    // Section A — empty vs empty.
    // ---------------------------------------------------------------
    {
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionDifference([], []);
        assert(result.sameHistory === true, '1. two empty histories report sameHistory');
        assert(result.sourceDecisionCount === 0 && result.targetDecisionCount === 0, '2. two empty histories report zero decision counts on each side');
        assert(result.sourceOnlyDecisionCount === 0 && result.targetOnlyDecisionCount === 0, '3. two empty histories report zero exclusive decision counts');
        assert(result.sourceOnly.length === 0 && result.targetOnly.length === 0, '4. sourceOnly/targetOnly are empty arrays');
        assert(result.sourceOnlyDistinctCandidateCount === 0 && result.targetOnlyDistinctCandidateCount === 0, '5. zero exclusive candidates on either side');
        assert(result.sourceOnlyCandidateEvolutions.length === 0 && result.targetOnlyCandidateEvolutions.length === 0, '6. sourceOnlyCandidateEvolutions/targetOnlyCandidateEvolutions are empty arrays');
        assert(Object.isFrozen(result), '7. an empty result is frozen');
    }
    console.log('✓ Section A: two empty histories produce an empty, converged evolution difference');

    // ---------------------------------------------------------------
    // Section B — converged histories: structurally identical decisions on
    // both sides.
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const c1 = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 };
        const c2 = { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id };

        const sourceHistory = historyOf(decide(plan, c1, 'OBSERVE', T1), decide(plan, c2, 'DEFER', T2));
        const targetHistory = historyOf(decide(plan, c1, 'OBSERVE', T1), decide(plan, c2, 'DEFER', T2));

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionDifference(sourceHistory, targetHistory);
        assert(result.sameHistory === true, '8. two independently computed but structurally identical histories converge');
        assert(result.sourceDecisionCount === 2 && result.targetDecisionCount === 2, '9. each side\'s own raw decision count is still reported');
        assert(result.sourceOnlyDecisionCount === 0 && result.targetOnlyDecisionCount === 0, '10. no exclusive decisions on either side');
        assert(result.sourceOnlyCandidateEvolutions.length === 0 && result.targetOnlyCandidateEvolutions.length === 0, '11. no exclusive candidate evolutions on either side');
    }
    console.log('✓ Section B: converged histories report zero exclusive decisions and zero exclusive candidate evolutions');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP: the milestone's own worked example.
    //
    //   Alice: C1/OBSERVE/T1, C1/DEFER/T2, C2/OBSERVE/T3
    //   Bob:   C1/OBSERVE/T1, C1/DEFER/T4, C2/OBSERVE/T3, C3/DEFER/T5
    //
    //   Alice-exclusive: C1/DEFER/T2
    //   Bob-exclusive:   C1/DEFER/T4, C3/DEFER/T5
    //
    //   C1 exists on both sides, but each replica has a DIFFERENT historical
    //   decision concerning C1 — this is the fact this milestone exists to
    //   make observable.
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const c1 = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 };
        const c2 = { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id };
        const c3 = { type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 2 };

        const c1ObserveT1 = decide(plan, c1, 'OBSERVE', T1);
        const c1DeferT2 = decide(plan, c1, 'DEFER', T2);
        const c2ObserveT3 = decide(plan, c2, 'OBSERVE', T3);
        const c1DeferT4 = decide(plan, c1, 'DEFER', T4);
        const c3DeferT5 = decide(plan, c3, 'DEFER', T5);

        const aliceHistory = historyOf(c1ObserveT1, c1DeferT2, c2ObserveT3);
        const bobHistory = historyOf(c1ObserveT1, c1DeferT4, c2ObserveT3, c3DeferT5);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionDifference(aliceHistory, bobHistory);

        assert(result.sameHistory === false, '12. FLAGSHIP — Alice and Bob genuinely differ');
        assert(result.sourceDecisionCount === 3 && result.targetDecisionCount === 4, '13. FLAGSHIP — raw decision counts on each side');
        assert(result.sourceOnlyDecisionCount === 1 && result.targetOnlyDecisionCount === 2, '14. FLAGSHIP — exactly one Alice-exclusive decision, two Bob-exclusive decisions');
        assert(result.sourceOnly.length === 1 && result.sourceOnly[0] === c1DeferT2, '15. FLAGSHIP — Alice-exclusive is exactly [C1/DEFER/T2], the original record');
        assert(result.targetOnly.length === 2 && result.targetOnly[0] === c1DeferT4 && result.targetOnly[1] === c3DeferT5, '16. FLAGSHIP — Bob-exclusive is exactly [C1/DEFER/T4, C3/DEFER/T5], in Bob\'s own order');

        // The genuinely shared C1/OBSERVE/T1 and C2/OBSERVE/T3 cancel out —
        // neither appears in either exclusive list or either exclusive
        // candidate evolution.
        assert(!result.sourceOnly.includes(c1ObserveT1) && !result.targetOnly.includes(c1ObserveT1), '17. FLAGSHIP — the shared C1/OBSERVE/T1 appears in neither exclusive list');
        assert(!result.sourceOnly.includes(c2ObserveT3) && !result.targetOnly.includes(c2ObserveT3), '18. FLAGSHIP — the shared C2/OBSERVE/T3 appears in neither exclusive list, and C2 never appears in either candidate evolution grouping at all');

        // sourceOnlyCandidateEvolutions: exactly one group, C1, carrying its
        // one exclusive decision.
        assert(result.sourceOnlyDistinctCandidateCount === 1, '19. FLAGSHIP — Alice-exclusive decisions concern exactly one distinct candidate (C1)');
        assert(result.sourceOnlyCandidateEvolutions.length === 1, '20. FLAGSHIP — sourceOnlyCandidateEvolutions carries exactly one group');
        const aliceC1Evolution = result.sourceOnlyCandidateEvolutions[0];
        assert(serialize(aliceC1Evolution.candidate) === serialize(c1DeferT2.candidate), '21. FLAGSHIP — the sole Alice-exclusive group is C1');
        assert(aliceC1Evolution.decisionCount === 1 && aliceC1Evolution.decisions[0].decision === 'DEFER' && aliceC1Evolution.decisions[0].decidedAt === T2.toISOString(), '22. FLAGSHIP — C1\'s Alice-exclusive evolution carries exactly DEFER @ T2, never the shared OBSERVE @ T1');

        // targetOnlyCandidateEvolutions: two groups, C1 (carrying its one
        // exclusive decision, DEFER @ T4 — never merged with Alice's own
        // exclusive DEFER @ T2) and C3.
        assert(result.targetOnlyDistinctCandidateCount === 2, '23. FLAGSHIP — Bob-exclusive decisions concern exactly two distinct candidates (C1, C3)');
        assert(result.targetOnlyCandidateEvolutions.length === 2, '24. FLAGSHIP — targetOnlyCandidateEvolutions carries exactly two groups');
        const [bobC1Evolution, bobC3Evolution] = result.targetOnlyCandidateEvolutions;
        assert(serialize(bobC1Evolution.candidate) === serialize(c1DeferT4.candidate), '25. FLAGSHIP — the first Bob-exclusive group is C1, matching Bob\'s own first-appearance order among his exclusive decisions');
        assert(bobC1Evolution.decisionCount === 1 && bobC1Evolution.decisions[0].decision === 'DEFER' && bobC1Evolution.decisions[0].decidedAt === T4.toISOString(), '26. FLAGSHIP — C1\'s Bob-exclusive evolution carries exactly DEFER @ T4');
        assert(serialize(bobC3Evolution.candidate) === serialize(c3DeferT5.candidate), '27. FLAGSHIP — the second Bob-exclusive group is C3');
        assert(bobC3Evolution.decisionCount === 1 && bobC3Evolution.decisions[0].decision === 'DEFER' && bobC3Evolution.decisions[0].decidedAt === T5.toISOString(), '28. FLAGSHIP — C3\'s Bob-exclusive evolution carries exactly DEFER @ T5');

        // The crucial observation: C1 appears in BOTH sourceOnlyCandidateEvolutions
        // and targetOnlyCandidateEvolutions, each with its own, different,
        // exclusive decision — never merged, never compared, never one
        // declared to supersede the other.
        assert(aliceC1Evolution.decisions[0].decidedAt !== bobC1Evolution.decisions[0].decidedAt, '29. FLAGSHIP — C1\'s two exclusive evolutions, one per side, carry genuinely different decisions, each attributed only to its own side');
    }
    console.log('✓ Section C: FLAGSHIP — the milestone\'s own worked Alice/Bob example proves a candidate (C1) can exist on both replicas while each still holds decisions about it that are exclusive to itself');

    // ---------------------------------------------------------------
    // Section D — multiplicity.
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const c1 = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 };
        const c2 = { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id };
        const D1 = decide(plan, c1, 'OBSERVE', T1);
        const D2 = decide(plan, c2, 'DEFER', T2);

        // Alice: [D1, D1, D2] — D1 recorded twice. Bob: [D1, D2].
        const aliceHistory = [D1, D1, D2];
        const bobHistory = [D1, D2];

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionDifference(aliceHistory, bobHistory);
        assert(result.sourceOnlyDecisionCount === 1, '30. [D1, D1, D2] vs [D1, D2] reports exactly ONE exclusive D1, never zero or two');
        assert(result.sourceOnly.length === 1 && result.sourceOnly[0] === D1, '31. the one exclusive decision is D1 itself');
        assert(result.targetOnlyDecisionCount === 0, '32. Bob has no exclusive decisions — his single D1 and D2 both matched');

        assert(result.sourceOnlyCandidateEvolutions.length === 1, '33. the one exclusive D1 produces exactly one candidate evolution group');
        assert(result.sourceOnlyCandidateEvolutions[0].decisionCount === 1, '34. that group carries exactly one decision — the multiplicity is not doubled by grouping');
        assert(result.targetOnlyCandidateEvolutions.length === 0, '35. Bob\'s empty exclusive-decision set produces zero candidate evolution groups');
    }
    console.log('✓ Section D: multiplicity is preserved through the decision-level diff before grouping — [D1, D1, D2] vs [D1, D2] yields exactly one exclusive decision under one candidate group');

    // ---------------------------------------------------------------
    // Section E — same candidate, different decisions remain two distinct
    // decision events, each attributed to the correct exclusive side.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const c1 = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 };
        const aliceDecision = decide(plan, c1, 'OBSERVE', T1);
        const bobDecision = decide(plan, c1, 'DEFER', T1);
        assert(serialize(aliceDecision.candidate) === serialize(bobDecision.candidate), '36. sanity — both decisions concern the identical candidate');

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionDifference(historyOf(aliceDecision), historyOf(bobDecision));
        assert(result.sameHistory === false, '37. the same candidate decided differently on each side is a genuine difference');
        assert(result.sourceOnly.length === 1 && result.sourceOnly[0] === aliceDecision, '38. Alice\'s OBSERVE is reported as source-only');
        assert(result.targetOnly.length === 1 && result.targetOnly[0] === bobDecision, '39. Bob\'s DEFER is reported as target-only — candidate identity never masks the disagreement');
        assert(result.sourceOnlyCandidateEvolutions.length === 1 && result.sourceOnlyCandidateEvolutions[0].decisions[0].decision === 'OBSERVE', '40. Alice\'s exclusive candidate evolution for C1 carries her own OBSERVE, never Bob\'s DEFER');
        assert(result.targetOnlyCandidateEvolutions.length === 1 && result.targetOnlyCandidateEvolutions[0].decisions[0].decision === 'DEFER', '41. Bob\'s exclusive candidate evolution for C1 carries his own DEFER, never Alice\'s OBSERVE');
    }
    console.log('✓ Section E: the same candidate decided OBSERVE on one replica and DEFER on the other remains two distinct decision events, each correctly attributed to its own exclusive side');

    // ---------------------------------------------------------------
    // Section F — same candidate, same decision, different timestamp.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const c1 = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 };
        const early = decide(plan, c1, 'OBSERVE', T1);
        const late = decide(plan, c1, 'OBSERVE', T2);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionDifference(historyOf(early), historyOf(late));
        assert(result.sameHistory === false, '42. same candidate, same disposition, different decidedAt is a genuine difference');
        assert(result.sourceOnly[0] === early && result.targetOnly[0] === late, '43. neither cancels the other');
        assert(result.sourceOnlyCandidateEvolutions[0].decisions[0].decidedAt === T1.toISOString(), '44. Alice\'s exclusive evolution carries her own decidedAt');
        assert(result.targetOnlyCandidateEvolutions[0].decisions[0].decidedAt === T2.toISOString(), '45. Bob\'s exclusive evolution carries his own decidedAt');
    }
    console.log('✓ Section F: the same candidate under the same disposition but a different decidedAt remains two distinct decision events');

    // ---------------------------------------------------------------
    // Section G — different candidate types never collide merely because
    // they share a numeric/string field.
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        // Three genuinely distinct candidates from the SAME plan, chosen so
        // that DIVERGENT_CORRESPONDENCE's own snapshotIndex (0) is a
        // completely different candidate from SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM's
        // own snapshotIndex (2) — proving the grouping key never collapses
        // two candidates of different types (or the same type, different
        // index/id) merely because both carry a snapshotIndex/claimId field.
        const claimOnly = { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id };
        const snapshotOnly = { type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 2 };
        const divergent = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 };

        const dClaimOnly = decide(plan, claimOnly, 'OBSERVE', T1);
        const dSnapshotOnly = decide(plan, snapshotOnly, 'OBSERVE', T1);
        const dDivergent = decide(plan, divergent, 'OBSERVE', T1);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionDifference(
            historyOf(dClaimOnly, dSnapshotOnly, dDivergent),
            []
        );

        assert(result.sourceOnlyDecisionCount === 3, '46. all three differently typed decisions are reported as exclusive');
        assert(result.sourceOnlyDistinctCandidateCount === 3, '47. all three are distinct candidates, never collapsed by a shared numeric/string field across types');
        assert(result.sourceOnlyCandidateEvolutions.length === 3, '48. three separate candidate evolution groups are produced');

        const claimGroup = result.sourceOnlyCandidateEvolutions.find((e) => e.candidate.type === 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT');
        const snapshotGroup = result.sourceOnlyCandidateEvolutions.find((e) => e.candidate.type === 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM');
        const divergentGroup = result.sourceOnlyCandidateEvolutions.find((e) => e.candidate.type === 'DIVERGENT_CORRESPONDENCE');
        assert(claimGroup && claimGroup.decisionCount === 1, '49. CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT is its own independent group');
        assert(snapshotGroup && snapshotGroup.decisionCount === 1, '50. SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM is its own independent group, never merged with the claim-only group');
        assert(divergentGroup && divergentGroup.decisionCount === 1, '51. DIVERGENT_CORRESPONDENCE (claimB, snapshotIndex 0) is its own independent group, never merged with SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM (snapshotIndex 2) or CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT merely by sharing a snapshotIndex/claimId field shape');
    }
    console.log('✓ Section G: CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT, SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM, and DIVERGENT_CORRESPONDENCE never collide merely because they happen to share a numeric/string field');

    // ---------------------------------------------------------------
    // Section H — local duplicates are never normalized or removed.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const c1 = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 };
        const D1 = decide(plan, c1, 'OBSERVE', T1);

        // Alice's OWN history already holds D1 twice before any comparison —
        // both copies remain exclusive (Bob has none at all), and grouping
        // must carry both into C1's own evolution, never deduplicating them.
        const aliceHistory = [D1, D1];
        const bobHistory = [];

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionDifference(aliceHistory, bobHistory);
        assert(result.sourceOnlyDecisionCount === 2, '52. both of Alice\'s own local duplicate decisions remain exclusive, never collapsed to one');
        assert(result.sourceOnly.length === 2 && result.sourceOnly[0] === D1 && result.sourceOnly[1] === D1, '53. sourceOnly carries both duplicate entries');
        assert(result.sourceOnlyCandidateEvolutions.length === 1, '54. both duplicates concern the same candidate, so exactly one candidate evolution group is produced');
        assert(result.sourceOnlyCandidateEvolutions[0].decisionCount === 2, '55. that one group\'s own decisionCount is 2 — the local duplicate is preserved through grouping, never normalized away');
        assert(result.sourceOnlyCandidateEvolutions[0].decisions.length === 2, '56. that one group\'s own decisions list carries both entries');
    }
    console.log('✓ Section H: pre-existing local duplicates within one side\'s own history are never normalized or removed by this projection');

    // ---------------------------------------------------------------
    // Section I — no mutation, frozen results, determinism.
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const D2 = decide(plan, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id }, 'DEFER', T2);
        const sourceHistory = [D1];
        const targetHistory = [D2];
        const sourceJsonBefore = serialize(sourceHistory);
        const targetJsonBefore = serialize(targetHistory);
        const d1JsonBefore = serialize(D1);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionDifference(sourceHistory, targetHistory);

        assert(serialize(sourceHistory) === sourceJsonBefore, '57. the source history is never mutated');
        assert(serialize(targetHistory) === targetJsonBefore, '58. the target history is never mutated');
        assert(serialize(D1) === d1JsonBefore, '59. the original decision record is never mutated');
        assert(result.sourceOnly[0] === D1, '60. sourceOnly holds the ORIGINAL decision object, never a reconstructed copy');

        assert(Object.isFrozen(result), '61. the result is frozen');
        assert(Object.isFrozen(result.sourceOnly), '62. sourceOnly is frozen');
        assert(Object.isFrozen(result.targetOnly), '63. targetOnly is frozen');
        assert(Object.isFrozen(result.sourceOnlyCandidateEvolutions), '64. sourceOnlyCandidateEvolutions is frozen');
        assert(Object.isFrozen(result.sourceOnlyCandidateEvolutions[0]), '65. each source-only candidate evolution entry is itself frozen');

        const again = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionDifference(sourceHistory, targetHistory);
        assert(serialize(again) === serialize(result), '66. repeated calls on identical inputs are byte-identical');
    }
    console.log('✓ Section I: neither input history nor any original decision record is mutated, every returned object/array is frozen, and repeated computation is deterministic');

    // ---------------------------------------------------------------
    // Section J — reconstruct()'s archive-reading boundary, calling 0.8.149
    // exactly once.
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const c1 = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 };
        const c2 = { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id };
        const D1 = decide(plan, c1, 'OBSERVE', T1);
        const D2 = decide(plan, c1, 'DEFER', T2);
        const D3 = decide(plan, c2, 'OBSERVE', T3);

        const aliceHistory = historyOf(D1, D2);
        const bobHistory = historyOf(D1, D3);
        const described = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionDifference(aliceHistory, bobHistory);

        let aliceArchive = PublicationObservationArchive.empty();
        aliceArchive = aliceArchive.appendReconciliationDecisionRecord(D1);
        aliceArchive = aliceArchive.appendReconciliationDecisionRecord(D2);
        let bobArchive = PublicationObservationArchive.empty();
        bobArchive = bobArchive.appendReconciliationDecisionRecord(D1);
        bobArchive = bobArchive.appendReconciliationDecisionRecord(D3);

        const reconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionDifference(aliceArchive, bobArchive);
        assert(serialize(reconstructed) === serialize(described), '67. reconstruct() over archives holding the SAME decisions agrees exactly with describe() over the equivalent raw histories');

        const emptyDescribed = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionDifference([], []);
        const emptyReconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionDifference(PublicationObservationArchive.empty(), PublicationObservationArchive.empty());
        assert(serialize(emptyReconstructed) === serialize(emptyDescribed), '68. reconstruct() over two empty archives agrees exactly with describe() over two empty histories');

        const invalidReconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionDifference(null, undefined);
        assert(serialize(invalidReconstructed) === serialize(emptyDescribed), '69. reconstruct() over invalid/missing archives degrades to the empty-history result, never a throw');
    }
    console.log('✓ Section J: reconstruct() reads only each archive\'s own stored decision history, agreeing exactly with describe() over the equivalent raw histories');

    // ---------------------------------------------------------------
    // Section K — malformed input tolerance.
    // ---------------------------------------------------------------
    {
        assert(describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionDifference().sameHistory === true, '70. calling with no arguments defaults to two empty histories, never throws');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionDifference(null, undefined).sameHistory === true, '71. null/undefined histories degrade to empty, never throw');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionDifference('not an array', 42).sameHistory === true, '72. malformed non-array histories degrade to empty, never throw');

        const { plan, claimB } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const mixed = [null, undefined, 42, 'not a decision', {}, { decided: false, outcome: 'INVALID_SELECTION' }, { decided: 'true' }, D1];
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionDifference(mixed, []);
        assert(result.sourceDecisionCount === 1 && result.sourceOnly[0] === D1, '73. non-genuine entries are silently excluded, leaving only the one genuine decision');
        assert(result.sourceOnlyCandidateEvolutions.length === 1, '74. the sole surviving decision still produces one candidate evolution group');
    }
    console.log('✓ Section K: malformed/absent input degrades to a valid, empty/converged result rather than throwing, and non-genuine entries are silently excluded');

    // ---------------------------------------------------------------
    // Section L — vocabulary/import boundary.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionDifference(historyOf(D1), []);

        const topKeys = Object.keys(result).sort();
        const expectedKeys = [
            'sourceDecisionCount', 'targetDecisionCount',
            'sourceOnlyDecisionCount', 'targetOnlyDecisionCount',
            'sourceOnly', 'targetOnly',
            'sourceOnlyDistinctCandidateCount', 'targetOnlyDistinctCandidateCount',
            'sourceOnlyCandidateEvolutions', 'targetOnlyCandidateEvolutions',
            'sameHistory'
        ].sort();
        assert(serialize(topKeys) === serialize(expectedKeys), '75. the result carries exactly the documented, factual top-level fields');

        const groupKeys = Object.keys(result.sourceOnlyCandidateEvolutions[0]).sort();
        assert(serialize(groupKeys) === serialize(['candidate', 'decisionCount', 'decisions'].sort()), '76. a candidate evolution entry carries exactly the documented, factual fields');

        const forbidden = ['inconsistent', 'superseded', 'preferred', 'authoritative', 'resolved', 'conflicting', 'valid', 'trusted', 'trust', 'confidence', 'score', 'reputation', 'rank', 'winner', 'correct', 'incorrect'];
        for (const term of forbidden) {
            assert(!topKeys.includes(term) && !groupKeys.includes(term), `77. the result never carries interpretive/conflict vocabulary ('${term}')`);
        }

        const moduleSource = await (await import('node:fs/promises')).readFile(new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionDifferenceView.js', import.meta.url), 'utf8');
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();
        const forbiddenInCode = ['inconsistent', 'superseded', 'preferred', 'authoritative', 'resolved', 'conflicting', 'repair', 'replace', 'accept', 'reject', 'merge', 'delete', 'apply', 'winner', 'execute', 'trust', 'confidence', 'reputation', 'severity', 'signature', 'verify'];
        for (const term of forbiddenInCode) {
            assert(!codeOnly.includes(term), `78. this file's own code never carries "${term}"`);
        }

        // This milestone must import only 0.8.149 (the decision-level
        // difference) and 0.8.154 (the candidate grouping) — nothing from
        // 0.8.144 through 0.8.148, 0.8.150 through 0.8.153.
        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.length === 2, '79. this file imports from exactly two modules');
        const importBlock = moduleSource.slice(0, moduleSource.indexOf('function describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionDifference'));
        assert(importBlock.includes('PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference.js'), '80. one import is 0.8.149\'s own decision history difference module');
        assert(importBlock.includes('PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionView.js'), '81. the other import is 0.8.154\'s own candidate decision evolution module');
        assert(!codeOnly.includes('decisioncandidatecorrespondenceview') && !codeOnly.includes('reconciliationplanview') && !codeOnly.includes('reconciliationdecision.js') && !codeOnly.includes('decisionhistory.js') && !codeOnly.includes('decisionhistoryview') && !codeOnly.includes('decisionhistoryexchange') && !codeOnly.includes('decisionhistorysynchronization'), '82. this file never imports 0.8.144/0.8.145/0.8.146/0.8.150/0.8.151/0.8.152/0.8.153 directly');
    }
    console.log('✓ Section L: the result carries no interpretive or conflict-resolution vocabulary, and the module imports only 0.8.149\'s decision-level difference and 0.8.154\'s candidate grouping, nothing else from the reconciliation family');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionDifferenceView tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionDifferenceView.test.js FAILED:', error);
    process.exitCode = 1;
});
