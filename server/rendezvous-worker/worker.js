// The ForkBuild rendezvous server: a Cloudflare Worker plus one Durable
// Object that keeps, for each identity, where it can currently be reached.
// It implements the server half of the protocol documented in
// peer/WebSocketRendezvousTransport.js (in the main ForkBuild repo); see
// this folder's README.md for deployment.
//
// Wire protocol, one JSON object per WebSocket text frame:
//
//   Client -> Server:
//     { v: 1, type: 'PUBLISH', requestId, publication }
//         a signed RendezvousPublication.toJSON()
//     { v: 1, type: 'LOOKUP',  requestId, identityId }
//     { v: 1, type: 'REMOVE',  requestId, identityId, publicationId, signature }
//         signature: the identity's signature over a rendezvous-removal
//         envelope naming that publication
//
//   Server -> Client, exactly one response per request, in any order:
//     { v: 1, type: 'OK',    requestId, result }
//     { v: 1, type: 'ERROR', requestId, message }
//
// What the server enforces:
//
// - Only an identity can publish or withdraw its own entry. An identity id
//   is a did:key, which embeds its Ed25519 public key, so the server checks
//   each signature against the id itself; it needs no accounts. Signatures
//   use ForkBuild's canonical envelope (core/Signature.js) and are checked
//   with the platform's WebCrypto Ed25519.
// - A publication cannot be replayed to roll an identity back to an older
//   entry, or to restore one it withdrew: the server refuses a publication
//   published earlier than the stored one, and keeps a withdrawn entry as a
//   tombstone until it would have expired.
// - Limits (see LIMITS below): message size, publication lifetime, clock
//   skew, requests per connection, connections per IP address, and the
//   total number of stored identities.
//
// TURN credentials. GET /turn-credentials returns
//   { iceServers, expiresAt }
// with credentials for a TURN relay that expire after an hour, created with
// a long-term key only this worker holds:
// - Cloudflare Realtime TURN: the CLOUDFLARE_TURN_KEY_ID and
//   CLOUDFLARE_TURN_API_TOKEN secrets (used when both are set), or
// - Metered (paid plans only): METERED_DOMAIN and the METERED_SECRET_KEY
//   secret.
// The key never reaches browsers, and the app asks for credentials only
// when it starts a peer connection. At most TURN_CREDENTIALS_PER_MONTH
// (default LIMITS.turnCredentialsPerMonth) are handed out per calendar
// month, to bound the relay bill; GET /turn-stats shows this month's count
// (open to anyone: it holds no secrets), and a warning is logged at 80% of
// the allowance and on every refusal past it. Without a provider the endpoint
// answers 404 and the app uses STUN alone.
//
// What it does not do: prove that the publisher answers at the published
// endpoint. Peers still authenticate each other when they connect
// (peer/PeerAuthenticationSession.js); the server only decides who may
// change which entry.
//
// This file imports nothing from the app, so it can be deployed on its
// own.

const PROTOCOL_VERSION = 1;
const SIGNING_DOMAIN = 'forkbuild';
const PUBLICATION_SIGNATURE_TYPE = 'rendezvous-publication';
const REMOVAL_SIGNATURE_TYPE = 'rendezvous-removal';

export const LIMITS = Object.freeze({
    // Largest accepted frame. A publication carries a WebRTC offer, a few
    // kilobytes at most.
    maxMessageBytes: 32 * 1024,
    // The app publishes for 10 minutes; anything asking to stay longer is
    // refused, so no entry can outlive this.
    maxPublicationLifetimeMs: 15 * 60 * 1000,
    // How far a client's clock may run ahead of the server's.
    maxClockSkewMs: 5 * 60 * 1000,
    maxIdLength: 256,
    // Token bucket per connection: bursts up to `requestBurst`, then
    // `requestsPerSecond` on average. At startup the app looks up every
    // Known Peer at once, hence the generous burst.
    requestBurst: 120,
    requestsPerSecond: 2,
    maxConnectionsPerAddress: 16,
    // Distinct identities stored at once (tombstones included). Can be
    // overridden with the MAX_ENTRIES variable.
    maxEntries: 100000,
    // TURN credentials (GET /turn-credentials): each lasts this long, and
    // one address may request this many per hour.
    turnCredentialLifetimeSeconds: 60 * 60,
    turnCredentialsPerAddressPerHour: 20,
    // Credentials handed out per calendar month (UTC), all addresses
    // together. Can be overridden with the TURN_CREDENTIALS_PER_MONTH
    // variable.
    turnCredentialsPerMonth: 10000
});

