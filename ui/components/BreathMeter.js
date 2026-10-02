// How much air the avatar has left, floating over the top of the viewport while
// it dives and until its breath has filled again. Presentational only: the host
// passes the session's avatarSwimState().
import { t, formatNumber } from '../i18n/i18n.js';
import { AvatarSwimMode } from '../../core/AvatarSwimming.js';

// Below this share of a full breath the bar turns to a warning colour.
const LOW_AIR_FRACTION = 0.25;

export default {
    name: 'BreathMeter',
    props: {
        swimState: { type: Object, default: null }
    },
    computed: {
        visible() {
            const state = this.swimState;
            return Boolean(state)
                && (state.mode === AvatarSwimMode.DIVING || state.breathSeconds < state.breathCapacitySeconds);
        },
        fraction() {
            const state = this.swimState;
            if (!state || !(state.breathCapacitySeconds > 0)) return 1;
            return Math.min(1, Math.max(0, state.breathSeconds / state.breathCapacitySeconds));
        },
        percent() {
            return Math.round(this.fraction * 100);
        },
        low() {
            return this.fraction <= LOW_AIR_FRACTION;
        },
        secondsLeft() {
            return formatNumber(Math.ceil(this.swimState ? this.swimState.breathSeconds : 0));
        }
    },
    methods: { t },
    template: `
        <div
            v-if="visible"
            :class="['world-view-breath', { 'world-view-breath--low': low || swimState.forcedAscent }]"
            role="meter"
            :aria-label="t('breathMeter.airLeft')"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="percent"
            :aria-valuetext="t('breathMeter.secondsLeft', { seconds: secondsLeft })"
        >
            <span class="world-view-breath-label">{{ t('breathMeter.air') }}</span>
            <span class="world-view-breath-track"><span class="world-view-breath-fill" :style="{ width: percent + '%' }"></span></span>
            <span class="world-view-breath-detail">{{ swimState.forcedAscent ? t('breathMeter.outOfAir') : t('breathMeter.secondsLeft', { seconds: secondsLeft }) }}</span>
        </div>
    `
};
