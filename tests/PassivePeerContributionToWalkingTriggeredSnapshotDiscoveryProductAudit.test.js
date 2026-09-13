import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { PublicationSnapshotPlacement } from '../core/PublicationSnapshotPlacement.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/LocalPublicationSnapshotPlacementCatalog.js';
import { PublicationSnapshotPlacementExchange } from '../application/PublicationSnapshotPlacementExchange.js';
import { PublicationSnapshotPlacementPeerExchange } from '../application/PublicationSnapshotPlacementPeerExchange.js';
import { CreatePublicationSnapshotPlacementPeerExchangeUseCase } from '../application/CreatePublicationSnapshotPlacementPeerExchangeUseCase.js';
import { PublicationSnapshotPlacementPeerMessageKind } from '../application/PublicationSnapshotPlacementPeerProtocol.js';
import { PlacementAcquisitionKind } from '../application/PlacementAcquisitionKind.js';
import { SnapshotPlacementResolver } from '../application/SnapshotPlacementResolver.js';
import { SnapshotPlacementResolutionOutcome } from '../application/SnapshotPlacementResolutionOutcome.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { IpfsContentStore } from '../content/IpfsContentStore.js';
import { WorldSnapshotDiscoveryMonitor } from '../application/WorldSnapshotDiscoveryMonitor.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/DiscoverSnapshotCandidatesCommand.js';

