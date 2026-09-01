import { readFile } from 'node:fs/promises';
import {
    describeDecentralizedWorldEncounterLeadAssociation,
    decentralizedWorldEncounterLeadAssociationMatchesLead
} from '../core/DecentralizedWorldEncounterLeadAssociation.js';
import { describeDecentralizedWorldDiscoveryLead } from '../core/DecentralizedWorldDiscoveryLead.js';

// 0.9.28 — Decentralized Lead → Encounter Resolution Boundary.
//
// See docs/Roadmap.md, "0.9.28 — Decentralized Lead → Encounter
// Resolution Boundary," for the full milestone story.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function associationOf(overrides = {}) {
    return {
        origin: 'dweb:some-search-service',
        discoveryTag: 'forkbuild_random_unique',
        uri: 'ar://ABC123',
        kind: 'PUBLICATION',
        objectId: 'pub-1',
        ...overrides
    };
}

function leadOf(overrides = {}) {
    return {
        origin: 'dweb:some-search-service',
        discoveryTag: 'forkbuild_random_unique',
        uri: 'ar://ABC123',
        storage: 'ar',
        ...overrides
    };
}

// ---------------------------------------------------------------------
// 1. Flagship: a well-formed association is describable and matches the
//    exact lead its own triple names.
// ---------------------------------------------------------------------
{
    const association = describeDecentralizedWorldEncounterLeadAssociation(associationOf());
    assert(association !== null, '1. FLAGSHIP — a well-formed association is describable');
    assert(association.kind === 'PUBLICATION' && association.objectId === 'pub-1', '2. FLAGSHIP — the material identity is carried verbatim');
    assert(association.origin === 'dweb:some-search-service' && association.discoveryTag === 'forkbuild_random_unique' && association.uri === 'ar://ABC123', '3. FLAGSHIP — the lead identity triple is carried verbatim');
    assert(Object.isFrozen(association), '4. FLAGSHIP — the association is frozen');

    const matchingLead = describeDecentralizedWorldDiscoveryLead(leadOf());
    assert(decentralizedWorldEncounterLeadAssociationMatchesLead(association, matchingLead) === true, '5. FLAGSHIP — the association matches the lead its own triple names');

    const differentLead = describeDecentralizedWorldDiscoveryLead(leadOf({ uri: 'ar://DIFFERENT' }));
    assert(decentralizedWorldEncounterLeadAssociationMatchesLead(association, differentLead) === false, '6. FLAGSHIP — the association does not match a lead with a different uri');

    console.log('✓ Flagship: a well-formed association describes and matches by its own triple');
}

// ---------------------------------------------------------------------
// 2. Every field is required; malformed input degrades to null, never throws.
// ---------------------------------------------------------------------
{
    assert(describeDecentralizedWorldEncounterLeadAssociation() === null, 'no argument at all degrades to null');
    assert(describeDecentralizedWorldEncounterLeadAssociation({}) === null, 'no fields at all degrades to null');
    assert(describeDecentralizedWorldEncounterLeadAssociation(associationOf({ origin: '' })) === null, 'an empty origin degrades to null');
    assert(describeDecentralizedWorldEncounterLeadAssociation(associationOf({ origin: null })) === null, 'a null origin degrades to null');
    assert(describeDecentralizedWorldEncounterLeadAssociation(associationOf({ discoveryTag: '' })) === null, 'an empty discoveryTag degrades to null');
    assert(describeDecentralizedWorldEncounterLeadAssociation(associationOf({ uri: '' })) === null, 'an empty uri degrades to null');
    assert(describeDecentralizedWorldEncounterLeadAssociation(associationOf({ uri: undefined })) === null, 'a missing uri degrades to null');
    assert(describeDecentralizedWorldEncounterLeadAssociation(associationOf({ kind: 'AVATAR_PROFILE' })) === null, 'an unrecognized kind degrades to null');
    assert(describeDecentralizedWorldEncounterLeadAssociation(associationOf({ kind: undefined })) === null, 'a missing kind degrades to null');
    assert(describeDecentralizedWorldEncounterLeadAssociation(associationOf({ objectId: '' })) === null, 'an empty objectId degrades to null');
    assert(describeDecentralizedWorldEncounterLeadAssociation(associationOf({ objectId: 42 })) === null, 'a non-string objectId degrades to null');
    assert(describeDecentralizedWorldEncounterLeadAssociation(associationOf({ kind: 'AVATAR' })) !== null, 'AVATAR is a recognized kind');

    console.log('✓ Every field is required; malformed input degrades to null, never throws');
}

