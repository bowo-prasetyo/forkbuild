import { readFile } from 'node:fs/promises';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { describeWorldFromDiscoverySources } from '../application/WorldEncounterIntegration.js';
import {
    registerPeerWorldSource,
    unregisterPeerWorldSource
} from '../peer/PeerWorldDiscoveryLifecycleBridge.js';

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function connectedPeerOf(identityId) {
    return { remoteIdentity: identityId ? { identityId } : null };
}

// ---------------------------------------------------------------------
// 1. Flagship: a complete peer lifecycle — connect with a full payload,
//    update without accumulating, disconnect and leave no trace,
//    reconnect as a fresh contribution. No encounter logic is exercised
//    directly; every World View below comes from handing
//    registry.listSources() to 0.9.8's own describeWorldFromDiscoverySources().
// ---------------------------------------------------------------------
{
    const registry = new WorldDiscoverySourceRegistry();
    const peerA = connectedPeerOf('did:key:zPeerA');

    assert(describeWorldFromDiscoverySources(registry.listSources()).isEmpty === true, 'initial registry is empty');

    // Peer A connects with publication + placement + avatar.
    registerPeerWorldSource(registry, peerA, {
        publications: [{ id: 'pub-A1', title: 'A1' }],
        placements: [{ id: 'placement-A1', publicationId: 'pub-A1', position: { x: 0, y: 0, z: 0 } }],
        avatarProfiles: [{ avatarId: 'avatar-A1', displayName: 'A1' }],
        avatarPresences: [{ avatarId: 'avatar-A1', position: { x: 1, y: 0, z: 1 } }]
    });

    let sources = registry.listSources();
    assert(sources.length === 1 && sources[0].origin === 'peer:did:key:zPeerA', 'registering peer A creates exactly one peer:A source');

    let view = describeWorldFromDiscoverySources(sources);
    assert(view.avatars.length === 1 && view.avatars[0].objectId === 'avatar-A1', "A's avatar appears in the World projection");
    assert(view.publications.length === 1 && view.publications[0].objectId === 'pub-A1', "A's publication appears in the World projection");

    // Peer A sends updated World data — must replace, never accumulate.
    registerPeerWorldSource(registry, peerA, {
        publications: [{ id: 'pub-A1', title: 'A1 updated' }],
        placements: [{ id: 'placement-A1', publicationId: 'pub-A1', position: { x: 0, y: 0, z: 0 } }],
        avatarProfiles: [{ avatarId: 'avatar-A2', displayName: 'A2' }],
        avatarPresences: [{ avatarId: 'avatar-A2', position: { x: 5, y: 0, z: 5 } }]
    });

    sources = registry.listSources();
    assert(sources.length === 1 && sources[0].origin === 'peer:did:key:zPeerA', 'there is still exactly one peer:A source after an update, never two');

    view = describeWorldFromDiscoverySources(sources);
    assert(view.avatars.length === 1 && view.avatars[0].objectId === 'avatar-A2', "the World reflects only A's latest avatar");

    // Peer A disconnects.
    unregisterPeerWorldSource(registry, peerA);
    sources = registry.listSources();
    assert(sources.length === 0, 'disconnecting peer A leaves the registry empty');

    view = describeWorldFromDiscoverySources(sources);
    assert(view.isEmpty === true, "A's encounters disappear once disconnected");

    // Peer A reconnects.
    registerPeerWorldSource(registry, peerA, {
        avatarProfiles: [{ avatarId: 'avatar-A3', displayName: 'A3' }],
        avatarPresences: [{ avatarId: 'avatar-A3', position: { x: 9, y: 0, z: 9 } }]
    });
    sources = registry.listSources();
    assert(sources.length === 1 && sources[0].origin === 'peer:did:key:zPeerA', 'reconnecting peer A creates a fresh, single peer:A source');

    console.log('✓ Flagship: full peer lifecycle — connect, update, disconnect, reconnect — with no accumulation and no trace left behind');
}

// ---------------------------------------------------------------------
// 2. Identity isolation: two peers stay independent. Removing one never
//    touches the other.
// ---------------------------------------------------------------------
{
    const registry = new WorldDiscoverySourceRegistry();
    const peerA = connectedPeerOf('did:key:zAlice');
    const peerB = connectedPeerOf('did:key:zBob');

    registerPeerWorldSource(registry, peerA, { avatarProfiles: [{ avatarId: 'avatar-alice' }], avatarPresences: [{ avatarId: 'avatar-alice' }] });
    registerPeerWorldSource(registry, peerB, { avatarProfiles: [{ avatarId: 'avatar-bob' }], avatarPresences: [{ avatarId: 'avatar-bob' }] });

    assert(registry.listSources().length === 2, 'both peers are registered independently');

    unregisterPeerWorldSource(registry, peerA);
    const sources = registry.listSources();
    assert(sources.length === 1 && sources[0].origin === 'peer:did:key:zBob', "removing Alice never removes Bob's source");

    console.log('✓ Identity isolation: removing one peer never removes another');
}

