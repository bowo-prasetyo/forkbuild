import {
    ReconciliationCandidateLeaderboardComparisonState,
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState.js';
import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js';
import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js';
import { reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage } from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';

// 0.8.183 — Reconciliation Candidate Leaderboard Comparison State.
//
// 0.8.181 gave a person a way to supply a real peer archive, but left one
// ambiguity standing: "no peer supplied yet" and "an explicitly supplied
// peer that genuinely has nothing recorded" read identically off the
// leaderboard's own counts — everything lands in Source-only either way.
// This file proves the fix: an explicit `comparisonState` fact
// (`NO_PEER`/`PEER_EMPTY`/`PEER_PRESENT`), computed WITHOUT touching a
// single evidence count, distinguishes the two.
//
// Section A: hasPeerArchive falsy always yields NO_PEER, regardless of
//            targetArchive's own shape or content.
// Section B: hasPeerArchive true + a genuinely empty target archive
//            yields PEER_EMPTY.
// Section C: hasPeerArchive true + a target archive holding at least one
//            decision record, or at least one observation record, yields
//            PEER_PRESENT — proven independently for each collection.
// Section D: malformed/absent targetArchive with hasPeerArchive true
//            degrades to PEER_EMPTY, never throws.
// Section E: the enum carries exactly the three documented values.
// Section F: no mutation, determinism.
// Section G: FLAGSHIP — State A (no peer) / State B (peer supplied,
//            empty) / State C (peer supplied, real evidence) produce
//            three genuinely distinct comparison states, while the page
//            (0.8.179) itself is BYTE-IDENTICAL between State A and
//            State B — comparisonState never reinterprets a count.
// Section H: vocabulary/import boundary — this module imports nothing,
//            and carries no ranking/judgment vocabulary.
// Section I: the view's own wiring.
// Section J: the table's own wiring.

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
const OBS_T1 = new Date('2026-08-31T12:00:00Z');
const C1 = Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'Claim-1' });

const { NO_PEER, PEER_EMPTY, PEER_PRESENT } = ReconciliationCandidateLeaderboardComparisonState;

