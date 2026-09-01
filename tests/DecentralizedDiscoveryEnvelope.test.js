import { readFile } from 'node:fs/promises';
import {
    describeDecentralizedDiscoveryEnvelope,
    parseDecentralizedDiscoveryEnvelope,
    DECENTRALIZED_DISCOVERY_ENVELOPE_PROTOCOL,
    DECENTRALIZED_DISCOVERY_ENVELOPE_VERSION
} from '../core/DecentralizedDiscoveryEnvelope.js';

// 0.9.30 — Decentralized Discovery Envelope.
//
// See docs/Roadmap.md, "0.9.30 — Decentralized Discovery Envelope," for
// the full milestone story.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function envelopeOf(overrides = {}) {
    return {
        protocol: 'forkbuild',
        version: 1,
        kind: 'PUBLICATION',
        objectId: 'pub-1',
        uri: 'ar://ABC123',
        ...overrides
    };
}

// ---------------------------------------------------------------------
// 1. Flagship: a well-formed envelope is describable, and the same shape
//    survives round-tripping through JSON as a raw payload string.
// ---------------------------------------------------------------------
{
    const envelope = describeDecentralizedDiscoveryEnvelope(envelopeOf());
    assert(envelope !== null, '1. FLAGSHIP — a well-formed envelope is describable');
    assert(envelope.protocol === 'forkbuild', '2. FLAGSHIP — protocol is carried verbatim');
    assert(envelope.version === 1, '3. FLAGSHIP — version is carried verbatim');
    assert(envelope.kind === 'PUBLICATION' && envelope.objectId === 'pub-1', '4. FLAGSHIP — the material identity is carried verbatim');
    assert(envelope.uri === 'ar://ABC123', '5. FLAGSHIP — uri is carried verbatim');
    assert(Object.isFrozen(envelope), '6. FLAGSHIP — the envelope is frozen');

    const raw = JSON.stringify(envelopeOf());
    const parsed = parseDecentralizedDiscoveryEnvelope(raw);
    assert(parsed !== null, '7. FLAGSHIP — a JSON string payload parses to an envelope');
    assert(parsed.objectId === 'pub-1' && parsed.uri === 'ar://ABC123', '8. FLAGSHIP — a parsed envelope carries the same fields as a directly-described one');

    const parsedFromObject = parseDecentralizedDiscoveryEnvelope(envelopeOf());
    assert(parsedFromObject !== null, '9. FLAGSHIP — an already-parsed plain object payload also parses');

    console.log('✓ Flagship: a well-formed envelope describes, and parses identically from a string or an object payload');
}

// ---------------------------------------------------------------------
// 2. protocol/version are an exact-match namespace gate.
// ---------------------------------------------------------------------
{
    assert(DECENTRALIZED_DISCOVERY_ENVELOPE_PROTOCOL === 'forkbuild', 'the exported protocol constant matches what a well-formed envelope carries');
    assert(DECENTRALIZED_DISCOVERY_ENVELOPE_VERSION === 1, 'the exported version constant matches what a well-formed envelope carries');

    assert(describeDecentralizedDiscoveryEnvelope(envelopeOf({ protocol: 'some-other-protocol' })) === null, 'an unrecognized protocol degrades to null');
    assert(describeDecentralizedDiscoveryEnvelope(envelopeOf({ protocol: 'ForkBuild' })) === null, 'protocol matching is exact, not case-insensitive');
    assert(describeDecentralizedDiscoveryEnvelope(envelopeOf({ protocol: '' })) === null, 'an empty protocol degrades to null');
    assert(describeDecentralizedDiscoveryEnvelope(envelopeOf({ protocol: undefined })) === null, 'a missing protocol degrades to null');

    assert(describeDecentralizedDiscoveryEnvelope(envelopeOf({ version: 2 })) === null, 'an unrecognized version degrades to null — no partial understanding of a future shape');
    assert(describeDecentralizedDiscoveryEnvelope(envelopeOf({ version: 0 })) === null, 'version 0 degrades to null');
    assert(describeDecentralizedDiscoveryEnvelope(envelopeOf({ version: '1' })) === null, 'a stringified version number degrades to null — exact type match required');
    assert(describeDecentralizedDiscoveryEnvelope(envelopeOf({ version: undefined })) === null, 'a missing version degrades to null');

    console.log('✓ protocol/version are an exact-match namespace gate, never a partial or fuzzy match');
}

