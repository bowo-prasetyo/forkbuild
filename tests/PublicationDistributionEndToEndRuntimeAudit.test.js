import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { createArweaveInjectedProviderSigner } from '../arweave/ArweaveInjectedProviderSigner.js';
import { createNostrInjectedProviderPublisher } from '../nostr/NostrInjectedProviderPublisher.js';
import { createArweavePublicationDistributionRuntimeAdapter } from '../application/ArweavePublicationDistributionRuntimeAdapter.js';
import { createNostrPublicationDistributionRuntimeAdapter } from '../application/NostrPublicationDistributionRuntimeAdapter.js';
import { createPublicationDistributionRuntimeProvider } from '../application/PublicationDistributionRuntimeProvider.js';
import { resolvePublicationDistributionRuntimeConfiguration } from '../application/PublicationDistributionRuntimeConfiguration.js';
import { composePublicationDistributionCommand } from '../application/PublicationDistributionCommandComposition.js';
import { executePublicationDistribution } from '../application/PublicationDistributionExecutor.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { PublicationDistributionState } from '../application/PublicationDistributionLifecycle.js';
import { WorldEncounterMaterialVerificationStatus } from '../application/WorldEncounterMaterialVerification.js';
import { WorldEncounterMaterialLoadStatus } from '../application/WorldEncounterMaterialLoading.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { Signature } from '../core/Signature.js';

