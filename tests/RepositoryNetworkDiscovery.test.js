// Finding what others distributed on Nostr, Arweave and Steem for the
// Repository (application/publication/RepositoryNetworkDiscovery.js): an
// announcement only picks which record to fetch; a record is admitted only
// when it is validly signed and is exactly the Publication announced. Also
// the Steem envelope query, where each admitted record's locator is kept,
// and the catalog's use of both.
import { RepositoryNetworkDiscovery } from '../application/publication/RepositoryNetworkDiscovery.js';
import { NetworkPublicationLocatorStore, MAX_NETWORK_PUBLICATION_LOCATORS } from '../application/publication/NetworkPublicationLocatorStore.js';
import { SteemPublicationDiscoveryQueryService } from '../application/steem/SteemPublicationDiscoveryQueryService.js';
import { composeWorldEncounterMaterialVerifier } from '../application/worldEncounter/WorldEncounterMaterialVerifierRuntimeComposition.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { useRepositoryNetworkDiscovery, exploreRouteFor } from '../ui/components/publicationCatalog/useRepositoryNetworkDiscovery.js';
import { mountComponent } from './support/MinimalVueCompositionApiShim.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { ContentReference } from '../core/ContentReference.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { Publication } from '../publisher/Publication.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

const TAG = 'forkbuild-publication';
const AR_A = `ar://${'a'.repeat(43)}`;
const AR_B = `ar://${'b'.repeat(43)}`;
const AR_C = `ar://${'c'.repeat(43)}`;
const AR_D = `ar://${'d'.repeat(43)}`;

function signer(username) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    provider.login(username);
    return provider;
}

function signedPublication(identity, { id, sign = true } = {}) {
    let publication = new Publication({
        id,
        documentId: `doc-${id}`,
        title: `World ${id}`,
        author: 'bob',
        contentReference: new ContentReference({ hash: `hash-${id}` }),
        publisherIdentity: identity.getSigningIdentity().toJSON(),
        signature: null
    });
    if (sign) {
        publication = publication.withSignature(identity.signCanonical(publication.getSigningDescriptor()));
    }
    return publication;
}

// tag -> envelopes, counting reads.
function fakeService(envelopes, origin = 'dweb:nostr:wss://relay.example') {
    const service = {
        reads: 0,
        searchEnvelopes: async (tag) => {
            service.reads += 1;
            return tag === TAG ? envelopes.map((e) => ({ origin, kind: WorldEncounterKind.PUBLICATION, ...e })) : [];
        }
    };
    return service;
}

// Material by uri, as the decentralized source serves it: parsed JSON.
// Records every uri fetched.
function materialSources(byUri) {
    const fetched = [];
    return {
        fetched,
        decentralized: {
            load: async (selection, lead) => {
                fetched.push(lead.uri);
                return byUri[lead.uri] ? JSON.parse(JSON.stringify(byUri[lead.uri])) : null;
            }
        }
    };
}

const { verifier } = composeWorldEncounterMaterialVerifier();
const bob = signer('bob');

function discovery({ services, sources, isKnown, admitted = [], maxInspectionsPerRun } = {}) {
    return new RepositoryNetworkDiscovery({
        services,
        discoveryTag: TAG,
        materialSources: sources,
        verifier,
        isKnown,
        admit: (publication, details) => admitted.push({ publication, details }),
        maxInspectionsPerRun
    });
}

// Section A — only a validly signed record that is the Publication announced is admitted.
{
    const good = signedPublication(bob, { id: 'pub-good' });
    const unsigned = signedPublication(bob, { id: 'pub-unsigned', sign: false });
    const tampered = { ...signedPublication(bob, { id: 'pub-tampered' }).toJSON(), title: 'Edited after signing' };
    const other = signedPublication(bob, { id: 'pub-other' });
    const sources = materialSources({ [AR_A]: good.toJSON(), [AR_B]: unsigned.toJSON(), [AR_C]: tampered, [AR_D]: other.toJSON() });
    const admitted = [];
    const result = await discovery({
        services: [null, { notAService: true }, fakeService([
            { objectId: 'pub-good', uri: AR_A },
            { objectId: 'pub-unsigned', uri: AR_B },
            { objectId: 'pub-tampered', uri: AR_C },
            // The announcement claims one Publication; the record is another.
            { objectId: 'pub-claimed', uri: AR_D },
            { kind: WorldEncounterKind.AVATAR, objectId: 'avatar-1', uri: 'ar://avatar' },
            { objectId: '', uri: 'ar://no-id' }
        ])],
        sources,
        admitted
    }).run();
    assert(result.admitted.length === 1 && result.admitted[0].id === 'pub-good' && result.admitted[0] instanceof Publication,
        `A1. only the signed record for the announced Publication is admitted — got ${result.admitted.map((p) => p.id)}`);
    assert(admitted.length === 1 && admitted[0].details.locator === AR_A, 'A2. the admit sink is told where the record was read');
    assert(!sources.fetched.includes('ar://avatar') && !sources.fetched.includes('ar://no-id'),
        'A3. an avatar announcement or one naming no Publication is never fetched');
    assert(result.pending === 0, 'A4. nothing is left for later');
    console.log('✓ A. admission requires a verified record for the announced Publication');
}

