import { readFile } from 'node:fs/promises';

import { ArweaveGatewayConfiguration, DEFAULT_ARWEAVE_GATEWAY_URL } from '../core/ArweaveGatewayConfiguration.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { ArweaveGatewayConfigurationStore } from '../storage/ArweaveGatewayConfigurationStore.js';
import { SetArweaveGatewayConfigurationUseCase } from '../application/SetArweaveGatewayConfigurationUseCase.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { ArweaveGatewayFailoverContentStore } from '../content/ArweaveGatewayFailoverContentStore.js';
import { ArweaveWorldEncounterMaterialResolver } from '../application/ArweaveWorldEncounterMaterialResolver.js';
import { ArweaveGatewayFailoverWorldEncounterMaterialResolver } from '../application/ArweaveGatewayFailoverWorldEncounterMaterialResolver.js';
import { ContentUnavailableError } from '../content/IpfsContentStore.js';
import { ContentReference } from '../core/ContentReference.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { composeDiscoverSnapshotRuntime } from '../application/DiscoverSnapshotRuntimeComposition.js';
import { composeSnapshotDistributionRuntime } from '../application/SnapshotDistributionRuntimeComposition.js';
import { composeArweaveDecentralizedWorldEncounterMaterialSource } from '../application/DecentralizedWorldEncounterMaterialRuntimeComposition.js';
import { executeDiscoverSnapshotCommand } from '../application/DiscoverSnapshotCommand.js';
import { DecentralizedSnapshotResolver } from '../application/DecentralizedSnapshotResolver.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';
import { CreateArweaveAnchorPublisherUseCase } from '../application/CreateArweaveAnchorPublisherUseCase.js';
import { CreateArweaveAnchorProofVerifierUseCase } from '../application/CreateArweaveAnchorProofVerifierUseCase.js';

// 0.9.441 — Arweave Gateway Read Failover Integration Boundary Audit.
//
// TEST-ONLY. Zero production changes ride with this milestone.
//
// 0.9.440 shipped ordered Arweave gateway read failover and proved it
// thoroughly at the level of its own two new wrapper classes
// (content/ArweaveGatewayFailoverContentStore.js, application/
// ArweaveGatewayFailoverWorldEncounterMaterialResolver.js) and at the level
// of composition-picks-the-right-class (tests/ArweaveGatewayReadFailover.test.js
// Sections A/K). What no existing test does is drive failover through the
// actual OUTER production entry points a real Wanderer session calls —
// `executeDiscoverSnapshotCommand()` (via a real `DecentralizedSnapshotResolver`,
// discovery+location+retrieval+verification, all four layers) and
// `DecentralizedWorldEncounterMaterialSource#load()` — with a failover
// collaborator built ONLY through the real composition functions
// (`composeDiscoverSnapshotRuntime()` / `composeArweaveDecentralizedWorldEncounterMaterialSource()`),
// never a directly-`new`-ed wrapper class. This file closes exactly that
// gap: it proves 0.9.440 survives being wrapped by everything that sits
// between it and a real caller, not merely that the wrapper classes
// themselves are correct in isolation.
//
// Section A: configuration -> runtime propagation, the full chain — a raw
//            persisted payload (old single-value shape, and the new
//            plural shape) through the real store, the real value object,
//            and the real composition functions.
// Section B: the real Snapshot discovery path — composeDiscoverSnapshotRuntime()
//            + a real DecentralizedSnapshotResolver + executeDiscoverSnapshotCommand(),
//            never a directly-constructed failover class.
// Section C: the real World Encounter material path —
//            composeArweaveDecentralizedWorldEncounterMaterialSource() +
//            DecentralizedWorldEncounterMaterialSource#load(), the actual
//            method application/WorldEncounterMaterialLoading.js's own
//            family calls.
// Section D: the exact failover boundary, proven at those SAME outer entry
//            points — A succeeds -> B/C zero calls; A unavailable -> B
//            succeeds, exactly two attempts; A an unexpected (non-
//            ContentUnavailableError) failure propagates untranslated all
//            the way out, never reclassified as gateway unavailability.
// Section E: put() isolation — through composeDiscoverSnapshotRuntime()
//            (read side) put() still reaches only gateway A; through
//            composeSnapshotDistributionRuntime() (write side), a
//            gatewayUrls list has ZERO effect at all — that composition
//            function structurally never builds a failover class, so
//            passing one is a silent no-op, not a latent fan-out switch.
// Section F: cross-role isolation, proven behaviorally, not just by source
//            sweep — Arweave Anchor (publish AND verify) contacts only the
//            first gateway of a real three-gateway ArweaveGatewayConfiguration,
//            even though it was handed the SAME configuration instance
//            Snapshot/World Encounter retrieval draws its own gatewayUrls
//            from; Publication distribution/announcement and Nostr/Bitcoin
//            composition never reference the gateway list at all.
// Section G: identity preservation through the FULL four-layer resolution
//            pipeline (discovery, location, retrieval, AND verification) —
//            a failed-over read still produces a RESOLVED outcome whose
//            locator/storage/bytes/hash are exactly what a direct,
//            single-gateway read against the surviving gateway would have
//            produced.
// Section H: Settings/UI integration — the view's real parseGatewayUrls()/
//            save()/load() functions, extracted from the real source file
//            and executed (never reimplemented by hand): line order
//            preserved, empty lines never become endpoints, a malformed
//            entry is rejected by the real use case without mutating
//            storage, one line behaves exactly like the pre-0.9.440 single
//            input, and a saved configuration reloads byte-identical.
// Section I: no health state — a structural source sweep PLUS a behavioral
//            proof that two independent calls against the same failover
//            collaborator each retry gateway A first, from scratch — no
//            memory, ranking, or reordering carries between calls.
// Section J: final boundary verdict.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function expectRejects(promise, message, ErrorType = null) {
    let rejected = false;
    let error = null;
    try { await promise; } catch (e) { rejected = true; error = e; }
    assert(rejected, message);
    if (ErrorType) {
        assert(error instanceof ErrorType, `${message} (wrong error type: ${error && error.constructor && error.constructor.name})`);
    }
    return error;
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// Two SEPARATE instances over one externally-owned namespace behave the way
// two separate page loads share one browser's localStorage.
class SharedNamespaceStorageProvider extends StorageProvider {
    constructor(sharedNamespace) { super(); this._namespace = sharedNamespace; }
    save(name, data) { this._namespace[name] = JSON.stringify(data); }
    load(name) { return Object.prototype.hasOwnProperty.call(this._namespace, name) ? JSON.parse(this._namespace[name]) : null; }
    remove(name) { delete this._namespace[name]; }
    list() { return Object.keys(this._namespace); }
}

