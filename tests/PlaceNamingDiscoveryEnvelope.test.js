import {
    describePlaceNamingDiscoveryEnvelope,
    parsePlaceNamingDiscoveryEnvelope,
    buildPlaceNamingDiscoveryEnvelope,
    derivePlaceNamingDiscoveryTag,
    PLACE_NAMING_DISCOVERY_ENVELOPE_PROTOCOL,
    PLACE_NAMING_DISCOVERY_ENVELOPE_VERSION
} from '../core/PlaceNamingDiscoveryEnvelope.js';
import { PlaceNamingClaim } from '../core/PlaceNamingClaim.js';
import { Signature } from '../core/Signature.js';
import { describeSnapshotDiscoveryEnvelope } from '../core/SnapshotDiscoveryEnvelope.js';

// 0.9.253 — Place Naming Discovery Boundary.
// See docs/Roadmap.md, "0.9.253 — Place Naming Discovery Boundary."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch { threw = true; }
    assert(threw, message);
}

function signatureOf(overrides = {}) {
    return {
        algorithm: 'ed25519',
        signer: 'did:key:zAlice',
        signature: 'sig-abc123',
        signedHash: 'hash-abc123',
        domain: 'forkbuild.place-naming-claim',
        ...overrides
    };
}

function claimJSONOf(overrides = {}) {
    return {
        id: 'claim-1',
        worldId: 'world-1',
        regionId: 'region-1',
        name: 'Old Oak Crossing',
        authorIdentityId: 'did:key:zAlice',
        createdAt: '2026-01-01T00:00:00.000Z',
        signature: signatureOf(),
        ...overrides
    };
}

function envelopeOf(overrides = {}) {
    return {
        protocol: 'forkbuild-place-naming-discovery',
        version: 1,
        worldId: 'world-1',
        regionId: 'region-1',
        claim: claimJSONOf(),
        ...overrides
    };
}

// ---------------------------------------------------------------------
// 1. Flagship: a well-formed envelope is describable, and the same shape
//    survives round-tripping through JSON as a raw payload string.
// ---------------------------------------------------------------------
{
    const envelope = describePlaceNamingDiscoveryEnvelope(envelopeOf());
    assert(envelope !== null, '1. FLAGSHIP — a well-formed envelope is describable');
    assert(envelope.protocol === 'forkbuild-place-naming-discovery', '2. FLAGSHIP — protocol is carried verbatim');
    assert(envelope.version === 1, '3. FLAGSHIP — version is carried verbatim');
    assert(envelope.worldId === 'world-1', '4. FLAGSHIP — worldId is carried verbatim');
    assert(envelope.regionId === 'region-1', '5. FLAGSHIP — regionId is carried verbatim');
    assert(envelope.claim.name === 'Old Oak Crossing', '6. FLAGSHIP — the embedded claim is carried through');
    assert(envelope.claim.signature.signer === 'did:key:zAlice', '7. FLAGSHIP — the embedded claim carries its own signature');
    assert(Object.isFrozen(envelope), '8. FLAGSHIP — the envelope is frozen');
    assert(Object.isFrozen(envelope.claim), '9. FLAGSHIP — the embedded claim is frozen');
    assert(Object.isFrozen(envelope.claim.signature), '10. FLAGSHIP — the embedded signature is frozen');

    const raw = JSON.stringify(envelopeOf());
    const parsed = parsePlaceNamingDiscoveryEnvelope(raw);
    assert(parsed !== null, '11. FLAGSHIP — a JSON string payload parses to an envelope');
    assert(parsed.claim.id === 'claim-1', '12. FLAGSHIP — a parsed envelope carries the same claim as a directly-described one');

    const parsedFromObject = parsePlaceNamingDiscoveryEnvelope(envelopeOf());
    assert(parsedFromObject !== null, '13. FLAGSHIP — an already-parsed plain object payload also parses');

    console.log('✓ Flagship: a well-formed envelope describes, and parses identically from a string or an object payload');
}

