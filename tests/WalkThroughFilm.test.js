// A walk-through video, filmed in World View (core/WalkThroughFilm.js): where
// the walk starts and goes, what each frame of the film does, that the real
// movement pipeline walks every ready-made build with a door from the start
// to inside, World View's session applying it to the avatar
// (application/worldNavigation/walkThroughFilmMethods.js), and how a frame is
// cropped to the video's shape (renderer/WorldFilmRecorder.js).
import { findBuildEntrance, hasWalkedInside } from '../core/BuildEntrance.js';
import {
    APPROACH_DISTANCES, END_CARD_SECONDS, FRONT_LOOK_SECONDS, LOOK_DEGREES, LOOK_SECONDS, OPENING_SECONDS, WALK_LIMIT_SECONDS, WalkThroughPhase,
    estimateWalkThroughSeconds, planWalkThrough, startWalkThrough, stepWalkThrough, turnToward
} from '../core/WalkThroughFilm.js';
import { walkThroughFilmMethods } from '../application/worldNavigation/walkThroughFilmMethods.js';
import { coverCrop } from '../renderer/WorldFilmRecorder.js';
import { CameraPerspective } from '../core/CameraPerspective.js';
import { DEFAULT_MAX_STEP_HEIGHT } from '../core/BrickWalkability.js';
import { AvatarStepConstraint } from '../application/avatar/AvatarStepConstraint.js';
import { AvatarMovementConstraint } from '../application/avatar/AvatarMovementConstraint.js';
import { AvatarMovementController } from '../application/avatar/AvatarMovementController.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/avatar/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/avatar/AvatarPresenceSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { STARTER_STRUCTURE_ID } from '../application/home/FeaturedBuilds.js';
import { VillageLibrary } from '../core/library/VillageLibrary.js';
import { CollectionLibrary } from '../core/library/CollectionLibrary.js';
import { ShowcaseLibrary } from '../core/library/ShowcaseLibrary.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

const registry = new CreateBrickRegistryUseCase().execute();
const near = (a, b, epsilon = 1e-6) => Math.abs(a - b) <= epsilon;
const structures = [VillageLibrary, CollectionLibrary, ShowcaseLibrary].flatMap((library) => library.structures);
const structure = (id) => structures.find((candidate) => candidate.id === id);
const planOf = (bricks) => planWalkThrough(findBuildEntrance(bricks, registry), bricks, registry);

// The plan: a few steps back from the door, through it and in; a build with
// no door is walked up to.
{
    const house = structure(STARTER_STRUCTURE_ID).bricks;
    const entrance = findBuildEntrance(house, registry);
    const plan = planOf(house);
    assert(plan.kind === 'door' && plan.heading === entrance.heading, 'the house is walked into by its door, facing it');
    assert(near(plan.start.x, entrance.door.x) && near(plan.start.z, entrance.door.z - APPROACH_DISTANCES[0]) && plan.start.y === 0,
        `the walk starts ${APPROACH_DISTANCES[0]} steps back from the door, on the ground (${plan.start.z})`);
    assert(plan.path.length === 2 && near(plan.path[0].x, entrance.door.x) && near(plan.path[0].z, entrance.door.z), 'it goes to the door');
    assert(plan.path[1].z > entrance.door.z + 1 && hasWalkedInside(entrance, plan.path[1]), 'then on past it, inside');
    assert(plan.lookSeconds === LOOK_SECONDS && plan.lookDegrees === LOOK_DEGREES, 'and looks all the way round');

    // A fence across the way back: the walk starts nearer, where the way is clear.
    const fenced = [...house, new Brick({ definitionId: 'core:cube', position: new Position(entrance.door.x, 0.5, entrance.door.z - 6) })];
    const nearer = planOf(fenced);
    assert(nearer.start.z > entrance.door.z - 6 && nearer.start.z <= entrance.door.z - APPROACH_DISTANCES.at(-1) + 1e-9,
        `something in the way: the walk starts nearer (${nearer.start.z})`);

    const cube = [new Brick({ definitionId: 'core:cube', position: new Position(2, 0.5, 3) })];
    const front = planOf(cube);
    const cubeEntrance = findBuildEntrance(cube, registry);
    assert(front.kind === 'front' && front.path.length === 1 && near(front.path[0].z, cubeEntrance.stand.z), 'a cube is walked up to');
    assert(front.start.z < cubeEntrance.stand.z && front.lookDegrees === 0 && front.lookSeconds === FRONT_LOOK_SECONDS, 'from farther back, then looked at');
    assert(planWalkThrough(null) === null, 'no entrance, no plan');
    console.log('✓ the walk starts back from the door, goes through it and in');
}

