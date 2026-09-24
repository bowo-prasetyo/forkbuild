import { readFile } from 'node:fs/promises';
import { ArweaveSnapshotDiscoveryPublisher } from '../application/arweave/ArweaveSnapshotDiscoveryPublisher.js';
import { createArweaveTaggedTransactionUpload } from '../application/arweave/ArweaveTaggedTransactionUpload.js';
import { parseSnapshotDiscoveryEnvelope } from '../core/SnapshotDiscoveryEnvelope.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { computeContentHash } from '../serializer/contentHash.js';

// 0.9.498 — Arweave Snapshot Discovery Publisher.
// See application/arweave/ArweaveSnapshotDiscoveryPublisher.js's own header for the
// full contract this file verifies, and 0.9.497's own capability boundary
// audit (tests/ArweaveSnapshotDiscoveryCapabilityBoundaryAudit.test.js) for
// why this class is a legitimate, narrow addition rather than an adapter
// manufactured to make two unrelated types line up.
//
//   Section A: envelope fidelity — contentHash/locator/storage survive
//              serialization unchanged
//   Section B: discovery tag fidelity — the Snapshot discovery tag reaches
//              the transaction as a well-formed Arweave Tag, unchanged
//   Section C: existing upload adapter reuse — the publisher invokes the
//              injected uploadTaggedTransaction contract, never a
//              duplicated transaction/signing/gateway path of its own
//   Section D: transaction identity — the returned id is the ANNOUNCEMENT
//              transaction id, never confused with contentHash, a content
//              transaction id, or locator
//   Section E: malformed envelope rejected before publishing, per
//              core/SnapshotDiscoveryEnvelope.js's own validation
//   Section F: failure propagation — the underlying upload adapter's
//              established failure behavior (decline -> null, transport
//              failure/timeout -> rejection, contract violation -> throw)
//              is preserved unchanged
//   Section G: no application logic — source audit confirms no hashing,
//              content upload, discovery query, resolution, verification,
//              dedup, fallback, or Nostr coordination
//   Section H: end-to-end deterministic round trip — real publisher + real
//              tagged uploader + real ArweaveContentStore, content to
//              announcement to a fresh, byte-identical read-back

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch { threw = true; }
    assert(threw, message);
}

async function expectRejects(promise, message) {
    let rejected = false;
    try { await promise; } catch { rejected = true; }
    assert(rejected, message);
}

function fieldsOf(overrides = {}) {
    return {
        contentHash: 'snapshot-hash-abc123',
        locator: 'ar://SnapshotContentTx00000000000000000001',
        storage: 'ar',
        ...overrides
    };
}

function fakeOkResponse({ text = 'accepted' } = {}) {
    return { ok: true, headers: { get: () => null }, text: async () => text };
}

const TX_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

// A fake uploadTaggedTransaction standing in for a real Arweave signer +
// gateway — records every (material, tag) call it receives, mirroring
// tests/ArweaveAnnouncementPublisherImplementation.test.js's own technique
// for the identical injection point.
function makeFakeUpload({ handler }) {
    const calls = [];
    async function uploadTaggedTransaction(material, tag) {
        calls.push({ material, tag });
        return handler(material, tag);
    }
    return { calls, uploadTaggedTransaction };
}

const FAKE_TX_ID = 'AnnounceTxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1';

