import { readFile } from 'node:fs/promises';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import {
    describeLocalWorldDiscoverySource,
    describeWorldFromDiscoverySources
} from '../application/WorldEncounterIntegration.js';
import { describeWorldFromDiscoveryRegistry } from '../application/WorldDiscoveryRegistryProjection.js';
import { describePeerWorldDiscoverySource } from '../peer/PeerWorldDataIngress.js';
import { describeWorldDiscoverySource } from '../core/WorldDiscoverySource.js';

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function connectedPeerOf(identityId) {
    return { remoteIdentity: identityId ? { identityId } : null };
}

// ---------------------------------------------------------------------
// 1. Flagship: local + Alice + Bob project through the registry; removing
//    Alice makes her encounters disappear; re-setting Alice replaces her
//    contribution rather than duplicating it. This is the exact scenario
//    0.9.10 exists to validate: the World View can be derived from the
//    registry's own current membership snapshot.
// ---------------------------------------------------------------------
{
    const registry = new WorldDiscoverySourceRegistry();
    const alice = connectedPeerOf('did:key:zAlice');
    const bob = connectedPeerOf('did:key:zBob');

    registry.setSource(describeLocalWorldDiscoverySource({
        publications: [{ id: 'pub-local', title: 'Local Pub' }],
        placements: [{ id: 'placement-local', publicationId: 'pub-local', position: { x: 0, y: 0, z: 0 } }]
    }));
    registry.setSource(describePeerWorldDiscoverySource({
        avatarProfiles: [{ avatarId: 'avatar-alice', displayName: 'Alice' }],
        avatarPresences: [{ avatarId: 'avatar-alice', position: { x: 1, y: 0, z: 1 } }]
    }, alice));
    registry.setSource(describePeerWorldDiscoverySource({
        avatarProfiles: [{ avatarId: 'avatar-bob', displayName: 'Bob' }],
        avatarPresences: [{ avatarId: 'avatar-bob', position: { x: 2, y: 0, z: 2 } }]
    }, bob));

    let view = describeWorldFromDiscoveryRegistry(registry);
    assert(view.publications.length === 1 && view.publications[0].objectId === 'pub-local', 'local publication appears');
    assert(view.avatars.map((a) => a.objectId).sort().join(',') === 'avatar-alice,avatar-bob', 'Alice and Bob both appear');
    assert(view.totalCount === 3, 'total reflects local + Alice + Bob');

    // Alice disappears entirely.
    registry.removeSource('peer:did:key:zAlice');
    view = describeWorldFromDiscoveryRegistry(registry);
    assert(view.avatars.map((a) => a.objectId).join(',') === 'avatar-bob', 'removing Alice makes her encounters disappear');
    assert(view.publications.length === 1, 'the local publication is unaffected by Alice disappearing');

    // Alice's source is replaced, not duplicated, on re-set.
    registry.setSource(describePeerWorldDiscoverySource({
        avatarProfiles: [{ avatarId: 'avatar-alice-2', displayName: 'Alice' }],
        avatarPresences: [{ avatarId: 'avatar-alice-2', position: { x: 9, y: 0, z: 9 } }]
    }, alice));
    registry.setSource(describePeerWorldDiscoverySource({
        avatarProfiles: [{ avatarId: 'avatar-alice-2', displayName: 'Alice' }],
        avatarPresences: [{ avatarId: 'avatar-alice-2', position: { x: 9, y: 0, z: 9 } }]
    }, alice));

    view = describeWorldFromDiscoveryRegistry(registry);
    assert(view.avatarCount === 2, 'Alice\'s old contribution is replaced, never accumulated alongside the new one');
    assert(view.avatars.map((a) => a.objectId).sort().join(',') === 'avatar-alice-2,avatar-bob', 'the World reflects Alice\'s latest contribution only');

    console.log('✓ Flagship: registry-backed projection reflects current membership — disappearance and replacement both survive');
}

