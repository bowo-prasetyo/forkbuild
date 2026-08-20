import { ref, onMounted, onBeforeUnmount } from 'vue';

// The palette itself never imports core/ or renderer/ — everything it
// needs (the list of definitions, the current selection, how to change
// it, how to hear about external changes) comes through paletteUseCase.
// Responsibilities: display definitions, highlight the active one, let
// the user click to select. Nothing about placement, nothing about
// Three.js.
export default {
    name: 'BrickPalette',
    props: {
        paletteUseCase: {
            type: Object,
            required: true
        }
    },
    setup(props) {
        // 0.2.80 — grouped by category (core/BrickRegistry.js#groupByCategory())
        // now that the vocabulary is wide enough (eleven categories) for a
        // flat list to be hard to scan. Grouping is computed once here,
        // the same way `definitions` always was — the registry's contents
        // don't change at runtime, only which one is selected does.
        const groups = ref(props.paletteUseCase.getGroupedDefinitions());
        const selectedDefinitionId = ref(props.paletteUseCase.getSelectedDefinitionId());
        let unsubscribe = null;

        function selectBrick(definitionId) {
            props.paletteUseCase.selectDefinition(definitionId);
        }

        onMounted(() => {
            unsubscribe = props.paletteUseCase.onActiveBrickChanged((definitionId) => {
                selectedDefinitionId.value = definitionId;
            });
        });

        onBeforeUnmount(() => {
            if (unsubscribe) {
                unsubscribe();
            }
        });

        return { groups, selectedDefinitionId, selectBrick };
    },
    template: `
        <div class="brick-palette">
            <h3 class="palette-title">Core Library</h3>
            <div
                v-for="group in groups"
                :key="group.category"
                class="palette-group"
            >
                <h4 class="palette-category">{{ group.category }}</h4>
                <ul class="palette-list">
                    <li
                        v-for="definition in group.definitions"
                        :key="definition.id"
                        :class="['palette-item', { 'palette-item--active': definition.id === selectedDefinitionId }]"
                        :title="definition.description"
                        @click="selectBrick(definition.id)"
                    >
                        <span class="palette-item-name">{{ definition.name }}</span>
                    </li>
                </ul>
            </div>
        </div>
    `
};
