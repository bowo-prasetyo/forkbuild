import { describePublicationReplicaKnowledge } from './PublicationReplicaKnowledgeView.js';
import { describeAnchorKnowledge } from './PublicationAnchorKnowledgeView.js';
import { deriveAnchorVerificationLifecycle } from './PublicationAnchorVerificationLifecycleView.js';
import { AnchorVerificationLifecycleState } from './AnchorVerificationLifecycleState.js';
import { describePlacementKnowledge } from './PublicationSnapshotPlacementKnowledgeView.js';
import { deriveSnapshotPlacementLifecycle } from './SnapshotPlacementLifecycleView.js';
import { SnapshotPlacementLifecycleState } from './SnapshotPlacementLifecycleState.js';

// 0.8.31 — Replica Knowledge Provenance & Synchronization Inspection.
//
// application/PublicationReplicaKnowledgeView.js (0.8.28) already answers
// "does this replica know the publication, and how many evidence/
// placement claims does it know, and do they agree with themselves." What
// it deliberately never does — per its own header — is descend to a
// SINGLE claim: how did THIS replica come to know THIS one anchor, and
// what, if anything, has this replica separately established about it
// right now. Those two facts have existed since 0.8.17/0.8.24 (acquisition
// provenance) and 0.8.12/0.8.26 (verification/resolution lifecycle), but
// no view has ever placed them ALONGSIDE a claim inventory rather than
// buried one card at a time behind "Inspect Evidence"/"Inspect Placement."
// This file is the smallest possible answer:
//
//   describePublicationReplicaKnowledge()          (0.8.28, UNCHANGED)
//              │
//              ▼
//   describePublicationReplicaKnowledgeDetail()     (THIS FILE)
//              │
//              ▼
//     { publicationId, publicationKnown,
//       evidence:   { count, relationship, claims: [...] },
//       placements: { count, relationship, claims: [...] } }
//
// Every `claims` entry is itself a SYNTHESIS of two already-existing pure
// views, never a new derivation: application/PublicationAnchorKnowledgeView
// .js#describeAnchorKnowledge() (0.8.17, unchanged) for acquisition/
// first-seen, and application/PublicationAnchorVerificationLifecycleView.js
// #deriveAnchorVerificationLifecycle() (0.8.12, unchanged) for the current
// observation state — the placement side reuses application/
// PublicationSnapshotPlacementKnowledgeView.js/application/
// SnapshotPlacementLifecycleView.js, unchanged, the identical way one axis
// over. This file introduces no new fact about a claim that did not
// already exist somewhere in this codebase; it only ever places two
// existing facts on the SAME row.
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE, IDENTICAL IN SPIRIT TO
// application/PublicationDecentralizationView.js's OWN (0.8.27): this is
// an INVENTORY, never an ADJUDICATOR. It never imports a catalog, a
// verifier, a resolver, a knowledge store, or the network — every fact it
// reports was already computed by its caller and handed in as a plain
// argument, exactly like application/PublicationReplicaKnowledgeView.js's
// own `hasPublication`. And it NEVER emits a field that reads as a
// verdict about ONE claim relative to another — no `confidence`, no
// `trust`, no `score`, no `preferredClaim`, no `bestPlacement`, no
// `reputation`, no `authority`, no `completeness`. Acquisition provenance
// (application/AnchorAcquisitionKind.js's own 0.8.17 rule, restated one
// more time here because this is the first file to show every claim's
// provenance SIDE BY SIDE, exactly the shape a ranking would be easiest
// to smuggle into) says only how a claim was learned, never how much it
// should be believed. See docs/Principles.md, "Replica Knowledge Explains
// What Is Known And How It Was Acquired; It Does Not Judge What Should Be
// Trusted (0.8.31)."
//
// NO PEER IDENTITY, ANYWHERE. `acquisitionLabel` is always one of
// application/PublicationAnchorKnowledgeView.js's/application/
// PublicationSnapshotPlacementKnowledgeView.js's own three understated
// strings ("Learned locally"/"Learned via package import"/"Learned via
// peer exchange") — never "Learned from Alice," even though the
// synchronization machinery that supplied a PEER claim (application/
// PublicationKnowledgeSynchronizationCoordinator.js, 0.8.30) knows
// perfectly well which authenticated peer answered. Naming a peer here
// would invite exactly the inference this codebase has refused since
// 0.8.17: "Alice supplied this claim, therefore Alice is trustworthy,
// therefore the claim is trustworthy." This file has no parameter capable
// of receiving a peer identity at all, so there is nothing for a future
// caller to accidentally thread through.
//
// LIFECYCLE STAYS EPHEMERAL, PROVENANCE STAYS DURABLE — the identical
// split application/PublicationDecentralizationView.js's own header
// already draws, now visible on the SAME row instead of two separate
// files: `acquisitionKind`/`firstSeenAt` never change once a claim is
// first learned (application/LocalAnchorKnowledgeStore.js's own
// FIRST-SEEN-WINS), while `verificationState`/`resolutionState` reflect
// only the MOST RECENT observation THIS SESSION and reset to
// NOT_VERIFIED/NOT_RESOLVED on every fresh page load — restarting a
// replica, or re-deriving this view from scratch, never rewrites the
// former and never persists the latter. See tests/
// PublicationReplicaKnowledgeDetailView.test.js's own flagship section for
// the direct proof that these two axes vary completely independently of
// each other and of the claim set itself.
//
// Pure and stateless, exactly like every other file in this lineage: no
// constructor, no injected dependency, no caching. Calling this twice
// with byte-identical arguments returns a byte-identical result.
export function describePublicationReplicaKnowledgeDetail({
    publicationId,
    hasPublication = false,
    evidenceConvergenceView = null,
    placementConvergenceView = null,
    evidenceClaims = [],
    placementClaims = []
} = {}) {
    const knowledge = describePublicationReplicaKnowledge({
        publicationId,
        hasPublication,
        evidenceConvergenceView,
        placementConvergenceView
    });
    return {
        publicationId: knowledge.publicationId,
        publicationKnown: knowledge.hasPublication,
        evidence: {
            count: knowledge.evidence.anchorCount,
            relationship: knowledge.evidence.relationship,
            claims: describeEvidenceClaims(evidenceClaims)
        },
        placements: {
            count: knowledge.placements.placementCount,
            relationship: knowledge.placements.relationship,
            claims: describePlacementClaims(placementClaims)
        }
    };
}

