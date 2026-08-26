import {
    buildPublicationSnapshotTransferPackage,
    PUBLICATION_SNAPSHOT_TRANSFER_PACKAGE_KIND,
    CURRENT_SCHEMA_VERSION
} from '../application/PublicationSnapshotTransferPackage.js';
import {
    validatePublicationSnapshotTransferPackage,
    PublicationSnapshotTransferPackageError
} from '../application/PublicationSnapshotTransferPackageValidator.js';
import { BuildPublicationSnapshotTransferPackageUseCase } from '../application/BuildPublicationSnapshotTransferPackageUseCase.js';
import { ImportPublicationSnapshotTransferPackageUseCase } from '../application/ImportPublicationSnapshotTransferPackageUseCase.js';
import { StoreSnapshotContentUseCase } from '../application/StoreSnapshotContentUseCase.js';
import { SnapshotContentTransferOutcome } from '../application/SnapshotContentTransferOutcome.js';
import { buildPublicationReplicaPackage } from '../application/PublicationReplicaPackage.js';
import { ImportPublicationReplicaPackageUseCase } from '../application/ImportPublicationReplicaPackageUseCase.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { PublicationExchange } from '../application/PublicationExchange.js';
import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { ContentReference } from '../core/ContentReference.js';
import { LocalPublicationAnchorCatalog } from '../application/LocalPublicationAnchorCatalog.js';
import { PublicationAnchorExchange } from '../application/PublicationAnchorExchange.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/LocalPublicationSnapshotPlacementCatalog.js';
import { PublicationSnapshotPlacementExchange } from '../application/PublicationSnapshotPlacementExchange.js';
import { PublicationSnapshotPlacement } from '../core/PublicationSnapshotPlacement.js';
import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.8.32 — Explicit Snapshot Content Transfer.
//
//   Section A: buildPublicationSnapshotTransferPackage() argument handling
//              — missing publicationId, a contentReference with no hash,
//              missing/empty content, and the deterministic "identical
//              inputs -> byte-identical package" invariant.
//   Section B: validatePublicationSnapshotTransferPackage() structural
//              checks — wrong kind, wrong schemaVersion, a missing/
//              malformed publicationId/contentHash/content, all raised as
//              PublicationSnapshotTransferPackageError.
//   Section C: FLAGSHIP — Alice publishes a publication, anchors it,
//              places it, builds BOTH a Publication Replica Package
//              (0.8.29, unchanged) and a Publication Snapshot Transfer
//              Package (this milestone), then goes offline for good. Bob
//              imports the replica package (knows the publication, the
//              anchor, the placement) and separately imports the
//              transfer package (obtains the actual bytes) — entirely
//              offline, in two deliberate steps — and proves he never
//              needed the IPFS placement to possess the snapshot. Carol,
//              by contrast, imports ONLY the replica package: she knows
//              exactly where the snapshot is CLAIMED to be, and does not
//              possess it. A restart (fresh ContentStore instance over
//              the identical underlying storage) leaves Bob's content
//              byte-identical.
//   Section D: edge cases — content tampered in transit is rejected as
//              CONTENT_HASH_MISMATCH with nothing stored; importing the
//              identical package twice reports ALREADY_STORED the second
//              time; `publicationKnown` is a plain, order-independent
//              observation that never gates storage either way; build-
//              side errors for an uncataloged publication and for a
//              cataloged publication whose bytes this replica does not
//              actually hold.
//
// See docs/Principles.md, "Knowledge Of Content Is Not Possession Of
// Content (0.8.32)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, errorClass, message) {
    let threw = null;
    try { fn(); } catch (e) { threw = e; }
    assert(threw !== null, message);
    if (errorClass) {
        assert(threw instanceof errorClass, `${message} (wrong error type: ${threw && threw.constructor.name})`);
    }
}

