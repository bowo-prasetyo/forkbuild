import { computed, ref, watch } from 'vue';
import { FIRST_BUILD_STEPS, isFirstBuildComplete, nextFirstBuildStep } from '../../core/challenge/FirstBuildChecklist.js';
import { t } from '../i18n/i18n.js';

// The guided first build in the Editor (core/challenge/FirstBuildChecklist.js): six
// steps with the next one's hint, ticked off as they are done, and a short
// celebration once the build is shared and walked into. While walking inside
// is next and the build is published, the hint has a Walk inside it button
// (`walkRoute`, World View at the build's door). It can fold to a small
// button (as it starts on a phone), or be hidden (the command palette's
// First-Build Guide brings it back). While `quiet` (a starter job is open,
// ui/components/StarterJobCard.js, and is the one tutor) it folds, and opens
// again as it started once the job is done. While `placing` (Place is on) it
// shrinks to its title, count and the next step's hint, so it doesn't cover
// the build being placed (finding P2-11 of
// docs/reviews/EditorPlacementUX-2026-10-27.md); its + shows every step, and
// it opens in full again once placing stops. It only shows `progress` and
// reports what the person chose.
const STEP_KEYS = Object.freeze({
    'place-brick': 'placeBrick',
    stack: 'stack',
    own: 'own',
    save: 'save',
    share: 'share',
    'walk-inside': 'walkInside'
});

export default {
    name: 'FirstBuildGuide',
    props: {
        progress: { type: Object, required: true },
        // Where Walk inside it goes, once the build is published; null before.
        walkRoute: { type: Object, default: null },
        // Fold while something else is teaching (a starter job).
        quiet: { type: Boolean, default: false },
        // Place is on: shrink to the next step's hint.
        placing: { type: Boolean, default: false }
    },
    emits: ['dismiss', 'celebrated'],
    setup(props) {
        // On a phone-width screen it starts folded: open, it would cover much of the build.
        const startsFolded = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
            && window.matchMedia('(max-width: 720px)').matches;
        const folded = ref(startsFolded || props.quiet);
        watch(() => props.quiet, (quiet) => { folded.value = quiet || startsFolded; });
        // Every step asked for while placing; asked for once, until placing stops.
        const expanded = ref(false);
        watch(() => props.placing, (placing) => { if (!placing) expanded.value = false; });
        const compact = computed(() => props.placing && !expanded.value);
        function open() {
            folded.value = false;
            expanded.value = true;
        }
        const steps = computed(() => {
            const done = new Set(props.progress.completed);
            const next = nextFirstBuildStep(props.progress);
            return FIRST_BUILD_STEPS.map((id) => ({ id, key: STEP_KEYS[id], done: done.has(id), current: id === next }));
        });
        const doneCount = computed(() => props.progress.completed.length);
        const complete = computed(() => isFirstBuildComplete(props.progress));
        const current = computed(() => steps.value.find((step) => step.current) ?? null);
        return { t, folded, expanded, compact, open, steps, doneCount, complete, current, total: FIRST_BUILD_STEPS.length };
    },
    template: `
        <section v-if="complete" class="first-build-guide first-build-guide--done" role="status" :aria-label="t('firstBuild.title')">
            <div class="first-build-confetti" aria-hidden="true">
                <span v-for="n in 12" :key="n" :class="'first-build-confetti-piece first-build-confetti-piece--' + n"></span>
            </div>
            <p class="first-build-celebration-title">🎉 {{ t('firstBuild.doneTitle') }}</p>
            <p class="first-build-celebration-text">{{ t('firstBuild.doneText') }}</p>
            <div class="first-build-actions">
                <router-link class="action-btn action-btn--secondary" to="/repository" @click="$emit('celebrated')">{{ t('firstBuild.explore') }}</router-link>
                <button type="button" class="action-btn action-btn--primary" @click="$emit('celebrated')">{{ t('firstBuild.close') }}</button>
            </div>
        </section>
        <button
            v-else-if="folded"
            type="button"
            class="first-build-guide-pill"
            :aria-label="t('firstBuild.openLabel', { done: doneCount, total })"
            @click="open"
        >{{ t('firstBuild.pill', { done: doneCount, total }) }}</button>
        <section
            v-else-if="compact"
            class="first-build-guide first-build-guide--compact"
            :aria-label="t('firstBuild.title')"
            :data-current="current ? current.id : null"
        >
            <header class="first-build-header">
                <h2 class="first-build-title">{{ t('firstBuild.title') }}</h2>
                <span class="first-build-count">{{ t('firstBuild.count', { done: doneCount, total }) }}</span>
                <button type="button" class="first-build-expand-btn" :title="t('firstBuild.expand')" :aria-label="t('firstBuild.expand')" @click="expanded = true">+</button>
                <button type="button" class="first-build-icon-btn" :title="t('firstBuild.fold')" :aria-label="t('firstBuild.fold')" @click="folded = true">–</button>
            </header>
            <p v-if="current" class="first-build-hint">{{ t('firstBuild.hint.' + current.key) }}</p>
        </section>
        <section v-else class="first-build-guide" :aria-label="t('firstBuild.title')" :data-current="current ? current.id : null">
            <header class="first-build-header">
                <h2 class="first-build-title">{{ t('firstBuild.title') }}</h2>
                <span class="first-build-count">{{ t('firstBuild.count', { done: doneCount, total }) }}</span>
                <button type="button" class="first-build-icon-btn" :title="t('firstBuild.fold')" :aria-label="t('firstBuild.fold')" @click="folded = true">–</button>
            </header>
            <ol class="first-build-steps">
                <li
                    v-for="step in steps"
                    :key="step.id"
                    :class="['first-build-step', { 'first-build-step--done': step.done, 'first-build-step--current': step.current }]"
                    :data-step="step.id"
                    :aria-current="step.current ? 'step' : null"
                >
                    <span class="first-build-check" aria-hidden="true">{{ step.done ? '✓' : '' }}</span>
                    <span class="first-build-step-label">{{ t('firstBuild.step.' + step.key) }}</span>
                    <span v-if="step.done" class="visually-hidden">{{ t('firstBuild.doneMark') }}</span>
                </li>
            </ol>
            <p v-if="current" class="first-build-hint">{{ t('firstBuild.hint.' + current.key) }}</p>
            <router-link
                v-if="current && current.id === 'walk-inside' && walkRoute"
                :to="walkRoute"
                class="action-btn action-btn--primary first-build-walk"
            >{{ t('firstBuild.walk') }}</router-link>
            <div class="first-build-footer">
                <button type="button" class="first-build-link-btn" @click="$emit('dismiss')">{{ t('firstBuild.hide') }}</button>
            </div>
        </section>
    `
};
