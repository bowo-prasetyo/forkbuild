import { formatDate, t } from '../../i18n/i18n.js';
import I18nText from '../../i18n/I18nText.js';
import { createVerifiedPublisherResolver } from '../../../application/publication/FollowingFeed.js';
import { builderRoute } from './builtWithText.js';

// On a build's page, under its family tree: builds by other people,
// published before it, that look a lot like it
// (application/publication/SimilarBuildFinder.js#findEarlier()). It lets a
// builder find a copy of their build, and anyone see where a build may have
// come from. Like the family tree it is no ranking; unlike it, it is no
// record either: looking alike is evidence for a person to weigh, so the
// section says plainly that it doesn't mean anyone copied. `matches` are the
// finder's { publication, evidence }; `routeFor(publication)` is where each
// opens, or null.
const verifiedPublisherOf = createVerifiedPublisherResolver();

export default {
    name: 'SimilarEarlierBuilds',
    components: { I18nText },
    props: {
        matches: { type: Array, default: () => [] },
        routeFor: { type: Function, default: () => null },
        heading: { type: String, default: 'h3' }
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
        function detail(match) {
            const published = new Date(match.publication.publishedAt);
            const percent = Math.round(match.evidence.similarity * 100);
            return Number.isNaN(published.getTime())
                ? t('similarEarlier.percent', { percent })
                : t('similarEarlier.detail', { percent, date: formatDate(published, { dateStyle: 'medium' }) });
        }
        return { t, title, authorRoute, detail };
    },
    template: `
        <section v-if="matches.length" class="similar-earlier" :aria-label="t('similarEarlier.title')">
            <component :is="heading" class="similar-earlier-title">{{ t('similarEarlier.title') }}</component>
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
            <p class="similar-earlier-note">{{ t('similarEarlier.note') }}</p>
        </section>
    `
};
