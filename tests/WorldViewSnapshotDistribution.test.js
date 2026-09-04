import { readFile } from 'node:fs/promises';

import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { executeSnapshotDistributionCommand } from '../application/SnapshotDistributionCommand.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/NostrSnapshotDiscoveryQueryService.js';
import { SnapshotPlacementStoreRegistry } from '../application/SnapshotPlacementStoreRegistry.js';
import { DecentralizedSnapshotResolver } from '../application/DecentralizedSnapshotResolver.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { Publication } from '../publisher/Publication.js';
import { WorldEncounterMaterialLoadStatus } from '../application/WorldEncounterMaterialLoading.js';

// 0.9.138 — World View Snapshot Distribution Action.
//
// 0.9.137's own composeSnapshotDistributionRuntime() turned a host
// signing/publishing capability into a real { contentStore,
// discoveryPublisher } pair; 0.9.136's own executeSnapshotDistributionCommand()
// sequences that pair against caller-supplied bytes. Neither ever reached a
// user — this milestone is that reach: a "Distribute Snapshot" action on
// WorldEncounterCanvas's own new Snapshot Distribution panel, calling
// exactly one caller-injected function — snapshotDistributionCommand,
// (publication) -> Promise<{ contentReference, announcement }> — with the
// same Publication domain object 0.9.39's own material inspection already
// loads. ui/views/WorldView.js supplies that function as a thin wrapper
// around the app-wide snapshotDistributionCommand (composed once in
// ui/main.js), adding only the already-stored Snapshot bytes read back
// through publicationCatalogContentResolver — the SAME collaborator
// application/CreateExternalSnapshotPlacementUseCase.js (0.8.18) already
// reads a Snapshot's own local bytes through for the older, peer-based
// placement family.
//
// Deliberately NOT a mechanical copy of tests/WorldViewPublicationDistributionActionIntegration.test.js
// (0.9.104) — two things differ, because the underlying command does:
//
//   - Section D exists at all because this family has no lifecycle store:
//     WorldEncounterCanvas stores the resolved { contentReference,
//     announcement } result directly, in ephemeral state, rather than
//     relying on a live subscription the way the Signed Claim family does.
//   - Section F tests a legitimate PARTIAL success (placement without
//     announcement) rather than only a genuine rejection, because
//     application/SnapshotDistributionCommand.js's own contract makes that
//     outcome a first-class, non-error case.
//
// Section A: action contract — the action reads this replica's own already-
//            stored Snapshot bytes and forwards them, never inventing a new
//            serialization mechanism of its own.
// Section B: command boundary (structural) — WorldEncounterCanvas.js calls
//            only the injected snapshotDistributionCommand, never
//            ArweaveContentStore/NostrSnapshotDiscoveryPublisher directly.
// Section C: FLAGSHIP — a real selection, real Snapshot bytes, a real
//            snapshotDistributionCommand backed by the real Arweave/Nostr
//            chain, then discovered, resolved, retrieved, and hash-verified
//            through the already-existing decentralized retrieval path.
// Section D: success presentation — the resolved contentReference/
//            announcement are exposed to the template exactly as the
//            command produced them, never reinterpreted or re-wrapped.
// Section E: placement failure — an Arweave failure prevents any Nostr
//            announcement attempt, and never fabricates a result.
// Section F: discovery decline — a successful placement remains successful
//            even when Nostr never announces it; no rollback, no error.
// Section G: repeated clicks while a call is in flight never start a
//            second, overlapping call.
// Section H: switching the selection resets ephemeral execution/error/
//            result state and ignores a stale in-flight response.
// Section I: architectural regression — ui/main.js is the only file that
//            composes the runtime or calls the command directly; neither
//            WorldEncounterCanvas.js nor WorldView.js ever touches
//            window.arweaveWallet/window.nostr, WebSocket, or any
//            Arweave/Nostr construction of their own.

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

// Mirrors tests/SnapshotDistributionCommand.test.js's own
// makeFakeArweaveGateway()/makeFakeArweaveSigner()/makeNostrNetwork().
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
        return { id: `fake-world-view-tx-${counter}`, transaction: { id: `fake-world-view-tx-${counter}`, data: material } };
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

