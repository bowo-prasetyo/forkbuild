import { PeerSessionManager } from './PeerSessionManager.js';
import { DiscoveryBootstrap } from '../../peer/DiscoveryBootstrap.js';
import { RendezvousDiscoveryProvider } from '../../peer/RendezvousDiscoveryProvider.js';
import { PeerMessageBus } from '../../peer/PeerMessageBus.js';

// A peer session of its own around a one-off identity (identity/
// EphemeralIdentityProvider.js), for the flows that meet another device
// through a code rather than through the user's identity: copying builds to
// another device (application/devicePairing/DevicePairing.js) and walking
// together (application/walkTogether/WalkTogether.js). The rendezvous
// servers see only the one-off key, and the user's identity need not be
// unlocked to meet.
//
// `peerConnectionProvider` is the app's (STUN and TURN settings come with
// it), borrowed: closing the session never disposes it. `pollIntervals`
// passes answerPollIntervalMs / answerWatchIntervalMs to the manager.
export function openOneOffPeerSession({ identityProvider, peerConnectionProvider, rendezvousTransports, pollIntervals = {} }) {
    const discoveryProviders = rendezvousTransports.map((transport) => new RendezvousDiscoveryProvider({ transport, identityProvider }));
    const discovery = new DiscoveryBootstrap({ bootstrapProviders: discoveryProviders });
    const manager = new PeerSessionManager({
        identityProvider,
        peerConnectionProvider: borrowedConnectionProvider(peerConnectionProvider),
        discoveryProvider: discovery,
        ...pollIntervals
    });
    const bus = new PeerMessageBus();
    return {
        manager,
        bus,
        close() {
            for (const peer of manager.listPeers()) peer.close();
            bus.dispose();
            manager.dispose();
            discovery.dispose();
            for (const provider of discoveryProviders) provider.dispose();
        }
    };
}

// The app's connection provider, minus dispose(): PeerSessionManager#dispose
// disposes its provider, and this one is shared.
function borrowedConnectionProvider(provider) {
    return {
        createOffer: (options) => provider.createOffer(options),
        connect: (remoteAddress) => provider.connect(remoteAddress),
        onIncomingConnection: (callback) => provider.onIncomingConnection(callback),
        ...(typeof provider.prepareIceServers === 'function' ? { prepareIceServers: () => provider.prepareIceServers() } : {}),
        dispose() {}
    };
}
