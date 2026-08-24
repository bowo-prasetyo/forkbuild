import { SpatialBounds } from '../../core/SpatialBounds.js';

// 0.6.3 — Blueprint Authoring & Versioning UX. A read-only detail
// surface for one Build Library entry — the Structure-catalog
// counterpart to ui/components/StructureInstancePanel.js's own
// "Selected X Instance" card (0.2.91), which only ever describes an
// already-PLACED StructurePlacement, never a catalog entry someone is
// still browsing. Reachable from either a built-in or a personal
// card's "⋮" menu ("Info") — see ui/components/BuildLibraryPanel.js.
//
// Deliberately READ-ONLY: no field here is editable, and there is no
// "Save" button — see docs/Principles.md's own running "Inspect ≠
// edit" posture (0.6.2's SelectionInspector/StructureInstancePanel
// split already established it one rung over for a live selection;
// this is the same rule applied to a library catalog entry instead).
// Renaming a personal Structure stays exactly where it already was —
// the card's own "⋮" menu — never folded into this panel.
//
// Footprint/height are computed the same way every other Structure
// dimension in this codebase always has been — core/SpatialBounds.js
// #fromBricks(structure.bricks, registry), never a second, cached
// "dimensions" field (see core/Structure.js's own header on why a
// Structure never stores its own bounds).
//
// `source` ('built-in' | 'personal') is supplied by the caller
// (EditorView already knows which library a given id came from — see
// its own inspectStructure()) rather than derived here, so this
// component never needs its own copy of either library to answer a
// question its host already knows the answer to.
export default {
    name: 'StructureInfoPanel',
    props: {
        structure: { type: Object, required: true },
        registry: { type: Object, default: null },
        source: { type: String, default: 'built-in' } // 'built-in' | 'personal'
    },
    emits: ['place', 'export', 'close'],
    computed: {
        bounds() {
            return SpatialBounds.fromBricks(this.structure.bricks, this.registry);
        },
        footprint() {
            const size = this.bounds.size;
            return `${this.round1(size.x)} × ${this.round1(size.z)}`;
        },
        height() {
            return this.round1(this.bounds.size.y);
        },
        sourceLabel() {
            return this.source === 'personal' ? 'My Structures' : 'Village Library';
        }
    },
    methods: {
        round1(value) {
            return Math.round((Number(value) || 0) * 10) / 10;
        },
        onKeydown(event) {
            if (event.key === 'Escape') {
                event.stopPropagation();
                this.$emit('close');
            }
        }
    },
    template: `
        <div
            role="dialog"
            :aria-label="'Structure info: ' + structure.name"
            class="modal-overlay"
            @click.self="$emit('close')"
            @keydown="onKeydown"
        >
            <div class="modal-panel structure-info-panel">
                <h3>{{ structure.name }}</h3>
                <p class="structure-info-category">{{ structure.category }}</p>

                <dl class="structure-info-facts">
                    <dt>Bricks</dt><dd>{{ structure.bricks.length }}</dd>
                    <dt>Footprint</dt><dd>{{ footprint }}</dd>
                    <dt>Height</dt><dd>{{ height }}</dd>
                    <dt>Source</dt><dd>{{ sourceLabel }}</dd>
                </dl>

                <p v-if="structure.description" class="structure-info-description">{{ structure.description }}</p>

                <div class="modal-actions">
                    <button class="action-btn" @click="$emit('close')">Close</button>
                    <button class="action-btn action-btn--secondary" @click="$emit('export')">Export Blueprint</button>
                    <button class="action-btn action-btn--primary" @click="$emit('place')">Place</button>
                </div>
            </div>
        </div>
    `
};
