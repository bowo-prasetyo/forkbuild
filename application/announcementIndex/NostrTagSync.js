import { withTimeout } from '../../utils/withTimeout.js';

export const DEFAULT_NOSTR_SYNC_PAGE_SIZE = 100;
export const DEFAULT_NOSTR_SYNC_MAX_PAGES = 5;
const DEFAULT_TIMEOUT_MS = 8000;

// Reads one relay's events for one sync target until this device has seen
// every one (docs/AnnouncementIndex.md, "Phase 3"). The cursor keeps:
//
//   newest        created_at of the newest event read with nothing missing below it
//   gap           { until, top } while newer events are still being paged down to `newest`
//   oldest        created_at of the oldest event read so far
//   backfillDone  true once a page older than `oldest` came back empty
//
// A page counts as the end only when it is EMPTY, never merely short:
// relays cap page sizes below what is asked for, and a short page would
// otherwise be mistaken for the end. Each run reads at most `maxPages`
// pages, so a large backlog is read over several runs. Events sharing a
// page boundary's second are read again rather than skipped (the index
// deduplicates them); only when more than a whole page shares one second
// can some of them be missed.
export async function syncNostrTag({
    queryImpl,
    relayUrl,
    target,
    cursorStore,
    pageSize = DEFAULT_NOSTR_SYNC_PAGE_SIZE,
    maxPages = DEFAULT_NOSTR_SYNC_MAX_PAGES,
    timeoutMs = DEFAULT_TIMEOUT_MS
}) {
    const cursorId = `nostr:${relayUrl}:${target.id}`;
    const cursor = { newest: null, gap: null, oldest: null, backfillDone: false, ...(cursorStore.get(cursorId) || {}) };
    const origin = 'nostr';
    let pages = 0;
    let received = 0;

    async function fetchPage({ since, until }) {
        const filter = { kinds: [...target.nostr.kinds], [`#${target.nostr.tagName}`]: [target.tag], limit: pageSize };
        if (Number.isFinite(since)) filter.since = since;
        if (Number.isFinite(until)) filter.until = until;
        pages += 1;
        const events = await withTimeout(queryImpl(relayUrl, filter), timeoutMs, 'syncNostrTag: relay query timed out');
        if (!Array.isArray(events)) throw new Error('syncNostrTag: relay query did not resolve to an array');
        const timed = events.filter((event) => event && Number.isFinite(event.created_at));
        const results = timed.map((event) => target.nostr.parse(event)).filter((result) => result !== null);
        if (results.length > 0) target.consume(results, origin);
        received += timed.length;
        const times = timed.map((event) => event.created_at);
        return { count: timed.length, min: times.length ? Math.min(...times) : null, max: times.length ? Math.max(...times) : null };
    }

    // Moves a page boundary down without skipping the other events that share
    // its second, unless the boundary did not move (a whole page shared that
    // second): then one second down, or paging would never advance.
    const nextBoundary = (min, previous) => (min === previous ? min - 1 : min);

    // Head: everything newer than `newest`, paged downwards until a page
    // reaches `newest`.
    while (pages < maxPages) {
        if (cursor.newest === null) {
            const page = await fetchPage({});
            if (page.count > 0) {
                cursor.newest = page.max;
                cursor.oldest = page.min;
            }
            break;
        }
        const until = cursor.gap ? cursor.gap.until : undefined;
        const page = await fetchPage({ since: cursor.newest, until });
        if (page.count === 0 || page.min <= cursor.newest) {
            if (cursor.gap) cursor.newest = cursor.gap.top;
            else if (page.count > 0) cursor.newest = Math.max(cursor.newest, page.max);
            cursor.gap = null;
            break;
        }
        cursor.gap = { until: nextBoundary(page.min, until), top: cursor.gap ? cursor.gap.top : page.max };
    }

    // Backfill: everything older than `oldest`, until a page comes back empty.
    while (!cursor.backfillDone && cursor.oldest !== null && pages < maxPages) {
        const page = await fetchPage({ until: cursor.oldest });
        if (page.count === 0) {
            cursor.backfillDone = true;
            break;
        }
        cursor.oldest = page.min < cursor.oldest ? page.min : cursor.oldest - 1;
    }

    cursorStore.set(cursorId, cursor);
    return { pages, received, caughtUp: cursor.gap === null && cursor.newest !== null, backfillDone: cursor.backfillDone };
}
