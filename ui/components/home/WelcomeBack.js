import { computed, inject, onMounted, ref } from 'vue';
import { challengeAt, isChallengeOpen } from '../../../core/challenge/BuildChallenge.js';
import { daysSince, enteredChallenge, welcomeBack } from '../../../application/home/WelcomeBack.js';
import { DocumentManifest } from '../../../application/document/DocumentManifest.js';
import { LocalDiscoveryProvider } from '../../../discovery/LocalDiscoveryProvider.js';
import { LocalStorageProvider } from '../../../storage/LocalStorageProvider.js';
import { challengeJoinRoute, challengeThemeTitle } from '../challenge/challengeText.js';
import { useMyBuildsRoute } from '../../composables/useMyBuildsRoute.js';
import { t } from '../../i18n/i18n.js';

// Home's Welcome back (application/home/WelcomeBack.js): for a device with a
// saved build, the way straight back to the one changed last, a nudge to
// publish it or to enter this week's challenge, and My Builds. A newcomer
// sees nothing. The card shows as soon as the saved builds are read; the
// challenge link joins it once this device's entries are checked.
// `welcome` (with `enteredChallenge`) and `now` stand in for this device's
// records (tests).
export default {
    name: 'WelcomeBack',
    props: {
        welcome: { type: Object, default: null },
        now: { type: Number, default: null }
    },
    setup(props) {
        const now = props.now ?? Date.now();
        const challenge = challengeAt(now);
        const welcome = ref(null);
        // null until known, so the link never shows and then goes.
        const entered = ref(null);
        const funnelEventCounter = inject('funnelEventCounter', null);
        const myBuildsRoute = useMyBuildsRoute();

        onMounted(async () => {
            if (props.welcome) {
                welcome.value = props.welcome;
                entered.value = props.welcome.enteredChallenge === true;
                return;
            }
            try {
                const storageProvider = new LocalStorageProvider();
                const ownPublications = new LocalDiscoveryProvider(storageProvider).list();
                welcome.value = welcomeBack({ savedBuilds: new DocumentManifest(storageProvider).list(), ownPublications });
                if (!welcome.value) return;
                entered.value = await enteredChallenge({ ownPublications, challenge, loadSnapshot: (name) => storageProvider.loadAsync(name) });
            } catch {
                if (welcome.value && entered.value === null) entered.value = true;
            }
        });

        const buildRoute = computed(() => (welcome.value ? { path: '/editor', query: { load: welcome.value.build.documentId } } : null));
        const keepLabel = computed(() => {
            const title = welcome.value?.build.title;
            return title ? t('welcomeBack.keepBuildingTitled', { title }) : t('welcomeBack.keepBuilding');
        });
        const lead = computed(() => {
            const count = welcome.value?.publishedBuilds ?? 0;
            return count > 0 ? t('welcomeBack.published', { count }) : t('welcomeBack.notPublished');
        });
        const changed = computed(() => {
            if (!welcome.value) return '';
            const days = daysSince(welcome.value.build.modified, now);
            if (days === 0) return t('welcomeBack.changedToday');
            if (days === 1) return t('welcomeBack.changedYesterday');
            return t('welcomeBack.changedDaysAgo', { count: days });
        });
        // Only while the week runs and nothing of this device's has entered it.
        const challengeRoute = computed(() => (welcome.value && entered.value === false && isChallengeOpen(challenge, now)
            ? challengeJoinRoute(challenge)
            : null));

        function keptBuilding() {
            funnelEventCounter?.keptBuilding();
        }

        return {
            t, welcome, buildRoute, keepLabel, lead, changed, challengeRoute, myBuildsRoute, keptBuilding,
            challengeLabel: t('welcomeBack.joinChallenge', { theme: challengeThemeTitle(challenge) })
        };
    },
    template: `
        <section v-if="welcome" class="welcome-back" aria-labelledby="welcome-back-title">
            <div class="welcome-back-text">
                <h2 id="welcome-back-title" class="welcome-back-title">{{ t('welcomeBack.title') }}</h2>
                <p class="welcome-back-lead">{{ lead }}</p>
            </div>
            <div class="welcome-back-actions">
                <router-link :to="buildRoute" class="cta-button welcome-back-keep" @click="keptBuilding">{{ keepLabel }}</router-link>
                <router-link v-if="challengeRoute" :to="challengeRoute" class="home-cta-secondary welcome-back-challenge">{{ challengeLabel }}</router-link>
                <router-link v-if="myBuildsRoute" :to="myBuildsRoute" class="home-cta-secondary welcome-back-my-builds">{{ t('app.nav.myBuilds') }}</router-link>
            </div>
            <p class="welcome-back-changed">{{ changed }}</p>
        </section>
    `
};
