// @environment browser
import { createApp, nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import DevicePairingView from '../ui/views/DevicePairingView.js';
import DevicePairingReceiveView from '../ui/views/DevicePairingReceiveView.js';
import { DevicePairingFailure, DevicePairingStatus } from '../application/devicePairing/DevicePairing.js';
import { t } from '../ui/i18n/i18n.js';
import { assert } from './support/Assert.js';

// Copy to another device, rendered by real Vue with the shipped CSS: the
// page showing the code (a QR code and its link, at phone width too) and
// the page a pairing link opens (what arrived, Add to this device). The
// pairing itself is a stand-in here; tests/DevicePairing.test.js runs the
// real one between two devices.

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

// One side of a pairing whose states the test sets.
class FakeSide {
    constructor() {
        this.state = Object.freeze({ status: DevicePairingStatus.STARTING });
        this.listeners = new Set();
        this.closed = false;
        this.added = 0;
    }
    onChange(callback) { this.listeners.add(callback); return () => this.listeners.delete(callback); }
    set(state) { this.state = Object.freeze(state); for (const listener of this.listeners) listener(this.state); }
    async start() { this.started = true; }
    close() { this.closed = true; }
    async add() { this.added++; this.set({ ...this.state, status: DevicePairingStatus.ADDED }); return { written: 3, kept: 0, skipped: 0 }; }
}

const CODE = 'A' + 'b'.repeat(86);
const sides = { senders: [], receivers: [] };
const devicePairing = {
    available: true,
    createSender() { const side = new FakeSide(); sides.senders.push(side); return side; },
    createReceiver(code) { const side = new FakeSide(); side.code = code; sides.receivers.push(side); return side; }
};
let reloads = 0;

const router = createRouter({
    history: createMemoryHistory(),
    routes: [
        { path: '/settings/data/pair', component: DevicePairingView },
        { path: '/pair/:code', component: DevicePairingReceiveView },
        { path: '/:rest(.*)', component: { template: '<div class="elsewhere"></div>' } }
    ]
});
const host = document.createElement('div');
host.style.cssText = 'width: 360px;';
document.body.appendChild(host);
const app = createApp({ template: '<router-view />' });
app.use(router);
app.provide('devicePairing', devicePairing);
app.provide('appUrl', () => 'https://example.org/forkbuild/#/settings/data/pair');
app.provide('reloadPage', () => { reloads++; });
app.mount(host);

// The sending page shows a code as soon as it opens.
await router.push('/settings/data/pair');
await until(() => sides.senders.length === 1 && sides.senders[0].started, 'a code is requested on opening');
const sender = sides.senders[0];
await nextTick();
assert(host.querySelector('.device-pairing-starting'), 'it says a code is being prepared');
assert(host.textContent.includes(t('devicePairing.warning')), 'and warns that anyone with the code can copy everything');

sender.set({ status: DevicePairingStatus.WAITING, code: CODE, expiresAt: new Date(Date.now() + 600000) });
await nextTick();
const svg = host.querySelector('svg.qr-code-image');
assert(svg && svg.querySelector('path').getAttribute('d').length > 100, 'the code shows as a QR code');
assert(svg.getAttribute('aria-label') === t('devicePairing.qrLabel'), 'with a label for screen readers');
const width = svg.getBoundingClientRect().width;
assert(width > 200 && width <= 360, `the QR code is large enough to scan and fits a phone (${width}px)`);
const linkInput = host.querySelector('.device-pairing-link-url');
assert(linkInput.value === `https://example.org/forkbuild/#/pair/${CODE}`, `the link opens the code in this app (${linkInput.value})`);
assert(host.querySelector('.device-pairing-expiry'), 'it says until when the code works');
assert(document.documentElement.scrollWidth <= window.innerWidth, 'nothing overflows the page sideways');

sender.set({ status: DevicePairingStatus.SENDING });
await nextTick();
assert(host.querySelector('.device-pairing-sending') && !host.querySelector('svg.qr-code-image'), 'the code goes away while sending');

sender.set({ status: DevicePairingStatus.SENT, groups: { documents: 3, structures: 1 } });
await nextTick();
const sentItems = Array.from(host.querySelectorAll('.device-pairing-sent li')).map((li) => li.textContent);
assert(sentItems.length === 2 && sentItems[0].includes('3'), `it lists what was sent (${sentItems.join(' | ')})`);

host.querySelector('.device-pairing-show').click();
await until(() => sides.senders.length === 2, 'Show a new code starts over');
assert(sender.closed, 'the previous pairing is closed');
sides.senders[1].set({ status: DevicePairingStatus.FAILED, failure: DevicePairingFailure.UNREACHABLE });
await nextTick();
assert(host.querySelector('.device-pairing-failed').textContent.includes(t('devicePairing.failure.unreachable')), 'a failure says why');

await router.push('/elsewhere');
await nextTick();
assert(sides.senders[1].closed, 'leaving the page closes the pairing');
console.log('✓ the sending page shows the code as a QR code and a link, then what was sent');

// The receiving page connects on opening, shows what arrived, and adds it.
await router.push(`/pair/${CODE}`);
await until(() => sides.receivers.length === 1 && sides.receivers[0].started, 'the link connects on opening');
const receiver = sides.receivers[0];
assert(receiver.code === CODE, 'with the code from the link');
await nextTick();
assert(host.querySelector('.device-pairing-connecting'), 'it says it is connecting');

receiver.set({ status: DevicePairingStatus.RECEIVING, receivedLength: 2048, totalLength: 4096 });
await nextTick();
assert(/2(\.0)?\s?KB/.test(host.querySelector('.device-pairing-receiving').textContent), 'it shows how much has arrived');

receiver.set({ status: DevicePairingStatus.RECEIVED, createdAt: new Date().toISOString(), groups: { documents: 3, identities: 2 } });
await nextTick();
const rows = host.querySelectorAll('.device-pairing-arrived tr');
assert(rows.length === 2, 'it lists what arrived before anything is added');
assert(receiver.added === 0, 'nothing is added on its own');
host.querySelector('.device-pairing-add').click();
await until(() => reloads === 1, 'the app starts again after adding');
assert(receiver.added === 1, 'Add to this device adds it');
assert(router.currentRoute.value.path === '/', 'and the app starts again at home, not on the spent link');
console.log('✓ a pairing link shows what arrived and adds it when asked');

// A failure that a retry can't fix offers no retry; an unreachable server does.
await router.push(`/pair/${CODE}x`);
await until(() => sides.receivers.length === 2, 'a second link connects');
sides.receivers[1].set({ status: DevicePairingStatus.FAILED, failure: DevicePairingFailure.NOT_FOUND });
await nextTick();
assert(host.querySelector('.device-pairing-failed').textContent.includes(t('devicePairing.failure.notFound')), 'a spent code says so');
assert(!host.querySelector('.device-pairing-retry'), 'with no retry, since the code is spent');
sides.receivers[1].set({ status: DevicePairingStatus.FAILED, failure: DevicePairingFailure.UNREACHABLE });
await nextTick();
host.querySelector('.device-pairing-retry').click();
await until(() => sides.receivers.length === 3, 'Try again connects anew when the server could not be reached');
console.log('✓ failures explain themselves, and only a server that could not be reached offers a retry');

app.unmount();
console.log('\n✅ All device pairing page tests passed.');
