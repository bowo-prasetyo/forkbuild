import { defineAsyncComponent } from 'vue';
import { STARTER_STRUCTURE_ID } from '../../application/home/FeaturedBuilds.js';
import { currentLocale, t } from '../i18n/i18n.js';
import { userGuideUrl } from '../i18n/userGuide.js';
import InstallAppButton from '../components/pwa/InstallAppButton.js';

const SOURCE_URL = 'https://github.com/bowo-prasetyo/forkbuild';

// The 3D showcase and the ready-made builds' thumbnails need Three.js and
// the brick libraries, which the first load leaves out
// (tests/InitialLoadModuleGraph.test.js), so they load once Home has
// rendered. Until then each keeps its space with an empty placeholder.
const HomeShowcase = defineAsyncComponent(() => import('../components/home/HomeShowcase.js'));
const FeaturedBuilds = defineAsyncComponent(() => import('../components/featured/FeaturedBuilds.js'));

const REASONS = Object.freeze([
    { icon: '🧱', title: 'homeView.buildTitle', text: 'homeView.buildText' },
    { icon: '🔀', title: 'homeView.remixTitle', text: 'homeView.remixText' },
    { icon: '🌍', title: 'homeView.exploreTitle', text: 'homeView.exploreText' },
    { icon: '🔑', title: 'homeView.ownTitle', text: 'homeView.ownText' }
]);

// The landing page: what ForkBuild is, a way straight into building (a
// ready-made house, or an empty plot), ready-made builds to remix, and why
// it's worth trying. The first page most visits open, and the only one in
// the first load.
export default {
    name: 'HomeView',
    components: { HomeShowcase, FeaturedBuilds, InstallAppButton },
    setup() {
        return {
            t,
            reasons: REASONS,
            starterRoute: { path: '/editor', query: { start: STARTER_STRUCTURE_ID } },
            guideUrl: userGuideUrl(currentLocale().code),
            sourceUrl: SOURCE_URL
        };
    },
    template: `
        <section class="home-view">
            <div class="home-inner">
                <header class="home-hero">
                    <div class="home-hero-text">
                        <p class="tagline">{{ t('homeView.buildForkShareEvolve') }}</p>
                        <h1 class="home-title">{{ t('homeView.heroTitle') }}</h1>
                        <p class="home-lead">{{ t('homeView.heroLead') }}</p>
                        <div class="home-actions">
                            <router-link :to="starterRoute" class="cta-button home-cta-primary">{{ t('homeView.tryStarter') }}</router-link>
                            <router-link to="/editor" class="home-cta-secondary">{{ t('homeView.startFromScratch') }}</router-link>
                            <router-link to="/repository" class="home-cta-secondary">{{ t('homeView.exploreBuilds') }}</router-link>
                        </div>
                        <p class="home-reassurance">{{ t('homeView.noAccountNeeded') }}</p>
                        <InstallAppButton class="home-install" :why="t('installApp.why')" />
                    </div>
                    <div class="home-hero-visual">
                        <HomeShowcase />
                    </div>
                </header>

                <section class="home-section" aria-labelledby="home-featured-title">
                    <h2 id="home-featured-title">{{ t('featuredBuilds.title') }}</h2>
                    <p class="home-section-lead">{{ t('featuredBuilds.lead') }}</p>
                    <FeaturedBuilds />
                </section>

                <section class="home-section" aria-labelledby="home-why-title">
                    <h2 id="home-why-title">{{ t('homeView.whyTitle') }}</h2>
                    <ul class="home-reasons">
                        <li v-for="reason in reasons" :key="reason.title" class="home-reason">
                            <span class="home-reason-icon" aria-hidden="true">{{ reason.icon }}</span>
                            <h3>{{ t(reason.title) }}</h3>
                            <p>{{ t(reason.text) }}</p>
                        </li>
                    </ul>
                </section>

                <footer class="home-footer">
                    <p>{{ t('homeView.openSource') }}</p>
                    <p class="home-footer-links">
                        <a :href="guideUrl" target="_blank" rel="noopener">{{ t('homeView.userGuide') }}</a>
                        <a :href="sourceUrl" target="_blank" rel="noopener">{{ t('homeView.sourceCode') }}</a>
                    </p>
                </footer>
            </div>
        </section>
    `
};
