import { derivePublicationSnapshotPlacementConvergence } from '../application/PublicationSnapshotPlacementConvergence.js';
import {
    publicationSnapshotPlacementConvergenceView, describeSnapshotPlacementRelationship, describeSnapshotPlacementContentGroupCount
} from '../application/PublicationSnapshotPlacementConvergenceView.js';
import { SnapshotPlacementRelationship } from '../application/SnapshotPlacementRelationship.js';
import { createResolutionObservation } from '../application/SnapshotPlacementResolutionObservation.js';
import { SnapshotPlacementResolutionOutcome } from '../application/SnapshotPlacementResolutionOutcome.js';

// 0.8.23 — Multi-Placement Convergence & Relationship UX.
//
//   Section A: publicationSnapshotPlacementConvergenceView() argument
//              handling — requires a
//              derivePublicationSnapshotPlacementConvergence() result
//   Section B: the two structural relationships — complete agreement
//              (one content group, no conflict) and conflicting content
//              binding (multiple groups, the one warning sentence, and
//              no adjudicating language anywhere in the derived view)
//   Section C: FLAGSHIP — Bob knows four placements for one publication
//              (A, B, C claim Hash X across two storage backends; D
//              claims Hash Y). His derived view reports "3 placements ->
//              Hash X, 1 placement -> Hash Y" and a CONFLICT — never a
//              winner. Bob then independently resolves all four
//              placements to four DIFFERENT outcomes, and the SAME
//              convergence view is proven byte-identical before and
//              after — resolution observations never reach, and never
//              change, the structural relationship.
//
// See docs/Principles.md, "Evidence Comparison Is Not Adjudication
// (0.8.13)," and "Multi-Placement Convergence Is Independent Of
// Resolution Observation (0.8.23)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    assert(threw, message);
}

function fakePlacement(id, publicationId, contentHash, storage, locator) {
    return { id, publicationId, contentHash, storage, locator };
}

