import { computed, inject, onBeforeUnmount, ref } from 'vue';
import { normalizeFirstBuildProgress, shouldShowFirstBuildGuide } from '../../../core/FirstBuildChecklist.js';
import { FirstBuildChecklistTracker } from '../../../application/onboarding/FirstBuildChecklistTracker.js';

// Stands in when no store is provided, as in a bare test mount: the guide
// stays hidden and nothing is remembered.
const DISABLED_STORE = Object.freeze({
    hasRecord: () => true,
    get: () => normalizeFirstBuildProgress({ dismissed: true }),
    save: (progress) => normalizeFirstBuildProgress(progress)
});

// The Editor's guided first build (ui/components/FirstBuildGuide.js): its
// progress, kept on this device by the provided firstBuildChecklistStore,
// ticked off by the Editor's own edits, a save and a shared link.
// `isExperienced()` is asked once, the first time the guide is ever seen: a
// device with saved work starts with it hidden.
export function useFirstBuildGuide({ registry, editorSession, isExperienced = () => false }) {
    const store = inject('firstBuildChecklistStore', null);
    const tracker = new FirstBuildChecklistTracker({
        store: store ?? DISABLED_STORE,
        brickHeight: (definitionId) => registry?.get?.(definitionId)?.height ?? 1
    });
    let experienced = false;
    try {
        experienced = isExperienced();
    } catch {
        experienced = false;
    }
    tracker.start({ experienced });

    const firstBuildProgress = ref(tracker.progress());
    const unsubscribe = tracker.subscribe((progress) => { firstBuildProgress.value = progress; });
    const firstBuildVisible = computed(() => Boolean(store) && shouldShowFirstBuildGuide(firstBuildProgress.value));
    // Started once the session has a document and a command history.
    let unobserve = null;
    function followFirstBuildEdits() {
        unobserve?.();
        unobserve = tracker.observe(editorSession);
    }
    function stopFollowing() {
        unobserve?.();
        unsubscribe();
    }
    onBeforeUnmount(stopFollowing);

    return {
        firstBuildProgress,
        firstBuildVisible,
        followFirstBuildEdits,
        firstBuildSaved: () => tracker.saved(),
        firstBuildShared: () => tracker.shared(),
        dismissFirstBuildGuide: () => tracker.dismiss(),
        finishFirstBuildGuide: () => tracker.celebrated(),
        showFirstBuildGuide: () => tracker.show()
    };
}
