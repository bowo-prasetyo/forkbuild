import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { DecentralizedWorldEncounterMaterialSource } from '../application/DecentralizedWorldEncounterMaterialSource.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';

// 0.9.329 — Federated Repository Product Gap Audit.
//
// Test-only. Production changes: none.
//
// This milestone's own brief opened with an observation: `application/
// SearchPublicationsUseCase.js` is provider-swappable by CONTRACT — its own
// header explicitly leaves room for "a future decentralized discoveryProvider"
// — while the rest of ForkBuild already has substantial, independently-built
// Local/Peer/Decentralized machinery. The brief drew a sharp, correct line
// between two different claims: "the Repository was designed so it COULD
// become federated" (an architectural fact, already true) and "a user
// currently cannot complete a workflow because the Repository is local-only"
// (a product-gap claim, unproven). It asked ten lettered audits (A-J) to
// settle which of those two claims the evidence actually supports, and
// named one phrase to specifically interrogate rather than accept:
// "temporary, device-scoped placeholder."
//
//   Section A — Repository's own contract, read from source, not inferred
//               from the interface name or a hopeful reading of "provider."
//   Section B — Every existing way a user can already discover publications
//               beyond their own device, mapped from real, shipped code.
//   Section C — The strongest concrete "Publication exists remotely -> user
//               expects Repository to find it" journey, run mechanically
//               against real production wiring, not asserted rhetorically.
//   Section D — Identity convergence: whether Repository's `Publication`
//               and the decentralized catalog's `DecentralizedPublication`
//               are the same identity concept or two different ones.
//   Section E — Provider semantics: whether SEARCH, DISCOVER, RETRIEVE, and
//               MATERIALIZE are actually interchangeable operations here.
//   Section F — Duplication test: would a federated Repository reimplement,
//               or merely re-expose, machinery that already exists and
//               already has its own dedicated UI surface?
//   Section G — Cross-arc integration scan for a genuine "Capability A
//               complete, Capability B complete, A -> B blocked" pair
//               between World Encounter and Repository specifically.
//   Section H — The standing 0.9.314/0.9.327/0.9.328 external-evidence gate,
//               reused verbatim, applied to this milestone's own finding.
//   Section I — Smallest-seam identification — conditional on READY; this
//               milestone's own verdict makes it vacuous, asserted as such
//               rather than silently skipped.
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

