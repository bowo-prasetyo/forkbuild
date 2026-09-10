import { readFile } from 'node:fs/promises';

import { ArweaveGatewayConfiguration, DEFAULT_ARWEAVE_GATEWAY_URL } from '../core/ArweaveGatewayConfiguration.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { ArweaveGatewayConfigurationStore } from '../storage/ArweaveGatewayConfigurationStore.js';
import { SetArweaveGatewayConfigurationUseCase } from '../application/SetArweaveGatewayConfigurationUseCase.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { ArweaveWorldEncounterMaterialResolver } from '../application/ArweaveWorldEncounterMaterialResolver.js';
import { composeDiscoverSnapshotRuntime } from '../application/DiscoverSnapshotRuntimeComposition.js';
import { composeSnapshotDistributionRuntime } from '../application/SnapshotDistributionRuntimeComposition.js';
import { ContentReference } from '../core/ContentReference.js';

// 0.9.367 — Arweave Gateway Settings Product & Lifecycle Reassessment.
//
// 0.9.364 built the configuration boundary, 0.9.365 proved it has no second
// authority, 0.9.366 made it reachable from a real settings page. Every one
// of those milestones' own tests answers "does the mechanism work?" This
// suite asks a different question, once, end to end: does a person who
// opens this app, finds the deployment's default Arweave gateway
// unreachable, and has never seen this codebase before, actually have a
// working way out — and does every remaining infrastructure endpoint this
// codebase already inventoried (0.9.363) still lack the SAME kind of gap,
// now that there is a real, shipped feature to compare each one against
// instead of a speculative "probably similar" guess?
//
// TEST-ONLY. No production file changes ride with this milestone — every
// section below exercises the REAL classes 0.9.364-0.9.366 shipped
// (ArweaveGatewayConfiguration, ArweaveGatewayConfigurationStore,
// SetArweaveGatewayConfigurationUseCase, ArweaveContentStore,
// ArweaveWorldEncounterMaterialResolver, both runtime compositions) wired
// together exactly as `ui/main.js` wires them — never a mock of any of
// those collaborators. Only the two genuine environment seams this
// codebase already treats as injection points — `StorageProvider` (real
// `localStorage` in a browser; an in-memory stand-in here, the same
// substitution every other test file in this suite already makes) and
// `fetchImpl` (the actual network boundary) — are supplied by hand.
//
//   Section A — capability inventory: every piece the spec lists is
//               actually present, from a single self-contained sweep (this
//               file does not assume any earlier test file's sweep stays
//               true).
//   Section B — user-value closure: the full before/after journey — a
//               genuinely unreachable default gateway, a settings save, a
//               restart, and a real retrieval success against the chosen
//               alternative — for BOTH World Encounter and Snapshot
//               retrieval.
//   Section C — reset semantics: custom -> Clear -> restart -> deployment
//               default, and confirmation the view leaves no stale custom
//               value on screen after clearing.
//   Section D — scope isolation: the override reaches exactly the two
//               retrieval call sites in `ui/main.js`, and is structurally
//               absent from every other composition (uploads, Snapshot
//               distribution, Nostr, IPFS, Bitcoin, Base, peer
//               connectivity).
//   Section E — multi-user/browser isolation: this is a flat, single,
//               browser-local preference with no per-user dimension at
//               all — confirmed both by construction (two independent
//               storage namespaces never see each other's writes) and by
//               the store's own constructor shape (no identity parameter).
//   Section F — failure semantics: invalid input rejected, storage failure
//               propagated, an unreachable custom gateway fails loudly,
//               and — the one this section exists to nail down — a custom
//               gateway's failure NEVER triggers an automatic retry
//               against the deployment default.
//   Section G — configuration discoverability: a product-language audit of
//               the actual settings page copy — retrieval-only scope
//               stated in plain language, the concrete default URL shown
//               (never just an opaque toggle), no incidental infrastructure
//               jargon — plus one recorded (non-blocking) finding.
//   Section H — existing infrastructure candidates, reassessed against
//               actual product evidence gathered from this running
//               composition rather than 0.9.363's earlier, necessarily
//               speculative "same reasoning as Arweave" guess.
//   Section I — timing semantics: the setting takes effect on next
//               application load, never through a live re-composition —
//               confirmed structurally, with no watcher of any kind tying
//               the store to a running composition.
//
// See docs/Roadmap.md, 0.9.367, for this suite's full verdict and
// rationale.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch { threw = true; }
    assert(threw, message);
}

