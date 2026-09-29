import { ref, onMounted, computed, inject } from 'vue';
import { useRoute } from 'vue-router';
import { CreateDiscoveryUseCase } from '../../application/discovery/CreateDiscoveryUseCase.js';
import PublicationCatalog from '../components/PublicationCatalog.js';
import ForkTree from '../components/ForkTree.js';
import FollowButton from '../components/FollowButton.js';
import { shortIdentityId } from './following/followedPeople.js';
import { computeAmbiguousPublishedDateIds } from '../../core/PublicationDateAmbiguity.js';
import { publicationDateText } from '../i18n/dateText.js';
// 0.9.525 — Repository Discovery & Material Trust Product
// Reassessment, Section G. See application/
// PublicationAuthorNameIdentityConvergence.js's own header for why this
// page — the one Repository surface whose entire premise is "here is
// one author's work" — is where this check belongs, rather than the
// paginated catalog card/list views (which never claimed anything about
// authorship equivalence in the first place, one publication at a
// time).
import {
    derivePublicationAuthorNameIdentityConvergence,
    describePublicationAuthorNameIdentityConvergence
} from '../../application/publication/PublicationAuthorNameIdentityConvergence.js';
import { t } from '../i18n/i18n.js';

// As of 0.2.31, the paginated "Publications" listing above is
// ui/components/PublicationCatalog.js scoped to this author — the
// SAME component RepositoryView mounts, see its own comment for why.
//
// The "Original Works & Forks" lineage graph below stays a SEPARATE,
// deliberately UNPAGINATED query: a fork tree needs this author's
// WHOLE publication set to render correctly (a root published on page
// 1 could have a fork that only exists on page 4) — pagination is a
// property of the browsable list, not of a lineage visualization, and
// conflating the two would either break the tree or force the catalog
// to always load everything, defeating the point of paginating it.
export default {
    name: 'AuthorView',
    components: { PublicationCatalog, ForkTree, FollowButton },
    setup() {
        const route = useRoute();
        const author = route.params.username;
        const allPublications = ref([]);
        // 0.9.339 — see ui/components/PublicationCatalog.js's own
        // identical comment: the "Original Works & Forks" lineage below
        // is this author's own Repository-shaped view, so it shares the
        // same merged discovery composition PublicationCatalog itself
        // now uses.
        const decentralizedDiscoveryProvider = inject('decentralizedPublicationDiscoveryProvider', null);
        const followingFeed = inject('followingFeed', null);
        const { listPublicationsUseCase } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider });

        onMounted(() => {
            allPublications.value = listPublicationsUseCase.execute({ author });
        });

        const forkTreeRoots = computed(() => {
            return allPublications.value.filter((p) => !p.parentDocumentId);
        });

        // 0.9.572 — see core/PublicationDateAmbiguity.js's own header
        // and ui/components/PublicationCatalog.js's own identical
        // computed one component over. The "Original Works & Forks"
        // tree below renders from this SAME `allPublications` array —
        // republishing an unmodified Document (0.9.539's own flagship
        // scenario: same documentId, no parentDocumentId, so both
        // land in forkTreeRoots as siblings) previously rendered two
        // pixel-identical root nodes here, because this page's own
        // inline fork-tree markup never went through the 0.9.539 fix
        // at all — only ui/components/PublicationCard.js/
        // PublicationList.js did. Scoped to the whole author page,
        // mirroring PublicationCatalog.js's own per-page scope.
        const preciseDateIds = computed(() => computeAmbiguousPublishedDateIds(allPublications.value));

        // 0.9.525 — a structural fact about the SAME `allPublications`
        // this page already loaded for the fork tree, never a second
        // query: does this typed name cover more than one distinct
        // signing identity? See application/
        // PublicationAuthorNameIdentityConvergence.js's own header —
        // this never adjudicates which identity is "the real" author,
        // it only ever discloses that more than one exists.
        const authorNameIdentityConvergence = computed(() => derivePublicationAuthorNameIdentityConvergence({
            author,
            publications: allPublications.value
        }));
        const authorNameIdentityNotice = computed(() => describePublicationAuthorNameIdentityConvergence(
            authorNameIdentityConvergence.value
        ));

        // Following goes by signing identity, never by the typed name, which
        // several identities may share: one Follow per verified signer.
        const signers = computed(() => {
            if (!followingFeed) return [];
            const ids = new Set();
            for (const publication of allPublications.value) {
                const signer = followingFeed.verifiedPublisherOf(publication);
                if (signer) ids.add(signer);
            }
            return [...ids].sort().map((identityId) => ({ identityId, shortId: shortIdentityId(identityId) }));
        });

        return {
            t,
            author,
            allPublications,
            signers,
            forkTreeRoots,
            authorNameIdentityNotice,
            preciseDateIds,
            publicationDateText
        };
    },
    template: `
        <section class="author-view">
            <h1>{{ author || t('authorView.anonymous') }}</h1>
            <p class="author-stats">{{ t('authorView.publicationCount', { count: allPublications.length }) }}</p>
            <ul v-if="signers.length" class="author-follow-list">
                <li v-for="signer in signers" :key="signer.identityId" class="author-follow-item">
                    <span :title="signer.identityId">{{ t('authorView.signedBy', { signer: signer.shortId }) }}</span>
                    <FollowButton :identity-id="signer.identityId" :name="author || null" />
                </li>
            </ul>
            <p v-if="authorNameIdentityNotice" class="author-identity-convergence-notice">
                ⚠ {{ authorNameIdentityNotice }}
            </p>

            <PublicationCatalog :author="author" />

            <div v-if="forkTreeRoots.length > 0" class="fork-graph-section">
                <h2>{{ t('authorView.originalWorksForks') }}</h2>
                <div v-for="root in forkTreeRoots" :key="root.id" class="fork-tree">
                    <div class="fork-node fork-node--root">
                        <strong>{{ root.title }}</strong>
                        <span class="fork-node-date" v-if="root.publishedAt">
                            {{ publicationDateText(root.publishedAt, preciseDateIds.has(root.id)) }}
                        </span>
                    </div>
                    <ForkTree :publications="allPublications" :root-document-id="root.documentId" :precise-date-ids="preciseDateIds" />
                </div>
            </div>
        </section>
    `
};
