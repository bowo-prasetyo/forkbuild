import { readFile } from 'node:fs/promises';

import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { computeContentHash } from '../serializer/contentHash.js';

import { resolveSnapshotPublicationAttribution } from '../application/SnapshotPublicationAttribution.js';
import { SnapshotPublicationAttributionOutcome } from '../application/SnapshotPublicationAttributionOutcome.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';
import { DecentralizedSnapshotResolver } from '../application/DecentralizedSnapshotResolver.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/NostrSnapshotDiscoveryQueryService.js';
import { SnapshotPlacementStoreRegistry } from '../application/SnapshotPlacementStoreRegistry.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';

// 0.9.143 — Snapshot–Publication Attribution.
// See docs/Roadmap.md, "0.9.143 — Snapshot–Publication Attribution," for
// the full milestone story.
//
//   Section A: FLAGSHIP — a matching verified Snapshot reports MATCH
//   Section B: a differently-content Snapshot reports NO_MATCH
//   Section C: attribution requires a verified Snapshot — a discovery-only
//              candidate is never enough on its own
//   Section D: resolution failure separation — NOT_DISCOVERED/
//              STORE_UNAVAILABLE/CONTENT_UNAVAILABLE/CONTENT_HASH_MISMATCH
//              are never reported as NO_MATCH
//   Section E: immutability/purity — inputs untouched, repeated calls
//              produce identical results
//   Section F: identity separation — publication hash stays distinct from
//              an Arweave transaction id, a Nostr event id, and a locator
//   Section G: no I/O — architectural regression
//   Section H: full vertical sequence — distribution -> Nostr discovery ->
//              retrieval -> verification -> attribution, end to end

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function makePublication(hash) {
    return new Publication({
        documentId: 'doc-attribution',
        title: 'Attribution Fixture',
        author: 'tester',
        contentReference: new ContentReference({ hash })
    });
}

function resolvedFixture({ outcome, bytes = null, reason = null }) {
    return Object.freeze({ outcome, bytes, candidates: Object.freeze([]), locator: null, storage: null, reason });
}

async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// Mirrors tests/DecentralizedSnapshotResolution.test.js's own fakes —
// a real ArweaveContentStore and a real in-memory Nostr relay, driving
// the real resolver end to end rather than a second, parallel mock.
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
        return { id: `fake-attribution-tx-${counter}`, transaction: { id: `fake-attribution-tx-${counter}`, data: material } };
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

