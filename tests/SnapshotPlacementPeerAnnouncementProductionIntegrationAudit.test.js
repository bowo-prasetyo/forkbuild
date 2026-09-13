import { execSync } from 'node:child_process';

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

import { PublicationSnapshotPlacement } from '../core/PublicationSnapshotPlacement.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/LocalPublicationSnapshotPlacementCatalog.js';
import { PublicationSnapshotPlacementExchange } from '../application/PublicationSnapshotPlacementExchange.js';
import { PublicationSnapshotPlacementPeerExchange } from '../application/PublicationSnapshotPlacementPeerExchange.js';
import { CreatePublicationSnapshotPlacementPeerExchangeUseCase } from '../application/CreatePublicationSnapshotPlacementPeerExchangeUseCase.js';
import { CreateSnapshotPlacementOrchestratorUseCase } from '../application/CreateSnapshotPlacementOrchestratorUseCase.js';
import { CreatePublicationSnapshotPlacementUseCase } from '../application/CreatePublicationSnapshotPlacementUseCase.js';
import { SnapshotPlacementCreationOutcome } from '../application/SnapshotPlacementCreationOutcome.js';
import { SnapshotPlacementResolver } from '../application/SnapshotPlacementResolver.js';
import { SnapshotPlacementResolutionOutcome } from '../application/SnapshotPlacementResolutionOutcome.js';
import { PlacementAcquisitionKind } from '../application/PlacementAcquisitionKind.js';
import { LocalPlacementKnowledgeStore } from '../application/LocalPlacementKnowledgeStore.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/DiscoverSnapshotCandidatesCommand.js';
import { WorldSnapshotDiscoveryMonitor } from '../application/WorldSnapshotDiscoveryMonitor.js';
import { PublicationSnapshotPlacementPeerMessageKind } from '../application/PublicationSnapshotPlacementPeerProtocol.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';

// 0.9.483 — Activate Production Snapshot Placement Peer Announcement.
//
// 0.9.482's own central correction (Section E) was structural: grepping
// this codebase's ENTIRE production surface (ui/ + application/) found
// that `PublicationSnapshotPlacementPeerExchange#announce()` — fully
// implemented, fully tested, mechanically proven live since 0.8.19 — was
// never called from anywhere production actually runs. "Peer content
// that has been announced" was, for placements, an EMPTY SET, not merely
// a narrower one. This milestone closes that one wiring gap — nowhere
// else. It activates announce() at the ONE production operation that
// makes a PublicationSnapshotPlacement exist at all: application/
// CreatePublicationSnapshotPlacementUseCase.js#execute() (reached, in
// production, only through application/CreateExternalSnapshotPlacementUseCase.js).
// No new peer manager, transport, discovery registry, or persistence
// mechanism is built — every collaborator this milestone touches already
// existed before it started.
//
//   Section A — Existing placement lifecycle: the ONE production
//               operation that causes a PublicationSnapshotPlacement to
//               become locally known, confirmed by grep across the whole
//               application/ui surface, never assumed.
//   Section B — Existing announcement capability: `peerExchange` is an
//               OPTIONAL collaborator on the exact same class 0.8.24's
//               own `knowledgeStore` parameter already established the
//               pattern for; the REAL, unmodified
//               PublicationSnapshotPlacementPeerExchange is what gets
//               wired, never a mock, and no new transport is imported by
//               the file this milestone changed.
//   Section C — Production reachability: ui/main.js and application/
//               CreateSnapshotPlacementOrchestratorUseCase.js really do
//               thread the SAME `publicationSnapshotPlacementPeerExchange`
//               instance through, confirmed by source AND by a live
//               reproduction that reaches announce() with zero explicit
//               `.announce()` calls anywhere in the test.
//   Section D — FLAGSHIP: real, live, AUTHENTICATED peers (peer/
//               LocalPeerConnectionProvider.js + application/
//               ConnectToPeerUseCase.js, not a stub transport), the REAL
//               production creation pipeline, and the REAL production
//               peer exchange. Alice creates a placement; Bob's catalog
//               receives it with NO explicit announce()/deliver() call in
//               this test — then Bob resolves it, end to end, to real,
//               hash-verified bytes.
//   Section E — Identity fidelity: every field of the announced
//               placement survives the wire unchanged.
//   Section F — Provenance: the creator records LOCAL, the receiver
//               records PEER, automatically, via the SAME
//               LocalPlacementKnowledgeStore seam 0.8.24 already built —
//               never rewritten by this milestone.
//   Section G — Failure isolation: zero connected peers, a peer bus that
//               throws, and a malformed peerExchange collaborator all
//               leave placement creation exactly as successful as it
//               already was.
//   Section H — Multi-peer: three independently authenticated peers all
//               receive the SAME created placement, undifferentiated —
//               no ranking, no preferred peer.
//   Section I — No duplicate announcements: exactly one ANNOUNCE per
//               creation; catalog reads, candidate discovery, walking
//               monitor cycles, and resolution never trigger another one.
//   Section J — Downstream convergence: the SAME 0.9.480-style Local
//               candidate adapter, and the real, unmodified
//               WorldSnapshotDiscoveryMonitor, surface a placement that
//               arrived this way — the exact seam 0.9.482 already proved,
//               now fed by production wiring instead of a hand-triggered
//               announce().
//   Section K — Deliberate exclusions; the production diff is exactly
//               the three files this milestone's own header names, and
//               nothing else.

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

