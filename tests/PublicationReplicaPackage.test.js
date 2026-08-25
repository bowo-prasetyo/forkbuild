import { buildPublicationReplicaPackage, PUBLICATION_REPLICA_PACKAGE_KIND, CURRENT_SCHEMA_VERSION } from '../application/PublicationReplicaPackage.js';
import { validatePublicationReplicaPackage, PublicationReplicaPackageError } from '../application/PublicationReplicaPackageValidator.js';
import { BuildPublicationReplicaPackageUseCase } from '../application/BuildPublicationReplicaPackageUseCase.js';
import { ImportPublicationReplicaPackageUseCase } from '../application/ImportPublicationReplicaPackageUseCase.js';
import { describePublicationReplicaKnowledge } from '../application/PublicationReplicaKnowledgeView.js';
import { derivePublicationEvidenceConvergence } from '../application/PublicationEvidenceConvergence.js';
import { publicationEvidenceConvergenceView } from '../application/PublicationEvidenceConvergenceView.js';
import { derivePublicationSnapshotPlacementConvergence } from '../application/PublicationSnapshotPlacementConvergence.js';
import { publicationSnapshotPlacementConvergenceView } from '../application/PublicationSnapshotPlacementConvergenceView.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { PublicationExchange } from '../application/PublicationExchange.js';
import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { ContentReference } from '../core/ContentReference.js';
import { LocalPublicationAnchorCatalog } from '../application/LocalPublicationAnchorCatalog.js';
import { PublicationAnchorExchange } from '../application/PublicationAnchorExchange.js';
import { PublicationAnchorPeerExchange } from '../application/PublicationAnchorPeerExchange.js';
import { PublicationAnchorDiscoveryCoordinator } from '../application/PublicationAnchorDiscoveryCoordinator.js';
import { LocalAnchorKnowledgeStore } from '../application/LocalAnchorKnowledgeStore.js';
import { AnchorAcquisitionKind } from '../application/AnchorAcquisitionKind.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/LocalPublicationSnapshotPlacementCatalog.js';
import { PublicationSnapshotPlacementExchange } from '../application/PublicationSnapshotPlacementExchange.js';
import { LocalPlacementKnowledgeStore } from '../application/LocalPlacementKnowledgeStore.js';
import { PlacementAcquisitionKind } from '../application/PlacementAcquisitionKind.js';
import { PublicationSnapshotPlacement } from '../core/PublicationSnapshotPlacement.js';
import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';

// 0.8.29 — Publication Replica Export & Offline Transfer.
//
//   Section A: buildPublicationReplicaPackage() argument handling — an
//              unsigned publication/anchor/placement, the wrong instance
//              type, an anchor/placement naming a different
//              publicationId than the packaged publication, and the
//              omit-when-empty shape for `anchors`/`placements`.
//   Section B: validatePublicationReplicaPackage() structural checks —
//              wrong kind, wrong schemaVersion, a malformed publication/
//              anchor/placement, and the SAME publicationId cross-check
//              enforced at the validator layer, all raised as
//              PublicationReplicaPackageError, never a leaked
//              DecentralizedPublicationError/PublicationAnchorError/
//              PublicationSnapshotPlacementError.
//   Section C: FLAGSHIP — Alice creates a publication, an anchor, and a
//              placement, exports a Publication Replica Package via
//              BuildPublicationReplicaPackageUseCase, then goes offline
//              FOR GOOD — no peer connection to her is ever established
//              anywhere in this test. Bob starts knowing nothing, imports
//              the package via ImportPublicationReplicaPackageUseCase
//              while COMPLETELY OFFLINE (no network object of any kind
//              exists in that part of the test), and reconstructs a full
//              replica knowledge view. Bob's own re-export of what he
//              just imported is proven byte-identical to Alice's original
//              package. Carol then sends the IDENTICAL anchor over a live
//              peer connection — Bob's own knowledge store still reports
//              PACKAGE for it, never PEER: the export package transports
//              a claim, never the exporting replica's own acquisition
//              history, so FIRST-SEEN-WINS still applies against Bob's
//              own, earlier, package-sourced record. A restart (fresh
//              catalog/store instances over the identical underlying
//              storage) leaves Bob's replica knowledge view and
//              provenance byte-identical again.
//   Section D: per-claim import tolerance — a forged anchor inside an
//              otherwise-valid package never blocks the publication or
//              the placement from importing, and a forged publication
//              never blocks its bundled anchors/placements from
//              importing either.
//
// See docs/Principles.md, "A Replica Package Transfers Durable Claims,
// Not The Exporting Replica's Own Acquisition History (0.8.29)."

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

