import { derivePlaceContexts, describeLocation } from '../../core/WorldCurationContext.js';
import { deriveWorldWelcomeContext } from '../../core/WorldWelcomeContext.js';
import { groupRegionsByPlaceIdentity } from '../../core/PlaceIdentity.js';
import { geographicPlaceForRegion } from '../../core/GeographicPlaceResolution.js';
import { buildGeographicPlaceDirectory, geographicPlaceByKey } from '../../core/GeographicPlaceDirectory.js';
import {
    DEFAULT_NEARBY_GEOGRAPHIC_PLACE_RADIUS, deriveNearbyGeographicPlaces, geographicPlaceLocationId,
    isGeographicPlaceLocationId, geographicPlaceFingerprintKeyFromLocationId,
    searchGeographicPlaces as searchGeographicPlaceRows
} from '../../core/GeographicPlaceNavigation.js';
import { deriveWorldFocusContext, WorldFocusKind } from '../../core/WorldFocusContext.js';
import { regionsContaining, describePlace } from '../../core/WorldRegionGeography.js';
import { LOCATION_FOCUS_OFFSET } from './constants.js';

// WorldNavigationSession read-only place queries: locations, collaborators,
// place contexts, welcome context, regions, geographic places and their
// directory, focus contexts, the current region path and map content.
export const placeQueryMethods = {
    // Every navigable WorldLocation: the fixed Origin plus one per
    // StructurePlacement across loaded documents. A pure query.
    getWorldLocations() {
        return this._worldLocationDirectory.list();
    },

    // Other collaborators spatially present across every entered World, one row
    // per identity: `{ identityId, label, position, activity, activityTarget }`.
    // Shared by getPlaceContexts() and getWelcomeContext(). The roster has one
    // entry per device, so this picks each identity's first device with a
    // position. `resolveDisplayName` is optional; without it, a truncated
    // identityId is used. Never throws; [] when no World is entered.
    _getPresentCollaborators(resolveDisplayName) {
        const collaborators = [];
        const seen = new Set();
        for (const documentId of this._presentSpatialWorldDocumentIds) {
            const roster = this.getWorldSpatialPresenceRoster(documentId);
            for (const group of roster) {
                if (seen.has(group.identityId)) {
                    continue;
                }
                const device = group.devices.find((candidate) => candidate.position);
                if (!device) {
                    continue;
                }
                seen.add(group.identityId);
                collaborators.push({
                    identityId: group.identityId,
                    label: typeof resolveDisplayName === 'function' ? resolveDisplayName(group.identityId) : this._shortIdentityLabel(group.identityId),
                    position: device.position,
                    activity: device.activity,
                    activityTarget: this._resolveSpatialContextualLabel(device.selection),
                    // Carried through so a "Follow" affordance built on
                    // top of this row (see core/WorldWelcomeContext.js's
                    // nearby-collaborator shape) can call
                    // focusCollaborator(deviceId) directly.
                    deviceId: device.deviceId
                });
            }
        }
        return collaborators;
    },

    // Derived place contexts around landmarks: the landmark plus nearby
    // structures, landmarks and collaborators. Never persisted or authoritative;
    // see core/WorldCurationContext.js.
    getPlaceContexts(resolveDisplayName) {
        const landmarks = [];
        const structurePlacements = [];
        const structureTitles = new Map();

        for (const document of this.getLoadedDocuments()) {
            const world = document.world;
            for (const landmark of world.getWorldLandmarks()) {
                landmarks.push(landmark);
            }
            for (const placement of world.getStructurePlacements()) {
                structurePlacements.push(placement);
                structureTitles.set(placement.documentId, this.getSavedDocumentTitle(placement.documentId));
            }
        }

        const collaborators = this._getPresentCollaborators(resolveDisplayName);

        return derivePlaceContexts({
            landmarks,
            structurePlacements,
            structureTitles,
            collaborators
        });
    },

    // A readable description of the current location, e.g. "In Village" or
    // "Near Old Bridge"; empty when nothing meaningful can be derived.
    getCurrentLocationDescription() {
        const cameraPos = this.getCameraPosition();
        if (!cameraPos) {
            return '';
        }

        const landmarks = [];
        const structurePlacements = [];
        const structureTitles = new Map();

        for (const document of this.getLoadedDocuments()) {
            const world = document.world;
            for (const landmark of world.getWorldLandmarks()) {
                landmarks.push(landmark);
            }
            for (const placement of world.getStructurePlacements()) {
                structurePlacements.push(placement);
                structureTitles.set(placement.documentId, this.getSavedDocumentTitle(placement.documentId));
            }
        }

        return describeLocation({
            position: cameraPos,
            landmarks,
            structurePlacements,
            structureTitles
        });
    },

    // Focuses the camera on a landmark with the same animation as
    // focusLocation(). Returns false for an unknown landmarkId.
    focusPlace(landmarkId) {
        const landmarks = [];
        for (const document of this.getLoadedDocuments()) {
            const world = document.world;
            for (const landmark of world.getWorldLandmarks()) {
                if (landmark.id === landmarkId) {
                    landmarks.push(landmark);
                }
            }
        }

        if (landmarks.length === 0) {
            return false;
        }

        const landmark = landmarks[0];
        const { x, y, z } = landmark.position;
        this._beginCameraFocus({
            position: { x: x + LOCATION_FOCUS_OFFSET.x, y: y + LOCATION_FOCUS_OFFSET.y, z: z + LOCATION_FOCUS_OFFSET.z },
            target: { x, y, z }
        });
        return true;
    },

    // Derives a WorldWelcomeContext for the active document's World from the
    // landmarks/structures getPlaceContexts() gathers, the live spatial roster
    // and the avatar's position (or the camera's). Never persisted, never
    // mutates. See core/WorldWelcomeContext.js and docs/Principles.md,
    // "Exploration Guides Attention, Never Ownership or Mutation". Null with no
    // active document.
    getWelcomeContext(resolveDisplayName) {
        const activeDocumentId = this.getActiveDocumentId();
        const activeDocument = activeDocumentId ? this.getDocument(activeDocumentId) : null;
        if (!activeDocument) {
            return null;
        }

        const landmarks = [];
        const structurePlacements = [];
        const structureTitles = new Map();
        for (const document of this.getLoadedDocuments()) {
            const world = document.world;
            for (const landmark of world.getWorldLandmarks()) {
                landmarks.push(landmark);
            }
            for (const placement of world.getStructurePlacements()) {
                structurePlacements.push(placement);
                structureTitles.set(placement.documentId, this.getSavedDocumentTitle(placement.documentId));
            }
        }

        const collaborators = this._getPresentCollaborators(resolveDisplayName);
        const position = this.getAvatarPosition() || this.getCameraPosition();
        const placeContexts = derivePlaceContexts({ landmarks, structurePlacements, structureTitles, collaborators });
        // Regions across loaded documents, offset into the same shared layout space
        // as the avatar/camera position.
        const regions = this._collectRegions();
        // Already filtered, sorted and direction-labeled; see
        // getNearbyGeographicPlaces().
        const nearbyGeographicPlaces = this.getNearbyGeographicPlaces();

        return deriveWorldWelcomeContext({
            world: activeDocument.world,
            position,
            landmarks,
            structurePlacements,
            structureTitles,
            collaborators,
            placeContexts,
            regions,
            nearbyGeographicPlaces
        });
    },

    // Every WorldRegion across loaded documents, offset by getDocumentPosition
    // (the inverse of what createRegionHere() subtracts). Shared by
    // getWelcomeContext(), getCurrentRegionPath() and getRegions().
    _collectRegions() {
        const regions = [];
        for (const document of this.getLoadedDocuments()) {
            const layoutPosition = this.getDocumentPosition(document.world.id);
            for (const region of document.world.getWorldRegions()) {
                regions.push({
                    id: region.id,
                    worldId: document.world.id,
                    name: region.name,
                    description: region.description,
                    kind: region.kind,
                    radius: region.radius,
                    parentRegionId: region.parentRegionId,
                    authorIdentityId: region.authorIdentityId,
                    position: {
                        x: region.x + layoutPosition.x,
                        y: region.position.y + layoutPosition.y,
                        z: region.z + layoutPosition.z
                    }
                });
            }
        }
        return regions;
    },

    // Every known region across loaded documents, for the Places panel.
    getRegions() {
        return this._collectRegions();
    },

    // Every WorldRegion in its own native per-World coordinates, not offset
    // into the shared layout. That offset only keeps loaded Worlds from
    // overlapping on screen; using it would make cross-World geographic
    // comparison meaningless. core/PlaceFingerprint.js/PlaceIdentity.js only
    // ever see these positions.
    _collectRawRegions() {
        const regions = [];
        for (const document of this.getLoadedDocuments()) {
            for (const region of document.world.getWorldRegions()) {
                regions.push({
                    id: region.id,
                    worldId: document.world.id,
                    name: region.name,
                    kind: region.kind,
                    radius: region.radius,
                    authorIdentityId: region.authorIdentityId,
                    position: { x: region.x, y: region.position.y, z: region.z }
                });
            }
        }
        return regions;
    },

    // core/PlaceIdentity.js#groupRegionsByPlaceIdentity(), applied to
    // every region across every currently loaded document. Pure
    // geometry — candidacy only; see that module's own header on why a
    // matching fingerprint is never treated as proof that two regions
    // are the same place.
    getGeographicPlaceGroups(options = {}) {
        return groupRegionsByPlaceIdentity(this._collectRawRegions(), options);
    },

    // The combined naming view for the geographic place `regionId` belongs to:
    // every known region sharing its fingerprint and every claim on any of them,
    // ranked by distinct authors (see core/GeographicPlaceResolution.js).
    // Returns `{ regions, namingView }`; `namingView` is [] when naming claims
    // aren't wired. Always safe to call.
    getGeographicNamingView(regionId, options = {}) {
        const regions = this._collectRawRegions();
        const claims = this._collectClaimsFor(regions);
        const group = geographicPlaceForRegion(regionId, regions, claims, options);
        if (!group) {
            return { regions: [], namingView: [] };
        }
        return { regions: group.regions, namingView: group.namingView };
    },

    // Every geographic place candidate across loaded documents, for the Places
    // directory. Each entry is a derived GeographicPlaceView, never a stored
    // object:
    //
    //   WorldRegion -> PlaceFingerprint -> PlaceIdentity ->
    //   GeographicPlaceView -> UI
    //
    // Re-derived on every call; nothing is cached.
    getGeographicPlaceDirectory(options = {}) {
        const regions = this._collectRawRegions();
        const claims = this._collectClaimsFor(regions);
        return buildGeographicPlaceDirectory(regions, claims, options);
    },

    // One geographic place by its own fingerprint key — exactly the id
    // a getGeographicPlaceDirectory() row itself carries
    // (GeographicPlaceView#fingerprintKey) — so a directory row can be
    // opened directly without the caller needing to already hold a
    // regionId. Returns null for an unknown key, never a throw, the
    // same graceful-absence posture getGeographicNamingView() already
    // keeps for an unknown regionId.
    getGeographicPlace(fingerprintKey, options = {}) {
        const regions = this._collectRawRegions();
        const claims = this._collectClaimsFor(regions);
        return geographicPlaceByKey(fingerprintKey, regions, claims, options);
    },

    // Geographic places within `radius` of the viewer (avatar position, else
    // camera), nearest first; [] with no position. Positions resolve through
    // `_worldLocationDirectory`, the same lookup focusLocation() uses for
    // `place:<fingerprintKey>`, so "how far" and "where Go To Place takes me"
    // can't disagree. Nothing is stored; every call recomputes.
    getNearbyGeographicPlaces(radius = DEFAULT_NEARBY_GEOGRAPHIC_PLACE_RADIUS) {
        const position = this.getAvatarPosition() || this.getCameraPosition();
        if (!position) {
            return [];
        }
        return deriveNearbyGeographicPlaces(this._collectGeographicPlaceEntries(), position, radius);
    },

    // Shared by getNearbyGeographicPlaces() and getFocusContext(), so there is
    // one way to answer "how far away is a geographic place". Positions are
    // re-resolved through WorldLocationDirectory on every call.
    _collectGeographicPlaceEntries() {
        const entries = [];
        for (const place of this.getGeographicPlaceDirectory()) {
            const location = this._worldLocationDirectory.find(geographicPlaceLocationId(place.fingerprintKey));
            if (!location) {
                continue;
            }
            entries.push({
                fingerprintKey: place.fingerprintKey,
                displayName: place.displayName,
                descriptionCount: place.descriptionCount,
                worldCount: place.worldCount,
                authorCount: place.authorCount,
                position: { x: location.position.x, y: location.position.y, z: location.position.z }
            });
        }
        return entries;
    },

    // Every WorldLandmark across loaded documents, in shared layout space, plus
    // its description (which getMapContent()'s rows don't carry). Read-only
    // helper for getFocusContext().
    _collectFocusLandmarks() {
        const landmarks = [];
        for (const document of this.getLoadedDocuments()) {
            const layoutPosition = this.getDocumentPosition(document.world.id);
            for (const landmark of document.world.getWorldLandmarks()) {
                landmarks.push({
                    id: landmark.id,
                    documentId: document.world.id,
                    title: landmark.title,
                    description: landmark.description,
                    position: {
                        x: landmark.position.x + layoutPosition.x,
                        y: landmark.position.y + layoutPosition.y,
                        z: landmark.position.z + layoutPosition.z
                    }
                });
            }
        }
        return landmarks;
    },

    // Structure counterpart of _collectFocusLandmarks(); same shape as
    // getMapContent()'s structures, kept separate so getFocusContext() reads
    // symmetrically.
    _collectFocusStructures() {
        const structures = [];
        for (const document of this.getLoadedDocuments()) {
            const layoutPosition = this.getDocumentPosition(document.world.id);
            for (const placement of document.world.getStructurePlacements()) {
                structures.push({
                    id: placement.id,
                    // The placed structure's own content document: "Edit a Copy" forks this,
                    // never the World document that positions it (see
                    // core/WorldFocusContext.js). Same id WorldView.js#openStructureSource()
                    // loads.
                    documentId: placement.documentId,
                    title: this.getSavedDocumentTitle(placement.documentId),
                    position: {
                        x: placement.position.x + layoutPosition.x,
                        y: placement.position.y + layoutPosition.y,
                        z: placement.position.z + layoutPosition.z
                    }
                });
            }
        }
        return structures;
    },

    // The one place a WorldFocusContext is built: gathers the target, viewer
    // position, regions and geographic places, and hands them to the pure
    // deriveWorldFocusContext(). See getFocusContextForLocation()/
    // getFocusContextForCollaborator().
    _buildFocusContext(kind, entity) {
        if (!entity) {
            return null;
        }
        const viewerPosition = this.getAvatarPosition() || this.getCameraPosition();
        return deriveWorldFocusContext({
            kind,
            entity,
            viewerPosition,
            regions: this._collectRegions(),
            nearbyPlaceEntries: this._collectGeographicPlaceEntries()
        });
    },

    // Resolves a `locationId` (region/landmark/structure id, or a
    // `place:<fingerprintKey>` id) into a WorldFocusContext instead of a camera
    // move. Region/landmark/structure ids resolve against the richer
    // _collectRegions()/_collectFocusLandmarks()/_collectFocusStructures(),
    // because `_worldLocationDirectory.find()` lacks descriptions and region
    // kinds. Null for an unknown id, an ORIGIN id, or nothing loaded.
    getFocusContextForLocation(locationId) {
        if (!locationId) {
            return null;
        }
        if (isGeographicPlaceLocationId(locationId)) {
            const fingerprintKey = geographicPlaceFingerprintKeyFromLocationId(locationId);
            const entry = fingerprintKey
                ? this._collectGeographicPlaceEntries().find((e) => e.fingerprintKey === fingerprintKey)
                : null;
            return this._buildFocusContext(WorldFocusKind.GEOGRAPHIC_PLACE, entry);
        }
        const region = this._collectRegions().find((r) => r.id === locationId);
        if (region) {
            return this._buildFocusContext(WorldFocusKind.REGION, region);
        }
        const landmark = this._collectFocusLandmarks().find((l) => l.id === locationId);
        if (landmark) {
            return this._buildFocusContext(WorldFocusKind.LANDMARK, landmark);
        }
        const structure = this._collectFocusStructures().find((s) => s.id === locationId);
        if (structure) {
            return this._buildFocusContext(WorldFocusKind.STRUCTURE, structure);
        }
        return null;
    },

    // Collaborator counterpart of getFocusContextForLocation(), addressed by
    // `deviceId` like focusCollaborator(). Null for an unknown or departed
    // device.
    getFocusContextForCollaborator(deviceId, resolveDisplayName) {
        if (!deviceId) {
            return null;
        }
        const collaborator = this._getPresentCollaborators(resolveDisplayName).find((c) => c.deviceId === deviceId);
        if (!collaborator || !collaborator.position) {
            return null;
        }
        return this._buildFocusContext(WorldFocusKind.COLLABORATOR, {
            identityId: collaborator.identityId,
            deviceId: collaborator.deviceId,
            displayName: collaborator.label,
            activity: collaborator.activity,
            position: collaborator.position
        });
    },

    // A derived filter over getGeographicPlaceDirectory() (see
    // core/GeographicPlaceNavigation.js#searchGeographicPlaces()); no second
    // index, re-derived on every call.
    searchGeographicPlaces(query, options = {}) {
        return searchGeographicPlaceRows(this.getGeographicPlaceDirectory(options), query);
    },

    // Every claim this replica has on file for any of `regions` —
    // gathered per (worldId, regionId), since
    // application/placeNaming/LocalPlaceNamingClaimStore.js is scoped per World.
    // Returns [] when naming claims were never wired, the same
    // graceful-degradation posture getPlaceNamingClaims() itself keeps.
    _collectClaimsFor(regions) {
        if (!this._placeNamingClaimUseCase) {
            return [];
        }
        const claims = [];
        for (const region of regions) {
            claims.push(...this._placeNamingClaimUseCase.claimsForRegion(region.worldId, region.id));
        }
        return claims;
    },

    // Every named region containing the viewer, innermost first; see
    // core/WorldRegionGeography.js#regionsContaining().
    getCurrentRegionPath() {
        const position = this.getAvatarPosition() || this.getCameraPosition();
        if (!position) {
            return [];
        }
        const regions = this._collectRegions();
        return regionsContaining(position, regions).map((region) => {
            const dx = region.position.x - position.x;
            const dz = region.position.z - position.z;
            return {
                id: region.id,
                name: region.name,
                kind: region.kind,
                distance: Math.round(Math.sqrt(dx * dx + dz * dz) * 10) / 10
            };
        });
    },

    // Every region/landmark/structure/collaborator known to this session across
    // all loaded documents, the same world-wide scope as
    // WorldLocationDirectory#list(): a map shows the whole World, not just the
    // streaming radius. Positions are offset into shared layout space like
    // _collectRegions(). `resolveDisplayName` is optional.
    //
    // A pure read. See core/WorldMapProjection.js and
    // ui/components/WorldMapPanel.js.
    getMapContent(resolveDisplayName) {
        const landmarks = [];
        const structures = [];
        for (const document of this.getLoadedDocuments()) {
            const layoutPosition = this.getDocumentPosition(document.world.id);
            for (const landmark of document.world.getWorldLandmarks()) {
                landmarks.push({
                    id: landmark.id,
                    title: landmark.title,
                    position: {
                        x: landmark.position.x + layoutPosition.x,
                        y: landmark.position.y + layoutPosition.y,
                        z: landmark.position.z + layoutPosition.z
                    }
                });
            }
            for (const placement of document.world.getStructurePlacements()) {
                structures.push({
                    id: placement.id,
                    title: this.getSavedDocumentTitle(placement.documentId),
                    position: {
                        x: placement.position.x + layoutPosition.x,
                        y: placement.position.y + layoutPosition.y,
                        z: placement.position.z + layoutPosition.z
                    }
                });
            }
        }

        return {
            regions: this._collectRegions(),
            landmarks,
            structures,
            collaborators: this._getPresentCollaborators(resolveDisplayName),
            viewerPosition: this.getAvatarPosition() || this.getCameraPosition()
        };
    },

    // Breadcrumb for the viewer's position, e.g. "Willow Village · Green
    // Valley". Falls back to describeLocation() (nearest landmark/structure)
    // when no region contains it; never a made-up name.
    getCurrentPlaceName() {
        const path = this.getCurrentRegionPath();
        const placeName = describePlace(path);
        return placeName || this.getCurrentLocationDescription();
    },
};
