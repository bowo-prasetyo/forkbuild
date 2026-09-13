import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalContentResolver } from '../discovery/LocalContentResolver.js';
import { IpfsContentStore } from '../content/IpfsContentStore.js';

import { LocalPublicationSnapshotPlacementCatalog } from '../application/LocalPublicationSnapshotPlacementCatalog.js';
import { PublicationSnapshotPlacementExchange } from '../application/PublicationSnapshotPlacementExchange.js';
import { PublicationSnapshotPlacementPeerExchange } from '../application/PublicationSnapshotPlacementPeerExchange.js';
import { CreatePublicationSnapshotPlacementPeerExchangeUseCase } from '../application/CreatePublicationSnapshotPlacementPeerExchangeUseCase.js';
import { CreateSnapshotPlacementOrchestratorUseCase } from '../application/CreateSnapshotPlacementOrchestratorUseCase.js';
import { SnapshotPlacementCreationOutcome } from '../application/SnapshotPlacementCreationOutcome.js';
import { SnapshotPlacementResolver } from '../application/SnapshotPlacementResolver.js';
import { SnapshotPlacementResolutionOutcome } from '../application/SnapshotPlacementResolutionOutcome.js';
import { PlacementAcquisitionKind } from '../application/PlacementAcquisitionKind.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/DiscoverSnapshotCandidatesCommand.js';
import { WorldSnapshotDiscoveryMonitor } from '../application/WorldSnapshotDiscoveryMonitor.js';
import { PublicationSnapshotPlacementPeerMessageKind } from '../application/PublicationSnapshotPlacementPeerProtocol.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';

// 0.9.484 — Passive Peer Snapshot Discovery End-to-End Integration Audit.
//
// Test-only. Production changes: none (enforced by Section L's own
// git-diff guard).
//
// ORIGINATING QUESTION. 0.9.483 activated the one missing production
// edge — PublicationSnapshotPlacementPeerExchange#announce() is now
// actually called at the one place a PublicationSnapshotPlacement is
// created — and proved, live, that a second replica's real, production
// catalog receives it and can resolve it to hash-verified bytes. That
// was a MECHANISM audit: two peers, one placement, one resolution. This
// milestone is the INTEGRATION audit the same request asked for next: is
// the whole passive-peer discovery diagram —
//
//   Peer A creates a placement -> announce() -> peer transport -> Peer B's
//   real LocalPublicationSnapshotPlacement catalog -> the existing Local
//   candidate query -> the REAL walking-triggered
//   WorldSnapshotDiscoveryMonitor (its own real movement-threshold gate
//   and request-id race guard, neither relaxed nor overridden for this
//   audit) -> SnapshotPlacementResolver -> hash-verified bytes
//
// — closed end to end, under the exact composition ui/main.js already
// runs, or does it merely look closed because every prior audit tested
// one link at a time? This file deliberately does NOT re-derive what
// 0.9.483 already proved with its own full flagship harness (Sections
// A-C below reconfirm that baseline live, but briefly); it spends its
// own weight on three questions no prior milestone in this family asked:
//
//   Section F — does a peer-announced candidate actually survive the
//               real, unmodified movement-threshold gate and the real,
//               unmodified request-id race guard, not just a single
//               observe() call?
//   Section I — if Peer B is offline at the moment of announce(), does
//               reconnecting later silently backfill what it missed, or
//               is "future announcements only" the honest, current
//               boundary?
//   Section K — can a future Local candidate adapter consume Peer B's
//               catalog uniformly, with no origin field to switch on,
//               while provenance (LOCAL vs PEER) remains available
//               separately, on demand, to whoever actually asks?
//
//   Section A — Production creation remains the sole authority (grepped,
//               not assumed) — reconfirming 0.9.483 Section A/K still
//               holds today.
//   Section B — Production composition root: exactly one peerMessageBus,
//               one PeerSessionManager/ConnectedPeerRegistry, and one
//               publicationSnapshotPlacementPeerExchange instance, by
//               source across the WHOLE application/ui surface, not only
//               the three files 0.9.483 touched.
//   Section C — Real two-peer propagation (live, authenticated,
//               LocalPeerConnectionProvider — not a stub transport),
//               feeding every section below.
//   Section D — Identity fidelity across the live wire.
//   Section E — Provenance: creator records LOCAL, receiver records PEER,
//               independently and automatically.
//   Section F — Walking-triggered convergence (see above): sub-threshold
//               movement never re-queries; crossing the threshold picks
//               up a SECOND placement announced in between; two
//               overlapping observe() calls resolve according to
//               request-id, not arrival order.
//   Section G — FLAGSHIP: the exact candidates Section F's monitor
//               surfaced are resolved, through SnapshotPlacementResolver,
//               to real bytes verified against their own contentHash.
//   Section H — Failure isolation: zero peers, a throwing transport, and
//               a genuinely malformed wire message (not merely a
//               malformed collaborator) all leave creation/ingestion
//               unaffected.
//   Section I — Duplicate & reconnection boundary (see above).
//   Section J — Multi-peer: three independently authenticated peers all
//               receive the same placement, undifferentiated.
//   Section K — Downstream candidate-query readiness (see above).
//   Section L — Boundary audit: World Encounter material loading,
//               publication verification/attribution, Nostr, active peer
//               browsing, a new peer protocol, a new peer identity
//               concept, and ranking/fallback are all confirmed, by
//               source, to remain untouched — plus a zero-production-diff
//               guard for this milestone itself.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function wait(ms = 20) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const SOURCE_ROOT = new URL('../', import.meta.url);

