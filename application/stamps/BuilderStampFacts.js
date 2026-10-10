import { challengeOfTags } from '../../core/BuildChallenge.js';
import { snapshotBrickCount } from '../../core/BuilderStamps.js';
import { publishedBuildTags } from '../challenge/PublishedBuildTags.js';

const SNAPSHOT_KEY_PREFIX = 'snapshot:';

// The facts builder stamps (core/BuilderStamps.js) are earned from, read from
// this device's own records:
// - ownPublications: the Publications this device published
//   (LocalDiscoveryProvider#list());
// - discoveryProvider: every Publication this device knows of, for remixes
//   of those builds made by others;
// - storageProvider: the published snapshots (tags, bricks);
// - buildPlotStore: Build here's plots.
// Each fact counts distinct builds (documents), so publishing a build again
// counts it once. A record that can't be read is skipped, never fatal.
export async function gatherBuilderStampFacts({ ownPublications = [], discoveryProvider = null, storageProvider = null, buildPlotStore = null }) {
    const own = (Array.isArray(ownPublications) ? ownPublications : []).filter((publication) => typeof publication?.documentId === 'string');
    const ownDocuments = new Set(own.map((publication) => publication.documentId));

    const remixesByOthers = new Set();
    if (discoveryProvider) {
        for (const documentId of ownDocuments) {
            for (const remix of safe(() => discoveryProvider.findByParentId(documentId))) {
                if (remix?.parentDocumentId === documentId && typeof remix.documentId === 'string' && !ownDocuments.has(remix.documentId)) {
                    remixesByOthers.add(remix.documentId);
                }
            }
        }
    }

    const remixesMade = new Set(own
        .filter((publication) => typeof publication.parentDocumentId === 'string' && publication.parentDocumentId && !ownDocuments.has(publication.parentDocumentId))
        .map((publication) => publication.documentId));

    const challenges = new Set();
    let largestBuildBricks = 0;
    if (storageProvider) {
        for (const publication of own) {
            const challenge = challengeOfTags(safeValue(() => publishedBuildTags(storageProvider, publication.id), []));
            if (challenge) challenges.add(challenge.id);
            const snapshot = await loadSnapshot(storageProvider, publication.id);
            largestBuildBricks = Math.max(largestBuildBricks, snapshotBrickCount(snapshot));
        }
    }

    const plotted = new Set(safe(() => buildPlotStore?.list() ?? [])
        .map((plot) => plot.buildDocumentId)
        .filter((documentId) => ownDocuments.has(documentId)));

    return Object.freeze({
        publishedBuilds: ownDocuments.size,
        remixesByOthers: remixesByOthers.size,
        remixesMade: remixesMade.size,
        challengesEntered: challenges.size,
        largestBuildBricks,
        buildsOnPlots: plotted.size
    });
}

async function loadSnapshot(storageProvider, publicationId) {
    try {
        return typeof storageProvider.loadAsync === 'function'
            ? await storageProvider.loadAsync(SNAPSHOT_KEY_PREFIX + publicationId)
            : storageProvider.load(SNAPSHOT_KEY_PREFIX + publicationId);
    } catch {
        return null;
    }
}

function safe(read) {
    const value = safeValue(read, []);
    return Array.isArray(value) ? value : [];
}

function safeValue(read, fallback) {
    try {
        return read();
    } catch {
        return fallback;
    }
}