// ---------------------------------------------------------------------
// 2. The projection is byte-equivalent to calling
//    describeWorldFromDiscoverySources(registry.listSources()) directly —
//    this file adds no field and changes no shape.
// ---------------------------------------------------------------------
{
    const registry = new WorldDiscoverySourceRegistry();
    registry.setSource(describeLocalWorldDiscoverySource({
        publications: [{ id: 'pub-1' }],
        placements: [{ id: 'placement-1', publicationId: 'pub-1', position: { x: 0, y: 0, z: 0 } }]
    }));
    registry.setSource(describePeerWorldDiscoverySource(
        { avatarProfiles: [{ avatarId: 'avatar-1', displayName: 'One' }], avatarPresences: [{ avatarId: 'avatar-1', position: { x: 1, y: 0, z: 1 } }] },
        connectedPeerOf('did:key:zOne')
    ));

    const viaRegistry = describeWorldFromDiscoveryRegistry(registry);
    const viaDirectCall = describeWorldFromDiscoverySources(registry.listSources());

    assert(JSON.stringify(viaRegistry) === JSON.stringify(viaDirectCall), 'the registry-backed projection matches calling describeWorldFromDiscoverySources() directly, field for field');
    assert(Object.keys(viaRegistry).sort().join(',') === 'avatarCount,avatars,isEmpty,publicationCount,publications,totalCount', 'the view carries exactly the 0.9.8 shape, no registry-shaped fields added');

    console.log('✓ Shape equivalence: identical to calling 0.9.8 directly on listSources(), no added fields');
}

// ---------------------------------------------------------------------
// 3. Empty registry produces the same valid empty World View as calling
//    describeWorldFromDiscoverySources() with no sources.
// ---------------------------------------------------------------------
{
    const registry = new WorldDiscoverySourceRegistry();
    const view = describeWorldFromDiscoveryRegistry(registry);

    assert(view.isEmpty === true, 'an empty registry produces an empty view');
    assert(view.publicationCount === 0 && view.avatarCount === 0 && view.totalCount === 0, 'an empty registry produces all-zero counts');
    assert(Array.isArray(view.publications) && view.publications.length === 0, 'publications is an empty array');
    assert(Array.isArray(view.avatars) && view.avatars.length === 0, 'avatars is an empty array');

    console.log('✓ Empty registry: produces the same valid empty World View as 0.9.8');
}

// ---------------------------------------------------------------------
// 4. Snapshot, not subscription: mutating the registry after a call does
//    not retroactively change a result already returned; a fresh call is
//    required to observe the new membership.
// ---------------------------------------------------------------------
{
    const registry = new WorldDiscoverySourceRegistry();
    registry.setSource(describeWorldDiscoverySource({ origin: 'peer:X', publications: [{ id: 'p1' }], placements: [{ id: 'pl1', publicationId: 'p1', position: { x: 0, y: 0, z: 0 } }] }));

    const firstView = describeWorldFromDiscoveryRegistry(registry);
    registry.setSource(describeWorldDiscoverySource({ origin: 'peer:Y', publications: [{ id: 'p2' }], placements: [{ id: 'pl2', publicationId: 'p2', position: { x: 1, y: 0, z: 1 } }] }));

    assert(firstView.publicationCount === 1, 'a previously returned view is untouched by a later registry mutation');

    const secondView = describeWorldFromDiscoveryRegistry(registry);
    assert(secondView.publicationCount === 2, 'a fresh call reflects the registry\'s new membership');

    console.log('✓ Snapshot, not subscription: past results are frozen in time, a new call sees new membership');
}

// ---------------------------------------------------------------------
// 5. Malformed input degrades to an empty, well-formed view, never
//    throws — a registry-shaped object with no listSources() included.
// ---------------------------------------------------------------------
{
    for (const badRegistry of [undefined, null, {}, 'not-a-registry', 7, { listSources: 'not-a-function' }]) {
        const view = describeWorldFromDiscoveryRegistry(badRegistry);
        assert(view.isEmpty === true, `malformed registry ${JSON.stringify(badRegistry)}: degrades to an empty view`);
        assert(view.totalCount === 0, `malformed registry ${JSON.stringify(badRegistry)}: totalCount is zero`);
    }

    console.log('✓ Malformed registry input degrades to an empty, well-formed view, never throws');
}

// ---------------------------------------------------------------------
// 6. Freezing: the returned view is frozen throughout, exactly like a
//    direct call to describeWorldFromDiscoverySources().
// ---------------------------------------------------------------------
{
    const registry = new WorldDiscoverySourceRegistry();
    registry.setSource(describeLocalWorldDiscoverySource({
        publications: [{ id: 'pub-F1' }],
        placements: [{ id: 'placement-F1', publicationId: 'pub-F1', position: { x: 0, y: 0, z: 0 } }]
    }));

    const view = describeWorldFromDiscoveryRegistry(registry);
    assert(Object.isFrozen(view), 'the returned view is frozen');
    assert(Object.isFrozen(view.publications), 'view.publications is frozen');
    assert(Object.isFrozen(view.avatars), 'view.avatars is frozen');

    console.log('✓ Freezing: the returned view is frozen throughout');
}