// A fake application/PublicationCatalogContentResolver.js — duck-typed
// resolve(publicationId), exactly the one method ui/views/WorldView.js's
// own distributeWorldEncounterSnapshot() ever calls on it.
function fakeContentResolver(entries = {}) {
    return {
        resolve(publicationId) {
            return Object.prototype.hasOwnProperty.call(entries, publicationId) ? entries[publicationId] : null;
        }
    };
}

// The EXACT logic ui/views/WorldView.js's own distributeWorldEncounterSnapshot()
// implements — see this file's own header and that function's own comment.
// Reproduced here (rather than imported) for the identical reason
// tests/WorldViewPublicationDistributionActionIntegration.test.js's own
// realDistributionCommand() is: WorldView.js's function lives inside its
// own setup(), not exported. Section I's own structural checks verify the
// real file actually implements this shape.
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

function canvasCtx(overrides = {}) {
    const ctx = {
        selectedEncounter: null,
        materialInspection: null,
        distributionLifecycleStore: null,
        distributionLifecycle: null,
        unsubscribeDistributionLifecycle: null,
        distributionCommand: null,
        distributionExecuting: false,
        distributionError: null,
        distributionRequestId: 0,
        snapshotDistributionCommand: null,
        snapshotDistributionExecuting: false,
        snapshotDistributionError: null,
        snapshotDistributionResult: null,
        snapshotDistributionRequestId: 0,
        selectEncounter: WorldEncounterCanvas.methods.selectEncounter,
        refreshSelectionOutcome: WorldEncounterCanvas.methods.refreshSelectionOutcome,
        refreshMaterialInspection: WorldEncounterCanvas.methods.refreshMaterialInspection,
        refreshDecentralizedLeadOutcome: WorldEncounterCanvas.methods.refreshDecentralizedLeadOutcome,
        refreshDistributionLifecycle: WorldEncounterCanvas.methods.refreshDistributionLifecycle,
        stopSubscription: WorldEncounterCanvas.methods.stopSubscription,
        distributeSelectedSnapshot: WorldEncounterCanvas.methods.distributeSelectedSnapshot,
        registry: null,
        worldDiscoveryLeadRegistry: null,
        materialSources: null,
        materialVerifier: null,
        resolvedSelectionChoice: null,
        resolvedLeadChoice: null,
        decentralizedLeadOutcome: null,
        selectionOutcome: null,
        materialInspectionRequestId: 0,
        ...overrides
    };
    Object.defineProperty(ctx, 'distributablePublication', {
        get() { return WorldEncounterCanvas.computed.distributablePublication.call(ctx); }
    });
    return ctx;
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — action contract: the action reads this replica's own
    // already-stored Snapshot bytes and forwards them verbatim.
    // ---------------------------------------------------------------
    {
        const publication = new Publication({ id: 'pub-snapshot-a', documentId: 'doc-a' });
        const snapshotJson = { world: { buildings: [{ id: 'action-contract-building', bricks: 2 }] } };
        const contentResolver = fakeContentResolver({ [publication.id]: snapshotJson });
        let receivedBytes = null;
        const action = makeSnapshotDistributionAction({
            snapshotDistributionCommand: (bytes) => { receivedBytes = bytes; return Promise.resolve({ contentReference: {}, announcement: null }); },
            publicationCatalogContentResolver: contentResolver
        });

        await action(publication);
        assert(receivedBytes === JSON.stringify(snapshotJson),
            '1. the action forwards exactly JSON.stringify() of the already-resolved Snapshot JSON — no re-serialization of its own');

        // No resolver, or no command: the action never fabricates bytes,
        // and rejects instead of silently doing nothing.
        let calls = 0;
        const noResolverAction = makeSnapshotDistributionAction({
            snapshotDistributionCommand: () => { calls += 1; return Promise.resolve(null); },
            publicationCatalogContentResolver: null
        });
        await noResolverAction(publication).catch(() => {});
        assert(calls === 0, '2. with no publicationCatalogContentResolver, the action never calls snapshotDistributionCommand');

        const unresolvedAction = makeSnapshotDistributionAction({
            snapshotDistributionCommand: () => { calls += 1; return Promise.resolve(null); },
            publicationCatalogContentResolver: fakeContentResolver({})
        });
        await unresolvedAction(publication).catch(() => {});
        assert(calls === 0, '3. with no locally stored Snapshot bytes for this publication, the action never calls snapshotDistributionCommand');

        console.log('✓ Section A: the action supplies exactly the already-stored Snapshot bytes, never inventing a serialization of its own');
    }

    // ---------------------------------------------------------------
    // Section B — command boundary (structural): WorldEncounterCanvas.js
    // calls only the injected snapshotDistributionCommand.
    // ---------------------------------------------------------------
    {
        const code = await codeOnlySource('ui/components/WorldEncounterCanvas.js');
        const forbiddenConstruction = [
            "from '../../content/ArweaveContentStore.js'",
            "from '../../application/NostrSnapshotDiscoveryPublisher.js'",
            "from '../../application/SnapshotDistributionCommand.js'",
            "from '../../application/SnapshotDistributionRuntimeComposition.js'",
            'new ArweaveContentStore(', 'new NostrSnapshotDiscoveryPublisher(',
            'executeSnapshotDistributionCommand(', 'composeSnapshotDistributionRuntime('
        ];
        for (const term of forbiddenConstruction) {
            assert(!code.includes(term), `4. WorldEncounterCanvas.js never imports or constructs '${term}' — only the injected prop`);
        }
        assert((code.match(/this\.snapshotDistributionCommand\(/g) || []).length === 1,
            '5. snapshotDistributionCommand is called from exactly one place');
        assert(code.includes('distributeSelectedSnapshot') && code.includes('snapshotDistributionResult'),
            '6. the new method/state are actually present');

        console.log('✓ Section B: WorldEncounterCanvas.js invokes only the injected command, never a concrete Arweave/Nostr collaborator');
    }

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP: World View action -> command -> Arweave
    // placement -> Nostr announcement -> Nostr discovery -> Arweave
    // retrieval -> content hash verification -> same original bytes.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeArweaveGateway();
        const store = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: gateway.fetchImpl });
        const network = makeNostrNetwork();
        const discoveryTag = 'flagship-world-view-snapshot-distribution';
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });

        const publication = new Publication({ id: 'pub-snapshot-flagship', documentId: 'doc-flagship' });
        const snapshotJson = { world: { buildings: [{ id: 'flagship-building', bricks: 9 }] } };
        const expectedBytes = JSON.stringify(snapshotJson);
        const expectedHash = computeContentHash(expectedBytes);
        const contentResolver = fakeContentResolver({ [publication.id]: snapshotJson });

        const snapshotDistributionCommand = (bytes) => executeSnapshotDistributionCommand({ bytes, contentStore: store, discoveryPublisher: publisher });
        const distributeWorldEncounterSnapshot = makeSnapshotDistributionAction({ snapshotDistributionCommand, publicationCatalogContentResolver: contentResolver });

        const ctx = canvasCtx({ snapshotDistributionCommand: distributeWorldEncounterSnapshot });
        ctx.selectedEncounter = { kind: 'PUBLICATION', objectId: publication.id };
        ctx.materialInspection = { loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, material: publication } };

        assert(ctx.distributablePublication === publication, '7. FLAGSHIP — distributablePublication is the exact loaded Publication object');

        ctx.distributeSelectedSnapshot();
        assert(ctx.snapshotDistributionExecuting === true, '8. FLAGSHIP — the action enters executing state synchronously on click');

        await flushMicrotasks();

        assert(ctx.snapshotDistributionExecuting === false, '9. FLAGSHIP — execution returns to idle once the command resolves');
        assert(ctx.snapshotDistributionError === null, '10. FLAGSHIP — a successful call leaves no error notice');
        assert(ctx.snapshotDistributionResult.contentReference.hash === expectedHash,
            '11. FLAGSHIP — the panel holds the real placement\'s own content hash');
        assert(ctx.snapshotDistributionResult.announcement.published === true,
            '12. FLAGSHIP — the panel holds a real, genuinely published Nostr announcement');

        // Discover -> resolve -> retrieve -> verify, entirely through the
        // already-existing 0.9.134 retrieval path — this milestone builds
        // no new retrieval logic of its own.
        const registry = new SnapshotPlacementStoreRegistry();
        registry.register(store);
        const query = new NostrSnapshotDiscoveryQueryService({ queryImpl: network.queryImpl });
        const resolver = new DecentralizedSnapshotResolver(query);

        const resolved = await resolver.resolve(discoveryTag, expectedHash, { storeRegistry: registry });
        assert(resolved.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED,
            '13. FLAGSHIP — the Snapshot this World View click distributed resolves fully through the existing decentralized retrieval path');
        assert(resolved.bytes === expectedBytes,
            '14. FLAGSHIP — the retrieved bytes are byte-identical to the original Snapshot the World View action was given');
        assert(computeContentHash(resolved.bytes) === expectedHash,
            '15. FLAGSHIP — the resolved bytes still hash to the originally-expected contentHash');

        console.log('✓ Section C (FLAGSHIP): a World View click reaches the real Arweave/Nostr chain and the distributed Snapshot round-trips byte-identical');
    }

    // ---------------------------------------------------------------
    // Section D — success presentation: the resolved result is exposed
    // exactly as the command produced it, never reinterpreted.
    // ---------------------------------------------------------------
    {
        const publication = new Publication({ id: 'pub-snapshot-d', documentId: 'doc-d' });
        const sentinelResult = Object.freeze({
            contentReference: Object.freeze({ hash: 'sentinel-hash', uri: 'ar://sentinel', storage: 'ar' }),
            announcement: Object.freeze({ published: true, relayUrl: 'wss://relay.example', id: 'sentinel-event-id' })
        });
        const ctx = canvasCtx({
            selectedEncounter: { kind: 'PUBLICATION', objectId: publication.id },
            materialInspection: { loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, material: publication } },
            snapshotDistributionCommand: () => Promise.resolve(sentinelResult)
        });

        ctx.distributeSelectedSnapshot();
        await flushMicrotasks();

        assert(ctx.snapshotDistributionResult === sentinelResult,
            '16. the exact object the command resolved to is stored verbatim — no copy, no re-wrapping, no new shape');
        assert(ctx.snapshotDistributionResult.contentReference.hash === 'sentinel-hash' && ctx.snapshotDistributionResult.announcement.id === 'sentinel-event-id',
            '17. contentReference and announcement are both readable directly off the stored result, unmodified');

        console.log('✓ Section D: a resolved result is stored and exposed exactly as the command produced it');
    }

    // ---------------------------------------------------------------
    // Section E — placement failure prevents any announcement attempt,
    // and never fabricates a result.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeArweaveGateway({ alwaysFail: true });
        const store = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: gateway.fetchImpl });
        let publishCalls = 0;
        const publisher = { discoveryTag: 'section-e-placement-failure', publish: async () => { publishCalls += 1; return { published: true, id: 'x'.repeat(64) }; } };

        const publication = new Publication({ id: 'pub-snapshot-e', documentId: 'doc-e' });
        const contentResolver = fakeContentResolver({ [publication.id]: { world: {} } });
        const snapshotDistributionCommand = (bytes) => executeSnapshotDistributionCommand({ bytes, contentStore: store, discoveryPublisher: publisher });
        const action = makeSnapshotDistributionAction({ snapshotDistributionCommand, publicationCatalogContentResolver: contentResolver });

        const ctx = canvasCtx({
            selectedEncounter: { kind: 'PUBLICATION', objectId: publication.id },
            materialInspection: { loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, material: publication } },
            snapshotDistributionCommand: action
        });

        ctx.distributeSelectedSnapshot();
        await flushMicrotasks();

        assert(publishCalls === 0, '18. an Arweave placement failure means discoveryPublisher.publish() is never even attempted');
        assert(ctx.snapshotDistributionError === 'Snapshot distribution could not be completed.',
            '19. a genuine placement rejection becomes one plain, generic notice — never the underlying error message');
        assert(ctx.snapshotDistributionResult === null, '20. a failed call never fabricates a partial result');

        console.log('✓ Section E: a placement failure prevents any announcement attempt and leaves no fabricated result');
    }

    // ---------------------------------------------------------------
    // Section F — discovery decline: a successful placement remains
    // successful; no rollback, and never treated as an error.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeArweaveGateway();
        const store = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: gateway.fetchImpl });
        const decliningPublisher = { discoveryTag: 'section-f-decline', publish: async () => null };

        const publication = new Publication({ id: 'pub-snapshot-f', documentId: 'doc-f' });
        const snapshotJson = { world: { buildings: [{ id: 'decline-building', bricks: 1 }] } };
        const contentResolver = fakeContentResolver({ [publication.id]: snapshotJson });
        const snapshotDistributionCommand = (bytes) => executeSnapshotDistributionCommand({ bytes, contentStore: store, discoveryPublisher: decliningPublisher });
        const action = makeSnapshotDistributionAction({ snapshotDistributionCommand, publicationCatalogContentResolver: contentResolver });

        const ctx = canvasCtx({
            selectedEncounter: { kind: 'PUBLICATION', objectId: publication.id },
            materialInspection: { loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, material: publication } },
            snapshotDistributionCommand: action
        });

        ctx.distributeSelectedSnapshot();
        await flushMicrotasks();

        assert(ctx.snapshotDistributionError === null,
            '21. a declined announcement is never surfaced as an error — the placement itself genuinely succeeded');
        assert(ctx.snapshotDistributionResult !== null && ctx.snapshotDistributionResult.contentReference.hash === computeContentHash(JSON.stringify(snapshotJson)),
            '22. the real, successful placement is still reported, unaffected by the declined announcement');
        assert(ctx.snapshotDistributionResult.announcement === null,
            '23. announcement stays exactly null — never a fabricated or reinterpreted value');

        console.log('✓ Section F: a successful placement remains successful even when Nostr never announces it');
    }

    // ---------------------------------------------------------------
    // Section G — repeated clicks never start a second, overlapping call.
    // ---------------------------------------------------------------
    {
        let calls = 0;
        let resolveFirst;
        const publication = new Publication({ id: 'pub-snapshot-g', documentId: 'doc-g' });
        const ctx = canvasCtx({
            selectedEncounter: { kind: 'PUBLICATION', objectId: publication.id },
            materialInspection: { loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, material: publication } },
            snapshotDistributionCommand: () => { calls += 1; return new Promise((resolve) => { resolveFirst = resolve; }); }
        });

        ctx.distributeSelectedSnapshot();
        assert(ctx.snapshotDistributionExecuting === true, '24a. the first click enters executing state synchronously');
        ctx.distributeSelectedSnapshot();
        ctx.distributeSelectedSnapshot();
        await Promise.resolve();
        await Promise.resolve();
        assert(calls === 1, '24. clicking repeatedly while a call is in flight never starts a second, overlapping call');

        resolveFirst(null);
        await flushMicrotasks();
        assert(ctx.snapshotDistributionExecuting === false, '25. the in-flight call eventually resolves and returns to idle');

        ctx.distributeSelectedSnapshot();
        await Promise.resolve();
        await Promise.resolve();
        assert(calls === 2, '26. once idle again, a fresh click starts a new call');

        console.log('✓ Section G: repeated clicks never create duplicate simultaneous executions');
    }

    // ---------------------------------------------------------------
    // Section H — switching selection resets ephemeral state and ignores
    // a stale in-flight response.
    // ---------------------------------------------------------------
    {
        let resolveStale;
        const publicationA = new Publication({ id: 'pub-snapshot-h-a', documentId: 'doc-h-a' });
        const publicationB = new Publication({ id: 'pub-snapshot-h-b', documentId: 'doc-h-b' });
        const ctx = canvasCtx({
            snapshotDistributionCommand: () => new Promise((resolve) => { resolveStale = resolve; })
        });

        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: publicationA.id });
        ctx.materialInspection = { loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, material: publicationA } };
        ctx.distributeSelectedSnapshot();
        assert(ctx.snapshotDistributionExecuting === true, '27. a call for publication A starts executing');
        await Promise.resolve();
        await Promise.resolve();

        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: publicationB.id });
        assert(ctx.snapshotDistributionExecuting === false, '28. a fresh selection resets executing state immediately, without waiting for the stale call');
        assert(ctx.snapshotDistributionError === null, '29. a fresh selection also clears any prior error notice');
        assert(ctx.snapshotDistributionResult === null, '30. a fresh selection also clears any prior result');

        // A's own call finally resolves with a real, distinguishable
        // result — its effect must never reach the new selection.
        resolveStale({ contentReference: { hash: 'stale-hash', uri: 'ar://stale', storage: 'ar' }, announcement: null });
        await flushMicrotasks();
        assert(ctx.snapshotDistributionExecuting === false, '31. the stale call\'s own resolution never re-enters executing state for the new selection');
        assert(ctx.snapshotDistributionResult === null, '32. the stale call\'s own result never overwrites the new selection\'s state');

        console.log('✓ Section H: switching the selected Publication invalidates a stale in-flight Snapshot distribution response');
    }

    // ---------------------------------------------------------------
    // Section I — architectural regression: only ui/main.js composes the
    // runtime or calls the command directly.
    // ---------------------------------------------------------------
    {
        const canvasCode = await codeOnlySource('ui/components/WorldEncounterCanvas.js');
        const viewCode = await codeOnlySource('ui/views/WorldView.js');
        const mainCode = await codeOnlySource('ui/main.js');

        const forbiddenInUi = [
            'window.arweaveWallet', 'window.nostr', 'WebSocket',
            'new ArweaveContentStore(', 'new NostrSnapshotDiscoveryPublisher(',
            'composeSnapshotDistributionRuntime(', 'executeSnapshotDistributionCommand('
        ];
        for (const term of forbiddenInUi) {
            assert(!canvasCode.includes(term), `33. WorldEncounterCanvas.js never references '${term}'`);
            assert(!viewCode.includes(term), `34. WorldView.js never references '${term}'`);
        }

        assert(viewCode.includes("inject('snapshotDistributionCommand', null)"),
            '35. WorldView.js injects the app-wide snapshotDistributionCommand, defaulting to null');
        assert(viewCode.includes("inject('publicationCatalogContentResolver', null)"),
            '36. WorldView.js injects the existing publicationCatalogContentResolver, defaulting to null — never a second resolver');
        assert(/:snapshotDistributionCommand="distributeWorldEncounterSnapshot"/.test(viewCode),
            '37. WorldView.js forwards its own wrapper to WorldEncounterCanvas as its new snapshotDistributionCommand prop');
        assert(viewCode.includes('function distributeWorldEncounterSnapshot(publication)')
            && viewCode.includes('return snapshotDistributionCommand(JSON.stringify(snapshotJson));'),
            '38. distributeWorldEncounterSnapshot calls the injected snapshotDistributionCommand — never a second command');
        assert(!/publication\.toJSON\(\)/.test(viewCode.split('function distributeWorldEncounterSnapshot')[1]?.split('\n\n')[0] || ''),
            '39. distributeWorldEncounterSnapshot never re-serializes the publication itself — it reads already-stored bytes back instead');

        assert(mainCode.includes('composeSnapshotDistributionRuntime(') && mainCode.includes('executeSnapshotDistributionCommand('),
            '40. ui/main.js is where the Snapshot distribution runtime is actually composed and sequenced');
        assert(mainCode.includes("app.provide('snapshotDistributionCommand', snapshotDistributionCommand)"),
            '41. ui/main.js provides the composed command app-wide, exactly like every other collaborator in this family');

        console.log('✓ Section I: only ui/main.js composes the Snapshot distribution runtime — WorldEncounterCanvas.js and WorldView.js stay entirely ignorant of Arweave/Nostr');
    }

    console.log('\n✅ All World View Snapshot Distribution Action tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
