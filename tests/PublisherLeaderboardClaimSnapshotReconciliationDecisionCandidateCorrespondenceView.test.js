import { describePublisherLeaderboardSnapshot } from '../application/PublisherLeaderboardSnapshot.js';
import { describePublisherLeaderboardSnapshotFingerprint } from '../application/PublisherLeaderboardSnapshotFingerprint.js';
import { LeaderboardClaimRecord } from '../application/LeaderboardClaimRecord.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationPlan } from '../application/PublisherLeaderboardClaimSnapshotReconciliationPlanView.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationDecision } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecision.js';
import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondenceView.js';
import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { PublisherLeaderboardSnapshotClaim } from '../core/PublisherLeaderboardSnapshotClaim.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.8.153 — Historical Reconciliation Decision-to-Candidate Correspondence
// Projection.
//
// Section A: empty history — zero counts, empty correspondences
// Section B: a single decision — one correspondence entry, correctly shaped
// Section C: FLAGSHIP — the milestone's own worked example:
//            D1=C1+OBSERVE+T1, D2=C1+DEFER+T2, D3=C2+OBSERVE+T3,
//            D4=C1+OBSERVE+T1 (exact duplicate of D1)
// Section D: candidate identity vs. decision identity — a claim genuinely
//            diverging against two snapshots is two distinct candidates
// Section E: three candidate shapes remain closed, entries embed the whole
//            candidate object unchanged
// Section F: ordering follows supplied history, never re-sorted by decidedAt
// Section G: no mutation, frozen results, original objects untouched
// Section H: malformed input tolerance
// Section I: determinism, and reconstruct()'s archive-reading boundary,
//            never consulting current archive state for anything but the
//            stored history itself
// Section J: vocabulary/import boundary — no rediscovery of 0.8.144, no
//            interpretive vocabulary

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

// The identical four-scenario world 0.8.144/0.8.146/0.8.147/0.8.148's own
// tests already use: Claim B genuinely diverges against both S2 and S3,
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

