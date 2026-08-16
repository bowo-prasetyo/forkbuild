// 0.2.23: the "Move Placement" surface — deliberately a plain X/Y/Z
// numeric form, not a gizmo-drag interaction. Moving a PLACEMENT is a
// distinct, much rarer operation than moving a BRICK (the existing
// transform gizmo already owns that), and the milestone design
// explicitly favors making the model explicit over building a
// sophisticated positioning interaction before one is actually
// needed. Modal overlay follows the same convention as
// MetadataEditorDialog/CommandPalette.
//
// Emits move({ x, y, z }) — plain numbers, not a Position instance,
// since the caller (WorldNavigationSession.movePlacement) constructs
// whatever position type MoveWorldPlacementUseCase expects.
export default {
    name: 'PlacementEditorDialog',
    props: {
        info: {
            type: Object,
            default: null
        }
    },
    emits: ['move', 'cancel'],
    data() {
        return {
            x: this.info ? this.info.position.x : 0,
            y: this.info ? this.info.position.y : 0,
            z: this.info ? this.info.position.z : 0
        };
    },
    methods: {
        onMove() {
            this.$emit('move', { x: Number(this.x) || 0, y: Number(this.y) || 0, z: Number(this.z) || 0 });
        },
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
            aria-label="Move placement"
            class="modal-overlay"
            @click.self="$emit('cancel')"
            @keydown="onKeydown"
        >
            <div class="modal-panel placement-editor">
                <h3>Move Placement</h3>
                <p class="form-hint form-hint--neutral">
                    This moves where the world sits in shared space. It does not
                    edit the document, and does not create a fork.
                </p>

                <label class="form-field">
                    <span class="form-label">X</span>
                    <input v-model.number="x" type="number" step="1" class="form-input" />
                </label>
                <label class="form-field">
                    <span class="form-label">Y</span>
                    <input v-model.number="y" type="number" step="1" class="form-input" />
                </label>
                <label class="form-field">
                    <span class="form-label">Z</span>
                    <input v-model.number="z" type="number" step="1" class="form-input" />
                </label>

                <div class="modal-actions">
                    <button class="action-btn" @click="$emit('cancel')">Cancel</button>
                    <button class="action-btn action-btn--primary" @click="onMove">Move</button>
                </div>
            </div>
        </div>
    `
};
