// @environment browser — mounts the heart button and a comment list with Vue.
import { createApp, h, nextTick } from 'vue';
import BuildHeart from '../ui/components/BuildHeart.js';
import PublicationCommentarySection from '../ui/components/PublicationCommentarySection.js';
import { UserFacingError } from '../core/app/UserFacingError.js';
import NameNeededNotice from '../ui/components/NameNeededNotice.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { SigningRemedy } from '../identity/SigningReadiness.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { message } from '../core/app/Message.js';
import { t } from '../ui/i18n/i18n.js';
import { assert } from './support/Assert.js';

// One tap gives or takes back a heart; the count and who ("Loved by you and
// 2 others") come from the app's commands; the first heart explains itself
// once; names come from the app's identityNames, never a bare identity key.

await new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/main.css';
    link.onload = resolve;
    link.onerror = () => reject(new Error('css/main.css failed to load'));
    document.head.appendChild(link);
});

const NAMES = { 'did:alice': 'Alice', 'did:bob': 'Bob' };
const identityNames = { nameFor: (id, chosen) => (NAMES[id] ? { name: NAMES[id], source: 'published' } : (chosen ? { name: chosen, source: 'chosen' } : null)) };

function mount(render, provides) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ render });
    for (const [key, value] of Object.entries(provides)) app.provide(key, value);
    app.mount(host);
    return { host, unmount: () => { app.unmount(); host.remove(); } };
}

// A fake app: a heart store in memory, a change feed, and what was asked.
function fakeApp({ me = 'did:me', hearts = [], refuse = null } = {}) {
    const state = { hearts: [...hearts] };
    const listeners = new Set();
    const calls = { set: [], refresh: [] };
    return {
        calls,
        state,
        provides: {
            identityNames,
            getPublicationHeartsCommand: () => ({ hearts: state.hearts, mine: state.hearts.some((heart) => heart.authorIdentityId === me), ownIdentityId: me }),
            setPublicationHeartCommand: ({ publicationId, hearted }) => {
                calls.set.push([publicationId, hearted]);
                if (refuse) throw refuse;
                state.hearts = hearted
                    ? [{ authorIdentityId: me, authorName: 'me' }, ...state.hearts]
                    : state.hearts.filter((heart) => heart.authorIdentityId !== me);
                for (const listener of listeners) listener(publicationId);
                return {};
            },
            publicationHeartsChanges: { subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); } },
            refreshPublicationCommentaryCommand: (publicationId) => { calls.refresh.push(publicationId); return Promise.resolve(); }
        }
    };
}

try {
    localStorage.removeItem('forkbuild.heart-explained');
} catch {
}

// Nobody yet: an empty heart, no count, no line.
{
    const app = fakeApp();
    const { host, unmount } = mount(() => h(BuildHeart, { publicationId: 'pub-1' }), app.provides);
    const button = host.querySelector('.build-heart-toggle');
    assert(button.textContent.trim() === '♡' && button.getAttribute('aria-pressed') === 'false' && !host.querySelector('.build-heart-who'), 'nobody yet: ♡, no "0", no line');
    assert(app.calls.refresh.length === 0, 'and no network read unless asked for');

    // The first heart on this device explains itself, once.
    button.click();
    await nextTick();
    assert(host.querySelector('.build-heart-explain') && app.calls.set.length === 0, 'the first heart is explained before it is sent');
    host.querySelector('.build-heart-explain-go').click();
    await nextTick();
    assert(app.calls.set.join() === 'pub-1,true', 'then given');
    const on = host.querySelector('.build-heart-toggle');
    assert(on.getAttribute('aria-pressed') === 'true' && on.textContent.includes('♥') && on.textContent.includes('1'), 'shown as yours, with its count');
    assert(host.querySelector('.build-heart-who').textContent.trim() === t('heart.lovedByOne', { a: t('heart.you') }), `"Loved by you" (got ${host.querySelector('.build-heart-who').textContent.trim()})`);
    on.click();
    await nextTick();
    assert(app.calls.set[1].join() === 'pub-1,false' && host.querySelector('.build-heart-toggle').textContent.trim() === '♡', 'a second tap takes it back, with no explanation');
    unmount();
    console.log('✓ one tap gives a heart, explained the first time, and another takes it back');
}

// Who: you first, then names, then "and N others", the whole list a tap away.
{
    const app = fakeApp({ hearts: [{ authorIdentityId: 'did:alice' }, { authorIdentityId: 'did:me' }, { authorIdentityId: 'did:zed', authorName: 'zed' }, { authorIdentityId: 'did:nameless' }] });
    const { host, unmount } = mount(() => h(BuildHeart, { publicationId: 'pub-1', refresh: true }), app.provides);
    await nextTick();
    const who = host.querySelector('.build-heart-who');
    assert(who.textContent.trim() === t('heart.lovedByMany', { a: t('heart.you'), count: 3 }), `you first, then how many others (got ${who.textContent.trim()})`);
    who.click();
    await nextTick();
    const listed = [...host.querySelectorAll('.build-heart-list li')].map((li) => li.textContent.trim());
    assert(listed[0] === t('heart.you') && listed[1] === 'Alice' && listed[2] === 'zed' && listed[3].startsWith('…'), `everyone, by name, else a short id (got ${listed})`);
    assert(app.calls.refresh.join() === 'pub-1', 'asked the networks once, when asked to');
    unmount();

    const two = fakeApp({ hearts: [{ authorIdentityId: 'did:alice' }, { authorIdentityId: 'did:bob' }] });
    const pair = mount(() => h(BuildHeart, { publicationId: 'pub-2' }), two.provides);
    assert(pair.host.querySelector('.build-heart-who').textContent.trim() === t('heart.lovedByTwo', { a: 'Alice', b: 'Bob' }), 'two people, both named');
    pair.unmount();

    const compact = mount(() => h(BuildHeart, { publicationId: 'pub-2', compact: true }), two.provides);
    assert(!compact.host.querySelector('.build-heart-who') && compact.host.querySelector('.build-heart-count').textContent === '2', 'compact: the heart and its count alone');
    compact.unmount();
    console.log('✓ who loves a build: you first, then by name');
}

