import { PublicationSnapshotPlacement } from '../core/PublicationSnapshotPlacement.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/LocalPublicationSnapshotPlacementCatalog.js';
import { PublicationResolver } from '../application/PublicationResolver.js';
import { PublicationCatalogDiscoveryProvider } from '../discovery/PublicationCatalogDiscoveryProvider.js';
import { PublicationCatalogContentResolver } from '../discovery/PublicationCatalogContentResolver.js';
import { CreateSnapshotPlacementOrchestratorUseCase } from '../application/CreateSnapshotPlacementOrchestratorUseCase.js';
import { CreateSnapshotPlacementCreationCoordinatorUseCase } from '../application/CreateSnapshotPlacementCreationCoordinatorUseCase.js';
import { SnapshotPlacementCreationCoordinator } from '../application/SnapshotPlacementCreationCoordinator.js';
import { SnapshotPlacementCreationOutcome } from '../application/SnapshotPlacementCreationOutcome.js';
import { SnapshotPlacementCreationUiState } from '../application/SnapshotPlacementCreationUiState.js';
import { describeCreationAttempt, describeCreationButtonLabel } from '../application/SnapshotPlacementCreationView.js';
import { CreateSnapshotPlacementResolutionCoordinatorUseCase } from '../application/CreateSnapshotPlacementResolutionCoordinatorUseCase.js';
import { SnapshotPlacementResolutionOutcome } from '../application/SnapshotPlacementResolutionOutcome.js';
import { IpfsContentStore } from '../content/IpfsContentStore.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { computeContentHash } from '../serializer/contentHash.js';

// 0.8.25 — Explicit Snapshot Placement Creation UX.
//
//   Section A: FLAGSHIP — Alice's real Publication Center (application/
//              LocalPublicationCatalog.js + core/DecentralizedPublication
//              .js — the SAME model ui/views/DecentralizedPublicationsView
//              .js actually renders, never the older discovery/
//              LocalDiscoveryProvider.js/`Publisher` world tests/
//              DecentralizedSnapshotPlacement.test.js exercises) lists
//              'ipfs' as an available storage type, she explicitly creates
//              an IPFS placement, and the derived UI view reports it
//              plainly ("a snapshot placement was recorded"), never
//              "decentralized"/"permanent"/"verified"/"confirmed"/
//              "available everywhere". The new placement lands in the
//              ordinary placement catalog with NO resolver call — Bob
//              independently discovers and resolves it against the SAME
//              fake IPFS network Alice's own store just wrote to.
//   Section B: CREATED and PLACEMENT_UNAVAILABLE, plus a local
//              precondition failure (nobody signed in), each get their
//              own distinct, honest UI state/label/message. There is no
//              REJECTED state on the placement side at all — see
//              application/SnapshotPlacementCreationUiState.js's own
//              header.
//   Section C: separation — listing available storage types and
//              discovering placements never create anything; creating a
//              placement consults its content store exactly once and the
//              resolver not at all.
//   Section D: multiple independent placements — creating the same
//              storage type twice for one publication produces two
//              independent, equally discoverable placements.
//   Section E: availableStorageTypes() is what keeps the UI from ever
//              offering a storage type nobody can place onto.
//   Section F: the composition root wires the SAME already-constructed
//              collaborators passed to it, never fresh disconnected ones.
//   Section G: the discovery/PublicationCatalogDiscoveryProvider.js and
//              discovery/PublicationCatalogContentResolver.js bridge
//              classes this milestone adds are exactly what makes the
//              0.8.18 creation pipeline usable against the REAL
//              Publication Center's own LocalPublicationCatalog/
//              ContentStore — the exact composition ui/main.js now wires.
//
// See docs/Principles.md, "Snapshot Placement Creation Is An Explicit
// User Action, Never A Second Publish (0.8.25)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function expectThrowsAsync(fn, message) {
    let threw = false;
    try { await fn(); } catch (e) { threw = true; }
    assert(threw, message);
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

// A tiny in-memory stand-in for a Kubo node's HTTP RPC API — the
// identical technique tests/IpfsContentStore.test.js established.
function fakeCid(text) {
    return 'bafyFAKE' + computeContentHash(text);
}

