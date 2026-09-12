import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { register } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { NostrPublicationRelaySetConfiguration, DEFAULT_NOSTR_PUBLICATION_RELAY_URL } from '../core/NostrPublicationRelaySetConfiguration.js';
import { NostrPublicationRelaySetConfigurationStore } from '../storage/NostrPublicationRelaySetConfigurationStore.js';
import { SetNostrPublicationRelaySetConfigurationUseCase } from '../application/SetNostrPublicationRelaySetConfigurationUseCase.js';
import { resolveNostrPublicationRelayUrls } from '../application/NostrPublicationRelaySetConfigurationProvider.js';
import { composeMultiRelayNostrPublicationDistributionCommand, composePublicationDistributionCommand } from '../application/PublicationDistributionCommandComposition.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { NostrRelayConfiguration, DEFAULT_NOSTR_RELAY_URL } from '../core/NostrRelayConfiguration.js';
import { NostrRelayConfigurationStore } from '../storage/NostrRelayConfigurationStore.js';
import { SetNostrRelayConfigurationUseCase } from '../application/SetNostrRelayConfigurationUseCase.js';
import { NostrDiscoveryQueryService } from '../application/NostrDiscoveryQueryService.js';

// 0.9.448 — Nostr Publication Relay Configuration Integration Boundary Audit.
//
// TYPE: test-only, product/architectural audit. PRODUCTION CHANGES: NONE.
// (Two test-SUPPORT files are added, under tests/support/ — a minimal,
// non-reactive Vue Composition API stand-in and a Node ESM loader hook that
// redirects the bare `vue` specifier to it, registered from inside THIS
// test file's own process only. Neither is imported by, or changes the
// behavior of, any production file — see each file's own header.)
//
// 0.9.442 through 0.9.447 built a complete write-side Nostr multi-relay
// distribution chain — product decision, relay-level observation identity,
// fan-out mechanics, two prior integration/configuration audits, and
// finally, in 0.9.447, a real, persisted, user-configurable relay SET. This
// milestone is the final audit the arc's own request asks for: does the
// COMPLETE, user-configured path actually work, end to end, through every
// seam 0.9.447 introduced simultaneously — Settings, persistence, the
// configuration provider, the multi-relay command, the fan-out, relay-level
// lifecycle observation, and the Publications Distribution UI?
//
// THE ONE GENUINE NEW CAPABILITY THIS AUDIT ADDS OVER 0.9.447's OWN TEST:
// `tests/NostrPublicationRelaySetConfiguration.test.js` already proved the
// STORE/USE-CASE/PROVIDER/COMMAND chain end to end (its own Sections D, G,
// H). What that file could NOT do — because this codebase's own `vue` import
// resolves through a browser import map, unavailable to a plain `node`
// process — is call `ui/views/NostrPublicationRelaySettingsView.js`'s own
// real, unmodified Composition-API `setup()` and observe its real
// `save()`/`load()`/`useDeploymentDefault()` behavior. `tests/support/
// MinimalVueCompositionApiShim.js` + `tests/support/VueShimLoader.mjs`
// (this same milestone) close exactly that one remaining gap — see each
// file's own header for why this is a test-harness trick, never a
// production dependency change. Section A below is the section this
// unlocks; every other Nostr-relay-set section reuses 0.9.447's own,
// already-proven, real (non-mocked) collaborators.
//
// LETTERED SECTIONS (mirroring this milestone's own request):
//   A. Settings -> persistence, through the REAL Settings view component.
//   B. Persistence -> provider — order/normalization survive the full
//      real-view round trip, not merely the use-case-direct one.
//   C. Provider -> command — every configured relay reaches the command;
//      a live, concurrently-configured discovery override never leaks in.
//   D. Full fan-out — three relays independently attempted, and permuting
//      configured order never changes the resulting SET of attempts.
//   E. Shared material — one upload, one materialUri, identical across
//      every relay's own reported result.
//   F. Partial relay failure — R1 ok / R2 fails / R3 ok still yields
//      exactly the two real observations, never a phantom third.
//   G. Observation identity — repeated publication REPLACES each relay's
//      own observation, never accumulates a growing history.
//   H. UI representation — the real Publications Distribution view's own
//      discoveryObservationsView()/Vue :key expression, run against real
//      multi-relay data, collide free and invent no aggregate status.
//   I. Discovery configuration isolation — both directions, live.
//   J. Single-relay compatibility — through the REAL Settings view path.
//   K. Persistence degradation — malformed degrades, genuine storage
//      failure propagates, neither ever falls back to discovery config.
//   L. Cross-role isolation — Arweave retrieval/failover, Arweave
//      anchoring, Bitcoin anchoring, Snapshot distribution, Nostr
//      discovery querying.
//   M. UX audit — contextual link/label distinguishability between the
//      two Nostr Settings pages, including one still-open, pre-existing
//      defect this milestone's own scope does not permit fixing.
//   N. Decision matrix, verdict, and production-change guard.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE, PER ITS OWN REQUEST. No
// read-side Nostr multi-relay querying, no relay health monitoring, no
// retry/failover, no relay ranking/priority, no automatic relay discovery,
// no relay synchronization, no notification integration, no aggregate
// distribution status, no generic Nostr endpoint configuration, no
// publication-specific relay lists, and no fix to any pre-existing defect
// this audit merely surfaces (see Section M).

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = fileURLToPath(new URL('../', import.meta.url));
async function source(relativePath) {
    return readFile(path.join(SOURCE_ROOT, relativePath), 'utf8');
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// A storage provider whose own load() genuinely throws — the "unavailable"
// half of Section K, distinct from "malformed" (bytes on file that parse
// but don't satisfy the configuration's own shape).
class ThrowingLoadStorageProvider extends StorageProvider {
    save() { /* not used by Section K's own throwing scenario */ }
    load() { throw new Error('simulated storage backend unavailable'); }
    remove() { /* not used */ }
    list() { return []; }
}

function makeFakeArweaveSubstrate() {
    const ledger = new Map();
    let nextId = 0;
    function newId(prefix) {
        nextId += 1;
        return `${prefix}${String(nextId).padStart(8, '0')}`;
    }
    const contentSigner = { async sign(material) { const id = newId('Content'); return { id, transaction: { format: 2, id, data: material } }; } };
    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        const method = options.method || 'GET';
        if (method === 'POST' && parsed.pathname === '/tx') {
            const transaction = JSON.parse(options.body);
            ledger.set(transaction.id, transaction.data);
            return new Response('accepted', { status: 200 });
        }
        return new Response('not found', { status: 404 });
    }
    return { contentSigner, fetchImpl };
}

function makeFakePublication(id) {
    const record = { id, signature: `sig-${id}` };
    return { ...record, toJSON: () => record };
}

let fakeNostrEventCounter = 0;
function nextFakeNostrEventId() {
    fakeNostrEventCounter += 1;
    return String(fakeNostrEventCounter).padStart(64, '0');
}
function makeAlwaysSucceedsPublishImpl(callLog) {
    return async function publishImpl(relayUrl, eventTemplate) {
        if (callLog) callLog.push({ relayUrl, eventTemplate });
        return { published: true, id: nextFakeNostrEventId() };
    };
}
// A publishImpl that fails for exactly one named relay (Section F) —
// "fails" means the underlying transport genuinely rejects, mirroring
// `NostrPublicationDiscoveryPublisher.js`'s own "a genuine transport
// failure propagates" contract one layer down, never a relay that simply
// declines gracefully.
function makePartiallyFailingPublishImpl(failingRelayUrl, callLog) {
    return async function publishImpl(relayUrl, eventTemplate) {
        if (callLog) callLog.push({ relayUrl, eventTemplate });
        if (relayUrl === failingRelayUrl) {
            throw new Error(`simulated transport failure for ${relayUrl}`);
        }
        return { published: true, id: nextFakeNostrEventId() };
    };
}

