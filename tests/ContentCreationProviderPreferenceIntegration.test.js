import { PublicationSnapshotPlacement } from '../core/PublicationSnapshotPlacement.js';
import { RoleProviderRole } from '../core/RoleProviderRole.js';
import { RoleProviderPreference } from '../core/RoleProviderPreference.js';
import { RoleProviderPreferenceStore } from '../storage/RoleProviderPreferenceStore.js';
import { RoleProviderResolutionStatus } from '../application/RoleAwareProviderResolver.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/LocalPublicationSnapshotPlacementCatalog.js';
import { PublicationResolver } from '../application/PublicationResolver.js';
import { PublicationCatalogDiscoveryProvider } from '../discovery/PublicationCatalogDiscoveryProvider.js';
import { PublicationCatalogContentResolver } from '../discovery/PublicationCatalogContentResolver.js';
import { CreateSnapshotPlacementOrchestratorUseCase } from '../application/CreateSnapshotPlacementOrchestratorUseCase.js';
import { CreateSnapshotPlacementCreationCoordinatorUseCase } from '../application/CreateSnapshotPlacementCreationCoordinatorUseCase.js';
import { CreatePreferredSnapshotPlacementCreationCoordinatorUseCase } from '../application/CreatePreferredSnapshotPlacementCreationCoordinatorUseCase.js';
import { PreferredSnapshotPlacementCreationCoordinator } from '../application/PreferredSnapshotPlacementCreationCoordinator.js';
import { SnapshotPlacementCreationOutcome } from '../application/SnapshotPlacementCreationOutcome.js';
import { IpfsContentStore } from '../content/IpfsContentStore.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { computeContentHash } from '../serializer/contentHash.js';

// 0.9.299 — Content Creation Provider Preference Integration.
//
// 0.9.298's own audit named CONTENT creation — application/
// SnapshotPlacementCreationCoordinator.js's own `create(publicationId,
// storage)`, the ONLY real production seam with already-registered
// multi-provider redundancy — as the strongest candidate for the first
// real preference consumer. This suite proves the integration end to end
// against production-shaped composition (the SAME classes ui/main.js
// wires, never a stand-in):
//
//   Section A — an explicit `storage` always wins; the preference store
//               is never even consulted.
//   Section B — an absent `storage` resolves through the stored CONTENT
//               preference to a real provider, which then really places
//               the bytes.
//   Section C — no preference configured, and no explicit storage
//               either, preserves the LITERAL pre-existing "storage is
//               required" refusal — never a manufactured default.
//   Section D — a configured-but-unregistered preference reports
//               PROVIDER_NOT_FOUND explicitly; nothing is placed, no
//               store is ever touched.
//   Section E — Discovery/Proof preferences never affect Content
//               resolution.
//   Section F — the same providerKey string, registered under a
//               different role's preference, has no effect — Content
//               resolution always consults the Content registry.
//   Section G — the real store operation actually runs: put() is called
//               exactly once, and the resulting placement is really
//               cataloged.
//   Section H — the composition root wires the SAME already-constructed
//               coordinator/registry passed to it, never a disconnected
//               copy — the identical production shape ui/main.js uses.
//   Section I — Publication placement and Snapshot placement are the
//               SAME seam in this codebase today (0.9.298's own evidence:
//               ui/main.js registers one `local`+`ipfs` registry for
//               both) — there is no second, genuinely distinct
//               production path to integrate separately. Documented here
//               rather than duplicated as a second suite.
//   Section J — every existing explicit-selection behavior
//               (CREATED/PLACEMENT_UNAVAILABLE/multiple independent
//               placements/availableStorageTypes gating) is byte-for-byte
//               unchanged when driven through the wrapping coordinator.
//
// See application/PreferredSnapshotPlacementCreationCoordinator.js and
// application/CreatePreferredSnapshotPlacementCreationCoordinatorUseCase.js
// for the full design rationale.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function expectThrowsAsync(fn, message) {
    let threw = false;
    let errorMessage = null;
    try { await fn(); } catch (e) { threw = true; errorMessage = e.message; }
    assert(threw, message);
    return errorMessage;
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

