import { readFile } from 'node:fs/promises';
import {
    WorldDiscoveryInputKeys
} from '../core/WorldDiscoverySource.js';
import { describePeerWorldDiscoverySource } from '../peer/PeerWorldDataIngress.js';

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function connectedPeerOf(identityId) {
    return { remoteIdentity: identityId ? { identityId } : null };
}

// ---------------------------------------------------------------------
// 1. Flagship: one peer message crosses into one WorldDiscoverySource,
//    all six dimensions intact, records preserved by reference.
// ---------------------------------------------------------------------
{
    const publication = { id: 'pub-P2', title: 'P2' };
    const placement = { id: 'placement-P2', publicationId: 'pub-P2' };
    const anchor = { id: 'anchor-A2' };
    const snapshotPlacement = { id: 'snapshot-S2' };
    const avatarProfile = { id: 'avatar-Avatar-B', displayName: 'Avatar-B' };
    const avatarPresence = { avatarId: 'avatar-Avatar-B' };

    const message = {
        publications: [publication],
        placements: [placement],
        anchors: [anchor],
        snapshotPlacements: [snapshotPlacement],
        avatarProfiles: [avatarProfile],
        avatarPresences: [avatarPresence]
    };

    const source = describePeerWorldDiscoverySource(message, connectedPeerOf('did:key:zPeerA'));

    assert(source !== null, 'a message from an identified peer produces a source');
    assert(source.origin === 'peer:did:key:zPeerA', 'origin identifies the peer explicitly, prefixed "peer:"');
    assert(source.publications.length === 1 && source.publications[0] === publication, 'publications is carried by reference, unmodified');
    assert(source.placements.length === 1 && source.placements[0] === placement, 'placements is carried by reference, unmodified');
    assert(source.anchors.length === 1 && source.anchors[0] === anchor, 'anchors is carried by reference, unmodified');
    assert(source.snapshotPlacements.length === 1 && source.snapshotPlacements[0] === snapshotPlacement, 'snapshotPlacements is carried by reference, unmodified');
    assert(source.avatarProfiles.length === 1 && source.avatarProfiles[0] === avatarProfile, 'avatarProfiles is carried by reference, unmodified');
    assert(source.avatarPresences.length === 1 && source.avatarPresences[0] === avatarPresence, 'avatarPresences is carried by reference, unmodified');
    assert(Object.keys(source).filter((key) => key !== 'origin').length === WorldDiscoveryInputKeys.length, 'exactly the six named dimensions are present, no seventh field');

    console.log('✓ Flagship: one peer message crosses into one WorldDiscoverySource');
}

// ---------------------------------------------------------------------
// 2. No established identity: null, never throws
// ---------------------------------------------------------------------
{
    const message = { publications: [{ id: 'pub-1' }] };
    assert(describePeerWorldDiscoverySource(message, null) === null, 'no connectedPeer at all degrades to null');
    assert(describePeerWorldDiscoverySource(message, {}) === null, 'a connectedPeer with no remoteIdentity degrades to null');
    assert(describePeerWorldDiscoverySource(message, connectedPeerOf(null)) === null, 'a connectedPeer not yet AUTHENTICATED (null remoteIdentity) degrades to null');
    assert(describePeerWorldDiscoverySource(message, connectedPeerOf('')) === null, 'an empty-string identityId degrades to null');
    assert(describePeerWorldDiscoverySource(message, { remoteIdentity: { identityId: 42 } }) === null, 'a non-string identityId degrades to null');

    console.log('✓ No established identity: null, never throws');
}

// ---------------------------------------------------------------------
// 3. Missing or malformed payload: a valid, empty source, never a thrown
//    error and never a null result when identity IS known.
// ---------------------------------------------------------------------
{
    const peer = connectedPeerOf('did:key:zPeerB');

    const fromMissing = describePeerWorldDiscoverySource(undefined, peer);
    assert(fromMissing !== null, 'a missing message still produces a source, once identity is known');
    for (const key of WorldDiscoveryInputKeys) {
        assert(Array.isArray(fromMissing[key]) && fromMissing[key].length === 0, `missing message: "${key}" degrades to empty`);
    }

    const fromNull = describePeerWorldDiscoverySource(null, peer);
    assert(fromNull !== null && fromNull.origin === 'peer:did:key:zPeerB', 'a null message degrades to an empty, correctly-attributed source');

    const fromString = describePeerWorldDiscoverySource('not-an-object', peer);
    assert(fromString !== null, 'a structurally unusable (non-object) message degrades to an empty source rather than throwing');
    for (const key of WorldDiscoveryInputKeys) {
        assert(Array.isArray(fromString[key]) && fromString[key].length === 0, `non-object message: "${key}" degrades to empty`);
    }

    console.log('✓ Missing or malformed payload: a valid, empty source, never a thrown error');
}

