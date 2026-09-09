import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { License } from '../core/License.js';
import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { PublicationExchange } from '../application/PublicationExchange.js';
import { PublicationPeerExchange } from '../application/PublicationPeerExchange.js';
import { PublicationResolver } from '../application/PublicationResolver.js';
import { PublicationResolutionCoordinator } from '../application/PublicationResolutionCoordinator.js';
import { PublicationResolutionOutcome } from '../application/PublicationResolutionOutcome.js';
import { resolvePublicationView } from '../application/PublicationResolutionView.js';
import { CreatePublicationDisplayKindRegistryUseCase } from '../application/CreatePublicationDisplayKindRegistryUseCase.js';
import { PUBLICATION_CONTENT_KIND } from '../application/PublicationContentValidator.js';

import { BlueprintAttribution, BLUEPRINT_ATTRIBUTION_KIND, CURRENT_SCHEMA_VERSION as ATTRIBUTION_SCHEMA_VERSION } from '../core/BlueprintAttribution.js';
import { PlaceNamingClaim } from '../core/PlaceNamingClaim.js';
import { buildPlaceNamingClaimPublication, PLACE_NAMING_CLAIM_PUBLICATION_KIND, CURRENT_SCHEMA_VERSION as NAMING_SCHEMA_VERSION } from '../application/PlaceNamingClaimPublication.js';

import { LocalContentStore } from '../content/LocalContentStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';

