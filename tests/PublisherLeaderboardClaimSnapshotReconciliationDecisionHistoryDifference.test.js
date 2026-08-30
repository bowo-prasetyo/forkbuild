import { describePublisherLeaderboardSnapshot } from '../application/PublisherLeaderboardSnapshot.js';
import { describePublisherLeaderboardSnapshotFingerprint } from '../application/PublisherLeaderboardSnapshotFingerprint.js';
import { LeaderboardClaimRecord } from '../application/LeaderboardClaimRecord.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationPlan } from '../application/PublisherLeaderboardClaimSnapshotReconciliationPlanView.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationDecision } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecision.js';
import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference.js';
import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { PublisherLeaderboardSnapshotClaim } from '../core/PublisherLeaderboardSnapshotClaim.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.8.149 — Reconciliation Decision History Difference Projection.
//
// Section A: empty vs empty — no difference
// Section B: structurally identical (but independently computed) decision
//            records — no difference
// Section C: one-sided decisions — correct sourceOnly/targetOnly, each the
//            ORIGINAL decision record, never a copy
// Section D: decision identity is exact — same candidate with a different
//            disposition, or the same candidate+disposition with a
//            different decidedAt, is always a distinct decision
// Section E: multiplicity preservation — [D1, D1, D2] vs [D1, D2] reports
//            exactly one D1 as exclusive, never zero or two
// Section F: PARTICULARLY VALUABLE TEST — candidate identity is never
//            decision identity: the SAME candidate decided OBSERVE on one
//            replica and DEFER on the other reports BOTH records as
//            exclusive, one on each side
// Section G: FLAGSHIP — Alice/Bob worked example from the milestone request
// Section H: neither input history is ever mutated; repeated calls are
//            byte-identical; results are frozen; original record objects
//            are preserved, never reconstructed copies
// Section I: describe()/reconstruct() boundary; malformed/absent input
//            tolerance; no interpretive vocabulary anywhere; zero imports

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

// The identical four-scenario world 0.8.144/0.8.146/0.8.147's own tests
// already use: Claim B genuinely diverges against both S2 and S3, Claim C
// has no corresponding snapshot, Snapshot S4 (index 2) has no corresponding
// claim. Both Alice and Bob reconcile against this SAME plan — this file is
// about comparing two DECISION histories, never about two different plans.
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

const T1 = new Date('2026-08-30T05:00:00Z');
const T2 = new Date('2026-08-30T05:05:00Z');
const T3 = new Date('2026-08-30T05:10:00Z');
const T4 = new Date('2026-08-30T05:15:00Z');
const T5 = new Date('2026-08-30T05:20:00Z');

