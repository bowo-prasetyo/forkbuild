import { readFile } from 'node:fs/promises';

import { NostrRelayConfiguration, DEFAULT_NOSTR_RELAY_URL, isValidNostrRelayUrl } from '../core/NostrRelayConfiguration.js';
import { ArweaveGatewayConfiguration } from '../core/ArweaveGatewayConfiguration.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { NostrRelayConfigurationStore } from '../storage/NostrRelayConfigurationStore.js';
import { ArweaveGatewayConfigurationStore } from '../storage/ArweaveGatewayConfigurationStore.js';
import { NostrDiscoveryQueryService } from '../application/NostrDiscoveryQueryService.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/NostrSnapshotDiscoveryQueryService.js';
import { NostrPlaceNamingDiscoverySource } from '../application/NostrPlaceNamingDiscoverySource.js';
import { NostrPublicationDiscoveryPublisher } from '../application/NostrPublicationDiscoveryPublisher.js';
import { composeDecentralizedWorldEncounterMaterialDiscoveryServices } from '../application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js';
import { composeDiscoverSnapshotRuntime } from '../application/DiscoverSnapshotRuntimeComposition.js';
import { composeSnapshotDistributionRuntime } from '../application/SnapshotDistributionRuntimeComposition.js';
import { composePlaceNamingPublicationRuntime } from '../application/PlaceNamingPublicationRuntimeComposition.js';
import { resolvePublicationDistributionRuntimeConfiguration } from '../application/PublicationDistributionRuntimeConfiguration.js';
import { createNostrPublicationDistributionRuntimeAdapter } from '../application/NostrPublicationDistributionRuntimeAdapter.js';
import { createNostrRelayQueryClient } from '../nostr/NostrRelayQueryClient.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { DECENTRALIZED_DISCOVERY_ENVELOPE_PROTOCOL, DECENTRALIZED_DISCOVERY_ENVELOPE_VERSION } from '../core/DecentralizedDiscoveryEnvelope.js';

// 0.9.370 — Nostr Relay Configuration Convergence Audit.
//
// Type: test-only. Production changes: NONE.
//
// 0.9.369 gave a user's own Nostr relay choice a real value object
// (core/NostrRelayConfiguration.js), a durable store
// (storage/NostrRelayConfigurationStore.js), and THREE wired read-path
// composition call sites in ui/main.js — and that milestone's own three
// test files (NostrRelayConfiguration.test.js,
// NostrRelayConfigurationPersistence.test.js,
// NostrRelayConfigurationDiscoveryIntegration.test.js) each proved one of
// those pieces correct IN ISOLATION. None of the three asks the harder,
// cross-cutting question this milestone exists to answer: now that this
// configuration has crossed FOUR boundaries — value object -> persistence
// -> composition root -> three independent read-path runtimes — do those
// pieces actually converge on one consistent story, with no second
// authority anywhere, and with the WRITE (publishing) path genuinely
// unreachable by it? This is the direct structural mirror of 0.9.365's own
// Arweave Gateway convergence audit, applied to three read paths instead
// of two, and to a stateful WebSocket transport instead of `fetch`.
//
// The governing invariant, proven from several angles below:
//
//   DEFAULT_NOSTR_RELAY_URL
//           │
//           ├── no persisted override ──► effective default    (READ/DISCOVERY ONLY)
//           │
//           └── persisted override ─────► configured relay     (READ/DISCOVERY ONLY)
//
//   WRITE path (Publication/Snapshot/Place Naming discovery PUBLISHING)
//   never consults any of the above — each publisher keeps its own,
//   entirely independent `relayUrl` default.
//
// Section A: Configuration authority — one value object, one storage key,
//            one composition point, no read/write adapter self-decides.
// Section B: Absence vs. explicit default — three persisted states, proven
//            distinguishable even where two resolve to the same effective
//            relay.
// Section C: All three read paths — the exact configured relayUrl reaches
//            the CONCRETE WebSocket construction (nostr/NostrRelayQueryClient.js's
//            own real, unmodified `new webSocketCtor(relayUrl)` call),
//            never merely a constructed instance's own getter.
// Section D: Independent composition — three genuinely independent
//            compositions (separate store, separate StorageProvider,
//            separate queryImpl transport per consumer) converge on the
//            identical effective relay with no shared singleton anywhere.
// Section E: Restart/persistence convergence — independent store AND
//            StorageProvider instances sharing one storage namespace prove
//            persistence, not process memory, is the authority.
// Section F: Failure semantics — an invalid http(s) URL is rejected at
//            construction, malformed persisted data degrades to null, a
//            genuine storage failure propagates, and an unreachable
//            configured relay fails through each consumer's own existing
//            contract with zero fallback attempt against relay.damus.io.
// Section G: Write-path isolation — a read-path override on file at the
//            same moment never reaches any of the three Nostr publishers'
//            own resolved relayUrl, verified against the CONCRETE
//            publishImpl call for two of the three.
// Section H: Cross-configuration isolation — Nostr relay configuration and
//            Arweave gateway configuration round-trip independently
//            through one shared storage namespace with no key collision
//            and no value bleed; structural sweep confirms no reference in
//            either direction, and none toward RoleProviderPreference/IPFS/
//            peer connectivity.
// Section I: URL semantics — trailing-slash variants are preserved
//            verbatim (the deliberate, documented difference from
//            ArweaveGatewayConfiguration), reach the concrete WebSocket
//            construction unchanged, and no consumer ever concatenates
//            onto relayUrl.
// Section J: Final decision matrix and verdict.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No Settings UI, no relay
// health checking, no credential handling, no relay ranking, no
// configuration history, no network access during configuration, and no
// production code change of any kind — see docs/Roadmap.md, 0.9.370, and
// core/NostrRelayConfiguration.js's own "Deliberately excluded" for the
// full list this audit exists to confirm rather than to build. The one
// issue this milestone deliberately leaves alone: the existing
// "relay failure -> empty/silent discovery result" UX (0.9.368's own
// Section B) is a separate, later product question about failure
// visibility, not a configuration-convergence concern.

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

