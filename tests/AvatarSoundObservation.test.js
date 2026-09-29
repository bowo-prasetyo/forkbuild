// World View's avatar sounds end to end: a real WorldNavigationSession's
// avatarSoundObservation() and onRenderFrame() feeding WorldSoundscapeService.
import { AvatarPresenceSession } from '../application/avatar/AvatarPresenceSession.js';
import { AvatarProfileUseCase } from '../application/avatar/AvatarProfileUseCase.js';
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { WorldSoundscapeService } from '../application/world/WorldSoundscapeService.js';
import { SoundSettingsStore } from '../application/settings/SoundSettingsStore.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarAnimationState } from '../core/AvatarAnimationState.js';
import { AvatarVerticalState } from '../core/AvatarVerticalState.js';
import { vehiclePresenceInRegion } from '../core/VehiclePlacement.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { Position } from '../core/Position.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

const REAL_VEHICLE_ID = 'vehicle:1179337264:-8,-1';

function facade(frameCallbacks) {
    return {
        setLocalAvatar() {}, updateLocalAvatarAppearance() {}, updateLocalAvatarPresence() {},
        setLocalAvatarVisible() {}, removeLocalAvatar() {},
        onAnimationFrame: (callback) => {
            frameCallbacks.add(callback);
            return () => frameCallbacks.delete(callback);
        },
        getCameraState: () => ({ position: { x: 10, y: 10, z: 10 }, target: { x: 0, y: 0, z: 0 }, zoom: 1 }),
        setCameraState() {},
        syncVehicles() {},
        dispose() {}
    };
}

function buildSession(startPosition, frameCallbacks) {
    const storage = new InMemoryStorageProvider();
    const identityProvider = new LocalIdentityProvider(storage);
    identityProvider.login('sound-tester');
    const registry = new AvatarTemplateRegistry();
    registry.register(CoreAvatarTemplateLibrary);
    const avatarProfileUseCase = new AvatarProfileUseCase(storage, identityProvider, registry);
    const avatarPresenceSession = new AvatarPresenceSession(avatarProfileUseCase.getProfile(), { position: startPosition });
    const session = new WorldNavigationSession({
        registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
        avatarProfileUseCase, avatarPresenceSession
    });
    session._session = facade(frameCallbacks);
    session._setupLocalAvatar();
    session._setupVehicleRendering();
    session.setAvatarControlMode(true);
    return session;
}

class RecordingProvider {
    constructor() { this.cues = []; this.engines = []; }
    resume() {}
    setLayerLevels() {}
    setVolume() {}
    setMuted() {}
    playCue(cue) { this.cues.push(cue); }
    setEngine(engine) { this.engines.push(engine); }
    dispose() {}
}

const vehicle = vehiclePresenceInRegion(DEFAULT_WORLD_SEED, -500, -500, 500, 500).find((v) => v.id === REAL_VEHICLE_ID);
assert(vehicle, `fixture vehicle ${REAL_VEHICLE_ID} exists`);
const frameCallbacks = new Set();
const session = buildSession(new Position(vehicle.position.x - 0.5, 0, vehicle.position.z), frameCallbacks);
const fire = (seconds) => { for (const callback of [...frameCallbacks]) callback(seconds); };

// The observation reports what the avatar is doing.
{
    const idle = session.avatarSoundObservation();
    assert(idle.animation === AvatarAnimationState.IDLE, 'standing still is idle');
    assert(idle.verticalState === AvatarVerticalState.SUPPORTED, 'standing on the ground is supported');
    assert(idle.vehicleType === null, 'on foot there is no vehicle');
    console.log('✓ avatarSoundObservation() reports the avatar');
}

