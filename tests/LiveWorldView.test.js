import { readFile } from 'node:fs/promises';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { describeLocalWorldDiscoverySource } from '../application/WorldEncounterIntegration.js';
import {
    bootstrapWorldDiscoveryRuntime,
    WORLD_DISCOVERY_PEER_PROTOCOL
} from '../application/WorldDiscoveryRuntimeBootstrap.js';

// 0.9.15 — Mount Live World View.
//
// 0.9.9 through 0.9.14 each proved their own seam works — a registry
// (0.9.9), a peer lifecycle bridge (0.9.11), change notification (0.9.12),
// a canvas that subscribes and re-renders (0.9.13), and, finally, one
// running runtime `ui/main.js` actually constructs and provides app-wide
// (0.9.14). This milestone adds no new seam of its own — it mounts
// `ui/components/WorldEncounterCanvas.js` behind a new route
// (`ui/router/index.js`, `/live-world`) via a deliberately tiny new page,
// `ui/views/LiveWorldView.js`, whose only job is `inject('worldDiscoverySourceRegistry')`
// then hand it straight through as `WorldEncounterCanvas`'s own `registry`
// prop.
//
// `ui/views/LiveWorldView.js` itself imports `vue` (`inject()`), which —
// like `ui/views/WorldView.js` and `ui/router/index.js` before it — this
// suite never imports directly (there is no `vue` package to resolve
// under plain Node; only the browser test runner's own import map
// supplies one). This file instead proves the milestone two ways, the
// same split `tests/ReconciliationCandidateLeaderboardUI.test.js` already
// established for its own route registration:
//
// Section A: FLAGSHIP — the exact scenario the milestone names: a runtime
//            bootstrapped with a local placed publication (the World page
//            opening onto local data already present), a peer connecting
//            and contributing, that peer updating without accumulating,
//            and that peer disconnecting without a trace — driven
//            entirely through `bootstrapWorldDiscoveryRuntime()` (0.9.14)
//            and `WorldEncounterCanvas`'s own `registry` prop (0.9.13),
//            exactly the composition `ui/main.js`/`LiveWorldView.js`
//            perform for real.
// Section B: `ui/views/LiveWorldView.js`'s own source — read as plain
//            text, never imported — injects the SAME
//            `'worldDiscoverySourceRegistry'` key `ui/main.js` provides,
//            hands it straight through as `WorldEncounterCanvas`'s
//            `registry` prop, and contains none of the discovery-logic
//            vocabulary the milestone's own boundary forbids a World page
//            from owning.
// Section C: the `/live-world` route is registered in
//            `ui/router/index.js` and points at `LiveWorldView`.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function connectedPeerOf(identityId) {
    return { connectionId: `conn-${identityId}`, remoteIdentity: identityId ? { identityId } : null };
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
        setPeers(nextPeers) {
            currentPeers = nextPeers;
            for (const listener of Array.from(listeners)) {
                listener(currentPeers);
            }
        }
    };
}

// The SAME "call lifecycle/computed/methods.call(ctx)" discipline
// tests/LiveWorldViewRegistrySubscription.test.js already established —
// there is no real Vue runtime anywhere in this test suite.
function buildCanvasInstance({ registry = null, view } = {}) {
    const ctx = {
        registry,
        view: view !== undefined ? view : WorldEncounterCanvas.props.view.default()
    };
    Object.assign(ctx, WorldEncounterCanvas.data.call(ctx));
    Object.assign(ctx, WorldEncounterCanvas.methods);
    return ctx;
}

function mount(ctx) {
    WorldEncounterCanvas.mounted.call(ctx);
}

