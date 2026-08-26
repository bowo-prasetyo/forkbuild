import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { IpfsContentStore } from '../content/IpfsContentStore.js';
import { computeContentHash } from '../serializer/contentHash.js';

import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/LocalPublicationSnapshotPlacementCatalog.js';
import { AddPublicationSnapshotPlacementUseCase } from '../application/AddPublicationSnapshotPlacementUseCase.js';
import { PublicationResolver } from '../application/PublicationResolver.js';
import { PublicationCatalogDiscoveryProvider } from '../discovery/PublicationCatalogDiscoveryProvider.js';
import { PublicationCatalogContentResolver } from '../discovery/PublicationCatalogContentResolver.js';
import { CreateSnapshotPlacementOrchestratorUseCase } from '../application/CreateSnapshotPlacementOrchestratorUseCase.js';
import { CreateSnapshotPlacementResolutionCoordinatorUseCase } from '../application/CreateSnapshotPlacementResolutionCoordinatorUseCase.js';

import { StoreSnapshotContentUseCase } from '../application/StoreSnapshotContentUseCase.js';
import { StoreSnapshotContentOutcome } from '../application/StoreSnapshotContentOutcome.js';
import { SnapshotMaterializationSourceKind } from '../application/SnapshotMaterializationSourceKind.js';
import { createSnapshotMaterializationAttempt } from '../application/SnapshotMaterializationAttempt.js';
import { describeSnapshotMaterializationSourceLabel, describeLocalSnapshotMaterializationSource } from '../application/SnapshotMaterializationView.js';

import { BuildPublicationSnapshotTransferPackageUseCase } from '../application/BuildPublicationSnapshotTransferPackageUseCase.js';
import { ImportPublicationSnapshotTransferPackageUseCase } from '../application/ImportPublicationSnapshotTransferPackageUseCase.js';
import { SnapshotContentTransferOutcome } from '../application/SnapshotContentTransferOutcome.js';

import { MaterializeSnapshotFromPlacementUseCase } from '../application/MaterializeSnapshotFromPlacementUseCase.js';
import { SnapshotPlacementMaterializationOutcome } from '../application/SnapshotPlacementMaterializationOutcome.js';

import { CheckLocalSnapshotContentAvailabilityUseCase } from '../application/CheckLocalSnapshotContentAvailabilityUseCase.js';
import { LocalSnapshotContentAvailabilityOutcome } from '../application/LocalSnapshotContentAvailabilityOutcome.js';

// 0.8.36 — Unified Explicit Snapshot Materialization Sources.
//
//   Section A: application/StoreSnapshotContentUseCase.js constructor
//              validation and execute() over all three application/
//              StoreSnapshotContentOutcome.js values, plus application/
//              SnapshotMaterializationSourceKind.js/application/
//              SnapshotMaterializationAttempt.js validation and
//              application/SnapshotMaterializationView.js's own pure
//              functions — including that neither source label is ever
//              "preferred," "best," "trusted," "primary," or "secondary."
//   Section B — FLAGSHIP: Alice publishes P, holds S locally, and creates
//              a real IPFS placement for it. Bob already knows both P and
//              the placement but does not possess S; he clicks
//              "Materialize Snapshot" and obtains it through the
//              PLACEMENT-backed route (source PLACEMENT). Carol,
//              completely independently, receives an offline Publication
//              Snapshot Transfer Package for the SAME publication and
//              clicks "Import Snapshot" (source PACKAGE). Both replicas
//              end up holding byte-identical content, both report
//              AVAILABLE through the SAME, unchanged application/
//              CheckLocalSnapshotContentAvailabilityUseCase.js (0.8.33),
//              and each one's own application/
//              SnapshotMaterializationAttempt.js names a different source
//              — neither described as better than the other.
//   Section C: content possession is idempotent across acquisition
//              mechanisms. Dave imports S via a transfer package first
//              (STORED), then materializes the SAME publication's IPFS
//              placement (ALREADY_AVAILABLE) — nothing is rewritten, and
//              the placement's own JSON is byte-identical before and
//              after. Erin does the reverse: materializes from the
//              placement first (STORED), then imports the identical
//              transfer package (ALREADY_STORED) — the identical
//              invariant, in the opposite order.
//
// See docs/Principles.md, "A Shared Storage Boundary Does Not Merge The
// Sources That Feed It (0.8.36)."

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

