import { describePublisherLeaderboardSnapshot } from '../application/PublisherLeaderboardSnapshot.js';
import { describePublisherLeaderboardSnapshotFingerprint } from '../application/PublisherLeaderboardSnapshotFingerprint.js';
import { LeaderboardClaimRecord } from '../application/LeaderboardClaimRecord.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationPlan } from '../application/PublisherLeaderboardClaimSnapshotReconciliationPlanView.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationDecision } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecision.js';
import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionView.js';
import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { PublisherLeaderboardSnapshotClaim } from '../core/PublisherLeaderboardSnapshotClaim.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.8.154 — Reconciliation Candidate Decision Evolution Projection.
//
// Section A: empty history — zero counts, empty candidateEvolutions
// Section B: a single decision — one candidate evolution, correctly shaped
// Section C: candidate deduplication — many decisions, one candidate
// Section D: decision multiplicity — an identical decision recorded twice
//            remains twice within the same candidate's own sequence
// Section E: chronological ordering within a candidate, decisionIndex
//            tie-break for equal decidedAt
// Section F: candidateEvolutions itself retains first-appearance order,
//            never re-sorted by decidedAt
// Section G: multiple candidate types, and candidate identity precision —
//            same claim/different snapshot is never the same candidate
// Section H: FLAGSHIP — the milestone's own worked example
// Section I: malformed input tolerance
// Section J: no mutation, frozen results, determinism
// Section K: reconstruct()'s archive-reading boundary, calling 0.8.153
//            exactly once
// Section L: vocabulary/import boundary — no rediscovery of 0.8.144 or
//            0.8.145, no interpretive vocabulary, imports only 0.8.153

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

// The identical four-scenario world 0.8.144/0.8.146/0.8.147/0.8.148/0.8.153's
// own tests already use: Claim B genuinely diverges against both S2 and S3,
// Claim C has no corresponding snapshot, Snapshot S4 has no corresponding
// claim.
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

function appendAll(decisions) {
    let history = [];
    for (const decision of decisions) {
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry(history, decision);
    }
    return history;
}

const T1 = new Date('2026-08-30T10:00:00Z');
const T2 = new Date('2026-08-30T10:03:00Z');
const T3 = new Date('2026-08-30T10:07:00Z');
const T4 = new Date('2026-08-30T10:09:00Z');