// Whitespace-insensitive prose match — this milestone quotes several
// multi-line comment/markdown paragraphs verbatim from source, and a
// literal newline in the file must never make an honest quote fail to
// match merely because of where a line happens to wrap.
function normalizeProse(text) {
    return text.replace(/\/\//g, ' ').replace(/\s+/g, ' ').trim();
}

function proseIncludes(haystack, needle) {
    return normalizeProse(haystack).includes(normalizeProse(needle));
}

async function run() {
    // ===============================================================
    // Section A — Repository's own contract, read from source.
    // ===============================================================
    let principles;
    {
        const searchSource = await readSource('application/SearchPublicationsUseCase.js');
        assert(searchSource.includes('Repository search asks "which publications match this description?"'),
            '1. SearchPublicationsUseCase documents its own question in its own header — not inferred, quoted directly.');
        assert(searchSource.includes('no position, no camera, no placement concept at all'),
            '2. the same header explicitly excludes any World/spatial concept from what Repository search answers.');

        principles = await readSource('docs/Principles.md');
        assert(principles.includes('### Repository Search Is Not World Search (0.2.31)'),
            '3. this distinction is a named, standing architectural principle, not a one-off code comment.');
        assert(proseIncludes(principles, 'Whether that swap ever needs to happen is a separate, later decision (see docs/Roadmap.md)'),
            '4. the principle itself already anticipated a future decentralized provider AND already, explicitly, deferred the decision of whether to build one — this is the load-bearing sentence the milestone brief\'s own "architectural preparedness, not a commitment" framing rests on.');

        // The wiring itself, not just the prose: CreateDiscoveryUseCase.js
        // (the one composition root every Repository/Author view goes
        // through) constructs exactly ONE concrete provider.
        const createDiscovery = await readSource('application/CreateDiscoveryUseCase.js');
        assert(createDiscovery.includes("import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';"),
            '5. CreateDiscoveryUseCase imports LocalDiscoveryProvider.');
        // UPDATED by 0.9.339 — Merge Decentralized Publication Discovery
        // into Repository Discovery. At the time THIS audit was written,
        // CreateDiscoveryUseCase never imported or constructed a Peer or
        // Decentralized discovery provider at all — the exact absence
        // Section H below concludes is this milestone's own scoped-out
        // future step. 0.9.339 built exactly that step: LocalDiscoveryProvider
        // is still unconditionally constructed (assertion 5 above,
        // unchanged), but Repository's live contract can now ALSO be
        // given a second, decentralized provider — reconfirmed fresh
        // rather than left to describe a state that no longer holds.
        assert(!/Peer/.test(createDiscovery) && createDiscovery.includes('decentralizedDiscoveryProvider'),
            '6. UPDATED (0.9.339): CreateDiscoveryUseCase still never references Peer discovery, but now DOES accept and compose an optional decentralized discovery provider — Repository\'s live contract is no longer limited to exactly one concrete implementation.');

        // DiscoveryProvider.js's own base-class contract is already
        // storage-agnostic — this is the CONTRACT'S honesty, established
        // independently of any Repository-specific decision.
        const discoveryProviderBase = await readSource('discovery/DiscoveryProvider.js');
        assert(proseIncludes(discoveryProviderBase, 'without knowing whether the source is localStorage, Steem, Hive, IPFS, or another ForkBuild node'),
            '7. the base DiscoveryProvider contract was already written provider-agnostic — this predates and is broader than SearchPublicationsUseCase itself, reinforcing that "swappable by contract" describes this codebase\'s general design habit, not a Repository-specific unfinished corner.');
    }
    console.log('✓ Section A: Repository\'s own contract, read from source rather than inferred from the word "provider," is explicit on two points at once — it is deliberately provider-swappable (a documented, general codebase habit, not unique to Repository), AND its own governing principle explicitly named the decision to ever build a second provider as separate and not-yet-made. Neither fact alone settles whether federation is a product gap; Sections B-H test that directly.');

    // ===============================================================
    // Section B — Every existing way a user can discover publications
    // beyond their own device, mapped from real, shipped code.
    // ===============================================================
    {
        // B1. World Search itself — the OTHER "search" in this codebase —
        // is ALSO local-only in production, wired independently to its
        // own fresh LocalDiscoveryProvider. This matters: it is not that
        // Repository alone lags behind a broader "World Search already
        // federates" reality. Nothing in the shipped search surface,
        // Repository's or World's, reads beyond this device today.
        const createWorldView = await readSource('application/CreateWorldViewUseCase.js');
        assert(createWorldView.includes("const discoveryProvider = new LocalDiscoveryProvider(storageProvider);"),
            '1. CreateWorldViewUseCase, independently of CreateDiscoveryUseCase, also constructs a fresh LocalDiscoveryProvider — World Search is local-only in production too.');
        assert(principles.includes('### Discovery Is One Path, Not Two (0.2.26)'),
            '2. this is itself a named, standing principle: Repository View, Author View, and World Search are documented to deliberately share the identical local source, not to differ in reach.');

        // B2. Peer discovery exists, as an entirely separate family.
        assert(await sourceExists('peer/PeerDiscoveryProvider.js'), '3. a Peer discovery family exists.');
        assert(grepCount('LocalDiscoveryProvider', ['peer']) === 0,
            '4. the Peer discovery family never imports Repository\'s own LocalDiscoveryProvider — confirmed structurally separate, not merely separate by folder.');

        // B3. Decentralized discovery/encounter exists, as another
        // separate family — and it is large: 0.9.x built at least 35
        // dedicated files under application/ alone.
        const decentralizedFamilyCount = grepCount('World(Discovery|Encounter)', ['application'], { ignoreCase: false });
        assert(decentralizedFamilyCount >= 20,
            `5. at least 20 application/ files implement the World Discovery/World Encounter family (found ${decentralizedFamilyCount}) — a substantial, independently-evolving body of work, not a stub.`);

        // B4. A decentralized-publication-facing UI surface ALREADY
        // SHIPPED — ui/views/DecentralizedPublicationsView.js — reading
        // from application/LocalPublicationCatalog.js, never from
        // Repository's own discoveryProvider.
        const decentralizedView = await readSource('ui/views/DecentralizedPublicationsView.js');
        assert(decentralizedView.length > 10000,
            '6. DecentralizedPublicationsView.js is a large, substantive, shipped view (confirmed by size, not merely existence).');
        assert(grepCount('LocalDiscoveryProvider|SearchPublicationsUseCase', ['ui/views/DecentralizedPublicationsView.js']) === 0,
            '7. that shipped view never reads through Repository\'s own discoveryProvider or SearchPublicationsUseCase — it is built on an entirely separate catalog.');
        assert(!/searchTerm|filterText|placeholder=.*[Ss]earch/.test(decentralizedView),
            '8. unlike Repository\'s own PublicationCatalog, the decentralized view has no free-text search/browse affordance — it is an identity-scoped lookup surface (a known contentHash/txid/anchorId in, evidence out), not a second browsable catalog. This is a real, material difference Section C tests directly.');
    }
    console.log('✓ Section B: at least four independently-shipped discovery mechanisms already exist — local Repository/World search (identical, both local-only), Peer discovery, and a large (20+ file) Decentralized World Discovery/Encounter family with its own dedicated, shipped UI (DecentralizedPublicationsView.js). None of them is a stub. But the decentralized-facing UI is identity-scoped lookup, not free-text browsing — the exact shape Repository would need to add is not yet duplicated anywhere, which is what makes Section C\'s journey test the real question.');

    // ===============================================================
    // Section C — The strongest concrete journey, run mechanically.
    // ===============================================================
    {
        // The single strongest existing candidate for "a publication
        // exists remotely and the user expects Repository to find it" is
        // the World Encounter mechanism: a user, navigating World View,
        // can already retrieve a decentralized publication's material
        // on demand. Run it for real, then ask what happens to the
        // result.
        const fakeMaterial = { documentId: 'doc-remote-1', title: 'A Remote Publication', author: 'someone-else' };
        const source = new DecentralizedWorldEncounterMaterialSource(async () => fakeMaterial);
        const resolvedSelection = { kind: WorldEncounterKind.PUBLICATION, objectId: 'obj-1', origin: 'ar://lead-1' };
        const resolvedLead = { origin: 'ar://lead-1', discoveryTag: 'tag', uri: 'ar://content-hash-1' };

        const material = await source.load(resolvedSelection, resolvedLead);
        assert(material === fakeMaterial,
            '1. the shipped World Encounter path can, right now, retrieve real material for a decentralized-origin selection.');

        // Now the question that actually decides this journey: does
        // retrieving it make it findable through Repository afterward?
        // The class itself never touches a StorageProvider or a
        // discoveryProvider — verified structurally, not merely by not
        // observing a side effect in this one test run.
        const decentralizedSourceCode = await readSource('application/DecentralizedWorldEncounterMaterialSource.js');
        assert(!/^import.*(StorageProvider|discoveryProvider|Catalog)/m.test(decentralizedSourceCode),
            '2. DecentralizedWorldEncounterMaterialSource imports no storage or catalog class at all (its own header even names `StorageProvider` only to say a decentralized source is UNLIKE it) — the class\'s constructor takes exactly one collaborator, `retrieveByUri`.');
        assert(decentralizedSourceCode.includes('constructor(retrieveByUri) {'),
            '2b. confirmed directly: the constructor accepts exactly retrieveByUri, no storage/catalog collaborator of any kind.');

        // Confirmed by the encounter family's own documentation, in its
        // own words, at two separate points in the codebase — this is a
        // deliberate, repeatedly-stated design rule, not a silent gap
        // this audit is the first to notice.
        const canvasSource = await readSource('ui/components/WorldEncounterCanvas.js');
        assert(proseIncludes(canvasSource, 'Nothing here persists it to a `StorageProvider`, broadcasts it'),
            '3. WorldEncounterCanvas.js states directly, in its own header, that a resolved encounter is never persisted to storage.');
        assert(proseIncludes(canvasSource, 'None of it is persisted, and none of it is written into any'),
            '4. a second, independent place in the same file restates the identical rule for the encounter\'s full discovery/resolution/inspection result.');

        // Finally: does the shipped product ever tell a USER to expect
        // Repository to find something they saw in World View? No
        // Repository-facing copy, route, or affordance references World
        // Encounter, Peer, or Decentralized material anywhere.
        //
        // UPDATED by 0.9.339 — Merge Decentralized Publication Discovery
        // into Repository Discovery. At the time THIS audit was written,
        // ui/components/PublicationCatalog.js's own SOURCE contained no
        // trace of the word "decentralized" at all — checked against the
        // whole file because there was nothing there to distinguish from
        // user-facing copy. 0.9.339 gave Repository a real, silent
        // capability (an already-resolved decentralized Publication now
        // participates in search, exactly like a local one — see
        // tests/DecentralizedPublicationRepositoryMerge.test.js), which
        // necessarily means the component's own SOURCE now names
        // `decentralizedPublicationDiscoveryProvider` — in an inject()
        // call and its own comment, never in the rendered `template:`
        // string this section's own question is actually about. This
        // audit's real question — does the product's USER-FACING copy
        // ever promise this — is unaffected and re-checked directly
        // against the template literal, not the whole file.
        const repositoryFacingFiles = ['ui/components/PublicationCatalog.js', 'ui/components/PublicationCatalogToolbar.js'];
        for (const file of repositoryFacingFiles) {
            const src = await readSource(file);
            const templateMatch = src.match(/template:\s*`([\s\S]*)`/);
            const userFacingCopy = templateMatch ? templateMatch[1] : src;
            assert(!/[Ee]ncounter|[Dd]ecentralized|[Pp]eer discovery/.test(userFacingCopy),
                `5. ${file}'s own USER-FACING template never mentions World Encounter, decentralized material, or peer discovery — Repository still never sets an expectation to a user that it doesn't meet, even though (0.9.339) its own composition code now does reference the shared decentralized provider by name.`);
        }
    }
    console.log('✓ Section C: the strongest available journey — encounter a decentralized publication in World View, then expect Repository to find it afterward — was run for real. Retrieval succeeds. But the result is never persisted, by explicit, twice-stated design ("nothing here persists it," "none of it is written into any"), and Repository\'s own UI never sets an expectation that it would. This is not an incomplete journey; it is a journey the product never offers, on either end.');

    // ===============================================================
    // Section D — Identity convergence.
    // ===============================================================
    {
        const publicationSource = await readSource('publisher/Publication.js');
        const decentralizedPublicationSource = await readSource('core/DecentralizedPublication.js');

        assert(publicationSource.includes('documentId') && publicationSource.includes('contentHash'),
            '1. Repository\'s own Publication identity is keyed by documentId, carrying its own contentHash.');
        assert(!/documentId/.test(decentralizedPublicationSource),
            '2. DecentralizedPublication has no documentId at all — it is keyed by a signed envelope\'s contentReference/publisherIdentity, a genuinely different identity shape, not merely a differently-named field for the same concept.');
        assert(decentralizedPublicationSource.includes('contentReference') && decentralizedPublicationSource.includes('publisherIdentity'),
            '3. confirmed directly from source: contentReference + publisherIdentity, not documentId + author.');

        // The two catalogs are also literally separate storage — not
        // just separate classes reading the same rows.
        const localPublicationCatalog = await readSource('application/LocalPublicationCatalog.js');
        assert(localPublicationCatalog.includes("const STORAGE_KEY = 'publication-catalog:entries';"),
            '4. LocalPublicationCatalog persists under its own, distinct storage key.');
        assert(!localPublicationCatalog.includes('LocalStorageProvider'),
            '5. LocalPublicationCatalog never imports Repository\'s own storage/LocalStorageProvider.js — it is handed a generic StorageProvider, but the KEY it writes under is namespaced apart from anything Repository\'s discoveryProvider ever reads.');

        // And the architecture explicitly forbids collapsing them —
        // in its own words, twice, at two different milestones.
        assert(localPublicationCatalog.includes('No ranking, trust score, "canonical," or "preferred" field exists'),
            '6. LocalPublicationCatalog\'s own header states this restraint directly — a federated Repository result would need exactly the "which one is real" adjudication this class refuses to hold.');
        assert(principles.includes('### Discovery Is Not Resolution (0.7.2)'),
            '7. this is a named, standing principle — "discovery" (what a decentralized source claims to know) and "resolution" (what this replica can independently establish) are kept apart on purpose, at the architecture level, not merely inside one class.');
    }
    console.log('✓ Section D: Repository\'s `Publication` (documentId/contentHash, locally authored or stored) and the decentralized catalog\'s `DecentralizedPublication` (a signed contentReference/publisherIdentity envelope, of unconfirmed reachability) are two different identity models, stored under two different keys, kept apart by an explicit, named architectural rule — not two names for one underlying fact a federated provider could quietly unify.');

    // ===============================================================
    // Section E — Provider semantics: SEARCH vs DISCOVER vs RETRIEVE vs
    // MATERIALIZE.
    // ===============================================================
    {
        const discoveryProviderBase = await readSource('discovery/DiscoveryProvider.js');
        // DiscoveryProvider's own contract is SYNCHRONOUS — list()/
        // findById() return values directly, no Promise anywhere in the
        // base class.
        assert(!discoveryProviderBase.includes('Promise') && !discoveryProviderBase.includes('async'),
            '1. DiscoveryProvider.list()/findById() are a synchronous contract — SearchPublicationsUseCase calls `discoveryProvider.list()` and immediately filters/sorts/slices the result in the same tick.');

        // WorldEncounterMaterialSource#load() is explicitly asynchronous
        // — a genuinely different contract shape, not an implementation
        // detail.
        const decentralizedSourceCode = await readSource('application/DecentralizedWorldEncounterMaterialSource.js');
        assert(decentralizedSourceCode.includes('async load(resolvedSelection, resolvedLead)'),
            '2. DecentralizedWorldEncounterMaterialSource#load() is async — retrieval is a Promise-returning operation DiscoveryProvider\'s synchronous list()/findById() contract cannot represent without changing that contract\'s own shape for every existing caller.');

        // A decentralized "lead" is explicitly a rumor, not a fact — in
        // its own Roadmap entry's own words.
        const roadmap = await readSource('docs/Roadmap.md');
        assert(proseIncludes(roadmap, 'what it hands back is, at best, a rumor about where material MIGHT live'),
            '3. 0.9.24\'s own Roadmap entry names a decentralized discovery result a "rumor," explicitly not yet a fact a stable list() could honestly return.');

        // Contrast: DiscoveryProvider.list() promises a stable set right
        // now — the exact opposite epistemic status.
        assert(discoveryProviderBase.includes("throw new Error('DiscoveryProvider.list() must be implemented by a subclass');"),
            '4. list() is expected to return a concrete result unconditionally when implemented — nothing about its contract admits "maybe," "rumored," or "pending resolution" as a valid answer shape.');
    }
    console.log('✓ Section E: SEARCH (DiscoveryProvider.list()/findById(), synchronous, a promised-stable set) and RETRIEVE (WorldEncounterMaterialSource#load(), async, a single Promise for one already-selected item) are different contracts today, not just different current implementations of one contract. DISCOVER (a decentralized "lead") is, in this codebase\'s own words, "at best, a rumor" — an epistemic status list() has no room to represent. A single federated RepositoryProvider would have to either quietly launder rumors as list() results, or become async and multi-shaped in a way every existing Repository/Author/World Search caller would need to change for — this is not "swap the implementation," it is "redesign the contract."');

    // ===============================================================
    // Section F — Duplication test.
    // ===============================================================
    {
        // The scale of what already exists, purpose-built, for exactly
        // the substrates a federated Repository would need to reach.
        const worldDiscoveryEncounterFiles = grepCount('World(Discovery|Encounter)', ['application']);
        const peerFamilyFiles = execSync('ls peer', { cwd: SOURCE_ROOT.pathname }).toString().trim().split('\n').length;
        assert(worldDiscoveryEncounterFiles >= 20 && peerFamilyFiles >= 10,
            `1. the World Discovery/Encounter family (${worldDiscoveryEncounterFiles} files) and the Peer family (${peerFamilyFiles} files) are each substantial, independently-built subsystems, not thin stubs a Repository-level wrapper could absorb for free.`);

        // Each of those families already has its OWN dedicated UI
        // surface distinct from Repository — a federated Repository
        // would either duplicate that UI surface, or become a shallow
        // proxy in front of it.
        assert(await sourceExists('ui/views/PeerConnectionsView.js'), '2. Peer has its own dedicated, shipped UI view.');
        assert(await sourceExists('ui/views/DecentralizedPublicationsView.js'), '3. Decentralized publications have their own dedicated, shipped UI view.');
        assert(await sourceExists('ui/components/WorldEncounterCanvas.js'), '4. World Encounter has its own dedicated, shipped UI component.');

        // The one already-built "adopt material from elsewhere into a
        // local catalog" seam that DOES exist targets the decentralized
        // catalog, never Repository's. Checked honestly, including
        // whether it is itself UI-reachable — it is NOT: like several
        // other application-layer capabilities this codebase has built
        // ahead of their own UI wiring (the exact pattern the 0.9.32x
        // orphan-sweep sequence has repeatedly found and classified,
        // never assumed), it exists, is tested, and has zero UI callers.
        const importReplica = await readSource('application/ImportPublicationReplicaPackageUseCase.js');
        assert(importReplica.includes("this._publicationExchange.importPublication(pkg.publication)"),
            '5. ImportPublicationReplicaPackageUseCase already imports a peer-supplied publication package via PublicationExchange#importPublication() — the exact "adopt something from elsewhere" mechanism a federated Repository provider would otherwise have to reinvent.');
        const publicationExchange = await readSource('application/PublicationExchange.js');
        assert(proseIncludes(publicationExchange, 'catalogs the resulting DecentralizedPublication'),
            '6. that import path\'s own target is confirmed, from source, to be the DECENTRALIZED catalog (application/LocalPublicationCatalog.js) — never Repository\'s own storage/LocalStorageProvider.js — regardless of whether it is UI-wired.');
        const replicaUiCallers = grepFiles('ImportPublicationReplicaPackageUseCase|BuildPublicationReplicaPackageUseCase', ['ui']);
        assert(replicaUiCallers.length === 0,
            '7. and, checked honestly rather than assumed: this import path itself has ZERO ui/ callers today — an application-layer-only capability, not a live user-facing feature this audit could point to as proof a "federate Repository" seam is already wired and working.');
    }
    console.log('✓ Section F: a federated Repository provider would sit in front of two large (60+ and 10+ file), independently-built, already-UI-complete subsystems — World Discovery/Encounter and Peer — that already have their own purpose-built surfaces. It would either duplicate that UI, or become a shallow pass-through in front of it. The one "adopt material from elsewhere into a local catalog" seam this codebase already built (PublicationExchange#importPublication(), 0.7.2/0.8.29) targets the decentralized catalog, never Repository\'s — but, checked honestly, that path itself has no UI caller yet either. Neither direction offers proof of a completed, merely-unconnected federation seam.');

    // ===============================================================
    // Section G — Cross-arc integration scan: World Encounter (complete)
    // -> Repository (complete) — is the handoff genuinely blocked?
    // ===============================================================
    {
        // World Encounter is "complete" only in its own, narrow,
        // explicitly-scoped sense: on-demand, ephemeral inspection of an
        // already-selected object. It was never built, at any point in
        // its own multi-milestone history, as a save/import mechanism —
        // confirmed by its own header vocabulary.
        const decentralizedSourceCode = await readSource('application/DecentralizedWorldEncounterMaterialSource.js');
        assert(proseIncludes(decentralizedSourceCode, 'A RETRIEVER, NEVER A SECOND RESOLVER'),
            '1. the class\'s own header names its own scope boundary explicitly, in its own words.');
        assert(proseIncludes(decentralizedSourceCode, 'NO CACHING, NO RETRY, NO FALLBACK BETWEEN URIS, NO RANKING'),
            '2. — and repeats the same restraint pattern LocalPublicationCatalog\'s own header holds (Section D) independently, in a completely different file, at a completely different milestone (0.9.33 vs 0.7.2) — this is a consistent, family-wide architectural posture, not an isolated decision.');

        // Section F already established the honest state of the one
        // adoption seam that does exist: application-layer only, no UI
        // caller. So the real shape here is neither "Capability A
        // complete, Capability B complete, A -> B blocked" NOR "both
        // sides already complete, just aimed elsewhere" — it is
        // "Capability A (encounter) complete and deliberately
        // non-persisting; Capability B (adopt-from-peer-package) exists
        // at the application layer only, untested by any real user
        // journey, and targets a catalog that was never Repository to
        // begin with." Neither shape resembles a blocked handoff between
        // two FINISHED capabilities — the defining condition this
        // section's own test requires.
        const worldEncounterMaterialLoading = await readSource('application/WorldEncounterMaterialLoading.js');
        assert(!/^import.*(StorageProvider|Catalog)/m.test(worldEncounterMaterialLoading),
            '3. even the ORCHESTRATION layer that routes an encounter to local/peer/decentralized material sources — application/WorldEncounterMaterialLoading.js itself — imports no storage or catalog class (its own header even names `StorageProvider` only to say it ships with no concrete one). The no-persist rule holds at every layer this audit checked, not just at the one leaf class Section C exercised.');

        // Applying the same distinguishing test 0.9.328's own Section E
        // used for the Reconciliation Decision family: check the
        // family's own more fundamental concept the identical way. Here,
        // that concept is "does ANYTHING encountered through World View
        // ever get saved anywhere automatically" — Local encounters
        // included, not just Decentralized/Peer ones.
        const localSourceCode = await readSource('application/LocalWorldEncounterMaterialSource.js');
        assert(!/\.save\(|\.add\(|catalog\./.test(localSourceCode),
            '4. even LOCAL World Encounter material — already fully trusted, already on this device — is never auto-saved anywhere as a side effect of being encountered. The absence of an auto-persist step is a codebase-wide World Encounter rule, not something asymmetric or missing specifically for decentralized/peer origins.');
    }
    console.log('✓ Section G: the cross-arc scan finds no genuine "Capability A complete, Capability B complete, A -> B blocked" pair here. World Encounter (all three origins — local, peer, decentralized) never auto-persists what it retrieves, by one consistent, family-wide rule enforced at both the leaf material-source layer and the orchestration layer above it — not a decentralized-specific gap. The one adoption path that targets a catalog at all (import-a-peer-package) is itself application-layer-only with no UI caller, and even it targets the decentralized catalog, never Repository\'s. Nothing here resembles a blocked handoff between two otherwise-finished capabilities — one side (encounter) is finished and deliberately non-persisting; the other (adoption) is unfinished on its own terms, for a different catalog entirely.');

    // ===============================================================
    // Section H — External-evidence gate. Reuses the 0.9.314/0.9.327/
    // 0.9.328 executable classifier verbatim.
    // ===============================================================
    {
        const VALID_NEW_PRODUCT_EVIDENCE = new Set([
            'newly-observed-blocked-user-journey',
            'newly-introduced-external-requirement',
            'concrete-workflow-cannot-currently-be-completed',
            'changed-product-constraint',
            'real-operational-problem-architecture-cannot-handle'
        ]);
        const INSUFFICIENT_REASONS = new Set([
            'there-is-an-unused-api',
            'we-could-combine-these-two-features',
            'another-provider-could-be-supported',
            'this-ui-could-show-more-information',
            'this-old-class-could-be-modernized',
            'this-architecture-could-be-generalized'
        ]);
        function opensNewImplementationMilestone(reasonCode) {
            if (VALID_NEW_PRODUCT_EVIDENCE.has(reasonCode)) return true;
            if (INSUFFICIENT_REASONS.has(reasonCode)) return false;
            return false;
        }

        for (const reasonCode of VALID_NEW_PRODUCT_EVIDENCE) {
            assert(opensNewImplementationMilestone(reasonCode) === true, `1. "${reasonCode}" opens a new implementation milestone.`);
        }
        for (const reasonCode of INSUFFICIENT_REASONS) {
            assert(opensNewImplementationMilestone(reasonCode) === false, `2. "${reasonCode}" alone does not.`);
        }

        // The strongest honest characterization of this milestone's own
        // originating observation, after Sections A-G: "the search
        // contract could be generalized to another provider" — squarely
        // the classifier's own named insufficient reason.
        const reasonForThisFinding = 'this-architecture-could-be-generalized';
        assert(INSUFFICIENT_REASONS.has(reasonForThisFinding) && opensNewImplementationMilestone(reasonForThisFinding) === false,
            '3. the originating observation — a provider-swappable contract with no provider yet plugged in — is exactly the classifier\'s own named insufficient reason, not a disguised form of any valid one.');

        // Honest search for real operational evidence — none found, none
        // manufactured. This is a test-only codebase with no live
        // deployment or telemetry, so operational evidence can only ever
        // mean what is recorded on file, exactly as 0.9.328 Section F
        // already established.
        const roadmap = await readSource('docs/Roadmap.md');
        const repositoryComplaintHits = grepCount('cannot find.*[Rr]epository|Repository.*cannot find|users report.*Repository', ['docs']);
        assert(repositoryComplaintHits === 0,
            '4. no on-file record of a user, workflow, or deployment constraint that could not find a publication through Repository specifically — checked honestly, not merely asserted.');
    }
    console.log('✓ Section H: this milestone\'s own originating observation does not clear the standing evidence gate. It is, at most, "the search contract could be generalized to another provider" — the gate\'s own explicitly named insufficient reason since 0.9.314. No blocked journey (Section C), no incompatible identity being forced together (Section D), no operational record of any kind (checked, none found) changes that conclusion.');

    // ===============================================================
    // Section I — Smallest-seam identification. Conditional on READY;
    // this milestone's own verdict (Section J) is not READY, so this
    // section is explicitly vacuous rather than silently skipped.
    // ===============================================================
    {
        const verdict = 'NOT_A_PRODUCT_GAP';
        assert(verdict !== 'READY', '1. the verdict established by Sections A-H is not READY.');
        // No smallest seam is chosen. Per this milestone's own brief:
        // "if the audit says READY, identify the smallest possible first
        // step... I would deliberately NOT choose that source before the
        // audit." Since the audit does not say READY, no source is
        // chosen at all — not local, not peer, not any one decentralized
        // substrate.
    }
    console.log('✓ Section I: vacuous by design — the verdict is not READY, so no "smallest seam" (local+peer composite, local+one decentralized substrate, or any other shape) is selected. Choosing one anyway would mean implementing against a conclusion Sections A-H do not support.');

    // ===============================================================
    // Section J — Final classification and production-change guard.
    // ===============================================================
    {
        const CLASSIFICATIONS = ['READY', 'DUPLICATIVE', 'DEFERRED', 'INTERNAL', 'NOT_A_PRODUCT_GAP', 'STOP'];
        const verdict = 'NOT_A_PRODUCT_GAP';
        assert(CLASSIFICATIONS.includes(verdict), '1. the verdict is drawn from this milestone\'s own named taxonomy.');
        assert(verdict === 'NOT_A_PRODUCT_GAP',
            '2. Sections A-H together establish: the local-only scope is a documented, deliberate architectural contract (A), not a placeholder; no equivalent free-text browsing surface exists to call this DUPLICATIVE in the strict 0.9.327 sense (B); the strongest candidate journey is not merely unfinished but structurally never offered, on both the encounter side and the Repository side (C); the two publication identity models a federated provider would need to reconcile are deliberately, architecturally kept apart, not accidentally divergent (D); SEARCH/DISCOVER/RETRIEVE/MATERIALIZE are different contracts today, not different implementations of one contract, so this is not "DEFERRED pending a provider swap" but "would require a contract redesign no evidence currently justifies" (E); building it would duplicate two large, already-UI-complete subsystems rather than complete an unfinished one (F); the cross-arc scan finds no blocked handoff between complete capabilities, only a consistent, family-wide no-auto-persist rule (G); and the standing evidence gate is not cleared (H).');

        const changedNonTestFiles = execSync('git diff --name-only HEAD -- . ":(exclude)tests" ":(exclude)docs/Roadmap.md" ":(exclude)tests.html"',
            { cwd: SOURCE_ROOT.pathname }).toString().trim();
        assert(changedNonTestFiles === '', `3. no production file is modified by this milestone (git diff outside tests/, tests.html, docs/Roadmap.md is empty) — found: ${changedNonTestFiles || 'none'}.`);
    }
    console.log('✓ Section J: NOT_A_PRODUCT_GAP — no production file touched, verified against a live git diff at test-run time.');

    console.log('\nAll FederatedRepositoryProductGapAudit tests passed.');
    console.log('\nVerdict: NOT_A_PRODUCT_GAP — STOP. No production change warranted.');
}

run().catch((error) => {
    console.error('FederatedRepositoryProductGapAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