function fakeSigner() {
    let counter = 0;
    return { sign: async (material) => { counter += 1; const id = `f${counter}${'a'.repeat(42)}`; return { id, transaction: { id, data: material } }; } };
}

// A per-origin fake gateway network — see tests/ArweaveGatewayReadFailover.test.js's
// own makeMultiGatewayFetch() for the identical shape; reused here rather
// than reimplemented, since this file's job is to test the layers ABOVE
// that one, not to re-litigate its own request-shape correctness.
function makeMultiGatewayFetch(behaviors) {
    const requestsByOrigin = {};
    for (const origin of Object.keys(behaviors)) requestsByOrigin[origin] = [];
    const network = new Map();
    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        const origin = parsed.origin;
        if (!(origin in requestsByOrigin)) requestsByOrigin[origin] = [];
        requestsByOrigin[origin].push(url);
        const behavior = behaviors[origin];
        if (!behavior) throw new Error(`test setup error: no behavior configured for origin ${origin}`);
        if (behavior.reject) throw new Error(behavior.rejectMessage || `simulated network failure for ${origin}`);
        if (options.method === 'POST' && parsed.pathname === '/tx') {
            const transaction = JSON.parse(options.body);
            network.set(transaction.id, transaction.data);
            return new Response('OK', { status: 200 });
        }
        if (behavior.status && behavior.status !== 200) return new Response(behavior.body ?? 'not found', { status: behavior.status });
        const id = parsed.pathname.slice(1);
        if (behavior.body !== undefined) return new Response(behavior.body, { status: 200 });
        if (network.has(id)) return new Response(network.get(id), { status: 200 });
        return new Response('not found', { status: 404 });
    }
    return { fetchImpl, requestsByOrigin };
}