// Each frame: a still opening, walking to each point in turn while turning to
// face it, a slow look round, then the end card fading in, then done.
{
    const plan = Object.freeze({
        kind: 'door', start: { x: 0, y: 0, z: -7 }, heading: 0,
        path: [{ x: 0, z: 0 }, { x: 0, z: 2 }], lookSeconds: LOOK_SECONDS, lookDegrees: LOOK_DEGREES
    });
    let state = startWalkThrough();
    let step = stepWalkThrough(plan, state, { position: { x: 0, z: -7 }, heading: 0, deltaSeconds: OPENING_SECONDS / 2 });
    assert(step.state.phase === WalkThroughPhase.OPENING && !step.walking && step.heading === 0, 'it opens standing still, facing the door');
    step = stepWalkThrough(plan, step.state, { position: { x: 0, z: -7 }, heading: 0, deltaSeconds: OPENING_SECONDS / 2 });
    assert(step.state.phase === WalkThroughPhase.WALK && step.walking, 'then walks');
    // Off to one side, it turns toward the door, a little at a time.
    const turned = stepWalkThrough(plan, step.state, { position: { x: 3, z: -3 }, heading: 0, deltaSeconds: 0.1 });
    assert(turned.heading > 300 && turned.heading < 360, `it turns toward the door, a little at a time (${turned.heading})`);
    step = stepWalkThrough(plan, step.state, { position: { x: 0, z: -0.1 }, heading: 0, deltaSeconds: 0.1 });
    assert(step.state.waypoint === 1 && step.walking, 'at the door it goes on to the next point');
    step = stepWalkThrough(plan, step.state, { position: { x: 0, z: 1.9 }, heading: 0, deltaSeconds: 0.1 });
    assert(step.state.phase === WalkThroughPhase.LOOK && !step.walking, 'inside, it stops and looks round');
    const lookStart = step.state;
    const half = stepWalkThrough(plan, lookStart, { position: { x: 0, z: 1.9 }, heading: 0, deltaSeconds: LOOK_SECONDS / 2 });
    assert(near(half.heading, 180, 1e-6), `half way through the look, it faces back the way it came (${half.heading})`);
    const early = stepWalkThrough(plan, lookStart, { position: { x: 0, z: 1.9 }, heading: 0, deltaSeconds: LOOK_SECONDS / 10 });
    assert(early.heading < 36 * 0.5, `slowly at first (${early.heading})`);
    step = stepWalkThrough(plan, lookStart, { position: { x: 0, z: 1.9 }, heading: 0, deltaSeconds: LOOK_SECONDS + 1e-6 });
    assert(step.state.phase === WalkThroughPhase.END_CARD && step.endCard === 0, 'then the end card');
    step = stepWalkThrough(plan, step.state, { position: { x: 0, z: 1.9 }, heading: 0, deltaSeconds: 0.25 });
    assert(near(step.endCard, 0.5) && !step.walking, 'fades in');
    step = stepWalkThrough(plan, step.state, { position: { x: 0, z: 1.9 }, heading: 0, deltaSeconds: END_CARD_SECONDS });
    assert(step.state.phase === WalkThroughPhase.DONE && step.endCard === 1, 'and the film is done');

    // Stuck behind something, the walk gives up after WALK_LIMIT_SECONDS.
    let stuck = stepWalkThrough(plan, startWalkThrough(), { position: { x: 0, z: -7 }, heading: 0, deltaSeconds: OPENING_SECONDS });
    stuck = stepWalkThrough(plan, stuck.state, { position: { x: 0, z: -5 }, heading: 0, deltaSeconds: WALK_LIMIT_SECONDS });
    assert(stuck.state.phase === WalkThroughPhase.LOOK, 'a walk that can\'t get there looks round from where it got to');

    assert(turnToward(350, 10, 5) === 355 && turnToward(10, 350, 30) === 350 && turnToward(0, 90, 30) === 30, 'turning goes the short way, no faster than asked');
    assert(estimateWalkThroughSeconds(plan) > OPENING_SECONDS + LOOK_SECONDS + END_CARD_SECONDS, 'an estimate for the progress bar');
    console.log('✓ each frame: opening, walk, look round, end card');
}

