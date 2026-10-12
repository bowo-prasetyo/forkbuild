import { t } from '../i18n/i18n.js';

// The job Home's main button leaves a newcomer (core/StarterJob.js): a card
// at the top of the Editor's sidebar naming it, with a button that picks the
// brick for it and turns Place on. Once it's done, it says the build is
// theirs now and what else they could add. Emits pick.
export default {
    name: 'StarterJobCard',
    props: {
        done: { type: Boolean, default: false }
    },
    emits: ['pick'],
    setup() {
        return { t };
    },
    template: `
        <section :class="['starter-job', { 'starter-job--done': done }]" aria-live="polite">
            <template v-if="!done">
                <h4 class="starter-job-title">{{ t('starterJob.roofTitle') }}</h4>
                <p class="starter-job-text">{{ t('starterJob.roofText') }}</p>
                <button type="button" class="action-btn action-btn--primary starter-job-pick" @click="$emit('pick')">{{ t('starterJob.roofPick') }}</button>
            </template>
            <template v-else>
                <h4 class="starter-job-title">{{ t('starterJob.doneTitle') }}</h4>
                <p class="starter-job-text">{{ t('starterJob.doneText') }}</p>
            </template>
        </section>
    `
};
