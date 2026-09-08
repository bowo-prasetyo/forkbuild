import { RoleProviderRole } from '../core/RoleProviderRole.js';
import { RoleProviderPreference } from '../core/RoleProviderPreference.js';
import { RoleProviderPreferenceStore } from '../storage/RoleProviderPreferenceStore.js';
import { RoleAwareProviderResolver, RoleProviderResolutionStatus } from '../application/RoleAwareProviderResolver.js';
import { ResolvePreferredRoleProviderUseCase } from '../application/ResolvePreferredRoleProviderUseCase.js';
import { SetRoleProviderPreferenceUseCase } from '../application/SetRoleProviderPreferenceUseCase.js';
import { describeRoleProviderPreferenceSettings } from '../application/RoleProviderPreferenceSettingsView.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/LocalPublicationSnapshotPlacementCatalog.js';
import { PublicationResolver } from '../application/PublicationResolver.js';
import { PublicationCatalogDiscoveryProvider } from '../discovery/PublicationCatalogDiscoveryProvider.js';
import { PublicationCatalogContentResolver } from '../discovery/PublicationCatalogContentResolver.js';
import { CreateSnapshotPlacementOrchestratorUseCase } from '../application/CreateSnapshotPlacementOrchestratorUseCase.js';
import { CreateSnapshotPlacementCreationCoordinatorUseCase } from '../application/CreateSnapshotPlacementCreationCoordinatorUseCase.js';
import { CreatePreferredSnapshotPlacementCreationCoordinatorUseCase } from '../application/CreatePreferredSnapshotPlacementCreationCoordinatorUseCase.js';
import { SnapshotPlacementCreationOutcome } from '../application/SnapshotPlacementCreationOutcome.js';
import { IpfsContentStore } from '../content/IpfsContentStore.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { readFile } from 'node:fs/promises';

// 0.9.302 — Content Provider Preference Settings Entry Point.
//
// 0.9.293-0.9.297 built the full preference chain and 0.9.299/0.9.301 gave
// it its first real CONSUMER ("Use Preferred Provider" in the Publication
// Center). Every one of those milestones' own tests wrote the preference
// they exercised directly through RoleProviderPreferenceStore.save() — no
// UI, no application-layer write capability, ever called that method. This
// suite proves the missing other half: an ordinary product path to CREATE
// or CHANGE the persisted CONTENT preference, end to end.
//
//   Section 0 — the settings entry point is actually reachable (nav link,
//               route, composition-root wiring — never inferred from
//               source alone; Section E below also proves it functionally).
//   Section A — existing preference display: no preference, saved local,
//               saved ipfs.
//   Section B — save: selecting Local/IPFS actually persists CONTENT.
//   Section C — replacement: Local -> IPFS and back replaces, never
//               accumulates a second entry.
//   Section D — restart: a brand new store/use-case pair, over the SAME
//               underlying storage, observes what an earlier instance saved.
//   Section E — consumer convergence: setting IPFS and then using "Use
//               Preferred Provider" actually executes the IPFS content
//               store — proves the settings UI isn't merely writing data
//               that happens to look correct.
//   Section F — role isolation: saving CONTENT never touches Discovery or
//               Proof & Anchoring.
//   Section G — an unregistered-but-well-formed provider is still savable
//               (no health check here) and resolves to PROVIDER_NOT_FOUND
//               exactly like every other unresolvable preference already
//               does; a genuinely malformed provider key is still refused,
//               by RoleProviderPreference's own pre-existing rule, never a
//               new one this milestone invents.
//   Section H — existing explicit Local/IPFS placement buttons are
//               completely unaffected by a saved preference.
//
// See application/SetRoleProviderPreferenceUseCase.js, application/
// RoleProviderPreferenceSettingsView.js, and ui/views/
// ContentProviderSettingsView.js for the full design rationale this
// milestone carries out.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    assert(threw, message);
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

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

// A tiny in-memory stand-in for a Kubo node's HTTP RPC API — the identical
// technique tests/PreferredContentProviderPlacementTrigger.test.js already
// established.
function fakeCid(text) {
    return 'bafyFAKE' + computeContentHash(text);
}

