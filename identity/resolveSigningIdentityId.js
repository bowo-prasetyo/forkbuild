// 0.2.95 — World Editing Authorization Foundation.
//
// The one place a did:key identityId is opportunistically read off an
// IdentityProvider for attribution purposes — used by every site that
// stamps DocumentMetadata.authorIdentityId at document-creation time
// (application/CreateDocumentManagerUseCase.js, ForkDocumentUseCase.js,
// ForkPublishedWorldUseCase.js, ForkStructureUseCase.js), so the same
// tolerant lookup logic exists exactly once rather than four times.
//
// Deliberately tolerant, mirroring how every one of those call sites
// already treats `currentUser()`: not every IdentityProvider implements
// the 0.2.16 cryptographic surface (getSigningIdentity() throws
// "must be implemented by a subclass" on the base class, and
// LocalIdentityProvider's own override throws when nobody is
// authenticated — see identity/LocalIdentityProvider.js#
// _requireAuthenticatedIdentity()) — either case degrades to `null`
// here, never a thrown error a document-creation flow would have to
// catch itself.
export function resolveSigningIdentityId(identityProvider) {
    if (!identityProvider || typeof identityProvider.getSigningIdentity !== 'function') {
        return null;
    }
    try {
        const signingIdentity = identityProvider.getSigningIdentity();
        return signingIdentity ? signingIdentity.id : null;
    } catch {
        return null;
    }
}