// One entry per identity, stored under this prefix:
//   { publication, publishedAtMs, expiresAtMs, removed }
const STORAGE_KEY_PREFIX = 'pub:';
const ENTRY_COUNT_KEY = 'meta:entries';

// The alarm sweeps out entries nobody looked up after they expired.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

const TURN_RATE_KEY_PREFIX = 'turn:';
const TURN_MONTH_KEY_PREFIX = 'turnmonth:';
// The share of the monthly allowance at which a warning is logged.
const TURN_WARNING_FRACTION = 0.8;
const HOUR_MS = 60 * 60 * 1000;
const TURN_PROVIDER_TIMEOUT_MS = 5000;

// ------------------------------------------------------------------
// Signatures
// ------------------------------------------------------------------

const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Decode(text) {
    let num = 0n;
    for (const ch of text) {
        const index = B58_ALPHABET.indexOf(ch);
        if (index === -1) return null;
        num = num * 58n + BigInt(index);
    }
    const bytes = [];
    while (num > 0n) {
        bytes.unshift(Number(num % 256n));
        num /= 256n;
    }
    for (const ch of text) {
        if (ch !== '1') break;
        bytes.unshift(0);
    }
    return new Uint8Array(bytes);
}

// did:key:z + base58btc(0xed 0x01 + 32-byte Ed25519 public key)
export function didKeyToPublicKey(did) {
    if (typeof did !== 'string' || !did.startsWith('did:key:z') || did.length > LIMITS.maxIdLength) {
        return null;
    }
    const bytes = base58Decode(did.slice('did:key:z'.length));
    if (!bytes || bytes.length !== 34 || bytes[0] !== 0xed || bytes[1] !== 0x01) {
        return null;
    }
    return bytes.slice(2);
}

