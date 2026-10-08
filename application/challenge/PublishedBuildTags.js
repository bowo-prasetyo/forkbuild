import { normalizeBuildTags } from '../../core/BuildTags.js';

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
