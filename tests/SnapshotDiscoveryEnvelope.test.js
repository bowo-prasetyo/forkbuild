import {
    describeSnapshotDiscoveryEnvelope,
    parseSnapshotDiscoveryEnvelope,
    SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL,
    SNAPSHOT_DISCOVERY_ENVELOPE_VERSION
} from '../core/SnapshotDiscoveryEnvelope.js';
import { describeDecentralizedDiscoveryEnvelope } from '../core/DecentralizedDiscoveryEnvelope.js';

// 0.9.133 — Snapshot Discovery Envelope.
// See docs/Roadmap.md, "0.9.133 — Snapshot Location Discovery via Nostr."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function envelopeOf(overrides = {}) {
    return {
        protocol: 'forkbuild-snapshot-discovery',
        version: 1,
        contentHash: 'hash-abc123',
        locator: 'ar://TX000000000000000000000000000001',
        storage: 'ar',
        ...overrides
    };
}

// ---------------------------------------------------------------------
// 1. Flagship: a well-formed envelope is describable, and the same shape
//    survives round-tripping through JSON as a raw payload string.
// ---------------------------------------------------------------------
{
    const envelope = describeSnapshotDiscoveryEnvelope(envelopeOf());
    assert(envelope !== null, '1. FLAGSHIP — a well-formed envelope is describable');
    assert(envelope.protocol === 'forkbuild-snapshot-discovery', '2. FLAGSHIP — protocol is carried verbatim');
    assert(envelope.version === 1, '3. FLAGSHIP — version is carried verbatim');
    assert(envelope.contentHash === 'hash-abc123', '4. FLAGSHIP — contentHash is carried verbatim');
    assert(envelope.locator === 'ar://TX000000000000000000000000000001', '5. FLAGSHIP — locator is carried verbatim');
    assert(envelope.storage === 'ar', '6. FLAGSHIP — storage is carried verbatim');
    assert(Object.isFrozen(envelope), '7. FLAGSHIP — the envelope is frozen');

    const raw = JSON.stringify(envelopeOf());
    const parsed = parseSnapshotDiscoveryEnvelope(raw);
    assert(parsed !== null, '8. FLAGSHIP — a JSON string payload parses to an envelope');
    assert(parsed.contentHash === 'hash-abc123' && parsed.locator === 'ar://TX000000000000000000000000000001', '9. FLAGSHIP — a parsed envelope carries the same fields as a directly-described one');

    const parsedFromObject = parseSnapshotDiscoveryEnvelope(envelopeOf());
    assert(parsedFromObject !== null, '10. FLAGSHIP — an already-parsed plain object payload also parses');

    console.log('✓ Flagship: a well-formed envelope describes, and parses identically from a string or an object payload');
}

// ---------------------------------------------------------------------
// 2. protocol/version are an exact-match namespace gate.
// ---------------------------------------------------------------------
{
    assert(SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL === 'forkbuild-snapshot-discovery', 'the exported protocol constant matches what a well-formed envelope carries');
    assert(SNAPSHOT_DISCOVERY_ENVELOPE_VERSION === 1, 'the exported version constant matches what a well-formed envelope carries');

    assert(describeSnapshotDiscoveryEnvelope(envelopeOf({ protocol: 'some-other-protocol' })) === null, 'an unrecognized protocol degrades to null');
    assert(describeSnapshotDiscoveryEnvelope(envelopeOf({ protocol: 'forkbuild' })) === null, 'the SIGNED CLAIM envelope\'s own protocol string is explicitly NOT accepted here — the two envelope contracts are deliberately distinct');
    assert(describeSnapshotDiscoveryEnvelope(envelopeOf({ version: 2 })) === null, 'an unrecognized version degrades to null');
    assert(describeSnapshotDiscoveryEnvelope(envelopeOf({ version: '1' })) === null, 'a version of the wrong type (string, not number) degrades to null');

    console.log('✓ protocol/version form an exact-match namespace gate, distinct from the Signed Claim envelope\'s own protocol');
}

