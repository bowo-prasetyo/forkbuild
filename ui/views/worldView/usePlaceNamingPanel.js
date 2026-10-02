import { ref, computed } from 'vue';
import { errorText, t } from '../../i18n/i18n.js';

// The Place Naming panel: a region's naming claims and community view, this
// replica's preferred name, claim publish/retract/export/import, and distributing
// a claim to a decentralized network.
//
// `distributePlaceNamingClaimCommand(claim, discoveryProvider)` announces one
// already-signed claim on 'arweave', 'nostr' or 'steem'; without it nothing is
// offered. `defaultDiscoveryProvider` is the saved Announcement / Discovery
// preference the picker opens on.
export function usePlaceNamingPanel({
    defaultDiscoveryProvider = 'nostr', distributePlaceNamingClaimCommand, feedback, guarded, session
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
    // Where the next distribution goes. Page-local, never saved.
    const namingPanelDiscoveryProvider = ref(defaultDiscoveryProvider || 'nostr');
    // Per-panel state for distributing a claim. The claim id lets the result show
    // beside the right row. Reset (and in-flight calls invalidated) when the panel
    // opens or closes.
    const namingPanelDistributionClaimId = ref(null);
    const namingPanelDistributionExecuting = ref(false);
    const namingPanelDistributionError = ref(null);
    // `{ discoveryProvider, ...publisher result }`: the substrate is kept with the
    // result because the picker may change afterwards.
    const namingPanelDistributionResult = ref(null);
    const namingPanelDistributionRequestId = ref(0);
    // The claim just made with Publish A Name, which the panel offers to
    // distribute. Publishing never distributes on its own.
    const namingPanelDistributionOfferClaimId = ref(null);
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
        resetNamingPanelDistribution();
        showNamingPanel.value = true;
    }

    function closeNamingPanel() {
        showNamingPanel.value = false;
        namingPanelRegionId.value = null;
        resetNamingPanelDistribution();
    }

    // Clears the last distribution result and the offer, and bumps the request id,
    // so an in-flight call for a previous panel can never write into this one.
    function resetNamingPanelDistribution() {
        namingPanelDistributionRequestId.value += 1;
        namingPanelDistributionClaimId.value = null;
        namingPanelDistributionExecuting.value = false;
        namingPanelDistributionError.value = null;
        namingPanelDistributionResult.value = null;
        namingPanelDistributionOfferClaimId.value = null;
    }

    function publishNamingClaim(name) {
        const claim = guarded(() => {
            const published = session.publishPlaceNamingClaim(namingPanelRegionId.value, name);
            feedback.show(t('placeNaming.published', { name }));
            return published;
        });
        refreshNamingPanel();
        if (claim && distributePlaceNamingClaimCommand) {
            namingPanelDistributionOfferClaimId.value = claim.id;
        }
    }

    function dismissNamingClaimDistributionOffer() {
        namingPanelDistributionOfferClaimId.value = null;
    }

    function retractNamingClaim(claimId) {
        guarded(() => {
            session.retractPlaceNamingClaim(namingPanelRegionId.value, claimId);
            feedback.show(t('placeNaming.retracted'));
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
        feedback.show(t('placeNaming.exported', { name: pkg.claim.name }));
    }

    // `rawText` is untrusted; parsing and import (validation plus signature
    // verification) are reported separately. A duplicate claim is an ordinary
    // outcome with its own message.
    function importNamingClaim(rawText) {
        let parsed;
        try {
            parsed = JSON.parse(rawText);
        } catch (e) {
            feedback.show(t('placeNaming.invalidJson'));
            return;
        }
        const result = guarded(() => session.importPlaceNamingClaim(parsed));
        if (!result) return;
        const { claim, isNew } = result;
        if (!isNew) {
            feedback.show(t('placeNaming.alreadyKnown', { name: claim.name }));
            return;
        }
        if (claim.regionId === namingPanelRegionId.value) {
            refreshNamingPanel();
            feedback.show(t('placeNaming.imported', { name: claim.name }));
        } else {
            feedback.show(t('placeNaming.importedElsewhere', { name: claim.name }));
        }
    }

    // Announces an existing, already-signed claim on the chosen substrate; creating
    // a claim is a separate step. Reads the claim through the session, not the
    // panel's cached copy. A failed announcement never changes the local claim.
    function distributeNamingClaim(claimId) {
        if (!distributePlaceNamingClaimCommand) return;
        const regionId = namingPanelRegionId.value;
        if (!regionId) return;
        const claim = session.getPlaceNamingClaims(regionId).find((c) => c.id === claimId);
        if (!claim) return;
        const discoveryProvider = namingPanelDiscoveryProvider.value;

        namingPanelDistributionRequestId.value += 1;
        const requestId = namingPanelDistributionRequestId.value;
        namingPanelDistributionClaimId.value = claimId;
        namingPanelDistributionExecuting.value = true;
        namingPanelDistributionError.value = null;
        namingPanelDistributionResult.value = null;

        return Promise.resolve()
            .then(() => distributePlaceNamingClaimCommand(claim, discoveryProvider))
            .then((result) => {
                if (namingPanelDistributionRequestId.value !== requestId) return;
                namingPanelDistributionExecuting.value = false;
                // A relay that declines resolves without `published`: not a success.
                if (!result || result.published !== true) {
                    namingPanelDistributionError.value = t('placeNaming.notAnnounced');
                    return;
                }
                namingPanelDistributionResult.value = { ...result, discoveryProvider };
            })
            .catch((error) => {
                if (namingPanelDistributionRequestId.value !== requestId) return;
                namingPanelDistributionExecuting.value = false;
                namingPanelDistributionError.value = (error && error.message) ? errorText(error) : t('placeNaming.distributionFailed');
            });
    }

    return {
        showNamingPanel, namingPanelRegionId, namingPanelClaims, namingPanelView, namingPanelPreferredName,
        namingPanelGeographicRegions, namingPanelGeographicView, namingPanelDiscoveryProvider,
        namingPanelDistributionClaimId, namingPanelDistributionExecuting, namingPanelDistributionError,
        namingPanelDistributionResult, namingPanelDistributionOfferClaimId, myIdentityId, refreshNamingPanel,
        openNamingPanel, closeNamingPanel, resetNamingPanelDistribution, publishNamingClaim, retractNamingClaim,
        setPreferredNamingName, clearPreferredNamingName, exportNamingClaim, importNamingClaim,
        distributeNamingClaim, dismissNamingClaimDistributionOffer
    };
}
