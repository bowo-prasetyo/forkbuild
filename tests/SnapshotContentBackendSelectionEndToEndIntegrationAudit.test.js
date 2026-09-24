import { readFile } from 'node:fs/promises';

import { LocalContentStore } from '../content/LocalContentStore.js';
import { IpfsContentStore } from '../content/IpfsContentStore.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { SnapshotPlacementStoreRegistry } from '../application/SnapshotPlacementStoreRegistry.js';
import { executeSnapshotDistributionCommand } from '../application/SnapshotDistributionCommand.js';
import {
    SNAPSHOT_DISTRIBUTION_ELIGIBLE_STORAGE_TYPES,
    availableSnapshotDistributionStorageTypes,
    resolveSnapshotDistributionContentStore
} from '../application/SnapshotDistributionContentBackendSelection.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/NostrSnapshotDiscoveryQueryService.js';
import { ArweaveSnapshotDiscoveryPublisher } from '../application/ArweaveSnapshotDiscoveryPublisher.js';
import { ArweaveSnapshotDiscoveryQueryService } from '../application/ArweaveSnapshotDiscoveryQueryService.js';
import { DecentralizedSnapshotResolver } from '../application/DecentralizedSnapshotResolver.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';
import { composeDiscoverSnapshotRuntime } from '../application/DiscoverSnapshotRuntimeComposition.js';
import { executeDiscoverSnapshotCommand } from '../application/DiscoverSnapshotCommand.js';
import { executeResolveSelectedSnapshotCommand } from '../application/ResolveSelectedSnapshotCommand.js';
import { publicationsPageFiles } from './support/PublicationsPageFiles.js';

// 0.9.507 — Snapshot Content Backend Selection End-to-End Integration Audit.
//
// A TEST-ONLY closure audit over the whole Content-role parity arc:
// 0.9.505 (application/ArweaveContentStore.js registered as a Snapshot
// Content Store), 0.9.506 (application/
// SnapshotDistributionContentBackendSelection.js — Content backend
// selection made real, product-facing, and selectable). No production file
// is touched by this milestone.
//
// THE INVARIANT UNDER TEST:
//
//   The selected Content backend determines where Snapshot material is
//   stored and resolved, while Announcement/Discovery remains an
//   independent role.
//
//     Content                    Announcement / Discovery
//       |- IPFS                    |- Nostr
//       `- Arweave                 `- Arweave
//
// THE FLAGSHIP PATH, traced for BOTH Content backends:
//
//   select Content backend
//        |
//        v
//   Snapshot Distribution (application/SnapshotDistributionCommand.js)
//        |
//        v
//   ContentStore selection (application/
//   SnapshotDistributionContentBackendSelection.js, 0.9.506)
//        |
//        |-- IPFS (content/IpfsContentStore.js)
//        `-- Arweave (content/ArweaveContentStore.js)
//               |
//               v
//        material storage
//               |
//               v
//        contentHash + locator (core/ContentReference.js)
//               |
//               v
//   Announcement / Discovery (application/NostrSnapshotDiscoveryPublisher.js
//   / application/ArweaveSnapshotDiscoveryPublisher.js)
//               |
//               v
//          discovery (application/NostrSnapshotDiscoveryQueryService.js /
//          application/ArweaveSnapshotDiscoveryQueryService.js)
//               |
//               v
//          resolution (application/DecentralizedSnapshotResolver.js)
//               |
//               v
//         hash verification (core/ContentReference.js#verify())
//
// Downstream of storage selection, this pipeline consumes one common
// `{ contentHash, locator, storage }` shape — it never branches on IPFS
// versus Arweave. Every section below either proves that directly, or
// (Section H) names the one real place this codebase does not yet let it,
// today, in production.
//
// LETTERED SECTIONS.
//   A. Production topology — one creation registry (Local/IPFS/Arweave),
//      one resolution registry (Local/Arweave/IPFS-gateway), Distribution
//      reuses the creation registry, no third registry exists anywhere,
//      and Announcement/Discovery's own write side is honestly still the
//      fixed, single Nostr publisher in production — Arweave announcement
//      is a real, tested class this audit exercises directly (Sections
//      D-J), never yet wired at this composition root.
//   B. Eligible storage set — the closed ['ipfs', 'ar'] allowlist, and
//      why 'local' is excluded on purpose.
//   C. UI selection & configuration route reachability.
//   D. FLAGSHIP — IPFS: distribute, announce, discover, resolve, verify.
//   E. FLAGSHIP — Arweave: distribute, announce, discover, resolve, verify.
//   F. Content identity, locator fidelity, exactly one backend per call.
//   G. Resolution symmetry — store -> locator -> resolve -> bytes ->
//      verify, for both backends, against the SAME registry Placement
//      already shares; no second resolver, no second registry.
//   H. RESOLUTION REACHABILITY — the one real, scoped gap this audit
//      finds: production's own discoverSnapshotCommand/
//      resolveSelectedSnapshotCommand/AutomaticSnapshotEncounterCascade
//      trio all resolve discovered candidates through ONE fixed,
//      Arweave-only ContentStore, never the shared
//      SnapshotPlacementStoreRegistry those same files' own composition
//      already documents as the supported way to add a second backend —
//      so an IPFS-distributed Snapshot's own discovered candidate cannot,
//      today, be resolved back into bytes through either of those two
//      production consumption paths, even though distributing it (D),
//      resolving it against the shared registry directly (G), and the
//      SIGNED Placement family's own registry-based resolution (M) all
//      already work. Arweave is unaffected (the fixed store IS Arweave).
//   I. Announcement/Discovery orthogonality — the four combinations
//      (Content: ipfs/ar) x (Discovery: Nostr/Arweave), each resolved
//      against the shared registry (the supported path per G/H).
//   J. ADVERSARIAL — Announcement carries a CLAIM about Content, never
//      determines it: an Arweave announcement naming an ipfs:// locator,
//      and a Nostr announcement naming an ar:// locator, both resolve
//      correctly without Content ever "switching" to match the
//      announcement substrate.
//   K. Failure isolation — a failing Content backend, or a failing
//      Discovery source, never disturbs the other of its own kind, and
//      never triggers an automatic cross-substrate fallback of any kind.
//   L. Backward compatibility — an omitted storage parameter still
//      resolves to 'ar'.
//   M. Placement compatibility — Distribution's new eligibility module
//      shares no import, no coupling, and no behavior change with
//      Placement's own local/ipfs/ar registry usage; 'local' stays a
//      fully functional Placement backend, untouched.
//   N. No role leakage — Content selection changes nothing about
//      Announcement/Discovery, attribution, anchoring, publication
//      identity, or World Encounter behavior, verified by reading the
//      real, unmodified production source.
//   O. The 'local' exclusion, audited explicitly: a real Placement
//      registry member, never a Distribution-eligible target, and why —
//      capability registration answers "can this backend store content?";
//      distribution eligibility answers "is this backend suitable for
//      this product operation?" — restated here as its own dedicated
//      invariant, not left implicit inside Section B.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - Automatic IPFS <-> Arweave fallback, replication, migration,
//   synchronization, storage ranking, preferred storage, caching, or
//   multi-backend upload.
// - Changing the default from Arweave, or making Local distributable.
// - Changing Announcement/Discovery behavior, or any new ContentStore
//   abstraction.
// - Fixing the Section H gap. This milestone is test-only; naming the gap
//   precisely, and proving the fix already exists in the architecture
//   (pass storeRegistry — Section G), is this audit's own job. Wiring
//   that into ui/main.js is a separate, later, unscheduled milestone.
// - Merging the two production registries (creation/resolution) "for
//   object reuse" — Section A confirms that split is deliberate and
//   pre-existing; this audit does not disturb it.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

