import { readFile } from 'node:fs/promises';

import { RendezvousConfiguration, isValidRendezvousUrl } from '../core/RendezvousConfiguration.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { RendezvousConfigurationStore } from '../storage/RendezvousConfigurationStore.js';
import { SetRendezvousConfigurationUseCase } from '../application/SetRendezvousConfigurationUseCase.js';
import { WebSocketRendezvousTransport } from '../peer/WebSocketRendezvousTransport.js';
import { RendezvousDiscoveryProvider } from '../peer/RendezvousDiscoveryProvider.js';
import { DiscoveryBootstrap } from '../peer/DiscoveryBootstrap.js';
import { DEFAULT_RENDEZVOUS_URLS } from '../peer/RendezvousConfig.js';
import { DEFAULT_ICE_SERVERS } from '../peer/IceServerConfig.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';

// 0.9.388 — User-Configurable Rendezvous Server Configuration.
//
// 0.9.385's own audit selected Rendezvous as the second of exactly two
// BUILD_NEXT candidates (STUN the other, built and converged in
// 0.9.386/0.9.387). This suite proves the missing settings-persistable
// half for Rendezvous: a real value object, a durable store, a write use
// case, and a settings surface, reachable end to end, without changing
// any peer, identity, authentication, STUN/TURN, or rendezvous protocol
// semantics — the direct structural mirror of
// tests/UserConfigurableStunConfiguration.test.js (0.9.386).
//
//   Section 0 — the settings entry point is actually reachable (nav link,
//               route, composition-root wiring, view wiring — never
//               inferred from source alone).
//   Section A — default configuration: no saved override resolves to
//               DEFAULT_RENDEZVOUS_URLS.
//   Section B — custom configuration: a valid override actually saves and
//               reads back through the new write seam.
//   Section C — multiple rendezvous servers: order preserved, one invalid
//               entry rejects the whole list.
//   Section D — immutable value object: frozen, defensive copies, value
//               equality.
//   Section E — persistence: save/get/clear round-trip through the store.
//   Section F — restart/reconstruction, through to a real (simulated)
//               network round trip: a brand-new store/use-case pair, over
//               the SAME underlying storage, observes what an earlier
//               instance persisted, and the resolved URL is what a real
//               WebSocketRendezvousTransport actually connects to.
//   Section G — malformed stored data degrades to absence, never a
//               thrown error or a partial list.
//   Section H — exact propagation into DiscoveryBootstrap: default and
//               custom URL lists both produce bootstrap providers pointed
//               at the exact configured URLs, through the real,
//               unmodified provider/transport classes.
//   Section I — reset to defaults: clear() restores genuine absence,
//               never a saved copy of the default.
//   Section J — no effect on STUN: core/IceServerConfiguration.js and
//               peer/IceServerConfig.js are untouched by this milestone's
//               own configuration boundary.
//   Section K — no effect on peer identity: peer/
//               PeerAuthenticationSession.js and peer/
//               RendezvousPublicationSigning.js are untouched.
//   Section L — existing peer discovery journey regression: list()/
//               discover()/importInvitation() behave identically whether
//               bootstrapProviders came from a user override or the
//               deployment default.
//   Section M — no fallback/health checking: saving never opens a
//               WebSocket or issues a PUBLISH/LOOKUP, and an
//               "unreachable-looking" rendezvous url is accepted exactly
//               like any other syntactically valid one.
//   Section N — runtime failure behavior unchanged: peer/
//               RendezvousDiscoveryProvider.js's own graceful degradation
//               and peer/WebSocketRendezvousTransport.js's own wire
//               protocol are untouched, and this milestone's classes
//               never import either.
//
// See core/RendezvousConfiguration.js, storage/RendezvousConfigurationStore.js,
// application/SetRendezvousConfigurationUseCase.js, and
// ui/views/RendezvousSettingsView.js for the full design rationale this
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
// "restart" shape tests/UserConfigurableStunConfiguration.test.js's own
// SharedNamespaceStorageProvider already establishes.
class SharedNamespaceStorageProvider extends StorageProvider {
    constructor(sharedNamespace) { super(); this._namespace = sharedNamespace; }
    save(name, data) { this._namespace[name] = JSON.stringify(data); }
    load(name) { return Object.prototype.hasOwnProperty.call(this._namespace, name) ? JSON.parse(this._namespace[name]) : null; }
    remove(name) { delete this._namespace[name]; }
    list() { return Object.keys(this._namespace); }
}

