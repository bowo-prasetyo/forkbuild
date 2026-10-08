import { BuildModelFormat } from '../../../core/BuildModelFormats.js';
import { t } from '../../i18n/i18n.js';

// "Download as a 3D model", from the Editor's toolbar: the three file kinds
// (core/BuildModelFormats.js), each saying what it is for. Emits
// choose(format) or cancel; the Editor makes the file.
const OPTIONS = Object.freeze([
    { format: BuildModelFormat.GLB, name: 'modelExport.glb', description: 'modelExport.glbDescription' },
    { format: BuildModelFormat.STL, name: 'modelExport.stl', description: 'modelExport.stlDescription' },
    { format: BuildModelFormat.OBJ, name: 'modelExport.obj', description: 'modelExport.objDescription' }
]);

export default {
    name: 'ModelExportDialog',
    emits: ['choose', 'cancel'],
    setup() {
        return { t, options: OPTIONS };
    },
    mounted() {
        this.$el.querySelector('.model-export-option')?.focus();
    },
    methods: {
        onKeydown(event) {
            if (event.key === 'Escape') {
                event.stopPropagation();
                this.$emit('cancel');
            }
        }
    },
    template: `
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="model-export-title"
            class="modal-overlay"
            @click.self="$emit('cancel')"
            @keydown="onKeydown"
        >
            <div class="modal-panel model-export-dialog">
                <h3 id="model-export-title">{{ t('modelExport.title') }}</h3>
                <p class="model-export-lead">{{ t('modelExport.lead') }}</p>
                <button
                    v-for="option in options"
                    :key="option.format"
                    type="button"
                    class="model-export-option"
                    :data-format="option.format"
                    @click="$emit('choose', option.format)"
                >
                    <span class="model-export-name">{{ t(option.name) }}</span>
                    <span class="model-export-description">{{ t(option.description) }}</span>
                </button>
                <p class="model-export-note">{{ t('modelExport.note') }}</p>
                <div class="modal-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="$emit('cancel')">{{ t('modelExport.cancel') }}</button>
                </div>
            </div>
        </div>
    `
};
