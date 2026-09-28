import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { Publication } from '../publisher/Publication.js';
import { Position } from '../core/Position.js';
import { SpatialBounds } from '../core/SpatialBounds.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { FollowRecord } from '../core/FollowRecord.js';
import { getPlaceNamingClaimSigningDescriptor } from '../core/PlaceNamingClaim.js';
import { FollowUseCase } from '../application/identity/FollowUseCase.js';
import { FollowingFeed } from '../application/publication/FollowingFeed.js';
import {
    FollowedAuthorPublicationNotifier,
    FOLLOWED_AUTHOR_PUBLISHED_EVENT_TYPE
} from '../application/publication/FollowedAuthorPublicationNotifier.js';
import { createFollowedAnnouncementRetention } from '../application/announcementIndex/FollowedAnnouncementRetention.js';
import { AnnouncementIndex } from '../application/announcementIndex/AnnouncementIndex.js';
import { AnnouncementKind } from '../application/announcementIndex/AnnouncementKinds.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { NotificationEventStore, NotificationPersistenceOutcome } from '../storage/NotificationEventStore.js';
import { buildPeople, filterPeople } from '../ui/views/peerConnections/people.js';
import { buildFollowedPeople } from '../ui/views/following/followedPeople.js';
import FollowButton from '../ui/components/FollowButton.js';
import { mountComponent } from './support/MinimalVueCompositionApiShim.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// Following: a private, local list of identities whose verified work this
// device shows under Following, notifies about, keeps longer in the
// Announcement Index and retrieves from peers without a click.

function signedIn(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    provider.login(label);
    return provider;
}

function idOf(provider) {
    return provider.getSigningIdentity().id;
}

function signedPublication(provider, { title, publishedAt = new Date('2026-09-01T00:00:00Z'), author = null }) {
    const unsigned = new Publication({
        documentId: `doc-${title}`,
        title,
        author: author || provider.currentUser().username,
        contentHash: `hash-${title}`,
        publishedAt,
        publisherIdentity: provider.getSigningIdentity().toJSON()
    });
    return unsigned.withSignature(provider.signCanonical(unsigned.getSigningDescriptor()));
}

function signedPlacement(provider, publicationId) {
    const draft = new PlacementRecord({
        placementId: `placement-${publicationId}`,
        publicationId,
        owner: provider.currentUser().username,
        position: new Position(10, 0, 20),
        bounds: new SpatialBounds({ min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }),
        revision: 1
    });
    const hashed = new PlacementRecord({ ...draft.toJSON(), contentHash: draft.computeContentHash() })
        .withOwnerIdentity(provider.getSigningIdentity().toJSON());
    return hashed.withSignature(provider.signCanonical(hashed.getSigningDescriptor()));
}

function signedClaim(provider, name) {
    const record = {
        id: `claim-${name}`,
        worldId: 'world-1',
        regionId: 'region-1',
        name,
        authorIdentityId: idOf(provider),
        createdAt: '2026-09-01T00:00:00.000Z'
    };
    return { ...record, signature: provider.signCanonical(getPlaceNamingClaimSigningDescriptor(record)).toJSON() };
}

const alice = signedIn('alice');
const bob = signedIn('bob');
const carol = signedIn('carol');

// A follow record accepts only a did:key and survives storage.
{
    const record = new FollowRecord({ identityId: idOf(bob), name: '  Bob  ', followedAt: '2026-09-02T00:00:00Z' });
    assert(record.name === 'Bob', 'the name is trimmed');
    const restored = FollowRecord.fromJSON(JSON.parse(JSON.stringify(record.toJSON())));
    assert(restored.identityId === idOf(bob) && restored.followedAt.getTime() === record.followedAt.getTime(), 'a follow round-trips through JSON');
    let threw = false;
    try { new FollowRecord({ identityId: 'bob' }); } catch { threw = true; }
    assert(threw, 'a typed name is not an identity that can be followed');
    assert(FollowRecord.fromJSON({ identityId: 'did:key:zNotAKey' }) === null, 'a stored entry that no longer validates is dropped, not thrown');
    console.log('✓ FollowRecord: did:key only, name is a trimmed label, round-trips');
}

