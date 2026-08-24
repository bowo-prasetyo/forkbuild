import { reactive, ref, computed, onMounted, onBeforeUnmount, inject } from 'vue';
import { PeerLifecycleState } from '../../peer/PeerLifecycleState.js';
import { PublicationResolutionOutcome } from '../../application/PublicationResolutionOutcome.js';
import { resolvePublicationView, describePublicationOutcome } from '../../application/PublicationResolutionView.js';

// 0.7.5 — Decentralized Publication UX & Resolution.
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
// "Retrieve from Connected Peer" is this milestone's own, deliberately
// narrow answer to "who do I ask?" — application/
// PublicationPeerExchange.js has never tracked which peer announced
// which publication (peer identity is informational only, by design;
// see that class's own header), so there is no natural "ask whoever
// told you about this" target to offer. This page asks the FIRST
// currently AUTHENTICATED peer in application/PeerSessionManager.js's
// own registry — a single, explicit, named default policy living here,
// in the UI layer, never inside application/
// PublicationResolutionCoordinator.js itself (see that class's own
// header on why `peer` is always a required, caller-supplied argument).
// Choosing AMONG several connected peers, or trying more than one, is
// exactly the "multi-source retrieval... fallback... racing" docs/
// Roadmap.md's own 0.7.4 entry already named and sized as a future
// milestone (0.7.6) — this page deliberately does not build that early.
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

        const retrievalPeer = computed(() => peerSessionManager.listPeers()
            .find((peer) => peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED) || null);

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
            const peer = retrievalPeer.value;
            if (!peer) {
                return;
            }
            entry.retrieving = true;
            try {
                entry.view = await resolvePublicationView(entry.publication, { coordinator, kindPlugins, peer });
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
            entries, loading, retrievalPeer,
            humanizeContentKind, shortId, formatWhen, badgeClass, statusLabel,
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
            <p v-if="!retrievalPeer" class="form-hint form-hint--neutral">
                No authenticated peer is connected right now — "Retrieve from Connected Peer" below will do
                nothing until one is. Connect to a peer first from <router-link to="/peers">Peers</router-link>.
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
                    <p v-else-if="entry.view && entry.view.reason" class="form-hint form-hint--neutral">
                        {{ entry.view.reason }}
                    </p>

                    <div class="identity-mgmt-actions">
                        <button v-if="canRetrieve(entry)" class="action-btn action-btn--secondary"
                                :disabled="entry.retrieving || !retrievalPeer" @click="retrieve(entry)">
                            {{ entry.retrieving ? 'Asking peer…' : 'Retrieve from Connected Peer' }}
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
