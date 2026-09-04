import { readFile } from 'node:fs/promises';

import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalContentResolver } from '../discovery/LocalContentResolver.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { computeContentHash } from '../serializer/contentHash.js';

import { executePublicationDistribution } from '../application/PublicationDistributionExecutor.js';
import { composePublicationDistributionRuntime } from '../application/PublicationDistributionRuntimeComposition.js';

import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { IpfsContentStore } from '../content/IpfsContentStore.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/NostrSnapshotDiscoveryQueryService.js';
import { SnapshotPlacementStoreRegistry } from '../application/SnapshotPlacementStoreRegistry.js';
import { DecentralizedSnapshotResolver } from '../application/DecentralizedSnapshotResolver.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';

// 0.9.135 — End-to-End Decentralized Snapshot Distribution Audit.
//
// 0.9.131 named the boundary between Signed Claim distribution and
// Snapshot distribution. 0.9.132 built the placement half of a genuinely
// decentralized Snapshot path (content/ArweaveContentStore.js). 0.9.133
// built the discovery half (application/NostrSnapshotDiscoveryPublisher.js
// / NostrSnapshotDiscoveryQueryService.js, core/SnapshotDiscoveryEnvelope.js).
// 0.9.134 connected the two (application/DecentralizedSnapshotResolver.js).
// Each of those milestones tested its own new seam in isolation. This
// milestone tests nothing new — it is a TEST-ONLY audit, exactly as
// 0.9.124, 0.9.129, and 0.9.130 were, proving the complete chain those
// four milestones assembled still behaves as ONE continuous pipeline, and
// that none of the boundaries they drew have quietly collapsed:
//
//   Snapshot
//        │ content bytes
//        ▼
//   ArweaveContentStore.put()
//        │
//        ▼
//   contentReference
//        │
//        ├── hash ─────────────────────────┐
//        │                                 │
//        └── ar:// locator                 │
//                                          ▼
//                        NostrSnapshotDiscoveryPublisher
//                                          │
//                                          ▼
//                                       Nostr
//                                          │
//                                          ▼
//                        NostrSnapshotDiscoveryQueryService
//                                          │
//                                          ▼
//                          DecentralizedSnapshotResolver
//                                          │
//                                          ▼
//                        SnapshotPlacementStoreRegistry
//                                          │
//                                          ▼
//                             ArweaveContentStore
//                                          │
//                                          ▼
//                               Snapshot bytes
//                                          │
//                                          ▼
//                          computeContentHash()
//                                          │
//                                          ▼
//                                       MATCH
//
// EIGHT SECTIONS, each a distinct claim about the pipeline, never merely
// a repeat of one milestone's own test with new fixture names:
//
//   A. The complete placement -> discovery -> retrieval -> verification
//      chain, driven through ONE resolve() call, with the locator proven
//      to have travelled THROUGH discovery rather than being handed to
//      the resolver directly.
//   B. Identity separation — contentReference.hash, the Arweave
//      transaction id, and the Nostr event id are three distinct
//      identifiers for one Snapshot identity, never collapsed into one.
//   C. Candidate preservation — several independent announcements for one
//      contentHash are all preserved, and resolution is proven
//      deterministic-first-match, never "best" (a later, equally valid,
//      genuinely faster candidate is never even attempted).
//   D. The failure matrix — DISCOVERY, LOCATION, RETRIEVAL, and
//      VERIFICATION failures are four pairwise-distinct outcomes; no
//      layer's failure is ever reported as another layer's failure.
//   E. False discovery, given special emphasis — Nostr discovery is
//      evidence about a LOCATION, never evidence that the location holds
//      the expected content; retrieval is proven to have genuinely
//      happened before verification rejects it.
//   F. Failure independence, three ways — Signed Claim distribution,
//      peer-based Snapshot Placement (0.8.18), and the new decentralized
//      Snapshot path (Arweave + Nostr) all share the same physical
//      substrates (Arweave, Nostr) without sharing semantic state; each
//      one's failure leaves the others completely intact.
//   G. Structural boundary audit — DecentralizedSnapshotResolver.js
//      imports nothing from Signed Claim distribution, UI, or wallet
//      code; NostrSnapshotDiscoveryPublisher.js never imports the Signed
//      Claim family's own Nostr publisher; ArweaveContentStore.js stays
//      ignorant of both Nostr and everything built on top of it.
//   H. No implicit application wiring — the whole decentralized Snapshot
//      chain is composable explicitly by a caller (this test), but no
//      production file silently wires it into the application's default
//      publication flow.
//
// EVERY FILE THIS TEST TOUCHES IS READ-ONLY. This milestone adds no
// production code — only this test file, its `tests.html` registration,
// and `docs/Roadmap.md`.

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

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

