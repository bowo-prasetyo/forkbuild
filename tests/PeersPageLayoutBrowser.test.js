// @environment browser
import { createApp, nextTick } from 'vue';
import PeerConnectionsView from '../ui/views/PeerConnectionsView.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { PeerIdentity } from '../peer/PeerIdentity.js';
import { FriendshipState } from '../core/FriendshipState.js';
import * as Ed25519 from '../identity/Ed25519.js';
import { assert } from './support/Assert.js';

// The Peers page, rendered by real Vue with the shipped CSS over fake use
// cases: time-sensitive items first, one card per person however many
// records describe them, Reconnect for a friend who was never remembered,
// the tabbed connect panel, and a phone-width layout without sideways
// scrolling.

await new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/main.css';
    link.onload = resolve;
    link.onerror = () => reject(new Error('css/main.css failed to load'));
    document.head.appendChild(link);
});

function makeIdentity() {
    const { publicKey } = Ed25519.seedToKeyPair(Ed25519.randomSeed());
    const publicKeyHex = Ed25519.bytesToHex(publicKey);
    return new PeerIdentity({ identityId: Ed25519.publicKeyToDidKey(publicKey), publicKey: publicKeyHex });
}

function emitter() {
    const listeners = new Set();
    return {
        on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
        emit: (value) => { for (const fn of listeners) fn(value); }
    };
}

const me = makeIdentity();
const bob = makeIdentity();
const carol = makeIdentity();
const dave = makeIdentity();
const erin = makeIdentity();
const frank = makeIdentity();
const gus = makeIdentity();

function livePeer(connectionId, identity, state = PeerLifecycleState.AUTHENTICATED, extra = {}) {
    return {
        connectionId,
        remoteIdentity: identity,
        alias: null,
        connection: { role: extra.role || 'answerer' },
        authenticationSession: { failureReason: null },
        getLifecycleState: () => state
    };
}

const peers = [
    livePeer('c-bob', bob),
    livePeer('c-erin', erin),
    livePeer('c-frank', frank),
    livePeer('c-pending', null, PeerLifecycleState.CONNECTING, { role: 'offerer' })
];
const friendRecord = (identity, extra = {}) => ({
    identityId: identity.identityId, publicKey: identity.publicKey, algorithm: 'Ed25519',
    status: FriendshipState.FRIEND, outgoingAction: { action: 'ACCEPT' }, incomingAction: { action: 'REQUEST' },
    updatedAt: new Date(2026, 8, 1), ...extra
});
const relationshipRecord = (identity, alias) => ({
    identityId: identity.identityId, publicKey: identity.publicKey, algorithm: 'Ed25519', alias,
    createdAt: new Date(2026, 7, 1), lastAuthenticatedAt: new Date(2026, 7, 20)
});

let relationships = [relationshipRecord(bob, 'Bob'), relationshipRecord(dave, 'Dave')];
const friendships = [
    friendRecord(bob),
    friendRecord(carol),
    // Erin has asked to be friends; nothing sent back yet.
    friendRecord(erin, { status: FriendshipState.REQUESTED, outgoingAction: null, incomingAction: { action: 'REQUEST' } })
];
const blocked = [{ identityId: gus.identityId, publicKey: gus.publicKey, createdAt: new Date(2026, 8, 2) }];

