import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalRendezvousNetwork } from '../peer/LocalRendezvousNetwork.js';
import { RendezvousDiscoveryProvider } from '../peer/RendezvousDiscoveryProvider.js';
import { DiscoveryBootstrap } from '../peer/DiscoveryBootstrap.js';
import { PeerSessionManager } from '../application/peer/PeerSessionManager.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// "Be Discoverable" (PeerSessionManager#publishSelf) refuses clearly when
// the identity cannot sign, and never leaves a pending "Unknown peer"
// behind when publishing fails or publishes nothing.

async function rejects(promise, pattern, message) {
    try {
        await promise;
    } catch (err) {
        assert(pattern.test(err.message), `${message} (got "${err.message}")`);
        return;
    }
    throw new Error(`ASSERT FAILED: ${message} (it did not throw)`);
}

function sessionsOver(identityProvider, network) {
    const discoveryProvider = new DiscoveryBootstrap({
        bootstrapProviders: [new RendezvousDiscoveryProvider({ transport: network, identityProvider })]
    });
    return new PeerSessionManager({ identityProvider, discoveryProvider });
}

// A locked identity is told to unlock, before any offer is made.
{
    const identityProvider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const created = await identityProvider.createProtectedLocalIdentity('locked', 'correct horse battery');
    await identityProvider.unlock(created.identityId, 'correct horse battery');
    identityProvider.authenticate(created.identityId);
    identityProvider.lock(created.identityId);
    const network = new LocalRendezvousNetwork();
    const sessions = sessionsOver(identityProvider, network);
    await rejects(sessions.publishSelf(), /unlock your identity to be discoverable/, 'a locked identity is asked to unlock');
    await rejects(sessions.publishSelf(), /unlock your identity/, 'every attempt says the same');
    assert(sessions.listPeers().length === 0, 'no pending connection is left behind, however many times it is tried');
    assert(!sessions.isPublishing(), 'nothing is published');

    await identityProvider.unlock(created.identityId, 'correct horse battery');
    assert(await sessions.publishSelf() && sessions.isPublishing(), 'once unlocked, the same identity is discoverable');
    assert((await network.lookup(identityProvider.getSigningIdentity().id)).length === 1, '...and can be looked up');
    console.log('✓ a locked identity is asked to unlock, and leaves nothing behind');
    sessions.dispose();
}

// A publish that fails, or publishes nowhere, closes its offer.
{
    const identityProvider = new LocalIdentityProvider(new InMemoryStorageProvider());
    identityProvider.login('unreachable');
    const network = new LocalRendezvousNetwork();
    network.setAvailable(false);
    const sessions = sessionsOver(identityProvider, network);
    await rejects(sessions.publishSelf(), /unavailable/, 'an unreachable rendezvous network is reported');
    assert(sessions.listPeers().length === 0 && !sessions.isPublishing(), 'the failed attempt leaves no pending connection');
    sessions.dispose();

    const nowhere = new PeerSessionManager({ identityProvider });
    assert(await nowhere.publishSelf() === null, 'with no rendezvous network nothing is published');
    assert(nowhere.listPeers().length === 0, '...and no pending connection is left behind');
    nowhere.dispose();
    console.log('✓ a failed or empty publish closes its offer');
}

console.log('\n✅ All PublishSelfGuards tests passed.');
