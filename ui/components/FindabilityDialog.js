import { Findability } from '../../application/settings/FindabilityStore.js';
import { t } from '../i18n/i18n.js';

// Who can find it? Asked before this device's first publish
// (ui/components/Toolbar.js): everyone, through a build note anyone's
// ForkBuild reads (core/publication/BuildNote.js), or only people sent the link. The
// answer is kept for this device (application/settings/FindabilityStore.js)
// and changed from the Publish notice. Emits choose(findability) or cancel.
export default {
    name: 'FindabilityDialog',
    emits: ['choose', 'cancel'],
    setup() {
        return { t, Findability };
    },
    mounted() {
        this.$el.querySelector('.findability-everyone')?.focus();
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
            aria-labelledby="findability-title"
            class="modal-overlay"
            @click.self="$emit('cancel')"
            @keydown="onKeydown"
        >
            <div class="modal-panel remix-permission-dialog findability-dialog">
                <h3 id="findability-title">{{ t('findability.title') }}</h3>
                <p class="remix-permission-lead">{{ t('findability.lead') }}</p>
                <button type="button" class="remix-permission-option findability-everyone" @click="$emit('choose', Findability.EVERYONE)">
                    <span class="remix-permission-name">{{ t('findability.everyone') }}</span>
                    <span class="remix-permission-description">{{ t('findability.everyoneDescription') }}</span>
                </button>
                <button type="button" class="remix-permission-option findability-link" @click="$emit('choose', Findability.LINK)">
                    <span class="remix-permission-name">{{ t('findability.link') }}</span>
                    <span class="remix-permission-description">{{ t('findability.linkDescription') }}</span>
                </button>
                <p class="remix-permission-note">{{ t('findability.note') }}</p>
                <div class="modal-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="$emit('cancel')">{{ t('findability.cancel') }}</button>
                </div>
            </div>
        </div>
    `
};