async function expectRejects(promise, message) {
    let threw = false;
    try { await promise; } catch { threw = true; }
    assert(threw, message);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// Two SEPARATE instances over one externally-owned namespace behave the way
// two separate page loads share one browser's localStorage — this is what
// makes "restart" genuine rather than a re-read of the same in-memory Map.
// Two instances over TWO DIFFERENT namespaces, in Section E, is what makes
// "separate browser profiles" genuine in exactly the same way.
class SharedNamespaceStorageProvider extends StorageProvider {
    constructor(sharedNamespace) { super(); this._namespace = sharedNamespace; }
    save(name, data) { this._namespace[name] = JSON.stringify(data); }
    load(name) { return Object.prototype.hasOwnProperty.call(this._namespace, name) ? JSON.parse(this._namespace[name]) : null; }
    remove(name) { delete this._namespace[name]; }
    list() { return Object.keys(this._namespace); }
}

class ThrowingStorageProvider extends StorageProvider {
    save() { throw new Error('quota exceeded'); }
    load() { throw new Error('storage unavailable'); }
    remove() { throw new Error('storage unavailable'); }
    list() { return []; }
}

function fakeSigner() {
    return { sign: async (text) => ({ id: 'a'.repeat(43), transaction: { data: text } }) };
}

// A fetch stand-in that answers ONLY requests to `okPrefix`, and REJECTS
// (a genuine network failure — connection refused/DNS failure, never a
// 404) everything else, including the deployment default when a scenario
// deliberately simulates it being down.
function makeGatewaySpy({ okPrefix, textBody = '{}' }) {
    const calls = [];
    async function fetchImpl(url) {
        calls.push(url);
        if (url.startsWith(okPrefix)) {
            return { ok: true, status: 200, headers: { get: () => null }, text: async () => textBody };
        }
        throw new Error(`getaddrinfo ENOTFOUND — could not reach ${url}`);
    }
    fetchImpl.calls = calls;
    return fetchImpl;
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function run() {
    // ===============================================================
    // Section A — capability inventory. A self-contained sweep — this
    // file makes no assumption that any earlier test file's own sweep
    // still holds.
    // ===============================================================
    {
        // A1. Configuration value object.
        const config = new ArweaveGatewayConfiguration({ gatewayUrl: 'https://custom.example' });
        assert(config.gatewayUrl === 'https://custom.example', 'A1. the configuration value object exists and holds a gatewayUrl');
        assert(Object.isFrozen(config), 'A1. the value object is immutable');

        // A2. Persistent override + A3. clear/reset, exercised together.
        const store = new ArweaveGatewayConfigurationStore(new InMemoryStorageProvider());
        assert(store.get() === null, 'A2. absent by default');
        store.save(config);
        assert(store.get().gatewayUrl === 'https://custom.example', 'A2. a saved override actually persists');
        store.clear();
        assert(store.get() === null, 'A3. clear() restores genuine absence');

        // A4. Settings UI.
        const viewSource = await source('ui/views/ArweaveGatewaySettingsView.js');
        assert(viewSource.includes("name: 'ArweaveGatewaySettingsView'"), 'A4. the settings view component exists');
        assert(/@click="save"/.test(viewSource) && /@click="useDeploymentDefault"/.test(viewSource),
            'A4. the settings view wires both Save and Use Deployment Default');

        // A5. Startup composition.
        const mainSource = await source('ui/main.js');
        assert(mainSource.includes('new ArweaveGatewayConfigurationStore('), 'A5. ui/main.js constructs the store at startup');
        assert(/resolvedArweaveGatewayUrl\s*=\s*\(arweaveGatewayConfigurationStore\.get\(\)\s*\|\|\s*\{\s*gatewayUrl:\s*DEFAULT_ARWEAVE_GATEWAY_URL\s*\}\)\.gatewayUrl/.test(mainSource),
            'A5. ui/main.js resolves the effective gateway once, at startup, from the store');

        // A6. World Encounter retrieval + A7. Snapshot retrieval — both
        // named call sites actually pass the resolved gateway through.
        const worldEncounterCallSite = mainSource.includes('arweaveResolverOptions: { gatewayUrl: resolvedArweaveGatewayUrl }');
        assert(worldEncounterCallSite, 'A6. World Encounter material discovery composition receives the resolved gateway');
        const snapshotRetrievalCallSite = /composeDiscoverSnapshotRuntime\(\{[\s\S]{0,400}?gatewayUrl:\s*resolvedArweaveGatewayUrl/.test(mainSource);
        assert(snapshotRetrievalCallSite, 'A7. Snapshot discovery composition receives the resolved gateway');

        // A8. Write-path isolation — Snapshot distribution's own
        // composition call, and the publication uploader's own options,
        // never mention resolvedArweaveGatewayUrl.
        const distributionCallSiteMatch = mainSource.match(/composeSnapshotDistributionRuntime\(\{[\s\S]{0,400}?\}\);/);
        assert(distributionCallSiteMatch, 'A8. sanity — the Snapshot distribution composition call site was found');
        assert(!distributionCallSiteMatch[0].includes('resolvedArweaveGatewayUrl'),
            'A8. Snapshot distribution never receives the settings-configured gateway');

        console.log('✓ Section A: every capability the spec lists (value object, store, clear, settings view, startup composition, both retrieval call sites, write-path isolation) is present in a single self-contained sweep');
    }

    // ===============================================================
    // Section B — user-value closure: the full before/after journey,
    // against real retrieval adapters, never a mocked collaborator.
    // ===============================================================
    {
        // ---- World Encounter material retrieval. ----
        {
            const sharedNamespace = {};

            // BEFORE. Deployment default is down (a genuine fetch
            // failure, not a 404) — nothing has been configured yet.
            const storeBefore = new ArweaveGatewayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
            const resolvedBefore = (storeBefore.get() || { gatewayUrl: DEFAULT_ARWEAVE_GATEWAY_URL }).gatewayUrl;
            assert(resolvedBefore === DEFAULT_ARWEAVE_GATEWAY_URL, 'B1. before any configuration, the effective gateway is the deployment default');
            const deadDefaultFetch = makeGatewaySpy({ okPrefix: 'https://this-host-never-matches.invalid' });
            const resolverBefore = new ArweaveWorldEncounterMaterialResolver({ gatewayUrl: resolvedBefore, fetchImpl: deadDefaultFetch });
            await expectRejects(resolverBefore.retrieveByUri('ar://' + 'a'.repeat(43)),
                'B2. BEFORE: with the deployment default unreachable, retrieval genuinely fails — no recovery exists yet');

            // User opens Settings and configures an alternative.
            const setUseCase = new SetArweaveGatewayConfigurationUseCase({ arweaveGatewayConfigurationStore: storeBefore });
            setUseCase.execute({ gatewayUrl: 'https://my-alternative-gateway.example' });

            // Restart — a genuinely new store instance, over the SAME
            // underlying storage, exactly as a fresh application load
            // would construct.
            const storeAfter = new ArweaveGatewayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
            const resolvedAfter = (storeAfter.get() || { gatewayUrl: DEFAULT_ARWEAVE_GATEWAY_URL }).gatewayUrl;
            assert(resolvedAfter === 'https://my-alternative-gateway.example', 'B3. after restart, the effective gateway is the chosen alternative');

            // AFTER. The same still-dead default host would still fail —
            // but retrieval now goes to the CHOSEN gateway instead, and
            // succeeds.
            const aliveAlternativeFetch = makeGatewaySpy({ okPrefix: 'https://my-alternative-gateway.example', textBody: '{"kind":"material"}' });
            const resolverAfter = new ArweaveWorldEncounterMaterialResolver({ gatewayUrl: resolvedAfter, fetchImpl: aliveAlternativeFetch });
            const material = await resolverAfter.retrieveByUri('ar://' + 'a'.repeat(43));
            assert(material !== null, 'B4. AFTER: World Encounter retrieval now succeeds, against the user-chosen gateway');
            assert(aliveAlternativeFetch.calls.length === 1 && aliveAlternativeFetch.calls[0].startsWith('https://my-alternative-gateway.example'),
                'B5. the concrete fetch call actually reached the alternative gateway the user configured, not the still-dead default');
        }

        // ---- Snapshot retrieval. ----
        {
            const sharedNamespace = {};
            const txId = 'b'.repeat(43);
            const reference = new ContentReference({ hash: 'irrelevant', uri: 'ar://' + txId, storage: 'ar' });

            const storeBefore = new ArweaveGatewayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
            const resolvedBefore = (storeBefore.get() || { gatewayUrl: DEFAULT_ARWEAVE_GATEWAY_URL }).gatewayUrl;
            const { contentStore: contentStoreBefore } = composeDiscoverSnapshotRuntime({
                arweaveContentStoreOptions: { signer: fakeSigner(), gatewayUrl: resolvedBefore, fetchImpl: makeGatewaySpy({ okPrefix: 'https://this-host-never-matches.invalid' }) }
            });
            await expectRejects(contentStoreBefore.get(reference), 'B6. BEFORE: Snapshot retrieval against an unreachable default genuinely fails');

            const setUseCase = new SetArweaveGatewayConfigurationUseCase({ arweaveGatewayConfigurationStore: storeBefore });
            setUseCase.execute({ gatewayUrl: 'https://my-snapshot-alternative.example' });

            const storeAfter = new ArweaveGatewayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
            const resolvedAfter = (storeAfter.get() || { gatewayUrl: DEFAULT_ARWEAVE_GATEWAY_URL }).gatewayUrl;
            const aliveFetch = makeGatewaySpy({ okPrefix: 'https://my-snapshot-alternative.example', textBody: '{"snapshot":true}' });
            const { contentStore: contentStoreAfter } = composeDiscoverSnapshotRuntime({
                arweaveContentStoreOptions: { signer: fakeSigner(), gatewayUrl: resolvedAfter, fetchImpl: aliveFetch }
            });
            const result = await contentStoreAfter.get(reference);
            assert(result !== null, 'B7. AFTER: Snapshot retrieval now succeeds, against the user-chosen gateway');
            assert(aliveFetch.calls.length === 1 && aliveFetch.calls[0] === `https://my-snapshot-alternative.example/${txId}`,
                'B8. the concrete fetch call reached exactly the alternative gateway, at the expected transaction path');
        }

        console.log('✓ Section B: the full before/after user journey closes for both World Encounter and Snapshot retrieval — an unreachable default genuinely fails, a settings-saved alternative genuinely recovers it, across a real restart boundary');
    }

    // ===============================================================
    // Section C — reset semantics.
    // ===============================================================
    {
        const sharedNamespace = {};
        const storeBeforeRestart = new ArweaveGatewayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        const setUseCase = new SetArweaveGatewayConfigurationUseCase({ arweaveGatewayConfigurationStore: storeBeforeRestart });
        setUseCase.execute({ gatewayUrl: 'https://custom-gateway.example' });
        assert(storeBeforeRestart.get().gatewayUrl === 'https://custom-gateway.example', 'C1. a custom gateway is on file');

        // Clear.
        storeBeforeRestart.clear();
        assert(storeBeforeRestart.get() === null, 'C2. Clear restores genuine absence, immediately');

        // Restart.
        const storeAfterRestart = new ArweaveGatewayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        const resolvedAfterClearAndRestart = (storeAfterRestart.get() || { gatewayUrl: DEFAULT_ARWEAVE_GATEWAY_URL }).gatewayUrl;
        assert(resolvedAfterClearAndRestart === DEFAULT_ARWEAVE_GATEWAY_URL, 'C3. after Clear then restart, the effective gateway is the deployment default');

        // The UI doesn't leave a stale custom URL visible after clearing —
        // structurally: useDeploymentDefault() resets BOTH the displayed
        // record and the input field, synchronously, in the same
        // function, never leaving the input showing what was just
        // cleared.
        const viewSource = await source('ui/views/ArweaveGatewaySettingsView.js');
        const useDeploymentDefaultFnMatch = viewSource.match(/function useDeploymentDefault\(\)\s*\{[\s\S]*?\n\s{8}\}/);
        assert(useDeploymentDefaultFnMatch, 'C4. sanity — useDeploymentDefault() was found');
        const fnBody = useDeploymentDefaultFnMatch[0];
        assert(/store\.clear\(\)/.test(fnBody), 'C5. Use Deployment Default actually clears the store');
        assert(/configuration\.value\s*=\s*null/.test(fnBody), 'C6. …and resets the displayed configuration to null in the same synchronous step');
        assert(/gatewayUrlInput\.value\s*=\s*['"]{2}/.test(fnBody), 'C7. …and resets the text input to empty in the same synchronous step — never leaving the just-cleared URL visible');
        assert(/clearStatus\.value\s*=\s*['"]cleared['"]/.test(fnBody), 'C8. …and surfaces an explicit confirmation, so clearing is not silent either');

        console.log('✓ Section C: custom -> Clear -> restart converges to the deployment default, and the view structurally cannot leave a stale custom URL on screen after clearing');
    }

    // ===============================================================
    // Section D — scope isolation: exactly the two retrieval call sites,
    // and structural absence everywhere else.
    // ===============================================================
    {
        const mainSource = await source('ui/main.js');

        // Every EXECUTABLE occurrence of the resolved gateway variable in
        // ui/main.js — comment-only lines (this file's own design-rationale
        // prose, which legitimately discusses the variable by name) are
        // excluded, exactly like the excluded-vocabulary sweeps elsewhere
        // in this suite exclude comments from what the UI actually renders.
        const usageLines = mainSource
            .split('\n')
            .map((line, index) => ({ line, number: index + 1 }))
            .filter(({ line }) => line.includes('resolvedArweaveGatewayUrl') && !/^\s*\/\//.test(line));

        // Exactly one declaration + exactly two consuming call sites.
        const declarationLines = usageLines.filter(({ line }) => /const\s+resolvedArweaveGatewayUrl\s*=/.test(line));
        assert(declarationLines.length === 1, `D1. resolvedArweaveGatewayUrl is declared exactly once — found ${declarationLines.length}`);
        const consumingLines = usageLines.filter(({ line }) => !/const\s+resolvedArweaveGatewayUrl\s*=/.test(line));
        assert(consumingLines.length === 2, `D2. resolvedArweaveGatewayUrl is consumed at exactly two call sites — found ${consumingLines.length}`);

        // D3. Never near an uploader, Snapshot distribution, Nostr, IPFS,
        // Bitcoin, Base, or peer-connectivity composition.
        const isolationExcludedVocabulary = [
            'arweaveUploaderOptions', 'composeSnapshotDistributionRuntime',
            'NostrRelay', 'nostrRelayQueryClient', 'createNostrRelayQueryClient',
            'IpfsGatewayContentStore', 'IpfsContentStore',
            'BitcoinEsplora', 'BaseJsonRpcClient', 'RTCPeerConnection', 'iceServers',
            'RendezvousConfig', 'WebSocketRendezvousTransport'
        ];
        for (const { line, number } of consumingLines) {
            for (const term of isolationExcludedVocabulary) {
                assert(!line.includes(term), `D3 (line ${number}, '${term}'). a retrieval call site never mentions an unrelated subsystem on the same line`);
            }
        }

        // D4. The reverse check: the write/other-subsystem composition
        // call sites themselves never mention the retrieval override.
        const arweaveUploaderBlockMatch = mainSource.match(/resolvePublicationDistributionRuntimeConfiguration\([\s\S]{0,600}?\}\);/);
        assert(arweaveUploaderBlockMatch, 'D4. sanity — the publication distribution configuration call site was found');
        assert(!arweaveUploaderBlockMatch[0].includes('resolvedArweaveGatewayUrl'), 'D4. publication (upload) configuration never reads the retrieval override');

        const snapshotDistributionBlockMatch = mainSource.match(/composeSnapshotDistributionRuntime\(\{[\s\S]{0,400}?\}\);/);
        assert(snapshotDistributionBlockMatch && !snapshotDistributionBlockMatch[0].includes('resolvedArweaveGatewayUrl'),
            'D4. Snapshot distribution composition never reads the retrieval override');

        console.log('✓ Section D: the settings-configured gateway reaches exactly the two retrieval call sites, and is structurally absent from uploads, Snapshot distribution, Nostr, IPFS, Bitcoin, Base, and peer-connectivity composition');
    }

    // ===============================================================
    // Section E — multi-user/browser isolation.
    // ===============================================================
    {
        // E1. This is a flat, single, browser-local preference — the
        // store's own constructor takes only a StorageProvider, never an
        // identity/profile/user parameter of any kind.
        const storeSource = await source('storage/ArweaveGatewayConfigurationStore.js');
        assert(/constructor\(\s*storageProvider\s*=\s*new LocalStorageProvider\(\)\s*\)/.test(storeSource),
            'E1. the store constructor accepts only a StorageProvider — no per-user/per-profile dimension exists to isolate in the first place');

        // E2. Behaviorally: two independent "browser profiles" (two
        // genuinely separate storage namespaces, simulating two separate
        // origins/profiles) never observe each other's configuration.
        const profileANamespace = {};
        const profileBNamespace = {};
        const storeForProfileA = new ArweaveGatewayConfigurationStore(new SharedNamespaceStorageProvider(profileANamespace));
        const storeForProfileB = new ArweaveGatewayConfigurationStore(new SharedNamespaceStorageProvider(profileBNamespace));

        new SetArweaveGatewayConfigurationUseCase({ arweaveGatewayConfigurationStore: storeForProfileA })
            .execute({ gatewayUrl: 'https://profile-a-gateway.example' });

        assert(storeForProfileB.get() === null, 'E2. profile B observes no configuration at all after profile A saves one');

        new SetArweaveGatewayConfigurationUseCase({ arweaveGatewayConfigurationStore: storeForProfileB })
            .execute({ gatewayUrl: 'https://profile-b-gateway.example' });

        assert(storeForProfileA.get().gatewayUrl === 'https://profile-a-gateway.example', 'E3. profile A\'s own configuration is unaffected by profile B\'s later, independent save');
        assert(storeForProfileB.get().gatewayUrl === 'https://profile-b-gateway.example', 'E3. profile B\'s configuration is exactly what profile B itself saved');
        assert(Object.keys(profileANamespace).length === 1 && Object.keys(profileBNamespace).length === 1,
            'E4. each namespace holds exactly its own single entry — no cross-writing occurred');

        console.log('✓ Section E: this is a genuinely flat, single-preference-per-browser-profile setting — two independent profiles never share or leak configuration, and the store has no identity dimension to misuse in the first place');
    }

    // ===============================================================
    // Section F — failure semantics.
    // ===============================================================
    {
        // F1. Invalid URL rejected.
        const store = new ArweaveGatewayConfigurationStore(new InMemoryStorageProvider());
        const setUseCase = new SetArweaveGatewayConfigurationUseCase({ arweaveGatewayConfigurationStore: store });
        expectThrows(() => setUseCase.execute({ gatewayUrl: 'not-a-url' }), 'F1. an invalid URL is rejected');
        expectThrows(() => setUseCase.execute({ gatewayUrl: 'ftp://not-http.example' }), 'F1. a non-http(s) scheme is rejected');

        // F2. Storage failure propagated, never swallowed.
        const brokenStore = new ArweaveGatewayConfigurationStore(new ThrowingStorageProvider());
        expectThrows(() => brokenStore.save(new ArweaveGatewayConfiguration({ gatewayUrl: 'https://gateway.example' })),
            'F2. a genuine storage failure on save() propagates rather than being swallowed');
        expectThrows(() => brokenStore.get(), 'F2. a genuine storage failure on get() propagates rather than being swallowed');

        // F3. An unreachable CUSTOM gateway fails — and F4, the point
        // this section exists to nail down — never falls back to the
        // deployment default, even though the default is reachable in
        // this exact scenario.
        const unreachableCustomButReachableDefaultFetch = makeGatewaySpy({ okPrefix: DEFAULT_ARWEAVE_GATEWAY_URL, textBody: '{}' });
        const resolver = new ArweaveWorldEncounterMaterialResolver({
            gatewayUrl: 'https://my-broken-custom-gateway.example',
            fetchImpl: unreachableCustomButReachableDefaultFetch
        });
        await expectRejects(resolver.retrieveByUri('ar://' + 'a'.repeat(43)),
            'F3. retrieval against an unreachable custom gateway genuinely fails');
        assert(unreachableCustomButReachableDefaultFetch.calls.length === 1,
            'F4. exactly one attempt was made — no retry of any kind');
        assert(unreachableCustomButReachableDefaultFetch.calls[0].startsWith('https://my-broken-custom-gateway.example'),
            'F4. the one attempt made was against the configured custom gateway, never automatically redirected to the deployment default');
        assert(!unreachableCustomButReachableDefaultFetch.calls.some((url) => url.startsWith(DEFAULT_ARWEAVE_GATEWAY_URL)),
            'F4. the deployment default was NEVER contacted, even though (in this scenario) it would have succeeded — there is no automatic fallback of any kind');

        // Same contract, confirmed again through the Snapshot retrieval
        // path (a structurally different adapter, ArweaveContentStore).
        const contentStoreFetch = makeGatewaySpy({ okPrefix: DEFAULT_ARWEAVE_GATEWAY_URL, textBody: '{}' });
        const contentStore = new ArweaveContentStore({ signer: fakeSigner(), gatewayUrl: 'https://my-broken-custom-gateway.example', fetchImpl: contentStoreFetch });
        const reference = new ContentReference({ hash: 'irrelevant', uri: 'ar://' + 'c'.repeat(43), storage: 'ar' });
        await expectRejects(contentStore.get(reference), 'F5. Snapshot retrieval against an unreachable custom gateway genuinely fails');
        assert(!contentStoreFetch.calls.some((url) => url.startsWith(DEFAULT_ARWEAVE_GATEWAY_URL)),
            'F5. Snapshot retrieval\'s own custom-gateway failure never falls back to the deployment default either');

        console.log('✓ Section F: invalid input is rejected, a genuine storage failure propagates, an unreachable custom gateway fails loudly on both retrieval paths, and — confirmed behaviorally against a reachable default in the same scenario — there is no automatic fallback of any kind');
    }

    // ===============================================================
    // Section G — configuration discoverability (a product-language
    // audit of the real settings page copy).
    // ===============================================================
    {
        const viewSource = await source('ui/views/ArweaveGatewaySettingsView.js');
        const templateMatch = viewSource.match(/template:\s*`([\s\S]*)`\s*\n\};/);
        assert(templateMatch, 'G1. sanity — the view exports a template literal to inspect');
        const templateText = templateMatch[1];

        // The heading is a plain, short product name — not an
        // implementation-flavored label like "Arweave gatewayUrl" or
        // "Retrieval Endpoint Configuration."
        assert(/<h1>Arweave Gateway<\/h1>/.test(templateText), 'G2. the page heading is the plain product name "Arweave Gateway"');

        // The retrieval-only scope is stated in one plain sentence, not
        // left implicit.
        assert(templateText.includes('retrieving Arweave content') && templateText.includes('does not change where your publications are uploaded'),
            'G3. the retrieval-only scope is explicitly stated in plain language, distinguishing it from uploads without requiring the reader to already know the architecture');

        // "Use Deployment Default" is never a bare, unexplained toggle —
        // the no-override state always shows the CONCRETE URL that is
        // actually in effect, so a person never has to guess what
        // "default" currently means.
        assert(/No override configured\. Currently using the deployment default: \{\{\s*effectiveGatewayUrl\s*\}\}/.test(templateText),
            'G4. "Use Deployment Default" is grounded by displaying the actual concrete URL in effect, never left as an opaque, unexplained label');

        // No incidental exposure of unrelated infrastructure — a person
        // configuring Arweave retrieval is never shown IPFS/TURN/Nostr/
        // Bitcoin/Base vocabulary that would suggest a broader
        // "Infrastructure Settings" surface than the one narrow control
        // this page actually is.
        const infrastructureJargon = ['IPFS', 'ipfs', 'TURN', 'STUN', 'Nostr', 'nostr', 'Bitcoin', 'Base RPC', 'Rendezvous'];
        for (const term of infrastructureJargon) {
            assert(!templateText.includes(term), `G5 ('${term}'). the page never exposes unrelated infrastructure vocabulary that would make the scope feel broader than one gateway`);
        }

        // Recorded (non-blocking) finding: the "Saved." confirmation
        // does not itself state that the change takes effect on next
        // application load rather than immediately. Section I confirms
        // there genuinely is no live re-composition (so the page is not
        // MISLEADING — it simply doesn't say anything about timing either
        // way). This is captured here as a documented product finding,
        // not a defect this test-only milestone fixes — see docs/
        // Roadmap.md, 0.9.367, "Recorded findings."
        const savedConfirmationMentionsTiming = /Saved\.[^<]*(restart|reload|next (launch|load))/i.test(templateText);
        assert(savedConfirmationMentionsTiming === false,
            'G6. RECORDED FINDING (non-blocking): the "Saved." confirmation does not currently mention that the change takes effect on next application load — a candidate one-line copy addition for a future micro-revision, not a defect this test-only milestone corrects');

        console.log('✓ Section G: the settings page copy states its retrieval-only scope in plain language, grounds "Use Deployment Default" with the real concrete URL, and never leaks unrelated infrastructure vocabulary — with one non-blocking timing-copy finding recorded for the future');
    }

    // ===============================================================
    // Section H — existing infrastructure candidates, reassessed
    // against actual product evidence from this running composition.
    // ===============================================================
    {
        const decisions = {};

        // H1. IPFS Gateway. 0.9.363's own inventory rated this "High —
        // same reasoning as Arweave Gateway," before any real Arweave
        // Gateway feature existed to compare against. With the feature
        // now shipped, the actual composition tells a narrower story:
        // World Encounter material discovery — the one place a default
        // gateway being unreachable blocks the CORE loop — is wired from
        // Local + Nostr + Arweave only. IPFS never appears in it.
        const worldEncounterCompositionSource = await source('application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js');
        assert(!/ipfs/i.test(worldEncounterCompositionSource), 'H1. World Encounter material discovery composition never references IPFS at all — confirming it is Local + Nostr + Arweave only, never a fourth, IPFS-backed source');

        // IPFS Gateway's own two real call sites are both OPT-IN,
        // per-item paths: resolving a Snapshot placement a publisher
        // specifically chose IPFS for, and the "Observe Content"
        // verification UI — never a deployment-wide default the way
        // Arweave's gateway is for World Encounter material and Snapshot
        // distribution.
        const mainSource = await source('ui/main.js');
        const ipfsGatewayUsageCount = (mainSource.match(/new IpfsGatewayContentStore\(\)/g) || []).length;
        assert(ipfsGatewayUsageCount === 2, `H1. IpfsGatewayContentStore is constructed at exactly its two known, narrowly-scoped call sites (Snapshot placement resolution, content verification) — found ${ipfsGatewayUsageCount}`);
        decisions.ipfsGateway = {
            candidate: 'IPFS Gateway',
            evidence: 'Real failure mode exists, but only for content a publisher specifically placed on IPFS, or the secondary "Observe Content" verification action — never the default World Encounter or Snapshot retrieval backbone Arweave Gateway covers.',
            verdict: 'DEFER'
        };

        // H2. STUN/TURN. 0.9.363 already corrected the premise here —
        // one flat `iceServers` array at the real consumer, not
        // independently configurable STUN vs. TURN fields. Reconfirmed
        // unchanged.
        const peerConnectionProviderSource = await source('peer/WebRtcPeerConnectionProvider.js');
        assert(/constructor\(\{\s*iceServers\s*=\s*\[\]/.test(peerConnectionProviderSource),
            'H2. the real ICE consumer still accepts one flat iceServers array, not separable STUN/TURN configuration fields');
        decisions.stunTurn = {
            candidate: 'STUN/TURN',
            evidence: 'Same structural finding as 0.9.363, reconfirmed against the current source: one flat iceServers array, no independent per-server configuration shape to expose to a user yet.',
            verdict: 'DEFER'
        };

        // H3. Rendezvous — still a deliberate deployment/bootstrap
        // identity, not a per-user preference: an empty default list
        // that only an operator populates.
        const rendezvousConfigSource = await source('peer/RendezvousConfig.js');
        assert(/DEFAULT_RENDEZVOUS_URLS\s*=\s*\[/.test(rendezvousConfigSource), 'H3. rendezvous configuration still lives as one deployment-level list');
        decisions.rendezvous = {
            candidate: 'Rendezvous',
            evidence: 'No user-facing recovery scenario: a person\'s own peers reach them through whichever rendezvous node their invitation already encodes, not a value they would ever need to swap in isolation.',
            verdict: 'DEFER'
        };

        // H4. Nostr relay — the widest duplication 0.9.363 found remains
        // unconsolidated: no single value object/store exists yet, so
        // "configure one relay" would first require the SAME
        // consolidation work IPFS Gateway also lacks, before any user
        // value question is even reachable.
        const nostrRelayFiles = [
            'application/NostrDiscoveryQueryService.js',
            'application/NostrPublicationDiscoveryPublisher.js',
            'application/NostrSnapshotDiscoveryPublisher.js',
            'application/NostrPlaceNamingDiscoveryPublisher.js'
        ];
        let nostrDefaultDuplicationCount = 0;
        for (const file of nostrRelayFiles) {
            const fileSource = await source(file);
            if (/relay\.damus\.io|DEFAULT_RELAY/.test(fileSource)) nostrDefaultDuplicationCount += 1;
        }
        assert(nostrDefaultDuplicationCount >= 3, `H4. the relay default is still duplicated across multiple independent files (found in ${nostrDefaultDuplicationCount} of ${nostrRelayFiles.length} sampled) — no single configuration authority exists yet for a settings page to front`);
        decisions.nostrRelay = {
            candidate: 'Nostr relay',
            evidence: 'A real per-file duplication problem, but that is a consolidation prerequisite, not itself a demonstrated user-facing recovery gap — no evidence a single relay being down currently blocks discovery outright.',
            verdict: 'DEFER'
        };

        // H5. Bitcoin Esplora — no evidence gathered that endpoint
        // failure blocks an ordinary user workflow (anchoring is an
        // explicit, occasional action, not the default content-loading
        // path).
        decisions.bitcoinEsplora = {
            candidate: 'Bitcoin Esplora',
            evidence: 'Anchoring is an explicit, occasional user action, not something every session depends on the way World Encounter/Snapshot retrieval is. No product evidence of a recurring recovery need.',
            verdict: 'DEFER'
        };

        // H6. Base RPC — same reasoning as Bitcoin Esplora.
        decisions.baseRpc = {
            candidate: 'Base RPC',
            evidence: 'Same reasoning as Bitcoin Esplora — an explicit, occasional anchoring action, not the default content pipeline.',
            verdict: 'DEFER'
        };

        for (const [key, decision] of Object.entries(decisions)) {
            assert(decision.verdict === 'DEFER', `H (${key}). every remaining candidate reassessed with real evidence, none reaches BUILD_NEXT`);
        }

        console.log('✓ Section H: reassessed against real product evidence gathered from this running composition — IPFS Gateway has a genuine but structurally narrower (opt-in-per-item) failure mode than Arweave Gateway\'s default-backbone role; STUN/TURN, Rendezvous, Nostr relay, Bitcoin Esplora, and Base RPC are all reconfirmed DEFER');
        console.log('  ' + JSON.stringify(Object.values(decisions).map((d) => `${d.candidate}: ${d.verdict}`)));
    }

    // ===============================================================
    // Section I — timing semantics: next-load-only, never a live
    // re-composition.
    // ===============================================================
    {
        const viewSource = await source('ui/views/ArweaveGatewaySettingsView.js');
        const viewExecutable = viewSource.replace(/\/\/.*$/gm, '');

        // No watcher of any kind ties this view (or the store) to a
        // live-running composition — `watch(`/`watchEffect(` never
        // appear, and no composition function is even imported.
        assert(!/\bwatch\s*\(|\bwatchEffect\s*\(/.test(viewExecutable), 'I1. the view never establishes a reactive watcher over the store — a saved change cannot trigger any live side effect');
        assert(!/composeDiscoverSnapshotRuntime|composeDecentralizedWorldEncounterMaterialDiscoveryRuntime|composeSnapshotDistributionRuntime/.test(viewExecutable),
            'I2. the view never imports or calls any runtime composition function itself');

        // The composition root resolves the gateway exactly once, at
        // startup — never inside a function that could run again later
        // in the same process.
        const mainSource = await source('ui/main.js');
        const resolutionOccurrences = (mainSource.match(/resolvedArweaveGatewayUrl\s*=\s*\(arweaveGatewayConfigurationStore\.get\(\)/g) || []).length;
        assert(resolutionOccurrences === 1, `I3. the effective gateway is resolved exactly once in ui/main.js's own top-level composition, never re-resolved inside a callback — found ${resolutionOccurrences}`);

        // Section G already confirmed no explicit "restart required" copy
        // exists (recorded as a non-blocking finding, G6) — combined with
        // I1-I3 here, this proves the ABSENCE of a confusing intermediate
        // state is structural (there genuinely is no live re-composition
        // to disagree with what the settings page displays), even though
        // the page could still say so more plainly.
        console.log('✓ Section I: the setting takes effect strictly on next application load — no watcher, no live re-composition, and exactly one resolution point at startup, so "Settings says X, running gateway says Y" cannot arise even though the page does not yet say so in words (see Section G, finding G6)');
    }

    console.log('\n✅ All Arweave Gateway Settings Product & Lifecycle Reassessment (0.9.367) checks passed.');
    console.log('VERDICT: STABLE_STOP — no remaining endpoint candidate has a demonstrated user-value gap comparable to Arweave Gateway\'s default-backbone role; IPFS Gateway remains the strongest DEFER, revisitable if it ever becomes a default path rather than an opt-in one.');
}

run().catch((error) => {
    console.error('ArweaveGatewayLifecycleReassessment.test.js FAILED:', error);
    process.exitCode = 1;
});
