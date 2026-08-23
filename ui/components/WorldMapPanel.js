import {
    createMapViewport,
    projectPosition,
    projectRegion,
    unprojectPoint,
    regionPresentationTier,
    suggestMapExtent,
    MIN_MAP_SPAN,
    MAX_MAP_SPAN
} from '../../core/WorldMapProjection.js';

// 0.5.1 — World Maps & Geographic Navigation.
//
// A top-down 2D reading of exactly the World content
// `session.getMapContent()` already returns — regions, landmarks,
// structures, collaborators, and the viewer's own position — projected
// through core/WorldMapProjection.js's pure math. Like
// ui/components/CompassIndicator.js before it, this component is a
// DERIVED VIEW, not a second World: it never receives raw World/Command
// access, only the already-gathered `content` prop, and it never emits
// anything but navigation requests (`focus-location`/`focus-collaborator`
// — the SAME two verbs ui/components/LocationsPanel.js already emits,
// routed by the host to the SAME session.focusLocation()/
// focusCollaborator() every other navigation entry point in this
// codebase uses). See docs/Principles.md, "A World Map Is A Derived
// View, Never A Second World (0.5.1)."
//
// Panning and zooming the map are entirely LOCAL viewer state —
// `centerX`/`centerZ`/`span` below — never touched by, and never
// touching, the actual 3D camera or the World itself. Clicking a place
// or person moves the 3D camera (via the emits above); clicking empty
// map space only recenters the MAP's own view, one step more
// conservative than "never changes the World" — it doesn't even change
// what the viewer is looking at in 3D. This mirrors the design
// conversation's own framing directly: "Clicking the map never changes
// the World. It only changes the local camera" — and here, panning
// doesn't even reach that far.
//
// The starting viewport (suggestMapExtent()) is computed ONCE, in
// data(), from whatever `content` this component was created with — see
// that function's own header. It is deliberately NOT re-derived when
// `content` changes (the host refreshes `content` every few seconds so
// collaborator dots keep moving — see ui/views/WorldView.js's own
// refreshSpatialUI()) — only the PROJECTED markers are reactive to a
// content refresh; the viewer's own pan/zoom choice is never silently
// reset out from under them.
const MAP_SIZE = 600;
const ZOOM_STEP = 1.5;

