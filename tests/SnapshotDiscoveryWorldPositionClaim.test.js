import { readFile } from 'node:fs/promises';

import {
    describeSnapshotDiscoveryEnvelope,
    parseSnapshotDiscoveryEnvelope,
    SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL,
    SNAPSHOT_DISCOVERY_ENVELOPE_VERSION
} from '../core/SnapshotDiscoveryEnvelope.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/NostrSnapshotDiscoveryQueryService.js';

// 0.9.171 — Decentralized Snapshot World Position Claim.
//
// 0.9.150 through 0.9.170 built and hardened one continuous pipeline —
// DISCOVER -> SELECT -> RESOLVE -> VERIFY -> ATTRIBUTE -> MATERIALIZE ->
// PLACE -> REGISTER — for a stranger's Snapshot, discovered only via
// Nostr. Every stage answers a question about BYTES; `application/
// SnapshotWorldPlacement.js`'s own 0.9.159 header names the gap this
// milestone closes directly: PLACE never consults the PUBLISHER's own
// spatial intent at all — it borrows only the RECEIVER's own,
// already-existing `WorldPlacement` for the same Publication, and reports
// `UNPLACED` when none exists. A stranger's Snapshot, once genuinely
// recovered and verified, has always arrived with its spatial meaning
// silently discarded.
//
// This milestone adds exactly one new, OPTIONAL capability to the
// DISCOVER stage alone: a publisher may now announce `publicationId` +
// `claimedPosition` alongside `contentHash`/`locator`/`storage` — a
// self-declared claim, explicitly bound to a Publication identity, about
// where that publisher's own World currently places the Snapshot it is
// announcing. Nothing about VERIFICATION, ATTRIBUTION, MATERIALIZATION, or
// PLACEMENT changes — a claimed position is discovered exactly as
// unverified as a discovered `contentHash`/`locator` already was; whether
// a materialized Snapshot's claim should ever become its own
// `WorldPlacement` is a separate, later, deliberately unscheduled
// question this milestone does not answer (see Section G, below).
//
//   Section A — envelope round-trip: a claim survives describe/parse and
//     JSON serialization exactly.
//   Section B — candidate preservation: NostrSnapshotDiscoveryQueryService
//     reports a claim exactly as NostrSnapshotDiscoveryPublisher announced
//     it, through a real, shared in-memory Nostr network.
//   Section C — publication binding: two different Publications sharing
//     one contentHash remain two distinct claims, never merged or
//     confused, per this milestone's own brief ("Publication A / H / P1"
//     vs. "Publication B / H / P2").
//   Section D — position identity independence: contentHash, locator,
//     storage, publicationId, and claimedPosition are five independent
//     axes — changing one never disturbs another.
//   Section E — no verification semantics: a candidate carrying a claim
//     never acquires a verified/trusted/authentic field, and publishing
//     one performs no verification of its own.
//   Section F — old announcements: an envelope/candidate naming neither
//     field remains byte-for-byte identical to the pre-0.9.171 shape.
//   Section G — no World placement yet: this milestone's own files never
//     reference `application/SnapshotWorldPlacement.js` or `application/
//     MaterializedSnapshotWorldDiscoveryBridge.js`, and neither of those
//     two files references this milestone's own new claim vocabulary —
//     discovery can carry the claim without silently modifying placement.
//   Section H — no Nostr/Arweave coupling to material retrieval: the claim
//     lives entirely inside the Snapshot discovery protocol; none of this
//     milestone's own files reference a content store, a placement
//     resolver, or the Signed Claim distribution family.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function envelopeOf(overrides = {}) {
    return {
        protocol: SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL,
        version: SNAPSHOT_DISCOVERY_ENVELOPE_VERSION,
        contentHash: 'claim-hash-1',
        locator: 'ar://ClaimTx000000000000000000001',
        storage: 'ar',
        ...overrides
    };
}

// A tiny in-memory stand-in for a Nostr relay — mirrors tests/
// NostrSnapshotDiscovery.test.js's own makeNostrNetwork() exactly, so
// Section B/C below drive the real publisher and the real query service
// against one shared network, never two isolated fakes.
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

