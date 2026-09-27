// Claimed builds: a downloaded Snapshot whose publisher claims a position this
// device holds no Placement for is shown as a translucent, unpickable ghost
// at that position, and becomes a real Placement only through an explicit
// Accept Position (application/snapshot/claimed/ClaimedBuilds.js,
// ui/views/worldView/useClaimedBuilds.js, renderer/ClaimedBuildGhostRenderer.js).
import {
    ClaimedBuildStore, ClaimedBuildAcceptance, claimedBuildKey, describeClaimedBuildAcceptance, selectVisibleClaimedBuilds
} from '../application/snapshot/claimed/ClaimedBuilds.js';
import { useClaimedBuilds } from '../ui/views/worldView/useClaimedBuilds.js';
import { ClaimedBuildGhostRenderer } from '../renderer/ClaimedBuildGhostRenderer.js';
import { SnapshotWorldPlacementOutcome } from '../application/snapshot/placement/SnapshotWorldPlacementOutcome.js';
import { SnapshotWorldRegistrationOutcome } from '../application/snapshot/placement/SnapshotWorldRegistrationOutcome.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { License, LicenseId } from '../core/License.js';
import { Position } from '../core/Position.js';
import { assert } from './support/Assert.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function makeBuildText(title, bricks = 3) {
    const world = new World();
    const building = new Building({ creator: 'bob' });
    for (let i = 0; i < bricks; i++) {
        building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(i, 0.5, 0) }));
    }
    world.addBuilding(building);
    const document = new Document({
        world,
        metadata: new DocumentMetadata({ title, author: 'bob', license: new License({ id: LicenseId.CC0_1_0 }) })
    });
    return JSON.stringify(document.toJSON());
}

// Section A — the store and the visibility policy.
{
    const store = new ClaimedBuildStore();
    let notified = 0;
    store.subscribe(() => { notified += 1; });
    assert(!store.record({ publicationId: 'p', contentHash: 'h' }), 'A1. a claim without a position is ignored');
    assert(!store.record({ publicationId: '', contentHash: 'h', claimedPosition: { x: 0, y: 0, z: 0 } }), 'A2. a claim without a publicationId is ignored');
    assert(store.record({ publicationId: 'p', contentHash: 'h', claimedPosition: { x: 10, y: 0, z: 10 } }), 'A3. a usable claim is recorded');
    assert(!store.record({ publicationId: 'p', contentHash: 'h', claimedPosition: { x: 10, y: 0, z: 10 } }), 'A4. the same claim again changes nothing');
    assert(store.record({ publicationId: 'p', contentHash: 'h', claimedPosition: { x: 20, y: 0, z: 10 } }), 'A5. a re-announced position replaces the old one');
    assert(store.list().length === 1 && store.list()[0].position.x === 20 && notified === 2, 'A6. one claim per publicationId:contentHash');

    const near = { key: claimedBuildKey('near', 'h1'), publicationId: 'near', contentHash: 'h1', position: { x: 50, y: 0, z: 50 } };
    const far = { key: claimedBuildKey('far', 'h2'), publicationId: 'far', contentHash: 'h2', position: { x: 50000, y: 0, z: 50 } };
    const placed = { key: claimedBuildKey('placed', 'h3'), publicationId: 'placed', contentHash: 'h3', position: { x: 60, y: 0, z: 60 } };
    const squatting = { key: claimedBuildKey('squat', 'h4'), publicationId: 'squat', contentHash: 'h4', position: { x: 100, y: 0, z: 100 } };
    const visible = selectVisibleClaimedBuilds([near, far, placed, squatting], {
        viewerPosition: { x: 0, y: 0, z: 0 },
        isPlaced: (id) => id === 'placed',
        knownPlacements: [{ placementId: 'mine', publicationId: 'my-pub', position: { x: 100, y: 0, z: 100 } }]
    });
    assert(JSON.stringify(visible.map((c) => c.publicationId)) === JSON.stringify(['near']),
        `A7. only a nearby claim with no Placement and no occupant at its spot is shown — got ${visible.map((c) => c.publicationId)}`);
    assert(selectVisibleClaimedBuilds([near], { viewerPosition: null }).length === 0, 'A8. nothing is shown before the viewer has a position');
    assert(selectVisibleClaimedBuilds([near], { viewerPosition: { x: 0, y: 0, z: 0 }, isDismissed: () => true }).length === 0, 'A9. a hidden claim stays hidden');

    const claim = { publicationId: 'p', contentHash: 'h' };
    assert(describeClaimedBuildAcceptance(claim, () => null) === ClaimedBuildAcceptance.PUBLICATION_UNKNOWN, 'A10. no verified Publication, nothing to accept');
    assert(describeClaimedBuildAcceptance(claim, () => ({ contentReference: { hash: 'other' } })) === ClaimedBuildAcceptance.CONTENT_MISMATCH,
        'A11. a Publication naming other content is never accepted for this ghost');
    assert(describeClaimedBuildAcceptance(claim, () => ({ contentReference: { hash: 'h' } })) === ClaimedBuildAcceptance.ACCEPTABLE, 'A12. matching content is acceptable');
    console.log('✓ A — claims are recorded once, shown only nearby and unoccupied, and accepted only for verified, matching content');
}

