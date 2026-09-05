import { readFile } from 'node:fs/promises';

import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import {
    loadWorldEncounterMaterial,
    WorldEncounterMaterialLoadStatus,
    WorldEncounterMaterialSource
} from '../application/WorldEncounterMaterialLoading.js';
import { LocalWorldEncounterMaterialSource } from '../application/LocalWorldEncounterMaterialSource.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { describeWorldEncounterSelectionIdentity } from '../core/WorldEncounterSelectionIdentity.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { describeWorldFromDiscoveryRegistry } from '../application/WorldDiscoveryRegistryProjection.js';
import { LOCAL_WORLD_DISCOVERY_ORIGIN } from '../application/WorldEncounterIntegration.js';
import {
    registerMaterializedSnapshotWorldSource,
    materializedSnapshotWorldOrigin
} from '../application/MaterializedSnapshotWorldDiscoveryBridge.js';
import { resolveSnapshotWorldPlacement } from '../application/SnapshotWorldPlacement.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';
import { SnapshotWorldRegistrationOutcome } from '../application/SnapshotWorldRegistrationOutcome.js';
import { StoreSnapshotContentUseCase } from '../application/StoreSnapshotContentUseCase.js';
import { StoreSnapshotContentOutcome } from '../application/StoreSnapshotContentOutcome.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/NostrSnapshotDiscoveryQueryService.js';
import { DecentralizedSnapshotResolver } from '../application/DecentralizedSnapshotResolver.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/DiscoverSnapshotCandidatesCommand.js';
import { executeResolveSelectedSnapshotCommand } from '../application/ResolveSelectedSnapshotCommand.js';
import { MaterializeSnapshotFromSelectedCandidateUseCase } from '../application/MaterializeSnapshotFromSelectedCandidateUseCase.js';
import { executeMaterializeSelectedSnapshotCommand } from '../application/MaterializeSelectedSnapshotCommand.js';
import { SnapshotCandidateMaterializationOutcome } from '../application/SnapshotCandidateMaterializationOutcome.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { Publication } from '../publisher/Publication.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { computeContentHash } from '../serializer/contentHash.js';

// 0.9.166 — Snapshot World Encounter Material Loading.
//
// 0.9.165's own World Discovery Participation Audit (Section F) proved a
// genuine, previously invisible gap: a materialized, registered, rendered
// Snapshot's own resolved selection could never load its material through
// `application/WorldEncounterMaterialLoading.js`'s ordinary
// `loadWorldEncounterMaterial()` path — `materialSourceFor()` recognized
// exactly two origin families (`origin === 'local'`,
// `origin.startsWith('peer:')`), predating Snapshot's own arrival as a
// World source family. This file is the dedicated test contract for the
// fix: one new branch in `materialSourceFor()` that routes a
// `"snapshot:<contentHash>:<publicationId>"` origin to the SAME
// `materialSources.local` slot `origin === 'local'` already uses — never a
// new `SnapshotMaterialSource` class, never a third `materialSources` slot.
//
// TWO MEANINGS OF "MATERIALIZED," DELIBERATELY KEPT APART. The Snapshot
// pipeline's own "materialized" means verified bytes turned into local
// content availability (`application/StoreSnapshotContentUseCase.js`,
// `content/LocalContentStore.js`). World material loading's own
// "material" means the `Publication`/`AvatarProfile` domain object a
// resolved `{ kind, objectId, origin }` selection names
// (`application/LocalWorldEncounterMaterialSource.js`). This milestone
// connects those two existing boundaries — a registered Snapshot's own
// Publication is always one this replica already holds locally (see
// `ui/components/OwnPublicationPanel.js`'s own `publication` prop, always
// the local user's own already-published document) — it never creates a
// third "materialized" meaning, and never builds a Snapshot -> World
// material repository of its own.
//
// Section A: existing local loading remains unchanged.
// Section B: existing peer loading remains unchanged.
// Section C: a snapshot:* origin is recognized — no longer an immediate
//            UNAVAILABLE when a valid local material source exists.
// Section D: correct material identity — contentHash never decides which
//            Publication loads; publicationId (the resolved selection's
//            own objectId) does, exactly as it already does for 'local'.
// Section E: no network rediscovery — Nostr/Arweave/candidate-search
//            collaborators registered under every plausible key are never
//            invoked, and the production file itself imports none of that
//            infrastructure.
// Section F: no re-materialization — loading a World Encounter never
//            writes to storage and never re-invokes the materialization
//            boundary; MATERIALIZE -> REGISTER -> LOAD stays one-directional.
// Section G: failure behavior — an already-materialized local source that
//            cannot provide the content still degrades to the existing
//            UNAVAILABLE vocabulary; no new status is introduced.
// Section H: rendering regression — through the real, unmodified
//            WorldEncounterCanvas machinery, a Snapshot marker progresses
//            from "World Encounter" to "World Encounter Material."
// Section I: the full flagship — Nostr discovery -> candidate -> selection
//            -> resolution -> verification -> materialization -> placement
//            -> registration -> World encounter -> selection -> material
//            loading -> rendered material, through real composition
//            boundaries throughout.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function flush() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

