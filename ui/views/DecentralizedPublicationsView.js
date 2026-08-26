import { reactive, ref, computed, onMounted, onBeforeUnmount, inject } from 'vue';
import { PeerLifecycleState } from '../../peer/PeerLifecycleState.js';
import { PublicationResolutionOutcome } from '../../application/PublicationResolutionOutcome.js';
import { resolvePublicationView, describePublicationOutcome, describeRetrieval } from '../../application/PublicationResolutionView.js';
import { AnchorVerificationOutcome } from '../../application/AnchorVerificationOutcome.js';
import { publicationEvidenceView, describeKnownEvidenceCount } from '../../application/PublicationEvidenceView.js';
import { ExternalAnchorCreationUiState } from '../../application/ExternalAnchorCreationUiState.js';
import { ExternalAnchorCreationOutcome } from '../../application/ExternalAnchorCreationOutcome.js';
import { describeCreationAttempt, describeCreationButtonLabel } from '../../application/PublicationAnchorCreationView.js';
import { createVerificationObservation } from '../../application/PublicationAnchorVerificationObservation.js';
import { deriveAnchorVerificationLifecycle, describeAnchorVerificationLifecycleNote } from '../../application/PublicationAnchorVerificationLifecycleView.js';
import { derivePublicationEvidenceConvergence } from '../../application/PublicationEvidenceConvergence.js';
import { publicationEvidenceConvergenceView } from '../../application/PublicationEvidenceConvergenceView.js';
import { publicationAnchorDetailView } from '../../application/PublicationAnchorDetailView.js';
import { describeEvidenceDiscoveryAttempt, describeDiscoveryButtonLabel } from '../../application/PublicationEvidenceDiscoveryView.js';
import { PublicationEvidenceDiscoveryUiState } from '../../application/PublicationEvidenceDiscoveryUiState.js';
import { describeAnchorKnowledge } from '../../application/PublicationAnchorKnowledgeView.js';
import { snapshotPlacementView, describeKnownPlacementCount } from '../../application/SnapshotPlacementView.js';
import { publicationSnapshotPlacementDetailView } from '../../application/PublicationSnapshotPlacementDetailView.js';
import { SnapshotPlacementResolutionOutcome } from '../../application/SnapshotPlacementResolutionOutcome.js';
import { derivePublicationSnapshotPlacementConvergence } from '../../application/PublicationSnapshotPlacementConvergence.js';
import { publicationSnapshotPlacementConvergenceView } from '../../application/PublicationSnapshotPlacementConvergenceView.js';
import { describePlacementKnowledge } from '../../application/PublicationSnapshotPlacementKnowledgeView.js';
import { SnapshotPlacementCreationUiState } from '../../application/SnapshotPlacementCreationUiState.js';
import { SnapshotPlacementCreationOutcome } from '../../application/SnapshotPlacementCreationOutcome.js';
import { describeCreationAttempt as describePlacementCreationAttempt, describeCreationButtonLabel as describePlacementCreationButtonLabel } from '../../application/SnapshotPlacementCreationView.js';
import { createResolutionObservation } from '../../application/SnapshotPlacementResolutionObservation.js';
import { deriveSnapshotPlacementLifecycle, describeSnapshotPlacementLifecycleNote } from '../../application/SnapshotPlacementLifecycleView.js';
import { describePublicationDecentralization, describeDecentralizationRelationshipContrast } from '../../application/PublicationDecentralizationView.js';
import { describePublicationReplicaKnowledge } from '../../application/PublicationReplicaKnowledgeView.js';
import { describePublicationReplicaKnowledgeDetail, describeAcquisitionBreakdown } from '../../application/PublicationReplicaKnowledgeDetailView.js';
import { describeSynchronizationAttempt, describeSynchronizationButtonLabel } from '../../application/PublicationKnowledgeSynchronizationView.js';
import { PublicationKnowledgeSynchronizationUiState } from '../../application/PublicationKnowledgeSynchronizationUiState.js';
import { LocalSnapshotContentAvailabilityOutcome } from '../../application/LocalSnapshotContentAvailabilityOutcome.js';
import { describeLocalSnapshotContentAvailability, describeAvailabilityCheckButtonLabel } from '../../application/LocalSnapshotContentAvailabilityView.js';
import { SnapshotContentMaterializationUiState } from '../../application/SnapshotContentMaterializationUiState.js';
import { describeMaterializationAttempt, describeMaterializationButtonLabel } from '../../application/SnapshotContentMaterializationView.js';
import { SnapshotPlacementMaterializationUiState } from '../../application/SnapshotPlacementMaterializationUiState.js';
import { describePlacementMaterializationAttempt, describePlacementMaterializationButtonLabel } from '../../application/SnapshotPlacementMaterializationView.js';
import { SnapshotPeerMaterializationUiState } from '../../application/SnapshotPeerMaterializationUiState.js';
import { describePeerMaterializationAttempt, describePeerMaterializationButtonLabel } from '../../application/SnapshotPeerMaterializationView.js';
import { PeerSnapshotMaterializationOutcome } from '../../application/PeerSnapshotMaterializationOutcome.js';
import { SnapshotContentTransferOutcome } from '../../application/SnapshotContentTransferOutcome.js';
import { SnapshotPlacementMaterializationOutcome } from '../../application/SnapshotPlacementMaterializationOutcome.js';
import { StoreSnapshotContentOutcome } from '../../application/StoreSnapshotContentOutcome.js';
import { createSnapshotMaterializationAttempt } from '../../application/SnapshotMaterializationAttempt.js';
import { describeLocalSnapshotMaterializationSource } from '../../application/SnapshotMaterializationView.js';
import { appendSnapshotMaterializationHistoryEntry, describeSnapshotMaterializationSourceCounts } from '../../application/SnapshotMaterializationHistory.js';
import { describeSnapshotMaterializationHistory } from '../../application/SnapshotMaterializationHistoryView.js';

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
//
// 0.8.11 — Explicit External Anchoring UX. Each entry's "External
// Evidence" section now also offers a "Create <type> Anchor" control per
// application/PublicationAnchorCreationCoordinator.js#availableAnchorTypes()
// — the first UI consumer of the orchestration 0.8.8-0.8.10 built with no
// UI consumer at all (see each of those milestones' own "Deliberately
// excluded" lists). Discovery, creation, and verification stay three
// genuinely separate actions, over three separate collaborators, exactly
// as 0.8.3 already established for the first two: opening this page,
// listing known evidence, and toggling the evidence list open never
// trigger a creation OR a verification; clicking "Create <type> Anchor"
// triggers exactly one external recording attempt and NEVER an automatic
// verification of what it just created (the resulting anchor lands in
// the ordinary evidence list below, "Not yet verified," exactly like any
// other cataloged anchor); clicking "Verify Evidence" remains its own
// separate, unchanged 0.8.3 action. See application/
// PublicationAnchorCreationView.js's own header and docs/Principles.md,
// "External Anchoring Is An Explicit User Action (0.8.11)."
//
// 0.8.12 — External Anchor Lifecycle & Stale Evidence Semantics. Each
// entry now also keeps `entry.verificationHistory` — every application/
// PublicationAnchorVerificationObservation.js this replica has made for
// one anchor THIS SESSION, appended to rather than overwritten. Clicking
// "Verify Evidence"/"Verify Again" still shows the SAME badge/label it
// always has (application/PublicationEvidenceView.js, unchanged); the
// only new thing on screen is one optional extra sentence — application/
// PublicationAnchorVerificationLifecycleView.js#
// describeAnchorVerificationLifecycleNote() — that appears only when the
// most recent check came back PROOF_UNAVAILABLE after an EARLIER check,
// this session, reached VALID. It never says "invalid" or "revoked," and
// it never appears for an anchor this replica has only ever checked
// once. See docs/Principles.md, "A Verification Result Describes What
// Can Be Established Now; It Does Not Rewrite The Historical Claim Being
// Verified (0.8.12)."
//
// 0.8.13 — Multi-Evidence Comparison & Conflict UX. Each entry now also
// derives a "Content binding" overview from application/
// PublicationEvidenceConvergence.js#derivePublicationEvidenceConvergence()
// (0.8.6, unchanged) shaped for the screen by application/
// PublicationEvidenceConvergenceView.js (new): how many DISTINCT content
// hashes are claimed by this entry's known anchors, how many anchors
// claim each one, and whether those claims conflict. This answers "how
// does this evidence relate to itself?" — a question the per-anchor
// evidence list below already let a person answer by hand, one card at a
// time, but never stated directly. Shown only inside the same "Show
// Evidence" disclosure the per-anchor list already uses, and computed
// fresh every time `loadEvidence()`/`verifyAnchor()` already run —
// nothing new is stored, and nothing here ever ranks one content-hash
// group over another. See docs/Principles.md, "Evidence Comparison Is
// Not Adjudication (0.8.13)."
//
// 0.8.14 — External Evidence Inspection & Locator UX. Each anchor card
// now also offers "Inspect Evidence," alongside the existing "Verify
// Evidence"/"Verify Again" — two buttons that mean completely different
// things. Clicking "Inspect Evidence" calls ONLY application/
// PublicationAnchorDetailView.js#publicationAnchorDetailView() (a pure,
// synchronous reshaping of the anchor this replica already has in
// memory) and, separately, looks the anchor's own `anchorType` up in the
// injected `externalAnchorEvidenceViewRegistry` for an OPTIONAL,
// anchorType-specific presentation (application/
// ExternalAnchorEvidenceViewRegistry.js) — never application/
// ExternalAnchorVerifier.js, never the network, never the catalog.
// `entry.inspections` is ephemeral per-anchor UI state, exactly like
// `entry.verifications`/`entry.creationAttempts` above — never read from
// or written to anything durable. See application/
// PublicationAnchorDetailView.js's own header and docs/Principles.md,
// "Inspection Is Observation; Verification Is An Explicit Operation
// (0.8.14)."
// 0.8.16 — Evidence Synchronization UX & Explicit Historical Discovery.
// Each entry's "External Evidence" section now also offers an explicit
// "Discover from Peers" action — the first UI consumer of application/
// PublicationAnchorDiscoveryCoordinator.js's own 0.8.5 machinery, which
// built with no UI consumer at all (see that milestone's own
// docs/Roadmap.md entry: "Provided here for a future UI to call"), now
// finally wired through the thin application-facing layer application/
// PublicationEvidenceDiscoveryCoordinator.js adds above it. Opening this
// page, listing known evidence, or expanding "Show Evidence" NEVER
// triggers a discovery call — see this file's own onMounted()/
// refreshList(), unchanged by this milestone. Only an explicit
// "Discover from Peers" click does, exactly the same restraint 0.8.11
// already holds for "Create <type> Anchor" and 0.8.3 already holds for
// "Verify Evidence." `entry.discoveryAttempt` is ephemeral per-entry UI
// state, exactly like `entry.creationAttempts`/`entry.verifications`
// above — never read from or written to anything durable, and never
// itself a verification: a discovered anchor lands in the ordinary
// evidence list below exactly like any other cataloged anchor, "Not yet
// verified," until a person separately clicks "Verify Evidence" on it.
// See application/PublicationEvidenceDiscoveryCoordinator.js's own
// header and docs/Principles.md, "Discovery Is Not Verification, And
// 'No New Evidence' Is Not 'No Evidence' (0.8.16)."
//
// 0.8.20 — Snapshot Placement Inspection & Explicit Resolution UX. Each
// entry now also shows a "Snapshot Placements" section, deliberately
// separate from "External Evidence" above — a placement (core/
// PublicationSnapshotPlacement.js, 0.8.18) and an anchor (core/
// PublicationAnchor.js, 0.8.0) answer two different questions ("where
// can I retrieve this, right now" vs. "did an external system record
// this, at some point"), and this page keeps that distinction visible
// rather than merging both into one shared "evidence" list. Every
// placement this replica has cataloged for a publication is discovered
// the moment the list itself loads (application/
// SnapshotPlacementResolutionCoordinator.js#discover(), a synchronous
// catalog read with no network access) — opening this page never calls
// application/SnapshotPlacementResolver.js. "Inspect Placement" is a
// second, separate, purely local action — application/
// PublicationSnapshotPlacementDetailView.js#
// publicationSnapshotPlacementDetailView() plus an OPTIONAL storage-
// specific application/SnapshotPlacementViewRegistry.js adapter, exactly
// mirroring "Inspect Evidence" (0.8.14) one axis over. Only an explicit
// "Resolve Snapshot" click ever calls application/
// SnapshotPlacementResolutionCoordinator.js#resolve() — a resolution
// result lives only in this component's own `entry.resolutions`,
// ephemeral session state, never written back into application/
// LocalPublicationSnapshotPlacementCatalog.js or the placement itself.
// See application/SnapshotPlacementView.js's own header and
// docs/Principles.md, "Resolving A Placement Observes Present
// Availability; It Does Not Rewrite The Placement Claim (0.8.20)."
// 0.8.23 — Multi-Placement Convergence & Relationship UX. Each entry's
// "Snapshot Placements" section now also derives a "Placement
// relationships" overview from application/
// PublicationSnapshotPlacementConvergence.js#
// derivePublicationSnapshotPlacementConvergence() shaped for the screen
// by application/PublicationSnapshotPlacementConvergenceView.js — the
// identical idea 0.8.13 already applied to "External Evidence" above
// ("Content binding"), applied here to placements: how many placements
// are known, across how many storage backends and distinct locations,
// and whether their claimed content hashes agree. Deliberately a
// SEPARATE card from "Content binding" — an anchor answers "what
// external evidence claims do I know?" while a placement answers "what
// locations do I know that claim this snapshot is retrievable?," and
// this page keeps that distinction visible exactly as it already keeps
// "External Evidence" and "Snapshot Placements" themselves separate
// sections (0.8.20). Recomputed fresh every time `loadPlacements()`
// already runs — never once threaded through `entry.resolutions`: see
// `loadPlacements()`'s own comment below and docs/Principles.md,
// "Multi-Placement Convergence Is Independent Of Resolution Observation
// (0.8.23)."
// 0.8.24 — Snapshot Placement Provenance & Observation Boundary. "Inspect
// Placement" now also shows a "Local Knowledge" section, mirroring the
// identical section 0.8.17 already added to "Inspect Evidence" one axis
// over — see `togglePlacementInspect()`'s own comment below. Reading it
// is a purely local, synchronous `placementKnowledgeStore.get()` call,
// computed alongside the existing `publicationSnapshotPlacementDetailView()`
// call, under the identical "Inspection Is Observation" restraint 0.8.14/
// 0.8.20 already established for that call.
//
// 0.8.26 — Snapshot Placement Lifecycle & Stale Availability Semantics.
// Each entry now also keeps `entry.resolutionHistory` — every
// application/SnapshotPlacementResolutionObservation.js this replica has
// made for one placement THIS SESSION, appended to rather than
// overwritten, the placement-side sibling of `entry.verificationHistory`
// (0.8.12) one axis over. Clicking "Resolve Snapshot"/"Resolve Again"
// still shows the SAME badge/label it always has (application/
// SnapshotPlacementView.js, unchanged); the only new thing on screen is
// one optional extra sentence — application/
// SnapshotPlacementLifecycleView.js#describeSnapshotPlacementLifecycleNote()
// — that appears only when the most recent resolution came back
// UNAVAILABLE after an EARLIER resolution, this session, reached
// RESOLVED. It never says "invalid" or "corrupted," it never appears for
// a placement this replica has only ever resolved once, and it never
// appears for a HASH_MISMATCH — a store answering with the wrong bytes
// stays its own definite finding, never softened by an earlier success.
// See docs/Principles.md, "A Resolution Result Describes Whether Bytes
// Can Be Retrieved Now; It Does Not Rewrite The Placement Claim
// (0.8.26)."
//
// 0.8.31 — Replica Knowledge Provenance & Synchronization Inspection. The
// "Decentralization" card (0.8.27) now also offers a "Replica Knowledge"
// disclosure — a claim-level INVENTORY, never a verdict, of exactly how
// this replica came to know each anchor/placement it already lists above.
// `entry.replicaKnowledgeDetail` is application/
// PublicationReplicaKnowledgeDetailView.js's own result, recomputed
// (never accumulated) by `recomputeReplicaKnowledgeDetail()` every time
// `loadEvidence()`/`loadPlacements()`/`verifyAnchor()`/`resolvePlacement()`
// already run — the identical "always current, never stale" restraint
// `recomputeDecentralization()` already holds one card above. Opening
// this disclosure never itself reads a store or calls a coordinator; only
// those four existing actions do, exactly as before this milestone.
// `entry.replicaKnowledgeExpanded` gates VISIBILITY only, mirroring
// `evidenceExpanded`/`placementsExpanded` above — the underlying
// computation is always fresh whether or not a person has ever opened it.
// See application/PublicationReplicaKnowledgeDetailView.js's own header
// and docs/Principles.md, "Replica Knowledge Explains What Is Known And
// How It Was Acquired; It Does Not Judge What Should Be Trusted (0.8.31)."
//
// 0.8.33 — Local Snapshot Content Availability & Integrity UX. Each entry
// now also offers a "Local Snapshot" section, deliberately separate from
// "Decentralization" above: that card describes DISTRIBUTED claims this
// replica knows about (evidence, placements); this one describes a fact
// about THIS replica's own present content state, computed by application/
// CheckLocalSnapshotContentAvailabilityUseCase.js reading ONLY the local
// content/ContentStore.js — never a placement, never the network. Opening
// this page, expanding any disclosure, or synchronizing with peers NEVER
// triggers a check; only an explicit "Check Local Snapshot" click does,
// the identical restraint 0.8.20/0.8.3 already hold for "Resolve
// Snapshot"/"Verify Evidence". `entry.localSnapshotAvailability` is
// ephemeral session state, exactly like `entry.resolutions` above — never
// read from or written to anything durable, and never itself a
// materialization action: a completed check reports what is already true
// of this replica's own storage right now; it never imports, retrieves,
// or writes a single byte. See application/
// CheckLocalSnapshotContentAvailabilityUseCase.js's own header and
// docs/Principles.md, "Local Content Availability Is An Observation, Not
// A Verdict (0.8.33)."
//
// 0.8.38 — Snapshot Materialization History & Source Inspection. "Local
// Snapshot" now also offers a "Materialization History" disclosure, one
// axis past 0.8.36's own "Source: …" line: where that line names only
// the SINGLE most recent action that actually stored bytes, `entry.
// materializationHistory` is the full ORDERED sequence of every "Import
// Snapshot"/"Materialize Snapshot"/"Get Snapshot from Peer" attempt this
// entry has seen THIS SESSION that actually reached application/
// StoreSnapshotContentUseCase.js — appended to by `recordMaterializationHistoryEntry()`
// alongside each of the three existing recording call sites, never a
// fourth action of its own. Includes a rejected HASH_MISMATCH attempt,
// which `lastMaterializationAttempt` never records at all. Deliberately
// never ranks, scores, or picks a "preferred" source out of the history
// it narrates — see application/SnapshotMaterializationHistoryView.js's
// own header and docs/Principles.md, "Materialization History Describes
// Byte Acquisition, Not Source Trust (0.8.38)."
//
// 0.8.35 — Explicit Placement-Backed Snapshot Materialization. Each
// placement card in "Snapshot Placements" below now also offers
// "Materialize Snapshot," alongside the existing "Inspect Placement"/
// "Resolve Snapshot" (0.8.20) — a THIRD, genuinely separate action, never
// triggered by opening this page, expanding "Show Placements," inspecting
// a placement, or resolving one. Only this explicit click ever calls
// application/SnapshotPlacementMaterializationCoordinator.js#materialize(),
// which runs the SAME resolution "Resolve Snapshot" already runs
// (application/SnapshotPlacementResolutionCoordinator.js, unchanged) and,
// only once it succeeds, writes the retrieved bytes into this replica's
// own content/ContentStore.js — the missing bridge between "where can this
// be retrieved from" (0.8.20) and "does this replica actually possess the
// bytes" (0.8.33), named directly in 0.8.34's own docs/Roadmap.md entry as
// this milestone. `entry.materializations` is keyed by placementId,
// ephemeral session state exactly like `entry.resolutions` above — never
// read from or written to anything durable, and never itself resolves or
// modifies the placement (application/
// MaterializeSnapshotFromPlacementUseCase.js never touches it). Choosing
// WHICH placement to materialize from is always the person's own explicit
// click on ONE specific card — this page never ranks placements, never
// tries a second one after the first fails, and offers no "best source."
// See application/SnapshotPlacementMaterializationCoordinator.js's own
// header and docs/Principles.md, "Placement Resolution Observes Present
// Availability; Materialization Turns It Into Possession (0.8.35)."
const LOCAL_SNAPSHOT_AVAILABILITY_BADGE_CLASSES = {
    [LocalSnapshotContentAvailabilityOutcome.AVAILABLE]: 'peer-badge--authenticated',
    [LocalSnapshotContentAvailabilityOutcome.NOT_AVAILABLE]: 'peer-badge--unchecked',
    [LocalSnapshotContentAvailabilityOutcome.CONTENT_HASH_MISMATCH]: 'peer-badge--failed'
};

