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
import { IpfsRemotePublicationState } from '../../application/IpfsRemotePublicationState.js';
import { describeIpfsRemotePublication, describeIpfsRemotePublishingConfiguration } from '../../application/IpfsRemotePublicationView.js';
import { IpfsRemotePublishingConfiguration } from '../../application/IpfsRemotePublishingConfiguration.js';
import { IpfsPublicationRecord, IpfsPublicationMethod } from '../../application/IpfsPublicationRecord.js';
import { IpfsPublicationContentVerificationCoordinatorState } from '../../application/IpfsPublicationContentVerificationCoordinatorState.js';
import { describeIpfsPublicationContentVerification } from '../../application/IpfsPublicationContentVerificationView.js';
import { appendIpfsPublicationRecordHistoryEntry } from '../../application/IpfsPublicationRecordHistory.js';
import { describeIpfsPublicationRecordHistory } from '../../application/IpfsPublicationRecordHistoryView.js';
import { appendIpfsPublicationContentVerificationHistoryEntry, latestIpfsPublicationContentVerification } from '../../application/IpfsPublicationContentVerificationHistory.js';
import { describeIpfsPublicationContentVerificationHistory } from '../../application/IpfsPublicationContentVerificationHistoryView.js';
import { describeIpfsPublicationObservationTimeline, IpfsPublicationObservationTimelineEntryKind } from '../../application/IpfsPublicationObservationTimelineView.js';
import { createResolutionObservation } from '../../application/SnapshotPlacementResolutionObservation.js';
import { deriveSnapshotPlacementLifecycle, describeSnapshotPlacementLifecycleNote } from '../../application/SnapshotPlacementLifecycleView.js';
import { describePublicationDecentralization, describeDecentralizationRelationshipContrast } from '../../application/PublicationDecentralizationView.js';
import { describePublicationReplicaKnowledge } from '../../application/PublicationReplicaKnowledgeView.js';
import { describePublicationReplicaKnowledgeDetail, describeAcquisitionBreakdown } from '../../application/PublicationReplicaKnowledgeDetailView.js';
import { describeSynchronizationAttempt, describeSynchronizationButtonLabel } from '../../application/PublicationKnowledgeSynchronizationView.js';
import { PublicationKnowledgeSynchronizationUiState } from '../../application/PublicationKnowledgeSynchronizationUiState.js';
import { LocalSnapshotContentAvailabilityOutcome } from '../../application/LocalSnapshotContentAvailabilityOutcome.js';
import { describeLocalSnapshotContentAvailability, describeAvailabilityCheckButtonLabel } from '../../application/LocalSnapshotContentAvailabilityView.js';
import { describePublicationSnapshotPossession } from '../../application/PublicationSnapshotPossessionView.js';
import { describePublicationReplicaContentKnowledge } from '../../application/PublicationReplicaContentKnowledgeView.js';
import { describePublicationSnapshotAcquisition } from '../../application/PublicationSnapshotAcquisitionView.js';
import { SnapshotContentMaterializationUiState } from '../../application/SnapshotContentMaterializationUiState.js';
import { describeMaterializationAttempt, describeMaterializationButtonLabel } from '../../application/SnapshotContentMaterializationView.js';
import { SnapshotPlacementMaterializationUiState } from '../../application/SnapshotPlacementMaterializationUiState.js';
import { describePlacementMaterializationAttempt, describePlacementMaterializationButtonLabel } from '../../application/SnapshotPlacementMaterializationView.js';
import { SnapshotPeerMaterializationUiState } from '../../application/SnapshotPeerMaterializationUiState.js';
import { describePeerMaterializationAttempt, describePeerMaterializationButtonLabel } from '../../application/SnapshotPeerMaterializationView.js';
import { PeerSnapshotMaterializationOutcome } from '../../application/PeerSnapshotMaterializationOutcome.js';
import { SnapshotPeerPossessionUiState } from '../../application/SnapshotPeerPossessionUiState.js';
import { describePeerPossessionAttempt, describePeerPossessionButtonLabel } from '../../application/SnapshotPeerPossessionView.js';
import { SnapshotContentTransferOutcome } from '../../application/SnapshotContentTransferOutcome.js';
import { SnapshotPlacementMaterializationOutcome } from '../../application/SnapshotPlacementMaterializationOutcome.js';
import { StoreSnapshotContentOutcome } from '../../application/StoreSnapshotContentOutcome.js';
import { createSnapshotMaterializationAttempt } from '../../application/SnapshotMaterializationAttempt.js';
import { describeLocalSnapshotMaterializationSource } from '../../application/SnapshotMaterializationView.js';
import { appendSnapshotMaterializationHistoryEntry, describeSnapshotMaterializationSourceCounts } from '../../application/SnapshotMaterializationHistory.js';
import { describeSnapshotMaterializationHistoryDetails } from '../../application/SnapshotMaterializationHistoryDetailView.js';
import { appendSnapshotPeerPossessionObservationHistoryEntry, latestSnapshotPeerPossessionObservationsByPeer } from '../../application/SnapshotPeerPossessionObservationHistory.js';
import { describeSnapshotPeerPossessionComparison, describeSnapshotPeerPossessionStateLabel, describeSnapshotPeerPossessionObservationHistory } from '../../application/SnapshotPeerPossessionComparisonView.js';
import { describeSnapshotPeerPossessionObservationDetails } from '../../application/SnapshotPeerPossessionObservationDetailView.js';
import { createSnapshotMaterializationSourceSelection } from '../../application/SnapshotMaterializationSourceSelection.js';
import { SnapshotMaterializationSourceKind } from '../../application/SnapshotMaterializationSourceKind.js';
import { describeSnapshotStateInspection } from '../../application/SnapshotStateInspectionView.js';
import { SnapshotPlacementRelationship } from '../../application/SnapshotPlacementRelationship.js';
import { BitcoinAnchorConfirmationState } from '../../application/BitcoinAnchorConfirmationState.js';
import { BitcoinAnchorContentProofState } from '../../application/BitcoinAnchorContentProofState.js';
import { appendBitcoinAnchorConfirmationObservationHistoryEntry } from '../../application/BitcoinAnchorConfirmationObservationHistory.js';
import { describeBitcoinAnchorConfirmationObservationHistoryDetails, describeBitcoinAnchorConfirmationObservationDetail } from '../../application/BitcoinAnchorConfirmationObservationHistoryDetailView.js';
import { observeBitcoinAnchorChainPlacementChanges } from '../../application/BitcoinAnchorChainPlacementObserver.js';
import { describeBitcoinAnchorChainPlacementObservations } from '../../application/BitcoinAnchorChainPlacementObservationView.js';
import { analyzeBitcoinAnchorObservationConsistency } from '../../application/BitcoinAnchorObservationConsistencyAnalyzer.js';
import { describeBitcoinAnchorObservationConsistency } from '../../application/BitcoinAnchorObservationConsistencyView.js';
import { describeBitcoinAnchorContentProof } from '../../application/BitcoinAnchorContentProofView.js';
import { BitcoinWalletConnectionState } from '../../application/BitcoinWalletConnectionState.js';
import { describeBitcoinWalletConnection } from '../../application/BitcoinWalletConnectionView.js';
import { describeBitcoinAnchorTransactionReview } from '../../application/BitcoinAnchorTransactionReviewView.js';
import { BitcoinAnchorFundingObservationState } from '../../application/BitcoinAnchorFundingObservationState.js';
import { describeBitcoinAnchorFunding } from '../../application/BitcoinAnchorFundingView.js';
import { BitcoinAnchorTransactionConstructionState } from '../../application/BitcoinAnchorTransactionConstructionState.js';
import { describeBitcoinAnchorTransactionConstruction } from '../../application/BitcoinAnchorTransactionConstructionView.js';
import { BitcoinAnchorReviewedSigningState } from '../../application/BitcoinAnchorReviewedSigningState.js';
import { describeBitcoinAnchorReviewedSigning } from '../../application/BitcoinAnchorReviewedSigningView.js';
import { BitcoinAnchorSignedPsbtFinalizationState } from '../../application/BitcoinAnchorSignedPsbtFinalizationState.js';
import { describeBitcoinAnchorSignedPsbtFinalization } from '../../application/BitcoinAnchorSignedPsbtFinalizationView.js';
import { BitcoinAnchorBroadcastState } from '../../application/BitcoinAnchorBroadcastState.js';
import { describeBitcoinAnchorBroadcast } from '../../application/BitcoinAnchorBroadcastView.js';
import { describePublicationObservationTimeline, PublicationObservationTimelineDomain, PublicationObservationTimelineEntryKind } from '../../application/PublicationObservationTimelineView.js';
import { composeBitcoinAnchorObservationEvidence } from '../../application/BitcoinAnchorObservationEvidence.js';
import { describeBitcoinAnchorObservationEvidence } from '../../application/BitcoinAnchorObservationEvidenceView.js';
import { PublicationObservationArchive } from '../../application/PublicationObservationArchive.js';
import { describePublicationObservationArchive } from '../../application/PublicationObservationArchiveView.js';
import { LocalStoragePublicationObservationArchive } from '../../storage/LocalStoragePublicationObservationArchive.js';
import { describeBitcoinAnchorObservationArchive } from '../../application/BitcoinAnchorObservationArchiveView.js';
import { reconstructBitcoinAnchorDurableEvidence } from '../../application/BitcoinAnchorDurableEvidenceView.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { describeBitcoinAnchorPublicationRecordHistory } from '../../application/BitcoinAnchorPublicationRecordHistoryView.js';
import { inspectBitcoinAnchorPublication } from '../../application/BitcoinAnchorPublicationInspectionView.js';
import {
    BitcoinAnchorPublicationLifecycleTimelineEntryKind,
    reconstructBitcoinAnchorPublicationLifecycleTimeline
} from '../../application/BitcoinAnchorPublicationLifecycleTimelineView.js';

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
// 0.8.39 — Local Snapshot Possession & Replica Content Knowledge. "Local
// Snapshot" now also shows one small, tiny composed line — "Publication:
// known/not known locally · Snapshot: available/not available" — once a
// local availability check has ever completed for this entry, THIS
// session. `replicaContentKnowledgeView(entry)` composes `catalog.has()`
// (a plain boolean; every entry already on screen came from `catalog.
// list()`, exactly like `recomputeReplicaKnowledge()` above already
// assumes) with `currentPossessionView(entry)` — a pure reshaping of
// whatever `entry.localSnapshotAvailability` (0.8.33) currently holds,
// touching no store of its own. Carries NO anchor/placement counts —
// those remain exactly where the "Decentralization" card below already
// shows them, on its own independently-gated card; this line and that
// card are two separate, un-merged facts, shown side by side, never
// combined into one score. See application/
// PublicationSnapshotPossessionView.js's and application/
// PublicationReplicaContentKnowledgeView.js's own headers, and
// docs/Principles.md, "Current Snapshot Possession Is A Local
// Observation, Not A Distributed Claim (0.8.39)."
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
//
// 0.8.43 — Unified Snapshot Acquisition Outcome & Possession UX. "Local
// Snapshot" now opens with a "Snapshot Acquisition" summary, sitting ABOVE
// every specialized disclosure it already offers (the current-possession
// check, "Materialization History," "Peer Snapshot Possession Comparison")
// — a composed view, never a replacement for any of them. `snapshotAcquisitionView(entry)`
// is a pure reshaping of two facts this page already computes independently
// — `currentPossessionView(entry)` (0.8.39) and `entry.materializationHistory`
// (0.8.38) — through application/PublicationSnapshotAcquisitionView.js; it
// touches no store, no coordinator, and no use case of its own, and never
// triggers a check or a materialization attempt merely by being read.
// Visible only once at least one of those two facts has ever been
// observed THIS session, mirroring the existing "Publication: known/not
// known locally" line's own `.checked` gate one level up. When current
// possession is NOT_AVAILABLE or CONTENT_HASH_MISMATCH, the summary adds
// one short, honest hint pointing at the sources already offered further
// down this same card ("Import Snapshot," a placement's own "Materialize
// Snapshot," a peer's own "Get Snapshot from Peer") — never a new,
// fourth materialization mechanism, and never an automatic retry: see
// application/PublicationSnapshotAcquisitionView.js's own header and
// docs/Principles.md, "Current Snapshot Possession Is Independent Of How
// The Snapshot Was Acquired (0.8.43)" and "Acquisition History Explains
// Past Attempts; It Does Not Determine Present Possession (0.8.43)."
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

