import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js';
import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js';
import { reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage } from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import {
    exportPublicationObservationArchive,
    importPublicationObservationArchive,
    PublicationObservationArchiveImportOutcome
} from '../application/PublicationObservationArchiveExport.js';

// 0.8.181 — Explicit Peer Archive Leaderboard Comparison.
//
// 0.8.180 rendered the leaderboard with `targetArchive` permanently
// `PublicationObservationArchive.empty()` — a fact this milestone's own
// test already covers and does not repeat here. This file covers exactly
// what changed: `targetArchive` can now be a REAL, explicitly-supplied
// peer archive, and the page genuinely reads it.
//
// Section A: FLAGSHIP — the C1/C2/C3 asymmetric scenario, read once as
//            A -> B and once as B -> A: shared evidence is unchanged by
//            direction, source-only/target-only swap exactly, and the
//            target-only candidate (C3) is genuinely visible from both
//            directions.
// Section B: the peer-archive supply mechanism itself — export a real
//            archive to JSON text, import it back via 0.8.82's own
//            `importPublicationObservationArchive()` (the exact seam
//            `ui/views/ReconciliationCandidateLeaderboardView.js`'s own
//            `usePeerArchive()` calls), and prove the leaderboard reads
//            an imported peer archive identically to the original object.
// Section C: malformed peer input is rejected, never silently treated as
//            an empty archive, and never overwrites a previously-supplied
//            genuine one.
// Section D: the view's own wiring — imports 0.8.82's import seam,
//            defines usePeerArchive()/clearPeerArchive(), never persists
//            the peer archive, never imports a networking/peer-discovery
//            module, calls 0.8.179's reconstructXxx() exactly once, and
//            carries no ranking/synchronization vocabulary in its code.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
}

function genuineDecisionRecord(candidate, decision, decidedAt) {
    return Object.freeze({ decided: true, candidate: Object.freeze(candidate), decision, decidedAt: decidedAt.toISOString() });
}

function appendDecisions(decisions) {
    let history = [];
    for (const decision of decisions) {
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry(history, decision);
    }
    return history;
}

function planNaming({ claims = [], snapshots = [], divergent = [] } = {}) {
    return Object.freeze({
        divergentCorrespondences: Object.freeze(divergent.map(([claimId, snapshotIndex]) => Object.freeze({
            claimId,
            snapshotIndex,
            divergence: Object.freeze({ evidenceFingerprintDiffers: true, policyVersionDiffers: false, snapshotFingerprintDiffers: false })
        }))),
        claimsWithoutCorrespondence: Object.freeze(claims.map((claimId) => Object.freeze({ claimId }))),
        snapshotsWithoutCorrespondence: Object.freeze(snapshots.map((snapshotIndex) => Object.freeze({ snapshotIndex })))
    });
}

function observe(decisionRecord, plan, observedAt) {
    const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation(decisionRecord, plan, observedAt);
    assert(result.observed === true, 'test setup — observe() must always produce a genuine observation');
    return result;
}

function appendObservations(observations) {
    let history = [];
    for (const observation of observations) {
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(history, observation);
    }
    return history;
}

const T1 = new Date('2026-08-31T06:00:00Z');
const T2 = new Date('2026-08-31T06:03:00Z');
const T3 = new Date('2026-08-31T06:07:00Z');
const T4 = new Date('2026-08-31T06:10:00Z');
const OBS_T1 = new Date('2026-08-31T12:00:00Z');
const OBS_T2 = new Date('2026-08-31T12:05:00Z');
const OBS_T3 = new Date('2026-08-31T12:10:00Z');
const OBS_T4 = new Date('2026-08-31T12:15:00Z');

