// 0.2.29 — World Location Browser: browsing the world by CAMERA
// POSITION, not by already knowing a document's name or typing raw
// coordinates. Opened by "Explore Here" / "What's Here?" (WorldView's
// header) with an initial center/radius already resolved by the
// session (WorldNavigationSession.exploreHere/whatsHere); this
// component's own "Explore" re-query just re-runs the SAME
// application/WorldNavigationSession.exploreLocation() the initial
// open used, at a new radius around the same center — there is
// exactly one discovery path here (see WorldNavigationSession's
// "World Location Browser" section), this dialog is a camera-driven
// front end for it, not a second search implementation. `documents` is
// the same enriched shape 0.2.28's spatial query established
// (position, hasPlacement, distance) — see docs/Principles.md,
// "Publication Found Is Not The Same As Placement Found," for why
// `hasPlacement: false` results still get shown, just visibly marked
// as a fallback position rather than an authored one.
//
// Strictly read-only: the three actions below never move a placement,
// edit a document, fork anything, or publish — see docs/Principles.md,
// "Navigation Never Implies Editing" (0.2.27), which this milestone
// extends to exploration:
//   - Focus  -> WorldNavigationSession.focusDocument default behavior
//               (moves the camera, and by default makes the document
//               active too).
//   - Select -> WorldNavigationSession.setActiveDocument (makes it the
//               active/editing-target document WITHOUT moving the
//               camera — the 0.2.27 active/camera separation, reused
//               here rather than reinvented).
//   - Inspect -> toggles an inline, read-only expansion of Document
//               Info + Placement Info (WorldNavigationSession.
//               inspectDocument) for that one result, in place — never
//               navigates, never loads the document. `inspected` is
//               owned by the HOST (not this component) because
//               fetching it is a session call, not local UI state;
//               this component only asks for it (`inspect` event) and
//               renders whatever the host hands back.
//
// Count phrasing is deliberately "Showing N of N discoverable
// documents," not "N documents in the world" — the SAME decentralized
// honesty 0.2.26/0.2.28 already established: this is what the
// currently configured discovery provider can find within the
// requested region, not a claim that this node has omniscient
// knowledge of the whole world.
//
// 0.2.30: `diagnostics` — the WorldNavigationSession.exploreLocation
// envelope's other half (core/DiscoveryDiagnosticsSummary.js), shown
// as a banner above the result list. Four states, and this component
// renders exactly what it is given, nothing more:
//   unavailable (diagnostics.available === false) — no trust-capable
//     discovery provider was consulted for this query. Neutral, NOT a
//     warning — this is today's default (see docs/Principles.md).
//   fatal (diagnostics.fatal) — a provider WAS consulted but its root/
//     authority could not be trusted at all this pass.
//   complete (diagnostics.available && diagnostics.complete) — the
//     trust layer ran and found nothing to flag.
//   warnings (diagnostics.available && !diagnostics.complete) —
//     itemized real issues (stale/missing/rejected/conflicting/
//     equivocating), each with its own real count.
// The result list itself is UNAFFECTED by any of this — a stale or
// conflicting document still appears, exactly as findable as before;
// diagnostics annotate, they never filter. See docs/Principles.md,
// "Discovery And Trust Are Related, But They Are Not The Same
// Operation (0.2.30)."
export default {
    name: 'WorldLocationBrowser',
    props: {
        center: {
            type: Object,
            default: null
        },
        radius: {
            type: Number,
            default: 0
        },
        documents: {
            type: Array,
            default: () => []
        },
        // { available, fatal, complete, warnings[] } — see
        // core/DiscoveryDiagnosticsSummary.js. Defaults to the
        // "unavailable" shape so a host that hasn't been updated to
        // pass one yet degrades to the neutral banner rather than a
        // crash.
        diagnostics: {
            type: Object,
            default: () => ({ available: false, fatal: null, complete: false, warnings: [] })
        },
        // The single result currently expanded via Inspect, in the
        // shape WorldNavigationSession.inspectDocument returns
        // ({ documentId, documentInfo, placementInfo, trust }), or null
        // when nothing is expanded. documentInfo/placementInfo/trust
        // may themselves be null — see inspectDocument's own comment
        // for why (an unloaded document has no Document Info to show;
        // trust is only ever populated from the last exploration's own
        // observations).
        inspected: {
            type: Object,
            default: null
        },
        // Whether the WHOLE catalog is empty (nothing published
        // anywhere), so the empty state can say something more useful
        // than "nothing within N World Units" — same distinction
        // WorldSearchPanel's catalogEmpty makes.
        catalogEmpty: {
            type: Boolean,
            default: false
        }
    },
    emits: ['explore', 'focus', 'select', 'inspect', 'cancel'],
    data() {
        return {
            // Local editable copy of the radius, seeded from the prop
            // at open time — re-querying edits THIS, not the center,
            // matching the design doc's "choose a radius, explore the
            // same location again" flow rather than letting a re-query
            // silently drift the center too.
            radiusInput: this.radius
        };
    },
    computed: {
        emptyMessage() {
            if (this.catalogEmpty) {
                return 'No documents have been published yet.';
            }
            if (!this.center) {
                return 'Nothing to explore yet.';
            }
            const c = this.center;
            return `Nothing discoverable within ${this.radius} World Units of (${c.x.toFixed(1)}, ${c.y.toFixed(1)}, ${c.z.toFixed(1)}).`;
        }
    },
    methods: {
        onExplore() {
            const radius = Number(this.radiusInput);
            if (!Number.isFinite(radius) || radius < 0) return;
            this.$emit('explore', radius);
        },
        onInspectClick(documentId) {
            this.$emit('inspect', documentId);
        },
        isInspecting(documentId) {
            return !!this.inspected && this.inspected.documentId === documentId;
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
            aria-label="Explore Location"
            class="modal-overlay"
            @click.self="$emit('cancel')"
            @keydown="onKeydown"
        >
            <div class="modal-panel world-location-browser">
                <h3>Explore Location</h3>
                <p v-if="center" class="world-location-browser-context">
                    📍 Center: {{ center.x.toFixed(1) }}, {{ center.y.toFixed(1) }}, {{ center.z.toFixed(1) }}<br>
                    ⭕ Radius: {{ radius }} World Units
                </p>

                <form class="world-location-browser-radius-form" @submit.prevent="onExplore">
                    <input
                        v-model.number="radiusInput"
                        type="number"
                        step="1"
                        min="0"
                        class="form-input world-location-browser-radius-input"
                        aria-label="Radius (World Units)"
                    />
                    <button type="submit" class="action-btn">Explore</button>
                </form>

                <div
                    class="world-location-browser-diagnostics"
                    :class="{
                        'world-location-browser-diagnostics--fatal': diagnostics.fatal,
                        'world-location-browser-diagnostics--complete': diagnostics.available && !diagnostics.fatal && diagnostics.complete,
                        'world-location-browser-diagnostics--warning': diagnostics.available && !diagnostics.fatal && !diagnostics.complete
                    }"
                >
                    <p v-if="diagnostics.fatal" class="world-location-browser-diagnostics-line">
                        ⚠ Could not verify this region's spatial index ({{ diagnostics.fatal }}). Showing locally known documents only.
                    </p>
                    <template v-else-if="diagnostics.available">
                        <p v-if="diagnostics.complete" class="world-location-browser-diagnostics-line">
                            ✓ Discovery complete
                        </p>
                        <p v-else v-for="w in diagnostics.warnings" :key="w.status" class="world-location-browser-diagnostics-line">
                            ⚠ {{ w.message }}
                        </p>
                    </template>
                    <p v-else class="world-location-browser-diagnostics-line world-location-browser-diagnostics-line--neutral">
                        Discovery diagnostics unavailable — showing locally known documents only.
                    </p>
                </div>

                <p v-if="documents.length === 0" class="world-location-browser-empty">{{ emptyMessage }}</p>
                <template v-else>
                    <p class="world-location-browser-count">
                        Showing {{ documents.length }} of {{ documents.length }} discoverable documents
                    </p>
                    <ul class="world-location-browser-list">
                        <li v-for="r in documents" :key="r.documentId" class="world-location-browser-item">
                            <div class="world-location-browser-item-row">
                                <div class="world-location-browser-item-info">
                                    <span class="world-location-browser-item-title">📍 {{ r.title }}</span>
                                    <span class="world-location-browser-item-author">by {{ r.author || 'anonymous' }}</span>
                                    <span v-if="r.distance !== null" class="world-location-browser-item-distance">
                                        📏 {{ r.distance.toFixed(1) }} World Units away
                                    </span>
                                    <span v-if="!r.hasPlacement" class="world-location-browser-item-note">
                                        No placement recorded — using a default position
                                    </span>
                                </div>
                                <div class="world-location-browser-item-actions">
                                    <button class="action-btn" @click="$emit('focus', r.documentId)">Focus</button>
                                    <button class="action-btn" @click="$emit('select', r.documentId)">Select</button>
                                    <button class="action-btn" @click="onInspectClick(r.documentId)">
                                        {{ isInspecting(r.documentId) ? 'Hide' : 'Inspect' }}
                                    </button>
                                </div>
                            </div>

                            <div v-if="isInspecting(r.documentId)" class="world-location-browser-inspect">
                                <template v-if="inspected.documentInfo">
                                    <div class="inspection-row">
                                        <span class="inspection-label">Title</span>
                                        <span class="inspection-value">{{ inspected.documentInfo.title }}</span>
                                    </div>
                                    <div class="inspection-row">
                                        <span class="inspection-label">Author</span>
                                        <span class="inspection-value">{{ inspected.documentInfo.author || 'anonymous' }}</span>
                                    </div>
                                    <div class="inspection-row">
                                        <span class="inspection-label">Status</span>
                                        <span class="inspection-value">{{ inspected.documentInfo.statusLabel }}</span>
                                    </div>
                                    <div v-if="inspected.documentInfo.description" class="inspection-row">
                                        <span class="inspection-label">Description</span>
                                        <span class="inspection-value">{{ inspected.documentInfo.description }}</span>
                                    </div>
                                </template>
                                <p v-else class="world-location-browser-inspect-note">
                                    Not currently loaded in this session — showing what this search already
                                    knows: "{{ r.title }}" by {{ r.author || 'anonymous' }}.
                                </p>
                                <template v-if="inspected.placementInfo">
                                    <div class="inspection-row">
                                        <span class="inspection-label">Position</span>
                                        <span class="inspection-value">
                                            {{ inspected.placementInfo.position.x.toFixed(1) }},
                                            {{ inspected.placementInfo.position.y.toFixed(1) }},
                                            {{ inspected.placementInfo.position.z.toFixed(1) }}
                                        </span>
                                    </div>
                                    <div class="inspection-row">
                                        <span class="inspection-label">Owner</span>
                                        <span class="inspection-value">{{ inspected.placementInfo.owner || 'unrecorded' }}</span>
                                    </div>
                                </template>
                                <p v-else-if="r.position" class="world-location-browser-inspect-note">
                                    Position shown above is
                                    {{ r.hasPlacement ? 'from the recorded placement.' : 'a default fallback — no placement recorded.' }}
                                </p>
                                <div v-if="inspected.trust" class="inspection-row">
                                    <span class="inspection-label">Discovery status</span>
                                    <span class="inspection-value">{{ inspected.trust.status }}</span>
                                </div>
                                <p v-if="inspected.trust && inspected.trust.reason" class="world-location-browser-inspect-note">
                                    {{ inspected.trust.reason }}
                                </p>
                            </div>
                        </li>
                    </ul>
                </template>

                <div class="modal-actions">
                    <button class="action-btn" @click="$emit('cancel')">Close</button>
                </div>
            </div>
        </div>
    `
};
