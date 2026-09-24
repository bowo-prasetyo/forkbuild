import { WorldEncounterMaterialLoadStatus } from './WorldEncounterMaterialLoading.js';
import { WorldEncounterMaterialVerificationStatus } from './WorldEncounterMaterialVerification.js';

// 0.9.519 — Publication Evidence & Trust Experience Product Reassessment,
// Section A/H.
//
// application/worldEncounter/WorldEncounterMaterialInspection.js's own header draws its
// scope boundary explicitly: "Any UI, panel, or rendering technology
// choice... rendering it is separate work — ui/components/
// WorldEncounterCanvas.js." That rendering work shipped (0.9.39) and, until
// this file, consisted of exactly two raw interpolations in that
// component's own template:
//
//   <dd>{{ materialInspection.loading.status }}</dd>       (Material)
//   <dd>{{ materialInspection.verification.status }}</dd>  (Verification)
//
// — the bare `WorldEncounterMaterialLoadStatus`/
// `WorldEncounterMaterialVerificationStatus` enum constants themselves
// ('AVAILABLE'/'UNAVAILABLE', 'UNVERIFIABLE'/'VERIFIED'/'REJECTED'),
// rendered directly to a Wanderer with no humanizing pass at all. Every
// comparable surface in this codebase routes its own status through a
// small, pure, presentation-only view first — application/
// PublicationResolutionView.js#describePublicationOutcome(), application/
// PublicationEvidenceView.js#describeVerificationOutcome(), application/
// IpfsPublicationContentVerificationView.js#
// describeIpfsPublicationContentVerificationStateLabel() — and this
// component's own immediately adjacent "Choose Source"/"Choose Location"
// panels never render EITHER of their own analogous `selectionOutcome
// .status`/`decentralizedLeadOutcome.status` values as visible text at
// all; both are branched into hand-written sentences instead. The Material/
// Verification panel was the one place that discipline had not yet
// reached. This file is that missing view, and only that.
//
// THE WORD "VERIFIED" IS THE CONCRETE RISK THIS FILE EXISTS TO CLOSE.
// application/ipfs/IpfsPublicationContentVerificationView.js's own header states
// the rule this file inherits verbatim, for a different boundary: "NEVER
// 'VERIFIED,' 'TRUSTED,' 'SAFE,' 'PERMANENT,' OR 'GUARANTEED.' A hash match
// is an observation, not a verdict." application/
// WorldEncounterMaterialVerification.js's own header is equally explicit
// about what its own `VERIFIED` status actually means: "the injected
// verifier's own `verifyIdentity()` returned exactly `true`: it actively
// confirmed the material corresponds to `resolvedSelection`" — an IDENTITY
// correspondence between the retrieved bytes and the selected encounter,
// never authorship, ownership, or general trustworthiness (see that file's
// own "no vocabulary for... do I trust this publisher"). Rendering the bare
// word "VERIFIED" on screen, unqualified, invites exactly the stronger
// reading docs/Principles.md warns against across this whole codebase — see
// "Known Evidence Is Not Verified Evidence, And Verified Evidence Is Not
// Authority (0.8.3)," continued here for a different boundary. The labels
// below describe WHAT was checked (correspondence to the selected
// encounter) rather than asserting a verdict about the material itself.
//
// PURE AND READ-ONLY, MIRRORING EVERY VIEW FILE IN THIS FAMILY. No network
// access, no mutation, no history of its own; calling either function twice
// with the same input returns the same result. Neither function invents a
// fourth status or collapses the three/two real ones — an unrecognized
// status (there is none today) falls through to the raw value itself,
// never a fabricated label, exactly like every other label map in this
// codebase (STORAGE_TYPE_LABELS, ANCHOR_TYPE_LABELS, PROVIDER_OPTION_LABELS)
// degrades an unknown key.
const LOAD_STATUS_LABELS = {
    [WorldEncounterMaterialLoadStatus.AVAILABLE]: 'Found',
    [WorldEncounterMaterialLoadStatus.UNAVAILABLE]: 'Not found'
};

// UNVERIFIABLE covers three different underlying reasons — no verifier was
// injected, the material itself was never loaded, or an injected verifier
// abstained — application/worldEncounter/WorldEncounterMaterialVerification.js's own
// header is explicit that none of those is distinguished from the others
// at that boundary ("this material's correspondence to the selected
// encounter simply was never established, one way or the other"). This
// label stays equally honest about that single, undifferentiated meaning,
// rather than guessing at which of the three actually happened.
const VERIFICATION_STATUS_LABELS = {
    [WorldEncounterMaterialVerificationStatus.UNVERIFIABLE]: 'Not independently checked',
    [WorldEncounterMaterialVerificationStatus.VERIFIED]: 'Confirmed to match the selected encounter',
    [WorldEncounterMaterialVerificationStatus.REJECTED]: 'Does not match the selected encounter'
};

export function describeWorldEncounterMaterialLoadStatusLabel(status) {
    return LOAD_STATUS_LABELS[status] || status || null;
}

export function describeWorldEncounterMaterialVerificationStatusLabel(status) {
    return VERIFICATION_STATUS_LABELS[status] || status || null;
}
