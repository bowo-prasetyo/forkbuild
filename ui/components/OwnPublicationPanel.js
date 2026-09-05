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
//
// 0.9.151 — World View Snapshot Candidate Browser.
//
// 0.9.150's own `application/DiscoverSnapshotCandidatesCommand.js`
// answers a genuinely different question than `discoverSnapshotCommand`
// above — "what has been announced under this discoveryTag, at all?"
// (browsing-oriented discovery) rather than "can THIS ONE, already-known
// contentHash be retrieved and verified?" (attribution-oriented
// resolution, unchanged, above) — see that file's own header for the
// full ATTRIBUTION-ORIENTED-RESOLUTION-vs-BROWSING-ORIENTED-DISCOVERY
// distinction. This is that command's UI wiring:
//
//   click "Discover Snapshots"
//           │
//           ▼
//   discoverSnapshotCandidates()
//           │
//           ▼
//   discoverSnapshotCandidatesCommand()   (injected — the SAME app-wide
//                                           command ui/main.js composes,
//                                           reusing the SAME
//                                           NostrSnapshotDiscoveryQueryService
//                                           instance `discoverSnapshotCommand`
//                                           already wraps in a resolver)
//           │
//           ▼
//   snapshotCandidateDiscoveryResult = [ { contentHash, locator,
//                                           storage }, ... ]   (rendered
//                                           VERBATIM, in the exact order
//                                           received — no sort, no
//                                           dedup, no ranking; see
//                                           `application/
//                                           DiscoverSnapshotCandidatesCommand.js`'s
//                                           own header, "relay arrival
//                                           order is an observed fact,
//                                           not a ranking decision")
//           │
//           │ click one candidate row
//           ▼
//   selectedSnapshotCandidate = candidate   (boring: a plain assignment,
//                                             nothing else — see below)
//
// A COMPLETELY INDEPENDENT REQUEST FROM `discoverSnapshotCommand`'S OWN,
// NEEDING NO `publication` AT ALL. `discoverSnapshotCommand`/
// `discoverOwnSnapshot()` answer "does THIS Publication's own
// contentHash resolve?" and therefore need `publication.contentReference.hash`
// as an explicit input. `discoverSnapshotCandidatesCommand()` answers
// "what exists under the shared campaign discoveryTag, period?" — a
// question with no Publication-shaped input at all (the `discoveryTag`
// itself is already baked in by `ui/main.js`'s own composition, the
// identical restraint already held for `discoverSnapshotCommand`'s own
// `discoveryTag`). This component calls it with zero arguments.
//
// A SEPARATE EPHEMERAL STATE, NEVER SHARED WITH DISCOVERY'S OR
// DISTRIBUTION'S OWN — `snapshotCandidateDiscoveryExecuting`/
// `snapshotCandidateDiscoveryError`/`snapshotCandidateDiscoveryResult`/
// `snapshotCandidateDiscoveryRequestId` mirror
// `snapshotDiscoveryExecuting`/`snapshotDiscoveryError`/
// `snapshotDiscoveryResult`/`snapshotDiscoveryRequestId` exactly, one
// operation over — never reused, because the two answer different
// questions: `snapshotDiscoveryResult` means "this requested content was
// resolved," `snapshotCandidateDiscoveryResult` means "these candidates
// were announced." Reset on the identical `publication` change the other
// two families' fields already reset on, and invalidated by the
// identical stale-request-id guard — not because browsing depends on
// "which Publication" (it does not), but because a Publication change is
// this panel's own existing signal that its prior in-flight/displayed
// state no longer belongs to the current view, held here for the
// identical lifecycle-safety reason, one surface over.
//
// SELECTION IS DELIBERATELY BORING — A PLAIN ASSIGNMENT, NOTHING ELSE.
// `selectSnapshotCandidate(candidate)` only ever sets
// `selectedSnapshotCandidate`. It never calls `discoverSnapshotCommand`,
// never triggers retrieval/verification/attribution, and never mutates
// `snapshotCandidateDiscoveryResult` itself — "I found this candidate" and
// "I asked the system to retrieve and verify it" stay two separate,
// explicit steps. Resolving a selected candidate is a deliberately
// unscheduled, later milestone (see docs/Roadmap.md's own 0.9.151 entry).
//
// NO DERIVED METADATA, NO RANKING, NO PREFERENCE OF ANY KIND. This
// component never labels a candidate "best"/"trusted"/"recommended"/
// "fastest"/"official," never sorts by `storage`, and never deduplicates
// candidates sharing a `contentHash` — every candidate
// `discoveryQueryService.search()` itself returned is rendered, in the
// exact order it arrived. `storage` (`ar`/`ipfs`/...) is displayed as an
// observed property, never as an implied preference between candidates.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE (0.9.151).
// - **Ranking, deduplication, filtering by contentHash, grouping, or
//   provider preference among displayed candidates.**
// - **Caching discovered candidates across discovery calls, or
//   persisting a selection.** Each click re-runs the full command;
//   `selectedSnapshotCandidate` is ephemeral component state, exactly
//   like every other field in this file.
//
// 0.9.152 — Selected Snapshot Candidate Resolution.
//
// 0.9.151 stopped deliberately short of resolving `selectedSnapshotCandidate`
// — "selecting a candidate" and "resolving that candidate" stayed two
// separate, explicit steps. This wires the second step, reaching the
// narrow seam `application/DecentralizedSnapshotResolver.js`'s own 0.9.152
// addition names: `resolveCandidate(candidate)`, resolving EXACTLY the
// candidate handed in — never re-discovered, never re-selected, and never
// swapped for whichever candidate `resolve(candidate.contentHash)` might
// pick instead (see that file's own header for why the two are not
// interchangeable when several candidates can share one contentHash).
//
//   selectedSnapshotCandidate   (0.9.151, unchanged — set only by
//                                 selectSnapshotCandidate(), below)
//           │
//           │ click "Resolve Selected Snapshot"
//           ▼
//   resolveSelectedSnapshot()
//           │
//           ▼
//   resolveSelectedSnapshotCommand(selectedSnapshotCandidate)   (injected
//                                           — the SAME app-wide command
//                                           ui/main.js composes, reusing
//                                           the SAME resolver/content
//                                           store discoverSnapshotCommand
//                                           already wraps)
//           │
//           ▼
//   selectedSnapshotResolutionResult = { outcome, bytes, candidates,
//                                         locator, storage, reason }
//        (application/DecentralizedSnapshotResolutionOutcome.js's own
//        vocabulary, rendered VERBATIM — resolution, never attribution;
//        see this file's own header, "discovery, never attribution," the
//        identical restraint held one operation over)
//
// THIS COMPONENT NEVER CALLS `resolveSelectedSnapshotCommand` WITH
// ANYTHING BUT THE CANDIDATE OBJECT ITSELF. It never reads
// `selectedSnapshotCandidate.contentHash` and hands that bare string to
// `discoverSnapshotCommand`/`resolveSelectedSnapshotCommand` instead —
// doing so would silently let the resolver re-select a DIFFERENT
// candidate sharing that same contentHash, discarding the user's own
// choice. See `application/ResolveSelectedSnapshotCommand.js`'s own
// header for the identical restraint one layer down.
//
// A SEPARATE EPHEMERAL STATE, NEVER SHARED WITH ANY OTHER FAMILY IN THIS
// FILE — `selectedSnapshotResolutionExecuting`/
// `selectedSnapshotResolutionError`/`selectedSnapshotResolutionResult`/
// `selectedSnapshotResolutionRequestId` mirror
// `snapshotCandidateDiscoveryExecuting`/.../`snapshotCandidateDiscoveryRequestId`
// exactly, one operation over. "These candidates were announced," "this
// one was selected," and "this is what happened when the selected one
// was resolved" stay three independently-readable facts, never collapsed.
// Reset on the identical `publication` change every other family in this
// file already resets on.
//
// SELECTING A DIFFERENT CANDIDATE INVALIDATES ANY PRIOR RESOLUTION —
// `selectSnapshotCandidate()` (below) now also resets
// `selectedSnapshotResolutionExecuting`/.../`selectedSnapshotResolutionRequestId`
// whenever the selection actually changes. A resolution result describes
// what happened when ONE SPECIFIC candidate was retrieved/verified;
// leaving a stale result on screen after the user selects a DIFFERENT
// candidate would misrepresent it as describing the new selection.
// Selection itself is still a plain assignment with no I/O of its own —
// only a PRIOR resolution's now-stale result is cleared, never a new one
// computed.
//
// NO AUTOMATIC ATTRIBUTION. A successful resolution never triggers
// `resolveSnapshotPublicationAttribution()` itself — that comparison
// stays scoped to `discoverOwnSnapshot()`'s own already-known-contentHash
// question (see this file's own header, "0.9.144"). Whether a
// browsed-and-resolved Snapshot corresponds to the current Publication is
// a separate, later, unscheduled question this milestone does not answer.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Automatic resolution when a candidate is discovered or selected.**
//   Resolution stays an explicit, separate click — see "selecting a
//   different candidate invalidates any prior resolution," above.
// - **Snapshot–Publication attribution of any kind over the resolved
//   result.** See "no automatic attribution," above.
// - **Retry, caching, or persistence of a resolution result.**
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
        },
        // 0.9.151 — optional. A `() -> Promise<[{ contentHash, locator,
        // storage }, ...]>` function, or `null` when the capability is
        // unavailable — see this file's own header, "0.9.151 — World
        // View Snapshot Candidate Browser." Unlike `discoverSnapshotCommand`,
        // this function takes no argument — it is not "which Publication."
        discoverSnapshotCandidatesCommand: {
            type: Function,
            default: null
        },
        // 0.9.152 — optional. A `(candidate) -> Promise<{ outcome, bytes,
        // candidates, locator, storage, reason }>` function, or `null`
        // when the capability is unavailable — see this file's own
        // header, "0.9.152 — Selected Snapshot Candidate Resolution."
        // Takes the SELECTED CANDIDATE OBJECT itself, never a bare
        // contentHash — see that header for why the two are not
        // interchangeable.
        resolveSelectedSnapshotCommand: {
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
            snapshotAttributionResult: null,
            // 0.9.151 — see this file's own header, "a separate ephemeral
            // state, never shared with discovery's or distribution's own."
            snapshotCandidateDiscoveryExecuting: false,
            snapshotCandidateDiscoveryError: null,
            // `null` until a candidate discovery call resolves; `[]` is a
            // legitimate, distinct result (zero candidates announced), not
            // an error — see `discoverSnapshotCandidates()`, below.
            snapshotCandidateDiscoveryResult: null,
            snapshotCandidateDiscoveryRequestId: 0,
            // `null` until the user clicks a candidate row — see this
            // file's own header, "selection is deliberately boring."
            selectedSnapshotCandidate: null,
            // 0.9.152 — see this file's own header, "a separate ephemeral
            // state, never shared with any other family in this file."
            selectedSnapshotResolutionExecuting: false,
            selectedSnapshotResolutionError: null,
            // `null` until a selected-candidate resolution call resolves;
            // never written by anything but `resolveSelectedSnapshot()`,
            // below.
            selectedSnapshotResolutionResult: null,
            selectedSnapshotResolutionRequestId: 0
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
            // 0.9.151 — reset for the identical lifecycle-safety reason,
            // one operation over — see this file's own header, "a
            // separate ephemeral state... reset on the identical
            // publication change."
            this.snapshotCandidateDiscoveryExecuting = false;
            this.snapshotCandidateDiscoveryError = null;
            this.snapshotCandidateDiscoveryResult = null;
            this.snapshotCandidateDiscoveryRequestId += 1;
            this.selectedSnapshotCandidate = null;
            // 0.9.152 — reset for the identical lifecycle-safety reason,
            // one operation over — see this file's own header, "a
            // separate ephemeral state... reset on the identical
            // publication change."
            this.selectedSnapshotResolutionExecuting = false;
            this.selectedSnapshotResolutionError = null;
            this.selectedSnapshotResolutionResult = null;
            this.selectedSnapshotResolutionRequestId += 1;
        }
    },
    beforeUnmount() {
        // Invalidates any still-in-flight call, mirroring
        // WorldEncounterCanvas's own `beforeUnmount()` invalidation of
        // `snapshotDistributionRequestId`.
        this.snapshotDistributionRequestId += 1;
        this.snapshotDiscoveryRequestId += 1;
        this.snapshotCandidateDiscoveryRequestId += 1;
        this.selectedSnapshotResolutionRequestId += 1;
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
        },
        // 0.9.151 — the only writer of `snapshotCandidateDiscoveryExecuting`/
        // `snapshotCandidateDiscoveryError`/`snapshotCandidateDiscoveryResult`,
        // and the only caller of `discoverSnapshotCandidatesCommand` in
        // this file — mirrors `discoverOwnSnapshot()`'s own guard/requestId
        // pattern exactly, one operation over. Unlike `discoverOwnSnapshot()`,
        // this method needs no `publication` at all — see this file's own
        // header, "a completely independent request... needing no
        // publication at all." A no-op whenever there is no
        // `discoverSnapshotCandidatesCommand`, or a call is already in
        // flight.
        discoverSnapshotCandidates() {
            if (!this.discoverSnapshotCandidatesCommand || this.snapshotCandidateDiscoveryExecuting) {
                return;
            }

            this.snapshotCandidateDiscoveryExecuting = true;
            this.snapshotCandidateDiscoveryError = null;
            this.snapshotCandidateDiscoveryRequestId += 1;
            const requestId = this.snapshotCandidateDiscoveryRequestId;

            Promise.resolve()
                .then(() => this.discoverSnapshotCandidatesCommand())
                .then((result) => {
                    if (requestId === this.snapshotCandidateDiscoveryRequestId) {
                        // Rendered verbatim, in this exact order — see
                        // this file's own header, "no derived metadata,
                        // no ranking, no preference of any kind."
                        this.snapshotCandidateDiscoveryResult = result;
                    }
                })
                .catch(() => {
                    if (requestId === this.snapshotCandidateDiscoveryRequestId) {
                        this.snapshotCandidateDiscoveryError = 'Snapshot candidate discovery could not be completed.';
                    }
                })
                .then(() => {
                    if (requestId === this.snapshotCandidateDiscoveryRequestId) {
                        this.snapshotCandidateDiscoveryExecuting = false;
                    }
                });
        },
        // 0.9.151 — the only writer of `selectedSnapshotCandidate`. See
        // this file's own header, "selection is deliberately boring": a
        // plain assignment, nothing else — never a call to
        // `discoverSnapshotCommand`, and never a mutation of
        // `snapshotCandidateDiscoveryResult` itself.
        //
        // 0.9.152 — also the only place a PRIOR selected-candidate
        // resolution result is invalidated: when the selection actually
        // changes, any `selectedSnapshotResolutionResult` computed for
        // the OLD selection no longer describes the new one — see this
        // file's own header, "selecting a different candidate invalidates
        // any prior resolution." Still no I/O of its own: nothing here
        // calls `resolveSelectedSnapshotCommand`.
        selectSnapshotCandidate(candidate) {
            if (candidate === this.selectedSnapshotCandidate) {
                return;
            }
            this.selectedSnapshotCandidate = candidate;
            this.selectedSnapshotResolutionExecuting = false;
            this.selectedSnapshotResolutionError = null;
            this.selectedSnapshotResolutionResult = null;
            this.selectedSnapshotResolutionRequestId += 1;
        },
        // 0.9.152 — the only writer of `selectedSnapshotResolutionExecuting`/
        // `selectedSnapshotResolutionError`/`selectedSnapshotResolutionResult`,
        // and the only caller of `resolveSelectedSnapshotCommand` in this
        // file — mirrors `discoverSnapshotCandidates()`'s own guard/
        // requestId pattern exactly, one operation over. A no-op whenever
        // there is no `selectedSnapshotCandidate`, no
        // `resolveSelectedSnapshotCommand`, or a call is already in
        // flight. Calls `resolveSelectedSnapshotCommand` with the
        // SELECTED CANDIDATE OBJECT itself — never its bare `contentHash`
        // — see this file's own header, "this component never calls
        // resolveSelectedSnapshotCommand with anything but the candidate
        // object itself."
        resolveSelectedSnapshot() {
            const candidate = this.selectedSnapshotCandidate;
            if (!candidate || !this.resolveSelectedSnapshotCommand || this.selectedSnapshotResolutionExecuting) {
                return;
            }

            this.selectedSnapshotResolutionExecuting = true;
            this.selectedSnapshotResolutionError = null;
            this.selectedSnapshotResolutionRequestId += 1;
            const requestId = this.selectedSnapshotResolutionRequestId;

            Promise.resolve()
                .then(() => this.resolveSelectedSnapshotCommand(candidate))
                .then((result) => {
                    if (requestId === this.selectedSnapshotResolutionRequestId) {
                        this.selectedSnapshotResolutionResult = result;
                    }
                })
                .catch(() => {
                    if (requestId === this.selectedSnapshotResolutionRequestId) {
                        this.selectedSnapshotResolutionError = 'Selected Snapshot resolution could not be completed.';
                    }
                })
                .then(() => {
                    if (requestId === this.selectedSnapshotResolutionRequestId) {
                        this.selectedSnapshotResolutionExecuting = false;
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
                 flight.

                 0.9.151 — RENAMED from "Discover Snapshot" to "Check
                 Snapshot Match": this action always answered "does THIS
                 Publication's own contentHash resolve?" (attribution-
                 oriented resolution), which "Discover Snapshot" no
                 longer describes unambiguously now that "Discover
                 Snapshots" (below) exists for the OTHER, browsing-
                 oriented question. Behavior, method name
                 (discoverOwnSnapshot), and every other field this action
                 writes are unchanged — only this button's own label. -->
            <button
                v-if="discoverSnapshotCommand"
                type="button"
                class="action-btn own-publication-discovery-action"
                :disabled="!publication || !publication.contentReference || snapshotDiscoveryExecuting"
                @click="discoverOwnSnapshot"
            >{{ snapshotDiscoveryExecuting ? 'Checking…' : 'Check Snapshot Match' }}</button>

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

            <!-- 0.9.151 — World View Snapshot Candidate Browser. A
                 genuinely different operation from Check Snapshot Match
                 above — see this file's own header. Reachable with zero
                 connected peers, zero World Encounters, AND no local
                 Publication at all: browsing what has been announced
                 under the shared campaign discoveryTag never depends on
                 "which Publication," so this button is disabled only
                 while a call is already in flight. Rendered only when a
                 caller supplied a discoverSnapshotCandidatesCommand. -->
            <button
                v-if="discoverSnapshotCandidatesCommand"
                type="button"
                class="action-btn own-publication-candidate-discovery-action"
                :disabled="snapshotCandidateDiscoveryExecuting"
                @click="discoverSnapshotCandidates"
            >{{ snapshotCandidateDiscoveryExecuting ? 'Discovering…' : 'Discover Snapshots' }}</button>

            <p v-if="snapshotCandidateDiscoveryError" class="own-publication-candidate-discovery-error">{{ snapshotCandidateDiscoveryError }}</p>

            <!-- An empty array is a legitimate, distinct result (zero
                 candidates announced) — never treated as an error, and
                 never collapsed into the "not yet run" (null) state. See
                 this file's own header, "no derived metadata, no
                 ranking, no preference of any kind" — every candidate is
                 rendered, in the exact order discovered, with no sort,
                 dedup, "best"/"trusted" label, or storage-type
                 preference of any kind. -->
            <div v-else-if="snapshotCandidateDiscoveryResult" class="own-publication-candidate-list">
                <h5 class="own-publication-candidate-list-title">Discovered Snapshots</h5>
                <p v-if="snapshotCandidateDiscoveryResult.length === 0" class="own-publication-candidate-list-empty">
                    No Snapshots have been announced under this discoveryTag yet.
                </p>
                <ul v-else class="own-publication-candidate-list-items">
                    <li
                        v-for="(candidate, index) in snapshotCandidateDiscoveryResult"
                        :key="index"
                        class="own-publication-candidate-item"
                        :class="{ 'own-publication-candidate-item-selected': candidate === selectedSnapshotCandidate }"
                        @click="selectSnapshotCandidate(candidate)"
                    >
                        <dl class="own-publication-candidate-detail">
                            <dt>Storage</dt>
                            <dd>{{ candidate.storage }}</dd>
                            <dt>Content hash</dt>
                            <dd>{{ candidate.contentHash }}</dd>
                            <dt>Locator</dt>
                            <dd>{{ candidate.locator }}</dd>
                        </dl>
                    </li>
                </ul>
            </div>

            <!-- 0.9.152 — Selected Snapshot Candidate Resolution. Reachable
                 only once a candidate has actually been selected above —
                 resolving "nothing selected" makes no sense. Rendered only
                 when a caller supplied a resolveSelectedSnapshotCommand.
                 Disabled whenever there is no selection, or a call is
                 already in flight. -->
            <button
                v-if="resolveSelectedSnapshotCommand"
                type="button"
                class="action-btn own-publication-selected-resolution-action"
                :disabled="!selectedSnapshotCandidate || selectedSnapshotResolutionExecuting"
                @click="resolveSelectedSnapshot"
            >{{ selectedSnapshotResolutionExecuting ? 'Resolving…' : 'Resolve Selected Snapshot' }}</button>

            <!-- The resolver's own DecentralizedSnapshotResolutionOutcome
                 vocabulary, rendered verbatim — see this file's own
                 header, "no automatic attribution": this is a separate
                 result from snapshotDiscoveryResult/snapshotAttributionResult
                 above, describing what happened when the SELECTED
                 candidate (never the Publication) was retrieved/verified. -->
            <p v-if="selectedSnapshotResolutionError" class="own-publication-selected-resolution-error">{{ selectedSnapshotResolutionError }}</p>
            <dl v-else-if="selectedSnapshotResolutionResult" class="own-publication-selected-resolution-detail">
                <dt>Selected Snapshot Resolution</dt>
                <dd>{{ selectedSnapshotResolutionResult.outcome }}</dd>
                <template v-if="selectedSnapshotResolutionResult.reason">
                    <dt>Reason</dt>
                    <dd>{{ selectedSnapshotResolutionResult.reason }}</dd>
                </template>
                <template v-if="selectedSnapshotResolutionResult.locator">
                    <dt>Locator</dt>
                    <dd>{{ selectedSnapshotResolutionResult.locator }}</dd>
                </template>
            </dl>
        </div>
    `
};
