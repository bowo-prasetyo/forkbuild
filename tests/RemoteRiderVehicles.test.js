// Other players' vehicles end to end: two real WorldNavigationSessions joined
// by an in-memory channel per protocol. Alice gets on a real bicycle; Bob is
// told, draws it under her (not his own copy of it) and can't mount it; when
// she gets off, it goes. Plus the riding message's signing and trust checks.
import { AvatarPresenceSession } from '../application/avatar/AvatarPresenceSession.js';
import { AvatarProfileUseCase } from '../application/avatar/AvatarProfileUseCase.js';
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { AvatarVehicleTrustBoundary } from '../application/avatar/AvatarVehicleTrustBoundary.js';
import { signAvatarVehicleAdvertisement } from '../application/avatar/AvatarVehicleSigning.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import {
    toAvatarVehicleAdvertisement, isValidAvatarVehicleAdvertisement, getAvatarVehicleSigningDescriptor
} from '../core/AvatarVehicleAdvertisement.js';
import { TrustStatus } from '../core/TrustObservation.js';
import { vehiclePresenceInRegion } from '../core/VehiclePlacement.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { Position } from '../core/Position.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// One in-memory channel: whatever one end advertises, every other end hears.
class Channel {
    constructor() { this.listeners = new Set(); this.sent = []; }
    end() {
        const channel = this;
        const own = new Set();
        return {
            advertise(advertisement) {
                channel.sent.push(advertisement);
                for (const listener of channel.listeners) {
                    if (!own.has(listener)) listener(JSON.parse(JSON.stringify(advertisement)));
                }
            },
            onAdvertisement(callback) {
                own.add(callback);
                channel.listeners.add(callback);
                return () => { own.delete(callback); channel.listeners.delete(callback); };
            },
            dispose() {}
        };
    }
}

function identityFor(name) {
    const storage = new InMemoryStorageProvider();
    const identityProvider = new LocalIdentityProvider(storage);
    identityProvider.login(name);
    return { storage, identityProvider };
}

// Unsigned ones are tolerated, but these tests sign, as a logged-in player does.
function signingIdentity(name) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(name);
    provider.authenticate(identity.identityId);
    return { provider, identity };
}

// Section A — the message itself.
{
    const riding = toAvatarVehicleAdvertisement({ avatarId: 'a1', ownerIdentity: 'o1', vehicleId: 'vehicle:1:2,3', vehicleType: 'car', sequence: 5 });
    assert(riding.riding === true && riding.vehicleType === 'car' && isValidAvatarVehicleAdvertisement(riding), 'a riding claim');
    const off = toAvatarVehicleAdvertisement({ avatarId: 'a1', ownerIdentity: 'o1', sequence: 6 });
    assert(off.riding === false && off.vehicleId === null && isValidAvatarVehicleAdvertisement(off), 'an on-foot claim carries no vehicle');
    assert(toAvatarVehicleAdvertisement({ avatarId: 'a1', vehicleId: 'x', vehicleType: 'spaceship', sequence: 1 }).riding === false,
        'an unknown vehicle type is not riding');
    for (const bad of [
        null, {}, { ...riding, sequence: 'x' }, { ...riding, vehicleType: 'spaceship' }, { ...riding, vehicleId: '' },
        { ...riding, vehicleId: 'v'.repeat(201) }, { ...off, vehicleId: 'v' }, { ...riding, riding: 'yes' }
    ]) {
        assert(!isValidAvatarVehicleAdvertisement(bad), `rejected as malformed: ${JSON.stringify(bad)}`);
    }
    const payload = getAvatarVehicleSigningDescriptor(riding).payload;
    assert(Object.keys(payload).sort().join() === 'avatarId,ownerIdentity,riding,sequence,vehicleId,vehicleType', 'the signature covers every field');
    console.log('✓ the riding message');
}

