import PublicationPreview from './PublicationPreview.js';

// 0.2.31 — the compact table/row view of a page of publications —
// "best when there are hundreds or thousands," per the design doc,
// exactly why it exists alongside PublicationCard rather than
// replacing it: cards are for visual discovery, this is for scanning
// a lot of results quickly. Same pure-presentation contract as
// PublicationCard — every row's description/parent-title/fork-count
// is resolved by the host and handed down already-computed.
export default {
    name: 'PublicationList',
    components: { PublicationPreview },
    props: {
        items: { type: Array, required: true },
        descriptions: { type: Object, default: () => ({}) },
        parentTitles: { type: Object, default: () => ({}) },
        forkCounts: { type: Object, default: () => ({}) }
    },
    emits: ['open', 'fork', 'explore', 'view-author'],
    methods: {
        licenseLabel(pub) {
            return pub.license ? pub.license.id : 'UNSPECIFIED';
        }
    },
    template: `
        <div class="publication-table-wrap">
            <table class="publication-table">
                <thead>
                    <tr>
                        <th class="publication-table-preview-col"></th>
                        <th>Title</th>
                        <th>Author</th>
                        <th>Published</th>
                        <th>License</th>
                        <th class="publication-table-actions-col">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="pub in items" :key="pub.id">
                        <td class="publication-table-preview-col">
                            <PublicationPreview :publication="pub" size="list" />
                        </td>
                        <td class="publication-table-title-col">
                            <span class="publication-table-title">{{ pub.title }}</span>
                            <span v-if="pub.parentDocumentId" class="publication-fork-of">
                                ↳ Fork of {{ parentTitles[pub.documentId] || 'Unknown' }}
                            </span>
                            <span v-if="descriptions[pub.documentId]" class="publication-description publication-description--list">
                                {{ descriptions[pub.documentId] }}
                            </span>
                        </td>
                        <td>
                            <template v-if="pub.author">
                                <a @click.prevent="$emit('view-author', pub.author)" class="publication-author-link">{{ pub.author }}</a>
                            </template>
                            <template v-else>anonymous</template>
                        </td>
                        <td class="publication-date">{{ pub.publishedAt ? pub.publishedAt.toLocaleDateString() : '—' }}</td>
                        <td class="publication-date">{{ licenseLabel(pub) }}</td>
                        <td>
                            <div class="publication-actions publication-actions--row">
                                <button class="action-btn action-btn--open" @click="$emit('open', pub)">Open</button>
                                <button class="action-btn action-btn--fork" @click="$emit('fork', pub)">Fork</button>
                                <button class="action-btn action-btn--explore" @click="$emit('explore', pub)">Explore</button>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    `
};
