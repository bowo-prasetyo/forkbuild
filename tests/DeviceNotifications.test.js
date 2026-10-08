// Notifications on this device (core/DeviceNotifications.js,
// application/notification/DeviceNotificationRelay.js), and the remix
// notification (application/publication/RemixedBuildNotifier.js): the
// signed-in identity's notifications, also shown by the operating system
// while ForkBuild is open but not in view, once turned on; nothing that was
// already there pops up, a burst shows a few, and a remix of your build
// notifies you once.
import {
    DeviceNotificationPermission, DeviceNotificationState, MAX_SHOWN_AT_ONCE,
    deviceNotificationState, normalizeDeviceNotificationSettings, selectNotificationsToShow
} from '../core/DeviceNotifications.js';
import { DeviceNotificationRelay } from '../application/notification/DeviceNotificationRelay.js';
import { DeviceNotificationSettingsStore } from '../application/settings/DeviceNotificationSettingsStore.js';
import { RemixedBuildNotifier, BUILD_REMIXED_EVENT_TYPE } from '../application/publication/RemixedBuildNotifier.js';
import { NotificationEventStore, NotificationPersistenceOutcome } from '../storage/NotificationEventStore.js';
import { NotificationEvent } from '../core/NotificationEvent.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { Publication } from '../publisher/Publication.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// The setting: off unless turned on, and on only when the browser agrees.
{
    assert(normalizeDeviceNotificationSettings(null).enabled === false && normalizeDeviceNotificationSettings({ enabled: 'yes' }).enabled === false,
        'off unless turned on');
    const store = new DeviceNotificationSettingsStore({ storageProvider: new InMemoryStorageProvider() });
    assert(store.get().enabled === false, 'a new device has it off');
    assert(store.setEnabled(true).enabled === true && store.get().enabled === true, 'turned on, it stays on');
    const on = { enabled: true };
    assert(deviceNotificationState({ settings: on, permission: 'granted' }) === DeviceNotificationState.ON, 'on: asked for and allowed');
    assert(deviceNotificationState({ settings: { enabled: false }, permission: 'granted' }) === DeviceNotificationState.OFF, 'allowed but not asked for is off');
    assert(deviceNotificationState({ settings: on, permission: 'default' }) === DeviceNotificationState.OFF, 'asked for but not yet allowed is off');
    assert(deviceNotificationState({ settings: on, permission: 'denied' }) === DeviceNotificationState.BLOCKED, 'refused by the browser is blocked');
    assert(deviceNotificationState({ settings: on, permission: DeviceNotificationPermission.UNSUPPORTED }) === DeviceNotificationState.UNSUPPORTED, 'no API is unsupported');
    console.log('✓ the setting is off until turned on, and on only when the browser allows it');
}

function event(id, minutes) {
    return new NotificationEvent({ notificationId: id, eventType: 'publication.remixed', recipientIdentityId: 'alice', createdAt: new Date(Date.UTC(2026, 9, 8, 9, minutes)), payload: { publicationId: `p-${id}` } });
}

// Which to show: unseen ones, oldest first, a few at a time.
{
    const events = [event('c', 3), event('a', 1), event('b', 2), event('d', 4), event('e', 5)];
    const picked = selectNotificationsToShow({ events, seenIds: new Set(['a']) });
    assert(picked.map((e) => e.notificationId).join() === 'b,c,d', `unseen, oldest first, at most ${MAX_SHOWN_AT_ONCE} (got ${picked.map((e) => e.notificationId)})`);
    assert(selectNotificationsToShow({ events: null, seenIds: new Set() }).length === 0, 'nothing to show from nothing');
    console.log('✓ unseen notifications are picked oldest first, a few at a time');
}

