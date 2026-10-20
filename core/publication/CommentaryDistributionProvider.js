import { ANNOUNCEMENT_DISCOVERY_PROVIDER_KEYS } from './AnnouncementDiscoveryProvider.js';

// Where a comment goes after it is saved on this device and announced to
// connected peers: one network, or none.
//
// LOCAL_AND_PEERS_ONLY keeps a comment off every network. It exists only for
// comments: Snapshots, claims and place names are always announced on a
// network, so it is never an Announcement / Discovery provider.
export const LOCAL_AND_PEERS_ONLY = 'peers';

export const COMMENTARY_DISTRIBUTION_PROVIDER_KEYS = Object.freeze([...ANNOUNCEMENT_DISCOVERY_PROVIDER_KEYS, LOCAL_AND_PEERS_ONLY]);

export function isValidCommentaryDistributionProvider(value) {
    return COMMENTARY_DISTRIBUTION_PROVIDER_KEYS.includes(value);
}

// The network a comment form starts on: the saved comment default when there
// is a valid one, else the Announcement / Discovery provider.
export function resolveCommentaryDistributionProvider({ commentaryPreference, announcementDiscoveryProvider }) {
    return isValidCommentaryDistributionProvider(commentaryPreference) ? commentaryPreference : announcementDiscoveryProvider;
}
