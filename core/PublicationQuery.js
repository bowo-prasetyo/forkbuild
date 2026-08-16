import { DEFAULT_PUBLICATION_SORT } from './PublicationSort.js';

export const DEFAULT_PAGE_SIZE = 20;

// 0.2.31 — a catalog query is a plain, immutable value: what to look
// for, how to order it, and which page to return. Deliberately
// APPLICATION-level, not tied to how any particular discovery provider
// happens to store or fetch publications — see
// application/SearchPublicationsUseCase.js's own comment for why
// `page`/`pageSize` are page-NUMBER based rather than a raw
// OFFSET/LIMIT the UI computes itself: this leaves room for a future
// decentralized provider to answer the SAME query shape via
// cursor-based continuation without any caller needing to change.
//
// `author` scopes the query to one author's publications — this is
// the ONLY difference between what RepositoryView and AuthorView ask
// for; see ui/components/PublicationCatalog.js.
//
// `includeDescriptions` is OFF by default: matching a search term
// against a publication's description requires loading that
// publication's full Document (descriptions are not part of the
// lightweight Publication record — see docs/Principles.md, "A
// Publication Is What; A Placement Is Where," extended by 0.2.31's own
// "Description Search Is Opt-In, Not Silent, Because It Has A Real
// Cost"). Title/author matching never requires this and is always on.
export class PublicationQuery {
    constructor({
        text = '',
        author = null,
        sort = DEFAULT_PUBLICATION_SORT,
        page = 1,
        pageSize = DEFAULT_PAGE_SIZE,
        includeDescriptions = false
    } = {}) {
        this.text = text || '';
        this.author = author || null;
        this.sort = sort;
        this.page = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
        this.pageSize = Number.isFinite(pageSize) && pageSize >= 1 ? Math.floor(pageSize) : DEFAULT_PAGE_SIZE;
        this.includeDescriptions = !!includeDescriptions;
    }

    // Convenience for "the same query, but page N" — the toolbar/
    // pagination controls never build a PublicationQuery from scratch,
    // they derive one from whatever's currently active so text/sort/
    // scope are never accidentally dropped by a page click.
    withPage(page) {
        return new PublicationQuery({ ...this, page });
    }
}
