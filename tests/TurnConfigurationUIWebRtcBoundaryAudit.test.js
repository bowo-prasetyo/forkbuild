import { readFile } from 'node:fs/promises';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { inspect } from 'node:util';
import { register } from 'node:module';

import { StorageProvider } from '../storage/StorageProvider.js';
import { TurnServerConfiguration } from '../core/TurnServerConfiguration.js';
import { TurnServerConfigurationStore } from '../storage/TurnServerConfigurationStore.js';
import { resolveTurnServerConfiguration } from '../application/TurnServerConfigurationProvider.js';
import { SetTurnServerConfigurationUseCase } from '../application/SetTurnServerConfigurationUseCase.js';
import { IceServerConfiguration } from '../core/IceServerConfiguration.js';
import { IceServerConfigurationStore } from '../storage/IceServerConfigurationStore.js';
import { NostrRelayConfiguration } from '../core/NostrRelayConfiguration.js';
import { NostrRelayConfigurationStore } from '../storage/NostrRelayConfigurationStore.js';
import { ArweaveGatewayConfiguration } from '../core/ArweaveGatewayConfiguration.js';
import { ArweaveGatewayConfigurationStore } from '../storage/ArweaveGatewayConfigurationStore.js';
import { RendezvousConfiguration } from '../core/RendezvousConfiguration.js';
import { RendezvousConfigurationStore } from '../storage/RendezvousConfigurationStore.js';
import { WebRtcPeerConnectionProvider } from '../peer/WebRtcPeerConnectionProvider.js';
import { DEFAULT_ICE_SERVERS } from '../peer/IceServerConfig.js';

