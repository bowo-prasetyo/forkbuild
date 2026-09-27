import { buildPeople, filterPeople } from '../ui/views/peerConnections/people.js';
import { shortId } from '../ui/views/peerConnections/presentation.js';
import { FriendshipState } from '../core/FriendshipState.js';
import { assert } from './support/Assert.js';

// The Peers page's People list merges Known Peers, friendships and live
// connections into one entry per identity.

const peer = (connectionId, identityId, alias = null) => ({ connectionId, remoteIdentity: { identityId }, alias });

{
    const phone = peer('c-phone', 'did:key:zBobPhone');
    const people = buildPeople({
        relationships: [{ identityId: 'did:key:zBob', alias: 'Bob' }, { identityId: 'did:key:zDave', alias: null }],
        friendships: [
            { identityId: 'did:key:zBob', status: FriendshipState.FRIEND },
            { identityId: 'did:key:zCarol', status: FriendshipState.FRIEND },
            { identityId: 'did:key:zErin', status: FriendshipState.REQUESTED }
        ],
        blockedIds: new Set(['did:key:zDave']),
        authenticatedPeers: [phone, peer('c-frank', 'did:key:zFrank', 'Frankie')],
        // Bob is online from an authorized device whose own key differs.
        connectedPeersFor: (identityId) => (identityId === 'did:key:zBob' ? [phone] : [])
    });
    const ids = people.map((p) => p.identityId);

    assert(JSON.stringify(ids) === JSON.stringify(['did:key:zBob', 'did:key:zFrank', 'did:key:zCarol', 'did:key:zDave']),
        `one entry each, online first then friends then the rest, got ${ids.join(', ')}`);
    const bob = people[0];
    assert(bob.isKnown && bob.isFriend && bob.isOnline && bob.name === 'Bob', 'Bob merges his Known Peer, friendship and live connection');
    assert(!ids.includes('did:key:zBobPhone'), 'a connection claimed through device resolution never becomes a second card');
    assert(people[1].name === 'Frankie' && !people[1].isKnown && !people[1].isFriend, 'an unclaimed live connection is its own card, named by its connection label');
    assert(people[2].name === shortId('did:key:zCarol'), 'an unnamed friend falls back to her short ID');
    assert(!ids.includes('did:key:zErin'), 'a pending friend request alone, with no connection, is not a card');
    assert(people[3].isBlocked && !people[3].isOnline, 'blocked state rides along on the card');

    assert(JSON.stringify(filterPeople(people, 'friends').map((p) => p.identityId)) === JSON.stringify(['did:key:zBob', 'did:key:zCarol']), 'Friends filter');
    assert(JSON.stringify(filterPeople(people, 'online').map((p) => p.identityId)) === JSON.stringify(['did:key:zBob', 'did:key:zFrank']), 'Online filter');
    assert(filterPeople(people, 'all').length === 4, 'All filter');
    console.log('✓ People list: one entry per identity, device connections folded in, sorted and filterable');
}
