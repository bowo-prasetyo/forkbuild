import { HelpedBuildsStore } from '../application/buildTogether/HelpedBuildsStore.js';
import { HelpedBuildsSyncUseCase, HELPED_BUILDS_PROTOCOL } from '../application/buildTogether/HelpedBuildsSyncUseCase.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// The builds you helped make, on each of your devices
// (application/buildTogether/HelpedBuildsSyncUseCase.js): a device of yours
// that connects is given your list, a build noted later reaches the devices
// of yours connected then, and nobody else's device gets or gives one.

const ME = 'did:key:z6MkMe';
const SOMEONE = 'did:key:z6MkSomeone';

// A device: its store, its connections, and who it and they act for.
function device(label, actsFor) {
    const listeners = new Set();
    const peers = [];
    const changes = new Set();
    const device = {
        label,
        actsFor,
        store: new HelpedBuildsStore({ storageProvider: new InMemoryStorageProvider() }),
        peers,
        sent: [],
        bus: {
            send(peer, protocol, payload) {
                device.sent.push({ to: peer.other.label, payload });
                if (protocol === HELPED_BUILDS_PROTOCOL) peer.other.deliver(peer.back, JSON.parse(JSON.stringify(payload)));
            },
            subscribe(protocol, callback) { listeners.add(callback); return () => listeners.delete(callback); },
            attach() {}
        },
        registry: { list: () => peers, onChange(callback) { changes.add(callback); return () => changes.delete(callback); } },
        deliver(peer, payload) { for (const listener of listeners) listener(payload, { connectedPeer: peer }); },
        connected() { for (const change of changes) change(peers); }
    };
    device.sync = new HelpedBuildsSyncUseCase({
        peerMessageBus: device.bus,
        connectedPeerRegistry: device.registry,
        deviceAuthorization: {
            resolveOwnSocialIdentity: () => ({ identityId: actsFor }),
            resolveConnectionIdentity: (peer) => ({ identityId: peer.other.actsFor })
        },
        store: device.store
    });
    return device;
}

function connect(a, b) {
    const peerAtA = { other: b, getLifecycleState: () => PeerLifecycleState.AUTHENTICATED, remoteIdentity: { identityId: `${b.label}-key` } };
    const peerAtB = { other: a, getLifecycleState: () => PeerLifecycleState.AUTHENTICATED, remoteIdentity: { identityId: `${a.label}-key` } };
    peerAtA.back = peerAtB;
    peerAtB.back = peerAtA;
    a.peers.push(peerAtA);
    b.peers.push(peerAtB);
    a.connected();
    b.connected();
}

const titles = (dev) => dev.store.list(ME).map((entry) => entry.title).join();

// Two devices of mine meet: each ends up with both lists.
{
    const laptop = device('laptop', ME);
    const phone = device('phone', ME);
    laptop.store.note(ME, { documentId: 'harbor', title: 'Harbor', authorName: 'Ana', at: '2026-10-01T00:00:00Z' });
    phone.store.note(ME, { documentId: 'mill', title: 'Mill', at: '2026-10-03T00:00:00Z' });
    connect(laptop, phone);
    assert(titles(laptop) === 'Mill,Harbor' && titles(phone) === 'Mill,Harbor', `each device has both, newest first (${titles(laptop)} / ${titles(phone)})`);
    assert(phone.store.list(ME)[1].authorName === 'Ana', 'with what was known of each');

    laptop.store.note(ME, { documentId: 'tower', title: 'Tower', at: '2026-10-05T00:00:00Z' });
    assert(titles(phone) === 'Tower,Mill,Harbor', 'a build noted later reaches my other device while it is connected');
    laptop.store.note(ME, { documentId: 'harbor', title: 'Harbor (finished)', at: '2026-10-06T00:00:00Z' });
    assert(phone.store.list(ME)[0].title === 'Harbor (finished)' && phone.store.list(ME).length === 3, 'and a newer note of one already there replaces it');
    const before = laptop.sent.length + phone.sent.length;
    connect(device('scratch', SOMEONE), device('scratch2', SOMEONE));
    assert(laptop.sent.length + phone.sent.length === before, 'nothing goes back and forth on its own');
    console.log('✓ my devices share the builds I helped make');
}

// Someone else's device gets nothing, and what it sends is ignored.
{
    const mine = device('mine', ME);
    const theirs = device('theirs', SOMEONE);
    mine.store.note(ME, { documentId: 'harbor', title: 'Harbor', at: '2026-10-01T00:00:00Z' });
    theirs.store.note(SOMEONE, { documentId: 'forged', title: 'Forged', at: '2026-10-02T00:00:00Z' });
    connect(mine, theirs);
    assert(!mine.sent.length && !theirs.sent.length, 'neither sends a list to a device that isn\'t its own');
    mine.deliver(mine.peers[0], { kind: 'list', identityId: ME, entries: [{ documentId: 'forged', title: 'Forged', at: '2026-10-09T00:00:00Z' }] });
    assert(titles(mine) === 'Harbor', 'and a list from someone else\'s device is ignored');
    console.log('✓ the list only goes between your own devices');
}

// From my own device, only a list for the identity we share is taken in.
{
    const laptop = device('laptop', ME);
    const phone = device('phone', ME);
    connect(laptop, phone);
    phone.deliver(phone.peers[0], { kind: 'list', identityId: SOMEONE, entries: [{ documentId: 'x', title: 'X', at: '2026-10-01T00:00:00Z' }] });
    phone.deliver(phone.peers[0], { kind: 'list', identityId: ME, entries: [{ documentId: 'y', title: 'Y', at: 'nonsense' }, null, { title: 'no id', at: '2026-10-01T00:00:00Z' }] });
    assert(phone.store.list(ME).length === 0 && phone.store.list(SOMEONE).length === 0, 'another identity\'s list, or nonsense, is ignored');
    phone.store.merge(ME, [{ documentId: 'z', title: 'Z', at: '2026-10-02T00:00:00Z' }]);
    assert(laptop.store.list(ME).length === 0, 'a list merged in is never sent on again');
    laptop.sync.dispose();
    phone.sync.dispose();
    console.log('✓ only a list for the identity you share is taken in, and none is echoed');
}
