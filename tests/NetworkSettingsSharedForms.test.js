import { register } from 'node:module';

import { StorageProvider } from '../storage/StorageProvider.js';
import { ArweaveGatewayConfigurationStore } from '../storage/ArweaveGatewayConfigurationStore.js';
import { IpfsGatewayConfigurationStore } from '../storage/IpfsGatewayConfigurationStore.js';
import { IpfsNodeConfigurationStore } from '../storage/IpfsNodeConfigurationStore.js';
import { BitcoinEsploraConfigurationStore } from '../storage/BitcoinEsploraConfigurationStore.js';
import { NostrRelayConfigurationStore } from '../storage/NostrRelayConfigurationStore.js';
import { IceServerConfigurationStore } from '../storage/IceServerConfigurationStore.js';
import { TurnServerConfigurationStore } from '../storage/TurnServerConfigurationStore.js';
import { RendezvousConfigurationStore } from '../storage/RendezvousConfigurationStore.js';
import { RoleProviderPreferenceStore } from '../storage/RoleProviderPreferenceStore.js';
import { SetArweaveGatewayConfigurationUseCase } from '../application/SetArweaveGatewayConfigurationUseCase.js';
import { SetIpfsGatewayConfigurationUseCase } from '../application/SetIpfsGatewayConfigurationUseCase.js';
import { SetIpfsNodeConfigurationUseCase } from '../application/SetIpfsNodeConfigurationUseCase.js';
import { SetBitcoinEsploraConfigurationUseCase } from '../application/SetBitcoinEsploraConfigurationUseCase.js';
import { SetNostrRelayConfigurationUseCase } from '../application/SetNostrRelayConfigurationUseCase.js';
import { SetIceServerConfigurationUseCase } from '../application/SetIceServerConfigurationUseCase.js';
import { SetTurnServerConfigurationUseCase } from '../application/SetTurnServerConfigurationUseCase.js';
import { SetRendezvousConfigurationUseCase } from '../application/SetRendezvousConfigurationUseCase.js';
import { SetRoleProviderPreferenceUseCase } from '../application/SetRoleProviderPreferenceUseCase.js';
import { RoleProviderRole } from '../core/RoleProviderRole.js';
import { splitNonEmptyLines } from '../utils/splitNonEmptyLines.js';

