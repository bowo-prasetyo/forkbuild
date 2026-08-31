import { readFile } from 'node:fs/promises';
import {
    WorldDiscoveryInputKeys,
    describeWorldDiscoverySource
} from '../core/WorldDiscoverySource.js';
import { assembleWorldDiscoveryInputs } from '../core/WorldDiscoverySourceAssembly.js';
import { deriveWorldEncounters } from '../core/WorldEncounter.js';

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

// ---------------------------------------------------------------------
// 1. Flagship: three sources, all six dimensions, source order preserved
// ---------------------------------------------------------------------
{
    const local = describeWorldDiscoverySource({
        origin: 'local',
        publications: [{ id: 'P1' }],
        placements: [{ id: 'PL1' }],
        anchors: [{ id: 'AN1' }],
        snapshotPlacements: [{ id: 'SP1' }],
        avatarProfiles: [{ id: 'A1' }],
        avatarPresences: [{ avatarId: 'A1' }]
    });
    const peerA = describeWorldDiscoverySource({
        origin: 'peer:alice',
        publications: [{ id: 'P2' }],
        placements: [{ id: 'PL2' }],
        anchors: [{ id: 'AN2' }],
        snapshotPlacements: [{ id: 'SP2' }],
        avatarProfiles: [{ id: 'A2' }],
        avatarPresences: [{ avatarId: 'A2' }]
    });
    const peerB = describeWorldDiscoverySource({
        origin: 'peer:bob',
        publications: [{ id: 'P3' }],
        placements: [{ id: 'PL3' }],
        anchors: [{ id: 'AN3' }],
        snapshotPlacements: [{ id: 'SP3' }],
        avatarProfiles: [{ id: 'A3' }],
        avatarPresences: [{ avatarId: 'A3' }]
    });

    const assembled = assembleWorldDiscoveryInputs([local, peerA, peerB]);

    assert(assembled.publications.map((p) => p.id).join(',') === 'P1,P2,P3', 'publications concatenate in source order');
    assert(assembled.placements.map((p) => p.id).join(',') === 'PL1,PL2,PL3', 'placements concatenate in source order');
    assert(assembled.anchors.map((a) => a.id).join(',') === 'AN1,AN2,AN3', 'anchors concatenate in source order');
    assert(assembled.snapshotPlacements.map((s) => s.id).join(',') === 'SP1,SP2,SP3', 'snapshotPlacements concatenate in source order');
    assert(assembled.avatarProfiles.map((a) => a.id).join(',') === 'A1,A2,A3', 'avatarProfiles concatenate in source order');
    assert(assembled.avatarPresences.map((a) => a.avatarId).join(',') === 'A1,A2,A3', 'avatarPresences concatenate in source order');
    assert(Object.keys(assembled).length === WorldDiscoveryInputKeys.length, 'exactly the six named dimensions are present, no seventh field');

    console.log('✓ Flagship: three sources, all six dimensions, source order preserved');
}

// ---------------------------------------------------------------------
// 2. Duplicates across sources are preserved, never deduplicated
// ---------------------------------------------------------------------
{
    const sharedPublication = { id: 'P7' };
    const peerA = describeWorldDiscoverySource({ origin: 'peer:alice', publications: [sharedPublication] });
    const peerB = describeWorldDiscoverySource({ origin: 'peer:bob', publications: [sharedPublication] });

    const assembled = assembleWorldDiscoveryInputs([peerA, peerB]);

    assert(assembled.publications.length === 2, 'two sources contributing the same record produce two entries, not one');
    assert(assembled.publications[0] === sharedPublication && assembled.publications[1] === sharedPublication, 'both entries are the same record, preserved exactly');

    console.log('✓ Duplicates across sources are preserved, never deduplicated');
}

// ---------------------------------------------------------------------
// 3. Within-source order and duplicates are preserved too
// ---------------------------------------------------------------------
{
    const x = { id: 'X' };
    const y = { id: 'Y' };
    const z = { id: 'Z' };
    const sourceA = describeWorldDiscoverySource({ origin: 'a', publications: [x, y] });
    const sourceB = describeWorldDiscoverySource({ origin: 'b', publications: [y, z] });

    const assembled = assembleWorldDiscoveryInputs([sourceA, sourceB]);

    assert(assembled.publications.map((p) => p.id).join(',') === 'X,Y,Y,Z', 'source order, within-source order, and duplicates are all preserved exactly');

    console.log('✓ Within-source order and duplicates are preserved too');
}

