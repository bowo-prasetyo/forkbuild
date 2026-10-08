import BuildLibraryPreview from '../BuildLibraryPreview.js';
import { FEATURED_STRUCTURE_IDS, featuredStructures } from '../../../application/home/FeaturedBuilds.js';
import { featuredLibrary } from './featuredLibrary.js';
import { libraryItemDescription, libraryItemName } from '../../i18n/libraryText.js';
import { t } from '../../i18n/i18n.js';

// The ready-made builds: a card for each featured built-in structure, with
// its thumbnail, that opens it in the Editor as a new document of the
// visitor's own (`/editor?start=<id>`). Home shows them as a grid; the
// Repository and My Worlds as one row (`layout="row"`) that scrolls
// sideways when it doesn't fit. Hosts load this with defineAsyncComponent(),
// since thumbnails bring in Three.js.
export default {
    name: 'FeaturedBuilds',
    components: { BuildLibraryPreview },
    props: {
        layout: { type: String, default: 'grid' } // 'grid' | 'row'
    },
    setup() {
        const { structureRegistry, previewService } = featuredLibrary();
        const builds = featuredStructures(structureRegistry, FEATURED_STRUCTURE_IDS).map((structure) => ({
            structure,
            name: libraryItemName(structure),
            description: libraryItemDescription(structure),
            to: { path: '/editor', query: { start: structure.id } }
        }));
        return { t, builds, previewService };
    },
    template: `
        <ul :class="['featured-builds', 'featured-builds--' + layout]">
            <li v-for="build in builds" :key="build.structure.id" class="featured-build-card">
                <router-link :to="build.to" class="featured-build-link" :aria-label="t('featuredBuilds.openCopyOf', { name: build.name })">
                    <BuildLibraryPreview kind="structure" :item="build.structure" :preview-service="previewService" />
                    <span class="featured-build-name">{{ build.name }}</span>
                    <span class="featured-build-description">{{ build.description }}</span>
                    <span class="featured-build-action">{{ t('featuredBuilds.remix') }}</span>
                </router-link>
            </li>
        </ul>
    `
};