const stubIdentityProvider = {
    currentUser: () => ({ username: 'alice', displayName: 'alice', providerId: 'stub' }),
    sign: (data) => ({ signedBy: 'alice', providerId: 'stub', data })
};

// A minimal, real Document — the exact fixture shape
// tests/PublicationLifecycle.test.js's own createTestDocument() already
// uses, reused here so publishing goes through the real validation path.
function createTestDocument(title) {
    const world = new World();
    const building = new Building({ creator: 'tester' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0), rotation: 0 }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title, author: 'tester' }) });
}

// Publishes a real Document through the real LocalPublisherProvider —
// mirrors exactly what `ui/components/OwnPublicationPanel.js`'s own
// `publication` prop already is: the local user's own, already-published
// Publication, genuinely persisted under `forkbuild-publications` in
// `storageProvider`. Never a hand-assembled Publication/record.
function publishOwnPublication(storageProvider, title) {
    const publisher = new LocalPublisherProvider(storageProvider);
    return publisher.publish(createTestDocument(title), stubIdentityProvider);
}

// Mirrors tests/SnapshotWorldConvergenceAudit.test.js's own
// placementInfoFor() exactly — the WorldNavigationSession#getPlacementInfo()
// duck type resolveSnapshotWorldPlacement() requires.
function placementInfoFor(placementRegistry, publicationId) {
    const records = placementRegistry.findByPublicationId(publicationId);
    if (records.length === 0) return null;
    const record = records.reduce((latest, r) => (!latest || r.updatedAt > latest.updatedAt) ? r : latest, null);
    return {
        placementId: record.placementId,
        publicationId: record.publicationId,
        position: { x: record.position.x, y: record.position.y, z: record.position.z },
        rotation: record.rotation,
        revision: record.revision,
        owner: record.owner,
        movable: true,
        overlapCount: 0
    };
}

function placeReal(placementRegistry, publicationId, position, owner = 'alice') {
    const record = new PlacementRecord({ publicationId, position, owner });
    placementRegistry.add(record);
    return record;
}

// Combines tests/WorldDiscoveryParticipationAudit.test.js's own
// buildCanvasInstance()/mountCanvas()/projectedPublicationsOf() (real
// mounted() lifecycle — needed so `worldView`/`projectedPublications`
// reflect the registry) with tests/WorldEncounterMaterialInspectionUI.test.js's
// own lazy-getter treatment of `resolvedEncounterSelection`/`resolvedLead`
// (needed so `refreshMaterialInspection()` — itself only ever reachable
// through `selectEncounter()` — reads a real, live value rather than
// `undefined`), plus `materialSources`/`materialVerifier`, both PROPS
// `data()` never seeds itself.
function buildCanvasInstance({ registry = null, view, materialSources = null, materialVerifier = null } = {}) {
    const ctx = {
        registry,
        view: view !== undefined ? view : WorldEncounterCanvas.props.view.default(),
        materialSources,
        materialVerifier
    };
    Object.assign(ctx, WorldEncounterCanvas.data.call(ctx));
    Object.assign(ctx, WorldEncounterCanvas.methods);
    Object.defineProperty(ctx, 'resolvedEncounterSelection', {
        get() { return WorldEncounterCanvas.computed.resolvedEncounterSelection.call(ctx); }
    });
    Object.defineProperty(ctx, 'resolvedLead', {
        get() { return WorldEncounterCanvas.computed.resolvedLead.call(ctx); }
    });
    return ctx;
}

function mountCanvas(ctx) { WorldEncounterCanvas.mounted.call(ctx); }
function unmountCanvas(ctx) { WorldEncounterCanvas.beforeUnmount.call(ctx); }

