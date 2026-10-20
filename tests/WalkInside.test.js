import { findBuildEntrance, hasWalkedInside, ENTRANCE_STAND_DISTANCES, INSIDE_DEPTH } from '../core/world/BuildEntrance.js';
import { arrivalMethods } from '../application/worldNavigation/arrivalMethods.js';
import { DEFAULT_MAX_STEP_HEIGHT } from '../core/building/BrickWalkability.js';
import { AvatarStepConstraint } from '../application/avatar/AvatarStepConstraint.js';
import { AvatarMovementConstraint } from '../application/avatar/AvatarMovementConstraint.js';
import { AvatarMovementController } from '../application/avatar/AvatarMovementController.js';
import { AvatarTemplateRegistry } from '../core/avatar/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/avatar/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/avatar/AvatarPresenceSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { STARTER_STRUCTURE_ID } from '../application/home/FeaturedBuilds.js';
import { VillageLibrary } from '../core/library/VillageLibrary.js';
import { CollectionLibrary } from '../core/library/CollectionLibrary.js';
import { ShowcaseLibrary } from '../core/library/ShowcaseLibrary.js';
import { World } from '../core/document/World.js';
import { Building } from '../core/building/Building.js';
import { Brick } from '../core/building/Brick.js';
import { Position } from '../core/document/Position.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// Walk inside it: where a visitor arrives to walk into a published build
// (core/world/BuildEntrance.js), World View putting them there
// (application/worldNavigation/arrivalMethods.js), and knowing when they have
// gone in, which finishes the guided first build.

const registry = new CreateBrickRegistryUseCase().execute();
const near = (a, b, epsilon = 1e-9) => Math.abs(a - b) <= epsilon;
const structure = (id) => [VillageLibrary, CollectionLibrary, ShowcaseLibrary]
    .flatMap((library) => library.structures).find((candidate) => candidate.id === id);

// The starter house: in front of its door, facing it.
{
    const entrance = findBuildEntrance(structure(STARTER_STRUCTURE_ID).bricks, registry);
    assert(entrance.kind === 'door' && entrance.door.definitionId === 'core:door', 'the house is entered by its door');
    assert(near(entrance.door.x, -0.5) && near(entrance.door.z, -3), 'its front door');
    assert(near(entrance.stand.x, -0.5) && near(entrance.stand.z, -3 - ENTRANCE_STAND_DISTANCES[0]) && entrance.stand.y === 0, 'a few steps in front of it, on the ground');
    assert(entrance.heading === 0 && near(entrance.inward.x, 0) && near(entrance.inward.z, 1), 'facing it, with the way in toward +z');
    console.log('✓ the starter house is entered by its front door');
}

// Which side is outside comes from where an avatar can walk, not which way a
// door is turned; doors into nothing are no way in.
{
    const cottage = findBuildEntrance(structure('village:garden_cottage').bricks, registry);
    assert(cottage.kind === 'door' && near(cottage.door.z, 1.9) && cottage.stand.z > cottage.door.z && cottage.heading === 180,
        'the Garden Cottage is entered from its garden, facing -z');
    for (const id of ['village:silo', 'village:watchtower', 'collection:lighthouse', 'village:stable']) {
        assert(findBuildEntrance(structure(id).bricks, registry).kind === 'front', `${id}'s door leads into nothing: arrive in front of it`);
    }
    const keeper = findBuildEntrance(structure('collection:keepers_lighthouse').bricks, registry);
    assert(keeper.kind === 'door' && near(keeper.door.x, 5), 'the keeper\'s cottage door, not the lighthouse\'s');
    const chapel = findBuildEntrance(structure('village:small_chapel').bricks, registry);
    assert(chapel.kind === 'door' && chapel.door.definitionId === 'core:arch', 'a doorway arch is a way in');
    console.log('✓ the outside is where an avatar can walk to, and doors into nothing don\'t count');
}

// No door: in front of the build (its -z side), facing it. No bricks: nowhere.
{
    const world = [new Brick({ definitionId: 'core:cube', position: new Position(2, 0.5, 3) })];
    const entrance = findBuildEntrance(world, registry);
    assert(entrance.kind === 'front' && entrance.door === null && entrance.inward === null, 'a cube has no way in');
    assert(near(entrance.stand.x, 2) && entrance.stand.z < 2.5 && entrance.heading === 0, 'arrive in front of it, facing it');
    assert(hasWalkedInside(entrance, entrance.stand), 'with no door, arriving is all there is');
    assert(findBuildEntrance([], registry) === null && findBuildEntrance(null, registry) === null, 'nothing to arrive at');
    const tilted = [new Brick({ definitionId: 'core:door', position: new Position(0, 0.05, 0), tilt: 90 })];
    assert(findBuildEntrance(tilted, registry).kind === 'front', 'a door lying flat is no way in');
    console.log('✓ a build with no door is arrived at from the front');
}

// In is past the doorway and within the build, not round its side.
{
    const entrance = findBuildEntrance(structure(STARTER_STRUCTURE_ID).bricks, registry);
    assert(!hasWalkedInside(entrance, entrance.stand), 'standing at the door is not inside');
    assert(!hasWalkedInside(entrance, { x: -0.5, z: -3 + INSIDE_DEPTH / 2 }), 'in the doorway is not yet inside');
    assert(hasWalkedInside(entrance, { x: -0.5, z: -1.5 }), 'past it is');
    assert(!hasWalkedInside(entrance, { x: 7, z: 0 }), 'round the side of the house is not');
    assert(!hasWalkedInside(null, { x: 0, z: 0 }), 'no entrance, nothing to be inside');
    console.log('✓ inside means through the door');
}

