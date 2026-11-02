import { normalizeBuildTags } from '../../core/document/BuildTags.js';
import { isStorageEntryNotLoadedError } from '../../storage/StorageEntryNotLoadedError.js';

const SNAPSHOT_KEY_PREFIX = 'snapshot:';

// The tags a published build carries: those in its snapshot on this device
// (publisher/LocalPublisherProvider.js), which is what was signed and
// published, not the editable document's tags since. [] when this device
// has no snapshot of it.
export function publishedBuildTags(storageProvider, publicationId) {
    if (typeof publicationId !== 'string' || !publicationId) return [];
    let snapshot;
    try {
        snapshot = storageProvider.load(SNAPSHOT_KEY_PREFIX + publicationId);
    } catch {
        return [];
    }
    return normalizeBuildTags(snapshot?.metadata?.tags);
}

// publishedBuildTags(), for a caller that can wait: `{ tags }` when the
// snapshot is in memory (or there is none), `{ pending }` when it is on disk
// only (IndexedDB keeps snapshots there until read: storage/
// IndexedDbStorageBackend.js), a promise for its tags, [] if the read fails.
// publishedBuildTags() reads such a snapshot as no tags at all.
export function readPublishedBuildTags(storageProvider, publicationId) {
    if (typeof publicationId !== 'string' || !publicationId) return { tags: [] };
    try {
        return { tags: normalizeBuildTags(storageProvider.load(SNAPSHOT_KEY_PREFIX + publicationId)?.metadata?.tags) };
    } catch (error) {
        if (isStorageEntryNotLoadedError(error) && error.ready) {
            return { pending: Promise.resolve(error.ready).then((snapshot) => normalizeBuildTags(snapshot?.metadata?.tags), () => []) };
        }
        return { tags: [] };
    }
}
