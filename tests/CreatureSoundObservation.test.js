// World View's creature sounds end to end: a real WorldNavigationSession's
// soundListener(), animalsForSound(), carriedAnimalsForSound(),
// residentsForSound() and creatureSoundObservation() feeding
// WorldSoundscapeService, with a real wild animal caught and released and a
// real resident talked to.
import { AvatarPresenceSession } from '../application/avatar/AvatarPresenceSession.js';
import { AvatarProfileUseCase } from '../application/avatar/AvatarProfileUseCase.js';
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { WorldSoundscapeService } from '../application/world/WorldSoundscapeService.js';
import { SoundSettingsStore } from '../application/settings/SoundSettingsStore.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { CommandHistory } from '../application/editor/CommandHistory.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { CREATURE_SOUND_CUE } from '../core/CreatureSoundCues.js';
import { wildlifeInRegionAt } from '../core/WildlifeMotion.js';
import { isResidentWalkClear } from '../core/ResidentPath.js';
import { RESIDENT_MOTION } from '../core/ResidentMotion.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { World } from '../core/World.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { RemoteAvatarRegistry } from '../application/avatar/RemoteAvatarRegistry.js';
import { terrainHeightAt } from '../core/TerrainHeightField.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

const SEED = DEFAULT_WORLD_SEED;
const T = 1_759_000_000;

// A wild animal standing still at T, so it can be walked up to and caught.
function findStandingAnimal() {
    for (let x = 0; x < 3000; x += 50) {
        const animals = wildlifeInRegionAt(SEED, x, 0, x + 50, 50, T).filter((a) => !a.moving);
        if (animals.length > 0) return animals[0];
    }
    throw new Error('no standing wild animal found — fixture assumption broken');
}

function findOpenHome() {
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
    throw new Error('no open home found');
}

class RecordingProvider {
    constructor() { this.creatureCues = []; }
    resume() {}
    setLayerLevels() {}
    setVolume() {}
    setMuted() {}
    setSpatial(spatial) { this.spatial = spatial; }
    setListener(pose) { this.listener = pose; }
    playCue() {}
    setEngine() {}
    setRemoteEngines(engines) { this.remoteEngines = engines; }
    playCreatureCue(cue) { this.creatureCues.push(cue); }
    playEditorCue(cue) { (this.editorCues ||= []).push(cue); }
    dispose() {}
}

const animal = findStandingAnimal();
const storage = new InMemoryStorageProvider();
const identityProvider = new LocalIdentityProvider(storage);
identityProvider.login('alice');
const templates = new AvatarTemplateRegistry();
templates.register(CoreAvatarTemplateLibrary);
const avatarProfileUseCase = new AvatarProfileUseCase(storage, identityProvider, templates);
const avatarPresenceSession = new AvatarPresenceSession(avatarProfileUseCase.getProfile(), { position: new Position(animal.x, 0, animal.z) });
const session = new WorldNavigationSession({
    registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: { getPosition: () => ({ x: 0, y: 0, z: 0 }) },
    identityProvider, avatarProfileUseCase, avatarPresenceSession, wildlifeClock: () => T
});
const frames = new Set();
session._session = {
    setLocalAvatar() {}, updateLocalAvatarAppearance() {}, updateLocalAvatarPresence() {}, setLocalAvatarVisible() {}, removeLocalAvatar() {},
    onAnimationFrame: (callback) => { frames.add(callback); return () => frames.delete(callback); },
    showResidentSpeech() {}, dispose() {}
};
// The camera stands south of the avatar looking north (+Z).
session._spatialCameraController = {
    getSpatialCameraState: () => {
        const p = avatarPresenceSession.current.position;
        return { position: { x: p.x, y: 10, z: p.z - 10 }, target: { x: p.x, y: 0, z: p.z }, zoom: 1 };
    }
};
session._setupLocalAvatar();
session.setAvatarControlMode(true);
const fire = () => { for (const callback of [...frames]) callback(1 / 60); };