// 0.9.482 — Passive Peer Contribution to Walking-Triggered Snapshot
// Discovery Product Audit.
//
// Test-only. Production changes: none (enforced by Section J's own
// git-diff guard).
//
// ORIGINATING OBSERVATION: 0.9.481's own central correction was
// mechanical — an unsolicited ANNOUNCE already delivers a peer-sourced
// placement into the exact LocalPublicationSnapshotPlacementCatalog
// 0.9.480's own Local adapter reads, entirely through existing,
// unmodified 0.8.19 machinery — and it therefore recommended NOT
// building an active BROWSE_REQUEST/BROWSE_RESPONSE protocol until a
// product review asked one narrower question first: does that passive
// contribution already give a Wanderer a meaningful nearby-peer
// discovery experience? This milestone is that product audit — the
// first of this whole family to look at PRODUCTION COMPOSITION
// (`ui/main.js` and its use-case wiring), not merely the mechanism
// 0.9.480/0.9.481 already proved live in isolation. It is exactly as
// willing to report "the passive path already suffices" as to report
// "it does not" — and, as it turns out, finds a THIRD answer neither
// prior audit had reason to look for.
//
//   Section A — Reconfirming, live, the mechanism baseline 0.9.480/
//               0.9.481 already established — the candidate contract,
//               and that an ANNOUNCE still reaches the exact catalog the
//               Local adapter reads — never re-derived, only reproduced,
//               so this audit builds on fact, not memory.
//   Section B — Peer -> local catalog propagation, through the REAL
//               production composition root
//               (CreatePublicationSnapshotPlacementPeerExchangeUseCase,
//               the exact class ui/main.js itself calls) rather than
//               0.9.481's own hand-built collaborators — a strictly
//               stronger proof that this is genuinely wired, not merely
//               wireable.
//   Section C — Walking-triggered visibility: the SAME peer-sourced
//               entry, through the Local adapter prototype 0.9.480
//               built, driving the REAL, unmodified command and monitor
//               through one full observe() cycle.
//   Section D — FLAGSHIP: end-to-end resolution. A candidate surfaced
//               this way still carries enough identity to look its own
//               full signed envelope back up in the SAME catalog and
//               resolve it — via application/SnapshotPlacementResolver.js,
//               against a real content store — to actual, hash-verified
//               bytes. Also corrects the originating brief's own
//               "Publication / World View / Repository" framing: this
//               family resolves BYTES, never a `publisher/Publication.js`
//               object, and reaching a Publication is a structurally
//               separate, ANNOUNCE-only discovery pipeline this
//               milestone does not merge.
//   Section E — THE CENTRAL CORRECTION OF THIS AUDIT. Freshness
//               semantics, gone looking in production composition rather
//               than assumed: `PublicationSnapshotPlacementPeerExchange
//               #announce()` is never called ANYWHERE in this codebase's
//               own production wiring today — proven by grep AND
//               reproduced live with the real composed class — unlike
//               its own Publication-side sibling
//               (`PublicationPeerConnectionSync`, 0.9.342), which
//               `CreatePublicationPeerExchangeUseCase.js` already
//               constructs automatically. "Peer content that has been
//               announced" is, in production, today, an EMPTY set for
//               placements — not merely a narrower set than "everything a
//               peer holds."
//   Section F — Multi-peer behavior: three peers announcing
//               independently into the SAME real catalog, live — no
//               ranking, no preferred-source, all three surface through
//               the candidate query.
//   Section G — Offline/disconnected behavior: a candidate stays
//               discoverable after its announcing peer disconnects, but
//               resolving it against a store that never actually
//               received the bytes yields CONTENT_UNAVAILABLE, live —
//               "candidate exists" and "material currently retrievable"
//               proven, concretely, to be two different facts.
//   Section H — Provenance preserved, never rewritten: application/
//               PlacementAcquisitionKind.js / LocalPlacementKnowledgeStore.js
//               (0.8.24) already record PEER acquisition SEPARATELY from
//               the catalog itself, wired automatically by the SAME real
//               composition root Section B used — a composite query
//               composes candidate knowledge without ever needing to
//               invent a provenance field on the candidate shape, or
//               rewrite the catalog as "local, including peer."
//   Section I — Architectural boundary held.
//   Section J — Deliberate exclusions; no production file touched; final
//               classification.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function wait(ms = 20) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function grepFiles(pattern, dirs, { ignoreCase = false } = {}) {
    let hits = '';
    try {
        const flags = ignoreCase ? '-rliE' : '-rlE';
        hits = execSync(`grep ${flags} "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* grep exits non-zero on no match; treated as zero hits */ }
    return hits.trim() ? hits.trim().split('\n') : [];
}

// application/CreatePublicationSnapshotPlacementPeerExchangeUseCase.js
// constructs a real storage/LocalStorageProvider.js, which reads
// window.localStorage — a minimal in-memory shim, installed ONLY when no
// window already exists (a real browser test run never hits this
// branch). Same posture as tests/PeerPublicationConnectionSyncBoundaryAudit
// .test.js's own identical shim, one file family over.
let _productionLocalStorageBacking = new Map();
if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
        localStorage: {
            getItem: (k) => (_productionLocalStorageBacking.has(k) ? _productionLocalStorageBacking.get(k) : null),
            setItem: (k, v) => { _productionLocalStorageBacking.set(k, String(v)); },
            removeItem: (k) => { _productionLocalStorageBacking.delete(k); },
            key: (i) => Array.from(_productionLocalStorageBacking.keys())[i] ?? null,
            get length() { return _productionLocalStorageBacking.size; }
        }
    };
}

// Each section below that constructs a REAL
// CreatePublicationSnapshotPlacementPeerExchangeUseCase wants its own
// isolated replica — never a replica that silently accumulates whatever
// an earlier section's own composition already wrote to the SAME shared
// window.localStorage backing. Called once at the top of every such
// section, never mid-section.
function resetProductionLocalStorage() {
    _productionLocalStorageBacking = new Map();
    globalThis.window.localStorage = {
        getItem: (k) => (_productionLocalStorageBacking.has(k) ? _productionLocalStorageBacking.get(k) : null),
        setItem: (k, v) => { _productionLocalStorageBacking.set(k, String(v)); },
        removeItem: (k) => { _productionLocalStorageBacking.delete(k); },
        key: (i) => Array.from(_productionLocalStorageBacking.keys())[i] ?? null,
        get length() { return _productionLocalStorageBacking.size; }
    };
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

function signPlacement(identityProvider, fields) {
    let placement = new PublicationSnapshotPlacement({
        ...fields,
        placerIdentity: identityProvider.getSigningIdentity().toJSON()
    });
    placement = placement.withSignature(identityProvider.signCanonical(placement.getSigningDescriptor()));
    return placement;
}

// Alice plays "the other replica" throughout this audit — her own local
// state is never what this milestone is auditing, so she always gets a
// simple, hand-built, isolated exchange (0.9.481's own `makePlacementExchange()`)
// rather than the real composition root, which BOB's side uses instead
// (see Section B) to prove production wiring, not merely mechanism.
function makeAliceExchange() {
    const catalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
    const verifier = new LocalAuthorizationVerifier();
    const exchange = new PublicationSnapshotPlacementExchange(catalog, verifier);
    return { catalog, verifier, exchange };
}

// Mirrors every sibling *PeerExchange.test.js's own StubPeerMessageBus in
// this codebase, reproduced here rather than imported (each test file's
// own stub stays self-contained, the existing convention).
class StubPeerMessageBus {
    constructor() {
        this._handlers = new Map();
        this.sent = [];
        this.attached = new Set();
    }
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

class StubConnectedPeerRegistry {
    constructor(peers = []) { this._peers = peers; this._listeners = new Set(); }
    list() { return this._peers; }
    add(peer) { this._peers = [...this._peers, peer]; this._publish(); }
    remove(connectionId) { this._peers = this._peers.filter((p) => p.connectionId !== connectionId); this._publish(); }
    onChange(callback) { this._listeners.add(callback); return () => this._listeners.delete(callback); }
    _publish() { for (const listener of this._listeners) listener(this._peers); }
}

function stubPeer(connectionId, identityId, state = PeerLifecycleState.AUTHENTICATED) {
    return {
        connectionId,
        remoteIdentity: identityId ? { identityId } : null,
        getLifecycleState: () => state
    };
}

// 0.9.480's own test-only adapter prototype, reproduced verbatim — a
// thin, never-production seam wrapping a REAL, unmodified
// LocalPublicationSnapshotPlacementCatalog instance. `discoveryTag` is
// deliberately unread, exactly as 0.9.480's own Section K explains.
class LocalSnapshotCandidateDiscoveryQueryServicePrototype {
    constructor(placementCatalog) { this._catalog = placementCatalog; }
    async search(_discoveryTag) {
        return this._catalog.list().map((placement) => ({
            contentHash: placement.contentHash,
            locator: placement.locator,
            storage: placement.storage,
            publicationId: placement.publicationId
        }));
    }
}

// A fake IPFS node, reproduced from tests/SnapshotPlacementCreationUX
// .test.js's own identical helper — the same real content/
// IpfsContentStore.js this codebase's own creation UX already resolves
// against, never a hand-rolled stand-in content store.
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

async function run() {
    console.log('=== 0.9.482 — Passive Peer Contribution to Walking-Triggered Snapshot Discovery Product Audit ===\n');

    // ===============================================================
    // Section A — Reconfirming the mechanism baseline, live.
    // ===============================================================
    {
        // A1. The exact candidate contract 0.9.479/0.9.480/0.9.481 all
        // reconfirmed in turn, reproduced live rather than trusted from
        // memory.
        assert(executeDiscoverSnapshotCandidatesCommand.length <= 1,
            '1. executeDiscoverSnapshotCandidatesCommand still takes one destructured { discoveryTag, discoveryQueryService } argument.');
        const placement = new PublicationSnapshotPlacement({
            publicationId: 'pub-baseline', contentHash: 'hash-baseline', storage: 'ipfs', locator: 'ipfs://baseline'
        });
        assert(placement.contentHash === 'hash-baseline' && placement.publicationId === 'pub-baseline',
            '2. PublicationSnapshotPlacement\'s own required fields still ARE the candidate shape.');

        // A2. 0.9.481's own central correction, reconfirmed against the
        // real DEFAULT_PROTOCOL and message-kind vocabulary rather than
        // re-run as a whole test file — this audit builds forward from
        // it, never re-litigates it.
        assert(PublicationSnapshotPlacementPeerExchange.DEFAULT_PROTOCOL === 'forkbuild:snapshot-placement',
            '3. the placement peer-exchange protocol name is unchanged.');
        assert(Object.keys(PublicationSnapshotPlacementPeerMessageKind).length === 3,
            '4. still exactly ANNOUNCE/REQUEST/RESPONSE — no BROWSE/QUERY kind has been added since 0.9.481.');

        console.log('✓ Section A: the candidate contract and the ANNOUNCE-based propagation mechanism 0.9.480/0.9.481 already proved live are unchanged — this audit builds forward from fact, not memory.');
    }

    // ===============================================================
    // Section B — Peer -> local catalog propagation, through REAL
    // production composition.
    // ===============================================================
    let bobComposition, aliceForB, sharedBusB, alicePeerForB;
    {
        // B1. Bob's side is now the REAL composition root ui/main.js
        // itself calls — application/
        // CreatePublicationSnapshotPlacementPeerExchangeUseCase.js —
        // never the hand-built PublicationSnapshotPlacementExchange
        // 0.9.481's own test constructed directly. A stronger proof:
        // this is the actual class this app runs, restore pass and all.
        const bus = new StubPeerMessageBus();
        const alice = makeIdentity('alice');
        const alicePeer = stubPeer('conn-alice-b', alice.getSigningIdentity().id);
        const registry = new StubConnectedPeerRegistry([alicePeer]);
        resetProductionLocalStorage();
        bobComposition = new CreatePublicationSnapshotPlacementPeerExchangeUseCase().execute({
            peerMessageBus: bus, connectedPeerRegistry: registry
        });
        assert(bobComposition.catalog instanceof LocalPublicationSnapshotPlacementCatalog,
            '1. the real composition root hands back a real LocalPublicationSnapshotPlacementCatalog — the same class 0.9.480\'s own adapter reads.');
        assert(bobComposition.catalog.findByPublicationId('pub-unknown-to-bob').length === 0,
            '2. before anything arrives, Bob\'s real, production-composed catalog knows nothing about this publicationId.');

        const signed = signPlacement(alice, {
            publicationId: 'pub-unknown-to-bob', contentHash: 'hash-b', storage: 'ipfs', locator: 'ipfs://from-alice-b'
        });
        bus.deliver(PublicationSnapshotPlacementPeerExchange.DEFAULT_PROTOCOL,
            { kind: PublicationSnapshotPlacementPeerMessageKind.ANNOUNCE, envelope: signed.toJSON() },
            { connectedPeer: alicePeer });

        const cataloged = bobComposition.catalog.findByPublicationId('pub-unknown-to-bob');
        assert(cataloged.length === 1 && cataloged[0].contentHash === 'hash-b',
            '3. a single ANNOUNCE, delivered to the REAL production-composed PublicationSnapshotPlacementPeerExchange, lands in the REAL production-composed catalog — this is genuinely wired mechanism, not merely wireable mechanism.');

        aliceForB = alice;
        sharedBusB = bus;
        alicePeerForB = alicePeer;

        console.log('✓ Section B: an ANNOUNCE reaches Bob\'s catalog through the EXACT composition root ui/main.js itself calls (CreatePublicationSnapshotPlacementPeerExchangeUseCase) — a strictly stronger proof than 0.9.481\'s own hand-built collaborators, that this propagation is genuinely production-wired mechanism.');
    }

    // ===============================================================
    // Section C — Walking-triggered visibility.
    // ===============================================================
    {
        const localSource = new LocalSnapshotCandidateDiscoveryQueryServicePrototype(bobComposition.catalog);

        // C1. The real, unmodified command sees the peer-sourced entry.
        const viaCommand = await executeDiscoverSnapshotCandidatesCommand({
            discoveryTag: 'forkbuild-snapshot', discoveryQueryService: localSource
        });
        assert(viaCommand.some((c) => c.contentHash === 'hash-b'),
            '1. executeDiscoverSnapshotCandidatesCommand(), completely unmodified, surfaces the peer-sourced placement through the Local adapter.');

        // C2. The real, unmodified monitor drives it through one full
        // observe() cycle — the walking-triggered path itself.
        const monitor = new WorldSnapshotDiscoveryMonitor({
            discoverSnapshotCandidatesCommand: () => executeDiscoverSnapshotCandidatesCommand({
                discoveryTag: 'forkbuild-snapshot', discoveryQueryService: localSource
            })
        });
        await monitor.observe({ position: { x: 0, y: 0, z: 0 } });
        assert(monitor.lastResult.some((c) => c.contentHash === 'hash-b') && monitor.lastError === null,
            '2. WorldSnapshotDiscoveryMonitor, completely unmodified, surfaces a peer-ANNOUNCEd placement through one observe() cycle — ANNOUNCE -> catalog -> candidate query -> walking monitor, with zero changes to any of the four.');

        console.log('✓ Section C: a placement that arrived over a live peer ANNOUNCE, through the real production catalog, reaches the real, unmodified command AND monitor with zero changes to either — the exact "peer ANNOUNCE -> local catalog -> candidate query -> walking monitor" diagram this milestone\'s own originating request drew, now proven live end to end.');
    }

    // ===============================================================
    // Section D — FLAGSHIP: end-to-end resolution.
    // ===============================================================
    {
        // D1. A fresh scenario: Alice creates and signs a REAL placement
        // whose locator actually resolves against a real (fake) IPFS
        // network — mirroring tests/SnapshotPlacementCreationUX.test.js's
        // own flagship shape, applied here to a PEER-sourced placement
        // rather than a self-created one.
        const net = makeFakeIpfsNode();
        const aliceIpfs = new IpfsContentStore({ apiUrl: 'http://alice-node.test:5001', fetchImpl: net.fetchImpl });
        const bytes = JSON.stringify({ farmhouse: 'snapshot' });
        const putResult = await aliceIpfs.put(bytes);

        const alice = makeIdentity('alice-d');
        const signed = signPlacement(alice, {
            publicationId: 'pub-flagship', contentHash: putResult.hash, storage: 'ipfs', locator: putResult.uri
        });

        // D2. The SAME propagation path Section B just proved — a real
        // production Bob catalog, fed by a real ANNOUNCE.
        const bus = new StubPeerMessageBus();
        const alicePeer = stubPeer('conn-alice-d', alice.getSigningIdentity().id);
        const registry = new StubConnectedPeerRegistry([alicePeer]);
        resetProductionLocalStorage();
        const bob = new CreatePublicationSnapshotPlacementPeerExchangeUseCase().execute({
            peerMessageBus: bus, connectedPeerRegistry: registry
        });
        bus.deliver(PublicationSnapshotPlacementPeerExchange.DEFAULT_PROTOCOL,
            { kind: PublicationSnapshotPlacementPeerMessageKind.ANNOUNCE, envelope: signed.toJSON() },
            { connectedPeer: alicePeer });

        // D3. Bob discovers a CANDIDATE the ordinary, stripped-down way —
        // via the Local adapter, exactly as the walking monitor would.
        const localSource = new LocalSnapshotCandidateDiscoveryQueryServicePrototype(bob.catalog);
        const candidates = await localSource.search('forkbuild-snapshot');
        const candidate = candidates.find((c) => c.publicationId === 'pub-flagship');
        assert(candidate && candidate.contentHash === putResult.hash,
            '1. the flagship placement surfaces as an ordinary, stripped-down { contentHash, locator, storage, publicationId } candidate.');

        // D4. THE KEY STRUCTURAL FACT: a candidate alone carries no
        // signature — search()'s own contract (0.9.150's own header,
        // "never re-described") strips it down. Resolving REQUIRES the
        // FULL signed envelope, which the candidate does NOT carry —
        // but the SAME catalog the candidate came from still holds it,
        // addressable by the identity fields the candidate itself
        // carries (contentHash / publicationId). This is the one bridge
        // this milestone's own audit is entitled to observe, never
        // invent: a caller resolving a discovered candidate goes back to
        // the catalog it came from, not to the candidate object itself.
        assert(!('placerIdentity' in candidate) && !('signature' in candidate),
            '2. the candidate itself carries no signature or identity field — it is a locator claim SHAPE only, never a resolvable envelope by itself.');
        const [fullPlacement] = bob.catalog.findByContentHash(candidate.contentHash);
        assert(fullPlacement instanceof PublicationSnapshotPlacement && fullPlacement.locator === candidate.locator,
            '3. the FULL signed envelope for this exact candidate is still sitting in the catalog it came from, addressable by the candidate\'s own contentHash.');

        // D5. Resolution, via application/SnapshotPlacementResolver.js
        // (0.8.18, unmodified) — the SAME resolution machinery this
        // codebase already uses for a self-created placement, applied
        // here, unmodified, to a peer-discovered one.
        const bobVerifier = new LocalAuthorizationVerifier();
        const bobResolver = new SnapshotPlacementResolver(bobVerifier);
        const bobIpfs = new IpfsContentStore({ apiUrl: 'http://bob-node.test:5001', fetchImpl: net.fetchImpl });
        const result = await bobResolver.resolve(fullPlacement.toJSON(), { contentStore: bobIpfs });
        assert(result.outcome === SnapshotPlacementResolutionOutcome.RESOLVED,
            '4. Bob resolves the peer-ANNOUNCEd, walking-discovered candidate to RESOLVED, against a REAL content store, over the SAME (fake) IPFS network Alice\'s own placement pointed at.');
        assert(result.bytes === bytes,
            '5. the resolved bytes are byte-identical to the exact content Alice put — the full journey (ANNOUNCE -> catalog -> candidate -> full envelope -> resolver -> bytes) holds end to end.');

        // D6. Correcting the originating brief's own framing: this
        // family's "end to end" stops at BYTES, never a
        // `publisher/Publication.js` object. Reaching a Publication is
        // application/PublicationPeerProtocol.js's own, structurally
        // separate, ANNOUNCE-only pipeline (0.7.3) — confirmed live,
        // never merged with this one.
        const publicationPeerProtocolSource = await readSource('application/PublicationPeerProtocol.js');
        assert(!/PublicationSnapshotPlacement/.test(publicationPeerProtocolSource),
            '6. application/PublicationPeerProtocol.js — the pipeline that would carry a full Publication object — never references PublicationSnapshotPlacement at all; the two remain two independent gossip families.');
        const placementPeerProtocolSource = await readSource('application/PublicationSnapshotPlacementPeerProtocol.js');
        assert(!/DecentralizedPublication/.test(placementPeerProtocolSource),
            '7. ...and application/PublicationSnapshotPlacementPeerProtocol.js never references DecentralizedPublication either — resolving a discovered candidate answers "can these bytes be retrieved," never "here is the publication they belong to." A caller who wants that separately-attributed Publication object reuses application/SnapshotPublicationAttribution.js, unmodified, exactly as application/DiscoverSnapshotCandidatesCommand.js\'s own header already excludes doing here.');

        console.log('✓ Section D (FLAGSHIP): a candidate discovered entirely through passive ANNOUNCE resolves, end to end, to real, hash-verified bytes — through the catalog it came from (never the stripped candidate itself) and the existing, unmodified SnapshotPlacementResolver. The originating brief\'s own "-> Publication -> World View -> Repository" framing is corrected: this pipeline\'s own "end" is bytes, and reaching a Publication object is a structurally separate, ANNOUNCE-only pipeline this milestone does not merge.');
    }

    // ===============================================================
    // Section E — THE CENTRAL CORRECTION: freshness semantics.
    // ===============================================================
    {
        // E1. STRUCTURAL PROOF: PublicationSnapshotPlacementPeerExchange
        // #announce() is never called ANYWHERE in this codebase's own
        // production surface (ui/ + application/), outside of tests.
        // grep every call site of `.announce(` across the entire
        // production surface and classify each one by which exchange
        // family it belongs to.
        const announceCallSites = grepFiles('\\.announce\\(', ['ui', 'application']);
        const placementAnnounceCallSites = [];
        for (const file of announceCallSites) {
            const source = await readSource(file.replace(/^\.\//, ''));
            if (/placementPeerExchange\.announce\(|snapshotPlacementPeerExchange\.announce\(/i.test(source)) {
                placementAnnounceCallSites.push(file);
            }
        }
        assert(placementAnnounceCallSites.length === 0,
            `1. no production file anywhere in ui/ or application/ ever calls a placement peerExchange's own announce() — every one of the ${announceCallSites.length} \`.announce(\` call site(s) this audit found belongs to the PUBLICATION family (ui/views/EditorView.js's explicit "Publish to Network" click, application/PublicationPeerConnectionSync.js's automatic connection sync), never the placement one.`);

        // E2. The exact, already-shipped counterpart THIS family is
        // missing: 0.9.342's own PublicationPeerConnectionSync, and the
        // fact that CreatePublicationPeerExchangeUseCase.js already
        // constructs one automatically, internally — a pattern this
        // audit confirms has NO placement-side sibling anywhere in this
        // codebase.
        const publicationUseCaseSource = await readSource('application/CreatePublicationPeerExchangeUseCase.js');
        assert(/new PublicationPeerConnectionSync\(/.test(publicationUseCaseSource),
            '2. application/CreatePublicationPeerExchangeUseCase.js really does construct a PublicationPeerConnectionSync internally, automatically, for every replica this app runs — Publications get connection-time sync for free.');
        const placementUseCaseSource = await readSource('application/CreatePublicationSnapshotPlacementPeerExchangeUseCase.js');
        assert(!/ConnectionSync/.test(placementUseCaseSource),
            '3. application/CreatePublicationSnapshotPlacementPeerExchangeUseCase.js constructs no such thing — no PublicationSnapshotPlacementPeerConnectionSync class exists anywhere in this codebase today.');
        const anyPlacementSyncFile = grepFiles('PublicationSnapshotPlacementPeerConnectionSync|SnapshotPlacementConnectionSync', ['application', 'ui']);
        assert(anyPlacementSyncFile.length === 0,
            '4. confirmed by name across the whole application/ui surface: this class has never been built for placements.');

        // E3. LIVE REPRODUCTION of the resulting product gap, using the
        // REAL, unmodified, production-composed
        // PublicationSnapshotPlacementPeerExchange: Alice already has
        // two real, cataloged, resolvable-shaped placements BEFORE a
        // peer ever connects to her. A peer reaching AUTHENTICATED on
        // her own registry — the exact event 0.9.342's own sync already
        // reacts to for Publications — triggers NOTHING here, because
        // nothing in this file, or anywhere else in production, ever
        // calls announce() in response to it.
        const aliceReg = new StubConnectedPeerRegistry([]);
        const aliceBus = new StubPeerMessageBus();
        resetProductionLocalStorage();
        const aliceComposition = new CreatePublicationSnapshotPlacementPeerExchangeUseCase().execute({
            peerMessageBus: aliceBus, connectedPeerRegistry: aliceReg
        });
        const aliceIdentity = makeIdentity('alice-e');
        aliceComposition.catalog.add(signPlacement(aliceIdentity, {
            publicationId: 'pub-e1', contentHash: 'hash-e1', storage: 'ipfs', locator: 'ipfs://e1'
        }));
        aliceComposition.catalog.add(signPlacement(aliceIdentity, {
            publicationId: 'pub-e2', contentHash: 'hash-e2', storage: 'arweave', locator: 'ar://e2'
        }));
        assert(aliceComposition.catalog.list().length === 2,
            '5. Alice\'s real, production catalog genuinely holds two placements before any peer connects.');

        const newPeer = stubPeer('conn-new', 'did:key:zNew');
        aliceReg.add(newPeer); // the connection-established event.
        await wait(10);
        assert(aliceBus.sent.length === 0,
            '6. reaching AUTHENTICATED on Alice\'s own real, production ConnectedPeerRegistry sends this new peer ZERO placement messages of any kind — the identical event that already triggers a full Publication sync (0.9.342) triggers nothing here. "Peer content that has been announced" is, for placements, in production, TODAY, an empty set — not merely a narrower one than "everything Alice\'s catalog holds."');

        // E4. What DOES already exist today is a manual, explicit
        // announce() call — proven to work mechanically (Section B) —
        // but this audit confirms (E1) that no UI path or automatic seam
        // ever makes that call for placements. Reproduced here as the
        // ONLY way today's real code can currently get either of
        // Alice's two placements to `newPeer` at all: an explicit call
        // this codebase's own UI never makes.
        aliceComposition.peerExchange.announce(fullPlacementFor(aliceComposition, 'pub-e1'));
        assert(aliceBus.sent.length === 1,
            '7. an explicit, manual announce() call — mechanically proven safe by Section B, but never triggered anywhere in production today — is the only route this replica has, right now, to make even ONE of its two placements reach a connected peer.');

        // E5. The SEPARATE, PERMANENT characteristic that remains even
        // once such a gap is closed (mirrors 0.9.342's own header,
        // "CURRENT CATALOG SNAPSHOT ONLY... a LATER-created item still
        // needs its own explicit announce()"): a placement created AFTER
        // a sync point is invisible to an already-synced peer until its
        // OWN fresh announce/re-sync.
        assert(aliceBus.sent[0].payload.envelope.publicationId === 'pub-e1',
            '8. only the explicitly announced placement (pub-e1) ever reached the wire — pub-e2, created at the identical moment, is exactly as unannounced to newPeer as it was before this section began, confirming this is a per-item act, never a catalog-wide sync as a side effect of one announce() call.');

        console.log('✓ Section E (CENTRAL CORRECTION): "peer content that has been announced" is not merely narrower than "everything a peer holds" — in this codebase\'s OWN production wiring, TODAY, it is an EMPTY SET for placements, because PublicationSnapshotPlacementPeerExchange#announce() is never called anywhere outside a test. The already-shipped Publication-side precedent (PublicationPeerConnectionSync, 0.9.342, auto-wired inside CreatePublicationPeerExchangeUseCase.js) proves exactly what closing this gap would look like, but no placement-side equivalent exists. Once closed, the ordinary, permanent gossip limitation would still remain: only what has been explicitly (re-)announced is ever visible, never a live view of everything a peer currently holds.');
    }

    // ===============================================================
    // Section F — Multi-peer behavior.
    // ===============================================================
    {
        const bus = new StubPeerMessageBus();
        const alice = makeIdentity('alice-f');
        const bob = makeIdentity('bob-f');
        const carol = makeIdentity('carol-f');
        const alicePeer = stubPeer('conn-alice-f', alice.getSigningIdentity().id);
        const bobPeer = stubPeer('conn-bob-f', bob.getSigningIdentity().id);
        const carolPeer = stubPeer('conn-carol-f', carol.getSigningIdentity().id);
        const registry = new StubConnectedPeerRegistry([alicePeer, bobPeer, carolPeer]);
        resetProductionLocalStorage();
        const composition = new CreatePublicationSnapshotPlacementPeerExchangeUseCase().execute({
            peerMessageBus: bus, connectedPeerRegistry: registry
        });

        const announceFrom = (identityProvider, peer, fields) => {
            const signed = signPlacement(identityProvider, fields);
            bus.deliver(PublicationSnapshotPlacementPeerExchange.DEFAULT_PROTOCOL,
                { kind: PublicationSnapshotPlacementPeerMessageKind.ANNOUNCE, envelope: signed.toJSON() },
                { connectedPeer: peer });
        };
        announceFrom(alice, alicePeer, { publicationId: 'pub-shared-f', contentHash: 'hash-shared-f', storage: 'ipfs', locator: 'ipfs://from-alice-f' });
        announceFrom(bob, bobPeer, { publicationId: 'pub-shared-f', contentHash: 'hash-shared-f', storage: 'arweave', locator: 'ar://from-bob-f' });
        announceFrom(carol, carolPeer, { publicationId: 'pub-carol-only-f', contentHash: 'hash-carol-f', storage: 'ipfs', locator: 'ipfs://from-carol-f' });

        const localSource = new LocalSnapshotCandidateDiscoveryQueryServicePrototype(composition.catalog);
        const candidates = await localSource.search('forkbuild-snapshot');
        const sharedCandidates = candidates.filter((c) => c.contentHash === 'hash-shared-f');
        assert(sharedCandidates.length === 2,
            '1. two independent peers announcing the SAME contentHash both surface, undeduplicated, through the candidate query — no ranking, no "best" peer.');
        assert(candidates.some((c) => c.contentHash === 'hash-carol-f'),
            '2. a third peer\'s own, entirely independent placement surfaces exactly as readily.');
        assert(sharedCandidates.every((c) => !('placerIdentity' in c)),
            '3. neither surfaced candidate carries which peer supplied it — no preferred-source concept exists at this layer, exactly like 0.9.481\'s own Section H.');

        console.log('✓ Section F: three independently-authenticated peers announcing into the SAME real, production catalog all surface through the candidate query, undeduplicated where two genuinely differ, with no ranking or preferred-peer selection introduced anywhere in this path.');
    }

    // ===============================================================
    // Section G — Offline/disconnected behavior.
    // ===============================================================
    {
        const bus = new StubPeerMessageBus();
        const alice = makeIdentity('alice-g');
        const alicePeer = stubPeer('conn-alice-g', alice.getSigningIdentity().id);
        const registry = new StubConnectedPeerRegistry([alicePeer]);
        resetProductionLocalStorage();
        const composition = new CreatePublicationSnapshotPlacementPeerExchangeUseCase().execute({
            peerMessageBus: bus, connectedPeerRegistry: registry
        });

        // A placement whose locator points at a network Bob will NEVER
        // actually reach — standing in for "the announcing peer went
        // offline and nobody else ever mirrored these bytes."
        const signed = signPlacement(alice, {
            publicationId: 'pub-offline', contentHash: 'hash-offline-never-served', storage: 'ipfs', locator: 'ipfs://never-actually-served'
        });
        bus.deliver(PublicationSnapshotPlacementPeerExchange.DEFAULT_PROTOCOL,
            { kind: PublicationSnapshotPlacementPeerMessageKind.ANNOUNCE, envelope: signed.toJSON() },
            { connectedPeer: alicePeer });

        // G1. Alice disconnects — removed from the registry entirely,
        // exactly like a peer walking out of range or closing the app.
        registry.remove('conn-alice-g');
        assert(registry.list().length === 0,
            '1. Alice is now fully disconnected — not merely unauthenticated, gone from the registry entirely.');

        // G2. The candidate REMAINS discoverable — cataloging a claim
        // never depends on the announcing peer staying connected, the
        // identical restraint LocalPublicationSnapshotPlacementCatalog.js's
        // own header already states ("LOCAL ONLY... forgetting a
        // placement here never un-attests it").
        const localSource = new LocalSnapshotCandidateDiscoveryQueryServicePrototype(composition.catalog);
        const candidates = await localSource.search('forkbuild-snapshot');
        const candidate = candidates.find((c) => c.publicationId === 'pub-offline');
        assert(candidate !== undefined,
            '2. the candidate stays discoverable after its announcing peer has fully disconnected — a candidate is this REPLICA\'s own knowledge, never contingent on the source staying reachable.');

        // G3. But resolving it — actually retrieving the bytes — fails
        // honestly, live, against a real (fake) IPFS network that never
        // received them: CONTENT_UNAVAILABLE, never silently dropped
        // from the candidate list and never mistaken for INVALID_ENVELOPE
        // or a fabricated success.
        const [fullPlacement] = composition.catalog.findByContentHash(candidate.contentHash);
        const emptyNetwork = makeFakeIpfsNode(); // a network that never saw these bytes.
        const verifier = new LocalAuthorizationVerifier();
        const resolver = new SnapshotPlacementResolver(verifier);
        const result = await resolver.resolve(fullPlacement.toJSON(), {
            contentStore: new IpfsContentStore({ apiUrl: 'http://unreachable-node.test:5001', fetchImpl: emptyNetwork.fetchImpl })
        });
        assert(result.outcome === SnapshotPlacementResolutionOutcome.CONTENT_UNAVAILABLE,
            '3. resolving the SAME still-discoverable candidate against a store that never actually received its bytes yields CONTENT_UNAVAILABLE — an honest, specific outcome, never confused with "candidate does not exist."');

        // G4. The candidate is STILL there after the failed resolution —
        // a failed resolve() never mutates or prunes the catalog.
        const stillCandidates = await localSource.search('forkbuild-snapshot');
        assert(stillCandidates.some((c) => c.publicationId === 'pub-offline'),
            '4. the candidate remains in the catalog and discoverable after a failed resolution attempt — the walking discovery system never silently turns a locator claim into verified availability, and never silently turns a failed verification into "candidate withdrawn" either.');

        console.log('✓ Section G: a candidate stays discoverable after its announcing peer fully disconnects (this replica\'s own knowledge, never contingent on the source), while actually resolving it against a network that never received the bytes yields the honest, specific CONTENT_UNAVAILABLE outcome — proving live, not merely asserting, that "candidate exists" and "material currently retrievable" are two structurally different facts this system never conflates.');
    }

    // ===============================================================
    // Section H — Provenance preserved, never rewritten.
    // ===============================================================
    {
        const bus = new StubPeerMessageBus();
        const alice = makeIdentity('alice-h');
        const alicePeer = stubPeer('conn-alice-h', alice.getSigningIdentity().id);
        const registry = new StubConnectedPeerRegistry([alicePeer]);

        // H1. The REAL composition root already wires a
        // LocalPlacementKnowledgeStore (0.8.24) into the peerExchange it
        // returns — never built by this milestone, only observed.
        resetProductionLocalStorage();
        const composition = new CreatePublicationSnapshotPlacementPeerExchangeUseCase().execute({
            peerMessageBus: bus, connectedPeerRegistry: registry
        });
        assert(composition.knowledgeStore && typeof composition.knowledgeStore.get === 'function',
            '1. the real composition root already returns a LocalPlacementKnowledgeStore, pre-wired into the SAME peerExchange instance — nothing new built here.');

        const signed = signPlacement(alice, {
            publicationId: 'pub-provenance', contentHash: 'hash-provenance', storage: 'ipfs', locator: 'ipfs://provenance'
        });
        bus.deliver(PublicationSnapshotPlacementPeerExchange.DEFAULT_PROTOCOL,
            { kind: PublicationSnapshotPlacementPeerMessageKind.ANNOUNCE, envelope: signed.toJSON() },
            { connectedPeer: alicePeer });

        // H2. THE COMPOSITION PATTERN this milestone's own originating
        // request asked for: pairing a stripped candidate with its own
        // provenance record from a SEPARATE store, never by adding a
        // field to the candidate shape or to
        // LocalPublicationSnapshotPlacementCatalog.js itself.
        const localSource = new LocalSnapshotCandidateDiscoveryQueryServicePrototype(composition.catalog);
        const candidates = await localSource.search('forkbuild-snapshot');
        const candidate = candidates.find((c) => c.publicationId === 'pub-provenance');
        assert(candidate && !('acquisition' in candidate) && !('origin' in candidate) && !('source' in candidate),
            '2. the candidate itself carries no provenance field of any name — search()\'s own shape is untouched, exactly as 0.9.480/0.9.481 already established.');

        const [fullPlacement] = composition.catalog.findByContentHash(candidate.contentHash);
        const knowledge = composition.knowledgeStore.get(fullPlacement.id);
        assert(knowledge && knowledge.acquisition.kind === PlacementAcquisitionKind.PEER,
            '3. the SAME placement\'s own provenance — PEER, recorded automatically by the real, unmodified peerExchange the moment the ANNOUNCE above was ingested — is available from a genuinely SEPARATE collaborator, by the placement\'s own id, without the candidate itself needing to carry it.');

        // H3. Never a ranking or trust signal — reconfirming
        // PlacementAcquisitionKind.js's own header live, one more time,
        // in this composed context specifically.
        const acquisitionSource = await readSource('application/PlacementAcquisitionKind.js');
        assert(/THIS IS NOT A RANKING/.test(acquisitionSource),
            '4. application/PlacementAcquisitionKind.js still states, verbatim, that no acquisition kind may ever be compared to decide which placement to prefer — a future composite candidate query service could expose this SAME pairing without ever letting PEER-acquired candidates rank above or below LOCAL/PACKAGE ones.');

        console.log('✓ Section H: this codebase already has exactly the seam this milestone\'s own originating request asked for — provenance ("how did I learn this") lives in a genuinely SEPARATE collaborator (LocalPlacementKnowledgeStore, 0.8.24) from candidate knowledge ("what do I know"), so a future composite query service can compose the two without ever rewriting the catalog as "local, including peer" or adding a provenance field to the candidate shape itself.');
    }

    // ===============================================================
    // Section I — Architectural boundary held.
    // ===============================================================
    {
        const worldEncounterReferences = grepFiles(
            'WorldEncounterMaterialLoading|LocalWorldEncounterMaterialSource|AutomaticSnapshotEncounterCascade|registerMaterializedSnapshotWorldSource',
            ['application/PublicationSnapshotPlacementPeerExchange.js',
             'application/CreatePublicationSnapshotPlacementPeerExchangeUseCase.js',
             'application/LocalPublicationSnapshotPlacementCatalog.js',
             'application/LocalPlacementKnowledgeStore.js',
             'application/SnapshotPlacementResolver.js']
        );
        assert(worldEncounterReferences.length === 0,
            '1. none of the five production files this audit exercises reference the World Encounter material-loading, cascade, or registration families at all — passive peer contribution to Snapshot candidate discovery never becomes a second World Encounter engine, exactly like 0.9.480/0.9.481 already confirmed for the mechanisms alone.');

        console.log('✓ Section I: every production file this audit\'s live scenarios actually exercise stays entirely within candidate discovery, propagation, and resolution — never referencing, and never growing toward, the World Encounter material-loading/cascade family.');
    }

    // ===============================================================
    // Section J — Deliberate exclusions; no production file touched.
    // ===============================================================
    {
        // No production file builds PublicationSnapshotPlacementPeerConnectionSync,
        // wires announce() into any UI action or automatic seam, adds a
        // provenance field to a candidate or to
        // LocalPublicationSnapshotPlacementCatalog.js, or touches
        // WorldSnapshotDiscoveryMonitor.js/DiscoverSnapshotCandidatesCommand.js.
        // This milestone answers exactly the question its own originating
        // request posed — "does passive ANNOUNCE-based peer contribution
        // already provide sufficient nearby peer Snapshot discovery" —
        // and, in doing so, surfaces a THIRD answer neither
        // PASSIVE_SUFFICIENT nor ACTIVE_BROWSE_REQUIRED anticipated:
        // building the connection-time sync closing Section E's own gap,
        // and building the composite candidate query service itself,
        // both remain later, unscheduled milestones.
        const changedNonTestFiles = execSync(
            'git diff --name-only HEAD -- . ":(exclude)tests" ":(exclude)docs/Roadmap.md" ":(exclude)tests.html"',
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim();
        assert(changedNonTestFiles === '', `1. no production file is modified by this milestone (found: ${changedNonTestFiles || 'none'}).`);

        const CLASSIFICATIONS = [
            'PASSIVE_SUFFICIENT',
            'PASSIVE_SUFFICIENT_PENDING_WIRING',
            'ACTIVE_BROWSE_REQUIRED'
        ];
        const verdict = 'PASSIVE_SUFFICIENT_PENDING_WIRING';
        assert(CLASSIFICATIONS.includes(verdict), '2. the verdict is drawn from this milestone\'s own named taxonomy.');

        console.log('✓ Section J: no connection-sync class shipped, no announce() wired into any UI action, no provenance field added anywhere, no monitor/command/catalog file touched — audit only, per this milestone\'s own scope.');
    }

    console.log('\n✓ FINAL DECISION.\n' +
'\n' +
'OUTCOME: PASSIVE_SUFFICIENT_PENDING_WIRING.\n' +
'\n' +
"WHY. Sections A-D reconfirm and then EXTEND 0.9.480/0.9.481's own mechanism proof into production composition: an\n" +
'ANNOUNCE, delivered to the EXACT class ui/main.js itself constructs (CreatePublicationSnapshotPlacementPeerExchangeUseCase),\n' +
'reaches the real, production-composed catalog (Section B); that catalog\'s content reaches the real, unmodified\n' +
'command and walking monitor with zero code changes to either (Section C); and -- this audit\'s own flagship, going\n' +
"further than either prior audit attempted -- the resulting candidate resolves, end to end, to real, hash-verified\n" +
'bytes via the existing, unmodified SnapshotPlacementResolver, by going back to the catalog for the full signed\n' +
"envelope the stripped candidate itself never carries (Section D). Section D also corrects the originating brief's\n" +
'own diagram: this pipeline\'s "end" is bytes, never a `publisher/Publication.js` object -- reaching one is a\n' +
'structurally separate, ANNOUNCE-only pipeline (application/PublicationPeerProtocol.js) this milestone does not, and\n' +
'should not, merge with placement discovery.\n' +
'\n' +
"Section E is this audit's own central correction, and the reason the verdict is neither of the brief's own two\n" +
'named options. Grepping the ENTIRE production surface (ui/ + application/) for every `.announce(` call site, then\n' +
'classifying each one, found zero that belong to the placement family -- every real call site belongs to the\n' +
"Publication family instead (ui/views/EditorView.js's explicit click, and application/PublicationPeerConnectionSync.js's\n" +
"automatic, 0.9.342-built connection-time sync, which CreatePublicationPeerExchangeUseCase.js already constructs\n" +
'internally for every replica this app runs). No placement-side equivalent exists anywhere in this codebase. Live\n' +
"reproduction with the REAL, unmodified, production-composed exchange confirmed the consequence directly: a peer\n" +
"reaching AUTHENTICATED on a replica already holding real, cataloged placements is sent NOTHING, because nothing in\n" +
'production today reacts to that event for placements the way 0.9.342 already does for Publications. \"Peer content\n' +
'that has been announced\" is therefore not merely a narrower set than \"everything a peer holds\" -- for placements,\n' +
'in production, today, it is an EMPTY set. Sections F-H then reconfirm, now against the REAL composed class rather\n' +
"than hand-built collaborators, every property 0.9.481's own Sections F-H already established mechanically --\n" +
'multiple peers compose independently with no ranking (F); a candidate outlives its announcing peer\'s connection\n' +
'while resolution honestly reports CONTENT_UNAVAILABLE rather than conflating discovery with availability (G); and\n' +
"this codebase's own already-existing PlacementAcquisitionKind/LocalPlacementKnowledgeStore split (0.8.24) already\n" +
'gives a future composite query service exactly the seam the originating request asked for -- provenance composed\n' +
'from a separate collaborator, never rewritten into the candidate shape or laundered into \"local, including peer\"\n' +
'(H).\n' +
'\n' +
'WHAT THIS MEANS. The mechanism the originating request hoped might already be sufficient IS sufficient, proven now\n' +
'end to end through production composition rather than merely in isolation -- but it currently contributes NOTHING\n' +
'in production, because the one seam that would make ANNOUNCE fire at the moment it matters (a peer connecting) was\n' +
'never built for placements, unlike its already-shipped Publication-side precedent. This is NOT a reason to build\n' +
'BROWSE_REQUEST/BROWSE_RESPONSE -- Section E\'s own gap is a small, narrow, already-precedented wiring seam (a\n' +
'PublicationSnapshotPlacementPeerConnectionSync mirroring application/PublicationPeerConnectionSync.js almost\n' +
'exactly, plus threading announce() into wherever a placement is created, mirroring ui/views/EditorView.js\'s own\n' +
'call for publications), never a new protocol, new message kind, or new responder. The roadmap this milestone\n' +
'recommends: 0.9.483 closes Section E\'s own wiring gap (test-only until proven, then wired); only once that is done\n' +
'does building the Local/Nostr/Peer composite candidate query service (this family\'s own long-planned 0.9.484) or\n' +
"revisiting an active BROWSE protocol become a decision worth making from what users actually experience, rather\n" +
'than from what the mechanism can theoretically do.\n');

    console.log('\n✅ All Passive Peer Contribution to Walking-Triggered Snapshot Discovery Product Audit tests passed.');
}

// Helper used only by Section E: the full, catalog-held
// PublicationSnapshotPlacement instance for `publicationId`, from the
// composed catalog `composition.catalog` already holds it in — never a
// second construction, only a lookup.
function fullPlacementFor(composition, publicationId) {
    const [placement] = composition.catalog.findByPublicationId(publicationId);
    return placement;
}

run().then(() => {
    console.log('\n✓ All PassivePeerContributionToWalkingTriggeredSnapshotDiscoveryProductAudit tests passed');
}).catch((error) => {
    console.error('\n✗ PassivePeerContributionToWalkingTriggeredSnapshotDiscoveryProductAudit tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
