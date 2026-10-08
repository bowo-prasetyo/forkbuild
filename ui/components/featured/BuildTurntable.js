import { onBeforeUnmount, onMounted, ref } from 'vue';
import { ShowcaseTurntableRenderer } from '../../../renderer/ShowcaseTurntableRenderer.js';
import { canDrawWebGl, featuredLibrary } from './featuredLibrary.js';
import { t } from '../../i18n/i18n.js';

// Some bricks on a patch of grass, turning slowly (renderer/
// ShowcaseTurntableRenderer.js): Home's showcase and the build a shared link
// opens on. `bricks` is called once mounted, with the built-in brick and
// structure libraries, and returns the bricks to draw. Brings in Three.js, so
// hosts load it after they render. It turns only while on screen, holds still
// for people who ask for reduced motion, and shows the ForkBuild cube instead
// where WebGL can't draw or the bricks can't be drawn. With `draggable`, a
// sideways drag turns it by hand (an embedded build, ui/embed/), and
// `turned` is emitted on the first drag.
export default {
    name: 'BuildTurntable',
    props: {
        bricks: { type: Function, required: true },
        label: { type: String, required: true },
        // What the cube stands for when shown instead; the label by default.
        fallbackLabel: { type: String, default: null },
        draggable: { type: Boolean, default: false }
    },
    emits: ['turned'],
    setup(props, { emit }) {
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
                renderer.show(props.bricks({ brickRegistry, structureRegistry }));
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

        // Half a turn across a 600px-wide frame.
        const RADIANS_PER_PIXEL = Math.PI / 600;
        let dragging = null;
        let turned = false;
        function startDrag(event) {
            if (!props.draggable || !renderer) return;
            dragging = { pointerId: event.pointerId, x: event.clientX };
            canvas.value?.setPointerCapture?.(event.pointerId);
        }
        function drag(event) {
            if (!dragging || event.pointerId !== dragging.pointerId) return;
            const dx = event.clientX - dragging.x;
            dragging.x = event.clientX;
            if (dx === 0) return;
            renderer?.turnBy(-dx * RADIANS_PER_PIXEL);
            if (!turned) {
                turned = true;
                emit('turned');
            }
        }
        function endDrag(event) {
            if (dragging && event.pointerId === dragging.pointerId) dragging = null;
        }

        onBeforeUnmount(() => {
            resizeObserver?.disconnect();
            visibilityObserver?.disconnect();
            renderer?.dispose();
            renderer = null;
        });

        return { t, canvas, failed, startDrag, drag, endDrag };
    },
    template: `
        <img v-if="failed" class="build-turntable-fallback" src="favicon.svg" :alt="fallbackLabel || label">
        <canvas
            v-else
            ref="canvas"
            :class="['build-turntable-canvas', { 'build-turntable-canvas--draggable': draggable }]"
            role="img"
            :aria-label="label"
            @pointerdown="startDrag"
            @pointermove="drag"
            @pointerup="endDrag"
            @pointercancel="endDrag"
        ></canvas>
    `
};