// ---------------------------------------------------------------------
// 2. protocol/version are an exact-match namespace gate, distinct from
//    the Snapshot Discovery Envelope's own contract.
// ---------------------------------------------------------------------
{
    assert(PLACE_NAMING_DISCOVERY_ENVELOPE_PROTOCOL === 'forkbuild-place-naming-discovery', 'the exported protocol constant matches what a well-formed envelope carries');
    assert(PLACE_NAMING_DISCOVERY_ENVELOPE_VERSION === 1, 'the exported version constant matches what a well-formed envelope carries');

    assert(describePlaceNamingDiscoveryEnvelope(envelopeOf({ protocol: 'some-other-protocol' })) === null, 'an unrecognized protocol degrades to null');
    assert(describePlaceNamingDiscoveryEnvelope(envelopeOf({ protocol: 'forkbuild-snapshot-discovery' })) === null, 'the Snapshot Discovery Envelope\'s own protocol string is explicitly NOT accepted here — the two envelope contracts are deliberately distinct');
    assert(describePlaceNamingDiscoveryEnvelope(envelopeOf({ version: 2 })) === null, 'an unrecognized version degrades to null');
    assert(describePlaceNamingDiscoveryEnvelope(envelopeOf({ version: '1' })) === null, 'a version of the wrong type (string, not number) degrades to null');

    const placeNamingEnvelope = envelopeOf();
    assert(describeSnapshotDiscoveryEnvelope(placeNamingEnvelope) === null, 'a well-formed Place Naming Discovery Envelope fails the Snapshot Discovery Envelope\'s own validation — it carries no contentHash/locator/storage');

    console.log('✓ protocol/version form an exact-match namespace gate, distinct from the Snapshot Discovery Envelope\'s own contract');
}

// ---------------------------------------------------------------------
// 3. worldId/regionId are required, non-empty strings, and MUST agree
//    with the embedded claim's own copies.
// ---------------------------------------------------------------------
{
    assert(describePlaceNamingDiscoveryEnvelope(envelopeOf({ worldId: undefined })) === null, 'a missing worldId degrades to null');
    assert(describePlaceNamingDiscoveryEnvelope(envelopeOf({ worldId: '' })) === null, 'an empty worldId degrades to null');
    assert(describePlaceNamingDiscoveryEnvelope(envelopeOf({ regionId: undefined })) === null, 'a missing regionId degrades to null');
    assert(describePlaceNamingDiscoveryEnvelope(envelopeOf({ regionId: '' })) === null, 'an empty regionId degrades to null');

    assert(describePlaceNamingDiscoveryEnvelope(envelopeOf({ worldId: 'world-2' })) === null, 'an envelope-level worldId that disagrees with the embedded claim\'s own worldId degrades to null');
    assert(describePlaceNamingDiscoveryEnvelope(envelopeOf({ regionId: 'region-2' })) === null, 'an envelope-level regionId that disagrees with the embedded claim\'s own regionId degrades to null');

    console.log('✓ worldId/regionId are required and must agree with the embedded claim\'s own copies');
}

// ---------------------------------------------------------------------
// 4. The embedded claim is validated field-by-field, including its own
//    signature's shape.
// ---------------------------------------------------------------------
{
    assert(describePlaceNamingDiscoveryEnvelope(envelopeOf({ claim: undefined })) === null, 'a missing claim degrades to null');
    assert(describePlaceNamingDiscoveryEnvelope(envelopeOf({ claim: 'not an object' })) === null, 'a non-object claim degrades to null');

    for (const field of ['id', 'worldId', 'regionId', 'name', 'authorIdentityId', 'createdAt']) {
        assert(
            describePlaceNamingDiscoveryEnvelope(envelopeOf({ claim: claimJSONOf({ [field]: undefined }) })) === null,
            `a claim missing its own ${field} degrades to null`
        );
        assert(
            describePlaceNamingDiscoveryEnvelope(envelopeOf({ claim: claimJSONOf({ [field]: '' }) })) === null,
            `a claim with an empty ${field} degrades to null`
        );
    }

    assert(describePlaceNamingDiscoveryEnvelope(envelopeOf({ claim: claimJSONOf({ signature: undefined }) })) === null, 'a claim with no signature degrades to null');
    assert(describePlaceNamingDiscoveryEnvelope(envelopeOf({ claim: claimJSONOf({ signature: null }) })) === null, 'a claim with a null signature degrades to null');
    for (const field of ['algorithm', 'signer', 'signature', 'signedHash', 'domain']) {
        assert(
            describePlaceNamingDiscoveryEnvelope(envelopeOf({ claim: claimJSONOf({ signature: signatureOf({ [field]: undefined }) }) })) === null,
            `a claim signature missing its own ${field} degrades to null`
        );
    }

    console.log('✓ the embedded claim, and its own signature, are validated field by field');
}

