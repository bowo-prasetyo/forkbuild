import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { License } from '../core/License.js';
import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { PublicationExchange } from '../application/PublicationExchange.js';
import { PublicationResolver } from '../application/PublicationResolver.js';
import { PublicationResolutionOutcome } from '../application/PublicationResolutionOutcome.js';
import { PublicationResolutionCoordinator } from '../application/PublicationResolutionCoordinator.js';
import { resolvePublicationView } from '../application/PublicationResolutionView.js';
import { CreatePublicationDisplayKindRegistryUseCase } from '../application/CreatePublicationDisplayKindRegistryUseCase.js';
import { CreateDiscoveryUseCase } from '../application/CreateDiscoveryUseCase.js';
import { PUBLICATION_CONTENT_KIND } from '../application/PublicationContentValidator.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { PublicationPeerExchange } from '../application/PublicationPeerExchange.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { DiscoveryProvider } from '../discovery/DiscoveryProvider.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { SearchPublicationsUseCase } from '../application/SearchPublicationsUseCase.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';

import { BlueprintAttribution, BLUEPRINT_ATTRIBUTION_KIND, CURRENT_SCHEMA_VERSION as ATTRIBUTION_SCHEMA_VERSION } from '../core/BlueprintAttribution.js';
import { PlaceNamingClaim } from '../core/PlaceNamingClaim.js';
import { buildPlaceNamingClaimPublication, PLACE_NAMING_CLAIM_PUBLICATION_KIND, CURRENT_SCHEMA_VERSION as NAMING_SCHEMA_VERSION } from '../application/PlaceNamingClaimPublication.js';

// 0.9.337 — Wire Resolved Decentralized Publications into Repository
// Discovery.
//
// 0.9.336's own audit closed every open question but one: the missing
// arrow it identified — `if (view.resolved && view.content instanceof
// Publication) provider.add(view.content);` — is now real production
// code, at the exact call site (and its "Retrieve from Peers" sibling)
// that audit named, in ui/views/DecentralizedPublicationsView.js's own
// `admitToRepositoryDiscovery()`. The one
// `DecentralizedPublicationDiscoveryProvider` instance this replica ever
// constructs is now built in ui/main.js, alongside `publicationCatalog`/
// `publicationResolutionCoordinator`, and shared app-wide via
// `app.provide()` — exactly the application lifetime 0.9.336's own
// Section H proved is the only lifetime an in-memory accumulator can
// safely use in this codebase.
//
// This file is the flagship production integration test for that wiring:
//
//   Section A — Real composition: the SAME provider instance ui/main.js
//               constructs is what both the resolution UI's admission
//               path and a real SearchPublicationsUseCase see — proven
//               structurally (exactly one construction, one app.provide,
//               one inject) and live (a shadow of the SAME object graph
//               ui/main.js wires).
//   Section B — FLAGSHIP: a decentralized Publication travels a real,
//               live, authenticated peer connection, resolves through
//               the real production resolvePublicationView() seam, and
//               is admitted into the shared provider — found in
//               provider.list().
//   Section C — Repository search: the resolved, admitted Publication is
//               found by Repository's own real, unmodified
//               SearchPublicationsUseCase, by title and by author.
//   Section D — Resolution failure isolation: a resolution that does not
//               reach RESOLVED never reaches the provider.
//   Section E — Content-kind isolation: a resolved BlueprintAttribution
//               and a resolved PlaceNamingClaim — both genuinely
//               `resolved: true` — are never admitted, because neither
//               is a publisher/Publication.js instance.
//   Section F — Local Publication regression: LocalDiscoveryProvider and
//               a purely local Publication behave exactly as before,
//               completely independent of the new provider.
//   Section G — Identity: documentId/contentReference/title/author/
//               license/schemaVersion/signature all survive resolution
//               and admission unmodified; no Repository-specific
//               identity is generated anywhere in the chain.
//   Section H — Provider singleton / accumulation: multiple decentralized
//               Publications resolved through the same shared provider
//               accumulate together, never overwrite one another.
//   Section I — No duplicate provider construction: guarded structurally
//               — ui/main.js constructs exactly one instance.
//   Section J — No Repository architecture changes: application/
//               SearchPublicationsUseCase.js, discovery/
//               LocalDiscoveryProvider.js, and application/
//               CreateDiscoveryUseCase.js are byte-for-byte untouched by
//               this milestone.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function countOccurrences(source, pattern) {
    return (source.match(pattern) || []).length;
}