// End to end with the real movement pipeline: in every ready-made build with
// a door, the film walks from its start to inside, and gets to look round
// well before it would give up.
const templates = new AvatarTemplateRegistry();
templates.register(CoreAvatarTemplateLibrary);
const storage = new InMemoryStorageProvider();
const identity = new LocalIdentityProvider(storage);
identity.login('walk-through');
const profile = new AvatarProfileUseCase(storage, identity, templates).getProfile();

// The real avatar and its movement, with the build standing at `layout`.
function walker(bricks, layout = { x: 0, y: 0, z: 0 }) {
    const world = new World();
    const building = new Building({ creator: 'walk-through' });
    for (const brick of bricks) building.addBrick(brick);
    world.addBuilding(building);
    const loadedDocuments = new Map([['doc-1', { world }]]);
    const getWorldPosition = (id) => (id === 'doc-1' ? layout : null);
    const movementConstraint = new AvatarMovementConstraint({ loadedDocuments, getWorldPosition, brickRegistry: registry, maxStepHeight: DEFAULT_MAX_STEP_HEIGHT });
    const stepConstraint = new AvatarStepConstraint({ loadedDocuments, getWorldPosition, brickRegistry: registry });
    const presence = new AvatarPresenceSession(profile);
    const controller = new AvatarMovementController(presence, movementConstraint, null, stepConstraint);
    return { world, loadedDocuments, getWorldPosition, presence, controller };
}

{
    let filmed = 0;
    for (const candidate of structures) {
        const entrance = findBuildEntrance(candidate.bricks, registry);
        if (entrance?.kind !== 'door') continue;
        const plan = planWalkThrough(entrance, candidate.bricks, registry);
        const { presence, controller } = walker(candidate.bricks);
        presence.update({ position: { ...plan.start }, rotation: { x: 0, y: plan.heading, z: 0 } });
        let state = startWalkThrough();
        let held = false;
        let lookedAt = null;
        for (let i = 0; i < 1000 && state.phase !== WalkThroughPhase.DONE; i++) {
            const { position, rotation } = presence.current;
            const step = stepWalkThrough(plan, state, { position, heading: rotation.y, deltaSeconds: 0.05 });
            state = step.state;
            if (state.phase === WalkThroughPhase.LOOK && lookedAt === null) lookedAt = state.time;
            presence.update({ rotation: { x: 0, y: step.heading, z: 0 } });
            if (step.walking !== held) {
                if (step.walking) controller.keyDown('w');
                else controller.keyUp('w');
                held = step.walking;
            }
            controller.tick(0.05);
        }
        assert(state.phase === WalkThroughPhase.DONE, `${candidate.id}'s film ends`);
        assert(hasWalkedInside(entrance, presence.current.position), `and ends inside ${candidate.id}`);
        assert(lookedAt !== null && lookedAt < OPENING_SECONDS + WALK_LIMIT_SECONDS - 2, `having walked in, not given up, in ${candidate.id} (${lookedAt})`);
        filmed++;
    }
    assert(filmed >= 14, `every ready-made build with a door (${filmed}) is walked into`);
    console.log(`✓ the film walks into all ${filmed} ready-made builds with a door`);
}

