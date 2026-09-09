import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { License, LicenseId } from '../core/License.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { PublicationResolver } from '../application/PublicationResolver.js';
import { PublicationResolutionCoordinator } from '../application/PublicationResolutionCoordinator.js';
import { resolvePublicationView } from '../application/PublicationResolutionView.js';
import { CreatePublicationDisplayKindRegistryUseCase } from '../application/CreatePublicationDisplayKindRegistryUseCase.js';
import { CreateDiscoveryUseCase } from '../application/CreateDiscoveryUseCase.js';
import { PUBLICATION_CONTENT_KIND } from '../application/PublicationContentValidator.js';
import { SearchPublicationsUseCase } from '../application/SearchPublicationsUseCase.js';
import { FindPublicationUseCase } from '../application/FindPublicationUseCase.js';
import { ForkDocumentUseCase } from '../application/ForkDocumentUseCase.js';
import { LoadDocumentUseCase } from '../application/LoadDocumentUseCase.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.9.338 — Federated Repository Publication User-Journey Audit.
//
// Test-only. Production changes: none.
//
// 0.9.337 proved a decentralized Publication, once RESOLVED, is admitted
// into the one application-lifetime DecentralizedPublicationDiscoveryProvider
// this replica constructs, and that a SearchPublicationsUseCase built
// DIRECTLY on that shared provider finds it. That is a real capability. But
// 0.9.337's own Section F/J deliberately reconfirmed something else, in
// passing, without following it to its conclusion: `application/
// CreateDiscoveryUseCase.js` — the ACTUAL composition root every real UI
// surface calls — "still constructs a plain LocalDiscoveryProvider,"
// unmodified, and "never references the new provider at all." This
// milestone follows that thread all the way down the existing
// selection -> documentId -> Explore/Fork workflow, using real, unmodified
// production classes throughout, never a paraphrase or a mounted Vue
// component (the same practical limit 0.9.337's own header already
// accepted).
//
//   Section A — Repository visibility: does the Publication 0.9.337 admits
//               reach the search call the real Repository page runs?
//   Section B — Selection identity: what does ui/components/
//               PublicationCatalog.js's own open/fork/explore handlers
//               actually carry forward?
//   Section C — Explore workflow: does /world/:documentId's own document
//               load reach a decentralized-origin Publication the same way
//               it reaches a local one?
//   Section D — Fork workflow: does ui/views/EditorView.js's own fork
//               branch reach a decentralized-origin Publication the same
//               way?
//   Section E — Material acquisition boundary: is "resolved Publication"
//               conflated with "material bytes" anywhere in this chain?
//   Section F — Failure classification: are discovery/resolution/document/
//               fork failures kept distinct, or collapsed into one string?
//   Section G — Local/decentralized convergence: does a decentralized
//               Publication reach the IDENTICAL ForkDocumentUseCase call
//               shape a local Publication does?
//   Section H — Re-entry behavior: what survives navigation vs. a fresh
//               process, structurally reconfirmed against this milestone's
//               own findings.
//   Section I — Missing material: does Repository admission, or the
//               provider itself, require material presence anywhere?
//   Section J — Final verdict.

