import { reactive, ref, computed, onMounted, onBeforeUnmount, inject } from 'vue';
import { PeerLifecycleState } from '../../peer/PeerLifecycleState.js';
import { PublicationResolutionOutcome } from '../../application/PublicationResolutionOutcome.js';
import { resolvePublicationView, describePublicationOutcome, describeRetrieval } from '../../application/PublicationResolutionView.js';
import { AnchorVerificationOutcome } from '../../application/AnchorVerificationOutcome.js';
import { publicationEvidenceView, describeKnownEvidenceCount } from '../../application/PublicationEvidenceView.js';

// 0.7.5 — Decentralized Publication UX & Resolution.
// 0.7.6 — Multi-Peer Publication Retrieval & Replication.
//
// The "Publication Center" this milestone's own design conversation
// asked for: a single place a person can look at every application/
// DecentralizedPublication.js this replica's application/
// LocalPublicationCatalog.js has ever cataloged — its own, or one
// announced by a peer (application/PublicationPeerExchange.js, 0.7.3) —
// and see, per entry, whether its content can be seen RIGHT NOW.
//
// Every status shown below is DERIVED, at display time, by application/
// PublicationResolutionView.js#resolvePublicationView() — never stored
// on the entry, never cached across a re-check. Mirrors the restraint
// application/LocalPublicationCatalog.js's own header already states as
// a hard rule ("no resolution status field on a catalog entry... status
// is always derived, on demand") applied here to the one place that
// restraint finally has a UI to honor. Re-opening this page, or
// clicking "Re-check," always re-derives the answer from scratch; it is
// never wrong in a way a reload wouldn't also fix, and never stale in a
// way this page would hide.
//
// "Retrieve from Peers" replaces 0.7.5's own "Retrieve from Connected
// Peer" — the "multi-source retrieval... fallback... racing" that
// milestone's own docs/Roadmap.md entry named and sized as a future
// milestone (0.7.6) has arrived. This page still answers "who do I
// ask?" the identical deliberately narrow way — application/
// PublicationPeerExchange.js has never tracked which peer announced
// which publication (peer identity is informational only, by design;
// see that class's own header), so there is no natural "ask whoever
// told you about this" target to offer. What changed: instead of the
// FIRST currently AUTHENTICATED peer, this page now hands application/
// PublicationResolutionCoordinator.js#resolve() EVERY currently
// AUTHENTICATED peer, in application/PeerSessionManager.js's own
// registry order, as its `peers` candidate list — still a single,
// explicit, named policy living here, in the UI layer, never inside the
// coordinator itself (see that class's own header on why `peers` is
// always a required, caller-supplied argument). Candidates are tried in
// that order, never raced concurrently — see application/
// PeerContentRetrievalCoordinator.js's own header.
//
// 0.8.3 — Publication Center: External Evidence UX. Each entry also
// shows its own "External Evidence" section — every application/
// PublicationAnchor.js this replica has cataloged for that
// publication, discovered locally the moment the list itself loads
// (application/PublicationEvidenceCoordinator.js#discover(), a
// synchronous catalog read with no network access), never
// independently verified until a person clicks "Verify Evidence" on
// one specific anchor. Opening this page never calls application/
// ExternalAnchorVerifier.js; only that explicit click does. A
// verification result lives only in this component's own `entry.
// verifications` — ephemeral session state, never written back into
// application/LocalPublicationAnchorCatalog.js or the anchor itself —
// so re-opening this page, or asking again, always re-derives the
// answer fresh. See application/PublicationEvidenceView.js's own
// header and docs/Principles.md, "Known Evidence Is Not Verified
// Evidence, And Verified Evidence Is Not Authority (0.8.3)."
function humanizeContentKind(contentKind) {
    if (!contentKind) return 'Unknown content';
    return contentKind
        .replace(/^forkbuild\./, '')
        .replace(/[-.]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function shortId(identityId) {
    return identityId ? identityId.slice(-14) : 'an unknown identity';
}

const OUTCOME_BADGE_CLASSES = {
    [PublicationResolutionOutcome.RESOLVED]: 'peer-badge--authenticated',
    [PublicationResolutionOutcome.CONTENT_UNAVAILABLE]: 'peer-badge--pending'
};

// 0.8.3 — Publication Center: External Evidence UX. Reuses the three
// colors .peer-badge already defines rather than inventing seven new
// ones — VALID is the only outcome ever shown as "good" (green);
// VALID_PROOF_UNVERIFIED and PROOF_UNAVAILABLE both read as "honestly
// inconclusive" (amber), matching application/AnchorVerificationOutcome
// .js's own header on why neither is ever treated as a rejection; every
// other outcome reads as a definite rejection (red). The LABEL text —
// never this color alone — is what keeps all seven outcomes distinct;
// see application/PublicationEvidenceView.js#describeVerificationOutcome().
const EVIDENCE_BADGE_CLASSES = {
    [AnchorVerificationOutcome.VALID]: 'peer-badge--authenticated',
    [AnchorVerificationOutcome.VALID_PROOF_UNVERIFIED]: 'peer-badge--pending',
    [AnchorVerificationOutcome.PROOF_UNAVAILABLE]: 'peer-badge--pending',
    [AnchorVerificationOutcome.INVALID_ENVELOPE]: 'peer-badge--failed',
    [AnchorVerificationOutcome.INVALID_SIGNATURE]: 'peer-badge--failed',
    [AnchorVerificationOutcome.CONTENT_MISMATCH]: 'peer-badge--failed',
    [AnchorVerificationOutcome.INVALID_PROOF]: 'peer-badge--failed'
};

export default {
    name: 'DecentralizedPublicationsView',
    setup() {
        const catalog = inject('publicationCatalog');
        const coordinator = inject('publicationResolutionCoordinator');
        const kindPlugins = inject('publicationDisplayKindPlugins');
        const publicationPeerExchange = inject('publicationPeerExchange');
        const publicationPeerContentExchange = inject('publicationPeerContentExchange');
        const peerSessionManager = inject('peerSessionManager');
        const evidenceCoordinator = inject('publicationEvidenceCoordinator');

        const entries = reactive([]);
        const loading = ref(true);

        // Every currently AUTHENTICATED peer, in registry order — the
        // full candidate list this page now hands to application/
        // PublicationResolutionCoordinator.js#resolve() as `peers`. See
        // this file's own header on why this replaced 0.7.5's own
        // single `retrievalPeer`.
        const retrievalPeers = computed(() => peerSessionManager.listPeers()
            .filter((peer) => peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED));

        function findEntry(publicationId) {
            return entries.find((entry) => entry.publication.id === publicationId);
        }

        async function resolveEntry(entry) {
            entry.checking = true;
            try {
                entry.view = await resolvePublicationView(entry.publication, { coordinator, kindPlugins });
            } finally {
                entry.checking = false;
            }
        }

        // Rebuilds the entry LIST from the catalog (cheap, synchronous —
        // application/LocalPublicationCatalog.js#list() never touches the
        // network) without discarding a view already computed for a
        // publication still on file, then resolves whichever entries are
        // new.
        async function refreshList() {
            const known = new Map(entries.map((entry) => [entry.publication.id, entry]));
            const current = catalog.list();
            entries.splice(0, entries.length, ...current.map((publication) => known.get(publication.id) || reactive({
                publication,
                receivedAt: catalog.getReceivedAt(publication.id),
                view: null,
                checking: false,
                retrieving: false,
                evidenceAnchors: [],
                evidence: null,
                evidenceExpanded: false,
                verifications: {}
            })));
            await Promise.all(entries.filter((entry) => !entry.view && !entry.checking).map(resolveEntry));
            entries.forEach(loadEvidence);
        }

        // 0.8.3 — Publication Center: External Evidence UX. DISCOVERY
        // only: a synchronous local catalog read through application/
        // PublicationEvidenceCoordinator.js#discover(), never a call to
        // application/ExternalAnchorVerifier.js. Re-running this is
        // always cheap and safe — it re-reads whatever this replica's
        // catalog currently holds without disturbing `entry.
        // verifications`, the ephemeral per-anchor results a person may
        // already have on screen.
        function loadEvidence(entry) {
            if (!evidenceCoordinator) return;
            entry.evidenceAnchors = evidenceCoordinator.discover(entry.publication.id);
            entry.evidence = publicationEvidenceView(entry.evidenceAnchors, entry.verifications);
        }

        function toggleEvidence(entry) {
            entry.evidenceExpanded = !entry.evidenceExpanded;
        }

        // The one place this page calls application/
        // ExternalAnchorVerifier.js (through the coordinator) — always
        // for exactly ONE anchor, always because a person clicked
        // "Verify Evidence" on it. Cross-checks against THIS entry's own
        // publicationId/contentHash, so a mismatched anchor is reported
        // as CONTENT_MISMATCH rather than silently accepted as evidence
        // for the wrong publication.
        async function verifyAnchor(entry, anchorView) {
            const anchor = entry.evidenceAnchors.find((candidate) => candidate.id === anchorView.anchorId);
            if (!anchor || !evidenceCoordinator) return;
            entry.verifications[anchor.id] = { checking: true };
            entry.evidence = publicationEvidenceView(entry.evidenceAnchors, entry.verifications);
            const result = await evidenceCoordinator.verify(anchor, {
                expectedContentHash: entry.publication.contentReference.hash,
                expectedPublicationId: entry.publication.id
            });
            entry.verifications[anchor.id] = { outcome: result.outcome, reason: result.reason };
            entry.evidence = publicationEvidenceView(entry.evidenceAnchors, entry.verifications);
        }

        function evidenceBadgeClass(anchorView) {
            if (anchorView.checking) return 'peer-badge--pending';
            if (!anchorView.verified) return 'peer-badge--unchecked';
            return EVIDENCE_BADGE_CLASSES[anchorView.verificationOutcome] || 'peer-badge--unchecked';
        }

        async function recheck(entry) {
            await resolveEntry(entry);
        }

        async function retrieve(entry) {
            const peers = retrievalPeers.value;
            if (!peers.length) {
                return;
            }
            entry.retrieving = true;
            try {
                entry.view = await resolvePublicationView(entry.publication, { coordinator, kindPlugins, peers });
            } finally {
                entry.retrieving = false;
            }
        }

        function canRetrieve(entry) {
            return Boolean(entry.view && entry.view.outcome === PublicationResolutionOutcome.CONTENT_UNAVAILABLE);
        }

        function formatWhen(iso) {
            return iso ? new Date(iso).toLocaleString() : 'unknown time';
        }

        function badgeClass(entry) {
            if (!entry.view) return 'peer-badge--pending';
            return OUTCOME_BADGE_CLASSES[entry.view.outcome] || 'peer-badge--failed';
        }

        function statusLabel(entry) {
            if (entry.checking) return 'Checking…';
            if (!entry.view) return 'Checking…';
            return describePublicationOutcome(entry.view.outcome);
        }

        // 0.7.6 — the "why is this available?" sentence this milestone's
        // own design conversation asked for. Distinguishes "the bytes
        // were already sitting in this device's own ContentStore" from
        // "the bytes just arrived from a connected peer, and were
        // accepted only after their hash matched" — application/
        // PublicationResolutionView.js#describeRetrieval()'s own return
        // value is null in the first case (no retrieval was ever
        // attempted for this view) and a specific sentence in the
        // second, so this function never has to duplicate that logic,
        // only choose between it and the plain "available locally"
        // default.
        function availabilityText(entry) {
            if (!entry.view) return null;
            if (entry.view.outcome === PublicationResolutionOutcome.RESOLVED) {
                return describeRetrieval(entry.view)
                    || "Available locally. The content matching this publication's cryptographic hash is stored on this device.";
            }
            if (entry.view.outcome === PublicationResolutionOutcome.CONTENT_UNAVAILABLE) {
                return describeRetrieval(entry.view)
                    || 'Unavailable locally. The publication is known, but its referenced content is not currently available on this device.';
            }
            return null;
        }

        let unsubscribeReceived = null;
        let unsubscribeContent = null;
        onMounted(async () => {
            loading.value = true;
            await refreshList();
            loading.value = false;
            unsubscribeReceived = publicationPeerExchange
                ? publicationPeerExchange.onPublicationReceived(() => refreshList())
                : null;
            // A newly retrieved hash may belong to more than one
            // cataloged entry (independent publishers pointing at
            // identical bytes — see application/
            // LocalPublicationCatalog.js#findByContentHash()'s own
            // header) — re-check every entry naming that hash, never
            // just the one that happened to trigger the request.
            unsubscribeContent = publicationPeerContentExchange
                ? publicationPeerContentExchange.onContentReceived(({ hash }) => {
                    for (const entry of entries) {
                        if (entry.publication.contentReference.hash === hash) {
                            resolveEntry(entry);
                        }
                    }
                })
                : null;
        });
        onBeforeUnmount(() => {
            if (unsubscribeReceived) unsubscribeReceived();
            if (unsubscribeContent) unsubscribeContent();
        });

        return {
            entries, loading, retrievalPeers,
            humanizeContentKind, shortId, formatWhen, badgeClass, statusLabel, availabilityText,
            canRetrieve, retrieve, recheck,
            describeKnownEvidenceCount, toggleEvidence, verifyAnchor, evidenceBadgeClass
        };
    },
    template: `
        <section class="publications-view">
            <h1>Publications</h1>
            <p class="form-hint form-hint--neutral">
                Every signed publication this device has cataloged — its own, or one a connected peer
                announced (see <router-link to="/peers">Peers</router-link>). Status is always checked fresh,
                never remembered from last time: cataloging a publication only ever means this device has SEEN
                a validly signed locator, never that its content is sitting here right now.
            </p>
            <p v-if="retrievalPeers.length === 0" class="form-hint form-hint--neutral">
                No authenticated peer is connected right now — "Retrieve from Peers" below will do nothing
                until one is. Connect to a peer first from <router-link to="/peers">Peers</router-link>.
            </p>

            <p v-if="loading" class="locations-panel-empty">Checking cataloged publications…</p>
            <p v-else-if="entries.length === 0" class="locations-panel-empty">
                Nothing cataloged yet. Publish a signed attribution or naming claim, or connect to a peer who
                has one, and it will show up here.
            </p>

            <div v-else class="identity-mgmt-list">
                <div v-for="entry in entries" :key="entry.publication.id" class="identity-mgmt-card">
                    <div class="identity-mgmt-card-header">
                        <span class="identity-mgmt-name">{{ humanizeContentKind(entry.publication.contentKind) }}</span>
                        <span class="peer-badge" :class="badgeClass(entry)">{{ statusLabel(entry) }}</span>
                    </div>
                    <p class="identity-mgmt-status">
                        Published by {{ shortId(entry.publication.publisherIdentity && entry.publication.publisherIdentity.id) }}
                        · received {{ formatWhen(entry.receivedAt) }}
                    </p>
                    <p v-if="entry.view && entry.view.contentSummary" class="form-hint form-hint--neutral">
                        {{ entry.view.contentSummary }}
                    </p>
                    <p v-if="availabilityText(entry)" class="form-hint form-hint--neutral">
                        {{ availabilityText(entry) }}
                    </p>
                    <p v-else-if="entry.view && entry.view.reason" class="form-hint form-hint--neutral">
                        {{ entry.view.reason }}
                    </p>
                    <p v-if="canRetrieve(entry) && retrievalPeers.length > 0" class="form-hint form-hint--neutral">
                        {{ retrievalPeers.length }} connected peer{{ retrievalPeers.length === 1 ? '' : 's' }} may have this content.
                    </p>

                    <div class="identity-mgmt-actions">
                        <button v-if="canRetrieve(entry)" class="action-btn action-btn--secondary"
                                :disabled="entry.retrieving || retrievalPeers.length === 0" @click="retrieve(entry)">
                            {{ entry.retrieving ? 'Asking peers…' : 'Retrieve from Peers' }}
                        </button>
                        <button class="action-btn action-btn--secondary" :disabled="entry.checking" @click="recheck(entry)">
                            {{ entry.checking ? 'Checking…' : 'Re-check' }}
                        </button>
                    </div>

                    <div v-if="entry.evidence && entry.evidence.count > 0" class="evidence-section">
                        <div class="evidence-summary">
                            <span class="evidence-summary-title">External Evidence</span>
                            <span class="form-hint form-hint--neutral">{{ describeKnownEvidenceCount(entry.evidence) }}</span>
                            <button class="action-btn action-btn--secondary" @click="toggleEvidence(entry)">
                                {{ entry.evidenceExpanded ? 'Hide Evidence' : 'Show Evidence' }}
                            </button>
                        </div>
                        <div v-if="entry.evidenceExpanded" class="evidence-list">
                            <div v-for="anchorView in entry.evidence.anchors" :key="anchorView.anchorId" class="evidence-anchor-card">
                                <div class="evidence-anchor-header">
                                    <span class="evidence-anchor-type">{{ humanizeContentKind(anchorView.anchorType) }}</span>
                                    <span class="peer-badge" :class="evidenceBadgeClass(anchorView)">{{ anchorView.verificationLabel }}</span>
                                </div>
                                <p v-if="anchorView.verificationReason" class="form-hint form-hint--neutral">
                                    {{ anchorView.verificationReason }}
                                </p>
                                <dl class="evidence-fields">
                                    <div class="evidence-field"><dt>Locator</dt><dd>{{ anchorView.locator }}</dd></div>
                                    <div class="evidence-field"><dt>Recorded</dt><dd>{{ formatWhen(anchorView.anchoredAt) }}</dd></div>
                                    <div class="evidence-field"><dt>Publication</dt><dd>{{ anchorView.publicationId }}</dd></div>
                                    <div class="evidence-field"><dt>Content hash</dt><dd>{{ anchorView.contentHash }}</dd></div>
                                    <div v-if="anchorView.anchorIdentityId" class="evidence-field">
                                        <dt>Attested by</dt><dd>{{ shortId(anchorView.anchorIdentityId) }}</dd>
                                    </div>
                                </dl>
                                <div class="identity-mgmt-actions">
                                    <button class="action-btn action-btn--secondary" :disabled="anchorView.checking"
                                            @click="verifyAnchor(entry, anchorView)">
                                        {{ anchorView.checking ? 'Verifying…' : (anchorView.verified ? 'Verify Again' : 'Verify Evidence') }}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    `
};
