// The Publications found on the networks under a week's challenge tag
// (application/challenge/ChallengeEntryDiscovery.js), kept on this device per
// tag so the challenge page lists them again without searching first. Ids
// only: the Publications themselves are kept by the Repository's discovery.
export const CHALLENGE_ENTRY_LOG_KEY_PREFIX = 'challenge-entries:';
export const MAX_LOGGED_ENTRIES = 500;

export class ChallengeEntryLog {
    constructor(storageProvider) {
        this._storageProvider = storageProvider;
    }

    // The ids found under `tag`, oldest first.
    list(tag) {
        if (!isNonEmptyString(tag)) return [];
        let stored;
        try {
            stored = this._storageProvider.load(CHALLENGE_ENTRY_LOG_KEY_PREFIX + tag);
        } catch {
            return [];
        }
        return Array.isArray(stored) ? stored.filter(isNonEmptyString) : [];
    }

    // Adds the ids not already logged under `tag`, keeping the newest
    // MAX_LOGGED_ENTRIES. Returns how many were new.
    add(tag, publicationIds) {
        if (!isNonEmptyString(tag) || !Array.isArray(publicationIds)) return 0;
        const ids = this.list(tag);
        const added = publicationIds.filter((id, index) => isNonEmptyString(id) && !ids.includes(id) && publicationIds.indexOf(id) === index);
        if (added.length === 0) return 0;
        this._storageProvider.save(CHALLENGE_ENTRY_LOG_KEY_PREFIX + tag, [...ids, ...added].slice(-MAX_LOGGED_ENTRIES));
        return added.length;
    }
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}
