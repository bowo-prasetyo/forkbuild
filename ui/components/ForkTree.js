import { formatPublicationDate } from '../../core/PublicationDateAmbiguity.js';

export default {
    name: 'ForkTree',
    props: {
        publications: { type: Array, required: true },
        rootDocumentId: { type: String, required: true },
        // 0.9.572 — see core/PublicationDateAmbiguity.js's own header
        // and ui/components/PublicationList.js's own identical prop.
        // AuthorView.js computes this once, over the SAME `publications`
        // array this whole tree already renders from, and passes it
        // down through every recursive level unchanged — a fork
        // published the same calendar day as a same-document sibling
        // (a republish of an already-forked document) is exactly as
        // real a collision here as the flagship catalog-card case
        // 0.9.539 fixed, and was previously invisible: this component
        // rendered `child.publishedAt` raw, bypassing that fix entirely.
        preciseDateIds: { type: Set, default: () => new Set() }
    },
    setup(props) {
        function getChildren(documentId) {
            return props.publications.filter((p) => p.parentDocumentId === documentId);
        }
        function publishedAtLabel(child) {
            return formatPublicationDate(child.publishedAt, props.preciseDateIds.has(child.id));
        }
        return { getChildren, publishedAtLabel };
    },
    template: `
        <ul class="fork-tree-list">
            <li v-for="child in getChildren(rootDocumentId)" :key="child.id" class="fork-tree-item">
                <div class="fork-tree-node">
                    <span class="fork-connector">└─</span>
                    <span class="fork-title">{{ child.title }}</span>
                    <span v-if="child.author" class="fork-author">by {{ child.author }}</span>
                    <span v-if="child.publishedAt" class="fork-date">{{ publishedAtLabel(child) }}</span>
                </div>
                <ForkTree :publications="publications" :root-document-id="child.documentId" :precise-date-ids="preciseDateIds" />
            </li>
        </ul>
    `
};
