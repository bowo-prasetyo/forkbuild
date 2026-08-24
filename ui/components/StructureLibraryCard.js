import BuildLibraryPreview from './BuildLibraryPreview.js';

// 0.6.4 — Blueprint Discovery, Search & Library Organization. Extracted
// from ui/components/BuildLibraryPanel.js's own triplicated card markup
// (a built-in category group, a personal category group, and now this
// milestone's own Recent section all rendered the identical
// preview + name + "⋮" menu structure inline) — one card renders any
// Structure from either library, its "⋮" menu contents chosen by
// `source` alone, the exact same distinction BuildLibraryPanel already
// drew before this extraction. Nothing about WHAT any menu item does
// changes here: every emit is the same verb BuildLibraryPanel already
// forwarded up to ui/views/EditorView.js — this component only renders
// the button and reports the click, it never runs the action itself.
export default {
    name: 'StructureLibraryCard',
    components: { BuildLibraryPreview },
    props: {
        structure: { type: Object, required: true },
        previewService: { type: Object, default: null },
        source: { type: String, default: 'built-in' }, // 'built-in' | 'personal'
        isMenuOpen: { type: Boolean, default: false }
    },
    emits: ['place', 'toggle-menu', 'info', 'fork', 'fork-to-library', 'export', 'rename', 'remove'],
    template: `
        <li
            class="structure-item build-library-item"
            :title="'Place ' + structure.name"
            @click="$emit('place', structure)"
        >
            <BuildLibraryPreview kind="structure" :item="structure" :preview-service="previewService" />
            <span class="structure-item-name">{{ structure.name }}</span>
            <div class="structure-item-menu" @click.stop>
                <button
                    type="button"
                    class="action-btn action-btn--secondary structure-item-menu-toggle"
                    aria-label="More actions"
                    :aria-expanded="isMenuOpen"
                    @click="$emit('toggle-menu', structure.id)"
                >⋮</button>
                <div v-if="isMenuOpen" class="structure-item-menu-list">
                    <button class="action-btn action-btn--secondary structure-item-info" @click="$emit('info', structure)">
                        Info
                    </button>
                    <button class="action-btn action-btn--fork structure-item-fork" @click="$emit('fork', structure)">
                        Fork As New Document
                    </button>
                    <button
                        v-if="source === 'built-in'"
                        class="action-btn action-btn--secondary structure-item-fork-to-library"
                        @click="$emit('fork-to-library', structure)"
                    >
                        Fork to My Structures
                    </button>
                    <button
                        v-if="source === 'personal'"
                        class="action-btn action-btn--secondary structure-item-rename"
                        @click="$emit('rename', structure)"
                    >
                        Rename
                    </button>
                    <button class="action-btn action-btn--secondary structure-item-export" @click="$emit('export', structure)">
                        Export Blueprint
                    </button>
                    <button
                        v-if="source === 'personal'"
                        class="action-btn action-btn--danger structure-item-remove"
                        @click="$emit('remove', structure)"
                    >
                        Remove
                    </button>
                </div>
            </div>
        </li>
    `
};
