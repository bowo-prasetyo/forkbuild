// "Walk here with me" (application/walkTogether/WalkTogether.js): a host and
// guests, each with the app's own peer session around their identity, real
// WebRTC (node-datachannel) and the one-off meeting over an in-memory
// rendezvous network. The World a guest receives is checked by an injected
// openWorld, as the app checks a link-only share.
import {
    WalkTogether, WalkTogetherFailure, WalkTogetherGuestStatus, WalkTogetherStatus, WALK_TOGETHER_PROTOCOL
} from '../application/walkTogether/WalkTogether.js';
import { PeerSessionManager } from '../application/peer/PeerSessionManager.js';
import { WebRtcPeerConnectionProvider } from '../peer/WebRtcPeerConnectionProvider.js';
import { LocalRendezvousNetwork } from '../peer/LocalRendezvousNetwork.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { EphemeralIdentityProvider } from '../identity/EphemeralIdentityProvider.js';
import { createWalkTogetherCode, parseWalkTogetherCode, walkTogetherLink } from '../core/WalkTogetherCode.js';
import { assert } from './support/Assert.js';

const WORLD_DOCUMENT_ID = '33333333-3333-4333-8333-333333333333';
const SNAPSHOT_TEXT = JSON.stringify({ world: { id: WORLD_DOCUMENT_ID }, metadata: { title: 'Harbor' } });

// Stands in for a signed Publication: the module only carries it, and the
// guest's openWorld decides whether it checks out.
function signedClaim(publisherId) {
    return { documentId: WORLD_DOCUMENT_ID, title: 'Harbor', signature: 'ab'.repeat(64), publisherIdentity: { id: publisherId } };
}

function makePerson(network, { ttlMs, joinTimeoutMs, identityProvider } = {}) {
    const identity = identityProvider || new EphemeralIdentityProvider();
    const peerConnectionProvider = new WebRtcPeerConnectionProvider();
    const peerSessionManager = new PeerSessionManager({ identityProvider: identity, peerConnectionProvider: new WebRtcPeerConnectionProvider() });
    const walk = new WalkTogether({
        peerSessionManager,
        identityProvider: identity,
        peerConnectionProvider,
        rendezvousTransports: network ? [network] : [],
        answerPollIntervalMs: 50,
        answerWatchIntervalMs: 50,
        ...(ttlMs ? { ttlMs } : {}),
        ...(joinTimeoutMs ? { joinTimeoutMs } : {})
    });
    return {
        identity,
        peerSessionManager,
        walk,
        dispose() {
            peerSessionManager.dispose();
            peerConnectionProvider.dispose();
        }
    };
}

// Records what arrives and opens it, as the app's openPublicationLink would.
function opener({ accept = true } = {}) {
    const received = [];
    return {
        received,
        openWorld: async (linkOnly) => {
            received.push(linkOnly);
            return accept && linkOnly.claim && linkOnly.claim.signature
                ? { opened: true, documentId: linkOnly.claim.documentId }
                : { opened: false };
        }
    };
}

function waitFor(side, test, description, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
        if (test(side.state)) return resolve(side.state);
        const timer = setTimeout(() => {
            unsubscribe();
            reject(new Error(`ASSERT FAILED: ${description} (still ${JSON.stringify(side.state)})`));
        }, timeoutMs);
        const unsubscribe = side.onChange((state) => {
            if (test(state)) {
                clearTimeout(timer);
                unsubscribe();
                resolve(state);
            }
        });
    });
}

const hasStatus = (status) => (state) => state.status === status;

function authenticatedPeer(person, remoteIdentityId) {
    return person.peerSessionManager.listPeers().find((peer) => peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED
        && peer.remoteIdentity && peer.remoteIdentity.identityId === remoteIdentityId);
}

// The code: a one-off identity's key, as one short link segment.
{
    const identity = new EphemeralIdentityProvider();
    const code = createWalkTogetherCode(identity.identityId);
    assert(/^[A-Za-z0-9_-]{44}$/.test(code), `the code is 44 base64url characters (${code})`);
    assert(parseWalkTogetherCode(code).identityId === identity.identityId, 'the code names the one-off identity');
    assert(parseWalkTogetherCode(code.slice(1)) === null, 'a cut code is refused');
    assert(parseWalkTogetherCode('B' + code.slice(1)) === null, 'a code of another format version is refused');
    assert(parseWalkTogetherCode(null) === null, 'no code is refused');
    assert(walkTogetherLink(code, 'https://example.org/forkbuild/#/world/abc') === `https://example.org/forkbuild/#/walk/${code}`,
        'the link puts the code after # in the app\'s own address');
    console.log('✓ a walk code names a one-off identity');
}

