import { Position } from '../core/Position.js';
import { WorldPlacement } from '../core/WorldPlacement.js';
import { computeDeterministicGridPosition } from '../core/DeterministicGridPlacement.js';
import { GridPlacementStrategy } from '../application/InitialPlacementStrategy.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { Publication } from '../publisher/Publication.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.2.24 — World Coordinate Semantics & Placement UX.
//
// This file does not re-test anything tests/PlacementWorldView.test.js
// already covers (placement resolution, move/fork independence,
// ownership-as-UI-signal). It tests the two things THIS milestone
// actually changes:
//   - GridPlacementStrategy (and LocalWorldLayoutProvider's legacy
//     fallback) must be a PURE function of a publication's own id —
//     never of how many other publications this node happens to know
//     about, or in what order it learned about them. That's the
//     concrete, testable form of "same publication -> same placement
//     algorithm -> same absolute coordinate on every replica."
//   - A document-local position and a WorldPlacement's global position
//     compose by simple addition into an effective world position.

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function makePublication(id, documentId, title) {
    return new Publication({ id, documentId, title, author: 'alice' });
}

async function runTests() {
    // -------------------------------------------------------------
    // 1-2. GridPlacementStrategy is a pure function of publicationId:
    //      calling it twice, or from two independent instances, with
    //      the same id always produces the exact same position.
    // -------------------------------------------------------------
    {
        const strategyA = new GridPlacementStrategy();
        const strategyB = new GridPlacementStrategy();
        const posA = strategyA.computePosition({ publicationId: 'pub-alice-castle' });
        const posB = strategyB.computePosition({ publicationId: 'pub-alice-castle' });
        assert(posA.x === posB.x && posA.y === posB.y && posA.z === posB.z,
            '1. GridPlacementStrategy produces the same position from two independent instances for the same id');

        const posAgain = strategyA.computePosition({ publicationId: 'pub-alice-castle' });
        assert(posA.x === posAgain.x && posA.z === posAgain.z,
            '2. GridPlacementStrategy produces the same position on repeated calls (no hidden internal counter)');
    }

    // -------------------------------------------------------------
    // 3. The actual bug this milestone fixes: two different
    //    publications, placed on two nodes that have each locally
    //    discovered a DIFFERENT number of other publications first,
    //    must not collide just because they happened to be the Nth
    //    publication each node knew about. GridPlacementStrategy no
    //    longer takes (or needs) a discoveryProvider at all — proving
    //    the "local list state" input that caused the bug is gone,
    //    not merely worked around.
    // -------------------------------------------------------------
    {
        const strategy = new GridPlacementStrategy();
        const posOnQuietNode = strategy.computePosition({ publicationId: 'pub-bob-tower' });
        // Simulate a node that has already discovered many other
        // publications before placing this one — GridPlacementStrategy
        // has nothing in its signature that could even observe that.
        for (let i = 0; i < 50; i++) {
            strategy.computePosition({ publicationId: `unrelated-noise-${i}` });
        }
        const posOnBusyNode = strategy.computePosition({ publicationId: 'pub-bob-tower' });
        assert(posOnQuietNode.x === posOnBusyNode.x && posOnQuietNode.z === posOnBusyNode.z,
            '3. placing the same publication is unaffected by how many other publications were placed first');
    }

    // -------------------------------------------------------------
    // 4. Distinct publications ordinarily land at distinct positions
    //    (not a guarantee — see core/DeterministicGridPlacement.js —
    //    but true for these two ids, confirming the grid actually
    //    spreads placements rather than collapsing everything to one
    //    slot).
    // -------------------------------------------------------------
    {
        const a = computeDeterministicGridPosition('pub-alice-castle');
        const b = computeDeterministicGridPosition('pub-bob-tower');
        assert(a.x !== b.x || a.z !== b.z, '4. two different publication ids land at different grid cells');
    }

    // -------------------------------------------------------------
    // 5-6. LocalWorldLayoutProvider's legacy fallback (for
    //      publications with no recorded PlacementRecord) is now the
    //      SAME deterministic function — proven by giving two
    //      providers the identical publication at a DIFFERENT index
    //      in an otherwise different list, and confirming both
    //      resolve it to the same position.
    // -------------------------------------------------------------
    {
        const sharedPublication = makePublication('shared-legacy-pub', 'shared-legacy-doc', 'Shared Legacy World');

        const storageA = new InMemoryStorageProvider();
        storageA.save('forkbuild-publications', [
            sharedPublication.toJSON(),
            makePublication('other-1', 'other-1-doc', 'Other 1').toJSON(),
            makePublication('other-2', 'other-2-doc', 'Other 2').toJSON()
        ]);
        const discoveryA = new LocalDiscoveryProvider(storageA);
        const spatialA = new LocalSpatialIndexProvider(storageA);
        const layoutA = new LocalWorldLayoutProvider(spatialA, discoveryA);

        const storageB = new InMemoryStorageProvider();
        storageB.save('forkbuild-publications', [
            makePublication('other-3', 'other-3-doc', 'Other 3').toJSON(),
            makePublication('other-4', 'other-4-doc', 'Other 4').toJSON(),
            makePublication('other-5', 'other-5-doc', 'Other 5').toJSON(),
            sharedPublication.toJSON()
        ]);
        const discoveryB = new LocalDiscoveryProvider(storageB);
        const spatialB = new LocalSpatialIndexProvider(storageB);
        const layoutB = new LocalWorldLayoutProvider(spatialB, discoveryB);

        const posA = layoutA.getPosition('shared-legacy-doc');
        const posB = layoutB.getPosition('shared-legacy-doc');
        assert(posA.x === posB.x && posA.y === posB.y && posA.z === posB.z,
            '5. the same unplaced publication resolves to the same fallback position regardless of its index '
            + 'in each node\'s local list');

        const expected = computeDeterministicGridPosition('shared-legacy-pub');
        assert(posA.x === expected.x && posA.z === expected.z,
            '6. the fallback position matches GridPlacementStrategy\'s own algorithm for the same id');
    }

    // -------------------------------------------------------------
    // 7-9. Document-local position + WorldPlacement position =
    //      effective world position (the tower example).
    // -------------------------------------------------------------
    {
        const placement = new WorldPlacement({
            publicationId: 'castle-pub',
            position: new Position(500, 0, -200)
        });
        const towerLocal = new Position(10, 5, 0);
        const effective = placement.effectiveWorldPosition(towerLocal);
        assert(effective.x === 510 && effective.y === 5 && effective.z === -200,
            '7. a document-local position composes with a WorldPlacement into the correct effective world position');

        const plainShape = placement.effectiveWorldPosition({ x: 10, y: 5, z: 0 });
        assert(plainShape.x === 510 && plainShape.z === -200,
            '8. effectiveWorldPosition also accepts a plain {x,y,z} shape, not only a Position instance');

        const summed = new Position(1, 2, 3).add(new Position(10, 20, 30));
        assert(summed.x === 11 && summed.y === 22 && summed.z === 33,
            '9. Position.add is plain componentwise addition');
    }

    console.log('✅ All World Coordinate Semantics tests passed.');
}

runTests().catch((e) => { console.error(e); throw e; });