// ---------------------------------------------------------------------
// 3. kind/objectId/uri validation, and malformed input in general
//    degrades to null, never throws.
// ---------------------------------------------------------------------
{
    assert(describeDecentralizedDiscoveryEnvelope() === null, 'no argument at all degrades to null');
    assert(describeDecentralizedDiscoveryEnvelope(null) === null, 'a null candidate degrades to null');
    assert(describeDecentralizedDiscoveryEnvelope({}) === null, 'no fields at all degrades to null');
    assert(describeDecentralizedDiscoveryEnvelope([]) === null, 'an array candidate degrades to null, never treated as a plain object');
    assert(describeDecentralizedDiscoveryEnvelope('not-an-object') === null, 'a non-object candidate degrades to null');

    assert(describeDecentralizedDiscoveryEnvelope(envelopeOf({ kind: 'AVATAR' })) !== null, 'AVATAR is a recognized kind');
    assert(describeDecentralizedDiscoveryEnvelope(envelopeOf({ kind: 'AVATAR_PROFILE' })) === null, 'an unrecognized kind degrades to null');
    assert(describeDecentralizedDiscoveryEnvelope(envelopeOf({ kind: undefined })) === null, 'a missing kind degrades to null');

    assert(describeDecentralizedDiscoveryEnvelope(envelopeOf({ objectId: '' })) === null, 'an empty objectId degrades to null');
    assert(describeDecentralizedDiscoveryEnvelope(envelopeOf({ objectId: 42 })) === null, 'a non-string objectId degrades to null');
    assert(describeDecentralizedDiscoveryEnvelope(envelopeOf({ objectId: undefined })) === null, 'a missing objectId degrades to null');

    assert(describeDecentralizedDiscoveryEnvelope(envelopeOf({ uri: '' })) === null, 'an empty uri degrades to null');
    assert(describeDecentralizedDiscoveryEnvelope(envelopeOf({ uri: undefined })) === null, 'a missing uri degrades to null');

    console.log('✓ kind/objectId/uri are validated; malformed input degrades to null, never throws');
}

// ---------------------------------------------------------------------
// 4. parseDecentralizedDiscoveryEnvelope never throws on a malformed raw
//    payload, whatever shape it arrives in.
// ---------------------------------------------------------------------
{
    assert(parseDecentralizedDiscoveryEnvelope() === null, 'no argument at all degrades to null');
    assert(parseDecentralizedDiscoveryEnvelope(null) === null, 'a null payload degrades to null');
    assert(parseDecentralizedDiscoveryEnvelope(42) === null, 'a number payload degrades to null');
    assert(parseDecentralizedDiscoveryEnvelope([]) === null, 'an array payload degrades to null');
    assert(parseDecentralizedDiscoveryEnvelope('') === null, 'an empty string payload degrades to null');
    assert(parseDecentralizedDiscoveryEnvelope('not json at all {{{') === null, 'a string that fails to parse as JSON degrades to null');
    assert(parseDecentralizedDiscoveryEnvelope('"just a json string"') === null, 'valid JSON that is not an object degrades to null');
    assert(parseDecentralizedDiscoveryEnvelope('[1,2,3]') === null, 'valid JSON that is an array degrades to null');
    assert(parseDecentralizedDiscoveryEnvelope(JSON.stringify({ protocol: 'forkbuild', version: 1 })) === null, 'well-formed JSON missing required fields degrades to null');
    assert(parseDecentralizedDiscoveryEnvelope(JSON.stringify(envelopeOf({ protocol: 'unrelated-app' }))) === null, 'a well-formed but differently-namespaced JSON envelope degrades to null');

    console.log('✓ parseDecentralizedDiscoveryEnvelope degrades to null on any malformed raw payload, never throws');
}

// ---------------------------------------------------------------------
// 5. Two entry points, one validation algorithm — parsing never accepts
//    anything describeDecentralizedDiscoveryEnvelope would itself reject.
// ---------------------------------------------------------------------
{
    const malformed = envelopeOf({ objectId: '' });
    assert(describeDecentralizedDiscoveryEnvelope(malformed) === null, 'sanity: the malformed fixture is itself rejected directly');
    assert(parseDecentralizedDiscoveryEnvelope(malformed) === null, 'the same malformed shape is rejected when handed in as an already-parsed object');
    assert(parseDecentralizedDiscoveryEnvelope(JSON.stringify(malformed)) === null, 'the same malformed shape is rejected when handed in as a JSON string');

    console.log('✓ Two entry points share exactly one validation algorithm');
}

// ---------------------------------------------------------------------
// 6. Vocabulary boundary: no trust, signature, or association vocabulary;
//    this file never reads or produces a discoveryTag.
// ---------------------------------------------------------------------
{
    const sourceUrl = new URL('../core/DecentralizedDiscoveryEnvelope.js', import.meta.url);
    const source = await readFile(sourceUrl, 'utf8');
    const codeOnly = source
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n');

    const forbidden = [
        'trust', 'reputation', 'verified', 'authority', 'priority', 'weight', 'confidence',
        'rank', 'preferred', 'best',
        'fetch(', 'websocket', 'WebSocket', 'StorageProvider',
        'signature', 'discoveryTag', 'origin',
        'DecentralizedWorldEncounterLeadAssociation', 'DecentralizedWorldDiscoveryLead'
    ];
    for (const term of forbidden) {
        assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `core/DecentralizedDiscoveryEnvelope.js code must never use the word "${term}"`);
    }

    console.log('✓ Vocabulary boundary: no trust, signature, or association vocabulary; no discoveryTag/origin of its own');
}

console.log('\nAll decentralized discovery envelope tests passed.');
