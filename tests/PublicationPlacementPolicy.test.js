// A publisher's placement policy (core/PlacementPolicy.js): chosen in
// Document Properties, signed into the Publication at publish, and honored
// wherever a placement is created (PlacePublicationUseCase), merged from a
// peer (ReplicaMergeService) or accepted from a claim (ClaimedBuilds).
import {
    PlacementPolicy, PlacementPermissionReason, PlacementNotPermittedError, evaluatePlacementPermission, placementPolicyOf
} from '../core/PlacementPolicy.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Document } from '../core/Document.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { SpatialBounds } from '../core/SpatialBounds.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { CausalStamp } from '../core/CausalStamp.js';
import { License, LicenseId } from '../core/License.js';
import { Publication } from '../publisher/Publication.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { PlacePublicationUseCase } from '../application/placement/PlacePublicationUseCase.js';
import { CreateReplicationUseCase } from '../application/placement/CreateReplicationUseCase.js';
import { MergeResult } from '../replication/ReplicaMergeService.js';
import { DocumentCloneService } from '../application/document/DocumentCloneService.js';
import { ImportDocumentUseCase } from '../application/document/ImportDocumentUseCase.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { UpdateDocumentMetadataUseCase } from '../application/document/UpdateDocumentMetadataUseCase.js';
import { describePlacementPolicy as describePlacementPolicyMessage, PLACEMENT_POLICY_OPTIONS } from '../application/document/PlacementPolicyLabels.js';
import { t } from '../ui/i18n/i18n.js';
// Each label as a person reads it, in English.
const describePlacementPolicy = (...args) => t(describePlacementPolicyMessage(...args));
import { ClaimedBuildAcceptance, describeClaimedBuildAcceptance } from '../application/snapshot/claimed/ClaimedBuilds.js';
import MetadataEditorDialog from '../ui/components/MetadataEditorDialog.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

function createIdentity(username) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    provider.login(username);
    provider.getSigningIdentity();
    return provider;
}