// Signed out: the tap says so, and nothing is sent.
{
    try {
        localStorage.setItem('forkbuild.heart-explained', '1');
    } catch {
    }
    const app = fakeApp({ refuse: new UserFacingError(message('heart.signInFirst')) });
    const { host, unmount } = mount(() => h(BuildHeart, { publicationId: 'pub-1' }), app.provides);
    host.querySelector('.build-heart-toggle').click();
    await nextTick();
    assert(host.querySelector('.build-heart-error').textContent.trim() === t('heart.signInFirst'), 'asks for a name first');
    unmount();
    console.log('✓ signed out, a heart asks for a name first');
}

// Locked: the tap says the name is locked, and its Unlock button asks the
// header to open the unlock dialog.
{
    const requested = [];
    const nameRemedy = { request: (remedy) => requested.push(remedy), pending: null };
    const refuse = new UserFacingError(message('refusal.nameLocked', { name: 'Bowo' }), { remedy: SigningRemedy.UNLOCK });
    const app = fakeApp({ refuse });
    const { host, unmount } = mount(() => h(BuildHeart, { publicationId: 'pub-1' }), { ...app.provides, nameRemedy });
    host.querySelector('.build-heart-toggle').click();
    await nextTick();
    const error = host.querySelector('.build-heart-error');
    assert(error.textContent.includes(t('refusal.nameLocked', { name: 'Bowo' })), `says the name is locked (got ${error.textContent.trim()})`);
    assert(!error.textContent.includes(t('heart.signInFirst')), 'never asks to choose a name');
    const unlock = error.querySelector('.signing-remedy-button');
    assert(unlock && unlock.textContent.trim() === t('userWidget.unlock'), 'offers Unlock');
    unlock.click();
    assert(requested.join() === SigningRemedy.UNLOCK, 'Unlock asks the header to unlock');
    unmount();
    console.log('✓ locked, a heart says so and offers Unlock');
}

// In place of a comment box: no name, a locked name, then unlocked.
{
    const passphrase = 'correct horse battery';
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const listeners = new Set();
    const identityUseCase = {
        provider,
        onUserChanged: (callback) => { listeners.add(callback); return () => listeners.delete(callback); },
        onVaultLockChanged: (callback) => { listeners.add(callback); return () => listeners.delete(callback); }
    };
    const changed = async () => { listeners.forEach((callback) => callback()); await nextTick(); };
    const requested = [];
    const nameRemedy = { request: (remedy) => requested.push(remedy), pending: null };
    const noNameText = t('publicationCommentarySection.signInToAddCommentary');
    const { host, unmount } = mount(() => h(NameNeededNotice, { noNameText }), { identityUseCase, nameRemedy });
    await nextTick();
    assert(host.textContent.includes(noNameText) && host.querySelector('.signing-remedy-button').textContent.trim() === t('userWidget.chooseName'), 'no name: choose one');

    const created = await provider.createProtectedLocalIdentity('Bowo', passphrase);
    await provider.unlock(created.identityId, passphrase);
    provider.authenticate(created.identityId);
    provider.lock(created.identityId);
    await changed();
    assert(host.textContent.includes(t('refusal.nameLocked', { name: 'Bowo' })) && !host.textContent.includes(noNameText), `locked: says so, by name (got ${host.textContent.trim()})`);
    host.querySelector('.signing-remedy-button').click();
    assert(requested.join() === SigningRemedy.UNLOCK, 'and offers Unlock');

    await provider.unlock(created.identityId, passphrase);
    await changed();
    assert(host.textContent.trim() === '' && !host.querySelector('.signing-remedy-button'), 'unlocked: nothing left to say');
    unmount();
    console.log('✓ in place of a comment box, the notice follows no name, locked and unlocked');
}

// A comment's author by name, never a raw identity key.
{
    const { host, unmount } = mount(() => h(PublicationCommentarySection, { publication: { id: 'pub-1' } }), {
        identityNames,
        getPublicationCommentariesCommand: () => [
            { commentaryId: 'c1', authorIdentityId: 'did:alice', content: 'Lovely' },
            { commentaryId: 'c2', authorIdentityId: 'did:key:z6MkUnknownPersonWithAVeryLongKey', content: 'Nice' }
        ]
    });
    await nextTick();
    const authors = [...host.querySelectorAll('.publication-commentary-author')].map((el) => el.textContent.trim());
    assert(authors[0] === 'Alice' && authors[1].startsWith('…') && !authors[1].includes('did:key'), `named, else a short id (got ${authors})`);
    assert(host.querySelectorAll('.publication-commentary-author .identity-name[title]').length === 2, 'the identity on hover');
    unmount();
    console.log('✓ comment authors are named');
}
