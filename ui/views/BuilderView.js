import { computed } from 'vue';
import { useRoute } from 'vue-router';
import FollowButton from '../components/FollowButton.js';
import HelpedBuildsList from '../components/walkTogether/HelpedBuildsList.js';
import { useBuilderData } from '../composables/useBuilderData.js';
import { builderProfile } from '../../application/buildTogether/builderProfile.js';
import { builtWithNames, builderRoute } from '../components/remix/builtWithText.js';
import { shortIdentityId } from './following/followedPeople.js';
import { t } from '../i18n/i18n.js';

// One person's page, by identity (`#/builder/<identity>`): the builds their
// identity signed, and the builds others published crediting them as having
// built it together (application/buildTogether/builderProfile.js), as far as
// this device knows; Follow; and, on your own page, the builds you helped
// make. Credited names and a shared build's author link here
// (ui/components/remix/BuiltWithNames.js). Unlike the Repository's author
// pages, which go by the typed name several people may share, this goes by
// the identity that signs.
export default {
    name: 'BuilderView',
    components: { FollowButton, HelpedBuildsList },
    setup() {
        const route = useRoute();
        const data = useBuilderData();
        const identityId = computed(() => (typeof route.params.identityId === 'string' ? route.params.identityId : ''));
        const profile = computed(() => builderProfile({ identityId: identityId.value, publications: data.publications(), signerOf: data.signerOf }));
        const isYou = computed(() => Boolean(identityId.value) && identityId.value === data.ownIdentityId());
        const name = computed(() => profile.value.name || (typeof route.query.name === 'string' && route.query.name.trim() ? route.query.name.trim() : null));
        const helped = computed(() => (isYou.value ? data.helpedBy(identityId.value) : []));
        const worldRoute = (publication) => ({ path: `/world/${publication.documentId}` });
        // "Harbor by Ana, built with Kim": whose build, and who else built it.
        function creditLine(publication) {
            const title = publication.title || t('remixFamily.untitled');
            const others = builtWithNames((publication.builtWith || []).filter((entry) => entry.identityId !== identityId.value));
            if (others) return publication.author ? t('remixFamily.byAuthorWith', { title, author: publication.author, names: others }) : t('remixFamily.titleWith', { title, names: others });
            return publication.author ? t('remixFamily.byAuthor', { title, author: publication.author }) : title;
        }
        const authorRoute = (publication) => builderRoute(publication.publisherIdentity?.id, publication.author);
        return {
            t, identityId, profile, isYou, name, helped, worldRoute, creditLine, authorRoute,
            shortId: computed(() => shortIdentityId(identityId.value))
        };
    },
    template: `
        <section class="builder-view">
            <h1>{{ name || t('builderView.someone') }}</h1>
            <p class="builder-identity" :title="identityId">{{ t('builderView.identity', { id: shortId }) }}</p>
            <p v-if="isYou" class="builder-you">{{ t('builderView.you') }}</p>
            <FollowButton v-else-if="identityId" :identity-id="identityId" :name="name" />

            <h2>{{ t('builderView.builds') }}</h2>
            <ul v-if="profile.builds.length" class="builder-builds">
                <li v-for="publication in profile.builds" :key="publication.documentId" class="builder-build">
                    <router-link :to="worldRoute(publication)">{{ publication.title || t('remixFamily.untitled') }}</router-link>
                </li>
            </ul>
            <p v-else class="builder-empty">{{ t('builderView.noBuilds') }}</p>

            <h2>{{ t('builderView.builtWith') }}</h2>
            <ul v-if="profile.builtWith.length" class="builder-built-with">
                <li v-for="publication in profile.builtWith" :key="publication.documentId" class="builder-build">
                    <router-link :to="worldRoute(publication)">{{ creditLine(publication) }}</router-link>
                </li>
            </ul>
            <p v-else class="builder-empty">{{ t('builderView.noBuiltWith') }}</p>

            <template v-if="isYou && helped.length">
                <h2>{{ t('helpedBuilds.title') }}</h2>
                <HelpedBuildsList :builds="helped" />
            </template>
        </section>
    `
};