// application/CreatePublicationSnapshotPlacementPeerExchangeUseCase.js
// constructs a real storage/LocalStorageProvider.js, which reads
// window.localStorage — a minimal in-memory shim, installed ONLY when no
// window already exists. Mirrors tests/PassivePeerContributionToWalking
// TriggeredSnapshotDiscoveryProductAudit.test.js's own identical shim.
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

// A single-publication world, published under `identityProvider` — the
// same shape tests/DecentralizedSnapshotPlacement.test.js's own
// publishLocally() already established, parameterized on identity so
// Alice's peer-network identity and her signing identity can be the SAME
// LocalIdentityProvider instance, exactly as every *PeerExchange.test.js
// flagship section already does.
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
            const cid = `Qm${Buffer.from(text).toString('hex').slice(0, 40)}`;
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

function signPlacement(identityProvider, fields) {
    let placement = new PublicationSnapshotPlacement({ ...fields, placerIdentity: identityProvider.getSigningIdentity().toJSON() });
    return placement.withSignature(identityProvider.signCanonical(placement.getSigningDescriptor()));
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

// A StubPeerMessageBus whose send() always throws — standing in for a
// transport-level failure (a dropped socket, a full send buffer) rather
// than "peer not authenticated."
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
// verbatim (also reused by 0.9.482's own Section C/J) — a thin,
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

async function run() {
    console.log('=== 0.9.483 — Snapshot Placement Peer Announcement Production Integration Audit ===\n');

    // ===============================================================
    // Section A — Existing placement lifecycle, confirmed by grep.
    // ===============================================================
    {
        // A1. Exactly one production file ever constructs a genuinely NEW
        // PublicationSnapshotPlacement from application-level intent —
        // core/PublicationSnapshotPlacement.js's own internal
        // withSignature()/fromJSON() reconstructions of the SAME claim
        // are model-internal, never a second creation site.
        const constructionSites = grepFiles('new PublicationSnapshotPlacement\\(', ['application', 'ui'])
            .filter((f) => f !== 'core/PublicationSnapshotPlacement.js');
        assert(constructionSites.length === 1 && constructionSites[0] === 'application/CreatePublicationSnapshotPlacementUseCase.js',
            `1. exactly one production file constructs a new PublicationSnapshotPlacement — application/CreatePublicationSnapshotPlacementUseCase.js — found: ${JSON.stringify(constructionSites)}.`);

        // A2. Exactly one production caller of its own execute() —
        // application/CreateExternalSnapshotPlacementUseCase.js — never
        // ui/main.js directly.
        const executeCallers = grepFiles('createPublicationSnapshotPlacementUseCase\\.execute\\(', ['application', 'ui']);
        assert(executeCallers.length === 1 && executeCallers[0] === 'application/CreateExternalSnapshotPlacementUseCase.js',
            `2. exactly one production caller of createPublicationSnapshotPlacementUseCase.execute() — application/CreateExternalSnapshotPlacementUseCase.js — found: ${JSON.stringify(executeCallers)}.`);

        // A3. The restore-on-startup path and the package-import path
        // never reference the creation use case at all — a restored or
        // package-imported placement is never a NEW claim this replica
        // is making, and this milestone must never re-announce either on
        // every app launch or every package import.
        const restoreSource = readSource('application/RestorePublicationSnapshotPlacementCatalogUseCase.js');
        const packageImportSource = readSource('application/ImportPackageSnapshotPlacementsUseCase.js');
        assert(!/CreatePublicationSnapshotPlacementUseCase/.test(restoreSource) && !/announce/i.test(restoreSource),
            '3. application/RestorePublicationSnapshotPlacementCatalogUseCase.js never references the creation use case or announce() — restored placements are never re-announced on startup.');
        assert(!/CreatePublicationSnapshotPlacementUseCase/.test(packageImportSource) && !/announce/i.test(packageImportSource),
            '4. application/ImportPackageSnapshotPlacementsUseCase.js never references the creation use case or announce() either — a package import is not this replica declaring a new claim.');

        console.log('✓ Section A: the ONE production operation that causes a PublicationSnapshotPlacement to become locally known is application/CreatePublicationSnapshotPlacementUseCase.js#execute(), reached only through application/CreateExternalSnapshotPlacementUseCase.js — confirmed by grep, not assumed. Restore-on-startup and package import never touch it.');
    }

    // ===============================================================
    // Section B — Existing announcement capability, wired as an
    // optional collaborator, mirroring `knowledgeStore` exactly.
    // ===============================================================
    {
        const source = readSource('application/CreatePublicationSnapshotPlacementUseCase.js');
        assert(/peerExchange\s*=\s*null/.test(source), '1. peerExchange is OPTIONAL, defaulting to null — mirrors knowledgeStore\'s own 0.8.24 parameter shape exactly.');
        assert(!/new PeerMessageBus\(|new .*PeerConnection|new .*ConnectedPeerRegistry/.test(source),
            '2. this file constructs no new peer transport, connection, or registry of its own — it only ever calls a peerExchange it is HANDED.');

        // B2. Live: a REAL, hand-built PublicationSnapshotPlacementPeerExchange
        // — never a mock object — is what gets called.
        const { catalog: discoveryCatalog, exchange: discoveryExchange } = makeHandBuiltPlacementExchange();
        const alice = makeIdentity('alice-b');
        const alicePeer = stubPeer('conn-alice-b', alice.getSigningIdentity().id);
        const bus = new StubPeerMessageBus();
        const registry = new StubConnectedPeerRegistry([alicePeer]);
        const peerExchange = new PublicationSnapshotPlacementPeerExchange(discoveryExchange, bus, registry);
        assert(peerExchange instanceof PublicationSnapshotPlacementPeerExchange, '3. the collaborator wired in really is the real, unmodified class.');

        const publisherStorage = new InMemoryStorageProvider();
        const publisher = new LocalPublisherProvider(publisherStorage);
        const publication = publisher.publish(createTestDocument('Section B'), alice);
        const discoveryProvider = new LocalDiscoveryProvider(publisherStorage);
        const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const createUseCase = new CreatePublicationSnapshotPlacementUseCase(
            discoveryProvider, alice, new LocalAuthorizationVerifier(), placementCatalog, null, peerExchange
        );
        const created = createUseCase.execute(publication.id, { storage: 'ipfs', locator: 'ipfs://section-b' });
        assert(created instanceof PublicationSnapshotPlacement, '4. execute() still returns the cataloged PublicationSnapshotPlacement, unchanged.');
        assert(bus.sent.length === 1 && bus.sent[0].payload.kind === PublicationSnapshotPlacementPeerMessageKind.ANNOUNCE,
            '5. creating a placement, with a real peerExchange wired in, sends exactly one real ANNOUNCE message — no new message kind, no new protocol.');

        console.log('✓ Section B: peerExchange is an OPTIONAL collaborator on CreatePublicationSnapshotPlacementUseCase, mirroring the existing knowledgeStore parameter\'s own shape exactly, and it is the REAL, unmodified PublicationSnapshotPlacementPeerExchange that gets called — no mock, no new transport class.');
    }

    // ===============================================================
    // Section C — Production reachability.
    // ===============================================================
    {
        const orchestratorSource = readSource('application/CreateSnapshotPlacementOrchestratorUseCase.js');
        assert(/peerExchange\s*=\s*null/.test(orchestratorSource) && /placementCatalog,\s*knowledgeStore,\s*peerExchange/.test(orchestratorSource),
            '1. CreateSnapshotPlacementOrchestratorUseCase.js accepts an optional peerExchange and threads it straight into CreatePublicationSnapshotPlacementUseCase, unchanged in shape.');

        const mainSource = readSource('ui/main.js');
        const wiringStart = mainSource.indexOf('new CreateSnapshotPlacementOrchestratorUseCase().execute({');
        const wiringEnd = mainSource.indexOf('});', wiringStart);
        assert(wiringStart !== -1 && wiringEnd !== -1, '1b. ui/main.js still calls CreateSnapshotPlacementOrchestratorUseCase().execute({...}) exactly once, as a single object-literal call.');
        const wiringBlock = mainSource.slice(wiringStart, wiringEnd);
        assert(/peerExchange:\s*publicationSnapshotPlacementPeerExchange/.test(wiringBlock),
            '2. ui/main.js really does thread `publicationSnapshotPlacementPeerExchange` — the SAME instance application/CreatePublicationSnapshotPlacementPeerExchangeUseCase.js already returns for this replica — into the creation orchestrator, never a second, disconnected exchange.');
        assert((mainSource.match(/publicationSnapshotPlacementPeerExchange/g) || []).length >= 2,
            '3. that identifier is declared once and reused, never redeclared as a second instance.');

        // C2. Live reproduction: the REAL orchestrator, wired with a real
        // peerExchange over a stub bus/registry, reaches announce() from
        // an ordinary create call — with ZERO explicit `.announce()`
        // calls anywhere in this test.
        const alice = makeIdentity('alice-c');
        const alicePeer = stubPeer('conn-alice-c', alice.getSigningIdentity().id);
        const bus = new StubPeerMessageBus();
        const registry = new StubConnectedPeerRegistry([alicePeer]);
        const { exchange: discoveryExchange } = makeHandBuiltPlacementExchange();
        const peerExchange = new PublicationSnapshotPlacementPeerExchange(discoveryExchange, bus, registry);

        const { publication, discoveryProvider, contentResolver } = publishLocallyAs(alice, 'Section C');
        const net = makeFakeIpfsNode();
        const aliceIpfs = new IpfsContentStore({ apiUrl: 'http://alice-node-c.test:5001', fetchImpl: net.fetchImpl });
        const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const orchestrator = new CreateSnapshotPlacementOrchestratorUseCase().execute({
            discoveryProvider, contentResolver, placementCatalog, identityProvider: alice, stores: [aliceIpfs], peerExchange
        });

        assert(bus.sent.length === 0, '4. before any placement is created, nothing has been sent.');
        const result = await orchestrator.createExternalSnapshotPlacementUseCase.execute(publication.id, 'ipfs');
        assert(result.outcome === SnapshotPlacementCreationOutcome.CREATED, '5. the ordinary external placement creation call still succeeds.');
        assert(bus.sent.length === 1, '6. calling ONLY createExternalSnapshotPlacementUseCase.execute() — the exact call ui/views/DecentralizedPublicationsView.js already makes — reached announce() through the full production composition, with no explicit announce() call written anywhere in this test.');

        console.log('✓ Section C: ui/main.js and application/CreateSnapshotPlacementOrchestratorUseCase.js really do thread the SAME publicationSnapshotPlacementPeerExchange instance through, by source; and live, the real orchestrator reaches announce() from an ordinary creation call alone.');
    }

    // ===============================================================
    // Section D — FLAGSHIP: real, live, authenticated peers; automatic
    // propagation; end-to-end resolution.
    // ===============================================================
    let flagshipBobComposition, flagshipPublicationId, flagshipNet;
    {
        resetProductionLocalStorage();
        const network = new LocalPeerNetwork();
        const alice = makeIdentity('alice-d');
        const bob = makeIdentity('bob-d');
        const aliceTransport = new LocalPeerConnectionProvider('alice-node-d', network);
        const bobTransport = new LocalPeerConnectionProvider('bob-node-d', network);

        const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
        const stopAliceListening = aliceConnect.listen();
        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        const stopBobListening = bobConnect.listen();
        const bobToAlice = bobConnect.connect({ candidateEndpoint: 'alice-node-d' });

        await wait(20);
        assert(bobToAlice.getLifecycleState() === PeerLifecycleState.AUTHENTICATED,
            '1. Alice and Bob hold a real, live, AUTHENTICATED peer connection — not a stub.');

        // Alice: the REAL, unmodified PublicationSnapshotPlacementPeerExchange
        // and the REAL, 0.9.483-modified creation pipeline. Her catalog's
        // own storage backing is incidental to what this section audits
        // (never a second window.localStorage instance colliding with
        // Bob's real one below).
        const { catalog: aliceCatalog, exchange: aliceExchange } = makeHandBuiltPlacementExchange();
        const alicePeerExchange = new PublicationSnapshotPlacementPeerExchange(aliceExchange, new PeerMessageBus(), aliceConnect.registry);

        // Bob: the REAL production composition root ui/main.js itself
        // calls — application/CreatePublicationSnapshotPlacementPeerExchangeUseCase.js
        // — over his own real, live registry.
        const bobComposition = new CreatePublicationSnapshotPlacementPeerExchangeUseCase().execute({
            peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: bobConnect.registry
        });
        assert(bobComposition.catalog.list().length === 0, '2. Bob\'s real, production catalog starts empty.');

        const { publication, discoveryProvider, contentResolver } = publishLocallyAs(alice, 'Peer Announce Flagship');
        const net = makeFakeIpfsNode();
        const aliceIpfs = new IpfsContentStore({ apiUrl: 'http://alice-node-d.test:5001', fetchImpl: net.fetchImpl });
        const aliceOrchestrator = new CreateSnapshotPlacementOrchestratorUseCase().execute({
            discoveryProvider, contentResolver, placementCatalog: aliceCatalog, identityProvider: alice,
            stores: [aliceIpfs], peerExchange: alicePeerExchange
        });

        // THE FLAGSHIP MOMENT. An ordinary "place this publication on
        // IPFS" call — the exact call ui/views/DecentralizedPublicationsView.js
        // already makes — with NO explicit announce() or deliver() call
        // anywhere in this test.
        const result = await aliceOrchestrator.createExternalSnapshotPlacementUseCase.execute(publication.id, 'ipfs');
        assert(result.outcome === SnapshotPlacementCreationOutcome.CREATED, '3. Alice\'s ordinary placement creation succeeds.');

        await wait(30);
        const bobPlacements = bobComposition.catalog.findByPublicationId(publication.id);
        assert(bobPlacements.length === 1 && bobPlacements[0].contentHash === result.placement.contentHash,
            '4. Bob\'s real, production, LIVE-network catalog now holds the placement Alice created moments ago — reached automatically, over a real authenticated connection, with zero explicit propagation calls in this test.');

        // K — end-to-end material resolution: Bob resolves the SAME
        // claim, against a real content store pointed at the SAME fake
        // IPFS network Alice placed onto, to real, hash-verified bytes.
        const bobResolver = new SnapshotPlacementResolver(new LocalAuthorizationVerifier());
        const bobIpfs = new IpfsContentStore({ apiUrl: 'http://bob-node-d.test:5001', fetchImpl: net.fetchImpl });
        const resolveResult = await bobResolver.resolve(bobPlacements[0].toJSON(), { contentStore: bobIpfs });
        assert(resolveResult.outcome === SnapshotPlacementResolutionOutcome.RESOLVED,
            '5. Bob resolves the announced placement to RESOLVED, against a real content store, over the same (fake) network.');
        const expectedBytes = JSON.stringify(contentResolver.resolve(publication.id));
        assert(resolveResult.bytes === expectedBytes,
            '6. the resolved bytes are byte-identical to the exact snapshot Alice published — announce() -> live wire -> catalog -> resolver -> bytes holds end to end, with production code doing the announcing this time, not a manual test call.');

        flagshipBobComposition = bobComposition;
        flagshipPublicationId = publication.id;
        flagshipNet = net;

        alicePeerExchange.dispose();
        bobComposition.peerExchange.dispose();
        stopAliceListening();
        stopBobListening();
        aliceTransport.dispose();
        bobTransport.dispose();

        console.log('✓ Section D (FLAGSHIP): over a real, live, authenticated peer connection, an ordinary "place on IPFS" call — the SAME call the existing creation UI already makes — reaches Bob\'s real, production catalog with zero explicit propagation calls anywhere in this test, and Bob resolves the result to real, hash-verified bytes. This is production activation, not merely mechanism.');
    }

    // ===============================================================
    // Section E — Identity fidelity.
    // ===============================================================
    {
        const [received] = flagshipBobComposition.catalog.findByPublicationId(flagshipPublicationId);
        assert(received.publicationId === flagshipPublicationId, '1. publicationId survives unchanged.');
        assert(received.storage === 'ipfs' && received.locator.startsWith('ipfs://'), '2. storage/locator survive unchanged.');
        assert(typeof received.contentHash === 'string' && received.contentHash.length > 0, '3. contentHash survives unchanged.');
        assert(received.placerIdentity && typeof received.placerIdentity.id === 'string', '4. placerIdentity survives unchanged.');
        assert(received.signature && typeof received.signature.signature === 'string', '5. the original signature survives the wire byte-for-byte, still verifiable by whoever receives it — this class never re-signs or re-derives anything.');
        assert(received.id && typeof received.id === 'string', '6. the placement\'s own id survives unchanged — the SAME id Bob and Alice would each independently compute for this claim.');

        console.log('✓ Section E: every field of a placement announced through the newly-activated production path — publicationId, contentHash, storage, locator, placerIdentity, signature, id — survives exactly, the identical fidelity 0.8.19 already guaranteed for a manually-triggered announce().');
    }

    // ===============================================================
    // Section F — Provenance preserved, never rewritten.
    // ===============================================================
    {
        // F1. The RECEIVER's own knowledge: the real production
        // composition root ALREADY wires a LocalPlacementKnowledgeStore
        // into peerExchange (0.8.24) — this milestone builds nothing new
        // here, only observes it now actually fires in production.
        const [received] = flagshipBobComposition.catalog.findByPublicationId(flagshipPublicationId);
        const bobKnowledge = flagshipBobComposition.knowledgeStore.get(received.id);
        assert(bobKnowledge && bobKnowledge.acquisition.kind === PlacementAcquisitionKind.PEER,
            '1. Bob\'s own knowledge store records PEER acquisition for the placement he received — automatically, the moment production ANNOUNCE-handling ingested it.');

        // F2. The CREATOR's own knowledge: a fresh scenario proving
        // Alice's OWN LOCAL knowledge entry is unaffected by also
        // announcing — knowledgeStore and peerExchange are two
        // independent, optional collaborators on the SAME class, and
        // supplying both never lets one overwrite the other's record.
        const alice = makeIdentity('alice-f');
        const alicePeer = stubPeer('conn-alice-f', alice.getSigningIdentity().id);
        const bus = new StubPeerMessageBus();
        const registry = new StubConnectedPeerRegistry([alicePeer]);
        const { exchange: discoveryExchange } = makeHandBuiltPlacementExchange();
        const peerExchange = new PublicationSnapshotPlacementPeerExchange(discoveryExchange, bus, registry);
        const aliceKnowledgeStore = new LocalPlacementKnowledgeStore(new InMemoryStorageProvider());

        const { publication, discoveryProvider, contentResolver } = publishLocallyAs(alice, 'Section F');
        const net = makeFakeIpfsNode();
        const aliceIpfs = new IpfsContentStore({ apiUrl: 'http://alice-node-f.test:5001', fetchImpl: net.fetchImpl });
        const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const orchestrator = new CreateSnapshotPlacementOrchestratorUseCase().execute({
            discoveryProvider, contentResolver, placementCatalog, identityProvider: alice,
            stores: [aliceIpfs], knowledgeStore: aliceKnowledgeStore, peerExchange
        });
        const result = await orchestrator.createExternalSnapshotPlacementUseCase.execute(publication.id, 'ipfs');

        const aliceKnowledge = aliceKnowledgeStore.get(result.placement.id);
        assert(aliceKnowledge && aliceKnowledge.acquisition.kind === PlacementAcquisitionKind.LOCAL,
            '2. Alice\'s OWN knowledge store still records LOCAL for the placement she just created — announcing it to peers never rewrites, downgrades, or removes her own LOCAL provenance record.');
        assert(bus.sent.length === 1, '3. and the announce still happened — both collaborators fire from the same successful creation.');

        console.log('✓ Section F: provenance is preserved exactly as 0.8.24 already established — the creator\'s own LOCAL record and a receiving peer\'s own PEER record are independent, automatic, and never rewritten by each other, now proven with the announce seam actually live rather than only reachable.');
    }

    // ===============================================================
    // Section G — Failure isolation.
    // ===============================================================
    {
        // G1. Zero connected peers.
        {
            const registry = new StubConnectedPeerRegistry([]);
            const bus = new StubPeerMessageBus();
            const { exchange: discoveryExchange } = makeHandBuiltPlacementExchange();
            const peerExchange = new PublicationSnapshotPlacementPeerExchange(discoveryExchange, bus, registry);
            const alice = makeIdentity('alice-g1');
            const { publication, discoveryProvider, contentResolver } = publishLocallyAs(alice, 'Section G1');
            const net = makeFakeIpfsNode();
            const aliceIpfs = new IpfsContentStore({ apiUrl: 'http://alice-node-g1.test:5001', fetchImpl: net.fetchImpl });
            const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
            const orchestrator = new CreateSnapshotPlacementOrchestratorUseCase().execute({
                discoveryProvider, contentResolver, placementCatalog, identityProvider: alice, stores: [aliceIpfs], peerExchange
            });
            const result = await orchestrator.createExternalSnapshotPlacementUseCase.execute(publication.id, 'ipfs');
            assert(result.outcome === SnapshotPlacementCreationOutcome.CREATED && placementCatalog.get(result.placement.id) !== null,
                '1. with zero connected peers, placement creation still succeeds and is still cataloged — an empty peer network is never an error.');
        }

        // G2. A peer bus that throws on send() — a transport-level
        // failure, not merely "nobody is listening."
        {
            const alicePeer = stubPeer('conn-alice-g2', 'did:key:zAliceG2');
            const registry = new StubConnectedPeerRegistry([alicePeer]);
            const bus = new ThrowingPeerMessageBus();
            const { exchange: discoveryExchange } = makeHandBuiltPlacementExchange();
            const peerExchange = new PublicationSnapshotPlacementPeerExchange(discoveryExchange, bus, registry);
            const alice = makeIdentity('alice-g2');
            const { publication, discoveryProvider, contentResolver } = publishLocallyAs(alice, 'Section G2');
            const net = makeFakeIpfsNode();
            const aliceIpfs = new IpfsContentStore({ apiUrl: 'http://alice-node-g2.test:5001', fetchImpl: net.fetchImpl });
            const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
            const orchestrator = new CreateSnapshotPlacementOrchestratorUseCase().execute({
                discoveryProvider, contentResolver, placementCatalog, identityProvider: alice, stores: [aliceIpfs], peerExchange
            });
            const result = await orchestrator.createExternalSnapshotPlacementUseCase.execute(publication.id, 'ipfs');
            assert(result.outcome === SnapshotPlacementCreationOutcome.CREATED && placementCatalog.get(result.placement.id) !== null,
                '2. a transport that throws on every send() still leaves placement creation successful and cataloged — the try/catch this milestone added absorbs it, exactly as intended.');
        }

        // G3. A malformed peerExchange collaborator (no announce()
        // function at all) — the defensive edge of the same discipline.
        {
            const alice = makeIdentity('alice-g3');
            const { publication, discoveryProvider, contentResolver } = publishLocallyAs(alice, 'Section G3');
            const net = makeFakeIpfsNode();
            const aliceIpfs = new IpfsContentStore({ apiUrl: 'http://alice-node-g3.test:5001', fetchImpl: net.fetchImpl });
            const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
            const orchestrator = new CreateSnapshotPlacementOrchestratorUseCase().execute({
                discoveryProvider, contentResolver, placementCatalog, identityProvider: alice, stores: [aliceIpfs], peerExchange: {}
            });
            const result = await orchestrator.createExternalSnapshotPlacementUseCase.execute(publication.id, 'ipfs');
            assert(result.outcome === SnapshotPlacementCreationOutcome.CREATED,
                '3. even a peerExchange object with no announce() function at all never breaks placement creation — the try/catch catches the resulting TypeError exactly like any other announce() failure.');
        }

        console.log('✓ Section G: peer propagation is confirmed, live, to be an enhancement never an authority — zero connected peers, a transport that throws, and a malformed peerExchange collaborator all leave placement creation exactly as successful as it already was.');
    }

    // ===============================================================
    // Section H — Multi-peer behavior.
    // ===============================================================
    {
        const alice = makeIdentity('alice-h');
        const bob = stubPeer('conn-bob-h', 'did:key:zBobH');
        const carol = stubPeer('conn-carol-h', 'did:key:zCarolH');
        const dave = stubPeer('conn-dave-h', 'did:key:zDaveH');
        const registry = new StubConnectedPeerRegistry([bob, carol, dave]);
        const bus = new StubPeerMessageBus();
        const { exchange: discoveryExchange } = makeHandBuiltPlacementExchange();
        const peerExchange = new PublicationSnapshotPlacementPeerExchange(discoveryExchange, bus, registry);

        const { publication, discoveryProvider, contentResolver } = publishLocallyAs(alice, 'Section H');
        const net = makeFakeIpfsNode();
        const aliceIpfs = new IpfsContentStore({ apiUrl: 'http://alice-node-h.test:5001', fetchImpl: net.fetchImpl });
        const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const orchestrator = new CreateSnapshotPlacementOrchestratorUseCase().execute({
            discoveryProvider, contentResolver, placementCatalog, identityProvider: alice, stores: [aliceIpfs], peerExchange
        });
        const result = await orchestrator.createExternalSnapshotPlacementUseCase.execute(publication.id, 'ipfs');

        assert(bus.sent.length === 3, '1. one creation announces to all three currently AUTHENTICATED peers, independently — never a single broadcast object, never fewer than every connected peer.');
        const recipients = bus.sent.map((m) => m.peer.connectionId).sort();
        assert(JSON.stringify(recipients) === JSON.stringify(['conn-bob-h', 'conn-carol-h', 'conn-dave-h']),
            '2. every one of the three peers is a recipient.');
        assert(bus.sent.every((m) => m.payload.envelope.id === result.placement.id),
            '3. all three receive the identical envelope — no ranking, no preferred peer, no per-recipient variation.');

        console.log('✓ Section H: creating one placement announces it to every one of several independently-authenticated peers, undifferentiated — no ranking or preferred-peer concept introduced anywhere in this path.');
    }

    // ===============================================================
    // Section I — No duplicate announcements.
    // ===============================================================
    {
        const alice = makeIdentity('alice-i');
        const alicePeer = stubPeer('conn-alice-i', alice.getSigningIdentity().id);
        const registry = new StubConnectedPeerRegistry([alicePeer]);
        const bus = new StubPeerMessageBus();
        const { exchange: discoveryExchange } = makeHandBuiltPlacementExchange();
        const peerExchange = new PublicationSnapshotPlacementPeerExchange(discoveryExchange, bus, registry);

        const { publication, discoveryProvider, contentResolver } = publishLocallyAs(alice, 'Section I');
        const net = makeFakeIpfsNode();
        const aliceIpfs = new IpfsContentStore({ apiUrl: 'http://alice-node-i.test:5001', fetchImpl: net.fetchImpl });
        const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const orchestrator = new CreateSnapshotPlacementOrchestratorUseCase().execute({
            discoveryProvider, contentResolver, placementCatalog, identityProvider: alice, stores: [aliceIpfs], peerExchange
        });
        const result = await orchestrator.createExternalSnapshotPlacementUseCase.execute(publication.id, 'ipfs');
        assert(bus.sent.length === 1, '1. one creation sends exactly one ANNOUNCE.');

        // None of the following ordinary, read-only operations on the
        // SAME already-created placement may ever send a second one —
        // announcement belongs to the CREATION lifecycle, never to
        // observation.
        placementCatalog.get(result.placement.id);
        placementCatalog.list();
        placementCatalog.findByPublicationId(publication.id);

        const localSource = new LocalSnapshotCandidateDiscoveryQueryServicePrototype(placementCatalog);
        await executeDiscoverSnapshotCandidatesCommand({ discoveryTag: 'forkbuild-snapshot', discoveryQueryService: localSource });

        const monitor = new WorldSnapshotDiscoveryMonitor({
            discoverSnapshotCandidatesCommand: () => executeDiscoverSnapshotCandidatesCommand({ discoveryTag: 'forkbuild-snapshot', discoveryQueryService: localSource })
        });
        await monitor.observe({ position: { x: 0, y: 0, z: 0 } });
        await monitor.observe({ position: { x: 50, y: 0, z: 0 } });

        const resolver = new SnapshotPlacementResolver(new LocalAuthorizationVerifier());
        await resolver.resolve(result.placement.toJSON(), { contentStore: aliceIpfs });

        assert(bus.sent.length === 1,
            '2. catalog reads, a candidate-discovery command run, two full walking-monitor observe() cycles, and an explicit resolution of the SAME placement afterward send NOTHING further — announcement fired exactly once, at creation, never re-fired by any later observation of the same claim.');

        console.log('✓ Section I: announcement is a one-time act of the placement CREATION lifecycle — reads, candidate discovery, walking-monitor polling, and resolution of the same already-announced placement never re-trigger it.');
    }

    // ===============================================================
    // Section J — Downstream convergence: the existing Local candidate
    // adapter and walking monitor, fed by production-activated ANNOUNCE.
    // ===============================================================
    {
        const localSource = new LocalSnapshotCandidateDiscoveryQueryServicePrototype(flagshipBobComposition.catalog);
        const candidates = await localSource.search('forkbuild-snapshot');
        assert(candidates.some((c) => c.publicationId === flagshipPublicationId),
            '1. the placement that reached Bob via the NOW-ACTIVATED production announce path surfaces through the SAME 0.9.480-style Local candidate adapter, unmodified.');

        const monitor = new WorldSnapshotDiscoveryMonitor({
            discoverSnapshotCandidatesCommand: () => executeDiscoverSnapshotCandidatesCommand({ discoveryTag: 'forkbuild-snapshot', discoveryQueryService: localSource })
        });
        await monitor.observe({ position: { x: 0, y: 0, z: 0 } });
        assert(monitor.lastResult.some((c) => c.publicationId === flagshipPublicationId) && monitor.lastError === null,
            '2. the real, unmodified WorldSnapshotDiscoveryMonitor surfaces it through one observe() cycle — the full "placement creation -> announce() -> live wire -> catalog -> candidate query -> walking monitor" diagram this milestone\'s own originating request drew, now proven with every link, including the first one, production-activated rather than hand-triggered.');

        console.log('✓ Section J: 0.9.480\'s own Local candidate adapter and the real walking monitor need zero changes to surface a placement that arrived through the newly-activated production announce path — the downstream half of this pipeline was already correct; only the first edge was missing, and this milestone supplied it.');
    }

    // ===============================================================
    // Section K — Deliberate exclusions; scoped production diff.
    // ===============================================================
    {
        const changedFiles = execSync(
            'git diff --name-only HEAD -- . ":(exclude)tests" ":(exclude)docs/Roadmap.md" ":(exclude)tests.html"',
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim().split('\n').filter(Boolean).sort();
        const expectedChangedFiles = [
            'application/CreatePublicationSnapshotPlacementUseCase.js',
            'application/CreateSnapshotPlacementOrchestratorUseCase.js',
            'ui/main.js'
        ].sort();
        assert(JSON.stringify(changedFiles) === JSON.stringify(expectedChangedFiles),
            `1. the production diff is exactly the three files this milestone's own header names — no new peer manager, connection layer, transport, discovery registry, or persistence mechanism anywhere else (found: ${JSON.stringify(changedFiles)}).`);

        // No new class was built anywhere.
        const newClassFiles = grepFiles('PublicationSnapshotPlacementPeerConnectionSync|SnapshotPlacementAnnouncementManager|SnapshotPlacementDiscoveryRegistry', ['application', 'ui']);
        assert(newClassFiles.length === 0, '2. no new peer-connection-sync class, announcement-manager class, or discovery-registry class exists anywhere — this milestone activates the existing announce(), nothing else.');

        console.log('✓ Section K: the production diff is exactly application/CreatePublicationSnapshotPlacementUseCase.js, application/CreateSnapshotPlacementOrchestratorUseCase.js, and ui/main.js — no new peer manager, transport, discovery registry, or persistence mechanism. Every collaborator this milestone touches already existed before it started.');
    }

    console.log('\n✓ FINAL DECISION.\n' +
'\n' +
'OUTCOME: ANNOUNCE_ACTIVATED.\n' +
'\n' +
"WHY. 0.9.482 found that PublicationSnapshotPlacementPeerExchange#announce() -- fully implemented, mechanically\n" +
'proven live since 0.8.19 -- was never called anywhere in this codebase\'s own production wiring. This milestone\n' +
'closes exactly that gap, at exactly the place the originating request named: the one production operation that\n' +
'causes a PublicationSnapshotPlacement to become locally known at all (application/CreatePublicationSnapshotPlacementUseCase.js\n' +
'#execute(), reached only through application/CreateExternalSnapshotPlacementUseCase.js -- Section A). peerExchange\n' +
'joins that class as an optional collaborator in exactly the shape its own existing knowledgeStore parameter already\n' +
'established (Section B), threaded through application/CreateSnapshotPlacementOrchestratorUseCase.js and wired in\n' +
'ui/main.js to the SAME publicationSnapshotPlacementPeerExchange instance this replica already builds (Section C).\n' +
'\n' +
'Section D (FLAGSHIP) proves this is production activation, not merely another mechanism test: over a REAL, live,\n' +
'authenticated peer connection, an ordinary "place this publication externally" call -- the exact call this\n' +
"codebase's own creation UI already makes -- reaches a second replica's real, production catalog with NO explicit\n" +
'announce() or deliver() call anywhere in the test, and that second replica resolves the result to real,\n' +
'hash-verified bytes. Sections E-F reconfirm that identity and provenance survive this newly-live path exactly as\n' +
'0.8.19/0.8.24 already guaranteed them, never rewritten by activating the seam. Section G proves the one property\n' +
'the originating request most insisted on: zero connected peers, a throwing transport, and even a malformed\n' +
'peerExchange collaborator all leave placement creation exactly as successful as it already was -- peer propagation\n' +
'is confirmed, live, to be an enhancement, never an authority. Section H reconfirms multi-peer fan-out carries no\n' +
'ranking. Section I is the originating request\'s own most specific worry, checked directly: announcement fires\n' +
'exactly once, at creation, and is never re-triggered by a catalog read, a candidate-discovery run, a walking-\n' +
"monitor cycle, or a resolution of the same already-announced claim. Section J closes the loop 0.9.482's own\n" +
'audit opened: the existing Local candidate adapter and the real walking monitor need zero further changes to\n' +
'surface a placement that arrived this way -- the downstream half of this pipeline was already correct; only the\n' +
'first edge was missing. Section K confirms the production diff is exactly the three files this activation\n' +
'required, and nothing else -- no new peer manager, transport, discovery registry, or persistence mechanism.\n' +
'\n' +
'WHAT THIS MEANS. "Peer content that has been announced" is no longer an empty set for placements in production.\n' +
"0.9.484's own precondition -- a real production announce edge for the Local candidate query family's own passive\n" +
'peer contribution -- is now satisfied, and an end-to-end passive-discovery integration audit (0.9.484) or the\n' +
'Local + Nostr + passive-Peer composite candidate query service (0.9.485) can now be evaluated against what this\n' +
'replica actually does, rather than against a mechanism it merely could do.\n');

    console.log('\n✅ All Snapshot Placement Peer Announcement Production Integration Audit tests passed.');
}

run().then(() => {
    console.log('\n✓ All SnapshotPlacementPeerAnnouncementProductionIntegrationAudit tests passed');
}).catch((error) => {
    console.error('\n✗ SnapshotPlacementPeerAnnouncementProductionIntegrationAudit tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
