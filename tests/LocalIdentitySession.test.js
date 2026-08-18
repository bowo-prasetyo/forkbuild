import { LocalIdentity } from '../identity/LocalIdentity.js';
import { AuthenticationSession, AuthenticationState } from '../identity/AuthenticationSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { Signature, SignatureType } from '../core/Signature.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.2.46 — Local Identity & Authentication Session.
//
// Closes the gap 0.2.16 left open: a "logged in" username silently
// derived a cryptographic key from whatever string was typed, so
// "login" and "identity" were the same event by construction. This
// milestone makes the cryptographic identity durable and inspectable on
// its own (LocalIdentity — a key this device holds) and separates it
// from whether it's currently in use (AuthenticationSession) — and
// proves the entire pre-existing 0.1.21/0.2.16 surface
// (login/logout/currentUser/sign/getSigningIdentity/signCanonical)
// keeps behaving identically on top of the new model.

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function assertThrows(fn, expectedMessage, message) {
    try {
        fn();
        assert(false, message);
    } catch (e) {
        assert(e.message.includes(expectedMessage), `${message}: ${e.message}`);
    }
}

// ---------------------------------------------------------------------
// 1. LocalIdentity — pure data, validated construction
// ---------------------------------------------------------------------
{
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity('Alice');

    assert(identity instanceof LocalIdentity, 'createLocalIdentity returns a LocalIdentity');
    assert(identity.identityId.startsWith('did:key:z'), 'identityId is a did:key');
    assert(identity.label === 'Alice', 'label is preserved (trimmed)');
    assert(identity.algorithm === 'Ed25519', 'algorithm defaults to Ed25519');
    assert(identity.createdAt instanceof Date, 'createdAt is a Date');

    const restored = LocalIdentity.fromJSON(identity.toJSON());
    assert(restored.identityId === identity.identityId, 'round-trips through toJSON/fromJSON');

    assertThrows(() => new LocalIdentity({ publicKey: identity.publicKey, label: 'x' }),
        'identityId is required', 'identityId is required');
    assertThrows(() => new LocalIdentity({ identityId: identity.identityId, label: 'x' }),
        'publicKey is required', 'publicKey is required');
    assertThrows(() => new LocalIdentity({ identityId: identity.identityId, publicKey: identity.publicKey }),
        'label is required', 'label is required');
    assertThrows(() => new LocalIdentity({ identityId: identity.identityId, publicKey: 'deadbeef', label: 'x' }),
        'identityId does not match publicKey', 'a forged identityId/publicKey pairing is rejected');
    console.log('✓ LocalIdentity: validated pure data, round-trips');
}

// ---------------------------------------------------------------------
// 2. Creating an identity does not, by itself, start a session
// ---------------------------------------------------------------------
{
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity('Alice');

    assert(provider.isAuthenticated() === false, 'creating an identity does not authenticate a session');
    assert(provider.currentUser() === null, 'currentUser() is null with no active session');
    assert(provider.currentSession().state === AuthenticationState.ANONYMOUS, 'session starts ANONYMOUS');
    assertThrows(() => provider.getSigningIdentity(), 'no active authentication session',
        'cannot sign before authenticating, even though the identity exists');

    provider.authenticate(identity.identityId);
    assert(provider.isAuthenticated() === true, 'authenticate() starts the session');
    assert(provider.currentSession().identityId === identity.identityId, 'session names the identity');
    assert(provider.currentSession().authenticatedAt instanceof Date, 'session records when it was authenticated');
    assert(provider.currentUser().username === 'Alice', 'currentUser() derives from the session, not a separate record');
    console.log('✓ create/authenticate: identity existence and session are independent facts');
}

// ---------------------------------------------------------------------
// 3. A device can hold multiple identities; switching sessions is
//    unlocking a different one, never overwriting or deleting a key
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const provider = new LocalIdentityProvider(storage);
    const work = provider.createLocalIdentity('Work Account');
    const personal = provider.createLocalIdentity('Personal Account');

    assert(work.identityId !== personal.identityId, 'two identities on one device get distinct keys');
    const listed = provider.listLocalIdentities();
    assert(listed.length === 2, 'both identities are listed');
    assert(listed.every((i) => !('seed' in i)), 'listing never exposes private key material');

    provider.authenticate(work.identityId);
    assert(provider.getSigningIdentity().id === work.identityId, 'signing identity matches the authenticated session');

    provider.authenticate(personal.identityId);
    assert(provider.getSigningIdentity().id === personal.identityId, 'switching sessions switches which key signs');
    assert(provider.listLocalIdentities().length === 2, 'switching sessions never deletes the other identity');

    assertThrows(() => provider.authenticate('did:key:zNoSuchIdentity'), 'no local identity with id',
        'cannot authenticate onto an identity this device never created');
    console.log('✓ multi-identity device: independent keys, session switch never destroys state');
}

