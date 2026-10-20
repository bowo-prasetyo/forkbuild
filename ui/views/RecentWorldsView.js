import { defineAsyncComponent, inject } from 'vue';
import { useRouter } from 'vue-router';
import { LocalStorageProvider } from '../../storage/LocalStorageProvider.js';
import { LocalWorldExperienceStore } from '../../application/world/LocalWorldExperienceStore.js';
import { CreateDiscoveryUseCase } from '../../application/discovery/CreateDiscoveryUseCase.js';
import { descriptionSnippet } from '../../core/document/DescriptionMarkup.js';
import WorldCard from '../components/WorldCard.js';
import { t } from '../i18n/i18n.js';
import I18nText from '../i18n/I18nText.js';
import HelpedBuildsList from '../components/walkTogether/HelpedBuildsList.js';
import { useBuilderData } from '../composables/useBuilderData.js';
import { groupRecentWorlds } from './recentWorlds/recentWorldGroups.js';

// The ready-made builds, offered while nothing has been visited yet. Loaded
// when shown, since their thumbnails bring in Three.js.
const FeaturedBuilds = defineAsyncComponent(() => import('../components/featured/FeaturedBuilds.js'));

// 0.3.10 — World Persistence & Return Experience. "Recent Worlds": a
// local index of Worlds THIS replica has visited before, most-recent
// first — see LocalWorldExperienceStore#getRecentlyVisited(). No
// WorldNavigationSession is built here at all — unlike WorldView.js,
// this view never enters a live World (no avatar, no presence, no peer
// stack), so it reads the SAME underlying localStorage
// CreateWorldViewUseCase's own session would, directly through a
// lightweight LocalWorldExperienceStore + LocalStorageProvider pair
// (both cheap, stateless to construct — see
// application/discovery/CreateDiscoveryUseCase.js's own identical posture for
// discoveryProvider).
//
// Deliberately excludes anything requiring a live connection: online
// collaborator count, who's building right now. That is 0.2.98/0.3.0
// World Presence, which only ever exists for a World this replica has
// actually ENTERED in the current session — faking it for every World
// in a local history list (most of which are not currently loaded, let
// alone connected to) would mean inventing data, not deriving it. See
// docs/Principles.md, "Diagnostics Are Received From The Discovery
// Layer, Never Invented By The UI (0.2.30)" — the same restraint,
// applied here to presence instead of trust diagnostics.
//
// Structure/landmark counts ARE shown: those come from this replica's
// own locally-saved copy of the document (loadPublicationDocumentUseCase
// — the exact same local, synchronous, no-network lookup
// PublicationCatalog.js already uses to resolve a description), so
// they're genuinely current as of the last time this replica itself
// saved or synced that World — never a stale count baked into the
// LocalWorldExperience record itself (which stores none of this; see
// core/world/LocalWorldExperience.js's own header). The thumbnail and the
// description snippet come from the same two lookups: the Publication
// the World was found as (PublicationPreview renders from its content
// hash) and the local copy's own metadata.
//
// The World visited last is offered on its own, wider, to pick up where
// you left off; the rest are shelved by when they were visited (see
// recentWorlds/recentWorldGroups.js).
const RECENT_WORLDS_LIMIT = 20;

