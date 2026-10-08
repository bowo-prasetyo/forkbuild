import { onBeforeUnmount, onMounted, ref } from 'vue';
import { ShowcaseTurntableRenderer } from '../../../renderer/ShowcaseTurntableRenderer.js';
import { SHOWCASE_STRUCTURE_IDS, composeShowcase, featuredStructures } from '../../../application/home/FeaturedBuilds.js';
import { canDrawWebGl, featuredLibrary } from '../featured/featuredLibrary.js';
import { t } from '../../i18n/i18n.js';

// Home's 3D showcase: a small village of built-in structures, turning
// slowly. Loaded after Home first renders (ui/views/HomeView.js), since it
// brings in Three.js. It turns only while on screen, holds still for people
// who ask for reduced motion, and shows the ForkBuild cube instead where
// WebGL can't draw.
export default {
    name: 'HomeShowcase',
    setup() {
        const canvas = ref(null);
        const failed = ref(false);
        let renderer = null;
        let resizeObserver = null;
        let visibilityObserver = null;

        onMounted(() => {
            if (!canDrawWebGl()) {
                failed.value = true;
                return;
            }
            try {
                const { brickRegistry, structureRegistry } = featuredLibrary();
                const reducedMotion = typeof window.matchMedia === 'function'
                    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                renderer = new ShowcaseTurntableRenderer(brickRegistry, canvas.value, { reducedMotion });
                renderer.resize();
                renderer.show(composeShowcase(featuredStructures(structureRegistry, SHOWCASE_STRUCTURE_IDS), brickRegistry));
            } catch {
                renderer?.dispose();
                renderer = null;
                failed.value = true;
                return;
            }
            if (typeof ResizeObserver === 'function') {
                resizeObserver = new ResizeObserver(() => renderer?.resize());
                resizeObserver.observe(canvas.value);
            }
            if (typeof IntersectionObserver === 'function') {
                visibilityObserver = new IntersectionObserver((entries) => {
                    if (entries.some((entry) => entry.isIntersecting)) renderer?.start();
                    else renderer?.stop();
                });
                visibilityObserver.observe(canvas.value);
            } else {
                renderer.start();
            }
        });

        onBeforeUnmount(() => {
            resizeObserver?.disconnect();
            visibilityObserver?.disconnect();
            renderer?.dispose();
            renderer = null;
        });

        return { t, canvas, failed };
    },
    template: `
        <div class="home-showcase">
            <img v-if="failed" class="home-showcase-fallback" src="favicon.svg" :alt="t('homeView.showcaseFallback')">
            <canvas v-else ref="canvas" class="home-showcase-canvas" role="img" :aria-label="t('homeView.showcaseLabel')"></canvas>
        </div>
    `
};
