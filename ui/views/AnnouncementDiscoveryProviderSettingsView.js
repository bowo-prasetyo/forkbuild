import { computed, inject } from 'vue';
import { useRoleProviderPreferenceForm } from '../composables/useRoleProviderPreferenceForm.js';
import { RoleProviderRole } from '../../core/RoleProviderRole.js';
import { describeRoleProviderPreferenceSettings } from '../../application/settings/RoleProviderPreferenceSettingsView.js';
import { sortOptionsByLabel } from '../../utils/sortOptionsByLabel.js';

// Mirrors ui/views/ContentProviderSettingsView.js's own shape, one role
// over — the same small, dedicated settings page, the same
// RoleProviderPreferenceStore/SetRoleProviderPreferenceUseCase pair
// (application/settings/RoleProviderPreferenceSettingsView.js's own
// describeRoleProviderPreferenceSettings() is already role-agnostic; this
// view is the first caller to pass it RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY
// rather than CONTENT).
//
// Chooses which substrate this replica's own composition roots — Publication,
// Snapshot, and Place Naming distribution, and Commentary distribution's
// own asynchronous publish — construct their announcement/discovery
// collaborator against (see application/publication/distribution/PublicationDistributionRuntimeComposition.js,
// application/snapshot/SnapshotDistributionRuntimeComposition.js, application/
// PlaceNamingPublicationRuntimeComposition.js, and ui/main.js's own
// addPublicationCommentaryCommand()). A caller that already offers its own
// explicit, per-action Nostr/Arweave choice (WorldEncounterCanvas's own
// "Announcement / Discovery substrate" control, and addPublicationCommentaryCommand's
// own input.discoveryProvider) still wins for that one call — this
// preference is read only as the DEFAULT when no explicit per-call choice
// is made.
//
// UNLIKE CONTENT, THE PROVIDER LIST IS HARDCODED HERE, NOT READ FROM A
// REGISTRY. Announcement & Discovery has no keyed registry the way
// content/ContentStore.js's own SnapshotPlacementStoreRegistry does (see
// application/settings/RoleAwareProviderResolver.js's own header, "Discovery has NO
// such registry yet") — 'nostr'/'arweave' are this codebase's only two
// real Announcement/Discovery substrates today, named here the same way
// every composition root above already names them as literal strings.
//
// Both keys already title-case to "Nostr"/"Arweave" through
// describeRoleProviderPreferenceSettings()'s own label fallback, so no
// label map is needed here.
const AVAILABLE_PROVIDER_KEYS = ['nostr', 'arweave'];

export default {
    name: 'AnnouncementDiscoveryProviderSettingsView',
    setup() {
        const preferenceStore = inject('roleProviderPreferenceStore', null);
        const setRoleProviderPreferenceUseCase = inject('setRoleProviderPreferenceUseCase', null);

        const form = useRoleProviderPreferenceForm({
            role: RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY,
            preferenceStore,
            setUseCase: setRoleProviderPreferenceUseCase
        });

        const settings = computed(() => sortOptionsByLabel(describeRoleProviderPreferenceSettings({
            availableProviderKeys: AVAILABLE_PROVIDER_KEYS
        }).options));

        return {
            settings, selectedProviderKey: form.selectedProviderKey,
            saveError: form.saveError, saveStatus: form.saveStatus, save: form.save
        };
    },
    template: `
        <section class="announcement-discovery-provider-settings-view">
            <h1>Announcement / Discovery Provider</h1>
            <p class="form-hint form-hint--neutral">
                Choose the default decentralized substrate — Nostr or Arweave — used to announce and discover Publications, Snapshots, Place Naming claims, and Commentary. A page or control offering its own explicit choice still overrides this default for that one action.
            </p>
            <p class="form-hint form-hint--neutral">
                Saving here takes effect the next time this app loads — it never changes an announcement already in flight.
            </p>

            <div class="announcement-discovery-provider-settings-form">
                <label v-for="opt in settings" :key="opt.providerKey" class="announcement-discovery-provider-option">
                    <input type="radio" name="announcement-discovery-provider-preference" :value="opt.providerKey" v-model="selectedProviderKey" />
                    {{ opt.label }}
                </label>

                <p v-if="saveError" class="form-hint">{{ saveError }}</p>
                <p v-if="saveStatus === 'saved'" class="form-hint form-hint--neutral">Saved.</p>

                <button class="action-btn action-btn--primary" @click="save" :disabled="!selectedProviderKey">Save</button>
            </div>
        </section>
    `
};
