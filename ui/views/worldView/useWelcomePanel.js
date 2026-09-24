import { ref, computed } from 'vue';
import { WorldViewPrimaryMode } from '../../../application/WorldViewNavigationState.js';

// The Welcome panel: opened once per World per session, framed as an arrival
// or a return, with suggestions to explore.
export function useWelcomePanel({
    refreshSpatialUI, resolveIdentityDisplayName, session, syncPrimaryMode
}) {
    // Re-read on open and on every spatial-presence update. Opens automatically once
    // per World per session; `welcomeIsArrival` only changes the framing.
    const showWelcomePanel = ref(false);
    const welcomeContext = ref(null);
    const welcomeIsArrival = ref(true);
    // Null on a first visit, else the PRIOR visit's time (read before this visit is
    // saved). Presentational only.
    const worldReturnInfo = ref(null);

    function refreshWelcomeContext() {
        const context = session.getWelcomeContext((identityId) => resolveIdentityDisplayName(identityId));
        welcomeContext.value = context ? context.toJSON() : null;
    }

    // "Welcome back" only for the automatic arrival showing of a world visited
    // before; reopening via "Explore" always uses the plain framing.
    const welcomeIsReturning = computed(() => welcomeIsArrival.value && Boolean(worldReturnInfo.value));

    function openWelcomePanel(isArrival) {
        refreshWelcomeContext();
        welcomeIsArrival.value = Boolean(isArrival);
        showWelcomePanel.value = true;
        // The Welcome panel is Explore mode's content, so primaryMode must agree.
        syncPrimaryMode(WorldViewPrimaryMode.EXPLORE);
    }

    function closeWelcomePanel() {
        showWelcomePanel.value = false;
    }

    // Maps a suggestion's kind to a navigation primitive: places move the camera
    // only (never the avatar), collaborators go through focusCollaborator(). Never
    // mutates the World.
    function exploreWelcomeSuggestion(suggestion) {
        const location = suggestion && suggestion.location;
        if (!location) {
            return;
        }
        if (suggestion.kind === 'collaborator' && location.collaborator && location.collaborator.deviceId) {
            session.focusCollaborator(location.collaborator.deviceId);
        } else if (suggestion.kind === 'landmark' && location.landmark) {
            session.focusLocation(location.landmark.id);
        } else if (suggestion.kind === 'structure' && location.structure) {
            session.focusLocation(location.structure.id);
        } else if (suggestion.kind === 'place' && location.place && location.place.landmark) {
            session.focusPlace(location.place.landmark.id);
        }
        refreshSpatialUI();
    }

    return {
        showWelcomePanel, welcomeContext, welcomeIsArrival, worldReturnInfo, refreshWelcomeContext,
        welcomeIsReturning, openWelcomePanel, closeWelcomePanel, exploreWelcomeSuggestion
    };
}