// The relay: what was there at start never shows; new ones show only while
// ForkBuild is out of view and turned on; a burst shows a few; a new
// recipient starts afresh.
{
    let events = [event('old', 0)];
    let recipient = 'alice';
    let settings = { enabled: true };
    let permission = 'granted';
    let visible = false;
    const shown = [];
    const relay = new DeviceNotificationRelay({
        recipient: () => recipient,
        loadEvents: () => events,
        settings: () => settings,
        permission: () => permission,
        isVisible: () => visible,
        describe: (e) => (e.notificationId === 'unspeakable' ? null : { title: `T ${e.notificationId}`, body: '', path: '/' }),
        show: (described) => { shown.push(described.title); }
    });
    relay.start();
    assert(relay.check() === 0 && shown.length === 0, 'what was stored at start never shows');

    events = [...events, event('new', 1)];
    assert(relay.check() === 1 && shown.join() === 'T new', 'a new one shows');
    assert(relay.check() === 0, 'and only once');

    visible = true;
    events = [...events, event('seen-on-screen', 2)];
    assert(relay.check() === 0, 'nothing shows while ForkBuild is in view (the bell has it)');
    visible = false;
    assert(relay.check() === 0, 'nor later: it arrived while in view');

    settings = { enabled: false };
    events = [...events, event('while-off', 3)];
    assert(relay.check() === 0, 'nothing shows while turned off');
    settings = { enabled: true };
    permission = 'denied';
    events = [...events, event('while-blocked', 4)];
    assert(relay.check() === 0, 'nor while the browser refuses');
    permission = 'granted';

    shown.length = 0;
    events = [...events, ...['b1', 'b2', 'b3', 'b4', 'b5'].map((id, i) => event(id, 10 + i))];
    assert(relay.check() === MAX_SHOWN_AT_ONCE && relay.check() === 0, `a burst shows ${MAX_SHOWN_AT_ONCE}, and the rest stay in the bell`);

    events = [...events, event('unspeakable', 20), event('speakable', 21)];
    shown.length = 0;
    assert(relay.check() === 1 && shown.join() === 'T speakable', 'one that can\'t be put into words is skipped');

    recipient = 'bob';
    events = [event('bobs-old', 0)];
    assert(relay.check() === 0, 'signing in as someone else shows none of what they already had');
    events = [...events, event('bobs-new', 1)];
    shown.length = 0;
    assert(relay.check() === 1 && shown.join() === 'T bobs-new', 'only what arrives for them afterwards');
    console.log('✓ the relay shows new notifications only while out of view and turned on, a few at a time');
}

// A relay never throws, whatever its collaborators do.
{
    const relay = new DeviceNotificationRelay({
        recipient: () => { throw new Error('no identity'); },
        loadEvents: () => { throw new Error('signed out'); },
        settings: () => ({ enabled: true }),
        permission: () => 'granted',
        isVisible: () => { throw new Error('no document'); },
        describe: () => { throw new Error('no words'); },
        show: () => Promise.reject(new Error('blocked'))
    });
    relay.start();
    assert(relay.check() === 0, 'a failing collaborator shows nothing and throws nothing');
    let threw = false;
    try {
        new DeviceNotificationRelay({ loadEvents: () => [] });
    } catch {
        threw = true;
    }
    assert(threw, 'a relay needs every collaborator');
    console.log('✓ a relay never throws');
}

// The remix notification.
function signedIn(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    provider.login(label);
    return provider;
}

function signed(provider, { documentId, title, parentDocumentId = null, publishedAt = '2026-10-01T00:00:00Z' }) {
    const unsigned = new Publication({
        documentId, title, parentDocumentId,
        author: provider.currentUser().username,
        contentHash: `hash-${documentId}-${title}`,
        publishedAt: new Date(publishedAt),
        publisherIdentity: provider.getSigningIdentity().toJSON()
    });
    return unsigned.withSignature(provider.signCanonical(unsigned.getSigningDescriptor()));
}

