import { SnapshotMaterializationSourceKind } from '../application/SnapshotMaterializationSourceKind.js';
import { createSnapshotMaterializationSourceSelection } from '../application/SnapshotMaterializationSourceSelection.js';
import { SnapshotMaterializationSelectionCoordinator } from '../application/SnapshotMaterializationSelectionCoordinator.js';
import { PeerSnapshotMaterializationOutcome } from '../application/PeerSnapshotMaterializationOutcome.js';
import { SnapshotPlacementMaterializationOutcome } from '../application/SnapshotPlacementMaterializationOutcome.js';
import { SnapshotContentTransferOutcome } from '../application/SnapshotContentTransferOutcome.js';
import { SnapshotPeerPossessionState } from '../application/SnapshotPeerPossessionState.js';
import { toSnapshotPeerPossessionObservation } from '../application/SnapshotPeerPossessionObservation.js';
import { describeSnapshotPeerPossessionComparison } from '../application/SnapshotPeerPossessionComparisonView.js';

// 0.8.42 — Explicit Snapshot Source Selection & Materialization UX.
//
//   Section A: application/SnapshotMaterializationSourceSelection.js —
//              createSnapshotMaterializationSourceSelection() builds
//              exactly the right frozen shape for each of the three
//              SnapshotMaterializationSourceKind values, and rejects a
//              missing kind or a payload that does not match the kind
//              chosen.
//   Section B: application/SnapshotMaterializationSelectionCoordinator.js —
//              materialize() dispatches a selection to EXACTLY the one
//              already-existing coordinator its own kind names, forwards
//              its payload unchanged, returns the result unchanged, and
//              never calls either of the other two coordinators. A kind
//              whose coordinator was never wired throws immediately,
//              rather than silently falling through to a different one.
//   Section C — FLAGSHIP: source disagreement without adjudication. Alice
//              and Carol both report AVAILABLE, Bob reports NOT_AVAILABLE,
//              and an IPFS placement resolves UNAVAILABLE. The person
//              explicitly chooses Alice; Alice has since gone offline, and
//              the materialization attempt honestly reports UNAVAILABLE.
//              Nothing in this codebase automatically tries Carol, changes
//              Alice's own possession observation, creates a placement, or
//              ranks Carol above Alice. The person then explicitly chooses
//              Carol, and that SEPARATE, independent attempt succeeds.
//
// See docs/Principles.md, "A Source Selection Is A Person's Own Action,
// Never An Application Recommendation (0.8.42)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

// A minimal fake standing in for any of the three already-existing,
// already-tested *MaterializationCoordinator.js classes — this test file
// is not re-proving what those already prove elsewhere (application/
// SnapshotContentMaterializationCoordinator.js, application/
// SnapshotPlacementMaterializationCoordinator.js, application/
// SnapshotPeerMaterializationCoordinator.js each have their own coverage);
// it exists only to prove application/
// SnapshotMaterializationSelectionCoordinator.js#materialize() calls the
// right one, with the right payload, and touches none of the others.
class FakeCoordinator {
    constructor(methodName, result) {
        this.calls = [];
        this[methodName] = (...args) => {
            this.calls.push(args);
            return Promise.resolve(typeof result === 'function' ? result(...args) : result);
        };
    }
}

