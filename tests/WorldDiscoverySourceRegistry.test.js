import { readFile } from 'node:fs/promises';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import {
    describeLocalWorldDiscoverySource,
    describeWorldFromDiscoverySources
} from '../application/WorldEncounterIntegration.js';
import { describePeerWorldDiscoverySource } from '../peer/PeerWorldDataIngress.js';
import { describeWorldDiscoverySource } from '../core/WorldDiscoverySource.js';

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function connectedPeerOf(identityId) {
    return { remoteIdentity: identityId ? { identityId } : null };
}

// ---------------------------------------------------------------------
// 1. Flagship: the full lifecycle — a peer's source updates without
//    accumulating, disappears without leaving a trace, and returns as a
//    fresh contribution. Every World View along the way is produced by
//    handing registry.listSources() to 0.9.8's own
//    describeWorldFromDiscoverySources(), unmodified.
// ---------------------------------------------------------------------
{
    const registry = new WorldDiscoverySourceRegistry();
    const peerA = connectedPeerOf('did:key:zPeerA');
    const peerB = connectedPeerOf('did:key:zPeerB');

    registry.setSource(describeLocalWorldDiscoverySource({
        publications: [{ id: 'pub-P1', title: 'P1' }],
        placements: [{ id: 'placement-P1', publicationId: 'pub-P1', position: { x: 0, y: 0, z: 0 } }]
    }));
    registry.setSource(describePeerWorldDiscoverySource({
        avatarProfiles: [{ avatarId: 'avatar-A1', displayName: 'A1' }],
        avatarPresences: [{ avatarId: 'avatar-A1', position: { x: 1, y: 0, z: 1 } }]
    }, peerA));
    registry.setSource(describePeerWorldDiscoverySource({
        avatarProfiles: [{ avatarId: 'avatar-B1', displayName: 'B1' }],
        avatarPresences: [{ avatarId: 'avatar-B1', position: { x: 2, y: 0, z: 2 } }]
    }, peerB));

    let view = describeWorldFromDiscoverySources(registry.listSources());
    assert(view.avatars.map((a) => a.objectId).sort().join(',') === 'avatar-A1,avatar-B1', 'initial world has A1 and B1');
    assert(view.publications.length === 1 && view.publications[0].objectId === 'pub-P1', 'initial world has P1');

    // Peer A updates: A1 -> A2. The registry must reflect ONLY the
    // current Peer A contribution, never both.
    registry.setSource(describePeerWorldDiscoverySource({
        avatarProfiles: [{ avatarId: 'avatar-A2', displayName: 'A2' }],
        avatarPresences: [{ avatarId: 'avatar-A2', position: { x: 3, y: 0, z: 3 } }]
    }, peerA));

    view = describeWorldFromDiscoverySources(registry.listSources());
    const avatarIdsAfterUpdate = view.avatars.map((a) => a.objectId).sort();
    assert(avatarIdsAfterUpdate.join(',') === 'avatar-A2,avatar-B1', 'peer A update replaces A1 with A2, no accumulation of stale A1');
    assert(view.avatarCount === 2, 'exactly two avatars after replacement, never three');

    // Peer A disappears entirely.
    registry.removeSource('peer:did:key:zPeerA');
    view = describeWorldFromDiscoverySources(registry.listSources());
    assert(view.avatars.map((a) => a.objectId).join(',') === 'avatar-B1', 'peer A disappearing removes its entire contribution, no tombstone avatar');
    assert(view.publications.length === 1, 'local publication P1 is unaffected by peer A disappearing');

    // Peer A returns with a new avatar.
    registry.setSource(describePeerWorldDiscoverySource({
        avatarProfiles: [{ avatarId: 'avatar-A3', displayName: 'A3' }],
        avatarPresences: [{ avatarId: 'avatar-A3', position: { x: 4, y: 0, z: 4 } }]
    }, peerA));

    view = describeWorldFromDiscoverySources(registry.listSources());
    assert(view.avatars.map((a) => a.objectId).sort().join(',') === 'avatar-A3,avatar-B1', 'peer A returning contributes fresh A3, with no memory of A1/A2');
    assert(view.publications.length === 1 && view.avatarCount === 2 && view.totalCount === 3, 'final world reflects exactly the current source set: P1, B1, A3');

    console.log('✓ Flagship: update replaces without accumulating, disappearance leaves no trace, return is a fresh contribution');
}

// ---------------------------------------------------------------------
// 2. Replacement semantics in isolation: setSource() on an existing
//    origin replaces, it never appends a second entry for that origin.
// ---------------------------------------------------------------------
{
    const registry = new WorldDiscoverySourceRegistry();
    registry.setSource(describeWorldDiscoverySource({ origin: 'peer:X', publications: [{ id: 'first' }] }));
    registry.setSource(describeWorldDiscoverySource({ origin: 'peer:X', publications: [{ id: 'second' }] }));

    const sources = registry.listSources();
    assert(sources.length === 1, 'setSource() on an existing origin replaces rather than appending a second source');
    assert(sources[0].publications[0].id === 'second', 'the replaced source carries only the latest contribution');

    console.log('✓ Replacement: re-setting an origin replaces its source, never accumulates');
}