// ---------------------------------------------------------------------
// 3. A shared discoveryTag or uri, alone, is never a match — only the
//    full (origin, discoveryTag, uri) triple counts.
// ---------------------------------------------------------------------
{
    const association = describeDecentralizedWorldEncounterLeadAssociation(associationOf());

    const sameTagDifferentUri = describeDecentralizedWorldDiscoveryLead(leadOf({ uri: 'ar://SOMETHING_ELSE' }));
    assert(decentralizedWorldEncounterLeadAssociationMatchesLead(association, sameTagDifferentUri) === false, 'sharing only a discoveryTag is never a match');

    const sameUriDifferentOrigin = describeDecentralizedWorldDiscoveryLead(leadOf({ origin: 'dweb:a-different-service' }));
    assert(decentralizedWorldEncounterLeadAssociationMatchesLead(association, sameUriDifferentOrigin) === false, 'sharing only a uri (from a different reporting service) is never a match');

    const sameOriginDifferentTag = describeDecentralizedWorldDiscoveryLead(leadOf({ discoveryTag: 'a_different_tag' }));
    assert(decentralizedWorldEncounterLeadAssociationMatchesLead(association, sameOriginDifferentTag) === false, 'sharing only an origin is never a match');

    console.log('✓ Only the full identity triple counts as a match — no partial-field matching');
}

// ---------------------------------------------------------------------
// 4. decentralizedWorldEncounterLeadAssociationMatchesLead never throws
//    on malformed arguments.
// ---------------------------------------------------------------------
{
    const association = describeDecentralizedWorldEncounterLeadAssociation(associationOf());
    assert(decentralizedWorldEncounterLeadAssociationMatchesLead(null, null) === false, 'both null returns false');
    assert(decentralizedWorldEncounterLeadAssociationMatchesLead(association, null) === false, 'a null lead returns false');
    assert(decentralizedWorldEncounterLeadAssociationMatchesLead(null, leadOf()) === false, 'a null association returns false');
    assert(decentralizedWorldEncounterLeadAssociationMatchesLead(undefined, undefined) === false, 'both undefined returns false');
    assert(decentralizedWorldEncounterLeadAssociationMatchesLead('not-an-object', 42) === false, 'non-object arguments return false, never throw');

    console.log('✓ decentralizedWorldEncounterLeadAssociationMatchesLead never throws on malformed input');
}

// ---------------------------------------------------------------------
// 5. Vocabulary boundary: no trust, ranking, or inference vocabulary; no
//    reading of a lead's own discoveryTag/uri to guess an association.
// ---------------------------------------------------------------------
{
    const sourceUrl = new URL('../core/DecentralizedWorldEncounterLeadAssociation.js', import.meta.url);
    const source = await readFile(sourceUrl, 'utf8');
    const codeOnly = source
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n');

    const forbidden = [
        'trust', 'reputation', 'verified', 'authority', 'priority', 'weight', 'confidence',
        'rank', 'preferred', 'best',
        'fetch(', 'websocket', 'WebSocket', 'StorageProvider',
        'ContentReference', 'DecentralizedPublication', 'hash'
    ];
    for (const term of forbidden) {
        assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `core/DecentralizedWorldEncounterLeadAssociation.js code must never use the word "${term}"`);
    }

    console.log('✓ Vocabulary boundary: no trust, ranking, inference, or retrieval vocabulary');
}

console.log('\nAll decentralized world encounter lead association tests passed.');
