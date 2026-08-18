import { EventBus } from '../core/events/EventBus.js';
import { AvatarProfileVisibilityPolicy } from '../core/AvatarProfileVisibilityPolicy.js';
import { isValidPresenceVisibility } from '../core/PresenceVisibility.js';

const POLICY_CHANGED_EVENT = 'AvatarProfileVisibilityPolicyChanged';
const STORAGE_KEY_PREFIX = 'profile-visibility:';

// 0.2.58 — the persistence half of core/AvatarProfileVisibilityPolicy.js,
// one policy per identity, loaded/created/saved through an injected
// StorageProvider — the EXACT same "stable per-owner configuration,
// created once with a safe default, reused after" shape
// application/PresenceVisibilityUseCase.js already established for
// presence, and a genuinely SEPARATE storage key
// (`profile-visibility:`, never `presence-visibility:`) so editing one
// never touches the other's persisted state — see docs/Principles.md,
// "Profile Visibility Is Never Presence Visibility" (0.2.54), now true
// on the PERSISTENCE side too, not only the per-peer decision side.
//
// The default policy — AvatarProfileVisibilityPolicy.default(), i.e.
// PUBLIC with no authorized peers — reproduces EXACTLY 0.2.54's own
// behavior: every existing deployment that never touches this use case
// keeps publishing profile advertisements to every authenticated peer
// exactly as it always has.
export class AvatarProfileVisibilityUseCase {
    constructor(storageProvider, identityProvider) {
        this._storageProvider = storageProvider;
        this._identityProvider = identityProvider;
        this._eventBus = new EventBus();
    }

    getPolicy() {
        const owner = this._requireCurrentUsername();
        const stored = this._storageProvider.load(STORAGE_KEY_PREFIX + owner);
        if (stored) {
            return AvatarProfileVisibilityPolicy.fromJSON(stored);
        }
        const defaultPolicy = AvatarProfileVisibilityPolicy.default();
        this._storageProvider.save(STORAGE_KEY_PREFIX + owner, defaultPolicy.toJSON());
        return defaultPolicy;
    }

    // Applies a partial update (either or both of visibility/
    // authorizedPeerIdentities) to the current user's policy and
    // persists the result — same reasoning
    // PresenceVisibilityUseCase.updatePolicy() gives: the use case,
    // not the caller, decides what "the current policy plus these
    // edits" means. Throws on an unrecognized visibility value; never
    // throws on authorizedPeerIdentities.
    updatePolicy({ visibility, authorizedPeerIdentities } = {}) {
        let policy = this.getPolicy();
        const owner = this._requireCurrentUsername();

        if (visibility !== undefined) {
            if (!isValidPresenceVisibility(visibility)) {
                throw new Error(`AvatarProfileVisibilityUseCase: unknown visibility "${visibility}"`);
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
            throw new Error('AvatarProfileVisibilityUseCase: no user is currently logged in');
        }
        return user.username;
    }
}
