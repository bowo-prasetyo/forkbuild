import { WebRtcPeerConnectionProvider } from '../peer/WebRtcPeerConnectionProvider.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { ConnectToPeerUseCase } from '../application/peer/ConnectToPeerUseCase.js';
import { PeerContentExchange } from '../application/peer/PeerContentExchange.js';
import { PeerContentRetrievalCoordinator } from '../application/peer/PeerContentRetrievalCoordinator.js';
import { LocalPublicationCatalog } from '../application/publication/LocalPublicationCatalog.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { Document } from '../core/Document.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// The hollow Great Pyramid (233 × 233 base, 54,289 bricks, about 1.8 MB
// serialized; 7.4 MB before document schema 2) moves from one peer to
// another over a real WebRTC data channel, in parts
// (application/peer/ChunkedPeerTransfer.js), and arrives verified. Before
// parts existed, content over 48 KB could not be sent.

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    provider.login(label);
    return provider;
}

function waitFor(predicate, what, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const started = Date.now();
        const check = () => {
            if (predicate()) return resolve();
            if (Date.now() - started > timeoutMs) return reject(new Error(`timed out waiting for ${what}`));
            setTimeout(check, 20);
        };
        check();
    });
}

function waitForSignal(connection) {
    return new Promise((resolve) => connection.onLocalSignalReady(resolve));
}

function hollowPyramidText(base) {
    const world = new World();
    const building = new Building();
    world.addBuilding(building);
    for (let layer = 0; layer * 2 < base; layer++) {
        const lo = layer;
        const hi = base - 1 - layer;
        for (let x = lo; x <= hi; x++) {
            for (let z = lo; z <= hi; z++) {
                if (x !== lo && x !== hi && z !== lo && z !== hi) continue;
                building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(x, layer + 0.5, z) }));
            }
        }
    }
    return JSON.stringify(new DocumentSerializer().serialize(new Document({ world })));
}

const alice = makeIdentity('Alice');
const bob = makeIdentity('Bob');
const aliceTransport = new WebRtcPeerConnectionProvider();
const bobTransport = new WebRtcPeerConnectionProvider();
const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
const aliceConnection = aliceTransport.createOffer();
const alicePeer = aliceConnect.attach(aliceConnection);
const offer = await waitForSignal(aliceConnection);
const bobPeer = bobConnect.connect({ candidateEndpoint: JSON.stringify(offer.toJSON()) });
const answer = await waitForSignal(bobPeer.connection);
await aliceConnection.acceptRemoteAnswer(JSON.parse(JSON.stringify(answer.toJSON())));
await waitFor(() => alicePeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED
    && bobPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'both peers to authenticate');

const text = hollowPyramidText(233);
assert(text.length > 1.5 * 1000 * 1000, `setup: the hollow pyramid is ${(text.length / 1e6).toFixed(1)} MB`);

const aliceStore = new LocalContentStore(new InMemoryStorageProvider());
const bobStore = new LocalContentStore(new InMemoryStorageProvider());
const reference = await aliceStore.put(text);
let publication = new DecentralizedPublication({ contentKind: 'forkbuild.document', contentReference: reference, publisherIdentity: alice.getSigningIdentity().toJSON() });
publication = publication.withSignature(alice.signCanonical(publication.getSigningDescriptor()));
const aliceCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
const bobCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
aliceCatalog.add(publication);
bobCatalog.add(publication);

const aliceExchange = new PeerContentExchange(aliceStore, new PeerMessageBus(), aliceConnect.registry, aliceCatalog);
const bobExchange = new PeerContentExchange(bobStore, new PeerMessageBus(), bobConnect.registry, bobCatalog);
let parts = 0;
let peakBuffered = 0;
bobExchange.onTransferProgress(() => { parts++; });
const sampler = setInterval(() => { peakBuffered = Math.max(peakBuffered, alicePeer.connection.bufferedAmount); }, 5);

const started = Date.now();
const result = await new PeerContentRetrievalCoordinator(bobExchange).retrieve(reference.hash, [bobPeer]);
const seconds = (Date.now() - started) / 1000;
clearInterval(sampler);

assert(result.retrieved === true, 'the hollow pyramid is retrieved over WebRTC within the default 8 s per-silence timeout');
assert(await bobStore.get(reference) === text, '...and stored, byte for byte, verified against its hash');
assert(parts > 20, `...in ${parts + 1} parts`);
assert(peakBuffered <= 2 * 1024 * 1024, `the sender kept its send buffer bounded (peak ${(peakBuffered / 1024).toFixed(0)} KiB)`);
console.log(`✓ a ${(text.length / 1e6).toFixed(1)} MB build crossed a real WebRTC data channel in ${parts + 1} parts, ${seconds.toFixed(1)} s, peak send buffer ${(peakBuffered / 1024).toFixed(0)} KiB`);

aliceExchange.dispose();
bobExchange.dispose();
bobPeer.close();
await waitFor(() => alicePeer.getLifecycleState() === PeerLifecycleState.CLOSED, 'the connection to close');
