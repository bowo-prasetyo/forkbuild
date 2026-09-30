import { FriendshipState } from '../../../core/FriendshipState.js';
import { shortId } from './presentation.js';
import { t } from '../../i18n/i18n.js';

// The Peers page's one People list: a card per identity, merging Known
// Peers, current friends and live authenticated connections. The records
// themselves stay separate (a Known Peer is a local note, a friendship is
// signed mutual consent); only the display is merged.
//
// `connectedPeersFor(identityId)` returns the live connections whose
// resolved identity is that one, so a friend connected from an authorized
// device still lands on the friend's card. Authenticated connections no
// card claims become cards of their own. Following only tags a card: someone
// you follow but have never connected to is listed on the Following page.
export function buildPeople({ relationships = [], friendships = [], blockedIds = new Set(), followedIds = new Set(), authenticatedPeers = [], connectedPeersFor = () => [] }) {
    const byId = new Map();
    const entryFor = (identityId) => {
        if (!byId.has(identityId)) {
            byId.set(identityId, { identityId, relationship: null, friendship: null, connectedPeers: [] });
        }
        return byId.get(identityId);
    };
    for (const relationship of relationships) {
        entryFor(relationship.identityId).relationship = relationship;
    }
    for (const friendship of friendships) {
        if (friendship.status === FriendshipState.FRIEND) {
            entryFor(friendship.identityId).friendship = friendship;
        }
    }

    const claimed = new Set();
    for (const entry of byId.values()) {
        entry.connectedPeers = connectedPeersFor(entry.identityId);
        for (const peer of entry.connectedPeers) {
            claimed.add(peer.connectionId);
        }
    }
    for (const peer of authenticatedPeers) {
        if (claimed.has(peer.connectionId) || !peer.remoteIdentity) {
            continue;
        }
        entryFor(peer.remoteIdentity.identityId).connectedPeers.push(peer);
        claimed.add(peer.connectionId);
    }

    const people = [...byId.values()].map((entry) => {
        const connectedPeer = entry.connectedPeers[0] || null;
        const alias = entry.relationship ? entry.relationship.alias : null;
        return {
            ...entry,
            connectedPeer,
            isOnline: entry.connectedPeers.length > 0,
            isKnown: !!entry.relationship,
            isFriend: !!entry.friendship,
            isBlocked: blockedIds.has(entry.identityId),
            isFollowing: followedIds.has(entry.identityId),
            alias,
            name: alias || (connectedPeer && connectedPeer.alias) || shortId(entry.identityId)
        };
    });
    return people.sort(comparePeople);
}

// Online first, then friends, then everyone else, then by name.
function comparePeople(a, b) {
    return (Number(b.isOnline) - Number(a.isOnline))
        || (Number(b.isFriend) - Number(a.isFriend))
        || a.name.localeCompare(b.name);
}

export const PEOPLE_FILTERS = [
    { key: 'all', label: t('peerConnections.all') },
    { key: 'friends', label: t('peerConnections.friends') },
    { key: 'following', label: t('peerConnections.following') },
    { key: 'online', label: t('peerConnections.online') }
];

export function filterPeople(people, filter) {
    if (filter === 'friends') return people.filter((person) => person.isFriend);
    if (filter === 'following') return people.filter((person) => person.isFollowing);
    if (filter === 'online') return people.filter((person) => person.isOnline);
    return people;
}
