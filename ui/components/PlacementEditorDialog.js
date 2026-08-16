// 0.2.23: the "Move Placement" surface — deliberately a plain X/Y/Z
// numeric form, not a gizmo-drag interaction. Moving a PLACEMENT is a
// distinct, much rarer operation than moving a BRICK (the existing
// transform gizmo already owns that), and the milestone design
// explicitly favors making the model explicit over building a
// sophisticated positioning interaction before one is actually
// needed. Modal overlay follows the same convention as
// MetadataEditorDialog/CommandPalette.
//
// 0.2.24: adds nudge buttons (±step per axis) as a RELATIVE
// convenience over the same absolute fields — "move 20 world units
// east" is just "add 20 to X" applied to the form's own x/y/z state
// before Move is pressed. Nothing relative is ever persisted: the
// nudge buttons mutate this component's local numbers exactly like
// typing into the field would, and Move still submits the resulting
// absolute position (see docs/Principles.md, "World Coordinates Are
// Absolute; Documents Are Local").
//
// 0.2.25: `overlapWarning` — when set, the host has already run
// WorldNavigationSession.checkPlacementOverlap() against the position
// currently in the form and found it occupied under a policy that
// requires confirmation (WARN). This is still a pure presentation
// component: it does not call checkPlacementOverlap itself, does not
// decide policy, and emits the exact same move({x,y,z}) either way —
// the host (WorldView) is what distinguishes "first click, run the
// check" from "second click, the warning was shown, proceed." If the
// form's numbers no longer match the position the warning was computed
// for (the user edited/nudged after seeing it), the warning is treated
// as stale and hidden — see `warningIsCurrent` — so a confirmation
// never silently applies to a different position than the one it was
// shown for.
//
// Emits move({ x, y, z }) — plain numbers, not a Position instance,
// since the caller (WorldNavigationSession.movePlacement) constructs
// whatever position type MoveWorldPlacementUseCase expects.
const STEP_PRESETS = [1, 10, 100];

export default {
    name: 'PlacementEditorDialog',
    props: {
        info: {
            type: Object,
            default: null
        },
        overlapWarning: {
            type: Object,
            default: null
        }
    },
    emits: ['move', 'cancel'],
    data() {
        return {
            x: this.info ? this.info.position.x : 0,
            y: this.info ? this.info.position.y : 0,
            z: this.info ? this.info.position.z : 0,
            step: STEP_PRESETS[1],
            stepPresets: STEP_PRESETS
        };
    },
    computed: {
        warningIsCurrent() {
            const warning = this.overlapWarning;
            const position = warning && warning.overlap ? warning.overlap.position : null;
            if (!position) return false;
            return Number(this.x) === position.x && Number(this.y) === position.y && Number(this.z) === position.z;
        }
    },
    methods: {
        nudge(axis, sign) {
            const delta = sign * (Number(this.step) || 0);
            this[axis] = (Number(this[axis]) || 0) + delta;
        },
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
                    <span class="form-label">X (World Units)</span>
                    <input v-model.number="x" type="number" step="1" class="form-input" />
                </label>
                <label class="form-field">
                    <span class="form-label">Y (World Units)</span>
                    <input v-model.number="y" type="number" step="1" class="form-input" />
                </label>
                <label class="form-field">
                    <span class="form-label">Z (World Units)</span>
                    <input v-model.number="z" type="number" step="1" class="form-input" />
                </label>

                <div class="placement-nudge">
                    <div class="placement-nudge-step">
                        <span class="form-label">Nudge by</span>
                        <div class="placement-nudge-step-options">
                            <button
                                v-for="preset in stepPresets"
                                :key="preset"
                                type="button"
                                class="placement-nudge-step-btn"
                                :class="{ 'placement-nudge-step-btn--active': step === preset }"
                                @click="step = preset"
                            >{{ preset }}</button>
                        </div>
                    </div>
                    <div class="placement-nudge-row">
                        <span class="placement-nudge-axis">X</span>
                        <button type="button" class="action-btn placement-nudge-btn" @click="nudge('x', -1)">− {{ step }}</button>
                        <button type="button" class="action-btn placement-nudge-btn" @click="nudge('x', 1)">+ {{ step }}</button>
                    </div>
                    <div class="placement-nudge-row">
                        <span class="placement-nudge-axis">Y</span>
                        <button type="button" class="action-btn placement-nudge-btn" @click="nudge('y', -1)">− {{ step }}</button>
                        <button type="button" class="action-btn placement-nudge-btn" @click="nudge('y', 1)">+ {{ step }}</button>
                    </div>
                    <div class="placement-nudge-row">
                        <span class="placement-nudge-axis">Z</span>
                        <button type="button" class="action-btn placement-nudge-btn" @click="nudge('z', -1)">− {{ step }}</button>
                        <button type="button" class="action-btn placement-nudge-btn" @click="nudge('z', 1)">+ {{ step }}</button>
                    </div>
                </div>

                <div v-if="warningIsCurrent" class="placement-overlap-warning" role="alert">
                    <p class="placement-overlap-warning-text">
                        ⚠ {{ overlapWarning.occupants.length }}
                        {{ overlapWarning.occupants.length === 1 ? 'other document is' : 'other documents are' }}
                        already located here.
                    </p>
                    <ul class="placement-overlap-warning-list">
                        <li v-for="occupant in overlapWarning.occupants" :key="occupant.publicationId">
                            {{ occupant.title }}<span v-if="occupant.owner"> — {{ occupant.owner }}</span>
                        </li>
                    </ul>
                </div>

                <div class="modal-actions">
                    <button class="action-btn" @click="$emit('cancel')">Cancel</button>
                    <button class="action-btn action-btn--primary" @click="onMove">{{ warningIsCurrent ? 'Place Anyway' : 'Move' }}</button>
                </div>
            </div>
        </div>
    `
};