const provider = new RecordingProvider();
const service = new WorldSoundscapeService({
    provider,
    settingsStore: new SoundSettingsStore({ storageProvider: new InMemoryStorageProvider() }),
    listenerPosition: () => session.getAvatarPosition(),
    seed: SEED,
    creatureObservation: () => session.creatureSoundObservation(),
    onCommandActivity: (listener) => session.onCommandActivity(listener),
    setIntervalFn: () => 1,
    clearIntervalFn: () => {}
});

// The listener is the avatar, facing where the camera looks.
{
    const listener = session.soundListener();
    assert(listener.position.x === animal.x && listener.position.z === animal.z, 'heard at the avatar');
    assert(Math.abs(listener.forward.x) < 1e-9 && Math.abs(listener.forward.z - 1) < 1e-9, 'facing the way the camera looks');
    const heard = session.animalsForSound(listener.position);
    assert(heard.some((a) => a.id === animal.id && a.species === animal.species), 'the wild animal beside the avatar is heard');
    assert(heard.every((a) => Math.hypot(a.x - animal.x, a.z - animal.z) <= 30), 'only animals within earshot');
    assert(session.residentsForSound(listener.position).length === 0, 'no residents yet');
    console.log('✓ listener and nearby animals');
}

// Catching and releasing it are heard.
{
    service.start();
    service.sampleCreatures();
    const press = () => {
        session.avatarKeyDown('f');
        fire();
        session.avatarKeyUp('f');
        fire();
    };
    press();
    assert(session.carriedAnimalsForSound().some((a) => a.species === animal.species), 'setup: caught it');
    assert(!session.animalsForSound(session.getAvatarPosition()).some((a) => a.id === animal.id), 'a caught animal is no longer heard where it stood');
    service.sampleCreatures();
    const caught = provider.creatureCues.filter((c) => c.kind === CREATURE_SOUND_CUE.CATCH);
    assert(caught.length === 1 && caught[0].species === animal.species, 'catching is heard');

    press();
    assert(session.carriedAnimalsForSound().length === 0, 'setup: released it');
    const released = session.animalsForSound(session.getAvatarPosition()).filter((a) => a.id !== animal.id && a.species === animal.species);
    assert(released.length >= 1, 'the released animal is heard where it now stands');
    service.sampleCreatures();
    assert(provider.creatureCues.filter((c) => c.kind === CREATURE_SOUND_CUE.RELEASE).length === 1, 'releasing is heard');
    console.log('✓ catch and release from the real session');
}

// A resident is heard talking.
{
    const home = findOpenHome();
    avatarPresenceSession.update({ position: new Position(home.x, 0, home.z) });
    const world = new World({ id: 'w-home' });
    session._loadedDocuments.set('w-home', new Document({ world, metadata: new DocumentMetadata({ title: 'Home' }) }));
    session._registerCommandHistory('w-home', new CommandHistory({ world }));
    session._activeDocumentId = 'w-home';
    const activity = [];
    const stopActivity = session.onCommandActivity((kind, command) => activity.push(`${kind}:${command.type}`));
    const id = session.addResidentHere();
    assert(id, 'setup: a resident lives here');
    assert(activity.join() === 'executed:create-world-resident', `adding a resident is reported (${activity})`);
    assert((provider.editorCues || []).join() === 'place', 'and heard like a placement');
    session.undo();
    session.redo();
    assert(activity.slice(1).join() === 'undone:create-world-resident,redone:create-world-resident', `undo and redo are reported (${activity})`);
    assert(provider.editorCues.slice(1).join() === 'undo,redo', 'and heard');
    stopActivity();
    assert(session.residentsForSound(session.getAvatarPosition()).some((r) => r.id === id), 'the resident is within earshot');
    service.sampleCreatures();
    const before = provider.creatureCues.length;
    session.talkToNearestResident();
    service.sampleCreatures();
    const spoken = provider.creatureCues.slice(before).filter((c) => c.kind === CREATURE_SOUND_CUE.RESIDENT_SPEECH);
    assert(spoken.length === 1 && spoken[0].syllables >= 3, 'talking to it, it is heard murmuring');
    service.sampleCreatures();
    assert(provider.creatureCues.slice(before).filter((c) => c.kind === CREATURE_SOUND_CUE.RESIDENT_SPEECH).length === 1, 'once per thing said');
    console.log('✓ a resident talking from the real session');
}

