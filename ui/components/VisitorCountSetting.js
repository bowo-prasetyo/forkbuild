import { inject, ref } from 'vue';
import { VISITOR_COUNT_DASHBOARD_URL, asksNotToBeTracked } from '../../core/VisitorCount.js';
import { currentLocale, t } from '../i18n/i18n.js';
import { privacyPageUrl } from '../i18n/userGuide.js';
import I18nText from '../i18n/I18nText.js';

// The Your Data page's switch for the daily visitor count (core/VisitorCount.js,
// docs/Privacy.md "Visitor count"). Saved as soon as it changes. A browser
// sending Global Privacy Control or Do Not Track is never counted, so the
// switch is shown off and locked, saying why.
export default {
    name: 'VisitorCountSetting',
    components: { I18nText },
    setup() {
        const store = inject('visitorCountSettingsStore', null);
        const browserNavigator = inject('privacySignalSource', globalThis.navigator || {});
        const blockedByBrowser = asksNotToBeTracked({
            globalPrivacyControl: browserNavigator.globalPrivacyControl,
            doNotTrack: browserNavigator.doNotTrack
        });
        const enabled = ref(store ? store.get().enabled : false);

        function toggle(event) {
            if (!store) return;
            enabled.value = store.setEnabled(event.target.checked).enabled;
        }

        return {
            t, enabled, toggle, blockedByBrowser,
            available: Boolean(store),
            dashboardUrl: VISITOR_COUNT_DASHBOARD_URL,
            privacyUrl: privacyPageUrl(currentLocale().code)
        };
    },
    template: `
        <div v-if="available" class="your-data-section visitor-count-setting">
            <h2>{{ t('visitorCount.title') }}</h2>
            <p class="form-hint form-hint--neutral">{{ t('visitorCount.intro') }}</p>
            <label class="your-data-checkbox">
                <input type="checkbox" class="visitor-count-toggle" :checked="enabled && !blockedByBrowser" :disabled="blockedByBrowser" @change="toggle">
                {{ t('visitorCount.label') }}
            </label>
            <p v-if="blockedByBrowser" class="form-hint form-hint--neutral visitor-count-blocked">{{ t('visitorCount.browserAsksNotToTrack') }}</p>
            <p class="form-hint form-hint--neutral">
                <I18nText keypath="visitorCount.details">
                    <template #dashboard><a :href="dashboardUrl" target="_blank" rel="noopener noreferrer">{{ t('visitorCount.dashboard') }}</a></template>
                    <template #privacy><a :href="privacyUrl" target="_blank" rel="noopener noreferrer">{{ t('visitorCount.privacy') }}</a></template>
                </I18nText>
            </p>
        </div>
    `
};
