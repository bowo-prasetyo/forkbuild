// 0.2.31 — explicit Previous/Next + windowed page numbers, deliberately
// NOT infinite scroll. See docs/Principles.md, "Explicit Pagination
// Is A Decentralized Honesty Feature, Not Just A Layout Choice" — a
// person can point at "page 5" and mean something precise, which an
// infinitely-loading list makes much harder to talk about (page 5 of
// WHAT, exactly, and does it mean the same thing on another replica?).
//
// Pure presentation: receives the current page/totalPages/hasNext/
// hasPrevious from the host's PublicationPage result and emits `go`
// with the page number to switch to — it never knows how a page is
// actually fetched.
const WINDOW_RADIUS = 2; // how many page numbers to show on each side of the current one

export default {
    name: 'PublicationPagination',
    props: {
        page: { type: Number, required: true },
        totalPages: { type: Number, required: true },
        hasNext: { type: Boolean, default: false },
        hasPrevious: { type: Boolean, default: false }
    },
    emits: ['go'],
    computed: {
        // Always includes 1 and totalPages, plus a window around the
        // current page, with '…' markers filling any gap — e.g.
        // [1, '…', 48, 49, 50, 51, 52, '…', 125].
        pageWindow() {
            const total = this.totalPages;
            const current = this.page;
            if (total <= 1) return [1];

            const pages = new Set([1, total]);
            for (let p = current - WINDOW_RADIUS; p <= current + WINDOW_RADIUS; p++) {
                if (p >= 1 && p <= total) pages.add(p);
            }
            const sorted = Array.from(pages).sort((a, b) => a - b);

            const result = [];
            let previous = null;
            for (const p of sorted) {
                if (previous !== null && p - previous > 1) {
                    result.push('…');
                }
                result.push(p);
                previous = p;
            }
            return result;
        }
    },
    methods: {
        go(page) {
            if (page === '…' || page === this.page || page < 1 || page > this.totalPages) return;
            this.$emit('go', page);
        }
    },
    template: `
        <nav v-if="totalPages > 1" class="publication-pagination" aria-label="Pagination">
            <button
                class="action-btn"
                :disabled="!hasPrevious"
                @click="go(page - 1)"
            >← Previous</button>
            <span class="publication-pagination-pages">
                <button
                    v-for="(p, i) in pageWindow"
                    :key="i + '-' + p"
                    :class="['publication-pagination-page', { 'publication-pagination-page--current': p === page, 'publication-pagination-page--ellipsis': p === '…' }]"
                    :disabled="p === '…'"
                    @click="go(p)"
                >{{ p }}</button>
            </span>
            <button
                class="action-btn"
                :disabled="!hasNext"
                @click="go(page + 1)"
            >Next →</button>
        </nav>
    `
};
