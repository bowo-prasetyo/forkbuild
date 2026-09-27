// World view template: the Own Publication panel. Each row of its Placements list
// carries its own Move and Remove, so the panel needs no host Move Placement.
// It renders in WorldView's scope, so it uses the names its setup() returns.
export const publicationSectionTemplate = `<!--
                    Outside the Explore-only content, so distributing your own Snapshot never
                    depends on primary mode, a peer or Encounters. The commands are this view's
                    thin wrappers, shared with WorldEncounterCanvas where they overlap.
                -->
                <div v-if="cameraPosition" class="world-view-section world-view-section--publication">
                    <OwnPublicationPanel
                        :publication="ownPublication"
                        :unpublishCommand="unpublishOwnPublication"
                        :placePublicationCommand="placeOwnPublication"
                        :snapshotDistributionCommand="distributeWorldEncounterSnapshot"
                        :snapshotDistributionStorageTypes="snapshotDistributionStorageTypes"
                        :defaultContentDistributionProvider="defaultContentDistributionProvider"
                        :publicationDistributionCommand="distributeWorldEncounterPublication"
                        :defaultDiscoveryDistributionProvider="defaultAnnouncementDiscoveryProvider"
                        :discoverSnapshotCommand="discoverOwnSnapshot"
                        :exportSnapshotCommand="exportOwnSnapshot"
                        :discoverSnapshotCandidatesCommand="discoverSnapshotCandidatesCommand"
                        :worldDiscoverySourceRegistry="worldDiscoverySourceRegistry"
                        :resolveSelectedSnapshotCommand="resolveSelectedSnapshotCommand"
                        :materializeSelectedSnapshotCommand="materializeSelectedSnapshotCommand"
                        :placementInfo="activePlacementInfo"
                        :getPublicationCommentariesCommand="getPublicationCommentariesCommand"
                        :addPublicationCommentaryCommand="addPublicationCommentaryCommand"
                        :viewerIdentityId="myIdentityId"
                        :getPublicationPlacementsCommand="getPublicationPlacementsCommand"
                        :movePlacementCommand="openPlacementEditor"
                        :removePlacementCommand="removePublicationPlacement"
                        :placementsRevision="placementsRevision"
                        :discoverSnapshotCandidatesWithOutcomeCommand="discoverSnapshotCandidatesWithOutcomeCommand"
                    />
                </div>
                <div v-else-if="activePlacementInfo" class="world-view-actions">
                    <button
                        class="action-btn"
                        :disabled="!activePlacementInfo.movable"
                        @click="openPlacementEditor(activePlacementInfo)"
                    >Move Placement</button>
                </div>`;
