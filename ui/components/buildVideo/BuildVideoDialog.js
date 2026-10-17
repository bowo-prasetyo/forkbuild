import { computed, getCurrentInstance, onBeforeUnmount, ref } from 'vue';
import {
    BuildVideoKind, BuildVideoShape, buildVideoFileName, buildVideoTimeline, canRecordBuildVideo
} from '../../../core/BuildVideo.js';
import BuildVideoSaved from './BuildVideoSaved.js';
import { downloadVideo, videoDescription, videoOverlayText } from './buildVideoText.js';
import { requestWalkThroughFilm } from './walkThroughFilmRequest.js';
import { displayText, t } from '../../i18n/i18n.js';

const KINDS = Object.freeze([
    { kind: BuildVideoKind.TIMELAPSE, name: 'video.timelapse', description: 'video.timelapseDescription' },
    { kind: BuildVideoKind.TURNTABLE, name: 'video.turntable', description: 'video.turntableDescription' },
    { kind: BuildVideoKind.WALKTHROUGH, name: 'video.walkthrough', description: 'video.walkthroughDescription' }
]);
const SHAPES = Object.freeze([
    { shape: BuildVideoShape.WIDE, name: 'video.wide', description: 'video.wideDescription' },
    { shape: BuildVideoShape.TALL, name: 'video.tall', description: 'video.tallDescription' }
]);

