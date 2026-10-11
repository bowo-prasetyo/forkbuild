// @environment browser
import { createApp, nextTick, reactive } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import WalkTogetherJoinView from '../ui/views/WalkTogetherJoinView.js';
import WalkTogetherDialog from '../ui/components/walkTogether/WalkTogetherDialog.js';
import { WalkTogetherFailure, WalkTogetherGuestStatus, WalkTogetherStatus } from '../application/walkTogether/WalkTogether.js';
import { OpenPublicationLinkOutcome } from '../application/publication/OpenPublicationLink.js';
import { t } from '../ui/i18n/i18n.js';
import { assert } from './support/Assert.js';

// "Walk here with me", rendered by real Vue with the shipped CSS, at phone
// width: the page a walk link opens (log in, Join, then World View) and
// World View's dialog with the link. The walk itself is a stand-in here;
// tests/WalkTogether.test.js runs the real one between devices.

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

const CODE = 'A' + 'b'.repeat(43);
const DOCUMENT_ID = '44444444-4444-4444-8444-444444444444';

// One guest whose states the test sets.
class FakeGuest {
    constructor(code, options) {
        this.code = code;
        this.options = options;
        this.state = Object.freeze({ status: WalkTogetherStatus.STARTING });
        this.listeners = new Set();
        this.closed = false;
    }
    onChange(callback) { this.listeners.add(callback); return () => this.listeners.delete(callback); }
    set(state) { this.state = Object.freeze(state); for (const listener of Array.from(this.listeners)) listener(this.state); }
    async start() { this.started = true; this.set({ status: WalkTogetherStatus.CONNECTING }); }
    close() { this.closed = true; }
}

const session = { user: null };
const guests = [];
const walkTogether = {
    available: true,
    canWalk: () => Boolean(session.user),
    createGuest(code, options) { const guest = new FakeGuest(code, options); guests.push(guest); return guest; }
};
const userListeners = new Set();
const identityUseCase = {
    currentUser: () => session.user,
    onUserChanged(callback) { userListeners.add(callback); return () => userListeners.delete(callback); },
    listIdentities: () => [],
    createIdentity() {},
    authenticate() {}
};
const opened = [];
const counted = [];

const router = createRouter({
    history: createMemoryHistory(),
    routes: [
        { path: '/walk/:code', component: WalkTogetherJoinView },
        { path: '/world/:documentId', component: { template: '<div class="world-stand-in"></div>' } },
        { path: '/:rest(.*)', component: { template: '<div class="elsewhere"></div>' } }
    ]
});
const host = document.createElement('div');
host.style.cssText = 'width: 360px;';
document.body.appendChild(host);
const app = createApp({ template: '<router-view />' });
app.use(router);
app.provide('walkTogether', walkTogether);
app.provide('identityUseCase', identityUseCase);
app.provide('openPublicationLink', async ({ linkOnly }) => {
    opened.push(linkOnly);
    return { outcome: OpenPublicationLinkOutcome.OPENED, documentId: DOCUMENT_ID };
});
app.provide('funnelEventCounter', { joinedWalk: () => counted.push('walk-joined') });
app.mount(host);

// A damaged link says so, and offers nothing to join.
await router.push('/walk/not-a-code');
await nextTick();
assert(host.textContent.includes(t('walkTogether.failure.invalidCode')), 'a damaged link says so');
assert(!host.querySelector('.walk-together-join') && !host.querySelector('.walk-together-sign-in'), 'with nothing to join');

// Signed out: the page explains, and Log in opens the login dialog for walking.
await router.push(`/walk/${CODE}`);
await nextTick();
assert(host.querySelector('h1').textContent === t('walkTogether.join.title'), 'the page is titled for walking together');
assert(host.textContent.includes(t('walkTogether.join.signInWhy')), 'it says why logging in comes first');
assert(!host.querySelector('.walk-together-join'), 'Join waits for a log in');
host.querySelector('.walk-together-sign-in').click();
await nextTick();
assert(host.querySelector('.modal-overlay h3').textContent === t('loginModal.quick.walkTitle'), 'with no identity yet, the login dialog asks only for a name to walk as');
assert(host.textContent.includes(t('loginModal.quick.walkLead')), 'and says what the name is for');
assert(guests.length === 0, 'nothing connects before a log in');