export default {
    name: 'RecentWorldsView',
    components: { I18nText, WorldCard, FeaturedBuilds, HelpedBuildsList },
    setup() {
        const router = useRouter();
        const localWorldExperienceStore = new LocalWorldExperienceStore({ storageProvider: new LocalStorageProvider() });
        // 0.9.339 — a World this replica visited before can be a
        // decentralized-origin Publication just as easily as a local
        // one; merging in the shared provider (see application/
        // CreateDiscoveryUseCase.js's own 0.9.339 comment) means its
        // title/author card renders correctly here too, instead of
        // falling back to the raw documentId.
        const decentralizedDiscoveryProvider = inject('decentralizedPublicationDiscoveryProvider', null);
        const { discoveryProvider, loadPublicationDocumentUseCase } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider });

        // Resolves ONE LocalWorldExperience record into a display
        // summary. Never throws — a World this replica visited before
        // but can no longer resolve locally (removed, or the id simply
        // isn't a document this replica has a local copy of) still gets
        // a card, just a sparser one: title falls back to the raw id,
        // and stats are omitted rather than shown as a misleading zero.
        function resolveWorldSummary(experience) {
            const documentId = experience.worldId;
            let title = null;
            let author = null;
            const publications = discoveryProvider.findByDocumentId(documentId);
            const publication = publications.length > 0 ? publications[0] : null;
            if (publication) {
                title = publication.title;
                author = publication.author;
            }

            let structureCount = null;
            let landmarkCount = null;
            let description = '';
            let hasLocalCopy = false;
            try {
                const document = loadPublicationDocumentUseCase.execute(documentId);
                if (!title) {
                    title = document.metadata.title;
                }
                description = descriptionSnippet(document.metadata.description);
                structureCount = document.world.getStructurePlacements().length;
                landmarkCount = document.world.getWorldLandmarks().length;
                hasLocalCopy = true;
            } catch (err) {
                // No local copy of this document anymore — the card
                // still renders from the local experience record alone.
            }

            const shownTitle = title || t('recentWorldsView.untitledWorld');
            return {
                documentId,
                title: shownTitle,
                author,
                description,
                // Never published: no content hash to render a thumbnail
                // from, so PublicationPreview keeps to its placeholder,
                // coloured by the World's id.
                preview: publication || { id: documentId, documentId, title: shownTitle, contentHash: null },
                hasLocalCopy,
                structureCount,
                landmarkCount,
                lastVisitedAt: experience.lastVisitedAt,
                cameraPerspective: experience.cameraPerspective
            };
        }

        // Resolved once, before the first render — every read above is
        // synchronous and local (localStorage plus the in-memory discovery
        // provider), so there is no loading state to track.
        const worlds = localWorldExperienceStore.getRecentlyVisited(RECENT_WORLDS_LIMIT).map(resolveWorldSummary);
        const { latest, groups } = groupRecentWorlds(worlds);

        function enterWorld(documentId) {
            router.push({ path: `/world/${documentId}` });
        }

        function openInEditor(documentId) {
            router.push({ path: '/editor', query: { load: documentId } });
        }

        // The builds this identity helped make with friends (Build with me).
        const builderData = useBuilderData();
        const helped = builderData.helpedBy(builderData.ownIdentityId());

        return { t, worlds, latest, groups, enterWorld, openInEditor, helped };
    },
    template: `
        <section class="recent-worlds-view">
            <h1>{{ t('recentWorldsView.myWorlds') }}</h1>
            <p class="recent-worlds-subtitle">{{ t('recentWorldsView.worldsYouVeVisitedBefore') }}</p>

            <template v-if="worlds.length === 0">
                <div class="empty-state">
                    <I18nText keypath="recentWorldsView.youHavenTVisitedAny">
                        <template #repository><router-link to="/repository">{{ t('recentWorldsView.browseTheRepository') }}</router-link></template>
                    </I18nText>
                </div>
                <section class="featured-builds-shelf" aria-labelledby="recent-worlds-featured-title">
                    <h2 id="recent-worlds-featured-title">{{ t('featuredBuilds.title') }}</h2>
                    <p class="featured-builds-shelf-lead">{{ t('featuredBuilds.lead') }}</p>
                    <FeaturedBuilds layout="row" />
                </section>
            </template>

            <template v-else>
                <section class="recent-worlds-latest" aria-labelledby="recent-worlds-latest-title">
                    <h2 id="recent-worlds-latest-title">{{ t('recentWorldsView.pickUpWhereYouLeftOff') }}</h2>
                    <ul class="publication-list recent-worlds-latest-list">
                        <WorldCard :world="latest" featured @enter="enterWorld" @open="openInEditor" />
                    </ul>
                </section>
                <section
                    v-for="group in groups"
                    :key="group.id"
                    :class="['recent-worlds-group', 'recent-worlds-group--' + group.id]"
                    :aria-labelledby="'recent-worlds-group-' + group.id"
                >
                    <h2 :id="'recent-worlds-group-' + group.id">{{ t(group.titleKey) }}</h2>
                    <ul class="publication-list">
                        <WorldCard
                            v-for="world in group.worlds"
                            :key="world.documentId"
                            :world="world"
                            @enter="enterWorld"
                            @open="openInEditor"
                        />
                    </ul>
                </section>
            </template>

            <section v-if="helped.length" class="helped-builds-shelf" aria-labelledby="recent-worlds-helped-title">
                <h2 id="recent-worlds-helped-title">{{ t('helpedBuilds.title') }}</h2>
                <p class="helped-builds-lead">{{ t('helpedBuilds.lead') }}</p>
                <HelpedBuildsList :builds="helped" />
            </section>
        </section>
    `
};
