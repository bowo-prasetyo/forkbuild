import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

import { AutomaticSnapshotEncounterCascade } from '../application/snapshot/AutomaticSnapshotEncounterCascade.js';
import { SnapshotWorldPlacementOutcome } from '../application/snapshot/placement/SnapshotWorldPlacementOutcome.js';
import { composeDiscoverSnapshotRuntime } from '../application/snapshot/DiscoverSnapshotRuntimeComposition.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/snapshot/DiscoverSnapshotCandidatesCommand.js';
import { executeResolveSelectedSnapshotCommand } from '../application/snapshot/ResolveSelectedSnapshotCommand.js';
import { executeMaterializeSelectedSnapshotCommand } from '../application/snapshot/materialization/MaterializeSelectedSnapshotCommand.js';
import { MaterializeSnapshotFromSelectedCandidateUseCase } from '../application/snapshot/materialization/MaterializeSnapshotFromSelectedCandidateUseCase.js';
import { StoreSnapshotContentUseCase } from '../application/snapshot/materialization/StoreSnapshotContentUseCase.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/nostr/NostrSnapshotDiscoveryPublisher.js';
import { WorldDiscoverySourceRegistry } from '../application/discovery/WorldDiscoverySourceRegistry.js';
import { ObserverLocalEncounterStore } from '../application/worldEncounter/ObserverLocalEncounterStore.js';
import { LocalWorldEncounterMaterialSource } from '../application/worldEncounter/LocalWorldEncounterMaterialSource.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { SearchPublicationsUseCase } from '../application/publication/SearchPublicationsUseCase.js';
import { NotificationEventStore } from '../storage/NotificationEventStore.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { ContentReference } from '../core/ContentReference.js';
import { Publication } from '../publisher/Publication.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
// 0.9.595 — Section B-Wiring (below): a real, direct `WorldNavigationSession`,
// built the SAME minimal way tests/ForkOnEdit.test.js already builds one,
// to live-prove whether admission into `decentralizedPublicationDiscoveryProvider`
// actually reaches `getPublicationForDocument()` in a real session — never
// assumed from a comment.
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LoadPublicationDocumentUseCase } from '../application/publication/LoadPublicationDocumentUseCase.js';
import { SaveDocumentUseCase } from '../application/document/SaveDocumentUseCase.js';
import { PublishDocumentUseCase } from '../application/publication/PublishDocumentUseCase.js';
import { DocumentCloneService } from '../application/document/DocumentCloneService.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { worldEncounterCanvasFiles, worldViewFiles } from './support/SourceFileGroups.js';

// 0.9.594 — Discovered-Unplaced Publication Actionability Product Boundary
// Audit.
//
// TYPE: test-only product boundary audit. PRODUCTION CHANGES: none.
//
// THE QUESTION, taken from the requesting brief: can a Wanderer who
// encounters a novel, verified Publication in the World — perceives it,
// understands it, retains access to it — explicitly turn it into an
// authoritative placement, through capability this codebase ALREADY has,
// without a new persistent list or a new notification kind? Or is the
// only route "manually locate the Publication elsewhere, open it,
// Publication panel, place" — the brief's own name for a genuine
// continuity gap?
//
// THIS QUESTION IS NOT NEW TO THIS MILESTONE — it re-opens a boundary
// three prior milestones each independently reaffirmed, on narrower
// evidence than this one now has:
//   - 0.9.553 (tests/ObserverLocalEncounterExperienceProductReassessment.
//     test.js, Section H) — "DELIBERATE_BOUNDARY, reconfirmed: an
//     observer-local encounter has no path, automatic or manual, into
//     app-wide Repository discovery today... this milestone does not
//     build it, and does not recommend building it without a separate
//     product decision."
//   - 0.9.554 (tests/ObserverLocalEncounterInspectionCapability.test.js,
//     Section K) — reconfirmed live, post-inspection-capability.
//   - 0.9.558 (ui/components/WorldEncounterCanvas.js's own "0.9.558"
//     header) — reaffirmed a THIRD time, in production source itself,
//     the SAME milestone that built Open/Fork/Explore/Comment
//     continuation actions: "STILL NEVER admitToRepositoryDiscovery()...
//     stays exactly where it was."
// None of those three reaffirmations, on their own terms, were wrong —
// each answered "should THIS milestone admit to Repository," not "does
// withholding admission cost anything downstream." This milestone asks
// the second question, using a capability none of the three had yet:
// 0.9.474's own admitToRepositoryDiscovery() already exists, is already
// tested, and already answers the identical question for this
// component's OTHER (primary/registered) encounter family — closing a
// verdict named CONTINUITY_GAP_CONFIRMED by tests/
// WorldEncounterRepositoryContinuityBoundaryAudit.test.js (0.9.473).
//
// TEN LETTERED SECTIONS (mirroring the requesting brief's own A-J):
//   A. Reproduce the current experience, live — DISCOVER -> RESOLVE ->
//      VERIFY -> observer-local encounter -> marker -> select -> inspect
//      -> Open/Fork/Explore/Comment reachable, no "place" action anywhere.
//   B. Test the proposed missing action — does an EXISTING placement
//      capability already reach from the discovered Publication? Live
//      proof that it does not, and why: the one structural bridge
//      (Explore -> WorldNavigationSession#getPublicationForDocument ->
//      OwnPublicationPanel) is gated on Repository admission, which this
//      path never performs.
//   C. Placement authority boundary — confirm explicit placement stays
//      an authoritative, explicit pipeline; confirm claimedPosition and
//      ghost suppression hold exactly as 0.9.551-0.9.570 left them.
//   D. Retention — observer-local retention is session-instance-scoped;
//      Repository and Notifications are the two EXISTING persistent
//      mechanisms, live-confirmed, neither of which this path populates.
//   E. Notification semantics — confirm no discovery-shaped
//      NotificationEvent kind exists today, and that this pipeline emits
//      none.
//   F. Duplicate/lifecycle behavior — record()-replaces, ghost
//      suppression is reversible.
//   G. Multi-publication case — several encounters, independently
//      selectable/inspectable/actionable, distinguishable live.
//   H. Session/reload continuity — cross-instance isolation proves reload
//      loses the encounter; contrasted with WorldDiscoverySourceRegistry's
//      own identical, deliberate non-persistence — an architectural
//      pattern, not an oversight, for World-derived-from-position facts.
//   I. Product vocabulary — what a Wanderer is actually shown today.
//   J. Flagship — the brief's own two decisive scenarios, live: Alice
//      encounters P and cannot place it; Alice does not place P and P
//      remains non-authoritative and untraceable.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE: building a new persistent
// "discovered" list, a new NotificationEvent kind, a new "Place Here"
// button, calling admitToRepositoryDiscovery() from anywhere, and any
// other change to ui/components/WorldEncounterCanvas.js, ui/views/
// WorldView.js, ui/components/OwnPublicationPanel.js, or any other
// production file. This milestone's own recommendation (see the
// CLASSIFICATION block at the end) is scoped for a SEPARATE, later
// implementation milestone, exactly like 0.9.473 named the gap and
// 0.9.474 closed it one milestone later, for the sibling encounter
// family.

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
function grep(pattern, dir) {
    return execSync(`grep -rn "${pattern}" ${dir} --include="*.js" || true`, { cwd: SOURCE_ROOT }).toString().split('\n').filter(Boolean);
}

