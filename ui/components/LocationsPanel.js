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
//
// 0.5.8 — World View Contextual Focus & Information Hierarchy adds one
// more action to every row, Info, deliberately DISTINCT from Focus:
// Focus (pre-existing) moves the camera; Info opens
// ui/components/WorldFocusPanel.js's own read-only reading of the same
// row — a description, distance/direction, and which named place it
// sits inside — without moving anything. See core/WorldFocusContext.js's
// own header on why this panel is never itself called "Focus."
import { formatNumber, t } from '../i18n/i18n.js';
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
        'manage-names',
        // 0.5.8 — opens WorldFocusPanel for this row's own locationId.
        'inspect'
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
        t,
        formatPosition(loc) {
            const one = (value) => formatNumber(value, { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false });
            return t('units.coordinates', { x: one(loc.position.x), y: one(loc.position.y), z: one(loc.position.z) });
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
            :aria-label="t('locationsPanel.locations')"
            class="modal-overlay"
            @click.self="$emit('cancel')"
            @keydown="onKeydown"
        >
            <div class="modal-panel locations-panel">
                <h3>{{ t('locationsPanel.locations') }}</h3>
                <p class="locations-panel-hint">
                    {{ t('locationsPanel.navigationOnlyFocusingALocation') }}
                    <span v-if="canEdit">{{ t('locationsPanel.landmarksAreWorldContentYou') }}</span>
                </p>

                <p v-if="locations.length === 0" class="locations-panel-empty">
                    {{ t('locationsPanel.noLocationsKnownYetLoad') }}
                </p>

                <template v-else>
                    <section v-if="originLocations.length > 0" class="locations-panel-section">
                        <h4 class="locations-panel-section-title">{{ t('locationsPanel.world') }}</h4>
                        <ul class="locations-panel-list">
                            <li v-for="loc in originLocations" :key="loc.id" class="locations-panel-item">
                                <div class="locations-panel-item-info">
                                    <span class="locations-panel-item-title">🏠 {{ loc.title }}</span>
                                    <span class="locations-panel-item-position">{{ formatPosition(loc) }}</span>
                                </div>
                                <button class="action-btn" @click="$emit('focus', loc.id)">{{ t('locationsPanel.focus') }}</button>
                            </li>
                        </ul>
                    </section>

                    <section v-if="structureLocations.length > 0" class="locations-panel-section">
                        <h4 class="locations-panel-section-title">{{ t('locationsPanel.structures') }}</h4>
                        <ul class="locations-panel-list">
                            <li v-for="loc in structureLocations" :key="loc.id" class="locations-panel-item">
                                <div class="locations-panel-item-info">
                                    <span class="locations-panel-item-title">📍 {{ loc.title }}</span>
                                    <span class="locations-panel-item-position">{{ formatPosition(loc) }}</span>
                                </div>
                                <div class="locations-panel-item-actions">
                                    <button class="action-btn" @click="$emit('focus', loc.id)">{{ t('locationsPanel.focus') }}</button>
                                    <button class="action-btn" @click="$emit('inspect', loc.id)">{{ t('locationsPanel.info') }}</button>
                                </div>
                            </li>
                        </ul>
                    </section>

                    <section class="locations-panel-section">
                        <div class="locations-panel-section-header">
                            <h4 class="locations-panel-section-title">{{ t('locationsPanel.landmarks') }}</h4>
                            <button v-if="canEdit" class="action-btn" @click="$emit('add-landmark')">{{ t('locationsPanel.addLandmark') }}</button>
                        </div>
                        <p v-if="landmarkLocations.length === 0" class="locations-panel-empty">
                            {{ t('locationsPanel.noLandmarksYetMarkA') }}
                        </p>
                        <ul v-else class="locations-panel-list">
                            <li v-for="loc in landmarkLocations" :key="loc.id" class="locations-panel-item">
                                <div class="locations-panel-item-info">
                                    <span class="locations-panel-item-title">★ {{ loc.title }}</span>
                                    <span class="locations-panel-item-position">{{ formatPosition(loc) }}</span>
                                </div>
                                <div class="locations-panel-item-actions">
                                    <button class="action-btn" @click="$emit('focus', loc.id)">{{ t('locationsPanel.focus') }}</button>
                                    <button class="action-btn" @click="$emit('inspect', loc.id)">{{ t('locationsPanel.info') }}</button>
                                    <button v-if="canEdit" class="action-btn" @click="$emit('edit-landmark', loc.id)">{{ t('locationsPanel.edit') }}</button>
                                    <button v-if="canEdit" class="action-btn action-btn--danger" @click="$emit('remove-landmark', loc.id)">{{ t('locationsPanel.remove') }}</button>
                                </div>
                            </li>
                        </ul>
                    </section>

                    <section class="locations-panel-section">
                        <div class="locations-panel-section-header">
                            <h4 class="locations-panel-section-title">{{ t('locationsPanel.places') }}</h4>
                            <button v-if="canEdit" class="action-btn" @click="$emit('add-region')">{{ t('locationsPanel.nameThisArea') }}</button>
                        </div>
                        <p v-if="regionLocations.length === 0" class="locations-panel-empty">
                            {{ t('locationsPanel.noNamedAreasYetGive') }}
                        </p>
                        <ul v-else class="locations-panel-list">
                            <li v-for="loc in regionLocations" :key="loc.id" class="locations-panel-item">
                                <div class="locations-panel-item-info">
                                    <span class="locations-panel-item-title">⬢ {{ loc.title }}</span>
                                    <span class="locations-panel-item-position">{{ formatPosition(loc) }}</span>
                                </div>
                                <div class="locations-panel-item-actions">
                                    <button class="action-btn" @click="$emit('focus', loc.id)">{{ t('locationsPanel.focus') }}</button>
                                    <button class="action-btn" @click="$emit('inspect', loc.id)">{{ t('locationsPanel.info') }}</button>
                                    <button class="action-btn" @click="$emit('manage-names', loc.id)">{{ t('locationsPanel.names') }}</button>
                                    <button v-if="canEdit" class="action-btn" @click="$emit('edit-region', loc.id)">{{ t('locationsPanel.edit') }}</button>
                                    <button v-if="canEdit" class="action-btn action-btn--danger" @click="$emit('remove-region', loc.id)">{{ t('locationsPanel.remove') }}</button>
                                </div>
                            </li>
                        </ul>
                    </section>
                </template>

                <div class="modal-actions">
                    <button class="action-btn" @click="$emit('cancel')">{{ t('locationsPanel.close') }}</button>
                </div>
            </div>
        </div>
    `
};
