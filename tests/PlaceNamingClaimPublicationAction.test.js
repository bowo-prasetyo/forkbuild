import PlaceNamingPanel from '../ui/components/PlaceNamingPanel.js';
import { usePlaceNamingPanel } from '../ui/views/worldView/usePlaceNamingPanel.js';
import { PlaceNamingClaim } from '../core/PlaceNamingClaim.js';
import { composePlaceNamingPublicationRuntime } from '../application/placeNaming/PlaceNamingPublicationRuntimeComposition.js';
import { NostrPlaceNamingDiscoverySource } from '../application/placeNaming/NostrPlaceNamingDiscoverySource.js';
import { PlaceNamingDiscoveryQueryService } from '../application/placeNaming/PlaceNamingDiscoveryQueryService.js';
import { executeDiscoverPlaceNamingClaimsCommand } from '../application/placeNaming/DiscoverPlaceNamingClaimsCommand.js';
import { derivePlaceNamingDiscoveryTag } from '../core/PlaceNamingDiscoveryEnvelope.js';
import { LocalPlaceNamingClaimStore } from '../application/placeNaming/LocalPlaceNamingClaimStore.js';
import { PlaceNamingClaimUseCase } from '../application/placeNaming/PlaceNamingClaimUseCase.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { mountComponent } from './support/MinimalVueCompositionApiShim.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// Distributing a place name from World View's naming panel: the real
// usePlaceNamingPanel() composable WorldView uses, and PlaceNamingPanel's own
// methods. Publishing a name only saves it here and offers the next step;
// distributing is a separate click, on the network the person picks (Arweave,
// Nostr or Steem), and a second device finds it through the unchanged
// discovery chain.

async function flushMicrotasks() {
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    provider.identityId = identity.identityId;
    return provider;
}

function makeReplica(identityProvider) {
    const store = new LocalPlaceNamingClaimStore(new InMemoryStorageProvider());
    const useCase = new PlaceNamingClaimUseCase(store, identityProvider, new LocalAuthorizationVerifier());
    return { store, useCase };
}

// The slice of WorldNavigationSession the naming panel reads and writes, over a
// real claim use case, for one World.
function makeSession(replica, worldId) {
    return {
        getMyIdentityId: () => null,
        getPlaceNamingClaims: (regionId) => replica.useCase.claimsForRegion(worldId, regionId),
        getPlaceNamingView: () => [],
        getPreferredPlaceName: () => null,
        getGeographicNamingView: () => ({ regions: [], namingView: [] }),
        publishPlaceNamingClaim: (regionId, name) => replica.useCase.publish(worldId, regionId, name)
    };
}

// WorldView's own guarded(): a thrown error becomes feedback and undefined.
function mountPanel({ session, distributePlaceNamingClaimCommand = null, defaultDiscoveryProvider = 'nostr' }) {
    const feedbackShown = [];
    const feedback = { show: (text) => feedbackShown.push(text) };
    const guarded = (fn) => {
        try {
            return fn();
        } catch (error) {
            feedback.show(error.message);
            return undefined;
        }
    };
    const host = mountComponent({
        setup: () => usePlaceNamingPanel({ defaultDiscoveryProvider, distributePlaceNamingClaimCommand, feedback, guarded, session })
    }, {});
    return { host, feedbackShown };
}

function panelCtx(overrides = {}) {
    const emitted = [];
    const ctx = {
        claims: [],
        canDistribute: false,
        discoveryProvider: 'nostr',
        distributionClaimId: null,
        distributionExecuting: false,
        distributionOfferClaimId: null,
        $emit: (event, ...args) => emitted.push({ event, args }),
        emitted,
        ...overrides
    };
    for (const [name, method] of Object.entries(PlaceNamingPanel.methods)) {
        ctx[name] = method.bind(ctx);
    }
    return ctx;
}

const announced = (provider) => ({ published: true, relayUrl: `wss://${provider}`, id: 'a'.repeat(64), discoveryTag: 'tag' });

