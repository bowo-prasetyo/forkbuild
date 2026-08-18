import { EventBus } from '../core/events/EventBus.js';

const IDENTITY_EVENT = 'IdentityChanged';
const SESSION_EVENT = 'AuthenticationSessionChanged';

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
export class IdentityUseCase {
    constructor(identityProvider) {
        this._identityProvider = identityProvider;
        this._eventBus = new EventBus();
    }

    get provider() {
        return this._identityProvider;
    }

    login(username) {
        const identity = this._identityProvider.login(username);
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
    createIdentity(label) {
        return this._identityProvider.createLocalIdentity(label);
    }

    listIdentities() {
        return this._identityProvider.listLocalIdentities();
    }

    // --- 0.2.46: authentication session --------------------------------
    authenticate(identityId) {
        const session = this._identityProvider.authenticate(identityId);
        this._publishChange();
        return session;
    }

    endSession() {
        this._identityProvider.endSession();
        this._publishChange();
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

    _publishChange() {
        this._eventBus.publish(IDENTITY_EVENT, { user: this.currentUser() });
        this._eventBus.publish(SESSION_EVENT, { session: this.currentSession() });
    }
}