// application/CreateDiscoveryUseCase.js constructs a real
// storage/LocalStorageProvider.js, which reads window.localStorage — the
// one thing this suite needs to invoke live (Section A/D/F/H's own point
// is what the REAL composition root does, not a paraphrase of it) but
// that a plain `node tests/*.test.js` run has no browser to supply. A
// minimal in-memory localStorage, installed ONLY when no window already
// exists (this file's own tests.html registration runs in a real browser,
// where window.localStorage is already real and this branch never runs),
// scoped to this process only — no production file is touched.
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

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function assertThrows(fn, expectedMessageSubstring, message) {
    let threw = false;
    let actual = null;
    try {
        fn();
    } catch (e) {
        threw = true;
        actual = e.message;
    }
    assert(threw, `${message} (did not throw)`);
    assert(actual.includes(expectedMessageSubstring), `${message} (threw "${actual}", expected to include "${expectedMessageSubstring}")`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function countOccurrences(source, pattern) {
    return (source.match(pattern) || []).length;
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

// Builds a genuine, signed publisher/Publication.js instance — the same
// shape 0.9.337's own makeLocalStylePublication() built, reused here under
// the flagship id the brief's own trace names: documentId "9x7c2m".
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

// A minimal, real World Document — the ACTUAL material a Publication's own
// documentId points at, distinct from the Publication object itself. Saved
// into a StorageProvider keyed by its own world.id, exactly the shape
// application/LoadDocumentUseCase.js and application/ForkDocumentUseCase.js
// both read with storageProvider.load(id).
// `id`, when supplied, becomes the World's own id — matching the real
// invariant a genuine publish always holds: Publication.documentId IS the
// published Document's own world.id, the same identity, never two
// coincidentally-equal strings.
function makeDocument(title, author, id = undefined) {
    const world = new World(id !== undefined ? { id } : {});
    world.addBuilding(new Building({ creator: author }));
    return new Document({ world, metadata: new DocumentMetadata({ title, author }) });
}

// The exact production admission gate 0.9.337 put at both
// ui/views/DecentralizedPublicationsView.js's resolveEntry() and retrieve()
// — reproduced test-side exactly as 0.9.337's own flagship test already
// established is faithful to production, so this milestone can start from
// "already admitted" without re-proving the peer-transport-to-admission
// chain 0.9.337 already proved live.
function admitToRepositoryDiscovery(view, discoveryProvider) {
    if (discoveryProvider && view && view.resolved && view.content instanceof Publication) {
        discoveryProvider.add(view.content);
    }
}

async function resolveAsDecentralizedPublication(publication, identityProvider) {
    const storage = new InMemoryStorageProvider();
    const resolver = new PublicationResolver(new LocalContentStore(storage), new LocalAuthorizationVerifier());
    const { kindPlugins } = new CreatePublicationDisplayKindRegistryUseCase().execute();
    const coordinator = new PublicationResolutionCoordinator(resolver, null);
    const envelope = await resolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider });
    return resolvePublicationView(envelope, { coordinator, kindPlugins });
}

async function run() {
    console.log('Running Federated Repository Publication User-Journey Audit...\n');

    // ===============================================================
    // Section A — Repository visibility: does the Publication 0.9.337
    // admits reach the search call the real Repository page runs?
    // ===============================================================
    let flagshipPublication;
    let flagshipProvider;
    let flagshipView;
    {
        // UPDATED by 0.9.339 — Merge Decentralized Publication Discovery
        // into Repository Discovery. This whole Section A originally
        // proved a GAP: the flagship Publication was genuinely resolved
        // and genuinely admitted, yet invisible to the real Repository
        // page's own search call. 0.9.339 closed exactly that gap, at
        // exactly the one composition root this section itself named —
        // reconfirmed fresh below, live, rather than left describing a
        // state that no longer holds.

        // A1. Structural: ui/components/PublicationCatalog.js — the ONE
        // component both RepositoryView.js and AuthorView.js mount — is
        // what a real user's "Repository" navigation actually renders.
        const catalogSource = await readSource('ui/components/PublicationCatalog.js');
        assert(catalogSource.includes('new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider })'),
            '1. UPDATED (0.9.339): ui/components/PublicationCatalog.js builds its discoveryProvider/searchPublicationsUseCase from application/CreateDiscoveryUseCase.js, now passing through the injected decentralizedDiscoveryProvider — the same composition root 0.9.337 itself named, now actually reaching the shared provider.');
        assert(catalogSource.includes("inject('decentralizedPublicationDiscoveryProvider', null)"),
            '2. UPDATED (0.9.339): ui/components/PublicationCatalog.js now injects decentralizedPublicationDiscoveryProvider (defaulting to null when absent) and threads it into CreateDiscoveryUseCase — confirmed by source, not inference.');

        const repositoryViewSource = await readSource('ui/views/RepositoryView.js');
        assert(repositoryViewSource.includes('<PublicationCatalog') && !/decentralizedPublicationDiscoveryProvider/.test(repositoryViewSource),
            '3. ui/views/RepositoryView.js is still a thin wrapper around PublicationCatalog with no discovery wiring of its own — the injection lives in PublicationCatalog.js itself, not duplicated in every host view.');

        // A2. Structural: application/CreateDiscoveryUseCase.js itself,
        // reconfirmed fresh — UPDATED (0.9.339): it now accepts the
        // shared provider and composes it via discovery/
        // CompositeDiscoveryProvider.js's own small, generic merge, while
        // still constructing LocalDiscoveryProvider exactly as before.
        const createDiscoverySource = await readSource('application/CreateDiscoveryUseCase.js');
        assert(createDiscoverySource.includes('new LocalDiscoveryProvider(storageProvider)') &&
            createDiscoverySource.includes('new CompositeDiscoveryProvider([localDiscoveryProvider, decentralizedDiscoveryProvider])'),
            '4. UPDATED (0.9.339): application/CreateDiscoveryUseCase.js still constructs a plain LocalDiscoveryProvider, and now ALSO composes an optional decentralizedDiscoveryProvider alongside it via CompositeDiscoveryProvider.');

        // A3. LIVE proof: build the flagship decentralized-origin
        // Publication (documentId "9x7c2m", the brief's own flagship id),
        // resolve it, and admit it into a provider standing in for the
        // one real, shared, application-lifetime instance ui/main.js
        // constructs (0.9.337 Section A/I already proved structurally
        // that exactly one such instance exists). Then run the EXACT
        // production call PublicationCatalog.js's own onMounted()/runQuery()
        // now makes — `new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider })`
        // — with `decentralizedDiscoveryProvider` standing in for exactly
        // what `inject('decentralizedPublicationDiscoveryProvider', null)`
        // would hand a real mounted component.
        const alice = makeIdentity('Alice');
        flagshipPublication = makePublication(
            { documentId: '9x7c2m', title: 'The Federated Atlas', author: 'alice' }, alice
        );
        flagshipView = await resolveAsDecentralizedPublication(flagshipPublication, alice);
        assert(flagshipView.resolved === true, `5. setup: the flagship Publication genuinely resolves (${flagshipView.reason}).`);

        flagshipProvider = new DecentralizedPublicationDiscoveryProvider();
        admitToRepositoryDiscovery(flagshipView, flagshipProvider);
        assert(flagshipProvider.list().length === 1,
            '6. setup: the flagship Publication is admitted into the shared provider, exactly as 0.9.337 proved live.');

        // The real production composition PublicationCatalog.js calls,
        // now WITH the shared provider threaded through, exactly as A1
        // above confirmed the real component does.
        const { searchPublicationsUseCase: repositoryPageSearch } = new CreateDiscoveryUseCase().execute({
            decentralizedDiscoveryProvider: flagshipProvider
        });
        const repositoryPageResult = repositoryPageSearch.execute({ text: 'federated atlas' });
        assert(repositoryPageResult.items.length === 1 && repositoryPageResult.items[0] === flagshipView.content,
            '7. UPDATED (0.9.339) — THE GAP IS CLOSED: the exact SearchPublicationsUseCase instance the real Repository page (PublicationCatalog.js via CreateDiscoveryUseCase.js) calls NOW finds the flagship Publication — it is visible to a real user\'s Repository search, exactly as 0.9.337\'s own headline originally promised.');

        // A4. And Repository search over the shared provider ALONE never
        // required going through this composition root in the first
        // place (0.9.337's own capability, unchanged) — restated here to
        // show the composite result agrees with the direct one, not just
        // that it is non-empty.
        const directSearch = new SearchPublicationsUseCase(flagshipProvider);
        const directResult = directSearch.execute({ text: 'federated atlas' });
        assert(directResult.items.length === 1 && directResult.items[0] === flagshipView.content,
            '8. by contrast, SearchPublicationsUseCase(flagshipProvider) — the shared provider directly — finds the identical single result the real composition root (A3 above) now also finds: the composite adds the decentralized candidate, it never duplicates or reshapes it.');
    }
    console.log('✓ Section A: UPDATED (0.9.339). Repository visibility through the real UI composition root is now CONFIRMED, not FAILED. ui/components/PublicationCatalog.js (RepositoryView.js and AuthorView.js\'s shared implementation) now injects the shared decentralizedPublicationDiscoveryProvider and threads it into application/CreateDiscoveryUseCase.js, which composes it alongside LocalDiscoveryProvider via discovery/CompositeDiscoveryProvider.js. A flagship Publication (documentId "9x7c2m") that is genuinely resolved and genuinely admitted into the one shared provider is now found by the exact SearchPublicationsUseCase call the real Repository page runs, matching the result a SearchPublicationsUseCase built directly on that same shared provider already found. The gap this section originally located — one composition root, not the search class itself — is closed at exactly that root.');

    // ===============================================================
    // Section B — Selection identity: what does PublicationCatalog.js's
    // own open/fork/explore handlers actually carry forward?
    // ===============================================================
    {
        const catalogSource = await readSource('ui/components/PublicationCatalog.js');

        assert(/function openPublication\(pub\)\s*\{\s*router\.push\(\{\s*path:\s*'\/editor',\s*query:\s*\{\s*load:\s*pub\.documentId\s*\}\s*\}\);/.test(catalogSource),
            '1. openPublication(pub) navigates with query.load = pub.documentId — the existing Document identity, no new one.');
        assert(/function forkPublication\(pub\)\s*\{\s*router\.push\(\{\s*path:\s*'\/editor',\s*query:\s*\{\s*fork:\s*pub\.documentId,\s*publication:\s*pub\.id\s*\}\s*\}\);/.test(catalogSource),
            '2. forkPublication(pub) navigates with query.fork = pub.documentId AND query.publication = pub.id — both existing Publication/Document identities, together.');
        assert(/function viewWorld\(pub\)\s*\{\s*router\.push\(\{\s*path:\s*`\/world\/\$\{pub\.documentId\}`\s*\}\);/.test(catalogSource),
            '3. viewWorld(pub) navigates with route.params.documentId = pub.documentId — Explore uses the identical Document identity.');

        // No fourth identity concept (a "source", "origin", or
        // decentralized-specific field) is ever read off `pub` anywhere in
        // this component.
        assert(!/pub\.(origin|source|peerId|decentralized|isRemote|isPeer)\b/.test(catalogSource),
            '4. no origin/source/peer-specific field is ever read off a selected publication — selection carries exactly documentId and id, the same two fields a purely local Publication already carries.');

        // And the object handed to open/fork/explore IS the Publication
        // instance itself — PublicationCard.js/PublicationList.js emit
        // `publication`/`pub` unmodified, never a re-shaped projection.
        const cardSource = await readSource('ui/components/PublicationCard.js');
        const listSource = await readSource('ui/components/PublicationList.js');
        assert(cardSource.includes("$emit('open', publication)") && cardSource.includes("$emit('fork', publication)") && cardSource.includes("$emit('explore', publication)"),
            '5. PublicationCard.js emits the Publication instance itself on open/fork/explore, no projection.');
        assert(listSource.includes("$emit('open', pub)") && listSource.includes("$emit('fork', pub)") && listSource.includes("$emit('explore', pub)"),
            '6. PublicationList.js does the same.');
    }
    console.log('✓ Section B: selection identity is exactly documentId (open, explore) and documentId + Publication.id together (fork) — publisher/Publication.js\'s own existing fields, read directly off the Publication instance search returned, never a new Repository-minted identity, a wrapper, or a decentralized-specific field.');

    // ===============================================================
    // Section C — Explore workflow: does /world/:documentId's own
    // document load reach a decentralized-origin Publication the same
    // way it reaches a local one?
    // ===============================================================
    {
        // C1. Structural: WorldView.js's own session (application/
        // CreateWorldViewUseCase.js) is built entirely on LocalStorageProvider
        // — the identical storage layer application/LoadDocumentUseCase.js
        // and application/ForkDocumentUseCase.js already use.
        const worldViewUseCaseSource = await readSource('application/CreateWorldViewUseCase.js');
        assert(worldViewUseCaseSource.includes('new LocalStorageProvider()'),
            '1. application/CreateWorldViewUseCase.js — WorldView.js\'s own session composition — is built on the same LocalStorageProvider every other document-loading path uses; no decentralized-specific storage or fetch path exists here.');

        // C2. LIVE: the exact document-loading mechanism this identity
        // reaches, called with the flagship Publication's own documentId,
        // against a StorageProvider that never received the underlying
        // World Document's bytes (only the Publication ENVELOPE was
        // resolved in Section A — see Section E for why that is not the
        // same thing).
        const emptyStorage = new InMemoryStorageProvider();
        const loadUseCase = new LoadDocumentUseCase(emptyStorage);
        const fakeDocumentManager = { load: () => { throw new Error('should not be reached'); } };
        assertThrows(
            () => loadUseCase.execute(fakeDocumentManager, flagshipPublication.documentId),
            `no document found with id "${flagshipPublication.documentId}"`,
            '2. LoadDocumentUseCase.execute() — the mechanism /world/:documentId ultimately depends on — throws a clean, specific, catchable error for the flagship documentId when the underlying World Document was never materialized locally.'
        );

        // C3. Convergence: the SAME mechanism, called with the SAME
        // documentId, succeeds once the material genuinely is present —
        // proving no decentralized-specific branch exists; only presence
        // or absence of the bytes at that key decides the outcome.
        const populatedStorage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const flagshipDocument = makeDocument('The Federated Atlas', 'alice', flagshipPublication.documentId);
        populatedStorage.save(flagshipPublication.documentId, serializer.serialize(flagshipDocument));
        const populatedLoadUseCase = new LoadDocumentUseCase(populatedStorage, serializer);
        const realDocumentManager = { load: (doc, id) => { realDocumentManager.loadedId = id; realDocumentManager.loadedDoc = doc; } };
        const loaded = populatedLoadUseCase.execute(realDocumentManager, flagshipPublication.documentId);
        assert(loaded instanceof Document && realDocumentManager.loadedId === flagshipPublication.documentId,
            '3. once the material is present under the same documentId, the identical LoadDocumentUseCase succeeds — the exact same code path a local Publication\'s Explore already uses, with no decentralized-specific branch anywhere.');
    }
    console.log('✓ Section C: Explore reaches the flagship decentralized-origin Publication through the EXACT SAME LoadDocumentUseCase / documentId semantics a local Publication uses — no special casing exists. When the World Document\'s own material is absent, it fails cleanly and specifically ("no document found with id …"), not silently and not with a generic error; when the material is present, it succeeds identically to a local Publication.');

    // ===============================================================
    // Section D — Fork workflow: does EditorView.js's own fork branch
    // reach a decentralized-origin Publication the same way?
    // ===============================================================
    {
        // UPDATED by 0.9.339 — Merge Decentralized Publication Discovery
        // into Repository Discovery. This section originally proved the
        // SAME root-cause gap Section A did: EditorView.js's own
        // findPublicationUseCase silently returned null for a
        // decentralized-origin Publication's own id. 0.9.339 closed it
        // at the identical composition root, so sourcePublication is no
        // longer silently null.

        // D1. Structural: EditorView.js's own fork branch, reproduced
        // faithfully — findPublicationUseCase.execute(route.query.publication)
        // then forkDocumentUseCase.execute(route.query.fork, identityProvider, sourcePublication).
        const editorViewSource = await readSource('ui/views/EditorView.js');
        assert(editorViewSource.includes("inject('decentralizedPublicationDiscoveryProvider', null)") &&
            /new CreateDiscoveryUseCase\(\)\.execute\(\{\s*decentralizedDiscoveryProvider:/.test(editorViewSource),
            '1. UPDATED (0.9.339): ui/views/EditorView.js builds findPublicationUseCase from the SAME application/CreateDiscoveryUseCase.js composition root Section A proved is now merged, now also injecting and threading through the shared decentralized provider.');
        assert(editorViewSource.includes('sourcePublication = findPublicationUseCase.execute(route.query.publication);') &&
            editorViewSource.includes('forkDocumentUseCase.execute(route.query.fork, identityProvider, sourcePublication);'),
            '2. the fork branch looks up route.query.publication (Publication.id) via findPublicationUseCase, then hands the result (or null) to forkDocumentUseCase alongside route.query.fork (documentId) — exactly the identity Section B proved selection carries. Unchanged by 0.9.339 — only what findPublicationUseCase itself can see changed, not this call shape.');

        // D2. LIVE: the exact findPublicationUseCase EditorView.js builds
        // — now WITH the shared provider threaded through, exactly as D1
        // above confirmed the real component does — asked for the
        // flagship Publication's own id, the same id forkPublication(pub)
        // put in route.query.publication.
        const { findPublicationUseCase } = new CreateDiscoveryUseCase().execute({
            decentralizedDiscoveryProvider: flagshipProvider
        });
        const lookedUp = findPublicationUseCase.execute(flagshipPublication.id);
        assert(lookedUp === flagshipView.content,
            "3. UPDATED (0.9.339): findPublicationUseCase.execute(pub.id) — the real production lookup EditorView.js's fork branch runs — NOW finds the flagship Publication instance itself, the SAME root-cause fix Section A applied to Repository search. sourcePublication is no longer silently null.");

        // D3. LIVE: forkDocumentUseCase.execute(), called with the exact
        // identity Repository selection carries (flagshipPublication.documentId,
        // sourcePublication=lookedUp as D2 now produces), against a
        // StorageProvider that never received the material — the same
        // clean failure Section C already proved for Explore, confirming
        // Fork has no separate, decentralized-specific failure mode
        // either. This failure is now about MATERIAL absence only —
        // D2's own identity lookup no longer fails first.
        const emptyStorage = new InMemoryStorageProvider();
        const forkUseCase = new ForkDocumentUseCase(emptyStorage);
        assertThrows(
            () => forkUseCase.execute(flagshipPublication.documentId, null, lookedUp),
            `no document found with id "${flagshipPublication.documentId}"`,
            '4. ForkDocumentUseCase.execute() fails the same clean, specific way as LoadDocumentUseCase when the material is absent — the identical mechanism, the identical error shape, no decentralized-specific fork path exists (confirmed structurally below).'
        );

        // Structural: ForkDocumentUseCase.js itself has no idea any of
        // this is decentralized — zero references anywhere in the file.
        const forkUseCaseSource = await readSource('application/ForkDocumentUseCase.js');
        assert(!/Decentralized|decentralizedPublicationDiscoveryProvider/.test(forkUseCaseSource),
            '5. application/ForkDocumentUseCase.js contains no decentralized-specific code at all — it only ever knows about a documentId and an optional Publication.');
    }
    console.log('✓ Section D: UPDATED (0.9.339). Fork reaches the flagship Publication through the EXACT SAME findPublicationUseCase/forkDocumentUseCase/documentId call shape a local Publication uses — application/ForkDocumentUseCase.js itself is completely decentralized-agnostic. The lookup gap this section originally found was upstream and singular: findPublicationUseCase (built from the same application/CreateDiscoveryUseCase.js Section A named) could not see a decentralized-origin Publication by its own id, so sourcePublication silently defaulted to null rather than erroring. 0.9.339 closed that SAME Section A root cause, so findPublicationUseCase.execute(pub.id) now returns the flagship Publication itself, and sourcePublication is no longer silently null.');

    // ===============================================================
    // Section E — Material acquisition boundary: is "resolved
    // Publication" conflated with "material bytes" anywhere in this
    // chain?
    // ===============================================================
    {
        // E1. Structural: application/PublicationResolver.js's own
        // resolve() never reads publication.documentId or fetches a
        // second ContentReference off the wrapped content — it retrieves
        // bytes for exactly ONE ContentReference, the DecentralizedPublication
        // envelope's own (pointing at the serialized Publication metadata),
        // never the Publication's OWN contentReference (pointing at the
        // World Document's bytes).
        const resolverSource = await readSource('application/PublicationResolver.js');
        assert(!/\.documentId/.test(resolverSource),
            '1. application/PublicationResolver.js never references .documentId anywhere — resolving a Publication envelope has no idea a "document" exists at all.');
        assert(countOccurrences(resolverSource, /this\._contentStore\.get\(/g) === 1,
            '2. exactly one ContentStore#get() call in the whole resolution pipeline — the envelope\'s own contentReference; the Publication\'s own (separate) contentReference, pointing at the World Document, is never fetched as a side effect of resolution.');

        // E2. Structural: application/PublicationContentKind.js — the
        // forkbuild.publication kindPlugin — deliberately has no `store`
        // option, by its own header's explicit design (quoted, not
        // paraphrased, so a future edit that silently added one would
        // break this assertion rather than this audit going stale).
        const kindSource = await readSource('application/PublicationContentKind.js');
        assert(kindSource.includes('Deliberately NO `store` option'),
            '3. application/PublicationContentKind.js documents, in its own words, that it deliberately supplies no store step — resolving a Publication never persists anything, metadata or material.');
        assert(!/store:/.test(kindSource.replace(/\/\/.*$/gm, '')),
            "4. confirmed structurally: the plugin object this module returns has no `store` key at all (comments stripped before the check, so the header's own prose mentioning the word does not trip this assertion).");

        // E3. LIVE confirmation, reusing Section A's own resolved view:
        // resolving the flagship Publication never touched local storage
        // at its OWN documentId key — reconfirming C2's "absent" starting
        // condition is not an artifact of test setup but the actual,
        // structural behavior of resolution.
        const freshStorage = new InMemoryStorageProvider();
        const resolver = new PublicationResolver(new LocalContentStore(freshStorage), new LocalAuthorizationVerifier());
        const alice = makeIdentity('Alice');
        const pub = makePublication({ documentId: 'world-e3-material-check', title: 'Material Check', author: 'alice' }, alice);
        await resolver.publish({ content: pub, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: alice });
        assert(freshStorage.load('world-e3-material-check') === null,
            "5. after a genuine publish/resolve round trip, storage holds NOTHING under the Publication's own documentId — confirming, live, that resolving a Publication's identity/metadata never materializes its World Document.");
    }
    console.log('✓ Section E: "resolved Publication" and "material bytes" are never conflated anywhere in this chain. application/PublicationResolver.js resolves exactly one ContentReference — the envelope\'s own, addressing the Publication\'s metadata — and never touches documentId or a second ContentReference for the underlying World Document. application/PublicationContentKind.js deliberately supplies no store step, by its own documented design. Repository (and this audit\'s own Section A gap) is never silently made responsible for material retrieval — that boundary already exists, upstream of Repository entirely, at application/PublicationResolver.js\'s own ten-step discipline.');

    // ===============================================================
    // Section F — Failure classification: are discovery/resolution/
    // document/fork failures kept distinct, or collapsed into one
    // generic string?
    // ===============================================================
    {
        // F1. Repository discovery "failure" (Section A) is not an
        // exception at all — it is a structural absence: a normal,
        // successful PublicationPage with zero matching items. It must
        // never be confused with a thrown error.
        const { searchPublicationsUseCase } = new CreateDiscoveryUseCase().execute();
        const discoveryResult = searchPublicationsUseCase.execute({ text: 'federated atlas' });
        assert(discoveryResult.items.length === 0 && Array.isArray(discoveryResult.items),
            '1. Repository discovery "failure" is a well-formed, empty PublicationPage — no exception, no sentinel error string.');

        // F2. Publication resolution failure — application/
        // PublicationResolutionOutcome.js's own multi-valued enum, not a
        // single generic "unavailable" flag (0.9.337 Section D already
        // proved CONTENT_UNAVAILABLE live; reconfirmed here it is one of
        // SEVERAL distinct values, not the only one).
        const outcomeSource = await readSource('application/PublicationResolutionOutcome.js');
        const outcomeValues = (outcomeSource.match(/^\s{4}\w+:/gm) || []).map((l) => l.trim().replace(':', ''));
        assert(outcomeValues.length >= 4,
            `2. application/PublicationResolutionOutcome.js defines ${outcomeValues.length} distinct outcome values (${outcomeValues.join(', ')}) — resolution failure is not one generic state.`);

        // F3. Document retrieval failure — a thrown Error with a specific,
        // greppable message shape, distinct from resolution's own outcome
        // strings and from Fork's own license-denial message (F4).
        const emptyStorage = new InMemoryStorageProvider();
        let documentFailureMessage = null;
        try {
            new LoadDocumentUseCase(emptyStorage).execute({ load() {} }, 'missing-doc-id');
        } catch (e) { documentFailureMessage = e.message; }
        assert(documentFailureMessage === 'LoadDocumentUseCase: no document found with id "missing-doc-id"',
            `3. document retrieval failure has its own specific message shape: "${documentFailureMessage}".`);

        // F4. Fork failure — a license denial is a DIFFERENT failure
        // entirely from "no document found," with its own distinct
        // message, never collapsed into F3's shape.
        const storageWithDoc = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const ndDoc = makeDocument('Restricted Work', 'alice');
        storageWithDoc.save(ndDoc.world.id, serializer.serialize(ndDoc));
        const ndPublication = new Publication({
            id: 'p-nd-f4', documentId: ndDoc.world.id, title: 'Restricted Work', author: 'alice',
            providerId: 'local', publishedAt: new Date(),
            license: new License({ id: LicenseId.CC_BY_ND_4_0 })
        });
        assertThrows(
            () => new ForkDocumentUseCase(storageWithDoc, serializer).execute(ndDoc.world.id, null, ndPublication),
            'not permitted under license CC-BY-ND-4.0',
            '4. Fork failure (license denial) has its own distinct message shape, never confused with a missing-document failure even though both are thrown Errors from the same use case.'
        );

        // Cross-check: none of the four failure signals share text with
        // any other — no generic "decentralized Publication unavailable"
        // string exists anywhere that could paper over the distinction.
        const signals = [
            'no document found with id',
            'not permitted under license',
            ...outcomeValues
        ];
        const uniqueSignals = new Set(signals);
        assert(uniqueSignals.size === signals.length,
            '5. all four failure classes\' own signal strings are pairwise distinct — none is a substring alias of another.');
    }
    console.log('✓ Section F: four failure classes stay genuinely distinct. Repository discovery "failure" (Section A\'s gap) is a well-formed empty result, never an exception. Publication resolution failure is one of several named application/PublicationResolutionOutcome.js values. Document retrieval failure is a specific, greppable thrown-Error message. Fork failure (a license denial) is a different thrown-Error message again. No generic "decentralized Publication unavailable" catch-all exists anywhere in this chain.');

    // ===============================================================
    // Section G — Local/decentralized convergence: does a decentralized
    // Publication reach the IDENTICAL ForkDocumentUseCase call shape a
    // local Publication does?
    // ===============================================================
    {
        const serializer = new DocumentSerializer();

        // G1. Local Publication -> Fork, the existing, unmodified path.
        const localStorage = new InMemoryStorageProvider();
        const localDoc = makeDocument('Local Work', 'alice');
        localStorage.save(localDoc.world.id, serializer.serialize(localDoc));
        const localPublication = new Publication({
            id: 'p-local-g1', documentId: localDoc.world.id, title: 'Local Work', author: 'alice',
            providerId: 'local', publishedAt: new Date(), license: new License({ id: LicenseId.CC_BY_4_0 })
        });
        const localFork = new ForkDocumentUseCase(localStorage, serializer).execute(localDoc.world.id, null, localPublication);
        assert(localFork.metadata.license.attribution.sourcePublicationId === 'p-local-g1' &&
            localFork.metadata.license.attribution.sourceDocumentId === localDoc.world.id,
            '1. a local Publication forks through ForkDocumentUseCase exactly as always, stamping sourcePublicationId/sourceDocumentId from the existing Publication identity.');

        // G2. Decentralized-origin Publication -> Fork, through the
        // IDENTICAL ForkDocumentUseCase, once its material is present
        // (isolating the FORK MECHANISM from Section A/D's own lookup
        // gap — the point here is convergence of MECHANISM, not whether
        // the lookup currently reaches it).
        const decentralizedStorage = new InMemoryStorageProvider();
        decentralizedStorage.save(flagshipPublication.documentId, serializer.serialize(makeDocument('The Federated Atlas', 'alice', flagshipPublication.documentId)));
        const decentralizedFork = new ForkDocumentUseCase(decentralizedStorage, serializer)
            .execute(flagshipPublication.documentId, null, flagshipPublication);
        assert(decentralizedFork.metadata.license.attribution.sourcePublicationId === flagshipPublication.id &&
            decentralizedFork.metadata.license.attribution.sourceDocumentId === flagshipPublication.documentId,
            '2. the decentralized-origin flagship Publication forks through the SAME ForkDocumentUseCase, stamping the SAME sourcePublicationId/sourceDocumentId fields off the SAME Publication identity — no decentralized-specific representation is invented anywhere.');

        // G3. The only actual divergence measured across this whole
        // audit is upstream of ForkDocumentUseCase entirely: whether
        // `sourcePublication` gets FOUND (Section D) — never how
        // ForkDocumentUseCase itself treats it once supplied.
        assert(localFork.constructor === decentralizedFork.constructor,
            '3. both forks produce the identical Document class through the identical clone service — convergence is real, not asserted.');
    }
    console.log('✓ Section G: local and decentralized Publications reach the IDENTICAL existing ForkDocumentUseCase capability, with the IDENTICAL identity fields (sourcePublicationId, sourceDocumentId) stamped the same way. The architectural objective the brief named — "a decentralized Publication becomes a normal Publication once resolved" — holds at the Fork mechanism itself; the only measured divergence (Section D) is whether the upstream lookup finds it, never how Fork treats it once found.');

    // ===============================================================
    // Section H — Re-entry behavior, reconfirmed against this
    // milestone's own findings.
    // ===============================================================
    {
        const mainSource = await readSource('ui/main.js');
        assert(countOccurrences(mainSource, /new DecentralizedPublicationDiscoveryProvider\(\)/g) === 1,
            '1. reconfirmed: exactly one application-lifetime instance, built once in ui/main.js (0.9.337 Section A/I).');

        // A literal application restart (a fresh process/reload) has no
        // durable store to rehydrate from — a fresh instance starts
        // empty, by construction (no persistence layer exists or is
        // implied anywhere in discovery/DecentralizedPublicationDiscoveryProvider.js).
        const providerSource = await readSource('discovery/DecentralizedPublicationDiscoveryProvider.js');
        assert(!/localStorage|StorageProvider|storageProvider|indexedDB/.test(providerSource),
            '2. discovery/DecentralizedPublicationDiscoveryProvider.js has no persistence dependency at all — a restart genuinely starts from zero, by design (0.9.335\'s own accumulator posture), not by accident.');
        const freshInstance = new DecentralizedPublicationDiscoveryProvider();
        assert(freshInstance.list().length === 0,
            '3. live: a fresh instance (modeling "restart the application") starts empty.');

        // Navigation WITHIN one running app, by contrast, shares the ONE
        // provide/inject instance — already proven live in 0.9.337
        // Section A/H; reconfirmed here it is what makes Section A's own
        // gap durable across navigation too: an admitted Publication
        // persists app-wide for the tab's lifetime, but ui/components/
        // PublicationCatalog.js's own re-mount on every navigation
        // (RepositoryView.js's own `<PublicationCatalog />`) still never
        // reaches it, for the exact same Section A reason — navigating
        // away and back changes nothing about the gap.
    }
    console.log('✓ Section H: re-entry behavior is exactly the accumulator boundary 0.9.335/0.9.336 already designed and documented — an in-memory, application-lifetime, non-persistent store. Navigating between views within one running app shares the single instance (nothing is lost); a genuine restart starts empty, by construction, with no persistence dependency anywhere in the provider. This is not a defect this milestone found — it is the documented product boundary, reconfirmed rather than newly discovered.');

    // ===============================================================
    // Section I — Missing material: does Repository admission, or the
    // provider itself, require material presence anywhere?
    // ===============================================================
    {
        // I1. Structural: DecentralizedPublicationDiscoveryProvider.add()
        // has no storage/content dependency at all — admission is a pure
        // identity operation over the Publication object, never touching
        // its documentId's own material.
        const providerSource = await readSource('discovery/DecentralizedPublicationDiscoveryProvider.js');
        assert(!/ContentStore|contentStore|storageProvider/.test(providerSource),
            '1. discovery/DecentralizedPublicationDiscoveryProvider.js never depends on a ContentStore or StorageProvider — admission cannot require material presence, structurally, because it has no way to check it.');

        // I2. LIVE: a Publication whose World Document material was NEVER
        // materialized anywhere (Section E) is STILL genuinely admitted
        // and STILL genuinely findable by a direct SearchPublicationsUseCase
        // — a valid Repository-shaped result, exactly as the brief
        // requires, independent of material presence.
        assert(flagshipProvider.list().length === 1,
            '2. the flagship Publication — whose material Section C/E proved absent — remains admitted and listed; admission was never contingent on material presence.');
        const directSearch = new SearchPublicationsUseCase(flagshipProvider);
        assert(directSearch.execute({ text: 'federated atlas' }).items.length === 1,
            '3. ...and remains findable by search, for the identical reason.');

        // I3. The natural acquisition boundary already exists, and is
        // exactly where Section C/D/F located it: LoadDocumentUseCase /
        // ForkDocumentUseCase's own storageProvider.load(documentId),
        // which throws a specific, caught, user-visible error (F3) rather
        // than crashing or silently corrupting state. No NEW mechanism is
        // required to answer "what happens when material is missing" —
        // it already exists, one layer below Repository, and already
        // behaves identically for a local Publication whose document was
        // deleted or never saved.
    }
    console.log('✓ Section I: a Repository-shaped result never requires material presence, structurally or live — DecentralizedPublicationDiscoveryProvider has no storage dependency, and the flagship Publication (material genuinely absent, per Section E) is still validly admitted and findable. The existing Explore/Fork workflow already has a natural, pre-existing acquisition boundary (LoadDocumentUseCase/ForkDocumentUseCase\'s own storageProvider.load(documentId), Section C/D/F) that answers "material missing" with a specific, caught, user-visible failure — the same boundary a local Publication with a deleted document already hits. Repository was never made responsible for material retrieval, and this audit found no place where it silently was.');

    // ===============================================================
    // Section J — Final verdict.
    // ===============================================================
    {
        console.log('\n--- Section J: Final Verdict ---');
        console.log('Verdict (AS OF 0.9.338, WHEN THIS AUDIT WAS WRITTEN): ONE_NARROW_PRODUCT_GAP');
        console.log('UPDATE (0.9.339 — Merge Decentralized Publication Discovery into Repository ' +
            'Discovery): the gap this verdict describes is now CLOSED — Sections A and D above ' +
            'were reconfirmed live against the 0.9.339 production code and now find the flagship ' +
            'Publication through the real UI composition root. The verdict below is preserved as ' +
            'this audit\'s own point-in-time record of the gap it found and the exact fix it ' +
            'recommended (its own "Recommended next step" paragraph is, verbatim, what 0.9.339 built).');
        console.log(`
The gap is real, small, and precisely located: application/CreateDiscoveryUseCase.js
— the ONE composition root ui/components/PublicationCatalog.js (Repository,
Author), ui/views/EditorView.js (fork/load lookup), and ui/views/WorldView.js
(Explore's own session) all independently call — constructs a fresh
LocalDiscoveryProvider every time and never merges in the app-wide
DecentralizedPublicationDiscoveryProvider ui/main.js already builds and
already shares via provide/inject (0.9.337). This is the SAME root cause
behind both Section A (Repository search never finds an admitted
decentralized Publication) and Section D (Editor's fork-time
findPublicationUseCase lookup never finds one either) — one file, not two
unrelated gaps.

Everything downstream of that one composition root already converges
correctly, using existing identity and existing mechanisms, exactly per
the brief's own architectural objective:
  - Selection identity (Section B) is exactly documentId / Publication.id
    — no new Repository identity exists or is needed.
  - Explore and Fork (Section C/D/G) reach the IDENTICAL LoadDocumentUseCase/
    ForkDocumentUseCase a local Publication uses, with IDENTICAL identity
    semantics, and zero decentralized-specific branches anywhere in either
    use case.
  - The material-acquisition boundary (Section E/I) already exists, one
    layer below Repository, and already behaves identically regardless of
    a Publication's origin — no new acquisition mechanism is required.
  - Failure modes (Section F) already stay genuinely distinct — no
    generic "decentralized Publication unavailable" state exists to
    collapse into.

This is deliberately NOT classified ACQUISITION_GAP: Section E/I found the
acquisition boundary already correctly drawn and already correctly
enforced — closing it is future, separate, optional product work (an
explicit "Retrieve material" action), not a defect in this journey.
This is deliberately NOT classified IDENTITY_GAP: no new identity concept
is missing or ambiguous anywhere in this chain — Section B/G found the
SAME existing documentId/Publication.id fields carrying the SAME meaning
throughout, with zero invented representations.
This is deliberately NOT classified COMPLETE: a real user, today, cannot
complete Repository -> select -> Fork/Explore for a decentralized-origin
Publication, because they can never see it in Repository search in the
first place (Section A) — 0.9.337's own "Wire Resolved Decentralized
Publications into Repository Discovery" headline is not yet true for the
actual Repository UI, only for a directly-wired SearchPublicationsUseCase
a real user never reaches.

Recommended next step, sized exactly to this one gap: teach application/
CreateDiscoveryUseCase.js to accept the already-injected, already-shared
decentralized provider (where available) and compose its results
alongside LocalDiscoveryProvider's own — e.g. a small, generic composite
discoveryProvider, never a new Repository-owned store, never a source/
origin field on a result (per the brief's own exclusion list). That one
change closes Section A AND Section D's lookup gap simultaneously, because
both already call through this same composition root.
        `.trim());
    }

    console.log('\nAll Federated Repository Publication User-Journey Audit tests passed.');
}

run().catch((error) => {
    console.error('FederatedRepositoryPublicationUserJourneyAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