// The 3D listener: at the avatar's ears where it is drawn, facing where the
// camera looks, pitch included, with up perpendicular to that.
{
    const pose = session.soundListenerPose();
    const p = avatarPresenceSession.current.position;
    assert(Math.abs(pose.position.y - (terrainHeightAt(SEED, p.x, p.z) + p.y + 1.6)) < 1e-9, 'the listener is at ear height above the drawn ground');
    // The camera is 10 up and 10 back, looking down at the avatar at 45 degrees.
    assert(Math.abs(pose.forward.z - Math.SQRT1_2) < 1e-9 && Math.abs(pose.forward.y + Math.SQRT1_2) < 1e-9, 'forward follows the camera, looking down');
    const dot = pose.forward.x * pose.up.x + pose.forward.y * pose.up.y + pose.forward.z * pose.up.z;
    assert(Math.abs(dot) < 1e-9 && pose.up.y > 0, 'up is perpendicular to forward, and upward');
    console.log('✓ the 3D listener pose');
}

// Other players, from the real remote-avatar registry: heard walking, placed
// where they are drawn; not heard while other avatars are hidden.
{
    const facade = { setRemoteAvatar() {}, removeRemoteAvatar() {}, updateRemoteAvatarPresence() {} };
    const registry = new RemoteAvatarRegistry(facade);
    session._remoteAvatarRegistry = registry;
    const here = avatarPresenceSession.current.position;
    let sequence = 1;
    const advertise = (x, animation, now) => registry.sync([{ advertisement: {
        avatarId: 'bob-avatar', ownerIdentity: 'bob', position: { x, y: 0, z: here.z + 6 },
        rotation: { x: 0, y: 0, z: 0 }, animation, sequence: sequence++
    } }], now);
    const t0 = Date.now() - 10_000;
    advertise(here.x, 'walking', t0);
    const heard = session.remoteAvatarsForSound(session.getAvatarPosition());
    assert(heard.length === 1 && heard[0].id === 'bob-avatar' && heard[0].animation === 'walking', 'another player nearby is heard');
    assert(Math.abs(heard[0].y - terrainHeightAt(SEED, heard[0].position.x, heard[0].position.z)) < 1e-9, 'at the height they are drawn');

    const before = provider.creatureCues.length;
    service.sampleCreatures(0.1);
    for (let i = 1; i <= 20; i++) {
        advertise(here.x + 0.3 * i, 'walking', t0 + i * 1000);
        service.sampleCreatures(0.1);
    }
    const steps = provider.creatureCues.slice(before).filter((c) => c.kind === CREATURE_SOUND_CUE.PLAYER_FOOTSTEP);
    assert(steps.length >= 5, `their footsteps are heard (${steps.length})`);
    assert(steps.every((c) => c.position && c.position.z === here.z + 6), 'from where they are');

    session.setRemoteAvatarsVisible(false);
    assert(session.remoteAvatarsForSound(session.getAvatarPosition()).length === 0, 'hidden players are not heard');
    session.setRemoteAvatarsVisible(true);
    session._remoteAvatarRegistry = null;
    console.log('✓ other players from the real registry');
}

// Creatures are looked at ten times a second through render frames.
{
    const counting = new RecordingProvider();
    let looks = 0;
    const frameListeners = [];
    const paced = new WorldSoundscapeService({
        provider: counting,
        settingsStore: new SoundSettingsStore({ storageProvider: new InMemoryStorageProvider() }),
        listenerPosition: () => null,
        seed: SEED,
        creatureObservation: () => { looks++; return null; },
        onRenderFrame: (callback) => { frameListeners.push(callback); return () => {}; },
        setIntervalFn: () => 1,
        clearIntervalFn: () => {}
    });
    paced.start();
    for (let i = 0; i < 60; i++) frameListeners[0](1 / 60);
    assert(looks >= 9 && looks <= 11, `about ten looks a second (${looks})`);
    paced.dispose();
    console.log('✓ creatures sampled ten times a second');
}
service.dispose();
