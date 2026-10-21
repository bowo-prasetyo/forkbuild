import { World } from '../core/document/World.js';
import { Building } from '../core/building/Building.js';
import { Brick } from '../core/building/Brick.js';
import { Document } from '../core/document/Document.js';
import { DocumentMetadata } from '../core/document/DocumentMetadata.js';
import { Position } from '../core/document/Position.js';
import { WorldResident } from '../core/world/WorldResident.js';
import { RESIDENT_MOTION } from '../core/world/ResidentMotion.js';
import { isResidentWalkClear, isResidentGroundAt, RESIDENT_COLLISION_RADIUS, RESIDENT_HEADROOM } from '../core/world/ResidentPath.js';
import { VillageLibrary } from '../core/library/VillageLibrary.js';
import { moveInReadyMadeResident, isReadyMadeHome } from '../core/building/ReadyMadeHome.js';
import { DEFAULT_MAX_STEP_HEIGHT } from '../core/building/BrickWalkability.js';
import { SpatialBounds } from '../core/world/SpatialBounds.js';
import { RESIDENT_OBSTACLE_QUERY_RADIUS } from '../application/world/ResidentRuntime.js';
import { DEFAULT_WORLD_SEED } from '../core/nature/TerrainHeightField.js';
import { AVATAR_COLLISION_RADIUS } from '../core/avatar/AvatarCollision.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { residentAppearanceFor, RESIDENT_TEMPLATE_ID } from '../core/world/ResidentAppearance.js';
import { AvatarInteractionKind } from '../core/avatar/AvatarInteractionKind.js';
import { ResidentRuntime, RESIDENT_INTERACTION_RADIUS, MAX_RENDERED_RESIDENTS } from '../application/world/ResidentRuntime.js';
import { AvatarResidentConstraint } from '../application/avatar/AvatarResidentConstraint.js';
import { AvatarMovementConstraint } from '../application/avatar/AvatarMovementConstraint.js';
import { AvatarPresenceSession } from '../application/avatar/AvatarPresenceSession.js';
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { CommandHistory } from '../application/editor/CommandHistory.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { RESIDENT_REFUSAL } from '../application/worldNavigation/residentMethods.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { ResidentFieldRenderer } from '../renderer/ResidentFieldRenderer.js';
import { RESIDENT_REACTION } from '../renderer/ResidentReaction.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// World Residents end to end: every system that asks where a resident is
// gets the same answer, and a World's author can add and remove them.
//
//   Section A: ResidentRuntime — residents found in loaded Worlds, homes in
//              shared space, nearest first, capped
//   Section B: a real brick wall in the World is never walked through
//   Section C: AvatarResidentConstraint — a resident blocks the avatar where
//              it is, unless the avatar is up on something
//   Section D: WorldNavigationSession — adding, removing, refusals, undo,
//              the 'R' key and the per-frame hand-off to the renderer
//   Section E: ResidentFieldRenderer — drawn, removed, feet on the ground,
//              one wave per approach
//   Section F: the Village library's ready-made homes — their residents get
//              out of a fenced garden, step indoors through a front door, and
//              never walk through anything
//   Section G: an edit nearby — a brick raised over a resident's head or
//              lowered into its way changes its way, and an edit made in
//              World View is looked at again on the resident's next turn

const SEED = DEFAULT_WORLD_SEED;
// A daytime moment (a quarter of the way into the World's day): by night
// animals and residents settle down (core/nature/Nightfall.js).
const T = 1_758_999_000;

// A home with dry, gentle ground all around it.
function openHome() {
    const reach = RESIDENT_MOTION.wanderRadius + 2;
    for (let x = 0; x < 4000; x += 13) {
        const home = { x, z: 17 };
        let ok = true;
        for (let a = 0; a < 16 && ok; a++) {
            const angle = (a / 16) * Math.PI * 2;
            ok = isResidentWalkClear(SEED, home, { x: home.x + Math.sin(angle) * reach, z: home.z + Math.cos(angle) * reach });
        }
        if (ok) return home;
    }
    throw new Error('No open home found — fixture assumption broken');
}

function documentWith(world) {
    return new Document({ world, metadata: new DocumentMetadata({ title: 'Village', author: 'alice' }) });
}

