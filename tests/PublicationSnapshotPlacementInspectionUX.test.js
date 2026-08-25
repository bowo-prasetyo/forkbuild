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
import { LocalContentStore } from '../content/LocalContentStore.js';
import { computeContentHash } from '../serializer/contentHash.js';

import { PublicationSnapshotPlacement } from '../core/PublicationSnapshotPlacement.js';
import { AddPublicationSnapshotPlacementUseCase } from '../application/AddPublicationSnapshotPlacementUseCase.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/LocalPublicationSnapshotPlacementCatalog.js';
import { SnapshotPlacementResolver } from '../application/SnapshotPlacementResolver.js';
import { SnapshotPlacementResolutionOutcome } from '../application/SnapshotPlacementResolutionOutcome.js';
import { CreateSnapshotPlacementResolutionCoordinatorUseCase } from '../application/CreateSnapshotPlacementResolutionCoordinatorUseCase.js';
import { CreateSnapshotPlacementOrchestratorUseCase } from '../application/CreateSnapshotPlacementOrchestratorUseCase.js';
import { publicationSnapshotPlacementDetailView, describePlacementBinding } from '../application/PublicationSnapshotPlacementDetailView.js';
import { SnapshotPlacementViewRegistry } from '../application/SnapshotPlacementViewRegistry.js';
import { IpfsSnapshotPlacementView } from '../content/IpfsSnapshotPlacementView.js';
import { LocalSnapshotPlacementView } from '../content/LocalSnapshotPlacementView.js';
import { snapshotPlacementView, describeSnapshotPlacement } from '../application/SnapshotPlacementView.js';
import { createResolutionObservation } from '../application/SnapshotPlacementResolutionObservation.js';

// 0.8.20 — Snapshot Placement Inspection & Explicit Resolution UX.
//
//   Section A: publicationSnapshotPlacementDetailView() — argument
//              handling, the generic shape it derives (locator returned
//              opaque, never reinterpreted), and describePlacementBinding()'s
//              own wording ("claims... can be retrieved from," never
//              "is," "serves," or "hosts").
//   Section B: SnapshotPlacementViewRegistry — the same storage ->
//              plugin lookup discipline application/
//              SnapshotPlacementStoreRegistry.js already established.
//   Section C: IpfsSnapshotPlacementView#describe() /
//              LocalSnapshotPlacementView#describe() — a well-formed
//              `ipfs://` locator produces a followable ipfs.io gateway
//              destination; a missing/malformed one, or a `local`
//              locator, degrades honestly, never a guess and never a
//              throw.
//   Section D: FLAGSHIP — Alice publishes a World locally and places its
//              snapshot on a fake IPFS network; Bob receives the
//              placement through the same structural-only ingestion
//              boundary application/PublicationSnapshotPlacementPeerExchange.js's
//              own arrival path uses (application/
//              AddPublicationSnapshotPlacementUseCase.js) and discovers
//              it. Bob opens "Inspect Placement" — proven NOT to call
//              application/SnapshotPlacementResolver.js, not to touch
//              the network, not to modify the catalog, and not to
//              mutate the placement — then, separately, clicks "Resolve
//              Snapshot," which is proven to be the only action that
//              ever does any of those things and RESOLVES against
//              Bob's own registered IPFS store. Carol receives the
//              IDENTICAL, byte-for-byte placement, but this replica has
//              no store registered for `ipfs` at all — her own separate
//              "Resolve Snapshot" click honestly reports
//              STORE_UNAVAILABLE for the exact same claim Bob just
//              resolved. Two independent createResolutionObservation()
//              records, for the two different outcomes, prove
//              application/SnapshotPlacementResolutionObservation.js's
//              own restraint: neither observation is ever shared, and
//              neither ever changes the other replica's own answer.
//
// See docs/Principles.md, "Resolving A Placement Observes Present
// Availability; It Does Not Rewrite The Placement Claim (0.8.20)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
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

function fakeCid(text) {
    return 'bafyFAKE' + computeContentHash(text);
}

// A fake Kubo HTTP RPC API backed by whatever `network` Map is handed
// in — mirrors tests/DecentralizedSnapshotPlacement.test.js's own
// makeFakeIpfsNode() exactly.
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
            if (!network.has(cid)) {
                return new Response('not found', { status: 500 });
            }
            return new Response(network.get(cid), { status: 200 });
        }
        return new Response('unknown route', { status: 404 });
    };
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

