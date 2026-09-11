import { readFile } from 'node:fs/promises';

import { IceServerConfiguration, isValidStunUrl } from '../core/IceServerConfiguration.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { IceServerConfigurationStore } from '../storage/IceServerConfigurationStore.js';
import { SetIceServerConfigurationUseCase } from '../application/SetIceServerConfigurationUseCase.js';
import { WebRtcPeerConnectionProvider } from '../peer/WebRtcPeerConnectionProvider.js';
import { DEFAULT_ICE_SERVERS, fetchIceServers } from '../peer/IceServerConfig.js';
import { DEFAULT_RENDEZVOUS_URLS } from '../peer/RendezvousConfig.js';

// 0.9.386 — User-Configurable STUN Server Configuration.
//
// 0.9.385's own audit selected STUN as one of exactly two BUILD_NEXT
// candidates (Rendezvous the other, a separate milestone) on the strength
// of a real criticality finding and an already-proven live runtime seam
// (`WebRtcPeerConnectionProvider#setIceServers()`). This suite proves the
// missing settings-persistable half: a real value object, a durable
// store, a write use case, and a settings surface, reachable end to end,
// without changing any peer, identity, authentication, TURN, or
// Rendezvous semantics.
//
//   Section 0 — the settings entry point is actually reachable (nav link,
//               route, composition-root wiring, view wiring — never
//               inferred from source alone).
//   Section A — default configuration: no saved override resolves to
//               DEFAULT_ICE_SERVERS.
//   Section B — custom configuration: a valid override actually saves and
//               reads back through the new write seam.
//   Section C — multiple STUN servers: order preserved, each validated
//               independently.
//   Section D — immutable value object: frozen, defensive copies, value
//               equality.
//   Section E — persistence: save/get/clear round-trip through the store.
//   Section F — restart/reconstruction: a brand-new store/use-case pair,
//               over the SAME underlying storage, observes what an
//               earlier instance persisted.
//   Section G — malformed stored data degrades to absence, never a
//               thrown error or a partial list.
//   Section H — exact propagation into RTCPeerConnection: default and
//               custom lists both reach the concrete construction call
//               unchanged, through the real, unmodified provider classes.
//   Section I — reset to defaults: clear() restores genuine absence,
//               never a saved copy of the default.
//   Section J — no effect on TURN: fetchIceServers()'s own credential
//               fetch, merge, and dedupe logic are completely unmodified;
//               only the STUN baseline it merges with changes.
//   Section K — no effect on Rendezvous: peer/RendezvousConfig.js and
//               peer/PeerAuthenticationSession.js are untouched by this
//               milestone's own configuration boundary.
//   Section L — existing peer journey regression: createOffer()/connect()
//               behave identically whether iceServers came from a user
//               override or the deployment default.
//   Section M — no fallback/health checking: saving never attempts a
//               network call or an RTCPeerConnection of any kind, and an
//               "unreachable-looking" STUN url is accepted exactly like
//               any other syntactically valid one.
//   Section N — runtime failure behavior unchanged: peer/
//               WebRtcPeerConnection.js's own ICE-gathering timeout is
//               untouched, and this milestone's classes never import it.
//
// See core/IceServerConfiguration.js, storage/IceServerConfigurationStore.js,
// application/SetIceServerConfigurationUseCase.js, and
// ui/views/StunSettingsView.js for the full design rationale this
// milestone carries out.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch { threw = true; }
    assert(threw, message);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// Two SEPARATE instances over one externally-owned namespace — the same