function residentAt(id, worldId, x, z) {
    return new WorldResident({ id, worldId, authorIdentityId: 'alice', position: new Position(x, 0, z) });
}

// A wall two cubes high along Z at local x = `x`.
function wallAt(x, fromZ, toZ) {
    const building = new Building({ creator: 'alice' });
    for (let z = fromZ; z <= toZ; z++) {
        building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(x, 0.5, z) }));
        building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(x, 1.5, z) }));
    }
    return building;
}

function frameFacade() {
    const listeners = [];
    const synced = [];
    return {
        synced,
        onAnimationFrame(callback) {
            listeners.push(callback);
            return () => {};
        },
        fireFrame() {
            for (const callback of listeners) callback(0.016);
        },
        syncResidents(poses) {
            synced.push(poses);
        },
        addWorld() {}, removeWorld() {},
        getCameraState: () => ({ position: { x: 0, y: 10, z: 0 }, target: { x: 0, y: 0, z: 0 }, zoom: 1 }),
        setCameraState() {}
    };
}

function runTests() {
    const home = openHome();
    const registry = new CreateBrickRegistryUseCase().execute();

    // -------------------------------------------------------------
    // Section A — ResidentRuntime
    // -------------------------------------------------------------
    {
        const world = new World({ id: 'w-a' });
        const offset = { x: home.x - 5, y: 0, z: home.z + 2 };
        world.addResident(residentAt('near', 'w-a', 5, -2));       // home, in shared space
        world.addResident(residentAt('far', 'w-a', 5 + 500, -2));
        const loaded = new Map([['w-a', documentWith(world)]]);
        const runtime = new ResidentRuntime({ loadedDocuments: loaded, getWorldPosition: () => offset });
        const entries = runtime.residents();
        const near = entries.find((e) => e.id === 'near');
        assert(near && near.home.x === home.x && near.home.z === home.z, '1. A resident\'s home is lifted into shared space by its World\'s position');
        const poses = runtime.posesNear(home, 20, T);
        assert(poses.length === 1 && poses[0].id === 'near', '2. posesNear() finds only residents in range');
        assert(poses[0].worldId === 'w-a' && poses[0].documentId === 'w-a', '3. ...and says which World each lives in');
        assert(Math.hypot(poses[0].x - home.x, poses[0].z - home.z) <= RESIDENT_MOTION.wanderRadius, '4. ...where it is now, near its home');

        const crowd = new World({ id: 'w-crowd' });
        for (let i = 0; i < MAX_RENDERED_RESIDENTS + 5; i++) {
            crowd.addResident(residentAt(`r-${i}`, 'w-crowd', i * 0.5, 0));
        }
        const crowdRuntime = new ResidentRuntime({ loadedDocuments: new Map([['w-crowd', documentWith(crowd)]]), getWorldPosition: () => ({ x: home.x, y: 0, z: home.z }) });
        const nearest = crowdRuntime.posesNear(home, 60, T, { limit: MAX_RENDERED_RESIDENTS });
        assert(nearest.length === MAX_RENDERED_RESIDENTS, '5. A crowd is capped');
        const distances = nearest.map((p) => Math.hypot(p.x - home.x, p.z - home.z));
        assert(distances.every((d, i) => i === 0 || d >= distances[i - 1]), '6. ...nearest first');
        // A village of residents spread over 80 m: the nearest few, found
        // without posing everyone, are exactly the nearest few of everyone.
        const village = new World({ id: 'w-village' });
        for (let i = 0; i < 120; i++) {
            village.addResident(residentAt(`v-${i}`, 'w-village', (i % 12) * 7 - 40, Math.floor(i / 12) * 7 - 35));
        }
        const villageAt = { x: home.x, y: 0, z: home.z };
        const villageRuntime = new ResidentRuntime({ loadedDocuments: new Map([['w-village', documentWith(village)]]), getWorldPosition: () => villageAt });
        const allPosed = new ResidentRuntime({ loadedDocuments: new Map([['w-village', documentWith(village)]]), getWorldPosition: () => villageAt });
        for (const [dx, dz, t] of [[0, 0, 0], [13, -9, 37], [-30, 20, 401], [55, 41, 999]]) {
            const center = { x: home.x + dx, z: home.z + dz };
            const fast = villageRuntime.posesNear(center, 60, T + t, { limit: MAX_RENDERED_RESIDENTS }).map((p) => p.id);
            const every = allPosed.residents().map((entry) => allPosed.poseOf(entry, T + t))
                .map((pose) => ({ id: pose.id, distance: Math.hypot(pose.x - center.x, pose.z - center.z) }))
                .filter((p) => p.distance <= 60)
                .sort((a, b) => (a.distance - b.distance) || (a.id < b.id ? -1 : 1))
                .slice(0, MAX_RENDERED_RESIDENTS)
                .map((p) => p.id);
            assert(JSON.stringify(fast) === JSON.stringify(every), `6b. The nearest few are the same as posing everyone (${JSON.stringify(fast.slice(0, 3))}…)`);
        }
        const first = villageRuntime.posesNear(home, 20, T + 5);
        const again = villageRuntime.posesNear(home, 20, T + 5);
        assert(JSON.stringify(first) === JSON.stringify(again) && first[0] !== again[0], '6c. Asked twice about one moment, the same poses, each a fresh object');
        const later = villageRuntime.posesNear(home, 20, T + 6);
        assert(later.some((p, i) => first[i] && (p.x !== first[i].x || p.z !== first[i].z || p.id !== first[i].id)), '6d. A later moment is posed afresh');
        assert(new ResidentRuntime({ loadedDocuments: new Map(), getWorldPosition: () => null }).posesNear(home, 60, T).length === 0,
            '7. No loaded Worlds, no residents');
    }

    // -------------------------------------------------------------
    // Section B — a real wall
    // -------------------------------------------------------------
    {
        const world = new World({ id: 'w-b' });
        world.addBuilding(wallAt(2, -12, 12));
        world.addResident(residentAt('walled', 'w-b', 0, 0));
        const loaded = new Map([['w-b', documentWith(world)]]);
        const offset = { x: home.x, y: 0, z: home.z };
        const obstacles = new AvatarMovementConstraint({
            loadedDocuments: loaded, getWorldPosition: () => offset, brickRegistry: registry,
            queryRadius: RESIDENT_MOTION.wanderRadius + 1, maxStepHeight: 0.6
        });
        const boxes = obstacles.obstaclesNear({ x: home.x, y: 0, z: home.z }, { supportHeight: 0, avatarRadius: RESIDENT_COLLISION_RADIUS });
        assert(boxes.some((b) => b.min.y === 0) && boxes.some((b) => b.min.y === 1)
            && boxes.every((b) => Math.abs((b.min.z + b.max.z) / 2 - home.z) <= RESIDENT_MOTION.wanderRadius + 1 + 0.5 + RESIDENT_COLLISION_RADIUS),
            '8. The wall\'s bricks within a resident\'s reach are obstacles, as they are for an avatar on the ground');
        const runtime = new ResidentRuntime({
            loadedDocuments: loaded, getWorldPosition: () => offset,
            obstaclesNear: (position) => obstacles.obstaclesNear(position, { supportHeight: 0, avatarRadius: RESIDENT_COLLISION_RADIUS })
        });
        const wallFace = home.x + 1.5; // the cube at local x = 2 spans [1.5, 2.5]
        let farthest = 0;
        for (let t = 0; t < 3600; t += 0.25) {
            const [pose] = runtime.posesNear(home, 20, T + t);
            assert(pose.x <= wallFace - RESIDENT_COLLISION_RADIUS + 1e-9, '9. Over an hour, the resident never walks into or through the wall');
            farthest = Math.max(farthest, Math.hypot(pose.x - home.x, pose.z - home.z));
        }
        assert(farthest > 3, '10. ...while still strolling around on its side');
    }

    // -------------------------------------------------------------
    // Section C — AvatarResidentConstraint
    // -------------------------------------------------------------
    {
        const pose = { x: home.x, z: home.z };
        const runtime = { posesNear: () => [{ id: 'r', ...pose }] };
        const constraint = new AvatarResidentConstraint({ runtime, clock: () => T });
        const from = { x: home.x - 2, y: 0, z: home.z };
        const into = { x: home.x, y: 0, z: home.z };
        const result = constraint.apply(from, into, { avatarRadius: AVATAR_COLLISION_RADIUS });
        assert(result.collided && Math.hypot(result.position.x - home.x, result.position.z - home.z) >= AVATAR_COLLISION_RADIUS + RESIDENT_COLLISION_RADIUS - 1e-9,
            '11. Walking into a resident stops the avatar at its edge');
        const above = constraint.apply({ ...from, y: 3 }, { ...into, y: 3 });
        assert(!above.collided && above.position.x === into.x, '12. An avatar up on a roof walks over residents below');
        const away = constraint.apply({ x: home.x + 0.3, y: 0, z: home.z }, { x: home.x + 1, y: 0, z: home.z });
        assert(away.position.x === home.x + 1, '13. An avatar a resident strolled into can always walk away');
        const none = new AvatarResidentConstraint({ runtime: null }).apply(from, into);
        assert(!none.collided, '14. No runtime, no blocking');
    }

    // -------------------------------------------------------------
    // Section D — WorldNavigationSession
    // -------------------------------------------------------------
    {
        const identity = new LocalIdentityProvider(new InMemoryStorageProvider());
        identity.login('alice');
        const avatar = new AvatarPresenceSession({ avatarId: 'alice-avatar', ownerIdentity: 'alice' }, { position: new Position(home.x, 0, home.z) });
        const session = new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            identityProvider: identity, avatarPresenceSession: avatar, wildlifeClock: () => T
        });
        const facade = frameFacade();
        session._session = facade;
        const world = new World({ id: 'w-d' });
        session._loadedDocuments.set('w-d', documentWith(world));
        session._localPositions.set('w-d', { x: home.x - 10, y: 0, z: home.z - 10 });
        session._registerCommandHistory('w-d', new CommandHistory({ world }));
        session._activeDocumentId = 'w-d';

        assert(session.residentInteractionState().canAdd, '15. On open ground, a resident can be added');
        const id = session.toggleResidentHere();
        const added = world.getResident(id);
        assert(added && added.position.x === 10 && added.position.z === 10 && added.position.y === 0,
            '16. R adds a resident to the active World, homed at the avatar\'s feet in World-local coordinates');
        const [appeared] = session.residentsNearAvatar(5);
        assert(appeared && appeared.id === id && !appeared.moving && Math.hypot(appeared.x - home.x, appeared.z - home.z) <= 1.5,
            '16b. ...and appears right there, standing, not wherever its path would have taken it by now');
        const state = session.residentInteractionState();
        assert(state.canRemove && state.targetResidentId === id, '17. Standing next to it, R would remove it');

        session._setupResidentRendering();
        facade.fireFrame();
        const drawn = facade.synced[facade.synced.length - 1];
        assert(drawn.length === 1 && drawn[0].id === id, '18. Each frame, nearby residents go to the renderer');

        assert(session.toggleResidentHere() === id && world.getResident(id) === null, '19. R next to a resident removes it');
        session._commandHistories.get('w-d').undo();
        assert(world.getResident(id) !== null, '20. Undo brings it back');

        // Refusals: up on something, or in water.
        avatar.update({ position: new Position(home.x + 20, 2, home.z) });
        assert(session.residentInteractionState().refusal === RESIDENT_REFUSAL.NOT_ON_GROUND, '21. Standing up on something, adding is refused...');
        let threw = false;
        try { session.addResidentHere(); } catch { threw = true; }
        assert(threw && world.getResidents().length === 1, '22. ...and addResidentHere() throws without adding');

        // The key: rising edge only, errors swallowed.
        avatar.update({ position: new Position(home.x + 20, 0, home.z) });
        assert(session._processResidentInput('R', 'keydown') === true, '23. R is consumed');
        session._processResidentInput('R', 'keydown'); // key repeat
        assert(world.getResidents().length === 2, '24. ...and adds exactly one resident per press, however long it is held');
        session._processResidentInput('r', 'keyup');
        avatar.update({ position: new Position(home.x + 40, 2, home.z) });
        session._processResidentInput('r', 'keydown');
        assert(world.getResidents().length === 2, '25. A refused press does nothing and throws nothing');
        assert(session._processResidentInput('x', 'keydown') === false, '26. Other keys are not R');

        const signedOut = new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            identityProvider: new LocalIdentityProvider(new InMemoryStorageProvider()),
            avatarPresenceSession: new AvatarPresenceSession({ avatarId: 'x', ownerIdentity: 'x' }, { position: new Position(home.x, 0, home.z) }),
            wildlifeClock: () => T
        });
        signedOut._session = frameFacade();
        const other = new World({ id: 'w-e' });
        signedOut._loadedDocuments.set('w-e', documentWith(other));
        signedOut._localPositions.set('w-e', { x: 0, y: 0, z: 0 });
        signedOut._registerCommandHistory('w-e', new CommandHistory({ world: other }));
        signedOut._activeDocumentId = 'w-e';
        threw = false;
        try { signedOut.addResidentHere(); } catch { threw = true; }
        assert(threw && other.getResidents().length === 0, '27. Signed out, a resident can\'t be added');
    }

    // -------------------------------------------------------------
    // Section E — ResidentFieldRenderer
    // -------------------------------------------------------------
    {
        const template = CoreAvatarTemplateLibrary.templates.find((t) => t.templateId === RESIDENT_TEMPLATE_ID);
        const field = new ResidentFieldRenderer({
            appearanceFor: (id) => ({ template, appearance: residentAppearanceFor(id, template) }),
            groundAt: ({ x, z }) => ({ x, y: 4, z })
        });
        const standing = { id: 'r-1', x: 0, z: 0, rotationY: 0, moving: false, idleSeconds: 4, idleDuration: 8 };
        const first = field.sync([standing]);
        assert(first.added.length === 1 && first.removed.length === 0, '28. A new resident is added to the scene');
        const root = field.getObject('r-1');
        assert(root.position.y === 4, '29. ...with its feet on the rendered ground');
        assert(field.sync([standing]).added.length === 0, '30. ...once');

        const visual = () => field._entries.get('r-1').visual;
        field.sync([standing], { x: 0, z: RESIDENT_REACTION.waveRadius - 0.5 });
        assert(visual()._gestureKind === AvatarInteractionKind.WAVE, '31. Come close in front of it and it waves');
        field.tick(0.5);
        field.sync([standing], { x: 0, z: RESIDENT_REACTION.waveRadius - 0.6 });
        field.tick(3);
        assert(visual()._gestureKind === null, '32. The wave ends by itself');
        field.sync([standing], { x: 0, z: RESIDENT_REACTION.waveRadius - 0.7 });
        assert(visual()._gestureKind === null, '33. Staying close, it doesn\'t wave again');
        field.sync([standing], { x: 0, z: RESIDENT_REACTION.rearmRadius + 1 });
        field.sync([standing], { x: 0, z: 1 });
        assert(visual()._gestureKind === AvatarInteractionKind.WAVE, '34. Walk away and come back, and it waves again');

        const gaitBefore = visual()._animationTime;
        field.sync([{ ...standing, moving: true, idleSeconds: 0, idleDuration: 0 }]);
        field.sync([{ ...standing, x: 0.3, moving: true, idleSeconds: 0, idleDuration: 0 }]);
        field.tick(1);
        assert(Math.abs(visual()._animationTime - 0.1) < 1e-9 && gaitBefore >= 0,
            '35. Walking legs advance with the ground covered, not the clock');

        const gone = field.sync([]);
        assert(gone.removed.length === 1 && field.getObject('r-1') === null, '36. A resident out of range is removed');
        field.sync([standing]);
        assert(field.clear().length === 1 && field.trackedResidentIds().length === 0, '37. clear() hands back everything to remove');
    }

    // -------------------------------------------------------------
    // Section F — ready-made homes
    // -------------------------------------------------------------
    {
        // Somewhere with dry, gentle land all round, for a whole house.
        let offset = null;
        for (let x = 0; x < 8000 && !offset; x += 17) {
            let ok = true;
            for (let dx = -14; dx <= 14 && ok; dx++) {
                for (let dz = -14; dz <= 14 && ok; dz++) {
                    ok = isResidentGroundAt(SEED, x + dx, 17 + dz) && isResidentWalkClear(SEED, { x: x + dx, z: 17 + dz }, { x: x + dx + 1, z: 17 + dz });
                }
            }
            if (ok) offset = { x, y: 0, z: 17 };
        }
        assert(offset, '(fixture) open land for a house');
        const outcomes = new Map();
        for (const structure of VillageLibrary.structures.filter(isReadyMadeHome)) {
            const world = new World({ id: `w-${structure.id}` });
            const building = new Building({ creator: 'alice' });
            for (const brick of structure.bricks) {
                building.addBrick(new Brick({ definitionId: brick.definitionId, position: brick.position.clone(), rotation: brick.rotation, tilt: brick.tilt || 0 }));
            }
            world.addBuilding(building);
            const resident = moveInReadyMadeResident(world, structure, registry, () => `resident-of-${structure.id}`);
            if (!resident) continue;
            const loaded = new Map([[world.id, documentWith(world)]]);
            // As the session gathers them (application/worldNavigation/residentMethods.js).
            const obstacles = new AvatarMovementConstraint({
                loadedDocuments: loaded, getWorldPosition: () => offset, brickRegistry: registry,
                queryRadius: RESIDENT_OBSTACLE_QUERY_RADIUS, maxStepHeight: DEFAULT_MAX_STEP_HEIGHT
            });
            const obstaclesNear = (position) => obstacles.obstaclesNear(position, { supportHeight: 0, avatarRadius: RESIDENT_COLLISION_RADIUS });
            const runtime = new ResidentRuntime({ loadedDocuments: loaded, getWorldPosition: () => offset, obstaclesNear, seed: SEED });
            const homeAt = { x: resident.position.x + offset.x, z: resident.position.z + offset.z };
            const boxes = obstaclesNear({ x: homeAt.x, y: 0, z: homeAt.z });
            const bounds = SpatialBounds.fromBricks(structure.bricks, registry);
            const indoors = (p) => p.x > bounds.min.x + offset.x + 0.5 && p.x < bounds.max.x + offset.x - 0.5
                && p.z > bounds.min.z + offset.z + 0.5 && p.z < bounds.max.z + offset.z - 0.5;
            let previous = null;
            let away = 0;
            let inside = 0;
            let frames = 0;
            for (let t = 0; t < 800; t += 0.25) {
                const [pose] = runtime.posesNear(homeAt, 20, T + t);
                frames++;
                if (Math.hypot(pose.x - homeAt.x, pose.z - homeAt.z) > 2) away++;
                if (indoors(pose)) inside++;
                if (previous) {
                    assert(isResidentWalkClear(SEED, previous, pose, { boxes, radius: RESIDENT_COLLISION_RADIUS - 1e-6 }),
                        `56. A ready-made home's resident never walks through anything (${structure.id})`);
                }
                previous = pose;
            }
            outcomes.set(structure.id, { away: away / frames, inside: inside / frames });
        }
        assert(outcomes.size >= 3, '(fixture) the Village library\'s homes come lived in');
        assert(outcomes.get('village:garden_cottage').away > 0.5,
            `57. The garden cottage's resident gets out of its fenced garden and about (${outcomes.get('village:garden_cottage').away.toFixed(2)} of the time more than 2 m from home)`);
        assert(outcomes.get('village:large_house').inside > 0,
            '58. The large house\'s resident steps indoors through its front door, under the wall above it');
    }

    // -------------------------------------------------------------
    // Section G — edits nearby
    // -------------------------------------------------------------
    {
        const world = new World({ id: 'w-g' });
        world.addResident(residentAt('g1', 'w-g', 0, 0));
        world.addResident(residentAt('g2', 'w-g', 0.5, 0));
        const loaded = new Map([['w-g', documentWith(world)]]);
        const offset = { x: home.x, y: 0, z: home.z };
        // A wall across the resident's ground, 1 m east of home, whose height
        // the test sets: from the ground (in its way) or over its head.
        const wall = (minY, maxY) => [{
            min: { x: home.x + 1, y: minY, z: home.z - 8 },
            max: { x: home.x + 1.5, y: maxY, z: home.z + 8 }
        }];
        let boxes = wall(0, 2);
        let now = 0;
        const runtime = new ResidentRuntime({
            loadedDocuments: loaded, getWorldPosition: () => offset,
            obstaclesNear: () => boxes, now: () => now
        });
        const [entry, second] = runtime.residents();
        const underWall = { x: home.x + 1.25, z: home.z };
        const navigation = runtime._navigationFor(entry);
        assert(!navigation.isOpen(navigation.cellOf(underWall)), '59. (fixture) a wall from the ground is in a resident\'s way');

        // The same footprint, raised over its head: a way through.
        boxes = wall(RESIDENT_HEADROOM, RESIDENT_HEADROOM + 1);
        now += 2000;
        const raised = runtime._navigationFor(entry);
        assert(raised !== navigation && raised.isOpen(raised.cellOf(underWall)),
            '60. A brick raised over a resident\'s head, its footprint unchanged, opens a way on the next refresh');
        boxes = wall(0, 2);
        now += 2000;
        const lowered = runtime._navigationFor(entry);
        assert(lowered !== raised && !lowered.isOpen(lowered.cellOf(underWall)),
            '61. ...and lowered into its way again, closes it');
        now += 2000;
        assert(runtime._navigationFor(entry) === lowered, '62. The same bricks, heights and all, keep the same navigation');

        // invalidate(): looked at again before the timed refresh is due.
        // Right after a timed refresh (61-62), so only invalidate() can let
        // a resident look again this soon.
        runtime._navigationFor(second);
        boxes = wall(RESIDENT_HEADROOM, RESIDENT_HEADROOM + 1);
        assert(runtime._navigationFor(entry) === lowered, '(fixture) before the refresh is due, the old navigation stands');
        runtime.invalidate();
        const invalidated = runtime._navigationFor(entry);
        assert(invalidated !== lowered && invalidated.isOpen(invalidated.cellOf(underWall)),
            '63. After invalidate(), a resident looks at its bricks again at once');
        const secondBefore = runtime._paths.get('g2').navigation;
        assert(runtime._navigationFor(second) === secondBefore, '64. ...one resident per turn, so a crowd never refreshes in one frame');
        now += 50;
        const secondAfter = runtime._navigationFor(second);
        assert(secondAfter !== secondBefore && secondAfter.isOpen(secondAfter.cellOf(underWall)), '65. ...and the next on the next turn');
        runtime.invalidate();
        now += 50;
        assert(runtime._navigationFor(entry) === invalidated, '66. Invalidated with nothing changed nearby, a resident keeps its navigation and the ways it found');

        // WorldNavigationSession: every edit made here invalidates both.
        const identity = new LocalIdentityProvider(new InMemoryStorageProvider());
        identity.login('alice');
        const avatar = new AvatarPresenceSession({ avatarId: 'alice-avatar', ownerIdentity: 'alice' }, { position: new Position(home.x, 0, home.z) });
        const session = new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
            identityProvider: identity, avatarPresenceSession: avatar, wildlifeClock: () => T
        });
        session._session = frameFacade();
        const edited = new World({ id: 'w-g2' });
        session._loadedDocuments.set('w-g2', documentWith(edited));
        session._localPositions.set('w-g2', { x: home.x, y: 0, z: home.z });
        session._registerCommandHistory('w-g2', new CommandHistory({ world: edited }));
        session._activeDocumentId = 'w-g2';
        const counted = (instance) => {
            const original = instance.invalidate.bind(instance);
            instance.invalidations = 0;
            instance.invalidate = () => { instance.invalidations++; original(); };
            return instance;
        };
        const residents = counted(session._residentRuntime());
        const wildlife = counted(session._wildlifeDisplacement());
        session.toggleResidentHere();
        assert(residents.invalidations === 1 && wildlife.invalidations === 1, '67. An edit made in World View invalidates residents\' and wild animals\' bricks');
        const history = session._commandHistories.get('w-g2');
        history.undo();
        history.redo();
        assert(residents.invalidations === 3 && wildlife.invalidations === 3, '68. ...and so do its undo and redo');
    }

    console.log('✅ All Resident Integration tests passed.');
}

runTests();
