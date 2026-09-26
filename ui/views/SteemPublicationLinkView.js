import { inject, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { OpenSteemPublicationLinkOutcome } from '../../application/steem/OpenSteemPublicationLink.js';

// Where the "see it in 3D" link on a Steem post lands:
// `#/view/steem/<author>/<permlink>` names a Publication's Signed Claim stored
// on Steem. `openSteemPublicationLink` (ui/main.js) reads and verifies it,
// fetches and checks its build, and admits it as World discovery does; this
// view then opens World View on it, or says why it can't.
export default {
    name: 'SteemPublicationLinkView',
    setup() {
        const route = useRoute();
        const router = useRouter();
        const openLink = inject('openSteemPublicationLink', null);
        const state = ref('loading');
        const message = ref('');
        const publication = ref(null);
        const where = `@${route.params.author}/${route.params.permlink}`;

        async function open() {
            state.value = 'loading';
            message.value = '';
            if (!openLink) {
                state.value = 'failed';
                message.value = 'Reading from Steem is not available in this browser.';
                return;
            }
            let result;
            try {
                result = await openLink({ author: route.params.author, permlink: route.params.permlink });
            } catch (error) {
                result = { outcome: 'failed', message: error.message, publication: null };
            }
            if (result.outcome === OpenSteemPublicationLinkOutcome.OPENED) {
                router.replace({ path: `/world/${result.documentId}` });
                return;
            }
            publication.value = result.publication
                ? { title: result.publication.title, author: result.publication.author }
                : null;
            message.value = result.message;
            state.value = result.outcome === OpenSteemPublicationLinkOutcome.STEEM_UNREACHABLE
                || result.outcome === OpenSteemPublicationLinkOutcome.BUILD_NOT_FOUND ? 'retry' : 'failed';
        }

        onMounted(open);

        return { state, message, publication, where, open };
    },
    template: `
        <section class="steem-publication-link-view">
            <h1>A build from Steem</h1>
            <p v-if="state === 'loading'" role="status">
                Loading {{ where }} from Steem, checking its signature and finding its build…
            </p>
            <template v-else>
                <p v-if="publication" class="form-hint form-hint--neutral">
                    "{{ publication.title }}"<span v-if="publication.author"> by {{ publication.author }}</span>
                </p>
                <p class="steem-publication-link-message" role="alert">{{ message }}</p>
                <div class="steem-publication-link-actions">
                    <button v-if="state === 'retry'" class="action-btn" @click="open">Try again</button>
                    <router-link class="action-btn action-btn--secondary" to="/">Go to ForkBuild</router-link>
                </div>
            </template>
            <p class="form-hint form-hint--neutral">
                ForkBuild shows a build from Steem only when its Publication is signed and the build matches it.
                Once shown, it's kept in this browser like any build you find in the World.
            </p>
        </section>
    `
};
