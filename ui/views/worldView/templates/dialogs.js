// World view template: the prompts, dialogs and panels that open over the World.
// It renders in WorldView's scope, so it uses the names its setup() returns.
export const dialogsTemplate = `<ActionFeedback :message="feedbackMessage" :visible="feedbackVisible" />
            <!-- Keyboard hints; the touch pad's own buttons replace them. -->
            <template v-if="!touchPadVisible">
                <VehicleInteractionPrompt :state="vehicleInteractionState" :store-state="storeInteractionState" />
                <AnimalInteractionPrompt :state="animalInteractionState" :decoration-state="decorationInteractionState" />
                <ResidentInteractionPrompt v-if="avatarControlMode" :state="residentInteractionState" />
            </template>
            <!-- Look at what a resident just mentioned: shown on touch screens too. -->
            <ResidentSpeechActions :targets="residentFocusTargets" @focus="focusResidentMention" />
            <!-- What a resident just said, for screen readers; the bubble over its head shows it. -->
            <div class="visually-hidden" aria-live="polite">
                <template v-if="residentSpeech">{{ t('worldView.residentSays', { remarks: residentSpeech.remarks.join(' ') }) }}</template>
            </div>
            <MetadataEditorDialog
                v-if="showMetadataEditor"
                :info="metadataEditTarget"
                @save="onSaveMetadata"
                @cancel="showMetadataEditor = false; metadataEditTarget = null"
            />
            <HistoryTimelinePanel
                v-if="showHistoryPanel"
                :timeline="historyTimeline"
                :selected-entry-id="selectedHistoryEntryId"
                :preview-cursor="historyPreviewCursor"
                @select="selectHistoryEntry"
                @preview="previewSelectedHistoryEntry"
                @cancel-preview="cancelHistoryPreviewAction"
                @restore="restoreSelectedHistoryEntry"
                @cancel="closeHistoryPanel"
            />
            <PlacementEditorDialog
                v-if="showPlacementEditor"
                :info="placementEditTarget"
                :overlap-warning="placementOverlapWarning"
                @move="onMovePlacement"
                @cancel="closePlacementEditor"
            />
            <LocationDocumentsDialog
                v-if="showLocationDocuments"
                :position="locationDocumentsPosition"
                :occupants="locationDocumentsOccupants"
                @focus="focusLocationDocument"
                @cancel="closeLocationDocuments"
            />
            <WorldLocationBrowser
                v-if="showLocationBrowser"
                :center="locationBrowserCenter"
                :radius="locationBrowserRadius"
                :documents="locationBrowserDocuments"
                :diagnostics="locationBrowserDiagnostics"
                :inspected="locationBrowserInspected"
                :catalog-empty="catalogEmpty"
                @explore="reExploreLocationBrowser"
                @focus="focusLocationBrowserResult"
                @select="selectLocationBrowserResult"
                @inspect="inspectLocationBrowserResult"
                @cancel="closeLocationBrowser"
            />
            <LocationsPanel
                v-if="showLocationsPanel"
                :locations="worldLocations"
                :can-edit="canEditActiveWorld"
                @focus="focusLocation"
                @inspect="openFocusForLocation"
                @cancel="closeLocationsPanel"
                @add-landmark="openAddLandmarkForm"
                @edit-landmark="openEditLandmarkForm"
                @remove-landmark="removeLandmarkFromPanel"
                @add-region="openAddRegionForm"
                @edit-region="openEditRegionForm"
                @remove-region="removeRegionFromPanel"
                @manage-names="openNamingPanel"
            />
            <LandmarkFormModal
                v-if="showLandmarkForm"
                :landmark="landmarkFormTarget"
                @save="onSaveLandmarkForm"
                @cancel="closeLandmarkForm"
            />
            <RegionFormModal
                v-if="showRegionForm"
                :region="regionFormTarget"
                @save="onSaveRegionForm"
                @cancel="closeRegionForm"
            />
            <PlaceNamingPanel
                v-if="showNamingPanel"
                :region-id="namingPanelRegionId"
                :region-name="(worldLocations.find(l => l.id === namingPanelRegionId) || {}).title || ''"
                :naming-view="namingPanelView"
                :claims="namingPanelClaims"
                :preferred-name="namingPanelPreferredName"
                :geographic-regions="namingPanelGeographicRegions"
                :geographic-naming-view="namingPanelGeographicView"
                :my-identity-id="myIdentityId"
                :can-distribute="canDistributePlaceNamingClaim"
                v-model:discovery-provider="namingPanelDiscoveryProvider"
                :distribution-claim-id="namingPanelDistributionClaimId"
                :distribution-executing="namingPanelDistributionExecuting"
                :distribution-error="namingPanelDistributionError"
                :distribution-result="namingPanelDistributionResult"
                :distribution-offer-claim-id="namingPanelDistributionOfferClaimId"
                @publish-name="publishNamingClaim"
                @retract-name="retractNamingClaim"
                @set-preferred-name="setPreferredNamingName"
                @clear-preferred-name="clearPreferredNamingName"
                @export-claim="exportNamingClaim"
                @import-claim="importNamingClaim"
                @distribute-claim="distributeNamingClaim"
                @dismiss-distribution-offer="dismissNamingClaimDistributionOffer"
                @cancel="closeNamingPanel"
            />
            <WorldMapPanel
                v-if="showMapPanel"
                :content="mapContent"
                :highlight-region-keys="mapHighlightRegionKeys"
                @focus-location="focusLocation"
                @focus-collaborator="followCollaborator"
                @cancel="closeMapPanel"
            />
            <GeographicPlaceDirectoryPanel
                v-if="showGeographicPlaceDirectory"
                :places="geographicPlaces"
                :nearby="nearbyGeographicPlaces"
                @open-place="openGeographicPlace"
                @go-to-place="goToGeographicPlace"
                @cancel="closeGeographicPlaceDirectory"
            />
            <GeographicPlacePanel
                v-if="showGeographicPlacePanel"
                :place="geographicPlace"
                @focus-region="focusLocation"
                @open-names="openNamesFromPlace"
                @show-on-map="showGeographicPlaceOnMap"
                @go-to-place="goToGeographicPlace(geographicPlace.fingerprintKey)"
                @cancel="goBackInPlaces"
            />
            <WorldWelcomePanel
                v-if="showWelcomePanel"
                :context="welcomeContext"
                :is-arrival="welcomeIsArrival"
                :returning="welcomeIsReturning"
                :last-visited-at="worldReturnInfo && worldReturnInfo.lastVisitedAt"
                @explore="exploreWelcomeSuggestion"
                @go-to-place="goToGeographicPlace"
                @dismiss="closeWelcomePanel"
            />
            <WorldFocusPanel
                v-if="showFocusPanel"
                :context="focusContext"
                @go="goFromFocusPanel"
                @show-on-map="showFocusOnMap"
                @open-names="openNamesFromFocusPanel"
                @edit-copy="editFocusedCopyFromFocusPanel"
                @cancel="closeFocusPanel"
            />
            <WorldMembersPanel
                v-if="showMembersPanel"
                :roster="worldCollaborationRoster"
                :is-owner="isActiveWorldOwner"
                :pending-identity-id="collaborationPendingIdentityId"
                @grant="grantWorldMember"
                @revoke="revokeWorldMember"
                @cancel="closeMembersPanel"
            />
            <WalkTogetherDialog
                v-if="showWalkDialog"
                :state="walkState"
                :link="walkLink"
                :available="walkAvailable"
                :needs-publish="walkNeedsPublish"
                @retry="startWalk"
                @stop="stopWalk"
                @close="closeWalkDialog"
            />
            <LoginModal v-if="signInToWalk" purpose="walk" @signed-in="walkSignedIn" @close="signInToWalk = false" />
            <div v-if="showLobbyPanel && activeWorldLobby" role="dialog" :aria-label="t('worldView.worldLobby')" class="modal-overlay" @click.self="closeLobbyPanel">
                <div class="modal-panel">
                    <PublicLobbyPanel :lobby="activeWorldLobby" :title="t('worldView.thisWorldSLobby')" />
                    <div class="modal-actions">
                        <button class="action-btn" @click="closeLobbyPanel">{{ t('worldView.close') }}</button>
                    </div>
                </div>
            </div>`;
