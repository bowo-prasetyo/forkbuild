import { BlockchainKind, isValidBlockchainKind } from '../application/BlockchainKind.js';
import { BlockchainPublicationIdentity } from '../application/BlockchainPublicationIdentity.js';
import { BitcoinAnchorPublicationRecord } from '../application/BitcoinAnchorPublicationRecord.js';

// 0.8.89 — Multi-Blockchain Publication Domain Boundary.
//
// The flagship this milestone exists to prove: a Bitcoin publication and
// a (future) Base publication that happen to share the exact same
// `contentHash` — even the exact same `chainReference` string — are
// NEVER the same publication, because `blockchain` is always part of
// their identity. Nothing in this file constructs a real Base publisher,
// signer, or broadcaster — Base has no implementation yet (see
// application/BlockchainKind.js's own header) — this file only proves
// that the shared, chain-independent identity SHAPE this milestone
// introduces already refuses to conflate two chains, before a second
// chain's own concrete implementation ever exists.
//
//   Section A: BlockchainKind — closed vocabulary, no inference
//   Section B: BlockchainPublicationIdentity — construction, validation,
//              immutability, toJSON()/fromJSON() round trip
//   Section C: BitcoinAnchorPublicationRecord#toBlockchainPublicationIdentity() —
//              the one, additive projection; unchanged toJSON() shape
//   Section D: FLAGSHIP — same contentHash, same chainReference string,
//              different blockchain: never the same publication

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const FORBIDDEN_KEYS = [
    'status', 'confidence', 'health', 'trusted', 'valid', 'canonical', 'reliable',
    'risk', 'severity', 'cause', 'verdict', 'score', 'confirmed', 'safe', 'healthy',
    'better', 'newer', 'recommended'
];
function assertNeverScored(obj, path) {
    if (!obj || typeof obj !== 'object') return;
    for (const [key, value] of Object.entries(obj)) {
        const lower = key.toLowerCase();
        assert(!FORBIDDEN_KEYS.includes(lower), `${path}.${key} must never exist — an identity establishes what/where, it does not score it`);
        if (value && typeof value === 'object' && !(value instanceof Date)) {
            if (Array.isArray(value)) value.forEach((item, i) => assertNeverScored(item, `${path}.${key}[${i}]`));
            else assertNeverScored(value, `${path}.${key}`);
        }
    }
}

const SHARED_CONTENT_HASH = 'e'.repeat(64);
const SHARED_REFERENCE = 'f'.repeat(64);

