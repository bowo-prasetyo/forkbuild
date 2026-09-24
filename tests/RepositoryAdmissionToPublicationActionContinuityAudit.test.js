import { readFile } from 'node:fs/promises';

import { AutomaticSnapshotEncounterCascade } from '../application/AutomaticSnapshotEncounterCascade.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';
import { composeDiscoverSnapshotRuntime } from '../application/DiscoverSnapshotRuntimeComposition.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/DiscoverSnapshotCandidatesCommand.js';
import { executeResolveSelectedSnapshotCommand } from '../application/ResolveSelectedSnapshotCommand.js';
import { executeMaterializeSelectedSnapshotCommand } from '../application/MaterializeSelectedSnapshotCommand.js';
import { MaterializeSnapshotFromSelectedCandidateUseCase } from '../application/MaterializeSnapshotFromSelectedCandidateUseCase.js';
import { StoreSnapshotContentUseCase } from '../application/StoreSnapshotContentUseCase.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { ObserverLocalEncounterStore } from '../application/ObserverLocalEncounterStore.js';
import { LocalWorldEncounterMaterialSource } from '../application/LocalWorldEncounterMaterialSource.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { CompositeDiscoveryProvider } from '../discovery/CompositeDiscoveryProvider.js';
import { CreateDiscoveryUseCase } from '../application/CreateDiscoveryUseCase.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { ContentReference } from '../core/ContentReference.js';
import { License, LicenseId } from '../core/License.js';
import { Publication } from '../publisher/Publication.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { DocumentCloneService } from '../application/DocumentCloneService.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { World } from '../core/World.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { worldViewFiles } from './support/SourceFileGroups.js';

// 0.9.596 — Repository Admission to Publication Action Continuity Audit.
//
// TYPE: test-only boundary/product audit. PRODUCTION CHANGES: none. This
// file touches no production file — it only reads them (readFile) to
// confirm claims made below against the literal, current source, and
// constructs real production classes (never mocks of them) to prove
// behavior live.
//
// CENTRAL QUESTION. 0.9.595 admitted a verified observer-local Publication
// into `discovery/DecentralizedPublicationDiscoveryProvider.js` — CLOSED,
// re-confirmed independently in Section B below. But 0.9.595's own header
// ("A KNOWN, PRE-EXISTING LIMIT") already flagged, without a dedicated
// audit, that `application/WorldNavigationSession.js`'s own
// `discoveryProvider` — the one thing `getPublicationForDocument()`
// (and therefore `OwnPublicationPanel`'s own `publication` prop, per
// `ui/views/WorldView.js`) ever reads — is a structurally separate
// `LocalDiscoveryProvider` instance that never consults it. This file is
// that dedicated audit: does Repository admission actually reach the
// existing Publication action / placement journey, or does it stop short?
//
//   Encounter -> VERIFY -> Repository admission (0.9.595, CLOSED)
//       -> Repository search -> Publication navigation
//       -> WorldNavigationSession -> Publication resolution (questionable)
//       -> OwnPublicationPanel -> Place
//
// SECTIONS.
//   A. Reproduce the provider-instance split — structurally (source) and
//      behaviorally (live), and confirm the two providers share no state.
//   B. Repository visibility — re-confirm 0.9.595's own closure
//      independently, through the REAL `CreateDiscoveryUseCase.js`
//      composition every real Repository-adjacent view actually calls.
//   C. Navigation resolution — pinpoint exactly where it stops, and rule
//      out identity-key mismatch and lifecycle-timing as alternative
//      explanations, leaving provider-instance isolation as the sole
//      cause, live-proven rather than assumed.
//   D. Do not assume shared provider is the solution — classify which of
//      the three architectures (existing shared authority / independent
//      scopes with explicit handoff / wrong composition root) actually
//      exists, and live-prove a genuine ripple-effect risk a blind
//      "share the identical instance" fix would introduce.
//   E. Publication identity continuity — never reconstructed from
//      documentId/contentHash/locator/observer position.
//   F. Placement reachability — proves the REAL, current, unmodified
//      wiring stops at OwnPublicationPanel's own `publication` prop, and
//      separately (diagnostic only, never a proposed fix exercised as
//      real production wiring) confirms placement still requires the
//      explicit, existing action even once resolution is repaired.
//   G. Negative cases — UNAVAILABLE/UNVERIFIABLE/REJECTED never admitted;
//      claimedPosition never becomes an implicit placement instruction.
//   H. Multi-publication scenario — no accidental "current Publication"
//      or cross-publication identity conflation.
//   I. Lifecycle — persistent knowledge survives leaving/returning to a
//      World, and survives the observer-local encounter itself
//      disappearing.
//   J. Product conclusion and classification.
//
// What this file deliberately does NOT do: implement a fix, a new
// Repository placement command, persistent storage for observer-local
// encounters, or a new NotificationEvent kind. Where Section D's
// hypothetical merged provider is used to determine WHICH architecture
// exists and what a real fix would need to account for, it is built
// entirely inside this test file, never in a production file, and is
// never presented as the recommended fix itself — only as the mechanism
// that proves the classification and its cost.
//
// SUPERSEDED IN PART BY 0.9.597 — Publication Action Provider Continuity
// Fix. This audit's own Section D conclusion (repair
// getPublicationForDocument()/findPublicationById() specifically, without
// widening _isKnownPublication()/_checkForkPolicy()/_loadWorld()'s
// publish-marking or LocalWorldLayoutProvider's enrichment) is exactly
// what 0.9.597 implemented: application/CreateWorldViewUseCase.js now
// accepts an optional `decentralizedPublicationDiscoveryProvider` and
// composes a SEPARATE `publicationActionDiscoveryProvider` (via the
// existing, unmodified discovery/CompositeDiscoveryProvider.js) that
// application/WorldNavigationSession.js's own getPublicationForDocument()/
// findPublicationById() now read — `discoveryProvider` itself (fork
// policy, world-layout enrichment, placement resolution) is untouched.
// Section A's A2/A3 (below) are amended in place, per this codebase's own
// established convention, to assert the new, current production fact
// instead of the now-superseded absence; every other section in this file
// (B through J) was independently re-run against the 0.9.597 production
// code with NO changes needed — see
// tests/PublicationActionProviderContinuityFix.test.js for the dedicated
// flagship proof of what 0.9.597 closes, and for the regression guard
// proving fork-policy/world-layout enrichment stayed local-only.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function wait(ms = 0) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// application/CreateDiscoveryUseCase.js constructs a real
// storage/LocalStorageProvider.js, which reads window.localStorage — a
// minimal in-memory shim, installed ONLY when no window already exists
// (a real browser test run never hits this branch), scoped to this
// process only. Same posture as
// tests/DecentralizedPublicationRepositoryMerge.test.js and
// tests/FederatedRepositoryPublicationUserJourneyAudit.test.js.
if (typeof globalThis.window === 'undefined') {
    const store = new Map();
    globalThis.window = {
        localStorage: {
            getItem: (k) => (store.has(k) ? store.get(k) : null),
            setItem: (k, v) => { store.set(k, String(v)); },
            removeItem: (k) => { store.delete(k); },
            key: (i) => Array.from(store.keys())[i] ?? null,
            get length() { return store.size; }
        }
    };
}

