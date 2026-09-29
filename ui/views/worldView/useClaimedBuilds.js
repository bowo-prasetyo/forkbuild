import { ref } from 'vue';
import { DocumentSerializer } from '../../../serializer/DocumentSerializer.js';
import { contentHashMatches } from '../../../serializer/contentHash.js';
import { distanceBetween } from '../../../core/SpatialQuery.js';
import { SnapshotWorldPlacementOutcome } from '../../../application/snapshot/placement/SnapshotWorldPlacementOutcome.js';
import {
    ClaimedBuildStore, ClaimedBuildAcceptance, describeClaimedBuildAcceptance, selectVisibleClaimedBuilds
} from '../../../application/snapshot/claimed/ClaimedBuilds.js';
import { ClaimedBuildVerificationOutcome } from '../../../application/snapshot/claimed/VerifyClaimedBuildPublication.js';
import { PublisherPlacementAdoption } from '../../../application/placement/AdoptPublisherPlacementUseCase.js';
import { t } from '../../i18n/i18n.js';

// refreshSpatialUI() runs as the camera moves; the ghost set changes far less
// often, so an unforced reconcile runs at most this often.
const RECONCILE_INTERVAL_MS = 1000;

const ACCEPTANCE_HINTS = Object.freeze({
    [ClaimedBuildAcceptance.ACCEPTABLE]: 'claimedBuild.acceptable',
    [ClaimedBuildAcceptance.PUBLICATION_UNKNOWN]: 'claimedBuild.publicationUnknown',
    [ClaimedBuildAcceptance.CONTENT_MISMATCH]: 'claimedBuild.contentMismatch',
    [ClaimedBuildAcceptance.PUBLISHER_ONLY]: 'claimedBuild.publisherOnly'
});

const VERIFICATION_MESSAGES = Object.freeze({
    [ClaimedBuildVerificationOutcome.NOT_FOUND]: 'claimedBuild.notFound',
    [ClaimedBuildVerificationOutcome.UNVERIFIED]: 'claimedBuild.unverified',
    [ClaimedBuildVerificationOutcome.CONTENT_MISMATCH]: 'claimedBuild.verifiedMismatch',
    failed: 'claimedBuild.verificationFailed'
});

// "did:key:z6MkhaXgBZDv…a1b2c3": enough to recognise a key again, short
// enough for a row.
function abbreviateKey(id) {
    if (typeof id !== 'string') return null;
    return id.length > 26 ? `${id.slice(0, 18)}…${id.slice(-6)}` : id;
}

