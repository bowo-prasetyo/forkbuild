import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { inspect } from 'node:util';

import { StorageProvider } from '../storage/StorageProvider.js';
import { TurnServerConfiguration } from '../core/TurnServerConfiguration.js';
import { TurnServerConfigurationStore } from '../storage/TurnServerConfigurationStore.js';
import { resolveTurnServerConfiguration } from '../application/TurnServerConfigurationProvider.js';
import { IceServerConfiguration } from '../core/IceServerConfiguration.js';
import { IceServerConfigurationStore } from '../storage/IceServerConfigurationStore.js';
import { NostrRelayConfiguration } from '../core/NostrRelayConfiguration.js';
import { NostrRelayConfigurationStore } from '../storage/NostrRelayConfigurationStore.js';
import { ArweaveGatewayConfiguration } from '../core/ArweaveGatewayConfiguration.js';
import { ArweaveGatewayConfigurationStore } from '../storage/ArweaveGatewayConfigurationStore.js';
import { RendezvousConfiguration } from '../core/RendezvousConfiguration.js';
import { RendezvousConfigurationStore } from '../storage/RendezvousConfigurationStore.js';
import { WebRtcPeerConnectionProvider } from '../peer/WebRtcPeerConnectionProvider.js';
import { DEFAULT_ICE_SERVERS, fetchIceServers } from '../peer/IceServerConfig.js';

// 0.9.455 — TURN Configuration into WebRTC ICE.
//
// TYPE: production implementation + its own integration test. SCOPE: WebRTC
// composition only (ui/main.js), exactly as commissioned. NOT this
// milestone: any Settings UI (0.9.456), TURN health checking/failover/
// ranking/credential refresh (0.9.453 Section C3, still deferred), and any
// change to core/TurnServerConfiguration.js, storage/
// TurnServerConfigurationStore.js, or application/
// TurnServerConfigurationProvider.js (all 0.9.454, unmodified here).
//
// 0.9.454 gave a user's own TURN relay a validated shape, a durable store,
// and a resolver that hands back either a TurnServerConfiguration instance
// or `null` — "no TURN server," never a fabricated one — but never composed
// it into anything WebRTC actually consumes. This milestone closes exactly
// that gap, at exactly the seam 0.9.453/0.9.454's own headers already
// named:
//
//   TurnServerConfigurationStore -> resolveTurnServerConfiguration() ->
//   TurnServerConfiguration | null -> (this milestone) ui/main.js's own
//   composition -> resolvedIceServers -> WebRtcPeerConnectionProvider ->
//   RTCPeerConnection
//
// THE GOVERNING RULE: ForkBuild supplies TURN configuration to the
// browser's ICE machinery; it never implements TURN selection, retry, or
// failover itself. A configured TURN entry's `urls` (one or more) are
// handed to the browser as ALTERNATIVES in one RTCIceServer entry, never
// split into several entries the way an application-level failover loop
// would try them one at a time.
//
// PRODUCTION CHANGE MADE BY THIS MILESTONE: ui/main.js only. The STUN
// resolution line 0.9.386 already established is renamed from
// `resolvedIceServers` to `resolvedStunServers` (see that file's own 0.9.455
// comment for why); `resolvedIceServers` now names the STUN+TURN composite
// actually handed to WebRtcPeerConnectionProvider and to
// fetchIceServers()'s own `fallback`. peer/WebRtcPeerConnectionProvider.js
// itself is untouched — it already accepted an arbitrary iceServers array
// (proven in 0.9.453 Section D5 and 0.9.454 Section J).
//
// TWELVE LETTERED SECTIONS, mirroring the brief this milestone was
// commissioned under exactly:
//   0. Source-text wiring — the real ui/main.js composition, pinned.
//   A. No TURN configured — existing STUN-only behavior unchanged.
//   B. Single TURN server reaches the real RTCPeerConnection constructor.
//   C. Multiple TURN URLs all reach the ICE boundary in ONE entry.
//   D. STUN + TURN coexistence.
//   E. TURN credential fidelity.
//   F. Credential non-leakage through the signaling payload / diagnostics.
//   G. Configuration replacement — a fresh construction observes the
//      latest saved TURN server; no cache anywhere in the seam.
//   H. Clear configuration — TURN absent again, STUN unaffected.
//   I. Invalid configuration boundary — malformed TURN never reaches
//      RTCPeerConnection.
//   J. Existing WebRTC behavior — relevant existing tests re-run, green.
//   K. No application-level failover.
//   L. Cross-role isolation (Nostr / Arweave / Rendezvous / STUN / and,
//      structurally, every unrelated role directory in this codebase).

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// One shared namespace, several independent store instances over it — the
// same "restart"/"one authority, no bleed" shape every sibling convergence
// audit in this codebase already establishes (e.g. tests/
// TurnServerConfiguration.test.js's own Section G).
class SharedNamespaceStorageProvider extends StorageProvider {
    constructor(sharedNamespace = {}) { super(); this._namespace = sharedNamespace; }
    save(name, data) { this._namespace[name] = JSON.stringify(data); }
    load(name) { return Object.prototype.hasOwnProperty.call(this._namespace, name) ? JSON.parse(this._namespace[name]) : null; }
    remove(name) { delete this._namespace[name]; }
    list() { return Object.keys(this._namespace); }
}

