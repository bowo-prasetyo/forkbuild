import { ref } from 'vue';
import { DocumentSerializer } from '../../../serializer/DocumentSerializer.js';
import { computeContentHash } from '../../../serializer/contentHash.js';
import { distanceBetween } from '../../../core/SpatialQuery.js';
import { SnapshotWorldPlacementOutcome } from '../../../application/snapshot/placement/SnapshotWorldPlacementOutcome.js';
import {
    ClaimedBuildStore, ClaimedBuildAcceptance, describeClaimedBuildAcceptance, selectVisibleClaimedBuilds
} from '../../../application/snapshot/claimed/ClaimedBuilds.js';

// refreshSpatialUI() runs as the camera moves; the ghost set changes far less
// often, so an unforced reconcile runs at most this often.
const RECONCILE_INTERVAL_MS = 1000;

const ACCEPTANCE_HINTS = Object.freeze({
    [ClaimedBuildAcceptance.ACCEPTABLE]: 'Places your own copy of this build at the claimed position.',
    [ClaimedBuildAcceptance.PUBLICATION_UNKNOWN]: 'Its publisher\'s signed Publication isn\'t on this device yet. It arrives when they share it with you (it then shows in your Repository), or from a connected peer in World Encounters.',
    [ClaimedBuildAcceptance.CONTENT_MISMATCH]: 'The verified Publication names different content than this ghost shows, so accepting it could place something else.'
});

// World View's claimed builds (application/snapshot/claimed/ClaimedBuilds.js):
// records the claimed position of every Snapshot the automatic cascade
// stopped at UNPLACED, draws the nearby ones as ghosts from their already
// downloaded content, and offers the one explicit way to trust a claim,
// Accept Position, which places the Publication through the ordinary
// session.placePublication() path. Scoped to this mount.
export function useClaimedBuilds({
    session, publicationContentStore, feedback, guarded, refreshSpatialUI, getViewerPosition,
    now = () => Date.now(), documentSerializer = new DocumentSerializer()
}) {
    const store = new ClaimedBuildStore();
    const claimedBuildRows = ref([]);
    // key -> { status: 'loading' | 'ready' | 'failed', world?, title?, author? }
    const contents = new Map();
    const shown = new Set();
    let lastReconcileAt = -Infinity;
    let active = true;

    // Called with every automatic cascade result. Only an UNPLACED run whose
    // candidate carried a claimed position becomes a claim: the bytes are
    // already downloaded and content-checked by then.
    function noteSnapshotCandidateResult(candidate, result) {
        if (!candidate || !result || result.outcome !== SnapshotWorldPlacementOutcome.UNPLACED) {
            return;
        }
        const recorded = store.record({
            publicationId: result.publicationId,
            contentHash: result.contentHash,
            claimedPosition: candidate.claimedPosition
        });
        if (recorded) {
            reconcileClaimedBuilds({ force: true });
        }
    }

    // Reads the build once from the content store, checking the bytes against
    // the claim's own hash, then reconciles again to draw it.
    function loadContent(claim) {
        if (contents.has(claim.key)) {
            return;
        }
        contents.set(claim.key, { status: 'loading' });
        Promise.resolve()
            .then(() => (publicationContentStore ? publicationContentStore.get({ hash: claim.contentHash }) : null))
            .then((text) => {
                if (typeof text !== 'string' || computeContentHash(text) !== claim.contentHash) {
                    throw new Error('claimed build content is unavailable or does not match its hash');
                }
                const document = documentSerializer.deserialize(JSON.parse(text));
                contents.set(claim.key, {
                    status: 'ready',
                    world: document.world,
                    title: document.metadata.title || 'Untitled',
                    author: document.metadata.author || null
                });
            })
            .catch(() => {
                contents.set(claim.key, { status: 'failed' });
            })
            .then(() => {
                if (active) {
                    reconcileClaimedBuilds({ force: true });
                }
            });
    }

    function findPublicationById(publicationId) {
        return typeof session.findPublicationById === 'function' ? session.findPublicationById(publicationId) : null;
    }

    function reconcileClaimedBuilds({ force = false } = {}) {
        if (!active) {
            return;
        }
        const time = now();
        if (!force && time - lastReconcileAt < RECONCILE_INTERVAL_MS) {
            return;
        }
        lastReconcileAt = time;

        const viewerPosition = getViewerPosition();
        const visible = selectVisibleClaimedBuilds(store.list(), {
            viewerPosition,
            isPlaced: (publicationId) => !!session.getPlacementInfoForPublication(publicationId),
            isDismissed: (key) => store.isDismissed(key),
            knownPlacements: session.listKnownPlacements()
        });
        const visibleKeys = new Set(visible.map((claim) => claim.key));
        for (const key of Array.from(shown)) {
            if (!visibleKeys.has(key)) {
                session.hideClaimedBuild(key);
                shown.delete(key);
            }
        }

        const rows = [];
        for (const claim of visible) {
            const content = contents.get(claim.key);
            if (!content) {
                loadContent(claim);
                continue;
            }
            if (content.status !== 'ready') {
                continue;
            }
            if (!shown.has(claim.key)) {
                session.showClaimedBuild(claim.key, content.world, claim.position);
                shown.add(claim.key);
            }
            const acceptance = describeClaimedBuildAcceptance(claim, findPublicationById);
            rows.push({
                key: claim.key,
                publicationId: claim.publicationId,
                contentHash: claim.contentHash,
                position: claim.position,
                title: content.title,
                author: content.author,
                distance: Math.round(distanceBetween(claim.position, viewerPosition)),
                acceptable: acceptance === ClaimedBuildAcceptance.ACCEPTABLE,
                acceptanceHint: ACCEPTANCE_HINTS[acceptance]
            });
        }
        rows.sort((a, b) => a.distance - b.distance);
        claimedBuildRows.value = rows;
    }

    function navigateToClaimedBuild(row) {
        if (row && session.focusPosition(row.position)) {
            refreshSpatialUI();
        }
    }

    // The explicit trust step. Re-checks acceptance at click time, since the
    // row may be stale. The new Placement is this Wanderer's own, signed like
    // any other; once it exists the ghost yields to the real build.
    function acceptClaimedBuild(row) {
        if (!row) {
            return;
        }
        const claim = store.list().find((c) => c.key === row.key);
        if (!claim) {
            return;
        }
        const acceptance = describeClaimedBuildAcceptance(claim, findPublicationById);
        if (acceptance !== ClaimedBuildAcceptance.ACCEPTABLE) {
            feedback.show(ACCEPTANCE_HINTS[acceptance]);
            reconcileClaimedBuilds({ force: true });
            return;
        }
        guarded(() => {
            session.placePublication(claim.publicationId, { ...claim.position });
            feedback.show(`Accepted "${row.title}" at its claimed position`);
        });
        reconcileClaimedBuilds({ force: true });
        refreshSpatialUI();
    }

    function dismissClaimedBuild(row) {
        if (!row) {
            return;
        }
        store.dismiss(row.key);
        reconcileClaimedBuilds({ force: true });
    }

    function disposeClaimedBuilds() {
        active = false;
        for (const key of Array.from(shown)) {
            session.hideClaimedBuild(key);
        }
        shown.clear();
    }

    return {
        claimedBuildRows, noteSnapshotCandidateResult, reconcileClaimedBuilds,
        navigateToClaimedBuild, acceptClaimedBuild, dismissClaimedBuild, disposeClaimedBuilds
    };
}
