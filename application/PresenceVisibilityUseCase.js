import { EventBus } from '../core/events/EventBus.js';
import { PresenceVisibilityPolicy } from '../core/PresenceVisibilityPolicy.js';
import { isValidPresenceVisibility } from '../core/PresenceVisibility.js';

const POLICY_CHANGED_EVENT = 'PresenceVisibilityPolicyChanged';
const STORAGE_KEY_PREFIX = 'presence-visibility:';

// 0.2.40 — the persistence half of core/PresenceVisibilityPolicy.js,
// one policy per identity, loaded/created/saved through an injected
// StorageProvider — the EXACT same "stable per-owner configuration,
// created once with a safe default, reused after" shape
// application/AvatarProfileUseCase.js already established, and the
// same subscription shape (EventBus / onPolicyChanged) as
// IdentityUseCase.onUserChanged / AvatarProfileUseCase.onProfileChanged
// so UI can react to a policy edit the same way it already reacts to
// login or profile changes.
//
// The default policy — PresenceVisibilityPolicy.default(), i.e. PUBLIC
// with no authorized peers — reproduces EXACTLY 0.2.37/0.2.38's own
// behavior: every existing deployment that never touches this use
// case keeps publishing presence exactly as it always has.
export class PresenceVisibilityUseCase {
    constructor(storageProvider, identityProvider) {
        this._storageProvider = storageProvider;
        this._identityProvider = identityProvider;
        this._eventBus = new EventBus();
    }

    getPolicy() {
        const owner = this._requireCurrentUsername();
        const stored = this._storageProvider.load(STORAGE_KEY_PREFIX + owner);
        if (stored) {
            return PresenceVisibilityPolicy.fromJSON(stored);
        }
        const defaultPolicy = PresenceVisibilityPolicy.default();
        this._storageProvider.save(STORAGE_KEY_PREFIX + owner, defaultPolicy.toJSON());
        return defaultPolicy;
    }

    // Applies a partial update (either or both of visibility/
    // authorizedPeerIdentities) to the current user's policy and
    // persists the result. Never accepts a caller-supplied
    // PresenceVisibilityPolicy wholesale — same reasoning
    // AvatarProfileUseCase.updateProfile() gives: the use case, not
    // the caller, decides what "the current policy plus these edits"
    // means. Throws on an unrecognized visibility value; never throws
    // on authorizedPeerIdentities — anything not a non-blank string is
    // simply dropped (see PresenceVisibilityPolicy._normalizeIdentities).
    updatePolicy({ visibility, authorizedPeerIdentities } = {}) {
        let policy = this.getPolicy();
        const owner = this._requireCurrentUsername();

        if (visibility !== undefined) {
            if (!isValidPresenceVisibility(visibility)) {
                throw new Error(`PresenceVisibilityUseCase: unknown visibility "${visibility}"`);
            }
            policy = policy.withVisibility(visibility);
        }
        if (authorizedPeerIdentities !== undefined) {
            policy = policy.withAuthorizedPeerIdentities(authorizedPeerIdentities);
        }

        this._storageProvider.save(STORAGE_KEY_PREFIX + owner, policy.toJSON());
        this._eventBus.publish(POLICY_CHANGED_EVENT, { policy });
        return policy;
    }

    onPolicyChanged(callback) {
        const subscription = this._eventBus.subscribe(
            POLICY_CHANGED_EVENT,
            ({ policy }) => callback(policy)
        );
        return () => subscription.unsubscribe();
    }

    _requireCurrentUsername() {
        const user = this._identityProvider.currentUser();
        if (!user) {
            throw new Error('PresenceVisibilityUseCase: no user is currently logged in');
        }
        return user.username;
    }
}
