import { EventBus } from '../core/events/EventBus.js';
import { AvatarProfile } from '../core/AvatarProfile.js';

const AVATAR_PROFILE_EVENT = 'AvatarProfileChanged';
const STORAGE_KEY_PREFIX = 'avatar-profile:';

// 0.2.33 — the persistent-profile half of the Identity/AvatarProfile/
// Presence split (see core/AvatarProfile.js). One profile per
// identity, loaded/created/saved through an injected StorageProvider,
// exactly the way LocalIdentityProvider lazily loads-or-creates a
// signing keypair per username (identity/LocalIdentityProvider.js,
// `_loadOrCreateKeyPair`) — the same "stable per-owner identity,
// created once, reused after" shape, just for appearance instead of a
// keypair.
//
// Mirrors IdentityUseCase's subscription shape (onProfileChanged /
// EventBus) so UI components can react to profile edits the same way
// they already react to login/logout.
export class AvatarProfileUseCase {
    constructor(storageProvider, identityProvider) {
        this._storageProvider = storageProvider;
        this._identityProvider = identityProvider;
        this._eventBus = new EventBus();
    }

    // Loads the current user's AvatarProfile, creating (and
    // persisting) a fresh default one on first access so the SAME
    // avatarId is returned on every subsequent call/session — an
    // avatar's identity must be stable, not re-rolled every time
    // someone asks for it.
    getProfile() {
        const owner = this._requireCurrentUsername();
        const stored = this._storageProvider.load(STORAGE_KEY_PREFIX + owner);
        if (stored) {
            return AvatarProfile.fromJSON(stored);
        }
        const defaultProfile = new AvatarProfile({
            ownerIdentity: owner,
            displayName: this._identityProvider.currentUser().displayName
        });
        this._storageProvider.save(STORAGE_KEY_PREFIX + owner, defaultProfile.toJSON());
        return defaultProfile;
    }

    // Applies a partial update (any of templateId/appearance/
    // displayName) to the current user's profile and persists the
    // result. Never accepts a caller-supplied AvatarProfile wholesale
    // — same reasoning as UpdateDocumentMetadataUseCase not accepting
    // a caller-built DocumentMetadata: the use case, not the caller,
    // decides what "the current profile plus these edits" means.
    updateProfile({ templateId, appearance, displayName } = {}) {
        let profile = this.getProfile();
        if (templateId !== undefined) {
            profile = profile.withTemplateId(templateId);
        }
        if (appearance !== undefined) {
            profile = profile.withAppearance(appearance);
        }
        if (displayName !== undefined) {
            profile = profile.withDisplayName(displayName);
        }
        this._storageProvider.save(STORAGE_KEY_PREFIX + profile.ownerIdentity, profile.toJSON());
        this._eventBus.publish(AVATAR_PROFILE_EVENT, { profile });
        return profile;
    }

    // Returns an unsubscribe function, same shape as
    // IdentityUseCase.onUserChanged.
    onProfileChanged(callback) {
        const subscription = this._eventBus.subscribe(
            AVATAR_PROFILE_EVENT,
            ({ profile }) => callback(profile)
        );
        return () => subscription.unsubscribe();
    }

    _requireCurrentUsername() {
        const user = this._identityProvider.currentUser();
        if (!user) {
            throw new Error('AvatarProfileUseCase: no user is currently logged in');
        }
        return user.username;
    }
}