async function run() {
    // --- Section A ---
    {
        const pkg = { publicationId: 'pub-1', contentHash: 'hash-1', content: 'bytes' };
        const packageSelection = createSnapshotMaterializationSourceSelection({ kind: SnapshotMaterializationSourceKind.PACKAGE, pkg });
        assert(packageSelection.kind === SnapshotMaterializationSourceKind.PACKAGE, '1. a PACKAGE selection carries its own kind');
        assert(packageSelection.pkg === pkg, '2. a PACKAGE selection carries the exact pkg object given, unchanged');
        assert(Object.isFrozen(packageSelection), '3. a selection is frozen');

        const placement = { id: 'placement-1', toJSON: () => ({}) };
        const placementSelection = createSnapshotMaterializationSourceSelection({ kind: SnapshotMaterializationSourceKind.PLACEMENT, placement });
        assert(placementSelection.kind === SnapshotMaterializationSourceKind.PLACEMENT, '4. a PLACEMENT selection carries its own kind');
        assert(placementSelection.placement === placement, '5. a PLACEMENT selection carries the exact placement object given, unchanged');

        const peer = { connectionId: 'peer-1' };
        const peerSelection = createSnapshotMaterializationSourceSelection({
            kind: SnapshotMaterializationSourceKind.PEER, peer, publicationId: 'pub-1', contentHash: 'hash-1'
        });
        assert(peerSelection.kind === SnapshotMaterializationSourceKind.PEER, '6. a PEER selection carries its own kind');
        assert(peerSelection.peer === peer && peerSelection.publicationId === 'pub-1' && peerSelection.contentHash === 'hash-1',
            '7. a PEER selection carries the exact peer/publicationId/contentHash given, unchanged');

        let threw = false;
        try { createSnapshotMaterializationSourceSelection({ kind: 'not-a-real-kind', pkg }); } catch { threw = true; }
        assert(threw, '8. an unrecognized kind throws');

        threw = false;
        try { createSnapshotMaterializationSourceSelection({ kind: SnapshotMaterializationSourceKind.PACKAGE }); } catch { threw = true; }
        assert(threw, '9. a PACKAGE selection with no pkg throws');

        threw = false;
        try { createSnapshotMaterializationSourceSelection({ kind: SnapshotMaterializationSourceKind.PLACEMENT }); } catch { threw = true; }
        assert(threw, '10. a PLACEMENT selection with no placement throws');

        threw = false;
        try { createSnapshotMaterializationSourceSelection({ kind: SnapshotMaterializationSourceKind.PEER, peer }); } catch { threw = true; }
        assert(threw, '11. a PEER selection with no publicationId/contentHash throws');
    }
    console.log('✓ Section A: createSnapshotMaterializationSourceSelection() builds exactly the right frozen shape per kind, and rejects a missing kind or a payload mismatched to the chosen kind');

    // --- Section B ---
    {
        const pkg = { publicationId: 'pub-1' };
        const placement = { id: 'placement-1' };
        const peer = { connectionId: 'peer-1' };
        const packageResult = { outcome: SnapshotContentTransferOutcome.STORED, source: { kind: SnapshotMaterializationSourceKind.PACKAGE } };
        const placementResult = { outcome: SnapshotPlacementMaterializationOutcome.STORED, source: { kind: SnapshotMaterializationSourceKind.PLACEMENT } };
        const peerResult = { outcome: PeerSnapshotMaterializationOutcome.STORED, source: { kind: SnapshotMaterializationSourceKind.PEER } };

        const packageCoordinator = new FakeCoordinator('import', packageResult);
        const placementCoordinator = new FakeCoordinator('materialize', placementResult);
        const peerCoordinator = new FakeCoordinator('materialize', peerResult);

        const coordinator = new SnapshotMaterializationSelectionCoordinator({ packageCoordinator, placementCoordinator, peerCoordinator });

        const packageOut = await coordinator.materialize(createSnapshotMaterializationSourceSelection({ kind: SnapshotMaterializationSourceKind.PACKAGE, pkg }));
        assert(packageOut === packageResult, '1. a PACKAGE selection resolves to the package coordinator\'s own result, unchanged');
        assert(packageCoordinator.calls.length === 1 && packageCoordinator.calls[0][0] === pkg, '2. the package coordinator received the exact pkg, and was called exactly once');
        assert(placementCoordinator.calls.length === 0 && peerCoordinator.calls.length === 0, '3. neither the placement nor the peer coordinator was ever called for a PACKAGE selection');

        const placementOut = await coordinator.materialize(createSnapshotMaterializationSourceSelection({ kind: SnapshotMaterializationSourceKind.PLACEMENT, placement }));
        assert(placementOut === placementResult, '4. a PLACEMENT selection resolves to the placement coordinator\'s own result, unchanged');
        assert(placementCoordinator.calls.length === 1 && placementCoordinator.calls[0][0] === placement, '5. the placement coordinator received the exact placement, and was called exactly once');
        assert(packageCoordinator.calls.length === 1 && peerCoordinator.calls.length === 0, '6. neither the package nor the peer coordinator was called again for a PLACEMENT selection');

        const peerOut = await coordinator.materialize(createSnapshotMaterializationSourceSelection({
            kind: SnapshotMaterializationSourceKind.PEER, peer, publicationId: 'pub-1', contentHash: 'hash-1'
        }));
        assert(peerOut === peerResult, '7. a PEER selection resolves to the peer coordinator\'s own result, unchanged');
        assert(peerCoordinator.calls.length === 1
            && peerCoordinator.calls[0][0].peer === peer
            && peerCoordinator.calls[0][0].publicationId === 'pub-1'
            && peerCoordinator.calls[0][0].contentHash === 'hash-1',
            '8. the peer coordinator received the exact peer/publicationId/contentHash, and was called exactly once');
        assert(packageCoordinator.calls.length === 1 && placementCoordinator.calls.length === 1, '9. neither the package nor the placement coordinator was called again for a PEER selection');

        // An unwired coordinator throws rather than silently doing nothing
        // or falling through to a different source.
        const partial = new SnapshotMaterializationSelectionCoordinator({ packageCoordinator });
        let threw = false;
        try {
            await partial.materialize(createSnapshotMaterializationSourceSelection({ kind: SnapshotMaterializationSourceKind.PLACEMENT, placement }));
        } catch { threw = true; }
        assert(threw, '10. a PLACEMENT selection against a coordinator with no placementCoordinator wired throws');

        threw = false;
        try { await coordinator.materialize(null); } catch { threw = true; }
        assert(threw, '11. materialize(null) throws — a caller contract violation, never a silent no-op');
    }
    console.log('✓ Section B: SnapshotMaterializationSelectionCoordinator#materialize() dispatches to exactly the one already-existing coordinator its selection names, forwards its payload unchanged, returns its result unchanged, and never calls a coordinator its selection did not name');

    // --- Section C — FLAGSHIP ---
    {
        const publicationId = 'pub-flagship';
        const contentHash = 'hash-flagship';
        const observedAt = new Date('2026-08-26T18:32:00Z');

        // Four independent observations, exactly as application/
        // SnapshotPeerPossessionCoordinator.js#observePeers() would have
        // produced them — Alice and Carol AVAILABLE, Bob NOT_AVAILABLE, and
        // an IPFS placement (modeled here as its own resolution outcome,
        // never a fourth peer) UNAVAILABLE.
        const aliceObservation = toSnapshotPeerPossessionObservation({ peerId: 'alice', publicationId, contentHash, state: SnapshotPeerPossessionState.AVAILABLE, observedAt });
        const bobObservation = toSnapshotPeerPossessionObservation({ peerId: 'bob', publicationId, contentHash, state: SnapshotPeerPossessionState.NOT_AVAILABLE, observedAt });
        const carolObservation = toSnapshotPeerPossessionObservation({ peerId: 'carol', publicationId, contentHash, state: SnapshotPeerPossessionState.AVAILABLE, observedAt });
        const placementResolutionOutcome = SnapshotPlacementMaterializationOutcome.UNAVAILABLE;

        const comparisonBefore = describeSnapshotPeerPossessionComparison(publicationId, contentHash, [aliceObservation, bobObservation, carolObservation]);
        assert(comparisonBefore.availableCount === 2 && comparisonBefore.notAvailableCount === 1, '1. two peers report AVAILABLE, one reports NOT_AVAILABLE, before any materialization attempt is made');

        // Alice has since gone offline: the fake peer coordinator honestly
        // reports UNAVAILABLE for her, and STORED for Carol — modeling
        // exactly the "possession observation ≠ materialization guarantee"
        // gap this milestone exists to make actionable without hiding it.
        const alicePeer = { connectionId: 'alice' };
        const carolPeer = { connectionId: 'carol' };
        const peerCoordinator = new FakeCoordinator('materialize', ({ peer }) => (
            peer.connectionId === 'alice'
                ? { outcome: PeerSnapshotMaterializationOutcome.UNAVAILABLE, reason: 'Alice did not respond.', contentReference: null, source: { kind: SnapshotMaterializationSourceKind.PEER } }
                : { outcome: PeerSnapshotMaterializationOutcome.STORED, contentReference: { hash: contentHash }, source: { kind: SnapshotMaterializationSourceKind.PEER } }
        ));
        const placementCoordinator = new FakeCoordinator('materialize', { outcome: placementResolutionOutcome, contentReference: null, source: { kind: SnapshotMaterializationSourceKind.PLACEMENT } });
        const coordinator = new SnapshotMaterializationSelectionCoordinator({ placementCoordinator, peerCoordinator });

        // The person explicitly chooses Alice.
        const aliceSelection = createSnapshotMaterializationSourceSelection({ kind: SnapshotMaterializationSourceKind.PEER, peer: alicePeer, publicationId, contentHash });
        const aliceAttempt = await coordinator.materialize(aliceSelection);
        assert(aliceAttempt.outcome === PeerSnapshotMaterializationOutcome.UNAVAILABLE, '2. choosing Alice, who has since gone offline, honestly resolves UNAVAILABLE');
        assert(peerCoordinator.calls.length === 1, '3. exactly ONE materialization attempt was made — Alice, and only Alice');
        assert(peerCoordinator.calls[0][0].peer === alicePeer, '4. the attempt was made against exactly the peer the person chose');

        // NOTHING automatically tried Carol, touched the placement, or
        // rewrote Alice's own possession observation.
        assert(placementCoordinator.calls.length === 0, '5. the failed peer attempt never triggered a placement materialization attempt');
        const comparisonAfterAliceFailure = describeSnapshotPeerPossessionComparison(publicationId, contentHash, [aliceObservation, bobObservation, carolObservation]);
        assert(JSON.stringify(comparisonAfterAliceFailure) === JSON.stringify(comparisonBefore), '6. INVARIANT: the possession comparison is byte-identical before and after Alice\'s failed materialization attempt — her own AVAILABLE observation was never rewritten to match reality');
        assert(aliceObservation.state === SnapshotPeerPossessionState.AVAILABLE, '7. INVARIANT: Alice\'s own observation record still reads AVAILABLE — a frozen fact about the past, never corrected retroactively');
        assert(Object.isFrozen(aliceObservation), '8. the observation itself was never, and could never be, mutated');

        // The person then explicitly chooses Carol — a SEPARATE, independent action.
        const carolSelection = createSnapshotMaterializationSourceSelection({ kind: SnapshotMaterializationSourceKind.PEER, peer: carolPeer, publicationId, contentHash });
        const carolAttempt = await coordinator.materialize(carolSelection);
        assert(carolAttempt.outcome === PeerSnapshotMaterializationOutcome.STORED, '9. choosing Carol next succeeds');
        assert(peerCoordinator.calls.length === 2, '10. Carol\'s attempt is a SECOND, independent call — not a retry folded into Alice\'s own failed attempt');
        assert(peerCoordinator.calls[1][0].peer === carolPeer, '11. Carol\'s attempt was made against exactly the peer the person chose the second time');

        // Bob was never contacted; nothing here ever asked him for bytes,
        // and nothing ranked him against Alice or Carol.
        assert(!peerCoordinator.calls.some((call) => call[0].peer && call[0].peer.connectionId === 'bob'), '12. Bob — who reported NOT_AVAILABLE — was never asked for a materialization attempt at all, automatically or otherwise');

        // No `rank`, `score`, `preferred`, `best`, or `recommended` field
        // exists anywhere on either attempt result.
        for (const attempt of [aliceAttempt, carolAttempt]) {
            for (const forbidden of ['rank', 'score', 'preferred', 'best', 'recommended', 'reliability', 'confidence']) {
                assert(!(forbidden in attempt), `13. a materialization attempt result never carries a "${forbidden}" field`);
            }
        }
    }
    console.log('✓ Section C: FLAGSHIP — Alice and Carol both report AVAILABLE, Bob reports NOT_AVAILABLE, an IPFS placement resolves UNAVAILABLE; the person explicitly chooses Alice, who has since gone offline and honestly resolves UNAVAILABLE, without the system automatically trying Carol, touching the placement, or rewriting Alice\'s own frozen possession observation; the person then explicitly chooses Carol, a wholly separate action, and succeeds');

    console.log('\nAll Snapshot Materialization Selection Coordinator tests passed.');
}

async function main() {
    await run();
}

main().catch((error) => {
    console.error('SnapshotMaterializationSelectionCoordinator.test.js FAILED:', error);
    process.exitCode = 1;
});