// 0.8.34 — Explicit Snapshot Materialization UX. Reuses the identical
// .peer-badge palette every sibling *CreationUiState above already draws
// from — IMPORTED and ALREADY_AVAILABLE both read as "good" (green): a
// duplicate import is never a failure, exactly as application/
// SnapshotContentTransferOutcome.js's own ALREADY_STORED header already
// states. REJECTED reads as a definite rejection (red), exactly like
// ExternalAnchorCreationUiState.REJECTED — the package was read and its
// own bytes demonstrably did not match its own claimed hash. UNAVAILABLE
// reads as "honestly inconclusive" (amber) — nothing was ever attempted,
// whether because the input was malformed or because application/
// SnapshotContentMaterializationCoordinator.js#import() itself threw.
const MATERIALIZATION_BADGE_CLASSES = {
    [SnapshotContentMaterializationUiState.IMPORTING]: 'peer-badge--pending',
    [SnapshotContentMaterializationUiState.IMPORTED]: 'peer-badge--authenticated',
    [SnapshotContentMaterializationUiState.ALREADY_AVAILABLE]: 'peer-badge--authenticated',
    [SnapshotContentMaterializationUiState.UNAVAILABLE]: 'peer-badge--pending',
    [SnapshotContentMaterializationUiState.REJECTED]: 'peer-badge--failed'
};

// 0.8.35 — Explicit Placement-Backed Snapshot Materialization. The
// placement-backed sibling of MATERIALIZATION_BADGE_CLASSES above, one
// axis over: STORED and ALREADY_AVAILABLE both read as "good" (green) —
// a duplicate materialization is never a failure. UNAVAILABLE reads as
// "honestly inconclusive" (amber) — the identical outcome "Resolve
// Snapshot" itself already shows amber for STORE_UNAVAILABLE/
// CONTENT_UNAVAILABLE (see PLACEMENT_BADGE_CLASSES above). HASH_MISMATCH
// and INVALID_PLACEMENT both read as definite rejections (red) — a
// placement whose own bytes, or whose own signature, demonstrably did
// not check out.
const PLACEMENT_MATERIALIZATION_BADGE_CLASSES = {
    [SnapshotPlacementMaterializationUiState.MATERIALIZING]: 'peer-badge--pending',
    [SnapshotPlacementMaterializationUiState.STORED]: 'peer-badge--authenticated',
    [SnapshotPlacementMaterializationUiState.ALREADY_AVAILABLE]: 'peer-badge--authenticated',
    [SnapshotPlacementMaterializationUiState.UNAVAILABLE]: 'peer-badge--pending',
    [SnapshotPlacementMaterializationUiState.HASH_MISMATCH]: 'peer-badge--failed',
    [SnapshotPlacementMaterializationUiState.INVALID_PLACEMENT]: 'peer-badge--failed'
};

// 0.8.37 — Explicit Peer Snapshot Content Transfer. The peer-backed
// sibling of PLACEMENT_MATERIALIZATION_BADGE_CLASSES above, one axis over
// — STORED and ALREADY_AVAILABLE both read as "good" (green); UNAVAILABLE
// reads as "honestly inconclusive" (amber), since a peer not answering in
// time is never distinguishable from a peer that simply does not hold the
// bytes (see application/PeerSnapshotMaterializationOutcome.js's own
// header); HASH_MISMATCH reads as a definite rejection (red).
const PEER_MATERIALIZATION_BADGE_CLASSES = {
    [SnapshotPeerMaterializationUiState.REQUESTING]: 'peer-badge--pending',
    [SnapshotPeerMaterializationUiState.STORED]: 'peer-badge--authenticated',
    [SnapshotPeerMaterializationUiState.ALREADY_AVAILABLE]: 'peer-badge--authenticated',
    [SnapshotPeerMaterializationUiState.UNAVAILABLE]: 'peer-badge--pending',
    [SnapshotPeerMaterializationUiState.HASH_MISMATCH]: 'peer-badge--failed'
};

const PLACEMENT_BADGE_CLASSES = {
    [SnapshotPlacementResolutionOutcome.RESOLVED]: 'peer-badge--authenticated',
    [SnapshotPlacementResolutionOutcome.STORE_UNAVAILABLE]: 'peer-badge--pending',
    [SnapshotPlacementResolutionOutcome.CONTENT_UNAVAILABLE]: 'peer-badge--pending',
    [SnapshotPlacementResolutionOutcome.INVALID_ENVELOPE]: 'peer-badge--failed',
    [SnapshotPlacementResolutionOutcome.INVALID_SIGNATURE]: 'peer-badge--failed',
    [SnapshotPlacementResolutionOutcome.CONTENT_HASH_MISMATCH]: 'peer-badge--failed'
};

const DISCOVERY_BADGE_CLASSES = {
    [PublicationEvidenceDiscoveryUiState.DISCOVERING]: 'peer-badge--pending',
    [PublicationEvidenceDiscoveryUiState.DISCOVERED]: 'peer-badge--authenticated',
    [PublicationEvidenceDiscoveryUiState.NO_NEW_EVIDENCE]: 'peer-badge--unchecked',
    [PublicationEvidenceDiscoveryUiState.UNAVAILABLE]: 'peer-badge--pending'
};

// 0.8.30 — Explicit Replica Knowledge Synchronization.
const SYNCHRONIZATION_BADGE_CLASSES = {
    [PublicationKnowledgeSynchronizationUiState.SYNCHRONIZING]: 'peer-badge--pending',
    [PublicationKnowledgeSynchronizationUiState.SYNCHRONIZED]: 'peer-badge--authenticated',
    [PublicationKnowledgeSynchronizationUiState.NO_NEW_CLAIMS]: 'peer-badge--unchecked',
    [PublicationKnowledgeSynchronizationUiState.UNAVAILABLE]: 'peer-badge--pending'
};

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

