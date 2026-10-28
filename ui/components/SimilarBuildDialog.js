import { License } from '../../core/document/License.js';
import { t } from '../i18n/i18n.js';
import { lookAlikeShare } from '../../core/catalog/BuildSimilarity.js';

// Shown at publish when the build looks a lot like someone else's published
// build on this device (application/publication/SimilarBuildFinder.js). It is
// a hint, never a verdict: alike builds happen by chance, and only the
// builder knows how theirs was made, so publishing stays their choice. What
// it adds is a pointer to Edit a Copy, which credits the other builder.
// `matches` are the finder's { publication, evidence }. Emits publish or
// cancel.
export default {
    name: 'SimilarBuildDialog',
    props: {
        matches: { type: Array, required: true }
    },
    emits: ['publish', 'cancel'],
    setup() {
        function title(publication) {
            return publication.title || t('similarBuild.untitled');
        }
        function remixAllowed(publication) {
            const license = publication.license instanceof License ? publication.license : new License(publication.license || {});
            return license.forkAllowed;
        }
        // How alike, as lookAlikeShare() says: most of both the same, or most
        // of one standing in the other, and whether it was mirrored.
        function howAlike(evidence) {
            const { kind, percent, mirrored } = lookAlikeShare(evidence);
            const share = t(kind === 'same' ? 'similarBuild.percent' : (kind === 'theirsInMine' ? 'similarBuild.theirsInYours' : 'similarBuild.yoursInTheirs'), { percent });
            return mirrored ? t('similarBuild.mirrored', { how: share }) : share;
        }
        return { t, title, remixAllowed, howAlike };
    },
    mounted() {
        this.$el.querySelector('.similar-build-keep')?.focus();
    },
    methods: {
        onKeydown(event) {
            if (event.key === 'Escape') {
                event.stopPropagation();
                this.$emit('cancel');
            }
        }
    },
    template: `
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="similar-build-title"
            class="modal-overlay"
            @click.self="$emit('cancel')"
            @keydown="onKeydown"
        >
            <div class="modal-panel similar-build-dialog">
                <h3 id="similar-build-title">{{ t('similarBuild.title') }}</h3>
                <p class="similar-build-lead">{{ t('similarBuild.lead') }}</p>
                <ul class="similar-build-list">
                    <li v-for="match in matches" :key="match.publication.id" class="similar-build-match">
                        <span class="similar-build-name">{{ match.publication.author
                            ? t('similarBuild.titleBy', { title: title(match.publication), author: match.publication.author })
                            : title(match.publication) }}</span>
                        <span class="similar-build-percent">{{ howAlike(match.evidence) }}</span>
                        <span class="similar-build-terms">{{ remixAllowed(match.publication) ? t('similarBuild.remixAllowed') : t('similarBuild.remixNotAllowed') }}</span>
                    </li>
                </ul>
                <p class="similar-build-note">{{ t('similarBuild.note') }}</p>
                <div class="modal-actions">
                    <button type="button" class="action-btn action-btn--primary similar-build-keep" @click="$emit('cancel')">{{ t('similarBuild.keep') }}</button>
                    <button type="button" class="action-btn action-btn--secondary similar-build-publish" @click="$emit('publish')">{{ t('similarBuild.publish') }}</button>
                </div>
            </div>
        </div>
    `
};
