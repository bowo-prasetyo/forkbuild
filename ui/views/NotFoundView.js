import { t } from '../i18n/i18n.js';

// An address no page answers: a mistyped link, or one to a page a later
// version retired (the leaderboards, reconciliation). Says so, instead of an
// empty page, and offers the two places a visitor most likely wanted.
export default {
    name: 'NotFoundView',
    setup() {
        return { t };
    },
    template: `
        <section class="about-view not-found-view">
            <h1>{{ t('notFoundView.title') }}</h1>
            <p>{{ t('notFoundView.explanation') }}</p>
            <p>
                <router-link to="/" class="cta-button">{{ t('notFoundView.goHome') }}</router-link>
                <router-link to="/editor" class="not-found-view-editor">{{ t('notFoundView.openEditor') }}</router-link>
            </p>
        </section>
    `
};
