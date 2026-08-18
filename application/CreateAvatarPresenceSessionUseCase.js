import { CreateAvatarProfileUseCase } from './CreateAvatarProfileUseCase.js';
import { CreatePresenceVisibilityUseCase } from './CreatePresenceVisibilityUseCase.js';
import { CreateAvatarProfileVisibilityUseCase } from './CreateAvatarProfileVisibilityUseCase.js';
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
//
// 0.2.58 — also wires avatarProfileVisibilityUseCase, the same way and
// for the same reason: profile now has its OWN persisted, independent
// publication gate (see docs/Principles.md, "Profile Gets Its Own
// Publication Gate, Superseding The Shared One") rather than only ever
// borrowing presenceVisibilityUseCase's.
export class CreateAvatarPresenceSessionUseCase {
    execute(identityProvider, initialState = {}) {
        const { avatarProfileUseCase } = new CreateAvatarProfileUseCase().execute(identityProvider);
        const { presenceVisibilityUseCase } = new CreatePresenceVisibilityUseCase().execute(identityProvider);
        const { avatarProfileVisibilityUseCase } = new CreateAvatarProfileVisibilityUseCase().execute(identityProvider);
        const profile = avatarProfileUseCase.getProfile();
        const presenceSession = new AvatarPresenceSession(profile, initialState);
        return { presenceSession, avatarProfileUseCase, presenceVisibilityUseCase, avatarProfileVisibilityUseCase, profile };
    }
}
