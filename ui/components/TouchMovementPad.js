import { ref, computed, onBeforeUnmount } from 'vue';
import { TouchMovementInput, cruiseChord } from '../../application/avatar/TouchMovementInput.js';
import { AvatarContinuousMovementIntent } from '../../core/AvatarContinuousMovementIntent.js';
import { AvatarContinuousMovementMode } from '../../core/AvatarContinuousMovementMode.js';
import { clampTouchJoystickOffset } from '../../core/TouchJoystickKeys.js';
import { describeAnimalDecorationAction, describeVehicleStoreAction } from './avatarInteractionLabels.js';

// World View's on-screen controls for touch screens: a joystick for W/A/S/D
// (pushed to the rim, it runs) and buttons for the other avatar keys. It only
// sends key presses; the session decides what each one does, exactly as for a
// keyboard. The context buttons appear under the same conditions as
// VehicleInteractionPrompt and AnimalInteractionPrompt.
//
// Decorate is the one exception: it emits 'decorate' instead of pressing 'G',
// because the session's 'G' silently ignores a refusal (not signed in, no edit
// access), and a button that does nothing when tapped leaves a player stuck.
// The host runs the action itself and shows why it failed.
export default {
    name: 'TouchMovementPad',
    props: {
        vehicleState: { type: Object, default: null },
        storeState: { type: Object, default: null },
        animalState: { type: Object, default: null },
        decorationState: { type: Object, default: null },
        // The session's avatarContinuousMovementState(), or null.
        cruiseState: { type: Object, default: null }
    },
    emits: ['key-down', 'key-up', 'decorate'],
    setup(props, { emit }) {
        const input = new TouchMovementInput({
            keyDown: (key) => emit('key-down', key),
            keyUp: (key) => emit('key-up', key)
        });
        const thumb = ref({ dx: 0, dy: 0 });
        let stick = null;

        function onStickDown(event) {
            if (stick) {
                return;
            }
            const rect = event.currentTarget.getBoundingClientRect();
            stick = {
                pointerId: event.pointerId,
                centerX: rect.left + rect.width / 2,
                centerY: rect.top + rect.height / 2,
                radius: rect.width / 2
            };
            event.currentTarget.setPointerCapture(event.pointerId);
            onStickMove(event);
        }

        function onStickMove(event) {
            if (!stick || event.pointerId !== stick.pointerId) {
                return;
            }
            const dx = event.clientX - stick.centerX;
            const dy = event.clientY - stick.centerY;
            thumb.value = clampTouchJoystickOffset({ dx, dy, radius: stick.radius });
            input.setJoystick({ dx, dy, radius: stick.radius });
        }

        function onStickUp(event) {
            if (!stick || event.pointerId !== stick.pointerId) {
                return;
            }
            stick = null;
            thumb.value = { dx: 0, dy: 0 };
            input.releaseJoystick();
        }

        function holdButton(event, key) {
            event.currentTarget.setPointerCapture(event.pointerId);
            input.holdButton(key);
        }

        function releaseButton(key) {
            input.releaseButton(key);
        }

        function tapButton(key) {
            input.tapButton(key);
        }

        const mounted = computed(() => Boolean(props.vehicleState && props.vehicleState.mounted));
        const mountVisible = computed(() => Boolean(props.vehicleState)
            && (props.vehicleState.mounted || Boolean(props.vehicleState.targetVehicleId)));
        const store = computed(() => describeVehicleStoreAction(props.storeState));
        const decoration = computed(() => describeAnimalDecorationAction(props.decorationState));
        const animalVisible = computed(() => Boolean(props.animalState)
            && (props.animalState.canCatch || props.animalState.canRelease));

        // Hands-free movement, as Alt+W on a keyboard: each tap walks, then runs,
        // then stops. Pushing the joystick forward or back also stops it, as W/S do.
        const cruise = computed(() => {
            const state = props.cruiseState;
            if (!state || state.intent === AvatarContinuousMovementIntent.NONE) {
                return { active: false, label: 'Cruise', next: 'Walk hands-free' };
            }
            if (state.intent === AvatarContinuousMovementIntent.BACKWARD) {
                return { active: true, label: 'Cruise: Back', next: 'Stop' };
            }
            return state.mode === AvatarContinuousMovementMode.RUN
                ? { active: true, label: 'Cruise: Run', next: 'Stop' }
                : { active: true, label: 'Cruise: Walk', next: 'Run hands-free' };
        });
        function tapCruise() {
            input.pressChord(cruiseChord(props.cruiseState));
        }

        onBeforeUnmount(() => input.releaseAll());

        return {
            thumb, mounted, mountVisible, store, animalVisible, decoration,
            cruise, tapCruise,
            onStickDown, onStickMove, onStickUp, holdButton, releaseButton, tapButton
        };
    },
    template: `
        <div class="touch-pad" @contextmenu.prevent>
            <div
                class="touch-pad-joystick"
                aria-label="Move: push to walk, push to the edge to run"
                @pointerdown.prevent="onStickDown"
                @pointermove="onStickMove"
                @pointerup="onStickUp"
                @pointercancel="onStickUp"
                @lostpointercapture="onStickUp"
            >
                <div
                    class="touch-pad-joystick-thumb"
                    :style="{ transform: 'translate(' + thumb.dx + 'px, ' + thumb.dy + 'px)' }"
                ></div>
            </div>
            <div class="touch-pad-buttons">
                <button
                    v-if="mountVisible"
                    type="button"
                    class="touch-pad-btn"
                    @click="tapButton('e')"
                >{{ mounted ? 'Get Off' : 'Ride' }}</button>
                <div v-if="store" class="touch-pad-group">
                    <button
                        v-if="store.canCycle"
                        type="button"
                        class="touch-pad-btn touch-pad-btn--small"
                        aria-label="Older stored vehicle"
                        @click="tapButton('[')"
                    >‹</button>
                    <button
                        type="button"
                        class="touch-pad-btn"
                        @click="tapButton('q')"
                    >{{ store.action === 'store' ? 'Store' : 'Deploy ' + store.vehicleLabel }}<span v-if="store.position" class="touch-pad-btn-detail">{{ store.position }}</span></button>
                    <button
                        v-if="store.canCycle"
                        type="button"
                        class="touch-pad-btn touch-pad-btn--small"
                        aria-label="Newer stored vehicle"
                        @click="tapButton(']')"
                    >›</button>
                </div>
                <button
                    v-if="animalVisible"
                    type="button"
                    class="touch-pad-btn"
                    @click="tapButton('f')"
                >{{ animalState.canCatch ? 'Catch' : 'Release' }}</button>
                <button
                    v-if="decoration"
                    type="button"
                    class="touch-pad-btn"
                    @click="$emit('decorate')"
                >{{ decoration.action === 'decorate' ? 'Decorate' : 'Undo Decoration' }}</button>
                <template v-if="mounted">
                    <button
                        type="button"
                        class="touch-pad-btn"
                        aria-label="Steer left"
                        @click="tapButton('ArrowLeft')"
                    >↶</button>
                    <button
                        type="button"
                        class="touch-pad-btn"
                        aria-label="Steer right"
                        @click="tapButton('ArrowRight')"
                    >↷</button>
                    <button
                        type="button"
                        class="touch-pad-btn"
                        @pointerdown.prevent="holdButton($event, 'Control')"
                        @pointerup="releaseButton('Control')"
                        @pointercancel="releaseButton('Control')"
                        @lostpointercapture="releaseButton('Control')"
                    >Brake</button>
                </template>
                <button
                    type="button"
                    :class="['touch-pad-btn', { 'touch-pad-btn--active': cruise.active }]"
                    :aria-pressed="cruise.active ? 'true' : 'false'"
                    :title="cruise.next"
                    @click="tapCruise"
                >{{ cruise.label }}</button>
                <button
                    type="button"
                    class="touch-pad-btn touch-pad-btn--primary"
                    @pointerdown.prevent="holdButton($event, ' ')"
                    @pointerup="releaseButton(' ')"
                    @pointercancel="releaseButton(' ')"
                    @lostpointercapture="releaseButton(' ')"
                >Jump</button>
            </div>
        </div>
    `
};
