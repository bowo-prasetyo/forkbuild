import { describePublicationSnapshotPossession } from '../application/PublicationSnapshotPossessionView.js';
import { LocalSnapshotContentAvailabilityOutcome } from '../application/LocalSnapshotContentAvailabilityOutcome.js';
import { SnapshotMaterializationSourceKind } from '../application/SnapshotMaterializationSourceKind.js';
import { StoreSnapshotContentOutcome } from '../application/StoreSnapshotContentOutcome.js';
import { createSnapshotMaterializationAttempt } from '../application/SnapshotMaterializationAttempt.js';
import { appendSnapshotMaterializationHistoryEntry } from '../application/SnapshotMaterializationHistory.js';
import { describePublicationSnapshotAcquisition } from '../application/PublicationSnapshotAcquisitionView.js';
import { derivePublicationSnapshotPlacementConvergence } from '../application/PublicationSnapshotPlacementConvergence.js';
import { publicationSnapshotPlacementConvergenceView } from '../application/PublicationSnapshotPlacementConvergenceView.js';
import { SnapshotPlacementRelationship } from '../application/SnapshotPlacementRelationship.js';
import { SnapshotPeerPossessionState } from '../application/SnapshotPeerPossessionState.js';
import { describeSnapshotPeerPossessionComparison } from '../application/SnapshotPeerPossessionComparisonView.js';
import { describeSnapshotStateInspection } from '../application/SnapshotStateInspectionView.js';

// 0.8.46 — Unified Snapshot State Inspection.
//
//   Section A: describeSnapshotStateInspection() is pure — byte-identical
//              inputs yield a byte-identical, frozen result, no argument
//              is required, and the result never carries a
//              score/verdict/ranking field anywhere in its shape.
//   Section B: each of the four composed dimensions is reported, or
//              reported absent (`null`), entirely independently of
//              whether any of the OTHER three were supplied — supplying
//              only a placementConvergenceView, for example, never
//              fabricates an acquisition or peerObservations dimension.
//   Section C: a "not yet computed" dimension (`null`) is structurally
//              distinct from a "computed and empty" dimension (present,
//              all-zero counts) across all three composed dimensions.
//   Section D — FLAGSHIP: four replicas — Alice, Bob, Carol, Dave — each
//              observe the SAME publication but carry four entirely
//              different combinations of possession, acquisition history,
//              placement relationship, and peer observations. The unified
//              view exposes all four combinations faithfully, and never
//              collapses any of them into a shared fifth state.
//
// See docs/Principles.md, "A Snapshot's Independently Observed Facts Are
// Exposed Side By Side, Never Collapsed Into One Verdict (0.8.46)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const FORBIDDEN_WORDS = [
    'confidence', 'quality', 'reliability', 'bestsource', 'preferredsource', 'successrate',
    'score', 'rank', 'trust', 'verified', 'canonical', 'recommended', 'best', 'preferred',
    'health', 'degraded', 'healthy', 'trustworthy', 'confident', 'decentralized'
];

// Recursively scans every key of a plain object/array for a forbidden
// evaluative word — this milestone's own central promise is that many
// independently observed facts are exposed side by side, never resolved
// into a verdict, and this check applies that promise directly to the
// actual shape returned, rather than trusting the header comment alone.
function assertNoForbiddenVocabulary(value, path, message) {
    if (value === null || typeof value !== 'object') return;
    for (const key of Object.keys(value)) {
        const lowerKey = key.toLowerCase();
        for (const forbidden of FORBIDDEN_WORDS) {
            assert(!lowerKey.includes(forbidden), `${message} — forbidden field "${key}" found at ${path}${key}`);
        }
        assertNoForbiddenVocabulary(value[key], `${path}${key}.`, message);
    }
}

function possessionOf(outcome, publicationId = 'pub-a', contentHash = 'hash-a') {
    return describePublicationSnapshotPossession(outcome ? { publicationId, contentHash, outcome } : null);
}