// Following is per signed-in identity, idempotent, and never includes yourself.
{
    const storage = new InMemoryStorageProvider();
    const signedOut = new LocalIdentityProvider(new InMemoryStorageProvider());
    const nobody = new FollowUseCase(storage, signedOut);
    assert(!nobody.isSignedIn() && !nobody.canFollow(idOf(bob)), 'signed out: nothing can be followed');
    let threw = false;
    try { nobody.follow(idOf(bob)); } catch (e) { threw = /sign in/.test(e.message); }
    assert(threw, 'following while signed out explains why it failed');
    assert(nobody.getFollowing().length === 0, 'signed out: the list is empty');

    let now = new Date('2026-09-01T00:00:00Z');
    const follows = new FollowUseCase(storage, alice, { now: () => now });
    const changes = [];
    follows.onFollowingChanged((list) => changes.push(list.map((f) => f.identityId)));

    assert(!follows.canFollow(idOf(alice)), 'you cannot follow yourself');
    threw = false;
    try { follows.follow(idOf(alice)); } catch { threw = true; }
    assert(threw, 'follow() refuses the signed-in identity');
    threw = false;
    try { follows.follow('bob'); } catch { threw = true; }
    assert(threw, 'follow() refuses anything but a did:key');

    follows.follow(idOf(bob));
    now = new Date('2026-09-02T00:00:00Z');
    follows.follow(idOf(carol), { name: 'Carol' });
    assert(follows.isFollowing(idOf(bob)) && follows.isFollowing(idOf(carol)), 'both follows are kept');
    assert(follows.getFollowing()[0].identityId === idOf(carol), 'most recently followed first');

    const again = follows.follow(idOf(bob), { name: 'Bob' });
    assert(again.name === 'Bob' && again.followedAt.toISOString() === '2026-09-01T00:00:00.000Z',
        'following again fills in a missing name and keeps the original date');
    assert(follows.follow(idOf(bob), { name: 'Robert' }).name === 'Bob', 'an existing name is not replaced');
    assert(changes.length === 3, `a change fires for each real change only, got ${changes.length}`);

    assert(follows.unfollow(idOf(bob)) === true && !follows.isFollowing(idOf(bob)), 'unfollow removes the follow');
    assert(follows.unfollow(idOf(bob)) === false, 'unfollowing someone you do not follow is not an error');

    const bobsView = new FollowUseCase(storage, bob);
    assert(bobsView.getFollowing().length === 0, 'each identity has its own list, even on a shared device');
    assert(new FollowUseCase(storage, alice).isFollowing(idOf(carol)), 'the list is stored, not kept in memory');
    console.log('✓ FollowUseCase: local, per identity, idempotent, never yourself');
}

// The feed lists verified Publications by followed, unblocked identities only.
{
    const follows = new FollowUseCase(new InMemoryStorageProvider(), alice);
    follows.follow(idOf(bob));
    follows.follow(idOf(carol));
    const blocked = new Set();
    const repository = new DecentralizedPublicationDiscoveryProvider();

    const bobOld = signedPublication(bob, { title: 'Old Castle', publishedAt: new Date('2026-08-01T00:00:00Z') });
    const bobNew = signedPublication(bob, { title: 'New Castle', publishedAt: new Date('2026-09-10T00:00:00Z') });
    const carolWork = signedPublication(carol, { title: 'Bridge', publishedAt: new Date('2026-09-05T00:00:00Z') });
    const strangerWork = signedPublication(signedIn('dave'), { title: 'Tower' });
    // Claims to be Bob's, but Bob never signed it.
    const forged = new Publication({ ...bobNew.toJSON(), id: 'forged', title: 'Forged Castle' });
    const unsigned = new Publication({ documentId: 'doc-u', title: 'Unsigned', author: 'bob', publisherIdentity: bob.getSigningIdentity().toJSON() });
    for (const publication of [bobOld, bobNew, carolWork, strangerWork, forged, unsigned, bobNew]) {
        repository.add(publication);
    }

    const feed = new FollowingFeed({
        discoveryProvider: repository,
        isFollowing: (id) => follows.isFollowing(id),
        isBlocked: (id) => blocked.has(id)
    });
    const titles = () => feed.list().map((p) => p.title).join(', ');
    assert(titles() === 'New Castle, Bridge, Old Castle', `newest first, followed and verified only, no duplicates, got ${titles()}`);
    assert(feed.list({ identityId: idOf(carol) }).map((p) => p.title).join() === 'Bridge', 'the feed narrows to one identity');
    assert(feed.verifiedPublisherOf(forged) === null && feed.verifiedPublisherOf(unsigned) === null,
        'a forged or unsigned Publication has no verified publisher');

    blocked.add(idOf(bob));
    assert(titles() === 'Bridge', 'blocking hides a followed identity from the feed');
    blocked.clear();
    follows.unfollow(idOf(carol));
    assert(titles() === 'New Castle, Old Castle', 'unfollowing takes their work off the feed');

    const people = buildFollowedPeople({
        follows: [...follows.getFollowing(), new FollowRecord({ identityId: idOf(carol), name: 'Carol' })],
        publications: feed.list(),
        signerOf: (p) => feed.verifiedPublisherOf(p)
    });
    assert(people[0].identityId === idOf(bob) && people[0].name === 'bob' && people[0].publicationCount === 2,
        'a follow without a saved name takes the author name on their newest work');
    assert(people[1].name === 'Carol' && people[1].publicationCount === 0, 'someone with nothing here yet is still listed, by saved name');
    console.log('✓ FollowingFeed: verified signatures only, newest first, respects blocking and unfollowing');
}

