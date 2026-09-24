import { ref, computed } from 'vue';

// The Place Naming panel: a region's naming claims and community view, this
// replica's preferred name, claim publish/retract/export/import, and publishing
// a claim to Nostr.
export function usePlaceNamingPanel({
    feedback, guarded, publishPlaceNamingClaimToNostrCommand, session
}) {
    // The panel's data is re-derived from the session on open and after every
    // action, never cached.
    const showNamingPanel = ref(false);
    const namingPanelRegionId = ref(null);
    const namingPanelClaims = ref([]);
    const namingPanelView = ref([]);
    const namingPanelPreferredName = ref(null);
    // Every known region that candidate-matches this region's geometry, and their
    // combined naming view.
    const namingPanelGeographicRegions = ref([]);
    const namingPanelGeographicView = ref([]);
    // Per-panel state for announcing a claim to Nostr. The claim id lets the result
    // show beside the right row. Reset (and in-flight calls invalidated) when the
    // panel opens or closes.
    const namingPanelPublishToNostrClaimId = ref(null);
    const namingPanelPublishToNostrExecuting = ref(false);
    const namingPanelPublishToNostrError = ref(null);
    const namingPanelPublishToNostrResult = ref(null);
    const namingPanelPublishToNostrRequestId = ref(0);
    const myIdentityId = computed(() => session.getMyIdentityId());

    // -----------------------------------------------------------------
    // Place Naming Claims
    // -----------------------------------------------------------------
    //
    // Not gated by canEditActiveWorld: naming claims need no World edit authority
    // (see core/PlaceNamingClaim.js).
    function refreshNamingPanel() {
        const regionId = namingPanelRegionId.value;
        if (!regionId) return;
        namingPanelClaims.value = session.getPlaceNamingClaims(regionId);
        namingPanelView.value = session.getPlaceNamingView(regionId);
        namingPanelPreferredName.value = session.getPreferredPlaceName(regionId);
        // Additive: never changes what the region-scoped fields show.
        const geographic = session.getGeographicNamingView(regionId);
        namingPanelGeographicRegions.value = geographic.regions;
        namingPanelGeographicView.value = geographic.namingView;
    }

    function openNamingPanel(regionId) {
        namingPanelRegionId.value = regionId;
        refreshNamingPanel();
        resetNamingPanelPublishToNostr();
        showNamingPanel.value = true;
    }

    function closeNamingPanel() {
        showNamingPanel.value = false;
        namingPanelRegionId.value = null;
        resetNamingPanelPublishToNostr();
    }

    // Clears the last "Publish to Nostr" result and bumps the request id, so an
    // in-flight call for a previous panel can never write into this one.
    function resetNamingPanelPublishToNostr() {
        namingPanelPublishToNostrRequestId.value += 1;
        namingPanelPublishToNostrClaimId.value = null;
        namingPanelPublishToNostrExecuting.value = false;
        namingPanelPublishToNostrError.value = null;
        namingPanelPublishToNostrResult.value = null;
    }

    function publishNamingClaim(name) {
        guarded(() => {
            session.publishPlaceNamingClaim(namingPanelRegionId.value, name);
            feedback.show(`Published "${name}"`);
        });
        refreshNamingPanel();
    }

    function retractNamingClaim(claimId) {
        guarded(() => {
            session.retractPlaceNamingClaim(namingPanelRegionId.value, claimId);
            feedback.show('Claim retracted');
        });
        refreshNamingPanel();
    }

    function setPreferredNamingName(name) {
        guarded(() => {
            session.setPreferredPlaceName(namingPanelRegionId.value, name);
        });
        refreshNamingPanel();
    }

    function clearPreferredNamingName() {
        guarded(() => {
            session.clearPreferredPlaceName(namingPanelRegionId.value);
        });
        refreshNamingPanel();
    }

    function exportNamingClaim(claimId) {
        const pkg = guarded(() => session.exportPlaceNamingClaim(namingPanelRegionId.value, claimId));
        if (!pkg) return;
        const json = JSON.stringify(pkg, null, 2);
        const slug = pkg.claim.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'place-name';
        const link = document.createElement('a');
        link.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
        link.download = `forkbuild-place-naming-claim-${slug}.json`;
        link.click();
        feedback.show(`Exported "${pkg.claim.name}"`);
    }

    // `rawText` is untrusted; parsing and import (validation plus signature
    // verification) are reported separately. A duplicate claim is an ordinary
    // outcome with its own message.
    function importNamingClaim(rawText) {
        let parsed;
        try {
            parsed = JSON.parse(rawText);
        } catch (e) {
            feedback.show('That is not valid JSON — choose a file exported with "Export Claim."');
            return;
        }
        const result = guarded(() => session.importPlaceNamingClaim(parsed));
        if (!result) return;
        const { claim, isNew } = result;
        if (!isNew) {
            feedback.show(`"${claim.name}" was already known — nothing changed`);
            return;
        }
        if (claim.regionId === namingPanelRegionId.value) {
            refreshNamingPanel();
            feedback.show(`Imported "${claim.name}"`);
        } else {
            feedback.show(`Imported "${claim.name}" for a different place — open its Names panel to see it`);
        }
    }

    // Announces an existing, already-signed claim; creating a claim is a separate
    // step. Reads the claim through the session, not the panel's cached copy. A
    // failed announcement never changes the local claim.
    function publishNamingClaimToNostr(claimId) {
        if (!publishPlaceNamingClaimToNostrCommand) return;
        const regionId = namingPanelRegionId.value;
        if (!regionId) return;
        const claim = session.getPlaceNamingClaims(regionId).find((c) => c.id === claimId);
        if (!claim) return;

        namingPanelPublishToNostrRequestId.value += 1;
        const requestId = namingPanelPublishToNostrRequestId.value;
        namingPanelPublishToNostrClaimId.value = claimId;
        namingPanelPublishToNostrExecuting.value = true;
        namingPanelPublishToNostrError.value = null;
        namingPanelPublishToNostrResult.value = null;

        Promise.resolve()
            .then(() => publishPlaceNamingClaimToNostrCommand(claim))
            .then((result) => {
                if (namingPanelPublishToNostrRequestId.value !== requestId) return;
                namingPanelPublishToNostrExecuting.value = false;
                namingPanelPublishToNostrResult.value = result;
            })
            .catch((error) => {
                if (namingPanelPublishToNostrRequestId.value !== requestId) return;
                namingPanelPublishToNostrExecuting.value = false;
                namingPanelPublishToNostrError.value = (error && error.message) ? error.message : 'Publish to Nostr failed.';
            });
    }

    return {
        showNamingPanel, namingPanelRegionId, namingPanelClaims, namingPanelView, namingPanelPreferredName,
        namingPanelGeographicRegions, namingPanelGeographicView, namingPanelPublishToNostrClaimId,
        namingPanelPublishToNostrExecuting, namingPanelPublishToNostrError, namingPanelPublishToNostrResult,
        namingPanelPublishToNostrRequestId, myIdentityId, refreshNamingPanel, openNamingPanel,
        closeNamingPanel, resetNamingPanelPublishToNostr, publishNamingClaim, retractNamingClaim,
        setPreferredNamingName, clearPreferredNamingName, exportNamingClaim, importNamingClaim,
        publishNamingClaimToNostr
    };
}