// Section B — known Publications and repeated announcements are not fetched again.
{
    const good = signedPublication(bob, { id: 'pub-good' });
    const known = signedPublication(bob, { id: 'pub-known' });
    const sources = materialSources({ [AR_A]: good.toJSON(), [AR_B]: known.toJSON() });
    const nostr = fakeService([{ objectId: 'pub-good', uri: AR_A }, { objectId: 'pub-known', uri: AR_B }]);
    const arweave = fakeService([{ objectId: 'pub-good', uri: AR_A }], 'dweb:arweave-graphql:https://arweave.net/graphql');
    const failing = { searchEnvelopes: async () => { throw new Error('relay down'); } };
    const result = await discovery({
        services: [failing, nostr, arweave], sources, isKnown: (id) => id === 'pub-known'
    }).run();
    assert(result.admitted.length === 1 && result.admitted[0].id === 'pub-good', 'B1. one service failing never stops the others');
    assert(JSON.stringify(sources.fetched) === JSON.stringify([AR_A]),
        `B2. a record announced twice is fetched once, a known Publication not at all — fetched ${sources.fetched}`);

    // Two records announced for the same Publication: only the first is admitted.
    const twice = materialSources({ [AR_A]: good.toJSON(), [AR_B]: good.toJSON() });
    const both = await discovery({
        services: [fakeService([{ objectId: 'pub-good', uri: AR_A }, { objectId: 'pub-good', uri: AR_B }])], sources: twice
    }).run();
    assert(both.admitted.length === 1 && twice.fetched.length === 1, 'B3. a Publication is admitted once per run');

    // A throwing isKnown counts as unknown rather than breaking the run.
    const tolerant = await discovery({
        services: [fakeService([{ objectId: 'pub-good', uri: AR_A }])], sources: materialSources({ [AR_A]: good.toJSON() }),
        isKnown: () => { throw new Error('storage'); }
    }).run();
    assert(tolerant.admitted.length === 1, 'B4. a failing isKnown never stops discovery');
    console.log('✓ B. known and repeated announcements are skipped');
}

// Section C — a refused record is not fetched again; an unavailable one is retried.
{
    const unsigned = signedPublication(bob, { id: 'pub-unsigned', sign: false });
    const good = signedPublication(bob, { id: 'pub-later' });
    const byUri = { [AR_A]: unsigned.toJSON() };
    const sources = materialSources(byUri);
    const service = fakeService([{ objectId: 'pub-unsigned', uri: AR_A }, { objectId: 'pub-later', uri: AR_B }]);
    const instance = discovery({ services: [service], sources });
    const first = await instance.run();
    assert(first.admitted.length === 0 && sources.fetched.length === 2, 'C1. the first run fetches both and admits neither');
    byUri[AR_B] = good.toJSON();
    const second = await instance.run();
    assert(JSON.stringify(sources.fetched.slice(2)) === JSON.stringify([AR_B]),
        `C2. the refused record is not fetched again, the unavailable one is — fetched ${sources.fetched.slice(2)}`);
    assert(second.admitted.length === 1 && second.admitted[0].id === 'pub-later', 'C3. and is admitted once a gateway serves it');
    console.log('✓ C. refused records are remembered, unavailable ones retried');
}

// Section D — each run is bounded; concurrent calls share one run.
{
    const publications = ['p1', 'p2', 'p3'].map((id) => signedPublication(bob, { id }));
    const uris = [AR_A, AR_B, AR_C];
    const sources = materialSources(Object.fromEntries(uris.map((uri, i) => [uri, publications[i].toJSON()])));
    const service = fakeService(publications.map((p, i) => ({ objectId: p.id, uri: uris[i] })));
    const admittedIds = new Set();
    const instance = new RepositoryNetworkDiscovery({
        services: [service], discoveryTag: TAG, materialSources: sources, verifier,
        isKnown: (id) => admittedIds.has(id),
        admit: (publication) => admittedIds.add(publication.id),
        maxInspectionsPerRun: 2
    });
    const [a, b] = await Promise.all([instance.run(), instance.run()]);
    assert(a === b && service.reads === 1, 'D1. a call during a run shares that run');
    assert(a.admitted.length === 2 && a.pending === 1, `D2. at most two are checked per run, one left pending — got ${a.admitted.length}/${a.pending}`);
    const next = await instance.run();
    assert(next.admitted.length === 1 && next.admitted[0].id === 'p3' && next.pending === 0, 'D3. the next run checks what was left');

    let refused = false;
    try {
        new RepositoryNetworkDiscovery({ discoveryTag: TAG });
    } catch {
        refused = true;
    }
    assert(refused, 'D4. an admit sink is required');
    console.log('✓ D. runs are bounded and shared');
}