// ---------------------------------------------------------------------
// 7. Architectural regression: forbidden imports and vocabulary — this
//     file is a one-call bridge, never a second projection algorithm and
//     never a source of registry-shaped fields.
// ---------------------------------------------------------------------
{
    const sourceUrl = new URL('../application/WorldDiscoveryRegistryProjection.js', import.meta.url);
    const fullSource = await readFile(sourceUrl, 'utf8');
    const codeOnly = fullSource
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n');

    // No second discovery/projection algorithm.
    assert(!codeOnly.includes('deriveWorldEncounters'), 'WorldDiscoveryRegistryProjection.js code must never call deriveWorldEncounters');
    assert(!codeOnly.includes('assembleWorldDiscoveryInputs'), 'WorldDiscoveryRegistryProjection.js code must never call assembleWorldDiscoveryInputs');
    assert(!codeOnly.includes('describeWorldEncounterReadModel'), 'WorldDiscoveryRegistryProjection.js code must never call describeWorldEncounterReadModel');
    assert(!codeOnly.includes('describeWorldEncounterView'), 'WorldDiscoveryRegistryProjection.js code must never call describeWorldEncounterView');

    // No peer transport or network knowledge.
    assert(!codeOnly.includes('PeerMessageBus'), 'WorldDiscoveryRegistryProjection.js code must never import PeerMessageBus');
    assert(!codeOnly.includes('PeerConnection'), 'WorldDiscoveryRegistryProjection.js code must never reference PeerConnection');
    assert(!codeOnly.includes('PeerDiscoveryProvider'), 'WorldDiscoveryRegistryProjection.js code must never reference PeerDiscoveryProvider');
    assert(!/fetch\(/.test(codeOnly), 'WorldDiscoveryRegistryProjection.js code must never call fetch(...)');
    assert(!codeOnly.includes('WebSocket'), 'WorldDiscoveryRegistryProjection.js code must never reference WebSocket');
    assert(!codeOnly.includes('RTCPeerConnection'), 'WorldDiscoveryRegistryProjection.js code must never reference RTCPeerConnection');

    // No storage or verification.
    assert(!codeOnly.includes('StorageProvider'), 'WorldDiscoveryRegistryProjection.js code must never reference StorageProvider');
    assert(!/\blocalStorage\b/.test(codeOnly), 'WorldDiscoveryRegistryProjection.js code must never reference localStorage');
    assert(!codeOnly.toLowerCase().includes('verify'), 'WorldDiscoveryRegistryProjection.js code must never reference verification');

    // No registry-shaped fields leaking into the view.
    const forbiddenFields = ['sourceCount', 'peerCount', 'onlinePeerCount', 'localCount'];
    for (const field of forbiddenFields) {
        assert(!codeOnly.includes(field), `WorldDiscoveryRegistryProjection.js code must never introduce "${field}"`);
    }

    // No source-content interpretation.
    assert(!codeOnly.includes('.origin'), 'WorldDiscoveryRegistryProjection.js code must never inspect source.origin');

    // No per-record loop of this file's own invention.
    assert(!/\.map\(/.test(codeOnly), 'WorldDiscoveryRegistryProjection.js code must never call .map(...) itself');
    assert(!/\.filter\(/.test(codeOnly), 'WorldDiscoveryRegistryProjection.js code must never call .filter(...) itself');
    assert(!/for\s*\(/.test(codeOnly), 'WorldDiscoveryRegistryProjection.js code must never write its own for-loop');

    console.log('✓ Architectural regression: forbidden imports, vocabulary, and leaked fields');
}

// ---------------------------------------------------------------------
// 8. Dependency direction: this file obtains sources exclusively through
//    registry.listSources() and delegates exclusively to 0.9.8's own
//    describeWorldFromDiscoverySources().
// ---------------------------------------------------------------------
{
    const sourceUrl = new URL('../application/WorldDiscoveryRegistryProjection.js', import.meta.url);
    const fullSource = await readFile(sourceUrl, 'utf8');

    assert(fullSource.includes("from './WorldEncounterIntegration.js'"), 'imports describeWorldFromDiscoverySources from 0.9.8');
    assert(fullSource.includes('listSources'), 'reads sources through registry.listSources()');
    assert(!fullSource.includes("from '../core/"), 'never imports directly from core/ — 0.9.8 remains the one seam this file depends on');

    console.log('✓ Dependency direction: registry.listSources() in, describeWorldFromDiscoverySources() out, nothing else');
}

console.log('\nAll world discovery registry projection tests passed.');
