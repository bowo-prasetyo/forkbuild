// Short links to builds sent to everyone (GET /n/<publication id>): the app
// sends each such build to the public Nostr relays as a build note (the main
// repository's core/publication/BuildNote.js; docs/Protocol.md, "Build notes"), whose
// content is exactly the payload a /b/<payload> link carries. A short link
// names the build instead of carrying it, so it stays about 90 characters and
// fits in any chat. This file finds the note on the relays; buildPreview.js
// checks it as it checks a /b/ payload and serves the same preview.
//
// The worker keeps nothing and adds no network: it asks the relays the app
// itself reads, with one REQ per relay, and closes each socket at EOSE or
// after RELAY_TIMEOUT_MS. A note's own Nostr signature isn't checked here:
// it proves only which carrier key sent it, and anyone can send a note under
// any build's id. What is trusted is the builder's own signature inside the
// payload, which buildPreview.js checks; the notes are tried newest first
// until one checks out. Like worker.js, this file imports nothing from the app
// (tests/ShortLinks.test.js checks it agrees with core/publication/BuildNote.js).

export const BUILD_NOTE_KIND = 30078;
export const BUILD_NOTE_D_PREFIX = 'forkbuild-build:';
// As core/publication/BuildNote.js: the longest payload a note carries, and the most
// notes asked for one build.
export const MAX_NOTE_PAYLOAD_LENGTH = 48000;
export const NOTE_CANDIDATE_LIMIT = 10;
// The relays asked when the deployment names none (NOSTR_RELAYS): the app's
// own defaults (core/networks/NostrRelayConfiguration.js).
export const DEFAULT_NOTE_RELAYS = Object.freeze(['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net']);
// How long one relay may take to answer; a short link's preview waits for
// the slowest relay at most this long.
export const RELAY_TIMEOUT_MS = 4000;
const MAX_RELAYS = 8;

const PUBLICATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function isNotePublicationId(publicationId) {
    return typeof publicationId === 'string' && PUBLICATION_ID_PATTERN.test(publicationId);
}

// The relays to ask: NOSTR_RELAYS (comma-separated wss:// addresses) when the
// deployment sets it, else the app's defaults.
export function noteRelaysOf(env) {
    if (typeof env?.NOSTR_RELAYS !== 'string') return [...DEFAULT_NOTE_RELAYS];
    return env.NOSTR_RELAYS.split(',').map((relay) => relay.trim()).filter((relay) => /^wss:\/\/[^\s/]+/.test(relay)).slice(0, MAX_RELAYS);
}

export function noteFilter(publicationId) {
    return { kinds: [BUILD_NOTE_KIND], '#d': [BUILD_NOTE_D_PREFIX + publicationId], limit: NOTE_CANDIDATE_LIMIT };
}

// The payloads of the notes for `publicationId` among `events`, each once,
// newest first and at most NOTE_CANDIDATE_LIMIT. Mirrors core/publication/BuildNote.js's
// readBuildNote() and buildNotesForPublication().
export function notePayloads(events, publicationId) {
    const notes = [];
    const seen = new Set();
    for (const event of Array.isArray(events) ? events : []) {
        if (!event || event.kind !== BUILD_NOTE_KIND || !Array.isArray(event.tags)) continue;
        const dTag = event.tags.find((tag) => Array.isArray(tag) && tag[0] === 'd');
        if (!dTag || dTag[1] !== BUILD_NOTE_D_PREFIX + publicationId) continue;
        if (typeof event.content !== 'string' || event.content.length > MAX_NOTE_PAYLOAD_LENGTH + 16384) continue;
        let content;
        try {
            content = JSON.parse(event.content);
        } catch {
            continue;
        }
        if (!content || content.v !== 1 || typeof content.payload !== 'string' || !content.payload
            || content.payload.length > MAX_NOTE_PAYLOAD_LENGTH || seen.has(content.payload)) continue;
        seen.add(content.payload);
        notes.push({ payload: content.payload, createdAt: Number.isFinite(event.created_at) ? event.created_at : 0 });
    }
    return notes.sort((a, b) => b.createdAt - a.createdAt).slice(0, NOTE_CANDIDATE_LIMIT).map((note) => note.payload);
}

// Every relay's events for the build's notes, asked all at once; a relay that
// fails or is slow adds nothing. `queryRelay(relayUrl, filter)` resolves to
// events.
export async function fetchNoteEvents(publicationId, { relays, queryRelay }) {
    const filter = noteFilter(publicationId);
    const answers = await Promise.all(relays.map(async (relayUrl) => {
        try {
            const events = await queryRelay(relayUrl, filter);
            return Array.isArray(events) ? events : [];
        } catch {
            return [];
        }
    }));
    return answers.flat();
}

// One relay's answer to `filter` over a WebSocket the worker opens itself
// (Cloudflare Workers open a client WebSocket with fetch() and an Upgrade
// header): every EVENT before EOSE, or whatever arrived before CLOSED, an
// error, the socket closing or `timeoutMs`. Never rejects once connected.
export async function queryRelayOverWebSocket(relayUrl, filter, { timeoutMs = RELAY_TIMEOUT_MS, fetchImpl = fetch } = {}) {
    const response = await fetchImpl(relayUrl.replace(/^ws/, 'http'), { headers: { Upgrade: 'websocket' } });
    const socket = response.webSocket;
    if (!socket) throw new Error(`relay ${relayUrl} did not accept a WebSocket`);
    socket.accept();
    const subscriptionId = `fb${Math.random().toString(36).slice(2, 12)}`;
    return new Promise((resolve) => {
        const events = [];
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            try {
                socket.send(JSON.stringify(['CLOSE', subscriptionId]));
                socket.close(1000, 'done');
            } catch {
                // Already gone.
            }
            resolve(events);
        };
        const timer = setTimeout(finish, timeoutMs);
        socket.addEventListener('message', (message) => {
            let frame;
            try {
                frame = JSON.parse(typeof message.data === 'string' ? message.data : '');
            } catch {
                return;
            }
            if (!Array.isArray(frame) || frame[1] !== subscriptionId) return;
            if (frame[0] === 'EVENT' && frame[2] && typeof frame[2] === 'object') {
                events.push(frame[2]);
                if (events.length >= NOTE_CANDIDATE_LIMIT) finish();
            } else if (frame[0] === 'EOSE' || frame[0] === 'CLOSED') {
                finish();
            }
        });
        socket.addEventListener('close', finish);
        socket.addEventListener('error', finish);
        socket.send(JSON.stringify(['REQ', subscriptionId, filter]));
    });
}