class FakeDataChannel {
    constructor(label) { this.label = label; this._listeners = new Map(); }
    addEventListener(type, handler) {
        if (!this._listeners.has(type)) this._listeners.set(type, new Set());
        this._listeners.get(type).add(handler);
    }
    removeEventListener(type, handler) { this._listeners.get(type)?.delete(handler); }
    send() {}
    close() {}
}

// Starts 'complete' immediately, same as every sibling ICE-composition
// fixture in this codebase (tests/UserConfigurableStunConfiguration.test.js,
// tests/TurnServerConfigurationContractAudit.test.js) — this suite's own
// concern is WHICH iceServers value reaches the real construction call and
// the real signaling payload, never ICE gathering timing itself (already
// proven elsewhere, e.g. tests/IceGatheringTimeout.test.js).
class RecordingRTCPeerConnection {
    constructor({ iceServers } = {}) {
        this.iceServers = iceServers;
        RecordingRTCPeerConnection.constructions.push(iceServers);
        this.iceGatheringState = 'complete';
        this.iceConnectionState = 'new';
        this.localDescription = null;
        this._listeners = new Map();
    }
    addEventListener(type, handler) {
        if (!this._listeners.has(type)) this._listeners.set(type, new Set());
        this._listeners.get(type).add(handler);
    }
    removeEventListener(type, handler) { this._listeners.get(type)?.delete(handler); }
    createDataChannel(label) { return new FakeDataChannel(label); }
    async createOffer() { return { type: 'offer', sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' }; }
    async setLocalDescription(desc) { this.localDescription = desc; }
    close() {}
}
RecordingRTCPeerConnection.constructions = [];

// The exact composition ui/main.js itself performs (see Section 0's own
// source-text assertions, which pin these same lines in real production
// source) — reproduced here, against the REAL production classes, because
// ui/main.js itself is a Vue application entry point with side effects
// (createApp/router) this test suite deliberately never imports, the same
// restraint every sibling composition test in this codebase already holds.
function composeIceServers({ iceServerConfigurationStore, turnServerConfigurationStore }) {
    const resolvedStunServers = (iceServerConfigurationStore.get() || { servers: DEFAULT_ICE_SERVERS }).servers;
    const resolvedTurnServerConfiguration = resolveTurnServerConfiguration({ turnServerConfigurationStore });
    const resolvedIceServers = resolvedTurnServerConfiguration
        ? [...resolvedStunServers, resolvedTurnServerConfiguration.toIceServerEntry()]
        : resolvedStunServers;
    return { resolvedIceServers, resolvedStunServers, resolvedTurnServerConfiguration };
}

function listJsFilesRecursively(dir) {
    const results = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) results.push(...listJsFilesRecursively(full));
        else if (entry.endsWith('.js')) results.push(full);
    }
    return results;
}

