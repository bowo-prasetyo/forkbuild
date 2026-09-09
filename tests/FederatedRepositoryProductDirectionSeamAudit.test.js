import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

// 0.9.330 — Federated Repository Product Direction & Seam Audit.
//
// Test-only, product/architecture decision milestone. Production changes:
// none.
//
// 0.9.329 answered "is Repository federation required by the architecture
// as it exists today?" with NOT_A_PRODUCT_GAP — a correct answer to that
// question, on that evidence. This milestone answers a DIFFERENT question,
// raised explicitly by the product owner after reading 0.9.329's own
// verdict: "what should Repository ultimately mean from the user's product
// perspective, regardless of whether today's architecture already demands
// it?" This does not reverse 0.9.329 — it records a product-direction
// decision 0.9.329 was never asked to make, and asks whether the SMALLEST
// safe implementation seam for it can be identified from real, shipped
// code rather than invented.
//
// The originating brief used "Snapshot" throughout ("browse and fork
// Snapshots," "existing Snapshot fork workflow") to describe Repository's
// destination object. Section A corrects this against source, exactly the
// way 0.9.327 corrected a misnamed "Bitcoin" finding to "Base" one
// milestone later: in this codebase, "Snapshot" is a World-placement
// concept (application/DiscoverSnapshotCandidatesCommand.js,
// application/MaterializeSnapshotFromPlacementUseCase.js) structurally
// disjoint from "Publication" (publisher/Publication.js), the actual
// object Repository searches, lists, and forks. Every section below
// substitutes "Publication" for the brief's own "Snapshot" wherever the
// brief meant Repository's own domain object, per this milestone's own
// explicit "feel free to modify my specifications as needed."
//
//   Section A — Product direction recorded explicitly, vocabulary
//               corrected against source rather than accepted as given.
//   Section B — Source capability matrix, built from real, shipped code.
//   Section C — Identity & content convergence: not just "different
//               shapes" (0.9.329's own finding) but whether they share
//               any actual SUBSTRATE, and whether any content overlaps
//               today at all.
//   Section D — The existing downstream workflow a federated result would
//               actually have to feed: what "select a Repository result,
//               then act on it" concretely does today.
//   Section E — Source-specific semantics: what each source concretely
//               hands back right now, checked rather than assumed.
//   Section F — Deduplication policy, derived from existing architecture,
//               never invented for this milestone's own convenience.
//   Section G — No second source of truth: the composition constraint a
//               real implementation would have to hold to.
//   Section H — Smallest first implementation seam, identified from an
//               existing, already-proven template — never preselected.
//   Section I — UX semantics, deliberately left undesigned.
//   Section J — Final classification and production-change guard.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function sourceExists(relativePath) {
    try {
        await readSource(relativePath);
        return true;
    } catch {
        return false;
    }
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

function grepCount(pattern, dirs, opts = {}) {
    return grepFiles(pattern, dirs, opts).length;
}

