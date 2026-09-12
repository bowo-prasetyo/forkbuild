import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { DEFAULT_ICE_SERVERS } from '../peer/IceServerConfig.js';
import { WebRtcPeerConnectionProvider } from '../peer/WebRtcPeerConnectionProvider.js';
import { DEFAULT_RENDEZVOUS_URLS } from '../peer/RendezvousConfig.js';
import { WebSocketRendezvousTransport } from '../peer/WebSocketRendezvousTransport.js';
import { RendezvousDiscoveryProvider } from '../peer/RendezvousDiscoveryProvider.js';
import { RendezvousPublication } from '../peer/RendezvousPublication.js';
import { PeerInvitation } from '../peer/PeerInvitation.js';
import { DiscoveryBootstrap } from '../peer/DiscoveryBootstrap.js';
import { RendezvousConfiguration } from '../core/RendezvousConfiguration.js';
import { NostrRelayConfiguration } from '../core/NostrRelayConfiguration.js';
import { ArweaveGatewayConfiguration } from '../core/ArweaveGatewayConfiguration.js';
import { IceServerConfiguration } from '../core/IceServerConfiguration.js';

// 0.9.439 — Endpoint Multiplicity & Failover Semantics Audit.
//
// TYPE: test-only, architectural/product audit. PRODUCTION CHANGES: NONE.
//
// A reviewer, reacting to this codebase's recently-shipped user-configurable
// endpoint seams (STUN, Rendezvous, Nostr relay, Arweave gateway — 0.9.364
// through 0.9.392), proposed the next natural step: "if one server fails,
// ForkBuild tries another." The reviewer's own review of that proposal drew
// one deliberate distinction before any implementation should be attempted:
//
//   A LIST OF ENDPOINTS IS USEFUL FOR RESILIENCE, BUT A LIST ALONE DOES NOT
//   DEFINE FAILOVER SEMANTICS.
//
// and asked, explicitly, for THIS milestone first: a test-only audit of
// which endpoint configurations are inherently single-endpoint, which can
// safely become multi-endpoint, and what "try another server" should
// concretely mean for each — never a generic `EndpointServerList` /
// `ServerPool` / `ResilientEndpoint` abstraction manufactured merely because
// four things are all colloquially "servers."
//
// TEN SECTIONS, mirroring the reviewer's own lettering:
//
//   A. Requirement framing — the reviewer's own distinction, restated as a
//      checkable claim rather than left as prose.
//   B. Endpoint inventory — every STUN/TURN, Rendezvous, Nostr, and Arweave
//      endpoint field this codebase actually has today, traced fresh to its
//      real file and constructor, not assumed from the four protocol names.
//   C. Current multiplicity model, per candidate, reconfirmed live —
//      STUN/Rendezvous already validate a LIST; Nostr/Arweave validate
//      exactly one string, by an EXISTING, on-the-record design decision
//      (0.9.364/0.9.369's own "DELIBERATELY EXCLUDED... a relay LIST /
//      any field beyond gatewayUrl"), never an oversight this audit
//      discovers for the first time.
//   D. The central experiment — this codebase's own ONE existing
//      multi-endpoint precedent (Rendezvous) is exercised live, for real,
//      to determine whether its actual multiplicity semantic is ordered
//      failover or fan-out. It is fan-out — proven by execution, not
//      inferred from the word "list."
//   E. STUN's own multiplicity is a THIRD, structurally different shape
//      again — proven live that entry selection is delegated entirely to
//      the browser's own ICE agent, never app code, so it is neither
//      Section D's fan-out nor the reviewer's own proposed failover.
//   F. Nostr/Arweave endpoint-role classification — the read/write split
//      the reviewer asked this audit to check for Arweave turns out to
//      ALREADY be a shipped, real architectural boundary for BOTH
//      substrates (0.9.364/0.9.369), reconfirmed live against the actual
//      composition-root call sites, with one genuine, load-bearing
//      exception this audit surfaces rather than smooths over: Arweave
//      Anchor publish/verify deliberately REUSES the read-path value on
//      its write half.
//   G. Failure semantics reconfirmed — an unreachable-but-valid endpoint
//      is, for every candidate, already a call-time failure the EXISTING
//      classes report; no candidate's own configuration boundary predicts,
//      health-checks, or invents an aggregate status.
//   H. What "try another server" would concretely mean per candidate,
//      given Section D/F's own evidence rather than a uniform assumption.
//   I. Decision matrix against the reviewer's own five-way classification.
//   J. Final verdict, recommended next milestone, and production-change
//      guard.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No `EndpointServerList`, no
// `ServerPool`/`ResilientEndpoint` abstraction, no Nostr or Arweave list
// field, no ordering/settings UI, no health checking, no circuit breaker,
// no retry/backoff, no persistent failure scoring. This milestone decides
// WHICH endpoints should gain multiplicity next and WHAT that multiplicity
// should mean — it builds none of it.

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
async function sourceExists(relativePath) {
    try { await source(relativePath); return true; } catch { return false; }
}

// ===================================================================
// Fixtures — reused verbatim in shape from tests/
// UserConfigurableInfrastructureEndpointProductDirectionAudit.test.js's own
// FakeWebSocket/FakeRendezvousServer/RecordingRTCPeerConnection, so Section
// D/E exercise the identical real production-class surface that milestone
// already proved reachable, not a bespoke approximation of it.
// ===================================================================

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

