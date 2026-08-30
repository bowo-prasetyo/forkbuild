import { describePublisherLeaderboardSnapshot } from '../application/PublisherLeaderboardSnapshot.js';
import { describePublisherLeaderboardSnapshotFingerprint } from '../application/PublisherLeaderboardSnapshotFingerprint.js';
import { LeaderboardClaimRecord } from '../application/LeaderboardClaimRecord.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationPlan } from '../application/PublisherLeaderboardClaimSnapshotReconciliationPlanView.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationDecision } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecision.js';
import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatisticsView.js';
import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { PublisherLeaderboardSnapshotClaim } from '../core/PublisherLeaderboardSnapshotClaim.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.8.147 — Reconciliation Decision History Statistics Projection.
//
// Section A: empty history — every count zero, every array empty
// Section B: a single decision — basic counts
// Section C: decision multiplicity — the SAME candidate decided (byte-
//            identically) twice reports decisionCount=2,
//            distinctCandidateCount=1
// Section D: FLAGSHIP #1 — candidate identity vs. decision identity: the
//            SAME candidate (B<->S2) decided OBSERVE, then DEFER, reports
//            distinctCandidateCount=1, observeCount=1, deferCount=1
// Section E: candidate-type distinction — a CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT
//            and a SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM are never conflated
//            into one candidate even when both happen to be the "first" of
//            their kind
// Section F: FLAGSHIP #2 — the worked example from the milestone request:
//            OBSERVE(B,S2), DEFER(B,S3), OBSERVE(C), DEFER(S4), plus a
//            repeat of OBSERVE(B,S2)
// Section G: malformed input tolerance
// Section H: no mutation, frozen results
// Section I: determinism, and reconstruct()'s thin, archive-independent
//            boundary
// Section J: vocabulary boundary — no interpreted-state/action/execution
//            vocabulary anywhere

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

// Builds the identical four-scenario world 0.8.144/0.8.146's own tests
// already use: Claim B genuinely diverges against both S2 and S3, Claim C
// has no corresponding snapshot, Snapshot S4 has no corresponding claim.
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

const DECIDED_AT_1 = new Date('2026-08-30T05:00:00Z');
const DECIDED_AT_2 = new Date('2026-08-30T05:05:00Z');

