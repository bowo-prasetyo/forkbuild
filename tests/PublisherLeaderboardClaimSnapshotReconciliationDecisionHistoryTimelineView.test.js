import { describePublisherLeaderboardSnapshot } from '../application/PublisherLeaderboardSnapshot.js';
import { describePublisherLeaderboardSnapshotFingerprint } from '../application/PublisherLeaderboardSnapshotFingerprint.js';
import { LeaderboardClaimRecord } from '../application/LeaderboardClaimRecord.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationPlan } from '../application/PublisherLeaderboardClaimSnapshotReconciliationPlanView.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationDecision } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecision.js';
import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimeline,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimeline
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimelineView.js';
import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { PublisherLeaderboardSnapshotClaim } from '../core/PublisherLeaderboardSnapshotClaim.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.8.148 — Reconciliation Decision History Timeline Projection.
//
// Section A: empty history — empty entries, entryCount 0
// Section B: a single decision — one entry, correctly shaped
// Section C: multiplicity — the SAME candidate decided (byte-identically)
//            twice produces TWO timeline entries, never collapsed
// Section D: FLAGSHIP #1 — chronological ordering with an equal-time tie
//            broken by insertion order: D1@10:00, D2@10:03, D3@10:03,
//            D4@10:07 appended in that order timelines in that exact order
// Section E: out-of-order insertion is re-sorted by decidedAt, not by
//            insertion order — proves genuine sorting, not pass-through
// Section F: shape preservation — a claim-without-snapshot entry carries
//            claimId but no snapshotIndex; a snapshot-without-claim entry
//            carries snapshotIndex but no claimId; no manufactured nulls
// Section G: FLAGSHIP #2 — the milestone's own worked example:
//            t1 OBSERVE B<->S2, t2 DEFER B<->S3, t2 OBSERVE C<->none,
//            t3 OBSERVE none<->S4, t3 DEFER B<->S2
// Section H: malformed input tolerance
// Section I: no mutation, frozen results
// Section J: determinism, and reconstruct()'s thin, archive-independent
//            boundary
// Section K: vocabulary boundary — no state-machine/interpretive
//            vocabulary anywhere, zero imports

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

