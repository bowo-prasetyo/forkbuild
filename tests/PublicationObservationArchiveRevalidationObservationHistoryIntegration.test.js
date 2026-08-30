import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js';
import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js';
import {
    RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationIntoArchiveUseCase,
    RevalidationObservationArchiveOutcome
} from '../application/RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationIntoArchiveUseCase.js';
import { reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryView.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplication,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplication
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplicationView.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimeline,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimeline
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimelineView.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference.js';
import { fingerprintPublicationObservationArchive } from '../application/PublicationObservationArchiveFingerprint.js';
import { reconstructAchievementEvidenceFingerprint } from '../application/AchievementEvidenceFingerprint.js';
import { PublicationObservationArchiveProvenanceOrigin } from '../application/PublicationObservationArchiveProvenance.js';
import { LocalStoragePublicationObservationArchive } from '../storage/LocalStoragePublicationObservationArchive.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.8.167 — Revalidation Observation History Archive Integration.
//
// 0.8.162-0.8.166 built a complete, standalone revalidation-observation
// subsystem — an explicit observation record, an append-only in-memory
// history, and three read-only projections (deduplication/timeline/
// difference) — all deliberately over a plain, caller-held observation-
// history array, never durably persisted anywhere. This milestone answers
// the question those five milestones deliberately deferred: can a replica
// persist, reload, and project its explicit revalidation observations as
// durable evidence of what it has explicitly checked — while every
// semantic boundary established since 0.8.162 stays exactly where it was?
// It mirrors 0.8.150's own integration of the reconciliation-decision
// subsystem, one subsystem over.
//
// Section A: empty archive compatibility — a fresh archive loads with
//            revalidationObservationRecords: [] under schemaVersion 10
// Section B: append and immutability — appendRevalidationObservationRecord()
//            never mutates the receiver
// Section C: multiplicity — a genuine duplicate observation remains
//            independently stored, never deduplicated
// Section D: persistence — save -> reload preserves exact observations
// Section E: malformed archive input — an invalid observation record
//            degrades the WHOLE archive to empty, never a partial
//            reconstruction
// Section F: history reconstruction — reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory()
//            is the one seam that reads the archive's own collection
// Section G: persistence use case — RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationIntoArchiveUseCase
//            records genuine observations and rejects non-genuine ones,
//            without any recomputation, plan reconstruction, or
//            revalidation of the embedded decision
// Section H: projection composition — deduplication/timeline/difference
//            reconstruct correctly from the durable history
// Section I: archive fingerprint separation — achievement-evidence
//            fingerprint stays unaffected by observation-history changes;
//            whole-archive fingerprint changes
// Section J: FLAGSHIP — Plan A / Decision D1 / Observation O1 @ T1,
//            Plan B / Decision D1 / Observation O2 @ T2, worked through
//            the full archive/persistence/projection chain

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

// A genuine 0.8.144/0.8.145 decision record — `selected: true` on the
// embedded candidate, exactly as `describePublisherLeaderboardClaimSnapshotReconciliationCandidate()`
// (0.8.144) itself always produces, so it round-trips through the
// archive's own strict `validateReconciliationDecisionRecord()` (reused,
// UNCHANGED, by this milestone's own `validateRevalidationObservationRecord()`).
function genuineDecisionRecord(candidate, decision, decidedAt) {
    return Object.freeze({
        decided: true,
        candidate: Object.freeze({ selected: true, ...candidate }),
        decision,
        decidedAt: decidedAt.toISOString()
    });
}

function planNaming({ claims = [], snapshots = [], divergent = [] } = {}) {
    return Object.freeze({
        divergentCorrespondences: Object.freeze(divergent),
        claimsWithoutCorrespondence: Object.freeze(claims.map((claimId) => Object.freeze({ claimId }))),
        snapshotsWithoutCorrespondence: Object.freeze(snapshots.map((snapshotIndex) => Object.freeze({ snapshotIndex })))
    });
}

function observe(decisionRecord, plan, observedAt) {
    const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation(decisionRecord, plan, observedAt);
    assert(result.observed === true, 'test setup — observe() must always produce a genuine observation');
    return result;
}

const T0 = new Date('2026-08-30T05:00:00Z');
const T1 = new Date('2026-08-30T06:00:00Z');
const T2 = new Date('2026-08-30T07:00:00Z');

const CANDIDATE_C1 = Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' });

function buildWorld() {
    const D1 = genuineDecisionRecord(CANDIDATE_C1, 'OBSERVE', T0);
    const planA = planNaming({ claims: ['C1'] });       // C1 present
    const planB = planNaming({ claims: ['C2'] });       // C1 absent
    return { D1, planA, planB };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — empty archive compatibility.
    // ---------------------------------------------------------------
    {
        const empty = PublicationObservationArchive.empty();
        assert(Array.isArray(empty.revalidationObservationRecords) && empty.revalidationObservationRecords.length === 0, '1. a fresh archive holds an empty revalidationObservationRecords collection');
        assert(Array.isArray(empty.revalidationObservationRecordProvenance) && empty.revalidationObservationRecordProvenance.length === 0, '2. a fresh archive holds an empty revalidationObservationRecordProvenance collection');
        assert(empty.revalidationObservationRecordCount === 0, '3. a fresh archive reports revalidationObservationRecordCount 0');
        assert(PublicationObservationArchive.SCHEMA_VERSION === 10, '4. this milestone advances SCHEMA_VERSION to 10');
    }
    console.log('✓ Section A: a fresh archive holds an empty revalidationObservationRecords collection under schemaVersion 10');

    // ---------------------------------------------------------------
    // Section B — append and immutability.
    // ---------------------------------------------------------------
    {
        const { D1, planA } = buildWorld();
        const O1 = observe(D1, planA, T1);

        const before = PublicationObservationArchive.empty();
        const after = before.appendRevalidationObservationRecord(O1);

        assert(before.revalidationObservationRecordCount === 0, '5. appendRevalidationObservationRecord() never mutates the receiver');
        assert(after.revalidationObservationRecordCount === 1, '6. the returned archive holds exactly the appended observation');
        assert(after.revalidationObservationRecords[0] === O1, '7. the appended observation is stored by reference, never copied');
        assert(after.revalidationObservationRecordProvenance[0] === PublicationObservationArchiveProvenanceOrigin.LOCAL, '8. appendRevalidationObservationRecord() defaults to LOCAL provenance');

        const importedAfter = before.appendRevalidationObservationRecord(O1, PublicationObservationArchiveProvenanceOrigin.IMPORTED);
        assert(importedAfter.revalidationObservationRecordProvenance[0] === PublicationObservationArchiveProvenanceOrigin.IMPORTED, '9. origin is overridable to IMPORTED');

        // A non-genuine observation (not `observed === true`) is a no-op,
        // mirroring 0.8.163's own appendXxx() tolerance exactly.
        const stillEmpty = PublicationObservationArchive.empty().appendRevalidationObservationRecord({ observed: false, outcome: 'INVALID_OBSERVATION' });
        assert(stillEmpty.revalidationObservationRecordCount === 0, '10. a non-genuine observation is never appended');
        const stillEmpty2 = PublicationObservationArchive.empty().appendRevalidationObservationRecord(null);
        assert(stillEmpty2.revalidationObservationRecordCount === 0, '11. a missing observation is never appended');

        // A no-op append returns the IDENTICAL instance (`this`), never a
        // freshly allocated but equal archive.
        const emptyArchive = PublicationObservationArchive.empty();
        assert(emptyArchive.appendRevalidationObservationRecord(null) === emptyArchive, '12. a no-op append returns the exact same archive instance');
        assert(emptyArchive.appendRevalidationObservationRecord(O1, 'bogus-origin') === emptyArchive, '13. an invalid origin is also a no-op, returning the exact same instance');
    }
    console.log('✓ Section B: appendRevalidationObservationRecord() never mutates the receiver, defaults to LOCAL provenance, and tolerates non-genuine input as a true no-op');

    // ---------------------------------------------------------------
    // Section C — multiplicity: a genuine duplicate observation remains
    // independently stored, never deduplicated.
    // ---------------------------------------------------------------
    {
        const { D1, planA } = buildWorld();
        const O1 = observe(D1, planA, T1);
        const O1Duplicate = observe(D1, planA, T1);

        assert(O1 !== O1Duplicate, '14. two independently computed observations over identical inputs are distinct objects');
        assert(serialize(O1) === serialize(O1Duplicate), '15. ...but are byte-identical in content — a genuine duplicate');

        let archive = PublicationObservationArchive.empty();
        archive = archive.appendRevalidationObservationRecord(O1);
        archive = archive.appendRevalidationObservationRecord(O1Duplicate);
        assert(archive.revalidationObservationRecordCount === 2, '16. recording the byte-identical observation twice produces TWO independent entries, never deduplicated');
    }
    console.log('✓ Section C: a genuine duplicate observation remains independently stored — multiplicity is preserved, never deduplicated');

    // ---------------------------------------------------------------
    // Section D — persistence: save -> reload preserves exact observations.
    // ---------------------------------------------------------------
    {
        const { D1, planA, planB } = buildWorld();
        const O1 = observe(D1, planA, T1);
        const O2 = observe(D1, planB, T2);

        let archive = PublicationObservationArchive.empty();
        archive = archive.appendRevalidationObservationRecord(O1);
        archive = archive.appendRevalidationObservationRecord(O2, PublicationObservationArchiveProvenanceOrigin.IMPORTED);

        const store = new LocalStoragePublicationObservationArchive(new InMemoryStorageProvider());
        store.save(archive);
        const reloaded = store.load();

        assert(reloaded.revalidationObservationRecordCount === 2, '17. reload preserves the exact observation count');
        assert(serialize(reloaded.revalidationObservationRecords[0]) === serialize(O1), '18. the first reloaded observation is byte-identical to the original');
        assert(serialize(reloaded.revalidationObservationRecords[1]) === serialize(O2), '19. the second reloaded observation is byte-identical to the original');
        assert(reloaded.revalidationObservationRecordProvenance[0] === PublicationObservationArchiveProvenanceOrigin.LOCAL, '20. LOCAL provenance survives reload');
        assert(reloaded.revalidationObservationRecordProvenance[1] === PublicationObservationArchiveProvenanceOrigin.IMPORTED, '21. IMPORTED provenance survives reload');
    }
    console.log('✓ Section D: save -> reload preserves the exact observations, their order, and their per-entry provenance');

    // ---------------------------------------------------------------
    // Section E — malformed archive input degrades the WHOLE archive to
    // empty, never a partial reconstruction.
    // ---------------------------------------------------------------
    {
        const { D1, planA } = buildWorld();
        const O1 = observe(D1, planA, T1);
        let archive = PublicationObservationArchive.empty().appendRevalidationObservationRecord(O1);
        const goodJSON = archive.toJSON();

        const malformedObservation = { ...goodJSON, revalidationObservationRecords: [{ observed: true, decision: {}, planIdentity: {}, candidatePresent: true, candidateType: 'BOGUS', candidateMatchesPlan: true, observedAt: 'not-a-date' }] };
        const degraded = PublicationObservationArchive.fromJSON(malformedObservation);
        assert(degraded.revalidationObservationRecordCount === 0, '22. a malformed observation record degrades the WHOLE archive to empty');
        assert(degraded.leaderboardClaimRecordCount === 0 && degraded.publicationCount === 0, '23. every OTHER collection also degrades to empty — never a partial reconstruction');

        const mismatchedProvenance = { ...goodJSON, revalidationObservationRecordProvenance: [] };
        assert(PublicationObservationArchive.fromJSON(mismatchedProvenance).revalidationObservationRecordCount === 0, '24. a provenance array whose length disagrees with its own factual array degrades to empty');

        const wrongSchema = { ...goodJSON, schemaVersion: 9 };
        assert(PublicationObservationArchive.fromJSON(wrongSchema).revalidationObservationRecordCount === 0, '25. a pre-0.8.167 schemaVersion (9) degrades to empty, never a partial migration');

        // A decision embedded in an observation record whose own candidate
        // lacks `selected: true` also fails — this milestone reuses
        // 0.8.150's own decision-shape validator unchanged, never a looser
        // copy of it.
        const unselectedCandidateObservation = {
            ...goodJSON,
            revalidationObservationRecords: [{
                observed: true,
                decision: { decided: true, candidate: { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C1' }, decision: 'OBSERVE', decidedAt: T0.toISOString() },
                planIdentity: goodJSON.revalidationObservationRecords[0].planIdentity,
                candidatePresent: true,
                candidateType: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT',
                candidateMatchesPlan: true,
                observedAt: T1.toISOString()
            }]
        };
        assert(PublicationObservationArchive.fromJSON(unselectedCandidateObservation).revalidationObservationRecordCount === 0, '26. an embedded decision whose candidate lacks selected:true degrades the whole archive to empty');

        // A genuinely valid archive still round-trips correctly.
        const restored = PublicationObservationArchive.fromJSON(goodJSON);
        assert(restored.revalidationObservationRecordCount === 1, '27. a genuinely well-formed payload round-trips without degradation');
    }
    console.log('✓ Section E: a malformed revalidationObservationRecords/Provenance payload, or a pre-0.8.167 schemaVersion, degrades the WHOLE archive to empty');

    // ---------------------------------------------------------------
    // Section F — history reconstruction: the one seam.
    // ---------------------------------------------------------------
    {
        const { D1, planA, planB } = buildWorld();
        const O1 = observe(D1, planA, T1);
        const O2 = observe(D1, planB, T2);

        let archive = PublicationObservationArchive.empty();
        archive = archive.appendRevalidationObservationRecord(O1);
        archive = archive.appendRevalidationObservationRecord(O2);

        const reconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory(archive);
        assert(reconstructed === archive.revalidationObservationRecords, '28. reconstruct() returns exactly the archive\'s own collection, unchanged');
        assert(reconstructed.length === 2 && reconstructed[0] === O1 && reconstructed[1] === O2, '29. the reconstructed history preserves order and object identity');

        assert(reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory(null).length === 0, '30. an invalid/missing archive degrades to an empty history, never a throw');
        assert(reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory(undefined).length === 0, '31. ...for undefined too');
    }
    console.log('✓ Section F: reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory() is the one seam that reads the archive\'s own durable collection, unchanged');

    // ---------------------------------------------------------------
    // Section G — the persistence use case: records genuine observations,
    // rejects non-genuine ones, and does no recomputation, plan
    // reconstruction, or revalidation of any kind.
    // ---------------------------------------------------------------
    {
        const { D1, planA } = buildWorld();
        const O1 = observe(D1, planA, T1);
        const useCase = new RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationIntoArchiveUseCase();

        const startingArchive = PublicationObservationArchive.empty();
        const result = useCase.execute(startingArchive, O1);
        assert(result.outcome === RevalidationObservationArchiveOutcome.RECORDED, '32. a genuine observation is RECORDED');
        assert(result.record === O1, '33. the returned record is exactly the observation supplied, never rederived');
        assert(result.archive.revalidationObservationRecordCount === 1, '34. the returned archive holds exactly the recorded observation');
        assert(startingArchive.revalidationObservationRecordCount === 0, '35. the archive handed in is never mutated');
        assert(result.reason === null, '36. a RECORDED outcome carries no reason');

        const invalidObservation = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation(null, planA, T1);
        assert(invalidObservation.observed === false, 'sanity: an invalid decisionRecord genuinely produces { observed: false }');
        const rejected = useCase.execute(startingArchive, invalidObservation);
        assert(rejected.outcome === RevalidationObservationArchiveOutcome.INVALID_OBSERVATION, '37. a non-genuine observation ({ observed: false }) is INVALID_OBSERVATION, never recorded');
        assert(rejected.record === null, '38. an INVALID_OBSERVATION outcome carries no record');
        assert(rejected.archive === startingArchive, '39. an INVALID_OBSERVATION outcome returns the exact archive instance handed in, unchanged');

        const nullResult = useCase.execute(startingArchive, null);
        assert(nullResult.outcome === RevalidationObservationArchiveOutcome.INVALID_OBSERVATION, '40. a null observation is also INVALID_OBSERVATION, never a throw');

        let threw = false;
        try { useCase.execute(startingArchive, O1, 'not-a-real-origin'); } catch { threw = true; }
        assert(threw, '41. an invalid origin argument throws');

        // The use case NEVER calls 0.8.157-0.8.162 itself — it never
        // revalidates the embedded decision, never reconstructs a plan, and
        // never recomputes a plan fingerprint. Proven by construction: this
        // use case's own module imports nothing from the revalidation
        // family.
        const moduleSource = await (await import('node:fs/promises')).readFile(
            new URL('../application/RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationIntoArchiveUseCase.js', import.meta.url), 'utf8'
        );
        const importLines = moduleSource.split('\n').filter((line) => line.trim().startsWith('import ')).join('\n');
        assert(!importLines.includes('RevalidationObservation.js'), '42. the use case never imports 0.8.162\'s own observation boundary');
        assert(!importLines.includes('PlanIdentity'), '43. the use case never imports any plan-identity module');
        assert(!importLines.includes('RevalidationView.js') && !importLines.includes('RevalidationPlanIdentityView.js'), '44. the use case never imports 0.8.157/0.8.158/0.8.161\'s own revalidation views');
    }
    console.log('✓ Section G: RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationIntoArchiveUseCase records genuine observations and rejects non-genuine ones, with no recomputation, plan reconstruction, or revalidation of any kind');

    // ---------------------------------------------------------------
    // Section H — projection composition: deduplication/timeline/difference
    // reconstruct correctly from the durable history.
    // ---------------------------------------------------------------
    {
        const { D1, planA, planB } = buildWorld();
        const O1 = observe(D1, planA, T1);
        const O2 = observe(D1, planB, T2);
        const O1Duplicate = observe(D1, planA, T1);

        let history = [];
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(history, O1);
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(history, O2);
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(history, O1Duplicate);

        let archive = PublicationObservationArchive.empty();
        for (const observation of history) archive = archive.appendRevalidationObservationRecord(observation);

        const pureDedup = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplication(history);
        const archiveDedup = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplication(archive);
        assert(serialize(pureDedup) === serialize(archiveDedup), '45. deduplication reconstructed from the archive agrees byte-for-byte with the pure computation over the raw history');
        assert(archiveDedup.observationCount === 3 && archiveDedup.distinctObservationCount === 2, '46. the reconstructed deduplication reflects the archive\'s own preserved multiplicity');

        const pureTimeline = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimeline(history);
        const archiveTimeline = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimeline(archive);
        assert(serialize(pureTimeline) === serialize(archiveTimeline), '47. timeline reconstructed from the archive agrees byte-for-byte with the pure computation over the raw history');

        const otherArchive = PublicationObservationArchive.empty().appendRevalidationObservationRecord(O1);
        const pureDiff = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference(history, [O1]);
        const archiveDiff = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference(archive, otherArchive);
        assert(serialize(pureDiff) === serialize(archiveDiff), '48. difference reconstructed from two archives agrees byte-for-byte with the pure computation over the raw histories');
    }
    console.log('✓ Section H: deduplication/timeline/difference reconstructed from the archive agree exactly with their pure in-memory counterparts');

    // ---------------------------------------------------------------
    // Section I — archive fingerprint separation.
    // ---------------------------------------------------------------
    {
        const { D1, planA } = buildWorld();
        const O1 = observe(D1, planA, T1);

        const before = PublicationObservationArchive.empty();
        const after = before.appendRevalidationObservationRecord(O1);

        assert(fingerprintPublicationObservationArchive(before) !== fingerprintPublicationObservationArchive(after), '49. recording a revalidation observation changes the whole-archive fingerprint');
        assert(reconstructAchievementEvidenceFingerprint(before).fingerprint === reconstructAchievementEvidenceFingerprint(after).fingerprint, '50. the narrower achievement-evidence fingerprint is UNAFFECTED — a recorded observation is not achievement evidence');
    }
    console.log('✓ Section I: recording a revalidation observation changes the whole-archive fingerprint but never the achievement-evidence fingerprint');

    // ---------------------------------------------------------------
    // Section J — FLAGSHIP: the milestone's own worked example.
    //
    //   Plan A -> Decision D1 -> Observation O1 @ T1
    //   Plan B -> Decision D1 -> Observation O2 @ T2
    //
    // Verifies: both observations survive archival persistence; their
    // different planFingerprints survive; their observedAt values survive;
    // duplicate observations remain duplicated; reconstruction returns the
    // original history order; deduplication sees the expected distinct
    // count; timeline produces the expected chronological order;
    // difference can compare two reconstructed archives; whole-archive
    // fingerprint changes when an observation is added; achievement-
    // evidence fingerprint does not change merely because an observation is
    // added.
    // ---------------------------------------------------------------
    {
        const { D1, planA, planB } = buildWorld();
        const O1 = observe(D1, planA, T1);
        const O2 = observe(D1, planB, T2);
        const O1Duplicate = observe(D1, planA, T1);

        assert(O1.planIdentity.planFingerprint !== O2.planIdentity.planFingerprint, 'sanity — Plan A and Plan B fingerprint differently');
        assert(O1.observedAt !== O2.observedAt, 'sanity — O1 and O2 were observed at different moments');

        let archive = PublicationObservationArchive.empty();
        archive = archive.appendRevalidationObservationRecord(O1);
        archive = archive.appendRevalidationObservationRecord(O2);
        archive = archive.appendRevalidationObservationRecord(O1Duplicate);

        assert(archive.revalidationObservationRecordCount === 3, '51. FLAGSHIP — the archive holds all three recorded observations, including the duplicate');

        // Persistence: save -> reload preserves every observation exactly,
        // including both distinct planFingerprints and both distinct
        // observedAt values.
        const store = new LocalStoragePublicationObservationArchive(new InMemoryStorageProvider());
        store.save(archive);
        const reloaded = store.load();

        assert(reloaded.revalidationObservationRecordCount === 3, '52. FLAGSHIP — reload preserves the exact observation count, duplicate included');
        assert(serialize(reloaded.revalidationObservationRecords) === serialize(archive.revalidationObservationRecords), '53. FLAGSHIP — reload preserves every observation byte-for-byte, in original order');
        assert(reloaded.revalidationObservationRecords[0].planIdentity.planFingerprint === O1.planIdentity.planFingerprint, '54. FLAGSHIP — Plan A\'s own planFingerprint survives persistence');
        assert(reloaded.revalidationObservationRecords[1].planIdentity.planFingerprint === O2.planIdentity.planFingerprint, '55. FLAGSHIP — Plan B\'s own planFingerprint survives persistence');
        assert(reloaded.revalidationObservationRecords[0].planIdentity.planFingerprint !== reloaded.revalidationObservationRecords[1].planIdentity.planFingerprint, '56. FLAGSHIP — the two plan fingerprints remain distinct after reload');
        assert(reloaded.revalidationObservationRecords[0].observedAt === O1.observedAt, '57. FLAGSHIP — O1\'s own observedAt survives persistence');
        assert(reloaded.revalidationObservationRecords[1].observedAt === O2.observedAt, '58. FLAGSHIP — O2\'s own observedAt survives persistence');

        // Reconstruction returns the original history order.
        const reconstructedHistory = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory(archive);
        assert(reconstructedHistory[0] === O1 && reconstructedHistory[1] === O2 && reconstructedHistory[2] === O1Duplicate, '59. FLAGSHIP — reconstruction preserves the exact original append order');

        // 0.8.164 sees the expected distinct count.
        const dedup = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplication(archive);
        assert(dedup.observationCount === 3 && dedup.distinctObservationCount === 2 && dedup.duplicateObservationCount === 1, '60. FLAGSHIP — deduplication reports 3 recorded, 2 distinct, 1 duplicate (O1/O1Duplicate collapse; O2 stays separate)');

        // 0.8.165 produces the expected chronological order (O1 @ T1
        // before O2 @ T2; the O1 duplicate, sharing T1, follows by
        // insertion-order tie-break).
        const timeline = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimeline(archive);
        assert(timeline.observationCount === 3, '61. FLAGSHIP — the timeline carries all three observations, including the duplicate, as separate entries');
        assert(timeline.timeline[0].observedAt === O1.observedAt && timeline.timeline[1].observedAt === O1.observedAt && timeline.timeline[2].observedAt === O2.observedAt, '62. FLAGSHIP — O1 and its duplicate (both @ T1) precede O2 (@ T2) in the reconstructed timeline');

        // 0.8.166 can compare two reconstructed archives.
        const aliceArchive = archive; // O1, O2, O1Duplicate
        let bobArchive = PublicationObservationArchive.empty();
        bobArchive = bobArchive.appendRevalidationObservationRecord(O1);
        const diff = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference(aliceArchive, bobArchive);
        assert(diff.sourceCount === 3 && diff.targetCount === 1, '63. FLAGSHIP — difference reports each archive\'s own raw observation count');
        assert(diff.sourceOnlyCount === 2 && diff.sourceOnly.includes(O2) && diff.sourceOnly.includes(O1Duplicate), '64. FLAGSHIP — Alice-only is exactly O2 and the surviving O1 duplicate (one O1 cancels against Bob\'s own O1)');
        assert(diff.targetOnlyCount === 0, '65. FLAGSHIP — Bob holds nothing Alice does not also hold');
        assert(diff.sameHistory === false, '66. FLAGSHIP — Alice and Bob\'s observation histories genuinely differ');

        // Whole-archive fingerprint changes when an observation is added;
        // achievement-evidence fingerprint does not change merely because
        // an observation is added.
        const preAppendArchive = PublicationObservationArchive.empty();
        const postAppendArchive = preAppendArchive.appendRevalidationObservationRecord(O1);
        assert(fingerprintPublicationObservationArchive(preAppendArchive) !== fingerprintPublicationObservationArchive(postAppendArchive), '67. FLAGSHIP — the whole-archive fingerprint changes when an observation is added');
        assert(reconstructAchievementEvidenceFingerprint(preAppendArchive).fingerprint === reconstructAchievementEvidenceFingerprint(postAppendArchive).fingerprint, '68. FLAGSHIP — the achievement-evidence fingerprint does NOT change merely because an observation is added');

        // Not a second observation engine: no state-machine vocabulary
        // exists anywhere in what any of these projections return.
        const forbiddenStateWords = ['currentobservation', 'activeobservation', 'superseded', 'resolved', 'pending', 'final', 'stale', 'authoritative'];
        const flatKeys = JSON.stringify(Object.keys(dedup)).toLowerCase()
            + JSON.stringify(Object.keys(timeline)).toLowerCase()
            + JSON.stringify(Object.keys(diff)).toLowerCase();
        for (const term of forbiddenStateWords) {
            assert(!flatKeys.includes(term), `69. FLAGSHIP — no observation-state-machine vocabulary ("${term}") exists anywhere in the archive-backed projections`);
        }
    }
    console.log('✓ Section J: FLAGSHIP — Plan A/Decision D1/Observation O1@T1 and Plan B/Decision D1/Observation O2@T2 round-trip through the archive exactly, with distinct plan fingerprints, distinct observedAt values, preserved duplicate multiplicity, and byte-for-byte agreement between every archive-backed projection and its pure in-memory counterpart');

    console.log('\nAll PublicationObservationArchiveRevalidationObservationHistoryIntegration tests passed.');
}

run().catch((error) => {
    console.error('PublicationObservationArchiveRevalidationObservationHistoryIntegration.test.js FAILED:', error);
    process.exitCode = 1;
});