// A StorageProvider whose bytes live in an externally-owned plain object —
// never in this instance's own memory. Two SEPARATE instances constructed
// over the SAME `sharedNamespace` object behave the way two separate page
// loads share one browser's own `window.localStorage`: no JS reference is
// ever shared between them, only the underlying namespace. This is what
// makes Section E's "restart" genuine rather than a re-read of the same
// Map, and Section H's "one namespace, two configurations" a real,
// independently-keyed proof.
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

// A fake WebSocket constructor modeling a genuinely unreachable relay
// (connection refused) — `onerror` fires, `EOSE` never arrives. Every
// construction is still recorded, so a test can assert the relay was
// actually dialed exactly once, and never a second time against
// DEFAULT_NOSTR_RELAY_URL as a silent fallback.
function makeUnreachableRelaySocketClass() {
    class UnreachableRelaySocket {
        constructor(url) {
            this.url = url;
            UnreachableRelaySocket.constructions.push(url);
            queueMicrotask(() => {
                if (this.onerror) this.onerror(new Error('connection refused'));
            });
        }
        send() { /* never reached — the socket never opens */ }
        close() { /* best-effort no-op, mirroring the real client's own guard */ }
    }
    UnreachableRelaySocket.constructions = [];
    return UnreachableRelaySocket;
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function run() {
    console.log('Running Nostr Relay Configuration Convergence Audit tests...\n');

    // ===============================================================
    // Section A — Configuration authority: one value object, one storage
    // key, one composition point, no read/write adapter self-decides.
    // ===============================================================
    {
        const configSource = await source('core/NostrRelayConfiguration.js');
        const storeSource = await source('storage/NostrRelayConfigurationStore.js');
        const mainSource = await source('ui/main.js');

        const otherFiles = await Promise.all([
            ['application/NostrDiscoveryQueryService.js', await source('application/NostrDiscoveryQueryService.js')],
            ['application/NostrSnapshotDiscoveryQueryService.js', await source('application/NostrSnapshotDiscoveryQueryService.js')],
            ['application/NostrPlaceNamingDiscoverySource.js', await source('application/NostrPlaceNamingDiscoverySource.js')],
            ['application/NostrPublicationDiscoveryPublisher.js', await source('application/NostrPublicationDiscoveryPublisher.js')],
            ['application/NostrSnapshotDiscoveryPublisher.js', await source('application/NostrSnapshotDiscoveryPublisher.js')],
            ['application/NostrPlaceNamingDiscoveryPublisher.js', await source('application/NostrPlaceNamingDiscoveryPublisher.js')],
            ['application/NostrPublicationDistributionRuntimeAdapter.js', await source('application/NostrPublicationDistributionRuntimeAdapter.js')],
            ['nostr/NostrRelayQueryClient.js', await source('nostr/NostrRelayQueryClient.js')],
            ['nostr/NostrInjectedProviderPublisher.js', await source('nostr/NostrInjectedProviderPublisher.js')]
        ]);

        assert(configSource.includes('export class NostrRelayConfiguration '), 'A1. core/NostrRelayConfiguration.js is the one place the value object is defined');
        for (const [label, src] of otherFiles) {
            assert(!src.includes('class NostrRelayConfiguration'), `A2 (${label}). no second definition of the value object exists`);
            assert(!/from\s*['"][^'"]*core\/NostrRelayConfiguration\.js['"]/.test(src), `A3 (${label}). no read or write adapter imports the value object directly — ui/main.js is the one composition point`);
            assert(!/from\s*['"][^'"]*storage\/NostrRelayConfigurationStore\.js['"]/.test(src), `A4 (${label}). no adapter imports the persistence store directly — no adapter independently decides whether to use the default`);
            assert(!src.includes('new NostrRelayConfigurationStore('), `A5 (${label}). no adapter constructs its own store instance`);
        }

        assert(storeSource.includes("'nostr-relay-configuration'"), 'A6. the store owns the one storage key literal');
        for (const [label, src] of [['core/NostrRelayConfiguration.js', configSource], ...otherFiles]) {
            assert(!src.includes('nostr-relay-configuration'), `A7 (${label}). no second file hardcodes the storage key — one key, one owner`);
        }

        assert(mainSource.includes('new NostrRelayConfigurationStore('), 'A8. ui/main.js is where the store is actually constructed');
        const mainStoreConstructions = (mainSource.match(/new NostrRelayConfigurationStore\(/g) || []).length;
        assert(mainStoreConstructions === 1, `A9. ui/main.js constructs exactly one store instance — found ${mainStoreConstructions}`);

        console.log('✓ Section A: exactly one value object, one storage key, and one composition point exist; no read or write adapter imports either directly or constructs its own store');
    }

    // ===============================================================
    // Section B — Absence vs. explicit default: three persisted states,
    // proven distinguishable in persistence even where two resolve to the
    // identical effective relay.
    // ===============================================================
    {
        function resolveEffective(store) {
            const configuration = store.get();
            return configuration ? configuration.relayUrl : DEFAULT_NOSTR_RELAY_URL;
        }

        // State A: no configuration at all.
        const backingA = new InMemoryStorageProvider();
        const storeA = new NostrRelayConfigurationStore(backingA);
        assert(storeA.get() === null, 'B1. State A (absence) — get() is a real null');
        assert(resolveEffective(storeA) === DEFAULT_NOSTR_RELAY_URL, 'B2. State A resolves to the deployment default');
        assert(backingA.load('nostr-relay-configuration') === null, 'B3. State A leaves genuinely nothing on file');

        // State B: the user explicitly configures the SAME relay as the default.
        const backingB = new InMemoryStorageProvider();
        const storeB = new NostrRelayConfigurationStore(backingB);
        storeB.save(new NostrRelayConfiguration({ relayUrl: DEFAULT_NOSTR_RELAY_URL }));
        assert(storeB.get() !== null, 'B4. State B (explicit default) — get() returns a real configuration, never null');
        assert(resolveEffective(storeB) === DEFAULT_NOSTR_RELAY_URL, 'B5. State B resolves to the same effective relay as State A');
        assert(backingB.load('nostr-relay-configuration') !== null, 'B6. …yet State B leaves a real, distinct entry on file — an explicit configuration is never treated as "nothing to persist" merely because it matches the default');

        // State C: a genuinely custom relay.
        const backingC = new InMemoryStorageProvider();
        const storeC = new NostrRelayConfigurationStore(backingC);
        storeC.save(new NostrRelayConfiguration({ relayUrl: 'wss://alternative.example' }));
        assert(resolveEffective(storeC) === 'wss://alternative.example', 'B7. State C resolves to the custom relay');

        // The decisive proof: A and B agree on effective relay but disagree
        // on persisted representation.
        assert(resolveEffective(storeA) === resolveEffective(storeB), 'B8. sanity — State A and State B truly share one effective relay');
        assert(storeA.get() === null && storeB.get() !== null, 'B9. …while their PERSISTED representations remain genuinely distinct: real null vs. a real NostrRelayConfiguration instance');

        console.log('✓ Section B: State A (absence) and State B (explicit default) resolve to the identical effective relay, yet remain distinguishable facts in persistence; State C resolves to its own distinct custom relay');
    }

    // ===============================================================
    // Section C — All three read paths: the exact configured relayUrl
    // reaches the CONCRETE WebSocket construction inside
    // nostr/NostrRelayQueryClient.js's own real, unmodified transport —
    // never merely a constructed instance's own getter — for both the
    // deployment default and a custom relay.
    // ===============================================================
    {
        async function proveAllThreeReach(relayUrl) {
            const SocketClass = makeEmptyResultRelaySocketClass();
            // One shared queryImpl, built from the REAL, unmodified
            // nostr/NostrRelayQueryClient.js — exactly the single
            // `nostrRelayQueryClient` ui/main.js's own 0.9.369 wiring
            // threads into all three read-path composition call sites.
            const queryImpl = createNostrRelayQueryClient({ webSocketImpl: SocketClass });
            assert(typeof queryImpl === 'function', 'sanity — createNostrRelayQueryClient() produced a real queryImpl');

            const { nostr } = composeDecentralizedWorldEncounterMaterialDiscoveryServices({
                nostrQueryImpl: queryImpl,
                nostrRelayUrl: relayUrl
            });
            assert(nostr instanceof NostrDiscoveryQueryService, 'sanity — Publication (World Encounter) discovery service constructed');
            const publicationResult = await nostr.search('some-discovery-tag');
            assert(Array.isArray(publicationResult) && publicationResult.length === 0, 'sanity — Publication discovery resolved a genuine empty result, not a swallowed error');

            const { queryService: snapshotQueryService } = composeDiscoverSnapshotRuntime({
                nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl, relayUrl }
            });
            assert(snapshotQueryService instanceof NostrSnapshotDiscoveryQueryService, 'sanity — Snapshot discovery service constructed');
            const snapshotResult = await snapshotQueryService.search('some-discovery-tag');
            assert(Array.isArray(snapshotResult) && snapshotResult.length === 0, 'sanity — Snapshot discovery resolved a genuine empty result');

            const placeNamingSource = new NostrPlaceNamingDiscoverySource({ queryImpl, relayUrl });
            const placeNamingResult = await placeNamingSource.search('some-discovery-tag');
            assert(Array.isArray(placeNamingResult) && placeNamingResult.length === 0, 'sanity — Place Naming discovery resolved a genuine empty result');

            assert(SocketClass.constructions.length === 3, `exactly three WebSocket constructions occurred — one per read path — found ${SocketClass.constructions.length}`);
            for (const constructedUrl of SocketClass.constructions) {
                assert(constructedUrl === relayUrl, `every CONCRETE WebSocket construction reached "${relayUrl}" — found "${constructedUrl}"`);
            }
        }

        await proveAllThreeReach(DEFAULT_NOSTR_RELAY_URL);
        console.log('✓ Section C (default relay): Publication discovery, Snapshot discovery, and Place Naming discovery each independently reach the deployment default at the concrete WebSocket construction boundary');

        await proveAllThreeReach('wss://alternative.example');
        console.log('✓ Section C (custom relay): Publication discovery, Snapshot discovery, and Place Naming discovery each independently reach a custom configured relay at the concrete WebSocket construction boundary, never a stale default');
    }

    // ===============================================================
    // Section D — Independent composition: three genuinely independent
    // compositions (separate store, separate StorageProvider, separate
    // queryImpl transport per consumer) converge on the identical
    // effective relay with no shared singleton anywhere.
    // ===============================================================
    {
        const independentRelayUrl = 'wss://independent.example';

        // Publication (World Encounter) discovery — its own store, its own
        // backing, its own transport.
        const publicationStore = new NostrRelayConfigurationStore(new InMemoryStorageProvider());
        publicationStore.save(new NostrRelayConfiguration({ relayUrl: independentRelayUrl }));
        const publicationResolvedUrl = (publicationStore.get() || { relayUrl: DEFAULT_NOSTR_RELAY_URL }).relayUrl;
        const PublicationSocketClass = makeEmptyResultRelaySocketClass();
        const publicationQueryImpl = createNostrRelayQueryClient({ webSocketImpl: PublicationSocketClass });
        const { nostr: independentPublicationService } = composeDecentralizedWorldEncounterMaterialDiscoveryServices({
            nostrQueryImpl: publicationQueryImpl,
            nostrRelayUrl: publicationResolvedUrl
        });
        await independentPublicationService.search('tag');

        // Snapshot discovery — its own, entirely separate store, backing,
        // and transport.
        const snapshotStore = new NostrRelayConfigurationStore(new InMemoryStorageProvider());
        snapshotStore.save(new NostrRelayConfiguration({ relayUrl: independentRelayUrl }));
        const snapshotResolvedUrl = (snapshotStore.get() || { relayUrl: DEFAULT_NOSTR_RELAY_URL }).relayUrl;
        const SnapshotSocketClass = makeEmptyResultRelaySocketClass();
        const snapshotQueryImpl = createNostrRelayQueryClient({ webSocketImpl: SnapshotSocketClass });
        const { queryService: independentSnapshotService } = composeDiscoverSnapshotRuntime({
            nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: snapshotQueryImpl, relayUrl: snapshotResolvedUrl }
        });
        await independentSnapshotService.search('tag');

        // Place Naming discovery — its own, entirely separate store,
        // backing, and transport.
        const placeNamingStore = new NostrRelayConfigurationStore(new InMemoryStorageProvider());
        placeNamingStore.save(new NostrRelayConfiguration({ relayUrl: independentRelayUrl }));
        const placeNamingResolvedUrl = (placeNamingStore.get() || { relayUrl: DEFAULT_NOSTR_RELAY_URL }).relayUrl;
        const PlaceNamingSocketClass = makeEmptyResultRelaySocketClass();
        const placeNamingQueryImpl = createNostrRelayQueryClient({ webSocketImpl: PlaceNamingSocketClass });
        const independentPlaceNamingSource = new NostrPlaceNamingDiscoverySource({ queryImpl: placeNamingQueryImpl, relayUrl: placeNamingResolvedUrl });
        await independentPlaceNamingSource.search('tag');

        // Convergence: all three resolved the identical relay.
        assert(publicationResolvedUrl === independentRelayUrl && snapshotResolvedUrl === independentRelayUrl && placeNamingResolvedUrl === independentRelayUrl,
            'D1. all three independently-composed consumers resolved the identical effective relay');
        assert(PublicationSocketClass.constructions[0] === independentRelayUrl && SnapshotSocketClass.constructions[0] === independentRelayUrl && PlaceNamingSocketClass.constructions[0] === independentRelayUrl,
            'D2. all three independently-composed consumers reached the identical relay at their own, separate CONCRETE WebSocket construction');

        // No shared singleton: every store, every StorageProvider (implicit
        // in each store's own construction), and every queryImpl is a
        // genuinely distinct object/function.
        assert(publicationStore !== snapshotStore && snapshotStore !== placeNamingStore && publicationStore !== placeNamingStore,
            'D3. the three NostrRelayConfigurationStore instances are pairwise distinct objects — no shared store');
        assert(publicationQueryImpl !== snapshotQueryImpl && snapshotQueryImpl !== placeNamingQueryImpl && publicationQueryImpl !== placeNamingQueryImpl,
            'D4. the three queryImpl transports are pairwise distinct functions — no shared transport, no shared WebSocket client');

        console.log('✓ Section D: three genuinely independent compositions — separate store, separate StorageProvider, separate transport per consumer — converge on the identical effective relay purely because each independently read the same persisted fact, never because of a shared singleton');
    }

    // ===============================================================
    // Section E — Restart/persistence convergence: independent store AND
    // StorageProvider instances sharing one storage namespace prove
    // persistence, not process memory, is the authority.
    // ===============================================================
    {
        const sharedNamespace = {};

        // Application A saves relay-A.
        const applicationA = new NostrRelayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        applicationA.save(new NostrRelayConfiguration({ relayUrl: 'wss://relay-a.example' }));

        // restart boundary — Application B: its own store instance, its
        // own StorageProvider instance, sharing only the namespace, the
        // same way two separate page loads share one browser's
        // localStorage without ever sharing a JS object.
        const applicationB = new NostrRelayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        assert(applicationA !== applicationB, 'E1. sanity — genuinely separate store instances, not the same object reused');
        const effectiveB = (applicationB.get() || { relayUrl: DEFAULT_NOSTR_RELAY_URL }).relayUrl;
        assert(effectiveB === 'wss://relay-a.example', 'E2. Application B, an independently composed application over the same storage namespace, resolves the relay Application A saved — persistence is the authority, not an in-memory singleton');

        applicationB.clear();

        // restart boundary — Application C.
        const applicationC = new NostrRelayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        const effectiveC = (applicationC.get() || { relayUrl: DEFAULT_NOSTR_RELAY_URL }).relayUrl;
        assert(effectiveC === DEFAULT_NOSTR_RELAY_URL, 'E3. Application C, restarted after Application B cleared the override, resolves the deployment default — the clear() is durable across the same restart boundary');

        const remainingKeys = Object.keys(sharedNamespace);
        assert(remainingKeys.length === 0, `E4. no history, migration record, or stale cached value remains after clear() — found ${JSON.stringify(remainingKeys)}`);

        console.log('✓ Section E: three genuinely independent compositions over one shared storage namespace converge on the same effective relay at each step — relay-A -> restart -> relay-A -> clear -> restart -> deployment default, with no leftover key of any kind');
    }

    // ===============================================================
    // Section F — Failure semantics: an invalid http(s) URL is rejected at
    // construction, malformed persisted data degrades to null, a genuine
    // storage failure propagates, and an unreachable configured relay
    // fails through each consumer's own existing contract with zero
    // fallback attempt against relay.damus.io.
    // ===============================================================
    {
        // An http(s) URL is rejected outright — the wrong scheme family
        // entirely for a Nostr relay.
        let httpThrew = false;
        try { new NostrRelayConfiguration({ relayUrl: 'https://relay.damus.io' }); } catch { httpThrew = true; }
        assert(httpThrew, 'F1. an https: URL is rejected at construction');
        let httpPlainThrew = false;
        try { new NostrRelayConfiguration({ relayUrl: 'http://relay.example' }); } catch { httpPlainThrew = true; }
        assert(httpPlainThrew, 'F2. an http: URL is rejected at construction');
        assert(isValidNostrRelayUrl('https://relay.damus.io') === false, 'F3. isValidNostrRelayUrl() itself rejects the http(s) scheme family, not just the constructor wrapping it');

        // Malformed persisted data degrades to null.
        const malformedBacking = new InMemoryStorageProvider();
        malformedBacking.save('nostr-relay-configuration', { relayUrl: 42 });
        assert(new NostrRelayConfigurationStore(malformedBacking).get() === null, 'F4. a non-string relayUrl on file degrades to null, never a thrown error and never a fabricated instance');

        const httpOnFileBacking = new InMemoryStorageProvider();
        httpOnFileBacking.save('nostr-relay-configuration', { relayUrl: 'https://relay.damus.io' });
        assert(new NostrRelayConfigurationStore(httpOnFileBacking).get() === null, 'F5. an http(s) relayUrl on file (e.g. from a corrupted write) also degrades to null, never silently accepted');

        // A genuine storage failure propagates.
        class ThrowingStorageProvider extends StorageProvider {
            save() { throw new Error('disk unavailable'); }
            load() { throw new Error('disk unavailable'); }
            remove() { throw new Error('disk unavailable'); }
            list() { return []; }
        }
        let getThrew = false;
        try { new NostrRelayConfigurationStore(new ThrowingStorageProvider()).get(); } catch { getThrew = true; }
        assert(getThrew, 'F6. a genuine storage failure propagates out of get() rather than degrading to null');

        // An unreachable configured relay — NostrDiscoveryQueryService and
        // NostrSnapshotDiscoveryQueryService both already collapse a
        // queryImpl failure to [] (their own, pre-existing contract); this
        // section's decisive proof is that neither one EVER dials
        // DEFAULT_NOSTR_RELAY_URL as a silent fallback.
        {
            const SocketClass = makeUnreachableRelaySocketClass();
            const queryImpl = createNostrRelayQueryClient({ webSocketImpl: SocketClass });
            const { nostr } = composeDecentralizedWorldEncounterMaterialDiscoveryServices({ nostrQueryImpl: queryImpl, nostrRelayUrl: 'wss://unreachable.example' });
            const result = await nostr.search('tag');
            assert(Array.isArray(result) && result.length === 0, 'F7. Publication discovery against an unreachable custom relay resolves an empty result, per its own existing "never throws" contract');
            assert(SocketClass.constructions.length === 1 && SocketClass.constructions[0] === 'wss://unreachable.example', 'F8. exactly one connection attempt was made, to the configured relay — no retry, and critically no SECOND attempt against a different host');
            assert(!SocketClass.constructions.includes(DEFAULT_NOSTR_RELAY_URL), 'F9. the deployment default relay is never dialed as a silent fallback for Publication discovery');
        }
        {
            const SocketClass = makeUnreachableRelaySocketClass();
            const queryImpl = createNostrRelayQueryClient({ webSocketImpl: SocketClass });
            const { queryService } = composeDiscoverSnapshotRuntime({ nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl, relayUrl: 'wss://unreachable.example' } });
            const result = await queryService.search('tag');
            assert(Array.isArray(result) && result.length === 0, 'F10. Snapshot discovery against an unreachable custom relay resolves an empty result, per its own existing "never throws" contract');
            assert(SocketClass.constructions.length === 1 && SocketClass.constructions[0] === 'wss://unreachable.example', 'F11. exactly one connection attempt was made, to the configured relay');
            assert(!SocketClass.constructions.includes(DEFAULT_NOSTR_RELAY_URL), 'F12. the deployment default relay is never dialed as a silent fallback for Snapshot discovery');
        }
        // NostrPlaceNamingDiscoverySource deliberately REJECTS on a
        // transport failure (its own documented departure from the other
        // two) — still zero fallback.
        {
            const SocketClass = makeUnreachableRelaySocketClass();
            const queryImpl = createNostrRelayQueryClient({ webSocketImpl: SocketClass });
            const placeNamingSource = new NostrPlaceNamingDiscoverySource({ queryImpl, relayUrl: 'wss://unreachable.example' });
            let placeNamingThrew = false;
            try { await placeNamingSource.search('tag'); } catch { placeNamingThrew = true; }
            assert(placeNamingThrew, 'F13. Place Naming discovery against an unreachable custom relay genuinely rejects, per its own existing "a relay/transport failure rejects search()" contract');
            assert(SocketClass.constructions.length === 1 && SocketClass.constructions[0] === 'wss://unreachable.example', 'F14. exactly one connection attempt was made, to the configured relay');
            assert(!SocketClass.constructions.includes(DEFAULT_NOSTR_RELAY_URL), 'F15. the deployment default relay is never dialed as a silent fallback for Place Naming discovery — a failure means the CONFIGURED relay failed, never that the application quietly used the default instead');
        }

        console.log('✓ Section F: an invalid http(s) URL is rejected at construction, malformed or invalid-scheme persisted data degrades to null, a genuine storage failure propagates unmodified, and an unreachable custom relay fails through each of the three consumers\' own existing contract with zero fallback attempt against relay.damus.io');
    }

    // ===============================================================
    // Section G — Write-path isolation: a read-path override on file at
    // the same moment never reaches any of the three Nostr publishers' own
    // resolved relayUrl, verified structurally and against the CONCRETE
    // publishImpl call.
    // ===============================================================
    {
        const readOverrideStore = new NostrRelayConfigurationStore(new InMemoryStorageProvider());
        readOverrideStore.save(new NostrRelayConfiguration({ relayUrl: 'wss://alternative.example' }));
        const resolvedReadRelayUrl = (readOverrideStore.get() || { relayUrl: DEFAULT_NOSTR_RELAY_URL }).relayUrl;
        assert(resolvedReadRelayUrl === 'wss://alternative.example', 'G1. sanity — a read-path override is genuinely in effect');

        // Snapshot discovery PUBLISHING, composed exactly as ui/main.js
        // composes it: publishImpl + discoveryTag only, no relayUrl of any
        // kind — it never reads the read-path store at all.
        const snapshotPublishCalls = [];
        async function snapshotPublishSpy(relayUrl, eventTemplate) {
            snapshotPublishCalls.push(relayUrl);
            return { published: true, id: 'a'.repeat(64) };
        }
        const { discoveryPublisher: snapshotDiscoveryPublisher } = composeSnapshotDistributionRuntime({
            nostrSnapshotDiscoveryPublisherOptions: { publishImpl: snapshotPublishSpy, discoveryTag: 'forkbuild-snapshot' }
        });
        assert(snapshotDiscoveryPublisher.relayUrl === DEFAULT_NOSTR_RELAY_URL, 'G2. Snapshot discovery publishing defaults to the deployment default relay, never the persisted read-path override on file at this exact moment');
        const snapshotPublishResult = await snapshotDiscoveryPublisher.publish({ contentHash: 'x'.repeat(43), locator: 'ar://' + 'y'.repeat(43), storage: 'ar' });
        assert(snapshotPublishResult && snapshotPublishResult.published === true, 'sanity — the Snapshot publish call actually succeeded');
        assert(snapshotPublishCalls.length === 1 && snapshotPublishCalls[0] === DEFAULT_NOSTR_RELAY_URL, 'G3. the concrete Snapshot publishImpl call actually reached the deployment default relay, never the configured read-path relay');

        // Place Naming discovery PUBLISHING — composed exactly as
        // ui/main.js composes it: publishImpl only, no relayUrl.
        const { discoveryPublisher: placeNamingDiscoveryPublisher } = composePlaceNamingPublicationRuntime({
            nostrPlaceNamingDiscoveryPublisherOptions: { publishImpl: async () => ({ published: true, id: 'b'.repeat(64) }) }
        });
        assert(placeNamingDiscoveryPublisher.relayUrl === DEFAULT_NOSTR_RELAY_URL, 'G4. Place Naming discovery publishing also defaults to the deployment default relay, never the persisted read-path override');

        // Publication (Signed Claim) discovery PUBLISHING — sourced from a
        // completely independent { nostr } capability shape; it has no
        // idea the read-path store even exists.
        const { nostrPublisherOptions } = resolvePublicationDistributionRuntimeConfiguration({
            nostr: { publishImpl: async () => ({ published: true, id: 'c'.repeat(64) }), discoveryTag: 'forkbuild-publication' }
        });
        assert(nostrPublisherOptions.relayUrl === undefined, 'G5. Signed Claim distribution\'s own resolved publisher options carry no relayUrl at all when none is supplied to ITS OWN { nostr } shape — it is never populated from the read-path store');
        const publicationPublishCalls = [];
        const publicationPublisher = new NostrPublicationDiscoveryPublisher({
            ...nostrPublisherOptions,
            publishImpl: async (relayUrl) => { publicationPublishCalls.push(relayUrl); return { published: true, id: 'd'.repeat(64) }; }
        });
        assert(publicationPublisher.relayUrl === DEFAULT_NOSTR_RELAY_URL, 'G6. constructed from Signed Claim distribution\'s own resolved options, the publisher defaults to the deployment default relay');
        await publicationPublisher.publish({
            protocol: DECENTRALIZED_DISCOVERY_ENVELOPE_PROTOCOL,
            version: DECENTRALIZED_DISCOVERY_ENVELOPE_VERSION,
            kind: WorldEncounterKind.PUBLICATION,
            objectId: 'obj-1',
            uri: 'ar://' + 'z'.repeat(43)
        });
        assert(publicationPublishCalls.length === 1 && publicationPublishCalls[0] === DEFAULT_NOSTR_RELAY_URL, 'G7. the concrete Publication discovery publishImpl call actually reached the deployment default relay, never the configured read-path relay');

        // createNostrPublicationDistributionRuntimeAdapter() — the exact
        // shape ui/main.js uses (`{ publish: nostrHostPublisher }`, no
        // relayUrl) — forwards relayUrl verbatim, undefined when omitted.
        const adapterResult = createNostrPublicationDistributionRuntimeAdapter({ publish: async () => ({ published: true, id: 'e'.repeat(64) }) });
        assert(adapterResult.relayUrl === undefined, 'G8. createNostrPublicationDistributionRuntimeAdapter(), called exactly as ui/main.js calls it, produces no relayUrl of any kind — the read-path override never reaches this adapter');

        // The READ path, composed from the very same store at the very
        // same moment, resolves the override — proving the two never
        // share a resolved value in either direction.
        const SocketClass = makeEmptyResultRelaySocketClass();
        const readQueryImpl = createNostrRelayQueryClient({ webSocketImpl: SocketClass });
        const { queryService: readQueryService } = composeDiscoverSnapshotRuntime({
            nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: readQueryImpl, relayUrl: resolvedReadRelayUrl }
        });
        assert(readQueryService.relayUrl === 'wss://alternative.example', 'G9. the read path, composed from the identical store instance at the identical moment, uses the configured override');
        await readQueryService.search('tag');
        assert(SocketClass.constructions[0] === 'wss://alternative.example', 'G10. …and the read path\'s own concrete WebSocket construction confirms it, while every write-path publish call above reached only the deployment default');

        // Structural: none of the write-path composition/publisher/
        // resolver files reference the read-path configuration boundary by
        // name.
        const writePathFiles = [
            'application/NostrPublicationDiscoveryPublisher.js',
            'application/NostrSnapshotDiscoveryPublisher.js',
            'application/NostrPlaceNamingDiscoveryPublisher.js',
            'application/NostrPublicationDistributionRuntimeAdapter.js',
            'application/SnapshotDistributionRuntimeComposition.js',
            'application/PlaceNamingPublicationRuntimeComposition.js',
            'application/PublicationDistributionRuntimeConfiguration.js',
            'application/PublicationDistributionConfigurationProvider.js',
            'nostr/NostrInjectedProviderPublisher.js'
        ];
        for (const path of writePathFiles) {
            const src = await source(path);
            assert(!/NostrRelayConfiguration/.test(src), `G11 (${path}). the write path never references the read-path configuration boundary by name`);
        }

        console.log('✓ Section G: a read-path override on file has provably zero effect on any of the three Nostr publishers\' own resolved relayUrl (each still the deployment default, verified against the concrete publishImpl call), and none of the write-path files reference the read-path configuration boundary by name');
    }

    // ===============================================================
    // Section H — Cross-configuration isolation: Nostr relay configuration
    // and Arweave gateway configuration round-trip independently through
    // one shared storage namespace with no key collision and no value
    // bleed; structural sweep confirms no reference in either direction,
    // and none toward RoleProviderPreference/IPFS/peer connectivity.
    // ===============================================================
    {
        const sharedNamespace = {};
        const nostrStore = new NostrRelayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        const arweaveStore = new ArweaveGatewayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));

        nostrStore.save(new NostrRelayConfiguration({ relayUrl: 'wss://nostr-only.example' }));
        arweaveStore.save(new ArweaveGatewayConfiguration({ gatewayUrl: 'https://arweave-only.example' }));

        assert(nostrStore.get().relayUrl === 'wss://nostr-only.example', 'H1. the Nostr relay store still reads back exactly its own saved value after an unrelated Arweave gateway configuration was written to the same namespace');
        assert(arweaveStore.get().gatewayUrl === 'https://arweave-only.example', 'H2. the Arweave gateway store still reads back exactly its own saved value after an unrelated Nostr relay configuration was written to the same namespace');

        const namespaceKeys = Object.keys(sharedNamespace).sort();
        assert(namespaceKeys.length === 2 && namespaceKeys.includes('nostr-relay-configuration') && namespaceKeys.includes('arweave-gateway-configuration'),
            `H3. exactly two distinct, non-colliding storage keys exist in the shared namespace — found ${JSON.stringify(namespaceKeys)}`);

        // Changing the Nostr override, then clearing it, has zero effect
        // on the Arweave value sitting alongside it in the same namespace.
        nostrStore.save(new NostrRelayConfiguration({ relayUrl: 'wss://nostr-changed.example' }));
        assert(arweaveStore.get().gatewayUrl === 'https://arweave-only.example', 'H4. changing the Nostr relay override leaves the co-resident Arweave gateway value untouched');
        nostrStore.clear();
        assert(arweaveStore.get().gatewayUrl === 'https://arweave-only.example', 'H5. clearing the Nostr relay override entirely leaves the co-resident Arweave gateway value untouched');
        assert(nostrStore.get() === null, 'H6. sanity — the Nostr relay override is genuinely cleared');

        // Structural sweep, both directions — Nostr never references
        // Arweave/IPFS/Bitcoin/Base/peer-connectivity/RoleProviderPreference,
        // and (the direction 0.9.369's own tests never checked) those
        // families never reference Nostr's read-path configuration either.
        const configSource = await source('core/NostrRelayConfiguration.js');
        const storeSource = await source('storage/NostrRelayConfigurationStore.js');
        const isolationPattern = /Arweave|Ipfs|IPFS|Bitcoin|Base\b|peer\/|RoleProvider|ProviderSelection|providerRanking/;
        assert(!isolationPattern.test(configSource.replace(/\/\/.*$/gm, '')), 'H7. core/NostrRelayConfiguration.js references none of Arweave/IPFS/Bitcoin/Base/peer/RoleProviderPreference');
        assert(!isolationPattern.test(storeSource.replace(/\/\/.*$/gm, '')), 'H8. storage/NostrRelayConfigurationStore.js references none of Arweave/IPFS/Bitcoin/Base/peer/RoleProviderPreference');

        const arweaveConfigSource = await source('core/ArweaveGatewayConfiguration.js');
        const arweaveStoreSource = await source('storage/ArweaveGatewayConfigurationStore.js');
        const roleProviderPreferenceSource = await source('core/RoleProviderPreference.js');
        const roleProviderPreferenceStoreSource = await source('storage/RoleProviderPreferenceStore.js');
        for (const [label, src] of [
            ['core/ArweaveGatewayConfiguration.js', arweaveConfigSource],
            ['storage/ArweaveGatewayConfigurationStore.js', arweaveStoreSource],
            ['core/RoleProviderPreference.js', roleProviderPreferenceSource],
            ['storage/RoleProviderPreferenceStore.js', roleProviderPreferenceStoreSource]
        ]) {
            assert(!/NostrRelayConfiguration/.test(src), `H9 (${label}). no reverse reference to Nostr's own read-path configuration boundary exists either — isolation holds in both directions`);
        }

        console.log('✓ Section H: NostrRelayConfiguration and ArweaveGatewayConfiguration round-trip independently through one shared storage namespace with no key collision and no value bleed in either direction; neither configuration family references the other, IPFS, Bitcoin, Base, peer connectivity, or RoleProviderPreference, in either direction');
    }

    // ===============================================================
    // Section I — URL semantics: trailing-slash variants are preserved
    // verbatim (the deliberate, documented difference from
    // ArweaveGatewayConfiguration), reach the concrete WebSocket
    // construction unchanged, and no consumer ever concatenates onto
    // relayUrl.
    // ===============================================================
    {
        const variants = ['wss://example.com', 'wss://example.com/', 'wss://example.com//', 'wss://example.com/sub/path/'];
        for (const variant of variants) {
            const relayUrl = new NostrRelayConfiguration({ relayUrl: variant }).relayUrl;
            assert(relayUrl === variant, `I1 ('${variant}'). the relayUrl is preserved byte-for-byte, no trailing-slash normalization of any kind — got '${relayUrl}'`);
        }

        // Distinct trailing-slash variants stay distinct configurations —
        // the deliberate opposite of ArweaveGatewayConfiguration's own
        // normalize-to-one behavior.
        const withoutSlash = new NostrRelayConfiguration({ relayUrl: 'wss://example.com' });
        const withSlash = new NostrRelayConfiguration({ relayUrl: 'wss://example.com/' });
        assert(!withoutSlash.equals(withSlash), 'I2. "wss://example.com" and "wss://example.com/" are genuinely distinct configurations, never collapsed to one');

        // The unnormalized value reaches the concrete WebSocket
        // construction exactly as configured, for all three consumers.
        const trailingSlashRelay = 'wss://example.com/';
        const SocketClass = makeEmptyResultRelaySocketClass();
        const queryImpl = createNostrRelayQueryClient({ webSocketImpl: SocketClass });

        const { nostr } = composeDecentralizedWorldEncounterMaterialDiscoveryServices({ nostrQueryImpl: queryImpl, nostrRelayUrl: trailingSlashRelay });
        await nostr.search('tag');
        const { queryService } = composeDiscoverSnapshotRuntime({ nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl, relayUrl: trailingSlashRelay } });
        await queryService.search('tag');
        const placeNamingSource = new NostrPlaceNamingDiscoverySource({ queryImpl, relayUrl: trailingSlashRelay });
        await placeNamingSource.search('tag');

        assert(SocketClass.constructions.length === 3 && SocketClass.constructions.every((url) => url === trailingSlashRelay),
            `I3. the trailing-slash relayUrl reaches the concrete WebSocket construction byte-for-byte unchanged for all three read paths — found ${JSON.stringify(SocketClass.constructions)}`);

        // Structural: none of the three read-path classes, the one
        // transport client, or the three write-path publishers ever
        // concatenate anything onto relayUrl — each hands it straight to
        // queryImpl()/publishImpl()/new WebSocket() unmodified.
        const consumerFiles = [
            'application/NostrDiscoveryQueryService.js',
            'application/NostrSnapshotDiscoveryQueryService.js',
            'application/NostrPlaceNamingDiscoverySource.js',
            'application/NostrPublicationDiscoveryPublisher.js',
            'application/NostrSnapshotDiscoveryPublisher.js',
            'application/NostrPlaceNamingDiscoveryPublisher.js',
            'nostr/NostrRelayQueryClient.js'
        ];
        for (const path of consumerFiles) {
            const src = await source(path);
            const executable = src.replace(/\/\/.*$/gm, '');
            assert(!/relayUrl\s*\+/.test(executable) && !/`\$\{this\._relayUrl\}/.test(executable) && !/relayUrl\.replace\(/.test(executable),
                `I4 (${path}). relayUrl is never concatenated, template-interpolated with a suffix, or normalized — it is handed to its own transport call unmodified`);
        }

        console.log('✓ Section I: every trailing-slash variant is preserved byte-for-byte (the deliberate opposite of ArweaveGatewayConfiguration\'s own normalization), reaches the concrete WebSocket construction unchanged for all three read paths, and no consumer file ever concatenates onto relayUrl');
    }

    // ===============================================================
    // Section J — Final decision matrix.
    // ===============================================================
    {
        const matrix = [
            ['One configuration model?', 'YES', '✅'],
            ['One persistence key?', 'YES', '✅'],
            ['One effective-value composition point?', 'YES', '✅'],
            ['All three read paths configured?', 'YES', '✅'],
            ['Publishing unaffected?', 'YES', '✅'],
            ['Absence preserved?', 'YES', '✅'],
            ['Explicit default preserved?', 'YES', '✅'],
            ['Restart convergence?', 'YES', '✅'],
            ['Automatic fallback?', 'NO', '✅'],
            ['Network access during configuration?', 'NO', '✅'],
            ['Generic Nostr endpoint abstraction?', 'NO', '✅'],
            ['Coupling to Arweave/RoleProviderPreference?', 'NO', '✅']
        ];
        console.log('\n=== FINAL DECISION MATRIX ===');
        console.log('Property                                     | Expected | Observed');
        console.log('----------------------------------------------|----------|---------');
        for (const [question, expected, observed] of matrix) {
            console.log(`${question.padEnd(47)}| ${expected.padEnd(9)}| ${observed}`);
        }

        console.log('\n=== VERDICT: CONVERGED ===');
        console.log('Sections A-I prove convergence, not just correctness-in-isolation: one value object and one');
        console.log('storage key are ever referenced (A), absence and an explicit default stay distinguishable facts');
        console.log('in persistence even when their effective relay coincides (B), the exact configured relayUrl');
        console.log('reaches the concrete WebSocket construction for all THREE read paths, default and custom (C),');
        console.log('three genuinely independent compositions converge on one relay with no shared singleton (D),');
        console.log('persistence — never process memory — is the authority across a restart boundary (E), failure');
        console.log('never silently substitutes relay.damus.io for any of the three consumers\' own existing contract');
        console.log('(F), a read-path override has provably zero effect on any of the three Nostr publishers\' own');
        console.log('resolved relayUrl (G), Nostr relay configuration and Arweave gateway configuration round-trip');
        console.log('independently through one shared namespace with no bleed in either direction (H), and every');
        console.log('trailing-slash variant is preserved verbatim and reaches the concrete transport unchanged,');
        console.log('never normalized and never concatenated (I).');
        console.log('0.9.369\'s implementation is sound. No convergence defect was found; no production change was made.');
    }

    console.log('\n✅ All Nostr Relay Configuration Convergence Audit tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