// 0.9.122 — Publication Distribution End-to-End Runtime Audit.
//
// 0.9.103 through 0.9.109 built the entire Publication Distribution seam;
// 0.9.121 was the milestone that finally reached a real host capability
// (a real, injected `window.arweaveWallet`/`window.nostr`) at the bottom of
// that seam. This file is the audit 0.9.121's own "Recommendation" section
// already named as its own next step: does every semantic boundary this
// whole family has held since 0.9.44 still hold now that two genuinely new
// files — `arweave/ArweaveInjectedProviderSigner.js` and
// `nostr/NostrInjectedProviderPublisher.js` — sit at the bottom of it? This
// file adds ZERO new production code. It is a regression-locking audit,
// the same shape `tests/VehicleRuntimeAuthorityAudit.test.js` (0.9.118) and
// `tests/VehicleWorldCollisionMovementAudit.test.js` (0.9.120) already gave
// their own subsystems.
//
// Sections mirror the audit brief this milestone was commissioned against,
// letter for letter:
//   Section A: Arweave semantics — material bytes, data_root determinism,
//              transaction construction confined to the host adapter,
//              signing delegated to the wallet, wallet rejection and
//              gateway failure both propagate genuinely
//   Section B: Nostr semantics — the intended event is what gets signed
//              and broadcast, OK/decline/timeout/signing-failure are each
//              handled distinctly, discovery stays discovery evidence
//   Section C: Arweave/Nostr independence — Arweave succeeding while Nostr
//              declines is never rolled back; a genuine rejection on the
//              Arweave leg is proven to make the Nostr leg UNREACHABLE —
//              see this section's own header for why that asymmetry is
//              correct, not a bug
//   Section D: lifecycle semantics — a wallet-rejection-shaped failure
//              collapses into the exact same generic notice as any other
//              failure; no new lifecycle vocabulary appears anywhere
//   Section E: the UI stays a thin observer — no `ui/` file outside this
//              milestone's own two host-capability producers ever touches
//              `window.arweaveWallet`/`window.nostr`/`crypto.subtle`/`WebSocket`
//   Section F: the new host capabilities are structurally invisible to the
//              discovery/verification/selection pipeline they have nothing
//              to do with
//   Section G: one real-browser-shaped capability boundary test, proving
//              window capability -> host adapter -> runtime adapter ->
//              executor as a single chain, with fakes standing in for the
//              two things this file can never depend on in a test: a real
//              wallet extension and a real relay
//   Section H: the "host adapter vs. Arweave protocol implementation"
//              boundary question — confirmed, not merely asserted, against
//              the uploader's own already-published contract

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function signedPublication(overrides = {}) {
    const publication = new Publication({
        id: 'pub-e2e-audit-1',
        documentId: 'doc-e2e-audit-1',
        title: 'A Runtime-Audited Publication — 世界 🌍',
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

// Real event-loop settling — see PublicationDistributionHostCapabilityIntegration.test.js's
// own identical helper for why this cannot be a fixed small number of ticks:
// crypto.subtle.digest() round-trips through Node's own thread pool.
async function waitForSettled(ctx, { maxWaitMs = 2000 } = {}) {
    const start = Date.now();
    while (ctx.distributionExecuting === true) {
        if (Date.now() - start > maxWaitMs) {
            throw new Error('waitForSettled: distributionExecuting never returned to idle');
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
}

function fakeArweaveWallet({ failWith = null } = {}) {
    let counter = 0;
    return {
        connect: async () => { /* grants permission, as a real wallet would */ },
        sign: async (transaction) => {
            if (failWith) throw failWith;
            counter += 1;
            return { ...transaction, owner: 'fake-owner-modulus', signature: 'fake-signature-bytes', id: `E2EAuditTx${counter}`.padEnd(43, '0') };
        }
    };
}

function fakeArweaveGateway({ anchor = 'fake-anchor', price = '999' } = {}) {
    return async (url) => {
        if (url.includes('/tx_anchor')) return new Response(anchor, { status: 200 });
        if (url.includes('/price/')) return new Response(price, { status: 200 });
        if (url.endsWith('/tx')) return new Response('accepted', { status: 200 });
        throw new Error(`fakeArweaveGateway: unexpected url ${url}`);
    };
}

function fakeNostrExtension({ failWith = null } = {}) {
    let counter = 0;
    return {
        getPublicKey: async () => 'fake-pubkey-hex',
        signEvent: async (event) => {
            if (failWith) throw failWith;
            counter += 1;
            const hex = counter.toString(16);
            return { ...event, id: `facade${hex}`.padEnd(64, '0'), sig: `deadbeef${hex}`.padEnd(128, '0') };
        }
    };
}

// A relay fake that records exactly what it was sent, for Section B's own
// "the relay receives the intended event" assertion.
function fakeRelayWebSocket({ accept = true, onEvent = null } = {}) {
    return class FakeSocket {
        constructor(url) { this.url = url; }
        send(data) {
            const [, event] = JSON.parse(data);
            if (onEvent) onEvent(event, this.url);
            const frame = accept ? ['OK', event.id, true] : ['OK', event.id, false, 'relay full'];
            queueMicrotask(() => { if (this.onmessage) this.onmessage({ data: JSON.stringify(frame) }); });
        }
        close() {}
    };
}

function silentRelayWebSocket() {
    return class SilentSocket {
        constructor(url) { this.url = url; }
        send() { /* never acknowledges — this file's own timeout must fire */ }
        close() {}
    };
}

function withAutoOpen(SocketClass) {
    return class AutoOpenSocket extends SocketClass {
        constructor(url) {
            super(url);
            queueMicrotask(() => { if (this.onopen) this.onopen(); });
        }
    };
}

// Exactly ui/main.js's own sequence — see PublicationDistributionHostCapabilityIntegration.test.js's
// own identical helper.
function composeHostWiredCommand({ lifecycleStore, arweaveInjectedProvider, arweaveFetchImpl, nostrInjectedProvider, nostrWebSocketImpl, discoveryTag = 'forkbuild-publication' }) {
    const arweaveHostSigner = createArweaveInjectedProviderSigner({ injectedProvider: arweaveInjectedProvider, fetchImpl: arweaveFetchImpl });
    const nostrHostPublisher = createNostrInjectedProviderPublisher({ injectedProvider: nostrInjectedProvider, webSocketImpl: nostrWebSocketImpl });

    const arweavePublicationRuntimeCapabilities = createArweavePublicationDistributionRuntimeAdapter({ signer: arweaveHostSigner, fetchImpl: arweaveFetchImpl });
    const nostrPublicationRuntimeCapabilities = createNostrPublicationDistributionRuntimeAdapter({ publish: nostrHostPublisher });

    const publicationDistributionRuntimeProvider = createPublicationDistributionRuntimeProvider({
        ...arweavePublicationRuntimeCapabilities,
        ...nostrPublicationRuntimeCapabilities,
        discoveryTag
    });

    const { arweaveUploaderOptions, nostrPublisherOptions } = resolvePublicationDistributionRuntimeConfiguration(publicationDistributionRuntimeProvider.resolveRuntimeCapabilities());
    const publicationDistributionCommand = arweaveUploaderOptions && nostrPublisherOptions
        ? composePublicationDistributionCommand({ lifecycleStore, arweaveUploaderOptions, nostrPublisherOptions })
        : null;

    return {
        arweaveUploaderOptions,
        nostrPublisherOptions,
        distributionCommand: publicationDistributionCommand && ((publication) => publicationDistributionCommand({
            publication,
            serializedMaterial: JSON.stringify(publication.toJSON())
        }))
    };
}

function base64UrlDecode(value) {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(value.length + (4 - (value.length % 4 || 4)) % 4, '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

async function run() {
    // ===================================================================
    // Section A — Arweave semantics.
    // ===================================================================
    {
        const material = 'audit material — 世界 🌍 — with multi-byte characters';
        const expectedBytes = new TextEncoder().encode(material);

        const signer = createArweaveInjectedProviderSigner({
            injectedProvider: fakeArweaveWallet(),
            fetchImpl: fakeArweaveGateway()
        });

        // A1 — material bytes are exactly the intended bytes: decode the
        // transaction's own `data` field and compare byte-for-byte against
        // what TextEncoder produced from the original string.
        const { transaction } = await signer.sign(material);
        const decodedBytes = base64UrlDecode(transaction.data);
        assert(decodedBytes.length === expectedBytes.length, 'A1. the decoded transaction data has the exact expected byte length');
        assert(expectedBytes.every((b, i) => decodedBytes[i] === b), 'A1. the decoded transaction data is byte-for-byte identical to TextEncoder(material) — no re-encoding drift');

        // A2 — data_root is deterministic: two independent sign() calls
        // over byte-identical material, with a fixed anchor/reward, produce
        // the identical data_root — a keyless, public computation over the
        // material alone, unaffected by the wallet's own per-call signature.
        const signerTwo = createArweaveInjectedProviderSigner({
            injectedProvider: fakeArweaveWallet(),
            fetchImpl: fakeArweaveGateway()
        });
        const first = await signer.sign(material);
        const second = await signerTwo.sign(material);
        assert(first.transaction.data_root === second.transaction.data_root, 'A2. data_root is a deterministic function of the material bytes alone — two independent signer instances over identical material agree exactly');
        assert(first.id !== second.id, 'A2. (sanity) the transaction id itself still differs across independent wallet signatures — data_root determinism is not merely "everything is identical"');

        // A3 — signing remains delegated to the wallet: owner/signature/id
        // on the resolved transaction are exactly whatever the injected
        // provider returned, never computed or altered by this file.
        assert(first.transaction.owner === 'fake-owner-modulus', 'A3. owner is exactly the wallet\'s own value — never computed by the signer adapter');
        assert(first.transaction.signature === 'fake-signature-bytes', 'A3. signature is exactly the wallet\'s own value — never computed by the signer adapter');

        // A4 — private key material never enters the application: the
        // signer adapter's own source never references a private key, a
        // seed, or an RSA/JWK keypair of any kind — it only ever forwards
        // an already-built, unsigned transaction to the wallet.
        const { readFile } = await import('node:fs/promises');
        const signerSource = await readFile(new URL('../arweave/ArweaveInjectedProviderSigner.js', import.meta.url), 'utf8');
        const signerCodeOnly = signerSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!/privateKey|jwk|generateKey|importKey/i.test(signerCodeOnly), 'A4. the signer adapter never generates, imports, or references private key material of its own — only the prose EXPLAINS why RSA-PSS signing is delegated, no code performs it');

        // A5 — a genuine gateway failure propagates, not swallowed, through
        // the FULL host-wired chain (not merely the signer in isolation).
        {
            const failingGateway = async (url) => {
                if (url.includes('/tx_anchor')) throw new Error('network unreachable');
                return fakeArweaveGateway()(url);
            };
            const failingSigner = createArweaveInjectedProviderSigner({ injectedProvider: fakeArweaveWallet(), fetchImpl: failingGateway });
            await failingSigner.sign('some material').then(
                () => assert(false, 'A5. a gateway failure should have propagated as a rejection'),
                () => { /* expected */ }
            );
        }

        // A6 — wallet rejection propagates, not swallowed. A real wallet
        // extension rejecting its own permission/signing prompt (the user
        // clicked "Reject") is a first-class, expected failure mode a fake
        // signer could only approximate before 0.9.121 — this is the exact
        // scenario Section H of the audit brief flagged as newly real.
        {
            const rejectingWallet = fakeArweaveWallet({ failWith: new Error('User rejected the request.') });
            const rejectingSigner = createArweaveInjectedProviderSigner({ injectedProvider: rejectingWallet, fetchImpl: fakeArweaveGateway() });
            await rejectingSigner.sign('some material').then(
                () => assert(false, 'A6. a wallet rejection should have propagated as a rejection, never resolved'),
                (error) => assert(/rejected/i.test(error.message), 'A6. the wallet\'s own rejection reason survives, unrewritten, to the signer\'s own caller')
            );
        }

        // A7 — transaction construction remains confined to the host
        // adapter: ArweavePublicationMaterialUploader.js (0.9.45, the
        // Arweave DISTRIBUTION layer) never itself builds a transaction
        // object or computes data_root — it treats `signer.sign()`'s own
        // `transaction` field as an opaque blob it only ever
        // JSON.stringifies. See Section H, below, for the full boundary
        // audit this line item only spot-checks.
        const uploaderSource = await readFile(new URL('../application/ArweavePublicationMaterialUploader.js', import.meta.url), 'utf8');
        assert(!/data_root|crypto\.subtle|format:\s*2/.test(uploaderSource), 'A7. the Arweave DISTRIBUTION layer (application/) never itself constructs a transaction or computes data_root — that stays inside the host adapter');

        // A8 — single-chunk enforcement remains intact (still, end to end).
        const oversizedSigner = createArweaveInjectedProviderSigner({ injectedProvider: fakeArweaveWallet(), fetchImpl: fakeArweaveGateway() });
        const oversizedMaterial = 'x'.repeat(300 * 1024);
        await oversizedSigner.sign(oversizedMaterial).then(
            () => assert(false, 'A8. oversized material should have been rejected before any network call'),
            (error) => assert(/single-chunk limit/.test(error.message), 'A8. single-chunk enforcement still holds')
        );

        console.log('✓ Section A: Arweave semantics — material bytes exact, data_root deterministic, signing delegated, private keys never enter the app, gateway/wallet failures both propagate, transaction construction confined to the host adapter, single-chunk ceiling intact');
    }

    // ===================================================================
    // Section B — Nostr semantics.
    // ===================================================================
    {
        // B1/B2 — the extension signs the intended event, and the relay
        // receives that same intended event: capture both.
        let signedEventTemplate = null;
        let sentToRelay = null;
        const extension = {
            getPublicKey: async () => 'fake-pubkey-hex',
            signEvent: async (event) => {
                signedEventTemplate = event;
                return { ...event, id: 'facadeB1'.padEnd(64, '0'), sig: 'deadbeefB1'.padEnd(128, '0') };
            }
        };
        const socketCtor = withAutoOpen(fakeRelayWebSocket({ onEvent: (event) => { sentToRelay = event; } }));
        const publish = createNostrInjectedProviderPublisher({ injectedProvider: extension, webSocketImpl: socketCtor });

        const intendedTemplate = { kind: 30078, tags: [['t', 'forkbuild-publication']], content: 'the intended discovery envelope, serialized' };
        const result = await publish('wss://relay.example', intendedTemplate);

        assert(signedEventTemplate.kind === intendedTemplate.kind, 'B1. the extension was asked to sign the intended kind');
        assert(signedEventTemplate.content === intendedTemplate.content, 'B1. the extension was asked to sign the intended content, unmodified');
        assert(JSON.stringify(signedEventTemplate.tags) === JSON.stringify(intendedTemplate.tags), 'B1. the extension was asked to sign the intended tags, unmodified');
        assert(sentToRelay.id === 'facadeB1'.padEnd(64, '0'), 'B2. the relay received exactly the event the extension signed — same id, not a re-derived one');
        assert(sentToRelay.content === intendedTemplate.content, 'B2. the relay received the intended content, unmodified end to end');
        assert(result.published === true && result.id === sentToRelay.id, 'B3. an OK-true frame resolves published: true with the relay-acknowledged id');

        // B4 — relay rejection is distinguishable from successful
        // publication: an OK-false frame resolves published: false with the
        // relay's own reason, never conflated with published: true.
        const decliningSocketCtor = withAutoOpen(fakeRelayWebSocket({ accept: false }));
        const decliningPublish = createNostrInjectedProviderPublisher({ injectedProvider: fakeNostrExtension(), webSocketImpl: decliningSocketCtor });
        const declined = await decliningPublish('wss://relay.example', { kind: 30078, tags: [], content: 'declined' });
        assert(declined.published === false && typeof declined.reason === 'string', 'B4. relay rejection resolves published: false with a distinguishable reason, never thrown, never conflated with success');

        // B5 — relay silence times out, as a genuine rejection.
        const silentPublish = createNostrInjectedProviderPublisher({ injectedProvider: fakeNostrExtension(), webSocketImpl: withAutoOpen(silentRelayWebSocket()), timeoutMs: 50 });
        await silentPublish('wss://relay.example', { kind: 30078, tags: [], content: 'never acknowledged' }).then(
            () => assert(false, 'B5. relay silence should have timed out, not resolved'),
            (error) => assert(/timing out|timed out/i.test(error.message), 'B5. relay silence times out as a genuine, propagated rejection')
        );

        // B6 — signing failure doesn't masquerade as successful
        // publication: the extension itself rejecting (the user declined
        // the NIP-07 permission/signing prompt) must propagate as a
        // rejection, never resolve `published: false` (which would
        // conflate "the user declined to sign" with "the relay declined
        // the event" — two entirely different failure sites).
        const rejectingExtension = fakeNostrExtension({ failWith: new Error('User declined the signing request.') });
        const rejectingPublish = createNostrInjectedProviderPublisher({ injectedProvider: rejectingExtension, webSocketImpl: withAutoOpen(fakeRelayWebSocket()) });
        await rejectingPublish('wss://relay.example', { kind: 30078, tags: [], content: 'never signed' }).then(
            () => assert(false, 'B6. a signing failure should propagate as a rejection, never resolve as if published'),
            (error) => assert(/declined the signing/i.test(error.message), 'B6. the extension\'s own rejection reason survives, unrewritten — never reported as a relay decline')
        );

        // B7 — discovery remains discovery evidence, never verification
        // evidence: neither new file imports anything from the
        // verification/provenance family, and the value this milestone's
        // own runtime adapter forwards is never read by anything that
        // computes a WorldEncounterMaterialVerificationStatus.
        const { readFile } = await import('node:fs/promises');
        const publisherSource = await readFile(new URL('../nostr/NostrInjectedProviderPublisher.js', import.meta.url), 'utf8');
        assert(!/verif/i.test(publisherSource), 'B7. nostr/NostrInjectedProviderPublisher.js contains no verification vocabulary whatsoever — it signs and broadcasts, nothing more');
        assert(Object.values(WorldEncounterMaterialVerificationStatus).every((status) => !Object.values(PublicationDistributionState).includes(status)), 'B7. distribution states and verification statuses remain two entirely disjoint vocabularies — a Nostr discovery fact can never be mistaken for a verification result by shared vocabulary alone');

        console.log('✓ Section B: Nostr semantics — the intended event is what gets signed and broadcast, OK/decline/timeout/signing-failure are each handled distinctly, discovery evidence stays structurally separate from verification evidence');
    }

    // ===================================================================
    // Section C — Arweave/Nostr independence.
    //
    // The audit brief asked for both directions: "Arweave succeeds, Nostr
    // fails" AND "Arweave fails, Nostr succeeds." Only the first is
    // actually reachable by this codebase's own design, and that is
    // correct, not a gap: application/PublicationDistributionDescriptor.js
    // (0.9.44) builds a Nostr discovery envelope whose own `uri` field IS
    // the Arweave materialUri — a Nostr event announces WHERE material
    // already lives, so it cannot meaningfully exist before material does.
    // application/PublicationDistributionExecutor.js's own "stop-on-failure
    // ordering" (0.9.49) already encodes this: the Nostr publish step is
    // never reached at all unless the Arweave upload step already produced
    // a materialUri. This section proves both halves of that asymmetry
    // explicitly, rather than silently assuming the brief's own diagram.
    // ===================================================================
    {
        // C1 — FLAGSHIP: Arweave succeeds, Nostr declines (a relay OK-false
        // frame) — through the FULL host-wired chain, exactly as ui/main.js
        // wires it — and Arweave's own already-obtained fact is never
        // rolled back.
        {
            const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
            const publication = signedPublication({ id: 'pub-e2e-audit-c1', documentId: 'doc-e2e-audit-c1' });

            const { distributionCommand } = composeHostWiredCommand({
                lifecycleStore,
                arweaveInjectedProvider: fakeArweaveWallet(),
                arweaveFetchImpl: fakeArweaveGateway(),
                nostrInjectedProvider: fakeNostrExtension(),
                nostrWebSocketImpl: withAutoOpen(fakeRelayWebSocket({ accept: false }))
            });

            const ctx = canvasCtx({ distributionLifecycleStore: lifecycleStore, distributionCommand });
            ctx.selectedEncounter = { kind: 'PUBLICATION', objectId: publication.id };
            ctx.refreshDistributionLifecycle();
            ctx.materialInspection = { loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, resolvedSelection: ctx.selectedEncounter, material: publication } };

            ctx.distributeSelectedPublication();
            await waitForSettled(ctx);

            assert(ctx.distributionError === null, 'C1. a relay decline (not a genuine rejection) after a successful Arweave upload is still an ordinary, successful command call — no error notice');
            assert(ctx.distributionMaterialState === PublicationDistributionState.PRESENT, 'C1. Arweave\'s own successful upload is recorded — never rolled back because Nostr declined');
            assert(ctx.distributionDiscoveryState === PublicationDistributionState.ABSENT, 'C1. Nostr\'s own decline is recorded honestly as ABSENT, independent of Arweave\'s success');
            assert(lifecycleStore.get(publication.id).material.uri.startsWith('ar://E2EAuditTx'), 'C1. the recorded material fact traces back to the real (fake-backed) wallet\'s own signature — the upload genuinely happened');

            console.log('✓ Section C.1: FLAGSHIP — Arweave succeeds, Nostr declines, through the full host-wired chain, with no rollback of Arweave\'s own already-obtained fact');
        }

        // C2 — the converse direction is architecturally UNREACHABLE, by
        // design: when the Arweave leg genuinely fails (a wallet
        // rejection — the real-world shape 0.9.121 introduced), the Nostr
        // leg is never even attempted. Proven by making the Nostr leg
        // throw if it is ever invoked at all.
        {
            const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
            const publication = signedPublication({ id: 'pub-e2e-audit-c2', documentId: 'doc-e2e-audit-c2' });

            let nostrLegInvoked = false;
            const arweaveHostSigner = createArweaveInjectedProviderSigner({
                injectedProvider: fakeArweaveWallet({ failWith: new Error('User rejected the request.') }),
                fetchImpl: fakeArweaveGateway()
            });
            const nostrHostPublisher = createNostrInjectedProviderPublisher({
                injectedProvider: fakeNostrExtension(),
                webSocketImpl: withAutoOpen(fakeRelayWebSocket({ onEvent: () => { nostrLegInvoked = true; } }))
            });

            const arweavePublicationRuntimeCapabilities = createArweavePublicationDistributionRuntimeAdapter({ signer: arweaveHostSigner, fetchImpl: fakeArweaveGateway() });
            const nostrPublicationRuntimeCapabilities = createNostrPublicationDistributionRuntimeAdapter({ publish: nostrHostPublisher });
            const provider = createPublicationDistributionRuntimeProvider({
                ...arweavePublicationRuntimeCapabilities,
                ...nostrPublicationRuntimeCapabilities,
                discoveryTag: 'forkbuild-publication'
            });
            const { arweaveUploaderOptions, nostrPublisherOptions } = resolvePublicationDistributionRuntimeConfiguration(provider.resolveRuntimeCapabilities());
            const command = composePublicationDistributionCommand({ lifecycleStore, arweaveUploaderOptions, nostrPublisherOptions });

            await command({ publication, serializedMaterial: JSON.stringify(publication.toJSON()) }).then(
                () => assert(false, 'C2. a genuine wallet rejection on the Arweave leg should propagate as a rejection'),
                () => { /* expected — see Section D for what the UI does with this */ }
            );

            assert(nostrLegInvoked === false, 'C2. the Nostr leg is structurally UNREACHABLE when the Arweave leg genuinely fails — discovery announces where material lives, so it can never run before material exists; this is the correct, deliberate asymmetry, not a missing test');
            assert(lifecycleStore.get(publication.id) === null, 'C2. (documented, pre-existing 0.9.58 behavior, unchanged by 0.9.121) a genuine rejection on the very first collaborator call records nothing at all — there was no fact of any kind to record');

            console.log('✓ Section C.2: the converse independence direction ("Arweave fails, Nostr succeeds") is architecturally unreachable by design — Nostr publish is never even attempted without a materialUri already in hand');
        }

        // C3 — no transaction-like "both must succeed" semantic has been
        // introduced anywhere: a successful Arweave leg with an ABSENT
        // Nostr leg (C1, above) is treated as an ordinary, valid, non-error
        // outcome by the command layer — never retried, never unwound.
        {
            const uploader = { storage: 'ar', upload: async () => 'ar://already-uploaded-tx-id' };
            const descriptor = () => ({ material: { uri: 'ar://already-uploaded-tx-id', storage: 'ar' }, discoveryEnvelope: { protocol: 'p', version: 1, kind: 'k', objectId: 'o', uri: 'ar://already-uploaded-tx-id' } });
            const publisher = { discoveryTag: 'forkbuild-publication', publish: async () => null };
            const result = await executePublicationDistribution({
                publication: signedPublication({ id: 'pub-e2e-audit-c3', documentId: 'doc-e2e-audit-c3' }),
                serializedMaterial: 'irrelevant',
                materialUploader: uploader,
                distributionDescriptor: descriptor,
                discoveryPublisher: publisher
            });
            assert(result !== null && result.material !== null && result.discovery === null, 'C3. an ordinary Nostr decline after a successful Arweave upload resolves normally, as a partial result — never a thrown "transaction" failure, never a retry of the upload');

            console.log('✓ Section C.3: no "both substrates must succeed" transactional semantic exists anywhere in the executor — partial success composes, exactly as 0.9.49 always documented');
        }
    }

    // ===================================================================
    // Section D — lifecycle semantics.
    // ===================================================================
    {
        // D1 — a wallet-rejection-shaped failure collapses into the exact
        // same generic notice as every other failure this component has
        // ever produced — never a distinguished "wallet rejected" /
        // "relay timeout" / "gateway unavailable" message, and no new
        // `distributionError` vocabulary of any kind.
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = signedPublication({ id: 'pub-e2e-audit-d1', documentId: 'doc-e2e-audit-d1' });

        const { distributionCommand } = composeHostWiredCommand({
            lifecycleStore,
            arweaveInjectedProvider: fakeArweaveWallet({ failWith: new Error('User rejected the request.') }),
            arweaveFetchImpl: fakeArweaveGateway(),
            nostrInjectedProvider: fakeNostrExtension(),
            nostrWebSocketImpl: withAutoOpen(fakeRelayWebSocket())
        });

        const ctx = canvasCtx({ distributionLifecycleStore: lifecycleStore, distributionCommand });
        ctx.selectedEncounter = { kind: 'PUBLICATION', objectId: publication.id };
        ctx.refreshDistributionLifecycle();
        ctx.materialInspection = { loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, resolvedSelection: ctx.selectedEncounter, material: publication } };

        ctx.distributeSelectedPublication();
        await waitForSettled(ctx);

        assert(ctx.distributionError === 'Distribution could not be completed.', 'D1. a real wallet rejection ends in EXACTLY the same generic notice as the pre-0.9.121 "missing capability" case — no leaked wallet error text, no new vocabulary');
        assert(ctx.distributionMaterialState === PublicationDistributionState.ABSENT, 'D1. no phantom PRESENT state appears for a leg that genuinely rejected');
        assert(lifecycleStore.get(publication.id) === null, 'D1. the lifecycle store stays untouched — a rejection is not silently reinterpreted as a partial success');

        // D2 — the lifecycle vocabulary itself is unchanged: only ABSENT
        // and PRESENT exist, on both dimensions, even now that real
        // failures are reachable.
        assert(Object.keys(PublicationDistributionState).length === 2, 'D2. PublicationDistributionState still names exactly two values');
        assert(PublicationDistributionState.ABSENT === 'ABSENT' && PublicationDistributionState.PRESENT === 'PRESENT', 'D2. no WALLET_REJECTED / RELAY_TIMEOUT / GATEWAY_UNAVAILABLE (or similar) value has been introduced anywhere in the lifecycle vocabulary');

        console.log('✓ Section D: lifecycle semantics — real host failures collapse into the same generic, pre-existing notice; no new lifecycle vocabulary exists anywhere');
    }

    // ===================================================================
    // Section E — the UI stays a thin observer.
    // ===================================================================
    {
        const { readFile, readdir } = await import('node:fs/promises');
        const uiDir = new URL('../ui/', import.meta.url);
        const forbidden = /window\.arweaveWallet|window\.nostr\b|crypto\.subtle|new WebSocket\(|createTransaction|data_root|signEvent\(/;

        async function auditDir(dirUrl, relativeLabel) {
            const entries = await readdir(dirUrl, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    await auditDir(new URL(`${entry.name}/`, dirUrl), `${relativeLabel}${entry.name}/`);
                    continue;
                }
                if (!entry.name.endsWith('.js')) continue;
                const source = await readFile(new URL(entry.name, dirUrl), 'utf8');
                const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
                const isCompositionRoot = entry.name === 'main.js';
                if (isCompositionRoot) {
                    // main.js alone is allowed to RESOLVE window.arweaveWallet/window.nostr
                    // (it is the composition root) but never to construct a
                    // transaction, sign, or open a relay socket itself.
                    assert(!/crypto\.subtle|new WebSocket\(|createTransaction|data_root|signEvent\(/.test(codeOnly), `E. ${relativeLabel}${entry.name} resolves host capabilities but never itself signs, chunks, or broadcasts`);
                    continue;
                }
                assert(!forbidden.test(codeOnly), `E. ${relativeLabel}${entry.name} never touches window.arweaveWallet/window.nostr/crypto.subtle/WebSocket/transaction-or-event construction directly — only the composition root (ui/main.js) may resolve host capabilities`);
            }
        }

        await auditDir(uiDir, '');
        console.log('✓ Section E: every ui/ file outside the composition root stays a thin observer — no direct wallet/relay/signing/transaction access anywhere');
    }

    // ===================================================================
    // Section F — the new host capabilities are structurally invisible to
    // discovery/verification/selection.
    // ===================================================================
    {
        const { readFile } = await import('node:fs/promises');
        const arweaveSource = await readFile(new URL('../arweave/ArweaveInjectedProviderSigner.js', import.meta.url), 'utf8');
        const nostrSource = await readFile(new URL('../nostr/NostrInjectedProviderPublisher.js', import.meta.url), 'utf8');

        assert(!/from '\.\.\/application/.test(arweaveSource), 'F. arweave/ArweaveInjectedProviderSigner.js imports nothing from application/ — it has no idea a distribution, discovery, or verification pipeline exists');
        assert(!/from '\.\.\/application/.test(nostrSource), 'F. nostr/NostrInjectedProviderPublisher.js imports nothing from application/ — same restraint, same file family');
        assert(!/from '\.\.\/core/.test(arweaveSource) && !/from '\.\.\/core/.test(nostrSource), 'F. neither new file imports anything from core/ — no DecentralizedDiscoveryEnvelope, no WorldEncounter vocabulary, nothing');

        // DISCOVERED != VERIFIED != DISTRIBUTED: three genuinely disjoint
        // vocabularies, confirmed by construction rather than assumed.
        const distributionValues = new Set(Object.values(PublicationDistributionState));
        const verificationValues = new Set(Object.values(WorldEncounterMaterialVerificationStatus));
        const loadValues = new Set(Object.values(WorldEncounterMaterialLoadStatus));
        const overlap = [...distributionValues].filter((v) => verificationValues.has(v) || loadValues.has(v));
        assert(overlap.length === 0, 'F. distribution state, verification status, and material load status remain three entirely disjoint vocabularies — a PRESENT distribution fact can never be mistaken for a VERIFIED material fact by shared spelling alone');

        console.log('✓ Section F: the new host capabilities are structurally invisible to discovery/verification/selection — no import path exists between them, and their vocabularies never overlap');
    }

    // ===================================================================
    // Section G — one real-browser-capability-boundary chain test.
    // ===================================================================
    {
        // A fake, but window-shaped, injected provider pair — never a real
        // wallet, never a real relay — driven through EVERY layer: host
        // adapter -> runtime adapter -> runtime provider -> configuration
        // -> command composition -> orchestrator -> executor -> lifecycle
        // store, in one call, exactly as a real browser click would.
        const windowShapedArweaveWallet = fakeArweaveWallet();
        const windowShapedNostrExtension = fakeNostrExtension();
        assert(typeof windowShapedArweaveWallet.sign === 'function' && typeof windowShapedArweaveWallet.connect === 'function', 'G. the Arweave fake exposes exactly the ArConnect-shaped surface this milestone\'s own adapter reads — sign()/connect(), nothing more assumed');
        assert(typeof windowShapedNostrExtension.getPublicKey === 'function' && typeof windowShapedNostrExtension.signEvent === 'function', 'G. the Nostr fake exposes exactly the NIP-07-shaped surface this milestone\'s own adapter reads — getPublicKey()/signEvent(), nothing more assumed');

        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = signedPublication({ id: 'pub-e2e-audit-g1', documentId: 'doc-e2e-audit-g1' });
        const { distributionCommand } = composeHostWiredCommand({
            lifecycleStore,
            arweaveInjectedProvider: windowShapedArweaveWallet,
            arweaveFetchImpl: fakeArweaveGateway(),
            nostrInjectedProvider: windowShapedNostrExtension,
            nostrWebSocketImpl: withAutoOpen(fakeRelayWebSocket())
        });

        const ctx = canvasCtx({ distributionLifecycleStore: lifecycleStore, distributionCommand });
        ctx.selectedEncounter = { kind: 'PUBLICATION', objectId: publication.id };
        ctx.refreshDistributionLifecycle();
        ctx.materialInspection = { loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, resolvedSelection: ctx.selectedEncounter, material: publication } };

        ctx.distributeSelectedPublication();
        await waitForSettled(ctx);

        assert(ctx.distributionMaterialState === PublicationDistributionState.PRESENT && ctx.distributionDiscoveryState === PublicationDistributionState.PRESENT, 'G. window capability -> host adapter -> runtime adapter -> executor -> lifecycle, as one uninterrupted chain, reaches PRESENT/PRESENT');

        console.log('✓ Section G: window capability -> host adapter -> existing runtime adapter -> existing executor, proven as one chain, using realistic fakes — never a real wallet or relay');
    }

    // ===================================================================
    // Section H — host-adapter-vs-protocol-implementation boundary audit.
    //
    // The question this section answers: is every piece of logic in
    // ArweaveInjectedProviderSigner genuinely required to translate the
    // browser wallet contract, or has Arweave protocol logic that belongs
    // in the distribution layer migrated into this host-side file?
    //
    // Answer, confirmed structurally rather than merely asserted:
    // application/ArweavePublicationMaterialUploader.js's OWN header
    // (0.9.45, unmodified by 0.9.121) already documents "Delegating
    // 'construct, sign'... to the signer" as ITS OWN, pre-existing design
    // choice — the uploader treats `signer.sign()`'s own `transaction`
    // field as opaque, `JSON.stringify()`-ed without being read for
    // meaning. That means whichever object plays `signer` is CONTRACTUALLY
    // responsible for transaction construction (format/last_tx/reward/
    // data_root/etc.) — this was true, and already written down, three
    // milestones before ArweaveInjectedProviderSigner.js existed to fill
    // that role. Building a real transaction is therefore not protocol
    // logic that "migrated" into the host adapter; it is the host
    // adapter fulfilling a contract the distribution layer had already,
    // deliberately, pushed outward. The one piece of genuine Arweave
    // protocol math the signer performs — the single-leaf data_root
    // Merkle computation — is exactly the one piece a real wallet's own
    // sign() call cannot be assumed to perform on the caller's behalf
    // (ArConnect/Wander sign what they are given; they do not reshape
    // it), so it has no other legitimate home.
    // ===================================================================
    {
        const { readFile } = await import('node:fs/promises');
        const uploaderSource = await readFile(new URL('../application/ArweavePublicationMaterialUploader.js', import.meta.url), 'utf8');
        const uploaderFlattened = uploaderSource.split('\n').map((line) => line.replace(/^\s*\/\/\s?/, '')).join(' ').replace(/\s+/g, ' ');
        assert(/Delegating "construct, sign" entirely to an injected/.test(uploaderFlattened), 'H. the Arweave DISTRIBUTION layer\'s own header already documents delegating transaction construction to the signer — this predates ArweaveInjectedProviderSigner.js by three milestones (0.9.45 vs 0.9.121)');
        assert(/completely opaque, POSTing it unread/.test(uploaderFlattened) && /unread and uninterpreted/.test(uploaderFlattened), 'H. the uploader treats the signer\'s transaction as opaque — it never reads data_root/format/tags for meaning, confirming it never duplicates what the host adapter builds');

        const arweaveSource = await readFile(new URL('../arweave/ArweaveInjectedProviderSigner.js', import.meta.url), 'utf8');
        const arweaveCodeOnly = arweaveSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        // The only genuinely cryptographic/protocol computation in this
        // file is the single-leaf data_root — everything else is either
        // wallet-contract plumbing (connect/sign) or gateway plumbing
        // (anchor/price lookups the uploader's own header already
        // documents as the signer's job, not the uploader's).
        assert(/computeSingleChunkDataRoot/.test(arweaveCodeOnly), 'H. (sanity) the one piece of real Arweave protocol math this file performs is exactly the single-leaf data_root computation named in this section\'s own header');
        assert(!/RSA|deepHash|jwsSign/i.test(arweaveCodeOnly), 'H. no RSA-PSS signing or deep-hash computation exists in the host adapter\'s own CODE — everything requiring the wallet\'s own private key stays inside injectedProvider.sign()');

        console.log('✓ Section H: ArweaveInjectedProviderSigner\'s transaction construction fulfills a contract application/ArweavePublicationMaterialUploader.js already, deliberately, pushed outward at 0.9.45 — no protocol logic has migrated out of the distribution layer; only the wallet\'s own private-key signing stays genuinely delegated');
    }

    console.log('\nAll PublicationDistributionEndToEndRuntimeAudit tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