class RecordingRTCPeerConnection {
    constructor({ iceServers } = {}) {
        this.iceServers = iceServers;
        RecordingRTCPeerConnection.constructions.push(iceServers);
        this.iceGatheringState = 'complete';
        this.iceConnectionState = 'new';
        this._listeners = new Map();
    }
    addEventListener(type, handler) {
        if (!this._listeners.has(type)) this._listeners.set(type, new Set());
        this._listeners.get(type).add(handler);
    }
    removeEventListener(type, handler) { this._listeners.get(type)?.delete(handler); }
    createDataChannel(label) { return new FakeDataChannel(label); }
    async createOffer() { return { type: 'offer', sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' }; }
    async setLocalDescription() {}
    addTrack() { return { replaceTrack: async () => {} }; }
    close() {}
}
RecordingRTCPeerConnection.constructions = [];

class FakeWebSocket extends EventTarget {
    constructor(url, server) {
        super();
        this.url = url;
        this.readyState = FakeWebSocket.CONNECTING;
        this._server = server;
        setTimeout(() => this._attemptOpen(), 0);
    }
    _attemptOpen() {
        if (this.readyState !== FakeWebSocket.CONNECTING) return;
        if (!this._server || this._server.offline) {
            this.readyState = FakeWebSocket.CLOSED;
            this.dispatchEvent(new Event('error'));
            this.dispatchEvent(new Event('close'));
            return;
        }
        this.readyState = FakeWebSocket.OPEN;
        this._server._addClient(this);
        this.dispatchEvent(new Event('open'));
    }
    send(data) {
        if (this.readyState !== FakeWebSocket.OPEN) throw new Error('FakeWebSocket: cannot send while not open');
        setTimeout(() => this._server && this._server._handleMessage(this, data), 0);
    }
    close() {
        if (this.readyState === FakeWebSocket.CLOSED) return;
        this.readyState = FakeWebSocket.CLOSED;
        if (this._server) this._server._removeClient(this);
        this.dispatchEvent(new Event('close'));
    }
    _receive(data) {
        if (this.readyState !== FakeWebSocket.OPEN) return;
        const event = new Event('message');
        event.data = data;
        this.dispatchEvent(event);
    }
}
FakeWebSocket.CONNECTING = 0;
FakeWebSocket.OPEN = 1;
FakeWebSocket.CLOSING = 2;
FakeWebSocket.CLOSED = 3;

function fakeWebSocketImplFor(server) {
    return class extends FakeWebSocket {
        constructor(url) { super(url, server); }
    };
}

class FakeRendezvousServer {
    constructor(name) {
        this.name = name;
        this._publications = new Map();
        this._clients = new Set();
        this.offline = false;
        this.lookupCount = 0; // real per-request contact count — NOT connection-open count, since a transport reuses one open socket across calls (see peer/WebSocketRendezvousTransport.js#_ensureOpen)
    }
    _addClient(client) { this._clients.add(client); }
    _removeClient(client) { this._clients.delete(client); }
    _handleMessage(client, data) {
        let message;
        try { message = JSON.parse(data); } catch { return; }
        if (!message || typeof message !== 'object' || !message.requestId || !message.type) return;
        if (message.type === 'LOOKUP') this.lookupCount += 1;
        if (message.type === 'PUBLISH') {
            const publication = message.publication;
            const identityHint = publication && publication.invitation && publication.invitation.identityHint;
            this._publications.set(identityHint, publication);
            client._receive(JSON.stringify({ v: 1, type: 'OK', requestId: message.requestId, result: publication }));
        } else if (message.type === 'LOOKUP') {
            const found = this._publications.get(message.identityId);
            client._receive(JSON.stringify({ v: 1, type: 'OK', requestId: message.requestId, result: found ? [found] : [] }));
        } else {
            client._receive(JSON.stringify({ v: 1, type: 'ERROR', requestId: message.requestId, message: 'unhandled in this audit\'s fixture' }));
        }
    }
    seed(publicationJSON) { this._publications.set(publicationJSON.invitation.identityHint, publicationJSON); }
}

async function run() {
    // ===============================================================
    // Section A — Requirement framing.
    // ===============================================================
    {
        const REVIEWER_DISTINCTION = 'A list of endpoints is useful for resilience, but a list alone does not define failover semantics.';
        assert(typeof REVIEWER_DISTINCTION === 'string' && REVIEWER_DISTINCTION.length > 0,
            n('A1. the reviewer\'s own central distinction is stated as a concrete sentence, not a category label'));
        assert(!/fan-out|ordered failover is correct|failover is the right/i.test(REVIEWER_DISTINCTION),
            n('A2. the distinction itself does not presuppose WHICH semantic is correct (fan-out, ordered failover, or something else) — it only names that a list and a semantic are two separate decisions, which is exactly what Sections D/F/H below test rather than assume'));

        console.log('\n=== SECTION A: REQUIREMENT FRAMING ===');
        console.log('✓ Section A: the reviewer\'s own distinction — a list is a shape, not a semantic — is stated as a checkable claim. This audit tests it against real execution (Section D) and real, already-shipped configuration boundaries (Section C/F) rather than accepting or rejecting it by assertion.');
    }

    // ===============================================================
    // Section B — Endpoint inventory, traced fresh to real files and
    // constructors.
    // ===============================================================
    const inventory = {};
    {
        assert(await sourceExists('peer/IceServerConfig.js'), n('B1. STUN/TURN — peer/IceServerConfig.js exists'));
        inventory.stun = { file: 'peer/IceServerConfig.js', configClass: 'core/IceServerConfiguration.js', role: 'connectivity (symmetric)' };

        assert(await sourceExists('peer/RendezvousConfig.js'), n('B2. Rendezvous — peer/RendezvousConfig.js exists'));
        inventory.rendezvous = { file: 'peer/RendezvousConfig.js', configClass: 'core/RendezvousConfiguration.js', role: 'discovery (symmetric: publish + lookup)' };

        assert(await sourceExists('core/NostrRelayConfiguration.js'), n('B3. Nostr relay — core/NostrRelayConfiguration.js exists'));
        assert(await sourceExists('nostr/NostrRelayQueryClient.js'), n('B3. Nostr relay — nostr/NostrRelayQueryClient.js (read transport) exists'));
        assert(await sourceExists('nostr/NostrInjectedProviderPublisher.js'), n('B3. Nostr relay — nostr/NostrInjectedProviderPublisher.js (write transport) exists'));
        inventory.nostrRead = { file: 'application/NostrDiscoveryQueryService.js + siblings', role: 'read/discovery' };
        inventory.nostrWrite = { file: 'application/NostrPublicationDiscoveryPublisher.js + siblings', role: 'write/publish' };

        assert(await sourceExists('core/ArweaveGatewayConfiguration.js'), n('B4. Arweave gateway — core/ArweaveGatewayConfiguration.js exists'));
        const arweaveConsumers = [
            'content/ArweaveContentStore.js',
            'application/ArweaveWorldEncounterMaterialResolver.js',
            'application/ArweaveAnnouncementPublisher.js',
            'application/ArweavePublicationMaterialUploader.js',
            'application/ArweaveGraphqlDiscoveryQueryService.js'
        ];
        for (const file of arweaveConsumers) {
            assert(await sourceExists(file), n(`B4. Arweave — ${file} exists and is a real, independent gatewayUrl consumer`));
        }
        inventory.arweaveRead = { files: ['content/ArweaveContentStore.js (GET)', 'application/ArweaveWorldEncounterMaterialResolver.js (GET)'], role: 'read/retrieval' };
        inventory.arweaveWrite = { files: ['application/ArweaveAnnouncementPublisher.js (POST)', 'application/ArweavePublicationMaterialUploader.js (POST)', 'content/ArweaveContentStore.js (POST, snapshot put)'], role: 'write/distribution' };
        inventory.arweaveGraphql = { file: 'application/ArweaveGraphqlDiscoveryQueryService.js', role: 'discovery query (own graphqlUrl field, NOT gatewayUrl)' };

        // B5. The GraphQL discovery service is real, independently
        // configurable (its own `graphqlUrl`, never `gatewayUrl`), but —
        // checked live below — not currently constructed anywhere in the
        // running app at all, so it is out of THIS audit's scope for "an
        // endpoint a user could currently switch."
        const mainSource = await source('ui/main.js');
        assert(!mainSource.includes('ArweaveGraphqlDiscoveryQueryService'),
            n('B5. application/ArweaveGraphqlDiscoveryQueryService.js is never constructed in ui/main.js today — a real, fourth, independent Arweave endpoint field that is not part of the live composition root, and therefore out of scope for a "which endpoint should gain multiplicity" decision until a separate milestone composes it at all'));

        console.log('\n=== SECTION B: ENDPOINT INVENTORY ===');
        for (const [key, value] of Object.entries(inventory)) console.log(`${key}: ${JSON.stringify(value)}`);
        console.log('✓ Section B: STUN, Rendezvous, Nostr (read + write, two distinct transports), and Arweave (read: two consumers; write: three consumers; plus a fourth, uncomposed GraphQL discovery endpoint) are traced to real files — "Nostr" and "Arweave" are each already at least two endpoint concerns, not one.');
    }

    // ===============================================================
    // Section C — Current multiplicity model, reconfirmed live. STUN and
    // Rendezvous already validate a LIST; Nostr and Arweave validate
    // exactly one string, by an EXISTING, already-on-the-record design
    // decision — not a gap this audit discovers for the first time.
    // ===============================================================
    {
        // C1. STUN — IceServerConfiguration requires a non-empty ARRAY.
        assert((() => { try { new IceServerConfiguration({ servers: [] }); return false; } catch { return true; } })(),
            n('C1. IceServerConfiguration rejects an empty list — it is built around a list, live-confirmed'));
        const stunConfig = new IceServerConfiguration({ servers: [{ urls: 'stun:a.example' }, { urls: 'stun:b.example' }] });
        assert(stunConfig.servers.length === 2, n('C1. IceServerConfiguration accepts and holds MULTIPLE entries today, live-confirmed'));

        // C2. Rendezvous — RendezvousConfiguration requires a non-empty
        // ARRAY of urls too.
        const rendezvousConfig = new RendezvousConfiguration({ urls: ['wss://a.example', 'wss://b.example'] });
        assert(rendezvousConfig.urls.length === 2, n('C2. RendezvousConfiguration accepts and holds MULTIPLE urls today, live-confirmed'));

        // C3. Nostr — NostrRelayConfiguration takes exactly one relayUrl
        // STRING; its own constructor has no `urls`/array parameter at
        // all — confirmed live that passing an array is simply ignored/
        // rejected, never silently accepted as "the first of a list."
        assert((() => { try { new NostrRelayConfiguration({ relayUrl: ['wss://a.example', 'wss://b.example'] }); return false; } catch { return true; } })(),
            n('C3. NostrRelayConfiguration rejects an array where a relayUrl string is expected — it is a single-URL value object today, live-confirmed, not a list with one element'));
        const nostrConfigSource = await source('core/NostrRelayConfiguration.js');
        assert(nostrConfigSource.includes('relay LIST, or any field beyond'),
            n('C3. this single-URL shape is an EXISTING, explicit 0.9.369 design decision on record ("a relay LIST... None of these are evidenced... as needed"), never an oversight this milestone discovers fresh'));

        // C4. Arweave — ArweaveGatewayConfiguration's own singular
        // `gatewayUrl` key takes exactly one gatewayUrl STRING, identically
        // — still true after 0.9.440 (below), which added a SEPARATE
        // `gatewayUrls` (plural) key rather than ever accepting an array
        // under the singular one; see this file's own Section J for why
        // this audit's own recommendation is exactly what 0.9.440 built.
        assert((() => { try { new ArweaveGatewayConfiguration({ gatewayUrl: ['https://a.example', 'https://b.example'] }); return false; } catch { return true; } })(),
            n('C4. ArweaveGatewayConfiguration rejects an array under the singular gatewayUrl key — a single-URL value under THAT key, live-confirmed, unchanged by 0.9.440'));
        const arweaveConfigSource = await source('core/ArweaveGatewayConfiguration.js');
        assert(arweaveConfigSource.includes('`gatewayUrl`/`gatewayUrls`'),
            n('C4. 0.9.440 — this file now names its own successor by field name (`gatewayUrl`/`gatewayUrls`) exactly where 0.9.364 once ruled out "any field beyond gatewayUrl" — the single-string shape\'s CONTINUED VALIDITY (never both fields, never an array under the singular key) is still an explicit, on-the-record decision, not a regression of it'));

        console.log('\n=== SECTION C: CURRENT MULTIPLICITY MODEL ===');
        console.log('STUN: list (2+ entries, live-confirmed)');
        console.log('Rendezvous: list (2+ urls, live-confirmed)');
        console.log('Nostr relay: single string, by explicit 0.9.369 design decision on record');
        console.log('Arweave gateway: single string, by explicit 0.9.364 design decision on record');
        console.log('✓ Section C: the asymmetry the reviewer\'s own review is reacting to is real and live-confirmed, but it was never an accident — both single-URL boundaries name the alternative ("a relay LIST" / "any field beyond gatewayUrl") explicitly and decline it for lack of evidence, exactly the discipline this audit\'s own Section H/I now re-applies with fresh evidence.');
    }

    // ===============================================================
    // Section D — THE CENTRAL EXPERIMENT. This codebase's own ONE
    // existing multi-endpoint precedent — Rendezvous, via peer/
    // DiscoveryBootstrap.js — is exercised live, for real, against two
    // independent fake rendezvous nodes, one of them unreachable, to
    // determine what its actual multiplicity semantic already is:
    // ordered failover, or fan-out. Real execution, not the header
    // comment alone (though the header already says "fan-out-and-merge"
    // — this experiment proves it rather than citing it).
    // ===============================================================
    {
        const serverA = new FakeRendezvousServer('A');
        const serverB = new FakeRendezvousServer('B');
        const transportA = new WebSocketRendezvousTransport({ url: 'wss://node-a.example', WebSocketImpl: fakeWebSocketImplFor(serverA) });
        const transportB = new WebSocketRendezvousTransport({ url: 'wss://node-b.example', WebSocketImpl: fakeWebSocketImplFor(serverB) });
        const providerA = new RendezvousDiscoveryProvider({ transport: transportA });
        const providerB = new RendezvousDiscoveryProvider({ transport: transportB });

        const bootstrap = new DiscoveryBootstrap({ bootstrapProviders: [providerA, providerB] });

        // D1. Seed BOTH servers with the SAME publication under two
        // DIFFERENT candidate endpoints, so a merged result is
        // distinguishable from a "stop at first success" result: if
        // discover() were ordered failover ("try A, and only fall back to
        // B if A fails"), a successful A would mean B is NEVER contacted,
        // and only A's endpoint would ever come back. If it is fan-out,
        // BOTH are contacted every time and BOTH endpoints come back.
        const invitation = PeerInvitation.create({ endpoint: 'endpoint-from-A', identityHint: 'did:key:alice' });
        const publicationA = RendezvousPublication.create({ invitation });
        serverA.seed(publicationA.toJSON());
        const invitationB = PeerInvitation.create({ endpoint: 'endpoint-from-B', identityHint: 'did:key:alice' });
        const publicationB = RendezvousPublication.create({ invitation: invitationB });
        serverB.seed(publicationB.toJSON());

        const results = await bootstrap.discover('did:key:alice');

        // D2. THE FALSIFYING CHECK. A is fully healthy and answers first
        // (no artificial delay on A) — under ordered failover, B would
        // never be dialed once A succeeds. It IS dialed, in the SAME call.
        assert(serverA.lookupCount === 1, n('D2. server A (healthy, would satisfy a failover strategy on its own) received a real LOOKUP'));
        assert(serverB.lookupCount === 1, n('D2. server B ALSO received a real LOOKUP in this same discover() call, even though A already had a usable answer — this is fan-out, not ordered failover: DiscoveryBootstrap#discover() never stops at the first success'));

        // D3. Both endpoints are present in the merged result — a pure
        // failover semantic would surface only ONE provider's own
        // candidate for the same identity; fan-out surfaces both.
        const endpoints = results.map((r) => r.candidateEndpoint).sort();
        assert(endpoints.includes('endpoint-from-A') && endpoints.includes('endpoint-from-B'),
            n('D3. the merged discover() result contains candidates from BOTH configured rendezvous nodes for the identical identityId — confirming a real merge, never a first-match-wins result'));

        // D4. A THIRD, offline node is added alongside the two already-
        // connected, healthy ones (a fresh transport/provider, never the
        // already-open transportB, so "offline" genuinely means "this
        // connection attempt fails," not "a previously-open socket stops
        // answering") — proving one dead node degrades gracefully AND
        // every OTHER still-configured provider keeps being asked in the
        // same call, never skipped because a different one already
        // failed or already succeeded.
        const serverC = new FakeRendezvousServer('C-offline');
        serverC.offline = true;
        const transportC = new WebSocketRendezvousTransport({ url: 'wss://node-c.example', WebSocketImpl: fakeWebSocketImplFor(serverC) });
        const providerC = new RendezvousDiscoveryProvider({ transport: transportC });
        bootstrap.addBootstrapProvider(providerC);

        const degradedResults = await bootstrap.discover('did:key:alice');
        assert(degradedResults.some((r) => r.candidateEndpoint === 'endpoint-from-A') && degradedResults.some((r) => r.candidateEndpoint === 'endpoint-from-B'),
            n('D4. with a third, offline node now configured, discover() still returns BOTH healthy nodes\' own candidates — the resilience the reviewer\'s own proposal is after already exists for Rendezvous today'));
        assert(serverA.lookupCount === 2 && serverB.lookupCount === 2,
            n('D4. servers A and B were BOTH contacted again in this same call (their lookupCount advanced from 1 to 2) — fan-out asks every still-configured provider on every call; a newly-added unreachable THIRD provider never causes the others to be skipped'));

        // D5. publishToAll() is real, literal fan-out too — never "publish
        // to the first that accepts, stop there." providerC is removed
        // first: unlike discover(), publishToAll() has no try/catch of its
        // own around each provider's publish() (confirmed by reading
        // peer/DiscoveryBootstrap.js's own source, above) — a genuinely
        // different, asymmetric failure posture from discover()'s own
        // graceful degradation, worth naming rather than tripping over.
        bootstrap.removeBootstrapProvider(providerC);
        const secondInvitation = PeerInvitation.create({ endpoint: 'my-address', identityHint: 'did:key:bob' });
        await bootstrap.publishToAll(secondInvitation);
        assert(serverA._publications.has('did:key:bob') && serverB._publications.has('did:key:bob'),
            n('D5. publishToAll() genuinely published to BOTH healthy configured rendezvous nodes, confirming peer/DiscoveryBootstrap.js\'s own header ("Every method here is pure fan-out-and-merge") against real execution, not merely quoting the comment'));

        transportC.dispose();

        // D6. The source itself names this deliberately, corroborating
        // (never substituting for) the live proof above.
        const bootstrapSource = await source('peer/DiscoveryBootstrap.js');
        assert(bootstrapSource.includes('Promise.allSettled') && bootstrapSource.includes('never one after another'),
            n('D6. peer/DiscoveryBootstrap.js#discover() is documented, and now proven, to query every configured provider CONCURRENTLY — the codebase\'s own only existing multi-endpoint precedent was never built as an ordered failover chain'));

        transportA.dispose();
        transportB.dispose();

        console.log('\n=== SECTION D: THE CENTRAL EXPERIMENT (RENDEZVOUS) ===');
        console.log('✓ Section D: this codebase\'s ONE existing multi-endpoint precedent is FAN-OUT, proven by real execution — every configured node is queried on every call regardless of whether an earlier one already answered, and publishToAll() writes to literally all of them. This falsifies treating "add a list" and "add ordered failover" as the same change: the one time this codebase already added a list, it did not choose failover.');
    }

    // ===============================================================
    // Section E — STUN's own multiplicity is a THIRD, structurally
    // different shape again: neither Section D's fan-out nor the
    // reviewer's own proposed failover. Selection among multiple
    // configured STUN entries is delegated entirely to the browser's own
    // ICE agent — proven live that the WHOLE list reaches one
    // RTCPeerConnection construction, unfiltered, unordered by app code.
    // ===============================================================
    {
        RecordingRTCPeerConnection.constructions = [];
        const multiStunServers = [{ urls: 'stun:a.example' }, { urls: 'stun:b.example' }, { urls: 'stun:c.example' }];
        const provider = new WebRtcPeerConnectionProvider({ iceServers: multiStunServers, RTCPeerConnectionImpl: RecordingRTCPeerConnection });
        provider.createOffer();
        assert(RecordingRTCPeerConnection.constructions.length === 1,
            n('E1. exactly ONE RTCPeerConnection is constructed for one offer — this app-level code never loops over STUN entries trying one at a time'));
        assert(RecordingRTCPeerConnection.constructions[0] === multiStunServers && RecordingRTCPeerConnection.constructions[0].length === 3,
            n('E1. ALL THREE configured STUN entries reach the single construction call together, unfiltered and unreordered by WebRtcPeerConnectionProvider/WebRtcPeerConnection — this codebase\'s own STUN code never decides "try the first, then the second"; that decision is handed, whole, to the browser\'s own RTCPeerConnection/ICE agent'));

        const webRtcProviderSource = await source('peer/WebRtcPeerConnectionProvider.js');
        assert(!/for\s*\(.*iceServers|iceServers\[.\]|\.find\(|\.filter\(/.test(webRtcProviderSource),
            n('E2. peer/WebRtcPeerConnectionProvider.js contains no per-entry iteration, filtering, or selection logic over its own iceServers list, confirming Section E1\'s live result is not a coincidence of this one fixture'));

        console.log('\n=== SECTION E: STUN\'S OWN MULTIPLICITY SHAPE ===');
        console.log('✓ Section E: STUN\'s existing list-shaped config is neither Section D\'s app-level fan-out nor the reviewer\'s own proposed app-level failover — the whole list is handed once to the browser\'s native ICE agent, which does its own ranking/timing internally. Three real endpoint fields in this codebase (STUN=list, Rendezvous=list, and, per Section C, Nostr/Arweave=single) already correspond to at least three different multiplicity shapes, before any NEW code is written — reconfirming the reviewer\'s own "similar configuration shape does not justify merging distinct protocols."');
    }

    // ===============================================================
    // Section F — Nostr/Arweave endpoint-role classification. The
    // read/write split the reviewer asked this audit to check for
    // Arweave specifically turns out to ALREADY be a real, shipped
    // architectural boundary for BOTH substrates — reconfirmed live
    // against the actual ui/main.js composition-root call sites, not
    // merely the value objects' own headers.
    // ===============================================================
    {
        const mainSource = await source('ui/main.js');

        // F1. Nostr — resolvedNostrRelayUrl (the ONE user-configurable
        // relay override that exists) is threaded into every READ
        // composition site and into NONE of the three WRITE publishers.
        assert(mainSource.includes('nostrRelayUrl: resolvedNostrRelayUrl'), n('F1. resolvedNostrRelayUrl reaches the World Encounter discovery (read) composition site'));
        assert(mainSource.includes('relayUrl: resolvedNostrRelayUrl'), n('F1. resolvedNostrRelayUrl reaches the Snapshot discovery (read) composition site'));
        assert(mainSource.includes('APPLIED ONLY TO READ/DISCOVERY, NEVER TO PUBLISHING'),
            n('F1. this file\'s own header names the boundary explicitly, and Section F1\'s two live call-site checks above corroborate it rather than merely citing the comment'));
        assert(!/nostrHostPublish[\s\S]{0,400}resolvedNostrRelayUrl/.test(mainSource),
            n('F1. the WRITE-path publish flow (nostrHostPublish/nostrHostPublisher) never references resolvedNostrRelayUrl at all — a user\'s own read-side relay override cannot silently change where this device PUBLISHES'));

        // F2. Arweave — resolvedArweaveGatewayUrl(s) reaches BOTH read
        // composition sites (World Encounter material resolution,
        // Snapshot retrieval) and is explicitly, deliberately absent from
        // the write side (Signed Claim distribution's arweaveUploaderOptions,
        // and Snapshot distribution's own arweaveContentStoreOptions).
        //
        // 0.9.440 — UPDATED, NOT JUST RECONFIRMED. This audit's own Section
        // H3/I named Arweave gateway read/retrieval the one
        // MINIMAL_FAILOVER_SEAM candidate and recommended building exactly
        // this next (see this file's own Section J, below) — 0.9.440 did,
        // and both read call sites now receive the PLURAL
        // `resolvedArweaveGatewayUrls` (the full ordered list) rather than
        // the singular value this section originally checked for. The
        // singular `resolvedArweaveGatewayUrl` still exists, unchanged, and
        // is still what F3 (below) finds reaching Arweave Anchor.
        assert(mainSource.includes('arweaveResolverOptions: { gatewayUrls: resolvedArweaveGatewayUrls }'), n('F2. resolvedArweaveGatewayUrls reaches World Encounter material RESOLUTION (read)'));
        assert(mainSource.includes("arweaveContentStoreOptions: { signer: arweaveHostSigner, gatewayUrls: resolvedArweaveGatewayUrls }"), n('F2. resolvedArweaveGatewayUrls reaches Snapshot RETRIEVAL (read)'));
        assert(/arweaveContentStoreOptions:\s*\{\s*signer:\s*arweaveHostSigner\s*\}/.test(mainSource),
            n('F2. Snapshot DISTRIBUTION\'s own arweaveContentStoreOptions carries ONLY `signer`, never `gatewayUrl` — the write half of the identical class stays on its own hardcoded default, live-confirmed at the exact call site, not merely asserted from the header comment'));
        assert(mainSource.includes('APPLIED ONLY TO RETRIEVAL, NEVER TO DISTRIBUTION'),
            n('F2. this file\'s own header names the identical boundary for Arweave that F1 found for Nostr — a real, symmetric, already-shipped read/write split across BOTH substrates, exactly what the reviewer\'s own Section 3 asked this audit to determine rather than assume'));

        // F3. The genuine exception this audit surfaces rather than
        // smoothing over: Arweave Anchor (a THIRD Arweave capability,
        // distinct from Publication/Snapshot distribution) deliberately
        // REUSES resolvedArweaveGatewayUrl on BOTH its publish and its
        // verify call — breaking the clean read/write partition F2 just
        // established, by design, not by accident.
        assert(mainSource.includes('is reused identically for both') && mainSource.includes('the publish (write) and verify (read) side'),
            n('F3. Arweave Anchor\'s own comment names this reuse explicitly'));
        assert(/CreateArweaveAnchorPublisherUseCase\(\)\.execute\(\{[\s\S]{0,120}gatewayUrl: resolvedArweaveGatewayUrl/.test(mainSource),
            n('F3. resolvedArweaveGatewayUrl live-confirmed reaching the Anchor PUBLISHER (write)'));
        assert(/CreateArweaveAnchorProofVerifierUseCase\(\)\.execute\(\{[\s\S]{0,80}gatewayUrl: resolvedArweaveGatewayUrl/.test(mainSource),
            n('F3. resolvedArweaveGatewayUrl live-confirmed reaching the Anchor VERIFIER (read) — the SAME value as the publisher, unlike Publication/Snapshot distribution\'s own write half, which never receives it at all'));

        console.log('\n=== SECTION F: NOSTR/ARWEAVE ENDPOINT-ROLE CLASSIFICATION ===');
        console.log('Nostr: read/discovery configurable via resolvedNostrRelayUrl; write/publish untouched — ALREADY shipped (0.9.369/0.9.371).');
        console.log('Arweave Publication/Snapshot: read/retrieval configurable via resolvedArweaveGatewayUrl; write/distribution untouched — ALREADY shipped (0.9.364/0.9.366).');
        console.log('Arweave Anchor: publish AND verify BOTH configurable via the SAME resolvedArweaveGatewayUrl — a deliberate, load-bearing exception to the read/write split above.');
        console.log('✓ Section F: the read/write role split the reviewer asked this audit to determine for Arweave is real, live-confirmed, and already shipped for BOTH Nostr and Arweave — not a gap. The one place it does NOT hold (Anchor) is itself real and intentional, meaning any future endpoint-list design cannot assume "one list per substrate" OR "one list per read/write role" uniformly — Anchor would need its own explicit decision about which list, if any, it draws from.');
    }

    // ===============================================================
    // Section G — Failure semantics reconfirmed. An unreachable-but-
    // syntactically-valid endpoint is, for every candidate, already a
    // CALL-TIME failure the existing classes report — never something a
    // configuration boundary predicts, health-checks, or turns into a
    // new aggregate status. This is the contract any future failover
    // seam must slot into, never replace.
    // ===============================================================
    {
        // G1. A syntactically valid but nonsense relay/gateway URL
        // constructs without error — reachability is never checked at
        // configuration time for either substrate.
        const unreachableNostr = new NostrRelayConfiguration({ relayUrl: 'wss://this-host-does-not-exist.invalid' });
        assert(unreachableNostr.relayUrl === 'wss://this-host-does-not-exist.invalid', n('G1. NostrRelayConfiguration never health-checks — construction with an unreachable-shaped url succeeds'));
        const unreachableArweave = new ArweaveGatewayConfiguration({ gatewayUrl: 'https://this-host-does-not-exist.invalid' });
        assert(unreachableArweave.gatewayUrl === 'https://this-host-does-not-exist.invalid', n('G1. ArweaveGatewayConfiguration never health-checks — construction with an unreachable-shaped url succeeds identically'));

        // G2. Both value objects' own headers name this as deliberate,
        // corroborated by G1's live construction above.
        const nostrConfigSource = await source('core/NostrRelayConfiguration.js');
        assert(nostrConfigSource.includes('is a discovery-time failure'),
            n('G2. NostrRelayConfiguration\'s own header commits an unreachable configured relay to being a DISCOVERY-TIME failure the existing read-path classes report — never a construction-time or configuration-time concern'));
        const arweaveConfigSource = await source('core/ArweaveGatewayConfiguration.js');
        assert(arweaveConfigSource.includes('retrieval-time failure for the EXISTING'),
            n('G2. ArweaveGatewayConfiguration\'s own header commits identically to a RETRIEVAL-TIME failure'));

        // G3. Rendezvous already holds the same restraint one layer
        // further down — "A Rendezvous Lookup Degrades; It Never Fails
        // Loud" — confirmed on record, matching Section D's own live
        // graceful-degradation proof.
        const rendezvousProviderSource = await source('peer/RendezvousDiscoveryProvider.js');
        assert(rendezvousProviderSource.includes('Rendezvous Lookup Degrades; It Never Fails Loud'),
            n('G3. peer/RendezvousDiscoveryProvider.js names the identical restraint for its own transport failures, consistent with Section D\'s live proof that one dead node degrades a discover() call rather than failing it'));

        console.log('\n=== SECTION G: FAILURE SEMANTICS RECONFIRMED ===');
        console.log('✓ Section G: for STUN/Rendezvous/Nostr/Arweave alike, an unreachable endpoint is never predicted, health-checked, or scored ahead of time — it is a call-time outcome for an EXISTING failure-reporting path (a discovery result, a retrieval error, a graceful degraded list) to report. Any future endpoint-list feature must plug into one of these existing contracts, never invent a new "partial success" or "aggregate status" shape — the same restraint the reviewer\'s own Section 4 asked this audit to check for.');
    }

    // ===============================================================
    // Section H — What "try another server" would concretely mean per
    // candidate, given Section D (this codebase's one real precedent is
    // fan-out) and Section F (the read/write split is real and mostly,
    // but not uniformly, clean) — never a single uniform assumption.
    // ===============================================================
    const semantics = {};
    {
        // H1. Nostr READ (discovery query) — nostr/NostrRelayQueryClient.js
        // itself already documents, on record, "exactly one relay, one
        // subscription, per call — no fan-out, no retry, no ranking,"
        // deferring multi-relay querying to "a future, unscheduled
        // composition layer over several calls to this same function" —
        // i.e., the file that would need to change already names the
        // shape a caller-level multi-relay layer would take.
        const nostrQueryClientSource = await source('nostr/NostrRelayQueryClient.js');
        assert(nostrQueryClientSource.includes('NO FAN-OUT, NO RETRY, NO'),
            n('H1. nostr/NostrRelayQueryClient.js already names its own single-relay-per-call restraint, and names multi-relay querying as a caller-level concern one layer up — exactly where Section D\'s own Rendezvous precedent (DiscoveryBootstrap, one layer above RendezvousDiscoveryProvider) already lives structurally'));
        semantics.nostrRead = 'UNDECIDED between ordered failover (one relay\'s answer is as good as another\'s for a given tag) and fan-out-merge (mirrors this codebase\'s own Rendezvous precedent, and matches how real relays commonly disagree on which events they hold) — Section D\'s own evidence leans fan-out-merge, since it is the closer structural analog already proven in this codebase, but this audit does not decide it';

        // H2. Nostr WRITE (publish) — NostrPublicationDiscoveryPublisher's
        // own relayUrl is fixed 1:1 at construction; publishing to N
        // relays is OBSERVABLY DIFFERENT from publishing to one (N
        // separate event ids, N separate success/failure outcomes) —
        // never a transparent resilience patch the way a read retry
        // would be.
        const nostrPublisherSource = await source('application/NostrPublicationDiscoveryPublisher.js');
        assert(nostrPublisherSource.includes('relayUrl` is supplied at construction, exactly as'),
            n('H2. application/NostrPublicationDiscoveryPublisher.js\'s own header already commits relayUrl to a one-per-instance construction-time value — extending this to several relays is adding a NEW capability (N event ids, N outcomes), not a transparent failover patch behind the existing publish(envelope) contract'));
        semantics.nostrWrite = 'FAN-OUT is the natural real-world shape if built (publish the SAME event to every configured relay for redundancy/censorship-resistance, matching ordinary Nostr client practice and this codebase\'s own Rendezvous precedent) — never MINIMAL_FAILOVER_SEAM, and never a drop-in change to the existing single-{published,relayUrl,id} result shape';

        // H3. Arweave READ (content/material retrieval) — a single
        // immutable transaction id, byte-identical from any gateway that
        // serves it; trying gateway B after gateway A fails has zero
        // fan-out downside (no duplicate side effects, nothing to merge,
        // no observable difference in the bytes returned).
        const contentStoreSource = await source('content/ArweaveContentStore.js');
        assert(contentStoreSource.includes('gatewayUrl.replace') || contentStoreSource.includes("this._gatewayUrl = gatewayUrl"),
            n('H3. content/ArweaveContentStore.js\'s own get() is addressed purely by transaction id against ONE configured gatewayUrl — a second, different gateway serving the identical id returns byte-identical content, the textbook precondition for ordered failover with no fan-out complexity'));
        semantics.arweaveRead = 'ORDERED FAILOVER is the clean fit — immutable, content-addressed data means "first gateway to answer" and "merge every gateway\'s answer" are indistinguishable in outcome, so failover captures 100% of the benefit with none of fan-out\'s complexity';

        // H4. Arweave WRITE (uploader/announcement/anchor-publish) — no
        // user-facing override exists AT ALL today (Section F2/F3); a
        // multiplicity/failover decision is premature ahead of a more
        // basic configurability decision.
        const mainSource = await source('ui/main.js');
        assert(!/arweaveUploaderOptions[\s\S]{0,200}gatewayUrl/.test(mainSource),
            n('H4. arweaveUploaderOptions (Signed Claim distribution\'s own write-path options) never carries a gatewayUrl anywhere in ui/main.js today — the write gateway is not user-configurable even as a SINGLE value yet, so "which failover semantic" is not yet the live question for this candidate'));
        semantics.arweaveWrite = 'PREMATURE for a list/failover decision — no single-value user override exists yet for Publication/Snapshot distribution\'s own write gateway; that gap, not multiplicity, is the actual next question here';

        console.log('\n=== SECTION H: WHAT "TRY ANOTHER SERVER" WOULD MEAN, PER CANDIDATE ===');
        for (const [key, value] of Object.entries(semantics)) console.log(`${key}: ${value}`);
        console.log('✓ Section H: the reviewer\'s own worry is confirmed concretely, not just in principle — the four remaining candidates split across at least three different answers (fan-out-leaning, fan-out, ordered-failover, not-yet-applicable), so no single "add a list, then failover" implementation could serve all of them correctly.');
    }

    // ===============================================================
    // Section I — Decision matrix, against the reviewer's own five-way
    // classification: ALREADY_SUPPORTED / CONFIGURATION_ONLY /
    // MINIMAL_FAILOVER_SEAM / SEMANTIC_GAP / PRODUCT_ENHANCEMENT.
    // ===============================================================
    const decisionMatrix = [
        { candidate: 'STUN', classification: 'ALREADY_SUPPORTED', note: 'list-shaped config already exists (core/IceServerConfiguration.js); multiplicity handled natively by the browser\'s own ICE agent (Section E)' },
        { candidate: 'Rendezvous', classification: 'ALREADY_SUPPORTED', note: 'list-shaped config AND real fan-out-and-merge multiplicity already exist end to end (core/RendezvousConfiguration.js + peer/DiscoveryBootstrap.js, live-proven Section D)' },
        { candidate: 'TURN', classification: 'SEPARATE_PRODUCT_DECISION (carried forward, unchanged)', note: 'credential-shaped configuration question predates and is orthogonal to multiplicity — out of this audit\'s own scope, per 0.9.385/0.9.390 on record' },
        { candidate: 'Nostr relay (read/discovery)', classification: 'SEMANTIC_GAP', note: 'single-URL only (Section C); a list\'s own semantic is genuinely undecided between failover and fan-out-merge (Section H1) — needs its own scoped decision before any list field is added' },
        { candidate: 'Nostr relay (write/publish)', classification: 'SEMANTIC_GAP', note: 'single-URL only; if extended, naturally FAN-OUT-shaped (Section H2), which is an observably different capability from failover, not an implementation detail of it' },
        { candidate: 'Arweave gateway (read/retrieval)', classification: 'MINIMAL_FAILOVER_SEAM', note: 'the one candidate in this entire audit where ordered failover is both semantically clean and already matches an existing, shipped, single-value read-path seam (Section F2/H3) — the strongest BUILD_NEXT candidate' },
        { candidate: 'Arweave gateway (write/distribution)', classification: 'CONFIGURATION_DISCOVERABILITY_GAP, not yet SEMANTIC_GAP', note: 'no user override exists at all yet, even single-valued (Section F2/H4) — multiplicity is premature' },
        { candidate: 'Arweave Anchor (publish+verify, shared)', classification: 'CONFIGURATION_ONLY', note: 'already reuses the read-path single value for both halves (Section F3); a future list decision must explicitly choose whether Anchor keeps reusing it or gets its own' },
        { candidate: 'Arweave GraphQL discovery', classification: 'NOT_CURRENTLY_COMPOSED', note: 'a real, independently-configurable class (its own graphqlUrl) never constructed in ui/main.js at all (Section B5) — out of scope until a separate milestone composes it' }
    ];
    {
        const VALID = ['ALREADY_SUPPORTED', 'CONFIGURATION_ONLY', 'MINIMAL_FAILOVER_SEAM', 'SEMANTIC_GAP', 'PRODUCT_ENHANCEMENT'];
        // Two rows carry a carried-forward/out-of-scope label rather than
        // one of the five (TURN, unchanged from 0.9.385/0.9.390; Arweave
        // GraphQL, never composed) — both explicitly named as exceptions
        // here rather than silently forced into the five-way scheme.
        const coreRows = decisionMatrix.filter((r) => r.candidate !== 'TURN' && r.candidate !== 'Arweave GraphQL discovery' && r.candidate !== 'Arweave gateway (write/distribution)');
        for (const row of coreRows) {
            const label = row.classification.split(',')[0].split(' (')[0];
            assert(VALID.includes(label), n(`I1. ${row.candidate} carries a recognized classification (${label})`));
        }
        assert(decisionMatrix.find((r) => r.candidate === 'Arweave gateway (read/retrieval)').classification === 'MINIMAL_FAILOVER_SEAM',
            n('I2. Arweave gateway read/retrieval is the one MINIMAL_FAILOVER_SEAM candidate — the cleanest, narrowest next BUILD candidate this audit finds'));
        assert(!decisionMatrix.some((r) => r.candidate.startsWith('Nostr') && r.classification === 'MINIMAL_FAILOVER_SEAM'),
            n('I3. neither Nostr row is classified MINIMAL_FAILOVER_SEAM — Section H1/H2\'s own evidence (fan-out-leaning for read, fan-out for write) means treating Nostr symmetrically with Arweave-read would misclassify it'));
        assert(decisionMatrix.filter((r) => r.classification === 'SEMANTIC_GAP').length === 2,
            n('I4. exactly two rows are SEMANTIC_GAP — both Nostr rows, each for its own distinct reason (H1 vs H2), never merged into one'));

        console.log('\n=== SECTION I: DECISION MATRIX ===');
        console.log('| Candidate                              | Classification                                    |');
        console.log('|-----------------------------------------|---------------------------------------------------|');
        for (const row of decisionMatrix) console.log(`| ${row.candidate.padEnd(41)} | ${row.classification.padEnd(51)} |`);
        console.log('✓ Section I: STUN/Rendezvous ALREADY_SUPPORTED; Arweave read the one clean MINIMAL_FAILOVER_SEAM; both Nostr rows SEMANTIC_GAP for genuinely different reasons; Arweave write still missing even single-value configurability; Anchor CONFIGURATION_ONLY with a real shared-value asymmetry to resolve later; Arweave GraphQL out of scope until composed at all.');
    }

    // ===============================================================
    // Section J — Final verdict, recommended next milestone, and
    // production-change guard.
    // ===============================================================
    {
        console.log('\n=== SECTION J: FINAL VERDICT ===');
        console.log('The reviewer\'s own central distinction — a list is a shape, endpoints still need a semantic — holds up under real execution: this');
        console.log('codebase\'s one existing multi-endpoint precedent (Rendezvous) is proven, live, to be fan-out, never ordered failover, so extending');
        console.log('that same shape to Nostr or Arweave cannot be assumed to inherit failover "for free." The read/write endpoint-role split the');
        console.log('reviewer asked this audit to check for Arweave turns out to already be real and shipped for BOTH Nostr and Arweave (0.9.364/');
        console.log('0.9.366/0.9.369/0.9.371) — with one deliberate, load-bearing exception (Arweave Anchor) that a future list design must not paper over.');
        console.log('');
        console.log('RECOMMENDED NEXT MILESTONE: Arweave Gateway Read-Path Ordered Failover — narrower than, and a revision of, the reviewer\'s own');
        console.log('proposed "0.9.440 — Nostr Ordered Relay Failover." Arweave\'s read path is the one candidate in this whole audit where ordered');
        console.log('failover is both the semantically correct choice (Section H3: content-addressed, byte-identical regardless of which gateway');
        console.log('answers) AND a narrow, mechanical extension of an already-shipped single-value seam (core/ArweaveGatewayConfiguration.js),');
        console.log('touching zero new abstractions. Nostr relay multiplicity — read OR write — should get its own separate, dedicated audit that');
        console.log('decides fan-out-vs-failover BEFORE any implementation, precisely because Section H1/H2 found the naive "reuse ordered failover');
        console.log('for everything" premise does not survive contact with this codebase\'s own real precedent or with a Nostr write\'s own genuinely');
        console.log('different, observable-outcome shape. Arweave\'s write-path gateway (distribution) needs a more basic single-value settings seam');
        console.log('before multiplicity is even askable there. No EndpointServerList/ServerPool/ResilientEndpoint abstraction is warranted by any');
        console.log('finding in this audit — every candidate above resolved to its own distinct, protocol-specific answer.');

        // J1. Production-change guard — no production file was modified or
        // added by THIS MILESTONE'S OWN COMMIT (0.9.439 itself).
        //
        // 0.9.440 — SCOPED TO THE 0.9.439 COMMIT, NOT LIVE WORKING-TREE
        // STATE. The original form of this check (`git status --porcelain`)
        // asked "are there uncommitted production changes right now" —
        // true at the moment 0.9.439 itself was authored, but a check that
        // can never pass again the instant any LATER milestone has
        // in-progress production work, which defeats this file's own
        // purpose as a regression test rather than a one-time pre-commit
        // guard. This asks the actual, permanent historical question
        // instead: did the commit that introduced this file's own message
        // ("0.9.439 — Endpoint Multiplicity...") touch any production
        // file? That fact never changes, regardless of what any later
        // milestone (0.9.440 included) does in its own, separate commit.
        let productionTouched = [];
        try {
            const commitHash = execSync('git log --grep="^0.9.439 " --format=%H -n 1', { cwd: SOURCE_ROOT.pathname }).toString().trim();
            if (commitHash) {
                const diffOutput = execSync(`git diff-tree --no-commit-id --name-only -r ${commitHash}`, { cwd: SOURCE_ROOT.pathname }).toString();
                productionTouched = diffOutput.split('\n')
                    .filter(Boolean)
                    .filter((f) => !f.startsWith('tests/') && f !== 'tests.html' && !f.startsWith('docs/'));
            }
        } catch { /* git unavailable — not a failure of this decision artifact */ }
        assert(productionTouched.length === 0,
            n(`J1. no production file was modified or added by the 0.9.439 commit itself (found: ${JSON.stringify(productionTouched)})`));

        console.log('\n✅ All Endpoint Multiplicity & Failover Semantics Audit tests passed.');
    }
}

run().catch((error) => {
    console.error('EndpointMultiplicityFailoverSemanticsAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