// ---------------------------------------------------------------------
// 3. Replacement: two successive payloads from the same peer replace the
//    source rather than accumulate it (isolated from the flagship).
// ---------------------------------------------------------------------
{
    const registry = new WorldDiscoverySourceRegistry();
    const peer = connectedPeerOf('did:key:zReplace');

    registerPeerWorldSource(registry, peer, { publications: [{ id: 'first' }] });
    registerPeerWorldSource(registry, peer, { publications: [{ id: 'second' }] });

    const sources = registry.listSources();
    assert(sources.length === 1, 'a second payload from the same peer replaces the first, never accumulates a second entry');
    assert(sources[0].publications.length === 1 && sources[0].publications[0].id === 'second', 'only the latest payload is retained');

    console.log('✓ Replacement: repeated registration from one peer never accumulates');
}

// ---------------------------------------------------------------------
// 4. Malformed payload on an established peer: the peer's source becomes
//    a valid, empty source — replacing whatever it contributed before —
//    never silently retaining the stale data, and never leaving no entry
//    at all.
// ---------------------------------------------------------------------
{
    const registry = new WorldDiscoverySourceRegistry();
    const peer = connectedPeerOf('did:key:zMalformed');

    registerPeerWorldSource(registry, peer, { publications: [{ id: 'stale' }] });
    assert(registry.listSources()[0].publications.length === 1, 'the peer starts with one publication');

    registerPeerWorldSource(registry, peer, 'not-an-object');

    const sources = registry.listSources();
    assert(sources.length === 1 && sources[0].origin === 'peer:did:key:zMalformed', 'a malformed payload still replaces the peer\'s one source, never removing it outright');
    assert(sources[0].publications.length === 0, 'the malformed payload empties the peer\'s contribution rather than retaining the stale publication');

    console.log('✓ Malformed payload: an established peer\'s source becomes empty, replacing stale data rather than retaining it');
}

// ---------------------------------------------------------------------
// 5. Invalid identity: a peer without an established identity never
//    creates a registry entry.
// ---------------------------------------------------------------------
{
    const registry = new WorldDiscoverySourceRegistry();

    registerPeerWorldSource(registry, null, { publications: [{ id: 'p' }] });
    registerPeerWorldSource(registry, {}, { publications: [{ id: 'p' }] });
    registerPeerWorldSource(registry, connectedPeerOf(null), { publications: [{ id: 'p' }] });
    registerPeerWorldSource(registry, connectedPeerOf(''), { publications: [{ id: 'p' }] });

    assert(registry.listSources().length === 0, 'a peer with no established identity never creates a registry entry');

    console.log('✓ Invalid identity: no registry entry is created without an established identity');
}

// ---------------------------------------------------------------------
// 6. Disconnect is harmless when the peer is already absent — never set,
//    or already removed.
// ---------------------------------------------------------------------
{
    const registry = new WorldDiscoverySourceRegistry();
    const peer = connectedPeerOf('did:key:zNeverConnected');

    unregisterPeerWorldSource(registry, peer);
    assert(registry.listSources().length === 0, 'disconnecting a peer that was never registered is harmless');

    registerPeerWorldSource(registry, peer, { publications: [{ id: 'p' }] });
    unregisterPeerWorldSource(registry, peer);
    unregisterPeerWorldSource(registry, peer);
    assert(registry.listSources().length === 0, 'disconnecting an already-absent peer a second time is harmless');

    unregisterPeerWorldSource(registry, null);
    unregisterPeerWorldSource(registry, {});
    unregisterPeerWorldSource(registry, connectedPeerOf(''));
    assert(registry.listSources().length === 0, 'disconnecting with no established identity never throws and changes nothing');

    console.log('✓ Disconnect: harmless when the peer is already absent, in every form');
}

// ---------------------------------------------------------------------
// 7. Malformed registry input degrades silently, never throws.
// ---------------------------------------------------------------------
{
    const peer = connectedPeerOf('did:key:zBadRegistry');
    for (const badRegistry of [undefined, null, {}, 'not-a-registry', 7, { setSource: 'nope' }]) {
        registerPeerWorldSource(badRegistry, peer, { publications: [{ id: 'p' }] });
        unregisterPeerWorldSource(badRegistry, peer);
    }
    console.log('✓ Malformed registry input degrades silently, never throws');
}

