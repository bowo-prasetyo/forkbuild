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
import { SnapshotPlacementCreationOutcome } from '../application/SnapshotPlacementCreationOutcome.js';
import { SnapshotPlacementCreationUiState } from '../application/SnapshotPlacementCreationUiState.js';
import { describeCreationAttempt } from '../application/SnapshotPlacementCreationView.js';
import { ContentReference } from '../core/ContentReference.js';
import { IpfsContentStore } from '../content/IpfsContentStore.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { readFile } from 'node:fs/promises';

// 0.9.301 — Preferred Content Provider Placement Trigger.
//
// 0.9.300's own reachability audit found a real, working, fully-tested
// preference-aware coordinator (application/
// PreferredSnapshotPlacementCreationCoordinator.js, 0.9.299) with ZERO real
// user-triggered callers, and named the narrowest legitimate fix: one new
// additive action — "Use Preferred Provider" — next to today's per-storage
// buttons in ui/views/DecentralizedPublicationsView.js, under its own
// non-colliding attempt-state key, with describeCreationAttempt() extended
// so PROVIDER_NOT_FOUND renders honestly instead of collapsing to IDLE.
// This suite proves that fix end to end:
//
//   Section A — the new trigger actually reaches the preference-aware
//               coordinator (both from real source, and functionally).
//   Section B — the existing Local/IPFS buttons are completely unchanged.
//   Section C — a configured CONTENT preference actually decides which
//               provider the new trigger places onto.
//   Section D — no preference configured reproduces the LITERAL pre-
//               existing "storage is required" refusal, never an invented
//               default.
//   Section E — an unresolvable preference reports PROVIDER_NOT_FOUND
//               honestly (never silently IDLE, never a fallback) and
//               touches no store at all.
//   Section F — the real store operation actually runs exactly once, and
//               the resulting placement carries the correct bytes.
//   Section G — Discovery and Proof preferences can never reach this
//               trigger.
//   Section H — UI lifecycle: running → success/failure is represented
//               correctly, and a failed preferred attempt never corrupts
//               an explicit Local/IPFS attempt's own state, or vice versa.
//   Section I — regression: every existing explicit-selection workflow is
//               unchanged with the new trigger composed alongside it.
//
// See application/PreferredSnapshotPlacementCreationCoordinator.js,
// application/CreatePreferredSnapshotPlacementCreationCoordinatorUseCase.js,
// and tests/ContentProviderPreferenceReachabilityAudit.test.js for the full
// design rationale this milestone carries out.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
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
// technique tests/SnapshotPlacementCreationUX.test.js and tests/
// ContentCreationProviderPreferenceIntegration.test.js already established.
function fakeCid(text) {
    return 'bafyFAKE' + computeContentHash(text);
}

// A second, genuinely independent, working content-addressed store — 'ar',
// the same storage identity content/ArweaveContentStore.js's own header
// already self-identifies with, minus that class's real signer/gateway
// plumbing (irrelevant here — this suite needs a second real provider
// distinct from 'ipfs', not Arweave's own signing mechanics). Deliberately
// never content/LocalContentStore.js: that class's own put() never sets a
// ContentReference `uri` (see core/ContentReference.js), so a placement
// created onto it always fails core/PublicationSnapshotPlacement.js's own
// "requires a locator" check — a real, pre-existing condition unrelated to,
// and out of scope for, this milestone (this codebase's own existing
// suites, e.g. tests/SnapshotPlacementCreationUX.test.js and tests/
// ContentCreationProviderPreferenceIntegration.test.js, likewise never
// exercise a successful 'local' external placement). 'ipfs' and 'ar' are
// this suite's two genuinely working, distinct CONTENT providers.
class FakeArweaveContentStore {
    constructor() { this._data = new Map(); }
    get storage() { return 'ar'; }
    async put(bytes) {
        const text = typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes);
        const hash = computeContentHash(text);
        this._data.set(hash, text);
        return new ContentReference({
            hash, algorithm: 'fnv1a-32', mediaType: 'application/json', size: text.length,
            storage: 'ar', uri: `ar://${hash}`
        });
    }
    async get(reference) {
        return this._data.has(reference.hash) ? this._data.get(reference.hash) : null;
    }
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

