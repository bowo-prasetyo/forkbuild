import { CameraPerspective } from '../core/CameraPerspective.js';
import { useWorldPresenceSync } from '../ui/views/worldView/useWorldPresenceSync.js';
import { assert } from './support/Assert.js';

// Opening a World restores the Camera Perspective last used there
// (WorldNavigationSession#restoreWorldExperience()). The perspective buttons
// read `cameraPerspective`, so it must follow the session, or "Free" stays
// selected over a restored Third Person camera.

function stubSession(storedPerspectives) {
    let perspective = null;
    return {
        saveWorldExperience() {},
        restoreWorldExperience(documentId) {
            if (!(documentId in storedPerspectives)) {
                return null;
            }
            // Like the real session: a stored perspective is re-applied, none leaves the current one.
            if (storedPerspectives[documentId]) {
                perspective = storedPerspectives[documentId];
            }
            return { lastVisitedAt: 1000 };
        },
        getCameraPerspective() {
            return perspective;
        }
    };
}

function setup(storedPerspectives) {
    const cameraPerspective = { value: null };
    const worldReturnInfo = { value: null };
    const { _syncWorldExperience } = useWorldPresenceSync({
        cameraPerspective, session: stubSession(storedPerspectives), worldReturnInfo
    });
    return { cameraPerspective, worldReturnInfo, _syncWorldExperience };
}

{
    const { cameraPerspective, worldReturnInfo, _syncWorldExperience } = setup({ 'world-a': CameraPerspective.THIRD_PERSON });
    _syncWorldExperience('world-a');
    assert(cameraPerspective.value === CameraPerspective.THIRD_PERSON,
        '1. a restored Third Person perspective is shown on the buttons, not "Free"');
    assert(worldReturnInfo.value && worldReturnInfo.value.lastVisitedAt === 1000, '2. the return info is still recorded');
    console.log('✓ the buttons show the perspective restored for a World');
}

{
    const { cameraPerspective, _syncWorldExperience } = setup({ 'world-a': null });
    _syncWorldExperience('world-a');
    assert(cameraPerspective.value === null, '3. a World last left in Free mode shows "Free"');

    const firstVisit = setup({});
    firstVisit._syncWorldExperience('world-new');
    assert(firstVisit.cameraPerspective.value === null, '4. a first visit shows "Free"');
    console.log('✓ the buttons show "Free" when nothing is restored');
}