async function run() {
    // ---------------------------------------------------------------
    // Section A — BlockchainKind: closed vocabulary, no inference.
    // ---------------------------------------------------------------
    {
        assert(BlockchainKind.BITCOIN === 'bitcoin', '1. BITCOIN is the expected constant');
        assert(BlockchainKind.BASE === 'base', '2. BASE is named, reserved, and unimplemented');
        assert(isValidBlockchainKind('bitcoin'), '3. bitcoin is a known blockchain kind');
        assert(isValidBlockchainKind('base'), '4. base is a known blockchain kind (reserved)');
        assert(!isValidBlockchainKind('ethereum'), '5. an unlisted chain name is never silently accepted');
        assert(!isValidBlockchainKind(''), '6. an empty string is never a valid blockchain kind');
        assert(!isValidBlockchainKind(null), '7. null is never a valid blockchain kind');
        assert(Object.isFrozen(BlockchainKind), '8. BlockchainKind is frozen — no runtime addition of a new chain');
    }
    console.log('✓ Section A: BlockchainKind — closed vocabulary, no inference');

    // ---------------------------------------------------------------
    // Section B — BlockchainPublicationIdentity: construction,
    // validation, immutability, toJSON()/fromJSON().
    // ---------------------------------------------------------------
    {
        const createdAt = new Date('2026-08-01T00:00:00.000Z');
        const identity = new BlockchainPublicationIdentity({
            blockchain: BlockchainKind.BITCOIN,
            contentHash: SHARED_CONTENT_HASH,
            chainReference: SHARED_REFERENCE,
            createdAt
        });
        assert(identity.blockchain === BlockchainKind.BITCOIN, '9. blockchain is exposed unchanged');
        assert(identity.contentHash === SHARED_CONTENT_HASH, '10. contentHash is exposed unchanged');
        assert(identity.chainReference === SHARED_REFERENCE, '11. chainReference is exposed unchanged');
        assert(identity.createdAt.getTime() === createdAt.getTime(), '12. createdAt is exposed unchanged');
        assert(Object.isFrozen(identity), '13. an identity is frozen');

        for (const missing of ['blockchain', 'contentHash', 'chainReference']) {
            const fields = { blockchain: BlockchainKind.BITCOIN, contentHash: 'x', chainReference: 'y', createdAt };
            delete fields[missing];
            let threw = false;
            try { new BlockchainPublicationIdentity(fields); } catch (error) { threw = true; }
            assert(threw, `14. missing ${missing} throws`);
        }

        let threwForUnknownChain = false;
        try {
            new BlockchainPublicationIdentity({ blockchain: 'ethereum', contentHash: 'x', chainReference: 'y', createdAt });
        } catch (error) { threwForUnknownChain = true; }
        assert(threwForUnknownChain, '15. an unknown blockchain value throws — never silently accepted as a new chain');

        let threwForBadDate = false;
        try {
            new BlockchainPublicationIdentity({ blockchain: BlockchainKind.BITCOIN, contentHash: 'x', chainReference: 'y', createdAt: 'not-a-date' });
        } catch (error) { threwForBadDate = true; }
        assert(threwForBadDate, '16. an invalid createdAt throws');

        const json = identity.toJSON();
        assert(json.blockchain === BlockchainKind.BITCOIN && json.contentHash === SHARED_CONTENT_HASH
            && json.chainReference === SHARED_REFERENCE && json.createdAt === createdAt.toISOString(),
            '17. toJSON() carries every field through unchanged');
        const restored = BlockchainPublicationIdentity.fromJSON(json);
        assert(restored.sameAs(identity) && identity.sameAs(restored), '18. fromJSON()/toJSON() round-trips to an identity that sameAs() itself');
        assert(BlockchainPublicationIdentity.fromJSON(null) === null, '19. fromJSON(null) returns null rather than throwing');

        assertNeverScored(json, 'identity.toJSON()');
    }
    console.log('✓ Section B: BlockchainPublicationIdentity — construction, validation, immutability, JSON round trip');

    // ---------------------------------------------------------------
    // Section C — BitcoinAnchorPublicationRecord#toBlockchainPublicationIdentity():
    // additive projection, unchanged toJSON() shape.
    // ---------------------------------------------------------------
    {
        const createdAt = new Date('2026-08-02T00:00:00.000Z');
        const record = new BitcoinAnchorPublicationRecord({
            anchorId: 'anchor-A', contentHash: SHARED_CONTENT_HASH, txid: SHARED_REFERENCE, network: 'mainnet', createdAt
        });
        assert(record.blockchain === BlockchainKind.BITCOIN, '20. a BitcoinAnchorPublicationRecord always names blockchain=bitcoin');
        const projected = record.toBlockchainPublicationIdentity();
        assert(projected instanceof BlockchainPublicationIdentity, '21. the projection is a genuine BlockchainPublicationIdentity');
        assert(projected.blockchain === BlockchainKind.BITCOIN, '22. the projection carries blockchain=bitcoin');
        assert(projected.contentHash === record.contentHash, '23. the projection carries contentHash through unchanged');
        assert(projected.chainReference === record.txid, '24. the projection maps txid onto chainReference');
        assert(projected.createdAt.getTime() === record.createdAt.getTime(), '25. the projection carries createdAt through unchanged');

        // The record's own persisted shape is completely unaffected —
        // no migration, no new field, byte-identical to the pre-0.8.89
        // schema.
        const recordJson = record.toJSON();
        assert(Object.keys(recordJson).sort().join(',') === 'anchorId,contentHash,createdAt,network,txid'.split(',').sort().join(','),
            '26. toJSON() gains no new field — blockchain stays a computed getter, never persisted data');
        assert(recordJson.blockchain === undefined, '27. blockchain never appears in the persisted JSON shape');
    }
    console.log('✓ Section C: BitcoinAnchorPublicationRecord#toBlockchainPublicationIdentity() — additive, unchanged persisted shape');

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP: same contentHash, same chainReference
    // string, different blockchain — never the same publication.
    // ---------------------------------------------------------------
    {
        const createdAt = new Date('2026-08-03T00:00:00.000Z');

        // Publication A: a real Bitcoin publication, projected from a
        // real BitcoinAnchorPublicationRecord.
        const bitcoinRecord = new BitcoinAnchorPublicationRecord({
            anchorId: 'anchor-A', contentHash: SHARED_CONTENT_HASH, txid: SHARED_REFERENCE, network: 'mainnet', createdAt
        });
        const bitcoinIdentity = bitcoinRecord.toBlockchainPublicationIdentity();

        // Publication B: a Base publication — simulated directly, since
        // no Base record class exists yet (0.8.89 builds none). Deliber-
        // ately given the EXACT same contentHash AND the EXACT same
        // chainReference string a Bitcoin txid could plausibly be, to
        // prove blockchain alone is what keeps these apart.
        const baseIdentity = new BlockchainPublicationIdentity({
            blockchain: BlockchainKind.BASE,
            contentHash: SHARED_CONTENT_HASH,
            chainReference: SHARED_REFERENCE,
            createdAt
        });

        assert(bitcoinIdentity.contentHash === baseIdentity.contentHash, '28. both identities genuinely share the same contentHash');
        assert(bitcoinIdentity.chainReference === baseIdentity.chainReference, '29. both identities genuinely share the same chainReference string');
        assert(bitcoinIdentity.blockchain !== baseIdentity.blockchain, '30. the two identities name different blockchains');
        assert(!bitcoinIdentity.sameAs(baseIdentity), '31. FLAGSHIP: A !== B — a Bitcoin publication is never the same publication as a same-contentHash, same-chainReference Base publication');
        assert(!baseIdentity.sameAs(bitcoinIdentity), '32. sameAs() is symmetric: B !== A holds in the reverse direction too');

        // Two genuinely distinct Bitcoin publications (different txid)
        // sharing the same contentHash remain distinct too — the
        // pre-existing 0.8.78/0.8.80 invariant, now expressed through
        // this shared shape.
        const secondBitcoinRecord = new BitcoinAnchorPublicationRecord({
            anchorId: 'anchor-B', contentHash: SHARED_CONTENT_HASH, txid: 'a'.repeat(64), network: 'mainnet', createdAt
        });
        assert(!bitcoinIdentity.sameAs(secondBitcoinRecord.toBlockchainPublicationIdentity()),
            '33. two same-chain, same-contentHash, different-chainReference publications remain distinct');

        // Only true identity — same blockchain AND same chainReference —
        // is ever reported as the same publication.
        const bitcoinIdentityAgain = bitcoinRecord.toBlockchainPublicationIdentity();
        assert(bitcoinIdentity.sameAs(bitcoinIdentityAgain), '34. the same record, projected twice, produces two identities that sameAs() each other');

        // Neither identity ever carries the other's evidence, or any
        // notion of one "winning" over the other — there is no merge,
        // no convergence, no verdict field anywhere in either identity.
        assertNeverScored(bitcoinIdentity.toJSON(), 'bitcoinIdentity');
        assertNeverScored(baseIdentity.toJSON(), 'baseIdentity');
        assert(JSON.stringify(bitcoinIdentity.toJSON()) !== JSON.stringify(baseIdentity.toJSON()),
            '35. the two identities never serialize identically, despite sharing contentHash and chainReference');
    }
    console.log('✓ Section D: FLAGSHIP — same contentHash, same chainReference, different blockchain: never the same publication');

    console.log('\nAll BlockchainPublicationIdentity tests passed.');
}

run().catch((error) => {
    console.error('BlockchainPublicationIdentity.test.js FAILED:', error);
    process.exitCode = 1;
});
