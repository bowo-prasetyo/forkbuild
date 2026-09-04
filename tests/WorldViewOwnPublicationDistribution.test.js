import { readFile } from 'node:fs/promises';

import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import { executeSnapshotDistributionCommand } from '../application/SnapshotDistributionCommand.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/NostrSnapshotDiscoveryQueryService.js';
import { SnapshotPlacementStoreRegistry } from '../application/SnapshotPlacementStoreRegistry.js';
import { DecentralizedSnapshotResolver } from '../application/DecentralizedSnapshotResolver.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { Publication } from '../publisher/Publication.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';

// 0.9.140 — Own Publication Distribution Entry Point.
//
// 0.9.138 gave WorldEncounterCanvas a "Distribute Snapshot" action, but
// it only ever exists for a currently SELECTED World Encounter — so
// distributing your OWN Snapshot accidentally depended on World
// Encounters having a peer/marker to select in the first place. This
// milestone adds a second, entirely independent entry point —
// ui/components/OwnPublicationPanel.js — that reaches the SAME
// snapshotDistributionCommand with the local user's own current
// Publication, never a World Encounters selection.
//
// Section A: WorldNavigationSession#getPublicationForDocument — the new
//            session query this milestone's own "which Publication is
//            mine right now" question is answered through, exercised
//            against a REAL published document.
// Section B: OwnPublicationPanel's action contract, mirroring
//            tests/WorldViewSnapshotDistribution.test.js's own Section A.
// Section C: command boundary (structural) — OwnPublicationPanel.js
//            calls only the injected snapshotDistributionCommand.
// Section D: FLAGSHIP — zero connected peers, zero World Encounters,
//            a real local Publication, a real Arweave/Nostr chain: the
//            "Distribute Snapshot" action still reaches, places,
//            announces, and the result round-trips through the
//            already-existing decentralized retrieval path.
// Section E: success presentation.
// Section F: placement failure.
// Section G: discovery decline.
// Section H: repeated clicks guarded.
// Section I: a changed (or cleared) publication resets ephemeral state
//            and ignores a stale in-flight response.
// Section J: architectural regression — WorldView.js mounts
//            OwnPublicationPanel outside the World-Encounters/Explore-
//            mode subtree, never nests it inside WorldEncounterCanvas,
//            and OwnPublicationPanel.js never touches Arweave/Nostr
//            directly.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function flushMicrotasks() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

