import { computed, defineAsyncComponent, inject, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { challengeAt, challengeById, isChallengeOpen, previousChallenge } from '../../core/BuildChallenge.js';
import { countRemixes, describeRemixSource } from '../../core/RemixLineage.js';
import { familyTreesOf } from '../../core/RemixFamily.js';
import { CreateChallengeEntriesUseCase } from '../../application/challenge/CreateChallengeEntriesUseCase.js';
import PublicationCard from '../components/PublicationCard.js';
import RemixFamilyTree from '../components/remix/RemixFamilyTree.js';
import { exploreRouteFor } from '../components/publicationCatalog/useRepositoryNetworkDiscovery.js';
import {
    challengeDatesText, challengeJoinRoute, challengeThemeBrief, challengeThemeTitle, challengeTimeText
} from '../components/challenge/challengeText.js';
import { t } from '../i18n/i18n.js';

const FeaturedBuilds = defineAsyncComponent(() => import('../components/featured/FeaturedBuilds.js'));

// A week's build challenge (core/BuildChallenge.js): this week's at
// /challenge, an earlier one at /challenge/<its Monday>. How to enter, Join
// while it runs, the entries (published builds carrying the week's tag,
// this device's own and those found on Nostr and Arweave when the page
// opens), and built-in builds to start from.
export default {
    name: 'ChallengeView',
    components: { PublicationCard, FeaturedBuilds, RemixFamilyTree },
    setup() {
        const route = useRoute();
        const router = useRouter();
        const entryLog = inject('challengeEntryLog', null);
        const entryDiscovery = inject('challengeEntryDiscovery', null);
        const networkPublicationLocatorStore = inject('networkPublicationLocatorStore', null);
        const { discoveryProvider, listEntries } = new CreateChallengeEntriesUseCase().execute({
            decentralizedDiscoveryProvider: inject('decentralizedPublicationDiscoveryProvider', null),
            entryLog
        });

        // Both routes show this page, so moving from one week to another
        // reuses it: everything below follows the route's week.
        const now = Date.now();
        const challenge = computed(() => (route.params.id ? challengeById(String(route.params.id)) : challengeAt(now)));
        const current = challengeAt(now);
        const view = computed(() => {
            const shown = challenge.value;
            if (!shown) return null;
            const previous = previousChallenge(shown);
            return {
                open: isChallengeOpen(shown, now),
                title: challengeThemeTitle(shown),
                brief: challengeThemeBrief(shown),
                dates: challengeDatesText(shown),
                time: challengeTimeText(shown, now),
                joinRoute: challengeJoinRoute(shown),
                previousRoute: { path: `/challenge/${previous.id}` },
                previousTitle: challengeThemeTitle(previous),
                isCurrent: shown.id === current.id
            };
        });

        const entries = ref([]);
        const remixCounts = ref({});
        const remixSources = ref({});
        const families = ref([]);
        function refresh() {
            if (!challenge.value) return;
            const items = listEntries(challenge.value.tag);
            const counts = {};
            const sources = {};
            for (const publication of items) {
                counts[publication.documentId] = countRemixes(discoveryProvider.findByParentId(publication.documentId), publication.documentId);
                if (publication.parentDocumentId) {
                    sources[publication.documentId] = describeRemixSource(publication, discoveryProvider.findByDocumentId(publication.parentDocumentId));
                }
            }
            entries.value = items;
            remixCounts.value = counts;
            remixSources.value = sources;
            families.value = familyTreesOf(items, {
                findByDocumentId: (documentId) => discoveryProvider.findByDocumentId(documentId),
                findByParentId: (documentId) => discoveryProvider.findByParentId(documentId)
            });
        }
        // A family member opens as the entries do.
        function familyRoute(member) {
            return member?.publication ? exploreRouteFor(member.publication, networkPublicationLocatorStore) : null;
        }

        // null | { searching: true } | { searching: false, found, pending }
        const networkSearch = ref(null);
        let unmounted = false;
        onBeforeUnmount(() => { unmounted = true; });
        async function searchNetworks() {
            const shown = challenge.value;
            if (!shown || !entryDiscovery || networkSearch.value?.searching) return;
            networkSearch.value = { searching: true };
            const result = await entryDiscovery.run(shown.tag);
            if (unmounted || challenge.value !== shown) {
                if (!unmounted) networkSearch.value = null;
                return;
            }
            networkSearch.value = { searching: false, found: result.found, pending: result.pending };
            if (result.found > 0) refresh();
        }
        const networkSearchText = computed(() => {
            const state = networkSearch.value;
            if (!state) return '';
            if (state.searching) return t('challenge.network.searching');
            const found = state.found > 0 ? t('challenge.network.found', { count: state.found }) : t('challenge.network.nothingNew');
            return state.pending > 0 ? `${found} ${t('publicationCatalog.network.pending', { count: state.pending })}` : found;
        });

        watch(challenge, () => {
            entries.value = [];
            networkSearch.value = null;
            refresh();
            searchNetworks();
        }, { immediate: true });

        return {
            t,
            challenge,
            view,
            entries, remixCounts, remixSources, families, familyRoute,
            networkSearch, networkSearchText, searchNetworks,
            openPublication: (pub) => router.push({ path: '/editor', query: { load: pub.documentId } }),
            forkPublication: (pub) => router.push({ path: '/editor', query: { fork: pub.documentId, publication: pub.id } }),
            explorePublication: (pub) => router.push(exploreRouteFor(pub, networkPublicationLocatorStore)),
            viewAuthor: (author) => { if (author) router.push({ path: `/author/${encodeURIComponent(author)}` }); }
        };
    },
    template: `
        <section class="challenge-view">
            <div v-if="!challenge" class="challenge-inner">
                <h1>{{ t('challenge.pageTitle') }}</h1>
                <p class="empty-state">{{ t('challenge.notFound') }}</p>
                <router-link to="/challenge" class="cta-button">{{ t('challenge.current') }}</router-link>
            </div>
            <div v-else class="challenge-inner">
                <header class="challenge-header">
                    <p class="challenge-kicker">
                        <span aria-hidden="true">🏆</span> {{ view.isCurrent ? t('challenge.weekly') : t('challenge.pageTitle') }}
                        <span class="challenge-card-time">{{ view.time }}</span>
                    </p>
                    <h1 class="challenge-title">{{ view.title }}</h1>
                    <p class="challenge-dates">{{ view.dates }}</p>
                    <p class="challenge-brief">{{ view.brief }}</p>
                    <p class="challenge-card-tag">#{{ challenge.tag }}</p>
                    <div class="challenge-card-actions">
                        <router-link v-if="view.open" :to="view.joinRoute" class="cta-button challenge-join">{{ t('challenge.join') }}</router-link>
                        <router-link v-if="!view.isCurrent" to="/challenge" class="home-cta-secondary challenge-current-link">{{ t('challenge.current') }}</router-link>
                        <router-link v-if="view.previousRoute" :to="view.previousRoute" class="home-cta-secondary challenge-previous-link">{{ t('challenge.previous', { theme: view.previousTitle }) }}</router-link>
                    </div>
                </header>

                <section v-if="view.open" class="challenge-section" aria-labelledby="challenge-how-title">
                    <h2 id="challenge-how-title">{{ t('challenge.howTitle') }}</h2>
                    <ol class="challenge-steps">
                        <li>{{ t('challenge.howJoin', { tag: challenge.tag }) }}</li>
                        <li>{{ t('challenge.howBuild', { tag: challenge.tag }) }}</li>
                        <li>{{ t('challenge.howPublish') }}</li>
                    </ol>
                </section>

                <section class="challenge-section" aria-labelledby="challenge-entries-title">
                    <h2 id="challenge-entries-title">
                        {{ t('challenge.entriesTitle') }}
                        <span class="challenge-entry-count">{{ t('challenge.entriesCount', { count: entries.length }) }}</span>
                    </h2>
                    <p v-if="networkSearch" class="publication-catalog-network" role="status">
                        <span>{{ networkSearchText }}</span>
                        <button
                            v-if="!networkSearch.searching"
                            type="button"
                            class="publication-catalog-network-again"
                            @click="searchNetworks"
                        >{{ t('publicationCatalog.network.searchAgain') }}</button>
                    </p>
                    <p v-if="entries.length === 0" class="empty-state challenge-no-entries">{{ view.open ? t('challenge.noEntries') : t('challenge.noEntriesEnded') }}</p>
                    <ul v-else class="publication-list challenge-entries">
                        <PublicationCard
                            v-for="pub in entries"
                            :key="pub.id"
                            :publication="pub"
                            :remix-source="remixSources[pub.documentId] || null"
                            :remix-count="remixCounts[pub.documentId] || 0"
                            @view.open="openPublication"
                            @fork="forkPublication"
                            @explore="explorePublication"
                            @view-author="viewAuthor"
                        />
                    </ul>
                </section>

                <section v-if="families.length" class="challenge-section challenge-families" aria-labelledby="challenge-families-title">
                    <h2 id="challenge-families-title">{{ t('challenge.familiesTitle') }}</h2>
                    <p class="home-section-lead">{{ t('challenge.familiesLead') }}</p>
                    <RemixFamilyTree v-for="family in families" :key="family.build.documentId" :family="family" :route-for="familyRoute" />
                </section>

                <section v-if="view.open" class="challenge-section" aria-labelledby="challenge-ideas-title">
                    <h2 id="challenge-ideas-title">{{ t('challenge.ideasTitle') }}</h2>
                    <p class="home-section-lead">{{ t('challenge.ideasLead') }}</p>
                    <FeaturedBuilds :key="challenge.id" layout="row" :ids="challenge.ideaStructureIds" :challenge-id="challenge.id" />
                </section>
            </div>
        </section>
    `
};
