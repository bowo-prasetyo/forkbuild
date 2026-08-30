import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { describePublisherLeaderboardSnapshot } from '../application/PublisherLeaderboardSnapshot.js';
import { describePublisherLeaderboardSnapshotFingerprint } from '../application/PublisherLeaderboardSnapshotFingerprint.js';
import { LeaderboardClaimRecord } from '../application/LeaderboardClaimRecord.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationPlan } from '../application/PublisherLeaderboardClaimSnapshotReconciliationPlanView.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationDecision } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecision.js';
import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js';
import {
    RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionIntoArchiveUseCase,
    ReconciliationDecisionArchiveOutcome
} from '../application/RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionIntoArchiveUseCase.js';
import { reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryView.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatisticsView.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimeline,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimeline
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimelineView.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference.js';
import { describePublicationObservationArchiveDifference } from '../application/PublicationObservationArchiveDifference.js';
import { describePublicationObservationArchiveReplacementReview } from '../application/PublicationObservationArchiveReplacementReview.js';
import {
    exportPublicationObservationArchive,
    importPublicationObservationArchive
} from '../application/PublicationObservationArchiveExport.js';
import { fingerprintPublicationObservationArchive } from '../application/PublicationObservationArchiveFingerprint.js';
import { reconstructAchievementEvidenceFingerprint } from '../application/AchievementEvidenceFingerprint.js';
import { PublicationObservationArchiveProvenanceOrigin } from '../application/PublicationObservationArchiveProvenance.js';
import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { PublisherLeaderboardSnapshotClaim } from '../core/PublisherLeaderboardSnapshotClaim.js';
import { LocalStoragePublicationObservationArchive } from '../storage/LocalStoragePublicationObservationArchive.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.8.150 — Durable Reconciliation Decision History Archive Integration.
//
// 0.8.145-0.8.149 built a complete, standalone reconciliation-decision
// subsystem — an explicit decision record, an append-only in-memory
// history, and three read-only projections (statistics/timeline/
// difference) — all deliberately over a plain, caller-held decision-history
// array, never durably persisted anywhere. This milestone answers the
// question those five milestones deliberately deferred: can a replica
// persist, reload, export, and compare its reconciliation decisions as
// durable evidence of what it has explicitly decided — while every
// semantic boundary established since 0.8.145 stays exactly where it was?
// It mirrors 0.8.130's own integration of the signed-claim subsystem, one
// subsystem over.
//
// Section A: empty archive compatibility — a fresh/pre-0.8.150 archive
//            loads with reconciliationDecisionRecords: []
// Section B: append and immutability — appendReconciliationDecisionRecord()
//            never mutates the receiver
// Section C: multiplicity — a genuine duplicate decision remains
//            independently stored, never deduplicated
// Section D: persistence — save -> reload preserves exact decisions
// Section E: malformed archive input — invalid decision records degrade
//            the WHOLE archive to empty, never a partial reconstruction
// Section F: history reconstruction — reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory()
//            is the one seam that reads the archive's own collection
// Section G: persistence use case — RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionIntoArchiveUseCase
//            records genuine decisions and rejects non-genuine ones,
//            without any verification, plan reconstruction, or execution
// Section H: projection composition — statistics/timeline/difference
//            reconstruct correctly from the durable history
// Section I: archive fingerprint separation — achievement-evidence
//            fingerprint stays unaffected by decision-history changes;
//            whole-archive fingerprint changes
// Section J: archive difference — decision differences are exposed
//            separately from achievement-evidence differences
// Section K: replacement review — the decision collection participates
//            without any trust judgment
// Section L: archive export/import — full round-trip preserves decision
//            history
// Section M: FLAGSHIP — Alice/Bob worked example from the milestone
//            request, end to end

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

// The identical world 0.8.144-0.8.149's own tests already use: Claim B
// genuinely diverges against Snapshot S2, Claim C has no corresponding
// snapshot, Snapshot S4 has no corresponding claim.
function buildWorld() {
    const bob = makeIdentity('Bob');
    const carl = makeIdentity('Carl');

    const s2 = snapshotOf(E2, makeLeaderboard(makePolicy(2), [makeEntry(1, BOB, 5)]));
    const s4 = snapshotOf(E4, makeLeaderboard(makePolicy(4), [makeEntry(1, DIANA, 9)]));
    const snapshots = [s2, s4];

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

const T1 = new Date('2026-08-30T05:00:00Z');
const T2 = new Date('2026-08-30T05:05:00Z');
const T3 = new Date('2026-08-30T05:10:00Z');

async function run() {
    // ---------------------------------------------------------------
    // Section A — empty archive compatibility.
    // ---------------------------------------------------------------
    {
        const empty = PublicationObservationArchive.empty();
        assert(Array.isArray(empty.reconciliationDecisionRecords) && empty.reconciliationDecisionRecords.length === 0, '1. a fresh archive holds an empty reconciliationDecisionRecords collection');
        assert(Array.isArray(empty.reconciliationDecisionRecordProvenance) && empty.reconciliationDecisionRecordProvenance.length === 0, '2. a fresh archive holds an empty reconciliationDecisionRecordProvenance collection');
        assert(empty.reconciliationDecisionRecordCount === 0, '3. a fresh archive reports reconciliationDecisionRecordCount 0');
        assert(PublicationObservationArchive.SCHEMA_VERSION === 10, '4. SCHEMA_VERSION has since advanced to 10 (0.8.167) — this archive round-trips reconciliationDecisionRecords unchanged regardless');
    }
    console.log('✓ Section A: a fresh archive holds an empty reconciliationDecisionRecords collection under the current schema version');

    // ---------------------------------------------------------------
    // Section B — append and immutability.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);

        const before = PublicationObservationArchive.empty();
        const after = before.appendReconciliationDecisionRecord(D1);

        assert(before.reconciliationDecisionRecordCount === 0, '5. appendReconciliationDecisionRecord() never mutates the receiver');
        assert(after.reconciliationDecisionRecordCount === 1, '6. the returned archive holds exactly the appended decision');
        assert(after.reconciliationDecisionRecords[0] === D1, '7. the appended decision is stored by reference, never copied');
        assert(after.reconciliationDecisionRecordProvenance[0] === PublicationObservationArchiveProvenanceOrigin.LOCAL, '8. appendReconciliationDecisionRecord() defaults to LOCAL provenance');

        const importedAfter = before.appendReconciliationDecisionRecord(D1, PublicationObservationArchiveProvenanceOrigin.IMPORTED);
        assert(importedAfter.reconciliationDecisionRecordProvenance[0] === PublicationObservationArchiveProvenanceOrigin.IMPORTED, '9. origin is overridable to IMPORTED');

        // A non-genuine decision (not `decided === true`) is a no-op,
        // mirroring 0.8.146's own appendXxx() tolerance exactly.
        const stillEmpty = PublicationObservationArchive.empty().appendReconciliationDecisionRecord({ decided: false, outcome: 'INVALID_SELECTION' });
        assert(stillEmpty.reconciliationDecisionRecordCount === 0, '10. a non-genuine decision is never appended');
        const stillEmpty2 = PublicationObservationArchive.empty().appendReconciliationDecisionRecord(null);
        assert(stillEmpty2.reconciliationDecisionRecordCount === 0, '11. a missing decision is never appended');

        // A no-op append returns the IDENTICAL instance (`this`), never a
        // freshly allocated but equal archive.
        const emptyArchive = PublicationObservationArchive.empty();
        assert(emptyArchive.appendReconciliationDecisionRecord(null) === emptyArchive, '12. a no-op append returns the exact same archive instance');
        assert(emptyArchive.appendReconciliationDecisionRecord(D1, 'bogus-origin') === emptyArchive, '13. an invalid origin is also a no-op, returning the exact same instance');
    }
    console.log('✓ Section B: appendReconciliationDecisionRecord() never mutates the receiver, defaults to LOCAL provenance, and tolerates non-genuine input as a true no-op');

    // ---------------------------------------------------------------
    // Section C — multiplicity: a genuine duplicate decision remains
    // independently stored, never deduplicated.
    // ---------------------------------------------------------------
    {
        const { plan, claimC } = buildWorld();
        const selectionC = { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id };
        const D2 = decide(plan, selectionC, 'DEFER', T2);
        const D2Duplicate = decide(plan, selectionC, 'DEFER', T2);

        assert(D2 !== D2Duplicate, '14. two independently computed decisions over identical inputs are distinct objects');
        assert(serialize(D2) === serialize(D2Duplicate), '15. ...but are byte-identical in content — a genuine duplicate');

        let archive = PublicationObservationArchive.empty();
        archive = archive.appendReconciliationDecisionRecord(D2);
        archive = archive.appendReconciliationDecisionRecord(D2Duplicate);
        assert(archive.reconciliationDecisionRecordCount === 2, '16. recording the byte-identical decision twice produces TWO independent entries, never deduplicated');
    }
    console.log('✓ Section C: a genuine duplicate decision remains independently stored — multiplicity is preserved, never deduplicated');

    // ---------------------------------------------------------------
    // Section D — persistence: save -> reload preserves exact decisions.
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const D2 = decide(plan, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id }, 'DEFER', T2);

        let archive = PublicationObservationArchive.empty();
        archive = archive.appendReconciliationDecisionRecord(D1);
        archive = archive.appendReconciliationDecisionRecord(D2, PublicationObservationArchiveProvenanceOrigin.IMPORTED);

        const store = new LocalStoragePublicationObservationArchive(new InMemoryStorageProvider());
        store.save(archive);
        const reloaded = store.load();

        assert(reloaded.reconciliationDecisionRecordCount === 2, '17. reload preserves the exact decision count');
        assert(serialize(reloaded.reconciliationDecisionRecords[0]) === serialize(D1), '18. the first reloaded decision is byte-identical to the original');
        assert(serialize(reloaded.reconciliationDecisionRecords[1]) === serialize(D2), '19. the second reloaded decision is byte-identical to the original');
        assert(reloaded.reconciliationDecisionRecordProvenance[0] === PublicationObservationArchiveProvenanceOrigin.LOCAL, '20. LOCAL provenance survives reload');
        assert(reloaded.reconciliationDecisionRecordProvenance[1] === PublicationObservationArchiveProvenanceOrigin.IMPORTED, '21. IMPORTED provenance survives reload');
    }
    console.log('✓ Section D: save -> reload preserves the exact decisions, their order, and their per-entry provenance');

    // ---------------------------------------------------------------
    // Section E — malformed archive input degrades the WHOLE archive to
    // empty, never a partial reconstruction.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        let archive = PublicationObservationArchive.empty().appendReconciliationDecisionRecord(D1);
        const goodJSON = archive.toJSON();

        const malformedDecision = { ...goodJSON, reconciliationDecisionRecords: [{ decided: true, candidate: {}, decision: 'BOGUS', decidedAt: 'not-a-date' }] };
        const degraded = PublicationObservationArchive.fromJSON(malformedDecision);
        assert(degraded.reconciliationDecisionRecordCount === 0, '22. a malformed decision record degrades the WHOLE archive to empty');
        assert(degraded.leaderboardClaimRecordCount === 0 && degraded.publicationCount === 0, '23. every OTHER collection also degrades to empty — never a partial reconstruction');

        const mismatchedProvenance = { ...goodJSON, reconciliationDecisionRecordProvenance: [] };
        assert(PublicationObservationArchive.fromJSON(mismatchedProvenance).reconciliationDecisionRecordCount === 0, '24. a provenance array whose length disagrees with its own factual array degrades to empty');

        const wrongSchema = { ...goodJSON, schemaVersion: 8 };
        assert(PublicationObservationArchive.fromJSON(wrongSchema).reconciliationDecisionRecordCount === 0, '25. a pre-0.8.150 schemaVersion (8) degrades to empty, never a partial migration');

        // A genuinely valid archive still round-trips correctly.
        const restored = PublicationObservationArchive.fromJSON(goodJSON);
        assert(restored.reconciliationDecisionRecordCount === 1, '26. a genuinely well-formed payload round-trips without degradation');
    }
    console.log('✓ Section E: a malformed reconciliationDecisionRecords/Provenance payload, or a pre-0.8.150 schemaVersion, degrades the WHOLE archive to empty');

    // ---------------------------------------------------------------
    // Section F — history reconstruction: the one seam.
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const D2 = decide(plan, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id }, 'DEFER', T2);

        let archive = PublicationObservationArchive.empty();
        archive = archive.appendReconciliationDecisionRecord(D1);
        archive = archive.appendReconciliationDecisionRecord(D2);

        const reconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory(archive);
        assert(reconstructed === archive.reconciliationDecisionRecords, '27. reconstruct() returns exactly the archive\'s own collection, unchanged');
        assert(reconstructed.length === 2 && reconstructed[0] === D1 && reconstructed[1] === D2, '28. the reconstructed history preserves order and object identity');

        assert(reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory(null).length === 0, '29. an invalid/missing archive degrades to an empty history, never a throw');
        assert(reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory(undefined).length === 0, '30. ...for undefined too');
    }
    console.log('✓ Section F: reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory() is the one seam that reads the archive\'s own durable collection, unchanged');

    // ---------------------------------------------------------------
    // Section G — the persistence use case: records genuine decisions,
    // rejects non-genuine ones, and does no verification, plan
    // reconstruction, or execution of any kind.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const useCase = new RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionIntoArchiveUseCase();

        const startingArchive = PublicationObservationArchive.empty();
        const result = useCase.execute(startingArchive, D1);
        assert(result.outcome === ReconciliationDecisionArchiveOutcome.RECORDED, '31. a genuine decision is RECORDED');
        assert(result.record === D1, '32. the returned record is exactly the decision supplied, never rederived');
        assert(result.archive.reconciliationDecisionRecordCount === 1, '33. the returned archive holds exactly the recorded decision');
        assert(startingArchive.reconciliationDecisionRecordCount === 0, '34. the archive handed in is never mutated');
        assert(result.reason === null, '35. a RECORDED outcome carries no reason');

        const invalidSelection = describePublisherLeaderboardClaimSnapshotReconciliationDecision(plan, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'nonexistent-claim' }, 'OBSERVE', T1);
        assert(invalidSelection.decided === false, 'sanity: an invalid selection genuinely produces { decided: false }');
        const rejected = useCase.execute(startingArchive, invalidSelection);
        assert(rejected.outcome === ReconciliationDecisionArchiveOutcome.INVALID_DECISION, '36. a non-genuine decision ({ decided: false }) is INVALID_DECISION, never recorded');
        assert(rejected.record === null, '37. an INVALID_DECISION outcome carries no record');
        assert(rejected.archive === startingArchive, '38. an INVALID_DECISION outcome returns the exact archive instance handed in, unchanged');

        const nullResult = useCase.execute(startingArchive, null);
        assert(nullResult.outcome === ReconciliationDecisionArchiveOutcome.INVALID_DECISION, '39. a null decision is also INVALID_DECISION, never a throw');

        let threw = false;
        try { useCase.execute(startingArchive, D1, 'not-a-real-origin'); } catch { threw = true; }
        assert(threw, '40. an invalid origin argument throws');

        // The use case NEVER calls 0.8.144/0.8.145 itself — it never
        // recomputes a plan, never reselects a candidate, and never
        // interprets OBSERVE/DEFER. Proven by construction: this use
        // case's own module imports nothing from
        // PublisherLeaderboardClaimSnapshotReconciliationPlanView.js,
        // PublisherLeaderboardClaimSnapshotReconciliation.js, or
        // PublisherLeaderboardClaimSnapshotReconciliationDecision.js.
        const moduleSource = await (await import('node:fs/promises')).readFile(
            new URL('../application/RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionIntoArchiveUseCase.js', import.meta.url), 'utf8'
        );
        const importLines = moduleSource.split('\n').filter((line) => line.trim().startsWith('import ')).join('\n');
        assert(!importLines.includes('PublisherLeaderboardClaimSnapshotReconciliationPlanView'), '41. the use case never imports the plan boundary');
        assert(!importLines.includes('PublisherLeaderboardClaimSnapshotReconciliationDecision.js'), '42. the use case never imports 0.8.145\'s own decision boundary');
        assert(!importLines.includes('PublisherLeaderboardClaimSnapshotReconciliation.js'), '43. the use case never imports the candidate-selection boundary');
    }
    console.log('✓ Section G: RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionIntoArchiveUseCase records genuine decisions and rejects non-genuine ones, with no verification, plan reconstruction, or execution of any kind');

    // ---------------------------------------------------------------
    // Section H — projection composition: statistics/timeline/difference
    // reconstruct correctly from the durable history.
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const D2 = decide(plan, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id }, 'DEFER', T2);
        const D3 = decide(plan, { type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 1 }, 'OBSERVE', T3);

        let history = [];
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry(history, D1);
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry(history, D2);
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry(history, D3);

        let archive = PublicationObservationArchive.empty();
        for (const decision of history) archive = archive.appendReconciliationDecisionRecord(decision);

        const pureStats = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics(history);
        const archiveStats = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics(archive);
        assert(serialize(pureStats) === serialize(archiveStats), '44. statistics reconstructed from the archive agree byte-for-byte with the pure computation over the raw history');

        const pureTimeline = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimeline(history);
        const archiveTimeline = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimeline(archive);
        assert(serialize(pureTimeline) === serialize(archiveTimeline), '45. timeline reconstructed from the archive agrees byte-for-byte with the pure computation over the raw history');

        const otherArchive = PublicationObservationArchive.empty().appendReconciliationDecisionRecord(D1);
        const pureDiff = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference(history, [D1]);
        const archiveDiff = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference(archive, otherArchive);
        assert(serialize(pureDiff) === serialize(archiveDiff), '46. difference reconstructed from two archives agrees byte-for-byte with the pure computation over the raw histories');
    }
    console.log('✓ Section H: statistics/timeline/difference reconstructed from the archive agree exactly with their pure in-memory counterparts');

    // ---------------------------------------------------------------
    // Section I — archive fingerprint separation.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);

        const before = PublicationObservationArchive.empty();
        const after = before.appendReconciliationDecisionRecord(D1);

        assert(fingerprintPublicationObservationArchive(before) !== fingerprintPublicationObservationArchive(after), '47. recording a reconciliation decision changes the whole-archive fingerprint');
        assert(reconstructAchievementEvidenceFingerprint(before).fingerprint === reconstructAchievementEvidenceFingerprint(after).fingerprint, '48. the narrower achievement-evidence fingerprint is UNAFFECTED — a recorded decision is not achievement evidence');
    }
    console.log('✓ Section I: recording a reconciliation decision changes the whole-archive fingerprint but never the achievement-evidence fingerprint');

    // ---------------------------------------------------------------
    // Section J — archive difference exposes decision differences
    // separately, as a positional collection.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);

        const currentArchive = PublicationObservationArchive.empty();
        const externalArchive = PublicationObservationArchive.empty().appendReconciliationDecisionRecord(D1);

        const diff = describePublicationObservationArchiveDifference(currentArchive, externalArchive);
        assert(diff.reconciliationDecisionRecords.onlyInExternalCount === 1, '49. the archive-level difference reports the new decision as onlyInExternal');
        assert(diff.hasFactDifference === true, '50. hasFactDifference reflects the reconciliation-decision difference too');
    }
    console.log('✓ Section J: archive-level difference reports reconciliationDecisionRecords as its own positional collection');

    // ---------------------------------------------------------------
    // Section K — replacement review: the collection participates
    // without any trust judgment, and the multiset-aware decision-history
    // difference is exposed as a separate field.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);

        const currentArchive = PublicationObservationArchive.empty();
        const externalArchive = PublicationObservationArchive.empty().appendReconciliationDecisionRecord(D1);

        const review = describePublicationObservationArchiveReplacementReview(currentArchive, externalArchive);
        assert(review.current.reconciliationDecisionRecordCount === 0 && review.external.reconciliationDecisionRecordCount === 1, '51. both sides report their own reconciliationDecisionRecordCount independently');
        assert(review.reconciliationDecisionHistoryDifference.targetOnlyCount === 1, '52. the separate reconciliationDecisionHistoryDifference field reports the decision as target-only');
        assert(review.difference.reconciliationDecisionRecords.onlyInExternalCount === 1, '53. the embedded difference agrees with the archive-level positional comparison');

        const fieldNames = JSON.stringify(Object.keys(review)).toLowerCase();
        for (const forbidden of ['trust', 'verified', 'authentic', 'newer', 'better', 'reconcile', 'reconciled', 'reconciling', 'winner', 'safe', 'stale']) {
            assert(!fieldNames.includes(forbidden), `54. the review's own top-level field names never mention "${forbidden}"`);
        }
    }
    console.log('✓ Section K: the reconciliation-decision collection participates in replacement review as another independently inspectable collection — never a trust or "which side wins" judgment');

    // ---------------------------------------------------------------
    // Section L — archive export/import round-trips the full decision
    // history: identity, order, disposition, decidedAt, and candidate
    // shape all exact.
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const D2 = decide(plan, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id }, 'DEFER', T2);

        let archive = PublicationObservationArchive.empty();
        archive = archive.appendReconciliationDecisionRecord(D1);
        archive = archive.appendReconciliationDecisionRecord(D2);

        const exported = exportPublicationObservationArchive(archive);
        const { archive: imported } = importPublicationObservationArchive(exported);

        assert(imported.reconciliationDecisionRecordCount === 2, '55. import preserves the exact decision count');
        assert(serialize(imported.reconciliationDecisionRecords) === serialize(archive.reconciliationDecisionRecords), '56. import preserves every decision byte-for-byte');
        // Whole-archive import restamps provenance uniformly to IMPORTED —
        // application/PublicationObservationArchive.js's own
        // withUniformProvenance(), applied here exactly as it already is
        // for every other collection.
        assert(imported.reconciliationDecisionRecordProvenance.every((origin) => origin === PublicationObservationArchiveProvenanceOrigin.IMPORTED), '57. whole-archive import restamps every decision\'s own archive-level provenance to IMPORTED');
    }
    console.log('✓ Section L: archive export/import round-trips the full reconciliation decision history exactly, with provenance uniformly restamped');

    // ---------------------------------------------------------------
    // Section M — FLAGSHIP: the milestone's own worked Alice/Bob example.
    //
    //   Alice archive: D1 = OBSERVE, D2 = DEFER, D2 = DEFER (genuine
    //                  duplicate)                     -> decisionCount = 3
    //   Bob archive:   D1 = OBSERVE, D3 = OBSERVE      -> decisionCount = 2
    //
    // Then: serialize/deserialize preserves history exactly, multiplicity,
    // candidate shapes, decidedAt, disposition, and provenance — and
    // statistics(archive)/timeline(archive)/difference(archiveA, archiveB)
    // produce exactly the same results as their pure in-memory
    // counterparts.
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const selectionB = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 };
        const selectionC = { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id };
        const selectionS4 = { type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 1 };

        const D1 = decide(plan, selectionB, 'OBSERVE', T1);
        const D2 = decide(plan, selectionC, 'DEFER', T2);
        const D2Duplicate = decide(plan, selectionC, 'DEFER', T2);
        const D3 = decide(plan, selectionS4, 'OBSERVE', T3);

        assert(D2 !== D2Duplicate && serialize(D2) === serialize(D2Duplicate), 'sanity: D2/D2Duplicate are two genuinely distinct objects carrying byte-identical content');

        let aliceArchive = PublicationObservationArchive.empty();
        aliceArchive = aliceArchive.appendReconciliationDecisionRecord(D1);
        aliceArchive = aliceArchive.appendReconciliationDecisionRecord(D2);
        aliceArchive = aliceArchive.appendReconciliationDecisionRecord(D2Duplicate);

        let bobArchive = PublicationObservationArchive.empty();
        bobArchive = bobArchive.appendReconciliationDecisionRecord(D1);
        bobArchive = bobArchive.appendReconciliationDecisionRecord(D3);

        assert(aliceArchive.reconciliationDecisionRecordCount === 3, '58. FLAGSHIP — Alice\'s decisionCount is exactly 3');
        assert(bobArchive.reconciliationDecisionRecordCount === 2, '59. FLAGSHIP — Bob\'s decisionCount is exactly 2');

        // Serialization/deserialization round-trip: history preserved
        // exactly, multiplicity preserved, candidate shapes preserved,
        // decidedAt preserved, disposition preserved, provenance preserved.
        const aliceJSON = aliceArchive.toJSON();
        const aliceReloaded = PublicationObservationArchive.fromJSON(aliceJSON);
        assert(aliceReloaded.reconciliationDecisionRecordCount === 3, '60. FLAGSHIP — Alice\'s history is preserved exactly across serialization (count)');
        assert(serialize(aliceReloaded.reconciliationDecisionRecords) === serialize(aliceArchive.reconciliationDecisionRecords), '61. FLAGSHIP — Alice\'s history is preserved exactly across serialization (content, including the genuine duplicate\'s own multiplicity)');
        for (let i = 0; i < 3; i++) {
            const original = aliceArchive.reconciliationDecisionRecords[i];
            const reloaded = aliceReloaded.reconciliationDecisionRecords[i];
            assert(serialize(reloaded.candidate) === serialize(original.candidate), `62.${i}. FLAGSHIP — candidate shape preserved exactly at position ${i}`);
            assert(reloaded.decidedAt === original.decidedAt, `63.${i}. FLAGSHIP — decidedAt preserved exactly at position ${i}`);
            assert(reloaded.decision === original.decision, `64.${i}. FLAGSHIP — disposition preserved exactly at position ${i}`);
        }
        assert(serialize(aliceReloaded.reconciliationDecisionRecordProvenance) === serialize(aliceArchive.reconciliationDecisionRecordProvenance), '65. FLAGSHIP — provenance preserved exactly across serialization');

        // statistics(archive)/timeline(archive)/difference(archiveA, archiveB)
        // produce exactly the same results as their pure in-memory
        // counterparts.
        const aliceHistory = [D1, D2, D2Duplicate];
        const bobHistory = [D1, D3];

        const pureAliceStats = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics(aliceHistory);
        const archiveAliceStats = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics(aliceArchive);
        assert(serialize(pureAliceStats) === serialize(archiveAliceStats), '66. FLAGSHIP — statistics(aliceArchive) matches describe(aliceHistory) exactly');
        assert(archiveAliceStats.decisionCount === 3 && archiveAliceStats.deferCount === 2 && archiveAliceStats.observeCount === 1, '67. FLAGSHIP — Alice\'s statistics reflect the genuine duplicate DEFER as two separate decisions');

        const pureBobStats = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics(bobHistory);
        const archiveBobStats = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatistics(bobArchive);
        assert(serialize(pureBobStats) === serialize(archiveBobStats), '68. FLAGSHIP — statistics(bobArchive) matches describe(bobHistory) exactly');
        assert(archiveBobStats.decisionCount === 2 && archiveBobStats.observeCount === 2 && archiveBobStats.deferCount === 0, '69. FLAGSHIP — Bob\'s statistics reflect two independent OBSERVE decisions');

        const pureAliceTimeline = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimeline(aliceHistory);
        const archiveAliceTimeline = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimeline(aliceArchive);
        assert(serialize(pureAliceTimeline) === serialize(archiveAliceTimeline), '70. FLAGSHIP — timeline(aliceArchive) matches describe(aliceHistory) exactly');
        assert(archiveAliceTimeline.entryCount === 3, '71. FLAGSHIP — Alice\'s timeline carries all three decisions, including the duplicate, as separate entries');

        const pureDiff = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference(aliceHistory, bobHistory);
        const archiveDiff = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference(aliceArchive, bobArchive);
        assert(serialize(pureDiff) === serialize(archiveDiff), '72. FLAGSHIP — difference(aliceArchive, bobArchive) matches describe(aliceHistory, bobHistory) exactly');
        assert(archiveDiff.sourceCount === 3 && archiveDiff.targetCount === 2, '73. FLAGSHIP — raw counts match each archive\'s own decisionCount');
        // D1 (OBSERVE, shared) cancels out on both sides; Bob holds no
        // DEFER decision at all, so BOTH of Alice's own DEFER entries
        // (D2 and its genuine duplicate) remain sourceOnly — multiplicity
        // is preserved through the multiset difference, never collapsed to
        // "Alice has a DEFER Bob doesn't" as a single fact. Bob's own
        // OBSERVE D3 is targetOnly.
        assert(archiveDiff.sourceOnlyCount === 2 && archiveDiff.sourceOnly.every((entry) => entry.decision === 'DEFER'), '74. FLAGSHIP — Alice-only is exactly both surviving DEFER decisions — the duplicate\'s own multiplicity is preserved through the difference');
        assert(archiveDiff.targetOnlyCount === 1 && archiveDiff.targetOnly[0] === D3, '75. FLAGSHIP — Bob-only is exactly OBSERVE D3');
        assert(archiveDiff.sameHistory === false, '76. FLAGSHIP — Alice and Bob\'s decision histories genuinely differ');

        // Not a reconciliation state machine: OBSERVE, DEFER, DEFER remain
        // three distinct historical decisions on Alice's own archive — no
        // "currentDecision"/"activeDecision"/"superseded"/"resolved"/
        // "pending"/"final" field exists anywhere in what any of these
        // projections return.
        const forbiddenStateWords = ['currentdecision', 'activedecision', 'superseded', 'resolved', 'pending', 'final'];
        const flatKeys = JSON.stringify(Object.keys(archiveAliceStats)).toLowerCase()
            + JSON.stringify(Object.keys(archiveAliceTimeline)).toLowerCase()
            + JSON.stringify(Object.keys(archiveDiff)).toLowerCase();
        for (const term of forbiddenStateWords) {
            assert(!flatKeys.includes(term), `77. FLAGSHIP — no reconciliation-state-machine vocabulary ("${term}") exists anywhere in the archive-backed projections`);
        }
    }
    console.log('✓ Section M: FLAGSHIP — Alice (decisionCount=3, with a genuine duplicate DEFER) and Bob (decisionCount=2) round-trip through the archive exactly, and statistics/timeline/difference computed FROM the archive agree byte-for-byte with the pure in-memory computation, never collapsing decision history into a state machine');

    console.log('\nAll PublicationObservationArchiveReconciliationDecisionHistoryIntegration tests passed.');
}

run().catch((error) => {
    console.error('PublicationObservationArchiveReconciliationDecisionHistoryIntegration.test.js FAILED:', error);
    process.exitCode = 1;
});