function createTestDocument(title) {
    const world = new World();
    const building = new Building({ creator: 'tester' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0), rotation: 0 }));
    world.addBuilding(building);
    return new Document({
        world,
        metadata: new DocumentMetadata({ title, author: 'tester' })
    });
}

function publishLocally(title) {
    const storage = new InMemoryStorageProvider();
    const alice = makeIdentity('alice');
    const publisher = new LocalPublisherProvider(storage);
    const doc = createTestDocument(title);
    const publication = publisher.publish(doc, alice);
    const discoveryProvider = new LocalDiscoveryProvider(storage);
    const contentResolver = new LocalContentResolver(publisher);
    return { alice, publication, discoveryProvider, contentResolver };
}

function makeFakeClaimSigner({ handler } = {}) {
    return { sign: async (material) => (handler ? handler(material) : { id: 'fake-claim-tx-id', transaction: { data: material } }) };
}

function makeFakeClaimRelay({ handler }) {
    const calls = [];
    return { calls, publishImpl: async (relayUrl, eventTemplate) => { calls.push({ relayUrl, eventTemplate }); return handler(relayUrl, eventTemplate); } };
}

// Distributes `publication`'s SIGNED CLAIM — mirrors tests/
// SnapshotDistributionBoundary.test.js's own distributeClaim() exactly.
async function distributeClaim(publication, { transactionId, relayHandler }) {
    const relay = makeFakeClaimRelay({ handler: relayHandler });
    const runtime = composePublicationDistributionRuntime({
        arweaveUploaderOptions: {
            signer: makeFakeClaimSigner({ handler: () => ({ id: transactionId || 'FailedGatewayPlaceholderTx000000000001', transaction: { placeholder: true } }) }),
            fetchImpl: async () => (transactionId ? new Response('accepted', { status: 200 }) : new Response('gateway down', { status: 500 }))
        },
        nostrPublisherOptions: {
            relayUrl: 'wss://relay.example',
            discoveryTag: 'forkbuild-publication',
            publishImpl: relay.publishImpl
        }
    });
    const result = await executePublicationDistribution({
        publication,
        serializedMaterial: JSON.stringify(publication.toJSON()),
        materialUploader: runtime.uploader,
        distributionDescriptor: runtime.describeDistribution,
        discoveryPublisher: runtime.publisher
    });
    return { result, relay };
}

function fakeCid(text) {
    return 'bafyFAKE' + computeContentHash(text);
}

// Mirrors tests/SnapshotDistributionBoundary.test.js's own makeFakeIpfsNode().
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

// Mirrors tests/DecentralizedSnapshotResolution.test.js's own
// makeFakeArweaveGateway(), with one addition: every request is logged
// as PUT/GET so Section A can prove call ORDER, not merely call outcome.
function makeFakeArweaveGateway(log = null) {
    const network = new Map();
    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        if (options.method === 'POST' && parsed.pathname === '/tx') {
            if (log) log.push('RETRIEVAL-LAYER:PUT');
            const transaction = JSON.parse(options.body);
            network.set(transaction.id, transaction.data);
            return new Response('OK', { status: 200 });
        }
        if (log) log.push('RETRIEVAL-LAYER:GET');
        const id = parsed.pathname.slice(1);
        if (!network.has(id)) return new Response('not found', { status: 404 });
        return new Response(network.get(id));
    }
    return { network, fetchImpl };
}

function makeFakeArweaveSigner() {
    let counter = 0;
    async function sign(material) {
        counter += 1;
        return { id: `fake-audit-tx-${counter}`, transaction: { id: `fake-audit-tx-${counter}`, data: material } };
    }
    return { sign };
}

// Mirrors tests/DecentralizedSnapshotResolution.test.js's own
// makeNostrNetwork() — a real in-memory relay driving the real publisher
// and query service together. `log`, when supplied, records every
// publish/query call so Section A can prove call ORDER.
function makeNostrNetwork(log = null) {
    const events = [];
    let counter = 0;
    async function publishImpl(relayUrl, eventTemplate) {
        if (log) log.push('DISCOVERY-LAYER:PUBLISH');
        counter += 1;
        const id = counter.toString(16).padStart(64, '0');
        events.push({ id, pubkey: 'fake-pubkey', kind: eventTemplate.kind, tags: eventTemplate.tags, content: eventTemplate.content, sig: 'fake-sig' });
        return { published: true, id };
    }
    async function queryImpl(relayUrl, filter) {
        if (log) log.push('DISCOVERY-LAYER:QUERY');
        const tagFilters = Object.entries(filter).filter(([key]) => key.startsWith('#'));
        return events
            .filter((event) => {
                if (Array.isArray(filter.kinds) && !filter.kinds.includes(event.kind)) return false;
                return tagFilters.every(([key, values]) => {
                    const tagName = key.slice(1);
                    return event.tags.some((tag) => tag[0] === tagName && values.includes(tag[1]));
                });
            })
            .slice(0, filter.limit);
    }
    return { events, publishImpl, queryImpl };
}