const SOURCE_ROOT = new URL('../', import.meta.url);

async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

const CLAIM_FILES = [
    'core/SnapshotDiscoveryEnvelope.js',
    'application/NostrSnapshotDiscoveryPublisher.js',
    'application/NostrSnapshotDiscoveryQueryService.js'
];

async function run() {
    // ===============================================================
    // Section A — envelope round-trip.
    // ===============================================================
    {
        const publicationId = 'publication-A';
        const claimedPosition = { x: 10, y: 20, z: -5 };
        const described = describeSnapshotDiscoveryEnvelope(envelopeOf({ publicationId, claimedPosition }));
        assert(described !== null, '1. FLAGSHIP — an envelope carrying a well-formed claim is describable');
        assert(described.publicationId === publicationId, '2. publicationId is carried verbatim');
        assert(described.claimedPosition.x === 10 && described.claimedPosition.y === 20 && described.claimedPosition.z === -5, '3. claimedPosition is carried verbatim, field by field');
        assert(Object.isFrozen(described) && Object.isFrozen(described.claimedPosition), '4. both the envelope and its claimedPosition are frozen');
        assert(described.claimedPosition !== claimedPosition, '5. claimedPosition is copied field by field, never the input reference');

        const raw = JSON.stringify(envelopeOf({ publicationId, claimedPosition }));
        const parsed = parseSnapshotDiscoveryEnvelope(raw);
        assert(parsed !== null, '6. a JSON string payload carrying a claim parses successfully');
        assert(parsed.publicationId === publicationId && parsed.claimedPosition.x === 10 && parsed.claimedPosition.y === 20 && parsed.claimedPosition.z === -5,
            '7. the claim survives a full JSON serialize/parse round trip exactly');

        console.log('✓ Section A: a position claim survives describe/parse and JSON serialization exactly');
    }

    // ===============================================================
    // Section B — candidate preservation through real discovery.
    // ===============================================================
    {
        const network = makeNostrNetwork();
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'section-b-claim', publishImpl: network.publishImpl });

        const publishResult = await publisher.publish({
            contentHash: 'hash-b',
            locator: 'ar://tx-b',
            storage: 'ar',
            publicationId: 'publication-b',
            claimedPosition: { x: 1, y: 2, z: 3 }
        });
        assert(publishResult !== null && publishResult.published === true, '8. publishing a claim-bearing announcement succeeds');

        const query = new NostrSnapshotDiscoveryQueryService({ queryImpl: network.queryImpl });
        const candidates = await query.search('section-b-claim');
        assert(candidates.length === 1, '9. exactly one candidate is discovered');
        const [candidate] = candidates;
        assert(candidate.contentHash === 'hash-b' && candidate.locator === 'ar://tx-b' && candidate.storage === 'ar',
            '10. the candidate still reports its own contentHash/locator/storage unchanged');
        assert(candidate.publicationId === 'publication-b', '11. the candidate reports the announced publicationId, unchanged');
        assert(candidate.claimedPosition.x === 1 && candidate.claimedPosition.y === 2 && candidate.claimedPosition.z === 3,
            '12. the candidate reports the announced claimedPosition, unchanged');

        console.log('✓ Section B: NostrSnapshotDiscoveryQueryService reports a claim exactly as NostrSnapshotDiscoveryPublisher announced it');
    }

    // ===============================================================
    // Section C — publication binding: two Publications sharing one
    // contentHash remain two distinct claims.
    // ===============================================================
    {
        const network = makeNostrNetwork();
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'section-c-collision', publishImpl: network.publishImpl });

        const sharedContentHash = 'shared-collision-hash';
        await publisher.publish({
            contentHash: sharedContentHash, locator: 'ar://tx-publication-a', storage: 'ar',
            publicationId: 'publication-A', claimedPosition: { x: 100, y: 0, z: 0 }
        });
        await publisher.publish({
            contentHash: sharedContentHash, locator: 'ar://tx-publication-b', storage: 'ar',
            publicationId: 'publication-B', claimedPosition: { x: -100, y: 0, z: 0 }
        });

        const query = new NostrSnapshotDiscoveryQueryService({ queryImpl: network.queryImpl });
        const candidates = await query.search('section-c-collision');
        assert(candidates.length === 2, '13. FLAGSHIP — both announcements are discovered, despite sharing one contentHash');

        const forA = candidates.find((c) => c.publicationId === 'publication-A');
        const forB = candidates.find((c) => c.publicationId === 'publication-B');
        assert(forA !== undefined && forB !== undefined, '14. both distinct publicationIds are present among the discovered candidates');
        assert(forA.contentHash === sharedContentHash && forB.contentHash === sharedContentHash, '15. both candidates genuinely share the identical contentHash — this is the real collision case, not a fabricated one');
        assert(forA.claimedPosition.x === 100 && forB.claimedPosition.x === -100, '16. FLAGSHIP — each Publication\'s own claimed position is reported distinctly, never merged, averaged, or overwritten by the other');
        assert(forA.locator !== forB.locator, '17. each Publication\'s own locator remains distinct too');

        console.log('✓ Section C: two Publications sharing one contentHash remain two distinct, correctly-bound position claims — never merged or confused');
    }

    // ===============================================================
    // Section D — position identity independence: five independent axes.
    // ===============================================================
    {
        const base = { contentHash: 'axis-hash', locator: 'ar://axis-tx', storage: 'ar', publicationId: 'axis-publication', claimedPosition: { x: 1, y: 1, z: 1 } };

        const baseline = describeSnapshotDiscoveryEnvelope(envelopeOf(base));
        const changedHash = describeSnapshotDiscoveryEnvelope(envelopeOf({ ...base, contentHash: 'axis-hash-2' }));
        const changedLocator = describeSnapshotDiscoveryEnvelope(envelopeOf({ ...base, locator: 'ar://axis-tx-2' }));
        const changedStorage = describeSnapshotDiscoveryEnvelope(envelopeOf({ ...base, storage: 'ipfs' }));
        const changedPublication = describeSnapshotDiscoveryEnvelope(envelopeOf({ ...base, publicationId: 'axis-publication-2' }));
        const changedPosition = describeSnapshotDiscoveryEnvelope(envelopeOf({ ...base, claimedPosition: { x: 9, y: 9, z: 9 } }));

        // Changing contentHash affects only contentHash.
        assert(changedHash.contentHash !== baseline.contentHash, '18. changing contentHash changes contentHash');
        assert(changedHash.locator === baseline.locator && changedHash.storage === baseline.storage && changedHash.publicationId === baseline.publicationId,
            '19. changing contentHash leaves locator/storage/publicationId untouched');
        assert(changedHash.claimedPosition.x === baseline.claimedPosition.x, '20. changing contentHash leaves claimedPosition untouched');

        // Changing locator affects only locator.
        assert(changedLocator.locator !== baseline.locator, '21. changing locator changes locator');
        assert(changedLocator.contentHash === baseline.contentHash && changedLocator.publicationId === baseline.publicationId && changedLocator.claimedPosition.x === baseline.claimedPosition.x,
            '22. changing locator leaves contentHash/publicationId/claimedPosition untouched');

        // Changing storage affects only storage.
        assert(changedStorage.storage !== baseline.storage, '23. changing storage changes storage');
        assert(changedStorage.contentHash === baseline.contentHash && changedStorage.locator === baseline.locator && changedStorage.publicationId === baseline.publicationId,
            '24. changing storage leaves contentHash/locator/publicationId untouched');

        // Changing publicationId affects only publicationId — never contentHash.
        assert(changedPublication.publicationId !== baseline.publicationId, '25. changing publicationId changes publicationId');
        assert(changedPublication.contentHash === baseline.contentHash && changedPublication.locator === baseline.locator && changedPublication.storage === baseline.storage,
            '26. FLAGSHIP — changing publicationId never disturbs contentHash/locator/storage — Publication identity and content identity are independent axes');
        assert(changedPublication.claimedPosition.x === baseline.claimedPosition.x, '27. changing publicationId alone leaves claimedPosition untouched');

        // Changing claimedPosition affects only claimedPosition — never any identity field.
        assert(changedPosition.claimedPosition.x !== baseline.claimedPosition.x, '28. changing claimedPosition changes claimedPosition');
        assert(changedPosition.contentHash === baseline.contentHash && changedPosition.locator === baseline.locator
            && changedPosition.storage === baseline.storage && changedPosition.publicationId === baseline.publicationId,
            '29. FLAGSHIP — changing claimedPosition never disturbs contentHash/locator/storage/publicationId — a spatial claim is never treated as any other identity');

        console.log('✓ Section D: contentHash, locator, storage, publicationId, and claimedPosition are five independent axes — changing one never disturbs another');
    }

    // ===============================================================
    // Section E — no verification semantics.
    // ===============================================================
    {
        const network = makeNostrNetwork();
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'section-e-claim', publishImpl: network.publishImpl });

        // Nothing stops a caller from claiming a position for a locator
        // that was never actually placed, or a Publication that never
        // actually signed anything — this milestone performs no placement
        // or signature check of any kind, exactly as 0.9.133's own
        // "discovery is not verification" already held for contentHash.
        await publisher.publish({
            contentHash: 'unverified-hash', locator: 'ar://unverified-locator', storage: 'ar',
            publicationId: 'unverified-publication', claimedPosition: { x: 0, y: 0, z: 0 }
        });

        const query = new NostrSnapshotDiscoveryQueryService({ queryImpl: network.queryImpl });
        const [candidate] = await query.search('section-e-claim');
        assert(candidate !== undefined, '30. an unverified claim is discoverable exactly like any other announcement');

        const forbiddenFields = ['verified', 'trusted', 'authentic', 'authenticity', 'verifiedPosition', 'trustedPosition', 'authenticPosition', 'confidence', 'ranking', 'score'];
        for (const field of forbiddenFields) {
            assert(!(field in candidate), `31. a claim-bearing candidate never carries a '${field}' field — a claim never acquires verification semantics merely by existing`);
        }
        assert(Object.keys(candidate).sort().join(',') === 'claimedPosition,contentHash,locator,publicationId,storage',
            '32. a claim-bearing candidate carries EXACTLY five fields — the original three plus publicationId/claimedPosition, nothing else');

        for (const file of CLAIM_FILES) {
            const code = await codeOnlySource(file);
            for (const term of ['verifiedPosition', 'trustedPosition', 'authenticPosition']) {
                assert(!code.includes(term), `33. ${file} never uses the term "${term}" — a claim is validated for SHAPE only, never for truth`);
            }
        }

        console.log('✓ Section E: a position claim carries no verification semantics — it remains a claim, structurally and behaviorally');
    }

    // ===============================================================
    // Section F — old announcements remain valid, unchanged.
    // ===============================================================
    {
        // F1 — an envelope naming neither field describes to exactly the
        // pre-0.9.171 five-key shape.
        const described = describeSnapshotDiscoveryEnvelope(envelopeOf());
        assert(described !== null, '34. an envelope with no position claim still describes successfully');
        assert(Object.keys(described).sort().join(',') === 'contentHash,locator,protocol,storage,version',
            '35. FLAGSHIP — an envelope with no claim carries EXACTLY its original five keys — no publicationId/claimedPosition key, not even as null');
        assert(described.publicationId === undefined && described.claimedPosition === undefined, '36. publicationId/claimedPosition are genuinely absent, never present as null');

        // F2 — the same holds end-to-end, through a real publish/search
        // round trip.
        const network = makeNostrNetwork();
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'section-f-legacy', publishImpl: network.publishImpl });
        await publisher.publish({ contentHash: 'legacy-hash', locator: 'ar://legacy-tx', storage: 'ar' });

        const publishedEvent = network.events[0];
        const parsedContent = JSON.parse(publishedEvent.content);
        assert(Object.keys(parsedContent).sort().join(',') === 'contentHash,locator,protocol,storage,version',
            '37. FLAGSHIP — the wire content of a claim-free announcement is byte-for-byte identical to the pre-0.9.171 shape');

        const query = new NostrSnapshotDiscoveryQueryService({ queryImpl: network.queryImpl });
        const [candidate] = await query.search('section-f-legacy');
        assert(Object.keys(candidate).sort().join(',') === 'contentHash,locator,storage',
            '38. FLAGSHIP — a claim-free candidate still carries EXACTLY its original three keys, exactly as tests/SnapshotLifecycleSemanticBoundaryAudit.test.js\'s own Section C already froze');

        // F3 — supplying only one of the two fields is rejected, never
        // silently accepted with a fabricated default for the other.
        assert(describeSnapshotDiscoveryEnvelope(envelopeOf({ publicationId: 'lonely-publication' })) === null,
            '39. a publicationId with no claimedPosition fails validation — a bare identity claim with no position is not this milestone\'s own shape');
        assert(describeSnapshotDiscoveryEnvelope(envelopeOf({ claimedPosition: { x: 0, y: 0, z: 0 } })) === null,
            '40. FLAGSHIP — a claimedPosition with no publicationId fails validation — exactly the ambiguity this milestone\'s own brief named: "do not add position by itself"');

        console.log('✓ Section F: announcements naming no position claim remain valid and byte-for-byte identical to the pre-0.9.171 shape');
    }

    // ===============================================================
    // Section G — no World placement yet.
    // ===============================================================
    {
        for (const file of CLAIM_FILES) {
            const code = await codeOnlySource(file);
            assert(!code.includes('SnapshotWorldPlacement'), `41. ${file} never references application/SnapshotWorldPlacement.js — discovery carries the claim, it never consumes it`);
            assert(!code.includes('MaterializedSnapshotWorldDiscoveryBridge'), `42. ${file} never references application/MaterializedSnapshotWorldDiscoveryBridge.js`);
            assert(!code.includes('WorldDiscoverySourceRegistry'), `43. ${file} never references the World Discovery runtime registry`);
            assert(!code.includes('resolveSnapshotWorldPlacement'), `44. ${file} never calls resolveSnapshotWorldPlacement()`);
        }

        const placementCode = await codeOnlySource('application/SnapshotWorldPlacement.js');
        assert(!placementCode.includes('claimedPosition'), '45. FLAGSHIP — application/SnapshotWorldPlacement.js is untouched by this milestone: it carries no reference to claimedPosition');
        assert(!placementCode.includes('SnapshotDiscoveryEnvelope') && !placementCode.includes('NostrSnapshotDiscovery'), '46. application/SnapshotWorldPlacement.js never imports this milestone\'s own discovery files');

        const bridgeCode = await codeOnlySource('application/MaterializedSnapshotWorldDiscoveryBridge.js');
        assert(!bridgeCode.includes('claimedPosition'), '47. application/MaterializedSnapshotWorldDiscoveryBridge.js carries no reference to claimedPosition either');

        console.log('✓ Section G: discovery carries the claim without silently modifying World placement — application/SnapshotWorldPlacement.js and its registration bridge remain completely untouched');
    }

    // ===============================================================
    // Section H — no Nostr/Arweave coupling to material retrieval.
    // ===============================================================
    {
        for (const file of CLAIM_FILES) {
            const code = await codeOnlySource(file);
            assert(!code.includes('ArweaveContentStore'), `48. ${file} never imports content/ArweaveContentStore.js — a position claim is part of the discovery protocol, never material retrieval`);
            assert(!code.includes('SnapshotPlacementResolver') && !code.includes('SnapshotPlacementStoreRegistry'), `49. ${file} never references the Snapshot Placement family's own resolution/catalog machinery`);
            assert(!code.includes('DecentralizedDiscoveryEnvelope') && !code.includes('PublicationDistribution'), `50. ${file} never references the Signed Claim distribution family — a deliberately distinct contract, per core/SnapshotDiscoveryEnvelope.js's own original header`);
        }

        console.log('✓ Section H: the position claim lives entirely inside the Snapshot discovery protocol — no coupling to material retrieval, placement resolution, or the Signed Claim family');
    }

    console.log('\n✅ All Snapshot Discovery World Position Claim tests passed.');
}

run().catch((error) => {
    console.error('SnapshotDiscoveryWorldPositionClaim.test.js FAILED:', error);
    process.exitCode = 1;
});
