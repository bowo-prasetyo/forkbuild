import { t } from '../../i18n/i18n.js';
import SimilarEarlierBuilds from './SimilarEarlierBuilds.js';
import { exploreRouteFor } from '../publicationCatalog/useRepositoryNetworkDiscovery.js';

// On an Explore card (ui/components/PublicationCard.js) for a build this
// device published itself, and only there, a quiet line says how many builds
// by other people, published after it, look a lot like it
// (application/publication/SimilarBuildFinder.js#findLater()), and opens the
// list. A builder finds copies of their work this way without anyone else's
// build being labelled in a list everyone browses. Renders nothing for anyone
// else's build, with nothing alike, or when the look fails.
export default {
    name: 'OwnLookAlikes',
    components: { SimilarEarlierBuilds },
    inject: {
        similarBuildFinder: { default: null },
        // isOwnPublication(publication): whether this device published it.
        isOwnPublication: { default: null },
        networkPublicationLocatorStore: { default: null }
    },
    props: {
        publication: { type: Object, required: true }
    },
    data() {
        return { matches: [], open: false };
    },
    watch: {
        'publication.id'() {
            this.look();
        }
    },
    mounted() {
        this.look();
    },
    methods: {
        t,
        async look() {
            const publication = this.publication;
            this.matches = [];
            this.open = false;
            if (!this.similarBuildFinder || typeof this.isOwnPublication !== 'function') return;
            let found = [];
            try {
                if (!this.isOwnPublication(publication)) return;
                found = await this.similarBuildFinder.findLater(publication);
            } catch {
                found = [];
            }
            if (this.publication?.id === publication.id) this.matches = found;
        },
        routeFor(publication) {
            return publication ? exploreRouteFor(publication, this.networkPublicationLocatorStore) : null;
        }
    },
    template: `
        <div v-if="matches.length" class="publication-look-alikes">
            <button
                type="button"
                class="publication-look-alikes-toggle"
                :aria-expanded="open ? 'true' : 'false'"
                @click="open = !open"
            >{{ t('publicationCard.lookAlikes', { count: matches.length }) }}</button>
            <SimilarEarlierBuilds
                v-if="open"
                :matches="matches"
                :route-for="routeFor"
                heading="h4"
                title-key="similarLater.title"
                note-key="similarLater.note"
            />
        </div>
    `
};