// End to end: from where a visitor arrives in every ready-made build with a
// door, walking straight ahead with the real movement pipeline takes them
// inside.
{
    const templates = new AvatarTemplateRegistry();
    templates.register(CoreAvatarTemplateLibrary);
    const storage = new InMemoryStorageProvider();
    const identity = new LocalIdentityProvider(storage);
    identity.login('walk-inside');
    const profile = new AvatarProfileUseCase(storage, identity, templates).getProfile();
    let walked = 0;
    for (const library of [VillageLibrary, CollectionLibrary, ShowcaseLibrary]) {
        for (const candidate of library.structures) {
            const entrance = findBuildEntrance(candidate.bricks, registry);
            if (entrance.kind !== 'door') continue;
            const world = new World();
            const building = new Building({ creator: 'walk-inside' });
            for (const brick of candidate.bricks) building.addBrick(brick);
            world.addBuilding(building);
            const loadedDocuments = new Map([['doc', { world }]]);
            const getWorldPosition = () => ({ x: 0, y: 0, z: 0 });
            const movementConstraint = new AvatarMovementConstraint({ loadedDocuments, getWorldPosition, brickRegistry: registry, maxStepHeight: DEFAULT_MAX_STEP_HEIGHT });
            const stepConstraint = new AvatarStepConstraint({ loadedDocuments, getWorldPosition, brickRegistry: registry });
            const presence = new AvatarPresenceSession(profile);
            presence.update({ position: { ...entrance.stand }, rotation: { x: 0, y: entrance.heading, z: 0 } });
            const controller = new AvatarMovementController(presence, movementConstraint, null, stepConstraint);
            controller.keyDown('w');
            let inside = false;
            for (let i = 0; i < 80 && !inside; i++) {
                controller.tick(0.05);
                inside = hasWalkedInside(entrance, presence.current.position);
            }
            assert(inside, `walking ahead from ${candidate.id}'s arrival goes in through its ${entrance.door.definitionId}`);
            walked++;
        }
    }
    assert(walked >= 14, `every ready-made build with a door (${walked}) is walked into from where you arrive`);
    console.log(`✓ from where you arrive, walking ahead goes inside, in all ${walked} ready-made builds with a door`);
}

// World View: arriving puts the avatar at the door and the camera behind it,
// waits for a document still loading, and follows the walk in.
function arrivalHost({ loaded = true, avatar = true } = {}) {
    const world = new World();
    const building = new Building({ creator: 'arrival' });
    for (const brick of structure(STARTER_STRUCTURE_ID).bricks) building.addBrick(brick);
    world.addBuilding(building);
    const calls = { focus: [], camera: [], updates: 0 };
    let position = { x: 0, y: 0, z: 0 };
    let rotation = { x: 0, y: 0, z: 0 };
    const host = {
        ...arrivalMethods,
        _registry: registry,
        _loadedDocuments: new Map(loaded ? [['doc-1', { world }]] : []),
        _getWorldPosition: (id) => (id === 'doc-1' ? { x: 100, y: 0, z: -40 } : null),
        _avatarPresenceSession: avatar ? {
            get current() { return { position, rotation }; },
            update(next) { if (next.position) position = next.position; if (next.rotation) rotation = next.rotation; }
        } : null,
        focusDocument(id) { calls.focus.push(id); },
        _beginCameraFocus(framing) { calls.camera.push(framing); },
        getWorldSeed: () => 1,
        updateSpatialView() { calls.updates++; },
        _arrival: null
    };
    return { host, calls, world, move: (next) => { position = next; }, where: () => ({ position, rotation }) };
}
{
    const { host, calls, where, move } = arrivalHost();
    assert(host.arriveAtEntrance('doc-1') === true && calls.focus.join() === 'doc-1', 'it focuses the build');
    const { position, rotation } = where();
    assert(near(position.x, 99.5) && near(position.z, -43 - ENTRANCE_STAND_DISTANCES[0]) && rotation.y === 0, 'the avatar stands in front of the door, facing it');
    const camera = calls.camera[0];
    assert(camera && camera.position.z < position.z && near(camera.target.x, 99.5) && near(camera.target.z, -43), 'the camera looks past them at the door');
    assert(host.arrivalState().walkedInside === false && host.arrivalState().kind === 'door', 'not inside yet');
    move({ x: 99.5, y: 0.25, z: -41.5 });
    assert(host.arrivalState().walkedInside === true, 'through the door: inside');
    move({ x: 99.5, y: 0, z: -50 });
    assert(host.arrivalState().walkedInside === true, 'and it stays done');
    assert(host.arriveAtEntrance(null) === false, 'no build, no arrival');
    console.log('✓ World View arrives at the door and follows the walk in');
}
{
    const { host, calls, world, where } = arrivalHost({ loaded: false });
    host.arriveAtEntrance('doc-1');
    assert(host.arrivalState() === null && calls.camera.length === 0, 'still loading: nothing yet');
    host._loadedDocuments.set('doc-1', { world });
    host._settlePendingArrival('doc-1');
    assert(near(where().position.z, -43 - ENTRANCE_STAND_DISTANCES[0]) && calls.camera.length === 1, 'arrives once the build has loaded');
    host._settlePendingArrival('doc-1');
    assert(calls.camera.length === 1, 'only once');
    const { host: noAvatar } = arrivalHost({ avatar: false });
    noAvatar.arriveAtEntrance('doc-1');
    assert(noAvatar.arrivalState().walkedInside === true, 'with no avatar to walk, arriving is enough');
    console.log('✓ an arrival waits for its build, and needs no avatar');
}