async function run() {
    // ---------------------------------------------------------------
    // Section A — empty history.
    // ---------------------------------------------------------------
    {
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution([]);
        assert(result.decisionCount === 0, '1. empty history reports decisionCount 0');
        assert(result.distinctCandidateCount === 0, '2. empty history reports distinctCandidateCount 0');
        assert(result.candidateEvolutions.length === 0, '3. empty history reports an empty candidateEvolutions array');
        assert(Object.isFrozen(result), '4. an empty result is frozen');
        assert(Object.isFrozen(result.candidateEvolutions), '5. an empty candidateEvolutions array is frozen');
    }
    console.log('✓ Section A: an empty history produces an empty evolution result');

    // ---------------------------------------------------------------
    // Section B — a single decision.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const c1 = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 };
        const D1 = decide(plan, c1, 'OBSERVE', T1);
        const history = appendAll([D1]);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution(history);
        assert(result.decisionCount === 1, '6. one decision reports decisionCount 1');
        assert(result.distinctCandidateCount === 1, '7. one decision reports distinctCandidateCount 1');
        const [evolution] = result.candidateEvolutions;
        assert(serialize(evolution.candidate) === serialize(D1.candidate), '8. candidate shape preserved unchanged, by value');
        assert(evolution.decisionCount === 1, '9. the candidate\'s own decisionCount is 1');
        assert(evolution.decisions.length === 1, '10. the candidate\'s own decisions list carries one entry');
        assert(evolution.decisions[0].decision === 'OBSERVE', '11. the sole decision entry carries the disposition');
        assert(evolution.decisions[0].decidedAt === T1.toISOString(), '12. the sole decision entry carries decidedAt');
        assert(serialize(Object.keys(evolution.decisions[0]).sort()) === serialize(['decision', 'decidedAt'].sort()), '13. a decision entry carries exactly decision and decidedAt, no candidate repeated on it');
    }
    console.log('✓ Section B: a single decision produces one correctly shaped candidate evolution');

    // ---------------------------------------------------------------
    // Section C — candidate deduplication: many decisions, one candidate.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const c1 = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 };
        const D1 = decide(plan, c1, 'OBSERVE', T1);
        const D2 = decide(plan, c1, 'DEFER', T2);
        const D3 = decide(plan, c1, 'OBSERVE', T3);
        const history = appendAll([D1, D2, D3]);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution(history);
        assert(result.decisionCount === 3, '14. three decisions against one candidate report decisionCount 3');
        assert(result.distinctCandidateCount === 1, '15. three decisions against one candidate report distinctCandidateCount 1');
        assert(result.candidateEvolutions.length === 1, '16. exactly one candidate evolution is produced');
        assert(result.candidateEvolutions[0].decisionCount === 3, '17. that one candidate\'s own decisionCount is 3');
        assert(result.candidateEvolutions[0].decisions.length === 3, '18. that one candidate\'s own decisions list carries three entries');
    }
    console.log('✓ Section C: many decisions against one candidate produce one candidate evolution carrying all of them');

    // ---------------------------------------------------------------
    // Section D — decision multiplicity: an identical decision recorded
    // twice remains twice.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const c1 = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 };
        const D1 = decide(plan, c1, 'OBSERVE', T1);
        const D2 = decide(plan, c1, 'OBSERVE', T1);
        assert(serialize(D1) === serialize(D2), '19. sanity — D1 and D2 are byte-identical decision records');
        const history = appendAll([D1, D2]);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution(history);
        assert(result.decisionCount === 2, '20. two byte-identical decisions still report decisionCount 2');
        assert(result.distinctCandidateCount === 1, '21. two byte-identical decisions against one candidate report distinctCandidateCount 1');
        assert(result.candidateEvolutions[0].decisionCount === 2, '22. the candidate\'s own decisionCount reflects both recorded decisions, never deduplicated');
        assert(result.candidateEvolutions[0].decisions.length === 2, '23. the candidate\'s own decisions list carries both entries, never collapsed to one');
    }
    console.log('✓ Section D: an identical decision recorded twice against the same candidate remains two entries in that candidate\'s own sequence');

    // ---------------------------------------------------------------
    // Section E — chronological ordering within a candidate, with
    // decisionIndex/history-position as the tie-break for equal decidedAt.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const c1 = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 };
        const D_LATE = decide(plan, c1, 'DEFER', T3);
        const D_EARLY = decide(plan, c1, 'OBSERVE', T1);
        const D_MID_A = decide(plan, c1, 'OBSERVE', T2);
        const D_MID_B = decide(plan, c1, 'DEFER', T2);

        // Appended out of chronological order; D_MID_A and D_MID_B share the
        // identical decidedAt (T2), so history position must decide their
        // relative order within the sorted sequence.
        const history = appendAll([D_LATE, D_MID_B, D_EARLY, D_MID_A]);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution(history);

        const [evolution] = result.candidateEvolutions;
        assert(evolution.decisions.length === 4, '24. all four decisions are present in the sorted sequence');
        assert(evolution.decisions[0].decidedAt === T1.toISOString(), '25. the earliest decidedAt sorts first');
        assert(evolution.decisions[1].decidedAt === T2.toISOString() && evolution.decisions[1].decision === 'DEFER', '26. of the two T2 decisions, D_MID_B (appended earlier, at history position 1) sorts before D_MID_A (position 3)');
        assert(evolution.decisions[2].decidedAt === T2.toISOString() && evolution.decisions[2].decision === 'OBSERVE', '27. D_MID_A follows D_MID_B, tie-broken by history position, not by disposition');
        assert(evolution.decisions[3].decidedAt === T3.toISOString(), '28. the latest decidedAt sorts last');
    }
    console.log('✓ Section E: decisions within one candidate are ordered by decidedAt ascending, with original history position as the tie-break for equal decidedAt');

    // ---------------------------------------------------------------
    // Section F — candidateEvolutions itself retains first-appearance
    // order, never re-sorted by decidedAt.
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const c1 = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 };
        const c2 = { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id };

        // c2's own decision is decided EARLIER (T1) than c1's own decision
        // (T3), but c1 appears FIRST in the supplied history.
        const D_C1 = decide(plan, c1, 'OBSERVE', T3);
        const D_C2 = decide(plan, c2, 'OBSERVE', T1);
        const history = appendAll([D_C1, D_C2]);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution(history);
        assert(result.candidateEvolutions.length === 2, '29. two candidate evolutions are produced');
        assert(result.candidateEvolutions[0].candidate.claimId === claimB.id, '30. candidateEvolutions retains first-appearance order (c1 first) despite c2 being decided earlier');
        assert(result.candidateEvolutions[1].candidate.claimId === claimC.id, '31. c2 appears second, matching history\'s own first-appearance order, never re-sorted by decidedAt');
    }
    console.log('✓ Section F: candidateEvolutions retains first-appearance order, never re-sorted by decidedAt across candidates');

    // ---------------------------------------------------------------
    // Section G — multiple candidate types, and candidate identity
    // precision: same claim/different snapshot is never the same
    // candidate.
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const D_S2 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'DEFER', T1);
        const D_S3 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 1 }, 'OBSERVE', T2);
        const D_CLAIM = decide(plan, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id }, 'DEFER', T3);
        const D_SNAPSHOT = decide(plan, { type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 2 }, 'OBSERVE', T4);

        const history = appendAll([D_S2, D_S3, D_CLAIM, D_SNAPSHOT]);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution(history);

        assert(result.distinctCandidateCount === 4, '32. same claim decided against two different snapshots, plus two other candidate shapes, produce four distinct candidates, never three');
        assert(result.candidateEvolutions.length === 4, '33. candidateEvolutions carries exactly four groups');

        const bySnapshotIndex0 = result.candidateEvolutions.find((e) => e.candidate.type === 'DIVERGENT_CORRESPONDENCE' && e.candidate.snapshotIndex === 0);
        const bySnapshotIndex1 = result.candidateEvolutions.find((e) => e.candidate.type === 'DIVERGENT_CORRESPONDENCE' && e.candidate.snapshotIndex === 1);
        assert(bySnapshotIndex0 && bySnapshotIndex0.decisions.length === 1 && bySnapshotIndex0.decisions[0].decision === 'DEFER', '34. claimB<->S2 carries its own single decision, distinct from claimB<->S3');
        assert(bySnapshotIndex1 && bySnapshotIndex1.decisions.length === 1 && bySnapshotIndex1.decisions[0].decision === 'OBSERVE', '35. claimB<->S3 carries its own single decision, distinct from claimB<->S2');

        const claimOnly = result.candidateEvolutions.find((e) => e.candidate.type === 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT');
        assert(claimOnly && !('snapshotIndex' in claimOnly.candidate), '36. CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT candidate carries no snapshotIndex field, exactly as 0.8.144 produced it');
        const snapshotOnly = result.candidateEvolutions.find((e) => e.candidate.type === 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM');
        assert(snapshotOnly && !('claimId' in snapshotOnly.candidate), '37. SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM candidate carries no claimId field, exactly as 0.8.144 produced it');
    }
    console.log('✓ Section G: all three candidate shapes are grouped independently, and the same claim against two different snapshots is never conflated into one candidate');

    // ---------------------------------------------------------------
    // Section H — FLAGSHIP: the milestone's own worked example.
    //   D1 = C1 + OBSERVE + T1
    //   D2 = C1 + DEFER   + T2
    //   D3 = C2 + OBSERVE + T3
    //   D4 = C1 + OBSERVE + T1   (exact duplicate of D1)
    //   D5 = C1 + OBSERVE + T4
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const c1 = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 };
        const c2 = { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id };

        const D1 = decide(plan, c1, 'OBSERVE', T1);
        const D2 = decide(plan, c1, 'DEFER', T2);
        const D3 = decide(plan, c2, 'OBSERVE', T3);
        const D4 = decide(plan, c1, 'OBSERVE', T1);
        const D5 = decide(plan, c1, 'OBSERVE', T4);
        assert(serialize(D1) === serialize(D4), '38. sanity — D1 and D4 are byte-identical decision records');

        const history = appendAll([D1, D2, D3, D4, D5]);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution(history);

        assert(result.decisionCount === 5, '39. FLAGSHIP — five history entries produce decisionCount 5');
        assert(result.distinctCandidateCount === 2, '40. FLAGSHIP — only two distinct candidates (C1, C2) exist across the five decisions');
        assert(result.candidateEvolutions.length === 2, '41. FLAGSHIP — candidateEvolutions carries exactly two groups');

        const [evolutionC1, evolutionC2] = result.candidateEvolutions;
        assert(serialize(evolutionC1.candidate) === serialize(D1.candidate), '42. FLAGSHIP — the first evolution group is C1, matching history\'s own first-appearance order');
        assert(evolutionC1.decisionCount === 4, '43. FLAGSHIP — C1 accumulated four decisions (D1, D2, D4, D5)');
        assert(evolutionC1.decisions.length === 4, '44. FLAGSHIP — C1\'s own decisions list carries four entries');
        assert(evolutionC1.decisions[0].decision === 'OBSERVE' && evolutionC1.decisions[0].decidedAt === T1.toISOString(), '45. FLAGSHIP — C1\'s first chronological decision is OBSERVE @ T1 (D1, ahead of the identical D4 by history position)');
        assert(evolutionC1.decisions[1].decision === 'OBSERVE' && evolutionC1.decisions[1].decidedAt === T1.toISOString(), '46. FLAGSHIP — C1\'s second chronological decision is the duplicate OBSERVE @ T1 (D4), tie-broken after D1 by history position');
        assert(evolutionC1.decisions[2].decision === 'DEFER' && evolutionC1.decisions[2].decidedAt === T2.toISOString(), '47. FLAGSHIP — C1\'s third chronological decision is DEFER @ T2 (D2)');
        assert(evolutionC1.decisions[3].decision === 'OBSERVE' && evolutionC1.decisions[3].decidedAt === T4.toISOString(), '48. FLAGSHIP — C1\'s fourth chronological decision is OBSERVE @ T4 (D5)');

        assert(serialize(evolutionC2.candidate) === serialize(D3.candidate), '49. FLAGSHIP — the second evolution group is C2');
        assert(evolutionC2.decisionCount === 1, '50. FLAGSHIP — C2 accumulated exactly one decision (D3)');
        assert(evolutionC2.decisions[0].decision === 'OBSERVE' && evolutionC2.decisions[0].decidedAt === T3.toISOString(), '51. FLAGSHIP — C2\'s sole decision is OBSERVE @ T3');
    }
    console.log('✓ Section H: FLAGSHIP — the milestone\'s own worked example demonstrates decision multiplicity, candidate deduplication, chronological ordering, repeated identical decisions, differing dispositions for one candidate, and first-appearance candidate ordering, all at once');

    // ---------------------------------------------------------------
    // Section I — malformed input tolerance.
    // ---------------------------------------------------------------
    {
        assert(describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution().decisionCount === 0, '52. calling with no arguments defaults to an empty result, never throws');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution(null).decisionCount === 0, '53. null history degrades to empty, never throws');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution(undefined).decisionCount === 0, '54. undefined history degrades to empty, never throws');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution('not an array').decisionCount === 0, '55. a non-array history degrades to empty, never throws');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution(42).decisionCount === 0, '56. a non-array, non-string history degrades to empty, never throws');

        const { plan, claimB } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const mixed = [null, undefined, 42, 'not a decision', {}, { decided: false, outcome: 'INVALID_SELECTION' }, { decided: 'true' }, { decided: true, candidate: { type: 'DIVERGENT_CORRESPONDENCE' }, decision: 'OBSERVE' }, D1];
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution(mixed);
        assert(result.decisionCount === 1, '57. non-genuine entries are silently excluded, leaving only the one genuine decision');
        assert(result.distinctCandidateCount === 1, '58. the sole surviving decision produces one candidate evolution');
    }
    console.log('✓ Section I: malformed/absent input degrades to a valid, empty result rather than throwing, and non-genuine entries are silently excluded');

    // ---------------------------------------------------------------
    // Section J — no mutation, frozen results, determinism.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const D2 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'DEFER', T2);
        const history = appendAll([D1, D2]);
        const historyJsonBefore = serialize(history);
        const decisionJsonBefore = serialize(D1);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution(history);

        assert(serialize(history) === historyJsonBefore, '59. the input history is never mutated');
        assert(serialize(D1) === decisionJsonBefore, '60. the original decision record is never mutated');
        assert(Object.isFrozen(result), '61. the result is frozen');
        assert(Object.isFrozen(result.candidateEvolutions), '62. candidateEvolutions is frozen');
        assert(Object.isFrozen(result.candidateEvolutions[0]), '63. each candidate evolution entry is itself frozen');
        assert(Object.isFrozen(result.candidateEvolutions[0].decisions), '64. each candidate evolution\'s own decisions array is frozen');
        assert(Object.isFrozen(result.candidateEvolutions[0].decisions[0]), '65. each decision entry is itself frozen');

        const again = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution(history);
        assert(serialize(again) === serialize(result), '66. repeated calls on an identical history are byte-identical');
    }
    console.log('✓ Section J: the input history and original decision records are never mutated, every returned object/array is frozen, and repeated computation is deterministic');

    // ---------------------------------------------------------------
    // Section K — reconstruct()'s archive-reading boundary, calling
    // 0.8.153 exactly once.
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const D2 = decide(plan, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id }, 'DEFER', T2);
        const history = appendAll([D1, D2]);

        const described = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution(history);

        let archive = PublicationObservationArchive.empty();
        archive = archive.appendReconciliationDecisionRecord(D1);
        archive = archive.appendReconciliationDecisionRecord(D2);
        const reconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution(archive);
        assert(serialize(reconstructed) === serialize(described), '67. reconstruct() over an archive holding the SAME decisions agrees exactly with describe() over the raw history');

        const emptyDescribed = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution([]);
        const emptyReconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution(PublicationObservationArchive.empty());
        assert(serialize(emptyReconstructed) === serialize(emptyDescribed), '68. reconstruct() over an empty archive agrees exactly with describe() over an empty history');

        const invalidArchiveReconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution(null);
        assert(serialize(invalidArchiveReconstructed) === serialize(emptyDescribed), '69. reconstruct() over an invalid/missing archive degrades to the empty-history result, never a throw');
    }
    console.log('✓ Section K: reconstruct() reads only the archive\'s own stored decision history, agreeing exactly with describe() over the equivalent raw history');

    // ---------------------------------------------------------------
    // Section L — vocabulary/import boundary: no rediscovery of 0.8.144 or
    // 0.8.145, no interpretive vocabulary, imports only 0.8.153.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution(appendAll([D1]));

        const topKeys = Object.keys(result).sort();
        assert(serialize(topKeys) === serialize(['decisionCount', 'distinctCandidateCount', 'candidateEvolutions'].sort()), '70. the result carries exactly the documented, factual top-level fields');

        const groupKeys = Object.keys(result.candidateEvolutions[0]).sort();
        assert(serialize(groupKeys) === serialize(['candidate', 'decisionCount', 'decisions'].sort()), '71. a candidate evolution entry carries exactly the documented, factual fields');

        const decisionKeys = Object.keys(result.candidateEvolutions[0].decisions[0]).sort();
        assert(serialize(decisionKeys) === serialize(['decision', 'decidedAt'].sort()), '72. a decision entry carries exactly decision and decidedAt — candidate identity is never repeated on it');

        const forbidden = ['resolved', 'unresolved', 'pending', 'superseded', 'active', 'stale', 'correct', 'incorrect', 'approved', 'rejected', 'unknown', 'changed', 'reversed', 'final', 'current', 'latest', 'preferred', 'conflicting', 'corrected'];
        for (const term of forbidden) {
            assert(!topKeys.includes(term) && !groupKeys.includes(term) && !decisionKeys.includes(term), `73. the result never carries state-machine vocabulary ('${term}')`);
        }

        const moduleSource = await (await import('node:fs/promises')).readFile(new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionView.js', import.meta.url), 'utf8');
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();
        const forbiddenInCode = ['resolved', 'unresolved', 'pending', 'superseded', 'active', 'stale', 'correct', 'incorrect', 'approved', 'rejected', 'repair', 'replace', 'accept', 'reject', 'merge', 'delete', 'apply', 'winner', 'execute', 'authoritative', 'trust', 'confidence', 'reputation', 'severity', 'changed', 'reversed', 'final', 'current', 'latest', 'preferred', 'conflicting', 'corrected'];
        for (const term of forbiddenInCode) {
            assert(!codeOnly.includes(term), `74. this file's own code never carries "${term}"`);
        }

        // This milestone must not re-derive candidate identity via 0.8.144
        // or read decision records via 0.8.146's own history module — this
        // file imports exactly ONE module: 0.8.153's own correspondence
        // projection, used by both describeXxx() and reconstructXxx().
        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        const importBlock = moduleSource.slice(0, moduleSource.indexOf('\n\n'));
        assert(importLines.length === 1, '75. this file imports from exactly one module');
        assert(importBlock.includes('PublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondenceView.js'), '76. the one import is 0.8.153\'s own correspondence projection, never 0.8.144\'s own candidate-selection boundary or any plan/discovery/history-storage module');
        assert(!codeOnly.includes('reconciliationplanview') && !codeOnly.includes('describepublisherleaderboardclaimsnapshotreconciliationcandidate(') && !codeOnly.includes('decisionhistoryview') && !codeOnly.includes('decisionhistory.js'), '77. this file never calls 0.8.144\'s own candidate-selection function and never imports 0.8.146\'s own decision-history storage module');
    }
    console.log('✓ Section L: the result carries no state-machine or interpretive vocabulary, and the module imports only 0.8.153\'s own correspondence projection, never rediscovering candidate identity itself');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionView tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionView.test.js FAILED:', error);
    process.exitCode = 1;
});