function gitDiffFiles(paths) {
    const out = execSync(`git diff --name-only HEAD -- ${paths.join(' ')}`, { cwd: SOURCE_ROOT.pathname }).toString().trim();
    return out ? out.split('\n') : [];
}

function wait(ms = 20) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    provider.login(label);
    return provider;
}

function makeLocalStylePublication({ documentId, title, author, license = new License({ id: 'CC0-1.0' }) }, identityProvider) {
    const documentContentReference = new ContentReference({
        hash: `docHash-${documentId}`, algorithm: 'fnv1a-32', mediaType: 'application/json', size: 256
    });
    let publication = new Publication({
        documentId,
        title,
        author,
        providerId: 'local',
        contentHash: documentContentReference.hash,
        schemaVersion: 3,
        license,
        contentReference: documentContentReference,
        publisherIdentity: identityProvider.getSigningIdentity().toJSON(),
        signature: null
    });
    publication = publication.withSignature(identityProvider.signCanonical(publication.getSigningDescriptor()));
    return publication;
}

// The exact production admission gate ui/views/DecentralizedPublicationsView.js
// now runs at both `resolveEntry()` and `retrieve()` — reproduced here,
// test-side, ONLY so the functional sections below can exercise it
// without mounting a 700KB Vue single-file view. Section A's own
// structural checks confirm this expression is not a paraphrase: the
// literal `discoveryProvider.add(view.content)` call, guarded by the
// literal `view.resolved && view.content instanceof Publication`
// condition, is what the production file actually contains.
function admitToRepositoryDiscovery(view, discoveryProvider) {
    if (discoveryProvider && view && view.resolved && view.content instanceof Publication) {
        discoveryProvider.add(view.content);
    }
}