// ---------------------------------------------------------------------
// 8. Architectural regression: forbidden imports and vocabulary — this
//    file is a lifecycle-to-registry translator, never a World
//    computation of its own.
// ---------------------------------------------------------------------
{
    const sourceUrl = new URL('../peer/PeerWorldDiscoveryLifecycleBridge.js', import.meta.url);
    const fullSource = await readFile(sourceUrl, 'utf8');
    const codeOnly = fullSource
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n');

    // No World computation of any kind.
    assert(!codeOnly.includes('WorldEncounter'), 'PeerWorldDiscoveryLifecycleBridge.js code must never reference WorldEncounter');
    assert(!codeOnly.includes('deriveWorldEncounters'), 'PeerWorldDiscoveryLifecycleBridge.js code must never call deriveWorldEncounters');
    assert(!codeOnly.includes('assembleWorldDiscoveryInputs'), 'PeerWorldDiscoveryLifecycleBridge.js code must never call assembleWorldDiscoveryInputs');
    assert(!codeOnly.includes('describeWorldFromDiscoverySources'), 'PeerWorldDiscoveryLifecycleBridge.js code must never call describeWorldFromDiscoverySources');
    assert(!codeOnly.includes('describeWorldFromDiscoveryRegistry'), 'PeerWorldDiscoveryLifecycleBridge.js code must never call describeWorldFromDiscoveryRegistry');
    assert(!codeOnly.includes('WorldDiscoveryRegistryProjection'), 'PeerWorldDiscoveryLifecycleBridge.js code must never import WorldDiscoveryRegistryProjection');

    // No UI, storage, or cryptographic verification.
    assert(!codeOnly.includes('StorageProvider'), 'PeerWorldDiscoveryLifecycleBridge.js code must never reference StorageProvider');
    assert(!/\blocalStorage\b/.test(codeOnly), 'PeerWorldDiscoveryLifecycleBridge.js code must never reference localStorage');
    assert(!codeOnly.toLowerCase().includes('verify'), 'PeerWorldDiscoveryLifecycleBridge.js code must never reference verification');
    assert(!codeOnly.includes('.vue'), 'PeerWorldDiscoveryLifecycleBridge.js code must never reference a Vue component');

    // No peer transport or connection management.
    assert(!codeOnly.includes('PeerMessageBus'), 'PeerWorldDiscoveryLifecycleBridge.js code must never import PeerMessageBus');
    assert(!codeOnly.includes('PeerConnectionProvider'), 'PeerWorldDiscoveryLifecycleBridge.js code must never reference PeerConnectionProvider');
    assert(!codeOnly.includes('WebRtcPeerConnection'), 'PeerWorldDiscoveryLifecycleBridge.js code must never reference WebRtcPeerConnection');
    assert(!codeOnly.includes('RTCPeerConnection'), 'PeerWorldDiscoveryLifecycleBridge.js code must never reference RTCPeerConnection');
    assert(!/fetch\(/.test(codeOnly), 'PeerWorldDiscoveryLifecycleBridge.js code must never call fetch(...)');
    assert(!codeOnly.includes('WebSocket'), 'PeerWorldDiscoveryLifecycleBridge.js code must never reference WebSocket');

    // No trust/reconciliation vocabulary of any kind.
    const forbiddenTerms = ['trusted', 'trust(', 'verified', 'authority', 'priority', 'weight', 'confidence', 'dedup', 'reconcile', 'tombstone'];
    for (const term of forbiddenTerms) {
        assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `PeerWorldDiscoveryLifecycleBridge.js code must never use "${term}"`);
    }

    // No persistent service state: no class, no timer, no subscription mechanism of this file's own.
    assert(!/\bclass\s+\w/.test(codeOnly), 'PeerWorldDiscoveryLifecycleBridge.js code must never declare a class');
    assert(!/setInterval|setTimeout/.test(codeOnly), 'PeerWorldDiscoveryLifecycleBridge.js code must never use a timer');

    console.log('✓ Architectural regression: forbidden imports and vocabulary');
}

// ---------------------------------------------------------------------
// 9. Dependency direction: this file obtains its source exclusively
//    through 0.9.6's own ingress functions, and mutates membership
//    exclusively through the registry's own setSource()/removeSource().
// ---------------------------------------------------------------------
{
    const sourceUrl = new URL('../peer/PeerWorldDiscoveryLifecycleBridge.js', import.meta.url);
    const fullSource = await readFile(sourceUrl, 'utf8');

    assert(fullSource.includes("from './PeerWorldDataIngress.js'"), 'imports from 0.9.6\'s own PeerWorldDataIngress.js');
    assert(fullSource.includes('describePeerWorldDiscoverySource'), 'uses 0.9.6\'s own describePeerWorldDiscoverySource for registration');
    assert(fullSource.includes('derivePeerWorldOrigin'), 'uses 0.9.6\'s own derivePeerWorldOrigin for the disconnect-side origin');
    assert(fullSource.includes('registry.setSource'), 'registration calls registry.setSource()');
    assert(fullSource.includes('registry.removeSource'), 'disconnection calls registry.removeSource()');
    assert(!fullSource.includes("from '../core/"), 'never imports directly from core/ — 0.9.6 remains the one seam this file depends on for describing a source');
    assert(!fullSource.includes("from '../application/"), 'never imports from application/ — this file receives a registry instance, it never constructs or looks one up itself');

    console.log('✓ Dependency direction: 0.9.6\'s ingress in, registry mutation out, nothing else');
}

console.log('\nAll peer world discovery lifecycle bridge tests passed.');