// Section B — trust: signatures, blocking, authority, replay, equivocation, order.
{
    const alice = signingIdentity('Alice');
    const mallory = signingIdentity('Mallory');
    const claim = (sequence, extra = {}) => toAvatarVehicleAdvertisement({
        avatarId: 'alice-avatar', ownerIdentity: alice.identity.identityId,
        vehicleId: 'vehicle:1:0,0', vehicleType: 'bicycle', sequence, ...extra
    });
    const signed = (sequence, by = alice.provider, extra = {}) => signAvatarVehicleAdvertisement(claim(sequence, extra), by);

    const boundary = new AvatarVehicleTrustBoundary();
    const first = signed(10);
    assert(first.signature, 'setup: signed');
    assert(boundary.evaluate(first, null).accepted, 'a signed claim is accepted');
    const tampered = { ...signed(11), vehicleType: 'car' };
    assert(boundary.evaluate(tampered, first).observation.status === TrustStatus.INVALID_SIGNATURE, 'a tampered claim is refused');
    assert(boundary.evaluate(signed(12, mallory.provider), first).observation.status === TrustStatus.UNAUTHORIZED,
        'another signer for the same avatar is refused');
    const unsignedAfterSigned = claim(13);
    assert(boundary.evaluate(unsignedAfterSigned, first).observation.status === TrustStatus.UNAUTHORIZED,
        'an unsigned claim for a signed avatar is refused');
    assert(boundary.evaluate(first, null).observation.status === TrustStatus.REPLAYED, 'a replay is refused');
    const older = signed(9);
    assert(boundary.evaluate(older, first).observation.status === TrustStatus.STALE, 'an older claim is refused');
    const sameSequence = signed(10, alice.provider, { vehicleId: 'vehicle:1:9,9' });
    assert(boundary.evaluate(sameSequence, first).observation.status === TrustStatus.EQUIVOCATING, 'two claims at one sequence are refused');
    assert(boundary.evaluate(signed(14), first).accepted, 'a newer one is accepted');

    const blocking = new AvatarVehicleTrustBoundary({ isBlocked: (signer) => signer === alice.identity.identityId });
    assert(blocking.evaluate(signed(20), null).observation.status === TrustStatus.BLOCKED, 'a blocked signer is refused');
    const tolerant = new AvatarVehicleTrustBoundary();
    assert(tolerant.evaluate(claim(1), null).accepted, 'an unsigned claim is tolerated, as presence is');
    assert(tolerant.evaluate({ nonsense: true }, null).observation.status === TrustStatus.UNAVAILABLE, 'nonsense is refused');
    console.log('✓ trust: signatures, blocking, authority, replay, equivocation and order');
}

// Section C — two real sessions.
const REAL_VEHICLE_ID = 'vehicle:1179337264:-8,-1';
const vehicle = vehiclePresenceInRegion(DEFAULT_WORLD_SEED, -500, -500, 500, 500).find((v) => v.id === REAL_VEHICLE_ID);
assert(vehicle, `fixture vehicle ${REAL_VEHICLE_ID} exists`);

const channels = { presence: new Channel(), profile: new Channel(), interaction: new Channel(), vehicle: new Channel() };

function facade(name) {
    const log = { riding: new Map(), synced: [], frames: new Set() };
    return {
        log,
        setLocalAvatar() {}, updateLocalAvatarAppearance() {}, updateLocalAvatarPresence() {},
        setLocalAvatarVisible() {}, removeLocalAvatar() {},
        setRemoteAvatar() {}, updateRemoteAvatarPresence() {}, removeRemoteAvatar() {}, setRemoteAvatarsVisible() {},
        updateRemoteAvatarAppearance() {}, setRemoteAvatarGesture() {},
        setRemoteAvatarVehicle(avatarId, vehicleType) { log.riding.set(avatarId, vehicleType); },
        onAnimationFrame(callback) { log.frames.add(callback); return () => log.frames.delete(callback); },
        getCameraState: () => ({ position: { x: 10, y: 10, z: 10 }, target: { x: 0, y: 0, z: 0 }, zoom: 1 }),
        setCameraState() {},
        syncVehicles(instances) { log.synced = instances.map((instance) => instance.id); },
        dispose() {}
    };
}

function buildSession(name, start) {
    const { storage, identityProvider } = identityFor(name);
    const templates = new AvatarTemplateRegistry();
    templates.register(CoreAvatarTemplateLibrary);
    const avatarProfileUseCase = new AvatarProfileUseCase(storage, identityProvider, templates);
    const avatarPresenceSession = new AvatarPresenceSession(avatarProfileUseCase.getProfile(), { position: start });
    const session = new WorldNavigationSession({
        registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
        identityProvider, avatarProfileUseCase, avatarPresenceSession, avatarTemplateRegistry: templates,
        presenceBroadcastProvider: channels.presence.end(),
        avatarProfileBroadcastProvider: channels.profile.end(),
        avatarInteractionBroadcastProvider: channels.interaction.end(),
        avatarVehicleBroadcastProvider: channels.vehicle.end()
    });
    const render = facade(name);
    session._session = render;
    session._setupRemoteAvatars();
    session._setupLocalAvatar();
    session._setupVehicleRendering();
    session.setAvatarControlMode(true);
    return { session, render, avatarPresenceSession };
}

