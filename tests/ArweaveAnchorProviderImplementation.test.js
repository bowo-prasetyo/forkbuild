import { readFile } from 'node:fs/promises';

import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { ContentReference } from '../core/ContentReference.js';
import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { LocalPublicationAnchorCatalog } from '../application/LocalPublicationAnchorCatalog.js';
import { CreateExternalPublicationAnchorOrchestratorUseCase } from '../application/CreateExternalPublicationAnchorOrchestratorUseCase.js';
import { ExternalAnchorPublisherRegistry } from '../application/ExternalAnchorPublisherRegistry.js';
import { ExternalProofVerifierRegistry } from '../application/ExternalProofVerifierRegistry.js';
import { ExternalAnchorEvidenceViewRegistry } from '../application/ExternalAnchorEvidenceViewRegistry.js';
import { ExternalAnchorCreationOutcome } from '../application/ExternalAnchorCreationOutcome.js';
import { ExternalAnchorVerifier } from '../application/ExternalAnchorVerifier.js';
import { AnchorVerificationOutcome } from '../application/AnchorVerificationOutcome.js';
import { PublicationAnchorCreationCoordinator } from '../application/PublicationAnchorCreationCoordinator.js';
import { ProofVerifier } from '../anchoring/ProofVerifier.js';
import { ArweaveAnchorPublisher } from '../anchoring/ArweaveAnchorPublisher.js';
import { ArweaveTransactionDataProofVerifier } from '../anchoring/ArweaveTransactionDataProofVerifier.js';
import { ArweaveAnchorEvidenceView } from '../anchoring/ArweaveAnchorEvidenceView.js';
import { BitcoinAnchorPublisher } from '../anchoring/BitcoinAnchorPublisher.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.9.425 — Arweave Proof/Anchoring Provider Implementation.
//
// 0.9.424's own audit named PROOF_AND_ANCHORING's Arweave gap a pure
// PROVIDER_GAP — both real registries this role runs through, and the
// real UI method that reads one of them, already accept an "arweave" key
// with zero code change. This is the milestone that closes it: a real
// ArweaveAnchorPublisher (creation), a real ArweaveTransactionDataProofVerifier
// (verification), and a real ArweaveAnchorEvidenceView (presentation),
// plugged into the exact same seams Bitcoin's own adapters already use —
// no new registry, no new UI mechanism, no automatic cross-role coupling.
//
//   Section A: ArweaveAnchorPublisher unit behavior.
//   Section B: ArweaveTransactionDataProofVerifier unit behavior.
//   Section C: flagship — a shared fake Arweave gateway lets the real
//              publisher and the real verifier round-trip the identical
//              wire contract, exactly as tests/
//              ExternalAnchorCreationOrchestration.test.js's own flagship
//              does for Bitcoin.
//   Section D: full orchestration — CreateExternalPublicationAnchorOrchestratorUseCase
//              produces a real, cataloged PublicationAnchor an
//              independent CreateExternalAnchorVerifierUseCase reports
//              VALID for.
//   Section E: registry coexistence — Bitcoin's real publisher/verifier
//              and Arweave's real publisher/verifier coexist in the same
//              registry instances, and the real UI-facing
//              PublicationAnchorCreationCoordinator#availableAnchorTypes()
//              reports both.
//   Section F: ArweaveAnchorEvidenceView presentation behavior.
//   Section G: role independence — the anchored Arweave transaction's own
//              data is the contentHash itself, never a publication's
//              material; anchoring never reads or writes anything a
//              CONTENT-role Arweave class owns.
//   Section H: no automatic cross-role coupling — architectural
//              regression, confirmed by source sweep.
//   Section I: graceful degradation — no wallet configured reports
//              PUBLISH_UNAVAILABLE end to end, never a crash.

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

function publishContent(publicationCatalog, { id, hash }) {
    const publication = new DecentralizedPublication({
        id, contentKind: 'forkbuild.structure', contentReference: new ContentReference({ hash })
    });
    publicationCatalog.add(publication);
    return publication;
}

