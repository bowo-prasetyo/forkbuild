import PublicationPreview from './PublicationPreview.js';
import PublicationCommentarySection from './PublicationCommentarySection.js';
import { formatPublicationDate } from '../../core/PublicationDateAmbiguity.js';
import { License } from '../../core/License.js';

// 0.2.31 — the compact table/row view of a page of publications —
// "best when there are hundreds or thousands," per the design doc,
// exactly why it exists alongside PublicationCard rather than
// replacing it: cards are for visual discovery, this is for scanning
// a lot of results quickly. Same pure-presentation contract as
// PublicationCard — every row's description/parent-title is resolved
// by the host and handed down already-computed. (Fork counts are a
// cards-view-only detail; the table has no column for them.)
//
// 0.9.561 — Publication List Commentary Parity. Each row offers the
// same Commentary as a card: a "Comment"/"Hide Comments" toggle in the
// row's actions, and, while open, a detail row that mounts
// ui/components/PublicationCommentarySection.js — the ONE Commentary
// implementation PublicationCard.js mounts too. This component only
// tracks which rows are open (`openCommentaryIds`); every other piece
// of Commentary state lives in that row's own section instance, so rows
// never share or bleed state.
export default {
    name: 'PublicationList',
    components: { PublicationPreview, PublicationCommentarySection },
    inject: {
        // Read only to decide whether to offer the Comment toggle.
        getPublicationCommentariesCommand: { default: null }
    },
    props: {
        items: { type: Array, required: true },
        descriptions: { type: Object, default: () => ({}) },
        parentTitles: { type: Object, default: () => ({}) },
        // 0.9.539 — see core/PublicationDateAmbiguity.js's own header.
        // Keyed by publicationId (unlike the two maps above, which are
        // keyed by documentId) because the collision this guards
        // against is between two Publication INSTANCES of the same
        // document, not the document itself.
        preciseDateIds: { type: Set, default: () => new Set() }
    },
    emits: ['open', 'fork', 'explore', 'view-author'],
    data() {
        return {
            // publicationId -> whether that row's Commentary is open.
            // Only toggleCommentary() writes it.
            openCommentaryIds: {}
        };
    },
    methods: {
        licenseLabel(pub) {
            return License.idOf(pub.license);
        },
        // 0.9.539 — the SAME `publishedAt` field, at finer precision,
        // never a new one.
        publishedAtLabel(pub) {
            return formatPublicationDate(pub.publishedAt, this.preciseDateIds.has(pub.id)) || '—';
        },
        isCommentaryOpen(pub) {
            return !!this.openCommentaryIds[pub.id];
        },
        // The only writer of `openCommentaryIds`. A no-op whenever no
        // getPublicationCommentariesCommand was injected. Opening a row
        // mounts that row's PublicationCommentarySection, which performs
        // the first read for that row only.
        toggleCommentary(pub) {
            if (!this.getPublicationCommentariesCommand) {
                return;
            }
            this.openCommentaryIds[pub.id] = !this.openCommentaryIds[pub.id];
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
                    <template v-for="pub in items" :key="pub.id">
                        <tr>
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
                            <td class="publication-date">{{ publishedAtLabel(pub) }}</td>
                            <td class="publication-date">{{ licenseLabel(pub) }}</td>
                            <td>
                                <div class="publication-actions publication-actions--row">
                                    <button class="action-btn action-btn--open" @click="$emit('open', pub)">Open</button>
                                    <button class="action-btn action-btn--fork" @click="$emit('fork', pub)">Fork</button>
                                    <button class="action-btn action-btn--explore" @click="$emit('explore', pub)">Explore</button>
                                    <button
                                        v-if="getPublicationCommentariesCommand"
                                        class="action-btn action-btn--comment"
                                        @click="toggleCommentary(pub)"
                                    >{{ isCommentaryOpen(pub) ? 'Hide Comments' : 'Comment' }}</button>
                                </div>
                            </td>
                        </tr>

                        <tr v-if="getPublicationCommentariesCommand && isCommentaryOpen(pub)" class="publication-table-commentary-row">
                            <td colspan="6" class="publication-table-commentary-cell">
                                <PublicationCommentarySection :publication="pub" />
                            </td>
                        </tr>
                    </template>
                </tbody>
            </table>
        </div>
    `
};
