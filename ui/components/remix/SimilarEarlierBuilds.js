import { formatDate, t } from '../../i18n/i18n.js';
import I18nText from '../../i18n/I18nText.js';
import { createVerifiedPublisherResolver } from '../../../application/publication/FollowingFeed.js';
import { builderRoute } from './builtWithText.js';
import { lookAlikeShare } from '../../../core/catalog/BuildSimilarity.js';

// On a build's page, under its family tree: builds by other people,
// published before it, that look a lot like it
// (application/publication/SimilarBuildFinder.js#findEarlier()). It lets a
// builder find a copy of their build, and anyone see where a build may have
// come from. Like the family tree it is no ranking; unlike it, it is no
// record either: looking alike is evidence for a person to weigh, so the
// section says plainly that it doesn't mean anyone copied. A build whose
// order this device can't be sure of is listed with what it does know
// (application/publication/SimilarBuildFinder.js, `order`). `matches` are the
// finder's { publication, evidence }; `routeFor(publication)` is where each
// opens, or null. `titleKey` and `noteKey` let the builder's own card in
// Explore show, with the same list, the look-alikes published after theirs
// (findLater()).
const verifiedPublisherOf = createVerifiedPublisherResolver();

export default {
    name: 'SimilarEarlierBuilds',
    components: { I18nText },
    props: {
        matches: { type: Array, default: () => [] },
        routeFor: { type: Function, default: () => null },
        heading: { type: String, default: 'h3' },
        titleKey: { type: String, default: 'similarEarlier.title' },
        noteKey: { type: String, default: 'similarEarlier.note' }
    },
    setup() {
        function title(publication) {
            return typeof publication.title === 'string' && publication.title.trim() ? publication.title.trim() : t('similarEarlier.untitled');
        }
        function authorRoute(publication) {
            let signer = null;
            try {
                signer = verifiedPublisherOf(publication);
            } catch {
                signer = null;
            }
            return builderRoute(signer, publication.author || null);
        }
        // How alike, as lookAlikeShare() says: most of both the same, or
        // most of one standing in the other ("this one" being the build on
        // the page), and whether it was mirrored.
        function detail(match) {
            const { kind, percent, mirrored } = lookAlikeShare(match.evidence);
            const share = t(kind === 'same' ? 'similarEarlier.percent' : (kind === 'theirsInMine' ? 'similarEarlier.itInThis' : 'similarEarlier.thisInIt'), { percent });
            const how = mirrored ? t('similarEarlier.mirrored', { how: share }) : share;
            const published = new Date(match.publication.publishedAt);
            if (Number.isNaN(published.getTime())) return how;
            const date = formatDate(published, { dateStyle: 'medium' });
            // When this device can't back the date its builder signed
            // (core/publication/PublicationOrder.js), it says whose date it
            // is, and when this device first saw the build.
            if (match.order === 'datedBefore') {
                return Number.isFinite(match.seen)
                    ? t('similarEarlier.datedDetail', { how, date, seen: formatDate(new Date(match.seen), { dateStyle: 'medium' }) })
                    : t('similarEarlier.datedOnlyDetail', { how, date });
            }
            if (match.order === 'seenBefore') return t('similarEarlier.seenFirstDetail', { how, date });
            return t('similarEarlier.detail', { how, date });
        }
        return { t, title, authorRoute, detail };
    },
    template: `
        <section v-if="matches.length" class="similar-earlier" :aria-label="t(titleKey)">
            <component :is="heading" class="similar-earlier-title">{{ t(titleKey) }}</component>
            <ul class="similar-earlier-list">
                <li v-for="match in matches" :key="match.publication.id" class="similar-earlier-build">
                    <I18nText v-if="match.publication.author" keypath="similarEarlier.byAuthor" class="similar-earlier-name">
                        <template #title><router-link v-if="routeFor(match.publication)" :to="routeFor(match.publication)" class="similar-earlier-link">{{ title(match.publication) }}</router-link><template v-else>{{ title(match.publication) }}</template></template>
                        <template #author><router-link v-if="authorRoute(match.publication)" :to="authorRoute(match.publication)" class="similar-earlier-author">{{ match.publication.author }}</router-link><template v-else>{{ match.publication.author }}</template></template>
                    </I18nText>
                    <span v-else class="similar-earlier-name"><router-link v-if="routeFor(match.publication)" :to="routeFor(match.publication)" class="similar-earlier-link">{{ title(match.publication) }}</router-link><template v-else>{{ title(match.publication) }}</template></span>
                    <span class="similar-earlier-detail">{{ detail(match) }}</span>
                </li>
            </ul>
            <p class="similar-earlier-note">{{ t(noteKey) }}</p>
        </section>
    `
};
