// 0.2.81 — Forkable Structure Library. Lists every registered Structure
// (core/StructureRegistry.js#getAll()) and lets the user Fork one —
// nothing else. Mirrors ui/components/BrickPalette.js's own shape
// (dumb list + click handler, no core/ or renderer/ imports) one rung
// up: a Structure's own contents don't change at runtime any more than
// a brick library's definitions do, so there is no active-selection
// state or subscription to wire, unlike BrickPalette's selected-brick
// tracking.
export default {
    name: 'StructureLibraryPanel',
    props: {
        structures: {
            type: Array,
            required: true
        }
    },
    emits: ['fork'],
    template: `
        <div class="structure-library-panel">
            <h3 class="palette-title">Village Library</h3>
            <ul class="structure-list">
                <li
                    v-for="structure in structures"
                    :key="structure.id"
                    class="structure-item"
                    :title="structure.description"
                >
                    <div class="structure-item-info">
                        <span class="structure-item-name">{{ structure.name }}</span>
                        <span class="structure-item-category">{{ structure.category }}</span>
                    </div>
                    <button class="action-btn action-btn--fork structure-item-fork" @click="$emit('fork', structure)">
                        Fork
                    </button>
                </li>
            </ul>
        </div>
    `
};