// Network Settings — shared form behavior.
//
// Every Network Settings page runs its read / Save / clear lifecycle through
// one of two shared composables: ui/composables/useEndpointSettingsForm.js
// (Arweave Gateway, IPFS Gateway, IPFS Node, Bitcoin Endpoint, Nostr Relays,
// STUN, TURN, Rendezvous) or ui/composables/useRoleProviderPreferenceForm.js
// (Content, Announcement / Discovery, Proof / Anchoring). This suite mounts
// every one of those REAL pages (tests/support/MinimalVueCompositionApiShim.js)
// over real, in-memory stores and real write use cases, so a regression in
// either composable — or in how any one page wires it — fails here.
//
//   Section A — splitNonEmptyLines(): trimming, blank lines, order.
//   Section B — every endpoint page: empty mount, empty-input no-op, save
//               round-trip (normalized back into the inputs), remount reads
//               what was saved, an invalid entry is refused without touching
//               what is on file, clear back to "nothing on file", and a page
//               mounted with nothing injected stays inert.
//   Section C — the Announcement / Discovery and Proof / Anchoring pages:
//               preselection from the store, save, remount, refusal.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// One row per endpoint page. `inputs` names the page's own input refs;
// `valid` / `invalid` are values for those refs; `saved` is what the refs
// read back after a successful save (the value object's own normalization).
const ENDPOINT_PAGES = [
    {
        label: 'Arweave Gateway', view: 'ArweaveGatewaySettingsView.js',
        storeKey: 'arweaveGatewayConfigurationStore', useCaseKey: 'setArweaveGatewayConfigurationUseCase',
        Store: ArweaveGatewayConfigurationStore, UseCase: SetArweaveGatewayConfigurationUseCase, useCaseArg: 'arweaveGatewayConfigurationStore',
        hasKey: 'hasOverride', clearKey: 'useDeploymentDefault',
        inputs: ['gatewayUrlInput'],
        valid: { gatewayUrlInput: '  https://a.example/ \n\n https://b.example ' },
        saved: { gatewayUrlInput: 'https://a.example\nhttps://b.example' },
        invalid: { gatewayUrlInput: 'not-a-url' }
    },
    {
        label: 'IPFS Gateway', view: 'IpfsGatewaySettingsView.js',
        storeKey: 'ipfsGatewayConfigurationStore', useCaseKey: 'setIpfsGatewayConfigurationUseCase',
        Store: IpfsGatewayConfigurationStore, UseCase: SetIpfsGatewayConfigurationUseCase, useCaseArg: 'ipfsGatewayConfigurationStore',
        hasKey: 'hasOverride', clearKey: 'useDeploymentDefault',
        inputs: ['gatewayUrlInput'],
        valid: { gatewayUrlInput: 'https://gateway.pinata.cloud\nhttps://ipfs.io' },
        saved: { gatewayUrlInput: 'https://gateway.pinata.cloud\nhttps://ipfs.io' },
        invalid: { gatewayUrlInput: 'ftp://not-http.example' }
    },
    {
        label: 'IPFS Node', view: 'ContentProviderSettingsView.js',
        storeKey: 'ipfsNodeConfigurationStore', useCaseKey: 'setIpfsNodeConfigurationUseCase',
        Store: IpfsNodeConfigurationStore, UseCase: SetIpfsNodeConfigurationUseCase, useCaseArg: 'ipfsNodeConfigurationStore',
        hasKey: 'hasIpfsNodeOverride', clearKey: 'useIpfsNodeDeploymentDefault', saveKey: 'saveIpfsNodeConfiguration',
        statusKeys: { saveError: 'ipfsNodeSaveError', saveStatus: 'ipfsNodeSaveStatus', clearStatus: 'ipfsNodeClearStatus' },
        inputs: ['ipfsNodeApiUrlInput'],
        valid: { ipfsNodeApiUrlInput: '  http://192.168.1.5:5001/  ' },
        saved: { ipfsNodeApiUrlInput: 'http://192.168.1.5:5001' },
        invalid: { ipfsNodeApiUrlInput: 'nope' }
    },
    {
        label: 'Bitcoin Endpoint', view: 'BitcoinEsploraSettingsView.js',
        storeKey: 'bitcoinEsploraConfigurationStore', useCaseKey: 'setBitcoinEsploraConfigurationUseCase',
        Store: BitcoinEsploraConfigurationStore, UseCase: SetBitcoinEsploraConfigurationUseCase, useCaseArg: 'bitcoinEsploraConfigurationStore',
        hasKey: 'hasOverride', clearKey: 'useDeploymentDefault',
        inputs: ['apiUrlInput'],
        valid: { apiUrlInput: ' https://mempool.example/api/ ' },
        saved: { apiUrlInput: 'https://mempool.example/api' },
        invalid: { apiUrlInput: 'nope' }
    },
    {
        label: 'Nostr Relays', view: 'NostrRelaySettingsView.js',
        storeKey: 'nostrRelayConfigurationStore', useCaseKey: 'setNostrRelayConfigurationUseCase',
        Store: NostrRelayConfigurationStore, UseCase: SetNostrRelayConfigurationUseCase, useCaseArg: 'nostrRelayConfigurationStore',
        hasKey: 'hasOverride', clearKey: 'useDeploymentDefault',
        inputs: ['relayUrlInput'],
        valid: { relayUrlInput: 'wss://relay-a.example\n\nwss://relay-b.example' },
        saved: { relayUrlInput: 'wss://relay-a.example\nwss://relay-b.example' },
        invalid: { relayUrlInput: 'https://not-a-relay.example' }
    },
    {
        label: 'STUN Servers', view: 'StunSettingsView.js',
        storeKey: 'iceServerConfigurationStore', useCaseKey: 'setIceServerConfigurationUseCase',
        Store: IceServerConfigurationStore, UseCase: SetIceServerConfigurationUseCase, useCaseArg: 'iceServerConfigurationStore',
        hasKey: 'hasOverride', clearKey: 'resetToDefaults',
        inputs: ['serversInput'],
        valid: { serversInput: 'stun:stun.a.example:3478\n  stun:stun.b.example:3478  ' },
        saved: { serversInput: 'stun:stun.a.example:3478\nstun:stun.b.example:3478' },
        invalid: { serversInput: 'https://not-stun.example' }
    },
    {
        label: 'TURN Server', view: 'TurnServerSettingsView.js',
        storeKey: 'turnServerConfigurationStore', useCaseKey: 'setTurnServerConfigurationUseCase',
        Store: TurnServerConfigurationStore, UseCase: SetTurnServerConfigurationUseCase, useCaseArg: 'turnServerConfigurationStore',
        hasKey: 'hasConfiguration', clearKey: 'clear',
        // TURN forwards every request to its use case (the button, not the
        // view, blocks empty fields), so an empty form is refused, not skipped.
        emptyIsRefused: true,
        inputs: ['urlsInput', 'usernameInput', 'credentialInput'],
        valid: { urlsInput: 'turn:relay.example:3478\nturns:relay.example:5349', usernameInput: 'alice', credentialInput: 's3cret' },
        saved: { urlsInput: 'turn:relay.example:3478\nturns:relay.example:5349', usernameInput: 'alice', credentialInput: 's3cret' },
        invalid: { urlsInput: 'stun:not-turn.example:3478', usernameInput: 'alice', credentialInput: 's3cret' }
    },
    {
        label: 'Rendezvous Servers', view: 'RendezvousSettingsView.js',
        storeKey: 'rendezvousConfigurationStore', useCaseKey: 'setRendezvousConfigurationUseCase',
        Store: RendezvousConfigurationStore, UseCase: SetRendezvousConfigurationUseCase, useCaseArg: 'rendezvousConfigurationStore',
        hasKey: 'hasOverride', clearKey: 'resetToDefaults',
        inputs: ['urlsInput'],
        valid: { urlsInput: 'wss://rendezvous-a.example\nwss://rendezvous-b.example' },
        saved: { urlsInput: 'wss://rendezvous-a.example\nwss://rendezvous-b.example' },
        invalid: { urlsInput: 'not-a-url' }
    }
];

