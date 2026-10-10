import { computed, inject, ref } from 'vue';
import { plotPositionFromQuery } from '../../../core/BuildPlot.js';
import { t } from '../../i18n/i18n.js';

// Build here (core/BuildPlot.js): World View opens the Editor on
// `/editor?plot=<world>&x=&y=&z=&title=` to start a new build for that spot.
// The plot is remembered for the new build, so that publishing it stands it
// there (application/plot/BuildPlotPlacementStrategy.js), and a banner says
// so while the build is open.
export function useBuildPlot({ documentManager, documentVersion, router, feedback }) {
    const store = inject('buildPlotStore', null);
    const revision = ref(0);
    // Builds published with a plot during this visit to the Editor.
    const publishedHere = ref(new Set());

    const buildPlot = computed(() => {
        documentVersion.value;
        revision.value;
        const document = documentManager.document;
        if (!store || !document) return null;
        try {
            return store.forBuild(document.world.id);
        } catch {
            return null;
        }
    });
    const buildPlotPublished = computed(() => Boolean(buildPlot.value && publishedHere.value.has(buildPlot.value.buildDocumentId)));

    // Starts an empty build for the plot a Build here link names. False when
    // the link names none.
    function startBuildPlot(query, editorSession) {
        const worldDocumentId = typeof query?.plot === 'string' ? query.plot : null;
        const position = plotPositionFromQuery(query);
        if (!store || !worldDocumentId || !position) return false;
        editorSession.newDocument();
        const document = documentManager.document;
        if (!document) return false;
        const worldTitle = typeof query.title === 'string' ? query.title : '';
        store.save({ buildDocumentId: document.world.id, worldDocumentId, worldTitle, position });
        revision.value += 1;
        feedback.show(t('buildPlot.started', { world: worldTitle || t('buildPlot.aWorld') }));
        return true;
    }

    function onBuildPlotPublished(publication) {
        if (!store || !publication?.documentId || !store.forBuild(publication.documentId)) return;
        publishedHere.value = new Set([...publishedHere.value, publication.documentId]);
    }

    function forgetBuildPlot() {
        if (!store || !buildPlot.value) return;
        store.remove(buildPlot.value.buildDocumentId);
        revision.value += 1;
    }

    function visitBuildPlot() {
        if (buildPlot.value) router.push({ path: `/world/${buildPlot.value.worldDocumentId}` });
    }

    return { buildPlot, buildPlotPublished, startBuildPlot, onBuildPlotPublished, forgetBuildPlot, visitBuildPlot };
}
