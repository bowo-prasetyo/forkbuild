import { t } from '../../i18n/i18n.js';
import I18nText from '../../i18n/I18nText.js';

// Builds someone helped make with friends (application/buildTogether/
// helpedBuilds.js): each by title, whose build it is (a link to their page),
// and where it opens, if anywhere yet.
export default {
    name: 'HelpedBuildsList',
    components: { I18nText },
    props: {
        // [{ documentId, title, authorName, route, authorRoute, publication }]
        builds: { type: Array, default: () => [] }
    },
    setup() {
        return { t };
    },
    template: `
        <ul class="helped-builds-list">
            <li v-for="build in builds" :key="build.documentId" class="helped-build">
                <router-link v-if="build.route" :to="build.route" class="helped-build-title">{{ build.title || t('remixFamily.untitled') }}</router-link>
                <span v-else class="helped-build-title">{{ build.title || t('remixFamily.untitled') }}</span>
                <span v-if="build.authorName" class="helped-build-author">
                    <I18nText keypath="helpedBuilds.withAuthor"><template #name><router-link v-if="build.authorRoute" :to="build.authorRoute">{{ build.authorName }}</router-link><template v-else>{{ build.authorName }}</template></template></I18nText>
                </span>
                <span v-if="!build.publication" class="helped-build-note">{{ t('helpedBuilds.notPublished') }}</span>
            </li>
        </ul>
    `
};
