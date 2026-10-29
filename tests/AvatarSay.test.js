import {
    MAX_SAY_CHARACTERS, SAY_COOLDOWN_MS, SAY_LOG_LIMIT, SAY_LOG_SECONDS, canSayAgain, isValidAvatarSayAdvertisement,
    normalizeSayText, sayBubbleSecondsFor, toAvatarSayAdvertisement
} from '../core/avatar/AvatarSay.js';
import { signAvatarSayAdvertisement } from '../application/avatar/AvatarSaySigning.js';
import { AvatarSayTrustBoundary } from '../application/avatar/AvatarSayTrustBoundary.js';
import { AvatarSaySyncService } from '../application/avatar/AvatarSaySyncService.js';
import { SayRefusal } from '../application/worldNavigation/avatarSayMethods.js';
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { AvatarTemplateRegistry } from '../core/avatar/AvatarTemplateRegistry.js';
import { AvatarProfileUseCase } from '../application/avatar/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/avatar/AvatarPresenceSession.js';
import { GuestAvatarProfileUseCase } from '../application/avatar/GuestAvatar.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { TrustStatus } from '../core/identity/TrustObservation.js';
import { makeIdentity } from './support/TestIdentity.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// Saying something aloud in World View (core/avatar/AvatarSay.js): a short typed
// line in a bubble over your avatar and in a short log, for whoever may see your
// avatar, checked like a gesture when it arrives, and never stored.

const T0 = 1_800_000_000_000;

// The line itself.
{
    assert(normalizeSayText('  look   at\tthis\n tower!  ') === 'look at this tower!', 'whitespace is tidied');
    assert(normalizeSayText('hi\u0007​there') === 'hi there', 'control and invisible characters go');
    assert(normalizeSayText('   ') === '' && normalizeSayText(null) === '', 'nothing to say is nothing');
    assert(Array.from(normalizeSayText('🏠'.repeat(200))).length === MAX_SAY_CHARACTERS, `at most ${MAX_SAY_CHARACTERS} characters, never splitting an emoji`);
    assert(!canSayAgain(T0, T0 + SAY_COOLDOWN_MS - 1) && canSayAgain(T0, T0 + SAY_COOLDOWN_MS) && canSayAgain(null, T0), 'one line at most every so often');
    assert(sayBubbleSecondsFor('hi') === 4 && sayBubbleSecondsFor('word '.repeat(60)) === 10 && sayBubbleSecondsFor('one two three four five six') > 4,
        'a bubble stays longer for a longer line, within bounds');
    const ad = toAvatarSayAdvertisement({ avatarId: 'a1', ownerIdentity: 'alice', text: 'hello', sequence: 1, timestamp: T0 });
    assert(isValidAvatarSayAdvertisement(ad), 'a line is well-formed');
    assert(!isValidAvatarSayAdvertisement({ ...ad, text: 'x'.repeat(MAX_SAY_CHARACTERS + 1) }), 'one too long is not');
    assert(!isValidAvatarSayAdvertisement({ ...ad, text: 'a\nb' }) && !isValidAvatarSayAdvertisement({ ...ad, text: '' }), 'nor one with a line break, or empty');
    console.log('✓ a line is tidied, kept short, and said at most every so often');
}

// Who is believed: the checks a gesture gets.
{
    const alice = makeIdentity('alice');
    const mallory = makeIdentity('mallory');
    const aliceId = alice.getSigningIdentity().id;
    const said = (identity, { text = 'hello', sequence = 1, avatarId = 'avatar-alice' } = {}) => signAvatarSayAdvertisement(
        toAvatarSayAdvertisement({ avatarId, ownerIdentity: 'alice', text, sequence, timestamp: T0 }), identity);
    let blocked = null;
    const boundary = new AvatarSayTrustBoundary({ isBlocked: (id) => id === blocked });
    const first = said(alice);
    assert(first.signature && first.signature.signer === aliceId, 'a line is signed by its speaker');
    assert(boundary.evaluate(first).accepted, 'a signed line is shown');
    assert(boundary.evaluate(first).observation.status === TrustStatus.REPLAYED, 'the same line again is not shown twice');
    assert(boundary.evaluate({ ...said(alice, { sequence: 2 }), text: 'give me your password' }).observation.status === TrustStatus.INVALID_SIGNATURE,
        'words changed on the way are refused');
    assert(boundary.evaluate(said(mallory, { sequence: 3 })).observation.status === TrustStatus.UNAUTHORIZED,
        'someone else speaking as that avatar is refused');
    assert(boundary.evaluate(said(alice, { sequence: 1, text: 'again' })).observation.status === TrustStatus.STALE, 'an older line is refused');
    assert(boundary.evaluate(said(alice, { sequence: 4, text: 'and now' })).accepted, 'a newer one is shown');
    blocked = aliceId;
    assert(boundary.evaluate(said(alice, { sequence: 5 })).observation.status === TrustStatus.BLOCKED, 'someone blocked here is never heard');
    assert(boundary.evaluate({ avatarId: 'x', text: 'hi' }).observation.status === TrustStatus.UNAVAILABLE, 'and anything malformed is dropped');

    const listeners = new Set();
    const channel = { advertise() {}, onAdvertisement: (callback) => { listeners.add(callback); return () => listeners.delete(callback); } };
    const service = new AvatarSaySyncService(channel, { localAvatarId: 'avatar-me' });
    for (const callback of listeners) {
        callback(said(alice, { avatarId: 'avatar-bob', sequence: 9, text: 'over here' }));
        callback(said(alice, { avatarId: 'avatar-me', sequence: 10 }));
    }
    const pulled = service.pull();
    assert(pulled.length === 1 && pulled[0].text === 'over here' && service.pull().length === 0, 'each line is handed over once, never your own echo, never kept');
    service.dispose();
    assert(listeners.size === 0, 'and disposing stops listening');
    console.log('✓ a line is shown only signed by the avatar\'s owner, once, in order, and never from someone blocked');
}