async function run() {
    // The panel only emits; the host decides whether and where to distribute.
    {
        for (const event of ['publish-name', 'distribute-claim', 'dismiss-distribution-offer', 'update:discoveryProvider']) {
            assert(PlaceNamingPanel.emits.includes(event), `PlaceNamingPanel declares ${event}`);
        }
        assert(PlaceNamingPanel.props.canDistribute.default === false, 'without a host command there is nothing to distribute with');

        const ctx = panelCtx({ canDistribute: true });
        ctx.onDistributeClaim('claim-42');
        assert(ctx.emitted.length === 1 && ctx.emitted[0].event === 'distribute-claim' && ctx.emitted[0].args[0] === 'claim-42',
            'Distribute hands the claim id up unchanged');

        const options = PlaceNamingPanel.computed.discoveryProviderOptions.call(ctx);
        assert(options.join(',') === 'arweave,nostr,steem', `the networks are listed alphabetically (got ${options})`);

        const claim = { id: 'c1', name: 'Hollow' };
        assert(PlaceNamingPanel.computed.distributionOfferClaim.call(panelCtx({ canDistribute: true, claims: [claim], distributionOfferClaimId: 'c1' })) === claim,
            'the offer names the claim just published');
        assert(PlaceNamingPanel.computed.distributionOfferClaim.call(panelCtx({ canDistribute: false, claims: [claim], distributionOfferClaimId: 'c1' })) === null,
            'no offer without a way to distribute');
        assert(PlaceNamingPanel.computed.distributionOfferClaim.call(panelCtx({ canDistribute: true, claims: [], distributionOfferClaimId: 'c1' })) === null,
            'no offer for a claim the panel no longer lists');
        console.log('✓ the panel offers and emits; it never distributes on its own');
    }

    // Publishing a name offers to distribute it, and does nothing more.
    {
        const replica = makeReplica(makeIdentity('Alice'));
        const calls = [];
        const { host, feedbackShown } = mountPanel({
            session: makeSession(replica, 'world-o'),
            distributePlaceNamingClaimCommand: (claim, provider) => { calls.push({ claim, provider }); return Promise.resolve(announced(provider)); }
        });
        host.openNamingPanel('region-o');
        host.publishNamingClaim('Offered Oasis');
        await flushMicrotasks();

        const [claim] = replica.store.list('world-o');
        assert(claim && claim.name === 'Offered Oasis', 'the name is saved on this device');
        assert(host.namingPanelDistributionOfferClaimId.value === claim.id, 'the panel offers to distribute the claim just published');
        assert(calls.length === 0, 'publishing never distributes by itself');
        assert(feedbackShown.length === 1, 'publishing still confirms the local save');

        host.dismissNamingClaimDistributionOffer();
        assert(host.namingPanelDistributionOfferClaimId.value === null, 'Not now dismisses the offer');

        host.publishNamingClaim('Second Spring');
        assert(host.namingPanelDistributionOfferClaimId.value !== null, 'a new name brings a new offer');
        host.closeNamingPanel();
        host.openNamingPanel('region-o');
        assert(host.namingPanelDistributionOfferClaimId.value === null, 'the offer never survives closing the panel');

        const failing = mountPanel({
            session: { ...makeSession(replica, 'world-o'), publishPlaceNamingClaim: () => { throw new Error('signed out'); } },
            distributePlaceNamingClaimCommand: () => Promise.resolve(null)
        });
        failing.host.openNamingPanel('region-o');
        failing.host.publishNamingClaim('Never Saved');
        assert(failing.host.namingPanelDistributionOfferClaimId.value === null, 'a failed publish offers nothing');

        const withoutCommand = mountPanel({ session: makeSession(replica, 'world-o') });
        withoutCommand.host.openNamingPanel('region-o');
        withoutCommand.host.publishNamingClaim('Offline Only');
        assert(withoutCommand.host.namingPanelDistributionOfferClaimId.value === null, 'no offer without a distribution command');
        assert(withoutCommand.host.distributeNamingClaim(claim.id) === undefined, 'distributing without a command is a silent no-op');
        console.log('✓ Publish A Name saves locally and offers distribution as a separate step');
    }

    // Distributing hands the exact stored claim to the command, on the chosen network.
    {
        const replica = makeReplica(makeIdentity('Alice'));
        const claim = replica.useCase.publish('world-c', 'region-c', 'Hostwired Hollow');
        const calls = [];
        const { host } = mountPanel({
            session: makeSession(replica, 'world-c'),
            defaultDiscoveryProvider: 'steem',
            distributePlaceNamingClaimCommand: (handed, provider) => { calls.push({ handed, provider }); return Promise.resolve(announced(provider)); }
        });
        host.openNamingPanel('region-c');
        assert(host.namingPanelDiscoveryProvider.value === 'steem', 'the picker opens on the saved Announcement / Discovery preference');

        host.namingPanelDiscoveryProvider.value = 'arweave';
        await host.distributeNamingClaim(claim.id);

        assert(calls.length === 1 && calls[0].provider === 'arweave', 'the network chosen in the panel is the one used');
        assert(calls[0].handed instanceof PlaceNamingClaim && calls[0].handed.id === claim.id
            && JSON.stringify(calls[0].handed.signature) === JSON.stringify(claim.signature),
            'the exact signed claim is handed over, never a re-signed copy');
        assert(host.namingPanelDistributionResult.value.discoveryProvider === 'arweave',
            'the result remembers which network this attempt used');
        assert(replica.store.list('world-c').length === 1, 'distributing never creates another local claim');
        console.log('✓ Distribute sends the stored claim to the network chosen for that click');
    }

    // Executing, result and error, and a failure never touches the local claim.
    {
        const replica = makeReplica(makeIdentity('Alice'));
        const claim = replica.useCase.publish('world-d', 'region-d', 'Transition Terrace');

        let resolvePublish;
        const pending = mountPanel({
            session: makeSession(replica, 'world-d'),
            distributePlaceNamingClaimCommand: () => new Promise((resolve) => { resolvePublish = resolve; })
        }).host;
        pending.openNamingPanel('region-d');
        pending.distributeNamingClaim(claim.id);
        assert(pending.namingPanelDistributionExecuting.value === true && pending.namingPanelDistributionClaimId.value === claim.id,
            'the click shows as in progress beside its claim at once');
        await flushMicrotasks();
        resolvePublish(announced('nostr'));
        await flushMicrotasks();
        assert(pending.namingPanelDistributionExecuting.value === false && pending.namingPanelDistributionResult.value.published === true
            && pending.namingPanelDistributionError.value === null, 'a success is recorded');

        const rejected = mountPanel({
            session: makeSession(replica, 'world-d'),
            distributePlaceNamingClaimCommand: () => Promise.reject(new Error('relay unreachable'))
        }).host;
        rejected.openNamingPanel('region-d');
        await rejected.distributeNamingClaim(claim.id);
        assert(rejected.namingPanelDistributionError.value === 'relay unreachable' && rejected.namingPanelDistributionResult.value === null,
            'a rejection shows its message');

        const thrown = mountPanel({
            session: makeSession(replica, 'world-d'),
            distributePlaceNamingClaimCommand: () => { throw new Error('no compatible browser extension was found'); }
        }).host;
        thrown.openNamingPanel('region-d');
        await thrown.distributeNamingClaim(claim.id);
        assert(thrown.namingPanelDistributionError.value === 'no compatible browser extension was found', 'a synchronous throw is shown the same way');
        const declined = mountPanel({
            session: makeSession(replica, 'world-d'),
            distributePlaceNamingClaimCommand: () => Promise.resolve(null)
        }).host;
        declined.openNamingPanel('region-d');
        await declined.distributeNamingClaim(claim.id);
        assert(declined.namingPanelDistributionResult.value === null && typeof declined.namingPanelDistributionError.value === 'string',
            'a relay that declines the announcement is shown as a failure, never as announced');
        assert(replica.store.list('world-d').length === 1, 'a failed distribution never changes the local claim');
        console.log('✓ in progress, success and failure are each shown, and failures stay local to the attempt');
    }

    // A newer click, or closing the panel, makes an older attempt's result stale.
    {
        const replica = makeReplica(makeIdentity('Alice'));
        const first = replica.useCase.publish('world-e', 'region-e', 'First Falls');
        const second = replica.useCase.publish('world-e', 'region-e', 'Second Springs');
        let resolveFirst;
        let count = 0;
        const { host } = mountPanel({
            session: makeSession(replica, 'world-e'),
            distributePlaceNamingClaimCommand: () => {
                count += 1;
                return count === 1 ? new Promise((resolve) => { resolveFirst = resolve; }) : Promise.resolve(announced('second'));
            }
        });
        host.openNamingPanel('region-e');
        host.distributeNamingClaim(first.id);
        host.distributeNamingClaim(second.id);
        await flushMicrotasks();
        resolveFirst(announced('first-stale'));
        await flushMicrotasks();
        assert(host.namingPanelDistributionClaimId.value === second.id && host.namingPanelDistributionResult.value.relayUrl === 'wss://second',
            'a late answer to the first click never overwrites the second');

        let resolveAfterClose;
        const closing = mountPanel({
            session: makeSession(replica, 'world-e'),
            distributePlaceNamingClaimCommand: () => new Promise((resolve) => { resolveAfterClose = resolve; })
        }).host;
        closing.openNamingPanel('region-e');
        closing.distributeNamingClaim(first.id);
        await flushMicrotasks();
        closing.closeNamingPanel();
        resolveAfterClose(announced('after-close'));
        await flushMicrotasks();
        assert(closing.namingPanelDistributionExecuting.value === false && closing.namingPanelDistributionResult.value === null,
            'an answer arriving after the panel closed is ignored');
        console.log('✓ stale attempts never write into the panel');
    }

    // End to end: Device A publishes, takes the offer, and Device B discovers the name.
    {
        const relayEvents = [];
        const { discoveryPublisher } = composePlaceNamingPublicationRuntime({
            nostrPlaceNamingDiscoveryPublisherOptions: {
                publishImpl: async (relayUrl, eventTemplate) => {
                    relayEvents.push({ kind: eventTemplate.kind, tags: eventTemplate.tags, content: eventTemplate.content });
                    return { published: true, id: 'f'.repeat(64) };
                }
            }
        });
        const worldId = 'world-flagship-ui';
        const regionId = 'region-flagship-ui';
        const deviceA = makeReplica(makeIdentity('Alice'));
        const deviceB = makeReplica(makeIdentity('Bob'));
        const { host } = mountPanel({
            session: makeSession(deviceA, worldId),
            distributePlaceNamingClaimCommand: (claim) => discoveryPublisher.publish(claim)
        });

        host.openNamingPanel(regionId);
        host.publishNamingClaim('Flagship Fen');
        assert(relayEvents.length === 0, 'publishing a name sends nothing to a relay');

        const ctx = panelCtx({ canDistribute: true });
        ctx.onDistributeClaim(host.namingPanelDistributionOfferClaimId.value);
        await host.distributeNamingClaim(ctx.emitted[0].args[0]);
        assert(relayEvents.length === 1, 'taking the offer announces the claim once');

        const discovered = await executeDiscoverPlaceNamingClaimsCommand({
            discoveryTag: derivePlaceNamingDiscoveryTag(worldId, regionId),
            discoveryQueryService: new PlaceNamingDiscoveryQueryService([new NostrPlaceNamingDiscoverySource({
                queryImpl: (relayUrl, filter) => Promise.resolve(relayEvents.filter((event) => event.tags.some((tag) => tag[0] === 't' && (filter['#t'] || []).includes(tag[1]))))
            })])
        });
        assert(discovered.length === 1 && discovered[0].claim.name === 'Flagship Fen', 'Device B discovers Device A\'s name');
        assert(deviceB.store.list(worldId).length === 0, 'discovery alone never writes into Device B\'s own claims');
        console.log('✓ publish, take the offer, and another device discovers the name');
    }

    console.log('\n✅ All place name distribution action tests passed.');
}

await run();
