import { RendezvousNode, LIMITS } from './worker.js';

// Runs RendezvousNode against small fakes of the two Cloudflare surfaces it
// uses: Durable Object storage and hibernatable WebSockets. Identities and
// signatures are real (Node's WebCrypto Ed25519), built the same way the
// app builds them (core/Signature.js, identity/Ed25519.js), so this file
// stays as self-contained as worker.js itself. tests/RendezvousWorkerInterop.test.js
// checks the worker against the app's own client code.

function fakeDurableObjectState({ socketsPerAddress = 0 } = {}) {
    const store = new Map();
    let alarmAt = null;
    return {
        blockConcurrencyWhile: async (fn) => fn(),
        getWebSockets: () => new Array(socketsPerAddress),
        storage: {
            async get(key) { return store.has(key) ? store.get(key) : undefined; },
            async put(key, value) { store.set(key, value); },
            async delete(key) { return store.delete(key); },
            async list({ prefix = '' } = {}) {
                const result = new Map();
                for (const [key, value] of store) {
                    if (key.startsWith(prefix)) result.set(key, value);
                }
                return result;
            },
            async getAlarm() { return alarmAt; },
            async setAlarm(when) { alarmAt = when; }
        },
        _rawStore: store
    };
}

function fakeSocket() {
    let attachment = null;
    return {
        sent: [],
        closed: null,
        send(text) { this.sent.push(JSON.parse(text)); },
        close(code, reason) { this.closed = { code, reason }; },
        serializeAttachment(value) { attachment = structuredClone(value); },
        deserializeAttachment() { return attachment; }
    };
}

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function assertRejects(promise, pattern, message) {
    try {
        await promise;
    } catch (err) {
        assert(pattern.test(err.message), `${message} (got "${err.message}")`);
        return;
    }
    throw new Error(`ASSERT FAILED: ${message} (it did not throw)`);
}

// --- identities and signatures, as the app makes them ----------------------

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58Encode(bytes) {
    let num = 0n;
    for (const b of bytes) num = num * 256n + BigInt(b);
    let text = '';
    while (num > 0n) { text = B58[Number(num % 58n)] + text; num /= 58n; }
    for (const b of bytes) { if (b !== 0) break; text = '1' + text; }
    return text;
}
const toHex = (bytes) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');

async function createIdentity() {
    const keys = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey));
    const id = 'did:key:z' + base58Encode(new Uint8Array([0xed, 0x01, ...raw]));
    return {
        id,
        async sign(descriptor) {
            const bytes = new TextEncoder().encode(JSON.stringify({ domain: 'forkbuild', ...descriptor }));
            const signature = await crypto.subtle.sign({ name: 'Ed25519' }, keys.privateKey, bytes);
            return {
                algorithm: 'Ed25519',
                signer: id,
                signature: toHex(signature),
                signedHash: 'not-checked-by-the-server',
                domain: 'forkbuild/' + descriptor.type,
                signedAt: new Date().toISOString()
            };
        }
    };
}

let publicationCounter = 0;
function makePublication(identityHint, { publishedAt = Date.now(), lifetimeMs = 5 * 60 * 1000, endpoint = 'fake-sdp-offer' } = {}) {
    const publicationId = `pub-${++publicationCounter}`;
    const expiresAt = new Date(publishedAt + lifetimeMs).toISOString();
    return {
        publicationId,
        invitation: {
            formatVersion: 1,
            invitationId: 'inv-' + publicationId,
            endpoint: { offer: endpoint },
            identityHint,
            createdAt: new Date(publishedAt).toISOString(),
            expiresAt
        },
        publishedAt: new Date(publishedAt).toISOString(),
        expiresAt
    };
}

async function signPublication(identity, publication) {
    const signature = await identity.sign({
        type: 'rendezvous-publication',
        id: publication.invitation.identityHint,
        revision: publication.publicationId,
        payload: {
            publicationId: publication.publicationId,
            identityHint: publication.invitation.identityHint,
            invitation: publication.invitation,
            publishedAt: publication.publishedAt,
            expiresAt: publication.expiresAt
        }
    });
    return { ...publication, signature };
}

