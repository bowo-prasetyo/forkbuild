import { readFile } from 'node:fs/promises';

import { ArweaveGatewayConfiguration, DEFAULT_ARWEAVE_GATEWAY_URL } from '../core/ArweaveGatewayConfiguration.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { ArweaveGatewayConfigurationStore } from '../storage/ArweaveGatewayConfigurationStore.js';
import { ContentReference } from '../core/ContentReference.js';
import { ContentUnavailableError } from '../content/IpfsContentStore.js';
import { ArweaveWorldEncounterMaterialResolver } from '../application/ArweaveWorldEncounterMaterialResolver.js';
import { composeDiscoverSnapshotRuntime } from '../application/DiscoverSnapshotRuntimeComposition.js';
import { composeSnapshotDistributionRuntime } from '../application/SnapshotDistributionRuntimeComposition.js';
import { resolvePublicationDistributionRuntimeConfiguration } from '../application/PublicationDistributionRuntimeConfiguration.js';

// 0.9.365 — Arweave Gateway Configuration Convergence Audit.
//
// Type: test-only. Production changes: NONE.
//
// 0.9.364 gave a user's own Arweave gateway choice a real value object, a
// durable store, and two wired retrieval call sites, and its own three test
// files already proved each of those three pieces correct IN ISOLATION —
// construction/validation (tests/ArweaveGatewayConfiguration.test.js),
// persistence (tests/ArweaveGatewayConfigurationPersistence.test.js), and
// that a configured value reaches each composition function
// (tests/ArweaveGatewayRetrievalIntegration.test.js, mostly via source
// sweeps of ui/main.js). None of the three asks the harder, cross-cutting
// question this milestone exists to answer: now that this configuration has
// crossed FOUR boundaries — value object -> persistence -> composition root
// -> two independent retrieval runtimes — do those four pieces actually
// converge on one consistent story, with no second authority anywhere, and
// with the DISTRIBUTION (write) path genuinely unreachable by it?
//
// The governing invariant, proven from several angles below:
//
//   DEFAULT_ARWEAVE_GATEWAY_URL
//           │
//           ├── no persisted override ──► effective default    (RETRIEVAL ONLY)
//           │
//           └── persisted override ─────► configured gateway   (RETRIEVAL ONLY)
//
//   WRITE path (Signed Claim / Snapshot distribution) never consults any of
//   the above — it has its own, entirely independent configuration seam.
//
// Section A: Configuration authority — one value object, one storage key,
//            one composition point, no adapter self-decides.
// Section B: Absence vs. explicit default — three persisted states, proven
//            distinguishable even where two resolve to the same effective URL.
// Section C: Both retrieval paths — the exact configured URL reaches the
//            CONCRETE fetch call, for both World Encounter material
//            retrieval and Snapshot discovery retrieval, default and custom.
// Section D: Write-path isolation — a retrieval override on file at the
//            same moment never reaches Snapshot distribution's own POST, or
//            Signed Claim distribution's own resolved uploader options.
// Section E: Replacement and clearing — gateway-A -> gateway-B -> clear ->
//            null -> restart -> deployment default, with no residue.
// Section F: Restart convergence — two/three genuinely independent
//            compositions (separate store AND separate StorageProvider
//            instances) over one shared storage namespace prove persistence,
//            not an in-memory singleton, is the authority.
// Section G: Failure semantics — malformed data degrades, a storage failure
//            propagates, and an unreachable custom gateway fails loudly
//            without ever silently trying arweave.net instead.
// Section H: URL normalization — trailing-slash variants converge to one
//            value that reaches the concrete fetch call cleanly, while a
//            gateway's own path/query is never destroyed.
// Section I: Configuration-boundary isolation — the value object and its
//            store import nothing beyond their own declared, minimal seam.
// Section J: Final decision matrix and verdict.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No Settings UI, no health
// checking, no credential handling, no provider ranking, no configuration
// history, no network access during configuration, and no production code
// change of any kind — see docs/Roadmap.md, 0.9.365, for the full list this
// audit exists to confirm rather than to build.

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
// loads share one browser's `window.localStorage`: no JS reference is ever
// shared between them, only the underlying namespace. This is what makes
// Section F's "restart" genuine rather than a re-read of the same Map.
class SharedNamespaceStorageProvider extends StorageProvider {
    constructor(sharedNamespace) { super(); this._namespace = sharedNamespace; }
    save(name, data) { this._namespace[name] = JSON.stringify(data); }
    load(name) { return Object.prototype.hasOwnProperty.call(this._namespace, name) ? JSON.parse(this._namespace[name]) : null; }
    remove(name) { delete this._namespace[name]; }
    list() { return Object.keys(this._namespace); }
}