function fakeCid(text) {
    return 'bafyFAKE' + computeContentHash(text);
}

// The identical fake Kubo HTTP RPC API tests/SnapshotPlacementMaterialization
// .test.js's own makeFakeIpfsNode() already established.
function makeFakeIpfsNode(network = new Map()) {
    async function fetchImpl(url, options) {
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
    }
    return { network, fetchImpl };
}

// Mirrors the real ui/main.js composition root exactly (and tests/
// SnapshotPlacementMaterialization.test.js's own makePublicationCenter()).
function makePublicationCenter({ stores = [], identityProvider = makeIdentity('Alice') } = {}) {
    const publicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
    const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
    const publicationContentStore = new LocalContentStore(new InMemoryStorageProvider());
    const publicationResolver = new PublicationResolver(publicationContentStore, new LocalAuthorizationVerifier());

    const discoveryProvider = new PublicationCatalogDiscoveryProvider(publicationCatalog);
    const contentResolver = new PublicationCatalogContentResolver(publicationCatalog, publicationContentStore);

    const { createExternalSnapshotPlacementUseCase } = new CreateSnapshotPlacementOrchestratorUseCase().execute({
        discoveryProvider, contentResolver, placementCatalog, identityProvider, stores
    });

    return {
        publicationCatalog, placementCatalog, publicationContentStore, publicationResolver,
        identityProvider, createExternalSnapshotPlacementUseCase
    };
}

async function publishLocally(publicationResolver, publicationCatalog, identityProvider, content) {
    const publication = await publicationResolver.publish({ content, contentKind: 'forkbuild.structure', identityProvider });
    publicationCatalog.add(publication);
    return publication;
}

// Builds a fresh replica's own "materialize from placement" pipeline —
// its own catalogs, its own local content store, its own
// StoreSnapshotContentUseCase, and a resolution coordinator wired against
// the SAME fake IPFS node Alice's own placement was created through
// (`stores`) — mirroring ui/main.js's own composition exactly.
function makeReplicaPlacementPipeline(ipfsStore) {
    const publicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
    const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
    const contentStore = new LocalContentStore(new InMemoryStorageProvider());
    const storeSnapshotContentUseCase = new StoreSnapshotContentUseCase(contentStore);
    const { coordinator: resolutionCoordinator } = new CreateSnapshotPlacementResolutionCoordinatorUseCase().execute({
        placementCatalog, stores: [ipfsStore]
    });
    const materializeUseCase = new MaterializeSnapshotFromPlacementUseCase(resolutionCoordinator, storeSnapshotContentUseCase, publicationCatalog);
    return { publicationCatalog, placementCatalog, contentStore, storeSnapshotContentUseCase, materializeUseCase };
}