export default {
    name: 'WorldMapPanel',
    props: {
        // { regions, landmarks, structures, collaborators, viewerPosition }
        // — exactly WorldNavigationSession#getMapContent()'s own shape.
        content: {
            type: Object,
            default: () => ({ regions: [], landmarks: [], structures: [], collaborators: [], viewerPosition: null })
        }
    },
    emits: ['focus-location', 'focus-collaborator', 'cancel'],
    data() {
        const points = [
            ...this.content.regions.map((r) => r.position),
            ...this.content.landmarks.map((l) => l.position),
            ...this.content.structures.map((s) => s.position),
            ...this.content.collaborators.map((c) => c.position)
        ];
        const extent = suggestMapExtent(this.content.viewerPosition, points);
        return {
            centerX: extent.centerX,
            centerZ: extent.centerZ,
            span: extent.span
        };
    },
    computed: {
        viewport() {
            return createMapViewport({
                centerX: this.centerX,
                centerZ: this.centerZ,
                span: this.span,
                width: MAP_SIZE,
                height: MAP_SIZE
            });
        },
        projectedRegions() {
            return this.content.regions
                .map((region) => {
                    const projected = projectRegion(region, this.viewport);
                    return {
                        id: region.id,
                        name: region.name,
                        kind: region.kind,
                        tier: regionPresentationTier(region.kind),
                        ...projected
                    };
                })
                .filter((region) => region.visible)
                // Broadest first, so a CONTINENT never paints over and
                // hides a VILLAGE drawn inside it — purely a z-order
                // convenience, see core/WorldMapProjection.js's own
                // header on presentation tiers never affecting geometry.
                .sort((a, b) => b.radius - a.radius);
        },
        projectedLandmarks() {
            return this.content.landmarks
                .map((landmark) => ({ id: landmark.id, title: landmark.title, ...projectPosition(landmark.position, this.viewport) }))
                .filter((landmark) => landmark.visible);
        },
        projectedStructures() {
            return this.content.structures
                .map((structure) => ({ id: structure.id, title: structure.title, ...projectPosition(structure.position, this.viewport) }))
                .filter((structure) => structure.visible);
        },
        projectedCollaborators() {
            return this.content.collaborators
                .map((collab) => ({
                    identityId: collab.identityId,
                    deviceId: collab.deviceId,
                    label: collab.label,
                    ...projectPosition(collab.position, this.viewport)
                }))
                .filter((collab) => collab.visible);
        },
        viewerMarker() {
            if (!this.content.viewerPosition) {
                return null;
            }
            const projected = projectPosition(this.content.viewerPosition, this.viewport);
            return projected.visible ? projected : null;
        },
        canZoomIn() {
            return this.span > MIN_MAP_SPAN;
        },
        canZoomOut() {
            return this.span < MAX_MAP_SPAN;
        },
        scaleLabel() {
            return this.span >= 1000 ? `${(this.span / 1000).toFixed(1)}km across` : `${Math.round(this.span)}m across`;
        }
    },
    methods: {
        initial(label) {
            return (label || '?').trim().charAt(0).toUpperCase() || '?';
        },
        zoomIn() {
            this.span = Math.max(MIN_MAP_SPAN, this.span / ZOOM_STEP);
        },
        zoomOut() {
            this.span = Math.min(MAX_MAP_SPAN, this.span * ZOOM_STEP);
        },
        centerOnMe() {
            if (!this.content.viewerPosition) {
                return;
            }
            this.centerX = this.content.viewerPosition.x;
            this.centerZ = this.content.viewerPosition.z;
        },
        // Background click/tap only — markers stop propagation (see
        // template's @click.stop on every marker below) so this never
        // fires for a click that already navigated the camera.
        onBackgroundInteract(event) {
            const rect = this.$refs.mapSvg.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) {
                return;
            }
            const mapX = (event.clientX - rect.left) / rect.width * MAP_SIZE;
            const mapY = (event.clientY - rect.top) / rect.height * MAP_SIZE;
            const world = unprojectPoint(mapX, mapY, this.viewport);
            this.centerX = world.x;
            this.centerZ = world.z;
        },
        onWheel(event) {
            event.preventDefault();
            if (event.deltaY < 0) {
                this.zoomIn();
            } else if (event.deltaY > 0) {
                this.zoomOut();
            }
        },
        onKeydown(event) {
            if (event.key === 'Escape') {
                event.stopPropagation();
                this.$emit('cancel');
            }
        }
    },
    template: `
        <div
            role="dialog"
            aria-label="World Map"
            class="modal-overlay"
            @click.self="$emit('cancel')"
            @keydown="onKeydown"
        >
            <div class="modal-panel world-map-panel">
                <h3>World Map</h3>
                <p class="world-map-hint">
                    Click a place or person to move your camera there. Click empty map space to pan; scroll or use +/- to zoom.
                    Nothing here edits the World — this is only a view.
                </p>

                <div class="world-map-toolbar">
                    <button class="action-btn" @click="zoomOut" :disabled="!canZoomOut">−</button>
                    <span class="world-map-scale">{{ scaleLabel }}</span>
                    <button class="action-btn" @click="zoomIn" :disabled="!canZoomIn">+</button>
                    <button class="action-btn" :disabled="!content.viewerPosition" @click="centerOnMe">Center On Me</button>
                </div>

                <svg
                    ref="mapSvg"
                    class="world-map-svg"
                    viewBox="0 0 600 600"
                    @wheel="onWheel"
                >
                    <rect class="world-map-background" x="0" y="0" width="600" height="600" @click="onBackgroundInteract" />

                    <g v-for="region in projectedRegions" :key="'region:' + region.id">
                        <circle
                            class="world-map-region"
                            :class="'world-map-region--tier-' + region.tier"
                            :cx="region.x" :cy="region.y" :r="region.radius"
                            @click.stop="$emit('focus-location', region.id)"
                        >
                            <title>{{ region.name }}</title>
                        </circle>
                        <text
                            v-if="region.radius > 14"
                            class="world-map-region-label"
                            :class="'world-map-region-label--tier-' + region.tier"
                            :x="region.x" :y="region.y"
                            @click.stop="$emit('focus-location', region.id)"
                        >{{ region.name }}</text>
                    </g>

                    <g
                        v-for="structure in projectedStructures"
                        :key="'structure:' + structure.id"
                        class="world-map-marker world-map-marker--structure"
                        :transform="'translate(' + structure.x + ',' + structure.y + ')'"
                        @click.stop="$emit('focus-location', structure.id)"
                    >
                        <text class="world-map-marker-glyph" text-anchor="middle" dy="4">▪</text>
                        <text class="world-map-marker-label" text-anchor="middle" dy="16">{{ structure.title }}</text>
                        <title>{{ structure.title }}</title>
                    </g>

                    <g
                        v-for="landmark in projectedLandmarks"
                        :key="'landmark:' + landmark.id"
                        class="world-map-marker world-map-marker--landmark"
                        :transform="'translate(' + landmark.x + ',' + landmark.y + ')'"
                        @click.stop="$emit('focus-location', landmark.id)"
                    >
                        <text class="world-map-marker-glyph" text-anchor="middle" dy="4">★</text>
                        <text class="world-map-marker-label" text-anchor="middle" dy="16">{{ landmark.title }}</text>
                        <title>{{ landmark.title }}</title>
                    </g>

                    <g
                        v-for="collab in projectedCollaborators"
                        :key="'collaborator:' + collab.identityId"
                        class="world-map-marker world-map-marker--collaborator"
                        :transform="'translate(' + collab.x + ',' + collab.y + ')'"
                        @click.stop="$emit('focus-collaborator', collab.deviceId)"
                    >
                        <circle class="world-map-collaborator-dot" r="7"></circle>
                        <text class="world-map-collaborator-initial" text-anchor="middle" dy="3">{{ initial(collab.label) }}</text>
                        <text class="world-map-marker-label" text-anchor="middle" dy="18">{{ collab.label }}</text>
                        <title>{{ collab.label }}</title>
                    </g>

                    <g
                        v-if="viewerMarker"
                        class="world-map-marker world-map-marker--viewer"
                        :transform="'translate(' + viewerMarker.x + ',' + viewerMarker.y + ')'"
                    >
                        <text class="world-map-marker-glyph" text-anchor="middle" dy="4">▲</text>
                        <text class="world-map-marker-label" text-anchor="middle" dy="16">You</text>
                    </g>
                </svg>

                <p v-if="content.regions.length === 0 && content.landmarks.length === 0 && content.structures.length === 0" class="world-map-empty">
                    Nothing named or built here yet — the map fills in as this World does.
                </p>

                <div class="modal-actions">
                    <button class="action-btn" @click="$emit('cancel')">Close</button>
                </div>
            </div>
        </div>
    `
};
