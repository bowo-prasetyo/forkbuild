import { readFile } from 'node:fs/promises';
import {
    describeLocalWorldDiscoverySource,
    describeWorldFromDiscoverySources,
    LOCAL_WORLD_DISCOVERY_ORIGIN
} from '../application/WorldEncounterIntegration.js';
import { describePeerWorldDiscoverySource } from '../peer/PeerWorldDataIngress.js';

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function connectedPeerOf(identityId) {
    return { remoteIdentity: identityId ? { identityId } : null };
}

// ---------------------------------------------------------------------
// 1. Flagship: local + peer end-to-end through the entire chain —
//    peer payload -> PeerWorldDataIngress -> WorldDiscoverySource ->
//    assembly -> WorldEncounter -> ReadModel -> View. A2 is encounterable
//    purely because its peer-supplied profile + presence reached the
//    existing WorldEncounter inputs — no special "remote avatar" path.
// ---------------------------------------------------------------------
{
    const localSource = describeLocalWorldDiscoverySource({
        publications: [{ id: 'pub-P1', title: 'P1', publisherIdentity: { username: 'local-user' } }],
        placements: [{ id: 'placement-P1', publicationId: 'pub-P1', position: { x: 1, y: 0, z: 1 } }],
        avatarProfiles: [{ avatarId: 'avatar-A1', displayName: 'A1' }],
        avatarPresences: [{ avatarId: 'avatar-A1', position: { x: 2, y: 0, z: 2 } }]
    });

    const peerPayload = {
        publications: [{ id: 'pub-P2', title: 'P2', publisherIdentity: { username: 'peer-user' } }],
        placements: [{ id: 'placement-P2', publicationId: 'pub-P2', position: { x: 5, y: 0, z: 5 } }],
        avatarProfiles: [{ avatarId: 'avatar-A2', displayName: 'A2' }],
        avatarPresences: [{ avatarId: 'avatar-A2', position: { x: 6, y: 0, z: 6 } }]
    };
    const peerSource = describePeerWorldDiscoverySource(peerPayload, connectedPeerOf('did:key:zPeerA'));

    const view = describeWorldFromDiscoverySources([localSource, peerSource]);

    assert(view.publicationCount === 2, 'both local and peer publications reach the view');
    assert(view.avatarCount === 2, 'both local and peer avatars reach the view');
    assert(view.totalCount === 4, 'view.totalCount reflects all four encounters');
    assert(view.isEmpty === false, 'a populated multi-source view is never isEmpty');

    const publicationIds = view.publications.map((p) => p.objectId).sort();
    assert(publicationIds.join(',') === 'pub-P1,pub-P2', 'P1 (local) and P2 (peer) both appear');

    const avatarIds = view.avatars.map((a) => a.objectId).sort();
    assert(avatarIds.join(',') === 'avatar-A1,avatar-A2', 'A1 (local) and A2 (peer) both appear');

    const peerAvatarRow = view.avatars.find((a) => a.objectId === 'avatar-A2');
    assert(peerAvatarRow.displayName === 'A2', 'the peer-supplied avatar carries its own displayName, reaching the view unchanged');

    console.log('✓ Flagship: local + peer sources reach the World View through the full pipeline');
}

// ---------------------------------------------------------------------
// 2. Publication test, part 1: a peer publication WITH a placement
//    becomes an encounter and appears in view.publications.
// ---------------------------------------------------------------------
{
    const peerSource = describePeerWorldDiscoverySource(
        {
            publications: [{ id: 'pub-P9', title: 'P9' }],
            placements: [{ id: 'placement-P9', publicationId: 'pub-P9', position: { x: 0, y: 0, z: 0 } }]
        },
        connectedPeerOf('did:key:zPeerB')
    );

    const view = describeWorldFromDiscoverySources([peerSource]);

    assert(view.publications.length === 1 && view.publications[0].objectId === 'pub-P9', 'a peer publication with a placement appears as an encounter');

    console.log('✓ Publication test, part 1: a placed peer publication becomes an encounter');
}

