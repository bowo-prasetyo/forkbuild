// The sound button, volume slider and (in World View) 3D toggle, floating over
// the viewport. Presentational only: the host owns the settings and the
// soundscape.
import { t } from '../i18n/i18n.js';

export default {
    name: 'SoundControl',
    props: {
        muted: { type: Boolean, default: false },
        volume: { type: Number, default: 0.5 },
        spatial: { type: Boolean, default: true },
        // Only World View places sounds, so only it offers 3D.
        showSpatial: { type: Boolean, default: false }
    },
    emits: ['toggle', 'volume', 'toggle-spatial'],
    computed: {
        percent() {
            return Math.round(this.volume * 100);
        }
    },
    methods: {
        t,
        onInput(event) {
            this.$emit('volume', Number(event.target.value) / 100);
        }
    },
    template: `
        <div class="world-view-sound" role="group" :aria-label="t('sound.group')">
            <button
                type="button"
                class="action-btn world-view-sound-toggle"
                :aria-pressed="muted ? 'false' : 'true'"
                :title="muted ? t('sound.turnOn') : t('sound.turnOff')"
                @click="$emit('toggle')"
            >{{ muted ? t('sound.off') : t('sound.on') }}</button>
            <input
                v-if="!muted"
                type="range"
                class="world-view-sound-volume"
                min="0"
                max="100"
                step="5"
                :value="percent"
                :aria-label="t('sound.volume')"
                @input="onInput"
            >
            <button
                v-if="!muted && showSpatial"
                type="button"
                class="action-btn world-view-sound-spatial"
                :aria-pressed="spatial ? 'true' : 'false'"
                :title="spatial ? t('sound.spatialHint') : t('sound.stereoHint')"
                @click="$emit('toggle-spatial')"
            >{{ spatial ? t('sound.spatial') : t('sound.stereo') }}</button>
        </div>
    `
};
