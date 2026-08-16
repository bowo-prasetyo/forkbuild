import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { License, LicenseId } from '../core/License.js';
import { CausalStamp } from '../core/CausalStamp.js';
import { RevisionReference } from '../core/RevisionReference.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { SpatialIndexRoot } from '../core/SpatialIndexRoot.js';
import { TrustStatus } from '../core/TrustObservation.js';
import { summarizeDiscoveryDiagnostics } from '../core/DiscoveryDiagnosticsSummary.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalSpatialIndexStore } from '../spatial/LocalSpatialIndexStore.js';
import { SpatialIndexBuilder } from '../spatial/SpatialIndexBuilder.js';
import { DecentralizedSpatialDiscoveryProvider } from '../spatial/DecentralizedSpatialDiscoveryProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { TrustPolicy } from '../identity/TrustPolicy.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { DocumentCloneService } from '../application/DocumentCloneService.js';
import { SearchWorldUseCase } from '../application/SearchWorldUseCase.js';

// 0.2.30 — Trust-Aware Spatial Discovery & Diagnostics.
//
// The design question: "How does a decentralized World View know that
// what it found is trustworthy, current, and complete enough to
// present?" This file tests two layers of the answer:
//
//   1. core/DiscoveryDiagnosticsSummary.js — the pure function that
//      turns spatial/DiscoveryDiagnostics.js's raw counters (0.2.19)
//      into the compact, UI-ready shape WorldLocationBrowser renders.
//      Every state it can produce is exercised directly, with plain
//      hand-built counter objects — no discovery machinery needed.
//
//   2. WorldNavigationSession's OPTIONAL spatialDiscoveryProvider
//      wiring — exploreLocation/exploreHere/whatsHere's diagnostics
//      half, exercised against a REAL DecentralizedSpatialDiscoveryProvider
//      (not a stub), reusing the buildReplica/makeSignedRecord patterns
//      from tests/TrustDiscoveryHardening.test.js, so these scenarios
//      are testing actual trust code, not a hand-waved simulation of
//      it. Central claim under test throughout: discovery and trust
//      are related but not the same operation — a document a session
//      finds through the (separate) local placement registry is never
//      hidden by what the trust layer says about it; diagnostics only
//      ever ANNOTATE a result, never filter it.

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function makeDocument(title, author = 'alice') {
    const world = new World();
    const building = new Building({ creator: author });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({
        world,
        metadata: new DocumentMetadata({ title, author, license: new License({ id: LicenseId.CC0_1_0 }) })
    });
}

function createIdentity(username) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    provider.login(username);
    provider.getSigningIdentity();
    return provider;
}

// A single storage-backed replica used for BOTH halves of a session:
// document/position resolution (LocalWorldLayoutProvider/
// LocalPlacementRegistry, exactly as every other WorldNavigationSession
// test wires it) AND the decentralized trust layer
// (DecentralizedSpatialDiscoveryProvider, wired against the SAME
// placementRegistry so a PlacementRecord's placementId matches on both
// sides — the only way to prove inspectDocument's trust lookup finds
// the RIGHT observation for a specific document, not just any).
function buildIntegratedReplica(identityProvider, { indexAuthorityIdentity = null, builderIdentity = null, trustPolicy = null } = {}) {
    const storage = new InMemoryStorageProvider();
    const discoveryProvider = new LocalDiscoveryProvider(storage);
    const contentStore = new LocalContentStore(storage);
    const publisher = new LocalPublisherProvider(storage, contentStore);
    const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
    const worldLayoutProvider = new LocalWorldLayoutProvider(spatialIndexProvider, discoveryProvider);
    const placementRegistry = new LocalPlacementRegistry(storage, spatialIndexProvider);
    const spatialIndexStore = new LocalSpatialIndexStore(storage);
    const builder = new SpatialIndexBuilder(spatialIndexStore, { cellSize: 100, identityProvider: builderIdentity || identityProvider });
    const verifier = new LocalAuthorizationVerifier({ indexAuthorityIdentity });
    const spatialDiscoveryProvider = new DecentralizedSpatialDiscoveryProvider({
        spatialIndexStore, placementRegistry, authorizationVerifier: verifier,
        trustPolicy: trustPolicy || new TrustPolicy()
    });
    return {
        storage, discoveryProvider, publisher, spatialIndexProvider, worldLayoutProvider,
        placementRegistry, spatialIndexStore, builder, verifier, spatialDiscoveryProvider
    };
}