function run() {
    // ---------------------------------------------------------------
    // Section A — argument handling
    // ---------------------------------------------------------------
    {
        expectThrows(() => publicationSnapshotPlacementConvergenceView(), '1. requires a convergence result');
        expectThrows(() => publicationSnapshotPlacementConvergenceView({}), '2. rejects a plain object with no contentHashGroups');
        expectThrows(() => publicationSnapshotPlacementConvergenceView({ contentHashGroups: 'not-an-array' }), '3. rejects a non-array contentHashGroups');

        const empty = publicationSnapshotPlacementConvergenceView(
            derivePublicationSnapshotPlacementConvergence({ publicationId: 'pub-empty' })
        );
        assert(empty.placementCount === 0, '4. no placements -> placementCount is 0');
        assert(empty.contentGroups.length === 0, '5. no placements -> no content groups');
        assert(empty.hasConflict === false, '6. no placements -> no conflict');
        assert(empty.relationship === SnapshotPlacementRelationship.AGREEMENT, '7. no placements -> AGREEMENT, the vacuous case, never CONFLICT');
        assert(empty.conflictDescription === null, '8. no placements -> no conflict description');
        assert(empty.storageTypeCount === 0 && empty.locatorCount === 0, '9. no placements -> zero storage/locator diversity');
        assert(describeSnapshotPlacementContentGroupCount(empty) === 'No content binding known', '10. describeSnapshotPlacementContentGroupCount() names the empty case honestly');
    }
    console.log('✓ Section A: publicationSnapshotPlacementConvergenceView() argument handling — a convergence result is required, empty input tolerated');

    // ---------------------------------------------------------------
    // Section B — the two structural relationships
    // ---------------------------------------------------------------
    {
        // Complete agreement: three placements, one content hash, two
        // storage backends.
        const agreement = publicationSnapshotPlacementConvergenceView(derivePublicationSnapshotPlacementConvergence({
            publicationId: 'pub-agree',
            placements: [
                fakePlacement('a', 'pub-agree', 'hash-h', 'ipfs', 'cid-a'),
                fakePlacement('b', 'pub-agree', 'hash-h', 'ipfs', 'cid-b'),
                fakePlacement('c', 'pub-agree', 'hash-h', 'local', 'local-c')
            ]
        }));
        assert(agreement.placementCount === 3, '1. Agreement: three placements counted');
        assert(agreement.contentGroups.length === 1 && agreement.contentGroups[0].placementCount === 3,
            '2. Agreement: a single content group containing all three placements');
        assert(agreement.hasConflict === false, '3. Agreement: no conflict');
        assert(agreement.relationship === SnapshotPlacementRelationship.AGREEMENT, '4. Agreement: relationship is AGREEMENT');
        assert(agreement.conflictDescription === null, '5. Agreement: no conflict description');
        assert(agreement.storageTypeCount === 2, '6. Agreement: two distinct storage backends reported even though every placement agrees');

        // Conflict: three placements claim Hash A, one claims Hash B —
        // the exact "3 placements -> Hash A, 1 placement -> Hash B"
        // scenario this milestone's own design conversation named.
        const convergence = derivePublicationSnapshotPlacementConvergence({
            publicationId: 'pub-conflict',
            placements: [
                fakePlacement('a1', 'pub-conflict', 'hash-a', 'ipfs', 'cid-a1'),
                fakePlacement('a2', 'pub-conflict', 'hash-a', 'ipfs', 'cid-a2'),
                fakePlacement('a3', 'pub-conflict', 'hash-a', 'local', 'local-a3'),
                fakePlacement('b1', 'pub-conflict', 'hash-b', 'ipfs', 'cid-b1')
            ]
        });
        const conflict = publicationSnapshotPlacementConvergenceView(convergence);
        assert(conflict.placementCount === 4, '7. Conflict: four placements counted');
        assert(conflict.contentGroups.length === 2, '8. Conflict: two distinct content groups reported');
        const groupA = conflict.contentGroups.find((g) => g.contentHash === 'hash-a');
        const groupB = conflict.contentGroups.find((g) => g.contentHash === 'hash-b');
        assert(groupA.placementCount === 3 && groupB.placementCount === 1,
            '9. Conflict: the true, honest group sizes are reported (three vs. one)');
        assert(conflict.hasConflict === true, '10. Conflict: hasConflict is true');
        assert(conflict.relationship === SnapshotPlacementRelationship.CONFLICT, '11. Conflict: relationship is CONFLICT');
        assert(typeof conflict.conflictDescription === 'string' && conflict.conflictDescription.length > 0,
            '12. Conflict: a conflict description is present');
        assert(conflict.conflictDescription === describeSnapshotPlacementRelationship(true, 2),
            '13. Conflict: describeSnapshotPlacementRelationship() produces the identical sentence the view embeds');

        // The larger group (three placements) must never be presented as
        // more likely correct, more available, or more trustworthy than
        // the smaller one (one placement) — no field anywhere ranks
        // them, and the description names disagreement, never a winner.
        const serialized = JSON.stringify(conflict);
        assert(!/authorit|trust|winner|consensus|correct|malicious|reject|best|preferred|confident|likely|canonical|reliable/i.test(serialized),
            '14. no adjudicating language or field anywhere in the derived view — no authority, trust, winner, consensus, correctness, rejection, "best," "preferred," "confident," "likely," "canonical," or "reliable"');
        assert(!('winner' in conflict) && !('canonicalContentHash' in conflict) && !('majorityContentHash' in conflict) && !('bestPlacement' in conflict) && !('preferredLocation' in conflict),
            '15. no field naming either group the winner, canonical, majority, best, or preferred value — mirroring this milestone\'s own explicit "no best placement, no preferred location" design constraint');

        assert(describeSnapshotPlacementContentGroupCount(conflict) === '2 distinct content hashes claimed',
            '16. describeSnapshotPlacementContentGroupCount() reports the count, never which group is "the" one');
    }
    console.log('✓ Section B: the two structural relationships — complete agreement (one group, no conflict, storage diversity still reported) and conflicting content binding (multiple groups, true honest counts, one non-adjudicating warning sentence, no adjudicating language anywhere)');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP: multi-placement comparison stays independent
    // of resolution observations.
    // ---------------------------------------------------------------
    {
        const placementA = fakePlacement('placement-a', 'pub-flagship', 'hash-x', 'ipfs', 'ipfs://CID-A');
        const placementB = fakePlacement('placement-b', 'pub-flagship', 'hash-x', 'ipfs', 'ipfs://CID-B');
        const placementC = fakePlacement('placement-c', 'pub-flagship', 'hash-x', 'local', 'local://snapshot-x');
        const placementD = fakePlacement('placement-d', 'pub-flagship', 'hash-y', 'ipfs', 'ipfs://CID-D');

        // Bob knows all four, exactly as discovery/synchronization
        // (0.8.19, unchanged) would already have converged them onto his
        // own catalog.
        const bobPlacements = [placementA, placementB, placementC, placementD];

        const convergenceBefore = derivePublicationSnapshotPlacementConvergence({
            publicationId: 'pub-flagship',
            placements: bobPlacements
        });
        const viewBefore = publicationSnapshotPlacementConvergenceView(convergenceBefore);

        assert(viewBefore.placementCount === 4, '1. Bob knows four placements');
        assert(viewBefore.contentGroups.length === 2, '2. two distinct content-hash groups');
        const hashXGroup = viewBefore.contentGroups.find((g) => g.contentHash === 'hash-x');
        const hashYGroup = viewBefore.contentGroups.find((g) => g.contentHash === 'hash-y');
        assert(hashXGroup.placementCount === 3, '3. Hash X: three placements (A, B, C)');
        assert(hashYGroup.placementCount === 1, '4. Hash Y: one placement (D)');
        assert(viewBefore.hasConflict === true, '5. a conflict IS detected between {A,B,C} and D');
        assert(viewBefore.relationship === SnapshotPlacementRelationship.CONFLICT, '6. relationship is CONFLICT');
        assert(viewBefore.storageTypeCount === 2, '7. two storage backends known (ipfs, local)');

        // Bob now independently resolves all four placements, each to a
        // DIFFERENT outcome — the exact "A: RESOLVED, B: STORE_UNAVAILABLE,
        // C: CONTENT_HASH_MISMATCH, D: left unresolved" scenario this
        // milestone's own design conversation named.
        const resolutions = {
            [placementA.id]: createResolutionObservation({ placementId: placementA.id, outcome: SnapshotPlacementResolutionOutcome.RESOLVED }),
            [placementB.id]: createResolutionObservation({ placementId: placementB.id, outcome: SnapshotPlacementResolutionOutcome.STORE_UNAVAILABLE }),
            [placementC.id]: createResolutionObservation({ placementId: placementC.id, outcome: SnapshotPlacementResolutionOutcome.CONTENT_HASH_MISMATCH })
            // Placement D intentionally has no entry — NOT_RESOLVED.
        };
        assert(Object.keys(resolutions).length === 3, '8. setup: three placements resolved, one (D) left unresolved');

        // Recomputing the convergence AND its view over the IDENTICAL
        // placement set — resolutions never becomes an input to either
        // function; this replays the derivation exactly as it would be
        // replayed by ui/views/DecentralizedPublicationsView.js's own
        // togglePlacements()/loadPlacements(), which never threads
        // `entry.resolutions` into either call.
        const convergenceAfter = derivePublicationSnapshotPlacementConvergence({
            publicationId: 'pub-flagship',
            placements: bobPlacements
        });
        const viewAfter = publicationSnapshotPlacementConvergenceView(convergenceAfter);

        // --- THE INVARIANT: resolution observations never change the
        // structural comparison. ---
        assert(JSON.stringify(viewBefore.contentGroups) === JSON.stringify(viewAfter.contentGroups),
            '9. INVARIANT: the content groups are byte-identical before and after Bob resolves every placement he knows');
        assert(viewBefore.hasConflict === viewAfter.hasConflict && viewBefore.relationship === viewAfter.relationship,
            '10. INVARIANT: hasConflict and relationship are unchanged by resolution observations');
        assert(viewBefore.conflictDescription === viewAfter.conflictDescription,
            '11. INVARIANT: the conflict description itself is unchanged by resolution observations');
        assert(JSON.stringify(viewBefore) === JSON.stringify(viewAfter),
            '12. INVARIANT: the ENTIRE derived view is byte-identical before and after — placement A resolving to RESOLVED never promotes Hash X\'s group, and placement C resolving to CONTENT_HASH_MISMATCH never demotes it out of the group it structurally belongs to');

        const serializedAfter = JSON.stringify(viewAfter);
        assert(!/authorit|trust|winner|consensus|correct|malicious|reject|best|preferred|confident|likely|available|resolved|unavailable|mismatch/i.test(serializedAfter),
            '13. no resolution-outcome language, and no adjudicating language, anywhere in the post-resolution convergence view — resolving A/B/C/D leaves no trace on the structural relationship at all');
    }
    console.log('✓ Section C: FLAGSHIP — Bob derives "3 placements -> Hash X, 1 placement -> Hash Y" with a detected conflict and no winner; independently resolving all four placements to four different outcomes (including one left unresolved) leaves the structural comparison byte-identical (INVARIANT) — resolution observations never reach, and never change, multi-placement convergence');

    console.log('\nAll Publication Snapshot Placement Convergence View tests passed.');
}

run();