async function run() {
    // ---------------------------------------------------------------
    // Section A — hasPeerArchive falsy always yields NO_PEER.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const nonEmptyArchive = new PublicationObservationArchive({ reconciliationDecisionRecords: appendDecisions([D1]) });

        for (const hasPeerArchive of [false, undefined, null, 0, '']) {
            for (const targetArchive of [PublicationObservationArchive.empty(), nonEmptyArchive, null, undefined, {}]) {
                const state = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState(hasPeerArchive, targetArchive);
                assert(state === NO_PEER, `1. hasPeerArchive=${serialize(hasPeerArchive)} always yields NO_PEER regardless of targetArchive's own shape`);
            }
        }
    }
    console.log('✓ Section A: a falsy hasPeerArchive always yields NO_PEER, regardless of targetArchive\'s own content — this file trusts the caller\'s explicit signal, never infers it from the archive');

    // ---------------------------------------------------------------
    // Section B — hasPeerArchive true + a genuinely empty archive yields
    // PEER_EMPTY.
    // ---------------------------------------------------------------
    {
        const state = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState(true, PublicationObservationArchive.empty());
        assert(state === PEER_EMPTY, '2. an explicitly supplied, genuinely empty peer archive yields PEER_EMPTY');
    }
    console.log('✓ Section B: hasPeerArchive true + a genuinely empty target archive yields PEER_EMPTY');

    // ---------------------------------------------------------------
    // Section C — a target archive holding at least one decision record,
    // or at least one observation record, yields PEER_PRESENT.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const decisionOnlyArchive = new PublicationObservationArchive({ reconciliationDecisionRecords: appendDecisions([D1]) });
        assert(describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState(true, decisionOnlyArchive) === PEER_PRESENT,
            '3. a peer archive holding one decision record (no observations) yields PEER_PRESENT');

        const plan = planNaming({ claims: ['Claim-1'] });
        const O1 = observe(D1, plan, OBS_T1);
        const observationOnlyArchive = new PublicationObservationArchive({ revalidationObservationRecords: appendObservations([O1]) });
        assert(describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState(true, observationOnlyArchive) === PEER_PRESENT,
            '4. a peer archive holding one observation record (no decisions) yields PEER_PRESENT');

        const bothArchive = new PublicationObservationArchive({
            reconciliationDecisionRecords: appendDecisions([D1]),
            revalidationObservationRecords: appendObservations([O1])
        });
        assert(describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState(true, bothArchive) === PEER_PRESENT,
            '5. a peer archive holding both kinds of record yields PEER_PRESENT');
    }
    console.log('✓ Section C: a supplied peer archive holding at least a decision record, an observation record, or both, yields PEER_PRESENT — proven independently for each collection');

    // ---------------------------------------------------------------
    // Section D — malformed/absent targetArchive degrades to PEER_EMPTY,
    // never throws.
    // ---------------------------------------------------------------
    {
        for (const malformed of [null, undefined, {}, 'not an archive', 42, { reconciliationDecisionRecordCount: 'not a number' }]) {
            const state = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState(true, malformed);
            assert(state === PEER_EMPTY, `6. malformed targetArchive (${serialize(malformed)}) with hasPeerArchive true degrades to PEER_EMPTY, never throws`);
        }
        assert(describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState(true) === PEER_EMPTY, '7. calling with no targetArchive argument at all degrades to PEER_EMPTY, never throws');
    }
    console.log('✓ Section D: malformed or absent targetArchive, with hasPeerArchive true, degrades to PEER_EMPTY rather than throwing');

    // ---------------------------------------------------------------
    // Section E — the enum carries exactly the three documented values.
    // ---------------------------------------------------------------
    {
        assert(Object.isFrozen(ReconciliationCandidateLeaderboardComparisonState), '8. the enum object is frozen');
        const keys = Object.keys(ReconciliationCandidateLeaderboardComparisonState).sort();
        assert(serialize(keys) === serialize(['NO_PEER', 'PEER_EMPTY', 'PEER_PRESENT'].sort()), '9. the enum carries exactly NO_PEER, PEER_EMPTY, PEER_PRESENT — no fourth value');
        assert(NO_PEER === 'NO_PEER' && PEER_EMPTY === 'PEER_EMPTY' && PEER_PRESENT === 'PEER_PRESENT', '10. each enum value is its own plain string');
    }
    console.log('✓ Section E: the comparison-state enum carries exactly three documented values, frozen');

    // ---------------------------------------------------------------
    // Section F — no mutation, determinism.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const archive = new PublicationObservationArchive({ reconciliationDecisionRecords: appendDecisions([D1]) });
        const before = serialize(archive.toJSON());

        const first = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState(true, archive);
        assert(serialize(archive.toJSON()) === before, '11. the supplied targetArchive is never mutated');

        const second = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState(true, archive);
        assert(first === second, '12. calling twice with byte-identical arguments returns the identical result');
    }
    console.log('✓ Section F: no mutation of the supplied targetArchive, and the computation is deterministic');

    // ---------------------------------------------------------------
    // Section G — FLAGSHIP.
    // ---------------------------------------------------------------
    {
        // A source archive with genuine evidence recorded, read against
        // three different "target" situations.
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const sourceArchive = new PublicationObservationArchive({ reconciliationDecisionRecords: appendDecisions([D1]) });

        // State A — no peer supplied. Exactly what 0.8.181's own view
        // starts with: targetArchive defaults to PublicationObservationArchive.empty(),
        // and hasPeerArchive stays false.
        const stateAHasPeer = false;
        const stateATarget = PublicationObservationArchive.empty();

        // State B — a peer WAS explicitly supplied, and that peer archive
        // genuinely has nothing recorded — structurally indistinguishable
        // from State A's own target archive, but reached via an explicit
        // "Use as Peer Archive" click in the real view.
        const stateBHasPeer = true;
        const stateBTarget = PublicationObservationArchive.empty();

        // State C — a peer was explicitly supplied, and genuinely carries
        // its own evidence.
        const D2 = genuineDecisionRecord(C1, 'DEFER', T1);
        const stateCHasPeer = true;
        const stateCTarget = new PublicationObservationArchive({ reconciliationDecisionRecords: appendDecisions([D2]) });

        const stateA = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState(stateAHasPeer, stateATarget);
        const stateB = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState(stateBHasPeer, stateBTarget);
        const stateC = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState(stateCHasPeer, stateCTarget);

        assert(stateA === NO_PEER, '13. FLAGSHIP — State A (no peer supplied) reads NO_PEER');
        assert(stateB === PEER_EMPTY, '14. FLAGSHIP — State B (an explicitly supplied, genuinely empty peer) reads PEER_EMPTY');
        assert(stateC === PEER_PRESENT, '15. FLAGSHIP — State C (an explicitly supplied peer carrying real evidence) reads PEER_PRESENT');
        assert(stateA !== stateB && stateB !== stateC && stateA !== stateC, '16. FLAGSHIP — A, B, and C are three genuinely distinct comparison states');

        // The invariant the milestone exists to hold: comparisonState
        // NEVER reinterprets the evidence itself. State A's own page and
        // State B's own page — computed by 0.8.179's own, completely
        // unchanged reconstructXxx() — are BYTE-IDENTICAL, because both
        // read against a structurally empty target archive; only
        // comparisonState (a fact this milestone adds ALONGSIDE the page,
        // never inside it) tells the two situations apart.
        const pageA = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage(sourceArchive, stateATarget);
        const pageB = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage(sourceArchive, stateBTarget);
        assert(serialize(pageA) === serialize(pageB), '17. FLAGSHIP — State A\'s and State B\'s own 0.8.179 page results are byte-identical: an explicitly supplied, genuinely empty peer computes IDENTICAL evidence to no peer at all, exactly as it honestly should');
        assert(pageA.rows.every((row) => row.decisionEvidence.sharedCount === 0 && row.decisionEvidence.targetOnlyCount === 0),
            '18. FLAGSHIP — in both State A and State B, every count that could only come from a genuine peer (Shared, Target-only) is honestly zero');

        // State C's own page genuinely differs — real peer evidence
        // changes the counts, exactly as it always did (0.8.181,
        // unchanged).
        const pageC = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage(sourceArchive, stateCTarget);
        assert(serialize(pageC) !== serialize(pageA), '19. FLAGSHIP — State C\'s own page genuinely differs from State A/B\'s — comparisonState never suppresses a real evidence difference either');
    }
    console.log('✓ Section G: FLAGSHIP — no peer / an explicitly supplied empty peer / an explicitly supplied peer with real evidence read as three distinct comparison states, while the page\'s own evidence for the no-peer and empty-peer states stays byte-identical — comparisonState is a parallel fact, never a reinterpretation of a single count');

    // ---------------------------------------------------------------
    // Section H — vocabulary/import boundary.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(
            new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState.js', import.meta.url), 'utf8'
        );
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();

        const importLines = moduleSource.split('\n').filter((line) => line.trim().startsWith('import '));
        assert(importLines.length === 0, '20. this file imports nothing — a leaf computation over two already-public archive count getters');

        const forbiddenInCode = ['score', 'rank', 'winner', 'correct', 'incorrect', 'confidence', 'sort(', 'inconsistent', 'superseded', 'authoritative', 'resolved', 'conflicting', 'conflict', 'stale', 'repair', 'replace', 'merge', 'delete', 'apply', 'execute', 'trust', 'reputation'];
        for (const term of forbiddenInCode) {
            assert(!codeOnly.includes(term), `21. this file's own code never carries "${term}"`);
        }
    }
    console.log('✓ Section H: this module imports nothing and carries no ranking/judgment vocabulary anywhere in its own code');

    // ---------------------------------------------------------------
    // Section I — the view's own wiring.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(
            new URL('../ui/views/ReconciliationCandidateLeaderboardView.js', import.meta.url), 'utf8'
        );
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(codeOnly.includes("from '../../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState.js'"), '22. the view imports 0.8.183\'s own comparison-state module');
        assert((codeOnly.match(/describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState\(/g) || []).length === 1,
            '23. the view calls 0.8.183\'s own describeXxx() exactly once');
        assert(/comparisonState\s*=\s*computed/.test(codeOnly), '24. comparisonState is its own reactive computed value, recomputed whenever hasPeerArchive/targetArchive change');

        assert(moduleSource.includes("comparisonState === 'NO_PEER'"), '25. the template branches on NO_PEER explicitly');
        assert(moduleSource.includes("comparisonState === 'PEER_EMPTY'"), '26. the template branches on PEER_EMPTY explicitly — a genuinely separate message from NO_PEER');
        assert(moduleSource.includes(':comparison-state="comparisonState"'), '27. the view passes comparisonState down to the table as its own prop, never re-deriving it a second time inside the table');

        // No evidence computation changed — page/evidenceDetail are still
        // each computed by exactly one reconstructXxx() call of their own.
        assert((codeOnly.match(/reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage\(/g) || []).length === 1,
            '28. the view still calls 0.8.179\'s own reconstructXxx() exactly once');
        assert((codeOnly.match(/reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail\(/g) || []).length === 1,
            '29. the view still calls 0.8.182\'s own reconstructXxx() exactly once');
    }
    console.log('✓ Section I: the view computes comparisonState via 0.8.183\'s own describeXxx(), branches its Peer Archive hint text on all three states, and hands the state to the table as a prop — without touching either existing reconstructXxx() call');

    // ---------------------------------------------------------------
    // Section J — the table's own wiring.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(
            new URL('../ui/components/ReconciliationCandidateLeaderboardTable.js', import.meta.url), 'utf8'
        );
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!codeOnly.includes("from '../../application/"), '30. the table still imports nothing from application/ — comparisonState arrives as a plain string prop, never re-derived from an archive');
        assert(/comparisonState:\s*\{\s*type:\s*String/.test(codeOnly), '31. the table declares comparisonState as its own String prop');
        assert(codeOnly.includes('comparisonStateMessage'), '32. the table computes its own banner text from comparisonState');
        assert(moduleSource.includes('{{ comparisonStateMessage }}'), '33. the template actually renders the banner text');

        // The banner never touches a row's own six counts.
        assert(!/comparisonState[\s\S]{0,80}(decisionShared|decisionSourceOnly|decisionTargetOnly|observationShared|observationSourceOnly|observationTargetOnly)/.test(codeOnly),
            '34. comparisonState is never combined with a row\'s own evidence counts');
    }
    console.log('✓ Section J: the table accepts comparisonState as a plain string prop, renders a one-line banner from it, still imports nothing from application/, and never lets it touch a row\'s own counts');

    console.log('\nAll ReconciliationCandidateLeaderboardComparisonState tests passed.');
}

run().catch((error) => {
    console.error('ReconciliationCandidateLeaderboardComparisonState.test.js FAILED:', error);
    process.exitCode = 1;
});
