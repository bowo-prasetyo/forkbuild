// Which kind of data each storage entry holds, so a device backup can say
// what it contains and a restore can refuse names this version doesn't
// know. Every store's key or key prefix appears here once; a store added
// later must be added too, or its entries are backed up but skipped on
// restore (restoreDeviceBackup reports how many).

export const BackupEntryGroup = Object.freeze({
    DOCUMENTS: 'documents',
    IDENTITIES: 'identities',
    STRUCTURES: 'structures',
    PUBLICATIONS: 'publications',
    PEOPLE: 'people',
    CHAT: 'chat',
    AVATAR_AND_WORLDS: 'avatar-and-worlds',
    SETTINGS: 'settings',
    DOWNLOADED: 'downloaded',
    // Names this version doesn't know (from a newer version): backed up,
    // but never restored.
    OTHER: 'other'
});

// In the order the Your Data page lists them.
export const BACKUP_ENTRY_GROUP_LABELS = Object.freeze({
    [BackupEntryGroup.DOCUMENTS]: 'Documents and unsaved changes',
    [BackupEntryGroup.IDENTITIES]: 'Identities',
    [BackupEntryGroup.STRUCTURES]: 'My Structures',
    [BackupEntryGroup.PUBLICATIONS]: 'Your publications and evidence',
    [BackupEntryGroup.PEOPLE]: 'Peers, friends, follows and blocks',
    [BackupEntryGroup.CHAT]: 'Chat and notifications',
    [BackupEntryGroup.AVATAR_AND_WORLDS]: 'Avatar, places and Worlds visited',
    [BackupEntryGroup.SETTINGS]: 'Network settings',
    [BackupEntryGroup.DOWNLOADED]: 'Downloaded and indexed data',
    [BackupEntryGroup.OTHER]: 'Other data'
});

// Which identity is logged in. It is never backed up: a restored device
// starts logged out, and a stale session could name an identity the
// restore did not bring back.
export const SESSION_ENTRY_NAME = 'local-session';

// When this device was last backed up and its reminder and automatic
// backup settings (application/backup/BackupStatusStore.js). It describes
// this device, not the data, so it is neither backed up nor replaced.
export const BACKUP_STATUS_ENTRY_NAME = 'device-backup-status';

// Entries that belong to this device: never backed up or restored.
export const DEVICE_ONLY_ENTRY_NAMES = Object.freeze([SESSION_ENTRY_NAME, BACKUP_STATUS_ENTRY_NAME]);

// Published content, by hash: other people's builds as well as your own.
export const CONTENT_ENTRY_PREFIX = 'content:';
export const OWN_PUBLICATIONS_ENTRY_NAME = 'forkbuild-publications';
export const DOCUMENT_INDEX_ENTRY_NAME = 'forkbuild-index';
export const IDENTITY_INDEX_ENTRY_NAME = 'local-identities';

const EXACT_NAMES = new Map([
    [DOCUMENT_INDEX_ENTRY_NAME, BackupEntryGroup.DOCUMENTS],

    [IDENTITY_INDEX_ENTRY_NAME, BackupEntryGroup.IDENTITIES],
    ['local-identity', BackupEntryGroup.IDENTITIES],
    ['forkbuild-delegations', BackupEntryGroup.IDENTITIES],

    [OWN_PUBLICATIONS_ENTRY_NAME, BackupEntryGroup.PUBLICATIONS],
    ['publication-anchor-catalog:entries', BackupEntryGroup.PUBLICATIONS],
    ['publication-anchor-catalog:knowledge', BackupEntryGroup.PUBLICATIONS],
    ['publication-snapshot-placement-catalog:entries', BackupEntryGroup.PUBLICATIONS],
    ['publication-snapshot-placement-catalog:knowledge', BackupEntryGroup.PUBLICATIONS],
    ['publication-observation-archive', BackupEntryGroup.PUBLICATIONS],
    ['publication-commentary:entries', BackupEntryGroup.PUBLICATIONS],
    ['own-snapshot-distributions', BackupEntryGroup.PUBLICATIONS],
    ['own-commentary-distributions', BackupEntryGroup.PUBLICATIONS],
    ['forkbuild-unpublished-publications', BackupEntryGroup.PUBLICATIONS],

    ['public-lobby-display-name', BackupEntryGroup.PEOPLE],

    ['notification-events:entries', BackupEntryGroup.CHAT],

    ['avatar-inventory', BackupEntryGroup.AVATAR_AND_WORLDS],
    ['vehicle-runtime-instances', BackupEntryGroup.AVATAR_AND_WORLDS],
    ['animal-runtime-instances', BackupEntryGroup.AVATAR_AND_WORLDS],

    ['rendezvous-configuration', BackupEntryGroup.SETTINGS],
    ['ice-server-configuration', BackupEntryGroup.SETTINGS],
    ['turn-server-configuration', BackupEntryGroup.SETTINGS],
    ['ipfs-gateway-configuration', BackupEntryGroup.SETTINGS],
    ['ipfs-node-configuration', BackupEntryGroup.SETTINGS],
    ['ipfs-remote-pinning-settings', BackupEntryGroup.SETTINGS],
    ['arweave-gateway-configuration', BackupEntryGroup.SETTINGS],
    ['nostr-relay-configuration', BackupEntryGroup.SETTINGS],
    ['steem-reading-configuration', BackupEntryGroup.SETTINGS],
    ['steem-announcing-configuration', BackupEntryGroup.SETTINGS],
    ['blurt-reading-configuration', BackupEntryGroup.SETTINGS],
    ['blurt-announcing-configuration', BackupEntryGroup.SETTINGS],
    ['blurt-known-authors', BackupEntryGroup.SETTINGS],
    ['bitcoin-esplora-configuration', BackupEntryGroup.SETTINGS],
    ['role-provider-preference:by-role', BackupEntryGroup.SETTINGS],
    ['commentary-distribution-preference', BackupEntryGroup.SETTINGS],

    ['publication-catalog:entries', BackupEntryGroup.DOWNLOADED],
    ['world-encounter-publication-admission-log:entries', BackupEntryGroup.DOWNLOADED],
    ['spatial-index', BackupEntryGroup.DOWNLOADED],
    ['spatial-index-root', BackupEntryGroup.DOWNLOADED]
]);

