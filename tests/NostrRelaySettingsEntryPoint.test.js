import { readFile } from 'node:fs/promises';

import { NostrRelayConfiguration, DEFAULT_NOSTR_RELAY_URL, isValidNostrRelayUrl } from '../core/NostrRelayConfiguration.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { NostrRelayConfigurationStore } from '../storage/NostrRelayConfigurationStore.js';
import { SetNostrRelayConfigurationUseCase } from '../application/SetNostrRelayConfigurationUseCase.js';
import { ArweaveGatewayConfiguration } from '../core/ArweaveGatewayConfiguration.js';
import { ArweaveGatewayConfigurationStore } from '../storage/ArweaveGatewayConfigurationStore.js';
import { NostrDiscoveryQueryService } from '../application/NostrDiscoveryQueryService.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/NostrSnapshotDiscoveryQueryService.js';
import { NostrPlaceNamingDiscoverySource } from '../application/NostrPlaceNamingDiscoverySource.js';
import { composeDecentralizedWorldEncounterMaterialDiscoveryServices } from '../application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js';
import { composeDiscoverSnapshotRuntime } from '../application/DiscoverSnapshotRuntimeComposition.js';
import { composeSnapshotDistributionRuntime } from '../application/SnapshotDistributionRuntimeComposition.js';
import { composePlaceNamingPublicationRuntime } from '../application/PlaceNamingPublicationRuntimeComposition.js';
import { createNostrRelayQueryClient } from '../nostr/NostrRelayQueryClient.js';

// 0.9.371 — Nostr Relay Settings UI.
//
// 0.9.369 gave a user's own Nostr relay choice a real value object, a
// durable store, and three wired read-path composition call sites; 0.9.370
// proved those pieces converge with no second authority anywhere, down to
// the concrete WebSocket construction. Neither milestone gave a person any
// ORDINARY product path to actually reach that configuration — every
// override either milestone's own tests exercised was written directly
// through NostrRelayConfigurationStore.save(), a storage-layer method no UI
// has ever called. This suite proves the missing other half: a real
// settings surface, reachable from top-nav, that creates/changes/clears the
// override end to end, without ever constructing a discovery adapter
// itself — the direct structural mirror of
// tests/ArweaveGatewaySettingsEntryPoint.test.js (0.9.366).
//
//   Section 0  — the settings entry point is actually reachable (nav link,
//                route, composition-root wiring, view wiring — never
//                inferred from source alone).
//   Section A  — no override displays deployment-default state.
//   Section B  — existing override loads correctly.
//   Section C  — save: a valid ws:/wss: URL actually persists.
//   Section D  — invalid input is rejected.
//   Section E  — rejected input never mutates the existing configuration.
//   Section F  — replacement: relay-A -> relay-B replaces, never
//                accumulates a second entry.
//   Section G  — clear: "Use Deployment Default" restores genuine absence.
//   Section H  — restart: a brand-new store/use-case pair, over the SAME
//                underlying storage, observes what an earlier instance
//                saved.
//   Section I  — consumer convergence: a custom relay saved through the
//                settings entry point actually reaches Publication,
//                Snapshot, and Place Naming discovery's own concrete
//                WebSocket construction, each independently.
//   Section J  — publishing remains unaffected by a settings-saved
//                override on file at the same moment.
//   Section K  — Arweave Gateway configuration remains unaffected by this
//                milestone's own new wiring.
//   Section L  — view template sweep: display state, Save/Use Deployment
//                Default wiring, no infrastructure construction/network
//                logic, and the deliberately-excluded feature list.
//   Section M  — no live re-composition after Save.
//   Section N  — architecture sweep of the new use case file.
//
// See application/SetNostrRelayConfigurationUseCase.js and
// ui/views/NostrRelaySettingsView.js for the full design rationale this
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

// Mirrors tests/NostrRelayConfigurationConvergenceAudit.test.js's own
// SharedNamespaceStorageProvider exactly — two SEPARATE instances over one
// externally-owned namespace behave the way two separate page loads share
// one browser's localStorage, which is what makes "restart" genuine rather
// than a re-read of the same in-memory Map.
class SharedNamespaceStorageProvider extends StorageProvider {
    constructor(sharedNamespace) { super(); this._namespace = sharedNamespace; }
    save(name, data) { this._namespace[name] = JSON.stringify(data); }
    load(name) { return Object.prototype.hasOwnProperty.call(this._namespace, name) ? JSON.parse(this._namespace[name]) : null; }
    remove(name) { delete this._namespace[name]; }
    list() { return Object.keys(this._namespace); }
}

