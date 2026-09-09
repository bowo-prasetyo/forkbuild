import { resolveSnapshotPublicationAttribution } from '../../application/SnapshotPublicationAttribution.js';
import { resolveSnapshotWorldPlacement } from '../../application/SnapshotWorldPlacement.js';
import { registerMaterializedSnapshotWorldSource } from '../../application/MaterializedSnapshotWorldDiscoveryBridge.js';
import { resolveSnapshotWorldPositionClaim } from '../../application/SnapshotWorldPositionClaim.js';
import { SnapshotWorldPositionClaimOutcome } from '../../application/SnapshotWorldPositionClaimOutcome.js';

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
//
// 0.9.172 — Decentralized Snapshot Position Claim Consumption.
//
// 0.9.171 taught a Snapshot discovery candidate to optionally CARRY a
// publisher's own `publicationId`/`claimedPosition` claim; nothing since
// has ever CONSUMED one. `placeMaterializedSnapshot()` (0.9.159) has, until
// now, always read `this.placementInfo` — this replica's own PRE-EXISTING
// local placement for the active Publication — with no notion a candidate
// might itself claim a different position entirely. This milestone adds
// exactly one new, EXPLICIT seam between materializing a Snapshot and
// placing it:
//
//   selectedSnapshotCandidate   (0.9.151, unchanged — may carry
//        │                       publicationId/claimedPosition, 0.9.171)
//        │
//        │  click "Use Claimed Position"
//        ▼
//   useClaimedSnapshotPosition()   (THIS FILE, NEW)
//        │
//        ▼
//   resolveSnapshotWorldPositionClaim(candidate, publication.id)
//     (application/SnapshotWorldPositionClaim.js, NEW — a PURE function,
//     no collaborator to inject, exactly like resolveSnapshotWorldPlacement()
//     one sibling over)
//        │
//        ▼
//   selectedSnapshotWorldPositionClaimResult   (NEW field)
//        │
//        │  click "Place Materialized Snapshot"
//        ▼
//   placeMaterializedSnapshot()   (0.9.159, UPDATED — see below)
//
// AN EXPLICIT, SEPARATE CLICK — NEVER AUTOMATIC, NEVER A BYPRODUCT OF
// SELECTION, RESOLUTION, OR MATERIALIZATION. Selecting a candidate that
// happens to carry a claim, resolving it, or materializing it never
// consumes that claim on its own — the identical restraint 0.9.159's own
// header already holds for placement itself ("a successfully materialized
// Snapshot does not automatically acquire a World position"), held here
// one seam earlier: a decentralized position is currently only a
// PUBLISHER'S claim, and it would be architecturally premature to let an
// arbitrary network announcement silently alter World state. Only a
// person's own explicit `useClaimedSnapshotPosition()` click ever computes
// `selectedSnapshotWorldPositionClaimResult`.
//
// `placeMaterializedSnapshot()` PREFERS A CONSUMED CLAIM, BUT FALLS BACK TO
// `this.placementInfo` UNCHANGED THE MOMENT NO CLAIM WAS CONSUMED. When
// `selectedSnapshotWorldPositionClaimResult` is `null` (nobody clicked "Use
// Claimed Position" for this selection) or its own `outcome` is not
// `SnapshotWorldPositionClaimOutcome.CLAIMED` (ABSENT or MISMATCHED),
// `placeMaterializedSnapshot()` behaves EXACTLY as 0.9.159 left it — it
// hands `resolveSnapshotWorldPlacement()` `this.placementInfo`, this
// replica's own existing local placement, verbatim. This is what keeps
// every pre-0.9.172 test of this panel's own placement behavior passing
// unmodified, and is the literal meaning of "the absence of a claim means
// no decentralized position was supplied — nothing more": no `(0,0,0)` is
// ever invented, and the receiver's own current position is never
// substituted either. Only when the outcome IS `CLAIMED` does this method
// build a fresh, synthetic `placementInfo`-shaped object —
// `{ placementId: 'claim:<contentHash>:<publicationId>', publicationId,
// position: claim.position }` — and hand THAT to
// `resolveSnapshotWorldPlacement()` instead, which remains completely
// unmodified and unaware any of this happened; see that file's own header,
// "given a resolved placement input," never taught to understand Nostr or
// a claim of any kind.
//
// THE SYNTHETIC `placementId` NAMES A CLAIM, NEVER A REAL WorldPlacement.
// `'claim:<contentHash>:<publicationId>'` is never looked up in, or written
// to, `core/PlacementRecord.js`/`placement/LocalPlacementRegistry.js` — it
// exists only so `resolveSnapshotWorldPlacement()`'s own placementInfo
// contract (`placementId`/`publicationId`/`position`, all required) is
// satisfied, and so a person inspecting `selectedSnapshotWorldPlacementResult.placementId`
// can tell, structurally, that this placement was borrowed from a claim
// rather than from this replica's own placement registry — mirroring the
// identical "traceability, never treated as the Snapshot's own identity"
// restraint `application/SnapshotWorldPlacement.js`'s own header already
// holds for `placementId` in general.
//
// THE IDENTITY CHECK — `candidate.publicationId === publication.id` — IS
// PERFORMED ENTIRELY BY `resolveSnapshotWorldPositionClaim()`, NEVER
// RE-CHECKED HERE. `useClaimedSnapshotPosition()` passes `this.publication.id`
// straight through; this file never compares `candidate.publicationId`
// against anything itself, and never invents a fallback identity of its
// own. See application/SnapshotWorldPositionClaim.js's own header for why
// that boundary — never "the content hash matches, therefore use this
// position" — is the one this milestone exists to hold, and for why a
// mismatch (`MISMATCHED`) is reported distinctly from an ordinary absence
// (`ABSENT`) rather than silently folded into it.
//
// SYNCHRONOUS — NO EXECUTING/ERROR STATE OF ITS OWN, mirroring
// `attributeSelectedSnapshot()`'s and `placeMaterializedSnapshot()`'s own
// restraint: `resolveSnapshotWorldPositionClaim()` performs no I/O and no
// cryptographic re-verification, so there is nothing to await and nothing
// that can reject.
//
// STALENESS — NARROWER THAN THE PLACEMENT FAMILY'S OWN, BY DESIGN. A
// consumed claim depends on exactly two facts: WHICH candidate is selected,
// and WHICH Publication is the placement target. `selectedSnapshotWorldPositionClaimResult`
// is therefore cleared only at `selectSnapshotCandidate()` (a different
// selection may carry a different claim, or none) and the Publication-
// change watcher (a different target changes the identity check's own
// right-hand side) — NEVER at `resolveSelectedSnapshot()` or
// `materializeSelectedSnapshot()`, since re-resolving or re-materializing
// the SAME selection against the SAME Publication changes neither fact a
// consumed claim depends on. `useClaimedSnapshotPosition()` itself also
// clears `selectedSnapshotWorldPlacementResult`/`selectedSnapshotWorldRegistrationResult`
// immediately before computing a fresh claim result, the identical
// "downstream results computed from what is about to change are already
// stale" rule every sibling action in this family already holds.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Signature verification, timestamp freshness, conflicting-position
//   reconciliation, ranking competing claims, trust scores, or publisher
//   reputation.** See application/SnapshotWorldPositionClaim.js's own
//   header.
// - **Automatic position updates, automatic relocation, or movement of any
//   kind.** Only an explicit click ever computes or applies a claim.
// - **Geospatial or collision validation.**
// - **Changing `application/WorldDiscoverySourceRegistry.js`,
//   `ui/components/WorldEncounterCanvas.js`, or the Snapshot discovery
//   protocol (`core/SnapshotDiscoveryEnvelope.js`) again.** All three
//   remain byte-for-byte as their own prior milestones left them.
// - **A new `VERIFIED_POSITION` state, or any change to what "verified"
//   means for a Snapshot.** A candidate's own claimed position remains
//   untrusted metadata until explicitly consumed; consuming it is not
//   verifying it.
//
// 0.9.198 — Publication Unpublish/Retract UI Action.
//
// Every action above (0.9.140 through 0.9.172) reaches FORWARD from a
// Publication — distribute it, discover its Snapshot, browse/resolve/
// materialize/place/register some OTHER replica's. Nothing yet lets a
// Publisher take THEIR OWN Publication back out of the catalog. This
// adds exactly that, one seam, mirroring `ui/components/
// PlacementInfoPanel.js`'s own 0.9.197 "Remove from World" addition at
// the layer above:
//
//   publication   (unchanged prop, ★ above)
//           │
//           │ click "Unpublish"
//           ▼
//   unpublishOwnPublication()   (THIS FILE, NEW)
//           │
//           ▼
//   unpublishCommand(publication)   (injected — a thin WorldView.js
//                                     wrapper around
//                                     session.unpublishDocument(),
//                                     mirroring removePlacementFromPanel()'s
//                                     own wrap of session.removePlacement()
//                                     — this component never imports
//                                     WorldNavigationSession or
//                                     UnpublishDocumentUseCase itself)
//
// NO NEW LIFECYCLE STATE, NO EXECUTING/ERROR FIELD OF ITS OWN. Unlike
// the Distribute/Discover command families above (real network I/O,
// genuinely worth an "in flight" indicator), `UnpublishDocumentUseCase`
// is local and synchronous — the SAME reason `placeMaterializedSnapshot()`/
// `registerMaterializedSnapshot()` (0.9.159/0.9.160) hold no
// executing/error state of their own. This component keeps no
// "unpublished"/"publicationRemoved" result field either: `publication`
// is supplied by the host view, entirely derived from
// `session.getPublicationForDocument()` — the SAME "null when the
// question doesn't apply" read model `getPlacementInfo()` already
// follows for a placement — so once the catalog no longer has a record
// for this document, the NEXT prop update already makes `publication`
// null and this panel's own detail/actions collapse through the exact
// `v-if="publication"` path an unpublished document already takes.
//
// GATED THE SAME WAY EVERY SIBLING ACTION IN THIS FILE ALREADY IS: the
// button only renders when a caller supplied `unpublishCommand` at all,
// and is disabled whenever there is no `publication` to unpublish — no
// second, UI-only ownership rule. `WorldNavigationSession.unpublishDocument()`
// enforces whatever ownership `UnpublishDocumentUseCase`/
// `LocalPublisherProvider.unpublish()` themselves do (as of this
// writing, none — the SAME "own publication" scoping this whole panel
// already relies on: `publication` is never a foreign Publication found
// via discovery/search, only ever the ACTIVE document's own, exactly
// like `distributeOwnSnapshot()`'s own gate above).
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Confirmation dialogs or an undo affordance.** No other mutation
//   in this file (or in `ui/views/WorldView.js`) uses one.
// - **Clearing `selectedSnapshotCandidate` or any of its own downstream
//   families.** Unpublishing the ACTIVE Publication does not touch
//   Snapshot browsing/resolution/materialization/placement/registration
//   state at all — those stay exactly as `UnpublishDocumentUseCase`
//   itself leaves them (untouched; see that file's own header), and the
//   very next `publication` prop change (to `null`) already resets
//   every one of those families through the EXISTING `publication`
//   watcher, unmodified by this milestone.
// - **Any new resolution/outcome vocabulary.** `unpublishCommand`
//   returns `UnpublishDocumentUseCase.execute()`'s own plain boolean,
//   never rendered as a result block — the panel's own disappearance
//   IS the observable outcome.
//
// 0.9.215 — Snapshot Export Capability Integration.
//
// 0.9.212's own reassessment named the one Snapshot capability this
// codebase had built and tested but never wired to any UI: application/
// BuildPublicationSnapshotTransferPackageUseCase.js (0.8.32), "the
// export-side counterpart of application/
// ImportPublicationSnapshotTransferPackageUseCase.js" by its own header's
// own words — fully implemented, exercised by seven separate test files,
// composed nowhere. This is that wiring, and nothing more:
//
//   publication   (unchanged prop, ★ above)
//           │
//           │ click "Export Snapshot"
//           ▼
//   exportOwnSnapshot()   (THIS FILE, NEW)
//           │
//           ▼
//   exportSnapshotCommand(publication)   (injected — a thin
//                                          WorldView.js wrapper,
//                                          exportOwnSnapshot(), around
//                                          the app-wide
//                                          exportSnapshotCommand
//                                          ui/main.js composes, itself a
//                                          thin `(publicationId) ->
//                                          Promise<pkg>` wrap of
//                                          snapshotContentMaterializationCoordinator.export() —
//                                          this component never imports
//                                          BuildPublicationSnapshotTransferPackageUseCase.js
//                                          or SnapshotContentMaterializationCoordinator.js
//                                          itself, mirroring
//                                          distributeOwnSnapshot()'s own
//                                          restraint one action over)
//           │
//           ▼
//   Publication Snapshot Transfer Package
//   { kind, schemaVersion, publicationId, contentHash, content }
//           │
//           ▼
//   this panel's own result display (publicationId + contentHash only —
//   see below)
//
// NO NEW EXPORT PIPELINE, NO NEW SERIALIZATION FORMAT. The use case
// composed here (`ui/main.js`) is the SAME
// BuildPublicationSnapshotTransferPackageUseCase.js 0.8.32 already built
// and 0.8.34's own `ImportPublicationSnapshotTransferPackageUseCase`
// wiring already treats as import's own counterpart — this milestone
// adds a coordinator method and a UI action, never a second way to
// assemble a Snapshot Transfer Package.
//
// MIRRORS distributeOwnSnapshot()/discoverOwnSnapshot() EXACTLY — a
// dedicated `snapshotExportExecuting`/`snapshotExportError`/
// `snapshotExportResult`/`snapshotExportRequestId` ephemeral family
// (never shared with either sibling's own), reset on the identical
// `publication` change and invalidated on unmount the identical way.
// Gated the identical way every sibling action in this file already is:
// the button only renders when a caller supplied `exportSnapshotCommand`
// at all, disabled whenever there is no `publication` or a call is
// already in flight.
//
// NEVER READS `publication.contentReference` ITSELF. Unlike
// `discoverOwnSnapshot()` (which needs `publication.contentReference.hash`
// as an explicit input to ask "does this contentHash resolve
// externally?"), export asks a different question — "does THIS REPLICA
// already hold the bytes this Publication's own catalog entry claims?" —
// answerable from `publication.id` alone; `BuildPublicationSnapshotTransferPackageUseCase.js`
// itself re-reads the contentReference from its own publication catalog
// lookup, never trusting a value this component could hand it stale.
//
// THE RESULT DISPLAY SHOWS IDENTITY FACTS ONLY, NEVER THE BYTES
// THEMSELVES. `snapshotExportResult.content` (the actual Snapshot bytes)
// is deliberately never rendered, copied, or offered as a download here
// — see this milestone's own docs/Roadmap.md entry, "one thing not
// decided yet": whether an exported package becomes a downloadable file,
// a copyable blob, or something else is a later, unscheduled product
// decision. This milestone's only job is making the existing capability
// REACHABLE, not deciding how its output is consumed.
//
// NEVER MUTATES publication, distribution, discovery, placement, or
// registration state. `BuildPublicationSnapshotTransferPackageUseCase.js`
// itself performs no hash verification and no write of any kind (see its
// own header) — this action reads a Publication's own already-stored
// bytes and returns them, the identical read-only restraint
// `distributeOwnSnapshot()` already holds for its own resolved bytes,
// never re-publishing, re-placing, or re-registering anything.
//
// 0.9.248 — Publication Commentary UI Integration.
//
// 0.9.242-0.9.247 built a complete, authoritative application-layer
// read/write pair for Publication commentary — GetPublicationCommentariesUseCase
// (0.9.247) and AddPublicationCommentaryUseCase (0.9.244, with authorship
// closed by 0.9.245 and authorization by 0.9.246) — reachable from
// precisely nowhere a person could click. This is that wiring, and
// deliberately only that: the first product-facing UI over an existing
// application boundary, mirroring 0.9.215's own "makes the existing
// capability REACHABLE, not a new capability" restraint one section
// above.
//
//   OwnPublicationPanel (THIS FILE)
//        │
//        ├── getPublicationCommentariesCommand(publicationId)   (NEW —
//        │        a thin (publicationId) -> PublicationCommentary[]
//        │        function, injected by ui/views/WorldView.js, wrapping
//        │        WorldNavigationSession.getPublicationCommentaries(),
//        │        which itself wraps GetPublicationCommentariesUseCase
//        │        unmodified)
//        │
//        └── addPublicationCommentaryCommand({ publicationId, content })
//                 (NEW — a thin ({publicationId, content}) -> {commentary,
//                 isNew} function, the identical injection shape,
//                 wrapping WorldNavigationSession.addPublicationCommentary(),
//                 which itself wraps AddPublicationCommentaryUseCase
//                 unmodified)
//
// THIS COMPONENT NEVER IMPORTS PublicationCommentary, PublicationCommentaryStore,
// GetPublicationCommentariesUseCase, or AddPublicationCommentaryUseCase —
// it only ever calls the two injected command functions above, mirroring
// the EXACT command-injection boundary `distributeOwnSnapshot()`/
// `discoverOwnSnapshot()` already hold for Arweave/Nostr. The UI never
// constructs a PublicationCommentary object and never touches
// PublicationCommentaryStore, directly or indirectly.
//
// EXISTING COMMENTARY IS LOADED ON MOUNT AND ON EVERY PUBLICATION CHANGE
// — never on a timer, an interval, or a subscription of any kind (see
// "deliberately excluded," below). Rendered in WHATEVER order
// getPublicationCommentariesCommand returns, verbatim — this file adds
// no sort of its own, deferring entirely to
// GetPublicationCommentariesUseCase's own "never re-sorted here."
//
// SUCCESSFUL CREATION RE-QUERIES RATHER THAN APPENDING. On a successful
// `addPublicationCommentaryCommand()` call, `submitPublicationCommentary()`
// (below) calls `refreshPublicationCommentaries()` again rather than
// pushing the returned `commentary` into `publicationCommentaries`
// itself — one source of truth (the store, read through the SAME query
// use case every other read goes through), never a second, UI-maintained
// interpretation of the stored collection that could drift from it.
//
// AUTHORSHIP IS NEVER UI-SUPPLIED. `submitPublicationCommentary()` sends
// `addPublicationCommentaryCommand` exactly `{ publicationId, content }`
// — no `authorIdentityId` field exists on that call, matching
// AddPublicationCommentaryUseCase's own 0.9.245 boundary: this file
// cannot even ATTEMPT to name a different author.
//
// SIGN-IN IS OBSERVED, NEVER RE-IMPLEMENTED. `viewerIdentityId` (a new
// prop, below) is the SAME already-computed `session.getMyIdentityId()`
// fact `ui/views/WorldView.js`'s own `myIdentityId` already exposes to
// other panels — this component reads it only to decide whether to show
// the compose form or a "sign in" hint, and never resolves, derives, or
// authenticates an identity of its own. The actual authentication
// decision for a submitted comment is still made entirely inside
// AddPublicationCommentaryUseCase, which this component never second-
// guesses: an authenticated `viewerIdentityId` whose session has since
// expired still gets a real, authoritative rejection from the use case
// itself, surfaced as `publicationCommentaryError`.
//
// A FAILED READ NEVER WIPES AN ALREADY-DISPLAYED LIST; A FAILED WRITE
// NEVER PERSISTS OR CORRUPTS ONE. See refreshPublicationCommentaries()/
// submitPublicationCommentary()'s own comments, below, for the exact
// behavior tests/PublicationCommentaryUIIntegration.test.js Sections
// F/G exercise.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE, per this milestone's own
// brief: live commentary subscriptions, polling, WebSocket/Nostr
// propagation or any decentralized commentary distribution, replies,
// threading, editing, deletion/retraction, moderation, reactions,
// notifications, unread/read tracking, pagination, a sorting policy, and
// search. This milestone's own scope is "inspect existing commentary,
// create new commentary through the authoritative application path" —
// nothing more.
//
// 0.9.251 — Publication Commentary Count UI.
//
// 0.9.250's own Section D named the one remaining Commentary seam
// classified MISSING_UI, plainly: "`publicationCommentaries.length`
// already sits in component state and is read exactly once, only as the
// empty-state boolean gate, never rendered as a visible number." This
// closes exactly that gap, and nothing else:
//
//   publicationCommentaries   (0.9.248, unchanged — the array already
//        │                     populated by refreshPublicationCommentaries()
//        │                     through GetPublicationCommentariesUseCase)
//        ▼
//   publicationCommentaries.length   (read directly in the template,
//        │                            below — no new field, no computed
//        │                            property, no second state)
//        ▼
//   "Commentary (3)" / "Commentary (0)"   (the section's own <h5> title)
//
// NO NEW STATE, NO NEW METHOD, NO NEW USE CASE. `publicationCommentaries.length`
// is read directly by the template's own `<h5>` interpolation — this
// milestone adds no `publicationCommentaryCount` data field, no
// `computed` block (this component has never had one), and no
// `GetPublicationCommentaryCountUseCase`. `GetPublicationCommentariesUseCase`
// (0.9.247) already returns the authoritative, complete collection every
// time; a second, count-specific query would answer the identical
// question through a second path for no reason — see this file's own
// "one source of truth" restraint, held throughout 0.9.248-0.9.250.
//
// THE COUNT IS ALWAYS DERIVED, NEVER MANUALLY INCREMENTED. There is no
// `commentCount++` anywhere in this file. Because the displayed number is
// `publicationCommentaries.length` itself — not a copy of it — every
// existing site that already sets `publicationCommentaries` (the
// Publication-change watcher's reset to `[]`, `refreshPublicationCommentaries()`'s
// own success/failure paths, and `submitPublicationCommentary()`'s own
// re-query on success) already keeps the rendered count correct with no
// change to any of those methods. A failed submission
// (`submitPublicationCommentary()`'s own `catch` block, unchanged) never
// touches `publicationCommentaries` at all, so the displayed count never
// moves for a rejected attempt — the identical invariant this file's own
// 0.9.248 header already established for the list itself, extended for
// free to the number describing it.
//
// NO IDENTITY OR AUTHORIZATION DEPENDENCY OF ITS OWN. The count describes
// the SAME `publicationCommentaries` array every viewer's
// `getPublicationCommentariesCommand` call already returns — unauthenticated,
// per 0.9.247's own header ("no authenticated-caller step, no
// authorization check"). Rendering a number derived from that array
// introduces no new read path and therefore no new dependency on
// `viewerIdentityId`, unlike the compose form immediately below it (which
// already, separately, gates on sign-in).
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. A dedicated count use case
// or store method; a separately fetched/cached count; live updates via
// polling or subscription (count changes exactly when
// `publicationCommentaries` itself already does, per 0.9.247/0.9.248's
// own existing "read once, on mount and on Publication change, plus a
// re-query after a successful submission" cadence); any of the six
// MISSING_DOMAIN_CAPABILITY seams 0.9.250 named (notifications,
// discovery, moderation/removal, synchronization, navigation, persistence
// management) or the REACHABLE_BUT_INTERNAL `getById()` finding — none of
// those seams are touched by, or required for, rendering a count.
//
// 0.9.308 — Publication Multi-Placement Visibility.
//
// 0.9.307's own Post-Arc Product Evolution Reassessment named the exact
// gap: `application/DiscoverPlacementsUseCase.js#findByPublicationId()`
// already returns EVERY PlacementRecord for a Publication, fully
// implemented and fully tested (tests/PlacementRegistry.test.js), but its
// ONE production reader — `WorldNavigationSession#_resolvePlacementRecord()`
// — reduces the result down to a single, most-recently-updated record,
// by its own documented admission ("browsing/choosing among several is
// future scope"). A Publication placed more than once — an intended,
// named scenario (docs/Principles.md, 0.2.23: "an exhibition copy here, a
// personal copy of the same publication there") — had no way for its own
// owner to see or manage anything but that one copy. This closes exactly
// that gap:
//
//   click (mount, or a new `publication` becomes current)
//           │
//           ▼
//   refreshPublicationPlacements()
//           │
//           ▼
//   getPublicationPlacementsCommand(publication.id)   (injected — a thin
//                                     ui/views/WorldView.js wrapper around
//                                     session.getPlacementsForPublication(),
//                                     itself a thin, NEW WorldNavigationSession
//                                     method wrapping DiscoverPlacementsUseCase's
//                                     own pre-existing findByPublicationId(),
//                                     never reducing the result — see that
//                                     method's own header)
//           │
//           ▼
//   publicationPlacements = [ { placementId, position, revision, owner,
//                                overlapCount, ... }, ... ]   (rendered
//                                VERBATIM, in the exact order received —
//                                see "don't collapse multiple placements,"
//                                below)
//
// A READ-SIDE INTEGRATION, NEVER A PLACEMENT-SYSTEM REDESIGN. No new
// domain class, no new storage shape, no new use case: `PlacementRecord`
// and `DiscoverPlacementsUseCase` already existed and were already
// tested before this milestone; the only new code is one
// WorldNavigationSession method (a thin, non-reducing sibling of
// `getPlacementInfo()` and its own per-publicationId counterpart), one
// thin WorldView.js wrapper, one new prop here, and this section's own
// rendering — the exact size of 0.9.289's own Commentary seam, per
// 0.9.307's own Section G6 estimate.
//
// PLACEMENT RECORDS, NEVER WORLD VISIBILITY OR OCCUPANCY. This section
// answers "has this Publication been placed here" (a PlacementRecord
// exists), never "can a viewer currently see it" (World visibility,
// untouched — no camera, no viewport, no peer-presence concept anywhere
// in this file) or "does something currently occupy that spot" (spatial
// occupancy — `getDocumentsAtPosition()`/`checkPlacementOverlap()`'s own
// question, never called by this section). `getPlacementsForPublication()`
// queries the PlacementRegistry directly, exactly like
// `getPlacementInfo()` already does — it is never turned into, and never
// becomes, a World-state or spatial-index query.
//
// DON'T COLLAPSE MULTIPLE PLACEMENTS. Every record
// `getPublicationPlacementsCommand` returns is rendered — no
// deduplication by Publication, no "latest placement" reduction (the
// EXACT reduction `placementInfo`/`activePlacementInfo` above still
// performs, deliberately unchanged — see this file's own "0.9.159"
// entry), no arbitrary first-match selection, no ranking, no spatial
// aggregation. `refreshPublicationPlacements()` performs no `sort()` of
// its own; `v-for` renders `publicationPlacements` in the exact order
// `getPlacementsForPublication()` itself returned it. A single placement
// (length === 1) renders through the SAME list markup as three — never a
// special-cased "singleton" branch — and zero placements renders the
// section's own honest `own-publication-placements-empty` message,
// never treated as an error.
//
// NO_PLACEMENTS ≠ DISCOVERY_FAILED — THE CRITICAL SEMANTIC QUESTION.
// `publicationPlacements: []` with `publicationPlacementsError: null`
// means "this Publication genuinely has zero placements," a real and
// distinct value never conflated with a discovery FAILURE
// (`publicationPlacementsError` set, and — mirroring
// `refreshPublicationCommentaries()`'s own restraint exactly —
// `publicationPlacements` left UNCHANGED rather than wiped to `[]`, so a
// previously-loaded list never silently disappears behind a transient
// read failure). No new domain status is introduced for this: it is the
// same plain try/catch shape `refreshPublicationCommentaries()` already
// uses, one capability over — see that method's own header.
//
// STRICTLY READ-ONLY — NO GO-TO-PLACEMENT, NO PER-ROW REMOVE, NOT YET.
// This section renders facts and nothing else: no button, click handler,
// or emitted event anywhere in it creates, removes, moves, or alters a
// placement, a Publication, or World state of any kind. `application/
// DiscoverPlacementsUseCase.js`, `PlacePublicationUseCase`,
// `MoveWorldPlacementUseCase`, and `RemoveWorldPlacementUseCase` are all
// untouched by this milestone; `ui/components/PlacementInfoPanel.js`
// remains the sole owner of Focus/Move/Remove actions, scoped to the
// single ACTIVE placement it already renders. Per this milestone's own
// brief, "the first product gap is visibility, not placement management"
// — navigation/management actions per discovered placement are a
// deliberately separate, later, unscheduled decision.
//
// `publicationId` IS ALWAYS THE PUBLICATION BEING INSPECTED, NEVER
// SUBSTITUTED. `refreshPublicationPlacements()` calls
// `getPublicationPlacementsCommand(publication.id)` — the SAME
// `publication` prop every sibling capability in this file already reads
// — never the current user's id, a different Publication's id, or a
// selected placement's own id. The Publication-change watcher resets
// `publicationPlacements`/`publicationPlacementsError` on every
// `publication` switch (including to `null`) so inspecting Publication A
// never leaves Publication B's placements on screen, mirroring
// `publicationCommentaries`'s own identical reset one capability over.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any change to `DiscoverPlacementsUseCase`, `PlacePublicationUseCase`,
//   `MoveWorldPlacementUseCase`, `RemoveWorldPlacementUseCase`, or World
//   placement semantics of any kind.** All four remain byte-for-byte as
//   their own prior milestones left them.
// - **"Go to placement," "Remove this placement," or any other per-row
//   action.** See "strictly read-only," above.
// - **A spatial map, ranking, deduplication, or "latest placement"
//   semantics for this section's own list.** See "don't collapse
//   multiple placements," above.
// - **A new Placement domain model or lifecycle, notification
//   integration, provider-preference integration, or automatic World
//   synchronization.**
// - **Live updates, polling, or a subscription of any kind.** Loaded on
//   mount and on Publication change only — the identical cadence
//   `publicationCommentaries` already follows.
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
        // 0.9.198 — optional. A `(publication) -> boolean` function, or
        // `null` when the capability is unavailable — see this file's
        // own header, "0.9.198 — Publication Unpublish/Retract UI
        // Action." Synchronous, unlike every OTHER command prop in this
        // file: `UnpublishDocumentUseCase` performs no network I/O, so
        // there is nothing to await. Called with the whole `publication`
        // object, exactly like `snapshotDistributionCommand` above,
        // never a bare id.
        unpublishCommand: {
            type: Function,
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
        // 0.9.215 — optional. A `(publication) -> Promise<Publication
        // SnapshotTransferPackage>` function, or `null` when the
        // capability is unavailable — see this file's own header,
        // "0.9.215 — Snapshot Export Capability Integration." Mirrors
        // `snapshotDistributionCommand`/`discoverSnapshotCommand` exactly:
        // this component forwards the whole `publication` object,
        // unread, to whatever wrapper the host view bound here
        // (`ui/views/WorldView.js`'s own `exportOwnSnapshot()`, which
        // resolves `publication.id` before calling the app-wide
        // `exportSnapshotCommand`).
        exportSnapshotCommand: {
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
        },
        // 0.9.248 — Publication Commentary UI Integration. See this
        // file's own header, "0.9.248." A `(publicationId) ->
        // PublicationCommentary[]` function, or `null` when the
        // capability is unavailable — mirrors every other optional
        // command prop in this file (`null` default, feature hidden
        // when absent). Unlike the Promise-returning Distribute/
        // Discover/Export commands above, this one is SYNCHRONOUS —
        // GetPublicationCommentariesUseCase performs no network I/O —
        // so this component awaits nothing and shows no "loading"
        // state for it.
        getPublicationCommentariesCommand: {
            type: Function,
            default: null
        },
        // 0.9.248 — a `({ publicationId, content }) -> { commentary,
        // isNew }` function, or `null` when the capability is
        // unavailable. Also synchronous. Deliberately takes ONLY
        // `publicationId`/`content` — never `authorIdentityId` — see
        // this file's own header for why the UI cannot even attempt to
        // supply one.
        addPublicationCommentaryCommand: {
            type: Function,
            default: null
        },
        // 0.9.248 — the CURRENT viewer's own identityId, or `null` when
        // nobody is signed in. The SAME already-computed session fact
        // `ui/views/WorldView.js`'s own `myIdentityId` already exposes
        // elsewhere (`session.getMyIdentityId()`) — this component reads
        // it only to decide whether to show the compose form or a
        // sign-in hint; it never derives, resolves, or authenticates an
        // identity itself, and never sends this value to
        // addPublicationCommentaryCommand (the use case resolves the
        // real author on its own — see this file's own header, "the
        // application use case remains authoritative").
        viewerIdentityId: {
            type: String,
            default: null
        },
        // 0.9.308 — Publication Multi-Placement Visibility. A
        // `(publicationId) -> PlacementInfo[]` function, or `null` when
        // the capability is unavailable — see this file's own header,
        // "0.9.308." Mirrors `getPublicationCommentariesCommand` exactly:
        // synchronous (WorldNavigationSession.getPlacementsForPublication()
        // performs no network I/O), `null`-default, feature hidden when
        // absent. Deliberately takes `publicationId`, never the
        // `placementInfo` prop above — that prop is the SINGULAR,
        // already-reduced placement for the ACTIVE document; this
        // command answers a different question, "every placement this
        // Publication has," and must be invoked fresh, never assembled
        // by filtering/deriving from `placementInfo`.
        getPublicationPlacementsCommand: {
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
            // 0.9.215 — see this file's own header, "0.9.215 — Snapshot
            // Export Capability Integration." A separate ephemeral state,
            // never shared with distribution's or discovery's own —
            // mirrors `snapshotDistributionExecuting`/
            // `snapshotDistributionError`/`snapshotDistributionResult`/
            // `snapshotDistributionRequestId` exactly, one action over.
            snapshotExportExecuting: false,
            snapshotExportError: null,
            snapshotExportResult: null,
            snapshotExportRequestId: 0,
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
            selectedSnapshotWorldRegistrationResult: null,
            // 0.9.172 — see this file's own header, "0.9.172 — Decentralized
            // Snapshot Position Claim Consumption." A separate ephemeral
            // field, never shared with `selectedSnapshotWorldPlacementResult`
            // itself. `null` until `useClaimedSnapshotPosition()` is
            // explicitly clicked; never written by anything else. No
            // executing/error state of its own — see this file's own
            // header, "synchronous."
            selectedSnapshotWorldPositionClaimResult: null,
            // 0.9.248 — Publication Commentary UI Integration. The four
            // fields named in this milestone's own brief, kept ephemeral
            // and local to this panel — see this file's own header. Never
            // written by anything but refreshPublicationCommentaries()/
            // submitPublicationCommentary(), below, and the publication
            // watcher's own reset.
            //
            // `publicationCommentaries` — every PublicationCommentary
            // GetPublicationCommentariesUseCase returned for the CURRENT
            // publication, in the EXACT order it returned them (no sort
            // of any kind performed here — see this file's own header,
            // "preserve the returned order"). `[]` is a legitimate,
            // distinct value (no commentary yet, or the capability is
            // unavailable), never an error.
            publicationCommentaries: [],
            // `newCommentaryText` — the compose textarea's own v-model
            // target. Cleared only on a SUCCESSFUL submission; left
            // exactly as typed after a failed one, so a rejected attempt
            // never discards what the person wrote.
            newCommentaryText: '',
            // `publicationCommentarySubmitting` — guards against a
            // double-submit from a second click before the first
            // synchronous call has updated this flag back to false. No
            // separate "loading" flag for the read side: a synchronous
            // getForPublication() read has nothing to show a spinner for.
            publicationCommentarySubmitting: false,
            // `publicationCommentaryError` — the most recent read OR
            // write failure's message, or `null`. A FAILED refresh never
            // clears `publicationCommentaries` itself (see
            // refreshPublicationCommentaries() below) — this field is the
            // only thing a failure ever changes, so previously-loaded
            // commentary stays on screen instead of being replaced by an
            // empty list.
            publicationCommentaryError: null,
            // 0.9.308 — Publication Multi-Placement Visibility. Mirrors
            // `publicationCommentaries`/`publicationCommentaryError`'s own
            // shape exactly, one capability over — see this file's own
            // header. Never written by anything but
            // refreshPublicationPlacements(), below, and the publication
            // watcher's own reset.
            //
            // `publicationPlacements` — every placement
            // getPublicationPlacementsCommand returned for the CURRENT
            // publication, in the EXACT order it returned them (no sort,
            // dedup, "latest," or ranking of any kind performed here —
            // see this file's own header, "preserve multiplicity"). `[]`
            // is a legitimate, distinct value (a genuinely unplaced
            // Publication, or the capability is unavailable), never an
            // error.
            publicationPlacements: [],
            // `publicationPlacementsError` — the most recent read
            // failure's message, or `null`. A FAILED refresh never clears
            // `publicationPlacements` itself (see
            // refreshPublicationPlacements() below) — this field is the
            // only thing a failure ever changes, so a previously-loaded
            // placement list stays on screen instead of being replaced by
            // an empty one, and so NO_PLACEMENTS (`publicationPlacements:
            // []`, `publicationPlacementsError: null`) stays
            // distinguishable from DISCOVERY_FAILED (`publicationPlacementsError`
            // set) — see this file's own header, "the critical semantic
            // question."
            publicationPlacementsError: null
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
            // 0.9.215 — reset for the identical lifecycle-safety reason,
            // one action over — see this file's own header, "a separate
            // ephemeral state... reset on the identical publication
            // change."
            this.snapshotExportExecuting = false;
            this.snapshotExportError = null;
            this.snapshotExportResult = null;
            this.snapshotExportRequestId += 1;
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
            // 0.9.172 — a different (or cleared) Publication changes the
            // identity check's own right-hand side
            // (`resolveSnapshotWorldPositionClaim()`'s own `publicationId`
            // argument) — any prior consumed claim was checked against the
            // OLD Publication's own id.
            this.selectedSnapshotWorldPositionClaimResult = null;
            // 0.9.248 — a different (or cleared) Publication means any
            // prior commentary list, compose draft, in-flight submit
            // guard, and error all belong to a Publication that is no
            // longer this panel's own — the identical lifecycle-safety
            // reason every OTHER family in this watcher already resets
            // on. This is also the ONLY place a Publication SWITCH is
            // handled: switching from P1 to P2 must never leave P1's
            // commentary on screen (see tests/
            // PublicationCommentaryUIIntegration.test.js, Section I).
            this.publicationCommentaries = [];
            this.newCommentaryText = '';
            this.publicationCommentarySubmitting = false;
            this.publicationCommentaryError = null;
            // 0.9.308 — a different (or cleared) Publication means any
            // prior placement list and error belong to a Publication
            // that is no longer this panel's own — the identical
            // lifecycle-safety reason every OTHER family in this watcher
            // already resets on. Switching from P1 to P2 must never
            // leave P1's placements on screen.
            this.publicationPlacements = [];
            this.publicationPlacementsError = null;
            // Guarded the same way `guarded()`'s own `session.consumeForkNotice`
            // check is in ui/views/WorldView.js — every OTHER sibling
            // watcher/test in this codebase's own pre-0.9.248 suite calls
            // this exact watcher directly via `OwnPublicationPanel.watch.publication.call(ctx, ...)`
            // against a minimal ctx built for ITS OWN family alone, with
            // no reason to know this milestone's method exists. A real
            // Vue instance always has this method; only a hand-built test
            // ctx from an unrelated milestone's own test file does not.
            if (typeof this.refreshPublicationCommentaries === 'function') {
                this.refreshPublicationCommentaries();
            }
            // 0.9.308 — the identical guard, one capability over, for the
            // identical reason.
            if (typeof this.refreshPublicationPlacements === 'function') {
                this.refreshPublicationPlacements();
            }
        }
    },
    mounted() {
        // 0.9.248 — a `watch()` handler only fires on a SUBSEQUENT
        // change, never for the value a prop already held when this
        // component was created — so a panel mounted with a publication
        // already current (the common case: World View already has an
        // `ownPublication` by the time this panel first renders) needs
        // its own initial load here. Mirrors PublicationPreview.js's own
        // `mounted()` restraint: read once, on mount, nothing recurring.
        this.refreshPublicationCommentaries();
        // 0.9.308 — the identical initial-load restraint, one capability
        // over.
        this.refreshPublicationPlacements();
    },
    beforeUnmount() {
        // Invalidates any still-in-flight call, mirroring
        // WorldEncounterCanvas's own `beforeUnmount()` invalidation of
        // `snapshotDistributionRequestId`.
        this.snapshotDistributionRequestId += 1;
        this.snapshotDiscoveryRequestId += 1;
        this.snapshotExportRequestId += 1;
        this.snapshotCandidateDiscoveryRequestId += 1;
        this.selectedSnapshotResolutionRequestId += 1;
        this.selectedSnapshotMaterializationRequestId += 1;
    },
    methods: {
        // 0.9.198 — the only call site of `unpublishCommand` in this
        // file. A no-op whenever there is no `publication` or no
        // `unpublishCommand` — the identical gate every sibling action's
        // own guard clause in this file already applies. Synchronous —
        // no executing/error state to set, see this file's own header,
        // "no new lifecycle state, no executing/error field of its
        // own." Never clears any OTHER field in this component: a
        // successful unpublish is observed entirely through the
        // `publication` prop itself going `null` on the host view's
        // next refresh, not through anything this method writes.
        unpublishOwnPublication() {
            const publication = this.publication;
            if (!publication || !this.unpublishCommand) {
                return;
            }
            this.unpublishCommand(publication);
        },
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
        // 0.9.215 — the only writer of `snapshotExportExecuting`/
        // `snapshotExportError`/`snapshotExportResult`, and the only
        // caller of `exportSnapshotCommand` in this file — mirrors
        // `distributeOwnSnapshot()` exactly, one action over. A no-op
        // whenever there is no `publication`, no `exportSnapshotCommand`,
        // or a call is already in flight. Never reads
        // `publication.contentReference` itself — see this file's own
        // header, "0.9.215 — Snapshot Export Capability Integration,"
        // export names WHICH PUBLICATION, resolved entirely by the
        // injected command and the use case behind it.
        exportOwnSnapshot() {
            const publication = this.publication;
            if (!publication || !this.exportSnapshotCommand || this.snapshotExportExecuting) {
                return;
            }

            this.snapshotExportExecuting = true;
            this.snapshotExportError = null;
            this.snapshotExportRequestId += 1;
            const requestId = this.snapshotExportRequestId;

            Promise.resolve()
                .then(() => this.exportSnapshotCommand(publication))
                .then((result) => {
                    if (requestId === this.snapshotExportRequestId) {
                        this.snapshotExportResult = result;
                    }
                })
                .catch(() => {
                    if (requestId === this.snapshotExportRequestId) {
                        this.snapshotExportError = 'Snapshot export could not be completed.';
                    }
                })
                .then(() => {
                    if (requestId === this.snapshotExportRequestId) {
                        this.snapshotExportExecuting = false;
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
            // 0.9.172 — a different selection may carry a different claim,
            // or none at all — any prior consumed claim described the OLD
            // candidate.
            this.selectedSnapshotWorldPositionClaimResult = null;
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
        // 0.9.172 — the only writer of `selectedSnapshotWorldPositionClaimResult`,
        // and the only call site of `resolveSnapshotWorldPositionClaim()` in
        // this file — mirrors `attributeSelectedSnapshot()`'s own
        // synchronous, no-executing/error-state shape exactly. A no-op
        // whenever there is no `selectedSnapshotCandidate` or no
        // `publication` — the two facts the identity check itself needs
        // (`candidate.publicationId === publication.id`). See this file's
        // own header, "0.9.172," for why this is a SEPARATE, explicit click
        // rather than anything selection/resolution/materialization ever
        // does on their own.
        useClaimedSnapshotPosition() {
            const candidate = this.selectedSnapshotCandidate;
            const publication = this.publication;
            if (!candidate || !publication) {
                return;
            }
            // A fresh claim result is about to replace
            // `selectedSnapshotWorldPositionClaimResult`; any World
            // Placement/Registration result computed from the PRIOR claim
            // result (or from the local-placement fallback it may have
            // overridden) no longer describes what `placeMaterializedSnapshot()`
            // will now produce.
            this.selectedSnapshotWorldPlacementResult = null;
            this.selectedSnapshotWorldRegistrationResult = null;
            this.selectedSnapshotWorldPositionClaimResult = resolveSnapshotWorldPositionClaim(candidate, publication.id);
        },
        // 0.9.159 — the only writer of `selectedSnapshotWorldPlacementResult`,
        // and the only call site of `resolveSnapshotWorldPlacement()` in
        // this file. A no-op whenever there is no
        // `selectedSnapshotMaterializationResult` yet to place.
        //
        // 0.9.172 — UPDATED. When `selectedSnapshotWorldPositionClaimResult`
        // exists AND its own `outcome` is `SnapshotWorldPositionClaimOutcome.CLAIMED`,
        // this method builds a synthetic `placementInfo`-shaped object out
        // of the consumed claim's own `position` and hands THAT to
        // `resolveSnapshotWorldPlacement()` instead of `this.placementInfo`.
        // In every other case — no claim result yet, or one whose outcome
        // is ABSENT/MISMATCHED — this method is byte-for-byte what 0.9.159
        // already was: `this.placementInfo`, the receiver's own existing
        // local placement, unchanged. See this file's own header, "prefers
        // a consumed claim, but falls back... the moment no claim was
        // consumed."
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

            const claim = this.selectedSnapshotWorldPositionClaimResult;
            const effectivePlacementInfo = (claim && claim.outcome === SnapshotWorldPositionClaimOutcome.CLAIMED && this.publication)
                ? Object.freeze({
                    placementId: `claim:${materialization.contentHash}:${this.publication.id}`,
                    publicationId: this.publication.id,
                    position: claim.position
                })
                : this.placementInfo;
            this.selectedSnapshotWorldPlacementResult = resolveSnapshotWorldPlacement(materialization, effectivePlacementInfo);
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
        },
        // 0.9.248 — the only writer of `publicationCommentaries`, and the
        // only call site of `getPublicationCommentariesCommand` in this
        // file. Called on mount, whenever `publication` changes (see the
        // watcher above), and again after a successful submission below
        // — never on a timer, an interval, or any other implicit trigger
        // (see this file's own header, "no live commentary subscriptions,
        // no polling"). A no-op — `publicationCommentaries` reset to `[]`
        // — whenever there is no `publication` or no
        // `getPublicationCommentariesCommand`. A FAILED read leaves
        // `publicationCommentaries` exactly as it was (never wiped to
        // `[]`) and only sets `publicationCommentaryError` — see this
        // file's own header on `publicationCommentaryError`. Rendered in
        // WHATEVER order the command returns, verbatim — this method
        // performs no `sort()` of its own, mirroring
        // GetPublicationCommentariesUseCase's own "never re-sorted here."
        refreshPublicationCommentaries() {
            const publication = this.publication;
            if (!publication || !this.getPublicationCommentariesCommand) {
                this.publicationCommentaries = [];
                this.publicationCommentaryError = null;
                return;
            }
            try {
                const commentaries = this.getPublicationCommentariesCommand(publication.id);
                this.publicationCommentaries = Array.isArray(commentaries) ? commentaries : [];
                this.publicationCommentaryError = null;
            } catch (error) {
                this.publicationCommentaryError = 'Commentary could not be loaded.';
            }
        },
        // 0.9.248 — the only writer of `publicationCommentarySubmitting`,
        // and the only call site of `addPublicationCommentaryCommand` in
        // this file. A no-op whenever there is no `publication`, no
        // `addPublicationCommentaryCommand`, blank/whitespace-only
        // `newCommentaryText`, or a submission is already in flight —
        // the identical guard-clause shape every other action in this
        // file already uses. Sends ONLY `{ publicationId, content }` —
        // never `authorIdentityId` — see this file's own header,
        // "the UI should never construct PublicationCommentary directly."
        //
        // ON SUCCESS: clears the compose draft and RE-QUERIES through
        // refreshPublicationCommentaries() rather than appending the
        // returned `commentary` into `publicationCommentaries` itself —
        // see this file's own header for why re-querying is preferred:
        // one source of truth for "what commentary exists," never a
        // second, UI-maintained interpretation of the store's own
        // collection.
        //
        // ON FAILURE (no signed-in identity, authorization denied, a
        // storage conflict): `publicationCommentaryError` is set to the
        // thrown error's own message, `newCommentaryText` is left
        // UNCHANGED (a rejected attempt never discards what was typed),
        // and `publicationCommentaries` is left UNCHANGED — a failed
        // creation never corrupts the already-displayed list, and never
        // persists anything (AddPublicationCommentaryUseCase's own
        // header: authentication/authorization run BEFORE construction,
        // so a denied call leaves no partially-built record behind).
        submitPublicationCommentary() {
            const publication = this.publication;
            const content = this.newCommentaryText.trim();
            if (!publication || !this.addPublicationCommentaryCommand || !content || this.publicationCommentarySubmitting) {
                return;
            }
            this.publicationCommentarySubmitting = true;
            try {
                this.addPublicationCommentaryCommand({ publicationId: publication.id, content });
                this.newCommentaryText = '';
                this.publicationCommentaryError = null;
                this.refreshPublicationCommentaries();
            } catch (error) {
                this.publicationCommentaryError = (error && error.message) ? error.message : 'Commentary could not be created.';
            } finally {
                this.publicationCommentarySubmitting = false;
            }
        },
        // 0.9.308 — Publication Multi-Placement Visibility. Mirrors
        // refreshPublicationCommentaries() exactly, one capability over
        // (see this file's own header, "no new command needed... a
        // thin injected command"). A no-op — `publicationPlacements`
        // reset to `[]` — whenever there is no `publication` or no
        // `getPublicationPlacementsCommand`. A FAILED read leaves
        // `publicationPlacements` exactly as it was (never wiped to
        // `[]`) and only sets `publicationPlacementsError` — this is
        // the entire mechanism that keeps NO_PLACEMENTS (`[]`, no error)
        // distinguishable from DISCOVERY_FAILED (an error, prior list
        // untouched); see this file's own header, "the critical
        // semantic question." Rendered in WHATEVER order the command
        // returns, verbatim — this method performs no `sort()`, dedup,
        // or "latest" reduction of its own — see this file's own header,
        // "preserve all three records."
        refreshPublicationPlacements() {
            const publication = this.publication;
            if (!publication || !this.getPublicationPlacementsCommand) {
                this.publicationPlacements = [];
                this.publicationPlacementsError = null;
                return;
            }
            try {
                const placements = this.getPublicationPlacementsCommand(publication.id);
                this.publicationPlacements = Array.isArray(placements) ? placements : [];
                this.publicationPlacementsError = null;
            } catch (error) {
                this.publicationPlacementsError = 'Placements could not be loaded.';
            }
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

            <!-- 0.9.308 — Publication Multi-Placement Visibility. Read-only:
                 renders whatever getPublicationPlacementsCommand returns,
                 nothing more — no "Focus"/"Move"/"Remove" action per row
                 (see this file's own header, "one thing I would not do
                 yet"; ui/components/PlacementInfoPanel.js already owns
                 those actions for the SINGLE active placement). Rendered
                 only when a caller supplied getPublicationPlacementsCommand,
                 mirroring every other optional capability section in this
                 file. Every placement this Publication has is shown —
                 never deduplicated, never reduced to "the latest one"
                 (unlike placementInfo/activePlacementInfo above, which
                 IS that reduction) — see this file's own header, "don't
                 collapse multiple placements." -->
            <div v-if="getPublicationPlacementsCommand" class="own-publication-placements">
                <h5 class="own-publication-placements-title">Placements ({{ publicationPlacements.length }})</h5>

                <!-- DISCOVERY_FAILED — a genuine read failure, distinct
                     from NO_PLACEMENTS below (see refreshPublicationPlacements()'s
                     own header). Rendered instead of the list/empty-state
                     branches, mirroring publicationCommentaryError's own
                     precedence one capability over. -->
                <p v-if="publicationPlacementsError" class="own-publication-placements-error">{{ publicationPlacementsError }}</p>

                <!-- NO_PLACEMENTS — an honest, intentional empty state,
                     never an error and never indistinguishable from a
                     genuine read failure above (which sets
                     publicationPlacementsError, not this branch). -->
                <p v-else-if="!publicationPlacements.length" class="own-publication-placements-empty">
                    This Publication has not been placed anywhere yet.
                </p>
                <ul v-else class="own-publication-placements-list">
                    <!-- Rendered in EXACTLY the order publicationPlacements
                         already holds — no sort, dedup, "latest," or
                         ranking of any kind (see this file's own header).
                         A single placement (length === 1) renders through
                         this SAME v-for, never a separate "singleton"
                         branch. placementId is a stable, unique key
                         regardless of display order. -->
                    <li
                        v-for="placement in publicationPlacements"
                        :key="placement.placementId"
                        class="own-publication-placement-entry"
                    >
                        <dl class="own-publication-placement-detail">
                            <dt>Position</dt>
                            <dd>{{ placement.position.x.toFixed(1) }}, {{ placement.position.y.toFixed(1) }}, {{ placement.position.z.toFixed(1) }}</dd>
                            <dt>Revision</dt>
                            <dd>{{ placement.revision }}</dd>
                            <dt v-if="placement.owner">Owner</dt>
                            <dd v-if="placement.owner">{{ placement.owner }}</dd>
                        </dl>
                    </li>
                </ul>
            </div>

            <!-- 0.9.198 — Publication Unpublish/Retract UI Action.
                 Retracts THIS Publication from the publication-facing
                 catalog — never a placement, the Document, or any
                 Snapshot/Nostr/Arweave material (see this file's own
                 header). Rendered only when a caller supplied an
                 unpublishCommand. Disabled whenever there is no
                 publication to unpublish — no confirmation dialog, no
                 separate "…ing" label, since retraction is local and
                 synchronous, unlike Distribute/Discover above. -->
            <button
                v-if="unpublishCommand"
                type="button"
                class="action-btn own-publication-unpublish-action"
                :disabled="!publication"
                @click="unpublishOwnPublication"
            >Unpublish</button>

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

            <!-- 0.9.215 — Snapshot Export Capability Integration.
                 Reachable with zero connected peers and an empty World
                 Encounters panel, the identical restraint Distribute
                 Snapshot above already holds — see this file's own
                 header. Rendered only when a caller supplied an
                 exportSnapshotCommand. Disabled whenever there is no
                 local Publication yet, or a call is already in flight.
                 Deliberately no file save, download, or copy-to-clipboard
                 here: this milestone exposes the existing export
                 capability and its result's own identity facts, not a
                 product decision about how the exported package reaches
                 the user — see docs/Roadmap.md's own 0.9.215 entry. -->
            <button
                v-if="exportSnapshotCommand"
                type="button"
                class="action-btn own-publication-export-action"
                :disabled="!publication || snapshotExportExecuting"
                @click="exportOwnSnapshot"
            >{{ snapshotExportExecuting ? 'Exporting…' : 'Export Snapshot' }}</button>

            <p v-if="snapshotExportError" class="own-publication-export-error">{{ snapshotExportError }}</p>
            <dl v-else-if="snapshotExportResult" class="own-publication-export-detail">
                <dt>Publication</dt>
                <dd>{{ snapshotExportResult.publicationId }}</dd>
                <dt>Content hash</dt>
                <dd>{{ snapshotExportResult.contentHash }}</dd>
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

            <!-- 0.9.172 — Decentralized Snapshot Position Claim Consumption.
                 An independent, EXPLICIT action between "Materialize
                 Selected Snapshot" and "Place Materialized Snapshot" below
                 — never automatic, never a byproduct of selection,
                 resolution, or materialization. See this file's own
                 header, "0.9.172." Disabled whenever there is no
                 selectedSnapshotCandidate or no publication — the two
                 facts the identity check itself needs. Synchronous — no
                 "…ing" label, since resolveSnapshotWorldPositionClaim()
                 performs no I/O. -->
            <button
                v-if="materializeSelectedSnapshotCommand"
                type="button"
                class="action-btn own-publication-selected-world-position-claim-action"
                :disabled="!selectedSnapshotCandidate || !publication"
                @click="useClaimedSnapshotPosition"
            >Use Claimed Position</button>

            <!-- A separate result from selectedSnapshotWorldPlacementResult
                 below. CLAIMED/ABSENT/MISMATCHED — see application/
                 SnapshotWorldPositionClaimOutcome.js's own header. Position
                 is rendered only on CLAIMED — a mismatched or absent claim
                 fabricates nothing. -->
            <dl v-if="selectedSnapshotWorldPositionClaimResult" class="own-publication-selected-world-position-claim-detail">
                <dt>Selected Snapshot Position Claim</dt>
                <dd>{{ selectedSnapshotWorldPositionClaimResult.outcome }}</dd>
                <template v-if="selectedSnapshotWorldPositionClaimResult.position">
                    <dt>Claimed Position</dt>
                    <dd>{{ selectedSnapshotWorldPositionClaimResult.position.x }}, {{ selectedSnapshotWorldPositionClaimResult.position.y }}, {{ selectedSnapshotWorldPositionClaimResult.position.z }}</dd>
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
                 no I/O. 0.9.172 — when a claim was consumed (CLAIMED), the
                 resulting placement borrows the claim's own position
                 instead of placementInfo; otherwise this button's own
                 behavior is unchanged. -->
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

            <!-- 0.9.248 — Publication Commentary UI Integration.
                 Rendered only when a caller supplied
                 getPublicationCommentariesCommand, mirroring every other
                 optional capability section in this file. Existing
                 commentary is shown for ANY publication (own or not —
                 CanCommentOnPublicationUseCase permits commenting on any
                 Publication that exists), never gated on 'publication'
                 being the local user's own; only the surface this panel
                 already happens to be is scoped to "my own." -->
            <div v-if="getPublicationCommentariesCommand" class="own-publication-commentary">
                <h5 class="own-publication-commentary-title">Commentary ({{ publicationCommentaries.length }})</h5>

                <p v-if="publicationCommentaryError" class="own-publication-commentary-error">{{ publicationCommentaryError }}</p>

                <!-- H — Empty state: an intentional message, never an
                     error, never indistinguishable from a genuine read
                     failure above (which sets publicationCommentaryError,
                     not this branch). -->
                <p v-if="!publicationCommentaries.length" class="own-publication-commentary-empty">No commentary yet.</p>
                <ul v-else class="own-publication-commentary-list">
                    <!-- Rendered in EXACTLY the order
                         publicationCommentaries already holds — see
                         refreshPublicationCommentaries()'s own header,
                         "never re-sorted here." commentaryId is a stable,
                         unique key regardless of display order. -->
                    <li
                        v-for="commentary in publicationCommentaries"
                        :key="commentary.commentaryId"
                        class="own-publication-commentary-entry"
                    >
                        <span class="own-publication-commentary-author">{{ commentary.authorIdentityId }}</span>
                        <p class="own-publication-commentary-content">{{ commentary.content }}</p>
                    </li>
                </ul>

                <!-- Sign-in-required state: shown instead of the compose
                     form whenever there is no viewerIdentityId — this
                     component never attempts creation, and never
                     reproduces AddPublicationCommentaryUseCase's own
                     identity resolution, to reach this decision; it only
                     reads the SAME already-computed session fact
                     ui/views/WorldView.js's own myIdentityId already is
                     — see this file's own header. -->
                <p v-if="addPublicationCommentaryCommand && !viewerIdentityId" class="own-publication-commentary-signin-hint">
                    Sign in to add commentary.
                </p>
                <form
                    v-else-if="addPublicationCommentaryCommand"
                    class="own-publication-commentary-form"
                    @submit.prevent="submitPublicationCommentary"
                >
                    <textarea
                        v-model="newCommentaryText"
                        class="own-publication-commentary-input"
                        :disabled="!publication || publicationCommentarySubmitting"
                        placeholder="Add a comment…"
                    ></textarea>
                    <button
                        type="submit"
                        class="action-btn own-publication-commentary-submit-action"
                        :disabled="!publication || !newCommentaryText.trim() || publicationCommentarySubmitting"
                    >{{ publicationCommentarySubmitting ? 'Posting…' : 'Post Comment' }}</button>
                </form>
            </div>
        </div>
    `
};
