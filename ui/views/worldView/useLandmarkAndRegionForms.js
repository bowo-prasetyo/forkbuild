import { ref } from 'vue';

// Add/edit/remove forms for World landmarks and regions.
export function useLandmarkAndRegionForms({
    feedback, guarded, refreshLocationsPanel, refreshSpatialUI, session
}) {
    const showLandmarkForm = ref(false);
    const landmarkFormTarget = ref(null);
    const showRegionForm = ref(false);
    const regionFormTarget = ref(null);

    function openAddLandmarkForm() {
        landmarkFormTarget.value = null;
        showLandmarkForm.value = true;
    }

    function openEditLandmarkForm(landmarkId) {
        const landmark = session.getLandmark(landmarkId);
        if (!landmark) {
            feedback.show('That landmark is no longer available');
            return;
        }
        landmarkFormTarget.value = landmark;
        showLandmarkForm.value = true;
    }

    function closeLandmarkForm() {
        showLandmarkForm.value = false;
        landmarkFormTarget.value = null;
    }

    function onSaveLandmarkForm({ title, description }) {
        const target = landmarkFormTarget.value;
        guarded(() => {
            if (target) {
                session.updateLandmark(target.id, { title, description });
                feedback.show(`Updated "${title}"`);
            } else {
                session.createLandmarkHere(title, description);
                feedback.show(`Added landmark "${title}"`);
            }
        });
        closeLandmarkForm();
        refreshLocationsPanel();
        refreshSpatialUI();
    }

    function removeLandmarkFromPanel(landmarkId) {
        guarded(() => {
            session.removeLandmark(landmarkId);
            feedback.show('Landmark removed');
        });
        refreshLocationsPanel();
        refreshSpatialUI();
    }

    // -----------------------------------------------------------------
    // Regions & Place Naming
    // -----------------------------------------------------------------
    function openAddRegionForm() {
        regionFormTarget.value = null;
        showRegionForm.value = true;
    }

    function openEditRegionForm(regionId) {
        const region = session.getRegion(regionId);
        if (!region) {
            feedback.show('That region is no longer available');
            return;
        }
        regionFormTarget.value = region;
        showRegionForm.value = true;
    }

    function closeRegionForm() {
        showRegionForm.value = false;
        regionFormTarget.value = null;
    }

    function onSaveRegionForm({ name, description, kind, radius }) {
        const target = regionFormTarget.value;
        guarded(() => {
            if (target) {
                session.updateRegion(target.id, { name, description, kind, radius });
                feedback.show(`Updated "${name}"`);
            } else {
                session.createRegionHere(name, { description, kind, radius });
                feedback.show(`Named "${name}"`);
            }
        });
        closeRegionForm();
        refreshLocationsPanel();
        refreshSpatialUI();
    }

    function removeRegionFromPanel(regionId) {
        guarded(() => {
            session.removeRegion(regionId);
            feedback.show('Region removed');
        });
        refreshLocationsPanel();
        refreshSpatialUI();
    }

    return {
        showLandmarkForm, landmarkFormTarget, showRegionForm, regionFormTarget, openAddLandmarkForm,
        openEditLandmarkForm, closeLandmarkForm, onSaveLandmarkForm, removeLandmarkFromPanel,
        openAddRegionForm, openEditRegionForm, closeRegionForm, onSaveRegionForm, removeRegionFromPanel
    };
}