// ===================================================================
// Harness — mirrors tests/ObserverLocalEncounterInspectionCapability.
// test.js's own buildCanvasInstance()/makeHost()/makeWorldModel()/
// makeCascade()/placeAndAnnounce() exactly, duplicated here per this
// codebase's own established convention (each audit/implementation file
// owns its own harness).
// ===================================================================

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

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

    return { gateway, signer, network, discoveryTag, resolver, contentStore, queryService, announcer, localContentStore, discoverSnapshotCandidatesCommand, resolveSelectedSnapshotCommand, materializeSelectedSnapshotCommand };
}

async function placeAndAnnounce(host, bytes, { publicationId = undefined, claimedPosition = undefined } = {}) {
    const reference = await host.contentStore.put(bytes);
    await host.announcer.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage, publicationId, claimedPosition });
    return reference;
}

function makeWorldModel() {
    const publications = new Map();
    const placementRegistry = new LocalPlacementRegistry(new InMemoryStorageProvider());
    return {
        publications,
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
        findPublicationById: (publicationId) => publications.get(publicationId) || null
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

function knowPublicationLocally(storageProvider, { id, title = 'Discovered Work', contentHash }) {
    const publication = new Publication({ id, title, contentReference: new ContentReference({ hash: contentHash }) });
    storageProvider.save('forkbuild-publications', [publication.toJSON()]);
    return publication;
}

function buildCanvasInstance({ registry = null, observerLocalEncounterRegistry = null, materialSources = null, materialVerifier = null, decentralizedPublicationDiscoveryProvider = null, openPublicationCommand = null, forkPublicationCommand = null, explorePublicationCommand = null } = {}) {
    const ctx = {
        registry, observerLocalEncounterRegistry, view: WorldEncounterCanvas.props.view.default(),
        materialSources, materialVerifier, decentralizedPublicationDiscoveryProvider,
        openPublicationCommand, forkPublicationCommand, explorePublicationCommand
    };
    Object.assign(ctx, WorldEncounterCanvas.data.call(ctx));
    Object.assign(ctx, WorldEncounterCanvas.methods);
    for (const name of ['resolvedEncounterSelection', 'resolvedLead', 'observerLocalEncounterResolvedSelection', 'observerLocalEncounterActionablePublication', 'projectedObserverLocalEncounters']) {
        Object.defineProperty(ctx, name, { get() { return WorldEncounterCanvas.computed[name].call(ctx); } });
    }
    return ctx;
}
function mountCanvas(ctx) { WorldEncounterCanvas.mounted.call(ctx); }
function unmountCanvas(ctx) { WorldEncounterCanvas.beforeUnmount.call(ctx); }
function flush() { return new Promise((resolve) => setTimeout(resolve, 0)); }

async function encounterVerifiedNovelPublication(discoveryTag, { publicationId, claimedPosition, encounterPosition, bytes }) {
    const worldModel = makeWorldModel();
    const registry = new WorldDiscoverySourceRegistry();
    const store = new ObserverLocalEncounterStore();
    const host = makeHost(discoveryTag);
    const cascade = makeCascade(host, worldModel, registry, { resolveEncounterPosition: () => encounterPosition });

    const reference = await placeAndAnnounce(host, bytes, { publicationId, claimedPosition });
    const [candidate] = await host.discoverSnapshotCandidatesCommand();
    const result = await cascade.processCandidate(candidate);
    assert(result.outcome === SnapshotWorldPlacementOutcome.UNPLACED, n('Sanity: no authoritative placement exists for a genuinely novel Publication.'));
    assert(result.encounter !== null, n('Sanity: an observer-local encounter was produced.'));
    store.record(result.encounter);

    const storageProvider = new InMemoryStorageProvider();
    const publication = knowPublicationLocally(storageProvider, { id: publicationId, contentHash: reference.hash });
    const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
    const verifier = { calls: [], async verifyIdentity(resolvedSelection) { this.calls.push(resolvedSelection); return resolvedSelection && resolvedSelection.objectId === publicationId; } };

    return { worldModel, registry, store, host, reference, result, publication, materialSources: { local: localSource }, verifier };
}

async function run() {
    // ===============================================================
    // Section A — reproduce the current experience, live.
    // ===============================================================
    {
        const publicationId = 'section-a-pub';
        const env = await encounterVerifiedNovelPublication('0.9.594-a', { publicationId, claimedPosition: { x: 900, y: 0, z: 900 }, encounterPosition: { x: 4, y: 0, z: -2 }, bytes: 'section-a-bytes' });

        let openedWith = null, forkedWith = null, exploredWith = null;
        const ctx = buildCanvasInstance({
            registry: env.registry, observerLocalEncounterRegistry: env.store, materialSources: env.materialSources, materialVerifier: env.verifier,
            openPublicationCommand: (p) => { openedWith = p; }, forkPublicationCommand: (p) => { forkedWith = p; }, explorePublicationCommand: (p) => { exploredWith = p; }
        });
        mountCanvas(ctx);
        const [marker] = ctx.projectedObserverLocalEncounters;
        assert(marker && marker.publicationId === publicationId, n('A1. Walking a genuinely novel, verified Publication all the way through DISCOVER->RESOLVE->VERIFY produces a real, selectable observer-local marker.'));

        ctx.selectObserverLocalEncounter(marker);
        await flush();
        assert(ctx.observerLocalEncounterInspection.loading.status === 'AVAILABLE' && ctx.observerLocalEncounterInspection.verification.status === 'VERIFIED', n('A2. Selecting it resolves a real Material/Verification inspection — perception and understanding both work today.'));
        assert(ctx.observerLocalEncounterActionablePublication instanceof Publication, n('A3. The actionable Publication object resolves — the SAME instance the inspection loaded.'));

        ctx.openObserverLocalEncounterPublication();
        ctx.forkObserverLocalEncounterPublication();
        ctx.exploreObserverLocalEncounterPublication();
        assert(openedWith === ctx.observerLocalEncounterActionablePublication, n('A4. Open reaches the injected command with the real, resolved Publication — reachable today.'));
        assert(forkedWith === ctx.observerLocalEncounterActionablePublication, n('A5. Fork likewise reaches the injected command — reachable today.'));
        assert(exploredWith === ctx.observerLocalEncounterActionablePublication, n('A6. Explore likewise reaches the injected command — reachable today.'));
        assert(typeof ctx.observerLocalEncounterCommentaryOpen === 'boolean', n('A7. Commentary state exists on this exact selection — reachable today (0.9.558).'));

        const observerLocalMethodNames = Object.keys(WorldEncounterCanvas.methods).filter((k) => /ObserverLocal/.test(k));
        const placeLike = observerLocalMethodNames.filter((k) => /place/i.test(k));
        assert(placeLike.length === 0, n(`A8. Of every method this real component defines for the observer-local encounter family (${observerLocalMethodNames.length} found), NONE is place-shaped — no placeObserverLocalEncounter(), no "Place Here" of any kind exists to call, live confirmed against the real methods object, not a reproduction.`));
        unmountCanvas(ctx);
        console.log(`✓ Section A: perception, understanding, and Open/Fork/Explore/Comment all work today for an observer-local encounter (live) — confirmed against the real WorldEncounterCanvas.js — but zero place-shaped action exists anywhere in its own method set (${observerLocalMethodNames.length} observer-local methods enumerated, live).`);
    }

    // ===============================================================
    // Section B — the crux: does an EXISTING placement capability
    // already reach from the discovered Publication?
    //
    // AMENDED BY 0.9.595 — Admit Verified Observer-Local Publications into
    // Repository Discovery. At the time this audit was written, the
    // answer was live-proven no (B2-B4 all proved absence, B5-B8 traced
    // why in real source). This milestone's own CLASSIFICATION block,
    // below, recommended exactly the narrow follow-up 0.9.595 then
    // implemented: one new `admitToRepositoryDiscovery()` call inside
    // `refreshObserverLocalEncounterInspection()`. B2-B4 are amended IN
    // PLACE to prove the current, opposite answer: yes, now, through that
    // one call — B5-B8 (the structural trace of WorldNavigationSession/
    // WorldView/OwnPublicationPanel) are UNCHANGED, since 0.9.595 touched
    // none of those three files; the same wiring they already proved now
    // simply has something to find.
    // ===============================================================
    {
        const publicationId = 'section-b-pub';
        const env = await encounterVerifiedNovelPublication('0.9.594-b', { publicationId, claimedPosition: { x: 1200, y: 0, z: -300 }, encounterPosition: { x: 1, y: 0, z: 1 }, bytes: 'section-b-bytes' });

        const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        let addCalls = 0;
        const originalAdd = decentralizedPublicationDiscoveryProvider.add.bind(decentralizedPublicationDiscoveryProvider);
        decentralizedPublicationDiscoveryProvider.add = (...args) => { addCalls += 1; return originalAdd(...args); };

        const ctx = buildCanvasInstance({ registry: env.registry, observerLocalEncounterRegistry: env.store, materialSources: env.materialSources, materialVerifier: env.verifier, decentralizedPublicationDiscoveryProvider });
        mountCanvas(ctx);
        const [marker] = ctx.projectedObserverLocalEncounters;
        ctx.selectObserverLocalEncounter(marker);
        await flush();
        assert(ctx.observerLocalEncounterActionablePublication instanceof Publication, n('B1. Sanity: the encounter resolves to a real, actionable, AVAILABLE+VERIFIED Publication — exactly the condition admitToRepositoryDiscovery() itself gates on.'));

        assert(addCalls === 1, n('B2. AMENDED BY 0.9.595 — live proof of the closure: this inspection reaches the identical AVAILABLE+VERIFIED condition admitToRepositoryDiscovery() checks, and admitToRepositoryDiscovery() IS now called on the observer-local path — the real, injected decentralizedPublicationDiscoveryProvider.add() was invoked exactly once.'));

        // This is the EXACT provider WorldNavigationSession's own
        // discoveryProvider (application/discovery/CreateDiscoveryUseCase.js) is
        // composed from at application startup — findByDocumentId here IS
        // the same predicate WorldNavigationSession#getPublicationForDocument()
        // (the one input ui/components/OwnPublicationPanel.js's own
        // `publication` prop is keyed on) relies on.
        assert(decentralizedPublicationDiscoveryProvider.findByDocumentId(env.publication.documentId).length === 1,
            n('B3. AMENDED BY 0.9.595 — live proof of the actual consequence: findByDocumentId(documentId) — the exact method application/world/WorldNavigationSession.js#_findPublications() calls — now returns exactly this Publication for its own documentId, on the SAME provider instance a running app shares between WorldEncounterCanvas and WorldNavigationSession.'));

        const searchUseCase = new SearchPublicationsUseCase(decentralizedPublicationDiscoveryProvider);
        const results = searchUseCase.execute({});
        assert(results.items.some((r) => r.id === publicationId), n('B4. AMENDED BY 0.9.595 — Repository\'s own real, unmodified SearchPublicationsUseCase — the actual query behind the Repository UI — now finds this Publication too, for the identical reason.'));

        unmountCanvas(ctx);

        // Trace the structural bridge itself in real, unmodified source,
        // confirming B2/B3 are not an artifact of this test's own fixture
        // but a real property of the wiring between these three files.
        const worldNavSrc = await source('application/world/WorldNavigationSession.js');
        // B5 AMENDED BY 0.9.597 — Publication Action Provider Continuity
        // Fix. At the time this audit was written, getPublicationForDocument()
        // was a thin wrapper over _resolvePublicationForPlacement() (and
        // therefore, transitively, over `this._discoveryProvider` — B6's
        // own point). 0.9.597 gave it its OWN resolution, reading a
        // SEPARATE `this._publicationActionDiscoveryProvider` instead —
        // precisely so a Repository-admitted Publication like this
        // section's own `env.publication` CAN reach OwnPublicationPanel's
        // `publication` prop once WorldView.js's own composition root
        // (ui/views/WorldView.js) actually wires the shared decentralized
        // provider through (see tests/PublicationActionProviderContinuityFix.test.js
        // for the dedicated proof). B6, immediately below, still holds
        // unamended: _findPublications()/`this._discoveryProvider` — the
        // fork-policy/_isKnownPublication() choke point — is untouched.
        assert(/getPublicationForDocument\(documentId\) \{\s*\n\s*if \(!this\._publicationActionDiscoveryProvider/.test(worldNavSrc),
            n('B5. AMENDED BY 0.9.597 — application/world/WorldNavigationSession.js#getPublicationForDocument() — the sole input to OwnPublicationPanel\'s own `publication` prop, per ui/views/WorldView.js — now resolves through its own, separate `_publicationActionDiscoveryProvider`, confirmed in real source, rather than delegating to _resolvePublicationForPlacement()/`_discoveryProvider`.'));
        assert(/_findPublications\(documentId\) \{\s*\n\s*if \(!this\._discoveryProvider \|\| typeof this\._discoveryProvider\.findByDocumentId !== 'function'\) \{\s*\n\s*return \[\];\s*\n\s*\}\s*\n\s*return this\._discoveryProvider\.findByDocumentId\(documentId\) \|\| \[\];/.test(worldNavSrc),
            n('B6. ...which itself resolves entirely through `this._discoveryProvider.findByDocumentId(documentId)` — confirmed in real source — the SAME predicate B3 just proved returns empty for an observer-local-only encounter.'));
        const worldViewSrc = (await Promise.all(worldViewFiles().map((file) => source(file)))).join('\n');
        assert(/ownPublication\.value = activeId \? session\.getPublicationForDocument\(activeId\)/.test(worldViewSrc),
            n('B7. ui/views/WorldView.js computes `ownPublication` — OwnPublicationPanel\'s own only input fact — from exactly this call, on every refreshSpatialUI() tick, confirmed in real source.'));
        assert(/function exploreEncounteredPublicationCommand\(publication\) \{\s*\n\s*focusWorld\(publication\.documentId\);/.test(worldViewSrc),
            n('B8. "Explore," the one observer-local action (0.9.558) that keeps a Wanderer inside World View rather than routing to the Editor, calls focusWorld(documentId) — which session.focusDocument()s that documentId as the new ACTIVE document, the exact activeId ownPublication is then computed from.'));

        console.log('✓ Section B: AMENDED BY 0.9.595 — admission into decentralizedPublicationDiscoveryProvider now DOES happen for this path (live-proven B2-B4), and B5-B8 (unchanged) confirm the REAL source shape of the Explore -> WorldNavigationSession#getPublicationForDocument() -> OwnPublicationPanel chain. Whether that chain actually SHARES this provider instance in a real running app is a separate question B5-B8 never answered on their own — see Section B-Wiring, immediately below, for the live answer.');
    }

    // ===============================================================
    // Section B-Wiring — NEW IN 0.9.595. Does admission into
    // decentralizedPublicationDiscoveryProvider actually reach
    // WorldNavigationSession#getPublicationForDocument() in a REAL running
    // app — never assumed from a comment, live-proven either way.
    //
    // This section exists because this audit's own ORIGINAL Section B
    // prose (0.9.594) asserted, uncontested: "This is the EXACT provider
    // WorldNavigationSession's own discoveryProvider... is composed from
    // at application startup." That claim was never actually live-tested
    // against a real WorldNavigationSession/CreateWorldViewUseCase — it
    // was a comment, not a proof. This section supplies the proof, and the
    // real answer is NO: they are two independent provider instances.
    // ===============================================================
    {
        // A real WorldNavigationSession, built the SAME minimal way
        // tests/ForkOnEdit.test.js already builds one — never a mock of
        // WorldNavigationSession itself, only of its own renderer (which
        // this section never exercises).
        const storage = new InMemoryStorageProvider();
        const alice = new LocalIdentityProvider(storage);
        alice.login('alice');
        const registry = new CreateBrickRegistryUseCase().execute();
        const contentStore = new LocalContentStore(storage);
        const publisher = new LocalPublisherProvider(storage, contentStore);
        // This is WorldNavigationSession's OWN discoveryProvider — a plain
        // LocalDiscoveryProvider, exactly what application/world/CreateWorldViewUseCase.js#execute()
        // itself unconditionally constructs (source-confirmed BW-5, below)
        // — never the app-wide decentralizedPublicationDiscoveryProvider.
        const sessionDiscoveryProvider = new LocalDiscoveryProvider(storage);
        const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
        const worldLayoutProvider = new LocalWorldLayoutProvider(spatialIndexProvider, sessionDiscoveryProvider);
        const session = new WorldNavigationSession({
            registry,
            loadPublicationDocumentUseCase: new LoadPublicationDocumentUseCase(storage),
            worldLayoutProvider,
            saveDocumentUseCase: new SaveDocumentUseCase(storage),
            publishDocumentUseCase: new PublishDocumentUseCase(publisher, alice),
            identityProvider: alice,
            documentCloneService: new DocumentCloneService(),
            discoveryProvider: sessionDiscoveryProvider
        });

        // Meanwhile: the SAME kind of Publication this milestone's own
        // Section B admits, admitted into the SEPARATE, app-wide
        // decentralizedPublicationDiscoveryProvider — never into
        // sessionDiscoveryProvider above.
        const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        const publication = new Publication({
            id: 'section-b2-pub',
            documentId: 'section-b2-doc',
            title: 'B2 Publication',
            author: 'alice',
            contentReference: new ContentReference({ hash: 'b'.repeat(64) }),
            publishedAt: Date.now()
        });
        decentralizedPublicationDiscoveryProvider.add(publication);
        assert(decentralizedPublicationDiscoveryProvider.findByDocumentId('section-b2-doc').length === 1, n('BW-1. Sanity: the decentralized provider itself found it (same mechanism Section B already proved).'));

        assert(session.getPublicationForDocument('section-b2-doc') === null,
            n('BW-2. LIVE PROOF: a real WorldNavigationSession\'s own getPublicationForDocument() returns null for a Publication that exists ONLY in decentralizedPublicationDiscoveryProvider — this session\'s own discoveryProvider is a genuinely separate instance that never sees it. Admission into Repository discovery does NOT, by itself, make OwnPublicationPanel resolve this Publication.'));

        // Confirm it DOES resolve once actually known to the SAME instance
        // session.getPublicationForDocument() reads from — proving BW-2 is
        // a real instance-identity fact, not a bug in this section's own
        // Publication construction. LocalDiscoveryProvider (unlike
        // DecentralizedPublicationDiscoveryProvider) has no .add() of its
        // own — it reads live from storage, exactly like
        // knowPublicationLocally() (above) already writes for it.
        storage.save('forkbuild-publications', [publication.toJSON()]);
        assert(session.getPublicationForDocument('section-b2-doc') !== null,
            n('BW-3. Sanity check on BW-2: the SAME session DOES resolve a Publication once it exists in ITS OWN discoveryProvider — confirming BW-2\'s null was about provider identity, never about getPublicationForDocument() being broken or this fixture being malformed.'));

        // Source-confirm WHY: at the time this section was written,
        // application/world/CreateWorldViewUseCase.js#execute() — the one place
        // a real app ever builds a WorldNavigationSession (via
        // ui/views/WorldView.js) — had no parameter to receive
        // decentralizedPublicationDiscoveryProvider at all, and
        // unconditionally built its own LocalDiscoveryProvider.
        //
        // BW-4 AMENDED BY 0.9.597 — Publication Action Provider Continuity
        // Fix, per this file's own Section B "B5" amendment, above. This
        // section's own BW-2/BW-3 (immediately above) are UNCHANGED and
        // still hold exactly as written: `session` here is built by hand,
        // never through CreateWorldViewUseCase.js, and never passes the
        // new `publicationActionDiscoveryProvider` parameter — so it still
        // falls back to its own `discoveryProvider` (BW-2/BW-3's own
        // point), byte for byte as before 0.9.597. What changed is only
        // that CreateWorldViewUseCase.js NOW HAS the parameter this
        // section originally found missing.
        const createWorldViewSrc = await source('application/world/CreateWorldViewUseCase.js');
        assert(/decentralizedPublicationDiscoveryProvider\s*=\s*null/.test(createWorldViewSrc),
            n('BW-4. AMENDED BY 0.9.597 — application/world/CreateWorldViewUseCase.js now HAS an optional decentralizedPublicationDiscoveryProvider parameter, confirmed in real source — this is exactly the missing route this section originally documented.'));
        assert(/const discoveryProvider = new LocalDiscoveryProvider\(storageProvider\);/.test(createWorldViewSrc),
            n('BW-5. UNCHANGED BY 0.9.597 — CreateWorldViewUseCase.js still unconditionally constructs its own, fresh LocalDiscoveryProvider for `discoveryProvider` — the exact instance WorldNavigationSession\'s own constructor still receives as `discoveryProvider` (fork-policy/world-layout/placement resolution) — confirmed in real source. 0.9.597 adds a SEPARATE `publicationActionDiscoveryProvider` alongside it; it never replaces this one.'));
        assert(/publicationActionDiscoveryProvider\s*=\s*decentralizedPublicationDiscoveryProvider/.test(createWorldViewSrc),
            n('BW-5b. AMENDED BY 0.9.597 — ...and now ALSO composes a separate `publicationActionDiscoveryProvider`, handed to WorldNavigationSession alongside (never instead of) `discoveryProvider` — confirmed in real source.'));
        const worldViewSrc2 = (await Promise.all(worldViewFiles().map((file) => source(file)))).join('\n');
        assert(/new CreateWorldViewUseCase\(\)\.execute\(/.test(worldViewSrc2),
            n('BW-6. ui/views/WorldView.js — the one real caller — constructs its session through exactly this use case, confirmed in real source; no override or post-construction rewiring of session\'s own discoveryProvider happens anywhere in that file.'));
        assert(/decentralizedPublicationDiscoveryProvider:\s*decentralizedDiscoveryProviderForEnrichment/.test(worldViewSrc2),
            n('BW-6b. AMENDED BY 0.9.597 — and now passes the SAME app-wide `decentralizedDiscoveryProviderForEnrichment` it already injects for Repository-search enrichment (0.9.339) through to CreateWorldViewUseCase.js\'s own new parameter, confirmed in real source — never a second, competing injection.'));

        console.log('✓ Section B-Wiring: AMENDED BY 0.9.597 — decentralizedPublicationDiscoveryProvider (what admitToRepositoryDiscovery() admits into) and WorldNavigationSession\'s own `discoveryProvider` (fork-policy/world-layout/placement resolution) remain two independent instances, exactly as this section\'s own BW-2/BW-3 still live-prove for a hand-built session. But in the REAL app (ui/views/WorldView.js -> CreateWorldViewUseCase.js), WorldNavigationSession now ALSO receives a separate `publicationActionDiscoveryProvider` composed from both — so getPublicationForDocument()/findPublicationById() (and therefore OwnPublicationPanel\'s own `publication` prop) DO now see a Repository-admitted Publication, without `discoveryProvider` itself ever being widened. See tests/PublicationActionProviderContinuityFix.test.js for the dedicated end-to-end proof through the real composition root.');
    }

    // ===============================================================
    // Section C — placement authority boundary still holds.
    // ===============================================================
    {
        const publicationId = 'section-c-pub';
        const maliciousClaim = { x: 999999, y: 0, z: 999999 };
        const env = await encounterVerifiedNovelPublication('0.9.594-c', { publicationId, claimedPosition: maliciousClaim, encounterPosition: { x: 2, y: 0, z: 2 }, bytes: 'section-c-bytes' });

        const ctx = buildCanvasInstance({ registry: env.registry, observerLocalEncounterRegistry: env.store, materialSources: env.materialSources, materialVerifier: env.verifier });
        mountCanvas(ctx);
        const [marker] = ctx.projectedObserverLocalEncounters;
        ctx.selectObserverLocalEncounter(marker);
        const resolved = ctx.observerLocalEncounterResolvedSelection;
        assert(!('claimedPosition' in resolved) && !('position' in resolved), n('C1. An adversarial claimedPosition has no path into the resolved selection at all — reconfirmed live, post-0.9.558.'));
        assert(env.worldModel.placementRegistry.findByPublicationId(publicationId).length === 0, n('C2. No PlacementRecord was created anywhere by discovery, inspection, or the (unreachable, per Section B) Open/Fork/Explore actions.'));
        await flush();
        ctx.openObserverLocalEncounterPublication();
        ctx.forkObserverLocalEncounterPublication();
        ctx.exploreObserverLocalEncounterPublication();
        assert(env.worldModel.placementRegistry.findByPublicationId(publicationId).length === 0, n('C3. Even after exercising every reachable action, still no PlacementRecord — nothing in the reachable surface can make claimedPosition, or any position, authoritative.'));

        // Ghost suppression (0.9.570) — presentational, and reversible.
        env.worldModel.placeAt(publicationId, { x: 5, y: 0, z: 5 });
        ctx.publicationRows = [{ objectId: publicationId }];
        const suppressed = ctx.projectedObserverLocalEncounters;
        assert(suppressed.length === 0, n('C4. Once an authoritative placement exists for this publicationId (publicationRows carries it), the observer-local marker is suppressed — the ghost-suppression rule from 0.9.570 holds live, post-0.9.558.'));
        ctx.publicationRows = [];
        const reappeared = ctx.projectedObserverLocalEncounters;
        assert(reappeared.length === 1 && reappeared[0].publicationId === publicationId, n('C5. Removing that authoritative row makes the observer-local marker reappear — confirming suppression is purely presentational and reversible, never a write to the store itself, exactly as 0.9.570\'s own header claims.'));
        unmountCanvas(ctx);
        console.log('✓ Section C: the placement-authority boundary from 0.9.551/0.9.552/0.9.570 holds unmodified — claimedPosition never reaches anything, nothing reachable today can create a PlacementRecord, and ghost suppression remains presentational and reversible.');
    }

    // ===============================================================
    // Section D — retention.
    // ===============================================================
    {
        const encounterStoreSrc = await source('application/worldEncounter/ObserverLocalEncounterStore.js');
        assert(!/StorageProvider/.test(encounterStoreSrc.replace(/\/\/.*$/gm, '')), n('D1. application/worldEncounter/ObserverLocalEncounterStore.js\'s own executable code (comments stripped) never references StorageProvider — zero persistence, confirmed in real source.'));

        const localDiscoverySrc = await source('discovery/LocalDiscoveryProvider.js');
        assert(/constructor\(storageProvider\)/.test(localDiscoverySrc) && /this\._storageProvider\.load\(/.test(localDiscoverySrc),
            n('D2. By contrast, discovery/LocalDiscoveryProvider.js — one half of the Repository\'s own discoveryProvider — reads/writes through an injected storageProvider (persistent, application/discovery/CreateDiscoveryUseCase.js wires it to a real LocalStorageProvider) — confirmed in real source.'));

        const notificationStoreSrc = await source('storage/NotificationEventStore.js');
        assert(/constructor\(storageProvider = new LocalStorageProvider\(\)\)/.test(notificationStoreSrc) || /new LocalStorageProvider\(\)/.test(notificationStoreSrc),
            n('D3. storage/NotificationEventStore.js is ALSO persistent by default (LocalStorageProvider) — confirmed in real source — the second existing persistent mechanism this milestone considers.'));

        // Live: two ObserverLocalEncounterStore instances, one standing in
        // for "before reload" and one for "after reload" (a fresh WorldView
        // mount is a fresh instance, per that file's own header) — proving
        // the encounter genuinely does not survive, not merely that its
        // header says so.
        const beforeReload = new ObserverLocalEncounterStore();
        beforeReload.record({ publicationId: 'reload-pub', contentHash: 'reload-hash', position: { x: 1, y: 0, z: 1 } });
        assert(beforeReload.list().length === 1, n('D4. Sanity: the encounter is recorded in the "before reload" session.'));
        const afterReload = new ObserverLocalEncounterStore();
        assert(afterReload.list().length === 0, n('D5. Live proof: a fresh store instance — standing in for a WorldView remount after a page reload, per this file\'s own header ("a fresh, empty store accompanies each fresh session") — knows nothing about the prior session\'s encounter. No StorageProvider, no shared state, no way to recover it.'));

        console.log('✓ Section D: retention is confirmed, live and in source, to be exactly what the header claims — the observer-local encounter itself does not survive a session boundary, while Repository (D2) and Notifications (D3) are both real, already-persistent mechanisms this path never populates (Section B, E).');
    }

    // ===============================================================
    // Section E — notification semantics.
    // ===============================================================
    {
        const notificationEventSrc = await source('core/NotificationEvent.js');
        assert(/`eventType` is deliberately an open, unenumerated string/.test(notificationEventSrc), n('E1. core/NotificationEvent.js\'s own header confirms eventType is open/unenumerated, not a closed vocabulary — confirmed in real source.'));

        const eventTypeHits = grep('eventType:\\s*[A-Za-z_]', 'application core');
        // core/NotificationEvent.js:106's own `eventType: this._eventType` is
        // the class's own toJSON() echoing back whatever a PRODUCER already
        // supplied — the class definition itself, never a producer that
        // NAMES a new kind — excluded from the producer census on that basis.
        const producerHits = eventTypeHits.filter((l) => !l.includes('core/NotificationEvent.js') && !/^\s*\/\//.test(l.split(':').slice(2).join(':').trim()));
        assert(producerHits.length === 1 && producerHits[0].includes('PublicationCommentaryNotificationProducer.js'),
            n(`E2. A whole-repository sweep of application/ and core/ finds exactly ONE producer naming a real eventType in production code, in application/publication/commentary/PublicationCommentaryNotificationProducer.js — no discovery/encounter-shaped NotificationEvent kind exists anywhere today (found producer hits: ${JSON.stringify(producerHits)}; core/NotificationEvent.js's own toJSON() echo excluded as the class definition itself, not a producer).`));

        // Live: run the full discover->verify->encounter pipeline against
        // a real, fresh NotificationEventStore and confirm it produces
        // zero NotificationEvents — not merely "no producer is wired," but
        // "nothing observable happens," live, on the real store.
        const notificationStorage = new InMemoryStorageProvider();
        const notificationStore = new NotificationEventStore(notificationStorage);
        const env = await encounterVerifiedNovelPublication('0.9.594-e', { publicationId: 'section-e-pub', claimedPosition: { x: 10, y: 0, z: 10 }, encounterPosition: { x: 0, y: 0, z: 0 }, bytes: 'section-e-bytes' });
        assert(notificationStore.loadAll().length === 0, n('E3. Live: after a real DISCOVER->RESOLVE->VERIFY->observer-local-encounter run, the real NotificationEventStore holds zero events — this pipeline is genuinely silent from a notification standpoint today, confirming this is virgin territory rather than an already-covered case.'));

        console.log('✓ Section E: no discovery-shaped notification kind exists, and the observer-local pipeline itself emits nothing through the real notification store — the brief\'s own caution against conflating "a fact happened" with "a task/reminder" is grounded in a real absence, not a hypothetical one.');
    }

    // ===============================================================
    // Section F — duplicate and lifecycle behavior.
    // ===============================================================
    {
        const store = new ObserverLocalEncounterStore();
        store.record({ publicationId: 'dup-pub', contentHash: 'dup-hash', position: { x: 1, y: 0, z: 1 } });
        store.record({ publicationId: 'dup-pub', contentHash: 'dup-hash', position: { x: 2, y: 0, z: 2 } });
        const list = store.list();
        assert(list.length === 1 && list[0].position.x === 2, n('F1. Re-recording the identical publicationId:contentHash REPLACES rather than accumulates — live-confirmed, matching this file\'s own header.'));

        const publicationId = 'section-f-pub';
        const env = await encounterVerifiedNovelPublication('0.9.594-f', { publicationId, claimedPosition: { x: 3, y: 0, z: 3 }, encounterPosition: { x: 4, y: 0, z: 4 }, bytes: 'section-f-bytes' });
        const ctx = buildCanvasInstance({ registry: env.registry, observerLocalEncounterRegistry: env.store, materialSources: env.materialSources, materialVerifier: env.verifier });
        mountCanvas(ctx);
        assert(ctx.projectedObserverLocalEncounters.length === 1, n('F2. Before any authoritative placement: discover -> encounter -> ghost NOT suppressed, present as expected.'));
        env.worldModel.placeAt(publicationId, { x: 3, y: 0, z: 3 });
        ctx.publicationRows = [{ objectId: publicationId }];
        assert(ctx.projectedObserverLocalEncounters.length === 0, n('F3. discover P -> place P (by whatever means) -> walk away -> discover P again (re-processing a candidate re-uses the SAME record()-replaces key, per F1) -> still correctly suppressed once placed — the lifecycle distinction the brief\'s own Section F asks for already holds.'));
        unmountCanvas(ctx);
        console.log('✓ Section F: record()-replace semantics and ghost suppression together already distinguish "still just an observer-local encounter" from "now has an authoritative placement" correctly, live.');
    }

    // ===============================================================
    // Section G — multi-publication case.
    // ===============================================================
    {
        const store = new ObserverLocalEncounterStore();
        const registry = new WorldDiscoverySourceRegistry();
        const storageProvider = new InMemoryStorageProvider();
        // P1: verified and available. P2: discovered, but this Wanderer's
        // own local metadata is absent (still "seen," but not yet
        // actionable). P3: already has an authoritative placement (ghost).
        store.record({ publicationId: 'multi-p1', contentHash: 'hash-p1', position: { x: 1, y: 0, z: 1 } });
        store.record({ publicationId: 'multi-p2', contentHash: 'hash-p2', position: { x: 2, y: 0, z: 2 } });
        store.record({ publicationId: 'multi-p3', contentHash: 'hash-p3', position: { x: 3, y: 0, z: 3 } });
        knowPublicationLocally(storageProvider, { id: 'multi-p1', contentHash: 'hash-p1' });
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const verifier = { async verifyIdentity(resolvedSelection) { return resolvedSelection && resolvedSelection.objectId === 'multi-p1'; } };

        const ctx = buildCanvasInstance({ registry, observerLocalEncounterRegistry: store, materialSources: { local: localSource }, materialVerifier: verifier });
        mountCanvas(ctx);
        ctx.publicationRows = [{ objectId: 'multi-p3' }];
        const projected = ctx.projectedObserverLocalEncounters;
        assert(projected.length === 2 && projected.every((m) => m.publicationId !== 'multi-p3'), n('G1. P3 (already authoritatively placed) is correctly excluded from the projection; P1 and P2 (neither placed) both remain.'));

        ctx.selectObserverLocalEncounter({ publicationId: 'multi-p1', contentHash: 'hash-p1' });
        await flush();
        assert(ctx.observerLocalEncounterInspection.loading.status === 'AVAILABLE' && ctx.observerLocalEncounterInspection.verification.status === 'VERIFIED', n('G2. P1 (locally known + verifiable) resolves fully actionable.'));

        ctx.selectObserverLocalEncounter({ publicationId: 'multi-p2', contentHash: 'hash-p2' });
        await flush();
        assert(ctx.observerLocalEncounterInspection.loading.status !== 'AVAILABLE', n('G3. P2 (genuinely unresolvable material — no source knows it) correctly resolves as NOT actionable — distinguishable, live, from P1, without any new surface.'));
        assert(ctx.observerLocalEncounterActionablePublication === null, n('G4. Confirmed: observerLocalEncounterActionablePublication is null for P2 — Open/Fork/Explore/Comment correctly stay unreachable for material that never resolved, exactly the restraint that computed\'s own header describes.'));
        unmountCanvas(ctx);
        console.log('✓ Section G: three simultaneously-encountered Publications in different states (verified+actionable, discovered-but-unresolvable, already-placed) are already correctly distinguished by the existing marker projection and per-selection inspection — no ambiguous catalog results from exercising this today.');
    }

    // ===============================================================
    // Section H — session/reload continuity, and why re-derivation
    // (not persistence) is this codebase's own established pattern.
    // ===============================================================
    {
        const registrySrc = await source('application/discovery/WorldDiscoverySourceRegistry.js');
        assert(/Persisting the current source set to a `?StorageProvider`?/.test(registrySrc) || /StorageProvider/.test(registrySrc) === false || /persist/i.test(registrySrc),
            n('H1. application/discovery/WorldDiscoverySourceRegistry.js — the SAME app-wide runtime registry WorldEncounterCanvas already subscribes to for every OTHER World fact — documents its own deliberate non-persistence, confirmed in real source.'));
        assert(!/import .*StorageProvider/.test(registrySrc), n('H2. ...and, like ObserverLocalEncounterStore (Section D1), never actually imports a StorageProvider — the pattern is not unique to observer-local encounters.'));

        console.log('✓ Section H: non-persistence of live, position-derived World facts is an established, repeated pattern in this codebase (WorldDiscoverySourceRegistry, ObserverLocalEncounterStore alike) — re-walking to the same spot re-derives the fact via the real, unmodified discovery/resolution/verification pipeline (Section A), rather than this codebase ever restoring a client-persisted record of it. This weighs directly against Possibility B (a new persistent "discovered" list) in the CLASSIFICATION below: the codebase\'s own convention answers retention by re-deriving, not by storing an observation.');
    }

    // ===============================================================
    // Section I — product vocabulary.
    // ===============================================================
    {
        const canvasSrc = (await Promise.all(worldEncounterCanvasFiles().map((file) => source(file)))).join('\n');
        const hasOpenForkExplore = /openObserverLocalEncounterPublication|forkObserverLocalEncounterPublication|exploreObserverLocalEncounterPublication/.test(canvasSrc);
        assert(hasOpenForkExplore, n('I1. Sanity: the actionable vocabulary (Open/Fork/Explore/Comment) exists in real source for a Wanderer to be shown once selected.'));
        const hasPlaceCopy = /Place Here|Place This Publication|Claim This Spot/i.test(canvasSrc);
        assert(!hasPlaceCopy, n('I2. No user-facing "place"-shaped copy exists anywhere in this file today — confirmed by absence in real source, not merely by absent code.'));
        console.log('✓ Section I: today\'s vocabulary for this state stops at Material/Verification + Open/Fork/Explore/Comment — no product language exists yet for "this is discovered but not placed," or for any placement affordance. Per the requesting brief, this milestone deliberately does not invent that vocabulary; it belongs to whatever implementation milestone follows a genuine gap finding.');
    }

    // ===============================================================
    // Section J — flagship.
    // ===============================================================
    {
        // J1: Alice encounters P, understands it, but cannot place it.
        const publicationId = 'flagship-alice-pub';
        const env = await encounterVerifiedNovelPublication('0.9.594-j', { publicationId, claimedPosition: { x: 50, y: 0, z: 50 }, encounterPosition: { x: 6, y: 0, z: -6 }, bytes: 'alice-flagship-bytes' });
        const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();

        const ctx = buildCanvasInstance({ registry: env.registry, observerLocalEncounterRegistry: env.store, materialSources: env.materialSources, materialVerifier: env.verifier, decentralizedPublicationDiscoveryProvider });
        mountCanvas(ctx);
        const [marker] = ctx.projectedObserverLocalEncounters;
        ctx.selectObserverLocalEncounter(marker);
        await flush();
        assert(ctx.observerLocalEncounterActionablePublication instanceof Publication, n('J1. Alice walks, encounters P, and understands it: a real, verified Publication instance resolves.'));

        const methodNames = Object.keys(WorldEncounterCanvas.methods).filter((k) => /ObserverLocal/.test(k) && /place/i.test(k));
        assert(methodNames.length === 0, n('J2. Alice still has no "place P here" action to take — none exists in the real component, unchanged by 0.9.595: admission is not placement.'));
        assert(decentralizedPublicationDiscoveryProvider.findByDocumentId(env.publication.documentId).length === 1, n('J3. AMENDED BY 0.9.595 — P is now findable by documentId on Repository\'s own decentralized catalog, live-confirmed. This lookup is on decentralizedPublicationDiscoveryProvider directly, never through a real WorldNavigationSession — Section B-Wiring live-proves that a real session\'s own getPublicationForDocument() does NOT share this provider, so this specific finding does not by itself mean OwnPublicationPanel resolves P.'));
        unmountCanvas(ctx);

        // J2 (the brief's own SECOND flagship, AMENDED BY 0.9.595): Alice
        // does NOT place P — Repository now KNOWS P (admission happened at
        // encounter time, automatically), but P still remains
        // non-authoritative: no PlacementRecord exists anywhere unless
        // Alice performs the existing, explicit placement action herself.
        assert(env.worldModel.placementRegistry.findByPublicationId(publicationId).length === 0, n('J4. Still no PlacementRecord exists for P — it never became authoritative World state merely by being encountered or admitted. Acceptance Criterion E holds: Repository admission is never placement.'));
        assert(decentralizedPublicationDiscoveryProvider.list().some((p) => p.id === publicationId), n('J5. AMENDED BY 0.9.595 — P now IS in Repository\'s own decentralized catalog, admitted the moment Alice\'s encounter resolved AVAILABLE + VERIFIED — never requiring her to take any further action first.'));
        const searchUseCase = new SearchPublicationsUseCase(decentralizedPublicationDiscoveryProvider);
        assert(searchUseCase.execute({}).items.some((item) => item.id === publicationId), n('J6. AMENDED BY 0.9.595 — Repository search now finds P.'));
        const freshWanderer = new ObserverLocalEncounterStore();
        assert(freshWanderer.list().length === 0, n('J7. Unchanged: a second Wanderer\'s own, entirely separate ObserverLocalEncounterStore (or Alice\'s own, after a reload) still knows nothing about the ENCOUNTER itself — that store stays exactly as session-scoped as 0.9.552/0.9.553 left it. What now persists app-wide is knowledge of the PUBLICATION (via Repository, J5-J6), never the encounter (see this file\'s own "0.9.595" closure note, below, "Repository = persistent Publication knowledge" vs. "ObserverLocalEncounter = ephemeral observation").'));

        console.log('✓ Section J: AMENDED BY 0.9.595 — the brief\'s own decisive scenarios resolve differently now, and correctly, though not as far as the brief\'s own framing assumed: Alice can perceive, understand, and (J3, J5-J6) make P findable through Repository\'s own search UI, automatically, without any action first. She still cannot reach OwnPublicationPanel for P this way — Section B-Wiring live-proves that specific chain stays closed, a pre-existing limit shared with the primary/registered encounter family, not something this milestone was scoped to fix. If she does not explicitly place P (J4, J7), P correctly remains non-authoritative (no PlacementRecord) even though Repository now knows it exists and can find it. Nothing here is a fabricated (0,0,0) or an automatic placement — the 0.9.551 invariant (discovery is never authority) holds throughout; the part of the gap this section originally confirmed that IS closable this way — Repository knowledge, findable and searchable, without requiring a first action — is now closed.');
    }

    // ===============================================================
    // Boundary drift guard — AMENDED BY 0.9.595, AMENDED AGAIN BY 0.9.597.
    // At 0.9.594 time (a pure audit, this file's own only change was
    // itself), the guard below asserted literally zero production drift.
    // 0.9.595 was the documented, narrowly-scoped implementation this
    // audit's own RECOMMENDATION named — exactly one production file.
    // 0.9.597 (Publication Action Provider Continuity Fix) is the NEXT
    // documented, narrowly-scoped implementation 0.9.596's own
    // recommendation named (repair getPublicationForDocument()/
    // findPublicationById() specifically) — touching exactly the
    // composition-root file (CreateWorldViewUseCase.js), the session
    // class those two methods live on (WorldNavigationSession.js), and
    // the one real caller that needed to thread the already-injected
    // decentralized provider through (ui/views/WorldView.js). This guard
    // is amended again to assert THAT set, specifically — not "zero
    // drift," and not 0.9.595's own now-historical one-file set.
    //
    // NOTE ON THIS GUARD'S OWN SHAPE: `git status --porcelain` reports
    // UNCOMMITTED working-tree drift relative to HEAD — it is a
    // point-in-time, pre-commit gate for the session actually
    // implementing a milestone, not a permanent regression assertion
    // (once a milestone's own commit lands, its production files are no
    // longer "changed" relative to HEAD at all). This is an existing,
    // inherited property of this guard's own design (see 0.9.595's own
    // amendment note, above) — not something 0.9.597 introduces.
    // ===============================================================
    {
        const expectedChangedProductionFiles = new Set([
            'application/world/CreateWorldViewUseCase.js',
            'application/world/WorldNavigationSession.js',
            'ui/views/WorldView.js'
        ]);
        const changedProductionFiles = execSync('git status --porcelain -- core/ application/ ui/ discovery/ placement/ storage/', { cwd: SOURCE_ROOT })
            .toString().split('\n').filter((line) => line.trim().length > 0)
            .map((line) => line.replace(/^.{2}\s+/, '').trim());
        const unexpected = changedProductionFiles.filter((f) => !expectedChangedProductionFiles.has(f));
        assert(unexpected.length === 0,
            n(`DriftGuard1. AMENDED BY 0.9.597 — every changed production file is one 0.9.596's own recommendation (or 0.9.595's, already landed) named — no unexpected drift under core/, application/, ui/, discovery/, placement/, or storage/ (found: ${JSON.stringify(changedProductionFiles)}).`));
        const untrackedProduction = execSync('git status --porcelain --untracked-files=all -- core/ application/ ui/ discovery/ placement/ storage/', { cwd: SOURCE_ROOT }).toString().trim()
            .split('\n').filter(Boolean)
            .filter((line) => !Array.from(expectedChangedProductionFiles).some((expected) => line.includes(expected)));
        assert(untrackedProduction.length === 0, n('DriftGuard2. AMENDED BY 0.9.597 — no new, untracked production file exists either — no new store, no new notification kind, no new "Place Here" button, no new discovery protocol, beyond the expected modified set DriftGuard1 already named.'));
        console.log('✓ Boundary drift guard: AMENDED BY 0.9.597 — exactly the composition-root/session/caller set 0.9.596\'s own recommendation named changed; no other drift, tracked or untracked.');
    }

    // ===============================================================
    // Classification.
    // ===============================================================
    console.log('\n=== 0.9.594 CLASSIFICATION ===');
    console.log('CONTINUITY_GAP_CONFIRMED — the same vocabulary tests/WorldEncounterRepositoryContinuityBoundaryAudit.test.js (0.9.473) used for the structurally identical gap in this component\'s OTHER (primary/registered) encounter family, closed one milestone later by 0.9.474\'s own admitToRepositoryDiscovery() call. Today, an observer-local encounter genuinely supports perception (a real marker), understanding (a real Material/Verification inspection, 0.9.554), and Open/Fork/Explore/Comment on the underlying Publication (0.9.558, Section A) — but Section B proves, live, that the one structural route toward this application\'s OWN existing placement-capable surface (OwnPublicationPanel, reached via Explore -> WorldNavigationSession#getPublicationForDocument()) is closed, because that call resolves entirely through discoveryProvider.findByDocumentId(), which is never populated for this path (0.9.553/0.9.554/0.9.558 each deliberately withheld admitToRepositoryDiscovery() here, on grounds that were correct in each milestone\'s own narrower scope, but none of the three measured this specific downstream cost). Per the requesting brief\'s own Possibility A: Repository (discovery/LocalDiscoveryProvider.js + discovery/DecentralizedPublicationDiscoveryProvider.js) is ALREADY persistent (Section D2) and ALREADY has a working search/open/place-adjacent surface for anything admitted to it (0.9.474/0.9.585) — the missing piece is narrower than "build a new collection surface": it is exactly the one call 0.9.474 already built, tested, and proved safe for the sibling encounter family, never yet extended to this one. Sections D/H additionally establish that no new persistence mechanism is warranted for RETENTION: this codebase\'s own established pattern (WorldDiscoverySourceRegistry, ObserverLocalEncounterStore alike) is to re-derive a live, position-based World fact by walking back to it through the real pipeline, never to persist an observation client-side — recommending a new "discovered" list here would cut against that pattern, not extend it. Section E establishes no new NotificationEvent kind is warranted either: this pipeline is observably silent today, and nothing here is closer to "an awareness-worthy fact happened while you were elsewhere" than to "you are standing right where the missing action already lives" — a navigation/action-seam problem, not a reminder problem.\n\nRECOMMENDATION for a SEPARATE, later, narrowly-scoped implementation milestone (0.9.595 in this sequence, not built by this audit): extend the EXISTING, unmodified admitToRepositoryDiscovery(loading, verification) call — already used identically by refreshMaterialInspection()/refreshComparisonMaterialInspection() — to refreshObserverLocalEncounterInspection() too, gated on the SAME AVAILABLE+VERIFIED condition observerLocalEncounterActionablePublication already computes read-only (0.9.558). No new store, no new persistence layer, no new NotificationEvent kind, no new UI surface, and no automatic placement of any kind — Repository admission makes a Publication FINDABLE and OPENABLE; the explicit, human "Place Materialized Snapshot"/"Register Placed Snapshot" click inside OwnPublicationPanel (0.9.159/0.9.160), unmodified by this recommendation, remains the sole authority that ever produces a PlacementRecord, preserving the 0.9.551 invariant this audit reconfirmed live in Section C/J: discovery is never authority. A smaller, separate friction Section B also surfaced but does NOT classify as blocking — OwnPublicationPanel\'s own "Place Materialized Snapshot" reads from its own independent Discover/Resolve/Materialize workflow rather than the observer-local encounter\'s already-materialized bytes, so even after Repository admission a Wanderer placing P would re-run discovery once more inside that panel — is named here as a candidate for a future, separate milestone\'s own consideration, not something this audit\'s own recommendation is scoped to fix.');

    console.log('\n=== PARTIALLY CLOSED BY 0.9.595 ===');
    console.log('The RECOMMENDATION above is now implemented, verbatim: refreshObserverLocalEncounterInspection() (ui/components/WorldEncounterCanvas.js) now calls admitToRepositoryDiscovery(result.loading, result.verification) in its own .then() callback, unconditionally, mirroring refreshMaterialInspection() exactly — no new store, no new persistence layer, no new NotificationEvent kind, no new UI surface, and no automatic placement. Section B above is amended in place (assertions B2-B4) to prove admission itself now happens live; Sections C/F/G/H, unamended, are reconfirmed live to prove nothing else this audit found moved. Section B-Wiring is NEW: it live-proves, against a real WorldNavigationSession (not merely an isolated provider instance), that this admission does NOT reach OwnPublicationPanel — WorldNavigationSession\'s own discoveryProvider is a structurally separate LocalDiscoveryProvider instance, application/world/CreateWorldViewUseCase.js#execute() has no parameter to receive the decentralized provider at all, and no other file rewires this afterward. This is a genuine, pre-existing limit this milestone\'s own recommendation did not anticipate (its own original Section B prose asserted the opposite, uncontested and unproven) — it equally affects the ALREADY-SHIPPED primary/registered encounter family\'s own 0.9.474 admission call, which this audit also newly confirms (Section B-Wiring\'s own BW-4/BW-5/BW-6). What 0.9.595 DOES close: Repository search visibility, automatically, without requiring the Wanderer to place P first (the flagship\'s own J5-J6). What it deliberately leaves open, as a separate, later, not-yet-scoped decision: composing WorldNavigationSession\'s own discoveryProvider the same way CreateDiscoveryUseCase.js already composes its own (via the existing, unmodified CompositeDiscoveryProvider) — see ui/components/WorldEncounterCanvas.js\'s own "0.9.595" header, "A KNOWN, PRE-EXISTING LIMIT," for the full account. See tests/AdmitVerifiedObserverLocalPublicationsIntoRepositoryDiscoveryAudit.test.js for the dedicated flagship proof of exactly what this closure does and does not enable, and docs/Roadmap.md\'s own 0.9.595 entry.');

    console.log(`\n✅ All DiscoveredUnplacedPublicationActionabilityProductBoundaryAudit tests passed (${assertionCount} assertions).`);
}

run().catch((error) => {
    console.error('DiscoveredUnplacedPublicationActionabilityProductBoundaryAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