const calls = [];
const relationshipEvents = emitter();
const services = {
    identityUseCase: {
        isAuthenticated: () => true,
        currentSession: () => ({ identityId: me.identityId }),
        isUnlocked: () => true,
        onSessionChanged: () => () => {},
        onVaultLockChanged: () => () => {}
    },
    peerSessionManager: {
        listPeers: () => peers,
        onPeersChanged: () => () => {},
        connectedSince: () => new Date(Date.now() - 65000),
        disconnect: (id) => calls.push(['disconnect', id]),
        createInvitation: async () => ({ invitation: { toJSON: () => ({ kind: 'first' }), expiresAt: Date.now() + 60000 } }),
        acceptInvitation: async () => ({ reply: 'first-reply' }),
        completeConnection: async (id, text) => calls.push(['complete', id, text])
    },
    peerRelationshipUseCase: {
        getRelationships: () => relationships,
        onRelationshipsChanged: relationshipEvents.on,
        rememberPeer: (identity, { alias } = {}) => {
            calls.push(['remember', identity, alias]);
            relationships = [...relationships, relationshipRecord(identity, alias || null)];
            relationshipEvents.emit(relationships);
        },
        forgetPeer: (id) => calls.push(['forget', id]),
        updateAlias: (id, alias) => calls.push(['alias', id, alias])
    },
    peerReconnectionUseCase: {
        reconnectAsInviter: async (id) => {
            calls.push(['reconnect', id]);
            return { invitation: { toJSON: () => ({ kind: 'reconnect' }), expiresAt: Date.now() + 60000 } };
        },
        reconnectViaInvitation: async () => ({ reply: 'reconnect-reply' }),
        onReconnectRejected: () => () => {}
    },
    friendRelationshipUseCase: {
        getRelationships: () => friendships,
        onRelationshipsChanged: () => () => {},
        sendFriendRequest: (peer) => calls.push(['friend-request', peer.connectionId]),
        acceptFriendRequest: (peer) => calls.push(['accept', peer.connectionId]),
        rejectFriendRequest: (peer) => calls.push(['reject', peer.connectionId]),
        cancelFriendRequest: () => {},
        unfriend: (peer) => calls.push(['unfriend', peer.connectionId])
    },
    identityLifecyclePropagationUseCase: { listRemoteLifecycle: () => [] },
    peerBlockUseCase: {
        getBlocked: () => blocked,
        onBlockedChanged: () => () => {},
        block: (identity) => calls.push(['block', identity.identityId]),
        unblock: (id) => calls.push(['unblock', id])
    },
    findPeerUseCase: {
        importCandidate: () => ({ identityHint: null }),
        search: async () => [],
        connect: async () => ({ reply: '', delivered: true }),
        isPublishing: () => false,
        publishSelf: async () => null,
        stopPublishing: async () => {},
        onCandidateRejected: () => () => {}
    },
    peerPresenceUseCase: {
        isIdentityOnline: (id) => peers.some((p) => p.remoteIdentity && p.remoteIdentity.identityId === id),
        findConnectedPeer: (id) => peers.find((p) => p.remoteIdentity && p.remoteIdentity.identityId === id) || null,
        findConnectedPeers: (id) => peers.filter((p) => p.remoteIdentity && p.remoteIdentity.identityId === id)
    }
};

const host = document.createElement('div');
host.style.width = '390px';
document.body.style.margin = '0';
document.body.appendChild(host);
const app = createApp(PeerConnectionsView);
for (const [key, value] of Object.entries(services)) {
    app.provide(key, value);
}
app.component('router-link', { props: ['to'], template: '<a :href="\'#\' + to"><slot></slot></a>' });
app.mount(host);
await nextTick();

const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const byText = (root, selector, label) => [...root.querySelectorAll(selector)].find((el) => text(el) === label);
const peopleRows = () => [...host.querySelectorAll('.peers-person')];
const rowFor = (name) => peopleRows().find((row) => text(row.querySelector('.peers-row-title')) === name);
const settle = async () => { await nextTick(); await new Promise((r) => setTimeout(r, 0)); await nextTick(); };

// Order: what needs doing first, then people, then new connections, then blocked.
{
    const headings = [...host.querySelectorAll('.peers-section-heading')].map((h) => text(h).replace(/\s*\d+$/, ''));
    assert(JSON.stringify(headings) === JSON.stringify(['Needs your attention', 'People', 'Connect with someone new', 'Blocked']),
        `section order, got ${headings.join(' | ')}`);
    assert(host.querySelector('h1').textContent.trim() === 'Peers', 'the page title matches the nav');
    assert(!/core\/|\.js\b/.test(host.textContent), 'no source file names are shown to users');
    assert(!host.querySelector('.peers-blocked').open, 'Blocked starts folded');
}

// One card per person, whatever mix of records describes them.
{
    const names = peopleRows().map((row) => text(row.querySelector('.peers-row-title')));
    assert(names.length === 5, `Bob, Carol, Dave, Erin and Frank each get one card (Gus is only blocked), got ${names.length}`);
    assert(names.filter((n) => n === 'Bob').length === 1, 'Bob — remembered, a friend and online — is one card, not three');
    assert(names[0] === 'Bob', 'online friends sort first');
    assert(names.indexOf('Dave') === names.length - 1, 'an offline remembered non-friend sorts last');
    const bobRow = rowFor('Bob');
    assert(bobRow.querySelector('.peers-presence--online'), 'Bob shows as online');
    assert(!byText(bobRow, 'button', 'Reconnect'), 'an online person has no Reconnect');
}