async function run() {
    // ===============================================================
    // Section 0 — Source-text wiring. The real ui/main.js composition,
    // pinned against real source, never merely described.
    // ===============================================================
    {
        const mainSource = await source('ui/main.js');

        assert(mainSource.includes("import { TurnServerConfigurationStore } from '../storage/TurnServerConfigurationStore.js';"),
            n('01. ui/main.js imports the real TurnServerConfigurationStore'));
        assert(mainSource.includes("import { resolveTurnServerConfiguration } from '../application/TurnServerConfigurationProvider.js';"),
            n('02. ui/main.js imports the real resolveTurnServerConfiguration()'));

        const storeConstructions = (mainSource.match(/new TurnServerConfigurationStore\(/g) || []).length;
        assert(storeConstructions === 1, n(`03. ui/main.js constructs exactly one TurnServerConfigurationStore instance — found ${storeConstructions}`));
        assert(/new TurnServerConfigurationStore\(new LocalStorageProvider\(\)\)/.test(mainSource),
            n('04. …over the same LocalStorageProvider seam every sibling configuration store already uses'));

        assert(/const resolvedTurnServerConfiguration = resolveTurnServerConfiguration\(\{\s*turnServerConfigurationStore\s*\}\);/.test(mainSource),
            n('05. the resolver is actually called against the real store, not a duck-typed stand-in'));

        assert(/const resolvedStunServers = \(iceServerConfigurationStore\.get\(\) \|\| \{ servers: DEFAULT_ICE_SERVERS \}\)\.servers;/.test(mainSource),
            n('06. the STUN-only resolution (0.9.386) survives completely unmodified in substance — only its own binding was renamed to resolvedStunServers'));

        assert(/const resolvedIceServers = resolvedTurnServerConfiguration\s*\n\s*\? \[\.\.\.resolvedStunServers, resolvedTurnServerConfiguration\.toIceServerEntry\(\)\]\s*\n\s*: resolvedStunServers;/.test(mainSource),
            n('07. resolvedIceServers composes STUN + TURN exactly as specified: TURN appended alongside STUN when configured, resolvedStunServers alone otherwise — never a replacement, never a second mechanism'));

        const resolvedIceServersAssignments = (mainSource.match(/const resolvedIceServers\s*=/g) || []).length;
        assert(resolvedIceServersAssignments === 1, n(`08. resolvedIceServers is still assigned exactly once — found ${resolvedIceServersAssignments}`));

        assert(mainSource.includes('new WebRtcPeerConnectionProvider({ iceServers: resolvedIceServers })'),
            n('09. WebRtcPeerConnectionProvider is still constructed from resolvedIceServers — that provider itself needed ZERO changes for this milestone'));
        assert(mainSource.includes('fetchIceServers({ fallback: resolvedIceServers })'),
            n("10. the Metered TURN-fetching background enrichment still merges with resolvedIceServers — a user's own configured TURN entry rides through as part of that same fallback, on both the fetch-success and fetch-failure path"));

        assert(!/app\.provide\(\s*['"]turnServerConfigurationStore['"]/.test(mainSource),
            n('11. this milestone does NOT provide turnServerConfigurationStore to the Vue app — the Settings UI stays out of scope for 0.9.455, deferred to 0.9.456'));
        assert(!/SetTurnServerConfigurationUseCase/.test(mainSource),
            n('12. no write use case is wired here either — 0.9.455 is read-and-compose only, never a write path'));

        const turnConfigSource = await source('core/TurnServerConfiguration.js');
        assert(!turnConfigSource.includes("import") || !/from '\.\.\/peer\//.test(turnConfigSource),
            n('13. core/TurnServerConfiguration.js still never imports from peer/ — the composition step lives entirely in ui/main.js, not inside the value object'));

        const providerSource = await source('peer/WebRtcPeerConnectionProvider.js');
        assert(!/TurnServerConfiguration/.test(providerSource),
            n('14. peer/WebRtcPeerConnectionProvider.js itself is completely unmodified by this milestone — it remains a transparent, TURN-agnostic browser boundary that merely forwards whatever iceServers array it is given'));

        console.log('\n=== SECTION 0: SOURCE-TEXT WIRING ===');
        console.log('✓ Section 0: the real ui/main.js composes STUN + TURN into one resolvedIceServers array feeding the one, unmodified WebRtcPeerConnectionProvider — pinned against live source.');
    }

    // ===============================================================
    // Section A — No TURN configured: existing STUN-only behavior is
    // completely unchanged.
    // ===============================================================
    {
        const iceServerConfigurationStore = new IceServerConfigurationStore(new InMemoryStorageProvider());
        const turnServerConfigurationStore = new TurnServerConfigurationStore(new InMemoryStorageProvider());

        const { resolvedIceServers, resolvedTurnServerConfiguration } = composeIceServers({ iceServerConfigurationStore, turnServerConfigurationStore });
        assert(resolvedTurnServerConfiguration === null, n('A1. no TURN server on file resolves to null, never a fabricated entry'));
        assert(resolvedIceServers === DEFAULT_ICE_SERVERS, n('A2. resolvedIceServers is exactly DEFAULT_ICE_SERVERS — no wrapper array, no defensive copy forced where none is needed'));

        RecordingRTCPeerConnection.constructions = [];
        const provider = new WebRtcPeerConnectionProvider({ iceServers: resolvedIceServers, RTCPeerConnectionImpl: RecordingRTCPeerConnection });
        provider.createOffer();
        const constructed = RecordingRTCPeerConnection.constructions[0];
        assert(constructed.length === DEFAULT_ICE_SERVERS.length, n('A3. exactly the deployment default STUN servers reach the real RTCPeerConnection constructor — no TURN entry present'));
        assert(!constructed.some((e) => e.username || e.credential), n('A4. not one constructed entry carries a username/credential field when no TURN server is configured'));
        provider.dispose();

        console.log('\n=== SECTION A: NO TURN CONFIGURED ===');
        console.log('✓ Section A: absent TURN configuration reproduces the exact, unmodified STUN-only path.');
    }

    // ===============================================================
    // Section B — Single TURN server reaches the real RTCPeerConnection
    // constructor.
    // ===============================================================
    {
        const iceServerConfigurationStore = new IceServerConfigurationStore(new InMemoryStorageProvider());
        const turnServerConfigurationStore = new TurnServerConfigurationStore(new InMemoryStorageProvider());
        turnServerConfigurationStore.save(new TurnServerConfiguration({
            urls: 'turn:my-own-relay.example:3478', username: 'alice', credential: 'sekret-b'
        }));

        const { resolvedIceServers } = composeIceServers({ iceServerConfigurationStore, turnServerConfigurationStore });
        assert(resolvedIceServers.length === DEFAULT_ICE_SERVERS.length + 1, n('B1. exactly one entry is appended for a single configured TURN server'));

        RecordingRTCPeerConnection.constructions = [];
        const provider = new WebRtcPeerConnectionProvider({ iceServers: resolvedIceServers, RTCPeerConnectionImpl: RecordingRTCPeerConnection });
        provider.createOffer();
        const constructed = RecordingRTCPeerConnection.constructions[0];
        const turnEntry = constructed.find((e) => e.username === 'alice');
        assert(turnEntry, n('B2. the configured TURN entry actually reaches the real RTCPeerConnection constructor call'));
        assert(turnEntry.urls === 'turn:my-own-relay.example:3478', n('B3. a single-url configuration serializes to a plain string urls field'));
        assert(DEFAULT_ICE_SERVERS.every((s) => constructed.some((e) => e.urls === s.urls)), n('B4. the existing STUN entries still reach the same construction call, untouched'));
        provider.dispose();

        console.log('\n=== SECTION B: SINGLE TURN SERVER ===');
        console.log('✓ Section B: a single configured TURN server reaches the real, unmodified RTCPeerConnection boundary.');
    }

    // ===============================================================
    // Section C — Multiple TURN URLs all reach the ICE boundary, in ONE
    // entry — never split into several application-managed attempts.
    // ===============================================================
    {
        const iceServerConfigurationStore = new IceServerConfigurationStore(new InMemoryStorageProvider());
        const turnServerConfigurationStore = new TurnServerConfigurationStore(new InMemoryStorageProvider());
        turnServerConfigurationStore.save(new TurnServerConfiguration({
            urls: ['turn:relay-a.example:3478', 'turns:relay-b.example:5349'],
            username: 'bob', credential: 'sekret-c'
        }));

        const { resolvedIceServers } = composeIceServers({ iceServerConfigurationStore, turnServerConfigurationStore });
        assert(resolvedIceServers.length === DEFAULT_ICE_SERVERS.length + 1,
            n('C1. multiple TURN urls sharing one credential pair still produce exactly ONE additional RTCIceServer entry, never one entry per url'));

        RecordingRTCPeerConnection.constructions = [];
        const provider = new WebRtcPeerConnectionProvider({ iceServers: resolvedIceServers, RTCPeerConnectionImpl: RecordingRTCPeerConnection });
        provider.createOffer();
        const constructed = RecordingRTCPeerConnection.constructions[0];
        const turnEntry = constructed.find((e) => e.username === 'bob');
        assert(Array.isArray(turnEntry.urls) && turnEntry.urls.length === 2, n('C2. both configured TURN urls arrive together, as an array, inside the ONE entry the browser\'s own ICE implementation resolves alternatives from'));
        assert(turnEntry.urls[0] === 'turn:relay-a.example:3478' && turnEntry.urls[1] === 'turns:relay-b.example:5349',
            n('C3. url order is preserved exactly as configured'));
        provider.dispose();

        console.log('\n=== SECTION C: MULTIPLE TURN URLS ===');
        console.log('✓ Section C: multiple TURN urls reach the ICE boundary together, in one RTCIceServer entry — the browser\'s own ICE implementation owns connectivity, never ForkBuild.');
    }

    // ===============================================================
    // Section D — STUN + TURN coexistence: both configurations survive
    // together, neither replacing the other.
    // ===============================================================
    {
        const iceServerConfigurationStore = new IceServerConfigurationStore(new InMemoryStorageProvider());
        iceServerConfigurationStore.save(new IceServerConfiguration({
            servers: [{ urls: 'stun:my-own-stun.example:3478' }, { urls: 'stun:my-second-stun.example:3478' }]
        }));
        const turnServerConfigurationStore = new TurnServerConfigurationStore(new InMemoryStorageProvider());
        turnServerConfigurationStore.save(new TurnServerConfiguration({
            urls: 'turn:my-own-relay.example:3478', username: 'carol', credential: 'sekret-d'
        }));

        const { resolvedIceServers } = composeIceServers({ iceServerConfigurationStore, turnServerConfigurationStore });
        assert(resolvedIceServers.length === 3, n('D1. two configured STUN servers plus one TURN entry — three entries total, neither substrate crowding out the other'));

        RecordingRTCPeerConnection.constructions = [];
        const provider = new WebRtcPeerConnectionProvider({ iceServers: resolvedIceServers, RTCPeerConnectionImpl: RecordingRTCPeerConnection });
        provider.createOffer();
        const constructed = RecordingRTCPeerConnection.constructions[0];
        assert(constructed.some((e) => e.urls === 'stun:my-own-stun.example:3478'), n('D2. the first configured STUN server survives construction'));
        assert(constructed.some((e) => e.urls === 'stun:my-second-stun.example:3478'), n('D3. the second configured STUN server survives construction'));
        assert(constructed.some((e) => e.username === 'carol'), n('D4. the configured TURN entry survives construction alongside both STUN entries'));
        provider.dispose();

        // D5. The SAME resolvedIceServers also feeds ui/main.js's own
        // fetchIceServers({ fallback: resolvedIceServers }) background
        // enrichment call (see Section 0's own assertion #10) — confirming
        // the configured TURN entry survives THAT step too, in both
        // directions: a failed/slow Metered fetch degrades to fallback
        // as-is, and a successful one merges fetched entries alongside it.
        const failedFetch = await fetchIceServers({ apiKey: 'k', fetchImpl: async () => { throw new Error('unreachable'); }, fallback: resolvedIceServers });
        assert(failedFetch === resolvedIceServers, n('D5. a failed Metered fetch degrades to exactly resolvedIceServers, TURN entry included, unchanged'));

        const meteredEntry = { urls: 'turn:standard.relay.metered.ca:80', username: 'metered-u', credential: 'metered-c' };
        const succeededFetch = await fetchIceServers({
            apiKey: 'k',
            fetchImpl: async () => ({ ok: true, json: async () => [meteredEntry] }),
            fallback: resolvedIceServers
        });
        assert(succeededFetch.some((e) => e.username === 'carol'), n('D6. a successful Metered fetch still carries the user\'s own configured TURN entry through, via the fallback merge'));
        assert(succeededFetch.some((e) => e.username === 'metered-u'), n('D7. …alongside whatever the Metered fetch itself returned'));

        console.log('\n=== SECTION D: STUN + TURN COEXISTENCE ===');
        console.log('✓ Section D: a custom STUN list and a configured TURN server compose together without either replacing the other.');
    }

    // ===============================================================
    // Section E — TURN credential fidelity: username and credential
    // arrive exactly where RTCIceServer expects them.
    // ===============================================================
    {
        const iceServerConfigurationStore = new IceServerConfigurationStore(new InMemoryStorageProvider());
        const turnServerConfigurationStore = new TurnServerConfigurationStore(new InMemoryStorageProvider());
        turnServerConfigurationStore.save(new TurnServerConfiguration({
            urls: 'turn:my-own-relay.example:3478', username: 'dave-user', credential: 'p@ss/w0rd+special=chars'
        }));

        const { resolvedIceServers } = composeIceServers({ iceServerConfigurationStore, turnServerConfigurationStore });
        RecordingRTCPeerConnection.constructions = [];
        const provider = new WebRtcPeerConnectionProvider({ iceServers: resolvedIceServers, RTCPeerConnectionImpl: RecordingRTCPeerConnection });
        provider.createOffer();
        const constructed = RecordingRTCPeerConnection.constructions[0];
        const turnEntry = constructed.find((e) => e.urls === 'turn:my-own-relay.example:3478');
        assert(turnEntry.username === 'dave-user', n('E1. username arrives byte-for-byte'));
        assert(turnEntry.credential === 'p@ss/w0rd+special=chars', n('E2. credential arrives byte-for-byte, including special characters, never re-encoded or truncated'));
        provider.dispose();

        console.log('\n=== SECTION E: TURN CREDENTIAL FIDELITY ===');
        console.log('✓ Section E: username/credential reach RTCIceServer exactly as configured.');
    }

    // ===============================================================
    // Section F — Credential non-leakage: the credential must not leak
    // through any diagnostic path other than the RTCIceServer entry itself.
    // ===============================================================
    {
        const iceServerConfigurationStore = new IceServerConfigurationStore(new InMemoryStorageProvider());
        const turnServerConfigurationStore = new TurnServerConfigurationStore(new InMemoryStorageProvider());
        const SECRET = 'do-not-leak-this-credential-xyz789';
        turnServerConfigurationStore.save(new TurnServerConfiguration({
            urls: 'turn:my-own-relay.example:3478', username: 'erin', credential: SECRET
        }));

        const { resolvedTurnServerConfiguration } = composeIceServers({ iceServerConfigurationStore, turnServerConfigurationStore });

        // F1. Never through toString()/console.log() (util.inspect) at the
        // composition boundary itself — 0.9.454 already proved this for the
        // value object in isolation; reconfirmed here at the point this
        // milestone actually reads it.
        assert(!String(resolvedTurnServerConfiguration).includes(SECRET), n('F1. resolvedTurnServerConfiguration\'s own toString() never includes the raw credential'));
        assert(!inspect(resolvedTurnServerConfiguration).includes(SECRET), n('F2. util.inspect() (console.log) of the resolved configuration never includes the raw credential'));

        // F3. Never through a thrown composition error.
        try {
            composeIceServers({ iceServerConfigurationStore: { get: () => { throw new Error('boom'); } }, turnServerConfigurationStore });
            assert(false, n('F3. sanity — composeIceServers should have thrown for this deliberately broken STUN store'));
        } catch (error) {
            assert(!String(error).includes(SECRET), n('F3. a composition-time error never interpolates the TURN credential'));
        }

        // F4. Never through the WebRTC signaling payload actually produced —
        // the one NEW diagnostic surface this milestone's own composition
        // step feeds into. A real PeerConnectionOffer only ever carries sdp/
        // iceCandidates/timestamps (see peer/PeerConnectionOffer.js) — never
        // the iceServers array itself — reconfirmed live here rather than
        // merely cited from that file's own shape.
        const { resolvedIceServers } = composeIceServers({ iceServerConfigurationStore, turnServerConfigurationStore });
        RecordingRTCPeerConnection.constructions = [];
        const provider = new WebRtcPeerConnectionProvider({ iceServers: resolvedIceServers, RTCPeerConnectionImpl: RecordingRTCPeerConnection });
        const connection = provider.createOffer();
        const localSignal = await new Promise((resolve) => connection.onLocalSignalReady(resolve));
        assert(!JSON.stringify(localSignal.toJSON()).includes(SECRET), n('F4. the actual signaling payload handed to a remote peer never contains the TURN credential'));
        provider.dispose();

        console.log('\n=== SECTION F: CREDENTIAL NON-LEAKAGE ===');
        console.log('✓ Section F: the credential reaches only the RTCIceServer entry itself — never toString(), console.log, a thrown composition error, or the signaling payload sent to a remote peer.');
    }

    // ===============================================================
    // Section G — Configuration replacement: a fresh construction
    // observes the newly-saved TURN server — no cache anywhere in this
    // seam.
    // ===============================================================
    {
        const iceServerConfigurationStore = new IceServerConfigurationStore(new InMemoryStorageProvider());
        const turnServerConfigurationStore = new TurnServerConfigurationStore(new InMemoryStorageProvider());
        turnServerConfigurationStore.save(new TurnServerConfiguration({ urls: 'turn:relay-a.example:3478', username: 'a', credential: 'secret-a' }));

        let { resolvedIceServers } = composeIceServers({ iceServerConfigurationStore, turnServerConfigurationStore });
        RecordingRTCPeerConnection.constructions = [];
        let provider = new WebRtcPeerConnectionProvider({ iceServers: resolvedIceServers, RTCPeerConnectionImpl: RecordingRTCPeerConnection });
        provider.createOffer();
        assert(RecordingRTCPeerConnection.constructions[0].some((e) => e.urls === 'turn:relay-a.example:3478'),
            n('G1. the first configured TURN server (A) reaches construction'));
        provider.dispose();

        turnServerConfigurationStore.save(new TurnServerConfiguration({ urls: 'turn:relay-b.example:3478', username: 'b', credential: 'secret-b' }));
        ({ resolvedIceServers } = composeIceServers({ iceServerConfigurationStore, turnServerConfigurationStore }));
        RecordingRTCPeerConnection.constructions = [];
        provider = new WebRtcPeerConnectionProvider({ iceServers: resolvedIceServers, RTCPeerConnectionImpl: RecordingRTCPeerConnection });
        provider.createOffer();
        const constructed = RecordingRTCPeerConnection.constructions[0];
        assert(constructed.some((e) => e.urls === 'turn:relay-b.example:3478'), n('G2. a fresh composition, after replacement, observes the NEW configured TURN server (B)'));
        assert(!constructed.some((e) => e.urls === 'turn:relay-a.example:3478'), n('G3. …and the OLD one (A) is genuinely gone, not merely appended alongside — this seam holds no stale cache'));
        provider.dispose();

        console.log('\n=== SECTION G: CONFIGURATION REPLACEMENT ===');
        console.log('✓ Section G: replacing the configured TURN server is observed by the next composition immediately — resolveTurnServerConfiguration()\'s own "never a cache" contract holds at the real WebRTC boundary.');
    }

    // ===============================================================
    // Section H — Clear configuration: TURN absent again, STUN
    // unaffected.
    // ===============================================================
    {
        const iceServerConfigurationStore = new IceServerConfigurationStore(new InMemoryStorageProvider());
        iceServerConfigurationStore.save(new IceServerConfiguration({ servers: [{ urls: 'stun:my-own-stun.example:3478' }] }));
        const turnServerConfigurationStore = new TurnServerConfigurationStore(new InMemoryStorageProvider());
        turnServerConfigurationStore.save(new TurnServerConfiguration({ urls: 'turn:relay.example:3478', username: 'f', credential: 'secret-f' }));

        let { resolvedIceServers } = composeIceServers({ iceServerConfigurationStore, turnServerConfigurationStore });
        assert(resolvedIceServers.length === 2, n('H1. sanity — one STUN entry plus one TURN entry before clearing'));

        turnServerConfigurationStore.clear();
        ({ resolvedIceServers } = composeIceServers({ iceServerConfigurationStore, turnServerConfigurationStore }));
        assert(resolvedIceServers.length === 1 && resolvedIceServers[0].urls === 'stun:my-own-stun.example:3478',
            n('H2. after clear(), TURN is genuinely absent again — only the configured STUN server remains, completely unaffected by the TURN clear'));

        RecordingRTCPeerConnection.constructions = [];
        const provider = new WebRtcPeerConnectionProvider({ iceServers: resolvedIceServers, RTCPeerConnectionImpl: RecordingRTCPeerConnection });
        provider.createOffer();
        const constructed = RecordingRTCPeerConnection.constructions[0];
        assert(constructed.length === 1 && !constructed[0].username, n('H3. the real construction call carries no TURN entry after clear()'));
        provider.dispose();

        console.log('\n=== SECTION H: CLEAR CONFIGURATION ===');
        console.log('✓ Section H: clearing the TURN configuration removes it from the next composition while leaving STUN completely untouched.');
    }

    // ===============================================================
    // Section I — Invalid configuration boundary: malformed TURN
    // configuration must never reach RTCPeerConnection.
    // ===============================================================
    {
        const iceServerConfigurationStore = new IceServerConfigurationStore(new InMemoryStorageProvider());
        const rawStorage = new InMemoryStorageProvider();
        const turnServerConfigurationStore = new TurnServerConfigurationStore(rawStorage);

        // Bypass TurnServerConfiguration's own constructor validation
        // entirely — writing directly to the underlying StorageProvider,
        // exactly the way a corrupted browser localStorage entry would
        // look, per storage/TurnServerConfigurationStore.js's own header
        // ("malformed data degrades; a genuine storage failure
        // propagates").
        for (const malformed of [
            { urls: ['stun:not-a-turn-url.example:3478'], username: 'g', credential: 'g' },
            { urls: [], username: 'g', credential: 'g' },
            { urls: 'turn:relay.example:3478', username: '', credential: 'g' },
            { urls: 'turn:relay.example:3478', username: 'g', credential: '' },
            { urls: 'turn:relay.example:3478' },
            'not-even-an-object',
            null
        ]) {
            rawStorage.save('turn-server-configuration', malformed);
            const { resolvedIceServers, resolvedTurnServerConfiguration } = composeIceServers({ iceServerConfigurationStore, turnServerConfigurationStore });
            assert(resolvedTurnServerConfiguration === null,
                n(`I1. malformed persisted TURN data (${JSON.stringify(malformed)}) resolves to null, never a partially-valid entry`));
            assert(!resolvedIceServers.some((e) => e.username || e.credential),
                n('I1. …and no TURN-shaped entry (a username/credential field) reaches the composed iceServers array'));

            RecordingRTCPeerConnection.constructions = [];
            const provider = new WebRtcPeerConnectionProvider({ iceServers: resolvedIceServers, RTCPeerConnectionImpl: RecordingRTCPeerConnection });
            provider.createOffer();
            const constructed = RecordingRTCPeerConnection.constructions[0];
            assert(!constructed.some((e) => e.username || e.credential),
                n('I2. …confirmed at the real RTCPeerConnection construction call itself — malformed TURN data never reaches it'));
            provider.dispose();
        }
        rawStorage.remove('turn-server-configuration');

        console.log('\n=== SECTION I: INVALID CONFIGURATION BOUNDARY ===');
        console.log('✓ Section I: every malformed-persisted-TURN shape degrades to absence before composition, and never reaches the real RTCPeerConnection constructor.');
    }

    // ===============================================================
    // Section J — Existing WebRTC behavior: relevant existing tests
    // re-run, green, to demonstrate no regression.
    // ===============================================================
    {
        // tests/WebRtcPeerTransport.test.js is deliberately NOT included
        // here — it requires a real browser `RTCPeerConnection` global and
        // only ever runs inside tests.html's own browser test runner; it
        // fails identically under plain `node`, on the unmodified `main`
        // branch, regardless of this milestone's own changes (verified
        // live before selecting this list). tests/TurnServerConfiguration
        // .test.js and tests/TurnServerConfigurationContractAudit.test.js
        // are ALSO deliberately excluded here — each carries its own
        // git-status-based "no unexpected file changed" production guard,
        // scoped to ITS OWN historical commit, which spuriously fails
        // against ANY concurrently uncommitted working-tree change
        // (including this very milestone's own, still-uncommitted files)
        // — a property of running them via a live child process
        // mid-session, not a real regression; both are already exercised
        // in-process, directly, throughout Sections A-L above. Every file
        // below is a real, node-runnable regression test that actually
        // exercises WebRtcPeerConnectionProvider/WebRtcPeerConnection or
        // this milestone's own upstream configuration classes, with no
        // such working-tree-sensitive guard of its own.
        const relevantTests = [
            'tests/IceServerConfig.test.js',
            'tests/IceGatheringTimeout.test.js',
            'tests/PeerConnectionResilience.test.js',
            'tests/UserConfigurableStunConfiguration.test.js'
        ];
        for (const relativePath of relevantTests) {
            let output = '';
            let failed = false;
            try {
                output = execSync(`node ${relativePath}`, { cwd: SOURCE_ROOT.pathname, encoding: 'utf8' });
            } catch (error) {
                failed = true;
                output = (error.stdout || '') + (error.stderr || '');
            }
            assert(!failed, n(`J1. ${relativePath} still passes unmodified after this milestone's own composition change (output: ${output.slice(-500)})`));
        }

        console.log('\n=== SECTION J: EXISTING WEBRTC BEHAVIOR ===');
        console.log(`✓ Section J: ${relevantTests.length} relevant existing test files re-run clean, live, as real child processes — no regression from this milestone's own composition change.`);
    }

    // ===============================================================
    // Section K — No application-level failover: multiple TURN URLs are
    // passed to ICE as alternatives, never manually sequenced.
    // ===============================================================
    {
        const iceServerConfigurationStore = new IceServerConfigurationStore(new InMemoryStorageProvider());
        const turnServerConfigurationStore = new TurnServerConfigurationStore(new InMemoryStorageProvider());
        turnServerConfigurationStore.save(new TurnServerConfiguration({
            urls: ['turn:relay-a.example:3478', 'turn:relay-b.example:3478', 'turns:relay-c.example:5349'],
            username: 'h', credential: 'secret-h'
        }));
        const { resolvedIceServers } = composeIceServers({ iceServerConfigurationStore, turnServerConfigurationStore });

        RecordingRTCPeerConnection.constructions = [];
        const provider = new WebRtcPeerConnectionProvider({ iceServers: resolvedIceServers, RTCPeerConnectionImpl: RecordingRTCPeerConnection });
        provider.createOffer();
        const constructed = RecordingRTCPeerConnection.constructions[0];
        assert(constructed.length === DEFAULT_ICE_SERVERS.length + 1,
            n('K1. three TURN urls sharing one credential still produce exactly ONE RTCIceServer entry — never three separate application-managed attempts'));
        const turnEntry = constructed.find((e) => e.username === 'h');
        assert(Array.isArray(turnEntry.urls) && turnEntry.urls.length === 3, n('K2. all three urls are handed to the browser together, as alternatives'));
        provider.dispose();

        const providerSource = await source('peer/WebRtcPeerConnectionProvider.js');
        assert(!/for \(const .*(url|server|turn)/i.test(providerSource),
            n('K3. peer/WebRtcPeerConnectionProvider.js contains no per-url/per-server iteration that could implement a manual failover loop'));
        assert(!/retry|failover|fallback.*turn|rank/i.test(providerSource),
            n('K4. peer/WebRtcPeerConnectionProvider.js contains no retry/failover/ranking vocabulary of any kind'));

        const mainSource = await source('ui/main.js');
        const composedRegion = mainSource.slice(mainSource.indexOf('const turnServerConfigurationStore'), mainSource.indexOf('const peerConnectionProvider'));
        assert(!/try\s*{[\s\S]*catch/.test(composedRegion), n('K5. ui/main.js\'s own TURN composition contains no try/catch — a malformed or absent TURN configuration is handled entirely by resolveTurnServerConfiguration()\'s own null-or-value contract, never a local retry/catch'));

        console.log('\n=== SECTION K: NO APPLICATION-LEVEL FAILOVER ===');
        console.log('✓ Section K: multiple TURN URLs reach ICE as alternatives in one entry; no per-server iteration, retry, or ranking exists anywhere in this seam.');
    }

    // ===============================================================
    // Section L — Cross-role isolation: TURN configuration must not
    // affect Nostr, Arweave, Bitcoin, Snapshot, Place Naming, or any
    // other unrelated discovery/role surface.
    // ===============================================================
    {
        // L1. Structural — no unrelated role directory references TURN
        // configuration at all, in either direction.
        const roleDirectories = ['nostr', 'arweave', 'anchoring', 'placement', 'world-layout', 'discovery', 'world', 'publisher', 'presence', 'collaboration', 'replication'];
        const offendingFiles = [];
        for (const dir of roleDirectories) {
            let files = [];
            try { files = listJsFilesRecursively(new URL(`${dir}/`, SOURCE_ROOT).pathname); } catch { continue; }
            for (const file of files) {
                const text = await readFile(file, 'utf8');
                if (/Turn(Server)?Configuration/.test(text)) offendingFiles.push(file);
            }
        }
        assert(offendingFiles.length === 0,
            n(`L1. no file under Nostr/Arweave/Bitcoin(anchoring)/Place-Naming(placement, world-layout)/discovery/presence/collaboration/replication references TurnServerConfiguration in any way (found: ${JSON.stringify(offendingFiles)})`));

        // L2. Behavioral — TURN configuration lives in its own storage
        // namespace, verified against real sibling configuration stores
        // sharing one underlying namespace object, extending 0.9.454's own
        // STUN-only isolation check (Section G) to every sibling
        // configuration family this codebase currently persists.
        const sharedNamespace = {};
        const nostrStore = new NostrRelayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        const arweaveStore = new ArweaveGatewayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        const rendezvousStore = new RendezvousConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        const stunStore = new IceServerConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        const turnStore = new TurnServerConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));

        nostrStore.save(new NostrRelayConfiguration({ relayUrl: 'wss://my-relay.example' }));
        arweaveStore.save(new ArweaveGatewayConfiguration({ gatewayUrl: 'https://my-gateway.example' }));
        rendezvousStore.save(new RendezvousConfiguration({ urls: ['wss://my-rendezvous.example'] }));
        stunStore.save(new IceServerConfiguration({ servers: [{ urls: 'stun:my-stun.example:3478' }] }));
        turnStore.save(new TurnServerConfiguration({ urls: 'turn:my-turn.example:3478', username: 'l', credential: 'secret-l' }));

        assert(nostrStore.get().relayUrl === 'wss://my-relay.example', n('L2. Nostr relay configuration is unaffected by TURN configuration sharing the same underlying namespace'));
        assert(arweaveStore.get().gatewayUrl === 'https://my-gateway.example', n('L3. Arweave gateway configuration is unaffected'));
        assert(JSON.stringify(rendezvousStore.get().urls) === JSON.stringify(['wss://my-rendezvous.example']), n('L4. Rendezvous configuration is unaffected'));
        assert(stunStore.get().servers[0].urls === 'stun:my-stun.example:3478', n('L5. STUN configuration is unaffected'));
        assert(turnStore.get().username === 'l', n('L6. …and TURN configuration itself round-trips correctly alongside all four siblings, with none of the five colliding on storage key'));

        const keys = Object.keys(sharedNamespace);
        assert(new Set(keys).size === keys.length, n(`L7. all five configuration families landed under distinct storage keys — no key collision (keys: ${JSON.stringify(keys)})`));

        console.log('\n=== SECTION L: CROSS-ROLE ISOLATION ===');
        console.log('✓ Section L: TURN configuration touches no unrelated role directory, and its own storage lives in a genuinely separate namespace from every sibling configuration family this codebase persists.');
    }

    console.log(`\n✅ All TURN Configuration into WebRTC ICE integration tests passed (${assertionCount} assertions).`);
}

run().catch((error) => {
    console.error('TurnWebRtcIntegration.test.js FAILED:', error);
    process.exitCode = 1;
});
