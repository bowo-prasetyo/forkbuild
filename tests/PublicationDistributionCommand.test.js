import { readFile } from 'node:fs/promises';
import { executePublicationDistributionCommand } from '../application/PublicationDistributionCommand.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { PublicationDistributionState } from '../application/PublicationDistributionLifecycle.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { Signature } from '../core/Signature.js';

// 0.9.103 — Publication Distribution Command Boundary.
// See docs/Roadmap.md, "0.9.103 — Publication Distribution Command
// Boundary," for the full milestone story.
//
//   Section A: FLAGSHIP — one command call, real 0.9.58 orchestration, the
//              resulting lifecycle observable through a real
//              PublicationDistributionLifecycleMemoryStore, with no UI
//              dependency anywhere in the call
//   Section B: NO REGRESSION — a later call whose upload declines never
//              erases an earlier call's already-recorded material fact
//   Section C: a missing/malformed lifecycleStore throws synchronously
//   Section D: a malformed arweaveUploaderOptions/nostrPublisherOptions
//              throws synchronously, delegated entirely to 0.9.58's own
//              validation — the store is left untouched
//   Section E: a genuine collaborator rejection propagates unchanged, and
//              writes nothing to the store
//   Section F: DECLINE — an upload decline still resolves a describable
//              result, but writes nothing to the store (indistinguishable
//              from "never attempted", exactly 0.9.48's own restraint)
//   Section G: a malformed Publication resolves null, exactly as 0.9.58
//              itself resolves null, and writes nothing to the store
//   Section H: repeated execution introduces no new semantics — the stored
//              lifecycle stays exactly 0.9.50's/0.9.51's own shape
//   Section I: architectural regression

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function expectRejects(promise, message) {
    let threw = false;
    try { await promise; } catch (e) { threw = true; }
    assert(threw, message);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    assert(threw, message);
}

function signedPublication(overrides = {}) {
    const publication = new Publication({
        id: 'pub-command-1',
        documentId: 'doc-1',
        title: 'A Commanded Publication',
        author: 'author-1',
        contentReference: new ContentReference({ hash: 'legacy-hash', uri: 'ipfs://legacy-cid', storage: 'ipfs' }),
        ...overrides
    });
    if (overrides.signature !== undefined) {
        return publication;
    }
    return publication.withSignature(new Signature({
        algorithm: 'Ed25519',
        signer: 'author-1',
        signature: 'fake-signature-value',
        signedHash: 'fake-signed-hash',
        domain: 'forkbuild'
    }));
}

function makeFakeSigner({ handler } = {}) {
    async function sign(material) {
        return handler ? handler(material) : { id: 'fake-tx-id', transaction: { data: material } };
    }
    return { sign };
}

function gatewayResponse(body, { status = 200 } = {}) {
    return new Response(body, { status });
}

function makeFakeGateway({ handler }) {
    const requests = [];
    async function fetchImpl(url, options) {
        requests.push({ url, options });
        return handler(url, options);
    }
    return { requests, fetchImpl };
}

