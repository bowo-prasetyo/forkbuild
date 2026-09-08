// 0.9.293 — Decentralized Role Provider Preference Boundary.
//
// The closed vocabulary this milestone promotes out of test-only status.
// `tests/DecentralizedSubstrateCapabilityMatrixAudit.test.js` (0.9.292)
// froze these same three names as AUDIT-LOCAL constants on purpose — its
// own header explains why a new production module would have been
// premature THEN: "this milestone's own brief is a capability AUDIT — it
// exists to find out whether configuration is warranted, not to build
// it." That audit's own Section J verdict named the condition under
// which promotion becomes warranted — real, uniform, per-role capability
// already exists (Section B's matrix), already composed independently
// per role in shipped code (Section D), already configuration-keyed for
// two of the three roles (Section F) — and this milestone is that
// promotion, nothing more. See docs/Roadmap.md, "0.9.293 — Decentralized
// Role Provider Preference Boundary."
//
// Same `Object.freeze` + `isValid*` pattern `core/PresenceVisibility.js`
// and `core/AvatarInteractionKind.js` already establish — a role is
// WHERE a provider participates in Publication distribution, never WHICH
// provider. "Network" was rejected by name at 0.9.292 (Section A: the
// Announcement & Discovery role alone already has three non-
// interchangeable production shapes) — a role names a QUESTION a
// provider answers, not a wire the provider speaks.
//
//   ANNOUNCEMENT_AND_DISCOVERY — "where can a rumor of this Publication's
//       material be found" (application/DecentralizedWorldDiscoveryQuery.js's
//       own DecentralizedDiscoveryQueryService shape, and its Nostr/
//       Arweave/Snapshot variants — 0.9.292 Section A/B).
//   CONTENT — "where are this Publication's actual bytes retrievable
//       from" (content/ContentStore.js and its IPFS/Arweave/Local
//       implementations — 0.9.292 Section B).
//   PROOF_AND_ANCHORING — "what external system can verify a claimed
//       anchor" (anchoring/ProofVerifier.js and its Bitcoin
//       implementation — 0.9.292 Section B).
//
// This file names the vocabulary ONLY. It never imports, constructs, or
// even mentions by name a concrete provider (Nostr/IPFS/Bitcoin/Base/
// Arweave) — see core/RoleProviderPreference.js, the sibling file this
// vocabulary exists for, for the full "why no provider imports" reasoning.
export const RoleProviderRole = Object.freeze({
    ANNOUNCEMENT_AND_DISCOVERY: 'ANNOUNCEMENT_AND_DISCOVERY',
    CONTENT: 'CONTENT',
    PROOF_AND_ANCHORING: 'PROOF_AND_ANCHORING'
});

export function isValidRoleProviderRole(value) {
    return Object.values(RoleProviderRole).includes(value);
}
