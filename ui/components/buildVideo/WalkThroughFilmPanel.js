import { computed } from 'vue';
import BuildVideoSaved from './BuildVideoSaved.js';
import { t } from '../../i18n/i18n.js';

// World View's panel while a walk-through is filmed
// (ui/views/worldView/useWalkThroughFilm.js): getting ready, filming with how
// far it has got and a Stop button, saving, then the saved video's title and
// description to paste (BuildVideoSaved). It floats over the 3D view, which
// is all the video records, so the panel itself is never in the video.
export default {
    name: 'WalkThroughFilmPanel',
    components: { BuildVideoSaved },
    props: {
        // `{ stage, progress, fileName, description }`.
        film: { type: Object, required: true }
    },
    emits: ['stop', 'close'],
    setup(props) {
        const percent = computed(() => Math.round((props.film.progress || 0) * 100));
        return { t, percent };
    },
    template: `
        <section class="walk-through-film-panel" :aria-label="t('video.walkthrough')" :data-stage="film.stage">
            <template v-if="film.stage === 'waiting'">
                <p class="model-export-lead" role="status">{{ t('video.walkthroughWaiting') }}</p>
            </template>
            <template v-else-if="film.stage === 'filming'">
                <p class="model-export-lead" role="status">{{ t('video.walkthroughFilming', { percent }) }}</p>
                <progress class="build-video-progress" max="100" :value="percent">{{ percent }}%</progress>
                <p class="model-export-note">{{ t('video.keepOpen') }}</p>
            </template>
            <template v-else-if="film.stage === 'saving'">
                <p class="model-export-lead" role="status">{{ t('video.walkthroughSaving') }}</p>
            </template>
            <BuildVideoSaved v-else-if="film.stage === 'saved'" :file-name="film.fileName" :description="film.description" />
            <p v-else-if="film.stage === 'unsupported'" class="model-export-lead" role="alert">{{ t('video.unsupported') }}</p>
            <p v-else class="model-export-lead" role="alert">{{ t('video.walkthroughFailed') }}</p>
            <div class="modal-actions">
                <button
                    v-if="film.stage === 'waiting' || film.stage === 'filming'"
                    type="button"
                    class="action-btn action-btn--secondary walk-through-film-stop"
                    @click="$emit('stop')"
                >{{ t('video.stop') }}</button>
                <button
                    v-else-if="film.stage !== 'saving'"
                    type="button"
                    class="action-btn action-btn--secondary walk-through-film-close"
                    @click="$emit('close')"
                >{{ t('video.done') }}</button>
            </div>
        </section>
    `
};