function projectedPublicationsOf(ctx) {
    ctx.effectiveView = WorldEncounterCanvas.computed.effectiveView.call(ctx);
    ctx.publicationRows = WorldEncounterCanvas.computed.publicationRows.call(ctx);
    return WorldEncounterCanvas.computed.projectedPublications.call(ctx);
}

function viewById(registry) {
    const view = describeWorldFromDiscoveryRegistry(registry);
    return Object.fromEntries(view.publications.map((p) => [p.objectId, p]));
}

function placedResult(contentHash, publicationId, position, placementId = 'placement-x') {
    return { outcome: SnapshotWorldPlacementOutcome.PLACED, contentHash, publicationId, placementId, position, reason: null };
}

class RecordingMaterialSource extends WorldEncounterMaterialSource {
    constructor(material) { super(); this.material = material; this.calls = []; }
    async load(resolvedSelection) { this.calls.push(resolvedSelection); return this.material; }
}

// Mirrors tests/SnapshotDistributionEndToEndRuntimeAudit.test.js's own
// makeFakeArweaveGateway()/makeFakeArweaveSigner()/makeNostrNetwork() —
// the real, unmodified ArweaveContentStore/Nostr publisher-query classes
// this file's own Section I drives, wired against an in-memory fake
// transport rather than a real network.
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
        return { id: `fake-0-9-166-tx-${counter}`, transaction: { id: `fake-0-9-166-tx-${counter}`, data: material } };
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

