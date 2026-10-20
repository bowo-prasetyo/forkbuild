// 0.2.31 — the small, closed set of catalog sort orders, and the
// comparator that implements them.
//
// "Ordering must be deterministic" is the one hard rule here: if two
// replicas hold the same publications, sorting them must produce the
// SAME order on every replica, every time — otherwise two people
// looking at "page 3" would silently see different things, and
// pagination itself would become meaningless (an item could
// legitimately appear on two different pages, or none, depending on
// which replica answered). Two things make that true:
//
//   1. A deterministic SECONDARY key. `publishedAt` alone is not
//      unique — two publications can carry the exact same timestamp
//      (synthetic fixtures do this constantly, and nothing stops two
//      real publishes from landing in the same millisecond either).
//      Every comparator here falls back to `publicationId` — itself
//      already globally unique — so a tie NEVER produces an arbitrary
//      or insertion-order-dependent result.
//   2. ORDINAL string comparison, not locale-aware collation.
//      `String.prototype.localeCompare` is exactly the wrong tool
//      here even though it reads more "correct" for human sorting —
//      its result can differ by the calling browser/OS's configured
//      locale, which means the SAME two titles could sort differently
//      on two replicas simply because their users have different
//      language settings. Plain `<`/`>` on the raw strings is boring
//      but is the same answer everywhere, which is the property that
//      actually matters for a decentralized catalog.
export const PublicationSort = Object.freeze({
    RECENTLY_PUBLISHED: 'RECENTLY_PUBLISHED',
    OLDEST_PUBLISHED: 'OLDEST_PUBLISHED',
    TITLE_ASC: 'TITLE_ASC',
    TITLE_DESC: 'TITLE_DESC',
    AUTHOR_ASC: 'AUTHOR_ASC'
});

export const DEFAULT_PUBLICATION_SORT = PublicationSort.RECENTLY_PUBLISHED;

function compareOrdinal(a, b) {
    const x = a || '';
    const y = b || '';
    if (x < y) return -1;
    if (x > y) return 1;
    return 0;
}

// The deterministic secondary key every sort order falls back to.
// publicationId is compared ordinally for the same locale-independence
// reason titles/authors are — ids are typically UUIDs, where it barely
// matters, but there is no reason to special-case it.
function tiebreak(a, b) {
    return compareOrdinal(a.id, b.id);
}

export function comparePublications(a, b, sort = DEFAULT_PUBLICATION_SORT) {
    switch (sort) {
        case PublicationSort.OLDEST_PUBLISHED: {
            const diff = a.publishedAt.getTime() - b.publishedAt.getTime();
            return diff !== 0 ? diff : tiebreak(a, b);
        }
        case PublicationSort.TITLE_ASC: {
            const diff = compareOrdinal(a.title, b.title);
            return diff !== 0 ? diff : tiebreak(a, b);
        }
        case PublicationSort.TITLE_DESC: {
            const diff = compareOrdinal(b.title, a.title);
            return diff !== 0 ? diff : tiebreak(a, b);
        }
        case PublicationSort.AUTHOR_ASC: {
            const diff = compareOrdinal(a.author, b.author);
            return diff !== 0 ? diff : tiebreak(a, b);
        }
        case PublicationSort.RECENTLY_PUBLISHED:
        default: {
            // Newest first: descending timestamp.
            const diff = b.publishedAt.getTime() - a.publishedAt.getTime();
            return diff !== 0 ? diff : tiebreak(a, b);
        }
    }
}

// Human-readable labels for the toolbar's sort dropdown — kept next to
// the enum so the two can never silently drift apart.
export const PUBLICATION_SORT_LABELS = Object.freeze({
    [PublicationSort.RECENTLY_PUBLISHED]: 'Recently Published',
    [PublicationSort.OLDEST_PUBLISHED]: 'Oldest Published',
    [PublicationSort.TITLE_ASC]: 'Title A–Z',
    [PublicationSort.TITLE_DESC]: 'Title Z–A',
    [PublicationSort.AUTHOR_ASC]: 'Author A–Z'
});
