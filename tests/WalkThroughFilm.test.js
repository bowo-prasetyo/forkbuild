// A walk-through video, filmed in World View (core/WalkThroughFilm.js): where
// the walk starts and goes, what each frame of the film does, that the real
// movement pipeline walks every ready-made build with a door from the start
// to inside, World View's session applying it to the avatar
// (application/worldNavigation/walkThroughFilmMethods.js), and how a frame is
// cropped to the video's shape (renderer/WorldFilmRecorder.js).
import { findBuildEntrance, hasWalkedInside } from '../core/BuildEntrance.js';
import {
    APPROACH_DISTANCES, END_CARD_SECONDS, EYES_FIELD_OF_VIEW, SWEEP_DEGREES, SWEEP_SECONDS, WalkThroughCamera, sweepFraming, FRONT_LOOK_SECONDS, LOOK_DEGREES, LOOK_SECONDS, OPENING_SECONDS, WALK_LIMIT_SECONDS, WalkThroughPhase,
    estimateWalkThroughSeconds, planWalkThrough, startWalkThrough, stepWalkThrough, turnToward
} from '../core/WalkThroughFilm.js';
import { walkThroughFilmMethods } from '../application/worldNavigation/walkThroughFilmMethods.js';
import { coverCrop } from '../renderer/WorldFilmRecorder.js';
import { videoCameraDistanceScale } from '../core/BuildVideo.js';
import { CameraPerspective } from '../core/CameraPerspective.js';
import { brickCollisionBoxes } from '../core/BrickPassage.js';
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

    // Through its eyes, it walks on to the most open spot well in and ahead of
    // the door, so the look round shows the room rather than a wall: never
    // somewhere less open than behind it, and further in where there is room.
    const eyes = planWalkThrough(entrance, house, registry, { camera: WalkThroughCamera.EYES });
    const behind = planWalkThrough(entrance, house, registry, { camera: WalkThroughCamera.BEHIND });
    const openness = (bricks, point) => Math.min(...bricks.flatMap((brick) => {
        const definition = registry.get(brick.definitionId);
        return brickCollisionBoxes(brick.position, brick.definitionId, definition, brick.rotation || 0, brick.tilt || 0)
            .filter((box) => box.max.y > 0.3 && box.min.y < 1.8 && !brick.definitionId.includes('door'));
    }).map((box) => Math.hypot(Math.max(box.min.x - point.x, 0, point.x - box.max.x), Math.max(box.min.z - point.z, 0, point.z - box.max.z))));
    for (const candidate of structures) {
        const way = findBuildEntrance(candidate.bricks, registry);
        if (way?.kind !== 'door') continue;
        const seen = planWalkThrough(way, candidate.bricks, registry, { camera: WalkThroughCamera.EYES }).path.at(-1);
        const followed = planWalkThrough(way, candidate.bricks, registry).path.at(-1);
        assert(openness(candidate.bricks, seen) >= openness(candidate.bricks, followed) - 1e-9, `through its eyes, ${candidate.id}'s spot is no less open`);
        assert(hasWalkedInside(way, seen) && Math.hypot(seen.x - way.door.x, seen.z - way.door.z) <= 4, `and inside ${candidate.id}, near the door`);
    }
    const castle = structure('showcase:castle').bricks;
    const castleWay = findBuildEntrance(castle, registry);
    const castleEyes = planWalkThrough(castleWay, castle, registry, { camera: WalkThroughCamera.EYES }).path.at(-1);
    const castleBehind = planWalkThrough(castleWay, castle, registry).path.at(-1);
    assert(openness(castle, castleEyes) > openness(castle, castleBehind) + 0.5
        && Math.hypot(castleEyes.x - castleWay.door.x, castleEyes.z - castleWay.door.z) > 3,
    `in the castle's courtyard it walks further in, somewhere more open (${openness(castle, castleEyes).toFixed(2)} against ${openness(castle, castleBehind).toFixed(2)})`);
    assert(eyes.path.every((point) => hasWalkedInside(entrance, point) || point === eyes.path[0]), 'in the house, it stays on the way in');
    assert(JSON.stringify(behind.path) === JSON.stringify(plan.path), 'behind it, the walk is as it was');
}

