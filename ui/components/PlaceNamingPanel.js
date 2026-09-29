// 0.5.2 — Place Naming & Naming Claims.
//
// The counterpart to ui/components/RegionFormModal.js for the layer
// that milestone deliberately did NOT build: what OTHER people (and
// this viewer's own past self) have said a region should be called.
// RegionFormModal edits the region's own WorldRegion.name — World
// content, gated by canEdit. This panel never touches that field at
// all; it lists/publishes/retracts core/PlaceNamingClaim.js records and
// sets a purely local preference, and every action here is available
// to ANYONE, canEdit or not — see core/PlaceNamingClaim.js's own header
// on why a naming claim needs no World edit authority.
//
// Props are plain data this component never fetches itself — the host
// (ui/views/WorldView.js) reads session.getPlaceNamingClaims()/
// getPlaceNamingView()/getPreferredPlaceName() and passes the results
// down, the same "dumb panel, smart host" split every other modal in
// this codebase already follows (see RegionFormModal.js/LocationsPanel.js).
//
// Emits publish-name/retract-name/set-preferred-name/clear-preferred-name
// with the raw arguments the host's session calls need — never calls
// the session directly.
import { formatDate, t } from '../i18n/i18n.js';
export default {
    name: 'PlaceNamingPanel',
    props: {
        // 0.5.4 — the region this panel is currently open for. Used
        // only to tell this region apart from OTHER candidate regions
        // in geographicRegions below — never sent to the session
        // directly by this component (the host already scopes every
        // emit to the right region, exactly as before this milestone).
        regionId: {
            type: String,
            default: null
        },
        // The region's own World-authored name (WorldRegion.name) —
        // shown as read-only context, never editable here.
        regionName: {
            type: String,
            default: ''
        },
        // core/PlaceNamingView.js#namingView()'s own shape:
        // [{ name, score, claims: [...] }], most-agreed-on first.
        namingView: {
            type: Array,
            default: () => []
        },
        // Every raw claim for this region (PlaceNamingClaim#toJSON()
        // shapes), most recent first — used only to render "who said
        // this, and when," never re-ranked here.
        claims: {
            type: Array,
            default: () => []
        },
        // This viewer's own local override, or null — see
        // application/identity/LocalNamePreferenceStore.js's own header.
        preferredName: {
            type: String,
            default: null
        },
        // The currently signed-in identity's own id, or null — used
        // only to show a Retract button on THIS viewer's own claims;
        // the session enforces the real "only your own claim" rule
        // regardless of what this panel shows.
        myIdentityId: {
            type: String,
            default: null
        },
        // 0.5.4 — Place Identity & Geographic Claim Resolution.
        // session.getGeographicNamingView(regionId)'s own `regions`:
        // every region this replica currently knows about whose
        // geometry CANDIDATE-matches this one's (core/PlaceIdentity.js)
        // — always includes this region itself when it's known, so
        // length 1 means "no other candidate found." Never a claim that
        // any of these are actually the same World object — see this
        // component's own template copy, and core/PlaceIdentity.js's
        // header, on why "candidate" is the only word used anywhere
        // here.
        geographicRegions: {
            type: Array,
            default: () => []
        },
        // session.getGeographicNamingView(regionId)'s own `namingView`:
        // the SAME distinct-author ranking as `namingView` above,
        // computed across every claim for EVERY region in
        // geographicRegions rather than only this one. Deliberately
        // additive alongside `namingView`, never a replacement for it —
        // this replica's own per-region community view (namingView
        // above) is completely unaffected by whether a candidate match
        // was ever found.
        geographicNamingView: {
            type: Array,
            default: () => []
        },
        // 0.9.320 — Explicit Place Naming Publication Action. Whether the
        // host has an actual publishPlaceNamingClaimToNostrCommand to call
        // at all — mirrors ui/components/OwnPublicationPanel.js's own
        // `v-if="unpublishCommand"`-style gating one domain over: the
        // "Publish to Nostr" button per claim below only renders when this
        // is true, never a disabled-but-visible button with nothing behind
        // it.
        canPublishToNostr: {
            type: Boolean,
            default: false
        },
        // The claimId the LAST "Publish to Nostr" click targeted — lets
        // this panel show a result/error beside the specific "All Claims"
        // row it describes, never ambiguously beside every row. `null`
        // means nothing has been clicked yet (or the panel was just
        // reopened — see ui/views/WorldView.js's own
        // resetNamingPanelPublishToNostr()).
        publishToNostrClaimId: {
            type: String,
            default: null
        },
        publishToNostrExecuting: {
            type: Boolean,
            default: false
        },
        publishToNostrError: {
            type: String,
            default: null
        },
        // NostrPlaceNamingDiscoveryPublisher#publish()'s own shape —
        // { published: true, relayUrl, id, discoveryTag } — rendered
        // verbatim, never reinterpreted by this component. See
        // application/placeNaming/NostrPlaceNamingDiscoveryPublisher.js's own header,
        // "a simple publication result, never trust, verification, or
        // delivery semantics."
        publishToNostrResult: {
            type: Object,
            default: null
        }
    },
    // 0.5.3 — Decentralized Place Name Exchange adds 'export-claim' (any
    // claim, not only this viewer's own — a signed claim is a portable
    // fact anyone holding it may forward, exactly like re-sharing a
    // Blueprint someone else exported) and 'import-claim' (the raw text
    // read off whatever file the hidden input below picked, mirroring
    // ui/components/BuildLibraryPanel.js's own import-blueprint shape).
    //
    // 0.9.320 — Explicit Place Naming Publication Action adds
    // 'publish-to-nostr' (a claimId — the exact same "any claim, not only
    // this viewer's own" reach 'export-claim' already has, since a signed
    // claim remains a portable fact anyone holding it may forward,
    // regardless of transport). Deliberately NEVER automatic: this panel's
    // own "Publish A Name" section (onPublish(), below) only ever emits
    // 'publish-name' — creating a local claim and announcing it to Nostr
    // stay two separate, explicit actions, never one combined click. See
    // docs/Roadmap.md's own 0.9.320 entry, "create claim... announce
    // claim... two different actions."
    emits: [
        'publish-name', 'retract-name', 'set-preferred-name', 'clear-preferred-name',
        'export-claim', 'import-claim', 'publish-to-nostr', 'cancel'
    ],
    data() {
        return {
            newName: '',
            // 0.5.7 — World View UX & Progressive Exploration. This
            // panel used to show "Community Names," "Other Geographic
            // Descriptions," "All Claims," and "Exchange" all at once —
            // exactly the milestone's own example of a naming surface
            // that dominates the interface instead of answering "what
            // do people call this?" first. `namesExpanded` gates the
            // Community Names list down to its top 3 entries;
            // `advancedExpanded` gates everything below "Publish A
            // Name" (the other-descriptions cross-reference, the raw
            // claim list, import/export) behind one "More" disclosure.
            // Both default closed and are local, component-only UI
            // state — deliberately NOT threaded through
            // application/world/WorldViewNavigationState.js's per-region
            // naming-disclosure tracking, since this panel is
            // recreated fresh (v-if) every time it opens; a future
            // milestone could wire that tracking through if
            // remembering a viewer's OWN prior disclosure choice across
            // re-opens of the same place turns out to matter.
            namesExpanded: false,
            advancedExpanded: false
        };
    },
    computed: {
        canPublish() {
            return this.newName.trim().length > 0;
        },
        // 0.5.4 — every geographicRegions entry OTHER than this panel's
        // own region — the "Other geographic descriptions of this
        // place" list. [] whenever no candidate match was found (the
        // ordinary case for a region nobody else has independently
        // described), so the section below stays hidden rather than
        // showing an empty list.
        otherGeographicRegions() {
            return this.geographicRegions.filter((region) => region.id !== this.regionId);
        },
        // 0.5.7 — the top 3 (most-agreed-on — namingView is already
        // sorted, see core/PlaceNamingView.js#namingView()'s own
        // header) unless the viewer explicitly asked to see the rest,
        // or there simply aren't more than 3 to hide.
        visibleNamingView() {
            if (this.namesExpanded || this.namingView.length <= 3) {
                return this.namingView;
            }
            return this.namingView.slice(0, 3);
        },
        hasMoreNames() {
            return this.namingView.length > 3;
        }
    },
    methods: {
        t,
        formatAuthor(identityId) {
            if (!identityId) return t('placeNamingPanel.unknown');
            return identityId.length > 16 ? `${identityId.slice(0, 12)}…` : identityId;
        },
        // 0.5.4 — a short label for one of otherGeographicRegions'
        // entries: its own kind and World-authored name, never anything
        // this panel invents. Region-like objects here come from
        // session.getGeographicNamingView(), which always carries
        // `kind`/`name` — see WorldNavigationSession#_collectRawRegions().
        formatRegionLabel(region) {
            const kind = region.kind ? `${region.kind.charAt(0).toUpperCase()}${region.kind.slice(1)}` : 'Place';
            return region.name ? `${kind} · ${region.name}` : kind;
        },
        formatWhen(createdAt) {
            const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
            return Number.isNaN(date.getTime()) ? '' : formatDate(date);
        },
        onPublish() {
            const trimmed = this.newName.trim();
            if (!trimmed) return;
            this.$emit('publish-name', trimmed);
            this.newName = '';
        },
        onPreferEntry(name) {
            this.$emit('set-preferred-name', name);
        },
        onKeydown(event) {
            if (event.key === 'Escape') {
                event.stopPropagation();
                this.$emit('cancel');
            }
        },
        // 0.5.3 — the host (ui/views/WorldView.js) turns this into an
        // actual file download; this component only ever hands over the
        // raw claimId, exactly the same "dumb panel" split this file's
        // own header describes.
        onExportClaim(claimId) {
            this.$emit('export-claim', claimId);
        },
        // 0.9.320 — Explicit Place Naming Publication Action. A dumb
        // pass-through, exactly like onExportClaim() immediately above —
        // this component never calls a Nostr publisher itself, never
        // constructs an event, and never decides whether publishing is
        // even possible (canPublishToNostr, gating the button's own
        // visibility in the template below, is the host's own answer to
        // that question).
        onPublishToNostr(claimId) {
            this.$emit('publish-to-nostr', claimId);
        },
        triggerImportClaim() {
            this.$refs.importClaimFileInput.click();
        },
        // Mirrors ui/components/BuildLibraryPanel.js#onImportBlueprintFileChosen()
        // exactly: read the chosen file as text, hand the RAW text up to
        // the host (which owns JSON.parse + session.importPlaceNamingClaim()'s
        // own validate/verify), and reset the input so the same file can
        // be re-chosen later.
        onImportClaimFileChosen(event) {
            const file = event.target.files && event.target.files[0];
            event.target.value = '';
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                this.$emit('import-claim', String(reader.result || ''));
            };
            reader.readAsText(file);
        }
    },
    template: `
        <div
            role="dialog"
            :aria-label="t('placeNamingPanel.namingClaims')"
            class="modal-overlay"
            @click.self="$emit('cancel')"
            @keydown="onKeydown"
        >
            <div class="modal-panel naming-panel">
                <h3>{{ t('placeNamingPanel.namesForThisPlace') }}</h3>
                <p class="form-hint form-hint--neutral">
                    {{ t('placeNamingPanel.regionName', { name: regionName }) }}
                </p>

                <section class="naming-panel-section">
                    <h4 class="locations-panel-section-title">{{ t('placeNamingPanel.communityNames') }}</h4>
                    <p v-if="namingView.length === 0" class="locations-panel-empty">
                        {{ t('placeNamingPanel.nobodyHasPublishedANaming') }}
                    </p>
                    <ul v-else class="naming-panel-list">
                        <li v-for="entry in visibleNamingView" :key="entry.name" class="naming-panel-item">
                            <div class="naming-panel-item-info">
                                <span class="naming-panel-item-name">{{ entry.name }}</span>
                                <span class="naming-panel-item-score">{{ t('placeNamingPanel.people', { count: entry.score }) }}</span>
                            </div>
                            <button
                                class="action-btn"
                                :disabled="preferredName === entry.name"
                                @click="onPreferEntry(entry.name)"
                            >{{ preferredName === entry.name ? t('placeNamingPanel.yourPreference') : t('placeNamingPanel.preferThis') }}</button>
                        </li>
                    </ul>
                    <!-- 0.5.7 — progressive disclosure: the full ranked
                         list only appears once asked for. -->
                    <button v-if="hasMoreNames" class="action-btn" @click="namesExpanded = !namesExpanded">
                        {{ namesExpanded ? t('placeNamingPanel.fewerNames') : t('placeNamingPanel.moreNames', { count: namingView.length }) }}
                    </button>
                    <button v-if="preferredName" class="action-btn" @click="$emit('clear-preferred-name')">
                        {{ t('placeNamingPanel.clearMyPreference') }}
                    </button>
                </section>

                <section class="naming-panel-section">
                    <h4 class="locations-panel-section-title">{{ t('placeNamingPanel.publishAName') }}</h4>
                    <p class="form-hint form-hint--neutral">
                        {{ t('placeNamingPanel.signedUnderYourOwnIdentity') }}
                    </p>
                    <div class="form-field-row">
                        <input
                            v-model="newName"
                            type="text"
                            class="form-input"
                            :placeholder="t('placeNamingPanel.whatDoYouCallThis')"
                            maxlength="200"
                            @keydown.enter="onPublish"
                        />
                        <button class="action-btn action-btn--primary" :disabled="!canPublish" @click="onPublish">
                            {{ t('placeNamingPanel.publish') }}
                        </button>
                    </div>
                </section>

                <!-- 0.5.7 — everything below is secondary to "what do
                     people call this and how do I add my own name" —
                     cross-World candidates, the raw claim ledger, and
                     import/export all collapse behind one disclosure
                     rather than each competing for attention up front. -->
                <button
                    type="button"
                    class="naming-panel-advanced-toggle"
                    :aria-expanded="advancedExpanded"
                    @click="advancedExpanded = !advancedExpanded"
                >
                    {{ advancedExpanded ? '▾' : '▸' }} {{ t('placeNamingPanel.more') }}
                </button>

                <template v-if="advancedExpanded">
                    <section v-if="otherGeographicRegions.length > 0" class="naming-panel-section">
                        <h4 class="locations-panel-section-title">{{ t('placeNamingPanel.otherGeographicDescriptions') }}</h4>
                        <p class="form-hint form-hint--neutral">
                            {{ t('placeNamingPanel.theseRegionsWereAuthoredIndependently') }}
                        </p>
                        <ul class="naming-panel-list">
                            <li v-for="region in otherGeographicRegions" :key="region.worldId + ':' + region.id" class="naming-panel-item">
                                <div class="naming-panel-item-info">
                                    <span class="naming-panel-item-name">{{ formatRegionLabel(region) }}</span>
                                </div>
                            </li>
                        </ul>

                        <div v-if="geographicNamingView.length > 0">
                            <h4 class="locations-panel-section-title">{{ t('placeNamingPanel.communityNamesAcrossThesePlaces') }}</h4>
                            <p class="form-hint form-hint--neutral">
                                {{ t('placeNamingPanel.combinesEveryClaimPublishedFor') }}
                            </p>
                            <ul class="naming-panel-list">
                                <li v-for="entry in geographicNamingView" :key="entry.name" class="naming-panel-item">
                                    <div class="naming-panel-item-info">
                                        <span class="naming-panel-item-name">{{ entry.name }}</span>
                                        <span class="naming-panel-item-score">{{ t('placeNamingPanel.people', { count: entry.score }) }}</span>
                                    </div>
                                </li>
                            </ul>
                        </div>
                    </section>

                    <section v-if="claims.length > 0" class="naming-panel-section">
                        <h4 class="locations-panel-section-title">{{ t('placeNamingPanel.allClaims') }}</h4>
                        <p class="form-hint form-hint--neutral">
                            {{ t('placeNamingPanel.exportOrPublish') }}
                        </p>
                        <ul class="naming-panel-list">
                            <li v-for="claim in claims" :key="claim.id" class="naming-panel-item">
                                <div class="naming-panel-item-info">
                                    <span class="naming-panel-item-name">{{ claim.name }}</span>
                                    <span class="naming-panel-item-meta">{{ formatAuthor(claim.authorIdentityId) }} · {{ formatWhen(claim.createdAt) }}</span>
                                </div>
                                <div class="naming-panel-item-actions">
                                    <button class="action-btn" @click="onExportClaim(claim.id)">{{ t('placeNamingPanel.export') }}</button>
                                    <button
                                        v-if="canPublishToNostr"
                                        class="action-btn"
                                        :disabled="publishToNostrExecuting"
                                        @click="onPublishToNostr(claim.id)"
                                    >{{ publishToNostrExecuting && publishToNostrClaimId === claim.id ? t('placeNamingPanel.publishing') : t('placeNamingPanel.publishToNostr') }}</button>
                                    <button
                                        v-if="claim.authorIdentityId === myIdentityId"
                                        class="action-btn action-btn--danger"
                                        @click="$emit('retract-name', claim.id)"
                                    >{{ t('placeNamingPanel.retract') }}</button>
                                </div>
                                <p
                                    v-if="publishToNostrClaimId === claim.id && publishToNostrError"
                                    class="world-view-place-naming-error"
                                >{{ publishToNostrError }}</p>
                                <p
                                    v-else-if="publishToNostrClaimId === claim.id && publishToNostrResult"
                                    class="form-hint form-hint--neutral"
                                >{{ t('placeNamingPanel.publishedToNostr', { relay: publishToNostrResult.relayUrl }) }}</p>
                            </li>
                        </ul>
                    </section>

                    <section class="naming-panel-section">
                        <h4 class="locations-panel-section-title">{{ t('placeNamingPanel.exchange') }}</h4>
                        <p class="form-hint form-hint--neutral">
                            {{ t('placeNamingPanel.namesArePublishedLocallyFirst') }}
                        </p>
                        <button class="action-btn" @click="triggerImportClaim">{{ t('placeNamingPanel.importClaim') }}</button>
                        <input
                            ref="importClaimFileInput"
                            type="file"
                            accept="application/json,.json"
                            style="display: none;"
                            @change="onImportClaimFileChosen"
                        />
                    </section>
                </template>

                <div class="modal-actions">
                    <button class="action-btn" @click="$emit('cancel')">{{ t('placeNamingPanel.close') }}</button>
                </div>
            </div>
        </div>
    `
};
