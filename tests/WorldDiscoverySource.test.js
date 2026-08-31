import { readFile } from 'node:fs/promises';
import {
    WorldDiscoveryInputKeys,
    describeWorldDiscoverySource
} from '../core/WorldDiscoverySource.js';
import { deriveWorldEncounters } from '../core/WorldEncounter.js';

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function publicationOf(overrides = {}) {
    return { id: 'pub-1', title: 'Untitled', publisherIdentity: { username: 'alice' }, signature: { signedBy: 'alice' }, ...overrides };
}

function placementOf(overrides = {}) {
    return { id: 'placement-1', publicationId: 'pub-1', position: { x: 10, y: 0, z: 20 }, ...overrides };
}

// ---------------------------------------------------------------------
// 1. describeWorldDiscoverySource: basic shape
// ---------------------------------------------------------------------
{
    const source = describeWorldDiscoverySource({
        origin: 'local',
        publications: [publicationOf()],
        placements: [placementOf()]
    });

    assert(source !== null, 'a source with a valid origin is describable');
    assert(source.origin === 'local', 'origin is carried verbatim');
    assert(source.publications.length === 1 && source.publications[0].id === 'pub-1', 'publications is carried verbatim');
    assert(source.placements.length === 1, 'placements is carried verbatim');
    assert(Array.isArray(source.anchors) && source.anchors.length === 0, 'an unsupplied record array degrades to empty');
    assert(Array.isArray(source.snapshotPlacements) && source.snapshotPlacements.length === 0, 'an unsupplied record array degrades to empty');
    assert(Array.isArray(source.avatarProfiles) && source.avatarProfiles.length === 0, 'an unsupplied record array degrades to empty');
    assert(Array.isArray(source.avatarPresences) && source.avatarPresences.length === 0, 'an unsupplied record array degrades to empty');
    assert(Object.isFrozen(source), 'the source bundle is frozen');
    assert(Object.isFrozen(source.publications), 'each record array is frozen');

    console.log('✓ describeWorldDiscoverySource: basic shape');
}

// ---------------------------------------------------------------------
// 2. describeWorldDiscoverySource: origin is required, never throws
// ---------------------------------------------------------------------
{
    assert(describeWorldDiscoverySource({}) === null, 'no origin at all degrades to null, never throws');
    assert(describeWorldDiscoverySource({ origin: '' }) === null, 'an empty-string origin degrades to null');
    assert(describeWorldDiscoverySource({ origin: 42 }) === null, 'a non-string origin degrades to null');
    assert(describeWorldDiscoverySource({ origin: null }) === null, 'a null origin degrades to null');
    assert(describeWorldDiscoverySource() === null, 'no argument at all degrades to null, never throws');
    assert(describeWorldDiscoverySource({ origin: 'peer:alice' }) !== null, 'a non-"local" origin string is just as valid — origin is open, never a closed enum');

    console.log('✓ describeWorldDiscoverySource: origin is required, never throws');
}

// ---------------------------------------------------------------------
// 3. describeWorldDiscoverySource: malformed record arrays degrade, never throw
// ---------------------------------------------------------------------
{
    const source = describeWorldDiscoverySource({
        origin: 'local',
        publications: 'not-an-array',
        placements: null,
        anchors: { not: 'an array' },
        snapshotPlacements: undefined,
        avatarProfiles: 7,
        avatarPresences: false
    });

    assert(source !== null, 'a malformed record array never invalidates the whole source');
    for (const key of WorldDiscoveryInputKeys) {
        assert(Array.isArray(source[key]) && source[key].length === 0, `malformed "${key}" degrades to an empty array`);
    }

    console.log('✓ describeWorldDiscoverySource: malformed record arrays degrade, never throw');
}

// ---------------------------------------------------------------------
// 4. WorldDiscoveryInputKeys names exactly deriveWorldEncounters()'s own six parameters
// ---------------------------------------------------------------------
{
    assert(WorldDiscoveryInputKeys.length === 6, 'exactly six input keys are named');
    assert(Object.isFrozen(WorldDiscoveryInputKeys), 'the key list itself is frozen');

    // Build a source, spread its own six record-array fields (dropping
    // `origin`) straight into deriveWorldEncounters() by exactly the
    // keys this file names — proving the two files' vocabularies stay
    // in lockstep without this test hand-copying deriveWorldEncounters()'s
    // own parameter list a second time.
    const source = describeWorldDiscoverySource({
        origin: 'local',
        publications: [publicationOf()],
        placements: [placementOf()]
    });
    const args = {};
    for (const key of WorldDiscoveryInputKeys) {
        args[key] = source[key];
    }
    const result = deriveWorldEncounters(args);
    assert(result.publications.length === 1, 'a described source hands off cleanly into deriveWorldEncounters() by its own named keys');

    console.log('✓ WorldDiscoveryInputKeys names exactly deriveWorldEncounters()\'s own six parameters');
}

// ---------------------------------------------------------------------
// 5. Sources are independent; this file never combines two of them
// ---------------------------------------------------------------------
{
    const localSource = describeWorldDiscoverySource({ origin: 'local', publications: [publicationOf({ id: 'local-pub' })] });
    const peerSource = describeWorldDiscoverySource({ origin: 'peer:bob', publications: [publicationOf({ id: 'peer-pub' })] });

    assert(localSource.origin !== peerSource.origin, 'two sources keep their own distinct origin');
    assert(localSource.publications.length === 1 && peerSource.publications.length === 1, 'each source only ever holds what it was itself given');
    assert(localSource.publications[0].id === 'local-pub' && peerSource.publications[0].id === 'peer-pub', 'one source never leaks into another');

    console.log('✓ Sources are independent; this file never combines two of them');
}

// ---------------------------------------------------------------------
// 6. Vocabulary boundary: no trust, network, or combination vocabulary
// ---------------------------------------------------------------------
{
    const sourceUrl = new URL('../core/WorldDiscoverySource.js', import.meta.url);
    const source = await readFile(sourceUrl, 'utf8');
    const codeOnly = source
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n');

    const forbidden = [
        'trust', 'reputation', 'verified', 'authority', 'priority', 'weight', 'confidence',
        'merge', 'combine', 'reconcile', 'dedup',
        'fetch(', 'websocket', 'WebSocket', 'gossip', 'socket', 'StorageProvider'
    ];
    for (const term of forbidden) {
        assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `core/WorldDiscoverySource.js code must never use the word "${term}"`);
    }

    console.log('✓ Vocabulary boundary: no trust, network, or combination vocabulary');
}

console.log('\nAll world discovery source tests passed.');
