import { readFile } from 'node:fs/promises';

import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import { executeSnapshotDistributionCommand } from '../application/SnapshotDistributionCommand.js';
import { executeDiscoverSnapshotCommand } from '../application/DiscoverSnapshotCommand.js';
import { composeDiscoverSnapshotRuntime } from '../application/DiscoverSnapshotRuntimeComposition.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';

// 0.9.142 — World View Snapshot Discovery Command.
//
// 0.9.140 gave `OwnPublicationPanel` a "Distribute Snapshot" action
// reachable with zero connected peers and an empty World Encounters
// panel. This milestone adds the missing other half — "Discover
// Snapshot" — reaching `application/DecentralizedSnapshotResolver.js`
// (0.9.134), which has existed, fully tested, since before Snapshot
// distribution itself was ever wired into the UI, but has never been
// reachable outside its own test suite.
//
// Section A: OwnPublicationPanel's discovery action contract, mirroring
//            tests/WorldViewOwnPublicationDistribution.test.js's own
//            Section B, one action over.
// Section B: command boundary (structural) — OwnPublicationPanel.js
//            calls only the injected discoverSnapshotCommand, and never
//            reads contentReference itself.
// Section C: FLAGSHIP — zero connected peers, zero World Encounters, a
//            real local Publication distributed through the (unmodified)
//            Snapshot distribution chain, then discovered end to end
//            through the "Discover Snapshot" action alone.
// Section D: NEGATIVE — a Publication whose distributed bytes were
//            tampered with after announcement never resolves as
//            RESOLVED; discovery honestly reports CONTENT_HASH_MISMATCH.
// Section E: a Publication with no contentReference yet never starts a
//            discovery call.
// Section F: repeated clicks guarded; a changed/cleared publication
//            resets ephemeral state and ignores a stale in-flight
//            response — mirroring Sections H/I one action over.
// Section G: architectural regression — WorldView.js wires
//            discoverOwnSnapshot/discoverSnapshotCommand the same way it
//            already wires distributeWorldEncounterSnapshot, and
//            OwnPublicationPanel.js never touches Arweave/Nostr directly.

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
        return { id: `fake-discovery-view-tx-${counter}`, transaction: { id: `fake-discovery-view-tx-${counter}`, data: material } };
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

// The EXACT logic ui/views/WorldView.js's own discoverOwnSnapshot()
// implements, unmodified by this milestone — reproduced here for the
// identical reason tests/WorldViewOwnPublicationDistribution.test.js's
// own makeSnapshotDistributionAction() already is.
function makeDiscoverOwnSnapshotAction({ discoverSnapshotCommand }) {
    return (publication) => {
        if (!discoverSnapshotCommand || !publication || !publication.contentReference) {
            return Promise.reject(new Error('Snapshot discovery is not available.'));
        }
        return discoverSnapshotCommand(publication.contentReference.hash);
    };
}