async function run() {
    // ---------------------------------------------------------------
    // Section A — publicationSnapshotPlacementDetailView()
    // ---------------------------------------------------------------
    {
        expectThrows(() => publicationSnapshotPlacementDetailView(), '1. requires a placement');
        expectThrows(() => publicationSnapshotPlacementDetailView({}), '2. rejects a plain object with no toJSON()');

        const placement = new PublicationSnapshotPlacement({
            publicationId: 'pub-detail',
            contentHash: 'deadbeef',
            storage: 'ipfs',
            locator: 'ipfs://bafyABC123',
            placedAt: new Date('2026-01-01T00:00:00.000Z'),
            placerIdentity: { id: 'identity-alice', publicKey: 'pk' }
        });

        const detail = publicationSnapshotPlacementDetailView(placement);
        assert(detail.placementId === placement.id, '3. placementId is the placement\'s own id');
        assert(detail.storage === 'ipfs', '4. storage is carried through unchanged');
        assert(detail.publicationId === 'pub-detail' && detail.contentHash === 'deadbeef', '5. publicationId/contentHash are the placement\'s own claim');
        assert(detail.locator === 'ipfs://bafyABC123', '6. locator is carried through unchanged');
        assert(detail.placedAt === '2026-01-01T00:00:00.000Z', '7. placedAt is the placement\'s own reported timestamp, verbatim');
        assert(detail.placedAtLabel === 'Claimed placement time', '8. placedAtLabel never says "Confirmed at"/"Pinned at"/"Stored at"');
        assert(detail.placerIdentityId === 'identity-alice', '9. placerIdentityId is derived from the placement\'s own signer');

        // THE CENTRAL RULE: locator is returned OPAQUE — exactly what
        // the placement carries, byte-identical, never reinterpreted
        // into a cid/gateway field of its own.
        assert(!('cid' in detail) && !('gateway' in detail) && !('path' in detail),
            '10. no top-level cid/gateway/path field — this file never reaches into a storage-specific locator shape');

        assert(detail.bindingDescription === describePlacementBinding('pub-detail', 'deadbeef'), '11. bindingDescription matches the standalone helper');
        assert(detail.bindingDescription.includes('pub-detail') && detail.bindingDescription.includes('deadbeef'),
            '12. bindingDescription names both the publicationId and the contentHash');
        const bindingWords = detail.bindingDescription.toLowerCase();
        assert(bindingWords.includes('claims'), '13. bindingDescription is worded as a claim');
        for (const forbidden of ['is available', 'serves', 'hosts', 'verified', 'trusted', 'canonical', 'authentic']) {
            assert(!bindingWords.includes(forbidden), `14. bindingDescription never says "${forbidden}"`);
        }

        // Calling twice is byte-identical — a pure, deterministic reshape.
        assert(JSON.stringify(publicationSnapshotPlacementDetailView(placement)) === JSON.stringify(detail), '15. calling publicationSnapshotPlacementDetailView() twice is byte-identical');

        // No placerIdentity — degrades honestly, never guessed.
        const barePlacement = new PublicationSnapshotPlacement({ publicationId: 'p', contentHash: 'h', storage: 'local', locator: 'content:h' });
        const bareDetail = publicationSnapshotPlacementDetailView(barePlacement);
        assert(bareDetail.placerIdentityId === null, '16. no placerIdentity -> placerIdentityId is null');
    }
    console.log('✓ Section A: publicationSnapshotPlacementDetailView() derives the full generic shape, locator stays opaque, and bindingDescription is worded as a claim, never an established fact');

    // ---------------------------------------------------------------
    // Section B — SnapshotPlacementViewRegistry
    // ---------------------------------------------------------------
    {
        const registry = new SnapshotPlacementViewRegistry();
        expectThrows(() => registry.register(null), '17. register() rejects a null plugin');
        expectThrows(() => registry.register({ storage: '' }), '18. register() rejects an empty storage');
        expectThrows(() => registry.register({ storage: 'x' }), '19. register() rejects a plugin with no describe()');

        assert(registry.get('ipfs') === null, '20. an unregistered storage returns null, never throws');
        assert(registry.has('ipfs') === false, '21. has() agrees');
        assert(registry.storageTypes.length === 0, '22. storageTypes starts empty');

        const ipfsView = new IpfsSnapshotPlacementView();
        registry.register(ipfsView);
        assert(registry.has('ipfs') === true, '23. registering a plugin makes has() true for its OWN storage');
        assert(registry.get('ipfs') === ipfsView, '24. get() returns the exact registered instance');
        assert(registry.storageTypes.length === 1 && registry.storageTypes[0] === 'ipfs', '25. storageTypes lists exactly the registered storage');

        // Re-registering the same storage replaces the first — "last
        // write wins," the identical posture every sibling registry
        // already takes.
        const secondIpfsView = { storage: 'ipfs', describe: () => ({ summary: 'second' }) };
        registry.register(secondIpfsView);
        assert(registry.get('ipfs') === secondIpfsView, '26. re-registering a storage replaces the prior plugin');

        registry.unregister('ipfs');
        assert(registry.get('ipfs') === null, '27. unregister() removes the plugin');
    }
    console.log('✓ Section B: SnapshotPlacementViewRegistry — the same storage -> plugin lookup discipline every sibling registry already holds, an unregistered storage always falls through to null');

    // ---------------------------------------------------------------
    // Section C — IpfsSnapshotPlacementView#describe() / LocalSnapshotPlacementView#describe()
    // ---------------------------------------------------------------
    {
        const view = new IpfsSnapshotPlacementView();
        assert(view.storage === 'ipfs', '28. storage matches the sibling content/IpfsContentStore.js exactly');

        const cid = 'bafyREALCID123';
        const described = view.describe({ locator: `ipfs://${cid}` });
        assert(described.summary === 'IPFS', '29. summary is "IPFS"');
        const cidField = described.fields.find((f) => f.label === 'CID');
        assert(cidField.value === cid, '30. CID field carries the locator\'s own value');
        assert(described.externalLocator.url === `https://ipfs.io/ipfs/${cid}`, '31. locator points at ipfs.io\'s own gateway path');
        assert(described.externalLocator.label === 'View on IPFS gateway', '32. locator label is honest and non-committal');

        // Malformed/missing locator degrades honestly — never a guess, never a throw.
        const noLocator = view.describe({ locator: null });
        assert(noLocator.externalLocator === null, '33. no locator -> no externalLocator');
        assert(noLocator.fields.find((f) => f.label === 'CID').value === 'not available', '34. no locator -> "not available," never a fabricated CID');

        const malformedLocator = view.describe({ locator: 'content:not-ipfs' });
        assert(malformedLocator.externalLocator === null, '35. a non-ipfs:// locator never produces a gateway link');

        let threw = false;
        try { view.describe(undefined); } catch (e) { threw = true; }
        assert(!threw, '36. describe() never throws, even for a completely missing placement');

        const localView = new LocalSnapshotPlacementView();
        assert(localView.storage === 'local', '37. storage matches content/LocalContentStore.js exactly');
        const localDescribed = localView.describe({ locator: 'content:deadbeef' });
        assert(localDescribed.externalLocator === null, '38. a local placement never fabricates an external link');
        assert(localDescribed.fields.find((f) => f.label === 'Storage Key').value === 'content:deadbeef', '39. the local storage key is shown verbatim');
    }
    console.log('✓ Section C: IpfsSnapshotPlacementView#describe() derives a followable ipfs.io gateway destination from a well-formed locator and degrades honestly, never guessing, for a missing or malformed one or for a local placement — neither adapter ever resolves or mutates anything');

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP: Alice places on fake IPFS, Bob receives and
    // inspects (never touching resolution), then Bob resolves RESOLVED
    // while Carol — holding the byte-identical placement but no IPFS
    // store — independently resolves STORE_UNAVAILABLE.
    // ---------------------------------------------------------------
    {
        // Alice's own replica: publishes a real World locally, then
        // places its snapshot on a fake IPFS network.
        const { alice, publication, discoveryProvider, contentResolver } = publishLocally('Flagship Farmstead');
        const network = new Map();
        const aliceIpfs = new IpfsContentStore({ fetchImpl: makeFakeIpfsNode(network) });
        const alicePlacementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const aliceOrchestrator = new CreateSnapshotPlacementOrchestratorUseCase().execute({
            discoveryProvider, contentResolver, placementCatalog: alicePlacementCatalog, identityProvider: alice, stores: [aliceIpfs]
        });
        const creationResult = await aliceOrchestrator.createExternalSnapshotPlacementUseCase.execute(publication.id, 'ipfs');
        const alicePlacement = creationResult.placement;
        assert(alicePlacement.locator.startsWith('ipfs://'), '40. sanity: Alice really placed the snapshot on IPFS');

        // Bob's own, completely separate replica. The placement "arrives
        // through peer exchange" the identical boundary application/
        // PublicationSnapshotPlacementPeerExchange.js's own ingestion
        // already uses — application/AddPublicationSnapshotPlacementUseCase.js,
        // fed the plain wire envelope Alice's placement serializes to.
        const bobPlacementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const { placement: bobReceivedPlacement } = new AddPublicationSnapshotPlacementUseCase(bobPlacementCatalog).execute(alicePlacement.toJSON());

        const bobIpfs = new IpfsContentStore({ fetchImpl: makeFakeIpfsNode(network) });
        const { coordinator: bobResolutionCoordinator } = new CreateSnapshotPlacementResolutionCoordinatorUseCase().execute({
            placementCatalog: bobPlacementCatalog, stores: [bobIpfs]
        });
        const bobPlacementViewRegistry = new SnapshotPlacementViewRegistry();
        bobPlacementViewRegistry.register(new IpfsSnapshotPlacementView());

        // Bob discovers it — a synchronous local catalog read.
        const discovered = bobResolutionCoordinator.discover(publication.id);
        assert(discovered.length === 1 && discovered[0].id === alicePlacement.id, '41. Bob discovers the exact placement Alice created');
        const placement = discovered[0];

        // Snapshot everything the milestone's own invariant names,
        // BEFORE Bob opens "Inspect Placement."
        const beforePlacementJson = JSON.stringify(placement.toJSON());
        const beforeCatalogJson = JSON.stringify(bobPlacementCatalog.list().map((p) => p.toJSON()));

        // --- Bob opens "Inspect Placement." ---
        // A call-counting wrapper around the real SnapshotPlacementResolver
        // proves inspection never reaches it — mirroring tests/
        // PublicationAnchorInspectionUX.test.js's own verifierSpy.
        let resolverCalls = 0;
        const originalResolve = SnapshotPlacementResolver.prototype.resolve;
        SnapshotPlacementResolver.prototype.resolve = function spiedResolve(...args) {
            resolverCalls += 1;
            return originalResolve.apply(this, args);
        };
        let bobResult;
        try {
            const detail = publicationSnapshotPlacementDetailView(placement);
            const typeSpecific = bobPlacementViewRegistry.has(placement.storage)
                ? bobPlacementViewRegistry.get(placement.storage).describe(placement)
                : null;

            assert(resolverCalls === 0, '42. INVARIANT: opening "Inspect Placement" never calls SnapshotPlacementResolver');
            assert(JSON.stringify(placement.toJSON()) === beforePlacementJson, '43. INVARIANT: the placement itself is byte-identical before/after inspection');
            assert(JSON.stringify(bobPlacementCatalog.list().map((p) => p.toJSON())) === beforeCatalogJson, '44. INVARIANT: the catalog is unchanged by inspection');

            assert(detail.placementId === alicePlacement.id && detail.publicationId === publication.id && detail.contentHash === publication.contentReference.hash,
                '45. the detail view names the exact placement Bob is looking at');
            assert(detail.locator === alicePlacement.locator, '46. locator is carried through unchanged');
            assert(detail.placerIdentityId === alice.getSigningIdentity().id, '47. placerIdentityId names Alice\'s own placing identity');
            assert(typeSpecific.summary === 'IPFS' && typeSpecific.externalLocator.url.includes(alicePlacement.locator.slice('ipfs://'.length)),
                '48. the IPFS-specific adapter derives a followable gateway destination from the SAME placement');

            console.log('✓ Section D (inspect): Bob opens "Inspect Placement" on the placement Alice created and Bob received through peer exchange — the placement and the catalog are byte-identical before and after, and SnapshotPlacementResolver is never once consulted');

            // --- Bob separately clicks "Resolve Snapshot." Only NOW does
            // the resolver get consulted. ---
            bobResult = await bobResolutionCoordinator.resolve(placement);
            assert(resolverCalls === 1, '49. an explicit "Resolve Snapshot" click is the only thing that ever consults the resolver');
            assert(bobResult.outcome === SnapshotPlacementResolutionOutcome.RESOLVED, '50. Bob, holding a real IPFS store pointed at the SAME fake network, resolves the placement');
            assert(bobResult.bytes === JSON.stringify(contentResolver.resolve(publication.id)), '51. the resolved bytes are byte-identical to Alice\'s own locally stored snapshot');
            assert(JSON.stringify(placement.toJSON()) === beforePlacementJson, '52. even resolving never mutates the placement itself — the same immutable envelope throughout');

            const bobObservation = createResolutionObservation({ placementId: placement.id, outcome: bobResult.outcome, reason: bobResult.reason });
            assert(bobObservation.outcome === SnapshotPlacementResolutionOutcome.RESOLVED, '53. Bob\'s own resolution observation records his own outcome');
        } finally {
            SnapshotPlacementResolver.prototype.resolve = originalResolve;
        }

        // Carol is a THIRD, completely separate replica. She receives
        // the IDENTICAL, byte-for-byte placement through the same
        // structural-only boundary Bob did — but her own replica has no
        // content store registered for `ipfs` at all.
        const carolPlacementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const { placement: carolReceivedPlacement } = new AddPublicationSnapshotPlacementUseCase(carolPlacementCatalog).execute(alicePlacement.toJSON());
        assert(JSON.stringify(carolReceivedPlacement.toJSON()) === JSON.stringify(bobReceivedPlacement.toJSON()),
            '54. Carol holds the byte-identical placement claim Bob holds');

        const { coordinator: carolResolutionCoordinator } = new CreateSnapshotPlacementResolutionCoordinatorUseCase().execute({
            placementCatalog: carolPlacementCatalog, stores: []
        });
        const carolDiscovered = carolResolutionCoordinator.discover(publication.id);
        const carolResult = await carolResolutionCoordinator.resolve(carolDiscovered[0]);
        assert(carolResult.outcome === SnapshotPlacementResolutionOutcome.STORE_UNAVAILABLE,
            '55. Carol, with no ipfs store configured, independently and honestly reports STORE_UNAVAILABLE for the SAME claim Bob just resolved');

        const carolObservation = createResolutionObservation({ placementId: carolDiscovered[0].id, outcome: carolResult.outcome, reason: carolResult.reason });
        assert(carolObservation.outcome === SnapshotPlacementResolutionOutcome.STORE_UNAVAILABLE, '56. Carol\'s own resolution observation records her own, different outcome');
        assert(carolObservation.placementId === bobReceivedPlacement.id, '57. both observations name the SAME placementId — only the outcome differs');

        // THE CENTRAL INVARIANT: byte-identical placement, two
        // independently and honestly derived resolution outcomes,
        // neither ever written back into the shared claim.
        assert(JSON.stringify(bobReceivedPlacement.toJSON()) === JSON.stringify(carolReceivedPlacement.toJSON()),
            '58. the underlying placement claim stays byte-identical for both replicas regardless of what each one could independently resolve');

        // snapshotPlacementView()/describeSnapshotPlacement() present
        // both outcomes distinctly — never collapsed into a shared
        // "unavailable" bucket.
        const bobView = describeSnapshotPlacement(placement, { outcome: bobResult.outcome, reason: bobResult.reason });
        const carolView = describeSnapshotPlacement(carolDiscovered[0], { outcome: carolResult.outcome, reason: carolResult.reason });
        assert(bobView.resolutionLabel !== carolView.resolutionLabel, '59. RESOLVED and STORE_UNAVAILABLE carry two distinct, non-collapsed labels');
        assert(bobView.resolved === true && carolView.resolved === true, '60. both are reported as a COMPLETED resolution, distinct from "checking" or "not yet resolved"');

        const listView = snapshotPlacementView([placement], { [placement.id]: { outcome: bobResult.outcome, reason: bobResult.reason } });
        assert(listView.count === 1 && listView.placements[0].placementId === placement.id, '61. snapshotPlacementView() reshapes a discovered list with no ranking');
    }
    console.log('✓ Section D (resolve): Bob and Carol hold the byte-identical placement Alice created, yet independently and honestly resolve two different outcomes — RESOLVED and STORE_UNAVAILABLE — neither ever transmitted, persisted, or reconciled between them');

    console.log('\nAll Publication Snapshot Placement Inspection UX tests passed.');
}

run().catch((error) => {
    console.error('PublicationSnapshotPlacementInspectionUX.test.js FAILED:', error);
    process.exitCode = 1;
});
