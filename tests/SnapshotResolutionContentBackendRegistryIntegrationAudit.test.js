import { readFile } from 'node:fs/promises';

import { LocalContentStore } from '../content/LocalContentStore.js';
import { IpfsContentStore } from '../content/IpfsContentStore.js';
import { IpfsGatewayContentStore } from '../content/IpfsGatewayContentStore.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { SnapshotPlacementStoreRegistry } from '../application/snapshot/placement/SnapshotPlacementStoreRegistry.js';
import { executeSnapshotDistributionCommand } from '../application/snapshot/SnapshotDistributionCommand.js';
import { resolveSnapshotDistributionContentStore } from '../application/snapshot/SnapshotDistributionContentBackendSelection.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/nostr/NostrSnapshotDiscoveryPublisher.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/nostr/NostrSnapshotDiscoveryQueryService.js';
import { ArweaveSnapshotDiscoveryPublisher } from '../application/arweave/ArweaveSnapshotDiscoveryPublisher.js';
import { ArweaveSnapshotDiscoveryQueryService } from '../application/arweave/ArweaveSnapshotDiscoveryQueryService.js';
import { DecentralizedSnapshotResolver } from '../application/snapshot/DecentralizedSnapshotResolver.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/snapshot/DecentralizedSnapshotResolutionOutcome.js';
import { executeDiscoverSnapshotCommand } from '../application/snapshot/DiscoverSnapshotCommand.js';
import { executeResolveSelectedSnapshotCommand } from '../application/snapshot/ResolveSelectedSnapshotCommand.js';

// 0.9.508 — Snapshot Resolution Content Backend Registry Integration.
//
// tests/SnapshotContentBackendSelectionEndToEndIntegrationAudit.test.js's
// own 0.9.507 Section H found ONE real, scoped gap: production's own
// `discoverSnapshotCommand`/`resolveSelectedSnapshotCommand` (ui/main.js)
// resolved every discovered candidate through a single, fixed
// ArweaveContentStore, never the shared `storeRegistry` those same command
// boundaries (application/snapshot/DiscoverSnapshotCommand.js, application/
// ResolveSelectedSnapshotCommand.js) already accept and already forward
// to `DecentralizedSnapshotResolver`, unmodified, since 0.9.134/0.9.152.
// An IPFS-distributed Snapshot's own discovered candidate was permanently
// CONTENT_UNAVAILABLE through either production entry point.
//
// THIS MILESTONE'S OWN FIX, entirely in ui/main.js: both command wirings
// now pass `storeRegistry: publicationSnapshotPlacementResolutionStoreRegistry`
// — the SAME resolution-side registry Snapshot Placement's own resolution
// coordinator already built and already shares the one production
// ArweaveContentStore instance with (0.9.505) — instead of a fixed
// contentStore. ZERO application-layer file changed: application/
// DecentralizedSnapshotResolver.js, application/snapshot/DiscoverSnapshotCommand.js,
// application/snapshot/ResolveSelectedSnapshotCommand.js, application/
// SnapshotPlacementStoreRegistry.js, and every ContentStore implementation
// are all untouched — the fix 0.9.507 named ("pass storeRegistry") already
// existed in the architecture; only composition-root wiring changed.
//
//   Snapshot candidate { contentHash, locator, storage }
//         │
//         ▼
//   storage = 'ipfs' | 'ar'
//         │
//         ▼
//   publicationSnapshotPlacementResolutionStoreRegistry.get(storage)
//         │                              │
//         ▼                              ▼
//   IpfsGatewayContentStore      ArweaveContentStore
//         │                              │
//         └──────────────┬───────────────┘
//                         ▼
//                       bytes
//                         │
//                         ▼
//        contentHash verification (core/ContentReference.js#verify())
//
// THE RESOLVER NEVER DISCOVERS OR RANKS BACKENDS — the SELECTED
// candidate's own `storage` is the only input that chooses a store; no
// automatic fallback, no cross-substrate retry, no re-selection by
// contentHash. Every section below either proves that live, or (Section A)
// confirms the actual ui/main.js wiring text this milestone changed.
//
// LETTERED SECTIONS.
//   A. Production wiring — the real ui/main.js source now threads
//      `storeRegistry: publicationSnapshotPlacementResolutionStoreRegistry`
//      into both command boundaries, no fixed `contentStore` remains at
//      either call site, and `composeDiscoverSnapshotRuntime()` is no
//      longer handed an `arweaveContentStoreOptions` of its own — exactly
//      one ArweaveContentStore is constructed in production, still true,
//      now also true in practice (not merely by textual count).
//   B. FLAGSHIP — IPFS: distribute, announce (Nostr), discover, select,
//      resolve through the exact `{ resolver, storeRegistry }` shape
//      ui/main.js's own `discoverSnapshotCommand`/`resolveSelectedSnapshotCommand`
//      now use, verify.
//   C. Arweave regression — the identical entry points, unaffected.
//   D. Storage identity fidelity — storage='ipfs' selects the IPFS store,
//      storage='ar' selects the Arweave store, and only that one store is
//      ever touched.
//   E. Locator fidelity — the exact candidate locator reaches the
//      selected store, never a re-derived or substituted one.
//   F. Content-hash verification survives registry-based routing — a
//      tampered backend still yields CONTENT_HASH_MISMATCH, never a
//      silently accepted forgery.
//   G. Wrong-backend protection — an IPFS candidate against a
//      registry that only has Arweave (and vice versa) is
//      STORE_UNAVAILABLE, never silently retried against the other,
//      registered backend.
//   H. Failure isolation — the selected backend being genuinely
//      unavailable (content missing) never triggers an automatic attempt
//      against a different, healthy, registered backend.
//   I. Announcement independence — both Nostr and Arweave announcement/
//      discovery substrates carry either Content backend, resolved
//      correctly through the SAME new production wiring shape.
//   J. Selected-candidate semantics — two candidates sharing one
//      contentHash but differing storage/locator: the explicitly selected
//      candidate, and only it, determines which store is used.
//   K. No resolution-class or ContentStore-implementation changes — the
//      fix is confined to composition-root wiring.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - Any change to ContentStore implementations, the Distribution command,
//   or Announcement/Discovery.
// - Automatic cross-backend fallback, replication, or ranking of any kind
//   — see Sections G/H.
// - Re-litigating 0.9.507's own already-closed sections (A-G, I-O there) —
//   this file audits only the ONE gap 0.9.507 found and this milestone
//   fixed.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