// 0.8.13 — Multi-Evidence Comparison & Conflict UX. Display-only
// truncation for a content-hash group's heading, mirroring shortId()'s
// own restraint immediately above: the FULL contentHash is still shown
// verbatim, monospace, elsewhere on each anchor's own evidence card
// (unchanged since 0.8.3) — this shortened form exists only so several
// groups can be told apart at a glance in the "Content binding" summary.
function shortHash(contentHash) {
    if (!contentHash) return 'an unknown hash';
    return contentHash.length > 18 ? `${contentHash.slice(0, 10)}…${contentHash.slice(-6)}` : contentHash;
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

// 0.8.11 — Explicit External Anchoring UX. Reuses the identical
// .peer-badge palette EVIDENCE_BADGE_CLASSES above already draws from —
// CREATED reads as "good" (green), exactly like VALID; REJECTED reads as
// a definite rejection (red), exactly like INVALID_PROOF (the external
// system was reached and said no); UNAVAILABLE reads as "honestly
// inconclusive" (amber), exactly like PROOF_UNAVAILABLE (nothing
// external was reached at all, whether because of the publisher or
// because application/PublicationAnchorCreationCoordinator.js#create()
// itself threw — see application/PublicationAnchorCreationView.js's own
// header on why those two share a state). CREATING gets the same amber
// as any other in-flight check.
const CREATION_BADGE_CLASSES = {
    [ExternalAnchorCreationUiState.CREATING]: 'peer-badge--pending',
    [ExternalAnchorCreationUiState.CREATED]: 'peer-badge--authenticated',
    [ExternalAnchorCreationUiState.REJECTED]: 'peer-badge--failed',
    [ExternalAnchorCreationUiState.UNAVAILABLE]: 'peer-badge--pending'
};

// 0.8.25 — Explicit Snapshot Placement Creation UX. The placement-side
// counterpart of CREATION_BADGE_CLASSES above, one axis over — CREATED
// reads as "good" (green), exactly like the anchor side; UNAVAILABLE
// reads as "honestly inconclusive" (amber), exactly like PROOF_UNAVAILABLE
// / anchor-side UNAVAILABLE. There is no REJECTED entry here — see
// application/SnapshotPlacementCreationUiState.js's own header on why
// that state does not exist on the placement side at all.
const PLACEMENT_CREATION_BADGE_CLASSES = {
    [SnapshotPlacementCreationUiState.CREATING]: 'peer-badge--pending',
    [SnapshotPlacementCreationUiState.CREATED]: 'peer-badge--authenticated',
    [SnapshotPlacementCreationUiState.UNAVAILABLE]: 'peer-badge--pending'
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
        const creationCoordinator = inject('publicationAnchorCreationCoordinator');
        // 0.8.16 — Evidence Synchronization UX & Explicit Historical
        // Discovery. Optional — absent here (e.g. a test harness that
        // never provides it), "Discover from Peers" simply never renders,
        // the identical degrade-gracefully posture `creationCoordinator`
        // above already holds for `availableAnchorTypes`.
        const evidenceDiscoveryCoordinator = inject('publicationEvidenceDiscoveryCoordinator', null);
        // 0.8.30 — Explicit Replica Knowledge Synchronization. Optional —
        // absent here (e.g. a test harness that never provides it),
        // "Synchronize with Peers" simply never renders, the identical
        // degrade-gracefully posture `evidenceDiscoveryCoordinator` above
        // already holds.
        const knowledgeSynchronizationCoordinator = inject('publicationKnowledgeSynchronizationCoordinator', null);
        // 0.8.14 — External Evidence Inspection & Locator UX. Optional —
        // absent here (as in a test harness that never provides it),
        // "Inspect Evidence" still shows application/
        // PublicationAnchorDetailView.js's own generic shape; only the
        // anchorType-specific section is skipped, exactly as
        // `availableAnchorTypes` above degrades to an empty list with no
        // `creationCoordinator`.
        const evidenceViewRegistry = inject('externalAnchorEvidenceViewRegistry', null);
        // 0.8.17 — Evidence Provenance & Observation Boundary. Optional —
        // absent here (as in a test harness that never provides it),
        // "Inspect Evidence" simply shows no "Local Knowledge" section;
        // every other field of application/PublicationAnchorDetailView.js's
        // own shape is untouched. See `toggleInspect()`'s own comment
        // below.
        const anchorKnowledgeStore = inject('anchorKnowledgeStore', null);
        // 0.8.20 — Snapshot Placement Inspection & Explicit Resolution UX.
        // Optional — absent here (e.g. a test harness that never
        // provides it), "Snapshot Placements" simply never renders, the
        // identical degrade-gracefully posture `evidenceCoordinator`
        // above already holds.
        const placementResolutionCoordinator = inject('publicationSnapshotPlacementResolutionCoordinator', null);
        // Optional — absent here, "Inspect Placement" still shows
        // application/PublicationSnapshotPlacementDetailView.js's own
        // generic shape; only the storage-specific section is skipped,
        // exactly as `evidenceViewRegistry` above degrades for anchors.
        const placementViewRegistry = inject('snapshotPlacementViewRegistry', null);
        // 0.8.24 — Snapshot Placement Provenance & Observation Boundary.
        // Optional — absent here (as in a test harness that never
        // provides it), "Inspect Placement" simply shows no "Local
        // Knowledge" section, the identical degrade-gracefully posture
        // `anchorKnowledgeStore` above already holds.
        const placementKnowledgeStore = inject('placementKnowledgeStore', null);
        // 0.8.25 — Explicit Snapshot Placement Creation UX. Optional —
        // absent here (e.g. a test harness that never provides it), "Create
        // Placement" simply never renders, the identical degrade-gracefully
        // posture `creationCoordinator` above already holds for
        // `availableAnchorTypes`.
        const placementCreationCoordinator = inject('snapshotPlacementCreationCoordinator', null);
        // 0.8.33 — Local Snapshot Content Availability & Integrity UX.
        // Optional — absent here (e.g. a test harness that never provides
        // it), "Local Snapshot" simply never renders, the identical
        // degrade-gracefully posture `placementResolutionCoordinator`
        // above already holds.
        const localSnapshotContentAvailabilityUseCase = inject('localSnapshotContentAvailabilityUseCase', null);
        // 0.8.34 — Explicit Snapshot Materialization UX. Optional —
        // absent here (e.g. a test harness that never provides it),
        // "Import Snapshot" simply never renders, the identical
        // degrade-gracefully posture `localSnapshotContentAvailabilityUseCase`
        // immediately above already holds.
        const snapshotContentMaterializationCoordinator = inject('snapshotContentMaterializationCoordinator', null);
        // 0.8.35 — Explicit Placement-Backed Snapshot Materialization.
        // Optional — absent here (e.g. a test harness that never provides
        // it), "Materialize Snapshot" simply never renders on a placement
        // card, the identical degrade-gracefully posture
        // `placementResolutionCoordinator` above already holds for
        // "Resolve Snapshot".
        const snapshotPlacementMaterializationCoordinator = inject('snapshotPlacementMaterializationCoordinator', null);
        // 0.8.37 — Explicit Peer Snapshot Content Transfer. Optional —
        // absent here (e.g. a test harness that never provides it), "Get
        // Snapshot from Peer" simply never renders, the identical
        // degrade-gracefully posture `snapshotPlacementMaterializationCoordinator`
        // above already holds for "Materialize Snapshot".
        const snapshotPeerMaterializationCoordinator = inject('snapshotPeerMaterializationCoordinator', null);

        // 0.8.11 — Explicit External Anchoring UX. Every anchorType this
        // replica can currently ask to create evidence for, read ONCE at
        // setup (a synchronous, side-effect-free registry read — see
        // application/PublicationAnchorCreationCoordinator.js#
        // availableAnchorTypes() own header) rather than per publication;
        // which publishers exist is a property of this replica, not of
        // any one entry. Empty when no `creationCoordinator` was provided,
        // or when this replica has no publisher configured at all — in
        // either case no "Create Anchor" control is ever offered, exactly
        // as "Retrieve from Peers" already stays hidden with no
        // authenticated peer connected.
        const availableAnchorTypes = creationCoordinator ? creationCoordinator.availableAnchorTypes() : [];
        // 0.8.25 — Explicit Snapshot Placement Creation UX. The
        // placement-side counterpart of `availableAnchorTypes` above, one
        // axis over — every storage type this replica can currently ask
        // to place bytes onto, read ONCE at setup (application/
        // SnapshotPlacementCreationCoordinator.js#availableStorageTypes()
        // own header). Empty when no `placementCreationCoordinator` was
        // provided, or when this replica has no content store registered
        // at all — in either case no "Create Placement" control is ever
        // offered.
        const availableStorageTypes = placementCreationCoordinator ? placementCreationCoordinator.availableStorageTypes() : [];

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
                verifications: {},
                // 0.8.13 — Multi-Evidence Comparison & Conflict UX. The
                // derived structural relationship among THIS entry's own
                // `evidenceAnchors` — application/
                // PublicationEvidenceConvergence.js's own result, and
                // application/PublicationEvidenceConvergenceView.js's own
                // shaping of it. Recomputed, never accumulated, every
                // time `loadEvidence()`/`verifyAnchor()` already run —
                // ephemeral exactly like `evidence` immediately above.
                convergence: null,
                convergenceView: null,
                // 0.8.12 — External Anchor Lifecycle & Stale Evidence
                // Semantics. Keyed by anchorId, each value the ORDERED
                // list of every application/
                // PublicationAnchorVerificationObservation.js this replica
                // has made for that anchor THIS SESSION — appended to,
                // never overwritten, unlike `verifications` above (which
                // still holds only the latest result, exactly as 0.8.3
                // left it, feeding the unchanged badge/label). Ephemeral
                // for the lifetime of this page, exactly like
                // `verifications` and `creationAttempts` — never read
                // from or written to anything durable. See application/
                // PublicationAnchorVerificationObservation.js's own
                // header.
                verificationHistory: {},
                // 0.8.14 — External Evidence Inspection & Locator UX.
                // Keyed by anchorId; ephemeral for the lifetime of this
                // page, exactly like `verifications`/`verificationHistory`
                // above — never read from or written to anything durable,
                // and never touched by loadEvidence()/verifyAnchor(). See
                // toggleInspect()'s own comment below.
                inspections: {},
                // 0.8.16 — Evidence Synchronization UX & Explicit
                // Historical Discovery. A single ephemeral attempt object
                // for THIS entry — never keyed by anchorId, since
                // discovery asks about the whole publication at once, not
                // one anchor at a time. `null` until "Discover from
                // Peers" is clicked; see `discoverFromPeers()`'s own
                // comment below and application/
                // PublicationEvidenceDiscoveryView.js's own header on the
                // exact shape.
                discoveryAttempt: null,
                // 0.8.30 — Explicit Replica Knowledge Synchronization. A
                // single ephemeral attempt object for THIS entry, the
                // identical shape `discoveryAttempt` above holds — `null`
                // until "Synchronize with Peers" is clicked; see
                // `synchronizeWithPeers()`'s own comment below and
                // application/PublicationKnowledgeSynchronizationView.js's
                // own header on the exact shape.
                synchronizationAttempt: null,
                // 0.8.11 — Explicit External Anchoring UX. Keyed by
                // anchorType; ephemeral for the lifetime of this page,
                // exactly like `verifications` above — never read from or
                // written to anything durable. See application/
                // ExternalAnchorCreationUiState.js's own header.
                creationAttempts: {},
                // 0.8.20 — Snapshot Placement Inspection & Explicit
                // Resolution UX. `placements`/`placementsView` mirror
                // `evidenceAnchors`/`evidence` above exactly, one axis
                // over; `resolutions`/`placementInspections` mirror
                // `verifications`/`inspections` — every one of them
                // ephemeral for the lifetime of this page, never read
                // from or written to anything durable.
                placements: [],
                placementsView: null,
                placementsExpanded: false,
                resolutions: {},
                // 0.8.35 — Explicit Placement-Backed Snapshot
                // Materialization. Keyed by placementId, exactly like
                // `resolutions` immediately above — ephemeral for the
                // lifetime of this page, never read from or written to
                // anything durable, and never touched by loadPlacements()/
                // resolvePlacement(). See `materializePlacement()`'s own
                // comment below.
                materializations: {},
                // 0.8.26 — Snapshot Placement Lifecycle & Stale
                // Availability Semantics. Keyed by placementId, each
                // value the ORDERED list of every application/
                // SnapshotPlacementResolutionObservation.js this replica
                // has made for that placement THIS SESSION — appended to,
                // never overwritten, unlike `resolutions` above (which
                // still holds only the latest result, exactly as 0.8.20
                // left it, feeding the unchanged badge/label). Ephemeral
                // for the lifetime of this page, exactly like
                // `resolutions` and `verificationHistory` above — never
                // read from or written to anything durable. See
                // application/SnapshotPlacementResolutionObservation.js's
                // own header.
                resolutionHistory: {},
                placementInspections: {},
                // 0.8.23 — Multi-Placement Convergence & Relationship UX.
                // The derived structural relationship among THIS entry's
                // own `placements` — application/
                // PublicationSnapshotPlacementConvergence.js's own
                // result, and application/
                // PublicationSnapshotPlacementConvergenceView.js's own
                // shaping of it. Recomputed, never accumulated, every
                // time `loadPlacements()` already runs — ephemeral
                // exactly like `placementsView` immediately above, and
                // NEVER recomputed from `entry.resolutions` — see
                // `loadPlacements()`'s own comment below.
                placementConvergence: null,
                placementConvergenceView: null,
                // 0.8.27 — Unified Publication Decentralization View. The
                // pure combination of THIS entry's own `convergenceView`
                // and `placementConvergenceView` above — application/
                // PublicationDecentralizationView.js's own reshaping,
                // never a new derivation. Recomputed by
                // `recomputeDecentralization()` whenever EITHER
                // `recomputeConvergence()` or `recomputePlacementConvergence()`
                // already runs, so it is always current regardless of
                // which of the two loads first. Never fed a lifecycle or
                // a knowledge/provenance record — see that file's own
                // header on why neither has a parameter here at all.
                decentralization: null,
                // 0.8.28 — Offline Publication Reconstruction & Replica
                // Knowledge. `entry.decentralization` above, plus exactly
                // one new fact: whether THIS replica has ever cataloged
                // the publication envelope itself. Recomputed alongside
                // `decentralization` — see `recomputeReplicaKnowledge()`
                // below.
                replicaKnowledge: null,
                // 0.8.31 — Replica Knowledge Provenance & Synchronization
                // Inspection. The claim-level sibling of `replicaKnowledge`
                // immediately above — application/
                // PublicationReplicaKnowledgeDetailView.js's own result,
                // recomputed by `recomputeReplicaKnowledgeDetail()`
                // alongside `loadEvidence()`/`loadPlacements()`/
                // `verifyAnchor()`/`resolvePlacement()`. `replicaKnowledgeExpanded`
                // gates only whether the "Replica Knowledge" disclosure is
                // open on screen, mirroring `evidenceExpanded`/
                // `placementsExpanded` below.
                replicaKnowledgeDetail: null,
                replicaKnowledgeExpanded: false,
                // 0.8.25 — Explicit Snapshot Placement Creation UX. Keyed
                // by storage type; ephemeral for the lifetime of this
                // page, exactly like `creationAttempts` above — never
                // read from or written to anything durable. See
                // application/SnapshotPlacementCreationUiState.js's own
                // header.
                placementCreationAttempts: {},
                // 0.8.33 — Local Snapshot Content Availability &
                // Integrity UX. A single ephemeral attempt object for
                // THIS entry — `null` until "Check Local Snapshot" is
                // clicked, then `{ checking: true }`, then application/
                // CheckLocalSnapshotContentAvailabilityUseCase.js#
                // execute()'s own resolved shape. Never read from or
                // written to anything durable, and never recomputed by
                // any of `loadEvidence()`/`loadPlacements()`/
                // `recomputeDecentralization()` above — a local content
                // check is its own explicit action, exactly like
                // `resolutions`/`verifications`.
                localSnapshotAvailability: null,
                // 0.8.34 — Explicit Snapshot Materialization UX. `materializationFormOpen`
                // gates only whether the file-picker/paste panel is on
                // screen — opening it never imports anything, mirroring
                // IdentityManagementView.js#showImportForm's own restraint.
                // `materializationImportText` is whatever a chosen file's
                // contents, or a person's own paste, currently holds — read
                // only when "Import Snapshot" is explicitly clicked.
                // `materializationAttempt` is a single ephemeral attempt
                // object for THIS entry, `null` until that click, mirroring
                // `localSnapshotAvailability` immediately above exactly.
                materializationFormOpen: false,
                materializationImportText: '',
                materializationAttempt: null,
                // 0.8.36 — Unified Explicit Snapshot Materialization
                // Sources. The most recent SUCCESSFUL application/
                // SnapshotMaterializationAttempt.js this entry has seen,
                // from EITHER "Import Snapshot" or "Materialize Snapshot"
                // — whichever explicit action most recently actually
                // stored bytes. `null` until one of them succeeds at
                // least once, in this browsing session. Never itself a
                // third action, never read by either action's own click
                // handler, and never persisted — see that file's own
                // header. Feeds only the shared "Local Snapshot" summary's
                // "Source: …" line below, alongside `localSnapshotAvailability`
                // above, which independently answers whether bytes are
                // present RIGHT NOW.
                lastMaterializationAttempt: null,
                // 0.8.37 — Explicit Peer Snapshot Content Transfer.
                // `peerMaterializationSelectedPeerId` is whichever
                // `retrievalPeers` connectionId a person has picked from
                // this entry's own dropdown — the person's own explicit
                // choice of PEER, never a peer this page selects, ranks,
                // or falls back through on their behalf.
                // `peerMaterializationAttempt` is a single ephemeral
                // attempt object for THIS entry, `null` until "Get
                // Snapshot from Peer" is explicitly clicked, mirroring
                // `materializationAttempt` above exactly, one axis over.
                peerMaterializationSelectedPeerId: '',
                peerMaterializationAttempt: null,
                // 0.8.38 — Snapshot Materialization History & Source
                // Inspection. The ORDERED, ephemeral sequence of every
                // application/SnapshotMaterializationAttempt.js this entry
                // has seen THIS SESSION from ANY of the three explicit
                // actions above, appended to by `recordMaterializationHistoryEntry()`
                // below — never overwritten, and never filtered down to
                // only the successful ones `lastMaterializationAttempt`
                // above already tracks. `materializationHistoryExpanded`
                // gates only whether the "Materialization History"
                // disclosure is on screen, mirroring
                // `replicaKnowledgeExpanded` above. See application/
                // SnapshotMaterializationHistory.js's own header.
                materializationHistory: [],
                materializationHistoryExpanded: false
            })));
            await Promise.all(entries.filter((entry) => !entry.view && !entry.checking).map(resolveEntry));
            entries.forEach(loadEvidence);
            entries.forEach(loadPlacements);
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
            recomputeConvergence(entry);
            recomputeReplicaKnowledgeDetail(entry);
        }

        // 0.8.13 — Multi-Evidence Comparison & Conflict UX. Re-derives
        // `entry.convergence`/`entry.convergenceView` from THIS entry's
        // own `evidenceAnchors` — never a second discovery call, never
        // touching application/ExternalAnchorVerifier.js itself.
        // `verificationByAnchorId` carries this replica's own already-
        // completed local observations (a "checking" in-flight
        // placeholder is never passed through as an outcome) purely so
        // application/PublicationEvidenceConvergence.js's own per-anchor
        // `verification` field stays populated alongside the structural
        // comparison — see that file's own header on why supplying it
        // can never change `contentBindingConflict`/`contentHashGroups`
        // themselves, which application/
        // PublicationEvidenceConvergenceView.js's own `contentGroups`/
        // `hasConflict` reflect unchanged either way.
        function recomputeConvergence(entry) {
            const verificationByAnchorId = {};
            for (const anchorId of Object.keys(entry.verifications)) {
                const result = entry.verifications[anchorId];
                if (result && !result.checking && result.outcome) {
                    verificationByAnchorId[anchorId] = result.outcome;
                }
            }
            entry.convergence = derivePublicationEvidenceConvergence({
                publicationId: entry.publication.id,
                expectedContentHash: entry.publication.contentReference.hash,
                anchors: entry.evidenceAnchors,
                verificationByAnchorId
            });
            entry.convergenceView = publicationEvidenceConvergenceView(entry.convergence);
            recomputeDecentralization(entry);
        }

        // 0.8.27 — Unified Publication Decentralization View. Re-derives
        // `entry.decentralization` from THIS entry's own already-computed
        // `convergenceView`/`placementConvergenceView` — never a second
        // discovery, verification, or resolution call, and never itself
        // touching a catalog, coordinator, or the network. Safe to call
        // before either convergence view exists yet (both start `null`,
        // and application/PublicationDecentralizationView.js's own
        // `known: false` degrade handles that); called from BOTH
        // `recomputeConvergence()` and `recomputePlacementConvergence()`
        // so the combined view is never stale after either dimension
        // alone changes.
        function recomputeDecentralization(entry) {
            entry.decentralization = describePublicationDecentralization({
                publicationId: entry.publication.id,
                evidenceConvergenceView: entry.convergenceView,
                placementConvergenceView: entry.placementConvergenceView
            });
            recomputeReplicaKnowledge(entry);
        }

        // 0.8.28 — Offline Publication Reconstruction & Replica
        // Knowledge. `entry.publication` came from `catalog.list()` in
        // the first place (see `refreshList()` above), so `hasPublication`
        // is always true for an entry already on screen here — this
        // still calls `catalog.has()` explicitly, rather than hard-coding
        // `true`, so this function stays correct if a future caller ever
        // builds an entry from something other than the catalog's own
        // list. Never touches the network, a verifier, or a resolver —
        // see application/PublicationReplicaKnowledgeView.js's own header.
        function recomputeReplicaKnowledge(entry) {
            entry.replicaKnowledge = describePublicationReplicaKnowledge({
                publicationId: entry.publication.id,
                hasPublication: catalog.has(entry.publication.id),
                evidenceConvergenceView: entry.convergenceView,
                placementConvergenceView: entry.placementConvergenceView
            });
        }

        function decentralizationContrast(entry) {
            return describeDecentralizationRelationshipContrast(entry.decentralization);
        }

        // 0.8.33 — Local Snapshot Content Availability & Integrity UX.
        // The one place this page calls application/
        // CheckLocalSnapshotContentAvailabilityUseCase.js — always for
        // exactly this entry's own publication, always because a person
        // clicked "Check Local Snapshot". Mirrors resolvePlacement()/
        // verifyAnchor() above exactly: a plain in-flight marker while
        // the (local, but still async) ContentStore read is underway,
        // then the resolved observation, replacing whatever this entry's
        // own previous check reported — a fresh read, never a merge with
        // the one before it.
        async function checkLocalSnapshotAvailability(entry) {
            if (!localSnapshotContentAvailabilityUseCase) return;
            entry.localSnapshotAvailability = { checking: true };
            entry.localSnapshotAvailability = await localSnapshotContentAvailabilityUseCase.execute(entry.publication);
        }

        function localSnapshotAvailabilityView(entry) {
            return describeLocalSnapshotContentAvailability(entry.localSnapshotAvailability);
        }

        function localSnapshotAvailabilityBadgeClass(entry) {
            const outcome = localSnapshotAvailabilityView(entry).outcome;
            return outcome ? (LOCAL_SNAPSHOT_AVAILABILITY_BADGE_CLASSES[outcome] || null) : null;
        }

        function localSnapshotAvailabilityButtonLabel(entry) {
            const view = localSnapshotAvailabilityView(entry);
            return describeAvailabilityCheckButtonLabel({ checking: view.checking, checked: view.checked });
        }

        // 0.8.34 — Explicit Snapshot Materialization UX. `event.target.
        // files[0]` is whatever file a person just chose through the
        // "Import Snapshot" panel's own file input — read as text and
        // placed into `entry.materializationImportText`, exactly mirroring
        // IdentityManagementView.js#onImportFileChosen()'s own shape.
        // Never itself parses JSON or imports anything; only the explicit
        // "Import Snapshot" click below does.
        function onMaterializationFileChosen(entry, event) {
            const file = event.target.files && event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => { entry.materializationImportText = String(reader.result || ''); };
            reader.readAsText(file);
        }

        // 0.8.34 — Explicit Snapshot Materialization UX. The one place
        // this page calls application/
        // SnapshotContentMaterializationCoordinator.js#import() — always
        // for whatever `entry.materializationImportText` currently holds,
        // always because a person clicked "Import Snapshot". `JSON.parse`
        // and the coordinator call are each wrapped separately, mirroring
        // EditorView.js#importBlueprint()'s own two-stage "is this even
        // JSON" / "is this a valid package" error handling — a malformed
        // PublicationSnapshotTransferPackageError and a bad-JSON paste
        // both land in the identical UNAVAILABLE display state (see
        // application/SnapshotContentMaterializationView.js's own header
        // on why). A completed attempt replaces whatever this entry's own
        // previous attempt reported — a fresh result, never a merge with
        // the one before it.
        async function importSnapshotContent(entry) {
            if (!snapshotContentMaterializationCoordinator) return;
            let pkg;
            try {
                pkg = JSON.parse(entry.materializationImportText);
            } catch (e) {
                entry.materializationAttempt = {
                    importing: false, outcome: null, error: 'That is not valid JSON — choose a file, or paste the contents, of an exported Publication Snapshot Transfer Package.'
                };
                return;
            }
            entry.materializationAttempt = { importing: true };
            try {
                const result = await snapshotContentMaterializationCoordinator.import(pkg);
                entry.materializationAttempt = {
                    importing: false, error: null,
                    outcome: result.outcome, contentReference: result.contentReference,
                    publicationId: result.publicationId, publicationKnown: result.publicationKnown
                };
                recordMaterializationSource(entry, result.source, result.outcome === SnapshotContentTransferOutcome.STORED
                    || result.outcome === SnapshotContentTransferOutcome.ALREADY_STORED, result.contentReference, result.publicationId);
                recordMaterializationHistoryEntry(entry, {
                    sourceKind: result.source.kind,
                    outcome: mapPackageOutcomeToStoreOutcome(result.outcome),
                    publicationId: result.publicationId,
                    contentHash: pkg.contentHash,
                    contentReference: result.contentReference
                });
            } catch (error) {
                entry.materializationAttempt = {
                    importing: false, outcome: null,
                    error: error.message.replace(/^PublicationSnapshotTransferPackage:\s*/, '')
                };
            }
        }

        // 0.8.36 — Unified Explicit Snapshot Materialization Sources.
        // Builds `entry.lastMaterializationAttempt` from whichever
        // explicit action just completed — "Import Snapshot" or
        // "Materialize Snapshot" — ONLY when that action actually
        // resulted in this replica possessing the bytes. A rejected or
        // unavailable attempt leaves `entry.lastMaterializationAttempt`
        // exactly as it was: the shared "Local Snapshot" summary's own
        // "Source: …" line always names the last action that actually
        // succeeded, never the most recent attempt regardless of
        // outcome. Deliberately collapses STORED and ALREADY_AVAILABLE
        // onto the identical application/StoreSnapshotContentOutcome.js
        // STORED for this purpose — the action-specific badge above
        // already shows that distinction; this line exists only to name
        // WHICH source, never to repeat what that badge already says.
        // See application/SnapshotMaterializationAttempt.js and
        // application/SnapshotMaterializationView.js's own headers.
        function recordMaterializationSource(entry, source, stored, contentReference, publicationId) {
            if (!stored || !source) return;
            entry.lastMaterializationAttempt = createSnapshotMaterializationAttempt({
                sourceKind: source.kind,
                outcome: StoreSnapshotContentOutcome.STORED,
                contentReference,
                publicationId,
                contentHash: contentReference ? contentReference.hash : null
            });
        }

        function localSnapshotMaterializationSourceView(entry) {
            return describeLocalSnapshotMaterializationSource(entry.lastMaterializationAttempt);
        }

        // 0.8.38 — Snapshot Materialization History & Source Inspection.
        // Each of the three explicit actions' own use case reports the
        // outcome in ITS OWN outer vocabulary (application/
        // SnapshotContentTransferOutcome.js, application/
        // SnapshotPlacementMaterializationOutcome.js, application/
        // PeerSnapshotMaterializationOutcome.js) — these three functions
        // map each of those onto the shared inner application/
        // StoreSnapshotContentOutcome.js vocabulary application/
        // StoreSnapshotContentUseCase.js itself always resolves to,
        // exactly the mapping each use case's own header already
        // documents. Returning `null` for
        // SnapshotPlacementMaterializationOutcome.UNAVAILABLE/
        // INVALID_PLACEMENT and PeerSnapshotMaterializationOutcome.UNAVAILABLE
        // is deliberate: those outcomes mean resolution or transport never
        // reached application/StoreSnapshotContentUseCase.js at all, so
        // recording a history entry for them would narrate a storage
        // decision that never actually happened.
        function mapPackageOutcomeToStoreOutcome(outcome) {
            switch (outcome) {
                case SnapshotContentTransferOutcome.STORED: return StoreSnapshotContentOutcome.STORED;
                case SnapshotContentTransferOutcome.ALREADY_STORED: return StoreSnapshotContentOutcome.ALREADY_AVAILABLE;
                case SnapshotContentTransferOutcome.CONTENT_HASH_MISMATCH: return StoreSnapshotContentOutcome.HASH_MISMATCH;
                default: return null;
            }
        }

        function mapPlacementOutcomeToStoreOutcome(outcome) {
            switch (outcome) {
                case SnapshotPlacementMaterializationOutcome.STORED: return StoreSnapshotContentOutcome.STORED;
                case SnapshotPlacementMaterializationOutcome.ALREADY_AVAILABLE: return StoreSnapshotContentOutcome.ALREADY_AVAILABLE;
                case SnapshotPlacementMaterializationOutcome.HASH_MISMATCH: return StoreSnapshotContentOutcome.HASH_MISMATCH;
                default: return null;
            }
        }

        function mapPeerOutcomeToStoreOutcome(outcome) {
            switch (outcome) {
                case PeerSnapshotMaterializationOutcome.STORED: return StoreSnapshotContentOutcome.STORED;
                case PeerSnapshotMaterializationOutcome.ALREADY_AVAILABLE: return StoreSnapshotContentOutcome.ALREADY_AVAILABLE;
                case PeerSnapshotMaterializationOutcome.HASH_MISMATCH: return StoreSnapshotContentOutcome.HASH_MISMATCH;
                default: return null;
            }
        }

        // Appends ONE application/SnapshotMaterializationAttempt.js entry
        // to `entry.materializationHistory` for EVERY completed attempt
        // that actually reached application/StoreSnapshotContentUseCase.js
        // — STORED, ALREADY_AVAILABLE, AND HASH_MISMATCH alike — unlike
        // `recordMaterializationSource()` above, which only ever updates
        // `lastMaterializationAttempt` on a successful one. `outcome` here
        // is already one of application/StoreSnapshotContentOutcome.js's
        // three values (the caller having already run it through one of
        // the three mapping functions above); `null` means the underlying
        // action never reached that boundary at all, and nothing is
        // recorded. See application/SnapshotMaterializationHistory.js's
        // own header on why this is APPENDED, never overwritten.
        function recordMaterializationHistoryEntry(entry, { sourceKind, outcome, publicationId, contentHash, contentReference }) {
            if (!sourceKind || !outcome) return;
            const attempt = createSnapshotMaterializationAttempt({ sourceKind, outcome, contentReference, publicationId, contentHash });
            entry.materializationHistory = appendSnapshotMaterializationHistoryEntry(entry.materializationHistory, attempt);
        }

        function materializationHistoryView(entry) {
            return describeSnapshotMaterializationHistory(entry.materializationHistory);
        }

        // A plain, non-judgmental tally of how many recorded history
        // entries named each source — "1 via transfer package, 1 via
        // placement, 2 via peer" — mirroring `acquisitionBreakdownSentence()`
        // above exactly, one axis over. Never a ranking: see application/
        // SnapshotMaterializationHistory.js#describeSnapshotMaterializationSourceCounts()'s
        // own header.
        function materializationSourceCountsSentence(entry) {
            const counts = describeSnapshotMaterializationSourceCounts(entry.materializationHistory);
            const parts = [];
            if (counts.package > 0) parts.push(`${counts.package} via transfer package`);
            if (counts.placement > 0) parts.push(`${counts.placement} via placement`);
            if (counts.peer > 0) parts.push(`${counts.peer} via peer`);
            if (!parts.length) return null;
            return parts.join(' · ');
        }

        function toggleMaterializationHistory(entry) {
            entry.materializationHistoryExpanded = !entry.materializationHistoryExpanded;
        }

        function materializationView(entry) {
            return describeMaterializationAttempt(entry.materializationAttempt);
        }

        function materializationBadgeClass(entry) {
            const state = materializationView(entry).state;
            return MATERIALIZATION_BADGE_CLASSES[state] || null;
        }

        function materializationButtonLabel(entry) {
            return describeMaterializationButtonLabel({ importing: materializationView(entry).importing });
        }

        // 0.8.31 — Replica Knowledge Provenance & Synchronization
        // Inspection. Builds the two claim arrays application/
        // PublicationReplicaKnowledgeDetailView.js expects straight from
        // THIS entry's own already-loaded `evidenceAnchors`/`placements`
        // plus a purely local, synchronous read of `anchorKnowledgeStore`/
        // `placementKnowledgeStore` (the identical "Inspection Is
        // Observation" read `toggleInspect()`/`togglePlacementInspect()`
        // already perform per-claim, done here for every known claim at
        // once) and THIS entry's own `verificationHistory`/
        // `resolutionHistory` (0.8.12/0.8.26, unchanged). Never touches
        // the network, a verifier, or a resolver — see that file's own
        // header. Called explicitly wherever the claim set or a
        // verification/resolution observation could have changed, rather
        // than chained through `recomputeDecentralization()`, so a fresh
        // `verificationHistory`/`resolutionHistory` entry (pushed AFTER
        // `verifyAnchor()`/`resolvePlacement()` already call
        // `recomputeConvergence()`) is never one action stale.
        function recomputeReplicaKnowledgeDetail(entry) {
            const evidenceClaims = entry.evidenceAnchors.map((anchor) => ({
                anchorId: anchor.id,
                knowledgeRecord: anchorKnowledgeStore ? anchorKnowledgeStore.get(anchor.id) : null,
                verificationObservations: entry.verificationHistory[anchor.id] || []
            }));
            const placementClaims = entry.placements.map((placement) => ({
                placementId: placement.id,
                knowledgeRecord: placementKnowledgeStore ? placementKnowledgeStore.get(placement.id) : null,
                resolutionObservations: entry.resolutionHistory[placement.id] || []
            }));
            entry.replicaKnowledgeDetail = describePublicationReplicaKnowledgeDetail({
                publicationId: entry.publication.id,
                hasPublication: catalog.has(entry.publication.id),
                evidenceConvergenceView: entry.convergenceView,
                placementConvergenceView: entry.placementConvergenceView,
                evidenceClaims,
                placementClaims
            });
        }

        function toggleReplicaKnowledge(entry) {
            entry.replicaKnowledgeExpanded = !entry.replicaKnowledgeExpanded;
        }

        // A plain, non-judgmental tally of how many of a dimension's
        // claims were learned each way — "2 learned via peer exchange, 1
        // learned via package import" — never a ranking. See application/
        // PublicationReplicaKnowledgeDetailView.js#describeAcquisitionBreakdown()'s
        // own header.
        function acquisitionBreakdownSentence(claims) {
            const counts = describeAcquisitionBreakdown(claims);
            const parts = [];
            if (counts.peer > 0) parts.push(`${counts.peer} learned via peer exchange`);
            if (counts.package > 0) parts.push(`${counts.package} learned via package import`);
            if (counts.local > 0) parts.push(`${counts.local} learned locally`);
            if (!parts.length) return null;
            return parts.join(' · ');
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
            recomputeConvergence(entry);
            // 0.8.12 — record this attempt as its own observation, on top
            // of whatever this replica already observed for this SAME
            // anchor earlier this session, rather than replacing it — see
            // `verificationHistory`'s own comment above.
            const history = entry.verificationHistory[anchor.id] || (entry.verificationHistory[anchor.id] = []);
            history.push(createVerificationObservation({ anchorId: anchor.id, outcome: result.outcome, reason: result.reason }));
            // 0.8.31 — re-derive AFTER the history push above, so this
            // anchor's own `verificationState` reflects the attempt that
            // just completed rather than the one before it.
            recomputeReplicaKnowledgeDetail(entry);
        }

        // 0.8.12 — External Anchor Lifecycle & Stale Evidence Semantics.
        // A single, optional sentence shown ALONGSIDE the existing
        // verification badge/label (unchanged) — never a replacement for
        // it. `null` in every case except the one this milestone exists
        // to surface: this anchor was independently verified at some
        // earlier point in this session, and the most recent check came
        // back `PROOF_UNAVAILABLE`. See application/
        // PublicationAnchorVerificationLifecycleView.js's own header.
        function lifecycleNote(entry, anchorView) {
            const lifecycle = deriveAnchorVerificationLifecycle(entry.verificationHistory[anchorView.anchorId]);
            return describeAnchorVerificationLifecycleNote(lifecycle);
        }

        // 0.8.14 — External Evidence Inspection & Locator UX. The one
        // place this page calls application/PublicationAnchorDetailView.js
        // (and, separately, `evidenceViewRegistry`) — always for exactly
        // ONE anchor, always because a person clicked "Inspect Evidence."
        // Both calls are pure and synchronous: nothing here awaits
        // anything, touches evidenceCoordinator/creationCoordinator, or
        // mutates `entry.evidenceAnchors`/`entry.evidence`/
        // `entry.verifications`/`entry.verificationHistory`/
        // `entry.convergence` — see tests/
        // PublicationAnchorInspectionUX.test.js's own invariant section,
        // which asserts exactly this against the real anchor/catalog.
        // Toggling closed keeps the already-computed detail cached rather
        // than discarding it — re-opening never needs to recompute, since
        // nothing about a cataloged PublicationAnchor ever changes in
        // place (core/PublicationAnchor.js's own header).
        function toggleInspect(entry, anchorView) {
            const state = entry.inspections[anchorView.anchorId]
                || (entry.inspections[anchorView.anchorId] = { expanded: false, detail: null, typeSpecific: null, knowledge: null });
            state.expanded = !state.expanded;
            if (state.expanded && !state.detail) {
                const anchor = entry.evidenceAnchors.find((candidate) => candidate.id === anchorView.anchorId);
                if (!anchor) return;
                state.detail = publicationAnchorDetailView(anchor);
                state.typeSpecific = (evidenceViewRegistry && evidenceViewRegistry.has(anchor.anchorType))
                    ? evidenceViewRegistry.get(anchor.anchorType).describe(anchor)
                    : null;
                // 0.8.17 — Evidence Provenance & Observation Boundary. A
                // purely local, synchronous read — application/
                // LocalAnchorKnowledgeStore.js#get() never touches the
                // network and never mutates anything, the identical
                // "Inspection Is Observation" restraint this file's own
                // header already holds for `publicationAnchorDetailView()`
                // above, extended to cover this replica's own acquisition
                // bookkeeping.
                state.knowledge = anchorKnowledgeStore
                    ? describeAnchorKnowledge(anchorKnowledgeStore.get(anchor.id))
                    : null;
            }
        }

        function inspectionExpanded(entry, anchorView) {
            const state = entry.inspections[anchorView.anchorId];
            return Boolean(state && state.expanded);
        }

        function inspectionDetail(entry, anchorView) {
            const state = entry.inspections[anchorView.anchorId];
            return state ? state.detail : null;
        }

        function inspectionTypeSpecific(entry, anchorView) {
            const state = entry.inspections[anchorView.anchorId];
            return state ? state.typeSpecific : null;
        }

        // 0.8.17 — Evidence Provenance & Observation Boundary.
        function inspectionKnowledge(entry, anchorView) {
            const state = entry.inspections[anchorView.anchorId];
            return state ? state.knowledge : null;
        }

        function evidenceBadgeClass(anchorView) {
            if (anchorView.checking) return 'peer-badge--pending';
            if (!anchorView.verified) return 'peer-badge--unchecked';
            return EVIDENCE_BADGE_CLASSES[anchorView.verificationOutcome] || 'peer-badge--unchecked';
        }

        // 0.8.20 — Snapshot Placement Inspection & Explicit Resolution
        // UX. DISCOVERY only: a synchronous local catalog read through
        // application/SnapshotPlacementResolutionCoordinator.js#
        // discover(), never a call to application/
        // SnapshotPlacementResolver.js. Re-running this is always cheap
        // and safe — mirrors loadEvidence() above exactly, one axis
        // over.
        function loadPlacements(entry) {
            if (!placementResolutionCoordinator) return;
            entry.placements = placementResolutionCoordinator.discover(entry.publication.id);
            entry.placementsView = snapshotPlacementView(entry.placements, entry.resolutions);
            recomputePlacementConvergence(entry);
            recomputeReplicaKnowledgeDetail(entry);
        }

        // 0.8.23 — Multi-Placement Convergence & Relationship UX.
        // Re-derives `entry.placementConvergence`/
        // `entry.placementConvergenceView` from THIS entry's own
        // `placements` — never a second discovery call, and never
        // touching application/SnapshotPlacementResolver.js. Unlike
        // `recomputeConvergence()` above (which passes this replica's
        // own `verificationByAnchorId` observations alongside the
        // structural comparison, per application/
        // PublicationEvidenceConvergence.js's own OPTIONAL parameter for
        // exactly that), application/
        // PublicationSnapshotPlacementConvergence.js has NO parameter
        // capable of accepting `entry.resolutions` at all — this
        // function is called from `loadPlacements()` only, never from
        // `resolvePlacement()`, so a resolution result never even has
        // the opportunity to influence the placements handed in here.
        // See docs/Principles.md, "Multi-Placement Convergence Is
        // Independent Of Resolution Observation (0.8.23)."
        function recomputePlacementConvergence(entry) {
            entry.placementConvergence = derivePublicationSnapshotPlacementConvergence({
                publicationId: entry.publication.id,
                placements: entry.placements
            });
            entry.placementConvergenceView = publicationSnapshotPlacementConvergenceView(entry.placementConvergence);
            recomputeDecentralization(entry);
        }

        function togglePlacements(entry) {
            entry.placementsExpanded = !entry.placementsExpanded;
        }

        // The one place this page calls application/
        // SnapshotPlacementResolutionCoordinator.js#resolve() — always
        // for exactly ONE placement, always because a person clicked
        // "Resolve Snapshot" on it. Mirrors verifyAnchor() above exactly,
        // one axis over.
        async function resolvePlacement(entry, placementView) {
            const placement = entry.placements.find((candidate) => candidate.id === placementView.placementId);
            if (!placement || !placementResolutionCoordinator) return;
            entry.resolutions[placement.id] = { checking: true };
            entry.placementsView = snapshotPlacementView(entry.placements, entry.resolutions);
            const result = await placementResolutionCoordinator.resolve(placement);
            entry.resolutions[placement.id] = { outcome: result.outcome, reason: result.reason };
            entry.placementsView = snapshotPlacementView(entry.placements, entry.resolutions);
            // 0.8.26 — record this attempt as its own observation, on top
            // of whatever this replica already observed for this SAME
            // placement earlier this session, rather than replacing it —
            // see `resolutionHistory`'s own comment above.
            const history = entry.resolutionHistory[placement.id] || (entry.resolutionHistory[placement.id] = []);
            history.push(createResolutionObservation({ placementId: placement.id, outcome: result.outcome, reason: result.reason }));
            // 0.8.31 — re-derive AFTER the history push above, so this
            // placement's own `resolutionState` reflects the attempt that
            // just completed rather than the one before it.
            recomputeReplicaKnowledgeDetail(entry);
        }

        // 0.8.26 — Snapshot Placement Lifecycle & Stale Availability
        // Semantics. A single, optional sentence shown ALONGSIDE the
        // existing resolution badge/label (unchanged) — never a
        // replacement for it. `null` in every case except the one this
        // milestone exists to surface: this placement was independently
        // resolved at some earlier point in this session, and the most
        // recent check came back UNAVAILABLE. See application/
        // SnapshotPlacementLifecycleView.js's own header.
        function placementLifecycleNote(entry, placementView) {
            const lifecycle = deriveSnapshotPlacementLifecycle(entry.resolutionHistory[placementView.placementId]);
            return describeSnapshotPlacementLifecycleNote(lifecycle);
        }

        function placementBadgeClass(placementView) {
            if (placementView.checking) return 'peer-badge--pending';
            if (!placementView.resolved) return 'peer-badge--unchecked';
            return PLACEMENT_BADGE_CLASSES[placementView.resolutionOutcome] || 'peer-badge--unchecked';
        }

        // 0.8.35 — Explicit Placement-Backed Snapshot Materialization. The
        // one place this page calls application/
        // SnapshotPlacementMaterializationCoordinator.js#materialize() —
        // always for exactly ONE placement, always because a person
        // clicked "Materialize Snapshot"/"Materialize Again" on it.
        // Mirrors resolvePlacement() immediately above almost exactly,
        // one axis over — the one difference is what a SUCCESSFUL
        // attempt means: resolvePlacement() only ever observes; a
        // successful materialize() call actually writes bytes into this
        // replica's own content/ContentStore.js. Never called from
        // onMounted(), refreshList(), loadPlacements(), or
        // resolvePlacement() itself — only this explicit click ever
        // materializes anything.
        async function materializePlacement(entry, placementView) {
            const placement = entry.placements.find((candidate) => candidate.id === placementView.placementId);
            if (!placement || !snapshotPlacementMaterializationCoordinator) return;
            entry.materializations[placement.id] = { materializing: true };
            try {
                const result = await snapshotPlacementMaterializationCoordinator.materialize(placement);
                entry.materializations[placement.id] = {
                    materializing: false, error: null,
                    outcome: result.outcome, reason: result.reason, contentReference: result.contentReference,
                    placementId: result.placementId, publicationId: result.publicationId, publicationKnown: result.publicationKnown
                };
                recordMaterializationSource(entry, result.source, result.outcome === SnapshotPlacementMaterializationOutcome.STORED
                    || result.outcome === SnapshotPlacementMaterializationOutcome.ALREADY_AVAILABLE, result.contentReference, result.publicationId);
                recordMaterializationHistoryEntry(entry, {
                    sourceKind: result.source.kind,
                    outcome: mapPlacementOutcomeToStoreOutcome(result.outcome),
                    publicationId: result.publicationId,
                    contentHash: result.contentHash,
                    contentReference: result.contentReference
                });
            } catch (error) {
                entry.materializations[placement.id] = { materializing: false, outcome: null, error: error.message };
            }
        }

        function placementMaterializationView(entry, placementView) {
            return describePlacementMaterializationAttempt(entry.materializations[placementView.placementId]);
        }

        function placementMaterializationBadgeClass(entry, placementView) {
            const state = placementMaterializationView(entry, placementView).state;
            return PLACEMENT_MATERIALIZATION_BADGE_CLASSES[state] || null;
        }

        function placementMaterializationButtonLabel(entry, placementView) {
            const view = placementMaterializationView(entry, placementView);
            return describePlacementMaterializationButtonLabel({
                materializing: view.materializing,
                materialized: view.state !== SnapshotPlacementMaterializationUiState.IDLE
            });
        }

        // 0.8.37 — Explicit Peer Snapshot Content Transfer. The peer-backed
        // sibling of materializePlacement() immediately above, one axis
        // over: always for exactly ONE already-authenticated peer a person
        // picked from THIS entry's own dropdown, always because they
        // clicked "Get Snapshot from Peer"/"Get Snapshot from Peer Again"
        // on it. This page never selects, ranks, or falls back to a
        // different peer on their behalf — see application/
        // MaterializeSnapshotFromPeerUseCase.js's own header. Never called
        // from onMounted(), refreshList(), or any other action — only this
        // explicit click ever asks a peer for bytes.
        function selectedPeerForMaterialization(entry) {
            return retrievalPeers.value.find((peer) => peer.connectionId === entry.peerMaterializationSelectedPeerId) || null;
        }

        async function requestSnapshotFromPeer(entry) {
            const peer = selectedPeerForMaterialization(entry);
            if (!peer || !snapshotPeerMaterializationCoordinator) return;
            entry.peerMaterializationAttempt = { requesting: true };
            try {
                const result = await snapshotPeerMaterializationCoordinator.materialize({
                    peer, publicationId: entry.publication.id, contentHash: entry.publication.contentReference.hash
                });
                entry.peerMaterializationAttempt = {
                    requesting: false, error: null,
                    outcome: result.outcome, reason: result.reason, contentReference: result.contentReference,
                    publicationId: result.publicationId, contentHash: result.contentHash, publicationKnown: result.publicationKnown
                };
                recordMaterializationSource(entry, result.source, result.outcome === PeerSnapshotMaterializationOutcome.STORED
                    || result.outcome === PeerSnapshotMaterializationOutcome.ALREADY_AVAILABLE, result.contentReference, result.publicationId);
                recordMaterializationHistoryEntry(entry, {
                    sourceKind: result.source.kind,
                    outcome: mapPeerOutcomeToStoreOutcome(result.outcome),
                    publicationId: result.publicationId,
                    contentHash: result.contentHash,
                    contentReference: result.contentReference
                });
            } catch (error) {
                entry.peerMaterializationAttempt = { requesting: false, outcome: null, error: error.message };
            }
        }

        function peerMaterializationView(entry) {
            return describePeerMaterializationAttempt(entry.peerMaterializationAttempt);
        }

        function peerMaterializationBadgeClass(entry) {
            const state = peerMaterializationView(entry).state;
            return PEER_MATERIALIZATION_BADGE_CLASSES[state] || null;
        }

        function peerMaterializationButtonLabel(entry) {
            const view = peerMaterializationView(entry);
            return describePeerMaterializationButtonLabel({
                requesting: view.requesting,
                materialized: view.state !== SnapshotPeerMaterializationUiState.IDLE
            });
        }

        // 0.8.20 — the one place this page calls application/
        // PublicationSnapshotPlacementDetailView.js (and, separately,
        // `placementViewRegistry`) — always for exactly ONE placement,
        // always because a person clicked "Inspect Placement." Both
        // calls are pure and synchronous: nothing here awaits anything,
        // touches placementResolutionCoordinator, or mutates
        // `entry.placements`/`entry.placementsView`/`entry.resolutions`
        // — mirrors toggleInspect() above exactly, one axis over.
        function togglePlacementInspect(entry, placementView) {
            const state = entry.placementInspections[placementView.placementId]
                || (entry.placementInspections[placementView.placementId] = { expanded: false, detail: null, typeSpecific: null, knowledge: null });
            state.expanded = !state.expanded;
            if (state.expanded && !state.detail) {
                const placement = entry.placements.find((candidate) => candidate.id === placementView.placementId);
                if (!placement) return;
                state.detail = publicationSnapshotPlacementDetailView(placement);
                state.typeSpecific = (placementViewRegistry && placementViewRegistry.has(placement.storage))
                    ? placementViewRegistry.get(placement.storage).describe(placement)
                    : null;
                // 0.8.24 — Snapshot Placement Provenance & Observation
                // Boundary. A purely local, synchronous read — application/
                // LocalPlacementKnowledgeStore.js#get() never touches the
                // network and never mutates anything, mirroring
                // toggleInspect()'s own identical 0.8.17 read above.
                state.knowledge = placementKnowledgeStore
                    ? describePlacementKnowledge(placementKnowledgeStore.get(placement.id))
                    : null;
            }
        }

        function placementInspectionExpanded(entry, placementView) {
            const state = entry.placementInspections[placementView.placementId];
            return Boolean(state && state.expanded);
        }

        function placementInspectionDetail(entry, placementView) {
            const state = entry.placementInspections[placementView.placementId];
            return state ? state.detail : null;
        }

        function placementInspectionTypeSpecific(entry, placementView) {
            const state = entry.placementInspections[placementView.placementId];
            return state ? state.typeSpecific : null;
        }

        // 0.8.24 — Snapshot Placement Provenance & Observation Boundary.
        function placementInspectionKnowledge(entry, placementView) {
            const state = entry.placementInspections[placementView.placementId];
            return state ? state.knowledge : null;
        }

        // 0.8.25 — Explicit Snapshot Placement Creation UX. The one place
        // this page calls application/
        // SnapshotPlacementCreationCoordinator.js (through the
        // coordinator) — always for exactly ONE storage type, always
        // because a person clicked "Create <storage> Placement" on it.
        // Never called from onMounted(), refreshList(), or
        // loadPlacements() — merely opening or refreshing this page never
        // triggers an external placement. Mirrors createAnchor() below
        // exactly, one axis over.
        //
        // A thrown error (application/
        // SnapshotPlacementCreationCoordinator.js#create() never catches
        // one — see that class's own header) is caught HERE, at the UI
        // boundary, and turned into its own honest display state via
        // application/SnapshotPlacementCreationView.js#describeCreationAttempt()
        // rather than crashing the page.
        async function createPlacement(entry, storage) {
            if (!placementCreationCoordinator) return;
            entry.placementCreationAttempts[storage] = { creating: true, outcome: null, placement: null, reason: null, error: null };
            try {
                const result = await placementCreationCoordinator.create(entry.publication.id, storage);
                entry.placementCreationAttempts[storage] = {
                    creating: false, outcome: result.outcome, placement: result.placement, reason: result.reason, error: null
                };
                // Re-discover from the catalog so a CREATED placement
                // immediately appears in the ordinary placement list below
                // — a purely local catalog read (application/
                // SnapshotPlacementResolutionCoordinator.js#discover()),
                // never a resolution. Mirrors createAnchor()'s own
                // identical re-discovery below, one axis over.
                loadPlacements(entry);
                if (result.outcome === SnapshotPlacementCreationOutcome.CREATED) {
                    entry.placementsExpanded = true;
                }
            } catch (error) {
                entry.placementCreationAttempts[storage] = { creating: false, outcome: null, placement: null, reason: null, error: error.message };
            }
        }

        function placementCreationView(entry, storage) {
            return describePlacementCreationAttempt(entry.placementCreationAttempts[storage]);
        }

        function placementCreationBadgeClass(entry, storage) {
            const state = placementCreationView(entry, storage).state;
            return PLACEMENT_CREATION_BADGE_CLASSES[state] || null;
        }

        function placementCreationButtonLabel(entry, storage) {
            const view = placementCreationView(entry, storage);
            const hasExisting = entry.placements.some((placement) => placement.storage === storage);
            return describePlacementCreationButtonLabel(humanizeContentKind(storage), { creating: view.state === SnapshotPlacementCreationUiState.CREATING, hasExisting });
        }

        // 0.8.11 — Explicit External Anchoring UX. The one place this
        // page calls application/PublicationAnchorCreationCoordinator.js
        // (through the coordinator) — always for exactly ONE anchorType,
        // always because a person clicked "Create <type> Anchor" on it.
        // Never called from onMounted(), refreshList(), or loadEvidence()
        // — merely opening or refreshing this page never triggers an
        // external recording. See this file's own header and
        // docs/Principles.md, "External Anchoring Is An Explicit User
        // Action (0.8.11)."
        //
        // A thrown error (application/PublicationAnchorCreationCoordinator
        // .js#create() never catches one — see that class's own header)
        // is caught HERE, at the UI boundary, and turned into its own
        // honest display state via application/
        // PublicationAnchorCreationView.js#describeCreationAttempt()
        // rather than crashing the page.
        async function createAnchor(entry, anchorType) {
            if (!creationCoordinator) return;
            entry.creationAttempts[anchorType] = { creating: true, outcome: null, anchor: null, reason: null, error: null };
            try {
                const result = await creationCoordinator.create(entry.publication.id, anchorType);
                entry.creationAttempts[anchorType] = {
                    creating: false, outcome: result.outcome, anchor: result.anchor, reason: result.reason, error: null
                };
                // Re-discover from the catalog so a CREATED anchor
                // immediately appears in the ordinary evidence list below
                // — a purely local catalog read (application/
                // PublicationEvidenceCoordinator.js#discover()), never a
                // verification. See this file's own header, and
                // application/PublicationEvidenceCoordinator.js's own, on
                // why discovery and verification stay two separate calls.
                loadEvidence(entry);
                if (result.outcome === ExternalAnchorCreationOutcome.CREATED) {
                    entry.evidenceExpanded = true;
                }
            } catch (error) {
                entry.creationAttempts[anchorType] = { creating: false, outcome: null, anchor: null, reason: null, error: error.message };
            }
        }

        // 0.8.16 — Evidence Synchronization UX & Explicit Historical
        // Discovery. The one place this page calls application/
        // PublicationEvidenceDiscoveryCoordinator.js — always for exactly
        // ONE publication, always because a person clicked "Discover from
        // Peers" on it. Never called from onMounted(), refreshList(), or
        // loadEvidence() — see this file's own header and
        // docs/Principles.md, "Discovery Is Not Verification, And 'No New
        // Evidence' Is Not 'No Evidence' (0.8.16)."
        //
        // A discovered anchor is already cataloged by the time discover()
        // resolves — application/PublicationAnchorPeerExchange.js#
        // _importAndPublish() runs it through the identical validate ->
        // construct -> verify-SIGNATURE boundary every other arrival
        // path uses (0.8.4/0.8.5, unchanged) — so re-running
        // loadEvidence() here is a purely local catalog re-read that
        // simply picks up what discovery already cataloged, never a
        // second network call and never a verification of anything.
        //
        // A thrown error (a local precondition failure — this coordinator
        // never reaches the network itself on that path) is caught HERE,
        // at the UI boundary, and turned into UNAVAILABLE via application/
        // PublicationEvidenceDiscoveryView.js#describeEvidenceDiscoveryAttempt()
        // rather than crashing the page — the identical pattern
        // `createAnchor()` above already established.
        async function discoverFromPeers(entry) {
            if (!evidenceDiscoveryCoordinator) return;
            entry.discoveryAttempt = { discovering: true, result: null, error: null };
            try {
                const result = await evidenceDiscoveryCoordinator.discover(entry.publication.id);
                entry.discoveryAttempt = { discovering: false, result, error: null };
                loadEvidence(entry);
                if (result.newlyImportedCount > 0) {
                    entry.evidenceExpanded = true;
                }
            } catch (error) {
                entry.discoveryAttempt = { discovering: false, result: null, error: error.message };
            }
        }

        function discoveryView(entry) {
            return describeEvidenceDiscoveryAttempt(entry.discoveryAttempt);
        }

        function discoveryBadgeClass(entry) {
            const state = discoveryView(entry).state;
            return DISCOVERY_BADGE_CLASSES[state] || null;
        }

        function discoveryButtonLabel(entry) {
            const discovering = Boolean(entry.discoveryAttempt && entry.discoveryAttempt.discovering);
            const hasDiscovered = Boolean(entry.discoveryAttempt && !discovering);
            return describeDiscoveryButtonLabel({ discovering, hasDiscovered });
        }

        // 0.8.30 — Explicit Replica Knowledge Synchronization. The
        // combined sibling of `discoverFromPeers()` immediately above:
        // ONE explicit click asks every authenticated peer about
        // anchors AND placements together, through application/
        // PublicationKnowledgeSynchronizationCoordinator.js#synchronize()
        // — never triggered by opening this page or expanding either
        // "Show Evidence" or "Show Placements", the identical restraint
        // `discoverFromPeers()` already holds. A synchronized claim is
        // already cataloged by the time synchronize() resolves — this
        // just re-reads both local catalogs afterward through the
        // UNCHANGED `loadEvidence()`/`loadPlacements()` this page already
        // calls elsewhere, never a second import path.
        async function synchronizeWithPeers(entry) {
            if (!knowledgeSynchronizationCoordinator) return;
            entry.synchronizationAttempt = { synchronizing: true, result: null, error: null };
            try {
                const result = await knowledgeSynchronizationCoordinator.synchronize(entry.publication.id);
                entry.synchronizationAttempt = { synchronizing: false, result, error: null };
                loadEvidence(entry);
                loadPlacements(entry);
                if (result.anchors.newlyImportedCount > 0) {
                    entry.evidenceExpanded = true;
                }
                if (result.placements.newlyImportedCount > 0) {
                    entry.placementsExpanded = true;
                }
            } catch (error) {
                entry.synchronizationAttempt = { synchronizing: false, result: null, error: error.message };
            }
        }

        function synchronizationView(entry) {
            return describeSynchronizationAttempt(entry.synchronizationAttempt);
        }

        function synchronizationBadgeClass(entry) {
            const state = synchronizationView(entry).state;
            return SYNCHRONIZATION_BADGE_CLASSES[state] || null;
        }

        function synchronizationButtonLabel(entry) {
            const synchronizing = Boolean(entry.synchronizationAttempt && entry.synchronizationAttempt.synchronizing);
            const hasSynchronized = Boolean(entry.synchronizationAttempt && !synchronizing);
            return describeSynchronizationButtonLabel({ synchronizing, hasSynchronized });
        }

        function creationView(entry, anchorType) {
            return describeCreationAttempt(entry.creationAttempts[anchorType]);
        }

        function creationBadgeClass(entry, anchorType) {
            const state = creationView(entry, anchorType).state;
            return CREATION_BADGE_CLASSES[state] || null;
        }

        function creationButtonLabel(entry, anchorType) {
            const view = creationView(entry, anchorType);
            const hasExisting = entry.evidenceAnchors.some((anchor) => anchor.anchorType === anchorType);
            return describeCreationButtonLabel(humanizeContentKind(anchorType), { creating: view.state === ExternalAnchorCreationUiState.CREATING, hasExisting });
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
            entries, loading, retrievalPeers, availableAnchorTypes,
            humanizeContentKind, shortId, shortHash, formatWhen, badgeClass, statusLabel, availabilityText,
            canRetrieve, retrieve, recheck,
            describeKnownEvidenceCount, toggleEvidence, verifyAnchor, evidenceBadgeClass, lifecycleNote,
            createAnchor, creationView, creationBadgeClass, creationButtonLabel,
            toggleInspect, inspectionExpanded, inspectionDetail, inspectionTypeSpecific, inspectionKnowledge,
            evidenceDiscoveryCoordinator, discoverFromPeers, discoveryView, discoveryBadgeClass, discoveryButtonLabel,
            placementResolutionCoordinator, describeKnownPlacementCount, togglePlacements, resolvePlacement, placementBadgeClass, placementLifecycleNote,
            togglePlacementInspect, placementInspectionExpanded, placementInspectionDetail, placementInspectionTypeSpecific,
            placementInspectionKnowledge,
            availableStorageTypes, createPlacement, placementCreationView, placementCreationBadgeClass, placementCreationButtonLabel,
            decentralizationContrast,
            knowledgeSynchronizationCoordinator, synchronizeWithPeers, synchronizationView, synchronizationBadgeClass, synchronizationButtonLabel,
            toggleReplicaKnowledge, acquisitionBreakdownSentence,
            localSnapshotContentAvailabilityUseCase, checkLocalSnapshotAvailability, localSnapshotAvailabilityView,
            localSnapshotAvailabilityBadgeClass, localSnapshotAvailabilityButtonLabel,
            localSnapshotMaterializationSourceView,
            snapshotContentMaterializationCoordinator, onMaterializationFileChosen, importSnapshotContent,
            materializationView, materializationBadgeClass, materializationButtonLabel,
            snapshotPlacementMaterializationCoordinator, materializePlacement,
            placementMaterializationView, placementMaterializationBadgeClass, placementMaterializationButtonLabel,
            snapshotPeerMaterializationCoordinator, requestSnapshotFromPeer,
            peerMaterializationView, peerMaterializationBadgeClass, peerMaterializationButtonLabel,
            materializationHistoryView, materializationSourceCountsSentence, toggleMaterializationHistory
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

                    <!-- 0.8.33 — Local Snapshot Content Availability & Integrity UX. A
                         replica-local OBSERVATION of whether THIS device's own
                         content/ContentStore.js currently holds bytes for this
                         publication's own contentReference, and whether those bytes
                         still hash to it — never a network call, never a check of any
                         anchor or placement, and never itself an import/materialization
                         action (see application/
                         CheckLocalSnapshotContentAvailabilityUseCase.js's own header).
                         Deliberately its own section, separate from "Decentralization"
                         below: that card describes DISTRIBUTED claims this replica
                         knows about; this one describes a fact about THIS replica's own
                         present content state.
                         0.8.34 — Explicit Snapshot Materialization UX adds "Import
                         Snapshot" to this SAME section — the explicit action that
                         connects 0.8.32's own offline transfer pipeline to 0.8.33's own
                         inspection above. The two remain two independent capabilities,
                         each hidden on its own when its own coordinator/use case was not
                         provided; this outer wrapper renders only when at least one of
                         them was. -->
                    <div v-if="localSnapshotContentAvailabilityUseCase || snapshotContentMaterializationCoordinator || snapshotPeerMaterializationCoordinator" class="decentralization-summary">
                        <span class="evidence-convergence-title">Local Snapshot</span>

                        <div v-if="localSnapshotContentAvailabilityUseCase" class="evidence-discovery-header">
                            <button class="action-btn action-btn--secondary"
                                    :disabled="localSnapshotAvailabilityView(entry).checking"
                                    @click="checkLocalSnapshotAvailability(entry)">
                                {{ localSnapshotAvailabilityButtonLabel(entry) }}
                            </button>
                            <span v-if="localSnapshotAvailabilityView(entry).checked" class="peer-badge" :class="localSnapshotAvailabilityBadgeClass(entry)">
                                {{ localSnapshotAvailabilityView(entry).label }}
                            </span>
                        </div>
                        <p v-if="localSnapshotContentAvailabilityUseCase && localSnapshotAvailabilityView(entry).message" class="form-hint form-hint--neutral">
                            {{ localSnapshotAvailabilityView(entry).message }}
                        </p>

                        <!-- 0.8.36 — Unified Explicit Snapshot Materialization Sources. Names
                             WHICH explicit action most recently actually stored these bytes —
                             "Import Snapshot" or "Materialize Snapshot" — with no adjective in
                             front of either (see application/SnapshotMaterializationView.js's
                             own header on why neither source is ever called "preferred" or
                             "recommended"). Shown only once at least one of the two actions has
                             actually succeeded THIS session; silent otherwise, and never itself
                             a third action. -->
                        <p v-if="localSnapshotMaterializationSourceView(entry).possessed" class="form-hint form-hint--neutral">
                            Source: {{ localSnapshotMaterializationSourceView(entry).sourceLabel }}
                        </p>

                        <!-- 0.8.34 — Explicit Snapshot Materialization UX. Never triggered
                             by opening this page, checking local availability, or expanding
                             any disclosure — only this explicit "Import Snapshot" click
                             (after choosing a file or pasting a package) ever imports a
                             single byte. The source is always exactly what a person
                             explicitly supplies here — a Publication Snapshot Transfer
                             Package (0.8.32) — never a list this page discovers or ranks on
                             their behalf (see application/
                             SnapshotContentMaterializationCoordinator.js's own header on
                             why availableSources() does not exist yet). -->
                        <div v-if="snapshotContentMaterializationCoordinator" class="evidence-list">
                            <button v-if="!entry.materializationFormOpen" class="action-btn action-btn--secondary"
                                    @click="entry.materializationFormOpen = true">
                                Import Snapshot
                            </button>
                            <template v-else>
                                <label class="form-field">
                                    <span class="form-label">Publication Snapshot Transfer Package</span>
                                    <input type="file" accept="application/json" class="form-input"
                                           @change="onMaterializationFileChosen(entry, $event)" />
                                </label>
                                <textarea v-model="entry.materializationImportText" class="form-input" rows="4"
                                          placeholder="…or paste the exported Publication Snapshot Transfer Package JSON here"></textarea>
                                <div class="evidence-discovery-header">
                                    <button class="action-btn action-btn--primary"
                                            :disabled="materializationView(entry).importing"
                                            @click="importSnapshotContent(entry)">
                                        {{ materializationButtonLabel(entry) }}
                                    </button>
                                    <span v-if="materializationView(entry).label" class="peer-badge" :class="materializationBadgeClass(entry)">
                                        {{ materializationView(entry).label }}
                                    </span>
                                </div>
                            </template>
                            <p v-if="entry.materializationFormOpen && materializationView(entry).message" class="form-hint form-hint--neutral">
                                {{ materializationView(entry).message }}
                            </p>
                        </div>

                        <!-- 0.8.37 — Explicit Peer Snapshot Content Transfer. The person
                             chooses the peer — never a coordinator, never a ranked list,
                             never an automatic fallback to a second peer if the first
                             one is unavailable. Requesting always asks for exactly this
                             entry's own contentHash from exactly the selected peer; a
                             peer that does not currently possess the bytes, or that never
                             answers, reports the same UNAVAILABLE outcome as a genuine
                             timeout — see application/PeerSnapshotMaterializationOutcome.js's
                             own header. See application/
                             MaterializeSnapshotFromPeerUseCase.js's own header. -->
                        <div v-if="snapshotPeerMaterializationCoordinator" class="evidence-list">
                            <p v-if="retrievalPeers.length === 0" class="form-hint form-hint--neutral">
                                No authenticated peer is connected right now — connect to one first from
                                <router-link to="/peers">Peers</router-link>.
                            </p>
                            <template v-else>
                                <label class="form-field">
                                    <span class="form-label">Peer</span>
                                    <select v-model="entry.peerMaterializationSelectedPeerId" class="form-input">
                                        <option value="" disabled>Choose an authenticated peer…</option>
                                        <option v-for="peer in retrievalPeers" :key="peer.connectionId" :value="peer.connectionId">
                                            {{ peer.alias || (peer.remoteIdentity ? shortId(peer.remoteIdentity.identityId) : 'Unknown peer') }}
                                        </option>
                                    </select>
                                </label>
                                <div class="evidence-discovery-header">
                                    <button class="action-btn action-btn--secondary"
                                            :disabled="peerMaterializationView(entry).requesting || !entry.peerMaterializationSelectedPeerId"
                                            @click="requestSnapshotFromPeer(entry)">
                                        {{ peerMaterializationButtonLabel(entry) }}
                                    </button>
                                    <span v-if="peerMaterializationView(entry).label" class="peer-badge" :class="peerMaterializationBadgeClass(entry)">
                                        {{ peerMaterializationView(entry).label }}
                                    </span>
                                </div>
                            </template>
                            <p v-if="peerMaterializationView(entry).message" class="form-hint form-hint--neutral">
                                {{ peerMaterializationView(entry).message }}
                            </p>
                        </div>

                        <!-- 0.8.38 — Snapshot Materialization History & Source
                             Inspection. The ORDERED narration of EVERY explicit
                             "Import Snapshot"/"Materialize Snapshot"/"Get
                             Snapshot from Peer" attempt this entry has seen THIS
                             SESSION that actually reached application/
                             StoreSnapshotContentUseCase.js — including a
                             rejected HASH_MISMATCH attempt, never only the
                             successful ones "Source: …" above already names.
                             Deliberately a plain narration, never a ranking: no
                             source is called better, more reliable, or more
                             trustworthy than another — see application/
                             SnapshotMaterializationHistoryView.js's own header
                             and docs/Principles.md, "Materialization History
                             Describes Byte Acquisition, Not Source Trust
                             (0.8.38)." -->
                        <div v-if="materializationHistoryView(entry).count > 0" class="evidence-list">
                            <button class="action-btn action-btn--secondary" @click="toggleMaterializationHistory(entry)">
                                {{ entry.materializationHistoryExpanded ? 'Hide Materialization History' : 'Show Materialization History' }}
                            </button>
                            <div v-if="entry.materializationHistoryExpanded">
                                <p v-if="materializationSourceCountsSentence(entry)" class="form-hint form-hint--neutral">
                                    {{ materializationSourceCountsSentence(entry) }}
                                </p>
                                <ul class="replica-knowledge-claim-list">
                                    <li v-for="(attempt, index) in materializationHistoryView(entry).attempts" :key="index" class="replica-knowledge-claim">
                                        <dl class="evidence-fields">
                                            <div class="evidence-field">
                                                <dt>Source</dt>
                                                <dd>{{ attempt.sourceLabel }}</dd>
                                            </div>
                                            <div class="evidence-field">
                                                <dt>Outcome</dt>
                                                <dd>{{ attempt.outcomeLabel }}</dd>
                                            </div>
                                            <div class="evidence-field">
                                                <dt>When</dt>
                                                <dd>{{ formatWhen(attempt.observedAt) }}</dd>
                                            </div>
                                        </dl>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <!-- 0.8.27 — Unified Publication Decentralization View. Always visible
                         (never gated behind "Show Evidence"/"Show Placements") the moment
                         either dimension has at least one known claim — the two parallel
                         summaries application/PublicationDecentralizationView.js combines,
                         side by side, so a person can compare them without expanding both
                         disclosures below. Neither card is styled, ordered, or worded as more
                         significant than the other; the optional contrast sentence beneath
                         states only that the two dimensions' relationships DIFFER, never which
                         one to believe. -->
                    <div v-if="entry.decentralization && (entry.decentralization.evidence.anchorCount > 0 || entry.decentralization.placements.placementCount > 0)"
                         class="decentralization-summary">
                        <span class="evidence-convergence-title">Decentralization</span>
                        <!-- 0.8.28 — Offline Publication Reconstruction & Replica
                             Knowledge. One plain fact ahead of the two dimension
                             cards: does this replica have the publication itself
                             cataloged, independent of how many anchor/placement
                             claims it happens to also know. Never a completeness
                             score, and never gated behind a "verified"/"resolved"
                             check — see application/
                             PublicationReplicaKnowledgeView.js's own header. -->
                        <p v-if="entry.replicaKnowledge" class="form-hint form-hint--neutral">
                            Publication: {{ entry.replicaKnowledge.hasPublication ? 'known locally' : 'not known locally' }}
                        </p>
                        <div class="decentralization-dimensions">
                            <div class="decentralization-dimension">
                                <span class="decentralization-dimension-title">External Evidence</span>
                                <p class="form-hint form-hint--neutral">
                                    {{ entry.decentralization.evidence.anchorCount }} anchor claim{{ entry.decentralization.evidence.anchorCount === 1 ? '' : 's' }}
                                </p>
                                <p v-if="entry.decentralization.evidence.relationship" class="form-hint form-hint--neutral">
                                    Relationship: {{ entry.decentralization.evidence.relationship === 'conflict' ? 'Conflict' : 'Agreement' }}
                                </p>
                            </div>
                            <div class="decentralization-dimension">
                                <span class="decentralization-dimension-title">Snapshot Placements</span>
                                <p class="form-hint form-hint--neutral">
                                    {{ entry.decentralization.placements.placementCount }} placement claim{{ entry.decentralization.placements.placementCount === 1 ? '' : 's' }}
                                    · {{ entry.decentralization.placements.storageTypeCount }} storage type{{ entry.decentralization.placements.storageTypeCount === 1 ? '' : 's' }}
                                </p>
                                <p v-if="entry.decentralization.placements.relationship" class="form-hint form-hint--neutral">
                                    Relationship: {{ entry.decentralization.placements.relationship === 'conflict' ? 'Conflict' : 'Agreement' }}
                                </p>
                            </div>
                        </div>
                        <p v-if="decentralizationContrast(entry)" class="evidence-convergence-conflict">
                            {{ decentralizationContrast(entry) }}
                        </p>

                        <!-- 0.8.30 — Explicit Replica Knowledge Synchronization. ONE explicit
                             action spanning both dimensions above, mirroring "Discover from
                             Peers" below but never triggered by opening this page or expanding
                             either disclosure — only this click ever asks a peer for anything.
                             Hidden entirely when no knowledgeSynchronizationCoordinator was
                             provided, exactly like "Discover from Peers" hides with no
                             evidenceDiscoveryCoordinator. -->
                        <div v-if="knowledgeSynchronizationCoordinator" class="evidence-discovery">
                            <div class="evidence-discovery-header">
                                <button class="action-btn action-btn--secondary"
                                        :disabled="entry.synchronizationAttempt && entry.synchronizationAttempt.synchronizing"
                                        @click="synchronizeWithPeers(entry)">
                                    {{ synchronizationButtonLabel(entry) }}
                                </button>
                                <span v-if="synchronizationView(entry).label" class="peer-badge" :class="synchronizationBadgeClass(entry)">
                                    {{ synchronizationView(entry).label }}
                                </span>
                            </div>
                            <p v-if="synchronizationView(entry).message" class="form-hint form-hint--neutral">
                                {{ synchronizationView(entry).message }}
                            </p>
                            <!-- 0.8.31 — Replica Knowledge Provenance & Synchronization
                                 Inspection. The per-dimension breakdown behind the single
                                 combined message immediately above — application/
                                 PublicationKnowledgeSynchronizationView.js's own
                                 newAnchorCount/alreadyKnownAnchorCount/newPlacementCount/
                                 alreadyKnownPlacementCount fields, UNCHANGED since 0.8.30,
                                 simply shown as their own two short rows rather than only
                                 folded into prose. Shown once a synchronize() attempt has
                                 actually completed (newAnchorCount is null before then);
                                 never a new tally of its own. -->
                            <dl v-if="synchronizationView(entry).newAnchorCount !== null" class="evidence-fields replica-sync-breakdown">
                                <div class="evidence-field">
                                    <dt>New claims</dt>
                                    <dd>Evidence: {{ synchronizationView(entry).newAnchorCount }} · Placements: {{ synchronizationView(entry).newPlacementCount }}</dd>
                                </div>
                                <div class="evidence-field">
                                    <dt>Already known</dt>
                                    <dd>Evidence: {{ synchronizationView(entry).alreadyKnownAnchorCount }} · Placements: {{ synchronizationView(entry).alreadyKnownPlacementCount }}</dd>
                                </div>
                            </dl>
                        </div>

                        <!-- 0.8.31 — Replica Knowledge Provenance & Synchronization
                             Inspection. A claim-level INVENTORY, never a verdict — see
                             application/PublicationReplicaKnowledgeDetailView.js's own
                             header. Deliberately its own disclosure, separate from "Show
                             Evidence"/"Show Placements" below (which list the CLAIMS
                             themselves): this one answers "how did THIS replica come to
                             know each one, and what has it independently observed about it
                             right now," side by side, for every known claim at once, rather
                             than one "Inspect Evidence"/"Inspect Placement" click at a
                             time. -->
                        <div v-if="entry.replicaKnowledgeDetail" class="replica-knowledge">
                            <button class="action-btn action-btn--secondary" @click="toggleReplicaKnowledge(entry)">
                                {{ entry.replicaKnowledgeExpanded ? 'Hide Replica Knowledge' : 'Show Replica Knowledge' }}
                            </button>
                            <div v-if="entry.replicaKnowledgeExpanded" class="replica-knowledge-detail">
                                <div class="replica-knowledge-dimension">
                                    <span class="decentralization-dimension-title">Evidence</span>
                                    <p class="form-hint form-hint--neutral">
                                        {{ entry.replicaKnowledgeDetail.evidence.count }} claim{{ entry.replicaKnowledgeDetail.evidence.count === 1 ? '' : 's' }}
                                        <template v-if="acquisitionBreakdownSentence(entry.replicaKnowledgeDetail.evidence.claims)"> · {{ acquisitionBreakdownSentence(entry.replicaKnowledgeDetail.evidence.claims) }}</template>
                                    </p>
                                    <ul v-if="entry.replicaKnowledgeDetail.evidence.claims.length" class="replica-knowledge-claim-list">
                                        <li v-for="claim in entry.replicaKnowledgeDetail.evidence.claims" :key="claim.anchorId" class="replica-knowledge-claim">
                                            <dl class="evidence-fields">
                                                <div class="evidence-field">
                                                    <dt>Anchor</dt>
                                                    <dd>{{ shortId(claim.anchorId) }}</dd>
                                                </div>
                                                <div class="evidence-field">
                                                    <dt>Acquisition</dt>
                                                    <dd>{{ claim.acquisitionLabel }}</dd>
                                                </div>
                                                <div class="evidence-field" v-if="claim.firstSeenAt">
                                                    <dt>First seen</dt>
                                                    <dd>{{ formatWhen(claim.firstSeenAt) }}</dd>
                                                </div>
                                                <div class="evidence-field">
                                                    <dt>Verification</dt>
                                                    <dd>{{ claim.verificationStateLabel }}</dd>
                                                </div>
                                            </dl>
                                        </li>
                                    </ul>
                                </div>
                                <div class="replica-knowledge-dimension">
                                    <span class="decentralization-dimension-title">Placements</span>
                                    <p class="form-hint form-hint--neutral">
                                        {{ entry.replicaKnowledgeDetail.placements.count }} claim{{ entry.replicaKnowledgeDetail.placements.count === 1 ? '' : 's' }}
                                        <template v-if="acquisitionBreakdownSentence(entry.replicaKnowledgeDetail.placements.claims)"> · {{ acquisitionBreakdownSentence(entry.replicaKnowledgeDetail.placements.claims) }}</template>
                                    </p>
                                    <ul v-if="entry.replicaKnowledgeDetail.placements.claims.length" class="replica-knowledge-claim-list">
                                        <li v-for="claim in entry.replicaKnowledgeDetail.placements.claims" :key="claim.placementId" class="replica-knowledge-claim">
                                            <dl class="evidence-fields">
                                                <div class="evidence-field">
                                                    <dt>Placement</dt>
                                                    <dd>{{ shortId(claim.placementId) }}</dd>
                                                </div>
                                                <div class="evidence-field">
                                                    <dt>Acquisition</dt>
                                                    <dd>{{ claim.acquisitionLabel }}</dd>
                                                </div>
                                                <div class="evidence-field" v-if="claim.firstSeenAt">
                                                    <dt>First seen</dt>
                                                    <dd>{{ formatWhen(claim.firstSeenAt) }}</dd>
                                                </div>
                                                <div class="evidence-field">
                                                    <dt>Resolution</dt>
                                                    <dd>{{ claim.resolutionStateLabel }}</dd>
                                                </div>
                                            </dl>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div v-if="entry.evidence" class="evidence-section">
                        <div class="evidence-summary">
                            <span class="evidence-summary-title">External Evidence</span>
                            <span class="form-hint form-hint--neutral">{{ describeKnownEvidenceCount(entry.evidence) }}</span>
                            <button v-if="entry.evidence.count > 0" class="action-btn action-btn--secondary" @click="toggleEvidence(entry)">
                                {{ entry.evidenceExpanded ? 'Hide Evidence' : 'Show Evidence' }}
                            </button>
                        </div>

                        <!-- 0.8.16 — Evidence Synchronization UX & Explicit Historical Discovery.
                             Deliberately NOT triggered by opening this page or expanding "Show
                             Evidence" above — only this explicit click ever asks a peer for
                             anything. Hidden entirely when no evidenceDiscoveryCoordinator was
                             provided, exactly like "Create <type> Anchor" hides with no
                             creationCoordinator. -->
                        <div v-if="evidenceDiscoveryCoordinator" class="evidence-discovery">
                            <div class="evidence-discovery-header">
                                <button class="action-btn action-btn--secondary"
                                        :disabled="entry.discoveryAttempt && entry.discoveryAttempt.discovering"
                                        @click="discoverFromPeers(entry)">
                                    {{ discoveryButtonLabel(entry) }}
                                </button>
                                <span v-if="discoveryView(entry).label" class="peer-badge" :class="discoveryBadgeClass(entry)">
                                    {{ discoveryView(entry).label }}
                                </span>
                            </div>
                            <p v-if="discoveryView(entry).message" class="form-hint form-hint--neutral">
                                {{ discoveryView(entry).message }}
                            </p>
                        </div>

                        <!-- 0.8.13 — Multi-Evidence Comparison & Conflict UX. Shown only while
                             the per-anchor evidence list below is also expanded — a "how does this
                             evidence relate to itself?" overview, never a substitute for reading the
                             individual anchor cards. Groups are shown in application/
                             PublicationEvidenceConvergence.js's own deterministic order (by
                             contentHash, never by group size) — a group with more anchors is never
                             styled, ordered, or worded as more likely correct than one with fewer. -->
                        <div v-if="entry.evidenceExpanded && entry.convergenceView && entry.convergenceView.anchorCount > 1"
                             class="evidence-convergence">
                            <span class="evidence-convergence-title">Content binding</span>
                            <div class="evidence-convergence-groups">
                                <div v-for="group in entry.convergenceView.contentGroups" :key="group.contentHash"
                                     class="evidence-convergence-group">
                                    <span class="evidence-convergence-hash">{{ shortHash(group.contentHash) }}</span>
                                    <span class="form-hint form-hint--neutral">
                                        {{ group.anchorCount }} anchor{{ group.anchorCount === 1 ? '' : 's' }}
                                    </span>
                                </div>
                            </div>
                            <p v-if="entry.convergenceView.hasConflict" class="evidence-convergence-conflict">
                                ⚠ {{ entry.convergenceView.conflictDescription }}
                            </p>
                        </div>

                        <!-- 0.8.11 — Explicit External Anchoring UX. One card per anchorType this
                             replica can currently create evidence for (application/
                             PublicationAnchorCreationCoordinator.js#availableAnchorTypes()) — hidden
                             entirely when this replica has no publisher configured, exactly like
                             "Retrieve from Peers" hides with no connected peer. Creating is always a
                             single, explicit click; the result of the most recent attempt is shown
                             here and nowhere else persists it. -->
                        <div v-if="availableAnchorTypes.length > 0" class="evidence-list">
                            <div v-for="anchorType in availableAnchorTypes" :key="anchorType" class="evidence-anchor-card">
                                <div class="evidence-anchor-header">
                                    <span class="evidence-anchor-type">{{ humanizeContentKind(anchorType) }}</span>
                                    <span v-if="creationView(entry, anchorType).label" class="peer-badge" :class="creationBadgeClass(entry, anchorType)">
                                        {{ creationView(entry, anchorType).label }}
                                    </span>
                                </div>
                                <p v-if="creationView(entry, anchorType).message" class="form-hint form-hint--neutral">
                                    {{ creationView(entry, anchorType).message }}
                                </p>
                                <p v-if="creationView(entry, anchorType).reason" class="form-hint form-hint--neutral">
                                    {{ creationView(entry, anchorType).reason }}
                                </p>
                                <dl v-if="creationView(entry, anchorType).anchor" class="evidence-fields">
                                    <div class="evidence-field"><dt>Transaction</dt><dd>{{ creationView(entry, anchorType).anchor.locator }}</dd></div>
                                    <div class="evidence-field"><dt>Content hash</dt><dd>{{ creationView(entry, anchorType).anchor.contentHash }}</dd></div>
                                </dl>
                                <div class="identity-mgmt-actions">
                                    <button class="action-btn action-btn--primary"
                                            :disabled="creationView(entry, anchorType).state === 'creating'"
                                            @click="createAnchor(entry, anchorType)">
                                        {{ creationButtonLabel(entry, anchorType) }}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div v-if="entry.evidenceExpanded && entry.evidence.count > 0" class="evidence-list">
                            <div v-for="anchorView in entry.evidence.anchors" :key="anchorView.anchorId" class="evidence-anchor-card">
                                <div class="evidence-anchor-header">
                                    <span class="evidence-anchor-type">{{ humanizeContentKind(anchorView.anchorType) }}</span>
                                    <span class="peer-badge" :class="evidenceBadgeClass(anchorView)">{{ anchorView.verificationLabel }}</span>
                                </div>
                                <p v-if="anchorView.verificationReason" class="form-hint form-hint--neutral">
                                    {{ anchorView.verificationReason }}
                                </p>
                                <p v-if="lifecycleNote(entry, anchorView)" class="form-hint form-hint--neutral">
                                    {{ lifecycleNote(entry, anchorView) }}
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
                                    <button class="action-btn action-btn--secondary" @click="toggleInspect(entry, anchorView)">
                                        {{ inspectionExpanded(entry, anchorView) ? 'Hide Details' : 'Inspect Evidence' }}
                                    </button>
                                    <button class="action-btn action-btn--secondary" :disabled="anchorView.checking"
                                            @click="verifyAnchor(entry, anchorView)">
                                        {{ anchorView.checking ? 'Verifying…' : (anchorView.verified ? 'Verify Again' : 'Verify Evidence') }}
                                    </button>
                                </div>

                                <!-- 0.8.14 — External Evidence Inspection & Locator UX. A purely
                                     local, synchronous read of THIS anchor's own fields — never a
                                     network request, never a call to evidenceCoordinator.verify().
                                     "Inspect Evidence" and "Verify Evidence"/"Verify Again" above
                                     stay two genuinely separate actions, exactly as this file's own
                                     header states. -->
                                <div v-if="inspectionExpanded(entry, anchorView) && inspectionDetail(entry, anchorView)"
                                     class="evidence-inspection">
                                    <span class="evidence-inspection-title">External Evidence</span>
                                    <p class="form-hint form-hint--neutral">{{ inspectionDetail(entry, anchorView).bindingDescription }}</p>
                                    <dl class="evidence-fields">
                                        <div class="evidence-field">
                                            <dt>{{ inspectionDetail(entry, anchorView).anchoredAtLabel }}</dt>
                                            <dd>{{ formatWhen(inspectionDetail(entry, anchorView).anchoredAt) }}</dd>
                                        </div>
                                        <div class="evidence-field"><dt>External locator</dt><dd>{{ inspectionDetail(entry, anchorView).locator }}</dd></div>
                                    </dl>

                                    <!-- Only the ONE registered anchorType-specific adapter (e.g.
                                         anchoring/BitcoinAnchorEvidenceView.js) ever produces this
                                         section — a generic anchorType with no adapter shows the
                                         fields above alone. -->
                                    <div v-if="inspectionTypeSpecific(entry, anchorView)" class="evidence-inspection-adapter">
                                        <span class="evidence-inspection-adapter-title">{{ inspectionTypeSpecific(entry, anchorView).summary }}</span>
                                        <dl class="evidence-fields">
                                            <div v-for="field in inspectionTypeSpecific(entry, anchorView).fields" :key="field.label" class="evidence-field">
                                                <dt>{{ field.label }}</dt><dd>{{ field.value }}</dd>
                                            </div>
                                        </dl>
                                        <a v-if="inspectionTypeSpecific(entry, anchorView).externalLocator"
                                           class="action-btn action-btn--secondary"
                                           :href="inspectionTypeSpecific(entry, anchorView).externalLocator.url"
                                           target="_blank" rel="noopener noreferrer">
                                            {{ inspectionTypeSpecific(entry, anchorView).externalLocator.label }}
                                        </a>
                                    </div>

                                    <!-- "proof" is shown raw and unexplained at the generic level —
                                         see application/PublicationAnchorDetailView.js's own header
                                         on why this file never reaches into it. -->
                                    <details class="evidence-inspection-proof">
                                        <summary>Proof (raw, adapter-defined evidence)</summary>
                                        <pre class="evidence-inspection-proof-json">{{ JSON.stringify(inspectionDetail(entry, anchorView).proof, null, 2) }}</pre>
                                    </details>

                                    <!-- 0.8.17 — Evidence Provenance & Observation Boundary.
                                         Deliberately separate from the "External Evidence" block
                                         above: everything above describes what the anchor CLAIMS;
                                         this describes how THIS replica came to know the claim at
                                         all — see application/PublicationAnchorKnowledgeView.js's own
                                         header on why the wording here never names a peer and never
                                         reads as a trust signal. -->
                                    <div v-if="inspectionKnowledge(entry, anchorView) && inspectionKnowledge(entry, anchorView).known"
                                         class="evidence-inspection-knowledge">
                                        <span class="evidence-inspection-title">Local Knowledge</span>
                                        <dl class="evidence-fields">
                                            <div class="evidence-field">
                                                <dt>Acquisition</dt>
                                                <dd>{{ inspectionKnowledge(entry, anchorView).acquisitionLabel }}</dd>
                                            </div>
                                            <div class="evidence-field">
                                                <dt>{{ inspectionKnowledge(entry, anchorView).firstSeenAtLabel }}</dt>
                                                <dd>{{ formatWhen(inspectionKnowledge(entry, anchorView).firstSeenAt) }}</dd>
                                            </div>
                                        </dl>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 0.8.20 — Snapshot Placement Inspection & Explicit Resolution UX.
                         Deliberately a SEPARATE section from "External Evidence" above —
                         a placement and an anchor answer two different questions, and this
                         page keeps that distinction visible rather than merging both lists.
                         Discovery here is exactly as inert as evidence discovery above:
                         loading this list on page load never calls SnapshotPlacementResolver. -->
                    <div v-if="entry.placementsView" class="evidence-section">
                        <div class="evidence-summary">
                            <span class="evidence-summary-title">Snapshot Placements</span>
                            <span class="form-hint form-hint--neutral">{{ describeKnownPlacementCount(entry.placementsView) }}</span>
                            <button v-if="entry.placementsView.count > 0" class="action-btn action-btn--secondary" @click="togglePlacements(entry)">
                                {{ entry.placementsExpanded ? 'Hide Placements' : 'Show Placements' }}
                            </button>
                        </div>

                        <!-- 0.8.25 — Explicit Snapshot Placement Creation UX. One card per
                             storage type this replica can currently place bytes onto
                             (application/SnapshotPlacementCreationCoordinator.js#
                             availableStorageTypes()) — hidden entirely when this replica has no
                             content store registered, exactly like "Create <type> Anchor" hides
                             with no creationCoordinator. Creating is always a single, explicit
                             click; the result of the most recent attempt is shown here and
                             nowhere else persists it. Never called "Publish to <storage>" — a
                             snapshot placement is a claim about WHERE bytes can presently be
                             retrieved, never a second act of publishing. -->
                        <div v-if="availableStorageTypes.length > 0" class="evidence-list">
                            <div v-for="storage in availableStorageTypes" :key="storage" class="evidence-anchor-card">
                                <div class="evidence-anchor-header">
                                    <span class="evidence-anchor-type">{{ humanizeContentKind(storage) }}</span>
                                    <span v-if="placementCreationView(entry, storage).label" class="peer-badge" :class="placementCreationBadgeClass(entry, storage)">
                                        {{ placementCreationView(entry, storage).label }}
                                    </span>
                                </div>
                                <p v-if="placementCreationView(entry, storage).message" class="form-hint form-hint--neutral">
                                    {{ placementCreationView(entry, storage).message }}
                                </p>
                                <p v-if="placementCreationView(entry, storage).reason" class="form-hint form-hint--neutral">
                                    {{ placementCreationView(entry, storage).reason }}
                                </p>
                                <dl v-if="placementCreationView(entry, storage).placement" class="evidence-fields">
                                    <div class="evidence-field"><dt>Locator</dt><dd>{{ placementCreationView(entry, storage).placement.locator }}</dd></div>
                                    <div class="evidence-field"><dt>Content hash</dt><dd>{{ placementCreationView(entry, storage).placement.contentHash }}</dd></div>
                                </dl>
                                <div class="identity-mgmt-actions">
                                    <button class="action-btn action-btn--primary"
                                            :disabled="placementCreationView(entry, storage).state === 'creating'"
                                            @click="createPlacement(entry, storage)">
                                        {{ placementCreationButtonLabel(entry, storage) }}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- 0.8.23 — Multi-Placement Convergence & Relationship UX. Shown only
                             while the per-placement list below is also expanded — a "how does
                             this placement set relate to itself?" overview, never a substitute
                             for reading the individual placement cards. Groups are shown in
                             application/PublicationSnapshotPlacementConvergence.js's own
                             deterministic order (by contentHash, never by group size) — a group
                             with more placements is never styled, ordered, or worded as more
                             likely correct, more available, or more trustworthy than one with
                             fewer. Deliberately a separate card from "Content binding" above —
                             see this file's own 0.8.23 header. -->
                        <div v-if="entry.placementsExpanded && entry.placementConvergenceView && entry.placementConvergenceView.placementCount > 1"
                             class="evidence-convergence">
                            <span class="evidence-convergence-title">Placement relationships</span>
                            <p class="form-hint form-hint--neutral">
                                {{ entry.placementConvergenceView.placementCount }} known placements
                                · {{ entry.placementConvergenceView.storageTypeCount }} storage backend{{ entry.placementConvergenceView.storageTypeCount === 1 ? '' : 's' }}
                                · {{ entry.placementConvergenceView.locatorCount }} distinct location{{ entry.placementConvergenceView.locatorCount === 1 ? '' : 's' }}
                            </p>
                            <div class="evidence-convergence-groups">
                                <div v-for="group in entry.placementConvergenceView.contentGroups" :key="group.contentHash"
                                     class="evidence-convergence-group">
                                    <span class="evidence-convergence-hash">{{ shortHash(group.contentHash) }}</span>
                                    <span class="form-hint form-hint--neutral">
                                        {{ group.placementCount }} placement{{ group.placementCount === 1 ? '' : 's' }}
                                    </span>
                                </div>
                            </div>
                            <p class="form-hint form-hint--neutral">Content binding: {{ entry.placementConvergenceView.relationship === 'conflict' ? 'CONFLICT' : 'AGREEMENT' }}</p>
                            <p v-if="entry.placementConvergenceView.hasConflict" class="evidence-convergence-conflict">
                                ⚠ {{ entry.placementConvergenceView.conflictDescription }}
                            </p>
                        </div>

                        <div v-if="entry.placementsExpanded && entry.placementsView.count > 0" class="evidence-list">
                            <div v-for="placementView in entry.placementsView.placements" :key="placementView.placementId" class="evidence-anchor-card">
                                <div class="evidence-anchor-header">
                                    <span class="evidence-anchor-type">{{ humanizeContentKind(placementView.storage) }}</span>
                                    <span class="peer-badge" :class="placementBadgeClass(placementView)">{{ placementView.resolutionLabel }}</span>
                                </div>
                                <p v-if="placementView.resolutionReason" class="form-hint form-hint--neutral">
                                    {{ placementView.resolutionReason }}
                                </p>
                                <p v-if="placementLifecycleNote(entry, placementView)" class="form-hint form-hint--neutral">
                                    {{ placementLifecycleNote(entry, placementView) }}
                                </p>
                                <dl class="evidence-fields">
                                    <div class="evidence-field"><dt>Locator</dt><dd>{{ placementView.locator }}</dd></div>
                                    <div class="evidence-field"><dt>Placed</dt><dd>{{ formatWhen(placementView.placedAt) }}</dd></div>
                                    <div class="evidence-field"><dt>Publication</dt><dd>{{ placementView.publicationId }}</dd></div>
                                    <div class="evidence-field"><dt>Content hash</dt><dd>{{ placementView.contentHash }}</dd></div>
                                    <div v-if="placementView.placerIdentityId" class="evidence-field">
                                        <dt>Placed by</dt><dd>{{ shortId(placementView.placerIdentityId) }}</dd>
                                    </div>
                                </dl>
                                <div class="identity-mgmt-actions">
                                    <button class="action-btn action-btn--secondary" @click="togglePlacementInspect(entry, placementView)">
                                        {{ placementInspectionExpanded(entry, placementView) ? 'Hide Details' : 'Inspect Placement' }}
                                    </button>
                                    <button class="action-btn action-btn--secondary" :disabled="placementView.checking"
                                            @click="resolvePlacement(entry, placementView)">
                                        {{ placementView.checking ? 'Resolving…' : (placementView.resolved ? 'Resolve Again' : 'Resolve Snapshot') }}
                                    </button>
                                    <!-- 0.8.35 — Explicit Placement-Backed Snapshot Materialization. A
                                         THIRD, genuinely separate action from "Inspect Placement" and
                                         "Resolve Snapshot" above — never triggered by either of them, and
                                         never by opening this page or expanding "Show Placements". Only
                                         this explicit click runs the SAME resolution "Resolve Snapshot"
                                         already runs and, only once it succeeds, writes the retrieved
                                         bytes into this replica's own content/ContentStore.js. Hidden
                                         entirely with no snapshotPlacementMaterializationCoordinator
                                         provided. -->
                                    <button v-if="snapshotPlacementMaterializationCoordinator" class="action-btn action-btn--primary"
                                            :disabled="placementMaterializationView(entry, placementView).materializing"
                                            @click="materializePlacement(entry, placementView)">
                                        {{ placementMaterializationButtonLabel(entry, placementView) }}
                                    </button>
                                </div>
                                <div v-if="snapshotPlacementMaterializationCoordinator && placementMaterializationView(entry, placementView).label"
                                     class="evidence-discovery-header">
                                    <span class="peer-badge" :class="placementMaterializationBadgeClass(entry, placementView)">
                                        {{ placementMaterializationView(entry, placementView).label }}
                                    </span>
                                </div>
                                <p v-if="snapshotPlacementMaterializationCoordinator && placementMaterializationView(entry, placementView).message"
                                   class="form-hint form-hint--neutral">
                                    {{ placementMaterializationView(entry, placementView).message }}
                                </p>

                                <!-- A purely local, synchronous read of THIS placement's own fields —
                                     never a network request, never a call to
                                     placementResolutionCoordinator.resolve(). "Inspect Placement" and
                                     "Resolve Snapshot"/"Resolve Again" above stay two genuinely
                                     separate actions, exactly as this file's own 0.8.20 header states. -->
                                <div v-if="placementInspectionExpanded(entry, placementView) && placementInspectionDetail(entry, placementView)"
                                     class="evidence-inspection">
                                    <span class="evidence-inspection-title">Snapshot Placement</span>
                                    <p class="form-hint form-hint--neutral">{{ placementInspectionDetail(entry, placementView).bindingDescription }}</p>
                                    <dl class="evidence-fields">
                                        <div class="evidence-field">
                                            <dt>{{ placementInspectionDetail(entry, placementView).placedAtLabel }}</dt>
                                            <dd>{{ formatWhen(placementInspectionDetail(entry, placementView).placedAt) }}</dd>
                                        </div>
                                        <div class="evidence-field"><dt>Locator</dt><dd>{{ placementInspectionDetail(entry, placementView).locator }}</dd></div>
                                    </dl>

                                    <!-- Only a registered storage-specific adapter (e.g.
                                         content/IpfsSnapshotPlacementView.js) ever produces this section —
                                         a generic storage with no adapter shows the fields above alone. -->
                                    <div v-if="placementInspectionTypeSpecific(entry, placementView)" class="evidence-inspection-adapter">
                                        <span class="evidence-inspection-adapter-title">{{ placementInspectionTypeSpecific(entry, placementView).summary }}</span>
                                        <dl class="evidence-fields">
                                            <div v-for="field in placementInspectionTypeSpecific(entry, placementView).fields" :key="field.label" class="evidence-field">
                                                <dt>{{ field.label }}</dt><dd>{{ field.value }}</dd>
                                            </div>
                                        </dl>
                                        <a v-if="placementInspectionTypeSpecific(entry, placementView).externalLocator"
                                           class="action-btn action-btn--secondary"
                                           :href="placementInspectionTypeSpecific(entry, placementView).externalLocator.url"
                                           target="_blank" rel="noopener noreferrer">
                                            {{ placementInspectionTypeSpecific(entry, placementView).externalLocator.label }}
                                        </a>
                                    </div>

                                    <!-- 0.8.24 — Snapshot Placement Provenance & Observation Boundary.
                                         Deliberately separate from the "Snapshot Placement" block above:
                                         everything above describes what the placement CLAIMS; this
                                         describes how THIS replica came to know the claim at all — see
                                         application/PublicationSnapshotPlacementKnowledgeView.js's own
                                         header on why the wording here never names a peer and never
                                         reads as a trust or availability signal. -->
                                    <div v-if="placementInspectionKnowledge(entry, placementView) && placementInspectionKnowledge(entry, placementView).known"
                                         class="evidence-inspection-knowledge">
                                        <span class="evidence-inspection-title">Local Knowledge</span>
                                        <dl class="evidence-fields">
                                            <div class="evidence-field">
                                                <dt>Acquisition</dt>
                                                <dd>{{ placementInspectionKnowledge(entry, placementView).acquisitionLabel }}</dd>
                                            </div>
                                            <div class="evidence-field">
                                                <dt>{{ placementInspectionKnowledge(entry, placementView).firstSeenAtLabel }}</dt>
                                                <dd>{{ formatWhen(placementInspectionKnowledge(entry, placementView).firstSeenAt) }}</dd>
                                            </div>
                                        </dl>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    `
};