// Section B — World View's composable, end to end with real content.
{
    const text = makeBuildText('Bob\'s Tower');
    const hash = computeContentHash(text);
    const tampered = makeBuildText('Tampered');
    const contentByHash = new Map([[hash, text], ['bad-hash', tampered]]);
    const placements = new Map();
    const publications = new Map();
    const shown = new Map();
    const calls = [];
    const messages = [];
    let viewer = { x: 0, y: 0, z: 0 };
    let clock = 0;

    const session = {
        getPlacementInfoForPublication: (id) => placements.get(id) || null,
        listKnownPlacements: () => Array.from(placements.values()),
        findPublicationById: (id) => publications.get(id) || null,
        showClaimedBuild: (key, world, position) => { shown.set(key, { world, position }); return 3; },
        hideClaimedBuild: (key) => { shown.delete(key); },
        focusPosition: (position) => { calls.push(['focus', position]); return true; },
        placePublication: (publicationId, position) => {
            calls.push(['place', publicationId, position]);
            placements.set(publicationId, { placementId: 'pl-1', publicationId, position });
        }
    };
    const claimed = useClaimedBuilds({
        session,
        publicationContentStore: { get: async (reference) => contentByHash.get(reference.hash) || null },
        feedback: { show: (message) => messages.push(message) },
        guarded: (fn) => fn(),
        refreshSpatialUI: () => {},
        getViewerPosition: () => viewer,
        now: () => clock
    });
    const candidate = { publicationId: 'pub-bob', contentHash: hash, claimedPosition: { x: 40, y: 0, z: 30 } };

    claimed.noteSnapshotCandidateResult(candidate, { outcome: SnapshotWorldRegistrationOutcome.REGISTERED, publicationId: 'pub-bob', contentHash: hash });
    claimed.noteSnapshotCandidateResult({ ...candidate, claimedPosition: undefined }, { outcome: SnapshotWorldPlacementOutcome.UNPLACED, publicationId: 'pub-bob', contentHash: hash });
    await flush();
    assert(shown.size === 0, 'B1. a placed run, or one without a claimed position, never becomes a ghost');

    claimed.noteSnapshotCandidateResult(candidate, { outcome: SnapshotWorldPlacementOutcome.UNPLACED, publicationId: 'pub-bob', contentHash: hash });
    await flush(); await flush();
    const key = claimedBuildKey('pub-bob', hash);
    assert(shown.has(key), 'B2. an UNPLACED run with a claimed position is drawn as a ghost');
    assert(shown.get(key).position.x === 40 && shown.get(key).position.z === 30, 'B3. at the claimed position');
    assert(shown.get(key).world.getBuildings()[0].getBricks().length === 3, 'B4. from the downloaded content itself');
    const row = claimed.claimedBuildRows.value[0];
    assert(row && row.title === 'Bob\'s Tower' && row.author === 'bob' && row.distance === 50, 'B5. its row shows the build\'s own title/author and distance');
    assert(!row.acceptable && /isn't on this device/.test(row.acceptanceHint), 'B6. Accept Position waits for a verified Publication and says why');

    claimed.acceptClaimedBuild(row);
    assert(!calls.some((c) => c[0] === 'place'), 'B7. accepting an unverified claim places nothing');

    claimed.navigateToClaimedBuild(row);
    assert(calls[0][0] === 'focus' && calls[0][1].x === 40, 'B8. Navigate only moves the camera to the claimed position');

    publications.set('pub-bob', { id: 'pub-bob', contentReference: { hash } });
    clock += 5000;
    claimed.reconcileClaimedBuilds();
    assert(claimed.claimedBuildRows.value[0].acceptable, 'B9. once the Publication is verified with matching content, Accept Position is enabled');
    claimed.acceptClaimedBuild(claimed.claimedBuildRows.value[0]);
    const place = calls.find((c) => c[0] === 'place');
    assert(place && place[1] === 'pub-bob' && place[2].x === 40 && place[2].z === 30, 'B10. accepting places the Publication at the claimed position');
    assert(!shown.has(key) && claimed.claimedBuildRows.value.length === 0, 'B11. the ghost yields to the real Placement');
    assert(/Accepted/.test(messages[messages.length - 1]), 'B12. and says so');
    console.log('✓ B — an unplaced claim is drawn from its own content, and becomes a Placement only by an explicit, verified Accept');

    // Tampered content never becomes a ghost.
    claimed.noteSnapshotCandidateResult({ publicationId: 'pub-evil', contentHash: 'bad-hash', claimedPosition: { x: 10, y: 0, z: 10 } },
        { outcome: SnapshotWorldPlacementOutcome.UNPLACED, publicationId: 'pub-evil', contentHash: 'bad-hash' });
    await flush(); await flush();
    assert(!shown.has(claimedBuildKey('pub-evil', 'bad-hash')), 'B13. content that does not match its hash is never drawn');

    // Walking away hides a ghost; Hide dismisses it for the visit.
    const text2 = makeBuildText('Carol\'s Arch');
    const hash2 = computeContentHash(text2);
    contentByHash.set(hash2, text2);
    claimed.noteSnapshotCandidateResult({ publicationId: 'pub-carol', contentHash: hash2, claimedPosition: { x: 20, y: 0, z: 0 } },
        { outcome: SnapshotWorldPlacementOutcome.UNPLACED, publicationId: 'pub-carol', contentHash: hash2 });
    await flush(); await flush();
    const key2 = claimedBuildKey('pub-carol', hash2);
    assert(shown.has(key2), 'B14. setup: a second ghost is shown');
    viewer = { x: 90000, y: 0, z: 0 };
    claimed.reconcileClaimedBuilds({ force: true });
    assert(!shown.has(key2), 'B15. walking far away hides it');
    viewer = { x: 0, y: 0, z: 0 };
    claimed.reconcileClaimedBuilds({ force: true });
    assert(shown.has(key2), 'B16. coming back shows it again, without downloading anything');
    claimed.dismissClaimedBuild(claimed.claimedBuildRows.value[0]);
    assert(!shown.has(key2) && claimed.claimedBuildRows.value.length === 0, 'B17. Hide removes the ghost and its row');

    const text3 = makeBuildText('Dan\'s Hut');
    const hash3 = computeContentHash(text3);
    contentByHash.set(hash3, text3);
    claimed.noteSnapshotCandidateResult({ publicationId: 'pub-dan', contentHash: hash3, claimedPosition: { x: 5, y: 0, z: 5 } },
        { outcome: SnapshotWorldPlacementOutcome.UNPLACED, publicationId: 'pub-dan', contentHash: hash3 });
    await flush(); await flush();
    claimed.disposeClaimedBuilds();
    assert(shown.size === 0, 'B18. leaving World View removes every ghost');
    console.log('✓ B — tampered content is never drawn; ghosts follow the viewer, can be hidden, and are removed on leave');
}

// Section C — the renderer: translucent, never pickable, bounded.
{
    const added = [];
    const removed = [];
    const renderer = {
        add: (mesh) => added.push(mesh),
        remove: (mesh) => removed.push(mesh),
        terrainHeightAt: () => 2
    };
    const makeMesh = () => {
        const mesh = {
            position: { set(x, y, z) { Object.assign(this, { x, y, z }); } },
            rotation: { y: 0 },
            userData: {},
            material: { transparent: false, opacity: 1, depthWrite: true, disposed: false, dispose() { this.disposed = true; } }
        };
        return mesh;
    };
    const buildingRenderer = {
        renderBrick: (brick) => {
            if (brick.definitionId === 'unknown') throw new Error('Unknown brick definition');
            return { brickId: brick.id, mesh: makeMesh() };
        }
    };
    const brick = (id, x, definitionId = 'core:cube') => ({ id, definitionId, position: { x, y: 0.5, z: 0 }, rotation: 90 });
    const world = { getBuildings: () => [{ getBricks: () => [brick('a', 0), brick('b', 1, 'unknown'), brick('c', 2), brick('d', 3)] }] };
    const ghosts = new ClaimedBuildGhostRenderer(renderer, null, { buildingRenderer, maxBricks: 2 });

    const drawn = ghosts.show('k', world, { x: 100, y: 0, z: 50 });
    assert(drawn === 2 && added.length === 2, 'C1. at most maxBricks bricks are drawn, skipping unknown definitions');
    assert(added[0].position.x === 100 && added[0].position.y === 2.5 && added[0].position.z === 50, 'C2. offset to the claimed position on the terrain');
    assert(added.every((mesh) => mesh.material.transparent && mesh.material.opacity < 1 && !mesh.material.depthWrite && mesh.userData.claimedBuildGhost),
        'C3. every ghost brick is translucent and marked as a ghost');
    ghosts.show('k', world, { x: 0, y: 0, z: 0 });
    assert(removed.length === 2 && ghosts.keys().length === 1, 'C4. showing the same key again replaces the old ghost');
    ghosts.hideAll();
    assert(removed.length === 4 && removed.every((mesh) => mesh.material.disposed) && ghosts.keys().length === 0, 'C5. hiding removes and disposes every mesh');
    console.log('✓ C — ghosts are translucent, bounded, replace cleanly and never leak meshes');
}
