// 0.3.3 — a reference implementation of the rendezvous wire protocol
// peer/WebSocketRendezvousTransport.js's own header already documents
// (see that file, in the main ForkBuild repo, for the authoritative
// spec this file implements). That file's header explicitly notes
// "this class ships no reference server, only the CLIENT half of a
// small wire protocol any server that wants to be found by this
// codebase can implement" — this worker is exactly that: a small,
// deployable SERVER half, deliberately as "stupid" as
// peer/LocalRendezvousNetwork.js's own in-memory Map (see that file's
// own header) — identityId maps to one current publication, expiring
// on its own, nothing else. It authenticates NO ONE, verifies NO
// signature, and never becomes an authority over who anyone is —
// peer/PeerAuthenticationSession.js, back in the app itself, is still
// the only thing that ever proves that. A malicious or merely buggy
// deployment of this worker can only ever offer bad CANDIDATES; it can
// never forge a successful connection, exactly like every other
// rendezvous mechanism this app already tolerates being wrong.
//
// Deployment target: Cloudflare Workers + one Durable Object, chosen
// for the same reason the p2pcf tutorial this was modeled after picked
// Cloudflare — an always-on WebSocket endpoint with no server to
// patch or restart, on (or very near) Cloudflare's free tier. See this
// folder's own README.md for exactly how to deploy it and how to wire
// the resulting wss:// URL into peer/RendezvousConfig.js.
//
// Wire protocol (verbatim from peer/WebSocketRendezvousTransport.js):
//
//   Client -> Server:
//     { v: 1, type: 'PUBLISH', requestId, publication }   // a RendezvousPublication.toJSON()
//     { v: 1, type: 'LOOKUP',  requestId, identityId }
//     { v: 1, type: 'REMOVE',  requestId, publicationId }
//
//   Server -> Client, exactly one response per request, in any order:
//     { v: 1, type: 'OK',    requestId, result }
//     { v: 1, type: 'ERROR', requestId, message }
//
// This file is intentionally self-contained (no import of anything
// from the main ForkBuild app) — it's deployed completely separately,
// the same "operator configures their own, with its own credentials"
// posture peer/IceServerConfig.js and peer/RendezvousConfig.js already
// hold for TURN servers and rendezvous URLs alike. It re-derives the
// tiny amount of RendezvousPublication shape-checking it needs rather
// than importing core/ or peer/ directly.

const PROTOCOL_VERSION = 1;

// One entry per identityHint, keyed with this prefix inside Durable
// Object storage — mirrors peer/LocalRendezvousNetwork.js's own
// `Map<identityHint, publication>`, just durable across this Durable
// Object hibernating (see RendezvousNode's own header below for why
// that matters).
const STORAGE_KEY_PREFIX = 'pub:';

// How often the alarm sweeps expired entries out of storage. Not the
// SAME thing as a publication's own expiresAt — LOOKUP and PUBLISH
// already treat an expired entry as gone the instant they touch it
// (see _handleLookup/_handlePublish below); this alarm only exists so
// an identity that published once and never came back doesn't sit in
// storage forever. Matches RendezvousPublication's own
// DEFAULT_PUBLICATION_TTL_MS (5 minutes) in the main app, so a sweep
// never runs meaningfully more often than publications actually
// expire.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

// Minimal, deliberately shallow structural validation — NOT a
// signature check (this server verifies no signature — see this
// file's own header) and not a re-implementation of
// peer/RendezvousPublication.js's own constructor rules. Just enough
// to reject something that couldn't possibly be looked up later (no
// identityHint to key it by, no publicationId to REMOVE it by, no
// parseable expiresAt to prune it by).
function isValidPublication(publication) {
    return Boolean(
        publication
        && typeof publication === 'object'
        && typeof publication.publicationId === 'string'
        && publication.publicationId.length > 0
        && publication.invitation
        && typeof publication.invitation === 'object'
        && typeof publication.invitation.identityHint === 'string'
        && publication.invitation.identityHint.length > 0
        && typeof publication.expiresAt === 'string'
        && !Number.isNaN(Date.parse(publication.expiresAt))
    );
}

function okResponse(requestId, result) {
    return JSON.stringify({ v: PROTOCOL_VERSION, type: 'OK', requestId, result });
}

