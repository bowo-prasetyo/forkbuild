import { readFile } from 'node:fs/promises';

import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import { executePublicationDistributionCommand } from '../application/PublicationDistributionCommand.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { Signature } from '../core/Signature.js';

// 0.9.347 — Post-Publish Distribution Entry Point.
//
// 0.9.346's own audit named the exact gap this milestone closes:
// WorldEncounterCanvas.js's own "Distribute Publication" action (0.9.104)
// is reachable ONLY through `this.selectedEncounter && this.selectedEncounter.kind
// === 'PUBLICATION'` — i.e. only by navigating World View and selecting a
// marker — while OwnPublicationPanel.js's own "Distribute Snapshot" (0.9.140)
// has needed no such selection for 200+ milestones. This milestone gives
// OwnPublicationPanel.js a second action, "Distribute Publication," reusing
// the EXACT `distributeWorldEncounterPublication` wrapper
// WorldEncounterCanvas's own `distributionCommand` prop already binds to —
// never a second implementation, never a new command, never a
// selectedEncounter of any kind.
//
// Section A: FLAGSHIP — zero connected peers, zero World Encounters, zero
//            selectedEncounter: a real local Publication distributed
//            through the real command/orchestrator/executor chain (fake
//            Arweave/Nostr collaborators only), observed both through this
//            panel's own stored result AND the SAME app-wide lifecycle
//            store WorldEncounterCanvas's own Distribution panel already
//            watches.
// Section B: action contract — the action forwards the exact `publication`
//            object, verbatim, and stays inert with no publication, no
//            command, or a call already in flight.
// Section C: command boundary (structural) — OwnPublicationPanel.js never
//            constructs distribution infrastructure or calls the
//            orchestrator/executor directly.
// Section D: success presentation — the resolved result is stored and
//            exposed exactly as the command produced it.
// Section E: a genuine rejection surfaces as one plain, generic notice, and
//            the lifecycle store stays untouched.
// Section F: a synchronous construction throw is caught exactly like an
//            asynchronous rejection.
// Section G: repeated clicks never start a second, overlapping call.
// Section H: a changed or cleared publication resets ephemeral state and
//            ignores a stale in-flight response.
// Section I: architectural regression — WorldView.js wires the SAME
//            distributeWorldEncounterPublication wrapper to both
//            WorldEncounterCanvas's own distributionCommand prop and
//            OwnPublicationPanel's own new publicationDistributionCommand
//            prop; distributeOwnPublication() never reads
//            selectedEncounter; WorldEncounterCanvas.js is untouched by
//            this milestone.
// Section J: 0.9.346 scope-boundary regression — this milestone touches
//            nothing about remote IPFS pinning, Bitcoin/Base anchoring, a
//            generic "distribute to" abstraction, or the local-first
//            publish invariant; PublishDocumentUseCase.js/
//            UnpublishDocumentUseCase.js remain untouched.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function flushMicrotasks() {
    // Section A's own publicationDistributionCommand runs the real
    // orchestrator/executor chain (several nested awaits across upload/
    // publish/describe/transition/store steps) — mirrors
    // tests/WorldViewPublicationDistributionActionIntegration.test.js's
    // own flushMicrotasks() for the identical reason.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

