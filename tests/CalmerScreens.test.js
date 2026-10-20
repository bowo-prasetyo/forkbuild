import * as THREE from 'three';
import { buildCreditName } from '../core/catalog/BuildCredit.js';
import { seesNeighbour } from '../core/world/NeighbourSight.js';
import { FunnelEvent, VISITOR_COUNT_SITE_ORIGIN, funnelEventHitUrl } from '../core/app/VisitorCount.js';
import { LAUNCH_TARGETS, TARGET_STATUS, evaluateTarget } from '../core/app/LaunchTargets.js';
import { CUT_ABOVE_FEET, seeInsideCutaway } from '../core/building/IndoorView.js';
import { SpatialBounds } from '../core/world/SpatialBounds.js';
import { VillageLibrary } from '../core/library/VillageLibrary.js';
import { CutawayClipping } from '../renderer/CutawayClipping.js';
import { PickingService } from '../renderer/PickingService.js';
import { FunnelEventCounter } from '../application/settings/FunnelEventCounter.js';
import { VisitorCountSettingsStore } from '../application/settings/VisitorCountSettingsStore.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { selectionEditingMethods } from '../application/editorSession/selectionEditingMethods.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// The second audit of 2026-10-12 (docs/reviews/CreativeDirection-2026-10-12b.md),
// what was left of findings 1, 2, 5 and 6: one name for whose a build is, a
// count of World View visits that see someone else's build, and See inside in
// the Editor. The screens themselves (the controls over World View, one bar
// after Publish, the File menu, a phone's plaza chip) are checked in the
// bundled-site test with a real browser.

const registry = new CreateBrickRegistryUseCase().execute();
const house = VillageLibrary.structures.find((structure) => structure.id === 'village:house');

// One name for whose a build is.
{
    assert(buildCreditName({ publicationAuthor: 'Ana', placementOwner: 'Ana', documentAuthor: null }) === 'Ana', 'the signed author');
    assert(buildCreditName({ publicationAuthor: null, placementOwner: 'Ana', documentAuthor: 'anonymous' }) === 'Ana', 'whoever placed it, not "anonymous"');
    assert(buildCreditName({ documentAuthor: 'Bo ' }) === 'Bo', 'the name in the build itself');
    assert(buildCreditName({ publicationAuthor: '  ', documentAuthor: 'anonymous' }) === null, 'none known: the caller says anonymous');
    assert(buildCreditName() === null, 'nothing given');
    console.log('✓ a build is credited by one name: its signed author, else whoever placed it, else the name in it');
}

// Seeing someone else's build.
{
    const own = new Set(['mine-published']);
    const editable = (id) => id === 'my-draft';
    assert(!seesNeighbour([], { ownDocumentIds: own, isEditable: editable }), 'nothing loaded, no neighbour');
    assert(!seesNeighbour(['mine-published', 'my-draft'], { ownDocumentIds: own, isEditable: editable }), 'a visitor\'s own builds aren\'t neighbours');
    assert(seesNeighbour(['mine-published', 'theirs'], { ownDocumentIds: own, isEditable: editable }), 'someone else\'s is');
    assert(!seesNeighbour(['broken'], { isEditable: () => { throw new Error('gone'); } }), 'one that can\'t be read isn\'t counted');
    console.log('✓ a neighbour is a build standing in view that is neither published by this device nor open for it to edit');
}

// Counted under the visitor count's rules, and read as a launch target.
{
    const store = new VisitorCountSettingsStore({ storageProvider: new InMemoryStorageProvider() });
    store.setEnabled(true);
    const hits = [];
    const counter = new FunnelEventCounter({
        settingsStore: store, origin: VISITOR_COUNT_SITE_ORIGIN, random: () => 0.5, sendHit: (url) => hits.push(url),
        listOwnPublications: () => [{ documentId: 'mine' }, null, { documentId: '' }]
    });
    assert(counter.visitedWorld() && counter.sawNeighbour(), 'both are counted');
    assert(hits[0] === funnelEventHitUrl(FunnelEvent.WORLD_VISIT, '5') && hits[1] === funnelEventHitUrl(FunnelEvent.WORLD_NEIGHBOUR, '5'), `as /e/world-visit and /e/world-neighbour (${hits})`);
    const ids = counter.ownDocumentIds();
    assert(ids.size === 1 && ids.has('mine'), 'a visitor\'s own builds are the ones this device published');
    store.setEnabled(false);
    assert(!counter.visitedWorld() && hits.length === 2, 'turned off, nothing is sent');

    const target = LAUNCH_TARGETS.find((candidate) => candidate.id === 'neighbours');
    assert(target && target.pillar === 'world', 'Yours, in a world has a target for it');
    const met = evaluateTarget(target, { '/e/world-visit': 100, '/e/world-neighbour': 60 });
    const missed = evaluateTarget(target, { '/e/world-visit': 100, '/e/world-neighbour': 20 });
    const few = evaluateTarget(target, { '/e/world-visit': 10, '/e/world-neighbour': 10 });
    assert(met.status === TARGET_STATUS.MET && missed.status === TARGET_STATUS.MISSED && few.status === TARGET_STATUS.TOO_FEW, 'met at half the visits, missed below, too few under fifty');
    console.log('✓ World View visits and visits that see a neighbour are counted, and read as "half of visits see a neighbour"');
}

