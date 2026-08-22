import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { LocalStorageProvider } from '../../storage/LocalStorageProvider.js';
import { LocalWorldExperienceStore } from '../../application/LocalWorldExperienceStore.js';
import { CreateDiscoveryUseCase } from '../../application/CreateDiscoveryUseCase.js';
import WorldCard from '../components/WorldCard.js';

// 0.3.10 — World Persistence & Return Experience. "Recent Worlds": a
// local index of Worlds THIS replica has visited before, most-recent
// first — see LocalWorldExperienceStore#getRecentlyVisited(). No
// WorldNavigationSession is built here at all — unlike WorldView.js,
// this view never enters a live World (no avatar, no presence, no peer
// stack), so it reads the SAME underlying localStorage
// CreateWorldViewUseCase's own session would, directly through a
// lightweight LocalWorldExperienceStore + LocalStorageProvider pair
// (both cheap, stateless to construct — see
// application/CreateDiscoveryUseCase.js's own identical posture for
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
// core/LocalWorldExperience.js's own header).
const RECENT_WORLDS_LIMIT = 20;

export default {
    name: 'RecentWorldsView',
    components: { WorldCard },
    setup() {
        const router = useRouter();
        const localWorldExperienceStore = new LocalWorldExperienceStore({ storageProvider: new LocalStorageProvider() });
        const { discoveryProvider, loadPublicationDocumentUseCase } = new CreateDiscoveryUseCase().execute();

        const worlds = ref([]);
        const loaded = ref(false);

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
            if (publications.length > 0) {
                title = publications[0].title;
                author = publications[0].author;
            }

            let structureCount = null;
            let landmarkCount = null;
            try {
                const document = loadPublicationDocumentUseCase.execute(documentId);
                if (!title) {
                    title = document.metadata.title;
                }
                structureCount = document.world.getStructurePlacements().length;
                landmarkCount = document.world.getWorldLandmarks().length;
            } catch (err) {
                // No local copy of this document anymore — the card
                // still renders from the local experience record alone.
            }

            return {
                documentId,
                title: title || 'Untitled World',
                author,
                structureCount,
                landmarkCount,
                lastVisitedAt: experience.lastVisitedAt,
                cameraPerspective: experience.cameraPerspective
            };
        }

        onMounted(() => {
            const experiences = localWorldExperienceStore.getRecentlyVisited(RECENT_WORLDS_LIMIT);
            worlds.value = experiences.map(resolveWorldSummary);
            loaded.value = true;
        });

        function enterWorld(documentId) {
            router.push({ path: `/world/${documentId}` });
        }

        return { worlds, loaded, enterWorld };
    },
    template: `
        <section class="recent-worlds-view">
            <h1>My Worlds</h1>
            <p class="recent-worlds-subtitle">Worlds you've visited before, on this device.</p>

            <div v-if="loaded && worlds.length === 0" class="empty-state">
                You haven't visited any Worlds yet on this device.
                <router-link to="/repository">Browse the Repository</router-link> to find one.
            </div>

            <ul v-else class="publication-list">
                <WorldCard
                    v-for="world in worlds"
                    :key="world.documentId"
                    :world="world"
                    @enter="enterWorld"
                />
            </ul>
        </section>
    `
};