// Builds the identical four-scenario world 0.8.144/0.8.146/0.8.147's own
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
        const timeline = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimeline([]);
        assert(timeline.entryCount === 0, '1. empty history reports entryCount 0');
        assert(timeline.entries.length === 0, '2. empty history reports an empty entries array');
    }
    console.log('✓ Section A: an empty history produces an empty timeline');

    // ---------------------------------------------------------------
    // Section B — a single decision.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const history = appendAll([D1]);

        const timeline = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimeline(history);
        assert(timeline.entryCount === 1, '3. one decision reports entryCount 1');
        const [entry] = timeline.entries;
        assert(entry.candidateType === 'DIVERGENT_CORRESPONDENCE', '4. entry carries candidateType');
        assert(entry.claimId === claimB.id, '5. entry carries claimId');
        assert(entry.snapshotIndex === 0, '6. entry carries snapshotIndex');
        assert(entry.disposition === 'OBSERVE', '7. entry carries disposition');
        assert(entry.decidedAt === T1.toISOString(), '8. entry carries decidedAt as the exact ISO string from the decision record');
    }
    console.log('✓ Section B: a single decision produces one correctly shaped entry');

    // ---------------------------------------------------------------
    // Section C — multiplicity: the same candidate decided identically
    // twice produces two entries.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const selection = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 };
        const D1 = decide(plan, selection, 'OBSERVE', T1);
        const D1_AGAIN = decide(plan, selection, 'OBSERVE', T1);
        assert(serialize(D1) === serialize(D1_AGAIN), '9. sanity — byte-identical decision records');

        const history = appendAll([D1, D1_AGAIN]);
        const timeline = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimeline(history);
        assert(timeline.entryCount === 2, '10. two history entries produce two timeline entries, never collapsed');
        assert(serialize(timeline.entries[0]) === serialize(timeline.entries[1]), '11. both entries are byte-identical narrations of the identical decision');
    }
    console.log('✓ Section C: multiplicity is preserved — the same candidate decided identically twice produces two timeline entries');

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP #1: chronological order with an equal-time tie
    // broken by insertion order.
    //   D1 @ 10:00, D2 @ 10:03, D3 @ 10:03, D4 @ 10:07
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const D2 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 1 }, 'DEFER', T2);
        const D3 = decide(plan, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id }, 'OBSERVE', T2);
        const D4 = decide(plan, { type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 2 }, 'DEFER', T3);

        const history = appendAll([D1, D2, D3, D4]);
        const timeline = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimeline(history);
        assert(timeline.entryCount === 4, '12. FLAGSHIP #1 — four decisions produce four entries');
        assert(timeline.entries[0].decidedAt === T1.toISOString() && timeline.entries[0].snapshotIndex === 0, '13. FLAGSHIP #1 — D1 (10:00) is first');
        assert(timeline.entries[1].decidedAt === T2.toISOString() && timeline.entries[1].snapshotIndex === 1, '14. FLAGSHIP #1 — D2 (10:03, DIVERGENT_CORRESPONDENCE) is second, appended before D3');
        assert(timeline.entries[2].decidedAt === T2.toISOString() && timeline.entries[2].claimId === claimC.id && timeline.entries[2].snapshotIndex === undefined, '15. FLAGSHIP #1 — D3 (10:03, CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT) is third — equal-time tie broken by insertion order, not by any field value');
        assert(timeline.entries[3].decidedAt === T3.toISOString() && timeline.entries[3].snapshotIndex === 2, '16. FLAGSHIP #1 — D4 (10:07) is fourth');
    }
    console.log('✓ Section D: FLAGSHIP #1 — ascending decidedAt with equal-time entries broken by insertion order, exactly as the milestone specifies');

    // ---------------------------------------------------------------
    // Section E — out-of-order insertion is re-sorted by decidedAt, proving
    // genuine sorting rather than a pass-through of insertion order.
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const D_LATE = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'DEFER', T3);
        const D_EARLY = decide(plan, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id }, 'OBSERVE', T1);

        const history = appendAll([D_LATE, D_EARLY]);
        assert(history[0].decidedAt === T3.toISOString(), '17. sanity — history itself stores D_LATE before D_EARLY');

        const timeline = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimeline(history);
        assert(timeline.entries[0].decidedAt === T1.toISOString(), '18. the earlier decidedAt is timelined first despite being appended second');
        assert(timeline.entries[1].decidedAt === T3.toISOString(), '19. the later decidedAt is timelined second despite being appended first');
    }
    console.log('✓ Section E: out-of-order insertion is re-sorted by decidedAt, not merely passed through in append order');

    // ---------------------------------------------------------------
    // Section F — shape preservation: no manufactured null fields.
    // ---------------------------------------------------------------
    {
        const { plan, claimC } = buildWorld();
        const D_CLAIM = decide(plan, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id }, 'OBSERVE', T1);
        const D_SNAPSHOT = decide(plan, { type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 2 }, 'DEFER', T2);

        const history = appendAll([D_CLAIM, D_SNAPSHOT]);
        const timeline = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimeline(history);

        const claimEntry = timeline.entries[0];
        assert(claimEntry.candidateType === 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', '20. claim-without-snapshot entry carries its own candidateType');
        assert(claimEntry.claimId === claimC.id, '21. claim-without-snapshot entry carries claimId');
        assert(!('snapshotIndex' in claimEntry), '22. claim-without-snapshot entry carries no snapshotIndex field at all — not undefined, not null, simply absent');
        assert(serialize(Object.keys(claimEntry).sort()) === serialize(['candidateType', 'claimId', 'decidedAt', 'disposition'].sort()), '23. claim-without-snapshot entry has exactly four keys');

        const snapshotEntry = timeline.entries[1];
        assert(snapshotEntry.candidateType === 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', '24. snapshot-without-claim entry carries its own candidateType');
        assert(snapshotEntry.snapshotIndex === 2, '25. snapshot-without-claim entry carries snapshotIndex');
        assert(!('claimId' in snapshotEntry), '26. snapshot-without-claim entry carries no claimId field at all — not undefined, not null, simply absent');
        assert(serialize(Object.keys(snapshotEntry).sort()) === serialize(['candidateType', 'decidedAt', 'disposition', 'snapshotIndex'].sort()), '27. snapshot-without-claim entry has exactly four keys');
    }
    console.log('✓ Section F: a claim-without-snapshot entry and a snapshot-without-claim entry each preserve only the fields their own candidate shape carries — no manufactured nulls');

    // ---------------------------------------------------------------
    // Section G — FLAGSHIP #2: the milestone's own worked example.
    //   t1  OBSERVE  B <-> S2
    //   t2  DEFER    B <-> S3
    //   t2  OBSERVE  C <-> none
    //   t3  OBSERVE  none <-> S4
    //   t3  DEFER    B <-> S2
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const D2 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 1 }, 'DEFER', T2);
        const D3 = decide(plan, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id }, 'OBSERVE', T2);
        const D4 = decide(plan, { type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 2 }, 'OBSERVE', T3);
        const D5 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'DEFER', T3);

        assert([D1, D2, D3, D4, D5].every((d) => d.decided), '28. FLAGSHIP #2 — all five decisions are genuine');

        const history = appendAll([D1, D2, D3, D4, D5]);
        const timeline = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimeline(history);

        assert(timeline.entryCount === 5, '29. FLAGSHIP #2 — five decisions produce five entries, never collapsed');
        const [e1, e2, e3, e4, e5] = timeline.entries;
        assert(e1.disposition === 'OBSERVE' && e1.claimId === claimB.id && e1.snapshotIndex === 0 && e1.decidedAt === T1.toISOString(), '30. FLAGSHIP #2 — entry 1 is OBSERVE B<->S2 @ t1');
        assert(e2.disposition === 'DEFER' && e2.claimId === claimB.id && e2.snapshotIndex === 1 && e2.decidedAt === T2.toISOString(), '31. FLAGSHIP #2 — entry 2 is DEFER B<->S3 @ t2');
        assert(e3.disposition === 'OBSERVE' && e3.claimId === claimC.id && !('snapshotIndex' in e3) && e3.decidedAt === T2.toISOString(), '32. FLAGSHIP #2 — entry 3 is OBSERVE C<->none @ t2, appended after entry 2, so it sits after it despite the equal decidedAt');
        assert(e4.disposition === 'OBSERVE' && e4.snapshotIndex === 2 && !('claimId' in e4) && e4.decidedAt === T3.toISOString(), '33. FLAGSHIP #2 — entry 4 is OBSERVE none<->S4 @ t3');
        assert(e5.disposition === 'DEFER' && e5.claimId === claimB.id && e5.snapshotIndex === 0 && e5.decidedAt === T3.toISOString(), '34. FLAGSHIP #2 — entry 5 is DEFER B<->S2 @ t3, appended after entry 4, so it sits after it despite the equal decidedAt');
        // The final DEFER never supersedes, removes, or reorders the earlier
        // OBSERVE of the identical candidate — both remain, in their own
        // chronological place.
        assert(e1.disposition === 'OBSERVE' && e5.disposition === 'DEFER' && e1.claimId === e5.claimId && e1.snapshotIndex === e5.snapshotIndex, '35. FLAGSHIP #2 — the earlier OBSERVE on B<->S2 and the later DEFER on the identical candidate both remain, as separate entries');
    }
    console.log('✓ Section G: FLAGSHIP #2 — the milestone\'s own worked example preserves chronological order, equal-time insertion order, candidate type, claim/snapshot identity, disposition, and exact decidedAt, with no supersession implied');

    // ---------------------------------------------------------------
    // Section H — malformed input tolerance.
    // ---------------------------------------------------------------
    {
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimeline().entryCount === 0, '36. calling with no arguments defaults to an empty timeline, never throws');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimeline(null).entryCount === 0, '37. null history degrades to empty, never throws');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimeline(undefined).entryCount === 0, '38. undefined history degrades to empty, never throws');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimeline('not an array').entryCount === 0, '39. a non-array history degrades to empty, never throws');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimeline(42).entryCount === 0, '40. a non-array, non-string history degrades to empty, never throws');

        const { plan, claimB } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const mixed = [null, undefined, 42, 'not a decision', {}, { decided: false, outcome: 'INVALID_SELECTION' }, { decided: 'true' }, { decided: true, candidate: { type: 'DIVERGENT_CORRESPONDENCE' }, decision: 'OBSERVE', decidedAt: 'not a date' }, D1];
        const timeline = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimeline(mixed);
        assert(timeline.entryCount === 1, '41. non-genuine entries, including one with an unparseable decidedAt, are silently excluded, leaving only the one genuine decision');
    }
    console.log('✓ Section H: malformed/absent input degrades to a valid, empty timeline rather than throwing, and non-genuine entries are silently excluded');

    // ---------------------------------------------------------------
    // Section I — no mutation, frozen results.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const history = appendAll([D1]);
        const historyJsonBefore = serialize(history);

        const timeline = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimeline(history);

        assert(serialize(history) === historyJsonBefore, '42. the input history is never mutated');
        assert(Object.isFrozen(timeline), '43. the result is frozen');
        assert(Object.isFrozen(timeline.entries), '44. entries is frozen');
        assert(Object.isFrozen(timeline.entries[0]), '45. each entry within entries is itself frozen');
    }
    console.log('✓ Section I: the input history is never mutated, and every returned object/array is frozen');

    // ---------------------------------------------------------------
    // Section J — determinism, and reconstruct()'s thin boundary.
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const D2 = decide(plan, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id }, 'DEFER', T2);
        const history = appendAll([D1, D2]);

        const timelineOnce = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimeline(history);
        const timelineTwice = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimeline(history);
        assert(serialize(timelineOnce) === serialize(timelineTwice), '46. repeated calls on an identical history are byte-identical');

        // 0.8.150 — reconstruct() now reads its history from a real
        // archive's own reconciliationDecisionRecords collection.
        let archive = PublicationObservationArchive.empty();
        archive = archive.appendReconciliationDecisionRecord(D1);
        archive = archive.appendReconciliationDecisionRecord(D2);
        const reconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimeline(archive);
        assert(serialize(reconstructed) === serialize(timelineOnce), '47. reconstruct() over an archive holding the SAME decisions agrees exactly with describe() over the raw history');
        assert(reconstructed.entryCount === 2, '48. reconstruct() reports exactly the entries the archive genuinely holds, never more, never fewer');

        const emptyTimeline = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimeline([]);
        const emptyReconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimeline(PublicationObservationArchive.empty());
        assert(serialize(emptyReconstructed) === serialize(emptyTimeline), '49. reconstruct() over an empty archive agrees exactly with describe() over an empty history');

        const invalidArchiveReconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimeline(null);
        assert(serialize(invalidArchiveReconstructed) === serialize(emptyTimeline), '50. reconstruct() over an invalid/missing archive degrades to the empty-history result, never a throw');
    }
    console.log('✓ Section J: repeated computation over the same history is byte-identical, and reconstruct() reads its history from the archive\'s own durable collection');

    // ---------------------------------------------------------------
    // Section K — vocabulary boundary.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const timeline = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimeline(appendAll([D1]));

        const topKeys = Object.keys(timeline).sort();
        assert(serialize(topKeys) === serialize(['entries', 'entryCount'].sort()), '51. the result carries exactly the documented, factual top-level fields');

        const entryKeys = Object.keys(timeline.entries[0]).sort();
        assert(serialize(entryKeys) === serialize(['candidateType', 'claimId', 'snapshotIndex', 'disposition', 'decidedAt'].sort()), '52. an entry carries exactly the documented, factual fields for a candidate shape that has both claimId and snapshotIndex');

        const forbidden = ['resolved', 'unresolved', 'pending', 'superseded', 'active', 'stale', 'correct', 'incorrect', 'approved', 'rejected'];
        for (const term of forbidden) {
            assert(!topKeys.includes(term) && !entryKeys.includes(term), `53. the result never carries state-machine vocabulary ('${term}')`);
        }

        const moduleSource = await (await import('node:fs/promises')).readFile(new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimelineView.js', import.meta.url), 'utf8');
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();
        const forbiddenInCode = ['resolved', 'unresolved', 'pending', 'superseded', 'active', 'stale', 'correct', 'incorrect', 'approved', 'rejected', 'repair', 'replace', 'accept', 'reject', 'merge', 'delete', 'apply', 'winner', 'execute', 'authoritative', 'trust', 'confidence', 'reputation', 'severity'];
        for (const term of forbiddenInCode) {
            assert(!codeOnly.includes(term), `54. this file's own code never carries "${term}"`);
        }

        // 0.8.150 — this file now imports exactly ONE module: the archive
        // reconstruction seam (application/
        // PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryView.js),
        // used only by reconstructXxx() below. It still imports nothing from
        // the reconciliation FAMILY itself (plan/candidate/decision).
        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.length === 1, '55. this file imports exactly one module');
        assert(importLines[0].includes('PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryView.js'), '56. the one import is the 0.8.150 archive reconstruction seam, never the reconciliation family itself');
    }
    console.log('✓ Section K: the result carries no state-machine or interpretive vocabulary, and the module imports only the 0.8.150 archive reconstruction seam');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimelineView tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimelineView.test.js FAILED:', error);
    process.exitCode = 1;
});