function makeFakeIpfsNode({ network = new Map(), failAdd = false } = {}) {
    async function fetchImpl(url, options) {
        const parsed = new URL(url);
        if (parsed.pathname === '/api/v0/add') {
            if (failAdd) return new Response('internal error', { status: 500 });
            const blob = options.body.get('file');
            const text = await blob.text();
            const cid = fakeCid(text);
            network.set(cid, text);
            return new Response(JSON.stringify({ Hash: cid, Size: String(text.length) }), { status: 200 });
        }
        if (parsed.pathname === '/api/v0/cat') {
            const cid = parsed.searchParams.get('arg');
            if (!network.has(cid)) return new Response('block not found locally', { status: 500 });
            return new Response(network.get(cid), { status: 200 });
        }
        return new Response('not found', { status: 404 });
    }
    return { network, fetchImpl };
}

// Mirrors the real ui/main.js composition root exactly — the SAME
// SnapshotPlacementCreationCoordinator/registry wrapped by the SAME
// PreferredSnapshotPlacementCreationCoordinator, and the SAME
// RoleProviderPreferenceStore instance a settings entry point would be
// wired against — never a disconnected stand-in.
function makePublicationCenter({ stores = [], identityProvider = makeIdentity('Alice'), preferenceStore = new RoleProviderPreferenceStore(new InMemoryStorageProvider()) } = {}) {
    const publicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
    const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
    const publicationContentStore = new LocalContentStore(new InMemoryStorageProvider());
    const publicationResolver = new PublicationResolver(publicationContentStore, new LocalAuthorizationVerifier());

    const discoveryProvider = new PublicationCatalogDiscoveryProvider(publicationCatalog);
    const contentResolver = new PublicationCatalogContentResolver(publicationCatalog, publicationContentStore);

    const { createExternalSnapshotPlacementUseCase, storeRegistry } = new CreateSnapshotPlacementOrchestratorUseCase().execute({
        discoveryProvider, contentResolver, placementCatalog, identityProvider, stores
    });
    const { coordinator: creationCoordinator } = new CreateSnapshotPlacementCreationCoordinatorUseCase().execute({
        createExternalSnapshotPlacementUseCase, storeRegistry
    });
    const {
        coordinator: preferredCreationCoordinator,
        resolvePreferredRoleProviderUseCase
    } = new CreatePreferredSnapshotPlacementCreationCoordinatorUseCase().execute({
        snapshotPlacementCreationCoordinator: creationCoordinator,
        contentRegistry: storeRegistry,
        preferenceStore
    });
    const setRoleProviderPreferenceUseCase = new SetRoleProviderPreferenceUseCase({ preferenceStore });

    return {
        publicationCatalog, placementCatalog, publicationContentStore, publicationResolver,
        identityProvider, creationCoordinator, preferredCreationCoordinator, resolvePreferredRoleProviderUseCase,
        storeRegistry, preferenceStore, setRoleProviderPreferenceUseCase
    };
}

async function publishLocally(publicationResolver, publicationCatalog, identityProvider, content) {
    const publication = await publicationResolver.publish({
        content, contentKind: 'forkbuild.structure', identityProvider
    });
    publicationCatalog.add(publication);
    return publication;
}