async function signedPublication(identity, options) {
    return signPublication(identity, makePublication(identity.id, options));
}

async function removal(identity, publicationId, signer = identity) {
    const signature = await signer.sign({
        type: 'rendezvous-removal',
        id: identity.id,
        revision: publicationId,
        payload: { publicationId, identityHint: identity.id }
    });
    return { identityId: identity.id, publicationId, signature };
}

// --------------------------------------------------------------------------

const alice = await createIdentity();
const bob = await createIdentity();
const MINUTE = 60 * 1000;

// PUBLISH stores a signed publication, echoes it back, and LOOKUP finds it.
{
    const node = new RendezvousNode(fakeDurableObjectState());
    const publication = await signedPublication(alice);
    assert(await node._handlePublish(publication) === publication, 'PUBLISH echoes the publication back');
    const found = await node._handleLookup(alice.id);
    assert(found.length === 1 && found[0].publicationId === publication.publicationId, 'LOOKUP finds the stored publication');
    assert((await node._handleLookup(bob.id)).length === 0, 'LOOKUP for an identity with nothing stored returns []');
    console.log('✓ a signed PUBLISH is stored and found by LOOKUP');
}

// Only the identity itself can publish for itself.
{
    const ctx = fakeDurableObjectState();
    const node = new RendezvousNode(ctx);
    await assertRejects(node._handlePublish(makePublication(alice.id)), /must be signed/, 'an unsigned publication is refused');
    await assertRejects(node._handlePublish(await signPublication(bob, makePublication(alice.id))), /signature does not match/,
        'a publication for Alice signed by Bob is refused');
    const tampered = await signedPublication(alice);
    tampered.invitation = { ...tampered.invitation, endpoint: { offer: 'attacker-offer' } };
    await assertRejects(node._handlePublish(tampered), /signature does not match/, 'a signed publication whose endpoint was changed is refused');
    await assertRejects(node._handlePublish(makePublication('alice-by-name')), /not a did:key/, 'an identityHint that is not a did:key is refused');
    await assertRejects(node._handlePublish({ publicationId: 'no-invitation' }), /invalid publication/, 'a malformed publication is refused');
    assert(ctx._rawStore.size === 0, 'nothing refused was stored');
    console.log('✓ a publication must be signed by the identity it names, over exactly what is stored');
}

// Expiry limits: no entry that never expires, none dated in the future.
{
    const node = new RendezvousNode(fakeDurableObjectState());
    await assertRejects(node._handlePublish(await signedPublication(alice, { lifetimeMs: 24 * 60 * MINUTE })), /at most 15 minutes/,
        'a publication asking to last a day is refused');
    await assertRejects(node._handlePublish(await signedPublication(alice, { publishedAt: Date.now() - 10 * MINUTE, lifetimeMs: 5 * MINUTE })),
        /already expired/, 'an expired publication is refused');
    await assertRejects(node._handlePublish(await signedPublication(alice, { publishedAt: Date.now() + 30 * MINUTE })), /future/,
        'a publication dated half an hour ahead is refused');
    const tenMinutes = await signedPublication(alice, { lifetimeMs: 10 * MINUTE });
    await node._handlePublish(tenMinutes);
    const skewed = await signedPublication(bob, { publishedAt: Date.now() + 2 * MINUTE, lifetimeMs: 10 * MINUTE });
    await node._handlePublish(skewed);
    assert((await node._handleLookup(bob.id)).length === 1, 'the app\'s 10-minute publication is accepted, even from a clock 2 minutes fast');
    console.log('✓ publication lifetime and clock skew are bounded');
}

