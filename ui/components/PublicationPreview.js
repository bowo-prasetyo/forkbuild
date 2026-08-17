import { PreviewType, derivePlaceholderPreview } from '../../core/DocumentPreview.js';

// "Near viewport" pre-fetch distance for IntersectionObserver — a card
// doesn't need to be literally on screen before its preview starts
// generating, just close enough that it likely will be by the time
// generation actually finishes. A card that never comes within this
// margin never requests anything at all — this IS the "visible cards
// first, near-viewport next, off-screen don't generate yet"
// prioritization the design asked for, expressed as one browser-native
// mechanism instead of a bespoke viewport-tracking system.
const ROOT_MARGIN = '200px';

// 0.2.31/0.2.32 — renders whatever preview is currently available for
// a publication. The deterministic PLACEHOLDER (a color + initial
// derived from the publication itself — see core/DocumentPreview.js)
// is shown immediately and unconditionally; it doubles as the loading
// state AND the permanent fallback if generation fails or no
// PreviewService is available, on purpose — a person browsing doesn't
// need to distinguish "hasn't started," "in progress," and "failed,"
// they just need the card to never be blank. Once a real THUMBNAIL
// becomes available (from cache, or freshly rendered), it replaces the
// placeholder.
//
// Lazy and cancellable: nothing is requested until this card is
// actually visible (or about to be), via IntersectionObserver; any
// in-flight or queued request is cancelled on unmount — which Vue
// triggers automatically the moment a page/search-query change
// removes this publication from the current page's v-for, so
// PublicationCatalog.js never has to explicitly track "the query
// changed, cancel everything for the old one."
export default {
    name: 'PublicationPreview',
    inject: {
        previewService: { default: null }
    },
    props: {
        publication: { type: Object, required: true },
        size: { type: String, default: 'card' } // 'card' | 'list'
    },
    data() {
        return {
            thumbnail: null, // DocumentPreview (THUMBNAIL) once available
            pending: false   // true only while a request is actually in flight (for a subtle "generating" affordance)
        };
    },
    computed: {
        placeholder() {
            return derivePlaceholderPreview(this.publication);
        },
        preview() {
            return this.thumbnail || this.placeholder;
        },
        isThumbnail() {
            return this.preview.type === PreviewType.THUMBNAIL && !!this.preview.image;
        },
        style() {
            return !this.isThumbnail ? { background: `hsl(${this.placeholder.seed}, 42%, 26%)` } : null;
        }
    },
    mounted() {
        if (!this.previewService) {
            return; // no service wired — stays on the placeholder forever, same as 0.2.31's behavior
        }

        const cached = this.previewService.getCached(this.publication.contentHash);
        if (cached) {
            this.thumbnail = cached;
            return;
        }

        this._observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
                this._requestPreview();
            }
        }, { rootMargin: ROOT_MARGIN });
        this._observer.observe(this.$el);
    },
    beforeUnmount() {
        this._disconnectObserver();
        if (this._cancelRequest) {
            this._cancelRequest();
            this._cancelRequest = null;
        }
    },
    methods: {
        _disconnectObserver() {
            if (this._observer) {
                this._observer.disconnect();
                this._observer = null;
            }
        },
        async _requestPreview() {
            this._disconnectObserver(); // one attempt per card is enough — the result gets cached regardless
            this.pending = true;
            const { promise, cancel } = this.previewService.request(this.publication);
            this._cancelRequest = cancel;
            const result = await promise;
            this._cancelRequest = null;
            this.pending = false;
            if (result) {
                this.thumbnail = result;
            }
        }
    },
    template: `
        <div
            :class="['publication-preview', 'publication-preview--' + size, { 'publication-preview--pending': pending }]"
            :style="style"
        >
            <img v-if="isThumbnail" :src="preview.image" class="publication-preview-image" alt="" />
            <span v-else class="publication-preview-label">{{ placeholder.label }}</span>
        </div>
    `
};