const PREFIXES = [
    ['recovery:', BackupEntryGroup.DOCUMENTS],
    ['recovery-info:', BackupEntryGroup.DOCUMENTS],

    ['local-identity-key:', BackupEntryGroup.IDENTITIES],
    ['local-identity-revocation:', BackupEntryGroup.IDENTITIES],
    ['local-identity-succession:', BackupEntryGroup.IDENTITIES],
    ['local-device-authorizations:', BackupEntryGroup.IDENTITIES],

    ['personal-structure:', BackupEntryGroup.STRUCTURES],
    ['blueprint-usage:', BackupEntryGroup.STRUCTURES],
    ['blueprint-attributions:', BackupEntryGroup.STRUCTURES],
    ['blueprint-lineage-claims:', BackupEntryGroup.STRUCTURES],
    ['blueprint-attribution-publication-log:', BackupEntryGroup.STRUCTURES],

    ['snapshot:', BackupEntryGroup.PUBLICATIONS],
    ['publication-distribution-lifecycle:', BackupEntryGroup.PUBLICATIONS],
    ['steem-content-upload:', BackupEntryGroup.PUBLICATIONS],
    ['blurt-content-upload:', BackupEntryGroup.PUBLICATIONS],
    ['blurt-post-record:', BackupEntryGroup.PUBLICATIONS],

    ['peer-relationships:', BackupEntryGroup.PEOPLE],
    ['friend-relationships:', BackupEntryGroup.PEOPLE],
    ['follows:', BackupEntryGroup.PEOPLE],
    ['peer-blocks:', BackupEntryGroup.PEOPLE],
    ['world-membership:', BackupEntryGroup.PEOPLE],

    ['conversation-history:', BackupEntryGroup.CHAT],
    ['chat-outbox:', BackupEntryGroup.CHAT],
    ['chat-read-outbox:', BackupEntryGroup.CHAT],
    ['conversation-read-state:', BackupEntryGroup.CHAT],
    ['chat-remote-read-receipts:', BackupEntryGroup.CHAT],
    ['sibling-read-state:', BackupEntryGroup.CHAT],

    ['avatar-profile:', BackupEntryGroup.AVATAR_AND_WORLDS],
    ['profile-visibility:', BackupEntryGroup.AVATAR_AND_WORLDS],
    ['presence-visibility:', BackupEntryGroup.AVATAR_AND_WORLDS],
    ['place-name-preference:', BackupEntryGroup.AVATAR_AND_WORLDS],
    ['place-naming-claims:', BackupEntryGroup.AVATAR_AND_WORLDS],
    ['place-naming-publication-log:', BackupEntryGroup.AVATAR_AND_WORLDS],
    ['world-experience:', BackupEntryGroup.AVATAR_AND_WORLDS],

    [CONTENT_ENTRY_PREFIX, BackupEntryGroup.DOWNLOADED],
    ['announcement-index:', BackupEntryGroup.DOWNLOADED],
    ['announcement-watch:', BackupEntryGroup.DOWNLOADED],
    ['announcement-sync:', BackupEntryGroup.DOWNLOADED],
    ['challenge-entries:', BackupEntryGroup.DOWNLOADED],
    ['spatial-index-content:', BackupEntryGroup.DOWNLOADED],
    ['placement:', BackupEntryGroup.DOWNLOADED],
    ['placement-record:', BackupEntryGroup.DOWNLOADED],
    ['placement-history:', BackupEntryGroup.DOWNLOADED],
    ['placement-conflict:', BackupEntryGroup.DOWNLOADED],
    ['remote-identity-lifecycle:', BackupEntryGroup.DOWNLOADED],
    ['device-authority:', BackupEntryGroup.DOWNLOADED]
];

// A saved document is stored under its World's id, a UUID (core/createId.js).
const DOCUMENT_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The group an entry belongs to, or null for a name this version doesn't
// know (and for device-only entries, which are never backed up or restored).
export function backupEntryGroupOf(name) {
    if (typeof name !== 'string' || DEVICE_ONLY_ENTRY_NAMES.includes(name)) return null;
    if (EXACT_NAMES.has(name)) return EXACT_NAMES.get(name);
    const match = PREFIXES.find(([prefix]) => name.startsWith(prefix) && name.length > prefix.length);
    if (match) return match[1];
    return DOCUMENT_NAME.test(name) ? BackupEntryGroup.DOCUMENTS : null;
}
