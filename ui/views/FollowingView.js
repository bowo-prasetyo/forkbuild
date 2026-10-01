import { ref, computed, inject, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import PublicationCard from '../components/PublicationCard.js';
import { buildFollowedPeople } from './following/followedPeople.js';
import { errorText, t } from '../i18n/i18n.js';
import I18nText from '../i18n/I18nText.js';

// The people you follow and their newest work that has reached this device.
// Following is local: this page shows what this device has already admitted
// (from World discovery, shared Worlds, links), and never fetches by itself.
export default {
    name: 'FollowingView',
    components: { I18nText, PublicationCard },
    setup() {
        const router = useRouter();
        const followUseCase = inject('followUseCase', null);
        const followingFeed = inject('followingFeed', null);
        const peerBlockUseCase = inject('peerBlockUseCase', null);
        const discoveryProvider = inject('decentralizedPublicationDiscoveryProvider', null);

        const follows = ref([]);
        const publications = ref([]);
        const selectedIdentityId = ref(null);
        const error = ref('');

        function refresh() {
            follows.value = followUseCase ? followUseCase.getFollowing() : [];
            publications.value = followingFeed ? followingFeed.list() : [];
            if (selectedIdentityId.value && !follows.value.some((f) => f.identityId === selectedIdentityId.value)) {
                selectedIdentityId.value = null;
            }
        }
        refresh();

        const unsubscribers = [
            followUseCase ? followUseCase.onFollowingChanged(refresh) : null,
            peerBlockUseCase ? peerBlockUseCase.onBlockedChanged(refresh) : null,
            discoveryProvider && typeof discoveryProvider.onAdded === 'function' ? discoveryProvider.onAdded(refresh) : null
        ];
        onBeforeUnmount(() => unsubscribers.forEach((unsubscribe) => { if (unsubscribe) unsubscribe(); }));

        const signedIn = ref(Boolean(followUseCase && followUseCase.isSignedIn()));
        const people = computed(() => buildFollowedPeople({
            follows: follows.value,
            publications: publications.value,
            signerOf: (publication) => followingFeed.verifiedPublisherOf(publication)
        }));
        const visiblePublications = computed(() => (selectedIdentityId.value
            ? publications.value.filter((p) => followingFeed.verifiedPublisherOf(p) === selectedIdentityId.value)
            : publications.value));

        const selectedPerson = computed(() => people.value.find((person) => person.identityId === selectedIdentityId.value) || null);

        function select(identityId) {
            selectedIdentityId.value = selectedIdentityId.value === identityId ? null : identityId;
        }
        function unfollow(identityId) {
            error.value = '';
            try {
                followUseCase.unfollow(identityId);
            } catch (e) {
                error.value = errorText(e, String(e)).replace(/^FollowUseCase:\s*/, '');
            }
        }
        function openPublication(pub) {
            router.push({ path: '/editor', query: { load: pub.documentId } });
        }
        function forkPublication(pub) {
            router.push({ path: '/editor', query: { fork: pub.documentId, publication: pub.id } });
        }
        function viewWorld(pub) {
            router.push({ path: `/world/${pub.documentId}` });
        }
        function viewAuthor(author) {
            if (author) router.push({ path: `/author/${encodeURIComponent(author)}` });
        }

        return {
            t,
            signedIn, people, visiblePublications, selectedIdentityId, selectedPerson, error,
            select, unfollow, openPublication, forkPublication, viewWorld, viewAuthor
        };
    },
    template: `
        <section class="following-view">
            <h1>{{ t('followingView.following') }}</h1>
            <p class="form-hint form-hint--neutral">
                {{ t('followingView.newWorkFromPeopleYou') }}
            </p>

            <p v-if="!signedIn" class="form-hint form-hint--neutral">
                <I18nText keypath="followingView.signInOn"><template #myIdentities><router-link to="/identity">{{ t('followingView.myIdentities') }}</router-link></template></I18nText>
            </p>

            <template v-else>
                <p v-if="error" class="identity-unlock-error">{{ error }}</p>
                <p v-if="!people.length" class="empty-state">
                    <I18nText keypath="followingView.youDonTFollowAnyone"><template #follow><strong>{{ t('followingView.follow') }}</strong></template></I18nText>
                </p>

                <ul v-else class="following-people" :aria-label="t('followingView.peopleYouFollow')">
                    <li v-for="person in people" :key="person.identityId"
                        :class="['following-person', { 'following-person--selected': selectedIdentityId === person.identityId }]">
                        <button type="button" class="following-person-name"
                                :aria-pressed="selectedIdentityId === person.identityId ? 'true' : 'false'"
                                :title="person.identityId"
                                @click="select(person.identityId)">{{ person.name }}</button>
                        <span class="following-person-count">{{ t('followingView.here', { publicationCount: person.publicationCount }) }}</span>
                        <button type="button" class="action-btn action-btn--secondary" @click="unfollow(person.identityId)">{{ t('followingView.unfollow') }}</button>
                    </li>
                </ul>

                <div v-if="people.length && !visiblePublications.length" class="empty-state">
                    {{ selectedPerson
                        ? t('followingView.nothingFromPerson', { name: selectedPerson.name })
                        : t('followingView.nothingFromThePeopleYouFollow') }}
                </div>
                <ul v-else-if="visiblePublications.length" class="publication-list">
                    <PublicationCard
                        v-for="pub in visiblePublications"
                        :key="pub.id"
                        :publication="pub"
                        @open="openPublication"
                        @fork="forkPublication"
                        @explore="viewWorld"
                        @view-author="viewAuthor"
                    />
                </ul>
            </template>
        </section>
    `
};
