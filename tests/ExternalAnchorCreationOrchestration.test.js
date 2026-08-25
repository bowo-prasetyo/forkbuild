import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { ContentReference } from '../core/ContentReference.js';
import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { LocalPublicationAnchorCatalog } from '../application/LocalPublicationAnchorCatalog.js';
import { CreatePublicationAnchorUseCase } from '../application/CreatePublicationAnchorUseCase.js';
import { CreateExternalPublicationAnchorUseCase } from '../application/CreateExternalPublicationAnchorUseCase.js';
import { CreateExternalPublicationAnchorOrchestratorUseCase } from '../application/CreateExternalPublicationAnchorOrchestratorUseCase.js';
import { ExternalAnchorPublisherRegistry } from '../application/ExternalAnchorPublisherRegistry.js';
import { ExternalAnchorCreationOutcome } from '../application/ExternalAnchorCreationOutcome.js';
import { ExternalAnchorVerifier } from '../application/ExternalAnchorVerifier.js';
import { AnchorVerificationOutcome } from '../application/AnchorVerificationOutcome.js';
import { BitcoinAnchorPublisher } from '../anchoring/BitcoinAnchorPublisher.js';
import { BitcoinOpReturnProofVerifier } from '../anchoring/BitcoinOpReturnProofVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.8.10 — External Anchor Creation Orchestration & Publisher Registry.
//
//   Section A: flagship — Alice's CreateExternalPublicationAnchorUseCase,
//              wired via the composition root with a real
//              BitcoinAnchorPublisher, publishes to a fake Bitcoin
//              network and produces a cataloged, genuinely signed
//              PublicationAnchor; Bob — none of Alice's local state —
//              independently verifies it, PROOF_UNAVAILABLE while
//              unconfirmed, VALID once the same fake network confirms
//              the same unchanged anchor.
//   Section B: reuse, not reimplementation — a spy wrapped around a real
//              CreatePublicationAnchorUseCase proves the orchestration
//              delegates to it exactly once, with the publisher's own
//              locator/proof and no anchoredAt, rather than constructing
//              a PublicationAnchor by hand.
//   Section C: publisher selection — a registry holding two publishers
//              resolves each anchorType to its own publisher; an
//              anchorType nobody registered refuses before any publisher
//              is ever consulted; requesting one anchorType never
//              invokes a different publisher's code.
//   Section D: publisher failure prevents anchor creation — a
//              definite rejection, an explicit "unavailable", and a
//              throwing publisher all produce no PublicationAnchor and
//              never reach CreatePublicationAnchorUseCase at all.
//   Section E: content-hash invariant — the publisher always receives
//              the publication's own contentReference.hash; execute()
//              takes no caller-suppliable hash at all.
//   Section F: no automatic retry — a failing publisher is consulted
//              exactly once per execute() call.
//   Section G: duplicate anchoring is allowed — anchoring the same
//              publication twice, on the same anchorType, produces two
//              independent, equally cataloged PublicationAnchor records.
//
// See docs/Principles.md, "A Publisher's Failure Is Not the
// Orchestration's Failure — But It Is Still No Anchor (0.8.10)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function expectThrowsAsync(fn, message) {
    let threw = false;
    try { await fn(); } catch (e) { threw = true; }
    assert(threw, message);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

function opReturnOutput(hexData) {
    return {
        scriptpubkey_type: 'op_return',
        scriptpubkey_asm: `OP_RETURN OP_PUSHBYTES_${hexData.length / 2} ${hexData}`
    };
}

// Identical fake-Bitcoin-network technique tests/BitcoinAnchorCreationAdapter.test.js
// already established — a shared Map<txid, tx> a fake broadcaster writes
// into and a fake explorer reads from.
function makeFakeBitcoinNetwork() {
    const chain = new Map();
    let nextTxid = 0;

    const broadcaster = {
        async broadcast(opReturnHex, { network }) {
            nextTxid += 1;
            const txid = String(nextTxid).padStart(64, '0');
            chain.set(txid, { txid, network, vout: [opReturnOutput(opReturnHex)], status: { confirmed: false } });
            return { broadcast: true, txid };
        }
    };

    async function fetchImpl(url) {
        const parsed = new URL(url);
        const match = parsed.pathname.match(/\/tx\/([0-9a-f]+)$/i);
        if (match) {
            const tx = chain.get(match[1]);
            if (!tx) return new Response('not found', { status: 404 });
            return new Response(JSON.stringify(tx), { status: 200 });
        }
        return new Response('not found', { status: 404 });
    }

    function confirm(txid, blockHeight) {
        chain.get(txid).status = { confirmed: true, block_height: blockHeight };
    }

    return { chain, broadcaster, fetchImpl, confirm };
}