// Section E — Steem announcements as envelopes.
{
    const reader = {
        threadAccounts: ['forkbuild'],
        read: async (family) => ({
            announcements: family === 'publication' ? [
                { envelope: { protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-steem', uri: 'steem://bob/my-world' } },
                { envelope: { nonsense: true } }
            ] : []
        })
    };
    const service = new SteemPublicationDiscoveryQueryService({ reader });
    const envelopes = await service.searchEnvelopes(TAG);
    assert(envelopes.length === 1 && envelopes[0].objectId === 'pub-steem' && envelopes[0].uri === 'steem://bob/my-world'
        && envelopes[0].kind === WorldEncounterKind.PUBLICATION && envelopes[0].origin === 'dweb:steem:forkbuild',
        `E1. a Steem announcement is read as an envelope — got ${JSON.stringify(envelopes)}`);
    assert((await service.searchEnvelopes('other-tag')).length === 0, 'E2. another tag finds nothing, as on a relay');
    const broken = new SteemPublicationDiscoveryQueryService({ reader: { threadAccounts: [], read: async () => { throw new Error('node down'); } } });
    assert((await broken.searchEnvelopes(TAG)).length === 0, 'E3. an unreachable Steem node finds nothing and never throws');
    console.log('✓ E. Steem envelopes');
}

// Section F — the locator store.
{
    const storage = new InMemoryStorageProvider();
    const store = new NetworkPublicationLocatorStore(storage);
    assert(store.set('pub-1', AR_A) === true && store.get('pub-1') === AR_A, 'F1. a locator is kept');
    assert(store.viewPath('pub-1') === `/view/ar/${'a'.repeat(43)}`, 'F2. and opens through the link view');
    assert(store.set('pub-1', AR_B) === false && store.get('pub-1') === AR_A, 'F3. first seen wins');
    assert(store.set('pub-2', 'https://example.com/x') === false && store.get('pub-2') === null && store.viewPath('pub-2') === null,
        'F4. a locator no link can open is not kept');
    assert(store.set('pub-3', 'steem://bob/my-world') && store.viewPath('pub-3') === '/view/steem/bob/my-world', 'F5. Steem records open too');
    assert(new NetworkPublicationLocatorStore(storage).get('pub-1') === AR_A, 'F6. it survives a reload');
    for (let i = 0; i < MAX_NETWORK_PUBLICATION_LOCATORS; i++) store.set(`bulk-${i}`, AR_C);
    assert(store.get('pub-1') === null && store.get(`bulk-${MAX_NETWORK_PUBLICATION_LOCATORS - 1}`) === AR_C, 'F7. the oldest goes first past the cap');
    console.log('✓ F. locator store');
}

// Section G — the catalog: searches when mounted, reloads on admissions, explores network finds through the link view.
{
    const provider = new DecentralizedPublicationDiscoveryProvider();
    const good = signedPublication(bob, { id: 'pub-good' });
    const locators = new NetworkPublicationLocatorStore(new InMemoryStorageProvider());
    const instance = new RepositoryNetworkDiscovery({
        services: [fakeService([{ objectId: 'pub-good', uri: AR_A }])],
        discoveryTag: TAG,
        materialSources: materialSources({ [AR_A]: good.toJSON() }),
        verifier,
        isKnown: (id) => Boolean(provider.findById(id)),
        admit: (publication, { locator }) => {
            locators.set(publication.id, locator);
            provider.add(publication);
        }
    });
    let reloads = 0;
    const exposed = mountComponent({
        setup: () => useRepositoryNetworkDiscovery({ repositoryNetworkDiscovery: instance, onAdmitted: () => { reloads += 1; } })
    });
    const searching = exposed.searchNetworks();
    assert(exposed.networkDiscovery.value.searching && exposed.networkDiscoveryText.value.includes('Nostr'), 'G1. it says it is searching');
    await searching;
    assert(reloads === 1 && provider.list().length === 1, 'G2. an admission reloads the catalog');
    assert(exposed.networkDiscoveryText.value === '1 new creation found on the networks.', `G3. and says so — got "${exposed.networkDiscoveryText.value}"`);
    await exposed.searchNetworks();
    assert(reloads === 1 && exposed.networkDiscoveryText.value === 'No new creations on the networks.', 'G4. a search finding nothing new does not reload');

    assert(exploreRouteFor(good, locators).path === `/view/ar/${'a'.repeat(43)}`, 'G5. a network find explores through its link view');
    const local = signedPublication(bob, { id: 'pub-local' });
    assert(exploreRouteFor(local, locators).path === '/world/doc-pub-local' && exploreRouteFor(local, null).path === '/world/doc-pub-local',
        'G6. anything else opens World View directly');

    const idle = mountComponent({ setup: () => useRepositoryNetworkDiscovery({ repositoryNetworkDiscovery: null, onAdmitted: () => {} }) });
    await idle.searchNetworks();
    assert(idle.networkDiscovery.value === null && idle.networkDiscoveryText.value === '', 'G7. without discovery nothing is searched or shown');
    console.log('✓ G. catalog');
}