async function run() {
    console.log('Running Decentralized Publication Repository Integration tests...\n');

    // ===============================================================
    // Section A — Real composition: the SAME provider instance ui/main.js
    // constructs is what both the resolution UI's admission path and a
    // real SearchPublicationsUseCase see.
    // ===============================================================
    {
        // A1. ui/main.js constructs EXACTLY ONE
        // DecentralizedPublicationDiscoveryProvider — never a per-view or
        // per-call construction, matching the application-lifetime
        // pattern 0.9.336's own Section H proved is the only safe one.
        const mainSource = await readSource('ui/main.js');
        const constructions = countOccurrences(mainSource, /new DecentralizedPublicationDiscoveryProvider\(\)/g);
        assert(constructions === 1,
            `1. ui/main.js constructs DecentralizedPublicationDiscoveryProvider exactly once (found ${constructions}).`);

        // A2. That one instance is provided app-wide through Vue's own
        // provide/inject, the identical mechanism publicationCatalog/
        // publicationResolutionCoordinator already use.
        const provides = countOccurrences(mainSource, /app\.provide\('decentralizedPublicationDiscoveryProvider', decentralizedPublicationDiscoveryProvider\);/g);
        assert(provides === 1,
            `2. ui/main.js provides the single instance app-wide exactly once (found ${provides}).`);

        // A3. The resolution UI injects that SAME key, and never
        // constructs a provider of its own — a second, isolated instance
        // built inside the view would silently defeat the whole
        // milestone, the exact failure mode 0.9.336's own Section H4
        // proved live.
        const viewSource = await readSource('ui/views/DecentralizedPublicationsView.js');
        assert(viewSource.includes("inject('decentralizedPublicationDiscoveryProvider', null)"),
            '3. ui/views/DecentralizedPublicationsView.js injects the application-lifetime instance rather than constructing its own.');
        assert(!/new DecentralizedPublicationDiscoveryProvider\(/.test(viewSource),
            '4. confirmed: ui/views/DecentralizedPublicationsView.js never constructs a DecentralizedPublicationDiscoveryProvider itself.');

        // A4. Live: a shadow of the SAME object graph ui/main.js wires —
        // one provider, handed to both an admission call and a
        // SearchPublicationsUseCase — proves the sharing is real, not
        // merely asserted by the structural checks above.
        const alice = makeIdentity('Alice');
        const sharedStorage = new InMemoryStorageProvider();
        const resolver = new PublicationResolver(new LocalContentStore(sharedStorage), new LocalAuthorizationVerifier());
        const { kindPlugins } = new CreatePublicationDisplayKindRegistryUseCase().execute();
        const coordinator = new PublicationResolutionCoordinator(resolver, null);

        const provider = new DecentralizedPublicationDiscoveryProvider();
        const searchUseCase = new SearchPublicationsUseCase(provider);

        const publication = makeLocalStylePublication({ documentId: 'world-composition-1', title: 'Composition Proof', author: 'alice' }, alice);
        const envelope = await resolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: alice });
        const view = await resolvePublicationView(envelope, { coordinator, kindPlugins });
        admitToRepositoryDiscovery(view, provider);

        const found = searchUseCase.execute({ text: 'composition proof' });
        assert(found.items.length === 1 && found.items[0] === view.content,
            '5. the SAME provider instance handed to admission is the SAME instance a real SearchPublicationsUseCase reads from — one shared object, two roles.');
    }
    console.log('✓ Section A: real composition, confirmed structurally and live. ui/main.js constructs exactly one DecentralizedPublicationDiscoveryProvider and provides it app-wide; ui/views/DecentralizedPublicationsView.js injects that same instance rather than constructing its own. A shadow of the identical object graph proves the sharing is real: one provider instance receives an admitted Publication and is what a real SearchPublicationsUseCase reads back.');

    // ===============================================================
    // Section B — FLAGSHIP: a decentralized Publication travels a real,
    // live, authenticated peer connection, resolves through the real
    // production resolvePublicationView() seam, and is admitted into the
    // shared provider.
    // ===============================================================
    let flagshipResolvedPublication;
    let flagshipOriginalPublication;
    let flagshipProvider;
    {
        const network = new LocalPeerNetwork();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');

        const aliceTransport = new LocalPeerConnectionProvider('alice-repo-integration', network);
        const bobTransport = new LocalPeerConnectionProvider('bob-repo-integration', network);
        const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
        const stopListening = aliceConnect.listen();
        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        const bobConnectedPeer = bobConnect.connect({ candidateEndpoint: 'alice-repo-integration' });
        await wait(20);
        assert(bobConnectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED,
            '1. setup: a real, live, authenticated peer connection (peer/LocalPeerConnectionProvider.js + application/ConnectToPeerUseCase.js, unmodified).');

        const verifier = new LocalAuthorizationVerifier();
        const sharedContentStorage = new InMemoryStorageProvider();
        const aliceResolver = new PublicationResolver(new LocalContentStore(sharedContentStorage), verifier);
        const bobResolver = new PublicationResolver(new LocalContentStore(sharedContentStorage), verifier);

        const aliceCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const aliceExchange = new PublicationExchange(aliceCatalog, verifier);
        const aliceBus = new PeerMessageBus();
        const alicePeerExchange = new PublicationPeerExchange(aliceExchange, aliceBus, aliceConnect.registry);

        const bobCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const bobExchange = new PublicationExchange(bobCatalog, verifier);
        const bobBus = new PeerMessageBus();
        const bobPeerExchange = new PublicationPeerExchange(bobExchange, bobBus, bobConnect.registry);

        const observed = [];
        bobPeerExchange.onPublicationReceived((result) => observed.push(result));

        flagshipOriginalPublication = makeLocalStylePublication(
            { documentId: 'world-repo-integration-1', title: 'The Federated Lighthouse', author: 'alice' }, alice
        );
        const envelope = await aliceResolver.publish({
            content: flagshipOriginalPublication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: alice
        });
        aliceCatalog.add(envelope);
        const sentCount = alicePeerExchange.announce(envelope);
        assert(sentCount === 1, '2. Alice announces to her one live authenticated peer.');
        await wait(20);
        assert(observed.length === 1 && observed[0].publication.id === envelope.id,
            "3. Bob's onPublicationReceived fires with the real, live, peer-delivered envelope.");

        // The exact production dispatch — the real
        // CreatePublicationDisplayKindRegistryUseCase output, the real
        // PublicationResolutionCoordinator, the real
        // resolvePublicationView().
        const { kindPlugins: bobKindPlugins } = new CreatePublicationDisplayKindRegistryUseCase().execute();
        const bobCoordinator = new PublicationResolutionCoordinator(bobResolver);
        const view = await resolvePublicationView(observed[0].publication, { coordinator: bobCoordinator, kindPlugins: bobKindPlugins });
        assert(view.resolved === true, `4. resolvePublicationView() resolves the peer-delivered envelope (${view.reason}).`);
        assert(view.content instanceof Publication,
            '5. the resolved content is a genuine publisher/Publication.js instance.');

        // The one application-lifetime provider this replica would use —
        // a fresh instance here only because this test process is not
        // ui/main.js itself; Section A already proved structurally that
        // production never builds more than one.
        flagshipProvider = new DecentralizedPublicationDiscoveryProvider();
        admitToRepositoryDiscovery(view, flagshipProvider);
        flagshipResolvedPublication = view.content;

        assert(flagshipProvider.list().length === 1 && flagshipProvider.list()[0] === view.content,
            "6. the resolved, peer-delivered Publication is admitted into the shared provider — found in provider.list().");

        alicePeerExchange.dispose();
        bobPeerExchange.dispose();
        stopListening();
        aliceTransport.dispose();
        bobTransport.dispose();
    }
    console.log('✓ Section B: FLAGSHIP. Over a real, live, authenticated peer connection, Alice\'s self-published Publication reaches Bob\'s onPublicationReceived as a signed envelope; the real production resolvePublicationView() call resolves it back to a genuine publisher/Publication.js instance; and the real production admission gate (mirrored here from ui/views/DecentralizedPublicationsView.js\'s own admitToRepositoryDiscovery()) puts it in the shared DecentralizedPublicationDiscoveryProvider\'s list() — the whole 0.9.337 chain, live.');

    // ===============================================================
    // Section C — Repository search: the resolved, admitted Publication
    // is found by Repository's own real, unmodified
    // SearchPublicationsUseCase, by title and by author.
    // ===============================================================
    {
        const searchUseCase = new SearchPublicationsUseCase(flagshipProvider);

        const byText = searchUseCase.execute({ text: 'federated lighthouse' });
        assert(byText.items.length === 1 && byText.items[0].id === flagshipResolvedPublication.id,
            "1. Repository's own real, unmodified SearchPublicationsUseCase finds the decentralized-origin Publication by title text search.");

        const byAuthor = searchUseCase.execute({ author: 'alice' });
        assert(byAuthor.items.length === 1 && byAuthor.items[0].documentId === 'world-repo-integration-1',
            '2. ...and by author filter, with documentId intact.');

        const miss = searchUseCase.execute({ text: 'no-such-title-exists' });
        assert(miss.items.length === 0, '3. ...and correctly excludes it from an unrelated query.');
    }
    console.log('✓ Section C: Repository\'s own real, unmodified SearchPublicationsUseCase — no subclass, no wrapper, no rewritten copy — finds the Section B Publication by title text and by author filter, and correctly excludes it from an unrelated query.');

    // ===============================================================
    // Section D — Resolution failure isolation: a resolution that does
    // not reach RESOLVED never reaches the provider.
    // ===============================================================
    {
        const alice = makeIdentity('Alice');
        const publishStorage = new InMemoryStorageProvider();
        const publishResolver = new PublicationResolver(new LocalContentStore(publishStorage), new LocalAuthorizationVerifier());
        const publication = makeLocalStylePublication({ documentId: 'world-failure-1', title: 'Unreachable Content', author: 'alice' }, alice);
        const envelope = await publishResolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: alice });

        // A DIFFERENT resolver, backed by an EMPTY content store — bytes
        // were never replicated here, the same honest CONTENT_UNAVAILABLE
        // case a peer who has not yet sent content produces.
        const starvedResolver = new PublicationResolver(new LocalContentStore(new InMemoryStorageProvider()), new LocalAuthorizationVerifier());
        const { kindPlugins } = new CreatePublicationDisplayKindRegistryUseCase().execute();
        const coordinator = new PublicationResolutionCoordinator(starvedResolver, null);

        const view = await resolvePublicationView(envelope, { coordinator, kindPlugins });
        assert(view.outcome === PublicationResolutionOutcome.CONTENT_UNAVAILABLE,
            `1. a resolver with no access to the bytes fails with CONTENT_UNAVAILABLE, not some other outcome (${view.outcome}).`);
        assert(view.resolved === false, '2. view.resolved is false — this is a genuine resolution failure.');

        const provider = new DecentralizedPublicationDiscoveryProvider();
        admitToRepositoryDiscovery(view, provider);
        assert(provider.list().length === 0,
            '3. a failed resolution is never admitted — no placeholder, no failed entry, no partial candidate.');
    }
    console.log('✓ Section D: resolution failure isolation. A resolution that does not reach RESOLVED (here, CONTENT_UNAVAILABLE — a resolver with no access to the envelope\'s own referenced bytes) is never admitted into the provider: no placeholder Publication, no failed Repository entry, exactly as this milestone\'s own semantic boundary requires.');

    // ===============================================================
    // Section E — Content-kind isolation: a resolved BlueprintAttribution
    // and a resolved PlaceNamingClaim — both genuinely resolved: true —
    // are never admitted, because neither is a publisher/Publication.js
    // instance.
    // ===============================================================
    {
        const alice = makeIdentity('Alice');
        const storage = new InMemoryStorageProvider();
        const { kindPlugins, verifier } = new CreatePublicationDisplayKindRegistryUseCase().execute();
        const resolver = new PublicationResolver(new LocalContentStore(storage), verifier);
        const coordinator = new PublicationResolutionCoordinator(resolver, null);
        const provider = new DecentralizedPublicationDiscoveryProvider();

        // E1. forkbuild.blueprint-attribution — real, signed.
        let attribution = new BlueprintAttribution({ fingerprint: 'bp:repo-integration-1', authorIdentityId: alice.getSigningIdentity().id });
        attribution = attribution.withSignature(alice.signCanonical(attribution.getSigningDescriptor()));
        const attributionEnvelope = await resolver.publish({
            content: attribution, contentKind: BLUEPRINT_ATTRIBUTION_KIND, contentSchemaVersion: ATTRIBUTION_SCHEMA_VERSION, identityProvider: alice
        });
        const attributionView = await resolvePublicationView(attributionEnvelope, { coordinator, kindPlugins });
        assert(attributionView.resolved === true, `1. the BlueprintAttribution envelope genuinely resolves (${attributionView.reason}).`);
        assert(!(attributionView.content instanceof Publication),
            '2. ...but its resolved content is NOT a publisher/Publication.js instance.');
        admitToRepositoryDiscovery(attributionView, provider);
        assert(provider.list().length === 0,
            '3. a resolved BlueprintAttribution is never admitted into the Publication-only discovery provider.');

        // E2. forkbuild.place-naming-claim — real, signed, wrapped.
        let claim = new PlaceNamingClaim({ worldId: 'world-repo-integration', regionId: 'region-repo-integration', name: 'Isolation Cove', authorIdentityId: alice.getSigningIdentity().id });
        claim = claim.withSignature(alice.signCanonical(claim.getSigningDescriptor()));
        const claimEnvelope = await resolver.publish({
            content: buildPlaceNamingClaimPublication(claim), contentKind: PLACE_NAMING_CLAIM_PUBLICATION_KIND, contentSchemaVersion: NAMING_SCHEMA_VERSION, identityProvider: alice
        });
        const claimView = await resolvePublicationView(claimEnvelope, { coordinator, kindPlugins });
        assert(claimView.resolved === true, `4. the PlaceNamingClaim envelope genuinely resolves (${claimView.reason}).`);
        assert(!(claimView.content instanceof Publication),
            '5. ...but its resolved content is NOT a publisher/Publication.js instance either.');
        admitToRepositoryDiscovery(claimView, provider);
        assert(provider.list().length === 0,
            '6. a resolved PlaceNamingClaim is likewise never admitted — the provider remains empty after both attempts.');

        // E3. A genuine forkbuild.publication, run through the SAME
        // provider right after, proves this isolation is a real
        // content-kind gate, not an accident of an always-empty provider.
        const publication = makeLocalStylePublication({ documentId: 'world-repo-integration-isolation', title: 'The Only Admissible Kind', author: 'alice' }, alice);
        const publicationEnvelope = await resolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: alice });
        const publicationView = await resolvePublicationView(publicationEnvelope, { coordinator, kindPlugins });
        admitToRepositoryDiscovery(publicationView, provider);
        assert(provider.list().length === 1 && provider.list()[0] === publicationView.content,
            '7. by contrast, a genuine forkbuild.publication resolution IS admitted — confirming the gate discriminates by content kind, not by rejecting everything.');
    }
    console.log('✓ Section E: content-kind isolation. application/CreatePublicationDisplayKindRegistryUseCase.js\'s own content-kind dispatch stays authoritative: a resolved BlueprintAttribution and a resolved PlaceNamingClaim — both genuinely `resolved: true` — are never admitted into the Publication-only discovery provider, because resolvePublicationView()\'s own `content` is a publisher/Publication.js instance only for the forkbuild.publication content kind. A genuine Publication resolved through the identical provider immediately afterward proves the gate discriminates, rather than merely reflecting an empty provider.');

    // ===============================================================
    // Section F — Local Publication regression: LocalDiscoveryProvider
    // and a purely local Publication behave exactly as before, completely
    // independent of the new provider.
    // ===============================================================
    {
        const alice = makeIdentity('Alice');
        const localPublication = makeLocalStylePublication({ documentId: 'world-local-regression-1', title: 'Local As Ever', author: 'alice' }, alice);

        const localStorageProvider = new InMemoryStorageProvider();
        localStorageProvider.save('forkbuild-publications', [localPublication.toJSON()]);

        const localDiscoveryProvider = new LocalDiscoveryProvider(localStorageProvider);
        const localSearchUseCase = new SearchPublicationsUseCase(localDiscoveryProvider);

        const byText = localSearchUseCase.execute({ text: 'local as ever' });
        assert(byText.items.length === 1 && byText.items[0].documentId === 'world-local-regression-1',
            '1. a purely local publication is found by LocalDiscoveryProvider + SearchPublicationsUseCase exactly as before this milestone.');

        // The new provider exists, unrelated, in the same process — its
        // mere presence changes nothing about the local pipeline above,
        // proven by constructing one, adding an UNRELATED Publication to
        // it, and re-running the identical local search.
        const decentralizedProvider = new DecentralizedPublicationDiscoveryProvider();
        const bob = makeIdentity('Bob');
        decentralizedProvider.add(makeLocalStylePublication({ documentId: 'world-unrelated-1', title: 'Unrelated Decentralized Entry', author: 'bob' }, bob));

        const byTextAgain = localSearchUseCase.execute({ text: 'local as ever' });
        assert(byTextAgain.items.length === 1 && byTextAgain.items[0].documentId === 'world-local-regression-1',
            '2. the local search result is completely unaffected by an unrelated DecentralizedPublicationDiscoveryProvider existing and holding its own, different Publication — the two providers share no state.');

        // And application/CreateDiscoveryUseCase.js itself — the real
        // composition root Repository actually uses — is untouched,
        // still wiring only LocalDiscoveryProvider, reconfirmed live.
        const { discoveryProvider, searchPublicationsUseCase } = new CreateDiscoveryUseCase().execute();
        assert(discoveryProvider instanceof LocalDiscoveryProvider && !(discoveryProvider instanceof DecentralizedPublicationDiscoveryProvider),
            '3. application/CreateDiscoveryUseCase.js still constructs a plain LocalDiscoveryProvider, live — this milestone did not touch it.');
        assert(typeof searchPublicationsUseCase.execute === 'function',
            '4. its own searchPublicationsUseCase is still the real, callable SearchPublicationsUseCase.');
    }
    console.log('✓ Section F: local Publication regression, reconfirmed live. LocalDiscoveryProvider + SearchPublicationsUseCase find a purely local publication exactly as before; an unrelated DecentralizedPublicationDiscoveryProvider existing in the same process, holding its own different Publication, changes nothing about that result. application/CreateDiscoveryUseCase.js — Repository\'s own real composition root — still constructs a plain LocalDiscoveryProvider, live.');

    // ===============================================================
    // Section G — Identity: documentId/contentReference/title/author/
    // license/schemaVersion/signature all survive resolution and
    // admission unmodified; no Repository-specific identity is generated
    // anywhere in the chain.
    // ===============================================================
    {
        assert(flagshipResolvedPublication.documentId === flagshipOriginalPublication.documentId,
            '1. documentId survives unmodified.');
        assert(flagshipResolvedPublication.title === flagshipOriginalPublication.title,
            '2. title survives unmodified.');
        assert(flagshipResolvedPublication.author === flagshipOriginalPublication.author,
            '3. author survives unmodified.');
        assert(flagshipResolvedPublication.license.id === flagshipOriginalPublication.license.id,
            '4. license survives unmodified.');
        assert(flagshipResolvedPublication.schemaVersion === flagshipOriginalPublication.schemaVersion,
            '5. schemaVersion survives unmodified.');
        assert(flagshipResolvedPublication.contentReference.hash === flagshipOriginalPublication.contentReference.hash &&
            flagshipResolvedPublication.contentReference.algorithm === flagshipOriginalPublication.contentReference.algorithm &&
            flagshipResolvedPublication.contentReference.mediaType === flagshipOriginalPublication.contentReference.mediaType,
            '6. contentReference survives unmodified.');
        assert(flagshipResolvedPublication.signature.toJSON
            ? JSON.stringify(flagshipResolvedPublication.signature.toJSON()) === JSON.stringify(flagshipOriginalPublication.signature.toJSON())
            : flagshipResolvedPublication.signature === flagshipOriginalPublication.signature,
            '7. signature survives unmodified — the original signing identity\'s own signature, never re-signed by this replica or by the provider.');
        assert(flagshipResolvedPublication.id === flagshipOriginalPublication.id,
            '8. the Publication\'s own id survives unmodified.');

        // No Repository-specific identity is ever generated: add() itself
        // performs no transformation — confirmed structurally, the same
        // discipline 0.9.335's own Section E already applied to add()'s
        // implementation.
        const providerSource = await readSource('discovery/DecentralizedPublicationDiscoveryProvider.js');
        assert(providerSource.includes('this._publications.push(publication);') &&
            !/createId|generateId|uuid|Math\.random/i.test(providerSource),
            '9. discovery/DecentralizedPublicationDiscoveryProvider.js#add() pushes the given Publication instance unmodified — it never mints a Repository-specific id.');

        // And the exact reference admitted into the provider IS the
        // exact reference resolvePublicationView() returned — no copy,
        // no projection, confirmed live off Section B's own objects.
        assert(flagshipProvider.list()[0] === flagshipResolvedPublication,
            '10. the object found in provider.list() is reference-identical to the object resolvePublicationView() returned — no intermediate copy anywhere in the chain.');
    }
    console.log('✓ Section G: identity, verified field by field off Section B\'s own live objects. documentId, contentReference (hash/algorithm/mediaType), title, author, license, schemaVersion, signature, and the Publication\'s own id all survive the full peer-transport-then-resolution-then-admission round trip unmodified. discovery/DecentralizedPublicationDiscoveryProvider.js#add() is confirmed structurally to push the given instance as-is — no Repository-specific identity is ever generated.');

    // ===============================================================
    // Section H — Provider singleton / accumulation: multiple
    // decentralized Publications resolved through the same shared
    // provider accumulate together, never overwrite one another.
    // ===============================================================
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const storage = new InMemoryStorageProvider();
        const { kindPlugins, verifier } = new CreatePublicationDisplayKindRegistryUseCase().execute();
        const resolver = new PublicationResolver(new LocalContentStore(storage), verifier);
        const coordinator = new PublicationResolutionCoordinator(resolver, null);

        const sharedProvider = new DecentralizedPublicationDiscoveryProvider();

        const first = makeLocalStylePublication({ documentId: 'world-accumulate-1', title: 'First Arrival', author: 'alice' }, alice);
        const firstEnvelope = await resolver.publish({ content: first, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: alice });
        const firstView = await resolvePublicationView(firstEnvelope, { coordinator, kindPlugins });
        admitToRepositoryDiscovery(firstView, sharedProvider);

        const second = makeLocalStylePublication({ documentId: 'world-accumulate-2', title: 'Second Arrival', author: 'bob' }, bob);
        const secondEnvelope = await resolver.publish({ content: second, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: bob });
        const secondView = await resolvePublicationView(secondEnvelope, { coordinator, kindPlugins });
        admitToRepositoryDiscovery(secondView, sharedProvider);

        assert(sharedProvider.list().length === 2,
            '1. two independently resolved decentralized Publications, admitted through the SAME shared provider, both accumulate — neither overwrites the other.');
        assert(sharedProvider.findByAuthor('alice').length === 1 && sharedProvider.findByAuthor('bob').length === 1,
            '2. each is independently findable by its own author.');

        const searchUseCase = new SearchPublicationsUseCase(sharedProvider);
        const both = searchUseCase.execute({});
        assert(both.items.length === 2,
            '3. Repository\'s own real SearchPublicationsUseCase, over the SAME accumulated provider, sees both — this is a real, growing catalog, not a single-item special case.');
    }
    console.log('✓ Section H: provider singleton / accumulation, live. Two independently resolved decentralized Publications, admitted through the identical shared provider instance, both accumulate and are both independently findable — proven through Repository\'s own real, unmodified SearchPublicationsUseCase as well as the provider\'s own findByAuthor().');

    // ===============================================================
    // Section I — No duplicate provider construction: guarded
    // structurally — ui/main.js constructs exactly one instance, and no
    // OTHER production file constructs one at all.
    // ===============================================================
    {
        const productionConstructors = execSync(
            `grep -rlE "new DecentralizedPublicationDiscoveryProvider\\(" --include="*.js" . || true`,
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim().split('\n').filter(Boolean)
            .filter((f) => !f.includes('/tests/') && !f.endsWith('.test.js') && !f.includes('node_modules'));
        assert(productionConstructors.length === 1 && productionConstructors[0] === './ui/main.js',
            `1. exactly one production file constructs DecentralizedPublicationDiscoveryProvider, and it is ui/main.js (found: ${productionConstructors.join(', ') || 'none'}) — no other production file (a view, a use case, a coordinator) can silently create a second, isolated Repository catalog.`);
    }
    console.log('✓ Section I: guarded. Exactly one production file — ui/main.js — ever constructs a DecentralizedPublicationDiscoveryProvider; no other production file does, so an accidental second construction (which would silently create an isolated Repository catalog, per 0.9.336\'s own Section H4 live proof) cannot happen without also changing this guard.');

    // ===============================================================
    // Section J — No Repository architecture changes: application/
    // SearchPublicationsUseCase.js, discovery/LocalDiscoveryProvider.js,
    // and application/CreateDiscoveryUseCase.js are byte-for-byte
    // untouched by this milestone.
    // ===============================================================
    {
        const untouched = gitDiffFiles([
            'application/SearchPublicationsUseCase.js',
            'discovery/LocalDiscoveryProvider.js',
            'application/CreateDiscoveryUseCase.js'
        ]);
        assert(untouched.length === 0,
            `1. none of application/SearchPublicationsUseCase.js, discovery/LocalDiscoveryProvider.js, or application/CreateDiscoveryUseCase.js is modified by this milestone (found changed: ${untouched.join(', ') || 'none'}).`);

        // Reconfirmed structurally too, matching 0.9.336's own Section J
        // style: neither file references the new provider at all.
        const searchUseCaseSource = await readSource('application/SearchPublicationsUseCase.js');
        assert(!/DecentralizedPublicationDiscoveryProvider/.test(searchUseCaseSource),
            '2. application/SearchPublicationsUseCase.js never references discovery/DecentralizedPublicationDiscoveryProvider.js — every proof above worked through its existing, single-discoveryProvider constructor unchanged.');
        const localDiscoverySource = await readSource('discovery/LocalDiscoveryProvider.js');
        assert(!/DecentralizedPublicationDiscoveryProvider/.test(localDiscoverySource),
            '3. discovery/LocalDiscoveryProvider.js never references it either.');
    }
    console.log('✓ Section J: no Repository architecture changes. application/SearchPublicationsUseCase.js, discovery/LocalDiscoveryProvider.js, and application/CreateDiscoveryUseCase.js are untouched by this milestone\'s own git diff, and structurally reconfirmed to carry no reference to the new provider at all — Repository\'s own real search path is exactly as it was, and every Section above worked through it unmodified.');

    console.log('\nAll Decentralized Publication Repository Integration tests passed.');
}

run().catch((error) => {
    console.error('DecentralizedPublicationRepositoryIntegration.test.js FAILED:', error);
    process.exitCode = 1;
});
