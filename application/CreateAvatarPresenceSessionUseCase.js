import { CreateAvatarProfileUseCase } from './CreateAvatarProfileUseCase.js';
import { AvatarPresenceSession } from './AvatarPresenceSession.js';

// Wires an AvatarPresenceSession for the current identity, built FROM
// that identity's persistent AvatarProfile — a session can't exist
// without knowing what avatar it's a live view of. Same "Create*"
// wiring shape as CreatePublisherUseCase/CreatePreviewUseCase: ui/
// calls this, never touches AvatarProfileUseCase's storage plumbing
// directly.
export class CreateAvatarPresenceSessionUseCase {
    execute(identityProvider, initialState = {}) {
        const { avatarProfileUseCase } = new CreateAvatarProfileUseCase().execute(identityProvider);
        const profile = avatarProfileUseCase.getProfile();
        const presenceSession = new AvatarPresenceSession(profile, initialState);
        return { presenceSession, avatarProfileUseCase, profile };
    }
}
