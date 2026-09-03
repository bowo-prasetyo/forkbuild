import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { createArweaveInjectedProviderSigner } from '../arweave/ArweaveInjectedProviderSigner.js';
import { createNostrInjectedProviderPublisher } from '../nostr/NostrInjectedProviderPublisher.js';
import { createArweavePublicationDistributionRuntimeAdapter } from '../application/ArweavePublicationDistributionRuntimeAdapter.js';
import { createNostrPublicationDistributionRuntimeAdapter } from '../application/NostrPublicationDistributionRuntimeAdapter.js';
import { createPublicationDistributionRuntimeProvider } from '../application/PublicationDistributionRuntimeProvider.js';
import { resolvePublicationDistributionRuntimeConfiguration } from '../application/PublicationDistributionRuntimeConfiguration.js';
import { composePublicationDistributionCommand } from '../application/PublicationDistributionCommandComposition.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { PublicationDistributionState } from '../application/PublicationDistributionLifecycle.js';
import { WorldEncounterMaterialLoadStatus } from '../application/WorldEncounterMaterialLoading.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { Signature } from '../core/Signature.js';

// 0.9.121 — Publication Distribution Host Capability Integration.
//
// 0.9.107 through 0.9.109 built the whole seam a host signer/publish
// capability plugs into; every test up to and including
// `WorldViewArweavePublicationDistributionRuntimeAdapterIntegration.test.js`
// fed that seam a plain, hand-written fake standing in for "whatever a real
// host capability eventually looks like." This is the first test in this
// codebase that closes the LAST gap: `arweave/ArweaveInjectedProviderSigner.js`
// and `nostr/NostrInjectedProviderPublisher.js` are the real translation
// this milestone ships between an injected browser wallet/extension and the
// `signer`/`publish` vocabulary the existing adapters already accept — this
// file proves the FULL chain, from a fake but realistically-shaped
// `window.arweaveWallet`/`window.nostr`, through both new files, through
// both existing adapters, through the existing runtime provider/
// configuration/command composition, through the real orchestrator and
// executor, into the exact same World View click `ui/main.js` now wires for
// real.
//
//   Section A: FLAGSHIP — a World View click, wired exactly as ui/main.js
//              now wires it (real host capability factories, real
//              adapters, real command composition), reaches PRESENT/PRESENT
//   Section B: independent availability — Arweave capability present, Nostr
//              capability absent at the factory layer, and vice versa
//   Section C: missing capability — no injected wallet/extension anywhere —
//              the click still ends in exactly today's existing, honest
//              plain notice, unchanged
//   Section D: source audit — ui/main.js's own new wiring never
//              reimplements any wallet/relay/upload/signing/publishing
//              algorithm itself

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

