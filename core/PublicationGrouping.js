// 0.2.31 — grouping is a PRESENTATION feature, never a storage
// concept: `groupPublications` takes whatever page of already-sorted
// items the catalog is currently showing and buckets them for
// display. Nothing here is persisted, nothing here changes what a
// PublicationPage contains, and nothing here is expected to be
// consistent across replicas the way sort order must be (see
// core/PublicationSort.js) — nothing sensitive rides on which visual
// bucket a card lands in, unlike which PAGE it lands on.
//
// Deliberately scoped to the CURRENT PAGE's items, not the whole
// catalog: grouping every one of 10,000 publications by author or
// date, independent of pagination, means a group can legitimately
// span multiple pages — a real UX question (does page 3 repeat "By
// Alice" if her publications spill across the page boundary?) this
// milestone does not attempt to answer. Grouping within a page is
// still genuinely useful (a "Recently Published" page naturally
// clusters by date already) without that added complexity.
export const GroupBy = Object.freeze({
    NONE: 'NONE',
    AUTHOR: 'AUTHOR',
    DATE: 'DATE',
    LICENSE: 'LICENSE'
});

const DAY_MS = 24 * 60 * 60 * 1000;

// Buckets relative to `now` — display-time only (see the module
// comment: this is presentation, not a replicated fact), matching how
// the existing UI already renders `publishedAt` via
// `toLocaleDateString()` rather than anything replicated.
function dateBucket(publishedAt, now) {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const days = Math.floor((startOfToday - new Date(publishedAt.getFullYear(), publishedAt.getMonth(), publishedAt.getDate()).getTime()) / DAY_MS);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days <= 7) return 'This Week';
    return 'Earlier';
}
const DATE_BUCKET_ORDER = ['Today', 'Yesterday', 'This Week', 'Earlier'];

function licenseLabel(publication) {
    if (!publication.license) return 'Unspecified';
    return publication.license.id || 'Unspecified';
}

// Returns an ordered array of { key, label, items } groups. Group
// ORDER follows first-appearance in the (already sorted) input for
// AUTHOR/LICENSE — grouping never re-sorts the page, it only
// partitions it — and a fixed Today/Yesterday/This Week/Earlier order
// for DATE, since an arbitrary first-appearance order would read
// strangely for a time-based grouping.
export function groupPublications(items, mode = GroupBy.NONE, { now = new Date() } = {}) {
    if (mode === GroupBy.NONE || !items || items.length === 0) {
        return items && items.length > 0 ? [{ key: 'all', label: null, items }] : [];
    }

    const groups = new Map();
    for (const publication of items) {
        let key;
        if (mode === GroupBy.AUTHOR) {
            key = publication.author || 'Anonymous';
        } else if (mode === GroupBy.DATE) {
            key = dateBucket(publication.publishedAt, now);
        } else if (mode === GroupBy.LICENSE) {
            key = licenseLabel(publication);
        } else {
            key = 'all';
        }
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key).push(publication);
    }

    if (mode === GroupBy.DATE) {
        return DATE_BUCKET_ORDER
            .filter((key) => groups.has(key))
            .map((key) => ({ key, label: key, items: groups.get(key) }));
    }
    return Array.from(groups.entries()).map(([key, groupItems]) => ({ key, label: key, items: groupItems }));
}
