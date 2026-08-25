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
import { validatePublicationSnapshotPlacement, PublicationSnapshotPlacementError } from '../application/PublicationSnapshotPlacementValidator.js';
import { CreatePublicationSnapshotPlacementUseCase } from '../application/CreatePublicationSnapshotPlacementUseCase.js';
import { AddPublicationSnapshotPlacementUseCase } from '../application/AddPublicationSnapshotPlacementUseCase.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/LocalPublicationSnapshotPlacementCatalog.js';
import { SnapshotPlacementStoreRegistry } from '../application/SnapshotPlacementStoreRegistry.js';
import { CreateExternalSnapshotPlacementUseCase } from '../application/CreateExternalSnapshotPlacementUseCase.js';
import { SnapshotPlacementCreationOutcome } from '../application/SnapshotPlacementCreationOutcome.js';
import { SnapshotPlacementResolver } from '../application/SnapshotPlacementResolver.js';
import { SnapshotPlacementResolutionOutcome } from '../application/SnapshotPlacementResolutionOutcome.js';
import { CreateSnapshotPlacementOrchestratorUseCase } from '../application/CreateSnapshotPlacementOrchestratorUseCase.js';

// 0.8.18 — Decentralized Snapshot Placement Foundation.
//
// The user-facing question this milestone answers: a `publisher/
// Publication.js`'s own contentReference is fixed the moment it is
// signed, and content/LocalContentStore.js is the ONLY backend
// LocalPublisherProvider.js has ever stored a snapshot's bytes in. This
// file proves the missing half now exists: an ALREADY-published,
// ALREADY-local snapshot can be placed onto a real, pluggable
// content/ContentStore.js backend (content/IpfsContentStore.js, fully
// exercised here against a fake Kubo node — the identical technique
// tests/IpfsPublicationResolution.test.js already established) via a
// signed, cataloged, independently resolvable
// core/PublicationSnapshotPlacement.js — without ever mutating the
// original Publication, without ever creating a second Publication, and
// without content/IpfsContentStore.js needing to know any of this
// exists.
//
// Section A: flagship — Alice publishes a world locally, places its
// snapshot on a fake IPFS network, and Bob — a second replica with no
// prior knowledge of Alice's local storage — resolves the SAME bytes
// back out purely from the cataloged placement.
// Section B: registry — keyed by a store's own `storage`, never a
// caller-supplied key; unregistered lookups return null, never throw.
// Section C: creation failure modes — unknown publication, no content
// reference, unregistered storage, local integrity failure all throw;
// a throwing store yields PLACEMENT_UNAVAILABLE and no cataloged
// placement.
// Section D: resolution failure modes — invalid envelope, tampered
// signature, no store available, content unavailable, and a content
// hash mismatch are five permanently distinct outcomes.
// Section E: two independent placements for the same publication, on
// different storage backends, coexist unranked.
// Section F: model invariants — required fields, immutability of
// withSignature(), and toJSON()/fromJSON() round-tripping.

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

function fakeCid(text) {
    return 'bafyFAKE' + computeContentHash(text);
}

// A fake Kubo HTTP RPC API backed by whatever `network` Map is handed
// in — mirrors tests/IpfsPublicationResolution.test.js's own
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

// A single-publication world: Alice publishes locally, and the returned
// collaborators are exactly what a real composition root would wire
// through application/CreateSnapshotPlacementOrchestratorUseCase.js.
function publishLocally(title = 'Placement Test') {
    const storage = new InMemoryStorageProvider();
    const alice = makeIdentity('alice');
    const publisher = new LocalPublisherProvider(storage);
    const doc = createTestDocument(title);
    const publication = publisher.publish(doc, alice);
    const discoveryProvider = new LocalDiscoveryProvider(storage);
    const contentResolver = new LocalContentResolver(publisher);
    return { storage, alice, publisher, publication, discoveryProvider, contentResolver };
}