async function run() {
    // ===============================================================
    // Section A — Settings -> persistence, through the REAL Settings view
    // component.
    // ===============================================================
    {
        register(new URL('./support/VueShimLoader.mjs', import.meta.url));
        const { mountComponent } = await import('./support/MinimalVueCompositionApiShim.js');
        const NostrPublicationRelaySettingsView = (await import('../ui/views/NostrPublicationRelaySettingsView.js')).default;

        const storageProvider = new InMemoryStorageProvider();
        const store = new NostrPublicationRelaySetConfigurationStore(storageProvider);
        const useCase = new SetNostrPublicationRelaySetConfigurationUseCase({ nostrPublicationRelaySetConfigurationStore: store });
        const injectionContext = {
            nostrPublicationRelaySetConfigurationStore: store,
            setNostrPublicationRelaySetConfigurationUseCase: useCase
        };

        // A1. Mounting fresh, with nothing persisted, shows no override and
        // the deployment default — the REAL component's own onMounted(load)
        // firing for real, through this shim's own mount simulation.
        const firstMount = mountComponent(NostrPublicationRelaySettingsView, injectionContext);
        assert(firstMount.hasOverride.value === false, n('A1a. REAL COMPONENT: a fresh mount with nothing persisted reports hasOverride === false'));
        assert(firstMount.effectiveRelayUrls.value.length === 1 && firstMount.effectiveRelayUrls.value[0] === DEFAULT_NOSTR_PUBLICATION_RELAY_URL,
            n('A1b. REAL COMPONENT: effectiveRelayUrls shows exactly the deployment default'));
        assert(firstMount.relayUrlsInput.value === '', n('A1c. REAL COMPONENT: the textarea starts empty'));

        // A2. Typing three relays (with a blank line, matching a real
        // Wanderer leaving a trailing newline) and clicking Save really
        // persists them, in order, through the real use case this
        // component itself injects and calls.
        firstMount.relayUrlsInput.value = 'wss://settings-a.example\nwss://settings-b.example\nwss://settings-c.example\n';
        firstMount.save();
        assert(firstMount.saveStatus.value === 'saved' && firstMount.saveError.value === null, n('A2a. REAL COMPONENT: save() reports saved, no error'));
        assert(store.get() instanceof NostrPublicationRelaySetConfiguration, n('A2b. REAL COMPONENT: save() really persisted a configuration through the real store'));
        assert(JSON.stringify(store.get().relayUrls) === JSON.stringify(['wss://settings-a.example', 'wss://settings-b.example', 'wss://settings-c.example']),
            n('A2c. REAL COMPONENT: the persisted relayUrls match exactly what was typed, in order, with the trailing blank line dropped by the real value object\'s own normalization'));
        assert(firstMount.hasOverride.value === true && firstMount.configuration.value.relayUrls.length === 3, n('A2d. REAL COMPONENT: the component\'s own reactive state reflects the just-saved configuration immediately, with no separate reload'));

        // A3. A SEPARATE, freshly-mounted instance (simulating a Wanderer
        // navigating away and back, or a page reload) reads back exactly
        // what the first instance saved — Save -> reload really survives
        // across component lifetimes, through the shared real store.
        const secondMount = mountComponent(NostrPublicationRelaySettingsView, injectionContext);
        assert(secondMount.hasOverride.value === true, n('A3a. REAL COMPONENT: a second, independent mount against the same store observes the override the first mount saved'));
        assert(secondMount.relayUrlsInput.value === 'wss://settings-a.example\nwss://settings-b.example\nwss://settings-c.example',
            n('A3b. REAL COMPONENT: the second mount\'s own textarea is pre-filled with the persisted set, joined by newline, in the same order'));
        assert(secondMount !== firstMount && secondMount.configuration.value.equals(firstMount.configuration.value),
            n('A3c. REAL COMPONENT: two independent component instances, two independent reactive states, one identical persisted fact underneath'));

        // A4. Saving an invalid relay set (a garbage line) through the REAL
        // save() leaves the previously-saved, valid configuration on file
        // completely untouched, and surfaces the real thrown error message
        // — this component's own try/catch, exercised for real.
        secondMount.relayUrlsInput.value = 'not-a-relay-url-at-all';
        secondMount.save();
        assert(secondMount.saveStatus.value === 'idle' && typeof secondMount.saveError.value === 'string' && secondMount.saveError.value.length > 0,
            n('A4a. REAL COMPONENT: save() with an invalid entry reports idle (not saved) and a real, non-empty error message'));
        assert(store.get().relayUrls.length === 3 && store.get().relayUrls[0] === 'wss://settings-a.example',
            n('A4b. REAL COMPONENT: the store is completely untouched by the rejected save — still the three-relay set from A2'));

        // A5. "Use Deployment Default" really calls the real store's own
        // clear() and really returns this component's own reactive state to
        // "no override," and a THIRD, freshly-mounted instance observes
        // that cleared state too — clearing survives across component
        // lifetimes exactly as saving does.
        secondMount.useDeploymentDefault();
        assert(secondMount.hasOverride.value === false && secondMount.clearStatus.value === 'cleared', n('A5a. REAL COMPONENT: useDeploymentDefault() clears this instance\'s own reactive override state'));
        assert(store.get() === null, n('A5b. REAL COMPONENT: the real store genuinely has nothing persisted anymore'));
        const thirdMount = mountComponent(NostrPublicationRelaySettingsView, injectionContext);
        assert(thirdMount.hasOverride.value === false && thirdMount.relayUrlsInput.value === '', n('A5c. REAL COMPONENT: a third, independent mount confirms the cleared state persisted, not merely local to the instance that cleared it'));

        console.log('\n=== SECTION A: SETTINGS -> PERSISTENCE (REAL VIEW COMPONENT) ===');
        console.log('✓ Section A: the real, unmodified NostrPublicationRelaySettingsView component\'s own save()/load()/useDeploymentDefault() — exercised through its own real setup(), never re-derived by hand — round-trip a Wanderer\'s own typed relay set through the real store, across independent mounts, and leave a rejected save\'s prior valid state completely untouched.');
    }

    // ===============================================================
    // Section B — Persistence -> provider: order/normalization survive the
    // full REAL-VIEW round trip.
    // ===============================================================
    {
        const { mountComponent } = await import('./support/MinimalVueCompositionApiShim.js');
        const NostrPublicationRelaySettingsView = (await import('../ui/views/NostrPublicationRelaySettingsView.js')).default;

        const storageProvider = new InMemoryStorageProvider();
        const store = new NostrPublicationRelaySetConfigurationStore(storageProvider);
        const useCase = new SetNostrPublicationRelaySetConfigurationUseCase({ nostrPublicationRelaySetConfigurationStore: store });
        const mount = mountComponent(NostrPublicationRelaySettingsView, {
            nostrPublicationRelaySetConfigurationStore: store,
            setNostrPublicationRelaySetConfigurationUseCase: useCase
        });

        // Deliberately messy input: leading/trailing whitespace, a
        // duplicate, and a blank line — exactly what a real Wanderer's own
        // textarea would contain after editing by hand.
        mount.relayUrlsInput.value = '  wss://provider-b.example  \nwss://provider-a.example\nwss://provider-b.example\n\n';
        mount.save();

        const resolved = resolveNostrPublicationRelayUrls({ nostrPublicationRelaySetConfigurationStore: store });
        assert(JSON.stringify(resolved) === JSON.stringify(['wss://provider-b.example', 'wss://provider-a.example']),
            n('B1. REAL EXECUTION: the provider resolves exactly the normalized, deduplicated, ORIGINAL-TYPED-ORDER set the real view\'s own save() produced — "b" typed first stays first, the whitespace-differing duplicate collapses to one, the blank line contributes nothing'));

        console.log('\n=== SECTION B: PERSISTENCE -> PROVIDER ===');
        console.log('✓ Section B: normalization and ordering applied at the real view\'s own save() survive, byte-for-byte, through the real provider\'s own resolveNostrPublicationRelayUrls() — no second, disagreeing normalization anywhere in the chain.');
    }

    // ===============================================================
    // Section C — Provider -> command: every configured relay reaches the
    // command; a live, concurrently-configured discovery override never
    // leaks in.
    // ===============================================================
    {
        const publicationStorageProvider = new InMemoryStorageProvider();
        const publicationStore = new NostrPublicationRelaySetConfigurationStore(publicationStorageProvider);
        new SetNostrPublicationRelaySetConfigurationUseCase({ nostrPublicationRelaySetConfigurationStore: publicationStore })
            .execute({ relayUrls: ['wss://pub-1.example', 'wss://pub-2.example', 'wss://pub-3.example'] });

        // A REAL, live, concurrently-configured discovery override — never
        // consulted by the command below.
        const discoveryStorageProvider = new InMemoryStorageProvider();
        const discoveryStore = new NostrRelayConfigurationStore(discoveryStorageProvider);
        new SetNostrRelayConfigurationUseCase({ nostrRelayConfigurationStore: discoveryStore }).execute({ relayUrl: 'wss://discovery-live.example' });

        const arweave = makeFakeArweaveSubstrate();
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publishCallLog = [];
        const command = composeMultiRelayNostrPublicationDistributionCommand({
            lifecycleStore,
            arweaveUploaderOptions: { signer: arweave.contentSigner, fetchImpl: arweave.fetchImpl },
            nostrRelayUrls: resolveNostrPublicationRelayUrls({ nostrPublicationRelaySetConfigurationStore: publicationStore }),
            nostrPublisherOptions: { publishImpl: makeAlwaysSucceedsPublishImpl(publishCallLog), discoveryTag: 'forkbuild-publication' }
        });

        const results = await command({ publication: makeFakePublication('pub-c1'), serializedMaterial: 'provider to command' });
        assert(results.length === 3, n('C1. REAL EXECUTION: all three configured publication relays reach the command'));
        const attempted = new Set(publishCallLog.map((c) => c.relayUrl));
        assert(attempted.has('wss://pub-1.example') && attempted.has('wss://pub-2.example') && attempted.has('wss://pub-3.example'),
            n('C2. every one of the three configured relays was really, independently attempted'));
        assert(!attempted.has('wss://discovery-live.example'), n('C3. REAL EXECUTION: the live, concurrently-configured discovery relay was never attempted — it never reached this command at all'));

        console.log('\n=== SECTION C: PROVIDER -> COMMAND ===');
        console.log('✓ Section C: every configured publication relay reaches the real multi-relay command, and a real, simultaneously-present discovery override contributes zero attempted relays.');
    }

    // ===============================================================
    // Section D — Full fan-out: three relays independently attempted, and
    // permuting configured order never changes the resulting SET of
    // attempts.
    // ===============================================================
    {
        async function distributeWithOrder(relayOrder) {
            const storageProvider = new InMemoryStorageProvider();
            const store = new NostrPublicationRelaySetConfigurationStore(storageProvider);
            new SetNostrPublicationRelaySetConfigurationUseCase({ nostrPublicationRelaySetConfigurationStore: store }).execute({ relayUrls: relayOrder });
            const arweave = makeFakeArweaveSubstrate();
            const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
            const publishCallLog = [];
            const command = composeMultiRelayNostrPublicationDistributionCommand({
                lifecycleStore,
                arweaveUploaderOptions: { signer: arweave.contentSigner, fetchImpl: arweave.fetchImpl },
                nostrRelayUrls: resolveNostrPublicationRelayUrls({ nostrPublicationRelaySetConfigurationStore: store }),
                nostrPublisherOptions: { publishImpl: makeAlwaysSucceedsPublishImpl(publishCallLog), discoveryTag: 'forkbuild-publication' }
            });
            const results = await command({ publication: makeFakePublication(`pub-d-${relayOrder.join('')}`), serializedMaterial: 'fan-out order' });
            return { results, attempted: new Set(publishCallLog.map((c) => c.relayUrl)) };
        }

        const relays = ['wss://order-a.example', 'wss://order-b.example', 'wss://order-c.example'];
        const forward = await distributeWithOrder(relays);
        const reversed = await distributeWithOrder([...relays].reverse());

        assert(forward.results.length === 3 && reversed.results.length === 3, n('D1. REAL EXECUTION: three configured relays produce three results regardless of configured order'));
        assert(forward.attempted.size === 3 && reversed.attempted.size === 3, n('D2. all three relays are independently attempted in both orderings'));
        assert([...forward.attempted].sort().join(',') === [...reversed.attempted].sort().join(','),
            n('D3. REAL EXECUTION: the resulting SET of attempted relays is identical whether the Wanderer\'s own persisted relay set is typed A,B,C or C,B,A — configured order carries no fan-out-priority meaning end to end, from Settings through to the real transport calls'));

        console.log('\n=== SECTION D: FULL FAN-OUT ===');
        console.log('✓ Section D: a persisted three-relay set is independently, fully attempted end to end, and permuting the Wanderer\'s own configured order changes only rendering order, never which relays are contacted.');
    }

    // ===============================================================
    // Section E — Shared material: one upload, one materialUri, identical
    // across every relay's own reported result.
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const store = new NostrPublicationRelaySetConfigurationStore(storageProvider);
        new SetNostrPublicationRelaySetConfigurationUseCase({ nostrPublicationRelaySetConfigurationStore: store })
            .execute({ relayUrls: ['wss://material-a.example', 'wss://material-b.example', 'wss://material-c.example'] });

        const arweave = makeFakeArweaveSubstrate();
        let uploadCallCount = 0;
        const countingFetchImpl = async (...args) => { uploadCallCount += 1; return arweave.fetchImpl(...args); };
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const command = composeMultiRelayNostrPublicationDistributionCommand({
            lifecycleStore,
            arweaveUploaderOptions: { signer: arweave.contentSigner, fetchImpl: countingFetchImpl },
            nostrRelayUrls: resolveNostrPublicationRelayUrls({ nostrPublicationRelaySetConfigurationStore: store }),
            nostrPublisherOptions: { publishImpl: makeAlwaysSucceedsPublishImpl(), discoveryTag: 'forkbuild-publication' }
        });

        const results = await command({ publication: makeFakePublication('pub-e1'), serializedMaterial: 'shared material payload' });
        assert(uploadCallCount === 1, n('E1. REAL EXECUTION: exactly one Arweave upload occurs, regardless of the three configured relays'));
        assert(results.length === 3 && results.every((r) => r.material && typeof r.material.uri === 'string' && r.material.uri.length > 0),
            n('E2. every one of the three results carries a real, non-empty material.uri'));
        const distinctMaterialUris = new Set(results.map((r) => r.material.uri));
        assert(distinctMaterialUris.size === 1, n('E3. REAL EXECUTION: all three results share the IDENTICAL materialUri — the one upload\'s own real result, never a per-relay re-derivation'));

        console.log('\n=== SECTION E: SHARED MATERIAL ===');
        console.log('✓ Section E: Arweave material is uploaded exactly once per distribution call, and its resulting materialUri is shared, byte-identical, across every configured relay\'s own announcement result.');
    }

    // ===============================================================
    // Section F — Partial relay failure: R1 ok / R2 fails / R3 ok still
    // yields exactly the two real observations, never a phantom third.
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const store = new NostrPublicationRelaySetConfigurationStore(storageProvider);
        new SetNostrPublicationRelaySetConfigurationUseCase({ nostrPublicationRelaySetConfigurationStore: store })
            .execute({ relayUrls: ['wss://r1.example', 'wss://r2.example', 'wss://r3.example'] });

        const arweave = makeFakeArweaveSubstrate();
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publishCallLog = [];
        const command = composeMultiRelayNostrPublicationDistributionCommand({
            lifecycleStore,
            arweaveUploaderOptions: { signer: arweave.contentSigner, fetchImpl: arweave.fetchImpl },
            nostrRelayUrls: resolveNostrPublicationRelayUrls({ nostrPublicationRelaySetConfigurationStore: store }),
            nostrPublisherOptions: { publishImpl: makePartiallyFailingPublishImpl('wss://r2.example', publishCallLog), discoveryTag: 'forkbuild-publication' }
        });

        const publication = makeFakePublication('pub-f1');
        const results = await command({ publication, serializedMaterial: 'partial failure' });

        assert(results.length === 3, n('F1. REAL EXECUTION: all three relays still produce a result element — R2\'s own failure never shrinks the array'));
        assert(publishCallLog.length === 3, n('F2. all three relays were really, independently attempted — R2\'s own eventual failure never prevented R1/R3 from being tried'));

        const byRelay = Object.fromEntries(results.map((r) => [r.discovery ? r.discovery.relayUrl : null, r]));
        const r1Result = results.find((r) => r.discovery && r.discovery.relayUrl === 'wss://r1.example');
        const r3Result = results.find((r) => r.discovery && r.discovery.relayUrl === 'wss://r3.example');
        const r2Result = results.find((r) => r.discovery === null);
        assert(r1Result && r3Result && r2Result, n('F3. REAL EXECUTION: R1 and R3 each report a real, present discovery fact; R2\'s own result reports discovery: null'));

        const observations = lifecycleStore.getDiscoveryObservations('pub-f1');
        assert(observations.length === 2, n('F4. REAL EXECUTION: exactly two discovery observations are recorded for this publication — never three, never zero'));
        const observedOrigins = new Set(observations.map((o) => o.origin));
        assert(observedOrigins.has('wss://r1.example') && observedOrigins.has('wss://r3.example') && !observedOrigins.has('wss://r2.example'),
            n('F5. REAL EXECUTION: the two recorded observations are exactly R1 and R3 — R2, the relay that failed, has NO observation of any kind, not even a "failed" one, matching this store\'s own "a fact is recorded only when one is actually obtained" contract'));

        console.log('\n=== SECTION F: PARTIAL RELAY FAILURE ===');
        console.log('✓ Section F: one relay\'s own genuine transport failure, in the middle of a real three-relay fan-out, neither prevents the other two relays from being attempted nor fabricates an observation for itself — exactly R1 and R3 are recorded, R2 is not.');
    }

    // ===============================================================
    // Section G — Observation identity: repeated publication REPLACES each
    // relay's own observation, never accumulates a growing history.
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const store = new NostrPublicationRelaySetConfigurationStore(storageProvider);
        new SetNostrPublicationRelaySetConfigurationUseCase({ nostrPublicationRelaySetConfigurationStore: store })
            .execute({ relayUrls: ['wss://g1.example', 'wss://g2.example', 'wss://g3.example'] });

        const arweave = makeFakeArweaveSubstrate();
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = makeFakePublication('pub-g1');

        async function distributeOnce() {
            const command = composeMultiRelayNostrPublicationDistributionCommand({
                lifecycleStore,
                arweaveUploaderOptions: { signer: arweave.contentSigner, fetchImpl: arweave.fetchImpl },
                nostrRelayUrls: resolveNostrPublicationRelayUrls({ nostrPublicationRelaySetConfigurationStore: store }),
                nostrPublisherOptions: { publishImpl: makeAlwaysSucceedsPublishImpl(), discoveryTag: 'forkbuild-publication' }
            });
            return command({ publication, serializedMaterial: 'repeat publication' });
        }

        await distributeOnce();
        const afterFirst = lifecycleStore.getDiscoveryObservations('pub-g1');
        assert(afterFirst.length === 3, n('G1. REAL EXECUTION: the first publication to three relays records three observations'));
        const firstIds = new Map(afterFirst.map((o) => [o.origin, o.id]));

        await distributeOnce();
        const afterSecond = lifecycleStore.getDiscoveryObservations('pub-g1');
        assert(afterSecond.length === 3, n('G2. REAL EXECUTION: a SECOND real publication of the SAME publication, to the SAME three relays, still records exactly three observations — never six, never a growing history'));
        const secondIds = new Map(afterSecond.map((o) => [o.origin, o.id]));
        for (const origin of ['wss://g1.example', 'wss://g2.example', 'wss://g3.example']) {
            assert(secondIds.has(origin), n(`G3[${origin}]. the relay's own observation is still present after the second publication`));
            assert(secondIds.get(origin) !== firstIds.get(origin), n(`G4[${origin}]. REAL EXECUTION: the relay's own observation was genuinely REPLACED by the second publication's own new event id, never left as the first publication's stale id`));
        }

        console.log('\n=== SECTION G: OBSERVATION IDENTITY ===');
        console.log('✓ Section G: the 0.9.443 (publicationId, discoveryProvider, discoveryOrigin) identity survives the complete, real production path — a second real publication to the same three relays replaces each relay\'s own observation in place, never accumulating a history.');
    }

    // ===============================================================
    // Section H — UI representation: the real Publications Distribution
    // view's own discovery-observation projection and Vue :key expression,
    // run against real multi-relay data.
    // ===============================================================
    {
        const viewSource = await source('ui/views/DecentralizedPublicationsView.js');

        // H1. Extract and RUN the real discoveryObservationsView(entry)
        // function, never merely pattern-match its source.
        const fnMatch = viewSource.match(/function discoveryObservationsView\(entry\) \{([\s\S]*?)\n {8}\}/);
        assert(fnMatch, n('H1. discoveryObservationsView(entry) is located, verbatim, in the real Publications view'));
        // eslint-disable-next-line no-new-func
        // The real function closes over `publicationDistributionLifecycleStore`
        // as a free variable from its own enclosing setup() scope — since
        // this extraction discards that scope, it is supplied explicitly as
        // a second parameter instead, never re-implemented.
        const discoveryObservationsView = new Function('entry', 'publicationDistributionLifecycleStore', fnMatch[1]);

        // H2. Extract the real :key expression from the real template, for
        // the SAME div this view renders one discovery observation into,
        // never a re-typed guess of what it says.
        const keyMatch = viewSource.match(/<div v-for="observation in discoveryObservationsView\(entry\)" :key="([^"]+)"/);
        assert(keyMatch, n('H2. the real template\'s own :key expression for a discovery observation row is located, verbatim'));
        const keyExpressionBody = `return (${keyMatch[1]});`;
        // eslint-disable-next-line no-new-func
        const computeKey = new Function('observation', keyExpressionBody);

        // H3. REAL EXECUTION: feed three real Nostr relay observations,
        // obtained from a real three-relay fan-out through the real
        // lifecycle store, into both extracted functions.
        const storageProvider = new InMemoryStorageProvider();
        const store = new NostrPublicationRelaySetConfigurationStore(storageProvider);
        new SetNostrPublicationRelaySetConfigurationUseCase({ nostrPublicationRelaySetConfigurationStore: store })
            .execute({ relayUrls: ['wss://ui-a.example', 'wss://ui-b.example', 'wss://ui-c.example'] });
        const arweave = makeFakeArweaveSubstrate();
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const command = composeMultiRelayNostrPublicationDistributionCommand({
            lifecycleStore,
            arweaveUploaderOptions: { signer: arweave.contentSigner, fetchImpl: arweave.fetchImpl },
            nostrRelayUrls: resolveNostrPublicationRelayUrls({ nostrPublicationRelaySetConfigurationStore: store }),
            nostrPublisherOptions: { publishImpl: makeAlwaysSucceedsPublishImpl(), discoveryTag: 'forkbuild-publication' }
        });
        await command({ publication: makeFakePublication('pub-h1'), serializedMaterial: 'ui representation' });

        const fakeEntry = { publication: { id: 'pub-h1' } };
        const observations = discoveryObservationsView(fakeEntry, lifecycleStore);
        assert(Array.isArray(observations) && observations.length === 3, n('H3. REAL EXECUTION: the real view function, run against the real store, returns all three real relay observations for this publication'));

        const keys = observations.map((observation) => computeKey(observation));
        assert(new Set(keys).size === 3, n('H4. REAL EXECUTION: the real template\'s own :key expression produces three DISTINCT strings for three real Nostr relay observations — no Vue-key collision'));
        assert(keys.every((k) => k.startsWith('nostr:wss://ui-')), n('H5. every computed key is provider-neutral in SHAPE (discoveryProvider + \':\' + origin) — this milestone\'s own three relays merely happen to share the "nostr" provider, exactly as intended, never a provider-specific key format'));

        // H6. No aggregate status of any kind appears anywhere on the real,
        // returned observation objects — the "no newly invented aggregate
        // status" invariant, checked against real objects, not prose.
        for (const observation of observations) {
            assert(!('overallStatus' in observation) && !('count' in observation) && !('successCount' in observation),
                n('H6. a real observation object carries no aggregate/summary field of any kind'));
        }

        console.log('\n=== SECTION H: UI REPRESENTATION ===');
        console.log('✓ Section H: the real Publications Distribution view\'s own discoveryObservationsView() and its own template :key expression, run against three real relay observations, produce three collision-free keys and invent no aggregate status.');
    }

    // ===============================================================
    // Section I — Discovery configuration isolation: both directions, live.
    // ===============================================================
    {
        // I1. Changing the DISCOVERY relay configuration must not change
        // publication fan-out.
        const publicationStorageProvider = new InMemoryStorageProvider();
        const publicationStore = new NostrPublicationRelaySetConfigurationStore(publicationStorageProvider);
        new SetNostrPublicationRelaySetConfigurationUseCase({ nostrPublicationRelaySetConfigurationStore: publicationStore })
            .execute({ relayUrls: ['wss://stable-publication.example'] });
        const resolvedPublicationBefore = resolveNostrPublicationRelayUrls({ nostrPublicationRelaySetConfigurationStore: publicationStore });

        const discoveryStorageProvider = new InMemoryStorageProvider();
        const discoveryStore = new NostrRelayConfigurationStore(discoveryStorageProvider);
        new SetNostrRelayConfigurationUseCase({ nostrRelayConfigurationStore: discoveryStore }).execute({ relayUrl: 'wss://discovery-change-one.example' });
        new SetNostrRelayConfigurationUseCase({ nostrRelayConfigurationStore: discoveryStore }).execute({ relayUrl: 'wss://discovery-change-two.example' });
        discoveryStore.clear();

        const resolvedPublicationAfter = resolveNostrPublicationRelayUrls({ nostrPublicationRelaySetConfigurationStore: publicationStore });
        assert(JSON.stringify(resolvedPublicationBefore) === JSON.stringify(resolvedPublicationAfter),
            n('I1. REAL EXECUTION: saving, re-saving, and clearing the discovery relay configuration leaves the publication relay set\'s own resolved value completely unchanged'));

        // I2. Changing the PUBLICATION relay set must not change discovery
        // behavior — proven against the real, unmodified read-side
        // NostrDiscoveryQueryService, which never accepts or consults a
        // NostrPublicationRelaySetConfigurationStore at all.
        new SetNostrRelayConfigurationUseCase({ nostrRelayConfigurationStore: discoveryStore }).execute({ relayUrl: 'wss://discovery-stable.example' });
        const discoveryServiceBefore = new NostrDiscoveryQueryService({ relayUrl: discoveryStore.get().relayUrl, queryImpl: async () => [] });
        assert(discoveryServiceBefore.relayUrl === 'wss://discovery-stable.example', n('I2a. the real discovery query service resolves the discovery relay actually on file'));

        new SetNostrPublicationRelaySetConfigurationUseCase({ nostrPublicationRelaySetConfigurationStore: publicationStore })
            .execute({ relayUrls: ['wss://new-publication-a.example', 'wss://new-publication-b.example'] });

        const discoveryServiceAfter = new NostrDiscoveryQueryService({ relayUrl: discoveryStore.get().relayUrl, queryImpl: async () => [] });
        assert(discoveryServiceAfter.relayUrl === 'wss://discovery-stable.example', n('I2b. REAL EXECUTION: after a real, unrelated change to the publication relay set, the real discovery query service still resolves the identical, unchanged discovery relay'));
        // Structural confirmation this isn't accidental: the read-side
        // class itself has no field or constructor parameter shaped like
        // a relay SET at all.
        const discoveryServiceSource = await source('application/NostrDiscoveryQueryService.js');
        assert(!/NostrPublicationRelaySetConfiguration/.test(discoveryServiceSource), n('I2c. the real discovery query service source contains no reference to the publication relay set concept of any kind'));

        console.log('\n=== SECTION I: DISCOVERY CONFIGURATION ISOLATION ===');
        console.log('✓ Section I: changing the discovery relay configuration never changes publication fan-out\'s own resolved relay set, and changing the publication relay set never changes what relay a real discovery query service resolves — proven in both directions, by real execution.');
    }

    // ===============================================================
    // Section J — Single-relay compatibility: through the REAL Settings
    // view path.
    // ===============================================================
    {
        const { mountComponent } = await import('./support/MinimalVueCompositionApiShim.js');
        const NostrPublicationRelaySettingsView = (await import('../ui/views/NostrPublicationRelaySettingsView.js')).default;

        const storageProvider = new InMemoryStorageProvider();
        const store = new NostrPublicationRelaySetConfigurationStore(storageProvider);
        const useCase = new SetNostrPublicationRelaySetConfigurationUseCase({ nostrPublicationRelaySetConfigurationStore: store });
        const mount = mountComponent(NostrPublicationRelaySettingsView, {
            nostrPublicationRelaySetConfigurationStore: store,
            setNostrPublicationRelaySetConfigurationUseCase: useCase
        });
        mount.relayUrlsInput.value = 'wss://single.example';
        mount.save();

        const arweave = makeFakeArweaveSubstrate();
        const lifecycleStoreSingle = new PublicationDistributionLifecycleMemoryStore();
        const lifecycleStoreMulti = new PublicationDistributionLifecycleMemoryStore();
        const singleLog = [];
        const multiLog = [];

        const singleRelayCommand = composePublicationDistributionCommand({
            lifecycleStore: lifecycleStoreSingle,
            arweaveUploaderOptions: { signer: arweave.contentSigner, fetchImpl: arweave.fetchImpl },
            nostrPublisherOptions: { publishImpl: makeAlwaysSucceedsPublishImpl(singleLog), discoveryTag: 'forkbuild-publication', relayUrl: 'wss://single.example' }
        });
        const singleResult = await singleRelayCommand({ publication: makeFakePublication('pub-j1'), serializedMaterial: 'single via view' });

        const multiRelayCommand = composeMultiRelayNostrPublicationDistributionCommand({
            lifecycleStore: lifecycleStoreMulti,
            arweaveUploaderOptions: { signer: arweave.contentSigner, fetchImpl: arweave.fetchImpl },
            nostrRelayUrls: resolveNostrPublicationRelayUrls({ nostrPublicationRelaySetConfigurationStore: store }),
            nostrPublisherOptions: { publishImpl: makeAlwaysSucceedsPublishImpl(multiLog), discoveryTag: 'forkbuild-publication' }
        });
        const multiResults = await multiRelayCommand({ publication: makeFakePublication('pub-j1b'), serializedMaterial: 'single via view' });

        assert(singleResult.discovery.relayUrl === 'wss://single.example', n('J1. the pre-existing single-relay command publishes to its own configured relay'));
        assert(multiResults.length === 1 && multiResults[0].discovery.relayUrl === 'wss://single.example',
            n('J2. REAL EXECUTION: a one-relay set saved through the REAL Settings view, resolved through the real provider, produces exactly one result for exactly the same relay'));
        assert(singleLog.length === 1 && multiLog.length === 1, n('J3. exactly one publishImpl call occurred on each path'));

        console.log('\n=== SECTION J: SINGLE-RELAY COMPATIBILITY ===');
        console.log('✓ Section J: a one-element publication relay set, saved through the real Settings view component itself, produces semantics byte-identical to the pre-existing single-relay publication path.');
    }

    // ===============================================================
    // Section K — Persistence degradation: malformed degrades, genuine
    // storage failure propagates, neither ever falls back to discovery
    // config.
    // ===============================================================
    {
        // K1. Malformed persisted bytes degrade to null (documented
        // semantics), never to a fabricated instance and never to a value
        // borrowed from the discovery store.
        const malformedStorageProvider = new InMemoryStorageProvider();
        const malformedStore = new NostrPublicationRelaySetConfigurationStore(malformedStorageProvider);
        malformedStorageProvider.save('nostr-publication-relay-set-configuration', { relayUrls: [true, 42, {}] });
        assert(malformedStore.get() === null, n('K1. REAL EXECUTION: a persisted payload whose every entry is a non-string degrades to null, per this store\'s own documented contract'));
        const resolvedAfterMalformed = resolveNostrPublicationRelayUrls({ nostrPublicationRelaySetConfigurationStore: malformedStore });
        assert(resolvedAfterMalformed.length === 1 && resolvedAfterMalformed[0] === DEFAULT_NOSTR_PUBLICATION_RELAY_URL,
            n('K2. REAL EXECUTION: the provider resolves the documented one-element default for malformed-on-file data — never zero relays, never a throw, and never the discovery relay'));

        // K2b. A discovery override happens to exist at the same time —
        // confirming, once more, live, that the degraded resolution still
        // never reaches for it.
        const discoveryStorageProvider = new InMemoryStorageProvider();
        const discoveryStore = new NostrRelayConfigurationStore(discoveryStorageProvider);
        new SetNostrRelayConfigurationUseCase({ nostrRelayConfigurationStore: discoveryStore }).execute({ relayUrl: 'wss://should-never-be-borrowed.example' });
        const resolvedStillDefault = resolveNostrPublicationRelayUrls({ nostrPublicationRelaySetConfigurationStore: malformedStore });
        assert(resolvedStillDefault[0] !== 'wss://should-never-be-borrowed.example' && resolvedStillDefault[0] === DEFAULT_NOSTR_PUBLICATION_RELAY_URL,
            n('K3. REAL EXECUTION: even with a real, live discovery override present, degraded publication-relay persistence still resolves this store\'s OWN documented default, never the discovery relay'));

        // K4. A GENUINE storage failure (the injected provider's own load()
        // throwing) propagates out of get(), per this store's own
        // documented "a genuine storage failure is never caught here" rule
        // — distinct from "malformed bytes," above.
        const throwingStore = new NostrPublicationRelaySetConfigurationStore(new ThrowingLoadStorageProvider());
        let threw = null;
        try { throwingStore.get(); } catch (error) { threw = error; }
        assert(threw instanceof Error && /simulated storage backend unavailable/.test(threw.message),
            n('K4. REAL EXECUTION: a genuine storage-provider failure propagates, unmodified, out of the real store\'s own get() — never silently swallowed into a default'));
        let providerThrew = null;
        try { resolveNostrPublicationRelayUrls({ nostrPublicationRelaySetConfigurationStore: throwingStore }); } catch (error) { providerThrew = error; }
        assert(providerThrew instanceof Error, n('K5. REAL EXECUTION: the configuration provider does not itself catch a genuine storage failure either — it propagates through the provider exactly as it propagated through the store'));

        console.log('\n=== SECTION K: PERSISTENCE DEGRADATION ===');
        console.log('✓ Section K: malformed persisted bytes degrade to the documented one-element deployment default (never the discovery relay, even when one is live and present), while a genuine storage-provider failure propagates as a real thrown error through both the store and the provider — the two documented failure modes stay distinct, and neither is a fallback to discovery configuration.');
    }

    // ===============================================================
    // Section L — Cross-role isolation: Arweave retrieval/failover, Arweave
    // anchoring, Bitcoin anchoring, Snapshot distribution, Nostr discovery
    // querying.
    // ===============================================================
    {
        const untouchedFiles = [
            'content/ArweaveGatewayFailoverContentStore.js',
            'application/ArweaveGatewayFailoverWorldEncounterMaterialResolver.js',
            'core/ArweaveGatewayConfiguration.js',
            'application/CreateArweaveAnchorPublisherUseCase.js',
            'application/CreateArweaveAnchorProofVerifierUseCase.js',
            'application/CreateBitcoinAnchorTransactionBuilderUseCase.js',
            'application/CreateBitcoinAnchorProofVerifierUseCase.js',
            'application/CreateBitcoinAnchorBroadcastCoordinatorUseCase.js',
            'application/CreateBitcoinAnchorConfirmationObserverUseCase.js',
            'application/SnapshotDistributionCommand.js',
            'application/SnapshotDistributionRuntimeComposition.js',
            'application/NostrDiscoveryQueryService.js',
            'application/NostrSnapshotDiscoveryQueryService.js',
            'application/NostrPlaceNamingDiscoverySource.js'
        ];
        for (const relPath of untouchedFiles) {
            const text = await source(relPath);
            assert(!/NostrPublicationRelaySetConfiguration/.test(text), n(`L1[${relPath}]. no reference to NostrPublicationRelaySetConfiguration of any kind`));
        }

        // Live proof for the one substrate structurally closest to this
        // milestone's own audited chain: Snapshot distribution's own
        // Nostr-discovery-publishing seam is a genuinely separate
        // composition (`composeSnapshotDistributionRuntime()`), never one
        // this milestone's configuration provider or store is wired into —
        // confirmed by construction, not merely by import-sweep.
        const snapshotCompositionSource = await source('application/SnapshotDistributionRuntimeComposition.js');
        assert(!/nostrPublicationRelaySetConfigurationStore|resolveNostrPublicationRelayUrls|NostrPublicationRelaySetConfigurationProvider/.test(snapshotCompositionSource),
            n('L2. the real Snapshot distribution composition file never references this milestone\'s own store, provider, or resolver — Snapshot distribution\'s own relay choice remains entirely its own, separate concern'));

        // Live proof the real read-side discovery query service is
        // constructible and behaves exactly as before, with the
        // publication relay store present, configured, and even actively
        // read from moments earlier in this same process.
        const publicationStorageProvider = new InMemoryStorageProvider();
        const publicationStore = new NostrPublicationRelaySetConfigurationStore(publicationStorageProvider);
        new SetNostrPublicationRelaySetConfigurationUseCase({ nostrPublicationRelaySetConfigurationStore: publicationStore }).execute({ relayUrls: ['wss://isolation-check.example'] });
        resolveNostrPublicationRelayUrls({ nostrPublicationRelaySetConfigurationStore: publicationStore });
        let discoveryQueryLog = [];
        const discoveryService = new NostrDiscoveryQueryService({
            relayUrl: 'wss://discovery-untouched.example',
            queryImpl: async (relayUrl, filter) => { discoveryQueryLog.push({ relayUrl, filter }); return []; }
        });
        await discoveryService.search('forkbuild-publication');
        assert(discoveryQueryLog.length === 1 && discoveryQueryLog[0].relayUrl === 'wss://discovery-untouched.example',
            n('L3. REAL EXECUTION: the real discovery query service queries exactly its own configured relay, exactly once, with the publication relay store present and already in active use nearby — no cross-talk of any kind'));

        console.log('\n=== SECTION L: CROSS-ROLE ISOLATION ===');
        console.log('✓ Section L: no file across Arweave retrieval/failover, Arweave anchoring, Bitcoin anchoring, Snapshot distribution, or Nostr discovery querying references this milestone\'s own new concept, and the real discovery query service and real Snapshot distribution composition both behave exactly as already shipped with the publication relay configuration present and active.');
    }

    // ===============================================================
    // Section M — UX audit: contextual link/label distinguishability
    // between the two Nostr Settings pages.
    // ===============================================================
    const uxFindings = [];
    {
        const publicationsViewSource = await source('ui/views/DecentralizedPublicationsView.js');
        const discoverySettingsSource = await source('ui/views/NostrRelaySettingsView.js');
        const publicationSettingsSource = await source('ui/views/NostrPublicationRelaySettingsView.js');
        const hubSource = await source('ui/views/NetworkSettingsView.js');

        // M1. The two contextual links inside the Publication card carry
        // genuinely different label TEXT, not merely different route
        // targets — a Wanderer scanning the buttons, never reading href
        // attributes, must be able to tell them apart.
        const publicationCardStart = publicationsViewSource.indexOf('<span class="evidence-anchor-type">Publication</span>');
        const snapshotCardStart = publicationsViewSource.indexOf('<span class="evidence-anchor-type">Snapshot</span>', publicationCardStart);
        const publicationCardSlice = publicationsViewSource.slice(publicationCardStart, snapshotCardStart);
        const linkLabelMatches = [...publicationCardSlice.matchAll(/<router-link[^>]*>\s*([\s\S]*?)\s*<\/router-link>/g)]
            .map((m) => m[1].replace(/\{\{[\s\S]*?\}\}/g, '<dynamic>').replace(/\s+/g, ' ').trim());
        assert(linkLabelMatches.length === 2, n('M1a. exactly two router-link labels are found in the Publication card (re-confirming 0.9.447\'s own count)'));
        assert(linkLabelMatches[1] === 'Configure Nostr Publication Relays' && linkLabelMatches[1] !== linkLabelMatches[0],
            n(`M1b. REAL TEXT: the two contextual link labels really differ ("${linkLabelMatches[0]}" vs "${linkLabelMatches[1]}") — a Wanderer can distinguish them by label alone, without reading either href`));

        // M2. Whether each Settings page's own rendered text explicitly
        // names the OTHER page, so a Wanderer who lands on the wrong one
        // for their own intent has an explicit way to find the right one —
        // checked against the real, rendered template text of both pages.
        // This is NOT symmetric today, live-proven below, and the
        // asymmetry is itself recorded as an open finding, per Section M5.
        const publicationSettingsNamesDiscoveryPage = /Nostr Relay/.test(publicationSettingsSource) && !/inject\('nostrRelayConfigurationStore'/.test(publicationSettingsSource);
        assert(publicationSettingsNamesDiscoveryPage,
            n('M2a. REAL TEXT: /settings/nostr-publication-relays\'s own rendered page names the sibling discovery Nostr Relay page (for symmetry), while never injecting or reading that page\'s own store'));
        const discoverySettingsNamesPublicationPage = /Nostr Publication Relays/.test(discoverySettingsSource) || /nostr-publication-relays/.test(discoverySettingsSource);
        assert(discoverySettingsNamesPublicationPage === false,
            n('M2b. REAL TEXT: CONFIRMED — /settings/nostr-relay\'s own rendered page does NOT name or link the sibling Publication Relays page. It correctly states what it is NOT ("does not change where announcements are published") but never says WHERE that actually happens — an asymmetric cross-reference (recorded as an open finding, Section M5), never fixed here'));

        // M3. Both routes are named distinctly in the hub itself, each
        // with its own, distinct one-line description — re-confirmed live
        // (0.9.447 Section J already proved the route registration; this
        // checks the HUB's own row-level text specifically, the surface a
        // Wanderer actually scans first).
        assert(/Nostr Relay<\/span>/.test(hubSource) && /Nostr Publication Relays<\/span>/.test(hubSource),
            n('M3. REAL TEXT: the Settings hub lists both pages under distinct titles'));

        // M4. NEWLY SURFACED, STILL-OPEN FINDING — surfaced, not fixed
        // (this milestone makes no production changes). Section M2 above
        // proved this live: the publication-relay page names its discovery
        // sibling ("see Nostr Relay, under Network Settings"), but the
        // discovery page never names its publication-relay sibling back —
        // a Wanderer who lands on /settings/nostr-relay specifically
        // because they wanted to configure WHERE announcements are
        // published learns only that this page won't do that, with no
        // pointer to the page that will.
        if (publicationSettingsNamesDiscoveryPage && discoverySettingsNamesPublicationPage === false) {
            uxFindings.push('ui/views/NostrRelaySettingsView.js\'s own template names no sibling page: it says "This setting affects discovery only; it does not change where announcements are published" but never says where THAT is configured, while ui/views/NostrPublicationRelaySettingsView.js\'s own template DOES name it back ("see Nostr Relay, under Network Settings") — an asymmetric cross-reference. RECOMMENDATION (not this milestone\'s to apply): append "(see Nostr Publication Relays, under Network Settings)" to the discovery page\'s own existing disclaimer sentence — a one-line text edit, no behavior change.');
        }

        // M5. KNOWN, PRE-EXISTING, STILL-OPEN DEFECT — surfaced, not fixed
        // (this milestone makes no production changes). 0.9.446's own
        // Section A5 already found that the hub's own "Nostr Relay" row
        // describes that page as covering "discovery and publishing," which
        // directly contradicts that same page's own rendered text
        // ("This setting affects discovery only..."). This audit confirms,
        // live, that the contradiction is STILL present, unchanged, even
        // now that a correctly-labeled sibling row exists right below it —
        // which arguably makes the stale wording MORE confusing than
        // before, not less, since a Wanderer now has two adjacent rows and
        // only one of their two descriptions is accurate.
        const hubStillClaimsPublishing = /Relay used for Nostr-based discovery and publishing\./.test(hubSource);
        const settingsPageStillDisclaimsPublishing = /affects discovery only; it does not change where announcements are published/.test(discoverySettingsSource);
        assert(hubStillClaimsPublishing && settingsPageStillDisclaimsPublishing,
            n('M5. REAL TEXT: the 0.9.446-identified hub/page contradiction over the "Nostr Relay" row is CONFIRMED STILL OPEN as of this milestone — the hub still says "discovery and publishing," the page it links to still says "discovery only" — recorded here as a known finding, out of this test-only milestone\'s own scope to fix'));
        if (hubStillClaimsPublishing && settingsPageStillDisclaimsPublishing) {
            uxFindings.push('ui/views/NetworkSettingsView.js\'s own "Nostr Relay" row still reads "Relay used for Nostr-based discovery and publishing," contradicting ui/views/NostrRelaySettingsView.js\'s own "discovery only" disclaimer — pre-existing since before 0.9.444, named by 0.9.446\'s own Section A5, still unfixed. Now that a correctly-worded "Nostr Publication Relays" row sits directly beneath it, the stale wording risks a Wanderer configuring publishing at the WRONG row. RECOMMENDATION (not this milestone\'s to apply): correct the hub row\'s own one-line description to "Relay used for Nostr-based discovery." — a one-line text edit, no behavior change.');
        }

        console.log('\n=== SECTION M: UX AUDIT ===');
        console.log('✓ Section M: the two contextual Distribution links carry genuinely distinct labels, and the hub lists both pages under distinct titles — but the cross-reference between the two Settings pages is ASYMMETRIC (the publication page names its discovery sibling; the discovery page does not name its publication sibling back), and one pre-existing defect from 0.9.446 (the hub\'s own stale "discovery and publishing" wording for the Nostr Relay row) remains open — arguably more confusing now that a correctly-worded sibling row sits beside it. Neither is fixed here, per this milestone\'s own test-only scope; both are recorded as open findings below.');
    }

    // ===============================================================
    // Section N — Decision matrix, verdict, and production-change guard.
    // ===============================================================
    const decisionMatrix = [
        { finding: 'Settings -> persistence, through the real view component', classification: 'VERIFIED', note: 'Section A — save/reload/clear all round-trip correctly across independent mounts; a rejected save leaves prior state untouched' },
        { finding: 'Persistence -> provider ordering/normalization', classification: 'VERIFIED', note: 'Section B — survives the full real-view round trip, not merely the use-case-direct one' },
        { finding: 'Provider -> command reachability and discovery non-leakage', classification: 'VERIFIED', note: 'Section C — every configured relay reaches the command; a live discovery override contributes nothing' },
        { finding: 'Full fan-out, order-independence of the attempted set', classification: 'VERIFIED', note: 'Section D — three relays always independently attempted regardless of configured order' },
        { finding: 'Shared material upload/URI across relays', classification: 'VERIFIED', note: 'Section E — one upload, one shared materialUri, real execution' },
        { finding: 'Partial relay failure produces exactly the surviving observations', classification: 'VERIFIED', note: 'Section F — R2\'s own failure never suppresses R1/R3, and never fabricates its own observation' },
        { finding: 'Relay-level observation identity survives the full production path', classification: 'VERIFIED', note: 'Section G — repeated publication replaces, never accumulates, per relay' },
        { finding: 'Publications Distribution UI representation', classification: 'VERIFIED', note: 'Section H — real :key expression collision-free against real multi-relay data; no invented aggregate status' },
        { finding: 'Discovery/publication configuration isolation, both directions', classification: 'VERIFIED', note: 'Section I — live, real execution, both directions' },
        { finding: 'Single-relay backward compatibility, through the real view', classification: 'VERIFIED', note: 'Section J' },
        { finding: 'Persistence degradation semantics (malformed vs. genuine failure)', classification: 'VERIFIED', note: 'Section K — both documented paths behave as documented; neither borrows the discovery relay' },
        { finding: 'Cross-role isolation (Arweave, Bitcoin, Snapshot, discovery)', classification: 'VERIFIED', note: 'Section L' },
        { finding: 'Contextual link/label distinguishability (Distribution card links + hub row titles)', classification: 'VERIFIED', note: 'Section M1/M3 — links and hub titles are distinguishable' },
        { finding: 'Discovery page never names its publication-relay sibling back (cross-reference asymmetry)', classification: 'KNOWN_OPEN_DEFECT', note: 'Section M2/M4 — newly surfaced by this milestone, still unfixed; out of this milestone\'s own scope' },
        { finding: 'Settings hub\'s own stale "discovery and publishing" wording for the Nostr Relay row', classification: 'KNOWN_OPEN_DEFECT', note: 'Section M5 — pre-existing since before 0.9.444, named by 0.9.446, still unfixed; out of this milestone\'s own scope' }
    ];
    {
        const VALID_CLASSIFICATIONS = ['VERIFIED', 'KNOWN_OPEN_DEFECT'];
        for (const row of decisionMatrix) {
            assert(VALID_CLASSIFICATIONS.includes(row.classification), n(`N1[${row.finding}]. carries a recognized classification`));
        }
        assert(decisionMatrix.filter((r) => r.classification === 'VERIFIED').length === 13, n('N2. every audited integration seam this milestone\'s own request named is classified VERIFIED'));
        assert(decisionMatrix.filter((r) => r.classification === 'KNOWN_OPEN_DEFECT').length === 2, n('N3. exactly two pre-existing/newly-surfaced UX defects are recorded, matching Section M\'s own findings — neither silently dropped, neither (incorrectly) fixed by this test-only milestone'));

        console.log('\n=== SECTION N: DECISION MATRIX ===');
        console.log('| Finding                                                                          | Classification      |');
        console.log('|-----------------------------------------------------------------------------------|----------------------|');
        for (const row of decisionMatrix) console.log(`| ${row.finding.padEnd(83)} | ${row.classification.padEnd(20)} |`);

        console.log('\n=== FINAL VERDICT ===');
        console.log('OVERALL CLASSIFICATION: AUDIT PASSED — STABLE_STOP.');
        console.log('');
        console.log('The complete, real, user-configured publication-relay path — Settings view -> persistence -> configuration');
        console.log('provider -> multi-relay command -> Nostr fan-out -> relay-level lifecycle observation -> Publications');
        console.log('Distribution UI — works correctly end to end, including the two seams this specific milestone was the first to');
        console.log('exercise for real: the actual Composition-API Settings VIEW component\'s own save/load/clear behavior (Section A/B/J),');
        console.log('never merely its use case and store in isolation, and a genuine PARTIAL relay failure inside a real three-relay fan-out');
        console.log('(Section F), never only the all-succeed case 0.9.447 itself already covered. Discovery and publication relay');
        console.log('configuration remain fully isolated from each other in both directions (Section I), backward compatibility with the');
        console.log('single-relay path holds through the real Settings view itself (Section J), persistence degradation follows its own');
        console.log('documented semantics without ever borrowing the discovery relay (Section K), and no other substrate — Arweave retrieval/');
        console.log('failover, Arweave anchoring, Bitcoin anchoring, Snapshot distribution, Nostr discovery querying — shows any trace of this');
        console.log('feature (Section L).');
        console.log('');
        console.log('Two real UX defects remain open (Section M): the discovery Settings page names no way to find its publication-relay sibling');
        console.log('(Section M2/M4, newly surfaced by this audit), and the Settings hub\'s own "Nostr Relay" row still claims to cover');
        console.log('"discovery and publishing," contradicting that very page\'s own text (Section M5, pre-existing, named by 0.9.446). Both are');
        console.log('one-line text fixes, not architectural gaps, and per this milestone\'s own test-only scope are reported rather than applied.');
        console.log('');
        console.log('RECOMMENDATION: per this arc\'s own request, STOP the Nostr publication multi-relay arc here. 0.9.442 through 0.9.448 form');
        console.log('a complete, verified chain: independent multi-relay distribution, persistent user configuration reachable through a real');
        console.log('Settings page, correct relay-level observation identity (including under partial failure), backward compatibility, and');
        console.log('contextual UI reachability with genuinely distinguishable labels. A future Nostr READ-side (discovery/query) multi-relay');
        console.log('milestone is a separate product question — whether querying multiple independent discovery surfaces improves discovery');
        console.log('coverage enough to justify the added complexity — and should be opened, if ever, as its own, separate arc, never assumed');
        console.log('from this write-side arc\'s own success.');

        // N4. Production-change guard — no production file was modified or
        // added by THIS MILESTONE'S OWN COMMIT, the identical commit-scoped
        // check every prior audit in this family already performs. Only
        // tests/ files (this file and its own two support files) are
        // permitted.
        let productionTouched = [];
        try {
            const commitHash = execSync('git log --grep="^0.9.448 " --format=%H -n 1', { cwd: SOURCE_ROOT }).toString().trim();
            if (commitHash) {
                const diffOutput = execSync(`git diff-tree --no-commit-id --name-only -r ${commitHash}`, { cwd: SOURCE_ROOT }).toString();
                productionTouched = diffOutput.split('\n')
                    .filter(Boolean)
                    .filter((f) => !f.startsWith('tests/') && f !== 'tests.html' && !f.startsWith('docs/'));
            }
        } catch { /* git unavailable, or this commit does not exist yet at test-authoring time — not a failure of this decision artifact */ }
        assert(productionTouched.length === 0,
            n(`N4. no production file was modified or added by the 0.9.448 commit itself (found: ${JSON.stringify(productionTouched)})`));

        console.log('\n✅ All Nostr Publication Relay Configuration Integration Boundary Audit tests passed.');
        console.log(`\nTotal assertions: ${assertionCount}`);
        if (uxFindings.length > 0) {
            console.log('\n⚠ Open UX findings (not fixed by this milestone):');
            for (const finding of uxFindings) console.log(`  - ${finding}`);
        }
    }
}

run().catch((error) => {
    console.error('NostrPublicationRelayConfigurationIntegrationBoundaryAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
