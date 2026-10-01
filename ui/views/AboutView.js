import { VERSION } from '../../core/version.js';
import { currentLocale, t } from '../i18n/i18n.js';
import { REPOSITORY_URL, userGuideUrl } from '../i18n/userGuide.js';

export default {
    name: 'AboutView',
    setup() {
        const versionString = `${VERSION.major}.${VERSION.minor}.${VERSION.patch}`;
        // The user guide in the language the app is showing; the project
        // README is English only.
        const readmeUrl = `${REPOSITORY_URL}/README.md`;
        const guideUrl = userGuideUrl(currentLocale().code);
        return { t, versionString, readmeUrl, guideUrl };
    },
    template: `
        <section class="about-view">
            <h1>{{ t('aboutView.aboutForkbuild') }}</h1>
            <p>{{ t('aboutView.version', { versionString: versionString }) }}</p>
            <p>
                {{ t('aboutView.forkbuildIsAnOpenConstruction') }}
            </p>
            <p>
                <a :href="readmeUrl" target="_blank" rel="noopener">{{ t('aboutView.projectReadme') }}</a>
                {{ t('aboutView.architectureMilestoneHistoryAndWhat') }}
            </p>
            <p>
                <a :href="guideUrl" target="_blank" rel="noopener">{{ t('aboutView.userGuide') }}</a>
                {{ t('aboutView.howToBuildPublishFork') }}
            </p>
        </section>
    `
};
