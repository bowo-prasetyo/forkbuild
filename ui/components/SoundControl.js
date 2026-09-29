// World View's sound button and volume slider, floating over the viewport.
// Presentational only: the host owns the settings and the soundscape.
export default {
    name: 'SoundControl',
    props: {
        muted: { type: Boolean, default: false },
        volume: { type: Number, default: 0.5 }
    },
    emits: ['toggle', 'volume'],
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
        </div>
    `
};
