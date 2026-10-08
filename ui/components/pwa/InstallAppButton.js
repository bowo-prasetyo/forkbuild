import { onBeforeUnmount, ref } from 'vue';
import { InstallMethod, installState, onInstallStateChange, promptInstall } from '../../pwa/installPrompt.js';
import { t } from '../../i18n/i18n.js';

// "Install ForkBuild": the browser's own install prompt where it offers one,
// how to add it to the home screen on an iPhone or iPad, and nothing once
// ForkBuild runs installed or where it can't be installed (ui/pwa/installPrompt.js).
export default {
    name: 'InstallAppButton',
    props: {
        // 'button' (Home) or 'link' (the More menu).
        variant: { type: String, default: 'button' },
        // A line beside the button saying what installing gives.
        why: { type: String, default: '' }
    },
    setup() {
        const state = ref(installState());
        const showHint = ref(false);
        const stop = onInstallStateChange(() => { state.value = installState(); });
        onBeforeUnmount(stop);

        async function install() {
            if (state.value.method === InstallMethod.HOME_SCREEN) {
                showHint.value = !showHint.value;
                return;
            }
            await promptInstall();
            state.value = installState();
        }

        return { t, state, showHint, install, InstallMethod };
    },
    template: `
        <span v-if="state.method !== InstallMethod.NONE" :class="['install-app', 'install-app--' + variant]">
            <button
                type="button"
                :class="variant === 'link' ? 'app-nav-link install-app-button' : 'install-app-button'"
                :aria-expanded="state.method === InstallMethod.HOME_SCREEN ? (showHint ? 'true' : 'false') : null"
                @click="install"
            >{{ t('installApp.install') }}</button>
            <span v-if="why" class="install-app-why">{{ why }}</span>
            <span v-if="showHint && state.method === InstallMethod.HOME_SCREEN" class="install-app-hint" role="note">{{ t('installApp.homeScreenHint') }}</span>
        </span>
    `
};
