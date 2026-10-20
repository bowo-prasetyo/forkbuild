// The Focus buttons beside what a World Resident just said: one per thing it
// mentioned that stays put (a landmark, a structure, a build, a vehicle), so
// the viewer can choose to look there. A speech bubble lives inside the 3D
// scene and can't hold a button, so these float at the bottom of the view,
// above the key prompts, while the words are up.
//
// When the resident wondered what the ground nearby has never had
// (core/world/ResidentWish.js), one Build there button instead: `wish` is { label }
// (a message),
// and clicking emits 'build'; the host opens the Editor on that spot.
//
// PRESENTATION ONLY. `targets` is what the host already decided to show
// (WorldNavigationSession#lastResidentSpeech().focusTargets, while that
// speech is current and the viewer is still beside the resident); clicking
// emits 'focus' with the target's index, and the host calls
// focusResidentMention(). Labels are plain text, drawn as text.
import { displayText, t } from '../i18n/i18n.js';
export default {
    name: 'ResidentSpeechActions',
    props: {
        // [{ kind, label, position }]
        targets: {
            type: Array,
            default: () => []
        },
        // { label } or null
        wish: {
            type: Object,
            default: null
        }
    },
    emits: ['focus', 'build'],
    methods: { t, displayText },
    template: `
        <div
            v-if="targets.length > 0 || wish"
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
            <button
                v-if="wish"
                type="button"
                class="action-btn action-btn--primary resident-speech-actions-btn resident-speech-actions-build"
                :title="t('residentSpeechActions.buildHint')"
                @click="$emit('build')"
            >{{ displayText(wish.label) }}</button>
        </div>
    `
};