// 0.9.333 — Decentralized Publication Display-Kind Integration.
//
// 0.9.331 built the third kindPlugin (forkbuild.publication). 0.9.332
// proved it genuinely travels the existing decentralized transport
// pipeline end to end. Both stopped short of the Publications Center
// itself: application/CreatePublicationDisplayKindRegistryUseCase.js —
// the generic kindPlugin registry ui/views/DecentralizedPublicationsView.js
// actually reads from — still wired only the two kinds that predate
// 0.9.331 (0.9.332's own Section H, named as an honest, narrowly-scoped
// gap, never a defect). This milestone closes exactly that gap: one
// third entry in the SAME registry, composed the SAME way the other two
// already are, so a decentralized-origin Publication renders through the
// SAME generic card ui/views/DecentralizedPublicationsView.js already
// provides for every other content kind — no new UI component, no new
// dispatch mechanism, no Repository coupling.
//
//   Section A — FLAGSHIP: real transport, end to end, through to display.
//   Section B — Presentation convergence: local vs. decentralized origin.
//   Section C — Identity preservation through to the display view.
//   Section D — Content-kind isolation: three real kinds, three real
//               dispatches, and an unknown fourth kind still falls
//               through to the existing "unsupported kind" case rather
//               than any fallback.
//   Section E — Existing-kind regression: BlueprintAttribution/
//               PlaceNamingClaim display is untouched, and the registry
//               was extended, not reordered.
//   Section F — No decentralized-origin UI branch anywhere in the path.
//   Section G — No Repository coupling, reconfirmed with the registry now
//               actually wired.
//   Section H — Final verdict.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function grepFiles(pattern, dirs, { ignoreCase = false } = {}) {
    let hits = '';
    try {
        const flags = ignoreCase ? '-rliE' : '-rlE';
        hits = execSync(`grep ${flags} "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* grep exits non-zero on no match; treated as zero hits */ }
    return hits.trim() ? hits.trim().split('\n') : [];
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

function makePublication({ title = 'The Farmstead', author = 'alice' } = {}, identityProvider) {
    const documentContentReference = new ContentReference({
        hash: 'docHash-fixed-content-1', algorithm: 'fnv1a-32', mediaType: 'application/json', size: 128
    });
    let publication = new Publication({
        documentId: 'world-farmstead-1',
        title,
        author,
        providerId: 'local',
        contentHash: documentContentReference.hash,
        schemaVersion: 3,
        license: new License({ id: 'CC0-1.0' }),
        contentReference: documentContentReference,
        publisherIdentity: identityProvider.getSigningIdentity().toJSON(),
        signature: null
    });
    return publication.withSignature(identityProvider.signCanonical(publication.getSigningDescriptor()));
}

// The identical StubPeerMessageBus/StubConnectedPeerRegistry stand-ins
// tests/PublicationDecentralizedTransportConvergenceAudit.test.js's own
// Section A already uses to exercise the REAL transport classes without a
// real handshake.
class StubPeerMessageBus {
    constructor() {
        this._handlers = new Map();
        this.sent = [];
    }
    attach() {}
    send(peer, protocol, payload) {
        if (peer.getLifecycleState() !== PeerLifecycleState.AUTHENTICATED) {
            throw new Error('StubPeerMessageBus: cannot send, peer is not AUTHENTICATED');
        }
        this.sent.push({ peer, protocol, payload });
    }
    subscribe(protocol, handler) {
        if (!this._handlers.has(protocol)) this._handlers.set(protocol, new Set());
        this._handlers.get(protocol).add(handler);
        return () => this._handlers.get(protocol).delete(handler);
    }
    deliver(protocol, payload) {
        const handlers = this._handlers.get(protocol);
        if (!handlers) return;
        for (const handler of Array.from(handlers)) handler(payload);
    }
}

class StubConnectedPeerRegistry {
    constructor(peers = []) { this._peers = peers; }
    list() { return this._peers; }
    onChange() { return () => {}; }
}

function stubPeer(connectionId, state) {
    return { connectionId, getLifecycleState: () => state };
}

// Alice -> publish -> announce (REAL PublicationPeerExchange) -> wire ->
// Bob's _handleIncoming (REAL) -> importPublication (REAL) -> catalog.
// Returns Bob's cataloged envelope (a DecentralizedPublication), the
// underlying storage Bob's own resolver can read content back from, and
// the original Publication Alice started with, for later comparison.
async function gossipPublicationToBob(alice, originalPublication) {
    const sharedStorage = new InMemoryStorageProvider();
    const aliceResolver = new PublicationResolver(new LocalContentStore(sharedStorage), new CreatePublicationDisplayKindRegistryUseCase().execute().verifier);
    const envelope = await aliceResolver.publish({
        content: originalPublication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: alice
    });

    const aliceExchange = new PublicationExchange(new LocalPublicationCatalog(new InMemoryStorageProvider()), new CreatePublicationDisplayKindRegistryUseCase().execute().verifier);
    const aliceBus = new StubPeerMessageBus();
    const bobPeer = stubPeer('conn-bob', PeerLifecycleState.AUTHENTICATED);
    const alicePeerExchange = new PublicationPeerExchange(aliceExchange, aliceBus, new StubConnectedPeerRegistry([bobPeer]));
    alicePeerExchange.announce(envelope);

    const bobCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
    const bobExchange = new PublicationExchange(bobCatalog, new CreatePublicationDisplayKindRegistryUseCase().execute().verifier);
    const bobBus = new StubPeerMessageBus();
    const bobPeerExchange = new PublicationPeerExchange(bobExchange, bobBus, new StubConnectedPeerRegistry([]));
    bobBus.deliver(PublicationPeerExchange.DEFAULT_PROTOCOL, aliceBus.sent[0].payload);

    return { cataloged: bobCatalog.list()[0], sharedStorage };
}

async function run() {
    console.log('Running Publication Display-Kind Integration tests...\n');

    // ===============================================================
    // Section A — FLAGSHIP: a real, signed Publication travels the REAL
    // decentralized transport (PublicationPeerExchange -> wire ->
    // PublicationExchange -> LocalPublicationCatalog), then is resolved
    // and fed into the real Publications Center path — application/
    // PublicationResolutionView.js#resolvePublicationView(), driven by
    // application/CreatePublicationDisplayKindRegistryUseCase.js's own
    // real, unmodified-in-shape output — never a direct resolver call
    // standing in for the display path.
    // ===============================================================
    let flagshipView, flagshipOriginal, flagshipAlice;
    {
        const alice = makeIdentity('Alice');
        flagshipAlice = alice;
        flagshipOriginal = makePublication({}, alice);
        const { cataloged, sharedStorage } = await gossipPublicationToBob(alice, flagshipOriginal);

        assert(cataloged.contentKind === PUBLICATION_CONTENT_KIND, '1. Bob\'s cataloged envelope still declares forkbuild.publication after crossing the wire');
        assert(!(cataloged instanceof Publication), '2. what is cataloged is the envelope, never the Publication itself');

        const { kindPlugins } = new CreatePublicationDisplayKindRegistryUseCase().execute();
        assert(!!kindPlugins[PUBLICATION_CONTENT_KIND] && kindPlugins[PUBLICATION_CONTENT_KIND].contentKind === PUBLICATION_CONTENT_KIND,
            '3. the display-kind registry now carries an entry for forkbuild.publication, keyed correctly');

        const bobResolver = new PublicationResolver(new LocalContentStore(sharedStorage), new CreatePublicationDisplayKindRegistryUseCase().execute().verifier);
        const coordinator = new PublicationResolutionCoordinator(bobResolver, null);

        flagshipView = await resolvePublicationView(cataloged, { coordinator, kindPlugins });

        assert(flagshipView.resolved === true, `4. the decentralized-origin Publication resolves through the Publications Center's own view path (${flagshipView.reason})`);
        assert(flagshipView.outcome === PublicationResolutionOutcome.RESOLVED, '5. outcome is RESOLVED, not merely truthy');
        assert(flagshipView.content instanceof Publication, '6. resolved content handed to the view is a real Publication instance');
        assert(typeof flagshipView.contentSummary === 'string' && flagshipView.contentSummary.startsWith('Publication —'),
            `7. the view carries a real contentSummary produced by the newly-registered describe() (got: ${JSON.stringify(flagshipView.contentSummary)})`);
        assert(flagshipView.contentSummary.includes('The Farmstead') && flagshipView.contentSummary.includes('alice'),
            '8. the summary actually reflects this publication\'s own title and author, not a generic placeholder');
    }
    console.log('✓ Section A: FLAGSHIP — a real Publication travels publish() -> announce() -> (wire) -> _handleIncoming() -> importPublication() -> catalog -> resolvePublicationView(), driven by the real CreatePublicationDisplayKindRegistryUseCase output, and becomes visible in the Publications Center exactly like any other cataloged content kind — the one gap 0.9.332 named is closed.');

    // ===============================================================
    // Section B — Presentation convergence: a LOCALLY resolved view of
    // the identical Publication (no peer transport involved at all)
    // converges on the same presentation as the DECENTRALIZED-origin one
    // from Section A. The origin of acquisition must not alter the
    // Publication's intrinsic presentation.
    // ===============================================================
    {
        const { kindPlugins, verifier } = new CreatePublicationDisplayKindRegistryUseCase().execute();
        const localStorage = new InMemoryStorageProvider();
        const localResolver = new PublicationResolver(new LocalContentStore(localStorage), verifier);
        const localCoordinator = new PublicationResolutionCoordinator(localResolver, null);

        // Alice's own replica resolving a publication of her own — never
        // gossiped, never received over any wire, catalogued only in her
        // own in-memory storage as a bare DecentralizedPublication the
        // way application/PublicationResolver.js#publish() itself already
        // returns one.
        const localOriginal = makePublication({}, flagshipAlice);
        const localEnvelope = await localResolver.publish({ content: localOriginal, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: flagshipAlice });

        const localView = await resolvePublicationView(localEnvelope, { coordinator: localCoordinator, kindPlugins });

        assert(localView.resolved === true, `1. the purely local publication resolves (${localView.reason})`);
        assert(localView.contentSummary === flagshipView.contentSummary,
            `2. the LOCAL view's contentSummary is byte-identical to the DECENTRALIZED-origin view's own (local: ${JSON.stringify(localView.contentSummary)}, decentralized: ${JSON.stringify(flagshipView.contentSummary)}) — acquisition origin does not alter presentation`);
        assert(localView.content.title === flagshipView.content.title && localView.content.author === flagshipView.content.author,
            '3. title/author converge across both acquisition paths');
        assert(localView.content.license.id === flagshipView.content.license.id && localView.content.schemaVersion === flagshipView.content.schemaVersion,
            '4. license/schemaVersion converge across both acquisition paths');
        assert(localView.contentKind === flagshipView.contentKind, '5. both views report the identical contentKind');
    }
    console.log('✓ Section B: a Publication resolved purely locally and a Publication resolved after crossing the real decentralized transport converge on the exact same presentation — same contentSummary, same title/author/license/schemaVersion, same contentKind. Acquisition origin has no bearing on how a Publication presents.');

    // ===============================================================
    // Section C — Identity preservation: the display view still carries
    // every identity field a person or another part of the UI might read
    // off it, and resolving through the display path never fabricates a
    // second identity for the same Publication.
    // ===============================================================
    {
        const content = flagshipView.content;
        assert(content.id === flagshipOriginal.id, '1. id preserved through to the display view');
        assert(content.documentId === flagshipOriginal.documentId, '2. documentId preserved through to the display view');
        assert(content.contentReference.hash === flagshipOriginal.contentReference.hash, '3. contentReference preserved through to the display view');
        assert(content.title === flagshipOriginal.title, '4. title preserved through to the display view');
        assert(content.author === flagshipOriginal.author, '5. author preserved through to the display view');
        assert(content.license.id === flagshipOriginal.license.id, '6. license preserved through to the display view');
        assert(content.schemaVersion === flagshipOriginal.schemaVersion, '7. schemaVersion preserved through to the display view');
        assert(content.signature && content.signature.signer === flagshipAlice.getSigningIdentity().id,
            '8. signature preserved through to the display view, still naming its real signer');

        // No second identity: the resolved Publication keeps its OWN id
        // (documentId-keyed, per publisher/Publication.js), distinct from
        // but never confused with the enclosing envelope's own id
        // (core/DecentralizedPublication.js's own, unrelated identity
        // space) — the view exposes both, never collapses them into one.
        assert(flagshipView.publication instanceof DecentralizedPublication && flagshipView.publication.id !== content.id,
            '9. the envelope (flagshipView.publication, its own DecentralizedPublication identity) and the resolved content (its own Publication identity) keep two structurally distinct identity spaces, never collapsed into one');
        assert(content instanceof Publication && !(content instanceof DecentralizedPublication),
            '10. the resolved content is a real Publication, never itself a DecentralizedPublication — the two layers never collapse into one, even at display time');
    }
    console.log('✓ Section C: every identity field the flagship spec named — id, documentId, contentReference, title, author, license, schemaVersion, signature — survives all the way through to the Publications Center\'s own display view, and resolving never introduces a second identity for the same Publication.');

    // ===============================================================
    // Section D — Content-kind isolation: three real, differently-shaped
    // kinds, each dispatching only to its own presentation, never to a
    // fallback — and a fourth, unregistered kind still falls through to
    // the EXISTING "unsupported kind" case, never silently treated as a
    // Publication.
    // ===============================================================
    {
        const alice = makeIdentity('Alice');
        const storage = new InMemoryStorageProvider();
        const { kindPlugins, verifier } = new CreatePublicationDisplayKindRegistryUseCase().execute();
        const resolver = new PublicationResolver(new LocalContentStore(storage), verifier);
        const coordinator = new PublicationResolutionCoordinator(resolver, null);

        // D1. forkbuild.publication.
        const publicationEnvelope = await resolver.publish({
            content: makePublication({}, alice), contentKind: PUBLICATION_CONTENT_KIND, identityProvider: alice
        });
        const publicationView = await resolvePublicationView(publicationEnvelope, { coordinator, kindPlugins });
        assert(publicationView.resolved && publicationView.contentSummary.startsWith('Publication —'),
            `1. a forkbuild.publication envelope dispatches to the Publication describe() (${publicationView.contentSummary})`);

        // D2. forkbuild.blueprint-attribution — real, signed, self-describing.
        let attribution = new BlueprintAttribution({ fingerprint: 'bp:isolation-check-333', authorIdentityId: alice.getSigningIdentity().id });
        attribution = attribution.withSignature(alice.signCanonical(attribution.getSigningDescriptor()));
        const attributionEnvelope = await resolver.publish({
            content: attribution, contentKind: BLUEPRINT_ATTRIBUTION_KIND, contentSchemaVersion: ATTRIBUTION_SCHEMA_VERSION, identityProvider: alice
        });
        const attributionView = await resolvePublicationView(attributionEnvelope, { coordinator, kindPlugins });
        assert(attributionView.resolved && attributionView.contentSummary.startsWith('Blueprint attribution —'),
            `2. a forkbuild.blueprint-attribution envelope dispatches to the BlueprintAttribution describe(), never the Publication one (${attributionView.contentSummary})`);

        // D3. forkbuild.place-naming-claim — real, signed, wrapped.
        let claim = new PlaceNamingClaim({ worldId: 'world-333', regionId: 'region-333', name: 'Isolation Cove', authorIdentityId: alice.getSigningIdentity().id });
        claim = claim.withSignature(alice.signCanonical(claim.getSigningDescriptor()));
        const claimEnvelope = await resolver.publish({
            content: buildPlaceNamingClaimPublication(claim), contentKind: PLACE_NAMING_CLAIM_PUBLICATION_KIND, contentSchemaVersion: NAMING_SCHEMA_VERSION, identityProvider: alice
        });
        const claimView = await resolvePublicationView(claimEnvelope, { coordinator, kindPlugins });
        assert(claimView.resolved && claimView.contentSummary.startsWith('Place name claim —'),
            `3. a forkbuild.place-naming-claim envelope dispatches to the PlaceNamingClaim describe(), never the Publication one (${claimView.contentSummary})`);

        // D4. Every summary is distinct — no two kinds ever converge on
        // the same rendered text merely because all three now share one
        // registry.
        const summaries = new Set([publicationView.contentSummary, attributionView.contentSummary, claimView.contentSummary]);
        assert(summaries.size === 3, '4. all three content kinds render three genuinely distinct summaries');

        // D5. A fourth, deliberately UNREGISTERED contentKind still falls
        // through to application/PublicationResolutionView.js's own
        // existing "this replica does not yet know how to display"
        // case — proving the new registration did not turn the generic
        // Publication renderer into a silent fallback/wildcard for
        // everything else.
        const unknownEnvelope = new DecentralizedPublication({
            id: 'dp-unknown-333', contentKind: 'forkbuild.some-future-kind', contentSchemaVersion: 1,
            contentReference: publicationEnvelope.contentReference, publisherIdentity: alice.getSigningIdentity().toJSON(),
            signature: publicationEnvelope.signature
        });
        const unknownView = await resolvePublicationView(unknownEnvelope, { coordinator, kindPlugins });
        assert(unknownView.resolved === false && unknownView.outcome === null,
            '5. an unregistered contentKind is never resolved, never silently handled by the Publication kindPlugin');
        assert(typeof unknownView.reason === 'string' && unknownView.reason.includes('forkbuild.some-future-kind'),
            `6. the reason names the exact unsupported kind, exactly as application/PublicationResolutionView.js already does for every other unknown kind (${unknownView.reason})`);
    }
    console.log('✓ Section D: forkbuild.publication, forkbuild.blueprint-attribution, and forkbuild.place-naming-claim each dispatch to their own, distinct presentation — three real resolutions, three real, non-overlapping summaries. An unregistered fourth kind still falls through to the existing "unsupported kind" case, proving the generic Publication renderer never became an accidental fallback for every content kind.');

    // ===============================================================
    // Section E — Existing-kind regression: BlueprintAttribution/
    // PlaceNamingClaim presentation is byte-for-byte unchanged, and the
    // registry was EXTENDED, never reordered or replaced.
    // ===============================================================
    {
        const { kindPlugins } = new CreatePublicationDisplayKindRegistryUseCase().execute();
        const regressionIdentityId = 'did:key:zRegressionIdentityLongEnough';
        const shortId = regressionIdentityId.slice(-14);

        assert(kindPlugins[BLUEPRINT_ATTRIBUTION_KIND].describe({ fingerprint: 'bp:regression-1', authorIdentityId: regressionIdentityId }) ===
            `Blueprint attribution — bp:regression-1, claimed by ${shortId}`,
            '1. BlueprintAttribution\'s own describe() format is exactly what it was before this milestone — untouched by the new third entry');
        assert(kindPlugins[PLACE_NAMING_CLAIM_PUBLICATION_KIND].describe({ name: 'Regression Cove', authorIdentityId: regressionIdentityId }) ===
            `Place name claim — "Regression Cove", claimed by ${shortId}`,
            '2. PlaceNamingClaim\'s own describe() format is exactly what it was before this milestone — untouched by the new third entry');

        // The registry was EXTENDED, not reordered: the two original keys
        // still come first, in their original order, with the new one
        // appended after — never inserted in front of, or in between,
        // the two kinds that already existed.
        const keys = Object.keys(kindPlugins);
        assert(keys.indexOf(BLUEPRINT_ATTRIBUTION_KIND) === 0 && keys.indexOf(PLACE_NAMING_CLAIM_PUBLICATION_KIND) === 1 && keys.indexOf(PUBLICATION_CONTENT_KIND) === 2,
            `3. registration order is [BlueprintAttribution, PlaceNamingClaim, Publication] — the registry was extended, never reordered (got: ${keys.join(', ')})`);

        // Both original kindPlugins still carry no store() — this
        // milestone touches display only, never persistence, for any of
        // the three kinds.
        assert(kindPlugins[BLUEPRINT_ATTRIBUTION_KIND].store === undefined && kindPlugins[PLACE_NAMING_CLAIM_PUBLICATION_KIND].store === undefined && kindPlugins[PUBLICATION_CONTENT_KIND].store === undefined,
            '4. none of the three display kindPlugins carry a store() — resolving any of them for display can never import anything, for any kind');
    }
    console.log('✓ Section E: BlueprintAttribution and PlaceNamingClaim describe() output is untouched, registration order proves the registry was extended rather than reordered or replaced, and none of the three display kindPlugins carry a store() — an ordinary, pre-existing cataloged publication renders exactly as it did before this milestone.');

    // ===============================================================
    // Section F — No decentralized-origin UI branch anywhere in the path:
    // the view is built entirely from the resolved Publication, never
    // from a flag naming how it was acquired.
    // ===============================================================
    {
        const viewSource = await readSource('application/PublicationResolutionView.js');
        const decentralizedViewSource = await readSource('ui/views/DecentralizedPublicationsView.js');
        const registrySource = await readSource('application/CreatePublicationDisplayKindRegistryUseCase.js');
        const combined = viewSource + decentralizedViewSource + registrySource;

        assert(!/source\s*===\s*['"]decentralized['"]/.test(combined) && !/origin\s*===\s*['"]decentralized['"]/.test(combined),
            '1. no file in the display path branches on a "decentralized" source/origin flag');
        assert(!/isDecentralized|fromPeer|acquisitionOrigin/.test(combined),
            '2. no file in the display path carries a decentralized-origin flag of any name at all');

        // resolvePublicationView()'s own returned shape never carries such
        // a field either — reconfirmed at runtime against a real result,
        // not merely assumed from source.
        const knownKeys = Object.keys(flagshipView).sort();
        assert(!knownKeys.some((k) => /source|origin/i.test(k)),
            `3. the resolved view's own fields (${knownKeys.join(', ')}) include nothing naming an acquisition source/origin — the UI has no such flag to branch on even if it wanted to`);
    }
    console.log('✓ Section F: no file in the display path — application/PublicationResolutionView.js, ui/views/DecentralizedPublicationsView.js, or application/CreatePublicationDisplayKindRegistryUseCase.js — branches on how a publication was acquired, and the resolved view itself carries no such flag. The UI consumes the resolved Publication, never the path it took to get there.');

    // ===============================================================
    // Section G — No Repository coupling, reconfirmed now that the
    // registry actually references forkbuild.publication.
    // ===============================================================
    {
        const repositoryFacingFiles = [
            'application/SearchPublicationsUseCase.js',
            'ui/components/PublicationCatalog.js',
            'ui/components/PublicationCard.js',
            'discovery/DiscoveryProvider.js',
            'discovery/LocalDiscoveryProvider.js',
            'application/CreatePublicationCatalogUseCase.js'
        ];
        for (const file of repositoryFacingFiles) {
            const src = await readSource(file);
            assert(!/CreatePublicationDisplayKindRegistryUseCase|PublicationContentKind|PUBLICATION_CONTENT_KIND|forkbuild\.publication/.test(src),
                `1. ${file} still makes no reference to the display-kind registry or forkbuild.publication — the registry is the Publications Center's own, never Repository's.`);
        }

        // The reverse: the registry itself imports nothing Repository-shaped.
        // Matched against the REPOSITORY-FACING files' own literal paths
        // (never a bare "PublicationCatalog.js" substring, which would
        // also — falsely — match application/LocalPublicationCatalog.js,
        // an existing, legitimate, non-Repository reference this file
        // already carries).
        const registrySource = await readSource('application/CreatePublicationDisplayKindRegistryUseCase.js');
        assert(!/SearchPublicationsUseCase|DiscoveryProvider|ui\/components\/PublicationCatalog\.js|ui\/components\/PublicationCard\.js|CreatePublicationCatalogUseCase/.test(registrySource),
            '2. application/CreatePublicationDisplayKindRegistryUseCase.js imports nothing Repository-shaped, even after gaining its third entry.');

        // The transport layer stays exactly as agnostic as 0.9.332 proved:
        // adding a DISPLAY entry required no change to any transport file.
        const peerExchangeSource = await readSource('application/PublicationPeerExchange.js');
        const exchangeSource = await readSource('application/PublicationExchange.js');
        const catalogSource = await readSource('application/LocalPublicationCatalog.js');
        assert(!/CreatePublicationDisplayKindRegistryUseCase/.test(peerExchangeSource + exchangeSource + catalogSource),
            '3. none of the transport classes reference the display-kind registry — display integration required zero transport changes, exactly as scoped.');

        // Only the registry file, tests, and this file's own describe()
        // reference the new PublicationContentKind symbols outside
        // application/PublicationContentKind.js/PublicationContentValidator.js.
        const nonTestHits = grepFiles('PublicationContentKind|PUBLICATION_CONTENT_KIND', ['application', 'ui', 'discovery'])
            .filter((f) => !f.startsWith('application/PublicationContentKind.js') && !f.startsWith('application/PublicationContentValidator.js') && !f.startsWith('application/CreatePublicationDisplayKindRegistryUseCase.js'));
        assert(nonTestHits.length === 0, `4. no file under application/, ui/, or discovery/ other than PublicationContentKind.js/PublicationContentValidator.js/CreatePublicationDisplayKindRegistryUseCase.js references forkbuild.publication (found: ${nonTestHits.join(', ') || 'none'}).`);
    }
    console.log('✓ Section G: zero Repository coupling, reconfirmed with the registry now actually wired — Repository\'s own search/catalog/discovery files still never mention the display-kind registry or forkbuild.publication, the registry itself imports nothing Repository-shaped, and none of the transport classes needed to change at all to make display integration work.');

    // ===============================================================
    // Section H — Final verdict.
    // ===============================================================
    console.log('\n✓ Section H: FINAL DECISION.\n' +
'\n' +
'OUTCOME: DISPLAY_KIND_INTEGRATION_CONFIRMED.\n' +
'\n' +
'A decentralized-origin Publication now travels the full seam this milestone series has been building since 0.9.330:\n' +
'transport (0.9.331/0.9.332, unmodified) -> PublicationResolver -> forkbuild.publication -> a real Publication instance\n' +
'-> the Publications Center\'s own existing display-kind registry -> the SAME generic presentation every other content\n' +
'kind already renders through. Section A ran the real flagship scenario end to end, through to a real display view.\n' +
'Section B proved presentation convergence: a locally-resolved Publication and a decentralized-origin one render\n' +
'byte-identically. Section C confirmed every identity field named in this milestone\'s own brief survives to the view,\n' +
'with no second identity introduced. Section D proved isolation across all three registered kinds plus an\n' +
'unregistered fourth, which still falls through to the existing unsupported-kind case rather than any fallback.\n' +
'Section E reconfirmed the two pre-existing kinds are untouched, and the registry was extended, never reordered.\n' +
'Section F found no decentralized-origin UI branch anywhere in the path. Section G reconfirmed zero Repository\n' +
'coupling, in both directions, with the registry now actually wired.\n' +
'\n' +
'WHAT THIS MEANS. The only production change this milestone makes is the one line of wiring 0.9.332\'s own Section H\n' +
'named as the sole remaining gap: application/CreatePublicationDisplayKindRegistryUseCase.js now also composes\n' +
'application/PublicationContentKind.js (0.9.331) with a describe(), exactly the way the other two kinds already are.\n' +
'No new renderer, no new registration mechanism, no Repository change, no Search change, no federated discovery —\n' +
'all deliberately out of scope, per this milestone\'s own exclusion list. What comes after remains what 0.9.332\'s own\n' +
'"What comes after" already named: a focused audit of what existing decentralized discovery capability could\n' +
'actually produce forkbuild.publication candidates suitable for a future Repository search seam — a substantially\n' +
'different, and deliberately not yet started, question.\n');

    console.log('\n✅ All Publication Display-Kind Integration tests passed.');
}

run().then(() => {
    console.log('\n✓ All PublicationDisplayKindIntegration tests passed');
}).catch((error) => {
    console.error('\n✗ PublicationDisplayKindIntegration tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