// 0.8.40 — Snapshot Possession Observation Exchange. AVAILABLE/NOT_AVAILABLE
// are both simply ordinary, informative answers — neither is styled as
// "success" or "failure" the way STORED/HASH_MISMATCH above are for an
// actual materialization; only CHECKING (pending) and UNAVAILABLE (no
// answer at all) get their own distinct treatment.
const PEER_POSSESSION_BADGE_CLASSES = {
    [SnapshotPeerPossessionUiState.CHECKING]: 'peer-badge--pending',
    [SnapshotPeerPossessionUiState.AVAILABLE]: 'peer-badge--authenticated',
    [SnapshotPeerPossessionUiState.NOT_AVAILABLE]: 'peer-badge--pending',
    [SnapshotPeerPossessionUiState.UNAVAILABLE]: 'peer-badge--pending'
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

// 0.8.57 — Bitcoin Anchor Proof & Confirmation Inspection UI. Two
// DELIBERATELY SEPARATE badge maps, one per independent observation
// application/BitcoinAnchorProofReconciliationView.js's own `reconcile()`
// reports — never merged into one "anchor health" map, the identical
// restraint every badge map above already holds for its own single
// dimension. NOT_CONFIRMED reads the identical amber
// "honestly inconclusive" `peer-badge--pending` UNAVAILABLE already does
// on this map — both are simply "not yet CONFIRMED," and this map does
// not rank one above the other. HASH_MISMATCH is the one red entry on
// either map: a definite, reported rejection, exactly like REJECTED
// above.
const BITCOIN_ANCHOR_CONFIRMATION_BADGE_CLASSES = {
    [BitcoinAnchorConfirmationState.CONFIRMED]: 'peer-badge--authenticated',
    [BitcoinAnchorConfirmationState.NOT_CONFIRMED]: 'peer-badge--pending',
    [BitcoinAnchorConfirmationState.UNAVAILABLE]: 'peer-badge--pending'
};
const BITCOIN_ANCHOR_CONTENT_PROOF_BADGE_CLASSES = {
    [BitcoinAnchorContentProofState.HASH_MATCH]: 'peer-badge--authenticated',
    [BitcoinAnchorContentProofState.HASH_MISMATCH]: 'peer-badge--failed',
    [BitcoinAnchorContentProofState.UNAVAILABLE]: 'peer-badge--pending'
};

// 0.8.58 — Explicit Bitcoin Wallet Connection & Signing UX. A wallet
// connection's own badge, deliberately unrelated to either badge map
// above — Confirmation and Content proof describe a TRANSACTION already
// on Bitcoin's own network; this describes whether a browser wallet
// extension currently grants ForkBuild a signing CAPABILITY, a completely
// independent fact. UNAVAILABLE reads as the one red entry here — unlike
// the Confirmation map above, where UNAVAILABLE is deliberately amber
// alongside NOT_CONFIRMED (Bitcoin gives no definite "never confirms"
// verdict), a wallet extension being missing/locked/unreachable IS a
// definite, actionable fact a person can resolve right now (install or
// unlock it) — see anchoring/BitcoinInjectedProviderWalletAdapter.js's
// own header on why that outcome is never confused with a mid-flight
// state.
const BITCOIN_WALLET_CONNECTION_BADGE_CLASSES = {
    [BitcoinWalletConnectionState.CONNECTED]: 'peer-badge--authenticated',
    [BitcoinWalletConnectionState.CONNECTING]: 'peer-badge--pending',
    [BitcoinWalletConnectionState.DISCONNECTED]: 'peer-badge--pending',
    [BitcoinWalletConnectionState.UNAVAILABLE]: 'peer-badge--failed'
};

// 0.8.60 — Explicit Bitcoin Anchor Funding & Address Preparation. A
// funding observation's own badge, deliberately unrelated to the wallet
// connection badge map immediately above: CONNECTED names a signing
// CAPABILITY; OBSERVED here names only that a funding source answered for
// the connected account's own address — two independent facts, the
// identical separation BITCOIN_ANCHOR_CONFIRMATION_BADGE_CLASSES and
// BITCOIN_ANCHOR_CONTENT_PROOF_BADGE_CLASSES already hold from each other.
// UNSUPPORTED reads amber, not red — a real, valid address this codebase
// simply cannot estimate a fee for is not the actionable, resolvable
// failure UNAVAILABLE on the wallet-connection map above is.
const BITCOIN_ANCHOR_FUNDING_BADGE_CLASSES = {
    [BitcoinAnchorFundingObservationState.OBSERVED]: 'peer-badge--authenticated',
    [BitcoinAnchorFundingObservationState.UNSUPPORTED]: 'peer-badge--pending',
    [BitcoinAnchorFundingObservationState.UNAVAILABLE]: 'peer-badge--failed'
};

// 0.8.61 — Explicit Bitcoin Anchor Transaction Construction UI. Mirrors
// BITCOIN_ANCHOR_FUNDING_BADGE_CLASSES immediately above, one step later in
// the pipeline: CONSTRUCTING reads amber (an attempt is in flight, not yet
// a fact), CONSTRUCTED reads the same "authenticated" green a real,
// deterministic plan earns, and FAILED reads red — the identical
// "actionable, resolvable failure" red the wallet-connection badge map
// uses, never the softer amber UNSUPPORTED gets on the funding map (a
// FAILED construction can be retried with different funding, not merely
// waited out).
const BITCOIN_ANCHOR_REVIEWED_SIGNING_BADGE_CLASSES = {
    [BitcoinAnchorReviewedSigningState.SIGNING]: 'peer-badge--pending',
    [BitcoinAnchorReviewedSigningState.SIGNED]: 'peer-badge--authenticated',
    [BitcoinAnchorReviewedSigningState.DECLINED]: 'peer-badge--failed',
    [BitcoinAnchorReviewedSigningState.UNAVAILABLE]: 'peer-badge--failed',
    [BitcoinAnchorReviewedSigningState.FAILED]: 'peer-badge--failed'
};

// 0.8.63 — Explicit Signed PSBT Verification & Transaction Finalization UI.
// Mirrors BITCOIN_ANCHOR_REVIEWED_SIGNING_BADGE_CLASSES immediately above,
// one step later in the same pipeline: FINALIZING reads amber (an attempt
// is in flight, not yet a fact — necessarily brief, see application/
// BitcoinAnchorSignedPsbtFinalizationState.js's own header), FINALIZED
// reads the same "authenticated" green a real cryptographic verification
// earns, and both INVALID_SIGNATURE and FAILED read the identical
// "actionable, resolvable failure" red the signing badge map's own DECLINED
// and FAILED already use — never the softer amber this page reserves for
// "cannot presently tell," which this boundary never itself produces (see
// that state's own header on why UNAVAILABLE stays honestly unreached).
const BITCOIN_ANCHOR_SIGNED_PSBT_FINALIZATION_BADGE_CLASSES = {
    [BitcoinAnchorSignedPsbtFinalizationState.FINALIZING]: 'peer-badge--pending',
    [BitcoinAnchorSignedPsbtFinalizationState.FINALIZED]: 'peer-badge--authenticated',
    [BitcoinAnchorSignedPsbtFinalizationState.INVALID_SIGNATURE]: 'peer-badge--failed',
    [BitcoinAnchorSignedPsbtFinalizationState.UNAVAILABLE]: 'peer-badge--failed',
    [BitcoinAnchorSignedPsbtFinalizationState.FAILED]: 'peer-badge--failed'
};

// 0.8.64 — Explicit Bitcoin Anchor Broadcast UI. Mirrors
// BITCOIN_ANCHOR_SIGNED_PSBT_FINALIZATION_BADGE_CLASSES immediately above,
// one step later in the same pipeline: BROADCASTING reads amber (an
// attempt is in flight, not yet a fact — genuinely asynchronous, a real
// network round trip), BROADCASTED reads the same "authenticated" green
// the finalization badge map's own FINALIZED already uses — never a claim
// of confirmation, only that the network accepted this transaction — and
// REJECTED/UNAVAILABLE/FAILED all read the identical "actionable,
// resolvable failure" red every other failure badge on this page already
// uses.
const BITCOIN_ANCHOR_BROADCAST_BADGE_CLASSES = {
    [BitcoinAnchorBroadcastState.BROADCASTING]: 'peer-badge--pending',
    [BitcoinAnchorBroadcastState.BROADCASTED]: 'peer-badge--authenticated',
    [BitcoinAnchorBroadcastState.REJECTED]: 'peer-badge--failed',
    [BitcoinAnchorBroadcastState.UNAVAILABLE]: 'peer-badge--failed',
    [BitcoinAnchorBroadcastState.FAILED]: 'peer-badge--failed'
};

const BITCOIN_ANCHOR_TRANSACTION_CONSTRUCTION_BADGE_CLASSES = {
    [BitcoinAnchorTransactionConstructionState.CONSTRUCTING]: 'peer-badge--pending',
    [BitcoinAnchorTransactionConstructionState.CONSTRUCTED]: 'peer-badge--authenticated',
    [BitcoinAnchorTransactionConstructionState.FAILED]: 'peer-badge--failed'
};

// 0.8.68 — Explicit Remote IPFS Publishing Configuration & UX. Mirrors
// BITCOIN_ANCHOR_BROADCAST_BADGE_CLASSES immediately above exactly, one
// external boundary over: PUBLISHING reads pending, PUBLISHED reads the
// SAME "authenticated" green every other acceptance observation on this
// page already uses (never a distinct "trusted"/"safe" color — PUBLISHED
// names one fact, not a verdict), and REJECTED/UNAVAILABLE/FAILED all
// read the identical "actionable, resolvable failure" red.
const IPFS_REMOTE_PUBLICATION_BADGE_CLASSES = {
    [IpfsRemotePublicationState.PUBLISHING]: 'peer-badge--pending',
    [IpfsRemotePublicationState.PUBLISHED]: 'peer-badge--authenticated',
    [IpfsRemotePublicationState.REJECTED]: 'peer-badge--failed',
    [IpfsRemotePublicationState.UNAVAILABLE]: 'peer-badge--failed',
    [IpfsRemotePublicationState.FAILED]: 'peer-badge--failed'
};

// 0.8.70 — IPFS Publication & Content Verification UI. Mirrors
// IPFS_REMOTE_PUBLICATION_BADGE_CLASSES immediately above exactly, one
// stage later in the same pipeline: VERIFYING reads pending, HASH_MATCH
// reads the SAME "authenticated" green every other acceptance
// observation on this page already uses, and HASH_MISMATCH/UNAVAILABLE/
// FAILED all read the identical "actionable, resolvable failure" red —
// HASH_MISMATCH is a real, definite fact, never softened to look less
// alarming than an outright failure.
const IPFS_PUBLICATION_CONTENT_VERIFICATION_BADGE_CLASSES = {
    [IpfsPublicationContentVerificationCoordinatorState.VERIFYING]: 'peer-badge--pending',
    [IpfsPublicationContentVerificationCoordinatorState.HASH_MATCH]: 'peer-badge--authenticated',
    [IpfsPublicationContentVerificationCoordinatorState.HASH_MISMATCH]: 'peer-badge--failed',
    [IpfsPublicationContentVerificationCoordinatorState.UNAVAILABLE]: 'peer-badge--failed',
    [IpfsPublicationContentVerificationCoordinatorState.FAILED]: 'peer-badge--failed'
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
        // 0.8.68 — Explicit Remote IPFS Publishing Configuration & UX.
        // Optional — absent here (e.g. a test harness that never provides
        // either), the "IPFS Publishing" section simply never renders,
        // the identical degrade-gracefully posture `placementCreationCoordinator`
        // immediately above already holds. `ipfsRemotePublicationCoordinator`
        // is the ONE place this page ever calls
        // application/IpfsRemotePublicationCoordinator.js#publish() —
        // `publicationCatalogContentResolver` is the SAME resolver
        // application/CreateExternalSnapshotPlacementUseCase.js already
        // reads a publication's own locally stored bytes through, reused
        // here rather than duplicated (see ui/main.js's own 0.8.68
        // comment).
        const ipfsRemotePublicationCoordinator = inject('ipfsRemotePublicationCoordinator', null);
        const publicationCatalogContentResolver = inject('publicationCatalogContentResolver', null);
        // 0.8.70 — IPFS Publication & Content Verification UI. Optional —
        // absent here (e.g. a test harness that never provides it), the
        // "Content retrieval" sub-section simply never renders, the
        // identical degrade-gracefully posture every other optional
        // coordinator on this page already holds.
        const ipfsPublicationContentVerificationCoordinator = inject('ipfsPublicationContentVerificationCoordinator', null);
        // 0.8.75 — Durable Publication Observation Records. Unlike every
        // other injected coordinator on this page, this one has a real,
        // safe, zero-config default: storage/
        // LocalStoragePublicationObservationArchive.js's own constructor
        // already defaults to a real, browser-backed storage/
        // LocalStorageProvider.js. A caller (a test harness, most likely)
        // can still inject its own instance — over an in-memory
        // StorageProvider, say — to keep persistence out of a real
        // browser's localStorage entirely.
        const publicationObservationArchiveStorage = inject('publicationObservationArchiveStorage', null)
            || new LocalStoragePublicationObservationArchive();
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
        // 0.8.40 — Snapshot Possession Observation Exchange. Optional —
        // absent here, "Peer Snapshot Possession" simply never renders,
        // the identical degrade-gracefully posture every optional
        // coordinator above already holds. Deliberately independent of
        // `snapshotPeerMaterializationCoordinator` immediately above: one
        // asks a peer for bytes, this one only ever asks a peer a
        // question — see application/ObservePeerSnapshotPossessionUseCase.js's
        // own header on why neither ever calls the other.
        const snapshotPeerPossessionCoordinator = inject('snapshotPeerPossessionCoordinator', null);
        // 0.8.42 — Explicit Snapshot Source Selection & Materialization UX.
        // Optional — absent here, "Get Snapshot" never renders on a Peer
        // Snapshot Possession Comparison row, the identical
        // degrade-gracefully posture every coordinator above already
        // holds. Used ONLY to turn an already-rendered peer observation
        // row into an explicit action — see `materializeFromComparisonPeer()`
        // below; never used to discover, rank, or automatically choose a
        // peer on a person's behalf.
        const snapshotMaterializationSelectionCoordinator = inject('snapshotMaterializationSelectionCoordinator', null);
        // 0.8.57 — Bitcoin Anchor Proof & Confirmation Inspection UI.
        // Optional — absent here, the "Bitcoin Anchor" section simply never
        // renders on any evidence card, the identical degrade-gracefully
        // posture every optional coordinator above already holds. The ONE
        // place this page ever asks the Bitcoin network about confirmation
        // or content-hash proof — see `reconcileBitcoinAnchor()` below, and
        // application/BitcoinAnchorProofReconciliationView.js's own header
        // on why it composes, rather than duplicates, application/
        // BitcoinAnchorConfirmationObserver.js and anchoring/
        // BitcoinOpReturnProofVerifier.js.
        const bitcoinAnchorProofReconciliationView = inject('bitcoinAnchorProofReconciliationView', null);
        // 0.8.58 — Explicit Bitcoin Wallet Connection & Signing UX.
        // Optional — absent here, the "Bitcoin Wallet" section simply never
        // renders, the identical degrade-gracefully posture every optional
        // coordinator on this page already holds. Deliberately independent
        // of `bitcoinAnchorProofReconciliationView` immediately above:
        // reading confirmation/content-proof status needs no wallet at
        // all, and connecting a wallet reads or changes no anchor, no
        // publication, and no confirmation history — see
        // anchoring/BitcoinWalletConnection.js's own header on why this is
        // the ONE place this page ever asks a browser wallet extension for
        // an account or a signing capability. This single injected
        // instance is shared across every evidence card on this page —
        // connecting once is reflected everywhere, exactly like
        // `bitcoinAnchorProofReconciliationView` above being one shared
        // reconciliation view rather than one per card.
        const bitcoinWalletConnection = inject('bitcoinWalletConnection', null);
        // 0.8.60 — Explicit Bitcoin Anchor Funding & Address Preparation.
        // Optional — absent here, the "Bitcoin Funding" section simply
        // never renders, the identical degrade-gracefully posture every
        // optional coordinator on this page already holds. Page-level, not
        // per evidence card — the identical reasoning
        // `bitcoinAnchorTransactionReview` below already holds: funding is
        // being prepared for a transaction that has NOT YET been built, so
        // there is no evidence entry for it to attach to. This is the ONE
        // place this page ever asks a funding source what a connected
        // wallet's own account can currently spend — see anchoring/
        // BitcoinWalletFundingObserver.js's own header on why that is
        // always a fresh, explicitly-triggered observation, never a
        // background poll.
        const bitcoinWalletFundingObserver = inject('bitcoinWalletFundingObserver', null);
        // 0.8.59/0.8.62 — Explicit Bitcoin Anchor Transaction Review &
        // Signing UI. `bitcoinAnchorTransactionReview` is now this page's
        // OWN reactive holder (declared below, alongside
        // `bitcoinWalletConnectionState`) for the single, page-level
        // transaction presently under review — never an injected object, a
        // design 0.8.59 first sketched but never wired (nothing ever
        // provided it; `describeBitcoinAnchorTransactionReview()` always
        // saw `null`). This milestone completes that wiring: a review
        // exists for a transaction that has NOT YET been published — there
        // is no evidence entry for it to attach to — so, exactly as before,
        // this stays a single, page-level fact, populated by
        // `constructBitcoinAnchorTransaction()` below rather than by a
        // composition root.
        //
        // 0.8.62 — Explicit Reviewed Bitcoin Anchor Signing UI. Optional —
        // absent either coordinator, no PSBT is ever built and no "Sign
        // Reviewed Transaction" button ever renders, the identical
        // degrade-gracefully posture every optional coordinator on this
        // page already holds. `bitcoinAnchorTransactionReviewCoordinator`
        // is the new bridge that turns an already-CONSTRUCTED plan (0.8.61)
        // into the PSBT-shaped description 0.8.59's own review and signer
        // have always required; `bitcoinAnchorReviewedSigningCoordinator`
        // is the new coordinator behind the explicit signing action itself.
        // See application/BitcoinAnchorTransactionReviewCoordinator.js and
        // application/BitcoinAnchorReviewedSigningCoordinator.js's own
        // headers — neither ever signs, finalizes, or broadcasts anything
        // on its own; this page still only ever displays what it is handed
        // and acts only on an explicit click.
        const bitcoinAnchorTransactionReviewCoordinator = inject('bitcoinAnchorTransactionReviewCoordinator', null);
        const bitcoinAnchorReviewedSigningCoordinator = inject('bitcoinAnchorReviewedSigningCoordinator', null);
        // 0.8.63 — Explicit Signed PSBT Verification & Transaction
        // Finalization UI. Optional — absent here, no "Verify & Finalize
        // Transaction" action ever renders, the identical degrade-gracefully
        // posture every optional coordinator on this page already holds.
        // `bitcoinAnchorSignedPsbtFinalizationCoordinator` is a thin bridge
        // to the unchanged 0.8.51 anchoring/BitcoinAnchorSignedPsbtFinalizer.js
        // — see application/BitcoinAnchorSignedPsbtFinalizationCoordinator.js's
        // own header on why no new cryptography lives here either.
        const bitcoinAnchorSignedPsbtFinalizationCoordinator = inject('bitcoinAnchorSignedPsbtFinalizationCoordinator', null);
        // 0.8.64 — Explicit Bitcoin Anchor Broadcast UI. Optional — absent
        // here, no "Broadcast Transaction" action ever renders, the
        // identical degrade-gracefully posture every optional coordinator
        // on this page already holds. `bitcoinAnchorBroadcastCoordinator`
        // is a thin bridge to the unchanged 0.8.52
        // anchoring/BitcoinAnchorTransactionBroadcaster.js — see
        // application/BitcoinAnchorBroadcastCoordinator.js's own header on
        // why no new Bitcoin logic lives here either, and why it only ever
        // accepts the exact output of a successful finalization.
        const bitcoinAnchorBroadcastCoordinator = inject('bitcoinAnchorBroadcastCoordinator', null);
        // 0.8.65 — Explicit Bitcoin Anchor Confirmation UI. Optional —
        // absent here, no "Observe Confirmation" action ever renders, the
        // identical degrade-gracefully posture every optional coordinator
        // on this page already holds. `bitcoinAnchorConfirmationCoordinator`
        // is a thin bridge to the unchanged 0.8.54
        // anchoring/BitcoinAnchorConfirmationObserver.js — see application/
        // BitcoinAnchorConfirmationCoordinator.js's own header on why it
        // only ever observes the exact txid a real BROADCASTED outcome
        // carries, never an arbitrary displayed value. This is a SEPARATE
        // coordinator instance from `bitcoinAnchorProofReconciliationView`
        // above, even though both ultimately read through the SAME
        // injected observer — this one is bound to THIS page's own
        // captured broadcast identity, that one to a persisted
        // PublicationAnchor's own `proof.txid`.
        const bitcoinAnchorConfirmationCoordinator = inject('bitcoinAnchorConfirmationCoordinator', null);
        // 0.8.61 — Explicit Bitcoin Anchor Transaction Construction UI.
        // Optional — absent here, no "Create Transaction Plan" action ever
        // renders, the identical degrade-gracefully posture every optional
        // coordinator on this page already holds. ONE shared instance,
        // exactly like `bitcoinWalletFundingObserver`/`bitcoinWalletConnection`
        // above: constructing a plan for one publication uses no state that
        // is specific to any other. See application/
        // BitcoinAnchorTransactionConstructionCoordinator.js's own header
        // on why this is a deliberately thin wiring on top of the unchanged
        // 0.8.47 builder — it never observes funding itself, so this page
        // still requires an explicit, already-OBSERVED `bitcoinAnchorFundingState.observation`
        // before "Create Transaction Plan" does anything.
        const bitcoinAnchorTransactionConstructionCoordinator = inject('bitcoinAnchorTransactionConstructionCoordinator', null);

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

        // 0.8.58 — Explicit Bitcoin Wallet Connection & Signing UX. ONE
        // shared reactive mirror of `bitcoinWalletConnection`'s own
        // `status`/`account`/`network` — never per-publication, unlike
        // `entry.bitcoinAnchorReconciliations` above, because a browser
        // wallet extension is a single, session-wide capability, not a
        // fact about any one publication's own evidence. Vue cannot see
        // through a plain class instance's own mutations, so
        // `connectBitcoinWallet()`/`disconnectBitcoinWallet()` below copy
        // `bitcoinWalletConnection`'s own state into this object after
        // every call — the same "the UI owns the reactive result of an
        // injected collaborator's own call" discipline `entry.
        // bitcoinAnchorReconciliations[anchorId]` already holds, one level
        // less nested because there is exactly one wallet, not one per
        // anchor.
        const bitcoinWalletConnectionState = reactive({
            status: BitcoinWalletConnectionState.DISCONNECTED,
            account: null,
            network: null,
            reason: null
        });

        // 0.8.60 — Explicit Bitcoin Anchor Funding & Address Preparation.
        // ONE shared reactive holder for the single, page-level funding
        // observation this page ever asks for — the identical "the UI owns
        // the reactive result of an injected collaborator's own call"
        // discipline `bitcoinWalletConnectionState` immediately above
        // already holds, one level over: `observation` is `null` until
        // `observeBitcoinAnchorFunding()` below is explicitly clicked, and
        // is replaced wholesale — never merged or patched — by every
        // subsequent "Refresh Funding" click, exactly as anchoring/
        // BitcoinWalletFundingObserver.js's own header requires ("EVERY
        // OBSERVATION IS A FRESH READ, NEVER... REMEMBERED").
        const bitcoinAnchorFundingState = reactive({
            observing: false,
            observation: null,
            error: null
        });
        const bitcoinAnchorFundingUtxosExpanded = ref(false);

        // 0.8.59/0.8.62 — Explicit Bitcoin Anchor Transaction Review &
        // Signing UI. ONE shared reactive holder for the single,
        // page-level transaction presently under review — see this file's
        // own `bitcoinAnchorTransactionReviewCoordinator` injection comment
        // above on why this replaces the never-wired 0.8.59 injection of
        // the same name. `description` is `null` until
        // `constructBitcoinAnchorTransaction()` below both constructs a
        // plan AND successfully bridges it to a signable PSBT description;
        // `reason` names honestly why bridging failed (e.g. an account this
        // codebase cannot yet decode a scriptPubKey for) when it did.
        // Replaced wholesale, never merged, by every subsequent "Create
        // Transaction Plan" click — exactly as `bitcoinAnchorFundingState`
        // above already requires of itself.
        const bitcoinAnchorTransactionReview = reactive({
            description: null,
            publicationId: null,
            reason: null
        });

        // 0.8.62 — Explicit Reviewed Bitcoin Anchor Signing UI. The single,
        // page-level result of the last explicit "Sign Reviewed
        // Transaction" click — `null` until one has ever been made for the
        // CURRENT review. Held as a plain ref, replaced wholesale by
        // `signBitcoinAnchorReviewedTransaction()` below and reset to
        // `null` by every fresh `constructBitcoinAnchorTransaction()` call,
        // exactly as application/BitcoinAnchorReviewedSigningState.js's own
        // header requires: "a fresh plan always starts unsigned again,
        // never inheriting a previous plan's own SIGNED outcome."
        const bitcoinAnchorReviewedSigningOutcome = ref(null);

        // 0.8.63 — Explicit Signed PSBT Verification & Transaction
        // Finalization UI. The single, page-level result of the last
        // explicit "Verify & Finalize Transaction" click — `null` until one
        // has ever been made for the CURRENT signed PSBT. Held as a plain
        // ref, replaced wholesale by `finalizeBitcoinAnchorSignedPsbt()`
        // below, and reset to `null` by every fresh "Sign Reviewed
        // Transaction" click AND every fresh "Create Transaction Plan"
        // click — a newly signed PSBT always starts unfinalized again,
        // never inheriting a previous attempt's own FINALIZED outcome. See
        // application/BitcoinAnchorSignedPsbtFinalizationState.js's own
        // header, and `bitcoinAnchorReviewedSigningOutcome`'s own
        // declaration immediately above, the identical restraint one stage
        // earlier.
        const bitcoinAnchorSignedPsbtFinalizationOutcome = ref(null);

        // 0.8.64 — Explicit Bitcoin Anchor Broadcast UI.
        //
        // `bitcoinAnchorFinalizedTransaction` is the exact finalization
        // ARTIFACT a broadcast attempt is bound to — `{ txid, rawTransaction,
        // finalizedAt }` — captured once, the moment `finalizeBitcoinAnchorSignedPsbt()`
        // below produces a FINALIZED outcome, and handed to
        // `bitcoinAnchorBroadcastCoordinator.broadcast()` completely
        // unmodified. This is deliberately a SEPARATE fact from
        // `bitcoinAnchorSignedPsbtFinalizationOutcome` immediately above —
        // not merely `broadcastReady = true` — so a broadcast attempt is
        // always tied to a specific transaction's own identity, never to
        // "whatever this page happens to be displaying right now." Reset to
        // `null` at the exact same three points `bitcoinAnchorSignedPsbtFinalizationOutcome`
        // itself is retired (a fresh "Create Transaction Plan", "Sign
        // Reviewed Transaction", or "Verify & Finalize Transaction" click)
        // — a new transaction, once constructed, reviewed, or signed, never
        // leaves a previous transaction's own finalized bytes eligible for
        // broadcast.
        const bitcoinAnchorFinalizedTransaction = ref(null);

        // The single, page-level result of the last explicit "Broadcast
        // Transaction" click — `null` until one has ever been made for the
        // CURRENT finalized transaction. Held as a plain ref, replaced
        // wholesale by `broadcastBitcoinAnchorTransaction()` below, and
        // reset to `null` every time `bitcoinAnchorFinalizedTransaction`
        // itself is retired — a newly finalized transaction always starts
        // unbroadcast again, never inheriting a previous attempt's own
        // BROADCASTED outcome. See application/BitcoinAnchorBroadcastState.js's
        // own header, and `bitcoinAnchorSignedPsbtFinalizationOutcome`'s own
        // declaration immediately above, the identical restraint one stage
        // earlier.
        const bitcoinAnchorBroadcastOutcome = ref(null);

        // 0.8.74 — Cross-Domain Publication Observation Timeline.
        //
        // `bitcoinAnchorBroadcastedAt` is the ONE new piece of state this
        // milestone adds to the broadcast flow above — the moment THIS
        // replica observed `bitcoinAnchorBroadcastOutcome` settle, captured
        // once, in `broadcastBitcoinAnchorTransaction()` below. Application/
        // BitcoinAnchorBroadcastCoordinator.js's own outcome carries no
        // timestamp of its own (see that file's own header) — broadcasting
        // is a one-time action a caller observes once, not a durable,
        // timestamped domain fact — so this page captures it itself,
        // mirroring exactly how `bitcoinAnchorFinalizedTransaction`'s own
        // `finalizedAt: Date.now()` above already captures an equivalent
        // fact one stage earlier in the identical pipeline. Reset to `null`
        // at the exact same three points `bitcoinAnchorBroadcastOutcome`
        // itself is retired, immediately below each of those. See
        // application/PublicationObservationTimelineView.js's own header —
        // `crossDomainPublicationObservationTimelineView()` further below
        // reads this to build one, and only one, Bitcoin broadcast entry
        // for the session's own freshly broadcast transaction; a discovered,
        // already-catalogued anchor never gets one, because no independent
        // broadcast observation exists for it in this replica.
        const bitcoinAnchorBroadcastedAt = ref(null);

        // 0.8.65 — Explicit Bitcoin Anchor Confirmation UI.
        //
        // `bitcoinAnchorBroadcastConfirmationOutcome` is the single,
        // page-level result of the MOST RECENT explicit "Observe
        // Confirmation" click, bound to `bitcoinAnchorBroadcastOutcome`'s
        // own txid — never to whatever txid happens to be displayed
        // anywhere else on this page (see `observeBitcoinAnchorBroadcastConfirmation()`
        // below, and application/BitcoinAnchorConfirmationCoordinator.js's
        // own header). `null` until a BROADCASTED outcome exists AND at
        // least one "Observe Confirmation" click has completed for it.
        // Reaching BROADCASTED never populates this automatically — this
        // ref is written ONLY by an explicit click, never by
        // `broadcastBitcoinAnchorTransaction()` itself.
        //
        // `bitcoinAnchorBroadcastConfirmationHistory` is the FULL
        // chronological sequence of every "Observe Confirmation" click's
        // own observation for the CURRENT broadcast transaction — built
        // with application/BitcoinAnchorConfirmationObservationHistory.js
        // (0.8.56) UNCHANGED, the SAME append-only mechanism
        // `entry.bitcoinAnchorConfirmationHistories[anchorId]` below
        // already uses for "Reconcile" clicks against a persisted anchor —
        // a DIFFERENT, separately kept history, never merged with that
        // one. Every click appends; none is ever rewritten into "the
        // current one."
        //
        // Both, along with the observing/error/disclosure state below, are
        // reset at the exact same three points `bitcoinAnchorBroadcastOutcome`
        // itself is retired (a fresh "Create Transaction Plan", "Sign
        // Reviewed Transaction", or "Verify & Finalize Transaction" click)
        // — a new transaction, once constructed, reviewed, signed, or
        // finalized, never leaves a previous transaction's own confirmation
        // context observable or clickable.
        const bitcoinAnchorBroadcastConfirmationOutcome = ref(null);
        const bitcoinAnchorBroadcastConfirmationHistory = ref([]);
        const bitcoinAnchorBroadcastConfirmationObserving = ref(false);
        const bitcoinAnchorBroadcastConfirmationError = ref(null);
        const bitcoinAnchorBroadcastConfirmationHistoryExpanded = ref(false);
        const bitcoinAnchorBroadcastConfirmationHistoryEntryExpanded = ref({});

        function retireBitcoinAnchorBroadcastConfirmationContext() {
            bitcoinAnchorBroadcastConfirmationOutcome.value = null;
            bitcoinAnchorBroadcastConfirmationHistory.value = [];
            bitcoinAnchorBroadcastConfirmationObserving.value = false;
            bitcoinAnchorBroadcastConfirmationError.value = null;
            bitcoinAnchorBroadcastConfirmationHistoryExpanded.value = false;
            bitcoinAnchorBroadcastConfirmationHistoryEntryExpanded.value = {};
        }

        // 0.8.75 — Durable Publication Observation Records. The one
        // piece of page-level state this milestone adds: a durable,
        // cross-domain application/PublicationObservationArchive.js
        // instance, loaded once from `publicationObservationArchiveStorage`
        // at mount (see onMounted() below) and kept in sync with it by
        // every explicit `archiveXxx()` helper further down this file —
        // never a second, separate in-memory history of its own.
        //
        // EVERY EXISTING HISTORY ON THIS PAGE STAYS EXACTLY AS EPHEMERAL
        // AS ITS OWN HEADER ALREADY SAYS. `entry.ipfsPublicationRecordHistory`,
        // `entry.ipfsPublicationVerificationHistoriesByRecordIndex`,
        // `entry.bitcoinAnchorConfirmationHistories`, and
        // `bitcoinAnchorBroadcastConfirmationHistory` are UNCHANGED by
        // this milestone — still reset the moment this page reloads,
        // still never themselves read from or written to anything
        // durable. `publicationObservationArchive` is a SEPARATE,
        // ADDITIONAL copy of the same underlying facts, kept durable —
        // appending to it never touches any of those existing histories,
        // and vice versa; every append site below does both, explicitly,
        // side by side.
        const publicationObservationArchive = ref(PublicationObservationArchive.empty());
        const publicationObservationArchiveExpanded = ref(false);

        // Best-effort: a failed save (a full or disabled localStorage) is
        // never allowed to interrupt the in-memory fact this page just
        // observed, or the explicit action that produced it — it only
        // means this one fact will not survive a reload.
        function persistPublicationObservationArchive() {
            try {
                publicationObservationArchiveStorage.save(publicationObservationArchive.value);
            } catch (error) {
                // Intentionally swallowed — see this function's own comment above.
            }
        }

        // Called immediately after `entry.ipfsPublicationRecordHistory` is
        // appended to, with that SAME record and its SAME newly-appended
        // `localIndex` in `entry.ipfsPublicationRecordHistory`. Records
        // `entry.archiveIpfsRecordIndexByLocalIndex[localIndex]` — the
        // position the record landed at in the shared, page-level
        // archive's own `ipfsPublicationRecords`, a DIFFERENT index than
        // `localIndex` itself, since the archive holds every entry's own
        // records together — so a later verification of this exact
        // record can find its way back to this exact archive position.
        function archivePublishIpfsRecord(entry, localIndex, record) {
            publicationObservationArchive.value = publicationObservationArchive.value.appendIpfsPublicationRecord(record);
            entry.archiveIpfsRecordIndexByLocalIndex[localIndex] = publicationObservationArchive.value.ipfsPublicationRecords.length - 1;
            persistPublicationObservationArchive();
        }

        // Called immediately after `entry.ipfsPublicationVerificationHistoriesByRecordIndex[localIndex]`
        // is appended to. A record this replica never itself archived (this
        // entry's own `archiveIpfsRecordIndexByLocalIndex[localIndex]` is
        // unset — e.g. a record discovered from elsewhere rather than
        // published by this page) contributes no archived observation
        // either — this function never guesses an archive position.
        function archiveIpfsVerificationObservation(entry, localIndex, observation) {
            const archiveIndex = entry.archiveIpfsRecordIndexByLocalIndex[localIndex];
            if (!Number.isInteger(archiveIndex)) return;
            publicationObservationArchive.value = publicationObservationArchive.value.appendIpfsContentVerificationObservation(archiveIndex, observation);
            persistPublicationObservationArchive();
        }

        // `recordIndex` is always `null` here — this page has never
        // tracked which IPFS publication record a given Bitcoin anchor
        // corresponds to (see crossDomainPublicationObservationTimelineView()'s
        // own header below, "NO recordIndex LINKAGE IS SUPPLIED"), and
        // this archive holds the identical restraint rather than guessing
        // one from a shared contentHash.
        function archiveBitcoinBroadcast({ anchorId, txid, state, reason, broadcastedAt }) {
            publicationObservationArchive.value = publicationObservationArchive.value.appendBitcoinBroadcastRecord({
                recordIndex: null, anchorId, txid, state, reason, broadcastedAt
            });
            persistPublicationObservationArchive();
        }

        function archiveBitcoinConfirmationObservation(anchorId, observation) {
            publicationObservationArchive.value = publicationObservationArchive.value.appendBitcoinConfirmationObservation(anchorId, observation);
            persistPublicationObservationArchive();
        }

        function archiveBitcoinContentProofObservation(anchorId, observation) {
            publicationObservationArchive.value = publicationObservationArchive.value.appendBitcoinContentProofObservation(anchorId, observation);
            persistPublicationObservationArchive();
        }

        // 0.8.80 — Explicit Bitcoin Anchor Publication Lifecycle Record.
        //
        // Stateless — application/CreateBitcoinAnchorPublicationRecordUseCase.js
        // takes no collaborator of its own, so this is constructed directly
        // rather than injected, exactly like every other pure composition
        // function this page already calls unwired (e.g.
        // describeBitcoinAnchorObservationArchive()).
        const createBitcoinAnchorPublicationRecordUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();

        // Called ONCE, from `finalizeBitcoinAnchorSignedPsbt()` below, the
        // moment a "Verify & Finalize Transaction" click reaches its own
        // FINALIZED outcome — never at funding, construction, review, or
        // signing, and never re-called on a later broadcast attempt for the
        // SAME finalized transaction. Mints this replica's own durable
        // identity for this publication attempt; whether the broadcast
        // that follows succeeds or fails never retroactively erases it. See
        // application/CreateBitcoinAnchorPublicationRecordUseCase.js's own
        // header.
        function archiveBitcoinAnchorPublicationRecord({ anchorId, contentHash, txid, network, createdAt }) {
            publicationObservationArchive.value = createBitcoinAnchorPublicationRecordUseCase.execute(publicationObservationArchive.value, {
                anchorId, contentHash, txid, network, createdAt
            });
            persistPublicationObservationArchive();
        }

        // Pure projection over `publicationObservationArchive` through
        // application/PublicationObservationArchiveView.js's own
        // `describePublicationObservationArchive()` — never a second,
        // competing summary computed inline here.
        function publicationObservationArchiveView() {
            return describePublicationObservationArchive(publicationObservationArchive.value);
        }

        function togglePublicationObservationArchive() {
            publicationObservationArchiveExpanded.value = !publicationObservationArchiveExpanded.value;
        }

        // THE ONE EXPLICIT, DESTRUCTIVE ACTION IN THIS MILESTONE. Never
        // called by anything above — not a fresh publish, not a
        // reconfiguration, not a page reload. A person clicks "Clear
        // Archive" to reach this, and only this.
        function clearPublicationObservationArchive() {
            publicationObservationArchive.value = PublicationObservationArchive.empty();
            publicationObservationArchiveStorage.clear();
        }

        // 0.8.79 — Durable Bitcoin Anchor Evidence Restoration & Historical
        // Inspection.
        //
        // A second, deliberately separate disclosure over the SAME
        // `publicationObservationArchive` the "Observation Archive" card
        // above already reads — never a second archive, never a second
        // persisted copy. Where that card narrates a single, cross-domain
        // CHRONOLOGICAL timeline, this one is scoped to Bitcoin anchors
        // specifically and organized BY ANCHOR: application/
        // BitcoinAnchorObservationArchiveView.js's own
        // `describeBitcoinAnchorObservationArchive()` lists every anchorId
        // this archive holds any Bitcoin fact for, and application/
        // BitcoinAnchorDurableEvidenceView.js's own
        // `reconstructBitcoinAnchorDurableEvidence()` reconstructs one
        // anchor's own full evidence bundle — broadcast, confirmation,
        // content-proof, chain-placement, consistency — ENTIRELY FROM
        // ALREADY-PERSISTED FACTS, deriving those last two sections fresh
        // on every read rather than reading anything this milestone stored
        // for them, exactly as both files' own headers require. Expanding
        // an anchor here performs ZERO network operations — the identical
        // restraint the "Observation Archive" card above already holds.
        const historicalBitcoinAnchorsExpanded = ref(false);
        const historicalBitcoinAnchorEntryExpanded = reactive({});

        function toggleHistoricalBitcoinAnchors() {
            historicalBitcoinAnchorsExpanded.value = !historicalBitcoinAnchorsExpanded.value;
        }

        // Pure projection — never a second, competing per-anchor index
        // computed inline here.
        function historicalBitcoinAnchorArchiveView() {
            return describeBitcoinAnchorObservationArchive(publicationObservationArchive.value);
        }

        function toggleHistoricalBitcoinAnchorEntry(anchorId) {
            historicalBitcoinAnchorEntryExpanded[anchorId] = !historicalBitcoinAnchorEntryExpanded[anchorId];
        }

        function isHistoricalBitcoinAnchorEntryExpanded(anchorId) {
            return Boolean(historicalBitcoinAnchorEntryExpanded[anchorId]);
        }

        // The one anchorId → reconstructed evidence lookup this section
        // ever performs — never by contentHash, never by txid. See
        // application/BitcoinAnchorDurableEvidenceView.js's own header.
        function historicalBitcoinAnchorEvidenceView(anchorId) {
            return reconstructBitcoinAnchorDurableEvidence(publicationObservationArchive.value, anchorId);
        }

        // 0.8.80 — Explicit Bitcoin Anchor Publication Lifecycle Record.
        //
        // A DIFFERENT INDEX THAN "Historical Bitcoin Anchor Evidence"
        // ABOVE. That card lists every `anchorId` this archive holds ANY
        // Bitcoin fact for; this one lists only the `anchorId`s this
        // replica minted an explicit PUBLICATION IDENTITY for — a
        // narrower, and deliberately different, question. An anchor
        // broadcast before this milestone existed (or discovered from
        // elsewhere, never finalized by this replica) can appear above
        // without ever appearing here, and that is correct, not a bug.
        const bitcoinAnchorPublicationsExpanded = ref(false);
        const bitcoinAnchorPublicationInspectionExpanded = reactive({});

        function toggleBitcoinAnchorPublications() {
            bitcoinAnchorPublicationsExpanded.value = !bitcoinAnchorPublicationsExpanded.value;
        }

        // Pure projection — never a second, competing record listing
        // computed inline here.
        function bitcoinAnchorPublicationRecordHistoryView() {
            return describeBitcoinAnchorPublicationRecordHistory(publicationObservationArchive.value.bitcoinAnchorPublicationRecords);
        }

        function toggleBitcoinAnchorPublicationInspection(anchorId) {
            bitcoinAnchorPublicationInspectionExpanded[anchorId] = !bitcoinAnchorPublicationInspectionExpanded[anchorId];
        }

        function isBitcoinAnchorPublicationInspectionExpanded(anchorId) {
            return Boolean(bitcoinAnchorPublicationInspectionExpanded[anchorId]);
        }

        // "Inspect Observations" — joins this one publication's own
        // identity back to application/BitcoinAnchorDurableEvidenceView.js's
        // own (0.8.79, unchanged) reconstructed evidence for the identical
        // anchorId. Performs zero network operations, exactly like
        // `historicalBitcoinAnchorEvidenceView()` above.
        function bitcoinAnchorPublicationInspectionView(anchorId) {
            return inspectBitcoinAnchorPublication(publicationObservationArchive.value, anchorId);
        }

        // 0.8.81 — Bitcoin Anchor Publication Lifecycle Timeline.
        //
        // A THIRD, DIFFERENT DISCLOSURE FOR THE SAME ROW — never a
        // replacement for "Inspect Observations" above. That disclosure
        // groups this publication's own five fact categories UNDER THEIR
        // OWN HEADINGS; this one interleaves the exact same, already-described
        // facts into ONE chronological read. Neither is more authoritative
        // than the other — they are two different projections over the
        // identical durable facts. Collapsed by default, and computes
        // nothing of its own: every field a row shows is read straight off
        // reconstructBitcoinAnchorPublicationLifecycleTimeline()'s own
        // output. Performs zero network operations.
        const bitcoinAnchorPublicationLifecycleExpanded = reactive({});

        function toggleBitcoinAnchorPublicationLifecycle(anchorId) {
            bitcoinAnchorPublicationLifecycleExpanded[anchorId] = !bitcoinAnchorPublicationLifecycleExpanded[anchorId];
        }

        function isBitcoinAnchorPublicationLifecycleExpanded(anchorId) {
            return Boolean(bitcoinAnchorPublicationLifecycleExpanded[anchorId]);
        }

        function bitcoinAnchorPublicationLifecycleTimelineView(anchorId) {
            return reconstructBitcoinAnchorPublicationLifecycleTimeline(publicationObservationArchive.value, anchorId);
        }

        function bitcoinAnchorPublicationLifecycleEntryDetail(item) {
            switch (item.kind) {
                case BitcoinAnchorPublicationLifecycleTimelineEntryKind.PUBLICATION:
                    return `Content hash ${item.contentHash} — txid ${item.txid} — ${item.network}`;
                case BitcoinAnchorPublicationLifecycleTimelineEntryKind.BROADCAST:
                    return item.stateLabel + (item.txid ? ` — txid ${item.txid}` : '');
                case BitcoinAnchorPublicationLifecycleTimelineEntryKind.CONFIRMATION:
                    return item.stateLabel + (item.blockHeight != null ? ` — block height ${item.blockHeight}` : '');
                case BitcoinAnchorPublicationLifecycleTimelineEntryKind.CONTENT_PROOF:
                    return item.stateLabel;
                case BitcoinAnchorPublicationLifecycleTimelineEntryKind.CHAIN_PLACEMENT:
                    return item.outcomeLabel;
                case BitcoinAnchorPublicationLifecycleTimelineEntryKind.CONSISTENCY:
                    return item.stateLabel;
                default:
                    return '';
            }
        }

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
                // 0.8.61 — Explicit Bitcoin Anchor Transaction Construction
                // UI. A single ephemeral outcome object for THIS entry —
                // never keyed by anything, since one publication has at
                // most one transaction plan under construction at a time,
                // exactly like `discoveryAttempt` above. `null` until
                // "Create Transaction Plan" is clicked; see
                // `constructBitcoinAnchorTransaction()`'s own comment below
                // and application/BitcoinAnchorTransactionConstructionCoordinator.js#construct()'s
                // own return shape.
                bitcoinAnchorTransactionConstruction: null,
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
                // 0.8.68 — Explicit Remote IPFS Publishing Configuration &
                // UX. `ipfsRemotePublishingConfiguration` is an ephemeral
                // application/IpfsRemotePublishingConfiguration.js instance
                // for THIS entry — `null` until "Configure Remote
                // Publishing" is explicitly submitted, and never read from
                // or written to anything durable (see that class's own
                // header, and application/IpfsRemotePublishingConfiguration
                // .js's own header, "EPHEMERAL BY CONSTRUCTION").
                // `ipfsRemotePublishingConfigureFormOpen`/
                // `ipfsRemotePublishingDraft` hold only the in-progress
                // form fields — discarded, never promoted to a real
                // configuration, unless that submit actually happens.
                // `ipfsRemotePublicationOutcome` is a single ephemeral
                // outcome object for THIS entry, `null` until "Publish to
                // Remote IPFS" is explicitly clicked, and reset to `null`
                // every time the configuration itself is replaced —
                // mirroring `bitcoinAnchorBroadcastOutcome`'s own "a fresh
                // attempt retires whatever was previously in-flight"
                // restraint, one axis over. None of these four fields is
                // ever read from or written to localStorage, IndexedDB, a
                // cookie, or anything else durable — they live exactly as
                // long as this page does.
                ipfsRemotePublishingConfiguration: null,
                ipfsRemotePublishingConfigureFormOpen: false,
                ipfsRemotePublishingDraft: { endpoint: '', credential: '', requestField: '', responseField: '' },
                ipfsRemotePublicationOutcome: null,
                // 0.8.70 — IPFS Publication & Content Verification UI.
                // `ipfsPublicationRecord` is the exact application/
                // IpfsPublicationRecord.js captured the moment
                // `ipfsRemotePublicationOutcome` last reached PUBLISHED —
                // `null` until then, and reset to `null` every time a
                // fresh publish attempt or a (re)configuration retires
                // the previous one, mirroring `ipfsRemotePublicationOutcome`
                // 's own "a fresh attempt retires whatever was previously
                // in-flight" restraint. `ipfsPublicationContentVerification`
                // is a single ephemeral outcome object for THIS entry,
                // `null` until "Verify IPFS Content" is explicitly
                // clicked — it is deliberately NEVER reset by a fresh
                // verification of the SAME record (a "Verify Again" click
                // simply replaces it), only by a fresh publish attempt
                // binding a NEW record, so that a stale record's own last
                // observation can never be mistaken for the current
                // record's. Neither field is ever read from or written to
                // localStorage, IndexedDB, a cookie, or anything else
                // durable.
                ipfsPublicationRecord: null,
                ipfsPublicationContentVerification: null,
                // 0.8.71 — IPFS Publication Record History & Inspection.
                // `ipfsPublicationRecordHistory` is the FULL, append-only
                // sequence of every `IpfsPublicationRecord` a PUBLISHED
                // outcome for THIS entry has ever bound — built with
                // application/IpfsPublicationRecordHistory.js, the SAME
                // append-only mechanism application/
                // BitcoinAnchorConfirmationObservationHistory.js already
                // uses for a different domain. Publishing again NEVER
                // clears or replaces an earlier entry here, and — unlike
                // `ipfsPublicationRecord`/`ipfsPublicationContentVerification`
                // above — this history also survives reconfiguring or
                // clearing the remote pinning provider, because a past
                // publication remains a historical fact regardless of
                // whatever provider is presently configured.
                // `ipfsPublicationRecordHistoryExpanded` gates the "Show/
                // Hide Publication History" disclosure. `
                // ipfsPublicationRecordInspectionExpanded` is keyed by a
                // history entry's own stable array index — stable because
                // this history is append-only and never reordered — and
                // holds that one record's own "Inspect" disclosure state.
                // Verifying record #0 never touches record #1's own entry,
                // and vice versa. None of these three fields is ever read
                // from or written to localStorage, IndexedDB, a cookie, or
                // anything else durable.
                ipfsPublicationRecordHistory: [],
                ipfsPublicationRecordHistoryExpanded: false,
                ipfsPublicationRecordInspectionExpanded: {},
                // 0.8.72 — IPFS Publication Verification History &
                // Inspection UI. 0.8.71's own single-slot `
                // ipfsPublicationVerificationsByRecordIndex[index]` — one
                // MOST RECENT observation per history record, silently
                // overwritten by the next "Verify Again" click — is
                // replaced by `ipfsPublicationVerificationHistoriesByRecordIndex
                // [index]`, an append-only application/
                // IpfsPublicationContentVerificationHistory.js sequence:
                // EVERY observation a record has ever received, in order,
                // forever. `ipfsPublicationRecordVerifyingByRecordIndex
                // [index]` is a transient, ephemeral "a verification is
                // currently in flight for this record" flag — it is never
                // itself appended into the history, because "a check is
                // running" is not an observation about the content.
                // `ipfsPublicationVerificationHistoryExpandedByRecordIndex
                // [index]` gates that one record's own "Show/Hide
                // Verification History" disclosure. All three are keyed
                // by a history entry's own stable array index, exactly
                // like `ipfsPublicationRecordInspectionExpanded` above —
                // verifying record #0 never touches record #1's own entry
                // in any of these maps, and vice versa. None of these
                // three fields is ever read from or written to
                // localStorage, IndexedDB, a cookie, or anything else
                // durable.
                ipfsPublicationVerificationHistoriesByRecordIndex: {},
                ipfsPublicationRecordVerifyingByRecordIndex: {},
                ipfsPublicationVerificationHistoryExpandedByRecordIndex: {},
                // 0.8.73 — IPFS Publication Observation Timeline. Gates the
                // "Show/Hide Timeline" disclosure below the existing
                // Publication History disclosure. This is the ONLY new
                // piece of state this milestone adds — the timeline itself
                // is computed on demand by
                // ipfsPublicationObservationTimelineView(entry), a pure
                // projection over the two histories above; nothing here is
                // fetched, polled, or persisted, and expanding this
                // disclosure performs zero network operations.
                ipfsPublicationObservationTimelineExpanded: false,
                // 0.8.75 — Durable Publication Observation Records. Maps
                // THIS entry's own local `ipfsPublicationRecordHistory`
                // index to the position the same record landed at in the
                // shared, page-level `publicationObservationArchive` —
                // see archivePublishIpfsRecord()'s own header below. Never
                // itself read from or written to anything durable; only
                // the page-level archive it points into is.
                archiveIpfsRecordIndexByLocalIndex: [],
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
                // 0.8.40 — Snapshot Possession Observation Exchange.
                // `peerPossessionSelectedPeerId` is whichever
                // `retrievalPeers` connectionId a person has picked from
                // this entry's own "Peer Snapshot Possession" dropdown —
                // a SEPARATE choice from `peerMaterializationSelectedPeerId`
                // above; asking whether a peer has bytes and asking that
                // same peer FOR bytes remain two independent actions, each
                // with their own selected peer. `peerPossessionAttempt` is
                // a single ephemeral observation attempt for THIS entry,
                // `null` until "Check with Peer" is explicitly clicked —
                // never a history, mirroring `localSnapshotAvailability`
                // (0.8.33) rather than `materializationHistory` (0.8.38):
                // an observation is a fact about one moment, and a NEW
                // check simply replaces it, exactly as application/
                // SnapshotPeerPossessionObservation.js's own header
                // describes.
                peerPossessionSelectedPeerId: '',
                peerPossessionAttempt: null,
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
                materializationHistoryExpanded: false,
                // 0.8.44 — Explicit Snapshot Acquisition Attempt
                // Inspection. Keyed by an entry's own position in
                // `materializationHistory` above (that array is only ever
                // appended to, never reordered — see application/
                // SnapshotMaterializationHistory.js's own header — so an
                // index stays a stable identity for one attempt for the
                // life of this page). Gates only whether ONE row's own
                // extra fields (Publication, Content hash) are on screen;
                // never itself a second history, and never anything the
                // row's own facts didn't already carry. Mirrors
                // `entry.inspections` (0.8.17) one axis over.
                materializationHistoryEntryExpanded: {},
                // 0.8.41 — Peer Snapshot Possession Comparison & Observation
                // History. A DELIBERATELY SEPARATE selection and history
                // from `peerPossessionSelectedPeerId`/`peerPossessionAttempt`
                // above: this milestone never retrofits the single-peer
                // "Check with Peer" flow into a history, it only ADDS a new,
                // explicit multi-peer action alongside it.
                // `peerPossessionCompareSelectedPeerIds` is the set of
                // `retrievalPeers` connectionIds a person has checked the
                // box for — the person's own explicit, caller-supplied
                // list application/SnapshotPeerPossessionCoordinator.js#
                // observePeers() requires, never a list this page assembles
                // or ranks on their behalf.
                // `peerPossessionObservationHistory` is the append-only,
                // ephemeral application/
                // SnapshotPeerPossessionObservationHistory.js sequence every
                // observation from "Check Selected Peers" (below) has
                // joined THIS SESSION — never overwritten, and never
                // filtered down to only the current answer; see that file's
                // own header. `peerPossessionComparisonHistoryExpanded`
                // gates only whether the full chronological history
                // disclosure is on screen, mirroring
                // `materializationHistoryExpanded` immediately above.
                peerPossessionCompareSelectedPeerIds: [],
                peerPossessionObservationHistory: [],
                peerPossessionComparisonChecking: false,
                peerPossessionComparisonHistoryExpanded: false,
                // 0.8.45 — Explicit Peer Possession Observation Inspection.
                // Keyed by an observation's own position in
                // `peerPossessionObservationHistory` above (that array is
                // only ever appended to, never reordered — see application/
                // SnapshotPeerPossessionObservationHistory.js's own header —
                // so an index stays a stable identity for one observation
                // for the life of this page). Gates only whether ONE row's
                // own extra fields (the full state sentence, Publication,
                // Content hash) are on screen; never itself a second
                // history, and never anything the row's own facts didn't
                // already carry. Mirrors `entry.materializationHistoryEntryExpanded`
                // (0.8.44) exactly, one domain over.
                peerPossessionObservationHistoryEntryExpanded: {},
                // 0.8.42 — Explicit Snapshot Source Selection &
                // Materialization UX. `peerPossessionComparisonMaterializations`
                // is keyed by peerId, exactly mirroring `materializations`
                // above (keyed by placementId) one axis over: one ephemeral
                // application/MaterializeSnapshotFromPeerUseCase.js-shaped
                // attempt per peer row in "Peer Snapshot Possession
                // Comparison," each independent of every other peer's own
                // attempt AND of `peerPossessionAttempt`/
                // `peerMaterializationAttempt` above — clicking "Get
                // Snapshot from Alice" never touches Carol's own state, and
                // never touches Alice's own POSSESSION OBSERVATION either;
                // see `materializeFromComparisonPeer()` below.
                peerPossessionComparisonMaterializations: {},
                // 0.8.57 — Bitcoin Anchor Proof & Confirmation Inspection UI.
                // The one new state this milestone adds: making 0.8.54's
                // confirmation observer, 0.8.55's reconciliation view, and
                // 0.8.56's confirmation history OBSERVABLE, without
                // introducing any new fact those three files do not already
                // produce. Every key below is keyed by anchorId, exactly
                // mirroring `entry.inspections`/`entry.placementInspections`
                // one axis over — a publication could in principle carry
                // more than one `bitcoin-op-return` anchor (0.8.11's own
                // Section D already proves creating the same anchorType
                // twice succeeds), and each anchor's own confirmation/proof
                // state stays entirely independent of every other anchor's.
                //
                // `bitcoinAnchorReconciliations[anchorId]` is a single
                // ephemeral attempt object — `{ reconciling, error,
                // publicationId, anchorId, contentHash, transaction,
                // contentProof }` — the SAME shape application/
                // BitcoinAnchorProofReconciliationView.js#reconcile() itself
                // returns, merged with two UI-only flags, mirroring
                // `entry.peerPossessionAttempt` (0.8.40): a NEW reconcile
                // click simply REPLACES it — the current reconciliation
                // describes what both independent observations say RIGHT
                // NOW, never a history of its own.
                //
                // `bitcoinAnchorConfirmationHistories[anchorId]` is the
                // DELIBERATELY SEPARATE, append-only application/
                // BitcoinAnchorConfirmationObservationHistory.js sequence —
                // every reconcile() click's own `transaction.confirmation`
                // joins this array, never replacing an earlier entry,
                // mirroring `entry.peerPossessionObservationHistory`
                // (0.8.41) one domain over. There is no equivalent history
                // for `contentProof` — see this milestone's own design
                // conversation and docs/Principles.md, "Confirmation And
                // Content-Proof Histories Stay Separate, Never Unified,
                // Because They Are Independent Observations (0.8.57)": only
                // confirmation status changes shape over time in a way
                // worth narrating (NOT_CONFIRMED -> CONFIRMED as blocks
                // accumulate); a content-hash match against an immutable
                // OP_RETURN output does not evolve the same way, so this
                // milestone builds no history for it, exactly as
                // `bitcoinAnchorContentProofView()` below only ever reads
                // the CURRENT reconciliation's own `contentProof`.
                //
                // `bitcoinAnchorConfirmationHistoryExpanded`/
                // `bitcoinAnchorConfirmationHistoryEntryExpanded` gate only
                // whether the "Confirmation History" disclosure, and one of
                // its own rows, are on screen — mirroring
                // `entry.peerPossessionComparisonHistoryExpanded`/
                // `entry.peerPossessionObservationHistoryEntryExpanded`
                // (0.8.41/0.8.45) exactly, one domain over.
                bitcoinAnchorReconciliations: {},
                bitcoinAnchorConfirmationHistories: {},
                bitcoinAnchorConfirmationHistoryExpanded: {},
                bitcoinAnchorConfirmationHistoryEntryExpanded: {},
                // 0.8.76 — Bitcoin Anchor Chain Placement Change
                // Observation. Gates only the "Compare Confirmation
                // Observations" disclosure below the existing
                // "Confirmation History" one — mirroring
                // `bitcoinAnchorConfirmationHistoryExpanded` exactly, one
                // sibling disclosure over. Comparing is read-only and
                // synchronous (application/
                // BitcoinAnchorChainPlacementObserver.js makes no network
                // call), so this key needs no matching "in flight"/"error"
                // state the way `bitcoinAnchorReconciliations[anchorId]`
                // does — there is nothing here that can fail.
                bitcoinAnchorChainPlacementComparisonExpanded: {},
                // 0.8.77 — Bitcoin Anchor Observation Consistency Analysis.
                // Gates only the "Observation Consistency" disclosure — a
                // SIBLING to "Compare Confirmation Observations" (0.8.76)
                // above it, never nested inside it. Consuming exactly the
                // same `bitcoinAnchorConfirmationHistories[anchorId]` array
                // both disclosures already read, application/
                // BitcoinAnchorObservationConsistencyAnalyzer.js makes no
                // network call either, so this key needs no matching "in
                // flight"/"error" state, the identical reasoning
                // `bitcoinAnchorChainPlacementComparisonExpanded` above
                // already holds.
                bitcoinAnchorObservationConsistencyExpanded: {},
                // 0.8.78 — Bitcoin Anchor Observation Evidence Correlation.
                // Gates the "Bitcoin Anchor Evidence" disclosure — a
                // SIBLING to "Compare Confirmation Observations" (0.8.76)
                // and "Observation Consistency" (0.8.77) above it, never
                // nested inside either one. This disclosure composes
                // exactly what those two, and "Show Confirmation History"
                // (0.8.56) and the "Bitcoin Anchor" card's own current
                // reconciliation (0.8.57) immediately above, already read
                // and already show — application/
                // BitcoinAnchorObservationEvidence.js recomputes none of
                // their analysis, so this key needs no matching "in
                // flight"/"error" state either, the identical reasoning
                // `bitcoinAnchorChainPlacementComparisonExpanded` (0.8.76)
                // and `bitcoinAnchorObservationConsistencyExpanded`
                // (0.8.77) both already hold.
                bitcoinAnchorObservationEvidenceExpanded: {},
                // 0.8.74 — Cross-Domain Publication Observation Timeline.
                // Gates the "Show/Hide Cross-Domain Timeline" disclosure,
                // placed as a SIBLING to the existing IPFS and Bitcoin
                // cards below — never nested inside either one, because the
                // timeline this disclosure shows is a view over BOTH of
                // this entry's own domains at once. This is the ONLY new
                // piece of per-entry state this milestone adds; the
                // timeline itself is computed on demand by
                // crossDomainPublicationObservationTimelineView(entry), a
                // pure projection over state already held above. Nothing
                // here is fetched, polled, or persisted, and expanding this
                // disclosure performs zero network operations.
                crossDomainPublicationObservationTimelineExpanded: false
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

        // 0.8.39 — Local Snapshot Possession & Replica Content Knowledge.
        // A pure reshaping of THIS entry's own `localSnapshotAvailability`
        // (whatever "Check Local Snapshot" above most recently reported) into
        // application/PublicationSnapshotPossessionView.js's own small
        // `{ publicationId, contentHash, possession: { state } }` shape —
        // never a second check, never touching content/ContentStore.js
        // itself. `state` is `null` until "Check Local Snapshot" is clicked
        // at least once, mirroring `localSnapshotAvailabilityView(entry)
        // .checked` exactly.
        function currentPossessionView(entry) {
            return describePublicationSnapshotPossession(entry.localSnapshotAvailability);
        }

        // The tiny, deliberately non-"complete" composed fact application/
        // PublicationReplicaContentKnowledgeView.js exists to report:
        // whether THIS replica knows the publication's own envelope, and
        // whether it currently possesses valid bytes for it — nothing about
        // evidence or placement counts, which the existing "Decentralization"
        // summary below already shows on its own, independently gated card.
        function replicaContentKnowledgeView(entry) {
            return describePublicationReplicaContentKnowledge({
                publicationId: entry.publication.id,
                hasPublication: catalog.has(entry.publication.id),
                possession: currentPossessionView(entry)
            });
        }

        // 0.8.43 — Unified Snapshot Acquisition Outcome & Possession UX.
        // Composes THIS entry's own `currentPossessionView(entry)` (0.8.39)
        // and `entry.materializationHistory` (0.8.38) — both already
        // computed by this page for their own existing disclosures — into
        // application/PublicationSnapshotAcquisitionView.js's own small
        // `{ possession, acquisition }` shape. Never a third check, never a
        // second history: pure, synchronous re-reading of state this page
        // already holds.
        function snapshotAcquisitionView(entry) {
            return describePublicationSnapshotAcquisition({
                publicationId: entry.publication.id,
                contentHash: entry.publication.contentReference.hash,
                possessionView: currentPossessionView(entry),
                materializationHistory: entry.materializationHistory
            });
        }

        // A plain, non-judgmental count sentence over `snapshotAcquisitionView
        // (entry).acquisition` — "4 attempts · 2 stored · 1 already available
        // · 1 hash mismatch" — mirroring `materializationSourceCountsSentence()`
        // below exactly, one axis over (outcome counts rather than source
        // counts). `null` when no attempt has ever been recorded, so the
        // "Snapshot Acquisition" summary stays silent rather than showing
        // "0 attempts."
        function snapshotAcquisitionOutcomeCountsSentence(entry) {
            const acquisition = snapshotAcquisitionView(entry).acquisition;
            if (acquisition.attemptCount === 0) return null;
            const parts = [`${acquisition.attemptCount} attempt${acquisition.attemptCount === 1 ? '' : 's'}`];
            if (acquisition.storedCount > 0) parts.push(`${acquisition.storedCount} stored`);
            if (acquisition.alreadyAvailableCount > 0) parts.push(`${acquisition.alreadyAvailableCount} already available`);
            if (acquisition.hashMismatchCount > 0) parts.push(`${acquisition.hashMismatchCount} hash mismatch`);
            return parts.join(' · ');
        }

        // True only once a local availability check has actually completed
        // AND reported this replica does not currently possess valid bytes
        // — NOT_AVAILABLE or CONTENT_HASH_MISMATCH. Gates a single hint
        // sentence pointing at the sources already offered further down
        // this same "Local Snapshot" card; never itself a source, a check,
        // or a materialization attempt. `null`/not-yet-checked reports
        // `false` here — this page never nudges a person toward a source
        // before it has any honest basis to.
        function snapshotAcquisitionNeedsSourceHint(entry) {
            const state = snapshotAcquisitionView(entry).possession.state;
            return state === LocalSnapshotContentAvailabilityOutcome.NOT_AVAILABLE
                || state === LocalSnapshotContentAvailabilityOutcome.CONTENT_HASH_MISMATCH;
        }

        // 0.8.46 — Unified Snapshot State Inspection. Composes FOUR facts
        // this page already computes for its own independent disclosures —
        // `currentPossessionView(entry)` (0.8.39), `snapshotAcquisitionView(entry)`
        // (0.8.43), THIS entry's own `entry.placementConvergenceView`
        // (0.8.23, null until "Show Placements" has ever loaded placements),
        // and `peerPossessionComparisonView(entry)` (0.8.41) — into
        // application/SnapshotStateInspectionView.js's own small, composed
        // `{ possession, acquisition, placements, peerObservations }` shape.
        // Never a fifth check, never a new store: pure, synchronous
        // re-reading of state this page already holds, exactly mirroring
        // `snapshotAcquisitionView(entry)`'s own restraint one layer up. See
        // application/SnapshotStateInspectionView.js's own header and
        // docs/Principles.md, "A Snapshot's Independently Observed Facts Are
        // Exposed Side By Side, Never Collapsed Into One Verdict (0.8.46)."
        function snapshotStateInspectionView(entry) {
            return describeSnapshotStateInspection({
                publicationId: entry.publication.id,
                contentHash: entry.publication.contentReference.hash,
                possessionView: currentPossessionView(entry),
                acquisitionView: snapshotAcquisitionView(entry),
                placementConvergenceView: entry.placementConvergenceView,
                peerPossessionComparisonView: peerPossessionComparisonView(entry)
            });
        }

        // A plain word for `snapshotStateInspectionView(entry).placements
        // .relationship` — mirrors the inline string comparison "Snapshot
        // Placements" already uses further down this same file
        // (`entry.placementConvergenceView.relationship === 'conflict'`),
        // just named once here rather than repeated a second time.
        function snapshotStatePlacementRelationshipLabel(view) {
            if (!view || !view.placements) return null;
            return view.placements.relationship === SnapshotPlacementRelationship.CONFLICT ? 'Conflict' : 'Agreement';
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

        // 0.8.44 — Explicit Snapshot Acquisition Attempt Inspection.
        // Composes application/SnapshotMaterializationHistoryDetailView.js's
        // own describeSnapshotMaterializationHistoryDetails() over this
        // entry's existing `materializationHistory` (0.8.38) — the
        // IDENTICAL sequence materializationSourceCountsSentence() below
        // and the "Snapshot Acquisition" summary already read, never a
        // second, separately-tracked history.
        function materializationHistoryDetailsView(entry) {
            return describeSnapshotMaterializationHistoryDetails(entry.materializationHistory);
        }

        // Per-attempt disclosure state, addressed by that attempt's own
        // stable index (see `entry.materializationHistoryEntryExpanded`'s
        // own header). Toggling one row never touches another, and never
        // touches the outer "Show/Hide Acquisition History" state above it.
        function isMaterializationHistoryEntryExpanded(entry, index) {
            return Boolean(entry.materializationHistoryEntryExpanded[index]);
        }

        function toggleMaterializationHistoryEntry(entry, index) {
            entry.materializationHistoryEntryExpanded[index] = !entry.materializationHistoryEntryExpanded[index];
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

        // 0.8.57 — Bitcoin Anchor Proof & Confirmation Inspection UI.
        //
        // The ONE explicit action this section offers, and the ONLY place
        // this page ever calls `bitcoinAnchorProofReconciliationView.
        // reconcile()`. Never triggered by opening this page, expanding
        // evidence, or any other disclosure — mirroring
        // `checkSnapshotPossessionWithPeer()`'s own restraint one domain
        // over. A single click asks BOTH independent questions at once
        // (confirmation status, content-hash proof) because that is
        // exactly what `reconcile()` itself already does, concurrently, in
        // one call — see that class's own header on why this is a
        // COMPOSITION, never a second verification, and never two separate
        // buttons pretending to be independent when the domain layer
        // beneath them only ever offers one combined read.
        //
        // The reconciliation result REPLACES `entry.
        // bitcoinAnchorReconciliations[anchorId]` — it describes what both
        // observations say right now, never a history of its own — while
        // its own `transaction.confirmation` is separately APPENDED to
        // `entry.bitcoinAnchorConfirmationHistories[anchorId]`, never
        // replacing an earlier entry there. Both updates always happen
        // together, from the SAME reconcile() result, so the two views
        // below can never disagree about what the most recent click
        // reported.
        async function reconcileBitcoinAnchor(entry, anchorView) {
            if (!bitcoinAnchorProofReconciliationView) return;
            const anchor = entry.evidenceAnchors.find((candidate) => candidate.id === anchorView.anchorId);
            if (!anchor) return;
            entry.bitcoinAnchorReconciliations[anchorView.anchorId] = { reconciling: true, error: null };
            try {
                const result = await bitcoinAnchorProofReconciliationView.reconcile(anchor);
                entry.bitcoinAnchorReconciliations[anchorView.anchorId] = { reconciling: false, error: null, ...result };
                const history = entry.bitcoinAnchorConfirmationHistories[anchorView.anchorId] || [];
                entry.bitcoinAnchorConfirmationHistories[anchorView.anchorId] =
                    appendBitcoinAnchorConfirmationObservationHistoryEntry(history, result.transaction.confirmation);
                // 0.8.75 — both facts this SAME reconcile() result carries
                // are archived durably, side by side with the ephemeral
                // state above — a content-proof observation has no
                // history of its own anywhere else in this codebase (see
                // application/PublicationObservationArchive.js's own
                // header, "NO HISTORY IS INVENTED FOR CONTENT PROOF"), but
                // this archive still records every one it is given.
                archiveBitcoinConfirmationObservation(anchorView.anchorId, result.transaction.confirmation);
                if (result.contentProof) {
                    archiveBitcoinContentProofObservation(anchorView.anchorId, result.contentProof);
                }
            } catch (error) {
                entry.bitcoinAnchorReconciliations[anchorView.anchorId] = { reconciling: false, error: error.message };
            }
        }

        // Pure, synchronous: always re-derived from THIS entry's own
        // `bitcoinAnchorReconciliations[anchorId]` — never a second,
        // separately maintained "current" field. `confirmation` projects
        // application/BitcoinAnchorConfirmationObservationHistoryDetailView.js's
        // own `describeBitcoinAnchorConfirmationObservationDetail()`
        // UNCHANGED over the most recent reconciliation's own
        // `transaction.confirmation` — the SAME per-observation shape
        // `bitcoinAnchorConfirmationHistoryView()` below already uses for
        // every history row, so a person sees one consistent vocabulary
        // whether they are looking at "right now" or at history.
        // `contentProof` projects application/BitcoinAnchorContentProofView.js's
        // own `describeBitcoinAnchorContentProof()`, unchanged, the same
        // way. NEITHER field is ever combined with the other into a third,
        // aggregate field — a caller wanting both places them side by
        // side, exactly as `entry.bitcoinAnchorReconciliations[anchorId]`
        // itself already keeps them: two sibling keys on one object, never
        // one merged verdict.
        function bitcoinAnchorReconciliationView(entry, anchorView) {
            const state = entry.bitcoinAnchorReconciliations[anchorView.anchorId];
            if (!state) return { reconciling: false, error: null, confirmation: null, contentProof: null };
            return {
                reconciling: Boolean(state.reconciling),
                error: state.error || null,
                confirmation: state.transaction ? describeBitcoinAnchorConfirmationObservationDetail(state.transaction.confirmation) : null,
                contentProof: state.contentProof ? describeBitcoinAnchorContentProof(state.contentProof) : null
            };
        }

        function bitcoinAnchorConfirmationBadgeClass(entry, anchorView) {
            const confirmation = bitcoinAnchorReconciliationView(entry, anchorView).confirmation;
            return confirmation ? (BITCOIN_ANCHOR_CONFIRMATION_BADGE_CLASSES[confirmation.state] || null) : null;
        }

        function bitcoinAnchorContentProofBadgeClass(entry, anchorView) {
            const contentProof = bitcoinAnchorReconciliationView(entry, anchorView).contentProof;
            return contentProof ? (BITCOIN_ANCHOR_CONTENT_PROOF_BADGE_CLASSES[contentProof.state] || null) : null;
        }

        function bitcoinAnchorReconcileButtonLabel(entry, anchorView) {
            const view = bitcoinAnchorReconciliationView(entry, anchorView);
            if (view.reconciling) return 'Reconciling…';
            return view.confirmation ? 'Reconcile Again' : 'Reconcile';
        }

        // The FULL chronological narration of every "Reconcile" click's own
        // confirmation observation for THIS anchor — composes application/
        // BitcoinAnchorConfirmationObservationHistoryDetailView.js's own
        // `describeBitcoinAnchorConfirmationObservationHistoryDetails()`
        // over `entry.bitcoinAnchorConfirmationHistories[anchorId]`,
        // exactly mirroring `peerPossessionObservationDetailsView()` one
        // domain over — never a second history, and never anything the
        // history itself did not already carry.
        function bitcoinAnchorConfirmationHistoryView(entry, anchorView) {
            return describeBitcoinAnchorConfirmationObservationHistoryDetails(entry.bitcoinAnchorConfirmationHistories[anchorView.anchorId] || []);
        }

        function toggleBitcoinAnchorConfirmationHistory(entry, anchorView) {
            entry.bitcoinAnchorConfirmationHistoryExpanded[anchorView.anchorId] = !entry.bitcoinAnchorConfirmationHistoryExpanded[anchorView.anchorId];
        }

        function isBitcoinAnchorConfirmationHistoryExpanded(entry, anchorView) {
            return Boolean(entry.bitcoinAnchorConfirmationHistoryExpanded[anchorView.anchorId]);
        }

        // Per-observation disclosure state, addressed by that
        // observation's own stable index within THIS anchor's own history
        // — mirroring `togglePeerPossessionObservationHistoryEntry()`
        // exactly, one domain over. Toggling one row never touches
        // another row, another anchor's own history, or the outer
        // "Show/Hide Confirmation History" state above it.
        function toggleBitcoinAnchorConfirmationHistoryEntry(entry, anchorView, index) {
            const bucket = entry.bitcoinAnchorConfirmationHistoryEntryExpanded[anchorView.anchorId]
                || (entry.bitcoinAnchorConfirmationHistoryEntryExpanded[anchorView.anchorId] = {});
            bucket[index] = !bucket[index];
        }

        function isBitcoinAnchorConfirmationHistoryEntryExpanded(entry, anchorView, index) {
            const bucket = entry.bitcoinAnchorConfirmationHistoryEntryExpanded[anchorView.anchorId];
            return Boolean(bucket && bucket[index]);
        }

        // 0.8.76 — Bitcoin Anchor Chain Placement Change Observation.
        //
        // Pure, synchronous, always re-derived from THIS anchor's own
        // `bitcoinAnchorConfirmationHistories[anchorId]` — the SAME array
        // `bitcoinAnchorConfirmationHistoryView()` above already narrates,
        // never a second, separately maintained history. Composes
        // application/BitcoinAnchorChainPlacementObserver.js's own
        // `observeBitcoinAnchorChainPlacementChanges()` (which performs no
        // network access — it only compares observations this replica
        // already recorded) with application/
        // BitcoinAnchorChainPlacementObservationView.js's own
        // `describeBitcoinAnchorChainPlacementObservations()`, exactly
        // mirroring `bitcoinAnchorConfirmationHistoryView()`'s own
        // observer-then-view composition, one layer over. There is no
        // "Compare" button handler that performs work of its own — every
        // click only toggles `toggleBitcoinAnchorChainPlacementComparison()`
        // below; the comparison itself is already complete the moment
        // this function is called.
        function bitcoinAnchorChainPlacementComparisonView(entry, anchorView) {
            const history = entry.bitcoinAnchorConfirmationHistories[anchorView.anchorId] || [];
            return describeBitcoinAnchorChainPlacementObservations(observeBitcoinAnchorChainPlacementChanges(history));
        }

        function toggleBitcoinAnchorChainPlacementComparison(entry, anchorView) {
            entry.bitcoinAnchorChainPlacementComparisonExpanded[anchorView.anchorId] =
                !entry.bitcoinAnchorChainPlacementComparisonExpanded[anchorView.anchorId];
        }

        function isBitcoinAnchorChainPlacementComparisonExpanded(entry, anchorView) {
            return Boolean(entry.bitcoinAnchorChainPlacementComparisonExpanded[anchorView.anchorId]);
        }

        // 0.8.77 — Bitcoin Anchor Observation Consistency Analysis.
        //
        // Pure, synchronous, always re-derived from THIS anchor's own
        // `bitcoinAnchorConfirmationHistories[anchorId]` — the SAME array
        // `bitcoinAnchorConfirmationHistoryView()` and
        // `bitcoinAnchorChainPlacementComparisonView()` above already read,
        // never a second, separately maintained history. Composes
        // application/BitcoinAnchorObservationConsistencyAnalyzer.js's own
        // `analyzeBitcoinAnchorObservationConsistency()` (no network
        // access — it only analyzes observations this replica already
        // recorded) with application/BitcoinAnchorObservationConsistencyView.js's
        // own `describeBitcoinAnchorObservationConsistency()`, exactly
        // mirroring `bitcoinAnchorChainPlacementComparisonView()`'s own
        // analyzer-then-view composition, one sibling over. There is no
        // "Observation Consistency" button handler that performs work of
        // its own — every click only toggles
        // `toggleBitcoinAnchorObservationConsistency()` below; the
        // analysis itself is already complete the moment this function is
        // called.
        function bitcoinAnchorObservationConsistencyView(entry, anchorView) {
            const history = entry.bitcoinAnchorConfirmationHistories[anchorView.anchorId] || [];
            return describeBitcoinAnchorObservationConsistency(analyzeBitcoinAnchorObservationConsistency(history));
        }

        function toggleBitcoinAnchorObservationConsistency(entry, anchorView) {
            entry.bitcoinAnchorObservationConsistencyExpanded[anchorView.anchorId] =
                !entry.bitcoinAnchorObservationConsistencyExpanded[anchorView.anchorId];
        }

        function isBitcoinAnchorObservationConsistencyExpanded(entry, anchorView) {
            return Boolean(entry.bitcoinAnchorObservationConsistencyExpanded[anchorView.anchorId]);
        }

        // 0.8.78 — Bitcoin Anchor Observation Evidence Correlation.
        //
        // Composes application/BitcoinAnchorObservationEvidence.js's own
        // `composeBitcoinAnchorObservationEvidence()` — which recomputes
        // NOTHING of its own — over exactly the same, already-in-memory
        // facts this anchor's own cards above already read:
        // `entry.bitcoinAnchorConfirmationHistories[anchorId]` (the SAME
        // array `bitcoinAnchorConfirmationHistoryView()`,
        // `bitcoinAnchorChainPlacementComparisonView()`, and
        // `bitcoinAnchorObservationConsistencyView()` above already read),
        // `entry.bitcoinAnchorReconciliations[anchorId].contentProof` (the
        // SAME single current reconciliation `bitcoinAnchorReconciliationView()`
        // already reads — there is no content-proof HISTORY to read,
        // exactly as that function's own header already explains), and
        // 0.8.76/0.8.77's own placement/consistency results, called fresh
        // here exactly as `bitcoinAnchorChainPlacementComparisonView()`/
        // `bitcoinAnchorObservationConsistencyView()` above already call
        // them. `anchorView.anchorId` — this anchor's own EXPLICIT
        // identity — is the one and only key used throughout; nothing
        // here reads or infers from `contentHash` or `txid`.
        //
        // NO BROADCAST OBSERVATION FOR A DISCOVERED ANCHOR, EVER — the
        // identical restraint `crossDomainPublicationObservationTimelineView()`
        // (0.8.74) already holds, one section over: every `anchorView`
        // this loop iterates over (`entry.evidence.anchors`) is an
        // already-catalogued, discovered claim, never a transaction THIS
        // replica itself broadcast, so it honestly contributes an empty
        // `broadcastObservations` section — never a fabricated one. See
        // that function's own header for the full reasoning.
        function bitcoinAnchorObservationEvidenceView(entry, anchorView) {
            const anchorId = anchorView.anchorId;
            const history = entry.bitcoinAnchorConfirmationHistories[anchorId] || [];
            const reconciliation = entry.bitcoinAnchorReconciliations[anchorId];
            const contentProofObservations = (reconciliation && reconciliation.contentProof) ? [reconciliation.contentProof] : [];

            return describeBitcoinAnchorObservationEvidence(composeBitcoinAnchorObservationEvidence({
                anchorId,
                broadcastObservations: [],
                confirmationObservations: history,
                contentProofObservations,
                chainPlacementObservations: observeBitcoinAnchorChainPlacementChanges(history),
                consistencyFindings: analyzeBitcoinAnchorObservationConsistency(history)
            }));
        }

        function toggleBitcoinAnchorObservationEvidence(entry, anchorView) {
            entry.bitcoinAnchorObservationEvidenceExpanded[anchorView.anchorId] =
                !entry.bitcoinAnchorObservationEvidenceExpanded[anchorView.anchorId];
        }

        function isBitcoinAnchorObservationEvidenceExpanded(entry, anchorView) {
            return Boolean(entry.bitcoinAnchorObservationEvidenceExpanded[anchorView.anchorId]);
        }

        // 0.8.58 — Explicit Bitcoin Wallet Connection & Signing UX.
        //
        // The ONE place this page ever calls
        // `bitcoinWalletConnection.connect()` — never triggered
        // automatically on page load, on opening the Publication Center,
        // or on expanding any evidence card; only an explicit "Connect
        // Bitcoin Wallet" click. Mirrors `reconcileBitcoinAnchor()` above:
        // the injected collaborator performs the action and returns a
        // result, and this page copies that result into its own reactive
        // state rather than relying on Vue to see through the collaborator's
        // own internal mutation.
        async function connectBitcoinWallet() {
            if (!bitcoinWalletConnection) return;
            bitcoinWalletConnectionState.status = BitcoinWalletConnectionState.CONNECTING;
            bitcoinWalletConnectionState.reason = null;
            let result;
            try {
                result = await bitcoinWalletConnection.connect();
            } catch (error) {
                // A provider-contract violation — see anchoring/
                // BitcoinWalletConnection.js's own header on why this is
                // the one case connect() itself throws rather than
                // resolving. Reported here exactly like any other
                // unavailable outcome; never left showing "Connecting…"
                // forever.
                bitcoinWalletConnectionState.status = bitcoinWalletConnection.status;
                bitcoinWalletConnectionState.account = null;
                bitcoinWalletConnectionState.network = null;
                bitcoinWalletConnectionState.reason = error.message;
                return;
            }
            bitcoinWalletConnectionState.status = bitcoinWalletConnection.status;
            bitcoinWalletConnectionState.account = bitcoinWalletConnection.account;
            bitcoinWalletConnectionState.network = bitcoinWalletConnection.network;
            bitcoinWalletConnectionState.reason = result.connected ? null : result.reason;
        }

        // Local-only, honestly — see anchoring/BitcoinWalletConnection.js's
        // own header, "DISCONNECT IS LOCAL-ONLY, HONESTLY." Never claims to
        // revoke the browser extension's own permission grant.
        function disconnectBitcoinWallet() {
            if (!bitcoinWalletConnection) return;
            bitcoinWalletConnection.disconnect();
            bitcoinWalletConnectionState.status = bitcoinWalletConnection.status;
            bitcoinWalletConnectionState.account = null;
            bitcoinWalletConnectionState.network = null;
            bitcoinWalletConnectionState.reason = null;
        }

        // Pure projection of `bitcoinWalletConnectionState` through
        // application/BitcoinWalletConnectionView.js's own
        // `describeBitcoinWalletConnection()` — the identical "the UI
        // projects an application-layer describe function, unchanged"
        // discipline `bitcoinAnchorReconciliationView()` above already
        // holds. `expectedNetwork` matches anchoring/
        // BitcoinAnchorTransactionBuilder.js's own default network — this
        // page anchors to Bitcoin mainnet exclusively, so a wallet
        // connected to any other network is always, honestly, a mismatch.
        function bitcoinWalletConnectionView() {
            return describeBitcoinWalletConnection(bitcoinWalletConnectionState, { expectedNetwork: 'mainnet' });
        }

        function bitcoinWalletConnectionBadgeClass() {
            return BITCOIN_WALLET_CONNECTION_BADGE_CLASSES[bitcoinWalletConnectionView().state] || 'peer-badge--pending';
        }

        function isBitcoinWalletConnected() {
            return bitcoinWalletConnectionView().state === BitcoinWalletConnectionState.CONNECTED;
        }

        function isBitcoinWalletConnecting() {
            return bitcoinWalletConnectionView().state === BitcoinWalletConnectionState.CONNECTING;
        }

        // 0.8.59 — Explicit Bitcoin Anchor Transaction Review UI. A pure
        // projection of `bitcoinAnchorTransactionReview.description` through
        // application/BitcoinAnchorTransactionReviewView.js — the identical
        // "the UI owns no facts of its own, it only projects an injected
        // collaborator's own state" discipline every other `*View()`
        // function on this page already holds. `null` whenever no review
        // injection was provided, or nothing is presently awaiting review —
        // the section below simply does not render either way.
        function bitcoinAnchorTransactionReviewView() {
            if (!bitcoinAnchorTransactionReview || !bitcoinAnchorTransactionReview.description) return null;
            return describeBitcoinAnchorTransactionReview(bitcoinAnchorTransactionReview.description);
        }

        // A connected wallet's own network, checked against THIS review's
        // own transaction network — never the page-wide "Bitcoin Wallet"
        // section's hardcoded `mainnet` default immediately above, since a
        // review already names the exact network the transaction it
        // describes actually belongs to. See application/
        // BitcoinWalletConnectionView.js's own header, "A MISMATCH IS
        // REPORTED, NEVER RESOLVED" — unchanged here, one call site over.
        function bitcoinAnchorTransactionReviewWalletMatchView() {
            const review = bitcoinAnchorTransactionReviewView();
            if (!review || !bitcoinWalletConnection) return null;
            return describeBitcoinWalletConnection(bitcoinWalletConnectionState, { expectedNetwork: review.network });
        }

        // 0.8.60 — Explicit Bitcoin Anchor Funding & Address Preparation.
        //
        // The ONE place this page ever calls
        // `bitcoinWalletFundingObserver.observeFunding()` — never triggered
        // automatically on connecting the wallet, on page load, or on a
        // timer; only an explicit "Observe Wallet Funding"/"Refresh
        // Funding" click. Mirrors `connectBitcoinWallet()` above: the
        // injected collaborator performs the observation and returns a
        // fresh, frozen record, and this page copies it into its own
        // reactive state wholesale — never merged with whatever the
        // previous observation said, exactly as anchoring/
        // BitcoinWalletFundingObserver.js's own header requires.
        async function observeBitcoinAnchorFunding() {
            if (!bitcoinWalletFundingObserver || !isBitcoinWalletConnected()) return;
            bitcoinAnchorFundingState.observing = true;
            bitcoinAnchorFundingState.error = null;
            let observation;
            try {
                observation = await bitcoinWalletFundingObserver.observeFunding({
                    account: bitcoinWalletConnectionState.account,
                    network: bitcoinWalletConnectionState.network
                });
            } catch (error) {
                bitcoinAnchorFundingState.observing = false;
                bitcoinAnchorFundingState.error = error.message;
                return;
            }
            bitcoinAnchorFundingState.observing = false;
            bitcoinAnchorFundingState.observation = observation;
        }

        function toggleBitcoinAnchorFundingUtxosExpanded() {
            bitcoinAnchorFundingUtxosExpanded.value = !bitcoinAnchorFundingUtxosExpanded.value;
        }

        // Pure projection of `bitcoinAnchorFundingState.observation` through
        // application/BitcoinAnchorFundingView.js's own
        // `describeBitcoinAnchorFunding()` — the identical "the UI owns no
        // facts of its own, it only projects an injected collaborator's own
        // state" discipline every other `*View()` function on this page
        // already holds. `expectedNetwork` is the CONNECTED wallet's own
        // CURRENT network, so a person who reconnects on a different
        // network after observing funding sees that staleness named, never
        // silently ignored — see application/BitcoinAnchorFundingView.js's
        // own header on `networkMismatch`. `null` whenever nothing has been
        // observed yet — the section below simply does not render either
        // way.
        function bitcoinAnchorFundingView() {
            if (!bitcoinAnchorFundingState.observation) return null;
            return describeBitcoinAnchorFunding(bitcoinAnchorFundingState.observation, { expectedNetwork: bitcoinWalletConnectionState.network });
        }

        function bitcoinAnchorFundingBadgeClass() {
            const view = bitcoinAnchorFundingView();
            if (!view) return 'peer-badge--pending';
            return BITCOIN_ANCHOR_FUNDING_BADGE_CLASSES[view.state] || 'peer-badge--pending';
        }

        function isBitcoinAnchorFundingObserved() {
            const view = bitcoinAnchorFundingView();
            return Boolean(view && view.state === BitcoinAnchorFundingObservationState.OBSERVED);
        }

        // 0.8.61 — Explicit Bitcoin Anchor Transaction Construction UI.
        //
        // The ONE place this page ever calls
        // `bitcoinAnchorTransactionConstructionCoordinator.construct()` —
        // never triggered automatically by observing or refreshing
        // funding, never on page load, and never re-run on a timer; only
        // an explicit "Create Transaction Plan" click, exactly one entry at
        // a time. `construct()` itself is synchronous (see that class's own
        // header) — no `await` here, and CONSTRUCTING is set and cleared
        // within the same synchronous call, existing so the state this
        // entry's own reactive slot holds is always one of application/
        // BitcoinAnchorTransactionConstructionState.js's own four named
        // values, never inferred from a boolean flag.
        //
        // Uses the funding observation exactly as last observed —
        // `bitcoinAnchorFundingState.observation` — never a fresher one
        // fetched here; see application/
        // BitcoinAnchorTransactionConstructionCoordinator.js's own header
        // on why staleness is named (via `bitcoinAnchorFundingView().networkMismatch`
        // above), never silently resolved by re-observing on this entry's
        // behalf.
        //
        // A thrown error (a caller-contract violation — e.g. no funding has
        // been observed at all yet) is caught HERE, at the UI boundary, and
        // turned into its own honest FAILED outcome, mirroring exactly how
        // `createAnchor()` above already handles
        // `PublicationAnchorCreationCoordinator`'s own thrown errors.
        function constructBitcoinAnchorTransaction(entry) {
            if (!bitcoinAnchorTransactionConstructionCoordinator) return;
            entry.bitcoinAnchorTransactionConstruction = { state: BitcoinAnchorTransactionConstructionState.CONSTRUCTING, construction: null, reason: null };
            // A fresh construction attempt retires whatever was previously
            // under review/signed/finalized/broadcast-ready — never left
            // showing stale review facts, a stale SIGNED badge, a stale
            // FINALIZED badge, or a stale broadcast result for a
            // transaction this click is about to replace. See
            // `bitcoinAnchorTransactionReview`'s,
            // `bitcoinAnchorReviewedSigningOutcome`'s,
            // `bitcoinAnchorSignedPsbtFinalizationOutcome`'s, and
            // `bitcoinAnchorFinalizedTransaction`'s/`bitcoinAnchorBroadcastOutcome`'s
            // own declarations above.
            bitcoinAnchorTransactionReview.description = null;
            bitcoinAnchorTransactionReview.publicationId = null;
            bitcoinAnchorTransactionReview.reason = null;
            bitcoinAnchorReviewedSigningOutcome.value = null;
            bitcoinAnchorSignedPsbtFinalizationOutcome.value = null;
            bitcoinAnchorFinalizedTransaction.value = null;
            bitcoinAnchorBroadcastOutcome.value = null;
            bitcoinAnchorBroadcastedAt.value = null;
            retireBitcoinAnchorBroadcastConfirmationContext();
            try {
                entry.bitcoinAnchorTransactionConstruction = bitcoinAnchorTransactionConstructionCoordinator.construct({
                    publicationId: entry.publication.id,
                    contentHash: entry.publication.contentReference.hash,
                    fundingObservation: bitcoinAnchorFundingState.observation
                });
            } catch (error) {
                entry.bitcoinAnchorTransactionConstruction = { state: BitcoinAnchorTransactionConstructionState.FAILED, construction: null, reason: error.message };
                return;
            }
            bridgeBitcoinAnchorTransactionToReview(entry);
        }

        // 0.8.62 — Explicit Reviewed Bitcoin Anchor Signing UI.
        //
        // The ONE place this page ever calls
        // `bitcoinAnchorTransactionReviewCoordinator.review()` — always
        // immediately after a successful construction, never on its own
        // trigger, and never re-run on a timer. Reviewing a plan is not an
        // authorization action — unlike signing it, it touches no wallet
        // and commits to nothing — so, exactly as application/
        // BitcoinAnchorTransactionReviewView.js's own header already holds,
        // this runs the moment a plan exists rather than waiting on a
        // second explicit click. A thrown error (a caller-contract
        // violation on this page's own, already-CONSTRUCTED entry) is
        // caught HERE, at the UI boundary, mirroring exactly how
        // `constructBitcoinAnchorTransaction()` itself handles the
        // construction coordinator's own thrown errors.
        function bridgeBitcoinAnchorTransactionToReview(entry) {
            if (entry.bitcoinAnchorTransactionConstruction.state !== BitcoinAnchorTransactionConstructionState.CONSTRUCTED) return;
            if (!bitcoinAnchorTransactionReviewCoordinator) return;
            let outcome;
            try {
                outcome = bitcoinAnchorTransactionReviewCoordinator.review({
                    construction: entry.bitcoinAnchorTransactionConstruction.construction
                });
            } catch (error) {
                bitcoinAnchorTransactionReview.reason = error.message;
                return;
            }
            if (outcome.reviewable) {
                bitcoinAnchorTransactionReview.description = outcome.description;
                bitcoinAnchorTransactionReview.publicationId = entry.publication.id;
            } else {
                bitcoinAnchorTransactionReview.reason = outcome.reason;
            }
        }

        // The ONE place this page ever calls
        // `bitcoinAnchorReviewedSigningCoordinator.sign()` — never
        // triggered automatically by construction, by review, or merely by
        // a wallet being connected; only an explicit "Sign Reviewed
        // Transaction" click. `reviewedUnsignedPsbtHex` is read fresh from
        // `bitcoinAnchorTransactionReviewView()` at the moment of THIS
        // click, never cached earlier — the exact bytes a person is
        // looking at right now are the exact bytes handed to the signer,
        // which independently re-serializes and compares them before ever
        // consulting the wallet (anchoring/BitcoinAnchorReviewedPsbtSigner.js,
        // 0.8.59, unchanged). A thrown error is caught HERE, at the UI
        // boundary, and turned into its own honest FAILED outcome —
        // mirroring exactly how `constructBitcoinAnchorTransaction()` above
        // already handles its own coordinator's thrown errors.
        async function signBitcoinAnchorReviewedTransaction() {
            if (!bitcoinAnchorReviewedSigningCoordinator) return;
            const review = bitcoinAnchorTransactionReviewView();
            if (!review || !bitcoinAnchorTransactionReview.description) return;

            // A fresh signing attempt retires whatever was previously
            // finalized or broadcast-ready — never left showing a stale
            // FINALIZED badge or a stale broadcast result for a signature
            // this click is about to replace. See
            // `bitcoinAnchorSignedPsbtFinalizationOutcome`'s and
            // `bitcoinAnchorFinalizedTransaction`'s/`bitcoinAnchorBroadcastOutcome`'s
            // own declarations above.
            bitcoinAnchorSignedPsbtFinalizationOutcome.value = null;
            bitcoinAnchorFinalizedTransaction.value = null;
            bitcoinAnchorBroadcastOutcome.value = null;
            bitcoinAnchorBroadcastedAt.value = null;
            retireBitcoinAnchorBroadcastConfirmationContext();
            bitcoinAnchorReviewedSigningOutcome.value = { state: BitcoinAnchorReviewedSigningState.SIGNING, psbt: null, signedInputs: null, reason: null };
            try {
                bitcoinAnchorReviewedSigningOutcome.value = await bitcoinAnchorReviewedSigningCoordinator.sign({
                    wallet: bitcoinWalletConnection ? bitcoinWalletConnection.wallet : null,
                    description: bitcoinAnchorTransactionReview.description,
                    reviewedUnsignedPsbtHex: review.unsignedPsbtHex
                });
            } catch (error) {
                bitcoinAnchorReviewedSigningOutcome.value = { state: BitcoinAnchorReviewedSigningState.FAILED, psbt: null, signedInputs: null, reason: error.message };
            }
        }

        // Pure projection of `bitcoinAnchorReviewedSigningOutcome` through
        // application/BitcoinAnchorReviewedSigningView.js's own
        // `describeBitcoinAnchorReviewedSigning()` — the identical "the UI
        // owns no facts of its own, it only projects an injected
        // collaborator's own result" discipline every other `*View()`
        // function on this page already holds.
        function bitcoinAnchorReviewedSigningView() {
            return describeBitcoinAnchorReviewedSigning(bitcoinAnchorReviewedSigningOutcome.value);
        }

        function bitcoinAnchorReviewedSigningBadgeClass() {
            return BITCOIN_ANCHOR_REVIEWED_SIGNING_BADGE_CLASSES[bitcoinAnchorReviewedSigningView().state] || 'peer-badge--pending';
        }

        function isBitcoinAnchorReviewedSigning() {
            return bitcoinAnchorReviewedSigningView().state === BitcoinAnchorReviewedSigningState.SIGNING;
        }

        // 0.8.63 — Explicit Signed PSBT Verification & Transaction
        // Finalization UI.
        //
        // The ONE place this page ever calls
        // `bitcoinAnchorSignedPsbtFinalizationCoordinator.finalize()` —
        // never triggered automatically by a SIGNED result; only an
        // explicit "Verify & Finalize Transaction" click. Exactly as
        // application/BitcoinAnchorReviewedSigningState.js's own header
        // names it: "A wallet-returned PSBT is an untrusted artifact until
        // ForkBuild independently verifies and finalizes it" — the wallet's
        // own claimed signature (`bitcoinAnchorReviewedSigningOutcome.value.psbt`)
        // is handed to the finalizer completely unmodified, exactly as the
        // wallet returned it. Synchronous — see application/
        // BitcoinAnchorSignedPsbtFinalizationCoordinator.js's own header on
        // why `finalize()` performs no async work of any kind. A thrown
        // error is caught HERE, at the UI boundary, and turned into its own
        // honest FAILED outcome — mirroring exactly how
        // `signBitcoinAnchorReviewedTransaction()` above already handles
        // its own coordinator's thrown errors.
        function finalizeBitcoinAnchorSignedPsbt() {
            if (!bitcoinAnchorSignedPsbtFinalizationCoordinator) return;
            const signing = bitcoinAnchorReviewedSigningView();
            if (signing.state !== BitcoinAnchorReviewedSigningState.SIGNED) return;
            const signedPsbt = bitcoinAnchorReviewedSigningOutcome.value ? bitcoinAnchorReviewedSigningOutcome.value.psbt : null;
            if (!signedPsbt || !bitcoinAnchorTransactionReview.description) return;

            // A fresh finalization attempt retires whatever was previously
            // broadcast-ready — never left showing a stale broadcast result
            // for a finalized transaction this click is about to replace.
            // See `bitcoinAnchorFinalizedTransaction`'s/`bitcoinAnchorBroadcastOutcome`'s
            // own declarations above.
            bitcoinAnchorFinalizedTransaction.value = null;
            bitcoinAnchorBroadcastOutcome.value = null;
            bitcoinAnchorBroadcastedAt.value = null;
            retireBitcoinAnchorBroadcastConfirmationContext();
            bitcoinAnchorSignedPsbtFinalizationOutcome.value = { state: BitcoinAnchorSignedPsbtFinalizationState.FINALIZING, finalized: false, txid: null, rawTransaction: null, verifiedInputCount: null, reason: null };
            try {
                bitcoinAnchorSignedPsbtFinalizationOutcome.value = bitcoinAnchorSignedPsbtFinalizationCoordinator.finalize({
                    description: bitcoinAnchorTransactionReview.description,
                    signedPsbt
                });
            } catch (error) {
                bitcoinAnchorSignedPsbtFinalizationOutcome.value = { state: BitcoinAnchorSignedPsbtFinalizationState.FAILED, finalized: false, txid: null, rawTransaction: null, verifiedInputCount: null, reason: error.message };
                return;
            }

            // 0.8.64 — Explicit Bitcoin Anchor Broadcast UI. THE ONE place
            // this page ever captures a broadcast-eligible artifact — bound
            // to this exact FINALIZED outcome's own txid/rawTransaction,
            // never to "whatever this page happens to show right now." See
            // `bitcoinAnchorFinalizedTransaction`'s own declaration above.
            if (bitcoinAnchorSignedPsbtFinalizationOutcome.value.state === BitcoinAnchorSignedPsbtFinalizationState.FINALIZED) {
                bitcoinAnchorFinalizedTransaction.value = Object.freeze({
                    txid: bitcoinAnchorSignedPsbtFinalizationOutcome.value.txid,
                    rawTransaction: bitcoinAnchorSignedPsbtFinalizationOutcome.value.rawTransaction,
                    finalizedAt: Date.now()
                });

                // 0.8.80 — Explicit Bitcoin Anchor Publication Lifecycle
                // Record. THE ONE place this page ever mints a durable
                // publication identity — right here, at successful
                // finalization, never earlier and never re-run
                // automatically on a later broadcast attempt for this same
                // finalized transaction. `anchorId` is this finalized
                // transaction's own txid — the identical convention
                // `archiveBitcoinBroadcast()` below already uses for this
                // same granular pipeline's own `anchorId`. `contentHash`
                // is looked up from the publication this construction was
                // originally for, never re-derived from the PSBT itself;
                // `network` is this exact PSBT description's own network.
                const finalizedEntry = findEntry(bitcoinAnchorTransactionReview.publicationId);
                if (finalizedEntry) {
                    archiveBitcoinAnchorPublicationRecord({
                        anchorId: bitcoinAnchorSignedPsbtFinalizationOutcome.value.txid,
                        contentHash: finalizedEntry.publication.contentReference.hash,
                        txid: bitcoinAnchorSignedPsbtFinalizationOutcome.value.txid,
                        network: bitcoinAnchorTransactionReview.description.network,
                        createdAt: new Date()
                    });
                }
            }
        }

        // Pure projection of `bitcoinAnchorSignedPsbtFinalizationOutcome`
        // through application/BitcoinAnchorSignedPsbtFinalizationView.js's
        // own `describeBitcoinAnchorSignedPsbtFinalization()` — the
        // identical "the UI owns no facts of its own, it only projects an
        // injected collaborator's own result" discipline every other
        // `*View()` function on this page already holds.
        function bitcoinAnchorSignedPsbtFinalizationView() {
            return describeBitcoinAnchorSignedPsbtFinalization(bitcoinAnchorSignedPsbtFinalizationOutcome.value);
        }

        function bitcoinAnchorSignedPsbtFinalizationBadgeClass() {
            return BITCOIN_ANCHOR_SIGNED_PSBT_FINALIZATION_BADGE_CLASSES[bitcoinAnchorSignedPsbtFinalizationView().state] || 'peer-badge--pending';
        }

        // 0.8.64 — Explicit Bitcoin Anchor Broadcast UI.
        //
        // THE ONE place this page ever calls
        // `bitcoinAnchorBroadcastCoordinator.broadcast()` — never triggered
        // automatically by a FINALIZED result; only an explicit "Broadcast
        // Transaction" click, and only ever with `bitcoinAnchorFinalizedTransaction`'s
        // own bound `txid`/`rawTransaction` — never re-read from whatever
        // `bitcoinAnchorSignedPsbtFinalizationOutcome` happens to hold at
        // click time, exactly so a broadcast attempt is bound to a specific
        // finalized transaction's own identity. No automatic retry: a
        // REJECTED or UNAVAILABLE result is the end of this attempt — a
        // person clicks "Broadcast Transaction" again, explicitly, to make
        // another one (see anchoring/BitcoinAnchorTransactionBroadcaster.js's
        // own header on why resubmitting the identical, already-finalized
        // bytes is always safe when a person chooses to). A thrown error is
        // caught HERE, at the UI boundary, and turned into its own honest
        // FAILED outcome — mirroring exactly how
        // `finalizeBitcoinAnchorSignedPsbt()` above already handles its own
        // coordinator's thrown errors.
        async function broadcastBitcoinAnchorTransaction() {
            if (!bitcoinAnchorBroadcastCoordinator) return;
            const bound = bitcoinAnchorFinalizedTransaction.value;
            if (!bound) return;

            bitcoinAnchorBroadcastOutcome.value = { state: BitcoinAnchorBroadcastState.BROADCASTING, broadcasted: false, txid: null, reason: null };
            try {
                bitcoinAnchorBroadcastOutcome.value = await bitcoinAnchorBroadcastCoordinator.broadcast({
                    finalized: true,
                    txid: bound.txid,
                    rawTransaction: bound.rawTransaction
                });
            } catch (error) {
                bitcoinAnchorBroadcastOutcome.value = { state: BitcoinAnchorBroadcastState.FAILED, broadcasted: false, txid: null, reason: error.message };
            }
            // 0.8.74 — captured once, the moment this outcome settled (see
            // `bitcoinAnchorBroadcastedAt`'s own declaration above) — never
            // re-captured by anything that merely reads the outcome later.
            bitcoinAnchorBroadcastedAt.value = new Date();
            // 0.8.75 — archived durably, keyed by this transaction's own
            // txid, exactly as crossDomainPublicationObservationTimelineView()
            // below already keys this same wizard flow's own facts.
            archiveBitcoinBroadcast({
                anchorId: bound.txid,
                txid: bitcoinAnchorBroadcastOutcome.value.txid,
                state: bitcoinAnchorBroadcastOutcome.value.state,
                reason: bitcoinAnchorBroadcastOutcome.value.reason,
                broadcastedAt: bitcoinAnchorBroadcastedAt.value
            });
        }

        // Pure projection of `bitcoinAnchorBroadcastOutcome` through
        // application/BitcoinAnchorBroadcastView.js's own
        // `describeBitcoinAnchorBroadcast()` — the identical "the UI owns no
        // facts of its own, it only projects an injected collaborator's own
        // result" discipline every other `*View()` function on this page
        // already holds.
        function bitcoinAnchorBroadcastView() {
            return describeBitcoinAnchorBroadcast(bitcoinAnchorBroadcastOutcome.value);
        }

        function bitcoinAnchorBroadcastBadgeClass() {
            return BITCOIN_ANCHOR_BROADCAST_BADGE_CLASSES[bitcoinAnchorBroadcastView().state] || 'peer-badge--pending';
        }

        function isBitcoinAnchorBroadcasting() {
            return bitcoinAnchorBroadcastView().state === BitcoinAnchorBroadcastState.BROADCASTING;
        }

        // 0.8.65 — Explicit Bitcoin Anchor Confirmation UI.
        //
        // THE ONE place this page ever calls
        // `bitcoinAnchorConfirmationCoordinator.observeConfirmation()` —
        // never triggered automatically by a BROADCASTED result; only an
        // explicit "Observe Confirmation" click, and only ever with
        // `bitcoinAnchorBroadcastView()`'s own bound `txid` — never a txid
        // read from anywhere else on this page (not an anchor in the list
        // below, not a field a person could edit). Passing
        // `broadcasted: true` alongside it mirrors exactly how
        // `broadcastBitcoinAnchorTransaction()` above hands `finalized: true`
        // to `bitcoinAnchorBroadcastCoordinator.broadcast()` — a
        // caller-contract proof that this txid genuinely came from a real
        // BROADCASTED outcome, checked by the coordinator itself before the
        // injected confirmation observer is ever consulted. See application/
        // BitcoinAnchorConfirmationCoordinator.js's own header on why this
        // is the ONE thing this milestone's coordinator refuses to skip.
        //
        // Every explicit click appends its own observation to
        // `bitcoinAnchorBroadcastConfirmationHistory` via application/
        // BitcoinAnchorConfirmationObservationHistory.js's own
        // `appendBitcoinAnchorConfirmationObservationHistoryEntry()`,
        // UNCHANGED — no observation is ever rewritten into "the current
        // one"; each click performs its own independent, fresh read, even
        // when it repeats the identical state as the click before it. A
        // thrown error (a caller-contract violation this page's own guard
        // below should already prevent — the injected observer itself
        // never throws, see anchoring/BitcoinAnchorConfirmationObserver.js's
        // own header) is caught HERE, at the UI boundary, and surfaced
        // honestly rather than silently swallowed — mirroring exactly how
        // `broadcastBitcoinAnchorTransaction()` above already handles its
        // own coordinator's thrown errors.
        async function observeBitcoinAnchorBroadcastConfirmation() {
            if (!bitcoinAnchorConfirmationCoordinator) return;
            const broadcast = bitcoinAnchorBroadcastView();
            if (broadcast.state !== BitcoinAnchorBroadcastState.BROADCASTED || !broadcast.txid) return;

            bitcoinAnchorBroadcastConfirmationObserving.value = true;
            bitcoinAnchorBroadcastConfirmationError.value = null;
            try {
                const observation = await bitcoinAnchorConfirmationCoordinator.observeConfirmation({
                    broadcasted: true,
                    txid: broadcast.txid
                });
                bitcoinAnchorBroadcastConfirmationOutcome.value = observation;
                bitcoinAnchorBroadcastConfirmationHistory.value =
                    appendBitcoinAnchorConfirmationObservationHistoryEntry(bitcoinAnchorBroadcastConfirmationHistory.value, observation);
                // 0.8.75 — archived durably, keyed by the SAME txid this
                // wizard flow's own broadcast fact was archived under.
                archiveBitcoinConfirmationObservation(broadcast.txid, observation);
            } catch (error) {
                bitcoinAnchorBroadcastConfirmationError.value = error.message;
            } finally {
                bitcoinAnchorBroadcastConfirmationObserving.value = false;
            }
        }

        // Pure projection of `bitcoinAnchorBroadcastConfirmationOutcome`
        // through application/
        // BitcoinAnchorConfirmationObservationHistoryDetailView.js's own
        // `describeBitcoinAnchorConfirmationObservationDetail()` — the SAME
        // per-observation projection `bitcoinAnchorReconciliationView()`
        // below already uses for anchor reconciliation, one context over.
        // `null` until at least one "Observe Confirmation" click has
        // completed for the current broadcast transaction.
        function bitcoinAnchorBroadcastConfirmationView() {
            return describeBitcoinAnchorConfirmationObservationDetail(bitcoinAnchorBroadcastConfirmationOutcome.value);
        }

        function bitcoinAnchorBroadcastConfirmationBadgeClass() {
            const view = bitcoinAnchorBroadcastConfirmationView();
            return view ? (BITCOIN_ANCHOR_CONFIRMATION_BADGE_CLASSES[view.state] || null) : null;
        }

        // The FULL chronological narration of every past "Observe
        // Confirmation" click for the CURRENT broadcast transaction —
        // composes application/BitcoinAnchorConfirmationObservationHistoryDetailView.js's
        // own `describeBitcoinAnchorConfirmationObservationHistoryDetails()`
        // over `bitcoinAnchorBroadcastConfirmationHistory`, the SAME
        // composition `bitcoinAnchorConfirmationHistoryView(entry, anchorView)`
        // below already uses for "Reconcile" clicks against a persisted
        // anchor — a DIFFERENT, separately kept history; never merged with
        // that one, and never merged with content-proof history either.
        function bitcoinAnchorBroadcastConfirmationHistoryView() {
            return describeBitcoinAnchorConfirmationObservationHistoryDetails(bitcoinAnchorBroadcastConfirmationHistory.value);
        }

        function toggleBitcoinAnchorBroadcastConfirmationHistory() {
            bitcoinAnchorBroadcastConfirmationHistoryExpanded.value = !bitcoinAnchorBroadcastConfirmationHistoryExpanded.value;
        }

        function toggleBitcoinAnchorBroadcastConfirmationHistoryEntry(index) {
            bitcoinAnchorBroadcastConfirmationHistoryEntryExpanded.value = {
                ...bitcoinAnchorBroadcastConfirmationHistoryEntryExpanded.value,
                [index]: !bitcoinAnchorBroadcastConfirmationHistoryEntryExpanded.value[index]
            };
        }

        function isBitcoinAnchorBroadcastConfirmationHistoryEntryExpanded(index) {
            return Boolean(bitcoinAnchorBroadcastConfirmationHistoryEntryExpanded.value[index]);
        }

        // Pure projection of `entry.bitcoinAnchorTransactionConstruction`
        // through application/BitcoinAnchorTransactionConstructionView.js's
        // own `describeBitcoinAnchorTransactionConstruction()` — the
        // identical "the UI owns no facts of its own, it only projects an
        // injected collaborator's own result" discipline every other
        // `*View()` function on this page already holds. `null` whenever
        // nothing has been constructed for this entry yet — the section
        // below simply does not render either way.
        function bitcoinAnchorTransactionConstructionView(entry) {
            if (!entry.bitcoinAnchorTransactionConstruction) return null;
            return describeBitcoinAnchorTransactionConstruction(entry.bitcoinAnchorTransactionConstruction);
        }

        function bitcoinAnchorTransactionConstructionBadgeClass(entry) {
            const view = bitcoinAnchorTransactionConstructionView(entry);
            if (!view) return 'peer-badge--pending';
            return BITCOIN_ANCHOR_TRANSACTION_CONSTRUCTION_BADGE_CLASSES[view.state] || 'peer-badge--pending';
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

        // 0.8.40 — Snapshot Possession Observation Exchange. The
        // question-only sibling of `selectedPeerForMaterialization()`/
        // `requestSnapshotFromPeer()` immediately above, one axis over:
        // always for exactly ONE already-authenticated peer a person
        // picked from THIS entry's own "Peer Snapshot Possession"
        // dropdown, always because they clicked "Check with Peer"/"Check
        // with Peer Again" on it. Never called from onMounted(),
        // refreshList(), or any other action — only this explicit click
        // ever asks a peer whether it possesses anything. Never touches
        // `entry.peerMaterializationAttempt`, `recordMaterializationSource()`,
        // or `recordMaterializationHistoryEntry()` — an observation is not
        // a materialization, and never becomes one automatically; see
        // application/ObservePeerSnapshotPossessionUseCase.js's own
        // header.
        function selectedPeerForPossessionCheck(entry) {
            return retrievalPeers.value.find((peer) => peer.connectionId === entry.peerPossessionSelectedPeerId) || null;
        }

        async function checkSnapshotPossessionWithPeer(entry) {
            const peer = selectedPeerForPossessionCheck(entry);
            if (!peer || !snapshotPeerPossessionCoordinator) return;
            entry.peerPossessionAttempt = { checking: true };
            try {
                const observation = await snapshotPeerPossessionCoordinator.observe({
                    peer, publicationId: entry.publication.id, contentHash: entry.publication.contentReference.hash
                });
                entry.peerPossessionAttempt = {
                    checking: false, error: null,
                    peerId: observation.peerId, state: observation.state,
                    publicationId: observation.publicationId, contentHash: observation.contentHash, observedAt: observation.observedAt
                };
            } catch (error) {
                entry.peerPossessionAttempt = { checking: false, state: null, error: error.message };
            }
        }

        function peerPossessionView(entry) {
            return describePeerPossessionAttempt(entry.peerPossessionAttempt);
        }

        function peerPossessionBadgeClass(entry) {
            const state = peerPossessionView(entry).state;
            return PEER_POSSESSION_BADGE_CLASSES[state] || null;
        }

        function peerPossessionButtonLabel(entry) {
            const view = peerPossessionView(entry);
            return describePeerPossessionButtonLabel({
                checking: view.checking,
                checked: view.state !== SnapshotPeerPossessionUiState.IDLE
            });
        }

        // 0.8.41 — Peer Snapshot Possession Comparison & Observation
        // History. `togglePeerPossessionCompareSelection()` is the ONLY
        // place `entry.peerPossessionCompareSelectedPeerIds` ever changes —
        // a plain checkbox toggle, never touched by any automatic
        // discovery, ranking, or "select all" gesture. `selectedPeersFor
        // PossessionComparison()` turns those checked-box connectionIds
        // back into real, currently-authenticated ConnectedPeer objects —
        // a peer that disconnects between being checked and the click is
        // silently dropped from the list actually asked, exactly mirroring
        // `selectedPeerForPossessionCheck()`/`selectedPeerForMaterialization()`'s
        // own identical restraint one axis over.
        function togglePeerPossessionCompareSelection(entry, connectionId) {
            const index = entry.peerPossessionCompareSelectedPeerIds.indexOf(connectionId);
            if (index === -1) {
                entry.peerPossessionCompareSelectedPeerIds.push(connectionId);
            } else {
                entry.peerPossessionCompareSelectedPeerIds.splice(index, 1);
            }
        }

        function selectedPeersForPossessionComparison(entry) {
            return retrievalPeers.value.filter((peer) => entry.peerPossessionCompareSelectedPeerIds.includes(peer.connectionId));
        }

        // The explicit "Check Selected Peers" action — the ONLY place
        // application/SnapshotPeerPossessionCoordinator.js#observePeers()
        // is ever called. Every observation it returns is APPENDED to
        // `entry.peerPossessionObservationHistory`, never replacing an
        // earlier one — this is the one deliberate difference from
        // `checkSnapshotPossessionWithPeer()` immediately above, whose own
        // single `entry.peerPossessionAttempt` is still replaced each
        // click. Neither function ever calls the other, and neither
        // function's own state is ever read by the other's view.
        async function checkSnapshotPossessionWithSelectedPeers(entry) {
            const peers = selectedPeersForPossessionComparison(entry);
            if (peers.length === 0 || !snapshotPeerPossessionCoordinator) return;
            entry.peerPossessionComparisonChecking = true;
            try {
                const observations = await snapshotPeerPossessionCoordinator.observePeers({
                    peers, publicationId: entry.publication.id, contentHash: entry.publication.contentReference.hash
                });
                let history = entry.peerPossessionObservationHistory;
                for (const observation of observations) {
                    history = appendSnapshotPeerPossessionObservationHistoryEntry(history, observation);
                }
                entry.peerPossessionObservationHistory = history;
            } finally {
                entry.peerPossessionComparisonChecking = false;
            }
        }

        // Pure, synchronous: always recomputed from `entry.
        // peerPossessionObservationHistory`'s own latest-per-peer
        // reduction, never a separately maintained "current" field —
        // exactly the same "derive, don't cache" discipline `currentPossessionView()`
        // above already holds for local possession.
        function peerPossessionComparisonView(entry) {
            const latest = latestSnapshotPeerPossessionObservationsByPeer(entry.peerPossessionObservationHistory, {
                publicationId: entry.publication.id, contentHash: entry.publication.contentReference.hash
            });
            return describeSnapshotPeerPossessionComparison(entry.publication.id, entry.publication.contentReference.hash, latest);
        }

        function peerPossessionComparisonRowBadgeClass(peerRow) {
            return PEER_POSSESSION_BADGE_CLASSES[peerRow.state] || null;
        }

        function peerPossessionComparisonRowLabel(peerRow) {
            return describeSnapshotPeerPossessionStateLabel(peerRow.state);
        }

        // 0.8.42 — Explicit Snapshot Source Selection & Materialization UX.
        // The missing link this milestone exists to add: turning ONE
        // already-rendered "Peer Snapshot Possession Comparison" row into
        // an explicit action, without turning the OBSERVATION that row
        // shows into an automatic materialization. Always for exactly the
        // ONE peer named on the row a person clicked "Get Snapshot from
        // <peer>" on — never every AVAILABLE peer, never a "best" peer
        // this page picked on their behalf. Routes through application/
        // SnapshotMaterializationSelectionCoordinator.js, wrapping a PEER
        // selection (application/SnapshotMaterializationSourceSelection.js)
        // around EXACTLY the same underlying application/
        // MaterializeSnapshotFromPeerUseCase.js "Get Snapshot from Peer"
        // (0.8.37) already runs — never a fourth materialization
        // mechanism. This function never reads, writes, or otherwise
        // touches `entry.peerPossessionObservationHistory` — the row's own
        // AVAILABLE/NOT_AVAILABLE/UNAVAILABLE label is a possession
        // OBSERVATION, a frozen fact about a past moment, and stays
        // exactly what it already said no matter what this materialization
        // ATTEMPT — a brand new, independently-timed fact — goes on to
        // report. See docs/Principles.md, "An Observation Can Inform A
        // Person's Choice Without Becoming An Application Decision
        // (0.8.42)."
        async function materializeFromComparisonPeer(entry, peerId) {
            const peer = retrievalPeers.value.find((candidate) => candidate.connectionId === peerId);
            if (!peer || !snapshotMaterializationSelectionCoordinator) return;
            entry.peerPossessionComparisonMaterializations[peerId] = { requesting: true };
            try {
                const selection = createSnapshotMaterializationSourceSelection({
                    kind: SnapshotMaterializationSourceKind.PEER,
                    peer, publicationId: entry.publication.id, contentHash: entry.publication.contentReference.hash
                });
                const result = await snapshotMaterializationSelectionCoordinator.materialize(selection);
                entry.peerPossessionComparisonMaterializations[peerId] = {
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
                entry.peerPossessionComparisonMaterializations[peerId] = { requesting: false, outcome: null, error: error.message };
            }
        }

        function comparisonPeerMaterializationView(entry, peerId) {
            return describePeerMaterializationAttempt(entry.peerPossessionComparisonMaterializations[peerId]);
        }

        function comparisonPeerMaterializationBadgeClass(entry, peerId) {
            const state = comparisonPeerMaterializationView(entry, peerId).state;
            return PEER_MATERIALIZATION_BADGE_CLASSES[state] || null;
        }

        function comparisonPeerMaterializationButtonLabel(entry, peerRow) {
            const view = comparisonPeerMaterializationView(entry, peerRow.peerId);
            const peerLabel = peerPossessionRowLabel(peerRow.peerId);
            if (view.requesting) return 'Requesting…';
            return view.state !== SnapshotPeerMaterializationUiState.IDLE
                ? `Get Snapshot from ${peerLabel} Again`
                : `Get Snapshot from ${peerLabel}`;
        }

        // The FULL chronological narration — every recorded observation,
        // including repeat checks of the same peer — for the "Possession
        // Observation History" disclosure, deliberately separate from the
        // latest-per-peer comparison above.
        function peerPossessionObservationHistoryView(entry) {
            return describeSnapshotPeerPossessionObservationHistory(entry.peerPossessionObservationHistory);
        }

        function togglePeerPossessionComparisonHistory(entry) {
            entry.peerPossessionComparisonHistoryExpanded = !entry.peerPossessionComparisonHistoryExpanded;
        }

        // 0.8.45 — Explicit Peer Possession Observation Inspection.
        // Composes application/SnapshotPeerPossessionObservationDetailView.js's
        // own describeSnapshotPeerPossessionObservationDetails() over this
        // entry's existing `peerPossessionObservationHistory` (0.8.41) — the
        // IDENTICAL sequence `peerPossessionObservationHistoryView()` above
        // already reads, never a second, separately-tracked history.
        function peerPossessionObservationDetailsView(entry) {
            return describeSnapshotPeerPossessionObservationDetails(entry.peerPossessionObservationHistory);
        }

        // Per-observation disclosure state, addressed by that observation's
        // own stable index (see `entry.peerPossessionObservationHistoryEntryExpanded`'s
        // own header). Toggling one row never touches another, and never
        // touches the outer "Show/Hide Observation History" state above it.
        function isPeerPossessionObservationHistoryEntryExpanded(entry, index) {
            return Boolean(entry.peerPossessionObservationHistoryEntryExpanded[index]);
        }

        function togglePeerPossessionObservationHistoryEntry(entry, index) {
            entry.peerPossessionObservationHistoryEntryExpanded[index] = !entry.peerPossessionObservationHistoryEntryExpanded[index];
        }

        // Display-only: turns a bare `peerId` (an application/
        // SnapshotPeerPossessionObservation.js connectionId) back into a
        // readable label, for a comparison row or a history row alike. A
        // peer that has since disconnected — an observation is a
        // historical fact, and stays on screen after the peer it named is
        // gone — falls back to `shortId(peerId)` rather than disappearing
        // or being relabeled "Unknown peer," which is reserved for a
        // genuinely null peerId.
        function peerPossessionRowLabel(peerId) {
            if (!peerId) return 'Unknown peer';
            const peer = retrievalPeers.value.find((candidate) => candidate.connectionId === peerId);
            if (peer) return peer.alias || (peer.remoteIdentity ? shortId(peer.remoteIdentity.identityId) : 'Unknown peer');
            return shortId(peerId);
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

        // 0.8.68 — Explicit Remote IPFS Publishing Configuration & UX.
        //
        // "Configure Remote Publishing" opens a small, entry-local form —
        // draft fields only, never a real application/
        // IpfsRemotePublishingConfiguration.js until "Save Configuration"
        // is actually clicked. Opening or canceling the form never
        // constructs, discards, or touches a configuration that already
        // exists; canceling simply hides the form again, leaving whatever
        // was previously configured (if anything) exactly as it was.
        function openIpfsRemotePublishingConfigureForm(entry) {
            const existing = entry.ipfsRemotePublishingConfiguration;
            entry.ipfsRemotePublishingDraft = {
                endpoint: existing ? existing.endpoint : '',
                credential: '',
                requestField: existing ? (existing.requestField || '') : '',
                responseField: existing ? (existing.responseField || '') : ''
            };
            entry.ipfsRemotePublishingConfigureFormOpen = true;
        }

        function cancelIpfsRemotePublishingConfigureForm(entry) {
            entry.ipfsRemotePublishingConfigureFormOpen = false;
        }

        // Mirrors togglePlacements()/toggleEvidence()'s own single-button
        // shape exactly — opening re-seeds the draft from whatever is
        // currently configured (see openIpfsRemotePublishingConfigureForm()
        // above); canceling only hides the form again.
        function toggleIpfsRemotePublishingConfigureForm(entry) {
            if (entry.ipfsRemotePublishingConfigureFormOpen) {
                cancelIpfsRemotePublishingConfigureForm(entry);
            } else {
                openIpfsRemotePublishingConfigureForm(entry);
            }
        }

        // Constructs a brand-new application/IpfsRemotePublishingConfiguration.js
        // from this entry's own draft fields — THE ONE place this page
        // ever constructs one. A (re)configuration always retires whatever
        // was previously published under the OLD configuration: a newly
        // configured capability always starts unpublished again, never
        // inheriting a previous configuration's own PUBLISHED outcome. See
        // application/IpfsRemotePublicationState.js's own header.
        function saveIpfsRemotePublishingConfiguration(entry) {
            const draft = entry.ipfsRemotePublishingDraft;
            try {
                entry.ipfsRemotePublishingConfiguration = new IpfsRemotePublishingConfiguration({
                    endpoint: draft.endpoint,
                    credential: draft.credential || null,
                    requestField: draft.requestField || null,
                    responseField: draft.responseField || null
                });
            } catch (error) {
                entry.ipfsRemotePublicationOutcome = { state: IpfsRemotePublicationState.FAILED, published: false, contentHash: null, locator: null, endpoint: null, publishedAt: null, reason: error.message };
                entry.ipfsPublicationRecord = null;
                entry.ipfsPublicationContentVerification = null;
                // entry.ipfsPublicationRecordHistory is deliberately NOT
                // cleared here — see clearIpfsRemotePublishingConfiguration()
                // below for why.
                return;
            }
            entry.ipfsRemotePublicationOutcome = null;
            entry.ipfsPublicationRecord = null;
            entry.ipfsPublicationContentVerification = null;
            entry.ipfsRemotePublishingConfigureFormOpen = false;
        }

        // Discards this entry's own configuration and every fact drawn
        // from it — mirroring anchoring/BitcoinWalletConnection.js#disconnect()'s
        // own unconditional discard, one axis over: the capability is
        // simply given up, never persisted anywhere first.
        //
        // 0.8.71 — entry.ipfsPublicationRecordHistory is deliberately NOT
        // cleared here, unlike ipfsPublicationRecord/
        // ipfsPublicationContentVerification above. Those two describe
        // "the current publication attempt's own state," which a
        // (re)configuration genuinely retires. The history describes
        // PAST publications — historical facts about what this entry was
        // actually published as, under whatever configuration was active
        // at the time — and reconfiguring or clearing the provider used
        // for the NEXT publish does not erase what already happened.
        function clearIpfsRemotePublishingConfiguration(entry) {
            entry.ipfsRemotePublishingConfiguration = null;
            entry.ipfsRemotePublicationOutcome = null;
            entry.ipfsPublicationRecord = null;
            entry.ipfsPublicationContentVerification = null;
            entry.ipfsRemotePublishingConfigureFormOpen = false;
        }

        function ipfsRemotePublishingConfigurationView(entry) {
            return describeIpfsRemotePublishingConfiguration(entry.ipfsRemotePublishingConfiguration);
        }

        // THE ONE place this page ever calls
        // application/IpfsRemotePublicationCoordinator.js#publish() —
        // never triggered automatically by saving a configuration; only an
        // explicit "Publish to Remote IPFS" click. Bytes are sourced
        // exactly the way application/CreateExternalSnapshotPlacementUseCase.js
        // (0.8.18) already sources them for the unrelated Snapshot
        // Placement pipeline — a local integrity check against this
        // entry's own claimed content hash, then the same resolver's own
        // `resolve()` — deliberately NOT by importing that use case
        // itself, which is bound to application/
        // SnapshotPlacementStoreRegistry.js and a persisted, cataloged
        // placement; this milestone's own coordinator never catalogs
        // anything (see that coordinator's own header). A thrown error is
        // caught HERE, at the UI boundary, and turned into its own honest
        // FAILED outcome, mirroring `broadcastBitcoinAnchorTransaction()`'s
        // own identical restraint above.
        async function publishToRemoteIpfs(entry) {
            if (!ipfsRemotePublicationCoordinator || !publicationCatalogContentResolver) return;
            const configuration = entry.ipfsRemotePublishingConfiguration;
            if (!configuration) return;

            entry.ipfsRemotePublicationOutcome = { state: IpfsRemotePublicationState.PUBLISHING, published: false, contentHash: null, locator: null, endpoint: null, publishedAt: null, reason: null };
            // 0.8.70 — a fresh publish attempt retires whatever record and
            // verification observation the PREVIOUS attempt bound, exactly
            // like finalizeBitcoinAnchorSignedPsbt() retires the previous
            // broadcast/confirmation context above — a newly (re)published
            // entry always starts unverified again, never inheriting a
            // stale record's own last observation.
            entry.ipfsPublicationRecord = null;
            entry.ipfsPublicationContentVerification = null;
            try {
                const contentHash = entry.publication.contentReference.hash;
                const isValid = publicationCatalogContentResolver.verify(entry.publication.id, contentHash);
                if (!isValid) {
                    throw new Error('local snapshot integrity check failed — refusing to publish it externally');
                }
                const snapshotJson = publicationCatalogContentResolver.resolve(entry.publication.id);
                const bytes = JSON.stringify(snapshotJson);
                entry.ipfsRemotePublicationOutcome = await ipfsRemotePublicationCoordinator.publish({ bytes, configuration });
                // 0.8.70 — the ONE place this page ever constructs an
                // application/IpfsPublicationRecord.js: immediately after a
                // REAL PUBLISHED outcome, from that outcome's own
                // contentHash/locator/publishedAt — never re-derived, never
                // typed in, never reused from a different entry.
                if (entry.ipfsRemotePublicationOutcome.state === IpfsRemotePublicationState.PUBLISHED) {
                    entry.ipfsPublicationRecord = new IpfsPublicationRecord({
                        contentHash: entry.ipfsRemotePublicationOutcome.contentHash,
                        locator: entry.ipfsRemotePublicationOutcome.locator,
                        publishedAt: entry.ipfsRemotePublicationOutcome.publishedAt,
                        publicationMethod: IpfsPublicationMethod.REMOTE_PINNING
                    });
                    // 0.8.71 — the newly bound record is ALSO appended to
                    // this entry's own append-only publication history —
                    // never replacing an earlier entry there, even one
                    // naming the identical contentHash. See application/
                    // IpfsPublicationRecordHistory.js's own header for why
                    // publishing the same content twice must still produce
                    // two separate, independently inspectable records.
                    entry.ipfsPublicationRecordHistory = appendIpfsPublicationRecordHistoryEntry(
                        entry.ipfsPublicationRecordHistory, entry.ipfsPublicationRecord
                    );
                    // 0.8.75 — the newly bound record is ALSO archived
                    // durably, side by side with the ephemeral history
                    // above — see archivePublishIpfsRecord()'s own header.
                    archivePublishIpfsRecord(entry, entry.ipfsPublicationRecordHistory.length - 1, entry.ipfsPublicationRecord);
                }
            } catch (error) {
                entry.ipfsRemotePublicationOutcome = { state: IpfsRemotePublicationState.FAILED, published: false, contentHash: null, locator: null, endpoint: null, publishedAt: null, reason: error.message };
            }
        }

        function ipfsRemotePublicationView(entry) {
            return describeIpfsRemotePublication(entry.ipfsRemotePublicationOutcome);
        }

        function ipfsRemotePublicationBadgeClass(entry) {
            return IPFS_REMOTE_PUBLICATION_BADGE_CLASSES[ipfsRemotePublicationView(entry).state] || 'peer-badge--pending';
        }

        function isIpfsRemotePublishing(entry) {
            return ipfsRemotePublicationView(entry).state === IpfsRemotePublicationState.PUBLISHING;
        }

        // 0.8.70 — IPFS Publication & Content Verification UI. THE ONE
        // place this page ever calls application/
        // IpfsPublicationContentVerificationCoordinator.js#verify() —
        // never triggered automatically by reaching PUBLISHED, opening
        // this section, configuring a gateway, opening a different
        // publication, or observing a Bitcoin confirmation elsewhere on
        // this same page. Reads entry.ipfsPublicationRecord — the exact
        // record publishToRemoteIpfs() bound above — never a CID or
        // content hash reconstructed from whatever this section currently
        // displays, so switching between publications can never verify
        // one publication's locator against a different publication's
        // content hash. A thrown error is caught HERE, at the UI
        // boundary, mirroring publishToRemoteIpfs()'s and
        // observeBitcoinAnchorBroadcastConfirmation()'s own identical
        // restraint.
        async function verifyIpfsPublicationContent(entry) {
            if (!ipfsPublicationContentVerificationCoordinator) return;
            const record = entry.ipfsPublicationRecord;
            if (!record) return;

            entry.ipfsPublicationContentVerification = {
                state: IpfsPublicationContentVerificationCoordinatorState.VERIFYING,
                contentHash: null, locator: null, reason: null, observedAt: null
            };
            try {
                entry.ipfsPublicationContentVerification = await ipfsPublicationContentVerificationCoordinator.verify(record);
            } catch (error) {
                entry.ipfsPublicationContentVerification = {
                    state: IpfsPublicationContentVerificationCoordinatorState.FAILED,
                    contentHash: null, locator: null, reason: error.message, observedAt: new Date()
                };
            }
        }

        function ipfsPublicationContentVerificationView(entry) {
            return describeIpfsPublicationContentVerification(entry.ipfsPublicationContentVerification);
        }

        function ipfsPublicationContentVerificationBadgeClass(entry) {
            return IPFS_PUBLICATION_CONTENT_VERIFICATION_BADGE_CLASSES[ipfsPublicationContentVerificationView(entry).state] || 'peer-badge--pending';
        }

        function isVerifyingIpfsPublicationContent(entry) {
            return ipfsPublicationContentVerificationView(entry).state === IpfsPublicationContentVerificationCoordinatorState.VERIFYING;
        }

        // "Verify IPFS Content" the first time a record exists with no
        // observation yet; "Verify Again" for every click after — the
        // identical relabeling reconcileBitcoinAnchor()'s own
        // bitcoinAnchorReconcileButtonLabel() already performs one domain
        // over.
        function ipfsPublicationContentVerifyButtonLabel(entry) {
            if (isVerifyingIpfsPublicationContent(entry)) return 'Verifying…';
            return entry.ipfsPublicationContentVerification ? 'Verify Again' : 'Verify IPFS Content';
        }

        // 0.8.71 — IPFS Publication Record History & Inspection.
        //
        // The FULL chronological narration of every record
        // publishToRemoteIpfs() has ever appended for THIS entry —
        // composes application/IpfsPublicationRecordHistoryView.js's own
        // describeIpfsPublicationRecordHistory() over `entry.
        // ipfsPublicationRecordHistory`, unchanged — never a second
        // history, and never anything the history itself did not already
        // carry.
        function ipfsPublicationRecordHistoryView(entry) {
            return describeIpfsPublicationRecordHistory(entry.ipfsPublicationRecordHistory);
        }

        function toggleIpfsPublicationRecordHistory(entry) {
            entry.ipfsPublicationRecordHistoryExpanded = !entry.ipfsPublicationRecordHistoryExpanded;
        }

        // Per-record "Inspect" disclosure — a purely local, synchronous
        // read of that ONE history entry's own fields, never a network
        // request and never a call into the verification coordinator.
        // "Inspect" and "Verify"/"Verify Again" below stay two genuinely
        // separate actions, mirroring the same restraint this page's own
        // "External Evidence" inspection already holds one domain over.
        // Addressed by the record's own stable index within THIS entry's
        // own history — stable because the history is append-only and
        // never reordered or removed from.
        function toggleIpfsPublicationRecordInspection(entry, index) {
            entry.ipfsPublicationRecordInspectionExpanded[index] = !entry.ipfsPublicationRecordInspectionExpanded[index];
        }

        function isIpfsPublicationRecordInspectionExpanded(entry, index) {
            return Boolean(entry.ipfsPublicationRecordInspectionExpanded[index]);
        }

        // THE ONE PLACE THIS PAGE VERIFIES A HISTORICAL RECORD — unchanged
        // from 0.8.71's own identical identity boundary: reads `entry.
        // ipfsPublicationRecordHistory[index]` directly, the exact
        // application/IpfsPublicationRecord.js instance that array
        // position has always held, and passes it straight to the
        // UNCHANGED IpfsPublicationContentVerificationCoordinator. This
        // NEVER reconstructs `{ locator, contentHash }` from whatever this
        // section currently displays, and never reads `entry.
        // ipfsPublicationRecord` (the separate "current publication"
        // binding above) — clicking "Verify" on history entry #0 verifies
        // EXACTLY record #0, even after entries #1, #2, ... exist.
        //
        // 0.8.72 — what changes here is what happens to the RESULT.
        // Instead of overwriting a single slot at `entry.
        // ipfsPublicationVerificationsByRecordIndex[index]` (0.8.71), the
        // resolved outcome is APPENDED onto that record's own,
        // independently kept `entry.
        // ipfsPublicationVerificationHistoriesByRecordIndex[index]` — an
        // earlier HASH_MATCH observation for this exact record is never
        // overwritten or discarded by a later UNAVAILABLE one, or vice
        // versa; see application/
        // IpfsPublicationContentVerificationHistory.js's own header.
        // Verifying entry #1 never touches entry #0's own stored history,
        // and vice versa. `entry.
        // ipfsPublicationRecordVerifyingByRecordIndex[index]` is a
        // transient, ephemeral "in flight" flag for THIS record only — it
        // is set for the duration of the call and cleared afterward, and
        // is never itself appended into the history. A thrown error is
        // caught HERE, at the UI boundary, mirroring
        // verifyIpfsPublicationContent()'s own identical restraint, and
        // its FAILED outcome is appended exactly like any other
        // observation — a caller/UI-boundary failure is still a real,
        // dated fact about an attempt that was made.
        async function verifyIpfsPublicationRecordHistoryEntry(entry, index) {
            if (!ipfsPublicationContentVerificationCoordinator) return;
            const record = entry.ipfsPublicationRecordHistory[index];
            if (!record) return;

            entry.ipfsPublicationRecordVerifyingByRecordIndex[index] = true;
            let outcome;
            try {
                outcome = await ipfsPublicationContentVerificationCoordinator.verify(record);
            } catch (error) {
                outcome = {
                    state: IpfsPublicationContentVerificationCoordinatorState.FAILED,
                    contentHash: null, locator: null, reason: error.message, observedAt: new Date()
                };
            }
            entry.ipfsPublicationRecordVerifyingByRecordIndex[index] = false;
            entry.ipfsPublicationVerificationHistoriesByRecordIndex[index] = appendIpfsPublicationContentVerificationHistoryEntry(
                entry.ipfsPublicationVerificationHistoriesByRecordIndex[index], outcome
            );
            // 0.8.75 — archived durably, side by side with the ephemeral
            // per-record history above — see
            // archiveIpfsVerificationObservation()'s own header.
            archiveIpfsVerificationObservation(entry, index, outcome);
        }

        function isVerifyingIpfsPublicationRecordHistoryEntry(entry, index) {
            return Boolean(entry.ipfsPublicationRecordVerifyingByRecordIndex[index]);
        }

        // The FULL, chronological sequence of every observation
        // verifyIpfsPublicationRecordHistoryEntry() has ever appended for
        // THIS history record — composes application/
        // IpfsPublicationContentVerificationHistoryView.js's own
        // describeIpfsPublicationContentVerificationHistory(), unchanged.
        function ipfsPublicationRecordVerificationHistoryView(entry, index) {
            return describeIpfsPublicationContentVerificationHistory(entry.ipfsPublicationVerificationHistoriesByRecordIndex[index]);
        }

        // The single MOST RECENT observation for THIS history record —
        // never a live re-verification, only the newest fact this
        // record's own history happens to have on file. Used for the
        // "Latest: ..." badge shown alongside "Verify Again" — the
        // identical single-slot badge 0.8.71 already showed, now sourced
        // from the history's own latest entry instead of a mutated slot.
        function latestIpfsPublicationRecordVerificationView(entry, index) {
            return describeIpfsPublicationContentVerification(
                latestIpfsPublicationContentVerification(entry.ipfsPublicationVerificationHistoriesByRecordIndex[index])
            );
        }

        function ipfsPublicationRecordVerificationBadgeClass(entry, index) {
            return IPFS_PUBLICATION_CONTENT_VERIFICATION_BADGE_CLASSES[latestIpfsPublicationRecordVerificationView(entry, index).state] || 'peer-badge--pending';
        }

        // A condensed counterpart for one raw entry of `
        // ipfsPublicationRecordVerificationHistoryView(entry, index)
        // .verifications` — used for each individual row of the expanded
        // "Verification History" disclosure, never for the "Latest: ..."
        // badge above (see ipfsPublicationRecordVerificationBadgeClass()).
        function ipfsPublicationVerificationEntryBadgeClass(verification) {
            return IPFS_PUBLICATION_CONTENT_VERIFICATION_BADGE_CLASSES[verification.state] || 'peer-badge--pending';
        }

        function ipfsPublicationRecordVerifyButtonLabel(entry, index) {
            if (isVerifyingIpfsPublicationRecordHistoryEntry(entry, index)) return 'Verifying…';
            return ipfsPublicationRecordVerificationHistoryView(entry, index).count > 0 ? 'Verify Again' : 'Verify Content';
        }

        // Per-record "Show/Hide Verification History" disclosure — mirrors
        // toggleIpfsPublicationRecordHistory()'s own identical shape, one
        // level down: gates whether THIS record's own full, chronological
        // observation sequence is shown, never whether a fresh
        // verification is triggered. Opening this disclosure never calls
        // the verification coordinator — see docs/Principles.md, "The UI
        // Displays Observations; It Does Not Turn Them Into A Verdict
        // (0.8.57)."
        function toggleIpfsPublicationRecordVerificationHistory(entry, index) {
            entry.ipfsPublicationVerificationHistoryExpandedByRecordIndex[index] = !entry.ipfsPublicationVerificationHistoryExpandedByRecordIndex[index];
        }

        function isIpfsPublicationRecordVerificationHistoryExpanded(entry, index) {
            return Boolean(entry.ipfsPublicationVerificationHistoryExpandedByRecordIndex[index]);
        }

        // 0.8.73 — IPFS Publication Observation Timeline. Composes
        // application/IpfsPublicationObservationTimelineView.js's own
        // describeIpfsPublicationObservationTimeline() over the SAME two
        // histories the Publication History and per-record Verification
        // History disclosures above already read — entry.
        // ipfsPublicationRecordHistory and entry.
        // ipfsPublicationVerificationHistoriesByRecordIndex — unchanged.
        // This function reads only what those two histories already hold
        // in memory; it never fetches, verifies, or appends anything of
        // its own. Presentation-only: no new domain concept, no new
        // verdict layer, just a chronological read of two existing,
        // separately maintained facts.
        function ipfsPublicationObservationTimelineView(entry) {
            return describeIpfsPublicationObservationTimeline(
                entry.ipfsPublicationRecordHistory, entry.ipfsPublicationVerificationHistoriesByRecordIndex
            );
        }

        // "Show/Hide Timeline" — mirrors toggleIpfsPublicationRecordHistory()'s
        // own identical shape. There is deliberately no "refresh" action
        // here, and no polling: opening the timeline reads whatever the
        // existing histories already hold; new entries only ever appear
        // after the existing, explicit "Publish"/"Verify Again" actions
        // append into one of those two histories.
        function toggleIpfsPublicationObservationTimeline(entry) {
            entry.ipfsPublicationObservationTimelineExpanded = !entry.ipfsPublicationObservationTimelineExpanded;
        }

        function ipfsPublicationObservationTimelineEntryBadgeClass(item) {
            if (item.kind !== IpfsPublicationObservationTimelineEntryKind.CONTENT_VERIFICATION) return 'peer-badge--pending';
            return IPFS_PUBLICATION_CONTENT_VERIFICATION_BADGE_CLASSES[item.state] || 'peer-badge--pending';
        }

        // 0.8.74 — Cross-Domain Publication Observation Timeline. Composes
        // application/PublicationObservationTimelineView.js's own
        // describePublicationObservationTimeline() over this entry's own
        // IPFS histories (the SAME two ipfsPublicationObservationTimelineView()
        // immediately above already reads) and this entry's own Bitcoin
        // facts. Nothing here is fetched, verified, or appended — it only
        // reads what is already held in memory.
        //
        // ONLY A DISCOVERED ANCHOR'S OWN CONFIRMATION/CONTENT-PROOF FACTS
        // EVER APPEAR — never a fabricated broadcast entry for it. A
        // discovered anchor (entry.evidence.anchors, bitcoin-op-return) is
        // an already-catalogued, signed claim; this replica never itself
        // observed application/BitcoinAnchorBroadcastCoordinator.js accept
        // it for broadcast, so it carries no `broadcastedAt` here at all —
        // see application/PublicationObservationTimelineView.js's own
        // header, "an anchor with no broadcastedAt contributes no broadcast
        // entry." Its own confirmation history (entry.
        // bitcoinAnchorConfirmationHistories[anchorId], from "Reconcile"
        // clicks) and its own current content proof (entry.
        // bitcoinAnchorReconciliations[anchorId].contentProof — there is no
        // history for this one, by 0.8.57's own deliberate design) are both
        // real, independently observed facts, and both appear unchanged.
        //
        // A SEPARATE, HONEST FACT FOR THE SESSION'S OWN FRESHLY BROADCAST
        // TRANSACTION. When this page's own transaction-creation wizard
        // (0.8.60–0.8.65) was used for THIS entry's own publicationId, and
        // a broadcast attempt has actually been made
        // (`bitcoinAnchorBroadcastOutcome`/`bitcoinAnchorBroadcastedAt`,
        // both page-level, declared above), that real, independently
        // observed outcome — and its own confirmation history,
        // `bitcoinAnchorBroadcastConfirmationHistory` — is included too,
        // keyed by its own txid. This wizard flow performs no content-proof
        // check of its own, so it never contributes a content-proof entry.
        //
        // NO `recordIndex` LINKAGE IS SUPPLIED for any Bitcoin fact here —
        // this page has never tracked which of an entry's own (possibly
        // several) IPFS publication records a given Bitcoin anchor
        // corresponds to, and application/PublicationObservationTimelineView
        // .js's own header is explicit that this file must never guess one
        // from a shared contentHash. Every Bitcoin entry below therefore
        // projects with `recordIndex: null` — an honest "belongs to this
        // publication, not further linked within it" — never a fabricated
        // link.
        function crossDomainPublicationObservationTimelineView(entry) {
            const discoveredAnchors = (entry.evidence && Array.isArray(entry.evidence.anchors) ? entry.evidence.anchors : [])
                .filter((anchorView) => anchorView.anchorType === 'bitcoin-op-return')
                .map((anchorView) => ({
                    recordIndex: null,
                    anchorId: anchorView.anchorId,
                    txid: null,
                    broadcastedAt: null,
                    broadcast: null
                }));

            const confirmationHistoriesByAnchorId = { ...entry.bitcoinAnchorConfirmationHistories };
            const proofObservationsByAnchorId = {};
            discoveredAnchors.forEach((anchor) => {
                const reconciliation = entry.bitcoinAnchorReconciliations[anchor.anchorId];
                proofObservationsByAnchorId[anchor.anchorId] = (reconciliation && reconciliation.contentProof) ? [reconciliation.contentProof] : [];
            });

            const anchors = discoveredAnchors;
            const bound = bitcoinAnchorFinalizedTransaction.value;
            if (bound && bitcoinAnchorTransactionReview.publicationId === entry.publication.id) {
                anchors.push({
                    recordIndex: null,
                    anchorId: bound.txid,
                    txid: bound.txid,
                    broadcastedAt: bitcoinAnchorBroadcastedAt.value,
                    broadcast: bitcoinAnchorBroadcastOutcome.value
                });
                confirmationHistoriesByAnchorId[bound.txid] = bitcoinAnchorBroadcastConfirmationHistory.value;
                proofObservationsByAnchorId[bound.txid] = [];
            }

            return describePublicationObservationTimeline({
                ipfs: {
                    publicationRecords: entry.ipfsPublicationRecordHistory,
                    verificationHistoriesByRecordIndex: entry.ipfsPublicationVerificationHistoriesByRecordIndex
                },
                bitcoin: { anchors, confirmationHistoriesByAnchorId, proofObservationsByAnchorId }
            });
        }

        function toggleCrossDomainPublicationObservationTimeline(entry) {
            entry.crossDomainPublicationObservationTimelineExpanded = !entry.crossDomainPublicationObservationTimelineExpanded;
        }

        function crossDomainPublicationObservationTimelineEntryBadgeClass(item) {
            switch (item.kind) {
                case PublicationObservationTimelineEntryKind.IPFS_CONTENT_VERIFICATION:
                    return IPFS_PUBLICATION_CONTENT_VERIFICATION_BADGE_CLASSES[item.state] || 'peer-badge--pending';
                case PublicationObservationTimelineEntryKind.BITCOIN_BROADCAST:
                    return BITCOIN_ANCHOR_BROADCAST_BADGE_CLASSES[item.state] || 'peer-badge--pending';
                case PublicationObservationTimelineEntryKind.BITCOIN_CONFIRMATION:
                    return BITCOIN_ANCHOR_CONFIRMATION_BADGE_CLASSES[item.state] || 'peer-badge--pending';
                case PublicationObservationTimelineEntryKind.BITCOIN_CONTENT_PROOF:
                    return BITCOIN_ANCHOR_CONTENT_PROOF_BADGE_CLASSES[item.state] || 'peer-badge--pending';
                default:
                    return 'peer-badge--pending';
            }
        }

        function crossDomainPublicationObservationTimelineEntryDomainLabel(item) {
            return item.domain === PublicationObservationTimelineDomain.BITCOIN ? 'Bitcoin' : 'IPFS';
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
            // 0.8.75 — the ONE place this page ever reads
            // `publicationObservationArchiveStorage`. `load()` never
            // throws (see storage/LocalStoragePublicationObservationArchive
            // .js's own header) — corrupted or missing storage simply
            // starts this session with an empty archive, never a crashed
            // page.
            publicationObservationArchive.value = publicationObservationArchiveStorage.load();

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
            ipfsRemotePublicationCoordinator, publicationCatalogContentResolver,
            openIpfsRemotePublishingConfigureForm, cancelIpfsRemotePublishingConfigureForm,
            toggleIpfsRemotePublishingConfigureForm,
            saveIpfsRemotePublishingConfiguration, clearIpfsRemotePublishingConfiguration,
            ipfsRemotePublishingConfigurationView, publishToRemoteIpfs,
            ipfsRemotePublicationView, ipfsRemotePublicationBadgeClass, isIpfsRemotePublishing,
            IpfsRemotePublicationState,
            ipfsPublicationContentVerificationCoordinator,
            verifyIpfsPublicationContent, ipfsPublicationContentVerificationView, ipfsPublicationContentVerificationBadgeClass,
            isVerifyingIpfsPublicationContent, ipfsPublicationContentVerifyButtonLabel,
            IpfsPublicationContentVerificationCoordinatorState,
            ipfsPublicationRecordHistoryView, toggleIpfsPublicationRecordHistory,
            toggleIpfsPublicationRecordInspection, isIpfsPublicationRecordInspectionExpanded,
            verifyIpfsPublicationRecordHistoryEntry, isVerifyingIpfsPublicationRecordHistoryEntry,
            ipfsPublicationRecordVerificationHistoryView, latestIpfsPublicationRecordVerificationView,
            ipfsPublicationRecordVerificationBadgeClass, ipfsPublicationVerificationEntryBadgeClass,
            ipfsPublicationRecordVerifyButtonLabel,
            toggleIpfsPublicationRecordVerificationHistory, isIpfsPublicationRecordVerificationHistoryExpanded,
            ipfsPublicationObservationTimelineView, toggleIpfsPublicationObservationTimeline,
            ipfsPublicationObservationTimelineEntryBadgeClass, IpfsPublicationObservationTimelineEntryKind,
            crossDomainPublicationObservationTimelineView, toggleCrossDomainPublicationObservationTimeline,
            crossDomainPublicationObservationTimelineEntryBadgeClass, crossDomainPublicationObservationTimelineEntryDomainLabel,
            PublicationObservationTimelineEntryKind, PublicationObservationTimelineDomain,
            publicationObservationArchiveView, publicationObservationArchiveExpanded,
            togglePublicationObservationArchive, clearPublicationObservationArchive,
            historicalBitcoinAnchorsExpanded, toggleHistoricalBitcoinAnchors, historicalBitcoinAnchorArchiveView,
            toggleHistoricalBitcoinAnchorEntry, isHistoricalBitcoinAnchorEntryExpanded, historicalBitcoinAnchorEvidenceView,
            bitcoinAnchorPublicationsExpanded, toggleBitcoinAnchorPublications, bitcoinAnchorPublicationRecordHistoryView,
            toggleBitcoinAnchorPublicationInspection, isBitcoinAnchorPublicationInspectionExpanded, bitcoinAnchorPublicationInspectionView,
            BitcoinAnchorPublicationLifecycleTimelineEntryKind,
            toggleBitcoinAnchorPublicationLifecycle, isBitcoinAnchorPublicationLifecycleExpanded,
            bitcoinAnchorPublicationLifecycleTimelineView, bitcoinAnchorPublicationLifecycleEntryDetail,
            decentralizationContrast,
            knowledgeSynchronizationCoordinator, synchronizeWithPeers, synchronizationView, synchronizationBadgeClass, synchronizationButtonLabel,
            toggleReplicaKnowledge, acquisitionBreakdownSentence,
            localSnapshotContentAvailabilityUseCase, checkLocalSnapshotAvailability, localSnapshotAvailabilityView,
            localSnapshotAvailabilityBadgeClass, localSnapshotAvailabilityButtonLabel,
            currentPossessionView, replicaContentKnowledgeView,
            snapshotAcquisitionView, snapshotAcquisitionOutcomeCountsSentence, snapshotAcquisitionNeedsSourceHint,
            snapshotStateInspectionView, snapshotStatePlacementRelationshipLabel,
            localSnapshotMaterializationSourceView,
            snapshotContentMaterializationCoordinator, onMaterializationFileChosen, importSnapshotContent,
            materializationView, materializationBadgeClass, materializationButtonLabel,
            snapshotPlacementMaterializationCoordinator, materializePlacement,
            placementMaterializationView, placementMaterializationBadgeClass, placementMaterializationButtonLabel,
            snapshotPeerMaterializationCoordinator, requestSnapshotFromPeer,
            peerMaterializationView, peerMaterializationBadgeClass, peerMaterializationButtonLabel,
            snapshotPeerPossessionCoordinator, checkSnapshotPossessionWithPeer,
            peerPossessionView, peerPossessionBadgeClass, peerPossessionButtonLabel,
            materializationHistoryDetailsView, materializationSourceCountsSentence, toggleMaterializationHistory,
            isMaterializationHistoryEntryExpanded, toggleMaterializationHistoryEntry,
            togglePeerPossessionCompareSelection, checkSnapshotPossessionWithSelectedPeers,
            peerPossessionComparisonView, peerPossessionComparisonRowBadgeClass, peerPossessionComparisonRowLabel,
            peerPossessionObservationHistoryView, togglePeerPossessionComparisonHistory, peerPossessionRowLabel,
            peerPossessionObservationDetailsView, isPeerPossessionObservationHistoryEntryExpanded, togglePeerPossessionObservationHistoryEntry,
            snapshotMaterializationSelectionCoordinator, materializeFromComparisonPeer,
            comparisonPeerMaterializationView, comparisonPeerMaterializationBadgeClass, comparisonPeerMaterializationButtonLabel,
            bitcoinAnchorProofReconciliationView, reconcileBitcoinAnchor, bitcoinAnchorReconciliationView,
            bitcoinAnchorConfirmationBadgeClass, bitcoinAnchorContentProofBadgeClass, bitcoinAnchorReconcileButtonLabel,
            bitcoinAnchorConfirmationHistoryView, toggleBitcoinAnchorConfirmationHistory, isBitcoinAnchorConfirmationHistoryExpanded,
            toggleBitcoinAnchorConfirmationHistoryEntry, isBitcoinAnchorConfirmationHistoryEntryExpanded,
            bitcoinAnchorChainPlacementComparisonView, toggleBitcoinAnchorChainPlacementComparison, isBitcoinAnchorChainPlacementComparisonExpanded,
            bitcoinAnchorObservationConsistencyView, toggleBitcoinAnchorObservationConsistency, isBitcoinAnchorObservationConsistencyExpanded,
            bitcoinAnchorObservationEvidenceView, toggleBitcoinAnchorObservationEvidence, isBitcoinAnchorObservationEvidenceExpanded,
            bitcoinWalletConnection, bitcoinWalletConnectionState, connectBitcoinWallet, disconnectBitcoinWallet,
            bitcoinWalletConnectionView, bitcoinWalletConnectionBadgeClass, isBitcoinWalletConnected, isBitcoinWalletConnecting,
            bitcoinAnchorTransactionReview, bitcoinAnchorTransactionReviewView, bitcoinAnchorTransactionReviewWalletMatchView,
            bitcoinWalletFundingObserver, bitcoinAnchorFundingState, observeBitcoinAnchorFunding,
            bitcoinAnchorFundingView, bitcoinAnchorFundingBadgeClass, isBitcoinAnchorFundingObserved,
            bitcoinAnchorFundingUtxosExpanded, toggleBitcoinAnchorFundingUtxosExpanded,
            bitcoinAnchorTransactionConstructionCoordinator, constructBitcoinAnchorTransaction,
            bitcoinAnchorTransactionConstructionView, bitcoinAnchorTransactionConstructionBadgeClass,
            BitcoinAnchorTransactionConstructionState,
            bitcoinAnchorReviewedSigningCoordinator, signBitcoinAnchorReviewedTransaction,
            bitcoinAnchorReviewedSigningView, bitcoinAnchorReviewedSigningBadgeClass, isBitcoinAnchorReviewedSigning,
            BitcoinAnchorReviewedSigningState,
            bitcoinAnchorSignedPsbtFinalizationCoordinator, finalizeBitcoinAnchorSignedPsbt,
            bitcoinAnchorSignedPsbtFinalizationView, bitcoinAnchorSignedPsbtFinalizationBadgeClass,
            BitcoinAnchorSignedPsbtFinalizationState,
            bitcoinAnchorBroadcastCoordinator, bitcoinAnchorFinalizedTransaction, broadcastBitcoinAnchorTransaction,
            bitcoinAnchorBroadcastView, bitcoinAnchorBroadcastBadgeClass, isBitcoinAnchorBroadcasting,
            BitcoinAnchorBroadcastState,
            // 0.8.65 — Explicit Bitcoin Anchor Confirmation UI.
            bitcoinAnchorConfirmationCoordinator, observeBitcoinAnchorBroadcastConfirmation,
            bitcoinAnchorBroadcastConfirmationObserving, bitcoinAnchorBroadcastConfirmationError,
            bitcoinAnchorBroadcastConfirmationView, bitcoinAnchorBroadcastConfirmationBadgeClass,
            bitcoinAnchorBroadcastConfirmationHistoryView, toggleBitcoinAnchorBroadcastConfirmationHistory,
            bitcoinAnchorBroadcastConfirmationHistoryExpanded, toggleBitcoinAnchorBroadcastConfirmationHistoryEntry,
            isBitcoinAnchorBroadcastConfirmationHistoryEntryExpanded
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

            <!-- 0.8.60 — Explicit Bitcoin Anchor Funding & Address
                 Preparation. A page-level panel, deliberately unrelated to
                 any one publication's own evidence card below — this
                 prepares funding for a transaction that has NOT YET been
                 built, so there is no evidence entry for it to attach to.
                 Absent bitcoinWalletFundingObserver, or with no wallet
                 connected, this section simply never renders — the
                 identical degrade-gracefully posture every optional
                 section on this page already holds. Every field shown is
                 read straight off the last real observation this page
                 asked for — see application/BitcoinAnchorFundingView.js's
                 own header. Nothing here selects a UTXO, builds a plan, or
                 spends anything; "Refresh Funding" asks the SAME question
                 again, fresh, never "Optimize" or "Best". -->
            <div v-if="bitcoinWalletFundingObserver && isBitcoinWalletConnected()" class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">Bitcoin Funding</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    What the connected wallet's own account can currently spend, as of the moment this was last
                    observed. Nothing is selected, spent, or committed by observing this — it is a fact about a
                    moment, not a promise about right now.
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>Network</dt><dd>{{ bitcoinWalletConnectionState.network }}</dd></div>
                    <div class="evidence-field"><dt>Account</dt><dd>{{ shortId(bitcoinWalletConnectionState.account) }}</dd></div>
                </dl>
                <button type="button" class="peer-action-btn" :disabled="bitcoinAnchorFundingState.observing" @click="observeBitcoinAnchorFunding">
                    {{ bitcoinAnchorFundingState.observing ? 'Observing…' : (bitcoinAnchorFundingView() ? 'Refresh Funding' : 'Observe Wallet Funding') }}
                </button>
                <p v-if="bitcoinAnchorFundingState.error" class="form-hint form-hint--neutral">{{ bitcoinAnchorFundingState.error }}</p>

                <div v-if="bitcoinAnchorFundingView()" class="evidence-inspection-adapter">
                    <span class="peer-badge" :class="bitcoinAnchorFundingBadgeClass()">{{ bitcoinAnchorFundingView().stateLabel }}</span>

                    <p v-if="bitcoinAnchorFundingView().networkMismatch" class="form-hint form-hint--neutral">
                        ⚠ This funding was observed on {{ bitcoinAnchorFundingView().network }}, but the connected
                        wallet is now on {{ bitcoinAnchorFundingView().expectedNetwork }}. Refresh funding before
                        relying on it.
                    </p>
                    <p v-else-if="bitcoinAnchorFundingView().reason" class="form-hint form-hint--neutral">
                        {{ bitcoinAnchorFundingView().reason }}
                    </p>

                    <dl v-if="isBitcoinAnchorFundingObserved()" class="evidence-fields">
                        <div class="evidence-field"><dt>UTXOs observed</dt><dd>{{ bitcoinAnchorFundingView().utxoCount }}</dd></div>
                        <div class="evidence-field"><dt>Total</dt><dd>{{ bitcoinAnchorFundingView().totalValueSats }} sat</dd></div>
                        <div class="evidence-field"><dt>Script type</dt><dd>{{ bitcoinAnchorFundingView().scriptType }}</dd></div>
                    </dl>

                    <button v-if="bitcoinAnchorFundingView().utxoCount > 0" type="button" class="peer-action-btn"
                        @click="toggleBitcoinAnchorFundingUtxosExpanded">
                        {{ bitcoinAnchorFundingUtxosExpanded ? 'Hide Funding Inputs' : 'Show Funding Inputs' }}
                    </button>
                    <template v-if="bitcoinAnchorFundingUtxosExpanded">
                        <dl v-for="utxo in bitcoinAnchorFundingView().utxos" :key="utxo.txid + ':' + utxo.vout" class="evidence-fields">
                            <div class="evidence-field">
                                <dt>{{ shortId(utxo.txid) }}:{{ utxo.vout }}</dt>
                                <dd>{{ utxo.valueSats }} sat ({{ utxo.scriptType }}{{ utxo.confirmed ? '' : ', unconfirmed' }})</dd>
                            </div>
                        </dl>
                    </template>

                    <dl v-if="isBitcoinAnchorFundingObserved()" class="evidence-fields">
                        <div class="evidence-field"><dt>Change destination</dt><dd>{{ shortId(bitcoinAnchorFundingView().changeAccount) }}</dd></div>
                    </dl>
                    <p v-if="isBitcoinAnchorFundingObserved()" class="form-hint form-hint--neutral">
                        Change returns to the connected wallet's own account — no separate change address is
                        requested from the wallet.
                    </p>
                </div>
            </div>

            <!-- 0.8.59/0.8.62 — Explicit Bitcoin Anchor Transaction Review
                 & Signing UI. A page-level panel, deliberately unrelated to
                 any one publication's own evidence card below: this
                 reviews a transaction BEFORE it has been published at all,
                 so there is no evidence entry yet for it to attach to.
                 Populated by an explicit "Create Transaction Plan" click
                 above (see constructBitcoinAnchorTransaction()) — absent
                 bitcoinAnchorTransactionReview.description, this section
                 simply never renders, the identical degrade-gracefully
                 posture every optional section on this page already
                 holds. See application/BitcoinAnchorTransactionReviewView.js's
                 own header on why every field here is read straight off
                 the real transaction being reviewed, never a verdict
                 about it, and anchoring/BitcoinAnchorReviewedPsbtSigner.js's
                 own header on why a wallet is never asked to sign anything
                 other than exactly what is shown here. -->
            <p v-if="bitcoinAnchorTransactionReview.reason && !bitcoinAnchorTransactionReviewView()" class="form-hint form-hint--neutral">
                {{ bitcoinAnchorTransactionReview.reason }}
            </p>
            <div v-if="bitcoinAnchorTransactionReviewView()" class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">Review Bitcoin Anchor Transaction</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    Nothing is signed or published by viewing this review. It names exactly what a wallet
                    would be asked to sign — nothing more, and nothing assumed.
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>Network</dt><dd>{{ bitcoinAnchorTransactionReviewView().network }}</dd></div>
                    <div class="evidence-field"><dt>Content hash</dt><dd>{{ bitcoinAnchorTransactionReviewView().contentHash }}</dd></div>
                    <div class="evidence-field"><dt>Fee</dt><dd>{{ bitcoinAnchorTransactionReviewView().feeSats }} sat</dd></div>
                    <div class="evidence-field"><dt>Change</dt><dd>{{ bitcoinAnchorTransactionReviewView().changeSats }} sat</dd></div>
                    <div class="evidence-field"><dt>Total input</dt><dd>{{ bitcoinAnchorTransactionReviewView().totalInputSats }} sat</dd></div>
                </dl>
                <div class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Inputs</span>
                    <dl v-for="input in bitcoinAnchorTransactionReviewView().inputs" :key="input.txid + ':' + input.vout" class="evidence-fields">
                        <div class="evidence-field"><dt>{{ shortId(input.txid) }}:{{ input.vout }}</dt><dd>{{ input.valueSats }} sat ({{ input.scriptType }})</dd></div>
                    </dl>
                </div>
                <div class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Outputs</span>
                    <dl v-for="(output, index) in bitcoinAnchorTransactionReviewView().outputs" :key="index" class="evidence-fields">
                        <div class="evidence-field">
                            <dt>{{ output.type === 'change' ? 'Change' : 'OP_RETURN' }}</dt>
                            <dd>{{ output.address ? shortId(output.address) + ' — ' : '' }}{{ output.valueSats }} sat</dd>
                        </div>
                    </dl>
                </div>

                <!-- The wallet's own network is checked against THIS
                     review's own transaction network — not a page-wide
                     default — and, exactly as anchoring/
                     BitcoinWalletConnection.js's own header requires, a
                     mismatch is only ever named here, never auto-switched,
                     auto-corrected, or silently allowed to proceed as if it
                     matched. -->
                <div v-if="bitcoinAnchorTransactionReviewWalletMatchView()" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Wallet</span>
                    <span class="peer-badge" :class="bitcoinWalletConnectionBadgeClass()">
                        {{ bitcoinAnchorTransactionReviewWalletMatchView().stateLabel }}
                    </span>
                    <dl v-if="isBitcoinWalletConnected()" class="evidence-fields">
                        <div class="evidence-field"><dt>Account</dt><dd>{{ shortId(bitcoinAnchorTransactionReviewWalletMatchView().account) }}</dd></div>
                        <div class="evidence-field"><dt>Wallet network</dt><dd>{{ bitcoinAnchorTransactionReviewWalletMatchView().network }}</dd></div>
                        <div class="evidence-field"><dt>Transaction network</dt><dd>{{ bitcoinAnchorTransactionReviewWalletMatchView().expectedNetwork }}</dd></div>
                    </dl>
                    <p v-if="bitcoinAnchorTransactionReviewWalletMatchView().networkMismatch" class="form-hint form-hint--neutral">
                        ⚠ Wallet network ({{ bitcoinAnchorTransactionReviewWalletMatchView().network }}) does not match this
                        transaction's network ({{ bitcoinAnchorTransactionReviewWalletMatchView().expectedNetwork }}).
                        Signing is unavailable until a wallet on the matching network is connected.
                    </p>
                    <p v-else-if="isBitcoinWalletConnected()" class="form-hint form-hint--neutral">
                        ✓ Network matches.
                    </p>
                </div>

                <!-- 0.8.62 — Explicit Reviewed Bitcoin Anchor Signing UI.
                     The ONE explicit action this whole review exists to
                     gate: nothing above this button ever signs anything.
                     Disabled whenever no wallet is connected, or the
                     wallet's own network does not match this transaction's
                     — a connected wallet is a signing CAPABILITY, never
                     itself permission to sign (anchoring/
                     BitcoinWalletConnection.js's own header, unchanged).
                     Clicking it performs exactly one operation: the
                     reviewed PSBT, byte for byte, is handed to the wallet —
                     see anchoring/BitcoinAnchorReviewedPsbtSigner.js's own
                     header on why a wallet is never asked to sign anything
                     that has drifted from what is shown above. -->
                <div class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Signing</span>
                    <button type="button" class="peer-action-btn"
                        :disabled="!isBitcoinWalletConnected() || (bitcoinAnchorTransactionReviewWalletMatchView() && bitcoinAnchorTransactionReviewWalletMatchView().networkMismatch) || isBitcoinAnchorReviewedSigning()"
                        @click="signBitcoinAnchorReviewedTransaction">
                        {{ isBitcoinAnchorReviewedSigning() ? 'Waiting for wallet…' : 'Sign Reviewed Transaction' }}
                    </button>

                    <span v-if="bitcoinAnchorReviewedSigningView().state !== BitcoinAnchorReviewedSigningState.IDLE" class="peer-badge"
                        :class="bitcoinAnchorReviewedSigningBadgeClass()">
                        {{ bitcoinAnchorReviewedSigningView().stateLabel }}
                    </span>
                    <p v-if="bitcoinAnchorReviewedSigningView().reason" class="form-hint form-hint--neutral">
                        {{ bitcoinAnchorReviewedSigningView().reason }}
                    </p>

                    <!-- A wallet's claim is not the signature (anchoring/
                         BitcoinAnchorWalletSigner.js's own header,
                         unchanged): SIGNED here names only that the wallet
                         returned a PSBT that independently inspects as
                         carrying recognized signing material for exactly
                         this transaction — never that ForkBuild has
                         cryptographically verified it, and never that it
                         has been finalized or broadcast. Those remain
                         their own, separately sized, explicit next steps. -->
                    <template v-if="bitcoinAnchorReviewedSigningView().state === BitcoinAnchorReviewedSigningState.SIGNED">
                        <dl class="evidence-fields">
                            <div class="evidence-field"><dt>Signed inputs</dt><dd>{{ bitcoinAnchorReviewedSigningView().signedInputCount }}</dd></div>
                        </dl>
                        <p class="form-hint form-hint--neutral">
                            The wallet returned a signed PSBT. ForkBuild has not yet cryptographically verified
                            or finalized it — that is a separate, explicit step.
                        </p>
                    </template>
                </div>

                <!-- 0.8.63 — Explicit Signed PSBT Verification & Transaction
                     Finalization UI. A wallet-returned PSBT is an untrusted
                     artifact until ForkBuild independently verifies and
                     finalizes it — this button is that explicit boundary.
                     Only ever rendered once the wallet has returned a
                     SIGNED result; clicking it hands the wallet's own
                     claimed signature, unmodified, to anchoring/
                     BitcoinAnchorSignedPsbtFinalizer.js (0.8.51, unchanged)
                     via the new application/
                     BitcoinAnchorSignedPsbtFinalizationCoordinator.js. See
                     that file's own header on why an INVALID_SIGNATURE or
                     FAILED result here is the end of this attempt — never
                     retried, re-signed, or reconstructed automatically. -->
                <div v-if="bitcoinAnchorReviewedSigningView().state === BitcoinAnchorReviewedSigningState.SIGNED" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Verification &amp; Finalization</span>
                    <p class="form-hint form-hint--neutral">
                        The wallet returned signing material. ForkBuild has not yet accepted it as a valid
                        signature.
                    </p>
                    <button type="button" class="peer-action-btn" @click="finalizeBitcoinAnchorSignedPsbt">
                        Verify &amp; Finalize Transaction
                    </button>

                    <span v-if="bitcoinAnchorSignedPsbtFinalizationView().state !== BitcoinAnchorSignedPsbtFinalizationState.IDLE" class="peer-badge"
                        :class="bitcoinAnchorSignedPsbtFinalizationBadgeClass()">
                        {{ bitcoinAnchorSignedPsbtFinalizationView().stateLabel }}
                    </span>
                    <p v-if="bitcoinAnchorSignedPsbtFinalizationView().reason" class="form-hint form-hint--neutral">
                        {{ bitcoinAnchorSignedPsbtFinalizationView().reason }}
                    </p>

                    <!-- FINALIZED names the one real cryptographic fact this
                         boundary checks — "Verified" is honest here, unlike
                         at the signing stage above, because this class
                         actually performed the verification. It is never
                         promoted to a broader "safe" or "trusted" claim —
                         see application/BitcoinAnchorSignedPsbtFinalizationView.js's
                         own header. -->
                    <template v-if="bitcoinAnchorSignedPsbtFinalizationView().state === BitcoinAnchorSignedPsbtFinalizationState.FINALIZED">
                        <dl class="evidence-fields">
                            <div class="evidence-field"><dt>Signature verification</dt><dd>✓ Verified</dd></div>
                            <div class="evidence-field">
                                <dt>Verified inputs</dt>
                                <dd>{{ bitcoinAnchorSignedPsbtFinalizationView().verifiedInputCount }} / {{ bitcoinAnchorReviewedSigningView().signedInputCount }}</dd>
                            </div>
                            <div class="evidence-field"><dt>Transaction ID</dt><dd>{{ bitcoinAnchorSignedPsbtFinalizationView().txid }}</dd></div>
                        </dl>
                        <details class="evidence-inspection-proof">
                            <summary>Raw transaction bytes</summary>
                            <pre class="evidence-inspection-proof-json">{{ bitcoinAnchorSignedPsbtFinalizationView().rawTransactionHex }}</pre>
                        </details>
                        <p class="form-hint form-hint--neutral">
                            Transaction finalized. Broadcasting it is a separate, explicit step.
                        </p>
                    </template>
                </div>

                <!-- 0.8.64 — Explicit Bitcoin Anchor Broadcast UI. The final
                     explicit boundary in this pipeline: nothing above this
                     button ever reaches the network. Only ever rendered
                     once a FINALIZED outcome has bound a real
                     bitcoinAnchorFinalizedTransaction artifact; clicking
                     it hands that exact, already-verified txid/rawTransaction
                     to anchoring/BitcoinAnchorTransactionBroadcaster.js
                     (0.8.52, unchanged) via the new application/
                     BitcoinAnchorBroadcastCoordinator.js. BROADCASTED here
                     means only "the network accepted this transaction" —
                     never that it has been confirmed; see application/
                     BitcoinAnchorBroadcastState.js's own header. A REJECTED
                     or UNAVAILABLE result is the end of this attempt —
                     never retried automatically; a person clicks "Broadcast
                     Transaction" again, explicitly, for another one. -->
                <div v-if="bitcoinAnchorFinalizedTransaction" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Broadcast</span>
                    <dl class="evidence-fields">
                        <div class="evidence-field"><dt>Transaction ID</dt><dd>{{ bitcoinAnchorFinalizedTransaction.txid }}</dd></div>
                        <div class="evidence-field"><dt>Finalized transaction</dt><dd>{{ bitcoinAnchorFinalizedTransaction.rawTransaction.bytes.length }} bytes</dd></div>
                    </dl>
                    <p class="form-hint form-hint--neutral">
                        This is the exact transaction that was reviewed, signed, and cryptographically verified.
                        Broadcasting submits it; it does not decide whether the network will accept it.
                    </p>
                    <button type="button" class="peer-action-btn"
                        :disabled="isBitcoinAnchorBroadcasting()"
                        @click="broadcastBitcoinAnchorTransaction">
                        {{ isBitcoinAnchorBroadcasting() ? 'Broadcasting…' : (bitcoinAnchorBroadcastView().state === BitcoinAnchorBroadcastState.IDLE ? 'Broadcast Transaction' : 'Broadcast Again') }}
                    </button>

                    <span v-if="bitcoinAnchorBroadcastView().state !== BitcoinAnchorBroadcastState.IDLE" class="peer-badge"
                        :class="bitcoinAnchorBroadcastBadgeClass()">
                        {{ bitcoinAnchorBroadcastView().stateLabel }}
                    </span>
                    <p v-if="bitcoinAnchorBroadcastView().reason" class="form-hint form-hint--neutral">
                        {{ bitcoinAnchorBroadcastView().reason }}
                    </p>

                    <!-- BROADCASTED names exactly one fact — the network
                         accepted this transaction — never confirmation. See
                         application/BitcoinAnchorBroadcastView.js's own
                         header on why no confirmed/confirmations/blockHeight
                         field exists here; observing confirmation remains
                         its own, separately sized, explicit next step. -->
                    <template v-if="bitcoinAnchorBroadcastView().state === BitcoinAnchorBroadcastState.BROADCASTED">
                        <dl class="evidence-fields">
                            <div class="evidence-field"><dt>Transaction ID</dt><dd>{{ bitcoinAnchorBroadcastView().txid }}</dd></div>
                        </dl>
                        <details class="evidence-inspection-proof">
                            <summary>Raw transaction bytes</summary>
                            <pre class="evidence-inspection-proof-json">{{ bitcoinAnchorFinalizedTransaction.rawTransaction.hex }}</pre>
                        </details>
                        <p class="form-hint form-hint--neutral">
                            Transaction broadcasted. This is not yet confirmation — observing confirmation is a
                            separate, explicit step.
                        </p>
                    </template>
                </div>

                <!-- 0.8.65 — Explicit Bitcoin Anchor Confirmation UI. Only
                     ever rendered once the Broadcast section immediately
                     above reaches a real BROADCASTED outcome — reaching it
                     never triggers this automatically; "Observe
                     Confirmation" is its own, separate, explicit action,
                     bound to bitcoinAnchorBroadcastView()'s own txid and
                     nothing else on this page. Deliberately a SEPARATE
                     evidence-inspection-adapter box from Broadcast above,
                     never collapsed into it or into a single pipeline
                     "status" — see application/
                     BitcoinAnchorConfirmationCoordinator.js's own header.
                     Every click appends its own entry to the Confirmation
                     History disclosure below via application/
                     BitcoinAnchorConfirmationObservationHistory.js (0.8.56,
                     unchanged) — a later CONFIRMED entry never rewrites or
                     discards an earlier NOT_CONFIRMED one. -->
                <div v-if="bitcoinAnchorBroadcastView().state === BitcoinAnchorBroadcastState.BROADCASTED" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Confirmation</span>
                    <p class="form-hint form-hint--neutral">
                        The network accepted this transaction for broadcast. Whether it has since been mined
                        into a block is a separate, later observation.
                    </p>

                    <button type="button" class="peer-action-btn"
                        :disabled="bitcoinAnchorBroadcastConfirmationObserving"
                        @click="observeBitcoinAnchorBroadcastConfirmation">
                        {{ bitcoinAnchorBroadcastConfirmationObserving ? 'Observing…' : (bitcoinAnchorBroadcastConfirmationView() ? 'Observe Confirmation Again' : 'Observe Confirmation') }}
                    </button>
                    <p v-if="bitcoinAnchorBroadcastConfirmationError" class="form-hint form-hint--neutral">
                        {{ bitcoinAnchorBroadcastConfirmationError }}
                    </p>

                    <template v-if="bitcoinAnchorBroadcastConfirmationView()">
                        <span class="peer-badge" :class="bitcoinAnchorBroadcastConfirmationBadgeClass()">
                            {{ bitcoinAnchorBroadcastConfirmationView().stateLabel }}
                        </span>
                        <dl v-if="bitcoinAnchorBroadcastConfirmationView().blockHeight !== null" class="evidence-fields">
                            <div class="evidence-field"><dt>Block height</dt><dd>{{ bitcoinAnchorBroadcastConfirmationView().blockHeight }}</dd></div>
                            <div class="evidence-field"><dt>Block hash</dt><dd>{{ bitcoinAnchorBroadcastConfirmationView().blockHash }}</dd></div>
                            <div class="evidence-field"><dt>Confirmations</dt><dd>{{ bitcoinAnchorBroadcastConfirmationView().confirmationCount }}</dd></div>
                        </dl>
                        <p v-if="bitcoinAnchorBroadcastConfirmationView().reason" class="form-hint form-hint--neutral">
                            {{ bitcoinAnchorBroadcastConfirmationView().reason }}
                        </p>

                        <button v-if="bitcoinAnchorBroadcastConfirmationHistoryView().count > 0" type="button" class="peer-action-btn"
                            @click="toggleBitcoinAnchorBroadcastConfirmationHistory">
                            {{ bitcoinAnchorBroadcastConfirmationHistoryExpanded ? 'Hide Confirmation History' : 'Show Confirmation History' }}
                        </button>
                    </template>

                    <!-- The full chronological narration of every past
                         "Observe Confirmation" click for THIS broadcast
                         transaction — a DIFFERENT history from
                         bitcoinAnchorConfirmationHistoryView(entry, anchorView)
                         further below, which narrates "Reconcile" clicks
                         against a persisted PublicationAnchor instead. -->
                    <div v-if="bitcoinAnchorBroadcastConfirmationHistoryExpanded">
                        <ul class="replica-knowledge-claim-list">
                            <li v-for="(item, index) in bitcoinAnchorBroadcastConfirmationHistoryView().entries" :key="index" class="replica-knowledge-claim">
                                <button type="button" class="peer-action-btn"
                                    @click="toggleBitcoinAnchorBroadcastConfirmationHistoryEntry(index)">
                                    {{ formatWhen(item.observedAt) }} — {{ item.stateShortLabel }}
                                </button>
                                <dl v-if="isBitcoinAnchorBroadcastConfirmationHistoryEntryExpanded(index)" class="evidence-fields">
                                    <div class="evidence-field"><dt>State</dt><dd>{{ item.stateLabel }}</dd></div>
                                    <div class="evidence-field"><dt>Transaction ID</dt><dd>{{ item.txid }}</dd></div>
                                    <div v-if="item.blockHash" class="evidence-field"><dt>Block hash</dt><dd>{{ item.blockHash }}</dd></div>
                                    <div v-if="item.blockHeight !== null" class="evidence-field"><dt>Block height</dt><dd>{{ item.blockHeight }}</dd></div>
                                    <div v-if="item.confirmationCount !== null" class="evidence-field"><dt>Confirmations</dt><dd>{{ item.confirmationCount }}</dd></div>
                                    <div v-if="item.reason" class="evidence-field"><dt>Reason</dt><dd>{{ item.reason }}</dd></div>
                                </dl>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>

            <!-- 0.8.75 — Durable Publication Observation Records.
                 Page-level, deliberately unrelated to any one
                 publication's own card below — this section reads
                 application/PublicationObservationArchive.js's own
                 durable, cross-domain archive, persisted via storage/
                 LocalStoragePublicationObservationArchive.js. See that
                 file's own header, and docs/Principles.md, "Persistence
                 Restores Historical Facts; It Never Resurrects Invented
                 Ones (0.8.75)." Nothing here is fetched, verified, or
                 reconciled — opening or closing this disclosure performs
                 ZERO network operations, and "Clear Archive" is the ONLY
                 action on this page that discards a persisted fact;
                 publishing, verifying, broadcasting, or observing a
                 confirmation elsewhere on this page only ever ADDS to
                 this archive, automatically, never removes from it. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">Observation Archive</span>
                    <span class="peer-badge peer-badge--pending">Persisted locally</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    Publication and observation facts, kept durable across a page reload. Never a
                    wallet connection, a signing capability, a private key, or any other
                    credential — this archive never stores one, and reloading this page never
                    restores one.
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>Publications</dt><dd>{{ publicationObservationArchiveView().publicationCount }}</dd></div>
                    <div class="evidence-field"><dt>Observations</dt><dd>{{ publicationObservationArchiveView().observationCount }}</dd></div>
                </dl>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="togglePublicationObservationArchive">
                        {{ publicationObservationArchiveExpanded ? 'Hide Archive' : 'Show Archive' }}
                    </button>
                    <button type="button" class="action-btn action-btn--danger"
                            :disabled="publicationObservationArchiveView().publicationCount === 0 && publicationObservationArchiveView().observationCount === 0"
                            @click="clearPublicationObservationArchive">
                        Clear Archive
                    </button>
                </div>
                <div v-if="publicationObservationArchiveExpanded" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Archived Observation Timeline</span>
                    <p v-if="publicationObservationArchiveView().entryCount === 0" class="form-hint form-hint--neutral">
                        Nothing archived yet. Publishing to IPFS, verifying content, broadcasting a
                        Bitcoin transaction, or observing a confirmation on this page adds to this
                        archive automatically.
                    </p>
                    <ul v-else class="replica-knowledge-claim-list">
                        <li v-for="(item, archiveIndex) in publicationObservationArchiveView().entries"
                            :key="archiveIndex" class="replica-knowledge-claim">
                            <span class="peer-badge" :class="crossDomainPublicationObservationTimelineEntryBadgeClass(item)">
                                {{ formatWhen(item.observedAt) }} — {{ crossDomainPublicationObservationTimelineEntryDomainLabel(item) }} —
                                {{ item.kind === PublicationObservationTimelineEntryKind.IPFS_PUBLICATION ? 'Published' : item.stateLabel }}
                            </span>
                            <p class="form-hint form-hint--neutral">
                                {{ item.label }}
                                <template v-if="item.domain === PublicationObservationTimelineDomain.IPFS"> — {{ item.locator }}</template>
                                <template v-else-if="item.txid"> — txid {{ item.txid }}</template>
                            </p>
                            <p v-if="item.kind === PublicationObservationTimelineEntryKind.BITCOIN_CONFIRMATION && item.blockHeight != null" class="form-hint form-hint--neutral">
                                Block height {{ item.blockHeight }}
                            </p>
                            <p v-if="item.reason" class="form-hint form-hint--neutral">{{ item.reason }}</p>
                        </li>
                    </ul>
                </div>
            </div>

            <!-- 0.8.79 — Durable Bitcoin Anchor Evidence Restoration &
                 Historical Inspection. Page-level, deliberately unrelated
                 to any one publication's own card below, mirroring the
                 "Observation Archive" card immediately above it exactly.
                 Reads the SAME durable, persisted archive that card
                 already reads — never a second archive, never a second
                 persisted representation of derived evidence. See
                 application/BitcoinAnchorObservationArchiveView.js's and
                 application/BitcoinAnchorDurableEvidenceView.js's own
                 headers, and docs/Principles.md, "Derived Evidence Is
                 Reconstructed From Durable Facts; It Is Not Stored As A
                 Second History (0.8.79)." Expanding an anchor below
                 recomputes its chain-placement comparisons and consistency
                 findings fresh from durable confirmation observations —
                 nothing here is fetched, verified, or reconciled, and
                 opening or closing this disclosure performs ZERO network
                 operations. Combined Evidence, further below, is still
                 only a correlation of independently recorded facts, never
                 a verdict. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">Historical Bitcoin Anchor Evidence</span>
                    <span class="peer-badge peer-badge--pending">Persisted locally</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    Every Bitcoin anchor this archive holds a durable fact for, organized by its own
                    explicit anchorId. Counts below describe how much this replica has recorded for
                    each anchor — never how complete, reliable, or trustworthy that anchor's own
                    evidence is.
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>Anchors</dt><dd>{{ historicalBitcoinAnchorArchiveView().anchorCount }}</dd></div>
                </dl>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="toggleHistoricalBitcoinAnchors">
                        {{ historicalBitcoinAnchorsExpanded ? 'Hide Historical Anchors' : 'Show Historical Anchors' }}
                    </button>
                </div>
                <div v-if="historicalBitcoinAnchorsExpanded" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Archived Bitcoin Anchors</span>
                    <p v-if="historicalBitcoinAnchorArchiveView().anchorCount === 0" class="form-hint form-hint--neutral">
                        No Bitcoin anchor facts archived yet. Broadcasting a Bitcoin transaction,
                        observing a confirmation, or recording a content-proof observation elsewhere
                        on this page adds to this archive automatically.
                    </p>
                    <ul v-else class="replica-knowledge-claim-list">
                        <li v-for="anchorRow in historicalBitcoinAnchorArchiveView().anchors" :key="anchorRow.anchorId" class="replica-knowledge-claim">
                            <button type="button" class="peer-action-btn" @click="toggleHistoricalBitcoinAnchorEntry(anchorRow.anchorId)">
                                {{ anchorRow.anchorId }}
                            </button>
                            <p class="form-hint form-hint--neutral">
                                Broadcast observations: {{ anchorRow.broadcastObservationCount }} ·
                                Confirmation observations: {{ anchorRow.confirmationObservationCount }} ·
                                Content-proof observations: {{ anchorRow.contentProofObservationCount }} ·
                                Chain-placement comparisons: {{ anchorRow.chainPlacementComparisonCount }} ·
                                Consistency findings: {{ anchorRow.consistencyFindingCount }}
                            </p>

                            <div v-if="isHistoricalBitcoinAnchorEntryExpanded(anchorRow.anchorId) && historicalBitcoinAnchorEvidenceView(anchorRow.anchorId)" class="evidence-list">
                                <div class="evidence-list">
                                    <span class="evidence-convergence-title">Broadcast History</span>
                                    <p v-if="historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).broadcastObservations.count === 0" class="form-hint form-hint--neutral">No broadcast observations recorded.</p>
                                    <ul v-else class="replica-knowledge-claim-list">
                                        <li v-for="item in historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).broadcastObservations.observations" :key="item.index" class="replica-knowledge-claim">
                                            {{ item.stateLabel }} — {{ item.broadcastedAt ? formatWhen(item.broadcastedAt) : 'no timestamp recorded' }}
                                            <template v-if="item.txid"> — txid {{ item.txid }}</template>
                                        </li>
                                    </ul>
                                </div>

                                <div class="evidence-list">
                                    <span class="evidence-convergence-title">Confirmation History</span>
                                    <p v-if="historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).confirmationObservations.count === 0" class="form-hint form-hint--neutral">No confirmation observations recorded.</p>
                                    <ul v-else class="replica-knowledge-claim-list">
                                        <li v-for="item in historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).confirmationObservations.observations" :key="item.index" class="replica-knowledge-claim">
                                            Confirmation observation #{{ item.index }} — {{ formatWhen(item.observedAt) }} — {{ item.stateLabel }}
                                            <template v-if="item.blockHeight !== null && item.blockHeight !== undefined"> — height {{ item.blockHeight }}</template>
                                        </li>
                                    </ul>
                                </div>

                                <div class="evidence-list">
                                    <span class="evidence-convergence-title">Content-Proof History</span>
                                    <p v-if="historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).contentProofObservations.count === 0" class="form-hint form-hint--neutral">No content-proof observations recorded.</p>
                                    <ul v-else class="replica-knowledge-claim-list">
                                        <li v-for="item in historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).contentProofObservations.observations" :key="item.index" class="replica-knowledge-claim">
                                            Content-proof observation #{{ item.index }} — {{ formatWhen(item.observedAt) }} — {{ item.stateLabel }}
                                        </li>
                                    </ul>
                                </div>

                                <div class="evidence-list">
                                    <span class="evidence-convergence-title">Chain Placement Comparisons</span>
                                    <p v-if="historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).chainPlacementObservations.count === 0" class="form-hint form-hint--neutral">Not enough confirmed observations exist yet to compare block placement.</p>
                                    <ul v-else class="replica-knowledge-claim-list">
                                        <li v-for="(comparison, index) in historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).chainPlacementObservations.comparisons" :key="index" class="replica-knowledge-claim">
                                            {{ comparison.outcomeLabel }}
                                        </li>
                                    </ul>
                                </div>

                                <div class="evidence-list">
                                    <span class="evidence-convergence-title">Observation Consistency</span>
                                    <p v-if="historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).consistencyFindings.count === 0" class="form-hint form-hint--neutral">Not enough confirmed observations exist yet to analyze consistency.</p>
                                    <ul v-else class="replica-knowledge-claim-list">
                                        <li v-for="(finding, index) in historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).consistencyFindings.findings" :key="index" class="replica-knowledge-claim">
                                            {{ finding.stateLabel }}
                                        </li>
                                    </ul>
                                </div>

                                <div class="evidence-list">
                                    <span class="evidence-convergence-title">Combined Evidence</span>
                                    <p class="form-hint form-hint--neutral">
                                        Broadcast: {{ historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).broadcastObservations.count }} ·
                                        Confirmation: {{ historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).confirmationObservations.count }} ·
                                        Content-proof: {{ historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).contentProofObservations.count }} ·
                                        Chain-placement: {{ historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).chainPlacementObservations.count }} ·
                                        Consistency: {{ historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).consistencyFindings.count }}
                                    </p>
                                    <p class="form-hint form-hint--neutral">
                                        This is a correlation of independently recorded facts by explicit anchorId — not a verdict.
                                    </p>
                                </div>
                            </div>
                        </li>
                    </ul>
                </div>
            </div>

            <!-- 0.8.80 — Explicit Bitcoin Anchor Publication Lifecycle
                 Record. A DIFFERENT list than "Historical Bitcoin Anchor
                 Evidence" above: this one holds only the anchors this
                 replica minted an explicit PUBLICATION IDENTITY for —
                 `{ anchorId, contentHash, txid, network, createdAt }` —
                 never a confirmed/valid/trusted/status field of any kind.
                 "Inspect Observations" reconstructs the SAME 0.8.79
                 evidence bundle the card above already shows for this
                 exact anchorId — evidence stays subordinate to identity,
                 never becoming a second version of it. Performs ZERO
                 network operations. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">Bitcoin Anchor Publications</span>
                    <span class="peer-badge peer-badge--pending">Persisted locally</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    Every Bitcoin anchor publication attempt this replica has minted a durable identity
                    for — created the moment a transaction is finalized, independent of whether its
                    broadcast later succeeds. A publication record names WHAT was published, AS WHICH
                    transaction, and on WHICH network — never whether it was later confirmed.
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>Publications</dt><dd>{{ bitcoinAnchorPublicationRecordHistoryView().count }}</dd></div>
                </dl>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="toggleBitcoinAnchorPublications">
                        {{ bitcoinAnchorPublicationsExpanded ? 'Hide Publications' : 'Show Publications' }}
                    </button>
                </div>
                <div v-if="bitcoinAnchorPublicationsExpanded" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Publication Identities</span>
                    <p v-if="bitcoinAnchorPublicationRecordHistoryView().count === 0" class="form-hint form-hint--neutral">
                        No Bitcoin anchor publication identity minted yet. Finalizing a Bitcoin anchor
                        transaction elsewhere on this page creates one automatically.
                    </p>
                    <ul v-else class="replica-knowledge-claim-list">
                        <li v-for="publicationRow in bitcoinAnchorPublicationRecordHistoryView().records" :key="publicationRow.anchorId" class="replica-knowledge-claim">
                            <button type="button" class="peer-action-btn" @click="toggleBitcoinAnchorPublicationInspection(publicationRow.anchorId)">
                                {{ publicationRow.anchorId }}
                            </button>
                            <p class="form-hint form-hint--neutral">
                                Content hash: {{ publicationRow.contentHash }} ·
                                Txid: {{ publicationRow.txid }} ·
                                Network: {{ publicationRow.network }} ·
                                Created: {{ formatWhen(publicationRow.createdAt) }}
                            </p>

                            <div v-if="isBitcoinAnchorPublicationInspectionExpanded(publicationRow.anchorId) && bitcoinAnchorPublicationInspectionView(publicationRow.anchorId)" class="evidence-list">
                                <span class="evidence-convergence-title">Inspect Observations</span>
                                <p class="form-hint form-hint--neutral">
                                    Broadcast: {{ bitcoinAnchorPublicationInspectionView(publicationRow.anchorId).evidence.broadcastObservations.count }} ·
                                    Confirmation: {{ bitcoinAnchorPublicationInspectionView(publicationRow.anchorId).evidence.confirmationObservations.count }} ·
                                    Content-proof: {{ bitcoinAnchorPublicationInspectionView(publicationRow.anchorId).evidence.contentProofObservations.count }} ·
                                    Chain-placement: {{ bitcoinAnchorPublicationInspectionView(publicationRow.anchorId).evidence.chainPlacementObservations.count }} ·
                                    Consistency: {{ bitcoinAnchorPublicationInspectionView(publicationRow.anchorId).evidence.consistencyFindings.count }}
                                </p>
                                <p class="form-hint form-hint--neutral">
                                    This is a correlation of independently recorded facts by explicit anchorId — not a
                                    verdict. See "Historical Bitcoin Anchor Evidence" above for the full, per-observation
                                    breakdown of this same anchorId.
                                </p>
                            </div>

                            <!-- 0.8.81 — Bitcoin Anchor Publication Lifecycle
                                 Timeline. A third, different projection over
                                 the SAME durable facts "Inspect Observations"
                                 above already shows grouped by category —
                                 this one interleaves them into one
                                 chronological read, scoped to this exact
                                 anchorId alone. Collapsed by default. Missing
                                 stages (no broadcast, no content-proof, and
                                 so on) simply produce no entry — never a
                                 fabricated "missing" or "failed" row. -->
                            <button type="button" class="peer-action-btn" @click="toggleBitcoinAnchorPublicationLifecycle(publicationRow.anchorId)">
                                {{ isBitcoinAnchorPublicationLifecycleExpanded(publicationRow.anchorId) ? 'Hide Publication Lifecycle' : 'Show Publication Lifecycle' }}
                            </button>
                            <div v-if="isBitcoinAnchorPublicationLifecycleExpanded(publicationRow.anchorId)" class="evidence-list">
                                <span class="evidence-convergence-title">Publication Lifecycle</span>
                                <p v-if="!bitcoinAnchorPublicationLifecycleTimelineView(publicationRow.anchorId)" class="form-hint form-hint--neutral">
                                    No lifecycle timeline available for this anchorId.
                                </p>
                                <ul v-else class="replica-knowledge-claim-list">
                                    <li v-for="(item, timelineIndex) in bitcoinAnchorPublicationLifecycleTimelineView(publicationRow.anchorId).entries"
                                        :key="timelineIndex" class="replica-knowledge-claim">
                                        <span class="peer-badge peer-badge--pending">
                                            {{ formatWhen(item.observedAt) }} — {{ item.label }}
                                        </span>
                                        <p class="form-hint form-hint--neutral">{{ bitcoinAnchorPublicationLifecycleEntryDetail(item) }}</p>
                                        <p v-if="item.reason" class="form-hint form-hint--neutral">{{ item.reason }}</p>
                                    </li>
                                </ul>
                            </div>
                        </li>
                    </ul>
                </div>
            </div>

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

                        <!-- 0.8.43 — Unified Snapshot Acquisition Outcome & Possession
                             UX. A composed SUMMARY, sitting above every specialized
                             disclosure this card already offers below it — never a
                             replacement for any of them. Current possession is always
                             read from localSnapshotAvailabilityView(entry) (0.8.33)
                             unchanged; acquisition history is always a plain COUNT
                             here, never the full per-attempt narration "Show
                             Acquisition History" immediately below already shows
                             (0.8.44 — Explicit Snapshot Acquisition Attempt
                             Inspection). Visible only once at least
                             one check or one attempt has ever happened THIS session —
                             an untouched entry shows nothing here, rather than "0
                             attempts." See application/PublicationSnapshotAcquisitionView.js's
                             own header and docs/Principles.md, "Current Snapshot
                             Possession Is Independent Of How The Snapshot Was Acquired
                             (0.8.43)" and "Acquisition History Explains Past Attempts;
                             It Does Not Determine Present Possession (0.8.43)." -->
                        <div v-if="localSnapshotAvailabilityView(entry).checked || snapshotAcquisitionView(entry).acquisition.attemptCount > 0" class="evidence-list">
                            <span class="evidence-convergence-title">Snapshot Acquisition</span>
                            <p class="form-hint form-hint--neutral">
                                Current possession:
                                {{ localSnapshotAvailabilityView(entry).checked ? localSnapshotAvailabilityView(entry).message : 'Not yet checked.' }}
                            </p>
                            <p v-if="snapshotAcquisitionOutcomeCountsSentence(entry)" class="form-hint form-hint--neutral">
                                Acquisition history: {{ snapshotAcquisitionOutcomeCountsSentence(entry) }}
                            </p>
                            <p v-if="materializationSourceCountsSentence(entry)" class="form-hint form-hint--neutral">
                                {{ materializationSourceCountsSentence(entry) }}
                            </p>
                            <p v-if="snapshotAcquisitionNeedsSourceHint(entry)" class="form-hint form-hint--neutral">
                                This replica does not currently possess a valid snapshot. Choose a source below —
                                "Import Snapshot," a placement's own "Materialize Snapshot," or a peer's own "Get
                                Snapshot from Peer" — to try again.
                            </p>

                            <!-- 0.8.44 — Explicit Snapshot Acquisition Attempt
                                 Inspection. The ORDERED narration of EVERY explicit
                                 "Import Snapshot"/"Materialize Snapshot"/"Get Snapshot
                                 from Peer" attempt this entry has seen THIS SESSION
                                 that actually reached application/
                                 StoreSnapshotContentUseCase.js — including a rejected
                                 HASH_MISMATCH attempt, never only the successful ones
                                 "Source: …" below already names. Nested directly under
                                 "Snapshot Acquisition" above: the summary immediately
                                 above already reports a plain COUNT ("4 attempts · 2
                                 stored · 1 already available · 1 hash mismatch"); this
                                 disclosure is the SAME history, inspectable one attempt
                                 at a time — never a replacement for that summary, and
                                 never a replacement for "Current possession" above it
                                 (see docs/Principles.md, "Current Snapshot Possession
                                 Is Independent Of How The Snapshot Was Acquired
                                 (0.8.43)"). Each row shows a compact "source → outcome"
                                 summary; expanding a single row reveals the two facts
                                 the compact row leaves out — Outcome (the full
                                 sentence), Publication, and Content hash — never a new
                                 fact this attempt didn't already carry. Deliberately a
                                 plain narration, never a ranking: no source is called
                                 better, more reliable, or more trustworthy than another
                                 — see application/
                                 SnapshotMaterializationHistoryDetailView.js's own
                                 header and docs/Principles.md, "Materialization History
                                 Describes Byte Acquisition, Not Source Trust
                                 (0.8.38)." -->
                            <div v-if="materializationHistoryDetailsView(entry).count > 0" class="evidence-list">
                                <button class="action-btn action-btn--secondary" @click="toggleMaterializationHistory(entry)">
                                    {{ entry.materializationHistoryExpanded ? 'Hide Acquisition History' : 'Show Acquisition History' }}
                                </button>
                                <div v-if="entry.materializationHistoryExpanded">
                                    <ul class="replica-knowledge-claim-list">
                                        <li v-for="(item, index) in materializationHistoryDetailsView(entry).entries" :key="index" class="replica-knowledge-claim">
                                            <button class="action-btn action-btn--secondary" @click="toggleMaterializationHistoryEntry(entry, index)">
                                                {{ formatWhen(item.observedAt) }} — {{ item.sourceLabel }} → {{ item.outcomeShortLabel }}
                                            </button>
                                            <dl v-if="isMaterializationHistoryEntryExpanded(entry, index)" class="evidence-fields">
                                                <div class="evidence-field">
                                                    <dt>Outcome</dt>
                                                    <dd>{{ item.outcomeLabel }}</dd>
                                                </div>
                                                <div class="evidence-field">
                                                    <dt>Publication</dt>
                                                    <dd>{{ item.publicationId }}</dd>
                                                </div>
                                                <div class="evidence-field">
                                                    <dt>Content hash</dt>
                                                    <dd>{{ item.contentHash }}</dd>
                                                </div>
                                            </dl>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        <!-- 0.8.39 — Local Snapshot Possession & Replica Content
                             Knowledge. The tiny, deliberately non-"complete" composed
                             fact application/PublicationReplicaContentKnowledgeView.js
                             exists to report — whether this replica knows the
                             publication's own envelope, and whether it currently
                             possesses valid bytes for it. Carries no anchor/placement
                             counts of its own; those stay exactly where the existing
                             "Decentralization" card below already shows them, on its
                             own independently-gated card — this line and that card are
                             two separate, un-merged facts, shown side by side, never
                             combined into one score. Visible only once a local
                             availability check has ever completed for this entry, this
                             browsing session (mirrors localSnapshotAvailabilityView
                             (entry).checked exactly) — before that, whether bytes are
                             currently possessed is simply not yet observed, and this
                             line stays silent rather than guessing. -->
                        <p v-if="localSnapshotContentAvailabilityUseCase && localSnapshotAvailabilityView(entry).checked" class="form-hint form-hint--neutral">
                            Publication: {{ replicaContentKnowledgeView(entry).hasPublication ? 'known locally' : 'not known locally' }}
                            · Snapshot: {{ replicaContentKnowledgeView(entry).hasValidSnapshot ? 'available' : 'not available' }}
                        </p>

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

                        <!-- 0.8.40 — Snapshot Possession Observation Exchange. A
                             DELIBERATELY SEPARATE section from "Get Snapshot from
                             Peer" immediately above, with its own peer dropdown and
                             its own selected peer — asking whether a peer has bytes,
                             and asking that same peer FOR bytes, are two independent
                             actions a person takes separately, never bundled into
                             one click. Clicking "Check with Peer" never transfers a
                             byte, never creates a placement, and never feeds
                             "Materialization History" below — it produces exactly
                             one ephemeral application/
                             SnapshotPeerPossessionObservation.js record, replaced
                             (never accumulated) by the next check. The result wording
                             is deliberately a REPORT ("Peer reports snapshot
                             available/not available"), never a verdict about the
                             peer's trustworthiness — see application/
                             SnapshotPeerPossessionView.js's own header and
                             docs/Principles.md, "Peer Possession Responses Are
                             Observations, Not Placement Claims (0.8.40)." -->
                        <div v-if="snapshotPeerPossessionCoordinator" class="evidence-list">
                            <span class="evidence-convergence-title">Peer Snapshot Possession</span>
                            <p v-if="retrievalPeers.length === 0" class="form-hint form-hint--neutral">
                                No authenticated peer is connected right now — connect to one first from
                                <router-link to="/peers">Peers</router-link>.
                            </p>
                            <template v-else>
                                <label class="form-field">
                                    <span class="form-label">Peer</span>
                                    <select v-model="entry.peerPossessionSelectedPeerId" class="form-input">
                                        <option value="" disabled>Choose an authenticated peer…</option>
                                        <option v-for="peer in retrievalPeers" :key="peer.connectionId" :value="peer.connectionId">
                                            {{ peer.alias || (peer.remoteIdentity ? shortId(peer.remoteIdentity.identityId) : 'Unknown peer') }}
                                        </option>
                                    </select>
                                </label>
                                <div class="evidence-discovery-header">
                                    <button class="action-btn action-btn--secondary"
                                            :disabled="peerPossessionView(entry).checking || !entry.peerPossessionSelectedPeerId"
                                            @click="checkSnapshotPossessionWithPeer(entry)">
                                        {{ peerPossessionButtonLabel(entry) }}
                                    </button>
                                    <span v-if="peerPossessionView(entry).label" class="peer-badge" :class="peerPossessionBadgeClass(entry)">
                                        {{ peerPossessionView(entry).label }}
                                    </span>
                                </div>
                            </template>
                            <p v-if="peerPossessionView(entry).message" class="form-hint form-hint--neutral">
                                {{ peerPossessionView(entry).message }}
                            </p>
                            <p v-if="peerPossessionView(entry).observedAt" class="form-hint form-hint--neutral">
                                Observed: {{ formatWhen(peerPossessionView(entry).observedAt) }}
                            </p>
                        </div>

                        <!-- 0.8.41 — Peer Snapshot Possession Comparison &
                             Observation History. A DELIBERATELY SEPARATE
                             section from "Peer Snapshot Possession" immediately
                             above, with its own peer selection (a checked-box
                             SET, not a single dropdown choice) and its own
                             ephemeral history — asking several peers at once
                             and inspecting the answers side-by-side is a
                             distinct action from checking one. "Check Selected
                             Peers" never ranks, prefers, or recommends a peer;
                             it only reports what each one said, and how many
                             said what. See application/
                             SnapshotPeerPossessionComparisonView.js's own
                             header and docs/Principles.md, "Peer Possession
                             Observations Describe What Peers Report; They Do
                             Not Become Placement Claims (0.8.41)." -->
                        <div v-if="snapshotPeerPossessionCoordinator" class="evidence-list">
                            <span class="evidence-convergence-title">Peer Snapshot Possession Comparison</span>
                            <p v-if="retrievalPeers.length === 0" class="form-hint form-hint--neutral">
                                No authenticated peer is connected right now — connect to one first from
                                <router-link to="/peers">Peers</router-link>.
                            </p>
                            <template v-else>
                                <ul class="replica-knowledge-claim-list">
                                    <li v-for="peer in retrievalPeers" :key="peer.connectionId" class="replica-knowledge-claim">
                                        <label>
                                            <input type="checkbox"
                                                   :checked="entry.peerPossessionCompareSelectedPeerIds.includes(peer.connectionId)"
                                                   @change="togglePeerPossessionCompareSelection(entry, peer.connectionId)">
                                            {{ peer.alias || (peer.remoteIdentity ? shortId(peer.remoteIdentity.identityId) : 'Unknown peer') }}
                                        </label>
                                    </li>
                                </ul>
                                <div class="evidence-discovery-header">
                                    <button class="action-btn action-btn--secondary"
                                            :disabled="entry.peerPossessionComparisonChecking || entry.peerPossessionCompareSelectedPeerIds.length === 0"
                                            @click="checkSnapshotPossessionWithSelectedPeers(entry)">
                                        {{ entry.peerPossessionComparisonChecking ? 'Checking…' : (peerPossessionObservationHistoryView(entry).count > 0 ? 'Check Selected Peers Again' : 'Check Selected Peers') }}
                                    </button>
                                </div>
                            </template>

                            <div v-if="peerPossessionComparisonView(entry).peers.length > 0">
                                <p class="form-hint form-hint--neutral">
                                    {{ peerPossessionComparisonView(entry).availableCount }} available ·
                                    {{ peerPossessionComparisonView(entry).notAvailableCount }} not available ·
                                    {{ peerPossessionComparisonView(entry).unavailableCount }} could not determine
                                </p>
                                <ul class="replica-knowledge-claim-list">
                                    <li v-for="peerRow in peerPossessionComparisonView(entry).peers" :key="peerRow.peerId" class="replica-knowledge-claim">
                                        <dl class="evidence-fields">
                                            <div class="evidence-field">
                                                <dt>Peer</dt>
                                                <dd>{{ peerPossessionRowLabel(peerRow.peerId) }}</dd>
                                            </div>
                                            <div class="evidence-field">
                                                <dt>Reports</dt>
                                                <dd>
                                                    <span class="peer-badge" :class="peerPossessionComparisonRowBadgeClass(peerRow)">
                                                        {{ peerPossessionComparisonRowLabel(peerRow) }}
                                                    </span>
                                                </dd>
                                            </div>
                                            <div class="evidence-field">
                                                <dt>Observed</dt>
                                                <dd>{{ formatWhen(peerRow.observedAt) }}</dd>
                                            </div>
                                        </dl>
                                        <!-- 0.8.42 — Explicit Snapshot Source Selection &
                                             Materialization UX. An explicit action, shown
                                             ONLY for a row that reported possession — never
                                             a recommendation, never rendered for Bob's own
                                             "Not available" row. Clicking it never changes
                                             the "Reports"/"Observed" fields above: those
                                             describe what this peer SAID at one moment; this
                                             button describes a brand new, separately-timed
                                             attempt to actually obtain the bytes, which may
                                             honestly fail even though the row still reads
                                             "Available." -->
                                        <template v-if="snapshotMaterializationSelectionCoordinator && peerRow.possessed">
                                            <button class="action-btn action-btn--secondary"
                                                    :disabled="comparisonPeerMaterializationView(entry, peerRow.peerId).requesting"
                                                    @click="materializeFromComparisonPeer(entry, peerRow.peerId)">
                                                {{ comparisonPeerMaterializationButtonLabel(entry, peerRow) }}
                                            </button>
                                            <span v-if="comparisonPeerMaterializationView(entry, peerRow.peerId).label"
                                                  class="peer-badge" :class="comparisonPeerMaterializationBadgeClass(entry, peerRow.peerId)">
                                                {{ comparisonPeerMaterializationView(entry, peerRow.peerId).label }}
                                            </span>
                                            <p v-if="comparisonPeerMaterializationView(entry, peerRow.peerId).message" class="form-hint form-hint--neutral">
                                                {{ comparisonPeerMaterializationView(entry, peerRow.peerId).message }}
                                            </p>
                                        </template>
                                    </li>
                                </ul>
                            </div>

                            <!-- 0.8.45 — Explicit Peer Possession Observation
                                 Inspection. The ORDERED narration of EVERY
                                 recorded "Check Selected Peers" observation
                                 this entry has collected THIS SESSION —
                                 including repeat checks of the same peer,
                                 never only the latest-per-peer rows the
                                 comparison above already shows. Nested
                                 directly under the comparison, mirroring
                                 application/
                                 SnapshotMaterializationHistoryDetailView.js's
                                 (0.8.44) own "Show/Hide Acquisition
                                 History" disclosure exactly, one domain
                                 over: each row shows a compact
                                 "peer → reported" summary; expanding a
                                 single row reveals the two facts the
                                 compact row leaves out — the full-sentence
                                 report, Publication, and Content hash —
                                 never a new fact this observation didn't
                                 already carry, and never a rewrite of an
                                 earlier observation even once the peer's
                                 own current possession has since changed
                                 (see application/
                                 SnapshotPeerPossessionObservation.js's own
                                 header). Deliberately a plain narration,
                                 never a ranking, and never an availability
                                 percentage: no peer is called more
                                 reliable, more trustworthy, or "best" than
                                 another — see application/
                                 SnapshotPeerPossessionObservationDetailView.js's
                                 own header and docs/Principles.md, "Peer
                                 Possession Observations Describe What Peers
                                 Report; They Do Not Become Placement Claims
                                 (0.8.41)." -->
                            <div v-if="peerPossessionObservationDetailsView(entry).count > 0">
                                <button class="action-btn action-btn--secondary" @click="togglePeerPossessionComparisonHistory(entry)">
                                    {{ entry.peerPossessionComparisonHistoryExpanded ? 'Hide Observation History' : 'Show Observation History' }}
                                </button>
                                <div v-if="entry.peerPossessionComparisonHistoryExpanded">
                                    <ul class="replica-knowledge-claim-list">
                                        <li v-for="(item, index) in peerPossessionObservationDetailsView(entry).entries" :key="index" class="replica-knowledge-claim">
                                            <button class="action-btn action-btn--secondary" @click="togglePeerPossessionObservationHistoryEntry(entry, index)">
                                                {{ formatWhen(item.observedAt) }} — {{ peerPossessionRowLabel(item.peerId) }} → {{ item.stateShortLabel }}
                                            </button>
                                            <dl v-if="isPeerPossessionObservationHistoryEntryExpanded(entry, index)" class="evidence-fields">
                                                <div class="evidence-field">
                                                    <dt>Reported</dt>
                                                    <dd>{{ item.stateLabel }}</dd>
                                                </div>
                                                <div class="evidence-field">
                                                    <dt>Publication</dt>
                                                    <dd>{{ item.publicationId }}</dd>
                                                </div>
                                                <div class="evidence-field">
                                                    <dt>Content hash</dt>
                                                    <dd>{{ item.contentHash }}</dd>
                                                </div>
                                            </dl>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 0.8.46 — Unified Snapshot State Inspection. A pure MAP over
                         four facts this page already computes for their own
                         independent disclosures — "Current possession" (0.8.39),
                         "Snapshot Acquisition" (0.8.43/0.8.44, immediately above),
                         "Snapshot Placements" (0.8.20/0.8.23, further below), and
                         "Peer Snapshot Possession Comparison" (0.8.41, immediately
                         above) — composed side by side by application/
                         SnapshotStateInspectionView.js#describeSnapshotStateInspection(),
                         never replacing any one of them and never resolving their
                         combination into a single verdict. It is entirely ordinary
                         for this card to show local possession AVAILABLE, a
                         placement relationship of Conflict, and a mix of "available"/
                         "not available" peer reports all at once — none of the four
                         dimensions is corrected, weighted, or read in light of the
                         other three. Each sub-section is hidden on its own, exactly
                         like its own full disclosure elsewhere on this card, until
                         that dimension has ever actually been observed THIS session
                         — never shown as a false "0" before that. See application/
                         SnapshotStateInspectionView.js's own header and
                         docs/Principles.md, "A Snapshot's Independently Observed
                         Facts Are Exposed Side By Side, Never Collapsed Into One
                         Verdict (0.8.46)." -->
                    <div v-if="localSnapshotAvailabilityView(entry).checked || snapshotAcquisitionOutcomeCountsSentence(entry) || entry.placementConvergenceView || peerPossessionComparisonView(entry).peers.length > 0"
                         class="decentralization-summary">
                        <span class="evidence-convergence-title">Snapshot State</span>

                        <div class="evidence-list">
                            <span class="evidence-convergence-title">Content</span>
                            <dl class="evidence-fields">
                                <div class="evidence-field">
                                    <dt>Publication</dt>
                                    <dd>{{ entry.publication.id }}</dd>
                                </div>
                                <div class="evidence-field">
                                    <dt>Content hash</dt>
                                    <dd>{{ entry.publication.contentReference.hash }}</dd>
                                </div>
                            </dl>
                        </div>

                        <div class="evidence-list">
                            <span class="evidence-convergence-title">Local possession</span>
                            <p class="form-hint form-hint--neutral">
                                {{ localSnapshotAvailabilityView(entry).checked ? localSnapshotAvailabilityView(entry).message : 'Not yet checked.' }}
                            </p>
                        </div>

                        <div v-if="snapshotAcquisitionOutcomeCountsSentence(entry)" class="evidence-list">
                            <span class="evidence-convergence-title">Acquisition</span>
                            <p class="form-hint form-hint--neutral">{{ snapshotAcquisitionOutcomeCountsSentence(entry) }}</p>
                        </div>

                        <div v-if="entry.placementConvergenceView" class="evidence-list">
                            <span class="evidence-convergence-title">Placements</span>
                            <p class="form-hint form-hint--neutral">
                                {{ snapshotStatePlacementRelationshipLabel(snapshotStateInspectionView(entry)) }} ·
                                {{ entry.placementConvergenceView.placementCount }} known placement{{ entry.placementConvergenceView.placementCount === 1 ? '' : 's' }} ·
                                {{ entry.placementConvergenceView.storageTypeCount }} storage backend{{ entry.placementConvergenceView.storageTypeCount === 1 ? '' : 's' }} ·
                                {{ entry.placementConvergenceView.locatorCount }} distinct location{{ entry.placementConvergenceView.locatorCount === 1 ? '' : 's' }}
                            </p>
                        </div>

                        <div v-if="peerPossessionComparisonView(entry).peers.length > 0" class="evidence-list">
                            <span class="evidence-convergence-title">Peer observations</span>
                            <p class="form-hint form-hint--neutral">
                                {{ peerPossessionComparisonView(entry).availableCount }} available ·
                                {{ peerPossessionComparisonView(entry).notAvailableCount }} not available ·
                                {{ peerPossessionComparisonView(entry).unavailableCount }} could not determine
                            </p>
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

                        <!-- 0.8.61 — Explicit Bitcoin Anchor Transaction
                             Construction UI. One card per publication,
                             hidden entirely absent
                             bitcoinAnchorTransactionConstructionCoordinator
                             (the identical degrade-gracefully posture every
                             optional section on this page already holds),
                             mirroring the "0.8.11 Explicit External
                             Anchoring UX" card immediately above one step
                             EARLIER in the pipeline: that card turns a
                             published anchor into cataloged EVIDENCE;
                             this one turns OBSERVED funding into an
                             unsigned transaction PLAN — never a signature,
                             never a broadcast, never itself an anchor.
                             "Create Transaction Plan" is disabled until
                             wallet funding has actually been observed
                             (the "Bitcoin Funding" panel above) — this
                             card never observes funding on its own, and
                             never re-observes it, even when the funding
                             shown there has gone stale since. See
                             application/
                             BitcoinAnchorTransactionConstructionCoordinator.js's
                             own header. -->
                        <div v-if="bitcoinAnchorTransactionConstructionCoordinator" class="evidence-list">
                            <div class="evidence-anchor-card">
                                <div class="evidence-anchor-header">
                                    <span class="evidence-anchor-type">Bitcoin Anchor Transaction</span>
                                    <span v-if="bitcoinAnchorTransactionConstructionView(entry)" class="peer-badge"
                                        :class="bitcoinAnchorTransactionConstructionBadgeClass(entry)">
                                        {{ bitcoinAnchorTransactionConstructionView(entry).stateLabel }}
                                    </span>
                                </div>
                                <p class="form-hint form-hint--neutral">
                                    Turns the wallet funding observed above into an unsigned transaction plan for
                                    THIS publication's own content hash. Nothing is signed or broadcast by
                                    constructing this — it only names which observed inputs would be spent, and
                                    what the resulting fee and change would be.
                                </p>
                                <p v-if="!isBitcoinAnchorFundingObserved()" class="form-hint form-hint--neutral">
                                    Observe wallet funding above before creating a transaction plan.
                                </p>
                                <div class="identity-mgmt-actions">
                                    <button class="action-btn action-btn--primary"
                                            :disabled="!isBitcoinAnchorFundingObserved() || (bitcoinAnchorTransactionConstructionView(entry) && bitcoinAnchorTransactionConstructionView(entry).state === BitcoinAnchorTransactionConstructionState.CONSTRUCTING)"
                                            @click="constructBitcoinAnchorTransaction(entry)">
                                        Create Transaction Plan
                                    </button>
                                </div>

                                <template v-if="bitcoinAnchorTransactionConstructionView(entry)">
                                    <p v-if="bitcoinAnchorTransactionConstructionView(entry).reason" class="form-hint form-hint--neutral">
                                        {{ bitcoinAnchorTransactionConstructionView(entry).reason }}
                                    </p>

                                    <template v-if="bitcoinAnchorTransactionConstructionView(entry).state === BitcoinAnchorTransactionConstructionState.CONSTRUCTED">
                                        <dl class="evidence-fields">
                                            <div class="evidence-field"><dt>Network</dt><dd>{{ bitcoinAnchorTransactionConstructionView(entry).network }}</dd></div>
                                            <div class="evidence-field"><dt>Content hash</dt><dd>{{ bitcoinAnchorTransactionConstructionView(entry).contentHash }}</dd></div>
                                            <div class="evidence-field"><dt>Selected inputs</dt><dd>{{ bitcoinAnchorTransactionConstructionView(entry).selectedInputCount }}</dd></div>
                                            <div class="evidence-field"><dt>Fee</dt><dd>{{ bitcoinAnchorTransactionConstructionView(entry).feeSats }} sat</dd></div>
                                            <div class="evidence-field"><dt>Change</dt><dd>{{ bitcoinAnchorTransactionConstructionView(entry).changeSats }} sat</dd></div>
                                            <div class="evidence-field"><dt>Total inputs</dt><dd>{{ bitcoinAnchorTransactionConstructionView(entry).totalInputSats }} sat</dd></div>
                                        </dl>
                                        <div class="evidence-inspection-adapter">
                                            <span class="evidence-inspection-adapter-title">Inputs</span>
                                            <dl v-for="input in bitcoinAnchorTransactionConstructionView(entry).inputs" :key="input.txid + ':' + input.vout" class="evidence-fields">
                                                <div class="evidence-field"><dt>{{ shortId(input.txid) }}:{{ input.vout }}</dt><dd>{{ input.valueSats }} sat ({{ input.scriptType }})</dd></div>
                                            </dl>
                                        </div>
                                        <div class="evidence-inspection-adapter">
                                            <span class="evidence-inspection-adapter-title">Outputs</span>
                                            <dl v-for="(output, index) in bitcoinAnchorTransactionConstructionView(entry).outputs" :key="index" class="evidence-fields">
                                                <div class="evidence-field">
                                                    <dt>{{ output.type === 'change' ? 'Change' : 'OP_RETURN' }}</dt>
                                                    <dd>{{ output.address ? shortId(output.address) + ' — ' : '' }}{{ output.valueSats }} sat</dd>
                                                </div>
                                            </dl>
                                        </div>
                                        <p class="form-hint form-hint--neutral">
                                            Funding observed {{ formatWhen(bitcoinAnchorTransactionConstructionView(entry).fundingObservedAt) }};
                                            plan constructed {{ formatWhen(bitcoinAnchorTransactionConstructionView(entry).constructedAt) }}.
                                            The observed funding may already be stale by now — this plan records what it was built from, it
                                            does not claim those inputs are still spendable.
                                        </p>
                                    </template>
                                </template>
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

                                <!-- 0.8.58 — Explicit Bitcoin Wallet Connection & Signing UX. A
                                     wallet connection is unrelated to, and renders independently
                                     of, the "Bitcoin Anchor" reconciliation card immediately below
                                     — reading confirmation/content-proof status (0.8.54-0.8.57)
                                     needs no wallet and no private key at all, exactly as that
                                     section's own header already established. This is the ONE
                                     place this page ever asks a browser wallet extension for an
                                     account or a signing capability; see anchoring/
                                     BitcoinWalletConnection.js's own header on why ForkBuild only
                                     ever receives a capability, never a secret. See
                                     docs/Principles.md, "A Connection Grants A Capability; It Does
                                     Not Grant Trust (0.8.58)." -->
                                <div v-if="anchorView.anchorType === 'bitcoin-op-return' && bitcoinWalletConnection"
                                     class="evidence-inspection">
                                    <span class="evidence-inspection-title">Bitcoin Wallet</span>
                                    <div class="evidence-inspection-adapter">
                                        <span class="peer-badge" :class="bitcoinWalletConnectionBadgeClass()">
                                            {{ bitcoinWalletConnectionView().stateLabel }}
                                        </span>
                                        <dl v-if="isBitcoinWalletConnected()" class="evidence-fields">
                                            <div class="evidence-field"><dt>Account</dt><dd>{{ shortId(bitcoinWalletConnectionView().account) }}</dd></div>
                                            <div class="evidence-field"><dt>Network</dt><dd>{{ bitcoinWalletConnectionView().network }}</dd></div>
                                        </dl>
                                        <!-- No automatic network switching, wallet switching, or
                                             retry — the mismatch is only ever named, never resolved
                                             on a person's behalf. See anchoring/
                                             BitcoinWalletConnection.js's own header. -->
                                        <p v-if="bitcoinWalletConnectionView().networkMismatch" class="form-hint form-hint--neutral">
                                            Wallet network ({{ bitcoinWalletConnectionView().network }}) does not match this anchor's network ({{ bitcoinWalletConnectionView().expectedNetwork }}). Connect a wallet on the matching network to continue.
                                        </p>
                                        <p v-if="bitcoinWalletConnectionState.reason" class="form-hint form-hint--neutral">
                                            {{ bitcoinWalletConnectionState.reason }}
                                        </p>
                                    </div>
                                    <div class="identity-mgmt-actions">
                                        <button v-if="!isBitcoinWalletConnected()" class="action-btn action-btn--secondary"
                                                :disabled="isBitcoinWalletConnecting()"
                                                @click="connectBitcoinWallet()">
                                            {{ isBitcoinWalletConnecting() ? 'Connecting…' : 'Connect Bitcoin Wallet' }}
                                        </button>
                                        <button v-else class="action-btn action-btn--secondary" @click="disconnectBitcoinWallet()">
                                            Disconnect
                                        </button>
                                    </div>
                                </div>

                                <!-- 0.8.57 — Bitcoin Anchor Proof & Confirmation Inspection UI. A
                                     SEPARATE section from "Verify Evidence" immediately above and
                                     from "Inspect Evidence" immediately below: this displays what
                                     application/BitcoinAnchorProofReconciliationView.js's own
                                     reconcile() reports RIGHT NOW, side by side, for THIS one
                                     "bitcoin-op-return" anchor — never a combined verdict. A
                                     transaction reported CONFIRMED here and a content proof
                                     reported HASH_MISMATCH right beside it is not an error this
                                     section resolves, hides, or explains away — it is exactly the
                                     honest combination application/
                                     BitcoinAnchorProofReconciliationView.js's own header names as
                                     the entire point of reconciliation. See docs/Principles.md,
                                     "The UI Displays Observations; It Does Not Turn Them Into A
                                     Verdict (0.8.57)." -->
                                <div v-if="anchorView.anchorType === 'bitcoin-op-return' && bitcoinAnchorProofReconciliationView"
                                     class="evidence-inspection">
                                    <span class="evidence-inspection-title">Bitcoin Anchor</span>
                                    <dl class="evidence-fields">
                                        <div class="evidence-field"><dt>Transaction</dt><dd>{{ anchorView.locator }}</dd></div>
                                        <div class="evidence-field"><dt>Content hash</dt><dd>{{ anchorView.contentHash }}</dd></div>
                                    </dl>

                                    <p v-if="!bitcoinAnchorReconciliationView(entry, anchorView).confirmation && !bitcoinAnchorReconciliationView(entry, anchorView).reconciling"
                                       class="form-hint form-hint--neutral">
                                        Not yet checked this session.
                                    </p>
                                    <p v-if="bitcoinAnchorReconciliationView(entry, anchorView).error" class="form-hint form-hint--neutral">
                                        {{ bitcoinAnchorReconciliationView(entry, anchorView).error }}
                                    </p>

                                    <!-- Confirmation — application/BitcoinAnchorConfirmationState.js's
                                         own vocabulary, projected UNCHANGED through application/
                                         BitcoinAnchorConfirmationObservationHistoryDetailView.js. -->
                                    <div v-if="bitcoinAnchorReconciliationView(entry, anchorView).confirmation" class="evidence-inspection-adapter">
                                        <span class="evidence-inspection-adapter-title">Confirmation</span>
                                        <span class="peer-badge" :class="bitcoinAnchorConfirmationBadgeClass(entry, anchorView)">
                                            {{ bitcoinAnchorReconciliationView(entry, anchorView).confirmation.stateLabel }}
                                        </span>
                                        <dl v-if="bitcoinAnchorReconciliationView(entry, anchorView).confirmation.blockHeight !== null" class="evidence-fields">
                                            <div class="evidence-field"><dt>Block</dt><dd>{{ bitcoinAnchorReconciliationView(entry, anchorView).confirmation.blockHeight }}</dd></div>
                                            <div class="evidence-field"><dt>Confirmations</dt><dd>{{ bitcoinAnchorReconciliationView(entry, anchorView).confirmation.confirmationCount }}</dd></div>
                                        </dl>
                                        <p v-if="bitcoinAnchorReconciliationView(entry, anchorView).confirmation.reason" class="form-hint form-hint--neutral">
                                            {{ bitcoinAnchorReconciliationView(entry, anchorView).confirmation.reason }}
                                        </p>
                                    </div>

                                    <!-- Content proof — application/BitcoinAnchorContentProofState.js's
                                         own, SEPARATE vocabulary — never merged with Confirmation above. -->
                                    <div v-if="bitcoinAnchorReconciliationView(entry, anchorView).contentProof" class="evidence-inspection-adapter">
                                        <span class="evidence-inspection-adapter-title">Content proof</span>
                                        <span class="peer-badge" :class="bitcoinAnchorContentProofBadgeClass(entry, anchorView)">
                                            {{ bitcoinAnchorReconciliationView(entry, anchorView).contentProof.stateLabel }}
                                        </span>
                                        <p v-if="bitcoinAnchorReconciliationView(entry, anchorView).contentProof.reason" class="form-hint form-hint--neutral">
                                            {{ bitcoinAnchorReconciliationView(entry, anchorView).contentProof.reason }}
                                        </p>
                                    </div>

                                    <div class="identity-mgmt-actions">
                                        <button class="action-btn action-btn--secondary"
                                                :disabled="bitcoinAnchorReconciliationView(entry, anchorView).reconciling"
                                                @click="reconcileBitcoinAnchor(entry, anchorView)">
                                            {{ bitcoinAnchorReconcileButtonLabel(entry, anchorView) }}
                                        </button>
                                        <button v-if="bitcoinAnchorConfirmationHistoryView(entry, anchorView).count > 0"
                                                class="action-btn action-btn--secondary"
                                                @click="toggleBitcoinAnchorConfirmationHistory(entry, anchorView)">
                                            {{ isBitcoinAnchorConfirmationHistoryExpanded(entry, anchorView) ? 'Hide Confirmation History' : 'Show Confirmation History' }}
                                        </button>
                                        <!-- 0.8.76 — Bitcoin Anchor Chain Placement Change
                                             Observation. Shown once THIS anchor's own history holds at
                                             least two observations to compare — never before, since
                                             application/BitcoinAnchorChainPlacementObserver.js's own
                                             INSUFFICIENT_OBSERVATIONS outcome would be the only
                                             possible result with fewer. Comparing is a pure, read-only
                                             re-derivation of the SAME history "Show Confirmation
                                             History" already narrates — never a new network call. -->
                                        <button v-if="(entry.bitcoinAnchorConfirmationHistories[anchorView.anchorId] || []).length > 1"
                                                class="action-btn action-btn--secondary"
                                                @click="toggleBitcoinAnchorChainPlacementComparison(entry, anchorView)">
                                            {{ isBitcoinAnchorChainPlacementComparisonExpanded(entry, anchorView) ? 'Hide Placement Comparison' : 'Compare Confirmation Observations' }}
                                        </button>
                                        <!-- 0.8.77 — Bitcoin Anchor Observation Consistency
                                             Analysis. A SIBLING to "Compare Confirmation
                                             Observations" above, shown under the identical
                                             two-or-more-observations condition — never before,
                                             since application/BitcoinAnchorObservationConsistencyAnalyzer.js's
                                             own INSUFFICIENT_OBSERVATIONS state would be the only
                                             possible result with fewer. Analyzing is a pure,
                                             read-only re-derivation of the SAME history "Show
                                             Confirmation History" already narrates — never a new
                                             network call. -->
                                        <button v-if="(entry.bitcoinAnchorConfirmationHistories[anchorView.anchorId] || []).length > 1"
                                                class="action-btn action-btn--secondary"
                                                @click="toggleBitcoinAnchorObservationConsistency(entry, anchorView)">
                                            {{ isBitcoinAnchorObservationConsistencyExpanded(entry, anchorView) ? 'Hide Observation Consistency' : 'Observation Consistency' }}
                                        </button>
                                        <!-- 0.8.78 — Bitcoin Anchor Observation Evidence
                                             Correlation. A SIBLING to "Compare Confirmation
                                             Observations" (0.8.76) and "Observation Consistency"
                                             (0.8.77) above, shown whenever this anchor holds ANY
                                             recorded fact at all — never gated behind the
                                             two-or-more-observations condition those two share,
                                             since application/BitcoinAnchorObservationEvidence.js
                                             also bundles this anchor's own content-proof
                                             observation, which those two never read. Composing
                                             evidence is a pure, read-only re-derivation of facts
                                             the cards above already show — never a new network
                                             call. -->
                                        <button v-if="bitcoinAnchorObservationEvidenceView(entry, anchorView).confirmationObservations.count > 0
                                                       || bitcoinAnchorObservationEvidenceView(entry, anchorView).contentProofObservations.count > 0"
                                                class="action-btn action-btn--secondary"
                                                @click="toggleBitcoinAnchorObservationEvidence(entry, anchorView)">
                                            {{ isBitcoinAnchorObservationEvidenceExpanded(entry, anchorView) ? 'Hide Bitcoin Anchor Evidence' : 'Bitcoin Anchor Evidence' }}
                                        </button>
                                    </div>

                                    <!-- Each comparison names only whether the observed block
                                         placement between two already-recorded observations stayed
                                         the same or changed — never a reorganization, invalidation,
                                         or trust verdict. See docs/Principles.md, "A Changed
                                         Observation Is Not Automatically A Reorganization (0.8.76)."
                                         No "danger" styling of any kind is applied to a changed
                                         comparison; it is narrated in the same neutral voice as an
                                         unchanged one. -->
                                    <div v-if="isBitcoinAnchorChainPlacementComparisonExpanded(entry, anchorView)">
                                        <p v-if="bitcoinAnchorChainPlacementComparisonView(entry, anchorView).count === 0" class="form-hint form-hint--neutral">
                                            Not enough confirmed observations exist yet to compare block placement.
                                        </p>
                                        <ul v-else class="replica-knowledge-claim-list">
                                            <li v-for="(comparison, index) in bitcoinAnchorChainPlacementComparisonView(entry, anchorView).comparisons" :key="index" class="replica-knowledge-claim">
                                                <p class="form-hint form-hint--neutral">{{ comparison.outcomeLabel }}</p>
                                                <dl v-if="comparison.previousBlock || comparison.laterBlock" class="evidence-fields">
                                                    <div v-if="comparison.previousBlock" class="evidence-field">
                                                        <dt>Previous block</dt>
                                                        <dd>
                                                            {{ comparison.previousBlock.blockHash || '(not confirmed)' }}
                                                            <span v-if="comparison.previousBlock.blockHeight !== null">— height {{ comparison.previousBlock.blockHeight }}, {{ comparison.previousBlock.confirmationCount }} confirmation(s)</span>
                                                            — observed {{ formatWhen(comparison.previousBlock.observedAt) }}
                                                        </dd>
                                                    </div>
                                                    <div v-if="comparison.laterBlock" class="evidence-field">
                                                        <dt>Later block</dt>
                                                        <dd>
                                                            {{ comparison.laterBlock.blockHash || '(not confirmed)' }}
                                                            <span v-if="comparison.laterBlock.blockHeight !== null">— height {{ comparison.laterBlock.blockHeight }}, {{ comparison.laterBlock.confirmationCount }} confirmation(s)</span>
                                                            — observed {{ formatWhen(comparison.laterBlock.observedAt) }}
                                                        </dd>
                                                    </div>
                                                </dl>
                                            </li>
                                        </ul>
                                    </div>

                                    <!-- 0.8.77 — Bitcoin Anchor Observation Consistency
                                         Analysis. Each finding names only whether two
                                         already-recorded observations are internally consistent
                                         with each other — never a reorganization, invalidation,
                                         fraud, or trust verdict, and never a claim about which
                                         of the two (if either) is correct. See docs/
                                         Principles.md, "An Internal Inconsistency Is Not
                                         Automatically A Reorganization (0.8.77)." No "danger"
                                         styling of any kind is applied to an INCONSISTENT
                                         finding; it is narrated in the same neutral voice as a
                                         CONSISTENT one. -->
                                    <div v-if="isBitcoinAnchorObservationConsistencyExpanded(entry, anchorView)">
                                        <p v-if="bitcoinAnchorObservationConsistencyView(entry, anchorView).count === 0" class="form-hint form-hint--neutral">
                                            Not enough confirmed observations exist yet to analyze consistency.
                                        </p>
                                        <ul v-else class="replica-knowledge-claim-list">
                                            <li v-for="(finding, index) in bitcoinAnchorObservationConsistencyView(entry, anchorView).findings" :key="index" class="replica-knowledge-claim">
                                                <p class="form-hint form-hint--neutral">{{ finding.stateLabel }}</p>
                                                <dl v-if="finding.previousBlock || finding.laterBlock" class="evidence-fields">
                                                    <div v-if="finding.previousBlock" class="evidence-field">
                                                        <dt>Previous block</dt>
                                                        <dd>
                                                            {{ finding.previousBlock.blockHash || '(not confirmed)' }}
                                                            <span v-if="finding.previousBlock.blockHeight !== null">— height {{ finding.previousBlock.blockHeight }}, {{ finding.previousBlock.confirmationCount }} confirmation(s)</span>
                                                            — observed {{ formatWhen(finding.previousBlock.observedAt) }}
                                                        </dd>
                                                    </div>
                                                    <div v-if="finding.laterBlock" class="evidence-field">
                                                        <dt>Later block</dt>
                                                        <dd>
                                                            {{ finding.laterBlock.blockHash || '(not confirmed)' }}
                                                            <span v-if="finding.laterBlock.blockHeight !== null">— height {{ finding.laterBlock.blockHeight }}, {{ finding.laterBlock.confirmationCount }} confirmation(s)</span>
                                                            — observed {{ formatWhen(finding.laterBlock.observedAt) }}
                                                        </dd>
                                                    </div>
                                                </dl>
                                            </li>
                                        </ul>
                                    </div>

                                    <!-- 0.8.78 — Bitcoin Anchor Observation Evidence
                                         Correlation. Puts this anchor's own five independent
                                         facts — broadcast, confirmation, content-proof,
                                         chain-placement comparisons, and consistency findings
                                         — side by side, each still in its own domain's own
                                         vocabulary, under this one explicit anchorId. This is
                                         NOT a combined verdict: a person reading this section
                                         still sees "4 confirmation observations" and "1
                                         content-proof observation" as two entirely separate
                                         facts, never a single "well evidenced" or "verified"
                                         summary. See docs/Principles.md, "The UI Displays
                                         Observations; It Does Not Turn Them Into A Verdict
                                         (0.8.57)," and application/
                                         BitcoinAnchorObservationEvidence.js's own header,
                                         "Correlate Evidence By Explicit Identity, Never By
                                         Resemblance." -->
                                    <ul v-if="isBitcoinAnchorObservationEvidenceExpanded(entry, anchorView)" class="replica-knowledge-claim-list">
                                        <li class="replica-knowledge-claim">
                                            <p class="form-hint form-hint--neutral">
                                                Broadcast observations: {{ bitcoinAnchorObservationEvidenceView(entry, anchorView).broadcastObservations.count }}
                                            </p>
                                            <ul v-if="bitcoinAnchorObservationEvidenceView(entry, anchorView).broadcastObservations.count > 0">
                                                <li v-for="item in bitcoinAnchorObservationEvidenceView(entry, anchorView).broadcastObservations.observations" :key="item.index">
                                                    {{ item.stateLabel }} — {{ item.broadcastedAt ? formatWhen(item.broadcastedAt) : 'no timestamp recorded' }}
                                                </li>
                                            </ul>
                                        </li>
                                        <li class="replica-knowledge-claim">
                                            <p class="form-hint form-hint--neutral">
                                                Confirmation observations: {{ bitcoinAnchorObservationEvidenceView(entry, anchorView).confirmationObservations.count }}
                                            </p>
                                            <ul v-if="bitcoinAnchorObservationEvidenceView(entry, anchorView).confirmationObservations.count > 0">
                                                <li v-for="item in bitcoinAnchorObservationEvidenceView(entry, anchorView).confirmationObservations.observations" :key="item.index">
                                                    Confirmation observation #{{ item.index }} — {{ formatWhen(item.observedAt) }} — {{ item.stateLabel }}
                                                </li>
                                            </ul>
                                        </li>
                                        <li class="replica-knowledge-claim">
                                            <p class="form-hint form-hint--neutral">
                                                Content-proof observations: {{ bitcoinAnchorObservationEvidenceView(entry, anchorView).contentProofObservations.count }}
                                            </p>
                                            <ul v-if="bitcoinAnchorObservationEvidenceView(entry, anchorView).contentProofObservations.count > 0">
                                                <li v-for="item in bitcoinAnchorObservationEvidenceView(entry, anchorView).contentProofObservations.observations" :key="item.index">
                                                    Content-proof observation #{{ item.index }} — {{ formatWhen(item.observedAt) }} — {{ item.stateLabel }}
                                                </li>
                                            </ul>
                                        </li>
                                        <li class="replica-knowledge-claim">
                                            <p class="form-hint form-hint--neutral">
                                                Chain-placement comparisons: {{ bitcoinAnchorObservationEvidenceView(entry, anchorView).chainPlacementObservations.count }}
                                            </p>
                                        </li>
                                        <li class="replica-knowledge-claim">
                                            <p class="form-hint form-hint--neutral">
                                                Consistency findings: {{ bitcoinAnchorObservationEvidenceView(entry, anchorView).consistencyFindings.count }}
                                            </p>
                                        </li>
                                    </ul>

                                    <!-- The full chronological narration of every past "Reconcile"
                                         click's own confirmation observation for THIS anchor — a
                                         later CONFIRMED entry never rewrites or discards an earlier
                                         NOT_CONFIRMED one; see application/
                                         BitcoinAnchorConfirmationObservationHistory.js's own header. -->
                                    <div v-if="isBitcoinAnchorConfirmationHistoryExpanded(entry, anchorView)">
                                        <ul class="replica-knowledge-claim-list">
                                            <li v-for="(item, index) in bitcoinAnchorConfirmationHistoryView(entry, anchorView).entries" :key="index" class="replica-knowledge-claim">
                                                <button class="action-btn action-btn--secondary"
                                                        @click="toggleBitcoinAnchorConfirmationHistoryEntry(entry, anchorView, index)">
                                                    {{ formatWhen(item.observedAt) }} — {{ item.stateShortLabel }}
                                                </button>
                                                <dl v-if="isBitcoinAnchorConfirmationHistoryEntryExpanded(entry, anchorView, index)" class="evidence-fields">
                                                    <div class="evidence-field"><dt>State</dt><dd>{{ item.stateLabel }}</dd></div>
                                                    <div class="evidence-field"><dt>Transaction ID</dt><dd>{{ item.txid }}</dd></div>
                                                    <div v-if="item.blockHash" class="evidence-field"><dt>Block hash</dt><dd>{{ item.blockHash }}</dd></div>
                                                    <div v-if="item.blockHeight !== null" class="evidence-field"><dt>Block height</dt><dd>{{ item.blockHeight }}</dd></div>
                                                    <div v-if="item.confirmationCount !== null" class="evidence-field"><dt>Confirmations</dt><dd>{{ item.confirmationCount }}</dd></div>
                                                    <div v-if="item.reason" class="evidence-field"><dt>Reason</dt><dd>{{ item.reason }}</dd></div>
                                                </dl>
                                            </li>
                                        </ul>
                                    </div>
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

                    <!-- 0.8.68 — Explicit Remote IPFS Publishing Configuration & UX.
                         Deliberately a SEPARATE section from "Snapshot Placements" above —
                         a snapshot placement (0.8.18/0.8.25) is a claim, cataloged and signed,
                         about where bytes can presently be retrieved; a remote publish attempt
                         here is neither. It never touches application/
                         SnapshotPlacementStoreRegistry.js, never calls application/
                         CreateExternalSnapshotPlacementUseCase.js, and never creates a
                         core/PublicationSnapshotPlacement.js — see application/
                         IpfsRemotePublicationCoordinator.js's own header, "The existing store
                         remains authoritative for content creation." This section only ever
                         shows the result of the MOST RECENT explicit publish attempt, exactly
                         like the Bitcoin Broadcast section above, one axis over. Absent
                         ipfsRemotePublicationCoordinator or publicationCatalogContentResolver,
                         this section simply never renders — the identical degrade-gracefully
                         posture every optional section on this page already holds. -->
                    <div v-if="ipfsRemotePublicationCoordinator && publicationCatalogContentResolver" class="evidence-section">
                        <div class="evidence-summary">
                            <span class="evidence-summary-title">IPFS Publishing</span>
                            <span class="form-hint form-hint--neutral">
                                Local Kubo can resolve and publish. A remote gateway can only resolve. Remote
                                pinning, configured below, can only publish.
                            </span>
                        </div>

                        <div class="evidence-anchor-card">
                            <div class="evidence-anchor-header">
                                <span class="evidence-anchor-type">Remote pinning</span>
                            </div>
                            <dl class="evidence-fields">
                                <div class="evidence-field"><dt>Endpoint</dt><dd>{{ ipfsRemotePublishingConfigurationView(entry).endpoint || 'not configured' }}</dd></div>
                                <div class="evidence-field"><dt>Credential</dt><dd>{{ ipfsRemotePublishingConfigurationView(entry).hasCredential ? 'configured' : 'not configured' }}</dd></div>
                            </dl>

                            <div class="identity-mgmt-actions">
                                <button type="button" class="action-btn action-btn--secondary"
                                        @click="toggleIpfsRemotePublishingConfigureForm(entry)">
                                    {{ entry.ipfsRemotePublishingConfigureFormOpen ? 'Cancel' : (ipfsRemotePublishingConfigurationView(entry).configured ? 'Reconfigure Remote Publishing' : 'Configure Remote Publishing') }}
                                </button>
                                <button v-if="ipfsRemotePublishingConfigurationView(entry).configured" type="button" class="action-btn action-btn--secondary"
                                        @click="clearIpfsRemotePublishingConfiguration(entry)">
                                    Clear Configuration
                                </button>
                            </div>

                            <!-- Ephemeral draft fields — nothing here becomes a real
                                 application/IpfsRemotePublishingConfiguration.js until "Save
                                 Configuration" is explicitly clicked, and nothing here is ever
                                 written to localStorage, IndexedDB, a cookie, or any other
                                 persisted medium. See that class's own header. -->
                            <div v-if="entry.ipfsRemotePublishingConfigureFormOpen" class="evidence-inspection-adapter">
                                <label class="form-field">
                                    <span class="form-label">Endpoint</span>
                                    <input type="text" class="form-input" v-model="entry.ipfsRemotePublishingDraft.endpoint"
                                           placeholder="https://your-pinning-service.example/api/pin" />
                                </label>
                                <label class="form-field">
                                    <span class="form-label">Credential (optional)</span>
                                    <input type="password" class="form-input" v-model="entry.ipfsRemotePublishingDraft.credential"
                                           placeholder="Bearer token" />
                                </label>
                                <label class="form-field">
                                    <span class="form-label">Request field (optional)</span>
                                    <input type="text" class="form-input" v-model="entry.ipfsRemotePublishingDraft.requestField" placeholder="file" />
                                </label>
                                <label class="form-field">
                                    <span class="form-label">Response field (optional)</span>
                                    <input type="text" class="form-input" v-model="entry.ipfsRemotePublishingDraft.responseField" placeholder="cid" />
                                </label>
                                <p class="form-hint form-hint--neutral">
                                    Nothing here is saved anywhere. This configuration lives only in this page's
                                    own memory for this browsing session, and is discarded the moment the page
                                    reloads or "Clear Configuration" is clicked.
                                </p>
                                <button type="button" class="action-btn action-btn--primary" @click="saveIpfsRemotePublishingConfiguration(entry)">
                                    Save Configuration
                                </button>
                            </div>

                            <div v-if="ipfsRemotePublishingConfigurationView(entry).configured" class="identity-mgmt-actions">
                                <button type="button" class="action-btn action-btn--primary"
                                        :disabled="isIpfsRemotePublishing(entry)"
                                        @click="publishToRemoteIpfs(entry)">
                                    {{ isIpfsRemotePublishing(entry) ? 'Publishing…' : (ipfsRemotePublicationView(entry).state === IpfsRemotePublicationState.IDLE ? 'Publish to Remote IPFS' : 'Publish Again') }}
                                </button>
                            </div>

                            <!-- PUBLISHED names exactly one fact — the configured provider
                                 accepted these bytes and returned this locator — never
                                 "verified", "trusted", "safe", "permanent", or "guaranteed". See
                                 application/IpfsRemotePublicationState.js's own header. -->
                            <div v-if="ipfsRemotePublicationView(entry).state !== IpfsRemotePublicationState.IDLE" class="evidence-inspection-adapter">
                                <span class="evidence-inspection-adapter-title">Remote IPFS</span>
                                <span class="peer-badge" :class="ipfsRemotePublicationBadgeClass(entry)">{{ ipfsRemotePublicationView(entry).stateLabel }}</span>
                                <p v-if="ipfsRemotePublicationView(entry).reason" class="form-hint form-hint--neutral">
                                    {{ ipfsRemotePublicationView(entry).reason }}
                                </p>

                                <template v-if="ipfsRemotePublicationView(entry).state === IpfsRemotePublicationState.PUBLISHED">
                                    <dl class="evidence-fields">
                                        <div class="evidence-field"><dt>Content hash</dt><dd>{{ ipfsRemotePublicationView(entry).contentHash }}</dd></div>
                                        <div class="evidence-field"><dt>IPFS locator</dt><dd>{{ ipfsRemotePublicationView(entry).locator }}</dd></div>
                                        <div class="evidence-field"><dt>Provider</dt><dd>{{ ipfsRemotePublicationView(entry).endpoint }}</dd></div>
                                        <div class="evidence-field"><dt>Published at</dt><dd>{{ formatWhen(ipfsRemotePublicationView(entry).publishedAt) }}</dd></div>
                                    </dl>
                                    <p class="form-hint form-hint--neutral">
                                        The configured provider accepted these bytes and returned this locator.
                                        This is an observation of what the provider just said, not a promise
                                        that it will still be retrievable later, and not a cataloged Snapshot
                                        Placement.
                                    </p>
                                </template>
                            </div>

                            <!-- 0.8.70 — IPFS Publication & Content Verification UI.
                                 Deliberately a SEPARATE evidence-inspection-adapter box from
                                 "Remote IPFS" above, never collapsed into it — publishing is an
                                 action, verification is an observation, and PUBLISHED +
                                 UNAVAILABLE (or PUBLISHED + HASH_MISMATCH) must remain a
                                 legitimate, honestly displayed combination, exactly like Broadcast
                                 and Confirmation above stay two separate boxes one domain over.
                                 Gated on entry.ipfsPublicationRecord — the exact record the most
                                 recent PUBLISHED outcome bound — never on whatever this section
                                 currently displays, so this box never appears for an entry that has
                                 never actually published. No aggregate "IPFS status" is computed
                                 anywhere in this box. -->
                            <div v-if="ipfsPublicationContentVerificationCoordinator && entry.ipfsPublicationRecord" class="evidence-inspection-adapter">
                                <span class="evidence-inspection-adapter-title">Content retrieval</span>
                                <div class="identity-mgmt-actions">
                                    <button type="button" class="action-btn action-btn--primary"
                                            :disabled="isVerifyingIpfsPublicationContent(entry)"
                                            @click="verifyIpfsPublicationContent(entry)">
                                        {{ ipfsPublicationContentVerifyButtonLabel(entry) }}
                                    </button>
                                </div>
                                <template v-if="entry.ipfsPublicationContentVerification">
                                    <span class="peer-badge" :class="ipfsPublicationContentVerificationBadgeClass(entry)">
                                        {{ ipfsPublicationContentVerificationView(entry).stateLabel }}
                                    </span>
                                    <p v-if="ipfsPublicationContentVerificationView(entry).reason" class="form-hint form-hint--neutral">
                                        {{ ipfsPublicationContentVerificationView(entry).reason }}
                                    </p>
                                    <p v-if="ipfsPublicationContentVerificationView(entry).observedAt" class="form-hint form-hint--neutral">
                                        Observed {{ formatWhen(ipfsPublicationContentVerificationView(entry).observedAt) }}
                                    </p>
                                </template>
                            </div>

                            <!-- 0.8.71 — IPFS Publication Record History & Inspection.
                                 The FULL, append-only sequence of every record a
                                 PUBLISHED outcome for THIS entry has ever bound — never
                                 just the most recent one. Publishing again never
                                 overwrites or hides an earlier record here; see
                                 application/IpfsPublicationRecordHistory.js's own header.
                                 Gated on there being at least one record, mirroring the
                                 Bitcoin "Show/Hide Confirmation History" button's own
                                 restraint above. -->
                            <div v-if="ipfsPublicationRecordHistoryView(entry).count > 0" class="identity-mgmt-actions">
                                <button type="button" class="action-btn action-btn--secondary"
                                        @click="toggleIpfsPublicationRecordHistory(entry)">
                                    {{ entry.ipfsPublicationRecordHistoryExpanded ? 'Hide Publication History' : 'Show Publication History' }}
                                </button>
                            </div>
                            <div v-if="entry.ipfsPublicationRecordHistoryExpanded" class="evidence-inspection-adapter">
                                <span class="evidence-inspection-adapter-title">Publication History</span>
                                <ul class="replica-knowledge-claim-list">
                                    <li v-for="(item, index) in ipfsPublicationRecordHistoryView(entry).records" :key="index" class="replica-knowledge-claim">
                                        <button class="action-btn action-btn--secondary"
                                                @click="toggleIpfsPublicationRecordInspection(entry, index)">
                                            {{ formatWhen(item.publishedAt) }} — {{ item.locator }}
                                        </button>

                                        <!-- Purely local, synchronous — this record's own
                                             facts, never a network read. -->
                                        <dl v-if="isIpfsPublicationRecordInspectionExpanded(entry, index)" class="evidence-fields">
                                            <div class="evidence-field"><dt>Locator</dt><dd>{{ item.locator }}</dd></div>
                                            <div class="evidence-field"><dt>Content hash</dt><dd>{{ item.contentHash }}</dd></div>
                                            <div class="evidence-field"><dt>Published at</dt><dd>{{ formatWhen(item.publishedAt) }}</dd></div>
                                            <div v-if="item.publicationMethodLabel" class="evidence-field"><dt>Method</dt><dd>{{ item.publicationMethodLabel }}</dd></div>
                                        </dl>

                                        <!-- 0.8.72 — IPFS Publication Verification History &
                                             Inspection UI. This record's OWN, independently kept,
                                             APPEND-ONLY verification history — never the "current
                                             publication" verification above, and never any other
                                             history entry's own history. Verifying record #0 can
                                             never appear in record #1's own history, and vice
                                             versa; see verifyIpfsPublicationRecordHistoryEntry()'s
                                             own header. These are observations made at different
                                             times — the latest one never retroactively changes an
                                             earlier one. -->
                                        <div v-if="ipfsPublicationContentVerificationCoordinator" class="evidence-inspection-adapter">
                                            <span class="evidence-inspection-adapter-title">Content retrieval</span>
                                            <span v-if="ipfsPublicationRecordVerificationHistoryView(entry, index).count > 0"
                                                  class="peer-badge" :class="ipfsPublicationRecordVerificationBadgeClass(entry, index)">
                                                Latest: {{ latestIpfsPublicationRecordVerificationView(entry, index).stateLabel }}
                                            </span>

                                            <div class="identity-mgmt-actions">
                                                <button type="button" class="action-btn action-btn--primary"
                                                        :disabled="isVerifyingIpfsPublicationRecordHistoryEntry(entry, index)"
                                                        @click="verifyIpfsPublicationRecordHistoryEntry(entry, index)">
                                                    {{ ipfsPublicationRecordVerifyButtonLabel(entry, index) }}
                                                </button>
                                            </div>

                                            <!-- No polling, no automatic verification after
                                                 publication, and no automatic verification merely
                                                 from expanding this disclosure — opening it only
                                                 ever reads entry.
                                                 ipfsPublicationVerificationHistoriesByRecordIndex
                                                 [index], already in memory. -->
                                            <div v-if="ipfsPublicationRecordVerificationHistoryView(entry, index).count > 0" class="identity-mgmt-actions">
                                                <button type="button" class="action-btn action-btn--secondary"
                                                        @click="toggleIpfsPublicationRecordVerificationHistory(entry, index)">
                                                    {{ isIpfsPublicationRecordVerificationHistoryExpanded(entry, index) ? 'Hide Verification History' : 'Show Verification History' }}
                                                </button>
                                            </div>
                                            <div v-if="isIpfsPublicationRecordVerificationHistoryExpanded(entry, index)">
                                                <p class="form-hint form-hint--neutral">
                                                    These are observations made at different times. A
                                                    later observation never rewrites or replaces an
                                                    earlier one.
                                                </p>
                                                <ul class="replica-knowledge-claim-list">
                                                    <li v-for="(verification, vIndex) in ipfsPublicationRecordVerificationHistoryView(entry, index).verifications"
                                                        :key="vIndex" class="replica-knowledge-claim">
                                                        <span class="peer-badge" :class="ipfsPublicationVerificationEntryBadgeClass(verification)">
                                                            {{ formatWhen(verification.observedAt) }} — {{ verification.stateLabel }}
                                                        </span>
                                                        <p v-if="verification.reason" class="form-hint form-hint--neutral">
                                                            {{ verification.reason }}
                                                        </p>
                                                    </li>
                                                </ul>
                                            </div>
                                        </div>
                                    </li>
                                </ul>
                            </div>

                            <!-- 0.8.73 — IPFS Publication Observation Timeline.
                                 A pure, presentation-only chronological projection over
                                 the SAME two histories the "Publication History" disclosure
                                 above and each record's own "Verification History" already
                                 read — never a new domain concept, never a new verdict
                                 layer. Gated on there being at least one publication,
                                 mirroring "Show/Hide Publication History"'s own restraint.
                                 Opening this disclosure performs ZERO network operations —
                                 it only reads entry.ipfsPublicationRecordHistory and entry.
                                 ipfsPublicationVerificationHistoriesByRecordIndex, already in
                                 memory. There is no "refresh" action here; new entries only
                                 ever appear after the existing, explicit "Publish"/"Verify
                                 Again" actions above. See application/
                                 IpfsPublicationObservationTimelineView.js's own header. -->
                            <div v-if="ipfsPublicationObservationTimelineView(entry).count > 0" class="identity-mgmt-actions">
                                <button type="button" class="action-btn action-btn--secondary"
                                        @click="toggleIpfsPublicationObservationTimeline(entry)">
                                    {{ entry.ipfsPublicationObservationTimelineExpanded ? 'Hide Timeline' : 'Show Timeline' }}
                                </button>
                            </div>
                            <div v-if="entry.ipfsPublicationObservationTimelineExpanded" class="evidence-inspection-adapter">
                                <span class="evidence-inspection-adapter-title">Observation Timeline</span>
                                <p class="form-hint form-hint--neutral">
                                    Every publication and every content-retrieval observation for
                                    this entry, in true chronological order — never a running
                                    status, and never evidence that one publication record is
                                    preferable to another.
                                </p>
                                <ul class="replica-knowledge-claim-list">
                                    <li v-for="(item, tIndex) in ipfsPublicationObservationTimelineView(entry).entries"
                                        :key="tIndex" class="replica-knowledge-claim">
                                        <span class="peer-badge" :class="ipfsPublicationObservationTimelineEntryBadgeClass(item)">
                                            {{ formatWhen(item.observedAt) }} — {{ item.kind === IpfsPublicationObservationTimelineEntryKind.PUBLICATION ? 'Published' : item.stateLabel }}
                                        </span>
                                        <p class="form-hint form-hint--neutral">{{ item.label }} — {{ item.locator }}</p>
                                        <p v-if="item.kind === IpfsPublicationObservationTimelineEntryKind.CONTENT_VERIFICATION && item.reason" class="form-hint form-hint--neutral">
                                            {{ item.reason }}
                                        </p>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <!-- 0.8.74 — Cross-Domain Publication Observation Timeline.
                         Deliberately a SIBLING evidence-section, placed after both the
                         "Bitcoin Anchor"/evidence card above and the "IPFS Publishing"
                         card immediately above — never nested inside either one, because
                         this disclosure is a view over BOTH of this entry's own domains at
                         once. A pure, presentation-only chronological projection over
                         application/PublicationObservationTimelineView.js's own
                         describePublicationObservationTimeline() — it invents no new fact
                         either domain's own cards above do not already show, and computes
                         no combined status, confidence, or health of any kind. Opening
                         this disclosure performs ZERO network operations. See that file's
                         own header, and docs/Principles.md, "Unify The Timeline, Not The
                         Meanings (0.8.74)." -->
                    <div v-if="crossDomainPublicationObservationTimelineView(entry).count > 0" class="evidence-section">
                        <div class="evidence-summary">
                            <span class="evidence-summary-title">Cross-Domain Observation Timeline</span>
                            <span class="form-hint form-hint--neutral">
                                Every IPFS and Bitcoin observation for this publication, in one true
                                chronological order. Each entry keeps its own domain's own vocabulary —
                                this is never a combined status, and an IPFS fact is never presented as
                                evidence about a Bitcoin fact, or the other way around.
                            </span>
                        </div>
                        <div class="identity-mgmt-actions">
                            <button type="button" class="action-btn action-btn--secondary"
                                    @click="toggleCrossDomainPublicationObservationTimeline(entry)">
                                {{ entry.crossDomainPublicationObservationTimelineExpanded ? 'Hide Cross-Domain Timeline' : 'Show Cross-Domain Timeline' }}
                            </button>
                        </div>
                        <div v-if="entry.crossDomainPublicationObservationTimelineExpanded" class="evidence-inspection-adapter">
                            <span class="evidence-inspection-adapter-title">Cross-Domain Observation Timeline</span>
                            <ul class="replica-knowledge-claim-list">
                                <li v-for="(item, cdIndex) in crossDomainPublicationObservationTimelineView(entry).entries"
                                    :key="cdIndex" class="replica-knowledge-claim">
                                    <span class="peer-badge" :class="crossDomainPublicationObservationTimelineEntryBadgeClass(item)">
                                        {{ formatWhen(item.observedAt) }} — {{ crossDomainPublicationObservationTimelineEntryDomainLabel(item) }} —
                                        {{ item.kind === PublicationObservationTimelineEntryKind.IPFS_PUBLICATION ? 'Published' : item.stateLabel }}
                                    </span>
                                    <p class="form-hint form-hint--neutral">
                                        {{ item.label }}
                                        <template v-if="item.domain === PublicationObservationTimelineDomain.IPFS"> — {{ item.locator }}</template>
                                        <template v-else-if="item.txid"> — txid {{ item.txid }}</template>
                                    </p>
                                    <p v-if="item.kind === PublicationObservationTimelineEntryKind.BITCOIN_CONFIRMATION && item.blockHeight != null" class="form-hint form-hint--neutral">
                                        Block height {{ item.blockHeight }}
                                    </p>
                                    <p v-if="item.reason" class="form-hint form-hint--neutral">{{ item.reason }}</p>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    `
};
