// The durable identity-level lifecycle state (0.2.67), deliberately kept
// to exactly two values and deliberately kept separate from every other
// "is this identity usable right now" question this codebase already
// answers:
//
//   VaultLock                "Is the private key decrypted in memory
//                             RIGHT NOW?" — transient, never persisted
//                             (identity/VaultLock.js, 0.2.47).
//   AuthenticationSession    "Is this device's owner currently signed
//                             in as this identity?" — transient, but
//                             persisted so it survives a reload
//                             (identity/AuthenticationSession.js, 0.2.46).
//   IdentityLifecycleState   "Has the OWNER of this identity permanently
//                             declared it no longer trustworthy?" —
//                             durable, deliberately never reversible,
//                             and orthogonal to both of the above: a
//                             REVOKED identity can still be
//                             AUTHENTICATED (the app can show you're
//                             "logged in" to it so you can inspect its
//                             revocation record or export it one last
//                             time) and its vault can still UNLOCK (an
//                             already-revoked owner can still prove
//                             possession of the key that revoked it) —
//                             it simply can never sign anything NEW
//                             again. See identity/LocalIdentityProvider.js
//                             #_requireAuthenticatedIdentity() for where
//                             that refusal actually lives, and docs/
//                             Principles.md, "Revocation Is A Signing
//                             Gate, Not A Session Gate" (0.2.67).
//
// ACTIVE is the state of every identity that existed before 0.2.67 —
// see identity/LocalIdentity.js's own default, mirroring how
// `isProtected` defaulted to false in 0.2.47 so no migration was ever
// required to keep loading a pre-existing identity.
export const IdentityLifecycleState = Object.freeze({
    ACTIVE: 'ACTIVE',
    REVOKED: 'REVOKED'
});

export function isValidIdentityLifecycleState(value) {
    return value === IdentityLifecycleState.ACTIVE || value === IdentityLifecycleState.REVOKED;
}
