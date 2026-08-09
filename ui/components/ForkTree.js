export default {
    name: 'ForkTree',
    props: {
        publications: { type: Array, required: true },
        rootDocumentId: { type: String, required: true }
    },
    setup(props) {
        function getChildren(documentId) {
            return props.publications.filter((p) => p.parentDocumentId === documentId);
        }
        return { getChildren };
    },
    template: `
        <ul class="fork-tree-list">
            <li v-for="child in getChildren(rootDocumentId)" :key="child.id" class="fork-tree-item">
                <div class="fork-tree-node">
                    <span class="fork-connector">└─</span>
                    <span class="fork-title">{{ child.title }}</span>
                    <span v-if="child.author" class="fork-author">by {{ child.author }}</span>
                    <span v-if="child.publishedAt" class="fork-date">{{ new Date(child.publishedAt).toLocaleDateString() }}</span>
                </div>
                <ForkTree :publications="publications" :root-document-id="child.documentId" />
            </li>
        </ul>
    `
};