// In World View's session: saying, being heard (or not), and hearing others.
{
    const registry = new AvatarTemplateRegistry();
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const me = makeIdentity('me');
    const avatarProfileUseCase = new AvatarProfileUseCase(new InMemoryStorageProvider(), me, registry);
    const avatarPresenceSession = new AvatarPresenceSession(avatarProfileUseCase.getProfile());
    const published = [];
    const listeners = new Set();
    const channel = {
        advertise: (ad) => published.push(ad),
        onAdvertisement: (callback) => { listeners.add(callback); return () => listeners.delete(callback); }
    };
    let visible = true;
    const session = new WorldNavigationSession({
        registry: brickRegistry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
        avatarProfileUseCase, avatarPresenceSession, identityProvider: me,
        avatarSayBroadcastProvider: channel,
        presenceVisibilityUseCase: { getPolicy: () => ({ shouldAdvertise: () => visible }) }
    });
    const bubbles = [];
    session._session = { showAvatarSpeech: (avatarId, text, seconds) => bubbles.push({ avatarId, text, seconds }) };
    session._setupAvatarSay(avatarPresenceSession.current.avatarId, () => false);
    let changes = 0;
    session.onSayLogChanged(() => { changes += 1; });

    assert(session.sayAloud('   ', T0).refusal === SayRefusal.EMPTY && published.length === 0, 'nothing to say says nothing');
    const out = session.sayAloud('look at this tower!', T0);
    assert(out.said && out.heard && published.length === 1, 'a line is said and sent');
    assert(published[0].text === 'look at this tower!' && published[0].signature?.signer === me.getSigningIdentity().id, 'signed, as you');
    assert(bubbles[0].avatarId === null && bubbles[0].text === 'look at this tower!', 'it shows over your own avatar');
    const log = session.sayLog(T0);
    assert(log.length === 1 && log[0].own && log[0].heard && log[0].text === 'look at this tower!' && changes === 1, 'and in the log, as yours');
    assert(session.sayAloud('again', T0 + 10).refusal === SayRefusal.TOO_SOON, 'not again straight away');

    visible = false;
    const hidden = session.sayAloud('anyone?', T0 + SAY_COOLDOWN_MS * 2);
    assert(hidden.said && !hidden.heard && published.length === 1, 'with your avatar hidden, it shows only to you and is sent to nobody');
    assert(session.sayLog(T0 + SAY_COOLDOWN_MS * 2).at(-1).heard === false, 'which the log says');
    visible = true;

    // Bob, present here, says something.
    const bob = makeIdentity('bob');
    session._remoteAvatarRegistry = { has: (avatarId) => avatarId === 'avatar-bob' };
    session.getAvatarDisplayName = (avatarId) => (avatarId === 'avatar-bob' ? 'Bob' : avatarId);
    const bobSays = (text, sequence, avatarId = 'avatar-bob') => signAvatarSayAdvertisement(
        toAvatarSayAdvertisement({ avatarId, ownerIdentity: 'bob', text, sequence, timestamp: T0 }), bob);
    for (const callback of listeners) {
        callback(bobSays('nice tower', T0 + 1));
        callback(bobSays('from someone not here', T0 + 2, 'avatar-gone'));
    }
    session._pullAvatarSay(T0 + 3000);
    assert(bubbles.at(-1).avatarId === 'avatar-bob' && bubbles.at(-1).text === 'nice tower', 'Bob\'s line shows over Bob');
    const heard = session.sayLog(T0 + 3000).at(-1);
    assert(!heard.own && heard.name === 'Bob' && heard.text === 'nice tower', 'and in the log, by name');
    assert(!bubbles.some((b) => b.avatarId === 'avatar-gone'), 'a line from an avatar not present here is let go');

    for (let i = 0; i < SAY_LOG_LIMIT + 3; i += 1) session.sayAloud(`line ${i}`, T0 + 10_000 + i * SAY_COOLDOWN_MS);
    assert(session.sayLog(T0 + 20_000).length === SAY_LOG_LIMIT, `the log keeps the last ${SAY_LOG_LIMIT}`);
    assert(session.sayLog(T0 + 20_000 + SAY_LOG_SECONDS * 1000).length === 0, 'and each for a minute');
    console.log('✓ in World View, a line shows over your avatar and in the log, reaches others unless your avatar is hidden, and theirs show over them');
}

// A guest, with no name, can't be seen, so says nothing.
{
    const registry = new AvatarTemplateRegistry();
    const guestProfile = new GuestAvatarProfileUseCase(registry);
    const session = new WorldNavigationSession({
        registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
        avatarProfileUseCase: guestProfile, avatarPresenceSession: new AvatarPresenceSession(guestProfile.getProfile())
    });
    assert(session.sayAloud('hello?', T0).refusal === SayRefusal.GUEST, 'a guest is asked for a name first');
    console.log('✓ a guest says nothing until they choose a name');
}

console.log('✅ All avatar say tests passed.');