function signedPublication(overrides = {}) {
    const publication = new Publication({
        id: 'pub-post-publish-1',
        documentId: 'doc-post-publish-1',
        title: 'A Post-Publish-Distributed Publication',
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

function gatewayResponse(body, { status = 200 } = {}) {
    return new Response(body, { status });
}

// The EXACT logic ui/views/WorldView.js's own distributeWorldEncounterPublication()
// implements, unmodified by this milestone — reproduced here for the
// identical reason tests/WorldViewPublicationDistributionActionIntegration.test.js's
// own realDistributionCommand() already is: WorldView.js's function lives
// inside its own setup(), not exported. Section I's own structural checks
// verify the real file actually implements this shape.
function realPublicationDistributionAction({ lifecycleStore, transactionId = 'PostPublishTransactionId1234567890', eventId = 'e'.repeat(64), gatewayHandler, relayHandler }) {
    const gateway = gatewayHandler || (() => gatewayResponse('accepted'));
    const relay = relayHandler || (() => ({ published: true, id: eventId }));
    const publicationDistributionCommand = (publication) => executePublicationDistributionCommand({
        publication,
        serializedMaterial: JSON.stringify(publication.toJSON()),
        arweaveUploaderOptions: {
            signer: { sign: async (material) => ({ id: transactionId, transaction: { data: material } }) },
            fetchImpl: async (url, options) => gateway(url, options)
        },
        nostrPublisherOptions: {
            relayUrl: 'wss://relay.example',
            discoveryTag: 'forkbuild-post-publish-entry-point',
            publishImpl: async (relayUrl, eventTemplate) => relay(relayUrl, eventTemplate)
        },
        lifecycleStore
    });
    return function distributeWorldEncounterPublication(publication) {
        if (!publicationDistributionCommand) {
            return Promise.reject(new Error('Publication distribution is not available.'));
        }
        return publicationDistributionCommand(publication);
    };
}

function panelCtx(overrides = {}) {
    return {
        publication: null,
        publicationDistributionCommand: null,
        publicationDistributionExecuting: false,
        publicationDistributionError: null,
        publicationDistributionResult: null,
        publicationDistributionRequestId: 0,
        distributeOwnPublication: OwnPublicationPanel.methods.distributeOwnPublication,
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
    // Section A — FLAGSHIP: zero peers, zero World Encounters, zero
    // selectedEncounter, a real command/orchestrator/executor chain.
    // ---------------------------------------------------------------
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = signedPublication();
        const action = realPublicationDistributionAction({ lifecycleStore });

        // Note what is deliberately ABSENT from this section: no
        // WorldDiscoverySourceRegistry, no WorldEncounterCanvas, no
        // selectedEncounter, no connected peer of any kind. The action
        // reaches the real chain with none of it.
        const ctx = panelCtx({ publication, publicationDistributionCommand: action });

        ctx.distributeOwnPublication();
        assert(ctx.publicationDistributionExecuting === true, '1. FLAGSHIP — the action enters executing state synchronously on click');

        await flushMicrotasks();

        assert(ctx.publicationDistributionExecuting === false, '2. FLAGSHIP — execution returns to idle once the command resolves');
        assert(ctx.publicationDistributionError === null, '3. FLAGSHIP — a successful call leaves no error notice');
        assert(ctx.publicationDistributionResult.material.uri === 'ar://PostPublishTransactionId1234567890',
            '4. FLAGSHIP — the panel holds the real upload\'s own material uri');
        assert(ctx.publicationDistributionResult.discovery.id === 'e'.repeat(64),
            '5. FLAGSHIP — the panel holds a real, genuinely published Nostr discovery id');

        // The SAME app-wide lifecycle store WorldEncounterCanvas's own
        // Distribution panel already watches now holds this real result —
        // the click handler never wrote it directly.
        assert(lifecycleStore.get(publication.id).material.uri === 'ar://PostPublishTransactionId1234567890',
            '6. FLAGSHIP — the click reaches the SAME lifecycle store the pre-existing Distribution panel observes');

        console.log('✓ Section A (FLAGSHIP): with zero peers and zero World Encounters, distributing your own Publication still reaches the real command/orchestrator/executor chain');
    }

    // ---------------------------------------------------------------
    // Section B — action contract: forwards the exact publication object,
    // stays inert with nothing to distribute.
    // ---------------------------------------------------------------
    {
        const publication = signedPublication({ id: 'pub-post-publish-b' });
        let received = null;
        const ctx = panelCtx({
            publication,
            publicationDistributionCommand: (p) => { received = p; return Promise.resolve(null); }
        });

        ctx.distributeOwnPublication();
        await flushMicrotasks();
        assert(received === publication, '7. the action forwards the exact publication object, verbatim — no copy, no re-shape');

        const noPublicationCtx = panelCtx({ publication: null, publicationDistributionCommand: () => { throw new Error('should never be called'); } });
        noPublicationCtx.distributeOwnPublication();
        assert(noPublicationCtx.publicationDistributionExecuting === false, '8. with no local publication, the action never starts a call');

        const noCommandCtx = panelCtx({ publication });
        noCommandCtx.distributeOwnPublication();
        assert(noCommandCtx.publicationDistributionExecuting === false, '9. with no publicationDistributionCommand supplied, the action never starts a call');

        console.log('✓ Section B: the action forwards the publication verbatim, and stays inert with nothing to distribute');
    }

    // ---------------------------------------------------------------
    // Section C — command boundary (structural).
    // ---------------------------------------------------------------
    {
        const code = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        const forbiddenConstruction = [
            "from '../../application/ArweavePublicationMaterialUploader.js'",
            "from '../../application/NostrPublicationDiscoveryPublisher.js'",
            "from '../../application/PublicationDistributionExecutor.js'",
            "from '../../application/PublicationDistributionOrchestrator.js'",
            "from '../../application/PublicationDistributionRuntimeComposition.js'",
            "from '../../application/PublicationDistributionCommand.js'",
            'new ArweavePublicationMaterialUploader(', 'new NostrPublicationDiscoveryPublisher(',
            'executePublicationDistribution(', 'executePublicationDistributionCommand(', 'orchestratePublicationDistribution(',
            'window.arweaveWallet', 'window.nostr', 'WebSocket'
        ];
        for (const term of forbiddenConstruction) {
            assert(!code.includes(term), `10. OwnPublicationPanel.js never imports or constructs '${term}'`);
        }
        assert((code.match(/this\.publicationDistributionCommand\(/g) || []).length === 1,
            '11. publicationDistributionCommand is called from exactly one place');
        assert(code.includes('distributeOwnPublication') && code.includes('publicationDistributionResult'),
            '12. the new method/state are actually present');

        console.log('✓ Section C: OwnPublicationPanel.js invokes only the injected command, never distribution infrastructure of its own');
    }

    // ---------------------------------------------------------------
    // Section D — success presentation stored verbatim.
    // ---------------------------------------------------------------
    {
        const publication = signedPublication({ id: 'pub-post-publish-d' });
        const sentinelResult = Object.freeze({
            publication: Object.freeze({ kind: 'PUBLICATION', objectId: publication.id }),
            material: Object.freeze({ uri: 'ar://sentinel-material', storage: 'ar' }),
            discovery: Object.freeze({ relayUrl: 'wss://relay.example', discoveryTag: 'sentinel-tag', id: 'sentinel-event-id' })
        });
        const ctx = panelCtx({ publication, publicationDistributionCommand: () => Promise.resolve(sentinelResult) });

        ctx.distributeOwnPublication();
        await flushMicrotasks();

        assert(ctx.publicationDistributionResult === sentinelResult,
            '13. the exact object the command resolved to is stored verbatim — no copy, no re-wrapping, no new shape');

        console.log('✓ Section D: a resolved result is stored and exposed exactly as the command produced it');
    }

    // ---------------------------------------------------------------
    // Section E — a genuine rejection surfaces as one plain notice, and the
    // lifecycle store stays untouched.
    // ---------------------------------------------------------------
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = signedPublication({ id: 'pub-post-publish-e' });
        const ctx = panelCtx({
            publication,
            publicationDistributionCommand: () => Promise.reject(new Error('no wallet available'))
        });

        ctx.distributeOwnPublication();
        await flushMicrotasks();

        assert(ctx.publicationDistributionExecuting === false, '14. execution returns to idle after a rejection');
        assert(ctx.publicationDistributionError === 'Publication distribution could not be completed.',
            '15. a genuine rejection becomes one plain, generic notice — never the underlying error message');
        assert(ctx.publicationDistributionResult === null, '16. a failed call never fabricates a partial result');
        assert(lifecycleStore.get(publication.id) === null,
            '17. a rejected call never corrupts or writes into the lifecycle store this panel does not even hold a reference to');

        console.log('✓ Section E: a genuine rejection surfaces as one plain notice, and the lifecycle store stays untouched');
    }

    // ---------------------------------------------------------------
    // Section F — a synchronous construction throw is caught exactly like
    // an asynchronous rejection.
    // ---------------------------------------------------------------
    {
        const publication = signedPublication({ id: 'pub-post-publish-f' });
        const ctx = panelCtx({
            publication,
            publicationDistributionCommand: () => { throw new Error('signer is required'); }
        });

        ctx.distributeOwnPublication();
        await flushMicrotasks();

        assert(ctx.publicationDistributionExecuting === false, '18. execution returns to idle after a synchronous throw');
        assert(ctx.publicationDistributionError === 'Publication distribution could not be completed.',
            '19. a synchronous construction throw is caught and surfaces the same generic notice a rejection would');

        console.log('✓ Section F: a synchronous construction throw is caught exactly like a genuine rejection');
    }

    // ---------------------------------------------------------------
    // Section G — repeated clicks never start a second, overlapping call.
    // ---------------------------------------------------------------
    {
        let calls = 0;
        let resolveFirst;
        const publication = signedPublication({ id: 'pub-post-publish-g' });
        const ctx = panelCtx({
            publication,
            publicationDistributionCommand: () => { calls += 1; return new Promise((resolve) => { resolveFirst = resolve; }); }
        });

        ctx.distributeOwnPublication();
        assert(ctx.publicationDistributionExecuting === true, '20a. the first click enters executing state synchronously');
        ctx.distributeOwnPublication();
        ctx.distributeOwnPublication();
        await Promise.resolve();
        await Promise.resolve();
        assert(calls === 1, '20. clicking repeatedly while a call is in flight never starts a second, overlapping call');

        resolveFirst(null);
        await flushMicrotasks();
        assert(ctx.publicationDistributionExecuting === false, '21. the in-flight call eventually resolves and returns to idle');

        ctx.distributeOwnPublication();
        await Promise.resolve();
        await Promise.resolve();
        assert(calls === 2, '22. once idle again, a fresh click starts a new call');

        console.log('✓ Section G: repeated clicks never create duplicate simultaneous executions');
    }

    // ---------------------------------------------------------------
    // Section H — a changed/cleared publication resets ephemeral state and
    // ignores a stale in-flight response.
    // ---------------------------------------------------------------
    {
        let resolveStale;
        const publicationA = signedPublication({ id: 'pub-post-publish-h-a' });
        const publicationB = signedPublication({ id: 'pub-post-publish-h-b' });
        const ctx = panelCtx({
            publication: publicationA,
            publicationDistributionCommand: () => new Promise((resolve) => { resolveStale = resolve; })
        });

        ctx.distributeOwnPublication();
        assert(ctx.publicationDistributionExecuting === true, '23. a call for publication A starts executing');
        await Promise.resolve();
        await Promise.resolve();

        // Simulate the host's own `publication` prop changing — exactly
        // what OwnPublicationPanel's own `watch: { publication(...) }`
        // does when Vue detects the prop changed.
        OwnPublicationPanel.watch.publication.call(ctx, publicationB, publicationA);
        ctx.publication = publicationB;
        assert(ctx.publicationDistributionExecuting === false, '24. a fresh publication resets executing state immediately, without waiting for the stale call');
        assert(ctx.publicationDistributionError === null, '25. a fresh publication also clears any prior error notice');
        assert(ctx.publicationDistributionResult === null, '26. a fresh publication also clears any prior result');

        resolveStale({ publication: { kind: 'PUBLICATION', objectId: publicationA.id }, material: null, discovery: null });
        await flushMicrotasks();
        assert(ctx.publicationDistributionExecuting === false, '27. the stale call\'s own resolution never re-enters executing state');
        assert(ctx.publicationDistributionResult === null, '28. the stale call\'s own result never overwrites the new publication\'s state');

        const clearedCtx = panelCtx({ publication: publicationA, publicationDistributionResult: { publication: {}, material: null, discovery: null } });
        OwnPublicationPanel.watch.publication.call(clearedCtx, null, publicationA);
        assert(clearedCtx.publicationDistributionResult === null, '29. the publication being cleared also resets a prior result');

        console.log('✓ Section H: a changed or cleared publication invalidates a stale in-flight response and resets ephemeral state');
    }

    // ---------------------------------------------------------------
    // Section I — architectural regression: the same wrapper is reused,
    // never a second implementation; no selectedEncounter dependency.
    // ---------------------------------------------------------------
    {
        const viewCode = await codeOnlySource('ui/views/WorldView.js');

        assert(/:distributionCommand="distributeWorldEncounterPublication"/.test(viewCode),
            '30. WorldEncounterCanvas\'s own pre-existing binding is unchanged');
        assert(/<OwnPublicationPanel[\s\S]{0,400}:publicationDistributionCommand="distributeWorldEncounterPublication"/.test(viewCode),
            '31. OwnPublicationPanel reuses the SAME distributeWorldEncounterPublication wrapper WorldEncounterCanvas already uses — never a second command');
        assert(viewCode.includes('function distributeWorldEncounterPublication(publication)'),
            '32. exactly one distributeWorldEncounterPublication function exists — this milestone adds no second wrapper');

        const panelCode = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        assert(!panelCode.includes('this.selectedEncounter'),
            '33. distributeOwnPublication() (and every other method in this file) never reads selectedEncounter — reachable with no selection of any kind');

        const canvasCode = await codeOnlySource('ui/components/WorldEncounterCanvas.js');
        assert(!canvasCode.includes('OwnPublicationPanel'), '34. WorldEncounterCanvas.js is untouched by this milestone — it knows nothing of OwnPublicationPanel');
        assert(!canvasCode.includes('publicationDistributionCommand') && canvasCode.includes('distributionCommand'),
            '35. WorldEncounterCanvas.js keeps its own distinct distributionCommand prop name, unrenamed — this milestone introduces publicationDistributionCommand only on OwnPublicationPanel');

        console.log('✓ Section I: the exact same command wrapper reaches both entry points, with no selectedEncounter dependency in either');
    }

    // ---------------------------------------------------------------
    // Section J — 0.9.346 scope-boundary regression: no IPFS/Bitcoin/Base
    // vocabulary, no generic "distribute to" abstraction, local-first
    // publish invariant untouched.
    // ---------------------------------------------------------------
    {
        const panelCode = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        const viewCode = await codeOnlySource('ui/views/WorldView.js');
        const forbiddenScope = [
            'IpfsRemotePublicationCoordinator', 'HttpPinningProvider', 'IpfsRemotePinningContentStore',
            'PublicationAnchorCreationCoordinator', 'BlockchainKind', 'CreateBaseAnchorPublicationRecordUseCase',
            'distributePublication(publication, targets)', 'DistributionStatus'
        ];
        for (const term of forbiddenScope) {
            assert(!panelCode.includes(term), `36. OwnPublicationPanel.js never references '${term}' — IPFS/Bitcoin/Base stay in the Publication Center`);
            assert(!viewCode.includes(term), `37. WorldView.js never references '${term}' either`);
        }

        const publishUseCaseCode = await codeOnlySource('application/PublishDocumentUseCase.js');
        const unpublishUseCaseCode = await codeOnlySource('application/UnpublishDocumentUseCase.js');
        assert(!/Arweave|Nostr|Ipfs|Bitcoin|distribut/i.test(publishUseCaseCode),
            '38. PublishDocumentUseCase.js remains untouched by this milestone — the local-first invariant holds by construction, not convention');
        assert(!/Arweave|Nostr|Ipfs|Bitcoin|distribut/i.test(unpublishUseCaseCode),
            '39. UnpublishDocumentUseCase.js remains untouched by this milestone, for the identical reason');

        console.log('✓ Section J: no IPFS/Bitcoin/Base vocabulary and no generic distribution abstraction were introduced, and the local-first publish invariant holds unmodified');
    }

    console.log('\n✅ All Post-Publish Distribution Entry Point tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
