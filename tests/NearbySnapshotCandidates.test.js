import { selectNearbySnapshotCandidates, DEFAULT_MAX_UNLOCATED_CANDIDATES } from '../application/snapshot/NearbySnapshotCandidates.js';
import { SNAPSHOT_CELL_SIZE } from '../core/NarrowDiscoveryTags.js';
import { limitConcurrency } from '../utils/limitConcurrency.js';
import { assert } from './support/Assert.js';

// World View fetches the bytes of nearby Snapshots only, a few at a time.

const VIEWER = { x: 500, y: 0, z: 500 }; // cell 0:0

function candidate(id, extra = {}) {
    return { contentHash: `hash-${id}`, locator: `ar://${id}`, storage: 'ar', ...extra };
}

const ids = (list) => list.map((c) => c.contentHash);

async function run() {
    // Section A: located candidates are kept only within the 3x3 block of cells.
    {
        const near = candidate('near', { publicationId: 'p-near', claimedPosition: { x: 10, y: 0, z: 20 } });
        const edge = candidate('edge', { publicationId: 'p-edge', claimedPosition: { x: -SNAPSHOT_CELL_SIZE + 1, y: 0, z: 2 * SNAPSHOT_CELL_SIZE - 1 } });
        const far = candidate('far', { publicationId: 'p-far', claimedPosition: { x: 5 * SNAPSHOT_CELL_SIZE, y: 0, z: 0 } });
        const kept = selectNearbySnapshotCandidates([near, edge, far], { viewerPosition: VIEWER });
        assert(ids(kept).join() === 'hash-near,hash-edge', 'A1. the viewer\'s cell and the ring around it are kept; a far one is not');

        const moved = selectNearbySnapshotCandidates([near, edge, far], { viewerPosition: { x: 5 * SNAPSHOT_CELL_SIZE + 1, y: 0, z: 1 } });
        assert(ids(moved).join() === 'hash-far', 'A2. once the viewer moves near it, the far one is kept');
        console.log('✓ Section A: nearby cells only');
    }

    // Section B: a local placement wins over the publisher's claimed position.
    {
        const claimedFar = candidate('placed-near', { publicationId: 'p-1', claimedPosition: { x: 9 * SNAPSHOT_CELL_SIZE, y: 0, z: 0 } });
        const claimedNear = candidate('placed-far', { publicationId: 'p-2', claimedPosition: { x: 1, y: 0, z: 1 } });
        const noClaim = candidate('placed-only', { publicationId: 'p-3' });
        const placements = { 'p-1': { x: 100, y: 0, z: 100 }, 'p-2': { x: 9 * SNAPSHOT_CELL_SIZE, y: 0, z: 0 }, 'p-3': { x: 0, y: 0, z: 0 } };
        const asked = [];
        const kept = selectNearbySnapshotCandidates([claimedFar, claimedNear, noClaim], {
            viewerPosition: VIEWER,
            placementPositionOf: (publicationId) => { asked.push(publicationId); return placements[publicationId] || null; }
        });
        assert(ids(kept).join() === 'hash-placed-near,hash-placed-only', 'B1. the placement decides, not the claim');
        assert(asked.join() === 'p-1,p-2,p-3', 'B2. the placement is looked up by publication id');
        console.log('✓ Section B: a placement wins over a claim');
    }

    // Section C: candidates with no position are kept up to the cap, in order.
    {
        const unlocated = Array.from({ length: DEFAULT_MAX_UNLOCATED_CANDIDATES + 5 }, (_, i) => candidate(`u${i}`));
        const far = candidate('far', { publicationId: 'p-far', claimedPosition: { x: 9e6, y: 0, z: 0 } });
        const near = candidate('near', { publicationId: 'p-near', claimedPosition: { x: 1, y: 0, z: 1 } });
        const kept = selectNearbySnapshotCandidates([far, ...unlocated, near], { viewerPosition: VIEWER });
        assert(kept.length === DEFAULT_MAX_UNLOCATED_CANDIDATES + 1, 'C1. the cap applies to unlocated candidates only');
        assert(kept[0].contentHash === 'hash-u0' && kept[DEFAULT_MAX_UNLOCATED_CANDIDATES - 1].contentHash === `hash-u${DEFAULT_MAX_UNLOCATED_CANDIDATES - 1}`,
            'C2. the first (newest) unlocated candidates are the ones kept');
        assert(kept[kept.length - 1] === near, 'C3. a nearby candidate after the cap is still kept');

        const custom = selectNearbySnapshotCandidates(unlocated, { viewerPosition: VIEWER, maxUnlocated: 2 });
        assert(custom.length === 2, 'C4. the cap can be set');

        const badClaim = candidate('bad', { publicationId: 'p-bad', claimedPosition: { x: NaN, y: 0, z: 0 } });
        const withBad = selectNearbySnapshotCandidates([badClaim], { viewerPosition: VIEWER, maxUnlocated: 0 });
        assert(withBad.length === 0, 'C5. an unusable position counts as none');
        console.log('✓ Section C: unlocated candidates are capped');
    }

    // Section D: edge cases.
    {
        const near = candidate('near', { publicationId: 'p', claimedPosition: { x: 1, y: 0, z: 1 } });
        const unlocated = candidate('u');
        const noViewer = selectNearbySnapshotCandidates([near, unlocated], { viewerPosition: null });
        assert(ids(noViewer).join() === 'hash-u', 'D1. without a viewer position nothing located is near');
        assert(selectNearbySnapshotCandidates(null).length === 0 && selectNearbySnapshotCandidates([null, undefined]).length === 0,
            'D2. no candidates, or empty entries, select nothing');
        const input = [near, unlocated];
        selectNearbySnapshotCandidates(input, { viewerPosition: VIEWER });
        assert(input.length === 2 && input[0] === near, 'D3. the input list is left as it was');
        console.log('✓ Section D: edge cases');
    }

    // Section E: limitConcurrency.
    {
        let running = 0;
        let peak = 0;
        const releases = [];
        const started = [];
        const limited = limitConcurrency((id) => new Promise((resolve) => {
            running += 1;
            peak = Math.max(peak, running);
            started.push(id);
            releases.push(() => { running -= 1; resolve(`done-${id}`); });
        }), 2);
        const results = [1, 2, 3, 4, 5].map((id) => limited(id));
        await Promise.resolve(); await Promise.resolve();
        assert(started.join() === '1,2', 'E1. only two calls start at once');
        while (releases.length > 0) {
            releases.shift()();
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
        const settled = await Promise.all(results);
        assert(settled.join() === 'done-1,done-2,done-3,done-4,done-5', 'E2. every call settles with its own result');
        assert(started.join() === '1,2,3,4,5' && peak === 2, 'E3. waiting calls start in call order, never above the limit');

        const failing = limitConcurrency(async (value) => {
            if (value === 'bad') throw new Error('bad input');
            return value;
        }, 1);
        const [bad, good] = await Promise.allSettled([failing('bad'), failing('good')]);
        assert(bad.status === 'rejected' && bad.reason.message === 'bad input', 'E4. a rejection reaches its own caller');
        assert(good.status === 'fulfilled' && good.value === 'good', 'E5. and never stops the queue');

        const syncThrow = limitConcurrency(() => { throw new Error('sync'); }, 1);
        const outcome = await syncThrow().then(() => 'resolved', (error) => error.message);
        assert(outcome === 'sync', 'E6. a synchronous throw becomes a rejection');

        let threw = 0;
        for (const max of [0, -1, 1.5, '2']) {
            try { limitConcurrency(() => null, max); } catch { threw += 1; }
        }
        try { limitConcurrency(null, 1); } catch { threw += 1; }
        assert(threw === 5, 'E7. a bad limit or function is refused');
        console.log('✓ Section E: limitConcurrency');
    }

    console.log('\nAll NearbySnapshotCandidates tests passed.');
}

run().catch((error) => {
    console.error('NearbySnapshotCandidates.test.js FAILED:', error);
    process.exitCode = 1;
});
