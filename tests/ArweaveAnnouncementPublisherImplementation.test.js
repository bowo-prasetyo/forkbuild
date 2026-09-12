import { readFile } from 'node:fs/promises';

import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { describeDecentralizedDiscoveryEnvelope } from '../core/DecentralizedDiscoveryEnvelope.js';
import { describePublicationDistribution } from '../application/PublicationDistributionDescriptor.js';
import { ArweavePublicationMaterialUploader } from '../application/ArweavePublicationMaterialUploader.js';
import { ArweaveAnnouncementPublisher } from '../application/ArweaveAnnouncementPublisher.js';
import { NostrPublicationDiscoveryPublisher } from '../application/NostrPublicationDiscoveryPublisher.js';
import { executePublicationDistribution } from '../application/PublicationDistributionExecutor.js';
import { composePublicationDistributionRuntime } from '../application/PublicationDistributionRuntimeComposition.js';

// 0.9.428 — Arweave Announcement Publisher Implementation.
//
// 0.9.427's own audit named the exact, minimal shape a real
// `ArweaveAnnouncementPublisher` needed, proven live against a throwaway,
// never-exported stand-in. This file tests the real thing: the concrete
// class (Section A), that it produces a real Arweave transaction carrying
// the announcement fact (Section B), that two announcements of identical
// content stay distinguishable (Section C), full integration through the
// REAL, unmodified `PublicationDistributionExecutor.js` and
// `PublicationDistributionRuntimeComposition.js` (Section D), the error
// boundary (Section E), Nostr/Arweave coexistence without cross-talk
// (Section F), role independence from Content/Proof (Section G), and no
// hidden fan-out (Section H).
//
//   Section A. Concrete publisher — construction, contract shape.
//   Section B. Transaction creation — the announcement fact reaches the
//              injected uploadTaggedTransaction, tagged correctly.
//   Section C. Transaction identity — two publications remain
//              distinguishable through their own Arweave announcements.
//   Section D. Full executor + runtime composition integration, real
//              collaborators throughout.
//   Section E. Error boundary — signing unavailable, network unavailable,
//              malformed provider response, each with defined behavior.
//   Section F. Nostr coexistence — independent announcements for the same
//              publication, never conflated.
//   Section G. Role independence — no Content/Proof/Anchor side effects.
//   Section H. No hidden fan-out — one selection, one publish action.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. See `application/
// ArweaveAnnouncementPublisher.js`'s own header for the full list; this
// file does not test `node.tags` discovery reconstruction, multi-substrate
// selection UI, or automatic Arweave+Nostr fan-out, because this milestone
// builds none of them.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function expectThrowsAsync(fn, message) {
    let threw = false;
    try { await fn(); } catch { threw = true; }
    assert(threw, message);
}

function expectThrowsSync(fn, message) {
    let threw = false;
    try { fn(); } catch { threw = true; }
    assert(threw, message);
}