// A newly admitted Publication by a followed identity notifies once.
{
    const follows = new FollowUseCase(new InMemoryStorageProvider(), alice);
    follows.follow(idOf(bob));
    const store = new NotificationEventStore(new InMemoryStorageProvider());
    const outcomes = [];
    const notifier = new FollowedAuthorPublicationNotifier({
        identityProvider: alice,
        isFollowing: (id) => follows.isFollowing(id),
        notificationSink: (event) => outcomes.push(store.save(event).outcome),
        now: () => new Date('2026-09-11T00:00:00Z')
    });
    const repository = new DecentralizedPublicationDiscoveryProvider();
    repository.onAdded((publication) => notifier.handlePublicationAdmitted(publication));
    repository.onAdded(() => { throw new Error('a failing listener'); });

    const castle = signedPublication(bob, { title: 'Castle' });
    repository.add(castle);
    repository.add(castle);
    repository.add(signedPublication(bob, { title: 'Moat' }));
    repository.add(signedPublication(carol, { title: 'Not followed' }));
    repository.add(new Publication({ ...castle.toJSON(), id: 'forged', title: 'Forged' }));

    assert(repository.list().length === 5, 'a failing listener never stops an admission');
    assert(JSON.stringify(outcomes) === JSON.stringify([NotificationPersistenceOutcome.NEW, NotificationPersistenceOutcome.EXISTING, NotificationPersistenceOutcome.NEW]),
        `one notification per Publication; others and forgeries notify nobody, got ${outcomes.join(', ')}`);
    const events = store.loadAll();
    assert(events.length === 2 && events.every((e) => e.eventType === FOLLOWED_AUTHOR_PUBLISHED_EVENT_TYPE && e.recipientIdentityId === idOf(alice)),
        'notifications are addressed to the follower');
    assert(events[0].payload.title === 'Castle' && events[0].payload.publicationId === castle.id && events[0].payload.author === 'bob',
        'the notification names the Publication, so the panel can open it');

    const bobsNotifier = new FollowedAuthorPublicationNotifier({ identityProvider: bob, isFollowing: () => true, notificationSink: () => { throw new Error('no'); } });
    assert(bobsNotifier.handlePublicationAdmitted(castle) === null, 'your own work never notifies you');
    console.log('✓ FollowedAuthorPublicationNotifier: once per Publication, verified followed authors only');
}

