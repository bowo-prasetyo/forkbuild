import { inject } from 'vue';
import { FirstBuildChecklistTracker } from '../../../application/onboarding/FirstBuildChecklistTracker.js';
import { isFirstBuildComplete } from '../../../core/FirstBuildChecklist.js';
import { t } from '../../i18n/i18n.js';

// World View opened with `?arrive=door` (the Editor's Walk inside it): the
// avatar arrives at the build's door (application/worldNavigation/
// arrivalMethods.js), World View says how to walk in, and once the avatar
// has gone in, the guided first build's last step is ticked off
// (core/FirstBuildChecklist.js), with a word: a celebration if that finished
// the guide.
// watchArrival() is called on World View's fast presence tick (every 100 ms)
// rather than a timer of its own; it does nothing when nobody is arriving.
export function useArrival({ session, feedback }) {
    const store = inject('firstBuildChecklistStore', null);
    let watching = false;
    let announced = false;

    function watchArrival() {
        if (!watching) return;
        let state = null;
        try {
            state = session.arrivalState();
        } catch {
            state = null;
        }
        if (!state) return;
        if (!announced) {
            announced = true;
            feedback.show(state.kind === 'door' ? t('worldView.arrivedAtDoor') : t('worldView.arrivedAtBuild'));
        }
        if (!state.walkedInside) return;
        watching = false;
        let finishedFirstBuild = false;
        if (store) {
            const tracker = new FirstBuildChecklistTracker({ store });
            const wasComplete = isFirstBuildComplete(tracker.progress());
            tracker.walkedInside();
            finishedFirstBuild = !wasComplete && isFirstBuildComplete(tracker.progress());
        }
        // A build with no door is walked round, not into: nothing more to say.
        if (finishedFirstBuild) feedback.show(t('worldView.firstBuildWalkedInside'));
        else if (state.kind === 'door') feedback.show(t('worldView.walkedInside'));
    }

    // Arrives at `documentId`'s door and starts watching for the walk in.
    function arriveAtDoor(documentId) {
        if (!session.arriveAtEntrance(documentId)) return false;
        announced = false;
        watching = true;
        watchArrival();
        return true;
    }

    return { arriveAtDoor, watchArrival };
}