function inputsOf(view, page) {
    return Object.fromEntries(page.inputs.map((key) => [key, view[key].value]));
}
function setInputs(view, values) {
    for (const [key, value] of Object.entries(values)) view[key].value = value;
}
function sameInputs(view, page, expected) {
    return page.inputs.every((key) => view[key].value === expected[key]);
}

async function run() {
    register(new URL('./support/VueShimLoader.mjs', import.meta.url));
    const { mountComponent } = await import('./support/MinimalVueCompositionApiShim.js');

    // ===============================================================
    // Section A — splitNonEmptyLines().
    // ===============================================================
    {
        const lines = splitNonEmptyLines('  a  \n\n\tb\n   \nc');
        assert(lines.join('|') === 'a|b|c', 'A1. entries are trimmed, blank lines dropped, order preserved');
        assert(splitNonEmptyLines('').length === 0 && splitNonEmptyLines('  \n \n').length === 0, 'A2. empty or blank-only text is an empty list');
        assert(splitNonEmptyLines(undefined).length === 0 && splitNonEmptyLines(null).length === 0, 'A3. a missing value is an empty list, never a throw');
    }
    console.log('✓ Section A: splitNonEmptyLines() reads one trimmed entry per non-empty line');

    // ===============================================================
    // Section B — every endpoint page.
    // ===============================================================
    for (const page of ENDPOINT_PAGES) {
        const Component = (await import(`../ui/views/${page.view}`)).default;
        const status = { saveError: 'saveError', saveStatus: 'saveStatus', clearStatus: 'clearStatus', ...page.statusKeys };
        const saveKey = page.saveKey || 'save';
        const L = page.label;

        const store = new page.Store(new InMemoryStorageProvider());
        const useCase = new page.UseCase({ [page.useCaseArg]: store });
        const mount = () => mountComponent(Component, { [page.storeKey]: store, [page.useCaseKey]: useCase });

        // B1. Nothing on file.
        let view = mount();
        assert(view[page.hasKey].value === false, `B1 (${L}). nothing on file -> no configuration shown`);
        assert(page.inputs.every((key) => view[key].value === ''), `B1 (${L}). nothing on file -> every input is empty`);
        assert(view[status.saveStatus].value === 'idle' && view[status.clearStatus].value === 'idle', `B1 (${L}). statuses start idle`);

        // B2. Saving an empty form.
        view[saveKey]();
        assert(store.get() === null, `B2 (${L}). saving an empty form persists nothing`);
        if (page.emptyIsRefused) {
            assert(typeof view[status.saveError].value === 'string' && view[status.saveStatus].value === 'idle',
                `B2 (${L}). an empty form is refused by the use case, with its message shown`);
        } else {
            assert(view[status.saveError].value === null && view[status.saveStatus].value === 'idle',
                `B2 (${L}). an empty form is a silent no-op`);
        }

        // B3. A valid save.
        setInputs(view, page.valid);
        view[saveKey]();
        assert(view[status.saveError].value === null && view[status.saveStatus].value === 'saved', `B3 (${L}). a valid save reports saved, no error`);
        assert(store.get() !== null, `B3 (${L}). the configuration is really persisted`);
        assert(view[page.hasKey].value === true, `B3 (${L}). the page now shows a configuration on file`);
        assert(sameInputs(view, page, page.saved),
            `B3 (${L}). the inputs read back the persisted, normalized value — found ${JSON.stringify(inputsOf(view, page))}`);

        // B4. A fresh mount reads what was saved.
        view = mount();
        assert(view[page.hasKey].value === true && sameInputs(view, page, page.saved), `B4 (${L}). a fresh mount loads the saved configuration`);

        // B5. An invalid entry is refused, leaving what is on file untouched.
        const before = JSON.stringify(store.get());
        setInputs(view, page.invalid);
        view[saveKey]();
        assert(typeof view[status.saveError].value === 'string' && view[status.saveError].value.length > 0, `B5 (${L}). an invalid entry shows the use case's own message`);
        assert(view[status.saveStatus].value === 'idle', `B5 (${L}). ... and is never reported as saved`);
        assert(JSON.stringify(store.get()) === before, `B5 (${L}). ... and the previously saved configuration is untouched`);

        // B6. Clear.
        view[page.clearKey]();
        assert(store.get() === null, `B6 (${L}). clear removes the stored configuration`);
        assert(view[page.hasKey].value === false && page.inputs.every((key) => view[key].value === ''), `B6 (${L}). clear empties the page`);
        assert(view[status.clearStatus].value === 'cleared' && view[status.saveError].value === null && view[status.saveStatus].value === 'idle',
            `B6 (${L}). clear reports cleared and resets the save state`);

        // B7. Saving again resets the cleared status.
        setInputs(view, page.valid);
        view[saveKey]();
        assert(view[status.clearStatus].value === 'idle' && view[status.saveStatus].value === 'saved', `B7 (${L}). a later save replaces the "cleared" note`);

        // B8. Nothing injected — the page stays inert rather than throwing.
        const orphan = mountComponent(Component, {});
        setInputs(orphan, page.valid);
        orphan[saveKey]();
        orphan[page.clearKey]();
        assert(orphan[page.hasKey].value === false && orphan[status.saveStatus].value === 'idle', `B8 (${L}). with nothing injected, save and clear are no-ops`);
    }
    console.log(`✓ Section B: all ${ENDPOINT_PAGES.length} endpoint pages load, save, refuse, and clear through the shared form`);

    // ===============================================================
    // Section C — role-provider pages.
    // ===============================================================
    const ROLE_PAGES = [
        {
            label: 'Announcement / Discovery', view: 'AnnouncementDiscoveryProviderSettingsView.js',
            role: RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY, extra: {}, choice: 'nostr',
            expectedOptions: 'Arweave,Nostr'
        },
        {
            label: 'Proof / Anchoring', view: 'AnchorProviderSettingsView.js',
            role: RoleProviderRole.PROOF_AND_ANCHORING, choice: 'bitcoin-op-return',
            extra: { preferredPublicationAnchorCreationCoordinator: { availableAnchorTypes: () => ['bitcoin-op-return', 'arweave'] } },
            expectedOptions: 'Arweave,Bitcoin'
        }
    ];
    for (const page of ROLE_PAGES) {
        const Component = (await import(`../ui/views/${page.view}`)).default;
        const L = page.label;
        const preferenceStore = new RoleProviderPreferenceStore(new InMemoryStorageProvider());
        const setUseCase = new SetRoleProviderPreferenceUseCase({ preferenceStore });
        const mount = () => mountComponent(Component, {
            roleProviderPreferenceStore: preferenceStore, setRoleProviderPreferenceUseCase: setUseCase, ...page.extra
        });

        let view = mount();
        assert(view.settings.value.map((o) => o.label).join() === page.expectedOptions,
            `C1 (${L}). the options render sorted, with friendly labels — found ${view.settings.value.map((o) => o.label).join()}`);
        assert(view.selectedProviderKey.value === null, `C1 (${L}). nothing on file -> nothing preselected`);

        view.save();
        assert(preferenceStore.get(page.role) === null && view.saveStatus.value === 'idle', `C2 (${L}). saving with nothing selected is a no-op`);

        view.selectedProviderKey.value = page.choice;
        view.save();
        assert(view.saveStatus.value === 'saved' && view.saveError.value === null, `C3 (${L}). a selection saves`);
        assert(preferenceStore.get(page.role).providerKey === page.choice, `C3 (${L}). ... for this page's own role`);

        view = mount();
        assert(view.selectedProviderKey.value === page.choice, `C4 (${L}). a fresh mount preselects the saved provider`);

        view.selectedProviderKey.value = 'Not-Valid';
        view.save();
        assert(typeof view.saveError.value === 'string' && view.saveStatus.value === 'idle', `C5 (${L}). a malformed key is refused with the use case's own message`);
        assert(preferenceStore.get(page.role).providerKey === page.choice, `C5 (${L}). ... leaving the saved preference untouched`);

        const other = [RoleProviderRole.CONTENT, RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY, RoleProviderRole.PROOF_AND_ANCHORING]
            .filter((role) => role !== page.role);
        assert(other.every((role) => preferenceStore.get(role) === null), `C6 (${L}). saving never touches another role`);
    }
    console.log('✓ Section C: the role-provider pages preselect, save, and refuse through the shared preference form');

    console.log(`\n✅ All ${assertionCount} Network Settings shared-form assertions passed.`);
}

run().catch((error) => {
    console.error('NetworkSettingsSharedForms.test.js FAILED:', error);
    process.exit(1);
});
