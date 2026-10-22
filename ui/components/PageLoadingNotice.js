import { computed } from 'vue';
import { pageLoading } from '../pageLoading.js';
import { t } from '../i18n/i18n.js';

// Laid over the top of the page area while a page is still downloading
// (ui/pageLoading.js), so the page beneath never moves when it goes.
export default {
    name: 'PageLoadingNotice',
    setup() {
        const loading = computed(() => pageLoading.value);
        return { t, loading };
    },
    template: `
        <div v-if="loading" class="page-loading" role="status">
            <span class="page-loading-bar" aria-hidden="true"></span>
            <span class="page-loading-text">{{ t('app.pageLoading') }}</span>
        </div>
    `
};
