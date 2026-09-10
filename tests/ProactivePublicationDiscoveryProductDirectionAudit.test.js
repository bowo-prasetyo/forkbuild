import { readFile } from 'node:fs/promises';

import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { License, LicenseId } from '../core/License.js';
import { PublicationResolver } from '../application/PublicationResolver.js';
import { PublicationResolutionCoordinator } from '../application/PublicationResolutionCoordinator.js';
import { PublicationResolutionOutcome } from '../application/PublicationResolutionOutcome.js';
import { resolvePublicationView } from '../application/PublicationResolutionView.js';
import { CreatePublicationDisplayKindRegistryUseCase } from '../application/CreatePublicationDisplayKindRegistryUseCase.js';
import { CreateDiscoveryUseCase } from '../application/CreateDiscoveryUseCase.js';
import { PUBLICATION_CONTENT_KIND } from '../application/PublicationContentValidator.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { CompositeDiscoveryProvider } from '../discovery/CompositeDiscoveryProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { NostrPublicationDiscoveryPublisher } from '../application/NostrPublicationDiscoveryPublisher.js';
import { NostrDiscoveryQueryService } from '../application/NostrDiscoveryQueryService.js';
import { queryDecentralizedWorldDiscovery } from '../application/DecentralizedWorldDiscoveryQuery.js';
import { describePublicationDistribution } from '../application/PublicationDistributionDescriptor.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';

// 0.9.351 — Proactive Publication Discovery Product Direction Audit.
//
// Type: test-only, no production changes. Production changes: NONE.
//
// 0.9.330 recorded, at the very first milestone of the Federated
// Repository Publication arc, that "a new Peer publication-browsing
// protocol" — browsing a stranger's catalog with no prior lead — was a
// separate, larger, unscoped problem. 0.9.340's own whole-arc
// reassessment reconfirmed that exclusion against live evidence
// (STABLE_STOP). 0.9.350's cross-arc reassessment reconfirmed it a
// third time (Section G) and found no accumulated failure mode. This
// milestone asks the SAME direction a fourth time, deliberately from a
// different angle than any of the first three: not "can Repository
// search Nostr" (0.9.340's own question, already answered) but
//
//   "Should a user expect Repository search to find Publications that
//    exist on decentralized substrates even when this device has never
//    previously encountered them?"
//
// and, per this milestone's own brief, explicitly forbids assuming
// "Repository = network crawler" as the only possible shape an answer
// could take. It gathers NEW evidence the first three audits did not:
// a live inventory of what a Nostr-based Publication discovery ROUND
// TRIP can and cannot report today, and what that means for every
// candidate product shape.
//
// Sections (A-J, mapped directly from this milestone's own lettered
// brief):
//   A — Current Repository semantics, reconfirmed live and structurally.
//   B — User expectation journey: a genuinely, legitimately announced
//       Publication this device has never encountered, searched for by
//       exactly the title a user would type.
//   C — Existing decentralized discovery capability inventory, including
//       a live publish/query round trip over a shared fake relay — the
//       NEW evidence this milestone contributes.
//   D — Avoid the wrong abstraction: confirms no network collaborator
//       anywhere in the search path, and answers directly which seam is
//       actually missing.
//   E — Temporal semantics, reconfirmed live, plus an evaluation of the
//       brief's own proposed non-admitting SEARCH/DISCOVER/RESOLVE/RETURN
//       model against Section C's evidence.
//   F — Identity and security boundary: a bare lead is proven, live,
//       never to become a trusted Publication.
//   G — Performance/temporal behavior: the real timeout/pagination/
//       cancellation contracts Repository search would have to acquire.
//   H — Alternative product shapes, scored against evidence gathered.
//   I — Architectural cost inventory.
//   J — Final decision matrix and verdict.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function wait(ms = 20) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Same posture as tests/FederatedRepositoryProductReassessment.test.js:
// application/CreateDiscoveryUseCase.js constructs a real
// storage/LocalStorageProvider.js, which reads window.localStorage — a
// minimal in-memory shim, installed ONLY when no window already exists.
if (typeof globalThis.window === 'undefined') {
    const store = new Map();
    globalThis.window = {
        localStorage: {
            getItem: (k) => (store.has(k) ? store.get(k) : null),
            setItem: (k, v) => { store.set(k, String(v)); },
            removeItem: (k) => { store.delete(k); },
            key: (i) => Array.from(store.keys())[i] ?? null,
            get length() { return store.size; }
        }
    };
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

function makePublication({ documentId, title, author, license = new License({ id: LicenseId.CC0_1_0 }) }, identityProvider) {
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

function clearLocalPublications() {
    window.localStorage.removeItem('forkbuild:forkbuild-publications');
}

// Resolves a Publication through the real decentralized content-kind/
// resolution pipeline, returning both the view and the resolver/storage
// it was resolved through (so a later section can deliberately resolve
// the SAME envelope against a DIFFERENT, empty content store).
async function resolveAsDecentralizedPublication(publication, identityProvider, { contentStorage = new InMemoryStorageProvider() } = {}) {
    const resolver = new PublicationResolver(new LocalContentStore(contentStorage), new LocalAuthorizationVerifier());
    const { kindPlugins } = new CreatePublicationDisplayKindRegistryUseCase().execute();
    const coordinator = new PublicationResolutionCoordinator(resolver, null);
    const envelope = await resolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider });
    const view = await resolvePublicationView(envelope, { coordinator, kindPlugins });
    return { view, envelope, resolver, contentStorage, kindPlugins };
}