let assertionCount = 0;
function check(condition, message) {
    assertionCount += 1;
    assert(condition, message);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function fakeCid(text) {
    return 'bafySEL508' + computeContentHash(text);
}

// A shared, in-memory "IPFS network" — Map<cid, text>. Written to by the
// Kubo-shaped fake node (creation registry's own IpfsContentStore, exactly
// like ui/main.js's own `snapshotPlacementStoreRegistry`), read from by the
// gateway-shaped fake (resolution registry's own IpfsGatewayContentStore,
// exactly like ui/main.js's own `publicationSnapshotPlacementResolutionStoreRegistry`)
// — mirroring the real two-registry production topology (ui/main.js's own
// 0.8.66/0.9.505 comments) rather than collapsing it into one store.
function makeFakeIpfsKuboNode(network) {
    return async function fetchImpl(url, options) {
        const parsed = new URL(url);
        if (parsed.pathname === '/api/v0/add') {
            const blob = options.body.get('file');
            const text = await blob.text();
            const cid = fakeCid(text);
            network.set(cid, text);
            return new Response(JSON.stringify({ Hash: cid, Size: String(text.length) }), { status: 200 });
        }
        if (parsed.pathname === '/api/v0/cat') {
            const cid = parsed.searchParams.get('arg');
            if (!network.has(cid)) return new Response('not found', { status: 500 });
            return new Response(network.get(cid), { status: 200 });
        }
        return new Response('unknown route', { status: 404 });
    };
}

function makeFakeIpfsGateway(network) {
    return async function fetchImpl(url) {
        const parsed = new URL(url);
        const match = parsed.pathname.match(/^\/ipfs\/(.+)$/);
        const cid = match ? decodeURIComponent(match[1]) : null;
        if (!cid || !network.has(cid)) {
            return new Response('not found', { status: 404 });
        }
        return new Response(network.get(cid), { status: 200 });
    };
}

function makeFakeArweaveContentGateway(network) {
    return async function fetchImpl(url, options = {}) {
        if (options.method === 'POST' && url.endsWith('/tx')) {
            const body = JSON.parse(options.body);
            network.set(body.id, body.data !== undefined ? String(body.data) : '');
            return new Response('accepted', { status: 200 });
        }
        const id = url.split('/').pop();
        if (!network.has(id)) return new Response('not found', { status: 404 });
        return new Response(network.get(id), { status: 200 });
    };
}

let arweaveTxCounter = 0;
function makeFakeArweaveSigner() {
    return {
        sign: async (material) => {
            arweaveTxCounter += 1;
            const id = `A508TxId${String(arweaveTxCounter).padStart(4, '0')}${'x'.repeat(21)}`;
            return { id, transaction: { id, data: material } };
        }
    };
}

function makeFakeNostrRelay() {
    const events = [];
    let idCounter = 0;
    const publishImpl = async (relayUrl, eventTemplate) => {
        idCounter += 1;
        const id = idCounter.toString(16).padStart(4, '0') + 'e'.repeat(60);
        events.push({ content: eventTemplate.content, tags: eventTemplate.tags, kind: eventTemplate.kind });
        return { published: true, id };
    };
    const queryImpl = async () => events.slice();
    return { publishImpl, queryImpl, events };
}

function makeFakeArweaveDiscoverySubstrate() {
    const transactionIds = [];
    const envelopes = {};
    let idCounter = 0;
    const uploadTaggedTransaction = async (material) => {
        idCounter += 1;
        const id = `D508Tx${String(idCounter).padStart(4, '0')}${'y'.repeat(25)}`;
        transactionIds.push(id);
        envelopes[id] = material;
        return { id };
    };
    const fetchImpl = async (url, options = {}) => {
        if ((options.method || 'GET') === 'POST') {
            return { ok: true, json: async () => ({ data: { transactions: { edges: transactionIds.map((id) => ({ node: { id } })) } } }) };
        }
        const parsed = new URL(url);
        const id = parsed.pathname.slice(1);
        if (Object.prototype.hasOwnProperty.call(envelopes, id)) {
            return { ok: true, headers: { get: () => null }, text: async () => envelopes[id] };
        }
        return { ok: false, headers: { get: () => null }, text: async () => 'not found' };
    };
    return { uploadTaggedTransaction, fetchImpl, transactionIds, envelopes };
}

function nostrRoundTrip(discoveryTag) {
    const relay = makeFakeNostrRelay();
    const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: relay.publishImpl });
    const queryService = new NostrSnapshotDiscoveryQueryService({ discoveryTag, queryImpl: relay.queryImpl });
    return { publisher, queryService, relay };
}