// ---------------------------------------------------------------------
// 5. Malformed candidates/payloads degrade to null, never throw.
// ---------------------------------------------------------------------
{
    assert(describePlaceNamingDiscoveryEnvelope(null) === null, 'a null candidate degrades to null');
    assert(describePlaceNamingDiscoveryEnvelope(undefined) === null, 'an undefined candidate degrades to null');
    assert(describePlaceNamingDiscoveryEnvelope('not an object') === null, 'a string candidate degrades to null');
    assert(describePlaceNamingDiscoveryEnvelope([]) === null, 'an array candidate degrades to null');

    assert(parsePlaceNamingDiscoveryEnvelope(null) === null, 'a null raw payload degrades to null');
    assert(parsePlaceNamingDiscoveryEnvelope(42) === null, 'a non-string, non-object raw payload degrades to null');
    assert(parsePlaceNamingDiscoveryEnvelope('') === null, 'an empty string raw payload degrades to null');
    assert(parsePlaceNamingDiscoveryEnvelope('{not valid json') === null, 'unparseable JSON degrades to null');
    assert(parsePlaceNamingDiscoveryEnvelope('[]') === null, 'a JSON array (not a plain object) degrades to null');

    console.log('✓ every malformed candidate/payload degrades to null, never throws');
}

// ---------------------------------------------------------------------
// 6. buildPlaceNamingDiscoveryEnvelope() — the inverse builder, requiring
//    a real, SIGNED PlaceNamingClaim instance.
// ---------------------------------------------------------------------
{
    expectThrows(() => buildPlaceNamingDiscoveryEnvelope(null), 'building from null throws');
    expectThrows(() => buildPlaceNamingDiscoveryEnvelope({ worldId: 'world-1' }), 'building from a plain object (not a PlaceNamingClaim instance) throws');

    const unsignedClaim = new PlaceNamingClaim({
        worldId: 'world-1',
        regionId: 'region-1',
        name: 'Old Oak Crossing',
        authorIdentityId: 'did:key:zAlice'
    });
    expectThrows(() => buildPlaceNamingDiscoveryEnvelope(unsignedClaim), 'building from an unsigned claim throws');

    const signature = new Signature({
        algorithm: 'ed25519',
        signer: 'did:key:zAlice',
        signature: 'sig-abc123',
        signedHash: 'hash-abc123',
        domain: 'forkbuild.place-naming-claim'
    });
    const signedClaim = unsignedClaim.withSignature(signature);
    const built = buildPlaceNamingDiscoveryEnvelope(signedClaim);
    assert(built.protocol === 'forkbuild-place-naming-discovery', 'a built envelope carries the correct protocol');
    assert(built.worldId === 'world-1' && built.regionId === 'region-1', 'a built envelope carries the claim\'s own worldId/regionId at its top level');
    assert(built.claim.name === 'Old Oak Crossing', 'a built envelope embeds the claim\'s own JSON');

    const described = describePlaceNamingDiscoveryEnvelope(built);
    assert(described !== null, 'a built envelope is itself describable — build() and describe() agree on one shape');

    console.log('✓ buildPlaceNamingDiscoveryEnvelope() produces a describable envelope, and refuses an unsigned or non-instance claim');
}

// ---------------------------------------------------------------------
// 7. derivePlaceNamingDiscoveryTag() — a pure, deterministic routing key.
// ---------------------------------------------------------------------
{
    const tag = derivePlaceNamingDiscoveryTag('world-1', 'region-1');
    assert(typeof tag === 'string' && tag.length > 0, 'a tag is a non-empty string');
    assert(tag === derivePlaceNamingDiscoveryTag('world-1', 'region-1'), 'the same worldId/regionId always derives the identical tag');
    assert(tag !== derivePlaceNamingDiscoveryTag('world-1', 'region-2'), 'a different regionId derives a different tag');
    assert(tag !== derivePlaceNamingDiscoveryTag('world-2', 'region-1'), 'a different worldId derives a different tag');

    expectThrows(() => derivePlaceNamingDiscoveryTag(undefined, 'region-1'), 'a missing worldId throws');
    expectThrows(() => derivePlaceNamingDiscoveryTag('world-1', ''), 'an empty regionId throws');

    console.log('✓ derivePlaceNamingDiscoveryTag() is pure, deterministic, and distinguishes worldId/regionId pairs');
}

// ---------------------------------------------------------------------
// 8. Every returned value is frozen; input is never mutated.
// ---------------------------------------------------------------------
{
    const candidate = envelopeOf();
    const described = describePlaceNamingDiscoveryEnvelope(candidate);
    assert(Object.isFrozen(described), 'describe() result is frozen');
    assert(described !== candidate, 'described is a fresh object, never the candidate itself');
    assert(candidate.worldId === 'world-1', 'the original candidate object is never mutated');
    assert(candidate.claim.name === 'Old Oak Crossing', 'the original candidate\'s nested claim is never mutated');

    console.log('✓ returned envelopes are frozen; nothing passed in is ever mutated');
}

console.log('\nAll PlaceNamingDiscoveryEnvelope tests passed.');