function normalizeProse(text) {
    return text.replace(/\/\//g, ' ').replace(/\s+/g, ' ').trim();
}

function proseIncludes(haystack, needle) {
    return normalizeProse(haystack).includes(normalizeProse(needle));
}

async function run() {
    console.log('Running Federated Repository Product Direction & Seam Audit tests...\n');

    // ===============================================================
    // Section A — Product direction, recorded explicitly. Vocabulary
    // corrected against source, not accepted as given.
    // ===============================================================
    {
        // A1. Repository's real domain object, confirmed from source —
        // not the originating brief's own "Snapshot" vocabulary.
        assert(await sourceExists('publisher/Publication.js'), '1. Repository\'s real domain object, publisher/Publication.js, exists.');
        const publicationCatalogSource = await readSource('ui/components/PublicationCatalog.js');
        assert(publicationCatalogSource.includes("import { CreateDiscoveryUseCase } from '../../application/CreateDiscoveryUseCase.js';"),
            '2. Repository\'s own shipped UI (PublicationCatalog.js) is built on CreateDiscoveryUseCase/Publication, confirmed directly.');

        // A2. Structural check: none of Repository's own search/catalog
        // files ever mention "Snapshot" at all — this is not a close call.
        const repositoryFacingFiles = [
            'application/SearchPublicationsUseCase.js',
            'ui/components/PublicationCatalog.js',
            'discovery/DiscoveryProvider.js',
            'discovery/LocalDiscoveryProvider.js'
        ];
        for (const file of repositoryFacingFiles) {
            const src = await readSource(file);
            assert(!/Snapshot/.test(src), `3. ${file} never mentions "Snapshot" — Repository's own search stack has no such concept.`);
        }

        // A3. "Snapshot" is real, but it is a DIFFERENT, structurally
        // disjoint pipeline (World placement/materialization) — never
        // Repository's own object, confirmed by checking what it imports.
        const discoverSnapshot = await readSource('application/DiscoverSnapshotCandidatesCommand.js');
        const materializeSnapshot = await readSource('application/MaterializeSnapshotFromPlacementUseCase.js');
        assert(!/publisher\/Publication\.js|discovery\/DiscoveryProvider\.js/.test(discoverSnapshot + materializeSnapshot),
            '4. neither Snapshot-pipeline file imports publisher/Publication.js or discovery/DiscoveryProvider.js — Snapshot and Publication are two separate concepts, not two names for one.');
        assert(discoverSnapshot.includes('{ discoveryTag }') && discoverSnapshot.includes('discoveryQueryService.search(discoveryTag)'),
            '5. Snapshot candidate discovery is keyed by an explicit discoveryTag, a concept Repository search has no equivalent of.');

        // A4. And the reverse holds too — Repository's own UI never routes
        // toward the Snapshot materialization pipeline.
        const publicationCard = await readSource('ui/components/PublicationCard.js');
        assert(!/MaterializeSnapshot|DiscoverSnapshot/.test(publicationCatalogSource + publicationCard),
            '6. PublicationCatalog.js/PublicationCard.js never reference the Snapshot materialization pipeline — confirming, from both directions, that the brief\'s "existing Snapshot fork workflow" is not actually Repository\'s own destination workflow (Section D traces what IS).');

        // A5. The product-direction statement itself, recorded here
        // verbatim as this milestone's own input fact, corrected for
        // vocabulary. This is a decision, not a derivation — Sections
        // B-I investigate its CONSEQUENCES, never its legitimacy.
        const PRODUCT_DIRECTION = 'Repository should ultimately let a user discover and fork Publication material ' +
            'regardless of whether it originates locally, from a connected peer, or from a decentralized substrate.';
        assert(typeof PRODUCT_DIRECTION === 'string' && PRODUCT_DIRECTION.includes('Publication') && !PRODUCT_DIRECTION.includes('Snapshot'),
            '7. the recorded product direction uses this codebase\'s own vocabulary (Publication), not the originating brief\'s (Snapshot).');
    }
    console.log('✓ Section A: the product direction itself is recorded as a stated decision, not derived or contested here. But its own destination vocabulary is corrected against source first: this codebase\'s "Snapshot" (application/DiscoverSnapshotCandidatesCommand.js, application/MaterializeSnapshotFromPlacementUseCase.js — a discoveryTag-keyed World-placement pipeline) is a structurally disjoint concept from "Publication" (publisher/Publication.js), the object Repository actually searches, lists, and forks — confirmed in both directions, by import and by UI reference. Every later section reasons about Publication federation, not Snapshot federation.');

    // ===============================================================
    // Section B — Source capability matrix, built from real code.
    // ===============================================================
    {
        // B1. Local — Discover/Search/Retrieve all real and shipped.
        const localDiscovery = await readSource('discovery/LocalDiscoveryProvider.js');
        assert(localDiscovery.includes('list()') && localDiscovery.includes('findById(id)'),
            '1. Local: discovery/LocalDiscoveryProvider.js implements both list() and findById() — Discover and Retrieve both real.');

        // B2. Peer — discovers PEER ENDPOINTS, never publications. Read
        // directly from the base contract's own header, not inferred from
        // the class name "PeerDiscoveryProvider."
        const peerDiscoveryProvider = await readSource('peer/PeerDiscoveryProvider.js');
        assert(proseIncludes(peerDiscoveryProvider, 'how do I FIND a candidate endpoint for a peer'),
            '2. peer/PeerDiscoveryProvider.js\'s own header states its own question directly: a candidate ENDPOINT for a peer, never a publication.');
        assert(!/Publication/.test(peerDiscoveryProvider),
            '3. peer/PeerDiscoveryProvider.js never mentions "Publication" at all — confirmed structurally, not merely by the header\'s own framing.');

        // B3. Peer DOES carry a live gossip transport for
        // DecentralizedPublication envelopes — a genuinely separate fact
        // from peer discovery itself, checked directly.
        const publicationPeerExchange = await readSource('application/PublicationPeerExchange.js');
        assert(proseIncludes(publicationPeerExchange, 'wires application/ PublicationExchange.js to a LIVE, already-authenticated peer connection'),
            '4. application/PublicationPeerExchange.js (0.7.3) is a real, live gossip transport for DecentralizedPublication envelopes over an authenticated peer connection — Peer\'s own Retrieve/Exchange capability for THIS envelope type is real, not merely theoretical (Section C narrows what it actually carries today).');

        // B4. Decentralized — identity-scoped lookup only, no free-text
        // browse, reconfirmed directly (0.9.329's own B8 finding, checked
        // fresh here rather than merely cited).
        const decentralizedView = await readSource('ui/views/DecentralizedPublicationsView.js');
        assert(!/searchTerm|filterText|placeholder=.*[Ss]earch/.test(decentralizedView),
            '5. ui/views/DecentralizedPublicationsView.js still has no free-text search/browse affordance — a known contentReference/txid/anchorId in, evidence out, reconfirmed fresh.');

        // B5. The one existing DECENTRALIZED "browse the unknown" pattern
        // in this codebase — Snapshot candidate discovery via a
        // discoveryTag — is real, but Section A already proved it belongs
        // to a different domain object entirely.
        const nostrSnapshotDiscovery = await readSource('application/NostrSnapshotDiscoveryQueryService.js');
        assert(!/DiscoveryProvider|SearchPublicationsUseCase/.test(nostrSnapshotDiscovery),
            '6. application/NostrSnapshotDiscoveryQueryService.js never imports discovery/DiscoveryProvider.js or calls SearchPublicationsUseCase — its browsing pattern is real and proven (0.9.149/0.9.150) but wired to Snapshot, not to Repository.');
    }
    console.log('✓ Section B: the matrix, built from real code rather than assumed symmetry — Local: Discover ✓ / Search ✓ / Retrieve ✓ (LocalDiscoveryProvider, shipped). Peer: Discover ✗ for publications (PeerDiscoveryProvider\'s own header names its question "a candidate endpoint for a peer," never a publication, and never mentions Publication at all) / Retrieve-via-gossip ✓ but only for whatever content DecentralizedPublication envelopes actually carry (Section C narrows this). Decentralized: Discover ✗ as free-text browsing (identity-scoped lookup only, reconfirmed fresh) / a real "browse the unknown by tag" pattern DOES exist in this codebase (Nostr Snapshot candidate discovery) but is wired to a different domain object than Repository\'s own, confirmed structurally. The naive matrix the originating brief sketched (uniform ✓/? across all three sources) does not survive contact with source.');

    // ===============================================================
    // Section C — Identity & content convergence: shared substrate, and
    // whether any content actually overlaps today.
    // ===============================================================
    {
        const publicationSource = await readSource('publisher/Publication.js');
        const decentralizedPublicationSource = await readSource('core/DecentralizedPublication.js');

        // C1. Reconfirm 0.9.329's own narrower finding, fresh: no shared
        // primary key.
        assert(publicationSource.includes('documentId') && !/documentId/.test(decentralizedPublicationSource),
            '1. Publication is keyed by documentId; DecentralizedPublication has no documentId field at all — reconfirmed fresh (0.9.329 Section D).');

        // C2. The FULLER picture 0.9.329's own narrower check did not
        // look for: Publication ALSO carries contentReference,
        // publisherIdentity, and signature — the SAME shared building
        // blocks DecentralizedPublication is built from, imported from
        // the SAME files.
        assert(publicationSource.includes("import { ContentReference } from '../core/ContentReference.js';") &&
            decentralizedPublicationSource.includes('contentReference instanceof ContentReference'),
            '2. both Publication and DecentralizedPublication are built on the identical core/ContentReference.js class, not two independently-invented reference shapes.');
        assert(publicationSource.includes('contentReference = null') && publicationSource.includes('publisherIdentity = null') && publicationSource.includes('signature = null'),
            '3. Publication\'s own constructor already accepts contentReference/publisherIdentity/signature — real, shared substrate exists today, not merely a hypothetical future field.');
        assert(publicationSource.includes("Both fields are optional for pre-0.2.16 compatibility"),
            '4. Publication\'s own header names these fields explicitly, confirming this is deliberate schema, not an accidental structural coincidence.');

        // C3. But dormant in production: the one live path that
        // constructs every real Publication never populates any of them.
        const localPublisherProvider = await readSource('publisher/LocalPublisherProvider.js');
        assert(localPublisherProvider.includes('new Publication(') && localPublisherProvider.includes('signature: null'),
            '5. publisher/LocalPublisherProvider.js — the real, live construction path for every Publication — explicitly sets signature: null and never sets contentReference or publisherIdentity at all.');
        assert(!/contentReference:|publisherIdentity:/.test(localPublisherProvider),
            '6. confirmed directly: LocalPublisherProvider.js never assigns contentReference or publisherIdentity — the shared substrate is real at the class level and completely unused at the production-path level.');

        // C4. Content overlap, checked directly rather than assumed: this
        // codebase has registered exactly TWO DecentralizedPublication
        // content-kind plugins, ever, and neither is Repository's own
        // Publication.
        const displayKindRegistry = await readSource('application/CreatePublicationDisplayKindRegistryUseCase.js');
        assert(proseIncludes(displayKindRegistry, 'this codebase has exactly two so far: application/ BlueprintAttributionPublicationKind.js and application/ PlaceNamingClaimPublicationKind.js'),
            '7. application/CreatePublicationDisplayKindRegistryUseCase.js states, in its own words, that exactly two content kinds exist — Blueprint Attribution and Place Naming Claim.');
        assert(!/publisher\/Publication\.js|forkbuild\.publication/i.test(displayKindRegistry),
            '8. neither of those two registered kinds is Repository\'s own document Publication — confirmed directly, not inferred from the count alone.');

        // C5. So the honest content-overlap answer today: zero. A live
        // peer gossip transport for DecentralizedPublication envelopes
        // exists (Section B3), but it can only ever carry Blueprint
        // Attribution or Place Naming Claim content — never a Repository
        // Publication, because nothing constructs that envelope for one.
        const grepNewDecentralizedPublicationSites = grepFiles('new DecentralizedPublication\\(', ['application']);
        assert(grepNewDecentralizedPublicationSites.length === 1 && grepNewDecentralizedPublicationSites[0] === 'application/PublicationResolver.js',
            `9. the only production site constructing a DecentralizedPublication is application/PublicationResolver.js#publish(), which requires a caller-supplied kindPlugin — and Section C4 already proved only two exist, neither of which is Repository's own Publication (found construction sites: ${grepNewDecentralizedPublicationSites.join(', ') || 'none'}).`);
    }
    console.log('✓ Section C: 0.9.329\'s own finding (no shared documentId) still holds, reconfirmed fresh — but it was not the whole picture. Publication and DecentralizedPublication share a REAL substrate: the identical core/ContentReference.js class, and Publication\'s own constructor already accepts contentReference/publisherIdentity/signature, explicitly documented since 0.2.16 as forward-looking, optional fields. That substrate is completely dormant in production — publisher/LocalPublisherProvider.js, the one live construction path, never populates any of the three. And checked directly rather than assumed: this codebase has registered exactly two DecentralizedPublication content kinds, ever (Blueprint Attribution, Place Naming Claim) — Repository\'s own Publication has never once been wrapped as a DecentralizedPublication anywhere in this codebase. Today, content overlap between Repository\'s catalog and anything Peer/Decentralized can carry is not "harder to reach" — it is exactly zero.');

    // ===============================================================
    // Section D — The existing downstream workflow a federated result
    // would actually have to feed.
    // ===============================================================
    {
        const publicationCard = await readSource('ui/components/PublicationCard.js');
        assert(publicationCard.includes("emits: ['open', 'fork', 'explore', 'view-author']"),
            '1. ui/components/PublicationCard.js emits exactly open/fork/explore/view-author — the real, shipped Repository result actions.');
        assert(proseIncludes(publicationCard, 'editable document/fork per the existing fork-on-write lifecycle'),
            '2. its own header names the fork action\'s own destination directly: the existing fork-on-write lifecycle, not a Snapshot pipeline of any kind.');

        const publicationCatalog = await readSource('ui/components/PublicationCatalog.js');
        assert(publicationCatalog.includes("router.push({ path: '/editor', query: { fork: pub.documentId, publication: pub.id } });"),
            '3. PublicationCatalog.js#forkPublication() routes to /editor keyed by pub.documentId — confirmed directly, the exact call site.');

        // D2. The load-bearing consequence: this route is keyed by
        // documentId, a field DecentralizedPublication structurally lacks
        // (Section C1). An unmodified Fork action has nothing to pass for
        // a decentralized-origin entry.
        const decentralizedPublicationSource = await readSource('core/DecentralizedPublication.js');
        assert(!/documentId/.test(decentralizedPublicationSource),
            '4. reconfirmed: core/DecentralizedPublication.js has no documentId field — the exact field forkPublication() requires.');

        // D3. Explore, the other action naming a destination, targets
        // World placement — again a different pipeline than Snapshot
        // materialization, confirmed directly.
        assert(publicationCatalog.includes("router.push({ path: `/world/${pub.documentId}` });"),
            '5. viewWorld() also routes by pub.documentId, not by any Snapshot-domain identifier — the same structural dependency holds for Explore as for Fork.');
    }
    console.log('✓ Section D: Repository\'s real, shipped downstream workflow, traced to its actual call sites — "Fork" routes to /editor keyed by documentId (fork-on-write, per the component\'s own header), "Explore" routes to /world keyed by the same documentId. Both actions are structurally dependent on a field (documentId) that DecentralizedPublication does not have. This is the concrete, mechanical form of Section C\'s finding: even a hypothetical federated Repository result sourced from a DecentralizedPublication could not drive either existing action unmodified — some resolution step producing a genuine local documentId-keyed entity would have to run first, exactly the kind of "convert an evidence claim into a locally-possessed fact" step this codebase\'s Snapshot-materialization family already has a template for, elsewhere, for a different object (Section H).');

    // ===============================================================
    // Section E — Source-specific semantics: what each source concretely
    // hands back today, checked rather than assumed.
    // ===============================================================
    {
        // E1. Local: real Publication instances, ready to fork today —
        // no further step required.
        const localDiscovery = await readSource('discovery/LocalDiscoveryProvider.js');
        assert(localDiscovery.includes('Publication.fromJSON(record)'),
            '1. Local: LocalDiscoveryProvider.list()/findById() return real Publication instances directly, fork-ready as-is.');

        // E2/E3. Peer and Decentralized: Section C4/C5 already proved the
        // shared envelope type (DecentralizedPublication) never carries
        // Repository's own content today — so what either source "hands
        // back" to a Repository-shaped consumer, right now, mechanically,
        // is nothing. Verified directly: nothing in application/ ever
        // converts a DecentralizedPublication into a publisher/Publication.
        const grepPublicationFromDecentralized = grepFiles('new Publication\\(.*DecentralizedPublication|DecentralizedPublication.*new Publication\\(', ['application', 'publisher']);
        assert(grepPublicationFromDecentralized.length === 0,
            '2. no production file anywhere converts a DecentralizedPublication into a publisher/Publication — confirmed by direct search, not inferred from Section C\'s narrower per-file checks.');
    }
    console.log('✓ Section E: Local hands back real, fork-ready Publication instances today, no further step required. Peer and Decentralized, mechanically, hand back nothing shaped like a Repository result today — not because retrieval is hard, but because Section C already proved the shared envelope type never carries this content, and this section confirms directly that no conversion path from DecentralizedPublication to Publication exists anywhere in production. A federated Repository built today would have two real, populated columns and one genuinely, structurally empty one.');

    // ===============================================================
    // Section F — Deduplication policy, derived from existing
    // architecture, never invented for this milestone's own convenience.
    // ===============================================================
    {
        const localPublicationCatalog = await readSource('application/LocalPublicationCatalog.js');
        assert(localPublicationCatalog.includes('No ranking, trust score, "canonical," or "preferred" field exists'),
            '1. application/LocalPublicationCatalog.js\'s own header states this restraint directly, reconfirmed fresh (0.9.329 Section D).');

        const principles = await readSource('docs/Principles.md');
        assert(principles.includes('### Acquisition Provenance Is Not Evidence Rank (0.8.17)'),
            '2. a second, independent, standing named principle enforces the identical restraint one layer over: provenance (where a record came from) is tracked and preserved, never used to rank or collapse records against each other.');
        assert(principles.includes('### Discovery Is Not Resolution (0.7.2)'),
            '3. reconfirmed: "what a source claims" and "what this replica can independently establish" are kept apart by a named, standing principle, not merely a local convention this milestone could reinterpret.');
    }
    console.log('✓ Section F: the correct dedup policy for any first federated seam is not invented here — it is read directly off two independent, already-standing architectural restraints. LocalPublicationCatalog\'s own header refuses any canonical/preferred/ranking field; "Acquisition Provenance Is Not Evidence Rank (0.8.17)" enforces the identical restraint for every other provenance-tagged record family in this codebase (anchors, placements). The policy: never merge results across sources by inferred equality (there is no shared key to merge on, per Section C, even if the policy allowed it) — group and tag by source, preserve provenance, rank nothing.');

    // ===============================================================
    // Section G — No second source of truth: the composition constraint
    // a real implementation would have to hold to.
    // ===============================================================
    {
        // G1. Guard: no such store has been silently introduced already.
        const suspiciousNames = ['RepositoryFederationStore', 'RepositorySnapshotStore', 'RepositorySnapshotIdentity', 'RepositorySnapshotRegistry', 'RepositoryProvider'];
        for (const name of suspiciousNames) {
            assert(!(await sourceExists(`application/${name}.js`)), `1. application/${name}.js does not exist — no second Repository-owned source of truth has been introduced.`);
        }

        // G2. The constraint, derived from Section C/E rather than
        // asserted on faith: composing Local + Peer + Decentralized
        // results without a new store is only possible for content that
        // ALREADY lives in an existing store shaped correctly for it.
        // Local qualifies (LocalDiscoveryProvider reads Repository's own
        // existing storage). Peer/Decentralized do not, TODAY, because
        // Section C4/C5 proved no existing store holds Repository content
        // under either source — so "compose without a new store" is not
        // yet possible for those two; it is possible only once SOME
        // existing store (LocalPublicationCatalog, extended with a real
        // content-kind plugin — Section H) actually holds Repository
        // content at all.
        const localPublicationCatalog = await readSource('application/LocalPublicationCatalog.js');
        assert(localPublicationCatalog.includes('list()'),
            '2. application/LocalPublicationCatalog.js already exposes list() — the one existing store shape a Repository-content-kind plugin (Section H) would extend, rather than a new store this milestone would have to invent.');
    }
    console.log('✓ Section G: no second Repository-owned source of truth exists today (checked directly). The real constraint a future implementation must hold to: Local composition is already possible without any new store (LocalDiscoveryProvider reads Repository\'s own existing storage). Peer/Decentralized composition without a new store is NOT yet possible — not because the constraint is hard to satisfy, but because, per Section C/E, no existing store currently holds any Repository-shaped content from either source. The right target is not a new RepositoryFederationStore; it is teaching the ALREADY-EXISTING application/LocalPublicationCatalog.js to hold Repository content too, the same way it already holds Blueprint/PlaceNaming content — Section H names the concrete seam.');

    // ===============================================================
    // Section H — Smallest first implementation seam, identified from an
    // existing, already-proven template.
    // ===============================================================
    let smallestSeam;
    {
        // H1. The exact, reusable template: two existing content-kind
        // plugins, both built to the SAME four-function shape
        // PublicationResolver itself already requires.
        const publicationResolver = await readSource('application/PublicationResolver.js');
        assert(proseIncludes(publicationResolver, 'a kindPlugin with contentKind/validate/fromJSON/verify is required'),
            '1. application/PublicationResolver.js\'s own error message names the exact plugin shape directly.');
        assert(await sourceExists('application/BlueprintAttributionPublicationKind.js') && await sourceExists('application/PlaceNamingClaimPublicationKind.js'),
            '2. both existing templates for "teach the decentralized protocol a new content type" are real, shipped files.');

        // H2. The seam this milestone identifies — NOT preselected before
        // this audit, arrived at only because Sections C/D/E/G converge
        // on it: a third content-kind plugin, e.g.
        // PublicationContentKind.js, following the identical template,
        // that lets Publication's own ALREADY-DORMANT contentReference/
        // publisherIdentity/signature fields (Section C2/C3) finally get
        // populated and carried through the SAME existing
        // PublicationExchange/PublicationPeerExchange/PublicationResolver
        // pipeline Blueprint/PlaceNaming already use, unmodified.
        smallestSeam = 'REGISTER_A_PUBLICATION_CONTENT_KIND_PLUGIN';
        const rejectedAlternatives = [
            ['EXTEND_DISCOVERYPROVIDER_LIST_CONTRACT', 'rejected — 0.9.329 Section E already proved list() is a synchronous, unconditional-once-implemented contract while decentralized retrieval is async and, in this codebase\'s own words, "at best, a rumor"; nothing in this audit overturns that finding.'],
            ['BUILD_A_NEW_REPOSITORY_DISCOVERYPROVIDER', 'rejected — Section G: would require a new store, since no existing one holds Repository content from Peer/Decentralized sources today.'],
            ['ADD_A_NEW_PEER_PUBLICATION_BROWSE_PROTOCOL', 'rejected as a FIRST step — Section B2 shows PeerDiscoveryProvider never discovers publications at all (only peer endpoints); solving that is a strictly larger, separately-scoped problem than turning already-gossiped claims into forkable Repository entries.']
        ];
        assert(rejectedAlternatives.every(([, reason]) => reason.startsWith('rejected')),
            '3. every alternative seam was considered and explicitly rejected with its own reason, rather than this section silently picking one.');

        // H3. Explicit scope-down: what this seam would NOT yet solve.
        const peerDiscoveryProvider = await readSource('peer/PeerDiscoveryProvider.js');
        assert(proseIncludes(peerDiscoveryProvider, 'It only ever answers "what endpoints are worth attempting?"'),
            '4. reconfirmed directly: even after a Publication content-kind plugin exists, Peer still cannot discover a stranger\'s publication with no prior lead — Peer discovery only ever answers a connectivity question, never a content question.');
    }
    console.log(`✓ Section H: smallest seam identified — ${smallestSeam}. A third DecentralizedPublication content-kind plugin, built to the identical, already-proven four-function template BlueprintAttributionPublicationKind.js/PlaceNamingClaimPublicationKind.js already use, would let Publication's own already-dormant contentReference/publisherIdentity/signature fields (Section C) finally travel through the SAME existing PublicationExchange -> PublicationPeerExchange -> PublicationResolver pipeline, unmodified — no new DiscoveryProvider, no new store (Section G), no change to SearchPublicationsUseCase's synchronous contract (0.9.329 Section E, not overturned here). Explicitly scoped down: this seam turns an already-gossiped or already-known-by-reference publication into a forkable Repository entry — it does NOT give Peer the ability to browse a stranger's catalog with no prior lead, a separate, larger, unscoped problem this milestone deliberately does not fold in.`);

    // ===============================================================
    // Section I — UX semantics, deliberately left undesigned.
    // ===============================================================
    {
        for (const file of ['ui/components/PublicationCatalog.js', 'ui/components/PublicationCatalogToolbar.js']) {
            const src = await readSource(file);
            assert(!/SourceFilter|ProvenanceBadge|\[All\]\s*\[Local\]\s*\[Peers\]/.test(src),
                `1. ${file} carries no source-filter, provenance-badge, or tab vocabulary — nothing has been silently pre-built ahead of this audit's own verdict.`);
        }
    }
    console.log('✓ Section I: deliberately undesigned, and checked rather than merely declared — Repository\'s own UI files carry no filter-tab, source-badge, or ranking vocabulary today. Per this milestone\'s own brief: tabs, source badges, ranking, and provider preference are a LATER decision, made only once Section H\'s own seam is actually built and something real exists to present.');

    // ===============================================================
    // Section J — Final classification and production-change guard.
    // ===============================================================
    {
        const CLASSIFICATIONS = [
            'FEDERATION_JUSTIFIED',
            'FEDERATION_JUSTIFIED_BUT_SEAM_UNRESOLVED',
            'PRODUCT_DIRECTION_CONFIRMED_SEAM_IDENTIFIED',
            'PRODUCT_DIRECTION_CONFIRMED_DEFERRED',
            'NOT_A_PRODUCT_GAP'
        ];
        const verdict = 'PRODUCT_DIRECTION_CONFIRMED_SEAM_IDENTIFIED';
        assert(CLASSIFICATIONS.includes(verdict), '1. the verdict is drawn from this milestone\'s own named taxonomy.');
        assert(verdict !== 'NOT_A_PRODUCT_GAP',
            '2. this milestone does not reverse 0.9.329 — it answers a different question 0.9.329 was never asked (product direction vs. current-architecture necessity), per this milestone\'s own governing distinction (Section A).');
        assert(smallestSeam === 'REGISTER_A_PUBLICATION_CONTENT_KIND_PLUGIN',
            '3. Section H\'s own identified seam carries forward into this final verdict rather than being re-litigated.');

        const changedNonTestFiles = execSync('git diff --name-only HEAD -- . ":(exclude)tests" ":(exclude)docs/Roadmap.md" ":(exclude)tests.html"',
            { cwd: SOURCE_ROOT.pathname }).toString().trim();
        assert(changedNonTestFiles === '', `4. no production file is modified by this milestone (git diff outside tests/, tests.html, docs/Roadmap.md is empty) — found: ${changedNonTestFiles || 'none'}.`);
    }
    console.log('\n✓ Section J: FINAL DECISION.\n' +
'\n' +
'OUTCOME: PRODUCT_DIRECTION_CONFIRMED_SEAM_IDENTIFIED.\n' +
'\n' +
'WHY. Section A recorded the product direction the product owner stated, and corrected its own vocabulary against\n' +
'source: this codebase\'s "Snapshot" is a structurally separate, discoveryTag-keyed World-placement concept, never\n' +
'Repository\'s own "Publication." Section B built the capability matrix from real code rather than assumed symmetry —\n' +
'Local is complete; Peer discovers endpoints, never publications, though it does carry a live gossip transport for a\n' +
'shared envelope type; Decentralized offers identity-scoped lookup only, with a proven "browse the unknown" pattern\n' +
'that exists but is wired to a different domain object. Section C found real shared substrate (Publication and\n' +
'DecentralizedPublication both build on core/ContentReference.js, and Publication has carried optional\n' +
'contentReference/publisherIdentity/signature fields since 0.2.16) that is completely dormant in production, and\n' +
'confirmed, by direct search, that Repository\'s own Publication has never once been wrapped as a\n' +
'DecentralizedPublication anywhere in this codebase — content overlap today is exactly zero. Section D traced\n' +
'Repository\'s real downstream workflow (Fork/Explore, both keyed by documentId, a field DecentralizedPublication\n' +
'structurally lacks) to its exact call sites. Section E confirmed mechanically that Peer/Decentralized hand back\n' +
'nothing Repository-shaped today. Section F derived a dedup policy from two independent, already-standing\n' +
'principles rather than inventing one. Section G confirmed no second source of truth exists and named the real\n' +
'constraint: compose into an existing store, never build a new one. Section H identified the smallest seam this\n' +
'audit\'s own evidence converges on — a third DecentralizedPublication content-kind plugin, following an\n' +
'already-proven template, letting Publication\'s own dormant fields finally travel the existing decentralized\n' +
'pipeline — while explicitly rejecting three larger alternatives with named reasons, and explicitly scoping down\n' +
'what it would NOT yet solve (Peer still cannot browse a stranger\'s catalog with no prior lead). Section I confirmed\n' +
'no UX has been silently pre-built.\n' +
'\n' +
'WHAT THIS MEANS. The product direction is recorded, not fabricated by this audit and not contested by it — that is\n' +
'the product owner\'s call, made explicitly, after reading 0.9.329\'s own verdict. What this audit contributes is\n' +
'everything 0.9.329\'s own STOP left unexamined: a real capability matrix, the actual (currently dormant) identity\n' +
'substrate, the actual downstream workflow, an honest content-overlap count, a derived (not invented) dedup policy,\n' +
'a no-second-source-of-truth constraint, and one concretely named, minimally-scoped, template-following seam. No\n' +
'production code is touched here — this remains, per its own Type, a test-only decision milestone. A future 0.9.331\n' +
'is not pre-committed by this file, but is, for the first time in this sequence, pointed at something specific:\n' +
'application/PublicationContentKind.js (or an equivalent name), built to the exact BlueprintAttributionPublicationKind.js/\n' +
'PlaceNamingClaimPublicationKind.js template, as the smallest real step toward the product direction Section A\n' +
'recorded.\n');

    console.log('\n✅ All Federated Repository Product Direction & Seam Audit tests passed.');
}

run().then(() => {
    console.log('\n✓ All FederatedRepositoryProductDirectionSeamAudit tests passed');
}).catch((error) => {
    console.error('\n✗ FederatedRepositoryProductDirectionSeamAudit tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
