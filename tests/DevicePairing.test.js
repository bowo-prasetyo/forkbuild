// Copying builds to another device by a pairing code (application/
// devicePairing/DevicePairing.js): two devices, real WebRTC
// (node-datachannel), the app's discovery stack over an in-memory
// rendezvous network, and the real backup use case on both sides.
import {
    DevicePairing, DevicePairingFailure, DevicePairingStatus, DEVICE_PAIRING_PROTOCOL
} from '../application/devicePairing/DevicePairing.js';
import { DeviceBackupUseCase } from '../application/backup/DeviceBackupUseCase.js';
import { WebRtcPeerConnectionProvider } from '../peer/WebRtcPeerConnectionProvider.js';
import { LocalRendezvousNetwork } from '../peer/LocalRendezvousNetwork.js';
import { EphemeralIdentityProvider } from '../identity/EphemeralIdentityProvider.js';
import {
    createDevicePairingCode, devicePairingLink, parseDevicePairingCode, randomDevicePairingSecret
} from '../core/DevicePairingCode.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

const DOC_A = '11111111-1111-4111-8111-111111111111';
const DOC_B = '22222222-2222-4222-8222-222222222222';

function makeDevice(network, { connectTimeoutMs, ttlMs } = {}) {
    const storage = new InMemoryStorageProvider();
    const peerConnectionProvider = new WebRtcPeerConnectionProvider();
    const pairing = new DevicePairing({
        deviceBackup: new DeviceBackupUseCase({ storageProvider: storage }),
        peerConnectionProvider,
        rendezvousTransports: network ? [network] : [],
        answerPollIntervalMs: 50,
        answerWatchIntervalMs: 50,
        ...(connectTimeoutMs ? { connectTimeoutMs } : {}),
        ...(ttlMs ? { ttlMs } : {})
    });
    return { storage, pairing, peerConnectionProvider };
}

function waitForStatus(side, statuses, timeoutMs = 20000) {
    const wanted = Array.isArray(statuses) ? statuses : [statuses];
    return new Promise((resolve, reject) => {
        if (wanted.includes(side.state.status)) return resolve(side.state);
        const timer = setTimeout(() => {
            unsubscribe();
            reject(new Error(`ASSERT FAILED: expected ${wanted.join('/')}, still ${side.state.status}`));
        }, timeoutMs);
        const unsubscribe = side.onChange((state) => {
            if (wanted.includes(state.status)) {
                clearTimeout(timer);
                unsubscribe();
                resolve(state);
            }
        });
    });
}

// The code: a one-off identity's key and a secret, as one link segment.
{
    const identity = new EphemeralIdentityProvider();
    const secret = randomDevicePairingSecret();
    const code = createDevicePairingCode({ identityId: identity.identityId, secret });
    assert(/^[A-Za-z0-9_-]{87}$/.test(code), 'the code is 87 base64url characters');
    const parsed = parseDevicePairingCode(code);
    assert(parsed.identityId === identity.identityId, 'the code names the one-off identity');
    assert(parsed.secret.length === 32 && parsed.secret.every((byte, i) => byte === secret[i]), 'and carries the secret');
    assert(typeof parsed.passphrase === 'string' && parsed.passphrase.length === 43, 'the secret as text opens the backup');
    assert(parseDevicePairingCode(code.slice(1)) === null, 'a cut code is refused');
    assert(code.startsWith('A') && parseDevicePairingCode('B' + code.slice(1)) === null, 'a code of another format version is refused');
    assert(parseDevicePairingCode(null) === null, 'no code is refused');
    assert(devicePairingLink(code, 'https://example.org/forkbuild/#/settings/data') === `https://example.org/forkbuild/#/pair/${code}`,
        'the link puts the code after # in the app\'s own address');
    console.log('✓ a pairing code names a one-off identity and carries a secret');
}

// The one-off identity signs like a signed-in identity, and is fresh each time.
{
    const a = new EphemeralIdentityProvider();
    const b = new EphemeralIdentityProvider();
    assert(a.identityId !== b.identityId && a.identityId.startsWith('did:key:z'), 'each pairing gets its own did:key');
    assert(a.isAuthenticated() && a.getSigningIdentity().id === a.identityId, 'always signed in as itself');
    const signature = a.signCanonical({ type: 'test', id: 'x', payload: { n: 1 } });
    assert(signature.signer === a.identityId && /^[0-9a-f]{128}$/.test(signature.signature), 'signs with its own key');
    console.log('✓ the one-off identity signs as itself');
}

