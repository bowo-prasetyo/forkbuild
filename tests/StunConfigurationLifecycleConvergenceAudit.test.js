import { readFile } from 'node:fs/promises';

import { IceServerConfiguration, isValidStunUrl } from '../core/IceServerConfiguration.js';
import { ArweaveGatewayConfiguration } from '../core/ArweaveGatewayConfiguration.js';
import { NostrRelayConfiguration } from '../core/NostrRelayConfiguration.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { IceServerConfigurationStore } from '../storage/IceServerConfigurationStore.js';
import { ArweaveGatewayConfigurationStore } from '../storage/ArweaveGatewayConfigurationStore.js';
import { NostrRelayConfigurationStore } from '../storage/NostrRelayConfigurationStore.js';
import { SetIceServerConfigurationUseCase } from '../application/SetIceServerConfigurationUseCase.js';
import { WebRtcPeerConnectionProvider } from '../peer/WebRtcPeerConnectionProvider.js';
import { WebRtcPeerConnection } from '../peer/WebRtcPeerConnection.js';
import { DEFAULT_ICE_SERVERS, fetchIceServers } from '../peer/IceServerConfig.js';
import { DEFAULT_RENDEZVOUS_URLS } from '../peer/RendezvousConfig.js';

// 0.9.387 — STUN Configuration Lifecycle & Convergence Audit.
//
// Type: test-only. Production changes: NONE.
//
// 0.9.386 gave a user's own STUN server list a real value object
// (core/IceServerConfiguration.js), a durable store
// (storage/IceServerConfigurationStore.js), a write use case, a settings
// view, and one composition-root wiring in ui/main.js —
// tests/UserConfigurableStunConfiguration.test.js already proved every one
// of those pieces correct, including a single restart round-trip all the
// way to a concrete RTCPeerConnection construction. This audit asks the
// harder, cross-cutting question that milestone's own test never set out
// to answer: now that this configuration has crossed the full
//
//   StunSettingsView -> SetIceServerConfigurationUseCase ->
//   IceServerConfigurationStore -> persistent StorageProvider -> (restart)
//   -> ui/main.js -> resolvedIceServers -> WebRtcPeerConnectionProvider ->
//   fetchIceServers() -> RTCPeerConnection
//
// lifecycle, is this configuration architecturally CLOSED — one authority,
// no accidental second store, no bleed into TURN/Rendezvous/peer identity,
// and no configuration that has quietly become a fallback, health-check,
// or connection-retry policy? This is the direct structural mirror of
// 0.9.365's Arweave Gateway convergence audit and 0.9.370's Nostr Relay
// convergence audit, applied to STUN's own list-shaped configuration and
// its two upstream write-path collaborators (a use case and a settings
// view) neither sibling configuration has.
//
// Section A: Configuration authority — one value object, one storage key,
//            one store construction site, no adapter self-decides.
// Section B: Absence vs. explicit default — three persisted states, proven
//            distinguishable even where two resolve to the same effective
//            list.
// Section C: Restart convergence — three genuinely independent
//            "replicas," sharing one storage namespace, converge on the
//            identical effective STUN list with no shared singleton,
//            proven through the concrete RTCPeerConnection construction on
//            every replica.
// Section D: Reset semantics — clear() is a real storage removal (verified
//            against the raw StorageProvider, not merely store.get()),
//            genuinely distinct from ever having saved
//            DEFAULT_ICE_SERVERS explicitly.
// Section E: Failure semantics — a genuine StorageProvider failure
//            propagates out of save()/get()/clear() (never silently
//            degrades), on top of 0.9.386's own exhaustive malformed-data
//            coverage; an already-running provider's iceServers survive a
//            later malformed write untouched.
// Section F: TURN isolation — no scheme-confusable variant (case, whitespace,
//            embedded turn: substring, query tricks) can ever be accepted
//            as a STUN entry; fetchIceServers()'s own credential path is
//            unreferenced by any of this configuration's own files.
// Section G: Rendezvous isolation — peer/RendezvousConfig.js,
//            peer/DiscoveryBootstrap.js, and peer/PeerAuthenticationSession.js
//            are all untouched, in both directions.
// Section H: Cross-configuration isolation — IceServerConfiguration,
//            ArweaveGatewayConfiguration, and NostrRelayConfiguration
//            round-trip independently through one shared storage
//            namespace with no key collision and no value bleed, checked
//            structurally in every direction.
// Section I: The flagship assertion — a configured STUN server list is
//            authoritative even when unreachable: driven through a real
//            WebRtcPeerConnection whose ICE gathering never completes, the
//            bounded timeout still fires, a local signal is still
//            produced, and the underlying RTCPeerConnection was
//            constructed with — and never silently replaced away from —
//            the exact configured (unreachable-looking) STUN list.
// Section J: No hidden resilience semantics — no health check, latency
//            ranking, automatic server selection, or reconnection policy
//            exists anywhere in this configuration's own files.
// Section K: Final decision matrix and verdict.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No Settings UI change, no
// STUN health checking, no TURN configuration work, no Rendezvous
// configuration work (0.9.388, a separate milestone), and no production
// code change of any kind — this file exists to confirm 0.9.386's own
// architecture is closed, never to extend it.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// Two or more SEPARATE instances over one externally-owned namespace — the
// same "restart" shape every sibling convergence audit in this codebase
// already establishes (e.g. tests/NostrRelayConfigurationConvergenceAudit
// .test.js's own SharedNamespaceStorageProvider). No JS reference is ever
// shared between instances built over the same namespace object, only the
// underlying bytes — exactly how two separate page loads share one
// browser's own window.localStorage.
class SharedNamespaceStorageProvider extends StorageProvider {
    constructor(sharedNamespace) { super(); this._namespace = sharedNamespace; }
    save(name, data) { this._namespace[name] = JSON.stringify(data); }
    load(name) { return Object.prototype.hasOwnProperty.call(this._namespace, name) ? JSON.parse(this._namespace[name]) : null; }
    remove(name) { delete this._namespace[name]; }
    list() { return Object.keys(this._namespace); }
}