// ---------------------------------------------------------------------
// 3. Removal is plain absence: no tombstone, no residual entry, and a
//    no-op when removing an origin that was never present.
// ---------------------------------------------------------------------
{
    const registry = new WorldDiscoverySourceRegistry();
    registry.setSource(describeWorldDiscoverySource({ origin: 'peer:Y', publications: [{ id: 'p' }] }));
    registry.removeSource('peer:Y');

    assert(registry.listSources().length === 0, 'removing the only source leaves an empty registry, no trace');

    registry.removeSource('peer:never-existed');
    assert(registry.listSources().length === 0, 'removing an origin that was never set is a harmless no-op');

    console.log('✓ Removal: plain absence, no tombstone, no-op on an unknown origin');
}

// ---------------------------------------------------------------------
// 4. 'local' is not a privileged origin: it can be removed and re-added
//    exactly like any peer origin, with no special-casing.
// ---------------------------------------------------------------------
{
    const registry = new WorldDiscoverySourceRegistry();
    registry.setSource(describeLocalWorldDiscoverySource({ publications: [{ id: 'local-pub' }] }));
    assert(registry.listSources().length === 1, 'local occupies one slot like any other origin');

    registry.removeSource('local');
    assert(registry.listSources().length === 0, 'local can be removed exactly like a peer origin');

    registry.setSource(describeLocalWorldDiscoverySource({ publications: [{ id: 'local-pub-2' }] }));
    assert(registry.listSources().length === 1 && registry.listSources()[0].origin === 'local', 'local can be re-added exactly like a peer origin');

    console.log('✓ Local origin carries no special-cased lifecycle behavior');
}

// ---------------------------------------------------------------------
// 5. Ordering: first-set position is retained across an in-place update;
//    remove-then-re-add places the origin last, as a fresh entry.
// ---------------------------------------------------------------------
{
    const registry = new WorldDiscoverySourceRegistry();
    registry.setSource(describeWorldDiscoverySource({ origin: 'local', publications: [{ id: 'l1' }] }));
    registry.setSource(describeWorldDiscoverySource({ origin: 'peer:A', publications: [{ id: 'a1' }] }));
    registry.setSource(describeWorldDiscoverySource({ origin: 'peer:B', publications: [{ id: 'b1' }] }));

    assert(registry.listSources().map((s) => s.origin).join(',') === 'local,peer:A,peer:B', 'initial insertion order is preserved');

    registry.setSource(describeWorldDiscoverySource({ origin: 'peer:A', publications: [{ id: 'a2' }] }));
    assert(registry.listSources().map((s) => s.origin).join(',') === 'local,peer:A,peer:B', 'updating an existing origin does not move its position');

    registry.removeSource('peer:A');
    registry.setSource(describeWorldDiscoverySource({ origin: 'peer:A', publications: [{ id: 'a3' }] }));
    assert(registry.listSources().map((s) => s.origin).join(',') === 'local,peer:B,peer:A', 'remove-then-re-add places the origin last, as a fresh entry');

    console.log('✓ Ordering: stable position on update, last position on remove-then-re-add');
}

// ---------------------------------------------------------------------
// 6. Malformed input degrades silently, never throws, and never changes
//    registry state.
// ---------------------------------------------------------------------
{
    const registry = new WorldDiscoverySourceRegistry();

    for (const badSource of [undefined, null, {}, 'not-a-source', 7, { publications: [] }, { origin: '' }, { origin: 42 }]) {
        registry.setSource(badSource);
    }
    assert(registry.listSources().length === 0, 'malformed setSource() input never registers a source');

    for (const badOrigin of [undefined, null, '', 42, {}]) {
        registry.removeSource(badOrigin);
    }
    assert(registry.listSources().length === 0, 'malformed removeSource() input never throws and changes nothing');

    console.log('✓ Malformed input degrades silently for both setSource() and removeSource(), never throws');
}

// ---------------------------------------------------------------------
// 7. Freezing and reference identity: listSources() returns a fresh,
//    frozen array every call; the source objects inside are the exact
//    same references handed to setSource(), never cloned.
// ---------------------------------------------------------------------
{
    const registry = new WorldDiscoverySourceRegistry();
    const source = describeWorldDiscoverySource({ origin: 'peer:Z', publications: [{ id: 'z1' }] });
    registry.setSource(source);

    const first = registry.listSources();
    const second = registry.listSources();
    assert(Object.isFrozen(first), 'listSources() result is frozen');
    assert(first !== second, 'listSources() returns a fresh array on every call');
    assert(first[0] === source, 'the registry stores the exact same source reference, never a clone');

    console.log('✓ Freezing: fresh frozen array per call, source references preserved unchanged');
}

