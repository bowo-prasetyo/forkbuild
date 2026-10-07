import { installFakeWindowLocalStorage } from './support/FakeWindowLocalStorage.js';
import { Publication } from '../publisher/Publication.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { CreatePublicationCommentaryUseCase } from '../application/publication/commentary/CreatePublicationCommentaryUseCase.js';
import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { NotificationEventStore } from '../storage/NotificationEventStore.js';
import { assert } from './support/Assert.js';
import { makeIdentity } from './support/TestIdentity.js';

// A publication someone else published, found from a peer, a link or the
// networks, can be commented on. The Repository lists these publications next
// to this device's own, but commenting used to check only this device's own
// ("not authorized to comment on publication …").

installFakeWindowLocalStorage();

function makePublication(id, publisher) {
    return new Publication({
        id,
        documentId: `doc-${id}`,
        title: 'A Small Tutorial Cottage',
        author: 'forkbuild',
        publisherIdentity: publisher.getSigningIdentity().toJSON()
    });
}

function refusal(fn) {
    try {
        fn();
    } catch (error) {
        return error.message;
    }
    return null;
}

const commenter = makeIdentity('comment-on-discovered-commenter');
const publisher = makeIdentity('comment-on-discovered-publisher');
const discovered = new DecentralizedPublicationDiscoveryProvider();
discovered.add(makePublication('pub-discovered', publisher));

{
    const { addPublicationCommentaryCommand, getPublicationCommentariesCommand } =
        new CreatePublicationCommentaryUseCase().execute(commenter, { decentralizedDiscoveryProvider: discovered });
    const result = addPublicationCommentaryCommand({ publicationId: 'pub-discovered', content: 'Good tutorial' });
    assert(result.isNew === true && result.commentary.authorIdentityId === commenter.getSigningIdentity().id,
        'a publication found from a peer or the networks can be commented on');
    assert(getPublicationCommentariesCommand('pub-discovered').length === 1, 'and the comment is saved on this device');
    assert(new NotificationEventStore(new LocalStorageProvider()).loadAll().length === 0,
        'no notification is stored: the publisher is someone else, on another device');

    const unknown = refusal(() => addPublicationCommentaryCommand({ publicationId: 'pub-nowhere', content: 'Hello?' }));
    assert(/not authorized to comment on publication pub-nowhere/.test(unknown || ''), 'a publication this device doesn\'t know is still refused');
    console.log('✓ a discovered publication can be commented on; an unknown one still can\'t');
}

{
    const { addPublicationCommentaryCommand } = new CreatePublicationCommentaryUseCase().execute(commenter);
    const refused = refusal(() => addPublicationCommentaryCommand({ publicationId: 'pub-discovered', content: 'Good tutorial' }));
    assert(/not authorized/.test(refused || ''), 'without the discovered publications, only this device\'s own can be commented on');
    console.log('✓ without the discovery provider the check stays on this device\'s own publications');
}

console.log('\n✅ All comment-on-discovered-publication tests passed.');
