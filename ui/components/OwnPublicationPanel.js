import { resolveSnapshotPublicationAttribution } from '../../application/SnapshotPublicationAttribution.js';
import { resolveSnapshotWorldPlacement } from '../../application/SnapshotWorldPlacement.js';
import { registerMaterializedSnapshotWorldSource } from '../../application/MaterializedSnapshotWorldDiscoveryBridge.js';

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
//   result.** See "no automatic attribution," above. (0.9.154, below,
//   fills this gap — still never automatic.)
// - **Retry, caching, or persistence of a resolution result.**
//
// 0.9.154 — Selected Snapshot Attribution.
//
// 0.9.152 resolved `selectedSnapshotCandidate` into verified bytes;
// 0.9.153's own Section E proved, end to end, that resolution alone never
// attributes. This fills exactly that named gap:
//
//   selectedSnapshotResolutionResult   (0.9.152, unchanged — the
//                                        RESOLVER's own already-verified
//                                        result, never the candidate's
//                                        own self-declared metadata)
//           │
//           │ click "Attribute Selected Snapshot"
//           ▼
//   attributeSelectedSnapshot()
//           │
//           ▼
//   resolveSnapshotPublicationAttribution(publication, selectedSnapshotResolutionResult)
//           (application/SnapshotPublicationAttribution.js, 0.9.143,
//           UNMODIFIED — the SAME pure comparison discoverOwnSnapshot()
//           already calls; no second attribution implementation)
//           │
//           ▼
//   selectedSnapshotAttributionResult   ★ (THIS milestone's own new field)
//
// REUSES THE EXISTING PURE FUNCTION DIRECTLY, EXACTLY THE WAY
// `discoverOwnSnapshot()`'s OWN 0.9.144 ADDITION ALREADY DOES. No new
// application command was introduced — `resolveSnapshotPublicationAttribution()`
// takes no I/O and needs no collaborator to inject; this component still
// never hashes bytes or interprets a resolution outcome itself.
//
// COMPARES AGAINST THE RESOLVER'S OWN VERIFIED RESULT, NEVER THE
// CANDIDATE'S OWN DECLARED contentHash — the critical invariant this
// milestone exists to hold. `attributeSelectedSnapshot()` reads
// `this.selectedSnapshotResolutionResult` (bytes that already passed
// `resolveCandidate()`'s own hash verification), never
// `this.selectedSnapshotCandidate.contentHash`. Two different candidates
// can share one self-declared contentHash while one of them fails
// verification (CONTENT_HASH_MISMATCH) — see `application/
// SnapshotPublicationAttribution.js`'s own header, "attribution requires
// an already-verified snapshot." A `selectedSnapshotResolutionResult`
// that never reached RESOLVED still produces a well-defined attribution
// value: `resolveSnapshotPublicationAttribution()` passes that same
// resolution-failure outcome through unchanged rather than ever reporting
// NO_MATCH for it.
//
// EXPLICIT, NEVER AUTOMATIC. Unlike `discoverOwnSnapshot()`'s own 0.9.144
// wiring (attribution computed inline, in the same `.then()`, because
// discovery already answers a fixed, already-known contentHash),
// attribution over a BROWSED-AND-SELECTED candidate is deliberately its
// own explicit click — selecting a candidate never attributes it, and
// resolving a candidate never attributes it either. Only this button
// does.
//
// A SEPARATE FIELD, NEVER `snapshotAttributionResult`. That field remains
// `discoverOwnSnapshot()`'s own, for the already-known-contentHash path;
// `selectedSnapshotAttributionResult` is this, genuinely independent,
// path's own — the two paths converge on the identical comparison
// function while keeping fully separate UI state, per this milestone's
// own two-path design.
//
// NO EXECUTING/ERROR STATE OF ITS OWN — `resolveSnapshotPublicationAttribution()`
// performs no I/O and never throws for the inputs this button ever hands
// it (the button stays disabled until both a `publication` with a
// `contentReference` and a `selectedSnapshotResolutionResult` exist), so
// there is nothing to await and no rejection to catch — the identical
// restraint `discoverOwnSnapshot()`'s own 0.9.144 addition already holds
// for its single, synchronous call site.
//
// STALE ATTRIBUTION IS CLEARED WHENEVER THE RESULT IT WAS COMPUTED FROM
// BECOMES STALE, NEVER RECOMPUTED AUTOMATICALLY. Selecting a DIFFERENT
// candidate (`selectSnapshotCandidate()`) and re-resolving the CURRENT
// selection (`resolveSelectedSnapshot()`) both already invalidate
// `selectedSnapshotResolutionResult`; `selectedSnapshotAttributionResult`
// is cleared at those same two sites, and by the same Publication-change
// watcher every other field in this family already resets on — never
// silently left on screen describing a resolution result that no longer
// exists.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A new application command (e.g. `ResolveSelectedSnapshotAttributionCommand`).**
//   The existing pure function is reused directly — see "reuses the
//   existing pure function directly," above.
// - **Automatic attribution immediately after selection or resolution.**
// - **Ranking, candidate recommendation, trust scores, "best snapshot,"
//   provider reputation, ownership/authenticity claims.**
// - **Persistence, caching, or retry of an attribution result.**
// - **Any new resolution or attribution outcome vocabulary.** Only
//   `SnapshotPublicationAttributionOutcome`'s own pre-existing MATCH/
//   NO_MATCH, plus `DecentralizedSnapshotResolutionOutcome`'s own
//   pre-existing failure values passed through unchanged, are ever
//   produced.
//
// 0.9.158 — Selected Snapshot Materialization.
//
// 0.9.152 through 0.9.157 proved DISCOVER -> SELECT -> RESOLVE -> VERIFY ->
// ATTRIBUTE complete and correct, entirely in memory: a verified
// Snapshot's own bytes live only inside `selectedSnapshotResolutionResult`,
// gone the moment the Publication changes or this component unmounts.
// Nothing built so far ever turns "verified" into "possessed" — the exact
// gap `application/MaterializeSnapshotFromPlacementUseCase.js` (0.8.35)
// and `application/MaterializeSnapshotFromPeerUseCase.js` (0.8.37) already
// closed for their own explicit sources. This fills the identical gap for
// a browsed-and-selected, Nostr-discovered candidate:
//
//   selectedSnapshotResolutionResult   (0.9.152, unchanged — the
//                                        RESOLVER's own already-verified
//                                        result)
//           │
//           │ click "Materialize Selected Snapshot"
//           ▼
//   materializeSelectedSnapshot()
//           │
//           ▼
//   materializeSelectedSnapshotCommand(selectedSnapshotResolutionResult)
//           (application/MaterializeSelectedSnapshotCommand.js, 0.9.158 —
//           injected, mirroring resolveSelectedSnapshotCommand exactly)
//           │
//           ▼
//   selectedSnapshotMaterializationResult   ★ (THIS milestone's own new field)
//
// AN INDEPENDENT SIBLING OF "ATTRIBUTE SELECTED SNAPSHOT," NEVER A SEQUEL
// TO IT. Both `materializeSelectedSnapshot()` and `attributeSelectedSnapshot()`
// read the SAME `selectedSnapshotResolutionResult`, but neither depends on
// the other having run, and clicking one never triggers the other —
// materialization answers "can this replica now retrieve these bytes
// locally," attribution answers "does this correspond to the current
// Publication," and a person may want either answer, both, or neither. See
// `application/MaterializeSnapshotFromSelectedCandidateUseCase.js`'s own
// header for why materialization never touches attribution, a placement,
// or a World position.
//
// CONSUMES THE RESOLUTION RESULT, NEVER THE CANDIDATE — identical
// restraint to `attributeSelectedSnapshot()`'s own "compares against the
// resolver's own verified result," one sibling over.
// `materializeSelectedSnapshot()` reads `this.selectedSnapshotResolutionResult`,
// never `this.selectedSnapshotCandidate`. A candidate that was merely
// SELECTED, never resolved, has no bytes to materialize at all.
//
// STALE MATERIALIZATION IS CLEARED WHEREVER THE RESOLUTION RESULT IT
// DEPENDS ON ALREADY IS — the identical rule `selectedSnapshotAttributionResult`
// already holds, one sibling over: `selectSnapshotCandidate()` (a
// different selection), `resolveSelectedSnapshot()` (a fresh resolution
// attempt), and the Publication-change watcher all clear
// `selectedSnapshotMaterializationResult` at the same sites they already
// clear `selectedSnapshotAttributionResult`.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Automatic materialization immediately after selection, resolution,
//   or attribution.** Only this button does.
// - **World placement, spatial position, or rendering of the materialized
//   Snapshot.** See docs/Roadmap.md's own 0.9.158 section — a separate,
//   later, unscheduled seam over this one's own output.
// - **Ranking, candidate recommendation, trust scores, "best snapshot,"
//   provider reputation, ownership/authenticity claims.**
// - **Persistence, caching, or retry of a materialization result.**
// - **Any new resolution outcome vocabulary.** Only application/
//   SnapshotCandidateMaterializationOutcome.js's own three new values,
//   plus `DecentralizedSnapshotResolutionOutcome`'s own pre-existing
//   failure values passed through unchanged, are ever produced.
//
// 0.9.159 — Selected Snapshot World Placement.
//
// 0.9.158 closed the gap between VERIFIED and POSSESSED, but deliberately
// answered nothing about WHERE a materialized Snapshot belongs in the
// World — see its own header, "World placement, spatial position, or
// rendering of the materialized Snapshot... a separate, later, unscheduled
// seam over this one's own output." This milestone is that seam:
//
//   selectedSnapshotMaterializationResult   (0.9.158, unchanged)
//                │
//                │  click "Place Materialized Snapshot"
//                ▼
//   placeMaterializedSnapshot()   (THIS FILE, NEW)
//                │
//                ▼
//   resolveSnapshotWorldPlacement(materialization, placementInfo)
//     (application/SnapshotWorldPlacement.js, NEW — a PURE function, no
//     collaborator to inject, exactly like the Snapshot attribution
//     comparison above)
//                │
//                ▼
//   selectedSnapshotWorldPlacementResult   (NEW field)
//
// `placementInfo` IS A NEW, PLAIN DATA PROP — NEVER AN INJECTED COMMAND.
// Unlike `discoverSnapshotCommand`/`resolveSelectedSnapshotCommand`/
// `materializeSelectedSnapshotCommand`, this milestone introduces no new
// capability function at all: `resolveSnapshotWorldPlacement()` is pure, so
// there is nothing to compose or inject. `placementInfo` is instead the
// SAME `WorldNavigationSession#getPlacementInfo()`-shaped read the host
// view already computes for its own Placement Info panel (`activePlacementInfo`
// in ui/views/WorldView.js) — handed to this component exactly like
// `publication` already is, and read by `placeMaterializedSnapshot()`
// exactly the way `attributeSelectedSnapshot()` already reads `this.publication`
// for its own separate comparison. This component never queries a
// PlacementRegistry, a spatial index, or any World position itself.
//
// AN INDEPENDENT SIBLING OF "MATERIALIZE SELECTED SNAPSHOT" AND "ATTRIBUTE
// SELECTED SNAPSHOT," NEVER AN AUTOMATIC CONSEQUENCE OF EITHER. Clicking
// "Materialize Selected Snapshot" never places anything; clicking "Place
// Materialized Snapshot" never re-materializes or re-attributes anything.
// A successfully materialized Snapshot does not automatically acquire a
// World position — only this separate, explicit click computes one.
//
// SYNCHRONOUS — NO EXECUTING/ERROR STATE OF ITS OWN, mirroring
// `attributeSelectedSnapshot()`'s own restraint one sibling over:
// `resolveSnapshotWorldPlacement()` performs no I/O, so there is nothing to
// await and nothing that can reject.
//
// STALE PLACEMENT IS CLEARED WHEREVER THE MATERIALIZATION RESULT IT DEPENDS
// ON ALREADY IS — the identical rule `selectedSnapshotAttributionResult`
// already holds one layer under `selectedSnapshotResolutionResult`, applied
// here one layer under `selectedSnapshotMaterializationResult`:
// `selectSnapshotCandidate()`, `resolveSelectedSnapshot()`, a fresh
// `materializeSelectedSnapshot()` attempt, and the Publication-change
// watcher all clear `selectedSnapshotWorldPlacementResult` at the same
// sites they already clear `selectedSnapshotMaterializationResult`.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Looking up, creating, or moving a WorldPlacement of any kind.** This
//   component only ever reads whatever `placementInfo` the host view
//   already computed — see application/SnapshotWorldPlacement.js's own
//   header, "never rediscovers."
// - **Rendering the materialized Snapshot anywhere.** World View stays an
//   observer of world material — this milestone produces a placement FACT,
//   nothing more.
// - **Automatic placement immediately after materialization.** Only this
//   button does.
// - **Any new resolution/materialization outcome vocabulary.** Only
//   application/SnapshotWorldPlacementOutcome.js's own two new values, plus
//   whatever outcome `selectedSnapshotMaterializationResult` itself already
//   carries, passed through unchanged, are ever produced.
//
// 0.9.160 — Selected Snapshot World Runtime Registration.
//
// 0.9.159 produced a placement FACT that lived only inside this
// component's own ephemeral state — nothing yet made it observable to the
// running World. This milestone is that seam:
//
//   selectedSnapshotWorldPlacementResult   (0.9.159, unchanged)
//                │
//                │  click "Register Placed Snapshot"
//                ▼
//   registerMaterializedSnapshot()   (THIS FILE, NEW)
//                │
//                ▼
//   registerMaterializedSnapshotWorldSource(worldDiscoverySourceRegistry,
//     placement, publication)   (application/
//     MaterializedSnapshotWorldDiscoveryBridge.js, NEW — mutates the SAME
//     app-wide WorldDiscoverySourceRegistry a connected peer's own World
//     contribution already registers into, under its own dedicated
//     origin; see that file's own header for why this is not a new World-
//     state authority)
//                │
//                ▼
//   selectedSnapshotWorldRegistrationResult   (NEW field)
//
// `worldDiscoverySourceRegistry` IS A NEW, PLAIN COLLABORATOR PROP —
// NEVER AN INJECTED COMMAND. Exactly like `placementInfo` (0.9.159), this
// is the SAME app-wide `WorldDiscoverySourceRegistry` instance
// `ui/views/WorldView.js` already injects and hands to `WorldEncounterCanvas`
// as its own `registry` prop — handed to this component the identical way,
// so registering a Snapshot here mutates the EXACT registry
// `WorldEncounterCanvas` is already subscribed to, never a second,
// disconnected instance.
//
// AN INDEPENDENT SIBLING OF "PLACE MATERIALIZED SNAPSHOT," NEVER AN
// AUTOMATIC CONSEQUENCE OF IT. A successfully PLACED Snapshot does not
// automatically register itself with the World runtime — only this
// separate, explicit click does, the identical restraint 0.9.159's own
// header already holds one sibling under ("a successfully materialized
// Snapshot does not automatically acquire a World position").
//
// SYNCHRONOUS — NO EXECUTING/ERROR STATE OF ITS OWN, mirroring
// `placeMaterializedSnapshot()`'s own restraint one sibling over:
// `registerMaterializedSnapshotWorldSource()` performs no I/O — it mutates
// a plain, in-memory collaborator synchronously.
//
// STALE REGISTRATION IS CLEARED WHEREVER THE PLACEMENT RESULT IT DEPENDS
// ON ALREADY IS, PLUS ONE ADDITIONAL SITE: `selectSnapshotCandidate()`, a
// fresh `resolveSelectedSnapshot()`/`materializeSelectedSnapshot()`
// attempt, and the Publication-change watcher all clear
// `selectedSnapshotWorldRegistrationResult` at the same sites they already
// clear `selectedSnapshotWorldPlacementResult` — and `placeMaterializedSnapshot()`
// itself now ALSO clears it immediately before computing a fresh placement
// result, since a stale registration described the PRIOR placement result,
// about to be replaced.
//
// CLEARING THE UI'S OWN DISPLAYED RESULT NEVER UNREGISTERS ANYTHING FROM
// THE RUNTIME REGISTRY ITSELF. See application/
// MaterializedSnapshotWorldDiscoveryBridge.js's own header, "Deliberately
// excluded... automatically unregistering a Snapshot when the interaction
// state that produced it goes stale." `selectedSnapshotWorldRegistrationResult`
// resetting to `null` describes only this component's own ephemeral
// "what did the last click report" state — the registered
// `WorldDiscoverySource` itself, if one was ever created, remains in the
// registry until something explicitly removes it.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Populating the registry's `'local'` origin, or any general local-
//   publication discovery.** See application/
//   MaterializedSnapshotWorldDiscoveryBridge.js's own header.
// - **Unregistering a Snapshot, automatically or via any button this
//   milestone adds.** The bridge file exports an unregister function; no
//   UI in this file calls it.
// - **Rendering the registered Snapshot anywhere, or any visibility/
//   viewport concern.** World View's existing `WorldEncounterCanvas`
//   observes the registry entirely unmodified by this milestone.
// - **Any new resolution/materialization/placement outcome vocabulary.**
//   Only application/SnapshotWorldRegistrationOutcome.js's own one new
//   value, plus whatever outcome `selectedSnapshotWorldPlacementResult`
//   itself already carries, passed through unchanged, are ever produced.
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
        },
        // 0.9.158 — optional. A `(resolution) -> Promise<{ outcome,
        // contentHash, contentReference, reason, source }>` function, or
        // `null` when the capability is unavailable — see this file's own
        // header, "0.9.158 — Selected Snapshot Materialization." Takes the
        // ALREADY-COMPUTED `selectedSnapshotResolutionResult` itself,
        // never the selected candidate object and never a bare
        // contentHash — see that header for why materialization must
        // consume an already-verified resolution result.
        materializeSelectedSnapshotCommand: {
            type: Function,
            default: null
        },
        // 0.9.159 — optional. `WorldNavigationSession#getPlacementInfo()`'s
        // own already-computed `{ placementId, publicationId, position:
        // {x,y,z}, rotation, revision, owner, movable, overlapCount }`, or
        // `null` when the active document's own Publication has never been
        // placed anywhere in the World — see this file's own header,
        // "0.9.159 — Selected Snapshot World Placement." A plain DATA prop,
        // never an injected command — this component never queries a
        // PlacementRegistry or spatial index itself.
        placementInfo: {
            type: Object,
            default: null
        },
        // 0.9.160 — optional. The SAME app-wide `application/
        // WorldDiscoverySourceRegistry.js` (0.9.9) instance
        // `ui/views/WorldView.js` already injects and hands to
        // `WorldEncounterCanvas` as its own `registry` prop — see this
        // file's own header, "0.9.160 — Selected Snapshot World Runtime
        // Registration." A plain collaborator prop, never a command
        // function — this component calls its `setSource()` method
        // directly, through `registerMaterializedSnapshotWorldSource()`,
        // rather than being handed a pre-composed capability.
        worldDiscoverySourceRegistry: {
            type: Object,
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
            selectedSnapshotResolutionRequestId: 0,
            // 0.9.154 — see this file's own header, "a separate field,
            // never snapshotAttributionResult." `null` until
            // attributeSelectedSnapshot() is explicitly clicked; never
            // written by anything else.
            selectedSnapshotAttributionResult: null,
            // 0.9.158 — see this file's own header, "0.9.158 — Selected
            // Snapshot Materialization." A separate ephemeral family, never
            // shared with `selectedSnapshotAttributionResult`'s own —
            // materialization and attribution are two independent siblings
            // over the SAME `selectedSnapshotResolutionResult`, never a
            // sequence. `null` until materializeSelectedSnapshot() is
            // explicitly clicked; never written by anything else.
            selectedSnapshotMaterializationExecuting: false,
            selectedSnapshotMaterializationError: null,
            selectedSnapshotMaterializationResult: null,
            selectedSnapshotMaterializationRequestId: 0,
            // 0.9.159 — see this file's own header, "0.9.159 — Selected
            // Snapshot World Placement." A separate ephemeral field, never
            // shared with `selectedSnapshotAttributionResult`'s own — an
            // independent sibling of both attribution and materialization,
            // never a sequel to either. `null` until placeMaterializedSnapshot()
            // is explicitly clicked; never written by anything else. No
            // executing/error state of its own — see this file's own
            // header, "synchronous."
            selectedSnapshotWorldPlacementResult: null,
            // 0.9.160 — see this file's own header, "0.9.160 — Selected
            // Snapshot World Runtime Registration." A separate ephemeral
            // field, never shared with `selectedSnapshotWorldPlacementResult`
            // itself — an independent sibling, never a sequel. `null`
            // until registerMaterializedSnapshot() is explicitly clicked;
            // never written by anything else. No executing/error state of
            // its own — see this file's own header, "synchronous."
            selectedSnapshotWorldRegistrationResult: null
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
            // 0.9.154 — a different (or cleared) Publication invalidates
            // any prior selected-candidate attribution verdict the same
            // way it already invalidates the resolution result it was
            // computed from.
            this.selectedSnapshotAttributionResult = null;
            // 0.9.158 — a different (or cleared) Publication invalidates
            // any prior selected-candidate materialization result the
            // identical way it already invalidates the resolution result
            // it was computed from — see this file's own header, "a
            // separate ephemeral family."
            this.selectedSnapshotMaterializationExecuting = false;
            this.selectedSnapshotMaterializationError = null;
            this.selectedSnapshotMaterializationResult = null;
            this.selectedSnapshotMaterializationRequestId += 1;
            // 0.9.159 — a different (or cleared) Publication invalidates
            // any prior selected-candidate World Placement result the
            // identical way it already invalidates the materialization
            // result it was computed from.
            this.selectedSnapshotWorldPlacementResult = null;
            // 0.9.160 — the identical staleness rule, one sibling over: a
            // prior World Runtime Registration result described the OLD
            // placement result it was computed from.
            this.selectedSnapshotWorldRegistrationResult = null;
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
        this.selectedSnapshotMaterializationRequestId += 1;
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
            // 0.9.154 — a prior attribution verdict described the OLD
            // selection's own resolution result; it no longer describes
            // anything once that resolution result itself is cleared
            // above. See this file's own header, "stale attribution is
            // cleared whenever the result it was computed from becomes
            // stale."
            this.selectedSnapshotAttributionResult = null;
            // 0.9.158 — the identical staleness rule, one sibling over: a
            // prior materialization result described the OLD selection's
            // own resolution result too.
            this.selectedSnapshotMaterializationExecuting = false;
            this.selectedSnapshotMaterializationError = null;
            this.selectedSnapshotMaterializationResult = null;
            this.selectedSnapshotMaterializationRequestId += 1;
            // 0.9.159 — the identical staleness rule, one sibling over: a
            // prior World Placement result described the OLD selection's
            // own materialization result too.
            this.selectedSnapshotWorldPlacementResult = null;
            // 0.9.160 — the identical staleness rule, one sibling over: a
            // prior World Runtime Registration result described the OLD
            // selection's own placement result too.
            this.selectedSnapshotWorldRegistrationResult = null;
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
            // 0.9.154 — a fresh resolution attempt for the CURRENT
            // selection is about to replace `selectedSnapshotResolutionResult`;
            // any attribution verdict computed from the PRIOR result no
            // longer describes what will be on screen. See this file's
            // own header, "stale attribution is cleared whenever the
            // result it was computed from becomes stale."
            this.selectedSnapshotAttributionResult = null;
            // 0.9.158 — the identical staleness rule, one sibling over: a
            // prior materialization result was computed from the PRIOR
            // resolution result, about to be replaced.
            this.selectedSnapshotMaterializationExecuting = false;
            this.selectedSnapshotMaterializationError = null;
            this.selectedSnapshotMaterializationResult = null;
            this.selectedSnapshotMaterializationRequestId += 1;
            // 0.9.159 — the identical staleness rule, one sibling over: a
            // prior World Placement result was computed from the PRIOR
            // materialization result, about to be replaced.
            this.selectedSnapshotWorldPlacementResult = null;
            // 0.9.160 — the identical staleness rule, one sibling over: a
            // prior World Runtime Registration result was computed from
            // the PRIOR placement result, about to be replaced.
            this.selectedSnapshotWorldRegistrationResult = null;
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
        },
        // 0.9.154 — the only writer of `selectedSnapshotAttributionResult`,
        // and the only call site of `resolveSnapshotPublicationAttribution()`
        // over the SELECTED-CANDIDATE path in this file (`discoverOwnSnapshot()`
        // holds its own, separate call site for the already-known-contentHash
        // path). A no-op whenever there is no `publication`, no
        // `publication.contentReference` (the pure function itself would
        // throw for either), or no `selectedSnapshotResolutionResult` yet
        // to attribute. Synchronous — no executing/error state, see this
        // file's own header, "no executing/error state of its own." Reads
        // `selectedSnapshotResolutionResult` — the RESOLVER's own verified
        // result — never `selectedSnapshotCandidate.contentHash`, the
        // critical invariant this milestone exists to hold.
        attributeSelectedSnapshot() {
            const publication = this.publication;
            const resolution = this.selectedSnapshotResolutionResult;
            if (!publication || !publication.contentReference || !resolution) {
                return;
            }
            this.selectedSnapshotAttributionResult = resolveSnapshotPublicationAttribution(publication, resolution);
        },
        // 0.9.158 — the only writer of `selectedSnapshotMaterializationExecuting`/
        // `selectedSnapshotMaterializationError`/`selectedSnapshotMaterializationResult`,
        // and the only caller of `materializeSelectedSnapshotCommand` in
        // this file — mirrors `resolveSelectedSnapshot()`'s own guard/
        // requestId pattern exactly, one sibling over. A no-op whenever
        // there is no `selectedSnapshotResolutionResult`, no
        // `materializeSelectedSnapshotCommand`, or a call is already in
        // flight — needs no `publication` at all, unlike
        // `attributeSelectedSnapshot()`, since materialization never
        // touches the Publication (see application/
        // MaterializeSnapshotFromSelectedCandidateUseCase.js's own header,
        // "no publicationId, no publicationKnown"). Calls
        // `materializeSelectedSnapshotCommand` with the RESOLUTION RESULT
        // itself — never `selectedSnapshotCandidate`, and never a bare
        // contentHash — see that use case's own header, "consumes the
        // resolution result, never the candidate."
        materializeSelectedSnapshot() {
            const resolution = this.selectedSnapshotResolutionResult;
            if (!resolution || !this.materializeSelectedSnapshotCommand || this.selectedSnapshotMaterializationExecuting) {
                return;
            }

            this.selectedSnapshotMaterializationExecuting = true;
            this.selectedSnapshotMaterializationError = null;
            this.selectedSnapshotMaterializationRequestId += 1;
            // 0.9.159 — a fresh materialization attempt is about to replace
            // `selectedSnapshotMaterializationResult`; any World Placement
            // result computed from the PRIOR materialization result no
            // longer describes what will be on screen. See this file's own
            // header, "stale placement is cleared wherever the
            // materialization result it depends on already is."
            this.selectedSnapshotWorldPlacementResult = null;
            // 0.9.160 — the identical staleness rule, one sibling over: a
            // prior World Runtime Registration result described the PRIOR
            // placement result, about to be replaced.
            this.selectedSnapshotWorldRegistrationResult = null;
            const requestId = this.selectedSnapshotMaterializationRequestId;

            Promise.resolve()
                .then(() => this.materializeSelectedSnapshotCommand(resolution))
                .then((result) => {
                    if (requestId === this.selectedSnapshotMaterializationRequestId) {
                        this.selectedSnapshotMaterializationResult = result;
                    }
                })
                .catch(() => {
                    if (requestId === this.selectedSnapshotMaterializationRequestId) {
                        this.selectedSnapshotMaterializationError = 'Selected Snapshot materialization could not be completed.';
                    }
                })
                .then(() => {
                    if (requestId === this.selectedSnapshotMaterializationRequestId) {
                        this.selectedSnapshotMaterializationExecuting = false;
                    }
                });
        },
        // 0.9.159 — the only writer of `selectedSnapshotWorldPlacementResult`,
        // and the only call site of `resolveSnapshotWorldPlacement()` in
        // this file — mirrors `attributeSelectedSnapshot()`'s own
        // synchronous, no-executing/error-state shape exactly, one sibling
        // over. A no-op whenever there is no `selectedSnapshotMaterializationResult`
        // yet to place. Needs no `publication` of its own: `placementInfo`
        // (supplied by the host view, already keyed to whichever
        // Publication is active) already carries its own `publicationId` —
        // see this file's own header, "0.9.159 — Selected Snapshot World
        // Placement." `placementInfo` being `null` (never placed yet) is a
        // legitimate input, not a guard condition — `resolveSnapshotWorldPlacement()`
        // itself decides PLACED vs. UNPLACED.
        placeMaterializedSnapshot() {
            const materialization = this.selectedSnapshotMaterializationResult;
            if (!materialization) {
                return;
            }
            // 0.9.160 — a fresh placement result is about to replace
            // `selectedSnapshotWorldPlacementResult`; any World Runtime
            // Registration result computed from the PRIOR placement result
            // no longer describes it.
            this.selectedSnapshotWorldRegistrationResult = null;
            this.selectedSnapshotWorldPlacementResult = resolveSnapshotWorldPlacement(materialization, this.placementInfo);
        },
        // 0.9.160 — the only writer of `selectedSnapshotWorldRegistrationResult`,
        // and the only call site of `registerMaterializedSnapshotWorldSource()`
        // in this file — mirrors `placeMaterializedSnapshot()`'s own
        // synchronous, no-executing/error-state shape exactly, one sibling
        // over. A no-op whenever there is no `selectedSnapshotWorldPlacementResult`
        // yet to register, or no `worldDiscoverySourceRegistry` to register
        // it with. Passes `this.publication` straight through — the SAME
        // Publication object `placementInfo` (and therefore
        // `selectedSnapshotWorldPlacementResult`) was already keyed to —
        // never re-fetched or reconstructed here.
        registerMaterializedSnapshot() {
            const placement = this.selectedSnapshotWorldPlacementResult;
            if (!placement || !this.worldDiscoverySourceRegistry) {
                return;
            }
            this.selectedSnapshotWorldRegistrationResult = registerMaterializedSnapshotWorldSource(this.worldDiscoverySourceRegistry, placement, this.publication);
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

            <!-- 0.9.154 — Selected Snapshot Attribution. Reachable only
                 once the selected candidate has actually been resolved
                 above — attributing "nothing resolved yet" makes no
                 sense. Rendered in the SAME resolveSelectedSnapshotCommand
                 family (attribution over a browsed/selected candidate has
                 no meaning without the resolution capability that
                 produces its input). Disabled whenever there is no
                 Publication, the Publication has never been placed (no
                 contentReference), or there is no
                 selectedSnapshotResolutionResult yet to attribute. -->
            <button
                v-if="resolveSelectedSnapshotCommand"
                type="button"
                class="action-btn own-publication-selected-attribution-action"
                :disabled="!publication || !publication.contentReference || !selectedSnapshotResolutionResult"
                @click="attributeSelectedSnapshot"
            >Attribute Selected Snapshot</button>

            <!-- A separate result from selectedSnapshotResolutionResult
                 above, and from snapshotAttributionResult (the OTHER,
                 already-known-contentHash path) — see this file's own
                 header, "a separate field, never snapshotAttributionResult."
                 Compares the RESOLVER's own verified bytes against this
                 Publication, never the candidate's own self-declared
                 contentHash. -->
            <dl v-if="selectedSnapshotAttributionResult" class="own-publication-selected-attribution-detail">
                <dt>Selected Snapshot Attribution</dt>
                <dd>{{ selectedSnapshotAttributionResult.outcome }}</dd>
                <template v-if="selectedSnapshotAttributionResult.reason">
                    <dt>Reason</dt>
                    <dd>{{ selectedSnapshotAttributionResult.reason }}</dd>
                </template>
            </dl>

            <!-- 0.9.158 — Selected Snapshot Materialization. An independent
                 SIBLING of "Attribute Selected Snapshot" above, not a
                 sequel — both read the SAME selectedSnapshotResolutionResult,
                 but materialization never touches the Publication and
                 attribution never touches local storage. Reachable only
                 once the selected candidate has actually been resolved
                 above — materializing "nothing resolved yet" makes no
                 sense. Rendered only when a caller supplied a
                 materializeSelectedSnapshotCommand. Disabled whenever
                 there is no selectedSnapshotResolutionResult yet, or a
                 call is already in flight. -->
            <button
                v-if="materializeSelectedSnapshotCommand"
                type="button"
                class="action-btn own-publication-selected-materialization-action"
                :disabled="!selectedSnapshotResolutionResult || selectedSnapshotMaterializationExecuting"
                @click="materializeSelectedSnapshot"
            >{{ selectedSnapshotMaterializationExecuting ? 'Materializing…' : 'Materialize Selected Snapshot' }}</button>

            <!-- A separate result from selectedSnapshotResolutionResult/
                 selectedSnapshotAttributionResult above — see this file's
                 own header, "a separate ephemeral family." On a resolution
                 that never reached RESOLVED, this reports the RESOLVER'S
                 OWN failure outcome unchanged (never a materialization-
                 specific catch-all) — see application/
                 MaterializeSnapshotFromSelectedCandidateUseCase.js's own
                 header. -->
            <p v-if="selectedSnapshotMaterializationError" class="own-publication-selected-materialization-error">{{ selectedSnapshotMaterializationError }}</p>
            <dl v-else-if="selectedSnapshotMaterializationResult" class="own-publication-selected-materialization-detail">
                <dt>Selected Snapshot Materialization</dt>
                <dd>{{ selectedSnapshotMaterializationResult.outcome }}</dd>
                <template v-if="selectedSnapshotMaterializationResult.reason">
                    <dt>Reason</dt>
                    <dd>{{ selectedSnapshotMaterializationResult.reason }}</dd>
                </template>
            </dl>

            <!-- 0.9.159 — Selected Snapshot World Placement. An independent
                 SIBLING of "Materialize Selected Snapshot" above, not an
                 automatic consequence of it — see this file's own header,
                 "0.9.159." Reachable in the SAME materializeSelectedSnapshotCommand
                 family (placing a Snapshot that was never even materialized
                 has no meaning). Disabled whenever there is no
                 selectedSnapshotMaterializationResult yet. Synchronous — no
                 "…ing" label, since resolveSnapshotWorldPlacement() performs
                 no I/O. -->
            <button
                v-if="materializeSelectedSnapshotCommand"
                type="button"
                class="action-btn own-publication-selected-world-placement-action"
                :disabled="!selectedSnapshotMaterializationResult"
                @click="placeMaterializedSnapshot"
            >Place Materialized Snapshot</button>

            <!-- A separate result from selectedSnapshotMaterializationResult
                 above — see this file's own header, "an independent sibling
                 ... never a sequel." On a materialization that never
                 reached STORED/ALREADY_AVAILABLE, this reports that SAME
                 failure outcome unchanged (never a placement-specific
                 catch-all) — see application/SnapshotWorldPlacement.js's
                 own header. Position is rendered only on PLACED — this
                 milestone never fabricates one. -->
            <dl v-if="selectedSnapshotWorldPlacementResult" class="own-publication-selected-world-placement-detail">
                <dt>Selected Snapshot World Placement</dt>
                <dd>{{ selectedSnapshotWorldPlacementResult.outcome }}</dd>
                <template v-if="selectedSnapshotWorldPlacementResult.position">
                    <dt>Position</dt>
                    <dd>{{ selectedSnapshotWorldPlacementResult.position.x }}, {{ selectedSnapshotWorldPlacementResult.position.y }}, {{ selectedSnapshotWorldPlacementResult.position.z }}</dd>
                </template>
                <template v-if="selectedSnapshotWorldPlacementResult.reason">
                    <dt>Reason</dt>
                    <dd>{{ selectedSnapshotWorldPlacementResult.reason }}</dd>
                </template>
            </dl>

            <!-- 0.9.160 — Selected Snapshot World Runtime Registration. An
                 independent SIBLING of "Place Materialized Snapshot" above,
                 not an automatic consequence of it — see this file's own
                 header, "0.9.160." Reachable in the SAME
                 materializeSelectedSnapshotCommand family (registering a
                 Snapshot that was never even placed has no meaning).
                 Disabled whenever there is no selectedSnapshotWorldPlacementResult
                 yet. Synchronous — no "…ing" label, since
                 registerMaterializedSnapshotWorldSource() performs no I/O. -->
            <button
                v-if="materializeSelectedSnapshotCommand"
                type="button"
                class="action-btn own-publication-selected-world-registration-action"
                :disabled="!selectedSnapshotWorldPlacementResult"
                @click="registerMaterializedSnapshot"
            >Register Placed Snapshot</button>

            <!-- A separate result from selectedSnapshotWorldPlacementResult
                 above. On a placement that never reached PLACED, this
                 reports that SAME outcome unchanged (never a registration-
                 specific catch-all) — see application/
                 MaterializedSnapshotWorldDiscoveryBridge.js's own header.
                 Origin is rendered only on REGISTERED. -->
            <dl v-if="selectedSnapshotWorldRegistrationResult" class="own-publication-selected-world-registration-detail">
                <dt>Selected Snapshot World Registration</dt>
                <dd>{{ selectedSnapshotWorldRegistrationResult.outcome }}</dd>
                <template v-if="selectedSnapshotWorldRegistrationResult.origin">
                    <dt>Origin</dt>
                    <dd>{{ selectedSnapshotWorldRegistrationResult.origin }}</dd>
                </template>
                <template v-if="selectedSnapshotWorldRegistrationResult.reason">
                    <dt>Reason</dt>
                    <dd>{{ selectedSnapshotWorldRegistrationResult.reason }}</dd>
                </template>
            </dl>
        </div>
    `
};
