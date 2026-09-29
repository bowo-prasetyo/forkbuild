import { animalSpeciesLabel, describeAnimalDecorationAction } from './avatarInteractionLabels.js';
import { t } from '../i18n/i18n.js';

// The structural twin of ui/components/VehicleInteractionPrompt.js: a
// floating, bottom-center affordance — "[F] Catch <Species>" while an
// uncaught animal is in range, "[F] Release <Species>" while carrying at
// least one and nothing is in range — and, on a second line, "[G] Decorate
// with <Species>" or "[G] Undo <Species> Decoration" when 'G' would do
// something here.
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
        },
        // WorldNavigationSession#animalDecorationInteractionState(), or null.
        decorationState: {
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
            const speciesLabel = animalSpeciesLabel(this.state.species);
            if (this.state.canCatch) {
                return t('animalPrompt.catch', { species: speciesLabel });
            }
            if (this.state.canRelease) {
                return this.state.carriedCount > 1
                    ? t('animalPrompt.releaseCarried', { species: speciesLabel, count: this.state.carriedCount })
                    : t('animalPrompt.release', { species: speciesLabel });
            }
            return '';
        },
        decoration() {
            return describeAnimalDecorationAction(this.decorationState);
        },
        decorationLabel() {
            if (!this.decoration) {
                return '';
            }
            return this.decoration.action === 'decorate'
                ? t('animalPrompt.decorate', { species: this.decoration.speciesLabel })
                : t('animalPrompt.undecorate', { species: this.decoration.speciesLabel });
        }
    },
    template: `
        <div
            v-if="visible || decoration"
            aria-live="polite"
            :style="{
                position: 'absolute',
                left: '50%',
                bottom: '130px',
                transform: 'translateX(-50%)',
                zIndex: 34,
                pointerEvents: 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px'
            }"
        >
            <div
                v-if="visible"
                :style="{
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
            <div
                v-if="decoration"
                :style="{
                    background: 'rgba(18, 18, 18, 0.92)',
                    border: '1px solid #3a3a3a',
                    borderLeft: '3px solid #8d6fb0',
                    borderRadius: '4px',
                    padding: '6px 14px',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    color: '#e0e0e0',
                    whiteSpace: 'nowrap'
                }"
            >{{ decorationLabel }}</div>
        </div>
    `
};
