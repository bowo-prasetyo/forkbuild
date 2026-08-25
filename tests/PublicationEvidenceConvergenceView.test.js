import { derivePublicationEvidenceConvergence } from '../application/PublicationEvidenceConvergence.js';
import {
    publicationEvidenceConvergenceView, describeContentBindingSetRelationship, describeContentGroupCount
} from '../application/PublicationEvidenceConvergenceView.js';
import { ContentBindingSetRelationship } from '../application/ContentBindingSetRelationship.js';
import { AnchorVerificationOutcome } from '../application/AnchorVerificationOutcome.js';

// 0.8.13 — Multi-Evidence Comparison & Conflict UX.
//
//   Section A: publicationEvidenceConvergenceView() argument handling —
//              requires a derivePublicationEvidenceConvergence() result
//   Section B: the two structural relationships — complete agreement
//              (one content group, no conflict) and conflicting content
//              binding (multiple groups, the one warning sentence, and
//              no adjudicating language anywhere in the derived view)
//   Section C: FLAGSHIP — Alice knows three anchors for one publication
//              (A and B claim Hash X, C claims Hash Y). Bob receives all
//              three (a plain merged anchor list, standing in for
//              whatever discovery already handed him). Bob's derived
//              convergence view reports "2 anchors -> Hash X, 1 anchor
//              -> Hash Y" and a conflict — never a winner. Bob then
//              independently verifies all three anchors with three
//              different outcomes, and the SAME convergence view is
//              proven byte-identical before and after — verification
//              observations never change the structural relationship.
//
// See docs/Principles.md, "Evidence Comparison Is Not Adjudication
// (0.8.13)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    assert(threw, message);
}

function fakeAnchor(id, publicationId, contentHash, anchorType) {
    return { id, publicationId, contentHash, anchorType };
}

