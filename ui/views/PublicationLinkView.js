import { inject, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { OpenPublicationLinkOutcome } from '../../application/publication/OpenPublicationLink.js';
import { describePublicationClaimLocator, publicationClaimLocatorFromViewPath } from '../../core/ForkBuildAppLinks.js';

const NETWORK_NAMES = Object.freeze({ steem: 'Steem', arweave: 'Arweave', ipfs: 'IPFS' });
// Worth trying again: the network or search couldn't be reached, the build
// wasn't found yet, or (off Steem) the claim may not have arrived yet.
const RETRY_OUTCOMES = new Set([OpenPublicationLinkOutcome.UNREACHABLE, OpenPublicationLinkOutcome.BUILD_NOT_FOUND]);

// Where a link to a Publication lands: `#/view/steem/<author>/<permlink>`
// (the "see it in 3D" link on a Steem post), `#/view/ar/<id>` or
// `#/view/ipfs/<cid>` (links shared with Share) name its Signed Claim.
// `openPublicationLink` (ui/main.js) reads and verifies it, fetches and
// checks its build, and admits it as World discovery does; this view then
// opens World View on it, or says why it can't.
export default {
    name: 'PublicationLinkView',
    setup() {
        const route = useRoute();
        const router = useRouter();
        const openLink = inject('openPublicationLink', null);
        const state = ref('loading');
        const message = ref('');
        const publication = ref(null);
        const locator = publicationClaimLocatorFromViewPath(route.path);
        const where = describePublicationClaimLocator(locator);
        const label = where?.label ?? 'this link';
        const network = where ? NETWORK_NAMES[where.network] : null;

        async function open() {
            state.value = 'loading';
            message.value = '';
            if (!openLink) {
                state.value = 'failed';
                message.value = 'Opening shared builds is not available in this browser.';
                return;
            }
            let result;
            try {
                result = await openLink({ locator });
            } catch (error) {
                result = { outcome: 'failed', message: error.message, publication: null };
            }
            if (result.outcome === OpenPublicationLinkOutcome.OPENED) {
                router.replace({ path: `/world/${result.documentId}` });
                return;
            }
            publication.value = result.publication
                ? { title: result.publication.title, author: result.publication.author }
                : null;
            message.value = result.message;
            const retry = RETRY_OUTCOMES.has(result.outcome)
                || (result.outcome === OpenPublicationLinkOutcome.CLAIM_UNAVAILABLE && where?.network !== 'steem');
            state.value = retry ? 'retry' : 'failed';
        }

        onMounted(open);

        return { state, message, publication, label, network, open };
    },
    template: `
        <section class="publication-link-view">
            <h1>A shared build</h1>
            <p v-if="state === 'loading'" role="status">
                Loading {{ label }}<template v-if="network"> from {{ network }}</template>, checking its signature and finding its build…
            </p>
            <template v-else>
                <p v-if="publication" class="form-hint form-hint--neutral">
                    "{{ publication.title }}"<span v-if="publication.author"> by {{ publication.author }}</span>
                </p>
                <p class="publication-link-message" role="alert">{{ message }}</p>
                <div class="publication-link-actions">
                    <button v-if="state === 'retry'" class="action-btn" @click="open">Try again</button>
                    <router-link class="action-btn action-btn--secondary" to="/">Go to ForkBuild</router-link>
                </div>
            </template>
            <p class="form-hint form-hint--neutral">
                ForkBuild shows a shared build only when its Publication is signed and the build matches it.
                Once shown, it's kept in this browser like any build you find in the World.
            </p>
        </section>
    `
};