// A soundscape on the session's own frames hears footsteps, a jump and a landing.
const provider = new RecordingProvider();
const service = new WorldSoundscapeService({
    provider,
    settingsStore: new SoundSettingsStore({ storageProvider: new InMemoryStorageProvider() }),
    listenerPosition: () => session.getAvatarPosition(),
    seed: DEFAULT_WORLD_SEED,
    avatarObservation: () => session.avatarSoundObservation(),
    onRenderFrame: (callback) => session.onRenderFrame(callback),
    setIntervalFn: () => 1,
    clearIntervalFn: () => {}
});
service.start();
{
    session.avatarKeyDown('s');
    for (let i = 0; i < 60; i++) fire(1 / 60);
    session.avatarKeyUp('s');
    for (let i = 0; i < 10; i++) fire(1 / 60);
    const steps = provider.cues.filter((c) => c.kind === 'footstep').length;
    assert(steps >= 2, `walking for a second is heard (${steps} footsteps)`);

    provider.cues.length = 0;
    session.avatarKeyDown(' ');
    fire(1 / 60);
    fire(1 / 60);
    session.avatarKeyUp(' ');
    assert(session.avatarSoundObservation().verticalState === AvatarVerticalState.RISING, 'a jump rises');
    for (let i = 0; i < 180; i++) fire(1 / 60);
    const kinds = provider.cues.map((c) => c.kind);
    assert(kinds.includes('jump') && kinds.includes('land') && kinds.indexOf('jump') < kinds.indexOf('land'),
        `a jump is heard leaving and landing (${kinds.join(',')})`);
    console.log('✓ footsteps, jump and landing from the real session');
}

// Riding a vehicle is heard as its engine, and dismounting stops it. A fresh
// session beside the vehicle, ridden as tests/AvatarVehicleAwareDismount.test.js
// rides it (58 frames clears the trees for the dismount).
{
    const riderFrames = new Set();
    const rider = buildSession(new Position(vehicle.position.x - 0.5, 0, vehicle.position.z), riderFrames);
    const fireRider = (seconds) => { for (const callback of [...riderFrames]) callback(seconds); };
    const riderProvider = new RecordingProvider();
    const riderSound = new WorldSoundscapeService({
        provider: riderProvider,
        settingsStore: new SoundSettingsStore({ storageProvider: new InMemoryStorageProvider() }),
        listenerPosition: () => rider.getAvatarPosition(),
        seed: DEFAULT_WORLD_SEED,
        avatarObservation: () => rider.avatarSoundObservation(),
        onRenderFrame: (callback) => rider.onRenderFrame(callback),
        setIntervalFn: () => 1,
        clearIntervalFn: () => {}
    });
    riderSound.start();
    fireRider(0.016);
    rider.avatarKeyDown('e');
    fireRider(0.016);
    rider.avatarKeyUp('e');
    assert(rider.avatarVehicleMount() !== null, 'setup: mounted the fixture vehicle');
    assert(rider.avatarSoundObservation().vehicleType === vehicle.type, `riding reports the ${vehicle.type}`);

    rider.avatarKeyDown('w');
    for (let i = 0; i < 58; i++) fireRider(0.05);
    rider.avatarKeyUp('w');
    const engines = riderProvider.engines.filter(Boolean);
    assert(engines.length > 0 && engines.every((e) => e.vehicleType === vehicle.type), `riding plays the ${vehicle.type}`);
    assert(Math.max(...engines.map((e) => e.load)) > 0.3, 'riding along works the engine');
    assert(riderProvider.cues.length === 0, 'riding makes no footsteps');

    rider.avatarKeyDown('e');
    fireRider(0.016);
    rider.avatarKeyUp('e');
    fireRider(0.016);
    assert(rider.avatarVehicleMount() === null, 'setup: dismounted');
    assert(riderProvider.engines[riderProvider.engines.length - 1] === null, 'dismounting stops the engine');
    riderSound.dispose();
    console.log('✓ vehicle engine from the real session');
}

service.dispose();
assert(frameCallbacks.size > 0, 'the session keeps its own frame listeners');
const before = provider.cues.length;
session.avatarKeyDown('w');
for (let i = 0; i < 30; i++) fire(1 / 60);
assert(provider.cues.length === before, 'a disposed soundscape no longer listens to frames');
console.log('✓ disposing the soundscape unsubscribes from frames');