function makeScenario() {
    const gateway = makeFakeArweaveGateway();
    const signer = makeFakeArweaveSigner();
    const store = new ArweaveContentStore({ signer, fetchImpl: gateway.fetchImpl });
    const network = makeNostrNetwork();
    const registry = new SnapshotPlacementStoreRegistry();
    registry.register(store);
    const query = new NostrSnapshotDiscoveryQueryService({ queryImpl: network.queryImpl });
    const resolver = new DecentralizedSnapshotResolver(query);
    return { gateway, signer, store, network, registry, query, resolver };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: a matching verified Snapshot reports MATCH.
    // ---------------------------------------------------------------
    {
        const bytes = 'the same content, published and independently verified';
        const hash = computeContentHash(bytes);
        const publication = makePublication(hash);
        const resolvedSnapshot = resolvedFixture({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes });

        const result = resolveSnapshotPublicationAttribution(publication, resolvedSnapshot);
        assert(result.outcome === SnapshotPublicationAttributionOutcome.MATCH, '1. identical content hashes report MATCH');
        assert(result.publicationHash === hash, '2. publicationHash is the Publication\'s own contentReference.hash');
        assert(result.snapshotHash === hash, '3. snapshotHash is recomputed from the verified bytes, and equals the same hash');
        assert(result.reason === null, '4. reason is null on MATCH');

        console.log('✓ Section A: FLAGSHIP — a verified Snapshot whose content hash equals the Publication\'s own contentReference.hash reports MATCH');
    }

    // ---------------------------------------------------------------
    // Section B — a differently-content Snapshot reports NO_MATCH.
    // ---------------------------------------------------------------
    {
        const publicationHash = computeContentHash('what the Publication actually claims to reference');
        const differentBytes = 'a real, independently verified Snapshot — just not this Publication\'s own';
        const publication = makePublication(publicationHash);
        const resolvedSnapshot = resolvedFixture({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: differentBytes });

        const result = resolveSnapshotPublicationAttribution(publication, resolvedSnapshot);
        assert(result.outcome === SnapshotPublicationAttributionOutcome.NO_MATCH, '5. a genuinely different, but fully verified, Snapshot reports NO_MATCH — never MATCH');
        assert(result.publicationHash === publicationHash, '6. publicationHash is still reported');
        assert(result.snapshotHash === computeContentHash(differentBytes), '7. snapshotHash is still reported, and is the OTHER Snapshot\'s own real hash');
        assert(result.snapshotHash !== result.publicationHash, '8. sanity: the two hashes genuinely differ');

        console.log('✓ Section B: a correctly verified Snapshot belonging to a DIFFERENT Publication reports NO_MATCH — proving attribution compares identity, not merely "was the Snapshot valid"');
    }

    // ---------------------------------------------------------------
    // Section C — attribution requires a verified Snapshot.
    // ---------------------------------------------------------------
    {
        const hash = computeContentHash('content nobody has actually retrieved or verified yet');
        const publication = makePublication(hash);

        // A discovery-only claim — the exact contentHash was merely
        // ANNOUNCED, never retrieved or hash-verified. This can never be
        // handed to resolveSnapshotPublicationAttribution() as a RESOLVED
        // result, because nothing in this codebase can construct a
        // RESOLVED result without DecentralizedSnapshotResolver.js itself
        // having genuinely verified the bytes first (see that file's own
        // resolve() — this test never bypasses it to synthesize a false
        // RESOLVED). What IS reachable without verification is one of its
        // own four failure outcomes:
        const discoveryOnly = resolvedFixture({ outcome: DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED, reason: 'no candidate was ever retrieved or verified' });
        const result = resolveSnapshotPublicationAttribution(publication, discoveryOnly);

        assert(result.outcome !== SnapshotPublicationAttributionOutcome.MATCH, '9. an unverified candidate never produces MATCH merely by existing');
        assert(result.outcome !== SnapshotPublicationAttributionOutcome.NO_MATCH, '10. an unverified candidate never produces NO_MATCH either — there is nothing verified yet to compare');
        assert(result.outcome === DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED, '11. the resolution\'s own failure is reported instead, unchanged');
        assert(result.snapshotHash === null, '12. no snapshotHash is reported — none was ever verified');

        console.log('✓ Section C: attribution requires an already-verified Snapshot — a discovery-only candidate never produces MATCH or NO_MATCH');
    }

    // ---------------------------------------------------------------
    // Section D — resolution failure separation.
    // ---------------------------------------------------------------
    {
        const hash = computeContentHash('a Publication whose Snapshot cannot presently be attributed');
        const publication = makePublication(hash);

        const failureOutcomes = [
            DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED,
            DecentralizedSnapshotResolutionOutcome.STORE_UNAVAILABLE,
            DecentralizedSnapshotResolutionOutcome.CONTENT_UNAVAILABLE,
            DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH
        ];

        for (const outcome of failureOutcomes) {
            const resolvedSnapshot = resolvedFixture({ outcome, reason: `fixture reason for ${outcome}` });
            const result = resolveSnapshotPublicationAttribution(publication, resolvedSnapshot);
            assert(result.outcome === outcome, `13. ${outcome} is passed through unchanged — never collapsed into NO_MATCH`);
            assert(result.outcome !== SnapshotPublicationAttributionOutcome.NO_MATCH, `14. ${outcome} is never reported as NO_MATCH`);
            assert(result.reason === `fixture reason for ${outcome}`, `15. ${outcome}'s own reason is forwarded unchanged`);
            assert(result.snapshotHash === null, `16. ${outcome} reports no snapshotHash — nothing was verified`);
            assert(result.publicationHash === hash, `17. ${outcome} still reports the Publication's own hash`);
        }

        assert(new Set(failureOutcomes).size === failureOutcomes.length, '18. sanity: all four failure outcomes are distinct strings');
        console.log('✓ Section D: NOT_DISCOVERED, STORE_UNAVAILABLE, CONTENT_UNAVAILABLE, and CONTENT_HASH_MISMATCH are each passed through unchanged — none of them becomes NO_MATCH');
    }

    // ---------------------------------------------------------------
    // Section E — immutability/purity.
    // ---------------------------------------------------------------
    {
        const bytes = 'purity fixture content';
        const hash = computeContentHash(bytes);
        const publication = makePublication(hash);
        const resolvedSnapshot = resolvedFixture({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes });

        const publicationSnapshotBefore = JSON.stringify(publication.contentReference.toJSON());
        const resolvedSnapshotBefore = JSON.stringify(resolvedSnapshot);

        const first = resolveSnapshotPublicationAttribution(publication, resolvedSnapshot);
        const second = resolveSnapshotPublicationAttribution(publication, resolvedSnapshot);

        assert(JSON.stringify(publication.contentReference.toJSON()) === publicationSnapshotBefore, '19. the publication argument is never mutated');
        assert(JSON.stringify(resolvedSnapshot) === resolvedSnapshotBefore, '20. the resolvedSnapshot argument is never mutated');
        assert(Object.isFrozen(resolvedSnapshot), '21. sanity: the fixture itself is frozen, so any mutation attempt would already have thrown in strict mode');
        assert(JSON.stringify(first) === JSON.stringify(second), '22. repeated calls with the same inputs produce identical results');
        assert(first.outcome === SnapshotPublicationAttributionOutcome.MATCH, '23. sanity: the shared fixture still reports MATCH both times');

        console.log('✓ Section E: neither argument is ever mutated, and repeated calls with identical inputs produce identical results');
    }

    // ---------------------------------------------------------------
    // Section F — identity separation: publication hash stays distinct
    // from an Arweave transaction id, a Nostr event id, and a locator.
    // ---------------------------------------------------------------
    {
        const { store, network, registry, resolver } = makeScenario();
        const bytes = 'identity-separation fixture content';
        const reference = await store.put(bytes);
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'identity-separation', publishImpl: network.publishImpl });
        await publisher.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage });

        const publication = makePublication(reference.hash);
        const resolvedSnapshot = await resolver.resolve('identity-separation', reference.hash, { storeRegistry: registry });
        assert(resolvedSnapshot.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'sanity: the fixture genuinely resolves');

        const result = resolveSnapshotPublicationAttribution(publication, resolvedSnapshot);
        assert(result.outcome === SnapshotPublicationAttributionOutcome.MATCH, '24. attribution succeeds on real content-hash identity');

        // The Arweave transaction id and the Nostr event id are BOTH
        // present in this real scenario, and BOTH genuinely differ from
        // every hash resolveSnapshotPublicationAttribution() reports —
        // proving the comparison never accidentally keys off either one.
        const arweaveTransactionId = reference.uri.replace('ar://', '');
        assert(result.publicationHash !== arweaveTransactionId, '25. publicationHash is never the Arweave transaction id');
        assert(result.snapshotHash !== arweaveTransactionId, '26. snapshotHash is never the Arweave transaction id');
        assert(result.publicationHash !== network.events[0].id, '27. publicationHash is never a Nostr event id');
        assert(result.snapshotHash !== network.events[0].id, '28. snapshotHash is never a Nostr event id');
        assert(result.publicationHash !== resolvedSnapshot.locator, '29. publicationHash is never the locator URI');
        assert(result.snapshotHash !== resolvedSnapshot.locator, '30. snapshotHash is never the locator URI');
        assert(publication.id !== result.publicationHash, '31. publication.id (a separate identifier of its own) is never conflated with contentReference.hash');

        console.log('✓ Section F: publicationHash/snapshotHash stay distinct from the Arweave transaction id, the Nostr event id, the locator URI, and publication.id');
    }

    // ---------------------------------------------------------------
    // Section G — no I/O: architectural regression.
    // ---------------------------------------------------------------
    {
        const code = await codeOnlySource('application/SnapshotPublicationAttribution.js');

        assert(!/\bfetch\(|WebSocket|localStorage|readFile|writeFile|XMLHttpRequest/.test(code),
            '32. no network, filesystem, or storage access of any kind');
        assert(!/import .*from ['"]\.\.\/(content|discovery|nostr)\//i.test(code),
            '33. no import from content/, discovery/, or any nostr-specific module');
        assert(!code.includes('NostrSnapshotDiscoveryQueryService') && !code.includes('NostrSnapshotDiscoveryPublisher'),
            '34. never references either Nostr collaborator directly');
        assert(!code.includes('ArweaveContentStore') && !code.includes('IpfsContentStore'),
            '35. never references a concrete ContentStore');
        assert(!code.includes("from './DecentralizedSnapshotResolver.js'") && !/new DecentralizedSnapshotResolver/.test(code),
            '36. never imports or constructs a DecentralizedSnapshotResolver — it only imports that family\'s own outcome enum for comparison');
        assert(!/resolver\.resolve\(|queryService\.search\(|\.get\(reference\)/.test(code),
            '37. never itself calls resolve(), search(), or a content store\'s get() — no rediscovery of any kind');
        assert(!/TRUSTED|AUTHENTIC|\bOWNED\b|CONFIRMED|PUBLISHED|CANONICAL/.test(code),
            '38. introduces none of the rejected lifecycle/trust vocabulary');
        assert(!code.includes("import { SnapshotPlacementStoreRegistry }") && !code.includes('storeRegistry') && !code.includes('contentStore'),
            '39. never references a store registry or content store of its own');
        assert(!code.includes("from '../ui/") && !code.toLowerCase().includes('worldview'),
            '40. no reference to ui/ or World View');

        console.log('✓ Section G: no I/O — resolveSnapshotPublicationAttribution() performs no network, storage, or discovery access, and never rediscovers anything itself');
    }

    // ---------------------------------------------------------------
    // Section H — full vertical sequence: distribution -> Nostr
    // discovery -> retrieval -> verification -> attribution.
    // ---------------------------------------------------------------
    {
        const { store, network, registry, resolver } = makeScenario();
        const discoveryTag = 'flagship-snapshot-publication-attribution';

        const snapshotBytes = JSON.stringify({ world: { buildings: [{ id: 'attribution-flagship-building', bricks: 3 }] } });
        const contentHash = computeContentHash(snapshotBytes);

        const reference = await store.put(snapshotBytes);
        assert(reference.hash === contentHash, 'SEQ. 1. the placed reference\'s hash matches the hash computed before placement');

        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });
        const publishResult = await publisher.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage });
        assert(publishResult && publishResult.published === true, 'SEQ. 2. the discovery announcement publishes successfully');

        const publication = makePublication(contentHash);
        const resolvedSnapshot = await resolver.resolve(discoveryTag, contentHash, { storeRegistry: registry });
        assert(resolvedSnapshot.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'SEQ. 3. discovery, location, retrieval, and verification all succeed via one resolve() call');

        const attribution = resolveSnapshotPublicationAttribution(publication, resolvedSnapshot);
        assert(attribution.outcome === SnapshotPublicationAttributionOutcome.MATCH, 'SEQ. 4. the verified Snapshot attributes to its own Publication: MATCH, end to end');

        console.log('✓ Section H (flagship): distribute -> discover via Nostr -> retrieve -> verify -> attribute, in one continuous chain ending in MATCH');

        // FLAGSHIP NEGATIVE — a false Nostr announcement cannot produce
        // attribution merely by claiming the correct publication hash. A
        // decoy is placed at its OWN, real, different locator, but
        // announced under the Publication's own contentHash.
        const decoyBytes = 'a decoy Snapshot, announced with a forged contentHash claim';
        const decoyReference = await store.put(decoyBytes);
        const falseTag = 'flagship-snapshot-publication-attribution-forged';
        const falsePublisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: falseTag, publishImpl: network.publishImpl });
        await falsePublisher.publish({ contentHash, locator: decoyReference.uri, storage: decoyReference.storage });

        const forgedResolution = await resolver.resolve(falseTag, contentHash, { storeRegistry: registry });
        assert(forgedResolution.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH,
            'SEQ. 5. resolve() itself already refuses the forged announcement — the decoy\'s real bytes never hash to the claimed contentHash');

        const forgedAttribution = resolveSnapshotPublicationAttribution(publication, forgedResolution);
        assert(forgedAttribution.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH,
            'SEQ. 6. FLAGSHIP NEGATIVE — attribution reports the resolution\'s own CONTENT_HASH_MISMATCH, never MATCH and never NO_MATCH — a false announcement of the correct hash is caught at verification, before attribution is ever reached');
        assert(forgedAttribution.outcome !== SnapshotPublicationAttributionOutcome.MATCH, 'SEQ. 7. sanity: never MATCH');

        console.log('✓ Section H (flagship negative): a false Nostr announcement claiming the correct Publication hash is refused at verification, and never reaches MATCH');
    }

    console.log('\n✅ All Snapshot–Publication Attribution tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