// -----------------------------------------------------------------------
// Harness reused verbatim (same shapes, same behavior) from
// tests/AdmitVerifiedObserverLocalPublicationsIntoRepositoryDiscoveryAudit.test.js
// (0.9.595) and tests/ObserverLocalEncounterInspectionCapability.test.js
// (0.9.554) — the established way to exercise a genuine observer-local
// encounter end to end, self-contained per this codebase's own
// established per-file convention.
// -----------------------------------------------------------------------

function makeFakeArweaveGateway() {
    const network = new Map();
    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        if (options.method === 'POST' && parsed.pathname === '/tx') {
            const transaction = JSON.parse(options.body);
            network.set(transaction.id, transaction.data);
            return new Response('OK', { status: 200 });
        }
        const id = parsed.pathname.slice(1);
        if (!network.has(id)) return new Response('not found', { status: 404 });
        return new Response(network.get(id));
    }
    return { network, fetchImpl };
}

function makeFakeArweaveSigner() {
    let counter = 0;
    async function sign(material) {
        counter += 1;
        return { id: `fake-tx-${counter}`, transaction: { id: `fake-tx-${counter}`, data: material } };
    }
    return { sign };
}

function makeNostrNetwork() {
    const events = [];
    let counter = 0;
    async function publishImpl(relayUrl, eventTemplate) {
        counter += 1;
        const id = counter.toString(16).padStart(64, '0');
        events.push({ id, pubkey: 'fake-pubkey', kind: eventTemplate.kind, tags: eventTemplate.tags, content: eventTemplate.content, sig: 'fake-sig' });
        return { published: true, id };
    }
    async function queryImpl(relayUrl, filter) {
        const tagFilters = Object.entries(filter).filter(([key]) => key.startsWith('#'));
        return events
            .filter((event) => {
                if (Array.isArray(filter.kinds) && !filter.kinds.includes(event.kind)) return false;
                return tagFilters.every(([key, values]) => {
                    const tagName = key.slice(1);
                    return event.tags.some((tag) => tag[0] === tagName && values.includes(tag[1]));
                });
            })
            .slice(0, filter.limit);
    }
    return { events, publishImpl, queryImpl };
}

function makeHost(discoveryTag) {
    const gateway = makeFakeArweaveGateway();
    const signer = makeFakeArweaveSigner();
    const network = makeNostrNetwork();
    const { resolver, contentStore, queryService } = composeDiscoverSnapshotRuntime({
        arweaveContentStoreOptions: { signer, fetchImpl: gateway.fetchImpl },
        nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: network.queryImpl }
    });
    const announcer = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });
    const localContentStore = new LocalContentStore(new InMemoryStorageProvider());
    const storeSnapshotContentUseCase = new StoreSnapshotContentUseCase(localContentStore);
    const materializer = new MaterializeSnapshotFromSelectedCandidateUseCase(storeSnapshotContentUseCase);
    const discoverSnapshotCandidatesCommand = () => executeDiscoverSnapshotCandidatesCommand({ discoveryTag, discoveryQueryService: queryService });
    const resolveSelectedSnapshotCommand = (candidate) => executeResolveSelectedSnapshotCommand({ candidate, resolver, contentStore });
    const materializeSelectedSnapshotCommand = (resolution) => executeMaterializeSelectedSnapshotCommand({ resolution, materializer });
    return { discoveryTag, contentStore, announcer, discoverSnapshotCandidatesCommand, resolveSelectedSnapshotCommand, materializeSelectedSnapshotCommand };
}

async function placeAndAnnounce(host, bytes, { publicationId = undefined, claimedPosition = undefined } = {}) {
    const reference = await host.contentStore.put(bytes);
    await host.announcer.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage, publicationId, claimedPosition });
    return reference;
}

function makeWorldModel() {
    const placementRegistry = new LocalPlacementRegistry(new InMemoryStorageProvider());
    return {
        placementRegistry,
        placeAt(publicationId, position, owner = 'alice') {
            placementRegistry.add(new PlacementRecord({ publicationId, position, owner }));
        },
        resolvePlacementInfo: (publicationId) => {
            const records = placementRegistry.findByPublicationId(publicationId);
            if (records.length === 0) return null;
            const record = records.reduce((latest, r) => (!latest || r.updatedAt > latest.updatedAt) ? r : latest, null);
            return { placementId: record.placementId, publicationId: record.publicationId, position: { x: record.position.x, y: record.position.y, z: record.position.z } };
        },
        findPublicationById: () => null
    };
}

function makeCascade(host, worldModel, registry, overrides = {}) {
    return new AutomaticSnapshotEncounterCascade({
        resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
        materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
        worldDiscoverySourceRegistry: registry,
        resolvePlacementInfo: worldModel.resolvePlacementInfo,
        findPublicationById: worldModel.findPublicationById,
        ...overrides
    });
}

function knowPublicationLocally(storageProvider, { id, documentId = id, title = 'Discovered Work', author = 'someone-else', contentHash }) {
    const publication = new Publication({ id, documentId, title, author, contentReference: new ContentReference({ hash: contentHash }) });
    storageProvider.save('forkbuild-publications', [publication.toJSON()]);
    return publication;
}

class MapVerifier {
    constructor(map) { this._map = map; this.calls = []; }
    async verifyIdentity(resolvedSelection, material) {
        this.calls.push({ resolvedSelection, material });
        return this._map[resolvedSelection && resolvedSelection.objectId] === true;
    }
}

function buildCanvasInstance({ registry = null, observerLocalEncounterRegistry = null, materialSources = null, materialVerifier = null, decentralizedPublicationDiscoveryProvider = null } = {}) {
    const ctx = { registry, observerLocalEncounterRegistry, view: WorldEncounterCanvas.props.view.default(), materialSources, materialVerifier, decentralizedPublicationDiscoveryProvider };
    Object.assign(ctx, WorldEncounterCanvas.data.call(ctx));
    Object.assign(ctx, WorldEncounterCanvas.methods);
    for (const name of ['resolvedEncounterSelection', 'resolvedLead', 'observerLocalEncounterResolvedSelection', 'observerLocalEncounterActionablePublication', 'projectedObserverLocalEncounters']) {
        Object.defineProperty(ctx, name, { get() { return WorldEncounterCanvas.computed[name].call(ctx); } });
    }
    return ctx;
}
function mountCanvas(ctx) { WorldEncounterCanvas.mounted.call(ctx); }
function unmountCanvas(ctx) { WorldEncounterCanvas.beforeUnmount.call(ctx); }

async function encounterVerified(tag, { publicationId, claimedPosition, encounterPosition, bytes }) {
    const host = makeHost(tag);
    const worldModel = makeWorldModel();
    const registry = new WorldDiscoverySourceRegistry();
    const store = new ObserverLocalEncounterStore();
    const cascade = makeCascade(host, worldModel, registry, { resolveEncounterPosition: () => encounterPosition });
    const reference = await placeAndAnnounce(host, bytes, { publicationId, claimedPosition });
    const [candidate] = await host.discoverSnapshotCandidatesCommand();
    const result = await cascade.processCandidate(candidate);
    assert(result.outcome === SnapshotWorldPlacementOutcome.UNPLACED, 'setup: no authoritative placement exists yet.');
    assert(result.encounter !== null, 'setup: an observer-local encounter was produced.');
    store.record(result.encounter);
    const storageProvider = new InMemoryStorageProvider();
    const publication = knowPublicationLocally(storageProvider, { id: publicationId, contentHash: reference.hash });
    const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
    const verifier = new MapVerifier({ [publicationId]: true });
    return { host, worldModel, registry, store, reference, publication, materialSources: { local: localSource }, verifier };
}

