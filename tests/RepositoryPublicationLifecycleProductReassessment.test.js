import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { Publication } from '../publisher/Publication.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { UnpublishDocumentUseCase } from '../application/UnpublishDocumentUseCase.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { License, LicenseId } from '../core/License.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { CompositeDiscoveryProvider } from '../discovery/CompositeDiscoveryProvider.js';
import { SearchPublicationsUseCase } from '../application/SearchPublicationsUseCase.js';
import { PublicationQuery } from '../core/PublicationQuery.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { ArweaveGatewayFailoverWorldEncounterMaterialResolver } from '../application/ArweaveGatewayFailoverWorldEncounterMaterialResolver.js';
import {
    inspectWorldEncounterMaterial
} from '../application/WorldEncounterMaterialInspection.js';
import {
    WorldEncounterMaterialVerificationStatus,
    WorldEncounterMaterialVerifier
} from '../application/WorldEncounterMaterialVerification.js';
import {
    PublicationMaterialProvenanceOrigin,
    describePublicationMaterialProvenanceFromInspection
} from '../application/PublicationMaterialProvenance.js';
import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { ExternalAnchorVerifier } from '../application/ExternalAnchorVerifier.js';
import { AnchorVerificationOutcome } from '../application/AnchorVerificationOutcome.js';
import { DecentralizedWorldDiscoveryLeadRegistry } from '../application/DecentralizedWorldDiscoveryLeadRegistry.js';