// End to end: a host shares a link from a World; two friends open it, one
// after the other, and each ends up connected to the host's own peer
// session, in the same World.
{
    const network = new LocalRendezvousNetwork();
    const host = makePerson(network);
    const sam = makePerson(network);
    const kim = makePerson(network);

    const hosting = host.walk.createHost({ world: { claim: signedClaim(host.identity.identityId), snapshotText: SNAPSHOT_TEXT }, hostName: '  Ana  ' });
    await hosting.start();
    assert(hosting.state.status === WalkTogetherStatus.WAITING, `the host waits with a link (${JSON.stringify(hosting.state)})`);
    assert(hosting.state.expiresAt instanceof Date && hosting.state.expiresAt.getTime() > Date.now(), 'the link says when it stops working');
    assert(hosting.state.guests.length === 0, 'nobody has come yet');
    const { code } = hosting.state;
    const meetingKey = parseWalkTogetherCode(code).identityId;
    assert((await network.lookup(meetingKey)).length === 1, 'the rendezvous network holds the one-off offer');
    assert((await network.lookup(host.identity.identityId)).length === 0, 'and never the host\'s own identity');

    const samWorld = opener();
    const samGuest = sam.walk.createGuest(code, { openWorld: samWorld.openWorld, guestName: 'Sam' });
    const samStatuses = [];
    samGuest.onChange((state) => samStatuses.push(state.status));
    await samGuest.start();
    const samJoined = await waitFor(samGuest, hasStatus(WalkTogetherStatus.JOINED), 'Sam joins');
    assert(samStatuses.includes(WalkTogetherStatus.CONNECTING) && samStatuses.includes(WalkTogetherStatus.JOINING),
        'the guest connects, then joins');
    assert(samJoined.hostName === 'Ana', 'the guest learns who invited them');
    assert(samJoined.documentId === WORLD_DOCUMENT_ID, 'and which World to open');
    assert(samWorld.received.length === 1 && samWorld.received[0].snapshotText === SNAPSHOT_TEXT
        && samWorld.received[0].claim.publisherIdentity.id === host.identity.identityId,
    'the World arrives exactly as signed, for the guest to check');
    assert(authenticatedPeer(sam, host.identity.identityId), 'the guest\'s own peer session is connected to the host\'s identity');
    const samOnHost = await waitFor(hosting, (state) => state.guests.some((guest) => guest.status === WalkTogetherGuestStatus.JOINED), 'the host sees Sam join');
    assert(samOnHost.guests.length === 1 && samOnHost.guests[0].name === 'Sam', 'the host sees the guest\'s name');
    assert(authenticatedPeer(host, sam.identity.identityId), 'and the host\'s peer session is connected to the guest\'s identity');

    // Presence travels over that connection: anything the app sends a
    // connected peer reaches the other side.
    const kimWorld = opener();
    const kimGuest = kim.walk.createGuest(code, { openWorld: kimWorld.openWorld, guestName: 'Kim' });
    await kimGuest.start();
    await waitFor(kimGuest, hasStatus(WalkTogetherStatus.JOINED), 'a second friend joins through the same link');
    const both = await waitFor(hosting, (state) => state.guests.filter((guest) => guest.status === WalkTogetherGuestStatus.JOINED).length === 2,
        'the host sees both friends');
    assert(both.guests.map((guest) => guest.name).sort().join() === 'Kim,Sam', 'both are listed by name');
    assert(authenticatedPeer(host, kim.identity.identityId), 'the host is connected to the second friend too');
    assert(hosting.state.status === WalkTogetherStatus.WAITING, 'the link keeps working for more');
    console.log('✓ a walk link connects each friend who opens it to the host, in the host\'s World');

    hosting.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert((await network.lookup(meetingKey)).length === 0, 'closing withdraws the link\'s offer from the rendezvous network');
    const afterClose = sam.walk.createGuest(code, opener());
    await afterClose.start();
    assert(afterClose.state.failure === WalkTogetherFailure.NOT_FOUND, 'so a closed link finds nobody');
    assert(authenticatedPeer(host, sam.identity.identityId), 'closing the link leaves the friends connected');
    samGuest.close();
    kimGuest.close();
    for (const person of [host, sam, kim]) person.dispose();
}