// Logged in: the page names who you walk as and what joining shares, then joins on a click.
session.user = { displayName: 'Sam' };
for (const listener of userListeners) listener(session.user);
host.querySelector('.modal-overlay').dispatchEvent(new MouseEvent('click', { bubbles: true }));
await nextTick();
assert(host.textContent.includes(t('walkTogether.join.as', { name: 'Sam' })), 'it names who you walk as');
assert(host.textContent.includes(t('walkTogether.join.privacy')), 'and says joining shows each side the other\'s IP address');
assert(document.documentElement.scrollWidth <= window.innerWidth, 'nothing overflows the page sideways');
host.querySelector('.walk-together-join').click();
await until(() => guests.length === 1 && guests[0].started, 'Join starts the walk');
const guest = guests[0];
assert(guest.code === CODE && guest.options.guestName === 'Sam', 'with the link\'s code and the guest\'s name');
await nextTick();
assert(host.querySelector('.walk-together-progress').textContent === t('walkTogether.join.connecting'), 'it says it is finding the friend');

// The World arrives and is opened as a shared link's build is.
const linkOnly = { claim: { id: 'p' }, snapshotText: '{}' };
const result = await guest.options.openWorld(linkOnly);
assert(opened[0] === linkOnly && result.opened && result.documentId === DOCUMENT_ID, 'the World is checked and kept as a shared link\'s build is');
guest.set({ status: WalkTogetherStatus.JOINING, hostName: 'Ana' });
await nextTick();
assert(host.querySelector('.walk-together-progress').textContent === t('walkTogether.join.joining', { name: 'Ana' }), 'it names the friend it is joining');
guest.set({ status: WalkTogetherStatus.JOINED, hostName: 'Ana', documentId: DOCUMENT_ID });
await until(() => router.currentRoute.value.path === `/world/${DOCUMENT_ID}`, 'joining opens the World');
assert(counted.join() === 'walk-joined', 'arriving is counted');
assert(!guest.closed, 'leaving for the World leaves the joined walk to finish on its own');
console.log('✓ a walk link asks for a log in, says what joining shares, joins on a click and opens the World');

// A World that doesn't check out offers no retry; a dropped connection does.
await router.push(`/walk/${CODE}`);
await nextTick();
host.querySelector('.walk-together-join').click();
await until(() => guests.length === 2, 'joining again');
guests[1].set({ status: WalkTogetherStatus.FAILED, failure: WalkTogetherFailure.WORLD_NOT_VERIFIED });
await nextTick();
assert(host.textContent.includes(t('walkTogether.failure.worldNotVerified')), 'it says the World did not check out');
assert(!host.querySelector('.walk-together-join'), 'with no retry');
guests[1].set({ status: WalkTogetherStatus.FAILED, failure: WalkTogetherFailure.CONNECTION });
await nextTick();
assert(host.querySelector('.walk-together-join').textContent.trim() === t('walkTogether.tryAgain'), 'a dropped connection offers Try again');
host.querySelector('.walk-together-join').click();
await until(() => guests.length === 3, 'Try again joins anew');
assert(guests[1].closed, 'closing the failed attempt');
await router.push('/elsewhere');
await nextTick();
assert(guests[2].closed, 'leaving the page before arriving ends the walk');
console.log('✓ failures explain themselves, and only those a retry can fix offer one');
app.unmount();
host.remove();

