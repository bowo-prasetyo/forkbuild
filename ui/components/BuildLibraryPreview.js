import { PreviewType, derivePlaceholderPreview } from '../../core/DocumentPreview.js';

// "Near viewport" pre-fetch distance — see ui/components/PublicationPreview.js's
// own identical constant; this component follows that one's lazy/
// cancellable IntersectionObserver pattern exactly, one rung down (a
// brick or structure catalog item instead of a publication card).
const ROOT_MARGIN = '200px';

// 0.2.84 (Building Library & Palette UX) — the Build Library's own
// small thumbnail, built on application/LibraryPreviewService.js the
// same way ui/components/PublicationPreview.js is built on
// application/PreviewService.js. The deterministic PLACEHOLDER (a
// color + initial derived from the item's own id/name — reusing
// core/DocumentPreview.js#derivePlaceholderPreview() verbatim, since it
// only ever reads `.id`/`.title` and a BrickDefinition/Structure's
// `.id`/`.name` satisfy that shape directly) shows immediately and
// doubles as the permanent fallback if no previewService is wired or
// generation fails — a palette entry must never render blank.
export default {
    name: 'BuildLibraryPreview',
    props: {
        kind: { type: String, required: true }, // 'brick' | 'structure'
        item: { type: Object, required: true },  // BrickDefinition | Structure
        previewService: { type: Object, default: null }
    },
    data() {
        return {
            thumbnail: null, // DocumentPreview (THUMBNAIL) once available
            pending: false
        };
    },
    computed: {
        cacheKey() {
            return `${this.kind}:${this.item.id}`;
        },
        placeholder() {
            return derivePlaceholderPreview({ id: this.item.id, title: this.item.name });
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
            return; // no service wired — stays on the placeholder forever
        }

        const cached = this.previewService.getCached(this.cacheKey);
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
            this._disconnectObserver();
            this.pending = true;
            const { promise, cancel } = this.kind === 'structure'
                ? this.previewService.requestStructurePreview(this.item)
                : this.previewService.requestBrickPreview(this.item);
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
            :class="['build-library-preview', { 'build-library-preview--pending': pending }]"
            :style="style"
        >
            <img v-if="isThumbnail" :src="preview.image" class="build-library-preview-image" alt="" />
            <span v-else class="build-library-preview-label">{{ placeholder.label }}</span>
        </div>
    `
};