function wait(ms = 20) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

function deriveReplicaKnowledge(publicationId, { hasPublication, anchors, placements }) {
    const evidenceConvergence = derivePublicationEvidenceConvergence({ publicationId, anchors });
    const evidenceConvergenceView = publicationEvidenceConvergenceView(evidenceConvergence);
    const placementConvergence = derivePublicationSnapshotPlacementConvergence({ publicationId, placements });
    const placementConvergenceView = publicationSnapshotPlacementConvergenceView(placementConvergence);
    return describePublicationReplicaKnowledge({ publicationId, hasPublication, evidenceConvergenceView, placementConvergenceView });
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — buildPublicationReplicaPackage() argument handling
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice-A');
        const publication = signPublication(alice, {
            id: 'pub-section-a', contentKind: 'forkbuild.structure',
            contentReference: new ContentReference({ hash: 'hash-section-a' })
        });
        const anchor = signAnchor(alice, { publicationId: 'pub-section-a', contentHash: 'hash-section-a', anchorType: 'bitcoin-op-return', locator: 'bitcoin://tx/a' });
        const placement = signPlacement(alice, { publicationId: 'pub-section-a', contentHash: 'hash-section-a', storage: 'ipfs', locator: 'ipfs://CID-a' });

        expectThrows(() => buildPublicationReplicaPackage(null), Error, '1. a publication is required');
        expectThrows(() => buildPublicationReplicaPackage({ id: 'not-a-real-instance' }), Error, '2. a raw object is not a DecentralizedPublication instance');

        const unsignedPublication = new DecentralizedPublication({
            id: 'pub-unsigned', contentKind: 'forkbuild.structure',
            contentReference: new ContentReference({ hash: 'hash-unsigned' }),
            publisherIdentity: alice.getSigningIdentity().toJSON()
        });
        expectThrows(() => buildPublicationReplicaPackage(unsignedPublication), Error, '3. refuses to package an unsigned publication');

        const pkgNoClaimsYet = buildPublicationReplicaPackage(publication);
        assert(pkgNoClaimsYet.kind === PUBLICATION_REPLICA_PACKAGE_KIND && pkgNoClaimsYet.schemaVersion === CURRENT_SCHEMA_VERSION,
            '4. kind/schemaVersion are stamped correctly');
        assert(!('anchors' in pkgNoClaimsYet) && !('placements' in pkgNoClaimsYet),
            '5. anchors/placements are OMITTED (never empty arrays) when there are none to bundle');

        expectThrows(() => buildPublicationReplicaPackage(publication, { anchors: [{ notAnInstance: true }] }), Error, '6. anchors must be real PublicationAnchor instances');

        const unsignedAnchor = new PublicationAnchor({ publicationId: 'pub-section-a', contentHash: 'hash-section-a', anchorType: 'bitcoin-op-return', locator: 'bitcoin://tx/unsigned', anchorIdentity: alice.getSigningIdentity().toJSON() });
        expectThrows(() => buildPublicationReplicaPackage(publication, { anchors: [unsignedAnchor] }), Error, '7. refuses to package an unsigned anchor');

        const mismatchedAnchor = signAnchor(alice, { publicationId: 'pub-SOME-OTHER-PUBLICATION', contentHash: 'hash-section-a', anchorType: 'bitcoin-op-return', locator: 'bitcoin://tx/mismatch' });
        expectThrows(() => buildPublicationReplicaPackage(publication, { anchors: [mismatchedAnchor] }), Error, '8. refuses to package an anchor naming a different publicationId');

        const mismatchedPlacement = signPlacement(alice, { publicationId: 'pub-SOME-OTHER-PUBLICATION', contentHash: 'hash-section-a', storage: 'ipfs', locator: 'ipfs://CID-mismatch' });
        expectThrows(() => buildPublicationReplicaPackage(publication, { placements: [mismatchedPlacement] }), Error, '9. refuses to package a placement naming a different publicationId');

        const fullPackage = buildPublicationReplicaPackage(publication, { anchors: [anchor], placements: [placement] });
        assert(fullPackage.publication.id === 'pub-section-a', '10. publication field is the packaged publication\'s own JSON');
        assert(fullPackage.anchors.length === 1 && fullPackage.anchors[0].id === anchor.id, '11. anchors field carries the bundled anchor\'s own JSON');
        assert(fullPackage.placements.length === 1 && fullPackage.placements[0].id === placement.id, '12. placements field carries the bundled placement\'s own JSON');
        assert(JSON.stringify(buildPublicationReplicaPackage(publication, { anchors: [anchor], placements: [placement] })) === JSON.stringify(fullPackage),
            '13. deterministic: the identical inputs produce byte-identical package JSON on every call');
    }
    console.log('✓ Section A: buildPublicationReplicaPackage() argument handling');

    // ---------------------------------------------------------------
    // Section B — validatePublicationReplicaPackage() structural checks
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice-B');
        const publication = signPublication(alice, {
            id: 'pub-section-b', contentKind: 'forkbuild.structure',
            contentReference: new ContentReference({ hash: 'hash-section-b' })
        });
        const anchor = signAnchor(alice, { publicationId: 'pub-section-b', contentHash: 'hash-section-b', anchorType: 'bitcoin-op-return', locator: 'bitcoin://tx/b' });
        const placement = signPlacement(alice, { publicationId: 'pub-section-b', contentHash: 'hash-section-b', storage: 'ipfs', locator: 'ipfs://CID-b' });
        const validPackage = buildPublicationReplicaPackage(publication, { anchors: [anchor], placements: [placement] });

        expectThrows(() => validatePublicationReplicaPackage(null), PublicationReplicaPackageError, '1. package is required');
        expectThrows(() => validatePublicationReplicaPackage({ ...validPackage, kind: 'something-else' }), PublicationReplicaPackageError, '2. wrong kind is rejected');
        expectThrows(() => validatePublicationReplicaPackage({ ...validPackage, schemaVersion: 999 }), PublicationReplicaPackageError, '3. wrong schemaVersion is rejected');
        expectThrows(() => validatePublicationReplicaPackage({ ...validPackage, publication: { id: 'incomplete' } }), PublicationReplicaPackageError, '4. malformed publication is rejected, wrapped as PublicationReplicaPackageError');
        expectThrows(() => validatePublicationReplicaPackage({ ...validPackage, anchors: [{ id: 'incomplete-anchor' }] }), PublicationReplicaPackageError, '5. malformed anchor is rejected, wrapped as PublicationReplicaPackageError');
        expectThrows(() => validatePublicationReplicaPackage({ ...validPackage, placements: [{ id: 'incomplete-placement' }] }), PublicationReplicaPackageError, '6. malformed placement is rejected, wrapped as PublicationReplicaPackageError');
        expectThrows(() => validatePublicationReplicaPackage({ ...validPackage, anchors: 'not-an-array' }), PublicationReplicaPackageError, '7. anchors must be an array');
        expectThrows(() => validatePublicationReplicaPackage({ ...validPackage, placements: 'not-an-array' }), PublicationReplicaPackageError, '8. placements must be an array');

        const strangerAnchor = signAnchor(alice, { publicationId: 'pub-SOME-OTHER-PUBLICATION', contentHash: 'hash-section-b', anchorType: 'bitcoin-op-return', locator: 'bitcoin://tx/stranger' });
        expectThrows(() => validatePublicationReplicaPackage({ ...validPackage, anchors: [strangerAnchor.toJSON()] }), PublicationReplicaPackageError, '9. an anchor naming a different publicationId than the package\'s own publication is rejected at the validator layer too');

        validatePublicationReplicaPackage(validPackage); // 10. does not throw for a well-formed package
        console.log('  10. a well-formed package passes validation without throwing');
    }
    console.log('✓ Section B: validatePublicationReplicaPackage() structural checks');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP: offline export, offline import, provenance,
    // growth, restart
    // ---------------------------------------------------------------
    {
        const PUBLICATION_ID = 'pub-flagship-transfer';
        const CONTENT_HASH = 'hash-flagship-transfer';

        // --- Alice: creates everything, builds ONE replica package, then
        // is NEVER online again. No peer transport is ever constructed
        // for her anywhere in this test. ---
        const alice = makeIdentity('Alice');
        const publication = signPublication(alice, {
            id: PUBLICATION_ID, contentKind: 'forkbuild.structure',
            contentReference: new ContentReference({ hash: CONTENT_HASH })
        });
        const anchorA = signAnchor(alice, { publicationId: PUBLICATION_ID, contentHash: CONTENT_HASH, anchorType: 'bitcoin-op-return', locator: 'bitcoin://tx/replica-pkg-a' });
        const placementA = signPlacement(alice, { publicationId: PUBLICATION_ID, contentHash: CONTENT_HASH, storage: 'ipfs', locator: 'ipfs://CID-replica-pkg-a' });

        const alicePublicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const alicePublicationExchange = new PublicationExchange(alicePublicationCatalog, new LocalAuthorizationVerifier());
        alicePublicationExchange.importPublication(alicePublicationExchange.exportPublication(publication));

        const aliceAnchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
        const aliceAnchorExchange = new PublicationAnchorExchange(aliceAnchorCatalog, new LocalAuthorizationVerifier());
        aliceAnchorExchange.importAnchor(anchorA.toJSON());

        const alicePlacementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const alicePlacementExchange = new PublicationSnapshotPlacementExchange(alicePlacementCatalog, new LocalAuthorizationVerifier());
        alicePlacementExchange.importPlacement(placementA.toJSON());

        const aliceBuilder = new BuildPublicationReplicaPackageUseCase({
            publicationCatalog: alicePublicationCatalog, anchorExchange: aliceAnchorExchange, placementExchange: alicePlacementExchange
        });
        const replicaPackage = aliceBuilder.execute(PUBLICATION_ID);
        assert(replicaPackage.publication.id === PUBLICATION_ID && replicaPackage.anchors.length === 1 && replicaPackage.placements.length === 1,
            '1. Alice builds one replica package bundling her publication, one anchor, and one placement');

        // --- Bob: starts knowing NOTHING, and imports the package
        // entirely offline — no network object of any kind exists in
        // this block. ---
        const bobPublicationCatalogStorage = new InMemoryStorageProvider();
        const bobAnchorCatalogStorage = new InMemoryStorageProvider();
        const bobAnchorKnowledgeStorage = new InMemoryStorageProvider();
        const bobPlacementCatalogStorage = new InMemoryStorageProvider();
        const bobPlacementKnowledgeStorage = new InMemoryStorageProvider();

        let bobPublicationCatalog = new LocalPublicationCatalog(bobPublicationCatalogStorage);
        let bobAnchorCatalog = new LocalPublicationAnchorCatalog(bobAnchorCatalogStorage);
        let bobAnchorKnowledge = new LocalAnchorKnowledgeStore(bobAnchorKnowledgeStorage);
        let bobPlacementCatalog = new LocalPublicationSnapshotPlacementCatalog(bobPlacementCatalogStorage);
        let bobPlacementKnowledge = new LocalPlacementKnowledgeStore(bobPlacementKnowledgeStorage);

        assert(bobPublicationCatalog.has(PUBLICATION_ID) === false, '2. setup: Bob starts knowing nothing about this publication');

        let bobPublicationExchange = new PublicationExchange(bobPublicationCatalog, new LocalAuthorizationVerifier());
        let bobAnchorExchange = new PublicationAnchorExchange(bobAnchorCatalog, new LocalAuthorizationVerifier());
        let bobPlacementExchange = new PublicationSnapshotPlacementExchange(bobPlacementCatalog, new LocalAuthorizationVerifier());
        let bobImporter = new ImportPublicationReplicaPackageUseCase(bobPublicationExchange, bobAnchorExchange, bobPlacementExchange, {
            anchorKnowledgeStore: bobAnchorKnowledge, placementKnowledgeStore: bobPlacementKnowledge
        });

        const importResult = bobImporter.execute(replicaPackage);
        assert(importResult.rejectedPublication === null && importResult.publication.id === PUBLICATION_ID && importResult.publicationIsNew === true,
            '3. Bob imports the publication envelope, entirely offline');
        assert(importResult.importedAnchors.length === 1 && importResult.importedAnchors[0].id === anchorA.id,
            '4. Bob imports Anchor A, entirely offline');
        assert(importResult.importedPlacements.length === 1 && importResult.importedPlacements[0].id === placementA.id,
            '5. Bob imports Placement A, entirely offline');
        assert(bobAnchorKnowledge.get(anchorA.id).acquisition.kind === AnchorAcquisitionKind.PACKAGE, '6. Bob\'s own knowledge store records PACKAGE for Anchor A');
        assert(bobPlacementKnowledge.get(placementA.id).acquisition.kind === PlacementAcquisitionKind.PACKAGE, '7. Bob\'s own knowledge store records PACKAGE for Placement A');

        let bobView = deriveReplicaKnowledge(PUBLICATION_ID, {
            hasPublication: bobPublicationCatalog.has(PUBLICATION_ID),
            anchors: bobAnchorCatalog.findByPublicationId(PUBLICATION_ID),
            placements: bobPlacementCatalog.findByPublicationId(PUBLICATION_ID)
        });
        assert(bobView.hasPublication === true && bobView.evidence.anchorCount === 1 && bobView.placements.placementCount === 1,
            '8. Bob\'s replica knowledge view reports the publication known, one anchor, one placement — offline, before any network object in this test exists');

        // Round trip: Bob's own re-export of what he just imported is
        // byte-identical to Alice's original package — nothing was lost
        // or transformed in transit.
        const bobBuilder = new BuildPublicationReplicaPackageUseCase({
            publicationCatalog: bobPublicationCatalog, anchorExchange: bobAnchorExchange, placementExchange: bobPlacementExchange
        });
        const bobReexported = bobBuilder.execute(PUBLICATION_ID);
        assert(JSON.stringify(bobReexported) === JSON.stringify(replicaPackage),
            '9. INVARIANT: Bob\'s own re-export of the imported package is byte-identical to Alice\'s original — the transfer is lossless');

        // --- Bob's knowledge grows: he connects to Carol, who
        // independently re-sends the IDENTICAL Anchor A (not a new one)
        // over a live peer connection. Alice is never involved, and is
        // never connected to anyone at any point in this test. ---
        const carol = makeIdentity('Carol');
        const carolAnchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
        const carolAnchorExchange = new PublicationAnchorExchange(carolAnchorCatalog, new LocalAuthorizationVerifier());
        carolAnchorExchange.importAnchor(anchorA.toJSON());

        const bob = makeIdentity('Bob');
        const network = new LocalPeerNetwork();
        const bobTransport = new LocalPeerConnectionProvider('bob-replica-package', network);
        const carolTransport = new LocalPeerConnectionProvider('carol-replica-package', network);
        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        const stopBobListening = bobConnect.listen();
        const carolConnect = new ConnectToPeerUseCase({ peerConnectionProvider: carolTransport, identityProvider: carol });
        const stopCarolListening = carolConnect.listen();

        const bobToCarol = bobConnect.connect({ candidateEndpoint: 'carol-replica-package' });
        await wait(30);
        assert(bobToCarol.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '10. setup: Bob<->Carol authenticates');

        const bobAnchorBus = new PeerMessageBus();
        const bobAnchorPeerExchange = new PublicationAnchorPeerExchange(bobAnchorExchange, bobAnchorBus, bobConnect.registry, { knowledgeStore: bobAnchorKnowledge });
        const bobAnchorCoordinator = new PublicationAnchorDiscoveryCoordinator(bobAnchorPeerExchange);
        const carolAnchorBus = new PeerMessageBus();
        const carolAnchorPeerExchange = new PublicationAnchorPeerExchange(carolAnchorExchange, carolAnchorBus, carolConnect.registry, { knowledgeStore: new LocalAnchorKnowledgeStore(new InMemoryStorageProvider()) });

        await bobAnchorCoordinator.discoverFromPeers(PUBLICATION_ID, [bobToCarol], { timeoutMs: 200 });

        assert(bobAnchorCatalog.findByPublicationId(PUBLICATION_ID).length === 1, '11. Bob still knows exactly one anchor — Carol re-sent the SAME Anchor A, not a new one');
        assert(bobAnchorKnowledge.get(anchorA.id).acquisition.kind === AnchorAcquisitionKind.PACKAGE,
            '12. PROVENANCE INVARIANT: Bob\'s knowledge store STILL reports PACKAGE for Anchor A, never PEER — the replica package transported the CLAIM, never Alice\'s own acquisition history, so FIRST-SEEN-WINS protects Bob\'s own, earlier, package-sourced record against Carol\'s later peer delivery of the identical claim');

        bobAnchorPeerExchange.dispose();
        carolAnchorPeerExchange.dispose();
        stopBobListening();
        stopCarolListening();
        bobTransport.dispose();
        carolTransport.dispose();

        const bobViewBeforeRestart = deriveReplicaKnowledge(PUBLICATION_ID, {
            hasPublication: bobPublicationCatalog.has(PUBLICATION_ID),
            anchors: bobAnchorCatalog.findByPublicationId(PUBLICATION_ID),
            placements: bobPlacementCatalog.findByPublicationId(PUBLICATION_ID)
        });
        assert(JSON.stringify(bobViewBeforeRestart) === JSON.stringify(bobView),
            '13. Bob\'s replica knowledge view is unmoved by Carol re-delivering a claim Bob already had');

        // --- Bob restarts: fresh catalog/store instances over the
        // IDENTICAL underlying storage. ---
        bobPublicationCatalog = new LocalPublicationCatalog(bobPublicationCatalogStorage);
        bobAnchorCatalog = new LocalPublicationAnchorCatalog(bobAnchorCatalogStorage);
        bobAnchorKnowledge = new LocalAnchorKnowledgeStore(bobAnchorKnowledgeStorage);
        bobPlacementCatalog = new LocalPublicationSnapshotPlacementCatalog(bobPlacementCatalogStorage);
        bobPlacementKnowledge = new LocalPlacementKnowledgeStore(bobPlacementKnowledgeStorage);

        assert(bobPublicationCatalog.has(PUBLICATION_ID) === true, '14. after restart: the publication survives');
        assert(bobAnchorKnowledge.get(anchorA.id).acquisition.kind === AnchorAcquisitionKind.PACKAGE, '15. after restart: Anchor A\'s PACKAGE provenance survives exactly as it was');
        assert(bobPlacementKnowledge.get(placementA.id).acquisition.kind === PlacementAcquisitionKind.PACKAGE, '16. after restart: Placement A\'s PACKAGE provenance survives exactly as it was');

        const bobViewAfterRestart = deriveReplicaKnowledge(PUBLICATION_ID, {
            hasPublication: bobPublicationCatalog.has(PUBLICATION_ID),
            anchors: bobAnchorCatalog.findByPublicationId(PUBLICATION_ID),
            placements: bobPlacementCatalog.findByPublicationId(PUBLICATION_ID)
        });
        assert(JSON.stringify(bobViewAfterRestart) === JSON.stringify(bobViewBeforeRestart),
            '17. INVARIANT: Bob\'s replica knowledge view is byte-identical across a full restart');

        const serializedFinal = JSON.stringify(bobViewAfterRestart);
        assert(!/authorit|trust|winner|consensus|correct|malicious|reject|best|preferred|confident|likely|canonical|score|completeness/i.test(serializedFinal),
            '18. no adjudicating or completeness-scoring language anywhere in the final replica knowledge view');
        assert(!/peer|package|acquisition|firstSeen|learned|verif|resolv|lifecycle|alice|carol|bob/i.test(serializedFinal),
            '19. no acquisition provenance, no lifecycle vocabulary, and no identity name anywhere in the replica knowledge view itself — provenance stays entirely in the knowledge STORE, never leaking into this VIEW');
    }
    console.log('✓ Section C: FLAGSHIP — Alice exports a Publication Replica Package and goes offline for good; Bob imports it while completely offline and reconstructs full replica knowledge; his own re-export round-trips byte-identical; Carol later re-delivering the SAME anchor over a live peer connection leaves Bob\'s PACKAGE provenance untouched (FIRST-SEEN-WINS); a full restart leaves everything byte-identical again');

    // ---------------------------------------------------------------
    // Section D — per-claim import tolerance
    // ---------------------------------------------------------------
    {
        const PUBLICATION_ID = 'pub-tolerance';
        const CONTENT_HASH = 'hash-tolerance';
        const alice = makeIdentity('Alice-D');
        const mallory = makeIdentity('Mallory-D');

        const publication = signPublication(alice, {
            id: PUBLICATION_ID, contentKind: 'forkbuild.structure',
            contentReference: new ContentReference({ hash: CONTENT_HASH })
        });
        const goodAnchor = signAnchor(alice, { publicationId: PUBLICATION_ID, contentHash: CONTENT_HASH, anchorType: 'bitcoin-op-return', locator: 'bitcoin://tx/good' });
        const goodPlacement = signPlacement(alice, { publicationId: PUBLICATION_ID, contentHash: CONTENT_HASH, storage: 'ipfs', locator: 'ipfs://CID-good' });

        // A forged anchor: signed by Mallory, but its signer field is
        // hand-edited afterward to CLAIM it came from Alice — the same
        // "signature no longer matches the claimed signer" forgery every
        // other exchange test in this codebase already exercises.
        let forgedAnchor = signAnchor(mallory, { publicationId: PUBLICATION_ID, contentHash: CONTENT_HASH, anchorType: 'transparency-log', locator: 'log://entry/forged' });
        const forgedAnchorJson = { ...forgedAnchor.toJSON(), anchorIdentity: alice.getSigningIdentity().toJSON() };

        const pkgWithForgedAnchor = buildPublicationReplicaPackage(publication, { anchors: [goodAnchor], placements: [goodPlacement] });
        pkgWithForgedAnchor.anchors.push(forgedAnchorJson);

        const bob1PublicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const bob1AnchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
        const bob1PlacementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const bob1Importer = new ImportPublicationReplicaPackageUseCase(
            new PublicationExchange(bob1PublicationCatalog, new LocalAuthorizationVerifier()),
            new PublicationAnchorExchange(bob1AnchorCatalog, new LocalAuthorizationVerifier()),
            new PublicationSnapshotPlacementExchange(bob1PlacementCatalog, new LocalAuthorizationVerifier())
        );
        const result1 = bob1Importer.execute(pkgWithForgedAnchor);
        assert(result1.rejectedPublication === null && result1.publication.id === PUBLICATION_ID,
            '1. the publication itself still imports cleanly');
        assert(result1.importedAnchors.length === 1 && result1.importedAnchors[0].id === goodAnchor.id,
            '2. the good anchor still imports');
        assert(result1.rejectedAnchors.length === 1 && result1.rejectedAnchors[0].reason === 'invalid-signature',
            '3. the forged anchor is rejected, categorized, and never blocks the good anchor');
        assert(result1.importedPlacements.length === 1 && result1.importedPlacements[0].id === goodPlacement.id,
            '4. the placement, entirely unrelated to the forged anchor, still imports');

        // A forged publication: same technique, applied to the envelope
        // itself. Its bundled anchor/placement are otherwise perfectly
        // valid, independently signed claims.
        let forgedPublication = signPublication(mallory, {
            id: 'pub-tolerance-forged-publication', contentKind: 'forkbuild.structure',
            contentReference: new ContentReference({ hash: 'hash-tolerance-forged' })
        });
        const forgedPublicationJson = { ...forgedPublication.toJSON(), publisherIdentity: alice.getSigningIdentity().toJSON() };
        const anchorForForgedPub = signAnchor(alice, { publicationId: 'pub-tolerance-forged-publication', contentHash: 'hash-tolerance-forged', anchorType: 'bitcoin-op-return', locator: 'bitcoin://tx/orphaned' });
        const pkgWithForgedPublication = {
            kind: PUBLICATION_REPLICA_PACKAGE_KIND, schemaVersion: CURRENT_SCHEMA_VERSION,
            publication: forgedPublicationJson, anchors: [anchorForForgedPub.toJSON()]
        };

        const bob2PublicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const bob2AnchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
        const bob2PlacementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const bob2Importer = new ImportPublicationReplicaPackageUseCase(
            new PublicationExchange(bob2PublicationCatalog, new LocalAuthorizationVerifier()),
            new PublicationAnchorExchange(bob2AnchorCatalog, new LocalAuthorizationVerifier()),
            new PublicationSnapshotPlacementExchange(bob2PlacementCatalog, new LocalAuthorizationVerifier())
        );
        const result2 = bob2Importer.execute(pkgWithForgedPublication);
        assert(result2.publication === null && result2.rejectedPublication !== null && result2.rejectedPublication.publication.id === 'pub-tolerance-forged-publication',
            '5. the forged publication is rejected, reported, and never thrown past this use case');
        assert(bob2PublicationCatalog.has('pub-tolerance-forged-publication') === false, '6. the forged publication is never cataloged');
        assert(result2.importedAnchors.length === 1 && result2.importedAnchors[0].id === anchorForForgedPub.id,
            '7. its bundled anchor — independently signed by Alice, naming the same publicationId — still imports even though the publication itself was rejected');
        assert(bob2AnchorCatalog.findByPublicationId('pub-tolerance-forged-publication').length === 1,
            '8. the anchor is cataloged under the publicationId it names, even though this replica has no cataloged publication for it — the identical "claims outlive whether the publication itself is known" posture application/PublicationAnchorExchange.js already holds for a peer-delivered anchor');
    }
    console.log('✓ Section D: per-claim import tolerance — a forged anchor never blocks the rest of a package, and a forged publication never blocks its otherwise-valid bundled anchors/placements');

    console.log('\nAll Publication Replica Package tests passed.');
}

run().catch((error) => {
    console.error('PublicationReplicaPackage.test.js FAILED:', error);
    process.exitCode = 1;
});
