import { t } from '../i18n/i18n.js';

export default {
    name: 'HomeView',
    methods: { t },
    template: `
        <section class="home-view">
            <h1>{{ t('homeView.forkbuild') }}</h1>
            <p class="tagline">{{ t('homeView.buildForkShareEvolve') }}</p>
            <p>
                {{ t('homeView.anOpenSourceBrowserBased') }}
            </p>
            <router-link to="/editor" class="cta-button">{{ t('homeView.startBuilding') }}</router-link>
            <img src="favicon.svg" :alt="t('homeView.buildforkIcon')">
        </section>
    `
};
