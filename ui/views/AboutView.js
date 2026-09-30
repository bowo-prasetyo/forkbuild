import { VERSION } from '../../core/version.js';
import { t } from '../i18n/i18n.js';

export default {
    name: 'AboutView',
    setup() {
        const versionString = `${VERSION.major}.${VERSION.minor}.${VERSION.patch}`;
        return { t, versionString };
    },
    template: `
        <section class="about-view">
            <h1>{{ t('aboutView.aboutForkbuild') }}</h1>
            <p>{{ t('aboutView.version', { versionString: versionString }) }}</p>
            <p>
                {{ t('aboutView.forkbuildIsAnOpenConstruction') }}
            </p>
            <p>
                <a href="https://github.com/bowo-prasetyo/forkbuild/blob/main/README.md" target="_blank" rel="noopener">{{ t('aboutView.projectReadme') }}</a>
                {{ t('aboutView.architectureMilestoneHistoryAndWhat') }}
            </p>
            <p>
                <a href="https://github.com/bowo-prasetyo/forkbuild/blob/main/docs/user/README.md" target="_blank" rel="noopener">{{ t('aboutView.userGuide') }}</a>
                {{ t('aboutView.howToBuildPublishFork') }}
            </p>
        </section>
    `
};
