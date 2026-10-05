import { BLURT_CATEGORY, blurtFamilyTag, isBlurtFamily, parseBlurtBuildPost } from '../../core/BlurtPost.js';
import { DEFAULT_BLURT_EARLIEST_PERIOD, isBlurtPeriod } from '../../core/BlurtReadingConfiguration.js';
import { parseBlurtTime } from '../../blurt/BlurtRpcClient.js';

// Reads one family's announcements from Blurt build posts (docs/Protocol.md,
// "Proposed: Blurt Substrate", "Reading"). Nexus, Blurt's indexer, lists
// every post under the family's tag, paid out or not, so when a node serves
// it nothing else is read. Otherwise the reader falls back to the chain's
// own tag listing, which keeps a post only until it pays out (7 days), and
// the post histories of followed accounts and of every account seen posting
// a build post. It returns candidates only: each envelope still goes through
// its family's own parser and verifier.

export const BlurtDiscoveryReadOutcome = Object.freeze({
    FOUND: 'found',
    EMPTY: 'empty',
    UNAVAILABLE: 'unavailable'
});

const PAGE_SIZE = 100;
export const DEFAULT_BLURT_MAX_TAG_PAGES = 10;
export const DEFAULT_BLURT_MAX_AUTHOR_PAGES = 5;
export const DEFAULT_BLURT_MAX_NEXUS_PAGES = 20;
const DEFAULT_CONCURRENCY = 4;
// A tag listing changes as people post; an author's history rarely does.
const DEFAULT_TAG_CACHE_MS = 30 * 1000;
const DEFAULT_AUTHOR_CACHE_MS = 10 * 60 * 1000;