function countFor(counts, fieldName, value) {
    const found = counts.find((entry) => entry[fieldName] === value);
    return found ? found.count : 0;
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — empty history.
    // ---------------------------------------------------------------
    {
        const stats = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics([]);
        assert(stats.decisionCount === 0, '1. empty history reports decisionCount 0');
        assert(stats.distinctCandidateCount === 0, '2. empty history reports distinctCandidateCount 0');
        assert(stats.distinctClaimIdCount === 0, '3. empty history reports distinctClaimIdCount 0');
        assert(stats.distinctSnapshotIndexCount === 0, '4. empty history reports distinctSnapshotIndexCount 0');
        assert(stats.observeCount === 0, '5. empty history reports observeCount 0');
        assert(stats.deferCount === 0, '6. empty history reports deferCount 0');
        assert(stats.dispositionCounts.length === 0, '7. empty history reports empty dispositionCounts');
        assert(stats.candidateTypeCounts.length === 0, '8. empty history reports empty candidateTypeCounts');
    }
    console.log('✓ Section A: an empty history reports every count at zero and every array empty');

    // ---------------------------------------------------------------
    // Section B — a single decision.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', DECIDED_AT_1);
        let history = [];
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry(history, D1);

        const stats = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics(history);
        assert(stats.decisionCount === 1, '9. one decision reports decisionCount 1');
        assert(stats.distinctCandidateCount === 1, '10. one decision reports distinctCandidateCount 1');
        assert(stats.distinctClaimIdCount === 1, '11. one decision naming a claimId reports distinctClaimIdCount 1');
        assert(stats.distinctSnapshotIndexCount === 1, '12. one decision naming a snapshotIndex reports distinctSnapshotIndexCount 1');
        assert(stats.observeCount === 1 && stats.deferCount === 0, '13. one OBSERVE decision reports observeCount 1, deferCount 0');
        assert(stats.dispositionCounts.length === 1 && stats.dispositionCounts[0].disposition === 'OBSERVE' && stats.dispositionCounts[0].count === 1, '14. dispositionCounts names OBSERVE with count 1');
        assert(stats.candidateTypeCounts.length === 1 && stats.candidateTypeCounts[0].type === 'DIVERGENT_CORRESPONDENCE' && stats.candidateTypeCounts[0].count === 1, '15. candidateTypeCounts names DIVERGENT_CORRESPONDENCE with count 1');
    }
    console.log('✓ Section B: a single decision reports correct counts and count maps');

    // ---------------------------------------------------------------
    // Section C — decision multiplicity: same candidate, same disposition,
    // same timestamp, recorded twice.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const selection = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 };
        const D1 = decide(plan, selection, 'OBSERVE', DECIDED_AT_1);
        const D1_AGAIN = decide(plan, selection, 'OBSERVE', DECIDED_AT_1);
        assert(serialize(D1) === serialize(D1_AGAIN), '16. sanity — the same candidate, disposition, and decidedAt produce byte-identical decision records');

        let history = [];
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry(history, D1);
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry(history, D1_AGAIN);

        const stats = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics(history);
        assert(stats.decisionCount === 2, '17. two history entries report decisionCount 2');
        assert(stats.distinctCandidateCount === 1, '18. the two entries name only one distinct candidate');
        assert(stats.observeCount === 2, '19. both entries are OBSERVE, so observeCount is 2');
        assert(stats.dispositionCounts[0].count === 2, '20. dispositionCounts tallies both stored entries, never deduplicated');
    }
    console.log('✓ Section C: the same candidate + same disposition + same timestamp recorded twice produces two history entries and one distinct candidate');

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP #1: candidate identity vs. decision identity.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const selection = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 };
        const D_OBSERVE = decide(plan, selection, 'OBSERVE', DECIDED_AT_1);
        const D_DEFER = decide(plan, selection, 'DEFER', DECIDED_AT_2);

        let history = [];
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry(history, D_OBSERVE);
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry(history, D_DEFER);

        const stats = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics(history);
        assert(stats.decisionCount === 2, '21. FLAGSHIP #1 — two decisions on the identical candidate report decisionCount 2');
        assert(stats.distinctCandidateCount === 1, '22. FLAGSHIP #1 — the identical candidate, decided twice under different dispositions, still reports distinctCandidateCount 1');
        assert(stats.observeCount === 1, '23. FLAGSHIP #1 — observeCount is 1');
        assert(stats.deferCount === 1, '24. FLAGSHIP #1 — deferCount is 1, simultaneously nonzero with observeCount');
    }
    console.log('✓ Section D: FLAGSHIP #1 — candidate identity and decision identity are separate concepts: the same candidate decided OBSERVE then DEFER reports distinctCandidateCount=1 with observeCount=1 and deferCount=1 both nonzero');

    // ---------------------------------------------------------------
    // Section E — candidate-type distinction.
    // ---------------------------------------------------------------
    {
        const { plan, claimC } = buildWorld();
        // Snapshot S4 has no corresponding claim (snapshotIndex 2). Claim C
        // has no corresponding snapshot. Neither shares a field value with
        // the other, but this section also proves that a
        // CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT candidate's own `claimId`
        // never bleeds into `distinctSnapshotIndexCount`, and vice versa.
        const D_CLAIM = decide(plan, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id }, 'OBSERVE', DECIDED_AT_1);
        const D_SNAPSHOT = decide(plan, { type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 2 }, 'DEFER', DECIDED_AT_1);

        let history = [];
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry(history, D_CLAIM);
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry(history, D_SNAPSHOT);

        const stats = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics(history);
        assert(stats.decisionCount === 2, '25. two decisions of different candidate types report decisionCount 2');
        assert(stats.distinctCandidateCount === 2, '26. two structurally different candidates report distinctCandidateCount 2, never conflated');
        assert(stats.distinctClaimIdCount === 1, '27. only the CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT entry contributes a claimId');
        assert(stats.distinctSnapshotIndexCount === 1, '28. only the SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM entry contributes a snapshotIndex');
        assert(stats.candidateTypeCounts.length === 2, '29. candidateTypeCounts lists both distinct types');
        assert(countFor(stats.candidateTypeCounts, 'type', 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT') === 1, '30. CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT own count is 1');
        assert(countFor(stats.candidateTypeCounts, 'type', 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM') === 1, '31. SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM own count is 1');
    }
    console.log('✓ Section E: a CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT and a SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM candidate are never conflated, and each contributes only to the count that its own shape actually carries a field for');

    // ---------------------------------------------------------------
    // Section F — FLAGSHIP #2: the milestone's own worked example.
    //   OBSERVE  B <-> S2
    //   DEFER    B <-> S3
    //   OBSERVE  B <-> S2   (repeat of the first)
    //   OBSERVE  C <-> none
    //   DEFER    none <-> S4
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();

        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', DECIDED_AT_1);
        const D2 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 1 }, 'DEFER', DECIDED_AT_2);
        const D3 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', DECIDED_AT_1);
        const D4 = decide(plan, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id }, 'OBSERVE', DECIDED_AT_1);
        const D5 = decide(plan, { type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 2 }, 'DEFER', DECIDED_AT_1);

        assert(D1.decided && D2.decided && D3.decided && D4.decided && D5.decided, '32. FLAGSHIP #2 — all five decisions are genuine');
        assert(serialize(D1) === serialize(D3), '33. FLAGSHIP #2 — D1 and D3 are byte-identical (same candidate, same disposition, same decidedAt)');

        let history = [];
        for (const decision of [D1, D2, D3, D4, D5]) {
            history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry(history, decision);
        }

        const stats = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics(history);
        assert(stats.decisionCount === 5, '34. FLAGSHIP #2 — decisionCount is 5');
        assert(stats.distinctCandidateCount === 4, '35. FLAGSHIP #2 — distinctCandidateCount is 4 (B<->S2, B<->S3, C, S4) — D1/D3 collapse to one candidate');
        assert(stats.distinctClaimIdCount === 2, '36. FLAGSHIP #2 — distinctClaimIdCount is 2 (B, C)');
        assert(stats.distinctSnapshotIndexCount === 3, '37. FLAGSHIP #2 — distinctSnapshotIndexCount is 3 (S2=0, S3=1, S4=2)');
        assert(stats.observeCount === 3, '38. FLAGSHIP #2 — observeCount is 3 (D1, D3, D4)');
        assert(stats.deferCount === 2, '39. FLAGSHIP #2 — deferCount is 2 (D2, D5)');
        assert(stats.observeCount + stats.deferCount === stats.decisionCount, '40. FLAGSHIP #2 — observeCount and deferCount partition decisionCount exactly, the two-value vocabulary is exhaustive');
        assert(countFor(stats.candidateTypeCounts, 'type', 'DIVERGENT_CORRESPONDENCE') === 3, '41. FLAGSHIP #2 — three DIVERGENT_CORRESPONDENCE entries (D1, D2, D3)');
        assert(countFor(stats.candidateTypeCounts, 'type', 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT') === 1, '42. FLAGSHIP #2 — one CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT entry (D4)');
        assert(countFor(stats.candidateTypeCounts, 'type', 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM') === 1, '43. FLAGSHIP #2 — one SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM entry (D5)');
    }
    console.log('✓ Section F: FLAGSHIP #2 — the milestone\'s own worked example reports decisionCount=5, distinctCandidateCount=4, distinctClaimIdCount=2, distinctSnapshotIndexCount=3, observeCount=3, deferCount=2');

    // ---------------------------------------------------------------
    // Section G — malformed input tolerance.
    // ---------------------------------------------------------------
    {
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics().decisionCount === 0, '44. calling with no arguments defaults to an empty history, never throws');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics(null).decisionCount === 0, '45. null history degrades to empty, never throws');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics(undefined).decisionCount === 0, '46. undefined history degrades to empty, never throws');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics('not an array').decisionCount === 0, '47. a non-array history degrades to empty, never throws');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics(42).decisionCount === 0, '48. a non-array, non-string history degrades to empty, never throws');

        const { plan, claimB } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', DECIDED_AT_1);
        const mixed = [null, undefined, 42, 'not a decision', {}, { decided: false, outcome: 'INVALID_SELECTION' }, { decided: 'true' }, D1];
        const stats = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics(mixed);
        assert(stats.decisionCount === 1, '49. non-genuine entries are silently excluded, leaving only the one genuine decision');
    }
    console.log('✓ Section G: malformed/absent input degrades to a valid, empty statistics result rather than throwing, and non-genuine entries are silently excluded');

    // ---------------------------------------------------------------
    // Section H — no mutation, frozen results.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', DECIDED_AT_1);
        let history = [];
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry(history, D1);
        const historyJsonBefore = serialize(history);

        const stats = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics(history);

        assert(serialize(history) === historyJsonBefore, '50. the input history is never mutated');
        assert(Object.isFrozen(stats), '51. the result is frozen');
        assert(Object.isFrozen(stats.dispositionCounts), '52. dispositionCounts is frozen');
        assert(Object.isFrozen(stats.candidateTypeCounts), '53. candidateTypeCounts is frozen');
        assert(Object.isFrozen(stats.dispositionCounts[0]), '54. each entry within dispositionCounts is itself frozen');
    }
    console.log('✓ Section H: the input history is never mutated, and every returned object/array is frozen');

    // ---------------------------------------------------------------
    // Section I — determinism, and reconstruct()'s thin boundary.
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', DECIDED_AT_1);
        const D2 = decide(plan, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id }, 'DEFER', DECIDED_AT_2);
        let history = [];
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry(history, D1);
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry(history, D2);

        const statsOnce = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics(history);
        const statsTwice = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics(history);
        assert(serialize(statsOnce) === serialize(statsTwice), '55. repeated calls on an identical history are byte-identical');

        // 0.8.150 — reconstruct() now reads its history from a real
        // archive's own reconciliationDecisionRecords collection.
        let archive = PublicationObservationArchive.empty();
        archive = archive.appendReconciliationDecisionRecord(D1);
        archive = archive.appendReconciliationDecisionRecord(D2);
        const reconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics(archive);
        assert(serialize(reconstructed) === serialize(statsOnce), '56. reconstruct() over an archive holding the SAME decisions agrees exactly with describe() over the raw history');
        assert(reconstructed.decisionCount === 2, '57. reconstruct() reports exactly the decisions the archive genuinely holds, never more, never fewer');

        const emptyReconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics(PublicationObservationArchive.empty());
        const emptyStats = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics([]);
        assert(serialize(emptyReconstructed) === serialize(emptyStats), '58. reconstruct() over an empty archive agrees exactly with describe() over an empty history');

        const invalidArchiveReconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics(null);
        assert(serialize(invalidArchiveReconstructed) === serialize(emptyStats), '59. reconstruct() over an invalid/missing archive degrades to the empty-history result, never a throw');
    }
    console.log('✓ Section I: repeated computation over the same history is byte-identical, and reconstruct() reads its history from the archive\'s own durable collection');

    // ---------------------------------------------------------------
    // Section J — vocabulary boundary.
    // ---------------------------------------------------------------
    {
        const stats = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics([]);
        const keys = Object.keys(stats).sort();
        assert(serialize(keys) === serialize([
            'decisionCount',
            'distinctCandidateCount',
            'distinctClaimIdCount',
            'distinctSnapshotIndexCount',
            'observeCount',
            'deferCount',
            'dispositionCounts',
            'candidateTypeCounts'
        ].sort()), '60. the result carries exactly the documented, factual fields');

        const forbidden = ['resolved', 'pending', 'stale', 'approved', 'rejected', 'valid', 'trusted', 'trust', 'confidence', 'score', 'rank', 'reputation', 'authoritative'];
        for (const term of forbidden) {
            assert(!keys.includes(term), `61. the result never carries interpreted-state/trust/ranking vocabulary ('${term}')`);
        }

        const moduleSource = await (await import('node:fs/promises')).readFile(new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatisticsView.js', import.meta.url), 'utf8');
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();
        const forbiddenInCode = ['resolved', 'pending', 'stale', 'approved', 'rejected', 'repair', 'replace', 'accept', 'reject', 'merge', 'delete', 'apply', 'winner', 'execute', 'authoritative', 'trust', 'confidence', 'reputation', 'severity'];
        for (const term of forbiddenInCode) {
            assert(!codeOnly.includes(term), `62. this file's own code never carries "${term}"`);
        }

        // 0.8.150 — this file now imports exactly ONE module: the archive
        // reconstruction seam (application/
        // PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryView.js),
        // used only by reconstructXxx() below. It still imports nothing from
        // the reconciliation FAMILY itself (plan/candidate/decision).
        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.length === 1, '63. this file imports exactly one module');
        assert(importLines[0].includes('PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryView.js'), '64. the one import is the 0.8.150 archive reconstruction seam, never the reconciliation family itself');
    }
    console.log('✓ Section J: the result carries no interpreted-state, trust, or ranking vocabulary, and the module imports only the 0.8.150 archive reconstruction seam');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatisticsView tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatisticsView.test.js FAILED:', error);
    process.exitCode = 1;
});