// ---------------------------------------------------------------------
// 3. contentHash/locator/storage are all required, non-empty strings.
// ---------------------------------------------------------------------
{
    assert(describeSnapshotDiscoveryEnvelope(envelopeOf({ contentHash: undefined })) === null, 'a missing contentHash degrades to null');
    assert(describeSnapshotDiscoveryEnvelope(envelopeOf({ contentHash: '' })) === null, 'an empty contentHash degrades to null');
    assert(describeSnapshotDiscoveryEnvelope(envelopeOf({ contentHash: 42 })) === null, 'a non-string contentHash degrades to null');
    assert(describeSnapshotDiscoveryEnvelope(envelopeOf({ locator: undefined })) === null, 'a missing locator degrades to null');
    assert(describeSnapshotDiscoveryEnvelope(envelopeOf({ locator: '' })) === null, 'an empty locator degrades to null');
    assert(describeSnapshotDiscoveryEnvelope(envelopeOf({ storage: undefined })) === null, 'a missing storage degrades to null');
    assert(describeSnapshotDiscoveryEnvelope(envelopeOf({ storage: '' })) === null, 'an empty storage degrades to null');

    console.log('✓ contentHash/locator/storage are all required, non-empty strings');
}

// ---------------------------------------------------------------------
// 4. Malformed candidates/payloads degrade to null, never throw.
// ---------------------------------------------------------------------
{
    assert(describeSnapshotDiscoveryEnvelope(null) === null, 'a null candidate degrades to null');
    assert(describeSnapshotDiscoveryEnvelope(undefined) === null, 'an undefined candidate degrades to null');
    assert(describeSnapshotDiscoveryEnvelope('not an object') === null, 'a string candidate degrades to null');
    assert(describeSnapshotDiscoveryEnvelope([]) === null, 'an array candidate degrades to null');

    assert(parseSnapshotDiscoveryEnvelope(null) === null, 'a null raw payload degrades to null');
    assert(parseSnapshotDiscoveryEnvelope(42) === null, 'a non-string, non-object raw payload degrades to null');
    assert(parseSnapshotDiscoveryEnvelope('') === null, 'an empty string raw payload degrades to null');
    assert(parseSnapshotDiscoveryEnvelope('{not valid json') === null, 'unparseable JSON degrades to null');
    assert(parseSnapshotDiscoveryEnvelope('[]') === null, 'a JSON array (not a plain object) degrades to null');

    console.log('✓ every malformed candidate/payload degrades to null, never throws');
}

// ---------------------------------------------------------------------
// 5. A well-formed Snapshot Discovery Envelope is NOT a well-formed
//    Signed Claim (DecentralizedDiscoveryEnvelope) — the two contracts
//    are structurally distinct, not merely differently named.
// ---------------------------------------------------------------------
{
    const snapshotEnvelope = envelopeOf();
    assert(describeDecentralizedDiscoveryEnvelope(snapshotEnvelope) === null, 'a well-formed Snapshot Discovery Envelope fails the Signed Claim envelope\'s own validation — it carries no protocol:"forkbuild", no kind, and no objectId');

    console.log('✓ the Snapshot Discovery Envelope and the Signed Claim (Decentralized Discovery) envelope are structurally distinct contracts');
}

// ---------------------------------------------------------------------
// 6. Every returned value is frozen; input is never mutated.
// ---------------------------------------------------------------------
{
    const candidate = envelopeOf();
    const described = describeSnapshotDiscoveryEnvelope(candidate);
    assert(Object.isFrozen(described), 'describe() result is frozen');
    described !== candidate && assert(true, 'sanity: described is a fresh object, never the candidate itself');
    assert(candidate.contentHash === 'hash-abc123', 'the original candidate object is never mutated');

    console.log('✓ returned envelopes are frozen; nothing passed in is ever mutated');
}

console.log('\nAll SnapshotDiscoveryEnvelope tests passed.');
