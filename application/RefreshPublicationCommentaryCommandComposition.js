// Publication Commentary — fetch-on-open and "Check for new comments".
//
// Posting a Commentary already publishes it to Nostr (and Arweave when
// chosen), but until now nothing in the running app ever fetched
// Commentary back from those networks: ui/main.js provided
// `discoverPublicationCommentaryFromNostrCommand` and
// `discoverPublicationCommentaryFromArweaveCommand`, and no screen called
// either. Only a peer that happened to be connected over WebRTC at the
// moment of posting ever delivered a remote Commentary, so a comment made
// while you were offline, or from another device, never appeared.
//
// application/DiscoverPublicationCommentaryFromNostrUseCase.js left WHEN
// to fetch as a separate product decision. The decision: fetch for one
// Publication when its Commentary is opened, and again whenever the
// viewer asks ("Check for new comments") — see
// ui/components/PublicationCommentaryRemoteCheck.js. Only Publications
// someone is actually looking at ever cause network requests.
//
//   ui/components/PublicationCommentaryRemoteCheck.js
//        │  refreshPublicationCommentaryCommand(publicationId)
//        ▼
//   composeRefreshPublicationCommentaryCommand({ sources })   ★ (THIS)
//        │  every source, side by side
//        ├──▶ discoverPublicationCommentaryFromNostrCommand(publicationId)
//        └──▶ discoverPublicationCommentaryFromArweaveCommand(publicationId)
//                 │  (each already verifies and imports into the SAME
//                 │   local Commentary store every screen reads, and
//                 │   already notifies the publisher of a new comment)
//                 ▼
//   { newCount, checked, failed }
//
// NEVER REJECTS. One network being unreachable must not hide what the
// other found, and a screen must never break because a relay or gateway
// is down: each source's failure is caught and reported by name in
// `failed`, never thrown.
//
// ONE REQUEST PER PUBLICATION AT A TIME. The same Publication can be open
// in more than one place at once (a Repository card and World View, say),
// so a check already in flight for a publicationId is shared with any
// caller asking for the same one, rather than hitting every network twice.
//
// COUNTS ONLY WHAT IS NEW. Each source returns `{ commentary, isNew }`
// entries; a Commentary already stored locally (isNew: false) — whether
// posted here, received from a peer, or fetched by an earlier check — is
// not counted, and the same Commentary found on both networks is counted
// once.

function describeSources(sources) {
    return (Array.isArray(sources) ? sources : [])
        .filter((source) => source && typeof source.name === 'string' && typeof source.discover === 'function');
}

// composeRefreshPublicationCommentaryCommand({ sources })
//   sources: [{ name: 'Nostr', discover: (publicationId) => Promise<{ commentary, isNew }[]> }, ...]
//   -> (publicationId) => Promise<{ newCount, checked: string[], failed: string[] }>
export function composeRefreshPublicationCommentaryCommand({ sources } = {}) {
    const usableSources = describeSources(sources);
    const inFlight = new Map();

    async function refresh(publicationId) {
        const settled = await Promise.allSettled(usableSources.map((source) => (
            Promise.resolve().then(() => source.discover(publicationId))
        )));
        const newCommentaryIds = new Set();
        const failed = [];
        settled.forEach((outcome, index) => {
            if (outcome.status === 'rejected') {
                failed.push(usableSources[index].name);
                return;
            }
            for (const entry of Array.isArray(outcome.value) ? outcome.value : []) {
                if (entry && entry.isNew && entry.commentary) {
                    newCommentaryIds.add(entry.commentary.commentaryId);
                }
            }
        });
        return Object.freeze({
            newCount: newCommentaryIds.size,
            checked: Object.freeze(usableSources.map((source) => source.name)),
            failed: Object.freeze(failed)
        });
    }

    return (publicationId) => {
        if (!publicationId || typeof publicationId !== 'string') {
            return Promise.resolve(Object.freeze({ newCount: 0, checked: Object.freeze([]), failed: Object.freeze([]) }));
        }
        if (inFlight.has(publicationId)) {
            return inFlight.get(publicationId);
        }
        const request = refresh(publicationId).finally(() => inFlight.delete(publicationId));
        inFlight.set(publicationId, request);
        return request;
    };
}
