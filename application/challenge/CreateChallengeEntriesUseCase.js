import { CreateDiscoveryUseCase } from '../discovery/CreateDiscoveryUseCase.js';
import { LocalStorageProvider } from '../../storage/LocalStorageProvider.js';
import { listChallengeEntries } from './ChallengeEntries.js';
import { readPublishedBuildTags } from './PublishedBuildTags.js';

// What the challenge page lists a week's entries from: the Publications the
// Repository knows of (this device's own and those found elsewhere), each
// one's tags read from its snapshot once, and the entry log
// (application/challenge/ChallengeEntryLog.js).
//
// In the app most snapshots are on disk only until read (IndexedDB keeps
// them there: storage/IndexedDbStorageBackend.js), so listEntries() starts
// reading those and leaves their builds out for now; whenTagsLoaded() says
// when they are in, after which listEntries() includes them. loadEntries()
// does both, for a caller that would rather wait than list twice.
export class CreateChallengeEntriesUseCase {
    execute({ decentralizedDiscoveryProvider = null, entryLog = null, storageProvider = new LocalStorageProvider() } = {}) {
        const { discoveryProvider } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider });
        // A snapshot never changes, so its tags are read once per page.
        const tagsByPublication = new Map();
        // Publication id -> the read of its snapshot from disk, while it runs.
        const reading = new Map();
        const tagsOf = (publication) => {
            const id = publication.id;
            if (tagsByPublication.has(id)) return tagsByPublication.get(id);
            if (reading.has(id)) return [];
            const read = readPublishedBuildTags(storageProvider, id);
            if (!read.pending) {
                tagsByPublication.set(id, read.tags);
                return read.tags;
            }
            reading.set(id, read.pending.then((tags) => {
                tagsByPublication.set(id, tags);
                reading.delete(id);
            }));
            return [];
        };
        const listEntries = (tag) => listChallengeEntries({
            publications: discoveryProvider.list(),
            tag,
            tagsOf,
            loggedIds: entryLog ? entryLog.list(tag) : []
        });
        // null when nothing is being read; otherwise a promise that resolves
        // once every snapshot listEntries() started reading is in.
        const whenTagsLoaded = () => (reading.size > 0 ? Promise.all([...reading.values()]).then(() => undefined) : null);
        return {
            discoveryProvider,
            listEntries,
            whenTagsLoaded,
            loadEntries: async (tag) => {
                const entries = listEntries(tag);
                const loading = whenTagsLoaded();
                if (!loading) return entries;
                await loading;
                return listEntries(tag);
            }
        };
    }
}