{
    const alice = signedIn('remix-alice');
    const bob = signedIn('remix-bob');
    const carol = signedIn('remix-carol');
    const castle = signed(alice, { documentId: 'castle', title: 'Castle', publishedAt: '2026-09-01T00:00:00Z' });
    const castleAgain = signed(alice, { documentId: 'castle', title: 'Castle, finished', publishedAt: '2026-09-20T00:00:00Z' });
    const notAlices = signed(carol, { documentId: 'tower', title: 'Tower' });
    const known = [castle, castleAgain, notAlices];
    const store = new NotificationEventStore(new InMemoryStorageProvider());
    const outcomes = [];
    let blocked = new Set();
    const notifier = new RemixedBuildNotifier({
        identityProvider: alice,
        findPublicationsOfDocument: (documentId) => known.filter((p) => p.documentId === documentId),
        isBlocked: (id) => blocked.has(id),
        notificationSink: (e) => outcomes.push(store.save(e).outcome),
        now: () => new Date('2026-10-08T10:00:00Z')
    });

    const bobsRemix = signed(bob, { documentId: 'bobs-castle', title: 'Fort', parentDocumentId: 'castle' });
    const created = notifier.handlePublicationAdmitted(bobsRemix);
    assert(created && created.eventType === BUILD_REMIXED_EVENT_TYPE && created.recipientIdentityId === alice.getSigningIdentity().id,
        'a remix of Alice\'s build notifies Alice');
    assert(created.payload.publicationId === bobsRemix.id && created.payload.title === 'Fort' && created.payload.author === 'remix-bob'
        && created.payload.remixedTitle === 'Castle, finished', `it names the remix, its maker and Alice's build (newest title) (${JSON.stringify(created.payload)})`);
    notifier.handlePublicationAdmitted(bobsRemix);
    assert(outcomes.join() === `${NotificationPersistenceOutcome.NEW},${NotificationPersistenceOutcome.EXISTING}`, 'once per remix, however often it is found');

    assert(notifier.handlePublicationAdmitted(signed(bob, { documentId: 'bobs-tower', title: 'T2', parentDocumentId: 'tower' })) === null,
        'a remix of someone else\'s build notifies Alice of nothing');
    assert(notifier.handlePublicationAdmitted(signed(bob, { documentId: 'bobs-own', title: 'Mine' })) === null, 'nor does a build that isn\'t a remix');
    assert(notifier.handlePublicationAdmitted(signed(alice, { documentId: 'alices-fork', title: 'Mine too', parentDocumentId: 'castle' })) === null,
        'nor does Alice remixing her own build');
    const forged = new Publication({ ...signed(bob, { documentId: 'forged', title: 'Forged', parentDocumentId: 'castle' }).toJSON(), title: 'Changed' });
    assert(notifier.handlePublicationAdmitted(forged) === null, 'nor does a remix whose signature doesn\'t check out');
    blocked = new Set([bob.getSigningIdentity().id]);
    assert(notifier.handlePublicationAdmitted(signed(bob, { documentId: 'bobs-2', title: 'Fort 2', parentDocumentId: 'castle' })) === null,
        'nor does someone Alice blocked');

    const forgedOriginal = new Publication({ ...castle.toJSON(), id: 'not-alices', publisherIdentity: carol.getSigningIdentity().toJSON() });
    const strict = new RemixedBuildNotifier({
        identityProvider: alice,
        findPublicationsOfDocument: () => [forgedOriginal],
        notificationSink: () => { throw new Error('should not notify'); }
    });
    assert(strict.handlePublicationAdmitted(signed(bob, { documentId: 'r', title: 'R', parentDocumentId: 'castle' })) === null,
        'a build counts as Alice\'s only when its Publication is verifiably signed by her');
    const signedOut = new RemixedBuildNotifier({ identityProvider: new LocalIdentityProvider(new InMemoryStorageProvider()), findPublicationsOfDocument: () => known, notificationSink: () => {} });
    assert(signedOut.handlePublicationAdmitted(bobsRemix) === null, 'signed out, nobody is notified');
    console.log('✓ a remix of your build notifies you once; others, forgeries and blocked people don\'t');
}
