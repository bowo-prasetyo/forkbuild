import { computed, onBeforeUnmount, ref } from 'vue';
import {
    BuildVideoKind, BuildVideoShape, buildVideoFileName, buildVideoTimeline, canRecordBuildVideo, describeBuildVideo, videoAppUrl
} from '../../../core/BuildVideo.js';
import { FORKBUILD_APP_URL } from '../../../core/ForkBuildAppLinks.js';
import { challengeOfTags } from '../../../core/BuildChallenge.js';
import { describeLicense } from '../../../application/document/LicenseLabels.js';
import { displayText, t } from '../../i18n/i18n.js';

const KINDS = Object.freeze([
    { kind: BuildVideoKind.TIMELAPSE, name: 'video.timelapse', description: 'video.timelapseDescription' },
    { kind: BuildVideoKind.TURNTABLE, name: 'video.turntable', description: 'video.turntableDescription' }
]);
const SHAPES = Object.freeze([
    { shape: BuildVideoShape.WIDE, name: 'video.wide', description: 'video.wideDescription' },
    { shape: BuildVideoShape.TALL, name: 'video.tall', description: 'video.tallDescription' }
]);
// The address the end card shows, without its scheme: short enough to read
// off a video and type.
const SHOWN_ADDRESS = FORKBUILD_APP_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');

