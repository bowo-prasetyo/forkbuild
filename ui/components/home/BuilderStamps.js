import { inject, onMounted, ref } from 'vue';
import { builderStamps } from '../../../core/BuilderStamps.js';
import { gatherBuilderStampFacts } from '../../../application/stamps/BuilderStampFacts.js';
import { CreateDiscoveryUseCase } from '../../../application/discovery/CreateDiscoveryUseCase.js';
import { LocalDiscoveryProvider } from '../../../discovery/LocalDiscoveryProvider.js';
import { LocalStorageProvider } from '../../../storage/LocalStorageProvider.js';
import { t } from '../../i18n/i18n.js';

const ICONS = Object.freeze({
    published: '🏠',
    remixed: '🌱',
    remixer: '🔀',
    challenger: '🏁',
    bigBuild: '🧱',
    onPlot: '📍'
});

// Home's "Your stamps" (core/BuilderStamps.js): facts about this device's
// own builds, shown only to their builder and only once one is earned.
// `facts` stands in for this device's records (tests).
export default {
    name: 'BuilderStamps',
    props: {
        facts: { type: Object, default: null }
    },
    setup(props) {
        const stamps = ref([]);
        const buildPlotStore = inject('buildPlotStore', null);
        const decentralizedDiscoveryProvider = inject('decentralizedPublicationDiscoveryProvider', null);

        onMounted(async () => {
            let facts = props.facts;
            if (!facts) {
                try {
                    const storageProvider = new LocalStorageProvider();
                    const { discoveryProvider } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider });
                    facts = await gatherBuilderStampFacts({
                        ownPublications: new LocalDiscoveryProvider(storageProvider).list(),
                        discoveryProvider,
                        storageProvider,
                        buildPlotStore
                    });
                } catch {
                    facts = {};
                }
            }
            stamps.value = builderStamps(facts).map((stamp) => ({
                ...stamp,
                icon: ICONS[stamp.id] || '⭐',
                title: t(`builderStamps.${stamp.id}.title`),
                fact: t(`builderStamps.${stamp.id}.fact`, { count: stamp.count })
            }));
        });

        return { t, stamps };
    },
    template: `
        <section v-if="stamps.length" class="home-section builder-stamps" aria-labelledby="builder-stamps-title">
            <h2 id="builder-stamps-title">{{ t('builderStamps.title') }}</h2>
            <p class="home-section-lead">{{ t('builderStamps.lead') }}</p>
            <ul class="builder-stamp-list">
                <li v-for="stamp in stamps" :key="stamp.id" class="builder-stamp" :data-stamp="stamp.id">
                    <span class="builder-stamp-icon" aria-hidden="true">{{ stamp.icon }}</span>
                    <span class="builder-stamp-title">{{ stamp.title }}</span>
                    <span class="builder-stamp-fact">{{ stamp.fact }}</span>
                </li>
            </ul>
        </section>
    `
};
