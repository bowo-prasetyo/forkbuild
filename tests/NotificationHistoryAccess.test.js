import { NotificationHistoryAccess } from '../application/chat/NotificationHistoryAccess.js';
import { GetRecipientNotificationEventsUseCase } from '../application/chat/GetRecipientNotificationEventsUseCase.js';
import { NotificationEventStore } from '../storage/NotificationEventStore.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { CanCommentOnPublicationUseCase } from '../application/publication/CanCommentOnPublicationUseCase.js';
import { AddPublicationCommentaryUseCase } from '../application/publication/commentary/AddPublicationCommentaryUseCase.js';
import { PublicationCommentaryNotificationProducer } from '../application/publication/commentary/PublicationCommentaryNotificationProducer.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { CompositeDiscoveryProvider } from '../discovery/CompositeDiscoveryProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { makeIdentity } from './support/TestIdentity.js';

// NotificationHistoryAccess backs the Notifications panel in the app's top
// navigation bar. It reads through its own NotificationEventStore over the
// same storage World View's session writes to (as ui/main.js composes it), and
// resolves a notification's Publication to the World that Explore opens.

function makeDocument(title, author) {
    const world = new World();
    const building = new Building({ creator: author });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title, author }) });
}

const storage = new InMemoryStorageProvider();
const discoveryProvider = new LocalDiscoveryProvider(storage);
const publisherProvider = new LocalPublisherProvider(storage, new LocalContentStore(storage));
const alice = makeIdentity('Alice');
const bob = makeIdentity('Bob');
const publication = publisherProvider.publish(makeDocument('A Pyramid with Stair', 'alice'), alice);

// Bob comments on Alice's World: the producer saves a notification for Alice,
// through the store the World View session's composition root would use.
const notificationStorage = new InMemoryStorageProvider();
new PublicationCommentaryNotificationProducer(
    new AddPublicationCommentaryUseCase(new PublicationCommentaryStore(storage), bob, new CanCommentOnPublicationUseCase(discoveryProvider)),
    discoveryProvider,
    (event) => new NotificationEventStore(notificationStorage).save(event)
).execute({ publicationId: publication.id, content: 'nice stairs' });

function accessFor(identityProvider, lookupProviders = [discoveryProvider]) {
    return new NotificationHistoryAccess({
        getRecipientNotificationEventsUseCase: new GetRecipientNotificationEventsUseCase(
            new NotificationEventStore(notificationStorage), identityProvider
        ),
        publicationLookup: new CompositeDiscoveryProvider(lookupProviders)
    });
}

// Reads what another store instance saved, for the signed-in recipient only.
{
    const events = accessFor(alice).getRecipientNotificationEvents();
    assert(events.length === 1 && events[0].payload.publicationId === publication.id,
        'the publisher sees the notification another store instance saved over the same storage');
    assert(accessFor(bob).getRecipientNotificationEvents().length === 0,
        'the commenter, who is not the recipient, sees none');

    const signedOut = { getCurrentIdentity: () => null, getSigningIdentity: () => null, isAuthenticated: () => false };
    let signedOutError = null;
    try {
        accessFor(signedOut).getRecipientNotificationEvents();
    } catch (error) {
        signedOutError = error;
    }
    assert(signedOutError && /sign in/i.test(signedOutError.message) && !/UseCase/.test(signedOutError.message),
        `signed out, it asks you to sign in, without the use case's class name — got ${signedOutError && signedOutError.message}`);
    console.log('✓ reads the signed-in identity\'s notifications from shared storage');
}

// Resolves a notification's Publication to the World that Explore opens.
{
    const access = accessFor(alice);
    assert(access.findPublicationDocumentId(publication.id) === publication.documentId,
        'a known Publication resolves to its documentId');
    assert(access.findPublicationDocumentId('no-such-publication') === null, 'an unknown one resolves to null');
    assert(access.findPublicationDocumentId('') === null && access.findPublicationDocumentId(null) === null,
        'a missing id resolves to null');

    const admitted = { findById: (id) => (id === 'admitted-1' ? { id, documentId: 'doc-admitted' } : null) };
    assert(accessFor(alice, [discoveryProvider, admitted]).findPublicationDocumentId('admitted-1') === 'doc-admitted',
        'a Publication only the second (Repository-admitted) provider knows still resolves');

    const failing = new NotificationHistoryAccess({ publicationLookup: { findById: () => { throw new Error('offline'); } } });
    assert(failing.findPublicationDocumentId(publication.id) === null, 'a failing lookup resolves to null, never throws');
    console.log('✓ resolves a notification\'s Publication to its World');
}

// Without an identity provider the history is empty, as World View's session reports it.
{
    const access = new NotificationHistoryAccess();
    assert(Array.isArray(access.getRecipientNotificationEvents()) && access.getRecipientNotificationEvents().length === 0,
        'no use case: an empty history, no error');
    assert(access.findPublicationDocumentId(publication.id) === null, 'no lookup: nothing resolves');
    console.log('✓ empty without an identity provider');
}