async function run() {
    // ===============================================================
    // Section 0 — settings entry point reachability.
    // ===============================================================
    {
        const mainSource = await source('ui/main.js');
        assert(/preferenceStore:\s*roleProviderPreferenceStore/.test(mainSource),
            '1. ui/main.js shares the SAME RoleProviderPreferenceStore instance the "Use Preferred Provider" wiring already resolves through, never a second disconnected store');
        assert(/new SetRoleProviderPreferenceUseCase\(\{\s*preferenceStore:\s*roleProviderPreferenceStore\s*\}\)/.test(mainSource),
            '2. ui/main.js wires SetRoleProviderPreferenceUseCase against that SAME shared store');
        assert(/app\.provide\('roleProviderPreferenceStore',\s*roleProviderPreferenceStore\)/.test(mainSource),
            '3. the shared store is actually provided to the Vue app, not just constructed and discarded');
        assert(/app\.provide\('setRoleProviderPreferenceUseCase',\s*setRoleProviderPreferenceUseCase\)/.test(mainSource),
            '4. the write use case is actually provided to the Vue app');

        const routerSource = await source('ui/router/index.js');
        assert(/path:\s*'\/settings\/content-provider'/.test(routerSource),
            '5. a real route exists for the settings entry point');

        const appSource = await source('ui/App.js');
        assert(/router-link to="\/settings\/content-provider"/.test(appSource),
            '6. a real top-nav link reaches the settings entry point — the same reachability gap 0.9.300 named for the CONSUMING side is not repeated on the ESTABLISHING side');

        const viewSource = await source('ui/views/ContentProviderSettingsView.js');
        assert(/inject\('roleProviderPreferenceStore',\s*null\)/.test(viewSource),
            '7. the view reads the preference through the injected store, never a store it constructs itself');
        assert(/inject\('setRoleProviderPreferenceUseCase',\s*null\)/.test(viewSource),
            '8. the view writes the preference through the injected use case, never RoleProviderPreferenceStore.save() directly');
        assert(!/from '..\/..\/core\/RoleProviderPreference\.js'/.test(viewSource),
            '9. the view never even imports RoleProviderPreference, let alone constructs one itself — see this milestone\'s own architectural rule');
        assert(!/inject\('snapshotPlacementCreationCoordinator'/.test(viewSource),
            '10. the view never touches the EXPLICIT placement coordinator — saving a preference here can never be confused with an explicit Local/IPFS placement action');
    }
    console.log('✓ Section 0: the settings entry point is really wired — nav link, route, shared store, and a view that only ever goes through the injected collaborators');

    // ===============================================================
    // Section A — existing preference display.
    // ===============================================================
    {
        const store = new RoleProviderPreferenceStore(new InMemoryStorageProvider());

        // A1. Nothing saved yet -> no selected provider.
        let settings = describeRoleProviderPreferenceSettings({
            role: RoleProviderRole.CONTENT,
            availableProviderKeys: ['local', 'ipfs'],
            preference: store.get(RoleProviderRole.CONTENT)
        });
        assert(settings.selectedProviderKey === null, '11. no preference on file -> no provider is pre-selected');
        assert(settings.options.every((o) => !o.selected), '12. no preference on file -> no option renders as selected');

        // A2. Saved local -> Local selected.
        store.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'local' }));
        settings = describeRoleProviderPreferenceSettings({
            role: RoleProviderRole.CONTENT,
            availableProviderKeys: ['local', 'ipfs'],
            preference: store.get(RoleProviderRole.CONTENT)
        });
        assert(settings.selectedProviderKey === 'local', '13. a saved "local" preference is reflected as the selected provider');
        assert(settings.options.find((o) => o.providerKey === 'local').selected === true,
            '14. the Local option itself renders selected');
        assert(settings.options.find((o) => o.providerKey === 'ipfs').selected === false,
            '15. the IPFS option does not also render selected');

        // A3. Saved ipfs -> IPFS selected.
        store.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'ipfs' }));
        settings = describeRoleProviderPreferenceSettings({
            role: RoleProviderRole.CONTENT,
            availableProviderKeys: ['local', 'ipfs'],
            preference: store.get(RoleProviderRole.CONTENT)
        });
        assert(settings.selectedProviderKey === 'ipfs', '16. a saved "ipfs" preference is reflected as the selected provider');
        assert(settings.options.find((o) => o.providerKey === 'ipfs').selected === true,
            '17. the IPFS option itself renders selected');
        assert(settings.options.find((o) => o.providerKey === 'local').selected === false,
            '18. the Local option no longer renders selected');
    }
    console.log('✓ Section A: existing preference display (none/local/ipfs) is correct');

    // ===============================================================
    // Section B — save.
    // ===============================================================
    {
        const store = new RoleProviderPreferenceStore(new InMemoryStorageProvider());
        const setUseCase = new SetRoleProviderPreferenceUseCase({ preferenceStore: store });

        const savedLocal = setUseCase.execute({ role: RoleProviderRole.CONTENT, providerKey: 'local' });
        assert(savedLocal instanceof RoleProviderPreference && savedLocal.providerKey === 'local',
            '19. execute() returns the persisted RoleProviderPreference for "local"');
        assert(store.get(RoleProviderRole.CONTENT).providerKey === 'local',
            '20. selecting Local actually persists CONTENT -> local');

        const store2 = new RoleProviderPreferenceStore(new InMemoryStorageProvider());
        const setUseCase2 = new SetRoleProviderPreferenceUseCase({ preferenceStore: store2 });
        const savedIpfs = setUseCase2.execute({ role: RoleProviderRole.CONTENT, providerKey: 'ipfs' });
        assert(savedIpfs.providerKey === 'ipfs', '21. execute() returns the persisted RoleProviderPreference for "ipfs"');
        assert(store2.get(RoleProviderRole.CONTENT).providerKey === 'ipfs',
            '22. selecting IPFS actually persists CONTENT -> ipfs');
    }
    console.log('✓ Section B: selecting Local/IPFS actually persists CONTENT -> local/ipfs');

    // ===============================================================
    // Section C — replacement.
    // ===============================================================
    {
        const store = new RoleProviderPreferenceStore(new InMemoryStorageProvider());
        const setUseCase = new SetRoleProviderPreferenceUseCase({ preferenceStore: store });

        setUseCase.execute({ role: RoleProviderRole.CONTENT, providerKey: 'local' });
        setUseCase.execute({ role: RoleProviderRole.CONTENT, providerKey: 'ipfs' });
        assert(store.get(RoleProviderRole.CONTENT).providerKey === 'ipfs',
            '23. Local -> IPFS replaces the preference, never leaves Local also on file');
        assert(store.loadAll().filter((p) => p.role === RoleProviderRole.CONTENT).length === 1,
            '24. exactly one CONTENT entry exists after replacement, never two');

        setUseCase.execute({ role: RoleProviderRole.CONTENT, providerKey: 'local' });
        assert(store.get(RoleProviderRole.CONTENT).providerKey === 'local',
            '25. IPFS -> Local replaces it right back');
        assert(store.loadAll().filter((p) => p.role === RoleProviderRole.CONTENT).length === 1,
            '26. still exactly one CONTENT entry after replacing back');
    }
    console.log('✓ Section C: Local <-> IPFS replacement never accumulates a second CONTENT entry');

    // ===============================================================
    // Section D — restart: newly constructed objects observe what an
    // earlier instance persisted.
    // ===============================================================
    {
        const underlyingStorage = new InMemoryStorageProvider();

        // "Before restart" — one settings/application object graph.
        const storeBeforeRestart = new RoleProviderPreferenceStore(underlyingStorage);
        const setUseCaseBeforeRestart = new SetRoleProviderPreferenceUseCase({ preferenceStore: storeBeforeRestart });
        setUseCaseBeforeRestart.execute({ role: RoleProviderRole.CONTENT, providerKey: 'ipfs' });

        // "After restart" — brand new instances, over the SAME underlying
        // storage (exactly what a fresh page load / a fresh
        // RoleProviderPreferenceStore(new LocalStorageProvider()) in
        // ui/main.js would be) — never the same object reused.
        const storeAfterRestart = new RoleProviderPreferenceStore(underlyingStorage);
        assert(storeAfterRestart !== storeBeforeRestart, '27. this really is a newly constructed store, not the same instance');
        const settingsAfterRestart = describeRoleProviderPreferenceSettings({
            role: RoleProviderRole.CONTENT,
            availableProviderKeys: ['local', 'ipfs'],
            preference: storeAfterRestart.get(RoleProviderRole.CONTENT)
        });
        assert(settingsAfterRestart.selectedProviderKey === 'ipfs',
            '28. a newly constructed store observes the preference an earlier instance persisted');

        const setUseCaseAfterRestart = new SetRoleProviderPreferenceUseCase({ preferenceStore: storeAfterRestart });
        assert(setUseCaseAfterRestart !== setUseCaseBeforeRestart, '29. this really is a newly constructed use case, not the same instance');
        setUseCaseAfterRestart.execute({ role: RoleProviderRole.CONTENT, providerKey: 'local' });
        assert(storeBeforeRestart.get(RoleProviderRole.CONTENT).providerKey === 'local',
            '30. a write through the newly constructed use case is visible back through the ORIGINAL store instance too — both are backed by the same underlying storage, never divergent in-memory state');
    }
    console.log('✓ Section D: newly constructed settings/application objects observe (and can further change) an earlier instance\'s persisted preference');

    // ===============================================================
    // Section E — consumer convergence: setting IPFS actually decides
    // what "Use Preferred Provider" executes against.
    // ===============================================================
    {
        const net = makeFakeIpfsNode();
        const ipfs = new IpfsContentStore({ apiUrl: 'http://node.test:5001', fetchImpl: net.fetchImpl });
        const localStore = new LocalContentStore(new InMemoryStorageProvider());
        const { publicationCatalog, publicationResolver, identityProvider, preferredCreationCoordinator, setRoleProviderPreferenceUseCase, resolvePreferredRoleProviderUseCase } =
            makePublicationCenter({ stores: [ipfs, localStore] });

        // Nothing configured yet — the pre-existing "storage is required"
        // refusal, completely unaffected by this milestone.
        const publicationBefore = await publishLocally(publicationResolver, publicationCatalog, identityProvider, { doc: 'convergence-before' });
        let threw = false;
        try { await preferredCreationCoordinator.create(publicationBefore.id); } catch (e) { threw = true; }
        assert(threw, '31. with no CONTENT preference saved yet, "Use Preferred Provider" still refuses exactly as before this milestone');

        // The settings entry point's own write capability — never
        // RoleProviderPreferenceStore.save() called directly here.
        setRoleProviderPreferenceUseCase.execute({ role: RoleProviderRole.CONTENT, providerKey: 'ipfs' });

        const publication = await publishLocally(publicationResolver, publicationCatalog, identityProvider, { doc: 'convergence-ipfs' });
        const result = await preferredCreationCoordinator.create(publication.id);
        assert(result.outcome === SnapshotPlacementCreationOutcome.CREATED && result.placement.storage === 'ipfs',
            '32. after saving CONTENT -> ipfs through the settings entry point, "Use Preferred Provider" actually places onto ipfs');
        assert(net.network.has(result.placement.locator.replace('ipfs://', '')),
            '33. the IPFS content store really executed put() — the placed CID is really present in the (fake) IPFS network, never a fabricated result');

        // A second, independent write through the SAME use case — local
        // resolves to the real, registered local store too (a full
        // placement onto "local" is out of scope here — content/
        // LocalContentStore.js#put() never sets a locator, a pre-existing,
        // unrelated limitation every other suite in this codebase also
        // avoids — RESOLUTION is what this milestone's own settings write
        // needs to prove converges, and it does).
        setRoleProviderPreferenceUseCase.execute({ role: RoleProviderRole.CONTENT, providerKey: 'local' });
        const decision = resolvePreferredRoleProviderUseCase.execute({ role: RoleProviderRole.CONTENT });
        assert(decision.status === RoleProviderResolutionStatus.RESOLVED && decision.providerKey === 'local',
            '34. after saving CONTENT -> local through the settings entry point, resolution really converges on the real, registered local store');
    }
    console.log('✓ Section E: the settings entry point is not merely writing data that happens to look correct — it actually decides what the preference-consuming trigger executes');

    // ===============================================================
    // Section F — role isolation.
    // ===============================================================
    {
        const store = new RoleProviderPreferenceStore(new InMemoryStorageProvider());
        const setUseCase = new SetRoleProviderPreferenceUseCase({ preferenceStore: store });

        store.save(new RoleProviderPreference({ role: RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY, providerKey: 'nostr' }));
        store.save(new RoleProviderPreference({ role: RoleProviderRole.PROOF_AND_ANCHORING, providerKey: 'bitcoin-op-return' }));

        setUseCase.execute({ role: RoleProviderRole.CONTENT, providerKey: 'ipfs' });

        assert(store.get(RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY).providerKey === 'nostr',
            '35. saving CONTENT never touches the existing Discovery preference');
        assert(store.get(RoleProviderRole.PROOF_AND_ANCHORING).providerKey === 'bitcoin-op-return',
            '36. saving CONTENT never touches the existing Proof & Anchoring preference');

        setUseCase.execute({ role: RoleProviderRole.CONTENT, providerKey: 'local' });
        assert(store.get(RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY).providerKey === 'nostr',
            '37. REPLACING the CONTENT preference still never touches Discovery');
        assert(store.get(RoleProviderRole.PROOF_AND_ANCHORING).providerKey === 'bitcoin-op-return',
            '38. REPLACING the CONTENT preference still never touches Proof & Anchoring');
    }
    console.log('✓ Section F: saving/replacing CONTENT never affects Discovery or Proof & Anchoring');

    // ===============================================================
    // Section G — invalid/unavailable provider preserves existing
    // preference-boundary semantics; settings is never a health checker.
    // ===============================================================
    {
        // G1. A well-formed providerKey that simply isn't registered on
        // this replica is still perfectly savable — SetRoleProviderPreferenceUseCase
        // has no registry dependency of any kind to even ask the question.
        const net = makeFakeIpfsNode();
        const ipfs = new IpfsContentStore({ apiUrl: 'http://node.test:5001', fetchImpl: net.fetchImpl });
        const { setRoleProviderPreferenceUseCase, resolvePreferredRoleProviderUseCase } = makePublicationCenter({ stores: [ipfs] });

        let saveThrew = false;
        let saved = null;
        try {
            saved = setRoleProviderPreferenceUseCase.execute({ role: RoleProviderRole.CONTENT, providerKey: 'arweave' });
        } catch (e) { saveThrew = true; }
        assert(!saveThrew && saved && saved.providerKey === 'arweave',
            '39. a well-formed but unregistered providerKey ("arweave", no store registered for it here) saves without error — no health check happens at save time');

        const decision = resolvePreferredRoleProviderUseCase.execute({ role: RoleProviderRole.CONTENT });
        assert(decision.status === RoleProviderResolutionStatus.PROVIDER_NOT_FOUND,
            '40. resolving that preference still reports PROVIDER_NOT_FOUND, the identical pre-existing boundary semantics — never a fallback, never silently RESOLVED');

        // G2. A genuinely malformed providerKey is still refused — by
        // RoleProviderPreference's own pre-existing shape rule, never a
        // NEW rule this milestone invents.
        const store = new RoleProviderPreferenceStore(new InMemoryStorageProvider());
        const setUseCase = new SetRoleProviderPreferenceUseCase({ preferenceStore: store });
        await expectThrows(() => setUseCase.execute({ role: RoleProviderRole.CONTENT, providerKey: '' }),
            '41. an empty providerKey is refused, exactly as core/RoleProviderPreference.js already refuses one');
        await expectThrows(() => setUseCase.execute({ role: RoleProviderRole.CONTENT, providerKey: 'Not-Valid' }),
            '42. an uppercase-leading providerKey is refused, exactly as core/RoleProviderPreference.js already refuses one');
        await expectThrows(() => setUseCase.execute({ role: 'NOT_A_REAL_ROLE', providerKey: 'ipfs' }),
            '43. an unknown role is refused');
    }
    console.log('✓ Section G: an unregistered-but-well-formed provider is savable with no health check; a genuinely malformed one is still refused by the pre-existing rule');

    // ===============================================================
    // Section H — existing explicit Local/IPFS placement is unaffected.
    // ===============================================================
    {
        const net = makeFakeIpfsNode();
        const ipfs = new IpfsContentStore({ apiUrl: 'http://node.test:5001', fetchImpl: net.fetchImpl });
        const { publicationCatalog, publicationResolver, identityProvider, creationCoordinator, setRoleProviderPreferenceUseCase } =
            makePublicationCenter({ stores: [ipfs] });

        // Save a CONTENT preference for a DIFFERENT provider than the one
        // about to be explicitly requested.
        setRoleProviderPreferenceUseCase.execute({ role: RoleProviderRole.CONTENT, providerKey: 'local' });

        const publication = await publishLocally(publicationResolver, publicationCatalog, identityProvider, { doc: 'explicit-unaffected' });
        const result = await creationCoordinator.create(publication.id, 'ipfs');
        assert(result.outcome === SnapshotPlacementCreationOutcome.CREATED && result.placement.storage === 'ipfs',
            '44. the explicit "Create IPFS Placement" button still places onto ipfs, completely ignoring a saved CONTENT -> local preference');

        // And availableStorageTypes() — what gates which explicit buttons
        // even render — is unaffected by a saved preference too.
        assert(creationCoordinator.availableStorageTypes().includes('ipfs'),
            '45. availableStorageTypes() is unaffected by the saved preference');
    }
    console.log('✓ Section H: existing explicit Local/IPFS placement buttons are completely unaffected by a saved preference');

    console.log('\nAll Content Provider Preference Settings Entry Point tests passed.');
}

run().catch((error) => {
    console.error('ContentProviderPreferenceSettingsEntryPoint.test.js FAILED:', error);
    process.exitCode = 1;
});
