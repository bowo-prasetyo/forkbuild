import * as THREE from 'three';
import { PickingService } from '../renderer/PickingService.js';
import { PlacementMeshRegistry } from '../renderer/PlacementMeshRegistry.js';
import { assert } from './support/Assert.js';

// 0.9.611 — Add Structure Relative Face Snapping: the renderer half.
// tests/StructureRelativeFaceSnapping.test.js covers everything that
// never touches Three.js (PlacementPositionService#calculateStructureStack()
// and StructurePlacementTool's pickedPlacement-first wiring, both driven
// entirely by plain pointerEvent objects); this file covers the ONE
// renderer/ change directly, with REAL Three.js raycasting — PickingService
// #pickPlacement() now also extracts a face normal from the hit, mirroring
// pickRich()'s own six-line extraction. Uses the same "real Three.js
// camera, real raycasting" technique tests/StructureInstanceRendering.
// test.js's own Section C already established for this exact method's
// placementId half — this file only adds normal coverage, it does not
// re-prove placementId resolution.
//
// SECTIONS:
//   A. pickPlacement() extracts a face normal, deterministically, on
//      repeated identical calls; placementId/point/distance unchanged;
//      pick() (the brick path) still unaffected.
//   B. A different hit face reports a different normal, and — of two
//      placements along the same ray — only the nearer is ever reported,
//      the same "one ray, one nearest hit" determinism pickRich() and
//      pickPlacement()'s placementId resolution already rely on.

// Looking straight down -Z at the origin — screen center maps to NDC
// (0,0), the same setup tests/WorldEntityInteraction.test.js and
// tests/StructureInstanceRendering.test.js already use.
function makeTopDownCamera() {
    const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    return camera;
}

const fakeDomElement = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
const SCREEN_CENTER_X = 400, SCREEN_CENTER_Y = 300; // NDC (0,0)

async function run() {
    // -------------------------------------------------------------
    // Section A — pickPlacement() extracts a face normal (0.9.611)
    // -------------------------------------------------------------
    {
        const camera = makeTopDownCamera();
        const placementMeshRegistry = new PlacementMeshRegistry();
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
        mesh.position.set(0, 0, 0);
        mesh.updateMatrixWorld();
        placementMeshRegistry.set('placement-1', [mesh]);

        const pickingService = new PickingService(camera, fakeDomElement, { getAllMeshes: () => [] }, placementMeshRegistry);

        const hit = pickingService.pickPlacement(SCREEN_CENTER_X, SCREEN_CENTER_Y);
        assert(hit && hit.placementId === 'placement-1', '1. pickPlacement() still resolves the placementId exactly as before 0.9.611');
        assert(hit.normal && hit.normal.x === 0 && hit.normal.y === 0 && hit.normal.z === 1,
            '2. ...and now ALSO extracts a face normal — the top-down camera (looking down -Z) hits the box\'s +Z face, normal (0,0,1), mirroring pickRich()\'s own extraction six lines away');
        assert(Number.isFinite(hit.distance) && hit.distance > 0, '3. distance field unchanged');
        assert(hit.point && Number.isFinite(hit.point.x), '4. point field unchanged');

        // Determinism: the same screen position, asked twice, returns the
        // same normal both times — no hidden raycaster state carried
        // between calls (StructurePlacementTool's own repeated-hover case,
        // proven at the tool level in StructureRelativeFaceSnapping.
        // test.js's own Section H; this proves the picking layer itself
        // is equally stateless).
        const repeat = pickingService.pickPlacement(SCREEN_CENTER_X, SCREEN_CENTER_Y);
        assert(repeat.normal.x === 0 && repeat.normal.y === 0 && repeat.normal.z === 1,
            '5. calling pickPlacement() again at the identical screen position returns an identical normal');

        // pick()/pickRich() (the ordinary brick path) are completely
        // unaffected by a placementMeshRegistry being present.
        assert(pickingService.pick(SCREEN_CENTER_X, SCREEN_CENTER_Y) === null,
            '6. pick() still finds nothing for a mesh registered only with the PLACEMENT registry, never the brick one');
    }

    // -------------------------------------------------------------
    // Section B — a different hit face reports a different normal; of
    // two placements along one ray, only the nearer is ever reported
    // -------------------------------------------------------------
    {
        // Camera looking along -X (from +X toward the origin) — hits a
        // box's +X face this time, proving the extraction generalizes
        // beyond the one axis Section A exercised.
        const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
        camera.position.set(10, 0, 0);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();

        const placementMeshRegistry = new PlacementMeshRegistry();
        const near = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
        near.position.set(0, 0, 0);
        near.updateMatrixWorld();
        const far = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
        far.position.set(-5, 0, 0);
        far.updateMatrixWorld();
        placementMeshRegistry.set('placement-near', [near]);
        placementMeshRegistry.set('placement-far', [far]);

        const pickingService = new PickingService(camera, fakeDomElement, { getAllMeshes: () => [] }, placementMeshRegistry);
        const hit = pickingService.pickPlacement(SCREEN_CENTER_X, SCREEN_CENTER_Y);
        assert(hit.placementId === 'placement-near',
            '7. of two placements along the same ray, only the NEARER one is ever reported — multi-neighbor determinism is inherited from THREE.Raycaster returning hits nearest-first, never a candidate-list policy this codebase wrote (matching tests/StructureRelativeSnappingBoundaryAudit.test.js\'s own Section F finding)');
        assert(hit.normal.x === 1 && hit.normal.y === 0 && hit.normal.z === 0,
            '8. the +X face was hit, normal (1,0,0) — matching PlacementPositionService#calculateStructureStack()\'s own sign convention: the normal points AWAY from the anchor, toward where the new structure should sit');
    }

    console.log('✓ Section A: PickingService#pickPlacement() extracts a face normal, mirroring pickRich()');
    console.log('✓ Section B: a different hit face reports a different normal; multi-neighbor determinism inherited from THREE.Raycaster');

    console.log('\n✅ All StructureRelativeFaceSnappingRendering tests passed.');
}

run().catch((error) => {
    console.error('StructureRelativeFaceSnappingRendering.test.js FAILED:', error);
    process.exitCode = 1;
});
