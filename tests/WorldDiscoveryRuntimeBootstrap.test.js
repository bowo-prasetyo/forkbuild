import { readFile } from 'node:fs/promises';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { describeWorldFromDiscoverySources } from '../application/WorldEncounterIntegration.js';
import {
    bootstrapWorldDiscoveryRuntime,
    WORLD_DISCOVERY_PEER_PROTOCOL
} from '../application/WorldDiscoveryRuntimeBootstrap.js';

// 0.9.14 — World Discovery Runtime Bootstrap.
//
// 0.9.9 through 0.9.13 each proved their own seam works in isolation; this
// file proves the seams work TOGETHER, exactly as `ui/main.js` now wires
// them: one `WorldDiscoverySourceRegistry`, seeded with a local source at
// startup, kept live by a peer message bus subscription (registration)
// and a connected-peer registry's own membership notifications
// (unregistration) — with no manual re-projection call anywhere in this
// file, the same discipline tests/LiveWorldViewRegistrySubscription.test.js
// already established one layer up.
//
// Section A: FLAGSHIP — local data, then a peer connects and contributes,
//            then updates without accumulating, then disconnects and
//            leaves no trace, with the local source present throughout.
// Section B: the "closing discards remoteIdentity" race — a peer's own
//            remoteIdentity going null before connectedPeerRegistry's own
//            onChange fires never prevents cleanup.
// Section C: a peer that disconnects having never sent a
//            WORLD_DISCOVERY_PEER_PROTOCOL message is harmless — nothing
//            to unregister, because nothing was ever registered.
// Section D: local records missing/malformed degrade to a genuine, empty
//            'local' source — never throws.
// Section E: missing/malformed connectedPeerRegistry or peerMessageBus
//            degrade to "that half of the wiring does nothing" — never
//            throws, and never prevents the other half from working.
// Section F: dispose() unsubscribes both; no further registry mutation
//            after disposal.
// Section G: an already-constructed registry, when supplied, is reused —
//            never silently replaced by a second instance.
// Section H: architectural regression sweep of
//            application/WorldDiscoveryRuntimeBootstrap.js's own source.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function fakePeerMessageBus() {
    const handlersByProtocol = new Map();
    return {
        subscribe(protocol, handler) {
            handlersByProtocol.set(protocol, handler);
            return () => {
                if (handlersByProtocol.get(protocol) === handler) {
                    handlersByProtocol.delete(protocol);
                }
            };
        },
        // Test-only: stands in for an already-received message crossing
        // peer/PeerMessageBus.js's own onMessage -> _handleIncoming path.
        deliver(protocol, payload, meta) {
            const handler = handlersByProtocol.get(protocol);
            if (handler) {
                handler(payload, meta);
            }
        }
    };
}

function fakeConnectedPeerRegistry() {
    let currentPeers = [];
    const listeners = new Set();
    return {
        onChange(callback) {
            listeners.add(callback);
            return () => listeners.delete(callback);
        },
        // Test-only: stands in for application/ConnectedPeerRegistry.js's
        // own add()/_remove() calling _publishChange() with the full
        // current list.
        setPeers(nextPeers) {
            currentPeers = nextPeers;
            for (const listener of Array.from(listeners)) {
                listener(currentPeers.slice());
            }
        }
    };
}

