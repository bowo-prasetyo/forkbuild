import { readFile, readdir } from 'node:fs/promises';

import { RoleProviderRole } from '../core/RoleProviderRole.js';
import { RoleProviderPreference } from '../core/RoleProviderPreference.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { RoleProviderPreferenceStore } from '../storage/RoleProviderPreferenceStore.js';
import { RoleAwareProviderResolver, RoleProviderResolutionStatus } from '../application/RoleAwareProviderResolver.js';

import { SnapshotPlacementStoreRegistry } from '../application/SnapshotPlacementStoreRegistry.js';
import { ExternalProofVerifierRegistry } from '../application/ExternalProofVerifierRegistry.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { BitcoinOpReturnProofVerifier } from '../anchoring/BitcoinOpReturnProofVerifier.js';
import { composeDecentralizedWorldEncounterMaterialDiscoveryServices } from '../application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js';

// 0.9.295 — Role-Aware Provider Resolution Boundary.
// See docs/Roadmap.md, "0.9.295 — Role-Aware Provider Resolution
// Boundary," and application/RoleAwareProviderResolver.js's own header for
// the full model this milestone builds on (0.9.293's RoleProviderPreference,
// 0.9.294's RoleProviderPreferenceStore).
//
// Section A: role-specific resolution — construction fail-fast, and the
//            same providerKey resolving to three genuinely distinct
//            capability objects for three different roles
// Section B: Discovery resolution — the REAL composeDecentralizedWorld-
//            EncounterMaterialDiscoveryServices() composition, wrapped in
//            nothing but a minimal get() adapter
// Section C: Content resolution — the REAL SnapshotPlacementStoreRegistry,
//            LocalContentStore and ArweaveContentStore
// Section D: Proof resolution — the REAL ExternalProofVerifierRegistry and
//            BitcoinOpReturnProofVerifier
// Section E: missing preference — NO_PREFERENCE stays distinguishable from
//            a configured-but-unresolvable preference
// Section F: unknown provider — an opaque key nothing registered resolves
//            to PROVIDER_NOT_FOUND, never an error
// Section G: unsupported capability — "base" exists as a real provider
//            name elsewhere in this codebase but has no Proof capability
//            (0.9.292 Section B); it is never returned merely because its
//            name matches, and never gets a fabricated fourth status
// Section H: same provider, different roles — "arweave" resolved against
//            all three REAL registries at once, proving three genuinely
//            independent outcomes (Discovery resolves; Content and Proof
//            do not, for two different real reasons)
// Section I: no fallback — an unavailable preferred provider never causes
//            another, available provider to be silently selected
// Section J: registry isolation — resolving one role never calls get() on
//            either of the other two roles' own registries
// Section K: preference persistence remains passive — resolve() never
//            calls save() on the injected store, and never mutates what
//            is on file
// Section L: no UI — the resolver's own source imports nothing beyond its
//            two named collaborators
// Section M: existing runtime regression — nothing outside this resolver,
//            its 0.9.297 application-boundary consumer, and the 0.9.299
//            Content creation seam that consumer now feeds references it;
//            an unknown role still throws (a programming error, never a
//            resolution outcome)

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch { threw = true; }
    assert(threw, message);
}

// The identical in-memory StorageProvider fake tests/
// DecentralizedRoleProviderPreferencePersistence.test.js already uses for
// the same purpose.
class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makePreferenceStore() {
    return new RoleProviderPreferenceStore(new InMemoryStorageProvider());
}

// A registry with nothing registered — used wherever a test needs to
// supply a role this section is not actually exercising, matching this
// codebase's own "neverCalled" convention for an unused collaborator.
function emptyRegistry() {
    return { get: () => null };
}

// Wraps the plain `{ nostr, arweave }` object application/
// DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js's own
// composeDecentralizedWorldEncounterMaterialDiscoveryServices() already
// returns into the minimal get()-shaped adapter RoleAwareProviderResolver
// expects — built here, in the test file, never shipped as a new
// production DiscoveryProviderRegistry class (see application/
// RoleAwareProviderResolver.js's own header for why).
function discoveryRegistryFrom(services) {
    return {
        get(providerKey) { return services[providerKey] || null; },
        has(providerKey) { return Boolean(services[providerKey]); }
    };
}

