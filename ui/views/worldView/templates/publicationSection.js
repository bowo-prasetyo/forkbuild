// World view template: the Own Publication panel, with Move Placement beside its Place action.
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
                        :discoverSnapshotCandidatesWithOutcomeCommand="discoverSnapshotCandidatesWithOutcomeCommand"
                    >
                        <template #placement-actions>
                            <button
                                v-if="activePlacementInfo"
                                class="action-btn"
                                :disabled="!activePlacementInfo.movable"
                                @click="openPlacementEditor(activePlacementInfo)"
                            >Move Placement</button>
                        </template>
                    </OwnPublicationPanel>
                </div>
                <div v-else-if="activePlacementInfo" class="world-view-actions">
                    <button
                        class="action-btn"
                        :disabled="!activePlacementInfo.movable"
                        @click="openPlacementEditor(activePlacementInfo)"
                    >Move Placement</button>
                </div>`;
