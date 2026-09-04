import { resolveSnapshotPublicationAttribution } from '../../application/SnapshotPublicationAttribution.js';

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
//
// 0.9.142 — World View Snapshot Discovery Command.
//
// Adds a second, independent action to this SAME "even with zero peers"
// surface — "Discover Snapshot" — reaching the exact seam this
// milestone's own header names: `discoverSnapshotCommand`, injected the
// identical way `snapshotDistributionCommand` already is, a `(publication)
// -> Promise<{ outcome, bytes, candidates, locator, storage, reason }>`
// function bound (by `ui/views/WorldView.js`) to a `discoverOwnSnapshot()`
// wrapper that turns "which publication" into "which contentHash" —
// `publication.contentReference.hash` — exactly the way
// `distributeWorldEncounterSnapshot()` already turns "which publication"
// into "which bytes." This component never reads `contentReference`
// itself; it forwards the whole `publication` object to the injected
// command, unread, the identical restraint `distributeOwnSnapshot()`
// already holds for `snapshotDistributionCommand`.
//
// DISCOVERY, NEVER ATTRIBUTION. The result this panel renders is
// `application/DecentralizedSnapshotResolver.js`'s own
// `DecentralizedSnapshotResolutionOutcome` vocabulary (RESOLVED,
// NOT_DISCOVERED, STORE_UNAVAILABLE, CONTENT_UNAVAILABLE,
// CONTENT_HASH_MISMATCH), rendered VERBATIM — this file introduces no
// MATCHED/ATTRIBUTED/OWNED/TRUSTED/AUTHENTIC vocabulary of its own, and
// never compares the resolved Snapshot's own hash against
// `publication.contentReference.hash` itself (a resolve() call already
// only ever resolves for that exact `contentHash` — see `application/
// DiscoverSnapshotCommand.js`'s own header, "contentHash is always an
// explicit, caller-supplied input"). Comparing a verified Snapshot
// against a Publication is a separate, later, unscheduled seam (see
// docs/Roadmap.md's own 0.9.142 entry, "0.9.143 — Snapshot Attribution").
//
// A SEPARATE EPHEMERAL STATE, NEVER SHARED WITH DISTRIBUTION'S OWN.
// `snapshotDiscoveryExecuting`/`snapshotDiscoveryError`/
// `snapshotDiscoveryResult`/`snapshotDiscoveryRequestId` mirror
// `snapshotDistributionExecuting`/`snapshotDistributionError`/
// `snapshotDistributionResult`/`snapshotDistributionRequestId` exactly,
// one action over — the two actions distribute/discover independently
// and must never clobber one another's in-flight/result state. Reset on
// the identical `publication` change the distribution fields already
// reset on.
// 0.9.144 — World View Snapshot Attribution Integration.
//
// 0.9.142 gave this panel "Discover Snapshot"; 0.9.143 built
// `application/SnapshotPublicationAttribution.js#resolveSnapshotPublicationAttribution()`
// — the pure Q3 comparison — and stopped deliberately short of any UI
// wiring (see that file's own header, "a UI badge or any composition-root
// wiring... not this milestone"). This is that wiring, and nothing more:
//
//   discoverOwnSnapshot()  (unchanged, 0.9.142)
//           │
//           ▼
//   snapshotDiscoveryResult   (unchanged, 0.9.142's own field)
//           │
//           ▼
//   resolveSnapshotPublicationAttribution(publication, snapshotDiscoveryResult)
//           │
//           ▼
//   snapshotAttributionResult   ★ (THIS milestone's own new field)
//
// A SEPARATE FIELD, NEVER A REPLACEMENT OF `snapshotDiscoveryResult`. The
// two stay independently readable — "Snapshot Discovery: RESOLVED" and
// "Snapshot Attribution: MATCH" are two different facts about two
// different questions (see `application/SnapshotPublicationAttribution.js`'s
// own header, Q2 vs Q3), never collapsed into one combined status.
//
// THIS FILE CALLS `resolveSnapshotPublicationAttribution()` — A PURE, NO-I/O
// FUNCTION — DIRECTLY, RATHER THAN THROUGH AN INJECTED COMMAND PROP. Unlike
// `discoverSnapshotCommand`/`snapshotDistributionCommand` (both real I/O,
// composed by `ui/main.js`), attribution needs no collaborator to inject —
// it is the identical restraint every other pure `application/` describer
// this codebase's UI layer already imports directly (e.g. `application/
// WorldEncounterSelectionOutcome.js`, one surface over). This component
// still never hashes bytes, compares hashes, or interprets a resolution
// outcome itself — `resolveSnapshotPublicationAttribution()` does all of
// that; this file only calls it and renders what comes back, verbatim.
//
// COMPUTED IMMEDIATELY AFTER A SUCCESSFUL DISCOVERY, NEVER ON A SEPARATE
// CLICK. Attribution has no I/O of its own and nothing further to ask the
// user for — `publication` and `snapshotDiscoveryResult` are already both
// in hand the instant discovery resolves, so `discoverOwnSnapshot()` (below)
// computes both in the same `.then()`, under the same `requestId` guard. A
// resolution failure (`NOT_DISCOVERED`/`STORE_UNAVAILABLE`/
// `CONTENT_UNAVAILABLE`/`CONTENT_HASH_MISMATCH`) still produces a
// `snapshotAttributionResult` — `resolveSnapshotPublicationAttribution()`
// passes that same failure outcome through unchanged rather than reporting
// `NO_MATCH` — see that file's own header, "a resolution failure is never
// reported as no_match."
//
// RESET EXACTLY WHERE `snapshotDiscoveryResult` ALREADY IS. A changed
// Publication (the `publication` watcher, below) and a stale in-flight
// response (the existing `snapshotDiscoveryRequestId` guard) invalidate
// `snapshotAttributionResult` the identical way they already invalidate
// `snapshotDiscoveryResult` — this milestone adds no second reset
// mechanism of its own.
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
        },
        // 0.9.142 — optional. A `(publication) -> Promise<{ outcome,
        // bytes, candidates, locator, storage, reason }>` function, or
        // `null` when the capability is unavailable — see this file's
        // own header, "0.9.142 — World View Snapshot Discovery Command."
        discoverSnapshotCommand: {
            type: Function,
            default: null
        }
    },
    data() {
        return {
            snapshotDistributionExecuting: false,
            snapshotDistributionError: null,
            snapshotDistributionResult: null,
            snapshotDistributionRequestId: 0,
            snapshotDiscoveryExecuting: false,
            snapshotDiscoveryError: null,
            snapshotDiscoveryResult: null,
            snapshotDiscoveryRequestId: 0,
            // 0.9.144 — see this file's own header, "a separate field,
            // never a replacement of snapshotDiscoveryResult." `null` until
            // a discovery call resolves; never written by anything but
            // `discoverOwnSnapshot()`, below.
            snapshotAttributionResult: null
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
            this.snapshotDiscoveryExecuting = false;
            this.snapshotDiscoveryError = null;
            this.snapshotDiscoveryResult = null;
            this.snapshotDiscoveryRequestId += 1;
            // 0.9.144 — a different (or cleared) Publication invalidates
            // any prior attribution verdict the same way it already
            // invalidates the discovery result it was computed from.
            this.snapshotAttributionResult = null;
        }
    },
    beforeUnmount() {
        // Invalidates any still-in-flight call, mirroring
        // WorldEncounterCanvas's own `beforeUnmount()` invalidation of
        // `snapshotDistributionRequestId`.
        this.snapshotDistributionRequestId += 1;
        this.snapshotDiscoveryRequestId += 1;
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
        },
        // 0.9.142 — the only writer of `snapshotDiscoveryExecuting`/
        // `snapshotDiscoveryError`/`snapshotDiscoveryResult`, and the
        // only caller of `discoverSnapshotCommand` in this file — mirrors
        // `distributeOwnSnapshot()` exactly, one action over. A no-op
        // whenever there is no `publication`, no `discoverSnapshotCommand`,
        // or a call is already in flight.
        discoverOwnSnapshot() {
            const publication = this.publication;
            if (!publication || !this.discoverSnapshotCommand || this.snapshotDiscoveryExecuting) {
                return;
            }

            this.snapshotDiscoveryExecuting = true;
            this.snapshotDiscoveryError = null;
            this.snapshotDiscoveryRequestId += 1;
            const requestId = this.snapshotDiscoveryRequestId;

            Promise.resolve()
                .then(() => this.discoverSnapshotCommand(publication))
                .then((result) => {
                    if (requestId === this.snapshotDiscoveryRequestId) {
                        this.snapshotDiscoveryResult = result;
                        // 0.9.144 — the one call site of
                        // resolveSnapshotPublicationAttribution() in this
                        // file. Computed immediately, under the same
                        // requestId guard as snapshotDiscoveryResult itself
                        // — see this file's own header, "computed
                        // immediately after a successful discovery, never
                        // on a separate click."
                        this.snapshotAttributionResult = resolveSnapshotPublicationAttribution(publication, result);
                    }
                })
                .catch(() => {
                    if (requestId === this.snapshotDiscoveryRequestId) {
                        this.snapshotDiscoveryError = 'Snapshot discovery could not be completed.';
                    }
                })
                .then(() => {
                    if (requestId === this.snapshotDiscoveryRequestId) {
                        this.snapshotDiscoveryExecuting = false;
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

            <!-- 0.9.142 — reachable with zero connected peers and an
                 empty World Encounters panel, exactly like Distribute
                 Snapshot above. Rendered only when a caller supplied a
                 discoverSnapshotCommand. Disabled whenever there is no
                 local Publication yet, the Publication has never been
                 placed (no contentReference), or a call is already in
                 flight. -->
            <button
                v-if="discoverSnapshotCommand"
                type="button"
                class="action-btn own-publication-discovery-action"
                :disabled="!publication || !publication.contentReference || snapshotDiscoveryExecuting"
                @click="discoverOwnSnapshot"
            >{{ snapshotDiscoveryExecuting ? 'Discovering…' : 'Discover Snapshot' }}</button>

            <!-- The resolver's own DecentralizedSnapshotResolutionOutcome
                 vocabulary, rendered verbatim — see this file's own
                 header, "discovery, never attribution." -->
            <p v-if="snapshotDiscoveryError" class="own-publication-discovery-error">{{ snapshotDiscoveryError }}</p>
            <dl v-else-if="snapshotDiscoveryResult" class="own-publication-discovery-detail">
                <dt>Outcome</dt>
                <dd>{{ snapshotDiscoveryResult.outcome }}</dd>
                <template v-if="snapshotDiscoveryResult.reason">
                    <dt>Reason</dt>
                    <dd>{{ snapshotDiscoveryResult.reason }}</dd>
                </template>
                <template v-if="snapshotDiscoveryResult.locator">
                    <dt>Locator</dt>
                    <dd>{{ snapshotDiscoveryResult.locator }}</dd>
                </template>
            </dl>

            <!-- 0.9.144 — a separate result, below Snapshot Discovery's own,
                 never merged into it — see this file's own header, "a
                 separate field, never a replacement," and application/
                 SnapshotPublicationAttribution.js's own header for what
                 MATCH does and does not mean. -->
            <dl v-if="snapshotAttributionResult" class="own-publication-attribution-detail">
                <dt>Snapshot Attribution</dt>
                <dd>{{ snapshotAttributionResult.outcome }}</dd>
            </dl>
        </div>
    `
};