function readEffectiveView(ctx) {
    return WorldEncounterCanvas.computed.effectiveView.call(ctx);
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: the running application's own composition,
    // end to end.
    // ---------------------------------------------------------------
    {
        // "Application starts" / "World page opens" / "Local placed
        // publication appears" — exactly the local records ui/main.js
        // hands bootstrapWorldDiscoveryRuntime() at startup.
        const peerMessageBus = fakePeerMessageBus();
        const connectedPeerRegistry = fakeConnectedPeerRegistry();
        const { registry } = bootstrapWorldDiscoveryRuntime({
            localWorldDiscoveryRecords: {
                publications: [{ id: 'pub-local', title: 'Wanderer\'s Own Publication' }],
                placements: [{ id: 'placement-local', publicationId: 'pub-local', position: { x: 0, y: 0, z: 0 } }]
            },
            connectedPeerRegistry,
            peerMessageBus
        });

        // "World page opens" — LiveWorldView.js's own job, reduced to
        // exactly what it does: hand the injected registry straight
        // through as WorldEncounterCanvas's `registry` prop.
        const ctx = buildCanvasInstance({ registry });
        mount(ctx);

        let view = readEffectiveView(ctx);
        assert(view.publications.length === 1 && view.publications[0].objectId === 'pub-local',
            '1. FLAGSHIP — the World page shows the local placed publication the moment it opens');
        assert(view.avatars.length === 0, '2. FLAGSHIP — no peer has contributed yet');

        // "Peer sends World data" -> "Registry receives peer source" ->
        // "Canvas subscription fires" -> "Peer publication/avatar appears".
        const peerA = connectedPeerOf('did:key:zPeerA');
        connectedPeerRegistry.setPeers([peerA]);
        peerMessageBus.deliver(WORLD_DISCOVERY_PEER_PROTOCOL, {
            avatarProfiles: [{ avatarId: 'avatar-A1', displayName: 'A1' }],
            avatarPresences: [{ avatarId: 'avatar-A1', position: { x: 1, y: 0, z: 1 } }]
        }, { connectedPeer: peerA });

        view = readEffectiveView(ctx);
        assert(view.publications.length === 1 && view.publications[0].objectId === 'pub-local',
            '3. FLAGSHIP — the local publication is still present, unaffected by the peer arriving');
        assert(view.avatars.length === 1 && view.avatars[0].objectId === 'avatar-A1',
            '4. FLAGSHIP — peer A\'s avatar appears the moment its contribution registers, with no separate reload');

        // "Peer sends updated World data" -> "Existing source is
        // replaced" -> "Canvas reflects replacement".
        peerMessageBus.deliver(WORLD_DISCOVERY_PEER_PROTOCOL, {
            avatarProfiles: [{ avatarId: 'avatar-A2', displayName: 'A2 (moved)' }],
            avatarPresences: [{ avatarId: 'avatar-A2', position: { x: 5, y: 0, z: 5 } }]
        }, { connectedPeer: peerA });

        view = readEffectiveView(ctx);
        assert(view.avatars.length === 1 && view.avatars[0].objectId === 'avatar-A2',
            '5. FLAGSHIP — an updated message from the same peer replaces its prior contribution, never accumulates it');

        // "Peer disconnects" -> "Source removed" -> "Canvas removes peer
        // encounters".
        connectedPeerRegistry.setPeers([]);

        view = readEffectiveView(ctx);
        assert(view.avatars.length === 0,
            '6. FLAGSHIP — peer A\'s encounters disappear entirely once it disconnects');
        assert(view.publications.length === 1 && view.publications[0].objectId === 'pub-local',
            '7. FLAGSHIP — the local publication remains, throughout every peer transition');

        console.log('✓ Section A: FLAGSHIP — bootstrapWorldDiscoveryRuntime() feeding a mounted WorldEncounterCanvas reproduces the milestone\'s own end-to-end scenario');
    }

    // ---------------------------------------------------------------
    // Section B — ui/views/LiveWorldView.js's own source: the injection
    // boundary, and nothing else.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../ui/views/LiveWorldView.js', import.meta.url);
        const fullSource = await readFile(sourceUrl, 'utf8');
        const codeOnly = fullSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(codeOnly.includes("inject('worldDiscoverySourceRegistry'"),
            '8. LiveWorldView.js injects the SAME key ui/main.js provides app-wide');
        assert(/WorldEncounterCanvas[\s\S]*?:registry="worldDiscoverySourceRegistry"/.test(codeOnly),
            '9. LiveWorldView.js hands the injected registry straight through as WorldEncounterCanvas\'s own registry prop');
        assert(codeOnly.includes("from '../components/WorldEncounterCanvas.js'"),
            '10. LiveWorldView.js mounts the already-existing WorldEncounterCanvas — never a second, competing canvas');

        // The "Important boundary" the milestone names: no discovery
        // logic of any kind lives in the page itself.
        assert(!codeOnly.includes('peerMessageBus'), '11. never touches peerMessageBus directly');
        assert(!codeOnly.includes('connectedPeerRegistry'), '12. never touches a connected-peer registry directly');
        assert(!/\.setSource\(|\.removeSource\(/.test(codeOnly), '13. never calls registry.setSource()/removeSource() itself');
        assert(!codeOnly.includes('remoteIdentity'), '14. never inspects a peer identity');
        assert(!codeOnly.includes('deriveWorldEncounters'), '15. never calls deriveWorldEncounters() directly');
        assert(!codeOnly.includes('describeWorldFromDiscoverySources') && !codeOnly.includes('describeWorldFromDiscoveryRegistry'),
            '16. never computes a World projection itself — that stays WorldEncounterCanvas\'s own job');
        assert(!/\.sort\(/.test(codeOnly), '17. performs no sorting or deduplication of its own');
        assert(!/verifySignature|signature\.verify/.test(codeOnly), '18. never verifies a signature');
        assert(!/fetch\(|XMLHttpRequest/.test(codeOnly), '19. never fetches remote content');
        assert(!codeOnly.includes("from '../../peer/"), '20. imports nothing from peer/ — no discovery transport of its own');
        assert(!codeOnly.includes("from '../../core/"), '21. imports nothing from core/ — no domain derivation of its own');

        console.log('✓ Section B: LiveWorldView.js only injects and mounts — no discovery logic, projection, verification, or fetch of its own');
    }

    // ---------------------------------------------------------------
    // Section C — the route is registered in ui/router/index.js.
    // ---------------------------------------------------------------
    {
        const routerSource = await readFile(new URL('../ui/router/index.js', import.meta.url), 'utf8');
        assert(routerSource.includes("path: '/live-world'"), '22. the /live-world route is registered in the app router');
        assert(routerSource.includes('LiveWorldView'), '23. the registered route points at LiveWorldView');

        console.log('✓ Section C: the Live World route is registered in ui/router/index.js');
    }

    console.log('\nAll Live World View tests passed.');
}

run().catch((error) => {
    console.error('LiveWorldView.test.js FAILED:', error);
    process.exitCode = 1;
});