async function expectRejects(promise, message) {
    let threw = null;
    try { await promise; } catch (e) { threw = e; }
    assert(threw !== null, message);
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — StoreSnapshotContentUseCase, SnapshotMaterializationSourceKind,
    // SnapshotMaterializationAttempt, SnapshotMaterializationView
    // ---------------------------------------------------------------
    {
        let threw = false;
        try { new StoreSnapshotContentUseCase(null); } catch (e) { threw = true; }
        assert(threw, '1. StoreSnapshotContentUseCase constructor requires a local ContentStore');

        const contentStore = new LocalContentStore(new InMemoryStorageProvider());
        const storeUseCase = new StoreSnapshotContentUseCase(contentStore);

        await expectRejects(storeUseCase.execute({ contentHash: null, bytes: 'x' }), '2. execute() requires a contentHash');
        await expectRejects(storeUseCase.execute({ contentHash: 'deadbeef' }), '3. execute() requires bytes');

        const bytes = JSON.stringify({ section: 'a' });
        const hash = computeContentHash(bytes);

        const first = await storeUseCase.execute({ contentHash: hash, bytes });
        assert(first.outcome === StoreSnapshotContentOutcome.STORED, '4. verified bytes are STORED the first time');
        assert(first.contentReference.hash === hash, '5. the returned contentReference carries the correct hash');

        const second = await storeUseCase.execute({ contentHash: hash, bytes });
        assert(second.outcome === StoreSnapshotContentOutcome.ALREADY_AVAILABLE, '6. storing the identical bytes again reports ALREADY_AVAILABLE, never an error');

        const tampered = await storeUseCase.execute({ contentHash: hash, bytes: 'these-are-not-the-original-bytes' });
        assert(tampered.outcome === StoreSnapshotContentOutcome.HASH_MISMATCH && tampered.contentReference === null,
            '7. bytes that do not hash to the claimed contentHash are rejected, and nothing is reported stored');
        assert((await contentStore.has({ hash: computeContentHash('these-are-not-the-original-bytes') })) === false,
            '8. INVARIANT: nothing is actually written to the ContentStore on HASH_MISMATCH');

        assert(SnapshotMaterializationSourceKind.PACKAGE !== SnapshotMaterializationSourceKind.PLACEMENT,
            '9. the two source kinds are distinct values');
        assert(Object.isFrozen(SnapshotMaterializationSourceKind), '10. the source kind vocabulary is frozen');

        threw = false;
        try { createSnapshotMaterializationAttempt({ sourceKind: 'not-a-real-kind', outcome: StoreSnapshotContentOutcome.STORED }); } catch (e) { threw = true; }
        assert(threw, '11. createSnapshotMaterializationAttempt() rejects an unrecognized source kind');
        threw = false;
        try { createSnapshotMaterializationAttempt({ sourceKind: SnapshotMaterializationSourceKind.PACKAGE }); } catch (e) { threw = true; }
        assert(threw, '12. createSnapshotMaterializationAttempt() requires an outcome');

        const packageAttempt = createSnapshotMaterializationAttempt({
            sourceKind: SnapshotMaterializationSourceKind.PACKAGE, outcome: StoreSnapshotContentOutcome.STORED, contentReference: first.contentReference
        });
        assert(packageAttempt.source.kind === SnapshotMaterializationSourceKind.PACKAGE, '13. the attempt carries the source kind it was built with');
        assert(Object.isFrozen(packageAttempt) && Object.isFrozen(packageAttempt.source), '14. an attempt record is frozen, exactly like application/SnapshotPlacementResolutionObservation.js\'s own record');

        assert(describeSnapshotMaterializationSourceLabel(SnapshotMaterializationSourceKind.PACKAGE) === 'Transfer package', '15. the package source has its own label');
        assert(describeSnapshotMaterializationSourceLabel(SnapshotMaterializationSourceKind.PLACEMENT) === 'Placement', '16. the placement source has its own, DIFFERENT label');
        assert(describeSnapshotMaterializationSourceLabel(null) === null, '17. an absent kind reports no label');

        const packageView = describeLocalSnapshotMaterializationSource(packageAttempt);
        assert(packageView.possessed === true && packageView.sourceLabel === 'Transfer package', '18. a STORED attempt is reported as possessed, with its own source label');

        const placementAttempt = createSnapshotMaterializationAttempt({
            sourceKind: SnapshotMaterializationSourceKind.PLACEMENT, outcome: StoreSnapshotContentOutcome.ALREADY_AVAILABLE
        });
        const placementView = describeLocalSnapshotMaterializationSource(placementAttempt);
        assert(placementView.possessed === true && placementView.sourceLabel === 'Placement', '19. ALREADY_AVAILABLE is possession too, exactly like STORED');

        const rejectedAttempt = createSnapshotMaterializationAttempt({
            sourceKind: SnapshotMaterializationSourceKind.PACKAGE, outcome: StoreSnapshotContentOutcome.HASH_MISMATCH
        });
        assert(describeLocalSnapshotMaterializationSource(rejectedAttempt).possessed === false, '20. a rejected attempt is never reported as possessed');
        assert(describeLocalSnapshotMaterializationSource(null).possessed === false, '21. no attempt at all is never reported as possessed');

        // No adjective ever ranks one source over the other — the whole
        // point of this milestone's own vocabulary.
        const forbiddenWords = ['preferred', 'best', 'trusted', 'primary', 'secondary', 'recommended', 'verified via', 'canonical'];
        for (const word of ['Transfer package', 'Placement']) {
            for (const forbidden of forbiddenWords) {
                assert(!word.toLowerCase().includes(forbidden), `22. source label "${word}" never contains the forbidden word "${forbidden}"`);
            }
        }
    }
    console.log('✓ Section A: StoreSnapshotContentUseCase, SnapshotMaterializationSourceKind/Attempt, and the unified view functions');

    // ---------------------------------------------------------------
    // Section B — FLAGSHIP: two independent replicas, two independent
    // explicit sources, one identical possession state
    // ---------------------------------------------------------------
    {
        const network = new Map();
        const { fetchImpl } = makeFakeIpfsNode(network);
        const aliceIpfs = new IpfsContentStore({ apiUrl: 'http://alice-node.test:5001', fetchImpl });

        const { publicationCatalog: alicePublicationCatalog, publicationContentStore: aliceContentStore, publicationResolver, identityProvider,
            createExternalSnapshotPlacementUseCase } = makePublicationCenter({ stores: [aliceIpfs] });

        const publication = await publishLocally(publicationResolver, alicePublicationCatalog, identityProvider, { flagship: '0.8.36' });
        const { placement } = await createExternalSnapshotPlacementUseCase.execute(publication.id, 'ipfs');

        // --- Bob: already knows the publication and the placement (some
        // other exchange delivered both), but has never touched his own
        // content store. He clicks "Materialize Snapshot." ---
        const bobIpfs = new IpfsContentStore({ apiUrl: 'http://bob-node.test:5001', fetchImpl });
        const bob = makeReplicaPlacementPipeline(bobIpfs);
        bob.publicationCatalog.add(publication);
        new AddPublicationSnapshotPlacementUseCase(bob.placementCatalog).execute(placement.toJSON());

        assert((await bob.contentStore.has(publication.contentReference)) === false, '1. before materializing, Bob does not yet possess the bytes');
        const bobResult = await bob.materializeUseCase.execute(placement);
        assert(bobResult.outcome === SnapshotPlacementMaterializationOutcome.STORED, '2. Bob materializes the placement — outcome STORED');
        assert(bobResult.source.kind === SnapshotMaterializationSourceKind.PLACEMENT, '3. the result names its own source: PLACEMENT');

        // --- Carol: a completely separate replica, who never learns
        // about the IPFS placement at all — she receives an offline
        // Publication Snapshot Transfer Package instead. ---
        const transferPackage = await new BuildPublicationSnapshotTransferPackageUseCase({
            publicationCatalog: alicePublicationCatalog, contentStore: aliceContentStore
        }).execute(publication.id);

        const carolContentStore = new LocalContentStore(new InMemoryStorageProvider());
        const carolPublicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const carolImporter = new ImportPublicationSnapshotTransferPackageUseCase(new StoreSnapshotContentUseCase(carolContentStore), carolPublicationCatalog);

        assert((await carolContentStore.has(publication.contentReference)) === false, '4. before importing, Carol does not yet possess the bytes');
        const carolResult = await carolImporter.execute(transferPackage);
        assert(carolResult.outcome === SnapshotContentTransferOutcome.STORED, '5. Carol imports the transfer package — outcome STORED');
        assert(carolResult.source.kind === SnapshotMaterializationSourceKind.PACKAGE, '6. the result names its own DIFFERENT source: PACKAGE');

        // --- The bridge: both replicas now independently report
        // AVAILABLE through the SAME, unchanged 0.8.33 check, and both
        // hold byte-identical content. ---
        const bobAvailability = await new CheckLocalSnapshotContentAvailabilityUseCase(bob.contentStore).execute(publication);
        const carolAvailability = await new CheckLocalSnapshotContentAvailabilityUseCase(carolContentStore).execute(publication);
        assert(bobAvailability.outcome === LocalSnapshotContentAvailabilityOutcome.AVAILABLE, '7. Bob\'s local availability check reports AVAILABLE');
        assert(carolAvailability.outcome === LocalSnapshotContentAvailabilityOutcome.AVAILABLE, '8. Carol\'s local availability check reports AVAILABLE');

        const bobBytes = await bob.contentStore.get(bobResult.contentReference);
        const carolBytes = await carolContentStore.get(carolResult.contentReference);
        assert(bobBytes === carolBytes, '9. Bob and Carol hold BYTE-IDENTICAL content, obtained through two entirely different explicit sources');
        assert(bobResult.contentReference.hash === carolResult.contentReference.hash && bobResult.contentReference.hash === publication.contentReference.hash,
            '10. both contentReferences carry the identical hash, matching the publication\'s own claim');

        // --- Neither route is described as better than the other. ---
        const bobAttempt = createSnapshotMaterializationAttempt({
            sourceKind: bobResult.source.kind, outcome: StoreSnapshotContentOutcome.STORED, contentReference: bobResult.contentReference
        });
        const carolAttempt = createSnapshotMaterializationAttempt({
            sourceKind: carolResult.source.kind, outcome: StoreSnapshotContentOutcome.STORED, contentReference: carolResult.contentReference
        });
        assert(describeLocalSnapshotMaterializationSource(bobAttempt).sourceLabel === 'Placement', '11. Bob\'s own unified view names his source as "Placement"');
        assert(describeLocalSnapshotMaterializationSource(carolAttempt).sourceLabel === 'Transfer package', '12. Carol\'s own unified view names her source as "Transfer package"');

        // --- The placement itself is untouched by either route. ---
        const placementJsonBefore = JSON.stringify(placement.toJSON());
        const bobPlacementAfter = bob.placementCatalog.findByPublicationId(publication.id)[0];
        assert(JSON.stringify(bobPlacementAfter.toJSON()) === placementJsonBefore, '13. the placement\'s own JSON is unchanged after materialization');
    }
    console.log('✓ Section B: FLAGSHIP — Bob (placement) and Carol (package) reach byte-identical local possession through two independent explicit sources');

    // ---------------------------------------------------------------
    // Section C — content possession is idempotent across acquisition
    // mechanisms, in both orders
    // ---------------------------------------------------------------
    {
        const network = new Map();
        const { fetchImpl } = makeFakeIpfsNode(network);
        const aliceIpfs = new IpfsContentStore({ apiUrl: 'http://alice-node-c.test:5001', fetchImpl });
        const { publicationCatalog: alicePublicationCatalog, publicationContentStore: aliceContentStore, publicationResolver, identityProvider,
            createExternalSnapshotPlacementUseCase } = makePublicationCenter({ stores: [aliceIpfs], identityProvider: makeIdentity('Alice-C') });

        const publication = await publishLocally(publicationResolver, alicePublicationCatalog, identityProvider, { section: 'c' });
        const { placement } = await createExternalSnapshotPlacementUseCase.execute(publication.id, 'ipfs');
        const transferPackage = await new BuildPublicationSnapshotTransferPackageUseCase({
            publicationCatalog: alicePublicationCatalog, contentStore: aliceContentStore
        }).execute(publication.id);

        // --- Dave: package first, then placement. ---
        {
            const daveIpfs = new IpfsContentStore({ apiUrl: 'http://dave-node.test:5001', fetchImpl });
            const dave = makeReplicaPlacementPipeline(daveIpfs);
            dave.publicationCatalog.add(publication);
            new AddPublicationSnapshotPlacementUseCase(dave.placementCatalog).execute(placement.toJSON());
            const daveImporter = new ImportPublicationSnapshotTransferPackageUseCase(dave.storeSnapshotContentUseCase, dave.publicationCatalog);

            const daveImportResult = await daveImporter.execute(transferPackage);
            assert(daveImportResult.outcome === SnapshotContentTransferOutcome.STORED, '1. Dave imports the package first — STORED');

            const placementJsonBefore = JSON.stringify(dave.placementCatalog.findByPublicationId(publication.id)[0].toJSON());
            const daveMaterializeResult = await dave.materializeUseCase.execute(placement);
            assert(daveMaterializeResult.outcome === SnapshotPlacementMaterializationOutcome.ALREADY_AVAILABLE,
                '2. Dave then materializes the identical publication\'s placement — ALREADY_AVAILABLE, never STORED again, never an error');
            assert(daveMaterializeResult.source.kind === SnapshotMaterializationSourceKind.PLACEMENT, '3. the second attempt still correctly names its own source as PLACEMENT');

            const placementJsonAfter = JSON.stringify(dave.placementCatalog.findByPublicationId(publication.id)[0].toJSON());
            assert(placementJsonBefore === placementJsonAfter, '4. INVARIANT: the placement\'s own JSON is byte-identical before and after the redundant materialization');
            assert(dave.placementCatalog.findByPublicationId(publication.id).length === 1, '5. INVARIANT: no second/duplicate placement record was created');
            assert((await dave.contentStore.get(daveMaterializeResult.contentReference)) === (await dave.contentStore.get(daveImportResult.contentReference)),
                '6. the bytes themselves are unchanged — the second write is a genuine no-op over the same content');
        }

        // --- Erin: the exact reverse order — placement first, then
        // package. ---
        {
            const erinIpfs = new IpfsContentStore({ apiUrl: 'http://erin-node.test:5001', fetchImpl });
            const erin = makeReplicaPlacementPipeline(erinIpfs);
            erin.publicationCatalog.add(publication);
            new AddPublicationSnapshotPlacementUseCase(erin.placementCatalog).execute(placement.toJSON());
            const erinImporter = new ImportPublicationSnapshotTransferPackageUseCase(erin.storeSnapshotContentUseCase, erin.publicationCatalog);

            const erinMaterializeResult = await erin.materializeUseCase.execute(placement);
            assert(erinMaterializeResult.outcome === SnapshotPlacementMaterializationOutcome.STORED, '7. Erin materializes the placement first — STORED');

            const erinImportResult = await erinImporter.execute(transferPackage);
            assert(erinImportResult.outcome === SnapshotContentTransferOutcome.ALREADY_STORED,
                '8. Erin then imports the identical publication\'s transfer package — ALREADY_STORED, never STORED again, never an error');
            assert(erinImportResult.source.kind === SnapshotMaterializationSourceKind.PACKAGE, '9. the second attempt still correctly names its own source as PACKAGE');

            assert((await erin.contentStore.get(erinImportResult.contentReference)) === (await erin.contentStore.get(erinMaterializeResult.contentReference)),
                '10. the bytes themselves are unchanged in the reverse order too');
        }
    }
    console.log('✓ Section C: content possession is idempotent across acquisition mechanisms, in both orders — nothing is rewritten, nothing is duplicated');

    console.log('\n✅ All SnapshotMaterializationUnification tests passed');
}

run().catch((error) => {
    console.error('❌ SnapshotMaterializationUnification tests failed:', error);
    process.exitCode = 1;
});
