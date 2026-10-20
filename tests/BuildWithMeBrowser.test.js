// @environment browser
import { createApp, nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import WalkTogetherJoinView from '../ui/views/WalkTogetherJoinView.js';
import WalkTogetherDialog from '../ui/components/walkTogether/WalkTogetherDialog.js';
import BuildTogetherStrip from '../ui/components/walkTogether/BuildTogetherStrip.js';
import { useBuildTogether } from '../ui/views/editorView/useBuildTogether.js';
import { WalkTogetherGuestStatus, WalkTogetherStatus } from '../application/walkTogether/WalkTogether.js';
import { BuildTogetherOutcome, BuildTogetherRole, coBuilderColor } from '../application/buildTogether/BuildTogetherSession.js';
import { EventBus } from '../core/events/EventBus.js';
import { DocumentMetadata } from '../core/document/DocumentMetadata.js';
import { t } from '../ui/i18n/i18n.js';
import { assert } from './support/Assert.js';

// "Build with me", rendered by real Vue with the shipped CSS, at phone width:
// the page a build link opens, and the Editor's side of it
// (ui/views/editorView/useBuildTogether.js) with its dialog and the strip of
// who is building. The link and the session are stand-ins here;
// tests/WalkTogether.test.js and tests/BuildWithMe.test.js run the real ones.

await new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/main.css';
    link.onload = resolve;
    link.onerror = () => reject(new Error('css/main.css failed to load'));
    document.head.appendChild(link);
});