// `selected: true` is part of 0.8.144's own genuine candidate shape (see
// application/PublicationObservationArchive.js's own
// `validateReconciliationDecisionCandidate()`) — required here, unlike in
// 0.8.179's/0.8.180's own flagship consts, because Section B below sends
// these candidates through a real `fromJSON()` round trip, which validates
// strictly.
const C1 = Object.freeze({ selected: true, type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'Claim-1' });
const C2 = Object.freeze({ selected: true, type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'Claim-2' });
const C3 = Object.freeze({ selected: true, type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 3 });

function rowFor(page, candidate) {
    return page.rows.find((row) => serialize(row.candidate) === serialize(candidate));
}

// The task's own flagship shape, byte-identical to 0.8.179's/0.8.180's own:
//
//   C1  decisions: shared + source-only        observations: shared + target-only
//   C2  decisions: shared (only)                observations: source-only (only)
//   C3  decisions: target-only (only)            observations: shared (only)
function buildFlagshipArchives() {
    const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
    const D1a = genuineDecisionRecord(C1, 'DEFER', T2);
    const D2 = genuineDecisionRecord(C2, 'OBSERVE', T3);
    const D3 = genuineDecisionRecord(C3, 'OBSERVE', T4);

    const sourceDecisionHistory = appendDecisions([D1, D1a, D2]);
    const targetDecisionHistory = appendDecisions([D1, D2, D3]);

    const plan = planNaming({ claims: ['Claim-1', 'Claim-2'], snapshots: [3] });

    const OA1 = observe(D1, plan, OBS_T1);
    const OA2 = observe(D1, plan, OBS_T2);
    const O2 = observe(D2, plan, OBS_T3);
    const O3 = observe(D3, plan, OBS_T4);

    const sourceObservationHistory = appendObservations([OA1, O2, O3]);
    const targetObservationHistory = appendObservations([OA1, OA2, O3]);

    // Provenance arrays must match their own collection's length for
    // `fromJSON()`'s own strict validation to accept a round trip (Section
    // B below exercises exactly that export -> import round trip) — every
    // record here is this test's own, so `LOCAL` throughout.
    const sourceArchive = new PublicationObservationArchive({
        reconciliationDecisionRecords: sourceDecisionHistory,
        reconciliationDecisionRecordProvenance: sourceDecisionHistory.map(() => 'local'),
        revalidationObservationRecords: sourceObservationHistory,
        revalidationObservationRecordProvenance: sourceObservationHistory.map(() => 'local')
    });
    const targetArchive = new PublicationObservationArchive({
        reconciliationDecisionRecords: targetDecisionHistory,
        reconciliationDecisionRecordProvenance: targetDecisionHistory.map(() => 'local'),
        revalidationObservationRecords: targetObservationHistory,
        revalidationObservationRecordProvenance: targetObservationHistory.map(() => 'local')
    });

    return { sourceArchive, targetArchive };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: A -> B and B -> A, over the identical two
    // archives.
    // ---------------------------------------------------------------
    {
        const { sourceArchive, targetArchive } = buildFlagshipArchives();
        const archiveA = sourceArchive;
        const archiveB = targetArchive;

        const pageAB = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage(archiveA, archiveB);
        const pageBA = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage(archiveB, archiveA);

        assert(pageAB.rowCount === 3 && pageBA.rowCount === 3, '1. FLAGSHIP — both directions find exactly the same three candidates, none dropped by direction');

        for (const candidate of [C1, C2, C3]) {
            const ab = rowFor(pageAB, candidate);
            const ba = rowFor(pageBA, candidate);
            assert(ab !== undefined && ba !== undefined, `2. FLAGSHIP — candidate ${serialize(candidate)} appears in both directions`);

            // Shared evidence is a property of the PAIR, not of which side
            // is "source" — unchanged by swapping.
            assert(ab.decisionEvidence.sharedCount === ba.decisionEvidence.sharedCount, `3. FLAGSHIP — decision sharedCount for ${serialize(candidate)} is unchanged by swapping the archives`);
            assert(ab.observationEvidence.sharedCount === ba.observationEvidence.sharedCount, `4. FLAGSHIP — observation sharedCount for ${serialize(candidate)} is unchanged by swapping the archives`);

            // Source-only/target-only are directional — swapping the
            // archives swaps them exactly, in both dimensions.
            assert(ab.decisionEvidence.sourceOnlyCount === ba.decisionEvidence.targetOnlyCount, `5. FLAGSHIP — A->B decision sourceOnlyCount for ${serialize(candidate)} equals B->A decision targetOnlyCount`);
            assert(ab.decisionEvidence.targetOnlyCount === ba.decisionEvidence.sourceOnlyCount, `6. FLAGSHIP — A->B decision targetOnlyCount for ${serialize(candidate)} equals B->A decision sourceOnlyCount`);
            assert(ab.observationEvidence.sourceOnlyCount === ba.observationEvidence.targetOnlyCount, `7. FLAGSHIP — A->B observation sourceOnlyCount for ${serialize(candidate)} equals B->A observation targetOnlyCount`);
            assert(ab.observationEvidence.targetOnlyCount === ba.observationEvidence.sourceOnlyCount, `8. FLAGSHIP — A->B observation targetOnlyCount for ${serialize(candidate)} equals B->A observation sourceOnlyCount`);
        }

        // The concrete numbers named in the task's own example: C1 reads
        // shared=1, sourceOnly=1, targetOnly=0 as A->B, and shared=1,
        // sourceOnly=0, targetOnly=1 as B->A.
        const c1ab = rowFor(pageAB, C1);
        const c1ba = rowFor(pageBA, C1);
        assert(c1ab.decisionEvidence.sharedCount === 1 && c1ab.decisionEvidence.sourceOnlyCount === 1 && c1ab.decisionEvidence.targetOnlyCount === 0, '9. FLAGSHIP — C1 decisions as A->B: shared=1, sourceOnly=1, targetOnly=0');
        assert(c1ba.decisionEvidence.sharedCount === 1 && c1ba.decisionEvidence.sourceOnlyCount === 0 && c1ba.decisionEvidence.targetOnlyCount === 1, '10. FLAGSHIP — the identical C1 decisions as B->A: shared=1, sourceOnly=0, targetOnly=1 — genuinely a directional comparison, not a fixed label');

        // C3 is a TARGET-ONLY candidate at the decision level as A->B (this
        // replica never decided about it at all) — it is still visible,
        // still carries the identical candidate identity, and becomes a
        // SOURCE-ONLY candidate the moment the same two archives are read
        // the other way around.
        const c3ab = rowFor(pageAB, C3);
        const c3ba = rowFor(pageBA, C3);
        assert(c3ab.decisionEvidence.targetOnlyCount === 1 && c3ab.decisionEvidence.sourceOnlyCount === 0, '11. FLAGSHIP — C3 (existing only in B\'s own decisions) is visible as target-only when read A->B');
        assert(c3ba.decisionEvidence.sourceOnlyCount === 1 && c3ba.decisionEvidence.targetOnlyCount === 0, '12. FLAGSHIP — the identical fact reads source-only once B is read as the source — candidates existing only in the target are genuinely visible, never dropped');

        // No ranking vocabulary in either direction's own result.
        const forbidden = ['conflict', 'conflicting', 'stale', 'resolved', 'correct', 'incorrect', 'winner', 'rank', 'score', 'confidence', 'status', 'preferred', 'valid'];
        for (const page of [pageAB, pageBA]) {
            const text = serialize(page).toLowerCase();
            for (const term of forbidden) {
                assert(!text.includes(term), `13. FLAGSHIP — neither direction's own page carries judgment/ranking vocabulary ('${term}')`);
            }
        }
    }
    console.log('✓ Section A: FLAGSHIP — swapping the two archives swaps source-only and target-only evidence in both dimensions while shared evidence, row count, and candidate visibility (including the target-only candidate) stay unchanged');

    // ---------------------------------------------------------------
    // Section B — the peer-archive supply mechanism itself: export ->
    // JSON text -> import, exactly as ui/views/
    // ReconciliationCandidateLeaderboardView.js's own usePeerArchive()
    // does it.
    // ---------------------------------------------------------------
    {
        const { sourceArchive, targetArchive } = buildFlagshipArchives();
        const beforeTarget = serialize(targetArchive.toJSON());

        const exportedJson = JSON.stringify(exportPublicationObservationArchive(targetArchive));
        const outcome = importPublicationObservationArchive(exportedJson);
        assert(outcome.outcome === PublicationObservationArchiveImportOutcome.IMPORTED, '14. a genuine exported peer archive imports successfully');
        assert(outcome.archive instanceof PublicationObservationArchive, '15. a successful import produces a real PublicationObservationArchive instance');

        const pageDirect = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage(sourceArchive, targetArchive);
        const pageViaPeerText = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage(sourceArchive, outcome.archive);

        assert(pageDirect.rowCount === pageViaPeerText.rowCount, '16. the leaderboard finds the same number of candidates whether targetArchive is supplied directly or via the export/import text round trip');
        for (const candidate of [C1, C2, C3]) {
            const direct = rowFor(pageDirect, candidate);
            const viaText = rowFor(pageViaPeerText, candidate);
            assert(serialize(direct.decisionEvidence) === serialize(viaText.decisionEvidence), `17. decisionEvidence for ${serialize(candidate)} is identical whether the peer archive arrived as an object or as pasted JSON text`);
            assert(serialize(direct.observationEvidence) === serialize(viaText.observationEvidence), `18. observationEvidence for ${serialize(candidate)} is identical whether the peer archive arrived as an object or as pasted JSON text`);
        }

        // Exporting and importing never mutates the original targetArchive
        // this replica happened to hold in this test's own setup.
        assert(serialize(targetArchive.toJSON()) === beforeTarget, '19. exporting/importing a peer archive never mutates the archive object it was read from');
    }
    console.log('✓ Section B: a peer archive supplied as pasted JSON text (export -> import, 0.8.82\'s own seam) produces a leaderboard result identical to supplying the same archive object directly — the paste mechanism genuinely carries a real archive, not a stand-in');

    // ---------------------------------------------------------------
    // Section C — malformed peer input is rejected, never silently
    // treated as empty, and never overwrites a previously-supplied
    // genuine archive.
    // ---------------------------------------------------------------
    {
        for (const malformed of ['not json at all', '{"schemaVersion": 999}', '', '   ', 'null', '42']) {
            const outcome = importPublicationObservationArchive(malformed);
            assert(outcome.outcome === PublicationObservationArchiveImportOutcome.INVALID_ARCHIVE, `20. malformed peer input (${serialize(malformed)}) is rejected as INVALID_ARCHIVE`);
            assert(outcome.archive === null, `21. a rejected peer import carries no archive at all — never a fabricated empty one (${serialize(malformed)})`);
        }

        // The exact "leave the prior target untouched" contract
        // usePeerArchive() relies on: a rejected outcome never supplies an
        // archive a caller could accidentally assign over an already-good
        // targetArchive.
        const { targetArchive } = buildFlagshipArchives();
        let simulatedTargetArchive = targetArchive;
        const badOutcome = importPublicationObservationArchive('not json at all');
        if (badOutcome.outcome === PublicationObservationArchiveImportOutcome.IMPORTED) {
            simulatedTargetArchive = badOutcome.archive;
        }
        assert(simulatedTargetArchive === targetArchive, '22. following usePeerArchive()\'s own IMPORTED-only assignment rule, a rejected paste leaves a previously-supplied genuine peer archive completely untouched');
    }
    console.log('✓ Section C: malformed peer archive input is rejected outright, never degrades to a fabricated empty archive, and (following the view\'s own assignment rule) never overwrites an already-supplied genuine peer archive');

    // ---------------------------------------------------------------
    // Section D — the view's own wiring.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(
            new URL('../ui/views/ReconciliationCandidateLeaderboardView.js', import.meta.url), 'utf8'
        );
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(codeOnly.includes("from '../../application/PublicationObservationArchiveExport.js'"), '23. the view imports 0.8.82\'s own archive export/import module');
        assert(/\bimportPublicationObservationArchive\b/.test(codeOnly), '24. the view uses 0.8.82\'s own importPublicationObservationArchive() — no second import/validation algorithm of its own');
        assert(codeOnly.includes('function usePeerArchive'), '25. the view defines its own explicit usePeerArchive() action');
        assert(codeOnly.includes('function clearPeerArchive'), '26. the view defines its own explicit clearPeerArchive() action, separate from usePeerArchive()');

        assert((codeOnly.match(/reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage\(/g) || []).length === 1,
            '27. the view still calls 0.8.179\'s own reconstructXxx() exactly once');
        assert(!codeOnly.toLowerCase().includes('reconciliationcandidateevidenceagreement') && !codeOnly.toLowerCase().includes('leaderboardreadmodel') && !codeOnly.toLowerCase().includes('leaderboardview.js'),
            '28. the view still never imports 0.8.176/0.8.177/0.8.178 directly');

        // Never persists the peer archive, and never touches
        // sourceArchive's own storage beyond the one, pre-existing
        // .load() call.
        assert(!codeOnly.includes('.save('), '29. the view never calls .save() anywhere — the peer archive is never persisted, and sourceArchive is never written back');
        assert((codeOnly.match(/\.load\(\)/g) || []).length === 1, '30. the view still calls .load() exactly once, for sourceArchive alone');

        // No real networking/peer-discovery module is involved — the
        // supply mechanism is a person's own explicit paste, never an
        // automatic fetch.
        const forbiddenModuleNames = ['peerconnection', 'rendezvous', 'discoverypeer', 'peermessagebus', 'websocket', 'webrtc'];
        const lowerSource = moduleSource.toLowerCase();
        for (const term of forbiddenModuleNames) {
            assert(!lowerSource.includes(term), `31. the view never imports or references a networking/peer-discovery module ("${term}") — supplying a peer archive is an explicit paste, never automatic fetching`);
        }

        // No ranking/synchronization vocabulary in the view's own code.
        const codeOnlyLower = codeOnly.toLowerCase();
        const forbiddenInCode = ['rank', 'score', 'winner', 'confidence', '.sort(', 'inconsistent', 'authoritative', 'resolved', 'conflicting', 'synchroniz', 'merge('];
        for (const term of forbiddenInCode) {
            assert(!codeOnlyLower.includes(term), `32. the view's own code never carries "${term}"`);
        }

        // The template exposes the explicit paste affordance the task
        // calls for — a real input a person fills in themselves, never a
        // hidden default.
        assert(moduleSource.includes('v-model="peerArchiveText"'), '33. the template binds a real input to the peer archive text a person supplies');
        assert(moduleSource.includes('@click="usePeerArchive"'), '34. the template wires an explicit click to usePeerArchive() — nothing happens on its own');
        assert(moduleSource.includes('@click="clearPeerArchive"'), '35. the template wires a separate explicit click to clearPeerArchive()');
    }
    console.log('✓ Section D: the view imports 0.8.82\'s own import seam, defines its own explicit use/clear actions, never persists the peer archive, never references any networking module, still calls 0.8.179\'s reconstructXxx() exactly once, and carries no ranking/synchronization vocabulary');

    console.log('\nAll ReconciliationCandidateLeaderboardPeerArchiveComparison tests passed.');
}

run().catch((error) => {
    console.error('ReconciliationCandidateLeaderboardPeerArchiveComparison.test.js FAILED:', error);
    process.exitCode = 1;
});