class ThrowingStorageProvider extends StorageProvider {
    save() { throw new Error('disk unavailable'); }
    load() { throw new Error('disk unavailable'); }
    remove() { throw new Error('disk unavailable'); }
    list() { return []; }
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

// Starts 'complete' immediately — this suite's own concern (Sections C, H)
// is WHICH iceServers value reaches the concrete construction call, never
// real ICE gathering timing — mirrors tests/UserConfigurableStunConfiguration
// .test.js's own RecordingRTCPeerConnection exactly.
class RecordingRTCPeerConnection {
    constructor({ iceServers } = {}) {
        this.iceServers = iceServers;
        RecordingRTCPeerConnection.constructions.push(iceServers);
        this.iceGatheringState = 'complete';
        this.iceConnectionState = 'new';
        this.localDescription = null;
        this.remoteDescription = null;
        this._listeners = new Map();
    }
    addEventListener(type, handler) {
        if (!this._listeners.has(type)) this._listeners.set(type, new Set());
        this._listeners.get(type).add(handler);
    }
    removeEventListener(type, handler) { this._listeners.get(type)?.delete(handler); }
    createDataChannel(label) { return new FakeDataChannel(label); }
    async createOffer() { return { type: 'offer', sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' }; }
    async createAnswer() { return { type: 'answer', sdp: 'v=0\r\no=- 2 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' }; }
    async setLocalDescription(desc) { this.localDescription = desc; }
    async setRemoteDescription(desc) { this.remoteDescription = desc; }
    async addIceCandidate() {}
    close() {}
}
RecordingRTCPeerConnection.constructions = [];

// Gathering that NEVER completes — the exact FakeRTCPeerConnection shape
// tests/IceGatheringTimeout.test.js's own 0.3.6 suite already establishes,
// reused here (never redefined) for Section I's own flagship proof: this
// suite's concern is not the timeout mechanism itself (already proven
// there) but WHICH iceServers value the connection was built with, and
// whether it EVER changes across the timeout boundary.
class NeverGatheringRTCPeerConnection {
    constructor({ iceServers } = {}) {
        this.iceServers = iceServers;
        NeverGatheringRTCPeerConnection.constructions.push(iceServers);
        this.iceGatheringState = 'new';
        this.iceConnectionState = 'new';
        this.localDescription = null;
        this.remoteDescription = null;
        this._listeners = new Map();
    }
    addEventListener(type, handler) {
        if (!this._listeners.has(type)) this._listeners.set(type, new Set());
        this._listeners.get(type).add(handler);
    }
    removeEventListener(type, handler) { this._listeners.get(type)?.delete(handler); }
    _emit(type, event = {}) {
        for (const handler of this._listeners.get(type) || []) handler(event);
    }
    createDataChannel(label) { return new FakeDataChannel(label); }
    async createOffer() { return { type: 'offer', sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' }; }
    async createAnswer() { return { type: 'answer', sdp: 'v=0\r\no=- 2 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' }; }
    async setLocalDescription(desc) { this.localDescription = desc; }
    async setRemoteDescription(desc) { this.remoteDescription = desc; }
    async addIceCandidate() {}
    addTrack() { return { replaceTrack: async () => {} }; }
    removeTrack() {}
    close() {}
    // gathering simply never completes — iceGatheringState stays 'new'
    // forever, exactly the scenario the bounded timeout exists to survive.
}
NeverGatheringRTCPeerConnection.constructions = [];

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}
function executableOf(src) {
    return src.replace(/\/\/.*$/gm, '');
}

async function run() {
    console.log('Running STUN Configuration Lifecycle & Convergence Audit tests...\n');

    // ===============================================================
    // Section A — Configuration authority: one value object, one storage
    // key, one store construction site, no adapter self-decides.
    // ===============================================================
    {
        const configSource = await source('core/IceServerConfiguration.js');
        const storeSource = await source('storage/IceServerConfigurationStore.js');
        const useCaseSource = await source('application/SetIceServerConfigurationUseCase.js');
        const viewSource = await source('ui/views/StunSettingsView.js');
        const mainSource = await source('ui/main.js');

        const otherFiles = await Promise.all([
            ['peer/IceServerConfig.js', await source('peer/IceServerConfig.js')],
            ['peer/WebRtcPeerConnectionProvider.js', await source('peer/WebRtcPeerConnectionProvider.js')],
            ['peer/WebRtcPeerConnection.js', await source('peer/WebRtcPeerConnection.js')],
            ['peer/RendezvousConfig.js', await source('peer/RendezvousConfig.js')],
            ['peer/DiscoveryBootstrap.js', await source('peer/DiscoveryBootstrap.js')],
            ['peer/PeerAuthenticationSession.js', await source('peer/PeerAuthenticationSession.js')]
        ]);

        assert(configSource.includes('export class IceServerConfiguration '), 'A1. core/IceServerConfiguration.js is the one place the value object is defined');
        for (const [label, src] of otherFiles) {
            assert(!src.includes('class IceServerConfiguration'), `A2 (${label}). no second definition of the value object exists`);
            assert(!/from\s*['"][^'"]*core\/IceServerConfiguration\.js['"]/.test(src), `A3 (${label}). no unrelated file imports the value object directly — only the use case, the store, and ui/main.js may`);
            assert(!/from\s*['"][^'"]*storage\/IceServerConfigurationStore\.js['"]/.test(src), `A4 (${label}). no unrelated file imports the persistence store directly — no adapter independently decides whether to use the default`);
            assert(!src.includes('new IceServerConfigurationStore('), `A5 (${label}). no unrelated file constructs its own store instance`);
        }

        assert(storeSource.includes("'ice-server-configuration'"), 'A6. the store owns the one storage key literal');
        for (const [label, src] of [['core/IceServerConfiguration.js', configSource], ['application/SetIceServerConfigurationUseCase.js', useCaseSource], ['ui/views/StunSettingsView.js', viewSource], ...otherFiles]) {
            assert(!src.includes('ice-server-configuration'), `A7 (${label}). no second file hardcodes the storage key — one key, one owner`);
        }

        assert(mainSource.includes('new IceServerConfigurationStore('), 'A8. ui/main.js is where the store is actually constructed');
        assert((mainSource.match(/new IceServerConfigurationStore\(/g) || []).length === 1, 'A9. ui/main.js constructs exactly one store instance');
        assert((mainSource.match(/new SetIceServerConfigurationUseCase\(/g) || []).length === 1, 'A10. ui/main.js constructs exactly one write use case instance');

        // The use case is the ONE place `new IceServerConfiguration(` is
        // ever called against a caller-supplied value (the store's own
        // fromJSON()-shaped rehydration in get() is a separate, already
        // audited concern — 0.9.386's own tests cover it directly).
        assert(useCaseSource.includes('new IceServerConfiguration({ servers })'), 'A11. the use case constructs the value object from a caller-supplied servers list');
        assert(!viewSource.replace(/\/\/.*$/gm, '').includes('new IceServerConfiguration('), 'A12. the settings view never constructs the value object itself — only the use case does');

        console.log('✓ Section A: exactly one value object, one storage key, one store construction site, and one write-use-case construction site exist; no unrelated file imports either boundary directly or constructs its own instance');
    }

    // ===============================================================
    // Section B — Absence vs. explicit default: three persisted states,
    // proven distinguishable even where two resolve to the identical
    // effective STUN list.
    // ===============================================================
    {
        function resolveEffective(store) {
            const configuration = store.get();
            return configuration ? configuration.servers : DEFAULT_ICE_SERVERS;
        }

        // State A: no configuration at all.
        const backingA = new InMemoryStorageProvider();
        const storeA = new IceServerConfigurationStore(backingA);
        assert(storeA.get() === null, 'B1. State A (absence) — get() is a real null');
        assert(resolveEffective(storeA) === DEFAULT_ICE_SERVERS, 'B2. State A resolves to the deployment default, by reference');
        assert(backingA.load('ice-server-configuration') === null, 'B3. State A leaves genuinely nothing on file');

        // State B: the user explicitly configures the SAME servers as the
        // default.
        const backingB = new InMemoryStorageProvider();
        const storeB = new IceServerConfigurationStore(backingB);
        storeB.save(new IceServerConfiguration({ servers: DEFAULT_ICE_SERVERS.map((entry) => ({ urls: entry.urls })) }));
        assert(storeB.get() !== null, 'B4. State B (explicit default) — get() returns a real configuration, never null');
        const effectiveB = resolveEffective(storeB);
        assert(effectiveB.length === DEFAULT_ICE_SERVERS.length && effectiveB.every((entry, i) => entry.urls === DEFAULT_ICE_SERVERS[i].urls),
            'B5. State B resolves to the same effective server URLs as State A');
        assert(backingB.load('ice-server-configuration') !== null, 'B6. …yet State B leaves a real, distinct entry on file — an explicit configuration is never treated as "nothing to persist" merely because it matches the default');

        // State C: a genuinely custom STUN list.
        const backingC = new InMemoryStorageProvider();
        const storeC = new IceServerConfigurationStore(backingC);
        storeC.save(new IceServerConfiguration({ servers: [{ urls: 'stun:alternative.example:3478' }] }));
        assert(resolveEffective(storeC)[0].urls === 'stun:alternative.example:3478', 'B7. State C resolves to the custom list');

        // The decisive proof: A and B agree on effective URLs but disagree
        // on persisted representation.
        assert(storeA.get() === null && storeB.get() !== null, 'B8. State A and State B remain distinguishable PERSISTED facts: real null vs. a real IceServerConfiguration instance, even though B5 already showed their effective URLs coincide');

        console.log('✓ Section B: State A (absence) and State B (explicit default) resolve to the identical effective STUN list, yet remain distinguishable facts in persistence; State C resolves to its own distinct custom list');
    }

    // ===============================================================
    // Section C — Restart convergence: three genuinely independent
    // "replicas," sharing one storage namespace, converge on the
    // identical effective STUN list with no shared singleton, proven
    // through the concrete RTCPeerConnection construction on every
    // replica.
    // ===============================================================
    {
        const sharedNamespace = {};

        // Replica 1 ("Alice's device") saves a custom STUN list.
        const replica1Store = new IceServerConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        const replica1UseCase = new SetIceServerConfigurationUseCase({ iceServerConfigurationStore: replica1Store });
        replica1UseCase.execute({ servers: [{ urls: 'stun:shared-replica.example:3478' }] });

        // restart boundary — Replica 2: its own store instance, its own
        // StorageProvider instance, sharing only the namespace — exactly
        // the way a second application load, or a second browser tab,
        // shares one underlying localStorage without ever sharing a JS
        // object with the first.
        const replica2Store = new IceServerConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        assert(replica2Store !== replica1Store, 'C1. sanity — genuinely separate store instances, not the same object reused');
        const replica2Resolved = (replica2Store.get() || { servers: DEFAULT_ICE_SERVERS }).servers;
        assert(replica2Resolved[0].urls === 'stun:shared-replica.example:3478', 'C2. Replica 2, independently composed over the same storage namespace, resolves the list Replica 1 saved — persistence is the authority, never an in-memory singleton');

        // restart boundary — Replica 3: composes all the way through a
        // real WebRtcPeerConnectionProvider, exactly as ui/main.js does.
        const replica3Store = new IceServerConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        const replica3Resolved = (replica3Store.get() || { servers: DEFAULT_ICE_SERVERS }).servers;
        RecordingRTCPeerConnection.constructions = [];
        const replica3Provider = new WebRtcPeerConnectionProvider({ iceServers: replica3Resolved, RTCPeerConnectionImpl: RecordingRTCPeerConnection });
        replica3Provider.createOffer();

        // Convergence: all three replicas agree, with no shared object
        // anywhere along the chain.
        assert(replica1Store !== replica2Store && replica2Store !== replica3Store && replica1Store !== replica3Store, 'C3. all three store instances are pairwise distinct objects — no shared store');
        assert(replica2Resolved[0].urls === replica3Resolved[0].urls && replica3Resolved[0].urls === 'stun:shared-replica.example:3478', 'C4. Replica 2 and Replica 3 independently resolved the identical effective STUN list');
        assert(RecordingRTCPeerConnection.constructions[0][0].urls === 'stun:shared-replica.example:3478', 'C5. Replica 3\'s own concrete RTCPeerConnection construction actually received the converged list, unchanged, through the real, unmodified provider class');

        // A further write from Replica 2 is visible back through Replica
        // 1's own (still-live) store instance too — the same underlying
        // storage, never divergent in-memory state.
        const replica2UseCase = new SetIceServerConfigurationUseCase({ iceServerConfigurationStore: replica2Store });
        replica2UseCase.execute({ servers: [{ urls: 'stun:replica-2-write.example:3478' }] });
        assert(replica1Store.get().servers[0].urls === 'stun:replica-2-write.example:3478', 'C6. a write from a later-constructed replica is visible back through the FIRST replica\'s own store instance — persistence, not process memory, is the single authority');

        // A clear() from one replica is durable across a further restart.
        replica1Store.clear();
        const replica4Store = new IceServerConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        assert((replica4Store.get() || { servers: DEFAULT_ICE_SERVERS }).servers === DEFAULT_ICE_SERVERS, 'C7. Replica 4, restarted after Replica 1 cleared the override, resolves the deployment default — the clear() is durable across the same restart boundary');

        console.log('✓ Section C: four genuinely independent replicas over one shared storage namespace converge on the same effective STUN list at each step — custom -> restart -> restart-through-RTCPeerConnection -> a further write visible back through the original instance -> clear -> restart -> deployment default — with no shared singleton anywhere in the chain');
    }

    // ===============================================================
    // Section D — Reset semantics: clear() is a real storage removal
    // (verified against the raw StorageProvider, not merely store.get()),
    // genuinely distinct from ever having saved DEFAULT_ICE_SERVERS
    // explicitly.
    // ===============================================================
    {
        const backing = new InMemoryStorageProvider();
        const store = new IceServerConfigurationStore(backing);
        const setUseCase = new SetIceServerConfigurationUseCase({ iceServerConfigurationStore: store });

        setUseCase.execute({ servers: [{ urls: 'stun:before-clear.example:3478' }] });
        assert(backing.list().includes('ice-server-configuration'), 'D1. sanity — the raw StorageProvider genuinely holds an entry before clearing');

        store.clear();
        assert(!backing.list().includes('ice-server-configuration'), 'D2. clear() genuinely removes the raw storage entry — verified against the StorageProvider\'s own list(), independently of store.get()\'s own null return');
        assert(backing.load('ice-server-configuration') === null, 'D3. …and a direct load() against the raw key confirms nothing remains');

        // Explicitly saving DEFAULT_ICE_SERVERS by hand produces a
        // DIFFERENT raw storage footprint from clear() — a real entry, not
        // an absence.
        setUseCase.execute({ servers: DEFAULT_ICE_SERVERS.map((entry) => ({ urls: entry.urls })) });
        assert(backing.list().includes('ice-server-configuration'), 'D4. explicitly saving default-matching entries leaves a real raw storage entry — genuinely distinct from the D2 post-clear() state, even though both eventually resolve to the same effective list');

        console.log('✓ Section D: clear() is a genuine raw storage removal, independently confirmed against the StorageProvider itself; an explicit save of default-matching entries remains a real, distinct raw entry — clear() is never merely a synonym for "save the default"');
    }

    // ===============================================================
    // Section E — Failure semantics: a genuine StorageProvider failure
    // propagates out of save()/get()/clear() (never silently degrades),
    // and an already-running provider's iceServers survive a later
    // malformed write untouched.
    // ===============================================================
    {
        const throwingStore = new IceServerConfigurationStore(new ThrowingStorageProvider());

        let getThrew = false;
        try { throwingStore.get(); } catch { getThrew = true; }
        assert(getThrew, 'E1. a genuine StorageProvider.load() failure propagates out of get(), never silently degrading to null the way malformed DATA does');

        let saveThrew = false;
        try { throwingStore.save(new IceServerConfiguration({ servers: [{ urls: 'stun:a.example:3478' }] })); } catch { saveThrew = true; }
        assert(saveThrew, 'E2. a genuine StorageProvider.save() failure propagates out of save()');

        let clearThrew = false;
        try { throwingStore.clear(); } catch { clearThrew = true; }
        assert(clearThrew, 'E3. a genuine StorageProvider.remove() failure propagates out of clear()');

        // An already-constructed WebRtcPeerConnectionProvider's own
        // iceServers is a plain constructor argument, resolved once at
        // startup — a LATER malformed write to the store (simulating a
        // corrupted write mid-session, e.g. a second tab) can never reach
        // back into an already-running provider; only a fresh startup's
        // own resolution would ever observe the degrade-to-absence.
        const backing = new InMemoryStorageProvider();
        const store = new IceServerConfigurationStore(backing);
        const setUseCase = new SetIceServerConfigurationUseCase({ iceServerConfigurationStore: store });
        setUseCase.execute({ servers: [{ urls: 'stun:running.example:3478' }] });
        const resolvedAtStartup = (store.get() || { servers: DEFAULT_ICE_SERVERS }).servers;
        const runningProvider = new WebRtcPeerConnectionProvider({ iceServers: resolvedAtStartup, RTCPeerConnectionImpl: RecordingRTCPeerConnection });

        // Corrupt the underlying storage directly, bypassing the store's
        // own validation entirely (simulating bytes on disk going bad
        // while this process is still running).
        backing.save('ice-server-configuration', { servers: [{ urls: 'turn:corrupted.example:3478' }] });
        assert(store.get() === null, 'E4. sanity — the store itself now correctly reports the corrupted data as absent');

        RecordingRTCPeerConnection.constructions = [];
        runningProvider.createOffer();
        assert(RecordingRTCPeerConnection.constructions[0][0].urls === 'stun:running.example:3478',
            'E5. the ALREADY-RUNNING provider\'s own iceServers is completely unaffected by a later corruption of the underlying storage — it was resolved once, at its own construction, and never re-reads the store on its own; only a genuine restart\'s own fresh resolution would ever observe the degrade-to-absence');

        console.log('✓ Section E: a genuine StorageProvider failure propagates out of save()/get()/clear() rather than degrading silently (that degradation is reserved for malformed DATA, never a transport failure); an already-running provider\'s resolved iceServers is immune to a later corruption of the underlying storage — only a fresh startup ever re-resolves');
    }

    // ===============================================================
    // Section F — TURN isolation: no scheme-confusable variant can ever
    // be accepted as a STUN entry; fetchIceServers()'s own credential path
    // is unreferenced by any of this configuration's own files.
    // ===============================================================
    {
        const adversarialUrls = [
            'turn:relay.example:3478',
            'turns:relay.example:5349',
            'TURN:relay.example:3478',
            'Turn:relay.example:3478',
            ' turn:relay.example:3478',
            'turn:relay.example:3478 ',
            'stun:relay.example:3478?transport=turn',
            'stun+turn:relay.example:3478',
            'turn+stun:relay.example:3478',
            'sturn:relay.example:3478',
            'stunturn:relay.example:3478'
        ];
        // Every one of the above is invalid under the RFC 7064
        // `stuns?:host(:port)?` shape this codebase validates — case
        // variants, whitespace, an embedded "turn" substring, and a
        // query string are all rejected on SHAPE, never on a
        // string-matching heuristic against the word "turn".
        for (const url of adversarialUrls) {
            assert(isValidStunUrl(url) === false, `F1 ('${url}'). never accepted as a valid STUN url`);
            let threw = false;
            try { new IceServerConfiguration({ servers: [{ urls: url }] }); } catch { threw = true; }
            assert(threw, `F2 ('${url}'). also throws at IceServerConfiguration construction — validation is not bypassable by constructing directly`);
        }
        // The one adversarial entry that IS a syntactically valid STUN url
        // (a query string is not part of the RFC 7064 stun:/stuns: form
        // this codebase validates) is still never a `turn:`/`turns:`
        // scheme — confirming the scheme check, not a query-string
        // heuristic, is what actually excludes TURN.
        assert(isValidStunUrl('stun:relay.example:3478?transport=turn') === false, 'F3. a query string is not part of the valid stun:/stuns: URI form this codebase accepts at all — rejected on shape, independently of the word "turn" appearing anywhere in it');

        // A mixed list — one genuine STUN entry alongside one TURN
        // entry — is rejected as a WHOLE, never partially accepted.
        let mixedThrew = false;
        try {
            new IceServerConfiguration({ servers: [{ urls: 'stun:good.example:3478' }, { urls: 'turn:relay.example:3478' }] });
        } catch { mixedThrew = true; }
        assert(mixedThrew, 'F4. a server list mixing a valid STUN entry with a TURN entry is rejected in its entirety');

        // Structural: fetchIceServers() and its TURN credential constants
        // are never referenced by any file in this configuration's own
        // boundary.
        const iceConfigSource = executableOf(await source('core/IceServerConfiguration.js'));
        const storeSource = executableOf(await source('storage/IceServerConfigurationStore.js'));
        const useCaseSource = executableOf(await source('application/SetIceServerConfigurationUseCase.js'));
        const viewSource = executableOf(await source('ui/views/StunSettingsView.js'));
        for (const [label, src] of [
            ['core/IceServerConfiguration.js', iceConfigSource],
            ['storage/IceServerConfigurationStore.js', storeSource],
            ['application/SetIceServerConfigurationUseCase.js', useCaseSource],
            ['ui/views/StunSettingsView.js', viewSource]
        ]) {
            assert(!/fetchIceServers|METERED_TURN_ENDPOINT|METERED_API_KEY/.test(src), `F5 (${label}). never references the TURN-fetching seam or its credential constants`);
        }

        console.log('✓ Section F: every scheme-confusable variant (case, whitespace, embedded substring, mixed list) is rejected — construction throws before anything is persisted — and none of this configuration\'s own files reference the TURN-fetching seam or its credential constants');
    }

    // ===============================================================
    // Section G — Rendezvous isolation: peer/RendezvousConfig.js,
    // peer/DiscoveryBootstrap.js, and peer/PeerAuthenticationSession.js
    // are all untouched, in both directions.
    // ===============================================================
    {
        assert(Array.isArray(DEFAULT_RENDEZVOUS_URLS), 'G1. DEFAULT_RENDEZVOUS_URLS is still a real array, untouched by this configuration boundary');

        const rendezvousConfigSource = executableOf(await source('peer/RendezvousConfig.js'));
        const discoveryBootstrapSource = executableOf(await source('peer/DiscoveryBootstrap.js'));
        const authSource = executableOf(await source('peer/PeerAuthenticationSession.js'));
        for (const [label, src] of [
            ['peer/RendezvousConfig.js', rendezvousConfigSource],
            ['peer/DiscoveryBootstrap.js', discoveryBootstrapSource]
        ]) {
            assert(!/IceServerConfiguration|IceServerConfigurationStore|SetIceServerConfigurationUseCase|StunSettingsView/.test(src), `G2 (${label}). imports none of this configuration's own classes`);
        }
        assert(!/IceServerConfiguration|IceServerConfigurationStore|iceServers|WebRtcPeerConnectionProvider/.test(authSource),
            'G3. peer/PeerAuthenticationSession.js — the sole authority on peer identity — imports none of this configuration or connectivity boundary; a change of which STUN server carries the bytes cannot change who those bytes are proven to belong to');

        // Reverse direction: this configuration's own files never
        // reference Rendezvous by name in executable code.
        const iceConfigSource = executableOf(await source('core/IceServerConfiguration.js'));
        const storeSource = executableOf(await source('storage/IceServerConfigurationStore.js'));
        const useCaseSource = executableOf(await source('application/SetIceServerConfigurationUseCase.js'));
        const viewSource = executableOf(await source('ui/views/StunSettingsView.js'));
        for (const [label, src] of [
            ['core/IceServerConfiguration.js', iceConfigSource],
            ['storage/IceServerConfigurationStore.js', storeSource],
            ['application/SetIceServerConfigurationUseCase.js', useCaseSource],
            ['ui/views/StunSettingsView.js', viewSource]
        ]) {
            assert(!/Rendezvous|DiscoveryBootstrap/.test(src), `G4 (${label}). never references Rendezvous or DiscoveryBootstrap in executable code`);
        }

        console.log('✓ Section G: Rendezvous\'s own configuration and bootstrap, and the sole authority on peer identity, are all untouched by this configuration boundary — in both directions, structurally confirmed');
    }

    // ===============================================================
    // Section H — Cross-configuration isolation: IceServerConfiguration,
    // ArweaveGatewayConfiguration, and NostrRelayConfiguration round-trip
    // independently through one shared storage namespace with no key
    // collision and no value bleed, in every direction.
    // ===============================================================
    {
        const sharedNamespace = {};
        const stunStore = new IceServerConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        const arweaveStore = new ArweaveGatewayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        const nostrStore = new NostrRelayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));

        stunStore.save(new IceServerConfiguration({ servers: [{ urls: 'stun:stun-only.example:3478' }] }));
        arweaveStore.save(new ArweaveGatewayConfiguration({ gatewayUrl: 'https://arweave-only.example' }));
        nostrStore.save(new NostrRelayConfiguration({ relayUrl: 'wss://nostr-only.example' }));

        assert(stunStore.get().servers[0].urls === 'stun:stun-only.example:3478', 'H1. the STUN store still reads back exactly its own saved value after unrelated Arweave/Nostr configurations were written to the same namespace');
        assert(arweaveStore.get().gatewayUrl === 'https://arweave-only.example', 'H2. the Arweave store is unaffected by the co-resident STUN configuration');
        assert(nostrStore.get().relayUrl === 'wss://nostr-only.example', 'H3. the Nostr store is unaffected by the co-resident STUN configuration');

        const namespaceKeys = Object.keys(sharedNamespace).sort();
        assert(namespaceKeys.length === 3 && namespaceKeys.includes('ice-server-configuration') && namespaceKeys.includes('arweave-gateway-configuration') && namespaceKeys.includes('nostr-relay-configuration'),
            `H4. exactly three distinct, non-colliding storage keys exist in the shared namespace — found ${JSON.stringify(namespaceKeys)}`);

        // Changing, then clearing, the STUN override has zero effect on
        // the co-resident Arweave/Nostr values.
        stunStore.save(new IceServerConfiguration({ servers: [{ urls: 'stun:stun-changed.example:3478' }] }));
        assert(arweaveStore.get().gatewayUrl === 'https://arweave-only.example' && nostrStore.get().relayUrl === 'wss://nostr-only.example', 'H5. changing the STUN override leaves the co-resident Arweave and Nostr values untouched');
        stunStore.clear();
        assert(arweaveStore.get().gatewayUrl === 'https://arweave-only.example' && nostrStore.get().relayUrl === 'wss://nostr-only.example', 'H6. clearing the STUN override entirely leaves the co-resident Arweave and Nostr values untouched');
        assert(stunStore.get() === null, 'H7. sanity — the STUN override is genuinely cleared');

        // Structural sweep, both directions.
        const iceConfigSource = executableOf(await source('core/IceServerConfiguration.js'));
        const storeSource = executableOf(await source('storage/IceServerConfigurationStore.js'));
        const isolationPattern = /Arweave|Nostr|Ipfs|IPFS|Bitcoin|Base\b|RoleProvider|ProviderSelection|providerRanking/;
        assert(!isolationPattern.test(iceConfigSource), 'H8. core/IceServerConfiguration.js references none of Arweave/Nostr/IPFS/Bitcoin/Base/RoleProviderPreference');
        assert(!isolationPattern.test(storeSource), 'H9. storage/IceServerConfigurationStore.js references none of Arweave/Nostr/IPFS/Bitcoin/Base/RoleProviderPreference');

        const arweaveConfigSource = executableOf(await source('core/ArweaveGatewayConfiguration.js'));
        const arweaveStoreSource = executableOf(await source('storage/ArweaveGatewayConfigurationStore.js'));
        const nostrConfigSource = executableOf(await source('core/NostrRelayConfiguration.js'));
        const nostrStoreSource = executableOf(await source('storage/NostrRelayConfigurationStore.js'));
        for (const [label, src] of [
            ['core/ArweaveGatewayConfiguration.js', arweaveConfigSource],
            ['storage/ArweaveGatewayConfigurationStore.js', arweaveStoreSource],
            ['core/NostrRelayConfiguration.js', nostrConfigSource],
            ['storage/NostrRelayConfigurationStore.js', nostrStoreSource]
        ]) {
            assert(!/IceServerConfiguration|IceServerConfigurationStore|SetIceServerConfigurationUseCase|StunSettingsView/.test(src), `H10 (${label}). no reverse reference to STUN's own configuration boundary exists either — isolation holds in both directions`);
        }

        console.log('✓ Section H: IceServerConfiguration, ArweaveGatewayConfiguration, and NostrRelayConfiguration round-trip independently through one shared storage namespace with no key collision and no value bleed in any direction; none of the three configuration families reference either of the other two, IPFS, Bitcoin, Base, or RoleProviderPreference');
    }

    // ===============================================================
    // Section I — The flagship assertion: a configured STUN server list is
    // authoritative even when unreachable. Driven through a real
    // WebRtcPeerConnection whose ICE gathering never completes, the
    // bounded timeout still fires, a local signal is still produced, and
    // the underlying RTCPeerConnection was constructed with — and never
    // silently replaced away from — the exact configured (unreachable-
    // looking) STUN list.
    // ===============================================================
    {
        const backing = new InMemoryStorageProvider();
        const store = new IceServerConfigurationStore(backing);
        const setUseCase = new SetIceServerConfigurationUseCase({ iceServerConfigurationStore: store });

        // Syntactically valid, deliberately unreachable — accepted exactly
        // like any other valid STUN url, because validation is shape-only.
        const unreachableUrl = 'stun:this-host-does-not-exist.invalid:3478';
        setUseCase.execute({ servers: [{ urls: unreachableUrl }] });

        // A real application startup's own resolution — no health check,
        // no reachability probe, no special-casing of any kind.
        const resolvedIceServers = (store.get() || { servers: DEFAULT_ICE_SERVERS }).servers;
        assert(resolvedIceServers[0].urls === unreachableUrl, 'I1. sanity — the unreachable-looking custom list is what actually resolved, exactly as a real, unreachable STUN server would after being saved');

        NeverGatheringRTCPeerConnection.constructions = [];
        const provider = new WebRtcPeerConnectionProvider({
            iceServers: resolvedIceServers,
            RTCPeerConnectionImpl: NeverGatheringRTCPeerConnection,
            iceGatheringTimeoutMs: 60
        });

        const start = Date.now();
        const connection = provider.createOffer();
        assert(NeverGatheringRTCPeerConnection.constructions.length === 1 && NeverGatheringRTCPeerConnection.constructions[0][0].urls === unreachableUrl,
            'I2. the concrete RTCPeerConnection was constructed with the exact configured (unreachable-looking) STUN list — never DEFAULT_ICE_SERVERS substituted up front');

        // Gathering never completes (iceGatheringState stays 'new'
        // forever, simulating a genuinely unreachable/silent STUN server)
        // — the bounded ICE-gathering timeout (0.3.6) still produces a
        // usable local signal.
        const signal = await new Promise((resolve) => connection.onLocalSignalReady(resolve));
        const elapsed = Date.now() - start;
        assert(signal !== null && signal !== undefined, 'I3. a local signal is still produced once the bounded timeout elapses, even though the configured STUN server never answered at all');
        assert(elapsed < 1000, `I4. …and promptly, bounded by the timeout, never hanging indefinitely on the unreachable server (took ${elapsed}ms)`);

        // The decisive proof: even AFTER the timeout fired and a signal
        // was produced, the underlying RTCPeerConnection's own iceServers
        // — and the provider's own resolved list for any FUTURE
        // connection — remain exactly the configured, still-unreachable
        // STUN list. Nothing replaced it, nothing health-checked it away,
        // nothing reverted it to DEFAULT_ICE_SERVERS.
        assert(connection._peerConnection.iceServers[0].urls === unreachableUrl,
            'I5. FLAGSHIP — after the ICE-gathering timeout fired, the concrete RTCPeerConnection\'s own iceServers is STILL exactly the configured, still-unreachable STUN list — a configured STUN server remains authoritative even when it never answers, never silently replaced by the deployment default');

        NeverGatheringRTCPeerConnection.constructions = [];
        provider.createOffer();
        assert(NeverGatheringRTCPeerConnection.constructions[0][0].urls === unreachableUrl,
            'I6. …and a SECOND, later connection from the same provider still uses the identical configured (unreachable) list — no automatic fallback was triggered by the first connection\'s own timeout');

        // The store itself, asked again after the timeout, still reports
        // the exact same configuration — no automatic reversion of any
        // kind was ever persisted either.
        assert(store.get().servers[0].urls === unreachableUrl, 'I7. the persisted configuration itself is untouched by the earlier connection timeout — nothing in this milestone\'s classes ever writes back to the store as a reaction to a connection-time outcome');

        connection.close();
        provider.dispose();

        console.log('✓ Section I: FLAGSHIP — a configured, syntactically-valid-but-unreachable STUN server reaches the concrete RTCPeerConnection construction, survives a real bounded ICE-gathering timeout with zero replacement, remains the list a SECOND connection uses, and remains exactly what is persisted — configuration and resilience/fallback policy stay two genuinely separate concerns');
    }

    // ===============================================================
    // Section J — No hidden resilience semantics: no health check,
    // latency ranking, automatic server selection, or reconnection policy
    // exists anywhere in this configuration's own files.
    // ===============================================================
    {
        const configSource = executableOf(await source('core/IceServerConfiguration.js'));
        const storeSource = executableOf(await source('storage/IceServerConfigurationStore.js'));
        const useCaseSource = executableOf(await source('application/SetIceServerConfigurationUseCase.js'));
        const viewSource = executableOf(await source('ui/views/StunSettingsView.js'));

        const forbiddenPattern = /healthCheck|latencyRank|autoSelect|automaticFallback|reconnectionPolicy|pingServer|probeServer|rankServers/i;
        for (const [label, src] of [
            ['core/IceServerConfiguration.js', configSource],
            ['storage/IceServerConfigurationStore.js', storeSource],
            ['application/SetIceServerConfigurationUseCase.js', useCaseSource],
            ['ui/views/StunSettingsView.js', viewSource]
        ]) {
            assert(!forbiddenPattern.test(src), `J1 (${label}). no health-check/latency-ranking/auto-selection/reconnection-policy identifier of any kind exists`);
        }

        // No class in this boundary exposes a method shaped like a
        // reachability probe or a reconnection trigger.
        const store = new IceServerConfigurationStore(new InMemoryStorageProvider());
        const setUseCase = new SetIceServerConfigurationUseCase({ iceServerConfigurationStore: store });
        const configuration = new IceServerConfiguration({ servers: [{ urls: 'stun:a.example:3478' }] });
        for (const forbiddenMethod of ['test', 'testConnection', 'healthCheck', 'ping', 'probe', 'verify', 'checkReachability', 'rank', 'reconnect', 'selectBest']) {
            assert(typeof store[forbiddenMethod] === 'undefined', `J2. IceServerConfigurationStore exposes no ${forbiddenMethod}()`);
            assert(typeof setUseCase[forbiddenMethod] === 'undefined', `J2. SetIceServerConfigurationUseCase exposes no ${forbiddenMethod}()`);
            assert(typeof configuration[forbiddenMethod] === 'undefined', `J2. IceServerConfiguration exposes no ${forbiddenMethod}()`);
        }

        // Saving never attempts a network call of any kind — reconfirmed
        // here as a structural property of this audit's own scope, not
        // merely inherited from 0.9.386's own test.
        let fetchCalled = false;
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (...args) => { fetchCalled = true; return originalFetch ? originalFetch(...args) : Promise.reject(new Error('no fetch')); };
        try {
            setUseCase.execute({ servers: [{ urls: 'stun:no-network-check.example:3478' }] });
        } finally {
            globalThis.fetch = originalFetch;
        }
        assert(!fetchCalled, 'J3. saving a configuration never triggers a network call of any kind');

        console.log('✓ Section J: no health-check, latency-ranking, automatic-selection, or reconnection-policy identifier or method exists anywhere in this configuration boundary, and saving still never attempts a network call — the capability is structurally absent, not merely unexercised');
    }

    // ===============================================================
    // Section K — Final decision matrix.
    // ===============================================================
    {
        const matrix = [
            ['One configuration model?', 'YES', '✅'],
            ['One storage key?', 'YES', '✅'],
            ['One store construction site?', 'YES', '✅'],
            ['One write-use-case construction site?', 'YES', '✅'],
            ['Absence preserved?', 'YES', '✅'],
            ['Explicit default preserved as a distinct fact?', 'YES', '✅'],
            ['Restart convergence across independent replicas?', 'YES', '✅'],
            ['clear() a genuine raw storage removal?', 'YES', '✅'],
            ['Storage failures propagate (never degrade)?', 'YES', '✅'],
            ['Running provider immune to later corruption?', 'YES', '✅'],
            ['TURN scheme confusable in any way?', 'NO', '✅'],
            ['Rendezvous coupling, either direction?', 'NO', '✅'],
            ['Peer identity/authentication coupling?', 'NO', '✅'],
            ['Cross-configuration bleed (Arweave/Nostr)?', 'NO', '✅'],
            ['Configured-but-unreachable STUN ever replaced?', 'NO', '✅'],
            ['Health checking / latency ranking / auto-selection?', 'NO', '✅'],
            ['Second configuration authority of any kind?', 'NO', '✅']
        ];
        console.log('\n=== FINAL DECISION MATRIX ===');
        console.log('Property                                              | Expected | Observed');
        console.log('-------------------------------------------------------|----------|---------');
        for (const [question, expected, observed] of matrix) {
            console.log(`${question.padEnd(56)}| ${expected.padEnd(9)}| ${observed}`);
        }

        console.log('\n=== VERDICT: CONVERGED / ARCHITECTURALLY CLOSED ===');
        console.log('Sections A-J prove convergence, not just correctness-in-isolation: one value object, one storage');
        console.log('key, one store construction site, and one write-use-case construction site are ever referenced');
        console.log('(A); absence and an explicit default stay distinguishable facts in persistence even when their');
        console.log('effective STUN list coincides (B); four independently-composed replicas over one shared storage');
        console.log('namespace converge on the identical effective list, proven through a concrete RTCPeerConnection');
        console.log('construction (C); clear() is a real raw storage removal, independently confirmed (D); a genuine');
        console.log('storage failure propagates rather than degrading, and an already-running provider is immune to a');
        console.log('later corruption of the underlying storage (E); no scheme-confusable variant is ever accepted as');
        console.log('STUN, and the TURN-fetching seam is unreferenced (F); Rendezvous\'s own bootstrap and the sole');
        console.log('authority on peer identity are untouched in both directions (G); STUN, Arweave, and Nostr');
        console.log('configuration round-trip independently through one shared namespace with no bleed in any');
        console.log('direction (H); a configured-but-unreachable STUN server survives a real bounded ICE-gathering');
        console.log('timeout completely unreplaced, for both the connection that timed out and the next one, and the');
        console.log('persisted fact itself is untouched — configuration and resilience/fallback policy remain two');
        console.log('genuinely separate concerns (I); and no health-check, latency-ranking, automatic-selection, or');
        console.log('reconnection-policy capability exists anywhere in this boundary (J).');
        console.log('0.9.386\'s implementation is architecturally closed. No convergence defect was found; no production change was made.');
    }

    console.log('\n✅ All STUN Configuration Lifecycle & Convergence Audit tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
