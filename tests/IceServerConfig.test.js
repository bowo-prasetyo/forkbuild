import { DEFAULT_ICE_SERVERS, turnCredentialsUrlFor, createTurnCredentialSource, mergeIceServers } from '../peer/IceServerConfig.js';
import { WebRtcPeerConnectionProvider } from '../peer/WebRtcPeerConnectionProvider.js';
import { PeerSessionManager } from '../application/peer/PeerSessionManager.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// TURN credentials come from the rendezvous servers' /turn-credentials
// endpoint, only when a peer connection starts, and are cached until
// shortly before they expire. Nothing here holds a provider key.

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const HOUR = 60 * 60 * 1000;
const turnEntry = { urls: 'turn:relay.test:443', username: 'u', credential: 'p' };

function credentialResponse({ iceServers = [turnEntry], expiresAt = new Date(Date.now() + HOUR).toISOString() } = {}) {
    return { ok: true, json: async () => ({ iceServers, expiresAt }) };
}

// The credentials URL is the rendezvous server's own host.
{
    assert(turnCredentialsUrlFor('wss://rendezvous.example/') === 'https://rendezvous.example/turn-credentials', 'wss:// maps to https://…/turn-credentials');
    assert(turnCredentialsUrlFor('ws://localhost:8787') === 'http://localhost:8787/turn-credentials', 'ws:// (local development) maps to http://');
    assert(turnCredentialsUrlFor('https://not-a-socket.example') === null && turnCredentialsUrlFor('nonsense') === null,
        'anything that is not a WebSocket URL has no credentials URL');
    console.log('✓ the credentials endpoint is derived from each rendezvous URL');
}

// Fetched once, then cached until shortly before it expires.
{
    let clock = Date.now();
    const requested = [];
    const source = createTurnCredentialSource({
        rendezvousUrls: ['wss://a.example'],
        fetchImpl: async (url) => { requested.push(url); return credentialResponse({ expiresAt: new Date(clock + HOUR).toISOString() }); },
        now: () => clock
    });
    assert(requested.length === 0, 'creating the source requests nothing');
    const first = await source();
    assert(first[0].urls === turnEntry.urls && requested[0] === 'https://a.example/turn-credentials', 'the first call fetches from the rendezvous server');
    await source();
    assert(requested.length === 1, 'a second call within the credential\'s lifetime uses the cached credential');
    clock += HOUR - 60 * 1000;
    await source();
    assert(requested.length === 2, 'a credential about to expire is fetched again');

    const shared = createTurnCredentialSource({
        rendezvousUrls: ['wss://a.example'],
        fetchImpl: async (url) => { requested.push(url); await wait(10); return credentialResponse(); }
    });
    const [a, b] = await Promise.all([shared(), shared()]);
    assert(a === b && requested.length === 3, 'concurrent calls share one request');
    console.log('✓ credentials are fetched on demand and cached until shortly before they expire');
}

// Failures degrade to no TURN, trying each server in turn, within the timeout.
{
    const tried = [];
    const fallsThrough = createTurnCredentialSource({
        rendezvousUrls: ['wss://down.example', 'wss://no-turn.example', 'wss://up.example'],
        fetchImpl: async (url) => {
            tried.push(url);
            if (url.includes('down')) throw new Error('unreachable');
            if (url.includes('no-turn')) return { ok: false, json: async () => ({ error: 'no TURN relay' }) };
            return credentialResponse();
        }
    });
    assert((await fallsThrough())[0].urls === turnEntry.urls && tried.length === 3, 'an unreachable server, and one without TURN, are skipped');

    let clock = Date.now();
    let attempts = 0;
    const unavailable = createTurnCredentialSource({
        rendezvousUrls: ['wss://no-turn.example'],
        fetchImpl: async () => { attempts++; return { ok: false, json: async () => ({}) }; },
        now: () => clock
    });
    await unavailable();
    await unavailable();
    assert(attempts === 1, 'after no server answered, the next connection does not ask again straight away');
    clock += 11 * 60 * 1000;
    await unavailable();
    assert(attempts === 2, '...but it asks again ten minutes later');

    const malformed = createTurnCredentialSource({
        rendezvousUrls: ['wss://a.example'],
        fetchImpl: async () => ({ ok: true, json: async () => ({ iceServers: 'nope' }) })
    });
    assert((await malformed()).length === 0, 'a malformed answer gives no TURN servers');

    const hanging = createTurnCredentialSource({
        rendezvousUrls: ['wss://slow.example'],
        timeoutMs: 30,
        fetchImpl: (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))))
    });
    const started = Date.now();
    assert((await hanging()).length === 0 && Date.now() - started < 1000, 'a hanging server gives up after the timeout');

    let fetched = false;
    const none = createTurnCredentialSource({ rendezvousUrls: [], fetchImpl: async () => { fetched = true; return credentialResponse(); } });
    assert((await none()).length === 0 && !fetched, 'with no rendezvous server configured, nothing is requested');
    console.log('✓ a failing, slow or TURN-less server degrades to STUN only, never an error');
}

// The provider asks for TURN only in prepareIceServers(), and keeps the
// configured list alongside it.
{
    let calls = 0;
    const provider = new WebRtcPeerConnectionProvider({
        iceServers: DEFAULT_ICE_SERVERS,
        turnIceServers: async () => { calls++; return [turnEntry]; }
    });
    assert(calls === 0, 'constructing the provider (opening the app) requests no TURN credentials');
    await provider.prepareIceServers();
    assert(calls === 1 && provider._iceServers[0] === turnEntry && provider._iceServers.length === DEFAULT_ICE_SERVERS.length + 1,
        'prepareIceServers() puts the TURN entry ahead of the configured STUN servers');
    provider.setIceServers([{ urls: 'stun:other.test:3478' }]);
    await provider.prepareIceServers();
    assert(provider._iceServers.map((e) => e.urls).join() === 'turn:relay.test:443,stun:other.test:3478', 'a new configured list is merged the same way');

    const failing = new WebRtcPeerConnectionProvider({ iceServers: DEFAULT_ICE_SERVERS, turnIceServers: async () => { throw new Error('boom'); } });
    await failing.prepareIceServers();
    assert(failing._iceServers.length === DEFAULT_ICE_SERVERS.length, 'a failing TURN source leaves the configured list');

    assert(mergeIceServers([{ urls: 'stun:a' }], [{ urls: 'stun:a' }, { urls: 'stun:b' }]).length === 2, 'duplicate urls are dropped');
    provider.dispose();
    failing.dispose();
    console.log('✓ the provider fetches TURN only when asked to prepare a connection');
}

// PeerSessionManager prepares ICE servers before starting a connection.
{
    const order = [];
    const peerConnectionProvider = {
        async prepareIceServers() { order.push('prepare'); },
        createOffer() { order.push('createOffer'); throw new Error('stop here'); },
        connect() { order.push('connect'); throw new Error('stop here'); },
        onIncomingConnection() { return () => {}; }
    };
    const identityProvider = new LocalIdentityProvider(new InMemoryStorageProvider());
    identityProvider.login('prepare-tester');
    const manager = new PeerSessionManager({ identityProvider, peerConnectionProvider });
    try { await manager.createInvitation(); } catch { /* stopped on purpose */ }
    try { await manager.connectToDiscovered({ candidateEndpoint: '{}' }); } catch { /* stopped on purpose */ }
    assert(order.join() === 'prepare,createOffer,prepare,connect', `ICE servers are prepared before each connection starts (got ${order.join()})`);
    console.log('✓ each new connection prepares its ICE servers first');
}

console.log('\n✅ All ICE Server Config tests passed.');