// Mirrors the real ui/main.js composition root exactly — the SAME
// SnapshotPlacementCreationCoordinator/registry wrapped by the SAME
// PreferredSnapshotPlacementCreationCoordinator, never a disconnected
// stand-in.
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
    const { coordinator: preferredCreationCoordinator } = new CreatePreferredSnapshotPlacementCreationCoordinatorUseCase().execute({
        snapshotPlacementCreationCoordinator: creationCoordinator,
        contentRegistry: storeRegistry,
        preferenceStore
    });

    return {
        publicationCatalog, placementCatalog, publicationContentStore, publicationResolver,
        identityProvider, creationCoordinator, preferredCreationCoordinator, storeRegistry, preferenceStore
    };
}

async function publishLocally(publicationResolver, publicationCatalog, identityProvider, content) {
    const publication = await publicationResolver.publish({
        content, contentKind: 'forkbuild.structure', identityProvider
    });
    publicationCatalog.add(publication);
    return publication;
}

// Mirrors ui/views/DecentralizedPublicationsView.js#createPlacement()
// exactly — the existing per-storage button's own click handler.
async function clickCreate(creationCoordinator, publicationId, storage) {
    try {
        const result = await creationCoordinator.create(publicationId, storage);
        return { creating: false, outcome: result.outcome, placement: result.placement, reason: result.reason, error: null };
    } catch (error) {
        return { creating: false, outcome: null, placement: null, reason: null, error: error.message };
    }
}

// Mirrors ui/views/DecentralizedPublicationsView.js#createPreferredPlacement()
// (0.9.301) exactly — the new "Use Preferred Provider" button's own click
// handler. Always calls create() with NO storage argument.
async function clickCreatePreferred(preferredCreationCoordinator, publicationId) {
    try {
        const result = await preferredCreationCoordinator.create(publicationId);
        return {
            creating: false, outcome: result.outcome, placement: result.placement, reason: result.reason, error: null,
            preference: result.preference || null
        };
    } catch (error) {
        return { creating: false, outcome: null, placement: null, reason: null, error: error.message, preference: null };
    }
}

// Mirrors an `entry` object exactly as ui/views/DecentralizedPublicationsView
// .js's own `entries` reactive array shapes one, for the two fields this
// milestone touches.
function makeEntry(publication) {
    return { publication, placementCreationAttempts: {}, preferredPlacementCreationAttempt: null, placements: [] };
}