async function run() {
    // ---------------------------------------------------------------
    // Section A — empty vs empty.
    // ---------------------------------------------------------------
    {
        const diff = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference([], []);
        assert(diff.sameHistory === true, '1. two empty histories report sameHistory');
        assert(diff.sourceOnlyCount === 0 && diff.targetOnlyCount === 0, '2. two empty histories report zero exclusive decisions on either side');
        assert(diff.sourceOnly.length === 0 && diff.targetOnly.length === 0, '3. two empty histories report empty sourceOnly/targetOnly arrays');
        assert(diff.sourceCount === 0 && diff.targetCount === 0, '4. two empty histories report zero counts on each side');
    }
    console.log('✓ Section A: two empty histories report no difference at all');

    // ---------------------------------------------------------------
    // Section B — structurally identical, independently computed decisions.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const selection = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 };
        const one = decide(plan, selection, 'OBSERVE', T1);
        const two = decide(plan, selection, 'OBSERVE', T1);
        assert(one !== two, '5. sanity — two independently computed decision records are distinct objects');
        assert(serialize(one) === serialize(two), '6. sanity — but their serialized content is identical');

        const diff = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference([one], [two]);
        assert(diff.sameHistory === true, '7. two structurally identical, independently computed decisions report no difference');
        assert(diff.sourceOnlyCount === 0 && diff.targetOnlyCount === 0, '8. sourceOnly/targetOnly counts are both zero');
        assert(diff.sourceCount === 1 && diff.targetCount === 1, '9. each side\'s own count is still reported correctly even when there is no difference');
    }
    console.log('✓ Section B: structurally identical, independently computed decisions report no difference');

    // ---------------------------------------------------------------
    // Section C — one-sided decisions.
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const sourceOnlyDecision = decide(plan, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id }, 'OBSERVE', T1);
        const sharedSelection = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 };
        const sharedForSource = decide(plan, sharedSelection, 'DEFER', T2);
        const sharedForTarget = decide(plan, sharedSelection, 'DEFER', T2);

        const sourceHistory = historyOf(sourceOnlyDecision, sharedForSource);
        const targetHistory = historyOf(sharedForTarget);

        const diff = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference(sourceHistory, targetHistory);
        assert(diff.sameHistory === false, '10. one-sided decisions report sameHistory === false');
        assert(diff.sourceOnlyCount === 1 && diff.targetOnlyCount === 0, '11. exactly one source-only decision, none on the target side');
        assert(diff.sourceOnly.length === 1 && diff.sourceOnly[0] === sourceOnlyDecision, '12. sourceOnly holds exactly the exclusive record, as the ORIGINAL decision object');
        assert(diff.targetOnly.length === 0, '13. targetOnly is empty — the shared decision cancels out on both sides');
    }
    console.log('✓ Section C: one-sided decisions are reported as exactly the correct source-only/target-only original records');

    // ---------------------------------------------------------------
    // Section D — decision identity is exact.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const selection = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 };

        // Same candidate, different disposition — a genuinely distinct decision.
        const observed = decide(plan, selection, 'OBSERVE', T1);
        const deferred = decide(plan, selection, 'DEFER', T1);
        const diffDisposition = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference([observed], [deferred]);
        assert(diffDisposition.sameHistory === false, '14. same candidate, different disposition — reported as a genuine difference');
        assert(diffDisposition.sourceOnly[0] === observed && diffDisposition.targetOnly[0] === deferred, '15. neither cancels the other');

        // Same candidate, same disposition, different decidedAt — likewise a
        // genuinely distinct decision.
        const early = decide(plan, selection, 'OBSERVE', T1);
        const late = decide(plan, selection, 'OBSERVE', T2);
        const diffDecidedAt = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference([early], [late]);
        assert(diffDecidedAt.sameHistory === false, '16. same candidate, same disposition, different decidedAt — reported as a genuine difference');
        assert(diffDecidedAt.sourceOnly[0] === early && diffDecidedAt.targetOnly[0] === late, '17. neither cancels the other');
    }
    console.log('✓ Section D: decision identity is exact — differing in disposition or decidedAt alone is always a distinct decision, never partially matched');

    // ---------------------------------------------------------------
    // Section E — multiplicity preservation.
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const D2 = decide(plan, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id }, 'DEFER', T2);

        // Source: [D1, D1, D2] — the SAME D1 recorded twice. Target: [D1, D2].
        const sourceHistory = [D1, D1, D2];
        const targetHistory = [D1, D2];

        const diff = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference(sourceHistory, targetHistory);
        assert(diff.sourceOnlyCount === 1, '18. [D1, D1, D2] vs [D1, D2] reports exactly ONE exclusive D1, never zero or two');
        assert(diff.sourceOnly.length === 1 && diff.sourceOnly[0] === D1, '19. the one exclusive decision is D1 itself');
        assert(diff.targetOnlyCount === 0, '20. the target side has no exclusive decisions — its single D1 and its D2 both matched');
        assert(diff.sameHistory === false, '21. multiplicity difference alone is still a genuine difference');
    }
    console.log('✓ Section E: [D1, D1, D2] versus [D1, D2] reports exactly one exclusive decision — multiplicity is preserved, never collapsed to a set');

    // ---------------------------------------------------------------
    // Section F — PARTICULARLY VALUABLE TEST: candidate identity is never
    // decision identity. The SAME candidate receives OBSERVE on one replica
    // and DEFER on the other.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const selection = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 };

        const aliceDecision = decide(plan, selection, 'OBSERVE', T1);
        const bobDecision = decide(plan, selection, 'DEFER', T1);
        assert(serialize(aliceDecision.candidate) === serialize(bobDecision.candidate), '22. sanity — both decisions genuinely concern the identical candidate');
        assert(aliceDecision.decision !== bobDecision.decision, '23. sanity — the two decisions carry genuinely different dispositions');

        const aliceHistory = historyOf(aliceDecision);
        const bobHistory = historyOf(bobDecision);

        const diff = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference(aliceHistory, bobHistory);
        assert(diff.sameHistory === false, '24. the same candidate decided differently on each replica is a genuine difference, never treated as already reconciled');
        assert(diff.sourceOnlyCount === 1 && diff.sourceOnly[0] === aliceDecision, '25. Alice\'s OBSERVE record is reported as source-only');
        assert(diff.targetOnlyCount === 1 && diff.targetOnly[0] === bobDecision, '26. Bob\'s DEFER record is reported as target-only — candidate identity never masks the disagreement');
    }
    console.log('✓ Section F: PARTICULARLY VALUABLE TEST — the same candidate decided OBSERVE on one replica and DEFER on the other reports BOTH records as exclusive, one on each side, proving candidate identity is never treated as decision identity');

    // ---------------------------------------------------------------
    // Section G — FLAGSHIP: the milestone's own worked example.
    //
    //   Alice: OBSERVE B<->S2 @ T1, DEFER B<->S3 @ T2, OBSERVE C @ T3
    //   Bob:   OBSERVE B<->S2 @ T1, OBSERVE B<->S2 @ T4, DEFER B<->S3 @ T2, DEFER S4 @ T5
    //
    //   Alice-only: OBSERVE C @ T3
    //   Bob-only:   OBSERVE B<->S2 @ T4, DEFER S4 @ T5
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const selectionB_S2 = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 };
        const selectionB_S3 = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 1 };
        const selectionC = { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id };
        const selectionS4 = { type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 2 };

        const observeB_S2_at_T1 = decide(plan, selectionB_S2, 'OBSERVE', T1);
        const deferB_S3_at_T2 = decide(plan, selectionB_S3, 'DEFER', T2);
        const observeC_at_T3 = decide(plan, selectionC, 'OBSERVE', T3);
        const observeB_S2_at_T4 = decide(plan, selectionB_S2, 'OBSERVE', T4);
        const deferS4_at_T5 = decide(plan, selectionS4, 'DEFER', T5);

        const aliceHistory = historyOf(observeB_S2_at_T1, deferB_S3_at_T2, observeC_at_T3);
        const bobHistory = historyOf(observeB_S2_at_T1, observeB_S2_at_T4, deferB_S3_at_T2, deferS4_at_T5);

        const diff = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference(aliceHistory, bobHistory);
        assert(diff.sameHistory === false, '27. FLAGSHIP — Alice and Bob\'s decision histories genuinely differ');
        assert(diff.sourceCount === 3 && diff.targetCount === 4, '28. FLAGSHIP — each side\'s own raw count is reported correctly');
        assert(diff.sourceOnly.length === 1 && diff.sourceOnly[0] === observeC_at_T3, '29. FLAGSHIP — Alice-only is exactly [OBSERVE C @ T3]');
        assert(diff.targetOnly.length === 2 && diff.targetOnly[0] === observeB_S2_at_T4 && diff.targetOnly[1] === deferS4_at_T5, '30. FLAGSHIP — Bob-only is exactly [OBSERVE B<->S2 @ T4, DEFER S4 @ T5], in Bob\'s own order');
        assert(diff.sourceOnlyCount === 1 && diff.targetOnlyCount === 2, '31. FLAGSHIP — sourceOnlyCount/targetOnlyCount match the arrays exactly');

        // The shared OBSERVE B<->S2 @ T1 and DEFER B<->S3 @ T2 cancel out on
        // both sides — the difference says ONLY what differs, nothing about
        // which history is preferable.
        assert(!diff.sourceOnly.includes(observeB_S2_at_T1) && !diff.targetOnly.includes(observeB_S2_at_T1), '32. FLAGSHIP — the genuinely shared OBSERVE B<->S2 @ T1 appears in neither exclusive list');
        assert(!diff.sourceOnly.includes(deferB_S3_at_T2) && !diff.targetOnly.includes(deferB_S3_at_T2), '33. FLAGSHIP — the genuinely shared DEFER B<->S3 @ T2 appears in neither exclusive list');
    }
    console.log('✓ Section G: FLAGSHIP — the milestone\'s own worked Alice/Bob example reports exactly the documented sourceOnly/targetOnly decisions, with genuinely shared decisions cancelling out on both sides');

    // ---------------------------------------------------------------
    // Section H — no mutation, determinism, frozen results, original
    // objects preserved.
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const D2 = decide(plan, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id }, 'DEFER', T2);

        const sourceHistory = [D1];
        const targetHistory = [D2];
        const sourceSnapshotBefore = sourceHistory.slice();
        const targetSnapshotBefore = targetHistory.slice();

        const diffOnce = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference(sourceHistory, targetHistory);
        const diffTwice = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference(sourceHistory, targetHistory);
        assert(serialize(sourceHistory) === serialize(sourceSnapshotBefore), '34. the source history is never mutated');
        assert(serialize(targetHistory) === serialize(targetSnapshotBefore), '35. the target history is never mutated');
        assert(diffOnce.sourceOnly[0] === D1 && diffOnce.targetOnly[0] === D2, '36. sourceOnly/targetOnly hold the ORIGINAL decision objects — never a reconstructed copy');
        assert(serialize(diffOnce) === serialize(diffTwice), '37. repeated calls on identical inputs are byte-identical');

        assert(Object.isFrozen(diffOnce), '38. the difference result is frozen');
        assert(Object.isFrozen(diffOnce.sourceOnly), '39. sourceOnly is frozen');
        assert(Object.isFrozen(diffOnce.targetOnly), '40. targetOnly is frozen');
    }
    console.log('✓ Section H: neither input history is ever mutated, repeated calls are byte-identical, and results hold the original decision objects, frozen');

    // ---------------------------------------------------------------
    // Section I — reconstruct() boundary, malformed input tolerance, and
    // vocabulary/import boundary.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const history = historyOf(D1);

        // reconstruct() does not yet read a decision history from any
        // archive at all — PublicationObservationArchive does not yet hold
        // one — so it always computes over two empty histories, regardless
        // of what either archive contains.
        const archiveA = PublicationObservationArchive.empty();
        const archiveB = PublicationObservationArchive.empty();
        const reconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference(archiveA, archiveB);
        const emptyDiff = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference([], []);
        assert(serialize(reconstructed) === serialize(emptyDiff), '41. reconstruct() presently always returns the empty-history difference result, a thin boundary pending decision-history/archive integration');
        assert(reconstructed.sameHistory === true, '42. reconstruct() never fabricates a difference the archives do not genuinely hold');

        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference().sameHistory === true, '43. calling with no arguments defaults to two empty histories, never throws');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference(null, undefined).sameHistory === true, '44. null/undefined histories degrade to empty, never throw');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference('not an array', 42).sameHistory === true, '45. malformed non-array histories degrade to empty, never throw');

        const mixed = [null, undefined, 42, 'not a decision', {}, { decided: false, outcome: 'INVALID_SELECTION' }, { decided: 'true' }, D1];
        const diffMixed = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference(mixed, []);
        assert(diffMixed.sourceCount === 1 && diffMixed.sourceOnly[0] === D1, '46. non-genuine entries are silently excluded from comparison, leaving only the one genuine decision');

        const keys = Object.keys(emptyDiff).sort();
        assert(serialize(keys) === serialize(['sourceCount', 'targetCount', 'sourceOnlyCount', 'targetOnlyCount', 'sourceOnly', 'targetOnly', 'sameHistory'].sort()), '47. the result carries exactly the documented, factual fields');

        const forbidden = ['inconsistent', 'superseded', 'preferred', 'authoritative', 'resolved', 'conflicting', 'valid', 'trusted', 'trust', 'confidence', 'score', 'reputation', 'rank'];
        for (const term of forbidden) {
            assert(!keys.includes(term), `48. the result never carries interpretive/trust vocabulary ('${term}')`);
        }

        const moduleSource = await (await import('node:fs/promises')).readFile(new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference.js', import.meta.url), 'utf8');
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();
        const forbiddenInCode = ['inconsistent', 'superseded', 'preferred', 'authoritative', 'resolved', 'conflicting', 'repair', 'replace', 'accept', 'reject', 'merge', 'delete', 'apply', 'winner', 'execute', 'trust', 'confidence', 'reputation', 'severity'];
        for (const term of forbiddenInCode) {
            assert(!codeOnly.includes(term), `49. this file's own code never carries "${term}"`);
        }

        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.length === 0, '50. this file imports nothing from the reconciliation family');
    }
    console.log('✓ Section I: reconstruct() is a thin, archive-independent boundary, malformed/absent input degrades safely, the result carries no interpretive vocabulary, and the module imports nothing from the reconciliation family');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference.test.js FAILED:', error);
    process.exitCode = 1;
});
