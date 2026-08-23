import {
    WorldFocusContext, WorldFocusKind, WorldFocusAction,
    isValidWorldFocusKind, deriveWorldFocusContext
} from '../core/WorldFocusContext.js';
import { WorldRegion } from '../core/WorldRegion.js';
import { RegionKind } from '../core/RegionKind.js';
import { WorldLandmark } from '../core/WorldLandmark.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { License, LicenseId } from '../core/License.js';
import { StructurePlacement } from '../core/StructurePlacement.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { geographicPlaceLocationId } from '../core/GeographicPlaceNavigation.js';

// 0.5.8 — World View Contextual Focus & Information Hierarchy.
//
// World View grew a real information architecture across 0.3.6-0.5.7 —
// regions, landmarks, structures, collaborators, geographic place
// candidates — without ever answering ONE question the same way
// regardless of which surface a viewer selected something from: "what
// am I looking at, right now?" This suite proves the derived layer that
// answers it, entirely without becoming new World content or a new
// navigation mechanism:
//
// Section A: core/WorldFocusContext.js — pure derivation for all five
//            kinds, determinism, no mutation, arrival-phrase wording,
//            graceful nulls.
// Section B: application/WorldNavigationSession.js wiring —
//            getFocusContextForLocation()/getFocusContextForCollaborator(),
//            reusing the exact same collections every other read-only
//            method already gathers.
// Section C: CAPSTONE — cross-surface consistency: the same landmark
//            reached through a plain locationId and a geographic place
//            reached through Explore's own nearby-row id both produce
//            the same context a Locations-panel "Info" click would;
//            Focus never moves the camera or the map; nothing is ever
//            mutated.

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

function region({ id, worldId, authorIdentityId = 'alice', name = 'Unnamed Region', description = '', kind = RegionKind.VILLAGE, x, z, radius }) {
    return new WorldRegion({ id, worldId, authorIdentityId, name, description, kind, position: new Position(x, 0, z), radius });
}

function landmark({ id, worldId, authorIdentityId = 'alice', title, description = '', x, z }) {
    return new WorldLandmark({ id, worldId, authorIdentityId, title, description, position: new Position(x, 0, z) });
}

// A replica with a real worldLayoutProvider — getDocumentPosition()
// (used by every _collect*() helper getFocusContext() reads from)
// throws on an undefined provider, the exact same seam
// tests/GeographicPlaceNavigation.test.js#makeReplica() already
// documents. With no publications on record, every document resolves
// to the same deterministic (0,0,0) layout offset.
function makeReplica(documents = []) {
    const discoveryProvider = new LocalDiscoveryProvider(new InMemoryStorageProvider());
    const worldLayoutProvider = new LocalWorldLayoutProvider(null, discoveryProvider);
    const session = new WorldNavigationSession({ registry: null, worldLayoutProvider, discoveryProvider });
    for (const document of documents) {
        session._loadedDocuments.set(document.world.id, document);
    }
    return session;
}

function setAvatarPosition(session, x, z) {
    session._avatarPresenceSession = { current: { position: { x, y: 0, z } } };
}

// The exact grouped-by-identity, `devices: [...]` shape
// WorldSpatialPresenceUseCase#getSpatialRoster() really returns — see
// application/WorldNavigationSession.js#_getPresentCollaborators()'s own
// consumption of it.
function stubCollaboratorRoster(session, worldId, rows) {
    session._presentSpatialWorldDocumentIds = new Set([worldId]);
    session.getWorldSpatialPresenceRoster = (documentId) => (
        documentId === worldId
            ? rows.map((row) => ({ identityId: row.identityId, devices: [{ deviceId: row.deviceId, position: row.position, activity: row.activity || null, selection: null }] }))
            : []
    );
}

function makeDocument(worldId, author = 'alice') {
    const world = new World({ id: worldId });
    const building = new Building({ creator: author });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return {
        world,
        metadata: new DocumentMetadata({ title: 'Untitled', author, license: new License({ id: LicenseId.CC0_1_0 }) })
    };
}