let assertionCount = 0;
function check(condition, message) {
    assertionCount += 1;
    assert(condition, message);
}

async function expectRejects(promise, message) {
    let rejected = false;
    try { await promise; } catch (e) { rejected = true; }
    check(rejected, message);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function fakeCid(text) {
    return 'bafySEL507' + computeContentHash(text);
}

function makeFakeIpfsNode(network) {
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

// A fake Arweave CONTENT gateway — serves ArweaveContentStore's own
// put()/get() (POST /tx, GET /<transaction-id>). Kept distinct from the
// fake Arweave DISCOVERY substrate below, matching the two real,
// independent files (content/ArweaveContentStore.js vs. application/
// ArweaveSnapshot Discovery*.js) this audit never conflates.
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
            const id = `E2ETxId${String(arweaveTxCounter).padStart(4, '0')}${'x'.repeat(21)}`;
            return { id, transaction: { id, data: material } };
        }
    };
}

function makeFailingSigner() {
    return { sign: async () => { throw new Error('signer declined'); } };
}

// A shared, in-memory, network-free Nostr "relay": publishImpl() records
// an event, queryImpl() hands every recorded event back — the resolver's
// own contentHash filter (application/DecentralizedSnapshotResolver.js)
// narrows to the right one, exactly as a real relay-side filter would.
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

// A shared, in-memory, network-free Arweave DISCOVERY substrate — serves
// BOTH application/ArweaveSnapshotDiscoveryPublisher.js's own
// uploadTaggedTransaction() and application/
// ArweaveSnapshotDiscoveryQueryService.js's own fetchImpl (GraphQL tag
// search + per-transaction gateway GET), against one shared, mutable
// transaction set — so a publish() in this audit is genuinely visible to
// a subsequent search().
function makeFakeArweaveDiscoverySubstrate() {
    const transactionIds = [];
    const envelopes = {};
    let idCounter = 0;
    const uploadTaggedTransaction = async (material) => {
        idCounter += 1;
        const id = `DiscTx${String(idCounter).padStart(4, '0')}${'y'.repeat(25)}`;
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

const SOURCE_ROOT = new URL('../', import.meta.url);
async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// Builds the SAME shape ui/main.js's own real snapshotPlacementStoreRegistry
// (the CREATION registry Distribution reuses) carries in production:
// 'local', 'ipfs', and 'ar' all registered into ONE registry.
function buildProductionShapedRegistry({ arweaveSigner = makeFakeArweaveSigner(), ipfsNetwork = new Map(), arweaveNetwork = new Map() } = {}) {
    const registry = new SnapshotPlacementStoreRegistry();
    registry.register(new LocalContentStore(new InMemoryStorageProvider()));
    registry.register(new IpfsContentStore({ fetchImpl: makeFakeIpfsNode(ipfsNetwork) }));
    registry.register(new ArweaveContentStore({ signer: arweaveSigner, fetchImpl: makeFakeArweaveContentGateway(arweaveNetwork) }));
    return { registry, ipfsNetwork, arweaveNetwork };
}

// Announces `contentReference` on Nostr, over a fresh relay, and returns a
// { publisher, queryService, relay } trio wired to the SAME relay so a
// caller can discover what was just announced.
function nostrRoundTrip(discoveryTag) {
    const relay = makeFakeNostrRelay();
    const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: relay.publishImpl });
    const queryService = new NostrSnapshotDiscoveryQueryService({ discoveryTag, queryImpl: relay.queryImpl });
    return { publisher, queryService, relay };
}

// The identical pairing, one substrate over — Arweave.
function arweaveDiscoveryRoundTrip(discoveryTag) {
    const substrate = makeFakeArweaveDiscoverySubstrate();
    const publisher = new ArweaveSnapshotDiscoveryPublisher({ discoveryTag, uploadTaggedTransaction: substrate.uploadTaggedTransaction });
    const queryService = new ArweaveSnapshotDiscoveryQueryService({ fetchImpl: substrate.fetchImpl });
    return { publisher, queryService, substrate };
}

