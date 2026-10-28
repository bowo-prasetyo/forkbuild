import BuildLibraryPreview from './BuildLibraryPreview.js';
import { t } from '../i18n/i18n.js';

// What the Editor is about to place, over the view while Place is on: the
// brick or structure's preview, its name and, for a brick, the colour it
// will be, with ✕ to stop placing. Tapping it opens the Build Library to
// choose something else, which on a phone is a closed drawer (finding P2-10
// of docs/reviews/EditorPlacementUX-2026-10-27.md: nothing said what a tap
// would place). Presentational: the Editor says what is held.
export default {
    name: 'HoldingChip',
    components: { BuildLibraryPreview },
    props: {
        // 'brick' or 'structure', for the preview; null for a placed build,
        // which has no library preview.
        kind: { type: String, default: null },
        item: { type: Object, default: null },
        name: { type: String, required: true },
        // CSS colour of the brick to be placed, or null.
        color: { type: String, default: null },
        previewService: { type: Object, default: null }
    },
    emits: ['open', 'stop'],
    methods: { t },
    template: `
        <div class="editor-holding" role="group" :aria-label="t('editor.holding')">
            <button
                type="button"
                class="editor-holding-item"
                :title="t('editor.holdingChange')"
                :aria-label="t('editor.holdingName', { name }) + '. ' + t('editor.holdingChange')"
                @click="$emit('open')"
            >
                <BuildLibraryPreview v-if="kind && item" :kind="kind" :item="item" :preview-service="previewService" />
                <span class="editor-holding-name">{{ name }}</span>
                <span v-if="color" class="editor-holding-color" :style="{ background: color }" aria-hidden="true"></span>
            </button>
            <button
                type="button"
                class="editor-holding-stop"
                :title="t('editor.stopPlacing')"
                :aria-label="t('editor.stopPlacing')"
                @click="$emit('stop')"
            >✕</button>
        </div>
    `
};
