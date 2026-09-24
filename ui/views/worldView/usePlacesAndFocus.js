import { ref } from 'vue';
import { WorldViewPrimaryMode } from '../../../application/WorldViewNavigationState.js';
import { geographicPlaceLocationId } from '../../../core/GeographicPlaceNavigation.js';
import { WorldFocusKind } from '../../../core/WorldFocusContext.js';
import { withReturnWorld, editorEntryContextToQuery } from '../../../core/EditorEntryContext.js';

// The map panel, the geographic place directory and detail panel, and the
// Focus panel that inspects a location, place or collaborator.
export function usePlacesAndFocus({
    closeWelcomePanel, feedback, focusedDocumentTitle, openNamingPanel, refreshLocationsPanel,
    refreshSpatialUI, resolveIdentityDisplayName, route, router, session, setPrimaryMode, showWelcomePanel,
    syncPrimaryMode, title, worldViewNav
}) {
    // Refreshed every tick while open, so collaborators keep moving on the map.
    // Pan/zoom are not reset by the refresh.
    const showMapPanel = ref(false);
    const mapContent = ref({ regions: [], landmarks: [], structures: [], collaborators: [], viewerPosition: null });
    // Re-read each time the directory opens. "Show on Map" only highlights regions
    // already drawn.
    const showGeographicPlaceDirectory = ref(false);
    const geographicPlaces = ref([]);
    const showGeographicPlacePanel = ref(false);
    const geographicPlace = ref(null);
    const mapHighlightRegionKeys = ref([]);
    const nearbyGeographicPlaces = ref([]);

    // Rebuilt on each inspection. Its own overlay, so it can open from Explore or
    // Locations without leaving either.
    const showFocusPanel = ref(false);
    const focusContext = ref(null);

    // -----------------------------------------------------------------
    // World Map
    // -----------------------------------------------------------------
    //
    // Re-reads mapContent on open so the first paint is current. Marker clicks use
    // the same focusLocation()/followCollaborator() as everything else.
    function openMapPanel() {
        refreshMapContent();
        showMapPanel.value = true;
    }

    function refreshMapContent() {
        mapContent.value = session.getMapContent((identityId) => resolveIdentityDisplayName(identityId));
    }

    function closeMapPanel() {
        showMapPanel.value = false;
        // A highlight is one-shot: cleared on close.
        mapHighlightRegionKeys.value = [];
        syncPrimaryMode(WorldViewPrimaryMode.EXPLORE);
    }

    // -----------------------------------------------------------------
    // Contextual Focus
    // -----------------------------------------------------------------
    //
    // The "Info" entry points only read the focus context and show the panel; they
    // never move the camera or map. The panel's actions reuse the same session
    // calls as every other navigation entry point.
    function openFocusForLocation(locationId) {
        const context = session.getFocusContextForLocation(locationId);
        if (!context) {
            feedback.show('That is no longer available');
            return;
        }
        focusContext.value = context.toJSON();
        showFocusPanel.value = true;
    }

    // The row only has a fingerprintKey; this builds the `place:` location id.
    function openFocusForGeographicPlace(fingerprintKey) {
        openFocusForLocation(geographicPlaceLocationId(fingerprintKey));
    }

    function openFocusForCollaborator(deviceId) {
        const context = session.getFocusContextForCollaborator(deviceId, (identityId) => resolveIdentityDisplayName(identityId));
        if (!context) {
            feedback.show('That person is no longer nearby');
            return;
        }
        focusContext.value = context.toJSON();
        showFocusPanel.value = true;
    }

    function closeFocusPanel() {
        showFocusPanel.value = false;
        focusContext.value = null;
    }

    function goFromFocusPanel() {
        const context = focusContext.value;
        if (!context || !context.source) {
            return;
        }
        const { kind, id } = context.source;
        const moved = kind === WorldFocusKind.COLLABORATOR
            ? session.focusCollaborator(id)
            : session.focusLocation(kind === WorldFocusKind.GEOGRAPHIC_PLACE ? geographicPlaceLocationId(id) : id);
        if (!moved) {
            feedback.show('That is no longer available');
            closeFocusPanel();
            return;
        }
        refreshSpatialUI();
        closeFocusPanel();
    }

    // Moves the camera first so the map opens looking at the focused thing. Only
    // offered for kinds whose availableActions include 'map'.
    function showFocusOnMap() {
        const context = focusContext.value;
        if (!context || !context.source) {
            return;
        }
        const { kind, id } = context.source;
        session.focusLocation(kind === WorldFocusKind.GEOGRAPHIC_PLACE ? geographicPlaceLocationId(id) : id);
        refreshSpatialUI();
        closeFocusPanel();
        setPrimaryMode(WorldViewPrimaryMode.MAP);
    }

    // Only offered for a REGION; opens the same PlaceNamingPanel as everywhere
    // else.
    function openNamesFromFocusPanel() {
        const context = focusContext.value;
        if (!context || !context.source || context.source.kind !== WorldFocusKind.REGION) {
            return;
        }
        const regionId = context.source.id;
        closeFocusPanel();
        refreshLocationsPanel();
        openNamingPanel(regionId);
    }

    // Where "Back to World" returns: the FOCUSED (camera) document, else this
    // route's world. Never context.source.documentId, which for a STRUCTURE is the
    // fork target, not the world the viewer stood in.
    function currentReturnWorld() {
        const id = session.getFocusedDocumentId()
            || route.params.documentId
            || null;
        return { id, title: (id && focusedDocumentTitle.value) || title.value || '' };
    }

    // "Edit a Copy": the one deliberate way out of World View's no-editing
    // boundary, and contextual: Only ever offered for a
    // REGION/LANDMARK/STRUCTURE in the Focus panel. Forks the document that contains the focused thing (for a
    // STRUCTURE, its own content document) via the /editor?fork= navigation
    // PublicationCatalog's forkPublication() already uses, never a second fork mechanism,
    // carrying the entry context and a return address as query params.
    function editFocusedCopyFromFocusPanel() {
        const context = focusContext.value;
        if (!context || !context.source || !context.source.documentId) {
            return;
        }
        const documentId = context.source.documentId;
        const publication = session.getPublicationIdForDocument(documentId);
        const returnWorld = currentReturnWorld();
        const entryContext = withReturnWorld(context.editCopyContext, { returnWorldId: returnWorld.id, returnWorldTitle: returnWorld.title });
        const entryQuery = editorEntryContextToQuery(entryContext);
        closeFocusPanel();
        router.push({
            path: '/editor',
            query: { fork: documentId, ...(publication ? { publication } : {}), ...entryQuery }
        });
    }

    // -----------------------------------------------------------------
    // Geographic Place Directory
    // -----------------------------------------------------------------
    //
    // Read-only; openNamesFromPlace() hands off to the existing PlaceNamingPanel.
    // A fresh open resets Places to its list screen.
    function openGeographicPlaceDirectory() {
        worldViewNav.openPlacesDirectory();
        showGeographicPlaceDirectoryList();
    }

    function showGeographicPlaceDirectoryList() {
        geographicPlaces.value = session.getGeographicPlaceDirectory().map((place) => place.toJSON());
        showGeographicPlaceDirectory.value = true;
    }

    // -----------------------------------------------------------------
    // Geographic Place Navigation
    // -----------------------------------------------------------------
    //
    // The one entry point for going to a geographic place, from every surface that
    // shows one: session.focusLocation() with its `place:` id. false (unknown
    // place) gives the same feedback as a stale directory row.
    function goToGeographicPlace(fingerprintKey) {
        const moved = session.focusLocation(geographicPlaceLocationId(fingerprintKey));
        if (!moved) {
            feedback.show('That geographic place is no longer available');
            return;
        }
        refreshSpatialUI();
        showGeographicPlaceDirectory.value = false;
        showGeographicPlacePanel.value = false;
        geographicPlace.value = null;
        if (showWelcomePanel.value) {
            closeWelcomePanel();
        }
        // Arriving resets Places to its list and returns to Explore.
        worldViewNav.openPlacesDirectory();
        syncPrimaryMode(WorldViewPrimaryMode.EXPLORE);
    }

    // Returns primaryMode to Explore but keeps the Places back-stack.
    function closeGeographicPlaceDirectory() {
        showGeographicPlaceDirectory.value = false;
        syncPrimaryMode(WorldViewPrimaryMode.EXPLORE);
    }

    function openGeographicPlace(fingerprintKey) {
        const place = session.getGeographicPlace(fingerprintKey);
        if (!place) {
            feedback.show('That geographic place is no longer available');
            return;
        }
        geographicPlace.value = place.toJSON();
        worldViewNav.openPlaceDetail(fingerprintKey);
        showGeographicPlaceDirectory.value = false;
        showGeographicPlacePanel.value = true;
    }

    // Only restores a detail screen after switching modes; an unresolvable place
    // falls back to the directory.
    function restoreGeographicPlaceDetail(fingerprintKey) {
        const place = session.getGeographicPlace(fingerprintKey);
        if (!place) {
            openGeographicPlaceDirectory();
            return;
        }
        geographicPlace.value = place.toJSON();
        showGeographicPlacePanel.value = true;
    }

    function closeGeographicPlacePanel() {
        showGeographicPlacePanel.value = false;
        geographicPlace.value = null;
    }

    // Back always returns to the directory (the back-stack is two screens deep).
    function goBackInPlaces() {
        worldViewNav.goBackInPlaces();
        showGeographicPlacePanel.value = false;
        geographicPlace.value = null;
        showGeographicPlaceDirectoryList();
    }

    function openNamesFromPlace(regionId) {
        closeGeographicPlacePanel();
        // The Names panel reads its region name from worldLocations, which may not have
        // been loaded yet.
        refreshLocationsPanel();
        openNamingPanel(regionId);
    }

    // Highlights the place's existing regions and centers on its representative
    // region so the map opens on relevant ground.
    function showGeographicPlaceOnMap() {
        const place = geographicPlace.value;
        if (!place) return;
        mapHighlightRegionKeys.value = place.regions.map((region) => `${region.worldId}:${region.id}`);
        if (place.representativeRegion) {
            session.focusLocation(place.representativeRegion.id);
            refreshSpatialUI();
        }
        showGeographicPlacePanel.value = false;
        openMapPanel();
        // The Map tab becomes active; the Places back-stack is left on this place so
        // switching back returns here.
        syncPrimaryMode(WorldViewPrimaryMode.MAP);
    }

    return {
        showMapPanel, mapContent, showGeographicPlaceDirectory, geographicPlaces, showGeographicPlacePanel,
        geographicPlace, mapHighlightRegionKeys, nearbyGeographicPlaces, showFocusPanel, focusContext,
        openMapPanel, refreshMapContent, closeMapPanel, openFocusForLocation, openFocusForGeographicPlace,
        openFocusForCollaborator, closeFocusPanel, goFromFocusPanel, showFocusOnMap, openNamesFromFocusPanel,
        currentReturnWorld, editFocusedCopyFromFocusPanel, openGeographicPlaceDirectory,
        showGeographicPlaceDirectoryList, goToGeographicPlace, closeGeographicPlaceDirectory,
        openGeographicPlace, restoreGeographicPlaceDetail, closeGeographicPlacePanel, goBackInPlaces,
        openNamesFromPlace, showGeographicPlaceOnMap
    };
}
