// @environment browser
import { createApp, nextTick, reactive } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import LoginModal from '../ui/components/LoginModal.js';
import ProtectIdentityNote from '../ui/components/ProtectIdentityNote.js';
import { t } from '../ui/i18n/i18n.js';
import { assert } from './support/Assert.js';

// Publishing without a passphrase first, rendered by real Vue with the
// shipped CSS at phone width: the login dialog's quick start (a name, then
// "Publish as …") when Publish or a walk link opens it on a device with no
// identity, the full form behind "Protect it with a passphrase now" and
// whenever an identity exists, and the Editor's reminder that a key has no
// passphrase yet.

await new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/main.css';
    link.onload = resolve;
    link.onerror = () => reject(new Error('css/main.css failed to load'));
    document.head.appendChild(link);
});

// Records what the dialog asks for; identities are plain records.
function fakeIdentities(existing = []) {
    const state = { identities: existing.slice(), created: [], authenticated: [], session: { isAuthenticated: false, identityId: null }, listeners: new Set() };
    return {
        state,
        listIdentities: () => state.identities.slice(),
        async createIdentity(label, passphrase) {
            const identity = { identityId: `did:key:z6Mk${label}${state.identities.length}`, label, isProtected: Boolean(passphrase), createdAt: Date.now() };
            state.identities.push(identity);
            state.created.push({ label, passphrase });
            return identity;
        },
        async authenticate(identityId, passphrase) {
            state.authenticated.push({ identityId, passphrase });
            state.session = { isAuthenticated: true, identityId };
            for (const listener of state.listeners) listener({ displayName: identityId });
        },
        currentSession: () => state.session,
        onUserChanged(callback) { state.listeners.add(callback); return () => state.listeners.delete(callback); }
    };
}

function mount(component, { identityUseCase, props = {} }) {
    const host = document.createElement('div');
    host.style.cssText = 'width: 360px;';
    document.body.appendChild(host);
    const events = [];
    const bound = reactive({ ...props });
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:rest(.*)', component: { template: '<div></div>' } }] });
    const app = createApp({
        components: { Subject: component },
        setup: () => ({ bound, record: (name) => events.push(name) }),
        template: `<Subject v-bind="bound" @close="record('close')" @signed-in="record('signed-in')" @skip="record('skip')" />`
    });
    app.use(router);
    app.provide('identityUseCase', identityUseCase);
    app.mount(host);
    return { host, events, unmount: () => { app.unmount(); host.remove(); } };
}

async function type(input, text) {
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await nextTick();
}

// Publish on a new device: a name, then Publish as that name, and no passphrase.
{
    const identities = fakeIdentities();
    const { host, events, unmount } = mount(LoginModal, { identityUseCase: identities, props: { purpose: 'publish' } });
    await nextTick();
    assert(host.querySelector('h3').textContent === t('loginModal.quick.publishTitle'), 'the dialog asks only for a name to publish under');
    assert(host.textContent.includes(t('loginModal.quick.publishLead')), 'and says what the name is for');
    assert(host.textContent.includes(t('loginModal.quick.keyNote')), 'and that a passphrase can be added now or later');
    assert(!host.querySelector('input[type=password]'), 'no passphrase is asked for');
    const go = host.querySelector('.login-modal-quick-go');
    assert(go.disabled && go.textContent.trim() === t('loginModal.quick.continue'), 'without a name there is nothing to publish under');
    await type(host.querySelector('.login-modal-quick-name'), '  Sam  ');
    assert(!go.disabled && go.textContent.trim() === t('loginModal.quick.publishAs', { name: 'Sam' }), 'the button names who publishes');
    assert(host.querySelector('.login-modal-skip'), 'publishing unsigned is still offered');
    assert(host.querySelector('.modal-content').getBoundingClientRect().right <= window.innerWidth + 0.5, 'the dialog fits a phone');
    go.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert(identities.state.created.length === 1 && identities.state.created[0].label === 'Sam' && identities.state.created[0].passphrase === null,
        'an identity named Sam is created without a passphrase');
    assert(identities.state.authenticated[0].identityId === identities.state.identities[0].identityId, 'and logged in');
    assert(events.join() === 'close,signed-in', 'and publishing goes on');
    unmount();
    console.log('✓ a first publish asks only for a name, and publishes under it');
}

// Protect it now: the full form, with the name already typed.
{
    const identities = fakeIdentities();
    const { host, unmount } = mount(LoginModal, { identityUseCase: identities, props: { purpose: 'publish' } });
    await nextTick();
    await type(host.querySelector('.login-modal-quick-name'), 'Kim');
    host.querySelector('.login-modal-quick-protect').click();
    await nextTick();
    assert(host.querySelector('h3').textContent === t('loginModal.signInToPublish'), 'Protect it with a passphrase now opens the full form');
    const passwords = host.querySelectorAll('input[type=password]');
    assert(passwords.length >= 1, 'which asks for a passphrase');
    assert(Array.from(host.querySelectorAll('input.modal-input')).some((input) => input.value === 'Kim'), 'and keeps the name already typed');
    unmount();
    console.log('✓ the passphrase form is one click away');
}

// The full form whenever an identity exists, or for a plain log in.
{
    const existing = fakeIdentities([{ identityId: 'did:key:z6MkAna', label: 'Ana', isProtected: true, createdAt: 1 }]);
    const withIdentity = mount(LoginModal, { identityUseCase: existing, props: { purpose: 'publish' } });
    await nextTick();
    assert(!withIdentity.host.querySelector('.login-modal-quick') && withIdentity.host.textContent.includes('Ana'),
        'a device that holds an identity shows it to log in with, not a quick start');
    withIdentity.unmount();
    const plain = mount(LoginModal, { identityUseCase: fakeIdentities(), props: {} });
    await nextTick();
    assert(!plain.host.querySelector('.login-modal-quick'), 'Login from the header keeps the full form');
    plain.unmount();
    console.log('✓ the quick start is only for a first publish or walk');
}

// The reminder: shown for an identity without a passphrase, never for a protected one.
{
    const unprotected = fakeIdentities([{ identityId: 'did:key:z6MkSam', label: 'Sam', isProtected: false, createdAt: 1 }]);
    unprotected.state.session = { isAuthenticated: true, identityId: 'did:key:z6MkSam' };
    const shown = mount(ProtectIdentityNote, { identityUseCase: unprotected });
    await nextTick();
    assert(shown.host.textContent.includes(t('protectIdentityNote.text')), 'an identity without a passphrase is pointed out');
    assert(shown.host.querySelector('a').getAttribute('href').endsWith('/identity'), 'with the way to My Identities');
    shown.unmount();
    const protectedOne = fakeIdentities([{ identityId: 'did:key:z6MkAna', label: 'Ana', isProtected: true, createdAt: 1 }]);
    protectedOne.state.session = { isAuthenticated: true, identityId: 'did:key:z6MkAna' };
    const hidden = mount(ProtectIdentityNote, { identityUseCase: protectedOne });
    await nextTick();
    assert(!hidden.host.querySelector('.protect-identity-note'), 'a protected identity needs no reminder');
    hidden.unmount();
    const nobody = mount(ProtectIdentityNote, { identityUseCase: fakeIdentities() });
    await nextTick();
    assert(!nobody.host.querySelector('.protect-identity-note'), 'nor does nobody logged in');
    nobody.unmount();
    console.log('✓ the Editor reminds only an identity without a passphrase');
}

console.log('\n✅ All quick start tests passed.');