async function run() {
    // -------------------------------------------------------------
    // Section A — flagship: publish locally, place on a fake IPFS
    // network, resolve on a second, unrelated replica.
    // -------------------------------------------------------------
    {
        const { alice, publication, discoveryProvider, contentResolver } = publishLocally('Farmstead');

        const network = new Map();
        const aliceIpfs = new IpfsContentStore({ fetchImpl: makeFakeIpfsNode(network) });

        const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const orchestrator = new CreateSnapshotPlacementOrchestratorUseCase().execute({
            discoveryProvider, contentResolver, placementCatalog, identityProvider: alice, stores: [aliceIpfs]
        });

        const result = await orchestrator.createExternalSnapshotPlacementUseCase.execute(publication.id, 'ipfs');
        assert(result.outcome === SnapshotPlacementCreationOutcome.CREATED, '1. placing an existing local publication on IPFS succeeds');
        assert(result.placement.publicationId === publication.id, '2. the placement names the SAME publicationId');
        assert(result.placement.contentHash === publication.contentReference.hash, '3. the placement names the publication\'s OWN contentHash');
        assert(result.placement.storage === 'ipfs', '4. the placement records the store\'s own storage name');
        assert(result.placement.locator.startsWith('ipfs://'), '5. the placement\'s locator is a real ipfs:// uri');
        assert(result.placement.placerIdentity.id === alice.getSigningIdentity().id, '6. the placement is signed by the identity that placed it');
        assert(placementCatalog.get(result.placement.id) !== null, '7. the placement is cataloged');

        // The ORIGINAL Publication is completely untouched.
        assert(publication.contentReference.storage === 'local', '8. the original publication\'s own contentReference is unchanged — still local');

        // Bob is a second replica who never saw Alice's local storage at
        // all — only the cataloged placement (as any peer/catalog
        // exchange would hand him) and his own IPFS store pointed at the
        // SAME fake network.
        const bobIpfs = new IpfsContentStore({ fetchImpl: makeFakeIpfsNode(network) });
        const bobVerifier = new LocalAuthorizationVerifier();
        const bobResolver = new SnapshotPlacementResolver(bobVerifier);
        const bobRegistry = new SnapshotPlacementStoreRegistry().register(bobIpfs);

        const resolved = await bobResolver.resolve(result.placement.toJSON(), { storeRegistry: bobRegistry });
        assert(resolved.outcome === SnapshotPlacementResolutionOutcome.RESOLVED, '9. Bob resolves the placement purely from the catalog entry and his own IPFS store');
        const originalBytes = JSON.stringify(contentResolver.resolve(publication.id));
        assert(resolved.bytes === originalBytes, '10. the bytes Bob retrieved are byte-identical to Alice\'s own locally stored snapshot');
        const rehydrated = JSON.parse(resolved.bytes);
        assert(rehydrated.schemaVersion !== undefined, '11. the resolved bytes are the real world snapshot JSON, never opaque or re-wrapped');
        assert(computeContentHash(resolved.bytes) === publication.contentReference.hash, '12. the resolved bytes hash to the ORIGINAL publication\'s own contentHash');

        console.log('✓ Section A: an existing local publication is placed on a fake IPFS network and independently resolved by a second replica');
    }

    // -------------------------------------------------------------
    // Section B — registry: keyed by the store's own `storage`.
    // -------------------------------------------------------------
    {
        const registry = new SnapshotPlacementStoreRegistry();
        const local = new LocalContentStore(new InMemoryStorageProvider());
        const ipfs = new IpfsContentStore({ fetchImpl: makeFakeIpfsNode(new Map()) });

        registry.register(local);
        registry.register(ipfs);

        assert(registry.get('local') === local, '13. "local" resolves to the LocalContentStore instance');
        assert(registry.get('ipfs') === ipfs, '14. "ipfs" resolves to the IpfsContentStore instance');
        assert(registry.get('arweave') === null, '15. an unregistered storage name returns null, never throws');
        assert(registry.storageTypes.sort().join(',') === 'ipfs,local', '16. storageTypes lists every registered storage name');

        registry.unregister('local');
        assert(registry.get('local') === null, '17. unregister() removes a store from the lookup');

        let threw = false;
        try {
            registry.register({ storage: 'broken' });
        } catch {
            threw = true;
        }
        assert(threw, '18. registering something without put()/get() throws');

        console.log('✓ Section B: SnapshotPlacementStoreRegistry is keyed by each store\'s own storage name');
    }

    // -------------------------------------------------------------
    // Section C — creation failure modes.
    // -------------------------------------------------------------
    {
        const { alice, publication, discoveryProvider, contentResolver, storage } = publishLocally('Watchtower');
        const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const ipfs = new IpfsContentStore({ fetchImpl: makeFakeIpfsNode(new Map()) });
        const orchestrator = new CreateSnapshotPlacementOrchestratorUseCase().execute({
            discoveryProvider, contentResolver, placementCatalog, identityProvider: alice, stores: [ipfs]
        });
        const { createExternalSnapshotPlacementUseCase } = orchestrator;

        let threw = false;
        try {
            await createExternalSnapshotPlacementUseCase.execute('not-a-real-publication-id', 'ipfs');
        } catch (error) {
            threw = /not found/.test(error.message);
        }
        assert(threw, '19. an unknown publicationId throws');

        threw = false;
        try {
            await createExternalSnapshotPlacementUseCase.execute(publication.id, 'arweave');
        } catch (error) {
            threw = /no content store registered/.test(error.message);
        }
        assert(threw, '20. an unregistered storage name throws');

        // Corrupt the locally stored snapshot bytes so the integrity
        // check fails, mirroring application/ResolvePublicationUseCase.js's
        // own identical refusal.
        const record = storage.load('forkbuild-publications').find((r) => r.id === publication.id);
        storage.save('snapshot:' + publication.id, { ...storage.load('snapshot:' + publication.id), tampered: true });
        threw = false;
        try {
            await createExternalSnapshotPlacementUseCase.execute(publication.id, 'ipfs');
        } catch (error) {
            threw = /integrity check failed/.test(error.message);
        }
        assert(threw, '21. a local integrity failure throws before anything is placed externally');
        assert(record.id === publication.id, '22. sanity: the publication record itself is untouched by the corruption above');

        // A store that throws yields PLACEMENT_UNAVAILABLE, never a
        // thrown error, and never a cataloged placement.
        const { publication: freshPublication, discoveryProvider: freshDiscovery, contentResolver: freshResolver } = publishLocally('Lighthouse');
        const throwingStore = { storage: 'ipfs', async put() { throw new Error('network unreachable'); }, async get() { return null; } };
        const freshCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const freshOrchestrator = new CreateSnapshotPlacementOrchestratorUseCase().execute({
            discoveryProvider: freshDiscovery, contentResolver: freshResolver, placementCatalog: freshCatalog,
            identityProvider: alice, stores: [throwingStore]
        });
        const failResult = await freshOrchestrator.createExternalSnapshotPlacementUseCase.execute(freshPublication.id, 'ipfs');
        assert(failResult.outcome === SnapshotPlacementCreationOutcome.PLACEMENT_UNAVAILABLE, '23. a throwing store yields PLACEMENT_UNAVAILABLE');
        assert(failResult.placement === null, '24. no placement is returned on PLACEMENT_UNAVAILABLE');
        assert(freshCatalog.findByPublicationId(freshPublication.id).length === 0, '25. no placement is cataloged on PLACEMENT_UNAVAILABLE');

        console.log('✓ Section C: unknown publication, unregistered storage, and local integrity failures throw; a failing store never fabricates a placement');
    }

    // -------------------------------------------------------------
    // Section D — resolution failure modes, five permanently
    // distinct outcomes.
    // -------------------------------------------------------------
    {
        const { alice, publication, discoveryProvider, contentResolver } = publishLocally('Bell Tower');
        const network = new Map();
        const ipfs = new IpfsContentStore({ fetchImpl: makeFakeIpfsNode(network) });
        const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const orchestrator = new CreateSnapshotPlacementOrchestratorUseCase().execute({
            discoveryProvider, contentResolver, placementCatalog, identityProvider: alice, stores: [ipfs]
        });
        const { placement } = await orchestrator.createExternalSnapshotPlacementUseCase.execute(publication.id, 'ipfs');

        const verifier = new LocalAuthorizationVerifier();
        const resolver = new SnapshotPlacementResolver(verifier);
        const registry = new SnapshotPlacementStoreRegistry().register(new IpfsContentStore({ fetchImpl: makeFakeIpfsNode(network) }));

        const malformed = await resolver.resolve({ not: 'a placement' }, { storeRegistry: registry });
        assert(malformed.outcome === SnapshotPlacementResolutionOutcome.INVALID_ENVELOPE, '26. a structurally malformed record reports INVALID_ENVELOPE');

        const tampered = { ...placement.toJSON(), locator: 'ipfs://someone-elses-cid' };
        const tamperedResult = await resolver.resolve(tampered, { storeRegistry: registry });
        assert(tamperedResult.outcome === SnapshotPlacementResolutionOutcome.INVALID_SIGNATURE, '27. a tampered field fails signature verification');

        const noStore = await resolver.resolve(placement.toJSON(), { storeRegistry: new SnapshotPlacementStoreRegistry() });
        assert(noStore.outcome === SnapshotPlacementResolutionOutcome.STORE_UNAVAILABLE, '28. no registered store for this storage reports STORE_UNAVAILABLE');

        const emptyNetworkRegistry = new SnapshotPlacementStoreRegistry().register(new IpfsContentStore({ fetchImpl: makeFakeIpfsNode(new Map()) }));
        const unavailable = await resolver.resolve(placement.toJSON(), { storeRegistry: emptyNetworkRegistry });
        assert(unavailable.outcome === SnapshotPlacementResolutionOutcome.CONTENT_UNAVAILABLE, '29. a store with no knowledge of this CID reports CONTENT_UNAVAILABLE, never invalid');

        const mismatchStore = { storage: 'ipfs', async put(bytes) { return { hash: computeContentHash(bytes) }; }, async get() { return JSON.stringify({ not: 'the same content' }); } };
        const mismatchRegistry = new SnapshotPlacementStoreRegistry().register(mismatchStore);
        const mismatch = await resolver.resolve(placement.toJSON(), { storeRegistry: mismatchRegistry });
        assert(mismatch.outcome === SnapshotPlacementResolutionOutcome.CONTENT_HASH_MISMATCH, '30. bytes that do not hash to the placement\'s own contentHash report CONTENT_HASH_MISMATCH');

        const outcomes = new Set([
            malformed.outcome, tamperedResult.outcome, noStore.outcome, unavailable.outcome, mismatch.outcome
        ]);
        assert(outcomes.size === 5, '31. all five failure outcomes are permanently distinct from one another');

        console.log('✓ Section D: INVALID_ENVELOPE, INVALID_SIGNATURE, STORE_UNAVAILABLE, CONTENT_UNAVAILABLE, and CONTENT_HASH_MISMATCH never collapse into one another');
    }

    // -------------------------------------------------------------
    // Section E — two independent placements for the same
    // publication, on different storage backends, both cataloged.
    // -------------------------------------------------------------
    {
        const { alice, publication, discoveryProvider, contentResolver } = publishLocally('Two Docks');
        const ipfsA = new IpfsContentStore({ fetchImpl: makeFakeIpfsNode(new Map()) });
        const ipfsB = { storage: 'other-ipfs-gateway', async put(bytes) { return { hash: computeContentHash(bytes), uri: 'other-ipfs://fake' }; }, async get() { return null; } };
        const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const orchestrator = new CreateSnapshotPlacementOrchestratorUseCase().execute({
            discoveryProvider, contentResolver, placementCatalog, identityProvider: alice, stores: [ipfsA, ipfsB]
        });

        const first = await orchestrator.createExternalSnapshotPlacementUseCase.execute(publication.id, 'ipfs');
        const second = await orchestrator.createExternalSnapshotPlacementUseCase.execute(publication.id, 'other-ipfs-gateway');

        assert(first.outcome === SnapshotPlacementCreationOutcome.CREATED && second.outcome === SnapshotPlacementCreationOutcome.CREATED, '32. both placements succeed independently');
        assert(first.placement.id !== second.placement.id, '33. two placements for the same publication get two distinct ids');
        const known = placementCatalog.findByPublicationId(publication.id);
        assert(known.length === 2, '34. both placements are cataloged, neither replacing the other');
        assert(placementCatalog.findByContentHash(publication.contentReference.hash).length === 2, '35. both are also discoverable by contentHash');
        assert(placementCatalog.findByStorage('ipfs').length === 1 && placementCatalog.findByStorage('other-ipfs-gateway').length === 1, '36. each is discoverable by its own storage name');

        console.log('✓ Section E: independent placements on different storage backends coexist, unranked');
    }

    // -------------------------------------------------------------
    // Section F — model invariants.
    // -------------------------------------------------------------
    {
        let threw = false;
        try { new PublicationSnapshotPlacement({ contentHash: 'x', storage: 'ipfs', locator: 'ipfs://x' }); } catch { threw = true; }
        assert(threw, '37. publicationId is required');

        threw = false;
        try { new PublicationSnapshotPlacement({ publicationId: 'p', storage: 'ipfs', locator: 'ipfs://x' }); } catch { threw = true; }
        assert(threw, '38. contentHash is required');

        threw = false;
        try { new PublicationSnapshotPlacement({ publicationId: 'p', contentHash: 'x', locator: 'ipfs://x' }); } catch { threw = true; }
        assert(threw, '39. storage is required');

        threw = false;
        try { new PublicationSnapshotPlacement({ publicationId: 'p', contentHash: 'x', storage: 'ipfs' }); } catch { threw = true; }
        assert(threw, '40. locator is required');

        const placement = new PublicationSnapshotPlacement({
            publicationId: 'p1', contentHash: 'h1', storage: 'ipfs', locator: 'ipfs://cid1',
            placerIdentity: { id: 'id1', algorithm: 'Ed25519', publicKey: 'fake-public-key' }
        });
        const fakeSignature = { algorithm: 'Ed25519', signer: 'id1', signature: 'sig', signedHash: 'sh', domain: 'forkbuild/publication-snapshot-placement' };
        const signed = placement.withSignature(fakeSignature);
        assert(signed !== placement, '41. withSignature() never mutates the original instance');
        assert(placement.signature === null, '42. the original instance remains unsigned');
        assert(signed.signature.signer === 'id1', '43. the new instance carries the supplied signature');

        const roundTripped = PublicationSnapshotPlacement.fromJSON(signed.toJSON());
        assert(roundTripped.id === signed.id && roundTripped.locator === signed.locator && roundTripped.storage === signed.storage,
            '44. toJSON()/fromJSON() round-trips every field');

        threw = false;
        try { validatePublicationSnapshotPlacement({ kind: 'not-a-placement' }); } catch (error) { threw = error instanceof PublicationSnapshotPlacementError; }
        assert(threw, '45. validatePublicationSnapshotPlacement rejects the wrong envelope kind with its own error type');

        // AddPublicationSnapshotPlacementUseCase — structural add, no
        // signature check, mirroring application/
        // AddPublicationAnchorUseCase.js's own restraint exactly.
        const catalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const addUseCase = new AddPublicationSnapshotPlacementUseCase(catalog);
        const { placement: added, isNew } = addUseCase.execute(signed.toJSON());
        assert(isNew === true && added.id === signed.id, '46. AddPublicationSnapshotPlacementUseCase catalogs a well-formed, even unverified, envelope');
        const { isNew: isNewAgain } = addUseCase.execute(signed.toJSON());
        assert(isNewAgain === false, '47. re-adding the identical placement id is first-seen-wins, never an error');

        console.log('✓ Section F: model invariants — required fields, signature immutability, round-tripping, structural add');
    }

    console.log('\nAll Decentralized Snapshot Placement tests passed.');
}

run().catch((error) => {
    console.error('DecentralizedSnapshotPlacement.test.js FAILED:', error);
    process.exitCode = 1;
});
