import { ref, computed, inject, onMounted } from 'vue';
import { RoleProviderRole } from '../../core/RoleProviderRole.js';
import { describeRoleProviderPreferenceSettings } from '../../application/RoleProviderPreferenceSettingsView.js';

// 0.9.302 — Content Provider Preference Settings Entry Point.
//
// The missing WRITE half of ui/views/DecentralizedPublicationsView.js's own
// "Use Preferred Provider" trigger (0.9.301): that action CONSUMES a stored
// CONTENT preference; this page is the one ordinary product path a person
// has to CREATE or CHANGE it. Deliberately its own small, dedicated view —
// mirrors ui/views/AvatarSettingsView.js's own "one page, one concern, its
// own Save action" shape, never folded into the Publication Center's own
// already-enormous template.
//
// THIS VIEW NEVER CONSTRUCTS OR INTERPRETS A RoleProviderPreference ITSELF.
// It reads one back from `roleProviderPreferenceStore.get(role)` (0.9.294)
// only to display what is already on file, and it saves a change by calling
// `setRoleProviderPreferenceUseCase.execute({ role, providerKey })`
// (application/SetRoleProviderPreferenceUseCase.js, 0.9.302) with a plain
// `{ role, providerKey }` — never `new RoleProviderPreference(...)`, and
// never a call into storage/RoleProviderPreferenceStore.js's own `save()`
// directly. See that use case's own header for the full "smallest possible
// application capability" reasoning.
//
// THE PROVIDER LIST IS NEVER HARDCODED HERE. `availableProviderKeys` comes
// straight from the SAME `preferredSnapshotPlacementCreationCoordinator`
// (application/PreferredSnapshotPlacementCreationCoordinator.js, 0.9.299)
// the Publication Center's own "Use Preferred Provider" trigger already
// consumes — its `availableStorageTypes()` is a pass-through to the real,
// currently-registered content/ContentStore.js registry (application/
// SnapshotPlacementStoreRegistry.js), the identical seam that already keeps
// that page from ever offering a storage type nobody can actually place
// onto. This view never asks "is 'ipfs' valid" on its own; it only ever
// renders whatever that registry already reports.
//
// THIS PAGE NEVER TOUCHES EXPLICIT PLACEMENT. It never imports, injects, or
// calls `snapshotPlacementCreationCoordinator` (the coordinator behind the
// existing per-storage "Create Local/IPFS Placement" buttons) — saving a
// preference here can never retroactively change, or be changed by,
// clicking one of those buttons. See docs/Roadmap.md, "0.9.302 — Content
// Provider Preference Settings Entry Point," "One subtle product decision."
//
// ONLY CONTENT. This view hardcodes `RoleProviderRole.CONTENT` — there is
// no role selector, and no Discovery or Proof & Anchoring section — exactly
// the "deliberately narrow" scope that milestone's own brief names.
export default {
    name: 'ContentProviderSettingsView',
    setup() {
        const preferenceStore = inject('roleProviderPreferenceStore', null);
        const setRoleProviderPreferenceUseCase = inject('setRoleProviderPreferenceUseCase', null);
        const preferredPlacementCreationCoordinator = inject('preferredSnapshotPlacementCreationCoordinator', null);

        const preference = ref(null);
        const selectedProviderKey = ref(null);
        const saveError = ref(null);
        const saveStatus = ref('idle'); // 'idle' | 'saving' | 'saved'

        const availableProviderKeys = computed(() =>
            preferredPlacementCreationCoordinator ? preferredPlacementCreationCoordinator.availableStorageTypes() : []
        );

        const settings = computed(() => describeRoleProviderPreferenceSettings({
            role: RoleProviderRole.CONTENT,
            availableProviderKeys: availableProviderKeys.value,
            preference: preference.value
        }));

        // Re-reads the store fresh on every load — this is what makes a
        // newly constructed instance of this view (a fresh page load, a
        // fresh application/RoleProviderPreferenceStore.js in a new test)
        // observe whatever was persisted by a PRIOR instance, never a
        // value cached from before.
        function load() {
            if (!preferenceStore) return;
            preference.value = preferenceStore.get(RoleProviderRole.CONTENT);
            selectedProviderKey.value = preference.value ? preference.value.providerKey : null;
        }

        function save() {
            if (!setRoleProviderPreferenceUseCase || !selectedProviderKey.value) return;
            saveError.value = null;
            saveStatus.value = 'saving';
            try {
                preference.value = setRoleProviderPreferenceUseCase.execute({
                    role: RoleProviderRole.CONTENT,
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
        <section class="content-provider-settings-view">
            <h1>Content Provider</h1>
            <p class="form-hint form-hint--neutral">
                Choose which storage backend "Use Preferred Provider" places new Content onto in the Publication Center. This never changes what the explicit Local/IPFS placement buttons there do.
            </p>

            <div v-if="settings.options.length" class="content-provider-settings-form">
                <label v-for="opt in settings.options" :key="opt.providerKey" class="content-provider-option">
                    <input type="radio" name="content-provider-preference" :value="opt.providerKey" v-model="selectedProviderKey" />
                    {{ opt.label }}
                </label>

                <p v-if="saveError" class="form-hint">{{ saveError }}</p>
                <p v-if="saveStatus === 'saved'" class="form-hint form-hint--neutral">Saved.</p>

                <button class="action-btn action-btn--primary" @click="save" :disabled="saveStatus === 'saving' || !selectedProviderKey">Save</button>
            </div>
            <p v-else class="form-hint form-hint--neutral">
                No content providers are currently registered on this replica.
            </p>
        </section>
    `
};
