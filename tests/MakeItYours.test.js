import { addReadyMadeBricks, brickSignature, countPlacedBricks, worldBricks } from '../core/PlacedBricks.js';
import { ReadyMadeBricksStore } from '../application/document/ReadyMadeBricksStore.js';
import { backupEntryGroupOf, BackupEntryGroup } from '../application/backup/BackupEntryGroups.js';
import { FunnelEvent, publishedBuildEvents, publishedPlacedRangeEvent } from '../core/VisitorCount.js';
import { residentWishNear, residentWishFulfilledNear, phraseWishFulfilled, WISH_CLEAR_RADIUS } from '../core/ResidentWish.js';
import { describeWhere } from '../core/ResidentTalk.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { EditorSession } from '../application/editor/EditorSession.js';
import { DocumentManager } from '../application/document/DocumentManager.js';
import { CopyStructureIntoDocumentUseCase } from '../application/editor/CopyStructureIntoDocumentUseCase.js';
import { PasteBricksCommand } from '../application/commands/PasteBricksCommand.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { VillageLibrary } from '../core/library/VillageLibrary.js';
import { Document } from '../core/Document.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { displayText } from '../ui/i18n/i18n.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// "Make it yours" (docs/reviews/CreativeDirection-2026-10-11.md): publishing
// counts the bricks a builder placed or changed, not the ready-made ones a
// build started with or had dropped in (core/PlacedBricks.js,
// application/document/ReadyMadeBricksStore.js), and residents notice what
// now stands where they wondered (core/ResidentWish.js). The challenge's
// empty plot and remix weeks are tested in BuildChallenge and
// ChallengeViewBrowser.

const registry = new CreateBrickRegistryUseCase().execute();
const house = VillageLibrary.structures.find((structure) => structure.id === 'village:house');
const brick = (x, y = 0.5, z = 0, extra = {}) => new Brick({ definitionId: 'core:cube', position: new Position(x, y, z), ...extra });

// A brick is known by what it is and where it stands, never by its id.
{
    const a = brick(1, 0.5, 2, { color: 0xff0000 });
    const copy = new Brick({ definitionId: a.definitionId, position: new Position(1.0000001, 0.5, 2), color: 0xff0000 });
    assert(a.id !== copy.id && brickSignature(a) === brickSignature(copy), 'a copy with a new id and a hair\'s difference is the same brick');
    assert(brickSignature(a) !== brickSignature(brick(1, 0.5, 2)), 'a recoloured brick is a different one');
    assert(brickSignature(a) !== brickSignature(brick(1, 0.5, 2, { color: 0xff0000, rotation: 90 })), 'so is a turned one');
    assert(brickSignature(a) !== brickSignature(brick(2, 0.5, 2, { color: 0xff0000 })), 'and a moved one');
    console.log('✓ a brick is known by what it is and where it stands');
}

// Placed: every brick a ready-made one doesn't account for.
{
    const start = house.bricks;
    const readyMade = addReadyMadeBricks(null, start);
    assert(countPlacedBricks(start, readyMade) === 0, 'the starter house untouched: nothing placed');
    const moved = start.map((b, i) => (i === 0 ? new Brick({ definitionId: b.definitionId, position: new Position(b.position.x + 5, b.position.y, b.position.z) }) : b));
    assert(countPlacedBricks(moved, readyMade) === 1, 'one ready-made brick moved counts as one of the builder\'s');
    assert(countPlacedBricks([...start, brick(9), brick(10)], readyMade) === 2, 'two bricks added are two placed');
    assert(countPlacedBricks(start.slice(5), readyMade) === 0, 'deleting ready-made bricks places nothing');
    assert(countPlacedBricks([...start, start[0]], readyMade) === 1, 'a second brick where a ready-made one stands is the builder\'s');
    assert(countPlacedBricks(start, null) === start.length, 'with no record, every brick is the builder\'s');
    console.log('✓ placed bricks are the ones the ready-made ones don\'t account for');
}

// The store keeps a record per build, on the device.
{
    const storage = new InMemoryStorageProvider();
    const store = new ReadyMadeBricksStore({ storageProvider: storage });
    const world = new World();
    const building = new Building({ creator: 'test' });
    for (const b of house.bricks) building.addBrick(new Brick({ definitionId: b.definitionId, position: b.position.clone(), rotation: b.rotation, tilt: b.tilt, color: b.color }));
    world.addBuilding(building);
    assert(store.placedCount(world) === house.bricks.length, 'no record: all the builder\'s');
    store.started(world);
    assert(store.placedCount(world) === 0, 'started from the house: none');
    building.addBrick(brick(20));
    store.added(world.id, [brick(30)]);
    assert(store.placedCount(world) === 1, 'one placed, and a dropped-in brick elsewhere changes nothing');
    assert(new ReadyMadeBricksStore({ storageProvider: storage }).placedCount(world) === 1, 'the record is kept on the device');
    const names = storage.list();
    assert(names.length === 1 && backupEntryGroupOf(names[0]) === BackupEntryGroup.DOCUMENTS, `and backed up and restored with the documents (${names})`);
    assert(store.get(null) === null && store.get('nothing') === null, 'no record for nothing');
    let threw = false;
    try { new ReadyMadeBricksStore({ storageProvider: {} }); } catch { threw = true; }
    assert(threw, 'it needs a storage provider');
    console.log('✓ the store keeps what each build started with');
}

