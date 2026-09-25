import { RendezvousNode } from '../server/rendezvous-worker/worker.js';
import { WebSocketRendezvousTransport } from '../peer/WebSocketRendezvousTransport.js';
import { RendezvousDiscoveryProvider } from '../peer/RendezvousDiscoveryProvider.js';
import { PeerInvitation } from '../peer/PeerInvitation.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// The app's own rendezvous client (RendezvousDiscoveryProvider over
// WebSocketRendezvousTransport, signing with LocalIdentityProvider) against
// the reference server (server/rendezvous-worker/worker.js), joined by an
// in-memory WebSocket. Proves the signatures the app produces are the ones
// the server requires, and that someone else's client cannot change an
// identity's entry.

function fakeDurableObjectState() {
    const store = new Map();
    return {
        blockConcurrencyWhile: async (fn) => fn(),
        getWebSockets: () => [],
        storage: {
            async get(key) { return store.get(key); },
            async put(key, value) { store.set(key, value); },
            async delete(key) { return store.delete(key); },
            async list({ prefix = '' } = {}) {
                return new Map([...store].filter(([key]) => key.startsWith(prefix)));
            },
            async getAlarm() { return 0; },
            async setAlarm() {}
        }
    };
}

// A browser-style WebSocket whose server end is a RendezvousNode.
function socketClassFor(node) {
    return class NodeBackedWebSocket extends EventTarget {
        constructor(url) {
            super();
            this.url = url;
            this.readyState = 0;
            let attachment = null;
            this._serverSide = {
                send: (text) => setTimeout(() => {
                    if (this.readyState !== 1) return;
                    this.dispatchEvent(Object.assign(new Event('message'), { data: text }));
                }, 0),
                close: () => this.close(),
                serializeAttachment: (value) => { attachment = structuredClone(value); },
                deserializeAttachment: () => attachment
            };
            setTimeout(() => {
                this.readyState = 1;
                this.dispatchEvent(new Event('open'));
            }, 0);
        }
        send(text) {
            if (this.readyState !== 1) throw new Error('not open');
            setTimeout(() => node.webSocketMessage(this._serverSide, text), 0);
        }
        close() {
            if (this.readyState === 3) return;
            this.readyState = 3;
            this.dispatchEvent(new Event('close'));
        }
    };
}

function clientFor(node, identityProvider) {
    const transport = new WebSocketRendezvousTransport({ url: 'wss://rendezvous.test', WebSocketImpl: socketClassFor(node) });
    return { transport, provider: new RendezvousDiscoveryProvider({ transport, identityProvider }) };
}

async function rejects(promise, pattern, message) {
    try {
        await promise;
    } catch (err) {
        assert(pattern.test(err.message), `${message} (got "${err.message}")`);
        return;
    }
    throw new Error(`ASSERT FAILED: ${message} (it did not throw)`);
}

const node = new RendezvousNode(fakeDurableObjectState());

const aliceDevice = new LocalIdentityProvider(new InMemoryStorageProvider());
aliceDevice.login('alice');
const aliceId = aliceDevice.getSigningIdentity().id;
const alice = clientFor(node, aliceDevice);

const bobDevice = new LocalIdentityProvider(new InMemoryStorageProvider());
bobDevice.login('bob');
const bob = clientFor(node, bobDevice);

const offer = (identityHint, text = 'v=0\r\no=alice 1 1 IN IP4 127.0.0.1\r\n') =>
    PeerInvitation.create({ endpoint: text, identityHint, ttlMs: 10 * 60 * 1000 });

// Alice publishes with the app's own client, and Bob finds her.
{
    const stored = await alice.provider.publish(offer(aliceId), { ttlMs: 10 * 60 * 1000 });
    assert(stored.identityHint === aliceId && stored.signature, 'the server accepts and echoes the publication the app signs');
    const found = await bob.provider.discover(aliceId);
    assert(found.length === 1 && found[0].candidateEndpoint.startsWith('v=0'), 'Bob finds Alice\'s published endpoint');
    console.log('✓ a publication signed by the app is accepted, and found by another client');
}

// Bob cannot publish as Alice, or withdraw her entry.
{
    await rejects(bob.provider.publish(offer(aliceId, 'v=0\r\no=mallory\r\n')), /must be signed/,
        'Bob\'s client, which refuses to sign for Alice, cannot publish for her');
    await rejects(bob.transport.remove((await bob.transport.lookup(aliceId))[0].publicationId), /required/,
        'a REMOVE with only the publicationId anyone can LOOKUP is refused');
    assert(await bob.provider.unpublish((await bob.transport.lookup(aliceId))[0].publicationId) === false,
        'Bob\'s client, signing as Bob, withdraws nothing of Alice\'s');
    const found = await bob.transport.lookup(aliceId);
    assert(found.length === 1 && found[0].endpoint.includes('o=alice'), 'Alice\'s entry is unchanged');
    console.log('✓ another identity cannot publish for Alice or withdraw her entry');
}

// Alice withdraws her own publication with the app's own unpublish().
{
    assert(await alice.provider.unpublish() === true, 'the app\'s signed REMOVE withdraws Alice\'s publication');
    assert((await bob.transport.lookup(aliceId)).length === 0, 'Bob no longer finds her');
    console.log('✓ unpublish() sends a REMOVE the server accepts');
}

// A locked identity cannot sign, so the server refuses its publication
// with a message the Find Peer panel can show.
{
    const carolDevice = new LocalIdentityProvider(new InMemoryStorageProvider());
    const carolIdentity = await carolDevice.createProtectedLocalIdentity('carol', 'correct horse battery');
    await carolDevice.unlock(carolIdentity.identityId, 'correct horse battery');
    carolDevice.authenticate(carolIdentity.identityId);
    const carolId = carolDevice.getSigningIdentity().id;
    carolDevice.lock(carolIdentity.identityId);
    const carol = clientFor(node, carolDevice);
    await rejects(carol.provider.publish(offer(carolId)), /unlock your identity/, 'a locked identity\'s publication is refused, asking to unlock');
    console.log('✓ a locked identity is told to unlock before publishing');
    for (const client of [alice, bob, carol]) client.transport.dispose();
}

console.log('\n✅ All RendezvousWorkerInterop tests passed.');