// ---------------------------------------------------------------------
// 4. Records are carried by reference; provenance never leaks into them
// ---------------------------------------------------------------------
{
    const publication = { id: 'pub-1', title: 'Untitled' };
    const source = describeWorldDiscoverySource({ origin: 'peer:carol', publications: [publication] });

    const assembled = assembleWorldDiscoveryInputs([source]);

    assert(assembled.publications[0] === publication, 'the assembled record is the exact same reference the source held');
    assert(Object.keys(assembled.publications[0]).sort().join(',') === 'id,title', 'no sourceOrigin, peerIdentity, remote, or other field was added to the record');

    console.log('✓ Records are carried by reference; provenance never leaks into them');
}

// ---------------------------------------------------------------------
// 5. Malformed sources: null, undefined, and non-source entries degrade
//    gracefully, never throw, and never discard valid neighbors
// ---------------------------------------------------------------------
{
    const valid1 = describeWorldDiscoverySource({ origin: 'local', publications: [{ id: 'V1' }] });
    const valid2 = describeWorldDiscoverySource({ origin: 'peer:dave', publications: [{ id: 'V2' }] });

    const assembled = assembleWorldDiscoveryInputs([valid1, null, { not: 'a source' }, undefined, 'not-a-source', 42, valid2]);

    assert(assembled.publications.map((p) => p.id).join(',') === 'V1,V2', 'malformed entries contribute nothing and do not disturb valid entries on either side');

    console.log('✓ Malformed sources degrade gracefully, never throw, never discard valid neighbors');
}

// ---------------------------------------------------------------------
// 6. sources missing, not an array, or empty: six empty arrays, never throws
// ---------------------------------------------------------------------
{
    for (const input of [undefined, null, 'not-an-array', 7, {}, []]) {
        const assembled = assembleWorldDiscoveryInputs(input);
        for (const key of WorldDiscoveryInputKeys) {
            assert(Array.isArray(assembled[key]) && assembled[key].length === 0, `input ${JSON.stringify(input)}: "${key}" degrades to an empty array`);
        }
    }

    console.log('✓ sources missing, not an array, or empty degrade to six empty arrays, never throw');
}

// ---------------------------------------------------------------------
// 7. Freezing: the result and each array are frozen, but records are not
// ---------------------------------------------------------------------
{
    const mutableRecord = { id: 'M1' };
    const source = describeWorldDiscoverySource({ origin: 'local', publications: [mutableRecord] });
    const assembled = assembleWorldDiscoveryInputs([source]);

    assert(Object.isFrozen(assembled), 'the assembled result object is frozen');
    for (const key of WorldDiscoveryInputKeys) {
        assert(Object.isFrozen(assembled[key]), `assembled "${key}" array is frozen`);
    }
    assert(!Object.isFrozen(assembled.publications[0]), 'individual records are never frozen or cloned by this file');
    mutableRecord.id = 'changed';
    assert(assembled.publications[0].id === 'changed', 'the assembled record is a live reference, not a defensive copy');

    console.log('✓ Freezing: the result and each array are frozen, but records themselves are not');
}

// ---------------------------------------------------------------------
// 8. The assembled result hands off cleanly into deriveWorldEncounters()
// ---------------------------------------------------------------------
{
    const local = describeWorldDiscoverySource({
        origin: 'local',
        publications: [{ id: 'pub-1', title: 'Local Pub', publisherIdentity: { username: 'alice' }, signature: { signedBy: 'alice' } }],
        placements: [{ id: 'placement-1', publicationId: 'pub-1', position: { x: 0, y: 0, z: 0 } }]
    });
    const peer = describeWorldDiscoverySource({
        origin: 'peer:bob',
        publications: [{ id: 'pub-2', title: 'Peer Pub', publisherIdentity: { username: 'bob' }, signature: { signedBy: 'bob' } }],
        placements: [{ id: 'placement-2', publicationId: 'pub-2', position: { x: 5, y: 0, z: 5 } }]
    });

    const assembled = assembleWorldDiscoveryInputs([local, peer]);
    const result = deriveWorldEncounters(assembled);

    assert(result.publications.length === 2, 'an assembled multi-source input hands off cleanly into deriveWorldEncounters()');

    console.log('✓ The assembled result hands off cleanly into deriveWorldEncounters()');
}

