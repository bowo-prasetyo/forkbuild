import BuildTurntable from '../featured/BuildTurntable.js';
import { SHOWCASE_STRUCTURE_IDS, composeShowcase, featuredStructures } from '../../../application/home/FeaturedBuilds.js';
import { t } from '../../i18n/i18n.js';

// Home's 3D showcase: a small village of built-in structures, turning
// slowly (BuildTurntable). Loaded after Home first renders
// (ui/views/HomeView.js), since it brings in Three.js.
export default {
    name: 'HomeShowcase',
    components: { BuildTurntable },
    setup() {
        const village = ({ brickRegistry, structureRegistry }) =>
            composeShowcase(featuredStructures(structureRegistry, SHOWCASE_STRUCTURE_IDS), brickRegistry);
        return { t, village };
    },
    template: `
        <div class="home-showcase">
            <BuildTurntable :bricks="village" :label="t('homeView.showcaseLabel')" :fallback-label="t('homeView.showcaseFallback')" />
        </div>
    `
};