function acquisitionOf(publicationId, contentHash, possessionView, attempts) {
    let history = [];
    for (const attempt of attempts) {
        history = appendSnapshotMaterializationHistoryEntry(history, createSnapshotMaterializationAttempt({
            publicationId, contentHash, ...attempt
        }));
    }
    return describePublicationSnapshotAcquisition({ publicationId, contentHash, possessionView, materializationHistory: history });
}

function fakePlacement(id, publicationId, contentHash, storage, locator) {
    return { id, publicationId, contentHash, storage, locator };
}

function placementsOf(publicationId, placements) {
    return publicationSnapshotPlacementConvergenceView(
        derivePublicationSnapshotPlacementConvergence({ publicationId, placements })
    );
}

function peersOf(publicationId, contentHash, reports) {
    const observations = reports.map(([peerId, state], index) => ({
        peerId, state, publicationId, contentHash, observedAt: new Date(2026, 0, 1, 0, index)
    }));
    return describeSnapshotPeerPossessionComparison(publicationId, contentHash, observations);
}

function run() {
    // ---------------------------------------------------------------
    // Section A — pure composition, no argument required
    // ---------------------------------------------------------------
    {
        const args = {
            publicationId: 'pub-a', contentHash: 'hash-a',
            possessionView: possessionOf(LocalSnapshotContentAvailabilityOutcome.AVAILABLE),
            acquisitionView: acquisitionOf('pub-a', 'hash-a', possessionOf(LocalSnapshotContentAvailabilityOutcome.AVAILABLE), [
                { sourceKind: SnapshotMaterializationSourceKind.PACKAGE, outcome: StoreSnapshotContentOutcome.STORED }
            ]),
            placementConvergenceView: placementsOf('pub-a', [fakePlacement('p1', 'pub-a', 'hash-a', 'local', 'loc-1')]),
            peerPossessionComparisonView: peersOf('pub-a', 'hash-a', [['alice', SnapshotPeerPossessionState.AVAILABLE]])
        };
        const first = describeSnapshotStateInspection(args);
        const second = describeSnapshotStateInspection(args);
        assert(JSON.stringify(first) === JSON.stringify(second), '1. calling twice with byte-identical arguments returns a byte-identical result');
        assert(Object.isFrozen(first), '2. the top-level result is frozen');
        assert(Object.isFrozen(first.possession), '3. the possession sub-object is frozen');
        assert(Object.isFrozen(first.acquisition), '4. the acquisition sub-object is frozen');
        assert(Object.isFrozen(first.acquisition.sources), '5. the acquisition.sources sub-object is frozen');
        assert(Object.isFrozen(first.placements), '6. the placements sub-object is frozen');
        assert(Object.isFrozen(first.peerObservations), '7. the peerObservations sub-object is frozen');

        assert(first.publicationId === 'pub-a' && first.contentHash === 'hash-a', '8. publicationId/contentHash are carried through exactly as given');

        assertNoForbiddenVocabulary(first, '', '9. the composed view');

        assert(describeSnapshotStateInspection().possession.state === null, '10. calling with no arguments at all never throws');
        assert(describeSnapshotStateInspection().acquisition === null
            && describeSnapshotStateInspection().placements === null
            && describeSnapshotStateInspection().peerObservations === null,
            '11. calling with no arguments reports every composed dimension absent, never a fabricated default');
    }
    console.log('✓ Section A: describeSnapshotStateInspection() is pure, frozen, tolerates no arguments, and carries no evaluative vocabulary anywhere in its shape');

    // ---------------------------------------------------------------
    // Section B — each dimension is reported (or reported absent)
    // entirely independently of the other three
    // ---------------------------------------------------------------
    {
        const onlyPlacements = describeSnapshotStateInspection({
            publicationId: 'pub-b', contentHash: 'hash-b',
            placementConvergenceView: placementsOf('pub-b', [fakePlacement('p1', 'pub-b', 'hash-b', 'ipfs', 'loc-1')])
        });
        assert(onlyPlacements.possession.state === null, '1. supplying only placements never fabricates a possession state');
        assert(onlyPlacements.acquisition === null, '2. supplying only placements never fabricates an acquisition dimension');
        assert(onlyPlacements.peerObservations === null, '3. supplying only placements never fabricates a peerObservations dimension');
        assert(onlyPlacements.placements.placementCount === 1, '4. the one dimension actually supplied is reported faithfully');

        const onlyPeers = describeSnapshotStateInspection({
            publicationId: 'pub-b', contentHash: 'hash-b',
            peerPossessionComparisonView: peersOf('pub-b', 'hash-b', [['bob', SnapshotPeerPossessionState.NOT_AVAILABLE]])
        });
        assert(onlyPeers.placements === null, '5. supplying only peer observations never fabricates a placements dimension');
        assert(onlyPeers.acquisition === null, '6. supplying only peer observations never fabricates an acquisition dimension');
        assert(onlyPeers.peerObservations.notAvailableCount === 1, '7. the one dimension actually supplied is reported faithfully');

        const onlyPossession = describeSnapshotStateInspection({
            publicationId: 'pub-b', contentHash: 'hash-b',
            possessionView: possessionOf(LocalSnapshotContentAvailabilityOutcome.CONTENT_HASH_MISMATCH, 'pub-b', 'hash-b')
        });
        assert(onlyPossession.possession.state === LocalSnapshotContentAvailabilityOutcome.CONTENT_HASH_MISMATCH, '8. possession is reported exactly as given');
        assert(onlyPossession.acquisition === null && onlyPossession.placements === null && onlyPossession.peerObservations === null,
            '9. supplying only possession never fabricates any of the other three dimensions');
    }
    console.log('✓ Section B: every composed dimension is reported, or reported absent, entirely independently of the other three');

    // ---------------------------------------------------------------
    // Section C — "not yet computed" (null) is structurally distinct
    // from "computed and empty" (present, all-zero)
    // ---------------------------------------------------------------
    {
        const neverComputed = describeSnapshotStateInspection({ publicationId: 'pub-c', contentHash: 'hash-c' });
        assert(neverComputed.acquisition === null, '1. an omitted acquisitionView reports acquisition: null');
        assert(neverComputed.placements === null, '2. an omitted placementConvergenceView reports placements: null');
        assert(neverComputed.peerObservations === null, '3. an omitted peerPossessionComparisonView reports peerObservations: null');

        const computedEmpty = describeSnapshotStateInspection({
            publicationId: 'pub-c', contentHash: 'hash-c',
            acquisitionView: acquisitionOf('pub-c', 'hash-c', null, []),
            placementConvergenceView: placementsOf('pub-c', []),
            peerPossessionComparisonView: peersOf('pub-c', 'hash-c', [])
        });
        assert(computedEmpty.acquisition !== null && computedEmpty.acquisition.attemptCount === 0, '4. a computed-but-empty acquisitionView reports a present dimension with attemptCount: 0, never null');
        assert(computedEmpty.placements !== null && computedEmpty.placements.placementCount === 0, '5. a computed-but-empty placementConvergenceView reports a present dimension with placementCount: 0, never null');
        assert(computedEmpty.peerObservations !== null && computedEmpty.peerObservations.peerCount === 0, '6. a computed-but-empty peerPossessionComparisonView reports a present dimension with peerCount: 0, never null');
    }
    console.log('✓ Section C: "never computed" (null) and "computed and empty" (present, all-zero) stay two structurally distinct results across all three composed dimensions');

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP
    // ---------------------------------------------------------------
    {
        // Alice: AVAILABLE, one PACKAGE attempt, AGREEMENT, 2 AVAILABLE peers.
        const alicePossession = possessionOf(LocalSnapshotContentAvailabilityOutcome.AVAILABLE, 'pub-flagship', 'hash-x');
        const alice = describeSnapshotStateInspection({
            publicationId: 'pub-flagship', contentHash: 'hash-x',
            possessionView: alicePossession,
            acquisitionView: acquisitionOf('pub-flagship', 'hash-x', alicePossession, [
                { sourceKind: SnapshotMaterializationSourceKind.PACKAGE, outcome: StoreSnapshotContentOutcome.STORED }
            ]),
            placementConvergenceView: placementsOf('pub-flagship', [
                fakePlacement('p1', 'pub-flagship', 'hash-x', 'local', 'loc-1'),
                fakePlacement('p2', 'pub-flagship', 'hash-x', 'ipfs', 'loc-2')
            ]),
            peerPossessionComparisonView: peersOf('pub-flagship', 'hash-x', [
                ['bob', SnapshotPeerPossessionState.AVAILABLE], ['carol', SnapshotPeerPossessionState.AVAILABLE]
            ])
        });

        // Bob: NOT_AVAILABLE, one PLACEMENT attempt, AGREEMENT, 1 AVAILABLE peer.
        const bobPossession = possessionOf(LocalSnapshotContentAvailabilityOutcome.NOT_AVAILABLE, 'pub-flagship', 'hash-x');
        const bob = describeSnapshotStateInspection({
            publicationId: 'pub-flagship', contentHash: 'hash-x',
            possessionView: bobPossession,
            acquisitionView: acquisitionOf('pub-flagship', 'hash-x', bobPossession, [
                { sourceKind: SnapshotMaterializationSourceKind.PLACEMENT, outcome: StoreSnapshotContentOutcome.STORED }
            ]),
            placementConvergenceView: placementsOf('pub-flagship', [
                fakePlacement('p1', 'pub-flagship', 'hash-x', 'local', 'loc-1')
            ]),
            peerPossessionComparisonView: peersOf('pub-flagship', 'hash-x', [
                ['alice', SnapshotPeerPossessionState.AVAILABLE]
            ])
        });

        // Carol: AVAILABLE, one PEER attempt, CONFLICT, 1 NOT_AVAILABLE peer.
        const carolPossession = possessionOf(LocalSnapshotContentAvailabilityOutcome.AVAILABLE, 'pub-flagship', 'hash-x');
        const carol = describeSnapshotStateInspection({
            publicationId: 'pub-flagship', contentHash: 'hash-x',
            possessionView: carolPossession,
            acquisitionView: acquisitionOf('pub-flagship', 'hash-x', carolPossession, [
                { sourceKind: SnapshotMaterializationSourceKind.PEER, outcome: StoreSnapshotContentOutcome.STORED }
            ]),
            placementConvergenceView: placementsOf('pub-flagship', [
                fakePlacement('p1', 'pub-flagship', 'hash-x', 'local', 'loc-1'),
                fakePlacement('p2', 'pub-flagship', 'hash-y', 'ipfs', 'loc-2')
            ]),
            peerPossessionComparisonView: peersOf('pub-flagship', 'hash-x', [
                ['dave', SnapshotPeerPossessionState.NOT_AVAILABLE]
            ])
        });

        // Dave: CONTENT_HASH_MISMATCH, PACKAGE + PEER attempts, CONFLICT,
        // one UNAVAILABLE peer.
        const davePossession = possessionOf(LocalSnapshotContentAvailabilityOutcome.CONTENT_HASH_MISMATCH, 'pub-flagship', 'hash-x');
        const dave = describeSnapshotStateInspection({
            publicationId: 'pub-flagship', contentHash: 'hash-x',
            possessionView: davePossession,
            acquisitionView: acquisitionOf('pub-flagship', 'hash-x', davePossession, [
                { sourceKind: SnapshotMaterializationSourceKind.PACKAGE, outcome: StoreSnapshotContentOutcome.STORED },
                { sourceKind: SnapshotMaterializationSourceKind.PEER, outcome: StoreSnapshotContentOutcome.HASH_MISMATCH }
            ]),
            placementConvergenceView: placementsOf('pub-flagship', [
                fakePlacement('p1', 'pub-flagship', 'hash-x', 'local', 'loc-1'),
                fakePlacement('p2', 'pub-flagship', 'hash-y', 'ipfs', 'loc-2')
            ]),
            peerPossessionComparisonView: peersOf('pub-flagship', 'hash-x', [
                ['erin', SnapshotPeerPossessionState.UNAVAILABLE]
            ])
        });

        // --- Every one of the four replicas' own facts is exposed exactly
        // as observed, faithfully and without correction. ---
        assert(alice.possession.state === LocalSnapshotContentAvailabilityOutcome.AVAILABLE, '1. Alice: possession AVAILABLE');
        assert(alice.acquisition.sources.package === 1 && alice.acquisition.attemptCount === 1, '2. Alice: one PACKAGE attempt');
        assert(alice.placements.relationship === SnapshotPlacementRelationship.AGREEMENT, '3. Alice: placement relationship AGREEMENT');
        assert(alice.peerObservations.availableCount === 2, '4. Alice: 2 peers reported AVAILABLE');

        assert(bob.possession.state === LocalSnapshotContentAvailabilityOutcome.NOT_AVAILABLE, '5. Bob: possession NOT_AVAILABLE');
        assert(bob.acquisition.sources.placement === 1 && bob.acquisition.attemptCount === 1, '6. Bob: one PLACEMENT attempt');
        assert(bob.placements.relationship === SnapshotPlacementRelationship.AGREEMENT, '7. Bob: placement relationship AGREEMENT');
        assert(bob.peerObservations.availableCount === 1, '8. Bob: 1 peer reported AVAILABLE');

        assert(carol.possession.state === LocalSnapshotContentAvailabilityOutcome.AVAILABLE, '9. Carol: possession AVAILABLE');
        assert(carol.acquisition.sources.peer === 1 && carol.acquisition.attemptCount === 1, '10. Carol: one PEER attempt');
        assert(carol.placements.relationship === SnapshotPlacementRelationship.CONFLICT, '11. Carol: placement relationship CONFLICT');
        assert(carol.peerObservations.notAvailableCount === 1, '12. Carol: 1 peer reported NOT_AVAILABLE');

        assert(dave.possession.state === LocalSnapshotContentAvailabilityOutcome.CONTENT_HASH_MISMATCH, '13. Dave: possession CONTENT_HASH_MISMATCH');
        assert(dave.acquisition.sources.package === 1 && dave.acquisition.sources.peer === 1 && dave.acquisition.attemptCount === 2, '14. Dave: PACKAGE + PEER attempts');
        assert(dave.placements.relationship === SnapshotPlacementRelationship.CONFLICT, '15. Dave: placement relationship CONFLICT');
        assert(dave.peerObservations.unavailableCount === 1, '16. Dave: 1 peer could not be determined');

        // --- INVARIANT: all four replicas' composed views are pairwise
        // DIFFERENT — the unified view never collapses four genuinely
        // different combinations into fewer than four distinct shapes. ---
        const composed = [alice, bob, carol, dave];
        const uniqueSerialized = new Set(composed.map((view) => JSON.stringify(view)));
        assert(uniqueSerialized.size === 4, '17. INVARIANT: all four replicas\' unified views are pairwise DIFFERENT');

        // --- INVARIANT: no fifth, manufactured state anywhere — the
        // composed shape is nothing but the four dimensions this file's
        // own header names, and none of them describes the combination
        // as good, bad, healthy, or trustworthy. ---
        const EXPECTED_TOP_LEVEL_KEYS = ['publicationId', 'contentHash', 'possession', 'acquisition', 'placements', 'peerObservations'];
        for (const [name, view] of [['Alice', alice], ['Bob', bob], ['Carol', carol], ['Dave', dave]]) {
            assert(JSON.stringify(Object.keys(view).sort()) === JSON.stringify([...EXPECTED_TOP_LEVEL_KEYS].sort()),
                `18. ${name}'s own composed view carries exactly the four documented dimensions, nothing more`);
            assertNoForbiddenVocabulary(view, '', `19. ${name}'s own composed view`);
        }
    }
    console.log('✓ Section D: FLAGSHIP — four replicas with four genuinely different combinations of possession, acquisition, placements, and peer observations are each exposed faithfully, with no fifth manufactured state anywhere');

    console.log('\n✅ All SnapshotStateInspectionView tests passed');
}

run();
