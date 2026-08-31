import { readFile } from 'node:fs/promises';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { describeWorldFromDiscoveryRegistry } from '../application/WorldDiscoveryRegistryProjection.js';
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
// 1. Flagship: the running World stays in sync purely by re-projecting
//    on notification — 0.9.10's own describeWorldFromDiscoveryRegistry()
//    is called unmodified, only ever in reaction to a subscribe()
//    notification, never polled.
// ---------------------------------------------------------------------
{
    const registry = new WorldDiscoverySourceRegistry();
    let world = describeWorldFromDiscoveryRegistry(registry);
    let notificationCount = 0;

    const unsubscribe = registry.subscribe(() => {
        notificationCount += 1;
        world = describeWorldFromDiscoveryRegistry(registry);
    });

    registry.setSource(describeLocalWorldDiscoverySource({
        publications: [{ id: 'pub-P1', title: 'P1' }],
        placements: [{ id: 'placement-P1', publicationId: 'pub-P1', position: { x: 0, y: 0, z: 0 } }]
    }));
    assert(notificationCount === 1, 'registering local notifies once');
    assert(world.publications.length === 1 && world.avatars.length === 0, 'World initially has only local encounters');

    // A peer connects.
    const peerA = connectedPeerOf('did:key:zPeerA');
    registry.setSource(describePeerWorldDiscoverySource({
        avatarProfiles: [{ avatarId: 'avatar-A1', displayName: 'A1' }],
        avatarPresences: [{ avatarId: 'avatar-A1', position: { x: 1, y: 0, z: 1 } }]
    }, peerA));
    assert(notificationCount === 2, 'peer A connecting notifies once');
    assert(world.avatars.length === 1 && world.avatars[0].objectId === 'avatar-A1', 'World gains peer A\'s encounter purely from re-projecting on notification');

    // Peer A's source is replaced with updated data.
    registry.setSource(describePeerWorldDiscoverySource({
        avatarProfiles: [{ avatarId: 'avatar-A2', displayName: 'A2' }],
        avatarPresences: [{ avatarId: 'avatar-A2', position: { x: 3, y: 0, z: 3 } }]
    }, peerA));
    assert(notificationCount === 3, 'peer A updating notifies once');
    assert(world.avatars.length === 1 && world.avatars[0].objectId === 'avatar-A2', 'World reflects only A\'s latest avatar, never the old one alongside it');

    // Peer A disconnects.
    registry.removeSource('peer:did:key:zPeerA');
    assert(notificationCount === 4, 'peer A disconnecting notifies once');
    assert(world.avatars.length === 0, 'World no longer contains peer A\'s encounters once disconnected');
    assert(world.publications.length === 1, 'local publication is unaffected by peer A\'s disconnect');

    unsubscribe();
    registry.setSource(describeLocalWorldDiscoverySource({ publications: [{ id: 'pub-P2', title: 'P2' }] }));
    assert(notificationCount === 4, 'no further notification is delivered once unsubscribed');
    assert(world.publications.length === 1, 'the stale World view is never updated again after unsubscribe — a caller must resubscribe to keep observing');

    console.log('✓ Flagship: a subscriber re-projecting on notification tracks the full dynamic lifecycle — connect, update, disconnect');
}

// ---------------------------------------------------------------------
// 2. Notification rule: setSource() notifies on every successful store,
//    including replacing an origin with a structurally identical source
//    — no equality comparison suppresses it. Malformed input never
//    notifies.
// ---------------------------------------------------------------------
{
    const registry = new WorldDiscoverySourceRegistry();
    let count = 0;
    registry.subscribe(() => { count += 1; });

    registry.setSource(describeWorldDiscoverySource({ origin: 'peer:X', publications: [{ id: 'p' }] }));
    assert(count === 1, 'first setSource() notifies');

    registry.setSource(describeWorldDiscoverySource({ origin: 'peer:X', publications: [{ id: 'p' }] }));
    assert(count === 2, 'setSource() with a structurally identical source still notifies — no structural equality suppression');

    for (const badSource of [undefined, null, {}, 'not-a-source', 7, { origin: '' }]) {
        registry.setSource(badSource);
    }
    assert(count === 2, 'malformed setSource() input never notifies');

    console.log('✓ Notification rule: setSource() notifies on every successful store, never on malformed input, with no structural equality suppression');
}