// A shared, deterministic fake Arweave network — a Map<txid, data> a fake
// signer/gateway POST writes into, and a fake gateway GET reads from.
// Mirrors tests/ExternalAnchorCreationOrchestration.test.js's own
// makeFakeBitcoinNetwork() technique on a different substrate.
function makeFakeArweaveNetwork() {
    const ledger = new Map();
    let nextId = 0;

    const signer = {
        async sign(material) {
            nextId += 1;
            const id = `FakeArTx${String(nextId).padStart(10, '0')}`;
            return { id, transaction: { format: 2, id, data: material } };
        }
    };

    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        if (options.method === 'POST' && parsed.pathname === '/tx') {
            const body = JSON.parse(options.body);
            ledger.set(body.id, body.data);
            return new Response('accepted', { status: 200 });
        }
        const match = parsed.pathname.match(/^\/([A-Za-z0-9_-]+)$/);
        if (match && ledger.has(match[1])) {
            return new Response(ledger.get(match[1]), { status: 200 });
        }
        return new Response('not found', { status: 404 });
    }

    return { ledger, signer, fetchImpl };
}

function makeReplica({ publishers = [] } = {}) {
    const publicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
    const anchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
    const identityProvider = makeIdentity('Alice');
    const { createExternalPublicationAnchorUseCase, publisherRegistry } =
        new CreateExternalPublicationAnchorOrchestratorUseCase().execute({
            publicationCatalog, anchorCatalog, identityProvider, publishers
        });
    return { publicationCatalog, anchorCatalog, identityProvider, createExternalPublicationAnchorUseCase, publisherRegistry };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — ArweaveAnchorPublisher unit behavior.
    // ---------------------------------------------------------------
    {
        await expectThrowsAsync(async () => new ArweaveAnchorPublisher({}), '1. a signer is required — constructing without one throws');

        const net = makeFakeArweaveNetwork();
        const publisher = new ArweaveAnchorPublisher({ signer: net.signer, fetchImpl: net.fetchImpl });
        assert(publisher.anchorType === 'arweave', '2. anchorType is exactly "arweave"');

        const result = await publisher.publish('deadbeef01');
        assert(result.published === true, '3. a healthy signer/gateway publishes successfully');
        assert(result.locator === `ar://${[...net.ledger.keys()][0]}`, '4. locator is an ar:// uri naming the produced transaction id');
        assert(result.proof && result.proof.txid === [...net.ledger.keys()][0], '5. proof carries exactly the produced txid, nothing else');
        assert(Object.keys(result.proof).length === 1, '6. proof carries no extraneous fields — { txid } only, mirroring anchoring/BitcoinOpReturnProofVerifier.js\'s own minimalism');

        await expectThrowsAsync(() => publisher.publish(''), '7. an empty contentHash throws — a caller contract violation');
        await expectThrowsAsync(() => publisher.publish(null), '8. a non-string contentHash throws');

        const throwingSigner = { sign: async () => { throw new Error('wallet locked'); } };
        const publisherWithThrowingSigner = new ArweaveAnchorPublisher({ signer: throwingSigner, fetchImpl: net.fetchImpl });
        const throwingResult = await publisherWithThrowingSigner.publish('cafef00d');
        assert(throwingResult.published === false && throwingResult.unavailable === true, '9. a throwing signer reports unavailable, never a rejection escaping publish()');
        assert(throwingResult.reason === 'wallet locked', '10. the signer\'s own rejection reason is preserved');

        const decliningGatewayFetch = async () => new Response('rejected', { status: 400 });
        const publisherWithDecliningGateway = new ArweaveAnchorPublisher({ signer: net.signer, fetchImpl: decliningGatewayFetch });
        const declinedResult = await publisherWithDecliningGateway.publish('c0ffee00');
        assert(declinedResult.published === false && declinedResult.unavailable === true, '11. a non-2xx gateway response reports unavailable');

        const throwingFetch = async () => { throw new Error('network unreachable'); };
        const publisherWithThrowingFetch = new ArweaveAnchorPublisher({ signer: net.signer, fetchImpl: throwingFetch });
        const fetchFailureResult = await publisherWithThrowingFetch.publish('c0ffee01');
        assert(fetchFailureResult.published === false && fetchFailureResult.unavailable === true, '12. a genuine transport failure reports unavailable, never an uncaught rejection');

        const malformedIdSigner = { sign: async () => ({ id: '', transaction: {} }) };
        const publisherWithMalformedSigner = new ArweaveAnchorPublisher({ signer: malformedIdSigner, fetchImpl: net.fetchImpl });
        await expectThrowsAsync(() => publisherWithMalformedSigner.publish('c0ffee02'), '13. a signer resolving with no valid id throws — a contract violation, never a degraded outcome');

        console.log('✓ Section A: ArweaveAnchorPublisher publishes real evidence on success, and honestly reports unavailable — never a crash — for every signer/gateway failure mode');
    }

    // ---------------------------------------------------------------
    // Section B — ArweaveTransactionDataProofVerifier unit behavior.
    // ---------------------------------------------------------------
    {
        const net = makeFakeArweaveNetwork();
        net.ledger.set('KnownTx0000000001', 'aabbccdd');
        const verifier = new ArweaveTransactionDataProofVerifier({ fetchImpl: net.fetchImpl });
        assert(verifier instanceof ProofVerifier, '14. ArweaveTransactionDataProofVerifier is a real ProofVerifier');
        assert(verifier.anchorType === 'arweave', '15. anchorType is exactly "arweave" — matching the publisher\'s own');

        const valid = await verifier.verify({ txid: 'KnownTx0000000001' }, { contentHash: 'aabbccdd' });
        assert(valid.valid === true, '16. a transaction whose own data matches contentHash verifies VALID');

        const mismatch = await verifier.verify({ txid: 'KnownTx0000000001' }, { contentHash: 'ffffffff' });
        assert(mismatch.valid === false && !mismatch.unavailable, '17. a transaction whose data does NOT match contentHash is a DEFINITE rejection, never "unavailable"');

        const notFound = await verifier.verify({ txid: 'NoSuchTransaction00' }, { contentHash: 'aabbccdd' });
        assert(notFound.valid === false && notFound.unavailable === true, '18. a transaction the gateway does not have reports unavailable, never a definite rejection — it may simply not have propagated yet');

        const throwingFetchVerifier = new ArweaveTransactionDataProofVerifier({ fetchImpl: async () => { throw new Error('timeout'); } });
        const transportFailure = await throwingFetchVerifier.verify({ txid: 'KnownTx0000000001' }, { contentHash: 'aabbccdd' });
        assert(transportFailure.valid === false && transportFailure.unavailable === true, '19. a genuine transport failure reports unavailable, never throws out of verify()');

        const malformedProof = await verifier.verify({}, { contentHash: 'aabbccdd' });
        assert(malformedProof.valid === false && !malformedProof.unavailable, '20. a missing txid is a definite rejection — not a network condition');

        const noContentHash = await verifier.verify({ txid: 'KnownTx0000000001' }, {});
        assert(noContentHash.valid === false, '21. verifying with no contentHash supplied never reports valid');

        console.log('✓ Section B: ArweaveTransactionDataProofVerifier distinguishes a definite mismatch from "cannot presently tell" exactly as anchoring/BitcoinOpReturnProofVerifier.js already does for Bitcoin');
    }

    // ---------------------------------------------------------------
    // Section C — flagship: the same fake network round-trips the real
    // publisher's own output through the real verifier.
    // ---------------------------------------------------------------
    {
        const net = makeFakeArweaveNetwork();
        const publisher = new ArweaveAnchorPublisher({ signer: net.signer, fetchImpl: net.fetchImpl });
        const verifier = new ArweaveTransactionDataProofVerifier({ fetchImpl: net.fetchImpl });

        const contentHash = 'roundtrip-hash-01';
        const evidence = await publisher.publish(contentHash);
        assert(evidence.published === true, '22. the publisher successfully publishes into the shared fake network');

        const verified = await verifier.verify(evidence.proof, { contentHash });
        assert(verified.valid === true, '23. FLAGSHIP — the SAME fake network the publisher wrote into is read back by the verifier, and the proof it produced verifies VALID against the original contentHash');

        const verifiedAgainstWrongHash = await verifier.verify(evidence.proof, { contentHash: 'a-different-hash' });
        assert(verifiedAgainstWrongHash.valid === false, '24. the identical proof does NOT verify against a different contentHash — the check is genuinely bound to the value, not merely to the transaction existing');

        console.log('✓ Section C: FLAGSHIP — publisher and verifier round-trip the identical wire contract through one shared fake Arweave network');
    }

    // ---------------------------------------------------------------
    // Section D — full orchestration: a real, cataloged PublicationAnchor,
    // independently verified.
    // ---------------------------------------------------------------
    let sharedAnchorJson, sharedContentHash, sharedNet;
    {
        const net = makeFakeArweaveNetwork();
        const publisher = new ArweaveAnchorPublisher({ signer: net.signer, fetchImpl: net.fetchImpl });
        const { publicationCatalog, createExternalPublicationAnchorUseCase } = makeReplica({ publishers: [publisher] });

        const contentHash = 'orchestrated-content-hash';
        publishContent(publicationCatalog, { id: 'pub-arweave-flagship', hash: contentHash });

        const result = await createExternalPublicationAnchorUseCase.execute('pub-arweave-flagship', 'arweave');
        assert(result.outcome === ExternalAnchorCreationOutcome.CREATED, '25. a healthy Arweave publisher produces the CREATED outcome via the SAME orchestration Bitcoin already uses');
        assert(result.anchor instanceof PublicationAnchor, '26. the CREATED outcome carries a real PublicationAnchor');
        assert(result.anchor.anchorType === 'arweave', '27. the created anchor carries the "arweave" anchorType');
        assert(result.anchor.contentHash === contentHash, '28. the created anchor binds to the publication\'s own contentHash');

        const bobAuthVerifier = new LocalAuthorizationVerifier();
        const bobAnchorVerifier = new ExternalAnchorVerifier(bobAuthVerifier);
        const bobProofVerifier = new ArweaveTransactionDataProofVerifier({ fetchImpl: net.fetchImpl });

        const anchorJson = result.anchor.toJSON();
        const verification = await bobAnchorVerifier.verify(anchorJson, { expectedContentHash: contentHash, proofVerifier: bobProofVerifier });
        assert(verification.outcome === AnchorVerificationOutcome.VALID, '29. an independent Bob, holding none of Alice\'s local state, verifies the orchestrated Arweave anchor VALID using only its own public locator/proof');

        sharedAnchorJson = anchorJson;
        sharedContentHash = contentHash;
        sharedNet = net;
    }
    console.log('✓ Section D: full orchestration — a real, signed, cataloged Arweave PublicationAnchor, independently verified VALID');

    {
        // A tampered contentHash (a different publication's claim reusing
        // the same transaction) must NOT verify — proving the check is
        // genuinely bound to what the anchor itself claims, never merely
        // to "some transaction exists."
        const bobAuthVerifier = new LocalAuthorizationVerifier();
        const bobAnchorVerifier = new ExternalAnchorVerifier(bobAuthVerifier);
        const bobProofVerifier = new ArweaveTransactionDataProofVerifier({ fetchImpl: sharedNet.fetchImpl });
        const mismatched = await bobAnchorVerifier.verify(sharedAnchorJson, { expectedContentHash: 'not-the-real-hash', proofVerifier: bobProofVerifier });
        assert(mismatched.outcome === AnchorVerificationOutcome.CONTENT_MISMATCH, '30. asking to verify the same anchor against a DIFFERENT expected contentHash reports CONTENT_MISMATCH, never VALID');
        assert(sharedContentHash.length > 0, '31. sanity: the original contentHash remains well-formed');
    }
    console.log('✓ Section D (cross-check): the orchestrated anchor is bound to its own specific contentHash, not merely to a transaction existing');

    // ---------------------------------------------------------------
    // Section E — registry coexistence: Bitcoin and Arweave, side by
    // side, in the same registries, both discoverable by the same
    // real UI-facing coordinator method.
    // ---------------------------------------------------------------
    {
        const bitcoinBroadcaster = { async broadcast() { return { broadcast: false, unavailable: true, reason: 'no wallet' }; } };
        const bitcoinPublisher = new BitcoinAnchorPublisher({ network: 'mainnet', broadcaster: bitcoinBroadcaster });
        const arweaveNet = makeFakeArweaveNetwork();
        const arweavePublisher = new ArweaveAnchorPublisher({ signer: arweaveNet.signer, fetchImpl: arweaveNet.fetchImpl });

        const publisherRegistry = new ExternalAnchorPublisherRegistry();
        publisherRegistry.register(bitcoinPublisher);
        publisherRegistry.register(arweavePublisher);
        assert(publisherRegistry.get('bitcoin-op-return') === bitcoinPublisher && publisherRegistry.get('arweave') === arweavePublisher,
            '32. Bitcoin\'s real publisher and Arweave\'s real publisher coexist in one registry instance, keyed independently, neither overwriting the other');

        const coordinator = new PublicationAnchorCreationCoordinator({ execute: async () => { throw new Error('never called'); } }, publisherRegistry);
        const available = coordinator.availableAnchorTypes();
        assert(available.includes('bitcoin-op-return') && available.includes('arweave') && available.length === 2,
            '33. the real UI-facing availableAnchorTypes() reports BOTH providers — exactly the method ui/views/DecentralizedPublicationsView.js\'s own v-for already renders, with zero UI code change');

        const verifierRegistry = new ExternalProofVerifierRegistry();
        verifierRegistry.register(new ArweaveTransactionDataProofVerifier({ fetchImpl: arweaveNet.fetchImpl }));
        assert(verifierRegistry.anchorTypes.includes('arweave'), '34. the proof verifier registry accepts the real Arweave verifier under the same "arweave" key the publisher registry already uses');

        const evidenceViewRegistry = new ExternalAnchorEvidenceViewRegistry();
        evidenceViewRegistry.register(new ArweaveAnchorEvidenceView());
        assert(evidenceViewRegistry.get('arweave') instanceof ArweaveAnchorEvidenceView, '35. the evidence view registry accepts the real Arweave presentation adapter under the same key');

        console.log('✓ Section E: Bitcoin\'s and Arweave\'s real providers coexist in every one of the three existing registries, and the real UI method reports both');
    }

    // ---------------------------------------------------------------
    // Section F — ArweaveAnchorEvidenceView presentation behavior.
    // ---------------------------------------------------------------
    {
        const view = new ArweaveAnchorEvidenceView();
        assert(view.anchorType === 'arweave', '36. anchorType matches the publisher/verifier');

        const described = view.describe({ proof: { txid: 'SomeRealLookingTxId0123' } });
        assert(described.summary === 'Arweave', '37. summary names the substrate');
        assert(described.fields.some((f) => f.value === 'SomeRealLookingTxId0123'), '38. the transaction id is presented as a field');
        assert(described.externalLocator && described.externalLocator.url.includes('SomeRealLookingTxId0123'), '39. a well-formed txid produces a real external locator');

        const withoutProof = view.describe({});
        assert(withoutProof.externalLocator === null, '40. a missing proof degrades to no external locator — never a fabricated link');
        assert(withoutProof.fields.some((f) => f.value === 'not available'), '41. a missing proof is described honestly as "not available", never guessed at');

        console.log('✓ Section F: ArweaveAnchorEvidenceView presents real evidence honestly and degrades a missing/malformed proof without guessing');
    }

    // ---------------------------------------------------------------
    // Section G — role independence: the anchored transaction's own data
    // is the contentHash itself, never a publication's material.
    // ---------------------------------------------------------------
    {
        const net = makeFakeArweaveNetwork();
        const publisher = new ArweaveAnchorPublisher({ signer: net.signer, fetchImpl: net.fetchImpl });
        const publicationMaterial = JSON.stringify({ hello: 'this is real publication content, not a hash' });
        const contentHash = 'a-completely-different-short-hash';

        await publisher.publish(contentHash);
        const [storedData] = net.ledger.values();
        assert(storedData === contentHash, '42. the Arweave transaction this class produces carries the contentHash as its own data');
        assert(storedData !== publicationMaterial, '43. it never carries a publication\'s actual material — a CONTENT-role Arweave transaction and a PROOF-role Arweave transaction remain two distinct facts even on the identical substrate');

        console.log('✓ Section G: an Arweave anchor commits to a hash, never to a document — role independence holds even though Content and Proof both use Arweave');
    }

    // ---------------------------------------------------------------
    // Section H — no automatic cross-role coupling (architectural
    // regression, confirmed by source sweep, not merely by absence of a
    // test that would notice).
    // ---------------------------------------------------------------
    {
        const publisherSource = await readFile(new URL('../anchoring/ArweaveAnchorPublisher.js', import.meta.url), 'utf8');
        const verifierSource = await readFile(new URL('../anchoring/ArweaveTransactionDataProofVerifier.js', import.meta.url), 'utf8');
        const codeOnly = (text) => text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!/ArweavePublicationMaterialUploader|PublicationDistribution|ArweaveContentStore|ArweaveWorldEncounterMaterialResolver/.test(codeOnly(publisherSource)),
            '44. ArweaveAnchorPublisher.js imports nothing from Arweave\'s own CONTENT-role classes or the Publication distribution pipeline');
        assert(!/ArweavePublicationMaterialUploader|PublicationDistribution|ArweaveContentStore|ArweaveWorldEncounterMaterialResolver/.test(codeOnly(verifierSource)),
            '45. ArweaveTransactionDataProofVerifier.js imports nothing from those classes either — verification never triggers or depends on a content upload');

        const orchestratorSource = await readFile(new URL('../application/CreateExternalPublicationAnchorOrchestratorUseCase.js', import.meta.url), 'utf8');
        assert(!/ArweaveAnchorPublisher|ArweaveTransactionDataProofVerifier/.test(orchestratorSource),
            '46. the generic orchestrator still names no concrete Arweave (or Bitcoin) class of its own — publishers remain caller-supplied plugins, never hard-coded');

        let publishCalls = 0;
        const spyPublisher = {
            anchorType: 'arweave',
            async publish(contentHash) { publishCalls += 1; return { published: true, locator: `ar://${contentHash}`, proof: { txid: 'Tx0000000000000000001' } }; }
        };
        const { publicationCatalog, createExternalPublicationAnchorUseCase } = makeReplica({ publishers: [spyPublisher] });
        publishContent(publicationCatalog, { id: 'pub-no-fanout', hash: 'fanout-check-hash' });
        await createExternalPublicationAnchorUseCase.execute('pub-no-fanout', 'arweave');
        assert(publishCalls === 1, '47. creating exactly one explicit Arweave anchor triggers exactly one publish() call — no automatic second anchor, no automatic retry, no fan-out to any other anchorType');

        console.log('✓ Section H: no automatic cross-role coupling — confirmed by source sweep and by observing exactly one publish() per explicit creation call');
    }

    // ---------------------------------------------------------------
    // Section I — graceful degradation: no wallet configured reports
    // PUBLISH_UNAVAILABLE end to end, mirroring ui/main.js's own honest
    // "no Bitcoin wallet configured yet" fallback for Arweave.
    // ---------------------------------------------------------------
    {
        const fallbackSigner = { async sign() { throw new Error('This device has no Arweave wallet/signing capability configured yet.'); } };
        const publisher = new ArweaveAnchorPublisher({ signer: fallbackSigner, fetchImpl: async () => new Response('unused', { status: 200 }) });
        const { publicationCatalog, anchorCatalog, createExternalPublicationAnchorUseCase } = makeReplica({ publishers: [publisher] });
        publishContent(publicationCatalog, { id: 'pub-no-wallet', hash: 'no-wallet-hash' });

        const result = await createExternalPublicationAnchorUseCase.execute('pub-no-wallet', 'arweave');
        assert(result.outcome === ExternalAnchorCreationOutcome.PUBLISH_UNAVAILABLE, '48. with no wallet configured, the full orchestration honestly reports PUBLISH_UNAVAILABLE — never a crash, never a silently created anchor');
        assert(result.reason.includes('no Arweave wallet'), '49. the honest reason names the real cause');
        assert(anchorCatalog.findByPublicationId('pub-no-wallet').length === 0, '50. nothing is ever cataloged for an anchor that was never actually published');

        console.log('✓ Section I: with no wallet connected, "Create Arweave Anchor" still exists and still runs end to end, honestly reporting PUBLISH_UNAVAILABLE rather than being hidden or crashing');
    }

    console.log('\nAll ArweaveAnchorProviderImplementation tests passed.');
}

run().catch((error) => {
    console.error('ArweaveAnchorProviderImplementation.test.js FAILED:', error);
    process.exitCode = 1;
});