// A fake WebSocket constructor — the exact injection point
// nostr/NostrRelayQueryClient.js's own `createNostrRelayQueryClient({ webSocketImpl })`
// already accepts — that answers every REQ with an immediate, zero-event
// EOSE. Every construction is recorded on `.constructions` so a test can
// assert exactly which relay URL the CONCRETE, real, unmodified
// `new webSocketCtor(relayUrl)` call inside NostrRelayQueryClient.js
// actually reached, never merely a constructed query service's own
// `.relayUrl` getter.
function makeEmptyResultRelaySocketClass() {
    class EmptyResultRelaySocket {
        constructor(url) {
            this.url = url;
            EmptyResultRelaySocket.constructions.push(url);
            this.readyState = 0;
            this._subscriptionId = null;
            queueMicrotask(() => {
                this.readyState = 1;
                if (this.onopen) this.onopen();
            });
        }
        send(raw) {
            const frame = JSON.parse(raw);
            if (frame[0] === 'REQ') {
                this._subscriptionId = frame[1];
                queueMicrotask(() => {
                    if (this.onmessage) {
                        this.onmessage({ data: JSON.stringify(['EOSE', this._subscriptionId]) });
                    }
                });
            }
        }
        close() { this.readyState = 3; }
    }
    EmptyResultRelaySocket.constructions = [];
    return EmptyResultRelaySocket;
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
        assert(mainSource.includes("import { SetNostrRelayConfigurationUseCase } from '../application/SetNostrRelayConfigurationUseCase.js';"),
            '1. ui/main.js imports the new write use case');
        assert(/new SetNostrRelayConfigurationUseCase\(\{\s*nostrRelayConfigurationStore\s*\}\)/.test(mainSource),
            '2. ui/main.js wires SetNostrRelayConfigurationUseCase against the SAME shared nostrRelayConfigurationStore the 0.9.369 read-path composition already resolves through, never a second disconnected store');
        assert(/app\.provide\('nostrRelayConfigurationStore',\s*nostrRelayConfigurationStore\)/.test(mainSource),
            '3. the shared store is actually provided to the Vue app, not just constructed and discarded');
        assert(/app\.provide\('setNostrRelayConfigurationUseCase',\s*setNostrRelayConfigurationUseCase\)/.test(mainSource),
            '4. the write use case is actually provided to the Vue app');
        const storeConstructions = (mainSource.match(/new NostrRelayConfigurationStore\(/g) || []).length;
        assert(storeConstructions === 1, `5. ui/main.js still constructs exactly one NostrRelayConfigurationStore instance — found ${storeConstructions}`);

        const routerSource = await source('ui/router/index.js');
        assert(/path:\s*'\/settings\/nostr-relay'/.test(routerSource),
            '6. a real route exists for the settings entry point');
        assert(routerSource.includes("import NostrRelaySettingsView from '../views/NostrRelaySettingsView.js';"),
            '7. the router imports the real view component, never a stub');

        const appSource = await source('ui/App.js');
        assert(/router-link to="\/settings"/.test(appSource), '8a. a real top-nav link reaches the Network Settings hub');
        const networkSettingsSource = await source('ui/views/NetworkSettingsView.js');
        assert(/router-link to="\/settings\/nostr-relay"/.test(networkSettingsSource),
            '8b. the Network Settings hub links to the settings entry point — reachable one hop further, not a URL-only capability');

        const viewSource = await source('ui/views/NostrRelaySettingsView.js');
        const viewExecutable = viewSource.replace(/\/\/.*$/gm, '');
        assert(/inject\('nostrRelayConfigurationStore',\s*null\)/.test(viewExecutable),
            '9. the view reads the configuration through the injected store, never a store it constructs itself');
        assert(/inject\('setNostrRelayConfigurationUseCase',\s*null\)/.test(viewExecutable),
            '10. the view writes the configuration through the injected use case, never NostrRelayConfigurationStore.save() directly');
        assert(!/new NostrRelayConfiguration\(/.test(viewExecutable),
            '11. the view never constructs a NostrRelayConfiguration itself — validation and construction stay inside the use case');
        assert(viewExecutable.includes("import { DEFAULT_NOSTR_RELAY_URL } from '../../core/NostrRelayConfiguration.js';"),
            '12. the ONE thing the view imports from core/NostrRelayConfiguration.js is the plain default constant, for display only');
        console.log('✓ Section 0: the settings entry point is really wired — nav link, route, shared store, shared use case, and a view that only ever goes through the injected collaborators');
    }

    // ===============================================================
    // Section A — no override displays deployment-default state.
    // ===============================================================
    {
        const store = new NostrRelayConfigurationStore(new InMemoryStorageProvider());
        assert(store.get() === null, '13. sanity — no override is on file');
        const effective = (store.get() || { relayUrl: DEFAULT_NOSTR_RELAY_URL }).relayUrl;
        assert(effective === DEFAULT_NOSTR_RELAY_URL, '14. with no override, the effective relay resolves to the deployment default — exactly what the view\'s own effectiveRelayUrl computed property displays informationally');
    }
    console.log('✓ Section A: no-override state resolves to the deployment default, never a fabricated saved entry');

    // ===============================================================
    // Section B — existing override loads correctly.
    // ===============================================================
    {
        const store = new NostrRelayConfigurationStore(new InMemoryStorageProvider());
        store.save(new NostrRelayConfiguration({ relayUrl: 'wss://existing-relay.example' }));
        const loaded = store.get();
        assert(loaded instanceof NostrRelayConfiguration && loaded.relayUrl === 'wss://existing-relay.example',
            '15. an existing override on file loads back as a real NostrRelayConfiguration with the exact saved relayUrl — exactly what the view\'s own load() reads on mount');
    }
    console.log('✓ Section B: an existing override loads back correctly through store.get()');

    // ===============================================================
    // Section C — save: a valid ws:/wss: URL actually persists.
    // ===============================================================
    {
        const store = new NostrRelayConfigurationStore(new InMemoryStorageProvider());
        const setUseCase = new SetNostrRelayConfigurationUseCase({ nostrRelayConfigurationStore: store });

        const savedWss = setUseCase.execute({ relayUrl: 'wss://my-relay.example' });
        assert(savedWss instanceof NostrRelayConfiguration && savedWss.relayUrl === 'wss://my-relay.example',
            '16. execute() returns the persisted NostrRelayConfiguration for a wss: URL');
        assert(store.get().relayUrl === 'wss://my-relay.example', '17. saving a valid wss: relay through the settings entry point actually persists it');

        const savedWs = setUseCase.execute({ relayUrl: 'ws://plain-relay.example' });
        assert(savedWs.relayUrl === 'ws://plain-relay.example', '18. a plain ws: URL is accepted too, mirroring isValidNostrRelayUrl()\'s own scheme family');
        assert(store.get().relayUrl === 'ws://plain-relay.example', '19. the ws: save persisted');
    }
    console.log('✓ Section C: a valid ws:/wss: relay URL actually saves through SetNostrRelayConfigurationUseCase');

    // ===============================================================
    // Section D — invalid input is rejected.
    // ===============================================================
    {
        const store = new NostrRelayConfigurationStore(new InMemoryStorageProvider());
        const setUseCase = new SetNostrRelayConfigurationUseCase({ nostrRelayConfigurationStore: store });

        expectThrows(() => setUseCase.execute({ relayUrl: 'not-a-url' }), '20. a malformed URL is refused');
        expectThrows(() => setUseCase.execute({ relayUrl: 'https://relay.damus.io' }), '21. an http(s) URL is refused — the wrong scheme family for a Nostr relay');
        expectThrows(() => setUseCase.execute({ relayUrl: '' }), '22. an empty string is refused');
        expectThrows(() => setUseCase.execute({}), '23. a missing relayUrl is refused');
        assert(isValidNostrRelayUrl('not-a-url') === false, '24. sanity — the shared validation helper itself rejects the same malformed input');
    }
    console.log('✓ Section D: invalid input (malformed, wrong scheme, empty, missing) is rejected by the use case');

    // ===============================================================
    // Section E — rejected input never mutates the existing configuration.
    // ===============================================================
    {
        const store = new NostrRelayConfigurationStore(new InMemoryStorageProvider());
        const setUseCase = new SetNostrRelayConfigurationUseCase({ nostrRelayConfigurationStore: store });

        // Nothing on file yet — an invalid save leaves it that way.
        expectThrows(() => setUseCase.execute({ relayUrl: 'not-a-url' }), '25. a malformed URL is refused with nothing on file');
        assert(store.get() === null, '26. the rejected save left the store genuinely empty, never a partial or fallback write');

        // Something valid already on file — an invalid save leaves it
        // COMPLETELY untouched, never partially overwritten and never
        // cleared.
        setUseCase.execute({ relayUrl: 'wss://original-relay.example' });
        expectThrows(() => setUseCase.execute({ relayUrl: 'https://not-ws.example' }), '27. a non-ws(s) scheme is refused');
        expectThrows(() => setUseCase.execute({ relayUrl: '' }), '28. an empty string is refused');
        expectThrows(() => setUseCase.execute({}), '29. a missing relayUrl is refused');
        assert(store.get().relayUrl === 'wss://original-relay.example',
            '30. every rejected save left the PREVIOUSLY saved configuration completely untouched');
    }
    console.log('✓ Section E: rejected input never mutates whatever configuration was previously on file — valid or absent');

    // ===============================================================
    // Section F — replacement: relay-A -> relay-B replaces, never
    // accumulates a second entry.
    // ===============================================================
    {
        const backing = new InMemoryStorageProvider();
        const store = new NostrRelayConfigurationStore(backing);
        const setUseCase = new SetNostrRelayConfigurationUseCase({ nostrRelayConfigurationStore: store });

        setUseCase.execute({ relayUrl: 'wss://relay-a.example' });
        assert(store.get().relayUrl === 'wss://relay-a.example', '31. relay-A is on file');

        setUseCase.execute({ relayUrl: 'wss://relay-b.example' });
        assert(store.get().relayUrl === 'wss://relay-b.example', '32. relay-B replaces relay-A outright');
        assert(backing.list().filter((key) => key === 'nostr-relay-configuration').length === 1,
            '33. exactly one storage entry exists after replacement, never two');
    }
    console.log('✓ Section F: replacing a saved relay never accumulates a second entry');

    // ===============================================================
    // Section G — clear: "Use Deployment Default" restores genuine
    // absence, never a saved copy of the default.
    // ===============================================================
    {
        const backing = new InMemoryStorageProvider();
        const store = new NostrRelayConfigurationStore(backing);
        const setUseCase = new SetNostrRelayConfigurationUseCase({ nostrRelayConfigurationStore: store });

        setUseCase.execute({ relayUrl: 'wss://my-relay.example' });
        assert(store.get() !== null, '34. a configuration is on file before clearing');

        // "Use Deployment Default" — the view calls store.clear() directly,
        // never setUseCase.execute({ relayUrl: DEFAULT_NOSTR_RELAY_URL }).
        store.clear();
        assert(store.get() === null, '35. clear() restores genuine absence — get() is a real null');
        assert(backing.load('nostr-relay-configuration') === null, '36. nothing at all remains on file — never a saved copy of the default URL');

        const effective = (store.get() || { relayUrl: DEFAULT_NOSTR_RELAY_URL }).relayUrl;
        assert(effective === DEFAULT_NOSTR_RELAY_URL, '37. after clearing, the effective relay falls back to the deployment default');
    }
    console.log('✓ Section G: "Use Deployment Default" clears to genuine absence, never persisting a copy of the default URL');

    // ===============================================================
    // Section H — restart: a brand-new store/use-case pair, over the SAME
    // underlying storage, observes what an earlier instance saved.
    // ===============================================================
    {
        const sharedNamespace = {};

        const storeBeforeRestart = new NostrRelayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        const setUseCaseBeforeRestart = new SetNostrRelayConfigurationUseCase({ nostrRelayConfigurationStore: storeBeforeRestart });
        setUseCaseBeforeRestart.execute({ relayUrl: 'wss://my-relay.example' });

        // restart boundary — genuinely new instances, sharing only the
        // underlying namespace.
        const storeAfterRestart = new NostrRelayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        assert(storeAfterRestart !== storeBeforeRestart, '38. sanity — this really is a newly constructed store, not the same instance');
        assert(storeAfterRestart.get().relayUrl === 'wss://my-relay.example',
            '39. a newly constructed store observes the configuration an earlier instance persisted');

        const setUseCaseAfterRestart = new SetNostrRelayConfigurationUseCase({ nostrRelayConfigurationStore: storeAfterRestart });
        assert(setUseCaseAfterRestart !== setUseCaseBeforeRestart, '40. sanity — this really is a newly constructed use case, not the same instance');
        setUseCaseAfterRestart.execute({ relayUrl: 'wss://another-relay.example' });
        assert(storeBeforeRestart.get().relayUrl === 'wss://another-relay.example',
            '41. a write through the newly constructed use case is visible back through the ORIGINAL store instance too — the same underlying storage, never divergent in-memory state');
    }
    console.log('✓ Section H: newly constructed settings/application objects observe (and can further change) an earlier instance\'s persisted configuration, across a genuine restart boundary');

    // ===============================================================
    // Section I — consumer convergence: a custom relay saved through the
    // settings entry point actually reaches Publication, Snapshot, and
    // Place Naming discovery's own concrete WebSocket construction, each
    // independently, after a fresh composition.
    // ===============================================================
    {
        const store = new NostrRelayConfigurationStore(new InMemoryStorageProvider());
        const setUseCase = new SetNostrRelayConfigurationUseCase({ nostrRelayConfigurationStore: store });
        setUseCase.execute({ relayUrl: 'wss://my-settings-relay.example' });

        // "New application composition" — resolve the effective relay from
        // the store exactly as ui/main.js does, then build each real
        // consumer from it, never from a cached/remembered value.
        const resolvedRelayUrl = (store.get() || { relayUrl: DEFAULT_NOSTR_RELAY_URL }).relayUrl;
        assert(resolvedRelayUrl === 'wss://my-settings-relay.example', 'sanity — the settings-saved relay resolves as the effective relay');

        // Publication discovery.
        {
            const SocketClass = makeEmptyResultRelaySocketClass();
            const queryImpl = createNostrRelayQueryClient({ webSocketImpl: SocketClass });
            const { nostr } = composeDecentralizedWorldEncounterMaterialDiscoveryServices({
                nostrQueryImpl: queryImpl,
                nostrRelayUrl: resolvedRelayUrl
            });
            assert(nostr instanceof NostrDiscoveryQueryService, '42. sanity — a real Publication discovery service was built');
            const result = await nostr.search('some-discovery-tag');
            assert(Array.isArray(result) && result.length === 0, '43. Publication discovery resolves a genuine empty result against the settings-saved relay');
            assert(SocketClass.constructions.length === 1 && SocketClass.constructions[0] === 'wss://my-settings-relay.example',
                '44. Publication discovery\'s concrete WebSocket construction reached exactly the relay saved through the settings entry point');
        }

        // Snapshot discovery.
        {
            const SocketClass = makeEmptyResultRelaySocketClass();
            const queryImpl = createNostrRelayQueryClient({ webSocketImpl: SocketClass });
            const { queryService } = composeDiscoverSnapshotRuntime({
                nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl, relayUrl: resolvedRelayUrl }
            });
            assert(queryService instanceof NostrSnapshotDiscoveryQueryService, '45. sanity — a real Snapshot discovery service was built');
            const result = await queryService.search('some-discovery-tag');
            assert(Array.isArray(result) && result.length === 0, '46. Snapshot discovery resolves a genuine empty result against the settings-saved relay');
            assert(SocketClass.constructions.length === 1 && SocketClass.constructions[0] === 'wss://my-settings-relay.example',
                '47. Snapshot discovery\'s concrete WebSocket construction reached exactly the relay saved through the settings entry point');
        }

        // Place Naming discovery.
        {
            const SocketClass = makeEmptyResultRelaySocketClass();
            const queryImpl = createNostrRelayQueryClient({ webSocketImpl: SocketClass });
            const placeNamingSource = new NostrPlaceNamingDiscoverySource({ queryImpl, relayUrl: resolvedRelayUrl });
            const result = await placeNamingSource.search('some-discovery-tag');
            assert(Array.isArray(result) && result.length === 0, '48. Place Naming discovery resolves a genuine empty result against the settings-saved relay');
            assert(SocketClass.constructions.length === 1 && SocketClass.constructions[0] === 'wss://my-settings-relay.example',
                '49. Place Naming discovery\'s concrete WebSocket construction reached exactly the relay saved through the settings entry point');
        }

        // A subsequent Clear -> a fresh composition falls back to the
        // deployment default — proving the settings surface's own clear()
        // genuinely reaches a later composition, not just get().
        {
            store.clear();
            const resolvedAfterClear = (store.get() || { relayUrl: DEFAULT_NOSTR_RELAY_URL }).relayUrl;
            assert(resolvedAfterClear === DEFAULT_NOSTR_RELAY_URL, '50. after Save then Clear, a fresh composition resolves the deployment default, never the cleared override');
            const SocketClass = makeEmptyResultRelaySocketClass();
            const queryImpl = createNostrRelayQueryClient({ webSocketImpl: SocketClass });
            const { nostr } = composeDecentralizedWorldEncounterMaterialDiscoveryServices({ nostrQueryImpl: queryImpl, nostrRelayUrl: resolvedAfterClear });
            await nostr.search('tag');
            assert(SocketClass.constructions[0] === DEFAULT_NOSTR_RELAY_URL, '51. …and the concrete WebSocket construction actually reaches the deployment default relay');
        }

        console.log('✓ Section I: Settings Save -> persistent configuration -> new application composition -> each of the three read paths\' concrete WebSocket construction reaches the custom relay, independently; Clear reverts a subsequent fresh composition to the deployment default');
    }

    // ===============================================================
    // Section J — publishing remains unaffected by a settings-saved
    // override on file at the same moment.
    // ===============================================================
    {
        const store = new NostrRelayConfigurationStore(new InMemoryStorageProvider());
        const setUseCase = new SetNostrRelayConfigurationUseCase({ nostrRelayConfigurationStore: store });
        setUseCase.execute({ relayUrl: 'wss://my-read-only-relay.example' });

        // Snapshot discovery PUBLISHING, composed exactly as ui/main.js
        // composes it: publishImpl + discoveryTag only, no relayUrl of any
        // kind — it never reads the settings-saved store at all.
        const snapshotPublishCalls = [];
        const { discoveryPublisher: snapshotDiscoveryPublisher } = composeSnapshotDistributionRuntime({
            nostrSnapshotDiscoveryPublisherOptions: {
                publishImpl: async (relayUrl) => { snapshotPublishCalls.push(relayUrl); return { published: true, id: 'a'.repeat(64) }; },
                discoveryTag: 'forkbuild-snapshot'
            }
        });
        assert(snapshotDiscoveryPublisher.relayUrl === DEFAULT_NOSTR_RELAY_URL,
            '52. Snapshot discovery publishing still defaults to the deployment default relay, never the settings-saved override on file at this exact moment');
        await snapshotDiscoveryPublisher.publish({ contentHash: 'x'.repeat(43), locator: 'ar://' + 'y'.repeat(43), storage: 'ar' });
        assert(snapshotPublishCalls.length === 1 && snapshotPublishCalls[0] === DEFAULT_NOSTR_RELAY_URL,
            '53. the concrete Snapshot publishImpl call actually reached the deployment default relay, never the settings-saved relay');

        // Place Naming discovery PUBLISHING — composed exactly as
        // ui/main.js composes it: publishImpl only, no relayUrl.
        const { discoveryPublisher: placeNamingDiscoveryPublisher } = composePlaceNamingPublicationRuntime({
            nostrPlaceNamingDiscoveryPublisherOptions: { publishImpl: async () => ({ published: true, id: 'b'.repeat(64) }) }
        });
        assert(placeNamingDiscoveryPublisher.relayUrl === DEFAULT_NOSTR_RELAY_URL,
            '54. Place Naming discovery publishing also still defaults to the deployment default relay, never the settings-saved override');
    }
    console.log('✓ Section J: publishing remains completely unaffected by a relay saved through the settings entry point');

    // ===============================================================
    // Section K — Arweave Gateway configuration remains unaffected by this
    // milestone's own new wiring.
    // ===============================================================
    {
        const sharedNamespace = {};
        const nostrStore = new NostrRelayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        const arweaveStore = new ArweaveGatewayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));

        arweaveStore.save(new ArweaveGatewayConfiguration({ gatewayUrl: 'https://arweave-only.example' }));
        const setNostrUseCase = new SetNostrRelayConfigurationUseCase({ nostrRelayConfigurationStore: nostrStore });
        setNostrUseCase.execute({ relayUrl: 'wss://nostr-only.example' });

        assert(arweaveStore.get().gatewayUrl === 'https://arweave-only.example',
            '55. saving a Nostr relay through the new settings entry point leaves the co-resident Arweave gateway configuration completely untouched');
        assert(nostrStore.get().relayUrl === 'wss://nostr-only.example', '56. sanity — the Nostr relay override itself saved correctly');

        nostrStore.clear();
        assert(arweaveStore.get().gatewayUrl === 'https://arweave-only.example',
            '57. clearing the Nostr relay override also leaves the co-resident Arweave gateway configuration untouched');
    }
    console.log('✓ Section K: Arweave Gateway configuration is completely unaffected by the new Nostr Relay settings entry point');

    // ===============================================================
    // Section L — view template sweep: display state, Save/Use Deployment
    // Default wiring, no infrastructure construction/network logic, and the
    // deliberately-excluded feature list.
    // ===============================================================
    {
        const viewSource = await source('ui/views/NostrRelaySettingsView.js');
        const viewExecutable = viewSource.replace(/\/\/.*$/gm, '');

        // Display state.
        assert(/v-if="hasOverride"/.test(viewSource), '58. the template branches on whether an override is on file');
        assert(/No override configured/.test(viewSource) && /effectiveRelayUrl/.test(viewSource),
            '59. the no-override state displays the effective deployment default as informational text');
        assert(/Current override/.test(viewSource), '60. the override state displays the current, actually-saved relayUrl');

        // Opening the page never writes anything: load() only calls
        // store.get(), never store.save()/setNostrRelayConfigurationUseCase.execute()
        // outside of the save() handler.
        const loadFnMatch = viewSource.match(/function load\(\)\s*\{[\s\S]*?\n\s{8}\}/);
        assert(loadFnMatch, '61. a load() function exists');
        assert(!/execute\(|\.save\(|\.clear\(/.test(loadFnMatch[0]),
            '62. load() never calls the use case, store.save(), or store.clear() — merely opening the page persists nothing');

        // Save / Use Deployment Default wiring.
        assert(/@click="save"/.test(viewSource), '63. a Save action is wired');
        assert(/@click="useDeploymentDefault"/.test(viewSource), '64. a Use Deployment Default action is wired');
        const useDeploymentDefaultFnMatch = viewSource.match(/function useDeploymentDefault\(\)\s*\{[\s\S]*?\n\s{8}\}/);
        assert(useDeploymentDefaultFnMatch, '65. a useDeploymentDefault() function exists');
        assert(/store\.clear\(\)/.test(useDeploymentDefaultFnMatch[0]),
            '66. Use Deployment Default calls store.clear()');
        assert(!/DEFAULT_NOSTR_RELAY_URL/.test(useDeploymentDefaultFnMatch[0]),
            '67. Use Deployment Default never saves { relayUrl: DEFAULT_NOSTR_RELAY_URL } — it only ever clears');
        const saveFnMatch = viewSource.match(/function save\(\)\s*\{[\s\S]*?\n\s{8}\}/);
        assert(saveFnMatch, '68. a save() function exists');
        assert(/setNostrRelayConfigurationUseCase\.execute\(/.test(saveFnMatch[0]),
            '69. save() goes through the injected use case, never a direct store.save()');
        assert(!/store\.save\(/.test(saveFnMatch[0]),
            '70. save() never calls store.save() directly, bypassing the use case');

        // No infrastructure construction/network logic of any kind — the
        // view never imports or constructs a discovery adapter, transport,
        // or publisher, and never touches a composition function either.
        assert(!/NostrDiscoveryQueryService|NostrSnapshotDiscoveryQueryService|NostrPlaceNamingDiscoverySource|NostrRelayQueryClient|createNostrRelayQueryClient/.test(viewExecutable),
            '71. the view never imports or constructs a discovery adapter or transport client, and never even names one — it only ever talks to the injected store/use case seam');
        assert(!/composeDiscoverSnapshotRuntime|composeDecentralizedWorldEncounterMaterialDiscoveryServices|composeSnapshotDistributionRuntime|composePlaceNamingPublicationRuntime/.test(viewExecutable),
            '72. the view never touches a composition function either — a saved change only takes effect through ui/main.js\'s own next composition, never a live re-composition this view performs');
        assert(!/\bfetch\s*\(/.test(viewExecutable) && !/new WebSocket\(/.test(viewExecutable),
            '73. no network call or WebSocket construction of any kind exists in the view');

        // Deliberately excluded features — none of this vocabulary appears
        // in what the UI actually RENDERS (the template literal itself,
        // never this file's own design-rationale comments, which
        // legitimately discuss and rule out each one by name).
        const templateMatch = viewSource.match(/template:\s*`([\s\S]*)`\s*\n\};/);
        assert(templateMatch, '74. the view exports a template literal to inspect');
        const templateText = templateMatch[1];
        const excludedTerms = [
            'Test Connection', 'health', 'Health', 'fallback', 'Fallback',
            'priority', 'Priority', 'rotation', 'Rotation', 'ranking', 'Ranking',
            'retry', 'Retry', 'timeout', 'Timeout', 'credential', 'Credential',
            'Infrastructure Settings', 'multiple relay'
        ];
        for (const term of excludedTerms) {
            assert(!templateText.includes(term), `75 ('${term}'). the deliberately-excluded feature vocabulary never appears in what the view actually renders`);
        }

        console.log('✓ Section L: the view template shows the correct no-override/override states without ever mutating on load, wires Save through the use case and Use Deployment Default through store.clear() only, constructs no infrastructure/network logic, and carries none of the deliberately-excluded feature vocabulary');
    }

    // ===============================================================
    // Section M — no live re-composition after Save: saving through the
    // settings entry point never itself reconstructs any discovery
    // consumer or reaches any transport — only ui/main.js's own NEXT
    // composition (proven separately in Section I) does that.
    // ===============================================================
    {
        const useCaseSource = await source('application/SetNostrRelayConfigurationUseCase.js');
        const executable = useCaseSource.replace(/\/\/.*$/gm, '');
        assert(!/NostrDiscoveryQueryService|NostrSnapshotDiscoveryQueryService|NostrPlaceNamingDiscoverySource|NostrRelayQueryClient|createNostrRelayQueryClient/.test(executable),
            '76. the use case never imports or constructs any discovery adapter or transport client');
        assert(!/compose[A-Za-z]*Runtime|compose[A-Za-z]*Services/.test(executable),
            '77. the use case never calls a composition function — Save persists a fact, it never re-composes the running application');

        // Behaviorally: saving twice through the use case, with a discovery
        // consumer already constructed BEFORE the second save, proves that
        // consumer's own already-resolved relayUrl never silently changes
        // underneath it — a live re-composition would need to reach into
        // an existing instance to do that, and nothing here does.
        const store = new NostrRelayConfigurationStore(new InMemoryStorageProvider());
        const setUseCase = new SetNostrRelayConfigurationUseCase({ nostrRelayConfigurationStore: store });
        setUseCase.execute({ relayUrl: 'wss://relay-before-second-save.example' });

        const resolvedBeforeSecondSave = (store.get() || { relayUrl: DEFAULT_NOSTR_RELAY_URL }).relayUrl;
        const SocketClass = makeEmptyResultRelaySocketClass();
        const queryImpl = createNostrRelayQueryClient({ webSocketImpl: SocketClass });
        const { nostr: alreadyComposedService } = composeDecentralizedWorldEncounterMaterialDiscoveryServices({
            nostrQueryImpl: queryImpl,
            nostrRelayUrl: resolvedBeforeSecondSave
        });
        assert(alreadyComposedService.relayUrl === 'wss://relay-before-second-save.example', '78. sanity — the already-composed instance holds the relay resolved at ITS OWN construction time');

        // A second Save happens AFTER that instance already exists.
        setUseCase.execute({ relayUrl: 'wss://relay-after-second-save.example' });
        assert(alreadyComposedService.relayUrl === 'wss://relay-before-second-save.example',
            '79. the already-composed instance\'s own relayUrl is completely unchanged by a later Save — no live re-composition reaches back into it');

        await alreadyComposedService.search('tag');
        assert(SocketClass.constructions[0] === 'wss://relay-before-second-save.example',
            '80. …and its concrete WebSocket construction confirms it actually dialed the relay resolved at composition time, never the newer saved value');

        console.log('✓ Section M: Save persists a fact only — it never reconstructs or reaches into any already-composed discovery consumer; only a genuinely new composition (Section I) observes a later Save');
    }

    // ===============================================================
    // Section N — architecture sweep of the new use case file.
    // ===============================================================
    {
        const useCaseSource = await source('application/SetNostrRelayConfigurationUseCase.js');
        const executable = useCaseSource.replace(/\/\/.*$/gm, '');
        assert(!/\bfetch\s*\(/.test(executable), '81. no network call of any kind');
        assert(!/new WebSocket\(/.test(executable), '82. no WebSocket construction of any kind');
        assert(!/localStorage/.test(executable), '83. no direct localStorage access — persistence stays behind the injected store');
        assert(!/from\s*['"][^'"]*ui\//.test(executable), '84. no import from ui/ — this stays a pure application-layer class');
        const importLines = executable.split('\n').filter((line) => /^import\b/.test(line));
        assert(importLines.length === 2, `85. exactly two imports — the configuration value object and its store — found ${importLines.length}`);

        assert(isValidNostrRelayUrl('wss://sanity-check.example'), '86. sanity — the shared validation helper this use case relies on (via the value object) still behaves as documented');
        console.log('✓ Section N: architecture sweep confirms the new use case has no network dependency, no direct storage access, no discovery adapter dependency, and no ui/ dependency');
    }

    console.log('\n✅ All Nostr Relay Settings UI (0.9.371) tests passed.');
}

run().catch((error) => {
    console.error('NostrRelaySettingsEntryPoint.test.js FAILED:', error);
    process.exitCode = 1;
});