function makeFakeIpfsNode({ network = new Map(), failAdd = false } = {}) {
    async function fetchImpl(url, options) {
        const parsed = new URL(url);
        if (parsed.pathname === '/api/v0/add') {
            if (failAdd) {
                return new Response('internal error', { status: 500 });
            }
            const blob = options.body.get('file');
            const text = await blob.text();
            const cid = fakeCid(text);
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

// Mirrors the real ui/main.js composition root exactly: a
// LocalPublicationCatalog, a real content/ContentStore.js for local
// bytes, the two 0.8.25 bridge adapters, and application/
// CreateSnapshotPlacementOrchestratorUseCase.js/application/
// CreateSnapshotPlacementCreationCoordinatorUseCase.js wired together —
// never the older discovery/LocalDiscoveryProvider.js/`Publisher` world.
function makePublicationCenter({ stores = [], identityProvider = makeIdentity('Alice') } = {}) {
    const publicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
    const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
    const publicationContentStore = new LocalContentStore(new InMemoryStorageProvider());
    const publicationResolver = new PublicationResolver(publicationContentStore, new LocalAuthorizationVerifier());

    const discoveryProvider = new PublicationCatalogDiscoveryProvider(publicationCatalog);
    const contentResolver = new PublicationCatalogContentResolver(publicationCatalog, publicationContentStore);

    const { createExternalSnapshotPlacementUseCase, storeRegistry } = new CreateSnapshotPlacementOrchestratorUseCase().execute({
        discoveryProvider, contentResolver, placementCatalog, identityProvider, stores
    });
    const { coordinator: creationCoordinator } = new CreateSnapshotPlacementCreationCoordinatorUseCase().execute({
        createExternalSnapshotPlacementUseCase, storeRegistry
    });
    const { coordinator: resolutionCoordinator } = new CreateSnapshotPlacementResolutionCoordinatorUseCase().execute({
        placementCatalog, stores
    });

    return {
        publicationCatalog, placementCatalog, publicationContentStore, publicationResolver,
        identityProvider, creationCoordinator, resolutionCoordinator, storeRegistry, createExternalSnapshotPlacementUseCase
    };
}

async function publishLocally(publicationResolver, publicationCatalog, identityProvider, content) {
    const publication = await publicationResolver.publish({
        content, contentKind: 'forkbuild.structure', identityProvider
    });
    publicationCatalog.add(publication);
    return publication;
}

// Mirrors ui/views/DecentralizedPublicationsView.js#createPlacement()
// exactly — a caller-supplied try/catch around the coordinator, since
// application/SnapshotPlacementCreationCoordinator.js never catches a
// signing failure itself (see that class's own header).
async function clickCreate(creationCoordinator, publicationId, storage) {
    try {
        const result = await creationCoordinator.create(publicationId, storage);
        return { creating: false, outcome: result.outcome, placement: result.placement, reason: result.reason, error: null };
    } catch (error) {
        return { creating: false, outcome: null, placement: null, reason: null, error: error.message };
    }
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP
    // ---------------------------------------------------------------
    let sharedPlacementJson, sharedNetwork;
    {
        const net = makeFakeIpfsNode();
        const aliceIpfs = new IpfsContentStore({ apiUrl: 'http://alice-node.test:5001', fetchImpl: net.fetchImpl });
        const {
            publicationCatalog, publicationResolver, identityProvider, creationCoordinator, resolutionCoordinator
        } = makePublicationCenter({ stores: [aliceIpfs] });

        assert(creationCoordinator.availableStorageTypes().includes('ipfs'),
            '1. Alice\'s Publication Center lists ipfs as an available storage type');

        const publication = await publishLocally(publicationResolver, publicationCatalog, identityProvider, { farmstead: true });

        // Before any click, this publication has no known placements and
        // no creation attempt has ever been made.
        assert(resolutionCoordinator.discover(publication.id).length === 0, '2. no placement known before any is created');
        const idleView = describeCreationAttempt(null);
        assert(idleView.state === SnapshotPlacementCreationUiState.IDLE, '3. before any click, the derived view reports IDLE');
        assert(describeCreationButtonLabel('Ipfs', { hasExisting: false }) === 'Create Ipfs Placement', '4. the initial button reads "Create <storage> Placement"');

        // Alice clicks "Create Ipfs Placement."
        const attempt = await clickCreate(creationCoordinator, publication.id, 'ipfs');
        assert(attempt.error === null && attempt.outcome === SnapshotPlacementCreationOutcome.CREATED, '5. a healthy content store produces CREATED');
        assert(attempt.placement instanceof PublicationSnapshotPlacement, '6. the CREATED outcome carries a real PublicationSnapshotPlacement');

        const createdView = describeCreationAttempt(attempt);
        assert(createdView.state === SnapshotPlacementCreationUiState.CREATED, '7. the derived view reports CREATED');
        assert(createdView.message.includes('A snapshot placement was recorded for ipfs'), '8. the UI makes exactly the strongest permitted statement');
        const forbiddenWords = ['decentralized', 'permanent', 'verified', 'confirmed', 'available everywhere', 'trusted'];
        for (const word of forbiddenWords) {
            assert(!createdView.message.toLowerCase().includes(word), `9. the creation message never uses the word "${word}"`);
        }

        // The new placement immediately shows up in the ordinary, never-
        // auto-resolved placement list — a purely local catalog read,
        // completely unchanged by this milestone.
        const discovered = resolutionCoordinator.discover(publication.id);
        assert(discovered.length === 1 && discovered[0].id === attempt.placement.id, '10. the created placement is discoverable through the SAME resolution coordinator, unchanged');

        // Bob — none of Alice's state — independently resolves it against
        // the SAME fake IPFS network Alice's own store just wrote to.
        const bobIpfs = new IpfsContentStore({ apiUrl: 'http://bob-node.test:5001', fetchImpl: net.fetchImpl });
        const bobVerifier = new LocalAuthorizationVerifier();
        const { SnapshotPlacementResolver } = await import('../application/SnapshotPlacementResolver.js');
        const bobResolver = new SnapshotPlacementResolver(bobVerifier);
        const placementJson = attempt.placement.toJSON();
        const bobResult = await bobResolver.resolve(placementJson, { contentStore: bobIpfs });
        assert(bobResult.outcome === SnapshotPlacementResolutionOutcome.RESOLVED, '11. Bob independently resolves the placement Alice\'s creation click produced');
        assert(bobResult.bytes === JSON.stringify({ farmstead: true }),
            '12. the resolved bytes are byte-identical to Alice\'s own locally stored snapshot');

        sharedPlacementJson = placementJson;
        sharedNetwork = net;
    }
    console.log('✓ Section A: Alice explicitly creates an IPFS placement; the UI states exactly "a snapshot placement was recorded," never more; Bob independently discovers and resolves it against the same store');

    // ---------------------------------------------------------------
    // Section B — every creation outcome gets its own honest UI state
    // ---------------------------------------------------------------
    {
        const net = makeFakeIpfsNode({ failAdd: true });
        const ipfs = new IpfsContentStore({ apiUrl: 'http://node.test:5001', fetchImpl: net.fetchImpl });
        const { publicationCatalog, publicationResolver, identityProvider, creationCoordinator } = makePublicationCenter({ stores: [ipfs] });
        const publication = await publishLocally(publicationResolver, publicationCatalog, identityProvider, { doc: 'unavailable' });
        const attempt = await clickCreate(creationCoordinator, publication.id, 'ipfs');
        const view = describeCreationAttempt(attempt);
        assert(view.state === SnapshotPlacementCreationUiState.UNAVAILABLE, '13. a store that cannot presently place bytes reports the UNAVAILABLE UI state');
        assert(view.message.toLowerCase().includes('could not currently be reached'), '14. the message names the honest, generic reason');
    }
    {
        // The publication itself was published by SOME authenticated
        // identity (as every DecentralizedPublication must be — application/
        // PublicationResolver.js#publish() itself requires signing).
        // Nobody is signed in on the SEPARATE identityProvider this
        // replica's placement CREATION pipeline is wired against — a
        // genuine local precondition failure application/
        // CreateExternalSnapshotPlacementUseCase.js itself declines to
        // catch; ui/views/DecentralizedPublicationsView.js#createPlacement()
        // catches it at the UI boundary instead — clickCreate() above
        // mirrors that exactly.
        const net = makeFakeIpfsNode();
        const ipfs = new IpfsContentStore({ apiUrl: 'http://node.test:5001', fetchImpl: net.fetchImpl });
        const unauthenticatedIdentityProvider = new LocalIdentityProvider(new InMemoryStorageProvider());
        const { publicationCatalog, publicationResolver, creationCoordinator, placementCatalog } = makePublicationCenter({
            stores: [ipfs], identityProvider: unauthenticatedIdentityProvider
        });
        const publication = await publishLocally(publicationResolver, publicationCatalog, makeIdentity('Someone'), { doc: 'signed-out' });

        const attempt = await clickCreate(creationCoordinator, publication.id, 'ipfs');
        assert(attempt.error && attempt.error.includes('sign in'), '15. a local precondition failure (nobody signed in) is caught, never left to crash the page');
        const view = describeCreationAttempt(attempt);
        assert(view.state === SnapshotPlacementCreationUiState.UNAVAILABLE,
            '16. to a person looking at the button, "nobody signed in" reads exactly like "storage unreachable" — no placement was created either way');
        assert(view.reason.includes('sign in'), '17. but the SPECIFIC reason is preserved, never replaced with a generic message');
        assert(placementCatalog.findByPublicationId(publication.id).length === 0, '18. nothing was ever cataloged — the store was never even reached');
    }

    // No two of CREATED/IDLE/CREATING/UNAVAILABLE ever collapse onto the
    // same UI state, and REJECTED does not exist as a value at all.
    {
        const states = [
            describeCreationAttempt(null),
            describeCreationAttempt({ creating: true }),
            describeCreationAttempt({ outcome: SnapshotPlacementCreationOutcome.CREATED, placement: new PublicationSnapshotPlacement({ publicationId: 'p', contentHash: 'h', storage: 'ipfs', locator: 'ipfs://x' }) }),
            describeCreationAttempt({ outcome: SnapshotPlacementCreationOutcome.PLACEMENT_UNAVAILABLE, reason: 'y' })
        ];
        const uniqueStates = new Set(states.map((s) => s.state));
        assert(uniqueStates.size === 4, '19. IDLE/CREATING/CREATED/UNAVAILABLE are four genuinely distinct UI states');
        assert(!('REJECTED' in SnapshotPlacementCreationUiState), '20. REJECTED is not a value SnapshotPlacementCreationUiState defines at all');
    }
    console.log('✓ Section B: CREATED/UNAVAILABLE, plus a caught local precondition failure, each get their own honest, non-collapsing UI state; REJECTED does not exist on the placement side');

    // ---------------------------------------------------------------
    // Section C — separation: discovery/listing/creation never resolve
    // ---------------------------------------------------------------
    {
        let resolveCalls = 0;
        const net = makeFakeIpfsNode();
        const realIpfs = new IpfsContentStore({ apiUrl: 'http://node.test:5001', fetchImpl: net.fetchImpl });
        const putSpy = { calls: 0 };
        const spyIpfs = {
            storage: realIpfs.storage,
            async put(bytes) { putSpy.calls += 1; return realIpfs.put(bytes); },
            async get(ref) { return realIpfs.get(ref); }
        };
        const { publicationCatalog, publicationResolver, identityProvider, creationCoordinator, resolutionCoordinator } = makePublicationCenter({ stores: [spyIpfs] });
        const originalResolve = resolutionCoordinator.resolve.bind(resolutionCoordinator);
        resolutionCoordinator.resolve = (...args) => { resolveCalls += 1; return originalResolve(...args); };
        const publication = await publishLocally(publicationResolver, publicationCatalog, identityProvider, { doc: 'sep' });

        // Listing available storage types and discovering placements
        // never touch the content store OR the resolver.
        creationCoordinator.availableStorageTypes();
        creationCoordinator.availableStorageTypes();
        resolutionCoordinator.discover(publication.id);
        assert(putSpy.calls === 0, '21. listing available storage types and discovering placements never consult the content store');
        assert(resolveCalls === 0, '22. listing available storage types and discovering placements never consult the resolver either');

        // Creating consults the content store exactly once, and the
        // resolver not at all — the identical "no automatic resolution
        // after creation" invariant application/
        // SnapshotPlacementCreationView.js's own header names.
        const attempt = await clickCreate(creationCoordinator, publication.id, 'ipfs');
        assert(attempt.outcome === SnapshotPlacementCreationOutcome.CREATED, '23. the flagship-shaped creation still succeeds');
        assert(putSpy.calls === 1, '24. create() consults its content store exactly once');
        assert(resolveCalls === 0, '25. create() NEVER consults the resolver — no automatic resolution after creation');

        // Only an explicit, separate resolve() call ever does.
        await resolutionCoordinator.resolve(attempt.placement);
        assert(resolveCalls === 1, '26. an explicit "Resolve Snapshot" click is the only thing that ever consults the resolver');
    }
    console.log('✓ Section C: discovering placements and listing available storage types never resolve or place anything; creating consults its content store exactly once and the resolver not at all');

    // ---------------------------------------------------------------
    // Section D — multiple independent placements
    // ---------------------------------------------------------------
    {
        const net = makeFakeIpfsNode();
        const ipfs = new IpfsContentStore({ apiUrl: 'http://node.test:5001', fetchImpl: net.fetchImpl });
        const { publicationCatalog, publicationResolver, identityProvider, creationCoordinator, resolutionCoordinator } = makePublicationCenter({ stores: [ipfs] });
        const publication = await publishLocally(publicationResolver, publicationCatalog, identityProvider, { doc: 'multi' });

        const first = await clickCreate(creationCoordinator, publication.id, 'ipfs');
        const second = await clickCreate(creationCoordinator, publication.id, 'ipfs');
        assert(first.outcome === SnapshotPlacementCreationOutcome.CREATED && second.outcome === SnapshotPlacementCreationOutcome.CREATED,
            '27. creating the same storage type twice for the same publication succeeds both times');
        assert(first.placement.id !== second.placement.id, '28. the two placements are independent records');

        const discovered = resolutionCoordinator.discover(publication.id);
        assert(discovered.length === 2, '29. both independent placements are discoverable — neither replaces the other');
        assert(describeCreationButtonLabel('Ipfs', { hasExisting: true }) === 'Create Another Ipfs Placement',
            '30. once at least one placement of a storage type exists, the button makes clear a SECOND, independent one is what clicking again produces');
    }
    console.log('✓ Section D: creating the same storage type twice produces two independent, equally discoverable placements — never ranked or collapsed');

    // ---------------------------------------------------------------
    // Section E — availableStorageTypes() gates what the UI may ever offer
    // ---------------------------------------------------------------
    {
        const { creationCoordinator: emptyCoordinator, publicationCatalog, publicationResolver, identityProvider } = makePublicationCenter({ stores: [] });
        assert(emptyCoordinator.availableStorageTypes().length === 0, '31. no content store configured -> no available storage types -> nothing for the UI to offer');
        const publication = await publishLocally(publicationResolver, publicationCatalog, identityProvider, { doc: 'none' });
        await expectThrowsAsync(() => emptyCoordinator.create(publication.id, 'ipfs'),
            '32. requesting a storage type outside availableStorageTypes() still refuses, exactly as the underlying 0.8.18 orchestration already does');

        const net1 = makeFakeIpfsNode();
        const ipfs = new IpfsContentStore({ apiUrl: 'http://node-a.test:5001', fetchImpl: net1.fetchImpl });
        const local = new LocalContentStore(new InMemoryStorageProvider());
        const { creationCoordinator: twoCoordinator } = makePublicationCenter({ stores: [ipfs, local] });
        assert(twoCoordinator.availableStorageTypes().length === 2
            && twoCoordinator.availableStorageTypes().includes('ipfs')
            && twoCoordinator.availableStorageTypes().includes('local'),
            '33. every registered storage type is listed, none preferred or hidden');
    }
    console.log('✓ Section E: availableStorageTypes() is exactly what keeps the UI from ever offering a storage type with no registered content store');

    // ---------------------------------------------------------------
    // Section F — composition root wiring
    // ---------------------------------------------------------------
    {
        const publicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const publicationContentStore = new LocalContentStore(new InMemoryStorageProvider());
        const publicationResolver = new PublicationResolver(publicationContentStore, new LocalAuthorizationVerifier());
        const identityProvider = makeIdentity('Alice');
        const net = makeFakeIpfsNode();
        const ipfs = new IpfsContentStore({ apiUrl: 'http://node.test:5001', fetchImpl: net.fetchImpl });
        const discoveryProvider = new PublicationCatalogDiscoveryProvider(publicationCatalog);
        const contentResolver = new PublicationCatalogContentResolver(publicationCatalog, publicationContentStore);
        const { createExternalSnapshotPlacementUseCase, storeRegistry } = new CreateSnapshotPlacementOrchestratorUseCase().execute({
            discoveryProvider, contentResolver, placementCatalog, identityProvider, stores: [ipfs]
        });
        const { coordinator } = new CreateSnapshotPlacementCreationCoordinatorUseCase().execute({
            createExternalSnapshotPlacementUseCase, storeRegistry
        });
        assert(coordinator instanceof SnapshotPlacementCreationCoordinator, '34. the composition root returns a real SnapshotPlacementCreationCoordinator');
        const publication = await publishLocally(publicationResolver, publicationCatalog, identityProvider, { doc: 'wired' });
        const result = await coordinator.create(publication.id, 'ipfs');
        assert(result.outcome === SnapshotPlacementCreationOutcome.CREATED
            && placementCatalog.findByPublicationId(publication.id).length === 1,
            '35. the composition root wires the SAME already-constructed orchestration/registry passed in, never a disconnected copy');

        // Constructor validation — a caller contract violation, never a
        // degraded outcome.
        let threw = false;
        try { new SnapshotPlacementCreationCoordinator(null, storeRegistry); } catch (e) { threw = true; }
        assert(threw, '36. constructor requires a CreateExternalSnapshotPlacementUseCase');
        threw = false;
        try { new SnapshotPlacementCreationCoordinator(createExternalSnapshotPlacementUseCase, null); } catch (e) { threw = true; }
        assert(threw, '37. constructor requires a SnapshotPlacementStoreRegistry');
    }
    console.log('✓ Section F: the composition root wires the SAME already-constructed collaborators passed to it, never fresh disconnected ones');

    // ---------------------------------------------------------------
    // Section G — the 0.8.25 bridge classes make 0.8.18 usable against
    // the REAL Publication Center's own catalog/content store
    // ---------------------------------------------------------------
    {
        const publicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const publicationContentStore = new LocalContentStore(new InMemoryStorageProvider());
        const publicationResolver = new PublicationResolver(publicationContentStore, new LocalAuthorizationVerifier());
        const identityProvider = makeIdentity('Alice');
        const publication = await publishLocally(publicationResolver, publicationCatalog, identityProvider, { doc: 'bridge' });

        const discoveryProvider = new PublicationCatalogDiscoveryProvider(publicationCatalog);
        assert(discoveryProvider.findById(publication.id).id === publication.id,
            '38. PublicationCatalogDiscoveryProvider#findById() delegates straight to LocalPublicationCatalog#get()');
        assert(discoveryProvider.findById('no-such-publication') === null, '39. an unknown publicationId resolves to null, never throws');

        const contentResolver = new PublicationCatalogContentResolver(publicationCatalog, publicationContentStore);
        assert(JSON.stringify(contentResolver.resolve(publication.id)) === JSON.stringify({ doc: 'bridge' }),
            '40. PublicationCatalogContentResolver#resolve() returns the SAME bytes application/PublicationResolver.js#publish() stored, read back through the SAME content store');
        assert(contentResolver.verify(publication.id, publication.contentReference.hash) === true,
            '41. PublicationCatalogContentResolver#verify() confirms the stored bytes still match the publication\'s own contentReference.hash');
        assert(contentResolver.verify(publication.id, 'wrong-hash') === false,
            '42. verify() reports false for a hash that does not match, never throws');
        assert(contentResolver.resolve('no-such-publication') === null, '43. resolve() for an unknown publicationId returns null, never throws');

        // Constructor validation.
        let threw = false;
        try { new PublicationCatalogDiscoveryProvider(null); } catch (e) { threw = true; }
        assert(threw, '44. PublicationCatalogDiscoveryProvider requires a LocalPublicationCatalog');
        threw = false;
        try { new PublicationCatalogContentResolver(publicationCatalog, null); } catch (e) { threw = true; }
        assert(threw, '45. PublicationCatalogContentResolver requires a ContentStore');
    }
    console.log('✓ Section G: the 0.8.25 bridge classes let the 0.8.18 creation pipeline read the REAL Publication Center\'s own catalog and content store, never a disconnected second index');

    console.log('\nAll Explicit Snapshot Placement Creation UX tests passed.');
}

run().catch((error) => {
    console.error('SnapshotPlacementCreationUX.test.js FAILED:', error);
    process.exitCode = 1;
});