// `claims`: a plain array of `{ anchorId, knowledgeRecord, verificationObservations }`
// — `knowledgeRecord` an application/AnchorKnowledgeRecord.js instance (or
// null/absent, an entirely ordinary result — see application/
// PublicationAnchorKnowledgeView.js#describeAnchorKnowledge()'s own
// header), `verificationObservations` the ORDERED list application/
// PublicationAnchorVerificationLifecycleView.js#
// deriveAnchorVerificationLifecycle() already expects (or empty/absent,
// meaning "never checked this session"). Never touches a store or a
// catalog itself — a caller (ordinarily ui/views/
// DecentralizedPublicationsView.js) already read both before calling
// this file, the identical division of labor application/
// PublicationReplicaKnowledgeView.js's own `hasPublication` already holds.
function describeEvidenceClaims(claims) {
    return (Array.isArray(claims) ? claims : []).map((claim) => {
        const knowledge = describeAnchorKnowledge(claim && claim.knowledgeRecord);
        const lifecycle = deriveAnchorVerificationLifecycle(claim && claim.verificationObservations);
        return {
            anchorId: claim && claim.anchorId,
            acquisitionKind: knowledge.acquisitionKind,
            acquisitionLabel: knowledge.acquisitionLabel,
            firstSeenAt: knowledge.firstSeenAt,
            verificationState: lifecycle.state,
            verificationStateLabel: VERIFICATION_STATE_LABELS[lifecycle.state] || VERIFICATION_STATE_LABELS[AnchorVerificationLifecycleState.NOT_VERIFIED]
        };
    });
}

// The placement-side sibling immediately above, one axis over.
function describePlacementClaims(claims) {
    return (Array.isArray(claims) ? claims : []).map((claim) => {
        const knowledge = describePlacementKnowledge(claim && claim.knowledgeRecord);
        const lifecycle = deriveSnapshotPlacementLifecycle(claim && claim.resolutionObservations);
        return {
            placementId: claim && claim.placementId,
            acquisitionKind: knowledge.acquisitionKind,
            acquisitionLabel: knowledge.acquisitionLabel,
            firstSeenAt: knowledge.firstSeenAt,
            resolutionState: lifecycle.state,
            resolutionStateLabel: RESOLUTION_STATE_LABELS[lifecycle.state] || RESOLUTION_STATE_LABELS[SnapshotPlacementLifecycleState.NOT_RESOLVED]
        };
    });
}

// Deliberately understated, exactly like application/
// PublicationAnchorKnowledgeView.js's own ACQUISITION_LABELS immediately
// above it in this file's own import list — "currently unavailable,"
// never "invalid" or "revoked," mirroring application/
// PublicationAnchorVerificationLifecycleView.js#
// describeAnchorVerificationLifecycleNote()'s own wording one level up.
const VERIFICATION_STATE_LABELS = Object.freeze({
    [AnchorVerificationLifecycleState.NOT_VERIFIED]: 'Not yet verified',
    [AnchorVerificationLifecycleState.VERIFIED]: 'Verified',
    [AnchorVerificationLifecycleState.UNVERIFIED_PROOF]: 'Verified (proof unverified)',
    [AnchorVerificationLifecycleState.UNAVAILABLE]: 'Currently unavailable',
    [AnchorVerificationLifecycleState.REJECTED]: 'Rejected'
});

const RESOLUTION_STATE_LABELS = Object.freeze({
    [SnapshotPlacementLifecycleState.NOT_RESOLVED]: 'Not yet resolved',
    [SnapshotPlacementLifecycleState.RESOLVED]: 'Resolved',
    [SnapshotPlacementLifecycleState.UNAVAILABLE]: 'Currently unavailable',
    [SnapshotPlacementLifecycleState.HASH_MISMATCH]: 'Content hash mismatch',
    [SnapshotPlacementLifecycleState.INVALID_PLACEMENT]: 'Invalid placement'
});

// A plain, non-judgmental tally of how many of this dimension's claims
// were learned by each application/AnchorAcquisitionKind.js/application/
// PlacementAcquisitionKind.js value — "2 learned via peer exchange, 1
// learned via package import," never "2 out of 3 claims are trustworthy."
// Works identically over either `evidence.claims` or `placements.claims`
// above, since both share the same `acquisitionKind` vocabulary. A claim
// with no local knowledge record at all (`acquisitionKind: null`) is
// simply not counted under any kind — it is neither hidden nor invented a
// bucket of its own, since "this replica has no record of how it learned
// this" is not itself an acquisition kind.
export function describeAcquisitionBreakdown(claims) {
    const counts = { local: 0, package: 0, peer: 0 };
    for (const claim of (Array.isArray(claims) ? claims : [])) {
        if (claim && Object.prototype.hasOwnProperty.call(counts, claim.acquisitionKind)) {
            counts[claim.acquisitionKind] += 1;
        }
    }
    return counts;
}