// ---------------------------------------------------------------------
// 9. Architectural regression: forbidden imports and vocabulary
// ---------------------------------------------------------------------
{
    const sourceUrl = new URL('../core/WorldDiscoverySourceAssembly.js', import.meta.url);
    const fullSource = await readFile(sourceUrl, 'utf8');
    const codeOnly = fullSource
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n');

    // No encounter derivation.
    assert(!codeOnly.includes('WorldEncounter'), 'core/WorldDiscoverySourceAssembly.js code must never reference WorldEncounter');
    assert(!codeOnly.includes('deriveWorldEncounters'), 'core/WorldDiscoverySourceAssembly.js code must never call deriveWorldEncounters');

    // No knowledge of peer transport or peer ingress.
    assert(!codeOnly.includes('PeerMessageBus'), 'core/WorldDiscoverySourceAssembly.js code must never import PeerMessageBus');
    assert(!codeOnly.includes('PeerWorldDataIngress'), 'core/WorldDiscoverySourceAssembly.js code must never import PeerWorldDataIngress');
    assert(!codeOnly.includes('PeerConnection'), 'core/WorldDiscoverySourceAssembly.js code must never reference PeerConnection');
    assert(!codeOnly.includes('PeerDiscoveryProvider'), 'core/WorldDiscoverySourceAssembly.js code must never reference PeerDiscoveryProvider');

    // No storage or network.
    assert(!codeOnly.includes('StorageProvider'), 'core/WorldDiscoverySourceAssembly.js code must never reference StorageProvider');
    assert(!/\blocalStorage\b/.test(codeOnly), 'core/WorldDiscoverySourceAssembly.js code must never reference localStorage');
    assert(!/fetch\(/.test(codeOnly), 'core/WorldDiscoverySourceAssembly.js code must never call fetch(...)');
    assert(!codeOnly.includes('WebSocket'), 'core/WorldDiscoverySourceAssembly.js code must never reference WebSocket');

    // No reconciliation, dedup, sort, or match vocabulary.
    const reconciliationTerms = ['dedup', 'reconcile', 'match(', 'compare', '.sort(', 'winner'];
    for (const term of reconciliationTerms) {
        assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `core/WorldDiscoverySourceAssembly.js code must never use "${term}"`);
    }

    // No trust/authority vocabulary of any kind.
    const trustTerms = ['trusted', 'trust(', 'reputation', 'verified', 'verify(', 'authority', 'priority', 'weight', 'confidence', 'ranking', 'scoring'];
    for (const term of trustTerms) {
        assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `core/WorldDiscoverySourceAssembly.js code must never use "${term}"`);
    }

    // No .find()/identity lookup should be needed to assemble records.
    assert(!/\.find\(/.test(codeOnly), 'core/WorldDiscoverySourceAssembly.js code must never call .find(...)');

    console.log('✓ Architectural regression: forbidden imports and vocabulary');
}

// ---------------------------------------------------------------------
// 10. WorldDiscoveryInputKeys stays the single shared source of the six
//     dimension names — this file never retypes its own copy
// ---------------------------------------------------------------------
{
    const sourceUrl = new URL('../core/WorldDiscoverySourceAssembly.js', import.meta.url);
    const fullSource = await readFile(sourceUrl, 'utf8');
    assert(fullSource.includes("from './WorldDiscoverySource.js'"), 'core/WorldDiscoverySourceAssembly.js imports the shared key list rather than retyping it');

    console.log('✓ WorldDiscoveryInputKeys stays the single shared source of the six dimension names');
}

console.log('\nAll world discovery source assembly tests passed.');