function makeSignedRecord(identityProvider, { placementId, publicationId, x = 0, y = 0, z = 0, revision = 1 }) {
    const signingIdentity = identityProvider.getSigningIdentity();
    let record = new PlacementRecord({ placementId, publicationId, position: new Position(x, y, z), revision });
    record = record.withOwnerIdentity(signingIdentity.toJSON());
    record = record.withCausalHistory(new CausalStamp().advance(signingIdentity.id), []);
    record = record.withContentHash(record.computeContentHash());
    return record.withSignature(identityProvider.signCanonical(record.getSigningDescriptor()));
}

async function runTests() {
    // -------------------------------------------------------------
    // 1-8. summarizeDiscoveryDiagnostics — pure, hand-built counters.
    // -------------------------------------------------------------
    {
        const unavailable = summarizeDiscoveryDiagnostics(null);
        assert(unavailable.available === false && unavailable.fatal === null && unavailable.complete === false
            && unavailable.warnings.length === 0,
            '1. null diagnostics -> available:false, not a fabricated complete:true or complete:false claim');

        const clean = summarizeDiscoveryDiagnostics({
            cellsQueried: 3, manifestsLoaded: 3, manifestsMissing: 0, manifestsInvalid: 0,
            recordsChecked: 5, recordsRejected: 0, conflicts: 0, staleEntries: 0, equivocations: 0, observations: []
        });
        assert(clean.available === true && clean.fatal === null && clean.complete === true && clean.warnings.length === 0,
            '2. all-zero issue counters -> complete:true, no warnings');

        const missing = summarizeDiscoveryDiagnostics({ manifestsMissing: 2, manifestsInvalid: 0, recordsRejected: 0, staleEntries: 0, conflicts: 0, equivocations: 0 });
        assert(missing.complete === false && missing.warnings.length === 1 && missing.warnings[0].status === 'MISSING' && missing.warnings[0].count === 2,
            '3. manifestsMissing>0 -> exactly one MISSING warning with the real count');

        const invalid = summarizeDiscoveryDiagnostics({ manifestsMissing: 0, manifestsInvalid: 1, recordsRejected: 0, staleEntries: 0, conflicts: 0, equivocations: 0 });
        assert(invalid.warnings.length === 1 && invalid.warnings[0].status === 'INTEGRITY_FAILURE',
            '4. manifestsInvalid>0 -> INTEGRITY_FAILURE warning');

        const rejected = summarizeDiscoveryDiagnostics({ manifestsMissing: 0, manifestsInvalid: 0, recordsRejected: 3, staleEntries: 0, conflicts: 0, equivocations: 0 });
        assert(rejected.warnings.length === 1 && rejected.warnings[0].status === 'UNAVAILABLE' && rejected.warnings[0].count === 3,
            '5. recordsRejected>0 -> UNAVAILABLE warning');

        const stale = summarizeDiscoveryDiagnostics({ manifestsMissing: 0, manifestsInvalid: 0, recordsRejected: 0, staleEntries: 1, conflicts: 0, equivocations: 0 });
        assert(stale.warnings.length === 1 && stale.warnings[0].status === 'STALE',
            '6. staleEntries>0 -> STALE warning');

        const conflicting = summarizeDiscoveryDiagnostics({ manifestsMissing: 0, manifestsInvalid: 0, recordsRejected: 0, staleEntries: 0, conflicts: 2, equivocations: 0 });
        assert(conflicting.warnings.length === 1 && conflicting.warnings[0].status === 'CONFLICTING' && conflicting.warnings[0].count === 2,
            '7. conflicts>0 -> CONFLICTING warning');

        const multi = summarizeDiscoveryDiagnostics({ manifestsMissing: 1, manifestsInvalid: 0, recordsRejected: 0, staleEntries: 1, conflicts: 0, equivocations: 1 });
        assert(multi.complete === false && multi.warnings.length === 3,
            '8. multiple simultaneous issues -> multiple warnings, one per real category, none invented');

        const fatal = summarizeDiscoveryDiagnostics({ manifestsMissing: 0, manifestsInvalid: 0, recordsRejected: 0, staleEntries: 0, conflicts: 0, equivocations: 0 }, { fatal: 'root not trusted' });
        assert(fatal.available === true && fatal.fatal === 'root not trusted' && fatal.complete === false && fatal.warnings.length === 0,
            '8b. a fatal reason short-circuits to available:true/complete:false regardless of the (irrelevant) counters passed alongside it');
    }

    // -------------------------------------------------------------
    // Shared fixtures for the WorldNavigationSession integration
    // scenarios below.
    // -------------------------------------------------------------
    const alice = createIdentity('alice');
    const bob = createIdentity('bob');
    const aliceIdentity = alice.getSigningIdentity();
    const bobIdentity = bob.getSigningIdentity();
    const registry = new CreateBrickRegistryUseCase().execute();

    function buildSession(replica, spatialDiscoveryProvider) {
        return new WorldNavigationSession({
            registry,
            loadPublicationDocumentUseCase: new LoadPublicationDocumentUseCase(replica.storage),
            worldLayoutProvider: replica.worldLayoutProvider,
            saveDocumentUseCase: new SaveDocumentUseCase(replica.storage),
            publishDocumentUseCase: new PublishDocumentUseCase(replica.publisher, alice),
            identityProvider: alice,
            documentCloneService: new DocumentCloneService(),
            discoveryProvider: replica.discoveryProvider,
            placementRegistry: replica.placementRegistry,
            searchWorldUseCase: new SearchWorldUseCase(replica.discoveryProvider),
            spatialDiscoveryProvider
        });
    }

    // -------------------------------------------------------------
    // 9-11. Clean, trusted index -> diagnostics.complete:true, and a
    //       specific document's Inspect trust status reads VALID.
    // -------------------------------------------------------------
    {
        const replica = buildIntegratedReplica(alice);
        const publication = replica.publisher.publish(makeDocument("Trusted Hall", 'alice'), alice);
        const record = makeSignedRecord(alice, { placementId: 'p-valid', publicationId: publication.id, x: 50, y: 0, z: 50 });
        replica.placementRegistry.add(record);
        replica.builder.build(replica.placementRegistry.list());

        const session = buildSession(replica, replica.spatialDiscoveryProvider);
        const envelope = session.exploreLocation({ center: { x: 50, y: 0, z: 50 }, radius: 10 });
        assert(envelope.documents.length === 1 && envelope.documents[0].documentId === publication.documentId,
            '9. the trusted index scenario still resolves the document through the ordinary local path');
        assert(envelope.diagnostics.available === true && envelope.diagnostics.fatal === null && envelope.diagnostics.complete === true,
            '10. a real, clean DecentralizedSpatialDiscoveryProvider reports complete:true — not fabricated, actually run');

        const inspected = session.inspectDocument(publication.documentId);
        assert(inspected.trust !== null && inspected.trust.status === TrustStatus.VALID,
            '11. inspectDocument surfaces the SPECIFIC TrustObservation for this document\'s placementId — VALID, from the same query');
    }

    // -------------------------------------------------------------
    // 12-13. Stale accelerator entry — live truth has moved on, but
    //        the built index still names the old revision. The
    //        document itself still resolves correctly (live truth,
    //        via the ordinary local path, same as always); the
    //        staleness is reported as a diagnostic, not hidden and
    //        not allowed to hide or wrongly-position the result.
    // -------------------------------------------------------------
    {
        const replica = buildIntegratedReplica(alice);
        const publication = replica.publisher.publish(makeDocument('Stale Tower', 'alice'), alice);
        const rev1 = makeSignedRecord(alice, { placementId: 'p-stale', publicationId: publication.id, x: 60, y: 0, z: 60, revision: 1 });
        replica.placementRegistry.add(rev1);
        replica.builder.build(replica.placementRegistry.list()); // index now has revision 1

        let rev2 = rev1.withPosition(new Position(65, 0, 60));
        rev2 = rev2.withCausalHistory(rev1.causalStamp.advance(aliceIdentity.id), [
            new RevisionReference({ placementId: rev1.placementId, revision: rev1.revision, contentReference: { hash: rev1.contentHash } })
        ]);
        rev2 = rev2.withContentHash(rev2.computeContentHash());
        rev2 = rev2.withSignature(alice.signCanonical(rev2.getSigningDescriptor()));
        replica.placementRegistry.update(rev2); // live truth moves; index NOT rebuilt (simulates lag)

        const session = buildSession(replica, replica.spatialDiscoveryProvider);
        const envelope = session.exploreLocation({ center: { x: 65, y: 0, z: 60 }, radius: 10 });
        assert(envelope.documents.length === 1 && envelope.documents[0].position.x === 65,
            '12. the document still resolves at its CURRENT (live) position through the ordinary local path, unaffected by index lag');
        assert(envelope.diagnostics.available === true && envelope.diagnostics.complete === false
            && envelope.diagnostics.warnings.some((w) => w.status === 'STALE'),
            '13. the lag is honestly reported as a STALE warning rather than silently hidden');
    }

    // -------------------------------------------------------------
    // 14-16. An untrusted root authority — the pinned policy rejects
    //        the signer entirely. discover() throws inside the trust
    //        layer (by design — an untrusted root is fatal to trusting
    //        the WHOLE index); exploreLocation must not let that throw
    //        escape a read-only exploration call, and the document
    //        must still be found through the independent local path.
    // -------------------------------------------------------------
    {
        const replica = buildIntegratedReplica(bob, {
            builderIdentity: bob, // bob signs the root (cryptographically valid on its own)...
            trustPolicy: TrustPolicy.pinnedTo(aliceIdentity) // ...but only alice's authority is trusted
        });
        const publication = replica.publisher.publish(makeDocument('Untrusted Root Plaza', 'bob'), alice);
        const record = makeSignedRecord(bob, { placementId: 'p-untrusted-root', publicationId: publication.id, x: 70, y: 0, z: 70 });
        replica.placementRegistry.add(record);
        replica.builder.build(replica.placementRegistry.list());

        const session = buildSession(replica, replica.spatialDiscoveryProvider);
        const envelope = session.exploreLocation({ center: { x: 70, y: 0, z: 70 }, radius: 10 });
        assert(envelope.documents.length === 1 && envelope.documents[0].documentId === publication.documentId,
            '14. the document is still found via the local path — an untrusted index root never hides a locally-known document');
        assert(envelope.diagnostics.available === true && typeof envelope.diagnostics.fatal === 'string' && envelope.diagnostics.fatal.length > 0,
            '15. the untrusted root is reported as diagnostics.fatal, not silently swallowed');
        assert(envelope.diagnostics.complete === false,
            '16. a fatal root can never also claim complete:true');
    }

    // -------------------------------------------------------------
    // 17. No spatialDiscoveryProvider wired at all (today's live
    //     WorldNavigationSession wiring — see docs/Architecture.md,
    //     0.2.30) -> diagnostics honestly report unavailable, and
    //     nothing throws.
    // -------------------------------------------------------------
    {
        const replica = buildIntegratedReplica(alice);
        const publication = replica.publisher.publish(makeDocument('Plain Local Cottage', 'alice'), alice);
        const record = makeSignedRecord(alice, { placementId: 'p-plain', publicationId: publication.id, x: 80, y: 0, z: 80 });
        replica.placementRegistry.add(record);
        // Deliberately never call replica.builder.build(...) or pass a
        // spatialDiscoveryProvider — this is the plain 0.2.26/0.2.28/
        // 0.2.29 path, unchanged.
        const session = buildSession(replica, null);
        const envelope = session.exploreLocation({ center: { x: 80, y: 0, z: 80 }, radius: 10 });
        assert(envelope.documents.length === 1, '17. the document is still found — this path is completely unaffected by 0.2.30');
        assert(envelope.diagnostics.available === false,
            '17b. and diagnostics honestly say "unavailable" rather than inventing a complete:true this replica cannot back up');

        const inspected = session.inspectDocument(publication.documentId);
        assert(inspected.trust === null, '17c. inspectDocument.trust is null — no diagnostics-capable provider was ever consulted');
    }

    console.log('✅ All Trust-Aware Spatial Discovery & Diagnostics tests passed.');
}

runTests().catch((e) => { console.error(e); throw e; });
