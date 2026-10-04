import { inject, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { OpenPublicationLinkOutcome } from '../../application/publication/OpenPublicationLink.js';
import { describePublicationClaimLocator, publicationClaimLocatorFromViewPath } from '../../core/ForkBuildAppLinks.js';
import { errorText, t } from '../i18n/i18n.js';

const NETWORK_NAMES = Object.freeze({ steem: 'Steem', blurt: 'Blurt', arweave: 'Arweave', ipfs: 'IPFS' });
// Worth trying again: the network or search couldn't be reached, the build
// wasn't found yet, or (off Steem and Blurt) the claim may not have arrived yet.
const RETRY_OUTCOMES = new Set([OpenPublicationLinkOutcome.UNREACHABLE, OpenPublicationLinkOutcome.BUILD_NOT_FOUND]);

// Where a link to a Publication lands: `#/view/steem/<author>/<permlink>` or
// `#/view/blurt/<author>/<permlink>` (the "see it in 3D" link on a Steem or
// Blurt post), `#/view/ar/<id>` or
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
        const label = where ? t(where.label) : t('publicationLink.thisLink');
        const network = where ? NETWORK_NAMES[where.network] : null;

        async function open() {
            state.value = 'loading';
            message.value = '';
            if (!openLink) {
                state.value = 'failed';
                message.value = t('publicationLink.unavailable');
                return;
            }
            let result;
            try {
                result = await openLink({ locator });
            } catch (error) {
                result = { outcome: 'failed', message: errorText(error), publication: null };
            }
            if (result.outcome === OpenPublicationLinkOutcome.OPENED) {
                router.replace({ path: `/world/${result.documentId}` });
                return;
            }
            publication.value = result.publication
                ? { title: result.publication.title, author: result.publication.author }
                : null;
            message.value = typeof result.message === 'string' ? result.message : t(result.message);
            const retry = RETRY_OUTCOMES.has(result.outcome)
                || (result.outcome === OpenPublicationLinkOutcome.CLAIM_UNAVAILABLE && !['steem', 'blurt'].includes(where?.network));
            state.value = retry ? 'retry' : 'failed';
        }

        onMounted(open);

        return { t, state, message, publication, label, network, open };
    },
    template: `
        <section class="publication-link-view">
            <h1>{{ t('publicationLink.title') }}</h1>
            <p v-if="state === 'loading'" role="status">
                {{ network ? t('publicationLink.loadingFrom', { label, network }) : t('publicationLink.loading', { label }) }}
            </p>
            <template v-else>
                <p v-if="publication" class="form-hint form-hint--neutral">
                    {{ publication.author ? t('publicationLink.titleBy', { title: publication.title, author: publication.author }) : t('publicationLink.titleOnly', { title: publication.title }) }}
                </p>
                <p class="publication-link-message" role="alert">{{ message }}</p>
                <div class="publication-link-actions">
                    <button v-if="state === 'retry'" class="action-btn" @click="open">{{ t('publicationLink.tryAgain') }}</button>
                    <router-link class="action-btn action-btn--secondary" to="/">{{ t('publicationLink.home') }}</router-link>
                </div>
            </template>
            <p class="form-hint form-hint--neutral">
                {{ t('publicationLink.explanation') }}
            </p>
        </section>
    `
};
