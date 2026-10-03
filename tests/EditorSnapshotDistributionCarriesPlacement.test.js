import { usePostPublishDistribution } from '../ui/views/editorView/usePostPublishDistribution.js';
import { PublisherPlacementClaimLookup } from '../application/placement/PublisherPlacementClaim.js';
import { PlacePublicationUseCase } from '../application/placement/PlacePublicationUseCase.js';
import { AdoptPublisherPlacementUseCase, PublisherPlacementAdoption } from '../application/placement/AdoptPublisherPlacementUseCase.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { WorldPosition } from '../core/WorldPosition.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { mountComponent } from './support/MinimalVueCompositionApiShim.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// The Editor's Distribute, offered right after publishing, announces the
// Snapshot with the publisher's own signed placement that publishing made, as
// the Publications page and World View already did. Without it another device
// opening the build's link had no placement to adopt, and showed the build at
// its stand-in grid position with "Placements (0)".

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function publishPlaced(position) {
    const identity = new LocalIdentityProvider(new InMemoryStorageProvider());
    identity.login('editor-placement-alice');
    const world = new World();
    const building = new Building({ creator: 'alice' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    const publication = new LocalPublisherProvider(new InMemoryStorageProvider())
        .publish(new Document({ world, metadata: new DocumentMetadata({ title: 'Thin Pyramid', author: 'alice' }) }), identity);

    const storage = new InMemoryStorageProvider();
    const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
    const registry = new LocalPlacementRegistry(storage, spatialIndexProvider);
    const discovery = { findById: (id) => (id === publication.id ? publication : null) };
    const loader = { execute: () => { throw new Error('unused'); } };
    new PlacePublicationUseCase(spatialIndexProvider, discovery, loader, null, registry, identity)
        .execute(publication.id, new WorldPosition(position.x, position.y, position.z));
    return { publication, registry };
}

function mount(injections) {
    return mountComponent({ setup: () => usePostPublishDistribution({ router: null }) }, injections);
}

{
    const { publication, registry } = publishPlaced({ x: 560, y: 0, z: 80 });
    const calls = [];
    const harness = mount({
        snapshotDistributionCommand: (...args) => {
            calls.push(args);
            return Promise.resolve({ contentReference: { hash: 'h', uri: 'steem://a/b', storage: 'steem' }, announcement: { id: 'a1' } });
        },
        publicationContentStore: { get: async () => '{"snapshot":true}' },
        publisherPlacementClaimLookup: new PublisherPlacementClaimLookup(registry)
    });
    harness.onDocumentPublished(publication);
    harness.distributePublishedSnapshot();
    await flush();

    assert(calls.length === 1, '1. Distribute Snapshot runs the Snapshot distribution command');
    const [, , publicationId, claimedPosition, , placementRecord] = calls[0];
    assert(publicationId === publication.id, `2. the announcement names the Publication (got ${publicationId})`);
    assert(claimedPosition && claimedPosition.x === 560 && claimedPosition.z === 80, `3. ...and where it stands (got ${JSON.stringify(claimedPosition)})`);
    assert(placementRecord && placementRecord.signature && placementRecord.publicationId === publication.id,
        '4. ...with the publisher\'s signed placement beside it');

    // What another device does with it on opening the link.
    const elsewhere = new InMemoryStorageProvider();
    const adoption = new AdoptPublisherPlacementUseCase({
        placementRegistry: new LocalPlacementRegistry(elsewhere, new LocalSpatialIndexProvider(elsewhere)),
        verifier: new LocalAuthorizationVerifier(),
        findPublicationById: (id) => (id === publication.id ? publication : null)
    }).execute(placementRecord);
    assert(adoption.outcome === PublisherPlacementAdoption.ADOPTED, `5. a device that never saw it adopts the announced placement (got ${adoption.outcome})`);
    const [placed] = new LocalSpatialIndexProvider(elsewhere).findByPublicationId(publication.id);
    assert(placed && placed.position.x === 560 && placed.position.z === 80, '6. ...and shows the build where it was published');
    console.log('✓ the Editor\'s Distribute announces the Snapshot with the publisher\'s placement');
}

{
    // A device holding no placement for it announces the Snapshot alone, as before.
    const { publication } = publishPlaced({ x: 1, y: 0, z: 1 });
    const calls = [];
    const harness = mount({
        snapshotDistributionCommand: (...args) => { calls.push(args); return Promise.resolve({ contentReference: { hash: 'h' }, announcement: null }); },
        publicationContentStore: { get: async () => '{"snapshot":true}' },
        publisherPlacementClaimLookup: new PublisherPlacementClaimLookup(new LocalPlacementRegistry(new InMemoryStorageProvider()))
    });
    harness.onDocumentPublished(publication);
    harness.distributePublishedSnapshot();
    await flush();
    const [, , publicationId, claimedPosition, , placementRecord] = calls[0];
    assert(publicationId === undefined && claimedPosition === undefined && placementRecord === undefined,
        '7. with no placement here, the Snapshot is announced without one');
    console.log('✓ without a placement, the Snapshot is announced alone');
}