async function run() {
    // ===============================================================
    // Section A — trigger reachability.
    // ===============================================================
    {
        const viewSource = await source('ui/views/DecentralizedPublicationsView.js');

        // A1. The view now injects the preference-aware coordinator, under
        // its OWN key, alongside the pre-existing one — never in place of it.
        assert(/inject\('snapshotPlacementCreationCoordinator',\s*null\)/.test(viewSource),
            '1. the pre-existing (0.8.25) coordinator is still injected, unchanged');
        assert(/inject\('preferredSnapshotPlacementCreationCoordinator',\s*null\)/.test(viewSource),
            '2. the preference-aware coordinator (0.9.299) is now ALSO injected, under its own key');

        // A2. The new trigger function exists, and calls create() with the
        // publication id and NO second argument — the one detail that
        // makes the wrapped coordinator consult the CONTENT preference at
        // all (application/PreferredSnapshotPlacementCreationCoordinator
        // .js's own header).
        assert(/async function createPreferredPlacement\(entry\)/.test(viewSource),
            '3. a new, dedicated createPreferredPlacement(entry) function exists — never a second parameter bolted onto createPlacement(entry, storage)');
        assert(/await preferredPlacementCreationCoordinator\.create\(entry\.publication\.id\)/.test(viewSource),
            '4. it calls create(entry.publication.id) with NO storage argument — the one thing that makes preference resolution happen at all');

        // A3. The template actually wires a click to it — a real button, a
        // real handler, not just a defined-but-unused function.
        assert(/@click="createPreferredPlacement\(entry\)"/.test(viewSource),
            '5. the template has a real button whose click invokes createPreferredPlacement(entry)');
        assert(/Use Preferred Provider/.test(viewSource),
            '6. the new action is labeled distinctly from any per-storage button — a person can tell this is "my saved preference," not "this specific storage"');

        // A4. Functionally: the mirrored click handler really does reach
        // ResolvePreferredRoleProviderUseCase / RoleAwareProviderResolver,
        // through the SAME production-shaped composition ui/main.js wires
        // — proven by actually configuring a preference and observing it
        // decide the outcome (never inferred from source alone).
        const net = makeFakeIpfsNode();
        const ipfs = new IpfsContentStore({ apiUrl: 'http://node.test:5001', fetchImpl: net.fetchImpl });
        const { publicationCatalog, publicationResolver, identityProvider, preferredCreationCoordinator, preferenceStore } =
            makePublicationCenter({ stores: [ipfs] });
        preferenceStore.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'ipfs' }));
        const publication = await publishLocally(publicationResolver, publicationCatalog, identityProvider, { doc: 'reachable' });
        const attempt = await clickCreatePreferred(preferredCreationCoordinator, publication.id);
        assert(attempt.outcome === SnapshotPlacementCreationOutcome.CREATED && attempt.placement.storage === 'ipfs',
            '7. the mirrored trigger really reaches the stored CONTENT preference and places through the resolved provider');
    }
    console.log('✓ Section A: the new "Use Preferred Provider" trigger is real — injected under its own key, calling create() with no storage argument, wired to a real button, and functionally reaching the CONTENT preference chain');

    // ===============================================================
    // Section B — explicit providers remain unchanged.
    // ===============================================================
    {
        const net = makeFakeIpfsNode();
        const ipfs = new IpfsContentStore({ apiUrl: 'http://node.test:5001', fetchImpl: net.fetchImpl });
        const ar = new FakeArweaveContentStore();
        const { publicationCatalog, publicationResolver, identityProvider, creationCoordinator, preferenceStore } =
            makePublicationCenter({ stores: [ipfs, ar] });

        // A stored preference names 'ar' — but explicit clicks still name
        // their own storage, and the OLD coordinator (the one the existing
        // per-storage buttons still inject) never even accepts a
        // preference store to consult.
        preferenceStore.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'ar' }));
        const publication = await publishLocally(publicationResolver, publicationCatalog, identityProvider, { doc: 'explicit' });

        const arAttempt = await clickCreate(creationCoordinator, publication.id, 'ar');
        assert(arAttempt.outcome === SnapshotPlacementCreationOutcome.CREATED && arAttempt.placement.storage === 'ar',
            '8. clicking "Ar" (a real, distinct explicit provider — see this file\'s own FakeArweaveContentStore comment) still executes Ar');

        const ipfsAttempt = await clickCreate(creationCoordinator, publication.id, 'ipfs');
        assert(ipfsAttempt.outcome === SnapshotPlacementCreationOutcome.CREATED && ipfsAttempt.placement.storage === 'ipfs',
            '9. clicking "Ipfs" still executes Ipfs — the stored "ar" preference has no effect on it whatsoever');
    }
    console.log('✓ Section B: the existing per-storage buttons behave identically, regardless of any stored CONTENT preference — an explicit choice is never even weighed against one');

    // ===============================================================
    // Section C — preference resolution actually decides the provider.
    // ===============================================================
    {
        const net = makeFakeIpfsNode();
        const ipfs = new IpfsContentStore({ apiUrl: 'http://node.test:5001', fetchImpl: net.fetchImpl });

        {
            const ar = new FakeArweaveContentStore();
            const { publicationCatalog, publicationResolver, identityProvider, preferredCreationCoordinator, preferenceStore } =
                makePublicationCenter({ stores: [ipfs, ar] });
            preferenceStore.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'ar' }));
            const publication = await publishLocally(publicationResolver, publicationCatalog, identityProvider, { doc: 'pref-ar' });
            const attempt = await clickCreatePreferred(preferredCreationCoordinator, publication.id);
            assert(attempt.outcome === SnapshotPlacementCreationOutcome.CREATED && attempt.placement.storage === 'ar',
                '10. CONTENT preference = ar -> the preferred trigger executes Ar');
        }
        {
            const ar = new FakeArweaveContentStore();
            const { publicationCatalog, publicationResolver, identityProvider, preferredCreationCoordinator, preferenceStore } =
                makePublicationCenter({ stores: [ipfs, ar] });
            preferenceStore.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'ipfs' }));
            const publication = await publishLocally(publicationResolver, publicationCatalog, identityProvider, { doc: 'pref-ipfs' });
            const attempt = await clickCreatePreferred(preferredCreationCoordinator, publication.id);
            assert(attempt.outcome === SnapshotPlacementCreationOutcome.CREATED && attempt.placement.storage === 'ipfs',
                '11. CONTENT preference = ipfs -> the preferred trigger executes Ipfs');
        }
    }
    console.log('✓ Section C: the preferred trigger\'s own outcome is genuinely decided by whatever the stored CONTENT preference names, resolved fresh on every click');

    // ===============================================================
    // Section D — no preference configured.
    // ===============================================================
    {
        const net = makeFakeIpfsNode();
        const ipfs = new IpfsContentStore({ apiUrl: 'http://node.test:5001', fetchImpl: net.fetchImpl });
        const { publicationCatalog, publicationResolver, identityProvider, preferredCreationCoordinator, placementCatalog } =
            makePublicationCenter({ stores: [ipfs] });
        // No preferenceStore.save() call anywhere in this block.
        const publication = await publishLocally(publicationResolver, publicationCatalog, identityProvider, { doc: 'no-pref' });

        const attempt = await clickCreatePreferred(preferredCreationCoordinator, publication.id);
        assert(attempt.error && attempt.error.includes('storage is required'),
            '12. no CONTENT preference configured reproduces the LITERAL pre-existing "storage is required" refusal — never an invented default');
        assert(attempt.outcome === null && attempt.preference === null, '13. no outcome, no fabricated preference — the same shape a genuine caller contract violation always has');
        assert(placementCatalog.findByPublicationId(publication.id).length === 0, '14. nothing was ever cataloged — no store was ever even reached');

        const view = describeCreationAttempt(attempt);
        assert(view.state === SnapshotPlacementCreationUiState.UNAVAILABLE,
            '15. to a person looking at the button, this reads exactly like every other local precondition failure — the identical UNAVAILABLE-shaped display createPlacement()\'s own caught errors already use');
    }
    console.log('✓ Section D: with no CONTENT preference configured, the preferred trigger reproduces the exact pre-existing "storage is required" refusal — no accidental fallback, no manufactured default');

    // ===============================================================
    // Section E — an unresolvable preference.
    // ===============================================================
    {
        const local = new LocalContentStore(new InMemoryStorageProvider());
        const putSpy = { calls: 0 };
        const spyLocal = {
            storage: local.storage,
            async put(bytes) { putSpy.calls += 1; return local.put(bytes); },
            async get(ref) { return local.get(ref); }
        };
        const { publicationCatalog, publicationResolver, identityProvider, preferredCreationCoordinator, preferenceStore, placementCatalog } =
            makePublicationCenter({ stores: [spyLocal] });
        // A preference IS configured, but names a storage nothing here is
        // registered under.
        preferenceStore.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'arweave' }));
        const publication = await publishLocally(publicationResolver, publicationCatalog, identityProvider, { doc: 'unresolvable' });

        const attempt = await clickCreatePreferred(preferredCreationCoordinator, publication.id);
        assert(attempt.outcome === RoleProviderResolutionStatus.PROVIDER_NOT_FOUND, '16. an unresolvable preference reports PROVIDER_NOT_FOUND explicitly');
        assert(attempt.placement === null, '17. nothing was ever placed');
        assert(attempt.preference && attempt.preference.providerKey === 'arweave', '18. the unresolvable preference itself is carried on the result, so a person can be told WHAT was configured');
        assert(putSpy.calls === 0, '19. the registered store was NEVER even touched — PROVIDER_NOT_FOUND never falls back to whatever IS registered');
        assert(placementCatalog.findByPublicationId(publication.id).length === 0, '20. nothing was ever cataloged');

        // THE GAP 0.9.300 FOUND, NOW CLOSED: describeCreationAttempt() no
        // longer collapses this to a blank IDLE display.
        const view = describeCreationAttempt(attempt);
        assert(view.state === SnapshotPlacementCreationUiState.PROVIDER_NOT_FOUND, '21. PROVIDER_NOT_FOUND renders its own honest UI state — never IDLE');
        assert(view.state !== SnapshotPlacementCreationUiState.IDLE, '22. explicitly: never the silent IDLE collapse this milestone was commissioned to fix');
        assert(view.label && view.message, '23. a real label and message are shown — nothing renders as if no attempt had ever been made');
        assert(view.message.includes('arweave'), '24. the message names WHAT was configured, not just that something went wrong');
    }
    console.log('✓ Section E: an unresolvable preference reports PROVIDER_NOT_FOUND explicitly, touches no store, and now renders its own honest, visible UI state — never the silent IDLE collapse 0.9.300 found');

    // ===============================================================
    // Section F — the real store operation actually runs.
    // ===============================================================
    {
        const ar = new FakeArweaveContentStore();
        const putSpy = { calls: 0, bytesSeen: [] };
        const spyAr = {
            storage: ar.storage,
            async put(bytes) { putSpy.calls += 1; putSpy.bytesSeen.push(bytes); return ar.put(bytes); },
            async get(ref) { return ar.get(ref); }
        };
        const { publicationCatalog, publicationResolver, identityProvider, preferredCreationCoordinator, preferenceStore, placementCatalog } =
            makePublicationCenter({ stores: [spyAr] });
        preferenceStore.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'ar' }));
        const publication = await publishLocally(publicationResolver, publicationCatalog, identityProvider, { farmstead: 'section-f' });

        const attempt = await clickCreatePreferred(preferredCreationCoordinator, publication.id);
        assert(attempt.outcome === SnapshotPlacementCreationOutcome.CREATED, '25. the preferred trigger really succeeds');
        assert(attempt.placement instanceof PublicationSnapshotPlacement, '26. a real PublicationSnapshotPlacement is produced, never a fabricated shape');
        assert(putSpy.calls === 1, '27. exactly ONE placement operation occurs — never zero, never duplicated');
        assert(putSpy.bytesSeen[0] === JSON.stringify({ farmstead: 'section-f' }), '28. the correct bytes — this publication\'s own content — reached the selected provider');
        assert(placementCatalog.findByPublicationId(publication.id).length === 1
            && placementCatalog.findByPublicationId(publication.id)[0].id === attempt.placement.id,
            '29. the real placement is really cataloged, discoverable exactly like any explicitly-created one');
    }
    console.log('✓ Section F: the preferred trigger causes exactly one real placement operation, with the correct bytes, cataloged exactly like any explicit placement');

    // ===============================================================
    // Section G — Discovery and Proof preferences cannot affect this
    // action.
    // ===============================================================
    {
        const ar = new FakeArweaveContentStore();
        const { publicationCatalog, publicationResolver, identityProvider, preferredCreationCoordinator, preferenceStore } =
            makePublicationCenter({ stores: [ar] });

        // The SAME providerKey string, 'ar', registered under Discovery
        // and Proof instead of Content — and, deliberately, NO Content
        // preference at all.
        preferenceStore.save(new RoleProviderPreference({ role: RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY, providerKey: 'ar' }));
        preferenceStore.save(new RoleProviderPreference({ role: RoleProviderRole.PROOF_AND_ANCHORING, providerKey: 'ar' }));
        const publication = await publishLocally(publicationResolver, publicationCatalog, identityProvider, { doc: 'role-isolation' });

        const attempt = await clickCreatePreferred(preferredCreationCoordinator, publication.id);
        assert(attempt.error && attempt.error.includes('storage is required'),
            '30. Discovery/Proof preferences leave the CONTENT decision completely untouched — with no CONTENT preference of their own, the trigger reproduces the exact same "storage is required" refusal Section D already proved, never borrowing another role\'s configured value');

        // The reverse also holds: configuring a DIFFERENT CONTENT value
        // than the one shared by Discovery/Proof still uses Content's own.
        const ipfs = new IpfsContentStore({ apiUrl: 'http://node.test:5001', fetchImpl: makeFakeIpfsNode().fetchImpl });
        const ar2 = new FakeArweaveContentStore();
        const { publicationCatalog: catalog2, publicationResolver: resolver2, identityProvider: identity2, preferredCreationCoordinator: coordinator2, preferenceStore: store2 } =
            makePublicationCenter({ stores: [ar2, ipfs] });
        store2.save(new RoleProviderPreference({ role: RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY, providerKey: 'ipfs' }));
        store2.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'ar' }));
        const publication2 = await publishLocally(resolver2, catalog2, identity2, { doc: 'role-isolation-2' });
        const attempt2 = await clickCreatePreferred(coordinator2, publication2.id);
        assert(attempt2.outcome === SnapshotPlacementCreationOutcome.CREATED && attempt2.placement.storage === 'ar',
            '31. CONTENT\'s own preference (ar) decides the outcome even while Discovery has an independent, different preference (ipfs) configured — no cross-role leakage in either direction');
    }
    console.log('✓ Section G: Discovery and Proof preferences — including the identical providerKey string — have no effect whatsoever on the preferred trigger\'s CONTENT-only decision');

    // ===============================================================
    // Section H — UI lifecycle: running -> success/failure, without
    // cross-contamination between the preferred trigger and the explicit
    // per-storage buttons.
    // ===============================================================
    {
        // H1. Before any click, both the preferred trigger and every
        // per-storage button report IDLE — the same starting point.
        const idleEntry = makeEntry({ id: 'p-idle' });
        assert(describeCreationAttempt(idleEntry.preferredPlacementCreationAttempt).state === SnapshotPlacementCreationUiState.IDLE,
            '32. before any click, the preferred trigger reports IDLE');
        assert(describeCreationAttempt(idleEntry.placementCreationAttempts.ipfs).state === SnapshotPlacementCreationUiState.IDLE,
            '33. before any click, an explicit per-storage button also reports IDLE — mirrored, not shared state');

        // H2. RUNNING is representable and distinct from every settled
        // state, for both — mirrors createPlacement()/createPreferredPlacement()'s
        // own synchronous "creating: true" write before the awaited call
        // resolves.
        const runningView = describeCreationAttempt({ creating: true, outcome: null, placement: null, reason: null, error: null, preference: null });
        assert(runningView.state === SnapshotPlacementCreationUiState.CREATING, '34. an in-flight attempt reports CREATING');

        // H3. A failed preferred attempt (PROVIDER_NOT_FOUND) never
        // corrupts an entry's OWN, already-recorded explicit attempts, and
        // vice versa — the two live in genuinely separate fields.
        const net = makeFakeIpfsNode();
        const ipfs = new IpfsContentStore({ apiUrl: 'http://node.test:5001', fetchImpl: net.fetchImpl });
        const ar = new FakeArweaveContentStore();
        const { publicationCatalog, publicationResolver, identityProvider, creationCoordinator, preferredCreationCoordinator, preferenceStore } =
            makePublicationCenter({ stores: [ipfs, ar] });
        const publication = await publishLocally(publicationResolver, publicationCatalog, identityProvider, { doc: 'lifecycle' });
        const entry = makeEntry(publication);

        // An explicit "Ipfs" click succeeds first.
        entry.placementCreationAttempts.ipfs = { creating: true, outcome: null, placement: null, reason: null, error: null };
        entry.placementCreationAttempts.ipfs = await clickCreate(creationCoordinator, publication.id, 'ipfs');
        assert(describeCreationAttempt(entry.placementCreationAttempts.ipfs).state === SnapshotPlacementCreationUiState.CREATED,
            '35. the explicit Ipfs attempt recorded CREATED');

        // Now the preferred trigger fails (an unresolvable preference,
        // configured AFTER the explicit click above).
        preferenceStore.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'arweave-mainnet' }));
        entry.preferredPlacementCreationAttempt = { creating: true, outcome: null, placement: null, reason: null, error: null, preference: null };
        entry.preferredPlacementCreationAttempt = await clickCreatePreferred(preferredCreationCoordinator, publication.id);

        assert(describeCreationAttempt(entry.preferredPlacementCreationAttempt).state === SnapshotPlacementCreationUiState.PROVIDER_NOT_FOUND,
            '36. the preferred attempt independently recorded its own PROVIDER_NOT_FOUND');
        assert(describeCreationAttempt(entry.placementCreationAttempts.ipfs).state === SnapshotPlacementCreationUiState.CREATED,
            '37. the EARLIER explicit Ipfs attempt is completely untouched by the LATER preferred failure — no shared key, no clobbering');
        assert(entry.placementCreationAttempts.ar === undefined,
            '38. the preferred trigger never writes into placementCreationAttempts at all, under any key, resolved or not');

        // And the reverse: a SUBSEQUENT explicit "Ar" click leaves the
        // preferred trigger's own recorded failure untouched.
        entry.placementCreationAttempts.ar = await clickCreate(creationCoordinator, publication.id, 'ar');
        assert(describeCreationAttempt(entry.placementCreationAttempts.ar).state === SnapshotPlacementCreationUiState.CREATED,
            '39. the new explicit Ar attempt succeeds independently');
        assert(describeCreationAttempt(entry.preferredPlacementCreationAttempt).state === SnapshotPlacementCreationUiState.PROVIDER_NOT_FOUND,
            '40. the preferred trigger\'s own PROVIDER_NOT_FOUND is still exactly as it was — a later explicit click never resets or reinterprets it');
    }
    console.log('✓ Section H: RUNNING/CREATED/PROVIDER_NOT_FOUND are all correctly represented, and the preferred trigger\'s own attempt state never collides with, or is overwritten by, any explicit per-storage attempt\'s state, in either direction');

    // ===============================================================
    // Section I — regression: existing workflows unchanged.
    // ===============================================================
    {
        const net = makeFakeIpfsNode();
        const ipfs = new IpfsContentStore({ apiUrl: 'http://node.test:5001', fetchImpl: net.fetchImpl });
        const { publicationCatalog, publicationResolver, identityProvider, creationCoordinator, preferredCreationCoordinator, preferenceStore } =
            makePublicationCenter({ stores: [ipfs] });
        preferenceStore.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'ipfs' }));
        const publication = await publishLocally(publicationResolver, publicationCatalog, identityProvider, { doc: 'regression' });

        // Multiple independent explicit placements still work, exactly as
        // 0.8.25's own Section D already proved, with the preferred
        // trigger composed alongside — never interfering.
        const first = await clickCreate(creationCoordinator, publication.id, 'ipfs');
        const second = await clickCreate(creationCoordinator, publication.id, 'ipfs');
        assert(first.outcome === SnapshotPlacementCreationOutcome.CREATED && second.outcome === SnapshotPlacementCreationOutcome.CREATED,
            '41. creating the same storage type twice for the same publication still succeeds both times');
        assert(first.placement.id !== second.placement.id, '42. the two placements are still independent records');

        // availableStorageTypes() (what gates which per-storage buttons
        // ever render) is untouched — still a direct pass-through.
        assert(creationCoordinator.availableStorageTypes().length === 1 && creationCoordinator.availableStorageTypes()[0] === 'ipfs',
            '43. availableStorageTypes() still reports exactly the registered stores, unaffected by any preference');

        // And the preferred trigger itself, used a third time on the same
        // publication, produces a THIRD independent placement — never
        // replacing or deduplicating against the two explicit ones above.
        const third = await clickCreatePreferred(preferredCreationCoordinator, publication.id);
        assert(third.outcome === SnapshotPlacementCreationOutcome.CREATED, '44. the preferred trigger succeeds alongside the two prior explicit placements');
        assert(third.placement.id !== first.placement.id && third.placement.id !== second.placement.id,
            '45. the preferred trigger\'s own placement is independent of both prior explicit ones — three placements, three records, none collapsed');
    }
    console.log('✓ Section I: every existing explicit-selection workflow (independent placements, availableStorageTypes gating) is unchanged with the preferred trigger composed and used alongside it');

    console.log('\nAll Preferred Content Provider Placement Trigger tests passed.');
}

run().catch((error) => {
    console.error('PreferredContentProviderPlacementTrigger.test.js FAILED:', error);
    process.exitCode = 1;
});
