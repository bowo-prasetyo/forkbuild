import { AvatarProfile } from '../../core/avatar/AvatarProfile.js';
import { AvatarPresenceSession } from './AvatarPresenceSession.js';
import { AvatarProfileUseCase } from './AvatarProfileUseCase.js';
import { CreateAvatarTemplateRegistryUseCase } from './CreateAvatarTemplateRegistryUseCase.js';

// A guest's avatar: someone with no name yet walks World View in the default
// look (docs/reviews/CreativeDirection-2026-10-12c.md, finding 1). It is
// local only. The profile is held in memory, never saved, and both
// visibility gates say no, so no presence, profile, gesture or ride of it is
// ever sent to anyone (WorldNavigationSession's publishes all go through
// those gates; the ride's adds its own guest check). Choosing a name later
// swaps it for the named avatar where it stands (adoptLocalAvatar()).
export const GUEST_OWNER_IDENTITY = 'guest';

const NEVER_ADVERTISE_POLICY = Object.freeze({ shouldAdvertise: () => false });
const NEVER_ADVERTISE = Object.freeze({ getPolicy: () => NEVER_ADVERTISE_POLICY });

export class GuestAvatarProfileUseCase extends AvatarProfileUseCase {
    constructor(templateRegistry) {
        super(null, null, templateRegistry);
        this._profile = new AvatarProfile({ ownerIdentity: GUEST_OWNER_IDENTITY });
    }

    get isGuest() {
        return true;
    }

    getProfile() {
        return this._profile;
    }

    // A guest's look is the default one; a look is chosen with a name.
    updateProfile() {
        throw new Error('GuestAvatarProfileUseCase: a guest avatar cannot be changed');
    }
}

export class CreateGuestAvatarUseCase {
    // initialState: where the avatar starts ({ position, rotation }), as
    // AvatarPresenceSession takes it.
    execute(initialState = {}) {
        const avatarProfileUseCase = new GuestAvatarProfileUseCase(new CreateAvatarTemplateRegistryUseCase().execute());
        return {
            avatarProfileUseCase,
            presenceSession: new AvatarPresenceSession(avatarProfileUseCase.getProfile(), initialState),
            presenceVisibilityUseCase: NEVER_ADVERTISE,
            avatarProfileVisibilityUseCase: NEVER_ADVERTISE
        };
    }
}