// ---------------------------------------------------------------------
// 4. One malformed collection does not destroy unrelated valid ones
// ---------------------------------------------------------------------
{
    const publication = { id: 'pub-1' };
    const message = {
        publications: [publication],
        placements: 'not-an-array',
        anchors: null,
        snapshotPlacements: { not: 'an-array' },
        avatarProfiles: undefined,
        avatarPresences: 7
    };
    const source = describePeerWorldDiscoverySource(message, connectedPeerOf('did:key:zPeerC'));

    assert(source !== null, 'a mix of one valid and several malformed collections still produces a source');
    assert(source.publications.length === 1 && source.publications[0] === publication, 'the one valid collection survives untouched');
    assert(source.placements.length === 0, 'a malformed collection degrades to empty in isolation');
    assert(source.anchors.length === 0, 'a malformed collection degrades to empty in isolation');
    assert(source.snapshotPlacements.length === 0, 'a malformed collection degrades to empty in isolation');
    assert(source.avatarProfiles.length === 0, 'a malformed collection degrades to empty in isolation');
    assert(source.avatarPresences.length === 0, 'a malformed collection degrades to empty in isolation');

    console.log('✓ One malformed collection does not destroy unrelated valid ones');
}

// ---------------------------------------------------------------------
// 5. Two peers stay independent: this file never combines sources
// ---------------------------------------------------------------------
{
    const sourceA = describePeerWorldDiscoverySource(
        { publications: [{ id: 'a-pub' }] },
        connectedPeerOf('did:key:zAlice')
    );
    const sourceB = describePeerWorldDiscoverySource(
        { publications: [{ id: 'b-pub' }] },
        connectedPeerOf('did:key:zBob')
    );

    assert(sourceA.origin !== sourceB.origin, 'two peers keep their own distinct origin');
    assert(sourceA.publications[0].id === 'a-pub' && sourceB.publications[0].id === 'b-pub', 'one peer\'s records never leak into the other\'s source');

    console.log('✓ Two peers stay independent: this file never combines sources');
}

// ---------------------------------------------------------------------
// 6. Architectural regression: forbidden imports and vocabulary
// ---------------------------------------------------------------------
{
    const sourceUrl = new URL('../peer/PeerWorldDataIngress.js', import.meta.url);
    const fullSource = await readFile(sourceUrl, 'utf8');
    const codeOnly = fullSource
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n');

    // No WorldEncounter import or invocation of any kind.
    assert(!codeOnly.includes('WorldEncounter'), 'peer/PeerWorldDataIngress.js code must never reference WorldEncounter');
    assert(!codeOnly.includes('deriveWorldEncounters'), 'peer/PeerWorldDataIngress.js code must never call deriveWorldEncounters');

    // No storage of any kind.
    assert(!codeOnly.includes('StorageProvider'), 'peer/PeerWorldDataIngress.js code must never reference StorageProvider');
    assert(!/\blocalStorage\b/.test(codeOnly), 'peer/PeerWorldDataIngress.js code must never reference localStorage');

    // No source combination.
    const combinationTerms = ['combine', 'merge', 'reconcile', 'dedup'];
    for (const term of combinationTerms) {
        assert(!codeOnly.toLowerCase().includes(term), `peer/PeerWorldDataIngress.js code must never use the word "${term}"`);
    }

    // No trust/authority vocabulary of any kind.
    const trustTerms = ['trusted', 'trust(', 'reputation', 'verified', 'verify(', 'authority', 'score', 'weight', 'confidence'];
    for (const term of trustTerms) {
        assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `peer/PeerWorldDataIngress.js code must never use the word "${term}"`);
    }

    // No rebroadcast: never imports the message bus and never sends anything.
    assert(!codeOnly.includes('PeerMessageBus'), 'peer/PeerWorldDataIngress.js code must never import PeerMessageBus');
    assert(!/\.send\(/.test(codeOnly), 'peer/PeerWorldDataIngress.js code must never call .send(...)');

    // No network connection establishment.
    const connectionTerms = ['PeerConnectionProvider', 'WebRtcPeerConnection', 'RTCPeerConnection', 'fetch(', 'WebSocket'];
    for (const term of connectionTerms) {
        assert(!codeOnly.includes(term), `peer/PeerWorldDataIngress.js code must never reference "${term}"`);
    }

    console.log('✓ Architectural regression: forbidden imports and vocabulary');
}

console.log('\nAll peer world data ingress tests passed.');
