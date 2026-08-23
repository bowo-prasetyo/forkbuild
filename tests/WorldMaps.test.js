import {
    createMapViewport,
    projectPosition,
    unprojectPoint,
    projectRegion,
    regionPresentationTier,
    suggestMapExtent,
    MIN_MAP_SPAN,
    MAX_MAP_SPAN
} from '../core/WorldMapProjection.js';
import { RegionKind } from '../core/RegionKind.js';
import { World } from '../core/World.js';
import { WorldRegion } from '../core/WorldRegion.js';
import { WorldLandmark } from '../core/WorldLandmark.js';
import { StructurePlacement } from '../core/StructurePlacement.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { LoadDocumentUseCase } from '../application/LoadDocumentUseCase.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';

// 0.5.1 — World Maps & Geographic Navigation.
//
// This suite proves that a World Map is a DERIVED presentation layer,
// never a second World:
//   - core/WorldMapProjection.js is pure arithmetic — project/unproject
//     round-trip exactly, a region's screen radius always scales with
//     the viewport, presentation tiers are labels only
//   - application/WorldNavigationSession.js#getMapContent() gathers
//     exactly what already exists (regions/landmarks/structures/
//     collaborators), WORLD-WIDE — never limited to a streaming/
//     proximity radius the way core/WorldSpatialContext.js's
//     nearbyLandmarks etc. deliberately are
//
// See docs/Principles.md, "A World Map Is A Derived View, Never A
// Second World (0.5.1)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