function run() {
    // ---------------------------------------------------------------
    // Section A — argument handling
    // ---------------------------------------------------------------
    {
        expectThrows(() => publicationEvidenceConvergenceView(), '1. requires a convergence result');
        expectThrows(() => publicationEvidenceConvergenceView({}), '2. rejects a plain object with no contentHashGroups');
        expectThrows(() => publicationEvidenceConvergenceView({ contentHashGroups: 'not-an-array' }), '3. rejects a non-array contentHashGroups');

        const empty = publicationEvidenceConvergenceView(
            derivePublicationEvidenceConvergence({ publicationId: 'pub-empty' })
        );
        assert(empty.anchorCount === 0, '4. no anchors -> anchorCount is 0');
        assert(empty.contentGroups.length === 0, '5. no anchors -> no content groups');
        assert(empty.hasConflict === false, '6. no anchors -> no conflict');
        assert(empty.relationship === ContentBindingSetRelationship.AGREEMENT, '7. no anchors -> AGREEMENT, the vacuous case, never CONFLICT');
        assert(empty.conflictDescription === null, '8. no anchors -> no conflict description');
        assert(describeContentGroupCount(empty) === 'No content binding known', '9. describeContentGroupCount() names the empty case honestly');
    }
    console.log('✓ Section A: publicationEvidenceConvergenceView() argument handling — a convergence result is required, empty input tolerated');

    // ---------------------------------------------------------------
    // Section B — the two structural relationships
    // ---------------------------------------------------------------
    {
        // Complete agreement: three anchors, one content hash.
        const agreement = publicationEvidenceConvergenceView(derivePublicationEvidenceConvergence({
            publicationId: 'pub-agree',
            anchors: [
                fakeAnchor('a', 'pub-agree', 'hash-h', 'bitcoin-op-return'),
                fakeAnchor('b', 'pub-agree', 'hash-h', 'other-ledger'),
                fakeAnchor('c', 'pub-agree', 'hash-h', 'transparency-log')
            ]
        }));
        assert(agreement.anchorCount === 3, '1. Agreement: three anchors counted');
        assert(agreement.contentGroups.length === 1 && agreement.contentGroups[0].anchorCount === 3,
            '2. Agreement: a single content group containing all three anchors');
        assert(agreement.hasConflict === false, '3. Agreement: no conflict');
        assert(agreement.relationship === ContentBindingSetRelationship.AGREEMENT, '4. Agreement: relationship is AGREEMENT');
        assert(agreement.conflictDescription === null, '5. Agreement: no conflict description');

        // Conflict: two anchors claim Hash A, one claims Hash B — the
        // exact "2 anchors -> Hash A, 1 anchor -> Hash B" scenario this
        // milestone's own design conversation named.
        const convergence = derivePublicationEvidenceConvergence({
            publicationId: 'pub-conflict',
            anchors: [
                fakeAnchor('a1', 'pub-conflict', 'hash-a', 'bitcoin-op-return'),
                fakeAnchor('a2', 'pub-conflict', 'hash-a', 'other-ledger'),
                fakeAnchor('b1', 'pub-conflict', 'hash-b', 'transparency-log')
            ]
        });
        const conflict = publicationEvidenceConvergenceView(convergence);
        assert(conflict.anchorCount === 3, '6. Conflict: three anchors counted');
        assert(conflict.contentGroups.length === 2, '7. Conflict: two distinct content groups reported');
        const groupA = conflict.contentGroups.find((g) => g.contentHash === 'hash-a');
        const groupB = conflict.contentGroups.find((g) => g.contentHash === 'hash-b');
        assert(groupA.anchorCount === 2 && groupB.anchorCount === 1,
            '8. Conflict: the true, honest group sizes are reported (two vs. one)');
        assert(conflict.hasConflict === true, '9. Conflict: hasConflict is true');
        assert(conflict.relationship === ContentBindingSetRelationship.CONFLICT, '10. Conflict: relationship is CONFLICT');
        assert(typeof conflict.conflictDescription === 'string' && conflict.conflictDescription.length > 0,
            '11. Conflict: a conflict description is present');
        assert(conflict.conflictDescription === describeContentBindingSetRelationship(true, 2),
            '12. Conflict: describeContentBindingSetRelationship() produces the identical sentence the view embeds');

        // The larger group (two anchors) must never be presented as more
        // likely correct than the smaller one (one anchor) — no field
        // anywhere ranks them, and the description names disagreement,
        // never a winner.
        const serialized = JSON.stringify(conflict);
        assert(!/authorit|trust|winner|consensus|correct|malicious|reject|best|preferred|confident|likely/i.test(serialized),
            '13. no adjudicating language or field anywhere in the derived view — no authority, trust, winner, consensus, correctness, rejection, "best," "preferred," "confident," or "likely"');
        assert(!('winner' in conflict) && !('canonicalContentHash' in conflict) && !('majorityContentHash' in conflict),
            '14. no field naming either group the winner, canonical, or majority value');

        assert(describeContentGroupCount(conflict) === '2 distinct content hashes claimed',
            '15. describeContentGroupCount() reports the count, never which group is "the" one');
    }
    console.log('✓ Section B: the two structural relationships — complete agreement (one group, no conflict) and conflicting content binding (multiple groups, true honest counts, one non-adjudicating warning sentence, no adjudicating language anywhere)');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP: multi-evidence comparison stays independent
    // of verification observations.
    // ---------------------------------------------------------------
    {
        const anchorA = fakeAnchor('anchor-a', 'pub-flagship', 'hash-x', 'bitcoin-op-return');
        const anchorB = fakeAnchor('anchor-b', 'pub-flagship', 'hash-x', 'other-ledger');
        const anchorC = fakeAnchor('anchor-c', 'pub-flagship', 'hash-y', 'transparency-log');

        // Bob receives all three, exactly as discovery/synchronization
        // (0.8.5/0.8.6, unchanged) would already have converged them
        // onto his own catalog.
        const bobAnchors = [anchorA, anchorB, anchorC];

        const convergenceBefore = derivePublicationEvidenceConvergence({
            publicationId: 'pub-flagship',
            anchors: bobAnchors
        });
        const viewBefore = publicationEvidenceConvergenceView(convergenceBefore);

        assert(viewBefore.anchorCount === 3, '1. Bob knows three anchors');
        assert(viewBefore.contentGroups.length === 2, '2. two distinct content-hash groups');
        const hashXGroup = viewBefore.contentGroups.find((g) => g.contentHash === 'hash-x');
        const hashYGroup = viewBefore.contentGroups.find((g) => g.contentHash === 'hash-y');
        assert(hashXGroup.anchorCount === 2, '3. Hash X: two anchors (A, B)');
        assert(hashYGroup.anchorCount === 1, '4. Hash Y: one anchor (C)');
        assert(viewBefore.hasConflict === true, '5. a conflict IS detected between {A,B} and C');
        assert(viewBefore.relationship === ContentBindingSetRelationship.CONFLICT, '6. relationship is CONFLICT');

        // Bob now independently verifies all three anchors, each with a
        // DIFFERENT outcome — the exact "A: independently verified, B:
        // verification unavailable, C: proof rejected" scenario this
        // milestone's own design conversation named.
        const verificationByAnchorId = {
            [anchorA.id]: AnchorVerificationOutcome.VALID,
            [anchorB.id]: AnchorVerificationOutcome.PROOF_UNAVAILABLE,
            [anchorC.id]: AnchorVerificationOutcome.INVALID_PROOF
        };
        const convergenceAfter = derivePublicationEvidenceConvergence({
            publicationId: 'pub-flagship',
            anchors: bobAnchors,
            verificationByAnchorId
        });
        const viewAfter = publicationEvidenceConvergenceView(convergenceAfter);

        // --- THE INVARIANT: supplying verification observations never
        // changes the structural comparison. ---
        assert(JSON.stringify(viewBefore.contentGroups) === JSON.stringify(viewAfter.contentGroups),
            '7. INVARIANT: the content groups are byte-identical before and after verification observations are supplied');
        assert(viewBefore.hasConflict === viewAfter.hasConflict && viewBefore.relationship === viewAfter.relationship,
            '8. INVARIANT: hasConflict and relationship are unchanged by verification observations');
        assert(viewBefore.conflictDescription === viewAfter.conflictDescription,
            '9. INVARIANT: the conflict description itself is unchanged by verification observations');

        // The per-anchor verification outcome IS visible on the
        // convergence result itself (application/
        // PublicationEvidenceConvergence.js's own per-anchor `verification`
        // field, unmodified by this milestone) — proving the two axes
        // coexist without merging: Anchor B, verification
        // PROOF_UNAVAILABLE, remains grouped under Hash X exactly like
        // Anchor A, verification VALID.
        const anchorAEntry = convergenceAfter.anchors.find((entry) => entry.anchorId === anchorA.id);
        const anchorBEntry = convergenceAfter.anchors.find((entry) => entry.anchorId === anchorB.id);
        const anchorCEntry = convergenceAfter.anchors.find((entry) => entry.anchorId === anchorC.id);
        assert(anchorAEntry.verification === AnchorVerificationOutcome.VALID
            && anchorBEntry.verification === AnchorVerificationOutcome.PROOF_UNAVAILABLE
            && anchorCEntry.verification === AnchorVerificationOutcome.INVALID_PROOF,
            '10. each anchor carries its own, distinct local verification observation');
        assert(anchorAEntry.contentHash === anchorBEntry.contentHash && anchorAEntry.contentHash === 'hash-x',
            '11. Anchor A and Anchor B remain grouped under the identical content hash regardless of their differing verification outcomes');

        const serializedAfter = JSON.stringify(viewAfter);
        assert(!/authorit|trust|winner|consensus|correct|malicious|reject|best|preferred|confident|likely/i.test(serializedAfter),
            '12. no adjudicating language anywhere in the post-verification convergence view either');
    }
    console.log('✓ Section C: FLAGSHIP — Bob derives "2 anchors -> Hash X, 1 anchor -> Hash Y" with a detected conflict and no winner; independently verifying all three anchors with three different outcomes leaves the structural comparison byte-identical (INVARIANT), while each anchor still carries its own separate local observation');

    console.log('\nAll Publication Evidence Convergence View tests passed.');
}

run();