// A newer publication replaces the old one; an older one cannot roll it back.
{
    const node = new RendezvousNode(fakeDurableObjectState());
    const older = await signedPublication(alice, { publishedAt: Date.now() - MINUTE });
    const newer = await signedPublication(alice);
    await node._handlePublish(older);
    await node._handlePublish(newer);
    assert((await node._handleLookup(alice.id))[0].publicationId === newer.publicationId, 'a newer PUBLISH replaces the stored one');
    await assertRejects(node._handlePublish(older), /newer publication/, 'replaying the older publication is refused');
    await node._handlePublish(newer);
    assert((await node._handleLookup(alice.id))[0].publicationId === newer.publicationId, 'republishing the current publication is harmless');
    console.log('✓ replaying an older publication cannot roll an identity back');
}

// An expired entry is gone for LOOKUP and pruned on read.
{
    const ctx = fakeDurableObjectState();
    const node = new RendezvousNode(ctx);
    await node._handlePublish(await signedPublication(alice));
    const entry = ctx._rawStore.get('pub:' + alice.id);
    ctx._rawStore.set('pub:' + alice.id, { ...entry, expiresAtMs: Date.now() - 1 });
    assert((await node._handleLookup(alice.id)).length === 0, 'LOOKUP never returns an expired publication');
    assert(!ctx._rawStore.has('pub:' + alice.id), '...and prunes it');
    assert(ctx._rawStore.get('meta:entries') === 0, '...and the entry count follows');
    console.log('✓ expired entries disappear on read');
}

// REMOVE needs the identity's signature over that publication.
{
    const node = new RendezvousNode(fakeDurableObjectState());
    const publication = await signedPublication(alice);
    await node._handlePublish(publication);

    await assertRejects(node._handleRemove({ publicationId: publication.publicationId }), /required/,
        'a REMOVE carrying only a publicationId (anyone can LOOKUP one) is refused');
    await assertRejects(node._handleRemove({ identityId: alice.id, publicationId: publication.publicationId }), /must be signed/,
        'an unsigned REMOVE is refused');
    await assertRejects(node._handleRemove(await removal(alice, publication.publicationId, bob)), /signature does not match/,
        'Bob cannot withdraw Alice\'s publication');
    const forOther = await removal(alice, 'some-other-publication');
    await assertRejects(node._handleRemove({ ...forOther, publicationId: publication.publicationId }), /signature does not match/,
        'a removal signature for another publication cannot be reused');
    assert((await node._handleLookup(alice.id)).length === 1, 'after all that, Alice\'s publication is still there');

    assert(await node._handleRemove(await removal(alice, publication.publicationId)) === true, 'Alice can withdraw her own publication');
    assert((await node._handleLookup(alice.id)).length === 0, '...and LOOKUP no longer finds it');
    assert(await node._handleRemove(await removal(alice, publication.publicationId)) === false, 'withdrawing it again reports false');
    await assertRejects(node._handlePublish(publication), /withdrawn/, 'the withdrawn publication cannot be published again by replaying it');

    const next = await signedPublication(alice);
    await node._handlePublish(next);
    assert((await node._handleLookup(alice.id))[0].publicationId === next.publicationId, 'Alice can publish anew after withdrawing');
    assert(await node._handleRemove(await removal(alice, publication.publicationId)) === false,
        'withdrawing an old publication leaves the current one alone');
    assert((await node._handleLookup(alice.id)).length === 1, '...and it is still found');
    console.log('✓ REMOVE needs the identity\'s signature, and a withdrawn publication stays withdrawn');
}

// The alarm sweeps expired entries and tombstones and recounts.
{
    const ctx = fakeDurableObjectState();
    const node = new RendezvousNode(ctx);
    await node._handlePublish(await signedPublication(alice));
    await node._handlePublish(await signedPublication(bob));
    const entry = ctx._rawStore.get('pub:' + bob.id);
    ctx._rawStore.set('pub:' + bob.id, { ...entry, expiresAtMs: Date.now() - 1 });
    ctx._rawStore.set('meta:entries', 7);
    await node.alarm();
    assert((await node._handleLookup(alice.id)).length === 1, 'the alarm leaves a fresh entry alone');
    assert(!ctx._rawStore.has('pub:' + bob.id), '...sweeps an expired one');
    assert(ctx._rawStore.get('meta:entries') === 1, '...and corrects the entry count');
    console.log('✓ the alarm sweeps expired entries');
}