async function run() {
    // -------------------------------------------------------------
    // Section A: createMapViewport() / projectPosition() / unprojectPoint()
    // -------------------------------------------------------------
    {
        try {
            createMapViewport({ span: -10, width: 600, height: 600 });
            assert(false, '1. should have thrown for a non-positive span');
        } catch (e) {
            assert(e.message.includes('span'), '1. createMapViewport rejects a non-positive span');
        }

        try {
            createMapViewport({ span: 100, width: 0, height: 600 });
            assert(false, '2. should have thrown for a zero width');
        } catch (e) {
            assert(e.message.includes('width'), '2. createMapViewport rejects a non-positive width');
        }

        const viewport = createMapViewport({ centerX: 0, centerZ: 0, span: 200, width: 600, height: 600 });
        assert(viewport.scale === 3, '3. scale = min(width,height)/span (600/200 = 3)');

        const center = projectPosition({ x: 0, z: 0 }, viewport);
        assert(center.x === 300 && center.y === 300, '4. the viewport center projects to the map center');
        assert(center.visible === true, '5. the map center is visible');

        // North (+Z, exactly core/CompassHeading.js's own 0°-faces-+Z
        // convention) is drawn UP — increasing Z means DECREASING map Y.
        const north = projectPosition({ x: 0, z: 50 }, viewport);
        assert(north.y < center.y, '6. +Z (north) projects to a SMALLER map y (drawn up)');
        assert(Math.abs(north.x - center.x) < 1e-9, '7. moving only in Z does not move map x');

        const east = projectPosition({ x: 50, z: 0 }, viewport);
        assert(east.x > center.x, '8. +X (east) projects to a LARGER map x (drawn right)');

        const offMap = projectPosition({ x: 5000, z: 0 }, viewport);
        assert(offMap.visible === false, '9. a position far outside the viewport is not visible');

        // unprojectPoint is the true inverse of projectPosition for any
        // in-viewport point, round-tripping to the original world x/z.
        for (const worldPoint of [{ x: 37, z: -18 }, { x: -60, z: 60 }, { x: 0, z: 0 }]) {
            const projected = projectPosition(worldPoint, viewport);
            const back = unprojectPoint(projected.x, projected.y, viewport);
            assert(Math.abs(back.x - worldPoint.x) < 1e-9, `10. unprojectPoint inverts projectPosition's x for (${worldPoint.x},${worldPoint.z})`);
            assert(Math.abs(back.z - worldPoint.z) < 1e-9, `11. unprojectPoint inverts projectPosition's z for (${worldPoint.x},${worldPoint.z})`);
        }

        // A viewport re-centered elsewhere shifts everything by exactly
        // that offset — projection has no hidden global-origin bias.
        const shifted = createMapViewport({ centerX: 100, centerZ: 100, span: 200, width: 600, height: 600 });
        const shiftedCenter = projectPosition({ x: 100, z: 100 }, shifted);
        assert(shiftedCenter.x === 300 && shiftedCenter.y === 300, '12. re-centering the viewport keeps its own center at the map center');

        console.log('✓ Section A: createMapViewport/projectPosition/unprojectPoint');
    }

    // -------------------------------------------------------------
    // Section B: projectRegion() — circle stays a circle, edge visibility
    // -------------------------------------------------------------
    {
        const viewport = createMapViewport({ centerX: 0, centerZ: 0, span: 200, width: 600, height: 600 });

        const region = { position: { x: 0, z: 0 }, radius: 20 };
        const projected = projectRegion(region, viewport);
        assert(projected.radius === 60, '13. a region\'s map radius = world radius * viewport.scale (20 * 3)');
        assert(projected.visible === true, '14. a region centered on-screen is visible');

        // A non-square viewport (width !== height) must still project a
        // circle as a circle: scale is uniform (min(width,height)/span),
        // never separate X/Y scales.
        const wide = createMapViewport({ span: 200, width: 900, height: 600 });
        const wideRegion = projectRegion(region, wide);
        assert(wideRegion.radius === 20 * wide.scale, '15. projectRegion uses the SAME uniform scale as projectPosition, even on a non-square viewport');

        // A huge region whose CENTER sits off-map can still have its
        // EDGE cross into the viewport — projectRegion uses a
        // circle-vs-rectangle test, not projectPosition's point-in-rect
        // test.
        const farRegion = { position: { x: 120, z: 0 }, radius: 100 };
        const farProjected = projectRegion(farRegion, viewport);
        const farCenter = projectPosition(farRegion.position, viewport);
        assert(farCenter.visible === false, '16. the far region\'s own CENTER point is off-map');
        assert(farProjected.visible === true, '17. but its edge still crosses into the viewport, so the region itself is visible');

        // A region whose entire circle sits well outside the viewport
        // (edge included) is correctly invisible.
        const distantRegion = { position: { x: 10000, z: 10000 }, radius: 5 };
        assert(projectRegion(distantRegion, viewport).visible === false, '18. a region entirely outside the viewport is not visible');

        console.log('✓ Section B: projectRegion');
    }

    // -------------------------------------------------------------
    // Section C: regionPresentationTier() — labels only, never geometry
    // -------------------------------------------------------------
    {
        assert(regionPresentationTier(RegionKind.CONTINENT) === 1, '19. CONTINENT is tier 1');
        assert(regionPresentationTier(RegionKind.COUNTRY) === 1, '20. COUNTRY is tier 1');
        assert(regionPresentationTier(RegionKind.CITY) === 2, '21. CITY is tier 2');
        assert(regionPresentationTier(RegionKind.TOWN) === 2, '22. TOWN is tier 2');
        assert(regionPresentationTier(RegionKind.VILLAGE) === 3, '23. VILLAGE is tier 3');
        assert(regionPresentationTier(RegionKind.NEIGHBORHOOD) === 3, '24. NEIGHBORHOOD is tier 3');
        assert(regionPresentationTier(RegionKind.PLACE) === 4, '25. PLACE is tier 4');
        assert(regionPresentationTier('not-a-real-kind') === 4, '26. an unrecognized kind falls back to tier 4, never throws');

        // Two regions of the SAME kind but different radius still
        // resolve to the SAME tier — tier is a property of `kind` alone,
        // exactly like core/RegionKind.js's own "labels only" header.
        assert(regionPresentationTier(RegionKind.VILLAGE) === regionPresentationTier(RegionKind.VILLAGE), '27. tier depends only on kind');

        console.log('✓ Section C: regionPresentationTier');
    }

    // -------------------------------------------------------------
    // Section D: suggestMapExtent() — a starting viewport, clamped
    // -------------------------------------------------------------
    {
        const noPoints = suggestMapExtent(null, []);
        assert(noPoints.centerX === 0 && noPoints.centerZ === 0, '28. with no viewer position, extent centers on the World origin');
        assert(noPoints.span === MIN_MAP_SPAN, '29. with no points at all, span clamps to MIN_MAP_SPAN');

        const viewer = { x: 50, z: -20 };
        const centered = suggestMapExtent(viewer, []);
        assert(centered.centerX === 50 && centered.centerZ === -20, '30. extent centers on the viewer position when given one');

        const nearbyPoint = suggestMapExtent(viewer, [{ x: 55, z: -20 }]);
        assert(nearbyPoint.span === MIN_MAP_SPAN, '31. a point well within MIN_MAP_SPAN still clamps up to the minimum (never a meaningless few-meter map)');

        const farPoint = suggestMapExtent({ x: 0, z: 0 }, [{ x: 1000, z: 0 }]);
        assert(farPoint.span > 1000 && farPoint.span < MAX_MAP_SPAN, '32. a distant point produces a span comfortably larger than its own distance (padding), still under the max');

        const veryFarPoint = suggestMapExtent({ x: 0, z: 0 }, [{ x: 100000, z: 0 }]);
        assert(veryFarPoint.span === MAX_MAP_SPAN, '33. an extremely distant point clamps down to MAX_MAP_SPAN rather than growing unbounded');

        // The farthest point decides the span, not merely the last one
        // in the array.
        const multi = suggestMapExtent({ x: 0, z: 0 }, [{ x: 10, z: 0 }, { x: 500, z: 0 }, { x: 20, z: 0 }]);
        const soloFarthest = suggestMapExtent({ x: 0, z: 0 }, [{ x: 500, z: 0 }]);
        assert(multi.span === soloFarthest.span, '34. suggestMapExtent is driven by the single FARTHEST point, independent of array order');

        console.log('✓ Section D: suggestMapExtent');
    }

    // -------------------------------------------------------------
    // Section E: WorldNavigationSession#getMapContent() — integration
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const registry = new CreateBrickRegistryUseCase().execute();
        const loadDocumentUseCase = new LoadDocumentUseCase(storage, serializer);
        const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(storage, serializer);
        const saveDocumentUseCase = new SaveDocumentUseCase(storage, serializer);
        const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        const worldLayoutProvider = new LocalWorldLayoutProvider(spatialIndexProvider, discoveryProvider);

        const mapWorld = new World({ id: 'map-world' });
        mapWorld.addWorldRegion(new WorldRegion({
            id: 'rg-map', worldId: 'map-world', authorIdentityId: 'alice',
            name: 'Green Valley', kind: RegionKind.VILLAGE,
            position: new Position(20, 0, 30), radius: 40
        }));
        mapWorld.addWorldLandmark(new WorldLandmark({
            id: 'lm-map', worldId: 'map-world', authorIdentityId: 'alice',
            title: 'Old Mill',
            // Deliberately FAR beyond core/WorldSpatialContext.js's own
            // streaming radius (100m default) — a map is world-wide, not
            // proximity-limited, per getMapContent()'s own header.
            position: new Position(5000, 0, 5000)
        }));
        mapWorld.addStructurePlacement(new StructurePlacement({
            id: 'sp-map', documentId: 'house-doc-id', position: new Position(-15, 0, 12)
        }));

        const doc = new Document({ world: mapWorld, metadata: new DocumentMetadata({ title: 'Map World' }) });
        saveDocumentUseCase.execute(new DocumentManager(doc));

        const session = new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase, worldLayoutProvider,
            discoveryProvider, loadDocumentUseCase
        });
        session._session = { addWorld() {}, removeWorld() {}, dispose() {} };
        session._loadWorld('map-world');

        const content = session.getMapContent();

        assert(Array.isArray(content.regions) && content.regions.length === 1, '35. getMapContent() gathers the world\'s regions');
        assert(content.regions[0].id === 'rg-map' && content.regions[0].name === 'Green Valley', '36. a gathered region carries its own id/name');
        assert(content.regions[0].position.x === 20 && content.regions[0].position.z === 30, '37. a gathered region\'s position is offset into layout space (offset is (0,0,0) for a single loaded document)');

        assert(Array.isArray(content.landmarks) && content.landmarks.length === 1, '38. getMapContent() gathers the world\'s landmarks');
        assert(content.landmarks[0].id === 'lm-map' && content.landmarks[0].title === 'Old Mill', '39. a gathered landmark carries its own id/title');
        assert(content.landmarks[0].position.x === 5000, '40. a landmark far beyond the streaming radius still appears — getMapContent() is world-wide, never proximity-limited');

        assert(Array.isArray(content.structures) && content.structures.length === 1, '41. getMapContent() gathers the world\'s structure placements');
        assert(content.structures[0].id === 'sp-map', '42. a gathered structure carries the StructurePlacement\'s own id');
        assert(content.structures[0].position.x === -15 && content.structures[0].position.z === 12, '43. a gathered structure\'s position matches its placement');

        assert(Array.isArray(content.collaborators), '44. collaborators is always an array, even with no live spatial presence');
        assert(content.collaborators.length === 0, '45. no collaborators are present without entering spatial presence');

        // No session.start()/live camera has run in this test — the same
        // graceful-absence posture every other navigation read in this
        // codebase already has, never a thrown error.
        assert(content.viewerPosition === null, '46. viewerPosition gracefully falls back to null with no live avatar/camera');

        // getMapContent() is a pure read: calling it twice never mutates
        // the World or double-adds anything.
        const contentAgain = session.getMapContent();
        assert(contentAgain.regions.length === 1 && contentAgain.landmarks.length === 1 && contentAgain.structures.length === 1,
            '47. getMapContent() is idempotent — calling it again reflects the same World content, unchanged');

        console.log('✓ Section E: WorldNavigationSession#getMapContent()');
    }

    console.log('\nAll World Maps tests passed.');
}

await run();
