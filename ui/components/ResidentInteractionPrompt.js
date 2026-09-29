// A floating, bottom-center affordance for World Residents: "[R] Remove
// Resident" while one is close enough for 'R' to remove it. Adding one is
// never prompted (it could be done almost anywhere, so the prompt would
// never go away); the Avatar panel's Residents row offers that instead.
//
// PRESENTATION ONLY. `state` is exactly
// WorldNavigationSession#residentInteractionState()'s
// { canAdd, canRemove, refusal, targetResidentId }; this component decides
// nothing. Sits above AnimalInteractionPrompt (whose two lines end below
// 200px), so the two never overlap.
export default {
    name: 'ResidentInteractionPrompt',
    props: {
        state: {
            type: Object,
            default: null
        }
    },
    computed: {
        visible() {
            return Boolean(this.state && this.state.canRemove);
        }
    },
    template: `
        <div
            v-if="visible"
            aria-live="polite"
            :style="{
                position: 'absolute',
                left: '50%',
                bottom: '200px',
                transform: 'translateX(-50%)',
                zIndex: 34,
                pointerEvents: 'none',
                background: 'rgba(18, 18, 18, 0.92)',
                border: '1px solid #3a3a3a',
                borderLeft: '3px solid #6f9b5a',
                borderRadius: '4px',
                padding: '6px 14px',
                fontFamily: 'monospace',
                fontSize: '12px',
                color: '#e0e0e0',
                whiteSpace: 'nowrap'
            }"
        >[R] Remove Resident</div>
    `
};
