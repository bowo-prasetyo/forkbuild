import { computed, defineAsyncComponent, inject, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { OpenPublicationLinkOutcome } from '../../application/publication/OpenPublicationLink.js';
import { describePublicationClaimLocator, publicationClaimLocatorFromViewPath } from '../../core/ForkBuildAppLinks.js';
import { decodePublicationLinkPayload } from '../../application/publication/sharing/PublicationLinkPayload.js';
import { readSharedBuildBricks } from '../../application/publication/sharing/ReadSharedBuild.js';
import { CreateDiscoveryUseCase } from '../../application/discovery/CreateDiscoveryUseCase.js';
import { describeLicense } from '../../application/document/LicenseLabels.js';
import { countRemixes, describeRemixSource } from '../../core/RemixLineage.js';
import { License } from '../../core/License.js';
import { EditorEntryContext, EditorEntryReason, editorEntryContextToQuery } from '../../core/EditorEntryContext.js';
import { remixCountText, remixedFromText } from '../components/remix/remixText.js';
import { displayText, errorText, t } from '../i18n/i18n.js';

// The turning build needs Three.js, which the first load leaves out, so it
// loads once the build is known.
const BuildTurntable = defineAsyncComponent(() => import('../components/featured/BuildTurntable.js'));

const NETWORK_NAMES = Object.freeze({ steem: 'Steem', blurt: 'Blurt', arweave: 'Arweave', ipfs: 'IPFS' });
// Worth trying again: the network or search couldn't be reached, the build
// wasn't found yet, or (off Steem and Blurt) the claim may not have arrived yet.
const RETRY_OUTCOMES = new Set([OpenPublicationLinkOutcome.UNREACHABLE, OpenPublicationLinkOutcome.BUILD_NOT_FOUND]);

// Where a link to a Publication lands: `#/view/steem/<author>/<permlink>` or
// `#/view/blurt/<author>/<permlink>` (the "see it in 3D" link on a Steem or
// Blurt post), `#/view/ar/<id>` or
// `#/view/ipfs/<cid>` (links shared with Share) name its Signed Claim;
// `#/s/<payload>` (a link-only share) carries the claim and the build.
// `openPublicationLink` (ui/main.js) reads and verifies it, fetches and
// checks its build, and admits it as World discovery does; this view then
// shows the build, or says why it can't.
//
// The build is shown on its own, turning, with who made it, what it was
// remixed from and how many remixes of it this device has found
// (core/RemixLineage.js), and one main action: Edit a Copy, which needs no
// account and opens it in the Editor as the visitor's own. Walking around it
// in World View is the second. A build whose license allows no copies says
// so, and offers only the walk.
export default {
    name: 'PublicationLinkView',
    components: { BuildTurntable },
    setup() {
        const route = useRoute();
        const router = useRouter();
        const openLink = inject('openPublicationLink', null);
        const funnel = inject('funnelEventCounter', null);
        const contentStore = inject('publicationContentStore', null);
        const { discoveryProvider } = new CreateDiscoveryUseCase().execute({
            decentralizedDiscoveryProvider: inject('decentralizedPublicationDiscoveryProvider', null)
        });
        const state = ref('loading');
        const message = ref('');
        const publication = ref(null);
        // The build as opened: what the arrival screen shows.
        const arrived = ref(null);
        const payload = typeof route.params.payload === 'string' ? route.params.payload : null;
        const locator = payload ? null : publicationClaimLocatorFromViewPath(route.path);
        const where = describePublicationClaimLocator(locator);
        const label = where ? t(where.label) : t(payload ? 'publicationLink.label.link' : 'publicationLink.thisLink');
        const network = where ? NETWORK_NAMES[where.network] : null;

        // Lookups never stop the build from showing; a failed one shows less.
        function lookUp(read, fallback) {
            try {
                return read();
            } catch {
                return fallback;
            }
        }

        function describeArrival(opened) {
            const license = opened.license instanceof License ? opened.license : new License(opened.license || {});
            const remixSource = opened.parentDocumentId
                ? describeRemixSource(opened, lookUp(() => discoveryProvider.findByDocumentId(opened.parentDocumentId), []))
                : null;
            return Object.freeze({
                publication: opened,
                documentId: opened.documentId,
                title: typeof opened.title === 'string' && opened.title.trim() ? opened.title.trim() : t('publicationLink.untitled'),
                author: typeof opened.author === 'string' && opened.author.trim() ? opened.author.trim() : null,
                licenseLabel: displayText(describeLicense(license.id)),
                remixAllowed: license.forkAllowed,
                remixedFrom: remixedFromText(remixSource),
                remixes: remixCountText(lookUp(() => countRemixes(discoveryProvider.findByParentId(opened.documentId), opened.documentId), 0)),
                bricks: null
            });
        }

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
                if (payload) {
                    const linkOnly = await decodePublicationLinkPayload(payload);
                    result = linkOnly
                        ? await openLink({ linkOnly })
                        : { outcome: OpenPublicationLinkOutcome.INVALID_LINK, message: t('publicationLink.damaged'), publication: null };
                } else {
                    result = await openLink({ locator });
                }
            } catch (error) {
                result = { outcome: 'failed', message: errorText(error), publication: null };
            }
            if (result.outcome === OpenPublicationLinkOutcome.OPENED) {
                funnel?.openedSharedLink(result.documentId);
                const arrival = describeArrival(result.publication);
                const bricks = await readSharedBuildBricks({ publication: result.publication, contentStore });
                arrived.value = Object.freeze({ ...arrival, bricks });
                state.value = 'arrived';
                return;
            }
            publication.value = result.publication
                ? { title: result.publication.title, author: result.publication.author }
                : null;
            message.value = typeof result.message === 'string' ? result.message : t(result.message);
            // A link-only share reads nothing from a network, so trying again can't help.
            const retry = !payload && (RETRY_OUTCOMES.has(result.outcome)
                || (result.outcome === OpenPublicationLinkOutcome.CLAIM_UNAVAILABLE && !['steem', 'blurt'].includes(where?.network)));
            state.value = retry ? 'retry' : 'failed';
        }

        // The bricks the turntable draws: the build's own, read when it opened.
        const buildBricks = () => arrived.value?.bricks ?? [];
        const showTurntable = computed(() => Array.isArray(arrived.value?.bricks) && arrived.value.bricks.length > 0);

        // Edit a Copy: the same fork World View's Edit a Copy makes, with this
        // build's World to go back to.
        function editCopy() {
            const build = arrived.value;
            if (!build || !build.remixAllowed) return;
            const entryContext = new EditorEntryContext({
                sourceDocumentId: build.documentId,
                title: build.title,
                reason: EditorEntryReason.SHARED_LINK_EDIT_COPY,
                returnWorldId: build.documentId,
                returnWorldTitle: build.title
            });
            router.push({
                path: '/editor',
                query: { fork: build.documentId, publication: build.publication.id, ...editorEntryContextToQuery(entryContext) }
            });
        }

        function walkAround() {
            if (arrived.value) router.push({ path: `/world/${arrived.value.documentId}` });
        }

        onMounted(open);

        return { t, state, message, publication, arrived, label, network, open, buildBricks, showTurntable, editCopy, walkAround };
    },
    template: `
        <section v-if="state === 'arrived' && arrived" class="shared-build-view">
            <div class="shared-build-inner">
                <div class="shared-build-stage">
                    <BuildTurntable v-if="showTurntable" :bricks="buildBricks" :label="t('publicationLink.turntableLabel', { title: arrived.title })" />
                    <img v-else class="build-turntable-fallback" src="favicon.svg" :alt="t('publicationLink.turntableLabel', { title: arrived.title })">
                </div>
                <div class="shared-build-info">
                    <p class="shared-build-kicker">{{ t('publicationLink.title') }}</p>
                    <h1 class="shared-build-title">{{ arrived.title }}</h1>
                    <p class="shared-build-author">{{ arrived.author ? t('publicationLink.by', { author: arrived.author }) : t('publicationLink.byUnknown') }}</p>
                    <ul v-if="arrived.remixedFrom || arrived.remixes" class="shared-build-lineage">
                        <li v-if="arrived.remixedFrom" class="shared-build-remixed-from">{{ arrived.remixedFrom }}</li>
                        <li v-if="arrived.remixes" class="shared-build-remix-count">{{ arrived.remixes }}</li>
                    </ul>
                    <div class="shared-build-actions">
                        <button v-if="arrived.remixAllowed" type="button" class="cta-button shared-build-edit-copy" @click="editCopy">{{ t('publicationLink.editCopy') }}</button>
                        <button type="button" :class="arrived.remixAllowed ? 'shared-build-walk' : 'cta-button shared-build-walk'" @click="walkAround">{{ t('publicationLink.walkAround') }}</button>
                    </div>
                    <p v-if="arrived.remixAllowed" class="shared-build-hint">{{ t('publicationLink.editCopyHint') }}</p>
                    <p v-else class="shared-build-hint">{{ t('publicationLink.noRemix') }}</p>
                    <p class="shared-build-license">{{ t('publicationLink.license', { license: arrived.licenseLabel }) }}</p>
                    <p class="shared-build-about">
                        {{ t('publicationLink.newHere') }}
                        <router-link to="/">{{ t('publicationLink.whatIsForkBuild') }}</router-link>
                    </p>
                </div>
            </div>
        </section>
        <section v-else class="publication-link-view">
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
