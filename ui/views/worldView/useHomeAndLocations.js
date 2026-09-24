import { WorldViewPrimaryMode } from '../../../application/WorldViewNavigationState.js';

// Home and the Locations panel. Unlike focusWorld(), these never load a document,
// touch the route or change the active document.
export function useHomeAndLocations({
    closePrimaryNavigationPanels, refreshSpatialUI, session, showLocationsPanel, syncPrimaryMode, worldLocations
}) {
    function goHome() {
        session.goHome();
        refreshSpatialUI();
    }

    // Lives under Explore mode, opened through the same mutual-exclusion helper.
    function openLocationsPanel() {
        syncPrimaryMode(WorldViewPrimaryMode.EXPLORE);
        closePrimaryNavigationPanels();
        refreshLocationsPanel();
        showLocationsPanel.value = true;
    }

    function closeLocationsPanel() {
        showLocationsPanel.value = false;
    }

    // The one handler for every "go to this location" entry point.
    function focusLocation(locationId) {
        session.focusLocation(locationId);
        refreshSpatialUI();
    }

    // Mutations go through guarded(); the Locations list is re-read after each so
    // changes show immediately.
    function refreshLocationsPanel() {
        worldLocations.value = session.getWorldLocations().map((loc) => loc.toJSON());
    }

    return {
        closeLocationsPanel, focusLocation, goHome, openLocationsPanel, refreshLocationsPanel
    };
}