function hexToBytes(hex) {
    if (typeof hex !== 'string' || hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
        return null;
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

// The exact bytes the app signs (core/Signature.js#canonicalBytes).
function canonicalBytes({ type, id, revision, payload }) {
    return new TextEncoder().encode(JSON.stringify({ domain: SIGNING_DOMAIN, type, id, revision, payload }));
}

// True when `signature` (a core/Signature.js toJSON()) is `signer`'s valid
// Ed25519 signature over `descriptor`.
async function verifySignature(descriptor, signature, signer) {
    if (!signature || typeof signature !== 'object'
        || (signature.algorithm !== undefined && signature.algorithm !== 'Ed25519')
        || signature.signer !== signer
        || signature.domain !== `${SIGNING_DOMAIN}/${descriptor.type}`) {
        return false;
    }
    const publicKey = didKeyToPublicKey(signer);
    const signatureBytes = hexToBytes(signature.signature);
    if (!publicKey || !signatureBytes || signatureBytes.length !== 64) {
        return false;
    }
    try {
        const key = await crypto.subtle.importKey('raw', publicKey, { name: 'Ed25519' }, false, ['verify']);
        return await crypto.subtle.verify({ name: 'Ed25519' }, key, signatureBytes, canonicalBytes(descriptor));
    } catch {
        return false;
    }
}

// Mirrors core/RendezvousPublicationEnvelope.js.
function publicationDescriptor(publication) {
    return {
        type: PUBLICATION_SIGNATURE_TYPE,
        id: publication.invitation.identityHint,
        revision: publication.publicationId,
        payload: {
            publicationId: publication.publicationId,
            identityHint: publication.invitation.identityHint,
            invitation: publication.invitation,
            publishedAt: publication.publishedAt,
            expiresAt: publication.expiresAt
        }
    };
}

function removalDescriptor(identityId, publicationId) {
    return {
        type: REMOVAL_SIGNATURE_TYPE,
        id: identityId,
        revision: publicationId,
        payload: { publicationId, identityHint: identityId }
    };
}

// ------------------------------------------------------------------
// Validation
// ------------------------------------------------------------------

function isShortString(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= LIMITS.maxIdLength;
}

function isIsoDate(value) {
    return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

// Throws a message the client can show unless `publication` is well formed
// and its times are within the limits. Returns its parsed times.
function checkPublicationShape(publication, now) {
    if (!publication || typeof publication !== 'object'
        || !isShortString(publication.publicationId)
        || !publication.invitation || typeof publication.invitation !== 'object'
        || !isShortString(publication.invitation.identityHint)
        || !isIsoDate(publication.publishedAt)
        || !isIsoDate(publication.expiresAt)) {
        throw new Error('PUBLISH: invalid publication');
    }
    const publishedAtMs = Date.parse(publication.publishedAt);
    const expiresAtMs = Date.parse(publication.expiresAt);
    if (expiresAtMs <= now) {
        throw new Error('PUBLISH: the publication has already expired');
    }
    if (publishedAtMs > now + LIMITS.maxClockSkewMs) {
        throw new Error('PUBLISH: the publication is dated in the future; check this device\'s clock');
    }
    if (expiresAtMs - Math.max(publishedAtMs, now - LIMITS.maxClockSkewMs) > LIMITS.maxPublicationLifetimeMs) {
        throw new Error(`PUBLISH: a publication may last at most ${LIMITS.maxPublicationLifetimeMs / 60000} minutes`);
    }
    return { publishedAtMs, expiresAtMs };
}

// Metered's shared relay, as its dashboard lists it. The TCP variants are
// left out: they stalled ICE gathering for this app (see
// peer/IceServerConfig.js's history, 0.3.4).
function standardMeteredIceServers(username, credential) {
    return [
        { urls: 'stun:stun.relay.metered.ca:80' },
        { urls: 'turn:standard.relay.metered.ca:80', username, credential },
        { urls: 'turn:standard.relay.metered.ca:443', username, credential }
    ];
}

function okResponse(requestId, result) {
    return JSON.stringify({ v: PROTOCOL_VERSION, type: 'OK', requestId, result });
}

function errorResponse(requestId, message) {
    return JSON.stringify({ v: PROTOCOL_VERSION, type: 'ERROR', requestId, message });
}

function messageSize(raw) {
    if (typeof raw === 'string') {
        // Each UTF-16 unit encodes to at most 3 UTF-8 bytes, so a short
        // string needs no encoding to know it is within the limit.
        return raw.length * 3 <= LIMITS.maxMessageBytes ? raw.length : new TextEncoder().encode(raw).byteLength;
    }
    return raw.byteLength;
}

// ------------------------------------------------------------------
// The Durable Object
// ------------------------------------------------------------------

// All rendezvous state for a deployment lives in one Durable Object
// instance (the Worker below always addresses idFromName('global')),
// because LOOKUP works by identity across every connection.
//
// It uses hibernatable WebSockets (ctx.acceptWebSocket), so Cloudflare may
// drop this object's memory between messages while keeping connections
// open. Everything that must survive that lives in ctx.storage or in the
// socket's own attachment and tags, never only in a `this.` field.
export class RendezvousNode {
    constructor(ctx, env = {}) {
        this.ctx = ctx;
        this.env = env;
        const configuredMax = Number.parseInt(env.MAX_ENTRIES, 10);
        this.maxEntries = Number.isFinite(configuredMax) && configuredMax > 0 ? configuredMax : LIMITS.maxEntries;
        this.ctx.blockConcurrencyWhile(async () => {
            const existing = await this.ctx.storage.getAlarm();
            if (existing === null) {
                await this.ctx.storage.setAlarm(Date.now() + SWEEP_INTERVAL_MS);
            }
        });
    }

    async fetch(request) {
        const { pathname } = new URL(request.url);
        if (pathname === '/turn-credentials') {
            return this._handleTurnCredentials(request);
        }
        if (pathname === '/turn-stats') {
            return this._handleTurnStats(request);
        }
        if (request.headers.get('Upgrade') !== 'websocket') {
            return new Response('RendezvousNode: expected a WebSocket upgrade request', { status: 426 });
        }
        // Cloudflare sets CF-Connecting-IP; tagging each socket with it lets
        // getWebSockets(address) count connections even after hibernation.
        const address = request.headers.get('CF-Connecting-IP') || 'unknown';
        if (this.ctx.getWebSockets(address).length >= LIMITS.maxConnectionsPerAddress) {
            return new Response('Too many connections from this address', { status: 429 });
        }
        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);
        this.ctx.acceptWebSocket(server, [address]);
        return new Response(null, { status: 101, webSocket: client });
    }

    // One call per inbound frame. A frame with no requestId gets no reply,
    // since there is nothing to correlate it with.
    async webSocketMessage(ws, raw) {
        if (messageSize(raw) > LIMITS.maxMessageBytes) {
            try { ws.close(1009, 'message too large'); } catch { /* already closing */ }
            return;
        }
        let message;
        try {
            message = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
        } catch {
            return;
        }
        if (!message || typeof message !== 'object' || !isShortString(message.requestId)) {
            return;
        }
        const { type, requestId } = message;
        if (!this._takeRequestToken(ws)) {
            ws.send(errorResponse(requestId, 'rate limit exceeded; slow down'));
            return;
        }
        try {
            let result;
            switch (type) {
                case 'PUBLISH':
                    result = await this._handlePublish(message.publication);
                    break;
                case 'LOOKUP':
                    result = await this._handleLookup(message.identityId);
                    break;
                case 'REMOVE':
                    result = await this._handleRemove(message);
                    break;
                default:
                    throw new Error(`unknown request type "${String(type).slice(0, 32)}"`);
            }
            ws.send(okResponse(requestId, result));
        } catch (err) {
            ws.send(errorResponse(requestId, (err && err.message) || String(err)));
        }
    }

    async webSocketClose(ws, code, reason) {
        try { ws.close(code, reason); } catch { /* already closing */ }
    }

    async webSocketError() {}

    // Token bucket kept in the socket's attachment, so it survives
    // hibernation.
    _takeRequestToken(ws, now = Date.now()) {
        let state = null;
        try { state = ws.deserializeAttachment(); } catch { /* none yet */ }
        const last = state && typeof state.at === 'number' ? state.at : now;
        const saved = state && typeof state.tokens === 'number' ? state.tokens : LIMITS.requestBurst;
        const tokens = Math.min(LIMITS.requestBurst, saved + ((now - last) / 1000) * LIMITS.requestsPerSecond);
        const allowed = tokens >= 1;
        ws.serializeAttachment({ tokens: allowed ? tokens - 1 : tokens, at: now });
        return allowed;
    }

    // PUBLISH replaces the identity's current entry. The publication must be
    // signed by the identity it names, and may not be older than the entry
    // it replaces (or be one the identity withdrew).
    async _handlePublish(publication, now = Date.now()) {
        const { publishedAtMs, expiresAtMs } = checkPublicationShape(publication, now);
        const identityId = publication.invitation.identityHint;
        if (!didKeyToPublicKey(identityId)) {
            throw new Error('PUBLISH: identityHint is not a did:key identity');
        }
        if (!publication.signature) {
            throw new Error('PUBLISH: the publication must be signed by the identity it names; unlock your identity and try again');
        }
        if (!await verifySignature(publicationDescriptor(publication), publication.signature, identityId)) {
            throw new Error('PUBLISH: the signature does not match the publication or its identity');
        }

        const key = STORAGE_KEY_PREFIX + identityId;
        const existing = await this.ctx.storage.get(key);
        const current = existing && existing.expiresAtMs > now ? existing : null;
        if (current) {
            if (publishedAtMs < current.publishedAtMs) {
                throw new Error('PUBLISH: a newer publication for this identity is already stored');
            }
            if (current.removed && current.publication.publicationId === publication.publicationId) {
                throw new Error('PUBLISH: this publication was withdrawn');
            }
        } else if (!existing && await this._entryCount() >= this.maxEntries) {
            throw new Error('PUBLISH: this rendezvous server is full; try again later');
        }

        await this.ctx.storage.put(key, { publication, publishedAtMs, expiresAtMs, removed: false });
        if (!existing) {
            await this._adjustEntryCount(1);
        }
        return publication;
    }

    async _handleLookup(identityId, now = Date.now()) {
        if (!isShortString(identityId)) {
            return [];
        }
        const key = STORAGE_KEY_PREFIX + identityId;
        const entry = await this.ctx.storage.get(key);
        if (!entry) {
            return [];
        }
        if (entry.expiresAtMs <= now) {
            await this._deleteEntry(key);
            return [];
        }
        return entry.removed ? [] : [entry.publication];
    }

    // REMOVE withdraws one publication. It needs the identity's signature
    // over that publicationId, so seeing a publication (anyone can LOOKUP
    // it) is not enough to withdraw it. The entry stays as a tombstone
    // until it expires, so the withdrawn publication cannot be published
    // again.
    async _handleRemove({ identityId, publicationId, signature } = {}, now = Date.now()) {
        if (!isShortString(identityId) || !isShortString(publicationId)) {
            throw new Error('REMOVE: identityId and publicationId are required');
        }
        if (!signature) {
            throw new Error('REMOVE: the request must be signed by the identity it names');
        }
        if (!await verifySignature(removalDescriptor(identityId, publicationId), signature, identityId)) {
            throw new Error('REMOVE: the signature does not match the request or its identity');
        }
        const key = STORAGE_KEY_PREFIX + identityId;
        const entry = await this.ctx.storage.get(key);
        if (!entry || entry.removed || entry.expiresAtMs <= now || entry.publication.publicationId !== publicationId) {
            return false;
        }
        await this.ctx.storage.put(key, { ...entry, removed: true });
        return true;
    }

    async _entryCount() {
        return (await this.ctx.storage.get(ENTRY_COUNT_KEY)) || 0;
    }

    async _adjustEntryCount(delta) {
        await this.ctx.storage.put(ENTRY_COUNT_KEY, Math.max(0, (await this._entryCount()) + delta));
    }

    async _deleteEntry(key) {
        if (await this.ctx.storage.delete(key)) {
            await this._adjustEntryCount(-1);
        }
    }

    // Deletes expired entries and tombstones, recounts what is left, and
    // reschedules itself.
    // GET /turn-credentials: creates a credential with the provider and
    // returns the ICE servers that use it. Rate limited per address.
    async _handleTurnCredentials(request, now = Date.now()) {
        const headers = {
            'content-type': 'application/json',
            'cache-control': 'no-store',
            ...corsHeaders(request, this.env)
        };
        const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers });
        }
        if (request.method !== 'GET') {
            return reply(405, { error: 'use GET' });
        }
        const provider = this._turnProvider();
        if (!provider) {
            return reply(404, { error: 'this rendezvous server offers no TURN relay' });
        }

        const address = request.headers.get('CF-Connecting-IP') || 'unknown';
        const rateKey = TURN_RATE_KEY_PREFIX + address;
        const rateWindow = await this.ctx.storage.get(rateKey);
        const current = rateWindow && now - rateWindow.startedAt < HOUR_MS ? rateWindow : { startedAt: now, count: 0 };
        if (current.count >= LIMITS.turnCredentialsPerAddressPerHour) {
            return reply(429, { error: 'too many TURN credential requests; try again later' });
        }
        await this.ctx.storage.put(rateKey, { ...current, count: current.count + 1 });

        const month = new Date(now).toISOString().slice(0, 7);
        const monthKey = TURN_MONTH_KEY_PREFIX + month;
        const issuedThisMonth = (await this.ctx.storage.get(monthKey)) || 0;
        const monthlyLimit = this._monthlyTurnLimit();
        if (issuedThisMonth >= monthlyLimit) {
            console.warn(`turn-credentials: refused, the monthly allowance is used up (${issuedThisMonth}/${monthlyLimit} in ${month}); raise TURN_CREDENTIALS_PER_MONTH to allow more`);
            return reply(503, { error: 'this rendezvous server\'s relay allowance for the month is used up' });
        }

        try {
            const iceServers = await provider.create();
            const issued = issuedThisMonth + 1;
            await this.ctx.storage.put(monthKey, issued);
            if (issued === Math.ceil(monthlyLimit * TURN_WARNING_FRACTION)) {
                console.warn(`turn-credentials: ${Math.round(TURN_WARNING_FRACTION * 100)}% of the monthly allowance used (${issued}/${monthlyLimit} in ${month})`);
            }
            const expiresAt = new Date(now + LIMITS.turnCredentialLifetimeSeconds * 1000).toISOString();
            return reply(200, { iceServers, expiresAt });
        } catch (err) {
            // `detail` names the failing step and the provider's status or
            // error text; it never contains the secret key.
            const detail = String((err && err.message) || err).split(provider.secret).join('<secret>');
            console.error('turn-credentials:', detail);
            return reply(502, { error: 'the TURN provider did not answer', detail });
        }
    }

    _monthlyTurnLimit() {
        const configured = Number.parseInt(this.env.TURN_CREDENTIALS_PER_MONTH, 10);
        return Number.isFinite(configured) && configured >= 0 ? configured : LIMITS.turnCredentialsPerMonth;
    }

    // GET /turn-stats: this month's relay credential count against the
    // allowance, for the operator. Only counts, nothing secret, so it is
    // open to any caller (including a browser's address bar).
    async _handleTurnStats(request, now = Date.now()) {
        const month = new Date(now).toISOString().slice(0, 7);
        const provider = this._turnProvider();
        const body = {
            month,
            issued: (await this.ctx.storage.get(TURN_MONTH_KEY_PREFIX + month)) || 0,
            limit: this._monthlyTurnLimit(),
            provider: provider ? provider.name : null
        };
        return new Response(JSON.stringify(body), {
            status: request.method === 'GET' ? 200 : 405,
            headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...corsHeaders(request, this.env) }
        });
    }

    // The configured TURN provider, or null. Cloudflare wins when both are
    // configured.
    _turnProvider() {
        const env = this.env;
        if (env.CLOUDFLARE_TURN_KEY_ID && env.CLOUDFLARE_TURN_API_TOKEN) {
            return {
                name: 'cloudflare',
                secret: env.CLOUDFLARE_TURN_API_TOKEN,
                create: () => this._createCloudflareTurnCredential(env.CLOUDFLARE_TURN_KEY_ID, env.CLOUDFLARE_TURN_API_TOKEN)
            };
        }
        if (env.METERED_DOMAIN && env.METERED_SECRET_KEY) {
            return {
                name: 'metered',
                secret: env.METERED_SECRET_KEY,
                create: () => this._createTurnCredential(env.METERED_DOMAIN, env.METERED_SECRET_KEY)
            };
        }
        return null;
    }

    // Cloudflare Realtime TURN: POST .../credentials/generate-ice-servers
    // with the TURN key's API token returns { iceServers: [...] } for a
    // credential lasting `ttl` seconds. Entries on port 53 are dropped:
    // browsers block that port, and trying it only delays ICE gathering.
    async _createCloudflareTurnCredential(keyId, apiToken) {
        const fetchImpl = this.fetchImpl || globalThis.fetch;
        const response = await fetchImpl(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
            method: 'POST',
            headers: { authorization: `Bearer ${apiToken}`, 'content-type': 'application/json' },
            body: JSON.stringify({ ttl: LIMITS.turnCredentialLifetimeSeconds }),
            signal: AbortSignal.timeout(TURN_PROVIDER_TIMEOUT_MS)
        });
        if (!response.ok) {
            const text = (await response.text().catch(() => '')).slice(0, 200);
            throw new Error(`creating a credential: Cloudflare answered ${response.status} ${text}`.trim());
        }
        const body = await response.json().catch(() => null);
        const listed = body && (Array.isArray(body.iceServers) ? body.iceServers : body.iceServers ? [body.iceServers] : null);
        const iceServers = (listed || [])
            .map((entry) => {
                const urls = (Array.isArray(entry.urls) ? entry.urls : [entry.urls]).filter((url) => typeof url === 'string' && !/:53(\?|$)/.test(url));
                return { ...entry, urls };
            })
            .filter((entry) => entry.urls.length > 0);
        if (iceServers.length === 0) {
            throw new Error('creating a credential: Cloudflare returned no ICE servers');
        }
        return iceServers;
    }

    // Metered's REST API: POST /api/v1/turn/credential (secret key) creates
    // an expiring credential ({ username, password, apiKey, ... }); GET
    // /api/v1/turn/credentials with that credential's own apiKey returns its
    // ICE servers, routed to the caller's region. If that listing fails, the
    // new username and password are used with Metered's standard relay.
    async _createTurnCredential(domain, secretKey) {
        const fetchImpl = this.fetchImpl || globalThis.fetch;
        const base = `https://${domain}/api/v1/turn`;
        const created = await fetchImpl(`${base}/credential?secretKey=${encodeURIComponent(secretKey)}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ expiryInSeconds: LIMITS.turnCredentialLifetimeSeconds, label: 'forkbuild' }),
            signal: AbortSignal.timeout(TURN_PROVIDER_TIMEOUT_MS)
        });
        if (!created.ok) {
            const text = (await created.text().catch(() => '')).slice(0, 200);
            throw new Error(`creating a credential: ${domain} answered ${created.status} ${text}`.trim());
        }
        const credential = await created.json().catch(() => null);
        if (!credential || typeof credential.username !== 'string' || typeof credential.password !== 'string') {
            const fields = credential && typeof credential === 'object' ? Object.keys(credential).join(', ') : typeof credential;
            throw new Error(`creating a credential: unexpected response (fields: ${fields})`);
        }
        if (typeof credential.apiKey === 'string') {
            try {
                const listed = await fetchImpl(`${base}/credentials?apiKey=${encodeURIComponent(credential.apiKey)}`, {
                    signal: AbortSignal.timeout(TURN_PROVIDER_TIMEOUT_MS)
                });
                const iceServers = listed.ok ? await listed.json() : null;
                if (Array.isArray(iceServers) && iceServers.length > 0) {
                    return iceServers;
                }
            } catch {
                // Fall through to the standard relay below.
            }
        }
        return standardMeteredIceServers(credential.username, credential.password);
    }

    async alarm() {
        const now = Date.now();
        const currentMonthKey = TURN_MONTH_KEY_PREFIX + new Date(now).toISOString().slice(0, 7);
        for (const key of (await this.ctx.storage.list({ prefix: TURN_MONTH_KEY_PREFIX })).keys()) {
            if (key !== currentMonthKey) await this.ctx.storage.delete(key);
        }
        const rateWindows = await this.ctx.storage.list({ prefix: TURN_RATE_KEY_PREFIX });
        for (const [key, rateWindow] of rateWindows) {
            if (!rateWindow || now - rateWindow.startedAt >= HOUR_MS) {
                await this.ctx.storage.delete(key);
            }
        }
        const entries = await this.ctx.storage.list({ prefix: STORAGE_KEY_PREFIX });
        let remaining = 0;
        for (const [key, entry] of entries) {
            if (!entry || typeof entry.expiresAtMs !== 'number' || entry.expiresAtMs <= now) {
                await this.ctx.storage.delete(key);
            } else {
                remaining++;
            }
        }
        await this.ctx.storage.put(ENTRY_COUNT_KEY, remaining);
        await this.ctx.storage.setAlarm(Date.now() + SWEEP_INTERVAL_MS);
    }
}

// Optional comma-separated ALLOWED_ORIGINS; unset allows any web origin.
function parseAllowedOrigins(raw) {
    if (typeof raw !== 'string' || raw.trim() === '') {
        return null;
    }
    return raw.split(',').map((origin) => origin.trim()).filter(Boolean);
}

// The app runs on another origin, so /turn-credentials needs CORS. Allowed
// origins are ALLOWED_ORIGINS when set, otherwise any.
function corsHeaders(request, env) {
    const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);
    const origin = request.headers.get('Origin');
    const allowed = allowedOrigins ? (allowedOrigins.includes(origin) ? origin : null) : '*';
    return allowed
        ? { 'access-control-allow-origin': allowed, 'access-control-allow-methods': 'GET, OPTIONS', vary: 'Origin' }
        : {};
}

// The Worker entry point: answers a plain GET so an operator can check the
// deployment, and forwards WebSocket upgrades to the Durable Object.
export default {
    async fetch(request, env) {
        const { pathname } = new URL(request.url);
        // The stats page skips the origin check below, so an operator can
        // open it in a browser; it only shows counts.
        if (pathname === '/turn-stats' && env.RENDEZVOUS_NODE) {
            return env.RENDEZVOUS_NODE.get(env.RENDEZVOUS_NODE.idFromName('global')).fetch(request);
        }
        const isTurnRequest = pathname === '/turn-credentials';
        if (!isTurnRequest && request.headers.get('Upgrade') !== 'websocket') {
            return new Response(
                'ForkBuild rendezvous worker is running.\n\n' +
                'This endpoint only understands WebSocket connections speaking the\n' +
                'PUBLISH / LOOKUP / REMOVE protocol documented in\n' +
                'peer/WebSocketRendezvousTransport.js (ForkBuild repo) and in this\n' +
                'folder\'s own README.md.\n',
                { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } }
            );
        }

        const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);
        if (allowedOrigins) {
            const origin = request.headers.get('Origin') || '';
            if (!allowedOrigins.includes(origin)) {
                return new Response('Origin not allowed', { status: 403 });
            }
        }

        if (!env.RENDEZVOUS_NODE) {
            return new Response(
                'RendezvousNode Durable Object binding "RENDEZVOUS_NODE" is not configured; see this folder\'s README.md.',
                { status: 500 }
            );
        }

        const id = env.RENDEZVOUS_NODE.idFromName('global');
        return env.RENDEZVOUS_NODE.get(id).fetch(request);
    }
};
