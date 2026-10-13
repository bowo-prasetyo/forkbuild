// @environment browser
import { createApp, nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import UserWidget from '../ui/components/UserWidget.js';
import { t } from '../ui/i18n/i18n.js';
import { assert } from './support/Assert.js';

// The header's name (docs/reviews/CreativeDirection-2026-10-12c.md; the
// Words table in docs/Pillars.md), rendered by real Vue with the shipped CSS:
// with no name it offers Choose a name, the short name-only dialog; with one
// it shows the name, and its menu holds My Avatar, My Identities, Your Data
// and Switch name, which picks another name, makes one, or goes on with none.
// Never Login or Logout.

await new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/main.css';
    link.onload = resolve;
    link.onerror = () => reject(new Error('css/main.css failed to load'));
    document.head.appendChild(link);
});

// An IdentityUseCase as far as the header and its dialog go.
function fakeIdentities({ identities = [], current = null, locked = false } = {}) {
    const state = { identities: identities.slice(), user: current, locked, ended: 0, userListeners: new Set() };
    const announce = () => { for (const listener of state.userListeners) listener(state.user); };
    return {
        state,
        currentUser: () => state.user,
        currentSession: () => ({ isAuthenticated: Boolean(state.user), identityId: state.user ? state.user.identityId : null }),
        isUnlocked: () => !state.locked,
        checkVaultTimeouts() {},
        onUserChanged(callback) { state.userListeners.add(callback); return () => state.userListeners.delete(callback); },
        onVaultLockChanged() { return () => {}; },
        listIdentities: () => state.identities.slice(),
        async createIdentity(label) {
            const identity = { identityId: `did:key:z6Mk${label}`, label, isProtected: false, createdAt: Date.now() };
            state.identities.push(identity);
            return identity;
        },
        async authenticate(identityId) {
            const identity = state.identities.find((candidate) => candidate.identityId === identityId);
            state.user = { identityId, username: identityId, displayName: identity.label };
            announce();
        },
        endSession() { state.ended += 1; state.user = null; announce(); }
    };
}

function mount(identityUseCase) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:rest(.*)', component: { template: '<div></div>' } }] });
    const app = createApp({ components: { UserWidget }, template: '<UserWidget />' });
    app.use(router);
    app.provide('identityUseCase', identityUseCase);
    app.mount(host);
    return { host, unmount: () => { app.unmount(); host.remove(); } };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const noAccountWords = (host) => !/\blog ?(in|out)\b|\blogin\b|\blogout\b/i.test(host.textContent);

// No name: Choose a name opens the name-only dialog, and the name is used.
{
    const identities = fakeIdentities();
    const { host, unmount } = mount(identities);
    await nextTick();
    const choose = host.querySelector('.user-choose-name');
    assert(choose && choose.textContent.trim() === t('userWidget.chooseName'), 'with no name, the header offers Choose a name');
    assert(noAccountWords(host), 'and never says Login');
    choose.click();
    await nextTick();
    assert(host.querySelector('.login-modal-quick h3').textContent === t('loginModal.quick.nameTitle'), 'which asks only for a name');
    assert(!host.querySelector('input[type=password]'), 'with no passphrase field in the way');
    const name = host.querySelector('.login-modal-quick-name');
    name.value = 'Ana';
    name.dispatchEvent(new Event('input'));
    await nextTick();
    assert(host.querySelector('.login-modal-quick-go').textContent.trim() === t('loginModal.quick.nameAs', { name: 'Ana' }), 'and says who you go on as');
    host.querySelector('.login-modal-quick-go').click();
    await settle();
    assert(host.querySelector('.user-chip .user-name').textContent.trim() === 'Ana', 'then the header shows the name');
    assert(host.querySelector('.user-chip-initial').textContent.trim() === 'A', 'with its first letter');
    assert(!host.querySelector('.modal-overlay'), 'and the dialog is gone');
    unmount();
    console.log('✓ with no name, Choose a name asks for one and the header shows it');
}

// A name: its menu holds what is the player's, and Switch name.
{
    const ana = { identityId: 'did:key:z6MkAna', label: 'Ana', isProtected: false, createdAt: 1 };
    const bo = { identityId: 'did:key:z6MkBo', label: 'Bo', isProtected: false, createdAt: 2 };
    const identities = fakeIdentities({ identities: [ana, bo], current: { identityId: ana.identityId, username: ana.identityId, displayName: 'Ana' } });
    const { host, unmount } = mount(identities);
    await nextTick();
    assert(noAccountWords(host), 'a named header never says Logout');
    const panel = host.querySelector('.user-menu-panel');
    assert(getComputedStyle(panel).display === 'none', 'the menu starts closed');
    host.querySelector('.user-chip').click();
    await nextTick();
    assert(getComputedStyle(panel).display !== 'none', 'the name opens it');
    const items = Array.from(panel.querySelectorAll('.user-menu-item')).map((item) => item.textContent.trim());
    assert(JSON.stringify(items) === JSON.stringify([t('app.nav.myAvatar'), t('app.nav.myIdentities'), t('app.nav.yourData'), t('userWidget.switchName')]),
        `My Avatar, My Identities, Your Data and Switch name (${items})`);
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    assert(getComputedStyle(panel).display === 'none', 'a click elsewhere closes it');

    // Switch name: another name this device holds.
    host.querySelector('.user-chip').click();
    await nextTick();
    host.querySelector('.user-menu-switch').click();
    await nextTick();
    assert(host.querySelector('.modal-content h3').textContent === t('loginModal.switchTitle'), 'Switch name opens its dialog');
    assert(noAccountWords(host.querySelector('.modal-content')), 'which never says log in');
    assert(host.querySelector('.modal-content').textContent.includes(t('loginModal.makeNewName')), 'and offers to make a new name');
    const boButton = Array.from(host.querySelectorAll('.identity-list-item')).find((item) => item.textContent.includes('Bo'));
    boButton.click();
    await settle();
    assert(host.querySelector('.user-chip .user-name').textContent.trim() === 'Bo', 'and picking another name switches to it');

    // Switch name: or go on with none.
    host.querySelector('.user-chip').click();
    await nextTick();
    host.querySelector('.user-menu-switch').click();
    await nextTick();
    host.querySelector('.login-modal-no-name').click();
    await settle();
    assert(identities.state.ended === 1 && host.querySelector('.user-choose-name'), 'Go on without a name ends it, and the header offers Choose a name again');
    unmount();
    console.log('✓ a name\'s menu holds My Avatar, My Identities, Your Data and Switch name, which switches or goes on with none');
}

// A locked name: the menu offers Unlock first.
{
    const ana = { identityId: 'did:key:z6MkAna', label: 'Ana', isProtected: true, createdAt: 1 };
    const identities = fakeIdentities({ identities: [ana], current: { identityId: ana.identityId, username: ana.identityId, displayName: 'Ana' }, locked: true });
    const { host, unmount } = mount(identities);
    await nextTick();
    assert(host.querySelector('.user-chip--locked .user-chip-initial').textContent.trim() === '🔒', 'a locked name shows a lock');
    host.querySelector('.user-chip').click();
    await nextTick();
    const first = host.querySelector('.user-menu-panel .user-menu-item');
    assert(first.classList.contains('user-menu-unlock') && first.textContent.trim() === t('userWidget.unlock'), 'and Unlock comes first in its menu');
    first.click();
    await nextTick();
    assert(host.querySelector('.identity-unlock-form'), 'which asks for that name\'s passphrase');
    unmount();
    console.log('✓ a locked name is unlocked from its menu');
}
