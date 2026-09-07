// 0.9.246 — Publication Commentary Authorization Boundary.
//
// 0.9.245 closed the AUTHENTICATION gap: a commentary's author is now
// whichever identity the injected identityProvider currently
// authenticates, never caller-supplied input. Its own header drew the
// line deliberately: "this use case still does not ask, let alone
// answer, 'is Alice allowed to comment on this Publication.'" This file
// is that separate, later question, and only that question.
//
// BEFORE WRITING A SINGLE LINE OF POLICY HERE, this milestone audited
// ForkBuild's existing Publication/identity authorization surface for a
// rule already implied by the shipped system, rather than inventing a
// new one. The audit found:
//
//   * publisher/Publication.js carries no visibility, ownership-gated
//     access, or viewer-permission field of any kind — only
//     `publisherIdentity`, the identity that SIGNED the publication
//     (a provenance fact, not an access grant).
//   * application/ListPublicationsUseCase.js, SearchPublicationsUseCase.js
//     and every discovery/ provider (LocalDiscoveryProvider,
//     PublicationCatalogDiscoveryProvider) list and resolve Publications
//     with no viewer-identity parameter at all — anyone who can reach a
//     DiscoveryProvider can already see every Publication on it.
//   * identity/AuthorizationVerifier.js / LocalAuthorizationVerifier.js
//     answer a different question — is a Publication's own SIGNATURE
//     authentic — never "may identity X interact with Publication Y."
//   * application/WorldAuthorizationService.js answers a different
//     question again — Document EDITING authority for the collaboration
//     arc — and this milestone's own brief is explicit that commentary
//     authorization must NOT be coupled to it: editing a Document and
//     commenting on a Publication are different propositions.
//   * identity/TrustPolicy.js's own AuthorityMode.DISCOVERED is the
//     closest existing precedent for the shape this milestone needs: "no
//     external trust source exists yet... accept any signer... the
//     fallback when no authority is pinned" — a REAL decision point
//     whose current answer is permissive because ForkBuild has not yet
//     defined a narrower rule, not a step that was skipped.
//
// THE CONCLUSION: ForkBuild's Publication/discovery stack is, by
// design, openly readable — the entire point of publishing, anchoring,
// and decentralized distribution is public reachability, not access
// restriction. There is no existing identity-vs-Publication permission
// relationship to adapt. So this boundary's policy, mirroring
// TrustPolicy's DISCOVERED default exactly, is:
//
//   ANY authenticated identity may comment on ANY Publication that
//   actually exists (resolves through the existing Publication
//   discovery infrastructure). A publicationId that does not resolve —
//   unknown, mistyped, or naming a Publication this discoveryProvider
//   has never heard of — is denied.
//
// This is a real, enforced, testable authorization decision — not a
// no-op — and it comes from REUSING the exact existing dependency shape
// application/ResolvePublicationUseCase.js, PlacePublicationUseCase.js,
// CreatePublicationSnapshotPlacementUseCase.js and
// CreateExternalSnapshotPlacementUseCase.js already depend on
// (`discoveryProvider.findById(publicationId)`, returning the
// Publication or `null`) rather than a new, duplicated permission table
// living inside commentary code. See tests/
// PublicationCommentaryAuthorization.test.js Section H for the proof.
//
// DELIBERATELY NOT ADDED, per this milestone's own brief: no
// `PublicationCommentaryPermission` ALLOW/DENY descriptor, no
// `canComment` on `PublicationCommentary`, no `ownerId`, no trust
// score, no friendship/participant requirement, no moderation or
// visibility state, no roles, no persisted ACL. If a later milestone
// decides commentary needs a narrower policy than "the Publication
// exists," that is a separate, deliberate product decision — this
// class's `execute()` is the one place it would be implemented, so
// every caller (today just AddPublicationCommentaryUseCase) picks up
// the stricter rule automatically, without a redesign.
export class CanCommentOnPublicationUseCase {
    constructor(discoveryProvider) {
        if (!discoveryProvider || typeof discoveryProvider.findById !== 'function') {
            throw new Error('CanCommentOnPublicationUseCase: a discoveryProvider is required');
        }
        this._discoveryProvider = discoveryProvider;
    }

    // Answers exactly one question: given an authenticated identityId and
    // a publicationId, may that identity create commentary on that
    // Publication? Returns a plain boolean — `false` is an ordinary,
    // expected outcome, never thrown as an error. Only a malformed call
    // (no identityId — i.e. called before authentication ever resolved
    // one) throws, since that indicates a caller skipped the
    // authentication step this boundary always assumes already ran.
    execute({ identityId, publicationId } = {}) {
        if (!identityId || typeof identityId !== 'string') {
            throw new Error('CanCommentOnPublicationUseCase: identityId is required — authenticate before authorizing');
        }
        if (!publicationId || typeof publicationId !== 'string') {
            return false;
        }
        const publication = this._discoveryProvider.findById(publicationId);
        return !!publication;
    }
}
