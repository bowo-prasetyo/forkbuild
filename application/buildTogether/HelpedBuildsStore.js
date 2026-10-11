import { StorageProvider } from '../../storage/StorageProvider.js';

const KEY_PREFIX = 'helped-builds:';
const MAX_ENTRIES = 100;
const MAX_TEXT_LENGTH = 120;

// The builds someone helped make on this device (Build with me): each one
// whose author credited this identity while they built together
// (application/buildTogether/BuildTogetherSession.js), kept per identity, on
// this device only, newest first. A build credited only after it is
// published is found through its Publication instead (ui/views/
// RecentWorldsView.js lists both).
export class HelpedBuildsStore {
    constructor({ storageProvider }) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('HelpedBuildsStore requires a StorageProvider');
        }
        this._storage = storageProvider;
    }

    // `identityId` helped make `documentId`: remembered, or moved to the top
    // with what is known of it now.
    note(identityId, { documentId, title = null, authorName = null, authorIdentityId = null, at = new Date() } = {}) {
        if (!identityId || typeof documentId !== 'string' || !documentId) return false;
        const entry = Object.freeze({
            documentId,
            title: cleanText(title),
            authorName: cleanText(authorName),
            authorIdentityId: typeof authorIdentityId === 'string' && authorIdentityId ? authorIdentityId : null,
            at: new Date(at).toISOString()
        });
        const earlier = this.list(identityId).find((known) => known.documentId === documentId);
        const merged = earlier
            ? Object.freeze({ ...entry, title: entry.title || earlier.title, authorName: entry.authorName || earlier.authorName, authorIdentityId: entry.authorIdentityId || earlier.authorIdentityId })
            : entry;
        const rest = this.list(identityId).filter((known) => known.documentId !== documentId);
        try {
            this._storage.save(KEY_PREFIX + identityId, [merged, ...rest].slice(0, MAX_ENTRIES));
            return true;
        } catch {
            return false;
        }
    }

    // What `identityId` helped make, newest first.
    list(identityId) {
        if (!identityId) return [];
        let stored;
        try {
            stored = this._storage.load(KEY_PREFIX + identityId);
        } catch {
            stored = null;
        }
        if (!Array.isArray(stored)) return [];
        return stored
            .filter((entry) => entry && typeof entry.documentId === 'string' && entry.documentId)
            .map((entry) => Object.freeze({
                documentId: entry.documentId,
                title: cleanText(entry.title),
                authorName: cleanText(entry.authorName),
                authorIdentityId: typeof entry.authorIdentityId === 'string' ? entry.authorIdentityId : null,
                at: typeof entry.at === 'string' ? entry.at : null
            }));
    }
}

function cleanText(value) {
    if (typeof value !== 'string') return null;
    const text = value.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_LENGTH);
    return text || null;
}
