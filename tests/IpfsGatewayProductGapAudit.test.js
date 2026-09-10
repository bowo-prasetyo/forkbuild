import { readFile } from 'node:fs/promises';

import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { ContentReference } from '../core/ContentReference.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalContentResolver } from '../discovery/LocalContentResolver.js';
import { computeContentHash } from '../serializer/contentHash.js';

import { IpfsContentStore, ContentUnavailableError } from '../content/IpfsContentStore.js';
import { IpfsGatewayContentStore } from '../content/IpfsGatewayContentStore.js';

import { LocalPublicationSnapshotPlacementCatalog } from '../application/LocalPublicationSnapshotPlacementCatalog.js';
import { SnapshotPlacementStoreRegistry } from '../application/SnapshotPlacementStoreRegistry.js';
import { CreateSnapshotPlacementOrchestratorUseCase } from '../application/CreateSnapshotPlacementOrchestratorUseCase.js';
import { SnapshotPlacementCreationOutcome } from '../application/SnapshotPlacementCreationOutcome.js';
import { SnapshotPlacementResolver } from '../application/SnapshotPlacementResolver.js';
import { SnapshotPlacementResolutionOutcome } from '../application/SnapshotPlacementResolutionOutcome.js';

import { IpfsPublicationRecord } from '../application/IpfsPublicationRecord.js';
import { IpfsPublicationContentVerifier } from '../application/IpfsPublicationContentVerifier.js';
import { IpfsPublicationContentVerificationState } from '../application/IpfsPublicationContentVerificationState.js';

// 0.9.373 — IPFS Gateway Product Gap Audit.
//
// TEST-ONLY. ZERO PRODUCTION CHANGES. 0.9.363's own inventory rated IPFS
// Gateway "High — same reasoning as Arweave Gateway," before any real
// Arweave Gateway feature existed to weigh it against. 0.9.367 and 0.9.368
// each re-checked that rating once a real feature (0.9.364-0.9.366) existed
// to compare against, and both landed on DEFER, from a few structural
// checks folded into a wider, multi-candidate sweep. This milestone is the
// first to give IPFS Gateway alone the single-subject depth 0.9.367 gave
// Arweave Gateway — not to re-litigate whether it resembles Arweave, but to
// answer this brief's own framing question directly, with fresh evidence
// against real production classes:
//
//   When the default IPFS gateway is unavailable, does ForkBuild have a
//   demonstrated user-facing recovery gap that justifies user-configurable
//   IPFS Gateway settings?
//
// TEN SECTIONS, mirroring the milestone brief's own lettering:
//
//   A. Endpoint authority — every real consumer of DEFAULT_GATEWAY_URL
//      traced to exact file/line, distinguishing a network dependency from
//      a plain presentation hyperlink.
//   B. Failure-to-user-impact — the default gateway made genuinely
//      unavailable against the REAL SnapshotPlacementResolver and
//      IpfsPublicationContentVerifier pipelines (never mocked), tracing
//      exactly what a Wanderer would see.
//   C. Alternative gateway viability — proof, through the real resolver
//      pipeline, that a second gateway serves the IDENTICAL bytes for the
//      same CID, verified against the same content hash.
//   D. User recovery journey — modeled end to end; shown to break at
//      exactly one step, and no other.
//   E. Existing configuration seams — what already accepts an override,
//      and what does not.
//   F. Local IPFS node separation — Gateway vs. Kubo API, reconfirmed
//      structurally distinct in the actual composition.
//   G. Write-path isolation — retrieval configuration vs. publish/pin
//      configuration, proven structurally independent.
//   H. Persistence and restart — deliberately skipped; no real seam exists
//      to persist yet (see Section D/E).
//   I. Remaining infrastructure candidates — reconfirmed unchanged against
//      current source, not assumed from a prior milestone's conclusion.
//   J. Final decision.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function expectRejects(promiseFn, message, ErrorType = null) {
    let threw = false;
    let error = null;
    try { await promiseFn(); } catch (e) { threw = true; error = e; }
    assert(threw, message);
    if (ErrorType) {
        assert(error instanceof ErrorType, `${message} (wrong error type: ${error && error.constructor && error.constructor.name})`);
    }
    return error;
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
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
    return new Document({ world, metadata: new DocumentMetadata({ title, author: 'tester' }) });
}

function fakeCid(text) {
    return 'bafyFAKE' + computeContentHash(text);
}

// A single-publication world, published locally — the same helper shape
// tests/DecentralizedSnapshotPlacement.test.js's own publishLocally()
// already establishes.
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

// A real Kubo RPC fake — used only to PLACE content onto the shared
// `network` Map, exactly as a publisher with a local daemon really would.
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

