// The sound button, volume slider and (in World View) 3D toggle, floating over
// the viewport. Presentational only: the host owns the settings and the
// soundscape.
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
        onInput(event) {
            this.$emit('volume', Number(event.target.value) / 100);
        }
    },
    template: `
        <div class="world-view-sound" role="group" aria-label="Sound">
            <button
                type="button"
                class="action-btn world-view-sound-toggle"
                :aria-pressed="muted ? 'false' : 'true'"
                :title="muted ? 'Turn sound on (M)' : 'Turn sound off (M)'"
                @click="$emit('toggle')"
            >{{ muted ? '🔇 Sound off' : '🔊 Sound on' }}</button>
            <input
                v-if="!muted"
                type="range"
                class="world-view-sound-volume"
                min="0"
                max="100"
                step="5"
                :value="percent"
                aria-label="Volume"
                @input="onInput"
            >
            <button
                v-if="!muted && showSpatial"
                type="button"
                class="action-btn world-view-sound-spatial"
                :aria-pressed="spatial ? 'true' : 'false'"
                :title="spatial ? 'Sounds are placed in 3D (best with headphones); click for left and right only' : 'Sounds are placed left and right; click for 3D'"
                @click="$emit('toggle-spatial')"
            >{{ spatial ? '3D' : 'Stereo' }}</button>
        </div>
    `
};