// Make a video (from PublicationShareLink, beside Save picture): pick a
// time-lapse or a turntable, wide or tall, and it is recorded on this device
// (renderer/BuildVideoRecorder.js) and downloaded, with a title and a
// description to paste where the person uploads it. Nothing is uploaded.
// `snapshotText` is the published build; `buildUrl` the link that opens it,
// when it has one.
export default {
    name: 'BuildVideoDialog',
    props: {
        snapshotText: { type: String, required: true },
        title: { type: String, default: '' },
        buildUrl: { type: String, default: null }
    },
    emits: ['close'],
    setup(props) {
        const kind = ref(BuildVideoKind.TIMELAPSE);
        const shape = ref(BuildVideoShape.WIDE);
        // choose, recording, done, failed, or unsupported in a browser that
        // can't record.
        const state = ref(canRecordBuildVideo(globalThis) ? 'choose' : 'unsupported');
        const progress = ref(0);
        const fileName = ref('');
        const description = ref(null);
        const copyFeedback = ref('');
        let controller = null;

        async function record() {
            if (state.value === 'recording') return;
            state.value = 'recording';
            progress.value = 0;
            copyFeedback.value = '';
            const mine = new AbortController();
            controller = mine;
            try {
                // Imported here, so Three.js loads only when a video is asked for.
                const [{ recordBuildVideo }, { DocumentSerializer }, { CreateBrickRegistryUseCase }, { bricksOfDocument }] = await Promise.all([
                    import('../../../renderer/BuildVideoRecorder.js'),
                    import('../../../serializer/DocumentSerializer.js'),
                    import('../../../application/editor/CreateBrickRegistryUseCase.js'),
                    import('../../../application/publication/sharing/ReadSharedBuild.js')
                ]);
                const build = new DocumentSerializer().deserialize(JSON.parse(props.snapshotText));
                const bricks = bricksOfDocument(build);
                const metadata = build.metadata;
                const name = props.title || displayText(metadata.title) || t('share.untitled');
                const builtWith = metadata.builtWith.map((entry) => entry.name).filter(Boolean);
                const credit = metadata.author
                    ? (builtWith.length ? t('video.creditWith', { author: metadata.author, names: builtWith.join(', ') }) : t('video.credit', { author: metadata.author }))
                    : '';
                const video = await recordBuildVideo(bricks, {
                    registry: new CreateBrickRegistryUseCase().execute(),
                    timeline: buildVideoTimeline(kind.value, bricks.length),
                    shape: shape.value,
                    text: { title: name, credit, badge: t('video.badge'), call: t('video.call'), address: SHOWN_ADDRESS, hint: t('video.hint') },
                    onProgress: (fraction) => { progress.value = fraction; },
                    signal: mine.signal
                });
                fileName.value = buildVideoFileName(name, kind.value, video.extension);
                downloadBlob(video.blob, fileName.value);
                const license = metadata.license;
                const described = describeBuildVideo({
                    title: name,
                    author: metadata.author || '',
                    builtWith,
                    remixedFrom: metadata.parentDocumentId ? (license?.attribution?.title || '') : '',
                    license: describeLicense(license?.id),
                    buildUrl: props.buildUrl,
                    appUrl: videoAppUrl(FORKBUILD_APP_URL),
                    challengeTag: challengeOfTags(metadata.tags)?.tag ?? null,
                    shape: shape.value
                });
                description.value = {
                    title: t(described.title),
                    text: described.lines.map((line) => (line === null ? '' : displayText(line))).join('\n')
                };
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

        async function copy(text, feedbackKey) {
            try {
                await navigator.clipboard.writeText(text);
                copyFeedback.value = t(feedbackKey);
            } catch {
                copyFeedback.value = t('video.copyByHand');
            }
        }

        const percent = computed(() => Math.round(progress.value * 100));
        return {
            t, kinds: KINDS, shapes: SHAPES, kind, shape, state, percent, fileName, description, copyFeedback, record, cancel, copy
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
                    <p v-if="state === 'failed'" class="form-hint" role="alert">{{ t('video.failed') }}</p>
                    <p class="model-export-note">{{ t('video.note') }}</p>
                </template>
                <template v-else-if="state === 'recording'">
                    <p class="model-export-lead" role="status">{{ t('video.recording', { percent }) }}</p>
                    <progress class="build-video-progress" max="100" :value="percent">{{ percent }}%</progress>
                    <p class="model-export-note">{{ t('video.keepOpen') }}</p>
                </template>
                <template v-else-if="state === 'done'">
                    <p class="model-export-lead" role="status">{{ t('video.saved', { file: fileName }) }}</p>
                    <label class="build-video-field">
                        <span class="model-export-name">{{ t('video.titleLabel') }}</span>
                        <input class="build-video-title-text" readonly :value="description.title" @focus="$event.target.select()">
                    </label>
                    <label class="build-video-field">
                        <span class="model-export-name">{{ t('video.descriptionLabel') }}</span>
                        <textarea class="build-video-description" readonly rows="8" :value="description.text" @focus="$event.target.select()"></textarea>
                    </label>
                    <div class="publication-share-link-actions">
                        <button type="button" class="action-btn action-btn--secondary build-video-copy-title" @click="copy(description.title, 'video.titleCopied')">{{ t('video.copyTitle') }}</button>
                        <button type="button" class="action-btn action-btn--primary build-video-copy-description" @click="copy(description.text, 'video.descriptionCopied')">{{ t('video.copyDescription') }}</button>
                        <span class="publication-share-link-feedback" role="status">{{ copyFeedback }}</span>
                    </div>
                    <p class="model-export-note">{{ t('video.uploadHint') }}</p>
                </template>
                <div class="modal-actions">
                    <button v-if="state === 'recording'" type="button" class="action-btn action-btn--secondary build-video-cancel" @click="cancel">{{ t('video.stop') }}</button>
                    <template v-else>
                        <button type="button" class="action-btn action-btn--secondary build-video-close" @click="close">{{ t(state === 'done' ? 'video.done' : 'video.cancel') }}</button>
                        <button v-if="state === 'choose' || state === 'failed'" type="button" class="action-btn action-btn--primary build-video-record" @click="record">{{ t('video.record') }}</button>
                        <button v-else-if="state === 'done'" type="button" class="action-btn action-btn--secondary build-video-another" @click="state = 'choose'">{{ t('video.another') }}</button>
                    </template>
                </div>
            </div>
        </div>
    `
};

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    // The download has started by the time this runs; revoking sooner can cancel it in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}
