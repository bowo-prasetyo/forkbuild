import { PreviewType, derivePlaceholderPreview } from '../../core/DocumentPreview.js';

// 0.2.31 — renders whatever core/DocumentPreview.js decided a
// publication's preview is. Today that is always a PLACEHOLDER (a
// deterministic color + initial derived from the publication itself —
// see DocumentPreview.js's own comment for why a real, immutable,
// content-addressed thumbnail is deliberately future work, not
// something faked here). THUMBNAIL is rendered when a `reference` is
// present so this component doesn't need to change again the day one
// actually exists; nothing in this codebase produces one yet, so that
// branch is exercised only by future work, not by anything currently
// running.
export default {
    name: 'PublicationPreview',
    props: {
        publication: {
            type: Object,
            required: true
        },
        size: {
            type: String,
            default: 'card' // 'card' | 'list'
        }
    },
    computed: {
        preview() {
            return derivePlaceholderPreview(this.publication);
        },
        isThumbnail() {
            return this.preview.type === PreviewType.THUMBNAIL && this.preview.reference;
        },
        style() {
            return { background: `hsl(${this.preview.seed}, 42%, 26%)` };
        }
    },
    template: `
        <div :class="['publication-preview', 'publication-preview--' + size]" :style="!isThumbnail ? style : null">
            <img v-if="isThumbnail" :src="preview.reference" class="publication-preview-image" alt="" />
            <span v-else class="publication-preview-label">{{ preview.label }}</span>
        </div>
    `
};
