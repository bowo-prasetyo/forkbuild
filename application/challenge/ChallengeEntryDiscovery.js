import { RepositoryNetworkDiscovery } from '../publication/RepositoryNetworkDiscovery.js';
import { buildTagDiscoveryTag } from '../../core/NarrowDiscoveryTags.js';

// Finds a week's challenge entries on the networks: the Publication
// announcements carrying the week's `forkbuild-tag:` tag
// (core/NarrowDiscoveryTags.js), on the substrates that carry narrow tags
// (Nostr and Arweave). New ones are fetched and verified exactly as the
// Repository's network discovery does, and admitted to the Repository too;
// every entry found, new or already known, is logged under the tag
// (application/challenge/ChallengeEntryLog.js).
//
// An announcement's tag is its announcer's claim, like the global tag: a
// listed entry is a validly signed Publication, but whether it fits the
// theme is for whoever looks at it.
export class ChallengeEntryDiscovery {
    constructor({ services = [], materialSources, verifier, isKnown, admit, entryLog }) {
        this._options = { services, materialSources, verifier, isKnown, admit };
        this._entryLog = entryLog;
        // One per tag, so a record refused once isn't fetched again.
        this._discoveries = new Map();
    }

    // Resolves to { found, pending }: `found` the entries newly logged under
    // `tag`, `pending` the new leads left for a later run. Never throws.
    async run(tag) {
        const discoveryTag = buildTagDiscoveryTag(tag);
        if (!discoveryTag) return Object.freeze({ found: 0, pending: 0 });
        let discovery = this._discoveries.get(tag);
        if (!discovery) {
            discovery = new RepositoryNetworkDiscovery({ ...this._options, discoveryTag });
            this._discoveries.set(tag, discovery);
        }
        try {
            const result = await discovery.run();
            const ids = [...result.admitted.map((publication) => publication.id), ...(result.known || [])];
            let found = 0;
            try {
                found = this._entryLog.add(tag, ids);
            } catch {
                // Not logged: listed again only once found again.
            }
            return Object.freeze({ found, pending: result.pending });
        } catch {
            return Object.freeze({ found: 0, pending: 0 });
        }
    }
}