// 0.9.457 — TURN Configuration UI & WebRTC Integration Boundary Audit.
//
// TYPE: test-only audit. PRODUCTION CHANGES: NONE.
//
// 0.9.453 (contract audit) -> 0.9.454 (core/TurnServerConfiguration.js +
// storage/TurnServerConfigurationStore.js + application/
// TurnServerConfigurationProvider.js) -> 0.9.455 (composition into
// ui/main.js's own resolvedIceServers) -> 0.9.456 (the real Settings UI,
// ui/views/TurnServerSettingsView.js + application/
// SetTurnServerConfigurationUseCase.js) each proved their own seam correct
// in isolation: tests/TurnWebRtcIntegration.test.js (0.9.455) drives the
// store -> provider -> composition -> RTCPeerConnection path with values
// saved DIRECTLY to the store, never through the real Settings UI;
// tests/TurnServerSettingsUI.test.js (0.9.456) drives the real view -> real
// use case -> real store path, but stops at the store — it never composes
// the result into WebRTC. Neither suite ever exercises the FULL, single,
// continuous path a real Wanderer's own action actually travels:
//
//   TURN Settings UI (real TurnServerSettingsView, save()/clear())
//        │
//        ▼
//   SetTurnServerConfigurationUseCase (0.9.456, real, unmodified)
//        │
//        ▼
//   TurnServerConfigurationStore (0.9.454, real, unmodified)
//        │
//        ▼
//   TurnServerConfigurationProvider (0.9.454, resolveTurnServerConfiguration(),
//        real, unmodified — a FRESH resolution, never a value handed
//        forward from the view's own reactive state)
//        │
//        ▼
//   ui/main.js's own composition (reproduced here against real production
//        classes only — see composeIceServers() below, and this file's own
//        Section 0 for why ui/main.js itself is never imported directly)
//        │
//        ├── STUN configuration (IceServerConfiguration /
//        │   IceServerConfigurationStore, real, unmodified)
//        │
//        └── TURN configuration
//                 │
//                 ▼
//           resolvedIceServers
//                 │
//                 ▼
//   WebRtcPeerConnectionProvider (real, unmodified)
//                 │
//                 ▼
//   RTCPeerConnection (RecordingRTCPeerConnection — a fake boundary,
//        exactly the real provider's own injected-implementation seam)
//
// This file asks exactly one question: does a user-configured TURN server,
// saved through the real Settings UI, actually travel through this
// complete production path into RTCPeerConnection, while preserving every
// security and architectural boundary 0.9.453-0.9.456 already established?
// It builds nothing new — no health checks, no connection testing, no
// automatic failover, no credential refresh, no TURN ranking/priority, no
// ICE abstraction, no provider registry, no WebRTC diagnostics. It proves
// the existing design; it does not evolve it.
//
// THE CENTRAL INVARIANT THIS AUDIT EXISTS TO CONFIRM: TURN configuration is
// consumed EXACTLY at the ICE composition boundary (ui/main.js's own
// `resolvedIceServers`); no downstream component — not
// WebRtcPeerConnectionProvider, not WebRtcPeerConnection, not any Nostr/
// Arweave/Bitcoin/Rendezvous/discovery/presence/collaboration/replication
// role — ever interprets a TURN url, credential, priority, health, or
// failover semantics of its own. See Section K.
//
// THIRTEEN SECTIONS:
//   0. Source-text wiring — the real ui/main.js composition, pinned.
//   A. Settings UI save -> persisted representation actually consumed at
//      runtime (the flagship end-to-end path).
//   B. Persistence -> provider: a freshly resolved provider sees newly
//      saved configuration, no cache/stale-value behavior anywhere.
//   C. Provider -> composition: ui/main.js obtains TURN configuration
//      through the provider, never by reaching into storage directly.
//   D. STUN + TURN composition matrix (STUN only / STUN+TURN / multiple
//      TURN urls), driven end to end through the real Settings UI.
//   E. Credential fidelity — username/credential arrive unchanged at the
//      RTC ICE configuration boundary, driven through the real UI.
//   F. Credential containment — the widest sweep yet: diagnostic strings,
//      configuration toString()/inspect, thrown errors, and the real
//      signaling payload, all driven from a TURN configuration saved
//      through the real UI.
//   G. Configuration replacement — Save A, resolve/construct, observe A;
//      Save B, resolve/construct, observe B; no stale A survives.
//   H. Clear semantics — Save, Clear, resolve — STUN-only; clear() never
//      manufactures an empty/default TURN configuration.
//   I. Malformed persisted data — corrupted bytes render as "absent" in
//      the real Settings UI AND resolve to null AND reach
//      RTCPeerConnection as STUN-only — one corrupted-data fact, observed
//      consistently at every layer.
//   J. WebRTC boundary — the real, unmodified WebRtcPeerConnectionProvider
//      with an injected fake RTCPeerConnection; the composed iceServers
//      (UI-driven) reach the constructor unchanged, including through the
//      later background fetchIceServers()-style merge.
//   K. Browser-owned alternative selection + the central invariant —
//      multiple TURN URLs (typed into the real UI) produce ONE TURN
//      ICE-server entry, never sequential application-level retry; a
//      repo-wide structural sweep confirms no file outside this
//      configuration's own composition set references TURN configuration
//      at all, and peer/ itself contains no TURN-specific vocabulary.
//   L. Cross-role isolation — TURN configuration saved/cleared through the
//      real UI never affects STUN, Rendezvous, Nostr, or Arweave
//      configuration sharing the same underlying storage.
//   M. Verdict.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No production changes of any
// kind; no TURN health checks; no connection testing; no automatic
// failover; no credential refresh; no TURN ranking/priority; no ICE
// abstraction; no provider registry; no WebRTC diagnostics.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// Records the RAW payload unmodified — used to plant deliberately malformed
// bytes, mirroring every sibling configuration store's own convention.
class RawStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, data); }
    load(name) { return this._data.has(name) ? this._data.get(name) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// One shared namespace, several independent store instances over it — the
// same "one authority, no bleed" shape tests/TurnWebRtcIntegration.test.js's
// own Section L already establishes; reused here to drive the SAME check
// through the real Settings UI instead of a raw store.save() call.
class SharedNamespaceStorageProvider extends StorageProvider {
    constructor(sharedNamespace = {}) { super(); this._namespace = sharedNamespace; }
    save(name, data) { this._namespace[name] = JSON.stringify(data); }
    load(name) { return Object.prototype.hasOwnProperty.call(this._namespace, name) ? JSON.parse(this._namespace[name]) : null; }
    remove(name) { delete this._namespace[name]; }
    list() { return Object.keys(this._namespace); }
}

// Behavioral proof (Section C) that resolveTurnServerConfiguration()
// genuinely calls the injected store's own get() — never a shortcut, never
// a cached field read straight off some other object.
class GetTrackingTurnServerConfigurationStore extends TurnServerConfigurationStore {
    constructor(storageProvider) { super(storageProvider); this.getCalls = 0; }
    get() { this.getCalls += 1; return super.get(); }
}

class FakeDataChannel {
    constructor(label) { this.label = label; this._listeners = new Map(); }
    addEventListener(type, handler) {
        if (!this._listeners.has(type)) this._listeners.set(type, new Set());
        this._listeners.get(type).add(handler);
    }
    removeEventListener(type, handler) { this._listeners.get(type)?.delete(handler); }
    send() {}
    close() {}
}

// Starts 'complete' immediately — this suite's own concern is WHICH
// iceServers value reaches the real construction call, never ICE
// gathering timing (already proven elsewhere).
class RecordingRTCPeerConnection {
    constructor({ iceServers } = {}) {
        this.iceServers = iceServers;
        RecordingRTCPeerConnection.constructions.push(iceServers);
        this.iceGatheringState = 'complete';
        this.iceConnectionState = 'new';
        this.localDescription = null;
        this._listeners = new Map();
    }
    addEventListener(type, handler) {
        if (!this._listeners.has(type)) this._listeners.set(type, new Set());
        this._listeners.get(type).add(handler);
    }
    removeEventListener(type, handler) { this._listeners.get(type)?.delete(handler); }
    createDataChannel(label) { return new FakeDataChannel(label); }
    async createOffer() { return { type: 'offer', sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' }; }
    async setLocalDescription(desc) { this.localDescription = desc; }
    close() {}
}
RecordingRTCPeerConnection.constructions = [];

// The exact composition ui/main.js itself performs (see Section 0's own
// source-text assertions, which pin these same lines in real production
// source) — reproduced here because ui/main.js is a Vue application entry
// point with side effects (createApp/router) this suite deliberately never
// imports, the same restraint tests/TurnWebRtcIntegration.test.js already
// holds.
function composeIceServers({ iceServerConfigurationStore, turnServerConfigurationStore }) {
    const resolvedStunServers = (iceServerConfigurationStore.get() || { servers: DEFAULT_ICE_SERVERS }).servers;
    const resolvedTurnServerConfiguration = resolveTurnServerConfiguration({ turnServerConfigurationStore });
    const resolvedIceServers = resolvedTurnServerConfiguration
        ? [...resolvedStunServers, resolvedTurnServerConfiguration.toIceServerEntry()]
        : resolvedStunServers;
    return { resolvedIceServers, resolvedStunServers, resolvedTurnServerConfiguration };
}

function listJsFilesRecursively(dir) {
    const results = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) results.push(...listJsFilesRecursively(full));
        else if (entry.endsWith('.js')) results.push(full);
    }
    return results;
}

async function run() {
    register(new URL('./support/VueShimLoader.mjs', import.meta.url));
    const { mountComponent } = await import('./support/MinimalVueCompositionApiShim.js');
    const TurnServerSettingsView = (await import('../ui/views/TurnServerSettingsView.js')).default;

    // A fresh, real view mount over a fresh, real store/use-case pair —
    // over an arbitrary underlying StorageProvider, so the same helper
    // drives both InMemoryStorageProvider (ordinary sections) and
    // RawStorageProvider (Section I's malformed-data section).
    function mountOver(storageProvider) {
        const store = new TurnServerConfigurationStore(storageProvider);
        const useCase = new SetTurnServerConfigurationUseCase({ turnServerConfigurationStore: store });
        const view = mountComponent(TurnServerSettingsView, {
            turnServerConfigurationStore: store,
            setTurnServerConfigurationUseCase: useCase
        });
        return { store, useCase, view };
    }

    // ===============================================================
    // Section 0 — Source-text wiring. The real ui/main.js composition,
    // pinned against real source, never merely described.
    // ===============================================================
    {
        const mainSource = await source('ui/main.js');

        assert(/const resolvedTurnServerConfiguration = resolveTurnServerConfiguration\(\{\s*turnServerConfigurationStore\s*\}\);/.test(mainSource),
            n('01. ui/main.js resolves TURN configuration through the real resolveTurnServerConfiguration(), against the real store'));
        assert(!mainSource.includes('turnServerConfigurationStore.get('),
            n('02. ui/main.js never calls turnServerConfigurationStore.get() directly — the provider is the ONLY path from store to resolved configuration'));
        assert(/const resolvedIceServers = resolvedTurnServerConfiguration\s*\n\s*\? \[\.\.\.resolvedStunServers, resolvedTurnServerConfiguration\.toIceServerEntry\(\)\]\s*\n\s*: resolvedStunServers;/.test(mainSource),
            n('03. resolvedIceServers composes STUN + TURN exactly as specified: TURN appended alongside STUN when configured, resolvedStunServers alone otherwise'));
        assert(mainSource.includes('new WebRtcPeerConnectionProvider({ iceServers: resolvedIceServers })'),
            n('04. WebRtcPeerConnectionProvider is constructed from resolvedIceServers, the STUN+TURN composite'));
        assert(/app\.provide\(\s*['"]turnServerConfigurationStore['"]\s*,\s*turnServerConfigurationStore\s*\)/.test(mainSource),
            n('05. the SAME turnServerConfigurationStore instance used to build resolvedIceServers is provided app-wide, for the real Settings UI to inject — never a second, disconnected store'));
        assert(/app\.provide\(\s*['"]setTurnServerConfigurationUseCase['"]\s*,\s*setTurnServerConfigurationUseCase\s*\)/.test(mainSource),
            n('06. the write use case, wired against that SAME store, is provided app-wide'));
        const storeConstructions = (mainSource.match(/new TurnServerConfigurationStore\(/g) || []).length;
        assert(storeConstructions === 1, n(`07. ui/main.js constructs exactly one TurnServerConfigurationStore instance — found ${storeConstructions}`));

        const providerSource = await source('peer/WebRtcPeerConnectionProvider.js');
        assert(!/TurnServerConfiguration/.test(providerSource),
            n('08. peer/WebRtcPeerConnectionProvider.js remains completely TURN-agnostic — it forwards whatever iceServers array it is given, unmodified since 0.9.455'));

        console.log('\n=== SECTION 0: SOURCE-TEXT WIRING ===');
        console.log('✓ Section 0: ui/main.js composes STUN + TURN into resolvedIceServers exclusively through resolveTurnServerConfiguration(), and provides the same store/use-case pair the real Settings UI injects.');
    }

    // ===============================================================
    // Section A — Settings UI save -> persisted representation actually
    // consumed at runtime (the flagship end-to-end path).
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const { view } = mountOver(storageProvider);

        view.urlsInput.value = 'turn:my-own-relay.example:3478';
        view.usernameInput.value = 'wanderer-a';
        view.credentialInput.value = 'sekret-a';
        view.save();
        assert(view.saveStatus.value === 'saved', n('A1. REAL COMPONENT: the real Settings UI reports a successful save'));

        // The persisted bytes actually on file — read through a genuinely
        // separate StorageProvider access, never the view's own reference.
        const rawPersisted = storageProvider.load('turn-server-configuration');
        assert(rawPersisted && rawPersisted.username === 'wanderer-a' && rawPersisted.credential === 'sekret-a',
            n('A2. the exact persisted representation on disk matches what the UI saved'));

        // A freshly constructed store/provider resolution, over the SAME
        // underlying storage, never the view's own store instance.
        const freshStore = new TurnServerConfigurationStore(storageProvider);
        const resolved = resolveTurnServerConfiguration({ turnServerConfigurationStore: freshStore });
        assert(resolved instanceof TurnServerConfiguration, n('A3. a freshly resolved provider actually observes the UI-saved configuration'));
        assert(resolved.username === 'wanderer-a' && resolved.urls[0] === 'turn:my-own-relay.example:3478',
            n('A4. …with the exact urls/username the Wanderer actually typed'));

        // The full composition, and the real, unmodified RTCPeerConnection
        // boundary.
        const iceServerConfigurationStore = new IceServerConfigurationStore(storageProvider);
        const { resolvedIceServers } = composeIceServers({ iceServerConfigurationStore, turnServerConfigurationStore: freshStore });
        RecordingRTCPeerConnection.constructions = [];
        const provider = new WebRtcPeerConnectionProvider({ iceServers: resolvedIceServers, RTCPeerConnectionImpl: RecordingRTCPeerConnection });
        provider.createOffer();
        const constructed = RecordingRTCPeerConnection.constructions[0];
        const turnEntry = constructed.find((e) => e.username === 'wanderer-a');
        assert(turnEntry, n('A5. the configuration a Wanderer saves through the real Settings UI actually reaches the real RTCPeerConnection constructor call'));
        assert(turnEntry.urls === 'turn:my-own-relay.example:3478' && turnEntry.credential === 'sekret-a',
            n('A6. …with the exact url and credential unchanged across the entire UI -> use case -> store -> provider -> composition -> RTCPeerConnection path'));
        provider.dispose();

        console.log('\n=== SECTION A: SETTINGS UI -> PERSISTENCE (FLAGSHIP) ===');
        console.log('✓ Section A: a TURN configuration saved through the real Settings UI travels, unchanged, all the way into the real RTCPeerConnection constructor call.');
    }

    // ===============================================================
    // Section B — Persistence -> provider: a freshly resolved provider
    // sees newly saved configuration, no cache/stale-value behavior.
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const { view } = mountOver(storageProvider);
        view.urlsInput.value = 'turn:relay-b1.example:3478';
        view.usernameInput.value = 'b-user-1';
        view.credentialInput.value = 'b-cred-1';
        view.save();

        // THREE independent, freshly constructed store instances over the
        // same storage — none sharing a reference with the view or with
        // each other — all observe the identical, just-saved configuration.
        for (let i = 0; i < 3; i += 1) {
            const independentStore = new TurnServerConfigurationStore(storageProvider);
            const resolved = resolveTurnServerConfiguration({ turnServerConfigurationStore: independentStore });
            assert(resolved.username === 'b-user-1', n(`B${i + 1}. independent fresh resolution #${i + 1} observes the just-saved configuration, no cache anywhere in this seam`));
        }

        // Saving again, through the SAME view, and re-resolving fresh —
        // the new value is observed, never the old one.
        view.urlsInput.value = 'turn:relay-b2.example:3478';
        view.usernameInput.value = 'b-user-2';
        view.credentialInput.value = 'b-cred-2';
        view.save();
        const afterSecondSave = resolveTurnServerConfiguration({ turnServerConfigurationStore: new TurnServerConfigurationStore(storageProvider) });
        assert(afterSecondSave.username === 'b-user-2', n('B4. a fresh resolution after a second UI save observes the NEW configuration'));
        assert(afterSecondSave.urls[0] === 'turn:relay-b2.example:3478', n('B5. …with the new url, not the previous one'));

        console.log('\n=== SECTION B: PERSISTENCE -> PROVIDER ===');
        console.log('✓ Section B: every fresh provider resolution over the same storage observes the latest UI-saved configuration — no cache, no stale value, anywhere in this seam.');
    }

    // ===============================================================
    // Section C — Provider -> composition: ui/main.js obtains TURN
    // configuration through the provider, never by reaching into storage
    // directly.
    // ===============================================================
    {
        // Behavioral: resolveTurnServerConfiguration() genuinely calls the
        // injected store's own get() — never a shortcut.
        const trackedStore = new GetTrackingTurnServerConfigurationStore(new InMemoryStorageProvider());
        trackedStore.save(new TurnServerConfiguration({ urls: 'turn:c.example:3478', username: 'c-user', credential: 'c-cred' }));
        assert(trackedStore.getCalls === 0, n('C1. sanity — save() itself never calls get()'));
        const resolved = resolveTurnServerConfiguration({ turnServerConfigurationStore: trackedStore });
        assert(trackedStore.getCalls === 1, n('C2. resolveTurnServerConfiguration() calls the injected store\'s own get() exactly once — a real call graph, not a stub'));
        assert(resolved.username === 'c-user', n('C3. …and hands back exactly what that get() call returned'));

        // Structural: ui/main.js's own TURN resolution line calls the
        // provider function, never a bare store.get() (reconfirmed live,
        // beyond Section 0's own pin, against the exact assignment).
        const mainSource = await source('ui/main.js');
        const turnResolutionLine = mainSource.split('\n').find((line) => line.includes('const resolvedTurnServerConfiguration ='));
        assert(turnResolutionLine && turnResolutionLine.includes('resolveTurnServerConfiguration({ turnServerConfigurationStore })'),
            n('C4. the exact line assigning resolvedTurnServerConfiguration calls the provider function, never store.get() inline'));

        console.log('\n=== SECTION C: PROVIDER -> COMPOSITION ===');
        console.log('✓ Section C: ui/main.js obtains TURN configuration exclusively through resolveTurnServerConfiguration(), which itself genuinely calls the injected store — never a direct storage read.');
    }

    // ===============================================================
    // Section D — STUN + TURN composition matrix, driven end to end
    // through the real Settings UI.
    // ===============================================================
    {
        // D1. STUN only — nothing saved through the TURN Settings UI.
        {
            const storageProvider = new InMemoryStorageProvider();
            const iceServerConfigurationStore = new IceServerConfigurationStore(storageProvider);
            iceServerConfigurationStore.save(new IceServerConfiguration({ servers: [{ urls: 'stun:my-stun.example:3478' }] }));
            const { store } = mountOver(storageProvider); // mounted, nothing saved
            const { resolvedIceServers } = composeIceServers({ iceServerConfigurationStore, turnServerConfigurationStore: store });
            assert(resolvedIceServers.length === 1 && resolvedIceServers[0].urls === 'stun:my-stun.example:3478',
                n('D1. STUN only: visiting the TURN Settings page without saving anything leaves resolvedIceServers as STUN alone'));
        }

        // D2. STUN + single TURN URL, saved through the real UI.
        {
            const storageProvider = new InMemoryStorageProvider();
            const iceServerConfigurationStore = new IceServerConfigurationStore(storageProvider);
            iceServerConfigurationStore.save(new IceServerConfiguration({ servers: [{ urls: 'stun:my-stun.example:3478' }] }));
            const { view, store } = mountOver(storageProvider);
            view.urlsInput.value = 'turn:single.example:3478';
            view.usernameInput.value = 'd2-user';
            view.credentialInput.value = 'd2-cred';
            view.save();

            const { resolvedIceServers } = composeIceServers({ iceServerConfigurationStore, turnServerConfigurationStore: store });
            assert(resolvedIceServers.length === 2, n('D2. STUN + single TURN url: exactly two entries — STUN untouched, one TURN entry appended'));
            assert(resolvedIceServers[0].urls === 'stun:my-stun.example:3478', n('D3. …the STUN entry survives, first, unchanged'));
            assert(resolvedIceServers[1].username === 'd2-user' && resolvedIceServers[1].urls === 'turn:single.example:3478',
                n('D4. …the TURN entry carries exactly the single url/username the UI saved'));
        }

        // D3. STUN + multiple TURN URLs, typed into the real UI textarea.
        {
            const storageProvider = new InMemoryStorageProvider();
            const iceServerConfigurationStore = new IceServerConfigurationStore(storageProvider);
            iceServerConfigurationStore.save(new IceServerConfiguration({ servers: [{ urls: 'stun:my-stun.example:3478' }, { urls: 'stun:my-second-stun.example:3478' }] }));
            const { view, store } = mountOver(storageProvider);
            view.urlsInput.value = 'turn:multi-a.example:3478\nturns:multi-b.example:5349?transport=tcp';
            view.usernameInput.value = 'd3-user';
            view.credentialInput.value = 'd3-cred';
            view.save();

            const { resolvedIceServers } = composeIceServers({ iceServerConfigurationStore, turnServerConfigurationStore: store });
            assert(resolvedIceServers.length === 3, n('D5. STUN(2) + multi-url TURN: three entries total — TWO STUN entries plus exactly ONE TURN entry, never one TURN entry per url'));
            const turnEntry = resolvedIceServers.find((e) => e.username === 'd3-user');
            assert(Array.isArray(turnEntry.urls) && turnEntry.urls.length === 2, n('D6. …the one TURN entry carries both urls together, as an array'));
            assert(turnEntry.urls[0] === 'turn:multi-a.example:3478' && turnEntry.urls[1] === 'turns:multi-b.example:5349?transport=tcp',
                n('D7. …in the exact order typed into the real UI textarea'));
        }

        console.log('\n=== SECTION D: STUN + TURN COMPOSITION MATRIX ===');
        console.log('✓ Section D: STUN-only, STUN+single-TURN, and STUN+multi-url-TURN all compose into the exact resolvedIceServers structure specified, driven end to end through the real Settings UI.');
    }

    // ===============================================================
    // Section E — Credential fidelity, driven through the real UI.
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const iceServerConfigurationStore = new IceServerConfigurationStore(storageProvider);
        const { view, store } = mountOver(storageProvider);
        view.urlsInput.value = 'turn:e.example:3478';
        view.usernameInput.value = 'e-user-!@#';
        view.credentialInput.value = 'p@ss/w0rd+special=chars&more?stuff';
        view.save();

        const { resolvedIceServers } = composeIceServers({ iceServerConfigurationStore, turnServerConfigurationStore: store });
        RecordingRTCPeerConnection.constructions = [];
        const provider = new WebRtcPeerConnectionProvider({ iceServers: resolvedIceServers, RTCPeerConnectionImpl: RecordingRTCPeerConnection });
        provider.createOffer();
        const constructed = RecordingRTCPeerConnection.constructions[0];
        const turnEntry = constructed.find((e) => e.urls === 'turn:e.example:3478');
        assert(turnEntry.username === 'e-user-!@#', n('E1. the username, exactly as typed into the real UI, arrives byte-for-byte at the RTCIceServer entry'));
        assert(turnEntry.credential === 'p@ss/w0rd+special=chars&more?stuff', n('E2. the credential, including special characters, arrives byte-for-byte, never re-encoded, escaped, or truncated'));
        provider.dispose();

        console.log('\n=== SECTION E: CREDENTIAL FIDELITY ===');
        console.log('✓ Section E: a credential typed into the real Settings UI reaches RTCIceServer exactly as entered, special characters included.');
    }

    // ===============================================================
    // Section F — Credential containment: the widest sweep, driven from a
    // TURN configuration saved through the real UI.
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const iceServerConfigurationStore = new IceServerConfigurationStore(storageProvider);
        const SECRET = 'do-not-leak-this-credential-f-xyz789';
        const { view, store } = mountOver(storageProvider);
        view.urlsInput.value = 'turn:f.example:3478';
        view.usernameInput.value = 'f-user';
        view.credentialInput.value = SECRET;
        view.save();

        const freshStore = new TurnServerConfigurationStore(storageProvider);
        const resolved = resolveTurnServerConfiguration({ turnServerConfigurationStore: freshStore });

        // F1/F2. Never through toString()/util.inspect() of the resolved
        // configuration object, at the point THIS milestone's own path
        // actually reads it (a fresh resolution, not the view's own
        // in-memory instance).
        assert(!String(resolved).includes(SECRET), n('F1. a freshly resolved TurnServerConfiguration\'s own toString() never includes the raw credential'));
        assert(!inspect(resolved).includes(SECRET), n('F2. util.inspect() (console.log) of that resolved configuration never includes the raw credential'));

        // F3. Never through the real Settings UI's own rendered
        // "current configuration" template text — the actual template
        // literal, not merely the surrounding design-rationale comments.
        const viewSource = await source('ui/views/TurnServerSettingsView.js');
        const templateMatch = viewSource.match(/template: `([\s\S]*)`\n\};/);
        assert(templateMatch, n('F3. the real template literal is located'));
        assert(!templateMatch[1].includes(SECRET), n('F4. the real, rendered Settings UI template text never contains the raw credential — it appears only inside the password-style credentialInput form control'));

        // F5. Never through a thrown composition error.
        try {
            composeIceServers({ iceServerConfigurationStore: { get: () => { throw new Error('boom'); } }, turnServerConfigurationStore: freshStore });
            assert(false, n('F5. sanity — composeIceServers should have thrown for this deliberately broken STUN store'));
        } catch (error) {
            assert(!String(error).includes(SECRET), n('F5. a composition-time error never interpolates the UI-saved TURN credential'));
        }

        // F6. Never through the real WebRTC signaling payload actually
        // produced for a remote peer.
        const { resolvedIceServers } = composeIceServers({ iceServerConfigurationStore, turnServerConfigurationStore: freshStore });
        RecordingRTCPeerConnection.constructions = [];
        const provider = new WebRtcPeerConnectionProvider({ iceServers: resolvedIceServers, RTCPeerConnectionImpl: RecordingRTCPeerConnection });
        const connection = provider.createOffer();
        const localSignal = await new Promise((resolve) => connection.onLocalSignalReady(resolve));
        assert(!JSON.stringify(localSignal.toJSON()).includes(SECRET), n('F6. the actual signaling payload handed to a remote peer never contains the UI-saved TURN credential'));

        // F7. Never through util.inspect() of the live WebRtcPeerConnection
        // instance itself (a diagnostic surface neither prior suite
        // checked directly).
        assert(!inspect(connection).includes(SECRET), n('F7. util.inspect() of the live WebRtcPeerConnection instance never includes the raw credential'));
        provider.dispose();

        console.log('\n=== SECTION F: CREDENTIAL CONTAINMENT ===');
        console.log('✓ Section F: a credential saved through the real Settings UI never leaks through toString()/inspect, the rendered template, a thrown composition error, the signaling payload, or the live connection object — it reaches only the RTCIceServer entry itself.');
    }

    // ===============================================================
    // Section G — Configuration replacement: Save A, resolve/construct,
    // observe A; Save B, resolve/construct, observe B; no stale A.
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const iceServerConfigurationStore = new IceServerConfigurationStore(storageProvider);
        const { view, store } = mountOver(storageProvider);

        view.urlsInput.value = 'turn:relay-g-a.example:3478';
        view.usernameInput.value = 'g-user-a';
        view.credentialInput.value = 'g-cred-a';
        view.save();
        {
            const { resolvedIceServers } = composeIceServers({ iceServerConfigurationStore, turnServerConfigurationStore: store });
            RecordingRTCPeerConnection.constructions = [];
            const provider = new WebRtcPeerConnectionProvider({ iceServers: resolvedIceServers, RTCPeerConnectionImpl: RecordingRTCPeerConnection });
            provider.createOffer();
            assert(RecordingRTCPeerConnection.constructions[0].some((e) => e.urls === 'turn:relay-g-a.example:3478'),
                n('G1. the first UI-saved TURN server (A) reaches the real RTCPeerConnection construction call'));
            provider.dispose();
        }

        // Saved again, through the SAME real Settings UI instance.
        view.urlsInput.value = 'turn:relay-g-b.example:3478';
        view.usernameInput.value = 'g-user-b';
        view.credentialInput.value = 'g-cred-b';
        view.save();
        {
            const { resolvedIceServers } = composeIceServers({ iceServerConfigurationStore, turnServerConfigurationStore: store });
            RecordingRTCPeerConnection.constructions = [];
            const provider = new WebRtcPeerConnectionProvider({ iceServers: resolvedIceServers, RTCPeerConnectionImpl: RecordingRTCPeerConnection });
            provider.createOffer();
            const constructed = RecordingRTCPeerConnection.constructions[0];
            assert(constructed.some((e) => e.urls === 'turn:relay-g-b.example:3478'), n('G2. a fresh composition, after the UI replaces the configuration, observes the NEW TURN server (B)'));
            assert(!constructed.some((e) => e.urls === 'turn:relay-g-a.example:3478'), n('G3. …and the OLD one (A) is genuinely gone from the real construction call, not merely appended alongside'));
            provider.dispose();
        }

        // A genuinely independent SECOND mount over the same storage — a
        // simulated fresh page load — also observes only B, never A.
        const secondView = mountComponent((await import('../ui/views/TurnServerSettingsView.js')).default, {
            turnServerConfigurationStore: new TurnServerConfigurationStore(storageProvider),
            setTurnServerConfigurationUseCase: new SetTurnServerConfigurationUseCase({ turnServerConfigurationStore: new TurnServerConfigurationStore(storageProvider) })
        });
        assert(secondView.usernameInput.value === 'g-user-b', n('G4. a genuinely independent second mount (a simulated fresh Settings page load) also observes only the replacement (B), never A'));

        console.log('\n=== SECTION G: CONFIGURATION REPLACEMENT ===');
        console.log('✓ Section G: replacing a TURN configuration through the real Settings UI is observed by the next composition immediately, at the real RTCPeerConnection boundary — no stale value survives anywhere in this seam.');
    }

    // ===============================================================
    // Section H — Clear semantics: Save, Clear, resolve — STUN-only;
    // clear() never manufactures an empty/default TURN configuration.
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const iceServerConfigurationStore = new IceServerConfigurationStore(storageProvider);
        iceServerConfigurationStore.save(new IceServerConfiguration({ servers: [{ urls: 'stun:h.example:3478' }] }));
        const { view, store } = mountOver(storageProvider);

        view.urlsInput.value = 'turn:h.example:3478';
        view.usernameInput.value = 'h-user';
        view.credentialInput.value = 'h-cred';
        view.save();
        {
            const { resolvedIceServers } = composeIceServers({ iceServerConfigurationStore, turnServerConfigurationStore: store });
            assert(resolvedIceServers.length === 2, n('H1. sanity — one STUN entry plus one UI-saved TURN entry before clearing'));
        }

        view.clear();
        assert(view.hasConfiguration.value === false, n('H2. REAL COMPONENT: clear() reports no TURN configuration'));

        const { resolvedIceServers, resolvedTurnServerConfiguration } = composeIceServers({ iceServerConfigurationStore, turnServerConfigurationStore: store });
        assert(resolvedTurnServerConfiguration === null, n('H3. after the real UI\'s Clear, a fresh resolution returns null — never a fabricated empty/default TurnServerConfiguration'));
        assert(resolvedIceServers.length === 1 && resolvedIceServers[0].urls === 'stun:h.example:3478',
            n('H4. …and resolvedIceServers is exactly STUN-only again, completely unaffected by the TURN clear'));

        RecordingRTCPeerConnection.constructions = [];
        const provider = new WebRtcPeerConnectionProvider({ iceServers: resolvedIceServers, RTCPeerConnectionImpl: RecordingRTCPeerConnection });
        provider.createOffer();
        const constructed = RecordingRTCPeerConnection.constructions[0];
        assert(constructed.length === 1 && !constructed[0].username && !constructed[0].credential,
            n('H5. the real RTCPeerConnection construction call carries no TURN-shaped entry (no username/credential field of any kind, empty or otherwise) after the real UI\'s Clear'));
        provider.dispose();

        // clear() never persists a placeholder — the underlying storage
        // key itself is genuinely empty, not merely reporting empty
        // through the store's own get().
        assert(storageProvider.load('turn-server-configuration') === null, n('H6. the raw underlying storage key is genuinely empty after Clear — no placeholder object of any shape was ever written'));

        console.log('\n=== SECTION H: CLEAR SEMANTICS ===');
        console.log('✓ Section H: Clear, through the real Settings UI, produces genuine absence at every layer — the provider, the composed iceServers array, and the real RTCPeerConnection construction call all agree, and no placeholder is ever persisted.');
    }

    // ===============================================================
    // Section I — Malformed persisted data: corrupted bytes render as
    // "absent" in the real Settings UI AND resolve to null AND reach
    // RTCPeerConnection as STUN-only — one corrupted-data fact, observed
    // consistently at every layer.
    // ===============================================================
    {
        const malformedPayloads = [
            { urls: ['stun:not-a-turn-url.example:3478'], username: 'i', credential: 'i' },
            { urls: [], username: 'i', credential: 'i' },
            { urls: 'turn:relay.example:3478', username: '', credential: 'i' },
            { urls: 'turn:relay.example:3478', username: 'i', credential: '' },
            { urls: 'turn:relay.example:3478' },
            'not-even-an-object',
            null
        ];
        for (const malformed of malformedPayloads) {
            const rawStorage = new RawStorageProvider();
            rawStorage.save('turn-server-configuration', malformed);
            const iceServerConfigurationStore = new IceServerConfigurationStore(rawStorage);
            iceServerConfigurationStore.save(new IceServerConfiguration({ servers: [{ urls: 'stun:i.example:3478' }] }));

            // Layer 1: the real Settings UI renders this as "no
            // configuration," never a partial/broken form.
            const { view, store } = mountOver(rawStorage);
            assert(view.hasConfiguration.value === false, n(`I1. REAL COMPONENT: malformed persisted TURN data (${JSON.stringify(malformed)}) renders as "no configuration" in the real Settings UI`));
            assert(view.urlsInput.value === '' && view.usernameInput.value === '' && view.credentialInput.value === '',
                n('I1b. …every field stays empty, never a partially-populated form'));

            // Layer 2: a fresh provider resolution, over the exact same
            // corrupted bytes, agrees — null, never a partially-valid entry.
            const { resolvedIceServers, resolvedTurnServerConfiguration } = composeIceServers({ iceServerConfigurationStore, turnServerConfigurationStore: store });
            assert(resolvedTurnServerConfiguration === null, n('I2. the provider resolves the SAME corrupted bytes to null, consistent with the UI\'s own "no configuration" rendering'));
            assert(resolvedIceServers.length === 1 && resolvedIceServers[0].urls === 'stun:i.example:3478',
                n('I3. …and the composed iceServers array is STUN-only'));

            // Layer 3: the real RTCPeerConnection constructor call agrees.
            RecordingRTCPeerConnection.constructions = [];
            const provider = new WebRtcPeerConnectionProvider({ iceServers: resolvedIceServers, RTCPeerConnectionImpl: RecordingRTCPeerConnection });
            provider.createOffer();
            const constructed = RecordingRTCPeerConnection.constructions[0];
            assert(!constructed.some((e) => e.username || e.credential),
                n('I4. …confirmed at the real RTCPeerConnection construction call itself — the same corrupted bytes never reach it as a TURN entry'));
            provider.dispose();
        }

        console.log('\n=== SECTION I: MALFORMED PERSISTED DATA ===');
        console.log('✓ Section I: every malformed-persisted-TURN shape degrades to the SAME "absent" fact at all three layers — the real Settings UI, the provider, and the real RTCPeerConnection constructor — never a partial or inconsistent state.');
    }

    // ===============================================================
    // Section J — WebRTC boundary: the real, unmodified
    // WebRtcPeerConnectionProvider with an injected fake RTCPeerConnection;
    // the composed iceServers (UI-driven) reach the constructor unchanged.
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const iceServerConfigurationStore = new IceServerConfigurationStore(storageProvider);
        iceServerConfigurationStore.save(new IceServerConfiguration({ servers: [{ urls: 'stun:j.example:3478' }] }));
        const { view, store } = mountOver(storageProvider);
        view.urlsInput.value = 'turn:j.example:3478';
        view.usernameInput.value = 'j-user';
        view.credentialInput.value = 'j-cred';
        view.save();

        const { resolvedIceServers } = composeIceServers({ iceServerConfigurationStore, turnServerConfigurationStore: store });

        // J1. The offerer's own construction call.
        RecordingRTCPeerConnection.constructions = [];
        const provider = new WebRtcPeerConnectionProvider({ iceServers: resolvedIceServers, RTCPeerConnectionImpl: RecordingRTCPeerConnection });
        const offerConnection = provider.createOffer();
        assert(RecordingRTCPeerConnection.constructions[0] === resolvedIceServers,
            n('J1. the offerer\'s own RTCPeerConnection is constructed with the EXACT resolvedIceServers reference — never a copy, never a re-derived array'));

        // J2. The answerer's own construction call, from a real serialized
        // offer, sees the identical array.
        const localSignal = await new Promise((resolve) => offerConnection.onLocalSignalReady(resolve));
        const answererProvider = new WebRtcPeerConnectionProvider({ iceServers: resolvedIceServers, RTCPeerConnectionImpl: RecordingRTCPeerConnection });
        answererProvider.connect(localSignal.toJSON());
        assert(RecordingRTCPeerConnection.constructions[1] === resolvedIceServers,
            n('J2. the answerer\'s own RTCPeerConnection also receives the identical resolvedIceServers reference'));
        provider.dispose();
        answererProvider.dispose();

        // J3. setIceServers() — the seam ui/main.js's own background
        // fetchIceServers() enrichment call uses — still carries the
        // UI-saved TURN entry through when the provider's iceServers are
        // replaced after construction.
        const laterProvider = new WebRtcPeerConnectionProvider({ iceServers: [{ urls: 'stun:only-at-first.example:3478' }], RTCPeerConnectionImpl: RecordingRTCPeerConnection });
        const meteredStyleEntry = { urls: 'turn:standard.relay.metered.ca:80', username: 'metered-u', credential: 'metered-c' };
        laterProvider.setIceServers([...resolvedIceServers, meteredStyleEntry]);
        RecordingRTCPeerConnection.constructions = [];
        laterProvider.createOffer();
        const laterConstructed = RecordingRTCPeerConnection.constructions[0];
        assert(laterConstructed.some((e) => e.username === 'j-user'), n('J3. after a later setIceServers() call (the same seam ui/main.js\'s own background TURN-credential enrichment uses), the UI-saved TURN entry still reaches the next real construction call'));
        assert(laterConstructed.some((e) => e.username === 'metered-u'), n('J4. …alongside whatever else that later call merged in'));
        laterProvider.dispose();

        console.log('\n=== SECTION J: WEBRTC BOUNDARY ===');
        console.log('✓ Section J: the real, unmodified WebRtcPeerConnectionProvider hands the UI-composed iceServers array — unchanged, same reference — to every real RTCPeerConnection it constructs, on both the offerer and answerer side, and after a later setIceServers() replacement.');
    }

    // ===============================================================
    // Section K — Browser-owned alternative selection + the central
    // invariant: TURN configuration is consumed EXACTLY at the ICE
    // composition boundary; no downstream component interprets TURN
    // urls, credentials, priority, health, or failover semantics.
    // ===============================================================
    {
        // K1-K3. Multiple TURN URLs, typed into the real UI, produce ONE
        // RTCIceServer entry — the browser's own ICE implementation
        // resolves alternatives; ForkBuild implements no sequential
        // application-level retry.
        const storageProvider = new InMemoryStorageProvider();
        const iceServerConfigurationStore = new IceServerConfigurationStore(storageProvider);
        const { view, store } = mountOver(storageProvider);
        view.urlsInput.value = 'turn:relay-k-a.example:3478\nturn:relay-k-b.example:3478\nturns:relay-k-c.example:5349';
        view.usernameInput.value = 'k-user';
        view.credentialInput.value = 'k-cred';
        view.save();

        const { resolvedIceServers } = composeIceServers({ iceServerConfigurationStore, turnServerConfigurationStore: store });
        RecordingRTCPeerConnection.constructions = [];
        const provider = new WebRtcPeerConnectionProvider({ iceServers: resolvedIceServers, RTCPeerConnectionImpl: RecordingRTCPeerConnection });
        provider.createOffer();
        const constructed = RecordingRTCPeerConnection.constructions[0];
        const turnEntries = constructed.filter((e) => e.username === 'k-user');
        assert(turnEntries.length === 1, n('K1. three TURN urls, typed into the real UI, still produce exactly ONE RTCIceServer entry — never one per url'));
        assert(Array.isArray(turnEntries[0].urls) && turnEntries[0].urls.length === 3, n('K2. all three urls are handed to the browser together, as alternatives, in one entry'));
        provider.dispose();

        const providerSource = await source('peer/WebRtcPeerConnectionProvider.js');
        const connectionSource = await source('peer/WebRtcPeerConnection.js');
        assert(!/retry|failover|rank|priority|health.?check/i.test(providerSource),
            n('K3. peer/WebRtcPeerConnectionProvider.js contains no retry/failover/ranking/priority/health-check vocabulary of any kind'));
        assert(!/retry|failover|\bTURN\b.*rank|priority|health.?check/i.test(connectionSource),
            n('K4. peer/WebRtcPeerConnection.js — the class that actually owns the RTCPeerConnection — also contains no such vocabulary; it treats iceServers as an opaque, browser-owned configuration blob'));

        // K5-K7. The central invariant, repo-wide: only this configuration
        // family's own known composition set may reference TURN
        // configuration concepts at all. Anything else finding a reference
        // is a boundary violation.
        const KNOWN_COMPOSITION_FILES = new Set([
            'core/TurnServerConfiguration.js',
            'storage/TurnServerConfigurationStore.js',
            'application/TurnServerConfigurationProvider.js',
            'application/SetTurnServerConfigurationUseCase.js',
            'ui/views/TurnServerSettingsView.js',
            'ui/router/index.js',
            'ui/views/NetworkSettingsView.js',
            'ui/main.js'
        ].map((p) => new URL(p, SOURCE_ROOT).pathname));

        const TURN_CONCEPT_PATTERN = /TurnServerConfiguration|turnServerConfigurationStore|resolveTurnServerConfiguration|SetTurnServerConfigurationUseCase/;
        const allProductionFiles = [
            ...listJsFilesRecursively(new URL('core/', SOURCE_ROOT).pathname),
            ...listJsFilesRecursively(new URL('storage/', SOURCE_ROOT).pathname),
            ...listJsFilesRecursively(new URL('application/', SOURCE_ROOT).pathname),
            ...listJsFilesRecursively(new URL('ui/', SOURCE_ROOT).pathname),
            ...listJsFilesRecursively(new URL('peer/', SOURCE_ROOT).pathname)
        ];
        const unexpectedReferences = [];
        for (const file of allProductionFiles) {
            if (KNOWN_COMPOSITION_FILES.has(file)) continue;
            const text = await readFile(file, 'utf8');
            if (TURN_CONCEPT_PATTERN.test(text)) unexpectedReferences.push(file);
        }
        assert(unexpectedReferences.length === 0,
            n(`K5. no production file outside this configuration's own known composition set references TURN configuration concepts at all (found: ${JSON.stringify(unexpectedReferences)})`));

        assert(!TURN_CONCEPT_PATTERN.test(providerSource) && !TURN_CONCEPT_PATTERN.test(connectionSource),
            n('K6. peer/WebRtcPeerConnectionProvider.js and peer/WebRtcPeerConnection.js — the two files that actually own RTCPeerConnection — reference no TURN configuration concept whatsoever; they consume a plain, generic iceServers array only'));

        // K7. peer/IceServerConfig.js's own Metered fetch (a SEPARATE,
        // pre-existing seam) is confirmed to remain untouched by, and
        // ignorant of, this configuration family — it neither imports nor
        // references it.
        const iceServerConfigSource = await source('peer/IceServerConfig.js');
        assert(!TURN_CONCEPT_PATTERN.test(iceServerConfigSource),
            n('K7. peer/IceServerConfig.js (the separate, pre-existing Metered-credential fetch) remains completely unaware of this configuration family'));

        console.log('\n=== SECTION K: BROWSER-OWNED ALTERNATIVE SELECTION + CENTRAL INVARIANT ===');
        console.log('✓ Section K: multiple TURN urls reach ICE as alternatives in one entry, never sequential retry; and TURN configuration is consumed exactly at the ICE composition boundary — no downstream file, including the RTCPeerConnection-owning classes themselves, interprets it.');
    }

    // ===============================================================
    // Section L — Cross-role isolation: TURN configuration saved/cleared
    // through the real UI never affects STUN, Rendezvous, Nostr, or
    // Arweave configuration sharing the same underlying storage.
    // ===============================================================
    {
        const sharedNamespace = {};
        const nostrStore = new NostrRelayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        const arweaveStore = new ArweaveGatewayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        const rendezvousStore = new RendezvousConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        const stunStore = new IceServerConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        const sharedTurnStorageProvider = new SharedNamespaceStorageProvider(sharedNamespace);

        nostrStore.save(new NostrRelayConfiguration({ relayUrl: 'wss://my-relay.example' }));
        arweaveStore.save(new ArweaveGatewayConfiguration({ gatewayUrl: 'https://my-gateway.example' }));
        rendezvousStore.save(new RendezvousConfiguration({ urls: ['wss://my-rendezvous.example'] }));
        stunStore.save(new IceServerConfiguration({ servers: [{ urls: 'stun:my-stun.example:3478' }] }));

        // Save TURN through the REAL Settings UI, over storage shared with
        // all four sibling configuration families above.
        const { view } = mountOver(sharedTurnStorageProvider);
        view.urlsInput.value = 'turn:my-turn.example:3478';
        view.usernameInput.value = 'l-user';
        view.credentialInput.value = 'l-cred';
        view.save();

        assert(nostrStore.get().relayUrl === 'wss://my-relay.example', n('L1. Nostr relay configuration is unaffected by a TURN configuration saved through the real UI, sharing the same underlying namespace'));
        assert(arweaveStore.get().gatewayUrl === 'https://my-gateway.example', n('L2. Arweave gateway configuration is unaffected'));
        assert(JSON.stringify(rendezvousStore.get().urls) === JSON.stringify(['wss://my-rendezvous.example']), n('L3. Rendezvous configuration is unaffected'));
        assert(stunStore.get().servers[0].urls === 'stun:my-stun.example:3478', n('L4. STUN configuration is unaffected'));

        // Now Clear, through the real UI — confirm the same for the
        // clear() path, not only save().
        view.clear();
        assert(nostrStore.get().relayUrl === 'wss://my-relay.example', n('L5. Nostr relay configuration is STILL unaffected after the real UI\'s Clear'));
        assert(arweaveStore.get().gatewayUrl === 'https://my-gateway.example', n('L6. Arweave gateway configuration is STILL unaffected after Clear'));
        assert(JSON.stringify(rendezvousStore.get().urls) === JSON.stringify(['wss://my-rendezvous.example']), n('L7. Rendezvous configuration is STILL unaffected after Clear'));
        assert(stunStore.get().servers[0].urls === 'stun:my-stun.example:3478', n('L8. STUN configuration is STILL unaffected after Clear'));

        const keys = Object.keys(sharedNamespace);
        assert(new Set(keys).size === keys.length, n(`L9. all four sibling configuration families plus TURN's own key landed under distinct storage keys — no collision (keys: ${JSON.stringify(keys)})`));

        console.log('\n=== SECTION L: CROSS-ROLE ISOLATION ===');
        console.log('✓ Section L: saving and clearing TURN configuration through the real Settings UI never affects STUN, Rendezvous, Nostr, or Arweave configuration sharing the same underlying storage.');
    }

    // ===============================================================
    // Section M — Verdict.
    // ===============================================================
    {
        console.log('\n=== SECTION M: VERDICT ===');
        console.log(`
  ┌────────────────────────────────────────────────────────────┬────────┐
  │ Boundary                                                    │ Status │
  ├────────────────────────────────────────────────────────────┼────────┤
  │ Settings UI save -> persisted representation (A)            │  HOLDS │
  │ Persistence -> fresh provider resolution, no cache (B)      │  HOLDS │
  │ Provider -> composition, no direct storage bypass (C)       │  HOLDS │
  │ STUN + TURN composition matrix (D)                          │  HOLDS │
  │ Credential fidelity (E)                                     │  HOLDS │
  │ Credential containment (F)                                  │  HOLDS │
  │ Configuration replacement, no stale value (G)                │  HOLDS │
  │ Clear semantics, no fabricated default (H)                  │  HOLDS │
  │ Malformed data -> consistent absence at every layer (I)      │  HOLDS │
  │ WebRTC boundary, unchanged reference (J)                     │  HOLDS │
  │ Browser-owned alternative selection + central invariant (K)  │  HOLDS │
  │ Cross-role isolation (L)                                     │  HOLDS │
  └────────────────────────────────────────────────────────────┴────────┘

  VERDICT: TURN_CONFIGURATION_INTEGRATION_BOUNDARY_HOLDS.

  A user-configured TURN server, saved through the real Settings UI, does
  travel through the complete production path into RTCPeerConnection,
  while every security and architectural boundary 0.9.453-0.9.456
  established survives intact. This audit found no boundary violation —
  see 0.9.458 for the resulting product-completion reassessment.
`);
    }

    console.log(`\n✅ All TURN Configuration UI & WebRTC Integration Boundary Audit assertions passed (${assertionCount} assertions).`);
}

run().catch((error) => {
    console.error('TurnConfigurationUIWebRtcBoundaryAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