// The sweep: half way round the build, from far enough back to see it whole,
// ending on the side the avatar starts from, then the opening.
{
    const house = structure(STARTER_STRUCTURE_ID).bricks;
    const entrance = findBuildEntrance(house, registry);
    assert(planWalkThrough(entrance, house, registry).sweep === null, 'no sweep unless asked');
    const plan = planWalkThrough(entrance, house, registry, { sweep: true });
    const { sweep } = plan;
    assert(sweep.seconds === SWEEP_SECONDS && sweep.distance >= 9 && sweep.height > 4, `far back and above the house (${sweep.distance}, ${sweep.height})`);
    const first = sweepFraming(sweep, 0);
    const last = sweepFraming(sweep, 1);
    const side = (framing) => Math.atan2(framing.position.x - sweep.center.x, framing.position.z - sweep.center.z);
    const toStart = Math.atan2(plan.start.x - sweep.center.x, plan.start.z - sweep.center.z);
    assert(Math.abs(Math.sin(side(last) - toStart)) < 1e-6 && Math.cos(side(last) - toStart) > 0, 'it ends on the side the avatar starts from');
    assert(Math.cos(side(first) - side(last)) < -0.999 && SWEEP_DEGREES === 180, 'having come half way round');
    assert(first.target === sweep.center && near(Math.hypot(first.position.x - sweep.center.x, first.position.z - sweep.center.z), sweep.distance), 'looking at the build, always as far away');
    const early = sweepFraming(sweep, 0.1);
    assert(Math.abs(side(early) - side(first)) < Math.PI * 0.1, 'it sets off gently');

    let step = stepWalkThrough(plan, startWalkThrough(plan), { position: plan.start, heading: plan.heading, deltaSeconds: SWEEP_SECONDS / 2 });
    assert(step.state.phase === WalkThroughPhase.SWEEP && step.camera && !step.walking && step.heading === plan.heading, 'during the sweep the camera moves and the avatar waits');
    step = stepWalkThrough(plan, step.state, { position: plan.start, heading: plan.heading, deltaSeconds: SWEEP_SECONDS / 2 });
    assert(step.state.phase === WalkThroughPhase.OPENING && step.camera === null, 'then the opening, from the camera asked for');
    assert(near(estimateWalkThroughSeconds(plan) - estimateWalkThroughSeconds(planWalkThrough(entrance, house, registry)), SWEEP_SECONDS), 'the estimate counts the sweep');
    const tall = planWalkThrough(entrance, house, registry, { sweep: true, aspect: 9 / 16 }).sweep;
    assert(near(tall.distance, sweep.distance * videoCameraDistanceScale(9 / 16, 60)) && tall.distance > sweep.distance * 1.5,
        `for a tall video it stands back further, to see the build whole across a narrow frame (${tall.distance.toFixed(1)} against ${sweep.distance.toFixed(1)})`);
    console.log('✓ the sweep goes half way round the outside and ends behind the avatar');
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
        for (const camera of [WalkThroughCamera.BEHIND, WalkThroughCamera.EYES]) {
            const plan = planWalkThrough(entrance, candidate.bricks, registry, { camera });
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
            assert(state.phase === WalkThroughPhase.DONE, `${candidate.id}'s film ends (${camera})`);
            assert(hasWalkedInside(entrance, presence.current.position), `and ends inside ${candidate.id} (${camera})`);
            assert(lookedAt !== null && lookedAt < OPENING_SECONDS + WALK_LIMIT_SECONDS - 2, `having walked in, not given up, in ${candidate.id} (${camera}, ${lookedAt})`);
        }
        filmed++;
    }
    assert(filmed >= 14, `every ready-made build with a door (${filmed}) is walked into`);
    console.log(`✓ the film walks into all ${filmed} ready-made builds with a door, behind the avatar and through its eyes`);
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
    const framings = [];
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
        _spatialCameraController: { applyFraming(framing) { framings.push(framing); } },
        _session: { fov: 60, getCameraFov() { return this.fov; }, setCameraFov(degrees) { this.fov = degrees; } },
        getWorldSeed: () => 1,
        releaseAvatarMovementKeys() { keys.push('release'); },
        onRenderFrame(callback) { frames.add(callback); return () => frames.delete(callback); }
    };
    // A render frame: the film's listener, then the avatar's own movement.
    const frame = (seconds) => {
        for (const callback of [...frames]) callback(seconds);
        controller.tick(seconds);
    };
    return { host, keys, frames, perspectives, framings, presence, frame };
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

    // Through the avatar's eyes: the first-person camera, given back after.
    host.startWalkThroughFilm('doc-1', { camera: WalkThroughCamera.EYES });
    assert(host.getCameraPerspective() === CameraPerspective.FIRST_PERSON && host._session.fov === EYES_FIELD_OF_VIEW,
        'through its eyes, the first-person camera films it, with a wide lens');
    host.stopWalkThroughFilm();
    assert(host._session.fov === 60, 'and the camera\'s own lens comes back');
    host.setCameraPerspective(null);
    host.startWalkThroughFilm('doc-1', { camera: WalkThroughCamera.BEHIND });
    assert(host.getCameraPerspective() === CameraPerspective.THIRD_PERSON, 'behind it, the third-person camera');
    host.stopWalkThroughFilm();
    assert(host.getCameraPerspective() === null, 'and the free camera comes back after');

    // With a sweep, the film moves the camera round the house first, with no
    // perspective taking it over, then films the walk from the camera asked for.
    const swept = filmHost();
    swept.host.startWalkThroughFilm('doc-1', { camera: WalkThroughCamera.EYES, sweep: true });
    assert(swept.host.getCameraPerspective() === null && swept.host.walkThroughFilmState().phase === WalkThroughPhase.SWEEP && swept.host._session.fov === 60,
        'it opens on the sweep, the camera free, with its own lens');
    swept.frame(SWEEP_SECONDS / 2);
    const framed = swept.framings.at(-1);
    assert(framed && framed.position.y > framed.target.y && Math.hypot(framed.position.x - framed.target.x, framed.position.z - framed.target.z) >= 9,
        'the camera circles the house from above and far back');
    assert(!swept.keys.includes('down:w'), 'while the avatar waits');
    swept.frame(SWEEP_SECONDS / 2 + 0.05);
    assert(swept.host.getCameraPerspective() === CameraPerspective.FIRST_PERSON && swept.host._session.fov === EYES_FIELD_OF_VIEW, 'then it sees through the avatar\'s eyes, wide');
    for (let i = 0; i < 600 && !swept.host.walkThroughFilmState().done; i++) swept.frame(0.05);
    assert(swept.host.walkThroughFilmState().done && hasWalkedInside(findBuildEntrance(structure(STARTER_STRUCTURE_ID).bricks, registry),
        { x: swept.presence.current.position.x - 100, z: swept.presence.current.position.z + 40 }), 'and walks in');
    swept.host.stopWalkThroughFilm();
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
