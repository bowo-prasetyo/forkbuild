import { CreateAvatarProfileUseCase } from './CreateAvatarProfileUseCase.js';
import { CreatePresenceVisibilityUseCase } from './CreatePresenceVisibilityUseCase.js';
import { AvatarPresenceSession } from './AvatarPresenceSession.js';

// Wires an AvatarPresenceSession for the current identity, built FROM
// that identity's persistent AvatarProfile — a session can't exist
// without knowing what avatar it's a live view of. Same "Create*"
// wiring shape as CreatePublisherUseCase/CreatePreviewUseCase: ui/
// calls this, never touches AvatarProfileUseCase's storage plumbing
// directly.
//
// 0.2.40 — also wires presenceVisibilityUseCase alongside it: whether
// this identity's live presence is even eligible to be published is
// exactly the same "which identity is this a live view of" question
// this use case already answers for avatarProfileUseCase/
// presenceSession, so it's wired here rather than as a third,
// independently-constructed collaborator elsewhere.
export class CreateAvatarPresenceSessionUseCase {
    execute(identityProvider, initialState = {}) {
        const { avatarProfileUseCase } = new CreateAvatarProfileUseCase().execute(identityProvider);
        const { presenceVisibilityUseCase } = new CreatePresenceVisibilityUseCase().execute(identityProvider);
        const profile = avatarProfileUseCase.getProfile();
        const presenceSession = new AvatarPresenceSession(profile, initialState);
        return { presenceSession, avatarProfileUseCase, presenceVisibilityUseCase, profile };
    }
}
