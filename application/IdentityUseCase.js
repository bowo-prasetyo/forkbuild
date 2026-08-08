import { EventBus } from '../core/events/EventBus.js';

const IDENTITY_EVENT = 'IdentityChanged';

// Wraps IdentityProvider to provide a subscription-based interface for
// UI components, mirroring DocumentManager's onStateChanged pattern.
// The underlying provider is exposed via identityUseCase.provider so
// that EditorSession, ForkDocumentUseCase, and CreatePublisherUseCase
// can receive the same shared instance that the UI logs in and out of.
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
        this._eventBus.publish(IDENTITY_EVENT, { user: identity });
        return identity;
    }

    logout() {
        this._identityProvider.logout();
        this._eventBus.publish(IDENTITY_EVENT, { user: null });
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
}
