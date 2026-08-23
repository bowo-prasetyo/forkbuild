import { formatRelativeVisit } from '../../utils/formatRelativeVisit.js';

// 0.3.9 — World Welcome & Guided Exploration.
//
// The presentation layer for core/WorldWelcomeContext.js: a newcomer's
// first few seconds in a World, and the same content reopenable at any
// time through the "Explore" toolbar button (see ui/views/WorldView.js's
// openWelcomePanel()/reopenExplorePanel()). Purely presentational — this
// component never calls WorldNavigationSession itself and never decides
// what counts as "nearby"; it only renders whatever
// session.getWelcomeContext().toJSON() already computed and emits which
// suggestion was picked, exactly the same "component emits, host view
// acts" split ui/components/WorldCollaboratorIndicator.js's own `follow`
// emit already established for Follow.
//
// Deliberately speaks product language, not architecture — see
// docs/Principles.md, "Exploration Guides Attention, Never Ownership or
// Mutation (0.3.9)": a newcomer sees "Places," "Landmarks," "Buildings,"
// "People," never StructurePlacement/WorldSpatialPresence/
// WorldCurationContext. And deliberately excludes anything that would
// turn this into a quest system — no objectives, no progress, no
// rewards: every row here is just a label and a reason drawn from
// content someone already placed.
export default {
    name: 'WorldWelcomePanel',
    props: {
        // WorldWelcomeContext#toJSON() shape — see core/WorldWelcomeContext.js.
        context: {
            type: Object,
            default: null
        },
        // True for the automatic first-arrival showing ("Welcome to X" /
        // "Explore Freely" dismiss); false when reopened later via the
        // toolbar's "Explore" button (plain title / "Close" dismiss) —
        // the same content and actions either way, only the framing
        // changes.
        isArrival: {
            type: Boolean,
            default: true
        },
        // 0.3.10 — World Persistence & Return Experience. True only for
        // the automatic arrival showing of a World this replica has a
        // prior LOCAL camera experience for (session.hasVisitedWorld())
        // — purely presentational, swaps "Welcome to X" for "Welcome
        // back to X" and "Explore Freely" for "Continue Exploring."
        // Never changes what content this panel shows, only the framing
        // — the same "framing only" contract `isArrival` above already
        // has. See ui/views/WorldView.js's own worldReturnInfo/
        // welcomeIsReturning header.
        returning: {
            type: Boolean,
            default: false
        },
        // Epoch ms of this replica's PRIOR visit to this World, or null
        // — only meaningful alongside `returning: true`.
        lastVisitedAt: {
            type: Number,
            default: null
        }
    },
    emits: ['explore', 'dismiss', 'go-to-place'],
    computed: {
        lastVisitedLabel() {
            return this.returning ? formatRelativeVisit(this.lastVisitedAt) : null;
        },
        // 0.5.6 — Geographic Place Navigation & Arrival. "You are IN"
        // only for a named WorldRegion the viewer is actually standing
        // inside (real, human-authored geometry — context.placeName);
        // "You are NEAR" for the closest geographic place CANDIDATE
        // (context.primaryGeographicPlace) — a cross-World identity
        // guess, never confirmed, so it never earns "in." Neither
        // implies the other: a viewer can be in a named region with no
        // geographic-place candidate nearby, near a candidate with no
        // named region containing them, both, or neither (null). See
        // docs/Principles.md, "A Geographic Place Is Navigable; It Does
        // Not Become World Content (0.5.6)."
        arrivalNote() {
            if (this.context && this.context.placeName) {
                return `You are in ${this.context.placeName}`;
            }
            if (this.context && this.context.primaryGeographicPlace) {
                return `You are near ${this.context.primaryGeographicPlace.displayName}`;
            }
            return null;
        },
        nearbyGeographicPlaces() {
            if (!this.context || !Array.isArray(this.context.nearbyGeographicPlaces)) {
                return [];
            }
            // Deliberately capped, the same "short, scannable list"
            // restraint `suggestions` above already applies.
            return this.context.nearbyGeographicPlaces.slice(0, 5);
        },
        suggestions() {
            if (!this.context || !Array.isArray(this.context.suggestedDestinations)) {
                return [];
            }
            // Deliberately capped — a short, scannable list of
            // destinations, never a full directory. See this file's own
            // header on staying a "small exploration control."
            return this.context.suggestedDestinations.slice(0, 5);
        },
        statsParts() {
            if (!this.context) {
                return [];
            }
            const parts = [];
            if (this.context.landmarkCount > 0) {
                parts.push(`${this.context.landmarkCount} landmark${this.context.landmarkCount !== 1 ? 's' : ''}`);
            }
            if (this.context.structureCount > 0) {
                parts.push(`${this.context.structureCount} structure${this.context.structureCount !== 1 ? 's' : ''}`);
            }
            if (this.context.collaboratorCount > 0) {
                parts.push(`${this.context.collaboratorCount} ${this.context.collaboratorCount === 1 ? 'person' : 'people'} here now`);
            }
            return parts;
        },
        worldTitle() {
            return (this.context && this.context.world && this.context.world.title) || 'this World';
        }
    },
    methods: {
        suggestionIcon(suggestion) {
            switch (suggestion.kind) {
                case 'landmark': return '★';
                case 'structure': return '🏠';
                case 'collaborator': return '●';
                case 'place': return '📍';
                default: return '•';
            }
        },
        suggestionActionLabel(suggestion) {
            return suggestion.kind === 'collaborator' ? 'Follow' : 'Go to';
        },
        suggestionKey(suggestion) {
            const location = suggestion.location || {};
            if (location.landmark) return `landmark:${location.landmark.id}`;
            if (location.structure) return `structure:${location.structure.id}`;
            if (location.collaborator) return `collaborator:${location.collaborator.identityId}`;
            if (location.place) return `place:${suggestion.label}`;
            return suggestion.label;
        },
        onKeydown(event) {
            if (event.key === 'Escape') {
                event.stopPropagation();
                this.$emit('dismiss');
            }
        }
    },
    template: `
        <div
            v-if="context"
            role="dialog"
            aria-label="World Welcome"
            class="modal-overlay"
            @click.self="$emit('dismiss')"
            @keydown="onKeydown"
        >
            <div class="modal-panel world-welcome-panel">
                <h3 v-if="isArrival && returning">Welcome back to {{ worldTitle }}</h3>
                <h3 v-else-if="isArrival">Welcome to {{ worldTitle }}</h3>
                <h3 v-else>{{ worldTitle }}</h3>

                <p v-if="returning && lastVisitedLabel" class="world-welcome-panel-stats">Last visited {{ lastVisitedLabel }}</p>
                <p v-if="arrivalNote" class="world-welcome-panel-arrival-note">{{ arrivalNote }}</p>
                <p v-if="context.currentPlace" class="world-welcome-panel-place">★ {{ context.currentPlace.title }}</p>
                <p v-if="statsParts.length" class="world-welcome-panel-stats">{{ statsParts.join(' · ') }}</p>

                <section v-if="context.activitySummary && context.activitySummary.length" class="world-welcome-panel-section">
                    <h4 class="world-welcome-panel-section-title">What's happening nearby?</h4>
                    <ul class="world-welcome-panel-activity">
                        <li v-for="(line, i) in context.activitySummary" :key="i">● {{ line }}</li>
                    </ul>
                </section>

                <section v-if="suggestions.length" class="world-welcome-panel-section">
                    <h4 class="world-welcome-panel-section-title">Nearby</h4>
                    <ul class="world-welcome-panel-list">
                        <li v-for="s in suggestions" :key="suggestionKey(s)" class="world-welcome-panel-item">
                            <div class="world-welcome-panel-item-info">
                                <span class="world-welcome-panel-item-title">{{ suggestionIcon(s) }} {{ s.label }}</span>
                                <span class="world-welcome-panel-item-reason">{{ s.reason }}</span>
                            </div>
                            <button class="action-btn" @click="$emit('explore', s)">{{ suggestionActionLabel(s) }}</button>
                        </li>
                    </ul>
                </section>

                <!-- 0.5.6 — Geographic Place Navigation & Arrival. A
                     SEPARATE section from "Nearby" above: those are
                     landmarks/structures/collaborators actually placed
                     in THIS World; these are cross-World candidate
                     identities — never merged into the same list, so a
                     viewer never mistakes a geographic guess for
                     confirmed World content. -->
                <section v-if="nearbyGeographicPlaces.length" class="world-welcome-panel-section">
                    <h4 class="world-welcome-panel-section-title">Nearby Places</h4>
                    <ul class="world-welcome-panel-list">
                        <li v-for="place in nearbyGeographicPlaces" :key="place.fingerprintKey" class="world-welcome-panel-item">
                            <div class="world-welcome-panel-item-info">
                                <span class="world-welcome-panel-item-title">● {{ place.displayName }}</span>
                                <span class="world-welcome-panel-item-reason">{{ place.distance }} m<span v-if="place.direction"> · {{ place.direction }}</span></span>
                            </div>
                            <button class="action-btn" @click="$emit('go-to-place', place.fingerprintKey)">Go to Place</button>
                        </li>
                    </ul>
                </section>

                <p v-if="!context.hasContent" class="world-welcome-panel-empty">
                    Nothing nearby yet — this is a quiet corner of the World.
                </p>

                <div class="modal-actions">
                    <button class="action-btn action-btn--primary" @click="$emit('dismiss')">{{ isArrival ? (returning ? 'Continue Exploring' : 'Explore Freely') : 'Close' }}</button>
                </div>
            </div>
        </div>
    `
};