const alice = buildSession('alice', new Position(vehicle.position.x - 0.5, 0, vehicle.position.z));
const bob = buildSession('bob', new Position(vehicle.position.x - 1, 0, vehicle.position.z + 1));
const fire = (...parties) => { for (const party of parties) for (const callback of [...party.render.log.frames]) callback(0.016); };

{
    const aliceId = alice.avatarPresenceSession.current.avatarId;
    fire(alice, bob);
    fire(alice, bob);
    assert(bob.render.log.synced.includes(REAL_VEHICLE_ID), 'setup: Bob draws the bicycle where it stands');
    assert(bob.render.log.riding.get(aliceId) === null, 'Bob sees Alice on foot');
    assert(channels.vehicle.sent.some((a) => a.avatarId === aliceId && a.riding === false && a.signature), 'Alice says, signed, that she is on foot');

    alice.session.avatarKeyDown('e');
    fire(alice);
    alice.session.avatarKeyUp('e');
    fire(alice, bob);
    assert(alice.session.avatarVehicleMount() && alice.session.avatarVehicleMount().vehicleId === REAL_VEHICLE_ID, 'setup: Alice gets on');
    const told = channels.vehicle.sent.filter((a) => a.avatarId === aliceId && a.riding);
    assert(told.length === 1 && told[0].vehicleId === REAL_VEHICLE_ID && told[0].vehicleType === vehicle.type, 'getting on is told at once');
    assert(bob.render.log.riding.get(aliceId) === vehicle.type, `Bob draws Alice on a ${vehicle.type}`);
    assert(bob.session.remoteAvatarVehicle(aliceId).vehicleId === REAL_VEHICLE_ID, 'Bob knows which one');
    assert(!bob.render.log.synced.includes(REAL_VEHICLE_ID), 'Bob no longer draws his own copy of it');
    assert(alice.render.log.synced.includes(REAL_VEHICLE_ID), 'Alice still draws the bicycle she rides');
    const heardRiding = bob.session.remoteAvatarsForSound(bob.session.getAvatarPosition()).find((p) => p.id === aliceId);
    assert(heardRiding && heardRiding.vehicleType === vehicle.type, 'Bob hears Alice riding it');
    assert(heardRiding.y === heardRiding.position.y, 'at the height she is drawn: a rider\'s position already carries the ground');

    bob.session.avatarKeyDown('e');
    fire(bob);
    bob.session.avatarKeyUp('e');
    assert(bob.session.avatarVehicleMount() === null || bob.session.avatarVehicleMount().vehicleId !== REAL_VEHICLE_ID,
        'Bob cannot get on the bicycle Alice is riding');

    const sentBefore = channels.vehicle.sent.filter((a) => a.avatarId === aliceId).length;
    fire(alice);
    assert(channels.vehicle.sent.filter((a) => a.avatarId === aliceId).length === sentBefore, 'nothing new is sent while nothing changes');
    alice.session._lastVehicleAdvertisedAt -= 2500;
    fire(alice);
    assert(channels.vehicle.sent.filter((a) => a.avatarId === aliceId).length === sentBefore + 1, 'it is sent again with the heartbeat');

    alice.session.avatarKeyDown('e');
    fire(alice);
    alice.session.avatarKeyUp('e');
    fire(alice, bob);
    assert(alice.session.avatarVehicleMount() === null, 'setup: Alice gets off');
    assert(bob.render.log.riding.get(aliceId) === null, 'Bob sees her on foot again');
    assert(bob.render.log.synced.includes(REAL_VEHICLE_ID), 'and draws the bicycle where his replica had it');
    assert(bob.session.remoteAvatarsForSound(bob.session.getAvatarPosition()).find((p) => p.id === aliceId).vehicleType === null,
        'and hears her on foot');
    console.log('✓ two sessions: getting on, drawn for the other, not mountable, heartbeat, getting off');
}

// Hidden presence sends nothing, and a departed rider is forgotten.
{
    const aliceId = alice.avatarPresenceSession.current.avatarId;
    bob.session._avatarVehicleSyncService.retainOnly([]);
    assert(bob.session.remoteAvatarVehicle(aliceId) === null, 'an avatar no longer present is forgotten');
    alice.session.dispose();
    bob.session.dispose();
    console.log('✓ departed riders are forgotten');
}