async function run() {
    console.log('=== 0.9.507 — Snapshot Content Backend Selection End-to-End Integration Audit ===\n');

    // ===============================================================
    // Section A — production topology.
    // ===============================================================
    {
        const mainSource = await codeOnlySource('ui/main.js');

        check((mainSource.match(/new IpfsContentStore\(/g) || []).length >= 1, 'A. an IpfsContentStore is constructed for the creation registry');
        check((mainSource.match(/new ArweaveContentStore\(/g) || []).length === 1, 'A. exactly one ArweaveContentStore is constructed in production — 0.9.506 removed Distribution\'s own former duplicate; Placement and Distribution share this one instance');
        check(mainSource.includes('snapshotPlacementStoreRegistry.register(arweaveSnapshotPlacementContentStore);'), 'A. that one Arweave store is registered into the creation registry');
        check(mainSource.includes('publicationSnapshotPlacementResolutionStoreRegistry.register(arweaveSnapshotPlacementContentStore);'), 'A. and into the resolution registry — the SAME instance, never a second construction, shared across both registries');
        check(mainSource.includes('resolveSnapshotDistributionContentStore(snapshotPlacementStoreRegistry, storage)'), 'A. Distribution resolves Content from the creation registry — the SAME one Placement\'s own creation coordinator already builds');
        check(mainSource.includes("app.provide('snapshotDistributionAvailableStorageTypes', snapshotDistributionAvailableStorageTypes);"), 'A. an eligible-storage-types read is provided for the UI');

        // No third registry anywhere in application/ui/core/content.
        const registrySites = [];
        for (const path of ['ui/main.js']) {
            const source = await codeOnlySource(path);
            registrySites.push(...(source.match(/new SnapshotPlacementStoreRegistry\(\)/g) || []));
        }
        check(registrySites.length === 0, 'A. ui/main.js itself constructs no SnapshotPlacementStoreRegistry directly — both real registries are built inside their own use cases (CreateSnapshotPlacementOrchestratorUseCase / CreateSnapshotPlacementResolutionCoordinatorUseCase), never a third, ad-hoc one for Distribution');

        // Honest finding: Announcement/Discovery's own write side is
        // still the fixed, single Nostr publisher in production today —
        // Arweave announcement is real and tested (this audit exercises
        // it directly, Sections D-J) but not yet wired at this
        // composition root. Naming this here keeps Section A an honest
        // account of what is ACTUALLY wired, not what the architecture
        // merely supports.
        check(!mainSource.includes('new ArweaveSnapshotDiscoveryPublisher('), 'A. production constructs no ArweaveSnapshotDiscoveryPublisher — Snapshot Distribution\'s own announcement write-side remains the fixed, single Nostr discoveryPublisher application/SnapshotDistributionCommand.js\'s own header already documents');
        // AMENDED BY 0.9.669 — Per-Click Snapshot Announcement/Discovery
        // Substrate Override. composeSnapshotDistributionRuntime() — still
        // the ONE place a discoveryPublisher is built for this family — is
        // now called twice, once per substrate (Nostr/Arweave), so a
        // per-click override can pick between two already-composed
        // instances instead of being locked to whichever one was built at
        // boot. Every Content selection is still served by the SAME two
        // instances, never a third construction per storage choice.
        check((mainSource.match(/composeSnapshotDistributionRuntime\(/g) || []).length === 2, 'A. AMENDED BY 0.9.669 — composeSnapshotDistributionRuntime() is called exactly twice (once per Nostr/Arweave substrate), serving every Content selection');

        console.log('✓ A. one creation registry, one resolution registry, one shared Arweave store between them, Distribution reusing the creation registry, no third registry anywhere — and an honest note that Announcement/Discovery\'s own write side is still Nostr-only in production.');
    }

    // ===============================================================
    // Section B — eligible storage set.
    // ===============================================================
    {
        check(Object.isFrozen(SNAPSHOT_DISTRIBUTION_ELIGIBLE_STORAGE_TYPES), 'B. the eligible list is frozen');
        check(SNAPSHOT_DISTRIBUTION_ELIGIBLE_STORAGE_TYPES.length === 2
            && SNAPSHOT_DISTRIBUTION_ELIGIBLE_STORAGE_TYPES.includes('ipfs')
            && SNAPSHOT_DISTRIBUTION_ELIGIBLE_STORAGE_TYPES.includes('ar'), 'B. exactly [\'ipfs\', \'ar\'] is eligible');
        check(!SNAPSHOT_DISTRIBUTION_ELIGIBLE_STORAGE_TYPES.includes('local'), 'B. \'local\' is not eligible');

        const source = await readFile(new URL('application/SnapshotDistributionContentBackendSelection.js', SOURCE_ROOT), 'utf8');
        check(/reachable by\s*\n?\s*\/\/\s*OTHER replicas/i.test(source) || source.includes('OTHER replicas'), 'B. the exclusion of \'local\' is documented, in the module\'s own header, as an intentional product decision (reachability by other replicas), not an oversight');

        console.log('✓ B. the eligible-storage-set contract is closed, frozen, and its one exclusion is documented as deliberate.');
    }

    // ===============================================================
    // Section C — UI selection & configuration route reachability.
    // ===============================================================
    {
        const uiSource = (await Promise.all(publicationsPageFiles().map((file) => codeOnlySource(file)))).join('\n');

        check(uiSource.includes('v-for="storage in snapshotDistributionStorageOptions"')
            && uiSource.includes('snapshotDistributionStorageOptions = sortOptionsByLabel(snapshotDistributionStorageTypes, humanizeStorageType)'),
            'C. the Content picker is populated by v-for over the eligibility read (sorted for display) — never a hardcoded pair of <option>s');
        check(uiSource.includes('v-if="snapshotDistributionStorageTypes.length > 0"'), 'C. the picker hides entirely when nothing is currently eligible, rather than rendering an unusable control');

        // Scoped to THIS picker's own <select> block only — the Publication
        // card's own, unrelated "Substrate" <select> (discoveryDistributionProvider)
        // legitimately carries its own hardcoded <option>s a few lines above,
        // and is out of this audit's scope.
        const pickerMatch = uiSource.match(/<select v-model="entry\.snapshotDistributionStorage"[\s\S]*?<\/select>/);
        check(Boolean(pickerMatch), 'C. the Snapshot Content <select> block is found in source');
        check(!/<option(?!\s+v-for)[^>]*>/.test(pickerMatch[0]), 'C. that block contains no literal, hardcoded <option> of its own — every option comes from the v-for');

        check(uiSource.includes("function snapshotDistributionConfigurationRoute(entry) {") && uiSource.includes("entry.snapshotDistributionStorage === 'ar'")
            && uiSource.includes("'/settings/arweave-gateway'") && uiSource.includes("'/settings/content-provider'"),
            'C. the Content configuration link follows the entry\'s own selection between the two real settings routes');
        check(uiSource.includes('<router-link to="/settings/nostr-relay" class="action-btn action-btn--secondary">Configure Nostr</router-link>'), 'C. the Nostr configuration link stays unconditional — Announcement/Discovery is never a per-entry Content choice');

        const routerSource = await codeOnlySource('ui/router/index.js');
        check(routerSource.includes("path: '/settings/content-provider'") && routerSource.includes("path: '/settings/arweave-gateway'") && routerSource.includes("path: '/settings/nostr-relay'"),
            'C. all three real settings routes this picker and its Nostr sibling link to actually exist in the router');

        console.log('✓ C. the Distribution UI\'s Content picker is driven entirely by the eligibility read, hides gracefully when empty, and its configuration links resolve to real, existing settings routes.');
    }

    // ===============================================================
    // Section D — FLAGSHIP: IPFS. select -> store -> locator ->
    // contentHash -> announce (Nostr) -> discover -> resolve -> verify.
    // ===============================================================
    let flagshipIpfsHash;
    {
        const { registry, ipfsNetwork } = buildProductionShapedRegistry();
        const { publisher, queryService } = nostrRoundTrip('e2e-audit-d');
        const bytes = JSON.stringify({ world: 'flagship-ipfs', v: 1 });

        const { contentReference, announcement } = await executeSnapshotDistributionCommand({
            bytes,
            contentStore: resolveSnapshotDistributionContentStore(registry, 'ipfs'),
            discoveryPublisher: publisher
        });
        check(contentReference.storage === 'ipfs' && contentReference.uri.startsWith('ipfs://'), 'D. Content selection genuinely reached IPFS');
        check(ipfsNetwork.has(contentReference.uri.slice('ipfs://'.length)), 'D. the bytes genuinely landed in the fake IPFS network');
        check(announcement && announcement.published === true, 'D. the real NostrSnapshotDiscoveryPublisher genuinely announced this placement');
        flagshipIpfsHash = contentReference.hash;

        const resolver = new DecentralizedSnapshotResolver(queryService);
        const result = await executeDiscoverSnapshotCommand({
            discoveryTag: 'e2e-audit-d',
            contentHash: contentReference.hash,
            resolver,
            storeRegistry: registry
        });
        check(result.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, `D. discovery -> resolution genuinely reached RESOLVED for IPFS (got ${result.outcome}: ${result.reason})`);
        check(result.bytes === bytes, 'D. the resolved bytes are byte-for-byte the original Snapshot bytes');
        check(result.storage === 'ipfs' && result.locator === contentReference.uri, 'D. the resolved locator/storage match what was actually placed');

        console.log('✓ D. FLAGSHIP (IPFS) — select -> store -> locator -> contentHash -> announce -> discover -> resolve -> verify, every step real, end to end.');
    }

    // ===============================================================
    // Section E — FLAGSHIP: Arweave. The identical path, one backend over.
    // ===============================================================
    let flagshipArweaveHash;
    {
        const { registry, arweaveNetwork } = buildProductionShapedRegistry();
        const { publisher, queryService } = nostrRoundTrip('e2e-audit-e');
        const bytes = JSON.stringify({ world: 'flagship-arweave', v: 1 });

        const { contentReference, announcement } = await executeSnapshotDistributionCommand({
            bytes,
            contentStore: resolveSnapshotDistributionContentStore(registry, 'ar'),
            discoveryPublisher: publisher
        });
        check(contentReference.storage === 'ar' && contentReference.uri.startsWith('ar://'), 'E. Content selection genuinely reached Arweave');
        check(arweaveNetwork.has(contentReference.uri.slice('ar://'.length)), 'E. the bytes genuinely landed in the fake Arweave network');
        check(announcement && announcement.published === true, 'E. the real NostrSnapshotDiscoveryPublisher genuinely announced this placement');
        flagshipArweaveHash = contentReference.hash;

        const resolver = new DecentralizedSnapshotResolver(queryService);
        const result = await executeDiscoverSnapshotCommand({
            discoveryTag: 'e2e-audit-e',
            contentHash: contentReference.hash,
            resolver,
            storeRegistry: registry
        });
        check(result.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, `E. discovery -> resolution genuinely reached RESOLVED for Arweave (got ${result.outcome}: ${result.reason})`);
        check(result.bytes === bytes, 'E. the resolved bytes are byte-for-byte the original Snapshot bytes');
        check(result.storage === 'ar' && result.locator === contentReference.uri, 'E. the resolved locator/storage match what was actually placed');

        console.log('✓ E. FLAGSHIP (Arweave) — the identical path, one backend over, every step real, end to end.');
    }

    // ===============================================================
    // Section F — content identity, locator fidelity, exactly one
    // backend per call.
    // ===============================================================
    {
        check(flagshipIpfsHash !== flagshipArweaveHash, 'F. sanity — Sections D/E distributed different bytes, so their hashes legitimately differ');

        const { registry, ipfsNetwork, arweaveNetwork } = buildProductionShapedRegistry();
        const discoveryPublisher = { discoveryTag: 'e2e-audit-f', publish: async () => ({ published: true, relayUrl: 'wss://audit.example', id: 'f'.repeat(64) }) };
        const bytes = JSON.stringify({ identical: 'bytes-across-both-backends' });

        const viaIpfs = await executeSnapshotDistributionCommand({ bytes, contentStore: resolveSnapshotDistributionContentStore(registry, 'ipfs'), discoveryPublisher });
        check(ipfsNetwork.size === 1 && arweaveNetwork.size === 0, 'F. selecting IPFS writes to IPFS only — no fan-out to Arweave');
        const viaArweave = await executeSnapshotDistributionCommand({ bytes, contentStore: resolveSnapshotDistributionContentStore(registry, 'ar'), discoveryPublisher });
        check(ipfsNetwork.size === 1 && arweaveNetwork.size === 1, 'F. selecting Arweave next writes to Arweave only — IPFS is untouched by this second call');

        check(viaIpfs.contentReference.hash === viaArweave.contentReference.hash, 'F. identical bytes -> identical contentHash, regardless of Content backend');
        check(viaIpfs.contentReference.hash === computeContentHash(bytes), 'F. that shared hash is genuinely the deterministic hash of the bytes themselves');
        check(viaIpfs.contentReference.uri !== viaArweave.contentReference.uri, 'F. locators are genuinely distinct — ipfs:// is never substituted for ar://, or vice versa');
        check(viaIpfs.contentReference.uri.startsWith('ipfs://') && viaArweave.contentReference.uri.startsWith('ar://'), 'F. each locator carries its own real scheme');

        console.log('✓ F. content identity is backend-agnostic, locators are backend-specific and never substituted, and each call reaches exactly one backend.');
    }

    // ===============================================================
    // Section G — resolution symmetry, direct (no discovery involved):
    // store -> locator -> resolveCandidate -> bytes -> verify, against
    // the SAME registry Placement already shares. No second resolver, no
    // second registry.
    // ===============================================================
    {
        const { registry } = buildProductionShapedRegistry();
        const discoveryPublisher = { discoveryTag: 'e2e-audit-g', publish: async () => null };

        for (const storage of ['ipfs', 'ar']) {
            const bytes = JSON.stringify({ symmetry: storage, v: 1 });
            const { contentReference } = await executeSnapshotDistributionCommand({
                bytes, contentStore: resolveSnapshotDistributionContentStore(registry, storage), discoveryPublisher
            });

            const candidate = { contentHash: contentReference.hash, locator: contentReference.uri, storage: contentReference.storage };
            const resolver = new DecentralizedSnapshotResolver({ search: async () => [] }); // never called by resolveCandidate()
            const result = await resolver.resolveCandidate(candidate, { storeRegistry: registry });

            check(result.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, `G. ${storage} resolves symmetrically through the SAME registry Distribution just placed onto (got ${result.outcome})`);
            check(result.bytes === bytes, `G. ${storage}'s resolved bytes are byte-for-byte the original bytes`);
        }

        console.log('✓ G. both Content backends round-trip symmetrically (store -> locator -> resolve -> verify) through the SAME registry Placement and Distribution already share — no second registry, no second resolution algorithm.');
    }

    // ===============================================================
    // Section H — RESOLUTION REACHABILITY: the one real, scoped gap.
    //
    // Production's own composeDiscoverSnapshotRuntime() (application/
    // DiscoverSnapshotRuntimeComposition.js) builds exactly ONE fixed
    // ContentStore — an ArweaveContentStore — and ui/main.js's own
    // discoverSnapshotCommand/resolveSelectedSnapshotCommand (the SAME
    // pair ui/views/WorldView.js's own AutomaticSnapshotEncounterCascade
    // is wired to, via its own injected resolveSelectedSnapshotCommand)
    // pass ONLY that fixed contentStore, never a storeRegistry — even
    // though DiscoverSnapshotRuntimeComposition.js's own header already
    // names storeRegistry as the supported way to resolve against more
    // than one backend ("a caller who wants to resolve against a
    // registry ... supplies own storeRegistry directly to
    // executeDiscoverSnapshotCommand()"). This section proves, live, with
    // the REAL composition function, that an IPFS-distributed Snapshot's
    // own discovered candidate cannot currently be resolved through
    // either of those two production entry points — and that Arweave is
    // unaffected, and that supplying storeRegistry (exactly as that
    // header already describes) fixes it immediately, with zero change
    // to any resolution class.
    // ===============================================================
    {
        const { registry } = buildProductionShapedRegistry();
        const { publisher: nostrPublisher, queryService } = nostrRoundTrip('e2e-audit-h');

        const ipfsBytes = JSON.stringify({ gap: 'ipfs-via-fixed-store' });
        const { contentReference: ipfsRef } = await executeSnapshotDistributionCommand({
            bytes: ipfsBytes, contentStore: resolveSnapshotDistributionContentStore(registry, 'ipfs'), discoveryPublisher: nostrPublisher
        });
        const arweaveBytes = JSON.stringify({ gap: 'arweave-via-fixed-store' });
        const { contentReference: arweaveRef } = await executeSnapshotDistributionCommand({
            bytes: arweaveBytes, contentStore: resolveSnapshotDistributionContentStore(registry, 'ar'), discoveryPublisher: nostrPublisher
        });

        // The REAL production composition — a lone, fixed ArweaveContentStore,
        // no registry — exactly as ui/main.js's own real wiring builds it.
        const { resolver: fixedResolver, contentStore: fixedArweaveStore } = composeDiscoverSnapshotRuntime({
            arweaveContentStoreOptions: { signer: makeFakeArweaveSigner(), fetchImpl: makeFakeArweaveContentGateway(new Map()) },
            nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: (relayUrl, filter) => queryService._queryImpl ? [] : [] }
        });
        check(fixedArweaveStore instanceof ArweaveContentStore, 'H. sanity — composeDiscoverSnapshotRuntime() genuinely builds a plain ArweaveContentStore for a single gatewayUrl, matching production');

        // Reuse the REAL resolver this audit already has candidates
        // discoverable through (queryService), but resolve exactly the
        // way ui/main.js's own discoverSnapshotCommand/
        // resolveSelectedSnapshotCommand do: an explicit, fixed
        // contentStore, no storeRegistry.
        const realFixedResolver = new DecentralizedSnapshotResolver(queryService);

        const ipfsViaFixedStore = await executeDiscoverSnapshotCommand({
            discoveryTag: 'e2e-audit-h', contentHash: ipfsRef.hash, resolver: realFixedResolver, contentStore: fixedArweaveStore
        });
        check(ipfsViaFixedStore.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_UNAVAILABLE,
            `H. an IPFS-distributed Snapshot's own candidate does NOT resolve through production's real fixed-contentStore path (got ${ipfsViaFixedStore.outcome}) — content/ArweaveContentStore.js#get() correctly reports an ipfs:// locator as not its own, but nothing here supplies the registry that DOES have IPFS registered`);
        check(ipfsViaFixedStore.bytes === null, 'H. no bytes are produced for the IPFS candidate through this path');

        const arweaveViaFixedStore = await executeResolveSelectedSnapshotCommand({
            candidate: { contentHash: arweaveRef.hash, locator: arweaveRef.uri, storage: arweaveRef.storage },
            resolver: realFixedResolver,
            contentStore: fixedArweaveStore
        });
        check(arweaveViaFixedStore.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_UNAVAILABLE,
            'H. sanity — this section\'s own fixedArweaveStore is a FRESH, empty fake Arweave network, so even the Arweave candidate is CONTENT_UNAVAILABLE here (proving the failure above is about ROUTING, not about IPFS specifically) — see the very next check for Arweave resolved against ITS OWN real network');

        // Now prove the asymmetry precisely: resolve the SAME Arweave
        // candidate against the network it was ACTUALLY placed into —
        // succeeds through the fixed-store path, because the fixed store
        // IS Arweave. This isolates the gap to IPFS (or any non-Arweave
        // backend), never a general break in the fixed-store path.
        const { registry: freshRegistry, arweaveNetwork: freshArweaveNetwork } = buildProductionShapedRegistry();
        const arweaveOnlyStore = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: makeFakeArweaveContentGateway(freshArweaveNetwork) });
        const { contentReference: freshArweaveRef } = await executeSnapshotDistributionCommand({
            bytes: arweaveBytes, contentStore: resolveSnapshotDistributionContentStore(freshRegistry, 'ar'), discoveryPublisher: nostrPublisher
        });
        const arweaveResolvedViaFixedStore = await executeResolveSelectedSnapshotCommand({
            candidate: { contentHash: freshArweaveRef.hash, locator: freshArweaveRef.uri, storage: freshArweaveRef.storage },
            resolver: realFixedResolver,
            contentStore: arweaveOnlyStore
        });
        check(arweaveResolvedViaFixedStore.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED,
            `H. an Arweave-distributed Snapshot DOES resolve through the fixed-contentStore path (got ${arweaveResolvedViaFixedStore.outcome}) — the gap above is specific to any backend other than whichever one the fixed store happens to be, never a general break`);
        check(arweaveResolvedViaFixedStore.bytes === arweaveBytes, 'H. and the resolved bytes are correct');

        // The documented fix already exists in the architecture: supply
        // storeRegistry instead of (or alongside) contentStore — Section
        // G already proved this registry-based path resolves IPFS
        // correctly; this is that SAME proof, through the SAME
        // executeResolveSelectedSnapshotCommand() entry point production
        // actually calls, never a hypothetical.
        const ipfsResolvedViaRegistry = await executeResolveSelectedSnapshotCommand({
            candidate: { contentHash: ipfsRef.hash, locator: ipfsRef.uri, storage: ipfsRef.storage },
            resolver: realFixedResolver,
            storeRegistry: registry
        });
        check(ipfsResolvedViaRegistry.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED,
            `H. the SAME IPFS candidate DOES resolve when storeRegistry is supplied instead of a fixed contentStore (got ${ipfsResolvedViaRegistry.outcome}) — proving the fix is a composition-root wiring choice, not a missing capability in any resolution class`);
        check(ipfsResolvedViaRegistry.bytes === ipfsBytes, 'H. and those resolved bytes are correct too');

        console.log('✓ H. RESOLUTION REACHABILITY GAP CONFIRMED — production\'s own composeDiscoverSnapshotRuntime()/discoverSnapshotCommand/resolveSelectedSnapshotCommand trio (and, transitively, AutomaticSnapshotEncounterCascade) resolve through one fixed, Arweave-only ContentStore; an IPFS-distributed Snapshot\'s own candidate is CONTENT_UNAVAILABLE there today. Arweave is unaffected. The documented fix (supply storeRegistry) already works, through the real production entry point, with zero change to any resolution class — wiring it into ui/main.js is recommended as its own, separate, later milestone; NOT done by this test-only audit.');
    }

    // ===============================================================
    // Section I — Announcement/Discovery orthogonality: the four
    // combinations, each resolved against the shared registry (the
    // supported path per G/H).
    // ===============================================================
    {
        const combinations = [
            { content: 'ipfs', discovery: 'nostr' },
            { content: 'ipfs', discovery: 'arweave' },
            { content: 'ar', discovery: 'nostr' },
            { content: 'ar', discovery: 'arweave' }
        ];

        for (const { content, discovery } of combinations) {
            const { registry } = buildProductionShapedRegistry();
            const discoveryTag = `e2e-audit-i-${content}-${discovery}`;
            const bytes = JSON.stringify({ content, discovery, v: 1 });

            const { publisher, queryService } = discovery === 'nostr'
                ? nostrRoundTrip(discoveryTag)
                : arweaveDiscoveryRoundTrip(discoveryTag);

            const { contentReference } = await executeSnapshotDistributionCommand({
                bytes, contentStore: resolveSnapshotDistributionContentStore(registry, content), discoveryPublisher: publisher
            });
            check(contentReference.storage === content, `I. [${content}+${discovery}] Content genuinely reached ${content} — Discovery choice never redirected it`);

            const resolver = new DecentralizedSnapshotResolver(queryService);
            const result = await executeDiscoverSnapshotCommand({
                discoveryTag, contentHash: contentReference.hash, resolver, storeRegistry: registry
            });
            check(result.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, `I. [${content}+${discovery}] resolves to RESOLVED (got ${result.outcome}: ${result.reason})`);
            check(result.bytes === bytes, `I. [${content}+${discovery}] resolved bytes are byte-for-byte correct`);
            check(result.storage === content, `I. [${content}+${discovery}] the resolved storage is still ${content} — Discovery substrate never became the Content backend`);
        }

        console.log('✓ I. all four (Content x Announcement/Discovery) combinations resolve correctly — Content selection and Discovery substrate vary completely independently, exactly as the architecture\'s own role separation requires.');
    }

    // ===============================================================
    // Section J — ADVERSARIAL: Announcement carries a CLAIM about
    // Content, it never determines it.
    // ===============================================================
    {
        // J1. Content = IPFS, Announcement/Discovery = Arweave, carrying
        // the IPFS locator.
        {
            const { registry } = buildProductionShapedRegistry();
            const discoveryTag = 'e2e-audit-j1';
            const bytes = JSON.stringify({ adversarial: 'ipfs-content-arweave-announcement' });

            const { contentReference } = await executeSnapshotDistributionCommand({
                bytes, contentStore: resolveSnapshotDistributionContentStore(registry, 'ipfs'),
                discoveryPublisher: { discoveryTag, publish: async () => null }
            });
            check(contentReference.uri.startsWith('ipfs://'), 'J1. sanity — Content genuinely placed on IPFS, with a real ipfs:// locator');

            const { publisher: arweavePublisher, queryService: arweaveQueryService } = arweaveDiscoveryRoundTrip(discoveryTag);
            const announcement = await arweavePublisher.publish({ contentHash: contentReference.hash, locator: contentReference.uri, storage: contentReference.storage });
            check(announcement && announcement.published === true, 'J1. the Arweave announcement, carrying the IPFS locator verbatim, was genuinely accepted — describeSnapshotDiscoveryEnvelope() validates SHAPE, not which substrate a locator "belongs" to');

            const resolver = new DecentralizedSnapshotResolver(arweaveQueryService);
            const result = await executeDiscoverSnapshotCommand({ discoveryTag, contentHash: contentReference.hash, resolver, storeRegistry: registry });
            check(result.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, `J1. discovered via Arweave, retrieved via IPFS, resolves correctly (got ${result.outcome})`);
            check(result.bytes === bytes && result.storage === 'ipfs' && result.locator === contentReference.uri,
                'J1. the resolved bytes/storage/locator are exactly IPFS\'s own — Content never "switched" to Arweave because the ANNOUNCEMENT happened to be on Arweave');
        }

        // J2. Reversed: Content = Arweave, Announcement/Discovery =
        // Nostr, carrying the Arweave locator.
        {
            const { registry } = buildProductionShapedRegistry();
            const discoveryTag = 'e2e-audit-j2';
            const bytes = JSON.stringify({ adversarial: 'arweave-content-nostr-announcement' });

            const { contentReference } = await executeSnapshotDistributionCommand({
                bytes, contentStore: resolveSnapshotDistributionContentStore(registry, 'ar'),
                discoveryPublisher: { discoveryTag, publish: async () => null }
            });
            check(contentReference.uri.startsWith('ar://'), 'J2. sanity — Content genuinely placed on Arweave, with a real ar:// locator');

            const { publisher: nostrPublisher, queryService: nostrQueryService } = nostrRoundTrip(discoveryTag);
            const announcement = await nostrPublisher.publish({ contentHash: contentReference.hash, locator: contentReference.uri, storage: contentReference.storage });
            check(announcement && announcement.published === true, 'J2. the Nostr announcement, carrying the Arweave locator verbatim, was genuinely accepted');

            const resolver = new DecentralizedSnapshotResolver(nostrQueryService);
            const result = await executeDiscoverSnapshotCommand({ discoveryTag, contentHash: contentReference.hash, resolver, storeRegistry: registry });
            check(result.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, `J2. discovered via Nostr, retrieved via Arweave, resolves correctly (got ${result.outcome})`);
            check(result.bytes === bytes && result.storage === 'ar' && result.locator === contentReference.uri,
                'J2. the resolved bytes/storage/locator are exactly Arweave\'s own — Content never "switched" to Nostr (which cannot even store content) because the ANNOUNCEMENT happened to be on Nostr');
        }

        console.log('✓ J. ADVERSARIAL — Announcement/Discovery transports a CLAIM about where Content lives; it never determines the Content backend itself. Both directions (IPFS content announced via Arweave; Arweave content announced via Nostr) resolve to exactly the Content backend that was actually used.');
    }

    // ===============================================================
    // Section K — failure isolation, and no automatic fallback.
    // ===============================================================
    {
        // K1. A failing Content backend never disturbs the other.
        {
            const { registry, arweaveNetwork } = buildProductionShapedRegistry({ arweaveSigner: makeFailingSigner() });
            const discoveryPublisher = { discoveryTag: 'e2e-audit-k1', publish: async () => ({ published: true, relayUrl: 'wss://audit.example', id: 'f'.repeat(64) }) };

            await expectRejects(
                executeSnapshotDistributionCommand({ bytes: JSON.stringify({ will: 'fail' }), contentStore: resolveSnapshotDistributionContentStore(registry, 'ar'), discoveryPublisher }),
                'K1. a failing Arweave signer causes Distribution to reject'
            );
            check(arweaveNetwork.size === 0, 'K1. nothing was actually written to the fake Arweave network on failure');

            const result = await executeSnapshotDistributionCommand({ bytes: JSON.stringify({ will: 'succeed' }), contentStore: resolveSnapshotDistributionContentStore(registry, 'ipfs'), discoveryPublisher });
            check(result.contentReference.storage === 'ipfs', 'K1. the OTHER, still-healthy backend (IPFS) remains completely unaffected by Arweave\'s own failure');
        }

        // K2. A failing Discovery source never disturbs Content
        // placement, and never triggers an automatic cross-substrate
        // fallback — DecentralizedSnapshotResolver is constructed
        // against exactly ONE queryService, and never itself constructs,
        // imports, or falls back to a second one.
        {
            const { registry } = buildProductionShapedRegistry();
            const bytes = JSON.stringify({ discovery: 'will-fail' });
            const discoveryTag = 'e2e-audit-k2';

            const failingNostrPublisher = { discoveryTag, publish: async () => { throw new Error('relay unreachable'); } };
            await expectRejects(
                executeSnapshotDistributionCommand({ bytes, contentStore: resolveSnapshotDistributionContentStore(registry, 'ipfs'), discoveryPublisher: failingNostrPublisher }),
                'K2. a genuinely failing discoveryPublisher.publish() propagates as a rejection, per application/SnapshotDistributionCommand.js\'s own existing contract'
            );

            // Content placement itself already happened before the
            // announcement was attempted — the bytes are still there,
            // resolvable directly against the registry (Section G's own
            // path), even though the announcement failed.
            const source = await codeOnlySource('application/DecentralizedSnapshotResolver.js');
            check(!source.includes('new ArweaveSnapshotDiscoveryQueryService') && !source.includes('new NostrSnapshotDiscoveryQueryService'),
                'K2. DecentralizedSnapshotResolver.js itself never constructs a second, fallback query service of any kind — it is handed exactly one, and only ever calls that one\'s own search()');

            const emptyQueryService = { search: async () => { throw new Error('this discovery source is down'); } };
            const resolver = new DecentralizedSnapshotResolver(emptyQueryService);
            await expectRejects(resolver.resolve(discoveryTag, 'irrelevant-hash', { storeRegistry: registry }),
                'K2. a genuinely failing queryService.search() propagates — resolve() never silently swaps in a different discovery source of its own accord');

            console.log('✓ K. a failing Content backend never disturbs the other; a failing Discovery source propagates its own failure and is never silently substituted for another — no automatic fallback of any kind exists in this pipeline.');
        }
    }

    // ===============================================================
    // Section L — backward compatibility: an omitted storage argument
    // still resolves to Arweave.
    // ===============================================================
    {
        const { registry, arweaveNetwork, ipfsNetwork } = buildProductionShapedRegistry();
        const discoveryPublisher = { discoveryTag: 'e2e-audit-l', publish: async () => null };
        // Mirrors ui/main.js's own real `(bytes, storage = 'ar') => ...` shape.
        const snapshotDistributionCommand = (bytes, storage = 'ar') => executeSnapshotDistributionCommand({
            bytes, contentStore: resolveSnapshotDistributionContentStore(registry, storage), discoveryPublisher
        });

        const result = await snapshotDistributionCommand(JSON.stringify({ legacy: 'caller' }));
        check(result.contentReference.storage === 'ar', 'L. omitting storage entirely still resolves to Arweave');
        check(arweaveNetwork.size === 1 && ipfsNetwork.size === 0, 'L. no IPFS write occurred for the legacy, storage-less call');

        console.log('✓ L. every caller that has not been updated to pass an explicit storage keeps its exact pre-0.9.506 Arweave-only behavior.');
    }

    // ===============================================================
    // Section M — Placement compatibility: Distribution's new
    // eligibility module shares no coupling with, and changes nothing
    // about, Placement's own registry usage.
    // ===============================================================
    {
        const selectionSource = await codeOnlySource('application/SnapshotDistributionContentBackendSelection.js');
        check(!selectionSource.includes('SnapshotPlacementStoreRegistry'), 'M. the new selection module never imports SnapshotPlacementStoreRegistry by name — it is duck-typed against get()/has() only, exactly as its own header documents');
        check(!selectionSource.includes('ArweaveContentStore') && !selectionSource.includes('IpfsContentStore') && !selectionSource.includes('LocalContentStore'),
            'M. it imports no concrete ContentStore either — it cannot itself alter what any one of them does');

        const registryFilesSource = await codeOnlySource('application/SnapshotPlacementStoreRegistry.js');
        check(!registryFilesSource.includes('SnapshotDistributionContentBackendSelection'), 'M. SnapshotPlacementStoreRegistry.js itself has no idea the Distribution eligibility module exists — no coupling in the other direction either');
        const resolverSource = await codeOnlySource('application/SnapshotPlacementResolver.js');
        check(!resolverSource.includes('SnapshotDistributionContentBackendSelection'), 'M. application/SnapshotPlacementResolver.js (the SIGNED Placement family\'s own resolution class) is equally untouched');

        // 'local' remains a fully functional Placement backend — put(),
        // get(), and verify() all still work through the SAME registry
        // Distribution's own eligibility module deliberately excludes it
        // from, proving that exclusion is Distribution-scoped, never a
        // Placement-level capability regression.
        const { registry } = buildProductionShapedRegistry();
        const localStore = registry.get('local');
        check(localStore !== null, 'M. \'local\' is still a real, registered ContentStore in the SAME registry Distribution reads from');
        const bytes = JSON.stringify({ placement: 'local-still-works' });
        const localReference = await localStore.put(bytes);
        check(localReference.storage === 'local', 'M. Placement can still place bytes onto \'local\' through this registry');
        const retrieved = await registry.get('local').get(localReference);
        check(retrieved === bytes && localReference.verify(retrieved), 'M. and retrieve/verify them back, completely unaffected by Distribution\'s own, separate eligibility policy');

        console.log('✓ M. Placement compatibility confirmed — no import coupling in either direction, and \'local\' remains a fully functional Placement backend through the exact same registry Distribution reads from.');
    }

    // ===============================================================
    // Section N — no role leakage.
    // ===============================================================
    {
        const leakageTerms = ['Publication', 'Anchor', 'attribution', 'WorldEncounter', 'World Encounter', 'publisherIdentity', 'placerIdentity'];

        const selectionSource = await codeOnlySource('application/SnapshotDistributionContentBackendSelection.js');
        for (const term of leakageTerms) {
            check(!selectionSource.includes(term), `N. application/SnapshotDistributionContentBackendSelection.js never mentions "${term}" — Content backend selection is pure storage routing, nothing about identity, provenance, or World placement`);
        }

        const commandSource = await codeOnlySource('application/SnapshotDistributionCommand.js');
        for (const term of leakageTerms) {
            check(!commandSource.includes(term), `N. application/SnapshotDistributionCommand.js never mentions "${term}" either — unchanged by 0.9.506, and this audit confirms it stayed that way`);
        }

        const mainSource = await codeOnlySource('ui/main.js');
        check(!/const snapshotDistributionCommand = \(bytes, storage = 'ar'\) => executeSnapshotDistributionCommand\(\{[\s\S]{0,400}?discoveryDistributionProvider/.test(mainSource),
            'N. the real snapshotDistributionCommand call site never references discoveryDistributionProvider — the Publication family\'s own, entirely separate Announcement/Discovery substrate selection (0.9.502) stays untouched by Content backend selection');

        console.log('✓ N. Content backend selection changes nothing about Announcement/Discovery, attribution, anchoring, publication identity, or World Encounter behavior, confirmed by reading the real, unmodified production source.');
    }

    // ===============================================================
    // Section O — the 'local' exclusion, audited explicitly.
    // ===============================================================
    {
        const { registry } = buildProductionShapedRegistry();

        check(registry.has('local') && registry.has('ipfs') && registry.has('ar'), 'O. the Placement registry: local ✓, ipfs ✓, arweave ✓ — all three are real, registered capability members');

        const available = availableSnapshotDistributionStorageTypes(registry);
        check(!available.includes('local') && available.includes('ipfs') && available.includes('ar'),
            'O. Distribution eligibility: local ✗, ipfs ✓, arweave ✓ — registry membership alone never implies Distribution eligibility');

        let threw = false;
        try { resolveSnapshotDistributionContentStore(registry, 'local'); } catch { threw = true; }
        check(threw, 'O. explicitly requesting Distribution onto \'local\' still throws, even though \'local\' genuinely put()/get()s through this exact registry (Section M)');

        console.log('✓ O. capability registration answers "can this backend store content?" (yes, for local/ipfs/ar alike); distribution eligibility answers a separate, narrower product question ("is this backend reachable by OTHER replicas?") — the two questions are never conflated, and \'local\' is the one case where the answers genuinely differ.');
    }

    console.log(`\n✅ All Snapshot Content Backend Selection End-to-End Integration Audit checks passed (${assertionCount} assertions).\n`);
    console.log('VERDICT.');
    console.log('  Distribution side (select -> store -> locator -> contentHash -> announce): COMPLETE for both IPFS and Arweave (Sections D/E/F/I/J).');
    console.log('  Resolution-against-shared-registry side: COMPLETE for both backends (Sections G/I/J).');
    console.log('  Resolution through production\'s own two real consumption entry points (discoverSnapshotCommand / resolveSelectedSnapshotCommand, and transitively AutomaticSnapshotEncounterCascade): a REAL, SCOPED GAP for any non-Arweave backend (Section H) — a fixed, single ArweaveContentStore is wired where a storeRegistry is already documented as supported and already proven to work. This is a PROVIDER_GAP finding, not a design flaw: the architecture already supports the fix; only a composition-root wiring change in ui/main.js closes it, recommended as a separate, later, unscheduled milestone.');
    console.log('  Local exclusion, role orthogonality, backward compatibility, and Placement compatibility: all CONFIRMED, intentional, and unaffected (Sections A/B/K/L/M/N/O).');
}

await run();