async function run() {
    // ---------------------------------------------------------------
    // Section A — existing local loading remains unchanged.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section A Publication');
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);

        const resolvedSelection = describeWorldEncounterSelectionIdentity({
            kind: WorldEncounterKind.PUBLICATION, objectId: publication.id, origin: LOCAL_WORLD_DISCOVERY_ORIGIN
        });
        const result = await loadWorldEncounterMaterial({ resolvedSelection, materialSources: { local: localSource } });

        assert(result.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '1. an ordinary local-origin selection still loads AVAILABLE');
        assert(result.material instanceof Publication && result.material.id === publication.id, '2. the loaded material is still the real, local Publication domain object');
        assert(result.material.title === 'Section A Publication', '3. the loaded material still carries its own real title, untouched by this milestone');

        console.log('✓ Section A: existing local (origin === \'local\') loading remains byte-for-byte unchanged');
    }

    // ---------------------------------------------------------------
    // Section B — existing peer loading remains unchanged.
    // ---------------------------------------------------------------
    {
        const peerMaterial = Object.freeze({ displayName: 'A Peer Avatar' });
        const peerSource = new RecordingMaterialSource(peerMaterial);
        const localSource = new RecordingMaterialSource({ title: 'never reached by a peer selection' });

        const resolvedSelection = describeWorldEncounterSelectionIdentity({
            kind: WorldEncounterKind.AVATAR, objectId: 'avatar-section-b', origin: 'peer:did:key:zSectionB'
        });
        const result = await loadWorldEncounterMaterial({ resolvedSelection, materialSources: { local: localSource, peer: peerSource } });

        assert(result.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '4. an ordinary peer:<identity> selection still loads AVAILABLE');
        assert(result.material === peerMaterial, '5. the loaded material is still materialSources.peer\'s own, by reference');
        assert(peerSource.calls.length === 1 && peerSource.calls[0].objectId === 'avatar-section-b', '6. materialSources.peer is still asked exactly once, for the resolved selection');
        assert(localSource.calls.length === 0, '7. a peer-origin selection still never falls back to, or spuriously calls, materialSources.local');

        console.log('✓ Section B: existing peer (origin.startsWith(\'peer:\')) loading remains byte-for-byte unchanged, including "no cross-slot fallback"');
    }

    // ---------------------------------------------------------------
    // Section C — a snapshot:* origin is recognized: no longer an
    // immediate UNAVAILABLE when a valid local material source exists.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section C Publication');
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);

        const snapshotOrigin = materializedSnapshotWorldOrigin('hash-section-c', publication.id);
        assert(typeof snapshotOrigin === 'string' && snapshotOrigin.startsWith('snapshot:'), '8. sanity — a real registered Snapshot\'s own origin genuinely starts with \'snapshot:\'');

        const resolvedSelection = describeWorldEncounterSelectionIdentity({
            kind: WorldEncounterKind.PUBLICATION, objectId: publication.id, origin: snapshotOrigin
        });
        assert(resolvedSelection !== null, '9. sanity — this is a well-formed resolved selection');

        // Exactly the 0.9.165 gap scenario, under every plausible key a
        // caller might have guessed before this fix — proving AVAILABLE
        // comes from materialSources.local, never a new snapshot-named slot.
        const peerSource = new RecordingMaterialSource({ bytes: 'never a peer' });
        const decentralizedSource = new RecordingMaterialSource({ bytes: 'never decentralized' });
        const snapshotNamedSource = new RecordingMaterialSource({ bytes: 'never this guessed slot' });
        const materialSources = { local: localSource, peer: peerSource, decentralized: decentralizedSource, snapshot: snapshotNamedSource };

        const result = await loadWorldEncounterMaterial({ resolvedSelection, materialSources });

        assert(result.status === WorldEncounterMaterialLoadStatus.AVAILABLE, `10. THE FIX — a snapshot:* origin with a valid materialSources.local no longer immediately reports UNAVAILABLE; got '${result.status}'`);
        assert(result.material instanceof Publication && result.material.id === publication.id, '11. the loaded material is the real local Publication, not a synthetic stand-in');
        assert(peerSource.calls.length === 0 && decentralizedSource.calls.length === 0 && snapshotNamedSource.calls.length === 0, '12. none of the other registered sources — including a guessed materialSources.snapshot — was ever called');

        console.log('✓ Section C: a snapshot:<contentHash>:<publicationId> origin is now recognized, dispatching to materialSources.local — never a new, Snapshot-named slot');
    }

    // ---------------------------------------------------------------
    // Section D — correct material identity: publicationId (the resolved
    // selection's own objectId) decides which Publication loads;
    // contentHash never does.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publicationA = publishOwnPublication(storageProvider, 'Publication A');
        const publicationB = publishOwnPublication(storageProvider, 'Publication B');
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);

        const originA = materializedSnapshotWorldOrigin('hash-A', publicationA.id);
        const originB = materializedSnapshotWorldOrigin('hash-B', publicationB.id);
        // Same publicationId as A, a DIFFERENT contentHash — proving
        // contentHash plays no role in which Publication loads.
        const originAAgain = materializedSnapshotWorldOrigin('hash-A-different-snapshot-bytes', publicationA.id);

        const selectionA = describeWorldEncounterSelectionIdentity({ kind: WorldEncounterKind.PUBLICATION, objectId: publicationA.id, origin: originA });
        const selectionB = describeWorldEncounterSelectionIdentity({ kind: WorldEncounterKind.PUBLICATION, objectId: publicationB.id, origin: originB });
        const selectionAAgain = describeWorldEncounterSelectionIdentity({ kind: WorldEncounterKind.PUBLICATION, objectId: publicationA.id, origin: originAAgain });

        const resultA = await loadWorldEncounterMaterial({ resolvedSelection: selectionA, materialSources: { local: localSource } });
        const resultB = await loadWorldEncounterMaterial({ resolvedSelection: selectionB, materialSources: { local: localSource } });
        const resultAAgain = await loadWorldEncounterMaterial({ resolvedSelection: selectionAAgain, materialSources: { local: localSource } });

        assert(resultA.status === WorldEncounterMaterialLoadStatus.AVAILABLE && resultA.material.id === publicationA.id && resultA.material.title === 'Publication A', '13. selecting Snapshot A loads Publication A, never B');
        assert(resultB.status === WorldEncounterMaterialLoadStatus.AVAILABLE && resultB.material.id === publicationB.id && resultB.material.title === 'Publication B', '14. selecting Snapshot B loads Publication B, never A');
        assert(resultA.material.id !== resultB.material.id, '15. the two loaded materials are genuinely distinct Publications');
        assert(resultAAgain.status === WorldEncounterMaterialLoadStatus.AVAILABLE && resultAAgain.material.id === publicationA.id, '16. a DIFFERENT contentHash for the SAME publicationId still loads Publication A — contentHash is content identity, never World material identity');

        console.log('✓ Section D: correct material identity — publicationId (the resolved selection\'s own objectId) decides which Publication loads; contentHash is irrelevant to loading itself, exactly as this milestone\'s own brief requires');
    }

    // ---------------------------------------------------------------
    // Section E — no network rediscovery: Nostr/Arweave/candidate-search
    // collaborators are never invoked, and the fix imports none of that
    // infrastructure.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section E Publication');
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);

        class ThrowingNetworkedSource extends WorldEncounterMaterialSource {
            async load() { throw new Error('Section E: a network-shaped source must NEVER be reached for a snapshot:* origin'); }
        }
        const peerSource = new ThrowingNetworkedSource();
        const decentralizedSource = new ThrowingNetworkedSource();
        const snapshotNamedSource = new ThrowingNetworkedSource();

        const resolvedSelection = describeWorldEncounterSelectionIdentity({
            kind: WorldEncounterKind.PUBLICATION, objectId: publication.id,
            origin: materializedSnapshotWorldOrigin('hash-section-e', publication.id)
        });

        const result = await loadWorldEncounterMaterial({
            resolvedSelection,
            materialSources: { local: localSource, peer: peerSource, decentralized: decentralizedSource, snapshot: snapshotNamedSource }
        });
        assert(result.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '17. sanity — loading still succeeds through materialSources.local alone');

        // Structural confirmation: the production file itself never
        // imports or references Nostr/Arweave/candidate-resolution
        // infrastructure — behind this point, none of that is even
        // reachable code, never merely unreached at runtime.
        const source = await readFile(new URL('../application/WorldEncounterMaterialLoading.js', import.meta.url), 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        const forbidden = [
            'Nostr', 'nostr', 'Arweave', 'arweave', 'DecentralizedSnapshotResolver',
            'NostrSnapshotDiscoveryQueryService', 'NostrSnapshotDiscoveryPublisher',
            'DiscoverSnapshotCandidatesCommand', 'SnapshotPlacementStoreRegistry',
            'window.nostr', 'window.arweaveWallet', 'WebSocket', 'fetch('
        ];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `18. application/WorldEncounterMaterialLoading.js never references '${term}' — no network rediscovery infrastructure is ever imported here`);
        }

        console.log('✓ Section E: no network rediscovery — a network-shaped peer/decentralized/snapshot-named source is never invoked (it would throw if it were), and the production fix itself imports no Nostr/Arweave/candidate-resolution infrastructure');
    }

    // ---------------------------------------------------------------
    // Section F — no re-materialization: loading a World Encounter never
    // writes to storage, and never re-invokes the materialization
    // boundary. MATERIALIZE -> REGISTER -> LOAD, never LOAD -> secretly
    // MATERIALIZE.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section F Publication');
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);

        let saveCallCount = 0;
        const originalSave = storageProvider.save.bind(storageProvider);
        storageProvider.save = (...args) => { saveCallCount += 1; return originalSave(...args); };

        const resolvedSelection = describeWorldEncounterSelectionIdentity({
            kind: WorldEncounterKind.PUBLICATION, objectId: publication.id,
            origin: materializedSnapshotWorldOrigin('hash-section-f', publication.id)
        });
        const result = await loadWorldEncounterMaterial({ resolvedSelection, materialSources: { local: localSource } });

        assert(result.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '19. sanity — loading still succeeds');
        assert(saveCallCount === 0, '20. loading a World Encounter Material never writes to storage — retrieval only, never a hidden re-materialization');

        // Structural confirmation: neither the fix's own file nor the
        // local material source it routes to references the
        // materialization boundary at all.
        const loadingSource = await readFile(new URL('../application/WorldEncounterMaterialLoading.js', import.meta.url), 'utf8');
        const localSourceCode = await readFile(new URL('../application/LocalWorldEncounterMaterialSource.js', import.meta.url), 'utf8');
        for (const [label, code] of [['application/WorldEncounterMaterialLoading.js', loadingSource], ['application/LocalWorldEncounterMaterialSource.js', localSourceCode]]) {
            const codeOnly = code.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
            assert(!codeOnly.includes('StoreSnapshotContentUseCase'), `21. ${label} never references StoreSnapshotContentUseCase — MATERIALIZE stays strictly upstream of LOAD`);
            assert(!/\.put\(/.test(codeOnly), `22. ${label} never calls a ContentStore's own .put() — loading never writes content`);
        }

        console.log('✓ Section F: no re-materialization — loading a World Encounter Material never writes to storage and never re-invokes the materialization boundary; MATERIALIZE -> REGISTER -> LOAD stays one-directional');
    }

    // ---------------------------------------------------------------
    // Section G — failure behavior: an already-materialized local source
    // that cannot provide the content still degrades to the existing
    // UNAVAILABLE vocabulary; no new status is introduced.
    // ---------------------------------------------------------------
    {
        assert(Object.keys(WorldEncounterMaterialLoadStatus).sort().join(',') === 'AVAILABLE,UNAVAILABLE', '23. no third status was invented for a Snapshot-origin miss — still exactly UNAVAILABLE/AVAILABLE');

        // A snapshot:* selection naming a Publication this storage never
        // actually holds (never published here) — the same "not currently
        // available" miss materialSources.local already reports for
        // 'local'-origin selections.
        const emptyStorageProvider = new InMemoryStorageProvider();
        const localSource = new LocalWorldEncounterMaterialSource(emptyStorageProvider);
        const resolvedSelection = describeWorldEncounterSelectionIdentity({
            kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-never-published',
            origin: materializedSnapshotWorldOrigin('hash-section-g', 'pub-never-published')
        });
        const missResult = await loadWorldEncounterMaterial({ resolvedSelection, materialSources: { local: localSource } });
        assert(missResult.status === WorldEncounterMaterialLoadStatus.UNAVAILABLE, '24. a snapshot:* selection whose local source genuinely lacks the content still reports UNAVAILABLE');
        assert(missResult.material === null, '25. UNAVAILABLE still never carries material');
        assert(missResult.resolvedSelection === resolvedSelection, '26. UNAVAILABLE still carries the exact resolvedSelection it was given, origin included — unchanged from every other origin family');

        // A snapshot:* selection with no materialSources.local registered
        // at all — the identical "no source, no material" UNAVAILABLE
        // every other origin family already reports.
        const noSourceResult = await loadWorldEncounterMaterial({ resolvedSelection, materialSources: {} });
        assert(noSourceResult.status === WorldEncounterMaterialLoadStatus.UNAVAILABLE, '27. a snapshot:* origin with no materialSources.local registered at all still reports UNAVAILABLE, exactly as it did before this fix');

        console.log('✓ Section G: failure behavior is unchanged — a snapshot:* miss degrades to the existing UNAVAILABLE vocabulary; no new Snapshot-specific failure status was introduced');
    }

    // ---------------------------------------------------------------
    // Section H — rendering regression: through the real, unmodified
    // WorldEncounterCanvas machinery, a Snapshot marker progresses from
    // "World Encounter" to "World Encounter Material."
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section H Publication');
        const placementRegistry = new LocalPlacementRegistry(storageProvider);
        placeReal(placementRegistry, publication.id, { x: 4, y: 0, z: 8 });
        const placementInfo = placementInfoFor(placementRegistry, publication.id);

        const materialization = { outcome: StoreSnapshotContentOutcome.STORED, contentHash: 'hash-section-h' };
        const worldPlacementResult = resolveSnapshotWorldPlacement(materialization, placementInfo);
        assert(worldPlacementResult.outcome === SnapshotWorldPlacementOutcome.PLACED, '28. sanity — placement succeeds against a real, pre-existing WorldPlacement');

        const registry = new WorldDiscoverySourceRegistry();
        const registration = registerMaterializedSnapshotWorldSource(registry, worldPlacementResult, publication);
        assert(registration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '29. sanity — the Snapshot registers successfully');

        const canvas = buildCanvasInstance({ registry });
        mountCanvas(canvas);

        const projectedBeforeSelection = projectedPublicationsOf(canvas);
        assert(projectedBeforeSelection.some((p) => p.objectId === publication.id), '30. the registered Snapshot is already a rendered "World Encounter" marker before any selection — unaffected by this milestone');

        // materialSources is a prop data() never seeds; wired here exactly
        // as ui/main.js's own real composition root would.
        canvas.materialSources = { local: new LocalWorldEncounterMaterialSource(storageProvider) };
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id });
        await flush();

        assert(canvas.selectionOutcome && canvas.selectionOutcome.status === 'RESOLVED', '31. exactly one source contributes this Publication, so selection resolves automatically, unambiguously');
        assert(canvas.resolvedEncounterSelection && canvas.resolvedEncounterSelection.origin.startsWith('snapshot:'), '32. the resolved selection genuinely carries the Snapshot\'s own origin');
        assert(canvas.materialInspection !== null && canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, `33. THE UX CHANGE — clicking/selecting the Snapshot marker now progresses to AVAILABLE material, through the SAME unmodified refreshMaterialInspection()/inspectWorldEncounterMaterial() machinery every other World Encounter already uses; got '${canvas.materialInspection && canvas.materialInspection.loading.status}'`);
        assert(canvas.materialInspection.loading.material.id === publication.id, '34. the rendered material panel would show the SAME Publication the marker itself names — "World Encounter" has become "World Encounter Material"');

        unmountCanvas(canvas);
        console.log('✓ Section H: rendering regression — a Snapshot marker progresses from "World Encounter" to "World Encounter Material" through the real, entirely unmodified WorldEncounterCanvas machinery');
    }

    // ---------------------------------------------------------------
    // Section I — the full flagship: Nostr discovery -> candidate ->
    // selection -> resolution -> verification -> materialization ->
    // placement -> registration -> World encounter -> selection ->
    // material loading -> rendered material, through real composition
    // boundaries throughout.
    // ---------------------------------------------------------------
    {
        // The local user's own already-published Publication — exactly
        // what ui/components/OwnPublicationPanel.js's own `publication`
        // prop already is, genuinely persisted in `storageProvider`.
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Flagship Publication');

        // DISCOVER (placement half) — an unrelated Snapshot of this
        // Publication's own content, placed on a real (fake-backed)
        // ArweaveContentStore and announced over a real (fake-backed)
        // Nostr network, exactly as application/SnapshotDistributionCommand.js's
        // own real callers already do.
        const gateway = makeFakeArweaveGateway();
        const store = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: gateway.fetchImpl });
        const network = makeNostrNetwork();
        const discoveryTag = 'flagship-0-9-166';
        const snapshotBytes = JSON.stringify({ world: { note: 'flagship 0.9.166 snapshot content' } });
        const reference = await store.put(snapshotBytes);

        const discoveryPublisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });
        const announced = await discoveryPublisher.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage });
        assert(announced.published === true, '35. sanity — the Snapshot genuinely placed and genuinely announced');

        // DISCOVER (candidate browsing) — application/DiscoverSnapshotCandidatesCommand.js,
        // unmodified.
        const discoveryQueryService = new NostrSnapshotDiscoveryQueryService({ queryImpl: network.queryImpl });
        const candidates = await executeDiscoverSnapshotCandidatesCommand({ discoveryTag, discoveryQueryService });
        assert(candidates.length === 1 && candidates[0].contentHash === reference.hash, '36. exactly one real, discovered candidate names this Snapshot\'s own contentHash');

        // SELECT — a plain, explicit assignment, exactly as
        // ui/components/OwnPublicationPanel.js's own selectSnapshotCandidate() is.
        const selectedSnapshotCandidate = candidates[0];

        // RESOLVE — application/ResolveSelectedSnapshotCommand.js over
        // application/DecentralizedSnapshotResolver.js, unmodified.
        const resolver = new DecentralizedSnapshotResolver(discoveryQueryService);
        const resolution = await executeResolveSelectedSnapshotCommand({ candidate: selectedSnapshotCandidate, resolver, contentStore: store });
        assert(resolution.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, '37. resolution genuinely succeeds — location, retrieval, and verification all passed');
        assert(resolution.bytes === snapshotBytes, '38. the resolved bytes are byte-identical to what was originally placed');

        // VERIFY — the content-hash comparison already performed inside
        // resolveCandidate() IS the observable proof; made explicit here
        // exactly as tests/SnapshotDistributionEndToEndRuntimeAudit.test.js's
        // own Section A already does.
        assert(computeContentHash(resolution.bytes) === reference.hash, '39. the resolved bytes still hash to the originally placed contentHash — verification genuinely ran');

        // MATERIALIZE — application/MaterializeSelectedSnapshotCommand.js
        // over application/MaterializeSnapshotFromSelectedCandidateUseCase.js
        // and application/StoreSnapshotContentUseCase.js, all unmodified —
        // storing into the SAME storageProvider the Publication already
        // lives in, the shared local material boundary this milestone
        // connects to.
        const localContentStore = new LocalContentStore(storageProvider);
        const storeSnapshotContentUseCase = new StoreSnapshotContentUseCase(localContentStore);
        const materializer = new MaterializeSnapshotFromSelectedCandidateUseCase(storeSnapshotContentUseCase);
        const materialization = await executeMaterializeSelectedSnapshotCommand({ resolution, materializer });
        assert(
            materialization.outcome === SnapshotCandidateMaterializationOutcome.STORED
            || materialization.outcome === SnapshotCandidateMaterializationOutcome.ALREADY_AVAILABLE,
            `40. materialization genuinely succeeds; got '${materialization.outcome}'`
        );
        assert(materialization.contentReference.hash === reference.hash, '41. this replica now genuinely possesses the Snapshot\'s own bytes, under the same contentHash');

        // PLACE — application/SnapshotWorldPlacement.js, against a real,
        // pre-existing WorldPlacement for this Publication.
        const placementRegistry = new LocalPlacementRegistry(storageProvider);
        placeReal(placementRegistry, publication.id, { x: 11, y: 0, z: 21 });
        const placementInfo = placementInfoFor(placementRegistry, publication.id);
        const worldPlacementResult = resolveSnapshotWorldPlacement(materialization, placementInfo);
        assert(worldPlacementResult.outcome === SnapshotWorldPlacementOutcome.PLACED, '42. placement genuinely succeeds');
        assert(worldPlacementResult.publicationId === publication.id, '43. the placement result names this exact Publication');

        // REGISTER — application/MaterializedSnapshotWorldDiscoveryBridge.js,
        // unmodified.
        const registry = new WorldDiscoverySourceRegistry();
        const registration = registerMaterializedSnapshotWorldSource(registry, worldPlacementResult, publication);
        assert(registration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '44. registration genuinely succeeds');
        const snapshotOrigin = materializedSnapshotWorldOrigin(worldPlacementResult.contentHash, worldPlacementResult.publicationId);
        assert(registration.origin === snapshotOrigin, '45. the registered origin is exactly the derived snapshot:<contentHash>:<publicationId> string');

        // World encounter — the real, unmodified WorldEncounterCanvas,
        // observing the SAME registry.
        const canvas = buildCanvasInstance({ registry });
        mountCanvas(canvas);
        const projected = projectedPublicationsOf(canvas);
        assert(projected.some((p) => p.objectId === publication.id), '46. the registered Snapshot reaches a rendered World Encounter marker');
        const raw = viewById(registry)[publication.id];
        assert(raw && raw.x === 11 && raw.z === 21, '47. the rendered encounter carries the exact position resolveSnapshotWorldPlacement() borrowed from the pre-existing WorldPlacement, never recomputed');

        // Selection — a Wanderer selecting the marker.
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id });
        assert(canvas.selectionOutcome.status === 'RESOLVED', '48. selection resolves unambiguously — only one source contributes this Publication');
        assert(canvas.resolvedEncounterSelection.origin === snapshotOrigin, '49. the resolved selection carries exactly the registered Snapshot\'s own origin');

        // Material loading — application/WorldEncounterMaterialLoading.js's
        // own 0.9.166 fix, reached through the real, unmodified
        // refreshMaterialInspection()/inspectWorldEncounterMaterial()
        // orchestration, using the SAME storageProvider the Publication
        // and its materialized Snapshot content both already live in.
        canvas.materialSources = { local: new LocalWorldEncounterMaterialSource(storageProvider) };
        canvas.refreshMaterialInspection();
        await flush();

        // Rendered material.
        assert(canvas.materialInspection !== null, '50. FLAGSHIP — the full pipeline ends in a real material inspection result, not merely a rendered marker');
        assert(canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, `51. FLAGSHIP — the discovered, resolved, verified, materialized, placed, and registered Snapshot's own World Encounter now loads AVAILABLE material; got '${canvas.materialInspection.loading.status}'`);
        assert(canvas.materialInspection.loading.material instanceof Publication && canvas.materialInspection.loading.material.id === publication.id, '52. FLAGSHIP — the rendered material is the exact, real Publication this entire pipeline started from');
        assert(canvas.materialInspection.loading.material.title === 'Flagship Publication', '53. FLAGSHIP — the rendered material carries its own real title, all the way through the pipeline');
        assert(Object.keys(canvas.materialSources).sort().join(',') === 'local', '54. FLAGSHIP — exactly one materialSources slot was ever wired (local) — no snapshot-named slot was needed anywhere in this pipeline');

        unmountCanvas(canvas);
        console.log('✓ Section I: FLAGSHIP — Nostr discovery -> candidate -> selection -> resolution -> verification -> materialization -> placement -> registration -> World encounter -> selection -> material loading -> rendered material, entirely through real composition boundaries');
    }

    console.log('\n✅ All Snapshot World Encounter Material Loading tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