// The node holds at most MAX_ENTRIES identities.
{
    const node = new RendezvousNode(fakeDurableObjectState(), { MAX_ENTRIES: '2' });
    const carol = await createIdentity();
    await node._handlePublish(await signedPublication(alice));
    await node._handlePublish(await signedPublication(bob));
    await assertRejects(node._handlePublish(await signedPublication(carol)), /full/, 'a third identity is refused when the node holds two');
    await node._handlePublish(await signedPublication(alice));
    assert((await node._handleLookup(alice.id)).length === 1, 'an identity already stored can still republish when the node is full');
    console.log('✓ the number of stored identities is capped');
}

// Requests over one connection are rate limited.
{
    const node = new RendezvousNode(fakeDurableObjectState());
    const ws = fakeSocket();
    for (let i = 0; i < LIMITS.requestBurst + 1; i++) {
        await node.webSocketMessage(ws, JSON.stringify({ v: 1, type: 'LOOKUP', requestId: `r${i}`, identityId: alice.id }));
    }
    assert(ws.sent.slice(0, LIMITS.requestBurst).every((reply) => reply.type === 'OK'), `the first ${LIMITS.requestBurst} requests are answered`);
    const last = ws.sent[LIMITS.requestBurst];
    assert(last.type === 'ERROR' && /rate limit/.test(last.message), 'the next one is refused');

    const later = Date.now() + 5000;
    assert(node._takeRequestToken(ws, later) === true, 'tokens come back over time');
    console.log('✓ requests per connection are rate limited');
}

// Oversized frames close the connection; malformed ones are ignored.
{
    const node = new RendezvousNode(fakeDurableObjectState());
    const ws = fakeSocket();
    await node.webSocketMessage(ws, JSON.stringify({ v: 1, type: 'LOOKUP', requestId: 'big', identityId: 'x'.repeat(LIMITS.maxMessageBytes) }));
    assert(ws.closed && ws.closed.code === 1009 && ws.sent.length === 0, 'a frame over the size limit closes the connection unanswered');

    const ws2 = fakeSocket();
    await node.webSocketMessage(ws2, 'not json');
    await node.webSocketMessage(ws2, JSON.stringify({ v: 1, type: 'LOOKUP' }));
    assert(ws2.sent.length === 0 && !ws2.closed, 'a frame that is not JSON, or has no requestId, is ignored');

    await node.webSocketMessage(ws2, JSON.stringify({ v: 1, type: 'PUBLISH', requestId: 'p', publication: await signedPublication(alice) }));
    assert(ws2.sent[0].type === 'OK', 'a signed PUBLISH over the socket is answered OK');
    await node.webSocketMessage(ws2, JSON.stringify({ v: 1, type: 'DROP_TABLES', requestId: 'q' }));
    assert(ws2.sent[1].type === 'ERROR' && /unknown request type/.test(ws2.sent[1].message), 'an unknown request type gets an ERROR');
    console.log('✓ oversized and malformed frames are handled');
}

// Too many connections from one address are refused.
{
    const node = new RendezvousNode(fakeDurableObjectState({ socketsPerAddress: LIMITS.maxConnectionsPerAddress }));
    const response = await node.fetch(new Request('https://rendezvous.example/', {
        headers: { Upgrade: 'websocket', 'CF-Connecting-IP': '203.0.113.7' }
    }));
    assert(response.status === 429, `a connection beyond ${LIMITS.maxConnectionsPerAddress} from one address gets 429`);
    console.log('✓ connections per address are capped');
}

