// The substrates that can carry ForkBuild's announcements (Snapshots,
// publications, place names and comments) and be searched for them: the
// provider keys of the Announcement & Discovery role.
// application/discovery/AnnouncementDiscoveryProviderRegistry.js looks up
// what this device has set up for each.
export const ANNOUNCEMENT_DISCOVERY_PROVIDER_KEYS = Object.freeze(['nostr', 'arweave', 'steem', 'blurt']);

// Where announcements go when nothing, or nothing known, is saved.
export const DEFAULT_ANNOUNCEMENT_DISCOVERY_PROVIDER = 'nostr';

export function isAnnouncementDiscoveryProviderKey(value) {
    return ANNOUNCEMENT_DISCOVERY_PROVIDER_KEYS.includes(value);
}

// A saved provider key, or the default when it is missing or unknown.
export function announcementDiscoveryProviderOrDefault(value) {
    return isAnnouncementDiscoveryProviderKey(value) ? value : DEFAULT_ANNOUNCEMENT_DISCOVERY_PROVIDER;
}
