import { EventBus } from '../core/events/EventBus.js';

const IDENTITY_EVENT = 'IdentityChanged';
const SESSION_EVENT = 'AuthenticationSessionChanged';
const VAULT_LOCK_EVENT = 'VaultLockChanged';

// Wraps IdentityProvider to provide a subscription-based interface for
// UI components, mirroring DocumentManager's onStateChanged pattern.
// The underlying provider is exposed via identityUseCase.provider so
// that EditorSession, ForkDocumentUseCase, and CreatePublisherUseCase
// can receive the same shared instance that the UI logs in and out of.
//
// 0.2.46 adds the identity/session surface alongside the unchanged
// 0.1.21 login()/logout()/currentUser() methods: createIdentity() and
// listIdentities() answer "which identities does this device hold?",
// authenticate()/endSession()/currentSession() answer "is one of them
// in use right now?" Both surfaces publish through the SAME two event
// types other UI already relies on staying in sync — every path that
// changes who's logged in (legacy login/logout, or the new
// authenticate/endSession) fires both IdentityChanged and
// AuthenticationSessionChanged, so a component can subscribe to
// whichever question it actually cares about.
//
// 0.2.47 adds a THIRD, independent event — VaultLockChanged — for the
// fourth concept identity/VaultLock.js introduces: whether a protected
// identity's key is currently decrypted in memory. This deliberately
// does NOT ride along on IdentityChanged/AuthenticationSessionChanged
// the way login/logout do: a vault can lock (idle timeout, an explicit
// lock() call) or unlock without who's-authenticated changing at all,
// and a UI that only listened for the other two events would miss it.
export class IdentityUseCase {
    constructor(identityProvider) {
        this._identityProvider = identityProvider;
        this._eventBus = new EventBus();
    }

    get provider() {
        return this._identityProvider;
    }

    login(username, passphrase = null) {
        const identity = this._identityProvider.login(username, passphrase);
        this._publishChange();
        return identity;
    }

    logout() {
        this._identityProvider.logout();
        this._publishChange();
    }

    currentUser() {
        return this._identityProvider.currentUser();
    }

    // Returns an unsubscribe function.
    onUserChanged(callback) {
        const subscription = this._eventBus.subscribe(
            IDENTITY_EVENT,
            ({ user }) => callback(user)
        );
        return () => subscription.unsubscribe();
    }

    // --- 0.2.46: identity lifecycle ------------------------------------
    createIdentity(label, passphrase = null) {
        return this._identityProvider.createLocalIdentity(label, passphrase);
    }

    listIdentities() {
        return this._identityProvider.listLocalIdentities();
    }

    // --- 0.2.46: authentication session --------------------------------
    authenticate(identityId, passphrase = null) {
        const session = this._identityProvider.authenticate(identityId, passphrase);
        this._publishChange();
        this._publishLockChange(identityId);
        return session;
    }

    endSession() {
        const endingIdentityId = this.currentSession().identityId;
        this._identityProvider.endSession();
        this._publishChange();
        if (endingIdentityId) {
            this._publishLockChange(endingIdentityId);
        }
    }

    currentSession() {
        return this._identityProvider.currentSession();
    }

    isAuthenticated() {
        return this._identityProvider.isAuthenticated();
    }

    // Returns an unsubscribe function.
    onSessionChanged(callback) {
        const subscription = this._eventBus.subscribe(
            SESSION_EVENT,
            ({ session }) => callback(session)
        );
        return () => subscription.unsubscribe();
    }

    // --- 0.2.47: key protection ------------------------------------------
    protectIdentity(identityId, passphrase) {
        const identity = this._identityProvider.protectIdentity(identityId, passphrase);
        this._publishChange();
        this._publishLockChange(identityId);
        return identity;
    }

    unlock(identityId, passphrase) {
        const lock = this._identityProvider.unlock(identityId, passphrase);
        this._publishLockChange(identityId);
        return lock;
    }

    lock(identityId) {
        const lock = this._identityProvider.lock(identityId);
        this._publishLockChange(identityId);
        return lock;
    }

    vaultLock(identityId) {
        return this._identityProvider.vaultLock(identityId);
    }

    isUnlocked(identityId) {
        return this._identityProvider.isUnlocked(identityId);
    }

    // Meant to be called from a UI timer (see ui/components/UserWidget.js)
    // so an idle-expired vault is announced proactively rather than only
    // discovered the next time something tries to sign.
    checkVaultTimeouts() {
        const expired = this._identityProvider.checkVaultTimeouts();
        expired.forEach((identityId) => this._publishLockChange(identityId));
        return expired;
    }

    // Returns an unsubscribe function.
    onVaultLockChanged(callback) {
        const subscription = this._eventBus.subscribe(
            VAULT_LOCK_EVENT,
            ({ identityId, lock }) => callback(identityId, lock)
        );
        return () => subscription.unsubscribe();
    }

    // --- 0.2.48: portable identity export / import ----------------------
    //
    // Thin delegation, exactly like every other method in this file —
    // identity/LocalIdentityProvider.js's exportLocalIdentity()/
    // importLocalIdentity() already do the real work (see its own
    // comment). importIdentity() only fires a change notification when
    // something actually CHANGED (`status === 'IMPORTED'`): an
    // ALREADY_EXISTS result is a pure no-op by design, and neither
    // outcome ever touches currentUser()/currentSession() — importing an
    // identity never authenticates it.
    exportIdentity(identityId, passphrase) {
        return this._identityProvider.exportLocalIdentity(identityId, passphrase);
    }

    importIdentity(pkg, passphrase, label = null) {
        const result = this._identityProvider.importLocalIdentity(pkg, passphrase, { label });
        return result;
    }

    _publishChange() {
        this._eventBus.publish(IDENTITY_EVENT, { user: this.currentUser() });
        this._eventBus.publish(SESSION_EVENT, { session: this.currentSession() });
    }

    _publishLockChange(identityId) {
        this._eventBus.publish(VAULT_LOCK_EVENT, { identityId, lock: this._identityProvider.vaultLock(identityId) });
    }
}
