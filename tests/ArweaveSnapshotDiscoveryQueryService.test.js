import { readFile } from 'node:fs/promises';

import { ArweaveSnapshotDiscoveryQueryService } from '../application/arweave/ArweaveSnapshotDiscoveryQueryService.js';
import { describeSnapshotDiscoveryEnvelope, SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL, SNAPSHOT_DISCOVERY_ENVELOPE_VERSION } from '../core/SnapshotDiscoveryEnvelope.js';
import { DecentralizedSnapshotResolver } from '../application/snapshot/DecentralizedSnapshotResolver.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/snapshot/DecentralizedSnapshotResolutionOutcome.js';
import { computeContentHash } from '../serializer/contentHash.js';

// 0.9.499 — Arweave Snapshot Discovery Query Service.
//
// Deterministic, network-free coverage of application/
// ArweaveSnapshotDiscoveryQueryService.js's own wire behavior — every
// scenario below runs against an injected `fetchImpl` standing in for
// Arweave's own GraphQL gateway AND raw transaction gateway, never a live
// one, the identical technique tests/ArweaveGraphqlDiscoveryQueryService.test.js
// and tests/NostrSnapshotDiscoveryQueryService.test.js already establish for
// this file's own nearest siblings.
//
//   Section A: only ForkBuild-Snapshot-Discovery-Tag transactions are
//              queried — the outgoing GraphQL request names the configured
//              tag and the discovery tag being searched for
//   Section B: a valid Arweave Snapshot announcement becomes the exact
//              expected { contentHash, locator, storage } candidate
//   Section C: identity fidelity — candidate.contentHash/locator/storage
//              equal the envelope's own fields, and the locator never
//              equals the announcement transaction id
//   Section D: the ar://... locator names the announced CONTENT
//              transaction, never the announcement transaction
//   Section E: malformed / incomplete / undecodable announcements are
//              skipped, never converted into misleading candidates
//   Section F: one unreadable announcement never prevents another, valid
//              announcement from being returned
//   Section G: GraphQL failure semantics match the existing query-service
//              contract — a non-2xx response, a throwing fetch, and an
//              unparseable body all degrade to []
//   Section H: several Arweave Snapshot announcements produce several
//              candidates, in order, with no deduplication or ranking
//   Section I: a discovered candidate passes unchanged into the existing
//              DecentralizedSnapshotResolver and reaches hash verification
//   Section J: source-boundary audit — this file resolves no Snapshot
//              material, computes no hash, uploads no content, publishes no
//              announcement, queries no Nostr, performs no walking-distance
//              filtering, ranking, or cross-source deduplication

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function makeFakeGateway({ handler, envelopes = {} }) {
    const requests = [];
    async function fetchImpl(url, options = {}) {
        requests.push({ url, options });
        const parsed = new URL(url);
        if ((options.method || 'GET') !== 'POST' && parsed.pathname !== '/graphql') {
            const id = parsed.pathname.slice(1);
            if (Object.prototype.hasOwnProperty.call(envelopes, id)) {
                return new Response(envelopes[id], { status: 200 });
            }
            return new Response('not found', { status: 404 });
        }
        return handler(url, options);
    }
    return { requests, fetchImpl };
}

function graphqlResponse(ids) {
    return new Response(JSON.stringify({
        data: { transactions: { edges: ids.map((id) => ({ node: { id } })) } }
    }), { status: 200 });
}