// World View's claimed builds (application/snapshot/claimed/ClaimedBuilds.js):
// records the claimed position of every Snapshot the automatic cascade
// stopped at UNPLACED, draws the nearby ones as ghosts from their already
// downloaded content, and offers the one explicit way to trust a claim,
// Accept Position, which places the Publication through the ordinary
// session.placePublication() path. Scoped to this mount.
export function useClaimedBuilds({
    session, publicationContentStore, feedback, guarded, refreshSpatialUI, getViewerPosition,
    verifyClaimedBuildPublicationCommand = null,
    now = () => Date.now(), documentSerializer = new DocumentSerializer()
}) {
    const store = new ClaimedBuildStore();
    const claimedBuildRows = ref([]);
    // key -> { status: 'loading' | 'ready' | 'failed', world?, title?, author? }
    const contents = new Map();
    const shown = new Set();
    // key -> { verifying: boolean, message: string | null }
    const verifications = new Map();
    // Publishers' signed placements waiting for their Publication to become
    // known here: `${publicationId}:${record hash}` -> record JSON.
    const pendingPlacements = new Map();
    const adopting = new Set();
    let lastReconcileAt = -Infinity;
    let active = true;

    // Called with every automatic cascade result. A publisher's signed
    // placement riding with the candidate is offered for adoption whatever the
    // outcome. Only an UNPLACED run whose candidate carried a claimed position
    // becomes a claim: the bytes are already downloaded and content-checked by then.
    function noteSnapshotCandidateResult(candidate, result) {
        if (candidate && candidate.placementRecord) {
            adoptPublisherPlacement(candidate.placementRecord);
        }
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

    // Once adopted, the build is a real placement where its publisher put it,
    // and its ghost (if any) yields to it on the next reconcile. One the device
    // can't judge yet waits until its Publication is known.
    function adoptPublisherPlacement(record) {
        if (typeof session.adoptPublisherPlacement !== 'function' || !record || !record.publicationId) {
            return Promise.resolve(null);
        }
        const key = `${record.publicationId}:${record.contentHash}`;
        if (adopting.has(key)) {
            return Promise.resolve(null);
        }
        adopting.add(key);
        return Promise.resolve().then(() => session.adoptPublisherPlacement(record)).then((adoption) => {
            adopting.delete(key);
            if (adoption && adoption.outcome === PublisherPlacementAdoption.PUBLICATION_UNKNOWN) {
                pendingPlacements.set(key, record);
            } else {
                pendingPlacements.delete(key);
            }
            if (adoption && adoption.outcome === PublisherPlacementAdoption.ADOPTED && active) {
                reconcileClaimedBuilds({ force: true });
                refreshSpatialUI();
            }
            return adoption;
        }, () => {
            adopting.delete(key);
            return null;
        });
    }

    function retryPendingPlacements() {
        for (const record of Array.from(pendingPlacements.values())) {
            if (findPublicationById(record.publicationId)) {
                adoptPublisherPlacement(record);
            }
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
                if (typeof text !== 'string' || !contentHashMatches(text, claim.contentHash)) {
                    throw new Error('claimed build content is unavailable or does not match its hash');
                }
                const document = documentSerializer.deserialize(JSON.parse(text));
                contents.set(claim.key, {
                    status: 'ready',
                    world: document.world,
                    title: document.metadata.title || t('worldView.untitled'),
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

    function isPlacementPermitted(publication) {
        if (!publication || typeof session.getPublicationPlacementPermission !== 'function') {
            return true;
        }
        return session.getPublicationPlacementPermission(publication).allowed;
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
        retryPendingPlacements();

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
            const acceptance = describeClaimedBuildAcceptance(claim, findPublicationById, isPlacementPermitted);
            const publication = acceptance === ClaimedBuildAcceptance.ACCEPTABLE ? findPublicationById(claim.publicationId) : null;
            const identity = publication ? publication.publisherIdentity : null;
            const verification = verifications.get(claim.key) || null;
            rows.push({
                key: claim.key,
                publicationId: claim.publicationId,
                contentHash: claim.contentHash,
                position: claim.position,
                title: content.title,
                author: content.author,
                distance: Math.round(distanceBetween(claim.position, viewerPosition)),
                acceptable: acceptance === ClaimedBuildAcceptance.ACCEPTABLE,
                acceptanceHint: ACCEPTANCE_HINTS[acceptance] ? t(ACCEPTANCE_HINTS[acceptance]) : undefined,
                // Once verified: who signed it, as the key itself. The name is
                // the publisher's own label; the key is what was checked.
                signedBy: publication ? (publication.author || null) : null,
                publisherKey: identity ? abbreviateKey(identity.id) : null,
                canVerify: acceptance === ClaimedBuildAcceptance.PUBLICATION_UNKNOWN && typeof verifyClaimedBuildPublicationCommand === 'function',
                verifying: !!(verification && verification.verifying),
                verificationMessage: verification ? verification.message : null
            });
        }
        rows.sort((a, b) => a.distance - b.distance);
        claimedBuildRows.value = rows;
    }

    // Fetches and checks the build's signed Publication from the network
    // (VerifyClaimedBuildPublication.js). On success it is admitted, so the
    // next reconcile finds it and enables Accept Position. Never accepts.
    function verifyClaimedBuild(row) {
        if (!row || typeof verifyClaimedBuildPublicationCommand !== 'function') {
            return Promise.resolve(null);
        }
        const current = verifications.get(row.key);
        if (current && current.verifying) {
            return Promise.resolve(null);
        }
        verifications.set(row.key, { verifying: true, message: null });
        reconcileClaimedBuilds({ force: true });
        return Promise.resolve()
            .then(() => verifyClaimedBuildPublicationCommand({ publicationId: row.publicationId, contentHash: row.contentHash }))
            .then((result) => (result && result.outcome) || 'failed', () => 'failed')
            .then((outcome) => {
                verifications.set(row.key, {
                    verifying: false,
                    message: outcome === ClaimedBuildVerificationOutcome.VERIFIED ? null : t(VERIFICATION_MESSAGES[outcome] || VERIFICATION_MESSAGES.failed)
                });
                if (outcome === ClaimedBuildVerificationOutcome.VERIFIED) {
                    const hasPublisherPlacement = Array.from(pendingPlacements.values())
                        .some((record) => record.publicationId === row.publicationId);
                    feedback.show(hasPublisherPlacement
                        ? t('claimedBuild.verifiedShown', { title: row.title })
                        : t('claimedBuild.verifiedAcceptable', { title: row.title }));
                }
                if (active) {
                    reconcileClaimedBuilds({ force: true });
                }
                return outcome;
            });
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
        const acceptance = describeClaimedBuildAcceptance(claim, findPublicationById, isPlacementPermitted);
        if (acceptance !== ClaimedBuildAcceptance.ACCEPTABLE) {
            feedback.show(ACCEPTANCE_HINTS[acceptance] ? t(ACCEPTANCE_HINTS[acceptance]) : '');
            reconcileClaimedBuilds({ force: true });
            return;
        }
        guarded(() => {
            session.placePublication(claim.publicationId, { ...claim.position });
            feedback.show(t('claimedBuild.accepted', { title: row.title }));
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
        navigateToClaimedBuild, verifyClaimedBuild, acceptClaimedBuild, dismissClaimedBuild, disposeClaimedBuilds
    };
}
