import { ref } from 'vue';
import { t } from '../../i18n/i18n.js';

// What Make a video says once a video is saved: its file, and the title and
// description to paste where it is uploaded, each with a Copy button. Used
// by BuildVideoDialog and World View's walk-through (WalkThroughFilmPanel).
export default {
    name: 'BuildVideoSaved',
    props: {
        fileName: { type: String, required: true },
        // `{ title, text, linkLeftOut }`.
        description: { type: Object, required: true }
    },
    setup() {
        const copyFeedback = ref('');
        async function copy(text, feedbackKey) {
            try {
                await navigator.clipboard.writeText(text);
                copyFeedback.value = t(feedbackKey);
            } catch {
                copyFeedback.value = t('video.copyByHand');
            }
        }
        return { t, copyFeedback, copy };
    },
    template: `
        <div class="build-video-saved">
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
            <p v-if="description.linkLeftOut" class="form-hint build-video-link-left-out">{{ t('video.linkLeftOut') }}</p>
            <p class="model-export-note">{{ t('video.uploadHint') }}</p>
        </div>
    `
};