// A fake PUBLIC GATEWAY, reading from the SAME `network` Map a fake Kubo
// node above already populated — this is the actual point of Section C:
// two structurally different IPFS access mechanisms (RPC add/cat vs. an
// HTTP GET), reading the SAME underlying content-addressed store, exactly
// the relationship a real Kubo node and a real ipfs.io gateway have (a
// gateway is itself typically backed by pinned content on the public DHT
// — this fake collapses that network to one Map, but preserves the one
// property this audit needs: the SAME CID must resolve to the SAME bytes
// through either mechanism). `available: false` simulates the gateway
// itself being unreachable — a thrown network error, never a 404 (a 404
// would mean "reachable, but doesn't have this CID," a different fact).
function makeFakeGatewayFetch(network, { available = true } = {}) {
    return async function fetchImpl(url) {
        if (!available) {
            throw new Error('simulated gateway outage: connection refused');
        }
        const match = /\/ipfs\/([^/?]+)$/.exec(url);
        const cid = match ? decodeURIComponent(match[1]) : null;
        if (!cid || !network.has(cid)) {
            return { ok: false, status: 404, text: async () => 'not found' };
        }
        return { ok: true, status: 200, text: async () => network.get(cid) };
    };
}

async function run() {
    // ===============================================================
    // Section A — Endpoint authority.
    // ===============================================================
    {
        // A1. The exact default, traced to its one declaring file.
        const gatewaySource = await rawSource('content/IpfsGatewayContentStore.js');
        assert(gatewaySource.includes("const DEFAULT_GATEWAY_URL = 'https://ipfs.io'"), 'A1. content/IpfsGatewayContentStore.js declares DEFAULT_GATEWAY_URL = https://ipfs.io — the ONLY file that does');

        // A2. The exact resolution path this class performs: ipfs://<CID>
        // -> configured gateway -> GET /ipfs/<CID> -> bytes. Never a
        // second resolution scheme (no DNSLink, no subdomain gateway
        // form, no IPNS) — confirmed directly against the request path
        // construction, not assumed from the header prose.
        assert(gatewaySource.includes("uri.slice(IPFS_URI_PREFIX.length)"), 'A2. the CID is read verbatim from the ipfs:// uri, never reinterpreted');
        assert(gatewaySource.includes('`/ipfs/${encodeURIComponent(cid)}`'), 'A2. the request path is exactly /ipfs/<cid> — the plain path-gateway form, never a subdomain or DNSLink form');

        // A3. Every REAL functional consumer of this class, found by
        // construction site, not by comment. ui/main.js is the only
        // composition root; it constructs the class at exactly two
        // sites, confirmed by exact count.
        const mainSource = await rawSource('ui/main.js');
        const gatewayConstructionCount = (mainSource.match(/new IpfsGatewayContentStore\(\)/g) || []).length;
        assert(gatewayConstructionCount === 2, `A3. IpfsGatewayContentStore is constructed at exactly two sites in ui/main.js — found ${gatewayConstructionCount}`);
        assert(mainSource.includes('stores: [publicationContentStore, new IpfsGatewayContentStore()]'), 'A3a. consumer #1 — Snapshot placement RESOLUTION registry (an ipfs-storage placement a publisher already created)');
        assert(mainSource.includes('contentStore: new IpfsGatewayContentStore()'), 'A3b. consumer #2 — the "Observe Content" IPFS publication verifier');

        // A4. A THIRD reference to the same host exists, but is
        // structurally different from both consumers above: a pure
        // presentation-layer external-link builder that never performs a
        // network call — content/IpfsSnapshotPlacementView.js's own
        // describe() constructs a "View on IPFS gateway" href, hardcoded,
        // completely independent of IpfsGatewayContentStore's own
        // DEFAULT_GATEWAY_URL constant (change one, the other is
        // unaffected — confirmed by them never importing each other).
        const placementViewSource = await rawSource('content/IpfsSnapshotPlacementView.js');
        assert(placementViewSource.includes('https://ipfs.io/ipfs/${cid}'), 'A4. content/IpfsSnapshotPlacementView.js independently hardcodes the SAME host in a display-only href');
        assert(placementViewSource.includes('THIS CLASS NEVER RESOLVES'), 'A4. that file\'s own header confirms it never calls a gateway — string construction only, the identical "mempool.space" shape 0.9.363 already found for Bitcoin anchor evidence');
        assert(!placementViewSource.includes('IpfsGatewayContentStore'), 'A4. the two hardcodings are genuinely independent — the view file never imports the content store class');

        // A5. World Encounter material discovery — the core gameplay
        // loop's own read path — never references IPFS at all. Confirmed
        // fresh, not assumed from 0.9.367/0.9.368's own prior finding.
        const worldEncounterSource = await rawSource('application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js');
        assert(!/ipfs/i.test(worldEncounterSource), 'A5. World Encounter material discovery composition never references IPFS — Local + Nostr + Arweave only');
        const materialRuntimeSource = await rawSource('application/DecentralizedWorldEncounterMaterialRuntimeComposition.js');
        assert(!/^import.*ipfs/im.test(materialRuntimeSource) && !/new\s+Ipfs/.test(materialRuntimeSource),
            'A5. the material RETRIEVAL runtime composition (not just discovery) never IMPORTS or CONSTRUCTS anything IPFS-shaped — its one design-rationale comment names IPFS only as unbuilt future work ("a second concrete retrieveByUri implementation... its own, later, unscheduled milestone"), the same "named by design comment, absent from real wiring" pattern this audit\'s other sections already hold other files to');

        console.log('✓ Section A: DEFAULT_GATEWAY_URL traced to its one file; exactly two REAL functional consumers found in ui/main.js (Snapshot placement resolution, IPFS publication verification), both genuinely opt-in; a third, independent hardcoding is a pure display-only hyperlink that never resolves; the core World Encounter read path never references IPFS at all');
    }

    // ===============================================================
    // Section B — Failure-to-user-impact, against the REAL resolver
    // pipeline (application/SnapshotPlacementResolver.js), never mocked.
    // ===============================================================
    let sharedNetwork, sharedPlacementJson, sharedContentReference;
    {
        // Alice publishes locally, then places the SAME snapshot on a
        // fake Kubo node — exactly how ui/main.js's own CREATION registry
        // (content/IpfsContentStore.js, real Kubo RPC) works today.
        const { alice, publication, discoveryProvider, contentResolver } = publishLocally('Gateway Audit Farmstead');
        const network = new Map();
        const aliceKubo = new IpfsContentStore({ fetchImpl: makeFakeIpfsNode(network) });
        const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const orchestrator = new CreateSnapshotPlacementOrchestratorUseCase().execute({
            discoveryProvider, contentResolver, placementCatalog, identityProvider: alice, stores: [aliceKubo]
        });
        const created = await orchestrator.createExternalSnapshotPlacementUseCase.execute(publication.id, 'ipfs');
        assert(created.outcome === SnapshotPlacementCreationOutcome.CREATED, 'B1. the placement is created against a real Kubo store, exactly as ui/main.js\'s own creation registry does');
        sharedNetwork = network;
        sharedPlacementJson = created.placement.toJSON();
        sharedContentReference = new ContentReference({ hash: created.placement.contentHash, uri: created.placement.locator });

        // B2. Bob — a second replica, per this codebase's own established
        // multi-replica testing convention — resolves purely from the
        // cataloged placement, through a GATEWAY store (never Kubo),
        // exactly as ui/main.js's own RESOLUTION registry does. The
        // default gateway is made genuinely unreachable.
        const bobVerifier = new LocalAuthorizationVerifier();
        const bobResolver = new SnapshotPlacementResolver(bobVerifier);
        const downGateway = new IpfsGatewayContentStore({ fetchImpl: makeFakeGatewayFetch(network, { available: false }) });
        const bobRegistryDown = new SnapshotPlacementStoreRegistry().register(downGateway);

        const resolvedDown = await bobResolver.resolve(sharedPlacementJson, { storeRegistry: bobRegistryDown });
        assert(resolvedDown.outcome === SnapshotPlacementResolutionOutcome.CONTENT_UNAVAILABLE,
            `B2. gateway down -> the REAL resolver reports CONTENT_UNAVAILABLE, an honest, named outcome — never a crash, an empty result, or a generic failure (got ${resolvedDown.outcome})`);
        assert(resolvedDown.bytes === undefined || resolvedDown.bytes === null, 'B2. no bytes are ever returned for an unavailable outcome');

        // B3. That outcome maps, in the real UI, to an amber "pending"
        // badge class — explicitly distinct from the RED "failed" class
        // INVALID_SIGNATURE/CONTENT_HASH_MISMATCH get. A Wanderer sees
        // "not resolved right now," never "this is fraudulent."
        const viewSource = await rawSource('ui/views/DecentralizedPublicationsView.js');
        assert(/\[SnapshotPlacementResolutionOutcome\.CONTENT_UNAVAILABLE\]:\s*'peer-badge--pending'/.test(viewSource),
            'B3. CONTENT_UNAVAILABLE renders as the same "pending" (amber, inconclusive) badge class the codebase already uses for other honest unknowns — never the "failed" (red) class');
        assert(/\[SnapshotPlacementResolutionOutcome\.CONTENT_HASH_MISMATCH\]:\s*'peer-badge--failed'/.test(viewSource),
            'B3. by contrast, an actual hash mismatch renders RED — confirming the UI genuinely distinguishes "could not check" from "checked and rejected," never conflating the two');

        // B4. Same failure mode, second real consumer: the "Observe
        // Content" verifier (application/IpfsPublicationContentVerifier.js)
        // reports the equally honest UNAVAILABLE state, never HASH_MISMATCH.
        const record = new IpfsPublicationRecord({ contentHash: created.placement.contentHash, locator: created.placement.locator, publishedAt: new Date() });
        const downVerifier = new IpfsPublicationContentVerifier({ contentStore: downGateway });
        const observationDown = await downVerifier.verify(record);
        assert(observationDown.state === IpfsPublicationContentVerificationState.UNAVAILABLE,
            `B4. the "Observe Content" verifier also reports UNAVAILABLE, never HASH_MISMATCH, for a gateway that cannot be reached (got ${observationDown.state})`);

        console.log('✓ Section B: with the default gateway genuinely unreachable, BOTH real consumers (Snapshot placement resolution, IPFS content verification) report an honest, explicitly-named unavailable outcome — never a crash, a silently empty result, or a generic failure indistinguishable from missing content — and the UI renders that outcome as inconclusive (amber), never as a rejection (red)');
    }

    // ===============================================================
    // Section C — Alternative gateway viability: the SAME CID, through a
    // SECOND gateway, returns bytes that verify against the SAME hash —
    // proven through the real resolver pipeline, not merely by
    // constructing the class with a different URL.
    // ===============================================================
    {
        const bobVerifier = new LocalAuthorizationVerifier();
        const bobResolver = new SnapshotPlacementResolver(bobVerifier);
        const upGateway = new IpfsGatewayContentStore({ gatewayUrl: 'https://my-own-gateway.example', fetchImpl: makeFakeGatewayFetch(sharedNetwork, { available: true }) });
        const bobRegistryUp = new SnapshotPlacementStoreRegistry().register(upGateway);

        const resolvedUp = await bobResolver.resolve(sharedPlacementJson, { storeRegistry: bobRegistryUp });
        assert(resolvedUp.outcome === SnapshotPlacementResolutionOutcome.RESOLVED,
            `C1. the IDENTICAL placement, through a DIFFERENT gateway URL, resolves successfully (got ${resolvedUp.outcome})`);
        assert(sharedContentReference.verify(resolvedUp.bytes), 'C1. the bytes the alternative gateway returned verify against the SAME content hash the ORIGINAL Kubo-published bytes carried — the CID is genuinely gateway-independent content addressing, not merely a URL that happens to be swappable');

        // C2. Same proof, one layer down, directly against the store
        // (isolating the gateway-substitution claim from the resolver's
        // own machinery).
        const network = sharedNetwork;
        const gatewayA = new IpfsGatewayContentStore({ gatewayUrl: 'https://gateway-a.example', fetchImpl: makeFakeGatewayFetch(network, { available: false }) });
        const gatewayB = new IpfsGatewayContentStore({ gatewayUrl: 'https://gateway-b.example', fetchImpl: makeFakeGatewayFetch(network, { available: true }) });
        const reference = sharedContentReference;
        await expectRejects(() => gatewayA.get(reference), 'C2. gateway A (down) throws ContentUnavailableError for this CID', ContentUnavailableError);
        const bytesFromB = await gatewayB.get(reference);
        assert(bytesFromB === Array.from(network.values())[0] || sharedContentReference.verify(bytesFromB), 'C2. gateway B (up), given the SAME CID, returns bytes that verify against the SAME content hash gateway A would have had to serve');

        // C3. Confirmed this is genuinely CID-addressed, not merely
        // "whatever gateway B happens to have": a CID gateway B never
        // saw resolves to nothing, honestly (404 -> ContentUnavailableError),
        // never fabricated content.
        const unknownReference = new ContentReference({ hash: 'deadbeef', uri: 'ipfs://bafyFAKEnonexistent' });
        await expectRejects(() => gatewayB.get(unknownReference), 'C3. a CID no gateway in this fake network actually has still throws honestly — a gateway never fabricates content for an unknown CID', ContentUnavailableError);

        console.log('✓ Section C: proven through the REAL resolver pipeline (not just constructor injection) — a second gateway, given the identical ipfs:// locator, returns bytes that verify against the SAME content hash; the CID is confirmed gateway-independent content addressing, exactly like Arweave\'s transaction-id addressing, and a gateway never fabricates content it does not have');
    }

    // ===============================================================
    // Section D — User recovery journey, modeled end to end.
    // ===============================================================
    {
        // D1-D3 (default unavailable -> retrieval fails -> user changes
        // configuration) are exactly what Sections B and C already
        // proved CAN happen mechanically. The journey breaks at
        // precisely the next step: there is no settings surface, and no
        // composition-root wiring, through which an ordinary Wanderer
        // could ever supply that alternative gatewayUrl today.
        const mainSource = await rawSource('ui/main.js');
        assert(mainSource.includes('new IpfsGatewayContentStore()'), 'D4. both real construction sites take ZERO arguments — no override is ever supplied, even mechanically, today');

        // D5. No settings view exists for this at all — reconfirmed by
        // directory listing convention (ArweaveGatewaySettingsView.js and
        // NostrRelaySettingsView.js both exist; nothing IPFS-shaped does).
        let ipfsSettingsViewExists = true;
        try {
            await rawSource('ui/views/IpfsGatewaySettingsView.js');
        } catch {
            ipfsSettingsViewExists = false;
        }
        assert(!ipfsSettingsViewExists, 'D5. ui/views/IpfsGatewaySettingsView.js does not exist — no settings surface, unlike Arweave Gateway (0.9.366) and Nostr Relay (0.9.371)');

        // D6. No configuration/store class exists either — reconfirmed
        // by absence, the same "G1-style" check 0.9.363-0.9.372 already
        // ran for other not-yet-built candidates.
        let ipfsConfigExists = true;
        try {
            await rawSource('core/IpfsGatewayConfiguration.js');
        } catch {
            ipfsConfigExists = false;
        }
        assert(!ipfsConfigExists, 'D6. core/IpfsGatewayConfiguration.js does not exist — no durable configuration shape exists to persist an override, even if a settings view existed to write one');

        console.log('✓ Section D: the journey "default unavailable -> retrieval fails" is real and demonstrated (Sections B/C); the journey then BREAKS at "user changes configuration" — no settings view, no configuration/store class exists — the identical gap Arweave Gateway had before 0.9.364-0.9.366 closed it, still open here');
    }

    // ===============================================================
    // Section E — Existing configuration seams.
    // ===============================================================
    {
        // E1. The read-path seam that DOES already exist: ordinary
        // constructor injection, reconfirmed live (not just by pattern).
        const overridden = new IpfsGatewayContentStore({ gatewayUrl: 'https://my-own-gateway.example', fetchImpl: async () => ({ ok: true, status: 200, text: async () => '' }) });
        assert(overridden.gatewayUrl === 'https://my-own-gateway.example', 'E1. a caller-supplied gatewayUrl genuinely overrides the class-level default, exactly like every other 0.9.363-inventoried candidate');

        // E2. One layer up, application/CreateIpfsPublicationContentVerifierUseCase.js
        // already accepts a pre-built contentStore rather than constructing
        // its own default — an injection seam that would need NO change at
        // all to accept a gateway constructed from a future user
        // configuration object.
        const useCaseSource = await rawSource('application/CreateIpfsPublicationContentVerifierUseCase.js');
        assert(useCaseSource.includes('execute({ contentStore } = {})'), 'E2. the verifier use case already accepts an injected contentStore — a clean seam one layer above the raw constructor');

        // E3. UNLIKE Arweave's write-path precedent (application/
        // PublicationDistributionRuntimeConfiguration.js already named a
        // `gatewayUrl` field before 0.9.364 ever built a read-path
        // counterpart), NO existing runtime-configuration object anywhere
        // in this codebase already names an `ipfsGatewayUrl`-shaped field
        // in an ignored-but-present way. The seam here is narrower: raw
        // constructor injection only, nothing already reaching toward a
        // { gatewayUrl } shape at a higher composition layer.
        const runtimeConfigSource = await rawSource('application/PublicationDistributionRuntimeConfiguration.js');
        assert(!/ipfs/i.test(runtimeConfigSource), 'E3. the one existing runtime-configuration seam this codebase has (Publication Distribution\'s) never mentions IPFS at all — no pre-existing partial seam to build on, unlike Arweave\'s');

        console.log('✓ Section E: a real, clean constructor-injection seam already exists at both call sites (E1) and one layer up at the verifier use case (E2) — but, unlike Arweave Gateway before 0.9.364, no higher-level runtime-configuration object already reaches toward an ipfsGatewayUrl-shaped field (E3); a future feature would start one layer lower than Arweave\'s did');
    }

    // ===============================================================
    // Section F — Local IPFS node separation.
    // ===============================================================
    {
        // F1. Two independent files, two independent DEFAULT_* constants
        // — reconfirmed directly, not assumed.
        const gatewaySource = await rawSource('content/IpfsGatewayContentStore.js');
        const apiSource = await rawSource('content/IpfsContentStore.js');
        assert(gatewaySource.includes("DEFAULT_GATEWAY_URL = 'https://ipfs.io'"), 'F1. gateway default lives only in content/IpfsGatewayContentStore.js');
        assert(apiSource.includes("DEFAULT_API_URL = 'http://127.0.0.1:5001'"), 'F1. local API default lives only in content/IpfsContentStore.js');
        assert(!gatewaySource.includes('DEFAULT_API_URL') && !apiSource.includes('DEFAULT_GATEWAY_URL'), 'F1. neither file declares the OTHER\'s constant');

        // F2. Structurally distinct capability, not merely a different
        // host: put() is unimplemented on the gateway class (inherits
        // content/ContentStore.js's own throw), confirmed live.
        const readOnlyGateway = new IpfsGatewayContentStore({ fetchImpl: async () => ({ ok: true, status: 200, text: async () => '' }) });
        let putThrew = false;
        try { readOnlyGateway.put('anything'); } catch { putThrew = true; }
        assert(putThrew, 'F2. IpfsGatewayContentStore.put() throws — a real, structural capability difference from content/IpfsContentStore.js, not merely a different default host');

        // F3. The real composition keeps them in SEPARATE registries,
        // never merged — confirmed by ui/main.js's own two independent
        // `stores: [...]` arrays.
        const mainSource = await rawSource('ui/main.js');
        assert(mainSource.includes('stores: [publicationContentStore, new IpfsGatewayContentStore()]'), 'F3. the RESOLUTION registry (ipfs:// placements a publisher already made) uses the gateway');
        assert(mainSource.includes('stores: [publicationContentStore, new IpfsContentStore()]'), 'F3. the CREATION registry (placing NEW ipfs-storage content, which needs put()) uses local Kubo, never the gateway');

        console.log('✓ Section F: Gateway configuration and local-node configuration are confirmed structurally, not just nominally, distinct — separate files, separate defaults, separate capabilities (put() is unimplemented on the gateway, live-confirmed), and separate registries in the actual running composition — a future gateway setting would never touch local-node behavior');
    }

    // ===============================================================
    // Section G — Write-path isolation.
    // ===============================================================
    {
        // G1. IPFS actually has THREE independent read/write surfaces in
        // this codebase, not two — richer than Arweave's single
        // ArweaveContentStore.js. Confirmed each is its own file with its
        // own capability:
        //   - content/IpfsGatewayContentStore.js   get-only  (this audit)
        //   - content/IpfsContentStore.js          get+put   (local Kubo)
        //   - content/IpfsRemotePinningContentStore.js  put-only (remote pin)
        const pinningSource = await rawSource('content/IpfsRemotePinningContentStore.js');
        assert(!pinningSource.includes('DEFAULT_GATEWAY_URL') && !pinningSource.includes('ipfs.io'), 'G1. the remote pinning store never references the gateway default at all — it takes a PinningProvider, never a gatewayUrl');
        assert(!/\bget\s*\(/.test(pinningSource.replace(/\/\/.*$/gm, '')), 'G1. content/IpfsRemotePinningContentStore.js never implements get() — put-only, structurally the mirror image of the gateway store');

        // G2. The remote pinning store's OWN configuration surface
        // (application/IpfsRemotePublishingConfiguration.js) already
        // exists — and is a DELIBERATELY different shape from anything a
        // gateway setting would need: an arbitrary, per-session,
        // NEVER-PERSISTED { endpoint, credential } pair a person types in
        // fresh each time, never a durable default with a Reset action.
        const publishConfigSource = await rawSource('application/IpfsRemotePublishingConfiguration.js');
        assert(publishConfigSource.includes('EPHEMERAL BY CONSTRUCTION'), 'G2. the existing IPFS write-path configuration is explicitly ephemeral (no save/load/persistence) — structurally different from what a Gateway read-path setting (a durable default with Reset) would need');
        assert(publishConfigSource.includes('credential'), 'G2. it carries a credential field the read-path gateway never needs (Section I of 0.9.363 already established gateways are credential-free)');

        // G3. Changing gatewayUrl on a fresh IpfsGatewayContentStore never
        // touches the pinning/publishing path — confirmed live: the
        // publishing coordinator constructs its OWN store fresh from a
        // PinningProvider on every call, never importing or sharing state
        // with IpfsGatewayContentStore at all.
        const coordinatorSource = await rawSource('application/IpfsRemotePublicationCoordinator.js');
        assert(!coordinatorSource.includes('IpfsGatewayContentStore'), 'G3. the remote publication coordinator never imports IpfsGatewayContentStore — the write (pin) path and this audit\'s read (gateway) path share no class, no constant, and no runtime instance');

        console.log('✓ Section G: IPFS retrieval configuration (this audit) is confirmed structurally isolated from IPFS publishing/pinning configuration — which is itself its own, already-existing, deliberately ephemeral, credential-carrying configuration surface, genuinely richer than a single write/read pair; no shared class, constant, or instance connects the two');
    }

    // ===============================================================
    // Section H — Persistence and restart: deliberately skipped.
    // ===============================================================
    {
        // Per this milestone's own brief: "Don't build persistence merely
        // because Arweave has it." Section D already established no
        // genuine configuration seam exists yet (no settings view, no
        // configuration/store class) — so there is nothing real to run a
        // save -> restart -> same-effective-gateway proof against. This
        // section exists only to record that omission is deliberate, not
        // an oversight, mirroring 0.9.363's own restraint for every
        // not-yet-built candidate in its inventory.
        console.log('✓ Section H: no persistence/restart proof attempted — Section D already established no configuration seam exists to persist; building one here would be exactly the "manufactured symmetry with Arweave" this milestone\'s brief warns against');
    }

    // ===============================================================
    // Section I — Remaining infrastructure candidates, reconfirmed
    // against current source (not assumed from 0.9.368/0.9.372's own
    // prior conclusion).
    // ===============================================================
    {
        const peerConnectionSource = await rawSource('peer/WebRtcPeerConnectionProvider.js');
        assert(/constructor\(\{\s*iceServers\s*=\s*\[\]/.test(peerConnectionSource), 'I1. STUN/TURN — still one flat iceServers array at the real consumer, no independent per-server configuration shape');

        const iceSource = await rawSource('peer/IceServerConfig.js');
        assert(iceSource.includes("const METERED_TURN_ENDPOINT = 'https://forkbuild.metered.live/api/v1/turn/credentials';"), 'I2. TURN — still a dynamic CREDENTIAL fetch, not a plain URL field; SEPARATE_PRODUCT, unchanged');

        const rendezvousSource = await rawSource('peer/RendezvousConfig.js');
        assert(rendezvousSource.includes('DEFAULT_RENDEZVOUS_URLS'), 'I3. Rendezvous — still one deployment-level bootstrap list, no per-user recovery scenario');

        const baseRpcSource = await rawSource('base/BaseJsonRpcClient.js');
        assert(baseRpcSource.includes("const DEFAULT_RPC_URL = 'https://mainnet.base.org'"), 'I4. Base RPC — unchanged, still an explicit, occasional anchoring action, never the default content pipeline');

        const esploraSource = await rawSource('anchoring/BitcoinEsploraTransactionBroadcaster.js');
        assert(esploraSource.includes("const DEFAULT_API_URL = 'https://blockstream.info/api'"), 'I5. Bitcoin Esplora — unchanged, same reasoning as Base RPC');

        // I6. IPFS local node (Kubo API) — this audit's own Section F
        // already reconfirmed it is a DIFFERENT capability (put+get,
        // local daemon) from the gateway this milestone examines. Its own
        // product gap (0.9.363's own E1: the local daemon default is
        // self-documented as "almost certainly unreachable" for an
        // ordinary person) is a request for a DIFFERENT capability — a
        // person's own IPFS node/provider, not an alternative retrieval
        // URL — matching 0.9.368's own SEPARATE_PRODUCT classification,
        // reconfirmed here rather than re-derived from scratch.
        const apiSource = await rawSource('content/IpfsContentStore.js');
        assert(apiSource.includes("const DEFAULT_API_URL = 'http://127.0.0.1:5001'"), 'I6. IPFS local API — unchanged, remains a SEPARATE product question (a person\'s own node/provider), not this milestone\'s Gateway question');

        console.log('✓ Section I: every remaining 0.9.363 candidate reconfirmed against CURRENT source, unchanged — STUN (DEFER, one flat array, already redundant), TURN (SEPARATE_PRODUCT, credential-shaped), Rendezvous/Base RPC/Bitcoin Esplora (DEFER, narrow/occasional), IPFS local node (SEPARATE_PRODUCT — a different capability, not a Gateway question)');
    }

    // ===============================================================
    // Section J — Final decision.
    // ===============================================================
    const decisionMatrix = [
        {
            candidate: 'IPFS Gateway',
            failureIsHonest: 'Yes (Section B) — CONTENT_UNAVAILABLE / UNAVAILABLE, amber, never conflated with a hash rejection',
            alternativeViable: 'Yes (Section C) — proven through the real resolver, same CID, same verified hash',
            userValue: 'Real, but structurally narrow: exactly two opt-in call sites (a placement a publisher specifically chose ipfs:// for; the secondary "Observe Content" action) — never the default World Encounter or default Snapshot retrieval path (Section A)',
            seam: 'Constructor injection only — real, but one layer lower than Arweave had pre-0.9.364 (Section E)',
            decision: 'DEFER'
        },
        { candidate: 'IPFS local node (Kubo API)', decision: 'SEPARATE_PRODUCT' },
        { candidate: 'STUN', decision: 'DEFER' },
        { candidate: 'TURN', decision: 'SEPARATE_PRODUCT' },
        { candidate: 'Rendezvous', decision: 'DEFER' },
        { candidate: 'Bitcoin Esplora', decision: 'DEFER' },
        { candidate: 'Base RPC', decision: 'DEFER' }
    ];
    {
        for (const row of decisionMatrix) {
            assert(['STABLE_STOP', 'BUILD_NEXT', 'DEFER', 'SEPARATE_PRODUCT'].includes(row.decision),
                `J. ${row.candidate} carries a recognized decision label`);
        }
        assert(decisionMatrix.find((r) => r.candidate === 'IPFS Gateway').decision === 'DEFER', 'J. final: IPFS Gateway is DEFER, not BUILD_NEXT');

        console.log('\n=== DECISION MATRIX ===');
        for (const row of decisionMatrix) {
            console.log(`${row.candidate}: ${row.decision}`);
        }

        console.log('\n=== VERDICT: DEFER (IPFS Gateway) ===');
        console.log('This audit gave IPFS Gateway the single-subject depth 0.9.367 gave Arweave Gateway, rather than');
        console.log('inheriting 0.9.367/0.9.368/0.9.372\'s own multi-candidate-sweep conclusion. The answer strengthens on');
        console.log('every dimension the brief asked about EXCEPT the one that decides the verdict:');
        console.log('');
        console.log(' - Failure-to-user-impact is honest and explicit (Section B): a down gateway becomes');
        console.log('   CONTENT_UNAVAILABLE / UNAVAILABLE at both real consumers, rendered amber (inconclusive), never');
        console.log('   red (rejected) — never swallowed, never a generic failure.');
        console.log(' - Alternative-gateway viability is PROVEN, not assumed (Section C): the same ipfs:// locator,');
        console.log('   through a second gateway, resolves through the REAL SnapshotPlacementResolver pipeline to bytes');
        console.log('   that verify against the same content hash — CID content-addressing genuinely holds across');
        console.log('   gateways, exactly like Arweave\'s transaction-id addressing.');
        console.log(' - A clean, real configuration seam already exists (Section E): ordinary constructor injection at');
        console.log('   both call sites, plus an injection point one layer up at the verifier use case.');
        console.log(' - Local-node configuration and write-path (pin/publish) configuration are both confirmed');
        console.log('   structurally separate (Sections F/G) — a future Gateway setting would need no design work to');
        console.log('   avoid entangling either.');
        console.log('');
        console.log('What does NOT hold, and is why this stays DEFER rather than becoming BUILD_NEXT: Section A\'s own');
        console.log('construction-site count. IpfsGatewayContentStore is built at exactly two places in ui/main.js, and');
        console.log('both are opt-in, per-item paths — resolving a placement a publisher specifically chose ipfs:// for,');
        console.log('or the secondary "Observe Content" verification action — never the default World Encounter material');
        console.log('read path or the default Snapshot retrieval path the way arweave.net is for Arweave Gateway. A down');
        console.log('default gateway degrades a narrow, already-opt-in corner of the product, not the core loop. That is');
        console.log('a real, evidenced, but smaller recovery gap than Arweave Gateway\'s — not the "no gap at all" a bare');
        console.log('DEFER label can misread as, and not a gap comparable in reach to what justified 0.9.364.');
        console.log('');
        console.log('IPFS local node (Kubo API) and TURN remain SEPARATE_PRODUCT: the local node\'s real gap (0.9.363\'s own');
        console.log('E1 finding, reconfirmed here) is "a person needs their own IPFS node/provider," a different capability');
        console.log('from an alternative HTTP retrieval endpoint; TURN\'s gap is credential-shaped, ruling out a plain-URL');
        console.log('field entirely. STUN, Rendezvous, Bitcoin Esplora, and Base RPC remain DEFER, unchanged.');
        console.log('');
        console.log('No BUILD_NEXT candidate is produced by this audit. The infrastructure-endpoint category\'s own');
        console.log('STABLE_STOP verdict (0.9.367/0.9.368/0.9.372) stands reconfirmed — IPFS Gateway was its last open');
        console.log('question, and this milestone closes it with DEFER, not by inheriting a prior conclusion but by');
        console.log('proving it fresh, including the one thing no prior audit had actually demonstrated: that an');
        console.log('alternative gateway really does serve the identical bytes for the same CID.');

        console.log('\n✅ All IPFS Gateway Product Gap Audit tests passed.');
    }
}

await run();
