import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import util from 'node:util';

import { TurnServerConfiguration } from '../core/TurnServerConfiguration.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { TurnServerConfigurationStore } from '../storage/TurnServerConfigurationStore.js';
import { SetTurnServerConfigurationUseCase } from '../application/SetTurnServerConfigurationUseCase.js';
import { IceServerConfigurationStore } from '../storage/IceServerConfigurationStore.js';

// 0.9.456 — TURN Server Settings UI.
//
// 0.9.453 (contract audit) -> 0.9.454 (core/TurnServerConfiguration.js +
// storage/TurnServerConfigurationStore.js + application/
// TurnServerConfigurationProvider.js) -> 0.9.455 (composition into
// ui/main.js's own resolvedIceServers) built a complete, real TURN
// configuration boundary with no user-facing surface at all. This milestone
// is that missing surface — application/SetTurnServerConfigurationUseCase.js
// (this same milestone, the write seam) and ui/views/TurnServerSettingsView.js
// (this same milestone, the settings page), reachable at
// /settings/turn-server. This suite proves the whole chain end to end,
// through the REAL, unmodified view component's own setup() (via
// tests/support/MinimalVueCompositionApiShim.js, 0.9.448), never a
// re-derivation of its logic by hand.
//
// SIXTEEN LETTERED SECTIONS, MIRRORING THIS MILESTONE'S OWN REQUEST:
//   A. Empty configuration renders correctly.
//   B. Existing TURN configuration loads into the form.
//   C. Multiple URLs round-trip correctly.
//   D. turn: and turns: are both accepted.
//   E. STUN URLs are rejected by the TURN configuration boundary.
//   F. Empty lines are dropped by the view's own parsing; duplicate URLs are
//      preserved verbatim by the value object — see core/
//      TurnServerConfiguration.js's own header/tests/
//      TurnServerConfiguration.test.js Section B3: this class validates
//      shape only, never set semantics, so "duplicates are normalized" is
//      corrected here to match that deliberate, already-shipped design
//      rather than fabricating dedup behavior this milestone never adds.
//   G. Username is preserved.
//   H. Credential is preserved without being exposed diagnostically.
//   I. Save persists through the real use-case/store path.
//   J. Clear removes the configuration.
//   K. Malformed persisted configuration degrades safely.
//   L. Settings route is reachable.
//   M. Existing STUN Settings remain independent.
//   N. Existing WebRTC behavior is not duplicated or reimplemented by the view.
//   O. No automatic fallback/health-check UI appears.
//   P. No default TURN server is introduced.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No Test Connection, no health
// indicator, no automatic fallback, no failover, no server
// ranking/priorities, no credential refresh, no TURN credential generation,
// no OAuth/REST credential acquisition, no per-connection credentials, no
// multiple credential pairs, no TURN provider registries, no generic
// ICE-server configuration UI, no WebRTC diagnostics, no connection-quality
// indicators.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// A storage provider whose own save() records the RAW payload, unmodified —
// used to plant deliberately malformed bytes, mirroring every sibling
// configuration store's own malformed-persistence test convention.
class RawStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, data); }
    load(name) { return this._data.has(name) ? this._data.get(name) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function run() {
    register(new URL('./support/VueShimLoader.mjs', import.meta.url));
    const { mountComponent } = await import('./support/MinimalVueCompositionApiShim.js');
    const TurnServerSettingsView = (await import('../ui/views/TurnServerSettingsView.js')).default;

    function mount(injectionContext) {
        return mountComponent(TurnServerSettingsView, injectionContext);
    }

    function freshTriple() {
        const store = new TurnServerConfigurationStore(new InMemoryStorageProvider());
        const useCase = new SetTurnServerConfigurationUseCase({ turnServerConfigurationStore: store });
        return { store, useCase, injectionContext: { turnServerConfigurationStore: store, setTurnServerConfigurationUseCase: useCase } };
    }

    // ===============================================================
    // Section A — Empty configuration renders correctly.
    // ===============================================================
    {
        const { injectionContext } = freshTriple();
        const view = mount(injectionContext);
        assert(view.hasConfiguration.value === false, n('A1. REAL COMPONENT: a fresh mount with nothing persisted reports hasConfiguration === false'));
        assert(view.configuration.value === null, n('A2. REAL COMPONENT: configuration is null when nothing is on file'));
        assert(view.urlsInput.value === '' && view.usernameInput.value === '' && view.credentialInput.value === '',
            n('A3. REAL COMPONENT: every input starts empty when nothing is on file'));
        assert(view.saveError.value === null && view.saveStatus.value === 'idle' && view.clearStatus.value === 'idle',
            n('A4. REAL COMPONENT: no error/save/clear status is shown on an empty first mount'));

        const viewSource = await source('ui/views/TurnServerSettingsView.js');
        assert(/No TURN server configured\./.test(viewSource), n('A5. the template carries real "no configuration" copy, never a blank/broken section'));
    }
    console.log('✓ Section A: an empty TURN configuration renders correctly — every field empty, no error, no fabricated default');

    // ===============================================================
    // Section B — Existing TURN configuration loads into the form.
    // ===============================================================
    {
        const { store, useCase, injectionContext } = freshTriple();
        useCase.execute({ urls: ['turn:relay.example:3478'], username: 'wanderer', credential: 'secret-1' });

        const view = mount(injectionContext);
        assert(view.hasConfiguration.value === true, n('B1. REAL COMPONENT: a mount over an existing configuration reports hasConfiguration === true'));
        assert(view.urlsInput.value === 'turn:relay.example:3478', n('B2. REAL COMPONENT: the urls textarea is pre-filled with the persisted URL'));
        assert(view.usernameInput.value === 'wanderer', n('B3. REAL COMPONENT: the username input is pre-filled with the persisted username'));
        assert(view.credentialInput.value === 'secret-1', n('B4. REAL COMPONENT: the credential input is pre-filled with the persisted credential (a real password-style form control, never diagnostic text — see Section H)'));
        assert(view.configuration.value instanceof TurnServerConfiguration, n('B5. REAL COMPONENT: the loaded configuration is a real TurnServerConfiguration instance, read from the store, never reconstructed by the view'));
        assert(store.get().username === 'wanderer', n('B6. sanity — the store itself really has this configuration on file'));
    }
    console.log('✓ Section B: an existing TURN configuration loads into every field of the real component, exactly as persisted');

    // ===============================================================
    // Section C — Multiple URLs round-trip correctly.
    // ===============================================================
    {
        const { store, injectionContext } = freshTriple();
        const view = mount(injectionContext);

        view.urlsInput.value = 'turn:one.example:3478\nturn:two.example:3478\nturns:three.example:5349';
        view.usernameInput.value = 'multi-user';
        view.credentialInput.value = 'multi-cred';
        view.save();

        assert(view.saveStatus.value === 'saved' && view.saveError.value === null, n('C1. REAL COMPONENT: saving three URLs reports saved, no error'));
        assert(view.configuration.value.urls.length === 3, n('C2. REAL COMPONENT: the real, persisted configuration carries all three URLs'));
        assert(JSON.stringify(store.get().urls) === JSON.stringify(['turn:one.example:3478', 'turn:two.example:3478', 'turns:three.example:5349']),
            n('C3. REAL COMPONENT: all three URLs persist through the real store, in the exact order typed'));

        const reMount = mount(injectionContext);
        assert(reMount.urlsInput.value === 'turn:one.example:3478\nturn:two.example:3478\nturns:three.example:5349',
            n('C4. REAL COMPONENT: a second, independent mount reads back the same three URLs, newline-joined, in the same order'));
    }
    console.log('✓ Section C: multiple TURN URLs round-trip correctly through the real view, in order, across independent mounts');

    // ===============================================================
    // Section D — turn: and turns: are both accepted.
    // ===============================================================
    {
        const { store, injectionContext } = freshTriple();
        const view = mount(injectionContext);
        view.urlsInput.value = 'turn:plain.example:3478\nturns:secure.example:5349?transport=tcp';
        view.usernameInput.value = 'scheme-user';
        view.credentialInput.value = 'scheme-cred';
        view.save();

        assert(view.saveStatus.value === 'saved', n('D1. REAL COMPONENT: a mix of turn: and turns: URLs (one with ?transport=tcp) is accepted'));
        assert(store.get().urls.includes('turn:plain.example:3478') && store.get().urls.includes('turns:secure.example:5349?transport=tcp'),
            n('D2. REAL COMPONENT: both the turn: and the turns: (with ?transport=tcp) URL persist unchanged'));
    }
    console.log('✓ Section D: both turn: and turns: URLs (including the ?transport= form) are accepted and persist through the real view');

    // ===============================================================
    // Section E — STUN URLs are rejected by the TURN configuration boundary.
    // ===============================================================
    {
        const { store, injectionContext } = freshTriple();
        const view = mount(injectionContext);

        // A prior valid save, so the rejection below has something real to
        // leave untouched.
        view.urlsInput.value = 'turn:good.example:3478';
        view.usernameInput.value = 'e-user';
        view.credentialInput.value = 'e-cred';
        view.save();
        assert(view.saveStatus.value === 'saved', n('E1. sanity — a valid TURN configuration is saved first'));

        view.urlsInput.value = 'stun:stun.l.google.com:19302';
        view.save();
        assert(view.saveStatus.value === 'idle' && typeof view.saveError.value === 'string' && view.saveError.value.length > 0,
            n('E2. REAL COMPONENT: saving a stun: URL through the real view is rejected — idle status, a real non-empty error message'));
        assert(store.get().urls[0] === 'turn:good.example:3478', n('E3. REAL COMPONENT: the previously-saved, valid TURN configuration is left completely untouched by the rejected stun: save'));

        // Structural confirmation: the rejection is TurnServerConfiguration's
        // own boundary, never a second, view-level scheme check.
        const viewExecutable = (await source('ui/views/TurnServerSettingsView.js')).replace(/\/\/.*$/gm, '');
        assert(!/new TurnServerConfiguration\(/.test(viewExecutable), n('E4. the view never constructs a TurnServerConfiguration itself — validation stays inside the use case/value object'));
    }
    console.log('✓ Section E: a stun: URL is rejected by the real TURN configuration boundary, through the real view, leaving any previously-saved valid TURN configuration untouched');

    // ===============================================================
    // Section F — Empty lines are dropped by the view's own parsing;
    // duplicate URLs are preserved verbatim by the value object.
    // ===============================================================
    {
        const { store, injectionContext } = freshTriple();
        const view = mount(injectionContext);

        view.urlsInput.value = '\nturn:a.example:3478\n\nturn:b.example:3478\n\n';
        view.usernameInput.value = 'f-user';
        view.credentialInput.value = 'f-cred';
        view.save();
        assert(view.saveStatus.value === 'saved', n('F1. REAL COMPONENT: blank lines interleaved with valid URLs still save successfully'));
        assert(JSON.stringify(store.get().urls) === JSON.stringify(['turn:a.example:3478', 'turn:b.example:3478']),
            n('F2. REAL COMPONENT: blank lines contribute nothing — only the two real URLs persist, exactly two entries'));

        // Duplicates: TurnServerConfiguration validates shape only, never
        // set semantics (tests/TurnServerConfiguration.test.js Section B3)
        // — a duplicate URL typed twice is preserved verbatim, never
        // silently collapsed to one.
        const view2 = mount(injectionContext);
        view2.urlsInput.value = 'turn:dup.example:3478\nturn:dup.example:3478';
        view2.usernameInput.value = 'f-user-2';
        view2.credentialInput.value = 'f-cred-2';
        view2.save();
        assert(view2.saveStatus.value === 'saved', n('F3. REAL COMPONENT: a duplicated URL is accepted, never rejected as invalid'));
        assert(view2.configuration.value.urls.length === 2 && view2.configuration.value.urls[0] === view2.configuration.value.urls[1],
            n('F4. REAL COMPONENT: the duplicate is preserved verbatim through the real view -> real use case -> real value object chain, matching TurnServerConfiguration\'s own documented "never silently deduplicated" contract'));
    }
    console.log('✓ Section F: blank lines are dropped by the view\'s own parsing before reaching the value object; duplicate URLs are preserved verbatim, exactly matching TurnServerConfiguration\'s own already-shipped, deliberate "shape only, never set semantics" design');

    // ===============================================================
    // Section G — Username is preserved.
    // ===============================================================
    {
        const { store, injectionContext } = freshTriple();
        const view = mount(injectionContext);
        view.urlsInput.value = 'turn:g.example:3478';
        view.usernameInput.value = '  wanderer-g  ';
        view.credentialInput.value = 'g-cred';
        view.save();

        assert(store.get().username === 'wanderer-g', n('G1. REAL COMPONENT: the username is persisted trimmed, exactly as TurnServerConfiguration\'s own constructor normalizes it'));
        const reMount = mount(injectionContext);
        assert(reMount.usernameInput.value === 'wanderer-g', n('G2. REAL COMPONENT: a second, independent mount reads back the same trimmed username'));
    }
    console.log('✓ Section G: the username is preserved (trimmed) across save and reload, through the real view');

    // ===============================================================
    // Section H — Credential is preserved without being exposed
    // diagnostically.
    // ===============================================================
    {
        const { store, injectionContext } = freshTriple();
        const view = mount(injectionContext);
        view.urlsInput.value = 'turn:h.example:3478';
        view.usernameInput.value = 'h-user';
        view.credentialInput.value = 'super-secret-credential';
        view.save();

        assert(store.get().credential === 'super-secret-credential', n('H1. REAL COMPONENT: the real credential is actually persisted through the real store'));
        const reMount = mount(injectionContext);
        assert(reMount.credentialInput.value === 'super-secret-credential', n('H2. REAL COMPONENT: a second, independent mount\'s own password-style input round-trips the exact same credential'));

        // The credential never appears in this view's own "current
        // configuration" diagnostic/summary text — only in the password
        // input's own model.
        const configuration = store.get();
        assert(!configuration.toString().includes('super-secret-credential'), n('H3. TurnServerConfiguration#toString() never includes the real credential'));
        assert(!util.inspect(configuration).includes('super-secret-credential'), n('H4. util.inspect()/console.log() of the configuration never includes the real credential'));

        const viewSource = await source('ui/views/TurnServerSettingsView.js');
        const templateMatch = viewSource.match(/template: `([\s\S]*)`\n\};/);
        assert(templateMatch, n('H5. the real template literal is located'));
        assert(!/\{\{\s*configuration\.credential\s*\}\}/.test(templateMatch[1]), n('H6. the real template never interpolates configuration.credential as text anywhere'));
        assert(!/credential/i.test(templateMatch[1].replace(/credentialInput/g, '')) || /type="password"/.test(templateMatch[1]),
            n('H7. wherever the template does reference a credential concept outside credentialInput, the one credential-bound form control is a real password-style input'));

        console.log('✓ Section H: the credential round-trips through the real store and view, but is never exposed as diagnostic text — only through the password-style input\'s own model');
    }

    // ===============================================================
    // Section I — Save persists through the real use-case/store path.
    // ===============================================================
    {
        const { store, useCase, injectionContext } = freshTriple();
        const view = mount(injectionContext);
        view.urlsInput.value = 'turn:i.example:3478';
        view.usernameInput.value = 'i-user';
        view.credentialInput.value = 'i-cred';
        view.save();

        assert(view.configuration.value === store.get() || view.configuration.value.equals(store.get()),
            n('I1. REAL COMPONENT: save() returns exactly what the real use case persisted'));

        // A genuinely separate use case/store pair, over the SAME
        // underlying storage — the "restart" shape every sibling settings
        // suite in this codebase already checks.
        const backingProvider = injectionContext.turnServerConfigurationStore._storageProvider;
        const storeAfterRestart = new TurnServerConfigurationStore(backingProvider);
        assert(storeAfterRestart !== store, n('I2. sanity — this really is a newly constructed store, not the same instance'));
        assert(storeAfterRestart.get().username === 'i-user', n('I3. REAL COMPONENT: a newly constructed store, over the same storage, observes what the real view actually saved'));

        // Never bypasses the use case: the view holds no reference capable
        // of calling TurnServerConfigurationStore.save() directly.
        const viewExecutable = (await source('ui/views/TurnServerSettingsView.js')).replace(/\/\/.*$/gm, '');
        assert(!/\.save\(/.test(viewExecutable), n('I4. the view never calls store.save() directly — only setTurnServerConfigurationUseCase.execute()'));
        assert(useCase instanceof SetTurnServerConfigurationUseCase, n('I5. sanity — the injected use case really is a SetTurnServerConfigurationUseCase instance'));
    }
    console.log('✓ Section I: Save really persists through the real SetTurnServerConfigurationUseCase -> TurnServerConfigurationStore path, observable by a fresh store instance over the same storage');

    // ===============================================================
    // Section J — Clear removes the configuration.
    // ===============================================================
    {
        const { store, injectionContext } = freshTriple();
        const view = mount(injectionContext);
        view.urlsInput.value = 'turn:j.example:3478';
        view.usernameInput.value = 'j-user';
        view.credentialInput.value = 'j-cred';
        view.save();
        assert(store.get() !== null, n('J1. sanity — a configuration is on file before clearing'));

        view.clear();
        assert(view.hasConfiguration.value === false && view.clearStatus.value === 'cleared', n('J2. REAL COMPONENT: clear() reports hasConfiguration === false and clearStatus === "cleared"'));
        assert(view.urlsInput.value === '' && view.usernameInput.value === '' && view.credentialInput.value === '',
            n('J3. REAL COMPONENT: clear() empties every field, including the credential'));
        assert(store.get() === null, n('J4. REAL COMPONENT: the real store genuinely has nothing persisted anymore'));

        const reMount = mount(injectionContext);
        assert(reMount.hasConfiguration.value === false, n('J5. REAL COMPONENT: a third, independent mount confirms the cleared state persisted, not merely local to the instance that cleared it'));

        // Clear never saves a placeholder/empty configuration — it calls
        // clear() directly, never execute({...}) with empty values.
        const viewExecutable = (await source('ui/views/TurnServerSettingsView.js')).replace(/\/\/.*$/gm, '');
        const clearFnMatch = viewExecutable.match(/function clear\(\) \{([\s\S]*?)\n {8}\}/);
        assert(clearFnMatch, n('J6. the real clear() function is located'));
        assert(/store\.clear\(\)/.test(clearFnMatch[1]) && !/setTurnServerConfigurationUseCase/.test(clearFnMatch[1]),
            n('J7. REAL COMPONENT: clear() calls store.clear() directly and never touches the write use case — the one way back to genuine absence, never a saved empty/placeholder value'));
    }
    console.log('✓ Section J: Clear genuinely removes the TURN configuration — store.clear() directly, never a saved placeholder — and the cleared state survives across independent mounts');

    // ===============================================================
    // Section K — Malformed persisted configuration degrades safely.
    // ===============================================================
    {
        const malformedPayloads = [
            null,
            'not-an-object',
            {},
            { urls: [] },
            { urls: ['stun:not-turn.example:3478'], username: 'u', credential: 'c' },
            { urls: ['turn:ok.example:3478'], username: '', credential: 'c' },
            { urls: ['turn:ok.example:3478'], username: 'u', credential: '' },
            { urls: [null], username: 'u', credential: 'c' }
        ];
        for (const payload of malformedPayloads) {
            const rawProvider = new RawStorageProvider();
            rawProvider.save('turn-server-configuration', payload);
            const store = new TurnServerConfigurationStore(rawProvider);
            const useCase = new SetTurnServerConfigurationUseCase({ turnServerConfigurationStore: store });

            let threw = false;
            let view;
            try { view = mount({ turnServerConfigurationStore: store, setTurnServerConfigurationUseCase: useCase }); } catch { threw = true; }
            assert(!threw, `K1. REAL COMPONENT: mounting over malformed stored data never throws (payload: ${JSON.stringify(payload)})`);
            assert(view.hasConfiguration.value === false, `K2. REAL COMPONENT: malformed stored data renders as "no configuration," never a partial/broken form (payload: ${JSON.stringify(payload)})`);
            assert(view.urlsInput.value === '' && view.usernameInput.value === '' && view.credentialInput.value === '',
                `K3. REAL COMPONENT: every field stays empty over malformed stored data, never a partially-populated form (payload: ${JSON.stringify(payload)})`);
        }
    }
    console.log('✓ Section K: malformed persisted TURN configuration of every shape degrades safely through the real view — never a thrown error, never a partial/broken form');

    // ===============================================================
    // Section L — Settings route is reachable.
    // ===============================================================
    {
        const routerSource = await source('ui/router/index.js');
        assert(/path:\s*'\/settings\/turn-server'/.test(routerSource), n('L1. a real route exists for /settings/turn-server'));
        assert(routerSource.includes("import TurnServerSettingsView from '../views/TurnServerSettingsView.js';"),
            n('L2. the router imports the real view component, never a stub'));

        const hubSource = await source('ui/views/NetworkSettingsView.js');
        assert(/router-link to="\/settings\/turn-server"/.test(hubSource), n('L3. the Network Settings hub links to the TURN settings page — reachable one hop further, not a URL-only capability'));

        const appSource = await source('ui/App.js');
        assert(/router-link to="\/settings"/.test(appSource), n('L4. a real top-nav link reaches the Network Settings hub, the one hop before the TURN settings link above'));

        const mainSource = await source('ui/main.js');
        assert(mainSource.includes("import { SetTurnServerConfigurationUseCase } from '../application/SetTurnServerConfigurationUseCase.js';"),
            n('L5. ui/main.js imports the new write use case'));
        assert(/new SetTurnServerConfigurationUseCase\(\{\s*turnServerConfigurationStore\s*\}\)/.test(mainSource),
            n('L6. ui/main.js wires SetTurnServerConfigurationUseCase against the SAME shared turnServerConfigurationStore already constructed for 0.9.455, never a second disconnected store'));
        assert(/app\.provide\('turnServerConfigurationStore',\s*turnServerConfigurationStore\)/.test(mainSource),
            n('L7. the shared store is actually provided to the Vue app, not just constructed and discarded'));
        assert(/app\.provide\('setTurnServerConfigurationUseCase',\s*setTurnServerConfigurationUseCase\)/.test(mainSource),
            n('L8. the write use case is actually provided to the Vue app'));
        const storeConstructions = (mainSource.match(/new TurnServerConfigurationStore\(/g) || []).length;
        assert(storeConstructions === 1, n(`L9. ui/main.js constructs exactly one TurnServerConfigurationStore instance — found ${storeConstructions}`));

        const viewExecutable = (await source('ui/views/TurnServerSettingsView.js')).replace(/\/\/.*$/gm, '');
        assert(/inject\('turnServerConfigurationStore',\s*null\)/.test(viewExecutable), n('L10. the view reads the configuration through the injected store, never a store it constructs itself'));
        assert(/inject\('setTurnServerConfigurationUseCase',\s*null\)/.test(viewExecutable), n('L11. the view writes the configuration through the injected use case'));
    }
    console.log('✓ Section L: /settings/turn-server is really wired — nav link, hub link, route, real view import, shared store, shared use case, all app-provided');

    // ===============================================================
    // Section M — Existing STUN Settings remain independent.
    // ===============================================================
    {
        const stunSource = await source('ui/views/StunSettingsView.js');
        assert(!/TurnServerConfiguration|turnServerConfigurationStore|setTurnServerConfigurationUseCase/.test(stunSource),
            n('M1. ui/views/StunSettingsView.js references none of this milestone\'s TURN configuration concepts'));

        const turnViewExecutable = (await source('ui/views/TurnServerSettingsView.js')).replace(/\/\/.*$/gm, '');
        assert(!/iceServerConfigurationStore|setIceServerConfigurationUseCase|IceServerConfiguration/.test(turnViewExecutable),
            n('M2. ui/views/TurnServerSettingsView.js references none of the existing STUN configuration concepts — genuinely separate stores/use cases, never a shared one'));

        const networkHubSource = await source('ui/views/NetworkSettingsView.js');
        assert(/router-link to="\/settings\/stun"/.test(networkHubSource) && /router-link to="\/settings\/turn-server"/.test(networkHubSource),
            n('M3. the Network Settings hub links to both pages independently, as two separate rows'));

        // Live proof: saving a TURN configuration never touches STUN's own
        // storage key, and vice versa.
        const sharedNamespace = new InMemoryStorageProvider();
        const turnStore = new TurnServerConfigurationStore(sharedNamespace);
        const stunStore = new IceServerConfigurationStore(sharedNamespace);
        new SetTurnServerConfigurationUseCase({ turnServerConfigurationStore: turnStore }).execute({ urls: ['turn:isolation.example:3478'], username: 'm-user', credential: 'm-cred' });
        assert(stunStore.get() === null, n('M4. REAL EXECUTION: saving a TURN configuration leaves the STUN store (over the SAME underlying storage) completely empty — genuinely separate keys'));
    }
    console.log('✓ Section M: the existing STUN Settings page and its own configuration boundary are completely independent of this milestone\'s TURN Settings page and store');

    // ===============================================================
    // Section N — Existing WebRTC behavior is not duplicated or
    // reimplemented by the view.
    // ===============================================================
    {
        const viewExecutable = (await source('ui/views/TurnServerSettingsView.js')).replace(/\/\/.*$/gm, '');
        assert(!/WebRtcPeerConnectionProvider|RTCPeerConnection|setIceServers\(|resolvedIceServers|peer\//.test(viewExecutable),
            n('N1. the view never imports, constructs, or references the WebRTC peer connection machinery in any way'));
        assert(!/toIceServerEntry|resolveTurnServerConfiguration/.test(viewExecutable),
            n('N2. the view never resolves or composes an effective ICE server list itself — that stays entirely ui/main.js\'s own composition-root job (0.9.455)'));

        const mainSource = await source('ui/main.js');
        const turnUseCaseConstructions = (mainSource.match(/new SetTurnServerConfigurationUseCase\(/g) || []).length;
        assert(turnUseCaseConstructions === 1, n('N3. ui/main.js constructs exactly one SetTurnServerConfigurationUseCase — no duplicate wiring'));
        assert(mainSource.includes('resolvedTurnServerConfiguration.toIceServerEntry()'),
            n('N4. the real 0.9.455 composition (resolvedTurnServerConfiguration.toIceServerEntry() folded into resolvedIceServers) is completely unmodified by this milestone'));
    }
    console.log('✓ Section N: this settings view neither duplicates nor reimplements any existing WebRTC/ICE composition behavior — that remains entirely ui/main.js\'s own, unmodified 0.9.455 composition root');

    // ===============================================================
    // Section O — No automatic fallback/health-check UI appears.
    // ===============================================================
    {
        // Checked against the real TEMPLATE only (never the surrounding
        // design-rationale comments, which legitimately name these as
        // deliberately excluded) — the actual user-facing surface a
        // Wanderer would see or click.
        const viewSource = await source('ui/views/TurnServerSettingsView.js');
        const templateMatchForPhrases = viewSource.match(/template: `([\s\S]*)`\n\};/);
        assert(templateMatchForPhrases, n('O0. the real template literal is located'));
        const templateBody = templateMatchForPhrases[1];
        const forbiddenPhrases = ['Test Connection', 'Test TURN', 'Health Check', 'health-check', 'testConnection', 'healthCheck', 'ping(', 'probe(', 'Reconnect', 'Retry Connection'];
        for (const phrase of forbiddenPhrases) {
            assert(!templateBody.includes(phrase), n(`O1[${phrase}]. the real, user-facing template contains no "${phrase}" UI of any kind`));
        }

        const { injectionContext } = freshTriple();
        const view = mount(injectionContext);
        for (const forbiddenMethod of ['test', 'testConnection', 'healthCheck', 'ping', 'probe', 'verify', 'checkReachability']) {
            assert(typeof view[forbiddenMethod] === 'undefined', n(`O2[${forbiddenMethod}]. the real component's own setup() return value exposes no ${forbiddenMethod}() method`));
        }

        let fetchCalled = false;
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (...args) => { fetchCalled = true; return originalFetch ? originalFetch(...args) : Promise.reject(new Error('no fetch')); };
        try {
            view.urlsInput.value = 'turn:o.example:3478';
            view.usernameInput.value = 'o-user';
            view.credentialInput.value = 'o-cred';
            view.save();
            assert(!fetchCalled, n('O3. REAL COMPONENT: saving a TURN configuration never triggers a network call of any kind — no connection testing, no health checking'));
        } finally {
            globalThis.fetch = originalFetch;
        }
    }
    console.log('✓ Section O: no Test TURN Server button, no health-check UI, and no method or network call resembling one exists anywhere in the real view');

    // ===============================================================
    // Section P — No default TURN server is introduced.
    // ===============================================================
    {
        const viewSource = await source('ui/views/TurnServerSettingsView.js');
        const viewExecutableForDefaults = viewSource.replace(/\/\/.*$/gm, '');
        assert(!/DEFAULT_TURN/.test(viewExecutableForDefaults), n('P1. the view references no DEFAULT_TURN* constant of any kind — TURN has no deployment-wide default (see storage/TurnServerConfigurationStore.js\'s own header)'));
        const templateMatchForDefaults = viewSource.match(/template: `([\s\S]*)`\n\};/);
        assert(templateMatchForDefaults, n('P1b. the real template literal is located'));
        assert(!/Use Deployment Default|Reset to Defaults/.test(templateMatchForDefaults[1]),
            n('P2. the real, user-facing template carries no "reset to a default" copy — its clear action reads "Clear," never a phrase implying a fallback TURN server exists'));

        const useCaseSource = await source('application/SetTurnServerConfigurationUseCase.js');
        assert(!/DEFAULT_TURN/.test(useCaseSource), n('P3. the write use case references no DEFAULT_TURN* constant of any kind'));

        const { store, injectionContext } = freshTriple();
        const view = mount(injectionContext);
        view.clear();
        assert(store.get() === null, n('P4. REAL EXECUTION: clearing (with nothing ever saved) leaves the store at genuine null — never a fabricated default configuration'));
    }
    console.log('✓ Section P: no default TURN server of any kind is introduced by this settings surface — absence stays absence, exactly as storage/TurnServerConfigurationStore.js\'s own contract already requires');
}

run().then(() => {
    console.log(`\n✅ All ${assertionCount} TURN Server Settings UI assertions passed.`);
}).catch((error) => {
    console.error('TurnServerSettingsUI.test.js FAILED:', error);
    process.exitCode = 1;
});