// ---------------------------------------------------------------------
// 3. Publication test, part 2: a peer publication with NO placement does
//    NOT become an encounter. Peer origin never bypasses the existing
//    World encounter rules.
// ---------------------------------------------------------------------
{
    const peerSource = describePeerWorldDiscoverySource(
        { publications: [{ id: 'pub-P10', title: 'P10' }] },
        connectedPeerOf('did:key:zPeerC')
    );

    const view = describeWorldFromDiscoverySources([peerSource]);

    assert(view.publications.length === 0, 'an unplaced peer publication never becomes an encounter, regardless of origin');
    assert(view.isEmpty === true, 'a source with no encounterable contribution produces an empty view');

    console.log('✓ Publication test, part 2: an unplaced peer publication is never an encounter');
}

// ---------------------------------------------------------------------
// 4. Duplicates across origins are preserved, never deduplicated by this
//    file — inherited unchanged from 0.9.7.
// ---------------------------------------------------------------------
{
    const sharedPlacement = { id: 'placement-shared', publicationId: 'pub-shared', position: { x: 0, y: 0, z: 0 } };
    const sharedPublication = { id: 'pub-shared', title: 'Shared' };

    const localSource = describeLocalWorldDiscoverySource({
        publications: [sharedPublication],
        placements: [sharedPlacement]
    });
    const peerSource = describePeerWorldDiscoverySource(
        { publications: [sharedPublication], placements: [sharedPlacement] },
        connectedPeerOf('did:key:zPeerD')
    );

    const view = describeWorldFromDiscoverySources([localSource, peerSource]);

    assert(view.publications.length === 2, 'the same publication contributed by two origins produces two encounter rows, never deduplicated');
    assert(view.publications.every((p) => p.objectId === 'pub-shared'), 'both rows describe the same underlying publication');

    console.log('✓ Duplicates across origins are preserved, never deduplicated');
}

// ---------------------------------------------------------------------
// 5. Local source carries the fixed 'local' origin, structurally equal to
//    a peer source — no origin-based privilege of any kind.
// ---------------------------------------------------------------------
{
    const localSource = describeLocalWorldDiscoverySource({ publications: [{ id: 'pub-1' }] });

    assert(localSource.origin === LOCAL_WORLD_DISCOVERY_ORIGIN, 'describeLocalWorldDiscoverySource() attributes the fixed "local" origin');
    assert(localSource.origin === 'local', 'LOCAL_WORLD_DISCOVERY_ORIGIN is exactly the string "local"');
    assert(Object.isFrozen(localSource), 'the local source is frozen, exactly like describeWorldDiscoverySource() already freezes its own result');

    console.log('✓ Local source carries the fixed "local" origin, structurally equal to a peer source');
}

// ---------------------------------------------------------------------
// 6. Malformed / empty input degrades to an empty, well-formed view,
//    never throws.
// ---------------------------------------------------------------------
{
    for (const input of [undefined, null, [], 'not-an-array', 7, {}]) {
        const view = describeWorldFromDiscoverySources(input);
        assert(view.isEmpty === true, `input ${JSON.stringify(input)}: degrades to an empty view`);
        assert(view.publicationCount === 0 && view.avatarCount === 0 && view.totalCount === 0, `input ${JSON.stringify(input)}: all counts are zero`);
        assert(Array.isArray(view.publications) && view.publications.length === 0, `input ${JSON.stringify(input)}: publications is an empty array`);
        assert(Array.isArray(view.avatars) && view.avatars.length === 0, `input ${JSON.stringify(input)}: avatars is an empty array`);
    }

    console.log('✓ Malformed or empty sources degrade to an empty, well-formed view, never throw');
}

// ---------------------------------------------------------------------
// 7. Freezing: the returned view and its arrays are frozen throughout —
//    exactly describeWorldEncounterView()'s own contract, unmodified.
// ---------------------------------------------------------------------
{
    const view = describeWorldFromDiscoverySources([
        describeLocalWorldDiscoverySource({
            publications: [{ id: 'pub-F1' }],
            placements: [{ id: 'placement-F1', publicationId: 'pub-F1', position: { x: 0, y: 0, z: 0 } }]
        })
    ]);

    assert(Object.isFrozen(view), 'the returned view is frozen');
    assert(Object.isFrozen(view.publications), 'view.publications is frozen');
    assert(Object.isFrozen(view.avatars), 'view.avatars is frozen');

    console.log('✓ Freezing: the returned view and its arrays are frozen throughout');
}

