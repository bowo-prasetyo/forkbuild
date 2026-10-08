import { computed, onMounted, ref } from 'vue';
import BuildTurntable from '../components/featured/BuildTurntable.js';
import { EmbeddedBuildOutcome, openEmbeddedBuild } from '../../application/publication/sharing/OpenEmbeddedBuild.js';
import { bricksOfDocument } from '../../application/publication/sharing/ReadSharedBuild.js';
import { linkOnlyPublicationViewUrl } from '../../core/ForkBuildAppLinks.js';
import { License } from '../../core/License.js';
import { t } from '../i18n/i18n.js';

// A build on another site's page (ui/embed/embedBoot.js): the build turning,
// which a drag turns by hand, its title and maker, and one link into
// ForkBuild, Remix on ForkBuild (or Open in ForkBuild when its license
// allows no copies), which opens the shared link's screen in a new tab. Fills
// whatever frame it is given.
export default {
    name: 'EmbedView',
    components: { BuildTurntable },
    props: {
        payload: { type: String, default: null },
        verifier: { type: Object, required: true },
        funnel: { type: Object, default: null },
        appUrl: { type: String, required: true }
    },
    setup(props) {
        const state = ref('loading');
        const message = ref('');
        const build = ref(null);
        const turned = ref(false);

        async function open() {
            const result = await openEmbeddedBuild({ payload: props.payload, verifier: props.verifier });
            if (result.outcome !== EmbeddedBuildOutcome.OPENED) {
                message.value = t(result.message);
                state.value = 'failed';
                return;
            }
            const { publication, document } = result;
            const license = publication.license instanceof License ? publication.license : new License(publication.license || {});
            build.value = Object.freeze({
                title: typeof publication.title === 'string' && publication.title.trim() ? publication.title.trim() : t('publicationLink.untitled'),
                author: typeof publication.author === 'string' && publication.author.trim() ? publication.author.trim() : null,
                remixAllowed: license.forkAllowed,
                bricks: bricksOfDocument(document)
            });
            state.value = 'opened';
            props.funnel?.embedViewed();
        }

        const appLink = computed(() => (props.payload ? linkOnlyPublicationViewUrl(props.payload, props.appUrl) : props.appUrl));
        const buildBricks = () => build.value?.bricks ?? [];
        const showTurntable = computed(() => (build.value?.bricks.length ?? 0) > 0);

        function openedInForkBuild() {
            props.funnel?.openedFromEmbed();
        }

        onMounted(open);

        return { t, state, message, build, turned, appLink, buildBricks, showTurntable, openedInForkBuild };
    },
    template: `
        <div :class="['embed', 'embed--' + state]">
            <div class="embed-stage">
                <template v-if="state === 'opened' && build">
                    <BuildTurntable
                        v-if="showTurntable"
                        :bricks="buildBricks"
                        :label="t('embed.turntableLabel', { title: build.title })"
                        draggable
                        @turned="turned = true"
                    />
                    <img v-else class="build-turntable-fallback" src="favicon.svg" :alt="t('publicationLink.turntableLabel', { title: build.title })">
                    <p v-if="showTurntable && !turned" class="embed-hint" aria-hidden="true">{{ t('embed.dragHint') }}</p>
                </template>
                <p v-else-if="state === 'loading'" class="embed-status" role="status">{{ t('embed.loading') }}</p>
                <div v-else class="embed-status">
                    <p role="alert">{{ message }}</p>
                    <a :href="appUrl" target="_blank" rel="noopener">{{ t('embed.whatIsForkBuild') }}</a>
                </div>
            </div>
            <div v-if="state === 'opened' && build" class="embed-bar">
                <div class="embed-caption">
                    <span class="embed-title">{{ build.title }}</span>
                    <span class="embed-author">{{ build.author ? t('publicationLink.by', { author: build.author }) : t('publicationLink.byUnknown') }}</span>
                </div>
                <a class="embed-open" :href="appLink" target="_blank" rel="noopener" @click="openedInForkBuild">
                    {{ build.remixAllowed ? t('embed.remix') : t('embed.open') }}
                </a>
            </div>
        </div>
    `
};
