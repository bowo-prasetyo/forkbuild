import { StarterCardStage } from '../../core/challenge/StarterJob.js';
import { t } from '../i18n/i18n.js';

// The card a build opened from something ready-made carries
// (core/challenge/StarterJob.js, starterCardStage): the job Home's main button left,
// or with no job a first brick of the builder's own, each with a button that
// picks the brick and turns Place on; then, once the build is theirs, a
// Publish button. `floating` puts it over the 3D view, for a phone, where the
// sidebar is a closed drawer. Emits pick, publish and hide.
export default {
    name: 'StarterJobCard',
    props: {
        stage: { type: String, required: true },
        floating: { type: Boolean, default: false }
    },
    emits: ['pick', 'publish', 'hide'],
    setup() {
        return { t, StarterCardStage };
    },
    template: `
        <section
            :class="['starter-job', { 'starter-job--done': stage === StarterCardStage.PUBLISH, 'starter-job--floating': floating }]"
            :data-stage="stage"
            aria-live="polite"
        >
            <template v-if="stage === StarterCardStage.JOB">
                <h4 class="starter-job-title">{{ t('starterJob.roofTitle') }}</h4>
                <p class="starter-job-text">{{ t('starterJob.roofText') }}</p>
                <button type="button" class="action-btn action-btn--primary starter-job-pick" @click="$emit('pick')">{{ t('starterJob.roofPick') }}</button>
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