// A harmless no-op collaborator, reused across every constructor below
// that requires a `fetchImpl`/`signer`/`queryImpl` but is never actually
// invoked — this file checks resolution wiring, never live wire behavior
// (every substrate's own live wire behavior already has its own dedicated
// test file), the identical restraint tests/
// DecentralizedSubstrateCapabilityMatrixAudit.test.js's own "neverCalled"
// already takes.
function neverCalled() {
    throw new Error('neverCalled: this test never actually invokes network/signing behavior');
}
const fakeSigner = { sign: neverCalled };

const SOURCE_ROOT = new URL('../', import.meta.url);
async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function listJsFiles(relativeDir, results = []) {
    const dirUrl = new URL(relativeDir.endsWith('/') ? relativeDir : `${relativeDir}/`, SOURCE_ROOT);
    let entries;
    try {
        entries = await readdir(dirUrl, { withFileTypes: true });
    } catch {
        return results;
    }
    for (const entry of entries) {
        if (entry.name === 'tests' || entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const childRelative = `${relativeDir.replace(/\/+$/, '')}/${entry.name}`;
        if (entry.isDirectory()) {
            await listJsFiles(childRelative, results);
        } else if (entry.name.endsWith('.js')) {
            results.push(childRelative);
        }
    }
    return results;
}

async function repoWideProductionFiles() {
    const dirs = ['core', 'application', 'content', 'discovery', 'anchoring', 'base', 'arweave', 'nostr', 'publisher', 'ui', 'identity', 'storage', 'peer', 'replication', 'placement', 'spatial', 'serializer', 'presence', 'collaboration', 'world', 'world-layout', 'persistence', 'server', 'renderer'];
    const all = [];
    for (const dir of dirs) await listJsFiles(dir, all);
    return [...new Set(all)];
}

const { RESOLVED, NO_PREFERENCE, PROVIDER_NOT_FOUND } = RoleProviderResolutionStatus;

async function run() {
    // ===============================================================
    // Section A — construction fail-fast, and role-specific resolution:
    // the same providerKey resolves to three genuinely distinct capability
    // objects for three different roles, never one collapsed answer.
    // ===============================================================
    {
        const store = makePreferenceStore();
        expectThrows(() => new RoleAwareProviderResolver({}), 'A1. no preferenceStore at all throws');
        expectThrows(() => new RoleAwareProviderResolver({ preferenceStore: {} }), 'A2. a plain object is not a RoleProviderPreferenceStore');
        expectThrows(() => new RoleAwareProviderResolver({ preferenceStore: store }), 'A3. missing discoveryRegistry throws');
        expectThrows(() => new RoleAwareProviderResolver({ preferenceStore: store, discoveryRegistry: emptyRegistry() }), 'A4. missing contentRegistry throws');
        expectThrows(() => new RoleAwareProviderResolver({ preferenceStore: store, discoveryRegistry: emptyRegistry(), contentRegistry: emptyRegistry() }), 'A5. missing proofRegistry throws');
        expectThrows(() => new RoleAwareProviderResolver({ preferenceStore: store, discoveryRegistry: {}, contentRegistry: emptyRegistry(), proofRegistry: emptyRegistry() }), 'A6. a registry without get() throws');

        const discoveryProvider = Object.freeze({ kind: 'discovery-capability' });
        const contentProvider = Object.freeze({ kind: 'content-capability' });
        const proofProvider = Object.freeze({ kind: 'proof-capability' });
        const resolver = new RoleAwareProviderResolver({
            preferenceStore: store,
            discoveryRegistry: { get: (k) => (k === 'arweave' ? discoveryProvider : null) },
            contentRegistry: { get: (k) => (k === 'arweave' ? contentProvider : null) },
            proofRegistry: { get: (k) => (k === 'arweave' ? proofProvider : null) }
        });
        store.save(new RoleProviderPreference({ role: RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY, providerKey: 'arweave' }));
        store.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'arweave' }));
        store.save(new RoleProviderPreference({ role: RoleProviderRole.PROOF_AND_ANCHORING, providerKey: 'arweave' }));

        const discoveryOutcome = resolver.resolve(RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY);
        const contentOutcome = resolver.resolve(RoleProviderRole.CONTENT);
        const proofOutcome = resolver.resolve(RoleProviderRole.PROOF_AND_ANCHORING);

        assert(discoveryOutcome.status === RESOLVED && discoveryOutcome.provider === discoveryProvider, 'A7. Discovery + "arweave" resolves to the Discovery capability');
        assert(contentOutcome.status === RESOLVED && contentOutcome.provider === contentProvider, 'A8. Content + "arweave" resolves to the Content capability');
        assert(proofOutcome.status === RESOLVED && proofOutcome.provider === proofProvider, 'A9. Proof + "arweave" resolves to the Proof capability');
        assert(discoveryOutcome.provider !== contentOutcome.provider && contentOutcome.provider !== proofOutcome.provider && discoveryOutcome.provider !== proofOutcome.provider, 'A10. three distinct objects — the identical providerKey was never collapsed into one shared answer');
        assert(Object.isFrozen(discoveryOutcome), 'A11. the outcome itself is frozen, never a mutable record a caller could quietly alter');
        console.log('✓ Section A: construction fail-fast, and the same providerKey resolves to three independent capability objects across three roles');
    }

    // ===============================================================
    // Section B — Discovery resolution, using the REAL composition root.
    // ===============================================================
    {
        const store = makePreferenceStore();
        const services = composeDecentralizedWorldEncounterMaterialDiscoveryServices({
            nostrQueryImpl: neverCalled,
            arweaveFetchImpl: neverCalled
        });
        const resolver = new RoleAwareProviderResolver({
            preferenceStore: store,
            discoveryRegistry: discoveryRegistryFrom(services),
            contentRegistry: emptyRegistry(),
            proofRegistry: emptyRegistry()
        });

        store.save(new RoleProviderPreference({ role: RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY, providerKey: 'arweave' }));
        const arweaveOutcome = resolver.resolve(RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY);
        assert(arweaveOutcome.status === RESOLVED, 'B1. Discovery + "arweave" resolves against the real composition');
        assert(arweaveOutcome.provider === services.arweave, 'B2. the resolved provider IS the real ArweaveGraphqlDiscoveryQueryService instance the composition built, never a copy');
        assert(typeof arweaveOutcome.provider.search === 'function', 'B3. it is a real Discovery capability — it carries search()');

        store.save(new RoleProviderPreference({ role: RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY, providerKey: 'nostr' }));
        const nostrOutcome = resolver.resolve(RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY);
        assert(nostrOutcome.status === RESOLVED && nostrOutcome.provider === services.nostr, 'B4. Discovery + "nostr" resolves to the OTHER real service the same composition built, independently');
        console.log('✓ Section B: Discovery resolution runs against the real composeDecentralizedWorldEncounterMaterialDiscoveryServices() output, not a stand-in');
    }

    // ===============================================================
    // Section C — Content resolution, using the REAL keyed registry.
    // ===============================================================
    {
        const store = makePreferenceStore();
        const contentRegistry = new SnapshotPlacementStoreRegistry();
        const localStore = new LocalContentStore(new InMemoryStorageProvider());
        const arweaveStore = new ArweaveContentStore({ signer: fakeSigner, fetchImpl: neverCalled });
        contentRegistry.register(localStore);
        contentRegistry.register(arweaveStore);

        const resolver = new RoleAwareProviderResolver({
            preferenceStore: store,
            discoveryRegistry: emptyRegistry(),
            contentRegistry,
            proofRegistry: emptyRegistry()
        });

        store.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'ar' }));
        const arOutcome = resolver.resolve(RoleProviderRole.CONTENT);
        assert(arOutcome.status === RESOLVED && arOutcome.provider === arweaveStore, 'C1. Content + "ar" (ArweaveContentStore\'s own real storage label) resolves to that exact real store');

        store.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'local' }));
        const localOutcome = resolver.resolve(RoleProviderRole.CONTENT);
        assert(localOutcome.status === RESOLVED && localOutcome.provider === localStore, 'C2. Content + "local" resolves to the other real registered store, independently');
        console.log('✓ Section C: Content resolution runs against the real SnapshotPlacementStoreRegistry with real ContentStore implementations registered');
    }

    // ===============================================================
    // Section D — Proof resolution, using the REAL keyed registry.
    // ===============================================================
    {
        const store = makePreferenceStore();
        const proofRegistry = new ExternalProofVerifierRegistry();
        const bitcoinVerifier = new BitcoinOpReturnProofVerifier({ fetchImpl: neverCalled });
        proofRegistry.register(bitcoinVerifier);

        const resolver = new RoleAwareProviderResolver({
            preferenceStore: store,
            discoveryRegistry: emptyRegistry(),
            contentRegistry: emptyRegistry(),
            proofRegistry
        });

        store.save(new RoleProviderPreference({ role: RoleProviderRole.PROOF_AND_ANCHORING, providerKey: 'bitcoin-op-return' }));
        const outcome = resolver.resolve(RoleProviderRole.PROOF_AND_ANCHORING);
        assert(outcome.status === RESOLVED && outcome.provider === bitcoinVerifier, 'D1. Proof + "bitcoin-op-return" (BitcoinOpReturnProofVerifier\'s own real anchorType) resolves to that exact real verifier');
        assert(typeof outcome.provider.verify === 'function', 'D2. it is a real Proof capability — it carries verify()');
        console.log('✓ Section D: Proof resolution runs against the real ExternalProofVerifierRegistry with the real BitcoinOpReturnProofVerifier registered');
    }

    // ===============================================================
    // Section E — missing preference stays distinguishable from a
    // configured-but-unresolvable one.
    // ===============================================================
    {
        const store = makePreferenceStore();
        const resolver = new RoleAwareProviderResolver({
            preferenceStore: store,
            discoveryRegistry: emptyRegistry(),
            contentRegistry: emptyRegistry(),
            proofRegistry: emptyRegistry()
        });

        const absentOutcome = resolver.resolve(RoleProviderRole.CONTENT);
        assert(absentOutcome.status === NO_PREFERENCE, 'E1. nothing configured for CONTENT -> NO_PREFERENCE');
        assert(absentOutcome.providerKey === null, 'E2. providerKey is null, never a guessed default');
        assert(!('provider' in absentOutcome), 'E3. no `provider` key at all when nothing resolved');

        store.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'not-a-real-provider-yet' }));
        const configuredButUnresolvable = resolver.resolve(RoleProviderRole.CONTENT);
        assert(configuredButUnresolvable.status === PROVIDER_NOT_FOUND, 'E4. once a preference exists but nothing registered satisfies it -> PROVIDER_NOT_FOUND');
        assert(configuredButUnresolvable.providerKey === 'not-a-real-provider-yet', 'E5. the configured providerKey is echoed back even when unresolved');
        assert(absentOutcome.status !== configuredButUnresolvable.status, 'E6. "nothing configured" and "configured but unresolvable" are two distinguishable statuses, never conflated');
        console.log('✓ Section E: NO_PREFERENCE and PROVIDER_NOT_FOUND stay distinguishable outcomes');
    }

    // ===============================================================
    // Section F — an opaque provider key nothing has ever registered
    // resolves to PROVIDER_NOT_FOUND, never an error.
    // ===============================================================
    {
        const store = makePreferenceStore();
        const resolver = new RoleAwareProviderResolver({
            preferenceStore: store,
            discoveryRegistry: emptyRegistry(),
            contentRegistry: new SnapshotPlacementStoreRegistry(),
            proofRegistry: emptyRegistry()
        });
        store.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'not-a-real-provider-yet' }));
        const outcome = resolver.resolve(RoleProviderRole.CONTENT);
        assert(outcome.status === PROVIDER_NOT_FOUND, 'F1. an unknown key never throws — it resolves to an explicit, honest outcome');
        assert(!outcome.provider, 'F2. no provider is ever handed back for an unregistered key');
        console.log('✓ Section F: an unknown provider key resolves honestly to PROVIDER_NOT_FOUND, never a thrown error');
    }

    // ===============================================================
    // Section G — unsupported capability: "base" is a real provider name
    // elsewhere in this codebase (base/BaseTransactionBroadcaster.js,
    // base/BaseTransactionInclusionObserver.js — 0.9.292 Section B11) but
    // has no Proof capability at all. It must resolve to the identical
    // PROVIDER_NOT_FOUND an entirely made-up key gets — never returned
    // merely because its name matches something real, and never a
    // fabricated fourth status this registry cannot actually distinguish.
    // ===============================================================
    {
        const allProductionFiles = await repoWideProductionFiles();
        let proofVerifierSubclassCount = 0;
        for (const file of allProductionFiles) {
            const text = await source(file);
            if (/extends\s+ProofVerifier\b/.test(text)) proofVerifierSubclassCount += 1;
        }
        assert(proofVerifierSubclassCount === 1, `G1. exactly one ProofVerifier subclass exists repo-wide (found ${proofVerifierSubclassCount}) — Bitcoin's, confirming "base" genuinely has no Proof capability to find, not a fixture gap in this test`);

        const store = makePreferenceStore();
        const proofRegistry = new ExternalProofVerifierRegistry();
        proofRegistry.register(new BitcoinOpReturnProofVerifier({ fetchImpl: neverCalled }));
        const resolver = new RoleAwareProviderResolver({
            preferenceStore: store,
            discoveryRegistry: emptyRegistry(),
            contentRegistry: emptyRegistry(),
            proofRegistry
        });
        store.save(new RoleProviderPreference({ role: RoleProviderRole.PROOF_AND_ANCHORING, providerKey: 'base' }));
        const outcome = resolver.resolve(RoleProviderRole.PROOF_AND_ANCHORING);
        assert(outcome.status === PROVIDER_NOT_FOUND, 'G2. Proof + "base" reports PROVIDER_NOT_FOUND — the identical status a wholly invented key gets in Section F, never a special "exists elsewhere, wrong role" status this codebase\'s registries cannot actually tell apart');
        assert(!outcome.provider, 'G3. never returned merely because "base" is a real provider name in base/');
        console.log('✓ Section G: a provider real elsewhere but capability-less for this role resolves exactly like an unknown key — no fabricated status');
    }

    // ===============================================================
    // Section H — same provider, different roles: "arweave" resolved
    // against all three REAL registries at once. Three independent
    // outcomes, for two different real reasons on the roles that fail.
    // ===============================================================
    {
        const store = makePreferenceStore();
        const services = composeDecentralizedWorldEncounterMaterialDiscoveryServices({ arweaveFetchImpl: neverCalled });
        const contentRegistry = new SnapshotPlacementStoreRegistry();
        contentRegistry.register(new ArweaveContentStore({ signer: fakeSigner, fetchImpl: neverCalled })); // self-identifies as 'ar', never 'arweave'
        const proofRegistry = new ExternalProofVerifierRegistry(); // no Arweave proof capability exists anywhere (0.9.292 Section B)

        const resolver = new RoleAwareProviderResolver({
            preferenceStore: store,
            discoveryRegistry: discoveryRegistryFrom(services),
            contentRegistry,
            proofRegistry
        });

        store.save(new RoleProviderPreference({ role: RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY, providerKey: 'arweave' }));
        store.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'arweave' }));
        store.save(new RoleProviderPreference({ role: RoleProviderRole.PROOF_AND_ANCHORING, providerKey: 'arweave' }));

        const discoveryOutcome = resolver.resolve(RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY);
        const contentOutcome = resolver.resolve(RoleProviderRole.CONTENT);
        const proofOutcome = resolver.resolve(RoleProviderRole.PROOF_AND_ANCHORING);

        assert(discoveryOutcome.status === RESOLVED && discoveryOutcome.provider === services.arweave, 'H1. Discovery + "arweave" resolves — the real ArweaveGraphqlDiscoveryQueryService from the real composition');
        assert(contentOutcome.status === PROVIDER_NOT_FOUND, 'H2. Content + "arweave" does NOT resolve — the real ArweaveContentStore self-identifies as "ar", never "arweave"; no silent renaming or fuzzy match happens here');
        assert(proofOutcome.status === PROVIDER_NOT_FOUND, 'H3. Proof + "arweave" does NOT resolve — Arweave has no Proof capability at all (0.9.292 Section B)');
        console.log('✓ Section H: the identical providerKey "arweave" produces three genuinely independent, source-grounded outcomes across the three roles');
    }

    // ===============================================================
    // Section I — no fallback: an unavailable preferred provider never
    // causes another, available provider to be silently selected.
    // ===============================================================
    {
        const store = makePreferenceStore();
        const contentRegistry = new SnapshotPlacementStoreRegistry();
        contentRegistry.register(new LocalContentStore(new InMemoryStorageProvider())); // 'local' IS available
        const resolver = new RoleAwareProviderResolver({
            preferenceStore: store,
            discoveryRegistry: emptyRegistry(),
            contentRegistry,
            proofRegistry: emptyRegistry()
        });
        store.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'ipfs' })); // preferred, never registered
        const outcome = resolver.resolve(RoleProviderRole.CONTENT);
        assert(outcome.status === PROVIDER_NOT_FOUND, 'I1. the preferred "ipfs" is unavailable');
        assert(!outcome.provider, 'I2. no provider of any kind is handed back');
        assert(contentRegistry.has('local'), 'I3. sanity: "local" really is registered and would have been available to fall back to');
        console.log('✓ Section I: an unavailable preferred provider never triggers a silent fallback to a different, available one');
    }

    // ===============================================================
    // Section J — registry isolation: resolving one role never consults
    // either of the other two roles' own registries.
    // ===============================================================
    {
        const store = makePreferenceStore();
        let discoveryCalls = 0, contentCalls = 0, proofCalls = 0;
        const discoveryRegistry = { get: () => { discoveryCalls += 1; return null; } };
        const contentRegistry = { get: () => { contentCalls += 1; return { ok: true }; } };
        const proofRegistry = { get: () => { proofCalls += 1; return null; } };
        const resolver = new RoleAwareProviderResolver({ preferenceStore: store, discoveryRegistry, contentRegistry, proofRegistry });

        store.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'x' }));
        resolver.resolve(RoleProviderRole.CONTENT);
        assert(contentCalls === 1, 'J1. CONTENT\'s own registry was consulted exactly once');
        assert(discoveryCalls === 0 && proofCalls === 0, 'J2. neither the Discovery nor the Proof registry was ever touched while resolving CONTENT');
        console.log('✓ Section J: resolving one role never reaches into another role\'s own registry');
    }

    // ===============================================================
    // Section K — preference persistence remains passive: resolve() only
    // ever reads the preference store, never writes it.
    // ===============================================================
    {
        const store = makePreferenceStore();
        store.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'local' }));

        let saveCalls = 0;
        const originalSave = store.save.bind(store);
        store.save = (...args) => { saveCalls += 1; return originalSave(...args); };

        const resolver = new RoleAwareProviderResolver({
            preferenceStore: store,
            discoveryRegistry: emptyRegistry(),
            contentRegistry: { get: () => ({ ok: true }) },
            proofRegistry: emptyRegistry()
        });
        resolver.resolve(RoleProviderRole.CONTENT);
        resolver.resolve(RoleProviderRole.CONTENT);
        resolver.resolve(RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY);

        assert(saveCalls === 0, 'K1. resolve() never calls save() on the injected preference store, no matter how many times or for which role it is called');
        const stillThere = store.get(RoleProviderRole.CONTENT);
        assert(stillThere.providerKey === 'local', 'K2. the persisted preference is exactly as it was before any resolution ran');
        console.log('✓ Section K: resolution reads the preference store; it never writes back to it');
    }

    // ===============================================================
    // Section L — no UI: the resolver's own source imports nothing beyond
    // its two named collaborators.
    // ===============================================================
    {
        const resolverSource = await source('application/RoleAwareProviderResolver.js');
        const importLines = resolverSource.split('\n').filter((line) => /^import\b/.test(line));
        assert(importLines.length === 2, `L1. exactly two imports — RoleProviderRole and RoleProviderPreferenceStore (found ${importLines.length})`);
        const forbiddenImportPattern = /^import\b[^\n]*from\s*['"][^'"]*(nostr|arweave|ipfs|bitcoin|anchoring|content\/|discovery\/|base\/|ui\/)[^'"]*['"]/im;
        assert(!forbiddenImportPattern.test(resolverSource), 'L2. no provider implementation, no content/anchoring/discovery module, and no ui/ module is ever imported');
        assert(!/\bnew\s+(Nostr|Arweave|Ipfs|Bitcoin|Base)\w*\(/.test(resolverSource), 'L3. the resolver never constructs a concrete provider itself — every provider it hands back was constructed by its caller');
        console.log('✓ Section L: no UI import, and no concrete provider construction, anywhere in the resolver\'s own source');
    }

    // ===============================================================
    // Section M — existing runtime regression: nothing outside this
    // resolver, its 0.9.297 application-boundary consumer, and the 0.9.299
    // Content creation seam that consumer now feeds references it, and an
    // unknown role is a programming error, never a resolution outcome.
    //
    // UPDATED by 0.9.297 — Role Provider Preference Application Boundary
    // — application/ResolvePreferredRoleProviderUseCase.js is now a
    // second, legitimate reference: it reads a RoleProviderPreference
    // directly from the store AND delegates resolution to THIS resolver's
    // own resolve(). UPDATED AGAIN by 0.9.299 — Content Creation Provider
    // Preference Integration — application/
    // PreferredSnapshotPlacementCreationCoordinator.js and its own
    // composition root, application/
    // CreatePreferredSnapshotPlacementCreationCoordinatorUseCase.js, are
    // the first production callers that actually reach this resolver at
    // runtime (through ResolvePreferredRoleProviderUseCase, never
    // directly), so existing publication distribution, Snapshot
    // distribution, discovery, material loading, and anchoring paths
    // stay exactly as before this milestone — only Content placement
    // CREATION now has a real, live path to this resolver. This section
    // is UPDATED, not deleted, following the exact precedent 0.9.293-
    // 0.9.297 each already set for the sweep before them.
    // ===============================================================
    {
        const allProductionFiles = await repoWideProductionFiles();
        const KNOWN_RESOLVER_FILES = new Set([
            'application/RoleAwareProviderResolver.js',
            'application/ResolvePreferredRoleProviderUseCase.js',
            'application/PreferredSnapshotPlacementCreationCoordinator.js',
            'application/CreatePreferredSnapshotPlacementCreationCoordinatorUseCase.js'
        ]);
        let hits = 0;
        const hitFiles = [];
        for (const file of allProductionFiles) {
            const text = await source(file);
            if (/RoleAwareProviderResolver/.test(text)) {
                hits += 1;
                hitFiles.push(file);
            }
        }
        assert(hits === KNOWN_RESOLVER_FILES.size, `M1. only application/RoleAwareProviderResolver.js, its 0.9.297 application-boundary consumer, and the 0.9.299 Content creation seam mention RoleAwareProviderResolver in production source (found ${hits}: ${hitFiles.join(', ')}) — no OTHER composition root wires it in, so existing publication distribution, Snapshot distribution, discovery, material loading, and anchoring paths behave exactly as before this milestone`);
        for (const file of hitFiles) {
            assert(KNOWN_RESOLVER_FILES.has(file), `M1b. "${file}" is not one of the known legitimate references to RoleAwareProviderResolver`);
        }

        const store = makePreferenceStore();
        const resolver = new RoleAwareProviderResolver({
            preferenceStore: store,
            discoveryRegistry: emptyRegistry(),
            contentRegistry: emptyRegistry(),
            proofRegistry: emptyRegistry()
        });
        expectThrows(() => resolver.resolve('NETWORK'), 'M2. an unknown role throws — a programming error, never a NO_PREFERENCE/PROVIDER_NOT_FOUND outcome');
        expectThrows(() => resolver.resolve('content'), 'M3. lowercase is not a role either — the vocabulary stays case-sensitive');
        console.log('✓ Section M: the resolver is a real, tested capability, reached at runtime only through the one 0.9.299 Content creation integration — every other production runtime path is unchanged by this milestone');
    }

    console.log('\n✅ All Role-Aware Provider Resolution tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