async function run() {
    // ---------------------------------------------------------------
    // Section A — empty history.
    // ---------------------------------------------------------------
    {
        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence([]);
        assert(result.decisionCount === 0, '1. empty history reports decisionCount 0');
        assert(result.candidateCount === 0, '2. empty history reports candidateCount 0');
        assert(result.correspondences.length === 0, '3. empty history reports an empty correspondences array');
    }
    console.log('✓ Section A: an empty history produces an empty correspondence result');

    // ---------------------------------------------------------------
    // Section B — a single decision.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const history = appendAll([D1]);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence(history);
        assert(result.decisionCount === 1, '4. one decision reports decisionCount 1');
        assert(result.candidateCount === 1, '5. one decision reports candidateCount 1');
        const [entry] = result.correspondences;
        assert(entry.decisionIndex === 0, '6. entry carries decisionIndex 0');
        assert(serialize(entry.candidate) === serialize(D1.candidate), '7. entry carries the candidate unchanged, by value');
        assert(entry.decision === 'OBSERVE', '8. entry carries decision');
        assert(entry.decidedAt === T1.toISOString(), '9. entry carries decidedAt as the exact ISO string from the decision record');
    }
    console.log('✓ Section B: a single decision produces one correctly shaped correspondence entry');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP: the milestone's own worked example.
    //   D1 = C1 + OBSERVE + T1
    //   D2 = C1 + DEFER   + T2
    //   D3 = C2 + OBSERVE + T3
    //   D4 = C1 + OBSERVE + T1   (exact duplicate of D1)
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const c1 = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 };
        const c2 = { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id };

        const D1 = decide(plan, c1, 'OBSERVE', T1);
        const D2 = decide(plan, c1, 'DEFER', T2);
        const D3 = decide(plan, c2, 'OBSERVE', T3);
        const D4 = decide(plan, c1, 'OBSERVE', T1);
        assert(serialize(D1) === serialize(D4), '10. sanity — D1 and D4 are byte-identical decision records');

        const history = appendAll([D1, D2, D3, D4]);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence(history);

        assert(result.decisionCount === 4, '11. FLAGSHIP — four history entries produce decisionCount 4; D1 and D4 remain distinct history entries');
        assert(result.candidateCount === 2, '12. FLAGSHIP — only two distinct candidates (C1, C2) exist across the four decisions');

        const [e1, e2, e3, e4] = result.correspondences;
        assert(e1.decisionIndex === 0 && e2.decisionIndex === 1 && e3.decisionIndex === 2 && e4.decisionIndex === 3, '13. FLAGSHIP — decisionIndex tracks position in supplied history, 0 through 3');

        assert(serialize(e1.candidate) === serialize(D1.candidate), '14. FLAGSHIP — e1 refers to candidate C1, embedded exactly as 0.8.145 recorded it');
        assert(e1.decision === 'OBSERVE' && e1.decidedAt === T1.toISOString(), '15. FLAGSHIP — e1 is C1 + OBSERVE + T1');
        assert(serialize(e2.candidate) === serialize(e1.candidate), '16. FLAGSHIP — e1 and e2 refer to the SAME candidate (C1) despite differing dispositions');
        assert(e2.decision === 'DEFER' && e2.decidedAt === T2.toISOString(), '17. FLAGSHIP — e2 is C1 + DEFER + T2 — a different disposition does not create a different candidate');
        assert(e3.candidate.type === 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT' && e3.candidate.claimId === claimC.id, '18. FLAGSHIP — e3 refers to candidate C2');
        assert(e3.decision === 'OBSERVE' && e3.decidedAt === T3.toISOString(), '19. FLAGSHIP — e3 is C2 + OBSERVE + T3');
        assert(serialize(e4.candidate) === serialize(e1.candidate), '20. FLAGSHIP — e4 refers to the same candidate as e1 (C1)');
        assert(e4.decision === 'OBSERVE' && e4.decidedAt === T1.toISOString(), '21. FLAGSHIP — e4 is C1 + OBSERVE + T1, identical to e1');
        assert(serialize(e1) !== serialize(e4), '22. FLAGSHIP — e1 and e4 are still distinct correspondence entries (different decisionIndex), even though every other field matches — D1 and D4 remain distinct history entries');
    }
    console.log('✓ Section C: FLAGSHIP — the milestone\'s own worked example preserves decision-entry multiplicity, candidate identity, and the distinction that differing dispositions/decidedAt values never create a different candidate');

    // ---------------------------------------------------------------
    // Section D — candidate identity vs. decision identity: a claim
    // genuinely diverging against two snapshots is two distinct candidates.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const D_S2 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'DEFER', T1);
        const D_S3 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 1 }, 'OBSERVE', T2);

        const history = appendAll([D_S2, D_S3]);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence(history);

        assert(result.decisionCount === 2, '23. two decisions against two snapshots report decisionCount 2');
        assert(result.candidateCount === 2, '24. the same claim decided against two different snapshots is TWO distinct candidates, never collapsed to one');
        assert(result.correspondences[0].candidate.snapshotIndex === 0, '25. entry 0 names snapshotIndex 0');
        assert(result.correspondences[1].candidate.snapshotIndex === 1, '26. entry 1 names snapshotIndex 1');
    }
    console.log('✓ Section D: a claim genuinely diverging against two snapshots produces two distinct candidate identities, never one');

    // ---------------------------------------------------------------
    // Section E — three candidate shapes remain closed; the whole
    // candidate object is embedded unchanged.
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const D_DIVERGENT = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const D_CLAIM = decide(plan, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id }, 'DEFER', T2);
        const D_SNAPSHOT = decide(plan, { type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 2 }, 'OBSERVE', T3);

        const history = appendAll([D_DIVERGENT, D_CLAIM, D_SNAPSHOT]);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence(history);

        assert(result.correspondences[0].candidate.type === 'DIVERGENT_CORRESPONDENCE', '27. divergent-correspondence candidate type preserved');
        assert(serialize(result.correspondences[0].candidate) === serialize(D_DIVERGENT.candidate), '28. divergent-correspondence candidate embedded whole, unchanged');
        assert(result.correspondences[1].candidate.type === 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', '29. claim-without-snapshot candidate type preserved');
        assert(!('snapshotIndex' in result.correspondences[1].candidate), '30. claim-without-snapshot candidate carries no snapshotIndex field, exactly as 0.8.144 produced it');
        assert(result.correspondences[2].candidate.type === 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', '31. snapshot-without-claim candidate type preserved');
        assert(!('claimId' in result.correspondences[2].candidate), '32. snapshot-without-claim candidate carries no claimId field, exactly as 0.8.144 produced it');
        assert(result.candidateCount === 3, '33. three structurally distinct candidates are counted as three');
    }
    console.log('✓ Section E: all three candidate shapes remain closed and each entry embeds its own candidate whole, unchanged');

    // ---------------------------------------------------------------
    // Section F — ordering follows supplied history, never re-sorted by
    // decidedAt.
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const D_LATE = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'DEFER', T3);
        const D_EARLY = decide(plan, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id }, 'OBSERVE', T1);

        const history = appendAll([D_LATE, D_EARLY]);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence(history);

        assert(result.correspondences[0].decidedAt === T3.toISOString(), '34. the correspondence entry order follows supplied history order, not chronological order');
        assert(result.correspondences[1].decidedAt === T1.toISOString(), '35. the later-appended, earlier-decided entry stays second, matching history\'s own order');
    }
    console.log('✓ Section F: correspondence order follows supplied history order exactly — never re-sorted by decidedAt');

    // ---------------------------------------------------------------
    // Section G — no mutation, frozen results.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const history = appendAll([D1]);
        const historyJsonBefore = serialize(history);
        const decisionJsonBefore = serialize(D1);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence(history);

        assert(serialize(history) === historyJsonBefore, '36. the input history is never mutated');
        assert(serialize(D1) === decisionJsonBefore, '37. the original decision record is never mutated');
        assert(Object.isFrozen(result), '38. the result is frozen');
        assert(Object.isFrozen(result.correspondences), '39. correspondences is frozen');
        assert(Object.isFrozen(result.correspondences[0]), '40. each correspondence entry is itself frozen');
    }
    console.log('✓ Section G: the input history and original decision records are never mutated, and every returned object/array is frozen');

    // ---------------------------------------------------------------
    // Section H — malformed input tolerance.
    // ---------------------------------------------------------------
    {
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence().decisionCount === 0, '41. calling with no arguments defaults to an empty result, never throws');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence(null).decisionCount === 0, '42. null history degrades to empty, never throws');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence(undefined).decisionCount === 0, '43. undefined history degrades to empty, never throws');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence('not an array').decisionCount === 0, '44. a non-array history degrades to empty, never throws');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence(42).decisionCount === 0, '45. a non-array, non-string history degrades to empty, never throws');

        const { plan, claimB } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const mixed = [null, undefined, 42, 'not a decision', {}, { decided: false, outcome: 'INVALID_SELECTION' }, { decided: 'true' }, { decided: true, candidate: { type: 'DIVERGENT_CORRESPONDENCE' }, decision: 'OBSERVE' }, D1];
        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence(mixed);
        assert(result.decisionCount === 1, '46. non-genuine entries are silently excluded, leaving only the one genuine decision');
        assert(result.correspondences[0].decisionIndex === 0, '47. decisionIndex is assigned only to genuine entries, after exclusion, so the sole surviving entry gets index 0, not its position in the raw array');
    }
    console.log('✓ Section H: malformed/absent input degrades to a valid, empty result rather than throwing, and non-genuine entries are silently excluded');

    // ---------------------------------------------------------------
    // Section I — determinism, and reconstruct()'s archive-reading
    // boundary: the pure function never consults current archive state.
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const D2 = decide(plan, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id }, 'DEFER', T2);
        const history = appendAll([D1, D2]);

        const once = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence(history);
        const twice = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence(history);
        assert(serialize(once) === serialize(twice), '48. repeated calls on an identical history are byte-identical');

        let archive = PublicationObservationArchive.empty();
        archive = archive.appendReconciliationDecisionRecord(D1);
        archive = archive.appendReconciliationDecisionRecord(D2);
        const reconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence(archive);
        assert(serialize(reconstructed) === serialize(once), '49. reconstruct() over an archive holding the SAME decisions agrees exactly with describe() over the raw history');
        assert(reconstructed.decisionCount === 2, '50. reconstruct() reports exactly the decisions the archive genuinely holds, never more, never fewer');

        const emptyResult = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence([]);
        const emptyReconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence(PublicationObservationArchive.empty());
        assert(serialize(emptyReconstructed) === serialize(emptyResult), '51. reconstruct() over an empty archive agrees exactly with describe() over an empty history');

        const invalidArchiveReconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence(null);
        assert(serialize(invalidArchiveReconstructed) === serialize(emptyResult), '52. reconstruct() over an invalid/missing archive degrades to the empty-history result, never a throw');
    }
    console.log('✓ Section I: repeated computation over the same history is byte-identical, and reconstruct() reads only the archive\'s own stored decision history');

    // ---------------------------------------------------------------
    // Section J — vocabulary/import boundary: no rediscovery of 0.8.144,
    // no interpretive vocabulary.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence(appendAll([D1]));

        const topKeys = Object.keys(result).sort();
        assert(serialize(topKeys) === serialize(['decisionCount', 'candidateCount', 'correspondences'].sort()), '53. the result carries exactly the documented, factual top-level fields');

        const entryKeys = Object.keys(result.correspondences[0]).sort();
        assert(serialize(entryKeys) === serialize(['decisionIndex', 'candidate', 'decision', 'decidedAt'].sort()), '54. an entry carries exactly the documented, factual fields');

        const forbidden = ['resolved', 'unresolved', 'pending', 'superseded', 'active', 'stale', 'correct', 'incorrect', 'approved', 'rejected', 'unknown'];
        for (const term of forbidden) {
            assert(!topKeys.includes(term) && !entryKeys.includes(term), `55. the result never carries state-machine vocabulary ('${term}')`);
        }

        const moduleSource = await (await import('node:fs/promises')).readFile(new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondenceView.js', import.meta.url), 'utf8');
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();
        const forbiddenInCode = ['resolved', 'unresolved', 'pending', 'superseded', 'active', 'stale', 'correct', 'incorrect', 'approved', 'rejected', 'repair', 'replace', 'accept', 'reject', 'merge', 'delete', 'apply', 'winner', 'execute', 'authoritative', 'trust', 'confidence', 'reputation', 'severity'];
        for (const term of forbiddenInCode) {
            assert(!codeOnly.includes(term), `56. this file's own code never carries "${term}"`);
        }

        // This milestone must not call 0.8.144 to rediscover a candidate —
        // this file imports exactly ONE module: the archive reconstruction
        // seam, used only by reconstructXxx(). It never imports the plan,
        // candidate-selection, or reconciliation-discovery modules.
        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.length === 1, '57. this file imports exactly one module');
        assert(importLines[0].includes('PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryView.js'), '58. the one import is the 0.8.150 archive reconstruction seam, never 0.8.144\'s own candidate-selection boundary or any plan/discovery module');
        assert(!codeOnly.includes('reconciliationplanview') && !codeOnly.includes('describepublisherleaderboardclaimsnapshotreconciliationcandidate'), '59. this file never calls 0.8.144\'s own candidate-selection function to rediscover a candidate');
    }
    console.log('✓ Section J: the result carries no state-machine or interpretive vocabulary, and the module never rediscovers a candidate via 0.8.144 or any plan/discovery module');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondenceView tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondenceView.test.js FAILED:', error);
    process.exitCode = 1;
});