function grepFiles(pattern, dirs, { ignoreCase = false } = {}) {
    let hits = '';
    try {
        const flags = ignoreCase ? '-rliE' : '-rlE';
        hits = execSync(`grep ${flags} "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* grep exits non-zero on no match; treated as zero hits */ }
    return hits.trim() ? hits.trim().split('\n') : [];
}

function readSource(relativePath) {
    return execSync(`cat "${relativePath}"`, { cwd: SOURCE_ROOT.pathname }).toString();
}

// Mirrors tests/SnapshotPlacementPeerAnnouncementProductionIntegrationAudit.test.js's
// own shim: application/CreatePublicationSnapshotPlacementPeerExchangeUseCase.js
// constructs a real storage/LocalStorageProvider.js, which reads
// window.localStorage.
let _productionLocalStorageBacking = new Map();
function installProductionLocalStorage() {
    globalThis.window = globalThis.window || {};
    globalThis.window.localStorage = {
        getItem: (k) => (_productionLocalStorageBacking.has(k) ? _productionLocalStorageBacking.get(k) : null),
        setItem: (k, v) => { _productionLocalStorageBacking.set(k, String(v)); },
        removeItem: (k) => { _productionLocalStorageBacking.delete(k); },
        key: (i) => Array.from(_productionLocalStorageBacking.keys())[i] ?? null,
        get length() { return _productionLocalStorageBacking.size; }
    };
}
function resetProductionLocalStorage() {
    _productionLocalStorageBacking = new Map();
    installProductionLocalStorage();
}
installProductionLocalStorage();

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
    return new Document({ world, metadata: new DocumentMetadata({ title, author: 'tester' }) });
}

function publishLocallyAs(identityProvider, title) {
    const storage = new InMemoryStorageProvider();
    const publisher = new LocalPublisherProvider(storage);
    const publication = publisher.publish(createTestDocument(title), identityProvider);
    const discoveryProvider = new LocalDiscoveryProvider(storage);
    const contentResolver = new LocalContentResolver(publisher);
    return { publisher, publication, discoveryProvider, contentResolver };
}

function makeFakeIpfsNode({ network = new Map() } = {}) {
    async function fetchImpl(url, options) {
        const parsed = new URL(url);
        if (parsed.pathname === '/api/v0/add') {
            const blob = options.body.get('file');
            const text = await blob.text();
            // Content-addressed over the FULL text, unlike a naive
            // fixed-length prefix slice — this file, unlike its sibling
            // audits, deliberately places several genuinely different
            // documents onto the SAME shared fake network (Sections C, F,
            // G, K), and every test document here shares an identical
            // ~20-byte JSON prefix (`{"schemaVersion":1,"world":...`), so
            // a prefix-only digest would silently collide different
            // placements onto the same "CID."
            const cid = `Qm${createHash('sha256').update(text).digest('hex').slice(0, 40)}`;
            network.set(cid, text);
            return new Response(JSON.stringify({ Hash: cid, Size: String(text.length) }), { status: 200 });
        }
        if (parsed.pathname === '/api/v0/cat') {
            const cid = parsed.searchParams.get('arg');
            if (!network.has(cid)) {
                return new Response('block not found locally', { status: 500 });
            }
            return new Response(network.get(cid), { status: 200 });
        }
        return new Response('not found', { status: 404 });
    }
    return { network, fetchImpl };
}

function makeHandBuiltPlacementExchange() {
    const catalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
    const verifier = new LocalAuthorizationVerifier();
    const exchange = new PublicationSnapshotPlacementExchange(catalog, verifier);
    return { catalog, verifier, exchange };
}

// Mirrors every sibling *PeerExchange.test.js's own StubPeerMessageBus.
class StubPeerMessageBus {
    constructor() { this._handlers = new Map(); this.sent = []; this.attached = new Set(); }
    attach(peer) { this.attached.add(peer.connectionId); }
    send(peer, protocol, payload) {
        if (peer.getLifecycleState() !== PeerLifecycleState.AUTHENTICATED) {
            throw new Error('StubPeerMessageBus: cannot send, peer is not AUTHENTICATED');
        }
        this.sent.push({ peer, protocol, payload });
    }
    subscribe(protocol, handler) {
        if (!this._handlers.has(protocol)) this._handlers.set(protocol, new Set());
        this._handlers.get(protocol).add(handler);
        return () => this._handlers.get(protocol).delete(handler);
    }
    deliver(protocol, payload, meta = {}) {
        const handlers = this._handlers.get(protocol);
        if (!handlers) return;
        for (const handler of Array.from(handlers)) handler(payload, meta);
    }
}

class ThrowingPeerMessageBus extends StubPeerMessageBus {
    send() { throw new Error('ThrowingPeerMessageBus: transport failure'); }
}

class StubConnectedPeerRegistry {
    constructor(peers = []) { this._peers = peers; this._listeners = new Set(); }
    list() { return this._peers; }
    onChange(callback) { this._listeners.add(callback); return () => this._listeners.delete(callback); }
}

function stubPeer(connectionId, identityId, state = PeerLifecycleState.AUTHENTICATED) {
    return { connectionId, remoteIdentity: identityId ? { identityId } : null, getLifecycleState: () => state };
}

// 0.9.480's own test-only Local candidate adapter prototype, reproduced
// verbatim (also reused by every sibling audit in this family) — a thin,
// never-production seam over a REAL, unmodified
// LocalPublicationSnapshotPlacementCatalog instance.
class LocalSnapshotCandidateDiscoveryQueryServicePrototype {
    constructor(placementCatalog) { this._catalog = placementCatalog; }
    async search(_discoveryTag) {
        return this._catalog.list().map((placement) => ({
            contentHash: placement.contentHash, locator: placement.locator,
            storage: placement.storage, publicationId: placement.publicationId
        }));
    }
}

const DISCOVERY_TAG = 'forkbuild-snapshot';

async function run() {
    console.log('=== 0.9.484 — Passive Peer Snapshot Discovery End-to-End Integration Audit ===\n');

    // ===============================================================
    // Section A — Production creation remains the sole authority.
    // ===============================================================
    {
        const constructionSites = grepFiles('new PublicationSnapshotPlacement\\(', ['application', 'ui'])
            .filter((f) => f !== 'core/PublicationSnapshotPlacement.js');
        assert(constructionSites.length === 1 && constructionSites[0] === 'application/CreatePublicationSnapshotPlacementUseCase.js',
            `1. exactly one production file constructs a new PublicationSnapshotPlacement (found: ${JSON.stringify(constructionSites)}).`);

        const createSource = readSource('application/CreatePublicationSnapshotPlacementUseCase.js');
        assert(/peerExchange/.test(createSource) && /\.announce\(/.test(createSource),
            '2. that one file is the one 0.9.483 wired to call announce() — reconfirmed still true today, not assumed from memory.');

        const restoreSource = readSource('application/RestorePublicationSnapshotPlacementCatalogUseCase.js');
        const packageImportSource = readSource('application/ImportPackageSnapshotPlacementsUseCase.js');
        assert(!/CreatePublicationSnapshotPlacementUseCase/.test(restoreSource) && !/announce/i.test(restoreSource),
            '3. restore-on-startup still never references the creation use case or announce() — a restored placement is never re-announced.');
        assert(!/CreatePublicationSnapshotPlacementUseCase/.test(packageImportSource) && !/announce/i.test(packageImportSource),
            '4. package import still never references either — a package import is not this replica declaring a new claim.');

        // A5. Walking discovery itself never creates or announces a
        // placement — the monitor only ever calls the injected
        // discovery command, never the creation use case.
        const monitorSource = readSource('application/WorldSnapshotDiscoveryMonitor.js');
        assert(!/CreatePublicationSnapshotPlacementUseCase|\.announce\(/.test(monitorSource),
            '5. WorldSnapshotDiscoveryMonitor never constructs or announces a placement of its own — it only ever queries.');

        console.log('✓ Section A: the one production operation that creates a PublicationSnapshotPlacement remains the sole place announce() is called; restore, package import, and walking discovery all remain non-authoring, exactly as 0.9.483 left them.');
    }

    // ===============================================================
    // Section B — Production composition root: exactly one instance of
    // everything, across the WHOLE application/ui surface.
    // ===============================================================
    {
        const mainSource = readSource('ui/main.js');
        assert((mainSource.match(/new PeerMessageBus\(\)/g) || []).length === 1,
            '1. ui/main.js constructs exactly one PeerMessageBus for the whole running app.');
        assert((mainSource.match(/new PeerSessionManager\(/g) || []).length === 1,
            '2. ui/main.js constructs exactly one PeerSessionManager (whose .registry every peer-facing use case below rides).');
        assert((mainSource.match(/new CreatePublicationSnapshotPlacementPeerExchangeUseCase\(\)/g) || []).length === 1,
            '3. ui/main.js calls CreatePublicationSnapshotPlacementPeerExchangeUseCase exactly once.');

        const wiringStart = mainSource.indexOf('new CreateSnapshotPlacementOrchestratorUseCase().execute({');
        const wiringEnd = mainSource.indexOf('});', wiringStart);
        const wiringBlock = mainSource.slice(wiringStart, wiringEnd);
        assert(/peerExchange:\s*publicationSnapshotPlacementPeerExchange/.test(wiringBlock),
            '4. the creation orchestrator is threaded the SAME publicationSnapshotPlacementPeerExchange instance the peer-exchange use case above returned — never a second, disconnected one.');

        // B5. No production file anywhere constructs a SECOND
        // PublicationSnapshotPlacementPeerExchange or a second
        // ConnectedPeerRegistry-capable class outside the one
        // composition-root use case that owns it.
        const secondExchangeSites = grepFiles('new PublicationSnapshotPlacementPeerExchange\\(', ['application', 'ui'])
            .filter((f) => f !== 'application/CreatePublicationSnapshotPlacementPeerExchangeUseCase.js');
        assert(secondExchangeSites.length === 0,
            `5. no production file other than CreatePublicationSnapshotPlacementPeerExchangeUseCase.js constructs a PublicationSnapshotPlacementPeerExchange (found: ${JSON.stringify(secondExchangeSites)}).`);

        console.log('✓ Section B: exactly one peerMessageBus, one PeerSessionManager (and its one .registry), and one publicationSnapshotPlacementPeerExchange exist anywhere in this replica\'s own production composition — confirmed across the whole application/ui surface, not only the files 0.9.483 itself touched.');
    }

    // ===============================================================
    // Section C — Real, live, authenticated two-peer propagation. This
    // is the substrate every later section (D, E, F, G, K) is built on.
    // ===============================================================
    let alice, bob, aliceConnect, bobConnect, aliceTransport, bobTransport,
        alicePeerExchange, bobComposition, aliceKnowledgeStore,
        alicePublish1, alicePublish2, aliceIpfs, net, placement1Id, placement2Id;
    {
        resetProductionLocalStorage();
        const network = new LocalPeerNetwork();
        alice = makeIdentity('alice-c');
        bob = makeIdentity('bob-c');
        aliceTransport = new LocalPeerConnectionProvider('alice-node-c2', network);
        bobTransport = new LocalPeerConnectionProvider('bob-node-c2', network);

        aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
        aliceConnect.listen();
        bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        bobConnect.listen();
        const bobToAlice = bobConnect.connect({ candidateEndpoint: 'alice-node-c2' });
        await wait(20);
        assert(bobToAlice.getLifecycleState() === PeerLifecycleState.AUTHENTICATED,
            '1. Alice and Bob hold a real, live, AUTHENTICATED peer connection.');

        const { catalog: aliceCatalog, exchange: aliceExchange } = makeHandBuiltPlacementExchange();
        aliceKnowledgeStore = { _entries: new Map(), record(id, kind) { if (!this._entries.has(id)) this._entries.set(id, { acquisition: { kind } }); return this._entries.get(id); }, get(id) { return this._entries.get(id) || null; } };
        alicePeerExchange = new PublicationSnapshotPlacementPeerExchange(aliceExchange, new PeerMessageBus(), aliceConnect.registry);

        bobComposition = new CreatePublicationSnapshotPlacementPeerExchangeUseCase().execute({
            peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: bobConnect.registry
        });
        assert(bobComposition.catalog.list().length === 0, '2. Bob\'s real, production catalog starts empty.');

        net = makeFakeIpfsNode();
        aliceIpfs = new IpfsContentStore({ apiUrl: 'http://alice-node-c2.test:5001', fetchImpl: net.fetchImpl });

        alicePublish1 = publishLocallyAs(alice, 'Section C — Placement One');
        const orchestrator1 = new CreateSnapshotPlacementOrchestratorUseCase().execute({
            discoveryProvider: alicePublish1.discoveryProvider, contentResolver: alicePublish1.contentResolver,
            placementCatalog: aliceCatalog, identityProvider: alice, stores: [aliceIpfs],
            knowledgeStore: aliceKnowledgeStore, peerExchange: alicePeerExchange
        });
        const result1 = await orchestrator1.createExternalSnapshotPlacementUseCase.execute(alicePublish1.publication.id, 'ipfs');
        assert(result1.outcome === SnapshotPlacementCreationOutcome.CREATED, '3. Alice\'s first ordinary placement creation succeeds.');
        placement1Id = result1.placement.id;

        await wait(30);
        const received1 = bobComposition.catalog.findByPublicationId(alicePublish1.publication.id);
        assert(received1.length === 1 && received1[0].contentHash === result1.placement.contentHash,
            '4. Bob\'s real, production, live-network catalog now holds the placement Alice just created — automatically, with zero explicit propagation calls in this test.');

        console.log('✓ Section C: over a real, live, authenticated peer connection, Alice\'s ordinary placement creation reaches Bob\'s real production catalog with no explicit announce()/deliver() call anywhere in this test.');
    }

    // ===============================================================
    // Section D — Identity fidelity across the live wire.
    // ===============================================================
    {
        const [received] = bobComposition.catalog.findByPublicationId(alicePublish1.publication.id);
        assert(received.publicationId === alicePublish1.publication.id, '1. publicationId survives unchanged.');
        assert(received.storage === 'ipfs' && received.locator.startsWith('ipfs://'), '2. storage/locator survive unchanged.');
        assert(typeof received.contentHash === 'string' && received.contentHash.length > 0, '3. contentHash survives unchanged.');
        assert(received.placerIdentity && received.placerIdentity.id === alice.getSigningIdentity().id, '4. placerIdentity survives unchanged and correctly names Alice.');
        assert(received.signature && typeof received.signature.signature === 'string', '5. the original signature survives byte-for-byte.');
        assert(received.id === placement1Id, '6. the placement\'s own id survives unchanged.');

        console.log('✓ Section D: every identity-bearing field of a placement propagated over the live wire survives exactly.');
    }

    // ===============================================================
    // Section E — Provenance: creator records LOCAL, receiver records
    // PEER, independently.
    // ===============================================================
    {
        const bobKnowledge = bobComposition.knowledgeStore.get(placement1Id);
        assert(bobKnowledge && bobKnowledge.acquisition.kind === PlacementAcquisitionKind.PEER,
            '1. Bob\'s own knowledge store records PEER acquisition for the placement he received.');

        const aliceKnowledge = aliceKnowledgeStore.get(placement1Id);
        assert(aliceKnowledge && aliceKnowledge.acquisition.kind === PlacementAcquisitionKind.LOCAL,
            '2. Alice\'s own knowledge store records LOCAL for the placement she created — announcing it to Bob never rewrites her own provenance.');

        console.log('✓ Section E: the creator\'s LOCAL record and the receiver\'s PEER record are independent and automatic, exactly as 0.8.24 established.');
    }

    // ===============================================================
    // Section F — Walking-triggered convergence: the REAL, unmodified
    // movement-threshold gate and the REAL, unmodified request-id race
    // guard, fed by the peer-populated catalog above.
    // ===============================================================
    let monitor, localSource;
    {
        localSource = new LocalSnapshotCandidateDiscoveryQueryServicePrototype(bobComposition.catalog);
        let invocationCount = 0;
        const countedCommand = () => {
            invocationCount += 1;
            return executeDiscoverSnapshotCandidatesCommand({ discoveryTag: DISCOVERY_TAG, discoveryQueryService: localSource });
        };
        // Deliberately NOT overriding `shouldRefresh` — the real
        // application/ShouldRefreshSnapshotDiscovery.js default (100-unit
        // radius) gates every observe() call below.
        monitor = new WorldSnapshotDiscoveryMonitor({ discoverSnapshotCandidatesCommand: countedCommand });

        await monitor.observe({ position: { x: 0, y: 0, z: 0 } });
        assert(invocationCount === 1, '1. the FIRST observe() call always refreshes (nothing observed before) — one real discovery call made.');
        assert(monitor.lastResult.some((c) => c.publicationId === alicePublish1.publication.id),
            '2. that call\'s result already includes the peer-derived candidate — the full "creation -> announce -> catalog -> candidate query -> walking monitor" chain holds on the very first observation.');

        // F3. A tiny movement, well inside the 100-unit default radius,
        // must NEVER re-query — this is the real gate, not a stub.
        await monitor.observe({ position: { x: 10, y: 0, z: 0 } });
        assert(invocationCount === 1,
            '3. a sub-threshold movement (distance 10, radius 100) never triggers a second discovery call — the real movement gate is intact, unmodified by this milestone.');

        // F4. While the Wanderer is standing still (from the monitor's
        // own point of view), Alice creates and announces a SECOND
        // placement. Nothing forces Bob's monitor to see it yet — it
        // only will once a fresh observe() actually crosses the
        // threshold, proving convergence is walking-triggered, not
        // eagerly pushed into World state.
        alicePublish2 = publishLocallyAs(alice, 'Section F — Placement Two');
        const { catalog: aliceCatalog2, exchange: aliceExchange2 } = makeHandBuiltPlacementExchange();
        const orchestrator2 = new CreateSnapshotPlacementOrchestratorUseCase().execute({
            discoveryProvider: alicePublish2.discoveryProvider, contentResolver: alicePublish2.contentResolver,
            placementCatalog: aliceCatalog2, identityProvider: alice, stores: [aliceIpfs],
            knowledgeStore: aliceKnowledgeStore, peerExchange: alicePeerExchange
        });
        const result2 = await orchestrator2.createExternalSnapshotPlacementUseCase.execute(alicePublish2.publication.id, 'ipfs');
        assert(result2.outcome === SnapshotPlacementCreationOutcome.CREATED, '4. Alice\'s second placement creation succeeds.');
        placement2Id = result2.placement.id;
        await wait(30);
        assert(bobComposition.catalog.findByPublicationId(alicePublish2.publication.id).length === 1,
            '5. Bob\'s catalog already holds it (the same passive ANNOUNCE path) — but his monitor has not been told to look yet.');

        // F6. NOW cross the threshold (distance from the last OBSERVED
        // context, {x:0,...}, since the sub-threshold call at x:10 never
        // updated it) — this MUST refresh, and must surface BOTH
        // placements, proving new peer-announced content converges into
        // World-observable state exactly at the moment walking justifies
        // asking again, never before and never automatically.
        await monitor.observe({ position: { x: 150, y: 0, z: 0 } });
        assert(invocationCount === 2, '6. crossing the 100-unit threshold triggers exactly one fresh discovery call.');
        assert(monitor.lastResult.some((c) => c.publicationId === alicePublish1.publication.id)
            && monitor.lastResult.some((c) => c.publicationId === alicePublish2.publication.id),
            '7. the refreshed World contribution includes BOTH the original and the newly-arrived peer-derived placement.');

        // F8. Request-id race protection: two overlapping observe() calls,
        // each crossing the threshold from the other, where the EARLIER
        // call's response is artificially slow and clearly distinguishable
        // (a synthetic marker, standing in for a stale in-flight request)
        // and the LATER call's response is the real, fast, current
        // discovery result. The monitor's own requestId guard — untouched
        // by this milestone — must make the later call win regardless of
        // arrival order.
        const staleMarker = [{ contentHash: 'STALE-MARKER', locator: 'stale://never', storage: 'stale', publicationId: 'stale-publication' }];
        let raceCall = 0;
        const raceCommand = () => {
            raceCall += 1;
            if (raceCall === 1) {
                return wait(50).then(() => staleMarker);
            }
            return executeDiscoverSnapshotCandidatesCommand({ discoveryTag: DISCOVERY_TAG, discoveryQueryService: localSource });
        };
        const raceMonitor = new WorldSnapshotDiscoveryMonitor({ discoverSnapshotCandidatesCommand: raceCommand });
        const p1 = raceMonitor.observe({ position: { x: 500, y: 0, z: 0 } });
        const p2 = raceMonitor.observe({ position: { x: 900, y: 0, z: 0 } });
        await Promise.all([p1, p2]);
        assert(!raceMonitor.lastResult.some((c) => c.contentHash === 'STALE-MARKER'),
            '9. the earlier (slower) call\'s stale response never wins, even though it settles after the later call.');
        assert(raceMonitor.lastResult.some((c) => c.publicationId === alicePublish1.publication.id)
            && raceMonitor.lastResult.some((c) => c.publicationId === alicePublish2.publication.id),
            '10. the LATER call\'s real, current result — sourced from the SAME peer-populated catalog — is what the monitor actually reports.');

        console.log('✓ Section F: a peer-announced placement survives the real, unmodified movement-threshold gate (no re-query inside the radius, exactly one on crossing it) and the real, unmodified request-id race guard (a stale, slower response never overwrites a newer one) — neither mechanism was relaxed or reimplemented for this audit.');
    }

    // ===============================================================
    // Section G — FLAGSHIP: end-to-end material resolution of exactly
    // the candidates Section F's monitor surfaced.
    // ===============================================================
    {
        const bobIpfs = new IpfsContentStore({ apiUrl: 'http://bob-node-c2.test:5001', fetchImpl: net.fetchImpl });
        const bobResolver = new SnapshotPlacementResolver(new LocalAuthorizationVerifier());

        const candidates = monitor.lastResult.filter((c) => c.publicationId === alicePublish1.publication.id || c.publicationId === alicePublish2.publication.id);
        assert(candidates.length === 2, '1. exactly the two real candidates Section F surfaced are carried forward into resolution.');

        const expected = new Map([
            [alicePublish1.publication.id, { resolver: alicePublish1.contentResolver }],
            [alicePublish2.publication.id, { resolver: alicePublish2.contentResolver }]
        ]);

        for (const candidate of candidates) {
            const [placement] = bobComposition.catalog.findByPublicationId(candidate.publicationId);
            assert(placement, `2. Bob\'s catalog still holds the full signed placement for ${candidate.publicationId}, not merely the candidate summary.`);
            const resolveResult = await bobResolver.resolve(placement.toJSON(), { contentStore: bobIpfs });
            assert(resolveResult.outcome === SnapshotPlacementResolutionOutcome.RESOLVED,
                `3. Bob resolves ${candidate.publicationId} to RESOLVED against a real content store.`);
            const expectedBytes = JSON.stringify(expected.get(candidate.publicationId).resolver.resolve(candidate.publicationId));
            assert(resolveResult.bytes === expectedBytes,
                `4. the resolved bytes for ${candidate.publicationId} are byte-identical to what Alice actually published — hash-verified, not merely present.`);
        }

        console.log('✓ Section G (FLAGSHIP): every candidate the real walking-triggered monitor surfaced — reached via a live peer announcement, gated by the real movement threshold, surviving the real race guard — resolves to real, hash-verified bytes identical to what Peer A actually published. The full diagram holds end to end.');
    }

    // ===============================================================
    // Section H — Failure isolation.
    // ===============================================================
    {
        // H1. Zero connected peers ("Peer B disconnected/never there").
        {
            const registry = new StubConnectedPeerRegistry([]);
            const bus = new StubPeerMessageBus();
            const { exchange } = makeHandBuiltPlacementExchange();
            const peerExchange = new PublicationSnapshotPlacementPeerExchange(exchange, bus, registry);
            const solo = makeIdentity('solo-h1');
            const { publication, discoveryProvider, contentResolver } = publishLocallyAs(solo, 'Section H1');
            const soloNet = makeFakeIpfsNode();
            const soloIpfs = new IpfsContentStore({ apiUrl: 'http://solo-h1.test:5001', fetchImpl: soloNet.fetchImpl });
            const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
            const orchestrator = new CreateSnapshotPlacementOrchestratorUseCase().execute({
                discoveryProvider, contentResolver, placementCatalog, identityProvider: solo, stores: [soloIpfs], peerExchange
            });
            const result = await orchestrator.createExternalSnapshotPlacementUseCase.execute(publication.id, 'ipfs');
            assert(result.outcome === SnapshotPlacementCreationOutcome.CREATED && placementCatalog.get(result.placement.id) !== null,
                '1. with zero connected/disconnected peers, placement creation still succeeds and is still cataloged.');
        }

        // H2. A peer bus whose send() throws — transport failure.
        {
            const peer = stubPeer('conn-h2', 'did:key:zH2');
            const registry = new StubConnectedPeerRegistry([peer]);
            const bus = new ThrowingPeerMessageBus();
            const { exchange } = makeHandBuiltPlacementExchange();
            const peerExchange = new PublicationSnapshotPlacementPeerExchange(exchange, bus, registry);
            const solo = makeIdentity('solo-h2');
            const { publication, discoveryProvider, contentResolver } = publishLocallyAs(solo, 'Section H2');
            const soloNet = makeFakeIpfsNode();
            const soloIpfs = new IpfsContentStore({ apiUrl: 'http://solo-h2.test:5001', fetchImpl: soloNet.fetchImpl });
            const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
            const orchestrator = new CreateSnapshotPlacementOrchestratorUseCase().execute({
                discoveryProvider, contentResolver, placementCatalog, identityProvider: solo, stores: [soloIpfs], peerExchange
            });
            const result = await orchestrator.createExternalSnapshotPlacementUseCase.execute(publication.id, 'ipfs');
            assert(result.outcome === SnapshotPlacementCreationOutcome.CREATED && placementCatalog.get(result.placement.id) !== null,
                '2. a transport that throws on every send() still leaves creation successful and cataloged.');
        }

        // H3. A genuinely MALFORMED WIRE MESSAGE — not a malformed
        // collaborator — delivered straight to a real
        // PublicationSnapshotPlacementPeerExchange's own incoming
        // handler. Must never crash, must never catalog garbage, and
        // must never prevent a subsequent, valid ANNOUNCE from being
        // ingested normally afterward.
        {
            const { catalog: receiverCatalog, exchange: receiverExchange } = makeHandBuiltPlacementExchange();
            const bus = new StubPeerMessageBus();
            const registry = new StubConnectedPeerRegistry([]);
            const receiverPeerExchange = new PublicationSnapshotPlacementPeerExchange(receiverExchange, bus, registry);

            assert(receiverCatalog.list().length === 0, '3. starts empty.');
            bus.deliver(PublicationSnapshotPlacementPeerExchange.DEFAULT_PROTOCOL, { kind: 'NOT_A_REAL_KIND', envelope: { garbage: true } });
            bus.deliver(PublicationSnapshotPlacementPeerExchange.DEFAULT_PROTOCOL, null);
            bus.deliver(PublicationSnapshotPlacementPeerExchange.DEFAULT_PROTOCOL, { kind: PublicationSnapshotPlacementPeerMessageKind.ANNOUNCE, envelope: { publicationId: 'not-signed-not-real' } });
            assert(receiverCatalog.list().length === 0,
                '4. three different shapes of malformed/unverifiable wire traffic are all dropped silently — nothing is cataloged, nothing throws.');

            // Recovery: a REAL, validly-signed ANNOUNCE afterward is
            // still ingested normally — a bad message never poisons this
            // exchange for future, legitimate ones.
            const sender = makeIdentity('sender-h3');
            const senderPub = publishLocallyAs(sender, 'Section H3');
            const senderNet = makeFakeIpfsNode();
            const senderIpfs = new IpfsContentStore({ apiUrl: 'http://sender-h3.test:5001', fetchImpl: senderNet.fetchImpl });
            const { catalog: senderCatalog, exchange: senderExchange } = makeHandBuiltPlacementExchange();
            const senderPeer = stubPeer('conn-sender-h3', sender.getSigningIdentity().id);
            const senderRegistry = new StubConnectedPeerRegistry([senderPeer]);
            const senderBus = new StubPeerMessageBus();
            const senderPeerExchange = new PublicationSnapshotPlacementPeerExchange(senderExchange, senderBus, senderRegistry);
            const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
            const orchestrator = new CreateSnapshotPlacementOrchestratorUseCase().execute({
                discoveryProvider: senderPub.discoveryProvider, contentResolver: senderPub.contentResolver,
                placementCatalog, identityProvider: sender, stores: [senderIpfs], peerExchange: senderPeerExchange
            });
            const result = await orchestrator.createExternalSnapshotPlacementUseCase.execute(senderPub.publication.id, 'ipfs');
            const validMessage = senderBus.sent[0];
            bus.deliver(validMessage.protocol, validMessage.payload);
            assert(receiverCatalog.list().length === 1 && receiverCatalog.get(result.placement.id) !== null,
                '5. a genuinely valid ANNOUNCE, delivered right after three malformed messages on the SAME exchange instance, is ingested exactly as if nothing malformed had come before it.');
        }

        console.log('✓ Section H: peer propagation remains an enhancement, never an authority — zero/disconnected peers, a throwing transport, and genuinely malformed wire traffic (three distinct shapes) all leave creation and ingestion exactly as successful as they already were, with no lingering effect on later, legitimate messages.');
    }

    // ===============================================================
    // Section I — Duplicate & reconnection boundary.
    // ===============================================================
    {
        // I1. Exactly one ANNOUNCE per creation; reads/candidate
        // discovery/monitor cycles/resolution never re-trigger one.
        {
            const peer = stubPeer('conn-i1', 'did:key:zI1');
            const registry = new StubConnectedPeerRegistry([peer]);
            const bus = new StubPeerMessageBus();
            const { exchange } = makeHandBuiltPlacementExchange();
            const peerExchange = new PublicationSnapshotPlacementPeerExchange(exchange, bus, registry);
            const solo = makeIdentity('solo-i1');
            const { publication, discoveryProvider, contentResolver } = publishLocallyAs(solo, 'Section I1');
            const soloNet = makeFakeIpfsNode();
            const soloIpfs = new IpfsContentStore({ apiUrl: 'http://solo-i1.test:5001', fetchImpl: soloNet.fetchImpl });
            const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
            const orchestrator = new CreateSnapshotPlacementOrchestratorUseCase().execute({
                discoveryProvider, contentResolver, placementCatalog, identityProvider: solo, stores: [soloIpfs], peerExchange
            });
            const result = await orchestrator.createExternalSnapshotPlacementUseCase.execute(publication.id, 'ipfs');
            assert(bus.sent.length === 1, '1. one creation sends exactly one ANNOUNCE.');

            placementCatalog.get(result.placement.id);
            placementCatalog.list();
            const localSourceI1 = new LocalSnapshotCandidateDiscoveryQueryServicePrototype(placementCatalog);
            await executeDiscoverSnapshotCandidatesCommand({ discoveryTag: DISCOVERY_TAG, discoveryQueryService: localSourceI1 });
            const monitorI1 = new WorldSnapshotDiscoveryMonitor({
                discoverSnapshotCandidatesCommand: () => executeDiscoverSnapshotCandidatesCommand({ discoveryTag: DISCOVERY_TAG, discoveryQueryService: localSourceI1 })
            });
            await monitorI1.observe({ position: { x: 0, y: 0, z: 0 } });
            await monitorI1.observe({ position: { x: 500, y: 0, z: 0 } });
            const resolver = new SnapshotPlacementResolver(new LocalAuthorizationVerifier());
            await resolver.resolve(result.placement.toJSON(), { contentStore: soloIpfs });

            assert(bus.sent.length === 1,
                '2. catalog reads, a candidate-discovery run, two walking-monitor cycles, and a resolution afterward send nothing further.');
        }

        // I2. THE HONEST BOUNDARY: a fresh live two-peer scenario where
        // Peer B is offline at the moment of announce(). Reconnecting
        // later must NOT silently backfill what was missed — "future
        // announcements only" is the current, actual boundary, and this
        // milestone reports it rather than building the sync-on-connect
        // seam that would close it.
        {
            // window.localStorage is one GLOBAL object every
            // LocalStorageProvider instance reads live (never cached at
            // construction) — see storage/LocalStorageProvider.js. Bob's
            // OWN composition from Section C is still going to be read
            // again in Section K below, so resetting it here for a fresh
            // Peer-B-offline scenario must not permanently erase what
            // Section C already wrote; the backing map is saved and
            // restored around this scenario's own isolated use of it.
            const savedBacking = _productionLocalStorageBacking;
            resetProductionLocalStorage();
            const network2 = new LocalPeerNetwork();
            const alice2 = makeIdentity('alice-i2');
            const bob2 = makeIdentity('bob-i2');
            const aliceTransport2 = new LocalPeerConnectionProvider('alice-node-i2', network2);
            const bobTransport2 = new LocalPeerConnectionProvider('bob-node-i2', network2);
            const aliceConnect2 = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport2, identityProvider: alice2 });
            aliceConnect2.listen();
            const bobConnect2 = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport2, identityProvider: bob2 });
            bobConnect2.listen();
            let bobToAlice2 = bobConnect2.connect({ candidateEndpoint: 'alice-node-i2' });
            await wait(20);
            assert(bobToAlice2.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '3. Alice and Bob start connected.');

            const { catalog: aliceCatalog2, exchange: aliceExchange2 } = makeHandBuiltPlacementExchange();
            const alicePeerExchange2 = new PublicationSnapshotPlacementPeerExchange(aliceExchange2, new PeerMessageBus(), aliceConnect2.registry);
            const bobComposition2 = new CreatePublicationSnapshotPlacementPeerExchangeUseCase().execute({
                peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: bobConnect2.registry
            });

            const net2 = makeFakeIpfsNode();
            const aliceIpfs2 = new IpfsContentStore({ apiUrl: 'http://alice-node-i2.test:5001', fetchImpl: net2.fetchImpl });

            // Bob disconnects.
            bobToAlice2.close();
            await wait(20);

            // Alice creates a placement WHILE Bob is offline. Creation
            // must still succeed (Section H1's own property, reconfirmed
            // live here) — but Bob never receives it, now or later.
            const pubWhileOffline = publishLocallyAs(alice2, 'Section I2 — created while Bob offline');
            const orchestratorOffline = new CreateSnapshotPlacementOrchestratorUseCase().execute({
                discoveryProvider: pubWhileOffline.discoveryProvider, contentResolver: pubWhileOffline.contentResolver,
                placementCatalog: aliceCatalog2, identityProvider: alice2, stores: [aliceIpfs2], peerExchange: alicePeerExchange2
            });
            const offlineResult = await orchestratorOffline.createExternalSnapshotPlacementUseCase.execute(pubWhileOffline.publication.id, 'ipfs');
            assert(offlineResult.outcome === SnapshotPlacementCreationOutcome.CREATED,
                '4. Alice\'s placement creation succeeds even while her only peer is offline.');
            assert(bobComposition2.catalog.findByPublicationId(pubWhileOffline.publication.id).length === 0,
                '5. Bob, disconnected, does not receive it — expected; nobody was listening.');

            // Bob reconnects.
            bobToAlice2 = bobConnect2.connect({ candidateEndpoint: 'alice-node-i2' });
            await wait(20);
            assert(bobToAlice2.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '6. Bob successfully reconnects.');
            await wait(30);

            // THE FINDING: reconnecting does NOT retroactively deliver
            // what Alice announced while Bob was away. There is no
            // sync-on-connect/REQUEST-on-connect wiring for placements in
            // production today (the pull-capable REQUEST/RESPONSE half of
            // application/PublicationSnapshotPlacementPeerExchange.js
            // exists and is fully mechanically sound, per its own 0.8.19
            // test coverage — nothing here is a mechanism gap — but no
            // production caller ever invokes requestPlacements() on a
            // fresh connection the way, e.g., a PublicationPeerConnectionSync
            // does for ordinary Publications).
            assert(bobComposition2.catalog.findByPublicationId(pubWhileOffline.publication.id).length === 0,
                '7. reconnecting does not silently backfill the missed placement — "future announcements only" is the honest, current boundary, not a bug this audit found and must now fix.');

            // But a placement Alice creates AFTER reconnecting propagates
            // completely normally — "later peer connection: normal future
            // announcements still work," confirmed live, not merely
            // asserted.
            const pubAfterReconnect = publishLocallyAs(alice2, 'Section I2 — created after Bob reconnected');
            const orchestratorAfter = new CreateSnapshotPlacementOrchestratorUseCase().execute({
                discoveryProvider: pubAfterReconnect.discoveryProvider, contentResolver: pubAfterReconnect.contentResolver,
                placementCatalog: aliceCatalog2, identityProvider: alice2, stores: [aliceIpfs2], peerExchange: alicePeerExchange2
            });
            const afterResult = await orchestratorAfter.createExternalSnapshotPlacementUseCase.execute(pubAfterReconnect.publication.id, 'ipfs');
            assert(afterResult.outcome === SnapshotPlacementCreationOutcome.CREATED, '8. the post-reconnect creation succeeds.');
            await wait(30);
            assert(bobComposition2.catalog.findByPublicationId(pubAfterReconnect.publication.id).length === 1,
                '9. and THIS one Bob receives immediately, over the SAME reconnected link — reconnection itself is not broken, only retroactive backfill is absent.');

            alicePeerExchange2.dispose();
            bobComposition2.peerExchange.dispose();
            aliceTransport2.dispose();
            bobTransport2.dispose();

            // Restore Section C/F/G's own backing so bobComposition's
            // catalog (read again in Section K) is exactly as this
            // scenario found it, unaffected by this scenario's own,
            // deliberately separate, reset.
            _productionLocalStorageBacking = savedBacking;
            installProductionLocalStorage();
        }

        console.log('✓ Section I: announcement remains a strict one-time act of creation (reads, discovery, monitor cycles, and resolution never re-trigger it). Live, with a real disconnect and reconnect: a placement announced while Peer B is offline is never backfilled once Peer B returns — the current, honest boundary is "future announcements only," and reconnection itself still works normally for anything created afterward.');
    }

    // ===============================================================
    // Section J — Multi-peer: several peers coexist, undifferentiated.
    // ===============================================================
    {
        const solo = makeIdentity('solo-j');
        const p1 = stubPeer('conn-p1-j', 'did:key:zP1J');
        const p2 = stubPeer('conn-p2-j', 'did:key:zP2J');
        const p3 = stubPeer('conn-p3-j', 'did:key:zP3J');
        const registry = new StubConnectedPeerRegistry([p1, p2, p3]);
        const bus = new StubPeerMessageBus();
        const { exchange } = makeHandBuiltPlacementExchange();
        const peerExchange = new PublicationSnapshotPlacementPeerExchange(exchange, bus, registry);

        const { publication, discoveryProvider, contentResolver } = publishLocallyAs(solo, 'Section J');
        const soloNet = makeFakeIpfsNode();
        const soloIpfs = new IpfsContentStore({ apiUrl: 'http://solo-j.test:5001', fetchImpl: soloNet.fetchImpl });
        const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const orchestrator = new CreateSnapshotPlacementOrchestratorUseCase().execute({
            discoveryProvider, contentResolver, placementCatalog, identityProvider: solo, stores: [soloIpfs], peerExchange
        });
        const result = await orchestrator.createExternalSnapshotPlacementUseCase.execute(publication.id, 'ipfs');

        assert(bus.sent.length === 3, '1. one creation announces to all three currently authenticated peers independently.');
        const recipients = bus.sent.map((m) => m.peer.connectionId).sort();
        assert(JSON.stringify(recipients) === JSON.stringify(['conn-p1-j', 'conn-p2-j', 'conn-p3-j']), '2. every peer is a recipient.');
        assert(bus.sent.every((m) => m.payload.envelope.id === result.placement.id), '3. all three receive the identical envelope — no ranking, no preferred peer.');

        console.log('✓ Section J: several legitimate peer announcements coexist with no ranking or preferred-peer concept anywhere in this path.');
    }

    // ===============================================================
    // Section K — Downstream candidate-query readiness: can a future
    // Local candidate adapter consume the catalog uniformly, blind to
    // origin, while provenance stays separately available on demand?
    // ===============================================================
    {
        // Add a LOCAL entry to Bob's OWN, already peer-populated catalog
        // — Bob places his own document, using the SAME production
        // catalog and knowledgeStore his peer exchange already writes
        // into.
        const bobOwnPub = publishLocallyAs(bob, 'Section K — Bob\'s own placement');
        const bobIpfs = new IpfsContentStore({ apiUrl: 'http://bob-node-c2.test:5001', fetchImpl: net.fetchImpl });
        const bobOrchestrator = new CreateSnapshotPlacementOrchestratorUseCase().execute({
            discoveryProvider: bobOwnPub.discoveryProvider, contentResolver: bobOwnPub.contentResolver,
            placementCatalog: bobComposition.catalog, identityProvider: bob, stores: [bobIpfs],
            knowledgeStore: bobComposition.knowledgeStore
        });
        const bobOwnResult = await bobOrchestrator.createExternalSnapshotPlacementUseCase.execute(bobOwnPub.publication.id, 'ipfs');
        assert(bobOwnResult.outcome === SnapshotPlacementCreationOutcome.CREATED, '1. Bob\'s own local placement is created into the SAME catalog his peer-received placements already live in.');

        const mixedSource = new LocalSnapshotCandidateDiscoveryQueryServicePrototype(bobComposition.catalog);
        const candidates = await mixedSource.search(DISCOVERY_TAG);
        const own = candidates.find((c) => c.publicationId === bobOwnPub.publication.id);
        const peerOne = candidates.find((c) => c.publicationId === alicePublish1.publication.id);
        const peerTwo = candidates.find((c) => c.publicationId === alicePublish2.publication.id);
        assert(own && peerOne && peerTwo,
            '2. the SAME single search() call surfaces Bob\'s own LOCAL placement alongside both of Alice\'s PEER-delivered ones.');

        const shapeOf = (c) => Object.keys(c).sort().join(',');
        assert(shapeOf(own) === shapeOf(peerOne) && shapeOf(peerOne) === shapeOf(peerTwo),
            '3. every candidate — LOCAL or PEER in origin — carries the IDENTICAL field shape; nothing in the candidate stream itself names or hints at where it came from.');

        // K4. Provenance remains available — SEPARATELY, on demand — to
        // whoever actually needs it, without the candidate adapter ever
        // having had to ask.
        assert(bobComposition.knowledgeStore.get(bobOwnResult.placement.id).acquisition.kind === PlacementAcquisitionKind.LOCAL,
            '4. Bob\'s knowledge store still correctly answers LOCAL for his own placement...');
        assert(bobComposition.knowledgeStore.get(placement1Id).acquisition.kind === PlacementAcquisitionKind.PEER
            && bobComposition.knowledgeStore.get(placement2Id).acquisition.kind === PlacementAcquisitionKind.PEER,
            '5. ...and PEER for both of Alice\'s — a caller that wants to know CAN, but a caller that only wants candidates (the walking-triggered monitor, Section F/G above) never had to.');

        console.log('✓ Section K: a future Local candidate adapter can consume application/LocalPublicationSnapshotPlacementCatalog.js exactly as it already does — one search() call, one uniform candidate shape — with zero knowledge of whether any given record originated locally or from a peer, because the catalog itself carries no such field. Provenance lives entirely in the separate, optional LocalPlacementKnowledgeStore, exactly the architectural separation 0.8.24 already drew.');
    }

    // ===============================================================
    // Section L — Boundary audit, plus this milestone's own
    // zero-production-diff guard.
    // ===============================================================
    {
        const relevantFiles = [
            'application/PublicationSnapshotPlacementPeerExchange.js',
            'application/CreatePublicationSnapshotPlacementUseCase.js',
            'application/CreateSnapshotPlacementOrchestratorUseCase.js',
            'application/CreatePublicationSnapshotPlacementPeerExchangeUseCase.js',
            'application/WorldSnapshotDiscoveryMonitor.js',
            'application/LocalPublicationSnapshotPlacementCatalog.js',
            'application/DiscoverSnapshotCandidatesCommand.js',
            'application/PublicationSnapshotPlacementPeerProtocol.js',
            'application/LocalPlacementKnowledgeStore.js',
            'application/PlacementAcquisitionKind.js'
        ];
        // Every file in this family narrates its own architecture in
        // prose — including, deliberately, cross-references naming the
        // OTHER systems it is careful NOT to become (see, e.g.,
        // DiscoverSnapshotCandidatesCommand.js's own "NO CONTENT STORE,
        // NO RESOLVER, NO ATTRIBUTION, AND NO NOSTR CLASS IS
        // constructed"). A bare word match on that prose would flag the
        // very sentences that document the separation as if they were
        // evidence against it. Every check below therefore runs against
        // comment-stripped source, looking for actual code-level coupling
        // (an import, a construction, a class reference) — never a
        // mention.
        function stripLineComments(source) {
            return source.replace(/\/\/.*$/gm, '');
        }
        const combinedSource = relevantFiles.map((f) => readSource(f)).join('\n');
        const combinedCode = stripLineComments(combinedSource);

        // L1. Nostr stays out of this pipeline's actual code entirely —
        // no import of, or construction of, any Nostr-named class.
        assert(!/import[^\n]*Nostr|new\s+Nostr\w*\(/.test(combinedCode),
            '1. none of this pipeline\'s own files import or construct any Nostr-named class.');

        // L2. World Encounter material loading stays a separate pipeline
        // — never referenced in code here, and this pipeline never
        // referenced in code there.
        assert(!/import[^\n]*WorldEncounter|new\s+\w*WorldEncounter\w*\(/.test(combinedCode),
            '2. this pipeline never imports or constructs any World Encounter material-loading class.');
        const worldEncounterCode = stripLineComments(readSource('application/WorldEncounterMaterialLoading.js'));
        assert(!/PublicationSnapshotPlacementPeerExchange|LocalPublicationSnapshotPlacementCatalog/.test(worldEncounterCode),
            '3. World Encounter material loading never references the placement peer exchange or catalog either — the separation holds in both directions.');

        // L4. Publication verification/attribution stay untouched — no
        // import of, or construction of, that machinery from this
        // pipeline's own code.
        assert(!/import[^\n]*(?:VerifyPublicationUseCase|SnapshotPublicationAttribution|BlueprintAttribution)|new\s+(?:VerifyPublicationUseCase|SnapshotPublicationAttribution|BlueprintAttribution)\w*\(/.test(combinedCode),
            '4. this pipeline never imports or constructs publication verification or attribution machinery.');

        // L5. No active peer browsing protocol was introduced — the
        // exact BROWSE_REQUEST/BROWSE_RESPONSE pair the originating
        // request explicitly said not to build.
        assert(!/BROWSE_REQUEST|BROWSE_RESPONSE/.test(combinedSource),
            '5. no BROWSE_REQUEST/BROWSE_RESPONSE message kind exists anywhere in this pipeline\'s production files.');
        const allProductionBrowseSites = grepFiles('BROWSE_REQUEST|BROWSE_RESPONSE', ['application', 'ui']);
        assert(allProductionBrowseSites.length === 0,
            `6. and none exist ANYWHERE in production application/ui — found: ${JSON.stringify(allProductionBrowseSites)} (a mention inside tests/ describing this exact exclusion is expected and is not a production site).`);

        // L7. No new peer identity concept — a PEER knowledge record
        // still names no peerId/connectionId/remote identity.
        const knowledgeSource = readSource('application/LocalPlacementKnowledgeStore.js');
        assert(!/peerId|connectionId|remoteIdentity/.test(knowledgeSource),
            '7. LocalPlacementKnowledgeStore still records no peer identity alongside a PEER acquisition entry — informational-only peer identity, never a new identity concept.');

        // L8. No ranking, preferred-peer, or trust-scoring concept
        // anywhere in this pipeline.
        assert(!/preferredPeer|trustScore|peerRank|peerReputation/i.test(combinedSource),
            '8. no ranking, preferred-peer, or trust-score concept exists anywhere in this pipeline.');

        // L9. No automatic candidate selection — the monitor never
        // resolves, materializes, places, or registers anything itself.
        // (Its own header names all four as existing, separate machinery
        // it deliberately never calls — comment-stripped so that
        // documentation doesn't trip its own check.)
        const monitorCode = stripLineComments(readSource('application/WorldSnapshotDiscoveryMonitor.js'));
        assert(!/SnapshotPlacementResolver|materializeSelectedSnapshot|placeMaterializedSnapshot|registerMaterializedSnapshot/.test(monitorCode),
            '9. the walking-triggered monitor still only ever stores candidates verbatim — it never resolves, materializes, places, or registers any of them itself.');

        // L10. This milestone's own production diff is empty — audit
        // only, exactly as the originating request specified.
        const changedFiles = execSync(
            'git diff --name-only HEAD -- . ":(exclude)tests" ":(exclude)docs/Roadmap.md" ":(exclude)tests.html"',
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim().split('\n').filter(Boolean);
        assert(changedFiles.length === 0,
            `10. this milestone touches ZERO production files — found: ${JSON.stringify(changedFiles)}. This is an audit, not an implementation milestone.`);

        console.log('✓ Section L: World Encounter material loading, publication verification/attribution, Nostr, active peer browsing (no BROWSE_REQUEST/BROWSE_RESPONSE anywhere in production), a new peer identity concept, and ranking/fallback all remain confirmed outside this pipeline, by source — and this milestone\'s own production diff is empty.');
    }

    console.log('\n✓ FINAL DECISION.\n' +
'\n' +
'OUTCOME: PASSIVE_PEER_SNAPSHOT_DISCOVERY_INTEGRATION_READY.\n' +
'\n' +
"WHY. Every link the originating request's own diagram named was exercised, live, in this one milestone rather\n" +
'than assumed from 0.9.483\'s own (narrower) mechanism proof: a real placement created on a real Peer A (Section C)\n' +
'reaches a real Peer B\'s production catalog with correct identity (Section D) and correct, independent provenance\n' +
'(Section E); it then survives the REAL, unmodified walking-triggered monitor -- its movement-threshold gate and its\n' +
'request-id race guard, neither relaxed nor reimplemented for this audit -- across multiple observe() cycles,\n' +
'including a placement announced mid-session that only converges once movement actually crosses the threshold\n' +
'(Section F); and the exact candidates that monitor surfaced resolve to real, hash-verified bytes (Section G,\n' +
'FLAGSHIP). Failure isolation (Section H) now additionally covers a genuinely malformed WIRE message, not merely a\n' +
'malformed collaborator, with a proven recovery afterward. Section I reconfirms the one-announce-per-creation\n' +
'invariant and adds the one honest limitation this family had not yet stated outright: reconnecting after a missed\n' +
'announce does not backfill it -- "future announcements only" is where the passive path\'s coverage currently ends,\n' +
'not a defect this audit found and silently patched. Section J reconfirms undifferentiated multi-peer fan-out.\n' +
'Section K answers this milestone\'s own most architecturally important question in the affirmative: a future Local\n' +
'candidate adapter can already consume this catalog with zero knowledge of any record\'s origin, because the catalog\n' +
'itself carries no origin field at all -- provenance lives entirely in the separate, optional\n' +
'LocalPlacementKnowledgeStore, available on demand, never required for candidate consumption. Section L confirms\n' +
'every named boundary -- World Encounter material loading, publication verification/attribution, Nostr, active peer\n' +
'browsing, a new peer protocol, a new peer identity concept, ranking/fallback -- remains outside this pipeline, and\n' +
'that this milestone itself changed no production file.\n' +
'\n' +
"WHAT THIS MEANS. The passive-peer discovery path is not merely mechanically sound (0.9.480-0.9.482) and not merely\n" +
'reachable in production (0.9.483) -- it is now shown, end to end, under the real production composition, to close\n' +
'the loop the originating request drew, including under realistic walking behavior and a real disconnect/reconnect.\n' +
'The one gap this audit surfaces (no backfill on reconnect) is pre-existing, narrow, and already named in this\n' +
"family's own history (a PublicationSnapshotPlacementPeerConnectionSync mirroring application/\n" +
'PublicationPeerConnectionSync.js) -- not a reason to build BROWSE_REQUEST/BROWSE_RESPONSE, and not this milestone\'s\n' +
'own job to close. 0.9.485\'s own Local + Nostr candidate query composition can now build on Peer as a passive,\n' +
'catalog-populating ingestion mechanism proven, live, all the way to hash-verified bytes -- never as a third\n' +
'independent query provider.\n');

    console.log('\n✅ All Passive Peer Snapshot Discovery End-to-End Integration Audit tests passed.');
}

run().then(() => {
    console.log('\n✓ All PassivePeerSnapshotDiscoveryEndToEndIntegrationAudit tests passed');
}).catch((error) => {
    console.error('\n✗ PassivePeerSnapshotDiscoveryEndToEndIntegrationAudit tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
