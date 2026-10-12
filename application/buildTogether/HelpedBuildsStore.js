import { StorageProvider } from '../../storage/StorageProvider.js';

const KEY_PREFIX = 'helped-builds:';
const MAX_ENTRIES = 100;
const MAX_TEXT_LENGTH = 120;

// The builds someone helped make (Build with me): each one whose author
// credited this identity while they built together
// (application/buildTogether/BuildTogetherSession.js), kept per identity,
// newest first. Kept under the person's own identity (the one their devices
// share, DeviceAuthorizationPropagationUseCase#resolveOwnSocialIdentity()),
// so their other devices can be given it (HelpedBuildsSyncUseCase.js). A build credited only after it is
// published is found through its Publication instead (ui/views/
// RecentWorldsView.js lists both).
export class HelpedBuildsStore {
    constructor({ storageProvider }) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('HelpedBuildsStore requires a StorageProvider');
        }
        this._storage = storageProvider;
        this._listeners = new Set();
    }

    // callback(identityId, entry) for each build noted here (not for those
    // merged in from another device). Returns an unsubscribe function.
    onNoted(callback) {
        this._listeners.add(callback);
        return () => this._listeners.delete(callback);
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
        } catch {
            return false;
        }
        for (const listener of Array.from(this._listeners)) {
            try {
                listener(identityId, merged);
            } catch {
                // A listener's failure is its own.
            }
        }
        return true;
    }

    // Builds `identityId` helped make, as another of their devices knows
    // them: each kept by its newest note, what either knew of it kept.
    // Returns how many were new or newer here.
    merge(identityId, entries) {
        if (!identityId || !Array.isArray(entries)) return 0;
        const byDocument = new Map(this.list(identityId).map((entry) => [entry.documentId, entry]));
        let changed = 0;
        for (const raw of entries.slice(0, MAX_ENTRIES)) {
            if (!raw || typeof raw.documentId !== 'string' || !raw.documentId || raw.documentId.length > 200) continue;
            const at = new Date(raw.at);
            if (Number.isNaN(at.getTime())) continue;
            const incoming = {
                documentId: raw.documentId,
                title: cleanText(raw.title),
                authorName: cleanText(raw.authorName),
                authorIdentityId: typeof raw.authorIdentityId === 'string' && raw.authorIdentityId.length <= 200 ? raw.authorIdentityId : null,
                at: at.toISOString()
            };
            const known = byDocument.get(incoming.documentId);
            if (known && new Date(known.at).getTime() >= at.getTime()) continue;
            byDocument.set(incoming.documentId, known
                ? { ...incoming, title: incoming.title || known.title, authorName: incoming.authorName || known.authorName, authorIdentityId: incoming.authorIdentityId || known.authorIdentityId }
                : incoming);
            changed++;
        }
        if (changed === 0) return 0;
        const all = [...byDocument.values()].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, MAX_ENTRIES);
        try {
            this._storage.save(KEY_PREFIX + identityId, all);
        } catch {
            return 0;
        }
        return changed;
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
