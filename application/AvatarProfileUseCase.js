import { EventBus } from '../core/events/EventBus.js';
import { AvatarProfile, DEFAULT_AVATAR_TEMPLATE_ID } from '../core/AvatarProfile.js';
import { validateAvatarAppearance } from '../core/AvatarAppearanceValidator.js';

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
//
// 0.2.34 adds a `templateRegistry` dependency and two distinct
// postures around it — see docs/Principles.md, "Validate Strictly On
// Write; Degrade Gracefully On Read":
//   - updateProfile() is the WRITE path: it validates the proposed
//     templateId/appearance against the template's own declared
//     options and THROWS on anything invalid — an unknown template,
//     an unsupported component, a malformed color, an unknown
//     accessory, an oversized appearance object. Nothing invalid is
//     ever persisted.
//   - getEffectiveAvatar() is the READ path: it never throws. If the
//     stored profile somehow references an unknown template (an
//     older client, a template renamed since), or contains appearance
//     fields that no longer validate, it resolves a complete, safe
//     appearance by falling back to the template's own defaults field
//     by field — see AvatarTemplate.resolveEffectiveAppearance(). An
//     invalid avatar profile must never block World View access.
export class AvatarProfileUseCase {
    constructor(storageProvider, identityProvider, templateRegistry) {
        this._storageProvider = storageProvider;
        this._identityProvider = identityProvider;
        this._templateRegistry = templateRegistry;
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

    // The never-fails READ path: current profile + the template it
    // actually resolves to (falling back to the default template, and
    // then to whatever template happens to be registered, if the
    // stored templateId is unknown) + a complete, individually-
    // validated appearance. Suitable for driving a preview or a
    // future renderer without any additional error handling at the
    // call site.
    getEffectiveAvatar() {
        const profile = this.getProfile();
        const template = this._templateRegistry.get(profile.templateId)
            || this._templateRegistry.get(DEFAULT_AVATAR_TEMPLATE_ID)
            || this._templateRegistry.getAll()[0]
            || null;
        if (!template) {
            return { profile, template: null, appearance: {} };
        }
        return { profile, template, appearance: template.resolveEffectiveAppearance(profile.appearance) };
    }

    // Applies a partial update (any of templateId/appearance/
    // displayName) to the current user's profile and persists the
    // result. Never accepts a caller-supplied AvatarProfile wholesale
    // — same reasoning as UpdateDocumentMetadataUseCase not accepting
    // a caller-built DocumentMetadata: the use case, not the caller,
    // decides what "the current profile plus these edits" means.
    //
    // Switching templateId WITHOUT also supplying a new appearance
    // resets appearance to the new template's defaults — the old
    // template's option ids are not guaranteed to even exist on the
    // new one, so silently carrying them over would just produce an
    // appearance that fails validation against the template it's now
    // attached to.
    updateProfile({ templateId, appearance, displayName } = {}) {
        let profile = this.getProfile();

        const nextTemplateId = templateId !== undefined ? templateId : profile.templateId;
        const template = this._templateRegistry.get(nextTemplateId);
        if (!template) {
            throw new Error(`AvatarProfileUseCase: unknown templateId "${nextTemplateId}"`);
        }

        let nextAppearance = appearance;
        if (templateId !== undefined && templateId !== profile.templateId && appearance === undefined) {
            nextAppearance = template.defaultAppearance;
        }

        if (nextAppearance !== undefined) {
            const result = validateAvatarAppearance(nextAppearance, template);
            if (!result.valid) {
                throw new Error(`AvatarProfileUseCase: invalid appearance — ${result.errors.join('; ')}`);
            }
        }

        if (templateId !== undefined) {
            profile = profile.withTemplateId(templateId);
        }
        if (nextAppearance !== undefined) {
            profile = profile.withAppearance(nextAppearance);
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