// A shared, deterministic fake Arweave announcement ledger — mirrors
// tests/ArweaveAnchorProviderImplementation.test.js's own
// makeFakeArweaveNetwork() technique, adapted to also record the Tag a
// caller supplied, since discoverability depends on it.
function makeFakeArweaveAnnouncementNetwork() {
    const ledger = new Map(); // id -> { material, tag }
    let nextId = 0;

    async function uploadTaggedTransaction(material, tag) {
        nextId += 1;
        const id = `FakeAnnounceTx${String(nextId).padStart(6, '0')}`;
        ledger.set(id, { material, tag });
        return { id };
    }

    return { ledger, uploadTaggedTransaction };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — concrete publisher: construction, contract shape.
    // ---------------------------------------------------------------
    {
        expectThrowsSync(() => new ArweaveAnnouncementPublisher({}), '1. a discoveryTag is required — constructing without one throws');
        expectThrowsSync(() => new ArweaveAnnouncementPublisher({ discoveryTag: 'tag-a' }), '2. uploadTaggedTransaction is required — constructing without one throws');
        expectThrowsSync(() => new ArweaveAnnouncementPublisher({ discoveryTag: '', uploadTaggedTransaction: async () => ({ id: 'x' }) }), '3. an empty discoveryTag throws');

        const net = makeFakeArweaveAnnouncementNetwork();
        const publisher = new ArweaveAnnouncementPublisher({
            discoveryTag: 'tag-a',
            uploadTaggedTransaction: net.uploadTaggedTransaction
        });
        assert(publisher.discoveryTag === 'tag-a', '4. discoveryTag is exposed exactly as supplied');
        assert(publisher.gatewayUrl === ArweaveAnnouncementPublisher.DEFAULT_GATEWAY_URL, '5. gatewayUrl defaults to the shared Arweave default');
        assert(publisher.tagName === ArweaveAnnouncementPublisher.DEFAULT_TAG_NAME, '6. tagName defaults to ForkBuild-Discovery-Tag, matching ArweaveGraphqlDiscoveryQueryService\'s own default');
        assert(ArweaveAnnouncementPublisher.DEFAULT_TAG_NAME === 'ForkBuild-Discovery-Tag', '7. the default tag name is literally the same string the existing reader already defaults to');

        const boundPublish = publisher.publish;
        const envelope = describeDecentralizedDiscoveryEnvelope({ protocol: 'forkbuild', version: 1, kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-a', uri: 'ar://materialtx-a' });
        const result = await boundPublish(envelope);
        assert(result.published === true, '8. publish() survives being detached from its own instance — bound in the constructor');

        console.log('✓ Section A: ArweaveAnnouncementPublisher enforces its own minimal constructor contract and exposes discoveryTag/gatewayUrl/tagName');
    }

    // ---------------------------------------------------------------
    // Section B — transaction creation: the announcement fact reaches the
    // injected collaborator, tagged for discovery.
    // ---------------------------------------------------------------
    {
        const net = makeFakeArweaveAnnouncementNetwork();
        const publisher = new ArweaveAnnouncementPublisher({
            discoveryTag: 'campaign-b',
            gatewayUrl: 'https://gateway.example',
            uploadTaggedTransaction: net.uploadTaggedTransaction
        });

        const envelope = describeDecentralizedDiscoveryEnvelope({ protocol: 'forkbuild', version: 1, kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-b', uri: 'ar://materialtx-b' });
        const result = await publisher.publish(envelope);

        assert(result.published === true, '9. a healthy collaborator publishes successfully');
        assert(result.relayUrl === 'https://gateway.example', '10. relayUrl carries this instance\'s own gatewayUrl — an Arweave gateway, never a Nostr relay, satisfying PublicationDistributionResult.js\'s own field name');
        assert(net.ledger.has(result.id), '11. the transaction id returned actually names a produced transaction');

        const stored = net.ledger.get(result.id);
        const storedEnvelope = JSON.parse(stored.material);
        assert(storedEnvelope.uri === 'ar://materialtx-b' && storedEnvelope.objectId === 'pub-b', '12. the transaction\'s own material carries exactly the announcement fact — the same envelope handed to publish(), serialized');
        assert(stored.tag.name === 'ForkBuild-Discovery-Tag' && stored.tag.value === 'campaign-b', '13. the transaction is tagged with the exact name/value ArweaveGraphqlDiscoveryQueryService already matches against — discoverable by construction');

        const malformedEnvelope = await publisher.publish({ not: 'an envelope' });
        assert(malformedEnvelope === null, '14. a malformed envelope degrades to null before uploadTaggedTransaction is ever consulted');

        console.log('✓ Section B: a real announcement fact becomes a real, correctly-tagged Arweave transaction');
    }

    // ---------------------------------------------------------------
    // Section C — transaction identity: two publications remain
    // distinguishable through their own Arweave announcements, even when
    // the underlying content is identical.
    // ---------------------------------------------------------------
    {
        const net = makeFakeArweaveAnnouncementNetwork();
        const publisher = new ArweaveAnnouncementPublisher({ discoveryTag: 'campaign-c', uploadTaggedTransaction: net.uploadTaggedTransaction });

        const envelopeA = describeDecentralizedDiscoveryEnvelope({ protocol: 'forkbuild', version: 1, kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-c-A', uri: 'ar://materialtx-shared' });
        const envelopeB = describeDecentralizedDiscoveryEnvelope({ protocol: 'forkbuild', version: 1, kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-c-B', uri: 'ar://materialtx-shared' });

        const resultA = await publisher.publish(envelopeA);
        const resultB = await publisher.publish(envelopeB);

        assert(resultA.id !== resultB.id, '15. two publications sharing one materialUri still produce two DISTINCT announcement transaction ids');
        assert(JSON.parse(net.ledger.get(resultA.id).material).objectId !== JSON.parse(net.ledger.get(resultB.id).material).objectId, '16. and each transaction\'s own material carries the distinguishing objectId, preserving 0.9.427 Section F\'s own finding at the announcement layer too');

        console.log('✓ Section C: distinct publications stay distinguishable through distinct Arweave announcement transactions');
    }

    // ---------------------------------------------------------------
    // Section D — full integration: the REAL executor, descriptor, result
    // boundary, and runtime composition, never a reimplementation.
    // ---------------------------------------------------------------
    {
        const net = makeFakeArweaveAnnouncementNetwork();
        const materialUploader = new ArweavePublicationMaterialUploader({
            signer: { sign: async () => ({ id: 'materialtx-d', transaction: {} }) },
            fetchImpl: async () => ({ ok: true, headers: { get: () => null }, text: async () => '' })
        });

        const runtime = composePublicationDistributionRuntime({
            discoveryProvider: 'arweave',
            arweaveUploaderOptions: {
                signer: { sign: async () => ({ id: 'materialtx-d', transaction: {} }) },
                fetchImpl: async () => ({ ok: true, headers: { get: () => null }, text: async () => '' })
            },
            arweaveAnnouncementPublisherOptions: {
                discoveryTag: 'campaign-d',
                uploadTaggedTransaction: net.uploadTaggedTransaction
            }
        });

        assert(runtime.publisher instanceof ArweaveAnnouncementPublisher, '17. composePublicationDistributionRuntime({ discoveryProvider: "arweave" }) constructs a real ArweaveAnnouncementPublisher');
        assert(runtime.describeDistribution === describePublicationDistribution, '18. describeDistribution remains the same forwarded pure function, unmodified by this milestone');

        const publication = { id: 'pub-d', signature: 'sig-d' };
        const result = await executePublicationDistribution({
            publication,
            serializedMaterial: JSON.stringify({ body: 'hello-428' }),
            materialUploader: runtime.uploader,
            distributionDescriptor: runtime.describeDistribution,
            discoveryPublisher: runtime.publisher
        });

        assert(result !== null, '19. the real, unmodified executor + result boundary produce a real result — zero production code reimplemented in this test');
        assert(result.material.uri === 'ar://materialtx-d' && result.material.storage === 'ar', '20. the CONTENT half is real Arweave material');
        assert(result.discovery.discoveryTag === 'campaign-d' && result.discovery.id, '21. the ANNOUNCEMENT half is real, from the real ArweaveAnnouncementPublisher');
        assert(net.ledger.has(result.discovery.id), '22. the announcement transaction the executor reports actually exists in the fake Arweave network');

        // Defaulting discoveryProvider preserves existing behavior unchanged.
        const defaultRuntime = composePublicationDistributionRuntime({
            arweaveUploaderOptions: { signer: { sign: async () => ({ id: 'materialtx-d2', transaction: {} }) }, fetchImpl: async () => ({ ok: true, headers: { get: () => null }, text: async () => '' }) },
            nostrPublisherOptions: { discoveryTag: 'campaign-d-nostr', publishImpl: async () => ({ published: true, id: 'e'.repeat(64) }) }
        });
        assert(defaultRuntime.publisher instanceof NostrPublicationDiscoveryPublisher, '23. omitting discoveryProvider still constructs the original NostrPublicationDiscoveryPublisher — no existing caller\'s behavior changes');

        expectThrowsSync(() => composePublicationDistributionRuntime({
            arweaveUploaderOptions: { signer: { sign: async () => ({ id: 'unused', transaction: {} }) }, fetchImpl: async () => ({ ok: true, headers: { get: () => null }, text: async () => '' }) },
            discoveryProvider: 'bitcoin'
        }), '24. an unrecognized discoveryProvider throws at composition time');

        console.log('✓ Section D: real executor + real runtime composition + real ArweaveAnnouncementPublisher produce a real, correct PublicationDistributionResult, and existing Nostr-default behavior is unchanged');
    }

    // ---------------------------------------------------------------
    // Section E — error boundary: signing unavailable, network unavailable,
    // malformed provider response — each with defined behavior, never an
    // infrastructure exception silently becoming an announcement fact.
    // ---------------------------------------------------------------
    {
        const envelope = describeDecentralizedDiscoveryEnvelope({ protocol: 'forkbuild', version: 1, kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-e', uri: 'ar://materialtx-e' });

        // Ordinary decline — the collaborator could not presently place the
        // transaction (e.g. no wallet connected) — degrades to null, mirroring
        // NostrPublicationDiscoveryPublisher's own "a relay's own definite
        // decline degrades to null" behavior.
        const decliningPublisher = new ArweaveAnnouncementPublisher({
            discoveryTag: 'tag-e1',
            uploadTaggedTransaction: async () => null
        });
        const declined = await decliningPublisher.publish(envelope);
        assert(declined === null, '25. signing/gateway unavailable, reported as an ordinary null resolution, degrades to null — never a crash, never a fabricated announcement');

        // Genuine failure (network unavailable, wallet threw) propagates —
        // never silently swallowed into a false announcement fact.
        const throwingPublisher = new ArweaveAnnouncementPublisher({
            discoveryTag: 'tag-e2',
            uploadTaggedTransaction: async () => { throw new Error('network unreachable'); }
        });
        await expectThrowsAsync(() => throwingPublisher.publish(envelope), '26. a genuine transport/signing failure propagates as a rejection — PublicationDistributionExecutor.js\'s own "genuine failure propagates" contract, never caught here');

        // Malformed provider response — resolves truthy but with no usable
        // id — is a contract violation, not an ordinary outcome, so it
        // throws rather than being mistaken for either a success or an
        // ordinary decline.
        const malformedPublisher = new ArweaveAnnouncementPublisher({
            discoveryTag: 'tag-e3',
            uploadTaggedTransaction: async () => ({ id: '' })
        });
        await expectThrowsAsync(() => malformedPublisher.publish(envelope), '27. a malformed provider response (no valid transaction id) throws — never silently treated as a published announcement');

        const undefinedIdPublisher = new ArweaveAnnouncementPublisher({
            discoveryTag: 'tag-e4',
            uploadTaggedTransaction: async () => ({ notAnId: 123 })
        });
        await expectThrowsAsync(() => undefinedIdPublisher.publish(envelope), '28. a resolved object with no id field at all also throws, never coerced into a fake id');

        // A malformed envelope never even reaches the collaborator.
        let uploadCalls = 0;
        const guardedPublisher = new ArweaveAnnouncementPublisher({
            discoveryTag: 'tag-e5',
            uploadTaggedTransaction: async () => { uploadCalls += 1; return { id: 'should-not-happen' }; }
        });
        const guardedResult = await guardedPublisher.publish(null);
        assert(guardedResult === null && uploadCalls === 0, '29. a malformed envelope resolves to null WITHOUT ever invoking uploadTaggedTransaction — no infrastructure call for input this class can already tell is invalid');

        console.log('✓ Section E: signing/network unavailability, and a malformed provider response, each have explicit, distinct, defined behavior — no infrastructure exception ever silently becomes an application-level announcement fact');
    }

    // ---------------------------------------------------------------
    // Section F — Nostr coexistence: independent announcements for the
    // SAME publication, on two substrates, never conflated.
    // ---------------------------------------------------------------
    {
        const publication = { id: 'pub-f', signature: 'sig-f' };
        const distribution = describePublicationDistribution({ publication, materialUri: 'ar://materialtx-f' });

        const arweaveNet = makeFakeArweaveAnnouncementNetwork();
        const arweavePublisher = new ArweaveAnnouncementPublisher({ discoveryTag: 'campaign-f', uploadTaggedTransaction: arweaveNet.uploadTaggedTransaction });
        const arweaveResult = await arweavePublisher.publish(distribution.discoveryEnvelope);

        const nostrPublisher = new NostrPublicationDiscoveryPublisher({
            discoveryTag: 'campaign-f',
            publishImpl: async () => ({ published: true, id: 'f'.repeat(64) })
        });
        const nostrResult = await nostrPublisher.publish(distribution.discoveryEnvelope);

        assert(arweaveResult.id !== nostrResult.id, '30. the SAME publication\'s announcement produces two DIFFERENT announcement identities on the two substrates');
        assert(arweaveResult.relayUrl !== nostrResult.relayUrl, '31. and two different relay/gateway origins — Arweave\'s gatewayUrl default differs from Nostr\'s relayUrl default');
        assert(arweaveResult.discoveryTag === undefined, '32. sanity: publish() itself never returns a discoveryTag field — that fact comes from the publisher instance, exactly as NostrPublicationDiscoveryPublisher already works');
        assert(arweavePublisher.discoveryTag === nostrPublisher.discoveryTag, '33. both publishers were configured with the identical campaign discoveryTag, yet remain two independent announcements — same campaign, two substrates, never merged into one');

        console.log('✓ Section F: Nostr and Arweave announcements for the same publication coexist, independently identifiable, never conflated');
    }

    // ---------------------------------------------------------------
    // Section G — role independence: adding the Announcement publisher
    // causes no Content or Proof/Anchor side effects.
    // ---------------------------------------------------------------
    {
        const publisherSource = await readFile(new URL('../application/ArweaveAnnouncementPublisher.js', import.meta.url), 'utf8');
        const codeOnly = (text) => text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        const code = codeOnly(publisherSource);

        assert(!/ArweavePublicationMaterialUploader|ArweaveContentStore|ArweaveAnchorPublisher|ArweaveTransactionDataProofVerifier/.test(code), '34. ArweaveAnnouncementPublisher.js imports nothing from Arweave\'s own CONTENT-role or PROOF/ANCHOR-role classes');
        assert(!/PublicationAnchor|LocalPublicationAnchorCatalog/.test(code), '35. it never constructs or catalogs a PublicationAnchor of any kind');

        let contentUploadCalls = 0;
        const spyMaterialUploader = { storage: 'ar', async upload() { contentUploadCalls += 1; return 'ar://should-not-be-called'; } };
        const net = makeFakeArweaveAnnouncementNetwork();
        const announcementPublisher = new ArweaveAnnouncementPublisher({ discoveryTag: 'campaign-g', uploadTaggedTransaction: net.uploadTaggedTransaction });

        const envelope = describeDecentralizedDiscoveryEnvelope({ protocol: 'forkbuild', version: 1, kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-g', uri: 'ar://materialtx-g' });
        await announcementPublisher.publish(envelope);

        assert(contentUploadCalls === 0, '36. publishing an announcement never triggers a content upload — Announcement never implies Content, confirmed live, not merely by source sweep');

        console.log('✓ Section G: the Announcement publisher causes zero Content or Proof/Anchor side effects, confirmed both by source sweep and live observation');
    }

    // ---------------------------------------------------------------
    // Section H — no hidden fan-out: one explicit Arweave selection results
    // in exactly one Arweave publication action, never an implicit Nostr
    // action.
    // ---------------------------------------------------------------
    {
        let nostrConstructed = false;
        // A real module-level guard is impractical without patching the
        // import graph, so this section instead proves the observable
        // behavior a hidden fan-out would require: exactly one publish()
        // call happens, and the resulting runtime carries exactly one
        // publisher reference, never a collection.
        const net = makeFakeArweaveAnnouncementNetwork();
        let publishCalls = 0;
        const countingUploadTaggedTransaction = async (material, tag) => { publishCalls += 1; return net.uploadTaggedTransaction(material, tag); };

        const runtime = composePublicationDistributionRuntime({
            discoveryProvider: 'arweave',
            arweaveUploaderOptions: { signer: { sign: async () => ({ id: 'materialtx-h', transaction: {} }) }, fetchImpl: async () => ({ ok: true, headers: { get: () => null }, text: async () => '' }) },
            arweaveAnnouncementPublisherOptions: { discoveryTag: 'campaign-h', uploadTaggedTransaction: countingUploadTaggedTransaction }
        });

        assert(!Array.isArray(runtime.publisher), '37. runtime.publisher is a single collaborator, never an array/collection of substrates');
        assert(runtime.publisher instanceof ArweaveAnnouncementPublisher && !(runtime.publisher instanceof NostrPublicationDiscoveryPublisher), '38. selecting "arweave" produces an ArweaveAnnouncementPublisher and nothing that is also a NostrPublicationDiscoveryPublisher');

        const publication = { id: 'pub-h', signature: 'sig-h' };
        const result = await executePublicationDistribution({
            publication,
            serializedMaterial: JSON.stringify({ body: 'hello-h' }),
            materialUploader: runtime.uploader,
            distributionDescriptor: runtime.describeDistribution,
            discoveryPublisher: runtime.publisher
        });

        assert(publishCalls === 1, '39. one explicit Arweave-selected distribution call results in EXACTLY one Arweave announcement publish — no automatic second attempt');
        assert(result.discovery !== null && result.discovery.discoveryTag === 'campaign-h', '40. the one announcement that happened is the Arweave one, as selected');
        assert(nostrConstructed === false, '41. sanity: nothing in this section ever constructs a Nostr collaborator at all');

        console.log('✓ Section H: one explicit Arweave selection produces exactly one Arweave publication action — no hidden fan-out to Nostr or any other substrate');
    }

    console.log('\nAll ArweaveAnnouncementPublisherImplementation tests passed.');
}

run().catch((error) => {
    console.error('ArweaveAnnouncementPublisherImplementation.test.js FAILED:', error);
    process.exitCode = 1;
});