function connectedPeerOf(identityId, connectionId) {
    return { connectionId, remoteIdentity: identityId ? { identityId } : null };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP.
    // ---------------------------------------------------------------
    {
        const peerMessageBus = fakePeerMessageBus();
        const connectedPeerRegistry = fakeConnectedPeerRegistry();

        const { registry } = bootstrapWorldDiscoveryRuntime({
            localWorldDiscoveryRecords: {
                publications: [{ id: 'pub-Local1', title: 'Local Publication' }],
                placements: [{ id: 'placement-Local1', publicationId: 'pub-Local1', position: { x: 0, y: 0, z: 0 } }]
            },
            connectedPeerRegistry,
            peerMessageBus
        });

        let view = describeWorldFromDiscoverySources(registry.listSources());
        assert(view.publications.length === 1 && view.publications[0].objectId === 'pub-Local1', '1. FLAGSHIP — the local publication is visible immediately on bootstrap, with no peer involved');

        // Peer A connects and contributes a placed publication + avatar presence.
        const peerA = connectedPeerOf('did:key:zPeerA', 'conn-A');
        connectedPeerRegistry.setPeers([peerA]);
        peerMessageBus.deliver(WORLD_DISCOVERY_PEER_PROTOCOL, {
            publications: [{ id: 'pub-A1', title: 'A1' }],
            placements: [{ id: 'placement-A1', publicationId: 'pub-A1', position: { x: 1, y: 0, z: 1 } }],
            avatarProfiles: [{ avatarId: 'avatar-A1', displayName: 'Avatar A1' }],
            avatarPresences: [{ avatarId: 'avatar-A1', position: { x: 2, y: 0, z: 2 } }]
        }, { connectedPeer: peerA });

        view = describeWorldFromDiscoverySources(registry.listSources());
        assert(view.publications.length === 2, '2. FLAGSHIP — peer A connecting and contributing grows the World to Local1 + A1');
        assert(view.avatars.length === 1 && view.avatars[0].objectId === 'avatar-A1', "3. FLAGSHIP — peer A's avatar presence is visible");

        // Peer A updates its source — must replace, never accumulate.
        peerMessageBus.deliver(WORLD_DISCOVERY_PEER_PROTOCOL, {
            publications: [{ id: 'pub-A2', title: 'A2' }],
            placements: [{ id: 'placement-A2', publicationId: 'pub-A2', position: { x: 3, y: 0, z: 3 } }],
            avatarProfiles: [{ avatarId: 'avatar-A1', displayName: 'Avatar A1' }],
            avatarPresences: [{ avatarId: 'avatar-A1', position: { x: 4, y: 0, z: 4 } }]
        }, { connectedPeer: peerA });

        view = describeWorldFromDiscoverySources(registry.listSources());
        const publicationIds = view.publications.map((p) => p.objectId).sort();
        assert(JSON.stringify(publicationIds) === JSON.stringify(['pub-A2', 'pub-Local1']), '4. FLAGSHIP — updating replaces A1 with A2 rather than accumulating both');

        // Peer A disconnects.
        connectedPeerRegistry.setPeers([]);

        view = describeWorldFromDiscoverySources(registry.listSources());
        assert(view.publications.length === 1 && view.publications[0].objectId === 'pub-Local1', "5. FLAGSHIP — peer A disconnecting removes A's contribution entirely, automatically");
        assert(view.avatars.length === 0, "6. FLAGSHIP — peer A's avatar disappears with the rest of its contribution");
        assert(registry.listSources().length === 1 && registry.listSources()[0].origin === 'local', '7. FLAGSHIP — only the local source remains, exactly as it did from the start');

        console.log('✓ Section A: FLAGSHIP — local data, a peer connecting and contributing, updating without accumulating, and disconnecting without a trace, with the local source present throughout');
    }

    // ---------------------------------------------------------------
    // Section B — the "closing discards remoteIdentity" race.
    // ---------------------------------------------------------------
    {
        const peerMessageBus = fakePeerMessageBus();
        const connectedPeerRegistry = fakeConnectedPeerRegistry();
        const { registry } = bootstrapWorldDiscoveryRuntime({ connectedPeerRegistry, peerMessageBus });

        const peerA = connectedPeerOf('did:key:zPeerA', 'conn-A');
        connectedPeerRegistry.setPeers([peerA]);
        peerMessageBus.deliver(WORLD_DISCOVERY_PEER_PROTOCOL, {
            avatarProfiles: [{ avatarId: 'avatar-A1', displayName: 'A1' }],
            avatarPresences: [{ avatarId: 'avatar-A1', position: { x: 0, y: 0, z: 0 } }]
        }, { connectedPeer: peerA });

        assert(registry.listSources().some((s) => s.origin === 'peer:did:key:zPeerA'), '8. peer A is registered after its message arrives');

        // Exactly application/ConnectedPeer.js's own documented behavior:
        // remoteIdentity is discarded the moment the connection closes,
        // BEFORE connectedPeerRegistry's own onChange fires.
        peerA.remoteIdentity = null;
        connectedPeerRegistry.setPeers([]);

        assert(!registry.listSources().some((s) => s.origin === 'peer:did:key:zPeerA'), "9. peer A's source is still removed, even though its own remoteIdentity was already null by the time onChange fired");

        console.log('✓ Section B: unregistration survives remoteIdentity being discarded before onChange fires, by reading a snapshot taken at message-receipt time');
    }

    // ---------------------------------------------------------------
    // Section C — a peer that never sent a message is harmless to
    // disconnect.
    // ---------------------------------------------------------------
    {
        const connectedPeerRegistry = fakeConnectedPeerRegistry();
        const { registry } = bootstrapWorldDiscoveryRuntime({ connectedPeerRegistry });

        const peerA = connectedPeerOf('did:key:zPeerA', 'conn-A');
        connectedPeerRegistry.setPeers([peerA]);
        assert(registry.listSources().length === 1, '10. connecting alone (no message) registers nothing beyond the local source');

        let threw = false;
        try {
            connectedPeerRegistry.setPeers([]);
        } catch {
            threw = true;
        }
        assert(threw === false, '11. disconnecting a peer that never sent a message never throws');
        assert(registry.listSources().length === 1 && registry.listSources()[0].origin === 'local', '12. the registry is unaffected — nothing was ever registered for that peer');

        console.log('✓ Section C: a peer that connects and disconnects with no message never touches the registry beyond the local source');
    }

    // ---------------------------------------------------------------
    // Section D — malformed/absent local records degrade to a genuine,
    // empty local source.
    // ---------------------------------------------------------------
    {
        const { registry: registryWithNoRecords } = bootstrapWorldDiscoveryRuntime({});
        const sources1 = registryWithNoRecords.listSources();
        assert(sources1.length === 1 && sources1[0].origin === 'local', '13. no localWorldDiscoveryRecords supplied still registers a genuine, empty local source');
        assert(describeWorldFromDiscoverySources(sources1).isEmpty === true, '14. that empty local source projects to an empty World');

        const { registry: registryWithMalformedRecords } = bootstrapWorldDiscoveryRuntime({ localWorldDiscoveryRecords: 'not an object' });
        assert(registryWithMalformedRecords.listSources().length === 1, '15. malformed localWorldDiscoveryRecords never throws and still registers a local source');

        console.log('✓ Section D: local records missing or malformed degrade to a genuine, empty local source — never throws');
    }

    // ---------------------------------------------------------------
    // Section E — malformed/absent connectedPeerRegistry/peerMessageBus.
    // ---------------------------------------------------------------
    {
        let threw = false;
        let runtime;
        try {
            runtime = bootstrapWorldDiscoveryRuntime({ connectedPeerRegistry: {}, peerMessageBus: {} });
        } catch {
            threw = true;
        }
        assert(threw === false, '16. a connectedPeerRegistry/peerMessageBus with no onChange()/subscribe() methods never throws');
        assert(runtime.registry.listSources().length === 1, '17. the local source is still registered when peer wiring is unavailable');

        const runtimeWithNeither = bootstrapWorldDiscoveryRuntime({});
        assert(runtimeWithNeither.registry.listSources().length === 1, '18. omitting connectedPeerRegistry/peerMessageBus entirely still registers the local source');

        console.log('✓ Section E: a malformed or absent connectedPeerRegistry/peerMessageBus degrades to "no peer wiring," never a thrown error');
    }

    // ---------------------------------------------------------------
    // Section F — dispose() stops both subscriptions.
    // ---------------------------------------------------------------
    {
        const peerMessageBus = fakePeerMessageBus();
        const connectedPeerRegistry = fakeConnectedPeerRegistry();
        const { registry, dispose } = bootstrapWorldDiscoveryRuntime({ connectedPeerRegistry, peerMessageBus });

        dispose();

        const peerA = connectedPeerOf('did:key:zPeerA', 'conn-A');
        connectedPeerRegistry.setPeers([peerA]);
        peerMessageBus.deliver(WORLD_DISCOVERY_PEER_PROTOCOL, {
            avatarProfiles: [{ avatarId: 'avatar-A1', displayName: 'A1' }],
            avatarPresences: [{ avatarId: 'avatar-A1', position: { x: 0, y: 0, z: 0 } }]
        }, { connectedPeer: peerA });

        assert(registry.listSources().length === 1 && registry.listSources()[0].origin === 'local', '19. after dispose(), neither peer messages nor lifecycle changes mutate the registry any further');

        console.log('✓ Section F: dispose() unsubscribes both the message-bus and connected-peer-registry wiring');
    }

    // ---------------------------------------------------------------
    // Section G — a supplied registry is reused, never replaced.
    // ---------------------------------------------------------------
    {
        const suppliedRegistry = new WorldDiscoverySourceRegistry();
        const { registry } = bootstrapWorldDiscoveryRuntime({ registry: suppliedRegistry });
        assert(registry === suppliedRegistry, '20. a caller-supplied registry instance is reused, never silently swapped for a new one');

        console.log('✓ Section G: a caller-supplied registry is reused rather than replaced');
    }

    // ---------------------------------------------------------------
    // Section H — architectural regression sweep.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/WorldDiscoveryRuntimeBootstrap.js', import.meta.url);
        const fullSource = await readFile(sourceUrl, 'utf8');
        const codeOnly = fullSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!codeOnly.includes('deriveWorldEncounters'), '21. never calls deriveWorldEncounters() directly');
        assert(!codeOnly.includes('assembleWorldDiscoveryInputs'), '22. never calls assembleWorldDiscoveryInputs() directly');
        assert(!codeOnly.includes('describeWorldFromDiscoverySources'), '23. never computes a World projection itself — that stays the UI layer\'s own job');
        assert(!codeOnly.includes('.send('), '24. never calls peerMessageBus.send() — this file only ever subscribes, never broadcasts');
        assert(!/localStorage|sessionStorage|StorageProvider/.test(codeOnly), '25. never persists anything');
        assert(!/verifySignature|signature\.verify/.test(codeOnly), '26. never verifies a signature');
        assert(!codeOnly.includes('.sort('), '27. performs no sorting or ranking of sources');
        assert(!/distance|proximity|nearby|radius/i.test(codeOnly), '28. no spatial/proximity vocabulary of any kind');
        assert(!/trusted|verified|priority|weight/i.test(codeOnly), '29. no trust/priority vocabulary of any kind');

        console.log('✓ Section H: architectural boundary confirmed — pure composition-root wiring, no new projection, verification, persistence, or peer-broadcast behavior');
    }

    console.log('\nAll World Discovery Runtime Bootstrap tests passed.');
}

run().catch((error) => {
    console.error('WorldDiscoveryRuntimeBootstrap.test.js FAILED:', error);
    process.exitCode = 1;
});
