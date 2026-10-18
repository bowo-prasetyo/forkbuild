import { describeLicense } from '../../application/document/LicenseLabels.js';
import { t } from '../i18n/i18n.js';
import FormattedDescription from './FormattedDescription.js';
import PublicationCommentarySection from './PublicationCommentarySection.js';

// A build's whole description and its comments, wide enough to read:
// opened from "Read more" or the comments line in the About this build panel
// (DocumentInfoPanel), which only has room for the description's start.
// Beside World View's left panel on a wide screen, leaving the World in view
// and usable; a sheet up from the bottom on a narrow one.
//
// Comments are the build's Publication's, drawn by the same
// PublicationCommentarySection Explore's cards use; the commands it injects
// are World View's own (WorldView provides them), so a comment is saved
// through the session and distributed like any World View comment. A build
// without a Publication has no comments section. `section: 'comments'`
// opens the sheet scrolled to them.
//
// Not modal: the World stays live behind it. Keys pressed while it has focus
// are its own (Space, Home and the arrows scroll it, never move the avatar
// or fly Home), Escape closes it (from the comment box, it only leaves the
// box, so a draft isn't lost), and closing gives focus back to whatever
// opened it. Emits 'close' and, for a build its viewer may edit,
// 'edit-metadata'. `info` is the panel's own (getDocumentInfo()).
export default {
    name: 'DescriptionReaderSheet',
    components: { FormattedDescription, PublicationCommentarySection },
    props: {
        info: { type: Object, required: true },
        // The build's Publication, or null when it has none to comment on.
        publication: { type: Object, default: null },
        // Where to open it: 'description' (its top) or 'comments'.
        section: { type: String, default: 'description' }
    },
    emits: ['close', 'edit-metadata'],
    setup() {
        return { t };
    },
    data() {
        return { returnFocusTo: null, arrived: true };
    },
    computed: {
        meta() {
            const parts = [];
            if (this.info.author) parts.push(t('descriptionReader.by', { author: this.info.author }));
            parts.push(t(describeLicense(this.info.license ? this.info.license.id : null)));
            return parts.join(' · ');
        }
    },
    watch: {
        section() {
            this.showSection();
        }
    },
    mounted() {
        this.returnFocusTo = document.activeElement;
        this.$refs.body.focus({ preventScroll: true });
        // Again once the comments have rendered, which makes room to scroll.
        this.showSection();
        this.$nextTick(() => this.showSection());
    },
    beforeUnmount() {
        const back = this.returnFocusTo;
        if (back && back.isConnected && typeof back.focus === 'function' && this.$el.contains(document.activeElement)) {
            back.focus({ preventScroll: true });
        }
    },
    methods: {
        showSection() {
            const body = this.$refs.body;
            const comments = this.$refs.comments;
            body.scrollTop = this.section === 'comments' && comments
                ? body.scrollTop + comments.getBoundingClientRect().top - body.getBoundingClientRect().top - 16
                : 0;
        },
        onKeydown(event) {
            event.stopPropagation();
            if (event.key !== 'Escape') return;
            event.preventDefault();
            if (event.target.matches('textarea, input, select')) {
                this.$refs.body.focus({ preventScroll: true });
                return;
            }
            this.$emit('close');
        }
    },
    template: `
        <section
            class="description-reader-sheet"
            role="dialog"
            aria-modal="false"
            aria-labelledby="description-reader-title"
            @keydown="onKeydown"
        >
            <header class="description-reader-header">
                <div class="description-reader-heading">
                    <p class="description-reader-kicker">{{ t('documentInfo.title') }}</p>
                    <h3 id="description-reader-title" class="description-reader-title">{{ info.title }}</h3>
                    <p class="description-reader-meta">{{ meta }}</p>
                </div>
                <button
                    type="button"
                    class="description-reader-close"
                    :title="t('descriptionReader.close')"
                    :aria-label="t('descriptionReader.close')"
                    @click="$emit('close')"
                >✕</button>
            </header>
            <div
                ref="body"
                :class="['description-reader-body', { 'description-reader-body--arrived': arrived }]"
                tabindex="0"
                @blur="arrived = false"
                aria-labelledby="description-reader-title"
            >
                <formatted-description v-if="info.description" :text="info.description" />
                <section
                    v-if="publication"
                    ref="comments"
                    class="description-reader-comments"
                    aria-labelledby="description-reader-comments-title"
                >
                    <h4 id="description-reader-comments-title" class="description-reader-comments-title">{{ t('descriptionReader.comments') }}</h4>
                    <PublicationCommentarySection :publication="publication" />
                </section>
            </div>
            <footer v-if="info.editable !== false" class="description-reader-footer">
                <button type="button" class="action-btn" @click="$emit('edit-metadata')">{{ t('documentInfo.editMetadata') }}</button>
            </footer>
        </section>
    `
};