// See inside: the House cut away above its ground floor, the room left.
{
    const bounds = SpatialBounds.fromBricks(house.bricks, registry);
    const cut = seeInsideCutaway(bounds);
    assert(Math.abs(cut.y - (bounds.min.y + 0.25 + CUT_ABOVE_FEET)) < 1e-9, `cut where a person on the floor would be cut indoors (${cut.y.toFixed(2)})`);
    assert(cut.minX < bounds.min.x && cut.maxX > bounds.max.x && cut.minZ < bounds.min.z && cut.maxZ > bounds.max.z, 'over the whole build');
    assert(seeInsideCutaway(null) === null && seeInsideCutaway({ min: { x: NaN }, max: {} }) === null, 'nothing to cut without bounds');
    const roof = house.bricks.find((brick) => brick.definitionId === 'core:roof_hip_6x6');
    const table = house.bricks.find((brick) => brick.definitionId === 'core:table');
    const clipping = new CutawayClipping();
    clipping.set(cut);
    assert(clipping.clips(new THREE.Vector3(roof.position.x, roof.position.y, roof.position.z)), 'the roof is cut away');
    assert(!clipping.clips(new THREE.Vector3(table.position.x, table.position.y, table.position.z)), 'the table is not');

    // The session part: on, fitted to the build; off, nothing cut; on before
    // anything is drawn, no harm.
    const cutaways = [];
    const editor = Object.assign(Object.create(selectionEditingMethods), {
        _registry: registry,
        _documentManager: { document: { world: { getBuildings: () => [{ getBricks: () => house.bricks }] } } },
        _session: { setCutaway: (value) => cutaways.push(value), floorHeight: () => 2.5, setCameraState: (state) => cutaways.push(state) }
    });
    Object.defineProperties(editor, Object.getOwnPropertyDescriptors(selectionEditingMethods));
    assert(editor.setSeeInside(true) === true && editor.seeInside && cutaways.at(-1).y === cut.y, 'See inside cuts the open build');
    assert(editor.setSeeInside(false) === false && cutaways.at(-1) === null, 'and showing it whole cuts nothing');
    const camera = editor.frameDocument() && cutaways.at(-1);
    const center = bounds.center;
    assert(Math.abs(camera.target.y - (center.y + 2.5)) < 1e-9, `the camera frames the build on the Editor's floor (target ${camera.target.y.toFixed(2)})`);
    console.log('✓ See inside cuts the House away above its ground floor, roof gone and table kept, and the camera frames the build where it is drawn');
}

// A click goes past what is cut away.
{
    const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    cam.position.set(0, 20, 0.001);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    const roofMesh = new THREE.Mesh(new THREE.BoxGeometry(6, 0.5, 6));
    roofMesh.position.set(0, 4.5, 0);
    const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(6, 0.25, 6));
    floorMesh.position.set(0, 0.125, 0);
    roofMesh.updateMatrixWorld();
    floorMesh.updateMatrixWorld();
    const instances = {
        pickableObjects: () => [roofMesh, floorMesh],
        brickIdForIntersection: (hit) => (hit.object === roofMesh ? 'roof' : 'floor'),
        getDocumentId: () => 'doc',
        getBuildingId: () => 'building'
    };
    const dom = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) };
    const clipping = new CutawayClipping();
    const picking = new PickingService(cam, dom, instances, null, { cutawayClipping: clipping });
    assert(picking.pick(50, 50).brickId === 'roof', 'whole, a click hits the roof');
    clipping.set({ minX: -4, maxX: 4, minZ: -4, maxZ: 4, y: 2.35 });
    assert(picking.pick(50, 50).brickId === 'floor', 'cut away, it goes past the roof to the floor');
    console.log('✓ with the build cut away, a click goes past the hidden roof to the room');
}
