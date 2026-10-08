import { CreateDiscoveryUseCase } from '../discovery/CreateDiscoveryUseCase.js';
import { LocalStorageProvider } from '../../storage/LocalStorageProvider.js';
import { listChallengeEntries } from './ChallengeEntries.js';
import { publishedBuildTags } from './PublishedBuildTags.js';

// What the challenge page lists a week's entries from: the Publications the
// Repository knows of (this device's own and those found elsewhere), each
// one's tags read from its snapshot once, and the entry log
// (application/challenge/ChallengeEntryLog.js).
export class CreateChallengeEntriesUseCase {
    execute({ decentralizedDiscoveryProvider = null, entryLog = null } = {}) {
        const { discoveryProvider } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider });
        const storageProvider = new LocalStorageProvider();
        // A snapshot never changes, so its tags are read once per page.
        const tagsByPublication = new Map();
        const tagsOf = (publication) => {
            if (!tagsByPublication.has(publication.id)) tagsByPublication.set(publication.id, publishedBuildTags(storageProvider, publication.id));
            return tagsByPublication.get(publication.id);
        };
        return {
            discoveryProvider,
            listEntries: (tag) => listChallengeEntries({
                publications: discoveryProvider.list(),
                tag,
                tagsOf,
                loggedIds: entryLog ? entryLog.list(tag) : []
            })
        };
    }
}