// ---------------------------------------------------------------------
// 3. Notification rule: removeSource() notifies only when the origin
//    actually existed; clear() notifies only when the registry actually
//    held something.
// ---------------------------------------------------------------------
{
    const registry = new WorldDiscoverySourceRegistry();
    let count = 0;
    registry.subscribe(() => { count += 1; });

    registry.removeSource('peer:never-existed');
    assert(count === 0, 'removing an origin that was never set never notifies');

    registry.setSource(describeWorldDiscoverySource({ origin: 'peer:Y', publications: [] }));
    assert(count === 1, 'setSource() notifies');

    registry.removeSource('peer:Y');
    assert(count === 2, 'removing an origin that existed notifies');

    registry.removeSource('peer:Y');
    assert(count === 2, 'removing an already-absent origin a second time never notifies again');

    for (const badOrigin of [undefined, null, '', 42, {}]) {
        registry.removeSource(badOrigin);
    }
    assert(count === 2, 'malformed removeSource() input never notifies');

    // clear() on an empty registry never notifies.
    registry.clear();
    assert(count === 2, 'clear() on an already-empty registry never notifies');

    registry.setSource(describeWorldDiscoverySource({ origin: 'local', publications: [] }));
    assert(count === 3, 'setSource() notifies');

    registry.clear();
    assert(count === 4, 'clear() on a non-empty registry notifies exactly once, regardless of how many sources it held');

    console.log('✓ Notification rule: removeSource() and clear() notify only on an actual change, never on a no-op');
}

// ---------------------------------------------------------------------
// 4. Subscriber isolation: a throwing listener never prevents another
//    subscriber from running, and never prevents the triggering mutation
//    itself from completing normally.
// ---------------------------------------------------------------------
{
    const registry = new WorldDiscoverySourceRegistry();
    let secondListenerRan = false;

    registry.subscribe(() => {
        throw new Error('a deliberately broken subscriber');
    });
    registry.subscribe(() => {
        secondListenerRan = true;
    });

    let threw = false;
    try {
        registry.setSource(describeWorldDiscoverySource({ origin: 'peer:Z', publications: [] }));
    } catch (error) {
        threw = true;
    }

    assert(threw === false, 'a throwing subscriber never propagates out of setSource()');
    assert(secondListenerRan === true, 'a throwing subscriber never prevents a later subscriber from running');
    assert(registry.listSources().length === 1, 'the mutation itself completes normally despite a throwing subscriber');

    console.log('✓ Subscriber isolation: a throwing listener harms neither another subscriber nor the triggering mutation');
}

// ---------------------------------------------------------------------
// 5. Unsubscribe correctness: idempotent, permanent, and safe to call
//    from inside another listener mid-notification.
// ---------------------------------------------------------------------
{
    const registry = new WorldDiscoverySourceRegistry();
    let count = 0;
    const unsubscribe = registry.subscribe(() => { count += 1; });

    unsubscribe();
    registry.setSource(describeWorldDiscoverySource({ origin: 'peer:A', publications: [] }));
    assert(count === 0, 'no notification is delivered once unsubscribed');

    unsubscribe();
    unsubscribe();
    registry.setSource(describeWorldDiscoverySource({ origin: 'peer:B', publications: [] }));
    assert(count === 0, 'calling unsubscribe() more than once is a harmless no-op, never an error and never affecting a later subscription');

    // Unsubscribing another, still-active listener from inside a
    // notification takes effect for the very next mutation.
    const registryTwo = new WorldDiscoverySourceRegistry();
    let laterCount = 0;
    let unsubscribeLater;
    registryTwo.subscribe(() => {
        unsubscribeLater();
    });
    unsubscribeLater = registryTwo.subscribe(() => { laterCount += 1; });

    registryTwo.setSource(describeWorldDiscoverySource({ origin: 'peer:C', publications: [] }));
    registryTwo.setSource(describeWorldDiscoverySource({ origin: 'peer:D', publications: [] }));
    assert(laterCount <= 1, 'unsubscribing another listener from inside a notification takes effect no later than the very next mutation');

    console.log('✓ Unsubscribe: idempotent, permanent, and safe to call mid-notification');
}

// ---------------------------------------------------------------------
// 6. Each subscribe() call is an independent subscription: subscribing
//    the same function reference twice registers two subscriptions, each
//    with its own unsubscribe().
// ---------------------------------------------------------------------
{
    const registry = new WorldDiscoverySourceRegistry();
    let count = 0;
    const listener = () => { count += 1; };

    const unsubscribeFirst = registry.subscribe(listener);
    registry.subscribe(listener);

    registry.setSource(describeWorldDiscoverySource({ origin: 'peer:A', publications: [] }));
    assert(count === 2, 'subscribing the same function twice registers two independent subscriptions, both notified');

    unsubscribeFirst();
    registry.setSource(describeWorldDiscoverySource({ origin: 'peer:B', publications: [] }));
    assert(count === 3, 'unsubscribing one of the two subscriptions leaves the other active — no shared identity-based state');

    console.log('✓ Independent subscriptions: repeated subscribe() calls for the same function are never collapsed into one');
}

