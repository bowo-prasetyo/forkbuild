import { LicenseId } from '../../core/License.js';
import { t } from '../i18n/i18n.js';

// Asked when a build with no license is published (ui/components/Toolbar.js):
// with no license, nobody may make a copy of it, so a shared link could only
// be looked at. The person chooses; nothing is licensed for them. Either
// choice is saved as the build's license (changeable in Properties), so it
// is asked once. Emits choose(licenseId) or cancel.
export default {
    name: 'RemixPermissionDialog',
    emits: ['choose', 'cancel'],
    setup() {
        return { t, LicenseId };
    },
    mounted() {
        this.$el.querySelector('.remix-permission-allow')?.focus();
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
            aria-labelledby="remix-permission-title"
            class="modal-overlay"
            @click.self="$emit('cancel')"
            @keydown="onKeydown"
        >
            <div class="modal-panel remix-permission-dialog">
                <h3 id="remix-permission-title">{{ t('remixPermission.title') }}</h3>
                <p class="remix-permission-lead">{{ t('remixPermission.lead') }}</p>
                <button type="button" class="remix-permission-option remix-permission-allow" @click="$emit('choose', LicenseId.CC_BY_4_0)">
                    <span class="remix-permission-name">{{ t('remixPermission.allow') }}</span>
                    <span class="remix-permission-description">{{ t('remixPermission.allowDescription') }}</span>
                </button>
                <button type="button" class="remix-permission-option remix-permission-look" @click="$emit('choose', LicenseId.ALL_RIGHTS_RESERVED)">
                    <span class="remix-permission-name">{{ t('remixPermission.lookOnly') }}</span>
                    <span class="remix-permission-description">{{ t('remixPermission.lookOnlyDescription') }}</span>
                </button>
                <p class="remix-permission-note">{{ t('remixPermission.note') }}</p>
                <div class="modal-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="$emit('cancel')">{{ t('remixPermission.cancel') }}</button>
                </div>
            </div>
        </div>
    `
};