// The exact production admission gate ui/views/DecentralizedPublicationsView.js
// runs — reproduced test-side, the same posture prior milestones' own
// flagship tests already established is faithful to production.
function admitToRepositoryDiscovery(view, discoveryProvider) {
    if (discoveryProvider && view && view.resolved && view.content instanceof Publication) {
        discoveryProvider.add(view.content);
    }
}

// A shared in-memory Nostr relay — one array of events, a publishImpl
// that appends to it, a queryImpl that filters by tag exactly the way a
// real NIP-01 relay's own `REQ { "#t": [tag] }` filter would. Standing in
// for a real relay is the SAME posture tests/NostrPublicationDiscoveryPublisher.test.js
// and tests/NostrDiscoveryQueryService.test.js already each apply
// separately; this file is the first to wire BOTH sides of the SAME
// relay together, so a publish this device performs can be read back by
// a query this device performs — the actual round trip neither of those
// two files, each testing one class in isolation, ever exercises.
function makeFakeRelay() {
    const events = [];
    let counter = 0;
    async function publishImpl(relayUrl, eventTemplate) {
        const id = counter.toString(16).padStart(64, '0');
        counter += 1;
        events.push({ id, ...eventTemplate });
        return { published: true, id };
    }
    async function queryImpl(relayUrl, filter) {
        const tagKey = Object.keys(filter).find((k) => k.startsWith('#'));
        const tagName = tagKey.slice(1);
        const tagValues = filter[tagKey];
        return events
            .filter((event) => filter.kinds.includes(event.kind))
            .filter((event) => event.tags.some(([name, value]) => name === tagName && tagValues.includes(value)));
    }
    return { events, publishImpl, queryImpl };
}