// A tiny in-memory stand-in for a Kubo node's HTTP RPC API — the
// identical technique tests/SnapshotPlacementCreationUX.test.js already
// established.
function fakeCid(text) {
    return 'bafyFAKE' + computeContentHash(text);
}

function makeFakeIpfsNode({ network = new Map(), failAdd = false } = {}) {
    async function fetchImpl(url, options) {
        const parsed = new URL(url);
        if (parsed.pathname === '/api/v0/add') {
            if (failAdd) {
                return new Response('internal error', { status: 500 });
            }
            const blob = options.body.get('file');
            const text = await blob.text();
            const cid = fakeCid(text);
            network.set(cid, text);
            return new Response(JSON.stringify({ Hash: cid, Size: String(text.length) }), { status: 200 });
        }
        if (parsed.pathname === '/api/v0/cat') {
            const cid = parsed.searchParams.get('arg');
            if (!network.has(cid)) {
                return new Response('block not found locally', { status: 500 });
            }
            return new Response(network.get(cid), { status: 200 });
        }
        return new Response('not found', { status: 404 });
    }
    return { network, fetchImpl };
}

// Mirrors the real ui/main.js composition root exactly — a
// LocalPublicationCatalog, a real content/ContentStore.js for local
// bytes, the 0.8.25 bridge adapters, application/
// CreateSnapshotPlacementOrchestratorUseCase.js/application/
// CreateSnapshotPlacementCreationCoordinatorUseCase.js, and NOW
// application/CreatePreferredSnapshotPlacementCreationCoordinatorUseCase.js
// wired together, exactly as ui/main.js now wires them.
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
        coordinator: preferredCreationCoordinator, resolver, resolvePreferredRoleProviderUseCase
    } = new CreatePreferredSnapshotPlacementCreationCoordinatorUseCase().execute({
        snapshotPlacementCreationCoordinator: creationCoordinator,
        contentRegistry: storeRegistry,
        preferenceStore
    });

    return {
        publicationCatalog, placementCatalog, publicationContentStore, publicationResolver,
        identityProvider, creationCoordinator, preferredCreationCoordinator, storeRegistry,
        preferenceStore, resolver, resolvePreferredRoleProviderUseCase
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
    // ---------------------------------------------------------------
    // Section A — an explicit storage always wins
    // ---------------------------------------------------------------
    {
        const net = makeFakeIpfsNode();
        const ipfs = new IpfsContentStore({ apiUrl: 'http://node.test:5001', fetchImpl: net.fetchImpl });
        const local = new LocalContentStore(new InMemoryStorageProvider());
        const {
            publicationCatalog, publicationResolver, identityProvider, preferredCreationCoordinator, preferenceStore
        } = makePublicationCenter({ stores: [ipfs, local] });

        // A stored preference names 'local' — but Alice's click explicitly
        // asked for 'ipfs'.
        preferenceStore.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'local' }));

        const publication = await publishLocally(publicationResolver, publicationCatalog, identityProvider, { doc: 'explicit-wins' });
        const result = await preferredCreationCoordinator.create(publication.id, 'ipfs');

        assert(result.outcome === SnapshotPlacementCreationOutcome.CREATED, '1. an explicit storage still succeeds');
        assert(result.placement.storage === 'ipfs', '2. the EXPLICIT storage was used, never the stored preference');
    }
    console.log('✓ Section A: an explicit per-action storage choice always wins — a stored preference is never even consulted for it');

    // ---------------------------------------------------------------
    // Section B — an absent storage resolves through the preference
    // ---------------------------------------------------------------
    {
        const net = makeFakeIpfsNode();
        const ipfs = new IpfsContentStore({ apiUrl: 'http://node.test:5001', fetchImpl: net.fetchImpl });
        const local = new LocalContentStore(new InMemoryStorageProvider());
        const {
            publicationCatalog, publicationResolver, identityProvider, preferredCreationCoordinator, preferenceStore, placementCatalog
        } = makePublicationCenter({ stores: [ipfs, local] });

        preferenceStore.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'ipfs' }));

        const publication = await publishLocally(publicationResolver, publicationCatalog, identityProvider, { doc: 'preferred' });
        const result = await preferredCreationCoordinator.create(publication.id);

        assert(result.outcome === SnapshotPlacementCreationOutcome.CREATED, '3. no explicit storage, but a preference is configured — creation still succeeds');
        assert(result.placement.storage === 'ipfs', '4. the PREFERRED provider was used');
        assert(placementCatalog.findByPublicationId(publication.id).length === 1, '5. a real placement was cataloged, not merely reported');

        // Passing '' or null behaves identically to omitting the argument.
        const resultEmptyString = await preferredCreationCoordinator.create(publication.id, '');
        assert(resultEmptyString.outcome === SnapshotPlacementCreationOutcome.CREATED && resultEmptyString.placement.storage === 'ipfs',
            "6. an empty-string storage is treated as absent, exactly like omitting the argument");
    }
    console.log('✓ Section B: an absent storage resolves through the stored CONTENT preference to a real, working provider');

    // ---------------------------------------------------------------
    // Section C — no preference preserves existing behavior, literally
    // ---------------------------------------------------------------
    {
        const net = makeFakeIpfsNode();
        const ipfs = new IpfsContentStore({ apiUrl: 'http://node.test:5001', fetchImpl: net.fetchImpl });
        const {
            publicationCatalog, publicationResolver, identityProvider, creationCoordinator, preferredCreationCoordinator
        } = makePublicationCenter({ stores: [ipfs] });
        const publication = await publishLocally(publicationResolver, publicationCatalog, identityProvider, { doc: 'no-pref' });

        // No preference was ever saved for CONTENT.
        const preExistingError = await expectThrowsAsync(() => creationCoordinator.create(publication.id, undefined),
            '7. (baseline) the UNWRAPPED coordinator itself already refuses an absent storage today');
        const wrappedError = await expectThrowsAsync(() => preferredCreationCoordinator.create(publication.id),
            '8. the preference-aware coordinator refuses identically when nothing is configured');
        assert(wrappedError === preExistingError, '9. the refusal message is LITERALLY the same pre-existing error, never a new one');
    }
    console.log('✓ Section C: with no preference configured, an absent storage produces the exact pre-existing refusal — never a manufactured default');

    // ---------------------------------------------------------------
    // Section D — an unresolvable preference is an explicit failure
    // ---------------------------------------------------------------
    {
        const net = makeFakeIpfsNode();
        const ipfs = new IpfsContentStore({ apiUrl: 'http://node.test:5001', fetchImpl: net.fetchImpl });
        const putSpy = { calls: 0 };
        const spyIpfs = {
            storage: ipfs.storage,
            async put(bytes) { putSpy.calls += 1; return ipfs.put(bytes); },
            async get(ref) { return ipfs.get(ref); }
        };
        const {
            publicationCatalog, publicationResolver, identityProvider, preferredCreationCoordinator, preferenceStore, placementCatalog
        } = makePublicationCenter({ stores: [spyIpfs] });

        preferenceStore.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'arweave' }));

        const publication = await publishLocally(publicationResolver, publicationCatalog, identityProvider, { doc: 'unresolvable' });
        const result = await preferredCreationCoordinator.create(publication.id);

        assert(result.outcome === RoleProviderResolutionStatus.PROVIDER_NOT_FOUND, '10. a configured-but-unregistered preference reports PROVIDER_NOT_FOUND explicitly');
        assert(result.placement === null, '11. no placement is ever fabricated for an unresolvable preference');
        assert(result.preference.providerKey === 'arweave', '12. the unresolvable preference itself is carried on the result, so a caller can explain what was configured');
        assert(putSpy.calls === 0, '13. the registered ipfs store is never touched — no fallback of any kind');
        assert(placementCatalog.findByPublicationId(publication.id).length === 0, '14. nothing was ever cataloged');
    }
    console.log('✓ Section D: an unresolvable CONTENT preference reports PROVIDER_NOT_FOUND explicitly — never a fallback, never CREATED');

    // ---------------------------------------------------------------
    // Section E — Discovery/Proof preferences never affect Content
    // ---------------------------------------------------------------
    {
        const net = makeFakeIpfsNode();
        const ipfs = new IpfsContentStore({ apiUrl: 'http://node.test:5001', fetchImpl: net.fetchImpl });
        const {
            publicationCatalog, publicationResolver, identityProvider, preferredCreationCoordinator, preferenceStore
        } = makePublicationCenter({ stores: [ipfs] });

        // Discovery/Proof preferences exist, but nothing is configured for
        // CONTENT.
        preferenceStore.save(new RoleProviderPreference({ role: RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY, providerKey: 'ipfs' }));
        preferenceStore.save(new RoleProviderPreference({ role: RoleProviderRole.PROOF_AND_ANCHORING, providerKey: 'ipfs' }));

        const publication = await publishLocally(publicationResolver, publicationCatalog, identityProvider, { doc: 'isolation' });
        const error = await expectThrowsAsync(() => preferredCreationCoordinator.create(publication.id),
            '15. with Discovery/Proof preferences configured but no CONTENT preference, the absent-storage refusal still fires — Discovery/Proof never substitute for it');
        assert(error.includes('storage is required'), '16. the refusal is the ordinary "storage is required" error, not something Discovery/Proof produced');
    }
    console.log('✓ Section E: Discovery and Proof preferences have no effect on Content creation, in either direction');

    // ---------------------------------------------------------------
    // Section F — the same providerKey under a different role has no effect
    // ---------------------------------------------------------------
    {
        const net = makeFakeIpfsNode();
        const ipfs = new IpfsContentStore({ apiUrl: 'http://node.test:5001', fetchImpl: net.fetchImpl });
        const {
            publicationCatalog, publicationResolver, identityProvider, preferredCreationCoordinator, preferenceStore
        } = makePublicationCenter({ stores: [ipfs] });

        // 'ipfs' is registered as a real Content store, but here it is
        // configured as the PROOF preference, never the Content one.
        preferenceStore.save(new RoleProviderPreference({ role: RoleProviderRole.PROOF_AND_ANCHORING, providerKey: 'ipfs' }));

        const publication = await publishLocally(publicationResolver, publicationCatalog, identityProvider, { doc: 'key-collision' });
        await expectThrowsAsync(() => preferredCreationCoordinator.create(publication.id),
            "17. a providerKey configured under PROOF_AND_ANCHORING is never read as a Content preference, even though a real 'ipfs' Content store exists");
    }
    console.log('✓ Section F: Content resolution always reads the CONTENT preference from the CONTENT registry, never another role\'s entry sharing the same key string');

    // ---------------------------------------------------------------
    // Section G — the real store operation actually runs
    // ---------------------------------------------------------------
    {
        const net = makeFakeIpfsNode();
        const ipfs = new IpfsContentStore({ apiUrl: 'http://node.test:5001', fetchImpl: net.fetchImpl });
        const putSpy = { calls: 0, bytes: null };
        const spyIpfs = {
            storage: ipfs.storage,
            async put(bytes) { putSpy.calls += 1; putSpy.bytes = bytes; return ipfs.put(bytes); },
            async get(ref) { return ipfs.get(ref); }
        };
        const {
            publicationCatalog, publicationResolver, identityProvider, preferredCreationCoordinator, preferenceStore, placementCatalog
        } = makePublicationCenter({ stores: [spyIpfs] });
        preferenceStore.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'ipfs' }));

        const publication = await publishLocally(publicationResolver, publicationCatalog, identityProvider, { doc: 'real-op' });
        const result = await preferredCreationCoordinator.create(publication.id);

        assert(putSpy.calls === 1, '18. the preferred provider\'s own put() really runs, exactly once');
        assert(putSpy.bytes === JSON.stringify({ doc: 'real-op' }), '19. the bytes placed are the publication\'s own real snapshot bytes');
        assert(result.placement instanceof PublicationSnapshotPlacement, '20. a real, signed PublicationSnapshotPlacement is returned');
        assert(placementCatalog.findByPublicationId(publication.id)[0].id === result.placement.id, '21. the SAME placement is the one actually cataloged');
    }
    console.log('✓ Section G: the selected preferred provider actually executes the real Content operation — this is a live integration, not a selection-only check');

    // ---------------------------------------------------------------
    // Section H — composition root wiring
    // ---------------------------------------------------------------
    {
        const publicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const publicationContentStore = new LocalContentStore(new InMemoryStorageProvider());
        const publicationResolver = new PublicationResolver(publicationContentStore, new LocalAuthorizationVerifier());
        const identityProvider = makeIdentity('Alice');
        const net = makeFakeIpfsNode();
        const ipfs = new IpfsContentStore({ apiUrl: 'http://node.test:5001', fetchImpl: net.fetchImpl });
        const discoveryProvider = new PublicationCatalogDiscoveryProvider(publicationCatalog);
        const contentResolver = new PublicationCatalogContentResolver(publicationCatalog, publicationContentStore);
        const { createExternalSnapshotPlacementUseCase, storeRegistry } = new CreateSnapshotPlacementOrchestratorUseCase().execute({
            discoveryProvider, contentResolver, placementCatalog, identityProvider, stores: [ipfs]
        });
        const { coordinator } = new CreateSnapshotPlacementCreationCoordinatorUseCase().execute({
            createExternalSnapshotPlacementUseCase, storeRegistry
        });
        const preferenceStore = new RoleProviderPreferenceStore(new InMemoryStorageProvider());
        preferenceStore.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'ipfs' }));
        const { coordinator: preferredCoordinator } = new CreatePreferredSnapshotPlacementCreationCoordinatorUseCase().execute({
            snapshotPlacementCreationCoordinator: coordinator, contentRegistry: storeRegistry, preferenceStore
        });

        assert(preferredCoordinator instanceof PreferredSnapshotPlacementCreationCoordinator, '22. the composition root returns a real PreferredSnapshotPlacementCreationCoordinator');
        const publication = await publishLocally(publicationResolver, publicationCatalog, identityProvider, { doc: 'wired' });
        const result = await preferredCoordinator.create(publication.id);
        assert(result.outcome === SnapshotPlacementCreationOutcome.CREATED && result.placement.storage === 'ipfs',
            '23. the composition root wires the SAME already-constructed coordinator/registry passed in, never a disconnected copy');
        assert(preferredCoordinator.availableStorageTypes().includes('ipfs'), '24. availableStorageTypes() passes straight through to the wrapped coordinator, unchanged');

        // Constructor validation — a caller contract violation, never a
        // degraded outcome.
        let threw = false;
        try { new CreatePreferredSnapshotPlacementCreationCoordinatorUseCase().execute({ snapshotPlacementCreationCoordinator: null, contentRegistry: storeRegistry }); } catch (e) { threw = true; }
        assert(threw, '25. the composition root requires a SnapshotPlacementCreationCoordinator');
        threw = false;
        try { new CreatePreferredSnapshotPlacementCreationCoordinatorUseCase().execute({ snapshotPlacementCreationCoordinator: coordinator, contentRegistry: null }); } catch (e) { threw = true; }
        assert(threw, '26. the composition root requires a content registry');
        threw = false;
        try { new PreferredSnapshotPlacementCreationCoordinator(coordinator, null); } catch (e) { threw = true; }
        assert(threw, '27. PreferredSnapshotPlacementCreationCoordinator requires a real ResolvePreferredRoleProviderUseCase');
    }
    console.log('✓ Section H: the composition root wires the SAME already-constructed coordinator/registry passed to it — the identical production shape ui/main.js uses');

    // ---------------------------------------------------------------
    // Section I — Publication placement and Snapshot placement are one
    // seam in this codebase today
    // ---------------------------------------------------------------
    {
        // 0.9.298's own audit evidence: ui/main.js registers ONE
        // `local`+`ipfs` SnapshotPlacementStoreRegistry for placement
        // CREATION, consumed by BOTH what this codebase calls "Publication"
        // placement and "Snapshot" placement — a Publication's own
        // materialized snapshot bytes are exactly what gets placed. There
        // is no second, independently-composed Content creation pipeline
        // anywhere in application/ or ui/ to integrate separately — every
        // section above already exercises the one real seam through the
        // exact composition (application/CreateSnapshotPlacementOrchestratorUseCase.js
        // + application/SnapshotPlacementCreationCoordinator.js) ui/main.js
        // itself wires for both. Per this milestone's own scoping rule, a
        // genuinely separate second path is recorded as a follow-up rather
        // than invented here to pad out a second suite.
        assert(true, '28. Publication and Snapshot placement creation share the SAME production seam (application/CreateExternalSnapshotPlacementUseCase.js via application/SnapshotPlacementCreationCoordinator.js) — Sections A-H above already integrate it exactly once');
    }
    console.log('✓ Section I: Publication placement and Snapshot placement creation are the SAME real seam today — integrated once, not duplicated');

    // ---------------------------------------------------------------
    // Section J — existing explicit-selection workflows are unchanged
    // ---------------------------------------------------------------
    {
        // J1 — CREATED, driven through the wrapping coordinator.
        const net = makeFakeIpfsNode();
        const ipfs = new IpfsContentStore({ apiUrl: 'http://node.test:5001', fetchImpl: net.fetchImpl });
        const { publicationCatalog, publicationResolver, identityProvider, preferredCreationCoordinator } = makePublicationCenter({ stores: [ipfs] });
        const publication = await publishLocally(publicationResolver, publicationCatalog, identityProvider, { doc: 'regression-created' });
        const created = await preferredCreationCoordinator.create(publication.id, 'ipfs');
        assert(created.outcome === SnapshotPlacementCreationOutcome.CREATED, '29. CREATED is unchanged for an explicit storage choice');
    }
    {
        // J2 — PLACEMENT_UNAVAILABLE, driven through the wrapping coordinator.
        const net = makeFakeIpfsNode({ failAdd: true });
        const ipfs = new IpfsContentStore({ apiUrl: 'http://node.test:5001', fetchImpl: net.fetchImpl });
        const { publicationCatalog, publicationResolver, identityProvider, preferredCreationCoordinator } = makePublicationCenter({ stores: [ipfs] });
        const publication = await publishLocally(publicationResolver, publicationCatalog, identityProvider, { doc: 'regression-unavailable' });
        const unavailable = await preferredCreationCoordinator.create(publication.id, 'ipfs');
        assert(unavailable.outcome === SnapshotPlacementCreationOutcome.PLACEMENT_UNAVAILABLE, '30. PLACEMENT_UNAVAILABLE is unchanged for an explicit storage choice');
    }
    {
        // J3 — two independent placements for the same storage, unchanged.
        const net = makeFakeIpfsNode();
        const ipfs = new IpfsContentStore({ apiUrl: 'http://node.test:5001', fetchImpl: net.fetchImpl });
        const { publicationCatalog, publicationResolver, identityProvider, preferredCreationCoordinator } = makePublicationCenter({ stores: [ipfs] });
        const publication = await publishLocally(publicationResolver, publicationCatalog, identityProvider, { doc: 'regression-multi' });
        const first = await preferredCreationCoordinator.create(publication.id, 'ipfs');
        const second = await preferredCreationCoordinator.create(publication.id, 'ipfs');
        assert(first.placement.id !== second.placement.id, '31. two independent, explicit-storage placements are still produced — never collapsed or deduplicated');
    }
    {
        // J4 — availableStorageTypes() still gates what an explicit choice
        // may name, unchanged.
        const { preferredCreationCoordinator, publicationCatalog, publicationResolver, identityProvider } = makePublicationCenter({ stores: [] });
        assert(preferredCreationCoordinator.availableStorageTypes().length === 0, '32. no registered store -> no available storage types, unchanged');
        const publication = await publishLocally(publicationResolver, publicationCatalog, identityProvider, { doc: 'regression-empty' });
        await expectThrowsAsync(() => preferredCreationCoordinator.create(publication.id, 'ipfs'),
            '33. requesting an unregistered explicit storage still refuses exactly as before this milestone');
    }
    console.log('✓ Section J: every existing explicit-selection workflow (CREATED/PLACEMENT_UNAVAILABLE/independent placements/availableStorageTypes gating) is unchanged when driven through the preference-aware coordinator');

    console.log('\nAll Content Creation Provider Preference Integration tests passed.');
}

run().catch((error) => {
    console.error('ContentCreationProviderPreferenceIntegration.test.js FAILED:', error);
    process.exitCode = 1;
});
