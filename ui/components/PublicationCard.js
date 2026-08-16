import PublicationPreview from './PublicationPreview.js';

// 0.2.31 — one publication, in card form. Pure presentation: every
// piece of enriched data (description, parent title, fork count) is
// resolved by the host (ui/components/PublicationCatalog.js) and
// handed down as a prop — this component never calls a use case or a
// discovery provider itself, the same "host resolves, component
// renders" convention WorldLocationBrowser (0.2.29/0.2.30) already
// established.
//
// Open/Fork/Explore are the same three actions Repository/Author View
// have always offered — see docs/Principles.md, "Repository, World,
// Editor" for why they stay conceptually distinct: Open loads an
// editable document/fork per the existing fork-on-write lifecycle;
// Explore navigates to the publication's World placement; Fork
// explicitly creates an editable descendant. Nothing here changes
// what any of the three DO — only how a publication is discovered
// before one of them is chosen.
export default {
    name: 'PublicationCard',
    components: { PublicationPreview },
    props: {
        publication: { type: Object, required: true },
        description: { type: String, default: '' },
        parentTitle: { type: String, default: null },
        forkCount: { type: Number, default: 0 }
    },
    emits: ['open', 'fork', 'explore', 'view-author'],
    computed: {
        licenseLabel() {
            return this.publication.license ? this.publication.license.id : 'UNSPECIFIED';
        }
    },
    template: `
        <li class="publication-card">
            <PublicationPreview :publication="publication" size="card" />
            <h3>{{ publication.title }}</h3>
            <p v-if="publication.parentDocumentId" class="publication-fork-of">
                ↳ Fork of {{ parentTitle || 'Unknown' }}
            </p>
            <p v-if="description" class="publication-description">{{ description }}</p>
            <p class="publication-meta">
                <span class="publication-badge">🔒 Published</span>
                by
                <template v-if="publication.author">
                    <a @click.prevent="$emit('view-author', publication.author)" class="publication-author-link">{{ publication.author }}</a>
                </template>
                <template v-else>anonymous</template>
            </p>
            <p class="publication-date" v-if="publication.publishedAt">
                {{ publication.publishedAt.toLocaleDateString() }} · {{ licenseLabel }}
            </p>
            <p class="publication-forks" v-if="forkCount > 0">
                {{ forkCount }} fork(s)
            </p>
            <div class="publication-actions">
                <button class="action-btn action-btn--open" @click="$emit('open', publication)">Open</button>
                <button class="action-btn action-btn--fork" @click="$emit('fork', publication)">Fork</button>
                <button class="action-btn action-btn--explore" @click="$emit('explore', publication)">Explore</button>
            </div>
        </li>
    `
};