function makeDocument(placementPolicy) {
    const world = new World();
    const building = new Building({ creator: 'alice' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({
        world,
        metadata: new DocumentMetadata({
            title: 'Alice\'s house', author: 'alice', license: new License({ id: LicenseId.CC_BY_4_0 }), placementPolicy
        })
    });
}

function placeUseCase(publication, identityProvider) {
    const storage = new InMemoryStorageProvider();
    const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
    const registry = new LocalPlacementRegistry(storage, spatialIndexProvider);
    const discovery = { findById: (id) => (id === publication.id ? publication : null) };
    const loadDocument = { execute: () => { throw new Error('not needed'); } };
    return {
        registry,
        useCase: new PlacePublicationUseCase(spatialIndexProvider, discovery, loadDocument, null, registry, identityProvider)
    };
}

function signedPlacement(provider, publicationId) {
    const identity = provider.getSigningIdentity();
    let record = new PlacementRecord({
        placementId: `pl-${identity.id.slice(-6)}`, publicationId, revision: 1,
        position: new Position(10, 0, 10),
        bounds: new SpatialBounds({ min: { x: -0.5, y: 0, z: -0.5 }, max: { x: 0.5, y: 1, z: 0.5 } })
    });
    record = record.withOwnerIdentity(identity.toJSON());
    record = record.withCausalHistory(new CausalStamp().advance(identity.id), []);
    record = record.withContentHash(record.computeContentHash());
    return record.withSignature(provider.signCanonical(record.getSigningDescriptor()));
}

const alice = createIdentity('alice');
const bob = createIdentity('bob');
const verifier = new LocalAuthorizationVerifier();

// Section A — the setting on the document, and its default.
{
    const plain = new DocumentMetadata({ title: 'x' });
    assert(plain.placementPolicy === PlacementPolicy.ANYONE, 'A1. a document lets anyone place it unless its author says otherwise');
    assert(!('placementPolicy' in plain.toJSON()), 'A2. the default is not written, so existing documents keep their content hash');

    const restricted = new DocumentMetadata({ title: 'x', placementPolicy: PlacementPolicy.PUBLISHER_ONLY });
    const round = DocumentMetadata.fromJSON(JSON.parse(JSON.stringify(restricted.toJSON())));
    assert(round.placementPolicy === PlacementPolicy.PUBLISHER_ONLY, 'A3. a chosen setting survives a save and reload');

    const document = makeDocument();
    const manager = { document, markDirty() { this.dirty = true; } };
    new UpdateDocumentMetadataUseCase().execute(manager, { placementPolicy: PlacementPolicy.PUBLISHER_ONLY });
    assert(document.metadata.placementPolicy === PlacementPolicy.PUBLISHER_ONLY && manager.dirty,
        'A4. Document Properties changes it like any other metadata field');
    console.log('✓ Section A: the setting lives on the document and defaults to anyone');
}

// Section B — publishing signs it into the Publication.
{
    const storage = new InMemoryStorageProvider();
    const publisher = new LocalPublisherProvider(storage);

    const open = publisher.publish(makeDocument(), alice);
    assert(open.placementPolicy === null && !('placementPolicy' in open.getSigningDescriptor().payload)
        && !('placementPolicy' in open.toJSON()),
    'B1. an unrestricted publish signs and stores exactly the fields it always did');
    assert(verifier.verifyPublication(open).valid, 'B2. its signature verifies');

    const restricted = publisher.publish(makeDocument(PlacementPolicy.PUBLISHER_ONLY), alice);
    assert(restricted.placementPolicy === PlacementPolicy.PUBLISHER_ONLY
        && restricted.getSigningDescriptor().payload.placementPolicy === PlacementPolicy.PUBLISHER_ONLY,
    'B3. a restricted publish carries the setting inside the signed payload');
    const reloaded = Publication.fromJSON(JSON.parse(JSON.stringify(restricted.toJSON())));
    assert(reloaded.placementPolicy === PlacementPolicy.PUBLISHER_ONLY && verifier.verifyPublication(reloaded).valid,
        'B4. it survives storage and still verifies');

    const stripped = Publication.fromJSON({ ...restricted.toJSON(), placementPolicy: undefined });
    assert(!verifier.verifyPublication(stripped).valid, 'B5. stripping the setting breaks the publisher\'s signature');
    const loosened = Publication.fromJSON({ ...restricted.toJSON(), placementPolicy: PlacementPolicy.ANYONE });
    assert(!verifier.verifyPublication(loosened).valid, 'B6. loosening it breaks the signature too');
    console.log('✓ Section B: the setting is signed, so it cannot be removed or changed');
}

// Section C — who may place.
{
    const publisher = new LocalPublisherProvider(new InMemoryStorageProvider());
    const restricted = publisher.publish(makeDocument(PlacementPolicy.PUBLISHER_ONLY), alice);
    const aliceId = alice.getSigningIdentity().id;
    const bobId = bob.getSigningIdentity().id;

    assert(evaluatePlacementPermission(restricted, { identityId: aliceId }).allowed, 'C1. the publisher may place it');
    const refused = evaluatePlacementPermission(restricted, { identityId: bobId, username: 'alice' });
    assert(!refused.allowed && refused.reason === PlacementPermissionReason.PUBLISHER_ONLY,
        'C2. anyone else is refused, even with the publisher\'s display name');
    assert(!evaluatePlacementPermission(restricted, {}).allowed, 'C3. an anonymous placer is refused');

    const legacy = new Publication({ id: 'legacy', documentId: 'd', title: 't', author: 'alice', placementPolicy: PlacementPolicy.PUBLISHER_ONLY });
    assert(evaluatePlacementPermission(legacy, { username: 'alice' }).allowed
        && !evaluatePlacementPermission(legacy, { username: 'bob' }).allowed,
    'C4. an unsigned Publication falls back to comparing display names');

    const future = new Publication({ id: 'f', documentId: 'd', title: 't', author: 'alice', placementPolicy: 'friends-only' });
    assert(placementPolicyOf(future) === 'friends-only' && !evaluatePlacementPermission(future, { username: 'bob' }).allowed,
        'C5. a setting this version doesn\'t know is treated as publisher-only, never as permission');
    console.log('✓ Section C: only the publisher may place a publisher-only Publication');
}

// Section D — PlacePublicationUseCase enforces it.
{
    const publisher = new LocalPublisherProvider(new InMemoryStorageProvider());
    const restricted = publisher.publish(makeDocument(PlacementPolicy.PUBLISHER_ONLY), alice);
    const open = publisher.publish(makeDocument(), alice);

    const asAlice = placeUseCase(restricted, alice);
    asAlice.useCase.execute(restricted.id, { x: 1, y: 0, z: 1 });
    assert(asAlice.registry.findByPublicationId(restricted.id).length === 1, 'D1. the publisher places their own build');

    const asBob = placeUseCase(restricted, bob);
    assert(!asBob.useCase.checkPermission(restricted.id).allowed, 'D2. checkPermission() tells the UI before anyone clicks');
    let error = null;
    try {
        asBob.useCase.execute(restricted.id, { x: 500, y: 0, z: 500 });
    } catch (err) {
        error = err;
    }
    assert(error instanceof PlacementNotPermittedError && error.publicationId === restricted.id,
        'D3. anyone else placing it is refused with PlacementNotPermittedError');
    assert(asBob.registry.findByPublicationId(restricted.id).length === 0, 'D4. nothing is written when refused');

    const bobOpen = placeUseCase(open, bob);
    bobOpen.useCase.execute(open.id, { x: 2, y: 0, z: 2 });
    assert(bobOpen.registry.findByPublicationId(open.id).length === 1, 'D5. an unrestricted Publication can still be placed by anyone');
    console.log('✓ Section D: placing a publisher-only build as someone else is refused');
}

// Section E — placements received from peers are checked too.
{
    const publisher = new LocalPublisherProvider(new InMemoryStorageProvider());
    const restricted = publisher.publish(makeDocument(PlacementPolicy.PUBLISHER_ONLY), alice);
    const storage = new InMemoryStorageProvider();
    const registry = new LocalPlacementRegistry(storage, new LocalSpatialIndexProvider(storage));
    const { mergeService } = new CreateReplicationUseCase().execute(storage, registry, {
        findPublicationById: (id) => (id === restricted.id ? restricted : null)
    });

    const fromBob = await mergeService.merge(signedPlacement(bob, restricted.id));
    assert(fromBob.result === MergeResult.REJECTED && fromBob.reason === 'PLACEMENT_POLICY',
        'E1. a peer\'s placement signed by someone other than the publisher is rejected');
    assert(registry.findByPublicationId(restricted.id).length === 0, 'E2. the rejected placement never reaches the registry');

    const fromAlice = await mergeService.merge(signedPlacement(alice, restricted.id));
    assert(fromAlice.result === MergeResult.UPDATED, 'E3. the publisher\'s own placement is merged');

    const unknown = await mergeService.merge(signedPlacement(bob, 'not-known-here'));
    assert(unknown.result === MergeResult.UPDATED, 'E4. a placement of a Publication this replica doesn\'t know is accepted as before');
    console.log('✓ Section E: replication rejects placements the publisher didn\'t allow');
}

// Section F — Accept Position explains the refusal.
{
    const publication = { id: 'p', contentReference: { hash: 'h' } };
    const claim = { publicationId: 'p', contentHash: 'h' };
    const find = () => publication;
    assert(describeClaimedBuildAcceptance(claim, find) === ClaimedBuildAcceptance.ACCEPTABLE,
        'F1. without a policy check, a verified claim stays acceptable');
    assert(describeClaimedBuildAcceptance(claim, find, () => false) === ClaimedBuildAcceptance.PUBLISHER_ONLY,
        'F2. a claim whose publisher allows only their own placements is not acceptable');
    console.log('✓ Section F: Accept Position is disabled for publisher-only builds');
}

// Section G — the Document Properties dialog.
{
    assert(PLACEMENT_POLICY_OPTIONS.map((o) => o.id).join() === `${PlacementPolicy.ANYONE},${PlacementPolicy.PUBLISHER_ONLY}`,
        'G1. the dialog offers both choices');
    assert(describePlacementPolicy('something-new') === describePlacementPolicy(PlacementPolicy.PUBLISHER_ONLY),
        'G2. an unknown setting is labelled as the restrictive one it is treated as');

    const info = { title: 'T', description: '', license: new License({ id: LicenseId.CC0_1_0 }), placementPolicy: PlacementPolicy.PUBLISHER_ONLY };
    const vm = { info, ...MetadataEditorDialog.data.call({ info }) };
    assert(vm.placementPolicy === PlacementPolicy.PUBLISHER_ONLY, 'G3. the dialog opens on the document\'s current setting');
    let emitted = null;
    vm.$emit = (name, payload) => { emitted = { name, payload }; };
    vm.placementPolicy = PlacementPolicy.ANYONE;
    MetadataEditorDialog.methods.onSave.call(vm);
    assert(emitted && emitted.name === 'save' && emitted.payload.placementPolicy === PlacementPolicy.ANYONE,
        'G4. Save emits the chosen setting with the other fields');
    console.log('✓ Section G: Document Properties shows and saves the setting');
}

// Section H — forks start from the default; importing keeps the setting.
{
    const source = makeDocument(PlacementPolicy.PUBLISHER_ONLY);
    const clone = new DocumentCloneService().execute(source, { title: 'Fork' });
    assert(clone.metadata.placementPolicy === PlacementPolicy.ANYONE, 'H1. a fork\'s author starts from the default');
    const imported = new ImportDocumentUseCase().execute(source.toJSON());
    assert(imported.metadata.placementPolicy === PlacementPolicy.PUBLISHER_ONLY, 'H2. importing your own exported document keeps the setting');
    console.log('✓ Section H: forks reset the setting, imports keep it');
}
