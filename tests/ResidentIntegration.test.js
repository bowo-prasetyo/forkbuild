import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { WorldResident } from '../core/WorldResident.js';
import { RESIDENT_MOTION } from '../core/ResidentMotion.js';
import { isResidentWalkClear, RESIDENT_COLLISION_RADIUS } from '../core/ResidentPath.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { AVATAR_COLLISION_RADIUS } from '../core/AvatarCollision.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { residentAppearanceFor, RESIDENT_TEMPLATE_ID } from '../core/ResidentAppearance.js';
import { AvatarInteractionKind } from '../core/AvatarInteractionKind.js';
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

const SEED = DEFAULT_WORLD_SEED;
const T = 1_759_000_000;

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

    console.log('✅ All Resident Integration tests passed.');
}

runTests();
