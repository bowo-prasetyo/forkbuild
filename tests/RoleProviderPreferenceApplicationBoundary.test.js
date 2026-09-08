import { readFile, readdir } from 'node:fs/promises';

import { RoleProviderRole } from '../core/RoleProviderRole.js';
import { RoleProviderPreference } from '../core/RoleProviderPreference.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { RoleProviderPreferenceStore } from '../storage/RoleProviderPreferenceStore.js';
import { RoleAwareProviderResolver, RoleProviderResolutionStatus } from '../application/RoleAwareProviderResolver.js';
import { ResolvePreferredRoleProviderUseCase } from '../application/ResolvePreferredRoleProviderUseCase.js';

import { SnapshotPlacementStoreRegistry } from '../application/SnapshotPlacementStoreRegistry.js';
import { ExternalProofVerifierRegistry } from '../application/ExternalProofVerifierRegistry.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { BitcoinOpReturnProofVerifier } from '../anchoring/BitcoinOpReturnProofVerifier.js';
import { composeDecentralizedWorldEncounterMaterialDiscoveryServices } from '../application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js';

// 0.9.297 — Role Provider Preference Application Boundary.
// See docs/Roadmap.md, "0.9.297 — Role Provider Preference Application
// Boundary," and application/ResolvePreferredRoleProviderUseCase.js's own
// header for the full model this milestone builds on (0.9.294's
// RoleProviderPreferenceStore, 0.9.295's RoleAwareProviderResolver,
// 0.9.296's audit finding that no production seam is ready to consume
// either one yet).
//
// Section A: preference delegation — execute() obtains the preference
//            through RoleProviderPreferenceStore.get(), never by any
//            other means; construction fail-fast
// Section B: resolver delegation — provider selection goes through
//            RoleAwareProviderResolver.resolve(), never a re-implemented
//            registry lookup of this class's own
// Section C: resolved capability — a valid configured provider returns
//            the concrete role capability, using REAL registries
// Section D: no preference — NO_PREFERENCE stays explicitly
//            distinguishable, with no fabricated default
// Section E: provider not found — an invalid configured provider stays
//            explicitly distinguishable, with the configured key echoed
// Section F: no fallback — an available alternate provider is never
//            silently selected in place of an unavailable preferred one
// Section G: store read-only — execute() never calls save() on the
//            injected store, whether resolution succeeds or fails
// Section H: role isolation — a Discovery preference cannot influence
//            what Content or Proof resolve to
// Section I: same provider key, different roles — "arweave" resolved
//            independently across all three roles through this one seam
// Section J: no construction — this file never imports or instantiates a
//            concrete provider, content/anchoring/discovery module, or
//            ui/ module
// Section K: runtime integration, as of 0.9.299 — application/
//            PreferredSnapshotPlacementCreationCoordinator.js and its own
//            composition root are the first and only production
//            consumers of this class; an unknown role still throws

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch { threw = true; }
    assert(threw, message);
}

// The identical in-memory StorageProvider fake tests/
// RoleAwareProviderResolution.test.js already uses for the same purpose.
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

function emptyRegistry() {
    return { get: () => null };
}

function discoveryRegistryFrom(services) {
    return { get(providerKey) { return services[providerKey] || null; } };
}

function neverCalled() {
    throw new Error('neverCalled: this test never actually invokes network/signing behavior');
}
const fakeSigner = { sign: neverCalled };

