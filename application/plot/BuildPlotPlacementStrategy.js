// Where publishing places a build first (PublishDocumentUseCase): on its plot
// when it was started with Build here (application/plot/BuildPlotStore.js),
// otherwise wherever `fallback` (the usual GridPlacementStrategy) puts it.
export class BuildPlotPlacementStrategy {
    constructor({ buildPlotStore, fallback }) {
        this._buildPlotStore = buildPlotStore;
        this._fallback = fallback;
    }

    computePosition(context = {}) {
        const plot = typeof context.documentId === 'string' ? this._plotFor(context.documentId) : null;
        return plot ? { ...plot.position } : this._fallback.computePosition(context);
    }

    _plotFor(documentId) {
        try {
            return this._buildPlotStore.forBuild(documentId);
        } catch {
            return null;
        }
    }
}
