// application/publication/LookAlikeBuildNotifier.js: a build admitted on this
// device that looks a lot like one of the signed-in builder's own, published
// before it, tells them in the 🔔, once; with the real SimilarBuildFinder.
import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { Publication } from '../publisher/Publication.js';
import { SimilarBuildFinder } from '../application/publication/SimilarBuildFinder.js';
import { LookAlikeBuildNotifier, BUILD_LOOKS_LIKE_YOURS_EVENT_TYPE } from '../application/publication/LookAlikeBuildNotifier.js';
import { NotificationEventStore, NotificationPersistenceOutcome } from '../storage/NotificationEventStore.js';
import { describeNotification } from '../ui/notifications/notificationText.js';
import { t } from '../ui/i18n/i18n.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

function cottageBricks({ dx = 0, width = 6, kind = 'core:cube' } = {}) {
    const bricks = [];
    for (let x = 0; x < width; x += 1) {
        for (let z = 0; z < 5; z += 1) {
            if (x !== 0 && x !== width - 1 && z !== 0 && z !== 4) continue;
            for (const y of [0.5, 1.5]) bricks.push(new Brick({ definitionId: kind, position: new Position(x + dx, y, z) }));
        }
    }
    bricks.push(new Brick({ definitionId: 'core:door', position: new Position(2 + dx, 1, 0) }));
    return bricks;
}

function signedIn(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    provider.login(label);
    return provider;
}

const contentStore = new LocalContentStore(new InMemoryStorageProvider());
const known = [];

// `provider` publishes a build of `bricks`, its bytes on this device.
function publish(provider, { documentId, title, bricks, publishedAt, parentDocumentId = null, builtWith = [] }) {
    const world = new World({ id: documentId });
    const building = new Building();
    for (const brick of bricks) building.addBrick(brick);
    world.addBuilding(building);
    const reference = contentStore.put(JSON.stringify(new Document({ world, metadata: new DocumentMetadata({ title, parentDocumentId }) }).toJSON()));
    const unsigned = new Publication({
        documentId, title, parentDocumentId, builtWith,
        author: provider.currentUser().username,
        contentHash: reference.hash,
        contentReference: reference,
        publishedAt: new Date(publishedAt),
        publisherIdentity: provider.getSigningIdentity().toJSON()
    });
    const publication = unsigned.withSignature(provider.signCanonical(unsigned.getSigningDescriptor()));
    known.push(publication);
    return publication;
}

const alice = signedIn('lookalike-alice');
const bob = signedIn('lookalike-bob');
const carol = signedIn('lookalike-carol');
const finder = new SimilarBuildFinder({ listPublications: () => known, contentStore });
const store = new NotificationEventStore(new InMemoryStorageProvider());
const outcomes = [];
let blocked = new Set();
const notifier = new LookAlikeBuildNotifier({
    identityProvider: alice,
    similarBuildFinder: finder,
    isBlocked: (id) => blocked.has(id),
    notificationSink: (event) => outcomes.push(store.save(event).outcome),
    now: () => new Date('2026-10-20T10:00:00Z')
});

const cottage = publish(alice, { documentId: 'alice-cottage', title: 'Cozy Cottage', bricks: cottageBricks(), publishedAt: '2026-09-01T00:00:00Z' });
publish(carol, { documentId: 'carol-barn', title: 'Barn', bricks: cottageBricks({ width: 12, kind: 'core:block_2x2' }), publishedAt: '2026-09-02T00:00:00Z' });

{
    const copy = publish(bob, { documentId: 'bob-cottage', title: 'My Cottage', bricks: cottageBricks({ dx: 40 }), publishedAt: '2026-10-05T00:00:00Z' });
    const created = await notifier.handlePublicationAdmitted(copy);
    assert(created && created.eventType === BUILD_LOOKS_LIKE_YOURS_EVENT_TYPE && created.recipientIdentityId === alice.getSigningIdentity().id,
        '1. a build that looks like Alice\'s, published after it, notifies Alice');
    assert(created.payload.publicationId === copy.id && created.payload.title === 'My Cottage' && created.payload.author === 'lookalike-bob'
        && created.payload.yourTitle === 'Cozy Cottage' && created.payload.percent === 100,
        `2. it names the build, its maker, Alice's build and how alike they are (${JSON.stringify(created.payload)})`);
    await notifier.handlePublicationAdmitted(copy);
    assert(outcomes.join() === `${NotificationPersistenceOutcome.NEW},${NotificationPersistenceOutcome.EXISTING}`, '3. once per build, however often it is found');

    const words = describeNotification(created);
    assert(words.title === t('notificationText.looksLikeYours', { author: 'lookalike-bob' })
        && words.body === t('notificationText.looksLikeYoursBody', { title: 'My Cottage', yours: 'Cozy Cottage', percent: 100 }),
        `4. the 🔔 says so in words (${words.title} / ${words.body})`);
}
console.log('✓ a build like yours, published after it, notifies you once');

