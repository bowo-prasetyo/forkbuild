import { reactive, ref, computed, onMounted, onBeforeUnmount, inject } from 'vue';
import { PeerLifecycleState } from '../../peer/PeerLifecycleState.js';
import { PublicationResolutionOutcome } from '../../application/PublicationResolutionOutcome.js';
import { resolvePublicationView, describePublicationOutcome, describeRetrieval } from '../../application/PublicationResolutionView.js';

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

export default {
    name: 'DecentralizedPublicationsView',
    setup() {
        const catalog = inject('publicationCatalog');
        const coordinator = inject('publicationResolutionCoordinator');
        const kindPlugins = inject('publicationDisplayKindPlugins');
        const publicationPeerExchange = inject('publicationPeerExchange');
        const publicationPeerContentExchange = inject('publicationPeerContentExchange');
        const peerSessionManager = inject('peerSessionManager');

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
                retrieving: false
            })));
            await Promise.all(entries.filter((entry) => !entry.view && !entry.checking).map(resolveEntry));
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
            canRetrieve, retrieve, recheck
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
                </div>
            </div>
        </section>
    `
};
