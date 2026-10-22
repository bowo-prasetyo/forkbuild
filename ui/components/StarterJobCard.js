import { StarterCardStage } from '../../core/challenge/StarterJob.js';
import { t } from '../i18n/i18n.js';

// The card a build opened from something ready-made carries
// (core/challenge/StarterJob.js, starterCardStage): the job Home's main button left,
// one step at a time (`step`: its id, its place in the chain and, for a step
// of several bricks, how many are in), or with no job a first brick of the
// builder's own, each with a button that picks the brick and turns Place on;
// then, once the build is theirs, a Publish button. While a job is open it is
// the only tutor: the first-build guide folds and no toast repeats it.
// `floating` puts it over the 3D view, for a phone, where the sidebar is a
// closed drawer. Emits pick, publish and hide.
const STEP_COUNTS = Object.freeze({ path: 'starterJob.pathCount', garden: 'starterJob.gardenCount' });
export default {
    name: 'StarterJobCard',
    props: {
        stage: { type: String, required: true },
        floating: { type: Boolean, default: false },
        // The job's current step: { id, index, total, placed, needed }.
        step: { type: Object, default: null }
    },
    emits: ['pick', 'publish', 'hide'],
    setup() {
        return { t, StarterCardStage, STEP_COUNTS };
    },
    template: `
        <section
            :class="['starter-job', { 'starter-job--done': stage === StarterCardStage.PUBLISH, 'starter-job--floating': floating }]"
            :data-stage="stage"
            aria-live="polite"
        >
            <template v-if="stage === StarterCardStage.JOB && step">
                <p class="starter-job-progress" :data-step="step.id">
                    <span class="starter-job-dots" aria-hidden="true">
                        <span
                            v-for="n in step.total"
                            :key="n"
                            :class="['starter-job-dot', { 'starter-job-dot--done': n - 1 < step.index, 'starter-job-dot--current': n - 1 === step.index }]"
                        ></span>
                    </span>
                    {{ t('starterJob.step', { step: step.index + 1, total: step.total }) }}
                </p>
                <h4 class="starter-job-title">{{ t('starterJob.' + step.id + 'Title') }}</h4>
                <p class="starter-job-text">{{ t('starterJob.' + step.id + 'Text') }}</p>
                <p v-if="STEP_COUNTS[step.id]" class="starter-job-count">{{ t(STEP_COUNTS[step.id], { placed: step.placed, needed: step.needed }) }}</p>
                <button type="button" class="action-btn action-btn--primary starter-job-pick" @click="$emit('pick')">{{ t('starterJob.' + step.id + 'Pick') }}</button>
            </template>
            <template v-else-if="stage === StarterCardStage.FIRST_EDIT">
                <h4 class="starter-job-title">{{ t('starterJob.firstEditTitle') }}</h4>
                <p class="starter-job-text">{{ t('starterJob.firstEditText') }}</p>
                <button type="button" class="action-btn action-btn--primary starter-job-pick" @click="$emit('pick')">{{ t('starterJob.firstEditPick') }}</button>
            </template>
            <template v-else>
                <h4 class="starter-job-title">{{ t('starterJob.doneTitle') }}</h4>
                <p class="starter-job-text">{{ t('starterJob.doneText') }}</p>
                <div class="starter-job-actions">
                    <button type="button" class="action-btn action-btn--primary starter-job-publish" @click="$emit('publish')">{{ t('starterJob.publish') }}</button>
                    <button type="button" class="action-btn action-btn--secondary starter-job-later" @click="$emit('hide')">{{ t('starterJob.keepBuilding') }}</button>
                </div>
            </template>
        </section>
    `
};