// GET /turn-credentials creates a short-lived Metered credential with the
// secret key, which never appears in the response.
{
    const env = { METERED_DOMAIN: 'app.metered.test', METERED_SECRET_KEY: 'secret-key-value' };
    const node = new RendezvousNode(fakeDurableObjectState(), env);
    const calls = [];
    node.fetchImpl = async (url, init = {}) => {
        calls.push({ url, init });
        if (url.startsWith('https://app.metered.test/api/v1/turn/credential?')) {
            return Response.json({ username: 'u1', password: 'p1', apiKey: 'per-credential-key', expiryInSeconds: 3600 });
        }
        if (url === 'https://app.metered.test/api/v1/turn/credentials?apiKey=per-credential-key') {
            return Response.json([{ urls: 'turn:relay.test:80', username: 'u1', credential: 'p1' }]);
        }
        return new Response('not found', { status: 404 });
    };
    const request = () => new Request('https://rendezvous.test/turn-credentials', {
        headers: { 'CF-Connecting-IP': '198.51.100.4', Origin: 'https://forkbuild.test' }
    });

    const response = await node.fetch(request());
    const body = await response.json();
    assert(response.status === 200 && body.iceServers[0].urls === 'turn:relay.test:80', 'the endpoint returns the credential\'s ICE servers');
    assert(Date.parse(body.expiresAt) - Date.now() <= 3600 * 1000 && Date.parse(body.expiresAt) > Date.now(), '...with an expiry an hour away');
    assert(JSON.parse(calls[0].init.body).expiryInSeconds === LIMITS.turnCredentialLifetimeSeconds, 'the credential is created to expire');
    assert(!JSON.stringify(body).includes('secret-key-value'), 'the secret key never appears in the response');
    assert(response.headers.get('access-control-allow-origin') === '*', 'the app\'s origin may read it');

    for (let i = 1; i < LIMITS.turnCredentialsPerAddressPerHour; i++) await node.fetch(request());
    const limited = await node.fetch(request());
    assert(limited.status === 429, `request ${LIMITS.turnCredentialsPerAddressPerHour + 1} from one address within an hour gets 429`);

    const unconfigured = await new RendezvousNode(fakeDurableObjectState()).fetch(request());
    assert(unconfigured.status === 404, 'without METERED_DOMAIN and METERED_SECRET_KEY the endpoint answers 404');

    const failing = new RendezvousNode(fakeDurableObjectState(), env);
    failing.fetchImpl = async () => new Response('{"message":"Invalid secretKey secret-key-value"}', { status: 401 });
    const failed = await failing.fetch(request());
    const failure = await failed.json();
    assert(failed.status === 502 && /creating a credential: .* answered 401/.test(failure.detail), `a provider failure answers 502 naming the step and status (got ${failure.detail})`);
    assert(!JSON.stringify(failure).includes('secret-key-value'), '...without echoing the secret key');

    const noListing = new RendezvousNode(fakeDurableObjectState(), env);
    noListing.fetchImpl = async (url) => url.includes('/credential?')
        ? Response.json({ username: 'u2', password: 'p2', apiKey: 'k2' })
        : new Response('nope', { status: 500 });
    const fallback = await (await noListing.fetch(request())).json();
    assert(fallback.iceServers.some((e) => e.urls === 'turn:standard.relay.metered.ca:443' && e.username === 'u2' && e.credential === 'p2'),
        'when listing ICE servers fails, the new credential is used with Metered\'s standard relay');

    const restricted = new RendezvousNode(fakeDurableObjectState(), { ...env, ALLOWED_ORIGINS: 'https://other.test' });
    restricted.fetchImpl = node.fetchImpl;
    const refused = await restricted.fetch(request());
    assert(!refused.headers.get('access-control-allow-origin'), 'with ALLOWED_ORIGINS set, another origin gets no CORS permission');
    console.log('✓ /turn-credentials mints expiring credentials behind a rate limit, never exposing the secret key');
}

console.log('✅ All ForkBuild Rendezvous Worker tests passed.');
