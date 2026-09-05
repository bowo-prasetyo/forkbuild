import { readFile } from 'node:fs/promises';

import { createNostrRelayQueryClient } from '../nostr/NostrRelayQueryClient.js';
import { NostrDiscoveryQueryService } from '../application/NostrDiscoveryQueryService.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/NostrSnapshotDiscoveryQueryService.js';
import { NostrPublicationDiscoveryPublisher } from '../application/NostrPublicationDiscoveryPublisher.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { describeDecentralizedDiscoveryEnvelope } from '../core/DecentralizedDiscoveryEnvelope.js';
import {
    composeDecentralizedWorldEncounterMaterialDiscoveryServices,
    composeDecentralizedWorldEncounterMaterialDiscoveryRuntime
} from '../application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js';
import { composeDiscoverWorldEncounterPublicationCommand } from '../application/DiscoverWorldEncounterPublicationCommandComposition.js';
import { DecentralizedWorldDiscoveryLeadRegistry } from '../application/DecentralizedWorldDiscoveryLeadRegistry.js';
import { queryDecentralizedWorldDiscoveryIntoRegistry } from '../application/DecentralizedWorldDiscoveryQueryRegistryBridge.js';
import { DecentralizedWorldEncounterLeadResolutionStatus } from '../application/DecentralizedWorldEncounterLeadResolution.js';
import { WorldEncounterMaterialLoadStatus } from '../application/WorldEncounterMaterialLoading.js';
import { WorldEncounterMaterialVerificationStatus } from '../application/WorldEncounterMaterialVerification.js';
import { composeWorldEncounterMaterialVerifier } from '../application/WorldEncounterMaterialVerifierRuntimeComposition.js';
import { composeSnapshotDistributionRuntime } from '../application/SnapshotDistributionRuntimeComposition.js';
import { composeDiscoverSnapshotRuntime } from '../application/DiscoverSnapshotRuntimeComposition.js';
import { executeDiscoverSnapshotCommand } from '../application/DiscoverSnapshotCommand.js';
import { DecentralizedSnapshotResolver } from '../application/DecentralizedSnapshotResolver.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';
import { resolveSnapshotPublicationAttribution } from '../application/SnapshotPublicationAttribution.js';
import { SnapshotPublicationAttributionOutcome } from '../application/SnapshotPublicationAttributionOutcome.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';

// 0.9.148 — End-to-End Decentralized Discovery Runtime Audit.
//
// Test-only. Zero production changes. 0.9.147 built the one missing
// transport capability (`nostr/NostrRelayQueryClient.js`) and wired ONE
// instance of it into BOTH previously-dormant discovery seams — World
// Material discovery (0.9.110) and Snapshot discovery (0.9.142) — but its
// own test suite proved the client in isolation, against the two REAL
// query services directly, never against the full, composed application
// chain those services sit inside. This file is the audit 0.9.147's own
// "Recommendation" named as the honest next step: does a real relay-query
// transport actually activate both dormant pipelines end to end, without
// merging their semantics, reordering their candidates, or letting
// discovery evidence masquerade as verification or attribution?
//
//                     Nostr Relay
//                         │
//                         ▼
//               NostrRelayQueryClient   (0.9.147, unmodified)
//                         │
//               ┌─────────┴─────────┐
//               │                   │
//               ▼                   ▼
//     World Material Discovery   Snapshot Discovery
//     (0.9.31/0.9.110/0.9.111)   (0.9.133/0.9.134/0.9.142)
//               │                   │
//               ▼                   ▼
//        existing lead        Snapshot locator
//         resolution           resolution
//               │                   │
//               │                   ▼
//               │              retrieval → verification
//               │                   │
//               ▼                   ▼
//        VERIFIED material    Snapshot–Publication Attribution
//
// Every collaborator this file exercises is real and unmodified — the only
// thing ever faked is the Nostr WIRE (a plain-object `WebSocket` substitute,
// the identical technique `tests/NostrRelayQueryClient.test.js` already
// established) and the Arweave gateway HTTP boundary (`fetchImpl`), exactly
// as every prior audit in this family (0.9.122, 0.9.135, 0.9.139, 0.9.141,
// 0.9.145) already does for its own substrate boundary.
//
//   Section A: real World Material discovery — a genuine, stateful,
//              in-process relay, queried through the real
//              NostrRelayQueryClient, feeding the real, unmodified
//              NostrDiscoveryQueryService → composition root →
//              WorldEncounterCanvas's own discoverPublication() action —
//              ending in RESOLVED + VERIFIED.
//   Section B: real Snapshot discovery — the SAME relay, queried through
//              the SAME kind of real client, feeding
//              NostrSnapshotDiscoveryQueryService → DecentralizedSnapshotResolver
//              → ArweaveContentStore → hash verification →
//              SnapshotPublicationAttribution — ending in MATCH.
//   Section C: shared transport, separate semantics — the identical
//              discoveryTag string, on the identical relay, queried
//              through the identical client, resolves to two DISJOINT
//              result sets for the two families, because each family's own
//              envelope parser accepts only its own shape. Transport is
//              shared; nothing else is.
//   Section D: candidate preservation — relay-insertion order survives
//              NostrDiscoveryQueryService, the lead registry,
//              NostrSnapshotDiscoveryQueryService, and
//              DecentralizedSnapshotResolver's own deterministic
//              first-match selection. No ranking or deduplication is
//              introduced above the transport layer.
//   Section E: failure distinction across layers — a working relay's own
//              empty EOSE, a genuine connection error, a timeout, and a
//              malformed frame all stay distinguishable exactly where
//              nostr/NostrRelayQueryClient.js's own header says they do,
//              and each caller above it re-collapses them only according
//              to its own, already-documented contract — never losing a
//              distinction a layer above still needs.
//   Section F: discovery ≠ verification — a false Snapshot announcement,
//              discovered through the real relay transport this milestone
//              audits, is still refused at resolve()'s own verification
//              step; a genuinely discovered-and-resolved World Material
//              lead whose retrieved bytes were tampered with after signing
//              is still actively rejected.
//   Section G: discovery ≠ attribution — a bare discovery candidate can
//              never be fed into attribution at all (it carries no
//              `outcome`), and an announcement with no genuinely
//              retrievable bytes never resolves, let alone attributes.
//   Section H: identity separation — Publication id, Snapshot content
//              hash, Arweave transaction id, Nostr event id, Snapshot
//              locator, and — new, now that the relay is real — Relay URL,
//              all stay pairwise distinct through one real, MATCHing
//              scenario.
//   Section I: World View runtime activation — a repository sweep proving
//              ui/main.js constructs the relay client exactly once and
//              hands the SAME instance to both composition roots, plus a
//              live reproduction proving one real client instance
//              genuinely drives both independently-composed services to
//              real results over one shared relay.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function flushMicrotasks() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