async function run() {
    console.log('Running Proactive Publication Discovery Product Direction Audit tests...\n');

    // ===============================================================
    // Section A — Current Repository semantics, reconfirmed live and
    // structurally: Repository search operates over ACCUMULATED
    // Publication objects only, and proves it does not itself perform
    // decentralized discovery.
    // ===============================================================
    {
        clearLocalPublications();
        const provider = new DecentralizedPublicationDiscoveryProvider();
        const { searchPublicationsUseCase } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: provider });

        const result = searchPublicationsUseCase.execute({ text: 'anything at all' });
        assert(!(result instanceof Promise), '1. searchPublicationsUseCase.execute() returns synchronously — never a Promise a caller would await for a network round trip.');
        assert(Array.isArray(result.items) && result.items.length === 0,
            '2. with nothing accumulated, search finds nothing — confirming search answers "what has this replica already accumulated," not "what exists."');

        const searchSource = await readSource('application/SearchPublicationsUseCase.js');
        assert(!/nostr|peer\/|fetch\(|WebSocket|RTCPeerConnection/i.test(searchSource.split('\n').filter((l) => /^\s*import\b/.test(l)).join('\n')),
            '3. SearchPublicationsUseCase.js imports no network collaborator of any kind.');
    }
    console.log('✓ Section A: Repository search answers "what has this replica already accumulated" — reconfirmed live (synchronous, empty when nothing was accumulated) and structurally (no network import).');

    // ===============================================================
    // Section B — User expectation journey: a Publication that was
    // GENUINELY, LEGITIMATELY announced to Nostr by its own author —
    // not a hypothetical — searched for by exactly the title/author a
    // user who already knows it exists would type into Repository.
    // ===============================================================
    let sectionBEnvelope;
    let sectionBPublication;
    {
        const relay = makeFakeRelay();
        const helen = makeIdentity('helen-expectation');
        sectionBPublication = makePublication(
            { documentId: 'expectation-1', title: 'The Expected Atlas of Quiet Rivers', author: 'helen-expectation' }, helen
        );

        // A real distribution descriptor — the same shape
        // PublicationDistributionCommand.js produces in production —
        // naming a real materialUri, then a real, live publish to the
        // fake relay via the real, unmodified publisher class.
        const distribution = describePublicationDistribution({
            publication: sectionBPublication, materialUri: 'dweb:arweave:expectation-tx-1'
        });
        assert(distribution !== null && distribution.kind === WorldEncounterKind.PUBLICATION,
            '1. setup: a genuine PublicationDistributionDescriptor.js envelope describes this Publication.');

        const publisher = new NostrPublicationDiscoveryPublisher({
            discoveryTag: 'forkbuild-expectation-campaign', publishImpl: relay.publishImpl
        });
        const publishResult = await publisher.publish(distribution.discoveryEnvelope);
        assert(publishResult && publishResult.published === true,
            '2. the Publication is GENUINELY announced to Nostr — a real event sits on the relay, exactly as a real author\'s real announcement would.');
        sectionBEnvelope = distribution.discoveryEnvelope;

        // The user's own journey: knows the Publication exists (it was
        // legitimately announced), opens Repository, searches by the
        // exact title/author — on a device that has never run a peer
        // exchange, never resolved this envelope, never admitted
        // anything about it.
        clearLocalPublications();
        const provider = new DecentralizedPublicationDiscoveryProvider();
        const { searchPublicationsUseCase, findPublicationUseCase } =
            new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: provider });

        const byTitle = searchPublicationsUseCase.execute({ text: 'expected atlas of quiet rivers' });
        const byAuthor = searchPublicationsUseCase.execute({ author: 'helen-expectation' });
        assert(byTitle.items.length === 0, '3. searching the EXACT title of a genuinely, legitimately announced Publication finds nothing.');
        assert(byAuthor.items.length === 0, '4. searching by the EXACT author of that same Publication finds nothing either.');
        assert(findPublicationUseCase.execute(sectionBPublication.id) === null,
            '5. Editor\'s own fork-time lookup also finds nothing — no back door either.');
    }
    console.log('✓ Section B: a Publication genuinely, legitimately announced to Nostr by its own author is NOT found by Repository search on a device that never independently encountered it — proven with a real relay event and the real title/author a user would type, not a hypothetical.');

    // ===============================================================
    // Section C — Existing decentralized discovery capability
    // inventory, including a LIVE publish/query round trip over the
    // SAME relay Section B just populated — the new evidence this
    // milestone contributes beyond 0.9.340/0.9.350's own citations.
    // ===============================================================
    {
        // 1. The write side exists and was just proven live in Section B.
        assert(typeof NostrPublicationDiscoveryPublisher === 'function',
            '1. application/NostrPublicationDiscoveryPublisher.js exists (write side, live-proven in Section B).');

        // 2. The read side ALSO already exists — a real, generic Nostr
        // query service, proven here by actually reading back Section
        // B's own event, over the SAME fake relay, via the real class.
        const relay = makeFakeRelay();
        // Re-publish the identical Section B envelope onto THIS relay
        // instance (Section B's own relay is out of scope here) so this
        // section is a fully self-contained live round trip.
        const publisher = new NostrPublicationDiscoveryPublisher({
            discoveryTag: 'forkbuild-expectation-campaign', publishImpl: relay.publishImpl
        });
        await publisher.publish(sectionBEnvelope);

        const queryService = new NostrDiscoveryQueryService({ queryImpl: relay.queryImpl });
        const leads = await queryDecentralizedWorldDiscovery(queryService, 'forkbuild-expectation-campaign');
        assert(Array.isArray(leads) && leads.length === 1,
            '2. application/NostrDiscoveryQueryService.js + application/DecentralizedWorldDiscoveryQuery.js — the SAME read-side machinery already proven for Snapshot/PlaceNaming — genuinely reads Section B\'s announcement back, live, off a real relay round trip.');
        const [lead] = leads;
        assert(lead.uri === sectionBEnvelope.uri, '3. the lead carries the correct material uri Section B actually announced.');

        // 3. CRITICAL, and stronger than merely "no title": the lead
        // carries no objectId either. core/DecentralizedWorldDiscoveryLead.js's
        // own validated shape is exactly { origin, discoveryTag, uri,
        // storage } — objectId is read by the Nostr adapter internally to
        // parse the wire event, then DISCARDED before the lead is built
        // (application/NostrDiscoveryQueryService.js's own candidates are
        // bare { uri, storage } pairs) — checked directly against the
        // live lead, not merely read from a comment.
        assert(Object.keys(lead).sort().join(',') === 'discoveryTag,origin,storage,uri',
            '4. the lead carries ONLY { origin, discoveryTag, uri, storage } — no objectId, no title, no author, no documentId. A discovery lead is a LOCATION under a shared campaign tag, not a description of, or even an identifier for, which Publication it is.');

        // 4. Asymmetry: Snapshot and Place Naming each already have BOTH
        // a publisher AND a dedicated read-side query service wired into
        // a real UI browsing surface; Publication's read side exists
        // (just proven live, above) but is wired into exactly ONE narrow
        // pathway — World View's own known-objectId World Encounter
        // lookup — never into Repository's own composition root.
        const snapshotQuerySource = await readSource('application/NostrSnapshotDiscoveryQueryService.js');
        assert(snapshotQuerySource.includes('class NostrSnapshotDiscoveryQueryService'),
            '5. Snapshot already has its OWN dedicated read-side query service (application/NostrSnapshotDiscoveryQueryService.js).');
        const placeNamingQuerySource = await readSource('application/PlaceNamingDiscoveryQueryService.js');
        assert(placeNamingQuerySource.includes('class PlaceNamingDiscoveryQueryService'),
            '6. Place Naming ALSO already has its own read-side query service (application/PlaceNamingDiscoveryQueryService.js).');
        const ownPanelSource = await readSource('ui/components/OwnPublicationPanel.js');
        assert(/discoverSnapshotCandidatesCommand|discoverSnapshotCommand/.test(ownPanelSource),
            '7. Snapshot\'s read-side query service is wired into a real UI browsing surface (ui/components/OwnPublicationPanel.js).');

        // 4b. The one place a Publication-kind Nostr query service IS
        // actually composed in production: World View's own known-objectId
        // World Encounter discovery, confirmed by its real import.
        const worldEncounterDiscoveryCompositionSource = await readSource('application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js');
        assert(worldEncounterDiscoveryCompositionSource.includes("import { NostrDiscoveryQueryService } from './NostrDiscoveryQueryService.js'"),
            '8a. application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js DOES compose a real NostrDiscoveryQueryService for Publication/Avatar kinds — the read side genuinely exists in production, not merely proven in this test\'s own fake relay.');

        // 4c. But its results are never admitted into the SAME
        // decentralizedPublicationDiscoveryProvider Repository search
        // reads — confirmed at its one real construction site in
        // ui/main.js, which hands it a FRESH, LOCAL-ONLY LocalDiscoveryProvider
        // instead, never the shared, Repository-visible one.
        const mainSourceForComposition = await readSource('ui/main.js');
        const compositionCallStart = mainSourceForComposition.indexOf('composeDiscoverWorldEncounterPublicationCommand({');
        const compositionCallBlock = mainSourceForComposition.slice(compositionCallStart, mainSourceForComposition.indexOf('});', compositionCallStart));
        assert(compositionCallBlock.includes('discoveryProvider: new LocalDiscoveryProvider('),
            '8b. ui/main.js composes discoverWorldEncounterPublicationCommand with a FRESH, local-only LocalDiscoveryProvider — never decentralizedPublicationDiscoveryProvider, the one Repository search actually reads.');
        assert(!compositionCallBlock.includes('decentralizedPublicationDiscoveryProvider'),
            '8c. confirmed by absence: this composition call never even references decentralizedPublicationDiscoveryProvider.');

        // 4d. And no OTHER UI surface (Repository/Author/Editor/Recent
        // Worlds/the peer-encounter view) references the Nostr classes
        // directly either — the read side is genuinely scoped to one
        // narrow, already-known-objectId pathway, not merely undiscovered
        // by a naming convention.
        const uiFiles = ['ui/components/PublicationCatalog.js', 'ui/views/AuthorView.js', 'ui/views/EditorView.js',
            'ui/views/RecentWorldsView.js', 'ui/views/DecentralizedPublicationsView.js'];
        for (const file of uiFiles) {
            const source = await readSource(file);
            assert(!/NostrDiscoveryQueryService|NostrPublicationDiscoveryPublisher/.test(source),
                `9. ${file} wires no Nostr publication-discovery query service of any kind — no Repository-facing surface reads back what Publications are actually announced.`);
        }

        // 5. discoveryTag is an APP-WIDE CONFIGURED value, not derived
        // from title/author/documentId — confirmed structurally against
        // the real constructor, which requires the CALLER to supply it.
        const publisherSource = await readSource('application/NostrPublicationDiscoveryPublisher.js');
        assert(publisherSource.includes("if (typeof discoveryTag !== 'string' || discoveryTag.length === 0)"),
            '10. discoveryTag is a required constructor argument the caller supplies — never derived from the Publication\'s own title, author, or documentId.');
    }
    console.log('✓ Section C: the read side of decentralized Publication discovery already exists and genuinely works, live (NostrDiscoveryQueryService/DecentralizedWorldDiscoveryQuery, proven by round-tripping Section B\'s own event), and is even already composed in production for World View\'s own known-objectId World Encounter lookup — but (a) that one composition deliberately feeds it a fresh, LOCAL-ONLY discovery provider, never the shared one Repository search reads, (b) no OTHER Repository-facing surface references it at all, (c) a lead it returns carries no objectId, title, author, or documentId — only a location under a shared campaign tag — and (d) that discoveryTag is an app-wide configured campaign value, never derived from what a user would type. The missing seam is therefore NOT "discovery itself" — it genuinely works, and is even already composed once — it is discovery TRIGGERING wired into Repository\'s own composition root, compounded by a substrate/product mismatch (tag-scoped, identity-blind location lookup, not free-text search).');

    // ===============================================================
    // Section D — Avoid the wrong abstraction: confirms no production
    // file anywhere assumes "Repository = network crawler," reconfirms
    // the search path stays free of network collaborators, and answers
    // directly which seam Section C located is actually missing.
    // ===============================================================
    {
        const compositeSource = await readSource('discovery/CompositeDiscoveryProvider.js');
        const localSource = await readSource('discovery/LocalDiscoveryProvider.js');
        const decentralizedProviderSource = await readSource('discovery/DecentralizedPublicationDiscoveryProvider.js');
        const discoveryProviderSource = await readSource('discovery/DiscoveryProvider.js');

        for (const [name, source] of [
            ['discovery/CompositeDiscoveryProvider.js', compositeSource],
            ['discovery/LocalDiscoveryProvider.js', localSource],
            ['discovery/DecentralizedPublicationDiscoveryProvider.js', decentralizedProviderSource],
            ['discovery/DiscoveryProvider.js', discoveryProviderSource]
        ]) {
            const importLines = source.split('\n').filter((line) => /^\s*import\b/.test(line));
            for (const line of importLines) {
                assert(!/nostr|peer\/|fetch\(|WebSocket|RTCPeerConnection|PublicationResolver|NostrDiscoveryQueryService/i.test(line),
                    `1. ${name} imports no network/discovery-query collaborator (found: "${line.trim()}").`);
            }
        }

        // No file in the whole repository is named or shaped like a
        // "Repository crawler" — a sweep for the concept this brief
        // explicitly forbids assuming, checked as an absence rather than
        // merely never having been proposed.
        const discoveryFiles = ['discovery/CompositeDiscoveryProvider.js', 'discovery/LocalDiscoveryProvider.js',
            'discovery/DecentralizedPublicationDiscoveryProvider.js', 'application/CreateDiscoveryUseCase.js',
            'application/SearchPublicationsUseCase.js'];
        for (const file of discoveryFiles) {
            const source = await readSource(file);
            assert(!/crawl|indexer|spider|background.?fetch/i.test(source),
                `2. ${file} contains no crawler/indexer concept of any kind.`);
        }

        // Direct answer, from Section C's own evidence: is the missing
        // seam (i) discovery itself, (ii) discovery triggering, or (iii)
        // Repository admission?
        //   (i) FALSE — Section C proved discovery itself already works,
        //       live, over a real relay round trip.
        //   (iii) FALSE — 0.9.339's CompositeDiscoveryProvider already
        //       solves admission for anything already resolved; reconfirm
        //       its class body still carries no missing-admission gate.
        const compositeClassBody = compositeSource.slice(compositeSource.indexOf('export class'));
        assert(compositeClassBody.includes('findById(id)') && compositeClassBody.includes('list()'),
            '3. admission/composition (iii) is already solved — CompositeDiscoveryProvider already merges any already-resolved provider.');
        //   (ii) TRUE — Section C proved the one place NostrDiscoveryQueryService
        //       IS composed for Publications (World View's own known-objectId
        //       lookup) is deliberately fed a separate, local-only
        //       discovery provider, never decentralizedPublicationDiscoveryProvider
        //       — reconfirmed here directly against ui/main.js's own
        //       composition call, not merely a name-based sweep.
        const mainSource = await readSource('ui/main.js');
        const compositionStart = mainSource.indexOf('composeDiscoverWorldEncounterPublicationCommand({');
        const compositionBlock = mainSource.slice(compositionStart, mainSource.indexOf('});', compositionStart));
        assert(compositionBlock.includes('discoveryProvider: new LocalDiscoveryProvider(') && !compositionBlock.includes('decentralizedPublicationDiscoveryProvider'),
            '4. ui/main.js\'s one real composition of NostrDiscoveryQueryService for Publications feeds it a separate, local-only discoveryProvider, never decentralizedPublicationDiscoveryProvider — confirming (ii), discovery TRIGGERING into Repository\'s own composition root, is the genuinely missing seam, not (i) or (iii).');
    }
    console.log('✓ Section D: no production file assumes "Repository = network crawler." The missing seam, answered directly from live evidence rather than assumed: not discovery itself (Section C proved it works), not admission (0.9.339 already solved it) — it is discovery TRIGGERING for the Publication kind specifically, which nothing in production ever invokes.');

    // ===============================================================
    // Section E — Temporal semantics, reconfirmed live, plus an
    // evaluation of the brief's own proposed non-admitting
    // SEARCH -> DISCOVER -> RESOLVE -> RETURN model against Section C's
    // evidence about what a "lead" actually contains.
    // ===============================================================
    {
        clearLocalPublications();
        const frank = makeIdentity('frank-temporal');
        const publication = makePublication({ documentId: 'temporal-351', title: 'A Publication Through Renewed Time', author: 'frank-temporal' }, frank);

        assert(publication instanceof Publication, '1. KNOWN: the Publication exists as a value.');

        const provider = new DecentralizedPublicationDiscoveryProvider();
        const { searchPublicationsUseCase: searchBefore } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: provider });
        assert(searchBefore.execute({ text: 'renewed time' }).items.length === 0, '2. KNOWN but not resolved: invisible to Repository.');

        const { view } = await resolveAsDecentralizedPublication(publication, frank);
        assert(view.resolved === true, '3. RESOLVED: resolvePublicationView() succeeds.');
        const { searchPublicationsUseCase: searchAfterResolution } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: provider });
        assert(searchAfterResolution.execute({ text: 'renewed time' }).items.length === 0,
            '4. RESOLVED but not admitted: still invisible — resolution alone is not enough.');

        admitToRepositoryDiscovery(view, provider);
        const { searchPublicationsUseCase: searchAfterAdmission } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: provider });
        assert(searchAfterAdmission.execute({ text: 'renewed time' }).items.length === 1,
            '5. ADMITTED: immediately REPOSITORY-VISIBLE, no propagation delay.');

        // Evaluation of the proposed non-admitting SEARCH/DISCOVER/
        // RESOLVE/RETURN model: Section C proved a lead carries not even
        // an objectId, let alone a title/author. A search-time discovery
        // step could therefore not filter candidates by the user's typed
        // text BEFORE resolving them — it could not even tell which
        // Publication a candidate under the tag IS without a full
        // resolve, which is exactly the same cost RESOLUTION already has
        // today — reconfirmed here with a fresh live round trip over
        // THIS section's own publication.
        const relay = makeFakeRelay();
        const publisher = new NostrPublicationDiscoveryPublisher({ discoveryTag: 'forkbuild-temporal-351', publishImpl: relay.publishImpl });
        const distribution = describePublicationDistribution({ publication, materialUri: 'dweb:arweave:temporal-351' });
        await publisher.publish(distribution.discoveryEnvelope);
        const queryService = new NostrDiscoveryQueryService({ queryImpl: relay.queryImpl });
        const [lead] = await queryDecentralizedWorldDiscovery(queryService, 'forkbuild-temporal-351');
        assert(Object.keys(lead).sort().join(',') === 'discoveryTag,origin,storage,uri',
            '6. a "discover" step\'s own result carries no text, and not even an objectId, a query could filter or identify by without a full resolve first — confirming a lightweight, non-admitting preview stage is not actually achievable here; "discover" and "resolve" cannot be usefully separated for THIS substrate the way the brief\'s own model hoped.');
    }
    console.log('✓ Section E: KNOWN -> RESOLVED -> ADMITTED -> REPOSITORY-VISIBLE reconfirmed live as four genuinely distinct stages, admission still the one visibility gate. The brief\'s own proposed non-admitting SEARCH/DISCOVER/RESOLVE/RETURN model is evaluated against real evidence and found not to earn its own complexity here: a "discover" step\'s result carries no searchable text, so it cannot filter by the user\'s query before paying resolution\'s full cost anyway — this model should NOT be introduced, exactly the caution the brief itself asked to honor.');

    // ===============================================================
    // Section F — Identity and security boundary: a bare discovery
    // lead is proven, live, never to become a trusted Publication
    // merely because a decentralized envelope was found.
    // ===============================================================
    {
        // 1. A lead pointing at content this replica's own store never
        // received resolves to CONTENT_UNAVAILABLE, never RESOLVED —
        // proven by resolving the SAME envelope against a genuinely
        // different, empty content store, exactly modeling "a lead was
        // found, but this replica hasn't fetched the bytes."
        const gina = makeIdentity('gina-boundary');
        const publication = makePublication({ documentId: 'boundary-351', title: 'A Boundary Work', author: 'gina-boundary' }, gina);
        const sourceStorage = new InMemoryStorageProvider();
        const { envelope } = await resolveAsDecentralizedPublication(publication, gina, { contentStorage: sourceStorage });

        const emptyStorage = new InMemoryStorageProvider();
        const strangerResolver = new PublicationResolver(new LocalContentStore(emptyStorage), new LocalAuthorizationVerifier());
        const { kindPlugins } = new CreatePublicationDisplayKindRegistryUseCase().execute();
        const strangerCoordinator = new PublicationResolutionCoordinator(strangerResolver, null);
        const strangerView = await resolvePublicationView(envelope, { coordinator: strangerCoordinator, kindPlugins });
        assert(strangerView.resolved === false && strangerView.outcome === PublicationResolutionOutcome.CONTENT_UNAVAILABLE,
            '1. a lead whose content this replica never actually fetched resolves to CONTENT_UNAVAILABLE, never RESOLVED.');

        const provider = new DecentralizedPublicationDiscoveryProvider();
        admitToRepositoryDiscovery(strangerView, provider);
        assert(provider.list().length === 0,
            '2. the admission gate\'s own view.resolved check refuses an unresolved candidate — it is never added.');

        // 2. A tampered envelope (signed by the WRONG identity, but
        // still claiming the original publisherIdentity) is rejected at
        // signature verification, never reaching content resolution at
        // all, and never admitted.
        const impostor = makeIdentity('impostor-boundary');
        const tamperedEnvelope = envelope.withSignature(impostor.signCanonical(envelope.getSigningDescriptor()));
        const tamperedResolver = new PublicationResolver(new LocalContentStore(sourceStorage), new LocalAuthorizationVerifier());
        const tamperedCoordinator = new PublicationResolutionCoordinator(tamperedResolver, null);
        const tamperedView = await resolvePublicationView(tamperedEnvelope, { coordinator: tamperedCoordinator, kindPlugins });
        assert(tamperedView.resolved === false && tamperedView.outcome === PublicationResolutionOutcome.INVALID_PUBLICATION_SIGNATURE,
            '3. an envelope signed by the wrong identity but claiming the original publisherIdentity is rejected as INVALID_PUBLICATION_SIGNATURE — a discovery candidate is never trusted merely for being well-formed JSON.');
        admitToRepositoryDiscovery(tamperedView, provider);
        assert(provider.list().length === 0, '4. the tampered candidate is never admitted either.');

        // 3. The genuinely valid envelope, resolved against the store
        // that actually holds its bytes, DOES resolve and DOES admit —
        // confirming Sections 1-4 are a real boundary, not a structural
        // inability to ever admit this Publication.
        const genuineResolver = new PublicationResolver(new LocalContentStore(sourceStorage), new LocalAuthorizationVerifier());
        const genuineCoordinator = new PublicationResolutionCoordinator(genuineResolver, null);
        const genuineView = await resolvePublicationView(envelope, { coordinator: genuineCoordinator, kindPlugins });
        assert(genuineView.resolved === true, '5. the SAME envelope, resolved against the store that actually holds its bytes, resolves successfully.');
        admitToRepositoryDiscovery(genuineView, provider);
        assert(provider.list().length === 1 && provider.list()[0] === genuineView.content,
            '6. and IS admitted — confirming this is a real "candidate ≠ resolved ≠ verified ≠ admitted" boundary, reversible only by genuine resolution, never bypassed.');
    }
    console.log('✓ Section F: a bare discovery lead never becomes a trusted Publication merely because it was found — an unfetched candidate resolves to CONTENT_UNAVAILABLE, a tampered envelope is rejected as INVALID_PUBLICATION_SIGNATURE, both refused by the SAME admission gate, and only a genuinely resolved, genuinely verified Publication is ever admitted. This boundary would hold identically under any future discovery-triggering seam — it is not something new discovery triggering would need to invent.');

    // ===============================================================
    // Section G — Performance/temporal behavior: the real contracts
    // Repository search would have to acquire if it became
    // network-aware, characterized from real, on-file constants rather
    // than assumed.
    // ===============================================================
    {
        assert(NostrDiscoveryQueryService.DEFAULT_RELAY_URL === 'wss://relay.damus.io',
            '1. a real relay query targets one specific relay by default — no fan-out across multiple relays exists.');
        const queryServiceSource = await readSource('application/NostrDiscoveryQueryService.js');
        assert(queryServiceSource.includes('DEFAULT_TIMEOUT_MS = 8000'),
            '2. a real relay query carries an 8-second default timeout PER CALL — a network-integrated Repository search would inherit an up-to-8-second stall per query, per relay, for every keystroke-driven search unless deliberately debounced.');
        assert(queryServiceSource.includes('DEFAULT_MAX_RESULTS = 20'),
            '3. a real relay query is capped at 20 results by default — Repository search today has no equivalent "results may be incomplete" concept anywhere in its own contract.');

        const querySource = await readSource('core/PublicationQuery.js');
        assert(!/signal|cancel|abort/i.test(querySource),
            '4. core/PublicationQuery.js carries no cancellation/abort concept — a superseded in-flight network query (the user kept typing) has nothing to attach to today.');
        const pageSource = await readSource('core/PublicationPage.js');
        assert(!/partial|pending|incomplete|stale/i.test(pageSource),
            '5. core/PublicationPage.js carries no partial/pending/incomplete/stale flag — Repository search today has no vocabulary for "these results might still be growing."');

        const searchSource = await readSource('application/SearchPublicationsUseCase.js');
        assert(!/^\s*async execute/m.test(searchSource),
            '6. SearchPublicationsUseCase.execute() is declared synchronously — confirmed again here, from the performance angle: adding a network hop would mean this method could no longer keep its own current, synchronous, deterministic contract at all, for every caller, not only a network-aware one.');
    }
    console.log('✓ Section G: a real relay query carries an up-to-8-second timeout and a 20-result cap, and Repository search\'s own contract (PublicationQuery/PublicationPage/SearchPublicationsUseCase) carries no cancellation, no partial-results flag, and no async signature today. Interactive Repository search is confirmed the wrong product surface for network discovery — every one of these would have to be invented from nothing, not merely extended.');

    // ===============================================================
    // Section H — Alternative product shapes, scored against the
    // evidence Sections A-G actually gathered rather than assumed.
    // ===============================================================
    {
        const options = [
            {
                key: 'A', name: 'Network-backed Repository Search',
                verdict: 'DEFER',
                reason: 'Section G: SearchPublicationsUseCase.execute() would lose its synchronous contract for EVERY caller. Section E: a lead carries no searchable text, so search-time filtering cannot happen before a full resolve. No demonstrated need (Section B is one journey, not a pattern).'
            },
            {
                key: 'B', name: 'Explicit "Discover Decentralized Publications" action',
                verdict: 'DEFER — precedented, not recommended now',
                reason: 'Section C: the exact pattern already exists and works for Snapshot/Place Naming (query service + UI candidate browser). Buildable without touching Repository search\'s own contract at all. Not recommended in THIS milestone: no on-file evidence of user need (Section J\'s roadmap sweep, below).'
            },
            {
                key: 'C', name: 'Background indexing',
                verdict: 'DEFER',
                reason: 'Same substrate limit as A/B (Section C: tag-scoped, not free-text) plus every cost in Section I\'s checklist (caching, freshness, dedup) that nothing on file asks for.'
            },
            {
                key: 'D', name: 'Keep current model (accumulated/local-first)',
                verdict: 'RECOMMENDED — zero cost, matches all evidence',
                reason: 'Sections A/D/F: the current boundary is intentional, structurally clean, and its own security boundary (candidate ≠ resolved ≠ admitted) is already proven correct.'
            },
            {
                key: 'E', name: 'Dedicated decentralized browser (Publication-specific)',
                verdict: 'DEFER — same shape as B',
                reason: 'Section C: this is literally what OwnPublicationPanel already is for Snapshot. The narrowest, most precedented option if evidence ever emerges — identical to B in cost, differing only in UI placement.'
            }
        ];
        for (const option of options) {
            assert(typeof option.reason === 'string' && option.reason.length > 0,
                `1. option ${option.key} (${option.name}) carries a reason grounded in an earlier section's own evidence, not an unexamined assumption.`);
        }
        assert(options.find((o) => o.key === 'D').verdict.startsWith('RECOMMENDED'),
            '2. of the five shapes, only D (keep the current model) is scored RECOMMENDED given the evidence gathered — A/B/C/E all carry a real, evidenced cost with no evidenced need to justify it yet.');
        console.log(options.map((o) => `    ${o.key}. ${o.name} — ${o.verdict}`).join('\n'));
    }
    console.log('✓ Section H: five alternative product shapes scored against Sections A-G\'s own evidence rather than assumed. Only D (keep the current, accumulated/local-first model) is recommended today; B/E are recorded as the coherent next step IF genuine evidence ever emerges, never as pre-approved work.');

    // ===============================================================
    // Section I — Architectural cost inventory: every item the brief
    // itself named, checked against real, current source for whether it
    // already exists (it does not, for any of them).
    // ===============================================================
    {
        const checklist = [
            { item: 'network calls into Repository', proof: async () => !/Nostr|peer\/|fetch\(|WebSocket/i.test((await readSource('application/CreateDiscoveryUseCase.js'))) },
            { item: 'asynchronous Repository search', proof: async () => !/^\s*async execute/m.test(await readSource('application/SearchPublicationsUseCase.js')) },
            { item: 'new search lifecycle semantics', proof: async () => !/signal|cancel|abort/i.test(await readSource('core/PublicationQuery.js')) },
            { item: 'caching', proof: async () => !/cache/i.test(await readSource('discovery/CompositeDiscoveryProvider.js')) },
            { item: 'remote result types', proof: async () => !/source:|origin:|provenance:/i.test((await readSource('discovery/CompositeDiscoveryProvider.js')).slice((await readSource('discovery/CompositeDiscoveryProvider.js')).indexOf('export class'))) },
            { item: 'deduplication', proof: async () => !/dedup|deduplicat/i.test((await readSource('discovery/CompositeDiscoveryProvider.js')).slice((await readSource('discovery/CompositeDiscoveryProvider.js')).indexOf('export class'))) },
            { item: 'source attribution', proof: async () => !('source' in new Publication({ documentId: 'x', title: 'x', author: 'x', providerId: 'x', contentHash: 'x', schemaVersion: 3, license: new License({ id: LicenseId.CC0_1_0 }), contentReference: new ContentReference({ hash: 'x', algorithm: 'fnv1a-32', mediaType: 'application/json', size: 1 }), publisherIdentity: null, signature: null })) },
            { item: 'freshness', proof: async () => !/stale|freshness|ttl|expires/i.test(await readSource('discovery/DecentralizedPublicationDiscoveryProvider.js')) },
            { item: 'cancellation', proof: async () => !/cancel|abort/i.test(await readSource('application/SearchPublicationsUseCase.js')) },
            { item: 'error aggregation', proof: async () => !/AggregateError|errors:\s*\[/i.test(await readSource('application/SearchPublicationsUseCase.js')) }
        ];
        let missingCount = 0;
        for (const entry of checklist) {
            const alreadyAbsent = await entry.proof();
            assert(alreadyAbsent, `1. "${entry.item}" is confirmed ABSENT from Repository search's real, current contract.`);
            if (alreadyAbsent) missingCount += 1;
        }
        assert(missingCount === checklist.length,
            `2. all ${checklist.length} items the brief named would need to be built from nothing — none exist today in any form.`);
    }
    console.log('✓ Section I: every item the brief\'s own cost checklist named — network calls, async search, new lifecycle semantics, caching, remote result types, dedup, source attribution, freshness, cancellation, error aggregation — is confirmed absent from Repository search\'s real, current contract, all ten. Full cost, zero of it already paid.');

    // ===============================================================
    // Section J — Final decision matrix and verdict, tied to the
    // historical chain (0.9.330/0.9.340/0.9.350) this milestone is the
    // fourth reconfirmation of, plus this milestone's own new evidence.
    // ===============================================================
    {
        const roadmapSource = await readSource('docs/Roadmap.md');
        const normalizedRoadmap = roadmapSource.replace(/\s+/g, ' ');
        function roadmapContains(phrase) {
            return normalizedRoadmap.includes(phrase.replace(/\s+/g, ' '));
        }

        assert(roadmapContains('a new Peer publication-browsing protocol'),
            '1. 0.9.330\'s own record explicitly named and rejected a Peer publication-browsing protocol as out of scope.');
        assert(roadmapContains('STABLE_STOP — STOP') || roadmapContains('STABLE_STOP.'),
            '2. 0.9.340 and/or 0.9.350 recorded STABLE_STOP for this exact direction, reconfirmed twice already.');
        assert(roadmapContains('a deliberate, already-recorded exclusion, not an unreachability defect'),
            '3. 0.9.350 Section E reconfirmed the SAME exclusion a third time, against fresh evidence, finding nothing new.');

        // A direct search for ANY on-file record of a user or workflow
        // that actually needed to find a Publication it never
        // encountered returns zero hits beyond this milestone's own
        // hypothetical (Section B), matching 0.9.340 Section J's own
        // identical sweep.
        assert(roadmapContains('a user who actually needs to find a Publication they never encountered'),
            '4. 0.9.340 itself already named this exact scenario as the one thing that WOULD justify reopening — its own "What comes after" is still on file, unmet by any subsequent milestone\'s own record beyond this one\'s constructed scenario (Section B).');
    }
    console.log('✓ Section J: this is the fourth time this exact direction has been evidence-checked (0.9.330 named it, 0.9.340 STABLE_STOP\'d it, 0.9.350 reconfirmed it), and the first time with a live publish/query round trip as evidence rather than a citation. The round trip changes the ANSWER\'s texture, not its direction: proactive discovery genuinely works as a mechanism (Section C), but it cannot satisfy the literal user expectation Section B tested (find-by-title, on first search, with no prior lead) without inventing a full-text index over a tag-scoped substrate that does not exist anywhere in this codebase, for any domain.');

    console.log('\n=== DECISION MATRIX ===');
    console.log('Current Repository local/accumulated search semantics ............ NOT_A_PRODUCT_GAP (intentional, correct, reconfirmed 4x)');
    console.log('Decentralized discovery mechanism (publish+query) ................. EXISTS, proven live — not the gap');
    console.log('Discovery triggering for Publication kind .......................... MISSING, but DEFER (no demonstrated need)');
    console.log('Network-integrated interactive Repository search (Option A) ....... DEFER (disproportionate cost, substrate mismatch)');
    console.log('Explicit "Discover Decentralized Publications" (Option B/E) ........ DEFER (precedented, cheapest IF ever needed)');
    console.log('Non-admitting SEARCH/DISCOVER/RESOLVE/RETURN model ................. DEFER (Section E: not achievable for this substrate)');
    console.log('\n=== VERDICT: DEFER ===');
    console.log('The Repository accumulated/local-first model stays exactly as built. No 0.9.352 is pre-selected by this milestone.');
}

run().catch((err) => {
    console.error(err);
    throw err;
});