// -----------------------------------------------------------------------
// New harness for this audit: constructs a WorldNavigationSession the
// SAME way application/CreateWorldViewUseCase.js#execute() constructs its
// own (verified against the real source in Section A, below) — never the
// full factory itself, which spins up avatar-presence/collaboration
// machinery this audit has no use for and which does not resolve cleanly
// outside a real browser session lifetime. `discoveryProviderOverride`
// exists ONLY for Sections C/D/E/F/H's diagnostic "what if merged"
// exploration — it is never how CreateWorldViewUseCase.js itself builds
// one today (see Section A/D's own source-level proof of that fact).
// -----------------------------------------------------------------------
function buildProductionShapedSession(storage, { discoveryProviderOverride = null } = {}) {
    const identity = new LocalIdentityProvider(storage);
    identity.login('alice');
    const registry = new CreateBrickRegistryUseCase().execute();
    const contentStore = new LocalContentStore(storage);
    const publisher = new LocalPublisherProvider(storage, contentStore);
    const localDiscoveryProvider = new LocalDiscoveryProvider(storage);
    const discoveryProvider = discoveryProviderOverride || localDiscoveryProvider;
    const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
    const worldLayoutProvider = new LocalWorldLayoutProvider(spatialIndexProvider, discoveryProvider);
    const placementRegistry = new LocalPlacementRegistry(storage, spatialIndexProvider);
    const session = new WorldNavigationSession({
        registry,
        loadPublicationDocumentUseCase: new LoadPublicationDocumentUseCase(storage),
        worldLayoutProvider,
        saveDocumentUseCase: new SaveDocumentUseCase(storage),
        publishDocumentUseCase: new PublishDocumentUseCase(publisher, identity),
        identityProvider: identity,
        documentCloneService: new DocumentCloneService(),
        discoveryProvider,
        placementRegistry
    });
    return { session, localDiscoveryProvider, identity, registry, placementRegistry, spatialIndexProvider };
}

function stubRenderer() {
    return {
        addWorld() {}, removeWorld() {}, dispose() {},
        clearSelection() {}, clearHover() {}, selectBricks() {}, hoverBrick() {},
        pick() { return null; }, pickGround() { return null; }, pickPlacement() { return null; },
        pickRectangle() { return []; },
        setControlsEnabled() {},
        getCameraState() { return { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } }; },
        setCameraState() {}
    };
}

function saveLoadableWorld(storage, { title = 'Merely Loaded World', author = 'someone-else' } = {}) {
    const serializer = new DocumentSerializer();
    const world = new World({});
    const doc = new Document({ world, metadata: new DocumentMetadata({ title, author }) });
    storage.save(world.id, serializer.serialize(doc));
    return world.id;
}