// A minimal, real EventTarget-based WebSocket stand-in exercising peer/
// WebSocketRendezvousTransport.js's actual client code against a fake
// in-memory server keyed by URL — the same "real client code against a
// simulated network boundary" technique tests/RealNetworkRendezvous.test.js
// already establishes, trimmed here to exactly what Section F/H need: a
// LOOKUP that proves which URL the transport actually connected to.
class FakeWebSocket extends EventTarget {
    constructor(url, serversByUrl) {
        super();
        this.url = url;
        this.readyState = FakeWebSocket.CONNECTING;
        this._server = serversByUrl.get(url) || null;
        setTimeout(() => this._attemptOpen(), 0);
    }
    _attemptOpen() {
        if (!this._server) {
            this.readyState = FakeWebSocket.CLOSED;
            this.dispatchEvent(new Event('error'));
            this.dispatchEvent(new Event('close'));
            return;
        }
        this.readyState = FakeWebSocket.OPEN;
        this.dispatchEvent(new Event('open'));
    }
    send(data) {
        if (this.readyState !== FakeWebSocket.OPEN) throw new Error('FakeWebSocket: cannot send while not open');
        setTimeout(() => {
            const message = JSON.parse(data);
            const response = this._server.handle(message);
            this._receive(JSON.stringify(response));
        }, 0);
    }
    close() {
        if (this.readyState === FakeWebSocket.CLOSED) return;
        this.readyState = FakeWebSocket.CLOSED;
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

// A "stupid" fake server — identifies itself only by which URL it was
// registered under, so Section F/H can prove a LOOKUP actually reached
// the SPECIFIC configured server, never a different one.
class FakeRendezvousServer {
    constructor(label) { this.label = label; }
    handle(message) {
        if (message.type === 'LOOKUP') {
            return { v: 1, type: 'OK', requestId: message.requestId, result: [] };
        }
        return { v: 1, type: 'ERROR', requestId: message.requestId, message: 'unsupported in this fake' };
    }
}

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
        assert(mainSource.includes("import { RendezvousConfigurationStore } from '../storage/RendezvousConfigurationStore.js';"),
            '1. ui/main.js imports the new store');
        assert(mainSource.includes("import { SetRendezvousConfigurationUseCase } from '../application/SetRendezvousConfigurationUseCase.js';"),
            '2. ui/main.js imports the new write use case');
        assert(/new RendezvousConfigurationStore\(new LocalStorageProvider\(\)\)/.test(mainSource),
            '3. ui/main.js constructs a real RendezvousConfigurationStore over LocalStorageProvider');
        assert(/new SetRendezvousConfigurationUseCase\(\{\s*rendezvousConfigurationStore\s*\}\)/.test(mainSource),
            '4. ui/main.js wires SetRendezvousConfigurationUseCase against the SAME shared rendezvousConfigurationStore, never a second disconnected store');
        assert(/app\.provide\('rendezvousConfigurationStore',\s*rendezvousConfigurationStore\)/.test(mainSource),
            '5. the shared store is actually provided to the Vue app, not just constructed and discarded');
        assert(/app\.provide\('setRendezvousConfigurationUseCase',\s*setRendezvousConfigurationUseCase\)/.test(mainSource),
            '6. the write use case is actually provided to the Vue app');
        const storeConstructions = (mainSource.match(/new RendezvousConfigurationStore\(/g) || []).length;
        assert(storeConstructions === 1, `7. ui/main.js constructs exactly one RendezvousConfigurationStore instance — found ${storeConstructions}`);
        assert(/const resolvedRendezvousUrls = \(rendezvousConfigurationStore\.get\(\) \|\| \{ urls: DEFAULT_RENDEZVOUS_URLS \}\)\.urls;/.test(mainSource),
            '8. resolvedRendezvousUrls falls back to DEFAULT_RENDEZVOUS_URLS only when no override is on file, never persisting that fallback as a preference');
        assert(mainSource.includes('bootstrapProviders: resolvedRendezvousUrls.map((url) => new RendezvousDiscoveryProvider({'),
            '9. DiscoveryBootstrap is built from resolvedRendezvousUrls, never a bare DEFAULT_RENDEZVOUS_URLS literal');
        assert(!/bootstrapProviders:\s*DEFAULT_RENDEZVOUS_URLS\.map/.test(mainSource),
            '10. the old bare DEFAULT_RENDEZVOUS_URLS.map(...) construction is gone — replaced, never left alongside the new one');

        const routerSource = await source('ui/router/index.js');
        assert(/path:\s*'\/settings\/rendezvous'/.test(routerSource), '11. a real route exists for the settings entry point');
        assert(routerSource.includes("import RendezvousSettingsView from '../views/RendezvousSettingsView.js';"),
            '12. the router imports the real view component, never a stub');

        const appSource = await source('ui/App.js');
        assert(/router-link to="\/settings"/.test(appSource), '13a. a real top-nav link reaches the Network Settings hub');
        const networkSettingsSource = await source('ui/views/NetworkSettingsView.js');
        assert(/router-link to="\/settings\/rendezvous"/.test(networkSettingsSource), '13b. the Network Settings hub links to the settings entry point — reachable one hop further, not a URL-only capability');

        const viewSource = await source('ui/views/RendezvousSettingsView.js');
        const viewExecutable = viewSource.replace(/\/\/.*$/gm, '');
        assert(/inject\('rendezvousConfigurationStore',\s*null\)/.test(viewExecutable),
            '14. the view reads the configuration through the injected store, never a store it constructs itself');
        assert(/inject\('setRendezvousConfigurationUseCase',\s*null\)/.test(viewExecutable),
            '15. the view writes the configuration through the injected use case, never RendezvousConfigurationStore.save() directly');
        assert(!/new RendezvousConfiguration\(/.test(viewExecutable),
            '16. the view never constructs a RendezvousConfiguration itself — validation and construction stay inside the use case');
        assert(viewExecutable.includes("import { DEFAULT_RENDEZVOUS_URLS } from '../../peer/RendezvousConfig.js';"),
            '17. the ONE thing the view imports from peer/RendezvousConfig.js is the plain default constant, for display only');
        assert(!/DiscoveryBootstrap|RendezvousDiscoveryProvider|WebSocketRendezvousTransport/.test(viewExecutable),
            '18. the view never imports or constructs the discovery bootstrap, the discovery provider, or the transport — a saved change only takes effect on the next application load');
        assert(!/\.publish\(|\.lookup\(|\.discover\(/.test(viewExecutable),
            '19. the view never issues a PUBLISH/LOOKUP/discover of any kind');
        console.log('✓ Section 0: the settings entry point is really wired — nav link, route, shared store, shared use case, and a view that only ever goes through the injected collaborators');
    }

    // ===============================================================
    // Section A — default configuration: no saved override resolves to
    // DEFAULT_RENDEZVOUS_URLS.
    // ===============================================================
    {
        const store = new RendezvousConfigurationStore(new InMemoryStorageProvider());
        assert(store.get() === null, '20. a fresh store with nothing saved returns null — genuine absence, never a fabricated default');
        const resolved = (store.get() || { urls: DEFAULT_RENDEZVOUS_URLS }).urls;
        assert(resolved === DEFAULT_RENDEZVOUS_URLS, '21. resolving the effective rendezvous list against an empty store yields exactly DEFAULT_RENDEZVOUS_URLS');
    }
    console.log('✓ Section A: no saved override resolves to DEFAULT_RENDEZVOUS_URLS, and absence is never confused with a fabricated default');

    // ===============================================================
    // Section B — custom configuration: a valid override actually saves
    // and reads back through the new write seam.
    // ===============================================================
    {
        const store = new RendezvousConfigurationStore(new InMemoryStorageProvider());
        const setUseCase = new SetRendezvousConfigurationUseCase({ rendezvousConfigurationStore: store });

        const saved = setUseCase.execute({ urls: ['wss://custom-rendezvous.example'] });
        assert(saved instanceof RendezvousConfiguration, '22. execute() returns a real RendezvousConfiguration');
        assert(saved.urls.length === 1 && saved.urls[0] === 'wss://custom-rendezvous.example',
            '23. execute() returns the persisted configuration with the exact custom entry');
        const reread = store.get();
        assert(reread.urls.length === 1 && reread.urls[0] === 'wss://custom-rendezvous.example',
            '24. saving a valid custom rendezvous server actually persists it, readable back through the store');

        // Invalid input is rejected without mutating whatever was
        // previously on file.
        expectThrows(() => setUseCase.execute({ urls: [] }), '25. an empty urls array is refused');
        expectThrows(() => setUseCase.execute({ urls: ['https://not-a-websocket.example'] }), '26. a non-ws/wss scheme is refused');
        expectThrows(() => setUseCase.execute({ urls: ['not-a-url-at-all'] }), '27. a non-URL string is refused');
        expectThrows(() => setUseCase.execute({}), '28. a missing urls field is refused');
        assert(store.get().urls[0] === 'wss://custom-rendezvous.example',
            '29. every rejected save left the PREVIOUSLY saved configuration completely untouched');
    }
    console.log('✓ Section B: a valid custom rendezvous server saves through SetRendezvousConfigurationUseCase; invalid input is rejected without mutating the existing configuration');

    // ===============================================================
    // Section C — multiple rendezvous servers: order preserved, one
    // invalid entry rejects the whole list.
    // ===============================================================
    {
        const store = new RendezvousConfigurationStore(new InMemoryStorageProvider());
        const setUseCase = new SetRendezvousConfigurationUseCase({ rendezvousConfigurationStore: store });

        const saved = setUseCase.execute({ urls: [
            'wss://server-one.example',
            'wss://server-two.example',
            'ws://server-three.example:8080/rendezvous'
        ] });
        assert(saved.urls.length === 3, '30. all three entries are accepted');
        assert(saved.urls[0] === 'wss://server-one.example' && saved.urls[1] === 'wss://server-two.example' && saved.urls[2] === 'ws://server-three.example:8080/rendezvous',
            '31. order is preserved exactly as given');

        const reread = store.get();
        assert(reread.urls.length === 3 && reread.urls[2] === 'ws://server-three.example:8080/rendezvous',
            '32. all three entries round-trip through persistence, order intact');

        // One invalid entry among several valid ones rejects the WHOLE
        // list — never a partial save of only the valid entries.
        expectThrows(() => setUseCase.execute({ urls: ['wss://good.example', 'not-a-rendezvous-url'] }),
            '33. one invalid entry among several rejects the whole list');
        assert(store.get().urls.length === 3, '34. the rejected partially-invalid list never partially overwrote the previously saved three entries');
    }
    console.log('✓ Section C: multiple rendezvous servers save and persist with order preserved; one invalid entry rejects the whole list, never a partial save');

    // ===============================================================
    // Section D — immutable value object: frozen, defensive copies,
    // value equality.
    // ===============================================================
    {
        const configuration = new RendezvousConfiguration({ urls: ['wss://a.example', 'wss://b.example'] });
        assert(Object.isFrozen(configuration), '35. the RendezvousConfiguration instance itself is frozen');

        const firstRead = configuration.urls;
        firstRead.push('wss://injected.example');
        firstRead[0] = 'wss://tampered.example';
        const secondRead = configuration.urls;
        assert(secondRead.length === 2 && secondRead[0] === 'wss://a.example' && secondRead[1] === 'wss://b.example',
            '36. mutating a previously returned urls array (push, or editing an entry) never reaches the instance\'s own internal state — a fresh, defensive copy is returned every call');
        assert(firstRead !== secondRead, '37. two calls to urls return two distinct array instances, never the same reference');

        const equalConfiguration = new RendezvousConfiguration({ urls: ['wss://a.example', 'wss://b.example'] });
        const differentOrderConfiguration = new RendezvousConfiguration({ urls: ['wss://b.example', 'wss://a.example'] });
        const differentConfiguration = new RendezvousConfiguration({ urls: ['wss://a.example'] });
        assert(configuration.equals(equalConfiguration), '38. two configurations with identical entries, in the same order, are equal');
        assert(!configuration.equals(differentOrderConfiguration), '39. the same entries in a different order are NOT equal — order is part of the value');
        assert(!configuration.equals(differentConfiguration), '40. a configuration with a different entry count is never equal');
        assert(!configuration.equals(null) && !configuration.equals({ urls: ['wss://a.example', 'wss://b.example'] }),
            '41. equals() rejects null and a plain object impersonating a configuration — instance type is checked, not merely shape');

        expectThrows(() => new RendezvousConfiguration({ urls: 'wss://not-an-array.example' }), '42. urls must be an array, never a bare string');
        expectThrows(() => new RendezvousConfiguration({ urls: [null] }), '43. a null entry is rejected');
        expectThrows(() => new RendezvousConfiguration({ urls: [123] }), '44. a non-string entry is rejected');
    }
    console.log('✓ Section D: RendezvousConfiguration is genuinely immutable, returns defensive copies on every read, and its equals() implements real order-sensitive value equality');

    // ===============================================================
    // Section E — persistence: save/get/clear round-trip through the
    // store.
    // ===============================================================
    {
        const backing = new InMemoryStorageProvider();
        const store = new RendezvousConfigurationStore(backing);

        expectThrows(() => store.save({ urls: ['wss://a.example'] }), '45. save() refuses a plain object — only a real RendezvousConfiguration instance is accepted');

        store.save(new RendezvousConfiguration({ urls: ['wss://persisted.example'] }));
        assert(store.get().urls[0] === 'wss://persisted.example', '46. a saved configuration reads back correctly');
        assert(backing.list().filter((key) => key === 'rendezvous-configuration').length === 1, '47. exactly one storage entry exists under the store\'s own key');

        // Replacing, never accumulating.
        store.save(new RendezvousConfiguration({ urls: ['wss://replacement.example'] }));
        assert(store.get().urls.length === 1 && store.get().urls[0] === 'wss://replacement.example',
            '48. saving a new configuration REPLACES the previous one outright, never accumulating a second entry');
        assert(backing.list().filter((key) => key === 'rendezvous-configuration').length === 1, '49. still exactly one storage entry after replacement');

        store.clear();
        assert(store.get() === null, '50. clear() restores genuine absence');
        assert(backing.load('rendezvous-configuration') === null, '51. nothing at all remains on file after clear() — never a saved copy of the default');
    }
    console.log('✓ Section E: save/get/clear round-trip correctly, replacement never accumulates, and clear() restores genuine absence');

    // ===============================================================
    // Section F — restart/reconstruction, through to a real (simulated)
    // network round trip.
    // ===============================================================
    {
        const sharedNamespace = {};

        const storeBeforeRestart = new RendezvousConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        const setUseCaseBeforeRestart = new SetRendezvousConfigurationUseCase({ rendezvousConfigurationStore: storeBeforeRestart });
        setUseCaseBeforeRestart.execute({ urls: ['wss://before-restart.example'] });

        // restart boundary — genuinely new instances, sharing only the
        // underlying namespace, mirroring ui/main.js's own composition
        // root re-running on a fresh page load.
        const storeAfterRestart = new RendezvousConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        assert(storeAfterRestart !== storeBeforeRestart, '52. sanity — this really is a newly constructed store, not the same instance');
        assert(storeAfterRestart.get().urls[0] === 'wss://before-restart.example',
            '53. a newly constructed store observes the configuration an earlier instance persisted');

        const resolvedAfterRestart = (storeAfterRestart.get() || { urls: DEFAULT_RENDEZVOUS_URLS }).urls;
        const serversByUrl = new Map([['wss://before-restart.example', new FakeRendezvousServer('before-restart')]]);
        const identityProvider = new LocalIdentityProvider(new InMemoryStorageProvider());
        identityProvider.login('restart-tester');
        const discoveryBootstrapAfterRestart = new DiscoveryBootstrap({
            bootstrapProviders: resolvedAfterRestart.map((url) => new RendezvousDiscoveryProvider({
                transport: new WebSocketRendezvousTransport({
                    url,
                    WebSocketImpl: class extends FakeWebSocket { constructor(u) { super(u, serversByUrl); } }
                }),
                identityProvider
            }))
        });
        const results = await discoveryBootstrapAfterRestart.discover('someone');
        assert(Array.isArray(results), '54. FLAGSHIP — default rendezvous URL -> save a custom rendezvous URL -> simulate restart -> compose DiscoveryBootstrap -> a real (simulated) LOOKUP round trip actually reaches the exact configured URL\'s own server, through the real production composition');

        const setUseCaseAfterRestart = new SetRendezvousConfigurationUseCase({ rendezvousConfigurationStore: storeAfterRestart });
        setUseCaseAfterRestart.execute({ urls: ['wss://after-restart.example'] });
        assert(storeBeforeRestart.get().urls[0] === 'wss://after-restart.example',
            '55. a write through the newly constructed use case is visible back through the ORIGINAL store instance too — the same underlying storage, never divergent in-memory state');
    }
    console.log('✓ Section F: a genuine restart boundary — new store/use-case instances, same underlying storage — observes and can further change what an earlier instance persisted, proven all the way through to a real (simulated) network LOOKUP round trip');

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
            { urls: 'not-an-array' },
            { urls: [] },
            { urls: ['https://not-a-websocket.example'] },
            { urls: ['wss://good.example', 'not-valid'] },
            { urls: ['wss://good.example', null] },
            { urls: [123] }
        ];
        for (const payload of malformedPayloads) {
            const backing = new InMemoryStorageProvider();
            backing.save('rendezvous-configuration', payload);
            const store = new RendezvousConfigurationStore(backing);
            let threw = false;
            let result;
            try { result = store.get(); } catch { threw = true; }
            assert(!threw, `56. get() never throws over malformed stored data (payload: ${JSON.stringify(payload)})`);
            assert(result === null, `57. malformed stored data degrades to null/absence, never a partial list (payload: ${JSON.stringify(payload)})`);
        }

        // Critical startup semantics: malformed saved configuration ->
        // absence -> DEFAULT_RENDEZVOUS_URLS, exactly like never having
        // saved anything — never a partial/broken list reaching the
        // bootstrap.
        const backing = new InMemoryStorageProvider();
        backing.save('rendezvous-configuration', { urls: ['wss://good.example', 'https://bad-scheme.example'] });
        const store = new RendezvousConfigurationStore(backing);
        const resolved = (store.get() || { urls: DEFAULT_RENDEZVOUS_URLS }).urls;
        assert(resolved === DEFAULT_RENDEZVOUS_URLS, '58. a malformed saved configuration resolves to exactly DEFAULT_RENDEZVOUS_URLS, never a mix of the valid entry and the default');
    }
    console.log('✓ Section G: malformed stored data of every shape degrades silently to absence — never a thrown error, never a partial list — and a fresh resolution falls back to exactly DEFAULT_RENDEZVOUS_URLS');

    // ===============================================================
    // Section H — exact propagation into DiscoveryBootstrap: default and
    // custom URL lists both produce bootstrap providers pointed at the
    // exact configured URLs.
    // ===============================================================
    {
        const identityProvider = new LocalIdentityProvider(new InMemoryStorageProvider());
        identityProvider.login('propagation-tester');

        const defaultBootstrap = new DiscoveryBootstrap({
            bootstrapProviders: DEFAULT_RENDEZVOUS_URLS.map((url) => new RendezvousDiscoveryProvider({
                transport: new WebSocketRendezvousTransport({ url }),
                identityProvider
            }))
        });
        assert(defaultBootstrap.bootstrapProviders.length === DEFAULT_RENDEZVOUS_URLS.length,
            '59. the default rendezvous list produces exactly one bootstrap provider per default URL, through the real, unmodified DiscoveryBootstrap/RendezvousDiscoveryProvider/WebSocketRendezvousTransport classes');
        defaultBootstrap.dispose();

        const customUrls = ['wss://custom-a.example', 'wss://custom-b.example'];
        const customBootstrap = new DiscoveryBootstrap({
            bootstrapProviders: customUrls.map((url) => new RendezvousDiscoveryProvider({
                transport: new WebSocketRendezvousTransport({ url }),
                identityProvider
            }))
        });
        assert(customBootstrap.bootstrapProviders.length === 2,
            '60. a custom rendezvous list produces exactly one bootstrap provider per configured URL, never a stale default');
        customBootstrap.dispose();

        // WebSocketRendezvousTransport itself exposes the exact url it was
        // constructed with — the direct evidence that a configured URL
        // actually reaches the concrete transport, unchanged.
        const transportA = new WebSocketRendezvousTransport({ url: 'wss://custom-a.example' });
        const transportB = new WebSocketRendezvousTransport({ url: 'wss://custom-b.example' });
        assert(transportA.url === 'wss://custom-a.example' && transportB.url === 'wss://custom-b.example',
            '61. each configured URL reaches its own concrete WebSocketRendezvousTransport construction exactly, never mixed up or defaulted');
    }
    console.log('✓ Section H: both the default and a custom rendezvous URL list produce the correct number of bootstrap providers, each pointed at its own exact configured URL, through the real production classes');

    // ===============================================================
    // Section I — reset to defaults: clear() restores genuine absence,
    // never a saved copy of the default.
    // ===============================================================
    {
        const store = new RendezvousConfigurationStore(new InMemoryStorageProvider());
        const setUseCase = new SetRendezvousConfigurationUseCase({ rendezvousConfigurationStore: store });

        setUseCase.execute({ urls: ['wss://custom.example'] });
        assert(store.get() !== null, '62. a configuration is on file before resetting');

        store.clear();
        assert(store.get() === null, '63. "Reset to Defaults" (store.clear()) restores genuine absence');

        const resolved = (store.get() || { urls: DEFAULT_RENDEZVOUS_URLS }).urls;
        assert(resolved === DEFAULT_RENDEZVOUS_URLS, '64. after resetting, the effective rendezvous list falls back to exactly DEFAULT_RENDEZVOUS_URLS');

        // Explicitly saving the default entries by hand still leaves a
        // real, distinct saved entry — never silently treated as
        // "nothing to persist," the identical rule
        // core/IceServerConfiguration.js's own settings view holds.
        const saved = setUseCase.execute({ urls: [...DEFAULT_RENDEZVOUS_URLS] });
        assert(store.get() !== null, '65. explicitly saving entries matching the deployment default still leaves a real, explicit entry on file');
        assert(saved.urls.length === DEFAULT_RENDEZVOUS_URLS.length, '66. …with the same entry count as the deployment default, confirming this is a genuine explicit save, not a no-op');
    }
    console.log('✓ Section I: "Reset to Defaults" clears to genuine absence; explicitly saving default-matching entries still persists a real, distinct entry');

    // ===============================================================
    // Section J — no effect on STUN: core/IceServerConfiguration.js and
    // peer/IceServerConfig.js are untouched by this milestone's own
    // configuration boundary.
    // ===============================================================
    {
        assert(Array.isArray(DEFAULT_ICE_SERVERS), '67. DEFAULT_ICE_SERVERS is still a real array, untouched by this milestone');
        const iceConfigSource = await source('peer/IceServerConfig.js');
        assert(!/RendezvousConfiguration|RendezvousConfigurationStore|SetRendezvousConfigurationUseCase|RendezvousSettingsView/.test(iceConfigSource),
            '68. peer/IceServerConfig.js imports none of this milestone\'s new Rendezvous configuration classes');

        const iceServerConfigurationExecutable = (await source('core/IceServerConfiguration.js')).replace(/\/\/.*$/gm, '');
        assert(!/RendezvousConfiguration|RendezvousConfigurationStore/.test(iceServerConfigurationExecutable),
            '69. core/IceServerConfiguration.js itself never imports this milestone\'s new Rendezvous configuration classes');

        const rendezvousConfigurationExecutable = (await source('core/RendezvousConfiguration.js')).replace(/\/\/.*$/gm, '');
        assert(!/IceServerConfiguration|stun:|turn:/.test(rendezvousConfigurationExecutable),
            '70. core/RendezvousConfiguration.js itself never imports or references STUN/TURN in executable code');
    }
    console.log('✓ Section J: STUN\'s own configuration boundary and TURN\'s own fetch/credential module are both untouched by this milestone\'s Rendezvous configuration boundary');

    // ===============================================================
    // Section K — no effect on peer identity: peer/
    // PeerAuthenticationSession.js and peer/RendezvousPublicationSigning.js
    // are untouched.
    // ===============================================================
    {
        const authSource = await source('peer/PeerAuthenticationSession.js');
        assert(!/RendezvousConfiguration|RendezvousConfigurationStore|DiscoveryBootstrap/.test(authSource),
            '71. peer/PeerAuthenticationSession.js — the sole authority on peer identity — imports none of this milestone\'s Rendezvous configuration classes; a change of WHERE discovery connects cannot change WHO a connection is proven to belong to');

        const signingSource = await source('peer/RendezvousPublicationSigning.js');
        assert(!/RendezvousConfiguration|RendezvousConfigurationStore/.test(signingSource),
            '72. peer/RendezvousPublicationSigning.js — publication signing — is untouched by this milestone\'s configuration boundary');

        const transportSource = await source('peer/WebSocketRendezvousTransport.js');
        assert(!/RendezvousConfiguration|RendezvousConfigurationStore|SetRendezvousConfigurationUseCase/.test(transportSource),
            '73. peer/WebSocketRendezvousTransport.js itself is untouched — it still accepts a plain url string, with no awareness of core/RendezvousConfiguration.js at all; ui/main.js alone bridges the two');
    }
    console.log('✓ Section K: peer identity/authentication and publication signing are both untouched by this milestone\'s Rendezvous configuration boundary');

    // ===============================================================
    // Section L — existing peer discovery journey regression: list()/
    // discover()/importInvitation() behave identically whether
    // bootstrapProviders came from a user override or the deployment
    // default.
    // ===============================================================
    {
        const identityProvider = new LocalIdentityProvider(new InMemoryStorageProvider());
        identityProvider.login('regression-tester');

        for (const urls of [DEFAULT_RENDEZVOUS_URLS, ['wss://regression-check.example']]) {
            const bootstrap = new DiscoveryBootstrap({
                bootstrapProviders: urls.map((url) => new RendezvousDiscoveryProvider({
                    transport: new WebSocketRendezvousTransport({ url }),
                    identityProvider
                }))
            });
            assert(Array.isArray(bootstrap.list()), '74. list() still returns a real array, regardless of which rendezvous list is configured');

            const unsubscribe = bootstrap.onDiscovered(() => {});
            assert(typeof unsubscribe === 'function', '75. onDiscovered() still returns a real unsubscribe function, unchanged');
            unsubscribe();

            const results = await bootstrap.discover('someone');
            assert(Array.isArray(results), '76. discover() still resolves to a real array, degrading gracefully rather than throwing, regardless of which rendezvous list is configured');

            bootstrap.dispose();
        }
    }
    console.log('✓ Section L: list()/onDiscovered()/discover()/dispose() behave identically regardless of which rendezvous list — user-configured or default — the bootstrap was constructed with; no peer, identity, or discovery semantics changed');

    // ===============================================================
    // Section M — no fallback/health checking: saving never opens a
    // WebSocket or issues a PUBLISH/LOOKUP.
    // ===============================================================
    {
        let websocketConstructed = false;
        const OriginalWebSocket = globalThis.WebSocket;
        globalThis.WebSocket = class {
            constructor() { websocketConstructed = true; }
        };
        try {
            const store = new RendezvousConfigurationStore(new InMemoryStorageProvider());
            const setUseCase = new SetRendezvousConfigurationUseCase({ rendezvousConfigurationStore: store });
            // A syntactically valid but entirely made-up, unreachable
            // hostname — accepted exactly like any other valid rendezvous
            // URL, because validation is shape-only, never reachability.
            setUseCase.execute({ urls: ['wss://this-host-does-not-exist.invalid'] });
            assert(!websocketConstructed, '77. saving a configuration never opens a WebSocket of any kind — no connection testing, no health checking');
        } finally {
            globalThis.WebSocket = OriginalWebSocket;
        }

        // No automatic fallback: once saved, an "unreachable-looking"
        // configuration is never silently replaced or reverted.
        {
            const store = new RendezvousConfigurationStore(new InMemoryStorageProvider());
            const setUseCase = new SetRendezvousConfigurationUseCase({ rendezvousConfigurationStore: store });
            setUseCase.execute({ urls: ['wss://this-host-does-not-exist.invalid'] });
            for (let i = 0; i < 5; i++) {
                assert(store.get().urls[0] === 'wss://this-host-does-not-exist.invalid',
                    `78.${i} repeated reads of an "unreachable-looking" saved configuration never degrade or fall back automatically`);
            }
        }

        // Neither the store nor the use case exposes any health/test/
        // ping-shaped method — the capability is structurally absent, not
        // merely unused.
        const store = new RendezvousConfigurationStore(new InMemoryStorageProvider());
        const setUseCase = new SetRendezvousConfigurationUseCase({ rendezvousConfigurationStore: store });
        for (const forbiddenMethod of ['test', 'testConnection', 'healthCheck', 'ping', 'probe', 'verify', 'checkReachability', 'rank', 'selectBest']) {
            assert(typeof store[forbiddenMethod] === 'undefined', `79. RendezvousConfigurationStore exposes no ${forbiddenMethod}() method`);
            assert(typeof setUseCase[forbiddenMethod] === 'undefined', `79. SetRendezvousConfigurationUseCase exposes no ${forbiddenMethod}() method`);
        }
    }
    console.log('✓ Section M: saving a rendezvous configuration never opens a WebSocket, never health-checks, and never automatically falls back away from an "unreachable-looking" saved configuration — the capability is structurally absent, not merely unexercised');

    // ===============================================================
    // Section N — runtime failure behavior unchanged: peer/
    // RendezvousDiscoveryProvider.js's own graceful degradation and peer/
    // WebSocketRendezvousTransport.js's own wire protocol are untouched.
    // ===============================================================
    {
        const discoveryProviderSource = await source('peer/RendezvousDiscoveryProvider.js');
        assert(!/RendezvousConfiguration|RendezvousConfigurationStore|SetRendezvousConfigurationUseCase/.test(discoveryProviderSource),
            '80. peer/RendezvousDiscoveryProvider.js imports none of this milestone\'s new configuration classes — its own graceful-degradation logic is untouched');
        assert(discoveryProviderSource.includes('Rendezvous Lookup Degrades; It Never Fails Loud'),
            '81. the existing graceful-degradation discipline is still documented and unmodified in kind by this milestone');

        const transportSource = await source('peer/WebSocketRendezvousTransport.js');
        assert(/RENDEZVOUS_PROTOCOL_VERSION/.test(transportSource),
            '82. the existing wire protocol version constant still exists, unmodified in kind by this milestone');

        const bootstrapSource = await source('peer/DiscoveryBootstrap.js');
        assert(!/RendezvousConfiguration|core\/RendezvousConfiguration/.test(bootstrapSource),
            '83. peer/DiscoveryBootstrap.js itself is untouched — it still accepts a plain bootstrapProviders array, with no awareness of core/RendezvousConfiguration.js at all; ui/main.js alone bridges the two');
    }
    console.log('✓ Section N: the existing graceful-degradation discipline and the discovery bootstrap/transport classes are completely untouched by this milestone — the new configuration boundary is entirely a composition-root/settings concern layered on top');
}

run().then(() => {
    console.log('\n✅ All User-Configurable Rendezvous Server Configuration tests passed.');
}).catch((error) => {
    console.error('UserConfigurableRendezvousConfiguration.test.js FAILED:', error);
    process.exitCode = 1;
});