// A World that doesn't check out: the guest stops, says why, and is never
// connected to the host.
{
    const network = new LocalRendezvousNetwork();
    const host = makePerson(network);
    const guest = makePerson(network);
    const hosting = host.walk.createHost({ world: { claim: signedClaim(host.identity.identityId), snapshotText: SNAPSHOT_TEXT }, hostName: 'Ana' });
    await hosting.start();
    const joining = guest.walk.createGuest(hosting.state.code, { openWorld: opener({ accept: false }).openWorld, guestName: 'Sam' });
    await joining.start();
    const failed = await waitFor(joining, hasStatus(WalkTogetherStatus.FAILED), 'the guest stops');
    assert(failed.failure === WalkTogetherFailure.WORLD_NOT_VERIFIED, 'because the World did not check out');
    await waitFor(hosting, (state) => state.guests.some((entry) => entry.status === WalkTogetherGuestStatus.FAILED), 'the host hears it failed');
    assert(!authenticatedPeer(guest, host.identity.identityId) && !authenticatedPeer(host, guest.identity.identityId),
        'the two peer sessions never connect');
    assert(host.peerSessionManager.listPeers().length === 0, 'and the host keeps no half-open connection for that guest');
    console.log('✓ a World that does not check out stops the guest before anyone is connected');
    hosting.close();
    joining.close();
    host.dispose();
    guest.dispose();
}

// Failures that never reach a connection.
{
    const network = new LocalRendezvousNetwork();
    const host = makePerson(network);
    const world = { claim: signedClaim(host.identity.identityId), snapshotText: SNAPSHOT_TEXT };

    const unsigned = host.walk.createHost({ world: { claim: { ...world.claim, signature: null }, snapshotText: SNAPSHOT_TEXT }, hostName: 'Ana' });
    await unsigned.start();
    assert(unsigned.state.failure === WalkTogetherFailure.NOT_PUBLISHED, 'a World without a signed Publication can\'t be walked together');
    const noBuild = host.walk.createHost({ world: { claim: world.claim, snapshotText: '' }, hostName: 'Ana' });
    await noBuild.start();
    assert(noBuild.state.failure === WalkTogetherFailure.NOT_PUBLISHED, 'nor one whose build this device doesn\'t hold');

    const signedOut = makePerson(network, { identityProvider: { getSigningIdentity: () => { throw new Error('locked'); }, signCanonical() {} } });
    assert(signedOut.walk.canWalk() === false, 'a locked or signed-out identity can\'t walk');
    const signedOutHost = signedOut.walk.createHost({ world, hostName: 'Ana' });
    await signedOutHost.start();
    assert(signedOutHost.state.failure === WalkTogetherFailure.NOT_SIGNED_IN, 'and hosting says why');

    const offline = makePerson(null);
    assert(offline.walk.available === false, 'without a rendezvous server walking together is unavailable');
    const offlineHost = offline.walk.createHost({ world, hostName: 'Ana' });
    await offlineHost.start();
    assert(offlineHost.state.failure === WalkTogetherFailure.UNREACHABLE, 'and hosting says why');

    const guest = makePerson(network);
    const invalid = guest.walk.createGuest('not-a-code', opener());
    await invalid.start();
    assert(invalid.state.failure === WalkTogetherFailure.INVALID_CODE, 'a malformed link is refused');
    const gone = guest.walk.createGuest(createWalkTogetherCode(new EphemeralIdentityProvider().identityId), opener());
    await gone.start();
    assert(gone.state.failure === WalkTogetherFailure.NOT_FOUND, 'a link nobody is waiting behind is not found');

    const expiring = makePerson(network, { ttlMs: 300 });
    const shortLived = expiring.walk.createHost({ world: { claim: signedClaim(expiring.identity.identityId), snapshotText: SNAPSHOT_TEXT }, hostName: 'Ana' });
    await shortLived.start();
    await waitFor(shortLived, hasStatus(WalkTogetherStatus.EXPIRED), 'the link expires', 3000);
    const late = guest.walk.createGuest(shortLived.state.code, opener());
    await late.start();
    assert(late.state.failure === WalkTogetherFailure.NOT_FOUND, 'and an expired link finds nobody');
    console.log('✓ an unpublished World, a signed-out host, no rendezvous server, a bad link and an expired one each end clearly');
    for (const person of [host, signedOut, offline, guest, expiring]) person.dispose();
}

assert(WALK_TOGETHER_PROTOCOL === 'forkbuild:walk-together', 'the protocol is namespaced');
console.log('Walk together tests passed.');