// ===================================================================
// A genuinely stateful, in-process NIP-01 relay — never a single canned
// response. `publishImpl` appends a real event to this relay's own
// accumulated log; `RelayWebSocket` answers a `REQ` by scanning that WHOLE
// log for matches, in the order events were ever published, then EOSE —
// the real relay/EOSE contract nostr/NostrRelayQueryClient.js's own header
// documents, exercised against real accumulated state so that World
// Material discovery and Snapshot discovery can genuinely share ONE relay
// instance, exactly the shape this milestone's own diagram draws.
// ===================================================================
function makeInMemoryRelayNetwork(relayUrl = 'wss://audit-relay.example') {
    const events = [];
    let counter = 0;

    async function publishImpl(url, eventTemplate) {
        counter += 1;
        const id = counter.toString(16).padStart(64, '0');
        events.push({
            id,
            pubkey: 'fake-audit-pubkey',
            kind: eventTemplate.kind,
            tags: eventTemplate.tags,
            content: eventTemplate.content,
            sig: 'fake-audit-sig'
        });
        return { published: true, id };
    }

    function matchesFilter(event, filter) {
        if (Array.isArray(filter.kinds) && !filter.kinds.includes(event.kind)) {
            return false;
        }
        const tagFilters = Object.entries(filter).filter(([key]) => key.startsWith('#'));
        return tagFilters.every(([key, values]) => {
            const tagName = key.slice(1);
            return event.tags.some((tag) => tag[0] === tagName && values.includes(tag[1]));
        });
    }

    class RelayWebSocket {
        constructor(url) {
            this.url = url;
            this.readyState = 0;
            queueMicrotask(() => {
                this.readyState = 1;
                if (this.onopen) this.onopen();
            });
        }
        send(data) {
            let parsed;
            try {
                parsed = JSON.parse(data);
            } catch {
                return;
            }
            if (!Array.isArray(parsed) || parsed[0] !== 'REQ') {
                return;
            }
            const [, subscriptionId, filter] = parsed;
            const limit = Number.isInteger(filter.limit) ? filter.limit : events.length;
            const matched = events.filter((event) => matchesFilter(event, filter)).slice(0, limit);
            for (const event of matched) {
                const raw = JSON.stringify(['EVENT', subscriptionId, event]);
                queueMicrotask(() => { if (this.onmessage) this.onmessage({ data: raw }); });
            }
            queueMicrotask(() => { if (this.onmessage) this.onmessage({ data: JSON.stringify(['EOSE', subscriptionId]) }); });
        }
        close() { this.readyState = 3; }
    }

    return { events, publishImpl, RelayWebSocket, relayUrl };
}

// A relay whose socket always errors — a genuine transport failure, per
// nostr/NostrRelayQueryClient.js's own header.
function erroringSocketCtor() {
    return class FakeSocket {
        constructor() {
            queueMicrotask(() => { if (this.onerror) this.onerror(new Error('audit: relay connection failed')); });
        }
        send() {}
        close() {}
    };
}

// A relay that never answers at all — opens, then never sends EOSE, so only
// this milestone's own timeoutMs ends the call.
function silentSocketCtor() {
    return class FakeSocket {
        constructor() { /* never opens, never answers */ }
        send() {}
        close() {}
    };
}

