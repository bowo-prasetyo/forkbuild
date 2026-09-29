// The Focus buttons beside what a World Resident just said: one per thing it
// mentioned that stays put (a landmark, a structure, a build, a vehicle), so
// the viewer can choose to look there. A speech bubble lives inside the 3D
// scene and can't hold a button, so these float at the bottom of the view,
// above the key prompts, while the words are up.
//
// PRESENTATION ONLY. `targets` is what the host already decided to show
// (WorldNavigationSession#lastResidentSpeech().focusTargets, while that
// speech is current and the viewer is still beside the resident); clicking
// emits 'focus' with the target's index, and the host calls
// focusResidentMention(). Labels are plain text, drawn as text.
import { t } from '../i18n/i18n.js';
export default {
    name: 'ResidentSpeechActions',
    props: {
        // [{ kind, label, position }]
        targets: {
            type: Array,
            default: () => []
        }
    },
    emits: ['focus'],
    methods: { t },
    template: `
        <div
            v-if="targets.length > 0"
            class="resident-speech-actions"
            role="group"
            :aria-label="t('residentSpeechActions.lookAtWhatTheResident')"
        >
            <button
                v-for="(target, index) in targets"
                :key="index"
                type="button"
                class="action-btn resident-speech-actions-btn"
                :title="t('residentSpeechActions.focusHint', { target: target.label })"
                @click="$emit('focus', index)"
            >{{ t('residentSpeechActions.focus', { target: target.label }) }}</button>
        </div>
    `
};
