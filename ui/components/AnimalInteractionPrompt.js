// 0.9.700 — Animal Catching. The direct structural twin of
// ui/components/VehicleInteractionPrompt.js: a floating, bottom-center
// affordance — "[F] Catch <Species>" while an uncaught animal is in
// range, "[F] Release <Species>" while carrying at least one and
// nothing is in range, and nothing at all otherwise.
//
// PRESENTATION ONLY — MAKES NO CATCH/RELEASE DECISION OF ITS OWN. `state`
// is exactly whatever
// application/world/WorldNavigationSession.js#avatarAnimalInteractionState()
// returned (in turn
// application/avatar/AvatarAnimalInteractionController.js#catchInteractionState()'s
// own output) — an already-authoritative `{ canCatch, canRelease,
// species, targetAnimalId, carriedCount }` snapshot. This component
// never computes distance, never queries an animal list, and never
// decides eligibility.
//
// POSITIONED ABOVE VehicleInteractionPrompt, NEVER AT THE SAME ANCHOR —
// both are independent floating prompts that can be visible
// simultaneously (an avatar standing near both a vehicle and an animal
// at once), so this one sits at a different `bottom` offset rather than
// risking the two literally overlapping.
const ANIMAL_SPECIES_LABEL = {
    DEER: 'Deer',
    RABBIT: 'Rabbit'
};

export default {
    name: 'AnimalInteractionPrompt',
    props: {
        // { canCatch, canRelease, species, targetAnimalId, carriedCount }
        // from WorldNavigationSession#avatarAnimalInteractionState(), or
        // null/absent (no local avatar, or the host has chosen not to
        // show this while Avatar Control Mode is off).
        state: {
            type: Object,
            default: null
        }
    },
    computed: {
        visible() {
            return Boolean(this.state) && (this.state.canCatch || this.state.canRelease);
        },
        label() {
            if (!this.state) {
                return '';
            }
            const speciesLabel = ANIMAL_SPECIES_LABEL[this.state.species] || 'Animal';
            if (this.state.canCatch) {
                return `[F] Catch ${speciesLabel}`;
            }
            if (this.state.canRelease) {
                const suffix = this.state.carriedCount > 1 ? ` (${this.state.carriedCount} carried)` : '';
                return `[F] Release ${speciesLabel}${suffix}`;
            }
            return '';
        }
    },
    template: `
        <div
            v-if="visible"
            aria-live="polite"
            :style="{
                position: 'absolute',
                left: '50%',
                bottom: '130px',
                transform: 'translateX(-50%)',
                zIndex: 34,
                pointerEvents: 'none',
                background: 'rgba(18, 18, 18, 0.92)',
                border: '1px solid #3a3a3a',
                borderLeft: '3px solid #b08d57',
                borderRadius: '4px',
                padding: '6px 14px',
                fontFamily: 'monospace',
                fontSize: '12px',
                color: '#e0e0e0',
                whiteSpace: 'nowrap'
            }"
        >{{ label }}</div>
    `
};