async function until(condition, what, timeoutMs = 5000) {
    const start = Date.now();
    while (!condition()) {
        if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${what}`);
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
}

const CODE = 'A' + 'c'.repeat(43);
const ME = 'did:key:z6MkHost';

class FakeSide {
    constructor(options) {
        this.options = options;
        this.state = Object.freeze({ status: WalkTogetherStatus.STARTING, guests: [] });
        this.listeners = new Set();
        this.closed = false;
    }
    onChange(callback) { this.listeners.add(callback); return () => this.listeners.delete(callback); }
    set(state) { this.state = Object.freeze(state); for (const listener of Array.from(this.listeners)) listener(this.state); }
    async start() { this.started = true; }
    close() { this.closed = true; }
}

const user = { displayName: 'Sam' };
const sides = [];
const walkTogether = {
    available: true,
    canWalk: () => true,
    createBuildGuest(code, options) { const side = new FakeSide({ code, ...options }); sides.push(side); return side; },
    createBuildHost(options) { const side = new FakeSide(options); sides.push(side); return side; }
};
const identityUseCase = { currentUser: () => user, onUserChanged: () => () => {}, listIdentities: () => [] };
const counted = [];
const funnel = { joinedBuild: () => counted.push('build-joined'), madeBuildLink: () => counted.push('build-link') };

// The page a build link opens: titled for building, joins as a build guest,
// then opens the Editor, which asks the host for the build.
{
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/build/:code', component: WalkTogetherJoinView, meta: { building: true } },
            { path: '/editor', component: { template: '<div class="editor-stand-in"></div>' } }
        ]
    });
    const host = document.createElement('div');
    host.style.cssText = 'width: 360px;';
    document.body.appendChild(host);
    const app = createApp({ template: '<router-view />' });
    app.use(router);
    app.provide('walkTogether', walkTogether);
    app.provide('identityUseCase', identityUseCase);
    app.provide('funnelEventCounter', funnel);
    app.mount(host);

    await router.push(`/build/${CODE}`);
    await nextTick();
    assert(host.querySelector('h1').textContent === t('buildTogether.join.title'), 'the page is titled for building together');
    assert(host.textContent.includes(t('buildTogether.join.lead')) && host.textContent.includes(t('buildTogether.join.as', { name: 'Sam' })),
        'it says what the invitation is, and who you build as');
    assert(host.textContent.includes(t('walkTogether.join.privacy')), 'and what joining shares');
    assert(host.textContent.includes(t('buildTogether.join.credit')), 'and that a published build credits whoever built in it');
    assert(document.documentElement.scrollWidth <= window.innerWidth, 'nothing overflows the page sideways');
    host.querySelector('.walk-together-join').click();
    await until(() => sides.length === 1 && sides[0].started, 'Join starts');
    assert(sides[0].options.code === CODE && sides[0].options.guestName === 'Sam', 'as a build guest, with the code and the guest\'s name');
    sides[0].set({ status: WalkTogetherStatus.JOINED, hostName: 'Ana', documentId: 'doc-1', title: 'The Mill', hostIdentityId: ME });
    await until(() => router.currentRoute.value.path === '/editor', 'joining opens the Editor');
    const query = router.currentRoute.value.query;
    assert(query.together === 'doc-1' && query.host === ME && query.hostName === 'Ana' && query.title === 'The Mill', `naming the build and its host (${JSON.stringify(query)})`);
    assert(counted.join() === 'build-joined', 'joining is counted');
    console.log('✓ a build link joins as a build guest and opens the Editor on the friend\'s build');
    app.unmount();
    host.remove();
}

// A stand-in BuildTogetherSession: what useBuildTogether reads and calls.
class FakeSession {
    constructor() { this.listeners = new Set(); this.role = null; this.allowed = []; this.people = []; this.sharing = false; this._joined = null; this.presence = []; }
    onChange(callback) { this.listeners.add(callback); return () => this.listeners.delete(callback); }
    changed() { for (const listener of Array.from(this.listeners)) listener(); }
    isSharing() { return this.sharing; }
    coBuilders() { return this.people; }
    host(documentId) { this.role = BuildTogetherRole.HOST; this.hostedDocumentId = documentId; this.changed(); return true; }
    allow(identityId, name) {
        this.allowed.push(identityId);
        this.people = [...this.people, { identityId, name, online: true, pointer: null, selection: [], color: coBuilderColor(identityId) }];
        this.sharing = true;
        this.changed();
    }
    stopHosting() { this.role = null; this.people = []; this.sharing = false; this.stopped = true; this.changed(); }
    get joined() { return this._joined; }
    async join({ documentId, hostIdentityId, hostName }) {
        this.joinedWith = { documentId, hostIdentityId, hostName };
        this.role = BuildTogetherRole.GUEST;
        this._joined = { documentId, hostIdentityId, hostName, opened: true, ended: false };
        this.sharing = true;
        this.people = [{ identityId: hostIdentityId, name: hostName, online: true, pointer: null, selection: [], color: coBuilderColor(hostIdentityId) }];
        this.changed();
        return BuildTogetherOutcome.OPENED;
    }
    end() { this._joined = { ...this._joined, ended: true }; this.sharing = false; this.people = this.people.map((person) => ({ ...person, online: false })); this.changed(); }
    leave() { this.role = null; this._joined = null; this.sharing = false; this.people = []; this.changed(); }
    sharePresence(presence) { this.presence.push(presence); }
    dispose() { this.disposed = true; }
}

function editorStandIn(authorIdentityId) {
    const document = { world: { id: 'doc-1' }, metadata: new DocumentMetadata({ title: 'The Mill', authorIdentityId }) };
    const stateListeners = new Set();
    return {
        documentManager: {
            document,
            onStateChanged(callback) { stateListeners.add(callback); return () => stateListeners.delete(callback); },
            dirty: false,
            markDirty() { this.dirty = true; },
            open(next) { this.document = next; for (const listener of stateListeners) listener({}); }
        },
        editorSession: {
            shared: false, shown: [], framed: 0,
            setSharedEditing(shared) { this.shared = shared; },
            showCoBuilders(people) { this.shown.push(people); },
            pointAt: (x, y) => ({ x, y: 0, z: y }),
            selectedBrickIds: () => ['brick-1'],
            frameDocument() { this.framed++; }
        },
        editorContext: { eventBus: new EventBus() }
    };
}

function mountEditor(authorIdentityId, session) {
    const stand = editorStandIn(authorIdentityId);
    const messages = [];
    let api = null;
    const host = document.createElement('div');
    host.style.cssText = 'width: 360px; height: 480px; position: relative;';
    document.body.appendChild(host);
    const app = createApp({
        components: { WalkTogetherDialog, BuildTogetherStrip },
        setup() {
            api = useBuildTogether({
                session, ...stand,
                identityProvider: { getSigningIdentity: () => ({ id: ME }), currentUser: () => ({ username: 'ana' }) },
                feedback: { show: (text) => messages.push(text) }
            });
            return api;
        },
        template: `
            <div>
                <BuildTogetherStrip v-if="buildRole" :role="buildRole" :title="buildStripTitle" :people="coBuilders" :sharing="buildSharing" @link="openBuildDialog" @stop="stopBuild" @leave="leaveBuild" />
                <WalkTogetherDialog v-if="showBuildDialog" kind="build" :state="buildState" :link="buildLink" :available="buildAvailable" :needs-publish="buildNeedsOwner" @stop="stopBuild" @close="closeBuildDialog" />
            </div>`
    });
    app.provide('walkTogether', walkTogether);
    app.provide('identityUseCase', identityUseCase);
    app.provide('funnelEventCounter', funnel);
    app.provide('appUrl', () => 'https://example.org/forkbuild/#/editor');
    app.mount(host);
    return { app, host, api: () => api, messages, stand };
}

// The host: the dialog makes a link for their own build; a friend joining is
// allowed, named, and shown in the strip, Undo pauses, and Stop ends it.
{
    sides.length = 0;
    counted.length = 0;
    const session = new FakeSession();
    const { app, host, api, messages, stand } = mountEditor(ME, session);
    api().openBuildDialog();
    await until(() => sides.length === 1, 'the dialog makes a link');
    const link = sides[0];
    assert(link.options.build.documentId === 'doc-1' && link.options.build.title === 'The Mill' && link.options.hostName === 'Sam', 'for the open build, under the host\'s name');
    assert(session.role === BuildTogetherRole.HOST && session.hostedDocumentId === 'doc-1', 'which the session hosts');
    link.set({ status: WalkTogetherStatus.WAITING, code: CODE, expiresAt: new Date(Date.now() + 1800000), guests: [] });
    await nextTick();
    const dialog = host.querySelector('.walk-together-dialog');
    assert(dialog.querySelector('h3').textContent === t('buildTogether.title') && dialog.textContent.includes(t('buildTogether.lead')), 'the dialog speaks of building together');
    assert(host.querySelector('.walk-together-link').value === `https://example.org/forkbuild/#/build/${CODE}`, 'with a build link');
    assert(dialog.getBoundingClientRect().right <= window.innerWidth + 0.5, 'and fits a phone');
    assert(host.querySelector('.build-together-strip-title').textContent === t('buildTogether.strip.waiting'), 'the strip waits for friends');

    link.set({ ...link.state, guests: [{ id: 'g', name: 'Kim', identityId: 'did:key:kim', status: WalkTogetherGuestStatus.JOINED }] });
    await nextTick();
    assert(session.allowed.join() === 'did:key:kim', 'a friend who joined may edit the build');
    assert(messages.includes(t('buildTogether.joined', { name: 'Kim' })), 'and the host is told');
    assert(host.textContent.includes(t('buildTogether.guest.joined', { name: 'Kim' })), 'the dialog lists them');
    link.set({ ...link.state });
    await nextTick();
    assert(session.allowed.length === 1, 'once');
    assert(host.querySelector('.build-together-strip-title').textContent === t('buildTogether.strip.hosting')
        && host.querySelector('.build-together-person').textContent.trim() === 'Kim', 'the strip shows who is building');
    assert(host.textContent.includes(t('buildTogether.strip.undoOwn')) && stand.editorSession.shared, 'Undo takes back only your own steps');
    assert(stand.editorSession.shown.at(-1)[0].identityId === 'did:key:kim', 'and the Editor draws the co-builder');
    const strip = host.querySelector('.build-together-strip');
    assert(strip.getBoundingClientRect().right <= 360.5, 'the strip fits the viewport');

    api().notePointer({ clientX: 3, clientY: 4 });
    await until(() => session.presence.length === 1, 'the pointer is shared');
    assert(session.presence[0].pointer.x === 3 && session.presence[0].selection[0] === 'brick-1', 'with what is selected');

    api().closeBuildDialog();
    await nextTick();
    host.querySelector('.build-together-stop').click();
    await nextTick();
    assert(session.stopped && link.closed && !host.querySelector('.build-together-strip') && !stand.editorSession.shared, 'Stop ends it: the link, the permission, the strip');
    console.log('✓ the host\'s link lets each friend who joins build, shown in the strip, until Stop');

    // Another build opened while hosting ends it.
    api().openBuildDialog();
    await until(() => sides.length === 2, 'a new link');
    stand.documentManager.open({ world: { id: 'doc-2' }, metadata: new DocumentMetadata({ authorIdentityId: ME }) });
    await nextTick();
    assert(sides[1].closed && messages.includes(t('buildTogether.stoppedOtherBuild')), 'opening another build stops building together');
    app.unmount();
    assert(session.disposed, 'leaving the Editor ends the session');
    host.remove();
}

// Someone else's build: the dialog says to make a copy first, and no link is made.
{
    sides.length = 0;
    const session = new FakeSession();
    const { app, host, api } = mountEditor('did:key:someone-else', session);
    api().openBuildDialog();
    await nextTick();
    assert(host.textContent.includes(t('buildTogether.needsPublish')) && sides.length === 0 && !session.role, 'only one\'s own build can be shared');
    console.log('✓ only a build of your own can be built together');
    app.unmount();
    host.remove();
}

// A build begun here before logging in has no owner: sharing it makes it
// the sharer's.
{
    sides.length = 0;
    const session = new FakeSession();
    const { app, host, api, stand } = mountEditor(null, session);
    api().openBuildDialog();
    await until(() => sides.length === 1, 'a link is made');
    assert(stand.documentManager.document.metadata.authorIdentityId === ME && stand.documentManager.dirty, 'the unowned build becomes the sharer\'s, to be saved');
    assert(!host.textContent.includes(t('buildTogether.needsPublish')), 'with no word of making a copy');
    console.log('✓ a build begun before logging in becomes the sharer\'s');
    app.unmount();
    host.remove();
}

// A friend arriving from a link: the Editor asks for the build, says whose it
// is, and shows when the host stops.
{
    const session = new FakeSession();
    const { app, host, api, messages } = mountEditor('did:key:x', session);
    assert(api().joinFromRoute({ together: 'doc-1', host: ME, hostName: 'Ana', title: 'The Mill' }) === true, 'a build link\'s query is taken');
    assert(api().joinFromRoute({}) === false, 'any other is not');
    await until(() => messages.includes(t('buildTogether.opened', { name: 'Ana', title: 'The Mill' })), 'the build opens');
    assert(session.joinedWith.hostIdentityId === ME && session.joinedWith.documentId === 'doc-1', 'asked of the host');
    await nextTick();
    assert(host.querySelector('.build-together-strip-title').textContent === t('buildTogether.strip.guestOf', { name: 'Ana', title: 'The Mill' }), 'the strip says whose build it is');
    assert(host.querySelector('.build-together-leave') && !host.querySelector('.build-together-stop'), 'a friend can Leave, not Stop');
    session.end();
    await nextTick();
    assert(messages.includes(t('buildTogether.ended', { name: 'Ana' })), 'the friend is told when the host stops');
    assert(host.querySelector('.build-together-strip-title').textContent === t('buildTogether.strip.ended', { name: 'Ana' }), 'and the strip says so');
    host.querySelector('.build-together-leave').click();
    await nextTick();
    assert(!host.querySelector('.build-together-strip'), 'Leave closes the strip');
    console.log('✓ a friend\'s Editor opens the host\'s build, and says when the host stops');
    app.unmount();
    host.remove();
}