// ---------------------------------------------------------------------
// 7. Malformed subscribe() input degrades silently: a non-function
//    listener registers nothing, never throws, and still returns a
//    safely callable unsubscribe.
// ---------------------------------------------------------------------
{
    const registry = new WorldDiscoverySourceRegistry();

    for (const badListener of [undefined, null, 'not-a-function', 7, {}]) {
        const unsubscribe = registry.subscribe(badListener);
        assert(typeof unsubscribe === 'function', 'subscribe() always returns a callable unsubscribe, even for malformed input');
        unsubscribe();
    }

    registry.setSource(describeWorldDiscoverySource({ origin: 'peer:A', publications: [] }));
    assert(registry.listSources().length === 1, 'malformed subscribe() calls never interfere with ordinary registry mutation');

    console.log('✓ Malformed subscribe() input degrades silently, never throws, and yields a harmless unsubscribe');
}

// ---------------------------------------------------------------------
// 8. listener() is called with no arguments.
// ---------------------------------------------------------------------
{
    const registry = new WorldDiscoverySourceRegistry();
    let receivedArgumentCount = null;

    registry.subscribe((...args) => {
        receivedArgumentCount = args.length;
    });
    registry.setSource(describeWorldDiscoverySource({ origin: 'peer:A', publications: [] }));

    assert(receivedArgumentCount === 0, 'the listener is invoked with no arguments — a subscriber reads listSources() itself');

    console.log('✓ listener() carries no event payload — called with zero arguments');
}

// ---------------------------------------------------------------------
// 9. Per-instance listener isolation: subscribing to one registry never
//    notifies a listener on another registry.
// ---------------------------------------------------------------------
{
    const registryOne = new WorldDiscoverySourceRegistry();
    const registryTwo = new WorldDiscoverySourceRegistry();
    let registryOneCount = 0;
    let registryTwoCount = 0;

    registryOne.subscribe(() => { registryOneCount += 1; });
    registryTwo.subscribe(() => { registryTwoCount += 1; });

    registryOne.setSource(describeWorldDiscoverySource({ origin: 'peer:A', publications: [] }));
    assert(registryOneCount === 1 && registryTwoCount === 0, 'a mutation on one registry never notifies a subscriber on another registry');

    console.log('✓ Per-instance listener isolation: two registries never share subscribers');
}

// ---------------------------------------------------------------------
// 10. Architectural regression: the notification seam adds no forbidden
//     import or vocabulary — this remains membership state, never a
//     second World computation, event-payload model, or trust engine.
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
    assert(!codeOnly.includes('describeWorldFromDiscoveryRegistry'), 'WorldDiscoverySourceRegistry.js code must never call describeWorldFromDiscoveryRegistry');

    // No peer transport, network, or UI framework knowledge.
    assert(!codeOnly.includes('PeerMessageBus'), 'WorldDiscoverySourceRegistry.js code must never import PeerMessageBus');
    assert(!codeOnly.includes('PeerConnection'), 'WorldDiscoverySourceRegistry.js code must never reference PeerConnection');
    assert(!codeOnly.includes('PeerDiscoveryProvider'), 'WorldDiscoverySourceRegistry.js code must never reference PeerDiscoveryProvider');
    assert(!/fetch\(/.test(codeOnly), 'WorldDiscoverySourceRegistry.js code must never call fetch(...)');
    assert(!codeOnly.includes('WebSocket'), 'WorldDiscoverySourceRegistry.js code must never reference WebSocket');
    assert(!codeOnly.includes('.vue'), 'WorldDiscoverySourceRegistry.js code must never reference a Vue component');
    assert(!codeOnly.includes('document.'), 'WorldDiscoverySourceRegistry.js code must never reference document');
    assert(!codeOnly.includes('window.'), 'WorldDiscoverySourceRegistry.js code must never reference window');

    // No storage/persistence.
    assert(!codeOnly.includes('StorageProvider'), 'WorldDiscoverySourceRegistry.js code must never reference StorageProvider');
    assert(!/\blocalStorage\b/.test(codeOnly), 'WorldDiscoverySourceRegistry.js code must never reference localStorage');

    // No async/timer-based notification of this milestone's own invention.
    assert(!/setInterval|setTimeout|Promise|async\s|await\s/.test(codeOnly), 'WorldDiscoverySourceRegistry.js code must never use timers, promises, or async delivery — notification stays synchronous');

    // No trust/tombstone/reconciliation vocabulary of any kind.
    const forbiddenTerms = [
        'trusted', 'trust(', 'verified', 'verify(', 'authority', 'priority', 'weight', 'confidence', 'ranking', 'scoring',
        'tombstone', 'revoke', 'invalidate', 'untrust', 'offline',
        'dedup', 'reconcile', 'winner'
    ];
    for (const term of forbiddenTerms) {
        assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `WorldDiscoverySourceRegistry.js code must never use "${term}"`);
    }

    console.log('✓ Architectural regression: the notification seam adds no forbidden import or vocabulary');
}

console.log('\nAll World discovery registry change notification tests passed.');