function makeFakeArweaveGateway({ alwaysFail = false } = {}) {
    const network = new Map();
    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        if (options.method === 'POST' && parsed.pathname === '/tx') {
            if (alwaysFail) return new Response('gateway down', { status: 500 });
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
        return { id: `fake-own-pub-tx-${counter}`, transaction: { id: `fake-own-pub-tx-${counter}`, data: material } };
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

// A fake application/PublicationCatalogContentResolver.js — the exact
// duck-typed collaborator ui/views/WorldView.js's own
// distributeWorldEncounterSnapshot() (unmodified by this milestone)
// already reads Snapshot bytes back through.
function fakeContentResolver(entries = {}) {
    return {
        resolve(publicationId) {
            return Object.prototype.hasOwnProperty.call(entries, publicationId) ? entries[publicationId] : null;
        }
    };
}

// The EXACT logic ui/views/WorldView.js's own distributeWorldEncounterSnapshot()
// implements, unmodified by this milestone — reproduced here for the
// identical reason tests/WorldViewSnapshotDistribution.test.js's own
// makeSnapshotDistributionAction() already is.
function makeSnapshotDistributionAction({ snapshotDistributionCommand, publicationCatalogContentResolver }) {
    return (publication) => {
        if (!snapshotDistributionCommand || !publicationCatalogContentResolver) {
            return Promise.reject(new Error('Snapshot distribution is not available.'));
        }
        const snapshotJson = publicationCatalogContentResolver.resolve(publication.id);
        if (snapshotJson === null) {
            return Promise.reject(new Error('Snapshot distribution is not available.'));
        }
        return snapshotDistributionCommand(JSON.stringify(snapshotJson));
    };
}

function panelCtx(overrides = {}) {
    return {
        publication: null,
        snapshotDistributionCommand: null,
        snapshotDistributionExecuting: false,
        snapshotDistributionError: null,
        snapshotDistributionResult: null,
        snapshotDistributionRequestId: 0,
        distributeOwnSnapshot: OwnPublicationPanel.methods.distributeOwnSnapshot,
        ...overrides
    };
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
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

function makeDocument(title) {
    const world = new World();
    const building = new Building({ creator: 'alice' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title, author: 'alice' }) });
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — WorldNavigationSession#getPublicationForDocument,
    // against a REAL published document.
    // ---------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const alice = new LocalIdentityProvider(storage);
        alice.login('alice');
        const contentStore = new LocalContentStore(storage);
        const publisher = new LocalPublisherProvider(storage, contentStore);
        const discoveryProvider = new LocalDiscoveryProvider(storage);

        const publication = publisher.publish(makeDocument('My Own Village'), alice);

        const session = new WorldNavigationSession({ discoveryProvider });
        session._session = stubRenderer();

        const resolved = session.getPublicationForDocument(publication.documentId);
        assert(resolved !== null, '1. getPublicationForDocument resolves a real, published document');
        assert(resolved.id === publication.id, '2. the resolved Publication is the SAME one publisher.publish() just produced');
        assert(resolved.id === session.getPublicationIdForDocument(publication.documentId),
            '3. getPublicationForDocument and getPublicationIdForDocument agree — one reduction, never two');
        assert(resolved.title === 'My Own Village' && resolved.author === 'alice',
            '4. the resolved value is a genuine Publication object, not a bare id or a re-shaped summary');

        assert(session.getPublicationForDocument('no-such-document') === null,
            '5. an unknown/unpublished documentId resolves to null, never a throw or a guess');

        console.log('✓ Section A: WorldNavigationSession#getPublicationForDocument resolves the real Publication for a published document, and null otherwise');
    }

    // ---------------------------------------------------------------
    // Section B — OwnPublicationPanel's action contract.
    // ---------------------------------------------------------------
    {
        const publication = new Publication({ id: 'pub-own-b', documentId: 'doc-b' });
        const snapshotJson = { world: { buildings: [{ id: 'own-pub-building', bricks: 3 }] } };
        const contentResolver = fakeContentResolver({ [publication.id]: snapshotJson });
        let receivedBytes = null;
        const action = makeSnapshotDistributionAction({
            snapshotDistributionCommand: (bytes) => { receivedBytes = bytes; return Promise.resolve({ contentReference: {}, announcement: null }); },
            publicationCatalogContentResolver: contentResolver
        });

        const ctx = panelCtx({ publication, snapshotDistributionCommand: action });
        ctx.distributeOwnSnapshot();
        await flushMicrotasks();
        assert(receivedBytes === JSON.stringify(snapshotJson),
            '6. the action forwards exactly the already-resolved Snapshot JSON, no re-serialization of its own');

        const noPublicationCtx = panelCtx({ publication: null, snapshotDistributionCommand: action });
        noPublicationCtx.distributeOwnSnapshot();
        await flushMicrotasks();
        assert(noPublicationCtx.snapshotDistributionExecuting === false && noPublicationCtx.snapshotDistributionResult === null,
            '7. with no local publication, the action never starts a call');

        console.log('✓ Section B: OwnPublicationPanel forwards the resolved Snapshot bytes verbatim, and stays inert with no local publication');
    }

    // ---------------------------------------------------------------
    // Section C — command boundary (structural).
    // ---------------------------------------------------------------
    {
        const code = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        const forbiddenConstruction = [
            "from '../../content/ArweaveContentStore.js'",
            "from '../../application/NostrSnapshotDiscoveryPublisher.js'",
            "from '../../application/SnapshotDistributionCommand.js'",
            "from '../../application/SnapshotDistributionRuntimeComposition.js'",
            'new ArweaveContentStore(', 'new NostrSnapshotDiscoveryPublisher(',
            'executeSnapshotDistributionCommand(', 'composeSnapshotDistributionRuntime(',
            'window.arweaveWallet', 'window.nostr', 'WebSocket'
        ];
        for (const term of forbiddenConstruction) {
            assert(!code.includes(term), `8. OwnPublicationPanel.js never imports or constructs '${term}'`);
        }
        assert((code.match(/this\.snapshotDistributionCommand\(/g) || []).length === 1,
            '9. snapshotDistributionCommand is called from exactly one place');

        console.log('✓ Section C: OwnPublicationPanel.js invokes only the injected command, never a concrete Arweave/Nostr collaborator');
    }

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP: zero peers, zero World Encounters, a real
    // local Publication, the real Arweave/Nostr chain.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeArweaveGateway();
        const store = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: gateway.fetchImpl });
        const network = makeNostrNetwork();
        const discoveryTag = 'flagship-own-publication-distribution';
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });

        const publication = new Publication({ id: 'pub-own-flagship', documentId: 'doc-own-flagship' });
        const snapshotJson = { world: { buildings: [{ id: 'flagship-own-building', bricks: 4 }] } };
        const expectedBytes = JSON.stringify(snapshotJson);
        const expectedHash = computeContentHash(expectedBytes);
        const contentResolver = fakeContentResolver({ [publication.id]: snapshotJson });

        const snapshotDistributionCommand = (bytes) => executeSnapshotDistributionCommand({ bytes, contentStore: store, discoveryPublisher: publisher });
        const distributeOwnSnapshotAction = makeSnapshotDistributionAction({ snapshotDistributionCommand, publicationCatalogContentResolver: contentResolver });

        // Note what is deliberately ABSENT from this section: no
        // WorldDiscoverySourceRegistry, no WorldEncounterCanvas, no
        // selectedEncounter, no connected peer of any kind. The action
        // reaches the real chain with none of it.
        const ctx = panelCtx({ publication, snapshotDistributionCommand: distributeOwnSnapshotAction });

        ctx.distributeOwnSnapshot();
        assert(ctx.snapshotDistributionExecuting === true, '10. FLAGSHIP — the action enters executing state synchronously on click');

        await flushMicrotasks();

        assert(ctx.snapshotDistributionExecuting === false, '11. FLAGSHIP — execution returns to idle once the command resolves');
        assert(ctx.snapshotDistributionError === null, '12. FLAGSHIP — a successful call leaves no error notice');
        assert(ctx.snapshotDistributionResult.contentReference.hash === expectedHash,
            '13. FLAGSHIP — the panel holds the real placement\'s own content hash');
        assert(ctx.snapshotDistributionResult.announcement.published === true,
            '14. FLAGSHIP — the panel holds a real, genuinely published Nostr announcement');

        const registry = new SnapshotPlacementStoreRegistry();
        registry.register(store);
        const query = new NostrSnapshotDiscoveryQueryService({ queryImpl: network.queryImpl });
        const resolver = new DecentralizedSnapshotResolver(query);

        const resolved = await resolver.resolve(discoveryTag, expectedHash, { storeRegistry: registry });
        assert(resolved.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED,
            '15. FLAGSHIP — the Snapshot this zero-peer click distributed resolves fully through the existing decentralized retrieval path');
        assert(resolved.bytes === expectedBytes,
            '16. FLAGSHIP — the retrieved bytes are byte-identical to the original Snapshot');
        assert(computeContentHash(resolved.bytes) === expectedHash,
            '17. FLAGSHIP — the resolved bytes still hash to the originally-expected contentHash');

        console.log('✓ Section D (FLAGSHIP): with zero peers and zero World Encounters, distributing your own Snapshot still reaches the real Arweave/Nostr chain and round-trips byte-identical');
    }

    // ---------------------------------------------------------------
    // Section E — success presentation stored verbatim.
    // ---------------------------------------------------------------
    {
        const publication = new Publication({ id: 'pub-own-e', documentId: 'doc-own-e' });
        const sentinelResult = Object.freeze({
            contentReference: Object.freeze({ hash: 'sentinel-own-hash', uri: 'ar://sentinel-own', storage: 'ar' }),
            announcement: Object.freeze({ published: true, relayUrl: 'wss://relay.example', id: 'sentinel-own-event-id' })
        });
        const ctx = panelCtx({ publication, snapshotDistributionCommand: () => Promise.resolve(sentinelResult) });

        ctx.distributeOwnSnapshot();
        await flushMicrotasks();

        assert(ctx.snapshotDistributionResult === sentinelResult,
            '18. the exact object the command resolved to is stored verbatim — no copy, no re-wrapping');

        console.log('✓ Section E: a resolved result is stored and exposed exactly as the command produced it');
    }

    // ---------------------------------------------------------------
    // Section F — placement failure prevents any announcement attempt.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeArweaveGateway({ alwaysFail: true });
        const store = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: gateway.fetchImpl });
        let publishCalls = 0;
        const publisher = { discoveryTag: 'section-f-own-placement-failure', publish: async () => { publishCalls += 1; return { published: true, id: 'x'.repeat(64) }; } };

        const publication = new Publication({ id: 'pub-own-f', documentId: 'doc-own-f' });
        const contentResolver = fakeContentResolver({ [publication.id]: { world: {} } });
        const snapshotDistributionCommand = (bytes) => executeSnapshotDistributionCommand({ bytes, contentStore: store, discoveryPublisher: publisher });
        const action = makeSnapshotDistributionAction({ snapshotDistributionCommand, publicationCatalogContentResolver: contentResolver });

        const ctx = panelCtx({ publication, snapshotDistributionCommand: action });
        ctx.distributeOwnSnapshot();
        await flushMicrotasks();

        assert(publishCalls === 0, '19. an Arweave placement failure means discoveryPublisher.publish() is never even attempted');
        assert(ctx.snapshotDistributionError === 'Snapshot distribution could not be completed.',
            '20. a genuine placement rejection becomes one plain, generic notice');
        assert(ctx.snapshotDistributionResult === null, '21. a failed call never fabricates a partial result');

        console.log('✓ Section F: a placement failure prevents any announcement attempt and leaves no fabricated result');
    }

    // ---------------------------------------------------------------
    // Section G — discovery decline: a successful placement remains
    // successful.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeArweaveGateway();
        const store = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: gateway.fetchImpl });
        const decliningPublisher = { discoveryTag: 'section-g-own-decline', publish: async () => null };

        const publication = new Publication({ id: 'pub-own-g', documentId: 'doc-own-g' });
        const snapshotJson = { world: { buildings: [{ id: 'own-decline-building', bricks: 1 }] } };
        const contentResolver = fakeContentResolver({ [publication.id]: snapshotJson });
        const snapshotDistributionCommand = (bytes) => executeSnapshotDistributionCommand({ bytes, contentStore: store, discoveryPublisher: decliningPublisher });
        const action = makeSnapshotDistributionAction({ snapshotDistributionCommand, publicationCatalogContentResolver: contentResolver });

        const ctx = panelCtx({ publication, snapshotDistributionCommand: action });
        ctx.distributeOwnSnapshot();
        await flushMicrotasks();

        assert(ctx.snapshotDistributionError === null, '22. a declined announcement is never surfaced as an error');
        assert(ctx.snapshotDistributionResult !== null && ctx.snapshotDistributionResult.contentReference.hash === computeContentHash(JSON.stringify(snapshotJson)),
            '23. the real, successful placement is still reported');
        assert(ctx.snapshotDistributionResult.announcement === null, '24. announcement stays exactly null');

        console.log('✓ Section G: a successful placement remains successful even when Nostr never announces it');
    }

    // ---------------------------------------------------------------
    // Section H — repeated clicks never start a second, overlapping
    // call.
    // ---------------------------------------------------------------
    {
        let calls = 0;
        let resolveFirst;
        const publication = new Publication({ id: 'pub-own-h', documentId: 'doc-own-h' });
        const ctx = panelCtx({
            publication,
            snapshotDistributionCommand: () => { calls += 1; return new Promise((resolve) => { resolveFirst = resolve; }); }
        });

        ctx.distributeOwnSnapshot();
        assert(ctx.snapshotDistributionExecuting === true, '25a. the first click enters executing state synchronously');
        ctx.distributeOwnSnapshot();
        ctx.distributeOwnSnapshot();
        await Promise.resolve();
        await Promise.resolve();
        assert(calls === 1, '25. clicking repeatedly while a call is in flight never starts a second, overlapping call');

        resolveFirst(null);
        await flushMicrotasks();
        assert(ctx.snapshotDistributionExecuting === false, '26. the in-flight call eventually resolves and returns to idle');

        console.log('✓ Section H: repeated clicks never create duplicate simultaneous executions');
    }

    // ---------------------------------------------------------------
    // Section I — a changed/cleared publication resets ephemeral state
    // and ignores a stale in-flight response.
    // ---------------------------------------------------------------
    {
        let resolveStale;
        const publicationA = new Publication({ id: 'pub-own-i-a', documentId: 'doc-own-i-a' });
        const publicationB = new Publication({ id: 'pub-own-i-b', documentId: 'doc-own-i-b' });
        const ctx = panelCtx({
            publication: publicationA,
            snapshotDistributionCommand: () => new Promise((resolve) => { resolveStale = resolve; })
        });

        ctx.distributeOwnSnapshot();
        assert(ctx.snapshotDistributionExecuting === true, '27. a call for publication A starts executing');
        await Promise.resolve();
        await Promise.resolve();

        // Simulate the host's own `publication` prop changing — exactly
        // what OwnPublicationPanel's own `watch: { publication(...) }`
        // does when Vue detects the prop changed.
        OwnPublicationPanel.watch.publication.call(ctx, publicationB, publicationA);
        ctx.publication = publicationB;
        assert(ctx.snapshotDistributionExecuting === false, '28. a fresh publication resets executing state immediately, without waiting for the stale call');
        assert(ctx.snapshotDistributionError === null, '29. a fresh publication also clears any prior error notice');
        assert(ctx.snapshotDistributionResult === null, '30. a fresh publication also clears any prior result');

        resolveStale({ contentReference: { hash: 'stale-own-hash', uri: 'ar://stale-own', storage: 'ar' }, announcement: null });
        await flushMicrotasks();
        assert(ctx.snapshotDistributionExecuting === false, '31. the stale call\'s own resolution never re-enters executing state');
        assert(ctx.snapshotDistributionResult === null, '32. the stale call\'s own result never overwrites the new publication\'s state');

        // The publication going away entirely (e.g. the active document
        // changed to one that was never published) is exactly the same
        // "identity changed" case as switching to a different one.
        const clearedCtx = panelCtx({ publication: publicationA, snapshotDistributionResult: { contentReference: {}, announcement: null } });
        OwnPublicationPanel.watch.publication.call(clearedCtx, null, publicationA);
        assert(clearedCtx.snapshotDistributionResult === null, '33. the publication being cleared also resets a prior result');

        console.log('✓ Section I: a changed or cleared publication invalidates a stale in-flight response and resets ephemeral state');
    }

    // ---------------------------------------------------------------
    // Section J — architectural regression.
    // ---------------------------------------------------------------
    {
        const sessionCode = await codeOnlySource('application/WorldNavigationSession.js');
        assert(sessionCode.includes('getPublicationForDocument(documentId)'),
            '34. WorldNavigationSession.js exposes getPublicationForDocument()');

        const viewCode = await codeOnlySource('ui/views/WorldView.js');
        assert(viewCode.includes("import OwnPublicationPanel from '../components/OwnPublicationPanel.js';"),
            '35. WorldView.js imports OwnPublicationPanel');
        assert(viewCode.includes('session.getPublicationForDocument(activeId)'),
            '36. WorldView.js reads ownPublication from session.getPublicationForDocument, never from a World Encounters selection');

        const ownPanelIndex = viewCode.indexOf('<OwnPublicationPanel');
        const worldEncountersSectionIndex = viewCode.indexOf('title="World Encounters"');
        const primaryNavIndex = viewCode.indexOf('world-view-primary-nav');
        assert(ownPanelIndex !== -1, '37. WorldView.js mounts OwnPublicationPanel');
        assert(ownPanelIndex < primaryNavIndex,
            '38. OwnPublicationPanel is mounted OUTSIDE (before) the Explore/Map/Places primary-mode toolbar — never gated on a particular primary mode');
        assert(ownPanelIndex < worldEncountersSectionIndex,
            '39. OwnPublicationPanel is mounted entirely separately from, and before, the World Encounters section — never nested inside it');

        const canvasCode = await codeOnlySource('ui/components/WorldEncounterCanvas.js');
        assert(!canvasCode.includes('OwnPublicationPanel'), '40. WorldEncounterCanvas.js is untouched by this milestone — it knows nothing of OwnPublicationPanel');

        const panelCode = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        const forbiddenInUi = [
            'window.arweaveWallet', 'window.nostr', 'WebSocket',
            'new ArweaveContentStore(', 'new NostrSnapshotDiscoveryPublisher(',
            'composeSnapshotDistributionRuntime(', 'executeSnapshotDistributionCommand(',
            'selectedEncounter', 'WorldDiscoverySourceRegistry', 'worldDiscoverySourceRegistry'
        ];
        for (const term of forbiddenInUi) {
            assert(!panelCode.includes(term), `41. OwnPublicationPanel.js never references '${term}'`);
        }

        assert(/<OwnPublicationPanel[\s\S]{0,300}:snapshotDistributionCommand="distributeWorldEncounterSnapshot"/.test(viewCode),
            '42. OwnPublicationPanel reuses the SAME distributeWorldEncounterSnapshot wrapper WorldEncounterCanvas already uses — never a second command');

        console.log('✓ Section J: OwnPublicationPanel is mounted as a separate surface, independent of primary mode and World Encounters, reusing the existing command boundary');
    }

    console.log('\n✅ All Own Publication Distribution Entry Point tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
