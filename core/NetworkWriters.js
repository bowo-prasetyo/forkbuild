// A network's writer: publishing, announcing, storing or anchoring on it,
// with any wallet that takes (docs/Pillars.md, "Networks: readers and
// writers"). A writer is a plugin a player switches on; its reader (finding,
// fetching and checking what is on that network) runs in every copy whatever
// is switched on.
//
// Pure: which writers exist, how a saved choice is read, and which networks
// can be written to.

// Bitcoin and Base anchor through a wallet the player connects; their wallet
// steps are their writers. Steem and Blurt post through the player's account
// and Keychain: announcing builds, Snapshots, place names and comments,
// storing Snapshots, and anchoring are their writers.
export const NetworkWriter = Object.freeze({
    BITCOIN: 'bitcoin',
    BASE: 'base',
    STEEM: 'steem',
    BLURT: 'blurt'
});

export const NETWORK_WRITERS = Object.freeze(Object.values(NetworkWriter));

export function isNetworkWriter(id) {
    return NETWORK_WRITERS.includes(id);
}

// Which writers this device has switched on. A writer never switched either
// way is off, unless `defaults[id]` says otherwise (a device that already
// posts to Steem keeps doing so: application/settings/NetworkWriterSettingsStore.js).
// Read leniently, so a damaged value switches nothing on.
export function normalizeNetworkWriterSettings(value, defaults = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return Object.freeze(Object.fromEntries(NETWORK_WRITERS.map((id) => [
        id,
        typeof source[id] === 'boolean' ? source[id] : defaults[id] === true
    ])));
}

// Announcing networks (core/AnnouncementDiscoveryProvider.js) that need a
// writer switched on before anything is posted there. Nostr and Arweave are
// built in.
const ANNOUNCING_WRITERS = Object.freeze([NetworkWriter.STEEM, NetworkWriter.BLURT]);

// Whether `key` (an announcing network, a storage type or an anchor type) can
// be written to with these settings: always, unless it is a network whose
// writer is switched off.
export function isWritable(key, settings) {
    if (!ANNOUNCING_WRITERS.includes(key)) return true;
    return Boolean(settings && settings[key] === true);
}

// `keys` without the networks whose writer is switched off, in their order.
export function writableKeys(keys, settings) {
    return (Array.isArray(keys) ? keys : []).filter((key) => isWritable(key, settings));
}
