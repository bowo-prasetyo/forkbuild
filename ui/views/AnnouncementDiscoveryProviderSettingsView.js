import { ref, computed, inject, onMounted } from 'vue';
import { RoleProviderRole } from '../../core/RoleProviderRole.js';
import { describeRoleProviderPreferenceSettings } from '../../application/RoleProviderPreferenceSettingsView.js';
import { sortOptionsByLabel } from '../../utils/sortOptionsByLabel.js';

// Mirrors ui/views/ContentProviderSettingsView.js's own shape, one role
// over — the same small, dedicated settings page, the same
// RoleProviderPreferenceStore/SetRoleProviderPreferenceUseCase pair
// (application/RoleProviderPreferenceSettingsView.js's own
// describeRoleProviderPreferenceSettings() is already role-agnostic; this
// view is the first caller to pass it RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY
// rather than CONTENT).
//
// Chooses which substrate this replica's own composition roots — Publication,
// Snapshot, and Place Naming distribution, and Commentary distribution's
// own asynchronous publish — construct their announcement/discovery
// collaborator against (see application/PublicationDistributionRuntimeComposition.js,
// application/SnapshotDistributionRuntimeComposition.js, application/
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
// application/RoleAwareProviderResolver.js's own header, "Discovery has NO
// such registry yet") — 'nostr'/'arweave' are this codebase's only two
// real Announcement/Discovery substrates today, named here the same way
// every composition root above already names them as literal strings.
const AVAILABLE_PROVIDER_KEYS = ['nostr', 'arweave'];
const PROVIDER_OPTION_LABELS = { nostr: 'Nostr', arweave: 'Arweave' };

export default {
    name: 'AnnouncementDiscoveryProviderSettingsView',
    setup() {
        const preferenceStore = inject('roleProviderPreferenceStore', null);
        const setRoleProviderPreferenceUseCase = inject('setRoleProviderPreferenceUseCase', null);

        const preference = ref(null);
        const selectedProviderKey = ref(null);
        const saveError = ref(null);
        const saveStatus = ref('idle'); // 'idle' | 'saving' | 'saved'

        const settings = computed(() => sortOptionsByLabel(describeRoleProviderPreferenceSettings({
            role: RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY,
            availableProviderKeys: AVAILABLE_PROVIDER_KEYS,
            preference: preference.value
        }).options.map((option) => ({ ...option, label: PROVIDER_OPTION_LABELS[option.providerKey] || option.label }))));

        // Re-reads the store fresh on every load — the identical restraint
        // ContentProviderSettingsView.js's own `load()` already holds, so a
        // fresh instance of this view observes whatever a prior instance
        // (or ui/main.js's own boot-time read) most recently persisted.
        function load() {
            if (!preferenceStore) return;
            preference.value = preferenceStore.get(RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY);
            selectedProviderKey.value = preference.value ? preference.value.providerKey : null;
        }

        function save() {
            if (!setRoleProviderPreferenceUseCase || !selectedProviderKey.value) return;
            saveError.value = null;
            saveStatus.value = 'saving';
            try {
                preference.value = setRoleProviderPreferenceUseCase.execute({
                    role: RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY,
                    providerKey: selectedProviderKey.value
                });
                saveStatus.value = 'saved';
            } catch (error) {
                saveStatus.value = 'idle';
                saveError.value = error.message;
            }
        }

        onMounted(load);

        return { settings, selectedProviderKey, saveError, saveStatus, save };
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

                <button class="action-btn action-btn--primary" @click="save" :disabled="saveStatus === 'saving' || !selectedProviderKey">Save</button>
            </div>
        </section>
    `
};
