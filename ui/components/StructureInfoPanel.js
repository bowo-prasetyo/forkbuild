import { SpatialBounds } from '../../core/SpatialBounds.js';
import { describeBlueprintFingerprint } from '../../core/BlueprintFingerprint.js';
import { describeBlueprintSimilarity } from '../../core/BlueprintSimilarity.js';

// 0.6.3 — Blueprint Authoring & Versioning UX. A read-only detail
// surface for one Build Library entry — the Structure-catalog
// counterpart to ui/components/StructureInstancePanel.js's own
// "Selected X Instance" card (0.2.91), which only ever describes an
// already-PLACED StructurePlacement, never a catalog entry someone is
// still browsing. Reachable from either a built-in or a personal
// card's "⋮" menu ("Info") — see ui/components/BuildLibraryPanel.js.
//
// Deliberately READ-ONLY: no field here is editable, and there is no
// "Save" button — see docs/Principles.md's own running "Inspect ≠
// edit" posture (0.6.2's SelectionInspector/StructureInstancePanel
// split already established it one rung over for a live selection;
// this is the same rule applied to a library catalog entry instead).
// Renaming a personal Structure stays exactly where it already was —
// the card's own "⋮" menu — never folded into this panel.
//
// Footprint/height are computed the same way every other Structure
// dimension in this codebase always has been — core/SpatialBounds.js
// #fromBricks(structure.bricks, registry), never a second, cached
// "dimensions" field (see core/Structure.js's own header on why a
// Structure never stores its own bounds).
//
// `source` ('built-in' | 'personal') is supplied by the caller
// (EditorView already knows which library a given id came from — see
// its own inspectStructure()) rather than derived here, so this
// component never needs its own copy of either library to answer a
// question its host already knows the answer to.
//
// 0.6.5 — Blueprint Identity & Attribution. `attribution` is likewise
// supplied by the caller (EditorView#inspectStructure(), which already
// has a BlueprintAttributionUseCase — see that component's own header)
// rather than computed here. This panel only ever RENDERS that view and
// emits 'claim-authorship' when a person acts on it — it never derives a
// fingerprint or touches a store itself, the same "Inspect ≠ edit"
// restraint this panel's own 0.6.3 header already established for
// every other fact shown here.
//
// 0.6.6 — Decentralized Blueprint Exchange. Also emits
// 'export-attribution' — a SEPARATE export from the existing
// 'export' (Export Blueprint) button, reachable only once
// `attribution.mine` exists: this identity has to have already claimed
// authorship before there is an attribution OF THEIRS to export at all.
// Deliberately its own small link rather than folded into "Export
// Blueprint" — a Blueprint Package and a BlueprintAttributionPublication
// stay two independent portable things all the way out to the UI (see
// application/BlueprintPackage.js's own 0.6.6 header), even though
// "Export Blueprint" ALSO bundles every known attribution alongside the
// design by default (ui/views/EditorView.js#exportStructure()) — this
// link exists for the narrower case of sharing just the one signed claim
// on its own.
//
// 0.6.7 — Blueprint Attribution Resolution & Community Identity.
// `attribution` is now application/BlueprintAttributionUseCase.js#
// communityView()'s own shape — `{ fingerprint, authors, authorCount,
// claims, mine, receivedAt }` — rather than summarize()'s flat
// `{ fingerprint, attributions, mine }`. The single "N known authors"
// fact this panel used to show is now a real "Community Attribution"
// list, one row per DISTINCT attributing identity (never "Alice wins" —
// see core/BlueprintAttributionView.js's own header on why authors never
// compete the way place names do), plus an optional, collapsed
// "Attribution Claims" history naming exactly when THIS replica first
// received each claim. Deliberately still never renders "Created by" —
// every label here stays "attributed to"/"claimed" — a valid signature
// proves who made the CLAIM, never who actually made the design.
//
// 0.6.8 — Blueprint Lineage & Revision Discovery. `lineage` is
// application/BlueprintLineageUseCase.js#lineageView()'s own
// `{ fingerprint, derivedFrom, derivedDesigns, mine, hasCycleWarning }`,
// and `similarityCandidates` is a SEPARATE, caller-computed, unsigned
// evidence list (`{ structure, evidence }[]`, from core/
// BlueprintSimilarity.js — never a claim). Both render inside one
// collapsed-by-default "Possible Lineage" section, mirroring the
// "Attribution Claims" history's own progressive disclosure — lineage is
// exactly as secondary to the panel's main facts as an attribution
// history already is. "Possible Predecessors" is the ONLY place this
// panel ever emits 'claim-lineage': a person reads the evidence and
// decides, this panel never decides for them (see core/
// BlueprintSimilarity.js's own header on why similarity never becomes
// lineage on its own).
//
// 0.7.5 — Decentralized Publication UX & Resolution. Also emits
// 'publish-attribution' — a THIRD, independent way to move the
// currently-signed-in identity's own attribution, alongside
// 'export-attribution' above. Export produces a file a person hands to
// someone directly; this emits a request to publish the identical
// attribution through application/PublicationResolver.js (0.7.0) instead
// — content-addressed, cataloged, and announced to whichever peers are
// connected right now, discoverable without a file ever changing hands.
// Reachable under the exact same `attribution.mine` guard
// 'export-attribution' already uses: there is nothing of this identity's
// own to publish until they have claimed authorship at least once. This
// panel never calls application/PublicationResolver.js itself — see this
// panel's own "Inspect ≠ edit" restraint above — EditorView owns the
// actual publish call and its own feedback.
export default {
    name: 'StructureInfoPanel',
    props: {
        structure: { type: Object, required: true },
        registry: { type: Object, default: null },
        source: { type: String, default: 'built-in' }, // 'built-in' | 'personal'
        // application/BlueprintAttributionUseCase.js#communityView()'s
        // own shape, or null while nothing has been derived yet.
        attribution: { type: Object, default: null },
        // application/BlueprintLineageUseCase.js#lineageView()'s own
        // shape, or null while nothing has been derived yet.
        lineage: { type: Object, default: null },
        // core/BlueprintSimilarity.js evidence, pre-filtered/sorted by
        // the caller — never computed in this panel (see this panel's
        // own 0.6.3 "Inspect ≠ edit" header).
        similarityCandidates: { type: Array, default: () => [] }
    },
    emits: [
        'place', 'export', 'close', 'claim-authorship', 'export-attribution', 'publish-attribution',
        'claim-lineage', 'export-lineage-claim'
    ],
    data() {
        return {
            // Local, component-only UI state, deliberately never
            // persisted — this panel is recreated fresh (v-if) every
            // time it opens, the same restraint ui/components/
            // PlaceNamingPanel.js's own `advancedExpanded` already
            // established for an identically-shaped "history" disclosure.
            claimsExpanded: false,
            lineageExpanded: false
        };
    },
    computed: {
        bounds() {
            return SpatialBounds.fromBricks(this.structure.bricks, this.registry);
        },
        footprint() {
            const size = this.bounds.size;
            return `${this.round1(size.x)} × ${this.round1(size.z)}`;
        },
        height() {
            return this.round1(this.bounds.size.y);
        },
        sourceLabel() {
            return this.source === 'personal' ? 'My Structures' : 'Village Library';
        },
        hasAttribution() {
            return !!(this.attribution && this.attribution.fingerprint);
        },
        fingerprintLabel() {
            return this.hasAttribution ? describeBlueprintFingerprint(this.attribution.fingerprint) : '—';
        },
        // Every distinct attributing identity, most-supported first —
        // core/BlueprintAttributionView.js#rankAttributionsByAuthor()'s
        // own output, already computed by the host. Never re-ranked or
        // filtered here.
        authors() {
            return this.hasAttribution ? this.attribution.authors : [];
        },
        myAuthorId() {
            return this.hasAttribution && this.attribution.mine ? this.attribution.mine.authorIdentityId : null;
        },
        // Every raw claim for this fingerprint, most recent first — used
        // only by the collapsed "Attribution Claims" history below.
        allClaims() {
            return this.hasAttribution ? this.attribution.claims : [];
        },
        hasClaimHistory() {
            return this.allClaims.length > 0;
        },
        // Never offered without a fingerprint to attribute, and never a
        // second time once THIS identity already has an attribution on
        // file for it — see application/BlueprintAttributionUseCase.js's
        // own header on why republishing is technically allowed but
        // never something this panel needs to invite.
        canClaimAuthorship() {
            return this.hasAttribution && !this.attribution.mine;
        },
        // 0.6.8 — Blueprint Lineage & Revision Discovery.
        hasLineage() {
            return !!(this.lineage && this.lineage.fingerprint);
        },
        derivedFromClaims() {
            return this.hasLineage ? this.lineage.derivedFrom : [];
        },
        derivedDesignClaims() {
            return this.hasLineage ? this.lineage.derivedDesigns : [];
        },
        hasCycleWarning() {
            return this.hasLineage && this.lineage.hasCycleWarning;
        },
        // Whether the "Possible Lineage" section has anything at all to
        // show — a design with no lineage claims AND no similarity
        // candidates renders nothing here, the same "no section for
        // nothing to say" restraint hasAttribution's own conditional
        // rendering already keeps.
        hasLineageContent() {
            return this.derivedFromClaims.length > 0
                || this.derivedDesignClaims.length > 0
                || this.similarityCandidates.length > 0;
        }
    },
    methods: {
        round1(value) {
            return Math.round((Number(value) || 0) * 10) / 10;
        },
        // Mirrors ui/components/PlaceNamingPanel.js#formatAuthor() —
        // "You" for the currently signed-in identity's own claims, a
        // short truncated identityId for everyone else. Deliberately
        // never a resolved human display name: nothing in this codebase
        // hands a panel a directory mapping an arbitrary authorIdentityId
        // to one, and inventing a fabricated-looking name here would
        // undercut "attribution claims who signed it, never who a
        // display name merely says they are."
        formatAuthor(identityId) {
            if (!identityId) return 'unknown';
            if (identityId === this.myAuthorId) return 'You';
            return identityId.length > 16 ? `${identityId.slice(0, 12)}…` : identityId;
        },
        formatWhen(value) {
            if (!value) return '';
            const date = value instanceof Date ? value : new Date(value);
            return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
        },
        // The one timing fact this panel is willing to show for a claim
        // that isn't the viewer's own: WHEN THIS REPLICA FIRST RECEIVED
        // IT, never the claim's own self-reported `createdAt` — see
        // application/LocalBlueprintAttributionPublicationLog.js's own
        // header on why a second, unsigned "publishedAt" would just be a
        // spoofable shadow of a timestamp the claimant chose themselves.
        // A claim THIS identity published directly (never "received" at
        // all) instead shows its own signed `createdAt`, which is
        // trustworthy precisely because the viewer is the one who signed
        // it.
        claimTimingLabel(claim) {
            if (claim.authorIdentityId === this.myAuthorId) {
                const when = this.formatWhen(claim.createdAt);
                return when ? `Signed by you · ${when}` : 'Signed by you';
            }
            const receivedAt = this.attribution && this.attribution.receivedAt
                ? this.attribution.receivedAt[claim.id]
                : null;
            const when = this.formatWhen(receivedAt);
            return when ? `Received locally · ${when}` : 'Received locally';
        },
        onKeydown(event) {
            if (event.key === 'Escape') {
                event.stopPropagation();
                this.$emit('close');
            }
        },
        // 0.6.8 — Blueprint Lineage & Revision Discovery.
        describeFingerprint(fingerprint) {
            return describeBlueprintFingerprint(fingerprint);
        },
        describeSimilarity(evidence) {
            return describeBlueprintSimilarity(evidence);
        },
        isMyLineageClaim(claim) {
            return !!(this.lineage && this.lineage.mine && claim.id === this.lineage.mine.id);
        }
    },
    template: `
        <div
            role="dialog"
            :aria-label="'Structure info: ' + structure.name"
            class="modal-overlay"
            @click.self="$emit('close')"
            @keydown="onKeydown"
        >
            <div class="modal-panel structure-info-panel">
                <h3>{{ structure.name }}</h3>
                <p class="structure-info-category">{{ structure.category }}</p>

                <dl class="structure-info-facts">
                    <dt>Bricks</dt><dd>{{ structure.bricks.length }}</dd>
                    <dt>Footprint</dt><dd>{{ footprint }}</dd>
                    <dt>Height</dt><dd>{{ height }}</dd>
                    <dt>Source</dt><dd>{{ sourceLabel }}</dd>
                    <dt v-if="hasAttribution">Blueprint</dt>
                    <dd v-if="hasAttribution" :title="attribution.fingerprint">{{ fingerprintLabel }}</dd>
                </dl>

                <p v-if="structure.description" class="structure-info-description">{{ structure.description }}</p>

                <!-- 0.6.7 — Blueprint Attribution Resolution & Community
                     Identity. A real list, one row per DISTINCT
                     attributing identity — never a single "N authors"
                     count, and never a claim that any one of these
                     "wins." See core/BlueprintAttributionView.js's own
                     header. -->
                <section v-if="hasAttribution" class="naming-panel-section structure-info-attribution">
                    <h4 class="locations-panel-section-title">Community Attribution</h4>
                    <p v-if="authors.length === 0" class="locations-panel-empty">
                        No community attribution yet. You can publish a signed authorship claim.
                    </p>
                    <ul v-else class="naming-panel-list">
                        <li v-for="author in authors" :key="author.authorIdentityId" class="naming-panel-item">
                            <div class="naming-panel-item-info">
                                <span class="naming-panel-item-name">{{ formatAuthor(author.authorIdentityId) }}</span>
                                <span class="naming-panel-item-score">{{ author.score }} {{ author.score === 1 ? 'claim' : 'claims' }}</span>
                            </div>
                        </li>
                    </ul>
                    <p v-if="attribution.mine" class="form-hint form-hint--neutral">
                        ✓ You have signed an attribution claim
                    </p>
                    <div class="structure-info-attribution-actions">
                        <button v-if="canClaimAuthorship" class="inline-link-btn" @click="$emit('claim-authorship')">Claim authorship</button>
                        <button v-if="attribution.mine" class="inline-link-btn" @click="$emit('export-attribution')">Export Attribution</button>
                        <button v-if="attribution.mine" class="inline-link-btn" @click="$emit('publish-attribution')">Publish to Network</button>
                    </div>

                    <!-- Progressive disclosure, mirroring ui/components/
                         PlaceNamingPanel.js's own "More" toggle — the raw
                         claim ledger stays secondary to the community
                         list above. -->
                    <button
                        v-if="hasClaimHistory"
                        type="button"
                        class="naming-panel-advanced-toggle"
                        :aria-expanded="claimsExpanded"
                        @click="claimsExpanded = !claimsExpanded"
                    >
                        {{ claimsExpanded ? '▾' : '▸' }} Attribution Claims ({{ allClaims.length }})
                    </button>
                    <ul v-if="claimsExpanded" class="naming-panel-list">
                        <li v-for="claim in allClaims" :key="claim.id" class="naming-panel-item">
                            <div class="naming-panel-item-info">
                                <span class="naming-panel-item-name">{{ formatAuthor(claim.authorIdentityId) }}</span>
                                <span class="naming-panel-item-meta">{{ claimTimingLabel(claim) }}</span>
                            </div>
                        </li>
                    </ul>
                </section>

                <!-- 0.6.8 — Blueprint Lineage & Revision Discovery.
                     Collapsed by default, exactly like the "Attribution
                     Claims" history above — lineage is derived,
                     never authoritative, and never a mutable version
                     history (see core/BlueprintLineageClaim.js's own
                     header). -->
                <section v-if="hasLineageContent" class="naming-panel-section structure-info-lineage">
                    <button
                        type="button"
                        class="naming-panel-advanced-toggle"
                        :aria-expanded="lineageExpanded"
                        @click="lineageExpanded = !lineageExpanded"
                    >
                        {{ lineageExpanded ? '▾' : '▸' }} Possible Lineage
                    </button>
                    <div v-if="lineageExpanded">
                        <p v-if="hasCycleWarning" class="form-hint form-hint--neutral">
                            ⚠ Possible lineage cycle — contradicting claims are on file for this design
                        </p>

                        <template v-if="derivedFromClaims.length">
                            <h4 class="locations-panel-section-title">Derived From</h4>
                            <ul class="naming-panel-list">
                                <li v-for="claim in derivedFromClaims" :key="claim.id" class="naming-panel-item">
                                    <div class="naming-panel-item-info">
                                        <span class="naming-panel-item-name" :title="claim.sourceFingerprint">{{ describeFingerprint(claim.sourceFingerprint) }}</span>
                                        <span class="naming-panel-item-meta">Claimed by {{ formatAuthor(claim.authorIdentityId) }}</span>
                                    </div>
                                    <button v-if="isMyLineageClaim(claim)" class="inline-link-btn" @click="$emit('export-lineage-claim', claim)">Export</button>
                                </li>
                            </ul>
                        </template>

                        <template v-if="derivedDesignClaims.length">
                            <h4 class="locations-panel-section-title">Derived Designs</h4>
                            <ul class="naming-panel-list">
                                <li v-for="claim in derivedDesignClaims" :key="claim.id" class="naming-panel-item">
                                    <div class="naming-panel-item-info">
                                        <span class="naming-panel-item-name" :title="claim.derivedFingerprint">{{ describeFingerprint(claim.derivedFingerprint) }}</span>
                                        <span class="naming-panel-item-meta">Claimed by {{ formatAuthor(claim.authorIdentityId) }}</span>
                                    </div>
                                    <button v-if="isMyLineageClaim(claim)" class="inline-link-btn" @click="$emit('export-lineage-claim', claim)">Export</button>
                                </li>
                            </ul>
                        </template>

                        <template v-if="similarityCandidates.length">
                            <h4 class="locations-panel-section-title">Possible Predecessors</h4>
                            <p class="form-hint form-hint--neutral">
                                Evidence only — nothing here is asserted. Confirm one only if you know it's true.
                            </p>
                            <ul class="naming-panel-list">
                                <li v-for="candidate in similarityCandidates" :key="candidate.structure.id" class="naming-panel-item">
                                    <div class="naming-panel-item-info">
                                        <span class="naming-panel-item-name">{{ candidate.structure.name }}</span>
                                        <span class="naming-panel-item-meta">{{ describeSimilarity(candidate.evidence) }}</span>
                                    </div>
                                    <button class="inline-link-btn" @click="$emit('claim-lineage', candidate.structure)">Derived from this</button>
                                </li>
                            </ul>
                        </template>
                    </div>
                </section>

                <div class="modal-actions">
                    <button class="action-btn" @click="$emit('close')">Close</button>
                    <button class="action-btn action-btn--secondary" @click="$emit('export')">Export Blueprint</button>
                    <button class="action-btn action-btn--primary" @click="$emit('place')">Place</button>
                </div>
            </div>
        </div>
    `
};