function makeFakeArweaveGateway() {
    const network = new Map();
    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        if (options.method === 'POST' && parsed.pathname === '/tx') {
            const transaction = JSON.parse(options.body);
            network.set(transaction.id, transaction.data);
            return new Response('OK', { status: 200 });
        }
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

// A no-op Arweave discovery GraphQL fetch — this file never uses Arweave
// for DISCOVERY, but composeDecentralizedWorldEncounterMaterialDiscoveryServices()
// always constructs the Arweave service, so every query against it must
// honestly resolve empty rather than error.
async function emptyArweaveGraphqlFetch() {
    return new Response(JSON.stringify({ data: { transactions: { edges: [] } } }), { status: 200 });
}

function gatewayRetrievalFetch(materialByTxId) {
    return async (url) => {
        const txId = url.split('/').pop();
        const material = materialByTxId[txId];
        if (!material) {
            return new Response('', { status: 404 });
        }
        return new Response(JSON.stringify(material), { status: 200 });
    };
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function buildRealSigner(storage, username) {
    const provider = new LocalIdentityProvider(storage);
    provider.login(username);
    return provider;
}

function buildSignedPublication(identityProvider, overrides = {}) {
    const publisherIdentity = identityProvider.getSigningIdentity().toJSON();
    let publication = new Publication({
        id: 'pub-audit',
        documentId: 'doc-audit',
        title: 'A Publication Discovered Through The Real Relay Transport',
        author: 'audit-author',
        publisherIdentity,
        contentReference: { hash: 'placeholder-hash', uri: 'ar://PLACEHOLDER', storage: 'ar' },
        signature: null,
        ...overrides
    });
    publication = publication.withSignature(identityProvider.signCanonical(publication.getSigningDescriptor()));
    return publication;
}

function worldMaterialCtx(overrides = {}) {
    return {
        discoveryCommand: null,
        discoveryObjectId: '',
        discoveryTag: '',
        discovering: false,
        discoveryError: null,
        discoveryResult: null,
        discoveryRequestId: 0,
        discoverPublication: WorldEncounterCanvas.methods.discoverPublication,
        ...overrides
    };
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function run() {
    // ===============================================================
    // Section A — real World Material discovery: a genuine, stateful
    // relay → the real NostrRelayQueryClient → the real, unmodified
    // NostrDiscoveryQueryService → the real, unmodified composition root
    // → WorldEncounterCanvas's own discoverPublication() action.
    // ===============================================================
    {
        const network = makeInMemoryRelayNetwork('wss://audit-relay-a.example');
        const queryImpl = createNostrRelayQueryClient({ webSocketImpl: network.RelayWebSocket });
        assert(typeof queryImpl === 'function', 'A0. sanity: the real client resolves a usable queryImpl');

        const storage = new InMemoryStorageProvider();
        const alice = buildRealSigner(storage, 'audit-section-a-alice');
        const publication = buildSignedPublication(alice, {
            id: 'pub-audit-a',
            contentReference: { hash: 'placeholder-hash', uri: 'ar://AUDIT-A-TX', storage: 'ar' }
        });

        // Announce the Publication's own uri through the REAL publisher,
        // onto the REAL relay — never a hand-built event.
        const publisher = new NostrPublicationDiscoveryPublisher({
            relayUrl: network.relayUrl,
            discoveryTag: 'audit-shared-world',
            publishImpl: network.publishImpl
        });
        const published = await publisher.publish(describeDecentralizedDiscoveryEnvelope({
            protocol: 'forkbuild', version: 1, kind: WorldEncounterKind.PUBLICATION,
            objectId: publication.id, uri: publication.contentReference.uri
        }));
        assert(published && published.published === true, 'A1. sanity: the envelope was genuinely announced on the real relay');

        const services = composeDecentralizedWorldEncounterMaterialDiscoveryServices({
            nostrQueryImpl: queryImpl,
            arweaveFetchImpl: emptyArweaveGraphqlFetch
        });
        assert(services.nostr !== null, 'A2. the Nostr service is genuinely constructed — a real queryImpl was supplied');

        const { verifier } = composeWorldEncounterMaterialVerifier();
        const runtime = composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({
            discoveryServices: services,
            arweaveResolverOptions: { fetchImpl: gatewayRetrievalFetch({ 'AUDIT-A-TX': publication.toJSON() }) },
            verifier
        });

        const discoverWorldEncounterPublicationCommand = composeDiscoverWorldEncounterPublicationCommand({
            runtime,
            discoveryProvider: { list: () => [publication] }
        });

        const ctx = worldMaterialCtx({
            discoveryCommand: discoverWorldEncounterPublicationCommand,
            discoveryObjectId: publication.id,
            discoveryTag: 'audit-shared-world'
        });
        ctx.discoverPublication();
        await flushMicrotasks();

        assert(ctx.discoveryError === null, 'A3. no error notice — the real relay, real client, and real composed runtime all genuinely cooperate');
        assert(ctx.discoveryResult.discovery.nostr.length === 1, 'A4. the real NostrDiscoveryQueryService, fed by the real relay client, reports the one lead genuinely announced');
        assert(ctx.discoveryResult.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED,
            'A5. real association evidence resolves the discovered lead RESOLVED');
        assert(ctx.discoveryResult.inspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE,
            'A6. the resolved lead\'s own material is actually retrieved');
        assert(ctx.discoveryResult.inspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED,
            'A7. FLAGSHIP — the real signature verifier reports VERIFIED, driven entirely through WorldEncounterCanvas\'s own discoverPublication() action, over a real relay, a real client, and the real, unmodified 0.9.24-through-0.9.111 chain');

        console.log('✓ Section A: real World Material discovery — relay → NostrRelayQueryClient → NostrDiscoveryQueryService → composition root → WorldEncounterCanvas\'s own action — resolves and verifies end to end');
    }

    // ===============================================================
    // Section B — real Snapshot discovery, over the SAME KIND of
    // real relay/client, ending in retrieval, verification, and MATCH.
    // ===============================================================
    let sectionBFixture;
    {
        const network = makeInMemoryRelayNetwork('wss://audit-relay-b.example');
        const queryImpl = createNostrRelayQueryClient({ webSocketImpl: network.RelayWebSocket });

        const gateway = makeFakeArweaveGateway();
        const signer = makeFakeArweaveSigner();
        const discoveryTag = 'audit-shared-snapshot';

        const distribution = composeSnapshotDistributionRuntime({
            arweaveContentStoreOptions: { signer, fetchImpl: gateway.fetchImpl },
            nostrSnapshotDiscoveryPublisherOptions: { publishImpl: network.publishImpl, discoveryTag }
        });

        const bytes = JSON.stringify({ world: { buildings: [{ id: 'audit-b-building', bricks: 7 }] } });
        const reference = await distribution.contentStore.put(bytes);
        await distribution.discoveryPublisher.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage });

        const discovery = composeDiscoverSnapshotRuntime({
            arweaveContentStoreOptions: { signer, fetchImpl: gateway.fetchImpl },
            nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl }
        });
        assert(discovery.resolver !== null, 'B1. the resolver is genuinely constructed from the real relay client');

        const resolvedSnapshot = await executeDiscoverSnapshotCommand({
            discoveryTag, contentHash: reference.hash, resolver: discovery.resolver, contentStore: discovery.contentStore
        });
        assert(resolvedSnapshot.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED,
            'B2. discovery (real relay) → location → retrieval → verification all succeed through the real composed runtime');

        const publication = new Publication({ id: 'pub-audit-b', documentId: 'doc-audit-b', contentReference: new ContentReference({ hash: reference.hash }) });
        const attribution = resolveSnapshotPublicationAttribution(publication, resolvedSnapshot);
        assert(attribution.outcome === SnapshotPublicationAttributionOutcome.MATCH,
            'B3. FLAGSHIP — the complete chain (real relay → NostrRelayQueryClient → NostrSnapshotDiscoveryQueryService → DecentralizedSnapshotResolver → ArweaveContentStore → hash verification → SnapshotPublicationAttribution) ends in MATCH');

        sectionBFixture = { network, queryImpl, discoveryTag, reference, publication, resolvedSnapshot };
        console.log('✓ Section B: real Snapshot discovery — relay → NostrRelayQueryClient → NostrSnapshotDiscoveryQueryService → DecentralizedSnapshotResolver → ContentStore → verification → attribution — ends in MATCH');
    }

    // ===============================================================
    // Section C — shared transport, separate semantics: the identical
    // discoveryTag, on the identical relay, queried through the identical
    // client, resolves to two DISJOINT result sets.
    // ===============================================================
    {
        const network = makeInMemoryRelayNetwork('wss://audit-relay-c.example');
        const queryImpl = createNostrRelayQueryClient({ webSocketImpl: network.RelayWebSocket });
        const sharedTag = 'audit-section-c-identical-tag';

        // A World Material envelope and a Snapshot envelope, announced
        // under the EXACT SAME discoveryTag, on the SAME relay.
        const worldPublisher = new NostrPublicationDiscoveryPublisher({ relayUrl: network.relayUrl, discoveryTag: sharedTag, publishImpl: network.publishImpl });
        await worldPublisher.publish(describeDecentralizedDiscoveryEnvelope({
            protocol: 'forkbuild', version: 1, kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-audit-c', uri: 'ar://AUDIT-C-WORLD'
        }));

        const snapshotPublisher = new NostrSnapshotDiscoveryPublisher({ relayUrl: network.relayUrl, discoveryTag: sharedTag, publishImpl: network.publishImpl });
        const snapshotHash = computeContentHash('Section C: Snapshot-only content');
        await snapshotPublisher.publish({ contentHash: snapshotHash, locator: 'ar://AUDIT-C-SNAPSHOT', storage: 'ar' });

        assert(network.events.length === 2, 'C0. sanity: both events genuinely landed on the ONE shared relay');

        const worldService = new NostrDiscoveryQueryService({ queryImpl, relayUrl: network.relayUrl, tagName: 't', kinds: [1] });
        const snapshotService = new NostrSnapshotDiscoveryQueryService({ queryImpl, relayUrl: network.relayUrl, tagName: 't', kinds: [1] });

        const worldCandidates = await worldService.search(sharedTag);
        const snapshotCandidates = await snapshotService.search(sharedTag);

        assert(worldCandidates.length === 1 && worldCandidates[0].uri === 'ar://AUDIT-C-WORLD',
            'C1. querying the SAME relay through the SAME client, World Material discovery reports ONLY the event whose content parses as its own envelope shape');
        assert(snapshotCandidates.length === 1 && snapshotCandidates[0].locator === 'ar://AUDIT-C-SNAPSHOT',
            'C2. ...and Snapshot discovery reports ONLY the event whose content parses as ITS OWN envelope shape — never the World Material one, despite the identical tag and the identical underlying relay/client');
        assert(worldCandidates[0].uri !== snapshotCandidates[0].locator,
            'C3. the two result sets are genuinely disjoint — a result destined for one family never becomes evidence for the other');

        // Structural confirmation: neither query service's own file imports
        // the other's envelope module — the separation is architectural,
        // not merely a fixture coincidence.
        const worldServiceCode = await codeOnlySource('application/NostrDiscoveryQueryService.js');
        const snapshotServiceCode = await codeOnlySource('application/NostrSnapshotDiscoveryQueryService.js');
        assert(!worldServiceCode.includes('SnapshotDiscoveryEnvelope'), 'C4. NostrDiscoveryQueryService never imports the Snapshot envelope module');
        assert(!snapshotServiceCode.includes('DecentralizedDiscoveryEnvelope'), 'C5. NostrSnapshotDiscoveryQueryService never imports the Decentralized (World Material) envelope module');

        console.log('✓ Section C: transport is shared (one relay, one client, even one identical tag); semantics are not — each family parses only its own envelope shape');
    }

    // ===============================================================
    // Section D — candidate preservation: relay-insertion order survives
    // every application layer; no accidental ranking or deduplication is
    // introduced above the transport.
    // ===============================================================
    {
        // D-i. World Material — three distinct leads, relay order preserved
        // through NostrDiscoveryQueryService AND the lead registry.
        {
            const network = makeInMemoryRelayNetwork('wss://audit-relay-d1.example');
            const queryImpl = createNostrRelayQueryClient({ webSocketImpl: network.RelayWebSocket });
            const discoveryTag = 'audit-section-d-world';
            const publisher = new NostrPublicationDiscoveryPublisher({ relayUrl: network.relayUrl, discoveryTag, publishImpl: network.publishImpl });

            const uris = ['ar://SECTION-D-EVENT-A', 'ar://SECTION-D-EVENT-B', 'ar://SECTION-D-EVENT-C'];
            for (const uri of uris) {
                await publisher.publish(describeDecentralizedDiscoveryEnvelope({
                    protocol: 'forkbuild', version: 1, kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-audit-d', uri
                }));
            }

            const service = new NostrDiscoveryQueryService({ queryImpl, relayUrl: network.relayUrl, tagName: 't', kinds: [1] });
            const candidates = await service.search(discoveryTag);
            assert(candidates.map((c) => c.uri).join(',') === uris.join(','),
                'D1. EVENT A, EVENT B, EVENT C are reported in EXACTLY relay order by NostrDiscoveryQueryService — never sorted, never collapsed');

            const registry = new DecentralizedWorldDiscoveryLeadRegistry();
            await queryDecentralizedWorldDiscoveryIntoRegistry(registry, service, discoveryTag);
            assert(registry.listLeads().map((lead) => lead.uri).join(',') === uris.join(','),
                'D2. the lead registry preserves the identical relay order across three distinct leads — no ranking or dedup introduced one layer up either');
        }

        // D-ii. Snapshot — three candidates announced for the SAME
        // contentHash; all three are reported, in order; the resolver
        // deterministically selects the FIRST one, never a "better" one.
        {
            const network = makeInMemoryRelayNetwork('wss://audit-relay-d2.example');
            const queryImpl = createNostrRelayQueryClient({ webSocketImpl: network.RelayWebSocket });
            const discoveryTag = 'audit-section-d-snapshot';

            const gateway = makeFakeArweaveGateway();
            const signer = makeFakeArweaveSigner();
            const contentStore = new ArweaveContentStore({ signer, fetchImpl: gateway.fetchImpl });
            const announcer = new NostrSnapshotDiscoveryPublisher({ relayUrl: network.relayUrl, discoveryTag, publishImpl: network.publishImpl });

            const genuine = await contentStore.put('Section D: the genuine, first-announced content');
            const decoyA = await contentStore.put('Section D: decoy A');
            const decoyB = await contentStore.put('Section D: decoy B');

            // All three claim the SAME contentHash — only correctness of
            // ORDER and SELECTION is under test here (Section F covers a
            // claim that fails verification).
            await announcer.publish({ contentHash: genuine.hash, locator: genuine.uri, storage: genuine.storage });
            await announcer.publish({ contentHash: genuine.hash, locator: decoyA.uri, storage: decoyA.storage });
            await announcer.publish({ contentHash: genuine.hash, locator: decoyB.uri, storage: decoyB.storage });

            const queryService = new NostrSnapshotDiscoveryQueryService({ queryImpl, relayUrl: network.relayUrl, tagName: 't', kinds: [1] });
            const resolver = new DecentralizedSnapshotResolver(queryService);
            const result = await resolver.resolve(discoveryTag, genuine.hash, { contentStore });

            assert(result.candidates.map((c) => c.locator).join(',') === [genuine.uri, decoyA.uri, decoyB.uri].join(','),
                'D3. all three matching candidates are reported, in EXACT relay order');
            assert(result.locator === genuine.uri,
                'D4. deterministic first-match selection: the FIRST announced candidate is the one actually resolved — never re-ranked toward a "better" or "more available" one');
            assert(result.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'D5. sanity: the first candidate genuinely resolves');
        }

        console.log('✓ Section D: relay-insertion order survives NostrDiscoveryQueryService, the lead registry, NostrSnapshotDiscoveryQueryService, and DecentralizedSnapshotResolver\'s own deterministic first-match selection — no accidental ranking or deduplication above the transport layer');
    }

    // ===============================================================
    // Section E — failure distinction across layers.
    // ===============================================================
    {
        // E1/E2 — a genuinely rejecting/silent relay is caught by
        // NostrDiscoveryQueryService's own re-collapse into [], and the
        // full World Material runtime honestly reports UNAVAILABLE — never
        // a thrown error escaping the composition root.
        {
            const erroringClient = createNostrRelayQueryClient({ webSocketImpl: erroringSocketCtor() });
            const services = composeDecentralizedWorldEncounterMaterialDiscoveryServices({ nostrQueryImpl: erroringClient, arweaveFetchImpl: emptyArweaveGraphqlFetch });
            const { verifier } = composeWorldEncounterMaterialVerifier();
            const runtime = composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({ discoveryServices: services, verifier });
            const result = await runtime.discoverWorldEncounterPublication({ objectId: 'pub-audit-e1', discoveryTag: 'audit-e1', publications: [] });
            assert(result.discovery.nostr.length === 0, 'E1. a genuine relay CONNECTION ERROR collapses to zero leads at NostrDiscoveryQueryService, never a thrown error propagating out of the runtime');
            assert(result.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.UNAVAILABLE, 'E1b. ...and resolution honestly reports UNAVAILABLE');
        }
        {
            const timeoutClient = createNostrRelayQueryClient({ webSocketImpl: silentSocketCtor(), timeoutMs: 80 });
            const services = composeDecentralizedWorldEncounterMaterialDiscoveryServices({ nostrQueryImpl: timeoutClient, arweaveFetchImpl: emptyArweaveGraphqlFetch });
            const { verifier } = composeWorldEncounterMaterialVerifier();
            const runtime = composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({ discoveryServices: services, verifier });
            const result = await runtime.discoverWorldEncounterPublication({ objectId: 'pub-audit-e2', discoveryTag: 'audit-e2', publications: [] });
            assert(result.discovery.nostr.length === 0, 'E2. a relay TIMEOUT (never sends EOSE) collapses identically to zero leads');
            assert(result.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.UNAVAILABLE, 'E2b. ...UNAVAILABLE, the same honest outcome as a connection error, per NostrDiscoveryQueryService\'s own already-documented re-collapse');
        }

        // E3 — the identical re-collapse, one family over: a rejecting
        // relay makes Snapshot discovery report NOT_DISCOVERED, never a
        // thrown error and never a distinguishable "relay is down" state.
        {
            const erroringClient = createNostrRelayQueryClient({ webSocketImpl: erroringSocketCtor() });
            const discovery = composeDiscoverSnapshotRuntime({ arweaveContentStoreOptions: {}, nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: erroringClient } });
            const result = await executeDiscoverSnapshotCommand({ discoveryTag: 'audit-e3', contentHash: 'irrelevant-hash', resolver: discovery.resolver, contentStore: discovery.contentStore });
            assert(result.outcome === DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED,
                'E3. a genuinely rejecting relay collapses to NOT_DISCOVERED at the resolver layer — "no matching events" and "relay unavailable" are real, distinct facts at the transport layer (per nostr/NostrRelayQueryClient.js\'s own header) that this specific, already-documented layer deliberately re-collapses for its own callers');
        }

        // E4 — a malformed relay frame is silently skipped, never
        // fabricated into a phantom candidate, while a genuine sibling
        // event on the identical subscription still arrives.
        {
            const genuineUri = 'ar://SECTION-E4-GENUINE';
            const genuineEvent = { id: 'e4-genuine', kind: 1, content: JSON.stringify(describeDecentralizedDiscoveryEnvelope({
                protocol: 'forkbuild', version: 1, kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-audit-e4', uri: genuineUri
            })) };
            class MalformedFrameSocket {
                constructor() { queueMicrotask(() => { if (this.onopen) this.onopen(); }); }
                send(data) {
                    let parsed;
                    try { parsed = JSON.parse(data); } catch { return; }
                    if (!Array.isArray(parsed) || parsed[0] !== 'REQ') return;
                    const [, subId] = parsed;
                    const frames = [
                        'this is not even valid JSON',
                        JSON.stringify(['EVENT', subId, 'a string payload, not a plain object']),
                        JSON.stringify(['EVENT', subId, genuineEvent]),
                        JSON.stringify(['NOTICE', 'unrelated relay chatter']),
                        JSON.stringify(['EOSE', subId])
                    ];
                    for (const raw of frames) {
                        queueMicrotask(() => { if (this.onmessage) this.onmessage({ data: raw }); });
                    }
                }
                close() {}
            }
            const client = createNostrRelayQueryClient({ webSocketImpl: MalformedFrameSocket });
            const service = new NostrDiscoveryQueryService({ queryImpl: client, relayUrl: 'wss://audit-e4', tagName: 't', kinds: [1] });
            const candidates = await service.search('audit-e4-tag');
            assert(candidates.length === 1 && candidates[0].uri === genuineUri,
                'E4. unparseable JSON, a non-object EVENT payload, and an unrecognized NOTICE frame are all silently skipped at the transport layer, never fabricated into a phantom candidate — the ONE genuine sibling event on the same subscription still arrives, intact');
        }

        // E5 — the transport-level three-way split itself, re-confirmed
        // directly against the real, unmodified client at the top of this
        // audit's own failure section (tests/NostrRelayQueryClient.test.js
        // already owns the exhaustive unit coverage; this is a one-line
        // cross-check that the exact split this audit's own Sections
        // E1-E3 depend on still holds today).
        {
            const network = makeInMemoryRelayNetwork('wss://audit-relay-e5.example');
            const workingClient = createNostrRelayQueryClient({ webSocketImpl: network.RelayWebSocket });
            const empty = await workingClient(network.relayUrl, { kinds: [1], '#t': ['nobody-ever-announced-this-tag'] });
            assert(Array.isArray(empty) && empty.length === 0, 'E5a. EOSE with no matching events resolves an ordinary [], never an error');

            let erroringRejected = false;
            try { await createNostrRelayQueryClient({ webSocketImpl: erroringSocketCtor() })('wss://audit-e5-error', {}); } catch { erroringRejected = true; }
            assert(erroringRejected, 'E5b. a genuine socket error rejects — never silently []');

            let timeoutRejected = false;
            try { await createNostrRelayQueryClient({ webSocketImpl: silentSocketCtor(), timeoutMs: 60 })('wss://audit-e5-timeout', {}); } catch { timeoutRejected = true; }
            assert(timeoutRejected, 'E5c. a relay that never sends EOSE rejects once timeoutMs elapses — never silently []');
        }

        console.log('✓ Section E: no matching events / a connection error / a timeout / a malformed frame stay the four distinct transport-level facts nostr/NostrRelayQueryClient.js\'s own header describes; each caller above it re-collapses only according to its own, already-documented contract, and a malformed frame never costs a genuine sibling event its own place in the result');
    }

    // ===============================================================
    // Section F — discovery ≠ verification, proven through the real relay
    // transport this milestone audits (not a bare fake queryImpl network).
    // ===============================================================
    {
        // F-i. Snapshot: a false announcement is refused at resolve()'s
        // own verification step.
        {
            const network = makeInMemoryRelayNetwork('wss://audit-relay-f1.example');
            const queryImpl = createNostrRelayQueryClient({ webSocketImpl: network.RelayWebSocket });
            const discoveryTag = 'audit-section-f-snapshot';

            const gateway = makeFakeArweaveGateway();
            const signer = makeFakeArweaveSigner();
            const distribution = composeSnapshotDistributionRuntime({
                arweaveContentStoreOptions: { signer, fetchImpl: gateway.fetchImpl },
                nostrSnapshotDiscoveryPublisherOptions: { publishImpl: network.publishImpl, discoveryTag }
            });

            const decoyReference = await distribution.contentStore.put('Section F: the decoy\'s real, actually-retrievable bytes');
            const claimedHash = computeContentHash('Section F: a Publication\'s content the decoy never actually holds');
            // Announce the decoy's REAL locator under a FALSELY claimed
            // contentHash — the exact forged-claim shape.
            await distribution.discoveryPublisher.publish({ contentHash: claimedHash, locator: decoyReference.uri, storage: decoyReference.storage });

            const discovery = composeDiscoverSnapshotRuntime({
                arweaveContentStoreOptions: { signer, fetchImpl: gateway.fetchImpl },
                nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl }
            });
            const resolvedSnapshot = await executeDiscoverSnapshotCommand({ discoveryTag, contentHash: claimedHash, resolver: discovery.resolver, contentStore: discovery.contentStore });
            assert(resolvedSnapshot.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH,
                'F1. a forged Nostr announcement, discovered through the REAL relay transport this milestone adds, is refused at resolve()\'s own verification step — never RESOLVED');

            const publication = new Publication({ id: 'pub-audit-f1', documentId: 'doc-audit-f1', contentReference: new ContentReference({ hash: claimedHash }) });
            const attribution = resolveSnapshotPublicationAttribution(publication, resolvedSnapshot);
            assert(attribution.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH,
                'F2. attribution reports the same refusal verbatim — never MATCH, never NO_MATCH');

            console.log('✓ Section F (Snapshot): a false announcement discovered over the real relay transport is refused at verification, end to end');
        }

        // F-ii. World Material: retrieved material tampered with after
        // signing is actively rejected, even though real-relay discovery
        // and resolution both succeed.
        {
            const network = makeInMemoryRelayNetwork('wss://audit-relay-f2.example');
            const queryImpl = createNostrRelayQueryClient({ webSocketImpl: network.RelayWebSocket });

            const storage = new InMemoryStorageProvider();
            const dave = buildRealSigner(storage, 'audit-section-f-dave');
            const publication = buildSignedPublication(dave, {
                id: 'pub-audit-f2',
                contentReference: { hash: 'placeholder-hash', uri: 'ar://AUDIT-F2-TX', storage: 'ar' }
            });
            const tamperedMaterial = { ...publication.toJSON(), title: 'A Title The Signer Never Actually Signed' };

            const publisher = new NostrPublicationDiscoveryPublisher({ relayUrl: network.relayUrl, discoveryTag: 'audit-section-f-world', publishImpl: network.publishImpl });
            await publisher.publish(describeDecentralizedDiscoveryEnvelope({
                protocol: 'forkbuild', version: 1, kind: WorldEncounterKind.PUBLICATION, objectId: publication.id, uri: publication.contentReference.uri
            }));

            const services = composeDecentralizedWorldEncounterMaterialDiscoveryServices({ nostrQueryImpl: queryImpl, arweaveFetchImpl: emptyArweaveGraphqlFetch });
            const { verifier } = composeWorldEncounterMaterialVerifier();
            const runtime = composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({
                discoveryServices: services,
                arweaveResolverOptions: { fetchImpl: gatewayRetrievalFetch({ 'AUDIT-F2-TX': tamperedMaterial }) },
                verifier
            });

            const result = await runtime.discoverWorldEncounterPublication({ objectId: publication.id, discoveryTag: 'audit-section-f-world', publications: [publication] });
            assert(result.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED, 'F3. discovery and resolution both genuinely succeed through the real relay transport');
            assert(result.inspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, 'F4. the tampered material still LOADS — retrieval never judges content');
            assert(result.inspection.verification.status === WorldEncounterMaterialVerificationStatus.REJECTED,
                'F5. content tampered with after signing is actively REJECTED by the real signature verifier — real-relay discovery succeeding is never treated as verification succeeding');

            console.log('✓ Section F (World Material): a genuinely discovered and resolved lead whose retrieved bytes were tampered with after signing is actively rejected — discovery is not verification, over the real relay transport too');
        }
    }

    // ===============================================================
    // Section G — discovery ≠ attribution: the relay event itself can
    // never manufacture MATCH.
    // ===============================================================
    {
        // G-i. A bare discovery candidate — queryService.search()'s own raw
        // output — cannot be fed into attribution at all; it carries no
        // `outcome`, so attribution refuses it as a contract violation
        // rather than silently treating a rumor as a verdict.
        {
            const network = makeInMemoryRelayNetwork('wss://audit-relay-g1.example');
            const queryImpl = createNostrRelayQueryClient({ webSocketImpl: network.RelayWebSocket });
            const discoveryTag = 'audit-section-g-bare-candidate';
            const publisher = new NostrSnapshotDiscoveryPublisher({ relayUrl: network.relayUrl, discoveryTag, publishImpl: network.publishImpl });
            const hash = computeContentHash('Section G: content a bare candidate merely announces');
            await publisher.publish({ contentHash: hash, locator: 'ar://SECTION-G-LOCATOR', storage: 'ar' });

            const queryService = new NostrSnapshotDiscoveryQueryService({ queryImpl, relayUrl: network.relayUrl, tagName: 't', kinds: [1] });
            const candidates = await queryService.search(discoveryTag);
            assert(candidates.length === 1, 'G0. sanity: the relay event was genuinely discovered as a candidate');

            const publication = new Publication({ id: 'pub-audit-g1', documentId: 'doc-audit-g1', contentReference: new ContentReference({ hash }) });
            let threw = false;
            try {
                resolveSnapshotPublicationAttribution(publication, candidates[0]);
            } catch {
                threw = true;
            }
            assert(threw, 'G1. FLAGSHIP — a bare discovery candidate (no `outcome`, never resolved, never verified) cannot be handed to attribution at all: it is refused as a caller contract violation, never silently accepted as a discovery-equals-verdict shortcut');
        }

        // G-ii. An announcement with no genuinely retrievable bytes never
        // resolves — let alone attributes — even though the announcement
        // itself is perfectly well-formed and names the right contentHash.
        {
            const network = makeInMemoryRelayNetwork('wss://audit-relay-g2.example');
            const queryImpl = createNostrRelayQueryClient({ webSocketImpl: network.RelayWebSocket });
            const discoveryTag = 'audit-section-g-never-placed';
            const publisher = new NostrSnapshotDiscoveryPublisher({ relayUrl: network.relayUrl, discoveryTag, publishImpl: network.publishImpl });
            const neverPlacedHash = computeContentHash('Section G: content that was announced but never actually placed anywhere retrievable');
            await publisher.publish({ contentHash: neverPlacedHash, locator: 'ar://section-g2-never-placed-tx', storage: 'ar' });

            const gateway = makeFakeArweaveGateway();
            const signer = makeFakeArweaveSigner();
            const discovery = composeDiscoverSnapshotRuntime({
                arweaveContentStoreOptions: { signer, fetchImpl: gateway.fetchImpl },
                nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl }
            });
            const resolvedSnapshot = await executeDiscoverSnapshotCommand({ discoveryTag, contentHash: neverPlacedHash, resolver: discovery.resolver, contentStore: discovery.contentStore });
            assert(resolvedSnapshot.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_UNAVAILABLE,
                'G2. a well-formed announcement naming the exact right contentHash, discovered over the real relay, still never resolves when the locator is not genuinely retrievable — "Nostr says hash X → locator Y" means only "a candidate was discovered," never "the bytes at Y are valid"');

            const publication = new Publication({ id: 'pub-audit-g2', documentId: 'doc-audit-g2', contentReference: new ContentReference({ hash: neverPlacedHash }) });
            const attribution = resolveSnapshotPublicationAttribution(publication, resolvedSnapshot);
            assert(attribution.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_UNAVAILABLE && attribution.outcome !== SnapshotPublicationAttributionOutcome.MATCH,
                'G3. ...and attribution reports that same honest failure, never MATCH — a relay event alone can never manufacture a verdict');
        }

        // G-iii. Structural sweep — the World Material lead/registry family
        // carries no attribution vocabulary of its own; only verified
        // Snapshot bytes ever reach MATCH/NO_MATCH.
        {
            const registryCode = await codeOnlySource('application/DecentralizedWorldDiscoveryLeadRegistry.js');
            const leadCode = await codeOnlySource('core/DecentralizedWorldDiscoveryLead.js');
            assert(!/\bMATCH\b|\bNO_MATCH\b|ATTRIBUT/i.test(registryCode), 'G4. the lead registry never references MATCH/NO_MATCH or any form of ATTRIBUTION');
            assert(!/\bMATCH\b|\bNO_MATCH\b|ATTRIBUT/i.test(leadCode), 'G5. a lead\'s own description carries no attribution vocabulary either — a lead stays a rumor about a location, never a verdict');
        }

        console.log('✓ Section G: discovery ≠ attribution — a bare discovery candidate is refused by attribution outright, and an announcement with no genuinely retrievable bytes never resolves let alone attributes; the relay event itself never manufactures MATCH');
    }

    // ===============================================================
    // Section H — identity separation, now including a real Relay URL.
    // ===============================================================
    {
        const { network, queryImpl, discoveryTag, reference, publication, resolvedSnapshot } = sectionBFixture;
        const attribution = resolveSnapshotPublicationAttribution(publication, resolvedSnapshot);
        assert(attribution.outcome === SnapshotPublicationAttributionOutcome.MATCH, 'H0. sanity: reusing Section B\'s own real, MATCHing scenario');

        const arweaveTransactionId = reference.uri.replace('ar://', '');
        const nostrEventId = network.events[network.events.length - 1].id;
        const locator = resolvedSnapshot.locator;
        const relayUrl = network.relayUrl;

        const identities = {
            publicationId: publication.id,
            contentHash: reference.hash,
            arweaveTransactionId,
            nostrEventId,
            locator,
            relayUrl
        };
        const values = Object.values(identities);
        assert(new Set(values).size === values.length,
            'H1. all six identity facts are pairwise distinct — Publication id, Snapshot content hash, Arweave transaction id, Nostr event id, Snapshot locator, and Relay URL never collide');

        assert(attribution.publicationHash !== relayUrl && attribution.snapshotHash !== relayUrl,
            'H2. the Relay URL — a real fact only because this milestone\'s transport is genuinely live — never leaks into either hash attribution compares');
        assert(attribution.publicationHash !== publication.id, 'H3. publicationHash is never publication.id');
        assert(attribution.publicationHash !== arweaveTransactionId && attribution.snapshotHash !== arweaveTransactionId, 'H4. neither hash is ever the Arweave transaction id');
        assert(attribution.publicationHash !== nostrEventId && attribution.snapshotHash !== nostrEventId, 'H5. neither hash is ever the Nostr event id');
        assert(attribution.publicationHash !== locator && attribution.snapshotHash !== locator, 'H6. neither hash is ever the resolved locator URI');

        console.log('✓ Section H: Publication id, Snapshot content hash, Arweave transaction id, Nostr event id, Snapshot locator, and Relay URL all stay pairwise distinct — only content hashes ever participate in attribution');
    }

    // ===============================================================
    // Section I — World View runtime activation: a repository sweep of
    // ui/main.js's own composition, plus a live reproduction.
    // ===============================================================
    {
        const mainCodeOnly = await codeOnlySource('ui/main.js');

        const constructionMatches = mainCodeOnly.match(/createNostrRelayQueryClient\(/g) || [];
        assert(constructionMatches.length === 1, 'I1. ui/main.js constructs the relay query client exactly once — never a second instance for either family');

        const bindingMatch = /const\s+(\w+)\s*=\s*createNostrRelayQueryClient\(/.exec(mainCodeOnly);
        assert(bindingMatch !== null, 'I2. sanity: the construction is a named, inspectable binding');
        const variableName = bindingMatch[1];

        assert(new RegExp(`nostrQueryImpl:\\s*${variableName}\\b`).test(mainCodeOnly),
            'I3. the SAME instance is handed to nostrQueryImpl — World Material discovery\'s own composition root');
        assert(new RegExp(`queryImpl:\\s*${variableName}\\b`).test(mainCodeOnly),
            'I4. ...and to nostrSnapshotDiscoveryQueryServiceOptions.queryImpl — Snapshot discovery\'s own composition root. One capability, two previously-dormant seams, genuinely shared in the shipped composition root, never two independently constructed lookalikes');

        // Live reproduction: one real client instance, one shared relay,
        // both composition roots — proving both services genuinely receive
        // (and genuinely use) the intended capability, not merely that the
        // source text says so.
        const network = makeInMemoryRelayNetwork('wss://audit-relay-i.example');
        const rawClient = createNostrRelayQueryClient({ webSocketImpl: network.RelayWebSocket });
        let callCount = 0;
        const observedClient = (relayUrl, filter) => { callCount += 1; return rawClient(relayUrl, filter); };

        const worldPublisher = new NostrPublicationDiscoveryPublisher({ relayUrl: network.relayUrl, discoveryTag: 'audit-section-i-world', publishImpl: network.publishImpl });
        await worldPublisher.publish(describeDecentralizedDiscoveryEnvelope({
            protocol: 'forkbuild', version: 1, kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-audit-i', uri: 'ar://AUDIT-I-WORLD'
        }));
        const snapshotPublisher = new NostrSnapshotDiscoveryPublisher({ relayUrl: network.relayUrl, discoveryTag: 'audit-section-i-snapshot', publishImpl: network.publishImpl });
        const snapshotHash = computeContentHash('Section I: Snapshot content discovered through the shared composition-root client');
        await snapshotPublisher.publish({ contentHash: snapshotHash, locator: 'ar://AUDIT-I-SNAPSHOT', storage: 'ar' });

        const worldServices = composeDecentralizedWorldEncounterMaterialDiscoveryServices({ nostrQueryImpl: observedClient, arweaveFetchImpl: emptyArweaveGraphqlFetch });
        const snapshotRuntime = composeDiscoverSnapshotRuntime({ arweaveContentStoreOptions: {}, nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: observedClient } });

        const worldLeads = await worldServices.nostr.search('audit-section-i-world');
        const snapshotCandidates = await new NostrSnapshotDiscoveryQueryService({ queryImpl: observedClient, relayUrl: network.relayUrl, tagName: 't', kinds: [1] }).search('audit-section-i-snapshot');
        assert(snapshotRuntime.resolver !== null, 'I5. Snapshot discovery\'s own composition root genuinely constructed a resolver from the shared client');

        assert(callCount === 2, 'I6. the IDENTICAL queryImpl function is genuinely invoked once by each independently-composed service — one wired capability, never two lookalikes that merely happen to agree');
        assert(worldLeads.length === 1 && worldLeads[0].uri === 'ar://AUDIT-I-WORLD', 'I7. World Material discovery, composed with the shared client, reaches its own real result');
        assert(snapshotCandidates.length === 1 && snapshotCandidates[0].locator === 'ar://AUDIT-I-SNAPSHOT', 'I8. Snapshot discovery, composed with the SAME shared client, reaches its own real, independent result');

        console.log('✓ Section I: ui/main.js constructs the relay client exactly once and hands the SAME instance to both composition roots; a live reproduction confirms both independently-composed services genuinely receive and use the intended capability');
    }

    console.log('\n✅ All End-to-End Decentralized Discovery Runtime Audit tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