function makeFakeRelay({ handler }) {
    const calls = [];
    async function publishImpl(relayUrl, eventTemplate) {
        calls.push({ relayUrl, eventTemplate });
        return handler(relayUrl, eventTemplate);
    }
    return { calls, publishImpl };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: one command call, real orchestration, the
    // resulting lifecycle observable through a real memory store.
    // ---------------------------------------------------------------
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const transactionId = 'CommandFlagshipTransactionId1234567890';
        const gateway = makeFakeGateway({ handler: () => gatewayResponse('accepted') });
        const relay = makeFakeRelay({ handler: () => ({ published: true, id: 'a'.repeat(64) }) });
        const signer = makeFakeSigner({ handler: () => ({ id: transactionId, transaction: {} }) });

        const result = await executePublicationDistributionCommand({
            publication: signedPublication(),
            serializedMaterial: 'commanded material',
            arweaveUploaderOptions: { signer, fetchImpl: gateway.fetchImpl },
            nostrPublisherOptions: { relayUrl: 'wss://relay.example', discoveryTag: 'forkbuild-command', publishImpl: relay.publishImpl },
            lifecycleStore
        });

        assert(result !== null, '1. FLAGSHIP — the command resolves to a real result');
        assert(result.publication.objectId === 'pub-command-1', '2. FLAGSHIP — the real orchestrator/executor were actually reached');
        assert(result.material.uri === `ar://${transactionId}`, '3. FLAGSHIP — Arweave dependencies were supplied through composition and actually used');
        assert(result.discovery.relayUrl === 'wss://relay.example', '4. FLAGSHIP — Nostr dependencies were supplied through composition and actually used');
        assert(gateway.requests.length === 1 && relay.calls.length === 1, '5. FLAGSHIP — the gateway and relay were each contacted exactly once');

        const lifecycle = lifecycleStore.get('pub-command-1');
        assert(lifecycle !== null, '6. FLAGSHIP — the resulting lifecycle is observable through the existing store');
        assert(lifecycle.material.state === PublicationDistributionState.PRESENT && lifecycle.material.uri === `ar://${transactionId}`, '7. FLAGSHIP — the stored lifecycle\'s material section matches the real result');
        assert(lifecycle.discovery.state === PublicationDistributionState.PRESENT && lifecycle.discovery.id === 'a'.repeat(64), '8. FLAGSHIP — the stored lifecycle\'s discovery section matches the real result');

        console.log('✓ Flagship: executePublicationDistributionCommand() reaches the real orchestrator/executor and records an observable lifecycle, with no UI involved');
    }

    // ---------------------------------------------------------------
    // Section B — NO REGRESSION: a later declined attempt never erases an
    // earlier call's already-recorded material fact.
    // ---------------------------------------------------------------
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = signedPublication({ id: 'pub-command-2' });

        const firstGateway = makeFakeGateway({ handler: () => gatewayResponse('accepted') });
        const firstRelay = makeFakeRelay({ handler: () => ({ published: true, id: 'b'.repeat(64) }) });
        const firstResult = await executePublicationDistributionCommand({
            publication,
            serializedMaterial: 'material',
            arweaveUploaderOptions: { signer: makeFakeSigner({ handler: () => ({ id: 'TX-FIRST-000000000000000000000000', transaction: {} }) }), fetchImpl: firstGateway.fetchImpl },
            nostrPublisherOptions: { discoveryTag: 'forkbuild', publishImpl: firstRelay.publishImpl },
            lifecycleStore
        });
        assert(firstResult.material.uri === 'ar://TX-FIRST-000000000000000000000000', '9. NO REGRESSION — the first call\'s own material fact is real');

        const secondGateway = makeFakeGateway({ handler: () => gatewayResponse('declined', { status: 402 }) });
        const secondRelay = makeFakeRelay({ handler: () => ({ published: true, id: 'c'.repeat(64) }) });
        const secondResult = await executePublicationDistributionCommand({
            publication,
            serializedMaterial: 'material',
            arweaveUploaderOptions: { signer: makeFakeSigner(), fetchImpl: secondGateway.fetchImpl },
            nostrPublisherOptions: { discoveryTag: 'forkbuild', publishImpl: secondRelay.publishImpl },
            lifecycleStore
        });
        assert(secondResult.material === null && secondResult.discovery === null, '10. NO REGRESSION — the second call\'s own upload genuinely declined');
        assert(secondRelay.calls.length === 0, '11. NO REGRESSION — the relay was never reached on the second call, exactly 0.9.49\'s own stop-on-failure ordering');

        const lifecycle = lifecycleStore.get('pub-command-2');
        assert(lifecycle.material.state === PublicationDistributionState.PRESENT && lifecycle.material.uri === 'ar://TX-FIRST-000000000000000000000000', '12. NO REGRESSION — the first call\'s material fact still stands after the second call learned nothing new');

        console.log('✓ Section B: a later declined attempt never regresses a previously-recorded material fact back to ABSENT');
    }

    // ---------------------------------------------------------------
    // Section C — a missing/malformed lifecycleStore throws synchronously.
    // ---------------------------------------------------------------
    {
        expectThrows(
            () => executePublicationDistributionCommand({
                publication: signedPublication(),
                serializedMaterial: 'material',
                arweaveUploaderOptions: { signer: makeFakeSigner(), fetchImpl: async () => gatewayResponse('ok') },
                nostrPublisherOptions: { discoveryTag: 'forkbuild', publishImpl: async () => ({ published: true, id: 'd'.repeat(64) }) }
            }),
            '13. a missing lifecycleStore throws synchronously'
        );
        expectThrows(
            () => executePublicationDistributionCommand({
                publication: signedPublication(),
                serializedMaterial: 'material',
                arweaveUploaderOptions: { signer: makeFakeSigner(), fetchImpl: async () => gatewayResponse('ok') },
                nostrPublisherOptions: { discoveryTag: 'forkbuild', publishImpl: async () => ({ published: true, id: 'e'.repeat(64) }) },
                lifecycleStore: { get: () => null }
            }),
            '14. a lifecycleStore missing set() throws synchronously'
        );

        console.log('✓ Section C: a missing/incomplete lifecycleStore throws synchronously, before any collaborator is ever reached');
    }

    // ---------------------------------------------------------------
    // Section D — a construction failure is delegated entirely to 0.9.58's
    // own validation, and leaves the store untouched.
    // ---------------------------------------------------------------
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        expectThrows(
            () => executePublicationDistributionCommand({
                publication: signedPublication({ id: 'pub-command-d' }),
                serializedMaterial: 'material',
                arweaveUploaderOptions: { fetchImpl: async () => gatewayResponse('ok') },
                nostrPublisherOptions: { discoveryTag: 'forkbuild', publishImpl: async () => ({ published: true, id: 'f'.repeat(64) }) },
                lifecycleStore
            }),
            '15. a missing Arweave signer throws synchronously at command time, exactly as it already does calling the orchestrator directly'
        );
        assert(lifecycleStore.get('pub-command-d') === null, '16. a synchronous construction failure never touches the store');

        console.log('✓ Section D: a malformed arweaveUploaderOptions/nostrPublisherOptions throws synchronously, unmodified from 0.9.58\'s own contract');
    }

    // ---------------------------------------------------------------
    // Section E — a genuine collaborator rejection propagates unchanged,
    // and writes nothing to the store.
    // ---------------------------------------------------------------
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        await expectRejects(
            executePublicationDistributionCommand({
                publication: signedPublication({ id: 'pub-command-e' }),
                serializedMaterial: 'material',
                arweaveUploaderOptions: { signer: { sign: async () => { throw new Error('no wallet available'); } }, fetchImpl: async () => gatewayResponse('ok') },
                nostrPublisherOptions: { discoveryTag: 'forkbuild', publishImpl: async () => ({ published: true, id: 'g'.repeat(64) }) },
                lifecycleStore
            }),
            '17. a genuine upload rejection propagates rather than degrading to a recorded null section'
        );
        assert(lifecycleStore.get('pub-command-e') === null, '18. a genuine rejection never reaches the store-recording step');

        console.log('✓ Section E: a genuine collaborator rejection propagates through the command unchanged, and the store is never touched');
    }

    // ---------------------------------------------------------------
    // Section F — DECLINE: a describable-but-empty result writes nothing
    // to the store, on a publication with no prior lifecycle at all.
    // ---------------------------------------------------------------
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const relay = makeFakeRelay({ handler: () => ({ published: true, id: 'h'.repeat(64) }) });

        const result = await executePublicationDistributionCommand({
            publication: signedPublication({ id: 'pub-command-f' }),
            serializedMaterial: 'material',
            arweaveUploaderOptions: { signer: makeFakeSigner(), fetchImpl: async () => gatewayResponse('declined', { status: 402 }) },
            nostrPublisherOptions: { discoveryTag: 'forkbuild', publishImpl: relay.publishImpl },
            lifecycleStore
        });

        assert(result !== null && result.material === null && result.discovery === null, '19. DECLINE — the command still resolves a real, describable result');
        assert(lifecycleStore.get('pub-command-f') === null, '20. DECLINE — nothing is written to the store; "never attempted" and "attempted and declined" stay indistinguishable, exactly 0.9.48\'s own restraint');

        console.log('✓ Section F: an upload decline resolves a real result but records nothing — no ATTEMPTED/DECLINED vocabulary invented');
    }

    // ---------------------------------------------------------------
    // Section G — a malformed Publication resolves null, exactly as
    // 0.9.58 itself resolves null, and writes nothing to the store.
    // ---------------------------------------------------------------
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const gateway = makeFakeGateway({ handler: () => gatewayResponse('accepted') });
        const relay = makeFakeRelay({ handler: () => ({ published: true, id: 'i'.repeat(64) }) });

        const result = await executePublicationDistributionCommand({
            publication: undefined,
            serializedMaterial: 'material',
            arweaveUploaderOptions: { signer: makeFakeSigner(), fetchImpl: gateway.fetchImpl },
            nostrPublisherOptions: { discoveryTag: 'forkbuild', publishImpl: relay.publishImpl },
            lifecycleStore
        });

        assert(result === null, '21. a malformed Publication resolves null, exactly as orchestratePublicationDistribution() itself already does');
        assert(lifecycleStore.get('undefined') === null, '22. nothing is ever written to the store for a null result');

        console.log('✓ Section G: a malformed Publication degrades to null, unmodified from 0.9.58\'s own contract, and the store stays untouched');
    }

    // ---------------------------------------------------------------
    // Section H — repeated execution introduces no new semantics.
    // ---------------------------------------------------------------
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = signedPublication({ id: 'pub-command-h' });

        for (let i = 0; i < 2; i++) {
            const gateway = makeFakeGateway({ handler: () => gatewayResponse('accepted') });
            const relay = makeFakeRelay({ handler: () => ({ published: true, id: '0'.repeat(64) }) });
            await executePublicationDistributionCommand({
                publication,
                serializedMaterial: 'material',
                arweaveUploaderOptions: { signer: makeFakeSigner({ handler: () => ({ id: 'TX-REPEAT-00000000000000000000000', transaction: {} }) }), fetchImpl: gateway.fetchImpl },
                nostrPublisherOptions: { discoveryTag: 'forkbuild', publishImpl: relay.publishImpl },
                lifecycleStore
            });
        }

        const lifecycle = lifecycleStore.get('pub-command-h');
        assert(Object.keys(lifecycle).sort().join(',') === 'discovery,material', '23. repeated execution introduces no third top-level field beyond 0.9.50\'s own material/discovery shape');
        assert(Object.keys(lifecycle.material).sort().join(',') === 'state,storage,uri', '24. repeated execution introduces no new material vocabulary (no ATTEMPTS counter, no timestamp)');
        assert(Object.keys(lifecycle.discovery).sort().join(',') === 'discoveryTag,id,origin,state', '25. repeated execution introduces no new discovery vocabulary');

        console.log('✓ Section H: repeated execution against the same publication stays within 0.9.50\'s/0.9.51\'s own lifecycle shape');
    }

    // ---------------------------------------------------------------
    // Section I — architectural regression.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/PublicationDistributionCommand.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!codeOnly.includes('ArweavePublicationMaterialUploader'), '26. never imports the concrete Arweave uploader — construction stays entirely 0.9.58\'s own');
        assert(!codeOnly.includes('NostrPublicationDiscoveryPublisher'), '27. never imports the concrete Nostr publisher — construction stays entirely 0.9.58\'s own');
        assert(!codeOnly.includes('PublicationDistributionRuntimeComposition'), '28. never imports the runtime composition directly — that stays entirely 0.9.58\'s own concern');
        assert(!codeOnly.includes('PublicationDistributionExecutor'), '29. never imports the executor directly — that stays entirely 0.9.58\'s own concern');
        assert(!codeOnly.includes('PublicationDistributionDescriptor'), '30. never imports the descriptor module — envelope construction stays entirely 0.9.44\'s own concern');
        assert(!codeOnly.includes("from './PublicationDistributionResult.js'"), '31. never imports the result boundary directly — the result stays entirely whatever 0.9.58 already produced');
        assert(!codeOnly.includes('Persistence'), '32. never imports any persistence module');
        assert(!codeOnly.includes('Restorer'), '33. never imports the lifecycle restorer');
        assert(!codeOnly.includes('Hydration'), '34. never imports lifecycle hydration');
        assert(!codeOnly.includes('DecentralizedDiscoveryEnvelope'), '35. never imports the discovery envelope module');
        assert(!codeOnly.includes("from './commands/Command.js'") && !codeOnly.includes('extends Command'), '36. never joins the application/commands/ Command/CommandRegistry family');
        assert(!codeOnly.includes('WorldEncounterCanvas') && !codeOnly.includes("'../ui/") && !codeOnly.includes('"../ui/'), '37. no UI import of any kind — this file has no idea ui/ exists');
        assert(!/\bfetch\(/.test(codeOnly), '38. never calls fetch(...) directly — no network access of its own');
        assert(!codeOnly.includes('WebSocket'), '39. never references WebSocket directly');
        assert(!/\btry\s*{/.test(codeOnly), '40. no try/catch anywhere — a genuine failure is never caught here, only forwarded');
        assert((codeOnly.match(/\bexport\s+(async\s+)?function\b/g) || []).length === 1, '41. exports exactly one function — no second entry point');

        const forbiddenTerms = ['rollback', 'compensate', 'compensation', 'transaction', 'retry', 'cache', 'dedup', 'success', 'failed', 'failure', 'pending', 'trusted', 'reputation', 'weight', 'confidence', 'ranking', 'scoring', 'preferred', 'queue', 'schedule', 'undo', 'button', 'onclick', 'render'];
        for (const term of forbiddenTerms) {
            assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `42. code must never use "${term}" — no execution-state/scheduling/UI vocabulary at this boundary`);
        }

        const orchestratorSource = await readFile(new URL('../application/PublicationDistributionOrchestrator.js', import.meta.url), 'utf8');
        assert(!orchestratorSource.includes('PublicationDistributionCommand'), '43. the 0.9.58 orchestrator itself is never modified to know about this command');

        const storeSource = await readFile(new URL('../application/PublicationDistributionLifecycleStore.js', import.meta.url), 'utf8');
        assert(!storeSource.includes('PublicationDistributionCommand'), '44. the 0.9.52/0.9.53 store itself is never modified to know about this command');

        console.log('✓ Architectural regression: no re-implemented construction/sequencing/lifecycle logic, no UI/persistence imports, no forbidden vocabulary, exactly one export');
    }

    console.log('\nAll PublicationDistributionCommand tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
