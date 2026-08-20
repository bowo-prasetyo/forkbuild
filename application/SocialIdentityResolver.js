// 0.2.79 — Multi-Device Social State Semantics.
//
// The DEFAULT peer-social-identity resolver every social use case
// (application/FriendRelationshipUseCase.js, application/ChatUseCase.js,
// application/VoiceUseCase.js) falls back to when no
// application/DeviceAuthorizationPropagationUseCase.js#resolveConnectionIdentity
// is injected as their `resolveSocialIdentity` collaborator.
//
// Treats every connection exactly as 0.2.57 through 0.2.78 already did:
// the connection's own authenticated key IS the social identity, DIRECT,
// full stop — no device ever resolves to a parent. This exists so every
// pre-0.2.79 caller, and every test that never wires device
// authorization at all, keeps behaving byte-identically; wiring the REAL
// resolver (application/DeviceAuthorizationPropagationUseCase.js#resolveConnectionIdentity)
// is what actually teaches the social layer to recognize an authorized
// device as speaking for its parent identity. See docs/Principles.md,
// "Device Authorization Changes Peer Authority, Never Social Identity."
export function resolveDirectSocialIdentity(connectedPeer) {
    const remote = connectedPeer && connectedPeer.remoteIdentity;
    if (!remote) {
        return null;
    }
    return {
        identityId: remote.identityId,
        publicKey: remote.publicKey,
        algorithm: remote.algorithm,
        mode: 'DIRECT',
        deviceIdentityId: remote.identityId
    };
}
