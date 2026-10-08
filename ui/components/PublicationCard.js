import PublicationPreview from './PublicationPreview.js';
import PublicationCommentarySection from './PublicationCommentarySection.js';
import SharePublicationButton from './SharePublicationButton.js';
import FollowButton from './FollowButton.js';
import { publicationDateText } from '../i18n/dateText.js';
import { License } from '../../core/License.js';
import { describeLicense } from '../../application/document/LicenseLabels.js';
import { DISTRIBUTION_KIND_LABELS } from '../../application/publication/OwnPublicationDistributionRecord.js';
import { displayText, t } from '../i18n/i18n.js';
import I18nText from '../i18n/I18nText.js';
import { remixCountText, remixedFromText } from './remix/remixText.js';

// 0.2.31 — one publication, in card form. Pure presentation: every
// piece of enriched data (description, parent title, fork count) is
// resolved by the host (ui/components/PublicationCatalog.js) and
// handed down as a prop — this component never calls a use case or a
// discovery provider itself, the same "host resolves, component
// renders" convention WorldLocationBrowser (0.2.29/0.2.30) already
// established.
//
// Open/Fork/Explore are the same three actions Repository/Author View
// have always offered, and they stay conceptually distinct: Open loads an
// editable document/fork per the existing fork-on-write lifecycle;
// Explore navigates to the publication's World placement; Fork
// explicitly creates an editable descendant. Nothing here changes
// what any of the three DO — only how a publication is discovered
// before one of them is chosen.
//
// 0.9.289 — Other-Publication Commentary Entry Point. The Commentary
// itself (read, compose, retry identity, distribution provider) lives
// in ui/components/PublicationCommentarySection.js, which
// PublicationList.js mounts too. This card only owns the
// "Comment"/"Hide Comments" toggle and mounts that section while it is
// open. The toggle is
// offered only when the app-wide `getPublicationCommentariesCommand` is
// provided — the same "feature hidden when its collaborator is absent"
// gate every optional capability in this codebase's UI layer follows.
export default {
    name: 'PublicationCard',
    components: { I18nText, PublicationPreview, PublicationCommentarySection, SharePublicationButton, FollowButton },
    inject: {
        // Read only to decide whether to offer the Comment toggle.
        getPublicationCommentariesCommand: { default: null },
        followingFeed: { default: null },
        publicationDistributionRecord: { default: null }
    },
    props: {
        publication: { type: Object, required: true },
        description: { type: String, default: '' },
        // What this build was remixed from (core/RemixLineage.js), or null.
        remixSource: { type: Object, default: null },
        remixCount: { type: Number, default: 0 },
        // 0.9.539 — see core/PublicationDateAmbiguity.js's own header.
        // True only when the host (PublicationCatalog.js) detected
        // another Publication for the SAME document, published the
        // same calendar day, also visible on the current page — the
        // one case where the usual day-level `publishedAt` label would
        // otherwise render two distinct Publications identically.
        needsPreciseDate: { type: Boolean, default: false }
    },
    emits: ['open', 'fork', 'explore', 'view-author'],
    data() {
        return {
            // Whether the Commentary section is open (and so mounted).
            // Starts collapsed; only toggleCommentary() writes it.
            commentaryOpen: false
        };
    },
    computed: {
        remixedFrom() {
            return remixedFromText(this.remixSource);
        },
        remixes() {
            return remixCountText(this.remixCount);
        },
        // Your own publication: where this device recorded distributing it,
        // or null for anyone else's.
        distribution() {
            if (!this.publicationDistributionRecord) return null;
            const record = this.publicationDistributionRecord.describe(this.publication);
            if (!record) return null;
            const label = (entry) => DISTRIBUTION_KIND_LABELS[entry.kind];
            return {
                recorded: record.stored.length + record.announced.length > 0,
                stored: record.stored.map((entry) => ({ label: label(entry), detail: entry.locator })),
                announced: record.announced.map((entry) => ({ label: label(entry), detail: entry.id ? t('publicationCard.announcementId', { id: entry.id }) : null }))
            };
        },
        // Only a verified signer can be followed; the typed author name is
        // a label anyone can choose.
        publisherIdentityId() {
            return this.followingFeed ? this.followingFeed.verifiedPublisherOf(this.publication) : null;
        },
        licenseLabel() {
            return displayText(describeLicense(License.idOf(this.publication.license)));
        },
        // 0.9.539 — the SAME `publishedAt` field, at finer precision,
        // never a new one. See needsPreciseDate's own comment above and
        // core/PublicationDateAmbiguity.js's formatPublicationDate().
        publishedAtLabel() {
            return publicationDateText(this.publication.publishedAt, this.needsPreciseDate);
        }
    },
    methods: {
        t,
        // The only writer of `commentaryOpen`. A no-op whenever no
        // getPublicationCommentariesCommand was injected. Opening mounts
        // PublicationCommentarySection, which performs the first read.
        toggleCommentary() {
            if (!this.getPublicationCommentariesCommand) {
                return;
            }
            this.commentaryOpen = !this.commentaryOpen;
        }
    },
    template: `
        <li class="publication-card">
            <PublicationPreview :publication="publication" size="card" />
            <h3>{{ publication.title }}</h3>
            <p v-if="remixedFrom" class="publication-fork-of">{{ remixedFrom }}</p>
            <p v-if="description" class="publication-description">{{ description }}</p>
            <p class="publication-meta">
                <span class="publication-badge">{{ t('publicationCard.published') }}</span>
                <I18nText keypath="publicationCard.by">
                    <template #author>
                        <a v-if="publication.author" @click.prevent="$emit('view-author', publication.author)" class="publication-author-link">{{ publication.author }}</a>
                        <template v-else>{{ t('publicationCard.anonymous') }}</template>
                    </template>
                </I18nText>
            </p>
            <p class="publication-date" v-if="publication.publishedAt">
                {{ publishedAtLabel }} · {{ licenseLabel }}
            </p>
            <p class="publication-forks" v-if="remixes">{{ remixes }}</p>
            <p v-if="distribution && distribution.recorded" class="publication-distribution">
                <template v-if="distribution.stored.length">{{ t('publicationCard.storedOn') }}
                    <template v-for="(entry, index) in distribution.stored" :key="'s' + entry.label"><template v-if="index">{{ ' ' + t('publicationCard.and') + ' ' }}</template><span class="publication-distribution-item" :title="entry.detail">{{ entry.label }}</span></template>
                </template>
                <template v-if="distribution.stored.length && distribution.announced.length"> · </template>
                <template v-if="distribution.announced.length">{{ t('publicationCard.announcedOn') }}
                    <template v-for="(entry, index) in distribution.announced" :key="'a' + entry.label"><template v-if="index">{{ ' ' + t('publicationCard.and') + ' ' }}</template><span class="publication-distribution-item" :title="entry.detail">{{ entry.label }}</span></template>
                </template>
            </p>
            <p v-else-if="distribution" class="publication-distribution publication-distribution--none">
                {{ t('publicationCard.noDistributionRecordedOnThis') }}
                <I18nText keypath="publicationCard.backItUpOrExplore"><template #backItUp><router-link to="/settings/data">{{ t('publicationCard.backItUp') }}</router-link></template></I18nText>
            </p>
            <div class="publication-actions">
                <button class="action-btn action-btn--open" @click="$emit('open', publication)">{{ t('publicationCard.open') }}</button>
                <button class="action-btn action-btn--fork" @click="$emit('fork', publication)">{{ t('publicationCard.fork') }}</button>
                <button class="action-btn action-btn--explore" @click="$emit('explore', publication)">{{ t('publicationCard.explore') }}</button>
                <button
                    v-if="getPublicationCommentariesCommand"
                    class="action-btn action-btn--comment"
                    @click="toggleCommentary"
                >{{ commentaryOpen ? t('publicationCard.hideComments') : t('publicationCard.comment') }}</button>
            </div>
            <SharePublicationButton :publication="publication" />
            <div v-if="publisherIdentityId" class="publication-follow">
                <FollowButton :identity-id="publisherIdentityId" :name="publication.author || null" />
            </div>

            <PublicationCommentarySection
                v-if="getPublicationCommentariesCommand && commentaryOpen"
                :publication="publication"
            />
        </li>
    `
};