// Make a video (from PublicationShareLink, beside Save picture): pick a
// time-lapse, a turntable or a walk-through, wide or tall. A time-lapse or a
// turntable is recorded here, on this device (renderer/BuildVideoRecorder.js),
// and downloaded, with a title and a description to paste where the person
// uploads it (BuildVideoSaved). A walk-through is filmed in World View, with
// its sounds and, if asked, its music: the dialog hands World View the request
// (walkThroughFilmRequest.js) and opens the build there. Nothing is uploaded.
// `snapshotText` is the published build; `buildUrl` the link that opens it,
// when it has one; `documentId` the build World View stands it as, which a
// walk-through needs.
export default {
    name: 'BuildVideoDialog',
    components: { BuildVideoSaved },
    props: {
        snapshotText: { type: String, required: true },
        title: { type: String, default: '' },
        buildUrl: { type: String, default: null },
        documentId: { type: String, default: null }
    },
    emits: ['close'],
    setup(props, { emit }) {
        // A walk-through opens World View, so it is offered only where there
        // is a router to get there and a build to film.
        const router = getCurrentInstance()?.appContext.config.globalProperties.$router ?? null;
        const kinds = KINDS.filter((option) => option.kind !== BuildVideoKind.WALKTHROUGH || (router && props.documentId));
        const kind = ref(BuildVideoKind.TIMELAPSE);
        const shape = ref(BuildVideoShape.WIDE);
        const music = ref(true);
        // choose, recording, done, failed, or unsupported in a browser that
        // can't record.
        const state = ref(canRecordBuildVideo(globalThis) ? 'choose' : 'unsupported');
        const progress = ref(0);
        const fileName = ref('');
        const description = ref(null);
        let controller = null;

        async function readBuild() {
            const { DocumentSerializer } = await import('../../../serializer/DocumentSerializer.js');
            const build = new DocumentSerializer().deserialize(JSON.parse(props.snapshotText));
            const name = props.title || displayText(build.metadata.title) || t('share.untitled');
            return { build, name };
        }

        // Hands the walk-through to World View, which films it.
        async function filmWalkThrough() {
            try {
                const { build, name } = await readBuild();
                requestWalkThroughFilm({
                    documentId: props.documentId,
                    shape: shape.value,
                    music: music.value,
                    name,
                    text: videoOverlayText(build.metadata, name),
                    description: videoDescription(build.metadata, { name, buildUrl: props.buildUrl, shape: shape.value })
                });
                emit('close');
                await router.push({ path: `/world/${props.documentId}`, query: { film: 'walk' } });
            } catch {
                state.value = 'failed';
            }
        }

        async function record() {
            if (state.value === 'recording') return;
            if (kind.value === BuildVideoKind.WALKTHROUGH) {
                await filmWalkThrough();
                return;
            }
            state.value = 'recording';
            progress.value = 0;
            const mine = new AbortController();
            controller = mine;
            try {
                // Imported here, so Three.js loads only when a video is asked for.
                const [{ recordBuildVideo }, { CreateBrickRegistryUseCase }, { bricksOfDocument }, { build, name }] = await Promise.all([
                    import('../../../renderer/BuildVideoRecorder.js'),
                    import('../../../application/editor/CreateBrickRegistryUseCase.js'),
                    import('../../../application/publication/sharing/ReadSharedBuild.js'),
                    readBuild()
                ]);
                const bricks = bricksOfDocument(build);
                const video = await recordBuildVideo(bricks, {
                    registry: new CreateBrickRegistryUseCase().execute(),
                    timeline: buildVideoTimeline(kind.value, bricks.length),
                    shape: shape.value,
                    text: videoOverlayText(build.metadata, name),
                    onProgress: (fraction) => { progress.value = fraction; },
                    signal: mine.signal
                });
                fileName.value = buildVideoFileName(name, kind.value, video.extension);
                downloadVideo(video.blob, fileName.value);
                description.value = videoDescription(build.metadata, { name, buildUrl: props.buildUrl, shape: shape.value });
                state.value = 'done';
            } catch (error) {
                if (error?.name === 'AbortError') return;
                state.value = 'failed';
            } finally {
                if (controller === mine) controller = null;
            }
        }

        function cancel() {
            controller?.abort();
            state.value = 'choose';
        }
        onBeforeUnmount(() => controller?.abort());

        const percent = computed(() => Math.round(progress.value * 100));
        const walkThrough = computed(() => kind.value === BuildVideoKind.WALKTHROUGH);
        return {
            t, kinds, shapes: SHAPES, kind, shape, music, walkThrough, state, percent, fileName, description, record, cancel
        };
    },
    mounted() {
        this.$el.querySelector('input, button')?.focus();
    },
    methods: {
        onKeydown(event) {
            if (event.key === 'Escape') {
                event.stopPropagation();
                this.close();
            }
        },
        close() {
            this.cancel();
            this.$emit('close');
        }
    },
    template: `
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="build-video-title"
            class="modal-overlay"
            @click.self="close"
            @keydown="onKeydown"
        >
            <div class="modal-panel model-export-dialog build-video-dialog">
                <h3 id="build-video-title">{{ t('video.title') }}</h3>
                <template v-if="state === 'unsupported'">
                    <p class="model-export-lead" role="alert">{{ t('video.unsupported') }}</p>
                </template>
                <template v-else-if="state === 'choose' || state === 'failed'">
                    <p class="model-export-lead">{{ t('video.lead') }}</p>
                    <fieldset class="build-video-choice">
                        <legend>{{ t('video.kind') }}</legend>
                        <label v-for="option in kinds" :key="option.kind" class="model-export-option build-video-option" :data-kind="option.kind">
                            <span class="build-video-option-head">
                                <input type="radio" name="build-video-kind" :value="option.kind" v-model="kind">
                                <span class="model-export-name">{{ t(option.name) }}</span>
                            </span>
                            <span class="model-export-description">{{ t(option.description) }}</span>
                        </label>
                    </fieldset>
                    <fieldset class="build-video-choice">
                        <legend>{{ t('video.shape') }}</legend>
                        <label v-for="option in shapes" :key="option.shape" class="model-export-option build-video-option" :data-shape="option.shape">
                            <span class="build-video-option-head">
                                <input type="radio" name="build-video-shape" :value="option.shape" v-model="shape">
                                <span class="model-export-name">{{ t(option.name) }}</span>
                            </span>
                            <span class="model-export-description">{{ t(option.description) }}</span>
                        </label>
                    </fieldset>
                    <label v-if="walkThrough" class="build-video-music">
                        <input type="checkbox" class="build-video-music-input" v-model="music">
                        {{ t('video.music') }}
                    </label>
                    <p v-if="state === 'failed'" class="form-hint" role="alert">{{ t('video.failed') }}</p>
                    <p class="model-export-note">{{ t(walkThrough ? 'video.walkthroughNote' : 'video.note') }}</p>
                </template>
                <template v-else-if="state === 'recording'">
                    <p class="model-export-lead" role="status">{{ t('video.recording', { percent }) }}</p>
                    <progress class="build-video-progress" max="100" :value="percent">{{ percent }}%</progress>
                    <p class="model-export-note">{{ t('video.keepOpen') }}</p>
                </template>
                <BuildVideoSaved v-else-if="state === 'done'" :file-name="fileName" :description="description" />
                <div class="modal-actions">
                    <button v-if="state === 'recording'" type="button" class="action-btn action-btn--secondary build-video-cancel" @click="cancel">{{ t('video.stop') }}</button>
                    <template v-else>
                        <button type="button" class="action-btn action-btn--secondary build-video-close" @click="close">{{ t(state === 'done' ? 'video.done' : 'video.cancel') }}</button>
                        <button v-if="state === 'choose' || state === 'failed'" type="button" class="action-btn action-btn--primary build-video-record" @click="record">{{ t(walkThrough ? 'video.filmWalkthrough' : 'video.record') }}</button>
                        <button v-else-if="state === 'done'" type="button" class="action-btn action-btn--secondary build-video-another" @click="state = 'choose'">{{ t('video.another') }}</button>
                    </template>
                </div>
            </div>
        </div>
    `
};
