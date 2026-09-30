import { computed, inject } from 'vue';
import { pageLoadFailure, reloadOnPage } from '../pageLoadFailure.js';
import { t } from '../i18n/i18n.js';

// Shown under the header when a page could not load because its files did
// not download (ui/pageLoadFailure.js). Reload loads ForkBuild again on that
// page, which ends a voice call in progress, so the notice says so when
// there is one; Dismiss hides it and stays where you are.
export default {
    name: 'PageLoadFailureNotice',
    props: {
        // For tests; the app reloads the real page.
        reload: { type: Function, default: reloadOnPage }
    },
    setup(props) {
        const voiceUseCase = inject('voiceUseCase', null);
        const failure = computed(() => pageLoadFailure.value);

        function inCall() {
            try {
                return Boolean(voiceUseCase && voiceUseCase.getActiveCall());
            } catch {
                return false;
            }
        }

        function reload() {
            if (failure.value) props.reload(failure.value.fullPath);
        }

        function dismiss() {
            pageLoadFailure.value = null;
        }

        return { t, failure, inCall, reload, dismiss };
    },
    template: `
        <div v-if="failure" class="page-load-failure" role="alert">
            <span class="page-load-failure-text">
                {{ t('app.pageLoadFailed') }}
                <strong v-if="inCall()">{{ t('app.pageLoadFailedEndsCall') }}</strong>
            </span>
            <span class="page-load-failure-actions">
                <button type="button" class="action-btn action-btn--primary page-load-failure-reload" @click="reload">{{ t('app.loadFailedReload') }}</button>
                <button type="button" class="action-btn action-btn--secondary page-load-failure-dismiss" @click="dismiss">{{ t('app.pageLoadFailedDismiss') }}</button>
            </span>
        </div>
    `
};