function makeUseCase({ preferenceStore, discoveryRegistry = emptyRegistry(), contentRegistry = emptyRegistry(), proofRegistry = emptyRegistry() }) {
    const resolver = new RoleAwareProviderResolver({ preferenceStore, discoveryRegistry, contentRegistry, proofRegistry });
    return { useCase: new ResolvePreferredRoleProviderUseCase({ preferenceStore, resolver }), resolver };
}

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
    // Section A — preference delegation: execute() obtains the preference
    // through RoleProviderPreferenceStore.get(), and construction is
    // fail-fast for both required collaborators.
    // ===============================================================
    {
        const store = makePreferenceStore();
        const resolver = new RoleAwareProviderResolver({
            preferenceStore: store,
            discoveryRegistry: emptyRegistry(),
            contentRegistry: emptyRegistry(),
            proofRegistry: emptyRegistry()
        });
        expectThrows(() => new ResolvePreferredRoleProviderUseCase({}), 'A1. no preferenceStore or resolver at all throws');
        expectThrows(() => new ResolvePreferredRoleProviderUseCase({ preferenceStore: {} }), 'A2. a plain object is not a RoleProviderPreferenceStore');
        expectThrows(() => new ResolvePreferredRoleProviderUseCase({ preferenceStore: store }), 'A3. missing resolver throws');
        expectThrows(() => new ResolvePreferredRoleProviderUseCase({ preferenceStore: store, resolver: {} }), 'A4. a plain object is not a RoleAwareProviderResolver');

        // Two separate RoleProviderPreferenceStore instances sharing the
        // SAME underlying StorageProvider — the resolver reads through
        // its own instance exactly like production wiring would, while
        // the OTHER instance (passed directly to the use case) is spied
        // on in isolation, so a call the use case makes itself can never
        // be conflated with a call the resolver makes internally.
        const storageProvider = new InMemoryStorageProvider();
        const directStore = new RoleProviderPreferenceStore(storageProvider);
        const resolverStore = new RoleProviderPreferenceStore(storageProvider);
        const isolatedResolver = new RoleAwareProviderResolver({
            preferenceStore: resolverStore,
            discoveryRegistry: emptyRegistry(),
            contentRegistry: emptyRegistry(),
            proofRegistry: emptyRegistry()
        });

        const preference = new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'local' });
        directStore.save(preference);

        let getCalls = 0;
        const getArgs = [];
        const originalGet = directStore.get.bind(directStore);
        directStore.get = (role) => { getCalls += 1; getArgs.push(role); return originalGet(role); };

        const useCase = new ResolvePreferredRoleProviderUseCase({ preferenceStore: directStore, resolver: isolatedResolver });
        const decision = useCase.execute({ role: RoleProviderRole.CONTENT });

        assert(getCalls === 1, `A5. execute() calls RoleProviderPreferenceStore.get() exactly once directly on the store IT was given (found ${getCalls} calls)`);
        assert(getArgs[0] === RoleProviderRole.CONTENT, 'A6. the store is asked for exactly the role execute() was called with');
        assert(decision.preference instanceof RoleProviderPreference, 'A7. the decision carries the real RoleProviderPreference the store returned');
        assert(decision.preference.providerKey === 'local', 'A8. the preference read back matches exactly what was saved');
        console.log('✓ Section A: execute() obtains the preference through RoleProviderPreferenceStore.get(), directly and exactly once; construction fails fast without either required collaborator');
    }

    // ===============================================================
    // Section B — resolver delegation: provider selection goes through
    // RoleAwareProviderResolver.resolve(), never a registry lookup this
    // class re-implements on its own.
    // ===============================================================
    {
        const store = makePreferenceStore();
        store.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'local' }));
        const contentRegistry = new SnapshotPlacementStoreRegistry();
        contentRegistry.register(new LocalContentStore(new InMemoryStorageProvider()));
        const resolver = new RoleAwareProviderResolver({
            preferenceStore: store,
            discoveryRegistry: emptyRegistry(),
            contentRegistry,
            proofRegistry: emptyRegistry()
        });

        let resolveCalls = 0;
        const resolveArgs = [];
        const originalResolve = resolver.resolve.bind(resolver);
        resolver.resolve = (role) => { resolveCalls += 1; resolveArgs.push(role); return originalResolve(role); };

        const useCase = new ResolvePreferredRoleProviderUseCase({ preferenceStore: store, resolver });
        const decision = useCase.execute({ role: RoleProviderRole.CONTENT });

        assert(resolveCalls === 1, `B1. execute() calls RoleAwareProviderResolver.resolve() exactly once (found ${resolveCalls} calls)`);
        assert(resolveArgs[0] === RoleProviderRole.CONTENT, 'B2. the resolver is asked to resolve exactly the role execute() was called with');
        assert(decision.status === RESOLVED && decision.provider instanceof LocalContentStore, 'B3. the decision\'s own capability IS the resolver\'s own outcome, never a second, independently-computed answer');

        const useCaseSource = await source('application/ResolvePreferredRoleProviderUseCase.js');
        assert(!/\.get\(\s*(preference\.providerKey|providerKey)\s*\)/.test(useCaseSource), 'B4. this class never calls .get(providerKey) itself — it never re-implements a registry lookup of its own');
        assert(useCaseSource.split('\n').filter((l) => /^import\b/.test(l)).length === 3, 'B5. exactly three imports — RoleProviderRole, RoleProviderPreferenceStore, and RoleAwareProviderResolver — no registry class is imported to duplicate lookup logic with');
        console.log('✓ Section B: provider selection is delegated to RoleAwareProviderResolver.resolve(), exactly once per call, with no registry logic of this class\'s own');
    }

    // ===============================================================
    // Section C — resolved capability: a valid configured provider
    // returns the concrete role capability, against REAL registries.
    // ===============================================================
    {
        const store = makePreferenceStore();
        const contentRegistry = new SnapshotPlacementStoreRegistry();
        const arweaveStore = new ArweaveContentStore({ signer: fakeSigner, fetchImpl: neverCalled });
        contentRegistry.register(arweaveStore);
        const { useCase } = makeUseCase({ preferenceStore: store, contentRegistry });

        store.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'ar' }));
        const decision = useCase.execute({ role: RoleProviderRole.CONTENT });

        assert(decision.status === RESOLVED, 'C1. a configured, registered provider resolves');
        assert(decision.provider === arweaveStore, 'C2. the decision hands back the exact real ArweaveContentStore instance the registry holds, never a copy');
        assert(decision.providerKey === 'ar', 'C3. providerKey is echoed exactly as configured');
        assert(Object.isFrozen(decision), 'C4. the decision itself is frozen');
        console.log('✓ Section C: a valid, registered preference resolves to the real concrete role capability');
    }

    // ===============================================================
    // Section D — no preference stays explicitly distinguishable, with no
    // fabricated default.
    // ===============================================================
    {
        const store = makePreferenceStore();
        const { useCase } = makeUseCase({ preferenceStore: store, contentRegistry: new SnapshotPlacementStoreRegistry() });
        const decision = useCase.execute({ role: RoleProviderRole.CONTENT });

        assert(decision.status === NO_PREFERENCE, 'D1. nothing configured -> NO_PREFERENCE');
        assert(decision.preference === null, 'D2. preference is null, never a guessed default');
        assert(decision.providerKey === null, 'D3. providerKey is null, never a guessed default');
        assert(!('provider' in decision), 'D4. no provider field is fabricated when nothing was configured');
        console.log('✓ Section D: NO_PREFERENCE stays an explicit, distinguishable outcome — never silently turned into a default');
    }

    // ===============================================================
    // Section E — provider not found stays explicitly distinguishable,
    // with the configured key echoed back.
    // ===============================================================
    {
        const store = makePreferenceStore();
        const { useCase } = makeUseCase({ preferenceStore: store, contentRegistry: new SnapshotPlacementStoreRegistry() });
        store.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'not-a-real-provider-yet' }));
        const decision = useCase.execute({ role: RoleProviderRole.CONTENT });

        assert(decision.status === PROVIDER_NOT_FOUND, 'E1. a configured but unresolvable provider -> PROVIDER_NOT_FOUND');
        assert(decision.preference instanceof RoleProviderPreference && decision.preference.providerKey === 'not-a-real-provider-yet', 'E2. the raw configured preference is still readable from the decision, even though it did not resolve');
        assert(decision.providerKey === 'not-a-real-provider-yet', 'E3. the resolver\'s own providerKey is echoed identically');
        assert(!('provider' in decision), 'E4. no provider field is fabricated for an unresolvable preference');
        console.log('✓ Section E: PROVIDER_NOT_FOUND stays an explicit, distinguishable outcome, with the configured preference still readable');
    }

    // ===============================================================
    // Section F — no fallback: an available alternate provider is never
    // silently selected in place of an unavailable preferred one.
    // ===============================================================
    {
        const store = makePreferenceStore();
        const contentRegistry = new SnapshotPlacementStoreRegistry();
        contentRegistry.register(new LocalContentStore(new InMemoryStorageProvider())); // 'local' IS available
        const { useCase } = makeUseCase({ preferenceStore: store, contentRegistry });
        store.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'ipfs' })); // preferred, never registered

        const decision = useCase.execute({ role: RoleProviderRole.CONTENT });
        assert(decision.status === PROVIDER_NOT_FOUND, 'F1. the preferred "ipfs" is unavailable');
        assert(!('provider' in decision), 'F2. no provider of any kind is handed back');
        assert(contentRegistry.has('local'), 'F3. sanity: "local" really is registered and would have been available to silently fall back to');

        const useCaseSource = await source('application/ResolvePreferredRoleProviderUseCase.js');
        assert(!/PROVIDER_NOT_FOUND[\s\S]{0,120}(provider\s*=|\.provider\s*=)/.test(useCaseSource), 'F4. this class\'s own source never assigns a provider on the PROVIDER_NOT_FOUND path — there is no branch that could substitute one');
        console.log('✓ Section F: an unavailable preferred provider never triggers a silent fallback to a different, available one');
    }

    // ===============================================================
    // Section G — store read-only: execute() never writes to the
    // injected preference store, whether resolution succeeds or fails.
    // ===============================================================
    {
        const store = makePreferenceStore();
        store.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'local' }));

        let saveCalls = 0;
        const originalSave = store.save.bind(store);
        store.save = (...args) => { saveCalls += 1; return originalSave(...args); };

        const contentRegistry = new SnapshotPlacementStoreRegistry();
        contentRegistry.register(new LocalContentStore(new InMemoryStorageProvider()));
        const { useCase } = makeUseCase({ preferenceStore: store, contentRegistry });

        const resolvedDecision = useCase.execute({ role: RoleProviderRole.CONTENT });
        assert(resolvedDecision.status === RESOLVED, 'G1. sanity: this call actually resolved');

        store.save = (...args) => { saveCalls += 1; return originalSave(...args); };
        const { useCase: secondUseCase } = makeUseCase({ preferenceStore: store });
        const noPreferenceDecision = secondUseCase.execute({ role: RoleProviderRole.PROOF_AND_ANCHORING });
        assert(noPreferenceDecision.status === NO_PREFERENCE, 'G2. sanity: this call found nothing configured');

        assert(saveCalls === 0, `G3. execute() never calls save() on the injected preference store, whether resolution succeeds or fails (found ${saveCalls} calls)`);
        const stillThere = store.get(RoleProviderRole.CONTENT);
        assert(stillThere.providerKey === 'local', 'G4. the persisted preference is exactly as it was before any execute() call ran');
        console.log('✓ Section G: execute() only ever reads the preference store — it never writes to it, regardless of outcome');
    }

    // ===============================================================
    // Section H — role isolation: a Discovery preference cannot influence
    // what Content or Proof resolve to.
    // ===============================================================
    {
        const store = makePreferenceStore();
        const contentRegistry = new SnapshotPlacementStoreRegistry();
        contentRegistry.register(new LocalContentStore(new InMemoryStorageProvider()));
        const proofRegistry = new ExternalProofVerifierRegistry();
        proofRegistry.register(new BitcoinOpReturnProofVerifier({ fetchImpl: neverCalled }));
        const services = composeDecentralizedWorldEncounterMaterialDiscoveryServices({ arweaveFetchImpl: neverCalled });
        const { useCase } = makeUseCase({ preferenceStore: store, discoveryRegistry: discoveryRegistryFrom(services), contentRegistry, proofRegistry });

        // Only Discovery has a preference configured — Content and Proof
        // have nothing on file at all.
        store.save(new RoleProviderPreference({ role: RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY, providerKey: 'arweave' }));

        const discoveryDecision = useCase.execute({ role: RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY });
        const contentDecision = useCase.execute({ role: RoleProviderRole.CONTENT });
        const proofDecision = useCase.execute({ role: RoleProviderRole.PROOF_AND_ANCHORING });

        assert(discoveryDecision.status === RESOLVED, 'H1. Discovery\'s own configured preference resolves');
        assert(contentDecision.status === NO_PREFERENCE && contentDecision.preference === null, 'H2. Content remains NO_PREFERENCE — Discovery\'s preference never leaks into it');
        assert(proofDecision.status === NO_PREFERENCE && proofDecision.preference === null, 'H3. Proof remains NO_PREFERENCE — Discovery\'s preference never leaks into it either');
        console.log('✓ Section H: a preference configured for one role has no effect whatsoever on any other role\'s own decision');
    }

    // ===============================================================
    // Section I — same provider key, different roles: "arweave" resolved
    // independently across all three roles through this one seam.
    // ===============================================================
    {
        const store = makePreferenceStore();
        const services = composeDecentralizedWorldEncounterMaterialDiscoveryServices({ arweaveFetchImpl: neverCalled });
        const contentRegistry = new SnapshotPlacementStoreRegistry();
        contentRegistry.register(new ArweaveContentStore({ signer: fakeSigner, fetchImpl: neverCalled })); // self-identifies as 'ar', never 'arweave'
        const proofRegistry = new ExternalProofVerifierRegistry(); // no Arweave proof capability exists anywhere
        const { useCase } = makeUseCase({ preferenceStore: store, discoveryRegistry: discoveryRegistryFrom(services), contentRegistry, proofRegistry });

        store.save(new RoleProviderPreference({ role: RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY, providerKey: 'arweave' }));
        store.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'arweave' }));
        store.save(new RoleProviderPreference({ role: RoleProviderRole.PROOF_AND_ANCHORING, providerKey: 'arweave' }));

        const discoveryDecision = useCase.execute({ role: RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY });
        const contentDecision = useCase.execute({ role: RoleProviderRole.CONTENT });
        const proofDecision = useCase.execute({ role: RoleProviderRole.PROOF_AND_ANCHORING });

        assert(discoveryDecision.status === RESOLVED && discoveryDecision.provider === services.arweave, 'I1. Discovery + "arweave" resolves — the real ArweaveGraphqlDiscoveryQueryService');
        assert(contentDecision.status === PROVIDER_NOT_FOUND, 'I2. Content + "arweave" does not resolve — ArweaveContentStore self-identifies as "ar"');
        assert(proofDecision.status === PROVIDER_NOT_FOUND, 'I3. Proof + "arweave" does not resolve — Arweave has no Proof capability');
        assert(discoveryDecision.preference.providerKey === contentDecision.preference.providerKey && contentDecision.preference.providerKey === proofDecision.preference.providerKey, 'I4. all three roles were genuinely configured with the identical providerKey string');
        console.log('✓ Section I: the identical providerKey "arweave" produces three genuinely independent, role-specific decisions through this one seam');
    }

    // ===============================================================
    // Section J — no construction: this file never imports or
    // instantiates a concrete provider, and never reaches into content/,
    // anchoring/, discovery/, nostr/, arweave/, base/, or ui/.
    // ===============================================================
    {
        const useCaseSource = await source('application/ResolvePreferredRoleProviderUseCase.js');
        assert(!/\bnew\s+(Nostr|Arweave|Ipfs|Bitcoin|Base)\w*\(/.test(useCaseSource), 'J1. this class never constructs a concrete provider itself');
        const forbiddenImportPattern = /^import\b[^\n]*from\s*['"][^'"]*(nostr|arweave|ipfs|bitcoin|anchoring|content\/|discovery\/|base\/|ui\/)[^'"]*['"]/im;
        assert(!forbiddenImportPattern.test(useCaseSource), 'J2. no provider implementation, no content/anchoring/discovery module, and no ui/ module is ever imported');
        console.log('✓ Section J: no construction, and no forbidden import, anywhere in this file\'s own source');
    }

    // ===============================================================
    // Section K — runtime integration, as of 0.9.299 (Content Creation
    // Provider Preference Integration): exactly the two files that
    // integration adds — application/
    // PreferredSnapshotPlacementCreationCoordinator.js and its own
    // composition root, application/
    // CreatePreferredSnapshotPlacementCreationCoordinatorUseCase.js — now
    // mention this class, and no other production file does. An unknown
    // role is still a programming error, never a decision outcome.
    // ===============================================================
    {
        const allProductionFiles = await repoWideProductionFiles();
        const KNOWN_FILES = new Set([
            'application/ResolvePreferredRoleProviderUseCase.js',
            'application/PreferredSnapshotPlacementCreationCoordinator.js',
            'application/CreatePreferredSnapshotPlacementCreationCoordinatorUseCase.js'
        ]);
        let hits = 0;
        const hitFiles = [];
        for (const file of allProductionFiles) {
            const text = await source(file);
            if (/ResolvePreferredRoleProviderUseCase/.test(text)) {
                hits += 1;
                hitFiles.push(file);
            }
        }
        assert(hits === KNOWN_FILES.size && hitFiles.every((file) => KNOWN_FILES.has(file)),
            `K1. only the 0.9.299 Content creation seam and this class's own file mention it in production source (found ${hits}: ${hitFiles.join(', ')}) — no OTHER composition root, use case, or ui/ view wires it in`);

        const store = makePreferenceStore();
        const { useCase } = makeUseCase({ preferenceStore: store });
        expectThrows(() => useCase.execute({ role: 'NETWORK' }), 'K2. an unknown role throws — a programming error, never a resolution outcome');
        expectThrows(() => useCase.execute({}), 'K3. a missing role throws too');
        console.log('✓ Section K: this class is a real, tested capability, consumed today by exactly the one 0.9.299 Content creation integration — every other production runtime path is unchanged by this milestone');
    }

    console.log('\n✅ All Role Provider Preference Application Boundary tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
