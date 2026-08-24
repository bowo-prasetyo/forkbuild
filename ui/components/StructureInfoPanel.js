import { SpatialBounds } from '../../core/SpatialBounds.js';
import { describeBlueprintFingerprint } from '../../core/BlueprintFingerprint.js';

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
// rather than computed here: `{ fingerprint, attributions, mine }`, the
// exact shape application/BlueprintAttributionUseCase.js#summarize()
// returns. This panel only ever RENDERS that summary and emits
// 'claim-authorship' when a person acts on it — it never derives a
// fingerprint or touches a store itself, the same "Inspect ≠ edit"
// restraint this panel's own 0.6.3 header already established for
// every other fact shown here.
export default {
    name: 'StructureInfoPanel',
    props: {
        structure: { type: Object, required: true },
        registry: { type: Object, default: null },
        source: { type: String, default: 'built-in' }, // 'built-in' | 'personal'
        attribution: { type: Object, default: null } // { fingerprint, attributions, mine } | null
    },
    emits: ['place', 'export', 'close', 'claim-authorship'],
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
        fingerprintLabel() {
            return this.attribution && this.attribution.fingerprint
                ? describeBlueprintFingerprint(this.attribution.fingerprint)
                : '—';
        },
        authorLabel() {
            if (!this.attribution || !this.attribution.fingerprint) {
                return '—';
            }
            if (this.attribution.mine) {
                return 'You';
            }
            const count = this.attribution.attributions.length;
            return count > 0 ? `${count} known ${count === 1 ? 'author' : 'authors'}` : 'Not yet attributed';
        },
        // Never offered without a fingerprint to attribute, and never a
        // second time once THIS identity already has an attribution on
        // file for it — see application/BlueprintAttributionUseCase.js's
        // own header on why republishing is technically allowed but
        // never something this panel needs to invite.
        canClaimAuthorship() {
            return !!(this.attribution && this.attribution.fingerprint && !this.attribution.mine);
        }
    },
    methods: {
        round1(value) {
            return Math.round((Number(value) || 0) * 10) / 10;
        },
        onKeydown(event) {
            if (event.key === 'Escape') {
                event.stopPropagation();
                this.$emit('close');
            }
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
                    <dt v-if="attribution && attribution.fingerprint">Blueprint</dt>
                    <dd v-if="attribution && attribution.fingerprint" :title="attribution.fingerprint">{{ fingerprintLabel }}</dd>
                    <dt v-if="attribution && attribution.fingerprint">Author</dt>
                    <dd v-if="attribution && attribution.fingerprint">
                        {{ authorLabel }}
                        <button v-if="canClaimAuthorship" class="inline-link-btn" @click="$emit('claim-authorship')">Claim authorship</button>
                    </dd>
                </dl>

                <p v-if="structure.description" class="structure-info-description">{{ structure.description }}</p>

                <div class="modal-actions">
                    <button class="action-btn" @click="$emit('close')">Close</button>
                    <button class="action-btn action-btn--secondary" @click="$emit('export')">Export Blueprint</button>
                    <button class="action-btn action-btn--primary" @click="$emit('place')">Place</button>
                </div>
            </div>
        </div>
    `
};