// The real chain this file exercises includes crypto.subtle.digest() calls
// (inside arweave/ArweaveInjectedProviderSigner.js), which round-trip
// through Node's own thread pool rather than settling on a pure microtask —
// unlike every other integration test in this family, whose fakes are
// synchronous or single-microtask, this one needs to poll real event-loop
// ticks until the click genuinely settles, rather than assuming a fixed,
// small number of ticks is always enough.
async function waitForSettled(ctx, { maxWaitMs = 2000 } = {}) {
    const start = Date.now();
    while (ctx.distributionExecuting === true) {
        if (Date.now() - start > maxWaitMs) {
            throw new Error('waitForSettled: distributionExecuting never returned to idle');
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    // one more tick so the store-write inside the resolved .then() chain,
    // which runs after distributionExecuting itself flips, is also visible.
    await new Promise((resolve) => setTimeout(resolve, 5));
}

function signedPublication(overrides = {}) {
    const publication = new Publication({
        id: 'pub-host-capability-integration-1',
        documentId: 'doc-host-capability-integration-1',
        title: 'A Host-Capability-Distributed Publication',
        author: 'author-1',
        contentReference: new ContentReference({ hash: 'legacy-hash', uri: 'ipfs://legacy-cid', storage: 'ipfs' }),
        ...overrides
    });
    return publication.withSignature(new Signature({
        algorithm: 'Ed25519',
        signer: 'author-1',
        signature: 'fake-signature-value',
        signedHash: 'fake-signed-hash',
        domain: 'forkbuild'
    }));
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
        selectEncounter: WorldEncounterCanvas.methods.selectEncounter,
        refreshSelectionOutcome: WorldEncounterCanvas.methods.refreshSelectionOutcome,
        refreshMaterialInspection: WorldEncounterCanvas.methods.refreshMaterialInspection,
        refreshDecentralizedLeadOutcome: WorldEncounterCanvas.methods.refreshDecentralizedLeadOutcome,
        refreshDistributionLifecycle: WorldEncounterCanvas.methods.refreshDistributionLifecycle,
        stopSubscription: WorldEncounterCanvas.methods.stopSubscription,
        distributeSelectedPublication: WorldEncounterCanvas.methods.distributeSelectedPublication,
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
    Object.defineProperty(ctx, 'distributionMaterialState', {
        get() { return WorldEncounterCanvas.computed.distributionMaterialState.call(ctx); }
    });
    Object.defineProperty(ctx, 'distributionDiscoveryState', {
        get() { return WorldEncounterCanvas.computed.distributionDiscoveryState.call(ctx); }
    });
    return ctx;
}

// A fake, ArConnect-shaped `window.arweaveWallet` — realistic enough to
// exercise arweave/ArweaveInjectedProviderSigner.js end to end without a
// real extension or a real gateway.
function fakeArweaveWallet() {
    let counter = 0;
    return {
        connect: async () => { /* grants permission, as a real wallet would */ },
        sign: async (transaction) => {
            counter += 1;
            return { ...transaction, owner: 'fake-owner-modulus', signature: 'fake-signature-bytes', id: `HostCapTx${counter}`.padEnd(43, '0') };
        }
    };
}

function fakeArweaveGateway() {
    return async (url) => {
        if (url.includes('/tx_anchor')) return new Response('fake-anchor', { status: 200 });
        if (url.includes('/price/')) return new Response('999', { status: 200 });
        if (url.endsWith('/tx')) return new Response('accepted', { status: 200 });
        throw new Error(`fakeArweaveGateway: unexpected url ${url}`);
    };
}

// A fake, NIP-07-shaped `window.nostr` extension, and a fake relay socket
// that always acknowledges — realistic enough to exercise
// nostr/NostrInjectedProviderPublisher.js end to end without a real
// extension or a real relay.
function fakeNostrExtension() {
    let counter = 0;
    return {
        getPublicKey: async () => 'fake-pubkey-hex',
        signEvent: async (event) => {
            counter += 1;
            const hex = counter.toString(16);
            return { ...event, id: `facade${hex}`.padEnd(64, '0'), sig: `deadbeef${hex}`.padEnd(128, '0') };
        }
    };
}

function fakeRelayWebSocket({ accept = true } = {}) {
    return class FakeSocket {
        constructor(url) { this.url = url; }
        send(data) {
            const [, event] = JSON.parse(data);
            const frame = accept ? ['OK', event.id, true] : ['OK', event.id, false, 'relay full'];
            queueMicrotask(() => { if (this.onmessage) this.onmessage({ data: JSON.stringify(frame) }); });
        }
        close() {}
    };
}

// Attaches onopen firing on the next microtask — kept separate from the
// class body above only so both Section A/B fakes share one shape without
// duplicating the open-then-send timing.
function withAutoOpen(SocketClass) {
    return class AutoOpenSocket extends SocketClass {
        constructor(url) {
            super(url);
            queueMicrotask(() => { if (this.onopen) this.onopen(); });
        }
    };
}

// Exactly ui/main.js's own new sequence, parameterized over which host
// capabilities are actually available — see this file's own header.
function composeHostWiredCommand({ lifecycleStore, arweaveInjectedProvider, arweaveFetchImpl, nostrInjectedProvider, nostrWebSocketImpl, discoveryTag = 'forkbuild-publication' }) {
    const arweaveHostSigner = createArweaveInjectedProviderSigner({ injectedProvider: arweaveInjectedProvider, fetchImpl: arweaveFetchImpl });
    const nostrHostPublisher = createNostrInjectedProviderPublisher({ injectedProvider: nostrInjectedProvider, webSocketImpl: nostrWebSocketImpl });

    // arweaveFetchImpl is shared between the signer's own anchor/price
    // lookups and the uploader's own /tx POST — in a real browser both
    // resolve to the same global fetch by default; a test fake has to
    // supply the one function that answers all three endpoints itself.
    const arweavePublicationRuntimeCapabilities = createArweavePublicationDistributionRuntimeAdapter({ signer: arweaveHostSigner, fetchImpl: arweaveFetchImpl });
    const nostrPublicationRuntimeCapabilities = createNostrPublicationDistributionRuntimeAdapter({ publish: nostrHostPublisher });

    const publicationDistributionRuntimeProvider = createPublicationDistributionRuntimeProvider({
        ...arweavePublicationRuntimeCapabilities,
        ...nostrPublicationRuntimeCapabilities,
        discoveryTag
    });

    const { arweaveUploaderOptions, nostrPublisherOptions } = resolvePublicationDistributionRuntimeConfiguration(publicationDistributionRuntimeProvider.resolveRuntimeCapabilities());
    const publicationDistributionCommand = composePublicationDistributionCommand({
        lifecycleStore,
        arweaveUploaderOptions,
        nostrPublisherOptions
    });

    return {
        arweaveUploaderOptions,
        nostrPublisherOptions,
        distributionCommand: (publication) => publicationDistributionCommand({
            publication,
            serializedMaterial: JSON.stringify(publication.toJSON())
        })
    };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: a World View click, wired exactly as
    // ui/main.js now wires it, reaches PRESENT/PRESENT.
    // ---------------------------------------------------------------
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = signedPublication();

        const { distributionCommand } = composeHostWiredCommand({
            lifecycleStore,
            arweaveInjectedProvider: fakeArweaveWallet(),
            arweaveFetchImpl: fakeArweaveGateway(),
            nostrInjectedProvider: fakeNostrExtension(),
            nostrWebSocketImpl: withAutoOpen(fakeRelayWebSocket())
        });

        const ctx = canvasCtx({ distributionLifecycleStore: lifecycleStore, distributionCommand });
        ctx.selectedEncounter = { kind: 'PUBLICATION', objectId: publication.id };
        ctx.refreshDistributionLifecycle();
        ctx.materialInspection = {
            loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, resolvedSelection: ctx.selectedEncounter, material: publication }
        };

        assert(ctx.distributionMaterialState === PublicationDistributionState.ABSENT, '1. FLAGSHIP — before distributing, the panel observes ABSENT');

        ctx.distributeSelectedPublication();
        assert(ctx.distributionExecuting === true, '2. FLAGSHIP — the action enters executing state synchronously on click, exactly as before this milestone');

        await waitForSettled(ctx);

        assert(ctx.distributionExecuting === false, '3. FLAGSHIP — execution returns to idle once the command resolves');
        assert(ctx.distributionError === null, '4. FLAGSHIP — a successful call leaves no error notice — real host capabilities, real gateway/relay responses, a genuinely successful distribution');
        assert(ctx.distributionMaterialState === PublicationDistributionState.PRESENT, '5. FLAGSHIP — the Distribution panel now observes a real material fact, reached through a real (fake-backed) host Arweave wallet');
        assert(ctx.distributionDiscoveryState === PublicationDistributionState.PRESENT, '6. FLAGSHIP — the Distribution panel now observes a real discovery fact, reached through a real (fake-backed) host Nostr extension and relay');
        assert(lifecycleStore.get(publication.id).material.uri.startsWith('ar://HostCapTx'), '7. FLAGSHIP — the material uri traces back to the fake host WALLET\'s own sign() response, proving the full chain actually ran');
        assert(lifecycleStore.get(publication.id).discovery.id.startsWith('facade'), '8. FLAGSHIP — the discovery id traces back to the fake host EXTENSION\'s own signEvent() response');

        console.log('✓ Section A: FLAGSHIP — a World View click, wired exactly as ui/main.js now wires it, reaches a real end-to-end distribution through real (fake-backed) host capabilities');
    }

    // ---------------------------------------------------------------
    // Section B — independent availability: each substrate's own host
    // capability can be present while the other is entirely absent.
    // ---------------------------------------------------------------
    {
        const { arweaveUploaderOptions: onlyArweave, nostrPublisherOptions: noNostr } = (() => {
            const arweaveHostSigner = createArweaveInjectedProviderSigner({ injectedProvider: fakeArweaveWallet(), fetchImpl: fakeArweaveGateway() });
            const nostrHostPublisher = createNostrInjectedProviderPublisher({ injectedProvider: null });
            const adapted = {
                ...createArweavePublicationDistributionRuntimeAdapter({ signer: arweaveHostSigner }),
                ...createNostrPublicationDistributionRuntimeAdapter({ publish: nostrHostPublisher })
            };
            const provider = createPublicationDistributionRuntimeProvider({ ...adapted, discoveryTag: 'forkbuild-publication' });
            return resolvePublicationDistributionRuntimeConfiguration(provider.resolveRuntimeCapabilities());
        })();
        assert(onlyArweave !== undefined, '9. independent availability — Arweave\'s own host capability resolves a real arweaveUploaderOptions with no Nostr extension present at all');
        assert(noNostr === undefined, '10. independent availability — with no injected Nostr extension, nostrPublisherOptions stays undefined');

        const { arweaveUploaderOptions: noArweave, nostrPublisherOptions: onlyNostr } = (() => {
            const arweaveHostSigner = createArweaveInjectedProviderSigner({ injectedProvider: null });
            const nostrHostPublisher = createNostrInjectedProviderPublisher({ injectedProvider: fakeNostrExtension(), webSocketImpl: withAutoOpen(fakeRelayWebSocket()) });
            const adapted = {
                ...createArweavePublicationDistributionRuntimeAdapter({ signer: arweaveHostSigner }),
                ...createNostrPublicationDistributionRuntimeAdapter({ publish: nostrHostPublisher })
            };
            const provider = createPublicationDistributionRuntimeProvider({ ...adapted, discoveryTag: 'forkbuild-publication' });
            return resolvePublicationDistributionRuntimeConfiguration(provider.resolveRuntimeCapabilities());
        })();
        assert(noArweave === undefined, '11. independent availability — with no injected Arweave wallet, arweaveUploaderOptions stays undefined');
        assert(onlyNostr !== undefined, '12. independent availability — Nostr\'s own host capability resolves a real nostrPublisherOptions with no Arweave wallet present at all');

        console.log('✓ Section B: each substrate\'s own host capability resolves independently of whether the other is installed');
    }

    // ---------------------------------------------------------------
    // Section C — missing capability: no injected wallet/extension
    // anywhere — the click still ends in exactly today's existing,
    // honest plain notice, unchanged.
    // ---------------------------------------------------------------
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = signedPublication({ id: 'pub-host-capability-integration-2', documentId: 'doc-host-capability-integration-2' });

        const { distributionCommand } = composeHostWiredCommand({
            lifecycleStore,
            arweaveInjectedProvider: null,
            nostrInjectedProvider: null
        });

        const ctx = canvasCtx({ distributionLifecycleStore: lifecycleStore, distributionCommand });
        ctx.selectedEncounter = { kind: 'PUBLICATION', objectId: publication.id };
        ctx.refreshDistributionLifecycle();
        ctx.materialInspection = {
            loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, resolvedSelection: ctx.selectedEncounter, material: publication }
        };

        ctx.distributeSelectedPublication();
        await waitForSettled(ctx);

        assert(ctx.distributionExecuting === false, '13. missing capability — execution still returns to idle');
        assert(ctx.distributionError === 'Distribution could not be completed.', '14. missing capability — with no wallet/extension installed anywhere, the click still ends in exactly the existing, unchanged plain notice');
        assert(lifecycleStore.get(publication.id) === null, '15. missing capability — the lifecycle store is left untouched');

        console.log('✓ Section C: with no injected wallet/extension anywhere, the click still degrades to exactly today\'s existing, honest plain notice');
    }

    // ---------------------------------------------------------------
    // Section D — source audit: ui/main.js's own new wiring never
    // reimplements any wallet/relay/upload/signing/publishing algorithm.
    // ---------------------------------------------------------------
    {
        const { readFile } = await import('node:fs/promises');
        const sourceUrl = new URL('../ui/main.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!/crypto\.subtle|new WebSocket\(|createTransaction|data_root|signEvent\(/.test(codeOnly),
            '16. ui/main.js never reimplements any signing, chunking, or relay-broadcast logic of its own — that stays entirely inside arweave/ and nostr/');
        assert(codeOnly.includes('createArweaveInjectedProviderSigner') && codeOnly.includes('createNostrInjectedProviderPublisher'),
            '17. ui/main.js resolves host capabilities through the two new named factories, never an inline object literal shaping window.arweaveWallet/window.nostr by hand');

        console.log('✓ Section D: ui/main.js\'s own new wiring calls two named factories and reimplements nothing');
    }

    console.log('\nAll PublicationDistributionHostCapabilityIntegration tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