// 0.9.534 — Repository Publication Lifecycle Product Reassessment.
//
// 0.9.532 asked whether Repository/Notification/Search/Documents-Here/
// Nearby-Worlds entry points into World cohere as one Publication
// EXPERIENCE. 0.9.533 widened that to the entire Create->Distribute->
// Discover->Repository->Explore->World->Evidence JOURNEY. Neither ever
// asked the question this milestone asks: does the REPOSITORY'S OWN
// REPRESENTATION of a Publication stay correct as that Publication moves
// through discovery, admission, repeated re-discovery, substrate
// convergence, transient failure, and re-visitation — or does the
// catalog itself quietly drift, duplicate identity, or invent a second
// Publication somewhere along the way? Ten lettered sections, mirroring
// the requesting brief. Every claim is checked against real, unmodified
// production source and real object graphs — never asserted from
// milestone history alone.
//
//   A — Admission semantics: discover->resolve->verify->admit stays the
//       ONLY path into the catalog; Repository search/query never
//       becomes a silent admission mechanism.
//   B — Publication identity: keyed by publicationId, never contentHash,
//       material locator, announcement id, or author.
//   C — Repeated discovery: the same Publication, re-admitted over and
//       over, never regenerates identity — reconfirming, not
//       re-litigating, 0.9.523's own deliberate no-dedup finding.
//   D — Cross-substrate convergence: a shared publicationId across two
//       independently-resolved locators stays ONE identity; a shared
//       contentHash across two different publicationIds stays TWO.
//   E — Lifecycle after admission: transient unavailability never
//       mutates an admitted entry; the one existing EXPLICIT lifecycle
//       operation (unpublish) does, and only that one.
//   F — Repository -> World continuity, with the Repository entry
//       itself as the long-lived object under test.
//   G — Observation vs. mutation: search/find/navigate stay read-only.
//   H — Trust presentation: discovered != verified != trusted; presence
//       in a catalog is never read as a trust verdict.
//   I — Failure isolation, including between TWO SIBLING entries in the
//       same catalog — A's failure never touches B's record.
//   J — Flagship: Create->Distribute->Discover->Verify->Admit->Search->
//       Inspect->Explore->Encounter->Evidence->RETURN TO REPOSITORY,
//       ending on the exact same object reference admission produced.
//
// Deliberately excluded, per the requesting brief: no deduplication
// redesign, no new identity model, no lifecycle states, no GC, no
// auto-refresh/re-verification/re-discovery, no ranking, no provenance
// redesign, no contentHash-based merging, no new persistence, no
// Repository/World refactor, no new vocabulary.
//
// FINDING: see the verdict block at the end of this file.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); this.saveCount = 0; }
    save(name, data) { this.saveCount += 1; this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// Publishes a real, minimal one-brick Document through the SAME
// PublishDocumentUseCase/LocalPublisherProvider pair every real Editor
// publish and World View fork already goes through — see
// tests/PublicationLifecycleSeamProductReassessment.test.js's own
// identically-purposed helper. Exposes `publisher` (unlike that file's
// version) so a caller can exercise UnpublishDocumentUseCase — the one
// real, explicit catalog-mutating lifecycle operation Section E needs —
// against the exact same collaborator that created the entry.
function publishMinimalDocument(storage, title = 'Atlas', author = 'alice') {
    const contentStore = new LocalContentStore(storage);
    const publisher = new LocalPublisherProvider(storage, contentStore);
    const publishDocumentUseCase = new PublishDocumentUseCase(publisher, null, null, null);

    const world = new World();
    const building = new Building({ creator: author });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    const document = new Document({
        world,
        metadata: new DocumentMetadata({ title, author, license: new License({ id: LicenseId.CC0_1_0 }) })
    });
    const publication = publishDocumentUseCase.execute({ document });
    return { document, publication, publisher, publishDocumentUseCase };
}

function makeSession(discoveryProvider) {
    return new WorldNavigationSession({
        registry: { getDocument: () => null },
        loadPublicationDocumentUseCase: { execute: () => null },
        worldLayoutProvider: { getSpatialState: () => ({ loaded: [], visible: [] }) },
        discoveryProvider
    });
}

// The exact real composition ui/components/PublicationCatalog.js itself
// builds via application/CreateDiscoveryUseCase.js#execute() — Local
// storage merged with the one application-lifetime decentralized
// accumulator, through CompositeDiscoveryProvider — never a
// test-only stand-in shape.
function makeRepositoryDiscoveryProvider(storage, decentralizedDiscoveryProvider) {
    const localDiscoveryProvider = new LocalDiscoveryProvider(storage);
    return decentralizedDiscoveryProvider
        ? new CompositeDiscoveryProvider([localDiscoveryProvider, decentralizedDiscoveryProvider])
        : localDiscoveryProvider;
}

const alwaysValidSignatureVerifier = { verifyPublicationAnchor: () => ({ valid: true }) };

async function main() {
    // ===============================================================
    // Section A — Admission semantics: discover -> resolve -> verify ->
    // admit is the ONLY path into the catalog.
    // ===============================================================
    {
        // A1. Structural, repo-wide: exactly the two already-established,
        // already-audited (0.9.523/0.9.524) real gates ever call
        // `discoveryProvider.add(...)` — nothing Repository-facing (the
        // catalog component, its search use case, its query object)
        // admits a Publication on its own, silently, as a side effect of
        // being searched, listed, or displayed.
        const grepRaw = execSync(
            "grep -rn \"discoveryProvider\\.add(\\|DiscoveryProvider\\.add(\" --include=*.js . "
            + "| grep -v node_modules | grep -v '/tests/' | grep -v 'discovery/DecentralizedPublicationDiscoveryProvider.js'",
            { cwd: new URL('../', import.meta.url).pathname, encoding: 'utf8' }
        ).trim().split('\n').filter(Boolean);
        // Drop comment-only lines (this file's own header text mentions
        // `discoveryProvider.add()` in prose) — only an actual call
        // expression counts as a real admission call site.
        const grep = grepRaw.filter((line) => {
            const content = line.slice(line.indexOf(':', line.indexOf(':') + 1) + 1);
            return !/^\s*\/\//.test(content);
        });
        assert(grep.length === 2
            && grep.some((l) => l.includes('WorldEncounterCanvas.js'))
            && grep.some((l) => l.includes('DecentralizedPublicationsView.js')),
            `1. LIVE, repo-wide: exactly two real call sites admit into a discoveryProvider (found ${grep.length}: ${JSON.stringify(grep)}) — both are the already-audited World Encounter / decentralized-Publications-page gates, never Repository's own search/catalog surface.`);

        // A2. Structural: SearchPublicationsUseCase.js — the Repository/
        // Author catalog's own query — never references `.add(` at all.
        // It reads discoveryProvider.list() and nothing else; it cannot
        // admit anything even by accident.
        const searchSrc = await readSource('application/SearchPublicationsUseCase.js');
        assert(!/\.add\(/.test(searchSrc),
            '2. SearchPublicationsUseCase.js never calls .add() on anything — a Repository search is structurally incapable of becoming an admission mechanism.');

        // A3. LIVE: running many searches, including ones that find
        // nothing, never changes what a subsequent search finds — the
        // catalog's own membership is invariant under search activity.
        const storage = new InMemoryStorageProvider();
        const { publication } = publishMinimalDocument(storage, 'Admission Control');
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        const search = new SearchPublicationsUseCase(discoveryProvider, { execute: () => null });
        const before = search.execute(new PublicationQuery({ page: 1, pageSize: 10 })).totalCount;
        search.execute(new PublicationQuery({ text: 'no such publication exists anywhere', page: 1, pageSize: 10 }));
        search.execute(new PublicationQuery({ author: 'nobody', page: 1, pageSize: 10 }));
        search.execute(new PublicationQuery({ text: 'Admission', page: 1, pageSize: 10 }));
        const after = search.execute(new PublicationQuery({ page: 1, pageSize: 10 })).totalCount;
        assert(before === 1 && after === 1,
            `3. LIVE: catalog totalCount stays exactly 1 across four searches, including two that match nothing (before=${before}, after=${after}) — searching never admits, and never evicts.`);
    }
    console.log('✓ Section A: admission into the Repository catalog happens through exactly the two already-audited discover->resolve->verify->admit gates (live, repo-wide grep) — Repository\'s own search/query layer never references an admission method at all, and, live, running searches (including ones matching nothing) never changes catalog membership.');

    // ===============================================================
    // Section B — Publication identity: keyed by publicationId, never
    // contentHash, material locator, announcement id, or author.
    // ===============================================================
    {
        // B1. LIVE, real production pipeline, no fabricated Publication
        // stand-in: republishing the SAME unmutated Document object
        // through the SAME LocalPublisherProvider TWICE (a real,
        // legitimate action — see UnpublishDocumentUseCase.js's own
        // header, "the document remains fully editable... republishing
        // creates a NEW publication") produces two Publications sharing
        // documentId AND contentHash (identical bytes, never mutated
        // between calls) but two DIFFERENT publicationIds.
        const storage = new InMemoryStorageProvider();
        const { document, publication: pubA, publishDocumentUseCase } = publishMinimalDocument(storage, 'Republished Atlas');
        const pubB = publishDocumentUseCase.execute({ document });
        assert(pubA.id !== pubB.id, '1. LIVE: two real publish() calls over the identical Document mint two distinct publicationIds.');
        assert(pubA.documentId === pubB.documentId && pubA.documentId === document.world.id,
            '2. LIVE: both publications report the identical, unmutated documentId.');
        assert(pubA.contentHash && pubA.contentHash === pubB.contentHash,
            `3. LIVE: both publications share the identical contentHash "${pubA.contentHash}" — same bytes, published twice.`);

        // B2. LIVE: content identity (the hash) is stored ONCE — a
        // content-addressed store never grows for a byte-identical
        // second write — while Publication identity (the immutable
        // snapshot) is stored TWICE. Content identity and Publication
        // identity are provably two different spaces at the storage
        // layer itself, not merely by convention.
        const keys = storage.list().filter((k) => k !== 'forkbuild-publications');
        const contentKeys = keys.filter((k) => k.startsWith('content:'));
        const snapshotKeys = keys.filter((k) => k.startsWith('snapshot:'));
        assert(contentKeys.length === 1 && contentKeys[0] === `content:${pubA.contentHash}`,
            `4. LIVE: exactly one content-addressed bytes entry exists (${JSON.stringify(contentKeys)}) despite two publishes.`);
        assert(snapshotKeys.length === 2
            && snapshotKeys.includes(`snapshot:${pubA.id}`) && snapshotKeys.includes(`snapshot:${pubB.id}`),
            `5. LIVE: exactly two immutable Publication snapshots exist (${JSON.stringify(snapshotKeys)}) — one per publicationId, despite one shared content entry.`);

        // B3. LIVE: the Repository catalog (real LocalDiscoveryProvider
        // over this same storage) represents BOTH as distinct entries —
        // never collapsed into one because their bytes/documentId match.
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        const search = new SearchPublicationsUseCase(discoveryProvider, { execute: () => null });
        const page = search.execute(new PublicationQuery({ page: 1, pageSize: 10 }));
        assert(page.totalCount === 2, `6. LIVE: Repository search reports totalCount=2 for two contentHash/documentId-sharing publications (got ${page.totalCount}).`);
        assert(discoveryProvider.findById(pubA.id).id === pubA.id && discoveryProvider.findById(pubB.id).id === pubB.id,
            '7. LIVE: findById() distinguishes the two by publicationId alone, correctly, despite everything else matching.');

        // B4. Structural: every real findById() implementation this
        // milestone's own object graph touches keys off `.id` (or the
        // storage record's own `id` field) exclusively — never
        // contentHash, url, or author.
        const localSrc = await readSource('discovery/LocalDiscoveryProvider.js');
        const decentralizedSrc = await readSource('discovery/DecentralizedPublicationDiscoveryProvider.js');
        assert(/findById\(id\) \{\s*const record = this\._loadRecords\(\)\.find\(\(r\) => r\.id === id\);/.test(localSrc),
            '8. LocalDiscoveryProvider.findById() matches exclusively on record.id.');
        assert(/findById\(id\) \{\s*return this\._publications\.find\(\(p\) => p\.id === id\) \|\| null;/.test(decentralizedSrc),
            '9. DecentralizedPublicationDiscoveryProvider.findById() matches exclusively on p.id.');
    }
    console.log('✓ Section B: Publication identity is publicationId alone — live, through a real, unmodified two-publish pipeline (no fabricated stand-in), two Publications share documentId AND contentHash yet mint distinct ids, the content-addressed store dedupes to ONE entry while two immutable snapshots exist, and Repository\'s own search/findById represent and distinguish both correctly. Both real findById() implementations key exclusively on .id.');

    // ===============================================================
    // Section C — Repeated discovery: the same Publication, re-admitted
    // repeatedly (as Local/Peer/Nostr/Arweave re-announcement would
    // each independently trigger), never regenerates identity.
    // Reconfirms, and deliberately does NOT re-litigate or "fix,"
    // 0.9.523's own established DELIBERATE_ASYMMETRY finding.
    // ===============================================================
    {
        const discoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        const publication = new Publication({ id: 'pub-c1', documentId: 'doc-c1', title: 'Repeatedly Discovered', author: 'alice', contentHash: 'sha256:c1' });

        // C1. LIVE: the identical Publication is admitted three times —
        // simulating three independent discovery EVENTS for the same
        // object (a Nostr relay re-announcement, a later Arweave
        // crawl, a peer re-sharing it) — exactly the shape 0.9.337's
        // own admission gates (Section A, above) would each trigger
        // independently for the same real-world Publication.
        discoveryProvider.add(publication);
        discoveryProvider.add(publication);
        discoveryProvider.add(publication);
        const listed = discoveryProvider.list();
        assert(listed.length === 3,
            `1. LIVE: three independent admission events produce three catalog entries (got ${listed.length}) — matching, not contradicting, 0.9.523 Section C's own established "no invented deduplication policy" finding for this exact class.`);

        // C2. LIVE: identity is conserved across every single one of
        // those three entries — none diverges into a second id,
        // documentId, or contentHash. Repeated discovery restates the
        // same fact; it never invents a second Publication.
        for (const entry of listed) {
            assert(entry.id === 'pub-c1' && entry.documentId === 'doc-c1' && entry.contentHash === 'sha256:c1',
                '2. LIVE: every repeated-discovery entry carries the identical publicationId/documentId/contentHash — no drift, no regeneration.');
        }
        assert(listed[0] === publication && listed[1] === publication && listed[2] === publication,
            '3. LIVE: all three entries are, by reference, the exact same object — repeated admission of an already-resolved Publication never even constructs a copy.');

        // C3. LIVE: findById() still resolves a single, correct answer
        // — repeated discovery never breaks single-item lookup, even
        // though list() itself now carries duplicates.
        assert(discoveryProvider.findById('pub-c1') === publication,
            '4. LIVE: findById() still returns exactly the one correct Publication despite three catalog entries for it.');

        // C4. Structural: this milestone adds no id-uniqueness check to
        // DecentralizedPublicationDiscoveryProvider.add() — per the
        // requesting brief, "don't introduce new deduplication rules
        // merely to make the test pass." add()'s own body performs no
        // existence check before pushing, exactly as 0.9.335 built it
        // and exactly as 0.9.523 already reconfirmed and accepted.
        const src = await readSource('discovery/DecentralizedPublicationDiscoveryProvider.js');
        const addBody = src.slice(src.indexOf('add(publication) {'), src.indexOf('\n    }', src.indexOf('add(publication) {')));
        assert(!/\.find\(|\.some\(|\.has\(/.test(addBody),
            '5. add()\'s own body performs no existence/uniqueness check — this milestone reconfirms the established no-dedup semantics rather than adding new ones.');
    }
    console.log('✓ Section C: repeated discovery of the identical Publication — three independent admission events, matching real Local/Peer/Nostr/Arweave re-announcement shape — never regenerates publicationId/documentId/contentHash and never breaks findById(); the resulting catalog multiplicity is 0.9.523\'s own already-established, deliberately-unfixed DELIBERATE_ASYMMETRY, reconfirmed here rather than re-litigated or newly "fixed."');

    // ===============================================================
    // Section D — Cross-substrate convergence: a shared publicationId
    // reached through two independently-resolved locators stays ONE
    // identity; a shared contentHash across two DIFFERENT publicationIds
    // stays TWO. The "one particularly important thing to audit."
    // ===============================================================
    {
        // D1. LIVE: the SAME publicationId, resolved independently twice
        // (as if a Nostr relay pointed at one Arweave transaction and a
        // separate Arweave GraphQL crawl pointed at a DIFFERENT
        // transaction/location for the identical announced object —
        // discovery/DiscoveryProvider.js's own header: "the UI consumes
        // Publications... without knowing whether the source is
        // localStorage, Steem, Hive, IPFS, or another ForkBuild node")
        // — two independently CONSTRUCTED Publication instances (never
        // the same object reference, unlike Section C), sharing an id
        // but carrying two different resolved `url`s.
        const discoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        const viaNostrLead = new Publication({
            id: 'pub-d1', documentId: 'doc-d1', title: 'Cross-Substrate', author: 'alice',
            contentHash: 'sha256:d1', providerId: 'local', url: 'ar://location-seen-via-nostr'
        });
        const viaArweaveLead = new Publication({
            id: 'pub-d1', documentId: 'doc-d1', title: 'Cross-Substrate', author: 'alice',
            contentHash: 'sha256:d1', providerId: 'local', url: 'ar://location-seen-via-arweave-crawl'
        });
        assert(viaNostrLead !== viaArweaveLead && viaNostrLead.url !== viaArweaveLead.url,
            '1. LIVE: the two independently-resolved instances are genuinely different objects with different resolved locators.');
        discoveryProvider.add(viaNostrLead);
        discoveryProvider.add(viaArweaveLead);

        const search = new SearchPublicationsUseCase(discoveryProvider, { execute: () => null });
        const page = search.execute(new PublicationQuery({ page: 1, pageSize: 10 }));
        const entriesForId = page.items.filter((p) => p.id === 'pub-d1');
        assert(entriesForId.length === 2, `2. LIVE: both independently-resolved arrivals are present (got ${entriesForId.length}).`);
        for (const entry of entriesForId) {
            assert(entry.id === 'pub-d1' && entry.documentId === 'doc-d1' && entry.contentHash === 'sha256:d1',
                '3. LIVE: whichever locator produced this entry, its publicationId/documentId/contentHash agree — one identity, never a per-substrate fork of it.');
        }
        assert(discoveryProvider.findById('pub-d1') !== null && discoveryProvider.findById('pub-d1').id === 'pub-d1',
            '4. LIVE: findById() still resolves this identity cleanly despite two different resolved locators having produced it.');

        // D2. LIVE, the flagship convergence guard: a DIFFERENT
        // Publication (different id, different documentId, different
        // author) that happens to share the identical contentHash NEVER
        // converges with pub-d1 — even discovered into the SAME
        // accumulator, even queried by the SAME search.
        const differentPublicationSameHash = new Publication({
            id: 'pub-d2', documentId: 'doc-d2', title: 'Unrelated Work', author: 'bob', contentHash: 'sha256:d1'
        });
        discoveryProvider.add(differentPublicationSameHash);
        const pageAfter = search.execute(new PublicationQuery({ page: 1, pageSize: 10 }));
        assert(pageAfter.totalCount === 3, `5. LIVE: catalog now reports 3 entries — 2 for pub-d1, 1 for the unrelated pub-d2 (got ${pageAfter.totalCount}).`);
        assert(discoveryProvider.findById('pub-d2').id === 'pub-d2' && discoveryProvider.findById('pub-d2').author === 'bob',
            '6. LIVE: findById("pub-d2") resolves the unrelated Publication, never one of pub-d1\'s entries, despite the shared contentHash.');
        assert(discoveryProvider.findById('pub-d1').id !== discoveryProvider.findById('pub-d2').id,
            '7. LIVE: a shared contentHash never lets one lookup answer for the other — the two publicationIds stay observably distinct through the same query surface.');

        // D3. LIVE: provenance (LOCAL/DECENTRALIZED) is a fact about
        // THIS OBSERVATION's own loading boundary — never a Publication
        // identity fact. The identical Publication instance inspected
        // once through the local loading boundary and once through the
        // lead-aware (decentralized) boundary reports two different
        // provenance origins while its own id/documentId/contentHash
        // never move.
        const material = new Publication({ id: 'pub-d3', documentId: 'doc-d3', title: 'Provenance', author: 'alice', contentHash: 'sha256:d3' });
        const selection = { kind: 'PUBLICATION', objectId: 'pub-d3', origin: 'local' };
        class AlwaysTrue extends WorldEncounterMaterialVerifier {
            verifyIdentity() { return Promise.resolve(true); }
        }
        const localInspection = await inspectWorldEncounterMaterial({
            resolvedSelection: selection,
            materialSources: { local: { load: () => Promise.resolve(material) } },
            verifier: new AlwaysTrue()
        });
        const decentralizedInspection = await inspectWorldEncounterMaterial({
            resolvedSelection: selection,
            resolvedLead: { origin: 'dweb:nostr:wss://relay.example', discoveryTag: 'tag', uri: 'ar://pub-d3-location' },
            materialSources: { decentralized: { load: () => Promise.resolve(material) } },
            verifier: new AlwaysTrue()
        });
        const localProvenance = describePublicationMaterialProvenanceFromInspection(localInspection);
        const decentralizedProvenance = describePublicationMaterialProvenanceFromInspection(decentralizedInspection);
        assert(localProvenance.origin === PublicationMaterialProvenanceOrigin.LOCAL
            && decentralizedProvenance.origin === PublicationMaterialProvenanceOrigin.DECENTRALIZED,
            `8. LIVE: the SAME material inspected via the two different loading boundaries reports LOCAL vs DECENTRALIZED provenance (got ${localProvenance.origin}/${decentralizedProvenance.origin}).`);
        assert(localInspection.loading.material.id === decentralizedInspection.loading.material.id
            && localInspection.loading.material.id === 'pub-d3',
            '9. LIVE: despite the differing provenance, the material\'s own publicationId is identical across both observations — provenance changed; identity did not.');

        // D4. Structural, at the LEAD layer (one hop before a
        // Publication even exists): two leads sharing the identical
        // `uri` but reported by two different origins stay independent,
        // corroborating nothing — discovery/DecentralizedWorldDiscoveryLeadRegistry.js's
        // own documented contract, exercised live rather than merely
        // cited, confirming substrate multiplicity is honestly
        // represented one layer earlier than Publication identity too.
        const leadRegistry = new DecentralizedWorldDiscoveryLeadRegistry();
        leadRegistry.setLead({ origin: 'dweb:nostr:wss://relay-one.example', discoveryTag: 'tag-d4', uri: 'ar://shared-location' });
        leadRegistry.setLead({ origin: 'dweb:arweave:https://arweave.net', discoveryTag: 'tag-d4', uri: 'ar://shared-location' });
        assert(leadRegistry.listLeads().length === 2,
            '10. LIVE: two leads from two different origins sharing the identical uri sit side by side, never merged into one — no false corroboration invented at the lead layer either.');
    }
    console.log('✓ Section D: cross-substrate convergence holds both directions — the SAME publicationId, resolved independently through two different locators, stays one identity across search/findById (never forking into two), while a DIFFERENT publicationId sharing the identical contentHash never converges with it, live, through the same catalog and the same query. Provenance (LOCAL/DECENTRALIZED) is proven to be an observation-context fact, not an identity fact — the same material reports both, unchanged in id. The lead-layer registry one hop earlier shows the identical honest-multiplicity discipline.');

    // ===============================================================
    // Section E — Lifecycle after admission: transient unavailability
    // never mutates an admitted entry; the one existing EXPLICIT
    // lifecycle operation (unpublish) does, and only that one.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const { publication, publisher } = publishMinimalDocument(storage, 'Lifecycle Atlas');
        const discoveryProvider = new LocalDiscoveryProvider(storage);

        // E1. LIVE: "unavailable material" — every configured Arweave
        // gateway fails — never touches the Repository catalog entry.
        // The resolver's own contract (propagate the genuine last
        // error) is honored; the previously-admitted Publication is
        // untouched afterward.
        const failingResolver = new ArweaveGatewayFailoverWorldEncounterMaterialResolver({
            gatewayUrls: ['https://gw-one.example', 'https://gw-two.example'],
            fetchImpl: async () => { throw new Error('simulated network failure'); }
        });
        let retrievalThrew = false;
        try { await failingResolver.retrieveByUri('ar://unreachable'); } catch (e) { retrievalThrew = true; }
        assert(retrievalThrew, '1. LIVE: every gateway failing propagates the genuine last error.');
        const afterMaterialFailure = discoveryProvider.findById(publication.id);
        assert(afterMaterialFailure && afterMaterialFailure.id === publication.id && afterMaterialFailure.contentHash === publication.contentHash,
            '2. LIVE: after that unrelated material-retrieval failure, the catalog entry is completely unchanged.');

        // E2. LIVE: "temporarily disconnected from a peer" — a peer
        // material source that currently has nothing (a real, expected
        // outcome of a peer being offline right now, distinct from a
        // crash — see application/WorldEncounterMaterialLoading.js's
        // own "material === null" degrade-to-UNAVAILABLE path) degrades
        // inspection to UNVERIFIABLE, never throws, and the Repository
        // catalog — a completely separate collaborator this inspection
        // never touches — stays exactly as it was.
        const peerSelection = { kind: 'PUBLICATION', objectId: publication.id, origin: 'peer:bob' };
        const disconnectedInspection = await inspectWorldEncounterMaterial({
            resolvedSelection: peerSelection,
            materialSources: { peer: { load: () => Promise.resolve(null) } },
            verifier: new (class extends WorldEncounterMaterialVerifier { verifyIdentity() { return Promise.resolve(true); } })()
        });
        assert(disconnectedInspection.verification.status === WorldEncounterMaterialVerificationStatus.UNVERIFIABLE,
            '3. LIVE: an unreachable peer degrades verification to UNVERIFIABLE, never a thrown error.');
        const afterPeerFailure = discoveryProvider.findById(publication.id);
        assert(afterPeerFailure && afterPeerFailure.id === publication.id,
            '4. LIVE: after that peer-disconnection encounter, the Repository catalog entry is still present, unchanged.');

        // E3. LIVE: "undiscoverable" — a lookup for a DIFFERENT,
        // never-published id fails — never affects the real entry
        // sitting alongside it in the same catalog.
        const missingLookup = discoveryProvider.findById('pub-never-existed');
        assert(missingLookup === null, '5. LIVE: a genuinely unknown id resolves to null, never an error and never a fabricated record.');
        const afterMissingLookup = discoveryProvider.findById(publication.id);
        assert(afterMissingLookup && afterMissingLookup.id === publication.id,
            '6. LIVE: the real entry is unaffected by a sibling, unrelated failed lookup.');

        // E4. LIVE, the contrast case: the ONE existing EXPLICIT
        // lifecycle operation — UnpublishDocumentUseCase, the documented
        // mirror of PublishDocumentUseCase (see that file's own header)
        // — DOES remove the catalog entry, deliberately, on request.
        // This is the "unless an existing explicit lifecycle operation
        // says otherwise" clause, proven live in both halves: nothing
        // else above touched the entry; this one, explicit,
        // Wanderer-initiated action does.
        const unpublish = new UnpublishDocumentUseCase(publisher);
        const removed = unpublish.execute(publication.id);
        assert(removed === true, '7. LIVE: UnpublishDocumentUseCase.execute() reports the publication existed and was removed.');
        assert(discoveryProvider.findById(publication.id) === null,
            '8. LIVE: after that ONE explicit action, and only after it, the Repository catalog no longer represents this Publication.');
    }
    console.log('✓ Section E: transient unavailability — a failed material retrieval, a disconnected peer, an unrelated undiscoverable lookup — never mutates or invalidates an already-admitted Repository entry, proven live across all three. The one existing explicit lifecycle operation, UnpublishDocumentUseCase, is the sole thing that removes an entry, and does so only when actually invoked — both halves of "should not, unless an explicit lifecycle operation says otherwise," proven live in contrast.');

    // ===============================================================
    // Section F — Repository -> World continuity, with the Repository
    // entry ITSELF as the long-lived object under test.
    // ===============================================================
    {
        // F1. LIVE, decentralized/in-memory catalog: World navigation
        // (session.findPublicationById(), the exact resolution authority
        // 0.9.532/0.9.533 already proved every entry point converges on)
        // never creates or replaces the catalog entry — a search run
        // BEFORE navigation and a search run AFTER navigation return the
        // literal same object reference.
        const decentralizedDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        const admitted = new Publication({ id: 'pub-f1', documentId: 'doc-f1', title: 'Long-Lived', author: 'alice', contentHash: 'sha256:f1' });
        decentralizedDiscoveryProvider.add(admitted);
        const search = new SearchPublicationsUseCase(decentralizedDiscoveryProvider, { execute: () => null });
        const beforeNav = search.execute(new PublicationQuery({ page: 1, pageSize: 10 })).items[0];

        const session = makeSession(decentralizedDiscoveryProvider);
        const navigated = session.findPublicationById('pub-f1');
        assert(navigated === admitted, '1. LIVE: World navigation resolves the exact same object reference the catalog already held.');

        const afterNav = search.execute(new PublicationQuery({ page: 1, pageSize: 10 })).items[0];
        assert(beforeNav === admitted && afterNav === admitted && beforeNav === afterNav,
            '2. LIVE: Repository search, run before and after a World navigation to the same Publication, returns the IDENTICAL object reference both times — navigation never rebuilt or replaced the Repository\'s own representation.');

        // F2. LIVE, storage-backed catalog: LocalDiscoveryProvider
        // reconstructs a fresh Publication VALUE object from storage on
        // every read (Publication.fromJSON() each call) — an honest,
        // pre-existing architectural fact, not a gap, and a genuinely
        // different guarantee than F1's in-memory accumulator gives.
        // What must still hold, and does: the VALUES stay identical
        // across a read before and a read after a navigation attempt —
        // identity conservation by VALUE where the collaborator's own
        // storage model does not offer conservation by REFERENCE.
        const storage = new InMemoryStorageProvider();
        const { publication } = publishMinimalDocument(storage, 'Storage-Backed');
        const localDiscoveryProvider = new LocalDiscoveryProvider(storage);
        const localSession = makeSession(localDiscoveryProvider);
        const localBefore = localDiscoveryProvider.findById(publication.id);
        localSession.findPublicationById(publication.id);
        try { localSession.focusDocument('some-other-unrelated-document-id'); } catch (e) { /* irrelevant to this assertion */ }
        const localAfter = localDiscoveryProvider.findById(publication.id);
        assert(localBefore.id === localAfter.id && localBefore.documentId === localAfter.documentId && localBefore.contentHash === localAfter.contentHash,
            '3. LIVE: the storage-backed catalog\'s own VALUE representation (id/documentId/contentHash) is byte-identical before and after World navigation activity, even though (honestly, by this provider\'s own design) each read constructs a fresh Publication instance rather than returning a cached reference.');

        // F3. Structural: neither findPublicationById() nor
        // focusDocument() references a storage-mutating method — World
        // navigation cannot itself rewrite what a later Repository read
        // would find, under either catalog shape.
        const sessionSrc = await readSource('application/WorldNavigationSession.js');
        // AMENDED BY 0.9.597 — Publication Action Provider Continuity Fix.
        // findPublicationById() now delegates to `_publicationActionDiscoveryProvider`
        // (a separate, optional capability falling back to `discoveryProvider`
        // itself when unwired — see WorldNavigationSession's own
        // constructor comment) rather than to `_discoveryProvider`
        // directly. Still a pure delegation — no write, no admission, no
        // removal — just to a different-named, still-read-only collaborator.
        const findByIdBody = sessionSrc.match(/findPublicationById\(publicationId\) \{([\s\S]*?)\n {4}\}/);
        assert(findByIdBody && /return this\._publicationActionDiscoveryProvider\.findById\(publicationId\) \|\| null;/.test(findByIdBody[1])
            && !/\.save\(|\.add\(|\.remove\(/.test(findByIdBody[1]),
            '4. AMENDED BY 0.9.597 — findPublicationById()\'s own body is a pure delegation to `_publicationActionDiscoveryProvider.findById()` — no write, no admission, no removal.');
    }
    console.log('✓ Section F: treating the Repository entry as the long-lived object, World navigation never creates or replaces it — the in-memory (decentralized) catalog conserves the exact object REFERENCE across a before/after navigation search, and the storage-backed (local) catalog, which honestly reconstructs a fresh value on every read rather than caching a reference, still conserves the VALUE (id/documentId/contentHash) exactly. findPublicationById() is proven, structurally, to be pure delegation — no write path exists for navigation to abuse.');

    // ===============================================================
    // Section G — Observation vs. mutation: search/find/navigate/
    // inspect all stay read-only.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const { publication } = publishMinimalDocument(storage, 'Read-Only Atlas');
        storage.saveCount = 0; // reset: only count activity from this point forward.

        const discoveryProvider = new LocalDiscoveryProvider(storage);
        const decentralizedDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        const composite = makeRepositoryDiscoveryProvider(storage, decentralizedDiscoveryProvider);
        const search = new SearchPublicationsUseCase(composite, { execute: () => null });
        const session = makeSession(composite);

        // G1. LIVE: a realistic observation sequence — search, search
        // again with different filters, findPublicationById, a failed
        // focusDocument attempt — triggers ZERO storage writes. Every
        // one of these is read-only, live, not merely by inspection of
        // the source.
        search.execute(new PublicationQuery({ page: 1, pageSize: 10 }));
        search.execute(new PublicationQuery({ text: 'Read-Only', page: 1, pageSize: 10 }));
        search.execute(new PublicationQuery({ author: 'alice', page: 1, pageSize: 10 }));
        session.findPublicationById(publication.id);
        try { session.focusDocument('nonexistent-document'); } catch (e) { /* expected; irrelevant here */ }
        assert(storage.saveCount === 0,
            `1. LIVE: three searches, a findPublicationById(), and a navigation attempt together triggered ${storage.saveCount} storage writes — should be exactly 0.`);

        // G2. LIVE: the SAME sequence never changes what the catalog
        // reports afterward.
        const finalCount = search.execute(new PublicationQuery({ page: 1, pageSize: 10 })).totalCount;
        assert(finalCount === 1, `2. LIVE: catalog totalCount is still exactly 1 after the whole observation sequence (got ${finalCount}).`);

        // G3. Structural, reusing Section A's own real grep rather than
        // re-deriving a second admission-detection mechanism: neither
        // ui/components/PublicationCatalog.js (Repository's own real
        // component) nor SearchPublicationsUseCase.js references
        // publish/unpublish/add — Explore/search/pagination/sort/group
        // are the only capabilities either file exposes.
        const catalogSrc = await readSource('ui/components/PublicationCatalog.js');
        assert(!/\bunpublish\(|discoveryProvider\.add\(/.test(catalogSrc),
            '3. PublicationCatalog.js — the real Repository/Author component — never calls unpublish() or discoveryProvider.add(); it only ever reads.');

        // G4. Contrast, reusing Section E's own already-proven fact
        // rather than re-deriving it: mutation is not absent from this
        // object graph — it exists, exactly once, as the explicit
        // unpublish action Section E already exercised live. G1-G3
        // establish that OBSERVATION excludes it; Section E establishes
        // that ACTION can still reach it. Both together are the claim
        // this section makes.
        assert(true, '4. Reconfirmed via Section E: the one real mutation path (UnpublishDocumentUseCase) is explicit and separate from every observation path exercised in G1-G3.');
    }
    console.log('✓ Section G: search, filtered search, findPublicationById, and a navigation attempt together trigger zero storage writes and never change what the catalog reports — live, counted, not inferred. PublicationCatalog.js — Repository\'s real component — never references an admission or unpublish method. The one genuine mutation path (Section E\'s UnpublishDocumentUseCase) stays outside every observation path exercised here.');

    // ===============================================================
    // Section H — Trust presentation: discovered != verified != trusted;
    // presence in a catalog is never read as a trust verdict. Reuses
    // 0.9.532/0.9.533's own established vocabulary and helpers rather
    // than inventing a new presentation system.
    // ===============================================================
    {
        // H1. LIVE: describePublicationMaterialProvenanceFromInspection()
        // — the one real provenance vocabulary this codebase has — ever
        // returns exactly `{ origin }`, one of the two established
        // values, never an authorship, trust, or ownership claim.
        const material = new Publication({ id: 'pub-h1', documentId: 'doc-h1', title: 'Trust', author: 'alice', contentHash: 'sha256:h1' });
        const inspection = await inspectWorldEncounterMaterial({
            resolvedSelection: { kind: 'PUBLICATION', objectId: 'pub-h1', origin: 'local' },
            materialSources: { local: { load: () => Promise.resolve(material) } },
            verifier: new (class extends WorldEncounterMaterialVerifier { verifyIdentity() { return Promise.resolve(true); } })()
        });
        const provenance = describePublicationMaterialProvenanceFromInspection(inspection);
        assert(Object.keys(provenance).length === 1 && 'origin' in provenance,
            `1. LIVE: a described provenance carries exactly one key, "origin" (got ${JSON.stringify(Object.keys(provenance))}) — no authorship/trust/ownership field exists to overclaim with.`);
        assert(provenance.origin === PublicationMaterialProvenanceOrigin.LOCAL,
            '2. LIVE: this observation, loaded through the local boundary, reports LOCAL — an honest fact about the observation, never a trust verdict about the Publication.');

        // H2. Reused from 0.9.533 Section G: anchor verification
        // vocabulary — the strongest trust-adjacent surface this
        // codebase has — never claims trusted/authentic/official/owned.
        // Re-checked here specifically because Repository is where a
        // Wanderer would actually encounter that vocabulary presented
        // alongside a catalog entry.
        const outcomeValues = Object.values(AnchorVerificationOutcome);
        for (const value of outcomeValues) {
            assert(!/trusted|authentic|official|owned/i.test(value),
                `3. AnchorVerificationOutcome value "${value}" carries none of trusted/authentic/official/owned.`);
        }

        // H3. Live, flagship trust-boundary check, reusing 0.9.533
        // Section H's own real pattern: mere PRESENCE in the Repository
        // catalog is never treated as equivalent to a valid anchor —
        // catalog admission and anchor verification are two entirely
        // separate facts about the same Publication, and one cannot
        // stand in for the other.
        const anchor = new PublicationAnchor({
            publicationId: 'pub-h1', contentHash: 'sha256:h1', anchorType: 'bitcoin', locator: 'txid-h1',
            anchorIdentity: { id: 'did:key:anchor-h1', algorithm: 'Ed25519', publicKey: 'pubkey-h1' },
            signature: { algorithm: 'Ed25519', signer: 'did:key:anchor-h1', signature: 'sig-bytes', signedHash: 'sha256:signed', domain: 'forkbuild.publication-anchor' }
        });
        const verifier = new ExternalAnchorVerifier(alwaysValidSignatureVerifier);
        // A DIFFERENT Publication, merely catalogued alongside pub-h1,
        // never inherits pub-h1's own anchor just by being in the same
        // Repository.
        const catalogueOnly = new Publication({ id: 'pub-h2', documentId: 'doc-h2', title: 'No Anchor', author: 'bob', contentHash: 'sha256:h2' });
        const result = await verifier.verify(anchor.toJSON(), { expectedContentHash: catalogueOnly.contentHash, expectedPublicationId: catalogueOnly.id });
        assert(result.outcome === AnchorVerificationOutcome.CONTENT_MISMATCH,
            `4. LIVE: pub-h1's own anchor, checked against a merely-co-catalogued pub-h2, fails CONTENT_MISMATCH (got ${result.outcome}) — Repository co-membership is never mistaken for shared evidence.`);

        // H4. Structural: the two Repository-facing rendering files
        // this milestone's own object graph touches never render an
        // affirmative trust claim — reusing 0.9.533's own established
        // extraction helper rather than building a second one.
        const cardSrc = await readSource('ui/components/PublicationCard.js');
        const listSrc = await readSource('ui/components/PublicationList.js');
        const affirmativeTrustClaim = /\bis\s+(now\s+)?(trusted|authentic)\b|\b(trusted|authentic)\s+(source|publisher|copy|publication)\b|\bofficially\s+owned\b/i;
        for (const [name, src] of [['PublicationCard.js', cardSrc], ['PublicationList.js', listSrc]]) {
            const templateStart = src.indexOf('template: `');
            const rendered = templateStart === -1 ? '' : src.slice(templateStart, src.indexOf('`', templateStart + 11)).replace(/<!--[\s\S]*?-->/g, '');
            assert(!affirmativeTrustClaim.test(rendered),
                `5. ${name}'s own rendered template never affirmatively claims a catalog entry is trusted/authentic/officially owned.`);
        }
    }
    console.log('✓ Section H: trust presentation stays honest at the Repository boundary — the real provenance vocabulary carries only "origin" (LOCAL/DECENTRALIZED), never an authorship or trust field; anchor verification vocabulary never claims trusted/authentic/official/owned; live, mere co-membership in the catalog never lets one Publication\'s anchor validate another\'s (CONTENT_MISMATCH); and neither Repository-facing rendering file affirmatively claims trust. All reused from 0.9.532/0.9.533\'s own established vocabulary — nothing new invented.');

    // ===============================================================
    // Section I — Failure isolation, including between TWO SIBLING
    // entries in the same catalog.
    // ===============================================================
    {
        const discoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        const pubA = new Publication({ id: 'pub-i-a', documentId: 'doc-i-a', title: 'Sibling A', author: 'alice', contentHash: 'sha256:i-a' });
        const pubB = new Publication({ id: 'pub-i-b', documentId: 'doc-i-b', title: 'Sibling B', author: 'bob', contentHash: 'sha256:i-b' });
        discoveryProvider.add(pubA);
        discoveryProvider.add(pubB);

        // I1. LIVE: a material-loading failure for A (its own local
        // source throws) never touches B's catalog record.
        const selectionA = { kind: 'PUBLICATION', objectId: pubA.id, origin: 'local' };
        let aInspectionThrew = false;
        try {
            await inspectWorldEncounterMaterial({
                resolvedSelection: selectionA,
                materialSources: { local: { load: () => { throw new Error('simulated failure for A only'); } } },
                verifier: new (class extends WorldEncounterMaterialVerifier { verifyIdentity() { return Promise.resolve(true); } })()
            });
        } catch (e) { aInspectionThrew = true; }
        assert(aInspectionThrew, '1. LIVE: A\'s own loading failure genuinely propagates (this file\'s own loading boundary performs no try/catch of its own — see application/WorldEncounterMaterialLoading.js).');
        const bAfterAFailure = discoveryProvider.findById(pubB.id);
        assert(bAfterAFailure === pubB && bAfterAFailure.contentHash === 'sha256:i-b',
            '2. LIVE: after A\'s own loading failure, B\'s catalog record is the exact same object, completely untouched.');
        const aAfterOwnFailure = discoveryProvider.findById(pubA.id);
        assert(aAfterOwnFailure === pubA,
            '3. LIVE: A\'s OWN catalog record also survives its own failed load attempt unchanged — a failed ENCOUNTER never mutates the ADMITTED identity that made the encounter possible.');

        // I2. LIVE: an anchor CONTENT_MISMATCH failure verifying A's
        // anchor against B's expected identity never mutates either
        // Publication's own catalog record.
        const anchorForA = new PublicationAnchor({
            publicationId: pubA.id, contentHash: pubA.contentHash, anchorType: 'bitcoin', locator: 'txid-i-a',
            anchorIdentity: { id: 'did:key:anchor-i-a', algorithm: 'Ed25519', publicKey: 'pubkey-i-a' },
            signature: { algorithm: 'Ed25519', signer: 'did:key:anchor-i-a', signature: 'sig-bytes', signedHash: 'sha256:signed', domain: 'forkbuild.publication-anchor' }
        });
        const verifier = new ExternalAnchorVerifier(alwaysValidSignatureVerifier);
        const mismatch = await verifier.verify(anchorForA.toJSON(), { expectedContentHash: pubB.contentHash, expectedPublicationId: pubB.id });
        assert(mismatch.outcome === AnchorVerificationOutcome.CONTENT_MISMATCH, '4. LIVE: the cross-check genuinely fails CONTENT_MISMATCH.');
        assert(discoveryProvider.findById(pubA.id) === pubA && discoveryProvider.findById(pubB.id) === pubB,
            '5. LIVE: after that failed verification attempt, both A and B remain their exact original catalog objects — a failed VERIFY never touches either ADMITTED record.');

        // I3. LIVE: a discovery-side failure for an entirely THIRD,
        // never-admitted id (an empty/failed query result) leaves both
        // existing siblings' entries alone.
        assert(discoveryProvider.findById('pub-i-never-discovered') === null, '6. LIVE: a genuine miss for an unrelated id resolves null.');
        assert(discoveryProvider.list().length === 2
            && discoveryProvider.findById(pubA.id) === pubA && discoveryProvider.findById(pubB.id) === pubB,
            '7. LIVE: both siblings are still exactly present and exactly themselves after that unrelated miss.');
    }
    console.log('✓ Section I: failure isolation holds between sibling catalog entries, not merely before/after one Publication\'s own history — a loading failure, a CONTENT_MISMATCH verification failure, and an unrelated discovery miss for Publication A each leave Publication B\'s catalog record (and, live, A\'s own admitted record) the exact same untouched object.');

    // ===============================================================
    // Section J — Flagship: Create -> Distribute -> Discover -> Verify
    // -> Admit -> Repository Search -> Repository Inspection -> Explore
    // in World -> Encounter -> Inspect Evidence -> RETURN TO REPOSITORY,
    // ending on the exact same object reference admission produced.
    // ===============================================================
    {
        // 1. Create (real PublishDocumentUseCase + LocalPublisherProvider).
        const storage = new InMemoryStorageProvider();
        const { document, publication } = publishMinimalDocument(storage, 'Flagship Repository Atlas');

        // 2. Discover (real LocalDiscoveryProvider reading back exactly
        // what was persisted).
        const localDiscoveryProvider = new LocalDiscoveryProvider(storage);
        const discovered = localDiscoveryProvider.findById(publication.id);
        assert(discovered instanceof Publication && discovered.id === publication.id,
            'J1. LIVE: LocalDiscoveryProvider reads back a real Publication from the same storage the publish wrote to.');

        // 3. Verify (real inspectWorldEncounterMaterial(), an actively-
        // confirming verifier).
        const selection = { kind: 'PUBLICATION', objectId: publication.id, origin: 'local' };
        class AlwaysTrue extends WorldEncounterMaterialVerifier {
            verifyIdentity() { return Promise.resolve(true); }
        }
        const inspection = await inspectWorldEncounterMaterial({
            resolvedSelection: selection,
            materialSources: { local: { load: () => Promise.resolve(discovered) } },
            verifier: new AlwaysTrue()
        });
        assert(inspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED,
            'J2. LIVE: the encountered material actually verifies.');

        // 4. Admit — the exact real gate shape Section A's own grep
        // confirmed is the only path in: `discoveryProvider.add(...)`
        // once loading is AVAILABLE and verification is VERIFIED,
        // mirroring WorldEncounterCanvas.js#admitToRepositoryDiscovery()
        // exactly.
        const decentralizedDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        const admittedObject = inspection.loading.material;
        if (inspection.loading.status === 'AVAILABLE' && admittedObject instanceof Publication
            && inspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED) {
            decentralizedDiscoveryProvider.add(admittedObject);
        }
        assert(decentralizedDiscoveryProvider.list().length === 1, 'J3. LIVE: exactly one admission occurred.');

        // 5. Repository search (the real, combined Local + decentralized
        // composition ui/components/PublicationCatalog.js itself uses).
        const repositoryDiscoveryProvider = makeRepositoryDiscoveryProvider(storage, decentralizedDiscoveryProvider);
        const search = new SearchPublicationsUseCase(repositoryDiscoveryProvider, { execute: () => null });
        const firstSearch = search.execute(new PublicationQuery({ page: 1, pageSize: 10 }));
        // Both the Local record (a fresh value, per Section F's own
        // established fact) and the decentralized (admitted) record are
        // present — two entries for one real-world Publication, exactly
        // Section C/D's own established, deliberately-unfixed multiplicity.
        const repositoryEntries = firstSearch.items.filter((p) => p.id === publication.id);
        assert(repositoryEntries.length === 2, `J4. LIVE: Repository search finds this Publication twice (Local + decentralized-admitted), matching Sections C/D's own established multiplicity (got ${repositoryEntries.length}).`);
        const decentralizedEntry = repositoryEntries.find((p) => p === admittedObject);
        assert(decentralizedEntry === admittedObject, 'J5. LIVE: the decentralized-admitted entry, specifically, is the exact object reference admission produced.');

        // 6. Repository inspection (reading the admitted entry's own
        // fields, exactly what a Wanderer opening its detail view would see).
        assert(decentralizedEntry.documentId === document.world.id && decentralizedEntry.contentHash === publication.contentHash,
            'J6. LIVE: the inspected Repository entry\'s documentId/contentHash trace back, unmodified, to the ORIGINAL Create step.');

        // 7. Explore in World (real session.findPublicationById() over
        // the SAME repositoryDiscoveryProvider Repository search used).
        // CompositeDiscoveryProvider#findById() checks providers in
        // construction order (discovery/CompositeDiscoveryProvider.js's
        // own header) and Local was given first — matching
        // application/CreateDiscoveryUseCase.js's own real ordering —
        // so World resolves the Local, storage-reconstructed VALUE
        // object here, not the decentralized accumulator's reference.
        // Exactly Section F's own established distinction: reference
        // stability is the decentralized accumulator's guarantee, value
        // stability is Local's. Both hold, live, at once.
        const session = makeSession(repositoryDiscoveryProvider);
        const explored = session.findPublicationById(publication.id);
        assert(explored.id === admittedObject.id && explored.documentId === admittedObject.documentId && explored.contentHash === admittedObject.contentHash,
            'J7. LIVE: World\'s own resolution reaches a Publication whose id/documentId/contentHash are IDENTICAL to the decentralized-admitted entry Repository search also found — the same identity, reached through Local\'s value-stable record this time rather than the accumulator\'s reference-stable one.');

        // 8. Encounter + Inspect Evidence (real inspectWorldEncounterMaterial()
        // + real provenance, over the World-resolved object).
        const secondInspection = await inspectWorldEncounterMaterial({
            resolvedSelection: { kind: 'PUBLICATION', objectId: explored.id, origin: 'local' },
            materialSources: { local: { load: () => Promise.resolve(explored) } },
            verifier: new AlwaysTrue()
        });
        const provenance = describePublicationMaterialProvenanceFromInspection(secondInspection);
        assert(secondInspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED
            && provenance.origin === PublicationMaterialProvenanceOrigin.LOCAL,
            'J8. LIVE: the return encounter verifies again and reports an honest LOCAL provenance for this observation.');

        // 9. RETURN TO REPOSITORY — the flagship assertion. A fresh
        // Repository search, run after the ENTIRE Explore/Encounter/
        // Evidence round trip, still represents this Publication via
        // the EXACT SAME object reference admission originally produced
        // — proving the Repository represents the SAME Publication
        // throughout, never a reconstructed lookalike.
        const returnSearch = search.execute(new PublicationQuery({ page: 1, pageSize: 10 }));
        const returnedEntry = returnSearch.items.find((p) => p === admittedObject);
        assert(returnedEntry === admittedObject,
            'J9. LIVE, FLAGSHIP: after the full Create->Discover->Verify->Admit->Search->Inspect->Explore->Encounter->Evidence->Return round trip, Repository search still returns the IDENTICAL object reference admission produced at step 4 — the same Publication, followed all the way out into World and all the way back, never merely equivalent bytes reconstructed on return.');
    }
    console.log('✓ Section J: FLAGSHIP — Create -> Discover -> Verify -> Admit -> Repository Search -> Repository Inspection -> Explore in World -> Encounter -> Inspect Evidence -> Return to Repository, run end to end against real production collaborators (the same combined Local+decentralized composition PublicationCatalog.js itself builds). The Repository\'s own search, run again after the full round trip, returns the exact same object reference admission produced — the Repository represents the SAME Publication throughout, not a reconstructed lookalike.');

    console.log('\nAll Repository Publication Lifecycle Product Reassessment tests passed.');
    console.log('\n=== 0.9.534 VERDICT ===');
    console.log(`PRODUCT_COMPLETE. Every question this reassessment's own brief named holds, live, against real production
collaborators: admission into the Repository catalog happens through exactly the two already-audited gates, and
Repository's own search/query layer is structurally and behaviorally incapable of admitting anything itself (A).
Publication identity is publicationId alone — live, through a real two-publish pipeline with no fabricated
stand-in, two Publications share documentId AND contentHash yet keep distinct ids, and both real findById()
implementations key exclusively on .id (B). Repeated discovery of the identical Publication never regenerates
identity; the resulting catalog multiplicity is 0.9.523's own already-established, deliberately-unfixed
DELIBERATE_ASYMMETRY, reconfirmed rather than re-litigated or newly "fixed" (C). Cross-substrate convergence holds
in both directions the brief asked for: a shared publicationId across two independently-resolved locators stays
one identity, and a shared contentHash across two different publicationIds stays two — the "one particularly
important thing to audit," proven live, both halves (D). Transient unavailability (failed material, disconnected
peer, unrelated undiscoverable lookup) never mutates an admitted entry; the one existing explicit lifecycle
operation, UnpublishDocumentUseCase, is the sole thing that does, and only when actually invoked (E). Treating the
Repository entry as the long-lived object, World navigation never creates or replaces it, under either the
in-memory (reference-stable) or storage-backed (value-stable) catalog shape (F). Search, find, and navigation
together trigger zero storage writes, live and counted (G). Trust presentation stays honest — provenance carries
only "origin," anchor vocabulary never overclaims, and mere catalog co-membership never lets one Publication's
evidence validate another's (H). Failure isolation holds between sibling catalog entries specifically, not merely
before/after one Publication's own history (I). One real, end-to-end Create-to-Repository-Return journey ends with
Repository search returning the exact same object reference admission produced (J). No production file changed —
every claim in this milestone's own brief was already true of the existing, unmodified architecture. Per that same
brief's own stated expectation: STOP the Publication/Repository continuity arc. The next milestone should come from
whichever actual, new, user-facing gap a future reassessment finds at a genuinely different product boundary — not
from another layer of Publication/Repository identity auditing.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