// ---------------------------------------------------------------------
// 8. Architectural regression: forbidden imports and vocabulary — this
//    file is orchestration only, never a second projection algorithm.
// ---------------------------------------------------------------------
{
    const sourceUrl = new URL('../application/WorldEncounterIntegration.js', import.meta.url);
    const fullSource = await readFile(sourceUrl, 'utf8');
    const codeOnly = fullSource
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n');

    // No peer transport or network knowledge.
    assert(!codeOnly.includes('PeerMessageBus'), 'application/WorldEncounterIntegration.js code must never import PeerMessageBus');
    assert(!codeOnly.includes('PeerConnection'), 'application/WorldEncounterIntegration.js code must never reference PeerConnection');
    assert(!codeOnly.includes('PeerDiscoveryProvider'), 'application/WorldEncounterIntegration.js code must never reference PeerDiscoveryProvider');
    assert(!/fetch\(/.test(codeOnly), 'application/WorldEncounterIntegration.js code must never call fetch(...)');
    assert(!codeOnly.includes('WebSocket'), 'application/WorldEncounterIntegration.js code must never reference WebSocket');
    assert(!codeOnly.includes('RTCPeerConnection'), 'application/WorldEncounterIntegration.js code must never reference RTCPeerConnection');

    // No storage.
    assert(!codeOnly.includes('StorageProvider'), 'application/WorldEncounterIntegration.js code must never reference StorageProvider');
    assert(!/\blocalStorage\b/.test(codeOnly), 'application/WorldEncounterIntegration.js code must never reference localStorage');

    // No reconciliation, dedup, sort, or match vocabulary.
    const reconciliationTerms = ['dedup', 'reconcile', '.find(', 'compare', '.sort(', 'winner'];
    for (const term of reconciliationTerms) {
        assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `application/WorldEncounterIntegration.js code must never use "${term}"`);
    }

    // No trust/authority/proximity vocabulary of any kind.
    const trustTerms = ['trusted', 'trust(', 'reputation', 'verified', 'verify(', 'authority', 'priority', 'weight', 'confidence', 'ranking', 'scoring', 'nearest', 'proximity'];
    for (const term of trustTerms) {
        assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `application/WorldEncounterIntegration.js code must never use "${term}"`);
    }

    // No per-record loop of this file's own invention — every fact must
    // come from the four functions it calls, not a for/map/filter over
    // individual records.
    assert(!/\.map\(/.test(codeOnly), 'application/WorldEncounterIntegration.js code must never call .map(...) itself');
    assert(!/\.filter\(/.test(codeOnly), 'application/WorldEncounterIntegration.js code must never call .filter(...) itself');
    assert(!/for\s*\(/.test(codeOnly), 'application/WorldEncounterIntegration.js code must never write its own for-loop');

    console.log('✓ Architectural regression: forbidden imports and vocabulary');
}

// ---------------------------------------------------------------------
// 9. Dependency direction: this file is exactly the four-function chain,
//    calling each of 0.9.0/0.9.1/0.9.2/0.9.7's own entry points once.
// ---------------------------------------------------------------------
{
    const sourceUrl = new URL('../application/WorldEncounterIntegration.js', import.meta.url);
    const fullSource = await readFile(sourceUrl, 'utf8');

    assert(fullSource.includes("from '../core/WorldDiscoverySourceAssembly.js'"), 'imports assembleWorldDiscoveryInputs from 0.9.7');
    assert(fullSource.includes("from '../core/WorldEncounter.js'"), 'imports deriveWorldEncounters from 0.9.0');
    assert(fullSource.includes("from './WorldEncounterReadModel.js'"), 'imports describeWorldEncounterReadModel from 0.9.1');
    assert(fullSource.includes("from './WorldEncounterView.js'"), 'imports describeWorldEncounterView from 0.9.2');

    console.log('✓ Dependency direction: this file wires exactly the existing 0.9.0/0.9.1/0.9.2/0.9.7 chain');
}

console.log('\nAll world encounter integration tests passed.');