// Carol is a friend who was never remembered: she can still be reconnected
// and named.
{
    let carolRow = peopleRows().find((row) => row.textContent.includes(carol.identityId.slice(-14)));
    assert(byText(carolRow, 'a', 'Chat'), 'an offline friend still has Chat');
    const reconnect = byText(carolRow, 'button', 'Reconnect');
    assert(reconnect, 'an offline friend who was never remembered has Reconnect');
    reconnect.click();
    await settle();
    byText(carolRow, 'button', 'Create Invitation').click();
    await settle();
    assert(calls.some(([kind, id]) => kind === 'reconnect' && id === carol.identityId), 'Reconnect asks for an invitation expecting Carol\'s identity');
    assert(carolRow.querySelector('.peers-reconnect textarea').value.includes('reconnect'), 'the reconnect invitation is shown to copy');

    const unfriend = [...carolRow.querySelectorAll('.peers-menu-item')].find((b) => text(b).startsWith('Unfriend'));
    assert(unfriend.disabled, 'Unfriend waits until she is connected, since she has to receive it');

    carolRow.querySelector('.peers-menu-trigger').click();
    await settle();
    byText(carolRow, '.peers-menu-item', 'Name & Remember').click();
    await settle();
    const input = carolRow.querySelector('.peers-rename input');
    input.value = 'Carol';
    input.dispatchEvent(new Event('input'));
    carolRow.querySelector('.peers-rename button[type="submit"]').click();
    await settle();
    const remember = calls.find(([kind]) => kind === 'remember');
    assert(remember && remember[1] instanceof PeerIdentity && remember[1].identityId === carol.identityId && remember[2] === 'Carol',
        'naming a friend remembers her verified identity with that name');
    carolRow = rowFor('Carol');
    assert(carolRow && !carolRow.querySelector('.peers-rename'), 'her card now shows the new name and the form closes');
}

// Live strangers: Frank can be added as a friend; Erin's request waits at the top.
{
    const frankRow = peopleRows().find((row) => row.textContent.includes(frank.identityId.slice(-14)));
    byText(frankRow, 'button', 'Add Friend').click();
    assert(calls.some(([kind, id]) => kind === 'friend-request' && id === 'c-frank'), 'Add Friend sends a request over Frank\'s connection');
    const erinRow = peopleRows().find((row) => row.textContent.includes(erin.identityId.slice(-14)));
    assert(!byText(erinRow, 'button', 'Add Friend'), 'Erin already asked, so her card offers no second request');

    const attention = host.querySelector('.peers-attention');
    byText(attention, 'button', 'Accept').click();
    assert(calls.some(([kind, id]) => kind === 'accept' && id === 'c-erin'), 'Accept answers Erin\'s request');

    const reply = attention.querySelector('textarea');
    reply.value = 'their-reply';
    reply.dispatchEvent(new Event('input'));
    await settle();
    byText(attention, 'button', 'Finish Connecting').click();
    await settle();
    assert(calls.some(([kind, id, t]) => kind === 'complete' && id === 'c-pending' && t === 'their-reply'),
        'a connection waiting for its reply finishes from the attention list');
}

// Filters.
{
    const names = () => peopleRows().map((row) => text(row.querySelector('.peers-row-title')));
    byText(host, '.peers-filter-btn', 'Friends').click();
    await settle();
    assert(JSON.stringify(names().sort()) === JSON.stringify(['Bob', 'Carol']), `Friends shows friends only, got ${names().join(', ')}`);
    byText(host, '.peers-filter-btn', 'Online').click();
    await settle();
    assert(names().length === 3 && !names().includes('Carol') && !names().includes('Dave'), `Online hides offline people, got ${names().join(', ')}`);
    byText(host, '.peers-filter-btn', 'All').click();
    await settle();
}

// Connect with someone new: one tab at a time.
{
    const tabs = [...host.querySelectorAll('.peers-tab')].map(text);
    assert(JSON.stringify(tabs) === JSON.stringify(['Invite', 'Paste an invitation', 'Find by ID', 'Public lobby']), `tabs, got ${tabs.join(', ')}`);
    const panel = () => host.querySelector('.peers-tab-panel');
    assert(byText(panel(), 'button', 'Create Invitation'), 'Invite is the default tab');
    byText(host, '.peers-tab', 'Paste an invitation').click();
    await settle();
    assert(panel().querySelector('textarea') && byText(panel(), 'button', 'Connect'), 'Paste shows one box and Connect');
    byText(host, '.peers-tab', 'Find by ID').click();
    await settle();
    assert(byText(panel(), 'button', 'Find') && byText(panel(), 'button', 'Be Discoverable'), 'Find by ID holds search and Be Discoverable');
    assert(!panel().querySelector('.peers-more').open, 'saving an invitation for later is folded away');
    byText(host, '.peers-tab', 'Invite').click();
    await settle();
}

// Phone width: nothing scrolls sideways, even with a menu open.
{
    rowFor('Bob').querySelector('.peers-menu-trigger').click();
    await settle();
    const menu = rowFor('Bob').querySelector('.peers-menu-list');
    assert(menu.getBoundingClientRect().left >= 0, `the open menu stays on screen (left ${menu.getBoundingClientRect().left})`);
    const root = document.scrollingElement;
    assert(root.scrollWidth <= root.clientWidth, `no sideways scroll at 390px (${root.scrollWidth} > ${root.clientWidth})`);
    host.querySelector('h1').click();
    assert(!rowFor('Bob').querySelector('.peers-menu').open, 'clicking outside closes the menu');
    rowFor('Bob').querySelector('.peers-menu-trigger').click();
    await settle();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    assert(!rowFor('Bob').querySelector('.peers-menu').open, 'Esc closes the menu');
}

app.unmount();
host.remove();
