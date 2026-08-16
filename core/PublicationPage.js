// 0.2.31 — the result of a PublicationQuery: one page of items plus
// enough information to render pagination controls and an honest
// count, without the caller needing to re-derive any of it (or
// needing to know how the query was actually answered — see
// application/SearchPublicationsUseCase.js).
//
// `totalCount`/`totalPages` are included beyond the query.md mockup's
// minimal `items/page/pageSize/hasNext/hasPrevious` shape because the
// design's own mockup ("1,248 publications", "1 2 3 4 5 ... 125")
// needs them to render at all — a deliberate, small addition, not a
// deviation from the intent.
export class PublicationPage {
    constructor({
        items = [],
        page = 1,
        pageSize = 20,
        totalCount = 0,
        totalPages = 1,
        hasNext = false,
        hasPrevious = false
    } = {}) {
        this.items = items;
        this.page = page;
        this.pageSize = pageSize;
        this.totalCount = totalCount;
        this.totalPages = totalPages;
        this.hasNext = hasNext;
        this.hasPrevious = hasPrevious;
    }

    static empty(pageSize = 20) {
        return new PublicationPage({ items: [], page: 1, pageSize, totalCount: 0, totalPages: 1, hasNext: false, hasPrevious: false });
    }
}
