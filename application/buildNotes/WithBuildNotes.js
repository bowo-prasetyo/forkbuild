// The Repository's and the challenge's searches, with build notes
// (core/publication/BuildNote.js) searched beside the other networks. Each search runs
// on its own, so a slow or failing one never holds the other up, and the
// results add together. Either side may be null.

// `{ run() }` resolving to `{ admitted, known, pending }`, as
// application/publication/RepositoryNetworkDiscovery.js does.
export function repositoryDiscoveryWithBuildNotes(networkDiscovery, buildNoteDiscovery) {
    return Object.freeze({
        async run() {
            const [networks, notes] = await Promise.all([
                settle(networkDiscovery ? () => networkDiscovery.run() : null),
                settle(buildNoteDiscovery ? () => buildNoteDiscovery.run() : null)
            ]);
            return Object.freeze({
                admitted: Object.freeze([...(networks?.admitted || []), ...(notes?.admitted || [])]),
                known: Object.freeze([...(networks?.known || []), ...(notes?.known || [])]),
                pending: (networks?.pending || 0) + (notes?.pending || 0)
            });
        }
    });
}

// `{ run(tag) }` resolving to `{ found, pending }`, as
// application/challenge/ChallengeEntryDiscovery.js does.
export function challengeDiscoveryWithBuildNotes(entryDiscovery, buildNoteDiscovery) {
    return Object.freeze({
        async run(tag) {
            const [networks, notes] = await Promise.all([
                settle(entryDiscovery ? () => entryDiscovery.run(tag) : null),
                settle(buildNoteDiscovery ? () => buildNoteDiscovery.run({ tag }) : null)
            ]);
            return Object.freeze({
                found: (networks?.found || 0) + (notes?.found || 0),
                pending: (networks?.pending || 0) + (notes?.pending || 0)
            });
        }
    });
}

async function settle(run) {
    if (!run) return null;
    try {
        return await run();
    } catch {
        return null;
    }
}