// One assembled decentralized scenario — a real ArweaveContentStore, a
// real (in-memory) Nostr network, a registry with the store registered,
// and a resolver wired against it. `log`, when supplied, is threaded
// through both the gateway and the relay so a caller can inspect call
// order across the whole scenario.
function makeScenario(log = null) {
    const gateway = makeFakeArweaveGateway(log);
    const signer = makeFakeArweaveSigner();
    const store = new ArweaveContentStore({ signer, fetchImpl: gateway.fetchImpl });
    const network = makeNostrNetwork(log);
    const registry = new SnapshotPlacementStoreRegistry();
    registry.register(store);
    const query = new NostrSnapshotDiscoveryQueryService({ queryImpl: network.queryImpl });
    const resolver = new DecentralizedSnapshotResolver(query);
    return { gateway, signer, store, network, registry, query, resolver };
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function run() {
    // ===============================================================
    // Section A — the complete placement -> discovery -> retrieval ->
    // verification chain, driven through ONE resolve() call.
    // ===============================================================
    {
        const callLog = [];
        const { store, network, registry, resolver } = makeScenario(callLog);
        const discoveryTag = 'audit-section-a-flagship';

        const { contentResolver, publication } = publishLocally('Audit Flagship Sequence');
        const snapshotBytes = JSON.stringify(contentResolver.resolve(publication.id));
        const expectedHash = computeContentHash(snapshotBytes);
        assert(expectedHash === publication.contentReference.hash, 'A0. sanity: the Snapshot bytes this audit places are genuinely the ones publication.contentReference.hash already names');

        // Snapshot -> ArweaveContentStore.put() -> contentReference.
        const reference = await store.put(snapshotBytes);
        assert(reference.hash === expectedHash, 'A1. the placed contentReference.hash matches the hash computed before placement');
        assert(reference.uri.startsWith('ar://'), 'A2. contentReference carries a real ar:// locator');

        // contentReference -> NostrSnapshotDiscoveryPublisher -> Nostr.
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });
        const published = await publisher.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage });
        assert(published !== null && published.published === true, 'A3. the discovery announcement genuinely publishes to Nostr');

        // Reset the call log — everything from here on happens INSIDE one
        // resolve() call, so any recorded order is the resolver's own.
        callLog.length = 0;

        // Nostr -> NostrSnapshotDiscoveryQueryService -> DecentralizedSnapshotResolver
        // -> SnapshotPlacementStoreRegistry -> ArweaveContentStore -> Snapshot bytes
        // -> computeContentHash() -> MATCH, all in ONE call. Note: the
        // resolver is handed only `discoveryTag` and `expectedHash` —
        // never `reference` or `reference.uri` — so any locator it acts
        // on can only have come from discovery.
        const resolved = await resolver.resolve(discoveryTag, expectedHash, { storeRegistry: registry });

        assert(resolved.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'A4. DISCOVERY, LOCATION, RETRIEVAL, and VERIFICATION all succeeded inside one resolve() call');
        assert(resolved.candidates.length === 1, 'A5. DISCOVERY produced exactly the one candidate that was actually announced');
        assert(resolved.storage === 'ar', 'A6. LOCATION resolved a real store for that candidate\'s own storage');
        assert(resolved.bytes !== null, 'A7. RETRIEVAL genuinely obtained bytes');
        assert(computeContentHash(resolved.bytes) === expectedHash, 'A8. VERIFICATION\'s own hash check is the reason this call reports RESOLVED');

        // The locator travelled THROUGH discovery, never around it: this
        // call never received `reference.uri` as an argument anywhere,
        // yet the resolved locator is exactly that URI.
        assert(resolved.locator === reference.uri, 'A9. the resolved locator is exactly the one Nostr announced — it was never handed to this call directly');

        // Call order: this resolver's own resolve() queries Nostr BEFORE
        // it ever touches the Arweave gateway — DISCOVERY strictly
        // precedes RETRIEVAL, never the reverse and never interleaved.
        assert(callLog.length === 2, 'A10. exactly one Nostr call and one Arweave call happened inside this single resolve()');
        assert(callLog[0] === 'DISCOVERY-LAYER:QUERY', 'A11. DISCOVERY (the Nostr query) happened first');
        assert(callLog[1] === 'RETRIEVAL-LAYER:GET', 'A12. RETRIEVAL (the Arweave GET) happened strictly after discovery, never before or interleaved with it');

        // The final assertion this milestone's own header names as
        // centerpiece: originalSnapshot.hash === resolvedSnapshot.hash.
        assert(expectedHash === computeContentHash(resolved.bytes), 'A13. FLAGSHIP: originalSnapshot.hash === resolvedSnapshot.hash');
        assert(resolved.bytes === snapshotBytes, 'A14. ...and the bytes themselves are byte-identical, not merely hash-identical');

        console.log('✓ A. Complete placement -> discovery -> retrieval -> verification, driven through one resolve() call, with the locator proven to have travelled through discovery');
    }

    // ===============================================================
    // Section B — identity separation. contentReference.hash, the
    // Arweave transaction id, and the Nostr event id are three distinct
    // identifiers for ONE Snapshot identity.
    // ===============================================================
    {
        const { store, network } = makeScenario();
        const snapshotBytes = 'Section B: one Snapshot, three independent external identifiers';
        const reference = await store.put(snapshotBytes);
        const transactionId = reference.uri.slice('ar://'.length);

        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'audit-section-b-identity', publishImpl: network.publishImpl });
        const firstAnnouncement = await publisher.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage });
        const secondAnnouncement = await publisher.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage });

        assert(reference.hash !== transactionId, 'B1. contentReference.hash != the Arweave transaction id');
        assert(reference.hash !== firstAnnouncement.id, 'B2. contentReference.hash != the Nostr event id');
        assert(transactionId !== firstAnnouncement.id, 'B3. the Arweave transaction id != the Nostr event id');
        assert(firstAnnouncement.id !== secondAnnouncement.id, 'B4. two independent announcements of the SAME Snapshot produce two DIFFERENT Nostr event ids');

        // The same Snapshot identity — one contentHash — now has multiple
        // externally visible identifiers (one tx id, two event ids)
        // without that multiplicity ever creating multiple Snapshot
        // identities: both discovery records still resolve to the exact
        // same contentHash and locator.
        const query = new NostrSnapshotDiscoveryQueryService({ queryImpl: network.queryImpl });
        const candidates = await query.search('audit-section-b-identity');
        assert(candidates.length === 2, 'B5. both independent announcements are discoverable');
        assert(candidates.every((candidate) => candidate.contentHash === reference.hash), 'B6. both announcements name the exact same contentHash — one Snapshot identity, regardless of how many times it was announced');
        assert(candidates.every((candidate) => candidate.locator === reference.uri), 'B7. both announcements name the exact same locator too');

        console.log('✓ B. contentReference.hash, the Arweave transaction id, and the Nostr event id are three distinct identifiers — the same Snapshot may carry several without gaining several identities');
    }

    // ===============================================================
    // Section C — candidate preservation. H -> L1, L2, L3: the resolver
    // preserves every candidate and uses documented, deterministic
    // first-match selection — never ranking, never "best provider."
    // ===============================================================
    {
        const { store: arStore, network, registry } = makeScenario();

        const ipfsNetwork = new Map();
        const ipfsStore = new IpfsContentStore({ fetchImpl: makeFakeIpfsNode(ipfsNetwork) });
        registry.register(ipfsStore);

        const snapshotBytes = 'Section C: the same content is genuinely retrievable from more than one candidate';
        const arReference = await arStore.put(snapshotBytes);
        const ipfsReference = await ipfsStore.put(snapshotBytes);
        assert(arReference.hash === ipfsReference.hash, 'C0. sanity: both stores were handed the identical bytes, so both are genuinely valid candidates for this contentHash');

        // Instrument BOTH stores' get() so this test can prove which
        // ones were actually consulted, not merely which one "won."
        const getCalls = { ar: 0, ipfs: 0 };
        const originalArGet = arStore.get.bind(arStore);
        arStore.get = async (ref) => { getCalls.ar += 1; return originalArGet(ref); };
        const originalIpfsGet = ipfsStore.get.bind(ipfsStore);
        ipfsStore.get = async (ref) => { getCalls.ipfs += 1; return originalIpfsGet(ref); };

        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'audit-section-c-candidates', publishImpl: network.publishImpl });
        await publisher.publish({ contentHash: arReference.hash, locator: arReference.uri, storage: arReference.storage }); // L1 — genuinely valid
        await publisher.publish({ contentHash: arReference.hash, locator: ipfsReference.uri, storage: ipfsReference.storage }); // L2 — ALSO genuinely valid
        await publisher.publish({ contentHash: arReference.hash, locator: 'ar://a-third-locator-that-does-not-exist', storage: 'ar' }); // L3 — never reached

        const query = new NostrSnapshotDiscoveryQueryService({ queryImpl: network.queryImpl });
        const resolver = new DecentralizedSnapshotResolver(query);
        const result = await resolver.resolve('audit-section-c-candidates', arReference.hash, { storeRegistry: registry });

        assert(result.candidates.length === 3, 'C1. ALL THREE independently-announced candidates are preserved on the result — never collapsed to one');
        assert(result.candidates[0].locator === arReference.uri, 'C2. candidates preserve the exact order they were announced in');
        assert(result.candidates[1].locator === ipfsReference.uri, 'C3. ...including the second, equally-valid candidate');
        assert(result.candidates[2].locator === 'ar://a-third-locator-that-does-not-exist', 'C4. ...and the third, which is never even attempted');

        assert(result.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'C5. resolution succeeds against the FIRST candidate');
        assert(result.locator === arReference.uri, 'C6. the attempted locator is candidates[0] — never a "best" pick among three equally-content-bearing candidates');
        assert(getCalls.ar === 1, 'C7. the first (Arweave) candidate\'s store was consulted exactly once');
        assert(getCalls.ipfs === 0, 'C8. FLAGSHIP NEGATIVE: the second candidate\'s store — genuinely holding valid, retrievable content for this exact contentHash — was NEVER even consulted. First candidate, not best candidate.');

        console.log('✓ C. multiple independent candidates for one contentHash are all preserved, and resolution is deterministic first-match — an equally valid, never-attempted second candidate proves this is not "best provider" selection');
    }

    // ===============================================================
    // Section D — the failure matrix. DISCOVERY, LOCATION, RETRIEVAL,
    // and VERIFICATION failures are four pairwise-distinct outcomes; no
    // layer's failure masquerades as another's.
    // ===============================================================
    {
        const outcomesSeen = [];

        // DISCOVERY failure — nothing was ever announced.
        {
            const { resolver, registry } = makeScenario();
            const result = await resolver.resolve('audit-section-d-nothing-announced', 'a-hash-nobody-ever-published', { storeRegistry: registry });
            assert(result.outcome === DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED, 'D1. DISCOVERY failure reports NOT_DISCOVERED');
            assert(result.candidates.length === 0 && result.locator === null && result.storage === null && result.bytes === null, 'D2. NOT_DISCOVERED carries no candidate, locator, storage, or bytes — the failure never pretends to have gotten further than it did');
            outcomesSeen.push(result.outcome);
        }

        // LOCATION failure — discovered, but no store for its storage.
        {
            const { store, network } = makeScenario();
            const bytes = 'Section D: LOCATION failure fixture';
            const reference = await store.put(bytes);
            const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'audit-section-d-location', publishImpl: network.publishImpl });
            await publisher.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage });
            const query = new NostrSnapshotDiscoveryQueryService({ queryImpl: network.queryImpl });
            const resolver = new DecentralizedSnapshotResolver(query);
            const result = await resolver.resolve('audit-section-d-location', reference.hash, { storeRegistry: new SnapshotPlacementStoreRegistry() });
            assert(result.outcome === DecentralizedSnapshotResolutionOutcome.STORE_UNAVAILABLE, 'D3. LOCATION failure reports STORE_UNAVAILABLE');
            assert(result.candidates.length === 1 && result.bytes === null, 'D4. STORE_UNAVAILABLE carries the discovered candidate but no bytes — discovery genuinely happened, retrieval never got the chance to');
            outcomesSeen.push(result.outcome);
        }

        // RETRIEVAL failure — discoverable and located, but the store
        // cannot presently produce bytes.
        {
            const { store, network, registry, resolver } = makeScenario();
            const bytes = 'Section D: RETRIEVAL failure fixture';
            const reference = await store.put(bytes);
            const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'audit-section-d-retrieval', publishImpl: network.publishImpl });
            await publisher.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage });
            const brokenStore = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: async () => new Response('gateway overloaded', { status: 503 }) });
            const brokenRegistry = new SnapshotPlacementStoreRegistry().register(brokenStore);
            const result = await resolver.resolve('audit-section-d-retrieval', reference.hash, { storeRegistry: brokenRegistry });
            assert(result.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_UNAVAILABLE, 'D5. RETRIEVAL failure reports CONTENT_UNAVAILABLE');
            assert(result.candidates.length === 1 && result.storage === 'ar' && result.bytes === null, 'D6. CONTENT_UNAVAILABLE carries the discovered candidate AND its located storage, but no bytes — the failure is specifically retrieval\'s, never discovery\'s or location\'s');
            // The identical discovery record still resolves against the
            // ORIGINAL working store, proving the record itself was fine.
            const stillWorks = await resolver.resolve('audit-section-d-retrieval', reference.hash, { storeRegistry: registry });
            assert(stillWorks.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'D7. the same record resolves fully once a working store is available — RETRIEVAL failure was never actually a DISCOVERY or LOCATION problem');
            outcomesSeen.push(result.outcome);
        }

        // VERIFICATION failure — see Section E for the dedicated,
        // emphasized treatment; recorded here too so the matrix itself
        // is complete.
        {
            const { store, registry, network, resolver } = makeScenario();
            const decoyBytes = 'Section D: decoy bytes that really exist at their own real locator';
            const decoyReference = await store.put(decoyBytes);
            const claimedHash = computeContentHash('bytes that were never actually placed anywhere');
            const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'audit-section-d-verification', publishImpl: network.publishImpl });
            await publisher.publish({ contentHash: claimedHash, locator: decoyReference.uri, storage: decoyReference.storage });
            const result = await resolver.resolve('audit-section-d-verification', claimedHash, { storeRegistry: registry });
            assert(result.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH, 'D8. VERIFICATION failure reports CONTENT_HASH_MISMATCH');
            assert(result.candidates.length === 1 && result.bytes === null, 'D9. CONTENT_HASH_MISMATCH carries the discovered/located candidate but never the wrong bytes as if they were the Snapshot');
            outcomesSeen.push(result.outcome);
        }

        assert(new Set(outcomesSeen).size === 4, 'D10. all four layers produced four PAIRWISE-DISTINCT outcomes — no layer\'s failure was ever reported as another layer\'s failure');
        assert(
            outcomesSeen.join(',') === [
                DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED,
                DecentralizedSnapshotResolutionOutcome.STORE_UNAVAILABLE,
                DecentralizedSnapshotResolutionOutcome.CONTENT_UNAVAILABLE,
                DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH
            ].join(','),
            'D11. the four outcomes were produced in the exact DISCOVERY -> LOCATION -> RETRIEVAL -> VERIFICATION order this milestone\'s own header names'
        );

        console.log('✓ D. the failure matrix — DISCOVERY, LOCATION, RETRIEVAL, and VERIFICATION each fail as four distinct, never-conflated outcomes');
    }

    // ===============================================================
    // Section E — false discovery, given special emphasis. Nostr
    // discovery is evidence about a LOCATION, never evidence that the
    // location holds the expected content.
    // ===============================================================
    {
        const { store, registry, network, resolver } = makeScenario();

        // A locator that genuinely, verifiably exists and serves real
        // content — just not the content this announcement claims.
        const realBytesAtL = 'Section E: real bytes that genuinely live at locator L, honestly retrievable';
        const referenceAtL = await store.put(realBytesAtL);
        const H2 = referenceAtL.hash; // the ACTUAL hash of what L serves
        const H = computeContentHash('Section E: bytes that were never placed anywhere at all'); // the CLAIMED hash

        assert(H !== H2, 'E0. sanity: the claimed hash and the actual hash of what L serves are genuinely different');

        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'audit-section-e-false-discovery', publishImpl: network.publishImpl });
        await publisher.publish({ contentHash: H, locator: referenceAtL.uri, storage: referenceAtL.storage }); // Nostr: contentHash = H, locator = L

        // Instrument the store's get() so this test can prove RETRIEVAL
        // genuinely ran — this is not a shortcut that skips straight to
        // rejection merely because a caller "smells" a mismatch.
        let getCallCount = 0;
        const originalGet = store.get.bind(store);
        store.get = async (ref) => { getCallCount += 1; return originalGet(ref); };

        const result = await resolver.resolve('audit-section-e-false-discovery', H, { storeRegistry: registry });

        assert(getCallCount === 1, 'E1. retrieval genuinely ran exactly once — the store really was asked for, and really returned, bytes at L');
        assert(result.outcome !== DecentralizedSnapshotResolutionOutcome.RESOLVED, 'E2. H != H2 must never result in RESOLVED');
        assert(result.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH, 'E3. H != H2 results specifically in CONTENT_HASH_MISMATCH');
        assert(result.bytes === null, 'E4. the real bytes that were genuinely retrieved from L are never handed back as if they were the requested Snapshot');
        assert(result.candidates.length === 1 && result.candidates[0].locator === referenceAtL.uri, 'E5. the false candidate is still reported, so a caller can see exactly what was retrieved and rejected');

        console.log('✓ E. FLAGSHIP NEGATIVE — Nostr discovery is evidence about a location, never evidence that the location contains the expected content: a genuinely retrievable, genuinely wrong-content locator reports CONTENT_HASH_MISMATCH, never RESOLVED');
    }

    // ===============================================================
    // Section F — failure independence, three ways. Signed Claim
    // distribution, peer-based Snapshot Placement, and the new
    // decentralized Snapshot path share physical substrates (Arweave,
    // Nostr) without ever sharing semantic state.
    // ===============================================================
    {
        const { store, network, registry, resolver } = makeScenario();
        const { publication, contentResolver } = publishLocally('Audit Failure Independence');
        const snapshotBytes = JSON.stringify(contentResolver.resolve(publication.id));
        const discoveryTag = 'audit-section-f-independence';

        // F-i. Baseline: decentralized placement + discovery + resolution
        // all succeed for this publication's own Snapshot content.
        const reference = await store.put(snapshotBytes);
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });
        const publishResult = await publisher.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage });
        assert(publishResult.published === true, 'F1. baseline: Arweave placement and Nostr publication both succeed');
        const baseline = await resolver.resolve(discoveryTag, reference.hash, { storeRegistry: registry });
        assert(baseline.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'F2. baseline: the Snapshot resolves end to end');

        // F-ii. Break Nostr (every query now fails) — prove the
        // already-placed Arweave content remains fully intact by
        // re-resolving it through the direct storage path, bypassing
        // discovery entirely.
        const brokenQueryService = new NostrSnapshotDiscoveryQueryService({ queryImpl: async () => { throw new Error('relay unreachable'); } });
        const brokenResolver = new DecentralizedSnapshotResolver(brokenQueryService);
        const viaBrokenNostr = await brokenResolver.resolve(discoveryTag, reference.hash, { storeRegistry: registry });
        assert(viaBrokenNostr.outcome === DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED, 'F3. with Nostr broken, discovery-based resolution reports NOT_DISCOVERED');
        const directlyFromStore = await registry.get('ar').get(reference);
        assert(directlyFromStore === snapshotBytes, 'F4. the already-placed Arweave content is completely intact, retrieved through the direct storage path (SnapshotPlacementStoreRegistry -> ArweaveContentStore) with Nostr fully broken — PLACEMENT and DISCOVERY are independently failable');

        // F-iii. Signed Claim distribution fails at the material step
        // (gateway down) — prove the already-working decentralized
        // Snapshot resolution above is completely unaffected.
        const { result: failedClaim } = await distributeClaim(publication, { transactionId: null, relayHandler: () => ({ published: true, id: 'f'.repeat(64) }) });
        assert(failedClaim.material === null && failedClaim.discovery === null, 'F5. the Signed Claim distribution genuinely failed, at the material step, before discovery was even attempted');
        const resolvedAfterClaimFailure = await resolver.resolve(discoveryTag, reference.hash, { storeRegistry: registry });
        assert(resolvedAfterClaimFailure.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'F6. the decentralized Snapshot still resolves fully — a failed Signed Claim distribution never touched it');
        assert(resolvedAfterClaimFailure.bytes === snapshotBytes, 'F7. ...with byte-identical content to the original baseline resolution');

        // F-iv. Reverse: decentralized Snapshot placement fails (the
        // store cannot even place bytes) for a SECOND publication — prove
        // Signed Claim distribution for that SAME publication succeeds
        // completely independently.
        const { publication: secondPublication, contentResolver: secondContentResolver } = publishLocally('Audit Failure Independence — Reverse Direction');
        const secondSnapshotBytes = JSON.stringify(secondContentResolver.resolve(secondPublication.id));
        const brokenStore = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: async () => new Response('gateway down', { status: 500 }) });
        let placementThrew = false;
        try {
            await brokenStore.put(secondSnapshotBytes);
        } catch {
            placementThrew = true;
        }
        assert(placementThrew, 'F8. decentralized Snapshot placement for the second publication genuinely failed — it was never even placed, so it was never announced either');
        const { result: independentClaim } = await distributeClaim(secondPublication, { transactionId: 'ReverseIndependenceClaimTx000000000001', relayHandler: () => ({ published: true, id: 'e'.repeat(64) }) });
        assert(independentClaim.material.uri === 'ar://ReverseIndependenceClaimTx000000000001', 'F9. REVERSE DIRECTION: Signed Claim distribution for the same publication succeeds completely, even though that publication\'s own decentralized Snapshot placement never even got off the ground');
        assert(independentClaim.discovery.id === 'e'.repeat(64), 'F10. ...its own discovery announcement succeeds too');

        // And, finally: the very first baseline resolution from F-i/F-ii
        // is re-checked, proving nothing above ever mutated it.
        const finalCheck = await resolver.resolve(discoveryTag, reference.hash, { storeRegistry: registry });
        assert(finalCheck.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED && finalCheck.bytes === snapshotBytes, 'F11. after every failure exercised above, the original baseline Snapshot resolution is completely unaffected');

        console.log('✓ F. failure independence, three ways — Signed Claim distribution, direct-storage Snapshot placement, and Nostr-based Snapshot discovery each fail without disturbing the other two, in either direction');
    }

    // ===============================================================
    // Section G — structural boundary audit (source-scanning, as in
    // 0.9.131 and 0.9.134).
    // ===============================================================
    {
        const resolverCode = await codeOnlySource('application/DecentralizedSnapshotResolver.js');
        const resolverForbidden = [
            'PublicationDistribution',
            'ArweavePublicationMaterialUploader',
            'PublicationDistributionExecutor',
            'PublicationDistributionOrchestrator',
            'NostrPublicationDiscoveryPublisher',
            'WorldView',
            'ui/main',
            'wallet',
            'NostrInjectedProviderPublisher'
        ];
        for (const term of resolverForbidden) {
            assert(!resolverCode.includes(term), `G1. application/DecentralizedSnapshotResolver.js never references '${term}'`);
        }

        const nostrSnapshotPublisherCode = await codeOnlySource('application/NostrSnapshotDiscoveryPublisher.js');
        assert(!nostrSnapshotPublisherCode.includes('NostrPublicationDiscoveryPublisher'), 'G2. application/NostrSnapshotDiscoveryPublisher.js never imports or references the Signed Claim family\'s own NostrPublicationDiscoveryPublisher');
        assert(!nostrSnapshotPublisherCode.includes('NostrInjectedProviderPublisher'), 'G3. ...and never imports a concrete Nostr host adapter either — publishImpl stays an injection point');

        const nostrSnapshotQueryCode = await codeOnlySource('application/NostrSnapshotDiscoveryQueryService.js');
        assert(!nostrSnapshotQueryCode.includes('SnapshotPlacementResolver') && !nostrSnapshotQueryCode.includes('SnapshotPlacementStoreRegistry') && !nostrSnapshotQueryCode.includes('PublicationSnapshotPlacement'), 'G4. application/NostrSnapshotDiscoveryQueryService.js never references the signed, peer-based Snapshot Placement family');

        const arweaveStoreCode = await codeOnlySource('content/ArweaveContentStore.js');
        assert(!/nostr/i.test(arweaveStoreCode), 'G5. content/ArweaveContentStore.js remains ignorant of Nostr in any form');
        assert(!arweaveStoreCode.includes('NostrSnapshotDiscoveryPublisher') && !arweaveStoreCode.includes('NostrSnapshotDiscoveryQueryService') && !arweaveStoreCode.includes('DecentralizedSnapshotResolver'), 'G6. ...and stays ignorant of everything built ON TOP of it too — a storage adapter never imports its own consumers');
        assert(!arweaveStoreCode.includes('PublicationDistribution') && !arweaveStoreCode.includes('ArweavePublicationMaterialUploader'), 'G7. content/ArweaveContentStore.js still never references the Signed Claim distribution family (re-proving 0.9.131/0.9.132\'s own boundary after two more milestones of new material)');

        console.log('✓ G. structural boundary audit — DecentralizedSnapshotResolver.js, NostrSnapshotDiscoveryPublisher.js, NostrSnapshotDiscoveryQueryService.js, and ArweaveContentStore.js each stay within their own documented import boundary');
    }

    // ===============================================================
    // Section H — no implicit application wiring. The chain is
    // explicitly composable by a caller (this test), but no production
    // file silently wires it into the application's default flow.
    // ===============================================================
    {
        const uiMainCode = await codeOnlySource('ui/main.js');
        const wiringForbidden = [
            'ArweaveContentStore',
            'NostrSnapshotDiscoveryPublisher',
            'NostrSnapshotDiscoveryQueryService',
            'DecentralizedSnapshotResolver'
        ];
        for (const term of wiringForbidden) {
            assert(!uiMainCode.includes(term), `H1. ui/main.js never references '${term}' — this milestone's whole chain stays unwired into any composition root`);
        }

        // Explicit composability, proven positively: this test's own
        // Section A already built and drove the complete chain by hand,
        // with no helper other than plain constructors — that IS the
        // "composable explicitly by a caller" half of this section's
        // claim, so it is not re-demonstrated here.
        assert(await (async () => { try { await readFile(new URL('application/DecentralizedSnapshotResolver.js', SOURCE_ROOT)); return true; } catch { return false; } })(), 'H2. sanity: the file exists and is readable, i.e. genuinely importable by any caller who chooses to');

        console.log('✓ H. no implicit application wiring — the decentralized Snapshot chain is explicitly composable (Section A) but never silently part of the application\'s default publication flow (ui/main.js)');
    }

    console.log('\n✅ All End-to-End Decentralized Snapshot Distribution Audit tests passed.');
}

await run();
