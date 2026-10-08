import BuildLibraryPreview from '../BuildLibraryPreview.js';
import { FEATURED_STRUCTURE_IDS, featuredStructures } from '../../../application/home/FeaturedBuilds.js';
import { homeLibrary } from './homeLibrary.js';
import { libraryItemDescription, libraryItemName } from '../../i18n/libraryText.js';
import { t } from '../../i18n/i18n.js';

// Home's ready-made builds: a card for each featured built-in structure,
// with its thumbnail, that opens it in the Editor as a new document of the
// visitor's own (`/editor?start=<id>`). Loaded after Home first renders,
// with HomeShowcase.
export default {
    name: 'HomeFeaturedBuilds',
    components: { BuildLibraryPreview },
    setup() {
        const { structureRegistry, previewService } = homeLibrary();
        const builds = featuredStructures(structureRegistry, FEATURED_STRUCTURE_IDS).map((structure) => ({
            structure,
            name: libraryItemName(structure),
            description: libraryItemDescription(structure),
            to: { path: '/editor', query: { start: structure.id } }
        }));
        return { t, builds, previewService };
    },
    template: `
        <ul class="home-featured-grid">
            <li v-for="build in builds" :key="build.structure.id" class="home-featured-card">
                <router-link :to="build.to" class="home-featured-link" :aria-label="t('homeView.openCopyOf', { name: build.name })">
                    <BuildLibraryPreview kind="structure" :item="build.structure" :preview-service="previewService" />
                    <span class="home-featured-name">{{ build.name }}</span>
                    <span class="home-featured-description">{{ build.description }}</span>
                    <span class="home-featured-action">{{ t('homeView.remix') }}</span>
                </router-link>
            </li>
        </ul>
    `
};
