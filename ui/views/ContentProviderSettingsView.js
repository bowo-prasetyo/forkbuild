import { ref, computed, inject } from 'vue';
import { useRoleProviderPreferenceForm } from '../composables/useRoleProviderPreferenceForm.js';
import { useEndpointSettingsForm } from '../composables/useEndpointSettingsForm.js';
import { RoleProviderRole } from '../../core/RoleProviderRole.js';
import { describeRoleProviderPreferenceSettings } from '../../application/RoleProviderPreferenceSettingsView.js';
import { DEFAULT_IPFS_NODE_API_URL } from '../../core/IpfsNodeConfiguration.js';
import { sortOptionsByLabel } from '../../utils/sortOptionsByLabel.js';

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
// THE PROVIDER LIST COMES FROM THE REGISTRY, WITH ONE DELIBERATE, HARDCODED
// EXCEPTION. `availableProviderKeys` starts from the SAME
// `preferredSnapshotPlacementCreationCoordinator`
// (application/PreferredSnapshotPlacementCreationCoordinator.js, 0.9.299)
// the Publication Center's own "Use Preferred Provider" trigger already
// consumes — its `availableStorageTypes()` is a pass-through to the real,
// currently-registered content/ContentStore.js registry (application/
// SnapshotPlacementStoreRegistry.js), the identical seam that already keeps
// that page from ever offering a storage type nobody can actually place
// onto. This view never asks "is 'ipfs' valid" on its own; it only ever
// renders whatever that registry already reports — EXCEPT for
// `'remote-pinning'`, appended here unconditionally. content/
// IpfsRemotePinningContentStore.js's own `storage` getter self-reports
// `'ipfs'` (it shares Local Kubo's `ipfs://` locator scheme), so it can
// never occupy its own key in that registry — see that class's own header,
// "offering this store as an EXPLICIT alternative to Kubo... requires a
// second, separately constructed registry," deliberately left unbuilt.
// Saving `'remote-pinning'` as the CONTENT preference is still a real,
// well-formed choice (core/RoleProviderPreference.js's own `providerKey` is
// a shape check only, never a registry-membership check), and
// PreferredSnapshotPlacementCreationCoordinator.js's own `create()` already
// reports it back as an explicit PROVIDER_NOT_FOUND outcome — never a
// crash, never a silent substitution — for a Wanderer who then clicks the
// registry-driven "Use Preferred Provider" one-click trigger, which
// genuinely cannot supply the fresh endpoint/credential a pinning provider
// needs. This one addition exists so a Wanderer who runs no Kubo node,
// local or remote, can save "Remote Pinning" as their preferred Content
// default and have the Publication/Snapshot distribution pickers
// (ui/views/EditorView.js, ui/components/OwnPublicationPanel.js, ui/
// components/WorldEncounterCanvas.js) open on it, instead of always
// re-picking it by hand.
//
// THIS PAGE NEVER TOUCHES EXPLICIT PLACEMENT. It never imports, injects, or
// calls `snapshotPlacementCreationCoordinator` (the coordinator behind the
// existing per-storage "Create Local/IPFS Placement" buttons) — saving a
// preference here can never retroactively change, or be changed by,
// clicking one of those buttons. See docs/Roadmap.md, "0.9.302 — Content
// Provider Preference Settings Entry Point," "One subtle product decision."
//
// LOCAL IS NEVER OFFERED. The list starts from the coordinator's
// `preferableStorageTypes()`, not `availableStorageTypes()`: every
// Publication is already stored on this device before any placement, so
// "Local" is never a meaningful preference — see application/
// PreferredSnapshotPlacementCreationCoordinator.js's own "`local` IS NEVER
// A PREFERENCE." A `local` preference saved before this change still sits
// in the store; this page shows it as "nothing selected" (with a note
// asking for a new choice), and "Use Preferred Provider" already treats it
// as no preference at all.
//
// ONLY CONTENT. This view hardcodes `RoleProviderRole.CONTENT` — there is
// no role selector, and no Discovery or Proof & Anchoring section — exactly
// the "deliberately narrow" scope that milestone's own brief names.
//
// IPFS NODE URL — A SEPARATE SETTING, NEVER THE PROVIDER PREFERENCE ITSELF.
// The "IPFS Node" field below configures WHERE the 'ipfs' backend places
// content (content/IpfsContentStore.js's own `apiUrl`, persisted through
// storage/IpfsNodeConfigurationStore.js) — a local Kubo node, a remote one,
// whatever a person points it at. It never changes WHICH backend "Use
// Preferred Provider" selects; that stays exactly the radio-button choice
// above, untouched by this field. This view still never constructs an
// IpfsNodeConfiguration itself — it only reads one back from
// ipfsNodeConfigurationStore.get() to display what's on file, and saves a
// change through setIpfsNodeConfigurationUseCase.execute({ apiUrl }), the
// identical read/write split ui/views/IpfsGatewaySettingsView.js already
// holds for the separate, read-path gateway setting. A change saved here
// takes effect on the next application load only — ui/main.js resolves
// ipfsNodeConfigurationStore.get() once at startup.
export default {
    name: 'ContentProviderSettingsView',
    setup() {
        const preferenceStore = inject('roleProviderPreferenceStore', null);
        const setRoleProviderPreferenceUseCase = inject('setRoleProviderPreferenceUseCase', null);
        const preferredPlacementCreationCoordinator = inject('preferredSnapshotPlacementCreationCoordinator', null);
        const ipfsNodeConfigurationStore = inject('ipfsNodeConfigurationStore', null);
        const setIpfsNodeConfigurationUseCase = inject('setIpfsNodeConfigurationUseCase', null);

        // A legacy saved `local` preference — registered, but not
        // preferable — is displayed as "nothing selected," never as a radio
        // button that no longer exists. Derived from the coordinator's own
        // two lists, never a hardcoded 'local' check here.
        function isUnofferedProviderKey(key) {
            if (!preferredPlacementCreationCoordinator) return false;
            return preferredPlacementCreationCoordinator.availableStorageTypes().includes(key)
                && !preferredPlacementCreationCoordinator.preferableStorageTypes().includes(key);
        }

        const preferenceForm = useRoleProviderPreferenceForm({
            role: RoleProviderRole.CONTENT,
            preferenceStore,
            setUseCase: setRoleProviderPreferenceUseCase,
            isSelectable: (key) => !isUnofferedProviderKey(key)
        });

        const hasUnofferedPreference = computed(() => (
            preferenceForm.preference.value !== null && isUnofferedProviderKey(preferenceForm.preference.value.providerKey)
        ));

        const availableProviderKeys = computed(() => {
            const registered = preferredPlacementCreationCoordinator ? preferredPlacementCreationCoordinator.preferableStorageTypes() : [];
            return registered.includes('remote-pinning') ? registered : [...registered, 'remote-pinning'];
        });

        const settings = computed(() => {
            const described = describeRoleProviderPreferenceSettings({
                availableProviderKeys: availableProviderKeys.value
            });
            return { ...described, options: sortOptionsByLabel(described.options) };
        });

        // The separate IPFS Node setting — the identical read / Save /
        // "Use Deployment Default" shape ui/views/IpfsGatewaySettingsView.js
        // holds for the read-path gateway setting.
        const ipfsNodeApiUrlInput = ref('');
        const ipfsNodeForm = useEndpointSettingsForm({
            store: ipfsNodeConfigurationStore,
            useCase: setIpfsNodeConfigurationUseCase,
            buildRequest: () => {
                const apiUrl = ipfsNodeApiUrlInput.value.trim();
                return apiUrl ? { apiUrl } : null;
            },
            fillInputs: (configuration) => {
                ipfsNodeApiUrlInput.value = configuration ? configuration.apiUrl : '';
            }
        });
        const effectiveIpfsNodeApiUrl = computed(() => (
            ipfsNodeForm.configuration.value ? ipfsNodeForm.configuration.value.apiUrl : DEFAULT_IPFS_NODE_API_URL
        ));

        return {
            settings, selectedProviderKey: preferenceForm.selectedProviderKey, hasUnofferedPreference,
            saveError: preferenceForm.saveError, saveStatus: preferenceForm.saveStatus, save: preferenceForm.save,
            hasIpfsNodeOverride: ipfsNodeForm.hasConfiguration, effectiveIpfsNodeApiUrl, ipfsNodeApiUrlInput,
            ipfsNodeSaveError: ipfsNodeForm.saveError, ipfsNodeSaveStatus: ipfsNodeForm.saveStatus,
            ipfsNodeClearStatus: ipfsNodeForm.clearStatus,
            saveIpfsNodeConfiguration: ipfsNodeForm.save, useIpfsNodeDeploymentDefault: ipfsNodeForm.clear
        };
    },
    template: `
        <section class="content-provider-settings-view">
            <h1>Content Provider</h1>
            <p class="form-hint form-hint--neutral">
                Choose which storage backend "Use Preferred Provider" places new Content onto in the Publication Center. Content is always kept on this device first, so only decentralized backends are listed here. This never changes what the explicit placement buttons there do.
            </p>
            <p v-if="hasUnofferedPreference" class="form-hint form-hint--neutral">
                Your previously saved "Local" preference no longer applies — Content is already stored on this device. Choose a backend below and save.
            </p>

            <div v-if="settings.options.length" class="content-provider-settings-form">
                <label v-for="opt in settings.options" :key="opt.providerKey" class="content-provider-option">
                    <input type="radio" name="content-provider-preference" :value="opt.providerKey" v-model="selectedProviderKey" />
                    {{ opt.label }}
                </label>

                <p v-if="saveError" class="form-hint">{{ saveError }}</p>
                <p v-if="saveStatus === 'saved'" class="form-hint form-hint--neutral">Saved.</p>

                <button class="action-btn action-btn--primary" @click="save" :disabled="!selectedProviderKey">Save</button>
            </div>
            <p v-else class="form-hint form-hint--neutral">
                No content providers are currently registered on this replica.
            </p>

            <h2>IPFS Node</h2>
            <p class="form-hint form-hint--neutral">
                The node the 'IPFS' backend places new Content onto — your own local Kubo node, or a remote one you
                point it at instead. This never changes which backend "Use Preferred Provider" selects above, and
                never changes the separate IPFS Gateway setting used for reading already-placed IPFS content.
            </p>

            <p v-if="hasIpfsNodeOverride" class="form-hint form-hint--neutral">
                Current override: {{ effectiveIpfsNodeApiUrl }}
            </p>
            <p v-else class="form-hint form-hint--neutral">
                No override configured. Currently using the deployment default: {{ effectiveIpfsNodeApiUrl }}
            </p>

            <div class="ipfs-node-settings-form">
                <input
                    type="text"
                    v-model="ipfsNodeApiUrlInput"
                    placeholder="http://127.0.0.1:5001"
                    class="ipfs-node-api-url-input form-input"
                />

                <p v-if="ipfsNodeSaveError" class="form-hint">{{ ipfsNodeSaveError }}</p>
                <p v-if="ipfsNodeSaveStatus === 'saved'" class="form-hint form-hint--neutral">Saved.</p>
                <p v-if="ipfsNodeClearStatus === 'cleared'" class="form-hint form-hint--neutral">Cleared — now using the deployment default.</p>

                <button class="action-btn action-btn--primary" @click="saveIpfsNodeConfiguration" :disabled="!ipfsNodeApiUrlInput.trim()">Save</button>
                <button class="action-btn" @click="useIpfsNodeDeploymentDefault">Use Deployment Default</button>
            </div>
        </section>
    `
};
