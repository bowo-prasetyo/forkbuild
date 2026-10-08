import { applyUpdate, serviceWorkerState } from '../../pwa/serviceWorkerClient.js';
import { t } from '../../i18n/i18n.js';

// "A new version of ForkBuild is ready": shown once a new version has
// installed beside the one running (ui/pwa/serviceWorkerClient.js). Reload
// starts it; otherwise it starts by itself once every ForkBuild tab is closed.
export default {
    name: 'AppUpdateBanner',
    setup() {
        return { t, serviceWorkerState, applyUpdate };
    },
    template: `
        <div v-if="serviceWorkerState.updateReady" class="app-update-banner" role="status">
            <span>{{ t('appUpdate.ready') }}</span>
            <button type="button" class="action-btn app-update-reload" @click="applyUpdate">{{ t('appUpdate.reload') }}</button>
        </div>
    `
};
