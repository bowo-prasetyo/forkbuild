import { computed, inject } from 'vue';
import { useRoleProviderPreferenceForm } from '../composables/useRoleProviderPreferenceForm.js';
import { RoleProviderRole } from '../../core/RoleProviderRole.js';
import { describeRoleProviderPreferenceSettings } from '../../application/settings/RoleProviderPreferenceSettingsView.js';
import { sortOptionsByLabel } from '../../utils/sortOptionsByLabel.js';

// Proof & Anchoring Provider Preference Settings Entry Point.
//
// Mirrors ui/views/ContentProviderSettingsView.js's own shape, one role
// over — the same small, dedicated settings page, the same
// RoleProviderPreferenceStore/SetRoleProviderPreferenceUseCase pair
// (application/settings/RoleProviderPreferenceSettingsView.js's own
// describeRoleProviderPreferenceSettings() is already role-agnostic; this
// view is the first caller to pass it RoleProviderRole.PROOF_AND_ANCHORING).
//
// This is the missing WRITE half of ui/views/DecentralizedPublicationsView
// .js's own "Use Preferred Provider" anchor trigger: that action CONSUMES a
// stored PROOF_AND_ANCHORING preference (through application/
// PreferredPublicationAnchorCreationCoordinator.js); this page is the one
// ordinary product path a person has to CREATE or CHANGE it.
//
// THE PROVIDER LIST IS NEVER HARDCODED HERE, UNLIKE ANNOUNCEMENT/DISCOVERY.
// `availableProviderKeys` comes straight from the SAME
// `preferredPublicationAnchorCreationCoordinator` (application/
// PreferredPublicationAnchorCreationCoordinator.js) the Publication Center's
// own "Use Preferred Provider" anchor trigger already consumes — its
// `availableAnchorTypes()` is a pass-through to the real, currently-
// registered application/anchoring/ExternalAnchorPublisherRegistry.js, the identical
// seam that already keeps that page from ever offering an anchorType nobody
// can actually anchor onto. Base never appears here today for exactly that
// reason: ui/main.js deliberately never registers `baseAnchorPublisher`
// into that registry (see anchoring/BaseAnchorPublisher.js's own header) —
// Base anchoring stays reachable only through its own dedicated wallet-
// guided flow, untouched by this page.
//
// THIS PAGE NEVER TOUCHES EXPLICIT PER-ACTION ANCHOR CREATION. It never
// imports, injects, or calls `publicationAnchorCreationCoordinator` (the
// coordinator behind the existing per-anchorType "Create Bitcoin/Arweave
// Anchor" buttons) — saving a preference here can never retroactively
// change, or be changed by, clicking one of those buttons.
//
// ONLY PROOF_AND_ANCHORING. This view hardcodes `RoleProviderRole.PROOF_AND_ANCHORING`
// — there is no role selector, and no Content or Discovery section here.
//
// Only `bitcoin-op-return` needs a friendly name here: `arweave` already
// title-cases to "Arweave" through describeRoleProviderPreferenceSettings()'s
// own fallback, and `base` is never offered (see above).
const ANCHOR_PROVIDER_OPTION_LABELS = {
    'bitcoin-op-return': 'Bitcoin'
};

export default {
    name: 'AnchorProviderSettingsView',
    setup() {
        const preferenceStore = inject('roleProviderPreferenceStore', null);
        const setRoleProviderPreferenceUseCase = inject('setRoleProviderPreferenceUseCase', null);
        const preferredAnchorCreationCoordinator = inject('preferredPublicationAnchorCreationCoordinator', null);

        const form = useRoleProviderPreferenceForm({
            role: RoleProviderRole.PROOF_AND_ANCHORING,
            preferenceStore,
            setUseCase: setRoleProviderPreferenceUseCase
        });

        const availableProviderKeys = computed(() =>
            preferredAnchorCreationCoordinator ? preferredAnchorCreationCoordinator.availableAnchorTypes() : []
        );

        const settings = computed(() => sortOptionsByLabel(describeRoleProviderPreferenceSettings({
            availableProviderKeys: availableProviderKeys.value
        }).options.map((option) => ({ ...option, label: ANCHOR_PROVIDER_OPTION_LABELS[option.providerKey] || option.label }))));

        return {
            settings, selectedProviderKey: form.selectedProviderKey,
            saveError: form.saveError, saveStatus: form.saveStatus, save: form.save
        };
    },
    template: `
        <section class="anchor-provider-settings-view">
            <h1>Proof / Anchoring Provider</h1>
            <p class="form-hint form-hint--neutral">
                Choose which decentralized substrate "Use Preferred Provider" anchors new Proof/Anchoring evidence onto in the Publication Center. This never changes what the explicit per-substrate anchor buttons there do, and never affects Base's own separate wallet-guided anchoring flow.
            </p>
            <p class="form-hint form-hint--neutral">
                Base isn't offered here because every Base anchor requires reviewing and signing a wallet transaction at the moment it's created — it can't fire silently in the background the way a preferred provider does. Use Base's own anchor button in the Publication Center instead.
            </p>

            <div v-if="settings.length" class="anchor-provider-settings-form">
                <label v-for="opt in settings" :key="opt.providerKey" class="anchor-provider-option">
                    <input type="radio" name="anchor-provider-preference" :value="opt.providerKey" v-model="selectedProviderKey" />
                    {{ opt.label }}
                </label>

                <p v-if="saveError" class="form-hint">{{ saveError }}</p>
                <p v-if="saveStatus === 'saved'" class="form-hint form-hint--neutral">Saved.</p>

                <button class="action-btn action-btn--primary" @click="save" :disabled="!selectedProviderKey">Save</button>
            </div>
            <p v-else class="form-hint form-hint--neutral">
                No Proof/Anchoring providers are currently registered on this replica.
            </p>
        </section>
    `
};