function errorResponse(requestId, message) {
    return JSON.stringify({ v: PROTOCOL_VERSION, type: 'ERROR', requestId, message });
}

// The Durable Object holding ALL rendezvous state for this
// deployment — a single global namespace, not partitioned by room or
// anything else, because peer/RendezvousTransport.js's own contract
// has no such concept: LOOKUP only ever works BY IDENTITY (see that
// file's own header), so there is exactly one shared "where is X
// reachable right now" pointer per identityId, worldwide. The default
// export below always addresses the SAME instance (idFromName('global'))
// so every WebSocket connection — from every browser, anywhere —
// shares one Map. Fine at the scale this app is meant for; a
// higher-traffic deployment could shard by identityId prefix later,
// but that is not attempted here.
//
// Uses the Hibernatable WebSockets API (ctx.acceptWebSocket) rather
// than holding sockets in a plain array, specifically because it lets
// Cloudflare evict this object's in-memory JS state between messages
// without dropping the underlying connections — see this repo's own
// README.md for the cost reasoning. The consequence: nothing here may
// live ONLY in a `this.` field across a hibernation cycle. All actual
// state — every published RendezvousPublication — lives in
// `this.ctx.storage`, never in a plain in-memory Map, precisely so a
// LOOKUP after a hibernation cycle still sees a PUBLISH from before
// it.
export class RendezvousNode {
    constructor(ctx, env) {
        this.ctx = ctx;
        this.env = env;
        // Arms the sweep alarm exactly once per Durable Object
        // lifetime (getAlarm() returns non-null once one is already
        // scheduled) — blockConcurrencyWhile so no request is handled
        // against a not-yet-initialized alarm state.
        this.ctx.blockConcurrencyWhile(async () => {
            const existing = await this.ctx.storage.getAlarm();
            if (existing === null) {
                await this.ctx.storage.setAlarm(Date.now() + SWEEP_INTERVAL_MS);
            }
        });
    }

