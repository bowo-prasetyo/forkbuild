// The sound button, volume slider, music toggle and (in World View) 3D toggle, floating over
// the viewport. Presentational only: the host owns the settings and the
// soundscape.
//
// `compact` (the Editor on a phone or a touch screen) folds it into one small
// button among the view's other buttons, which opens the sound and music
// toggles beneath it; the device's own volume buttons stand in for the slider.
// The full panel floated over the middle of the build there and took the taps
// meant for it (docs/reviews/EditorPlacementUX-2026-10-27.md, finding P2-11).
import { t } from '../i18n/i18n.js';

export default {
    name: 'SoundControl',
    props: {
        muted: { type: Boolean, default: false },
        volume: { type: Number, default: 0.5 },
        spatial: { type: Boolean, default: true },
        music: { type: Boolean, default: true },
        // Only World View places sounds, so only it offers 3D.
        showSpatial: { type: Boolean, default: false },
        compact: { type: Boolean, default: false }
    },
    emits: ['toggle', 'volume', 'toggle-spatial', 'toggle-music'],
    data() {
        return { open: false };
    },
    mounted() {
        // A tap anywhere else closes the folded menu.
        this._closeOutside = (event) => {
            if (this.open && this.$el && !this.$el.contains(event.target)) this.open = false;
        };
        window.addEventListener('pointerdown', this._closeOutside);
    },
    beforeUnmount() {
        window.removeEventListener('pointerdown', this._closeOutside);
    },
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
        <div v-if="compact" class="editor-sound">
            <button
                type="button"
                :class="['action-btn', 'editor-sound-button', { 'action-btn--active': open }]"
                :aria-expanded="open ? 'true' : 'false'"
                :aria-label="t('sound.group')"
                :title="muted ? t('sound.off') : t('sound.on')"
                @click="open = !open"
            >{{ muted ? '🔇' : '🔊' }}</button>
            <div v-if="open" class="editor-sound-menu" role="group" :aria-label="t('sound.group')">
                <button
                    type="button"
                    class="action-btn world-view-sound-toggle"
                    :aria-pressed="muted ? 'false' : 'true'"
                    :title="muted ? t('sound.turnOn') : t('sound.turnOff')"
                    @click="$emit('toggle')"
                >{{ muted ? t('sound.off') : t('sound.on') }}</button>
                <button
                    v-if="!muted"
                    type="button"
                    class="action-btn world-view-sound-music"
                    :aria-pressed="music ? 'true' : 'false'"
                    :title="music ? t('sound.turnMusicOff') : t('sound.turnMusicOn')"
                    @click="$emit('toggle-music')"
                >{{ music ? t('sound.musicOn') : t('sound.musicOff') }}</button>
            </div>
        </div>
        <div v-else class="world-view-sound" role="group" :aria-label="t('sound.group')">
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
                v-if="!muted"
                type="button"
                class="action-btn world-view-sound-music"
                :aria-pressed="music ? 'true' : 'false'"
                :title="music ? t('sound.turnMusicOff') : t('sound.turnMusicOn')"
                @click="$emit('toggle-music')"
            >{{ music ? t('sound.musicOn') : t('sound.musicOff') }}</button>
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
