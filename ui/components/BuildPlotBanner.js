import { t } from '../i18n/i18n.js';

// The Editor's note for a build started with Build here (core/BuildPlot.js):
// where it will stand once published, then where it stands, with a way to
// go and see it, or to forget the spot.
export default {
    name: 'BuildPlotBanner',
    props: {
        plot: { type: Object, required: true },
        published: { type: Boolean, default: false }
    },
    emits: ['visit', 'forget'],
    setup(props) {
        const world = () => props.plot.worldTitle || t('buildPlot.aWorld');
        return { t, world };
    },
    template: `
        <div class="build-plot-banner" role="status">
            <span class="build-plot-banner-text">{{ published ? t('buildPlot.published', { world: world() }) : t('buildPlot.pending', { world: world() }) }}</span>
            <button v-if="published" type="button" class="action-btn action-btn--primary build-plot-visit" @click="$emit('visit')">{{ t('buildPlot.visit') }}</button>
            <button type="button" class="action-btn build-plot-forget" @click="$emit('forget')">{{ t('buildPlot.forget') }}</button>
        </div>
    `
};