    // Called by the top-level Worker (see `export default` below) for
    // every request it forwards here — always a WebSocket upgrade in
    // practice, since that's the only kind of request the top-level
    // handler ever forwards.
    async fetch(request) {
        if (request.headers.get('Upgrade') !== 'websocket') {
            return new Response('RendezvousNode: expected a WebSocket upgrade request', { status: 426 });
        }
        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);
        this.ctx.acceptWebSocket(server);
        return new Response(null, { status: 101, webSocket: client });
    }

    // One call per inbound WebSocket text frame, from ANY currently
    // connected client (there is no per-connection state to look up —
    // every request carries everything it needs). A frame that isn't
    // valid JSON, or has no requestId, is silently dropped — there is
    // no requestId to reply against, exactly mirroring
    // WebSocketRendezvousTransport._handleMessage()'s own "ignore
    // anything it cannot correlate" posture on the client side.
    async webSocketMessage(ws, raw) {
        let message;
        try {
            message = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
        } catch {
            return;
        }
        if (!message || typeof message !== 'object' || typeof message.requestId !== 'string' || !message.requestId) {
            return;
        }
        const { type, requestId } = message;
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
                    result = await this._handleRemove(message.publicationId);
                    break;
                default:
                    throw new Error(`unknown request type "${String(type)}"`);
            }
            ws.send(okResponse(requestId, result));
        } catch (err) {
            ws.send(errorResponse(requestId, (err && err.message) || String(err)));
        }
    }

    async webSocketClose(ws, code, reason) {
        try { ws.close(code, reason); } catch { /* already closing */ }
    }

    async webSocketError() {
        // Nothing per-connection to clean up — see this class's own
        // header on why no state is ever attached to a specific
        // socket in the first place.
    }

    // PUBLISH — replaces whatever this node last had stored for the
    // SAME identityHint, exactly like peer/LocalRendezvousNetwork.js's
    // own publish(): "a fresh publish() for the same identity simply
    // overwrites whatever was there before, regardless of endpoint."
    // Echoes the publication straight back, matching what
    // WebSocketRendezvousTransport.publish() expects to re-parse.
    async _handlePublish(publication) {
        if (!isValidPublication(publication)) {
            throw new Error('PUBLISH: invalid publication');
        }
        const key = STORAGE_KEY_PREFIX + publication.invitation.identityHint;
        const expiresAtMs = Date.parse(publication.expiresAt);
        await this.ctx.storage.put(key, { publication, expiresAtMs });
        return publication;
    }

    // LOOKUP — at most one entry, exactly like
    // peer/LocalRendezvousNetwork.js's own lookup(): "identityHint ->
    // one current publication." An expired entry is treated as gone
    // (and opportunistically pruned right here, not just by the
    // alarm) the same way LocalRendezvousNetwork's own
    // _pruneExpired() runs before every lookup.
    async _handleLookup(identityId) {
        if (typeof identityId !== 'string' || !identityId) {
            return [];
        }
        const key = STORAGE_KEY_PREFIX + identityId;
        const entry = await this.ctx.storage.get(key);
        if (!entry) {
            return [];
        }
        if (entry.expiresAtMs <= Date.now()) {
            await this.ctx.storage.delete(key);
            return [];
        }
        return [entry.publication];
    }

    // REMOVE — by publicationId, not by identityHint (a caller
    // withdrawing its OWN publication doesn't necessarily still know
    // what it published under, only the publicationId it got back
    // from publish()) — so this has to scan, exactly like
    // peer/LocalRendezvousNetwork.js's own remove() does over its
    // in-memory Map. The number of currently-live distinct identities
    // is small at this app's intended scale, so an O(n) scan over
    // Durable Object storage is a non-issue.
    async _handleRemove(publicationId) {
        if (typeof publicationId !== 'string' || !publicationId) {
            return false;
        }
        const entries = await this.ctx.storage.list({ prefix: STORAGE_KEY_PREFIX });
        for (const [key, entry] of entries) {
            if (entry && entry.publication && entry.publication.publicationId === publicationId) {
                await this.ctx.storage.delete(key);
                return true;
            }
        }
        return false;
    }

    // The janitor — nothing above ever depends on this running (both
    // PUBLISH's overwrite and LOOKUP's read-time check already handle
    // expiry correctly on their own), it only exists so an identity
    // that published once and never returned doesn't sit in storage
    // forever. Reschedules itself every time it runs.
    async alarm() {
        const now = Date.now();
        const entries = await this.ctx.storage.list({ prefix: STORAGE_KEY_PREFIX });
        for (const [key, entry] of entries) {
            if (!entry || typeof entry.expiresAtMs !== 'number' || entry.expiresAtMs <= now) {
                await this.ctx.storage.delete(key);
            }
        }
        await this.ctx.storage.setAlarm(Date.now() + SWEEP_INTERVAL_MS);
    }
}

// Comma-separated ALLOWED_ORIGINS, same optional-safety-net shape the
// p2pcf worker tutorial this was modeled after already offers — unset
// (the default) means "public, anyone may connect," exactly like a
// fresh peer/RendezvousConfig.js deployment already defaults to no
// restriction at all one layer up. Never required to exist.
function parseAllowedOrigins(raw) {
    if (typeof raw !== 'string' || raw.trim() === '') {
        return null;
    }
    return raw.split(',').map((origin) => origin.trim()).filter(Boolean);
}

// The top-level Worker entry point — the part Cloudflare actually
// routes HTTP(S)/WebSocket requests to. Its only two jobs: answer a
// plain GET with a friendly "yes, I'm deployed" response (the same
// "hit the URL to make sure it's working" check the p2pcf tutorial's
// own README asks for), and forward every WebSocket upgrade to the
// one shared RendezvousNode Durable Object instance.
export default {
    async fetch(request, env) {
        if (request.headers.get('Upgrade') !== 'websocket') {
            return new Response(
                'ForkBuild rendezvous worker is running.\n\n' +
                'This endpoint only understands WebSocket connections speaking the\n' +
                'PUBLISH / LOOKUP / REMOVE protocol documented in\n' +
                'peer/WebSocketRendezvousTransport.js (ForkBuild repo) and in this\n' +
                'folder\'s own README.md — nothing to see here over plain HTTP.\n',
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
                'RendezvousNode Durable Object binding "RENDEZVOUS_NODE" is not configured — see this folder\'s own README.md.',
                { status: 500 }
            );
        }

        const id = env.RENDEZVOUS_NODE.idFromName('global');
        const stub = env.RENDEZVOUS_NODE.get(id);
        return stub.fetch(request);
    }
};