async function run() {
    // -------------------------------------------------------------
    // Section A: core/WorldFocusContext.js — pure derivation
    // -------------------------------------------------------------
    {
        assert(isValidWorldFocusKind(WorldFocusKind.REGION), '1. REGION is a valid kind');
        assert(isValidWorldFocusKind(WorldFocusKind.GEOGRAPHIC_PLACE), '2. GEOGRAPHIC_PLACE is a valid kind');
        assert(isValidWorldFocusKind('nonsense') === false, '3. an unknown kind string is invalid');
        assert(Object.values(WorldFocusAction).length === 3, '4. exactly three actions exist: go, map, names');

        const viewer = { x: 0, y: 0, z: 0 };
        const regions = [
            { id: 'r-outer', name: 'Green Valley', kind: RegionKind.COUNTRY, description: '', radius: 500, position: { x: 0, y: 0, z: 0 } },
            { id: 'r-inner', name: 'Willow Village', kind: RegionKind.VILLAGE, description: 'A quiet village', radius: 30, position: { x: 10, y: 0, z: 10 } }
        ];

        // REGION — focusing a region excludes ITSELF from its own
        // regionPath, but still reports any LARGER region containing it.
        const regionEntity = { id: 'r-inner', name: 'Willow Village', kind: RegionKind.VILLAGE, description: 'A quiet village', radius: 30, position: { x: 10, y: 0, z: 10 } };
        const regionContext = deriveWorldFocusContext({ kind: WorldFocusKind.REGION, entity: regionEntity, viewerPosition: viewer, regions });
        assert(regionContext instanceof WorldFocusContext, '5. deriveWorldFocusContext() returns a WorldFocusContext instance');
        assert(regionContext.kind === WorldFocusKind.REGION && regionContext.title === 'Willow Village', '6. region title/kind derive correctly');
        assert(regionContext.subtitle === 'Region · Village', '7. region subtitle includes the capitalized RegionKind');
        assert(regionContext.description === 'A quiet village', '8. region description is the WorldRegion\'s own description');
        assert(regionContext.regionPath.length === 1 && regionContext.regionPath[0].id === 'r-outer',
            '9. a region\'s own regionPath contains the LARGER region it sits inside, never itself');
        assert(regionContext.placeName === 'Green Valley', '10. placeName reuses describePlace() over regionPath');
        assert(regionContext.hasAction(WorldFocusAction.GO) && regionContext.hasAction(WorldFocusAction.MAP) && regionContext.hasAction(WorldFocusAction.NAMES),
            '11. a region offers Go, Map, and Names');
        assert(regionContext.source.kind === WorldFocusKind.REGION && regionContext.source.id === 'r-inner', '12. source carries kind+id for the host to act on');
        const expectedDistance = Math.round(Math.sqrt(10 * 10 + 10 * 10) * 10) / 10;
        assert(regionContext.distance === expectedDistance, '13. distance is the real XZ distance from the viewer, rounded to one decimal');
        assert(regionContext.direction === 'NE', '14. direction is computed from the SAME directionLabelBetween() every other kind uses');

        // LANDMARK — never offers Map/Names; carries its own description.
        const landmarkEntity = { id: 'lm-1', title: 'Village Well', description: 'Central water source', position: { x: 12, y: 0, z: 12 } };
        const landmarkContext = deriveWorldFocusContext({ kind: WorldFocusKind.LANDMARK, entity: landmarkEntity, viewerPosition: viewer, regions });
        assert(landmarkContext.subtitle === 'Landmark' && landmarkContext.description === 'Central water source', '15. landmark subtitle/description');
        assert(JSON.stringify(landmarkContext.availableActions) === JSON.stringify([WorldFocusAction.GO]), '16. a landmark offers ONLY Go');
        assert(landmarkContext.regionPath.length === 2 && landmarkContext.regionPath[0].id === 'r-inner',
            '17. a landmark\'s regionPath includes every containing region, innermost first, WITHOUT the self-exclusion regions apply to themselves');
        assert(landmarkContext.arrivalPhrase === 'You are in Willow Village · Green Valley', '18. "in" wording when real regions contain the target, innermost first');

        // STRUCTURE — no description field at all (structures carry none
        // in this codebase), Go only. Placed well outside both regions
        // above so its own regionPath comes back genuinely empty.
        const structureEntity = { id: 'st-1', title: 'Old Bridge', position: { x: 2000, y: 0, z: 2000 } };
        const structureContext = deriveWorldFocusContext({ kind: WorldFocusKind.STRUCTURE, entity: structureEntity, viewerPosition: viewer, regions });
        assert(structureContext.subtitle === 'Structure' && structureContext.description === '', '19. structure subtitle/empty description');
        assert(JSON.stringify(structureContext.availableActions) === JSON.stringify([WorldFocusAction.GO]), '20. a structure offers ONLY Go');
        assert(structureContext.regionPath.length === 0, '21. a structure far from any region has an empty regionPath');
        assert(structureContext.geographicPlace === null, '22. no candidates supplied -> no geographicPlace');
        assert(structureContext.arrivalPhrase === 'Unmarked ground — no named place claims this yet.', '23. neutral wording when neither a region nor a geographic place is known');

        // COLLABORATOR — description reads the activity, in the same
        // wording convention core/WorldWelcomeContext.js already uses.
        const collabEntity = { identityId: 'bob-id', deviceId: 'bob-device', displayName: 'Bob', activity: 'BUILDING', position: { x: 15, y: 0, z: 15 } };
        const collabContext = deriveWorldFocusContext({ kind: WorldFocusKind.COLLABORATOR, entity: collabEntity, viewerPosition: viewer, regions });
        assert(collabContext.title === 'Bob' && collabContext.subtitle === 'Collaborator', '24. collaborator title/subtitle');
        assert(collabContext.description === 'building nearby', '25. collaborator description reads the formatted activity');
        assert(collabContext.source.id === 'bob-device', '26. collaborator source id is the deviceId (what focusCollaborator() takes), not the identityId');
        assert(JSON.stringify(collabContext.availableActions) === JSON.stringify([WorldFocusAction.GO]), '27. a collaborator offers ONLY Go');

        // GEOGRAPHIC_PLACE — Go + Map, never Names (naming claims live
        // one level up, in GeographicPlacePanel), and its OWN nearest-
        // candidate lookup excludes itself.
        const nearbyPlaceEntries = [
            { fingerprintKey: 'self-key', displayName: 'Kawahara Village', descriptionCount: 3, worldCount: 2, authorCount: 7, position: { x: 5, y: 0, z: 5 } },
            { fingerprintKey: 'other-key', displayName: 'Old Market', descriptionCount: 1, worldCount: 1, authorCount: 1, position: { x: 6, y: 0, z: 6 } }
        ];
        const placeEntity = { fingerprintKey: 'self-key', displayName: 'Kawahara Village', descriptionCount: 3, worldCount: 2, authorCount: 7, position: { x: 5, y: 0, z: 5 } };
        const placeContext = deriveWorldFocusContext({ kind: WorldFocusKind.GEOGRAPHIC_PLACE, entity: placeEntity, viewerPosition: viewer, regions: [], nearbyPlaceEntries });
        assert(placeContext.subtitle === 'Geographic Place', '28. geographic place subtitle');
        assert(placeContext.description === '3 descriptions · 2 Worlds · 7 contributors', '29. description is the same three-count summary GeographicPlacePanel already renders');
        assert(JSON.stringify(placeContext.availableActions) === JSON.stringify([WorldFocusAction.GO, WorldFocusAction.MAP]), '30. a geographic place offers Go and Map, never Names');
        assert(placeContext.geographicPlace && placeContext.geographicPlace.displayName === 'Old Market',
            '31. the nearest OTHER geographic place excludes the target itself, even though it was the closest candidate in the input list');
        assert(placeContext.source.id === 'self-key', '32. source id is the place\'s own fingerprintKey');

        // Graceful nulls — never a throw on bad input.
        assert(deriveWorldFocusContext({}) === null, '33. no kind at all is null');
        assert(deriveWorldFocusContext({ kind: 'bogus', entity: { position: { x: 0, y: 0, z: 0 } } }) === null, '34. an invalid kind is null');
        assert(deriveWorldFocusContext({ kind: WorldFocusKind.LANDMARK, entity: null }) === null, '35. a null entity is null');
        assert(deriveWorldFocusContext({ kind: WorldFocusKind.LANDMARK, entity: { title: 'x' } }) === null, '36. an entity with no position is null');
        assert(deriveWorldFocusContext({ kind: WorldFocusKind.LANDMARK, entity: landmarkEntity }).distance === null,
            '37. no viewerPosition at all -> distance/direction are null, never a throw');

        // toJSON() round-trip carries every field a UI needs, including
        // the derived arrivalPhrase/placeName — never raw class instances.
        const json = landmarkContext.toJSON();
        assert(json.kind === 'landmark' && json.title === 'Village Well' && json.arrivalPhrase === landmarkContext.arrivalPhrase,
            '38. toJSON() carries kind/title/arrivalPhrase through');
        assert(Array.isArray(json.regionPath) && json.regionPath.length === 2, '39. toJSON() carries regionPath as a plain array');
        assert(JSON.stringify(json) === JSON.stringify(landmarkContext.toJSON()), '40. two consecutive toJSON() reads of the SAME instance are byte-identical');
    }
    console.log('✓ Section A: core/WorldFocusContext.js — all five kinds derive correctly, graceful nulls, byte-identical toJSON()');

    // -------------------------------------------------------------
    // Section B: application/WorldNavigationSession.js wiring
    // -------------------------------------------------------------
    {
        const bareSession = makeReplica([]);
        assert(bareSession.getFocusContextForLocation('nothing') === null, '41. an unknown locationId is null on a bare session, never a throw');
        assert(bareSession.getFocusContextForLocation(null) === null, '42. a null locationId is null, never a throw');
        assert(bareSession.getFocusContextForCollaborator('nothing') === null, '43. an unknown deviceId is null on a bare session');
        assert(bareSession.getFocusContextForLocation('origin') === null, '44. ORIGIN is not a focusable kind — getFocusContextForLocation() is null, never a fabricated context');

        const worldId = 'w1';
        const doc = makeDocument(worldId);
        const regionA = region({ id: 'region-a', worldId, name: 'Riverside', description: 'A calm riverside district', kind: RegionKind.DISTRICT, x: 0, z: 0, radius: 100 });
        const landmarkA = landmark({ id: 'landmark-a', worldId, title: 'Old Well', description: 'Central water source', x: 5, z: 5 });
        doc.world.addWorldRegion(regionA);
        doc.world.addWorldLandmark(landmarkA);
        const placement = new StructurePlacement({ id: 'placement-a', documentId: 'other-doc', position: new Position(10, 0, 10) });
        doc.world.addStructurePlacement(placement);

        const session = makeReplica([doc]);
        setAvatarPosition(session, 1, 1);

        const regionFocus = session.getFocusContextForLocation('region-a');
        assert(regionFocus && regionFocus.kind === WorldFocusKind.REGION && regionFocus.title === 'Riverside', '45. getFocusContextForLocation() resolves a real region');
        assert(regionFocus.description === 'A calm riverside district', '46. the resolved region context carries its own description, which plain WorldLocation rows never expose');

        const landmarkFocus = session.getFocusContextForLocation('landmark-a');
        assert(landmarkFocus && landmarkFocus.kind === WorldFocusKind.LANDMARK && landmarkFocus.title === 'Old Well', '47. getFocusContextForLocation() resolves a real landmark');
        assert(landmarkFocus.description === 'Central water source', '48. the resolved landmark context carries its own description');

        const structureFocus = session.getFocusContextForLocation('placement-a');
        assert(structureFocus && structureFocus.kind === WorldFocusKind.STRUCTURE, '49. getFocusContextForLocation() resolves a real structure placement');

        assert(session.getFocusContextForLocation('does-not-exist') === null, '50. an unresolvable id on a wired session is still null, never a throw');

        stubCollaboratorRoster(session, worldId, [{ identityId: 'bob-id', deviceId: 'bob-device', displayName: 'Bob', activity: 'EDITING', position: new Position(2, 0, 2) }]);
        const collabFocus = session.getFocusContextForCollaborator('bob-device');
        assert(collabFocus && collabFocus.kind === WorldFocusKind.COLLABORATOR, '51. getFocusContextForCollaborator() resolves a present collaborator');
        assert(collabFocus.description === 'editing nearby', '52. the resolved collaborator context reads their live activity');
        assert(session.getFocusContextForCollaborator('unknown-device') === null, '53. an unknown deviceId on a wired session is still null');

        // No mutation, ever — the World this session read from is
        // byte-identical after every focus-context read above.
        assert(regionA.name === 'Riverside' && regionA.description === 'A calm riverside district', '54. focusing a region never rewrites it');
        assert(landmarkA.title === 'Old Well' && landmarkA.description === 'Central water source', '55. focusing a landmark never rewrites it');

        // Determinism — two independent reads of the SAME target produce
        // byte-identical JSON.
        const firstRead = session.getFocusContextForLocation('region-a').toJSON();
        const secondRead = session.getFocusContextForLocation('region-a').toJSON();
        assert(firstRead !== secondRead, '56. each read rebuilds a fresh instance, never a cached singleton');
        assert(JSON.stringify(firstRead) === JSON.stringify(secondRead), '57. despite being freshly rebuilt, two reads of the same target are byte-identical');
    }
    console.log('✓ Section B: application/WorldNavigationSession.js — getFocusContextForLocation()/getFocusContextForCollaborator(), no mutation, deterministic');

    // -------------------------------------------------------------
    // Section C: CAPSTONE — cross-surface consistency, Focus ≠ Go ≠ Map
    // -------------------------------------------------------------
    console.log('\n--- World View Contextual Focus: flagship scenario ---');

    const worldId = 'flagship-world';
    const doc = makeDocument(worldId);
    // A small region (Willow Village) nested inside a larger one (Green
    // Valley) — proves regionPath reports BOTH, innermost first, for
    // whatever is focused, exactly as core/WorldRegionGeography.js's own
    // convention already establishes.
    const greenValley = region({ id: 'green-valley', worldId, name: 'Green Valley', kind: RegionKind.COUNTRY, x: 0, z: 0, radius: 1000 });
    const willowVillage = region({ id: 'willow-village', worldId, name: 'Willow Village', kind: RegionKind.VILLAGE, x: 100, z: 200, radius: 50 });
    doc.world.addWorldRegion(greenValley);
    doc.world.addWorldRegion(willowVillage);
    const villageWell = landmark({ id: 'village-well', worldId, title: 'Village Well', description: 'Central water source', x: 110, z: 205 });
    doc.world.addWorldLandmark(villageWell);
    // A geographically UNRELATED region far outside Green Valley, so a
    // geographic place candidate built from it can never be mistaken for
    // Willow Village's own containment.
    const distantRegion = region({ id: 'distant-hamlet', worldId, name: 'Distant Hamlet', kind: RegionKind.VILLAGE, x: 5000, z: 5000, radius: 20 });
    doc.world.addWorldRegion(distantRegion);
    console.log('✓ Phase A: Green Valley contains Willow Village; Village Well sits inside both; Distant Hamlet is unrelated');

    const session = makeReplica([doc]);
    setAvatarPosition(session, 105, 202);
    stubCollaboratorRoster(session, worldId, [
        { identityId: 'carol-id', deviceId: 'carol-device', displayName: 'Carol', activity: 'WALKING', position: new Position(108, 0, 206) }
    ]);
    console.log('✓ Phase B: the viewer stands inside Willow Village, near the Village Well and near Carol');

    // Phase C — the SAME landmark, reached two different ways (a plain
    // locationId lookup, the exact id shape Explore's own nearby-row
    // "Info" button and LocationsPanel's own "Info" button both pass),
    // produces the identical context.
    const fromExplore = session.getFocusContextForLocation('village-well');
    const fromLocationsPanel = session.getFocusContextForLocation('village-well');
    assert(JSON.stringify(fromExplore.toJSON()) === JSON.stringify(fromLocationsPanel.toJSON()),
        '58. the same landmark reached from two different surfaces produces byte-identical WorldFocusContext JSON');
    assert(fromExplore.arrivalPhrase === 'You are in Willow Village · Green Valley', '59. the landmark\'s own regionPath breadcrumb reports innermost-first containment');
    assert(fromExplore.regionPath.length === 2 && fromExplore.regionPath[0].name === 'Willow Village' && fromExplore.regionPath[1].name === 'Green Valley',
        '60. regionPath itself is innermost-first, matching core/WorldRegionGeography.js\'s own convention');
    console.log('✓ Phase C: the same landmark reached from two different surfaces converges on one identical context');

    // Phase D — a region focusing on ITSELF still reports the larger
    // region it sits inside, but never itself.
    const villageFocus = session.getFocusContextForLocation('willow-village');
    assert(villageFocus.regionPath.length === 1 && villageFocus.regionPath[0].id === 'green-valley',
        '61. Willow Village\'s own focus context reports Green Valley as containing it, never itself');
    assert(villageFocus.arrivalPhrase === 'You are in Green Valley', '62. arrivalPhrase for a nested region names only its OWN container');
    console.log('✓ Phase D: a region\'s own focus context never lists itself as its own container');

    // Phase E — Focus never navigates: reading any number of focus
    // contexts leaves the camera/avatar position, and every World
    // entity, completely untouched.
    const beforeAvatar = session.getAvatarPosition();
    session.getFocusContextForLocation('village-well');
    session.getFocusContextForLocation('willow-village');
    session.getFocusContextForCollaborator('carol-device');
    const afterAvatar = session.getAvatarPosition();
    assert(beforeAvatar.x === afterAvatar.x && beforeAvatar.z === afterAvatar.z, '63. reading focus contexts never moves the avatar/camera — Focus ≠ Go');
    assert(willowVillage.name === 'Willow Village' && greenValley.name === 'Green Valley' && villageWell.title === 'Village Well',
        '64. nothing about the World itself was ever rewritten by any focus-context read in this scenario');
    console.log('✓ Phase E: Focus never moves the camera and never mutates the World — a purely read-only surface');

    // Phase F — the collaborator focus context resolves the SAME
    // deviceId focusCollaborator() itself would take, and its own
    // position/distance is exactly what a "Go" press would move the
    // camera toward — the two verbs agree on WHERE without either one
    // calling the other.
    const carolFocus = session.getFocusContextForCollaborator('carol-device');
    assert(carolFocus.position.x === 108 && carolFocus.position.z === 206, '65. the collaborator focus context\'s own position is their real, live position');
    assert(carolFocus.source.id === 'carol-device', '66. its source.id is exactly the deviceId focusCollaborator() itself takes — Go and Focus never disagree about identity');
    console.log('✓ Phase F: Focus and Go agree on identity/position without either one invoking the other');

    // Phase G — the SAME geographic place mechanism 0.5.5/0.5.6 already
    // established is reachable through getFocusContextForLocation() too:
    // any loaded region already has its own geographic place candidate
    // in the directory (a group of at least one region), addressable
    // through its own derived `place:<fingerprintKey>` id — the exact
    // id Explore's own "Nearby Places" row passes via
    // openFocusForGeographicPlace()/geographicPlaceLocationId(). "Go"
    // via the geographic-place path and "Go" via the plain-region path
    // must converge on the identical position, the same guarantee
    // focusLocation() itself already holds since 0.5.6.
    const directory = session.getGeographicPlaceDirectory();
    const villagePlace = directory.find((place) => place.regions.some((r) => r.id === 'willow-village'));
    assert(villagePlace, '67. Willow Village has its own geographic place candidate in the directory, even as a group of one');
    const placeFocus = session.getFocusContextForLocation(geographicPlaceLocationId(villagePlace.fingerprintKey));
    assert(placeFocus && placeFocus.kind === WorldFocusKind.GEOGRAPHIC_PLACE, '68. getFocusContextForLocation() resolves a real GEOGRAPHIC_PLACE id end to end');
    assert(placeFocus.position.x === villageFocus.position.x && placeFocus.position.z === villageFocus.position.z,
        '69. the geographic-place path and the plain-region path converge on the identical position');
    console.log('✓ Phase G: a region\'s own geographic place candidate is reachable end to end through getFocusContextForLocation()');

    // Phase H — an unrelated, far-away region never contaminates
    // Willow Village's own containment or its "in" wording, even though
    // both are loaded in the same session.
    const distantFocus = session.getFocusContextForLocation('distant-hamlet');
    assert(distantFocus.regionPath.length === 0, '70. Distant Hamlet sits inside nothing else — an empty regionPath, never accidentally nested under Green Valley');
    assert(villageFocus.regionPath.every((r) => r.id !== 'distant-hamlet'), '71. Willow Village\'s own containment never lists the geographically unrelated Distant Hamlet');
    console.log('✓ Phase H: an unrelated region never contaminates another target\'s own containment reading');

    console.log('\nAll World View Contextual Focus & Information Hierarchy tests passed.');
}

// tests.html's `await import(file)` only reliably waits for a module's
// synchronous top-level evaluation — see every other test file's own
// closing comment on this — so this is invoked with top-level await,
// never fire-and-forget.
await run();