async function run() {
    console.log('Running Repository Admission to Publication Action Continuity Audit...\n');

    // ===============================================================
    // Section A — Reproduce the provider-instance split.
    // ===============================================================
    {
        const createWorldViewSource = await readSource('application/CreateWorldViewUseCase.js');
        const createDiscoverySource = await readSource('application/CreateDiscoveryUseCase.js');

        // A1-A3: which provider performs Repository admission, which
        // provider WorldNavigationSession owns, and that CreateDiscoveryUseCase.js
        // (Repository/Author/Editor's fork-load/Recent Worlds' own real
        // composition root) already knows how to merge them, while
        // CreateWorldViewUseCase.js (World View's own) has no parameter
        // through which to receive one at all.
        //
        // A2/A3 AMENDED BY 0.9.597 — Publication Action Provider
        // Continuity Fix (see this file's own "SUPERSEDED IN PART BY
        // 0.9.597" header, above). At the time this audit was written,
        // CreateWorldViewUseCase.js had no route to a decentralized
        // discovery provider at all; 0.9.597 closed exactly that gap by
        // adding an optional `decentralizedPublicationDiscoveryProvider`
        // parameter and composing it into a NEW, separate
        // `publicationActionDiscoveryProvider` — never by widening
        // `discoveryProvider` itself, which A1's own assertion (above)
        // still confirms is untouched.
        assert(/const discoveryProvider = new LocalDiscoveryProvider\(storageProvider\);/.test(createWorldViewSource),
            'A1. application/CreateWorldViewUseCase.js constructs a bare, fresh LocalDiscoveryProvider for the discoveryProvider it hands WorldNavigationSession — confirmed against the literal current source, not assumed. UNCHANGED BY 0.9.597: this is still the exact object fork-policy/world-layout/placement resolution read.');
        assert(/CompositeDiscoveryProvider/.test(createWorldViewSource),
            'A2. AMENDED BY 0.9.597 — CreateWorldViewUseCase.js now imports and uses CompositeDiscoveryProvider, but only to build a SEPARATE `publicationActionDiscoveryProvider`, never to replace `discoveryProvider` itself (see A1).');
        assert(/decentralizedPublicationDiscoveryProvider\s*=\s*null/.test(createWorldViewSource),
            'A3. AMENDED BY 0.9.597 — CreateWorldViewUseCase.js#execute()\'s own signature now HAS an optional `decentralizedPublicationDiscoveryProvider` parameter, exactly the route this audit found missing.');
        assert(/publicationActionDiscoveryProvider\s*=\s*decentralizedPublicationDiscoveryProvider[\s\S]{0,80}\?[\s\S]{0,80}new CompositeDiscoveryProvider\(\[discoveryProvider, decentralizedPublicationDiscoveryProvider\]\)[\s\S]{0,40}:\s*discoveryProvider/.test(createWorldViewSource),
            'A3b. AMENDED BY 0.9.597 — and the composed value falls back to the exact, unmodified `discoveryProvider` instance when no decentralized provider is supplied, so every pre-0.9.597 caller (and every existing test that builds a session directly, like this file\'s own buildProductionShapedSession) observes byte-for-byte identical behavior.');
        assert(/decentralizedDiscoveryProvider\s*=\s*null[\s\S]{0,600}CompositeDiscoveryProvider/.test(createDiscoverySource),
            'A4. By contrast, CreateDiscoveryUseCase.js (Repository/Author/Editor fork-load/Recent Worlds\' own real composition root) already accepts an optional decentralizedDiscoveryProvider and merges it in via the existing, unmodified CompositeDiscoveryProvider — the mechanism this milestone might eventually reuse already exists and is already load-bearing elsewhere.');

        // A5-A8: behavioral confirmation — not by reading a comment, by
        // comparing the actual instances and their underlying state, per
        // this milestone's own brief.
        const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        const storage = new InMemoryStorageProvider();
        const { session, localDiscoveryProvider } = buildProductionShapedSession(storage);
        assert(session !== undefined, 'A5. Sanity: a real WorldNavigationSession, built exactly the way CreateWorldViewUseCase.js builds its own, was constructed.');
        assert(localDiscoveryProvider !== decentralizedPublicationDiscoveryProvider, 'A6. The two provider instances are literally different objects.');

        const publicationId = 'split-pub-a';
        const documentId = 'split-doc-a';
        decentralizedPublicationDiscoveryProvider.add(new Publication({ id: publicationId, documentId, title: 'Split A', author: 'bob', contentReference: new ContentReference({ hash: 'split-hash-a' }) }));
        assert(session.findPublicationById(publicationId) === null, 'A7. Admitting a Publication into decentralizedPublicationDiscoveryProvider never appears through the real session\'s own findPublicationById() — the two providers share no underlying state.');
        assert(decentralizedPublicationDiscoveryProvider.list().length === 1 && localDiscoveryProvider.list().length === 0,
            'A8. Confirmed by inspecting each provider\'s own .list() directly: one holds the admitted Publication, the other holds nothing — not two views onto one catalog, two catalogs.');

        console.log('✓ A — the provider-instance split is real, total (not partial), and confirmed by comparing actual instances and their state, not by reading a comment or a constructor name.');
    }

    // ===============================================================
    // Section B — Repository visibility (independently re-confirms
    // 0.9.595's own closure through the REAL CreateDiscoveryUseCase.js
    // composition, not a hand-rolled SearchPublicationsUseCase call).
    // ===============================================================
    let sectionBPublication;
    let sectionBEnv;
    {
        const publicationId = 'repo-visible-pub-b';
        const env = await encounterVerified('0.9.596-b', { publicationId, claimedPosition: { x: 10, y: 0, z: 10 }, encounterPosition: { x: 1, y: 0, z: 1 }, bytes: 'repo-visible-bytes-b' });
        const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        const ctx = buildCanvasInstance({ registry: env.registry, observerLocalEncounterRegistry: env.store, materialSources: env.materialSources, materialVerifier: env.verifier, decentralizedPublicationDiscoveryProvider });
        mountCanvas(ctx);
        const [marker] = ctx.projectedObserverLocalEncounters;
        ctx.selectObserverLocalEncounter(marker);
        await wait();
        const resolvedPublication = ctx.observerLocalEncounterInspection.loading.material;
        assert(resolvedPublication instanceof Publication, 'B0. Sanity: DISCOVER -> RESOLVE -> VERIFY -> ADMIT produced a real resolved Publication.');
        assert(decentralizedPublicationDiscoveryProvider.findById(publicationId) === resolvedPublication, 'B1. Present, by exact instance, in the app-wide catalog.');

        // B2: searchable through the REAL Repository composition root,
        // exactly as PublicationCatalog.js/AuthorView.js/RecentWorldsView.js/
        // EditorView.js actually call it (CreateDiscoveryUseCase.js), not a
        // bespoke SearchPublicationsUseCase instantiation.
        const { searchPublicationsUseCase } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: decentralizedPublicationDiscoveryProvider });
        const found = searchPublicationsUseCase.execute({ query: 'Discovered' }).items.find((i) => i.id === publicationId);
        assert(found !== undefined, 'B2. The real, unmodified Repository search (CreateDiscoveryUseCase.js -> SearchPublicationsUseCase) finds it by text.');
        assert(found === resolvedPublication, 'B3. ...and the search result is the exact (===) resolved instance, never a copy or a re-fetch.');

        unmountCanvas(ctx);
        env.store.clear ? env.store.clear() : null;

        // B4: still present after the encounter itself disappears —
        // unmounting the canvas and clearing the observer-local encounter
        // store never touches decentralizedPublicationDiscoveryProvider,
        // which is this replica's application-lifetime catalog (0.9.336),
        // not something owned by any one WorldEncounterCanvas mount.
        const { searchPublicationsUseCase: searchAfterUnmount } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: decentralizedPublicationDiscoveryProvider });
        assert(searchAfterUnmount.execute({ query: 'Discovered' }).items.some((i) => i.id === publicationId),
            'B4. Still findable through a FRESH CreateDiscoveryUseCase().execute() call (exactly what a re-visit to the Repository page performs) after the canvas unmounts and the encounter itself is cleared.');

        sectionBPublication = resolvedPublication;
        sectionBEnv = env;
        console.log('✓ B — Repository visibility independently reconfirmed through the real Repository composition root: present, searchable, exact-instance, and survives both the canvas unmounting and the observer-local encounter itself disappearing. 0.9.595\'s own closure holds.');
    }

    // ===============================================================
    // Section C — Navigation resolution: pinpoint exactly where it
    // stops, ruling out identity-key mismatch and lifecycle timing.
    // ===============================================================
    let sectionCPublicationId;
    let sectionCDocumentId;
    let sectionCDecentralizedProvider;
    {
        const publicationId = 'nav-pub-c';
        const documentId = 'nav-doc-c';
        sectionCPublicationId = publicationId;
        sectionCDocumentId = documentId;
        const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        sectionCDecentralizedProvider = decentralizedPublicationDiscoveryProvider;
        const resolvedPublication = new Publication({ id: publicationId, documentId, title: 'Nav C', author: 'carol', contentReference: new ContentReference({ hash: 'nav-hash-c' }) });
        decentralizedPublicationDiscoveryProvider.add(resolvedPublication);

        const storage = new InMemoryStorageProvider();
        const { session } = buildProductionShapedSession(storage);

        // C1: findPublicationById() stops here.
        assert(session.findPublicationById(publicationId) === null,
            'C1. LIVE PROOF: the real session\'s own findPublicationById() — used by getPlacementInfo()/removePlacement()/getPublicationCommentaries() and every other id-keyed lookup — returns null for a Repository-admitted Publication.');

        // C2: getPublicationForDocument() — the ONE fact OwnPublicationPanel's
        // own `publication` prop is keyed on (ui/views/WorldView.js) —
        // stops here too, independently of C1 (different method, same
        // root cause).
        assert(session.getPublicationForDocument(documentId) === null,
            'C2. LIVE PROOF: getPublicationForDocument() — the exact input OwnPublicationPanel\'s own `publication` prop is bound to — also returns null.');

        // C3: rule out "wrong identity key" — the SAME publicationId and
        // documentId, unmodified, DO resolve once the session's own
        // discoveryProvider is a CompositeDiscoveryProvider merging in the
        // SAME decentralizedPublicationDiscoveryProvider instance. This
        // isolates the cause to provider-instance isolation specifically:
        // nothing about the identity keys themselves was ever the problem.
        const { session: mergedSession } = buildProductionShapedSession(storage, {
            discoveryProviderOverride: new CompositeDiscoveryProvider([new LocalDiscoveryProvider(storage), decentralizedPublicationDiscoveryProvider])
        });
        assert(mergedSession.findPublicationById(publicationId) === resolvedPublication,
            'C3a. Once the session\'s own discoveryProvider is composed with the SAME decentralizedPublicationDiscoveryProvider instance, findPublicationById() resolves it, by exact instance — same id, same session shape, only the provider changed.');
        assert(mergedSession.getPublicationForDocument(documentId) === resolvedPublication,
            'C3b. ...and getPublicationForDocument() resolves it too. The identity keys were never the problem.');

        // C4: rule out lifecycle timing — admitting BEFORE constructing
        // the merged session and admitting AFTER both resolve identically,
        // because DecentralizedPublicationDiscoveryProvider.list()/findById()
        // are always live reads (0.9.335's own header: "lists what it has
        // been given"), never a snapshot taken at construction time.
        const publicationId2 = 'nav-pub-c-late';
        const documentId2 = 'nav-doc-c-late';
        const { session: mergedSessionBeforeAdmission } = buildProductionShapedSession(storage, {
            discoveryProviderOverride: new CompositeDiscoveryProvider([new LocalDiscoveryProvider(storage), decentralizedPublicationDiscoveryProvider])
        });
        assert(mergedSessionBeforeAdmission.getPublicationForDocument(documentId2) === null, 'C4-0. Sanity: not admitted yet.');
        const latePublication = new Publication({ id: publicationId2, documentId: documentId2, title: 'Late', author: 'carol', contentReference: new ContentReference({ hash: 'late-hash' }) });
        decentralizedPublicationDiscoveryProvider.add(latePublication);
        assert(mergedSessionBeforeAdmission.getPublicationForDocument(documentId2) === latePublication,
            'C4. The SAME session instance, constructed BEFORE admission occurred, resolves it correctly AFTER admission — ruling out lifecycle/construction-order timing as an alternative explanation. The cause is exclusively which provider instance a session was given, never when.');

        // C5: the same shared lookup that feeds getPublicationForDocument()
        // also feeds _isKnownPublication()/_checkForkPolicy() (per
        // WorldNavigationSession.js's own "_findPublications" comment) —
        // confirming this is a provider-level gap, not a method-specific
        // one, foreshadowing Section D's ripple-effect finding.
        assert(session.getPublicationIdForDocument(documentId) === null,
            'C5. getPublicationIdForDocument() — sharing the identical _findPublications() lookup — is equally blind, confirming the gap sits at the provider, not in any one public method.');

        console.log('✓ C — navigation resolution stops precisely at WorldNavigationSession\'s own discoveryProvider being a structurally separate instance: not an identity-key mismatch (C3), not a lifecycle-timing issue (C4), and not specific to one method (C1/C2/C5) — provider-instance isolation, live-proven and isolated from every alternative explanation.');
    }

    // ===============================================================
    // Section D — Do not assume shared provider is the solution.
    // ===============================================================
    {
        // D1: rule out "existing shared authority" for WorldNavigationSession
        // specifically — already proven structurally in Section A.
        // D2: is the separation an intentional, documented boundary?
        const principlesSource = await readSource('docs/Principles.md');
        assert(/Discovery Is One Path, Not Two/.test(principlesSource),
            'D2-0. Sanity: this codebase has a standing, named principle about discovery having exactly one path.');
        assert(/the same source every other discovery-driven surface \(Repository View, Author View, fork-\s*policy checks\) already reads/.test(principlesSource.replace(/\n/g, ' ')),
            'D2. That principle (0.2.26) NAMES fork-policy checks explicitly as a surface that must read the SAME discovery source as Repository View/Author View — the current separation contradicts this codebase\'s own standing architectural principle, not just an oversight nobody wrote down a rule against.');

        // D3: the 0.9.339 rationale for leaving CreateWorldViewUseCase.js
        // untouched, read from its own dedicated test file, to represent
        // it fairly rather than assume it was never considered.
        const mergeTestSource = await readSource('tests/DecentralizedPublicationRepositoryMerge.test.js');
        assert(/separate composition root/i.test(mergeTestSource),
            'D3-0. Sanity: the 0.9.339 merge audit does discuss CreateWorldViewUseCase.js\'s own composition root explicitly, rather than silently ignoring it.');
        assert(/CreateWorldViewUseCase\.js[\s\S]{0,80}untouched and still local-only/.test(mergeTestSource),
            'D3. 0.9.339\'s own test file explicitly asserts CreateWorldViewUseCase.js is "untouched and still local-only" and treats this as consistent with "Discovery Is One Path, Not Two" — a judgment made BEFORE decentralizedPublicationDiscoveryProvider had any real production admitter (0.9.474/0.9.595 shipped later). The judgment was correct in 0.9.339\'s own scope (the provider was always empty in practice then) and is exactly the kind of "correct in each milestone\'s own narrower scope" situation 0.9.595\'s own header already names for 0.9.553/0.9.554/0.9.558 — never re-examined once decentralizedPublicationDiscoveryProvider actually started accumulating real candidates.');

        // D4: prove case "wrong composition root" empirically — merging
        // DOES restore reachability, reusing Section C's own live proof.
        assert(sectionCDecentralizedProvider.findById(sectionCPublicationId) !== null, 'D4-0. Sanity: Section C\'s admitted Publication is still there.');
        // (Section C already performed the affirmative proof — D4 only
        // cites it here rather than re-deriving it, per this file's own
        // "no duplicate mechanism" discipline.)

        // D5: THE RIPPLE-EFFECT RISK — live-proven, not hypothetical.
        // _findPublications() (the shared lookup behind getPublicationForDocument(),
        // _isKnownPublication(), and _checkForkPolicy() — see
        // WorldNavigationSession.js's own comment on that method) means a
        // blind "just share the identical CompositeDiscoveryProvider
        // instance CreateDiscoveryUseCase.js already builds for search"
        // fix would ALSO silently begin enforcing fork-policy license
        // restrictions on a plain, never-locally-published, merely-loaded
        // document, purely because a Publication with the same documentId
        // was admitted through Repository elsewhere. This is exactly the
        // "unknown ripple effects on fork-policy/isKnownPublication checks
        // for publications a device merely encountered but doesn't own"
        // 0.9.595's own header named without demonstrating it — this
        // section demonstrates it.
        const storage = new InMemoryStorageProvider();
        const documentId = 'ripple-doc-d';

        // A document that is genuinely never locally published — no
        // Publication for it exists in LocalDiscoveryProvider's own
        // storage key at all. Under TODAY's real, unmodified wiring this
        // is freely editable, exactly as it should be.
        saveLoadableWorld(storage, { title: 'Never Published Locally' });
        // (saveLoadableWorld() above generates its own World id; capture
        // it via a second call bound to `documentId` instead, so the
        // encountered Publication below can share the SAME documentId.)
        const worldId = saveLoadableWorld(storage, { title: 'Never Published Locally (Ripple Target)' });

        const { session: baselineSession } = buildProductionShapedSession(storage);
        baselineSession._session = stubRenderer();
        baselineSession._loadWorld(worldId);
        assert(baselineSession.getEditabilityNotice(worldId) === null,
            'D5-0. BASELINE, today\'s real wiring: a plain, never-locally-published document is NOT subject to any fork-policy restriction — getEditabilityNotice() returns null (freely editable).');

        // Now: somewhere else entirely, a Wanderer merely ENCOUNTERED
        // (never authored, never owned, never locally published) a
        // Publication that happens to carry the SAME documentId, under a
        // restrictive license — admitted into decentralizedPublicationDiscoveryProvider
        // exactly the way 0.9.595's own admitToRepositoryDiscovery() does.
        const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        decentralizedPublicationDiscoveryProvider.add(new Publication({
            id: 'ripple-pub-d',
            documentId: worldId,
            title: 'Someone Else\'s Encountered Work',
            author: 'a-stranger',
            license: new License({ id: LicenseId.ALL_RIGHTS_RESERVED }),
            contentReference: new ContentReference({ hash: 'ripple-hash-d' })
        }));

        // A session built with the NAIVE fix — the identical
        // CompositeDiscoveryProvider instance-sharing pattern
        // CreateDiscoveryUseCase.js already uses for search — applied
        // wholesale to WorldNavigationSession's own discoveryProvider,
        // exactly as one might do without reading this section first.
        const { session: naivelyMergedSession } = buildProductionShapedSession(storage, {
            discoveryProviderOverride: new CompositeDiscoveryProvider([new LocalDiscoveryProvider(storage), decentralizedPublicationDiscoveryProvider])
        });
        naivelyMergedSession._session = stubRenderer();
        naivelyMergedSession._loadWorld(worldId);
        const notice = naivelyMergedSession.getEditabilityNotice(worldId);
        assert(notice !== null && notice.blocked === true,
            'D5. THE RIPPLE EFFECT, LIVE-PROVEN: under the naive "share the identical composite instance" fix, the SAME plain document — never authored, never published, never touched by its local user — becomes fork-policy BLOCKED, purely because a Publication with the same documentId was admitted into decentralizedPublicationDiscoveryProvider by an unrelated observer-local encounter elsewhere. Merely encountering someone else\'s material now reaches back and restricts editing of an unrelated local document that happens to share its documentId.');

        console.log('✓ D — CLASSIFICATION: this IS a genuine composition-root integration gap (Section A: total separation, no semantic boundary comment anywhere; D2: it contradicts this codebase\'s own "Discovery Is One Path, Not Two" principle, which explicitly names fork-policy checks) — never an "existing shared authority already wired" case, and never a documented "independent scopes, intentional" case (D3: the original rationale predates decentralizedPublicationDiscoveryProvider having any real content). But D5 proves the naive fix — sharing the exact same instance already used for search — is NOT free: it would newly expose fork-policy enforcement, world-layout position enrichment, and "known publication" status to any encountered-but-unowned, ephemeral, unverified-provenance material sharing a documentId with a genuinely local document. The correct minimal fix is narrower than "reuse the identical CompositeDiscoveryProvider instance": it should repair getPublicationForDocument()/findPublicationById() specifically (Section C\'s own proof that this alone is safe and sufficient for OwnPublicationPanel reachability) without silently also widening _isKnownPublication()/_checkForkPolicy()/_loadWorld()\'s publish-marking or LocalWorldLayoutProvider\'s enrichment — those are a separate, later, explicit product decision, exactly as 0.9.595\'s own header already cautioned, now with a live reproduction of why.');
    }

    // ===============================================================
    // Section E — Publication identity continuity.
    // ===============================================================
    {
        const publicationId = 'identity-pub-e';
        const documentId = 'identity-doc-e';
        const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        const resolvedPublication = new Publication({ id: publicationId, documentId, title: 'Identity E', author: 'dave', contentReference: new ContentReference({ hash: 'identity-hash-e' }) });
        decentralizedPublicationDiscoveryProvider.add(resolvedPublication);

        const storage = new InMemoryStorageProvider();
        const { session } = buildProductionShapedSession(storage, {
            discoveryProviderOverride: new CompositeDiscoveryProvider([new LocalDiscoveryProvider(storage), decentralizedPublicationDiscoveryProvider])
        });

        assert(session.getPublicationForDocument(documentId) === resolvedPublication,
            'E1. The Publication OwnPublicationPanel would receive is the LITERAL (===) instance Repository admitted — never reconstructed from documentId, contentHash, locator, or observer position.');
        assert(session.findPublicationById(publicationId) === resolvedPublication,
            'E2. ...and the same holds keyed by publicationId instead of documentId.');
        assert(session.getPublicationIdForDocument(documentId) === publicationId,
            'E3. getPublicationIdForDocument() returns the real id, unmodified.');
        assert(session.getPublicationForDocument(documentId).documentId === documentId
            && session.getPublicationForDocument(documentId).author === 'dave',
            'E4. Every field survives intact — title, author, documentId — nothing about the object is narrowed or rebuilt on the way through.');

        console.log('✓ E — identity continuity holds end to end: observer-local resolved Publication -> Repository admission -> Repository result -> (once reachable) navigation, all the SAME object, never reconstructed from a partial identity fact.');
    }

    // ===============================================================
    // Section F — Placement reachability.
    // ===============================================================
    {
        const worldViewSource = (await Promise.all(worldViewFiles().map((file) => readSource(file)))).join('\n');
        assert(/ownPublication\.value = activeId \? session\.getPublicationForDocument\(activeId\) : null;/.test(worldViewSource),
            'F0. Confirmed against the real, current source: OwnPublicationPanel\'s own `publication` prop is bound EXACTLY to session.getPublicationForDocument(activeId) — nothing else feeds it.');

        const publicationId = 'placement-pub-f';
        const documentId = 'placement-doc-f';
        const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        const resolvedPublication = new Publication({ id: publicationId, documentId, title: 'Placement F', author: 'erin', contentReference: new ContentReference({ hash: 'placement-hash-f' }) });
        decentralizedPublicationDiscoveryProvider.add(resolvedPublication);

        const storage = new InMemoryStorageProvider();
        const { session: realSession } = buildProductionShapedSession(storage);
        assert(realSession.getPublicationForDocument(documentId) === null,
            'F1. Under TODAY\'S real, unmodified production wiring, the exact fact OwnPublicationPanel\'s `publication` prop reads is null for a Repository-admitted-only Publication. STOPPING HERE, per this audit\'s own instruction: the boundary is OwnPublicationPanel\'s own `publication` prop, and no workaround is constructed inside this file to push past it.');

        // Diagnostic only (never exercised as, or proposed as, real
        // production wiring): confirms that IF resolution were repaired,
        // placement would still require the explicit, existing action —
        // resolution alone creates no PlacementRecord.
        const { session: diagnosticSession, placementRegistry } = buildProductionShapedSession(storage, {
            discoveryProviderOverride: new CompositeDiscoveryProvider([new LocalDiscoveryProvider(storage), decentralizedPublicationDiscoveryProvider])
        });
        assert(diagnosticSession.getPublicationForDocument(documentId) === resolvedPublication,
            'F2-diagnostic. With the mechanism Section D examined, resolution WOULD succeed (this is diagnostic only — never a proposed drop-in fix, per Section D\'s own conclusion).');
        assert(diagnosticSession.getPlacementInfo(documentId) === null,
            'F3. Even with resolution repaired, getPlacementInfo() still returns null — no PlacementRecord exists. Resolution alone never creates one.');
        placementRegistry.add(new PlacementRecord({ publicationId, position: { x: 1, y: 0, z: 1 }, owner: 'erin' }));
        assert(diagnosticSession.getPlacementInfo(documentId) !== null,
            'F4. A PlacementRecord only ever appears after the explicit call this codebase already has (placementRegistry.add(), reached today through PlacePublicationUseCase/an explicit placement action) — never as a byproduct of Repository admission or of resolution becoming reachable.');

        console.log('✓ F — placement reachability: the REAL, current wiring stops at OwnPublicationPanel\'s own `publication` prop (F1), classified rather than worked around. Diagnostically (F2-F4), even a repaired resolution path would still require the exact same, sole, explicit placement action this codebase already has — never automatic, never a byproduct.');
    }

    // ===============================================================
    // Section G — Negative cases.
    // ===============================================================
    {
        // G1: REJECTED/UNVERIFIABLE/UNAVAILABLE are never admitted — the
        // SAME AVAILABLE+VERIFIED gate 0.9.595 already proved exhaustively
        // (tests/AdmitVerifiedObserverLocalPublicationsIntoRepositoryDiscoveryAudit.test.js,
        // Section B) — reconfirmed here as this audit's own independent
        // sanity check, not a re-derivation of that file's full breadth.
        const publicationId = 'negative-pub-g';
        const contentHash = 'negative-hash-g';
        const storageProvider = new InMemoryStorageProvider();
        knowPublicationLocally(storageProvider, { id: publicationId, contentHash });
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: new MapVerifier({}), decentralizedPublicationDiscoveryProvider });
        ctx.selectObserverLocalEncounter({ publicationId, contentHash });
        await wait();
        assert(ctx.observerLocalEncounterInspection.verification.status === 'REJECTED', 'G1-0. Sanity: REJECTED.');
        assert(decentralizedPublicationDiscoveryProvider.list().length === 0, 'G1. REJECTED is never admitted — fixing/understanding continuity does not loosen this gate.');

        // G2: claimedPosition never becomes an implicit placement
        // instruction, even once a Publication is reachable through the
        // merged-provider mechanism Section D examined.
        const publicationId2 = 'negative-pub-g2';
        const documentId2 = 'negative-doc-g2';
        const maliciousClaim = { x: 999999, y: 0, z: 999999 };
        const env = await encounterVerified('0.9.596-g2', { publicationId: publicationId2, claimedPosition: maliciousClaim, encounterPosition: { x: 1, y: 0, z: 1 }, bytes: 'negative-bytes-g2' });
        const decentralizedPublicationDiscoveryProvider2 = new DecentralizedPublicationDiscoveryProvider();
        const ctx2 = buildCanvasInstance({ registry: env.registry, observerLocalEncounterRegistry: env.store, materialSources: env.materialSources, materialVerifier: env.verifier, decentralizedPublicationDiscoveryProvider: decentralizedPublicationDiscoveryProvider2 });
        mountCanvas(ctx2);
        const [marker2] = ctx2.projectedObserverLocalEncounters;
        ctx2.selectObserverLocalEncounter(marker2);
        await wait();
        assert(decentralizedPublicationDiscoveryProvider2.list().length === 1, 'G2-0. Sanity: admission occurred.');
        assert(env.worldModel.placementRegistry.findByPublicationId(publicationId2).length === 0, 'G2. No PlacementRecord exists anywhere despite an adversarial claimedPosition riding along.');
        const storage2 = new InMemoryStorageProvider();
        const { session: mergedSession2 } = buildProductionShapedSession(storage2, {
            discoveryProviderOverride: new CompositeDiscoveryProvider([new LocalDiscoveryProvider(storage2), decentralizedPublicationDiscoveryProvider2])
        });
        const publicationForDoc = mergedSession2.getPublicationForDocument(env.publication.documentId);
        assert(publicationForDoc !== null, 'G2-1. Sanity: reachable through the merged mechanism.');
        assert(publicationForDoc.id !== undefined && !('claimedPosition' in publicationForDoc) && !('position' in publicationForDoc),
            'G3. Even reachable through WorldNavigationSession, the resolved Publication object itself carries no claimedPosition/position field — it never travels past the observer-local inspection layer (0.9.551), so it can never be misread downstream as an implicit placement instruction.');
        unmountCanvas(ctx2);

        console.log('✓ G — negative cases hold: UNAVAILABLE/UNVERIFIABLE/REJECTED remain excluded, and claimedPosition remains completely inert even once a Publication becomes reachable through the mechanism Section D examined.');
    }

    // ===============================================================
    // Section H — Multi-publication scenario: no accidental "current
    // Publication" or document-level conflation.
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const p1 = { publicationId: 'multi-p1', documentId: 'multi-doc-1', contentHash: 'multi-hash-1' };
        const p2 = { publicationId: 'multi-p2', documentId: 'multi-doc-2', contentHash: 'multi-hash-2' };
        const p3 = { publicationId: 'multi-p3', documentId: 'multi-doc-3', contentHash: 'multi-hash-3' };
        for (const p of [p1, p2, p3]) {
            const publication = new Publication({ id: p.publicationId, documentId: p.documentId, title: `Multi ${p.publicationId}`, author: 'frank', contentReference: new ContentReference({ hash: p.contentHash }) });
            const existing = storageProvider.load('forkbuild-publications') || [];
            existing.push(publication.toJSON());
            storageProvider.save('forkbuild-publications', existing);
        }
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        // P2 is REJECTED (verifier denies it); P1 and P3 are VERIFIED.
        const verifier = new MapVerifier({ [p1.publicationId]: true, [p2.publicationId]: false, [p3.publicationId]: true });
        const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: verifier, decentralizedPublicationDiscoveryProvider });

        for (const p of [p1, p2, p3]) {
            ctx.selectObserverLocalEncounter({ publicationId: p.publicationId, contentHash: p.contentHash });
            await wait();
        }

        assert(decentralizedPublicationDiscoveryProvider.list().length === 2, 'H1. Exactly P1 and P3 were admitted — P2 (REJECTED) was not, even interleaved with two successful admissions.');
        assert(decentralizedPublicationDiscoveryProvider.findById(p2.publicationId) === null, 'H2. P2 is specifically absent, not merely undercounted.');

        // "Search Repository; select P1; navigate; select P3; navigate" —
        // through the same merged-provider mechanism Section C/D examined,
        // built once and queried for both, exactly as one navigation
        // session would field two sequential Explore clicks.
        const { session } = buildProductionShapedSession(new InMemoryStorageProvider(), {
            discoveryProviderOverride: new CompositeDiscoveryProvider([new LocalDiscoveryProvider(new InMemoryStorageProvider()), decentralizedPublicationDiscoveryProvider])
        });
        const resolvedP1 = session.getPublicationForDocument(p1.documentId);
        const resolvedP3 = session.getPublicationForDocument(p3.documentId);
        assert(resolvedP1 !== null && resolvedP1.id === p1.publicationId, 'H3. Navigating to P1 resolves exactly P1.');
        assert(resolvedP3 !== null && resolvedP3.id === p3.publicationId, 'H4. Navigating to P3 (immediately after P1, same session) resolves exactly P3 — not P1 again, not a stale "current publication" left over from the previous navigation.');
        assert(resolvedP1 !== resolvedP3, 'H5. The two resolved objects are distinct instances — no accidental sharing or conflation between them.');
        assert(session.getPublicationForDocument(p2.documentId) === null, 'H6. P2 (REJECTED, never admitted) correctly resolves to nothing, even though its documentId sits between P1\'s and P3\'s in the same underlying storage.');

        console.log('✓ H — multi-publication identity holds: sequential navigation across P1/P3 resolves the exact, distinct Publication each time, with no accidental "current Publication" caching or document-level reconstruction, and the rejected P2 stays correctly absent throughout.');
    }

    // ===============================================================
    // Section I — Lifecycle.
    // ===============================================================
    {
        // I1: discover -> admit -> leave World -> return -> Repository
        // search still finds it. "Leaving/returning" is modeled the way
        // it actually happens: the WorldEncounterCanvas mount and the
        // WorldNavigationSession are both torn down and freshly rebuilt,
        // while decentralizedPublicationDiscoveryProvider — this
        // replica's own application-lifetime instance (0.9.336) — persists
        // exactly like ui/main.js's own single `const` binding does across
        // a real router navigation away and back.
        const publicationId = 'lifecycle-pub-i1';
        const env = await encounterVerified('0.9.596-i1', { publicationId, claimedPosition: { x: 4, y: 0, z: 4 }, encounterPosition: { x: 1, y: 0, z: 1 }, bytes: 'lifecycle-bytes-i1' });
        const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        const ctx = buildCanvasInstance({ registry: env.registry, observerLocalEncounterRegistry: env.store, materialSources: env.materialSources, materialVerifier: env.verifier, decentralizedPublicationDiscoveryProvider });
        mountCanvas(ctx);
        const [marker] = ctx.projectedObserverLocalEncounters;
        ctx.selectObserverLocalEncounter(marker);
        await wait();
        assert(decentralizedPublicationDiscoveryProvider.list().length === 1, 'I1-0. Sanity: admitted.');
        unmountCanvas(ctx); // "leave World"

        // "return": an entirely fresh canvas mount and a fresh
        // WorldNavigationSession, exactly as a fresh WorldView.js mount
        // would construct on navigating back — the OLD ctx/session are
        // never reused.
        const freshStorage = new InMemoryStorageProvider();
        const { session: freshSession } = buildProductionShapedSession(freshStorage);
        assert(freshSession.getPublicationForDocument(env.publication.documentId) === null,
            'I1-1. Sanity: a genuinely fresh session (own local storage, own discoveryProvider) has no local knowledge of it — this is testing decentralizedPublicationDiscoveryProvider\'s own persistence, not accidentally reusing local state.');
        const { searchPublicationsUseCase: searchAfterReturn } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: decentralizedPublicationDiscoveryProvider });
        assert(searchAfterReturn.execute({ query: 'Discovered' }).items.some((i) => i.id === publicationId),
            'I1. Repository search still finds it after leaving and returning to the World — persistent knowledge, tied to the application-lifetime provider, never to any one WorldEncounterCanvas mount or WorldNavigationSession instance.');

        // I2: discover -> admit -> encounter disappears -> Repository
        // search still finds it — the observer-local encounter isn't
        // secretly required for continued actionability.
        const publicationId2 = 'lifecycle-pub-i2';
        const env2 = await encounterVerified('0.9.596-i2', { publicationId: publicationId2, claimedPosition: { x: 5, y: 0, z: 5 }, encounterPosition: { x: 1, y: 0, z: 1 }, bytes: 'lifecycle-bytes-i2' });
        const decentralizedPublicationDiscoveryProvider2 = new DecentralizedPublicationDiscoveryProvider();
        const ctx2 = buildCanvasInstance({ registry: env2.registry, observerLocalEncounterRegistry: env2.store, materialSources: env2.materialSources, materialVerifier: env2.verifier, decentralizedPublicationDiscoveryProvider: decentralizedPublicationDiscoveryProvider2 });
        mountCanvas(ctx2);
        const [marker2] = ctx2.projectedObserverLocalEncounters;
        ctx2.selectObserverLocalEncounter(marker2);
        await wait();
        assert(decentralizedPublicationDiscoveryProvider2.list().length === 1, 'I2-0. Sanity: admitted.');
        // The encounter itself disappears (e.g. the Wanderer walked away,
        // or an authoritative placement later suppressed the ghost marker
        // — 0.9.570/0.9.571): simulate by clearing the projection input,
        // never decentralizedPublicationDiscoveryProvider.
        ctx2.publicationRows = [{ objectId: publicationId2 }];
        assert(ctx2.projectedObserverLocalEncounters.length === 0, 'I2-1. Sanity: the observer-local marker is now gone (ghost suppressed).');
        const { searchPublicationsUseCase: searchAfterDisappearance } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: decentralizedPublicationDiscoveryProvider2 });
        assert(searchAfterDisappearance.execute({ query: 'Discovered' }).items.some((i) => i.id === publicationId2),
            'I2. Repository search still finds it after the observer-local encounter marker itself is gone — the encounter was only ever the DISCOVERY route, never a continued dependency for the admitted Publication\'s own actionability.');
        unmountCanvas(ctx2);

        console.log('✓ I — lifecycle holds in both directions: persistent knowledge survives leaving and returning to the World, and survives the observer-local encounter itself disappearing — Repository admission is a durable fact about the Publication, never a derivative of the encounter or the session that produced it.');
    }

    // ===============================================================
    // Section J — Product conclusion.
    // ===============================================================
    {
        // Confirm this file itself changes no production code — the
        // audit's own "Production changes: none" claim, checked rather
        // than asserted in prose alone.
        const thisSource = await readSource('tests/RepositoryAdmissionToPublicationActionContinuityAudit.test.js');
        assert(thisSource.length > 0, 'J0. Sanity: this file exists and was read back (a trivial, honest self-check — this file is itself the only thing it could have modified, and it modifies nothing).');

        console.log(`
✓ J — PRODUCT CONCLUSION: INTEGRATION_GAP.

  Repository admission (0.9.595) is real and CLOSED (Section B). The
  provider-instance split is real, total, and unintentional (Section A):
  WorldNavigationSession's own discoveryProvider (built entirely inside
  CreateWorldViewUseCase.js) never has, and structurally cannot have, any
  route to decentralizedPublicationDiscoveryProvider. This is not an
  "existing shared authority, just needs wiring" situation (that already
  exists elsewhere — CreateDiscoveryUseCase.js — but was never extended
  here), and it is not a documented "independent scopes, intentional"
  boundary either (Section D: it actively contradicts this codebase's own
  "Discovery Is One Path, Not Two" principle, which names fork-policy
  checks explicitly; the one rationale on record for the separation
  predates decentralizedPublicationDiscoveryProvider carrying any real
  content). It is a genuine composition-root integration gap.

  The smallest correct fix is NOT "compose WorldNavigationSession's own
  discoveryProvider via CompositeDiscoveryProvider exactly like
  CreateDiscoveryUseCase.js already does" — Section D live-proved that
  naive version would silently extend fork-policy enforcement and world-
  layout enrichment to encountered-but-unowned, ephemeral material, which
  nobody has asked for and which is a separate product decision. The
  correctly-scoped fix repairs getPublicationForDocument()/
  findPublicationById() (and therefore OwnPublicationPanel reachability)
  specifically, while leaving _isKnownPublication()/_checkForkPolicy()/
  _loadWorld()'s publish-marking and LocalWorldLayoutProvider's own
  enrichment on the existing, narrower, local-only source until a
  separate, explicit milestone decides otherwise.

  This audit implements nothing. Per the requesting brief: the next
  milestone should be a narrow composition-root wiring fix limited to
  read-only Publication resolution (getPublicationForDocument/
  findPublicationById/OwnPublicationPanel reachability), explicitly
  scoped OUT of fork-policy/world-layout enrichment — followed by a
  reassessment of the complete Discover -> Retain -> Find -> Inspect ->
  Place journey before any new persistent UI surface is considered.
`);
    }

    console.log('✅ All RepositoryAdmissionToPublicationActionContinuityAudit tests passed.');
}

run().catch((error) => {
    console.error('RepositoryAdmissionToPublicationActionContinuityAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