function envelopeJson(overrides = {}) {
    return JSON.stringify({
        protocol: SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL,
        version: SNAPSHOT_DISCOVERY_ENVELOPE_VERSION,
        contentHash: 'snapshot-hash-1',
        locator: 'ar://SnapshotContentTx0000000000000001',
        storage: 'ar',
        ...overrides
    });
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — only ForkBuild-Snapshot-Discovery-Tag transactions are
    // queried.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeGateway({
            handler: async (url, options) => graphqlResponse([]),
            envelopes: {}
        });
        const service = new ArweaveSnapshotDiscoveryQueryService({ fetchImpl: gateway.fetchImpl });
        await service.search('audit-tag');

        assert(gateway.requests.length === 1, '1. exactly one GraphQL request was sent for a search that finds nothing');
        const body = JSON.parse(gateway.requests[0].options.body);
        assert(body.query.includes('ForkBuild-Snapshot-Discovery-Tag'), '2. the outgoing GraphQL request names the default Snapshot discovery tag NAME — never ArweaveGraphqlDiscoveryQueryService.js\'s own ForkBuild-Discovery-Tag');
        assert(body.query.includes('audit-tag'), '3. the outgoing GraphQL request names the discovery tag VALUE being searched for');
        assert(!body.query.includes('"ForkBuild-Discovery-Tag"'), '4. the Publication-vocabulary tag name never appears in this class\'s own query');

        const customTagService = new ArweaveSnapshotDiscoveryQueryService({ fetchImpl: gateway.fetchImpl, tagName: 'Custom-Snapshot-Tag' });
        await customTagService.search('audit-tag-2');
        const customBody = JSON.parse(gateway.requests[1].options.body);
        assert(customBody.query.includes('Custom-Snapshot-Tag'), '5. a configured, non-default tagName reaches the outgoing GraphQL request unchanged');

        console.log('✓ Section A: only ForkBuild-Snapshot-Discovery-Tag (or an explicitly configured tag name) transactions are ever queried');
    }

    // ---------------------------------------------------------------
    // Section B — a valid announcement becomes the exact expected
    // candidate.
    // ---------------------------------------------------------------
    {
        const ANNOUNCEMENT_ID = 'AnnounceTxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
        const gateway = makeFakeGateway({
            handler: async () => graphqlResponse([ANNOUNCEMENT_ID]),
            envelopes: { [ANNOUNCEMENT_ID]: envelopeJson() }
        });
        const service = new ArweaveSnapshotDiscoveryQueryService({ fetchImpl: gateway.fetchImpl });
        const candidates = await service.search('audit-tag');

        assert(candidates.length === 1, '6. one announcement produces exactly one candidate');
        assert(Object.keys(candidates[0]).sort().join(',') === 'contentHash,locator,storage', '7. the candidate carries EXACTLY the three keys the shared candidate vocabulary requires — no announcementId, no extra key');
        assert(candidates[0].contentHash === 'snapshot-hash-1', '8. contentHash carried through unchanged');
        assert(candidates[0].locator === 'ar://SnapshotContentTx0000000000000001', '9. locator carried through unchanged');
        assert(candidates[0].storage === 'ar', '10. storage carried through unchanged');

        console.log('✓ Section B: a valid Arweave Snapshot announcement becomes the exact expected { contentHash, locator, storage } candidate');
    }

    // ---------------------------------------------------------------
    // Section C — identity fidelity.
    // ---------------------------------------------------------------
    {
        const ANNOUNCEMENT_ID = 'AnnounceTxCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
        const envelope = describeSnapshotDiscoveryEnvelope({
            protocol: SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL,
            version: SNAPSHOT_DISCOVERY_ENVELOPE_VERSION,
            contentHash: 'content-hash-identity',
            locator: 'ar://SnapshotContentTxCCCCCCCCCCCCCCCCCCC2',
            storage: 'ar'
        });
        const gateway = makeFakeGateway({
            handler: async () => graphqlResponse([ANNOUNCEMENT_ID]),
            envelopes: { [ANNOUNCEMENT_ID]: JSON.stringify(envelope) }
        });
        const service = new ArweaveSnapshotDiscoveryQueryService({ fetchImpl: gateway.fetchImpl });
        const [candidate] = await service.search('audit-tag');

        assert(candidate.contentHash === envelope.contentHash, '11. candidate.contentHash === envelope.contentHash');
        assert(candidate.locator === envelope.locator, '12. candidate.locator === envelope.locator');
        assert(candidate.storage === envelope.storage, '13. candidate.storage === envelope.storage');
        assert(candidate.locator !== ANNOUNCEMENT_ID, '14. candidate.locator !== announcementTransactionId');

        console.log('✓ Section C: identity fidelity holds — candidate.contentHash/locator/storage equal the envelope\'s own fields, and the locator never equals the announcement transaction id');
    }

    // ---------------------------------------------------------------
    // Section D — the ar://... locator names the CONTENT transaction,
    // never the announcement transaction.
    // ---------------------------------------------------------------
    {
        const ANNOUNCEMENT_ID = 'AnnounceTxDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD';
        const CONTENT_TX_ID = 'SnapshotContentTxDDDDDDDDDDDDDDDDDDDDDDD3';
        const gateway = makeFakeGateway({
            handler: async () => graphqlResponse([ANNOUNCEMENT_ID]),
            envelopes: { [ANNOUNCEMENT_ID]: envelopeJson({ locator: `ar://${CONTENT_TX_ID}` }) }
        });
        const service = new ArweaveSnapshotDiscoveryQueryService({ fetchImpl: gateway.fetchImpl });
        const [candidate] = await service.search('audit-tag');

        assert(candidate.locator === `ar://${CONTENT_TX_ID}`, '15. the reported locator names the announced CONTENT transaction');
        assert(candidate.locator !== `ar://${ANNOUNCEMENT_ID}`, '16. the reported locator never names the ANNOUNCEMENT transaction this file\'s own gateway GET was actually made against');
        assert(CONTENT_TX_ID !== ANNOUNCEMENT_ID, '17. sanity: the two transaction ids in this scenario are genuinely distinct strings');

        console.log('✓ Section D: the ar://... locator refers to the announced CONTENT transaction, never the announcement transaction this file\'s own gateway fetch targeted');
    }

    // ---------------------------------------------------------------
    // Section E — malformed / incomplete / undecodable announcements are
    // skipped, never converted into misleading candidates.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeGateway({
            handler: async () => graphqlResponse(['tx-not-json', 'tx-wrong-protocol', 'tx-missing-fields', 'tx-decentralized-shape']),
            envelopes: {
                'tx-not-json': 'this is not json at all',
                'tx-wrong-protocol': JSON.stringify({ protocol: 'other-protocol', version: 1, contentHash: 'h', locator: 'ar://x', storage: 'ar' }),
                'tx-missing-fields': JSON.stringify({ protocol: SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL, version: SNAPSHOT_DISCOVERY_ENVELOPE_VERSION, contentHash: 'h' }),
                'tx-decentralized-shape': JSON.stringify({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'obj', uri: 'ar://should-never-appear' })
            }
        });
        const service = new ArweaveSnapshotDiscoveryQueryService({ fetchImpl: gateway.fetchImpl });
        const candidates = await service.search('audit-tag');

        assert(candidates.length === 0, '18. every malformed/incomplete/wrong-vocabulary announcement is skipped — zero misleading candidates produced');

        console.log('✓ Section E: malformed, incomplete, and wrong-vocabulary (Decentralized-shaped) announcements are all silently skipped, never converted into misleading candidates');
    }

    // ---------------------------------------------------------------
    // Section F — one unreadable announcement never prevents another,
    // valid announcement from being returned.
    // ---------------------------------------------------------------
    {
        const GOOD_ID = 'AnnounceTxGoodFFFFFFFFFFFFFFFFFFFFFFFFFFF';
        const THROWING_ID = 'AnnounceTxThrowsFFFFFFFFFFFFFFFFFFFFFFFFF';
        const NOT_FOUND_ID = 'AnnounceTxMissingFFFFFFFFFFFFFFFFFFFFFFFF';

        const fetchImpl = async (url, options = {}) => {
            const parsed = new URL(url);
            if ((options.method || 'GET') === 'POST') {
                return graphqlResponse([THROWING_ID, NOT_FOUND_ID, GOOD_ID]);
            }
            const id = parsed.pathname.slice(1);
            if (id === THROWING_ID) {
                throw new Error('simulated gateway connection failure');
            }
            if (id === NOT_FOUND_ID) {
                return new Response('not found', { status: 404 });
            }
            return new Response(envelopeJson({ contentHash: 'good-hash', locator: `ar://${GOOD_ID}-content` }), { status: 200 });
        };

        const service = new ArweaveSnapshotDiscoveryQueryService({ fetchImpl });
        let threw = false;
        let candidates;
        try {
            candidates = await service.search('audit-tag');
        } catch {
            threw = true;
        }

        assert(!threw, '19. a throwing gateway fetch for one announcement never propagates out of search()');
        assert(Array.isArray(candidates) && candidates.length === 1, '20. exactly one candidate survives — the throwing and 404 announcements contribute nothing, but never block the good one');
        assert(candidates[0].contentHash === 'good-hash', '21. the surviving candidate is the genuinely valid one');

        console.log('✓ Section F: one unreadable (throwing or non-2xx) announcement never prevents another, valid announcement from being returned');
    }

    // ---------------------------------------------------------------
    // Section G — GraphQL failure semantics match the existing
    // query-service contract.
    // ---------------------------------------------------------------
    {
        const nonOkService = new ArweaveSnapshotDiscoveryQueryService({
            fetchImpl: async () => new Response('server error', { status: 500 })
        });
        assert((await nonOkService.search('tag')).length === 0, '22. a non-2xx GraphQL response degrades to []');

        const throwingService = new ArweaveSnapshotDiscoveryQueryService({
            fetchImpl: async () => { throw new Error('simulated network failure'); }
        });
        let threw = false;
        try {
            await throwingService.search('tag');
        } catch {
            threw = true;
        }
        assert(!threw, '23. the GraphQL fetch itself throwing never propagates out of search()');

        const unparseableService = new ArweaveSnapshotDiscoveryQueryService({
            fetchImpl: async () => new Response('not valid json', { status: 200 })
        });
        assert((await unparseableService.search('tag')).length === 0, '24. an unparseable GraphQL body degrades to []');

        const unexpectedShapeService = new ArweaveSnapshotDiscoveryQueryService({
            fetchImpl: async () => new Response(JSON.stringify({ data: {} }), { status: 200 })
        });
        assert((await unexpectedShapeService.search('tag')).length === 0, '25. an unexpected-shaped (but valid JSON) GraphQL body degrades to []');

        console.log('✓ Section G: GraphQL failure semantics preserve the existing query-service contract — a non-2xx response, a throwing fetch, an unparseable body, and an unexpected-shaped body all degrade to []');
    }

    // ---------------------------------------------------------------
    // Section H — multiple candidates, no accidental deduplication or
    // ranking.
    // ---------------------------------------------------------------
    {
        const ID_1 = 'AnnounceTxH1HHHHHHHHHHHHHHHHHHHHHHHHHHHHH';
        const ID_2 = 'AnnounceTxH2HHHHHHHHHHHHHHHHHHHHHHHHHHHHH';
        const ID_3 = 'AnnounceTxH3HHHHHHHHHHHHHHHHHHHHHHHHHHHHH';
        const gateway = makeFakeGateway({
            handler: async () => graphqlResponse([ID_1, ID_2, ID_3]),
            envelopes: {
                [ID_1]: envelopeJson({ contentHash: 'hash-1', locator: 'ar://content-1' }),
                [ID_2]: envelopeJson({ contentHash: 'hash-2', locator: 'ar://content-2' }),
                // Deliberately the SAME contentHash+locator+storage as ID_1's own
                // envelope — this file performs no deduplication of its own;
                // application/snapshot/SnapshotCandidateDiscoveryQueryService.js's own
                // dedup pass, one layer up, is the only place that happens.
                [ID_3]: envelopeJson({ contentHash: 'hash-1', locator: 'ar://content-1' })
            }
        });
        const service = new ArweaveSnapshotDiscoveryQueryService({ fetchImpl: gateway.fetchImpl });
        const candidates = await service.search('audit-tag');

        assert(candidates.length === 3, '26. three distinct announcements produce three candidates — including the repeated one — with no deduplication performed by this file');
        assert(candidates[0].contentHash === 'hash-1' && candidates[1].contentHash === 'hash-2' && candidates[2].contentHash === 'hash-1', '27. candidates are reported in the exact order the GraphQL gateway returned their transactions, with no ranking or reordering');

        console.log('✓ Section H: several Arweave Snapshot announcements produce several candidates, in order, with no accidental deduplication or ranking');
    }

    // ---------------------------------------------------------------
    // Section I — a discovered candidate passes unchanged into the
    // existing DecentralizedSnapshotResolver and reaches hash
    // verification.
    // ---------------------------------------------------------------
    {
        const snapshotBytes = JSON.stringify({ kind: 'query-service-fixture', n: 7 });
        const realContentHash = computeContentHash(snapshotBytes);
        const ANNOUNCEMENT_ID = 'AnnounceTxIIIIIIIIIIIIIIIIIIIIIIIIIIIIII';
        const CONTENT_TX_ID = 'SnapshotContentTxIIIIIIIIIIIIIIIIIIIIIII';

        const fetchImpl = async (url, options = {}) => {
            const parsed = new URL(url);
            if ((options.method || 'GET') === 'POST') {
                return graphqlResponse([ANNOUNCEMENT_ID]);
            }
            const id = parsed.pathname.slice(1);
            if (id === ANNOUNCEMENT_ID) {
                return new Response(envelopeJson({ contentHash: realContentHash, locator: `ar://${CONTENT_TX_ID}` }), { status: 200 });
            }
            if (id === CONTENT_TX_ID) {
                return new Response(snapshotBytes, { status: 200 });
            }
            return new Response('not found', { status: 404 });
        };

        const service = new ArweaveSnapshotDiscoveryQueryService({ fetchImpl });
        const [candidate] = await service.search('audit-tag');
        assert(candidate.contentHash === realContentHash, '28. sanity: the discovered candidate carries the real, independently-computed content hash');

        const dummyQueryService = { search: async () => [] };
        const resolver = new DecentralizedSnapshotResolver(dummyQueryService);
        const contentStore = { storage: 'ar', async get(reference) {
            const response = await fetchImpl(reference.uri.replace('ar://', 'https://arweave.net/'), { method: 'GET' });
            return response.ok ? response.text() : null;
        } };
        const storeRegistry = { get: (storage) => (storage === 'ar' ? contentStore : null) };

        const result = await resolver.resolveCandidate(candidate, { storeRegistry });
        assert(result.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, '29. the discovered candidate, handed unchanged to DecentralizedSnapshotResolver#resolveCandidate(), resolves — this file\'s own output is already the resolver\'s own expected input shape');
        assert(result.bytes === snapshotBytes, '30. the resolved bytes are byte-identical to the originally-announced Snapshot material');

        const tamperedCandidate = { ...candidate, contentHash: 'deliberately-wrong-hash' };
        const tamperedResult = await resolver.resolveCandidate(tamperedCandidate, { storeRegistry });
        assert(tamperedResult.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH, '31. hash verification is genuinely reached and genuinely enforced — a tampered contentHash is caught, exactly as for every other storage backend');

        console.log('✓ Section I: a candidate this file discovers passes unchanged into the existing, unmodified DecentralizedSnapshotResolver and reaches real hash verification');
    }

    // ---------------------------------------------------------------
    // Section J — source-boundary audit.
    // ---------------------------------------------------------------
    {
        const fullSource = await readFile(new URL('../application/arweave/ArweaveSnapshotDiscoveryQueryService.js', import.meta.url), 'utf8');
        // Strip comment-only lines before scanning — this file's own header
        // prose legitimately NAMES several of these files (the publisher it
        // is a sibling to, the resolver it feeds) while never importing or
        // calling any of them; the identical "code, not prose" technique
        // tests/ArweaveSnapshotDiscoveryPublisher.test.js's own Section G
        // already establishes.
        const codeOnly = fullSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!codeOnly.includes("from '../content/ArweaveContentStore.js'"), '32. never imports content/ArweaveContentStore.js — resolves no Snapshot material');
        assert(!codeOnly.includes("from '../content/"), '33. never imports any content/ ContentStore at all');
        assert(!codeOnly.includes("from '../serializer/contentHash.js'"), '34. never imports serializer/contentHash.js — calculates no hash of its own');
        assert(!codeOnly.includes('ArweaveTaggedTransactionUpload'), '35. never imports or references the upload primitive — uploads no content, publishes no announcement');
        assert(!codeOnly.includes('ArweaveSnapshotDiscoveryPublisher'), '36. never imports or references its own write-side sibling — see this file\'s own header, "neither should orchestrate the other"');
        assert(!codeOnly.includes('ArweaveAnnouncementPublisher'), '37. never imports or references the Publication-vocabulary publisher either');
        assert(!codeOnly.toLowerCase().includes('nostr'), '38. never mentions Nostr in any form — queries no Nostr relay');
        assert(!/walk|distance|radius|proximity/i.test(codeOnly), '39. no walking-distance / proximity filtering concept appears anywhere in this file\'s own code');
        assert(!/\brank|\bsort\(|\.sort\b/i.test(codeOnly), '40. no ranking or sorting of candidates is performed');
        assert(!/dedup|Set\(\)/i.test(codeOnly), '41. no deduplication (across transactions or across sources) is performed by this file');
        assert(!codeOnly.includes('DecentralizedSnapshotResolver'), '42. never imports the resolver it feeds — resolution stays entirely the caller\'s own, later concern');
        assert(codeOnly.includes("import { parseSnapshotDiscoveryEnvelope } from '../../core/SnapshotDiscoveryEnvelope.js';"), '43. the ONE envelope import is the Snapshot vocabulary, unmodified');

        console.log('✓ Section J: source-boundary audit confirms this file resolves no Snapshot material, calculates no hash, uploads no content, publishes no announcement, queries no Nostr, and performs no walking-distance filtering, ranking, or deduplication of any kind');
    }

    console.log('\nAll ArweaveSnapshotDiscoveryQueryService tests passed.');
}

run().catch((error) => {
    console.error('ArweaveSnapshotDiscoveryQueryService.test.js FAILED:', error);
    process.exitCode = 1;
});