// ---------------------------------------------------------------------
// 4. Logging out ends the session but keeps the identity and its key
// ---------------------------------------------------------------------
{
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity('Alice');
    provider.authenticate(identity.identityId);
    const signingId = provider.getSigningIdentity().id;

    provider.endSession();
    assert(provider.isAuthenticated() === false, 'endSession() clears the active session');
    assert(provider.currentUser() === null, 'currentUser() reflects the cleared session');
    assert(provider.listLocalIdentities().length === 1, 'the identity itself is untouched by logout');
    assertThrows(() => provider.getSigningIdentity(), 'no active authentication session',
        'signing is refused once the session ends');

    provider.authenticate(identity.identityId);
    assert(provider.getSigningIdentity().id === signingId, 'logging back in unlocks the SAME identity, not a new one');
    console.log('✓ logout: session ends, identity and key survive, re-authenticating recovers the same identity');
}

// ---------------------------------------------------------------------
// 5. Backward compatibility: the 0.1.21/0.2.16 login(username) surface
//    keeps its exact signature and observable behavior for every
//    existing caller (application/ use cases, ~45 pre-existing tests).
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const provider = new LocalIdentityProvider(storage);

    const alice1 = provider.login('alice');
    const key1 = provider.getSigningIdentity().id;
    assert(alice1.username === 'alice' && alice1.displayName === 'alice', 'login() returns the legacy Identity shape');
    assert(provider.currentUser().username === 'alice', 'currentUser() reflects the legacy login call');
    assert(provider.isAuthenticated() === true, 'login() authenticates a real session under the hood');

    provider.logout();
    assert(provider.currentUser() === null, 'logout() clears currentUser()');
    assertThrows(() => provider.sign({}), 'cannot sign, no user logged in', 'legacy sign() still refuses when logged out');

    provider.login('alice');
    const key2 = provider.getSigningIdentity().id;
    assert(key1 === key2, 'the same typed username resolves back to the SAME LocalIdentity, not a new key');
    assert(provider.listLocalIdentities().length === 1, 'logging in with a known label reuses its identity, never duplicates it');

    provider.login('bob');
    assert(provider.listLocalIdentities().length === 2, 'a new label creates a new identity, exactly like 0.2.16 did');
    assert(provider.getSigningIdentity().id !== key1, 'bob and alice hold distinct keys');
    console.log('✓ backward compatibility: login(username)/logout()/currentUser()/sign() unchanged in behavior');
}

// ---------------------------------------------------------------------
// 6. Signing end-to-end through the session-gated surface — proves
//    getSigningIdentity()/signCanonical() genuinely route through
//    AuthenticationSession, not just through currentUser() coincidentally.
// ---------------------------------------------------------------------
{
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity('Alice');
    provider.authenticate(identity.identityId);

    const descriptor = {
        type: SignatureType.PLACEMENT_RECORD,
        id: 'session-test',
        revision: 1,
        payload: { hello: 'world' }
    };
    const signature = provider.signCanonical(descriptor);
    assert(signature instanceof Signature, 'signCanonical() returns a real Signature');
    assert(signature.signer === identity.identityId, 'the signature names the authenticated identity');

    const verifier = new LocalAuthorizationVerifier();
    const result = verifier.verifyDescriptor(descriptor, signature, provider.getSigningIdentity().toJSON());
    assert(result.valid === true, 'the signature verifies against the authenticated identity');

    provider.endSession();
    assertThrows(() => provider.signCanonical(descriptor), 'no active authentication session',
        'signCanonical() is refused once the session ends, even though the key still exists on disk');
    console.log('✓ signing is gated by AuthenticationSession end-to-end, verified against a real signature');
}

// ---------------------------------------------------------------------
// 7. AuthenticationSession — pure data invariants
// ---------------------------------------------------------------------
{
    const anon = AuthenticationSession.anonymous();
    assert(anon.isAuthenticated === false, 'anonymous() is not authenticated');
    assert(anon.identityId === null, 'anonymous() carries no identityId');

    const auth = AuthenticationSession.authenticated('did:key:zTest', new Date('2026-01-01T00:00:00Z'));
    assert(auth.isAuthenticated === true, 'authenticated() is authenticated');
    assert(auth.toJSON().state === AuthenticationState.AUTHENTICATED, 'toJSON reports AUTHENTICATED');

    const restored = AuthenticationSession.fromJSON(auth.toJSON());
    assert(restored.identityId === auth.identityId && restored.isAuthenticated, 'round-trips through toJSON/fromJSON');
    assert(AuthenticationSession.fromJSON(null).isAuthenticated === false, 'fromJSON(null) is a safe anonymous default');

    assertThrows(() => new AuthenticationSession({ state: AuthenticationState.AUTHENTICATED }),
        'requires an identityId', 'an AUTHENTICATED session without an identityId is invalid, by construction');
    console.log('✓ AuthenticationSession: pure data invariants hold');
}

console.log('\nAll local identity/session tests passed.');
