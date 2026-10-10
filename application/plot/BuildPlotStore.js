// This device's plots (core/BuildPlot.js), one per build. Personal and local:
// only the placement made when the build is published is ever shared.
import { StorageProvider } from '../../storage/StorageProvider.js';
import { normalizeBuildPlot } from '../../core/BuildPlot.js';

export const BUILD_PLOTS_ENTRY_NAME = 'build-plots';
// Plenty for anyone's builds in progress; the oldest go first.
const MAX_PLOTS = 100;

export class BuildPlotStore {
    constructor({ storageProvider }) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('BuildPlotStore requires a StorageProvider');
        }
        this._storage = storageProvider;
    }

    list() {
        let saved;
        try {
            saved = this._storage.load(BUILD_PLOTS_ENTRY_NAME);
        } catch {
            return [];
        }
        return (Array.isArray(saved) ? saved : []).map(normalizeBuildPlot).filter(Boolean);
    }

    forBuild(buildDocumentId) {
        return this.list().find((plot) => plot.buildDocumentId === buildDocumentId) || null;
    }

    // Saves `plot`, replacing the build's earlier one. Returns it, or null
    // when it isn't a plot.
    save(plot) {
        const normalized = normalizeBuildPlot({ createdAt: new Date().toISOString(), ...plot });
        if (!normalized) return null;
        const others = this.list().filter((existing) => existing.buildDocumentId !== normalized.buildDocumentId);
        this._storage.save(BUILD_PLOTS_ENTRY_NAME, [...others, normalized].slice(-MAX_PLOTS));
        return normalized;
    }

    remove(buildDocumentId) {
        const plots = this.list();
        const kept = plots.filter((plot) => plot.buildDocumentId !== buildDocumentId);
        if (kept.length !== plots.length) this._storage.save(BUILD_PLOTS_ENTRY_NAME, kept);
        return kept.length !== plots.length;
    }
}
