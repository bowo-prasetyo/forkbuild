// @environment browser
import { createApp, defineComponent, h, nextTick } from 'vue';
import { useMyBuildsRoute } from '../ui/composables/useMyBuildsRoute.js';
import { assert } from './support/Assert.js';

// Where More → My Builds (ui/App.js) and the Signed Records page's "your page"
// (ui/views/DecentralizedPublicationsView.js) go: your own builder page, for the
// name signing now, following a change of name; nowhere with no name.

function fakeIdentities(identityId) {
    const listeners = new Set();
    const state = { identityId };
    return {
        state,
        provider: { getSigningIdentity: () => (state.identityId ? { id: state.identityId } : null) },
        onSessionChanged(callback) { listeners.add(callback); return () => listeners.delete(callback); },
        switchTo(next) { state.identityId = next; for (const callback of [...listeners]) callback(); },
        listeners
    };
}

function mount(identityUseCase) {
    let route = null;
    const host = document.createElement('div');
    const app = createApp(defineComponent({
        setup() {
            route = useMyBuildsRoute();
            return () => h('span', route.value || 'none');
        }
    }));
    if (identityUseCase) app.provide('identityUseCase', identityUseCase);
    app.mount(host);
    return { host, route: () => route.value, unmount: () => app.unmount() };
}

{
    const identities = fakeIdentities('did:key:z6MkAlice');
    const view = mount(identities);
    assert(view.route() === '/builder/did%3Akey%3Az6MkAlice', `your own builder page (${view.route()})`);
    identities.switchTo('did:key:z6MkBob');
    await nextTick();
    assert(view.route() === '/builder/did%3Akey%3Az6MkBob' && view.host.textContent === '/builder/did%3Akey%3Az6MkBob', 'following a change of name');
    identities.switchTo(null);
    await nextTick();
    assert(view.route() === null, 'and none once no name is in use');
    view.unmount();
    assert(identities.listeners.size === 0, 'unmounting stops listening');
    console.log('✓ My Builds opens your own builder page, for the name in use');
}

{
    const view = mount(null);
    assert(view.route() === null, 'with no identities at all, nowhere');
    view.unmount();
    console.log('✓ with no identities, no My Builds');
}

console.log('✅ All My Builds route tests passed.');
