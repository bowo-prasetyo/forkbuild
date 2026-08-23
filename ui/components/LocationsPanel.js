// 0.2.94 — World View Location & Navigation.
//
// A read-only browser over WorldNavigationSession#getWorldLocations() —
// "Home" plus every structure this session currently knows about — each
// row with exactly one action: Focus. There is deliberately no Select or
// Inspect here (contrast ui/components/WorldLocationBrowser.js, which
// browses DOCUMENTS by camera region and offers all three) — a
// WorldLocation is not a document and carries no active-document
// concept of its own; see core/WorldLocation.js's own header. Focusing a
// location never loads a new document, never changes the active
// document, and never touches selection — purely camera navigation, the
// same "Navigate ≠ Modify" boundary every other World View navigation
// entry point in this codebase already holds to.
//
// 0.3.7 — World Landmarks & Personal Waypoints adds the one exception
// to "no Edit here": a LANDMARK location, unlike a STRUCTURE one, isn't
// read from someone else's identity (core/WorldLocation.js's own
// header) — it IS World content a collaborator with EDIT access may
// create/rename/redescribe/remove directly, per docs/Principles.md,
// "A Landmark Is World Content, Not Spatial Presence (0.3.7)." Rows are
// grouped (World / Structures / Landmarks) so that distinction — derived
// place vs. intentional content — stays visible, not just a shared flat
// list with different icons. `canEdit` is a pure reflect of
// WorldNavigationSession#canEditDocument(activeDocumentId) — this panel
// never decides authorization, only shows or hides the affordance; the
// session methods behind add-landmark/edit-landmark/remove-landmark
// enforce it again regardless of what this panel shows.
//
// 0.5.0 — World Regions & Decentralized Place Naming adds a fourth
// section, Places, following the exact same pattern as Landmarks: a
// REGION location is also World content an EDIT member may create/
// rename/redescribe/remove directly (add-region/edit-region/remove-region),
// distinguished here only because it names an AREA rather than a point.
//
// 0.5.2 — Place Naming & Naming Claims adds one more region action,
// Names, deliberately NOT gated by `canEdit` the way Edit/Remove are:
// opening ui/components/PlaceNamingPanel.js to publish/retract a
// naming claim needs no World edit authority, only a signed-in
// identity — see that panel's own header.
export default {
    name: 'LocationsPanel',
    props: {
        // Array of WorldLocation#toJSON() shapes: { id, title, kind, position }.
        locations: {
            type: Array,
            default: () => []
        },
        // Whether the active document currently accepts landmark/region
        // edits — gates Add/Edit/Remove; Focus is always available
        // regardless.
        canEdit: {
            type: Boolean,
            default: false
        }
    },
    emits: [
        'focus', 'cancel',
        'add-landmark', 'edit-landmark', 'remove-landmark',
        'add-region', 'edit-region', 'remove-region',
        // 0.5.2 — Place Naming & Naming Claims. Opens
        // ui/components/PlaceNamingPanel.js for one region. Deliberately
        // NOT gated by canEdit like edit-region/remove-region above —
        // see that panel's own header on why naming claims need no
        // World edit authority at all.
        'manage-names'
    ],
    computed: {
        originLocations() {
            return this.locations.filter((loc) => loc.kind === 'origin');
        },
        structureLocations() {
            return this.locations.filter((loc) => loc.kind === 'structure');
        },
        landmarkLocations() {
            return this.locations.filter((loc) => loc.kind === 'landmark');
        },
        regionLocations() {
            return this.locations.filter((loc) => loc.kind === 'region');
        }
    },
    methods: {
        formatPosition(loc) {
            return `${loc.position.x.toFixed(1)}, ${loc.position.y.toFixed(1)}, ${loc.position.z.toFixed(1)}`;
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
            aria-label="Locations"
            class="modal-overlay"
            @click.self="$emit('cancel')"
            @keydown="onKeydown"
        >
            <div class="modal-panel locations-panel">
                <h3>Locations</h3>
                <p class="locations-panel-hint">
                    Navigation only — focusing a location moves the camera; it never loads or selects anything.
                    <span v-if="canEdit">Landmarks are World content you can add, rename, or remove here.</span>
                </p>

                <p v-if="locations.length === 0" class="locations-panel-empty">
                    No locations known yet — load or place a structure to see it here.
                </p>

                <template v-else>
                    <section v-if="originLocations.length > 0" class="locations-panel-section">
                        <h4 class="locations-panel-section-title">World</h4>
                        <ul class="locations-panel-list">
                            <li v-for="loc in originLocations" :key="loc.id" class="locations-panel-item">
                                <div class="locations-panel-item-info">
                                    <span class="locations-panel-item-title">🏠 {{ loc.title }}</span>
                                    <span class="locations-panel-item-position">{{ formatPosition(loc) }}</span>
                                </div>
                                <button class="action-btn" @click="$emit('focus', loc.id)">Focus</button>
                            </li>
                        </ul>
                    </section>

                    <section v-if="structureLocations.length > 0" class="locations-panel-section">
                        <h4 class="locations-panel-section-title">Structures</h4>
                        <ul class="locations-panel-list">
                            <li v-for="loc in structureLocations" :key="loc.id" class="locations-panel-item">
                                <div class="locations-panel-item-info">
                                    <span class="locations-panel-item-title">📍 {{ loc.title }}</span>
                                    <span class="locations-panel-item-position">{{ formatPosition(loc) }}</span>
                                </div>
                                <button class="action-btn" @click="$emit('focus', loc.id)">Focus</button>
                            </li>
                        </ul>
                    </section>

                    <section class="locations-panel-section">
                        <div class="locations-panel-section-header">
                            <h4 class="locations-panel-section-title">Landmarks</h4>
                            <button v-if="canEdit" class="action-btn" @click="$emit('add-landmark')">+ Add Landmark</button>
                        </div>
                        <p v-if="landmarkLocations.length === 0" class="locations-panel-empty">
                            No landmarks yet — mark a place worth remembering.
                        </p>
                        <ul v-else class="locations-panel-list">
                            <li v-for="loc in landmarkLocations" :key="loc.id" class="locations-panel-item">
                                <div class="locations-panel-item-info">
                                    <span class="locations-panel-item-title">★ {{ loc.title }}</span>
                                    <span class="locations-panel-item-position">{{ formatPosition(loc) }}</span>
                                </div>
                                <div class="locations-panel-item-actions">
                                    <button class="action-btn" @click="$emit('focus', loc.id)">Focus</button>
                                    <button v-if="canEdit" class="action-btn" @click="$emit('edit-landmark', loc.id)">Edit</button>
                                    <button v-if="canEdit" class="action-btn action-btn--danger" @click="$emit('remove-landmark', loc.id)">Remove</button>
                                </div>
                            </li>
                        </ul>
                    </section>

                    <section class="locations-panel-section">
                        <div class="locations-panel-section-header">
                            <h4 class="locations-panel-section-title">Places</h4>
                            <button v-if="canEdit" class="action-btn" @click="$emit('add-region')">+ Name This Area</button>
                        </div>
                        <p v-if="regionLocations.length === 0" class="locations-panel-empty">
                            No named areas yet — give a stretch of this World a name.
                        </p>
                        <ul v-else class="locations-panel-list">
                            <li v-for="loc in regionLocations" :key="loc.id" class="locations-panel-item">
                                <div class="locations-panel-item-info">
                                    <span class="locations-panel-item-title">⬢ {{ loc.title }}</span>
                                    <span class="locations-panel-item-position">{{ formatPosition(loc) }}</span>
                                </div>
                                <div class="locations-panel-item-actions">
                                    <button class="action-btn" @click="$emit('focus', loc.id)">Focus</button>
                                    <button class="action-btn" @click="$emit('manage-names', loc.id)">Names</button>
                                    <button v-if="canEdit" class="action-btn" @click="$emit('edit-region', loc.id)">Edit</button>
                                    <button v-if="canEdit" class="action-btn action-btn--danger" @click="$emit('remove-region', loc.id)">Remove</button>
                                </div>
                            </li>
                        </ul>
                    </section>
                </template>

                <div class="modal-actions">
                    <button class="action-btn" @click="$emit('cancel')">Close</button>
                </div>
            </div>
        </div>
    `
};