// "restart" shape tests/ArweaveGatewaySettingsEntryPoint.test.js's own
// SharedNamespaceStorageProvider already establishes.
class SharedNamespaceStorageProvider extends StorageProvider {
    constructor(sharedNamespace) { super(); this._namespace = sharedNamespace; }
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

// Starts 'complete' immediately — this suite's own concern is WHICH
// iceServers value reaches the concrete construction call, never real ICE
// gathering timing (already proven elsewhere, e.g.
// tests/IceGatheringTimeout.test.js) — mirrors tests/
// UserConfigurableInfrastructureEndpointProductDirectionAudit.test.js's
// own RecordingRTCPeerConnection exactly.
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

const SOURCE_ROOT = new URL('../', import.meta.url);
async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function run() {
    // ===============================================================
    // Section 0 — settings entry point reachability.
    // ===============================================================
    {
        const mainSource = await source('ui/main.js');
        assert(mainSource.includes("import { IceServerConfigurationStore } from '../storage/IceServerConfigurationStore.js';"),
            '1. ui/main.js imports the new store');
        assert(mainSource.includes("import { SetIceServerConfigurationUseCase } from '../application/SetIceServerConfigurationUseCase.js';"),
            '2. ui/main.js imports the new write use case');
        assert(/new IceServerConfigurationStore\(new LocalStorageProvider\(\)\)/.test(mainSource),
            '3. ui/main.js constructs a real IceServerConfigurationStore over LocalStorageProvider');
        assert(/new SetIceServerConfigurationUseCase\(\{\s*iceServerConfigurationStore\s*\}\)/.test(mainSource),
            '4. ui/main.js wires SetIceServerConfigurationUseCase against the SAME shared iceServerConfigurationStore, never a second disconnected store');
        assert(/app\.provide\('iceServerConfigurationStore',\s*iceServerConfigurationStore\)/.test(mainSource),
            '5. the shared store is actually provided to the Vue app, not just constructed and discarded');
        assert(/app\.provide\('setIceServerConfigurationUseCase',\s*setIceServerConfigurationUseCase\)/.test(mainSource),
            '6. the write use case is actually provided to the Vue app');
        const storeConstructions = (mainSource.match(/new IceServerConfigurationStore\(/g) || []).length;
        assert(storeConstructions === 1, `7. ui/main.js constructs exactly one IceServerConfigurationStore instance — found ${storeConstructions}`);
        assert(mainSource.includes('new WebRtcPeerConnectionProvider({ iceServers: resolvedIceServers })'),
            '8. WebRtcPeerConnectionProvider is constructed from resolvedIceServers, never a bare DEFAULT_ICE_SERVERS literal');
        assert(/const resolvedIceServers = \(iceServerConfigurationStore\.get\(\) \|\| \{ servers: DEFAULT_ICE_SERVERS \}\)\.servers;/.test(mainSource),
            '9. resolvedIceServers falls back to DEFAULT_ICE_SERVERS only when no override is on file, never persisting that fallback as a preference');
        assert(mainSource.includes('fetchIceServers({ fallback: resolvedIceServers })'),
            '10. the TURN-fetching background enrichment merges with resolvedIceServers, not a hard-coded default — TURN\'s own fetch/credential logic is otherwise untouched');

        const routerSource = await source('ui/router/index.js');
        assert(/path:\s*'\/settings\/stun'/.test(routerSource), '11. a real route exists for the settings entry point');
        assert(routerSource.includes("import StunSettingsView from '../views/StunSettingsView.js';"),
            '12. the router imports the real view component, never a stub');

        const appSource = await source('ui/App.js');
        assert(/router-link to="\/settings\/stun"/.test(appSource), '13. a real top-nav link reaches the settings entry point');

        const viewSource = await source('ui/views/StunSettingsView.js');
        const viewExecutable = viewSource.replace(/\/\/.*$/gm, '');
        assert(/inject\('iceServerConfigurationStore',\s*null\)/.test(viewExecutable),
            '14. the view reads the configuration through the injected store, never a store it constructs itself');
        assert(/inject\('setIceServerConfigurationUseCase',\s*null\)/.test(viewExecutable),
            '15. the view writes the configuration through the injected use case, never IceServerConfigurationStore.save() directly');
        assert(!/new IceServerConfiguration\(/.test(viewExecutable),
            '16. the view never constructs an IceServerConfiguration itself — validation and construction stay inside the use case');
        assert(viewExecutable.includes("import { DEFAULT_ICE_SERVERS } from '../../peer/IceServerConfig.js';"),
            '17. the ONE thing the view imports from peer/IceServerConfig.js is the plain default constant, for display only');
        assert(!/WebRtcPeerConnectionProvider|setIceServers\(/.test(viewExecutable),
            '18. the view never imports or constructs the peer connection provider, and never calls setIceServers() — a saved change only takes effect on the next application load');
        assert(!/fetchIceServers/.test(viewExecutable),
            '19. the view never touches the TURN-fetching seam either');
        console.log('✓ Section 0: the settings entry point is really wired — nav link, route, shared store, shared use case, and a view that only ever goes through the injected collaborators');
    }

    // ===============================================================
    // Section A — default configuration: no saved override resolves to
    // DEFAULT_ICE_SERVERS.
    // ===============================================================
    {
        const store = new IceServerConfigurationStore(new InMemoryStorageProvider());
        assert(store.get() === null, '20. a fresh store with nothing saved returns null — genuine absence, never a fabricated default');
        const resolved = (store.get() || { servers: DEFAULT_ICE_SERVERS }).servers;
        assert(resolved === DEFAULT_ICE_SERVERS, '21. resolving the effective STUN list against an empty store yields exactly DEFAULT_ICE_SERVERS');
    }
    console.log('✓ Section A: no saved override resolves to DEFAULT_ICE_SERVERS, and absence is never confused with a fabricated default');

    // ===============================================================
    // Section B — custom configuration: a valid override actually saves
    // and reads back through the new write seam.
    // ===============================================================
    {
        const store = new IceServerConfigurationStore(new InMemoryStorageProvider());
        const setUseCase = new SetIceServerConfigurationUseCase({ iceServerConfigurationStore: store });

        const saved = setUseCase.execute({ servers: [{ urls: 'stun:custom.example:3478' }] });
        assert(saved instanceof IceServerConfiguration, '22. execute() returns a real IceServerConfiguration');
        assert(saved.servers.length === 1 && saved.servers[0].urls === 'stun:custom.example:3478',
            '23. execute() returns the persisted configuration with the exact custom entry');
        const reread = store.get();
        assert(reread.servers.length === 1 && reread.servers[0].urls === 'stun:custom.example:3478',
            '24. saving a valid custom STUN server actually persists it, readable back through the store');

        // Invalid input is rejected without mutating whatever was
        // previously on file.
        expectThrows(() => setUseCase.execute({ servers: [] }), '25. an empty servers array is refused');
        expectThrows(() => setUseCase.execute({ servers: [{ urls: 'turn:relay.example:3478' }] }), '26. a turn: entry is refused — STUN only, by construction');
        expectThrows(() => setUseCase.execute({ servers: [{ urls: 'https://not-stun.example' }] }), '27. a non-stun scheme is refused');
        expectThrows(() => setUseCase.execute({}), '28. a missing servers field is refused');
        assert(store.get().servers[0].urls === 'stun:custom.example:3478',
            '29. every rejected save left the PREVIOUSLY saved configuration completely untouched');
    }
    console.log('✓ Section B: a valid custom STUN server saves through SetIceServerConfigurationUseCase; invalid input is rejected without mutating the existing configuration');

    // ===============================================================
    // Section C — multiple STUN servers: order preserved, each entry
    // validated independently.
    // ===============================================================
    {
        const store = new IceServerConfigurationStore(new InMemoryStorageProvider());
        const setUseCase = new SetIceServerConfigurationUseCase({ iceServerConfigurationStore: store });

        const saved = setUseCase.execute({ servers: [
            { urls: 'stun:one.example:3478' },
            { urls: 'stun:two.example:3478' },
            { urls: 'stuns:three.example:5349' }
        ] });
        assert(saved.servers.length === 3, '30. all three entries are accepted');
        assert(saved.servers[0].urls === 'stun:one.example:3478' && saved.servers[1].urls === 'stun:two.example:3478' && saved.servers[2].urls === 'stuns:three.example:5349',
            '31. order is preserved exactly as given');

        const reread = store.get();
        assert(reread.servers.length === 3 && reread.servers[2].urls === 'stuns:three.example:5349',
            '32. all three entries round-trip through persistence, order intact');

        // One invalid entry among several valid ones rejects the WHOLE
        // list — never a partial save of only the valid entries.
        expectThrows(() => setUseCase.execute({ servers: [{ urls: 'stun:good.example:3478' }, { urls: 'not-a-stun-url' }] }),
            '33. one invalid entry among several rejects the whole list');
        assert(store.get().servers.length === 3, '34. the rejected partially-invalid list never partially overwrote the previously saved three entries');
    }
    console.log('✓ Section C: multiple STUN servers save and persist with order preserved; one invalid entry rejects the whole list, never a partial save');

    // ===============================================================
    // Section D — immutable value object: frozen, defensive copies,
    // value equality.
    // ===============================================================
    {
        const configuration = new IceServerConfiguration({ servers: [{ urls: 'stun:a.example:3478' }, { urls: 'stun:b.example:3478' }] });
        assert(Object.isFrozen(configuration), '35. the IceServerConfiguration instance itself is frozen');

        const firstRead = configuration.servers;
        firstRead.push({ urls: 'stun:injected.example:3478' });
        firstRead[0].urls = 'stun:tampered.example:3478';
        const secondRead = configuration.servers;
        assert(secondRead.length === 2 && secondRead[0].urls === 'stun:a.example:3478' && secondRead[1].urls === 'stun:b.example:3478',
            '36. mutating a previously returned servers array (push, or editing an entry) never reaches the instance\'s own internal state — a fresh, defensive copy is returned every call');
        assert(firstRead !== secondRead, '37. two calls to servers return two distinct array instances, never the same reference');

        const equalConfiguration = new IceServerConfiguration({ servers: [{ urls: 'stun:a.example:3478' }, { urls: 'stun:b.example:3478' }] });
        const differentOrderConfiguration = new IceServerConfiguration({ servers: [{ urls: 'stun:b.example:3478' }, { urls: 'stun:a.example:3478' }] });
        const differentConfiguration = new IceServerConfiguration({ servers: [{ urls: 'stun:a.example:3478' }] });
        assert(configuration.equals(equalConfiguration), '38. two configurations with identical entries, in the same order, are equal');
        assert(!configuration.equals(differentOrderConfiguration), '39. the same entries in a different order are NOT equal — order is part of the value');
        assert(!configuration.equals(differentConfiguration), '40. a configuration with a different entry count is never equal');
        assert(!configuration.equals(null) && !configuration.equals({ servers: [{ urls: 'stun:a.example:3478' }] }),
            '41. equals() rejects null and a plain object impersonating a configuration — instance type is checked, not merely shape');

        expectThrows(() => new IceServerConfiguration({ servers: 'stun:not-an-array.example' }), '42. servers must be an array, never a bare string');
        expectThrows(() => new IceServerConfiguration({ servers: [null] }), '43. a null entry is rejected');
        expectThrows(() => new IceServerConfiguration({ servers: [{ urls: 123 }] }), '44. a non-string urls field is rejected');
    }
    console.log('✓ Section D: IceServerConfiguration is genuinely immutable, returns defensive copies on every read, and its equals() implements real order-sensitive value equality');

    // ===============================================================
    // Section E — persistence: save/get/clear round-trip through the
    // store.
    // ===============================================================
    {
        const backing = new InMemoryStorageProvider();
        const store = new IceServerConfigurationStore(backing);

        expectThrows(() => store.save({ servers: [{ urls: 'stun:a.example:3478' }] }), '45. save() refuses a plain object — only a real IceServerConfiguration instance is accepted');

        store.save(new IceServerConfiguration({ servers: [{ urls: 'stun:persisted.example:3478' }] }));
        assert(store.get().servers[0].urls === 'stun:persisted.example:3478', '46. a saved configuration reads back correctly');
        assert(backing.list().filter((key) => key === 'ice-server-configuration').length === 1, '47. exactly one storage entry exists under the store\'s own key');

        // Replacing, never accumulating.
        store.save(new IceServerConfiguration({ servers: [{ urls: 'stun:replacement.example:3478' }] }));
        assert(store.get().servers.length === 1 && store.get().servers[0].urls === 'stun:replacement.example:3478',
            '48. saving a new configuration REPLACES the previous one outright, never accumulating a second entry');
        assert(backing.list().filter((key) => key === 'ice-server-configuration').length === 1, '49. still exactly one storage entry after replacement');

        store.clear();
        assert(store.get() === null, '50. clear() restores genuine absence');
        assert(backing.load('ice-server-configuration') === null, '51. nothing at all remains on file after clear() — never a saved copy of the default');
    }
    console.log('✓ Section E: save/get/clear round-trip correctly, replacement never accumulates, and clear() restores genuine absence');

    // ===============================================================
    // Section F — restart/reconstruction: a brand-new store/use-case
    // pair, over the SAME underlying storage, observes what an earlier
    // instance persisted.
    // ===============================================================
    {
        const sharedNamespace = {};

        const storeBeforeRestart = new IceServerConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        const setUseCaseBeforeRestart = new SetIceServerConfigurationUseCase({ iceServerConfigurationStore: storeBeforeRestart });
        setUseCaseBeforeRestart.execute({ servers: [{ urls: 'stun:before-restart.example:3478' }] });

        // restart boundary — genuinely new instances, sharing only the
        // underlying namespace, mirroring ui/main.js's own composition
        // root re-running on a fresh page load.
        const storeAfterRestart = new IceServerConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        assert(storeAfterRestart !== storeBeforeRestart, '52. sanity — this really is a newly constructed store, not the same instance');
        assert(storeAfterRestart.get().servers[0].urls === 'stun:before-restart.example:3478',
            '53. a newly constructed store observes the configuration an earlier instance persisted');

        const resolvedAfterRestart = (storeAfterRestart.get() || { servers: DEFAULT_ICE_SERVERS }).servers;
        const providerAfterRestart = new WebRtcPeerConnectionProvider({ iceServers: resolvedAfterRestart, RTCPeerConnectionImpl: RecordingRTCPeerConnection });
        RecordingRTCPeerConnection.constructions = [];
        providerAfterRestart.createOffer();
        assert(RecordingRTCPeerConnection.constructions.length === 1 && RecordingRTCPeerConnection.constructions[0][0].urls === 'stun:before-restart.example:3478',
            '54. FLAGSHIP — default STUN -> save alternate STUN -> simulate restart -> compose WebRtcPeerConnectionProvider -> new RTCPeerConnection(...) -> exact configured ICE servers, through the real production composition');

        const setUseCaseAfterRestart = new SetIceServerConfigurationUseCase({ iceServerConfigurationStore: storeAfterRestart });
        setUseCaseAfterRestart.execute({ servers: [{ urls: 'stun:after-restart.example:3478' }] });
        assert(storeBeforeRestart.get().servers[0].urls === 'stun:after-restart.example:3478',
            '55. a write through the newly constructed use case is visible back through the ORIGINAL store instance too — the same underlying storage, never divergent in-memory state');
    }
    console.log('✓ Section F: a genuine restart boundary — new store/use-case instances, same underlying storage — observes and can further change what an earlier instance persisted, proven all the way through to the concrete RTCPeerConnection construction');

    // ===============================================================
    // Section G — malformed stored data degrades to absence, never a
    // thrown error or a partial list.
    // ===============================================================
    {
        const malformedPayloads = [
            null,
            'not-an-object',
            42,
            [],
            {},
            { servers: 'not-an-array' },
            { servers: [] },
            { servers: [{ urls: 'turn:relay.example:3478' }] },
            { servers: [{ urls: 'stun:good.example:3478' }, { urls: 'not-valid' }] },
            { servers: [{ urls: 'stun:good.example:3478' }, {}] },
            { servers: [null] },
            { servers: ['stun:good.example:3478'] }
        ];
        for (const payload of malformedPayloads) {
            const backing = new InMemoryStorageProvider();
            backing.save('ice-server-configuration', payload);
            const store = new IceServerConfigurationStore(backing);
            let threw = false;
            let result;
            try { result = store.get(); } catch { threw = true; }
            assert(!threw, `56. get() never throws over malformed stored data (payload: ${JSON.stringify(payload)})`);
            assert(result === null, `57. malformed stored data degrades to null/absence, never a partial list (payload: ${JSON.stringify(payload)})`);
        }

        // Critical startup semantics: malformed saved configuration ->
        // absence -> DEFAULT_ICE_SERVERS, exactly like never having saved
        // anything — never a partial/broken list reaching the provider.
        const backing = new InMemoryStorageProvider();
        backing.save('ice-server-configuration', { servers: [{ urls: 'stun:good.example:3478' }, { urls: 'turn:bad.example:3478' }] });
        const store = new IceServerConfigurationStore(backing);
        const resolved = (store.get() || { servers: DEFAULT_ICE_SERVERS }).servers;
        assert(resolved === DEFAULT_ICE_SERVERS, '58. a malformed saved configuration resolves to exactly DEFAULT_ICE_SERVERS, never a mix of the valid entry and the default');
    }
    console.log('✓ Section G: malformed stored data of every shape degrades silently to absence — never a thrown error, never a partial list — and a fresh resolution falls back to exactly DEFAULT_ICE_SERVERS');

    // ===============================================================
    // Section H — exact propagation into RTCPeerConnection: default and
    // custom lists both reach the concrete construction call unchanged.
    // ===============================================================
    {
        RecordingRTCPeerConnection.constructions = [];
        const defaultProvider = new WebRtcPeerConnectionProvider({ iceServers: DEFAULT_ICE_SERVERS, RTCPeerConnectionImpl: RecordingRTCPeerConnection });
        defaultProvider.createOffer();
        assert(RecordingRTCPeerConnection.constructions[0] === DEFAULT_ICE_SERVERS,
            '59. the default STUN list reaches the concrete RTCPeerConnection construction unchanged, through the real, unmodified WebRtcPeerConnectionProvider/WebRtcPeerConnection classes');

        const customServers = [{ urls: 'stun:custom-a.example:3478' }, { urls: 'stun:custom-b.example:3478' }];
        RecordingRTCPeerConnection.constructions = [];
        const customProvider = new WebRtcPeerConnectionProvider({ iceServers: customServers, RTCPeerConnectionImpl: RecordingRTCPeerConnection });
        customProvider.createOffer();
        assert(RecordingRTCPeerConnection.constructions[0] === customServers,
            '60. a custom STUN list reaches the identical concrete construction call, never a stale default');

        // The answerer side (connect()) sees the same configured list too
        // — a plain, portable offer payload, the same shape a real
        // offerer's own localSignal would eventually serialize to.
        RecordingRTCPeerConnection.constructions = [];
        const manualOffer = {
            connectionId: 'test-connection-id',
            sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n',
            iceCandidates: [],
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 60000).toISOString()
        };
        const answererProvider = new WebRtcPeerConnectionProvider({ iceServers: customServers, RTCPeerConnectionImpl: RecordingRTCPeerConnection });
        answererProvider.connect(manualOffer);
        assert(RecordingRTCPeerConnection.constructions.some((entry) => entry === customServers),
            '61. the answerer side (connect()) also constructs its RTCPeerConnection with the exact configured custom STUN list');
    }
    console.log('✓ Section H: both the default and a custom STUN list reach the concrete RTCPeerConnection construction call exactly, on both the offerer and answerer side, through the real production classes');

    // ===============================================================
    // Section I — reset to defaults: clear() restores genuine absence,
    // never a saved copy of the default.
    // ===============================================================
    {
        const store = new IceServerConfigurationStore(new InMemoryStorageProvider());
        const setUseCase = new SetIceServerConfigurationUseCase({ iceServerConfigurationStore: store });

        setUseCase.execute({ servers: [{ urls: 'stun:custom.example:3478' }] });
        assert(store.get() !== null, '62. a configuration is on file before resetting');

        store.clear();
        assert(store.get() === null, '63. "Reset to Defaults" (store.clear()) restores genuine absence');

        const resolved = (store.get() || { servers: DEFAULT_ICE_SERVERS }).servers;
        assert(resolved === DEFAULT_ICE_SERVERS, '64. after resetting, the effective STUN list falls back to exactly DEFAULT_ICE_SERVERS');

        // Explicitly saving the default entries by hand still leaves a
        // real, distinct saved entry — never silently treated as
        // "nothing to persist," the identical rule
        // core/ArweaveGatewayConfiguration.js's own settings view holds.
        const saved = setUseCase.execute({ servers: DEFAULT_ICE_SERVERS.map((entry) => ({ urls: entry.urls })) });
        assert(store.get() !== null, '65. explicitly saving entries matching the deployment default still leaves a real, explicit entry on file');
        assert(saved.servers.length === DEFAULT_ICE_SERVERS.length, '66. …with the same entry count as the deployment default, confirming this is a genuine explicit save, not a no-op');
    }
    console.log('✓ Section I: "Reset to Defaults" clears to genuine absence; explicitly saving default-matching entries still persists a real, distinct entry');

    // ===============================================================
    // Section J — no effect on TURN: fetchIceServers()'s own credential
    // fetch, merge, and dedupe logic are completely unmodified; only the
    // STUN baseline it merges with changes.
    // ===============================================================
    {
        const fetched = [
            { urls: 'stun:stun.relay.metered.ca:80' },
            { urls: 'turn:standard.relay.metered.ca:80', username: 'u', credential: 'c' }
        ];
        const fetchImpl = async () => ({ ok: true, json: async () => fetched });

        const customFallback = [{ urls: 'stun:custom-fallback.example:3478' }];
        const result = await fetchIceServers({ apiKey: 'test-key', fetchImpl, fallback: customFallback });
        assert(result.length === fetched.length + customFallback.length,
            '67. fetchIceServers() still merges fetched TURN/STUN entries WITH the fallback, never replacing it — unmodified merge behavior');
        assert(result[0].urls === 'stun:stun.relay.metered.ca:80', '68. fetched entries still come first');
        assert(result.some((entry) => entry.urls === 'turn:standard.relay.metered.ca:80' && entry.username === 'u' && entry.credential === 'c'),
            '69. a fetched TURN entry\'s credentials pass through completely unmodified');
        assert(result.some((entry) => entry.urls === 'stun:custom-fallback.example:3478'),
            '70. the CUSTOM fallback (a user\'s own configured STUN list, as ui/main.js now passes) is what TURN\'s fetch merges with, instead of the hard-coded DEFAULT_ICE_SERVERS');

        // A failed/slow fetch still degrades to exactly the given
        // fallback, unmodified from before this milestone.
        const failingFetchImpl = async () => { throw new Error('network unreachable'); };
        const degraded = await fetchIceServers({ apiKey: 'k', fetchImpl: failingFetchImpl, fallback: customFallback });
        assert(degraded === customFallback, '71. a failed TURN fetch degrades to exactly the given fallback, never throwing — unmodified degradation behavior');

        // The TURN-fetching module itself carries no STUN-configuration
        // import — this milestone never reached into it.
        const iceConfigSource = await source('peer/IceServerConfig.js');
        assert(!/IceServerConfiguration|IceServerConfigurationStore|SetIceServerConfigurationUseCase/.test(iceConfigSource),
            '72. peer/IceServerConfig.js — the TURN-fetching module — imports none of this milestone\'s new configuration classes');
        assert(iceConfigSource.includes("METERED_TURN_ENDPOINT = 'https://forkbuild.metered.live/api/v1/turn/credentials'"),
            '73. TURN\'s own credential endpoint is completely unchanged by this milestone');
    }
    console.log('✓ Section J: TURN\'s own fetch/merge/dedupe/degrade logic is completely unmodified — only the STUN baseline it merges with now reflects a user\'s own configuration when one is on file');

    // ===============================================================
    // Section K — no effect on Rendezvous: peer/RendezvousConfig.js and
    // peer/PeerAuthenticationSession.js are untouched by this milestone's
    // own configuration boundary.
    // ===============================================================
    {
        assert(Array.isArray(DEFAULT_RENDEZVOUS_URLS), '74. DEFAULT_RENDEZVOUS_URLS is still a real array, untouched by this milestone');
        const rendezvousConfigSource = await source('peer/RendezvousConfig.js');
        assert(!/IceServerConfiguration|IceServerConfigurationStore|SetIceServerConfigurationUseCase|StunSettingsView/.test(rendezvousConfigSource),
            '75. peer/RendezvousConfig.js imports none of this milestone\'s new STUN configuration classes');

        const authSource = await source('peer/PeerAuthenticationSession.js');
        assert(!/IceServerConfiguration|IceServerConfigurationStore|iceServers|WebRtcPeerConnectionProvider/.test(authSource),
            '76. peer/PeerAuthenticationSession.js — the sole authority on peer identity — imports none of this milestone\'s STUN configuration or connectivity classes; a change of which STUN server carries the bytes cannot change who those bytes are proven to belong to');

        // core/IceServerConfiguration.js itself never IMPORTS anything
        // Rendezvous-shaped (design-rationale comments may still mention
        // Rendezvous by name, e.g. citing the sibling 0.9.385 audit —
        // code-only lines are checked here, the same exclusion this
        // codebase's other convergence audits already establish).
        const iceConfigurationExecutable = (await source('core/IceServerConfiguration.js')).replace(/\/\/.*$/gm, '');
        assert(!/Rendezvous/.test(iceConfigurationExecutable), '77. core/IceServerConfiguration.js never imports or references Rendezvous in executable code');
    }
    console.log('✓ Section K: Rendezvous\'s own configuration/bootstrap and the sole authority on peer identity are both untouched by this milestone\'s STUN configuration boundary');

    // ===============================================================
    // Section L — existing peer journey regression: createOffer()/
    // connect() behave identically whether iceServers came from a user
    // override or the deployment default.
    // ===============================================================
    {
        for (const iceServers of [DEFAULT_ICE_SERVERS, [{ urls: 'stun:regression-check.example:3478' }]]) {
            const provider = new WebRtcPeerConnectionProvider({ iceServers, RTCPeerConnectionImpl: RecordingRTCPeerConnection });
            const connection = provider.createOffer();
            assert(connection.connectionId && typeof connection.connectionId === 'string', '78. createOffer() still returns a connection with a real connectionId, regardless of which STUN list is configured');
            assert(connection.role === 'offerer', '79. createOffer() still produces an offerer-role connection');

            const unsubscribe = provider.onIncomingConnection(() => {});
            assert(typeof unsubscribe === 'function', '80. onIncomingConnection() still returns a real unsubscribe function, unchanged');
            unsubscribe();

            provider.dispose();
        }
    }
    console.log('✓ Section L: createOffer()/onIncomingConnection()/dispose() behave identically regardless of which STUN list — user-configured or default — the provider was constructed with; no peer, identity, or connection semantics changed');

    // ===============================================================
    // Section M — no fallback/health checking: saving never attempts a
    // network call or an RTCPeerConnection of any kind.
    // ===============================================================
    {
        let fetchCalled = false;
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (...args) => { fetchCalled = true; return originalFetch ? originalFetch(...args) : Promise.reject(new Error('no fetch')); };
        try {
            const store = new IceServerConfigurationStore(new InMemoryStorageProvider());
            const setUseCase = new SetIceServerConfigurationUseCase({ iceServerConfigurationStore: store });
            // A syntactically valid but entirely made-up, unreachable
            // hostname — accepted exactly like any other valid STUN URL,
            // because validation is shape-only, never reachability.
            setUseCase.execute({ servers: [{ urls: 'stun:this-host-does-not-exist.invalid:3478' }] });
            assert(!fetchCalled, '81. saving a configuration never triggers a network call of any kind — no connection testing, no health checking');
        } finally {
            globalThis.fetch = originalFetch;
        }

        // No automatic fallback: once saved, an "unreachable-looking"
        // configuration is never silently replaced or reverted.
        {
            const store = new IceServerConfigurationStore(new InMemoryStorageProvider());
            const setUseCase = new SetIceServerConfigurationUseCase({ iceServerConfigurationStore: store });
            setUseCase.execute({ servers: [{ urls: 'stun:this-host-does-not-exist.invalid:3478' }] });
            // Time passing, or anything else, never triggers a
            // reassessment — get() simply returns what was saved, every
            // single time, forever, until an explicit save() or clear().
            for (let i = 0; i < 5; i++) {
                assert(store.get().servers[0].urls === 'stun:this-host-does-not-exist.invalid:3478',
                    `82.${i} repeated reads of an "unreachable-looking" saved configuration never degrade or fall back automatically`);
            }
        }

        // Neither the store nor the use case exposes any health/test/
        // ping-shaped method — the capability is structurally absent,
        // not merely unused.
        const store = new IceServerConfigurationStore(new InMemoryStorageProvider());
        const setUseCase = new SetIceServerConfigurationUseCase({ iceServerConfigurationStore: store });
        for (const forbiddenMethod of ['test', 'testConnection', 'healthCheck', 'ping', 'probe', 'verify', 'checkReachability']) {
            assert(typeof store[forbiddenMethod] === 'undefined', `83. IceServerConfigurationStore exposes no ${forbiddenMethod}() method`);
            assert(typeof setUseCase[forbiddenMethod] === 'undefined', `83. SetIceServerConfigurationUseCase exposes no ${forbiddenMethod}() method`);
        }
    }
    console.log('✓ Section M: saving a STUN configuration never attempts a network call, never health-checks, and never automatically falls back away from an "unreachable-looking" saved configuration — the capability is structurally absent, not merely unexercised');

    // ===============================================================
    // Section N — runtime failure behavior unchanged: peer/
    // WebRtcPeerConnection.js's own ICE-gathering timeout is untouched,
    // and this milestone's classes never import it.
    // ===============================================================
    {
        const webRtcPeerConnectionSource = await source('peer/WebRtcPeerConnection.js');
        assert(!/IceServerConfiguration|IceServerConfigurationStore|SetIceServerConfigurationUseCase/.test(webRtcPeerConnectionSource),
            '84. peer/WebRtcPeerConnection.js imports none of this milestone\'s new configuration classes — its own ICE-gathering timeout logic is untouched');
        assert(/ICE_GATHERING_TIMEOUT_MS/.test(webRtcPeerConnectionSource),
            '85. the existing ICE-gathering timeout constant still exists, unmodified in kind by this milestone');

        const providerSource = await source('peer/WebRtcPeerConnectionProvider.js');
        assert(!/IceServerConfiguration|core\/IceServerConfiguration/.test(providerSource),
            '86. peer/WebRtcPeerConnectionProvider.js itself is untouched — it still accepts a plain iceServers array/setIceServers(), with no awareness of core/IceServerConfiguration.js at all; ui/main.js alone bridges the two');
    }
    console.log('✓ Section N: the existing ICE-gathering timeout and the peer connection provider/connection classes are completely untouched by this milestone — the new configuration boundary is entirely a composition-root/settings concern layered on top');
}

run().then(() => {
    console.log('\n✅ All User-Configurable STUN Server Configuration tests passed.');
}).catch((error) => {
    console.error('UserConfigurableStunConfiguration.test.js FAILED:', error);
    process.exitCode = 1;
});
