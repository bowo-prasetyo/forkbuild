import {
    PublisherLeaderboardClaimSnapshotReconciliationPlanIdentityAlgorithm,
    describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationPlanIdentity.js';

// 0.8.160 — Explicit Reconciliation Plan Identity Projection.
//
// Section A: empty plan — deterministic identity, candidateCount: 0,
//            malformed/absent plan degrades to the identical identity
// Section B: single candidate — identity and count for one candidate of
//            each of 0.8.144's own three types
// Section C: multiple candidates — changing candidate content changes
//            identity; unrelated plan fields never do
// Section D: order semantics — 0.8.143's own ordering is meaningful and is
//            preserved, never canonicalized away
// Section E: duplicate candidates — [C1, C1] is a structurally distinct
//            plan artifact from [C1], never collapsed
// Section F: malformed input — established degradation, never a throw
// Section G: immutability — the result is frozen, the input is never
//            mutated
// Section H: determinism — repeat calls on equivalent input agree
// Section I: known SHA-256 vector — independently computed, proving the
//            hand-rolled implementation, not merely self-consistency
// Section J: architectural boundary — no imports, no reconstructXxx(), no
//            candidate-selection/verification/decision/archive vocabulary

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const HEX64_PATTERN = /^[0-9a-f]{64}$/;

function divergentEntry(claimId, snapshotIndex, overrides = {}) {
    return Object.freeze({
        claimId, snapshotIndex,
        divergence: Object.freeze({ evidenceFingerprintDiffers: true, policyVersionDiffers: false, snapshotFingerprintDiffers: false, ...overrides })
    });
}

function planNaming({ divergent = [], claims = [], snapshots = [] } = {}) {
    return Object.freeze({
        divergentCorrespondences: Object.freeze([...divergent]),
        claimsWithoutCorrespondence: Object.freeze(claims.map((claimId) => Object.freeze({ claimId }))),
        snapshotsWithoutCorrespondence: Object.freeze(snapshots.map((snapshotIndex) => Object.freeze({ snapshotIndex })))
    });
}

const EMPTY_PLAN = planNaming({});

async function run() {
    // ---------------------------------------------------------------
    // Section A — empty plan.
    // ---------------------------------------------------------------
    {
        const result = describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity(EMPTY_PLAN);
        assert(result.candidateCount === 0, '1. an empty plan names zero candidates');
        assert(HEX64_PATTERN.test(result.planFingerprint), '2. an empty plan still produces a well-formed 64-character lowercase hex fingerprint');
        assert(result.algorithm === 'SHA-256', '3. the result names its own algorithm explicitly');

        const second = describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity(planNaming({}));
        assert(result.planFingerprint === second.planFingerprint, '4. two independently built, structurally empty plans fingerprint identically');

        const bareObject = describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity({});
        assert(bareObject.planFingerprint === result.planFingerprint, '5. a bare {} with no list fields at all fingerprints identically to an explicit empty plan');
    }
    console.log('✓ Section A: an empty plan produces a deterministic identity with candidateCount: 0');

    // ---------------------------------------------------------------
    // Section B — single candidate, each of 0.8.144's own three types.
    // ---------------------------------------------------------------
    {
        const divergentOnly = describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity(planNaming({ divergent: [divergentEntry('C1', 0)] }));
        assert(divergentOnly.candidateCount === 1, '6. a plan naming one DIVERGENT_CORRESPONDENCE candidate reports candidateCount: 1');
        assert(divergentOnly.planFingerprint !== EMPTY_PLAN_FINGERPRINT(), '7. a single candidate fingerprints differently than the empty plan');

        const claimOnly = describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity(planNaming({ claims: ['C2'] }));
        assert(claimOnly.candidateCount === 1, '8. a plan naming one CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT candidate reports candidateCount: 1');

        const snapshotOnly = describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity(planNaming({ snapshots: [1] }));
        assert(snapshotOnly.candidateCount === 1, '9. a plan naming one SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM candidate reports candidateCount: 1');

        assert(divergentOnly.planFingerprint !== claimOnly.planFingerprint, '10. one DIVERGENT_CORRESPONDENCE candidate and one CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT candidate fingerprint differently, even though both report candidateCount: 1');
        assert(claimOnly.planFingerprint !== snapshotOnly.planFingerprint, '11. one CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT candidate and one SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM candidate fingerprint differently, for the identical reason');
    }
    console.log('✓ Section B: a single candidate of any of the three types produces candidateCount: 1 and a distinct fingerprint');

    // ---------------------------------------------------------------
    // Section C — multiple candidates: changing candidate content changes
    // identity; unrelated plan fields never do.
    // ---------------------------------------------------------------
    {
        const P1 = planNaming({ divergent: [divergentEntry('C1', 0)], claims: ['C2'], snapshots: [1] });
        const P2 = planNaming({ divergent: [divergentEntry('C1', 0)], claims: ['C3'], snapshots: [1] });

        const i1 = describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity(P1);
        const i2 = describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity(P2);
        assert(i1.candidateCount === 3 && i2.candidateCount === 3, '12. both four-way-identical-count plans report candidateCount: 3');
        assert(i1.planFingerprint !== i2.planFingerprint, '13. changing a single candidate\'s own claimId changes the plan identity, even though candidateCount is unchanged');

        // A DIVERGENT_CORRESPONDENCE entry's own *Differs facts are part of
        // the plan's structural content, so changing one changes identity
        // too — this file interprets none of those facts, but it does not
        // strip them either (see this file's own header, "Every list entry
        // is embedded exactly as supplied").
        const P3 = planNaming({ divergent: [divergentEntry('C1', 0, { policyVersionDiffers: true })], claims: ['C2'], snapshots: [1] });
        const i3 = describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity(P3);
        assert(i3.planFingerprint !== i1.planFingerprint, '14. changing an embedded divergence fact on an otherwise-identical candidate changes the plan identity');

        // The plan's own summary statistics — claimCount,
        // distinctClaimIdCount, snapshotCount, correspondenceCount — never
        // participate in identity; only the three candidate lists 0.8.144
        // itself reads do. See this file's own header.
        const withSummaryStats = Object.freeze({ ...P1, claimCount: 999, distinctClaimIdCount: 999, snapshotCount: 999, correspondenceCount: 999 });
        const i4 = describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity(withSummaryStats);
        assert(i4.planFingerprint === i1.planFingerprint, '15. adding or changing summary-statistics fields alongside identical candidate lists never changes planFingerprint');
        assert(i4.candidateCount === i1.candidateCount, '16. ...nor does it change candidateCount');
    }
    console.log('✓ Section C: candidate content changes identity; the plan\'s own summary statistics never do');

    // ---------------------------------------------------------------
    // Section D — order semantics: 0.8.143's own ordering is meaningful,
    // and is preserved, never canonicalized away.
    // ---------------------------------------------------------------
    {
        const forward = planNaming({ claims: ['C1', 'C2'] });
        const reversed = planNaming({ claims: ['C2', 'C1'] });

        const forwardIdentity = describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity(forward);
        const reversedIdentity = describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity(reversed);

        assert(forwardIdentity.candidateCount === reversedIdentity.candidateCount, '17. reordering candidates never changes candidateCount');
        assert(forwardIdentity.planFingerprint !== reversedIdentity.planFingerprint, '18. THE ORDER-SEMANTICS INVARIANT: two plans naming the identical candidates in a different order are distinct plan artifacts — 0.8.143\'s own ordering is never canonicalized away');

        // The identical rule holds for each of the three lists independently.
        const divergentForward = planNaming({ divergent: [divergentEntry('C1', 0), divergentEntry('C1', 1)] });
        const divergentReversed = planNaming({ divergent: [divergentEntry('C1', 1), divergentEntry('C1', 0)] });
        assert(
            describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity(divergentForward).planFingerprint
            !== describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity(divergentReversed).planFingerprint,
            '19. the identical order-sensitivity holds for divergentCorrespondences on its own'
        );

        const snapshotsForward = planNaming({ snapshots: [1, 2] });
        const snapshotsReversed = planNaming({ snapshots: [2, 1] });
        assert(
            describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity(snapshotsForward).planFingerprint
            !== describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity(snapshotsReversed).planFingerprint,
            '20. ...and for snapshotsWithoutCorrespondence on its own'
        );
    }
    console.log('✓ Section D: candidate order is meaningful and is preserved — reordering produces a distinct plan identity');

    // ---------------------------------------------------------------
    // Section E — duplicate candidates: [C1, C1] is a structurally
    // distinct plan artifact from [C1], never collapsed.
    // ---------------------------------------------------------------
    {
        const single = planNaming({ claims: ['C1'] });
        const duplicated = planNaming({ claims: ['C1', 'C1'] });

        const singleIdentity = describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity(single);
        const duplicatedIdentity = describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity(duplicated);

        assert(singleIdentity.candidateCount === 1, '21. a plan naming one claim reports candidateCount: 1');
        assert(duplicatedIdentity.candidateCount === 2, '22. THE DUPLICATE-CANDIDATE INVARIANT: a plan naming the same claimId twice reports candidateCount: 2 — never collapsed to 1');
        assert(duplicatedIdentity.planFingerprint !== singleIdentity.planFingerprint, '23. [C1, C1] and [C1] fingerprint differently — a distinct plan artifact, never structurally identical to its own deduplicated form');

        // Holds identically for the other two candidate types.
        const singleDivergent = planNaming({ divergent: [divergentEntry('C1', 0)] });
        const duplicatedDivergent = planNaming({ divergent: [divergentEntry('C1', 0), divergentEntry('C1', 0)] });
        assert(
            describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity(duplicatedDivergent).candidateCount === 2
            && describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity(singleDivergent).candidateCount === 1,
            '24. the identical multiplicity rule holds for divergentCorrespondences'
        );
    }
    console.log('✓ Section E: a duplicated candidate is a structurally distinct plan artifact, never collapsed to its deduplicated form');

    // ---------------------------------------------------------------
    // Section F — malformed input: established degradation, never a throw.
    // ---------------------------------------------------------------
    {
        const EMPTY_FINGERPRINT = describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity(EMPTY_PLAN).planFingerprint;

        const inputs = [null, undefined, 'not a plan', 42, [], true, {}, { divergentCorrespondences: 'not an array' }, { claimsWithoutCorrespondence: null }, { snapshotsWithoutCorrespondence: 7 }];
        for (const [index, input] of inputs.entries()) {
            let threw = false;
            let result;
            try { result = describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity(input); } catch (error) { threw = true; }
            assert(!threw, `25.${index} malformed input (${JSON.stringify(input)}) never throws`);
            assert(result.planFingerprint === EMPTY_FINGERPRINT, `26.${index} malformed input degrades to the identical empty-plan fingerprint`);
            assert(result.candidateCount === 0, `27.${index} malformed input degrades to candidateCount: 0`);
        }

        // A plan with one genuine list and two malformed ones still counts
        // and fingerprints only the genuine list's own content.
        const partiallyMalformed = describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity({
            divergentCorrespondences: [divergentEntry('C1', 0)],
            claimsWithoutCorrespondence: 'garbage',
            snapshotsWithoutCorrespondence: undefined
        });
        const divergentOnlyGenuine = describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity(planNaming({ divergent: [divergentEntry('C1', 0)] }));
        assert(partiallyMalformed.planFingerprint === divergentOnlyGenuine.planFingerprint, '28. a plan with two malformed list fields degrades those two to [], fingerprinting identically to a plan that never had them');
        assert(partiallyMalformed.candidateCount === 1, '29. ...and counts only the one genuine candidate');
    }
    console.log('✓ Section F: malformed or absent input degrades exactly like 0.8.144\'s own tolerance, never a throw');

    // ---------------------------------------------------------------
    // Section G — immutability.
    // ---------------------------------------------------------------
    {
        const plan = planNaming({ divergent: [divergentEntry('C1', 0)], claims: ['C2'], snapshots: [1] });
        const before = JSON.stringify(plan);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity(plan);
        assert(Object.isFrozen(result), '30. the result is frozen');
        assert(JSON.stringify(plan) === before, '31. the supplied plan is never mutated');

        let threwOnWrite = false;
        try { result.planFingerprint = 'tampered'; } catch (error) { threwOnWrite = true; }
        assert(result.planFingerprint !== 'tampered', '32. attempting to write to the frozen result never actually changes it');
    }
    console.log('✓ Section G: the result is frozen and the supplied plan is never mutated');

    // ---------------------------------------------------------------
    // Section H — determinism.
    // ---------------------------------------------------------------
    {
        const plan = planNaming({ divergent: [divergentEntry('C1', 0)], claims: ['C2', 'C3'], snapshots: [1, 4] });
        const first = describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity(plan);
        const second = describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity(plan);
        assert(first.planFingerprint === second.planFingerprint, '33. calling the function twice on the identical plan returns a byte-identical fingerprint');
        assert(first.candidateCount === second.candidateCount, '34. ...and an identical candidateCount');

        // A freshly, independently built plan with equivalent content
        // (never the same object reference) agrees too — structural
        // identity, not reference identity.
        const rebuilt = planNaming({ divergent: [divergentEntry('C1', 0)], claims: ['C2', 'C3'], snapshots: [1, 4] });
        const third = describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity(rebuilt);
        assert(third.planFingerprint === first.planFingerprint, '35. two independently constructed plans with equivalent structural content fingerprint identically');
    }
    console.log('✓ Section H: identity is deterministic — equivalent structural content always fingerprints identically');

    // ---------------------------------------------------------------
    // Section I — known SHA-256 vector, independently computed.
    // ---------------------------------------------------------------
    {
        // sha256('{"divergentCorrespondences":[],"claimsWithoutCorrespondence":[],"snapshotsWithoutCorrespondence":[]}')
        // — independently verified against Node's own
        // `crypto.createHash('sha256')` while authoring this test. This is
        // not merely a self-consistency check: it proves the hand-rolled
        // SHA-256 implementation in application/
        // PublisherLeaderboardClaimSnapshotReconciliationPlanIdentity.js
        // produces the SAME digest a standard SHA-256 implementation does
        // over the identical bytes.
        const EXPECTED_EMPTY_PLAN_FINGERPRINT = 'c152999fd44feb0e6a759b2b1c79f26d59e9fd382cfe31e1ec25f04556ebf190';
        const result = describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity(EMPTY_PLAN);
        assert(result.planFingerprint === EXPECTED_EMPTY_PLAN_FINGERPRINT, `36. sha256 of the empty plan's own canonical content matches the independently computed vector, saw ${result.planFingerprint}`);
        assert(PublisherLeaderboardClaimSnapshotReconciliationPlanIdentityAlgorithm === 'SHA-256', '37. the exported algorithm constant is SHA-256');
    }
    console.log('✓ Section I: the hand-rolled SHA-256 implementation matches an independently computed vector, not merely itself');

    // ---------------------------------------------------------------
    // Section J — architectural boundary.
    // ---------------------------------------------------------------
    {
        const result = describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity(EMPTY_PLAN);
        const topKeys = Object.keys(result).sort();
        assert(JSON.stringify(topKeys) === JSON.stringify(['algorithm', 'candidateCount', 'planFingerprint'].sort()), '38. the result carries exactly three fields — algorithm, planFingerprint, candidateCount — nothing more');

        const fs = await import('node:fs/promises');
        const moduleSource = await fs.readFile(new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationPlanIdentity.js', import.meta.url), 'utf8');
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();

        // No imports at all — see this file's own header, "Architectural
        // boundary — no imports at all."
        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.length === 0, '39. this file imports nothing');

        const forbiddenInCode = [
            'verification', 'verifier', 'trust', 'confidence', 'reputation', 'severity',
            'archive', 'decisionhistory', 'reconciliationdecision', 'candidateselection',
            'reconstructpublisherleaderboard', 'resolve', 'repair', 'accept', 'reject', 'merge', 'winner', 'authoritative'
        ];
        for (const term of forbiddenInCode) {
            assert(!codeOnly.includes(term), `40. this file's own code never carries "${term}"`);
        }
        assert(!codeOnly.includes("describepublisherleaderboardclaimsnapshotreconciliationcandidate("), '41. this file never calls 0.8.144\'s own candidate-selection function — it never performs candidate selection');
        assert(!codeOnly.includes('describepublisherleaderboardclaimsnapshotreconciliationplan('), '42. this file never calls 0.8.143\'s own plan-construction function — it only ever reads an already-supplied plan');

        const module = await import('../application/PublisherLeaderboardClaimSnapshotReconciliationPlanIdentity.js');
        assert(typeof module.describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity === 'function', '43. describeXxx() is exported');
        assert(module.reconstructPublisherLeaderboardClaimSnapshotReconciliationPlanIdentity === undefined, '44. no reconstructXxx() is exported — there is no archive-stored plan to reconstruct an identity from');
    }
    console.log('✓ Section J: no imports at all, no candidate-selection/verification/archive vocabulary, and no reconstructXxx() entry point');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationPlanIdentity tests passed.');
}

function EMPTY_PLAN_FINGERPRINT() {
    return describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity(EMPTY_PLAN).planFingerprint;
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationPlanIdentity.test.js FAILED:', error);
    process.exitCode = 1;
});