// World View's session: it puts the avatar at the start with the third-person
// camera, turns and walks it each frame, keeps the person's keys out of it,
// and gives the camera back when it ends.
function filmHost({ avatar = true, loaded = true } = {}) {
    const house = structure(STARTER_STRUCTURE_ID).bricks;
    const layout = { x: 100, y: 0, z: -40 };
    const { world, presence, controller } = walker(house, layout);
    const keys = [];
    const frames = new Set();
    const perspectives = [];
    const host = {
        ...walkThroughFilmMethods,
        _registry: registry,
        _loadedDocuments: new Map(loaded ? [['doc-1', { world }]] : []),
        _getWorldPosition: (id) => (id === 'doc-1' ? layout : null),
        _avatarPresenceSession: avatar ? presence : null,
        _avatarMovementController: avatar ? {
            keyDown(key) { keys.push(`down:${key}`); return controller.keyDown(key); },
            keyUp(key) { keys.push(`up:${key}`); return controller.keyUp(key); }
        } : null,
        _cameraPerspective: null,
        _activeCameraFocus: { glide: true },
        _walkThroughFilm: null,
        getCameraPerspective() { return this._cameraPerspective; },
        setCameraPerspective(perspective) { this._cameraPerspective = perspective; perspectives.push(perspective); return true; },
        _applyCameraPerspectiveFraming() {},
        releaseAvatarMovementKeys() { keys.push('release'); },
        onRenderFrame(callback) { frames.add(callback); return () => frames.delete(callback); }
    };
    // A render frame: the film's listener, then the avatar's own movement.
    const frame = (seconds) => {
        for (const callback of [...frames]) callback(seconds);
        controller.tick(seconds);
    };
    return { host, keys, frames, perspectives, presence, frame };
}
{
    const { host: nobody } = filmHost({ avatar: false });
    assert(!nobody.canFilmWalkThrough('doc-1') && nobody.startWalkThroughFilm('doc-1') === null, 'no avatar: nothing to film');
    const { host: loading } = filmHost({ loaded: false });
    assert(!loading.canFilmWalkThrough('doc-1') && loading.walkThroughFilmState() === null, 'not loaded yet: not yet');

    const { host, keys, frames, perspectives, presence, frame } = filmHost();
    host._cameraPerspective = CameraPerspective.FIRST_PERSON;
    assert(host.canFilmWalkThrough('doc-1'), 'loaded, with an avatar: ready');
    const started = host.startWalkThroughFilm('doc-1');
    assert(started.kind === 'door' && started.seconds > 10, `it starts (${JSON.stringify(started)})`);
    const plan = planOf(structure(STARTER_STRUCTURE_ID).bricks);
    assert(near(presence.current.position.x, 100 + plan.start.x) && near(presence.current.position.z, -40 + plan.start.z), 'the avatar is put at the start, where the build stands');
    assert(host.getCameraPerspective() === CameraPerspective.THIRD_PERSON && keys[0] === 'release' && frames.size === 1, 'behind it, the person\'s keys let go, a frame listener on');
    assert(host.isFilmingWalkThrough(), 'filming');
    frame(OPENING_SECONDS + 0.05);
    assert(host._activeCameraFocus === null, 'no glide takes the camera away');
    frame(0.05);
    assert(keys.includes('down:w') && host.walkThroughFilmState().phase === WalkThroughPhase.WALK, 'it walks the avatar ahead');
    for (let i = 0; i < 600 && !host.walkThroughFilmState().done; i++) frame(0.05);
    const state = host.walkThroughFilmState();
    assert(state.done && state.endCard === 1 && keys.includes('up:w'), `the film runs to its end card, the avatar stopped (${state.phase})`);
    const entrance = findBuildEntrance(structure(STARTER_STRUCTURE_ID).bricks, registry);
    assert(hasWalkedInside(entrance, { x: presence.current.position.x - 100, z: presence.current.position.z + 40 }), 'inside the house');
    host.stopWalkThroughFilm();
    assert(frames.size === 0 && host.walkThroughFilmState() === null && !host.isFilmingWalkThrough(), 'stopping lets go of the frames');
    assert(perspectives.at(-1) === CameraPerspective.FIRST_PERSON, 'and gives the camera back its perspective');
    host.stopWalkThroughFilm();
    console.log('✓ World View films the walk with the real avatar and gives everything back after');
}

// A frame is cropped from its middle to the video's shape.
{
    const wideFromWide = coverCrop(1920, 1080, 1280, 720);
    assert(wideFromWide.x === 0 && wideFromWide.y === 0 && wideFromWide.width === 1920 && wideFromWide.height === 1080, 'a 16:9 view fills a wide video whole');
    const tall = coverCrop(1600, 900, 720, 1280);
    assert(near(tall.height, 900) && near(tall.width, 900 * 9 / 16) && near(tall.x, (1600 - 900 * 9 / 16) / 2) && tall.y === 0, 'a tall video takes the middle of a wide view');
    const wideFromTall = coverCrop(800, 1000, 1280, 720);
    assert(near(wideFromTall.width, 800) && near(wideFromTall.height, 450) && near(wideFromTall.y, 275), 'a wide video takes the middle of a tall view');
    console.log('✓ frames are cropped from the middle');
}

console.log('✅ All WalkThroughFilm tests passed.');