function arweaveDiscoveryRoundTrip(discoveryTag) {
    const substrate = makeFakeArweaveDiscoverySubstrate();
    const publisher = new ArweaveSnapshotDiscoveryPublisher({ discoveryTag, uploadTaggedTransaction: substrate.uploadTaggedTransaction });
    const queryService = new ArweaveSnapshotDiscoveryQueryService({ fetchImpl: substrate.fetchImpl });
    return { publisher, queryService, substrate };
}

// Builds the SAME two-registry shape ui/main.js's own real production
// composition holds: a CREATION registry (snapshotPlacementStoreRegistry's
// own shape — Local/IpfsContentStore(Kubo)/ArweaveContentStore) used only
// to PLACE content (exactly what Distribution reads from,
// resolveSnapshotDistributionContentStore()'s own real call site), and a
// RESOLUTION registry (publicationSnapshotPlacementResolutionStoreRegistry's
// own shape — Local/IpfsGatewayContentStore/ArweaveContentStore) used only
// to RESOLVE it back — sharing the SAME underlying IPFS/Arweave "networks"
// (mirroring content actually placed being genuinely fetchable back), and
// the SAME ArweaveContentStore INSTANCE across both registries, exactly as
// ui/main.js's own 0.9.505 comment documents ("registering into both, from
// ONE shared instance").
function buildProductionShapedRegistries({ arweaveSigner = makeFakeArweaveSigner(), ipfsNetwork = new Map(), arweaveNetwork = new Map() } = {}) {
    const sharedArweaveStore = new ArweaveContentStore({ signer: arweaveSigner, fetchImpl: makeFakeArweaveContentGateway(arweaveNetwork) });

    const creationRegistry = new SnapshotPlacementStoreRegistry();
    creationRegistry.register(new LocalContentStore(new InMemoryStorageProvider()));
    creationRegistry.register(new IpfsContentStore({ fetchImpl: makeFakeIpfsKuboNode(ipfsNetwork) }));
    creationRegistry.register(sharedArweaveStore);

    const resolutionRegistry = new SnapshotPlacementStoreRegistry();
    resolutionRegistry.register(new LocalContentStore(new InMemoryStorageProvider()));
    resolutionRegistry.register(new IpfsGatewayContentStore({ fetchImpl: makeFakeIpfsGateway(ipfsNetwork) }));
    resolutionRegistry.register(sharedArweaveStore);

    return { creationRegistry, resolutionRegistry, ipfsNetwork, arweaveNetwork, sharedArweaveStore };
}