{
    const different = publish(bob, { documentId: 'bob-tower', title: 'Tower', bricks: cottageBricks({ width: 12, kind: 'core:roof_cone' }), publishedAt: '2026-10-06T00:00:00Z' });
    assert(await notifier.handlePublicationAdmitted(different) === null, '5. a build unlike Alice\'s notifies nothing');
    const barnCopy = publish(bob, { documentId: 'bob-barn', title: 'Barn too', bricks: cottageBricks({ width: 12, kind: 'core:block_2x2' }), publishedAt: '2026-10-06T00:00:00Z' });
    assert(await notifier.handlePublicationAdmitted(barnCopy) === null, '6. nor one like someone else\'s build');
    const earlier = publish(bob, { documentId: 'bob-early', title: 'Earlier', bricks: cottageBricks(), publishedAt: '2026-08-01T00:00:00Z' });
    assert(await notifier.handlePublicationAdmitted(earlier) === null, '7. nor one published before Alice\'s');
    const remix = publish(bob, { documentId: 'bob-remix', title: 'Remix', bricks: cottageBricks(), publishedAt: '2026-10-07T00:00:00Z', parentDocumentId: 'alice-cottage' });
    assert(await notifier.handlePublicationAdmitted(remix) === null, '8. nor a remix of hers (a remix notification tells of that)');
    const together = publish(bob, { documentId: 'bob-together', title: 'Together', bricks: cottageBricks(), publishedAt: '2026-10-07T00:00:00Z', builtWith: [{ name: 'alice', identityId: alice.getSigningIdentity().id }] });
    assert(await notifier.handlePublicationAdmitted(together) === null, '9. nor one she built with its maker');
    const hers = publish(alice, { documentId: 'alice-second', title: 'Second cottage', bricks: cottageBricks(), publishedAt: '2026-10-07T00:00:00Z' });
    assert(await notifier.handlePublicationAdmitted(hers) === null, '10. nor one of her own');
    const forged = new Publication({ ...publish(bob, { documentId: 'bob-forged', title: 'Forged', bricks: cottageBricks(), publishedAt: '2026-10-07T00:00:00Z' }).toJSON(), title: 'Changed' });
    assert(await notifier.handlePublicationAdmitted(forged) === null, '11. nor one whose signature doesn\'t check out');
    blocked = new Set([bob.getSigningIdentity().id]);
    assert(await notifier.handlePublicationAdmitted(publish(bob, { documentId: 'bob-blocked', title: 'Blocked', bricks: cottageBricks(), publishedAt: '2026-10-08T00:00:00Z' })) === null,
        '12. nor one by someone she blocked');
    blocked = new Set();
}
console.log('✓ unlike builds, earlier ones, remixes, shared, own, forged and blocked notify nothing');

{
    // A build that claims to be Alice's but isn't signed by her doesn't count.
    const fakeAlice = new Publication({ ...publish(carol, { documentId: 'fake-alice', title: 'Not hers', bricks: cottageBricks({ width: 9, kind: 'core:slab_4x4' }), publishedAt: '2026-09-03T00:00:00Z' }).toJSON(), publisherIdentity: alice.getSigningIdentity().toJSON() });
    known.push(fakeAlice);
    const lookAlike = publish(bob, { documentId: 'bob-slab', title: 'Slabs', bricks: cottageBricks({ width: 9, kind: 'core:slab_4x4' }), publishedAt: '2026-10-09T00:00:00Z' });
    assert(await notifier.handlePublicationAdmitted(lookAlike) === null, '13. a build counts as Alice\'s only when verifiably signed by her');

    const signedOut = new LookAlikeBuildNotifier({ identityProvider: new LocalIdentityProvider(new InMemoryStorageProvider()), similarBuildFinder: finder, notificationSink: () => { throw new Error('should not notify'); } });
    assert(await signedOut.handlePublicationAdmitted(known.find((p) => p.documentId === 'bob-cottage')) === null, '14. signed out, nobody is notified');

    const failing = new LookAlikeBuildNotifier({ identityProvider: alice, similarBuildFinder: { findEarlier: async () => { throw new Error('storage blocked'); } }, notificationSink: () => {} });
    assert(await failing.handlePublicationAdmitted(known.find((p) => p.documentId === 'bob-cottage')) === null, '15. a failed look notifies nothing, without throwing');
    assert(await failing.handlePublicationAdmitted(null) === null, '16. nor does nothing');

    let running = 0;
    let most = 0;
    const slow = new LookAlikeBuildNotifier({
        identityProvider: alice,
        similarBuildFinder: { findEarlier: async () => { running += 1; most = Math.max(most, running); await new Promise((resolve) => setTimeout(resolve, 5)); running -= 1; return []; } },
        notificationSink: () => {}
    });
    const copies = known.filter((p) => p.publisherIdentity?.id === bob.getSigningIdentity().id).slice(0, 4);
    await Promise.all(copies.map((p) => slow.handlePublicationAdmitted(p)));
    assert(most === 1, `17. builds are compared one at a time (${most} at once)`);
}
console.log('✓ only verifiably hers; signed out, failures and bursts');

console.log('✅ All look-alike build notifier tests passed.');