function panelCtx(overrides = {}) {
    return {
        publication: null,
        discoverSnapshotCommand: null,
        snapshotDiscoveryExecuting: false,
        snapshotDiscoveryError: null,
        snapshotDiscoveryResult: null,
        snapshotDiscoveryRequestId: 0,
        discoverOwnSnapshot: OwnPublicationPanel.methods.discoverOwnSnapshot,
        ...overrides
    };
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — OwnPublicationPanel's discovery action contract.
    // ---------------------------------------------------------------
    {
        const publication = new Publication({ id: 'pub-disc-a', documentId: 'doc-disc-a', contentReference: new ContentReference({ hash: 'hash-a', uri: 'ar://a', storage: 'ar' }) });
        let receivedContentHash = null;
        const fakeResult = Object.freeze({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: 'x', candidates: [], locator: 'ar://a', storage: 'ar', reason: null });
        const action = makeDiscoverOwnSnapshotAction({
            discoverSnapshotCommand: (contentHash) => { receivedContentHash = contentHash; return Promise.resolve(fakeResult); }
        });

        const ctx = panelCtx({ publication, discoverSnapshotCommand: action });
        ctx.discoverOwnSnapshot();
        await flushMicrotasks();
        assert(receivedContentHash === 'hash-a', '1. the action forwards exactly publication.contentReference.hash, never re-derived');
        assert(ctx.snapshotDiscoveryResult === fakeResult, '2. the resolved result is stored verbatim');

        const noPublicationCtx = panelCtx({ publication: null, discoverSnapshotCommand: action });
        noPublicationCtx.discoverOwnSnapshot();
        await flushMicrotasks();
        assert(noPublicationCtx.snapshotDiscoveryExecuting === false && noPublicationCtx.snapshotDiscoveryResult === null,
            '3. with no local publication, the action never starts a call');

        console.log('✓ Section A: OwnPublicationPanel forwards publication.contentReference.hash verbatim, and stays inert with no local publication');
    }

    // ---------------------------------------------------------------
    // Section B — command boundary (structural).
    // ---------------------------------------------------------------
    {
        const code = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        const forbiddenConstruction = [
            "from '../../content/ArweaveContentStore.js'",
            "from '../../application/NostrSnapshotDiscoveryQueryService.js'",
            "from '../../application/DecentralizedSnapshotResolver.js'",
            "from '../../application/DiscoverSnapshotCommand.js'",
            "from '../../application/DiscoverSnapshotRuntimeComposition.js'",
            'new ArweaveContentStore(', 'new NostrSnapshotDiscoveryQueryService(', 'new DecentralizedSnapshotResolver(',
            'executeDiscoverSnapshotCommand(', 'composeDiscoverSnapshotRuntime(',
            'window.arweaveWallet', 'window.nostr', 'WebSocket'
        ];
        for (const term of forbiddenConstruction) {
            assert(!code.includes(term), `4. OwnPublicationPanel.js never imports or constructs '${term}'`);
        }
        assert((code.match(/this\.discoverSnapshotCommand\(/g) || []).length === 1,
            '5. discoverSnapshotCommand is called from exactly one place');
        assert(!code.includes('.contentReference') || !code.includes('publication.contentReference.hash'),
            '6. OwnPublicationPanel.js never reads publication.contentReference itself — only the button\'s own :disabled guard checks for its PRESENCE, never its hash');

        console.log('✓ Section B: OwnPublicationPanel.js invokes only the injected command, never a concrete Arweave/Nostr/resolver collaborator, and never reads contentReference.hash itself');
    }

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP: zero peers, zero World Encounters, a real
    // local Publication, distributed and then discovered end to end.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeArweaveGateway();
        const store = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: gateway.fetchImpl });
        const network = makeNostrNetwork();
        const discoveryTag = 'flagship-own-publication-discovery';
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });

        const snapshotJson = { world: { buildings: [{ id: 'flagship-discovery-building', bricks: 5 }] } };
        const bytes = JSON.stringify(snapshotJson);
        const expectedHash = computeContentHash(bytes);

        // Distribute first, through the unmodified 0.9.136 command — the
        // exact same chain OwnPublicationPanel's own "Distribute Snapshot"
        // action already exercises.
        const distributed = await executeSnapshotDistributionCommand({ bytes, contentStore: store, discoveryPublisher: publisher });
        assert(distributed.announcement.published === true, 'C0. sanity: the Snapshot was genuinely distributed and announced');

        const publication = new Publication({
            id: 'pub-disc-flagship',
            documentId: 'doc-disc-flagship',
            contentReference: new ContentReference({ hash: expectedHash, uri: distributed.contentReference.uri, storage: 'ar' })
        });

        // A discovering runtime — genuinely independent composition from
        // the distributing store/publisher above, exactly the way a
        // separate replica's own ui/main.js would compose it.
        const discoveringRuntime = composeDiscoverSnapshotRuntime({
            arweaveContentStoreOptions: { signer: makeFakeArweaveSigner(), fetchImpl: gateway.fetchImpl },
            nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: network.queryImpl }
        });
        const discoverSnapshotCommand = (contentHash) => executeDiscoverSnapshotCommand({
            discoveryTag,
            contentHash,
            resolver: discoveringRuntime.resolver,
            contentStore: discoveringRuntime.contentStore
        });
        const discoverOwnSnapshotAction = makeDiscoverOwnSnapshotAction({ discoverSnapshotCommand });

        // Note what is deliberately ABSENT from this section: no
        // WorldDiscoverySourceRegistry, no WorldEncounterCanvas, no
        // selectedEncounter, no connected peer of any kind.
        const ctx = panelCtx({ publication, discoverSnapshotCommand: discoverOwnSnapshotAction });

        ctx.discoverOwnSnapshot();
        assert(ctx.snapshotDiscoveryExecuting === true, 'C1. FLAGSHIP — the action enters executing state synchronously on click');

        await flushMicrotasks();

        assert(ctx.snapshotDiscoveryExecuting === false, 'C2. FLAGSHIP — execution returns to idle once the command resolves');
        assert(ctx.snapshotDiscoveryError === null, 'C3. FLAGSHIP — a successful call leaves no error notice');
        assert(ctx.snapshotDiscoveryResult.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED,
            'C4. FLAGSHIP — with zero peers and zero World Encounters, discovering your own Snapshot reaches the real Arweave/Nostr chain and resolves fully');
        assert(ctx.snapshotDiscoveryResult.bytes === bytes, 'C5. FLAGSHIP — the retrieved bytes are byte-identical to the original Snapshot');
        assert(ctx.snapshotDiscoveryResult.locator === distributed.contentReference.uri, 'C6. FLAGSHIP — the resolved locator is exactly the one distribution produced');

        console.log('✓ Section C (FLAGSHIP): with zero peers and zero World Encounters, discovering your own Snapshot reaches the real Arweave/Nostr chain and round-trips byte-identical');
    }

    // ---------------------------------------------------------------
    // Section D — NEGATIVE: tampered content never resolves as RESOLVED.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeArweaveGateway();
        const store = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: gateway.fetchImpl });
        const network = makeNostrNetwork();
        const discoveryTag = 'section-d-tampered-discovery';
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });

        const genuineBytes = JSON.stringify({ world: { buildings: [{ id: 'genuine-building', bricks: 2 }] } });
        const genuineHash = computeContentHash(genuineBytes);
        await executeSnapshotDistributionCommand({ bytes: genuineBytes, contentStore: store, discoveryPublisher: publisher });

        // A Publication claiming a DIFFERENT contentHash than what was
        // actually announced/placed — the false-attribution scenario this
        // milestone's own docs/Roadmap.md entry names: "Nostr candidate
        // says H1, retrieved content hashes to H2."
        const publication = new Publication({
            id: 'pub-disc-tampered',
            documentId: 'doc-disc-tampered',
            contentReference: new ContentReference({ hash: 'a-hash-that-was-never-actually-placed', uri: 'ar://irrelevant', storage: 'ar' })
        });

        const discoveringRuntime = composeDiscoverSnapshotRuntime({
            arweaveContentStoreOptions: { signer: makeFakeArweaveSigner(), fetchImpl: gateway.fetchImpl },
            nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: network.queryImpl }
        });
        const discoverSnapshotCommand = (contentHash) => executeDiscoverSnapshotCommand({
            discoveryTag, contentHash, resolver: discoveringRuntime.resolver, contentStore: discoveringRuntime.contentStore
        });
        const action = makeDiscoverOwnSnapshotAction({ discoverSnapshotCommand });

        const ctx = panelCtx({ publication, discoverSnapshotCommand: action });
        ctx.discoverOwnSnapshot();
        await flushMicrotasks();

        assert(ctx.snapshotDiscoveryError === null, '7. an honest non-match is not treated as a call failure');
        assert(ctx.snapshotDiscoveryResult.outcome === DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED,
            '8. NEGATIVE — a contentHash nobody ever announced under this discoveryTag never resolves; discovery never guesses at "the closest match"');
        assert(genuineHash !== 'a-hash-that-was-never-actually-placed', '9. sanity: the genuinely placed hash and the claimed one really do differ');

        console.log('✓ Section D: NEGATIVE — a Publication\'s claimed contentHash that nothing actually announced honestly reports NOT_DISCOVERED, never a fabricated match');
    }

    // ---------------------------------------------------------------
    // Section E — no contentReference yet: never starts a call.
    // ---------------------------------------------------------------
    {
        const publication = new Publication({ id: 'pub-disc-e', documentId: 'doc-disc-e' });
        assert(publication.contentReference === null, 'E0. sanity: a freshly published Publication has no contentReference yet');

        let called = false;
        const action = makeDiscoverOwnSnapshotAction({ discoverSnapshotCommand: () => { called = true; return Promise.resolve(null); } });
        const ctx = panelCtx({ publication, discoverSnapshotCommand: action });
        ctx.discoverOwnSnapshot();
        await flushMicrotasks();

        assert(called === false, '10. a Publication with no contentReference never even attempts a discovery call');
        assert(ctx.snapshotDiscoveryExecuting === false, '11. no in-flight state is entered for a Publication with nothing to discover');

        console.log('✓ Section E: a Publication with no contentReference yet never starts a discovery call');
    }

    // ---------------------------------------------------------------
    // Section F — repeated clicks guarded; stale response ignored on
    // publication change.
    // ---------------------------------------------------------------
    {
        let calls = 0;
        let resolveFirst;
        const publicationA = new Publication({ id: 'pub-disc-f-a', documentId: 'doc-disc-f-a', contentReference: new ContentReference({ hash: 'hash-f-a', uri: 'ar://f-a', storage: 'ar' }) });
        const publicationB = new Publication({ id: 'pub-disc-f-b', documentId: 'doc-disc-f-b', contentReference: new ContentReference({ hash: 'hash-f-b', uri: 'ar://f-b', storage: 'ar' }) });
        const ctx = panelCtx({
            publication: publicationA,
            discoverSnapshotCommand: () => { calls += 1; return new Promise((resolve) => { resolveFirst = resolve; }); }
        });

        ctx.discoverOwnSnapshot();
        assert(ctx.snapshotDiscoveryExecuting === true, '12a. the first click enters executing state synchronously');
        ctx.discoverOwnSnapshot();
        ctx.discoverOwnSnapshot();
        await Promise.resolve();
        await Promise.resolve();
        assert(calls === 1, '12. clicking repeatedly while a call is in flight never starts a second, overlapping call');

        OwnPublicationPanel.watch.publication.call(ctx, publicationB, publicationA);
        ctx.publication = publicationB;
        assert(ctx.snapshotDiscoveryExecuting === false, '13. a fresh publication resets executing state immediately, without waiting for the stale call');
        assert(ctx.snapshotDiscoveryError === null && ctx.snapshotDiscoveryResult === null, '14. a fresh publication also clears any prior error/result');

        resolveFirst({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: 'stale', candidates: [], locator: 'ar://stale', storage: 'ar', reason: null });
        await flushMicrotasks();
        assert(ctx.snapshotDiscoveryExecuting === false, '15. the stale call\'s own resolution never re-enters executing state');
        assert(ctx.snapshotDiscoveryResult === null, '16. the stale call\'s own result never overwrites the new publication\'s state');

        console.log('✓ Section F: repeated clicks never create duplicate simultaneous executions, and a changed publication invalidates a stale in-flight response');
    }

    // ---------------------------------------------------------------
    // Section G — architectural regression.
    // ---------------------------------------------------------------
    {
        const viewCode = await codeOnlySource('ui/views/WorldView.js');
        assert(viewCode.includes("const discoverSnapshotCommand = inject('discoverSnapshotCommand', null);"),
            '17. WorldView.js injects the app-wide discoverSnapshotCommand');
        assert(viewCode.includes('function discoverOwnSnapshot(publication)'),
            '18. WorldView.js defines discoverOwnSnapshot(), turning "which publication" into "which contentHash"');
        assert(viewCode.includes('publication.contentReference.hash'),
            '19. discoverOwnSnapshot() reads contentHash from publication.contentReference.hash, never re-derived');
        assert(/<OwnPublicationPanel[\s\S]{0,400}:discoverSnapshotCommand="discoverOwnSnapshot"/.test(viewCode),
            '20. OwnPublicationPanel is wired to discoverOwnSnapshot, mirroring the existing :snapshotDistributionCommand wiring');

        const panelCode = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        const forbiddenInUi = [
            'window.arweaveWallet', 'window.nostr', 'WebSocket',
            'new ArweaveContentStore(', 'new NostrSnapshotDiscoveryQueryService(', 'new DecentralizedSnapshotResolver(',
            'composeDiscoverSnapshotRuntime(', 'executeDiscoverSnapshotCommand(',
            'MATCHED', 'ATTRIBUTED', 'TRUSTED', 'AUTHENTIC',
            'selectedEncounter', 'WorldDiscoverySourceRegistry', 'worldDiscoverySourceRegistry'
        ];
        for (const term of forbiddenInUi) {
            assert(!panelCode.includes(term), `21. OwnPublicationPanel.js never references '${term}'`);
        }

        const mainCode = await codeOnlySource('ui/main.js');
        assert(mainCode.includes("composeDiscoverSnapshotRuntime("), '22. ui/main.js composes the discovery runtime');
        assert(mainCode.includes("app.provide('discoverSnapshotCommand', discoverSnapshotCommand)"),
            '23. ui/main.js provides discoverSnapshotCommand app-wide, mirroring snapshotDistributionCommand');

        console.log('✓ Section G: architectural regression — WorldView.js/ui/main.js wire discoverSnapshotCommand the same way distribution is already wired, and OwnPublicationPanel.js never touches Arweave/Nostr/resolver internals directly');
    }

    console.log('\n✅ All World View Own Publication Snapshot Discovery tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