// The Editor records it: a structure forked, and a library structure dropped
// in, are ready-made; a brick placed is the builder's.
{
    const storage = new InMemoryStorageProvider();
    const store = new ReadyMadeBricksStore({ storageProvider: storage });
    const documentManager = new DocumentManager();
    const session = new EditorSession({
        registry, editorContext: null, toolRegistry: null, documentManager, selectionUseCase: null,
        previewUseCase: null, loadDocumentUseCase: null, identityProvider: { currentUser: () => ({ username: 'ana' }) },
        readyMadeBricks: store
    });
    session.openDocument = (document) => documentManager.newDocument(document);
    assert(session.forkStructure(house) === true, 'the house is forked');
    const world = documentManager.document.world;
    assert(worldBricks(world).length === house.bricks.length && store.placedCount(world) === 0, 'a forked structure is all ready-made');

    const buildingId = world.getBuildings()[0].id;
    const well = VillageLibrary.structures.find((structure) => structure.id === 'village:well');
    const paste = new CopyStructureIntoDocumentUseCase().execute(well, { worldId: world.id, buildingId, world, registry });
    assert(paste.isLibraryStructure, 'a library structure\'s paste says so');
    paste.execute({ world });
    session._noteReadyMadePaste(paste);
    assert(store.placedCount(world) === 0, `a well dropped in from the Build Library is ready-made too (${store.placedCount(world)})`);

    const ownPaste = new PasteBricksCommand({ worldId: world.id, buildingId, items: [{ definitionId: 'core:cube', position: { x: 40, y: 0.5, z: 0 } }] });
    assert(!ownPaste.isLibraryStructure, 'a paste of the builder\'s own bricks is not');
    ownPaste.execute({ world });
    session._noteReadyMadePaste(ownPaste);
    world.addBrickToBuilding(buildingId, brick(50));
    assert(store.placedCount(world) === 2, 'a pasted copy of their own and a brick placed are the builder\'s');

    const copy = new Document({ world: World.fromJSON(world.toJSON()) });
    documentManager.newDocument(copy);
    session.noteReadyMadeStart();
    assert(store.placedCount(copy.world) === 0, 'a copy of a build starts all ready-made');
    console.log('✓ the Editor records ready-made bricks as they come in');
}

// The counter reports the placed range beside the brick range, once per build.
{
    assert(publishedPlacedRangeEvent(0) === FunnelEvent.PUBLISH_PLACED_0 && publishedPlacedRangeEvent(9) === FunnelEvent.PUBLISH_PLACED_1, 'the low ranges');
    assert(publishedPlacedRangeEvent(10) === FunnelEvent.PUBLISH_PLACED_10 && publishedPlacedRangeEvent(250) === FunnelEvent.PUBLISH_PLACED_200, 'the high ones');
    assert(publishedPlacedRangeEvent(-3) === FunnelEvent.PUBLISH_PLACED_0 && publishedPlacedRangeEvent(1.5) === FunnelEvent.PUBLISH_PLACED_0, 'nonsense is none');
    const publication = { id: 'p1', documentId: 'd1' };
    const events = publishedBuildEvents({ publication, brickCount: 26, placedCount: 0 });
    assert(events.includes(FunnelEvent.PUBLISH_BRICKS_10) && events.includes(FunnelEvent.PUBLISH_PLACED_0),
        `the starter house published untouched: 10+ bricks, none placed (${events})`);
    assert(!publishedBuildEvents({ publication, brickCount: 26 }).some((event) => event.startsWith('publish-placed')), 'no placed count, no placed range');
    assert(publishedBuildEvents({ publication, brickCount: 26, placedCount: 3, ownPublications: [{ id: 'p0', documentId: 'd1' }] }).length === 0,
        'publishing the same build again counts nothing');
    console.log('✓ publishing reports the range of bricks the builder placed');
}

// Residents: once something stands where they wondered, they say so, as a fact.
{
    const OPEN = { x: -600, z: 177 };
    const home = { x: OPEN.x - 3, z: OPEN.z };
    const wish = residentWishNear({ seed: DEFAULT_WORLD_SEED, position: OPEN, homePosition: home });
    assert(wish, 'open ground has a wish');
    const nothing = residentWishFulfilledNear({ seed: DEFAULT_WORLD_SEED, position: OPEN, homePosition: home, built: [] });
    assert(nothing === null, 'nothing built there: nothing to notice');
    const far = residentWishFulfilledNear({ seed: DEFAULT_WORLD_SEED, position: OPEN, homePosition: home, built: [{ x: wish.spot.x + WISH_CLEAR_RADIUS * 3, z: wish.spot.z, title: 'Far' }] });
    assert(far === null, 'something farther off isn\'t it');
    const built = [{ x: wish.spot.x + 2, z: wish.spot.z, title: 'Ana\'s Well' }, { x: wish.spot.x + 6, z: wish.spot.z, title: 'Later' }];
    const fulfilled = residentWishFulfilledNear({ seed: DEFAULT_WORLD_SEED, position: OPEN, homePosition: home, built });
    assert(fulfilled && fulfilled.wish === wish.wish && fulfilled.build.title === 'Ana\'s Well', 'the nearest build to the spot is noticed');
    assert(residentWishNear({ seed: DEFAULT_WORLD_SEED, position: OPEN, homePosition: home, builtPositions: built }) === null, 'and the wish itself goes quiet');
    const where = describeWhere({ distance: 14, direction: 'east' });
    const named = displayText(phraseWishFulfilled(fulfilled, where, 'Ana\'s Well'));
    assert(named.includes('Ana\'s Well') && !named.includes('{'), `said with its title (${named})`);
    const unnamed = displayText(phraseWishFulfilled(fulfilled, where));
    assert(unnamed.startsWith('Someone has built') && !unnamed.includes('{'), `or without one (${unnamed})`);
    assert(phraseWishFulfilled(null, where) === null && phraseWishFulfilled({ wish: 'castle' }, where) === null, 'nothing to say about nothing');
    console.log('✓ residents notice what stands where they wondered, as a fact');
}