// End to end: one device shows a code, the other opens it, receives every
// build and adds it, keeping what it already had.
{
    const network = new LocalRendezvousNetwork();
    const laptop = makeDevice(network);
    const phone = makeDevice(network);
    laptop.storage.save(DOC_A, { world: 'from the laptop' });
    laptop.storage.save(DOC_B, { world: 'laptop version of B' });
    laptop.storage.save('forkbuild-index', [{ id: DOC_A, title: 'A' }, { id: DOC_B, title: 'B' }]);
    laptop.storage.save('personal-structure:s1', { name: 'Tower' });
    laptop.storage.save('local-session', { identityId: 'did:key:z6Mk-laptop' });
    phone.storage.save(DOC_B, { world: 'phone version of B' });
    phone.storage.save('forkbuild-index', [{ id: DOC_B, title: 'B on the phone' }]);

    const sender = laptop.pairing.createSender();
    await sender.start();
    assert(sender.state.status === DevicePairingStatus.WAITING, 'the laptop waits with a code to show');
    assert(sender.state.expiresAt instanceof Date && sender.state.expiresAt.getTime() > Date.now(), 'the code says when it expires');
    const { code } = sender.state;
    const published = await network.lookup(parseDevicePairingCode(code).identityId);
    assert(published.length === 1, 'the rendezvous network holds the laptop\'s offer under the one-off identity');
    assert(!JSON.stringify(published).includes(parseDevicePairingCode(code).passphrase), 'and never the secret');

    const receiver = phone.pairing.createReceiver(code);
    const statuses = [];
    receiver.onChange((state) => statuses.push(state.status));
    await receiver.start();
    const received = await waitForStatus(receiver, DevicePairingStatus.RECEIVED);
    assert(statuses.includes(DevicePairingStatus.CONNECTING), 'the phone connects first');
    assert(received.groups && received.groups.documents === 3, `the phone sees what arrived (two builds and their list) before adding it (${JSON.stringify(received.groups)})`);
    assert(!phone.storage.exists(DOC_A), 'nothing is added until the person says so');
    const sent = await waitForStatus(sender, DevicePairingStatus.SENT);
    assert(sent.groups.documents === 3, 'the laptop learns the phone has it');

    const result = await receiver.add();
    assert(receiver.state.status === DevicePairingStatus.ADDED && result.written >= 2, 'Add to this device writes the builds');
    assert(phone.storage.load(DOC_A).world === 'from the laptop', 'the laptop\'s build is on the phone');
    assert(phone.storage.load(DOC_B).world === 'phone version of B', 'a build the phone already had is kept, never overwritten');
    assert(phone.storage.load('forkbuild-index').length === 2, 'both builds are listed');
    assert(phone.storage.load('personal-structure:s1').name === 'Tower', 'saved structures come too');
    assert(!phone.storage.exists('local-session'), 'the laptop\'s sign-in does not');
    console.log('✓ a code copies every build to the other device, which keeps its own');

    sender.close();
    receiver.close();
    laptop.peerConnectionProvider.dispose();
    phone.peerConnectionProvider.dispose();
}

// A code serves one device: a second device finds nobody.
{
    const network = new LocalRendezvousNetwork();
    const laptop = makeDevice(network);
    laptop.storage.save(DOC_A, { world: 'a' });
    const sender = laptop.pairing.createSender();
    await sender.start();
    const { code } = sender.state;
    const first = makeDevice(network).pairing.createReceiver(code);
    await first.start();
    await waitForStatus(first, DevicePairingStatus.RECEIVED);
    const second = makeDevice(network).pairing.createReceiver(code);
    await second.start();
    assert(second.state.status === DevicePairingStatus.FAILED && second.state.failure === DevicePairingFailure.NOT_FOUND,
        'the spent code is no longer on the rendezvous network');
    console.log('✓ a code serves one device');
    sender.close();
    first.close();
}

// The wrong secret: what arrives can't be opened, and both sides say so.
{
    const network = new LocalRendezvousNetwork();
    const laptop = makeDevice(network);
    laptop.storage.save(DOC_A, { world: 'a' });
    const sender = laptop.pairing.createSender();
    await sender.start();
    const parsed = parseDevicePairingCode(sender.state.code);
    const forged = createDevicePairingCode({ identityId: parsed.identityId, secret: randomDevicePairingSecret() });
    const phone = makeDevice(network);
    const receiver = phone.pairing.createReceiver(forged);
    await receiver.start();
    const failed = await waitForStatus(receiver, DevicePairingStatus.FAILED);
    assert(failed.failure === DevicePairingFailure.DAMAGED, 'a receiver without the secret cannot open the builds');
    assert(!phone.storage.exists(DOC_A), 'and nothing is written');
    const senderFailed = await waitForStatus(sender, DevicePairingStatus.FAILED);
    assert(senderFailed.failure === DevicePairingFailure.DAMAGED, 'the sender hears it did not arrive intact');
    console.log('✓ only the code\'s secret opens what is sent');
}

// Failures that never reach a connection.
{
    const network = new LocalRendezvousNetwork();
    const invalid = makeDevice(network).pairing.createReceiver('not-a-code');
    await invalid.start();
    assert(invalid.state.failure === DevicePairingFailure.INVALID_CODE, 'a malformed link is refused');

    const gone = makeDevice(network).pairing.createReceiver(createDevicePairingCode({
        identityId: new EphemeralIdentityProvider().identityId, secret: randomDevicePairingSecret()
    }));
    await gone.start();
    assert(gone.state.failure === DevicePairingFailure.NOT_FOUND, 'a code nobody is showing is not found');

    const offline = makeDevice(null);
    assert(offline.pairing.available === false, 'without a rendezvous server pairing is unavailable');
    const offlineSender = offline.pairing.createSender();
    await offlineSender.start();
    assert(offlineSender.state.failure === DevicePairingFailure.UNREACHABLE, 'and showing a code says why');

    const expiring = makeDevice(network, { ttlMs: 200 }).pairing.createSender();
    await expiring.start();
    await waitForStatus(expiring, DevicePairingStatus.EXPIRED, 3000);
    console.log('✓ a bad link, a code nobody shows, no rendezvous server and an expired code each end clearly');
}

assert(DEVICE_PAIRING_PROTOCOL === 'forkbuild:device-pairing', 'the protocol is namespaced');
console.log('Device pairing tests passed.');