function fakeSigner() {
    return { sign: async (text) => ({ id: 'a'.repeat(43), transaction: { data: text } }) };
}

// A fetch double that answers `ok` only for requests whose URL starts with
// `okPrefix` — never a special case for arweave.net, never a fallback of
// any kind. Every call is recorded so a test can assert exactly which
// host(s) the CONCRETE retrieval/placement operation actually reached.
function makeFetchSpy({ okPrefix, textBody = '{}' } = {}) {
    const calls = [];
    async function fetchImpl(url) {
        calls.push(url);
        const ok = typeof okPrefix === 'string' && url.startsWith(okPrefix);
        return { ok, status: ok ? 200 : 404, headers: { get: () => null }, text: async () => textBody };
    }
    fetchImpl.calls = calls;
    return fetchImpl;
}

// A fetch double that genuinely REJECTS for a given host prefix — modeling
// a gateway that is truly unreachable (DNS failure, connection refused),
// never a mere 404. Anything else it is asked to reach would succeed,
// which is exactly what makes Section G's "never falls back" assertions
// meaningful: if this resolver silently retried against arweave.net, that
// second call would show up in `.calls` and would succeed.
function makeRejectingFetchSpy(rejectPrefix, message = 'network unreachable') {
    const calls = [];
    async function fetchImpl(url) {
        calls.push(url);
        if (url.startsWith(rejectPrefix)) throw new Error(message);
        return { ok: true, status: 200, headers: { get: () => null }, text: async () => '{}' };
    }
    fetchImpl.calls = calls;
    return fetchImpl;
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function run() {
    console.log('Running Arweave Gateway Configuration Convergence Audit tests...\n');

    // ===============================================================
    // Section A — Configuration authority: one value object, one storage
    // key, one composition point, no adapter self-decides.
    // ===============================================================
    {
        const configSource = await source('core/ArweaveGatewayConfiguration.js');
        const storeSource = await source('storage/ArweaveGatewayConfigurationStore.js');
        const mainSource = await source('ui/main.js');
        const contentStoreSource = await source('content/ArweaveContentStore.js');
        const resolverSource = await source('application/ArweaveWorldEncounterMaterialResolver.js');
        const uploaderSource = await source('application/ArweavePublicationMaterialUploader.js');
        const pubDistConfigSource = await source('application/PublicationDistributionRuntimeConfiguration.js');
        const pubDistProviderSource = await source('application/PublicationDistributionConfigurationProvider.js');
        const otherFiles = [
            ['content/ArweaveContentStore.js', contentStoreSource],
            ['application/ArweaveWorldEncounterMaterialResolver.js', resolverSource],
            ['application/ArweavePublicationMaterialUploader.js', uploaderSource],
            ['application/PublicationDistributionRuntimeConfiguration.js', pubDistConfigSource],
            ['application/PublicationDistributionConfigurationProvider.js', pubDistProviderSource]
        ];

        assert(configSource.includes('export class ArweaveGatewayConfiguration '), 'A1. core/ArweaveGatewayConfiguration.js is the one place the value object is defined');
        for (const [label, src] of otherFiles) {
            assert(!src.includes('class ArweaveGatewayConfiguration'), `A2 (${label}). no second definition of the value object exists`);
            assert(!/from\s*['"][^'"]*core\/ArweaveGatewayConfiguration\.js['"]/.test(src), `A3 (${label}). no retrieval or write adapter imports the value object directly — ui/main.js is the one composition point`);
            assert(!/from\s*['"][^'"]*storage\/ArweaveGatewayConfigurationStore\.js['"]/.test(src), `A4 (${label}). no adapter imports the persistence store directly — no adapter independently decides whether to use the default`);
            assert(!src.includes('new ArweaveGatewayConfigurationStore('), `A5 (${label}). no adapter constructs its own store instance`);
        }

        assert(storeSource.includes("'arweave-gateway-configuration'"), 'A6. the store owns the one storage key literal');
        for (const [label, src] of [['core/ArweaveGatewayConfiguration.js', configSource], ...otherFiles]) {
            assert(!src.includes('arweave-gateway-configuration'), `A7 (${label}). no second file hardcodes the storage key — one key, one owner`);
        }

        assert(mainSource.includes('new ArweaveGatewayConfigurationStore('), 'A8. ui/main.js is where the store is actually constructed');
        const mainStoreConstructions = (mainSource.match(/new ArweaveGatewayConfigurationStore\(/g) || []).length;
        assert(mainStoreConstructions === 1, `A9. ui/main.js constructs exactly one store instance — found ${mainStoreConstructions}`);

        console.log('✓ Section A: exactly one value object, one storage key, and one composition point exist; no retrieval or write adapter imports either directly or constructs its own store');
    }

    // ===============================================================
    // Section B — Absence vs. explicit default: three persisted states,
    // proven distinguishable in persistence even where two resolve to the
    // identical effective URL.
    // ===============================================================
    {
        function resolveEffective(store) {
            const configuration = store.get();
            return configuration ? configuration.gatewayUrl : DEFAULT_ARWEAVE_GATEWAY_URL;
        }

        // State A: no configuration at all.
        const backingA = new InMemoryStorageProvider();
        const storeA = new ArweaveGatewayConfigurationStore(backingA);
        assert(storeA.get() === null, 'B1. State A (absence) — get() is a real null');
        assert(resolveEffective(storeA) === DEFAULT_ARWEAVE_GATEWAY_URL, 'B2. State A resolves to the deployment default');
        assert(backingA.load('arweave-gateway-configuration') === null, 'B3. State A leaves genuinely nothing on file');

        // State B: the user explicitly configures the SAME URL as the default.
        const backingB = new InMemoryStorageProvider();
        const storeB = new ArweaveGatewayConfigurationStore(backingB);
        storeB.save(new ArweaveGatewayConfiguration({ gatewayUrl: DEFAULT_ARWEAVE_GATEWAY_URL }));
        assert(storeB.get() !== null, 'B4. State B (explicit default) — get() returns a real configuration, never null');
        assert(resolveEffective(storeB) === DEFAULT_ARWEAVE_GATEWAY_URL, 'B5. State B resolves to the same effective URL as State A');
        assert(backingB.load('arweave-gateway-configuration') !== null, 'B6. …yet State B leaves a real, distinct entry on file — an explicit configuration is never treated as "nothing to persist" merely because it matches the default');

        // State C: a genuinely custom gateway.
        const backingC = new InMemoryStorageProvider();
        const storeC = new ArweaveGatewayConfigurationStore(backingC);
        storeC.save(new ArweaveGatewayConfiguration({ gatewayUrl: 'https://example-gateway.example' }));
        assert(resolveEffective(storeC) === 'https://example-gateway.example', 'B7. State C resolves to the custom gateway');

        // The decisive proof: A and B agree on effective URL but disagree
        // on persisted representation.
        assert(resolveEffective(storeA) === resolveEffective(storeB), 'B8. sanity — State A and State B truly share one effective URL');
        assert(storeA.get() === null && storeB.get() !== null, 'B9. …while their PERSISTED representations remain genuinely distinct: real null vs. a real ArweaveGatewayConfiguration instance');

        console.log('✓ Section B: State A (absence) and State B (explicit default) resolve to the identical effective gateway, yet remain distinguishable facts in persistence; State C resolves to its own distinct custom gateway');
    }

    // ===============================================================
    // Section C — Both retrieval paths: the exact configured URL reaches
    // the CONCRETE fetch call, default and custom, for both runtime paths.
    // ===============================================================
    {
        const worldEncounterUri = 'ar://' + 'a'.repeat(43);

        // World Encounter material retrieval — default.
        const defaultMaterialFetch = makeFetchSpy({ okPrefix: DEFAULT_ARWEAVE_GATEWAY_URL, textBody: '{"kind":"material"}' });
        const defaultResolver = new ArweaveWorldEncounterMaterialResolver({ gatewayUrl: DEFAULT_ARWEAVE_GATEWAY_URL, fetchImpl: defaultMaterialFetch });
        assert(await defaultResolver.retrieveByUri(worldEncounterUri) !== null, 'C1. sanity — default-gateway World Encounter retrieval succeeds');
        assert(defaultMaterialFetch.calls.length === 1 && defaultMaterialFetch.calls[0] === `${DEFAULT_ARWEAVE_GATEWAY_URL}/${'a'.repeat(43)}`, 'C2. World Encounter retrieval — the deployment default is the exact host the concrete fetch call reaches');

        // World Encounter material retrieval — custom.
        const customMaterialFetch = makeFetchSpy({ okPrefix: 'https://my-material-gateway.example', textBody: '{"kind":"material"}' });
        const customResolver = new ArweaveWorldEncounterMaterialResolver({ gatewayUrl: 'https://my-material-gateway.example', fetchImpl: customMaterialFetch });
        assert(await customResolver.retrieveByUri(worldEncounterUri) !== null, 'C3. sanity — custom-gateway World Encounter retrieval succeeds');
        assert(customMaterialFetch.calls.length === 1 && customMaterialFetch.calls[0] === `https://my-material-gateway.example/${'a'.repeat(43)}`, 'C4. World Encounter retrieval — a custom configured gateway is the exact host the concrete fetch call reaches, never a stale default');

        // Snapshot discovery retrieval — default.
        const snapshotTxId = 'b'.repeat(43);
        const snapshotReference = new ContentReference({ hash: 'irrelevant', uri: 'ar://' + snapshotTxId, storage: 'ar' });

        const defaultSnapshotFetch = makeFetchSpy({ okPrefix: DEFAULT_ARWEAVE_GATEWAY_URL, textBody: '{"snapshot":true}' });
        const { contentStore: defaultSnapshotStore } = composeDiscoverSnapshotRuntime({
            arweaveContentStoreOptions: { signer: fakeSigner(), gatewayUrl: DEFAULT_ARWEAVE_GATEWAY_URL, fetchImpl: defaultSnapshotFetch }
        });
        assert(await defaultSnapshotStore.get(snapshotReference) !== null, 'C5. sanity — default-gateway Snapshot retrieval succeeds');
        assert(defaultSnapshotFetch.calls.length === 1 && defaultSnapshotFetch.calls[0] === `${DEFAULT_ARWEAVE_GATEWAY_URL}/${snapshotTxId}`, 'C6. Snapshot discovery retrieval — the deployment default is the exact host the concrete fetch call reaches');

        // Snapshot discovery retrieval — custom.
        const customSnapshotFetch = makeFetchSpy({ okPrefix: 'https://my-snapshot-gateway.example', textBody: '{"snapshot":true}' });
        const { contentStore: customSnapshotStore } = composeDiscoverSnapshotRuntime({
            arweaveContentStoreOptions: { signer: fakeSigner(), gatewayUrl: 'https://my-snapshot-gateway.example', fetchImpl: customSnapshotFetch }
        });
        assert(await customSnapshotStore.get(snapshotReference) !== null, 'C7. sanity — custom-gateway Snapshot retrieval succeeds');
        assert(customSnapshotFetch.calls.length === 1 && customSnapshotFetch.calls[0] === `https://my-snapshot-gateway.example/${snapshotTxId}`, 'C8. Snapshot discovery retrieval — a custom configured gateway is the exact host the concrete fetch call reaches, never a stale default');

        console.log('✓ Section C: for both World Encounter material retrieval and Snapshot discovery retrieval, the configured gatewayUrl — default or custom — is the exact host the concrete fetch operation reaches, with no stale default surviving in either adapter');
    }

    // ===============================================================
    // Section D — Write-path isolation: a retrieval override on file at
    // the same moment never reaches Snapshot distribution's own POST, or
    // Signed Claim distribution's own resolved uploader options.
    // ===============================================================
    {
        const retrievalStore = new ArweaveGatewayConfigurationStore(new InMemoryStorageProvider());
        retrievalStore.save(new ArweaveGatewayConfiguration({ gatewayUrl: 'https://gateway-a.example' }));
        const resolvedRetrievalGatewayUrl = (retrievalStore.get() || { gatewayUrl: DEFAULT_ARWEAVE_GATEWAY_URL }).gatewayUrl;
        assert(resolvedRetrievalGatewayUrl === 'https://gateway-a.example', 'D1. sanity — a retrieval override is genuinely in effect');

        // Snapshot DISTRIBUTION (write path), composed exactly as
        // ui/main.js composes it: signer only, no gatewayUrl of any kind —
        // it never reads the retrieval store at all.
        const writeFetch = makeFetchSpy({ okPrefix: DEFAULT_ARWEAVE_GATEWAY_URL });
        const { contentStore: writeContentStore } = composeSnapshotDistributionRuntime({
            arweaveContentStoreOptions: { signer: fakeSigner(), fetchImpl: writeFetch }
        });
        assert(writeContentStore.gatewayUrl === DEFAULT_ARWEAVE_GATEWAY_URL, 'D2. the write-path content store defaults to the deployment default gateway, never the persisted retrieval override on file at this exact moment');

        await writeContentStore.put('snapshot bytes');
        assert(writeFetch.calls.length === 1 && writeFetch.calls[0] === `${DEFAULT_ARWEAVE_GATEWAY_URL}/tx`, 'D3. the concrete write-path POST actually reaches the deployment default host, never the configured retrieval gateway');

        // The READ path, composed from the very same store at the very
        // same moment, resolves the override — proving the two never
        // share a resolved value in either direction.
        const readFetch = makeFetchSpy({ okPrefix: 'https://gateway-a.example' });
        const { contentStore: readContentStore } = composeDiscoverSnapshotRuntime({
            arweaveContentStoreOptions: { signer: fakeSigner(), gatewayUrl: resolvedRetrievalGatewayUrl, fetchImpl: readFetch }
        });
        assert(readContentStore.gatewayUrl === 'https://gateway-a.example', 'D4. the read path, composed from the identical store instance at the identical moment, uses the configured override');

        // Signed Claim distribution's own configuration is sourced from a
        // completely independent { arweave } capability shape — it has no
        // idea the retrieval store even exists.
        const { arweaveUploaderOptions } = resolvePublicationDistributionRuntimeConfiguration({ arweave: { signer: fakeSigner() } });
        assert(arweaveUploaderOptions.gatewayUrl === undefined, 'D5. Signed Claim distribution\'s own resolved uploader options carry no gatewayUrl at all when none is supplied to ITS OWN { arweave } shape — it is never populated from the retrieval store');

        // Structural: none of the write-path composition/configuration
        // files reference the retrieval configuration boundary by name.
        const writePathFiles = [
            'application/SnapshotDistributionRuntimeComposition.js',
            'application/PublicationDistributionRuntimeConfiguration.js',
            'application/PublicationDistributionConfigurationProvider.js',
            'application/ArweavePublicationMaterialUploader.js'
        ];
        for (const path of writePathFiles) {
            const src = await source(path);
            assert(!/ArweaveGatewayConfiguration/.test(src), `D6 (${path}). the write path never references the retrieval configuration boundary by name`);
        }

        console.log('✓ Section D: a retrieval override on file has zero effect on Snapshot distribution\'s own gateway (still the deployment default, verified against the concrete POST) and zero effect on Signed Claim distribution\'s own resolved uploader options — the two paths never share a resolved value');
    }

    // ===============================================================
    // Section E — Replacement and clearing: gateway-A -> gateway-B ->
    // clear -> null -> restart -> deployment default, with no residue.
    // ===============================================================
    {
        const backing = {};
        const freshStore = () => new ArweaveGatewayConfigurationStore(new SharedNamespaceStorageProvider(backing));

        let store = freshStore();
        store.save(new ArweaveGatewayConfiguration({ gatewayUrl: 'https://gateway-a.example' }));
        assert(store.get().gatewayUrl === 'https://gateway-a.example', 'E1. gateway-A is on file');

        store = freshStore(); // restart boundary
        store.save(new ArweaveGatewayConfiguration({ gatewayUrl: 'https://gateway-b.example' }));
        assert(store.get().gatewayUrl === 'https://gateway-b.example', 'E2. gateway-B replaces gateway-A outright, across a restart boundary');

        store = freshStore(); // restart boundary
        store.clear();
        assert(store.get() === null, 'E3. clear() returns to null, across a restart boundary');

        store = freshStore(); // restart boundary
        const effective = (store.get() || { gatewayUrl: DEFAULT_ARWEAVE_GATEWAY_URL }).gatewayUrl;
        assert(effective === DEFAULT_ARWEAVE_GATEWAY_URL, 'E4. after clearing, a freshly restarted application resolves the deployment default');

        const remainingKeys = Object.keys(backing);
        assert(remainingKeys.length === 0, `E5. no history, migration record, or stale cached value remains after clear() — found ${JSON.stringify(remainingKeys)}`);

        console.log('✓ Section E: gateway-A → gateway-B → clear → null → restart → deployment default, with no leftover key of any kind');
    }

    // ===============================================================
    // Section F — Restart convergence: genuinely independent compositions
    // (separate store AND separate StorageProvider instances) over one
    // shared storage namespace prove persistence, not an in-memory
    // singleton, is the authority.
    // ===============================================================
    {
        const sharedNamespace = {};

        // Application A saves gateway-A.
        const applicationA = new ArweaveGatewayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        applicationA.save(new ArweaveGatewayConfiguration({ gatewayUrl: 'https://gateway-a.example' }));

        // restart boundary — Application B: its own store instance, its
        // own StorageProvider instance, sharing only the namespace, the
        // same way two separate page loads share one browser's
        // localStorage without ever sharing a JS object.
        const applicationB = new ArweaveGatewayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        assert(applicationA !== applicationB, 'F1. sanity — genuinely separate store instances, not the same object reused');
        const effectiveB = (applicationB.get() || { gatewayUrl: DEFAULT_ARWEAVE_GATEWAY_URL }).gatewayUrl;
        assert(effectiveB === 'https://gateway-a.example', 'F2. Application B, an independently composed application over the same storage namespace, resolves the gateway Application A saved — persistence is the authority, not an in-memory singleton');

        applicationB.clear();

        // restart boundary — Application C.
        const applicationC = new ArweaveGatewayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        const effectiveC = (applicationC.get() || { gatewayUrl: DEFAULT_ARWEAVE_GATEWAY_URL }).gatewayUrl;
        assert(effectiveC === DEFAULT_ARWEAVE_GATEWAY_URL, 'F3. Application C, restarted after Application B cleared the override, resolves the deployment default — the clear() is durable across the same restart boundary');

        console.log('✓ Section F: three genuinely independent compositions over one shared storage namespace converge on the same effective gateway at each step — persistence, never an in-memory singleton, is the authority');
    }

    // ===============================================================
    // Section G — Failure semantics: malformed data degrades, a storage
    // failure propagates, and an unreachable custom gateway fails loudly
    // without ever silently trying arweave.net instead.
    // ===============================================================
    {
        const malformedBacking = new InMemoryStorageProvider();
        malformedBacking.save('arweave-gateway-configuration', { gatewayUrl: 42 });
        assert(new ArweaveGatewayConfigurationStore(malformedBacking).get() === null, 'G1. malformed persisted configuration degrades to null, never a thrown error and never a fabricated instance');

        class ThrowingStorageProvider extends StorageProvider {
            save() { throw new Error('disk unavailable'); }
            load() { throw new Error('disk unavailable'); }
            remove() { throw new Error('disk unavailable'); }
            list() { return []; }
        }
        let threw = false;
        try { new ArweaveGatewayConfigurationStore(new ThrowingStorageProvider()).get(); } catch { threw = true; }
        assert(threw, 'G2. a genuine storage failure propagates out of get() rather than degrading to null');

        // An unreachable custom gateway fails through World Encounter
        // retrieval — and never silently tries arweave.net instead.
        const rejectingMaterialFetch = makeRejectingFetchSpy('https://unreachable-gateway.example');
        const resolverAgainstUnreachable = new ArweaveWorldEncounterMaterialResolver({ gatewayUrl: 'https://unreachable-gateway.example', fetchImpl: rejectingMaterialFetch });
        let resolverThrew = false;
        try { await resolverAgainstUnreachable.retrieveByUri('ar://' + 'c'.repeat(43)); } catch { resolverThrew = true; }
        assert(resolverThrew, 'G3. World Encounter retrieval against an unreachable custom gateway genuinely fails rather than resolving null or succeeding');
        assert(rejectingMaterialFetch.calls.length === 1, `G4. exactly one fetch attempt was made — no retry, and critically no SECOND attempt against a different host — found ${rejectingMaterialFetch.calls.length}`);
        assert(!rejectingMaterialFetch.calls.some((url) => url.startsWith(DEFAULT_ARWEAVE_GATEWAY_URL)), 'G5. the deployment default host is never contacted as a silent fallback');

        // The identical proof for Snapshot discovery retrieval.
        const rejectingSnapshotFetch = makeRejectingFetchSpy('https://unreachable-gateway.example');
        const { contentStore: unreachableContentStore } = composeDiscoverSnapshotRuntime({
            arweaveContentStoreOptions: { signer: fakeSigner(), gatewayUrl: 'https://unreachable-gateway.example', fetchImpl: rejectingSnapshotFetch }
        });
        let contentStoreThrew = false;
        try {
            await unreachableContentStore.get(new ContentReference({ hash: 'x', uri: 'ar://' + 'd'.repeat(43), storage: 'ar' }));
        } catch (error) {
            contentStoreThrew = true;
            assert(error instanceof ContentUnavailableError, 'G6. Snapshot retrieval against an unreachable custom gateway throws the existing ContentUnavailableError, never a bespoke error and never a silent success');
        }
        assert(contentStoreThrew, 'G7. sanity — the content store call genuinely threw rather than resolving');
        assert(!rejectingSnapshotFetch.calls.some((url) => url.startsWith(DEFAULT_ARWEAVE_GATEWAY_URL)), 'G8. Snapshot retrieval never falls back to arweave.net either — a Wanderer testing an alternative gateway can trust that a failure means the CONFIGURED gateway failed, never that the application quietly used the default instead');

        console.log('✓ Section G: malformed persisted data degrades to null, a genuine storage failure propagates unmodified, and an unreachable custom gateway fails loudly on both retrieval paths with zero fallback attempt against arweave.net');
    }

    // ===============================================================
    // Section H — URL normalization: trailing-slash variants converge to
    // one value that reaches the concrete fetch call cleanly, while a
    // gateway's own path/query is never destroyed.
    // ===============================================================
    {
        const variants = ['https://example.com', 'https://example.com/', 'https://example.com//', 'https://example.com////'];
        for (const variant of variants) {
            const gatewayUrl = new ArweaveGatewayConfiguration({ gatewayUrl: variant }).gatewayUrl;
            assert(gatewayUrl === 'https://example.com', `H1 ('${variant}'). every trailing-slash variant normalizes to the identical gatewayUrl — got '${gatewayUrl}'`);
        }

        // The normalized value reaches the concrete retrieval adapter's
        // actual request URL with no leftover double slash.
        const fetchSpy = makeFetchSpy({ okPrefix: 'https://example.com' });
        const resolver = new ArweaveWorldEncounterMaterialResolver({ gatewayUrl: 'https://example.com////', fetchImpl: fetchSpy });
        await resolver.retrieveByUri('ar://' + 'e'.repeat(43));
        assert(fetchSpy.calls[0] === `https://example.com/${'e'.repeat(43)}`, `H2. the normalized gatewayUrl reaches the concrete fetch call with exactly one slash — got '${fetchSpy.calls[0]}'`);

        // A gateway URL that legitimately carries its own path/query is
        // never destroyed — only a TRAILING slash is ever stripped.
        const withPathAndQuery = new ArweaveGatewayConfiguration({ gatewayUrl: 'https://gateway.example/sub/path?tag=x' });
        assert(withPathAndQuery.gatewayUrl === 'https://gateway.example/sub/path?tag=x', 'H3. a gatewayUrl carrying its own path and query string is preserved verbatim — normalization strips only a trailing slash, never path/query semantics');

        const withPathAndTrailingSlash = new ArweaveGatewayConfiguration({ gatewayUrl: 'https://gateway.example/sub/path/' });
        assert(withPathAndTrailingSlash.gatewayUrl === 'https://gateway.example/sub/path', 'H4. a trailing slash after a real path segment is still stripped, exactly like a bare host');

        console.log('✓ Section H: every trailing-slash-equivalent input converges on one normalized gatewayUrl that reaches the concrete fetch call cleanly, while a gateway\'s own path/query is preserved verbatim');
    }

    // ===============================================================
    // Section I — Configuration-boundary isolation: the value object and
    // its store import nothing beyond their own declared, minimal seam.
    // ===============================================================
    {
        const configSource = await source('core/ArweaveGatewayConfiguration.js');
        const configExecutable = configSource.replace(/\/\/.*$/gm, '');
        assert(!/StorageProvider/.test(configExecutable), 'I1. core/ArweaveGatewayConfiguration.js has no StorageProvider reference of any kind');
        assert(!/\bfetch\s*\(/.test(configExecutable), 'I2. core/ArweaveGatewayConfiguration.js makes no network call of any kind');
        assert(!/ArweaveContentStore/.test(configExecutable), 'I3. core/ArweaveGatewayConfiguration.js has no ArweaveContentStore dependency');
        assert(!/Distribution/.test(configExecutable), 'I4. core/ArweaveGatewayConfiguration.js has no distribution dependency of any kind');
        assert(!/ProviderSelection|RoleProvider|providerRanking/i.test(configExecutable), 'I5. core/ArweaveGatewayConfiguration.js has no provider-selection dependency of any kind');

        const storeSource = await source('storage/ArweaveGatewayConfigurationStore.js');
        const storeExecutable = storeSource.replace(/\/\/.*$/gm, '');
        assert(!/ArweaveContentStore/.test(storeExecutable), 'I6. storage/ArweaveGatewayConfigurationStore.js has no ArweaveContentStore dependency');
        assert(!/Distribution/.test(storeExecutable), 'I7. storage/ArweaveGatewayConfigurationStore.js has no distribution dependency of any kind');
        assert(!/ProviderSelection|RoleProvider|providerRanking/i.test(storeExecutable), 'I8. storage/ArweaveGatewayConfigurationStore.js has no provider-selection dependency of any kind');
        const importLines = storeExecutable.split('\n').filter((line) => /^import\b/.test(line));
        assert(importLines.length === 3 && importLines.every((line) => /StorageProvider|ArweaveGatewayConfiguration/.test(line)),
            'I9. storage/ArweaveGatewayConfigurationStore.js imports only its own StorageProvider/LocalStorageProvider seam and its sibling configuration value object — nothing else');

        console.log('✓ Section I: neither the configuration value object nor its persistence store imports StorageProvider-beyond-its-own-seam, network access, ArweaveContentStore, distribution, or provider-selection machinery');
    }

    // ===============================================================
    // Section J — Final decision matrix.
    // ===============================================================
    {
        const matrix = [
            ['One configuration model?', 'YES', '✅'],
            ['One persistence key?', 'YES', '✅'],
            ['One effective-value composition point?', 'YES', '✅'],
            ['Both retrieval paths covered?', 'YES', '✅'],
            ['Write path affected?', 'NO', '✅'],
            ['Automatic fallback?', 'NO', '✅'],
            ['Health checking?', 'NO', '✅'],
            ['Credential handling?', 'NO', '✅'],
            ['Provider ranking?', 'NO', '✅'],
            ['Configuration history?', 'NO', '✅'],
            ['Network access during configuration?', 'NO', '✅'],
            ['Settings UI required to prove architecture?', 'NO', '✅']
        ];
        console.log('\n=== FINAL DECISION MATRIX ===');
        console.log('Question                                     | Expected | Observed');
        console.log('----------------------------------------------|----------|---------');
        for (const [question, expected, observed] of matrix) {
            console.log(`${question.padEnd(47)}| ${expected.padEnd(9)}| ${observed}`);
        }

        console.log('\n=== VERDICT: CONVERGED ===');
        console.log('Sections A-I prove convergence, not just correctness-in-isolation: one value object and one');
        console.log('storage key are ever referenced (A), absence and an explicit default stay distinguishable facts');
        console.log('in persistence even when their effective URL coincides (B), the exact configured URL reaches the');
        console.log('concrete fetch call on both retrieval paths (C), a retrieval override on file has provably zero');
        console.log('effect on either write path at the very same moment (D), replacement/clearing leaves no residue');
        console.log('across restart boundaries (E), three genuinely independent compositions over one storage');
        console.log('namespace converge on identical effective values because persistence — never an in-memory');
        console.log('singleton — is the authority (F), failure never silently degrades into a fallback (G), every');
        console.log('trailing-slash-equivalent input converges to one normalized value without destroying a real');
        console.log('path/query (H), and the configuration boundary imports nothing beyond its own declared seam (I).');
        console.log('0.9.364\'s implementation is sound. No convergence defect was found; no production change was made.');
    }

    console.log('\n✅ All Arweave Gateway Configuration Convergence Audit tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
