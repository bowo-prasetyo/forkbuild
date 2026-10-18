import { describeLicense } from '../../application/document/LicenseLabels.js';
import { t } from '../i18n/i18n.js';
import FormattedDescription from './FormattedDescription.js';

// A build's whole description, wide enough to read: opened from "Read more"
// in the About this build panel (DocumentInfoPanel), which only has room for
// its start. Beside World View's left panel on a wide screen, leaving the
// World in view and usable; a sheet up from the bottom on a narrow one.
//
// Not modal: the World stays live behind it. Keys pressed while it has focus
// are its own (Space, Home and the arrows scroll it, never move the avatar
// or fly Home), Escape closes it, and closing gives focus back to whatever
// opened it. Emits 'close' and, for a build its viewer may edit,
// 'edit-metadata'. `info` is the panel's own (getDocumentInfo()).
export default {
    name: 'DescriptionReaderSheet',
    components: { FormattedDescription },
    props: {
        info: { type: Object, required: true }
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
    mounted() {
        this.returnFocusTo = document.activeElement;
        this.$refs.body.focus({ preventScroll: true });
    },
    beforeUnmount() {
        const back = this.returnFocusTo;
        if (back && back.isConnected && typeof back.focus === 'function' && this.$el.contains(document.activeElement)) {
            back.focus({ preventScroll: true });
        }
    },
    methods: {
        onKeydown(event) {
            event.stopPropagation();
            if (event.key === 'Escape') {
                event.preventDefault();
                this.$emit('close');
            }
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
                <formatted-description :text="info.description" />
            </div>
            <footer v-if="info.editable !== false" class="description-reader-footer">
                <button type="button" class="action-btn" @click="$emit('edit-metadata')">{{ t('documentInfo.editMetadata') }}</button>
            </footer>
        </section>
    `
};