async function expectRejects(promise, errorClass, message) {
    let threw = null;
    try { await promise; } catch (e) { threw = e; }
    assert(threw !== null, message);
    if (errorClass) {
        assert(threw instanceof errorClass, `${message} (wrong error type: ${threw && threw.constructor.name})`);
    }
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

function signAnchor(identityProvider, fields) {
    let anchor = new PublicationAnchor({ ...fields, anchorIdentity: identityProvider.getSigningIdentity().toJSON() });
    anchor = anchor.withSignature(identityProvider.signCanonical(anchor.getSigningDescriptor()));
    return anchor;
}

function signPlacement(identityProvider, fields) {
    let placement = new PublicationSnapshotPlacement({ ...fields, placerIdentity: identityProvider.getSigningIdentity().toJSON() });
    placement = placement.withSignature(identityProvider.signCanonical(placement.getSigningDescriptor()));
    return placement;
}

function signPublication(identityProvider, fields) {
    let publication = new DecentralizedPublication({ ...fields, publisherIdentity: identityProvider.getSigningIdentity().toJSON() });
    publication = publication.withSignature(identityProvider.signCanonical(publication.getSigningDescriptor()));
    return publication;
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — buildPublicationSnapshotTransferPackage() argument
    // handling
    // ---------------------------------------------------------------
    {
        const reference = new ContentReference({ hash: 'a1b2c3' });

        expectThrows(() => buildPublicationSnapshotTransferPackage(null, reference, 'bytes'), Error, '1. a publicationId is required');
        expectThrows(() => buildPublicationSnapshotTransferPackage('   ', reference, 'bytes'), Error, '2. a blank publicationId is rejected');
        expectThrows(() => buildPublicationSnapshotTransferPackage('pub-a', null, 'bytes'), Error, '3. a contentReference is required');
        expectThrows(() => buildPublicationSnapshotTransferPackage('pub-a', new ContentReference({ hash: null }), 'bytes'), Error, '4. a contentReference with no hash is rejected');
        expectThrows(() => buildPublicationSnapshotTransferPackage('pub-a', reference, null), Error, '5. content is required');
        expectThrows(() => buildPublicationSnapshotTransferPackage('pub-a', reference, ''), Error, '6. empty content is rejected');

        const pkg = buildPublicationSnapshotTransferPackage('pub-a', reference, 'the-actual-bytes');
        assert(pkg.kind === PUBLICATION_SNAPSHOT_TRANSFER_PACKAGE_KIND && pkg.schemaVersion === CURRENT_SCHEMA_VERSION,
            '7. kind/schemaVersion are stamped correctly');
        assert(pkg.publicationId === 'pub-a' && pkg.contentHash === 'a1b2c3' && pkg.content === 'the-actual-bytes',
            '8. publicationId/contentHash/content carry the exact values supplied');

        assert(JSON.stringify(buildPublicationSnapshotTransferPackage('pub-a', reference, 'the-actual-bytes')) === JSON.stringify(pkg),
            '9. deterministic: identical inputs produce byte-identical package JSON on every call');

        // A plain JSON contentReference (as would arrive off the wire) is
        // accepted exactly like a real ContentReference instance.
        const pkgFromJson = buildPublicationSnapshotTransferPackage('pub-a', { hash: 'a1b2c3' }, 'the-actual-bytes');
        assert(pkgFromJson.contentHash === 'a1b2c3', '10. a plain JSON contentReference is accepted the same as an instance');
    }
    console.log('✓ Section A: buildPublicationSnapshotTransferPackage() argument handling');

    // ---------------------------------------------------------------
    // Section B — validatePublicationSnapshotTransferPackage()
    // structural checks
    // ---------------------------------------------------------------
    {
        const validPackage = buildPublicationSnapshotTransferPackage('pub-b', new ContentReference({ hash: 'deadbeef' }), 'snapshot-bytes');

        expectThrows(() => validatePublicationSnapshotTransferPackage(null), PublicationSnapshotTransferPackageError, '1. package is required');
        expectThrows(() => validatePublicationSnapshotTransferPackage({ ...validPackage, kind: 'something-else' }), PublicationSnapshotTransferPackageError, '2. wrong kind is rejected');
        expectThrows(() => validatePublicationSnapshotTransferPackage({ ...validPackage, schemaVersion: 999 }), PublicationSnapshotTransferPackageError, '3. wrong schemaVersion is rejected');
        expectThrows(() => validatePublicationSnapshotTransferPackage({ ...validPackage, publicationId: '' }), PublicationSnapshotTransferPackageError, '4. missing publicationId is rejected');
        expectThrows(() => validatePublicationSnapshotTransferPackage({ ...validPackage, contentHash: '' }), PublicationSnapshotTransferPackageError, '5. missing contentHash is rejected');
        expectThrows(() => validatePublicationSnapshotTransferPackage({ ...validPackage, contentHash: 'not valid hex!' }), PublicationSnapshotTransferPackageError, '6. a malformed contentHash is rejected');
        expectThrows(() => validatePublicationSnapshotTransferPackage({ ...validPackage, content: '' }), PublicationSnapshotTransferPackageError, '7. empty content is rejected');
        expectThrows(() => validatePublicationSnapshotTransferPackage({ ...validPackage, content: 12345 }), PublicationSnapshotTransferPackageError, '8. non-string content is rejected');

        validatePublicationSnapshotTransferPackage(validPackage); // 9. does not throw for a well-formed package
        console.log('  9. a well-formed package passes validation without throwing');
    }
    console.log('✓ Section B: validatePublicationSnapshotTransferPackage() structural checks');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP: offline snapshot content transfer,
    // independent of placement resolution, surviving a restart
    // ---------------------------------------------------------------
    {
        const PUBLICATION_ID = 'pub-flagship-content-transfer';
        const SNAPSHOT_BYTES = JSON.stringify({ hello: 'flagship snapshot bytes' });

        // --- Alice: publishes P, holds S locally, anchors it, places it
        // on IPFS, and builds BOTH kinds of package — then is NEVER
        // online again anywhere in this test. ---
        const alice = makeIdentity('Alice-Content');
        const aliceContentStore = new LocalContentStore(new InMemoryStorageProvider());
        const contentReference = aliceContentStore.put(SNAPSHOT_BYTES);

        const publication = signPublication(alice, { id: PUBLICATION_ID, contentKind: 'forkbuild.structure', contentReference });
        const anchor = signAnchor(alice, { publicationId: PUBLICATION_ID, contentHash: contentReference.hash, anchorType: 'bitcoin-op-return', locator: 'bitcoin://tx/content-transfer' });
        const placement = signPlacement(alice, { publicationId: PUBLICATION_ID, contentHash: contentReference.hash, storage: 'ipfs', locator: 'ipfs://CID-content-transfer' });

        const alicePublicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        alicePublicationCatalog.add(publication);

        const replicaPackage = buildPublicationReplicaPackage(publication, { anchors: [anchor], placements: [placement] });

        const aliceSnapshotBuilder = new BuildPublicationSnapshotTransferPackageUseCase({
            publicationCatalog: alicePublicationCatalog, contentStore: aliceContentStore
        });
        const transferPackage = await aliceSnapshotBuilder.execute(PUBLICATION_ID);
        assert(transferPackage.publicationId === PUBLICATION_ID && transferPackage.contentHash === contentReference.hash && transferPackage.content === SNAPSHOT_BYTES,
            '1. Alice builds a snapshot transfer package carrying the real, locally-stored bytes');

        // --- Bob: starts knowing NOTHING, imports the replica package
        // offline (knows P/A/L), then SEPARATELY imports the transfer
        // package offline (obtains S). No network object of any kind
        // exists anywhere in this block. ---
        let bobPublicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        let bobAnchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
        let bobPlacementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const bobContentStorage = new InMemoryStorageProvider();
        let bobContentStore = new LocalContentStore(bobContentStorage);

        let bobPublicationExchange = new PublicationExchange(bobPublicationCatalog, new LocalAuthorizationVerifier());
        let bobAnchorExchange = new PublicationAnchorExchange(bobAnchorCatalog, new LocalAuthorizationVerifier());
        let bobPlacementExchange = new PublicationSnapshotPlacementExchange(bobPlacementCatalog, new LocalAuthorizationVerifier());
        let bobReplicaImporter = new ImportPublicationReplicaPackageUseCase(bobPublicationExchange, bobAnchorExchange, bobPlacementExchange);

        const bobReplicaResult = bobReplicaImporter.execute(replicaPackage);
        assert(bobReplicaResult.publication.id === PUBLICATION_ID && bobReplicaResult.importedAnchors.length === 1 && bobReplicaResult.importedPlacements.length === 1,
            '2. Bob imports the replica package offline — he now knows the publication, the anchor, and the placement');
        assert((await bobContentStore.has(contentReference)) === false,
            '3. Before importing the transfer package, Bob does NOT possess the snapshot bytes, even though he already knows the placement claiming where they can be found');

        let bobSnapshotImporter = new ImportPublicationSnapshotTransferPackageUseCase(new StoreSnapshotContentUseCase(bobContentStore), bobPublicationCatalog);
        const bobTransferResult = await bobSnapshotImporter.execute(transferPackage);
        assert(bobTransferResult.outcome === SnapshotContentTransferOutcome.STORED, '4. Bob imports the transfer package offline — outcome is STORED');
        assert(bobTransferResult.publicationKnown === true, '5. publicationKnown reports true — Bob already knew this publication from the replica package');
        assert(bobTransferResult.contentReference.hash === contentReference.hash, '6. the stored contentReference carries the correct hash');

        assert((await bobContentStore.get(contentReference)) === SNAPSHOT_BYTES,
            '7. Bob now possesses the exact snapshot bytes, retrievable from his own local ContentStore');
        assert(contentReference.verify(await bobContentStore.get(contentReference)) === true,
            '8. Bob\'s locally stored bytes verify against the publication\'s own contentReference hash');

        // THE KEY DEMONSTRATION: Bob obtained S entirely through the
        // offline transfer package. Neither application/
        // SnapshotPlacementResolver.js nor any network object was ever
        // constructed, referenced, or called anywhere in this test —
        // Bob never needed the IPFS placement to possess the snapshot.
        console.log('  9. Bob possesses the snapshot bytes without ever resolving the IPFS placement — content transfer and placement resolution are independent paths to the same bytes');

        // --- Carol, by contrast, imports ONLY the replica package. She
        // knows exactly where the snapshot is CLAIMED to be, and does
        // NOT possess it. ---
        let carolPublicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        let carolAnchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
        let carolPlacementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        let carolContentStore = new LocalContentStore(new InMemoryStorageProvider());

        let carolPublicationExchange = new PublicationExchange(carolPublicationCatalog, new LocalAuthorizationVerifier());
        let carolAnchorExchange = new PublicationAnchorExchange(carolAnchorCatalog, new LocalAuthorizationVerifier());
        let carolPlacementExchange = new PublicationSnapshotPlacementExchange(carolPlacementCatalog, new LocalAuthorizationVerifier());
        let carolReplicaImporter = new ImportPublicationReplicaPackageUseCase(carolPublicationExchange, carolAnchorExchange, carolPlacementExchange);
        carolReplicaImporter.execute(replicaPackage);

        assert(carolPlacementCatalog.findByPublicationId(PUBLICATION_ID)[0].locator === 'ipfs://CID-content-transfer',
            '10. Carol knows exactly where the snapshot is CLAIMED to be retrievable');
        assert((await carolContentStore.has(contentReference)) === false,
            '11. INVARIANT: Carol does not possess the snapshot bytes — knowledge of a placement is never possession of content');

        // --- Restart: fresh ContentStore instance over Bob's identical
        // underlying storage still holds the bytes. ---
        bobContentStore = new LocalContentStore(bobContentStorage);
        assert((await bobContentStore.get(contentReference)) === SNAPSHOT_BYTES,
            '12. Restarting Bob (fresh ContentStore instance, same underlying storage) leaves his content byte-identical');
    }
    console.log('✓ Section C: FLAGSHIP — offline snapshot content transfer, independent of placement resolution, surviving a restart');

    // ---------------------------------------------------------------
    // Section D — edge cases: tampering, duplicate transfer, order-
    // independent publicationKnown, build-side errors
    // ---------------------------------------------------------------
    {
        const PUBLICATION_ID = 'pub-section-d';
        const SNAPSHOT_BYTES = 'section-d-snapshot-bytes';

        const dave = makeIdentity('Dave-Content');
        const daveContentStore = new LocalContentStore(new InMemoryStorageProvider());
        const contentReference = daveContentStore.put(SNAPSHOT_BYTES);
        const publication = signPublication(dave, { id: PUBLICATION_ID, contentKind: 'forkbuild.structure', contentReference });

        const davePublicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        davePublicationCatalog.add(publication);

        const daveBuilder = new BuildPublicationSnapshotTransferPackageUseCase({ publicationCatalog: davePublicationCatalog, contentStore: daveContentStore });
        const transferPackage = await daveBuilder.execute(PUBLICATION_ID);

        // --- Eve: imports the transfer package BEFORE ever learning
        // about the publication. publicationKnown reports false, but the
        // bytes are stored regardless — never gated. ---
        const eveContentStore = new LocalContentStore(new InMemoryStorageProvider());
        const evePublicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const eveImporter = new ImportPublicationSnapshotTransferPackageUseCase(new StoreSnapshotContentUseCase(eveContentStore), evePublicationCatalog);

        const eveFirstResult = await eveImporter.execute(transferPackage);
        assert(eveFirstResult.outcome === SnapshotContentTransferOutcome.STORED, '1. Eve stores the bytes even though she has never heard of this publication');
        assert(eveFirstResult.publicationKnown === false, '2. publicationKnown correctly reports false — never a gate on step 4');
        assert((await eveContentStore.get(contentReference)) === SNAPSHOT_BYTES, '3. Eve genuinely possesses the bytes');

        // Eve later learns the publication itself — re-importing the
        // IDENTICAL transfer package now reports publicationKnown: true,
        // and ALREADY_STORED rather than STORED.
        evePublicationCatalog.add(publication);
        const eveSecondResult = await eveImporter.execute(transferPackage);
        assert(eveSecondResult.outcome === SnapshotContentTransferOutcome.ALREADY_STORED, '4. re-importing the identical package reports ALREADY_STORED, never an error');
        assert(eveSecondResult.publicationKnown === true, '5. publicationKnown now reports true — a plain, live observation, re-derived on every call');

        // --- Tampering: content that does not hash to the package's own
        // contentHash is rejected outright, and nothing is stored. ---
        const tamperedPackage = { ...transferPackage, content: 'these-are-not-the-original-bytes' };
        const frankContentStore = new LocalContentStore(new InMemoryStorageProvider());
        const frankImporter = new ImportPublicationSnapshotTransferPackageUseCase(new StoreSnapshotContentUseCase(frankContentStore), new LocalPublicationCatalog(new InMemoryStorageProvider()));
        const frankResult = await frankImporter.execute(tamperedPackage);
        assert(frankResult.outcome === SnapshotContentTransferOutcome.CONTENT_HASH_MISMATCH, '6. tampered content is rejected as CONTENT_HASH_MISMATCH');
        assert(frankResult.contentReference === null, '7. no contentReference is reported for a rejected transfer');
        assert((await frankContentStore.has(contentReference)) === false, '8. INVARIANT: nothing is stored when the content fails to verify');

        // --- Build-side errors: an uncataloged publication, and a
        // cataloged publication this replica does not actually hold
        // bytes for. ---
        const emptyCatalogBuilder = new BuildPublicationSnapshotTransferPackageUseCase({
            publicationCatalog: new LocalPublicationCatalog(new InMemoryStorageProvider()), contentStore: new LocalContentStore(new InMemoryStorageProvider())
        });
        await expectRejects(emptyCatalogBuilder.execute('pub-never-heard-of'), Error, '9. building a package for an uncataloged publication throws');

        const knownButContentlessCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const contentlessPublication = signPublication(dave, {
            id: 'pub-known-no-bytes', contentKind: 'forkbuild.structure',
            contentReference: new ContentReference({ hash: 'never-actually-stored' })
        });
        knownButContentlessCatalog.add(contentlessPublication);
        const contentlessBuilder = new BuildPublicationSnapshotTransferPackageUseCase({
            publicationCatalog: knownButContentlessCatalog, contentStore: new LocalContentStore(new InMemoryStorageProvider())
        });
        await expectRejects(contentlessBuilder.execute('pub-known-no-bytes'), Error, '10. building a package for a KNOWN publication this replica holds no bytes for still throws — knowing is not possessing, on the export side too');
    }
    console.log('✓ Section D: edge cases — tampering, duplicate transfer, order-independent publicationKnown, build-side errors');

    console.log('\n✅ All PublicationSnapshotTransferPackage tests passed');
}

run().catch((error) => {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
