import { ref } from 'vue';

// Display defaults only: the session decides the real radius.
const DEFAULT_EXPLORE_RADIUS = 25;

const NEARBY_RADIUS = 5;

// Same shape exploreLocation returns, so callers never special-case a call
// that did not happen.
const EMPTY_DISCOVERY_ENVELOPE = { documents: [], diagnostics: { available: false, fatal: null, complete: false, warnings: [] } };

// World search, the documents-at-a-location list, and the location browser
// (explore here / what's here / inspect).
export function useLocationBrowser({
    cameraPosition, focusWorld, guarded, refreshSpatialUI, session
}) {
    const searchResults = ref([]);
    const showLocationDocuments = ref(false);
    const locationDocumentsPosition = ref(null);
    const locationDocumentsOccupants = ref([]);
    // Cleared on every open/re-query: an expansion from an earlier query need not
    // match a row in the new results.
    const showLocationBrowser = ref(false);
    const locationBrowserCenter = ref(null);
    const locationBrowserRadius = ref(DEFAULT_EXPLORE_RADIUS);
    const locationBrowserDocuments = ref([]);
    // Defaults to the "unavailable" shape so the banner always has well-formed
    // data.
    const locationBrowserDiagnostics = ref(EMPTY_DISCOVERY_ENVELOPE.diagnostics);
    const locationBrowserInspected = ref(null);

    function performSearch(options) {
        searchResults.value = guarded(() => session.searchWorld(options)) || [];
    }

    // Search's Focus is exactly focusWorld (docs/Principles.md, "Focus Is
    // Navigation, Not Discovery").

    // Turns the overlap count into a choosable list (docs/Principles.md, "Overlap Is
    // A Fact; Collision Is A Policy Decision").
    function openLocationDocuments(position) {
        if (!position) return;
        locationDocumentsPosition.value = position;
        locationDocumentsOccupants.value = guarded(() => session.getDocumentsAtPosition(position)) || [];
        showLocationDocuments.value = true;
    }

    function closeLocationDocuments() {
        showLocationDocuments.value = false;
        locationDocumentsPosition.value = null;
        locationDocumentsOccupants.value = [];
    }

    function focusLocationDocument(documentId) {
        focusWorld(documentId);
        closeLocationDocuments();
    }

    // -----------------------------------------------------------------
    // World Location Browser: "Explore Here" / "What's Here?"
    // -----------------------------------------------------------------

    function openLocationBrowser(radius, envelope) {
        locationBrowserCenter.value = cameraPosition.value;
        locationBrowserRadius.value = radius;
        locationBrowserDocuments.value = envelope.documents || [];
        locationBrowserDiagnostics.value = envelope.diagnostics || EMPTY_DISCOVERY_ENVELOPE.diagnostics;
        locationBrowserInspected.value = null;
        showLocationBrowser.value = true;
    }

    // Centered on the CAMERA, not the active document's placement: the camera may
    // look at empty space with no active document.
    function exploreHere() {
        if (!cameraPosition.value) return;
        const envelope = guarded(() => session.exploreHere(DEFAULT_EXPLORE_RADIUS)) || EMPTY_DISCOVERY_ENVELOPE;
        openLocationBrowser(DEFAULT_EXPLORE_RADIUS, envelope);
    }

    // A small tolerance radius: camera coordinates almost never land exactly on a
    // placement.
    function whatsHere() {
        if (!cameraPosition.value) return;
        const envelope = guarded(() => session.whatsHere()) || EMPTY_DISCOVERY_ENVELOPE;
        openLocationBrowser(NEARBY_RADIUS, envelope);
    }

    // Clears any expanded Inspect row: it belonged to the old results.
    function reExploreLocationBrowser(radius) {
        if (!locationBrowserCenter.value) return;
        const envelope = guarded(() => session.exploreLocation({
            center: locationBrowserCenter.value,
            radius
        })) || EMPTY_DISCOVERY_ENVELOPE;
        openLocationBrowser(radius, envelope);
    }

    function closeLocationBrowser() {
        showLocationBrowser.value = false;
        locationBrowserCenter.value = null;
        locationBrowserDocuments.value = [];
        locationBrowserDiagnostics.value = EMPTY_DISCOVERY_ENVELOPE.diagnostics;
        locationBrowserInspected.value = null;
    }

    // Moves the camera (and makes the document active by default), so the browser
    // closes.
    function focusLocationBrowserResult(documentId) {
        focusWorld(documentId);
        closeLocationBrowser();
    }

    // Makes the result active without moving the camera, so browsing continues.
    function selectLocationBrowserResult(documentId) {
        guarded(() => session.setActiveDocument(documentId));
        refreshSpatialUI();
    }

    // Toggles; never navigates or loads.
    function inspectLocationBrowserResult(documentId) {
        if (locationBrowserInspected.value && locationBrowserInspected.value.documentId === documentId) {
            locationBrowserInspected.value = null;
            return;
        }
        locationBrowserInspected.value = guarded(() => session.inspectDocument(documentId))
            || { documentId, documentInfo: null, placementInfo: null, trust: null };
    }

    return {
        searchResults, showLocationDocuments, locationDocumentsPosition, locationDocumentsOccupants,
        showLocationBrowser, locationBrowserCenter, locationBrowserRadius, locationBrowserDocuments,
        locationBrowserDiagnostics, locationBrowserInspected, performSearch, openLocationDocuments,
        closeLocationDocuments, focusLocationDocument, openLocationBrowser, exploreHere, whatsHere,
        reExploreLocationBrowser, closeLocationBrowser, focusLocationBrowserResult,
        selectLocationBrowserResult, inspectLocationBrowserResult
    };
}