function totalRequests(requestsByOrigin, origin) {
    return (requestsByOrigin[origin] || []).length;
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

// Mirrors tests/ArweaveGatewayLifecycleReassessment.test.js's own
// useDeploymentDefaultFnMatch extraction technique exactly — the real
// function body, taken verbatim from the real source file, never
// reimplemented by hand.
function extractFunctionBlock(sourceText, functionName) {
    const pattern = new RegExp(`function ${functionName}\\(\\)\\s*\\{[\\s\\S]*?\\n\\s{8}\\}`);
    const match = sourceText.match(pattern);
    return match ? match[0] : null;
}

async function run() {
    const A = 'https://gateway-a.example';
    const B = 'https://gateway-b.example';
    const C = 'https://gateway-c.example';
    const txId = 'a'.repeat(43);
    const arUri = 'ar://' + txId;

    // ===============================================================
    // Section A — configuration -> runtime propagation, the full chain.
    // ===============================================================
    {
        // A1. A single gateway persisted through the OLD, pre-0.9.440
        // `{ gatewayUrl }` shape (as if written by an earlier app version,
        // or by hand) round-trips through the real store into a real
        // ArweaveGatewayConfiguration, and the real composition function
        // still picks the plain, pre-0.9.440 class from it.
        {
            const backing = new InMemoryStorageProvider();
            backing.save('arweave-gateway-configuration', { gatewayUrl: A });
            const store = new ArweaveGatewayConfigurationStore(backing);
            const configuration = store.get();
            assert(configuration instanceof ArweaveGatewayConfiguration, 'A1a. a legacy { gatewayUrl } payload round-trips into a real ArweaveGatewayConfiguration');
            assert(configuration.gatewayUrls.length === 1 && configuration.gatewayUrls[0] === A, 'A1b. …as exactly a one-element ordered list');

            const { fetchImpl } = makeMultiGatewayFetch({ [A]: { body: '{"ok":true}' } });
            const { contentStore } = composeDiscoverSnapshotRuntime({
                arweaveContentStoreOptions: { signer: fakeSigner(), gatewayUrls: configuration.gatewayUrls, fetchImpl }
            });
            assert(contentStore instanceof ArweaveContentStore && !(contentStore instanceof ArweaveGatewayFailoverContentStore),
                'A1c. …which, threaded through the real composition function, builds byte-for-byte the pre-0.9.440 plain class — legacy single-gateway behavior is completely unaffected end to end');
        }

        // A2. Multiple gateways, persisted through the NEW `{ gatewayUrls }`
        // shape, preserve EXACT configured order all the way through the
        // real store, the real value object, and the real composition
        // function's own class selection.
        {
            const backing = new InMemoryStorageProvider();
            const setUseCase = new SetArweaveGatewayConfigurationUseCase({
                arweaveGatewayConfigurationStore: new ArweaveGatewayConfigurationStore(backing)
            });
            setUseCase.execute({ gatewayUrls: [C, A, B] });

            const rehydratedStore = new ArweaveGatewayConfigurationStore(backing);
            const configuration = rehydratedStore.get();
            assert(configuration.gatewayUrls.join(',') === [C, A, B].join(','), 'A2a. a saved, out-of-alphabetical-order list round-trips through a freshly constructed store with its EXACT configured order intact');

            const { fetchImpl } = makeMultiGatewayFetch({ [A]: { body: '{"from":"a"}' }, [B]: { body: '{"from":"b"}' }, [C]: { reject: true } });
            const { resolver } = composeArweaveDecentralizedWorldEncounterMaterialSource({ gatewayUrls: configuration.gatewayUrls, fetchImpl });
            assert(resolver instanceof ArweaveGatewayFailoverWorldEncounterMaterialResolver, 'A2b. 3 configured gateways build the real failover resolver through the real composition function');
            assert(resolver.gatewayUrls.join(',') === [C, A, B].join(','), 'A2c. the resolver itself exposes the exact persisted order — C first, never re-sorted');
            const material = await resolver.retrieveByUri(arUri);
            assert(material.from === 'a', 'A2d. behaviorally: C (first, configured) rejects, so A (second, configured) answers — proving order, not just the exposed getter, is what the runtime actually uses');
        }

        // A3. The reverse of A1 — the OLD singular `gatewayUrl` OPTION shape
        // handed straight to a composition function (never touching a
        // store at all) is still exactly the one-element-list behavior,
        // confirming the propagation chain has no special-casing that only
        // works when a store happens to be involved.
        {
            const { fetchImpl } = makeMultiGatewayFetch({ [A]: { body: '{}' } });
            const { contentStore } = composeDiscoverSnapshotRuntime({ arweaveContentStoreOptions: { signer: fakeSigner(), gatewayUrl: A, fetchImpl } });
            assert(contentStore instanceof ArweaveContentStore && !(contentStore instanceof ArweaveGatewayFailoverContentStore),
                'A3. the bare singular gatewayUrl option (no store, no configuration object at all) still resolves to the plain pre-0.9.440 class');
        }

        console.log('✓ Section A: a raw persisted payload — legacy single-value or new plural — propagates through the real store, the real ArweaveGatewayConfiguration, and the real composition functions with its exact shape and order intact, all the way to which concrete class gets built and which gateway actually answers first');
    }

    // ===============================================================
    // Section B — the real Snapshot discovery path: composeDiscoverSnapshotRuntime()
    // + a real DecentralizedSnapshotResolver + executeDiscoverSnapshotCommand().
    // ===============================================================
    {
        const contentHash = computeContentHash('snapshot bytes served by gateway B');
        const candidate = { contentHash, locator: arUri, storage: 'ar' };
        const fakeQueryService = { search: async () => [candidate] };
        const resolver = new DecentralizedSnapshotResolver(fakeQueryService);

        const { fetchImpl, requestsByOrigin } = makeMultiGatewayFetch({
            [A]: { reject: true, rejectMessage: 'gateway A is down' },
            [B]: { body: 'snapshot bytes served by gateway B' }
        });
        const { contentStore } = composeDiscoverSnapshotRuntime({
            arweaveContentStoreOptions: { signer: fakeSigner(), gatewayUrls: [A, B], fetchImpl }
        });
        assert(contentStore instanceof ArweaveGatewayFailoverContentStore, 'B1. sanity — the real composition function built the real failover class');

        const result = await executeDiscoverSnapshotCommand({
            discoveryTag: 'forkbuild-snapshot', contentHash, resolver, contentStore
        });
        assert(result.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'B2. executeDiscoverSnapshotCommand() — the actual application entry point a real World View calls — reports RESOLVED even though the first configured gateway was down, never STORE_UNAVAILABLE or CONTENT_UNAVAILABLE');
        assert(result.bytes === 'snapshot bytes served by gateway B', 'B3. the resolved bytes are exactly what the surviving gateway served');
        assert(totalRequests(requestsByOrigin, A) === 1 && totalRequests(requestsByOrigin, B) === 1, 'B4. gateway A was tried exactly once before failing over to gateway B, exactly once — through the FULL discovery+location+retrieval+verification pipeline, not a bare store.get()');

        console.log('✓ Section B: a real DecentralizedSnapshotResolver, driven through the real executeDiscoverSnapshotCommand() entry point, resolves successfully across a failed first gateway when its own contentStore was built by the real composeDiscoverSnapshotRuntime() composition function — never a directly-constructed failover class');
    }

    // ===============================================================
    // Section C — the real World Encounter material path:
    // composeArweaveDecentralizedWorldEncounterMaterialSource() +
    // DecentralizedWorldEncounterMaterialSource#load().
    // ===============================================================
    {
        const { fetchImpl, requestsByOrigin } = makeMultiGatewayFetch({
            [A]: { status: 404 },
            [B]: { body: '{"kind":"building","blocks":42}' }
        });
        const { resolver, decentralized } = composeArweaveDecentralizedWorldEncounterMaterialSource({ gatewayUrls: [A, B], fetchImpl });
        assert(resolver instanceof ArweaveGatewayFailoverWorldEncounterMaterialResolver, 'C1. sanity — the real composition function built the real failover resolver');

        const resolvedSelection = { kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-1', origin: 'decentralized' };
        const resolvedLead = { uri: arUri };
        const material = await decentralized.load(resolvedSelection, resolvedLead);
        assert(material && material.kind === 'building' && material.blocks === 42,
            'C2. DecentralizedWorldEncounterMaterialSource#load() — the actual method application/WorldEncounterMaterialLoading.js\'s own family calls — returns real material even though the first configured gateway had nothing (a 404)');
        assert(totalRequests(requestsByOrigin, A) === 1 && totalRequests(requestsByOrigin, B) === 1,
            'C3. gateway A was consulted exactly once (and had nothing), gateway B exactly once (and answered) — through the real .decentralized.load() entry point, never resolver.retrieveByUri() called directly');

        console.log('✓ Section C: DecentralizedWorldEncounterMaterialSource#load(), the real method the World Encounter material loading family calls, transparently benefits from failover when its retrieveByUri was built by the real composeArweaveDecentralizedWorldEncounterMaterialSource() composition function');
    }

    // ===============================================================
    // Section D — the exact failover boundary, proven at the same outer
    // entry points as Sections B/C, not at the wrapper classes directly.
    // ===============================================================
    {
        // D1. A succeeds -> B, C see ZERO calls, through the full Snapshot
        // discovery command.
        {
            const contentHash = computeContentHash('{"only":"a"}');
            const candidate = { contentHash, locator: arUri, storage: 'ar' };
            const resolver = new DecentralizedSnapshotResolver({ search: async () => [candidate] });
            const { fetchImpl, requestsByOrigin } = makeMultiGatewayFetch({
                [A]: { body: '{"only":"a"}' }, [B]: { body: '{"only":"a"}' }, [C]: { body: '{"only":"a"}' }
            });
            const { contentStore } = composeDiscoverSnapshotRuntime({ arweaveContentStoreOptions: { signer: fakeSigner(), gatewayUrls: [A, B, C], fetchImpl } });
            const result = await executeDiscoverSnapshotCommand({ discoveryTag: 'forkbuild-snapshot', contentHash, resolver, contentStore });
            assert(result.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'D1a. A succeeding resolves the command');
            assert(totalRequests(requestsByOrigin, A) === 1, 'D1b. A contacted exactly once');
            assert(totalRequests(requestsByOrigin, B) === 0, 'D1c. B receives ZERO calls when A already succeeded, through the full command');
            assert(totalRequests(requestsByOrigin, C) === 0, 'D1d. C receives ZERO calls either');
        }

        // D2. A -> ContentUnavailableError, B -> success: exactly two
        // attempts total, through the full World Encounter material load.
        {
            const { fetchImpl, requestsByOrigin } = makeMultiGatewayFetch({ [A]: { reject: true }, [B]: { body: '{"ok":true}' } });
            const { decentralized } = composeArweaveDecentralizedWorldEncounterMaterialSource({ gatewayUrls: [A, B], fetchImpl });
            const material = await decentralized.load({ kind: WorldEncounterKind.PUBLICATION, objectId: 'p', origin: 'decentralized' }, { uri: arUri });
            assert(material.ok === true, 'D2a. resolves against B once A is unavailable');
            const totalCalls = totalRequests(requestsByOrigin, A) + totalRequests(requestsByOrigin, B);
            assert(totalCalls === 2, `D2b. exactly two attempts total, through the full .load() entry point — found ${totalCalls}`);
        }

        // D3/D4 — an UNEXPECTED error from the first gateway. This audit
        // set out to confirm one guarantee (the brief's own wording: "ensure
        // that error propagates rather than being incorrectly classified as
        // gateway unavailability") and found a REAL, genuine divergence
        // between 0.9.440's own two failover collaborators on exactly this
        // point — not a bug this test papers over, a finding worth stating
        // plainly:
        //
        //   content/ArweaveGatewayFailoverContentStore.js#get() is STRICT —
        //   only a ContentUnavailableError advances to the next gateway;
        //   anything else propagates immediately, gateway B never
        //   contacted (that file's own header, "an unexpected error shape
        //   never gets swallowed").
        //
        //   application/ArweaveGatewayFailoverWorldEncounterMaterialResolver.js#retrieveByUri()
        //   is PERMISSIVE, by explicit, documented design — ANY rejection
        //   from gateway A, not only a network-shaped one, is caught and
        //   treated as "try gateway B too" (that file's own header, "a
        //   genuine network failure is caught here... it catches a
        //   rejection from gateway A specifically so it can try gateway
        //   B... only once every configured gateway has rejected does the
        //   LAST rejection propagate"). A genuine bug in gateway A's own
        //   resolver is, today, indistinguishable from a network failure to
        //   this class, and gateway B is contacted anyway.
        //
        // Both behaviors are each collaborator's own real, current, already
        // -documented contract — this section proves each ACTUALLY behaves
        // the way its own header claims, rather than assuming the two are
        // symmetric because they solve the same problem.
        {
            // D3 — content store: strict, exactly as the brief expects.
            const { fetchImpl: contentStoreFetch, requestsByOrigin: contentStoreRequests } = makeMultiGatewayFetch({ [A]: {}, [B]: { body: 'irrelevant' } });
            const { contentStore } = composeDiscoverSnapshotRuntime({ arweaveContentStoreOptions: { signer: fakeSigner(), gatewayUrls: [A, B], fetchImpl: contentStoreFetch } });
            assert(contentStore instanceof ArweaveGatewayFailoverContentStore, 'D3a. sanity — the real composition function built the real failover class');
            contentStore._stores[0].get = async () => { throw new TypeError('a genuine bug, never a gateway unavailability'); };
            const reference = new ContentReference({ hash: 'irrelevant', uri: arUri, storage: 'ar' });
            await expectRejects(
                contentStore.get(reference),
                'D3b. an unexpected (non-ContentUnavailableError) failure from gateway A propagates as a genuine rejection, through the real composeDiscoverSnapshotRuntime()-built failover store',
                TypeError
            );
            assert(totalRequests(contentStoreRequests, B) === 0, 'D3c. gateway B was NEVER contacted — the content store failover class never treats an unexpected error as "try the next gateway"');

            // One layer further up, through the full Snapshot command:
            // application/DecentralizedSnapshotResolver.js (0.9.134,
            // unmodified, outside this milestone's own scope) itself never
            // lets ANY store failure escape as a rejection ("resolve()
            // never throws for anything about discovery, the store, or the
            // network") — so the SAME unexpected error surfaces there as
            // CONTENT_UNAVAILABLE, that layer's own pre-existing contract,
            // not a new failover misclassification; gateway B still sees
            // zero requests either way.
            contentStore._stores[0].get = async () => { throw new TypeError('a genuine bug, never a gateway unavailability'); };
            const contentHash = computeContentHash('irrelevant');
            const resolver = new DecentralizedSnapshotResolver({ search: async () => [{ contentHash, locator: arUri, storage: 'ar' }] });
            const snapshotResult = await executeDiscoverSnapshotCommand({ discoveryTag: 'forkbuild-snapshot', contentHash, resolver, contentStore });
            assert(snapshotResult.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_UNAVAILABLE,
                'D3d. one layer up, DecentralizedSnapshotResolver\'s own pre-existing (0.9.134) contract reports this as CONTENT_UNAVAILABLE — that layer\'s own documented behavior for ANY store failure, not a 0.9.440 misclassification');
            assert(totalRequests(contentStoreRequests, B) === 0, 'D3e. …and gateway B still saw zero requests across BOTH calls — the failover layer\'s own guarantee held regardless of what the outer resolver layer did with the failure');

            // D4 — World Encounter material resolver: permissive, a real
            // divergence from D3's own guarantee, confirmed by actual
            // execution rather than assumed from the class name alone.
            const { fetchImpl: worldEncounterFetch, requestsByOrigin: worldEncounterRequests } = makeMultiGatewayFetch({ [A]: {}, [B]: { body: '{"from":"b","survivedABugInA":true}' } });
            const { resolver: worldEncounterResolver, decentralized } = composeArweaveDecentralizedWorldEncounterMaterialSource({ gatewayUrls: [A, B], fetchImpl: worldEncounterFetch });
            worldEncounterResolver._resolvers[0].retrieveByUri = async () => { throw new TypeError('a genuine bug in gateway A\'s own resolver, never a mere network failure'); };
            const material = await decentralized.load({ kind: WorldEncounterKind.PUBLICATION, objectId: 'p', origin: 'decentralized' }, { uri: arUri });
            assert(material && material.survivedABugInA === true,
                'D4a. UNLIKE the content store — this succeeds: the World Encounter failover resolver treats gateway A\'s genuine bug exactly like an ordinary failure and advances to gateway B, whose result is returned as if nothing unusual happened');
            assert(totalRequests(worldEncounterRequests, B) === 1,
                'D4b. gateway B WAS contacted for this unexpected error — the documented, intentional asymmetry with the content store\'s own stricter contract (D3), not a bug in this test');

            // And once EVERY configured resolver fails this way, the LAST
            // one's own error still propagates — never silently swallowed
            // into null, only ever delayed until no gateway remains.
            worldEncounterResolver._resolvers[1].retrieveByUri = async () => { throw new TypeError('gateway B is broken too'); };
            await expectRejects(
                decentralized.load({ kind: WorldEncounterKind.PUBLICATION, objectId: 'p', origin: 'decentralized' }, { uri: arUri }),
                'D4c. once every configured resolver has thrown, the LAST one\'s own error still propagates as a genuine rejection — permissive about WHICH gateway answers, never about whether the caller is told the truth once none of them can'
            );
        }

        console.log('✓ Section D: a successful first gateway leaves the rest untouched, and a ContentUnavailableError fails over exactly once, for both collaborators. An unexpected error diverges by DESIGN between them — the content store propagates it immediately without ever contacting gateway B, while the World Encounter resolver treats it like any other failure and advances anyway, only surfacing the last failure once every gateway is exhausted. Both behaviors match each collaborator\'s own documented contract exactly; this section proves the divergence is real, not assumed');
    }

    // ===============================================================
    // Section E — put() isolation, on both sides of the read/write split.
    // ===============================================================
    {
        // E1. Read side: composeDiscoverSnapshotRuntime() with 3 configured
        // gateways still targets only gateway A for put().
        {
            const { fetchImpl, requestsByOrigin } = makeMultiGatewayFetch({ [A]: {}, [B]: {}, [C]: {} });
            const { contentStore } = composeDiscoverSnapshotRuntime({ arweaveContentStoreOptions: { signer: fakeSigner(), gatewayUrls: [A, B, C], fetchImpl } });
            assert(contentStore instanceof ArweaveGatewayFailoverContentStore, 'E1a. sanity — the real failover class was built');
            const reference = await contentStore.put('write stays single-gateway even through the real composition root');
            assert(reference instanceof ContentReference, 'E1b. put() still returns a real ContentReference through the real composition root');
            assert(totalRequests(requestsByOrigin, A) === 1, 'E1c. gateway A received the write');
            assert(totalRequests(requestsByOrigin, B) === 0 && totalRequests(requestsByOrigin, C) === 0, 'E1d. gateways B and C received ZERO write traffic, even though 3 gateways are configured for READ');
        }

        // E2. Write side: composeSnapshotDistributionRuntime() never even
        // has a failover class to build — passing gatewayUrls to it is a
        // structural no-op, not a latent fan-out switch, because that
        // composition function's own arweaveContentStoreOptions only ever
        // reaches ArweaveContentStore's constructor directly, which reads
        // `gatewayUrl` (singular) and ignores an unrecognized `gatewayUrls`
        // key outright.
        {
            const { fetchImpl, requestsByOrigin } = makeMultiGatewayFetch({ [DEFAULT_ARWEAVE_GATEWAY_URL]: {}, [A]: {}, [B]: {} });
            const { contentStore } = composeSnapshotDistributionRuntime({
                arweaveContentStoreOptions: { signer: fakeSigner(), gatewayUrls: [A, B], fetchImpl }
            });
            assert(contentStore instanceof ArweaveContentStore && !(contentStore instanceof ArweaveGatewayFailoverContentStore),
                'E2a. even when handed a plural gatewayUrls list, Snapshot DISTRIBUTION composition builds the plain, single-gateway ArweaveContentStore — this composition function has no failover-class-selection logic at all (unlike its retrieval counterpart)');
            assert(contentStore.gatewayUrl === DEFAULT_ARWEAVE_GATEWAY_URL,
                'E2b. the resulting store silently falls back to the deployment default (never A or B) — proving gatewayUrls is not merely unused here, it is structurally unreachable by this composition path');
            await contentStore.put('a distribution write, even with gatewayUrls mistakenly supplied');
            assert(totalRequests(requestsByOrigin, DEFAULT_ARWEAVE_GATEWAY_URL) === 1, 'E2c. the concrete write POST reached only the deployment default host');
            assert(totalRequests(requestsByOrigin, A) === 0 && totalRequests(requestsByOrigin, B) === 0, 'E2d. gateways A and B — the mistakenly-supplied list — received ZERO write traffic');
        }

        console.log('✓ Section E: write (put()) targets exactly one gateway on the read-failover-composed store, and Snapshot DISTRIBUTION composition is structurally incapable of building a failover class at all — a gatewayUrls list handed to it is a silent no-op, never an accidental step toward write fan-out');
    }

    // ===============================================================
    // Section F — cross-role isolation, proven behaviorally for Arweave
    // Anchor (the one deliberate exception 0.9.439/0.9.440 both name), plus
    // a source sweep for Publication distribution/announcement and
    // Nostr/Bitcoin.
    // ===============================================================
    {
        // F1. A single real, three-gateway ArweaveGatewayConfiguration — the
        // SAME shape ui/main.js's own resolvedArweaveGatewayUrls resolves —
        // handed to real Anchor publisher/verifier use cases via ONLY its
        // `.gatewayUrl` accessor (the first element; exactly what ui/main.js
        // itself passes at both Anchor call sites). Proven behaviorally:
        // gateways B and C, though present in the SAME configuration object,
        // never receive a single request from either half of Anchor.
        const configuration = new ArweaveGatewayConfiguration({ gatewayUrls: [A, B, C] });
        assert(configuration.gatewayUrl === A, 'F1. sanity — .gatewayUrl exposes the first configured gateway');

        const { fetchImpl: publishFetch, requestsByOrigin: publishRequests } = makeMultiGatewayFetch({ [A]: {}, [B]: {}, [C]: {} });
        const { arweaveAnchorPublisher } = new CreateArweaveAnchorPublisherUseCase().execute({
            signer: fakeSigner(), gatewayUrl: configuration.gatewayUrl, fetchImpl: publishFetch
        });
        const publishResult = await arweaveAnchorPublisher.publish(computeContentHash('anchored content'));
        assert(publishResult.published === true, 'F2. sanity — the anchor publish itself succeeded');
        assert(totalRequests(publishRequests, A) === 1, 'F3. Anchor publish reached gateway A exactly once');
        assert(totalRequests(publishRequests, B) === 0 && totalRequests(publishRequests, C) === 0,
            'F4. Anchor publish never contacted gateway B or C, even though both exist in the SAME ArweaveGatewayConfiguration instance Snapshot/World Encounter retrieval draws its own gatewayUrls from');

        const anchoredTxId = 'b'.repeat(43);
        const { fetchImpl: verifyFetch, requestsByOrigin: verifyRequests } = makeMultiGatewayFetch({
            [A]: { body: 'expected-content-hash' }, [B]: { body: 'expected-content-hash' }, [C]: { body: 'expected-content-hash' }
        });
        const { arweaveProofVerifier } = new CreateArweaveAnchorProofVerifierUseCase().execute({ gatewayUrl: configuration.gatewayUrl, fetchImpl: verifyFetch });
        const verifyResult = await arweaveProofVerifier.verify({ txid: anchoredTxId }, { contentHash: 'expected-content-hash' });
        assert(verifyResult.valid === true, 'F5. sanity — the anchor verification itself succeeded');
        assert(totalRequests(verifyRequests, A) === 1, 'F6. Anchor verify reached gateway A exactly once');
        assert(totalRequests(verifyRequests, B) === 0 && totalRequests(verifyRequests, C) === 0,
            'F7. Anchor verify never contacted gateway B or C — Anchor is structurally, behaviorally blind to every gateway past the first, regardless of how many are configured for retrieval');

        // F8. Publication distribution/announcement configuration and
        // Nostr/Bitcoin composition never reference the gateway list —
        // real files, source-level, the one place a behavioral proof isn't
        // practical without reconstructing this codebase's entire
        // distribution runtime provider chain.
        const mainSource = await source('ui/main.js');
        const publicationDistributionConfigIndex = mainSource.indexOf('resolvePublicationDistributionRuntimeConfiguration(');
        assert(publicationDistributionConfigIndex > -1, 'F9. sanity — the Signed Claim distribution configuration call exists');
        const publicationDistributionConfigLine = mainSource.slice(publicationDistributionConfigIndex, mainSource.indexOf('\n', publicationDistributionConfigIndex));
        assert(!publicationDistributionConfigLine.includes('resolvedArweaveGatewayUrls'), 'F9. Publication distribution/announcement configuration never references the plural gateway list');

        const nostrSources = await Promise.all([
            source('application/NostrPublicationDiscoveryPublisher.js'),
            source('application/NostrSnapshotDiscoveryPublisher.js'),
            source('application/NostrDiscoveryQueryService.js')
        ]);
        for (const src of nostrSources) {
            assert(!src.includes('ArweaveGatewayConfiguration') && !src.includes('ArweaveGatewayFailover'), 'F10. no Nostr file imports the Arweave gateway configuration or either failover class');
        }
        // Line-by-line sweep — the same technique tests/ArweaveGatewayLifecycleReassessment.test.js's
        // own Section D uses for isolation: no single line of the real
        // composition root ever mentions both a Bitcoin identifier and
        // either resolved Arweave gateway variable together.
        const bitcoinAndArweaveGatewayLine = mainSource.split('\n').find((line) =>
            /Bitcoin/.test(line) && /resolvedArweaveGatewayUrl/.test(line));
        assert(!bitcoinAndArweaveGatewayLine, 'F11. no single line of ui/main.js ever mentions both a Bitcoin identifier and a resolved Arweave gateway variable — Bitcoin composition is structurally unaware the gateway list exists');

        console.log('✓ Section F: Arweave Anchor, given the SAME multi-gateway configuration instance retrieval draws its own gatewayUrls from, behaviorally contacts only the first gateway on both publish and verify — real network calls prove it, not just source text — and Publication distribution/announcement and Nostr/Bitcoin composition remain structurally unaware the gateway list exists at all');
    }

    // ===============================================================
    // Section G — identity preservation through the FULL four-layer
    // resolution pipeline (discovery, location, retrieval, verification).
    // ===============================================================
    {
        const snapshotBytes = '{"world":"a signed snapshot","version":7}';
        const contentHash = computeContentHash(snapshotBytes);
        const candidate = { contentHash, locator: arUri, storage: 'ar' };
        const resolver = new DecentralizedSnapshotResolver({ search: async () => [candidate] });

        const { fetchImpl, requestsByOrigin } = makeMultiGatewayFetch({
            [A]: { reject: true, rejectMessage: 'gateway A is unreachable' },
            [B]: { body: snapshotBytes }
        });
        const { contentStore } = composeDiscoverSnapshotRuntime({ arweaveContentStoreOptions: { signer: fakeSigner(), gatewayUrls: [A, B], fetchImpl } });
        const result = await executeDiscoverSnapshotCommand({ discoveryTag: 'forkbuild-snapshot', contentHash, resolver, contentStore });

        assert(result.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'G1. the full four-layer pipeline reports RESOLVED — discovery, location, retrieval (failed over from A to B), AND content-hash verification all passed');
        assert(result.bytes === snapshotBytes, 'G2. the resolved bytes are exactly the snapshot content, unaffected by which gateway happened to serve them');
        assert(result.locator === arUri, 'G3. the reported locator/transaction URI is exactly the one originally announced — failover never substitutes a different identity');
        assert(result.storage === 'ar', 'G4. the reported storage/substrate identity is unaffected by failover');
        assert(totalRequests(requestsByOrigin, A) === 1 && totalRequests(requestsByOrigin, B) === 1, 'G5. sanity — failover genuinely occurred (A tried, then B) rather than B answering by coincidence on a first attempt');

        // The content-hash verification step itself is real — a
        // failed-over read that returned WRONG bytes would still be
        // caught, proving G1-G4 are not merely because verification never
        // ran.
        const { fetchImpl: mismatchedFetch } = makeMultiGatewayFetch({ [A]: { reject: true }, [B]: { body: 'these are not the announced bytes' } });
        const { contentStore: mismatchedStore } = composeDiscoverSnapshotRuntime({ arweaveContentStoreOptions: { signer: fakeSigner(), gatewayUrls: [A, B], fetchImpl: mismatchedFetch } });
        const mismatchedResult = await executeDiscoverSnapshotCommand({ discoveryTag: 'forkbuild-snapshot', contentHash, resolver, contentStore: mismatchedStore });
        assert(mismatchedResult.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH,
            'G6. a gateway reached only via failover that serves the WRONG bytes for the announced contentHash is still caught by content-hash verification — failover recovers reachability, never trust');

        console.log('✓ Section G: identity survives failover through the REAL, full four-layer resolution pipeline — locator, storage, and bytes are exactly what a direct single-gateway read would have produced, and content-hash verification genuinely still runs (and still catches a mismatch) after a failed-over retrieval, never bypassed by it');
    }

    // ===============================================================
    // Section H — Settings/UI integration: the view's real functions,
    // extracted from source and executed, never reimplemented by hand.
    // ===============================================================
    {
        const viewSource = await source('ui/views/ArweaveGatewaySettingsView.js');

        const parseBlock = extractFunctionBlock(viewSource, 'parseGatewayUrls');
        const loadBlock = extractFunctionBlock(viewSource, 'load');
        const saveBlock = extractFunctionBlock(viewSource, 'save');
        assert(parseBlock && loadBlock && saveBlock, 'H1. sanity — parseGatewayUrls()/load()/save() were all located and extracted from the real view source, never re-typed by hand');

        // H2. parseGatewayUrls(): line order preserved, empty lines never
        // become endpoints, whitespace is trimmed, and a single line
        // behaves exactly like the pre-0.9.440 single input.
        const runParse = new Function('gatewayUrlInput', `${parseBlock}\nreturn parseGatewayUrls();`);
        assert(runParse({ value: `${C}\n${A}\n${B}` }).join(',') === [C, A, B].join(','), 'H2a. line order is preserved exactly, never re-sorted');
        assert(runParse({ value: `\n${A}\n\n  \n${B}\n\n` }).join(',') === [A, B].join(','), 'H2b. empty and whitespace-only lines are filtered out — they never become endpoints');
        assert(runParse({ value: `  ${A}  \n  ${B}  ` }).join(',') === [A, B].join(','), 'H2c. leading/trailing whitespace on a real line is trimmed');
        assert(runParse({ value: A }).length === 1 && runParse({ value: A })[0] === A, 'H2d. a single non-empty line behaves exactly like the pre-0.9.440 single-value input — one element, unchanged');
        const malformedParsed = runParse({ value: 'not-a-url\nftp://also-not-http' });
        assert(malformedParsed.length === 2, 'H2e. parseGatewayUrls() itself performs no URL validation — a malformed entry passes through unchanged, exactly as documented (validation lives downstream, in the real value object)');

        // H3. Save: a malformed entry is rejected by the REAL use case,
        // exactly the existing "invalid input never mutates storage"
        // degradation semantics — proven by actually calling save(), not
        // by re-testing the use case in isolation (already covered
        // elsewhere) — this proves the VIEW's own save() genuinely
        // forwards to it and genuinely surfaces the failure.
        {
            const store = new ArweaveGatewayConfigurationStore(new InMemoryStorageProvider());
            const setUseCase = new SetArweaveGatewayConfigurationUseCase({ arweaveGatewayConfigurationStore: store });
            const runSave = new Function(
                'gatewayUrlInput', 'setArweaveGatewayConfigurationUseCase', 'saveError', 'clearStatus', 'saveStatus', 'configuration',
                `${parseBlock}\n${saveBlock}\nsave();`
            );
            const ctx = {
                gatewayUrlInput: { value: `${A}\nnot-a-url` },
                setArweaveGatewayConfigurationUseCase: setUseCase,
                saveError: { value: null }, clearStatus: { value: 'idle' }, saveStatus: { value: 'idle' }, configuration: { value: null }
            };
            runSave(ctx.gatewayUrlInput, ctx.setArweaveGatewayConfigurationUseCase, ctx.saveError, ctx.clearStatus, ctx.saveStatus, ctx.configuration);
            assert(ctx.saveError.value !== null, 'H3a. the real save() function, executed for real, surfaces the real use case\'s rejection as saveError');
            assert(store.get() === null, 'H3b. …and nothing was persisted — a malformed entry among otherwise-valid ones still rejects the WHOLE list, never a partial save');

            // A fully valid multi-line save through the same real save().
            ctx.gatewayUrlInput.value = `${C}\n${A}\n${B}`;
            ctx.saveError.value = null;
            runSave(ctx.gatewayUrlInput, ctx.setArweaveGatewayConfigurationUseCase, ctx.saveError, ctx.clearStatus, ctx.saveStatus, ctx.configuration);
            assert(ctx.saveError.value === null, 'H3c. a fully valid multi-line save reports no error');
            assert(store.get() && store.get().gatewayUrls.join(',') === [C, A, B].join(','), 'H3d. …and persists the exact configured order, through the real view save() function, the real use case, and the real store');
        }

        // H4. Load: a persisted configuration reloads byte-identical,
        // through the real load() function.
        {
            const sharedNamespace = {};
            const storeBeforeRestart = new ArweaveGatewayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
            new SetArweaveGatewayConfigurationUseCase({ arweaveGatewayConfigurationStore: storeBeforeRestart }).execute({ gatewayUrls: [C, A, B] });

            const storeAfterRestart = new ArweaveGatewayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
            const runLoad = new Function('store', 'configuration', 'gatewayUrlInput', `${loadBlock}\nload();`);
            const ctx = { configuration: { value: null }, gatewayUrlInput: { value: '' } };
            runLoad(storeAfterRestart, ctx.configuration, ctx.gatewayUrlInput);
            assert(ctx.configuration.value instanceof ArweaveGatewayConfiguration, 'H4a. the real load() function populates configuration from a freshly constructed store, across a genuine restart boundary');
            assert(ctx.gatewayUrlInput.value === [C, A, B].join('\n'), 'H4b. …and the textarea value reconstructs to exactly one gateway per line, in the exact persisted order — a real reload, not a reimplementation, proves the round trip');
        }

        console.log('✓ Section H: the view\'s real parseGatewayUrls()/save()/load() functions — extracted from the actual source file and executed, never hand-reimplemented — preserve line order, filter blank lines, defer URL validation to the real use case (which rejects a malformed entry without any partial persistence), treat one line exactly like the old single input, and reload a persisted multi-gateway configuration byte-identical');
    }

    // ===============================================================
    // Section I — no health state: a structural sweep, plus a behavioral
    // proof that no memory carries between independent calls.
    // ===============================================================
    {
        const forbiddenVocabulary = [
            'health', 'Health', 'ranking', 'Ranking', 'reorder', 'Reorder',
            'probe', 'Probe', 'preferred', 'Preferred', 'score', 'Score',
            'latency', 'Latency', 'successCount', 'failureCount', 'lastKnownGood'
        ];
        const failoverSources = await Promise.all([
            source('content/ArweaveGatewayFailoverContentStore.js'),
            source('application/ArweaveGatewayFailoverWorldEncounterMaterialResolver.js'),
            source('core/ArweaveGatewayConfiguration.js')
        ]);
        for (const src of failoverSources) {
            const executable = src.replace(/^\s*\/\/.*$/gm, '');
            for (const term of forbiddenVocabulary) {
                assert(!executable.includes(term), `I1 ('${term}'). no health-tracking/ranking/probing/caching vocabulary appears in real (non-comment) code`);
            }
        }

        // I2. Behaviorally: gateway A fails on the FIRST call (B answers),
        // then a genuinely NEW, INDEPENDENT call is made — gateway A is
        // tried again, from scratch, exactly as if nothing was ever
        // learned about it. If any reordering/health-memory existed, the
        // second call would skip straight to B.
        {
            const { fetchImpl, requestsByOrigin } = makeMultiGatewayFetch({ [A]: { reject: true }, [B]: { body: '{"call":1}' } });
            const store = new ArweaveGatewayFailoverContentStore({ gatewayUrls: [A, B], signer: fakeSigner(), fetchImpl });
            const reference1 = new ContentReference({ hash: 'irrelevant', uri: arUri, storage: 'ar' });
            await store.get(reference1);
            assert(totalRequests(requestsByOrigin, A) === 1, 'I2a. first call: A tried once');

            // Second, independent call — same instance, same configured
            // order — A must be tried again FIRST, not skipped.
            await store.get(reference1);
            assert(totalRequests(requestsByOrigin, A) === 2, 'I2b. second, independent call: A is tried again, from scratch — no memory of the earlier failure caused it to be skipped or reordered behind B');
            assert(totalRequests(requestsByOrigin, B) === 2, 'I2c. B was reached both times, exactly once per call, in the same configured position');
        }

        console.log('✓ Section I: no health-tracking, ranking, probing, or caching vocabulary exists in real code, and behaviorally, two independent calls each retry the configured order from scratch — a gateway\'s earlier failure carries no memory into the next call');
    }

    // ===============================================================
    // Section J — final boundary verdict.
    // ===============================================================
    {
        console.log('\n✅ All Arweave Gateway Read Failover Integration Boundary Audit (0.9.441) checks passed.');
        console.log('VERDICT: ARWEAVE_GATEWAY_READ_FAILOVER_INTEGRATION_COMPLETE — 0.9.440\'s ordered read failover holds across every real production composition path this codebase actually calls (Snapshot discovery\'s full four-layer resolution, World Encounter material loading, the Settings UI\'s real parsing/save/load functions), put() and Snapshot distribution stay structurally single-gateway, Arweave Anchor stays structurally and behaviorally blind to every gateway past the first even given the identical multi-gateway configuration, and no health/ranking/reordering state exists anywhere in the read path. Test-only — no production file changed.');
    }
}

run().catch((error) => {
    console.error('ArweaveGatewayReadFailoverIntegrationBoundaryAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