// When a tag is full, a followed identity's signed records are kept first.
{
    const followed = new Set([idOf(bob)]);
    const retention = createFollowedAnnouncementRetention({ isFollowing: (id) => followed.has(id), verifier: new LocalAuthorizationVerifier() });

    const placement = signedPlacement(bob, 'pub-bob').toJSON();
    assert(retention(AnnouncementKind.SNAPSHOT, { placementRecord: placement }) === true, "a followed publisher's signed placement is kept first");
    assert(retention(AnnouncementKind.SNAPSHOT, { placementRecord: { ...placement, position: { x: 99, y: 0, z: 20 } } }) === false,
        'a tampered copy of that placement is not');
    assert(retention(AnnouncementKind.SNAPSHOT, { placementRecord: signedPlacement(carol, 'pub-carol').toJSON() }) === false,
        "someone else's placement is not");
    assert(retention(AnnouncementKind.SNAPSHOT, { contentHash: 'h', locator: 'l', storage: 's' }) === false, 'a Snapshot without a placement is not');

    const claim = signedClaim(bob, 'Bobtown');
    assert(retention(AnnouncementKind.PLACE_NAMING, { claim }) === true, "a followed author's signed place name is kept first");
    assert(retention(AnnouncementKind.PLACE_NAMING, { claim: { ...claim, name: 'Forgedtown' } }) === false, 'a forged claim in their name is not');
    assert(retention(AnnouncementKind.PUBLICATION, { uri: 'nostr:x', storage: null }) === false, 'a Publication lead names no author');
    followed.clear();
    assert(retention(AnnouncementKind.PLACE_NAMING, { claim }) === false, 'after unfollowing, nothing is kept first');

    let clock = 0;
    const kinds = { test: { normalize: (result) => ({ key: result.key, payload: result }) } };
    const index = new AnnouncementIndex({
        storage: new InMemoryStorageProvider(),
        kinds,
        now: () => ++clock,
        maxRecordsPerTag: 3,
        isKeptFirst: (kind, payload) => payload.keep === true
    });
    index.record('test', 'tag', [{ key: 'kept', keep: true }], 'nostr');
    index.record('test', 'tag', [{ key: 'a' }, { key: 'b' }], 'nostr');
    index.record('test', 'tag', [{ key: 'c' }, { key: 'd' }], 'nostr');
    const keys = index.list('test', 'tag').map((r) => r.key);
    assert(keys.length === 3 && keys.includes('kept') && keys.includes('c') && keys.includes('d'),
        `the kept record outlives newer ones; the rest go least recently seen first, got ${keys.join(', ')}`);
    assert(keys[keys.length - 1] === 'kept', 'list() order is still most recently seen first');
    console.log('✓ Announcement Index: a followed identity\'s verified records are the last to be evicted');
}

// Peers page: a Following tag and filter on the people already listed.
{
    const people = buildPeople({
        relationships: [{ identityId: 'did:key:zBob', alias: 'Bob' }, { identityId: 'did:key:zCarol', alias: 'Carol' }],
        followedIds: new Set(['did:key:zBob', 'did:key:zNeverMet'])
    });
    assert(people.find((p) => p.identityId === 'did:key:zBob').isFollowing, 'a followed person is tagged');
    assert(!people.some((p) => p.identityId === 'did:key:zNeverMet'), 'following alone does not add a Peers card');
    assert(filterPeople(people, 'following').map((p) => p.identityId).join() === 'did:key:zBob', 'the Following filter');
    console.log('✓ Peers page: Following tag and filter');
}

// The Follow button toggles the signed-in identity's follow and hides where
// following isn't possible.
{
    const followUseCase = new FollowUseCase(new InMemoryStorageProvider(), alice);
    const button = mountComponent(FollowButton, { followUseCase }, { identityId: idOf(bob), name: 'Bob' });
    assert(button.available.value && !button.following.value, 'shown, not yet following');
    button.toggle();
    assert(button.following.value && followUseCase.getFollow(idOf(bob)).name === 'Bob', 'Follow follows, with the name on screen');
    button.toggle();
    assert(!button.following.value && !followUseCase.isFollowing(idOf(bob)), 'pressing again unfollows');

    const self = mountComponent(FollowButton, { followUseCase }, { identityId: idOf(alice) });
    assert(!self.available.value, 'hidden for yourself');
    const typedName = mountComponent(FollowButton, { followUseCase }, { identityId: 'alice' });
    assert(!typedName.available.value, 'hidden for a name that is not an identity');
    const unwired = mountComponent(FollowButton, {}, { identityId: idOf(bob) });
    assert(!unwired.available.value, 'hidden when following is not wired');
    console.log('✓ FollowButton: toggles, hidden for yourself and non-identities');
}