async function run() {
    console.log('=== 0.9.508 — Snapshot Resolution Content Backend Registry Integration Audit ===\n');

    // ===============================================================
    // Section A — production wiring.
    // ===============================================================
    {
        const mainSource = await readFile(new URL('../ui/main.js', import.meta.url), 'utf8');

        check(mainSource.includes("resolver: snapshotResolver,\n    storeRegistry: publicationSnapshotPlacementResolutionStoreRegistry\n});\napp.provide('discoverSnapshotCommand'"),
            'A. discoverSnapshotCommand now passes storeRegistry: publicationSnapshotPlacementResolutionStoreRegistry, immediately followed by its own app.provide()');
        check(mainSource.includes("resolver: snapshotResolver,\n    storeRegistry: publicationSnapshotPlacementResolutionStoreRegistry\n});\napp.provide('resolveSelectedSnapshotCommand'"),
            'A. resolveSelectedSnapshotCommand now passes storeRegistry: publicationSnapshotPlacementResolutionStoreRegistry, immediately followed by its own app.provide()');

        check(!mainSource.includes('contentStore: snapshotRetrievalContentStore'),
            'A. neither production command wiring passes the old fixed, Arweave-only contentStore any longer');
        check(!/const\s*\{[^}]*contentStore:\s*snapshotRetrievalContentStore[^}]*\}\s*=\s*composeDiscoverSnapshotRuntime/.test(mainSource),
            'A. composeDiscoverSnapshotRuntime() no longer destructures a contentStore at all — it is entirely unused now');
        check(/composeDiscoverSnapshotRuntime\(\{\s*\n\s*nostrSnapshotDiscoveryQueryServiceOptions:/.test(mainSource),
            'A. composeDiscoverSnapshotRuntime() is called with only nostrSnapshotDiscoveryQueryServiceOptions — no arweaveContentStoreOptions of its own');

        check((mainSource.match(/new ArweaveContentStore\(/g) || []).length === 1,
            'A. exactly one ArweaveContentStore construction site remains in ui/main.js — and since composeDiscoverSnapshotRuntime() is no longer given a signer, it builds none of its own either, so this is now true in practice, not merely by textual count');
        check(mainSource.includes('snapshotPlacementStoreRegistry.register(arweaveSnapshotPlacementContentStore);') && mainSource.includes('publicationSnapshotPlacementResolutionStoreRegistry.register(arweaveSnapshotPlacementContentStore);'),
            'A. that one shared ArweaveContentStore instance is still registered into both the creation and resolution registries (0.9.505, unmodified by this milestone)');

        // The resolver itself is unaffected — it is built from queryService
        // alone, exactly as application/snapshot/DiscoverSnapshotRuntimeComposition.js's
        // own header already documents ("resolver depends only on a usable
        // queryImpl").
        check(mainSource.includes('const { resolver: snapshotResolver, queryService: snapshotDiscoveryQueryService } = composeDiscoverSnapshotRuntime({'),
            'A. snapshotResolver/snapshotDiscoveryQueryService are still built from the same composeDiscoverSnapshotRuntime() call, unaffected by removing its contentStore half');

        console.log('✓ A. production now wires storeRegistry (not a fixed contentStore) into both discoverSnapshotCommand and resolveSelectedSnapshotCommand, and the now-unused fixed ArweaveContentStore construction was removed rather than left dead.');
    }

    // ===============================================================
    // Section B — FLAGSHIP: IPFS, through the exact new production shape.
    // ===============================================================
    let flagshipIpfsHash;
    {
        const { creationRegistry, resolutionRegistry, ipfsNetwork } = buildProductionShapedRegistries();
        const { publisher, queryService } = nostrRoundTrip('a508-flagship-ipfs');
        const bytes = JSON.stringify({ world: 'a508-flagship-ipfs', v: 1 });

        // DISTRIBUTION — exactly ui/main.js's own snapshotDistributionCommand
        // shape: resolveSnapshotDistributionContentStore() against the
        // CREATION registry.
        const { contentReference, announcement } = await executeSnapshotDistributionCommand({
            bytes,
            contentStore: resolveSnapshotDistributionContentStore(creationRegistry, 'ipfs'),
            discoveryPublisher: publisher
        });
        check(contentReference.storage === 'ipfs' && contentReference.uri.startsWith('ipfs://'), 'B. Content genuinely reached IPFS');
        check(ipfsNetwork.has(contentReference.uri.slice('ipfs://'.length)), 'B. the bytes genuinely landed in the shared fake IPFS network');
        check(announcement && announcement.published === true, 'B. the real NostrSnapshotDiscoveryPublisher genuinely announced this placement');
        flagshipIpfsHash = contentReference.hash;

        // DISCOVERY — a real candidate, unresolved, exactly what
        // ui/main.js's own worldSnapshotDiscoveryMonitor/OwnPublicationPanel
        // would hand to discoverSnapshotCommand/resolveSelectedSnapshotCommand.
        const candidates = await queryService.search('a508-flagship-ipfs');
        check(candidates.length === 1 && candidates[0].contentHash === contentReference.hash && candidates[0].storage === 'ipfs',
            'B. the announced candidate is genuinely discoverable, unresolved, carrying storage: "ipfs"');
        const selectedCandidate = candidates[0];

        // RESOLUTION #1 — the exact new discoverSnapshotCommand shape:
        // { resolver, storeRegistry } against the RESOLUTION registry.
        const resolver = new DecentralizedSnapshotResolver(queryService);
        const viaDiscover = await executeDiscoverSnapshotCommand({
            discoveryTag: 'a508-flagship-ipfs',
            contentHash: contentReference.hash,
            resolver,
            storeRegistry: resolutionRegistry
        });
        check(viaDiscover.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED,
            `B. discoverSnapshotCommand's own new shape resolves the IPFS candidate to RESOLVED (got ${viaDiscover.outcome}: ${viaDiscover.reason})`);
        check(viaDiscover.bytes === bytes, 'B. discoverSnapshotCommand\'s resolved bytes are byte-for-byte the original Snapshot bytes');

        // RESOLUTION #2 — the exact new resolveSelectedSnapshotCommand
        // shape: the user's own EXPLICIT selection, resolved through the
        // SAME resolver/registry pair, via resolveCandidate() rather than
        // resolve().
        const viaSelected = await executeResolveSelectedSnapshotCommand({
            candidate: selectedCandidate,
            resolver,
            storeRegistry: resolutionRegistry
        });
        check(viaSelected.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED,
            `B. resolveSelectedSnapshotCommand's own new shape resolves the SAME IPFS candidate to RESOLVED (got ${viaSelected.outcome}: ${viaSelected.reason})`);
        check(viaSelected.bytes === bytes, 'B. resolveSelectedSnapshotCommand\'s resolved bytes are byte-for-byte correct');
        check(viaSelected.storage === 'ipfs' && viaSelected.locator === contentReference.uri, 'B. resolved storage/locator match exactly what was placed');

        console.log('✓ B. FLAGSHIP (IPFS) — distribute -> announce (Nostr) -> discover -> select -> resolve through BOTH production entry points\' new { resolver, storeRegistry } shape -> verify. The 0.9.507 gap is closed for this backend.');
    }

    // ===============================================================
    // Section C — Arweave regression: the identical entry points,
    // unaffected by removing the fixed contentStore.
    // ===============================================================
    {
        const { creationRegistry, resolutionRegistry, arweaveNetwork } = buildProductionShapedRegistries();
        const { publisher, queryService } = nostrRoundTrip('a508-regress-ar');
        const bytes = JSON.stringify({ world: 'a508-regress-ar', v: 1 });

        const { contentReference } = await executeSnapshotDistributionCommand({
            bytes, contentStore: resolveSnapshotDistributionContentStore(creationRegistry, 'ar'), discoveryPublisher: publisher
        });
        check(contentReference.storage === 'ar' && arweaveNetwork.has(contentReference.uri.slice('ar://'.length)), 'C. Content genuinely reached Arweave');

        const resolver = new DecentralizedSnapshotResolver(queryService);
        const result = await executeDiscoverSnapshotCommand({
            discoveryTag: 'a508-regress-ar', contentHash: contentReference.hash, resolver, storeRegistry: resolutionRegistry
        });
        check(result.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, `C. an Arweave candidate still resolves through the new registry-based wiring (got ${result.outcome})`);
        check(result.bytes === bytes && result.storage === 'ar', 'C. resolved bytes/storage are correct');

        const selectedResult = await executeResolveSelectedSnapshotCommand({
            candidate: { contentHash: contentReference.hash, locator: contentReference.uri, storage: 'ar' },
            resolver,
            storeRegistry: resolutionRegistry
        });
        check(selectedResult.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'C. resolveSelectedSnapshotCommand also still resolves the Arweave candidate correctly');

        console.log('✓ C. Arweave — unaffected by this milestone\'s change; both production entry points still resolve it correctly.');
    }

    // ===============================================================
    // Section D — storage identity fidelity: storage picks the store,
    // and only that store is ever touched.
    // ===============================================================
    {
        const { creationRegistry, resolutionRegistry, ipfsNetwork, arweaveNetwork } = buildProductionShapedRegistries();
        let ipfsGetCalls = 0;
        let arweaveGetCalls = 0;
        const ipfsStore = resolutionRegistry.get('ipfs');
        const arweaveStore = resolutionRegistry.get('ar');
        const originalIpfsGet = ipfsStore.get.bind(ipfsStore);
        const originalArweaveGet = arweaveStore.get.bind(arweaveStore);
        ipfsStore.get = async (ref) => { ipfsGetCalls += 1; return originalIpfsGet(ref); };
        arweaveStore.get = async (ref) => { arweaveGetCalls += 1; return originalArweaveGet(ref); };

        const discoveryPublisher = { discoveryTag: 'a508-d', publish: async () => null };
        const ipfsBytes = JSON.stringify({ d: 'ipfs' });
        const { contentReference: ipfsRef } = await executeSnapshotDistributionCommand({
            bytes: ipfsBytes, contentStore: resolveSnapshotDistributionContentStore(creationRegistry, 'ipfs'), discoveryPublisher
        });
        const resolver = new DecentralizedSnapshotResolver({ search: async () => [] });

        const ipfsResult = await resolver.resolveCandidate({ contentHash: ipfsRef.hash, locator: ipfsRef.uri, storage: 'ipfs' }, { storeRegistry: resolutionRegistry });
        check(ipfsResult.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'D. storage: "ipfs" resolves via the IPFS store');
        check(ipfsGetCalls === 1 && arweaveGetCalls === 0, 'D. resolving an IPFS candidate touches ONLY the IPFS store\'s get() — the Arweave store is never even called');

        const arweaveBytes = JSON.stringify({ d: 'ar' });
        const { contentReference: arRef } = await executeSnapshotDistributionCommand({
            bytes: arweaveBytes, contentStore: resolveSnapshotDistributionContentStore(creationRegistry, 'ar'), discoveryPublisher
        });
        const arResult = await resolver.resolveCandidate({ contentHash: arRef.hash, locator: arRef.uri, storage: 'ar' }, { storeRegistry: resolutionRegistry });
        check(arResult.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'D. storage: "ar" resolves via the Arweave store');
        check(ipfsGetCalls === 1 && arweaveGetCalls === 1, 'D. resolving the Arweave candidate touches ONLY the Arweave store\'s get() — the IPFS store\'s call count is unchanged from before');

        console.log('✓ D. the selected candidate\'s own storage identity, and only it, determines which registered store is consulted.');
    }

    // ===============================================================
    // Section E — locator fidelity: the exact candidate locator reaches
    // the selected store.
    // ===============================================================
    {
        const { creationRegistry, resolutionRegistry } = buildProductionShapedRegistries();
        const discoveryPublisher = { discoveryTag: 'a508-e', publish: async () => null };
        const bytes = JSON.stringify({ e: 'locator-fidelity' });
        const { contentReference } = await executeSnapshotDistributionCommand({
            bytes, contentStore: resolveSnapshotDistributionContentStore(creationRegistry, 'ipfs'), discoveryPublisher
        });

        const ipfsStore = resolutionRegistry.get('ipfs');
        let seenUri = null;
        const originalGet = ipfsStore.get.bind(ipfsStore);
        ipfsStore.get = async (ref) => { seenUri = ref.uri; return originalGet(ref); };

        const resolver = new DecentralizedSnapshotResolver({ search: async () => [] });
        const result = await resolver.resolveCandidate(
            { contentHash: contentReference.hash, locator: contentReference.uri, storage: 'ipfs' },
            { storeRegistry: resolutionRegistry }
        );
        check(result.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'E. sanity — the candidate resolves');
        check(seenUri === contentReference.uri, 'E. the exact candidate locator (never a re-derived or normalized one) is what reaches the selected store\'s own get()');
        check(result.locator === contentReference.uri, 'E. the result\'s own reported locator is the same exact value too');

        console.log('✓ E. the selected candidate\'s exact locator is passed through to the resolved ContentStore, unmodified.');
    }

    // ===============================================================
    // Section F — content-hash verification survives registry-based
    // routing.
    // ===============================================================
    {
        const { creationRegistry, resolutionRegistry, ipfsNetwork } = buildProductionShapedRegistries();
        const discoveryPublisher = { discoveryTag: 'a508-f', publish: async () => null };
        const bytes = JSON.stringify({ f: 'will-be-tampered' });
        const { contentReference } = await executeSnapshotDistributionCommand({
            bytes, contentStore: resolveSnapshotDistributionContentStore(creationRegistry, 'ipfs'), discoveryPublisher
        });

        // Corrupt the bytes actually sitting in the shared IPFS network,
        // AFTER placement — simulating a backend that hands back the wrong
        // bytes for a genuinely resolvable locator.
        const cid = contentReference.uri.slice('ipfs://'.length);
        ipfsNetwork.set(cid, 'these are not the bytes that were placed');

        const resolver = new DecentralizedSnapshotResolver({ search: async () => [] });
        const result = await resolver.resolveCandidate(
            { contentHash: contentReference.hash, locator: contentReference.uri, storage: 'ipfs' },
            { storeRegistry: resolutionRegistry }
        );
        check(result.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH,
            `F. tampered bytes resolved through the registry-based path still produce CONTENT_HASH_MISMATCH, never a silently accepted forgery (got ${result.outcome})`);
        check(result.bytes === null, 'F. no bytes are returned on a hash mismatch');

        console.log('✓ F. selecting a ContentStore by storage never weakens or bypasses contentHash verification.');
    }

    // ===============================================================
    // Section G — wrong-backend protection: never silently retried
    // against a different, registered backend.
    // ===============================================================
    {
        const { creationRegistry, ipfsNetwork, arweaveNetwork } = buildProductionShapedRegistries();
        const discoveryPublisher = { discoveryTag: 'a508-g', publish: async () => null };

        const { contentReference: ipfsRef } = await executeSnapshotDistributionCommand({
            bytes: JSON.stringify({ g: 'ipfs' }), contentStore: resolveSnapshotDistributionContentStore(creationRegistry, 'ipfs'), discoveryPublisher
        });
        const { contentReference: arRef } = await executeSnapshotDistributionCommand({
            bytes: JSON.stringify({ g: 'ar' }), contentStore: resolveSnapshotDistributionContentStore(creationRegistry, 'ar'), discoveryPublisher
        });

        // A resolution registry carrying ONLY Arweave — an IPFS candidate
        // must never be silently sent there.
        const arweaveOnlyRegistry = new SnapshotPlacementStoreRegistry();
        arweaveOnlyRegistry.register(new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: makeFakeArweaveContentGateway(arweaveNetwork) }));
        const resolver = new DecentralizedSnapshotResolver({ search: async () => [] });
        const ipfsAgainstArweaveOnly = await resolver.resolveCandidate(
            { contentHash: ipfsRef.hash, locator: ipfsRef.uri, storage: 'ipfs' },
            { storeRegistry: arweaveOnlyRegistry }
        );
        check(ipfsAgainstArweaveOnly.outcome === DecentralizedSnapshotResolutionOutcome.STORE_UNAVAILABLE,
            `G. an IPFS candidate against a registry carrying only Arweave is STORE_UNAVAILABLE, never silently sent to the registered Arweave store instead (got ${ipfsAgainstArweaveOnly.outcome})`);

        // The reverse: a registry carrying ONLY IPFS — an Arweave
        // candidate must never be silently sent there.
        const ipfsOnlyRegistry = new SnapshotPlacementStoreRegistry();
        ipfsOnlyRegistry.register(new IpfsGatewayContentStore({ fetchImpl: makeFakeIpfsGateway(ipfsNetwork) }));
        const arAgainstIpfsOnly = await resolver.resolveCandidate(
            { contentHash: arRef.hash, locator: arRef.uri, storage: 'ar' },
            { storeRegistry: ipfsOnlyRegistry }
        );
        check(arAgainstIpfsOnly.outcome === DecentralizedSnapshotResolutionOutcome.STORE_UNAVAILABLE,
            `G. an Arweave candidate against a registry carrying only IPFS is STORE_UNAVAILABLE, never silently sent to the registered IPFS store instead (got ${arAgainstIpfsOnly.outcome})`);

        console.log('✓ G. an unmatched storage identity always reports STORE_UNAVAILABLE — it is never silently retried against a different, registered backend.');
    }

    // ===============================================================
    // Section H — failure isolation: a genuinely unavailable selected
    // backend never triggers an automatic attempt against a different,
    // healthy, registered backend.
    // ===============================================================
    {
        const { resolutionRegistry, arweaveNetwork } = buildProductionShapedRegistries();
        const arweaveStore = resolutionRegistry.get('ar');
        let arweaveGetCalls = 0;
        const originalGet = arweaveStore.get.bind(arweaveStore);
        arweaveStore.get = async (ref) => { arweaveGetCalls += 1; return originalGet(ref); };

        const resolver = new DecentralizedSnapshotResolver({ search: async () => [] });
        // A well-formed IPFS candidate whose CID was never actually placed
        // — genuinely missing content, not a routing mistake.
        const result = await resolver.resolveCandidate(
            { contentHash: 'deadbeef'.repeat(8), locator: 'ipfs://bafyNeverPlacedAnywhere', storage: 'ipfs' },
            { storeRegistry: resolutionRegistry }
        );
        check(result.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_UNAVAILABLE,
            `H. a genuinely missing IPFS candidate reports CONTENT_UNAVAILABLE (got ${result.outcome})`);
        check(arweaveGetCalls === 0, 'H. the healthy, registered Arweave store is never even called when the SELECTED backend (IPFS) fails — no automatic cross-substrate fallback of any kind');
        check(arweaveNetwork.size === 0, 'H. sanity — nothing was ever placed on Arweave in this section, confirming the store truly was never touched');

        console.log('✓ H. a failing selected backend is reported honestly; it never causes an automatic attempt against a different, registered backend.');
    }

    // ===============================================================
    // Section I — announcement independence: both Nostr and Arweave
    // announcement/discovery substrates carry either Content backend,
    // resolved through the SAME new production wiring shape.
    // ===============================================================
    {
        const combinations = [
            { content: 'ipfs', discovery: 'nostr' },
            { content: 'ipfs', discovery: 'arweave' },
            { content: 'ar', discovery: 'nostr' },
            { content: 'ar', discovery: 'arweave' }
        ];

        for (const { content, discovery } of combinations) {
            const { creationRegistry, resolutionRegistry } = buildProductionShapedRegistries();
            const discoveryTag = `a508-i-${content}-${discovery}`;
            const bytes = JSON.stringify({ content, discovery });

            const { publisher, queryService } = discovery === 'nostr' ? nostrRoundTrip(discoveryTag) : arweaveDiscoveryRoundTrip(discoveryTag);

            const { contentReference } = await executeSnapshotDistributionCommand({
                bytes, contentStore: resolveSnapshotDistributionContentStore(creationRegistry, content), discoveryPublisher: publisher
            });

            const resolver = new DecentralizedSnapshotResolver(queryService);
            const result = await executeDiscoverSnapshotCommand({
                discoveryTag, contentHash: contentReference.hash, resolver, storeRegistry: resolutionRegistry
            });
            check(result.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED,
                `I. [content=${content}, discovery=${discovery}] resolves through the new registry-based wiring (got ${result.outcome}: ${result.reason})`);
            check(result.bytes === bytes && result.storage === content, `I. [content=${content}, discovery=${discovery}] resolved bytes/storage are correct`);
        }

        console.log('✓ I. all four (Content x Announcement/Discovery) combinations resolve correctly through the new production wiring shape — Announcement substrate never determines the Content backend.');
    }

    // ===============================================================
    // Section J — selected-candidate semantics: two candidates sharing
    // one contentHash but differing storage/locator — the EXPLICITLY
    // selected one, and only it, determines resolution.
    // ===============================================================
    {
        const { creationRegistry, resolutionRegistry } = buildProductionShapedRegistries();
        const discoveryPublisher = { discoveryTag: 'a508-j', publish: async () => null };
        // IDENTICAL bytes placed on BOTH backends — a legitimate way for
        // two genuinely different candidates to share one contentHash.
        const bytes = JSON.stringify({ j: 'identical-bytes-both-backends' });

        const { contentReference: ipfsRef } = await executeSnapshotDistributionCommand({
            bytes, contentStore: resolveSnapshotDistributionContentStore(creationRegistry, 'ipfs'), discoveryPublisher
        });
        const { contentReference: arRef } = await executeSnapshotDistributionCommand({
            bytes, contentStore: resolveSnapshotDistributionContentStore(creationRegistry, 'ar'), discoveryPublisher
        });
        check(ipfsRef.hash === arRef.hash, 'J. sanity — identical bytes genuinely produce one shared contentHash across both backends');
        check(ipfsRef.uri !== arRef.uri && ipfsRef.storage !== arRef.storage, 'J. sanity — the two candidates genuinely differ in storage/locator');

        const resolver = new DecentralizedSnapshotResolver({ search: async () => [] });

        const ipfsCandidate = { contentHash: ipfsRef.hash, locator: ipfsRef.uri, storage: ipfsRef.storage };
        const viaIpfsSelection = await executeResolveSelectedSnapshotCommand({ candidate: ipfsCandidate, resolver, storeRegistry: resolutionRegistry });
        check(viaIpfsSelection.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED && viaIpfsSelection.storage === 'ipfs' && viaIpfsSelection.locator === ipfsRef.uri,
            'J. explicitly selecting the IPFS candidate resolves via IPFS, even though an Arweave candidate with the identical contentHash also exists');
        check(viaIpfsSelection.candidates.length === 1 && viaIpfsSelection.candidates[0] === ipfsCandidate,
            'J. the result\'s own candidates array is exactly [the selected candidate] — never re-expanded to include the other one sharing this contentHash');

        const arCandidate = { contentHash: arRef.hash, locator: arRef.uri, storage: arRef.storage };
        const viaArSelection = await executeResolveSelectedSnapshotCommand({ candidate: arCandidate, resolver, storeRegistry: resolutionRegistry });
        check(viaArSelection.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED && viaArSelection.storage === 'ar' && viaArSelection.locator === arRef.uri,
            'J. explicitly selecting the Arweave candidate resolves via Arweave instead — the SAME contentHash, a genuinely different resolution, driven entirely by which candidate was selected');

        console.log('✓ J. the resolution registry integration preserves exact selected-candidate semantics — two candidates sharing a contentHash never collapse into "whichever resolves first."');
    }

    // ===============================================================
    // Section K — no resolution-class or ContentStore-implementation
    // changes; the fix is confined to composition-root wiring.
    // ===============================================================
    {
        const resolverSource = await readFile(new URL('../application/snapshot/DecentralizedSnapshotResolver.js', import.meta.url), 'utf8');
        check(!resolverSource.includes('publicationSnapshotPlacementResolutionStoreRegistry'),
            'K. application/snapshot/DecentralizedSnapshotResolver.js has no idea ui/main.js\'s own named registry variable exists — it stays a generic storeRegistry consumer');
        check(resolverSource.includes('contentStore || (storeRegistry ? storeRegistry.get(candidate.storage) : null)'),
            'K. the resolution rule itself (explicit contentStore wins, else storeRegistry.get(storage)) is byte-for-byte unchanged from before this milestone');

        const discoverCommandSource = await readFile(new URL('../application/snapshot/DiscoverSnapshotCommand.js', import.meta.url), 'utf8');
        const selectedCommandSource = await readFile(new URL('../application/snapshot/ResolveSelectedSnapshotCommand.js', import.meta.url), 'utf8');
        check(discoverCommandSource.includes('resolver.resolve(discoveryTag, contentHash, { contentStore, storeRegistry })'),
            'K. application/snapshot/DiscoverSnapshotCommand.js still forwards contentStore/storeRegistry verbatim — no new logic of its own');
        check(selectedCommandSource.includes('resolver.resolveCandidate(candidate, { contentStore, storeRegistry })'),
            'K. application/snapshot/ResolveSelectedSnapshotCommand.js still forwards contentStore/storeRegistry verbatim — no new logic of its own');

        const registrySource = await readFile(new URL('../application/snapshot/placement/SnapshotPlacementStoreRegistry.js', import.meta.url), 'utf8');
        check(registrySource.includes('return this._stores.get(storage) || null;'),
            'K. application/snapshot/placement/SnapshotPlacementStoreRegistry.js#get() is still the identical, unmodified one-line lookup — no ranking, retry, or fallback loop was added to it');

        console.log('✓ K. every resolution class and ContentStore implementation is untouched — this milestone\'s entire fix lives in ui/main.js\'s own composition-root wiring.');
    }

    console.log(`\n✅ All Snapshot Resolution Content Backend Registry Integration Audit checks passed (${assertionCount} assertions).\n`);
    console.log('VERDICT.');
    console.log('  The 0.9.507 Section H gap is CLOSED: production\'s own discoverSnapshotCommand/resolveSelectedSnapshotCommand (and, transitively, AutomaticSnapshotEncounterCascade) now resolve a discovered candidate\'s storage against the shared publicationSnapshotPlacementResolutionStoreRegistry — both IPFS and Arweave candidates resolve correctly through both production entry points (Sections B/C/I).');
    console.log('  Storage identity fidelity, locator fidelity, and contentHash verification all hold through registry-based routing (Sections D/E/F).');
    console.log('  No automatic fallback of any kind exists: an unmatched storage is STORE_UNAVAILABLE (Section G), and a genuinely failing selected backend never triggers a different, healthy backend to be tried instead (Section H).');
    console.log('  Selected-candidate semantics are preserved exactly — two candidates sharing a contentHash never collapse into one another (Section J).');
    console.log('  The fix is confined entirely to ui/main.js\'s own composition-root wiring; every resolution class and ContentStore implementation is untouched (Section K).');
}

await run();