// ---------------------------------------------------------------------
// 8. clear() empties the registry and it behaves exactly as fresh
//    afterward.
// ---------------------------------------------------------------------
{
    const registry = new WorldDiscoverySourceRegistry();
    registry.setSource(describeWorldDiscoverySource({ origin: 'local', publications: [{ id: 'l1' }] }));
    registry.setSource(describeWorldDiscoverySource({ origin: 'peer:A', publications: [{ id: 'a1' }] }));
    registry.clear();

    assert(registry.listSources().length === 0, 'clear() removes every source');

    registry.setSource(describeWorldDiscoverySource({ origin: 'local', publications: [{ id: 'l2' }] }));
    assert(registry.listSources().length === 1 && registry.listSources()[0].origin === 'local', 'the registry accepts new sources normally after clear()');

    console.log('✓ clear() empties the registry and it works normally afterward');
}

// ---------------------------------------------------------------------
// 9. Per-instance isolation: two registries never share state.
// ---------------------------------------------------------------------
{
    const registryOne = new WorldDiscoverySourceRegistry();
    const registryTwo = new WorldDiscoverySourceRegistry();

    registryOne.setSource(describeWorldDiscoverySource({ origin: 'peer:A', publications: [{ id: 'a1' }] }));

    assert(registryOne.listSources().length === 1, 'registryOne holds the source it was given');
    assert(registryTwo.listSources().length === 0, 'registryTwo is unaffected by registryOne');

    console.log('✓ Per-instance isolation: two registries never share state');
}

// ---------------------------------------------------------------------
// 10. Architectural regression: forbidden imports and vocabulary — this
//     file is membership only, never a second projection algorithm.
// ---------------------------------------------------------------------
{
    const sourceUrl = new URL('../application/WorldDiscoverySourceRegistry.js', import.meta.url);
    const fullSource = await readFile(sourceUrl, 'utf8');
    const codeOnly = fullSource
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n');

    // No encounter derivation or assembly of any kind.
    assert(!codeOnly.includes('WorldEncounter'), 'WorldDiscoverySourceRegistry.js code must never reference WorldEncounter');
    assert(!codeOnly.includes('WorldDiscoverySourceAssembly'), 'WorldDiscoverySourceRegistry.js code must never reference WorldDiscoverySourceAssembly');
    assert(!codeOnly.includes('deriveWorldEncounters'), 'WorldDiscoverySourceRegistry.js code must never call deriveWorldEncounters');
    assert(!codeOnly.includes('assembleWorldDiscoveryInputs'), 'WorldDiscoverySourceRegistry.js code must never call assembleWorldDiscoveryInputs');
    assert(!codeOnly.includes('describeWorldFromDiscoverySources'), 'WorldDiscoverySourceRegistry.js code must never call describeWorldFromDiscoverySources');

    // No peer transport or network knowledge.
    assert(!codeOnly.includes('PeerMessageBus'), 'WorldDiscoverySourceRegistry.js code must never import PeerMessageBus');
    assert(!codeOnly.includes('PeerConnection'), 'WorldDiscoverySourceRegistry.js code must never reference PeerConnection');
    assert(!codeOnly.includes('PeerDiscoveryProvider'), 'WorldDiscoverySourceRegistry.js code must never reference PeerDiscoveryProvider');
    assert(!/fetch\(/.test(codeOnly), 'WorldDiscoverySourceRegistry.js code must never call fetch(...)');
    assert(!codeOnly.includes('WebSocket'), 'WorldDiscoverySourceRegistry.js code must never reference WebSocket');

    // No storage/persistence.
    assert(!codeOnly.includes('StorageProvider'), 'WorldDiscoverySourceRegistry.js code must never reference StorageProvider');
    assert(!/\blocalStorage\b/.test(codeOnly), 'WorldDiscoverySourceRegistry.js code must never reference localStorage');

    // No trust/tombstone/reconciliation vocabulary of any kind.
    const forbiddenTerms = [
        'trusted', 'trust(', 'verified', 'verify(', 'authority', 'priority', 'weight', 'confidence', 'ranking', 'scoring',
        'tombstone', 'revoke', 'invalidate', 'untrust', 'offline',
        'dedup', 'reconcile', 'winner'
    ];
    for (const term of forbiddenTerms) {
        assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `WorldDiscoverySourceRegistry.js code must never use "${term}"`);
    }

    console.log('✓ Architectural regression: forbidden imports and vocabulary');
}

console.log('\nAll world discovery source lifecycle tests passed.');