function makeReplica({ publishers = [] } = {}) {
    const publicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
    const anchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
    const identityProvider = makeIdentity('Alice');
    const { createExternalPublicationAnchorUseCase, publisherRegistry, createPublicationAnchorUseCase } =
        new CreateExternalPublicationAnchorOrchestratorUseCase().execute({
            publicationCatalog, anchorCatalog, identityProvider, publishers
        });
    return { publicationCatalog, anchorCatalog, identityProvider, createExternalPublicationAnchorUseCase, publisherRegistry, createPublicationAnchorUseCase };
}

function publishContent(publicationCatalog, { id, hash }) {
    const publication = new DecentralizedPublication({
        id, contentKind: 'forkbuild.structure', contentReference: new ContentReference({ hash })
    });
    publicationCatalog.add(publication);
    return publication;
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — flagship
    // ---------------------------------------------------------------
    let sharedAnchorJson, sharedTxid, network;
    {
        const net = makeFakeBitcoinNetwork();
        const publisher = new BitcoinAnchorPublisher({ network: 'mainnet', broadcaster: net.broadcaster });
        const { publicationCatalog, createExternalPublicationAnchorUseCase } = makeReplica({ publishers: [publisher] });

        const contentHash = 'f00dcafe';
        publishContent(publicationCatalog, { id: 'pub-flagship', hash: contentHash });

        const result = await createExternalPublicationAnchorUseCase.execute('pub-flagship', 'bitcoin-op-return');
        assert(result.outcome === ExternalAnchorCreationOutcome.CREATED, '1. a healthy publisher produces the CREATED outcome');
        assert(result.anchor instanceof PublicationAnchor, '2. the CREATED outcome carries a real PublicationAnchor');
        assert(result.anchor.contentHash === contentHash, '3. the created anchor binds to the publication\'s own contentHash');
        assert(result.anchor.anchorType === 'bitcoin-op-return', '4. the created anchor carries the publisher\'s own anchorType');
        assert(result.reason === null, '5. a CREATED result carries no reason');

        const bobAuthVerifier = new LocalAuthorizationVerifier();
        const bobAnchorVerifier = new ExternalAnchorVerifier(bobAuthVerifier);
        const bobProofVerifier = new BitcoinOpReturnProofVerifier({ apiUrl: 'https://bob-explorer.test/api', fetchImpl: net.fetchImpl });

        const anchorJson = result.anchor.toJSON();
        const stillUnconfirmed = await bobAnchorVerifier.verify(anchorJson, { expectedContentHash: contentHash, proofVerifier: bobProofVerifier });
        assert(stillUnconfirmed.outcome === AnchorVerificationOutcome.PROOF_UNAVAILABLE,
            '6. Bob\'s independent verification reports PROOF_UNAVAILABLE immediately after orchestrated publication — broadcast acceptance is not confirmation');

        sharedAnchorJson = anchorJson;
        sharedTxid = result.anchor.proof.txid;
        network = net;
    }
    console.log('✓ Section A: flagship — orchestrated publication produces a cataloged, signed PublicationAnchor Bob independently verifies as PROOF_UNAVAILABLE while unconfirmed');

    {
        network.confirm(sharedTxid, 900001);
        const bobAuthVerifier = new LocalAuthorizationVerifier();
        const bobAnchorVerifier = new ExternalAnchorVerifier(bobAuthVerifier);
        const bobProofVerifier = new BitcoinOpReturnProofVerifier({ apiUrl: 'https://bob-explorer.test/api', fetchImpl: network.fetchImpl });
        const nowConfirmed = await bobAnchorVerifier.verify(sharedAnchorJson, { expectedContentHash: sharedAnchorJson.contentHash, proofVerifier: bobProofVerifier });
        assert(nowConfirmed.outcome === AnchorVerificationOutcome.VALID,
            '7. the SAME orchestrated anchor, unchanged, verifies VALID once the external network confirms the transaction it already named');
    }
    console.log('✓ Section A (lifecycle): the same orchestrated anchor moves from PROOF_UNAVAILABLE to VALID purely because the external world changed');

    // ---------------------------------------------------------------
    // Section B — reuse, not reimplementation.
    // ---------------------------------------------------------------
    {
        const publicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const anchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
        const identityProvider = makeIdentity('Alice');
        const authVerifier = new LocalAuthorizationVerifier();
        const realCreateAnchor = new CreatePublicationAnchorUseCase(publicationCatalog, identityProvider, authVerifier, anchorCatalog);

        let executeCalls = 0;
        let capturedArgs = null;
        const spyCreateAnchor = {
            execute(publicationId, options) {
                executeCalls += 1;
                capturedArgs = { publicationId, options };
                return realCreateAnchor.execute(publicationId, options);
            }
        };

        const net = makeFakeBitcoinNetwork();
        const publisher = new BitcoinAnchorPublisher({ network: 'mainnet', broadcaster: net.broadcaster });
        const registry = new ExternalAnchorPublisherRegistry().register(publisher);
        const orchestration = new CreateExternalPublicationAnchorUseCase(publicationCatalog, registry, spyCreateAnchor);

        const contentHash = 'deadbeef';
        publishContent(publicationCatalog, { id: 'pub-spy', hash: contentHash });

        const result = await orchestration.execute('pub-spy', 'bitcoin-op-return');
        assert(executeCalls === 1, '8. the orchestration delegates to CreatePublicationAnchorUseCase.execute() exactly once — never zero, never twice');
        assert(capturedArgs.publicationId === 'pub-spy', '9. the same publicationId the caller supplied is forwarded unchanged');
        assert(capturedArgs.options.anchorType === 'bitcoin-op-return', '10. the publisher\'s own anchorType is forwarded');
        assert(typeof capturedArgs.options.locator === 'string' && capturedArgs.options.locator.length > 0, '11. the publisher\'s own locator is forwarded');
        assert(capturedArgs.options.proof && capturedArgs.options.proof.txid, '12. the publisher\'s own proof is forwarded');
        assert(!('anchoredAt' in capturedArgs.options), '13. no anchoredAt is ever forwarded — CreatePublicationAnchorUseCase\'s own "now" default applies');
        assert(result.outcome === ExternalAnchorCreationOutcome.CREATED, '14. the spy-mediated call still reports CREATED');
        assert(anchorCatalog.findByPublicationId('pub-spy').length === 1, '15. exactly one anchor was actually cataloged — via the real use case, not a hand-built one');
    }
    console.log('✓ Section B: the orchestration delegates to a real CreatePublicationAnchorUseCase exactly once, forwarding only anchorType/locator/proof — never constructs a PublicationAnchor itself');

    // ---------------------------------------------------------------
    // Section C — publisher selection.
    // ---------------------------------------------------------------
    {
        let bitcoinPublishCalls = 0;
        const bitcoinPublisher = {
            anchorType: 'bitcoin-op-return',
            async publish(contentHash) {
                bitcoinPublishCalls += 1;
                return { published: true, locator: `bitcoin:${contentHash}`, proof: { txid: '2'.repeat(64), network: 'mainnet' } };
            }
        };
        let otherPublishCalls = 0;
        const otherPublisher = {
            anchorType: 'other-chain',
            async publish(contentHash) {
                otherPublishCalls += 1;
                return { published: true, locator: `other:${contentHash}`, proof: { ref: contentHash } };
            }
        };

        const { publicationCatalog, createExternalPublicationAnchorUseCase } = makeReplica({ publishers: [bitcoinPublisher, otherPublisher] });
        publishContent(publicationCatalog, { id: 'pub-select', hash: 'c0ffee' });

        const otherResult = await createExternalPublicationAnchorUseCase.execute('pub-select', 'other-chain');
        assert(otherResult.outcome === ExternalAnchorCreationOutcome.CREATED, '16. the anchorType\'s own registered publisher is used');
        assert(otherResult.anchor.anchorType === 'other-chain', '17. the resulting anchor carries the SELECTED publisher\'s anchorType');
        assert(otherPublishCalls === 1, '18. the selected publisher was consulted');
        assert(bitcoinPublishCalls === 0, '19. requesting one anchorType never invokes a different publisher\'s code');

        await expectThrowsAsync(() => createExternalPublicationAnchorUseCase.execute('pub-select', 'no-such-chain'),
            '20. an anchorType with no registered publisher refuses');
        assert(bitcoinPublishCalls === 0 && otherPublishCalls === 1, '21. refusing an unregistered anchorType never consults ANY publisher');
    }
    console.log('✓ Section C: the registry resolves each anchorType to its own publisher only; an unregistered anchorType refuses before any publisher runs');

    // ---------------------------------------------------------------
    // Section D — publisher failure prevents anchor creation.
    // ---------------------------------------------------------------
    {
        const rejectingPublisher = {
            anchorType: 'bitcoin-op-return',
            async publish() { return { published: false, reason: 'transaction rejected as non-standard' }; }
        };
        const unavailablePublisher = {
            anchorType: 'bitcoin-op-return',
            async publish() { return { published: false, unavailable: true, reason: 'no funds currently available to spend' }; }
        };
        const throwingPublisher = {
            anchorType: 'bitcoin-op-return',
            async publish() { throw new Error('simulated connection failure'); }
        };

        for (const [publisher, expectedOutcome, label] of [
            [rejectingPublisher, ExternalAnchorCreationOutcome.PUBLISH_REJECTED, 'a definite rejection'],
            [unavailablePublisher, ExternalAnchorCreationOutcome.PUBLISH_UNAVAILABLE, 'an explicit unavailable'],
            [throwingPublisher, ExternalAnchorCreationOutcome.PUBLISH_UNAVAILABLE, 'a throwing publisher']
        ]) {
            const { publicationCatalog, anchorCatalog, createExternalPublicationAnchorUseCase } = makeReplica({ publishers: [publisher] });
            publishContent(publicationCatalog, { id: 'pub-fail', hash: 'baadf00d' });

            const result = await createExternalPublicationAnchorUseCase.execute('pub-fail', 'bitcoin-op-return');
            assert(result.outcome === expectedOutcome, `22. ${label} reports the outcome ${expectedOutcome}`);
            assert(result.anchor === null, `23. ${label} never returns a PublicationAnchor`);
            assert(typeof result.reason === 'string' && result.reason.length > 0, `24. ${label} reports a human-readable reason`);
            assert(anchorCatalog.findByPublicationId('pub-fail').length === 0, `25. ${label} never catalogs anything`);
        }
    }
    console.log('✓ Section D: a rejected, unavailable, or throwing publisher never produces a PublicationAnchor and never reaches the catalog');

    // ---------------------------------------------------------------
    // Section E — content-hash invariant.
    // ---------------------------------------------------------------
    {
        let receivedHash = null;
        const spyPublisher = {
            anchorType: 'bitcoin-op-return',
            async publish(contentHash) {
                receivedHash = contentHash;
                return { published: true, locator: `bitcoin:${contentHash}`, proof: { txid: '3'.repeat(64), network: 'mainnet' } };
            }
        };
        const { publicationCatalog, createExternalPublicationAnchorUseCase } = makeReplica({ publishers: [spyPublisher] });
        const publication = publishContent(publicationCatalog, { id: 'pub-hash', hash: 'a1b2c3d4' });

        await createExternalPublicationAnchorUseCase.execute('pub-hash', 'bitcoin-op-return');
        assert(receivedHash === publication.contentReference.hash, '26. the publisher always receives the publication\'s OWN contentReference.hash');
    }
    console.log('✓ Section E: the publisher receives exactly the publication\'s own contentReference.hash — execute() takes no caller-suppliable hash at all');

    // ---------------------------------------------------------------
    // Section F — no automatic retry.
    // ---------------------------------------------------------------
    {
        let publishCalls = 0;
        const flakyPublisher = {
            anchorType: 'bitcoin-op-return',
            async publish() { publishCalls += 1; return { published: false, unavailable: true, reason: 'timeout' }; }
        };
        const { publicationCatalog, createExternalPublicationAnchorUseCase } = makeReplica({ publishers: [flakyPublisher] });
        publishContent(publicationCatalog, { id: 'pub-retry', hash: 'facade00' });

        await createExternalPublicationAnchorUseCase.execute('pub-retry', 'bitcoin-op-return');
        assert(publishCalls === 1, '27. a single execute() call consults the publisher exactly once — no internal retry loop');
    }
    console.log('✓ Section F: a failing publisher is consulted exactly once per execute() call — the caller stays in control of any retry');

    // ---------------------------------------------------------------
    // Section G — duplicate anchoring is allowed.
    // ---------------------------------------------------------------
    {
        let nextTxid = 10;
        const publisher = {
            anchorType: 'bitcoin-op-return',
            async publish(contentHash) {
                nextTxid += 1;
                return { published: true, locator: `bitcoin:${nextTxid}`, proof: { txid: String(nextTxid).padStart(64, '0'), network: 'mainnet' } };
            }
        };
        const { publicationCatalog, anchorCatalog, createExternalPublicationAnchorUseCase } = makeReplica({ publishers: [publisher] });
        publishContent(publicationCatalog, { id: 'pub-dup', hash: 'facefeed' });

        const first = await createExternalPublicationAnchorUseCase.execute('pub-dup', 'bitcoin-op-return');
        const second = await createExternalPublicationAnchorUseCase.execute('pub-dup', 'bitcoin-op-return');
        assert(first.outcome === ExternalAnchorCreationOutcome.CREATED && second.outcome === ExternalAnchorCreationOutcome.CREATED,
            '28. anchoring the same publication twice on the same anchorType succeeds both times');
        assert(first.anchor.id !== second.anchor.id, '29. the two anchors are independent records, never deduplicated by this class');

        const known = anchorCatalog.findByPublicationId('pub-dup');
        assert(known.length === 2, '30. both independent anchors are cataloged — the catalog\'s own id-based dedup is the only place duplicates are ever collapsed, and neither of these duplicates');
    }
    console.log('✓ Section G: anchoring the same publication twice on the same anchorType coexists as two independent, equally cataloged PublicationAnchor records');

    console.log('\nAll ExternalAnchorCreationOrchestration tests passed.');
}

run().catch((error) => {
    console.error('ExternalAnchorCreationOrchestration.test.js FAILED:', error);
    process.exitCode = 1;
});
