// A network's writer: publishing, announcing, storing or anchoring on it,
// with any wallet that takes (docs/Pillars.md, "Networks: readers and
// writers"). A writer is a plugin a player switches on; its reader (finding,
// fetching and checking what is on that network) runs in every copy whatever
// is switched on.
//
// Pure: which writers exist and how a saved choice is read.

// Bitcoin and Base anchor through a wallet the player connects; their wallet
// steps are their writers.
export const NetworkWriter = Object.freeze({
    BITCOIN: 'bitcoin',
    BASE: 'base'
});

export const NETWORK_WRITERS = Object.freeze(Object.values(NetworkWriter));

export function isNetworkWriter(id) {
    return NETWORK_WRITERS.includes(id);
}

// Which writers this device has switched on. Off until switched on; read
// leniently, so a damaged value switches nothing on.
export function normalizeNetworkWriterSettings(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return Object.freeze(Object.fromEntries(NETWORK_WRITERS.map((id) => [id, source[id] === true])));
}
