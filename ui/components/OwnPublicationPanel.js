// 0.9.140 — Own Publication Distribution Entry Point.
//
// 0.9.104/0.9.138 each gave WorldEncounterCanvas a "Distribute
// Publication"/"Distribute Snapshot" action — both reachable only
// through `selectedEncounter`, which itself only ever exists for a
// PUBLICATION marker a World Encounter actually surfaced. That chain —
// peer/marker present -> encounter selectable -> distribution reachable
// — makes distributing YOUR OWN material accidentally depend on World
// Encounters having something to show at all. A solo user with zero
// connected peers and an empty World Encounters panel could publish a
// World and would still have no on-screen way to distribute its
// Snapshot, even though nothing about Snapshot distribution actually
// requires a peer, a marker, or a selection — see `application/
// SnapshotDistributionCommand.js`'s own header, "no coupling to...
// World Encounters."
//
//   World View's own activeDocumentInfo / current World
//                │
//                ▼
//   session.getPublicationForDocument(activeId)   (0.9.140, WorldNavigationSession.js)
//                │
//                ▼
//   `publication` prop   ★ (THIS component's only input fact)
//                │
//                │ click "Distribute Snapshot"
//                ▼
//   distributeOwnSnapshot()
//                │
//                ▼
//   snapshotDistributionCommand(publication)   (injected — the SAME
//                                                app-wide command
//                                                WorldEncounterCanvas's
//                                                own "Distribute
//                                                Snapshot" action
//                                                already calls)
//                │
//                ▼
//   Promise<{ contentReference, announcement }>  (or a rejection)
//                │
//                ▼
//   this panel's own result display
//
// NO NEW COMMAND, NO NEW BYTES-RESOLUTION MECHANISM, NO NEW PROTOCOL.
// `snapshotDistributionCommand` is the exact same `(publication) ->
// Promise<{ contentReference, announcement }>` function
// `ui/views/WorldView.js`'s own `distributeWorldEncounterSnapshot()`
// already is — this component never imports `application/
// SnapshotDistributionCommand.js`, `application/
// SnapshotDistributionRuntimeComposition.js`, `content/
// ArweaveContentStore.js`, or `application/
// NostrSnapshotDiscoveryPublisher.js`, and never constructs an Arweave
// or Nostr client of its own. `distributeWorldEncounterSnapshot()`
// itself already reads its bytes from `publicationCatalogContentResolver`
// — the local origin of "which bytes" — so this component supplies
// nothing but which `Publication` to ask for, exactly the way
// WorldEncounterCanvas's own `distributablePublication` already does.
//
// NEVER A PEER, A MARKER, OR A SELECTION. `publication` is supplied by
// the host view from its own already-current `activeDocumentInfo`/
// active document — never derived from `WorldDiscoverySourceRegistry`,
// a `WorldEncounter`, or anything World Encounters itself produces.
// This is the entire point of this milestone: the local user's own
// Snapshot distribution stays reachable with zero connected peers and
// an empty World Encounters panel.
//
// NEVER FOLDED INTO WorldEncounterCanvas. Distributing your own current
// Snapshot and distributing a Snapshot you discovered/selected in World
// Encounters are two different actions over two different sources of
// "which Publication" — see this milestone's own design note, "World
// Encounters is a peer/publication discovery surface; Snapshot
// Distribution is an action on the user's own material." Folding this
// into WorldEncounterCanvas (or making the local user appear as a fake
// encounter) would re-blur exactly the line this milestone exists to
// draw. `WorldEncounterCanvas.js` is untouched by this milestone.
//
// EPHEMERAL UI STATE ONLY, DUPLICATE- AND STALE-RESPONSE PROTECTED —
// MIRRORING WorldEncounterCanvas's OWN `snapshotDistributionExecuting`/
// `snapshotDistributionError`/`snapshotDistributionResult`/
// `snapshotDistributionRequestId` EXACTLY, one surface over. This
// component holds its own copy of that same ephemeral shape rather than
// sharing WorldEncounterCanvas's — the two actions distribute different
// Publications and must never share (or clobber) one another's
// in-flight/result state. A change of `publication` (a different
// document became active, or the active document went from unpublished
// to published) resets all four fields exactly the way a fresh
// `selectedEncounter` already resets WorldEncounterCanvas's own.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A lifecycle store, persistence, or restoration of any kind.**
//   Mirrors WorldEncounterCanvas's own identical exclusion for this
//   family (0.9.138), one surface over.
// - **Retry, cancel, progress percentage, distribution history, or any
//   distribution-configuration UI.**
// - **A "Distribute Signed Claim" action, or merging this panel with
//   the Signed Claim distribution family.** Snapshot and Signed Claim
//   distribution stay two separate protocols (see `application/
//   SnapshotDistributionCommand.js`'s own header); this milestone adds
//   an entry point for the Snapshot family alone.
// - **Any change to which Publication is "active."** This component
//   never decides that itself — it only ever renders whatever
//   `publication` prop it was handed.
export default {
    name: 'OwnPublicationPanel',
    props: {
        // The local user's own current Publication (`publisher/
        // Publication.js`), or `null` when the currently active document
        // has never been published. Supplied by the host view — this
        // component never resolves it itself.
        publication: {
            type: Object,
            default: null
        },
        // `(publication) -> Promise<{ contentReference, announcement }>`,
        // or `null` when the capability is unavailable — the identical
        // shape/default `WorldEncounterCanvas`'s own
        // `snapshotDistributionCommand` prop already uses.
        snapshotDistributionCommand: {
            type: Function,
            default: null
        }
    },
    data() {
        return {
            snapshotDistributionExecuting: false,
            snapshotDistributionError: null,
            snapshotDistributionResult: null,
            snapshotDistributionRequestId: 0
        };
    },
    watch: {
        // A different Publication (or none at all) becoming current
        // means any prior in-flight call, error, or result belongs to a
        // Publication that is no longer this panel's own — mirrors
        // WorldEncounterCanvas's own reset-on-fresh-selection exactly.
        publication(next, prev) {
            const nextId = next ? next.id : null;
            const prevId = prev ? prev.id : null;
            if (nextId === prevId) {
                return;
            }
            this.snapshotDistributionExecuting = false;
            this.snapshotDistributionError = null;
            this.snapshotDistributionResult = null;
            this.snapshotDistributionRequestId += 1;
        }
    },
    beforeUnmount() {
        // Invalidates any still-in-flight call, mirroring
        // WorldEncounterCanvas's own `beforeUnmount()` invalidation of
        // `snapshotDistributionRequestId`.
        this.snapshotDistributionRequestId += 1;
    },
    methods: {
        // The only writer of `snapshotDistributionExecuting`/
        // `snapshotDistributionError`/`snapshotDistributionResult`, and
        // the only caller of `snapshotDistributionCommand` in this file
        // — mirrors WorldEncounterCanvas's own `distributeSelectedSnapshot()`
        // exactly. A no-op whenever there is no `publication`, no
        // `snapshotDistributionCommand`, or a call is already in flight.
        distributeOwnSnapshot() {
            const publication = this.publication;
            if (!publication || !this.snapshotDistributionCommand || this.snapshotDistributionExecuting) {
                return;
            }

            this.snapshotDistributionExecuting = true;
            this.snapshotDistributionError = null;
            this.snapshotDistributionRequestId += 1;
            const requestId = this.snapshotDistributionRequestId;

            Promise.resolve()
                .then(() => this.snapshotDistributionCommand(publication))
                .then((result) => {
                    if (requestId === this.snapshotDistributionRequestId) {
                        this.snapshotDistributionResult = result;
                    }
                })
                .catch(() => {
                    if (requestId === this.snapshotDistributionRequestId) {
                        this.snapshotDistributionError = 'Snapshot distribution could not be completed.';
                    }
                })
                .then(() => {
                    if (requestId === this.snapshotDistributionRequestId) {
                        this.snapshotDistributionExecuting = false;
                    }
                });
        }
    },
    template: `
        <div v-if="snapshotDistributionCommand" class="own-publication-panel">
            <h4 class="own-publication-panel-title">My Publication</h4>

            <dl v-if="publication" class="own-publication-detail">
                <dt>Title</dt>
                <dd>{{ publication.title || 'Untitled' }}</dd>
                <dt>Author</dt>
                <dd>{{ publication.author || 'anonymous' }}</dd>
            </dl>
            <p v-else class="own-publication-empty-hint">
                Publish your current World to distribute its Snapshot.
            </p>

            <!-- Reachable with zero connected peers and an empty World
                 Encounters panel — this action never depends on either.
                 Disabled whenever there is no local Publication yet, or
                 a call is already in flight. -->
            <button
                type="button"
                class="action-btn own-publication-distribution-action"
                :disabled="!publication || snapshotDistributionExecuting"
                @click="distributeOwnSnapshot"
            >{{ snapshotDistributionExecuting ? 'Distributing…' : 'Distribute Snapshot' }}</button>

            <p v-if="snapshotDistributionError" class="own-publication-distribution-error">{{ snapshotDistributionError }}</p>
            <dl v-else-if="snapshotDistributionResult" class="own-publication-distribution-detail">
                <dt>Content hash</dt>
                <dd>{{ snapshotDistributionResult.contentReference.hash }}</dd>
                <dt>Locator</dt>
                <dd>{{ snapshotDistributionResult.contentReference.uri }}</dd>
                <dt>Announcement</dt>
                <dd>{{ snapshotDistributionResult.announcement ? snapshotDistributionResult.announcement.id : 'No announcement' }}</dd>
            </dl>
        </div>
    `
};
