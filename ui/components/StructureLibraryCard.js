import BuildLibraryPreview from './BuildLibraryPreview.js';
import { t } from '../i18n/i18n.js';
import { libraryItemName } from '../i18n/libraryText.js';

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
        isMenuOpen: { type: Boolean, default: false },
        // Keyboard: the card's key among the panel's cards, and whether it is
        // the one Tab stops at (BuildLibraryPanel's roving tabindex). Up, Down,
        // Home and End ask the panel to move to another card.
        navKey: { type: String, default: '' },
        tabStop: { type: Boolean, default: true }
    },
    emits: ['place', 'toggle-menu', 'info', 'fork', 'fork-to-library', 'export', 'rename', 'remove', 'navigate', 'focused'],
    methods: {
        t,
        libraryItemName,
        onKeydown(event) {
            if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            this.$emit('navigate', this.navKey, event.key);
        }
    },
    template: `
        <li
            class="structure-item build-library-item"
            :title="t('buildLibrary.place', { name: libraryItemName(structure) })"
            @click="$emit('place', structure)"
        >
            <!-- The card's own button, so the keyboard can place it; its click
                 reaches the card's own handler above. -->
            <button
                type="button"
                class="structure-item-place"
                :aria-label="t('buildLibrary.place', { name: libraryItemName(structure) })"
                :tabindex="tabStop ? 0 : -1"
                :data-structure-key="navKey"
                @focus="$emit('focused', navKey)"
                @keydown="onKeydown"
            >
                <BuildLibraryPreview kind="structure" :item="structure" :preview-service="previewService" />
                <span class="structure-item-name">{{ libraryItemName(structure) }}</span>
            </button>
            <div class="structure-item-menu" @click.stop>
                <button
                    type="button"
                    :tabindex="tabStop ? 0 : -1"
                    class="action-btn action-btn--secondary structure-item-menu-toggle"
                    :aria-label="t('structureCard.moreActions')"
                    :aria-expanded="isMenuOpen"
                    @click="$emit('toggle-menu', structure.id)"
                >⋮</button>
                <div v-if="isMenuOpen" class="structure-item-menu-list">
                    <button class="action-btn action-btn--secondary structure-item-info" @click="$emit('info', structure)">
                        {{ t('structureCard.info') }}
                    </button>
                    <button class="action-btn action-btn--fork structure-item-fork" @click="$emit('fork', structure)">
                        {{ t('structureCard.fork') }}
                    </button>
                    <button
                        v-if="source === 'built-in'"
                        class="action-btn action-btn--secondary structure-item-fork-to-library"
                        @click="$emit('fork-to-library', structure)"
                    >
                        {{ t('structureCard.forkToLibrary') }}
                    </button>
                    <button
                        v-if="source === 'personal'"
                        class="action-btn action-btn--secondary structure-item-rename"
                        @click="$emit('rename', structure)"
                    >
                        {{ t('structureCard.rename') }}
                    </button>
                    <button class="action-btn action-btn--secondary structure-item-export" @click="$emit('export', structure)">
                        {{ t('structureCard.export') }}
                    </button>
                    <button
                        v-if="source === 'personal'"
                        class="action-btn action-btn--danger structure-item-remove"
                        @click="$emit('remove', structure)"
                    >
                        {{ t('structureCard.remove') }}
                    </button>
                </div>
            </div>
        </li>
    `
};