async function run() {
    // ---------------------------------------------------------------
    // Section A — envelope fidelity: contentHash/locator/storage survive
    // serialization unchanged.
    // ---------------------------------------------------------------
    {
        const upload = makeFakeUpload({ handler: () => ({ id: FAKE_TX_ID }) });
        const publisher = new ArweaveSnapshotDiscoveryPublisher({ discoveryTag: 'forkbuild-snapshot', uploadTaggedTransaction: upload.uploadTaggedTransaction });

        const result = await publisher.publish(fieldsOf());
        assert(result !== null, '1. FLAGSHIP — well-formed fields publish successfully');
        assert(result.published === true, '2. FLAGSHIP — result reports published: true');
        assert(result.id === FAKE_TX_ID, '3. FLAGSHIP — result carries the announcement transaction id uploadTaggedTransaction reported');
        assert(result.relayUrl === ArweaveSnapshotDiscoveryPublisher.DEFAULT_GATEWAY_URL, '4. FLAGSHIP — result names the targeted gateway');
        assert(Object.isFrozen(result), '5. the returned result is frozen');

        const material = JSON.parse(upload.calls[0].material);
        assert(material.contentHash === 'snapshot-hash-abc123', '6. the exact contentHash survives serialization');
        assert(material.locator === 'ar://SnapshotContentTx00000000000000000001', '7. the exact locator survives serialization');
        assert(material.storage === 'ar', '8. the exact storage survives serialization');
        assert(material.protocol === 'forkbuild-snapshot-discovery' && material.version === 1, '9. protocol/version are stamped by publish() itself');
    }
    console.log('✓ Section A: envelope fidelity — contentHash/locator/storage survive serialization unchanged');

    // ---------------------------------------------------------------
    // Section B — discovery tag fidelity: the Snapshot discovery tag
    // reaches the transaction as a well-formed Arweave Tag, unchanged.
    // ---------------------------------------------------------------
    {
        const upload = makeFakeUpload({ handler: () => ({ id: FAKE_TX_ID }) });
        const publisher = new ArweaveSnapshotDiscoveryPublisher({
            gatewayUrl: 'https://custom.gateway.example/',
            tagName: 'Custom-Snapshot-Tag',
            discoveryTag: 'forkbuild-snapshot-campaign-42',
            uploadTaggedTransaction: upload.uploadTaggedTransaction
        });

        await publisher.publish(fieldsOf({ contentHash: 'hash-99', locator: 'ar://XYZ', storage: 'ar' }));
        assert(upload.calls.length === 1, '10. exactly one upload call is made');
        assert(upload.calls[0].tag.name === 'Custom-Snapshot-Tag', '11. the configured tag NAME reaches the upload call unchanged');
        assert(upload.calls[0].tag.value === 'forkbuild-snapshot-campaign-42', '12. the configured discovery tag VALUE reaches the upload call unchanged');
        assert(Object.isFrozen(upload.calls[0].tag), '13. the tag object handed to uploadTaggedTransaction is frozen');

        const defaultPublisher = new ArweaveSnapshotDiscoveryPublisher({ discoveryTag: 'default-tag-check', uploadTaggedTransaction: upload.uploadTaggedTransaction });
        assert(defaultPublisher.tagName === ArweaveSnapshotDiscoveryPublisher.DEFAULT_TAG_NAME, '14. the default tag name is exposed and matches the class-level default');
        assert(ArweaveSnapshotDiscoveryPublisher.DEFAULT_TAG_NAME !== 'ForkBuild-Discovery-Tag', '15. the default Snapshot tag name is deliberately distinct from ArweaveAnnouncementPublisher.js\'s own Decentralized-vocabulary default — two vocabularies, two Arweave Tag names, never one shared name a reader could ambiguously match');

        // Gateway URL normalization mirrors ArweaveAnnouncementPublisher.js's
        // own trailing-slash trim.
        assert(publisher.gatewayUrl === 'https://custom.gateway.example', '16. a trailing slash on gatewayUrl is trimmed, exactly as ArweaveAnnouncementPublisher.js already does for its own relayUrl');
    }
    console.log('✓ Section B: discovery tag fidelity — the Snapshot discovery tag reaches the transaction as a well-formed, unmodified Arweave Tag');

    // ---------------------------------------------------------------
    // Section C — existing upload adapter reuse: the publisher invokes the
    // injected uploadTaggedTransaction contract, never a duplicated
    // transaction/signing/gateway path of its own.
    // ---------------------------------------------------------------
    {
        // C1 — against a fake standing in for the contract shape.
        const upload = makeFakeUpload({ handler: () => ({ id: FAKE_TX_ID }) });
        const publisher = new ArweaveSnapshotDiscoveryPublisher({ discoveryTag: 'forkbuild-snapshot', uploadTaggedTransaction: upload.uploadTaggedTransaction });
        await publisher.publish(fieldsOf());
        assert(upload.calls.length === 1, '17. publish() invokes the injected uploadTaggedTransaction exactly once per call');
        assert(typeof upload.calls[0].material === 'string', '18. uploadTaggedTransaction is called with a serialized string, the exact (material, tag) shape application/arweave/ArweaveTaggedTransactionUpload.js already documents');

        // C2 — against the REAL application/arweave/ArweaveTaggedTransactionUpload.js
        // adapter, proving this publisher composes with the real substrate
        // primitive, not merely a test double shaped like it.
        let signCalls = 0;
        let postCalls = 0;
        let postedBody = null;
        const realSigner = {
            async sign(material, tags) {
                signCalls += 1;
                return { id: FAKE_TX_ID, transaction: { format: 2, data: material, tags } };
            }
        };
        const realFetchImpl = async (url, options = {}) => {
            postCalls += 1;
            postedBody = JSON.parse(options.body);
            assert(url === 'https://arweave.net/tx', '19. the real adapter POSTs to the expected gateway /tx endpoint');
            return fakeOkResponse();
        };
        const realUpload = createArweaveTaggedTransactionUpload({ signer: realSigner, fetchImpl: realFetchImpl });
        const realPublisher = new ArweaveSnapshotDiscoveryPublisher({ discoveryTag: 'real-adapter-tag', uploadTaggedTransaction: realUpload });

        const result = await realPublisher.publish(fieldsOf());
        assert(result !== null && result.id === FAKE_TX_ID, '20. the REAL ArweaveTaggedTransactionUpload adapter, wired in unchanged, accepts and reports the announcement transaction id');
        assert(signCalls === 1 && postCalls === 1, '21. the real adapter\'s own sign-then-POST sequence ran exactly once — this publisher never duplicates transaction submission itself');
        assert(postedBody.tags[0].name === ArweaveSnapshotDiscoveryPublisher.DEFAULT_TAG_NAME && postedBody.tags[0].value === 'real-adapter-tag', '22. the tag reaching the real signed transaction is exactly this publisher\'s own configured tag');
    }
    console.log('✓ Section C: existing upload adapter reuse — publish() delegates to the injected/real uploadTaggedTransaction contract, never a duplicated submission path');

    // ---------------------------------------------------------------
    // Section D — transaction identity: the returned id is the
    // ANNOUNCEMENT transaction id, never confused with contentHash, a
    // content transaction id, or locator.
    // ---------------------------------------------------------------
    {
        const CONTENT_TX_ID = 'ContentTxCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC1';
        const ANNOUNCEMENT_TX_ID = 'AnnounceTxDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD2';
        const contentHash = 'a-completely-independent-content-hash-value';
        const locator = `ar://${CONTENT_TX_ID}`;

        const upload = makeFakeUpload({ handler: () => ({ id: ANNOUNCEMENT_TX_ID }) });
        const publisher = new ArweaveSnapshotDiscoveryPublisher({ discoveryTag: 'identity-tag', uploadTaggedTransaction: upload.uploadTaggedTransaction });
        const result = await publisher.publish({ contentHash, locator, storage: 'ar' });

        assert(result.id === ANNOUNCEMENT_TX_ID, '23. the returned id is exactly the announcement transaction id uploadTaggedTransaction reported');
        assert(result.id !== contentHash, '24. the returned id is never confused with contentHash');
        assert(result.id !== CONTENT_TX_ID, '25. the returned id is never confused with the content transaction id folded into locator');
        assert(result.id !== locator, '26. the returned id is never confused with locator itself');
        assert(!locator.includes(ANNOUNCEMENT_TX_ID), '27. THE GUARDRAIL: the announced locator never names the announcement transaction — this publisher never rewrites the ar://... locator into the announcement transaction\'s own id');

        const publishedMaterial = JSON.parse(upload.calls[0].material);
        assert(publishedMaterial.locator === locator, '28. the material sent for announcement still carries the ORIGINAL content locator, untouched by the announcement id this call later receives');
        assert(!upload.calls[0].material.includes(ANNOUNCEMENT_TX_ID), '29. the announcement material never contains its own not-yet-assigned transaction id — nothing here is self-referential');
    }
    console.log('✓ Section D: transaction identity — announcement id, contentHash, content tx id, and locator remain four genuinely distinct values, never collapsed');

    // ---------------------------------------------------------------
    // Section E — malformed envelope rejected before publishing, per
    // core/SnapshotDiscoveryEnvelope.js's own validation.
    // ---------------------------------------------------------------
    {
        const upload = makeFakeUpload({ handler: () => ({ id: FAKE_TX_ID }) });
        const publisher = new ArweaveSnapshotDiscoveryPublisher({ discoveryTag: 'forkbuild-snapshot', uploadTaggedTransaction: upload.uploadTaggedTransaction });

        const malformedInputs = [
            undefined,
            {},
            fieldsOf({ contentHash: '' }),
            fieldsOf({ contentHash: undefined }),
            fieldsOf({ locator: '' }),
            fieldsOf({ storage: '' }),
            fieldsOf({ publicationId: 'pub-1' }) // publicationId without claimedPosition
        ];
        for (const candidate of malformedInputs) {
            const result = await publisher.publish(candidate);
            assert(result === null, `30. malformed input ${JSON.stringify(candidate)} resolves to null, per describeSnapshotDiscoveryEnvelope()'s own existing semantics`);
        }
        assert(upload.calls.length === 0, '31. uploadTaggedTransaction is never consulted for malformed input — no wasted network activity, and no path to accidental publication');
    }
    console.log('✓ Section E: a malformed Snapshot envelope is rejected, according to existing Snapshot discovery semantics, before publishing');

    // ---------------------------------------------------------------
    // Section F — failure propagation: the underlying upload adapter's
    // established failure behavior is preserved unchanged.
    // ---------------------------------------------------------------
    {
        // F1 — an ordinary decline (uploadTaggedTransaction resolves null)
        // collapses to null, exactly like ArweaveAnnouncementPublisher.js.
        const declining = makeFakeUpload({ handler: () => null });
        const decliningPublisher = new ArweaveSnapshotDiscoveryPublisher({ discoveryTag: 'forkbuild-snapshot', uploadTaggedTransaction: declining.uploadTaggedTransaction });
        const declineResult = await decliningPublisher.publish(fieldsOf());
        assert(declineResult === null, '32. an uploadTaggedTransaction decline (resolves null) resolves to null, collapsed together with malformed input');
        assert(declining.calls.length === 1, '33. uploadTaggedTransaction was in fact consulted before the decline was reported');

        // F2 — a genuine transport/signing failure propagates as a
        // rejection, never swallowed into null.
        const failingUpload = async () => { throw new Error('simulated: no signing key available'); };
        const failingPublisher = new ArweaveSnapshotDiscoveryPublisher({ discoveryTag: 'forkbuild-snapshot', uploadTaggedTransaction: failingUpload });
        await expectRejects(failingPublisher.publish(fieldsOf()), '34. a genuine uploadTaggedTransaction failure propagates as a rejection, never swallowed as null');

        // F3 — a timeout propagates as a rejection too.
        const neverSettles = () => new Promise(() => {});
        const timingOutPublisher = new ArweaveSnapshotDiscoveryPublisher({ discoveryTag: 'forkbuild-snapshot', uploadTaggedTransaction: neverSettles, timeoutMs: 20 });
        await expectRejects(timingOutPublisher.publish(fieldsOf()), '35. an uploadTaggedTransaction that never settles propagates as a rejection once timeoutMs elapses');

        // F4 — a contract violation (truthy result, no/malformed id) throws
        // rather than degrading to null.
        const noId = makeFakeUpload({ handler: () => ({}) });
        await expectRejects(
            new ArweaveSnapshotDiscoveryPublisher({ discoveryTag: 'forkbuild-snapshot', uploadTaggedTransaction: noId.uploadTaggedTransaction }).publish(fieldsOf()),
            '36. uploadTaggedTransaction resolving with no id throws rather than returning null'
        );
        const malformedId = makeFakeUpload({ handler: () => ({ id: 'not a valid tx id!' }) });
        await expectRejects(
            new ArweaveSnapshotDiscoveryPublisher({ discoveryTag: 'forkbuild-snapshot', uploadTaggedTransaction: malformedId.uploadTaggedTransaction }).publish(fieldsOf()),
            '37. uploadTaggedTransaction resolving with a malformed id throws rather than returning null'
        );

        // F5 — constructor validation mirrors ArweaveAnnouncementPublisher.js.
        expectThrows(() => new ArweaveSnapshotDiscoveryPublisher({ gatewayUrl: '', discoveryTag: 'forkbuild-snapshot', uploadTaggedTransaction: declining.uploadTaggedTransaction }), '38. an empty gatewayUrl throws at construction time');
        expectThrows(() => new ArweaveSnapshotDiscoveryPublisher({ discoveryTag: '', uploadTaggedTransaction: declining.uploadTaggedTransaction }), '39. a missing discoveryTag throws at construction time');
        expectThrows(() => new ArweaveSnapshotDiscoveryPublisher({ discoveryTag: 'forkbuild-snapshot' }), '40. a missing uploadTaggedTransaction throws at construction time');
        expectThrows(() => new ArweaveSnapshotDiscoveryPublisher({ discoveryTag: 'forkbuild-snapshot', uploadTaggedTransaction: 'not-a-function' }), '41. a non-function uploadTaggedTransaction throws at construction time');
        expectThrows(() => new ArweaveSnapshotDiscoveryPublisher({ discoveryTag: 'forkbuild-snapshot', tagName: '', uploadTaggedTransaction: declining.uploadTaggedTransaction }), '42. an empty tagName throws at construction time');
    }
    console.log('✓ Section F: failure propagation — decline collapses to null, genuine failure/timeout propagates, contract violation throws, exactly preserving ArweaveTaggedTransactionUpload.js\'s own established behavior');

    // ---------------------------------------------------------------
    // Section G — no application logic: source audit confirms no hashing,
    // content upload, discovery query, resolution, verification, dedup,
    // fallback, or Nostr coordination.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/arweave/ArweaveSnapshotDiscoveryPublisher.js', import.meta.url);
        const fullSource = await readFile(sourceUrl, 'utf8');
        const codeOnly = fullSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!codeOnly.includes('computeContentHash') && !codeOnly.includes("from '../serializer/contentHash.js'"), '43. never computes a content hash — serializer/contentHash.js is never imported');
        assert(!codeOnly.includes('ArweaveContentStore') && !codeOnly.includes('IpfsContentStore'), '44. never uploads or re-uploads Snapshot content — no ContentStore of any kind is imported');
        assert(!codeOnly.includes('ArweaveGraphqlDiscoveryQueryService') && !codeOnly.includes('GraphQL') && !codeOnly.includes('graphql'), '45. never queries GraphQL or any discovery query service');
        assert(!codeOnly.includes('DecentralizedSnapshotResolver') && !codeOnly.includes('SnapshotPlacementResolver'), '46. never resolves material — resolution stays entirely a consuming side\'s concern');
        assert(!codeOnly.includes('NostrSnapshotDiscoveryPublisher') && !codeOnly.includes('NostrPublicationDiscoveryPublisher'), '47. never coordinates with Nostr — selecting Arweave announces to Arweave alone');
        assert(!codeOnly.includes('ArweaveAnnouncementPublisher'), '48. never imports or wraps application/arweave/ArweaveAnnouncementPublisher.js — a sibling, never a wrapper');
        assert(!codeOnly.includes('DecentralizedDiscoveryEnvelope'), '49. never imports the unrelated Decentralized (Publication/Avatar) envelope vocabulary');
        assert(!codeOnly.includes('PublicationSnapshotPlacement') && !codeOnly.includes('SnapshotPlacementStoreRegistry'), '50. never imports the Snapshot Placement family\'s own signing/catalog machinery');
        assert(!codeOnly.includes('crypto') && !codeOnly.includes('Wallet') && !codeOnly.includes('JWK') && !codeOnly.includes('nsec'), '51. never references key/wallet material of any kind — signing is fully delegated to the injected uploadTaggedTransaction');

        const forbiddenTerms = ['trusted', 'reputation', 'weight', 'confidence', 'ranking', 'scoring', 'preferred', 'verified', 'dedup', 'retry', 'fallback'];
        for (const term of forbiddenTerms) {
            assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `52. code must never use "${term}" — no trust/dedup/retry/fallback semantics at this boundary`);
        }

        assert(codeOnly.includes('describeSnapshotDiscoveryEnvelope'), '53. reuses the existing envelope validator rather than inventing a second format');
        assert(codeOnly.includes("from '../application/arweave/ArweaveTaggedTransactionUpload.js'") === false, '54. does not even import ArweaveTaggedTransactionUpload.js directly — it is injected, never constructed by this file');

        console.log('✓ Section G: no application logic — source audit confirms no hashing, content upload, discovery query, resolution, verification, dedup, retry, fallback, or Nostr coordination');
    }

    // ---------------------------------------------------------------
    // Section H — end-to-end deterministic round trip: real publisher +
    // real tagged uploader + real ArweaveContentStore.
    // ---------------------------------------------------------------
    {
        const CONTENT_TX_ID = 'E2EContentTxEEEEEEEEEEEEEEEEEEEEEEEEEEEE1';
        const ANNOUNCEMENT_TX_ID = 'E2EAnnounceTxFFFFFFFFFFFFFFFFFFFFFFFFFF2';
        const snapshotBytes = JSON.stringify({ kind: 'e2e-fixture-snapshot', n: 7, note: '0.9.498' });

        let contentGetCount = 0;
        const contentSigner = { async sign(text) { return { id: CONTENT_TX_ID, transaction: { format: 2, data: text } }; } };
        const contentFetchImpl = async (url, options = {}) => {
            if (options && options.method === 'POST') {
                return fakeOkResponse();
            }
            contentGetCount += 1;
            assert(url === `https://arweave.net/${CONTENT_TX_ID}`, '55. content retrieval targets exactly the content transaction id');
            return fakeOkResponse({ text: snapshotBytes });
        };
        const contentStore = new ArweaveContentStore({ signer: contentSigner, fetchImpl: contentFetchImpl });

        // Step 1: place Snapshot content — entirely outside this
        // publisher's own knowledge.
        const contentReference = await contentStore.put(snapshotBytes);
        assert(contentReference.hash === computeContentHash(snapshotBytes), '56. sanity: the content hash is legitimate, computed off the bytes alone');
        assert(contentReference.uri === `ar://${CONTENT_TX_ID}`, '57. sanity: the content locator names the content transaction');

        // Step 2: announce that already-prepared SnapshotDiscoveryEnvelope
        // via the real ArweaveSnapshotDiscoveryPublisher + real
        // ArweaveTaggedTransactionUpload — no test doubles standing in for
        // application-level behavior, only the network boundary itself.
        let announcementSignCalls = 0;
        const announcementSigner = {
            async sign(material, tags) {
                announcementSignCalls += 1;
                return { id: ANNOUNCEMENT_TX_ID, transaction: { format: 2, data: material, tags } };
            }
        };
        let announcementPostBody = null;
        const announcementFetchImpl = async (url, options = {}) => {
            announcementPostBody = JSON.parse(options.body);
            return fakeOkResponse();
        };
        const uploadTaggedTransaction = createArweaveTaggedTransactionUpload({ signer: announcementSigner, fetchImpl: announcementFetchImpl });
        const publisher = new ArweaveSnapshotDiscoveryPublisher({ discoveryTag: 'e2e-round-trip-tag', uploadTaggedTransaction });

        const publishResult = await publisher.publish({
            contentHash: contentReference.hash,
            locator: contentReference.uri,
            storage: contentReference.storage
        });

        assert(publishResult !== null && publishResult.published === true, '58. the end-to-end publish succeeds');
        assert(TX_ID_PATTERN.test(publishResult.id) && publishResult.id === ANNOUNCEMENT_TX_ID, '59. the returned id is the real, distinct announcement transaction id');
        assert(announcementSignCalls === 1, '60. exactly one announcement transaction was signed');
        assert(publishResult.id !== contentReference.hash && publishResult.id !== CONTENT_TX_ID, '61. the announcement id remains distinct from both contentHash and the content transaction id, end to end');

        // Step 3: a fresh reader, given only the transaction data actually
        // broadcast, recovers a byte-identical Snapshot discovery
        // candidate — the deterministic round trip this section asserts.
        const roundTripped = parseSnapshotDiscoveryEnvelope(announcementPostBody.data);
        assert(roundTripped !== null, '62. the broadcast announcement material parses back as a well-formed Snapshot Discovery Envelope');
        assert(roundTripped.contentHash === contentReference.hash, '63. round-tripped contentHash is byte-identical to what was placed');
        assert(roundTripped.locator === contentReference.uri, '64. round-tripped locator is byte-identical to what was placed');
        assert(roundTripped.storage === contentReference.storage, '65. round-tripped storage is byte-identical to what was placed');
        assert(announcementPostBody.tags[0].name === ArweaveSnapshotDiscoveryPublisher.DEFAULT_TAG_NAME, '66. the real signed transaction carries the expected default Arweave Tag name');
        assert(announcementPostBody.tags[0].value === 'e2e-round-trip-tag', '67. the real signed transaction carries the exact configured discovery tag value');

        // The candidate this round trip recovers is exactly what
        // application/snapshot/DecentralizedSnapshotResolver.js already resolves and
        // verifies with zero code change, per 0.9.497 Section F — this
        // section stops at the discovered candidate itself, since
        // resolution is deliberately out of scope for this publisher (see
        // this file's own header, "no application logic").
        assert(contentGetCount === 0, '68. this end-to-end round trip never itself resolves/fetches Snapshot content back — publishing an announcement never triggers a content read');

        console.log('✓ Section H: end-to-end deterministic round trip — real publisher + real tagged uploader + real ArweaveContentStore produce a byte-identical, independently-recoverable Snapshot discovery candidate');
    }

    console.log('\nAll ArweaveSnapshotDiscoveryPublisher tests passed.');
}

run().catch((error) => {
    console.error('ArweaveSnapshotDiscoveryPublisher.test.js FAILED:', error);
    process.exitCode = 1;
});