// `knownAuthors` (storage/BlurtKnownAuthorStore.js), when given, remembers
// the accounts seen in tag listings.
export function createBlurtDiscoveryReader({
    rpc,
    followedAccounts = [],
    knownAuthors = null,
    earliestPeriod = DEFAULT_BLURT_EARLIEST_PERIOD,
    clock = () => Date.now(),
    maxTagPages = DEFAULT_BLURT_MAX_TAG_PAGES,
    maxAuthorPages = DEFAULT_BLURT_MAX_AUTHOR_PAGES,
    maxNexusPages = DEFAULT_BLURT_MAX_NEXUS_PAGES,
    concurrency = DEFAULT_CONCURRENCY,
    tagCacheMs = DEFAULT_TAG_CACHE_MS,
    authorCacheMs = DEFAULT_AUTHOR_CACHE_MS
} = {}) {
    if (!rpc || typeof rpc.getDiscussionsByCreated !== 'function' || typeof rpc.getDiscussionsByAuthorBeforeDate !== 'function') {
        throw new TypeError('a Blurt RPC client with getDiscussionsByCreated() and getDiscussionsByAuthorBeforeDate() is required');
    }
    const followed = Object.freeze([...new Set(Array.isArray(followedAccounts) ? followedAccounts : [])]);
    const earliestMs = isBlurtPeriod(earliestPeriod) ? Date.parse(`${earliestPeriod}-01T00:00:00Z`) : -Infinity;
    const cache = new Map();

    async function cached(key, maxAgeMs, load) {
        const entry = cache.get(key);
        if (entry && clock() - entry.at < maxAgeMs) return entry.posts;
        const posts = await load();
        cache.set(key, { at: clock(), posts });
        return posts;
    }

    // Every top-level post under `tag` back to the earliest month, from
    // Nexus. Rejects when no node serves it.
    function nexusPosts(tag) {
        return cached(`nexus:${tag}`, tagCacheMs, async () => {
            if (typeof rpc.getRankedPosts !== 'function') throw new Error('no Nexus client');
            const posts = [];
            let start = null;
            for (let page = 0; page < maxNexusPages; page += 1) {
                const batch = await rpc.getRankedPosts({ tag, limit: PAGE_SIZE, start });
                if (!Array.isArray(batch)) throw new Error(`bridge.get_ranked_posts for ${tag} did not return a list`);
                posts.push(...batch.filter((post) => !(start && post?.author === start.author && post?.permlink === start.permlink)).map(fromNexus));
                const last = batch[batch.length - 1];
                if (batch.length < PAGE_SIZE || !last || parseBlurtTime(last.created) < earliestMs) break;
                start = { author: last.author, permlink: last.permlink };
            }
            return posts;
        });
    }

    function tagPosts(tag) {
        return cached(`tag:${tag}`, tagCacheMs, async () => {
            const posts = [];
            let start = null;
            for (let page = 0; page < maxTagPages; page += 1) {
                const batch = await rpc.getDiscussionsByCreated({ tag, limit: PAGE_SIZE, start });
                if (!Array.isArray(batch)) throw new Error(`get_discussions_by_created for ${tag} did not return a list`);
                // A page after the first starts with the post it continues from.
                posts.push(...(start ? batch.filter((post) => !(post?.author === start.author && post?.permlink === start.permlink)) : batch));
                if (batch.length < PAGE_SIZE) break;
                const last = batch[batch.length - 1];
                start = { author: last.author, permlink: last.permlink };
            }
            return posts;
        });
    }

    // An account's top-level posts, newest edit first, back to the earliest
    // month. Nothing in the listing is older than the last post's update.
    function authorPosts(author) {
        return cached(`author:${author}`, authorCacheMs, async () => {
            const posts = [];
            let startPermlink = '';
            for (let page = 0; page < maxAuthorPages; page += 1) {
                const batch = await rpc.getDiscussionsByAuthorBeforeDate(author, { startPermlink, limit: PAGE_SIZE });
                if (!Array.isArray(batch)) throw new Error(`get_discussions_by_author_before_date for @${author} did not return a list`);
                posts.push(...batch.filter((post) => post?.permlink !== startPermlink));
                const last = batch[batch.length - 1];
                if (batch.length < PAGE_SIZE || !last || parseBlurtTime(last.last_update ?? last.created) < earliestMs) break;
                startPermlink = last.permlink;
            }
            return posts.filter((post) => post?.parent_permlink === BLURT_CATEGORY);
        });
    }

    // Resolves to `{ outcome, announcements, sourcesRead, sourcesUnavailable }`
    // and never rejects: a source that can't be read is counted, not
    // thrown. Each announcement is `{ envelope, author, permlink, created }`.
    async function read(family) {
        if (!isBlurtFamily(family)) throw new TypeError(`unknown Blurt family: ${family}`);
        const tag = blurtFamilyTag(family);
        const unavailable = [];
        const buildPosts = new Map();
        const keep = (post) => {
            const parsed = parseBlurtBuildPost(post);
            if (parsed && !buildPosts.has(`${parsed.author}/${parsed.permlink}`)) buildPosts.set(`${parsed.author}/${parsed.permlink}`, parsed);
            return parsed;
        };

        let nexusRead = false;
        let tagRead = false;
        let authorsRead = 0;
        try {
            const seen = (await nexusPosts(tag)).map(keep).filter(Boolean).map(({ author }) => author);
            nexusRead = true;
            // Kept for the fallback, should Nexus be unavailable later.
            if (seen.length > 0) knownAuthors?.remember(seen);
        } catch (error) {
            unavailable.push({ source: `nexus #${tag}`, reason: error?.message ?? String(error) });
        }

        if (!nexusRead) {
            try {
                const seen = (await tagPosts(tag)).map(keep).filter(Boolean).map(({ author }) => author);
                tagRead = true;
                if (seen.length > 0) knownAuthors?.remember(seen);
            } catch (error) {
                unavailable.push({ source: `#${tag}`, reason: error?.message ?? String(error) });
            }

            const authors = [...new Set([...followed, ...(knownAuthors?.list() ?? [])])];
            await forEachLimited(authors, concurrency, async (author) => {
                try {
                    (await authorPosts(author)).forEach(keep);
                    authorsRead += 1;
                } catch (error) {
                    unavailable.push({ source: `@${author}`, reason: error?.message ?? String(error) });
                }
            });
        }

        const announcements = [];
        for (const post of buildPosts.values()) {
            for (const entry of post.announcements) {
                if (entry.family === family) announcements.push(Object.freeze({ envelope: entry.envelope, author: post.author, permlink: post.permlink, created: post.created }));
            }
        }
        // Sources are read in parallel; report in a stable order regardless.
        announcements.sort((a, b) => compare(a.created ?? '', b.created ?? '') || compare(a.author, b.author) || compare(a.permlink, b.permlink));

        const sourcesRead = (nexusRead ? 1 : 0) + (tagRead ? 1 : 0) + authorsRead;
        return Object.freeze({
            outcome: sourcesRead === 0
                ? BlurtDiscoveryReadOutcome.UNAVAILABLE
                : (announcements.length > 0 ? BlurtDiscoveryReadOutcome.FOUND : BlurtDiscoveryReadOutcome.EMPTY),
            announcements: Object.freeze(announcements),
            sourcesRead,
            // Whether Nexus answered; when it did, nothing else was read.
            nexus: nexusRead,
            sourcesUnavailable: Object.freeze(unavailable)
        });
    }

    return Object.freeze({ read, followedAccounts: followed, earliestPeriod });
}

// Nexus leaves a top-level post's parent empty; its depth and category say
// what condenser_api would.
function fromNexus(post) {
    if (post && typeof post === 'object' && post.depth === 0 && typeof post.category === 'string') {
        return { ...post, parent_author: '', parent_permlink: post.category };
    }
    return post;
}

function compare(a, b) {
    return a < b ? -1 : (a > b ? 1 : 0);
}

async function forEachLimited(items, limit, task) {
    let next = 0;
    const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
        while (next < items.length) {
            const item = items[next];
            next += 1;
            await task(item);
        }
    });
    await Promise.all(workers);
}