// World View's dialog: the link as a QR code and text, until when it works,
// and who came.
{
    const props = reactive({ state: null, link: '', available: true, needsPublish: false });
    const events = [];
    const dialogHost = document.createElement('div');
    dialogHost.style.cssText = 'width: 360px;';
    document.body.appendChild(dialogHost);
    const dialog = createApp({
        components: { WalkTogetherDialog },
        setup: () => ({ props, record: (name) => events.push(name) }),
        template: `<WalkTogetherDialog v-bind="props" @retry="record('retry')" @stop="record('stop')" @close="record('close')" />`
    });
    dialog.mount(dialogHost);

    props.state = { status: WalkTogetherStatus.STARTING };
    await nextTick();
    assert(dialogHost.textContent.includes(t('walkTogether.starting')), 'it says a link is being made');

    const link = `https://example.org/forkbuild/#/walk/${CODE}`;
    props.state = { status: WalkTogetherStatus.WAITING, code: CODE, expiresAt: new Date(Date.now() + 1800000), guests: [] };
    props.link = link;
    await nextTick();
    assert(dialogHost.querySelector('h3').textContent === t('walkTogether.title'), 'the dialog is titled Walk here with me');
    const svg = dialogHost.querySelector('svg.qr-code-image');
    assert(svg && svg.getAttribute('aria-label') === t('walkTogether.qrLabel'), 'the link shows as a QR code, labelled');
    assert(dialogHost.querySelector('.walk-together-link').value === link, 'and as text');
    assert(dialogHost.querySelector('.walk-together-copy'), 'with Copy link');
    assert(dialogHost.querySelector('.walk-together-lasts'), 'it says until when the link works');
    assert(dialogHost.textContent.includes(t('walkTogether.nobodyYet')), 'and that nobody has come yet');
    const panel = dialogHost.querySelector('.walk-together-dialog');
    assert(panel.getBoundingClientRect().right <= window.innerWidth + 0.5, 'the dialog fits a phone');

    props.state = {
        ...props.state,
        guests: [
            { id: 'a', name: 'Sam', status: WalkTogetherGuestStatus.JOINED },
            { id: 'b', name: null, status: WalkTogetherGuestStatus.ARRIVING },
            { id: 'c', name: 'Kim', status: WalkTogetherGuestStatus.FAILED }
        ]
    };
    await nextTick();
    const rows = Array.from(dialogHost.querySelectorAll('.walk-together-guest')).map((li) => li.textContent);
    assert(rows.join(' | ') === [
        t('walkTogether.guest.joined', { name: 'Sam' }),
        t('walkTogether.guest.arriving', { name: t('walkTogether.someone') }),
        t('walkTogether.guest.failed', { name: 'Kim' })
    ].join(' | '), `it lists who came (${rows.join(' | ')})`);
    dialogHost.querySelector('.walk-together-stop').click();
    assert(events.join() === 'stop', 'Stop the link stops it');

    props.state = { status: WalkTogetherStatus.EXPIRED, guests: [] };
    await nextTick();
    assert(dialogHost.textContent.includes(t('walkTogether.expired')), 'an expired link says friends who joined stay');
    dialogHost.querySelector('.walk-together-retry').click();
    assert(events.join() === 'stop,retry', 'and offers a new link');

    props.state = { status: WalkTogetherStatus.FAILED, failure: WalkTogetherFailure.UNREACHABLE };
    await nextTick();
    assert(dialogHost.textContent.includes(t('walkTogether.failure.unreachable')), 'a failure says why');
    assert(dialogHost.querySelector('.walk-together-retry').textContent.trim() === t('walkTogether.tryAgain'), 'with Try again');

    props.state = null;
    props.needsPublish = true;
    await nextTick();
    assert(dialogHost.textContent.includes(t('walkTogether.needsPublish')), 'an unpublished World says to publish it first');
    assert(!dialogHost.querySelector('.walk-together-retry') && !dialogHost.querySelector('svg.qr-code-image'), 'and offers no link');

    props.available = false;
    await nextTick();
    assert(dialogHost.textContent.includes(t('walkTogether.unavailable')), 'a copy without a rendezvous server says so');
    dialogHost.querySelector('.walk-together-close').click();
    assert(events.join() === 'stop,retry,close', 'Close closes the dialog');
    dialog.unmount();
    dialogHost.remove();
    console.log('✓ World View\'s dialog shows the link as a QR code and text, who came, and what to do when it can\'t');
}

console.log('\n✅ All walk together page tests passed.');
